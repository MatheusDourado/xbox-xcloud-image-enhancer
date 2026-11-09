# Auditoria do pipeline no play.xbox.com — fase 1 (sem alteração de código)

> **Status: em andamento.** Este documento é preenchido à medida que a auditoria avança.
>
> | Frente (doc de diagnóstico de 09/11/2026) | Investigação | Verificação adversarial |
> | --- | --- | --- |
> | P0 — O que realmente roda (framePlan, bypasses, resolução) | concluída | pendente |
> | P0 — Frametime, captura e apresentação | concluída | pendente |
> | P1 — Microdetalhe × ruído/cintilação; redundância de realce | em andamento | pendente |
> | P1 — Rede neural atual (baseline) | em andamento | pendente |
> | P2 — Compressão, Degradês, AA e croma | pendente | pendente |
> | P2 — Renderizador e checagem das afirmações do diagnóstico | pendente | pendente |
>
> Até a verificação adversarial terminar, cada seção vale como **pré-verificação**. Correções entram aqui, marcadas.

Responde ao documento *"Xbox xCloud Image Enhancer — diagnóstico e roteiro de discussão com Claude"* (09/11/2026). Esta é a **primeira fase**: auditoria, sem mudar código. Os testes com métricas e logs ficam para depois, via adb por Wi-Fi (seção 9).

## 0. Base, método e legenda

- **Commit auditado:** `16e64fc2501349cdc9966d9b2aaf8e33dfd2a564` (2026-11-07), branch derivada de `main`.
- **Build em uso:** `BxBuild.sourceSha256 = e6d93b36…` (`6.7.12-imagefilter.10.0.0`).
  - Um rebuild de `tools/build.py` gerou um `xcloud-image-filter-play.user.js` idêntico, byte a byte, ao do repositório.
  - Esse arquivo também é idêntico ao `assets/play.js` do APK `android/dist/xcloud-imagefilter-10.0.0.apk`.
  - Por isso, toda referência `src/…:linha` abaixo vale para o que roda no Poco com o APK 10.0.0.
- **Método:** leitura do código com execução de `framePlan`/`createBudget` reais em `vm` (sem alterar arquivos), mais leitura das docs e medições em `docs/medicoes/`. Cada frente foi investigada por um agente, e um segundo agente tenta refutar cada achado.
- **Classificação de cada achado:**
  - **[código]**: confirmado por código, com linhas citadas.
  - **[doc]**: confirmado por documentação ou medição do repositório. Quase sempre é **bancada**: clipe H.264 de arquivo no WebView do Poco, não WebRTC real. Não extrapolar.
  - **[hipótese]**: plausível, não provado.
  - **[teste no Poco]**: só a medição no aparelho decide. O "como medir" está ao lado.

### Configuração relatada e suposições

| Painel | Chave | Valor relatado | Observação |
| --- | --- | --- | --- |
| Compressão | `cleanup` | 0,3 | |
| Detalhe | `detail` | 1 | fora da faixa dos presets (máx. 0,35) |
| Degradês | `deband` | 1 | |
| Reconstrução neural | `neural` | 1 | |
| Estabilidade em movimento ("Movimento") | `temporal` | 0 | |
| Antialiasing | `antialias` | 0 | |
| Resolução de saída | `output` | `native` | |
| "tempo entre quadros alto" | ? | ? | ambíguo; ver seção 11 |
| "adaptação desligada" | `adaptive` ou `gpuBudget` | ? | ambíguo; ver seção 11 |

**Não informados, supostos nos padrões** (`src/restoration-engine.js:5`):
- Nitidez 2, Método USM, Escalador EASU, Cor nas bordas 0,75.
- Fluidez desligada, Captura Vídeo, Renderizador Auto, Limpeza Seletiva.
- `processingMode` performance, Suavidade 0.

## 1. Resumo executivo (provisório)

1. **Em saída Nativa, SGSR e "EASU + nitidez" são o mesmo plano, e nenhum escalador roda.** [código] `framePlan` só define `scaler` com `outW>w && outH>h` (`src/restoration-engine.js:366`). O teste `tests/engine.test.cjs:358` garante isso. A observação "SGSR parece igual a EASU + nitidez" é esperada e não avalia o SGSR.
2. **Em Nativa, a ampliação até a tela é bilinear do navegador, depois da nitidez.**
   - [código] O canvas fica no tamanho do stream (1920×1080), e o compositor amplia ~×1,19 até os ~1280 px físicos.
   - [doc] `docs/analysis-v9.md` mede que essa ampliação depois da nitidez custa parte do detalhe.
   - Saída Auto faz a ampliação (EASU/SGSR) e a nitidez no tamanho final.
3. **"Rede neural 100%" não garante que a rede rode.**
   - [código] Ela exige `EXT_color_buffer_float` e `budget.neuralAllowed` (`src/restoration-engine.js:355`). Se faltar, some sem aviso.
   - [doc] Quando roda, a bancada do Poco mede **+5,2 ms de GPU por quadro** em 1080p a 30 FPS (11,48 → 16,69 ms; ocupação 34,3% → 50,1%; `docs/medicoes/spec2/poco-base.json`, caso medido com neural 0,5). O custo não depende da intensidade: os passes são os mesmos.
4. **No Poco, "Aliviar GPU acima de" 3, 6 e 10 ms são equivalentes; só "Nunca" muda algo.**
   - [código] Sem `EXT_disjoint_timer_query_webgl2`, a única redução é por cadência, e ela ignora o valor em ms (`src/restoration-engine.js:71-75`).
   - Essa redução desliga, nesta ordem: **neural → degradês ½ → degradês 0 → limpeza → detalhe+cor**.
   - Os sliders não mudam e o estado não volta sozinho até algum ajuste mudar.
   - **Isso pode contaminar qualquer A/B visual.**
5. **A resolução recebida no site novo pode ser 720p.** [teste no Poco] O "1080p HQ" era preferência do Better xCloud e não existe em `play.xbox.com` (`src/play/prelude.js:6`; `docs/play-xbox-com.md` §5 item 7).
6. **O laço de desenho segue os quadros que o `<video>` apresenta, não os decodificados.**
   - [código] Há 2 callbacks rVFC por quadro e nenhum limite de FPS no site novo. O mesmo quadro nunca é redesenhado.
   - [doc] A 60 FPS, o `<video>` sozinho já pulou ~10–18% dos quadros na bancada (stream real na v9.6.1: ~2%).
   - [doc] A 30 FPS, o intervalo entre callbacks tem p95 ≈ 50 ms **mesmo sem tratamento** em 84 de 110 rodadas de bancada.
   - Parte do "frametime irregular" não nasce no tratamento.
7. **A métrica "display" (Ritmo na tela) é a hora de submissão na CPU, não a de apresentação.** [código] Engasgos causados por GPU ou composição não aparecem nela; é preciso Perfetto (frametimeline) ou `gfxinfo`.
8. **Picos pontuais têm causas conhecidas:**
   - [código] A variante do `spatial` da configuração relatada não é pré-compilada e finaliza de forma bloqueante no 2º quadro (o Poco não tem `KHR_parallel_shader_compile`).
   - [código] Alternar Original/Tratada, a neural ou a resolução recria ~50 MB de alvos.
   - [doc] O motor inteiro compila em ~326 ms no início.
9. **Com Degradês ligado em Nativa, o dither é aplicado duas vezes com o mesmo padrão** (spatial e passe final; mesmo hash e mesmo `gl_FragCoord`). [código] O efeito visual é [hipótese].
10. **A medição exportada já permite deduzir quais passes rodaram, mas não registra o essencial para a fase 2.** [código] Faltam a lista de passes, o tempo por passe, o motivo da redução automática e a variante do `spatial` (seção 2.7).

## 2. P0 — O que realmente roda no play.xbox.com

### 2.1 Fluxo de um quadro

| # | Etapa | Arquivo:linha | O que acontece |
|---|---|---|---|
| 0 | Montagem do userscript | `tools/build.py:77`, `:93` | header + `src/play/prelude.js` + `BaseStreamPlayer`/`BaseCanvasPlayer`/`WebGL2Player` de `script.js` (sem alteração) + bundle (BxBuild, BxShaders, BxWgsl, restoration-engine, webgpu-engine) + frame-pacing + image-filter + panel + hud + play/host |
| 1 | Stubs do site novo | `src/play/prelude.js:6`, `:9`, `:15-24` | `getStreamPref` só responde `video.player.powerPreference` → `'default'`; `STATES`; `RTCPeerConnection` rastreado |
| 2 | Detecção | `src/play/host.js:28-39`, `:73-86`, `:182` | `<video>` com `srcObject` e trilha `live`; varredura a cada 1 s + MutationObserver; anexa com `videoWidth>0` |
| 3 | attach | `src/play/host.js:46-62` | `new WebGL2Player(video)`; canvas `.bxif-play-canvas` (CSS `:11`); vídeo com `opacity:0` (`:10`, `:60`) |
| 4 | Construtor e init (upstream) | `script.js:82` | canvas = videoWidth×videoHeight, inserido depois do vídeo; `frameCallback` = `requestVideoFrameCallback` (ou rAF) |
| 5 | setupShaders (patch) | `src/image-filter.js:268-286`; `script.js:263` | contexto WebGL2 `{antialias:false, alpha:false, desynchronized, powerPreference:'default'}`; `new Engine` compila todos os programas (`src/restoration-engine.js:394-408`); `startTiming` registra o rVFC de metadados |
| 6 | drawFrame | `script.js:82`; `src/frame-pacing.js:10-11` | re-registra o rVFC; `shouldDraw` → `true` (targetFps 60; ninguém chama `setTargetFps` no site novo) |
| 7 | updateFrame (patch) | `src/image-filter.js:414-450` | token do quadro (`:425-427`); `frameSettings` (`:428`); Fluidez off → `render` direto (`:443`); Fluidez on → slot + `present` no rAF (`:433-440`) |
| 8 | frameSettings | `src/image-filter.js:289-312` | `processing`/`processingMode` **não** vêm do Better xCloud (`getStreamPref` → undefined); escala adaptiva (`:298-299`); `displayHeight` + `resolveOutput` (`:300`); `chooseRenderer` (`:301`); canvas redimensionado (`:309`) |
| 9 | chooseRenderer | `src/image-filter.js:223`, `:257-265` | "Auto" → WebGL2 (`AUTO_WEBGPU` vazio, `src/restoration-engine.js:383-384`) |
| 10 | render | `src/restoration-engine.js:511-576` | upload `texImage2D` RGBA8 com `FLIP_Y` (`:523-524`); `framePlan` (`:526`); neural (`:529-533`); spatial (`:534-537`); temporal (`:538-552`); AA (`:554`); EASU (`:555`); final (`:557-565`); fence ≥ 500 ms (`:566`); apaga alvos não usados (`:570-572`) |
| 11 | framePlan | `src/restoration-engine.js:352-377` | decide neural, spatial, temporal, AA, escalador e passe final |
| 12 | publish | `src/image-filter.js:314-342` | `status.resolution`, fps, cadência → `budget.cadence` |
| 13 | Composição | `src/play/host.js:11` | canvas 100% / `object-fit:contain` sobre o vídeo transparente; o navegador escala até os pixels físicos |

### 2.2 Passes na configuração relatada

Condições desta tabela: saída Nativa, stream 1920×1080, suposições da seção 0, `floatTargets=true`, sem redução automática.

O `framePlan` obtido executando o código real foi `{neural:1, spatial:{cleanup:.3, deband:1, chroma:.75, detail:1, antialias:0, debandTaps:4, quantize:true, selective:true}, temporal:0, antialias:0, scaler:null, final:{name:'casFiltered', filterId:1, sharpenFactor:1.667, haloMargin:4/255, noiseFloor:4/255, lumaSharpen:true, deband:1}, gl:true}`.

| Ordem | Passe | Tamanho | Alvo | Condição | Leituras/px |
|---|---|---|---|---|---|
| 0 | upload `texImage2D(video)` | 1920×1080 | RGBA8, `UNPACK_FLIP_Y` | sempre (`:523-524`) | — |
| 1 | `nnFeatures` | 1920×1080 | MRT 2×RGBA16F (`:452-460`) | filtered ∧ neural>0 ∧ floatTargets ∧ neuralAllowed (`:355`) | 9 |
| 2 | `nnApply` (strength 1) | 1920×1080 | `neural` **RGBA8** (performance) | idem | 18 RGBA16F + 1 = 19 |
| 3 | `spatial@mediump.1.1.4.1.1.0.1.1` (genérico até compilar) | 1920×1080 | RGBA8, com dither | cleanup∨deband∨chroma∨detail∨AA>0 (`:361-362`) | 29 fixas + 2 condicionais |
| 4 | `casFiltered`, filterId 1 (USM limitado) | 1920×1080 | canvas | `scaler` null porque outW=w (`:366`, `:372-374`) | 9 |
| 5 | composição do navegador | 1920×1080 → ~2276–2620×1280 físicos | camada do canvas | `host.js:11` | fora do script |
| — | **não rodam** | | | | |

Os passes que **não rodam** nesta configuração:
- `easu` e `sgsr`: `scaler` é null em Nativa.
- `antialias` (passe separado), `copy`/`cut`/`motion`/`temporal`: temporal 0, e o AA removido na compilação.
- `rcas`, `cas`, `finish`: compilados, mas nunca desenhados neste caminho.

### 2.3 Variações e o que muda na lista de passes

| Variação | Efeito | Evidência |
|---|---|---|
| Auto, vídeo com 1280 px físicos, stream 1080p, EASU | + `easu` 1920×1080 → 2276×1280; `casFiltered` em 2276×1280; compositor ~1:1 | `:37-41`, `:366`, `:555` |
| Auto + SGSR | sem `easu`; último passe `sgsr` 2276×1280 direto no canvas (força 1,0 com Nitidez 2) | `:47`, `:366`, `:371` |
| **Nativa + SGSR** | **idêntico a Nativa + EASU** | `:366`; `tests/engine.test.cjs:358` |
| Auto com vídeo ≤ 1123 px físicos | resolve para Nativa | `:40` |
| Stream 720p + Nativa | mesmos passes em 1280×720; compositor ×1,78 | `:48` |
| Fluidez Equilibrada/Máxima | mesmos passes; o último roda em `present()` no rAF; o alvo `spatial` vira o slot `pacedN` sem cópia | `src/image-filter.js:433-440`; `src/restoration-engine.js:558-564`, `:581-585` |
| `processingMode` quality (só pelo console no site novo) | alvos RGBA16F; spatial sem dither; `sharpenFactor` 2,0 | `:353`, `:362`, `:374`, `:444` |
| `floatTargets=false` | neural não roda, **sem aviso** | `:355`, `:397` |
| Adaptar à compressão ligado | mesmos passes; intensidades escaladas (2.5) | `src/image-filter.js:298-299` |
| "Aliviar GPU" 3/6/10 ms no Poco | idênticos (2.4) | `:71-75`, `:476` |
| Renderizador WebGPU + neural>0 | o quadro volta ao WebGL2 (`plan.gl`) | `:375`, `:379`; `src/image-filter.js:262-264` |
| Comparação "Só nitidez" | upload + `cas` do upstream **sem** `limitSharpen` e sem dither; sem neural/spatial/escalador | `:372-374`; `tools/build.py:27-29` × `:43-49` |
| Comparação "Original" | upload + `cas` com `sharpenFactor` 0 | `:374` |

Consequência para os A/B [código]: "Tratada" contra "Só nitidez" mistura restauração com dois USM diferentes (limitado e não limitado). Para isolar neural e spatial, compare "Tratada" com neural 0 e filtros 0 na mesma saída.

### 2.4 Redução automática no Poco (sem cronômetro de GPU)

[código] `budget.sample` só recebe amostras do timer query (`src/restoration-engine.js:476-481`). A fence alimenta apenas a estimativa (`:482-498`, "never used to reduce").

A redução vem de `budget.cadence`, chamada em `publish` (`src/image-filter.js:327-341`), e ela só testa `limitMs===0` (`src/restoration-engine.js:71-75`).

- **Gatilho:**
  - A cada ≥ 2 s, compara os quadros exibidos/s com `margem × min(fpsReceived, 60)`.
  - A margem é 0,8 acima de 45 FPS e 0,9 abaixo; na captura direta, 0,95 (`:103`).
  - 3 janelas seguidas abaixo da margem disparam um passo, ou seja, ≥ 6 s por passo.
- **Ordem** (`degrade`, `:55-70`):

| Passo | Nativa (config relatada) | Auto → 1280 |
|---|---|---|
| 1 | neural desligada | saída → nativa |
| 2 | degradês ×0,5, taps 2 (variante nova do spatial) | neural desligada |
| 3 | degradês 0 (variante nova) | degradês ×0,5 |
| 4 | limpeza desligada (variante nova) | degradês 0 |
| 5 | detalhe + cor desligados → spatial some | limpeza desligada |
| 6 | — | detalhe + cor desligados |

- **Volta** (`resetBudget`, `:588`) acontece quando:
  - muda qualquer ajuste fora de `LIVE_KEYS` (`src/image-filter.js:35`, `:45`);
  - o usuário usa "Restaurar";
  - muda o "Aliviar GPU";
  - começa uma nova sessão.

  **Não** voltam: trocar Comparação, Renderizador, HUD, Suavidade ou `desynchronized`.
- **Visibilidade:**
  - Só a última razão aparece ("↓ …" na seção 04 do painel, `src/panel.js:1151`).
  - O HUD não mostra e os sliders não mudam.
  - A exportação não traz o texto (`src/image-filter.js:64`), mas os segmentos trazem `revision` e `effective`.

A simulação com o `createBudget` real deu passos idênticos para 6 e 10 ms e nenhum para 0.

### 2.5 "Adaptar à compressão" no Android (bits/pixel; sem QP)

[código] Com `adaptive=true`, cleanup, deband e detail são multiplicados por `compressionScales(nível)` e limitados a 1 (`src/image-filter.js:298-299`).

Sem `qpSum`, o nível vem do p80 dos bits/pixel do último minuto (`:134-143`; `src/restoration-engine.js:294-304`). Neural e cor nas bordas não são escaladas. A tabela abaixo usa os ~18 Mb/s relatados:

| Stream | bpp | QP estimado | Nível | Compressão / Degradês / Detalhe efetivos |
|---|---|---|---|---|
| 1080p60 | 0,1447 | 26,9 | 0,4 | 0,276 / 0,92 / 1,0 |
| 1080p30 | 0,2894 | 22,9 | 0,1 | 0,204 / 0,68 / 1,0 |
| 720p60 | 0,3255 | 22,2 | 0,1 | 0,204 / 0,68 / 1,0 |
| 720p30 | 0,6510 | 18,2 | 0 | 0,18 / 0,6 / 1,0 |

Na prática, quem decide é o p80 do bpp real. Os valores efetivos ficam em `segments[].config.settings` na medição.

### 2.6 Resolução: Nativa × Auto no Poco F7

A tela documentada é 1280×2772 com dpr 3,25 (`docs/spec1-estudo.md:121`; bancada: css 806×394).

| Caso | `resolveOutput` | Backing store | Quem amplia até a tela |
|---|---|---|---|
| Nativa, stream 1080p | `native` | 1920×1080 | compositor ×≈1,19 |
| Auto, stream 1080p, vídeo com 1280 px | `1280` | 2276×1280 | EASU/SGSR no shader |
| Auto, stream 1080p, vídeo com 1220 px | `1216` | 2162×1216 | EASU/SGSR |
| Auto, vídeo ≤ 1123 px | `native` | 1920×1080 | compositor |
| Nativa, stream 720p | `native` | 1280×720 | compositor ×≈1,78 |
| Auto, stream 720p, 1280 px | `1280` | 2276×1280 | EASU/SGSR ×1,78 |

### 2.7 Contagem de leituras de textura por quadro

[código] São contas de leitura, não tempo. O tempo real depende de cache, formato (RGBA16F tem o dobro de banda) e clock.

| Cenário | Conta | Leituras/quadro |
|---|---|---|
| Nativa 1080p, config relatada | (9 + 19 + 31 + 9) × 2.073.600 | ≈ 141,0 M |
| — só a neural | 28 × 2.073.600 | ≈ 58,1 M (41%) |
| Nativa 1080p sem neural | 40 × 2.073.600 | ≈ 82,9 M |
| Auto 2276×1280 + EASU | 59 × 2.073.600 + 25 × 2.913.280 | ≈ 195,2 M |
| Auto 2276×1280 + SGSR | 59 × 2.073.600 + (3 a 13) × 2.913.280 | ≈ 131,1–160,2 M |
| Nativa 720p, config relatada | 68 × 921.600 | ≈ 62,7 M |

Tráfego de memória estimado só da neural em 1080p: ≈ 91 MB por quadro, ou ~2,7 GB/s a 30 FPS e ~5,5 GB/s a 60 FPS. Essa conta ignora a compressão de framebuffer.

### 2.8 Outros fatos do caminho (código)

- **Passe final** [código]:
  - É `casFiltered` USM com `sharpenFactor = 2/1,2 ≈ 1,667`, ou seja, `e + 0,556·(e − gauss3×3)`.
  - Usa `limitSharpen` (`tools/build.py:35-49`): piso de ruído 4/255, halo ±4/255 e só luma.
  - Depois aplica `finishColor`, com dither ±0,5/255 quando deband>0.
- **Método "Nativo" no site novo aplica CAS** [código]: `processing` cai no padrão `'cas'`, já que não existe Better xCloud. `processingMode` "quality" só é alcançável pelo console.
- **Ajustes ficam por origem** [código]: `localStorage['BxImageFilter.v9']` é por origem, então `play.xbox.com` **não herda** o que foi ajustado em `www.xbox.com`.
- **Variante do spatial** [código]:
  - A da config relatada é `spatial@mediump.1.1.4.1.1.0.1.1`; a pré-aquecida é `…0.1.4.1.0.0.1.1`, a dos padrões (`src/restoration-engine.js:405`).
  - No 1º quadro desenha o genérico (highp, guiado por uniforms).
  - No 2º, `finishProgram` bloqueia até o link terminar (`:432-435`, `:415`).
  - A mudança de intensidade pelo adaptive não troca a chave enquanto o valor fica > 0.

### 2.9 O que já dá para provar no aparelho e o que não é registrado

**Já registrado** [código]:
- `metadata`: timer, gpuMethod `fence`, floatTargets, screen, app, refresh.
- Por segmento:
  - `config.settings` (com a escala adaptiva e a saída resolvida), `source`, `output`, `revision`;
  - `effective` (neural, temporal, cleanup, chroma, detail, deband, debandTaps, antialias, scaler);
  - `frames`, `drawFps`, `videoSkipped`, `pacerDropped`;
  - GPU por fence (p50/p95/p99);
  - `display`/`arrival`/`server`/`wait` (p50/p95/p99/máx/hitches).
- Timeline de 1 s: fpsReceived, fpsShown, bitrateMbps, decodeMs, bufferMs, level, bitsPerPixel, gpuMs.

**Não registrado:**
- a lista de passes executados e o passe final com seu `filterId`;
- se o spatial usou a variante ou o genérico;
- o tempo por passe;
- o tempo de compilação e o tempo do upload;
- o texto de `budget.reason` na exportação;
- a GPU desmascarada (vem "WebKit WebGL");
- `status.display`;
- `config.renderer` no WebGL2.

## 3. P0 — Frametime, captura e apresentação

### 3.1 Laço por quadro (Fluidez desligada)

| Ordem | Etapa | Arquivo:linha | Observação |
| --- | --- | --- | --- |
| 0 | o `<video>` apresenta um quadro WebRTC | navegador | dois quadros no mesmo vsync → só o último dispara rVFC (`presentedFrames` salta) |
| 1 | rVFC nº 1: `onMeta` | `src/image-filter.js:182-193` | conta o salto (`:187-188`); lê `rtpTimestamp`/`receiveTime` |
| 2 | rVFC nº 2: `drawFrame` (upstream) | `script.js:82` | `shouldDraw` = true (`src/frame-pacing.js:11`) |
| 3 | `updateFrame` | `src/image-filter.js:414-430` | token; `frameSettings` com spread, `getBoundingClientRect` e `normalize`; `JSON.stringify` (só serve no fallback rAF) |
| 4 | `render()` | `src/restoration-engine.js:511-576` | upload + nnFeatures + nnApply + spatial + casFiltered no canvas |
| 5 | fence (sem timer), a cada ≥ 0,5 s | `:566`, `:485-498` | `gl.flush()` + consultas por `setTimeout(1)` |
| 6 | `shownAt` + `publish` | `src/image-filter.js:444`, `:314-342` | "display" = `performance.now()` **após submeter**; 3 ordenações por quadro |
| 7 | composição | navegador | canvas 1920×1080 escalado; vídeo com opacity 0 |

### 3.2 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| F1 | [código] | Laço por rVFC com 2 callbacks por quadro (onMeta → drawFrame, ordem fixa); sem limite de FPS no site novo; o mesmo quadro nunca é redesenhado (token por `presentedFrames`). | médio |
| F2 | [doc] | O `<video>` descarta quadros antes do tratamento: ~10–18% a 60 FPS só com o vídeo na bancada (`spec2/poco-base.json` "so-video-60": 49,71 callbacks/s); 9,6% em 21 min com tratamento; ~0 a 30 FPS; ~2% em stream real (`release-v9.6.1.md`). | alto |
| F3 | [doc] | A 30 FPS em 60 Hz, o intervalo rVFC alterna 16,7/50 ms **sem tratamento** (p95 50,1 ms com 2,2% de GPU, "so-video-30"); em 84 de 110 rodadas de bancada o p95 passou de 45 ms. | alto |
| F4 | [código] | "display" é a hora de submissão na CPU (`src/image-filter.js:444`, `:212`): não vê GPU atrasada nem composição. Na bancada, a fence com neural teve p50 24,3 ms a 30 FPS. | alto |
| F5 | [teste no Poco] | Neural + spatial completo em 1080p: estimativa de ≈14 ms ativos por quadro (≈42% da GPU a 30 FPS; ≈84% a 60 FPS sem subir o clock). A estimativa soma bases diferentes, então é indicativa. A Spec 2 mediu 88% no padrão antigo em 1280p a 60 FPS. | alto |
| F6 | [teste no Poco] | Todo o tratamento roda na thread principal, junto com o site. Na bancada, com tarefas longas, caiu de 30,0 para 25,9 FPS (Worker: 29,5). A carga do `play.xbox.com` logado não foi medida; o Worker não foi implementado. | alto |
| F7 | [doc] | O upload não é gargalo de GPU: `FLIP_Y`, RGB e VideoFrame ficam no ruído (`spec2/poco-upload-live.json`). O custo relevante é **CPU da thread principal**: 1,4 ms p50 / 2,4 ms p95 por quadro. A hipótese de "FLIP_Y lento" está **refutada** na bancada. | médio |
| F8 | [código] | Compilação síncrona: 14 programas no construtor (bancada: 325,8 ms) e a variante da config relatada sob demanda, com finalização bloqueante. Explica travadas no início e ao ligar ou desligar um filtro, não engasgo contínuo. | médio |
| F9 | [código] | Alternar Original/Tratada, a neural, o diagnóstico ou a resolução **recria ~49,8 MB de alvos** (`:570-572`, `:444-460`). A/B rápidos geram picos que parecem engasgo do tratamento. | médio |
| F10 | [teste no Poco] | A taxa da tela fica a cargo do sistema (`preferredDisplayModeId 0`, `MainActivity.java:199-215`). 60 FPS em 90 Hz dá judder. A medição registra a taxa só no início. | médio |
| F11 | [código] | Fluidez: processa no rVFC e apresenta no rAF, com 5 slots; Equilibrada segue o relógio RTP com o p95 do trânsito + 3 ms. Ajuda quando a irregularidade vem da chegada, não com a GPU saturada. A Captura Direta (MSTP na thread principal) evita os pulos do `<video>`, mas não foi medida com WebRTC no Poco. `desynchronized` não trouxe ganho no Poco [doc]. | médio |
| F12 | [teste no Poco] | Composição: o vídeo com `opacity:0` continua decodificado e apresentado, já que é a fonte do rVFC e do upload. Se a camada dele ainda é composta, não está provado. | baixo |
| F13 | [hipótese] | Alocações por quadro de ≈11–22 KB (`normalize` 3×/quadro, `JSON.stringify`, 3 ordenações, `Object.entries` no `draw`) geram GC menor periódico. Nada mostra que causem engasgo. | baixo |
| F14 | [hipótese] | O custo da própria medição (fence + `setTimeout(1)`, `getStats` a 1 Hz sempre no Poco, timers do painel e do HUD) é provavelmente pequeno. | baixo |
| F15 | [doc] | 21 min de bancada sem throttling (GPU até 61,4 °C), mas a 60 FPS a temperatura ainda subia no fim. O script não registra temperatura; isso só sai por adb. | médio |

### 3.3 Eventos pontuais que causam pico de um ou poucos quadros

| Evento | Quando | Arquivo:linha | Duração conhecida |
| --- | --- | --- | --- |
| Construtor do Engine | início de cada stream; contexto restaurado | `src/restoration-engine.js:403-405` | 325,8 ms (bancada) |
| Variante nova do spatial | 2º quadro com ajustes novos; filtro cruza 0; corte do orçamento | `:426-440` | não medida em jogo (genérico do zero: 68,6 ms) |
| Recriação de alvos | Original↔Tratada, neural, diagnóstico | `:570-572` | não medida (~49,8 MB) |
| Troca de resolução do stream | queda ou subida da rede | `src/image-filter.js:309` | não medida |
| Corte do orçamento | 3 janelas abaixo da margem | `:55-75` | não medida |
| Troca de Fluidez/Captura | ajuste | `src/image-filter.js:202`, `:351-370` | não medida |

### 3.4 O que já é medido × o que falta

| Grandeza | Existe? | Limitação |
| --- | --- | --- |
| display/arrival/server/wait com p50/p95/p99/máx/hitches por segmento | sim | display = submissão na CPU |
| Quadros pulados pelo `<video>` (`videoSkipped`, `origin.missed`) e descartes do pacer | sim | — |
| GPU | fence no Poco (2/s) | limite superior com fila; não inclui `present()` com Fluidez |
| Timeline de 1 s (fps recebido/exibido, bitrate, perda, RTT, decodeMs, bufferMs, QP/bpp, nível, gpuMs, waitMs) | sim | sem resolução, taxa de tela e temperatura |
| CPU do tratamento por quadro | não | só na bancada (~2 ms) |
| Folga até o vsync; `presentationTime − receiveTime`; `processingDuration` | não | os metadados rVFC existem em `onMeta` e não são usados |
| Apresentação real / composição | não | Perfetto frametimeline, `gfxinfo`, DevTools Frames |
| Tarefas longas, GC, temperatura | não | DevTools, adb |
| Eventos (compilação, realocação, corte) com horário | parcial | só `revision`, sem horário |

### 3.5 Instrumentação mínima proposta (fase 2; **não implementada**)

| # | O que medir | Onde | Responde |
| --- | --- | --- | --- |
| 1 | CPU de `updateFrame` por quadro | `src/image-filter.js:414-450` → nova série nos INTERVALS (`src/restoration-engine.js:112`) | contenção da thread principal × GPU |
| 2 | Folga até o vsync e latência receive → apresentação | `onMeta` guarda `expectedDisplayTime`, `presentationTime`, `receiveTime`, `processingDuration` | separa rede/decodificação de pós-processamento |
| 3 | Eventos com horário: compilação, alocação de alvo, `degrade`, troca de renderizador/Fluidez | `spatialVariant`, `target`, `degrade`, `setRenderer` → `events[]` limitado | explica picos isolados |
| 4 | Lista de passes e passe final por segmento; `budget.reason` na exportação | `segmentConfig` (`src/restoration-engine.js:386-390`); `exportMeasurement` (`src/image-filter.js:62-65`) | P0: o que rodou de fato |
| 5 | Tarefas longas (LoAF) | PerformanceObserver no adaptador | carga do site |
| 6 | Resolução, taxa e heap na timeline | `src/image-filter.js:119-121` | trocas de resolução; GC |
| 7 | Temperatura e estado térmico | ponte `BxAndroid` (`getCurrentThermalStatus`/`getThermalHeadroom`) | throttling em partida longa |

## 4. P1 — Microdetalhe × ruído e cintilação; redundância de realce

*Em andamento.*

Já confirmado em [código] pela frente P0: o dither é aplicado duas vezes com o mesmo padrão (`src/shaders/spatial.glsl:155-158` e `src/shaders/finish.glsl:13-16`; `quantize` true em performance, `src/restoration-engine.js:362`).

## 5. P1 — Rede neural atual (baseline)

*Em andamento.*

Já confirmado pela frente P0:
- condições de execução [código] (2.3);
- +5,2 ms/quadro na bancada a 30 FPS [doc] (1.3).

## 6. P2 — Compressão, Degradês, AA e croma

*Pendente.*

Já confirmado pela frente P0 [código]: com AA 0 e temporal 0, o bloco de AA é removido na compilação (custo e efeito zero), e com temporal 0 não existe passe de AA separado (`src/restoration-engine.js:358-363`).

## 7. P2 — Renderizador e checagem das afirmações do diagnóstico

*Pendente.*

Já confirmado pela frente P0 [código]: "Auto" é sempre WebGL2 (`AUTO_WEBGPU` vazio). Com WebGPU e neural>0, o quadro volta ao WebGL2.

## 8. Respostas às perguntas da seção 5 do diagnóstico (parciais)

1. **Quais passes rodam na config nativa?** Upload → `nnFeatures` → `nnApply` → `spatial@mediump.1.1.4.1.1.0.1.1` → `casFiltered` (USM 1,667, limitado) direto no canvas 1920×1080 → ampliação bilinear do compositor.
   - SGSR/EASU não rodam: só com saída maior que a entrada (`src/restoration-engine.js:366`).
   - A neural roda só com `floatTargets` e `neuralAllowed` (`:355`).
   - Temporal 0 desliga todo o ramo temporal (`:358`).
   - Com temporal 0, o AA fica fundido no spatial e, com 0, nem é compilado (`:360`).
   - Três pontos só o Poco decide: se o stream é 1080p, se `floatTargets` é true e se `budget.revision` continua 0.
2. **A neural roda em WebGL2? Qual o custo?**
   - Sim, sempre em WebGL2, se houver `EXT_color_buffer_float` e se a cadência não a tiver cortado. Leia `e.floatTargets`, `e.budget.neuralAllowed` e `effective.neural`.
   - Custo [doc, bancada]: +5,2 ms/quadro em sessão a 30 FPS; 2,33–2,59 ms em rajada.
   - Não foi medido em partida real nem a 60 FPS.
   - A diferença visual fica para a frente P1 (seção 5).
3. *(frente P1 — em andamento)*
4. **O laço acompanha os quadros decodificados?** Não: acompanha os quadros que o `<video>` apresenta. Não repete quadros. Descarta os que chegam no mesmo vsync, e eles ficam contados em `origin.missed`/`videoSkipped`. Com Fluidez + Captura Direta, todos os quadros decodificados chegam ao tratamento. Já existe p50/p95/p99 por segmento para display/arrival/server/wait, mas "display" é a hora de submissão na CPU, e a composição não é medida pelo script.
5. *(frente P1 neural — em andamento)*
6. **Menor experimento** (lado da fluidez; o critério visual vem da P1):
   - Uma medição do painel de ~12 min, na mesma cena, com 60 Hz fixo, Fluidez desligada, painel fechado e DevTools desconectado.
   - Alternar ABAB a cada 3 min só a variável candidata (ex.: neural 100% × 0%; Detalhe 100% × moderado), com Perfetto em paralelo.
   - A candidata passa se display p99 e hitches/min não piorarem, se `videoSkipped` e `app_deadline` não subirem e se a ocupação ficar ≤ ~50% a 30 FPS (regra da Spec 2).
7. **Fato × hipótese × teste:** marcado em cada achado das seções 1–3. Consolidação final após as frentes restantes.

## 9. Protocolo de testes via adb por Wi-Fi (rascunho)

Nada disto foi executado. É o roteiro para a próxima fase, sem mudar código.

- O app habilita a depuração do WebView (`android/src/com/imagefilter/xcloud/MainActivity.java:57`, `setWebContentsDebuggingEnabled(true)`).
- A medição exportada vai para `Downloads/xCloud ImageFilter` (`MainActivity.java:143-158`).
- O repositório já tem as peças:
  - `tools/device/spec2/perfetto-linha-do-tempo.pbtx`;
  - `tools/device/spec2/pftrace.py --work/--frames`;
  - o padrão de Perfetto de `tools/device/spec2/sweep.cjs`;
  - `pocoState` (térmico e bateria) em `tools/device/spec2/drive.cjs`;
  - o `adb forward` para o DevTools em `tools/device/run-in-webview.cjs`.

### 9.1 Ordem sugerida

| Passo | Ação | Registrar |
| --- | --- | --- |
| 0 | Parear e conectar (Opções do desenvolvedor → Depuração por Wi-Fi) | `adb devices -l` |
| 1 | Fixar versões: commit, APK, WebView/Chrome, `BxBuild.sourceSha256` | anotar no relatório |
| 2 | DevTools remoto → snippet de estado (9.3) | `floatTargets`, `ext`, `budget`, `status.resolution`, `status.net` |
| 3 | Condições iniciais: `thermalservice`, `battery` | estado térmico 0; temperatura; carregando ou não |
| 4 | Taxa da tela fixa em 60 Hz (painel do app) | `metadata.screen` no export; `dumpsys display` |
| 5 | Perfetto longo no aparelho (frametimeline + `gpu_work_period`) | ocupação; jank por layer |
| 6 | Painel → "Iniciar medição"; fechar o painel; HUD desligado ou compacto; **desconectar o DevTools** | — |
| 7 | Série de 10–20 min, uma variável por vez, ABAB a cada 2–3 min | horários das trocas e dos engasgos percebidos; bitrate em **Mb/s** |
| 8 | Térmico a cada 30 s em paralelo | temperatura e status por horário |
| 9 | "Encerrar e exportar medição"; puxar o JSON e o `.pftrace`; "Copiar configuração" | segments e timeline |
| 10 | Janela curta (18 s) num engasgo: Perfetto curto + DevTools Performance + LoAF + 3º rVFC | sched, frametimeline, GC, tarefas longas, CPU e folga por quadro |

Variáveis, uma de cada vez e na mesma cena:
- (a) neural 100% × 0%;
- (b) Fluidez desligada × Equilibrada × Equilibrada + Direta;
- (c) 60 × 120 Hz;
- (d) Comparação Original × Tratada, como linha de base do `<video>`;
- (e) "Aliviar GPU" Nunca × 6 ms;
- (f) Nativa × Auto, e com Auto, EASU × SGSR (`effective.scaler`).

Faça um jogo a 30 FPS e outro a 60 FPS.

**Cuidado** [hipótese]: adb e DevTools por Wi-Fi dividem o rádio com o stream. Na série longa, deixe o DevTools desconectado e só puxe os arquivos no fim.

### 9.2 Comandos

```sh
# Pareamento e conexão
adb pair IP:PORTA_DE_PAREAMENTO
adb connect IP:PORTA_DA_DEPURACAO
adb devices -l

# Versões
adb shell dumpsys package com.imagefilter.xcloud | grep versionName
adb shell dumpsys webviewupdate | grep -i "current webview"

# DevTools remoto (ou simplesmente chrome://inspect#devices)
adb shell cat /proc/net/unix | grep devtools_remote
adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>

# Térmico, bateria e taxa da tela
adb shell dumpsys thermalservice
adb shell dumpsys battery
adb shell dumpsys display | grep -i -E "refresh|activemode"

# Perfetto longo (padrão de tools/device/spec2/sweep.cjs)
cat > longa.pbtx <<'EOF'
buffers { size_kb: 65536 fill_policy: RING_BUFFER }
duration_ms: 1200000
write_into_file: true
file_write_period_ms: 2500
data_sources { config { name: "android.surfaceflinger.frametimeline" } }
data_sources { config { name: "linux.ftrace" ftrace_config { ftrace_events: "power/gpu_work_period" } } }
EOF
adb push longa.pbtx /data/local/tmp/longa.pbtx
adb shell "cat /data/local/tmp/longa.pbtx | perfetto --background --txt -c - -o /data/misc/perfetto-traces/longa.pftrace"
adb pull /data/misc/perfetto-traces/longa.pftrace
python3 tools/device/spec2/pftrace.py --work longa.pftrace
python3 tools/device/spec2/pftrace.py --frames longa.pftrace

# Térmico a cada 30 s
while true; do date +%T; adb shell dumpsys thermalservice | grep -E "Thermal Status|mName=(skin|CPU0|GPU0)"; sleep 30; done > termico.log

# Logs e quadros
adb logcat -v time | grep -E "chromium|BxImageFilter|Bx Restoration|BxRestoration"
adb shell dumpsys gfxinfo com.imagefilter.xcloud reset
adb shell dumpsys gfxinfo com.imagefilter.xcloud

# Medição exportada
adb pull "/sdcard/Download/xCloud ImageFilter/"
```

### 9.3 Snippets de console (DevTools remoto)

```js
// Estado do motor e do orçamento
const P=BxImageFilter.playHost.player(),E=P.bxEngine;
({build:BxBuild.sourceSha256.slice(0,8),fps:P.targetFps,timer:!!E.ext,parallel:!!E.parallelCompile,
  precision:E.spatialPrecision,float:E.floatTargets,
  variants:Object.keys(E.programs).filter(k=>k.startsWith('spatial@')),targets:Object.keys(E.targets),
  budget:{limit:E.budget.limitMs,neural:E.budget.neuralAllowed,rev:E.budget.revision,reason:E.budget.reason,
          debandScale:E.budget.debandScale,cleanup:E.budget.cleanupAllowed,enhance:E.budget.enhanceAllowed},
  effective:{cleanup:E.budget.settings.cleanup,deband:E.budget.settings.deband,detail:E.budget.settings.detail},
  resolution:BxImageFilter.status.resolution,display:BxImageFilter.status.display,net:BxImageFilter.status.net,
  adaptive:BxImageFilter.status.adaptive,renderer:BxImageFilter.status.renderer});

// Plano exato do quadro atual
(()=>{const S=BxImageFilter.status,[w,h,ow,oh]=S.resolution.match(/[0-9]+/g).map(Number);
  return BxRestoration.framePlan(E.budget.settings,E.budget,w,h,ow,oh,E.floatTargets);})();

// 3º callback rVFC: CPU, folga até o vsync, pulos, receive→apresentação
const v=P.$video,SAMP=[];let last=null;
const f=(now,m)=>{const t=performance.now();SAMP.push({cpu:t-now,slack:m.expectedDisplayTime-t,
  skip:last==null?0:m.presentedFrames-last-1,pipe:m.receiveTime?m.presentationTime-m.receiveTime:null});
  last=m.presentedFrames;if(SAMP.length<3600)v.requestVideoFrameCallback(f);};
v.requestVideoFrameCallback(f);
// depois:
// const q=(k,p)=>{const a=SAMP.map(x=>x[k]).filter(Number.isFinite).sort((a,b)=>a-b);return a[Math.ceil(a.length*p)-1];};
// ['cpu','slack','pipe'].map(k=>[k,q(k,.5),q(k,.95),q(k,.99)]);

// Tarefas longas (LoAF)
new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>50)console.log('LoAF',Math.round(e.duration),
  Math.round(e.blockingDuration),e.scripts.map(s=>(s.sourceFunctionName||s.invoker)+':'+Math.round(s.duration)).join(' '));})
  .observe({type:'long-animation-frame',buffered:true});
```

## 10. Ranking impacto × esforço × risco (provisório; só P0)

| # | Ação (fase de testes, sem código) | Impacto | Esforço | Risco |
|---|---|---|---|---|
| 1 | Confirmar resolução recebida, `floatTargets` e `budget.revision` antes de qualquer A/B visual | alto | baixo | baixo |
| 2 | Fazer A/B com "Aliviar GPU = Nunca", ou conferir `revision` 0, para a redução por cadência não contaminar | alto | baixo | baixo |
| 3 | Comparar Nativa × Auto e, em Auto, EASU × SGSR (`effective.scaler`) | alto | baixo | baixo |
| 4 | A/B de fluidez neural 100% × 0% a 30 e 60 FPS, com Perfetto | alto | baixo | baixo |
| 5 | Linha de base Original × Tratada a 30 FPS: separar o ritmo do `<video>` do custo do tratamento | alto | baixo | baixo |
| 6 | Fixar 60 Hz e testar 120 Hz como variável à parte | médio | baixo | baixo |
| 7 | Fluidez + Captura Direta a 60 FPS (pulos do `<video>`) | médio | baixo | médio |

Candidatos de código para a fase 2, **só após aprovação**:

| # | Mudança | Impacto | Esforço | Risco |
|---|---|---|---|---|
| a | Instrumentação mínima (3.5: passes, passe final, `budget.reason` na exportação, eventos, CPU por quadro, folga do vsync) | alto | baixo | baixo |
| b | Pré-aquecer a variante do spatial dos ajustes salvos | médio | baixo | baixo |
| c | Avisar no painel e no HUD quando a neural não roda (`floatTargets`) ou foi cortada | médio | baixo | baixo |
| d | Worker para o render | alto (se LoAF confirmar) | alto | alto |

## 11. Ambiguidades do relato

| Relato | Interpretação | Efeito no código | Como confirmar |
| --- | --- | --- | --- |
| "tempo entre quadros alto" | A) "Aliviar GPU acima de" = 10 ms | igual a 3 e 6 ms no Poco: só a cadência atua; pode cortar a neural primeiro | `settings.gpuBudget` ("Copiar configuração") |
| | B) "Aliviar GPU" = Nunca (0) | nenhum corte; uma sobrecarga de GPU persiste | idem |
| | C) Suavidade 33/50 ms | buffer WebRTC maior: chegada mais regular, mais latência; mesma GPU | `status.smoothing` |
| | D) "Ritmo na tela" alto no HUD/painel | métrica de CPU (F4); a 30 FPS existe até sem filtro (F3) | export: display p95 × arrival p95 |
| "adaptação desligada" | A) "Adaptar à compressão" = desligado | intensidades literais 0,3/1/1 | `settings.adaptive` |
| | B) "Aliviar GPU" = Nunca | sem corte automático | `settings.gpuBudget === 0` |
| bitrate "~18" | provavelmente Mb/s | o painel mostra `bitrateMbps` | `status.net.bitrateMbps`; `timeline[].bitrateMbps` |
