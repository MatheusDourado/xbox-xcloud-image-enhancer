# v8.5 — cor nas bordas, detalhe na luma e saída automática

Base Better xCloud 6.7.12; userscript `6.7.12-imagefilter.8.5`. Atualização manual pelo arquivo anexado `better-xcloud-image-filter.user.js`.

Foco: nitidez percebida no cenário stream 1080p a 15–20 Mbps → notebook com HDMI 1080p → TV 4K. Nesse cenário, saída 2K/4K no canvas não acrescenta resolução (o navegador reduz para 1080p antes do HDMI) e só aumenta o custo. O ganho vem do processamento em 1080p.

- **Cor nas bordas** (padrão 50%): o vídeo chega com cor em meia resolução (4:2:0). Nas bordas de luma, a cor é reconstruída a partir da cor limpa de cada lado, o que reduz franjas e a cor "pixelada" ou borrada. Texto e linhas coloridas finas são preservados.
- **Detalhe** (padrão 35%): realce fino e contraste local só na luma, antes do temporal e do upscale. O coring evita realçar ruído fraco e ringing do encoder perto de bordas fortes, e o overshoot fica limitado.
- **Saída Automática** (padrão): usa a resolução física da tela ou do sinal HDMI. Com HDMI 1080p, fica nativa. Escolher 2K/4K numa tela de 1080p mostra um aviso.
- O EASU lê cada texel uma vez (antes, 48 leituras por pixel). A imagem é idêntica.
- O orçamento GPU padrão passou para 6 ms. Cor e detalhe são as últimas etapas que a adaptação desliga.
- Caminho padrão em 1080p continua com duas passagens. Temporal e AA continuam desligados.

Validação local: 22 testes Node, 50 verificações Chrome/WebGL/DOM, 27 regressões de pixels (6 novas) e 11 casos de movimento passaram. Erro de cor numa borda 4:2:0 sintética caiu 90%. Num quadro H.264 real, a franja roxa entre magenta e ciano praticamente sumiu. Ruído fraco e ringing não aumentaram. Build reproduzível.

Custo medido no Apple M4 (não no Dell): cor + detalhe somam cerca de 0,5 ms em 1080p (p95 de 2,8 → 3,4 ms). O ganho do EASU não foi mensurável no M4. **Qualidade percebida e custo na Iris Xe continuam pendentes.** Se Detalhe realçar ruído em cenas escuras, reduza para 20–25%. A compressão do xCloud apaga detalhes que nenhum filtro recupera.

Comece em saída Automática, CAS 2, orçamento 6 ms, Cor nas bordas 50% e Detalhe 35%. Substitua o conteúdo do script no Tampermonkey e recarregue o xCloud; mantenha só uma versão ativa.

Documentação: `docs/historico/validation-v8.5.md`.

SHA-256 do asset: `8deb7232debd48bbfac90d7cca892d0720a9907859bc6cca917cee133fdd993d`.
