# Spec 1 — Estudo do código (v9.7.1)

Registro da leitura de `src/`, `tools/` e `script.js` na branch `claude/specs-autonomas`, em 2026-11-06, com a primeira medição por passada no Poco F7.

## Resumo

- **Feito:** leitura do motor, da captura, do shader espacial e da rede neural; correção do `tools/build.py` para Windows; sonda de WebGPU e microbenchmark por passada no Poco.
- **Principais achados:** a adaptação de desempenho não age no Poco com o filtro sempre ligado (achado 1); WebGPU funciona no WebView com `timestamp-query` e `shader-f16`; o caminho padrão a 1280p custa cerca de 5,5 ms, sem contar o upload do quadro.
- **Não feito:** coluna do Vostro, ganho visual, upload do quadro, MSAA, temporal, sessão longa. Specs 2, 3 e 4 não começaram.
- **Próximo passo:** repetir a medição com o Poco carregado e com vídeo real, por mais tempo.

## Medição no Poco F7 (preliminar)

Ferramentas em `tools/device/`. O benchmark roda no WebView do app, com os shaders do motor, em 1920×1080 e 2276×1280. São 40 repetições por amostra e 5 rodadas intercaladas, alternando duas texturas de destino, com `readPixels` de 1 px só no fim de cada amostra. Sem erro de GL. Durante o teste: bateria 8–9%, 37,1 °C, estado térmico 0, economia de energia desligada.

| Filtro ou passada | Mediana (ms) | Faixa (ms) | Acréscimo ao `spatial` vazio (ms) |
| --- | --- | --- | --- |
| `spatial` vazio | 0,47 | 0,46–0,63 | — |
| Compressão 50% | 0,90 | 0,80–1,04 | +0,43 |
| Degradês 30% | 1,41 | 1,21–1,49 | +0,94 |
| Cor nas bordas 75% | 0,73 | 0,61–0,81 | +0,26 |
| Detalhe 20% | 1,23 | 1,15–1,27 | +0,76 |
| Antialiasing 50% | 0,81 | 0,79–0,90 | +0,33 |
| `spatial` padrão (os quatro primeiros) | 2,54 | 2,29–2,60 | — |
| FSR 1 EASU para 1280p | 1,61 | 1,57–1,95 | passada própria |
| Nitidez USM em 1080p | 0,75 | 0,64–0,86 | passada própria |
| Nitidez USM em 1280p | 0,93 | 0,85–1,03 | passada própria |
| `present` (Fluidez) em 1280p | 0,39 | 0,31–0,43 | passada própria |
| Reconstrução neural | 2,21 | 2,10–2,31 | passadas próprias |

Soma do caminho padrão, sem upload:

| Saída | Soma (ms) | Proposta da seção 10.4 |
| --- | --- | --- |
| Automática, 1280p, com Fluidez | 5,47 | acima dos 4 ms a 60 FPS, dentro dos 8 ms a 30 FPS |
| Nativa, 1080p, com Fluidez | cerca de 3,7 | dentro dos 4 ms a 60 FPS |

O valor de 1080p usa `copy1080` (0,39 ms) como estimativa do `present`.

Cuidados ao ler estes números:

- **Tendem a ser otimistas:** a GPU roda em rajada, sem decodificador nem composição disputando, e provavelmente em clock mais alto que numa partida. O clock não pôde ser lido (`gpuclk` sem permissão).
- **Faltam custos:** upload do quadro, MSAA do canvas e temporal não entraram.
- **Imagem sintética:** gradiente, ruído e linhas. Os desvios de Cor nas bordas e os pesos dos filtros dependem do conteúdo; falta repetir com vídeo real.
- **Bateria em 8–9%:** repetir com o aparelho carregado.

## WebGPU no aparelho

Sonda em `https://www.xbox.com`, dentro do app, com WebView 156:

| Item | Resultado |
| --- | --- |
| `navigator.gpu` e adaptador | sim, `qualcomm` / `adreno-8xx`, não é fallback |
| `requestDevice` | funcionou |
| `timestamp-query` | sim, device criado com o recurso |
| `shader-f16` | sim, device criado com o recurso |
| `subgroups` | sim, no adaptador |
| `importExternalTexture` | função presente, importação de quadro ainda não testada |
| Memória de workgroup | 32 KB, 1024 invocações |
| Formato preferido do canvas | `rgba8unorm` |
| `MediaStreamTrackProcessor`, `OffscreenCanvas` | presentes |

No WebGL2 da mesma página: `Adreno (TM) 825`, sem `EXT_disjoint_timer_query_webgl2`; `highp` com 23 bits e `mediump` com 10, ou seja, meia precisão real.

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

### 4. Detalhe tem mais leituras, mas Degradês custa mais

Leituras de textura por pixel, contadas em `src/shaders/spatial.glsl` com os padrões:

| Trecho | Leituras |
| --- | --- |
| Centro e cruz | 5 |
| Compressão | 4 |
| Degradês | até 4 |
| Cor nas bordas | 2, só perto de bordas |
| Detalhe | 16 |
| **Total** | **até 31** |

A medição contrariou a contagem: Degradês faz 4 leituras e custa +0,94 ms, enquanto Detalhe faz 16 e custa +0,76 ms. A causa ainda não foi investigada; as amostras distantes de Degradês, que aproveitam menos o cache, são a hipótese a testar.

### 5. Todos os shaders usam `highp`

Inclusive o CAS original do Better xCloud, que era `mediump` e o `tools/build.py` converte (linha 10). A hipótese da seção 10.2 (meia precisão) continua aberta e precisa de teste de regressão de pixel.

### 6. Reconstrução neural (responde à primeira tarefa da Spec 1)

- **Implementação:** shader WebGL2 próprio, sem ONNX nem TensorFlow.js. `tools/nn_glsl.py` embute os pesos de `src/nn/restore.json` como constantes.
- **Rede:** `conv3×3(1→8) → ReLU → conv1×1(8→8) → ReLU → conv3×3(8→1)`, só na luma, somada à imagem. Cerca de 210 multiplicações por pixel.
- **Passadas:** duas, com duas texturas RGBA16F intermediárias, à frente do `spatial`.
- **Treino:** JAX em CPU, pares de luma H.264 a 8–25 Mb/s contra render limpo (`tools/nn/`, `docs/analysis-v9.1.md`).
- **Custo:** 2,21 ms na Adreno 825 em 1080p (medição preliminar acima), cerca de 40% sobre o caminho padrão. A estimativa anterior era +31%, em GPU emulada.
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
| Bateria | caiu de 9% para 8% mesmo no USB |
| Temperatura da bateria | 33,5 °C em repouso, 37,1 °C com o app aberto |

## Lacunas novas

- Tabela de custos da seção 8: coluna do Poco preliminar; faltam Vostro, ganho medido e temporal.
- Upload do quadro não medido: é o custo que falta para a soma real do caminho padrão.
- `importExternalTexture` com quadro de vídeo real não testado.
- Efeito real do MSAA na Adreno não medido; exige canvas na tela, porque a resolução só ocorre na composição.
- Causa das duas falhas de navegador não confirmada.
- `src/shaders/easu.glsl`, `motion.glsl`, `temporal.glsl` e `rcas.glsl` tiveram só contagem de leituras, sem leitura completa.
