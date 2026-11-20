# v8.6 — nitidez no painel, limitador proporcional e AA sem passagem extra

Base Better xCloud 6.7.12; userscript `6.7.12-imagefilter.8.6`. Atualização manual pelo arquivo anexado `better-xcloud-image-filter.user.js`.

Motivo: no teste da v8.5 no Dell (Iris Xe, Chrome), os degradês melhoraram, mas o tratamento ficava menos nítido que a referência CAS 2, e aumentar a nitidez quase não mudava a imagem.

- **Nitidez no painel** (0–10, passo 0,5). Vale para o tratamento e para a **Referência: só CAS**, que agora usa a mesma intensidade (A/B justo). O slider nativo do Better xCloud não é mais usado aqui; CAS/USM e Performance/Qualidade continuam no menu nativo.
- **Limitador de halo proporcional**: ±4 níveis na Nitidez 2 (igual à v8.5) até ±12 na Nitidez 10. A textura de baixo contraste não é mais cortada; só ruído de 1–5 níveis é ignorado. Vale para CAS, USM e RCAS. Ganho de detalhe medido: Nitidez 2 de 1,75 → 2,07; Nitidez 10 de 2,40 → 4,43 (referência CAS 2: 2,29). Na v8.5, nem a Nitidez 10 superava o CAS 2.
- **AA dentro da passagem espacial** quando o temporal está desligado: sem passagem de tela inteira nem buffer 1080p extra. O caminho continua com duas passagens mesmo com AA ligado.

Validação local (Chromium com GPU emulada, não no Dell): 22 testes Node, 53 verificações Chrome/WebGL/DOM, 36 regressões de pixels e 11 casos de movimento passaram. **Ganho de custo do AA e qualidade percebida na Iris Xe continuam pendentes**; meça com Iniciar/Encerrar e exportar medição.

Comece em saída Automática, Nitidez 3–5, Detalhe 35–60%, Degradês 30–50%, AA 0–25% e orçamento 6 ms. Degradês e AA altos suavizam textura. Substitua o conteúdo do script no Tampermonkey e recarregue o xCloud; mantenha só uma versão ativa.

Documentação: `docs/historico/validation-v8.6.md`.

SHA-256 do asset: `24b1128743a80574c9818dd688448675c51ffc33531996de16f36e20ac906a03`.
