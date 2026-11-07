# play.xbox.com: estudo e suporte experimental

Estudo de 2026-11-07, feito sem login. A Microsoft passou a levar contas do `www.xbox.com/<locale>/play` para o novo `play.xbox.com`. O Better xCloud 6.7.x só roda no site antigo.

## 1. Better xCloud upstream

- **v6.7.13 (2026-11-07)**: só melhora o filtro Clarity Boost. A nota da release diz que o autor está portando para o `play.xbox.com` e pede para aguardar.
- **Branch `play.xbox.com`** em `redphx/better-xcloud`: tem só o commit inicial (2026-02-12), sem código.
- **`scripts/opt-out-play-xbox-com.user.js`**: script novo do autor, @match `https://play.xbox.com/*`. Ele para a página e vai para `https://play.xbox.com/migration/clear?…returnUrl=https://www.xbox.com/play`. Sem login, `GET /migration/clear?returnUrl=https://www.xbox.com/play` responde `302` para `https://www.xbox.com/play`. O mesmo opt-out existe na interface: foto do perfil > Exit preview.

Não há versão do Better xCloud para o site novo. Por isso `script.js` continua na 6.7.12 e o caminho seguido foi o item 2 abaixo.

## 2. O site novo, sem login

Build observado: `hotfix-1.0.2611.0612`, gerado em 2026-11-06T23:46Z.

- **Pilha**: React Router v7 com SSR e chunks do rolldown em `/assets/*.js`. As rotas ficam em `/assets/manifest-*.js`.
- **URLs**: não têm prefixo de locale.
  - Jogo na nuvem: `/stream/:productId/:productName?`, rota `CloudStreamRoute`, módulo `CloudConsoleStreamRoute-*.js`.
  - Remote Play: `/remoteplay/:consoleId`.
  - Outras: `/library`, `/game-pass`, `/store`, `/search`, `/products/:productId`, `/auth/msa/:action?`.
- **CSP**: `script-src` usa nonce e não tem `'unsafe-inline'`. `style-src` aceita `'unsafe-inline'`. `worker-src` aceita `blob:`. A CSP não bloqueia scripts injetados por gerenciador de userscript nem por `addDocumentStartJavaScript`/`evaluateJavascript` do WebView. O tratamento também não cria `<script>` nem worker, e os `<style>` dele são permitidos.
- **Cliente de stream**: `StreamSessionRequest` carrega `WebRtcStreamV1-*.js` sob demanda. Em `connectAsync(container)`:
  1. Reusa o primeiro `<video>` do container. Se não houver, cria um com `width/height 100%`, `object-fit: contain`, `autoplay`, `playsInline`, `tabIndex 0` e `role=application`, e o anexa ao container.
  2. Em `peerConnection.ontrack`, para a trilha de vídeo, faz `video.srcObject = e.streams[0]`. Em Tizen e similares usa um `MediaStream` com áudio e vídeo juntos.
  3. Ao desconectar, zera `srcObject` e remove o `<video>`.
- **Container**: o container vem de `gameStreamAdapter-*.js`: `div[data-testid="media-container"].w-full.h-full`, dentro de `div[data-testid="root-container"]`.
- **Renderização**: o cliente web não usa canvas, WebCodecs nem insertable streams. Há também um `NativeStreamingEnvironment` para hosts nativos (apps da Microsoft), que não se aplica a navegador nem ao nosso WebView.

**Conclusão**: o tratamento pode rodar no site novo sem as alterações do Better xCloud, ligado direto ao `<video>`. O motor (`src/restoration-engine.js` + shaders) já era independente, e o `player/` local usa o mesmo motor. O adaptador (`src/image-filter.js`) só precisa da classe `WebGL2Player` do upstream e de `STATES.currentStream.peerConnection`.

## 3. O que foi implementado

### Userscript `xcloud-image-filter-play.user.js`

É gerado por `tools/build.py`. Usa @match `https://play.xbox.com/*`, `@run-at document-start` e `@noframes`.

- **`src/play/prelude.js`**: stubs mínimos de `BxLogger` e `getStreamPref`. Também envolve `RTCPeerConnection` em document-start (subclasse) para registrar a conexão que recebe vídeo. Isso alimenta telemetria, Suavização e adaptação à compressão.
- **Classes do upstream**: `BaseStreamPlayer`, `BaseCanvasPlayer` e `WebGL2Player` saem de `script.js` sem alteração (MIT). Assim `image-filter.js`, `panel.js` e `hud.js` rodam como estão.
- **`src/play/host.js`**:
  - **Detecção**: procura um `<video>` com `srcObject` que tenha trilha de vídeo `live`. Procura primeiro em `[data-testid=media-container]` e, se não achar, em qualquer `<video>`. Trailers e vídeos de destaque usam `src` e ficam de fora.
  - **Canvas**: cria um `WebGL2Player` com o canvas logo depois do vídeo, posicionado sobre ele com `pointer-events: none`. O vídeo fica com `opacity: 0`, não `display: none`, para que foco, teclado e ponteiro continuem indo para o elemento do site.
  - **Fim e reconexão**: acompanha o fim do stream e a troca de `<video>` (verificação a cada 1 s e em mutações do DOM) e remove o canvas.
  - **Painel**: um botão "IF" no canto superior esquerdo durante o stream, que some após 4 s sem ponteiro, ou **Alt+Shift+F**. As teclas digitadas no painel não chegam ao jogo, e Esc fecha o painel.
- **`www.xbox.com/*/play` não muda**: `better-xcloud-image-filter.user.js` só muda no fingerprint `sourceSha256` do `BxBuild`, porque `src/play/` entra no hash.

### App Android

- **Assets**: `android/build.sh` copia o novo script como asset `play.js`.
- **`MainActivity`**:
  - Registra um segundo document-start só para a origem `https://play.xbox.com`. O wrapper `wrapPlay()` exige o frame do topo, hostname `play.xbox.com` e execução única por documento.
  - A injeção tardia (`onPageStarted`, para WebView sem document-start) também cobre `play.xbox.com`.
  - `fromXbox()` aceita `play.xbox.com`, para que copiar configuração e salvar medição funcionem lá.
- **Sem mudança**: `START_URL`, o wrapper e a injeção em `www.xbox.com`.

### CI

`build-release.yml` faz quatro coisas com o novo arquivo:

- confere se ele foi gerado (`git diff --exit-code`);
- roda `node --check`;
- inclui o arquivo no artefato;
- anexa o arquivo à release.

`tools/run-browser-tests.py` ganhou a suíte `play-harness.html`.

## 4. Testes feitos (sem login)

- **`tools/play-harness.py`**: 20 verificações num Chrome real. A página imita a estrutura do site novo (`media-container` > `<video>`), com `srcObject` vindo de um loopback WebRTC como faz o `WebRtcStreamV1`. Cobre:
  - nada é tratado sem stream;
  - a conexão rastreada continua sendo um `RTCPeerConnection` real;
  - canvas no lugar certo e cobrindo a área;
  - quadros tratados sem erro de GL (320×180 → 640×360, 30 FPS);
  - telemetria via `getStats` da conexão rastreada;
  - painel por botão e atalho, teclas isoladas, Esc;
  - remoção ao desconectar e retomada com novo `<video>`.
- **Site real `play.xbox.com`** (home e uma rota `/stream/…`, sem login), com o script em document-start. Testei o userscript puro e também o texto exato do wrapper do Android. O script carrega e o `RTCPeerConnection` fica rastreado. Os únicos erros da página (`uhf-header` já definido e um 404) aparecem igualmente sem o script.
- **Suítes existentes e `node --test tests/*.cjs`**: passam.

## 5. Pendente: validação com o Matheus logado jogando

Nada abaixo dá para verificar sem conta:

1. **Detecção**: confirmar que o stream de `/stream/<produto>` cria o `<video>` dentro de `[data-testid=media-container]` e que o botão "IF" aparece. No console: `BxImageFilter.playHost.player()` deve ser diferente de `null`, e `BxImageFilter.status.mode` deve estar em `filtered`.
2. **Imagem**: o canvas cobre o vídeo sem tarja nem deslocamento, em tela cheia e fora dela. A interface do site (menu do stream, toque) continua por cima.
3. **Entrada**: controle, teclado e toque chegam ao jogo com o canvas por cima.
4. **Telemetria**: o painel mostra codec, FPS recebido e bitrate. Se não mostrar, a conexão rastreada não é a do vídeo.
5. **Reconexão** e troca de jogo: o canvas some e volta, sem ficar duplicado.
6. **Remote Play** (`/remoteplay/:consoleId`): usa o mesmo `WebRtcStreamV1`, mas não foi visto.
7. **Android (WebView)**:
   - o site novo abre com o UA atual do app;
   - o document-start dispara em `play.xbox.com`;
   - o botão "IF" responde ao toque;
   - a resolução recebida não cai para 720p. O ajuste `1080p-hq` do wrapper antigo depende do Better xCloud e **não existe no site novo**.
8. **Medição**: salvar uma medição no Poco e no Dell para comparar o custo com o site antigo.

### Roteiro de teste para o Matheus (Windows/Chrome + Tampermonkey)

1. No Tampermonkey, crie um script novo e cole todo o conteúdo de `xcloud-image-filter-play.user.js`. Salve. O script do site antigo pode continuar instalado: ele não roda em `play.xbox.com`.
2. Abra `https://play.xbox.com`, entre num jogo na nuvem e espere a imagem aparecer.
3. No console (F12), confira:
   - `BxImageFilter.playHost.player()` não é `null`;
   - `BxImageFilter.status.mode` é `filtered`;
   - `BxImageFilter.status.resolution` mostra a entrada e a saída, por exemplo `1920×1080 → …`.
4. Clique no botão **IF**, no canto superior esquerdo, ou use **Alt+Shift+F**. Compare **Vídeo original** com **Novo tratamento** na mesma cena. O painel deve mostrar codec, FPS recebido e bitrate.
5. Confira se o controle e o teclado continuam funcionando, inclusive em tela cheia.
6. Saia do jogo e entre em outro: o botão some e volta, com uma única imagem.
7. Se algo falhar, envie o resultado de `BxImageFilter.status` e um print da tela.

## 6. Limites conhecidos no site novo

- **Sem os recursos do Better xCloud**: resolução e bitrate forçados, região, limite de FPS, MKB, controles de toque, barra de estatísticas e o renderizador/nitidez nativos. Os avisos do painel que leem preferências do Better xCloud ficam calados.
- **Sem navegação por controle**: o painel abre por botão (ponteiro/toque) ou teclado. Num Android TV só com controle, não há como abrir o painel até integrar com o menu do site novo.
- **Fragilidade**: a detecção depende de `srcObject` com trilha WebRTC e do `data-testid` do container. É o que há no build `hotfix-1.0.2611.0612`, e um build futuro pode mudar isso.
- **Opt-out não resolve para todos**: para o Matheus, "Exit preview" redireciona de volta para `play.xbox.com` (relato de 2026-11-07). Para a conta dele, este userscript é o único caminho para ter o tratamento. Quem ainda consegue sair do preview continua no site antigo, onde nada mudou.
