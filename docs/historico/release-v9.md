# v9 — pós-processamento ajustado por medição (PC e Android)

Userscript `6.7.12-imagefilter.9` e app Android **9.0**. Os padrões foram escolhidos numa bancada objetiva: cenas de referência limpas, stream H.264 4:2:0 tipo xCloud a 10/15/20 Mbps e o pipeline WebGL real comparado com a referência. Detalhes em `docs/historico/analysis-v9.md`.

- **Nitidez USM só na luma** (novo padrão, intensidade 3): com a mesma nitidez da v8.6, tem mais fidelidade (SSIM 0,930 contra 0,913), 11% menos ruído do encoder amplificado e não realça os blocos de cor do 4:2:0. CAS, RCAS e "seguir menu nativo" continuam selecionáveis.
- **Saída Automática na resolução real da tela**: no celular (ex.: Poco F7, ~1220–1280 px), o FSR amplia e a nitidez é aplicada já no tamanho final, em vez de o navegador esticar o canvas depois. Resultado: +19% a +27% de detalhe com a mesma fidelidade. No Dell com HDMI 1080p continua nativa.
- **Piso de ruído** no limitador de nitidez: diferenças locais de até ~4 níveis (ruído do encoder) não são realçadas.
- Padrões medidos: Detalhe 20%, Cor nas bordas 75%, Compressão 50%, Degradês 30%, AA 0.
- Referência de comparação agora é "só nitidez (sem tratamento)", com o mesmo método e intensidade.
- Os ajustes usam uma nova chave salva: a v9 começa nos padrões novos, e os valores da v8.x não são importados.

Custo: em 1080p, +3% em relação à v8.6 (valor relativo, medido com GPU emulada). Com FSR para 1280p no celular, +38%, por causa dos 40% de pixels a mais.

Validação: 23 testes Node, 55 verificações Chrome/WebGL/DOM, 37 regressões de pixels (nitidez só na luma preserva a cor; saída Automática segue o tamanho exibido) e 11 casos de movimento. **Não testado ainda no Dell nem no Poco F7.**

Assets: `better-xcloud-image-filter.user.js` (PC/Tampermonkey) e `xcloud-imagefilter-9.0.apk` (Android; instala por cima da 8.6.5).
