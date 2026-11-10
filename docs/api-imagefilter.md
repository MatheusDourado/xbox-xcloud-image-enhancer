# API `window.BxImageFilter` (painel e HUD)

`src/image-filter.js` (adaptador) renderiza, mede e publica o estado. `src/panel.js` (painel no menu de vídeo do Better xCloud) e `src/hud.js` (indicadores durante o jogo) só leem e alteram o estado por esta API. O `tools/build.py` concatena os três arquivos, nessa ordem, no userscript.

## Configurações — `api.settings`

Objeto vivo, normalizado por `BxRestoration.normalize` (`src/restoration-engine.js`). Para alterar, use `api.update(patch)`: ele salva e reinicia a adaptação de GPU quando a mudança afeta a imagem.

| Chave | Valores | Uso |
| --- | --- | --- |
| `mode` | `original`, `cas`, `filtered` | Comparação: vídeo original, referência só nitidez, novo tratamento |
| `sharpness` | 0–10, passo 0,5 | Nitidez (USM/CAS/RCAS) |
| `sharpening` | `usm`, `cas`, `rcas`, `native` | Método da nitidez final |
| `cleanup`, `deband`, `chroma`, `detail`, `temporal`, `antialias`, `neural` | 0–1 | Compressão, Degradês, Cor nas bordas, Detalhe, Estabilidade em movimento, Antialiasing, Reconstrução neural |
| `adaptive` | booleano | Adaptar limpeza/degradês/detalhe à compressão (QP; sem QP no navegador, estimada pela taxa de bits) |
| `output` | `auto`, `native`, `1440`, `2160` | Resolução de saída |
| `fluidity` | `off`, `balanced`, `max` | Fluidez (ritmo de exibição) |
| `capture` | `video`, `direct` | Origem dos quadros com Fluidez ligada: elemento de vídeo ou direto do decodificador |
| `smoothing` | 0, 17, 33, 50 | Suavidade (alvo do buffer WebRTC, ms) |
| `gpuBudget` | 0, 3, 6, 10 | Adaptar acima de N ms (0 = manter tudo) |
| `spatialMode` | `selective`, `legacy` | Limpeza espacial |
| `hud` | `off`, `compact`, `full` | Indicadores durante o jogo |
| `hudPosition` | `top-left`, `top-right`, `bottom-left`, `bottom-right` | Canto do HUD |
| `streamResolution` | `auto`, `1080p` (padrão), `1080p-hq` | Só play.xbox.com. Resolução pedida ao servidor no `POST .../sessions/cloud/play`: `1080p` declara `osName: windows` e tela 1920×1080 (`x-ms-device-info`); `1080p-hq` declara `tizen`; `auto` deixa o pedido do site (720p no Poco F7). Vale no próximo jogo |
| `preventDrops` | booleano (padrão `true`) | Só play.xbox.com. Impedir queda de resolução: o `getStats` que o site lê informa no máximo 8 ms de decodificação por quadro. A telemetria do script lê o valor real. Vale no próximo jogo |

## Ações

- `api.update(patch)` (ignora valores iguais; grava no armazenamento após 400 ms sem mudanças), `api.reset()` (restaura o tratamento; mantém o HUD, `streamResolution` e `preventDrops`), `api.applyPreset(key)`, `api.preset()` → chave do perfil atual ou `custom`.
- `api.presets`: `{natural, console, sharp, clean, light}`, cada um com `{label, description, values}`.
- `api.diagnostic` (booleano, não salvo): colore a imagem para confirmar que o tratamento roda.
- `api.startMeasurement()` → `Promise<boolean>`; `api.measuring`; `api.exportMeasurement()` → baixa o JSON e devolve o relatório (formato abaixo) com `saved`. A medição é do player e é compartilhada pelos dois renderizadores: trocar de renderizador durante a gravação só abre outro segmento. Sem nenhum quadro tratado (`segments` vazio) nada é gravado e `saved` é `false`.
- `api.configText()` → JSON para "Copiar configuração".
- `api.copyText(text)` → `Promise<boolean>`: copia pela ponte do app Android ou pelo clipboard do navegador.
- `api.nativePref(key)`: lê preferências do Better xCloud.
- `api.panelOpen`: o painel marca `true` enquanto está visível (liga a telemetria).
- `api.active`: há quadros tratados nos últimos 2,5 s.
- `api.directSupported()`: o navegador permite a captura direta.
- `window.BxAndroid` (só no app): `getRefreshRates()` (JSON), `getRefreshRate()`, `setRefreshRate(hz)`, `getAppInfo()`, `copyText(text)` e `saveFile(nome, mime, texto)` (Downloads/xCloud ImageFilter; usada pela exportação da medição). Só respondem com a página no xbox.com.

## Estado — `api.status` (atualizado a cada quadro e a cada segundo)

- `mode` (`waiting`, `ready`, `filtered`, `cas`, `original`, `diagnostic`, `error`), `error`, `frames`, `lastFrame` (Date.now), `resolution` (`"1920×1080 → 2276×1280"`), `display` (altura física do vídeo na tela), `fps`.
- `gpuP95` (ms ou `null`), `measurement` (`gpu` ou `cadence`), `adaptation` (motivo da última redução automática).
- `neural` — estado da Reconstrução neural no motor que desenha: `off` (valor 0 ou Comparação fora de Tratada), `running`, `no-float` (sem `EXT_color_buffer_float`: a rede nunca roda), `cut` (desligada pela redução automática de GPU). Em `no-float` e `cut` há um aviso (`neural-float`, `neural-cut`).
- `gpuEstimate` — sem cronômetro de GPU (`measurement: 'cadence'`, ex.: WebView do Android): `{p50, p95, count}` em ms, do início dos comandos de um quadro até a GPU concluí-lo (fence a cada 0,5 s, últimos 30). É um limite superior (inclui trabalho na fila), só para exibição; a redução automática continua pela cadência. `null` com cronômetro ou antes da primeira leitura.
- `pacing` — ritmo na tela (2 s): `{meanMs, deviationMs, p95Ms, hitches, frames}`.
- `intervals` — intervalos entre quadros exibidos (ms), últimos 240, para gráficos.
- `intervalsTotal` — contador monotônico de intervalos registrados (muda a cada quadro exibido; serve de assinatura para redesenhar gráficos).
- `origin` — `{server, arrival}` (como `pacing`), `arrivalNetwork`, `presented`, `missed` (quadros pulados antes do tratamento em 2 s). Na captura direta sem `VideoFrame.metadata().receiveTime`, `arrival` é a entrega do quadro ao script (inclui decodificação e atrasos da thread principal) e `arrivalNetwork` é `false`: o painel não o classifica como rede.
- `fluidity` — `{mode, extraMs, dropped}` ou `null`.
- `capture` — `{active, frames, reason}`: captura direta em uso, quadros recebidos dela, motivo de fallback.
- `smoothing` — `{requestedMs, state, ...}` (`waiting`, `unsupported`, `requested`, `partial`, `error`).
- `net` — `{codec, profile, fpsReceived, decoder (hardware|software|unknown), implementation, decodeMs, bufferMs, rttMs, bitrateMbps, lossPct, qp, frames, framesDropped, freezes, width, height, bitsPerPixel}` ou `null`. `qp` é `null` quando o navegador não informa `qpSum`; `bitsPerPixel` são os bits codificados por pixel de cada quadro no último segundo.
- `adaptive` — `null` ou, conforme a origem:
  - `{source: 'qp', qp, qpMean, level (0–1), scales:{cleanup, deband, detail}}`;
  - `{source: 'bitrate', qp: null, qpMean: null, qpEstimate, bitsPerPixel, level, scales}`: sem QP no navegador. Usa o percentil 80 dos bits por pixel do último minuto (mínimo 5 s; segundos com menos de 10 quadros ficam de fora). 0,12 bit/pixel equivale ao QP 28 (neutro) e cada dobro, a 4 QP a menos (`BxRestoration.qpFromBitsPerPixel`).
- `stream` — só play.xbox.com (`BxPlayStream.info()`; `null` no Better xCloud): `{resolution, preventDrops}` (ajustes atuais), `request` (o que o último `POST .../play` pediu: `{at, resolution, osName, from (osName original do site), header (se o x-ms-device-info foi reescrito), preventDrops}` ou `null`), `capActive` (o limite alterou um `getStats` do site nos últimos 5 s), `capMs` (8), `realDecodeMs` (média real de decodificação desde o início do stream, do último relatório limitado), `capCalls`, `error`. Também vai em `configText()` e no `status` da medição.
- `net.decodeMs` e o `decodeMs` da linha do tempo da medição são sempre o tempo **real**: `BxRestoration.readStats(alvo)` chama o `getStats` nativo guardado pelo prelude (`BxPlayStream.realStats`), não o limitado que o site vê.
- `warnings` — lista `{level: 'error'|'warn'|'info', key, text}` (renderizador, bitrate limitado, resolução, decodificação por software, perda de pacotes, saída acima da tela, rede neural pedida e não rodando, erro do motor, `prevent-drops` quando o limite de decodificação está agindo).

## Medição — relatório de `api.exportMeasurement()` (`schema: 3`)

Arquivo `bx-v<versão>-diagnostics-<timestamp>.json` (hoje `bx-v10.1.0-diagnostics-…`). No app Android vai para Downloads/xCloud ImageFilter; no navegador, para a pasta de downloads.

- `metadata`: `userAgent`, `renderer`, `api` (`webgl2` ou `webgpu`), `timer` (cronômetro de GPU), `gpuMethod` (`timer`, `timestamp`, `fence` ou `null`), `floatTargets`, `gpu` (`{renderer, vendor}` desmascarados por `WEBGL_debug_renderer_info` quando o navegador expõe; `null` quando não), `spatialPrecision` (`highp` ou `mediump`, perfil das variantes do `spatial`), `parallelCompile` (`KHR_parallel_shader_compile` disponível), `warmMs` (tempo de compilação no construtor do motor WebGL2: programas e variantes pré-aquecidas), `screen` (`width`, `height`, `dpr`, `refreshPref` do app), `refreshMeasuredHz` (mediana de 30 quadros de animação no início), `app`, `betterXcloud` (preferências do stream), `capture`, `smoothing`, `initial` (contadores do vídeo e do WebRTC).
- `segments`: um por configuração distinta (voltar a uma configuração continua o segmento). Campos de cada um:
  - `config` (ajustes, `effective`, `source`, `output` e `renderer`: `webgl2` ou `webgpu`), `frames`, `durationMs`, `drawFps`, `pacerDropped` (quadros descartados pela Fluidez) e `videoSkipped` (quadros que o `<video>` não apresentou, no caminho de vídeo);
  - `passes`: as sequências de passes executadas, em ordem decrescente de quadros, cada uma `{sequence, frames}`. `sequence` lista os passes na ordem em que rodaram, separados por vírgula: `upload` (textura do vídeo no WebGL2; no WebGPU `import` é a cópia da textura externa e `upload` a cópia pela fila), `nnFeatures`, `nnApply`, `spatial@<perfil>` (variante compilada, ex.: `spatial@mediump.1.1.4.1.0.0.1.1`) ou `spatial` (shader genérico enquanto a variante compila — conta à parte, no mesmo segmento), `spatialCompute`, `copy`, `cut`, `motion`, `temporal`, `antialias`, `easu` e o passe final com o `filterId` (`casFiltered#1` = USM, `#2` = CAS; `cas#2`, `rcas`, `sgsr`). Com Fluidez o passe final roda em `present()` e termina em `@present`;
  - `final`: `{name, filterId}` do último passe (`filterId` `null` quando não há);
  - `gpu` (`{method, count, p50, p95, p99, samplesMs}`; `method` é como o motor do segmento mediu: `timer` (WebGL2 com cronômetro), `timestamp` (WebGPU) ou `fence` (WebGL2 sem cronômetro: tempo até concluir, limite superior que inclui a fila), `null` sem amostra);
  - intervalos, cada um com `{count, meanMs, p50, p95, p99, maxMs, deviationMs, hitches, samplesMs, samplesTruncated}`:
    - contagem, média, desvio e máximo são exatos; os percentis vêm de faixas de 0,1 ms;
    - `hitches` conta intervalos acima de 1,5× a mediana e é `null` em `wait`, `cpu`, `late` e `pipeline`;
    - intervalos que atravessam a página oculta (troca de app) ficam de fora;
    - `display`: entre quadros exibidos;
    - `arrival`: entre quadros chegando ao tratamento (veja `origin.arrivalNetwork`);
    - `server`: entre os tempos de captura no servidor (RTP no vídeo, timestamp do `VideoFrame` na captura direta);
    - `wait`: espera de cada quadro na Fluidez;
    - `cpu`: tempo na thread principal de cada quadro tratado (`updateFrame` ou `renderDirect`, da entrada até depois de publicar o estado), só com a medição ativa;
    - `late`: fim do processamento menos o `expectedDisplayTime` do quadro (metadados do `requestVideoFrameCallback`), ou seja, quanto o tratamento terminou depois da exibição prevista do quadro de vídeo. O callback do rVFC roda no passo de renderização da vsync prevista ou da seguinte, então a série fica em ≈ 0 ou ≈ um intervalo de vsync (16,7 ms a 60 Hz) e cresce quando a thread principal atrasa; leia a cauda superior (p95/p99/`maxMs`). Negativo só se o processamento terminou antes da exibição prevista. Só no caminho de vídeo, com a medição ativa;
    - `pipeline`: `presentationTime − receiveTime` do mesmo quadro, quando o navegador informa os dois (WebRTC); só no caminho de vídeo.
- `events`: até 500 eventos datados `{t (s desde o início), type, ...}`; `eventsTruncated` marca o corte. Tipos: `compile` (`name` do programa ou da variante do `spatial`, `ms` da finalização bloqueante, `wait`, `frames` que o genérico desenhou enquanto compilava; `name: 'programs'` com `count` quando o motor é criado durante a gravação), `compile-failed`, `target` (alocação ou realocação de alvo: `name`, `w`, `h`, `bytes`, `realloc`), `degrade` (`reason`, `revision` da redução automática), `renderer` (`to`: `webgl2`/`webgpu`), `renderer-failed` (`reason`), `fluidity` (`mode`), `capture` (`active`, `reason`) e `resize` do canvas (`from`, `to`).
- `timeline`: uma linha por segundo, até 1 hora. Campos: `t` (s desde o início), `fpsReceived`, `fpsShown`, `bitrateMbps`, `lossPct`, `rttMs`, `decodeMs`, `bufferMs`, `qp`, `bitsPerPixel`, `level`, `gpuMs`, `waitMs`, `decoderDropped`, `freezes`, `capture` (`direct`/`video`), `width` e `height` da fonte, `display` (altura física do vídeo na tela) e `refreshHz` (taxa pedida ao app, `BxAndroid.getRefreshRate()`; `null` fora dele).
- `final` (contadores no fim), `net` e `status` (`capture`, `fluidity`, `adaptive`, `smoothing`, `pacing`, `origin`, `gpuP95`, `gpuEstimate`, `measurement`, `neural`, `adaptation` (motivo da última redução automática, `budget.reason`), `display`, `resolution`, `renderer` (cópia de `status.renderer`), `warnings`).
- Limites (`sampleLimit`): até 300 mil amostras brutas de intervalos por grupo — um grupo para os intervalos de quadro (`display`, `arrival`, `server`, `wait`; ≈ 21 min a 60 FPS com Fluidez, como no schema 2) e outro para os custos por quadro (`cpu`, `late`, `pipeline`; ≈ 28 min a 60 FPS) —, 120 mil de GPU, 3.600 linhas na linha do tempo, 500 eventos e 256 configurações. Os resumos continuam além do corte; `truncated` indica que algum limite foi atingido.
- Fora da medição nada disso custa: o rastro de passes e as séries só existem com a gravação ativa (checagens triviais por quadro).

O construtor do motor WebGL2 (`BxRestoration.Engine(gl, shaders, {settings})`) e `BxWebGPU.create(canvas, {settings})` recebem os ajustes atuais e pré-aquecem a variante do `spatial` que eles usam junto com a dos padrões, para a compilação não acontecer dentro dos primeiros quadros (auditoria F8).
