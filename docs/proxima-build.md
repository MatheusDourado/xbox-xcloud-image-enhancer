# Próxima build — o que entra (a partir dos testes de 2026-11-09 no Poco F7)

As evidências e os números estão em [medicoes/poco-nfs-2026-11-09/README.md](medicoes/poco-nfs-2026-11-09/README.md). Este arquivo é a lista de trabalho. Cada item tem estado e origem.

## Já no código (APK `android/dist/xcloud-imagefilter-10.1.1.apk`, release v10.1.1-beta.1)

- [x] **Resolução do stream** (`streamResolution`: `auto | 1080p | 1080p-hq`, padrão `1080p`).
  - No play.xbox.com, o pedido de sessão se declara Windows com tela 1920×1080.
  - O servidor passa a enviar 1080p **H.264 Main** 4.2, em vez de 720p Baseline 3.1.
- [x] **Impedir queda de resolução** (`preventDrops`, padrão ligado).
  - O site reporta ao servidor 8 ms de decodificação. Sem isso, o servidor volta a 720p em ~15 s, até no modo Original.
  - O nosso código lê o valor real (`BxPlayStream.realStats`) e há um aviso com o valor real.
- [x] **O HUD some no play.xbox.com até ser alternado.** A hidratação do React removia o elemento criado no início do carregamento. Agora a verificação de 1 s o recoloca (`src/hud.js`, `watch`).
  - O APK 10.1.1-test foi gerado de novo com esta correção.
- [x] **Nome e ícone**: o botão "IF" passa a se chamar **xCloud Enhanced** (`aria-label`, título e cabeçalho do painel; o diagnóstico diz "xCloud Enhanced vX"). O texto "IF" virou o ícone escolhido (nuvem branca com controle, SVG embutido, variante simplificada para 44 px), repetido em tamanho menor ao lado do título do painel. O nome do APK, o pacote, a API e as chaves não mudam.
- [x] **Botão flutuante arrastável** (`src/play/host.js`).
  - Funciona com toque e mouse (Pointer Events). Mover menos de 8 px conta como toque e abre/fecha o painel; um arrasto nunca abre o painel.
  - Ao soltar, encosta na borda lateral mais próxima, respeitando a área segura (notch). A posição é salva em `localStorage` (`BxImageFilter.play.widget.v1`, lado e altura relativa) e restaurada ao carregar. Depois de girar a tela ou redimensionar, continua visível.
  - Sem posição salva: canto inferior direito na navegação; borda direita, a ~35% da altura, no jogo. Mantém o sumiço após 4 s no jogo, a recolocação após a hidratação do React e o Alt+Shift+F.
- [x] **O botão não cobre mais o menu do xCloud** (causa do "não consigo sair do jogo"): no jogo, o padrão agora é a borda direita, a ~35% da altura, e nenhuma posição (padrão, salva ou após arrastar) fica nos 64 px do topo, onde estão o botão Xbox e o cabeçalho do site.
- [x] **Fechar o painel tocando fora dele.**
  - Com o painel aberto, uma camada transparente cobre a página (o botão fica acima dela). Um toque que começa e termina nela fecha o painel, e nenhum evento dela chega ao jogo. A camada fica mais 350 ms para engolir o clique sintético que vem depois do toque.
  - Arrastar um controle do painel e soltar fora não fecha. Esc fecha mesmo com o foco fora do painel.
  - Com o painel aberto, o toque na área do jogo não chega mais ao jogo (o controle físico continua funcionando).

### Observado no aparelho (22:30–22:35)
- O app abre `www.xbox.com/play`, e a Microsoft decide a cada acesso se fica no site antigo (com Better xCloud) ou redireciona para o `play.xbox.com`. Na mesma noite os dois aconteceram. No antigo, 1080p, perfil e bitrate vêm das preferências do Better xCloud (`stream.video.resolution`, `preventResolutionDrops`, `codecProfile`, `maxBitrate`), e o "Impedir queda de resolução" dele estava **desligado** por padrão. Proposta: o painel deve avisar quando o site antigo estiver com resolução forçada e sem impedir queda.
- O `stream.video.maxBitrate` do Better xCloud no topo da escala (15.360.000) significa "sem limite". O código só aplica o limite abaixo disso. O rótulo "15 Mb/s" confunde quem lê.
- APK 10.1.1-test instalado às 22:34 (sha256 `25e65054…`): no `play.xbox.com`, `streamResolution: 1080p`, `preventDrops: true`, widget "xCloud Enhanced" com ícone em (750, 338) navegando.

## A fazer

### Alto impacto
0. **Travar o painel em 60 Hz de verdade para streams de até 60 FPS** (confirmado: 60 Hz fixos sem a economia de bateria deram decodificação de 9,3 ms, recepção até a tela de 21 ms e desvio do frametime de 2,5 ms, contra 25,5 / 47 / 7,0 ms a 120 Hz; a economia de bateria não é necessária).
   - Com a economia de bateria (painel a 60 Hz), a decodificação caiu de 25 para 10 ms, a recepção até a tela de 47 para 23 ms e os engasgos para menos da metade, com a mesma limitação de CPU. O usuário percebeu o frametime mais liso.
   - O `preferredDisplayModeId` atual vira só um limite de renderização no HyperOS. Testar `Surface.setFrameRate`/`SurfaceControl.Transaction.setFrameRate(60, FIXED_SOURCE, CHANGE_FRAME_RATE_ALWAYS)` na superfície do WebView e `Window.getAttributes().preferredRefreshRate` junto com `preferredDisplayModeId`.
   - Enquanto isso, recomendar a economia de bateria ou 60 Hz nas Configurações de tela.
   - Registrar a taxa real do painel na medição (`refreshHz` hoje vem 0 em Auto).
1. **Avisar quando o servidor sorteado for ruim.**
   - No mesmo Brazil South, uma sessão teve RTT de ~73 ms (13.104.122.68) e outra de ~24 ms (13.104.105.100). A diferença virou ~120 contra 53 ms de latência no HUD.
   - Proposta: nos primeiros ~10 s, se o RTT p50 passar de ~50 ms, aviso no HUD/painel: "Servidor distante (RTT X ms): sair e entrar de novo pode reduzir a latência".
2. **Avisar quando há limitação térmica sem aviso do sistema.**
   - O HyperOS limita a CPU a ~40% do máximo com a pele ≥ ~48 °C e o `Thermal Status` em 0. Com isso, a decodificação vai de 10 para 22 ms e a recepção até a tela de 14 para ~43 ms.
   - Pelo WebView não dá para ler o `scaling_max_freq`. Proposta: usar a ponte Android (`BxAndroid`) para expor temperatura/limite (`PowerManager.getThermalHeadroom` e/ou leitura do cpufreq) e avisar. Alternativa: detectar a decodificação dobrando, de ~10 para 20+ ms com a mesma resolução.
3. **O app compõe a ~90–120 Hz para um vídeo de 30 FPS.**
   - Quase todos os quadros da camada do app vêm marcados `buffer_stuffing` no SurfaceFlinger, com milhares de `app_deadline`.
   - Investigar o que redesenha a cada vsync: loop rAF da Fluidez (`ensurePacer`/`tick`), HUD completo, canvas `desynchronized`. Usar `Surface.setFrameRate` pela ponte ou não chamar `present` sem quadro novo.
4. **`BxAndroid.setRefreshRate` não muda a tela no HyperOS.** O pedido vira só um limite de renderização de 60 Hz da camada do app, e o painel fica em 120 Hz. Fixar 60 Hz piorou o ritmo na corrida 2. Rever a orientação "fixe 60 Hz" do checklist (`docs/proxima-sessao-testes-poco.md`) e o texto do painel.

### Médio
5. **Rede neural a 60 FPS: cabe com folga curta.** No Gears 4 em 1080p60, com o aparelho frio, a GPU real ficou em ~76% (12,4–13 de 16,7 ms) e o ritmo se manteve. Nos menus a 60 FPS com a CPU limitada (corrida 5), não coube. Proposta: desligar a rede automaticamente quando a ocupação real passar de ~85% ou houver limitação térmica, não só pelo FPS; repetir o A/B com janelas curtas (o da corrida 12 coincidiu com morte e renascimento).
6. **WebGPU gasta ~2,3 ms a mais de GPU real que o WebGL2 neste aparelho** (13,8 contra 11,4 ms por quadro), com a mesma latência.
   - Suspeitas: composição de dois canvas de 1440p e `spatial@highp` contra `mediump`.
   - Proposta: no Adreno, `renderer: auto` deve preferir o WebGL2; avaliar remover o canvas WebGL2 transparente quando o WebGPU desenha.
7. **Desligar a rede neural troca o renderizador sozinho** (WebGL2 → WebGPU) quando o pedido é WebGPU. Isso mistura variáveis e causa um piscar. Mostrar no painel por que o renderizador mudou.
8. **O fence do WebGL2 superestima ~1,8×** a GPU real (~20 contra 11,4 ms). A redução automática e o aviso "GPU perto do limite" usam esse número. Calibrar ou deixar de basear decisões nele.
9. **O `<video>` reporta ~100% de quadros descartados** (`getVideoPlaybackQuality`) com o tratamento ligado, até no modo Original e com Captura = vídeo (a opacidade é 0). Hoje não afeta a resolução, mas qualquer telemetria do site o vê como cliente "quebrado".

### Ferramentas de teste
10. `tools/device`: incorporar o que foi usado nesta sessão (`docs/medicoes/poco-nfs-2026-11-09/scripts/`):
    - `cdp.cjs` (avaliar no WebView), `persist.cjs` (injetar a cada carregamento), `rec.js` (gravador na página), `ab.sh` (A/B automático), `lean.pbtx` (Perfetto leve, ~0,1–0,3 MB/s);
    - o log de limite de CPU e temperatura (`caps.sh`).
11. A config "gameplay" do Perfetto com `sched_switch` e atrace `webview` gera ~4–7 MB/s. Usar só em janelas curtas.

## Recomendações de configuração (Poco F7, play.xbox.com)
- **Tela em 60 Hz** (Configurações → Tela) para jogar: frametime liso e metade da latência local. A economia de bateria também serve, porque força 60 Hz, mas não é necessária. Mude a taxa **antes** de abrir o jogo: sair do app para as Configurações derruba o stream.
- Resolução do stream **1080p**. O 1080p HQ deu o mesmo bitrate e o mesmo perfil, e o xCloud não aceita H.264 High.
- Renderizador **WebGL2**; Fluidez **Equilibrada** (p99 de 42 contra 51 ms desligada, por ~4 ms de espera); saída **Auto** (SGSR custa ~0,5 ms a mais que a Nativa, com p99 de 44,6 contra 48,8 ms).
- Rede neural: ligada só em jogos a 30 FPS e com o aparelho frio.
- Taxa da tela: **Auto**, não 60 Hz.
