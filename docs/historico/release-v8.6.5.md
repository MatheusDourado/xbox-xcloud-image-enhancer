# v8.6.5 — app Android com o tratamento v8.6

Primeira versão Android. O app oficial do Better xCloud para Android é de código fechado, então este é um app WebView próprio (**xCloud ImageFilter**, pacote `com.imagefilter.xcloud`) que abre o xCloud e injeta o userscript `6.7.12-imagefilter.8.6` antes dos scripts da página, com as mesmas regras do Tampermonkey. Pode ficar instalado junto com o app oficial.

- Tela cheia, paisagem, tela sempre ligada; user-agent do Chrome Android.
- Botão B do controle não fecha o jogo.
- Depuração por `chrome://inspect` habilitada.
- Tratamento igual à v8.6: Nitidez no painel (0–10, passo 0,5), limitador de halo proporcional, AA sem passagem extra.

**Instalar:** baixe `xcloud-imagefilter-8.6.5.apk` abaixo, permita a instalação pela fonte usada e abra **xCloud ImageFilter**. O asset `better-xcloud-image-filter.user.js` é o mesmo userscript da v8.6 para PC.

Sugestão inicial (ex.: Poco F7): saída Automática, Nitidez 3–5, Detalhe 35–60%, Degradês 30–50%, AA 0–25%, orçamento 6 ms. Se aparecer o aviso de injeção tardia, atualize o Android System WebView.

Limitações: exportar medição não baixa o JSON no app; sem microfone; assinado com chave de teste (`android/debug.keystore`), só para instalação direta. **Não testado em aparelho ainda.**

Build pelo GitHub Actions (`.github/workflows/build-release.yml`), sem Gradle nem Android SDK. Detalhes: `android/README.md`.
