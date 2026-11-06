# Spec 1 — Estudo do código (v9.7.1)

Registro da leitura de `src/`, `tools/` e `script.js` na branch `claude/specs-autonomas`, em 2026-11-06. Nenhum custo de GPU foi medido ainda: os números de custo abaixo são contagens feitas no código, não tempos.

## Resumo

- **Feito:** leitura do motor, da captura, do shader espacial e da rede neural; correção do `tools/build.py` para Windows.
- **Principal achado:** no Poco F7 a adaptação de desempenho não age com o filtro sempre ligado (achado 1).
- **Não feito:** tabela de custos, detecção de WebGPU e tudo que depende do aparelho desbloqueado. Specs 2, 3 e 4 não começaram.
- **Próximo passo:** desbloquear e carregar o Poco, rodar a sonda de WebGPU e medir cada filtro no player de testes.

## Achados

### 1. Sem timer de GPU, a adaptação não dispara (confirmado)

O WebView não tem `EXT_disjoint_timer_query_webgl2`, então `budget.sample` nunca recebe dados e o orçamento de 3, 6 ou 10 ms não tem efeito. O fence é só para exibição (`src/restoration-engine.js:349`). Sobra `budget.cadence`, que precisa de `bxReferenceFps`, e esse valor só é preenchido fora do modo `filtered` (`src/image-filter.js:257`).

Quem joga direto no modo filtrado fica com a referência nula e nenhuma redução acontece. Teste em Node com `createBudget`:

| Referência | Chamadas a 20 FPS | Reduções |
| --- | --- | --- |
| nula | 100 | 0 |
| 30 | 3 | 1 |

Consequência: a ordem de corte da seção 3 do documento de specs não protege o Poco hoje. Se houver referência, ela ainda pode enganar: é um FPS medido em outro momento, e o servidor alterna entre ~60 nos menus e 30 na partida.

### 2. MSAA ligado no canvas de produção (confirmado no código, custo não medido)

`WebGL2Player.setupShaders` pede `antialias: true` e `patchCanvasContext` só desliga isso em contextos sem `isBx` (`script.js:263`, `script.js:274`). Todo o desenho é um triângulo de tela cheia, então o MSAA não melhora nada.

O player de testes usa `antialias:false` (`player/player.js:3`). **Medições no player podem subestimar o custo real.** Antes de medir, os dois precisam ficar iguais.

### 3. O caminho padrão no Poco tem mais passadas do que o documento indica

O painel é 1280×2772. Com saída Automática, o vídeo ocupa 1280 px de altura e `resolveOutput` escolhe 1280p, ou seja, cerca de 2276×1280 (2,9 MP contra 2,1 MP da fonte).

| Etapa | Resolução | Formato |
| --- | --- | --- |
| Upload do quadro (`texImage2D`, com flip Y) | 1920×1080 | RGBA8 |
| `spatial` | 1920×1080 | RGBA8 |
| `easu` | 2276×1280 | RGBA8 |
| `casFiltered` (nitidez + acabamento) | 2276×1280 | RGBA8 |
| `copy` em `present` (só com Fluidez) | 2276×1280 | canvas |

Com Fluidez são quatro passadas de tela cheia mais o upload, e não duas. A Fluidez mantém cinco texturas de saída, cerca de 58 MB em RGBA8 nesse tamanho.

### 4. O filtro Detalhe domina as leituras do `spatial`

Leituras de textura por pixel, contadas em `src/shaders/spatial.glsl` com os padrões:

| Trecho | Leituras |
| --- | --- |
| Centro e cruz | 5 |
| Compressão | 4 |
| Degradês | até 4 |
| Cor nas bordas | 2, só perto de bordas |
| Detalhe | 16 |
| **Total** | **até 31** |

Leituras não equivalem a tempo; é só o primeiro candidato a medir.

### 5. Todos os shaders usam `highp`

Inclusive o CAS original do Better xCloud, que era `mediump` e o `tools/build.py` converte (linha 10). A hipótese da seção 10.2 (meia precisão) continua aberta e precisa de teste de regressão de pixel.

### 6. Reconstrução neural (responde à primeira tarefa da Spec 1)

- **Implementação:** shader WebGL2 próprio, sem ONNX nem TensorFlow.js. `tools/nn_glsl.py` embute os pesos de `src/nn/restore.json` como constantes.
- **Rede:** `conv3×3(1→8) → ReLU → conv1×1(8→8) → ReLU → conv3×3(8→1)`, só na luma, somada à imagem. Cerca de 210 multiplicações por pixel.
- **Passadas:** duas, com duas texturas RGBA16F intermediárias, à frente do `spatial`.
- **Treino:** JAX em CPU, pares de luma H.264 a 8–25 Mb/s contra render limpo (`tools/nn/`, `docs/analysis-v9.1.md`).
- **Custo:** +31% relativo, em GPU emulada. Nunca medido na Adreno.
- **Ganho registrado:** SSIM 0,930 → 0,934 em 1080p e 0,917 → 0,917 no perfil Poco 1280p, com mais halo.

### 7. Custos pequenos de CPU por quadro

`configure(this.input)` refaz quatro `texParameteri` a cada quadro e `getUniformLocation` é chamado sem cache na nitidez (`src/restoration-engine.js:387`, `:427`). Não há `readPixels` nem `finish` no caminho do quadro; `getError` só roda nos três primeiros quadros da captura direta.

## Correção feita

`tools/build.py` falhava no Windows (cp1252), gravava CRLF e usava contrabarra no fingerprint, o que reprovaria a checagem de arquivos gerados do CI. Agora lê e grava UTF-8 com LF e usa caminhos POSIX. O fingerprint recalculado com o `build.py` antigo deu exatamente o valor do repositório (`3e722089…`), e a saída mudou só no hash.

Em clones no Windows, usar `core.autocrlf=false`.

## Testes (Windows, Chrome 157, sem o Chromium fixado no CI)

| Suíte | Resultado |
| --- | --- |
| Node | 47 de 47 |
| `regressions-v7` | passou, 43 verificações |
| `motion-quality` | passou, 11 verificações |
| `filter-harness` | **falhou** em `Cut rejects old dark history` |
| `capture-harness` | **falhou** em `Per-segment video skips are recorded (0,0)` |

Cada harness para no primeiro erro, então as verificações restantes dessas duas suítes não rodaram. A única mudança na saída gerada é o hash, o que aponta para o ambiente, mas **a causa não foi provada**: falta repetir com o Chromium do CI (Playwright 1.60).

## Estado do aparelho

Poco F7 (`25053PC47G`, SM8735), Android 16, app 9.7.1 instalado em 2026-10-18, depuração do WebView ligada no app.

| Leitura | Valor |
| --- | --- |
| WebView | 156.0.8078.47 (o documento de specs diz Chrome 155) |
| Bateria | 9%, carregando por USB |
| Temperatura da bateria | 33,5–34,9 °C |
| Tela | bloqueada; `wm dismiss-keyguard` não liberou |

## Lacunas novas

- Sonda de WebGPU pendente: precisa do aparelho desbloqueado.
- Tabela de custos da seção 8 continua vazia.
- Efeito real do MSAA na Adreno não medido.
- Causa das duas falhas de navegador não confirmada.
- `src/shaders/easu.glsl`, `motion.glsl`, `temporal.glsl` e `rcas.glsl` tiveram só contagem de leituras, sem leitura completa.
