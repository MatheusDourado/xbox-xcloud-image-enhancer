# Spec 1 — Estudo do código (v9.7.1)

Base: branch `claude/new-session-092wbl` sobre `106d8b6` (merge da v9.7.1). Fonte: leitura direta de `src/`, `tools/build.py`, `tools/nn_glsl.py`, `tools/nn/` e dos shaders; medição relativa com `player/stage-cost.html`.

## 1. Mapa do código

| Arquivo | Papel |
| --- | --- |
| `script.js` | Better xCloud 6.7.12 original (redphx, MIT). Contém o `WebGL2Player` e o shader CAS/USM upstream. Não é editado à mão. |
| `tools/build.py` | Gera o userscript: extrai o shader CAS/USM do `script.js`, acrescenta o limitador de halo e o acabamento (`casFiltered`), gera os shaders da rede neural a partir de `src/nn/restore.json`, embute todos os `.glsl` em `BxShaders` e injeta `restoration-engine.js`, `frame-pacing.js`, `image-filter.js`, `panel.js` e `hud.js` antes de `class VideoPlayer`. O mesmo bundle vai para `output/restoration.bundle.js`, usado pelo player de testes. |
| `src/restoration-engine.js` | Motor WebGL2 (`Engine`): alvos de render, ordem das passadas, orçamento/adaptação (`createBudget`), medição exportável (`createDiagnostics`), Fluidez (`createPacer`), estimativa de compressão (QP e bits por pixel). |
| `src/image-filter.js` | Integração com o `WebGL2Player` do Better xCloud: substitui `updateFrame`, decide saída, captura direta (`MediaStreamTrackProcessor`), relógios RTP, publicação do status para painel/HUD. |
| `src/frame-pacing.js` | Ajustes do limitador de FPS do Better xCloud. |
| `src/panel.js`, `src/hud.js` | Painel de configurações e HUD. Sem custo de GPU (DOM). |
| `src/shaders/*.glsl` | `spatial`, `easu`, `rcas`, `finish`, `antialias`, `temporal`, `motion`, `cut`, `copy`. |
| `src/nn/restore.json` | Pesos da reconstrução neural (5 KB). |
| `player/` | Player de testes com vídeo local (mesmo motor). `stage-cost.html` é a bancada de custo por etapa criada nesta rodada. |
| `android/` | App WebView próprio que injeta o userscript. |
| `tests/*.cjs` | 47 testes Node do motor, do filtro e da reprodução. |
| `tools/*-harness.py` | Páginas Playwright de regressão de pixel, movimento, captura e UI. |

## 2. Caminho de um quadro

1. **Origem do quadro.** Sem Fluidez: `WebGL2Player.updateFrame` (chamado pelo Better xCloud via `requestVideoFrameCallback`) lê o `<video>`. Com Fluidez e captura direta: `MediaStreamTrackProcessor` entrega cada `VideoFrame` decodificado, que é tratado e fechado na hora.
2. **Upload.** `texImage2D(video ou VideoFrame)` com `UNPACK_FLIP_Y_WEBGL` para uma textura `RGBA8` a cada quadro. É uma cópia de quadro inteiro (no Android, conversão YUV→RGBA feita pelo Chrome). WebGL2 não tem como evitar; o WebGPU (`importExternalTexture`) evita.
3. **Reconstrução neural** (desligada): 2 passadas — `nnFeatures` grava duas texturas `RGBA16F` (MRT, 16 bytes/pixel) e `nnApply` lê 9 vizinhos de cada uma.
4. **Passada espacial** (`spatial.glsl`, resolução do vídeo): compressão, degradês, cor nas bordas, detalhe e, sem temporal, AA fundido. Grava `RGBA8` com dithering (Performance) ou `RGBA16F` (Qualidade).
5. **Temporal** (desligado): cópia para 1/4, `cut` (1×1), `motion` (1/16), `temporal` (resolução cheia, histórico `RGBA16F` em ping-pong) e AA separado.
6. **EASU** (`easu.glsl`) só se a saída for maior que o vídeo.
7. **Nitidez + acabamento** (`casFiltered` = USM/CAS upstream + limitador; ou `rcas`) direto no canvas — ou, com Fluidez, numa textura `pacedN` que depois é copiada para o canvas (`present`, passada `copy`).

### Passadas por configuração

| Cenário | Passadas de tela inteira | Observação |
| --- | --- | --- |
| Dell, Auto→nativa 1080p, Fluidez desligada | upload + espacial + nitidez = 3 | Caminho mais barato. |
| Poco, Auto→1280p (tela de 1280 px), Fluidez desligada | upload + espacial@1080 + EASU@1280 + nitidez@1280 = 4 | Duas passadas em 2276×1280 (1,4× os pixels de 1080p). |
| Poco, Auto→1280p, Fluidez + captura direta (sessão de 18/out) | upload + espacial + EASU + nitidez→`paced` + cópia `present` = 5 | A cópia do `present` é uma passada a mais em 1280p, só para o ritmo. |

Depois disso o navegador ainda compõe o canvas na tela (mais uma leitura e escrita da saída).

## 3. Custo por pixel (leituras de textura)

Contado no código dos shaders:

| Etapa | Leituras por pixel | Gravação |
| --- | --- | --- |
| Espacial — base comum (centro + cruz) | 5 | — |
| + Compressão | +4 (`±2` em x e y) | — |
| + Degradês | +4 (até 8 px; 2 com o corte automático) | — |
| + Cor nas bordas | +2 bilineares, só onde o gradiente de luma passa de 4/255 | — |
| + Detalhe | +16 (8 vizinhos + anel de 8 bilineares a ~3 px) | — |
| + AA fundido | +4 diagonais + 2 bilineares onde há borda inclinada | — |
| **Espacial padrão** | **31** | 4 B/px (RGBA8) ou 8 B/px (16F) |
| EASU | 12 (cada texel lido uma vez) | na resolução de saída |
| USM/CAS (`casFiltered`) | 9 | na resolução de saída |
| RCAS | 5 | na resolução de saída |
| Neural | 9 + (9 × 2 texturas 16F) | 16 B/px + 4 B/px |

Leituras repetidas: com Detalhe ligado, as 4 leituras da Compressão (`±2`) e as 4 diagonais do AA são as mesmas posições que o Detalhe já leu (`w[0..7]`), mas ficam em blocos condicionais diferentes e o compilador não reaproveita. Unificar a vizinhança economiza até 8 leituras por pixel sem mudar a imagem.

## 4. Custo relativo medido (SwiftShader)

`node tools/stage-cost.cjs 3000 1280` — Chromium headless com SwiftShader (GPU emulada em CPU). **Só vale como proporção entre etapas**: em CPU o gargalo é conta, não banda de memória, e o upload é uma cópia de CPU. Duas rodadas deram os mesmos números com variação de ~10%. Fonte sintética 1080p (degradês, ruído, blocos 8×8, linhas coloridas, texto).

| Configuração | Saída | ms/quadro | Δ sobre a base | Relativo ao padrão 1080p |
| --- | --- | --- | --- | --- |
| Original (upload + CAS upstream, nitidez 0) | 1080p | 42 | −13 | — |
| Base: tratamento com tudo em 0 | 1080p | 55 | 0 | — |
| + Compressão 50% | 1080p | 177 | +122 | 37% |
| + Degradês 30% | 1080p | 192 | +137 | 42% |
| + Cor nas bordas 75% | 1080p | 159 | +105 | 32% |
| + Detalhe 20% | 1080p | 272 | +218 | 66% |
| + AA 50% (fundido) | 1080p | 169 | +114 | 35% |
| Espacial padrão (4 filtros juntos) | 1080p | 343 | +288 | 88% |
| + Nitidez USM 3 | 1080p | 85 | +31 | 9% |
| + Nitidez CAS 3 | 1080p | 71 | +17 | 5% |
| + Nitidez RCAS 3 | 1080p | 59 | +4 | 1% |
| + Temporal 50% | 1080p | 180 | +125 | 38% |
| + Reconstrução neural 100% | 1080p | 203 | +148 | 45% |
| + FSR EASU | 1280p | 162 | +108 | 33% |
| **Padrão v9, nativa** | 1080p | 382 | +328 | 100% |
| **Padrão v9, Auto no Poco** | 1280p | 507 | +452 | **138%** |
| Padrão v9, modo Qualidade (16F) | 1080p | 439 | +384 | 117% |

Leitura:
- Cada filtro isolado custa cerca de 100 a mais por causa da passada espacial em si (o trecho comum + a gravação). Juntos, os quatro custam bem menos que a soma (288 contra 582): a fusão numa passada já funciona.
- O **Detalhe** é o filtro mais caro da passada espacial (16 leituras).
- O **Auto em 1280p no Poco** custa +33% sobre a saída nativa (EASU + nitidez em 1,4× pixels). Na análise v9 ele deu +19% a +27% de detalhe com SSIM igual: ganho real, custo alto.
- Entre as nitidezes, **USM** (padrão) é a mais cara; RCAS quase não custa.
- **Modo Qualidade (16F)** custa +17% mesmo em CPU; na Adreno, onde a banda pesa mais, tende a ser pior.

Os números reais da Adreno 825 e da Iris Xe saem da mesma página aberta no aparelho (ver o log de execução). A tabela da seção 8 das specs continua com as colunas de dispositivo vazias até essa medição.

## 5. Reconstrução neural (v9.1) — como foi feita

Era a principal incógnita das specs. Resposta:
- **Não usa ONNX, TensorFlow.js nem biblioteca.** É uma CNN residual minúscula só na luma, com os pesos embutidos como constantes num shader WebGL2 gerado por `tools/nn_glsl.py` no build.
- **Arquitetura:** `conv3×3 (1→8) → ReLU → conv1×1 (8→8) → ReLU → conv3×3 (8→1)`, somada à luma; a correção de luma é aplicada nos três canais. ~210 multiplicações por pixel, campo receptivo 5×5, **225 parâmetros** (`restore.json`, 5 KB).
- **Treino:** JAX em CPU (`tools/nn/train.py`), pares "luma decodificada de H.264 a 8–25 Mb/s → render limpo", 16 cenas com 57 texturas fora do conjunto de avaliação; perda L1 nos pixels + L1 no Laplaciano. Uma rede de 12 canais e campo 9×9 reduziu 5,1% do erro contra 2,8% da leve, a ~14× o custo, e não ganhou no pipeline completo.
- **GPU:** 2 passadas. A primeira grava 8 canais em duas texturas `RGBA16F` (MRT): **33 MB por quadro em 1080p só de gravação**, o que pesa em GPU móvel. Exige `EXT_color_buffer_float`.
- **Ganho medido (v9.1):** SSIM 0,930 → 0,934 em 1080p e nenhum ganho em 1280p (0,917 → 0,917). Custo relativo +31% (v9.1) e +45% sobre a base nesta bancada.
- **Conclusão:** custo alto para ganho quase nulo. Continua desligada; só faz sentido de novo como compute shader fundido no WebGPU (as features ficam na memória do workgroup e não vão para a memória da GPU).

## 6. Medição de tempo de GPU no código

- `EXT_disjoint_timer_query_webgl2`: um `TIME_ELAPSED` por quadro, até 4 consultas em voo, lidas sem bloquear. Alimenta o orçamento (`budget.sample`) e a medição. Não existe no WebView do Android.
- Sem o timer: um `fenceSync` a cada 0,5 s, consultado por `setTimeout`. Mede do primeiro comando até o fim da GPU, incluindo trabalho enfileirado antes: limite superior, **só exibido, nunca usado para adaptar**.
- Nenhum `readPixels`, `finish` ou `getError` no caminho do quadro, exceto `getError` nos 3 primeiros quadros da captura direta (checagem única). Ok com a regra 10.3.

## 7. Achados

1. **A adaptação automática fica inerte no Poco F7.** Sem timer, a única via é `budget.cadence(referência, fps)`, e a referência (`bxReferenceFps`) só é registrada quando o modo **não** é `filtered` (`image-filter.js:257`). Em uso normal ninguém passa pelo modo original, então a referência é `null` e `cadence()` retorna sem fazer nada. Com o fence também excluído da adaptação, **nada no Poco reduz o tratamento** quando a GPU passa do limite. É o achado mais importante para o stuttering relatado.
2. **Auto no Poco = 1280p**, com EASU e nitidez em 2276×1280: +33% de custo relativo sobre a saída nativa.
3. **Fluidez acrescenta uma passada de cópia** na resolução de saída (`present`) — com captura direta, é o caso da sessão real no Poco.
4. **Leituras repetidas na passada espacial** (até 8 por pixel com Detalhe + Compressão/AA).
5. **Tudo em `highp`.** Na Adreno, `mediump` (fp16) pode dobrar a vazão de conta; precisa de regressão de pixel porque os limiares do shader são de 0,003.
6. **Sem `invalidateFramebuffer`** nos alvos intermediários. Como cada passada reescreve todos os pixels, invalidar antes de desenhar evita que a Adreno carregue o tile antigo da memória.
7. **`UNPACK_FLIP_Y` em todo upload.** Dependendo do caminho do Chrome, a inversão pode custar uma cópia extra; dá para inverter a coordenada no primeiro shader. Hipótese a medir (linha "Original" da bancada no aparelho).
8. **Os alvos são reaproveitados entre quadros** (`target()` só recria quando o tamanho muda) e o contexto da página de testes já usa `alpha:false, antialias:false, preserveDrawingBuffer:false`. Ok com a regra 10.1/10.3. O contexto do jogo vem do Better xCloud e não foi alterado.
9. **`cut.glsl`** soma 2×256 leituras num único pixel (uma única invocação serial). É barato em absoluto, mas é o padrão errado para GPU; só roda com o temporal ligado.
