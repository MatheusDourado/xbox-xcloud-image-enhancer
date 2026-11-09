# Auditoria do pipeline no play.xbox.com — fase 1 (sem alteração de código)

> **Status: fase 1 concluída** — investigação e verificação adversarial das seis frentes. As mudanças de código escolhidas a partir da seção 12.1 entram na v10.1.0 (notas em `docs/release-v10.1.0.md`).
>
> | Frente (doc de diagnóstico de 09/11/2026) | Investigação | Verificação adversarial |
> | --- | --- | --- |
> | P0 — O que realmente roda (framePlan, bypasses, resolução) | concluída | concluída (Fable) |
> | P0 — Frametime, captura e apresentação | concluída | concluída (Fable) |
> | P1 — Microdetalhe × ruído/cintilação; redundância de realce | concluída | concluída (Fable) |
> | P1 — Rede neural atual (baseline) | concluída | concluída (Fable) |
> | P2 — Compressão, Degradês, AA e croma | concluída | concluída (Fable) |
> | P2 — Renderizador e checagem das afirmações do diagnóstico | concluída | concluída (Fable) |
>
> A verificação adversarial foi feita pelo modelo Fable (um verificador por frente, esforço alto). Os trechos alterados por ela estão marcados no texto com *(verificação: corrigido)*, *(verificação: reclassificado)* ou *(verificação: acrescentado)*; o registro completo está na seção 12.

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
- Se não foram mexidos: `adaptive` **ligado** e `gpuBudget` **6 ms** (padrões em `src/restoration-engine.js:5`). Nesse caso valem, ao mesmo tempo, a escala por bits/pixel (2.5) e a redução por cadência (2.4). *(verificação: acrescentado)*

## 1. Resumo executivo

1. **Em saída Nativa, SGSR e "EASU + nitidez" são o mesmo plano, e nenhum escalador roda.** [código] `framePlan` só define `scaler` com `outW>w && outH>h` (`src/restoration-engine.js:366`). O teste `tests/engine.test.cjs:358` garante isso. A observação "SGSR parece igual a EASU + nitidez" é esperada e não avalia o SGSR.
2. **Em Nativa, a ampliação até a tela é bilinear do navegador, depois da nitidez.**
   - [código] O canvas fica no tamanho do stream (1920×1080) e o navegador o amplia ~×1,19 até os ~1280 px físicos (`src/restoration-engine.js:48`; `src/play/host.js:11`). *(verificação: corrigido)*
   - [hipótese] Que esse filtro seja bilinear é o comportamento esperado do compositor do Chromium (comentário em `src/restoration-engine.js:33-36`; emulado em bancada em `docs/analysis-v9.md:61`); o script não controla nem mede o filtro. *(verificação: reclassificado)*
   - [doc] `docs/analysis-v9.md` mede que essa ampliação depois da nitidez custa parte do detalhe.
   - Saída Auto faz a ampliação (EASU/SGSR) e a nitidez no tamanho final.
3. **"Rede neural 100%" não garante que a rede rode.**
   - [código] Ela exige `EXT_color_buffer_float` e `budget.neuralAllowed` (`src/restoration-engine.js:355`). Se faltar, some sem aviso.
   - [doc] Quando roda, a bancada do Poco mede **+5,2 ms de GPU por quadro** em 1080p a 30 FPS (11,48 → 16,69 ms; ocupação 34,3% → 50,1%; `docs/medicoes/spec2/poco-base.json`, caso medido com neural 0,5 sobre o caminho padrão da época, v9: Compressão 50%, Degradês 30%, Detalhe 20%, Nitidez 3, saída 1080). O custo não depende da intensidade: os passes são os mesmos. *(verificação: corrigido)*
   - [doc] O mesmo dado mostra que os alvos RGBA16F da rede funcionaram nesse WebView: `EXT_color_buffer_float` estava presente na bancada do Poco (`docs/spec1-estudo.md:156-158`; `docs/medicoes/spec2/poco-base.json`, `filtro-1080-neural`). Confirmar no `play.xbox.com` continua necessário, mas a chance de `floatTargets=false` é pequena. *(verificação: acrescentado)*
4. **No Poco, "Aliviar GPU acima de" 3, 6 e 10 ms são equivalentes; só "Nunca" muda algo.**
   - [código] Sem `EXT_disjoint_timer_query_webgl2`, a única redução é por cadência, e ela ignora o valor em ms (`src/restoration-engine.js:71-75`). [doc] A ausência do cronômetro no WebView do Poco é observação de bancada e de partida real (`env.timer:false`; `docs/release-v9.7.1.md:16`), não decisão do código. *(verificação: reclassificado)*
   - Essa redução desliga, nesta ordem: **neural → degradês ½ → degradês 0 → limpeza → detalhe+cor**.
   - Os sliders não mudam e o estado não volta sozinho até algum ajuste mudar.
   - **Isso pode contaminar qualquer A/B visual.**
   - [código] A 60 FPS a margem é de 20% (`:103`) e, na bancada, o `<video>` sozinho já perdeu 10–18% dos quadros sem sobrecarga: o corte da neural pode vir dos pulos do `<video>`, não da GPU (3.2, F17). *(verificação: acrescentado)*
5. **A resolução recebida no site novo pode ser 720p.** [teste no Poco] O "1080p HQ" era preferência do Better xCloud e não existe em `play.xbox.com` (`src/play/prelude.js:6`; `docs/play-xbox-com.md` §5 item 7).
6. **O laço de desenho segue os quadros que o `<video>` apresenta, não os decodificados.**
   - [código] Há 2 callbacks rVFC por quadro e nenhum limite de FPS no site novo. O mesmo quadro nunca é redesenhado.
   - [doc] A 60 FPS, na bancada, 10–18% dos quadros decodificados não geraram callback rVFC e nunca chegaram ao tratamento (`spec2/poco-base.json` "so-video-60": ~522 callbacks para 640 decodificados, com `droppedVideoFrames` = 6; `poco-longa60.json`: 7.277 de 75.412 descartados em 21 min). Os ~2% da v9.6.1 são buracos no relógio do servidor (RTP) a 30 FPS, não pulos do `<video>` (`docs/release-v9.6.1.md:5,15`). *(verificação: corrigido)*
   - [doc] A 30 FPS em 60 Hz, o intervalo entre callbacks rVFC teve p95 ≈ 50–51 ms em 84 das 91 linhas de bancada do Poco a 30 FPS (Specs 2 e 3), **inclusive em 2 das 4 rodadas só com o `<video>`** ("so-video-30": 50,1 ms com 2,2% de GPU); as 7 linhas restantes (`poco-carga.json`) deram 34 ms. Nenhuma das 27 linhas a 60 FPS passou de 45 ms. *(verificação: corrigido)*
   - Parte do "frametime irregular" não nasce no tratamento.
7. **A métrica "display" (Ritmo na tela) é a hora de submissão na CPU, não a de apresentação.** [código] Engasgos causados por GPU ou composição ficam subestimados nela: só aparecem quando a fila da GPU chega a bloquear a CPU [hipótese]. Para vê-los é preciso o frametimeline do Perfetto (ou o `gfxinfo`, se ele cobrir os quadros do WebView [hipótese]). *(verificação: corrigido)*
8. **Picos pontuais têm causas conhecidas:**
   - [código] A variante do `spatial` da configuração relatada (`mediump.1.1.4.1.1.0.1.1`) não é pré-compilada — só a dos padrões (`mediump.0.1.4.1.0.0.1.1`) — e finaliza de forma bloqueante no 2º quadro (`getProgramParameter(LINK_STATUS)`, `src/restoration-engine.js:415,433`). [doc] O Poco não tem `KHR_parallel_shader_compile` (`spec2/poco-compile.json`: `parallel: false`). *(verificação: corrigido)*
   - [código] Alternar Original/Só nitidez↔Tratada recria ~49,8 MB de alvos; ligar ou desligar a neural, ~41,5 MB; trocar a resolução recria tudo. O modo Diagnóstico não realoca nada. *(verificação: corrigido)*
   - [doc] Na bancada da Spec 2 o motor compilou em 325,8 ms no início (`spec2/poco-compile.json`: 13 programas, antes do SGSR e da variante pré-aquecida do `spatial`). O construtor atual compila 14 programas mais essa variante (~69 ms para um `spatial` do zero), então hoje deve passar de ~400 ms [hipótese]. *(verificação: corrigido)*
9. **Dither com Degradês ligado.** [código] Spatial e passe final usam o mesmo ruído na mesma coordenada.
   - *Corrigido pelas frentes P1/P2:* não há soma. O spatial grava inteiros em RGBA8, e o segundo dither (|n| < 0,5 nível) arredonda de volta ao mesmo valor onde a nitidez não mudou nada.
   - O resultado é um único dither fixo, ≤ 1 nível. Não é causa de ruído nem de cintilação.
   - A visibilidade em gradiente escuro é [teste no Poco] (6.2, F9).
10. **A medição exportada já permite deduzir quais passes rodaram, mas não registra o essencial para a fase 2.** [código] Faltam a lista de passes, o tempo por passe, o motivo da redução automática e a variante do `spatial` (seção 2.9).
11. **Detalhe 100% e a nitidez USM realçam a mesma banda.**
    - [código] Nos eixos, o termo `fine` do Detalhe tem **exatamente** a mesma resposta em frequência do passa-alta do USM, `(1−cos ω)/2`; no plano 2D a semelhança é 0,978.
    - Só o `fine` a 100% já equivale a Nitidez ≈ 4,3. Somado ao USM 2, o termo linear equivale a Nitidez ≈ 6,3, a faixa que a v9.1 associou a halos e cintilação.
    - A única parte do Detalhe que também alcança 6–16 px é o `clarity`; mas ele tem ganho 1,0 em 2–4 px, então também se sobrepõe ao USM. Dos 3,0 de ganho do Detalhe 100% em Nyquist, 1,2 vêm do `fine` e 0,8 do `clarity`. *(verificação: corrigido)*
12. **A rede neural a 100% não realça; ela atenua textura fraca.** [código, emulação com os pesos do repositório] Grades de 1–4 níveis saem com 0,26–0,9× da amplitude. Detalhe e USM depois reamplificam o que sobra.
13. **Degradês 100% apaga e, em alguns períodos, inverte textura fraca (1–7 níveis).** [código; percentuais por emulação] Raio de 8 px e limiar de "plano" de até 13 níveis. Pelo mecanismo `untouched`, ele também **desliga o Detalhe** em 20–26% dos pixels de textura fraca (σ 2–3 níveis). *(verificação: reclassificado)*
14. **Juntos, os itens 11–13 formam uma expansão de amplitude.** A microtextura sutil some e a textura média fica exagerada (1,4–1,6× na cadeia relatada, a 8–16 níveis; 1,4–2,3× para Detalhe 1 + USM 2 sem a rede). É uma causa plausível [hipótese] do aspecto "pouco natural". *(verificação: corrigido)*
15. **A configuração relatada está fora de tudo o que já foi medido.** [doc] O Detalhe só foi medido a 0 e 20%, a rede só a 50%, e o Degradês 100% só num clipe de céu. Rede 1 + Detalhe 1 + Degradês 1 nunca foi medida.
    - Na bancada, Detalhe 20% sobre o USM já soma +6–7% de cintilação, contra +1,5% sem o USM: a interação é multiplicativa.
    - A emulação estima cintilação ×1,6–1,8 para Detalhe 1 + USM 2 (sem rede) e ×1,07–1,69 para a configuração relatada completa, porque a rede e o Degradês 100% mascaram parte dela em textura fraca. É um proxy pessimista. *(verificação: corrigido)*
16. **A intensidade do Detalhe e da rede não muda o custo de GPU** [código]. Só ligar ou desligar muda, porque a variante compilada é a mesma. Baixar o Detalhe de 100% para 20–35% é neutro para o stutter.
17. **A rede neural custa caro e o ganho medido é pequeno.**
    - [doc] +5,2 ms/quadro (+45%) em sessão a 30 FPS na bancada do Poco: cerca de 70% do spatial padrão v9 inteiro (11,48 − 3,95 = 7,5 ms na mesma sessão) e mais que qualquer filtro isolado (Degradês +3,9 ms). A dica do painel diz "~30%". *(verificação: corrigido)*
    - [doc] Na mesma nitidez, a bancada mediu SSIM e PSNR iguais e **halo +18%**. A cintilação com a rede não é medida desde a v9.1.
    - [código] Pesos e shaders são os mesmos da v9.1; o treino é sintético, sem perda temporal e sem dados do encoder do xCloud.
    - [código] Ela roda em highp no Adreno.
18. **A dica do painel "Com Reconstrução neural, use Nitidez ~2,5" ficou invertida.** [código] Era para baixar de 3; com o padrão atual em 2, ela leva a **subir** a nitidez.
19. **Compressão 30% quase não age a ~18 Mb/s.** [código] Ela só trata degraus monótonos de 1 px (~2–25 níveis) entre lados lisos, e não remove ringing nem mosquito, apesar do que a dica do painel promete. [doc] Em duas bancadas o ganho foi nulo: "nenhum, nem a 100%" a 5 e 9 Mb/s (Spec 2, `docs/spec2-estudo.md:195`) e "quase não muda nada" a 10–20 Mb/s (`docs/analysis-v9.md:46`), ao custo de +2,4 ms em sessão a 30 FPS. Recomendação: 0%, confirmando com A/B. *(verificação: corrigido)*
20. **Degradês 100% rende pouco a mais que 60%.** [doc] O banding cai −14% contra −11%. [código, emulação] Em troca, ele apaga cerca de metade do grão de 1–3 níveis pico a pico (pesos de mistura de 79/51/14% nos extremos; texturas periódicas de 2–4 px passam quase intactas e as de 3–6 px invertem), e nada depois a devolve: o coring do Detalhe e o piso de ruído do USM já ignoram textura abaixo de ~4 níveis. Recomendação: 60%, ou 30% se a prioridade for textura, decidindo com A/B. *(verificação: corrigido)*
21. **A direção do AA está espelhada.** [código, conferido à mão e por emulação] Com os vizinhos lidos com y para cima, `dir = −4·(b, a)` para uma rampa `a·x + b·y` (o sinal não importa: as duas amostras são simétricas), enquanto a tangente da borda é `(−b, a)`. A fórmula é a do FXAA, que supõe o "norte" em −y. *(verificação: corrigido)*
    - A 45°, o AA amostra **através** da borda e desfoca, em vez de suavizar o serrilhado. O mesmo vale para `src/shaders/antialias.glsl`.
    - [hipótese] Isso é uma explicação coerente para o "AA não trouxe benefício" e para o `detail` −0,11 da bancada; não foi medido com a direção corrigida. Não afeta a configuração atual (AA 0). Correção para a fase 2, com nova medição. *(verificação: reclassificado)*
22. **"Cor nas bordas" já é um CfL local que preserva a luma Rec.709 exatamente.** [código] O CfL Lite pendente é um filtro novo de teto baixo (+0,08 dB de croma na bancada) e não recupera luma. Só faz sentido se sobrar franja de cor visível com 75%.
23. **Com "WebGPU" escolhido no site novo, a imagem tratada pode sair do lugar ou sumir.** [código] O canvas WebGPU não recebe a classe `bxif-play-canvas` e fica sem posicionamento (7.2, R3); o sintoma (imagem abaixo do vídeo com rolagem, ou área preta se o container cortar o excesso) é [teste no Poco]. Não use WebGPU no `play.xbox.com` para comparar até corrigir. Com a rede ligada, o quadro é sempre WebGL2. *(verificação: corrigido)*
24. **Trocar o renderizador no meio de uma medição desvia a medição: o export sai vazio e a gravação original fica aberta** [código, emulado] (7.2, R10). *(verificação: corrigido)*
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
| 5 | composição do navegador | 1920×1080 → ~2276×1280 físicos (imagem 16:9 por `object-fit: contain`, dentro de uma área de até ~2620×1280) | camada do canvas | `host.js:11`; `src/image-filter.js:31` | fora do script; filtro provavelmente bilinear [hipótese] *(verificação: corrigido)* |
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
| Auto com vídeo ≤ 1127 px físicos | resolve para Nativa; o primeiro degrau em que Auto amplia é 1128 → 2005×1128 (limiar 1,04×1080 = 1123,2 em degraus de 8 px) *(verificação: corrigido)* | `:39-40` |
| Stream 720p + Nativa | mesmos passes em 1280×720; compositor ×1,78 | `:48` |
| Fluidez Equilibrada/Máxima | mesmos passes; o último roda em `present()` no rAF; o alvo `spatial` vira o slot `pacedN` sem cópia | `src/image-filter.js:433-440`; `src/restoration-engine.js:558-564`, `:581-585` |
| `processingMode` quality (só pelo console no site novo) | alvos RGBA16F; spatial sem dither; `sharpenFactor` 2,0 | `:353`, `:362`, `:374`, `:444` |
| `floatTargets=false` | neural não roda, **sem aviso**. [doc] Na bancada do Poco a extensão existia: a rede rodou com alvos RGBA16F e custou +5,2 ms (`spec2/poco-base.json`, `filtro-1080-neural`; `docs/spec1-estudo.md:156-158`); só a confirmação no `play.xbox.com` fica como [teste no Poco] *(verificação: acrescentado)* | `:355`, `:397` |
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
  - 3 janelas seguidas abaixo da margem disparam um passo, ou seja, ≥ 6 s por passo; uma janela acima da margem zera a contagem (`:74`). *(verificação: corrigido)*
  - Sem `fpsReceived` na telemetria (`live` nulo), a referência passa a ser a cadência medida enquanto a Comparação esteve em Original/Só nitidez, com a margem padrão **0,95** (`src/image-filter.js:328`, `:335`; `src/restoration-engine.js:71`). Sem essa referência, nada reduz. *(verificação: acrescentado)*
  - [doc] As margens 0,8/0,9 foram calibradas com clipes de arquivo no Poco (5–17% de quadros pulados a 60 FPS sem sobrecarga; `src/restoration-engine.js:96-103`), nunca com WebRTC; `docs/spec1-estudo.md:111` registra o risco de falso positivo. *(verificação: acrescentado)*
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
  - A dica de "Aliviar GPU" (`src/panel.js:826-828`) descreve o caminho por cronômetro ("Acima do limite (p95)…"; "10 ms: Mantém mais etapas"), que não existe no Poco. *(verificação: acrescentado)*
  - Em Auto, o 1º passo troca a saída para nativa: o canvas é redimensionado e EASU/SGSR somem sem nenhum slider mudar (`src/restoration-engine.js:59-61`; `src/image-filter.js:302`, `:309`). *(verificação: acrescentado)*

A simulação com o `createBudget` real deu passos idênticos para 3, 6 e 10 ms e nenhum para 0.

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

A tela documentada é 1280×2772 com dpr 3,25 (`docs/spec1-estudo.md:121`). Na bancada da Spec 3 o canvas media 806×394 px CSS, ou seja, ~2620×1280 físicos (`docs/medicoes/spec3/poco-item5-sessao-r1.json`, linhas de medição); com `object-fit: contain`, um vídeo 16:9 ocupa 2276×1280 dessa área, e é essa altura que `displayHeight` lê (`src/image-filter.js:31`). *(verificação: corrigido)*

| Caso | `resolveOutput` | Backing store | Quem amplia até a tela |
|---|---|---|---|
| Nativa, stream 1080p | `native` | 1920×1080 | compositor ×≈1,19 |
| Auto, stream 1080p, vídeo com 1280 px | `1280` | 2276×1280 | EASU/SGSR no shader |
| Auto, stream 1080p, vídeo com 1220 px | `1216` | 2162×1216 | EASU/SGSR |
| Auto, vídeo ≤ 1127 px | `native` | 1920×1080 | compositor *(verificação: corrigido)* |
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

[hipótese] Tráfego de memória estimado só da neural em 1080p, supondo que cada texel vá à memória uma única vez (cache perfeito): 44 B por pixel da fonte (leituras 4 + 16 + 4 B, escritas 16 + 4 B) ≈ 91 MB por quadro, ou ~2,7 GB/s a 30 FPS e ~5,5 GB/s a 60 FPS. As leituras brutas dos shaders (9×4 B + 18×8 B + 4 B) somariam ~380 MB; o valor real fica entre os dois e a conta ignora a compressão de framebuffer. *(verificação: reclassificado)*

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
| F2 | [doc] | Quadros apresentados entre dois callbacks rVFC nunca chegam ao tratamento (`src/image-filter.js:187-188`). Na bancada a 60 FPS: ~18% dos decodificados sem callback só com o vídeo ("so-video-60": 49,71 callbacks/s para 640 decodificados em 10,5 s; `droppedVideoFrames` = 6, então não está provado que saíram da tela); 9,6% descartados em 21 min com tratamento (`poco-longa60.json`, aí `dropped` ≈ faltantes); ~0 a 30 FPS. Em WebRTC real não há medida: os ~2% da v9.6.1 são buracos no relógio do servidor a 30 FPS (`release-v9.6.1.md:5,15`). *(verificação: corrigido)* | alto |
| F3 | [doc] | A 30 FPS em 60 Hz, o intervalo rVFC fica em 33 ms na mediana, mas ≥ 5% dos intervalos chegam a ~50 ms (3 vsyncs), compensados por outros de 16,7 ms, **mesmo sem tratamento** (p95 50,1 ms com 2,2% de GPU, "so-video-30"); em 84 das 91 linhas de bancada a 30 FPS (Specs 2 e 3) o p95 passou de 45 ms; as 7 restantes (`poco-carga.json`) deram 34 ms, inclusive só com o vídeo — varia de rodada para rodada. *(verificação: corrigido)* | alto |
| F4 | [código] | "display" é a hora de submissão na CPU (`src/image-filter.js:444`; com Fluidez, o tick de rAF em `:212`): não vê a composição e só vê a GPU indiretamente, quando a fila chega a bloquear a CPU [hipótese]. Na bancada, a fence com neural teve p50 24,3 ms a 30 FPS e 40–44 ms no padrão antigo em 1280p a 60 FPS, acima de um intervalo de 16,7 ms, sem isso aparecer em "display". *(verificação: corrigido)* | alto |
| F5 | [teste no Poco] | Neural + spatial completo em 1080p: estimativa de ≈14–15 ms ativos por quadro (≈42–45% da GPU a 30 FPS; ≈84–89% a 60 FPS sem subir o clock). Conta: 11,48 (padrão antigo 1080p) + 5,2 (neural) − 1,9 a 2,7 (mediump; os −2,7 ms foram medidos em 1280p e escalam para ≈ −1,9 em 1080p). Bases diferentes, então é indicativa; a variante do spatial do padrão antigo é a mesma da configuração relatada. A Spec 2 mediu 88% no padrão antigo em 1280p a 60 FPS. *(verificação: corrigido)* | alto |
| F6 | [teste no Poco] | Todo o tratamento roda na thread principal, junto com o site. Na bancada, com tarefas longas, caiu de 30,0 para 25,9 FPS (Worker: 29,5). A carga do `play.xbox.com` logado não foi medida; o Worker não foi implementado. | alto |
| F7 | [doc] | O upload não é gargalo de GPU: `FLIP_Y`, RGB e VideoFrame ficam no ruído (`spec2/poco-upload-live.json`). O custo relevante é **CPU da thread principal**: 1,4 ms p50 / 2,4 ms p95 por quadro. A hipótese de "FLIP_Y lento" está **refutada** na bancada. | médio |
| F8 | [código] | Compilação síncrona: 14 programas mais a variante padrão do `spatial` no construtor (`:403-405`; bancada da Spec 2: 325,8 ms para 13 programas, sem SGSR nem variante — hoje deve ser maior) e a variante da config relatada sob demanda, finalizada de forma bloqueante no 2º quadro (`:415`, `:433`; sem `KHR_parallel_shader_compile` [doc]). Explica travadas no início e ao ligar ou desligar um filtro, não engasgo contínuo. *(verificação: corrigido)* | médio |
| F9 | [código] | Alternar Original ou Só nitidez ↔ Tratada **apaga e recria os três alvos (~49,8 MB em 1080p)**; ligar ou desligar a neural recria `nnFeatures` + `neural` (~41,5 MB); a troca de resolução recria tudo e redimensiona o canvas (`:570-572`, `:444-460`, `src/image-filter.js:309`). O modo Diagnóstico **não realoca nada**: só muda um uniform (`:371-374`). A/B rápidos geram picos que parecem engasgo do tratamento. *(verificação: corrigido)* | médio |
| F10 | [teste no Poco] | A taxa da tela fica a cargo do sistema (`preferredDisplayModeId 0`, `MainActivity.java:199-215`). 60 FPS em 90 Hz dá judder. A medição registra a taxa só no início. | médio |
| F11 | [código] | Fluidez: processa no rVFC e apresenta no rAF, com 5 slots; Equilibrada segue o relógio RTP com o p95 do trânsito + 3 ms. Ajuda quando a irregularidade vem da chegada, não com a GPU saturada. A Captura Direta (MSTP na thread principal) evita os pulos do `<video>`, mas não foi medida com WebRTC no Poco. `desynchronized` não trouxe ganho no Poco [doc]. | médio |
| F12 | [teste no Poco] | Composição: o vídeo com `opacity:0` continua decodificado e apresentado, já que é a fonte do rVFC e do upload. Se a camada dele ainda é composta, não está provado. | baixo |
| F13 | [hipótese] | Alocações por quadro de ≈11–22 KB (`normalize` 3×/quadro, `JSON.stringify`, 3 ordenações, `Object.entries` no `draw`) geram GC menor periódico. Nada mostra que causem engasgo. | baixo |
| F14 | [hipótese] | O custo da própria medição (fence + `setTimeout(1)`, `getStats` a 1 Hz sempre no Poco, timers do painel e do HUD) é provavelmente pequeno. | baixo |
| F15 | [doc] | 21 min de bancada sem throttling (GPU até 61,4 °C), mas a 60 FPS a temperatura ainda subia no fim. O script não registra temperatura; isso só sai por adb. | médio |
| F16 | [doc] | **`buffer_stuffing` domina o frametimeline na bancada**: 810 de 907 quadros do layer do app a 60 FPS (e 739 de 964 a 30 FPS) foram classificados assim pelo SurfaceFlinger (`spec2/poco-frames-game60.json`, `poco-frames-game30.json`; `tools/device/spec2/pftrace.py --frames`). O WebView entrega quadros com fila adiantada, o que soma pelo menos um vsync de latência de apresentação. Não medido no `play.xbox.com`. *(verificação: acrescentado)* | médio |
| F17 | [código] | **A cadência pode cortar a neural a 60 FPS por causa dos pulos do `<video>`, não da GPU.** A margem acima de 45 FPS é 20% (`src/restoration-engine.js:96-103`, `:71-75`; `src/image-filter.js:334-336`) e a bancada já perdeu 10–18% sem tratamento ("so-video-60": 49,7/60 = 0,83). Alguns % a mais em 3 janelas de 2 s cortam a "Rede neural 100%", e o estado só volta com um ajuste. Como a GPU saturada também aparece como pulos (callback atrasado), não dá para descontar os pulos sem medir (Original × Tratada a 60 FPS). *(verificação: acrescentado)* | alto |

### 3.3 Eventos pontuais que causam pico de um ou poucos quadros

| Evento | Quando | Arquivo:linha | Duração conhecida |
| --- | --- | --- | --- |
| Construtor do Engine | início de cada stream; contexto restaurado | `src/restoration-engine.js:403-405` | 325,8 ms na bancada da Spec 2 (13 programas; hoje 14 + variante pré-aquecida, não medido) *(verificação: corrigido)* |
| Variante nova do spatial | 2º quadro com ajustes novos; filtro cruza 0; corte do orçamento | `:426-440` | não medida em jogo (genérico do zero: 68,6 ms) |
| Recriação de alvos | Original/Só nitidez↔Tratada (~49,8 MB); neural ligada/desligada (~41,5 MB) | `:570-572`, `:444-460` | não medida *(verificação: corrigido)* |
| Troca de resolução do stream | queda ou subida da rede | `src/image-filter.js:309` | não medida |
| Corte do orçamento | 3 janelas abaixo da margem | `:55-75` | não medida |
| Troca de Fluidez/Captura | ajuste | `src/image-filter.js:202`, `:351-370` | não medida |

### 3.4 O que já é medido × o que falta

| Grandeza | Existe? | Limitação |
| --- | --- | --- |
| display/arrival/server/wait com p50/p95/p99/máx/hitches por segmento | sim | display = submissão na CPU |
| Quadros pulados pelo `<video>` (`videoSkipped`, `origin.missed`) e descartes do pacer | sim | com Captura Direta, `origin.missed`/`videoSkipped` deixam de existir (`src/image-filter.js:185`, `:324`): ler `pacerDropped` e `wait` *(verificação: acrescentado)* |
| Jank de apresentação do Perfetto (frametimeline) | só em bancada, 15 s | `spec2/poco-frames-game60.json`: `buffer_stuffing` em 810 de 907 quadros a 60 FPS (`app_deadline` 3); a 30 FPS 739 de 964. Indica fila de quadros adiantados no WebView (≥ 1 vsync de latência), não medida no play.xbox.com *(verificação: acrescentado)* |
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

**Método.** As respostas em frequência são analíticas. Os ganhos efetivos, o ruído e a cintilação vêm de uma **emulação numpy dos shaders**: pesos reais da rede, coring e limites. O ruído e a cintilação (4.5) quantizam a entrada e cada passe a 8 bits; a tabela de ganho (4.3) roda em float, sem essa quantização. Com 8 bits, os ganhos a ≥ 4 níveis mudam ≤ 0,2 (ex.: Detalhe 1 + USM 2 em 4 px, 1,52 → 1,71); as linhas de 1–2 níveis são só indicativas. *(verificação: corrigido)*
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
- O USM do upstream usa o binomial `G = [1 2 1; 2 4 2; 1 2 1]/16` e `e + (e−G)·sharpenFactor/3` (`script.js:264-265`), com `k = 0,556` para Nitidez 2. *(verificação: corrigido)* Sua parte passa-alta vale `1 − cos²(ωx/2)·cos²(ωy/2)`.

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

**O `clarity` é a parte que também alcança 6–16 px** [código] *(verificação: corrigido)*:
- É o centro menos a média de 8 amostras bilineares, todas a ≈ 3,5 px do centro (deslocamentos (±3,5, ±0,5) e (±2,5, ±2,5)); o filtro LINEAR transforma cada amostra num bloco 2×2, cobrindo texels de 2,8 a 4,2 px. *(verificação: corrigido)*
- Tem máximo de 1,38 em período de 5,9 px e é a única parte que age onde o USM quase não age (6–16 px; ≥ 0,5 até 14,8 px). Mas também vale 1,0 em 2 e 4 px: nessa banda ele soma 0,8 de ganho ao `fine`, por cima do USM. *(verificação: corrigido)*
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

Leitura: textura de **2–4 níveis** (microtextura sutil) sai **atenuada ou com fase invertida**, enquanto a de **8–16 níveis** sai **1,4–1,6× mais forte**. Isso é expansão de amplitude. A linha de 2 níveis vale no agregado; os valores pontuais de 1–2 níveis não sobrevivem à quantização de 8 bits (uma grade de 1 nível de pico não é representável em RGBA8) e são [hipótese]. *(verificação: acrescentado)*

### 4.4 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| M1 | [código] | Cadeia montada: rede → spatial (Compressão, Degradês, Cor, Detalhe) → USM. Três quantizações em 8 bits depois do upload. No site novo, `processingMode` fica em performance, então o alvo `neural` é RGBA8. | alto |
| M2 | [código] | Redundância exata `fine` ≡ USM nos eixos (4.2). Detalhe 100% mais que duplica o realce que o USM já faz em 2–4 px. | alto |
| M3 | [código] | O `clarity` é a única parte que também cobre 6–16 px; em 2–4 px ele é tão redundante com o USM quanto o `fine` (ganho 1,0). *(verificação: corrigido)* | médio |
| M4 | [código, emulação] | Ganho efetivo de Detalhe 1 + USM 2 em textura média e fina: ~1,4–2,3×, contra 1,0–1,56× do USM sozinho. | alto |
| M5 | [código, emulação] | A rede a 100% **atenua** textura de 1–4 níveis, mais forte em sombras, e põe ~3 níveis de overshoot em degrau duro. [doc] Rede 50% na bancada: `detail` 0,9516 → 0,9546, `energy` igual, **halo +18%**. | alto |
| M6 | [código, emulação] *(verificação: reclassificado)* | Degradês 100%: raio 8, taps em `floor(d·8)`. A `textureMask` só protege extremos de raio 1. Uma grade de período 6 ou 16 px com 1 nível sai com **−0,2×** (fase invertida); com 4 níveis, 0,40–0,67×. Textura aleatória de σ 2–3 níveis cai para 0,77–0,87× (contra 0,91–0,97× com 0,6). | alto |
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
| M17 | [código] | A dica do painel para Detalhe é só "Realça microtextura." (`src/panel.js:813`); nada avisa que o `fine` é o mesmo passa-alta do USM nem que os presets param em 35% (`src/restoration-engine.js:308-313`). A redundância de 4.2 não chega ao usuário por nenhum caminho. *(verificação: acrescentado)* | médio |
| M18 | [código] | O teste de regressão do degrau ("98–122 no degrau 100/120") roda com Nitidez 0 (`tools/regression-harness.py:14`). Com USM 2 por cima, a emulação dá 94,7–125,3 e, na cadeia relatada, 93,5–125,5; no degrau 60/140, ±9 níveis. Nenhum teste cobre Detalhe + USM, que é o caso real (M11). *(verificação: acrescentado)* | médio |
| M19 | [código] | Esta seção analisa Degradês = 1,0. Com Adaptar ligado (padrão), a 18 Mb/s o Degradês efetivo é 0,92 em 1080p60 e **0,68** em 1080p30 ou 720p (2.5), perto do Natural (0,6): aí M6/M7 perdem boa parte da força (`untouched` < 0,5 cai de 21–27% para 0,3–0,5% dos pixels). Conferir `status.adaptive` antes de recomendar baixar o Degradês. *(verificação: acrescentado)* | médio |

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
| Padrão v9 sem nitidez (Compressão 0,5, Degradês 0,3, Cor 0,75, Detalhe 20%) *(verificação: corrigido)* | 0,711 | 0,768 | 0,054 | 0,9391 | 3,82 (+1,5%) |
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

Corroboração indireta [doc]: no Poco, uma cópia RGBA16F custa 2,4× a mesma cópia em RGBA8 (`docs/medicoes/spec2/poco-passes-r1.json`). Contraevidência [doc], no mesmo arquivo: o `spatial` escrevendo em RGBA16F custou o mesmo que em RGBA8 (2,933 contra 2,952 ms; `docs/spec2-estudo.md:253`, "spatial: igual no Poco"), e extrapolar a cópia pura (0,307 ms para 8 B/px) daria ≈ 1,7 ms para os 44 B/px da rede, abaixo dos 2,38 ms medidos. A aritmética da rede não é desprezível; a banda explica parte, não "boa parte", do custo. *(verificação: corrigido)*

### 5.2 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| N1 | [código] | Arquitetura 3 camadas / 8 canais / 5×5 (`tools/nn_glsl.py:3-37`; o gerador recusa outra arquitetura). Os shaders no userscript do site novo batem byte a byte com `generate('src/nn/restore.json')`. Um campo de 5×5 não cobre um bloco 8×8: a rede corrige transições locais e ruído, mas não reconstrói textura descartada pelo encoder (coerente com `docs/analysis-v9.1.md:38`). | médio |
| N2 | [código] | Ligar a rede aumenta as buscas de textura do tratamento em **+70%** (de 40 para 68 por pixel), 18 delas em RGBA16F. | médio |
| N3 | [hipótese] | Banda de DRAM ×3,2 com a rede: o custo viria em boa parte da ida e volta dos 32 B/px de features em fp16. Pesa em energia e temperatura. | médio |
| N4 | [código] | As duas passadas da rede são **highp**, enquanto o spatial e o SGSR usam `mediump` no Adreno (`tools/nn_glsl.py:20`; `src/restoration-engine.js:403`). Uma variante mediump é [hipótese] de ganho; o spatial ganhou −21%. Exige regressão contra o JAX. | médio |
| N5 | [código] | No site novo a rede roda em WebGL2 sob três condições: `filtered`, `EXT_color_buffer_float` e `neuralAllowed` (`:353-355`). Roda na resolução da **fonte**: um stream 720p custa 44% de um 1080p. A saída fica em RGBA8, porque o modo é sempre performance. Sem float targets, ela é pulada **sem aviso** (só `metadata.floatTargets` na exportação). [doc] Na bancada o WebView 156 do Poco tinha a extensão: o caso `filtro-1080-neural` de `poco-base.json` passou pelo motor real (`tools/device/spec2/bench.js:84-86`) e a rede custou +5,2 ms, o que só acontece com `floatTargets` verdadeiro. Em partida, confirmar na exportação. *(verificação: acrescentado)* | alto |
| N6 | [código] | Na configuração relatada, a rede é a **primeira** etapa cortada pela cadência, e 3/6/10 ms se comportam igual. `adaptive=false` **não** afeta a rede. Só "Nunca" impede o corte (2.4). | alto |
| N7 | [código] | 100% é a saída treinada: não existe >1. A correção é só de luma, aplicada igual em RGB (Cb/Cr preservados). **5% custa o mesmo que 100%**: o único corte de custo é 0%. A adaptação por QP não modula a rede. | médio |
| N8 | [código, cálculo local] | Resposta com os pesos reais (5.3): ela **atenua** textura de 1–6 níveis em 2–4 px. Textura aleatória de σ 2/4/8/16 níveis sai com 0,61/0,77/0,91/1,00. Um degrau de 2 níveis vira rampa de ~3 px. Uma borda de 51 níveis ganha −2/+1 nível de sub e sobressinal. | alto |
| N9 | [código] | Treino:<br>**Existe**: 16 cenas sintéticas (texturas fora da avaliação, luz, degradê, HUD); pan de 4 px/quadro + zoom de 0 a +4% e volta (`make_eval_set.py:86`) *(verificação: corrigido)*; x264 veryfast/zerolatency, sem B-frames, 8–25 Mb/s sorteados por cena; quadros P; perda L1 + 0,5·L1 do Laplaciano; 4000 passos (≈13 épocas) pelo comando de `docs/analysis-v9.1.md:61` [doc] — `train.py:17` usa 8000 por padrão e o log do treino (`output/nn/`) está no `.gitignore`, então o número de passos dos pesos publicados não é verificável no repositório *(verificação: corrigido)*; holdout das **mesmas** cenas.<br>**Não existe**: perda temporal ou entrada multi-quadro; perda perceptual; condicionamento por QP; treino ciente de fp16 ou quantização; dados de jogo real ou do encoder do xCloud; métrica de cintilação. As docstrings citam `docs/analysis-v10.md` e `docs/analysis-v8.7.md`, que **não existem**. | alto |
| N10 | [hipótese] + [código] | Domínio diferente do stream real. O xCloud só aceitou H.264 e recusou o perfil High (`docs/release-v9.3.md`, `release-v9.5.md`), e o comando de treino gera perfil **High** (conferido: um clipe codificado com o comando exato de `make_eval_set.py:98-101` dá `profile=High` no ffprobe) [código]. O treino cobre 0,064–0,201 bpp em 1080p60; a ~18 Mb/s um stream 1080p dá 0,145 bpp a 60 FPS (dentro), mas **0,289 bpp a 30 FPS (acima)**; se o stream for 720p (item 5), 0,326 a 60 FPS e 0,651 a 30 FPS, 1,6–3,2× o máximo do treino. O `timeline[].bitsPerPixel` exportado já usa o tamanho real do quadro (`src/restoration-engine.js:292`). O perfil H.264 que o xCloud entrega segue [hipótese] até ler `net.profile`. Num stream mais limpo, a rede pode tratar textura real como ruído. *(verificação: reclassificado)* | médio |
| N11 | [doc] | Custo no Poco, sempre bancada: 1,96–2,21 ms (Spec 1, rajada, imagem sintética); 2,33–2,59 ms (Spec 2, rajada, quadros H.264); **+5,21 ms em sessão a 30 FPS** (11,48 → 16,69 ms, ocupação 34,3% → 50,1%). Em sessão, a rede custa ≈ 70% do spatial padrão v9 inteiro (7,5 ms = 11,48 − 3,95 do caso "vazio") e mais que qualquer filtro isolado (Degradês +3,9 ms). *(verificação: corrigido)* A dica do painel ("~30%") está subestimada. Não medido: 60 FPS, WebRTC, `play.xbox.com`, Chrome, a config relatada. | alto |
| N12 | [doc] | Ganho visual pequeno e confundido:<br>• v9.1: SSIM 0,930 → 0,934, mas comparando USM 3 com USM 2,5. Baixar só a nitidez (3 → 2) já reduz a cintilação em 9%.<br>• Spec 2, na **mesma** USM 3 e com rede 50%: SSIM 0,9258 → 0,9255, PSNR igual, `detail` 0,952 → 0,955, **halo +18%**.<br>• Não existe medição visual no Adreno: o SwiftShader roda tudo em highp. | alto |
| N13 | [doc] | A cintilação com a rede **não foi medida depois da v9.1**. As sequências da Spec 2 não incluem a rede. | alto |
| N14 | [código] | O que mudou desde a v9.1 em volta da rede (ela mesma não mudou): padrões, spatial em mediump com variantes, SGSR só com saída maior, WebGPU que devolve ao WebGL2, margem de cadência por caminho e o host do site novo sempre em performance. As medições da v9.1 **não valem como baseline** da v10. | médio |
| N15 | [código] | Dicas do painel desatualizadas: "~30% mais GPU" (`src/panel.js:814`, `:892`) e "Com Reconstrução neural, use ~2,5" (`:946`). Com o padrão atual em 2, esse texto leva a **subir** a nitidez. | baixo |
| N16 | [teste no Poco] | Antagonismo: rede, Compressão e Degradês suavizam a mesma faixa que Detalhe e USM reamplificam. A v9.1 só testou a rede com Detalhe 0,2. | alto |
| N17 | [código] | Não há interop WebGL2/WebGPU: são dois canvases, e um quadro com a rede troca o renderizador inteiro. Isso reinicia o pacer e a cadência. Com "WebGPU", ligar ou desligar a rede pode causar engasgo pontual. Para medir a rede, use WebGL2 ou Auto. | médio |
| N18 | [hipótese] | A rede em WebGPU (compute com tiles + `shader-f16`) é possível em tese. Mas o WebGPU já gastou mais que o WebGL2 no Poco, e `shader-f16` não foi testado. Não é ponto de partida. | médio |
| N19 | [doc] | Riscos de uma rede nova, pelo que a v9.1 já mostrou: a rede maior custou ~14× sem ganho; pesar o Laplaciano não gerou detalhe; a acumulação temporal piorou o PSNR. | alto |

### 5.3 Resposta da rede a sinais sintéticos

Cálculo local com os pesos do repositório: fp64, borda replicada, listras quadradas de luma em torno de 0,5; ganho = projeção da saída no padrão de entrada (≈ ganho da componente fundamental). Em período ≥ 8 px o pico a pico sai **acima de 1** (1,1–1,2×) por sobressinal nas transições, enquanto a projeção fica abaixo de 1: a rede achata a textura e realça as bordas ao mesmo tempo, coerente com o halo +18% da Spec 2. *(verificação: corrigido)*

| Amplitude (níveis) | Período 2 px | 4 px | 8 px |
| --- | --- | --- | --- |
| 1 | ≈0 (−0,03 a 0,15 conforme o nível de fundo) *(verificação: corrigido)* | 0,53 | 0,76 |
| 3 | 0,48 | 0,71 | 0,85 |
| 6 | 0,75 | 0,87 | 0,93 |
| 12 | 0,94 | 1,01 | 1,00 |
| 24 | 1,02 | 1,04 | 1,02 |

Ressalva: o cálculo não inclui o fp16 dos features. Com quantização RGBA8 da entrada e da saída, 1 nível dá 0,00/0,50/0,83 e 3 níveis 0,50/0,67/0,91 (períodos 2/4/8): a quantização completa o apagamento da textura de 1 nível em 2 px. A frente de microdetalhe (4.3) chegou a valores coerentes de período 4 em diante; em período 2 as duas emulações divergem (0,26 contra ≈0–0,21) por convenção de amplitude e nível de fundo, numa faixa em que a rede é não linear. *(verificação: corrigido)*

### 5.4 Ganho visual documentado (bancada em SwiftShader)

| Fonte | Comparação | SSIM | PSNR | detail | Halo | Cintilação |
| --- | --- | --- | --- | --- | --- | --- |
| `analysis-v9.1.md:44-45` | v9 (USM 3) → rede + USM 2,5 | 0,930 → 0,934 | 33,95 → 34,09 | ≈ 0,98 | 0,75 → 0,90 | 4,49 → 4,35 (confundido com a nitidez) |
| `ganho-visual.json` | 1080p, USM 3 igual, rede 0 → 0,5 | 0,9258 → 0,9255 | 35,69 → 35,69 | 0,952 → 0,955 | 0,671 → 0,792 (+18%) | não medida |
| `ganho-visual.json` | 1280p, USM 3 igual, rede 0 → 0,5 | 0,9198 → 0,9182 | 34,99 → 34,95 | 0,723 → 0,728 | 0,430 → 0,524 | não medida |
| `spec2-estudo.md:236` (controle) | USM 3 → USM 2, sem rede | — | — | — | — | 4,85 → 4,42 (−9%) |

### 5.5 Medição decisiva no Poco (baseline antes de qualquer rede nova)

1. Prepare a sessão: adb Wi-Fi + `chrome://inspect`, "Aliviar GPU" = **Nunca**, para a cadência não cortar a rede, e Renderizador = **WebGL2**.
2. Grave quatro segmentos de ~2 min na mesma cena, na ordem A-B-C-D-A, trocando com `BxImageFilter.update({neural, detail})`. Cada troca tem um custo pontual que não é de regime: ligar a rede realoca ~41,5 MB de alvos (`src/restoration-engine.js:444-460`) e trocar Detalhe 1 → 0 compila uma variante nova do `spatial` de forma bloqueante (item 8). Descarte os primeiros ~5 s de cada segmento ao ler `hitches`, ou desconte um engasgo por troca. Voltar a A continua o mesmo segmento (a chave é a config; `:133-137`), então o arquivo terá 4 segmentos, com A em 2 visitas *(verificação: corrigido)*:

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

As quatro etapas rodam numa única passada `spatial`, na resolução do stream, com alvo RGBA8 (variante `spatial@mediump.1.1.4.1.1.0.1.1`, supondo Cor nas bordas 0,75 e modo Seletiva; o `mediump` está confirmado no Poco pela medição: `env.mediumFloat.precision = 10`). Compressão, Degradês e AA **suavizam**; Cor nas bordas re-aguça só o croma. Nenhuma realça luma. *(verificação: corrigido)* A redundância de realce é assunto da seção 4.

### 6.1 Tabela por etapa

| Etapa (valor) | O que faz (código) | Leituras extras/px | Risco para microtextura | Benefício esperado a ~18 Mb/s | A/B sugerido |
| --- | --- | --- | --- | --- | --- |
| Base do `spatial` | centro + cruz + máscara de textura (`spatial.glsl:40-51`) | 5 | — | — | — |
| Compressão 30% | degrau de 1 px de ~2–25 níveis entre lados lisos, por eixo; mistura ≤ 24% | +4 (mesmos texels do Detalhe) | baixo; amacia até 24% bordas reais lisas de baixo contraste (HUD) | **~nulo** (bancada: nada a 5–20 Mb/s); não trata ringing nem mosquito | 0 × 30 × 100% (100% só para localizar) em céu ou sombra |
| Degradês 100% | 4 amostras fixas a ~8,9 px; limiar 1,5–13,3 níveis; mistura ≤ 80%; dither | +4 | **médio**: mistura 79/51/14% nos extremos de 1/2/3 níveis p-p (monótonos sem proteção); em grão aleatório remove ~45–55% da amplitude, padrão-dependente; Detalhe (coring) e USM (noiseFloor) não devolvem textura < ~4 níveis *(verificação: corrigido)* | pequeno: banding −14% (100%) × −11% (60%) | 0 × 5% (só dither) × 60 × 100 em céu, neblina, caverna e asfalto |
| AA 0% | compilado fora (`SPATIAL_ANTIALIAS 0`); sem passada | 0 | nenhum desligado; ligado: alto (direção espelhada) | nenhum | não priorizar |
| Cor nas bordas 75% | CfL local de 2 amostras a ±2 px guiado pela luma; Y preservado | 0 (liso) ou +2 bilineares | muito baixo na luma; zera o Detalhe onde muda a cor > 2 níveis | pequeno: croma +0,08 dB (bancada) | 0 × 75 em HUD e texto vermelho/azul; WebGL2 × WebGPU com rede 0 |
| Detalhe 100% (P1) | realce de luma | +16 | (seção 4) | (seção 4) | (seção 4) |
| **Total** | | **29–31/px** | | | |

Leituras por quadro: 2.073.600 × 31 ≈ 64,3 M em 1080p e ≈ 28,6 M em 720p. Na bancada, o Degradês (4 leituras) custou **mais** que o Detalhe (16), então leitura não é proxy de tempo.

### 6.2 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| F1 | [código] | **Compressão** (`spatial.glsl:52-66`): sem grade de bloco. Fatores da mistura:<br>• `smallStep`: 1 nível → 0,03; 2 → 0,56; 3–10 → ~1; 20 → 0,30; ≥ 25,5 → 0.<br>• `smoothSides`: zera com variação vizinha > ~6 níveis.<br>• `confidence`: rejeita rampas.<br>A 30%, cada pixel anda até 12% do degrau, e o degrau cai no máximo 24%. | baixo |
| F2 | [código] | A Compressão **não remove ringing nem mosquito**: no modo Seletiva (padrão) qualquer oscilação zera `confidence` (`spatial.glsl:63`: a variação vizinha é igual ao degrau, razão 1 ≥ 0,7), e oscilações de ≥ 3 níveis ainda ativam a `textureMask` (0,82 com 3; 1 com ≥ 4); nos dois casos a mistura é zero. *(verificação: corrigido)* A dica "Remove blocos e ruído de compressão" (`src/panel.js:812`) promete mais do que faz. | baixo |
| F3 | [doc] | Ganho da Compressão ~nulo na bancada a 5–20 Mb/s ("nenhum, nem a 100% em 5 Mb/s"), ao custo de +2,4 ms em sessão (`docs/spec2-estudo.md:195`). Por isso o padrão da Spec 3 é 0 (item 3, "feito, pendente de validação", `docs/spec3-implementacao.md:33`; a ressalva do encoder está em `docs/spec2-estudo.md:380`). *(verificação: corrigido)* | médio |
| F4 | [hipótese] | Por que ela quase não age: o deblocking do H.264 transforma degraus em rampas, que o detector rejeita, e a rede, quando ligada, roda antes e limpa os degraus. Com a rede ligada, é redundância de custo. | baixo |
| F5 | [código] | **Degradês 100%**: raio `mix(2,8,1) = 8`, 4 amostras fixas em `(8,4)`, `(−8,−4)`, `(4,−8)`, `(−4,8)`. O peso de cada amostra cai de 1 (1,5 níveis) a 0 em 13,3 níveis (9,2 com 0,6), com meio peso em ~7,4 níveis (5,4 com 0,6): um degrau de 5 níveis é puxado ~28% no pixel adjacente, um de 10 níveis quase nada. A mistura vai até 80% (48% com 0,6). É a configuração mais agressiva do slider. [doc] O custo **não** depende do raio (raio 2 e 8 custaram 1,71 ms na bancada, `docs/spec2-estudo.md:263`). *(verificação: corrigido)* | médio |
| F6 | [código, emulação] | O Degradês 100% apaga parte da microtextura de 1–3 níveis em áreas quase lisas. Os pesos de mistura nos pixels extremos são 79/51/14% para 1/2/3 níveis p-p, mas a textura removida depende do padrão (emulação do shader): em grão aleatório sobra 45–56% da amplitude (erosão ~45–55%); listras ou xadrez de 2 e 4 px passam quase intactos, porque as amostras a ±8/±4 px caem em fase; períodos de 3 e 6 px invertem. A 60% sobra 57–70% (erosão ~30–43%, isto é, ~70–80% da erosão de 100%). O que vem depois não devolve essa textura: o coring do Detalhe (`t = 1,5/255 + 0,06·faixa + 0,04·faixa larga`, `spatial.glsl:129-130`) zera o realce em textura de 1–3 níveis mesmo sem Degradês (`untouched` fica ≥ 0,9 nessas amplitudes, então não é ele o bloqueio), e o USM não age com faixa local ≤ 4 níveis (`noiseFloor`, `tools/build.py:38`). **Nada devolve a textura.** *(verificação: corrigido)* | médio |
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
| F21 | [código] | **Quem impede devolver textura de 1–3 níveis é o coring do Detalhe, não o `untouched`.** `fine` e `clarity` são calculados a partir da fonte `c` (saída da rede), não do resultado do Degradês (`spatial.glsl:122`, `:128`), e o coring `t = 1,5/255 + 0,06·faixa + 0,04·faixa larga` (`:129-130`) deixa \|dL\| em 0,00–0,07 nível para grão de 1–4 níveis p-p, com ou sem Degradês. Vale também para a seção 4: o Detalhe 100% não atua em microtextura abaixo de ~3 níveis, só em textura média. Onde o alisamento é parcial (0,5–2 níveis), o Detalhe devolve parte do que o Degradês tirou, o que reforça o mosaico de M7. *(verificação: acrescentado)* | médio |
| F22 | [código] | **Amostragem fixa em fase com texturas periódicas.** Os offsets (±8, ±4)/(±4, ±8) são múltiplos de 4: listras e xadrez de período 2 ou 4 px passam pelo Degradês 100% quase intactos (71–100% da amplitude), e períodos de 3 e 6 px saem com correlação negativa (inversão). O efeito sobre textura é padrão-dependente, não uma fração fixa (`spatial.glsl:74-75`). *(verificação: acrescentado)* | médio |
| F23 | [código] | **Degradês 100% borra bordas reais de baixo contraste (≤ ~7 níveis) numa escada de 16 px.** Com meio peso em ~7,4 níveis, um degrau real de ~5 níveis entre regiões lisas (sombra suave, névoa) vira cinco subdegraus espalhados por ±8 px, com o pixel adjacente puxado ~28%; degraus ≥ 10 níveis quase não mudam (`spatial.glsl:77`, `:82-83`). É um efeito de escala maior que a microtextura e contribui, plausivelmente, para o aspecto "liso demais" em cenas lisas. A própria dica do painel avisa: "alto demais apaga textura" (`src/panel.js:812`). *(verificação: acrescentado)* | médio |

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
| Degradês 100% | **60%** (padrão); 30% se a prioridade for textura | código e emulação (erosão de ~45–55% do grão de 1–3 níveis; Detalhe e USM não devolvem textura < ~4 níveis; conferir antes o Degradês efetivo com Adaptar, M19) + bancada (−14% × −11%) *(verificação: corrigido)* | sim: 100 × 60 × 30 × 0 em céu, neblina e asfalto; 0 × 5% para o dither |
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
5. Repita uma vez em pan lento. Compressão e Degradês não têm componente temporal [código], mas [hipótese] baixar o Degradês deixa mais grão do stream, que muda a cada quadro, então pode haver mais ruído visível em movimento; o pan decide. *(verificação: reclassificado)*

## 7. P2 — Renderizador e checagem das afirmações do diagnóstico

### 7.1 Renderizador efetivo no play.xbox.com

| Painel: Renderizador | Rede / Temporal | O que o código faz | Linhas |
| --- | --- | --- | --- |
| Auto (padrão) | qualquer | WebGL2; nenhum canvas WebGPU é criado | `src/image-filter.js:223`, `:260`; `src/restoration-engine.js:383-384` |
| WebGL2 | qualquer | WebGL2 | `src/image-filter.js:260` |
| WebGPU | rede > 0 ou temporal > 0 (**config relatada**) | cria o canvas e o device WebGPU, mas o quadro é desenhado pelo WebGL2 ("Temporal e Reconstrução neural só rodam no WebGL2"); o canvas WebGPU fica com `visibility:hidden`, ainda ocupando layout (no site novo, em fluxo e sem posicionamento: R3) *(verificação: corrigido)* | `src/image-filter.js:261-264`, `:230`; `src/restoration-engine.js:375`, `:379` |
| WebGPU | rede 0 e temporal 0 | o WebGPU desenha; o canvas WebGL2 fica com `opacity:0`; **no site novo o canvas WebGPU fica sem posicionamento** (R3) | `src/image-filter.js:231`, `:236-238`, `:248` |
| WebGPU indisponível ou com falha | — | volta ao WebGL2 sem recarregar | `src/image-filter.js:243-244`, `:259`, `:261` |

### 7.2 Achados

| ID | Classe | Achado | Impacto |
|---|---|---|---|
| R1 | [código] | "Auto" é sempre WebGL2: `AUTO_WEBGPU` está vazio. Além disso, `status.renderer.probe`, passado a `autoRenderer`, **nunca é atribuído** em `src/`, então mesmo uma lista preenchida não promoveria o WebGPU. É um defeito latente, sem efeito hoje. | baixo |
| R2 | [código] | Com rede ou temporal > 0, a escolha do renderizador não muda o quadro, porque o quadro inteiro vai para um motor ou para o outro (não há mistura). Com "WebGPU" escolhido, o device e o canvas ficam ociosos. Comparar WebGL2 × WebGPU só faz sentido com rede 0 e temporal 0. | médio |
| R3 | [código] | **Defeito no site novo: o canvas WebGPU não herda o posicionamento.**<br>• O posicionamento vem só da regra `canvas.bxif-play-canvas` (`src/play/host.js:11`), e a classe é posta apenas no canvas WebGL2 (`:51`).<br>• `startGpu` insere o canvas WebGPU sem a classe (`src/image-filter.js:248`), e `syncCanvas` copia só `style.cssText`, vazio no site novo (`:236-238`).<br>• Numa simulação da estrutura documentada em Chrome headless, ele ficou estático, com 1920×1080 px CSS **abaixo** do vídeo, e a página ganhou rolagem. Reproduzido na verificação (`position:static`, `display:inline`, retângulo 1920×1080 logo abaixo do vídeo); com `overflow:hidden` no container, ele fica todo fora da área visível e a área do vídeo fica **preta** (vídeo e canvas WebGL2 com opacity 0). Qual dos dois sintomas aparece depende do CSS real do site [teste no Poco]. *(verificação: corrigido)*<br>• O comentário de `image-filter.js:218-220` assume o site antigo (`#game-stream canvas`). O `play-harness` não testa WebGPU.<br>• Conferido nesta consolidação: classe e `syncCanvas` como descritos. | alto (com WebGPU) |
| R4 | [doc] | Os números da v10/Spec 4 (10,2 × 12,0 ms; SGSR 4,5–5,2 × 7,8–8,1 ms) são de bancada:<br>• bancada `tools/device/spec4/session.html` no WebView 156, clipe game30 1080p a 30 FPS, saída 2276×1280;<br>• padrões da Spec 3, sem rede, `gpuBudget` 0, 20 s por caso;<br>• GPU pelo Perfetto, incluindo a composição;<br>• em rajada a ordem se inverte (10,38 × 3,25 ms).<br>Não valem para saída Nativa com rede, Detalhe e Degradês a 100%. | médio |
| R5 | [código] | Não há port nem medição de rede ou temporal em WebGPU (`src/webgpu/` só tem cas, common, copy, easu, rcas, sgsr e spatial). Também não existe "custo de transição WebGL↔WebGPU" por quadro, porque não há interop. | médio |
| R6 | [código] + [doc] | Importação: os dois caminhos fazem 1 conversão YUV→RGB e 1 escrita RGBA8 por quadro (~7,9 MiB em 1080p). O WebGPU faz `importExternalTexture` + uma cópia, porque ler a textura externa em cada tap seria 13–30 conversões por pixel. A vantagem "sem cópia" só aparece em rajada; no caminho inteiro em sessão, o WebGPU fica +1,7–1,9 ms/quadro mais caro. | baixo |
| R7 | [teste no Poco] | A composição no site real difere da bancada: vídeo com opacity 0 + canvas WebGL2, e com WebGPU mais um canvas. Na bancada só o canvas medido ficava visível. O custo não foi isolado. | médio |
| R8 | [doc] | A conversão de cor do WebGL2 no Adreno difere da referência (bordas de croma 3–4 níveis; máx. 74–93); a do WebGPU bate. Com a rede ligada, o WebGPU não está disponível; no site novo ainda há o R3. A perceptibilidade não foi avaliada. | baixo |
| R9 | [código] + [doc] | Sem cronômetro, o "GPU p95" do painel no Poco com WebGL2 é **estimativa** (fence/cadência). Que o WebView do Poco não tem `EXT_disjoint_timer_query_webgl2` consta nas medições (`poco-sessao-timestamps.json`, `env.timer:false`) e na partida real da v9.7.1 (`docs/release-v9.7.1.md:16`). Sem cronômetro, `budget.sample` nunca roda (`src/restoration-engine.js:480`), `budget.p95` fica nulo, e as amostras `gpu` por segmento da medição exportada vêm do *fence* (`:494`; `meta.gpuMethod:'fence'`): limite superior que inclui a fila, não tempo de GPU. O custo real deve vir do Perfetto. *(verificação: reclassificado)* | médio |
| R10 | [código, emulado] | **Trocar o renderizador durante uma medição desvia a medição.** Cada motor tem o seu `diagnostics`, e `startMeasurement`/`exportMeasurement` usam o `activeEngine` do momento (`src/image-filter.js:52-62`, `:228`). Emulado com o `createDiagnostics` real: o export no motor errado grava um JSON **sem segmentos** (`started:null`), o painel deixa de mostrar "medindo", e a gravação original continua aberta; se o renderizador voltar antes do export, ela sai inteira, mas o intervalo fora conta como tempo do segmento (`durationMs`, `drawFps`). Protocolo: inicie cada medição só depois que `status.renderer.active` estabilizar, use uma medição por renderizador e confira `segments.length` e `meta.api` no JSON. *(verificação: corrigido)* | médio |
| R11 | [código] | O app Android não força 1080p no site novo: o `1080p-hq` só existe no wrapper de `www.xbox.com` (`MainActivity.java:219-231`), não em `wrapPlay` (`:235-241`). Reforça o item 5 do resumo. | alto |
| R12 | [código] | O bitrate do painel e do HUD está em **Mb/s** (`src/restoration-engine.js:288`; `src/panel.js:1026`, `:1163`; `src/hud.js:162`, `:252`). Resolve a dúvida de unidade do diagnóstico. | baixo |
| R13 | [código] | Não existe controle chamado "tempo entre quadros" (seção 11). As leituras "tempo = `gpuBudget` 10" e "adaptação = `gpuBudget` 0" se **excluem**, porque são o mesmo controle. | médio |
| R14 | [código] | O app já tem o que a fase de adb precisa:<br>• `setWebContentsDebuggingEnabled(true)`;<br>• ponte `BxAndroid` (`getRefreshRates`, `getRefreshRate`, `setRefreshRate`, `getAppInfo`, `copyText`, `saveFile`);<br>• exportação para `Downloads/xCloud ImageFilter/bx-v10.0.0-diagnostics-<epoch>.json` (confirmada em partida real na v9.7.1, `docs/release-v9.7.1.md:12`) *(verificação: corrigido)*;<br>• Game Mode (performance e battery);<br>• taxa de tela fixável. | médio |
| R15 | [teste no Poco] | O console no logcat **não é garantido**: o app usa um `WebChromeClient` padrão, sem `onConsoleMessage`. O canal confiável de console é o DevTools remoto. | baixo |
| R16 | [código] | Dos scripts de `tools/device`, só os que **não navegam** servem numa partida real: `spec2/drive.cjs` com URL `-`, `run-in-webview.cjs` e `gpu-probe.cjs`.<br>• `spec2/meas.cjs`, `spec2/sweep.cjs`, `spec4/meas.cjs` e `spec4/suite.cjs` navegam para `bench.invalid` e tirariam o WebView do jogo.<br>• São reaproveitáveis: `pocoState()`, `trace()` de `sweep.cjs` (feito para host Windows) e `pftrace.py`. | médio |
| R17 | [código] | O Perfetto do repositório (`perfetto-linha-do-tempo.pbtx`) cobre só **18 s**. As séries de 10–20 min precisam de uma cópia com duração maior e `write_into_file`, não testada no repositório (9.2). Alternativa: janelas de 18 s no início, aos 10 min e no fim. | baixo |
| R18 | [doc] | **Existe uma medição em partida real no Poco, não citada até aqui** (`docs/release-v9.7.1.md:7-19`): site antigo (`www.xbox.com`), WebView 155, *Gears of War: E-Day*, captura direta e Fluidez Equilibrada. O servidor mandou **30 FPS no jogo e ~60 nos menus**; **9 Mb/s em 1080p30** (0,15–0,18 bit/pixel); o WebView não informa `qpSum`; **sem cronômetro de GPU**; 4.659 de 4.662 quadros decodificados chegaram à tela; RTT 20 ms, perda 0,008%; exportação para `Downloads/xCloud ImageFilter` funcionou. O JSON não está no repositório. É a única referência de partida real: os ~18 Mb/s relatados são o dobro do que essa sessão viu, e ela sustenta R9 e R12 fora da bancada. *(verificação: acrescentado)* | médio |

### 7.3 Verificação factual da seção 2 do diagnóstico

| # | Afirmação (resumo) | Veredito | Correção ou complemento |
| --- | --- | --- | --- |
| 1 | `host.js` acha `<video>` com `srcObject` e trilha WebRTC ativa, cria `WebGL2Player`, põe o canvas sobre o vídeo e deixa a fonte transparente; faz verificação periódica e observa o DOM | **Correta** (`src/play/host.js:28-39`, `:50-51`, `:10-11`, `:60`, `:180-182`) | Com player ativo, a mutação **não** dispara `scan` (`queueScan` retorna se houver `player`, `:89`): só o intervalo de 1 s detecta o fim. Espera `loadeddata` se `videoWidth` = 0. Põe `position:relative` no pai estático. |
| 2 | `play-xbox-com.md`: validado em harness e site sem login; pede validação logada; não herda resolução/bitrate forçados | **Correta** (`docs/play-xbox-com.md:68-79`, `:83-96`) *(verificação: corrigido)* | No app Android o `1080p-hq` só existe para `www.xbox.com` (R11). |
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
   - Três pontos só o Poco decide: se o stream é 1080p, se `floatTargets` é true (a bancada do Poco já é favorável: a rede rodou lá com alvos RGBA16F) e se `budget.revision` continua 0. *(verificação: corrigido)*
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
   - Ganho efetivo com coring e limites: 1,4–2,3× para Detalhe 1 + USM 2 (sem a rede), contra 1,0–1,56× do USM sozinho; a cadeia relatada completa dá 1,4–1,6× em 8–16 níveis. *(verificação: corrigido)*
   - O `clarity` é a única parte que também cobre 6–16 px; em 2–4 px ele soma mais 0,8 de ganho por cima do USM. *(verificação: corrigido)*
   - A rede não é redundante, é **antagônica**: atenua a textura fraca que Detalhe e USM depois reamplificam.
   - Degradês 100% remove textura fraca e, via `untouched`, desliga o Detalhe nessas áreas.
   - Medição de bancada: Detalhe 20% sobre USM 2 soma, no quadro único (`score`), +0,033 de `detail`, +0,123 de `energy` e +25% de halo; na sequência de 18 quadros (tabela 4.5), +0,037, +0,135 e +32%, com +6% de cintilação. Detalhe 100% nunca foi medido. *(verificação: corrigido)*
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
| 9 | "Encerrar e exportar medição"; puxar o JSON e o `.pftrace`; "Copiar configuração" | segments e timeline; conferir `segments.length` > 0 e `meta.api`; no WebGL2 do Poco, `gpu.*` por segmento é fence (`meta.gpuMethod`), não tempo de GPU — usar o Perfetto *(verificação: acrescentado)* |
| 10 | Janela curta (18 s) num engasgo: Perfetto curto + DevTools Performance + LoAF + 3º rVFC | sched, frametimeline, GC, tarefas longas, CPU e folga por quadro |

Variáveis, uma de cada vez e na mesma cena:
- (a) neural 100% × 0%;
- (b) Fluidez desligada × Equilibrada × Equilibrada + Direta (com Direta, `videoSkipped`/`origin.missed` somem do export: ler `pacerDropped` e `wait`) *(verificação: acrescentado)*;
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

# Perfetto longo [hipótese, não testado]: sweep.cjs roda o perfetto em primeiro plano, com 16 MB e só gpu_work_period;
# --background, write_into_file e a config por stdin não foram exercitados no repositório (R17)  (verificação: corrigido)
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

# Logs e quadros (hipóteses a conferir: o console do WebView vai ao logcat sob a tag chromium;
# o gfxinfo cobre os quadros do WebView, desenhados pelo compositor do Chromium)  (verificação: corrigido)
adb logcat -v time | grep -E "chromium|BxImageFilter|Bx Restoration|BxRestoration"
adb shell dumpsys gfxinfo com.imagefilter.xcloud reset
adb shell dumpsys gfxinfo com.imagefilter.xcloud

# Medição exportada
adb pull "/sdcard/Download/xCloud ImageFilter/"
```

### 9.3 Snippets de console (DevTools remoto)

```js
// Estado do motor e do orçamento
const P=BxImageFilter.playHost.player(),E=P.bxEngine; // bxEngine é sempre o WebGL2; com WebGPU ativo, orçamento e floatTargets do motor que desenha estão em P.bxRender (sem `programs`/`ext`)  (verificação: corrigido)
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

## 10. Ranking impacto × esforço × risco

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
| 5 | Linha de base Original × Tratada a 30 **e a 60 FPS**: separar o ritmo e os pulos do `<video>` do custo do tratamento (a 60 FPS, os pulos sozinhos podem acionar o corte da neural, F17) *(verificação: corrigido)* | alto | baixo | baixo |
| 6 | Fixar 60 Hz e testar 120 Hz como variável à parte | médio | baixo | baixo |
| 7 | Fluidez + Captura Direta a 60 FPS (pulos do `<video>`) | médio | baixo | médio |

Candidatos de código para a fase 2, **só após aprovação**:

| # | Mudança | Impacto | Esforço | Risco |
|---|---|---|---|---|
| a | Instrumentação mínima (3.5: passes, passe final, variante do `spatial`, `budget.reason` na exportação, eventos com horário e duração — compilação, realocação, corte —, CPU por quadro, folga do vsync) | alto | médio *(verificação: reclassificado)* | baixo |
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
| p | Dica de "Aliviar GPU" condicionada a `status.measurement === 'cadence'` (3/6/10 ms equivalentes sem cronômetro) *(verificação: acrescentado)* | baixo | baixo | baixo |
| q | Rotular o GPU do WebGL2 sem cronômetro como "≈ fence (limite superior)" no painel, HUD e JSON (R9) *(verificação: acrescentado)* | médio | baixo | baixo |
| r | Teste de regressão para os limites empilhados Detalhe 1 + USM 2 em degrau (M18) — fixar o teto só após medir na GPU real *(verificação: acrescentado)* | médio | baixo | baixo |
| s | Mostrar no painel/HUD os valores efetivos de Compressão/Degradês/Detalhe quando Adaptar os altera (M19) *(verificação: acrescentado)* | médio | baixo | baixo |
| t | Taxa da tela e resolução da fonte na timeline da medição (F10) *(verificação: acrescentado)* | médio | baixo | baixo |
| u | Dicas do painel de Detalhe (sobreposição com a Nitidez; presets ≤ 35%) e de Degradês (borra bordas ≤ ~7 níveis) (M17, F23) *(verificação: acrescentado)* | médio | baixo | baixo |
| v | Metadados do treino em `restore.json` (passos, seed, LAP, holdout) e docstrings corrigidas (N9) *(verificação: acrescentado)* | baixo | baixo | baixo |
| w | `untouched` calculado antes do bloco de croma (F14) — só após A/B chroma 0 × 0,75 com Detalhe ligado *(verificação: acrescentado)* | baixo | baixo | baixo |
| x | Tirar trabalho repetido do caminho rVFC (`normalize` 3×, `JSON.stringify`, `getUniformLocation`) — só se um traço mostrar GC em quadros longos (F13) *(verificação: acrescentado)* | baixo | baixo | baixo |

A lista deduplicada, com arquivos, pré-requisito de medição e esforço de raciocínio sugerido, está em 12.1.

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

**Método.** Seis verificadores do modelo Fable, em esforço alto, um por frente, conferiram cada achado e cada afirmação das seções 1–11 contra o código do commit `16e64fc`, as docs e as medições em `docs/medicoes/`, reexecutando `framePlan`/`createBudget`/`resolveOutput` em `vm`, refazendo as contas e emulando shaders em numpy quando preciso; um único editor aplicou as correções no documento, marcadas no texto com *(verificação: corrigido | reclassificado | acrescentado)*.

| Frente | Confirmados | Parciais | Reclassificados | Refutados |
| --- | --- | --- | --- | --- |
| P0 — O que realmente roda | 21 | 7 | 2 | 1 |
| P0 — Frametime, captura e apresentação | 14 | 7 | 0 | 0 |
| P1 — Microdetalhe × ruído/cintilação | 17 | 5 | 1 | 0 |
| P1 — Rede neural atual | 16 | 5 | 1 | 0 |
| P2 — Compressão, Degradês, AA e croma | 20 | 6 | 1 | 0 |
| P2 — Renderizador e checagem do diagnóstico | 20 | 3 | 1 | 0 |
| **Total (148 itens)** | **108** | **33** | **6** | **1** |

Itens não confirmados e o que foi feito com cada um:

| ID | Frente | Veredito | Correção aplicada |
| --- | --- | --- | --- |
| P0A-9 (dither "somado") | P0 roda | refutado | O spatial quantiza em inteiro e o 2º ruído (\|n\| < 0,5 nível) arredonda de volta; o item 9 do resumo já trazia a correção. Nada a mais a mudar. |
| P0A-2 / item 2 / 2.2 linha 5 / 2.6 | P0 roda | parcial / reclassificar | Filtro "bilinear" do compositor → [hipótese]; 2620×1280 é a caixa do canvas, a imagem 16:9 ocupa 2276×1280; origem do "806×394" explicada. |
| 2.3 / 2.6 "Auto ≤ 1123 px" | P0 roda | parcial | Limiar corrigido para ≤ 1127 px (degraus de 8 px; 1128 → 2005×1128). |
| P0A-5 / seção 8 resp. 1 | P0 roda | parcial | Registrada a evidência de bancada de `EXT_color_buffer_float` no WebView do Poco (2.3, item 3, N5). |
| P0A-11 / 2.4 | P0 roda | parcial | Evidência de "falso positivo" movida para `docs/spec1-estudo.md:111`; acrescentados o ramo `live === null` (referência da Comparação, margem 0,95) e a classe [doc] da calibração 0,8/0,9. |
| 2.7 tráfego de memória | P0 roda | reclassificar | ≈ 91 MB/quadro marcado [hipótese], com a premissa de cache perfeito e o teto bruto (~380 MB) explicitados. |
| seção 0 (configuração) | P0 roda | parcial | Padrões `adaptive = true` e `gpuBudget = 6` acrescentados. |
| F2 / item 6 (2º marcador) | P0 frametime | parcial | "Descartados pelo `<video>`" → "sem callback rVFC"; os ~2% da v9.6.1 são buracos RTP do servidor, não pulos do `<video>`. |
| F3 / item 6 (3º marcador) | P0 frametime | parcial | "84 de 110" → 84 das 91 linhas a 30 FPS; "alterna 16,7/50 ms" → p50 33 ms com ≥ 5% dos intervalos em ~50 ms; registrado que a mesma condição deu 34 ms em outra rodada. |
| F4 / item 7 | P0 frametime | parcial | "GPU não aparece" → "subestimada; só quando a fila bloqueia a CPU" [hipótese]; `gfxinfo` cobrir o WebView é [hipótese]. |
| F5 | P0 frametime | parcial | −2,7 ms do mediump era de 1280p; escalado a 1080p ≈ −1,9 → estimativa 14–15 ms (42–45% / 84–89%). |
| F8 / item 8 (1º e 3º marcadores) / 3.3 | P0 frametime | parcial | 325,8 ms são de 13 programas da Spec 2 (sem SGSR nem variante); hoje deve passar de ~400 ms [hipótese]; ausência de `KHR_parallel_shader_compile` → [doc]. |
| F9 / item 8 (2º marcador) / 3.3 | P0 frametime | parcial | Diagnóstico não realoca nada; neural liga/desliga recria ~41,5 MB, não 49,8. |
| F10 | P0 frametime | parcial | O "+1 ponto" do achado bruto era do caso a 30 FPS; o documento não citava o número, nada a mudar. |
| P1A-3 / M3 / item 11 / 4.2 / resp. 3 | P1 microdetalhe | parcial | `clarity` não é "a única parte não redundante": ganho 1,0 em 2–4 px; é a única que também alcança 6–16 px; amostras a ≈ 3,5 px. |
| P1A-4 / 4.3 / Método | P1 microdetalhe | parcial | Tabela de ganho calculada em float; com 8 bits os valores a ≥ 4 níveis mudam ≤ 0,2 e as linhas de 1–2 níveis são só indicativas. |
| P1A-6 / M6 / item 13 | P1 microdetalhe | reclassificar | [código] → [código, emulação] para os percentuais e os fatores 0,40–0,87×. |
| item 14 | P1 microdetalhe | parcial | 1,4–2,3× é de Detalhe 1 + USM 2 sem a rede; a cadeia relatada dá 1,4–1,6×. |
| item 15 (3º marcador) | P1 microdetalhe | parcial | Cintilação ×1,6–1,8 (sem rede) e ×1,07–1,69 (relatada completa). |
| resp. 3 (último marcador) / 4.5 | P1 microdetalhe | parcial | Fonte dos números (score × sequência) indicada; "Detalhe 20% sem nitidez" renomeado para "Padrão v9 sem nitidez". |
| N3 / 5.1 | P1 neural | parcial | Acrescentada a contraevidência `spatial16F ≈ spatialPadrao`; banda explica parte do custo, não "boa parte". |
| N8 / 5.3 | P1 neural | parcial | "Ganho" definido como projeção; célula 1 nível/2 px → ≈ 0; sobressinal > 1 em período ≥ 8 px; valores com quantização RGBA8. |
| N9 | P1 neural | parcial | Zoom 0 → +4% → 0; "4000 passos" é [doc] (`train.py` usa 8000; log fora do repositório). |
| N10 | P1 neural | reclassificar | "x264 gera High" → [código] (ffprobe); perfil do xCloud segue [hipótese]; bpp depende da resolução real (720p: 0,326/0,651). |
| N11 / item 17 | P1 neural | parcial (frase refutada) | "Mais que o spatial padrão inteiro" → ≈ 70% dele (7,5 ms) e mais que qualquer filtro isolado. |
| P1N-20 / 5.5 | P1 neural | parcial | Engasgos de troca (realocação ~41,5 MB; variante nova do `spatial`) e segmento único para A-…-A acrescentados ao protocolo. |
| P2-2 / F2 | P2 filtros | parcial | No modo Seletiva é `confidence` quem zera a mistura em qualquer oscilação; a `textureMask` só completa. |
| P2-5 / F5 | P2 filtros | parcial | 13,3 níveis é onde o peso chega a zero (meio peso em ~7,4); "custo não depende do raio" marcado [doc]. |
| P2-6 / F6 / item 20 / 6.1 / 6.4 | P2 filtros | parcial | 79/51/14% são pesos de mistura, não fração removida (~45–55% em grão aleatório, padrão-dependente); o bloqueio do Detalhe é o coring, não o `untouched`. |
| P2-19 | P2 filtros | parcial | Citação de `play-xbox-com.md:96` era do JSON bruto, não do documento; nada a mudar. |
| seção 6, intro | P2 filtros | parcial | "Todas suavizam" → Cor nas bordas re-aguça croma; "nenhuma realça luma". |
| 6.5 passo 5 | P2 filtros | reclassificar | "Não deve aumentar a cintilação" → [hipótese]. |
| P2-9 / R9 | P2 renderizador | reclassificar | [código] → [código] + [doc]; `gpu.*` por segmento no WebGL2 do Poco é fence. |
| P2-10 / R10 / item 24 | P2 renderizador | parcial | "Perde a medição" → "desvia": export vazio no motor errado, gravação original aberta. |
| P2-11 / 7.3 linha 2 | P2 renderizador | parcial | Linhas de `docs/play-xbox-com.md` corrigidas para `:68-79` e `:83-96`. |
| 9.3 snippet "Estado do motor" | P2 renderizador | parcial | Nota: `bxEngine` é sempre o WebGL2; com WebGPU ativo, ler `P.bxRender`. |
| item 21 (AA) | P2 filtros | confirmado com ressalva | `dir = −4·(b, a)` e origem no FXAA; "explica o nenhum benefício" → [hipótese]. |
| item 23 (R3) | P2 renderizador | confirmado com ressalva | Mecanismo [código]; sintoma (abaixo do vídeo ou área preta) → [teste no Poco]. |

Omissões de impacto alto ou médio incorporadas: padrões `adaptive`/`gpuBudget` (seção 0); evidência de `EXT_color_buffer_float` na bancada (2.3, item 3, N5); ramo sem telemetria e calibração das margens (2.4); `buffer_stuffing` no frametimeline (F16, 3.4); cadência cortando a neural a 60 FPS pelos pulos do `<video>` (F17, item 4); dica do painel de Detalhe (M17); teste de regressão sem USM (M18); Degradês efetivo com Adaptar (M19); sobressinal da rede e métrica de ganho (5.3); contraevidência da banda (5.1); bpp por resolução (N10); engasgos de troca (5.5); coring × `untouched`, amostragem em fase e bordas de ≤ 7 níveis (F21–F23); sessão real da v9.7.1 (R18); amostras `gpu` do fence (R9, 9.1).

Recusado: nenhuma correção proposta pelos verificadores foi recusada. Duas foram aplicadas de forma reduzida: a reclassificação da ausência do cronômetro no item 4 entrou como nota [doc] dentro do marcador existente (impacto baixo), e as omissões de impacto baixo (teto de Auto no meio da sessão, telemetria sempre ativa, Captura Direta sem `videoSkipped`, export vazio gravado, offsets assimétricos a 60%, tela preta no início, citações erradas só no JSON bruto) entraram como frases curtas ou ficaram fora quando não mudavam nenhuma conclusão.

### 12.1 Mudanças candidatas para a próxima versão (não implementadas)

Lista deduplicada das seis frentes. Nada disto foi implementado; "precisa medir antes" indica que a mudança só faz sentido depois de uma medição no Poco ou na bancada.

| Mudança | Arquivos | Precisa medir antes? | Impacto | Esforço | Risco | Esforço de raciocínio sugerido |
| --- | --- | --- | --- | --- | --- | --- |
| Instrumentação do export: por segmento, lista de passes em ordem, passe final + `filterId`, variante do `spatial` usada (ou genérico, com contagem), `budget.reason`, `adaptation` e `display` em `status`; novas séries `cpu`, `slack` (`expectedDisplayTime` − fim do `updateFrame`) e `pipeline` (`presentationTime` − `receiveTime`); `events[]` limitado com {t, tipo, duração/bytes/motivo} para compilação de variante (`finishProgram` cercado por `performance.now()`), realocação de alvo, `degrade`, troca de renderizador/Fluidez/captura e resize do canvas | `src/restoration-engine.js` (:104-160, :112, :386-390, :426-440, :444-460, :55-70), `src/image-filter.js` (:52-65, :182-193, :414-450), `docs/api-imagefilter.md`, `tests/engine.test.cjs` | não | alto | médio | baixo | medium |
| Taxa da tela e resolução da fonte na timeline (width/height de `status.net`, `status.display`, `BxAndroid.getRefreshRate()`, `measureRefresh()` curto a cada ~10 s) | `src/image-filter.js:119-121`, `:57-59`; `src/panel.js:1173` | não | médio | baixo | baixo | low |
| Estado da rede visível: `status.neural` com três estados (rodando / sem float targets / cortada pela adaptação), marcador "↓" nos sliders afetados pelo orçamento, aviso persistente "Rede neural desligada pela adaptação (N quedas)" com ação "Restaurar" no painel e no HUD, incluído em "Copiar configuração" | `src/image-filter.js` (publish ~:317-319, configText :69-72, updateWarnings), `src/panel.js` (seções 03/04), `src/hud.js` | não | médio | baixo | baixo | medium |
| Valores efetivos ao lado dos sliders quando Adaptar os altera ("Degradês 100% → 92%"), ligando a linha `→ limpeza ×… · degradês ×…` (`panel.js:1110`) a cada slider | `src/panel.js:1102-1125`, `src/hud.js` | não | médio | baixo | baixo | low |
| Dica de "Aliviar GPU" condicionada a `status.measurement === 'cadence'`: "3, 6 e 10 ms são equivalentes neste navegador (sem cronômetro de GPU): a redução segue a cadência; só Nunca desliga" | `src/panel.js:826-828` | não | baixo | baixo | baixo | low |
| Rotular o GPU do WebGL2 sem cronômetro como "≈ fence (limite superior)" no painel/HUD e nomear o campo por segmento conforme `gpuMethod` no relatório | `src/panel.js`, `src/hud.js`, `src/restoration-engine.js` (report) | não | médio | baixo | baixo | low |
| Corrigir dicas do painel: Método "Nativo" no site novo (aplica o `processing` salvo, CAS por padrão); rede ("~30%" → "+45% em sessão a 30 FPS na bancada; qualquer valor > 0 custa o mesmo"; remover "use ~2,5"); Compressão ("suaviza degraus de bloco em áreas lisas; não remove ringing nem mosquito; pouco efeito acima de ~10 Mb/s"); Detalhe (realça as mesmas frequências de 2–4 px que a Nitidez; presets ≤ 35%; excesso vira halo e cintilação); Degradês (meio peso em ~7 níveis a 100%, ~5 a 60%) | `src/panel.js:792`, `:812-814`, `:892`, `:946` | não | baixo (Detalhe: médio) | baixo | baixo | low |
| Pré-aquecer, no construtor, a variante do `spatial` derivada dos ajustes salvos (além da dos padrões), com `wait = true` | `src/restoration-engine.js:403-405`; `src/image-filter.js:274` | não | médio | baixo | baixo | low |
| Canvas WebGPU no site novo: herdar `classList`/posicionamento do canvas WebGL2 (ou regra CSS para `canvas[data-bx-renderer=webgpu]`), manter `aria-hidden`; no `play-harness`, verificar que os retângulos dos dois canvases coincidem e que `position` é absolute | `src/image-filter.js` (startGpu/syncCanvas), `src/play/host.js` (CSS), `tools/play-harness.py` | não | alto (com WebGPU) | baixo | baixo | low |
| Medição robusta à troca de renderizador: guardar o motor da gravação (ou `diagnostics` compartilhado), encerrar/anotar em `setRenderer`, não gravar arquivo sem segmentos e avisar no painel | `src/image-filter.js` (startMeasurement, exportMeasurement, setRenderer), `src/panel.js` | não | médio | baixo | baixo | medium |
| Preencher `status.renderer.probe` com `{vendor, architecture}` do adaptador antes de qualquer entrada em `AUTO_WEBGPU` | `src/image-filter.js` (chooseRenderer/startGpu), `src/webgpu-engine.js` | não | baixo | baixo | baixo | medium |
| Teste de regressão para os limites empilhados: degraus 100/120 e 60/140 com `{detail:1, sharpness:2}`, fixando o teto combinado (≈ ±5–6 e ±6 níveis na emulação) | `tools/regression-harness.py` (~:70-74) | sim (GPU real confirma o teto) | médio | baixo | baixo | low |
| Métrica de bancada `detailLow` para textura de baixo contraste (faixa 3×3 da referência ≤ 6 níveis), com núcleo diferente do `fine`, e coluna `energy/detail`; usar como guarda em 4.6 | `tools/eval/run_eval.py:42-54`, `tools/eval/search.py:23` | não | médio | baixo | baixo | medium |
| Repesar o Detalhe (`fine` 0,3–0,5, `clarity` mantido), avaliado por score + sequence contra Detalhe 0,2 e Natural, com guardas de halo, `energy/detail` e cintilação | `src/shaders/spatial.glsl:131`, `tools/regression-harness.py`, docs | sim | médio | baixo | médio | medium |
| Variante `mediump` das duas passadas da rede (índices e acumulador em highp se a regressão exigir), com regressão de pixel contra highp no Adreno e medição em rajada e em sessão | `tools/nn_glsl.py:20`, `src/restoration-engine.js:403`, `tools/device/spec2/passes.js:34`, harness de diffs | sim | médio | médio | médio | high |
| Metadados do treino: bloco `meta` em `src/nn/<name>.json` (passos, seed, LAP, batch, holdout, data) e docstrings apontando para `docs/analysis-v9.1.md`/`analysis-v9.md`; sem retreinar | `tools/nn/train.py:66`, `tools/nn/make_train_set.py:3`, `tools/eval/make_eval_set.py:10` | não | baixo | baixo | baixo | low |
| Corrigir a direção do AA (inverter o sinal de `dir.y`) nos dois shaders, com teste de que `dir ⟂ (a, b)` numa rampa sintética; refazer a bancada de AA antes de mudar o padrão | `src/shaders/spatial.glsl:144`, `src/shaders/antialias.glsl:19`, `tests/`, `tools/build.py` | não (a correção); sim (mudar o padrão) | baixo | baixo | baixo | medium |
| `untouched` calculado antes do bloco de croma (ou só em luma), para a Cor nas bordas não zerar o Detalhe em bordas coloridas; corrigir o comentário | `src/shaders/spatial.glsl:115-116` | sim (A/B chroma 0 × 0,75 com Detalhe) | baixo | baixo | baixo | medium |
| Tirar trabalho repetido do caminho rVFC: contador de revisão dos ajustes em vez de `JSON.stringify`, `normalize` uma vez por quadro, cache de `getUniformLocation('filterId')` | `src/image-filter.js:290`, `:428-430`; `src/restoration-engine.js:50`, `:512`, `:516`, `:577` | sim (traço com GC em quadros longos) | baixo | baixo | baixo | medium |
