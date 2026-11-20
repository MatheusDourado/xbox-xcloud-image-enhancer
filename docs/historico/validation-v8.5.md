# Validação v8.5 — 2026-10-10

Base: `52c5fac6638367f41843c1896d90a1098ccc7d6d` (v8). Ambiente local: Apple M4, Chrome, ANGLE Metal. **Não é validação no Dell/Iris Xe nem sessão autenticada de xCloud.**

Cenário alvo informado: Dell Vostro 3400 (i7-1165G7, Iris Xe), stream xCloud 1080p a 15–20 Mbps, HDMI do notebook em 1080p ligado a uma TV 4K. A TV faz a ampliação final. Nesse cenário, saída 2K/4K no canvas é reduzida de volta para 1080p pelo navegador: aumenta custo sem acrescentar resolução. O ganho possível está no processamento em 1080p.

## Implementado

- **Cor nas bordas** (`chroma`, padrão 50%), no passe `spatial`. O vídeo chega em 4:2:0 e a cor é ampliada com borrão de ~2 px, enquanto a luma é nítida. Onde há gradiente de luma, duas amostras a ±2 px na direção do gradiente fornecem a cor limpa de cada lado; a luma do pixel define a mistura. Só substitui cor que já está entre as cores dos dois lados (mistura de upsampling); cor fora dessa faixa é detalhe real e permanece. Sem gradiente de luma (bordas isoluminantes), nada muda. Até duas leituras bilineares extras por pixel, somente em bordas.
- **Detalhe** (`detail`, padrão 35%), no passe `spatial`: realce fino (laplaciano em cruz) e contraste local (anel de 8 amostras bilineares, raio ~3 px) aplicados somente na luma, sem franjas coloridas. Coring: diferenças abaixo de 1,5/255 + 6% da faixa 3×3 + 4% da faixa larga (cruz 5×5 e anel) são ignoradas, então ruído fraco e ringing perto de bordas fortes não crescem. Contraste local é reduzido perto de bordas fortes. Overshoot limitado a `detail × 2/255` além da vizinhança 3×3. Pixels já suavizados por limpeza/degradês não recebem realce.
- Primeira tentativa de cor usava filtro guiado (regressão local em janela de 13 amostras): reduziu o erro de cor sintético só 21%, porque amostras ao longo da borda carregam a mesma contaminação. Substituída pela predição direcional descrita acima.
- **Saída Automática** (padrão): `screen.height × devicePixelRatio`, isto é, pixels físicos da tela/modo HDMI, independente do tamanho do canvas. ≥2000 → 2160p; ≥1300 → 1440p; senão nativa. Nunca acima da fonte. Com HDMI 1080p resulta em nativa. Escolher 2K/4K manualmente numa tela de 1080p mostra aviso no painel.
- **EASU**: emulação de `textureGather` agora lê cada texel uma vez em RGB (16 `texelFetch` por pixel, antes 48 chamadas por canal). Imagem idêntica por construção.
- **Orçamento padrão 6 ms** (antes 3). No M4, o padrão v8 já media p95 de 2,8 ms e o v8.5, 3,4 ms; com 3 ms a adaptação desligaria degradês mesmo no M4. 6 ms continua bem abaixo de um quadro a 60 FPS (16,7 ms).
- Adaptação: detalhe e cor nas bordas são as últimas etapas desligadas, após limpeza.
- Versão `6.7.12-imagefilter.8.5`; diagnóstico `version: '8.5'`.

Sem código de terceiros novo. Os algoritmos de cor e detalhe são próprios.

## Evidência

- 22 testes Node (2 novos: saída Automática; limites e ordem de adaptação de cor/detalhe).
- 50 verificações Chrome/WebGL/DOM. A verificação de halo CAS isola o limiter (cor/detalhe desligados); nova verificação limita CAS + detalhe padrão a ±5 níveis no degrau 50/62.
- 27 regressões de pixels (6 novas):
  - Borda de cor tipo 4:2:0 (luma em degrau, cor em rampa de 2 px): erro de cor 53 → 5 (−90%).
  - Linha colorida isoluminante `(108,98,100)` preservada em 108.
  - Textura de baixo contraste (±6): amplitude 12 → 16 com detalhe 100%.
  - Ruído ±1 em área plana: desvio padrão inalterado (0,70 → 0,70).
  - Ringing de ±3 a 2–3 px de uma borda 50/200: amplitude inalterada (3 → 3).
  - Degrau 100/120 com detalhe 100%: valores entre 98 e 122.
- 11 movimentos sintéticos passaram; temporal inalterado.
- Quadro H.264 4:2:0 real (testsrc2 1080p a 15 Mbps, decodificado pelo Chrome), borda magenta→ciano: pixel de franja `(181,68,242)` virou `(243,48,255)` com cor nas bordas, próximo do magenta `(255,39,255)`. Sem artefatos visíveis no xadrez de ruído com o padrão v8.5. Conteúdo sintético; não prova ganho em gameplay.

## Custo exploratório

`tools/performance-v85-harness.py`: canvas estático 1080p (sem decode), 120 draws de aquecimento, 6 s medidos por configuração, orçamento manual, temporal desligado. Duas execuções alternadas v8/v8.5; valores muito próximos entre elas.

| Caminho | GPU p50 | p95 |
| --- | --- | --- |
| v8 padrão 1080p | 2,44–2,49 ms | 2,79–2,81 ms |
| v8.5 padrão 1080p | 2,95–3,00 ms | 3,37 ms |
| v8.5 sem cor/detalhe 1080p | 2,45–2,62 ms | 2,90–2,93 ms |
| v8 padrão 4K | 7,29–7,32 ms | 7,56–7,57 ms |
| v8.5 padrão 4K | 7,77–7,88 ms | 8,09–8,14 ms |

Cor + detalhe custam cerca de 0,5 ms no M4. A deduplicação do EASU não mostrou ganho mensurável no M4/Metal (o compilador provavelmente já eliminava as leituras repetidas); o efeito em Iris Xe/D3D11 não foi medido. Proporcionalmente, se o padrão v8 na Iris Xe estiver perto de 3–4× o M4, espera-se +1,5–2 ms; isso é estimativa, não medição.

## Reproduzir

```sh
python3 tools/build.py
node --test tests/*.cjs
node --check better-xcloud-image-filter.user.js
node --check player/player.js
python3 tools/browser-harness.py
python3 tools/regression-harness.py
python3 tools/quality-harness.py
python3 tools/performance-v85-harness.py
python3 -m http.server 8765 --bind 127.0.0.1
```

Abrir `/output/playwright/filter-harness.html`, `/output/playwright/regressions-v7.html`, `/output/playwright/motion-quality.html` e `/output/playwright/cost-v85.html?ms=6000` (`?baseline&ms=6000` usa o bundle exato da v8).

## Pendências no Dell

Comparar na mesma cena: v8.5 padrão; Cor nas bordas 0%; Detalhe 0%; Detalhe 60–80%. Usar **Iniciar medição / Encerrar e exportar** para registrar GPU p95. Observar HUD/texto colorido, vegetação, rostos e céu; se Detalhe realçar ruído em cenas escuras, reduzir para 20–25%.
