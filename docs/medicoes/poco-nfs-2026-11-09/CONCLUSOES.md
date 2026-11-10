# Conclusões — sessão de depuração no Poco F7 (2026-11-09, 20:05–23:17)

NFS Hot Pursuit Remastered (30 FPS) e Gears of War 4 (60 FPS), play.xbox.com e www.xbox.com, APK 10.1.0 e 10.1.1-test. Os números de cada corrida estão no [README.md](README.md); a lista de trabalho está em [../../proxima-build.md](../../proxima-build.md).

## 1. Conclusão principal

A imagem e a fluidez dependem muito mais de **o que chega** (resolução e perfil do stream) e de **como o Android entrega o quadro à tela** (taxa do painel) do que dos filtros. Os filtros custam pouco e cabem no orçamento. Os ganhos grandes da noite vieram de fora deles:

| Mudança | Efeito medido |
|---|---|
| Forçar 1080p e impedir a queda | 720p H.264 **Baseline** → 1080p H.264 **Main**, bitrate de ~5,8 para ~12,3 Mb/s |
| Tela a 60 Hz (jogo a 60 FPS) | decodificação 25 → 9 ms; recepção até a tela 47 → 21 ms; desvio do frametime 7 → 2,5 ms |
| Servidor sorteado na fila | RTT 73 → 24 ms (latência no HUD ~120 → 53 ms) |
| Rede neural ligada | +~5 ms de GPU por quadro em 1080p (cabe a 30 e a 60 FPS com o aparelho frio) |
| Detalhe / Degradês | ≤ 1 ms de GPU; a escolha é pela imagem |

## 2. Descobertas

1. **O play.xbox.com pede 720p Baseline.** O site se anuncia como `android` com a tela da janela (807×394). Declarando `windows` e 1920×1080 no `POST /v5/sessions/cloud/play`, o servidor manda 1080p Main 4.2.
2. **O servidor derruba o 1080p em ~15 s por causa da decodificação reportada.** O `WebRtcStreamV1` envia `frameDecodedTimeMs = receiveTime + currentDecodeTimeMs` (do `getStats`). Ver 8 ms em vez de ~21 manteve o 1080p. Acontece até no modo Original, então não é o tratamento.
3. **A tela a 120 Hz é o maior gargalo local em jogos a 60 FPS.** A decodificação dobra ou fica bimodal, a Fluidez espera mais e os engasgos sobem de 5 a 7 vezes. A 60 Hz, tudo se normaliza. A economia de bateria só ajudava porque força 60 Hz.
4. **O `setRefreshRate` do app não troca o painel no HyperOS.** Ele vira um limite de renderização da camada (60 Hz "simulado" numa tela a 120 Hz) e piora o ritmo.
5. **O app compõe a ~90–120 quadros/s com vídeo a 30/60 FPS**, quase tudo marcado `buffer_stuffing` no SurfaceFlinger, com milhares de prazos perdidos.
6. **O HyperOS limita a CPU a ~40% (pele ≥ ~48 °C) sem mudar o `Thermal Status`** (sempre 0). Afeta a decodificação, mas, revendo os dados, menos do que a tela a 120 Hz.
7. **O servidor da fila varia muito dentro do mesmo Brazil South:** 13.104.122.68 com ~73 ms e 13.104.105.100 com ~24 ms. A região já é a mais próxima (`allowRegionSelection: false`), e a rede local está ótima (Wi-Fi 7, roteador a 3,6 ms). O 5G deu a mesma latência.
8. **O xCloud só transmite H.264 Main/Baseline.** O WebView oferece High (e o Poco decodifica até H.265, VP9 e AV1), mas o servidor recusa. O "High" do Better xCloud na prática é Main. O **1080p HQ (`tizen`) dá o mesmo stream** que o 1080p (`windows`).
9. **WebGL2 é mais leve que WebGPU no Adreno 825:** ~2,3 ms a menos de GPU real por quadro, com latência igual. O WebGPU gasta mais apesar de os shaders medirem menos (composição de dois canvas e `highp`).
10. **O fence do WebGL2 superestima ~1,8×** a GPU real (~20 contra ~11 ms). Hoje ele alimenta avisos e a redução automática.
11. **O botão do app ficava em cima do menu do Xbox** durante o jogo (canto superior esquerdo), e por isso "não dava para sair do jogo".
12. **A hidratação do React no play.xbox.com remove elementos** colocados cedo na página. O HUD sumia até ser alternado.
13. **O app alterna entre o site antigo e o novo** conforme a Microsoft redireciona `www.xbox.com/play`. No antigo vale o Better xCloud, que veio com "impedir queda" desligado.
14. **Sair do app para as Configurações derruba o stream** do play.xbox.com (tela preta).

## 3. Gargalos (por peso, do lado do celular)

1. **Taxa do painel (120 Hz)**: +~25 ms de latência local e frametime irregular.
2. **Rota até o servidor**: 24–73 ms de RTT conforme o servidor sorteado. Fora do controle do app, mas dá para avisar.
3. **Decodificação**: 9–10 ms no melhor caso; até 25+ com 120 Hz ou com o aparelho quente.
4. **Composição excessiva** (~90–120 quadros/s): GPU e bateria gastas sem quadro novo.
5. **GPU do tratamento**: 11–18 ms por quadro em 1080p (rede neural +~5 ms). Cabe a 30 FPS; a 60 FPS fica em ~76% e não aguenta aquecimento nem menus.

## 4. Onde cabe melhoria (próxima build)

**Já feito no código (APK 10.1.1-test, não commitado):** 1080p e anti-queda como opções; HUD que volta sozinho; widget arrastável "xCloud Enhanced" com o ícone novo, fora do menu do Xbox; fechar o painel tocando fora.

**A fazer, por impacto:**
1. Travar o painel em 60 Hz de verdade (testar `setFrameRate`/`setRequestedFrameRate`, verificar a taxa real e avisar quando o sistema ignorar).
2. Aviso de servidor distante (RTT inicial > ~50 ms → sugerir entrar de novo na fila).
3. Aviso de limitação térmica, pela ponte Android (`getThermalHeadroom`/cpufreq) ou pela decodificação dobrando.
4. Parar a composição sem quadro novo (loop de rAF da Fluidez, HUD, canvas).
5. Rede neural automática pela **ocupação real e pela limitação térmica**, não só pelo FPS.
6. No Adreno, `renderer: auto` deve escolher WebGL2. Mostrar por que o renderizador mudou.
7. Calibrar ou abandonar o fence do WebGL2 como medida de orçamento.
8. No site antigo, avisar quando a resolução estiver forçada sem "impedir queda". Corrigir o rótulo "15 Mb/s", que significa "sem limite".
9. Registrar na medição a taxa real do painel, o IP do servidor e o RTT inicial.

## 5. Lacunas (o que não foi medido ou ficou inconclusivo)

- **A/B da rede neural a 60 FPS:** as janelas coincidiram com o início da partida e com morte/renascimento. Repetir com janelas curtas.
- **Separar calor de taxa do painel:** as corridas 2–7 não registraram a taxa real do painel. Repetir uma corrida longa, com o aparelho frio, a 60 Hz fixos.
- **Teste térmico longo** (~10 min sem mexer em nada) para achar quando o HyperOS começa a limitar.
- **Carregando × bateria, com ou sem cooler.**
- **Captura direta × vídeo** em latência e ritmo.
- **HUD completo × desligado** na composição a 120 Hz.
- **Teste no 5G:** o app morreu às 21:09, e só ficou o relato ("mesma latência").
- **Qualidade de imagem objetiva:** só dois prints de cena parada. Faltam comparações controladas de textura, banding e cintilação.
- **O "1080p HQ" no site antigo** com o Better xCloud não foi medido.

## 6. Desafios e barreiras

- **Medir sem atrapalhar:** o Perfetto completo (com `sched` e atrace `webview`) gerava 4–7 MB/s. Foi preciso uma config enxuta (~0,1–0,3 MB/s). O adb e o DevTools dividem o Wi-Fi com o stream.
- **adb pelo Wi-Fi é frágil:** a porta muda ao alternar redes, impossibilitando acompanhar o teste no 5G. O app reinicia ou morre, e com ele vão o gravador e os patches injetados. Por isso valeu migrar os patches para o código.
- **Variáveis acopladas:** desligar a rede neural trocava o renderizador; a economia de bateria trocava a taxa da tela; o calor muda ao longo da sessão; o servidor muda a cada fila; eventos do jogo (morte, menus a 60 FPS) caem nas janelas de A/B.
- **Medidas enganosas:** o fence do WebGL2 superestima; o `refreshHz` vem 0 em Auto; o `Thermal Status` fica em 0 com a CPU limitada; o `<video>` reporta ~100% de quadros descartados com o tratamento ligado.
- **Barreiras externas:** a região (sem seleção), o perfil do codec (sem High), a rota da operadora, a política de taxa de tela e a limitação térmica do HyperOS, e a dependência do comportamento atual do site (`/sessions/cloud/play`, `x-ms-device-info`, `WebRtcStreamV1`), que pode mudar sem aviso.

## 7. O que aprendemos (método)

- Uma variável por vez, **A/B dentro da mesma corrida** (janelas de 40 s) e marcações de horário automáticas. Comparar corridas diferentes sofre com servidor, calor e trecho do jogo.
- Usar o **Perfetto (`gpu_work_period`)** como verdade de GPU e o **rVFC por quadro** como verdade de ritmo e latência. As estimativas internas servem só como sinal.
- Registrar sempre **taxa real do painel, limite de CPU e temperatura, RTT e IP do servidor**. Sem isso, um efeito vira outro.
- Começar pelo que chega (resolução, perfil, bitrate) e pela entrega à tela, antes de afinar filtros.
- Ferramentas reutilizáveis estão em `scripts/`: `cdp.cjs`, `persist.cjs`, `rec.js`, `ab.sh`, `abwin.py`, `lean.pbtx`, `caps.sh`, `codec.js`, `force1080.js`, `nodrop.js`.

## 8. Configuração recomendada hoje (Poco F7)

Tela em **60 Hz** (Configurações → Tela, antes de abrir o jogo) · resolução **1080p** com **impedir queda** · renderizador **WebGL2** · Fluidez **Equilibrada** · saída **Auto** (SGSR) · Detalhe 100% e Degradês 80% · rede neural ligada com o aparelho frio (desligar se esquentar ou engasgar) · se o RTT inicial vier alto (> ~50 ms), sair e entrar de novo na fila.
