# v8 — limpeza seletiva, RCAS opcional e diagnóstico

Base Better xCloud 6.7.12; userscript `6.7.12-imagefilter.8`. Atualização manual pelo arquivo anexado `better-xcloud-image-filter.user.js`.

- Limpeza espacial seletiva protege detalhes de cor e evita tratar rampas contínuas como degraus de compressão. Há opção de comparar com a limpeza v7.1.
- RCAS experimental substitui CAS/USM, com denoise e limite local de halos, sem passagem adicional. Padrão continua CAS/USM nativo.
- Menu e player exportam diagnóstico JSON local com hash do build, parâmetros, tempos GPU e contadores disponíveis. Captura optativa; não mede latência controle→TV.
- Caminho padrão em 1080p continua com duas passagens. Temporal e AA permanecem desligados; orçamento 3 ms.

Validação local: 20 testes Node, 49 verificações Chrome/WebGL/DOM, 21 regressões de pixels/passagens e 11 casos sintéticos de movimento passaram. Player H.264 1080p60 e exportação de diagnóstico verificados. Build reproduzível e sintaxe verificada.

Testes e medições foram no Apple M4/ANGLE Metal. **Qualidade percebida, latência física e desempenho sustentado no Dell Vostro 3400/Iris Xe continuam pendentes.** Não há promessa de recuperar detalhes eliminados pela compressão. RCAS tem escala diferente de CAS e não foi promovido a padrão. Dering dedicado e novo temporal ficaram fora desta entrega.

Comece em saída nativa, CAS 2, Performance, orçamento 3 ms. Substitua o conteúdo do script no Tampermonkey e recarregue o xCloud; mantenha apenas uma versão ativa.

Documentação no repositório: `docs/historico/research-v8.md`, `docs/historico/validation-v8.md`, `docs/third-party-v8.md`.

SHA-256 do asset: `1627c209446ab4788d580f9e0f5dc0bf4c099becf407fece7b12db1121ab910b`.
