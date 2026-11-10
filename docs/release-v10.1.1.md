# v10.1.1 (beta) — 1080p no play.xbox.com, xCloud Enhanced e correções do teste no Poco

Userscripts `6.7.12-imagefilter.10.1.1` (www.xbox.com, sobre o Better xCloud 6.7.12) e `10.1.1-play` (play.xbox.com), app Android **10.1.1** (`versionCode` 100101). Inclui tudo da [v10.1.0](release-v10.1.0.md).

## Origem

Primeira sessão de depuração ao vivo no Poco F7 (2026-11-09), com Perfetto, medição do app, gravador na página e A/B automático durante NFS Hot Pursuit Remastered (30 FPS) e Gears of War 4 (60 FPS). Evidências, números e conclusões:
- [medicoes/poco-nfs-2026-11-09/README.md](medicoes/poco-nfs-2026-11-09/README.md): as 12 corridas e os testes de perfil e de taxa de tela;
- [medicoes/poco-nfs-2026-11-09/CONCLUSOES.md](medicoes/poco-nfs-2026-11-09/CONCLUSOES.md): descobertas, gargalos, lacunas e barreiras;
- [proxima-build.md](proxima-build.md): a lista de trabalho para a próxima versão.

**Esta build já rodou no Poco:** Gears 4 em 1080p60 H.264 Main, sem nenhum patch externo.

## O que mudou

### Stream em 1080p no play.xbox.com
- **Resolução do stream** (`streamResolution`: `auto | 1080p | 1080p-hq`, padrão **1080p**).
  - O site novo se anunciava como `android` com a tela da janela (807×394 no Poco), e o servidor respondia **720p H.264 Baseline 3.1**.
  - Agora o `POST /v5/sessions/cloud/play` declara `windows` e 1920×1080 (`1080p-hq` declara `tizen`), e o servidor manda **1080p H.264 Main 4.2**, com o bitrate indo de ~5,8 para ~12,3 Mb/s.
  - No Poco, o `1080p-hq` resultou no mesmo stream que o `1080p`.
- **Impedir queda de resolução** (`preventDrops`, padrão ligado).
  - Sem ela, o servidor derrubava para 720p em ~15 s, até no modo Original, porque o `WebRtcStreamV1` do site reporta o tempo de decodificação do `getStats` (~21 ms no Poco). O app passa a mostrar 8 ms **só para o site**.
  - O nosso código lê o valor real (`BxPlayStream.realStats`). `status.stream` mostra o pedido feito, se a limitação está ativa e a decodificação real, e há um aviso informativo com o valor real.
- As duas opções ficam no painel, em "Desempenho e rede", e valem a partir do próximo jogo. Dependem do comportamento atual do site (`/sessions/cloud/play`, `x-ms-device-info`, `WebRtcStreamV1`).

### Interface no play.xbox.com
- **Nome "xCloud Enhanced"** no lugar de "IF", com **ícone novo** (nuvem com controle), no botão e no topo do painel.
- **Widget arrastável**: toque abre, arrastar move (limite de 8 px), encosta na borda esquerda ou direita mais próxima e a posição fica salva.
- **O widget não cobre mais o menu do Xbox.** Antes, durante o jogo, o botão ficava em cima do ícone do Xbox, e por isso não dava para sair do jogo. Agora o padrão é à direita, a ~35% da altura, e nenhuma posição fica nos 64 px do topo.
- **Fechar o painel tocando fora dele**, sem que o toque chegue ao jogo. Arrastar de dentro para fora não fecha. Esc também fecha.
- Ícone e nome do app Android: xCloud Enhanced (nuvem com controle)

### Correções
- **O HUD sumia no play.xbox.com** até a opção ser alternada: a hidratação do React removia o elemento criado no início do carregamento. A verificação de 1 s agora o recoloca (`src/hud.js`).

### Testes
- `tests/play.test.cjs` (novo): reescrita do pedido de sessão, limitação no `getStats` com leitura real preservada, normalização das opções, widget (toque × arrasto, posição, borda, faixa do topo, rotação) e fechar tocando fora. **88 testes passando.**

## Recomendações de uso (Poco F7)
- **Tela em 60 Hz** (Configurações → Tela) **antes** de abrir jogos a 60 FPS. A 120 Hz, a decodificação vai de 9 para 25 ms e a latência local de 21 para 47 ms. A opção "Taxa da tela" do painel ainda **não** troca o painel no HyperOS (ver Pendências). Sair do app para as Configurações derruba o stream.
- Renderizador **WebGL2**, Fluidez **Equilibrada**, saída **Auto**.
- Se o RTT inicial passar de ~50 ms, saia e entre de novo na fila: na mesma região, um servidor teve 73 ms e outro 24 ms.

## Pendências (próxima versão)
Ver [proxima-build.md](proxima-build.md). As principais:
1. travar o painel em 60 Hz de verdade;
2. aviso de servidor distante;
3. aviso de limitação térmica;
4. parar a composição sem quadro novo (~90–120 quadros/s com vídeo a 30/60);
5. rede neural automática pela GPU real e pela limitação térmica;
6. WebGL2 como Auto no Adreno.
