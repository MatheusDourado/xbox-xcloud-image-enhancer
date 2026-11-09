# xCloud ImageFilter para Android — v10.1.0

App Android próprio (WebView) que abre o xCloud e injeta o userscript desta versão (Better xCloud 6.7.12 + tratamento de imagem **v10.1.0**). **Não é o app oficial do Better xCloud**: o app oficial é de código fechado (o repositório `redphx/better-xcloud-android` só tem o README), então não dá para modificá-lo.

## Instalar

1. Baixe `android/dist/xcloud-imagefilter-10.1.0.apk` deste repositório (gerado pela CI a partir do commit da versão) (no GitHub: abra o arquivo → **Download raw file**).
2. No celular, permita instalar apps da fonte usada (navegador ou gerenciador de arquivos) e instale.
3. Abra **xCloud ImageFilter**, faça login na conta Microsoft e entre num jogo.
4. No menu do Better xCloud → **Vídeo**, mantenha o renderizador **WebGL2**. O painel **Tratamento de imagem** fica logo abaixo de Renderizador. Em **05 Indicadores e ferramentas**, ligue os indicadores no jogo: no celular eles ficam na faixa preta ao lado do vídeo.

Pode ser instalado junto com o app oficial: o pacote é outro (`com.imagefilter.xcloud`) e o login é separado.

## O que o app faz

- Abre `https://www.xbox.com/play` em tela cheia, paisagem, tela sempre ligada, sem barras do sistema.
- Injeta o userscript **antes dos scripts da página** (document-start), com as mesmas regras `@match`/`@exclude` do Tampermonkey, só no frame principal. Usa a API de document-start do Android System WebView (a mesma do `androidx.webkit`). Em WebView antigo sem esse recurso, avisa e injeta no início do carregamento.
- User-agent do Chrome Android (sem a marca de WebView, que o xCloud recusa).
- **Stream em 1080p**: o xCloud escolhe a resolução pelo sistema informado e manda 720p para Android. Na primeira execução, o app ajusta a **Resolução alvo** do Better xCloud para **1080p (HQ)**, que se apresenta ao servidor como TV. Se você mudar essa opção, a sua escolha é mantida. Vale a partir da próxima sessão de jogo.
- **Marcado como jogo** (Android Game Mode / HyperOS Game Turbo): adicione o app ao Game Turbo para manter CPU e GPU em desempenho. O downscaling e a troca de FPS pelo sistema ficam desligados.
- O painel mostra se a decodificação é por hardware (MediaCodec) e o DT por quadro. No Android, ~5–15 ms é normal mesmo com hardware.
- **Taxa da tela**: no painel, *Taxa da tela (app)* fixa 60/90/120 Hz (ou deixa o sistema decidir). A escolha fica salva no app.
- **Suavidade**: alvo de buffer solicitado ao navegador, independente do renderizador; o painel informa suporte e o atraso medido. Não é uma garantia de latência máxima.
- Botão B do controle não fecha o jogo (Android converte B não tratado em "voltar").
- **Exportar medição** salva o JSON em `Downloads/xCloud ImageFilter`; **Copiar configuração** usa a área de transferência do sistema.
- Depuração remota habilitada: com o celular no PC por USB, abra `chrome://inspect` para ver o console.

Limitações: O microfone não é solicitado. Não há atualização automática.

## Sugestão inicial no Poco F7

Use os padrões da v9: saída **Automática** (renderiza na altura real da tela, ~1220–1280 px, com FSR, e aplica a nitidez no tamanho final), Nitidez USM 3, orçamento 6 ms. Para aparência mais natural, prefira Nitidez 2–3: valores altos aumentam a cintilação de textura. Para testar a **Reconstrução neural** (experimental), ligue-a e use Nitidez ~2,5. Compare **Novo tratamento** com **Referência: só nitidez**. Se aparecer o aviso de injeção tardia, atualize o **Android System WebView** pela Play Store.

## Build

Sem Gradle nem Android SDK (Ubuntu 24.04):

```sh
sudo apt-get install aapt dalvik-exchange zipalign apksigner openjdk-21-jdk-headless
android/build.sh
```

O script gera o userscript (`tools/build.py`), baixa o `android.jar` da API 34 se faltar, compila, gera o dex e assina com `android/debug.keystore`. Essa chave é **de teste** (senha `android`) e é fixa para que novas versões instalem por cima; não é segredo nem serve para loja.

Validação da v10.1.0: mesmo certificado de teste das versões 9.x e 10.0.0, `minSdk 28`, `targetSdk 34`; `versionCode` 100100. Testes Node e Chrome/WebGL/WebGPU (SwiftShader) passaram; veja [as notas](../docs/release-v10.1.0.md). A v9.7 rodou num Poco F7 (Android 16) com o xCloud real: captura direta, exportação da medição e rede confirmadas. As correções da v10.0.0 e da v10.1.0 vêm da medição e da auditoria desse aparelho, mas **esta build ainda não rodou no Poco**.
