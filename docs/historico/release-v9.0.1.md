# v9.0.1 — Android recebe stream 1080p

Correção do app Android. O userscript é o mesmo da v9.

O xCloud escolhe a resolução do stream pelo sistema que o navegador informa, e para Android manda **1280×720**. Por isso os indicadores mostravam 720p, mesmo numa tela maior como a do Poco F7. O Better xCloud resolve isso com a opção **Resolução alvo** (1080p ou 1080p HQ), mas no app ela começava em "Padrão".

- Na primeira execução, o app ajusta a **Resolução alvo** para **1080p (HQ)**. Se você já tinha escolhido outro valor, ele é mantido.
- A mudança vale a partir da próxima sessão de jogo: feche o jogo e abra de novo.
- Com o stream em 1080p, a saída Automática da v9 amplia com FSR para a altura real da tela (~1220–1280 px) e aplica a nitidez no tamanho final.

Para conferir ou mudar: **Better xCloud → Configurações → Stream → Resolução alvo**. Os indicadores devem mostrar 1920×1080.

Asset: `xcloud-imagefilter-9.0.1.apk`, que instala por cima da 9.0 sem perder o login.
