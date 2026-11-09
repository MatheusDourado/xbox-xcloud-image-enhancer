# Auditoria do pipeline no play.xbox.com — fase 1 (sem alteração de código)

> **Status: em andamento.** Este documento é preenchido à medida que a auditoria avança.
>
> | Frente (doc de diagnóstico de 09/11/2026) | Investigação | Verificação adversarial |
> | --- | --- | --- |
> | P0 — O que realmente roda (framePlan, bypasses, resolução) | concluída | pendente |
> | P0 — Frametime, captura e apresentação | concluída | pendente |
> | P1 — Microdetalhe × ruído/cintilação; redundância de realce | concluída | pendente |
> | P1 — Rede neural atual (baseline) | concluída | pendente |
> | P2 — Compressão, Degradês, AA e croma | concluída | pendente |
> | P2 — Renderizador e checagem das afirmações do diagnóstico | concluída | pendente |
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
9. **Dither com Degradês ligado.** [código] Spatial e passe final usam o mesmo ruído na mesma coordenada.
   - *Corrigido pelas frentes P1/P2:* não há soma. O spatial grava inteiros em RGBA8, e o segundo dither (|n| < 0,5 nível) arredonda de volta ao mesmo valor onde a nitidez não mudou nada.
   - O resultado é um único dither fixo, ≤ 1 nível. Não é causa de ruído nem de cintilação.
   - A visibilidade em gradiente escuro é [teste no Poco] (6.2, F9).
10. **A medição exportada já permite deduzir quais passes rodaram, mas não registra o essencial para a fase 2.** [código] Faltam a lista de passes, o tempo por passe, o motivo da redução automática e a variante do `spatial` (seção 2.9).
11. **Detalhe 100% e a nitidez USM realçam a mesma banda.**
    - [código] Nos eixos, o termo `fine` do Detalhe tem **exatamente** a mesma resposta em frequência do passa-alta do USM, `(1−cos ω)/2`; no plano 2D a semelhança é 0,978.
    - Só o `fine` a 100% já equivale a Nitidez ≈ 4,3. Somado ao USM 2, o termo linear equivale a Nitidez ≈ 6,3, a faixa que a v9.1 associou a halos e cintilação.
    - A única parte não redundante do Detalhe é o `clarity`, que age em períodos de 6–16 px.
12. **A rede neural a 100% não realça; ela atenua textura fraca.** [código, emulação com os pesos do repositório] Grades de 1–4 níveis saem com 0,26–0,9× da amplitude. Detalhe e USM depois reamplificam o que sobra.
13. **Degradês 100% apaga e, em alguns períodos, inverte textura fraca (1–7 níveis).** [código] Raio de 8 px e limiar de "plano" de até 13 níveis. Pelo mecanismo `untouched`, ele também **desliga o Detalhe** em 20–26% dos pixels de textura fraca.
14. **Juntos, os itens 11–13 formam uma expansão de amplitude.** A microtextura sutil some e a textura média fica exagerada (1,4–2,3×). É uma causa plausível [hipótese] do aspecto "pouco natural".
15. **A configuração relatada está fora de tudo o que já foi medido.** [doc] O Detalhe só foi medido a 0 e 20%, a rede só a 50%, e o Degradês 100% só num clipe de céu. Rede 1 + Detalhe 1 + Degradês 1 nunca foi medida.
    - Na bancada, Detalhe 20% sobre o USM já soma +6–7% de cintilação, contra +1,5% sem o USM: a interação é multiplicativa.
    - A emulação estima cintilação ×1,6–1,8 para Detalhe 1 + USM 2. É um proxy pessimista.
16. **A intensidade do Detalhe e da rede não muda o custo de GPU** [código]. Só ligar ou desligar muda, porque a variante compilada é a mesma. Baixar o Detalhe de 100% para 20–35% é neutro para o stutter.
17. **A rede neural custa caro e o ganho medido é pequeno.**
    - [doc] +5,2 ms/quadro (+45%) em sessão a 30 FPS na bancada do Poco: mais que o spatial padrão inteiro. A dica do painel diz "~30%".
    - [doc] Na mesma nitidez, a bancada mediu SSIM e PSNR iguais e **halo +18%**. A cintilação com a rede não é medida desde a v9.1.
    - [código] Pesos e shaders são os mesmos da v9.1; o treino é sintético, sem perda temporal e sem dados do encoder do xCloud.
    - [código] Ela roda em highp no Adreno.
18. **A dica do painel "Com Reconstrução neural, use Nitidez ~2,5" ficou invertida.** [código] Era para baixar de 3; com o padrão atual em 2, ela leva a **subir** a nitidez.
19. **Compressão 30% quase não age a ~18 Mb/s.** [código] Ela só trata degraus monótonos de 1 px (~2–25 níveis) entre lados lisos, e não remove ringing nem mosquito, apesar do que a dica do painel promete. [doc] Na bancada, o ganho foi nulo entre 5 e 20 Mb/s, ao custo de +2,4 ms em sessão. Recomendação: 0%, confirmando com A/B.
20. **Degradês 100% rende pouco a mais que 60%.** [doc] O banding cai −14% contra −11%. [código] Em troca, ele apaga 79%/51%/14% da textura com 1/2/3 níveis pico a pico, e nada depois a devolve. Recomendação: 60%, ou 30% se a prioridade for textura, decidindo com A/B.
21. **A direção do AA está espelhada.** [código, conferido à mão] Com os vizinhos lidos com y para cima, `dir ∝ (b, a)` para uma rampa `a·x + b·y`, enquanto a tangente da borda é `(−b, a)`.
    - A 45°, o AA amostra **através** da borda e desfoca, em vez de suavizar o serrilhado. O mesmo vale para `src/shaders/antialias.glsl`.
    - Isso explica o "AA não trouxe benefício". Não afeta a configuração atual (AA 0). Correção para a fase 2.
22. **"Cor nas bordas" já é um CfL local que preserva a luma Rec.709 exatamente.** [código] O CfL Lite pendente é um filtro novo de teto baixo (+0,08 dB de croma na bancada) e não recupera luma. Só faz sentido se sobrar franja de cor visível com 75%.
23. **Com "WebGPU" escolhido no site novo, a imagem tratada pode sair do lugar.** [código] O canvas WebGPU não recebe a classe `bxif-play-canvas` e fica sem posicionamento (7.2, R3). Não use WebGPU no `play.xbox.com` para comparar até corrigir. Com a rede ligada, o quadro é sempre WebGL2.
24. **Trocar o renderizador no meio de uma medição perde a medição** [código] (7.2, R10).
25. **Da seção 2 do diagnóstico, as afirmações 1–4 estão corretas.** A 5 é parcialmente correta: o treino é em luma de cenas sintéticas, e a acumulação temporal piora o PSNR. A 6 está correta, mas omite que o Worker foi confirmado em bancada (7.3).

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

**Método.** As respostas em frequência são analíticas. Os ganhos efetivos, o ruído e a cintilação vêm de uma **emulação numpy dos shaders**: pesos reais da rede, coring, limites e quantização em 8 bits entre passes.
- A emulação reproduz regressões documentadas: onda quadrada ±6 → amplitude 12→16 e degrau 100/120 entre 98 e 122 (`docs/validation-v8.5.md:27`, `:30`).
- Ela roda em float64, sem o `mediump` do Adreno.
- Na cintilação, usa ruído novo a cada quadro, o que é mais pessimista que os quadros P do H.264.
- Os números de emulação são indicativos. Os de bancada vêm de `docs/medicoes/spec2/ganho-visual*.json`: clipe game30, H.264 9 Mb/s, SwiftShader.

### 4.1 Etapas que tocam alta frequência na configuração relatada

| # | Etapa | Código | Efeito (luma) | Limites / máscaras | Saída |
|---|---|---|---|---|---|
| 1 | Rede neural, força 1 | `src/restoration-engine.js:529-533`; `tools/nn_glsl.py:24-37` | residual aprendido: **atenua** AF de 1–4 níveis; ~neutro a partir de 16 níveis; ~3 níveis de overshoot em degrau duro | **nenhum limite local** (só clamp 0–1) | `neural` RGBA8, sem dither |
| 2 | Compressão 0,3 | `src/shaders/spatial.glsl:53-66` | média com o vizinho num degrau pequeno; mistura ≤ 0,24 | `1−textureMask`, `smoothSides`, `confidence` | — |
| 3 | Degradês 1 | `spatial.glsl:68-84` | média de 4 taps a ≈ 8,9 px; mistura ≤ 0,8 | "plano" até 13,3 níveis; peso por tap; `1−textureMask` | — |
| 4 | Cor nas bordas 0,75 (suposto) | `spatial.glsl:86-107` | só croma | `inside`; span ≥ 4/255 | — |
| 5 | Detalhe 1 | `spatial.glsl:109-135` | `dL = 1,2·fine + 0,8·clarity` | coring `t`; `untouched`; gate de faixa larga; ±2 níveis | RGBA8 + dither |
| 6 | USM (`casFiltered`, Nitidez 2) | `script.js:264` + `tools/build.py:10-17`, `:35-49` | `e + 0,556·(e − G3×3)` | `noiseFloor` 4/255; `haloMargin` 4/255; `lumaSharpen` | canvas + o mesmo dither |

### 4.2 Redundância: `fine` (Detalhe) ≡ passa-alta do USM nos eixos

[código] As duas fórmulas:
- `fine = c − ¼(W+E+S+N)` (`spatial.glsl:122`), com resposta `F = 1 − ½(cos ωx + cos ωy)`.
- O USM do upstream usa o binomial `G = [1 2 1; 2 4 2; 1 2 1]/16` e `e + (e−G)·sharpenFactor/3` (`script.js:264`), com `k = 0,556` para Nitidez 2. Sua parte passa-alta vale `1 − cos²(ωx/2)·cos²(ωy/2)`.

Em qualquer frequência horizontal ou vertical, as duas valem `(1−cos ω)/2`, com diferença numérica de 1e-16. Elas só divergem na diagonal.

Como `k_USM = Nitidez/3,6`, o termo `1,2·fine` do Detalhe 100% equivale **sozinho a Nitidez ≈ 4,3**. Em cascata com USM 2, o termo linear equivale a Nitidez ≈ 6,3.

Se o Método for CAS, em baixo contraste ele também vira `e + 2,08·fine`: o mesmo núcleo.

| Frequência | Período | USM−1 | `fine` | `clarity` | H_USM | H_Detalhe | Detalhe × USM |
|---|---|---|---|---|---|---|---|
| Nyquist (eixo) | 2 px | 0,556 | 1,000 | 1,000 | 1,556 | 3,000 | 4,667 |
| ½ Nyquist | 4 px | 0,278 | 0,500 | 1,000 | 1,278 | 2,400 | 3,067 |
| ¼ Nyquist | 8 px | 0,081 | 0,146 | 1,177 | 1,081 | 2,117 | 2,289 |
| ⅛ Nyquist | 16 px | 0,021 | 0,038 | 0,439 | 1,021 | 1,397 | 1,427 |
| 1/16 Nyquist | 32 px | 0,005 | 0,010 | 0,121 | 1,005 | 1,109 | 1,114 |
| Xadrez (π,π) | diagonal | 0,556 | 2,000 | 1,000 | 1,556 | 4,200 | 6,533 |

**O `clarity` é a parte não redundante** [código]:
- É o centro menos a média de 8 amostras bilineares a 2,5–3,5 px; o filtro LINEAR transforma cada amostra num bloco 2×2.
- Tem máximo de 1,38 em período de 5,9 px e age onde o USM quase não age (6–16 px).
- Hipótese para a fase 2, a medir antes: dar ao `fine` peso bem menor que ao `clarity`.

### 4.3 Ganho efetivo (com coring e limites; emulação)

O ganho é a razão entre amplitude de saída e de entrada; valor negativo significa fase invertida. A tabela compara a configuração relatada (rede 1, Compressão 0,3, Degradês 1, Detalhe 1, USM 2) com estágios isolados.

| Amplitude | Cadeia | p2 | p4 | p6 | p8 | p16 | xadrez |
|---|---|---|---|---|---|---|---|
| 2 níveis | USM 2 | 1,00 | 1,00 | 1,00 | 1,00 | 1,00 | 1,00 |
| 2 níveis | Rede 1 | 0,26 | 0,54 | 0,77 | 0,86 | 0,97 | −0,02 |
| 2 níveis | **Configuração relatada** | 0,26 | 0,54 | −0,13 | 0,26 | −0,10 | −0,02 |
| 4 níveis | USM 2 | 1,56 | 1,00 | 1,02 | 1,00 | 1,00 | 1,56 |
| 4 níveis | Detalhe 1 + USM 2 | 2,33 | 1,52 | 1,44 | 1,45 | 1,01 | 2,33 |
| 4 níveis | Degradês 1 + Compressão 0,3 | 1,00 | 1,00 | 0,42 | 0,67 | 0,40 | 1,00 |
| 4 níveis | Natural (Degradês 0,6 + USM 2) | 1,56 | 1,02 | 0,93 | 0,86 | 0,92 | 1,56 |
| 4 níveis | **Configuração relatada** | 1,35 | 1,00 | 0,26 | 0,75 | 0,37 | 0,93 |
| 8 níveis | USM 2 | 1,50 | 1,28 | 1,05 | 1,04 | 1,00 | 1,50 |
| 8 níveis | **Configuração relatada** | 1,59 | 1,52 | 1,39 | 1,49 | 1,07 | 1,37 |
| 16 níveis | **Configuração relatada** | 1,37 | 1,41 | 1,51 | 1,45 | 1,16 | 1,16 |

Leitura: textura de **2–4 níveis** (microtextura sutil) sai **atenuada ou com fase invertida**, enquanto a de **8–16 níveis** sai **1,4–1,6× mais forte**. Isso é expansão de amplitude.

### 4.4 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| M1 | [código] | Cadeia montada: rede → spatial (Compressão, Degradês, Cor, Detalhe) → USM. Três quantizações em 8 bits depois do upload. No site novo, `processingMode` fica em performance, então o alvo `neural` é RGBA8. | alto |
| M2 | [código] | Redundância exata `fine` ≡ USM nos eixos (4.2). Detalhe 100% mais que duplica o realce que o USM já faz em 2–4 px. | alto |
| M3 | [código] | O `clarity` é a única parte não redundante (banda de 6–16 px). | médio |
| M4 | [código, emulação] | Ganho efetivo de Detalhe 1 + USM 2 em textura média e fina: ~1,4–2,3×, contra 1,0–1,56× do USM sozinho. | alto |
| M5 | [código, emulação] | A rede a 100% **atenua** textura de 1–4 níveis, mais forte em sombras, e põe ~3 níveis de overshoot em degrau duro. [doc] Rede 50% na bancada: `detail` 0,9516 → 0,9546, `energy` igual, **halo +18%**. | alto |
| M6 | [código] | Degradês 100%: raio 8, taps em `floor(d·8)`. A `textureMask` só protege extremos de raio 1. Uma grade de período 6 ou 16 px com 1 nível sai com **−0,2×** (fase invertida); com 4 níveis, 0,40–0,67×. Textura aleatória de σ 2–3 níveis cai para 0,77–0,87× (contra 0,91–0,97× com 0,6). | alto |
| M7 | [código, emulação] | `untouched` (`spatial.glsl:115-116`): onde Compressão, Degradês ou Cor mexeram ≥ 2 níveis, o Detalhe é zerado. Com Degradês 1, isso atinge 20–26% dos pixels de textura fraca (0–2% com 0,6). Resultado [hipótese]: um mosaico alisado/realçado que muda a cada quadro ("fervilhamento"). | médio |
| M8 | [código] | Quantização RGBA8 e dither nas duas passadas: impacto **pequeno**; o segundo dither não altera valores inteiros (6.2, F9). O `noiseFloor` do USM não realça o dither em área plana, e o padrão é fixo, então não pisca. Não priorizar. | baixo |
| M9 | [doc] + [hipótese] | Cintilação: todo o realce é espacial e vem antes do temporal, e o USM final reamplifica o resíduo. Na bancada, Detalhe 20% custa 4–5× mais cintilação com USM que sem ele. O temporal reduz só 1,5–2,7%, a +8,3 ms de GPU no Poco. Detalhe 100% nunca foi medido; a emulação estima ×1,6–1,8. | alto |
| M10 | [teste no Poco] | A cadeia é bimodal no ruído: com σ ≤ 2 níveis limpa (0,44–0,68×, graças à rede e ao Degradês); com σ ≥ 3 **amplifica** (1,21–1,33×). Parado a 18 Mb/s ela mascara o excesso; em panorâmica e sombra, quando o QP sobe, amplifica. O coring só foi validado contra ±1 nível. | alto |
| M11 | [código, emulação] | Halos: os limites se empilham (Detalhe ±2 níveis + USM ±4) e a rede não tem teto local. Degrau duro 60→140: −9,3/+8,6 níveis (USM sozinho ±4). O `clarity` cria uma faixa de ±2 níveis com 3–4 px de largura em bordas de 20–100 níveis. Os limites controlam a amplitude, não a largura nem a naturalidade. | médio |
| M12 | [código] | Faltam máscaras: não há máscara de movimento (`motion`/`cut` só rodam com temporal>0), nem máscara por luma (a rede age mais nas sombras), nem proteção de textura fraca no Degradês além de extremos. A adaptação por compressão é lenta demais (EMA de ~1 s ou p80 de 60 s) para panorâmicas. | médio |
| M13 | [doc] | A configuração está fora da faixa medida (item 15 do resumo). `tools/eval/search.py:14` tinha Detalhe até 1, mas os resultados não estão versionados. | alto |
| M14 | [código] | Intensidade de Detalhe e rede **não muda a GPU** (`spatialProfile`: `detail>0`; `strength` é uniform). Só zerar muda o custo. Só o Detalhe faz 16 leituras/px ≈ 33,2 M por quadro em 1080p. | médio |
| M15 | [código] | A métrica `detail` da bancada (`tools/eval/run_eval.py:45-46`) usa **o mesmo núcleo do `fine`**, então o próprio Detalhe a infla. Ela precisa de guardas (`energy/detail`, halo, cintilação). Falta uma métrica de textura de baixo contraste. | médio |
| M16 | [teste no Poco] + [doc] | Em Nativa a nitidez é feita na resolução do stream e esticada pelo compositor. Na bancada, "filtros em 1080, depois esticado" deu `detail` 0,589, contra 0,668 com USM 2 em 1280 e 0,611 com SGSR sem Detalhe (`docs/spec2-estudo.md:225-234`). Hipótese: parte do "preciso de Detalhe 100%" é compensação desse esticamento. | alto |

### 4.5 Ruído e cintilação (emulação; proxy pessimista)

| Cadeia | Cintilação ×entrada (textura σ 3) | (σ 6) | (σ 12) |
|---|---|---|---|
| Sem filtro | 1,00 | 1,00 | 1,00 |
| USM 2 | 1,11 | 1,25 | 1,28 |
| Natural (Degradês 0,6 + USM 2) | 1,13 | 1,26 | 1,29 |
| Degradês 0,6 + Detalhe 0,2 + USM 2 | 1,23 | 1,38 | 1,41 |
| Degradês 0,6 + Detalhe 1 + USM 2 | 1,63 | 1,76 | 1,73 |
| **Configuração relatada** | **1,07** | **1,57** | **1,69** |
| Relatada com Detalhe 0,35 | 0,87 | 1,29 | 1,45 |
| Relatada com Nitidez 1 | 1,00 | 1,40 | 1,53 |
| Relatada com Degradês 0,6 | 1,20 | 1,54 | 1,68 |

**Bancada versionada** (game30, 9 Mb/s, sequência de 18 quadros; `ganho-visual.json:461`, `ganho-visual-2.json:326`):

| Configuração | `detail` | `energy` | halo | SSIM | Cintilação |
|---|---|---|---|---|---|
| Stream sem filtro | 0,680 | 0,691 | 0,039 | 0,9393 | 3,77 |
| Detalhe 20% sem nitidez | 0,711 | 0,768 | 0,054 | 0,9391 | 3,82 (+1,5%) |
| USM 2 sem Detalhe | 0,865 | 1,153 | 0,269 | 0,9351 | 4,16 (+10%) |
| USM 2 + Detalhe 20% | 0,902 | 1,288 | 0,354 | 0,9306 | 4,42 (+17%) |
| USM 3 sem Detalhe | 0,939 | 1,385 | 0,436 | 0,9301 | 4,53 (+20%) |
| USM 3 + Detalhe 20% (padrão v9) | 0,977 | 1,543 | 0,557 | 0,9238 | 4,85 (+29%) |
| Padrão v9 + Temporal 50% | 0,968 | 1,510 | 0,538 | 0,9249 | 4,78 |
| Padrão v9 + Rede 50% (sem sequência) | 0,955 | 1,520 | 0,792 | 0,9255 | não medida |

### 4.6 Menor experimento (resposta à pergunta 6, lado visual)

**Etapa 1 — bancada, sem aparelho e só com ferramentas existentes.**
1. Gerar o clipe game30 (`tools/device/spec2/gen-video.js` + `server.py`).
2. Avaliar com `tools/eval/run_eval.py`:
   - `Evaluator.score` dá SSIM, `detail`, `energy` e halo;
   - `Evaluator.sequence(cfg, scenes=['caverna','rocha','noite'], start=150, end=168, measure_from=8)` dá a cintilação, como em `tools/device/spec2/eval_gain2.py:48-51`.

A matriz parte de **U** = configuração relatada e muda uma variável por vez:

| # | Configuração | Pergunta | GPU em relação a U |
|---|---|---|---|
| 1 | Sem filtro | âncora | — |
| 2 | Natural (preset) | âncora medida | menor |
| 3 | U | linha de base | = |
| 4 | U com Detalhe 0,35 | redundância `fine` × USM | = (mesma variante) |
| 5 | U com Detalhe 0,2 | idem, valor medido na v9 | = |
| 6 | U com Degradês 0,6 | textura fraca × Degradês 100% | = |
| 7 | U com Rede 0 | contribuição da rede | − 2 passes |
| 8 (opcional) | U com Nitidez 1 | USM × Detalhe | = |

**Critério fixado antes de rodar.** Há "microdetalhe melhor" quando `detail ≥ detail(Natural) + 0,02`, desde que:
- `energy/detail` ≤ o do Natural;
- halo ≤ Natural + 10%;
- cintilação ≤ Natural, com tolerância de +2%.

As guardas são obrigatórias porque `detail` é inflado pelo próprio Detalhe (M15). As configurações 3–6 e 8 são neutras em GPU por construção (M14).

**Etapa 2 — no Poco** (adb Wi-Fi + `chrome://inspect`):
- Na mesma cena: 30 s parado + 30 s girando a câmera, ABAB entre U e o melhor candidato da bancada, com medição ligada.
- Proxy de cintilação: 10 capturas `adb exec-out screencap -p` por configuração, incluindo Comparação = Original, e a média de |ΔY| entre capturas consecutivas num recorte estático e texturizado, como razão contra Original.
- A captura inclui o esticamento do compositor e não é sincronizada com o quadro.
- O clipe real é necessário para saber em qual regime de ruído o stream de ~18 Mb/s está (M10).
- O repositório não tem ferramenta para capturar os quadros decodificados do `play.xbox.com`. MediaRecorder ou `screenrecord` recodificam [hipótese de uso].

## 5. P1 — Rede neural atual (baseline)

**Conclusão da frente:**
- A rede atual é pequena: 208 MAC/px, campo receptivo de 5×5 px.
- Pesos e shaders não mudaram desde a v9.1 (único commit `9e72d0a`).
- Ela custa caro no Poco: +5,2 ms/quadro na bancada a 30 FPS, +45%.
- O ganho visual documentado é pequeno e, na mesma nitidez, aparece como **halo +18%**.
- Aplicada a sinais sintéticos, ela **atenua textura fina de baixo contraste**.
- Antes de pensar numa rede nova, é preciso medir a atual no Poco (5.5).

### 5.1 Arquitetura e custo pelo código

| Camada | Operação | Canais | MAC/px | Passada | Precisão | Armazenamento |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | luma BT.709 dos 9 vizinhos | 3→1 | 27 MAD | nnFeatures | highp | registradores |
| 1 | conv 3×3 + ReLU | 1→8 | 72 | nnFeatures | highp | registradores |
| 2 | conv 1×1 + ReLU | 8→8 | 64 | nnFeatures | highp | MRT 2×RGBA16F |
| 3 | conv 3×3 + residual (`Y + strength·dY`) | 8→1 | 72 | nnApply | highp | `neural` RGBA8 (performance) |
| **Total** | campo receptivo 5×5 | — | **208** (+17 bias) | 2 passadas | — | +41,5 MB de VRAM em 1080p |

O total equivale a 431 M MAC por quadro em 1080p: 12,9 G MAC/s a 30 FPS e 25,9 G MAC/s a 60 FPS.

**Leituras e banda em 1080p.** A contagem de leituras vem do código. Os bytes de DRAM são [hipótese]: supõem cache ideal, sem UBWC.

| Passada | Leituras/px | DRAM/px (estim.) | MB/quadro | GB/s a 30 FPS | GB/s a 60 FPS |
| --- | --- | --- | --- | --- | --- |
| nnFeatures | 9 (RGBA8) | 20 | 41,5 | 1,24 | 2,49 |
| nnApply | 18 (RGBA16F) + 1 | 24 | 49,8 | 1,49 | 2,99 |
| **Rede** | **28** | **44** | **91,2** | **2,74** | **5,47** |
| Caminho sem rede (upload + spatial + final) | 40 | 20 | 41,5 | 1,24 | 2,49 |
| Caminho com rede | 68 | 64 | 132,7 | 3,98 | 7,96 |

Corroboração indireta [doc]: no Poco, uma cópia RGBA16F custa 2,4× a mesma cópia em RGBA8 (`docs/medicoes/spec2/poco-passes-r1.json`).

### 5.2 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| N1 | [código] | Arquitetura 3 camadas / 8 canais / 5×5 (`tools/nn_glsl.py:3-37`; o gerador recusa outra arquitetura). Os shaders no userscript do site novo batem byte a byte com `generate('src/nn/restore.json')`. Um campo de 5×5 não cobre um bloco 8×8: a rede corrige transições locais e ruído, mas não reconstrói textura descartada pelo encoder (coerente com `docs/analysis-v9.1.md:38`). | médio |
| N2 | [código] | Ligar a rede aumenta as buscas de textura do tratamento em **+70%** (de 40 para 68 por pixel), 18 delas em RGBA16F. | médio |
| N3 | [hipótese] | Banda de DRAM ×3,2 com a rede: o custo viria em boa parte da ida e volta dos 32 B/px de features em fp16. Pesa em energia e temperatura. | médio |
| N4 | [código] | As duas passadas da rede são **highp**, enquanto o spatial e o SGSR usam `mediump` no Adreno (`tools/nn_glsl.py:20`; `src/restoration-engine.js:403`). Uma variante mediump é [hipótese] de ganho; o spatial ganhou −21%. Exige regressão contra o JAX. | médio |
| N5 | [código] | No site novo a rede roda em WebGL2 sob três condições: `filtered`, `EXT_color_buffer_float` e `neuralAllowed` (`:353-355`). Roda na resolução da **fonte**: um stream 720p custa 44% de um 1080p. A saída fica em RGBA8, porque o modo é sempre performance. Sem float targets, ela é pulada **sem aviso**. | alto |
| N6 | [código] | Na configuração relatada, a rede é a **primeira** etapa cortada pela cadência, e 3/6/10 ms se comportam igual. `adaptive=false` **não** afeta a rede. Só "Nunca" impede o corte (2.4). | alto |
| N7 | [código] | 100% é a saída treinada: não existe >1. A correção é só de luma, aplicada igual em RGB (Cb/Cr preservados). **5% custa o mesmo que 100%**: o único corte de custo é 0%. A adaptação por QP não modula a rede. | médio |
| N8 | [código, cálculo local] | Resposta com os pesos reais (5.3): ela **atenua** textura de 1–6 níveis em 2–4 px. Textura aleatória de σ 2/4/8/16 níveis sai com 0,61/0,77/0,91/1,00. Um degrau de 2 níveis vira rampa de ~3 px. Uma borda de 51 níveis ganha −2/+1 nível de sub e sobressinal. | alto |
| N9 | [código] | Treino:<br>**Existe**: 16 cenas sintéticas (texturas fora da avaliação, luz, degradê, HUD); pan de 4 px/quadro + zoom ±4%; x264 veryfast/zerolatency, sem B-frames, 8–25 Mb/s sorteados por cena; quadros P; perda L1 + 0,5·L1 do Laplaciano; 4000 passos (≈13 épocas); holdout das **mesmas** cenas.<br>**Não existe**: perda temporal ou entrada multi-quadro; perda perceptual; condicionamento por QP; treino ciente de fp16 ou quantização; dados de jogo real ou do encoder do xCloud; métrica de cintilação. As docstrings citam `docs/analysis-v10.md` e `docs/analysis-v8.7.md`, que **não existem**. | alto |
| N10 | [hipótese] | Domínio diferente do stream real. O xCloud só aceitou H.264 e recusou o perfil High (`docs/release-v9.3.md`, `release-v9.5.md`), enquanto o x264 do treino tende ao High. O treino cobre 0,064–0,201 bpp; os ~18 Mb/s dão 0,145 bpp a 60 FPS (dentro), mas **0,289 bpp a 30 FPS (acima)**. Num stream mais limpo, a rede pode tratar textura real como ruído. | médio |
| N11 | [doc] | Custo no Poco, sempre bancada: 1,96–2,21 ms (Spec 1, rajada, imagem sintética); 2,33–2,59 ms (Spec 2, rajada, quadros H.264); **+5,21 ms em sessão a 30 FPS** (11,48 → 16,69 ms, ocupação 34,3% → 50,1%). Em sessão, a rede custa mais que o spatial padrão inteiro. A dica do painel ("~30%") está subestimada. Não medido: 60 FPS, WebRTC, `play.xbox.com`, Chrome, a config relatada. | alto |
| N12 | [doc] | Ganho visual pequeno e confundido:<br>• v9.1: SSIM 0,930 → 0,934, mas comparando USM 3 com USM 2,5. Baixar só a nitidez (3 → 2) já reduz a cintilação em 9%.<br>• Spec 2, na **mesma** USM 3 e com rede 50%: SSIM 0,9258 → 0,9255, PSNR igual, `detail` 0,952 → 0,955, **halo +18%**.<br>• Não existe medição visual no Adreno: o SwiftShader roda tudo em highp. | alto |
| N13 | [doc] | A cintilação com a rede **não foi medida depois da v9.1**. As sequências da Spec 2 não incluem a rede. | alto |
| N14 | [código] | O que mudou desde a v9.1 em volta da rede (ela mesma não mudou): padrões, spatial em mediump com variantes, SGSR só com saída maior, WebGPU que devolve ao WebGL2, margem de cadência por caminho e o host do site novo sempre em performance. As medições da v9.1 **não valem como baseline** da v10. | médio |
| N15 | [código] | Dicas do painel desatualizadas: "~30% mais GPU" (`src/panel.js:814`, `:892`) e "Com Reconstrução neural, use ~2,5" (`:946`). Com o padrão atual em 2, esse texto leva a **subir** a nitidez. | baixo |
| N16 | [teste no Poco] | Antagonismo: rede, Compressão e Degradês suavizam a mesma faixa que Detalhe e USM reamplificam. A v9.1 só testou a rede com Detalhe 0,2. | alto |
| N17 | [código] | Não há interop WebGL2/WebGPU: são dois canvases, e um quadro com a rede troca o renderizador inteiro. Isso reinicia o pacer e a cadência. Com "WebGPU", ligar ou desligar a rede pode causar engasgo pontual. Para medir a rede, use WebGL2 ou Auto. | médio |
| N18 | [hipótese] | A rede em WebGPU (compute com tiles + `shader-f16`) é possível em tese. Mas o WebGPU já gastou mais que o WebGL2 no Poco, e `shader-f16` não foi testado. Não é ponto de partida. | médio |
| N19 | [doc] | Riscos de uma rede nova, pelo que a v9.1 já mostrou: a rede maior custou ~14× sem ganho; pesar o Laplaciano não gerou detalhe; a acumulação temporal piorou o PSNR. | alto |

### 5.3 Resposta da rede a sinais sintéticos

Cálculo local com os pesos do repositório: fp64, borda replicada, ganho = amplitude de saída ÷ entrada.

| Amplitude (níveis) | Período 2 px | 4 px | 8 px |
| --- | --- | --- | --- |
| 1 | 0,13 | 0,53 | 0,76 |
| 3 | 0,48 | 0,71 | 0,85 |
| 6 | 0,75 | 0,87 | 0,93 |
| 12 | 0,94 | 1,01 | 1,00 |
| 24 | 1,02 | 1,04 | 1,02 |

Ressalva: o cálculo não inclui a quantização RGBA8 da saída nem o fp16 dos features. A frente de microdetalhe (4.3) chegou a valores coerentes com uma emulação independente.

### 5.4 Ganho visual documentado (bancada em SwiftShader)

| Fonte | Comparação | SSIM | PSNR | detail | Halo | Cintilação |
| --- | --- | --- | --- | --- | --- | --- |
| `analysis-v9.1.md:44-45` | v9 (USM 3) → rede + USM 2,5 | 0,930 → 0,934 | 33,95 → 34,09 | ≈ 0,98 | 0,75 → 0,90 | 4,49 → 4,35 (confundido com a nitidez) |
| `ganho-visual.json` | 1080p, USM 3 igual, rede 0 → 0,5 | 0,9258 → 0,9255 | 35,69 → 35,69 | 0,952 → 0,955 | 0,671 → 0,792 (+18%) | não medida |
| `ganho-visual.json` | 1280p, USM 3 igual, rede 0 → 0,5 | 0,9198 → 0,9182 | 34,99 → 34,95 | 0,723 → 0,728 | 0,430 → 0,524 | não medida |
| `spec2-estudo.md:236` (controle) | USM 3 → USM 2, sem rede | — | — | — | — | 4,85 → 4,42 (−9%) |

### 5.5 Medição decisiva no Poco (baseline antes de qualquer rede nova)

1. Prepare a sessão: adb Wi-Fi + `chrome://inspect`, "Aliviar GPU" = **Nunca**, para a cadência não cortar a rede, e Renderizador = **WebGL2**.
2. Grave quatro segmentos de ~2 min na mesma cena, na ordem A-B-C-D-A, trocando com `BxImageFilter.update({neural, detail})`:

   | Segmento | Rede | Detalhe |
   |---|---|---|
   | A | 0 | 1 |
   | B | 1 | 1 |
   | C | 1 | 0 |
   | D | 0 | 0 |

3. Compare, por segmento:
   - `config.effective.neural`;
   - `gpu.p50/p95` (fence) e o `gpu_work_period` do Perfetto;
   - `display.p95/p99`, `hitches` e `videoSkipped`;
   - screencaps de cena parada, em recortes de vegetação, asfalto e tecido.
4. Anote também `net.codec`/`net.profile`, `timeline[].bitsPerPixel` e `net.fpsReceived`, e compare o bpp com a faixa de treino (0,064–0,201).
5. Critério: a rede fica só se a textura fina não perder contraste e se o ritmo não piorar em relação ao segmento sem rede.

## 6. P2 — Compressão, Degradês, AA e croma

As quatro etapas rodam numa única passada `spatial`, na resolução do stream, com alvo RGBA8 (variante `spatial@mediump.1.1.4.1.1.0.1.1`). Todas **suavizam**; nenhuma realça. A redundância de realce é assunto da seção 4.

### 6.1 Tabela por etapa

| Etapa (valor) | O que faz (código) | Leituras extras/px | Risco para microtextura | Benefício esperado a ~18 Mb/s | A/B sugerido |
| --- | --- | --- | --- | --- | --- |
| Base do `spatial` | centro + cruz + máscara de textura (`spatial.glsl:40-51`) | 5 | — | — | — |
| Compressão 30% | degrau de 1 px de ~2–25 níveis entre lados lisos, por eixo; mistura ≤ 24% | +4 (mesmos texels do Detalhe) | baixo; amacia até 24% bordas reais lisas de baixo contraste (HUD) | **~nulo** (bancada: nada a 5–20 Mb/s); não trata ringing nem mosquito | 0 × 30 × 100% (100% só para localizar) em céu ou sombra |
| Degradês 100% | 4 amostras fixas a ~8,9 px; limiar 1,5–13,3 níveis; mistura ≤ 80%; dither | +4 | **médio**: remove 79/51/14% da textura com 1/2/3 níveis p-p nos extremos; monótonos sem proteção; bloqueia Detalhe e USM | pequeno: banding −14% (100%) × −11% (60%) | 0 × 5% (só dither) × 60 × 100 em céu, neblina, caverna e asfalto |
| AA 0% | compilado fora (`SPATIAL_ANTIALIAS 0`); sem passada | 0 | nenhum desligado; ligado: alto (direção espelhada) | nenhum | não priorizar |
| Cor nas bordas 75% | CfL local de 2 amostras a ±2 px guiado pela luma; Y preservado | 0 (liso) ou +2 bilineares | muito baixo na luma; zera o Detalhe onde muda a cor > 2 níveis | pequeno: croma +0,08 dB (bancada) | 0 × 75 em HUD e texto vermelho/azul; WebGL2 × WebGPU com rede 0 |
| Detalhe 100% (P1) | realce de luma | +16 | (seção 4) | (seção 4) | (seção 4) |
| **Total** | | **29–31/px** | | | |

Leituras por quadro: 2.073.600 × 31 ≈ 64,3 M em 1080p e ≈ 28,6 M em 720p. Na bancada, o Degradês (4 leituras) custou **mais** que o Detalhe (16), então leitura não é proxy de tempo.

### 6.2 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| F1 | [código] | **Compressão** (`spatial.glsl:52-66`): sem grade de bloco. Fatores da mistura:<br>• `smallStep`: 1 nível → 0,03; 2 → 0,56; 3–10 → ~1; 20 → 0,30; ≥ 25,5 → 0.<br>• `smoothSides`: zera com variação vizinha > ~6 níveis.<br>• `confidence`: rejeita rampas.<br>A 30%, cada pixel anda até 12% do degrau, e o degrau cai no máximo 24%. | baixo |
| F2 | [código] | A Compressão **não remove ringing nem mosquito**: oscilações ativam a `textureMask` (0,82 com 3 níveis; 1 com ≥ 4), que zera a mistura. A dica "Remove blocos e ruído de compressão" (`src/panel.js:812`) promete mais do que faz. | baixo |
| F3 | [doc] | Ganho da Compressão ~nulo na bancada a 5–20 Mb/s ("nenhum, nem a 100% em 5 Mb/s"), ao custo de +2,4 ms em sessão (`docs/spec2-estudo.md:195`). Por isso o padrão da Spec 3 é 0. | médio |
| F4 | [hipótese] | Por que ela quase não age: o deblocking do H.264 transforma degraus em rampas, que o detector rejeita, e a rede, quando ligada, roda antes e limpa os degraus. Com a rede ligada, é redundância de custo. | baixo |
| F5 | [código] | **Degradês 100%**: raio `mix(2,8,1) = 8`, 4 amostras fixas em `(8,4)`, `(−8,−4)`, `(4,−8)`, `(−4,8)`. O limiar sobe para 13,3 níveis (9,2 com 0,6) e a mistura para até 80% (48% com 0,6). É a configuração mais agressiva do slider. O custo **não** depende do raio. | médio |
| F6 | [código] | O Degradês 100% apaga microtextura de 1–3 níveis em áreas quase lisas. Depois, `untouched` zera o Detalhe nesses pixels, e o USM não age abaixo de 4 níveis (`noiseFloor`). **Nada devolve a textura.** A 60%, a erosão cai para ~60% da de 100%. | médio |
| F7 | [doc] | O ganho do Degradês é pequeno: banding −5% (30%), −11% (60%), −14% (100%) nos clipes de céu da bancada. O custo é +3,9 ms em sessão. Mesmo a 100%, faixas mais largas que ~16 px continuam. O padrão de 60% consta como "pendente de validação" (`docs/spec3-implementacao.md:40`). | médio |
| F8 | [hipótese] | As amostras fixas podem gerar cópias tênues de uma borda deslocadas 4/8 px em degradê escuro. É improvável: a bancada testou um padrão rotacionado e o resultado foi "igual ao atual". | baixo |
| F9 | [código] | **Dither**: o mesmo ruído IGN estático na mesma coordenada nas duas passadas. O segundo **não altera valores inteiros**, então o efeito é um único dither de ≤ 1 nível (corrige o item 9 do resumo). Sem ele, os subdegraus de 0,2 nível do Degradês se perderiam e o banding voltaria. A visibilidade em gradiente escuro, com brilho alto e em panorâmica (o padrão fica parado na tela), é [teste no Poco]. | baixo |
| F10 | [código] | **AA 0%** compila fora e não cria passada. Exceção transitória: até a variante compilar, o shader genérico pula o ramo em tempo de execução. | baixo |
| F11 | [código] | **A direção do AA está espelhada** (`spatial.glsl:142-146`; `antialias.glsl:11-25`).<br>• A conta: `dir = (−(nw+ne−sw−se), nw+sw−ne−se)` com vizinhos lidos com y para cima. Para uma rampa `L = a·x + b·y`, `dir ∝ −(b, a)`, enquanto a tangente da borda é `(−b, a)`.<br>• O desvio é o dobro do ângulo entre a borda e o eixo mais próximo: a 45°, ele amostra exatamente através da borda.<br>• O portão diagonal dá peso total justamente entre ~20° e 70°. Na prática é um desfoque direcional de ±0,5 px através de bordas inclinadas.<br>• Conferido à mão nesta consolidação. | baixo (AA está em 0) |
| F12 | [doc] | AA em vídeo já suavizado: na bancada, `detail` −0,11 e halo −71%, a +2,0 ms em sessão. A observação "nenhum benefício" é consistente com o código e com as medições. | baixo |
| F13 | [código] | **Cor nas bordas**: interpola R−Y e B−Y entre amostras a ±2 px, guiada pela posição da luma. Só age em bordas de luma (> 4/255) e só se a cor atual estiver entre os dois lados (preserva linhas finas e texto). A reconstrução `G = (Y − 0,2126·R − 0,0722·B)/0,7152` mantém `lum = Y` **exatamente**, salvo o clamp em bordas muito saturadas e o arredondamento em `mediump`. | baixo |
| F14 | [código] | Cor nas bordas, Compressão e Degradês **desligam o Detalhe** nos pixels que alteram > 2 níveis em qualquer canal: `untouched` usa `peak()`. O comentário fala só de cleanup e deband. | baixo |
| F15 | [doc] | O **CfL Lite** pendente é o item 12 da Spec 2: "não medido", com teto de ganho baixo (+0,08 dB de croma, que é o ganho da etapa atual) e ~25 leituras. Não foi prototipado, foi adiado na Spec 3 e não entrou na v9.8.0. **Não recupera luma**: o critério do diagnóstico está correto. | baixo |
| F16 | [teste no Poco] | No Poco, a conversão YUV→RGB do upload WebGL2 difere ~3–4 níveis nas bordas de croma; a do WebGPU bate com a referência (`docs/spec4-webgpu.md:143-152`). Isso muda a entrada da Cor nas bordas. Com a rede ligada o quadro é sempre WebGL2, e "Auto" também é WebGL2. | baixo |
| F17 | [código] | Adaptar à compressão a 18 Mb/s: 2.5 e 6.4. O nível neutro (escalas 1) seria ~15 Mb/s em 1080p60. A calibração "0,12 bpp = QP 28" foi feita com x264, não com o encoder do xCloud [teste no Poco]. | médio |
| F18 | [código] | Sem cronômetro, o Degradês é a **2ª vítima** da cadência, depois da rede: primeiro ×0,5 com 2 amostras, o que compila uma variante nova. | médio |
| F19 | [doc] | O perfil compilado desta configuração já foi medido: perfil `v9Mp`, mesma chave, **1,93–1,95 ms** em rajada 1080p no Poco, contra **0,86 ms** do padrão (`docs/medicoes/spec3/poco-item2-rajada-r1/r2.json`). Desligar só a Compressão economiza pouco, porque o Detalhe lê os mesmos texels. | médio |
| F20 | [hipótese] | A saída da rede vai para RGBA8 **sem dither** e pode criar contornos de 1 nível em degradês, que o Degradês depois corrige. Parte do banding residual com a rede ligada pode vir da própria rede. | baixo |

### 6.3 Custos e ganhos documentados (bancada; não somar)

| Etapa | Poco rajada 1080p (ms) | Poco sessão 30 FPS (ms) | Ganho medido contra o stream | Fonte |
| --- | --- | --- | --- | --- |
| Compressão | +0,42 a +0,51 | +2,4 | nenhum, nem a 100% em 5 Mb/s | `docs/spec2-estudo.md:195` |
| Degradês | +1,00 a +1,11 | +3,9 | banding −5% (30%), −11% (60%), −14% (100%) | `:196` |
| Cor nas bordas | +0,17 a +0,32 | +1,8 | croma +0,08 dB | `:197` |
| Detalhe (referência) | +0,76 a +0,88 | +3,3 | detail 0,67 → 0,71 | `:198` |
| Antialiasing | +0,34 a +0,47 | +2,0 | halo −71%, detail −0,11 | `:199` |
| `spatial`, perfil desta configuração (`v9Mp`) | 1,933 / 1,95 | — | — | `spec3/poco-item2-rajada-r1/r2.json` |
| `spatial`, perfil padrão (`defMp`) | 0,863 / 0,867 | — | — | idem |

As linhas da Spec 2 são acréscimos sobre o `spatial` vazio, no shader genérico highp, antes das variantes.

### 6.4 Recomendação por etapa

Critério do diagnóstico: habilitar cada etapa só se o benefício visual superar o custo.

| Etapa | Recomendação | Base | Teste no Poco? |
| --- | --- | --- | --- |
| Compressão 30% | **0%** (já é o padrão da Spec 3) | código (só degraus monótonos) + bancada (ganho ~nulo) | sim, para confirmar: A/B 0 × 30 em cena escura com blocos |
| Degradês 100% | **60%** (padrão); 30% se a prioridade for textura | código (erosão de 1–3 níveis + bloqueio do Detalhe/USM) + bancada (−14% × −11%) | sim: 100 × 60 × 30 × 0 em céu, neblina e asfalto; 0 × 5% para o dither |
| AA 0% | manter 0; não priorizar | código (compilado fora; direção espelhada) + bancada | não |
| Cor nas bordas 75% | manter | código (luma intacta; 0–2 leituras só em bordas) + bancada | opcional: 0 × 75 em HUD colorido; WebGL2 × WebGPU com rede 0 |
| CfL Lite | não implementar agora | docs (adiado; teto +0,08 dB; não mexe em luma) | só se sobrar franja de cor com 75% |
| Adaptar à compressão | opcional; baixar o slider é mais previsível | código | ler `status.adaptive` |

### 6.5 Menor experimento da área

1. Fixe "Aliviar GPU" = Nunca e escolha uma cena parada com degradê escuro e textura fina, por exemplo a pausa do jogo.
2. Inicie a medição e troque uma variável a cada ~60 s pelo console:
   - Degradês: 1 → 0,6 → 0,05 (só dither) → 0;
   - depois, Compressão: 0,3 → 0.
3. Em cada valor, tire `adb exec-out screencap -p > nome.png`.
4. Exporte a medição e avalie:
   - textura em recortes 200%, às cegas;
   - banding no degradê;
   - visibilidade do dither (0 contra 0,05);
   - por segmento, `gpu.p50/p95` e `display.p95/p99/hitches`.
5. Repita uma vez em pan lento. Compressão e Degradês não têm componente temporal, então baixá-los não deve aumentar a cintilação.

## 7. P2 — Renderizador e checagem das afirmações do diagnóstico

### 7.1 Renderizador efetivo no play.xbox.com

| Painel: Renderizador | Rede / Temporal | O que o código faz | Linhas |
| --- | --- | --- | --- |
| Auto (padrão) | qualquer | WebGL2; nenhum canvas WebGPU é criado | `src/image-filter.js:223`, `:260`; `src/restoration-engine.js:383-384` |
| WebGL2 | qualquer | WebGL2 | `src/image-filter.js:260` |
| WebGPU | rede > 0 ou temporal > 0 (**config relatada**) | cria o canvas e o device WebGPU, mas o quadro é desenhado pelo WebGL2 ("Temporal e Reconstrução neural só rodam no WebGL2"); o canvas WebGPU fica com `visibility:hidden`, ainda ocupando layout | `src/image-filter.js:261-264`, `:230`; `src/restoration-engine.js:375`, `:379` |
| WebGPU | rede 0 e temporal 0 | o WebGPU desenha; o canvas WebGL2 fica com `opacity:0`; **no site novo o canvas WebGPU fica sem posicionamento** (R3) | `src/image-filter.js:231`, `:236-238`, `:248` |
| WebGPU indisponível ou com falha | — | volta ao WebGL2 sem recarregar | `src/image-filter.js:243-244`, `:259`, `:261` |

### 7.2 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| R1 | [código] | "Auto" é sempre WebGL2: `AUTO_WEBGPU` está vazio. Além disso, `status.renderer.probe`, passado a `autoRenderer`, **nunca é atribuído** em `src/`, então mesmo uma lista preenchida não promoveria o WebGPU. É um defeito latente, sem efeito hoje. | baixo |
| R2 | [código] | Com rede ou temporal > 0, a escolha do renderizador não muda o quadro, porque o quadro inteiro vai para um motor ou para o outro (não há mistura). Com "WebGPU" escolhido, o device e o canvas ficam ociosos. Comparar WebGL2 × WebGPU só faz sentido com rede 0 e temporal 0. | médio |
| R3 | [código] | **Defeito no site novo: o canvas WebGPU não herda o posicionamento.**<br>• O posicionamento vem só da regra `canvas.bxif-play-canvas` (`src/play/host.js:11`), e a classe é posta apenas no canvas WebGL2 (`:51`).<br>• `startGpu` insere o canvas WebGPU sem a classe (`src/image-filter.js:248`), e `syncCanvas` copia só `style.cssText`, vazio no site novo (`:236-238`).<br>• Numa simulação da estrutura documentada em Chrome headless, ele ficou estático, com 1920×1080 px CSS **abaixo** do vídeo, e a página ganhou rolagem.<br>• O comentário de `image-filter.js:218-220` assume o site antigo (`#game-stream canvas`). O `play-harness` não testa WebGPU.<br>• Conferido nesta consolidação: classe e `syncCanvas` como descritos. | alto (com WebGPU) |
| R4 | [doc] | Os números da v10/Spec 4 (10,2 × 12,0 ms; SGSR 4,5–5,2 × 7,8–8,1 ms) são de bancada:<br>• bancada `tools/device/spec4/session.html` no WebView 156, clipe game30 1080p a 30 FPS, saída 2276×1280;<br>• padrões da Spec 3, sem rede, `gpuBudget` 0, 20 s por caso;<br>• GPU pelo Perfetto, incluindo a composição;<br>• em rajada a ordem se inverte (10,38 × 3,25 ms).<br>Não valem para saída Nativa com rede, Detalhe e Degradês a 100%. | médio |
| R5 | [código] | Não há port nem medição de rede ou temporal em WebGPU (`src/webgpu/` só tem cas, common, copy, easu, rcas, sgsr e spatial). Também não existe "custo de transição WebGL↔WebGPU" por quadro, porque não há interop. | médio |
| R6 | [código] + [doc] | Importação: os dois caminhos fazem 1 conversão YUV→RGB e 1 escrita RGBA8 por quadro (~7,9 MiB em 1080p). O WebGPU faz `importExternalTexture` + uma cópia, porque ler a textura externa em cada tap seria 13–30 conversões por pixel. A vantagem "sem cópia" só aparece em rajada; no caminho inteiro em sessão, o WebGPU fica +1,7–1,9 ms/quadro mais caro. | baixo |
| R7 | [teste no Poco] | A composição no site real difere da bancada: vídeo com opacity 0 + canvas WebGL2, e com WebGPU mais um canvas. Na bancada só o canvas medido ficava visível. O custo não foi isolado. | médio |
| R8 | [doc] | A conversão de cor do WebGL2 no Adreno difere da referência (bordas de croma 3–4 níveis; máx. 74–93); a do WebGPU bate. Com a rede ligada, o WebGPU não está disponível; no site novo ainda há o R3. A perceptibilidade não foi avaliada. | baixo |
| R9 | [código] | Sem cronômetro, o "GPU p95" do painel no Poco com WebGL2 é **estimativa** (fence/cadência). O custo real deve vir do Perfetto. | médio |
| R10 | [código] | **Trocar o renderizador durante uma medição perde a medição.** Cada motor tem o seu `diagnostics`, e `startMeasurement`/`exportMeasurement` usam o `activeEngine` do momento (`src/image-filter.js:52-62`, `:228`). Protocolo: inicie cada medição só depois que `status.renderer.active` estabilizar e use uma medição por renderizador. | médio |
| R11 | [código] | O app Android não força 1080p no site novo: o `1080p-hq` só existe no wrapper de `www.xbox.com` (`MainActivity.java:219-231`), não em `wrapPlay` (`:235-241`). Reforça o item 5 do resumo. | alto |
| R12 | [código] | O bitrate do painel e do HUD está em **Mb/s** (`src/restoration-engine.js:288`; `src/panel.js:1026`, `:1163`; `src/hud.js:162`, `:252`). Resolve a dúvida de unidade do diagnóstico. | baixo |
| R13 | [código] | Não existe controle chamado "tempo entre quadros" (seção 11). As leituras "tempo = `gpuBudget` 10" e "adaptação = `gpuBudget` 0" se **excluem**, porque são o mesmo controle. | médio |
| R14 | [código] | O app já tem o que a fase de adb precisa:<br>• `setWebContentsDebuggingEnabled(true)`;<br>• ponte `BxAndroid` (`getRefreshRates`, `getRefreshRate`, `setRefreshRate`, `getAppInfo`, `copyText`, `saveFile`);<br>• exportação para `Downloads/xCloud ImageFilter/bx-v10.0.0-diagnostics-<epoch>.json`;<br>• Game Mode (performance e battery);<br>• taxa de tela fixável. | médio |
| R15 | [teste no Poco] | O console no logcat **não é garantido**: o app usa um `WebChromeClient` padrão, sem `onConsoleMessage`. O canal confiável de console é o DevTools remoto. | baixo |
| R16 | [código] | Dos scripts de `tools/device`, só os que **não navegam** servem numa partida real: `spec2/drive.cjs` com URL `-`, `run-in-webview.cjs` e `gpu-probe.cjs`.<br>• `spec2/meas.cjs`, `spec2/sweep.cjs`, `spec4/meas.cjs` e `spec4/suite.cjs` navegam para `bench.invalid` e tirariam o WebView do jogo.<br>• São reaproveitáveis: `pocoState()`, `trace()` de `sweep.cjs` (feito para host Windows) e `pftrace.py`. | médio |
| R17 | [código] | O Perfetto do repositório (`perfetto-linha-do-tempo.pbtx`) cobre só **18 s**. As séries de 10–20 min precisam de uma cópia com duração maior e `write_into_file`, não testada no repositório (9.2). Alternativa: janelas de 18 s no início, aos 10 min e no fim. | baixo |

### 7.3 Verificação factual da seção 2 do diagnóstico

| # | Afirmação (resumo) | Veredito | Correção ou complemento |
| --- | --- | --- | --- |
| 1 | `host.js` acha `<video>` com `srcObject` e trilha WebRTC ativa, cria `WebGL2Player`, põe o canvas sobre o vídeo e deixa a fonte transparente; faz verificação periódica e observa o DOM | **Correta** (`src/play/host.js:28-39`, `:50-51`, `:10-11`, `:60`, `:180-182`) | Com player ativo, a mutação **não** dispara `scan` (`queueScan` retorna se houver `player`, `:89`): só o intervalo de 1 s detecta o fim. Espera `loadeddata` se `videoWidth` = 0. Põe `position:relative` no pai estático. |
| 2 | `play-xbox-com.md`: validado em harness e site sem login; pede validação logada; não herda resolução/bitrate forçados | **Correta** (`docs/play-xbox-com.md:63-96`, `:112`) | No app Android o `1080p-hq` só existe para `www.xbox.com` (R11). |
| 3 | `release-v9.8.0`: SGSR só age com saída > entrada; 16,8 ms/quadro no caminho padrão anterior a 30 FPS | **Correta** (`docs/release-v9.8.0.md:13`, `:23`, `:29`; `docs/spec2-estudo.md:9-13`) | Os 16,8 ms são de saída 1280p ampliada, padrões v9, clipe H.264, bancada. Em Nativa nem SGSR nem EASU rodam. |
| 4 | `release-v10.0.0`: WebGPU opcional com fallback; rede e temporal no WebGL2; 10,2 × 12,0 ms; SGSR 4,5–5,2 × 7,8–8,1 ms | **Correta** (`docs/release-v10.0.0.md:21-33`; `docs/spec4-webgpu.md:19-31`) | Condições de bancada em R4. |
| 5 | `analysis-v9.1`: rede compacta treinada em pares H.264/limpo, 3 convoluções, 2 passadas; ganho modesto; cintilação maior com nitidez forte; pouca vantagem da acumulação temporal ingênua | **Parcialmente correta** | Treino em **luma de cenas sintéticas** (16 cenas, 57 texturas, x264 8–25 Mb/s), não em vídeo de jogo. A acumulação temporal com movimento exato **piora** o PSNR (37,2 → 33,6 dB em 8 quadros); não é "pouca vantagem". |
| 6 | `release-v9.8.0`/Spec 2: Worker e CfL Lite pendentes; CfL Lite com benefício limitado ou indeterminado | **Correta, com omissão** | O Worker foi **confirmado em bancada** no Poco com a thread principal ocupada (30 FPS: 25,9 → 29,5 FPS; p95 74,8 → 58,4 ms), com vídeo por `captureStream`, não WebRTC. No Vostro não houve ganho. |
| extra | Bitrate "~18" | **Mb/s** (R12) | — |

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
   - Pelo código: 208 MAC/px, 28 buscas/px (+70% sobre o resto do caminho) e ~91 MB/quadro de DRAM [hipótese].
   - Diferença visual documentada: pequena; na mesma nitidez, halo +18% sem ganho de SSIM (N12).
   - Com os pesos reais, a rede atenua textura fina de baixo contraste (5.3).
   - Medição decisiva no Poco: 5.5.
3. **Duas ou mais etapas realçam as mesmas frequências?** Sim, e a redundância é exata (4.2).
   - O `fine` do Detalhe e o USM final têm resposta idêntica nos eixos. Detalhe 100% equivale sozinho a Nitidez ≈ 4,3; com USM 2, a ≈ 6,3 no termo linear.
   - Ganho efetivo com coring e limites: 1,4–2,3×, contra 1,0–1,56× do USM sozinho.
   - O `clarity` (6–16 px) é a parte não redundante.
   - A rede não é redundante, é **antagônica**: atenua a textura fraca que Detalhe e USM depois reamplificam.
   - Degradês 100% remove textura fraca e, via `untouched`, desliga o Detalhe nessas áreas.
   - Medição de bancada: Detalhe 20% sobre USM 2 soma +0,033 de `detail`, +0,123 de `energy`, +25% de halo e +6% de cintilação. Detalhe 100% nunca foi medido.
4. **O laço acompanha os quadros decodificados?** Não: acompanha os quadros que o `<video>` apresenta. Não repete quadros. Descarta os que chegam no mesmo vsync, e eles ficam contados em `origin.missed`/`videoSkipped`. Com Fluidez + Captura Direta, todos os quadros decodificados chegam ao tratamento. Já existe p50/p95/p99 por segmento para display/arrival/server/wait, mas "display" é a hora de submissão na CPU, e a composição não é medida pelo script.
5. **Os testes de cintilação da v9.1 foram reproduzidos na v10?** Não.
   - A última medição de cintilação é da Spec 2 (game30), só com USM, Detalhe 20% e Temporal.
   - A cintilação **com rede** não foi medida desde a v9.1. v9.8, v10, Spec 4 e `play-xbox-com` não têm medição de cintilação.
   - O que mudou desde a v9.1: os padrões (Nitidez 3→2, Detalhe 0,2→0, Degradês 0,3→0,6, Compressão 0,5→0) e o `spatial` em `mediump` no Adreno (diferença média de 0,02–0,04 nível).
   - A matemática do Detalhe e do Degradês e os pesos da rede (`src/nn/restore.json`) não mudaram.
   - A frente neural confirma: a única cintilação medida com a rede (v9.1, 4,49 → 4,35) também baixou a nitidez de 3 para 2,5, então os −3% não podem ser atribuídos à rede. O `release-v9.1.md` diz "com a mesma nitidez", mas a tabela da análise não (N12, N13).
6. **Menor experimento.** O lado visual está em 4.6: matriz de 7–8 configurações em bancada com critério fixado antes, depois ABAB no Poco. O lado da fluidez:
   - Uma medição do painel de ~12 min, na mesma cena, com 60 Hz fixo, Fluidez desligada, painel fechado e DevTools desconectado.
   - Alternar ABAB a cada 3 min só a variável candidata (ex.: neural 100% × 0%; Detalhe 100% × moderado), com Perfetto em paralelo.
   - A candidata passa se display p99 e hitches/min não piorarem, se `videoSkipped` e `app_deadline` não subirem e se a ocupação ficar ≤ ~50% a 30 FPS (regra da Spec 2).
7. **Fato × hipótese × teste:** cada achado das seções 2–7 traz a classe ([código], [doc], [hipótese], [teste no Poco]). A verificação adversarial (seção 12) confirma, reclassifica ou corrige cada um.

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

## 10. Ranking impacto × esforço × risco (provisório; P0 + P1 microdetalhe)

| # | Ação (fase de testes, sem código) | Impacto | Esforço | Risco |
|---|---|---|---|---|
| 0 | Matriz de bancada da seção 4.6 (Detalhe 0,2/0,35, Degradês 0,6, Rede 0), com o critério fixado antes | alto | baixo | baixo |
| 0b | No Poco: Detalhe 1 × 0,2–0,35 e Degradês 1 × 0,6 (neutros em GPU) por screencap, parado e em panorâmica | alto | baixo | baixo |
| 0c | No Poco: Nativa + Detalhe 1 × Auto + SGSR + Detalhe 0–0,2 | alto | baixo | baixo |
| 0d | No Poco: matriz rede × Detalhe (5.5), com "Nunca" e WebGL2 — baseline da rede atual | alto | baixo | baixo |
| 0e | No Poco: Degradês 100 × 60 × 30 × 0 e Compressão 30 × 0 (6.5), por screencap | médio | baixo | baixo |
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
| e | Repesar o Detalhe: `fine` bem menor que `clarity` (só se a bancada confirmar M2/M3) | médio | baixo | médio |
| f | Métrica de bancada para textura de baixo contraste, sem o núcleo do `fine` (M15) | médio | baixo | baixo |
| g | Máscara de movimento barata (cópia 1/4 + `cut`) para reduzir o realce em panorâmica (só se a bancada mostrar ganho) | médio | médio | médio |
| h | Corrigir as dicas do painel sobre a rede ("~30%" → ~40–45%; "use ~2,5" sem induzir a subir) | baixo | baixo | baixo |
| i | Variante `mediump` das passadas da rede, com regressão contra o JAX | médio | médio | médio |
| j | Rede nova (WebGPU, multi-quadro, perda temporal) — só depois de 0d e de um conjunto de teste com movimento | ? | alto | alto |
| k | Corrigir a direção do AA (`spatial.glsl:144`, `antialias.glsl`) e medir de novo — só se o AA voltar à pauta | baixo | baixo | baixo |
| l | Corrigir a dica da Compressão ("ruído de compressão" → "degraus de bloco em áreas lisas") | baixo | baixo | baixo |
| m | Canvas WebGPU no site novo: aplicar a classe `bxif-play-canvas` (ou estilo equivalente) e cobrir no `play-harness` (R3) | alto (com WebGPU) | baixo | baixo |
| n | Preencher `status.renderer.probe` com o adaptador antes de qualquer entrada em `AUTO_WEBGPU` (R1) | baixo | baixo | baixo |
| o | Medição sobrevivendo à troca de renderizador, ou aviso no painel (R10) | médio | baixo | baixo |

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

## 12. Registro da verificação adversarial

*Pendente.* Feita pelo modelo Fable, uma passada por frente. Correções, reclassificações e refutações entram aqui e nas seções afetadas.
