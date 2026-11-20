# Validação v8 — 2026-10-10

Base: `efcd80b336244f5bd0916b86441e241fd5b9eab6` (v7.1). Ambiente local: Apple M4, Chrome 155, ANGLE Metal. **Não é validação no Dell/Iris Xe nem sessão autenticada de xCloud.**

## Implementado

- Limpeza seletiva em `spatial.glsl`: proteção de extremos por canal, confiança de degrau contra rampas contínuas e pesos de deband por diferença de cor. Mesmos taps máximos e mesmas duas passagens do padrão v7.1. `Limpeza espacial → Referência v7.1` mantém o algoritmo anterior para A/B; não troca o resto do motor pela versão antiga.
- RCAS opcional no passe final, substituindo CAS/USM, com denoise AMD, proteção numérica, limite local ±4/255 e acabamento unido. Escala de intensidade linear 0–1 a partir do slider 0–10, diferente de CAS. Zero desliga sharpening. Padrão continua CAS/USM nativo.
- Captura optativa de diagnóstico no menu/player: amostras de tempo GPU e p50/p95/p99 por configuração, draws e duração, snapshots inicial/final dos contadores de vídeo/WebRTC disponíveis. Sem acesso a pixels CPU na reprodução. Até 120.000 amostras e 256 segmentos; truncamento indicado. Não transmite relatórios automaticamente.
- Identificação reproduzível do build por hash das fontes. Benchmark adicional com bundle exato v7.1, aquecimento, amostras completas e exportação JSON.

O escopo experimental de temporal/dering dedicado da pesquisa foi adiado. Nenhum novo histórico ou mapa de classificação. Não foi possível cumprir a etapa física P0 no Dell: a release disponibiliza instrumentação e candidatos para essa validação, sem declarar aprovação de qualidade ou desempenho no equipamento.

## Evidência

- 20 testes Node: configurações, adaptação, lifecycle upstream e diagnósticos.
- 49 verificações no harness Chrome/WebGL/DOM, incluindo seletor RCAS, início/exportação da captura, separação do diagnóstico magenta e efeitos realmente inativos na referência.
- 21 regressões reais de pixels/passagens/recursos. CAS, USM e RCAS mantiveram extremos 96/124 no degrau 100/120 em intensidade máxima. Dither preservou distribuição 57/58; linha cinza fina permaneceu 104; rampa contínua permaneceu intacta.
- Linha colorida `(108,98,100)` sobre fundo `(100,100,100)`: o vermelho ficou em 106 com deband legado e 108 com proteção seletiva. É um caso sintético específico, não demonstra ganho em qualquer gameplay.
- 11 movimentos sintéticos (0–8,16,32 px/quadro) passaram, redução MSE ≥15%. Temporal não foi alterado e permanece desligado.
- Player reproduziu H.264 sintético 1920×1080/60, selecionou RCAS e exportou JSON com hash do build, 49 amostras GPU e contadores de vídeo. Esse smoke test curto não aprova fluidez sustentada; os contadores finais incluíram 8 dropped frames em 68 totais, com carregamento/pausa/automação, sem atribuição causal ao filtro.
- Troca para outro arquivo durante captura encerra com `source-changed` e omite snapshot final, evitando calcular deltas entre fontes. Revisão independente identificou esse problema e a mistura do diagnóstico magenta; ambos foram corrigidos e testados.

## Amostragem exploratória de custo

`tools/performance-v8-harness.py`: canvas estático 1080p, 120 draws de aquecimento por modo, 10 segundos medidos, budget manual, temporal desligado, 750 amostras por modo. A cadência da máquina foi aproximadamente 75 draws/s, **não 60 FPS de vídeo**. Sem decode, captura de controle ou custo físico da TV. Execução exploratória durante desenvolvimento, sem repetição estatística/ordem balanceada.

| Caminho | GPU p50 | p95 | p99 |
| --- | --- | --- | --- |
| v7.1 exata | 2,12 ms | 2,63 ms | 2,73 ms |
| v8 seletiva + CAS | 1,74 ms | 1,84 ms | 1,87 ms |
| v8 legado + CAS | 1,73 ms | 1,83 ms | 1,87 ms |
| v8 seletiva + RCAS | 1,77 ms | 2,64 ms | 2,85 ms |

Não atribuir a diferença v7.1/v8 a uma otimização comprovada: a variante legado teve custo quase igual à seletiva, e a dispersão de RCAS foi maior. Isso não justifica promover RCAS a padrão. A medição curta do player com vídeo indicou p95 de 2,14 ms, igualmente sem validade como benchmark sustentado. A comprovação de orçamento 3 ms no Dell continua pendente.

## Reproduzir

```sh
python3 tools/build.py
node --test tests/*.cjs
node --check better-xcloud-image-filter.user.js
node --check player/player.js
python3 tools/browser-harness.py
python3 tools/regression-harness.py
python3 tools/quality-harness.py
python3 tools/performance-v8-harness.py
python3 -m http.server 8765 --bind 127.0.0.1
```

No Chrome, com cache desativado, abrir `/output/playwright/filter-harness.html`, `/output/playwright/regressions-v7.html` (nome histórico) e `/output/playwright/motion-quality.html`. O benchmark fica em `/output/playwright/cost-v8.html?ms=10000`; `?baseline&ms=10000` usa v7.1. `ms=600000` mede dez minutos **por configuração**. Os JSONs e screenshots locais em `output/playwright/` são artefatos ignorados pelo Git; os geradores versionados permitem reproduzi-los.

Para o Dell: seguir [research-v8.md](research-v8.md), com três execuções pareadas por finalista, TV em configuração fixa, contadores de perdas/decode, julgamento visual, ghosting e latência física quando disponível. No menu, iniciar medição após aquecimento; encerrar e exportar antes de sair do jogo. Os snapshots WebRTC são apenas dos extremos da captura, não uma série por segundo. Draw FPS não comprova apresentação na TV; GPU p95 não mede latência controle→fóton. Queries ainda pendentes ao exportar podem ficar ausentes; a contagem de amostras informa a cobertura. Ajustes de configuração geram segmentos diferentes, sem misturar percentis.
