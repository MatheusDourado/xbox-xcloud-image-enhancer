# Spec 1 — Estudo do código (v9.7.1)

Registro da Spec 1 na branch `claude/specs-autonomas`, em 2026-11-06: leitura de `src/`, `tools/` e `script.js`, medição por passada no Poco F7 e no Vostro 3400 e detecção de WebGPU nos dois.

## Resumo

**Estado:** Spec 1 encerrada com lacunas. A coluna de custos está preenchida para os filtros; upload real, MSAA, sessão longa e ganho por filtro seguem abertos e são entrada para a Spec 2.

**Feito**

- Leitura do motor, da captura, do shader espacial e da rede neural.
- `tools/build.py` portável para Windows.
- Correção da adaptação sem cronômetro de GPU, adiantada da Spec 3 a pedido do Matheus (achado 1). APK de teste instalado por cima no Poco, com o motor novo carregando; não validada em partida real.
- Ferramentas em `tools/device/` e dados brutos em `docs/medicoes/spec1/`.

**Números principais (imagem sintética, em rajada, sem upload nem MSAA)**

| Caminho padrão | Poco F7 | Vostro 3400 |
| --- | --- | --- |
| Saída 1280p com Fluidez | 4,9–5,5 ms | não se aplica à TV 1080p |
| Saída 1080p com Fluidez | 3,1–3,7 ms | 3,4–3,5 ms |
| Saída 1080p sem Fluidez | 2,8–3,3 ms | 2,7–2,8 ms |

**Achados que mais importam para a Spec 2**

- O upload do quadro é o maior desconhecido: o `render()` completo com origem em canvas 2D custou cerca de 9 ms a mais que as passadas no Poco, contra 0,6 ms no Vostro. Canvas 2D pode não representar um quadro de vídeo, então isso ainda não é o custo real.
- Adreno e Iris Xe têm perfis diferentes: no Poco os filtros pesam; no Vostro quase tudo é o custo fixo da passada, o que sugere limite de memória (inferência, sem contador de banda).
- Temporal: +11,9 ms no Poco e +3,6 ms no Vostro. O neural custa o dobro no Vostro em relação ao Poco.
- WebGPU funciona nos dois aparelhos, com `timestamp-query` e `shader-f16`.

**Próximo passo:** Spec 2, em sessão nova, com o modelo mais forte e esforço alto. Primeira medição recomendada: upload de quadro de vídeo real.

## Tabela de custos (seção 8)

Faixa das medianas de três rodadas, em 1080p salvo indicação. Filtros dentro do `spatial` são o acréscimo sobre a passada vazia.

| Filtro | Custo Poco F7 (ms) | Custo Vostro (ms) | Ganho medido | Padrão |
| --- | --- | --- | --- | --- |
| Compressão | +0,37 a +0,46 | +0,20 a +0,23 | não isolado | ligado 50% |
| Degradês | +0,84 a +0,94 | +0,33 a +0,35 | não isolado | ligado 30% |
| Cor nas bordas | +0,03 a +0,26 | +0,02 a +0,09 | não isolado | ligado 75% |
| Detalhe | +0,44 a +0,76 | −0,01 a +0,06 | não isolado | ligado 20% |
| Antialiasing | +0,21 a +0,34 | +0,03 a +0,08 | não isolado | desligado |
| Temporal | +11,9 (1 rodada) | +3,6 (1 rodada) | cintilação 4,49 → 4,37 (registro v9.1) | desligado |
| FSR 1 EASU (para 1280p) | 1,48–1,61 | 1,96–2,01 | ver abaixo | automático |
| Nitidez final | 0,67–0,75; 0,85–0,93 em 1280p | 0,81–0,86; 1,21–1,28 em 1280p | ver abaixo | USM 3 |
| Reconstrução neural | 1,96–2,21 | 4,07–4,18 | SSIM 0,930 → 0,934 (registro v9.1) | desligado |

Passadas de apoio: `spatial` vazio 0,47–0,58 (Poco) e 1,12–1,18 (Vostro); `spatial` padrão 2,12–2,54 e 1,84–1,93; `present` em 1280p 0,35–0,39 e 1,05–1,14.

**Ganho:** nada foi medido nesta spec, porque a bancada `tools/eval` precisa de `ffmpeg`, que não existe nesta máquina e o documento não autoriza baixar. Os valores acima vêm dos registros da v9 e da v9.1. `docs/analysis-v9.md` compara configurações, não filtros isolados: v9 padrão SSIM 0,930 contra 0,942 do stream sem filtro, com detalhe 0,97 contra 0,71; no perfil Poco, FSR para 1280p com USM 3 tem detalhe 0,67 contra 0,53 do 1080p esticado.

## Método e cuidados

Ferramentas em `tools/device/`. O benchmark roda com os shaders do motor, em 1920×1080 e 2276×1280, com 40 repetições por amostra e 5 rodadas intercaladas, alternando duas texturas de destino, com `readPixels` de 1 px só no fim de cada amostra. Sem erro de GL nas seis rodadas.

| Máquina | Ambiente | Condições |
| --- | --- | --- |
| Poco F7 | WebView 156 do app, em primeiro plano | bateria 8–25%, 35–37 °C, estado térmico 0 |
| Vostro 3400 | Chrome 157 sem tela, D3D11 | na tomada, 94% |

- **Tendem a ser otimistas:** a GPU roda em rajada, sem decodificador nem composição disputando, e provavelmente em clock mais alto que numa partida. O clock do Poco não pôde ser lido (`gpuclk` sem permissão).
- **Imagem sintética:** gradiente, ruído e linhas. Cor nas bordas e Detalhe dependem do conteúdo, e por isso variam mais entre rodadas.
- **Soma em 1080p:** usa `copy1080` como estimativa do `present`.
- **App visível:** o WebView pausa timers em segundo plano, e o benchmark trava se o app não estiver na frente.

## WebGPU

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

No Vostro, em Chrome 157: adaptador `intel` / `gen-12lp`, device criado com `timestamp-query` e `shader-f16`, `subgroups` no adaptador, 32 KB de workgroup e `importExternalTexture` presente. O WebGL2 ali tem cronômetro de GPU.

No WebGL2 do Poco, na mesma página do app: `Adreno (TM) 825`, sem `EXT_disjoint_timer_query_webgl2`; `highp` com 23 bits e `mediump` com 10, ou seja, meia precisão real.

## Achados

### 1. Sem timer de GPU, a adaptação não disparava (confirmado e corrigido)

O WebView não tem `EXT_disjoint_timer_query_webgl2`, então `budget.sample` nunca recebe dados e o orçamento de 3, 6 ou 10 ms não tem efeito. O fence é só para exibição (`src/restoration-engine.js:349`). Sobra `budget.cadence`, que precisa de `bxReferenceFps`, e esse valor só é preenchido fora do modo `filtered` (`src/image-filter.js:257`).

Quem joga direto no modo filtrado fica com a referência nula e nenhuma redução acontece. Teste em Node com `createBudget`:

| Referência | Chamadas a 20 FPS | Reduções |
| --- | --- | --- |
| nula | 100 | 0 |
| 30 | 3 | 1 |

Era o comportamento documentado no README, não um erro de código, mas deixava o Poco sem proteção. Além disso, a referência antiga era um FPS medido em outro momento, e o servidor alterna entre ~60 nos menus e 30 na partida.

**Correção:** sem cronômetro de GPU, a referência agora é o FPS que o decodificador entrega no momento (`liveCadence`), limitado pelo FPS do Better xCloud. A comparação usa os quadros realmente exibidos, e a redução pede três janelas seguidas de 2 s:

| Caminho | Queda que reduz | Motivo |
| --- | --- | --- |
| Captura direta | mais de 5% | recebe todos os quadros decodificados |
| Elemento `<video>` | mais de 10% | pula quadros sem sobrecarga (~2% registrados na v9.6.1) |

Queda de rede não conta, porque a referência cai junto. Abaixo de 10 FPS é tratado como travamento e volta à referência antiga. A página recém-oculta é ignorada por 4 s.

**Falta validar:** o APK de teste com a correção está instalado no Poco e o motor novo carrega (`sourceSha256` 03befa86…, `liveCadence` responde), mas ainda não rodou numa partida real. A margem de 10% é uma escolha inicial, a calibrar com `videoSkipped` da próxima exportação. No teste de WebRTC em Chrome sem tela, o exibido ficou em 18–19 FPS contra 29–30 recebidos, sem saber se foi sobrecarga real ou falso positivo; a redução estava interceptada no teste. A redução é permanente até mudar um ajuste, então um falso positivo piora a imagem até lá.

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

A medição contrariou a contagem: no Poco, Degradês faz 4 leituras e custa +0,84 a +0,94 ms, enquanto Detalhe faz 16 e custa +0,44 a +0,76 ms. A causa ainda não foi investigada; as amostras distantes de Degradês, que aproveitam menos o cache, são a hipótese a testar.

### 5. Todos os shaders usam `highp`

Inclusive o CAS original do Better xCloud, que era `mediump` e o `tools/build.py` converte (linha 10). A hipótese da seção 10.2 (meia precisão) continua aberta e precisa de teste de regressão de pixel.

### 6. Reconstrução neural (responde à primeira tarefa da Spec 1)

- **Implementação:** shader WebGL2 próprio, sem ONNX nem TensorFlow.js. `tools/nn_glsl.py` embute os pesos de `src/nn/restore.json` como constantes.
- **Rede:** `conv3×3(1→8) → ReLU → conv1×1(8→8) → ReLU → conv3×3(8→1)`, só na luma, somada à imagem. Cerca de 210 multiplicações por pixel.
- **Passadas:** duas, com duas texturas RGBA16F intermediárias, à frente do `spatial`.
- **Treino:** JAX em CPU, pares de luma H.264 a 8–25 Mb/s contra render limpo (`tools/nn/`, `docs/analysis-v9.1.md`).
- **Custo:** 1,96–2,21 ms na Adreno 825 e 4,07–4,18 ms na Iris Xe, em 1080p; cerca de 40% sobre o caminho padrão do Poco. A estimativa anterior era +31%, em GPU emulada.
- **Ganho registrado:** SSIM 0,930 → 0,934 em 1080p e 0,917 → 0,917 no perfil Poco 1280p, com mais halo.

### 7. Custos pequenos de CPU por quadro

`configure(this.input)` refaz quatro `texParameteri` a cada quadro e `getUniformLocation` é chamado sem cache na nitidez (`src/restoration-engine.js:387`, `:427`). Não há `readPixels` nem `finish` no caminho do quadro; `getError` só roda nos três primeiros quadros da captura direta.

## Correção feita

`tools/build.py` falhava no Windows (cp1252), gravava CRLF e usava contrabarra no fingerprint, o que reprovaria a checagem de arquivos gerados do CI. Agora lê e grava UTF-8 com LF e usa caminhos POSIX. O fingerprint recalculado com o `build.py` antigo deu exatamente o valor do repositório (`3e722089…`), e a saída mudou só no hash.

Em clones no Windows, usar `core.autocrlf=false`.

## Testes

Node: 50 de 50. Suítes de navegador nos dois ambientes disponíveis:

| Suíte | Chromium 148 (Playwright 1.60, como no CI, SwiftShader) | Chrome 157 (Iris Xe real) |
| --- | --- | --- |
| `regressions-v7` | passou, 43 | passou, 43 |
| `motion-quality` | passou, 11 | passou, 11 |
| `filter-harness` | passou, 117 | **falhou** em `Cut rejects old dark history` |
| `capture-harness` | oscila, passou com 27 | oscila, passou com 26 |

**`filter-harness` no Chrome 157:** não é defeito do temporal. O Chrome local usa a GPU real e o CI usa SwiftShader. Na Iris Xe, 63 de 49.152 valores ficam em 253 num teste que exige 254; o corte funciona (207 contra 208 no `cut`). Com Degradês em zero, os 63 somem: é o dither, e o limite do teste foi calibrado para SwiftShader. Não alterei o teste. O Chromium 148 completo não abriu nesta máquina (`spawn UNKNOWN`), então os dois ambientes diferem em GPU e em versão; a checagem com Degradês zerado é o que isola a causa.

**`capture-harness`:** seis rodadas no Chromium 148, três na branch e três na `main` original. Aprovações: 1 de 3 e 2 de 3. As falhas têm a mesma mensagem nas duas (`No display or wait interval spans the hidden page`, cerca de 1,5 s) e outras checagens de tempo também falharam em rodadas avulsas. Aponta para teste instável, não para regressão; a amostra é pequena.

**Consequência:** as regressões de pixel do CI rodam em GPU emulada e não veem o comportamento da GPU real.

## Estado do aparelho

Poco F7 (`25053PC47G`, SM8735), Android 16, WebView 156.0.8078.47 (o documento de specs diz Chrome 155). App com APK de teste 9.7.1 instalado por cima em 2026-11-06, gerado a partir desta branch com o SDK local e com o mesmo certificado do APK versionado. `android/dist` não foi alterado. Ao fim da rodada: bateria 25%, 35,5 °C.

## Lacunas para as próximas specs

- **Upload do quadro de vídeo real:** não medido; é o custo que falta na soma do caminho padrão e pode ser o maior deles.
- **MSAA do canvas:** custo não medido; exige canvas na tela, porque a resolução só ocorre na composição.
- **Ganho visual por filtro:** não medido; depende de `ffmpeg`.
- **Vídeo real e sessão longa:** faltam medição com conteúdo real e os 20 minutos da seção 10.4.
- **Temporal:** uma rodada por máquina.
- **`importExternalTexture`:** não testado com quadro de vídeo.
- **Adaptação:** validar em partida real e calibrar a margem de 10% com `videoSkipped`.
- **Testes:** `capture-harness` instável e limite de `filter-harness` calibrado só para SwiftShader.
- **Leitura de shaders:** `easu.glsl`, `motion.glsl`, `temporal.glsl` e `rcas.glsl` tiveram só contagem de leituras.
- **xCloud real:** medições em partida ficam pendentes para uma sessão com o Matheus jogando.
