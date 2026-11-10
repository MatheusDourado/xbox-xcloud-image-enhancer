# Poco F7 — NFS Hot Pursuit Remastered, play.xbox.com (2026-11-09)

APK 10.1.0 (`6.7.12-imagefilter.10.1.0`, sha 7840a7cb), WebView 156.0.8078.47, Android 16, SM8735 / Adreno 825.
Coleta: Perfetto enxuto (`scripts/lean.pbtx`: frametimeline, gpu_work_period, cpu_frequency), medição do app (schema 3),
gravador na página (`scripts/rec.js`: status 1 s, rVFC por quadro, LoAF) e limites de clock/temperatura (`caps4.log`).
Os `.pftrace` ficam em `traces/` (fora do git, 123 MB).

Config do usuário em todas, salvo indicação: Tratada, neural 1, 1440 + SGSR, Fluidez Equilibrada + Captura direta, Aliviar GPU = Nunca, renderizador pedido WebGPU.

| Corrida | Variável | Stream | Decod. real | GPU real (Perfetto) | Hitches tela | Quadros pulados rVFC |
|---|---|---|---|---|---|---|
| 1 | linha de base (120 Hz) / neural 0 na 2ª metade | 720p30 H.264 **Baseline**, ~5,8 Mb/s | ~9,8 ms | ~40% | 20 + 16 | 5 |
| 2 | taxa 60 Hz | idem | 10 ↔ 21 ms | ~37% | 58 | 117 |
| 3b | Auto Hz de novo | idem | ~21,8 ms | ~36% | 62 | 41 |
| 5 | **1080p forçado + sem queda** | 1080p30 H.264 **Main**, ~12,5 Mb/s | ~22 ms | **~52%** | 136 (maioria nos menus a 60 FPS) | 168 |

## Achados

1. **O site novo pede 720p e o servidor ainda derruba o 1080p.** O cliente se anuncia `osName: android` com tela 807×394, e o servidor responde H.264 Baseline nível 3.1.
   - Com `osName: windows` e tela 1920×1080 no `POST /v5/sessions/cloud/play` (`scripts/force1080.js`), o servidor envia 1080p **Main** nível 4.2.
   - Mesmo assim, cai para 720p em ~10–15 s. Isso acontece **também no modo Original**, ou seja, não é o tratamento.
   - Causa: `WebRtcStreamV1` reporta ao servidor `frameDecodedTimeMs = receiveTime + currentDecodeTimeMs`, e `currentDecodeTimeMs` vem do `getStats` (`totalDecodeTime / framesDecoded`), ~21 ms neste aparelho.
   - Limitar esse valor a 8 ms só para o site (`scripts/nodrop.js`, o mesmo princípio do "preventResolutionDrops" do Better xCloud) manteve o 1080p a corrida inteira.
2. **O app compõe a ~90–120 quadros/s para um vídeo de 30 FPS.** Na camada do app, no SurfaceFlinger, quase 100% dos quadros vêm marcados `buffer_stuffing`. Nas corridas 2–5 houve 3–5 mil `app_deadline`. É GPU, bateria e latência gastas sem quadro novo.
   - Na corrida 1 (WebGPU, neural 0), os shaders custaram 6,0 ms (timestamp), mas a GPU real ficou em ~12,7 ms por quadro de 30 FPS. A diferença sugere composição fora do tratamento.
3. **`BxAndroid.setRefreshRate(60)` não muda a tela no HyperOS.** O pedido vira só um *render frame rate range* 60 da camada do app, e o painel fica em 120 Hz. Fixar 60 Hz piorou o ritmo (corrida 2).
4. **A decodificação dobrou (~10 → ~21 ms) entre as corridas 1 e 2 e não voltou.** Não foi a taxa da tela (corrida 3b).
   - Durante a corrida 5, o `scaling_max_freq` ficou em ~1,19 / 1,29–1,40 / 1,36–1,48 GHz, contra o máximo de 2,0 / 3,0 / 3,2 GHz.
   - Ao mesmo tempo, a pele estava em ~48–49 °C, a bateria em ~44 °C e o `Thermal Status` em 0.
   - Hipótese: limitação térmica do HyperOS, invisível ao status térmico.
5. **Desligar a rede neural troca o renderizador sozinho** (WebGL2 → WebGPU), porque Temporal e neural só existem no WebGL2. Isso confunde qualquer A/B da rede.
6. **Na Captura direta, o `<video>` reporta ~100% de quadros descartados** (`getVideoPlaybackQuality`). Hoje não muda a resolução, mas qualquer telemetria do site que leia isso vê um cliente "quebrado". O mesmo vale para Captura = vídeo e para o modo Original nesta versão (o `<video>` fica com opacidade 0).
7. **Rede neural em 1080p:** fence p50 19 ms, p95 30 ms, p99 40,6 ms. A GPU real fica em ~52%, acima da regra de ≤ 50% da Spec 2, com alguns quadros acima de 33 ms. Nos menus a 60 FPS passa de 40 ms.
8. Engasgo isolado na corrida 1: *freeze* de rede de 0,5 s junto com duas LoAF (158 + 298 ms) sem script atribuído.
9. **Latência em 1080p (relato: acima de 100 ms).** O RTT ficou igual em todas as corridas (p50 72 ms, p95 ~76 ms), então a rede não piorou. O aumento está no aparelho.
   - Recepção até a tela (rVFC `pipe`): p50 15 / p95 25 ms na corrida 1 (720p, decodificação a 10 ms) contra p50 32 / p95 46 ms na corrida 5 (1080p).
   - Ele se divide em: decodificação ~22 ms, espera da Fluidez p50 8 ms (3,8 na corrida 1), GPU fence ~25 ms e `buffer_stuffing` (+1 vsync).
   - O RTT de 72 ms sozinho já põe o total perto de 100 ms. O servidor/região é o maior item.

## Corrida 6 — WebGL2 × WebGPU, 1080p, rede neural 0 (A/B a cada 40 s, só os trechos da corrida)

| Janela | GPU real (Perfetto) | GPU do app | Recepção até a tela p50/p95 | Intervalos > 50 ms | Quadros pulados |
|---|---|---|---|---|---|
| WebGPU 1 | 40,9% (13,6 ms/quadro) | timestamp 10,0 ms | 44,7 / 55,9 ms | 47 | 49 |
| WebGL2 1 | **33,9% (11,3 ms)** | fence 19,1 ms (limite superior) | 41,1 / 56,1 ms | 59 | 54 |
| WebGPU 2 | 42,4% (14,1 ms) | timestamp 10,2 ms | 44,3 / 57,0 ms | 69 | 65 |
| WebGL2 2 | **34,4% (11,5 ms)** | fence 20,5 ms | 42,9 / 56,6 ms | 64 | 61 |

- **O WebGPU gasta ~2,3 ms a mais de GPU real por quadro**, mesmo com os shaders medindo 10 ms.
  - Suspeitas: a composição de dois canvas de 1440p (o WebGPU embaixo do WebGL2 com opacidade 0) a ~90–120 Hz, e o `spatial@highp` contra `mediump` no WebGL2.
  - Latência e engasgos ficaram iguais nos dois. Neste aparelho, o WebGL2 é melhor, e ainda permite a rede neural.
- **O fence do WebGL2 (~20 ms) superestima ~1,8×** a GPU real (11,4 ms). Não serve para decidir orçamento.
- A recepção até a tela piorou em relação à corrida 5 (p50 32 → ~43 ms), e a espera da Fluidez subiu para ~13 ms. Ao mesmo tempo, o limite de CPU apertou para 1,07 / 1,19 / 1,23 GHz (pele 49,3 °C; `caps6.log`).

## Corrida 7 — rede neural 0 × 100%, WebGL2 fixo, 1080p, saída Auto (2276×1280)

As janelas limpas são a 2ª e a 3ª. A 1ª inclui a compilação e o pré-corrida; a 4ª inclui o menu de pausa.

| Janela | GPU real (Perfetto) | Fence p50 | Espera da Fluidez | Recepção até a tela p50/p95 | Intervalos > 50 ms |
|---|---|---|---|---|---|
| neural 0 (68–105 s) | **31,7% (10,6 ms)** | 20,6 ms | 12,3 ms | 41,2 / 55,7 ms | 56 |
| neural 1 (108–145 s) | **46,6% (15,5 ms)** | 23,2 ms | 11,9 ms | 34,7 / 53,6 ms | 53 |

- **A rede neural custa ~5 ms de GPU real por quadro em 1080p** (+15 pontos de ocupação), o mesmo que a bancada da Spec 2 (+5,2 ms).
- A 30 FPS cabe (46,6%, perto do teto de ~50% da Spec 2) e não piorou latência nem engasgos dentro da corrida. A 60 FPS (menus e pausa) não cabe.
- No teste 5G (o app morreu às 21:09, sem dados da página), o usuário relatou a mesma latência de ~120 ms do Wi-Fi. O RTT de ~73 ms é do caminho até o Azure Brazil South (13.104.122.68, a região padrão e mais próxima da conta; `allowRegionSelection: false`). A rede local está boa: Wi-Fi 7 em 5,5 GHz, −15 dBm, roteador a 3,6 ms.

## Corrida 8 — Fluidez desligada × Equilibrada, 1080p, servidor novo (13.104.105.100, RTT ~24 ms)

| Janela (só 30 FPS) | Espera da Fluidez | `<video>` recepção até a tela p50/p95 | Intervalos > 50 ms | Quadros pulados | rtt |
|---|---|---|---|---|---|
| off 1 | — | 14,2 / 20,4 ms | 3 | 0 | 24 |
| Equilibrada 1 (com pausa) | 3,9 ms | 14,4 / 20,0 ms | 5 | 1 | 24 |
| off 2 | — | 13,9 / 19,5 ms | 2 | 0 | 23 |
| Equilibrada 2 | 3,6 ms | 14,2 / 21,3 ms | 8 | 0 | 23 |

Pelos segmentos da medição, a tela tratada ficou em p95/p99 **35,2 / 42,1 ms com a Fluidez Equilibrada** contra **42,6 / 50,7 ms desligada**. A Equilibrada deixa o ritmo mais regular por ~4 ms de espera. Recomendação: manter a Equilibrada.

**Dois achados maiores nesta corrida:**
- **O servidor sorteado na fila muda a latência em ~50 ms.** As duas sessões estavam no Brazil South: 13.104.122.68 com RTT ~73 ms e 13.104.105.100 com ~24 ms. O usuário viu **53 ms** no HUD (antes, ~120 ms). Ideia para o app: avisar quando o RTT inicial passar de ~50 ms e sugerir reentrar na fila.
- **A limitação térmica explica a decodificação lenta das corridas 2–7.** Depois de ~30 min parado (teste 5G), o `scaling_max_freq` voltou ao máximo (2,02 / 3,01 / 3,17 GHz; pele 45 °C).
  - A decodificação real voltou a ~10,5 ms, contra ~22 ms antes.
  - A recepção até a tela caiu de ~41–45 ms para **~14 ms** em 1080p, e os quadros pulados foram a ~0.
  - Ou seja, o HyperOS reduz a CPU para ~40% (pele ≥ ~48 °C) com o `Thermal Status` ainda em 0, e isso dobra a decodificação.
- Defeito de medição desta sessão (patch injetado): o `final.rtc.totalDecodeTime` do export saiu com o valor limitado, porque o `getStats` do nosso código passava pelo patch. A versão no código (`BxPlayStream.realStats`) corrige isso.

## Corrida 9 — saída Nativa (1920×1080, `casFiltered`) × Auto (2276×1280, `sgsr`), 1080p, rede neural ligada, RTT ~24–31 ms

| Janela | GPU real | Fence p50 | Espera | Recepção até a tela p50/p95 | > 50 ms |
|---|---|---|---|---|---|
| Nativa 1 | 51,3% (17,1 ms) | 22,6 | 3,7 | 13,7 / 20,4 | 6 |
| Auto 1 | 54,9% (18,3 ms) | 20,0 | 3,5 | 13,9 / 20,0 | 4 |
| Nativa 2 | 54,1% (18,0 ms) | 21,2 | 3,6 | 14,1 / 20,4 | 3 |
| Auto 2 | 54,4% (18,1 ms) | 21,7 | 3,7 | 14,4 / 20,3 | 10 |

- **A saída Auto com SGSR custa só ~0,5 ms a mais** que a Nativa, com latência igual. A tela ficou melhor na Auto: p99 de 44,6 contra 48,8 ms. Recomendação: **Auto**.
- A GPU real com rede neural em 1080p subiu para ~54% (era 47% na corrida 7). O limite de CPU voltou a apertar durante a corrida: 1,19 / 1,52 / 1,67 → 1,08 / 1,40 / 1,48 GHz, com pele a 46,9 °C (`caps9.log`). Mesmo assim, a recepção até a tela ficou em ~14 ms.

## Corrida 10 — Detalhe e Degradês, 1080p, rede neural ligada, saída Auto, RTT ~24 ms

| Janela | GPU real | Espera | Recepção até a tela p50/p95 | > 50 ms | Quadros pulados |
|---|---|---|---|---|---|
| Detalhe 100% / Degradês 80% (usuário) | 50,2% (16,7 ms) | 8,2 | 32,6 / 41,3 | 31 | 8 |
| **Detalhe 30%** | 52,7% (17,5 ms) | 4,9 | 20,1 / 39,3 | 18 | 2 |
| usuário | 50,9% (17,0 ms) | 8,5 | 32,6 / 41,6 | 36 | 11 |
| **Degradês 0** | 48,1% (16,0 ms) | 8,6 | 31,6 / 41,0 | 50 | 17 |

- **O custo de GPU dos filtros é pequeno.** O Detalhe 30% não economiza nada: os passes são os mesmos. O Degradês 0 economiza ~0,7–1 ms, porque troca a variante `spatial@…1.0.0`.
- A escolha é pela imagem. **O usuário preferiu a própria config (Detalhe 100%, Degradês 80%).**
- A recepção até a tela voltou a ~32 ms (era ~14 na corrida 9), e os quadros pulados subiram. O limite de CPU voltou a apertar (`caps9-10.log`). A janela do Detalhe 30% (20 ms) parece coincidência térmica, não efeito do filtro.

## Corridas 11–12 — Gears of War 4, 60 FPS, **APK 10.1.1-test, sem patches injetados**

- **O APK funcionou sozinho.** O pedido saiu como `osName: windows`. O stream foi 1920×1080 H.264 Main a 59–60 FPS, com bitrate p50 de 12,2 Mb/s (máximo de 13,4). O anti-queda segurou o 1080p a sessão inteira: o site viu 8 ms, a decodificação real foi 9,9 ms (`status.stream`). RTT de 25 ms. Durante o jogo, o widget ficou em (750, 126), longe do menu do xCloud.
- **Corrida 11 (rede neural ligada a sessão toda):** GPU real **76,9%** (12,8 de 16,7 ms por quadro). Tela com p50/p95/p99 de 16,7 / 25,3 / 33,2 ms. A Fluidez descartou 205 quadros; o rVFC pulou 91 de 11.845 (0,8%). O app perdeu 3.196 prazos no SurfaceFlinger.
- **Corrida 12 (A/B a cada 40 s, só trechos a 60 FPS):**

| Janela | GPU real | Espera | Recepção até a tela p50/p95 | Intervalos > 25 ms | Quadros pulados |
|---|---|---|---|---|---|
| neural 0 (início do jogo) | 47,8% (8,0 ms) | 12,0 | 46,6 / 59,5 | 244 | 184 / 1.952 |
| neural 1 | **74,2% (12,4 ms)** | 3,7 | 22,6 / 40,4 | 38 | 8 / 2.191 |
| neural 0 (inclui morte e renascimento) | 47,3% (7,9 ms) | 4,0 | 24,8 / 53,0 | 106 | 77 / 2.115 |
| neural 1 | **77,8% (13,0 ms)** | 3,8 | 22,0 / 36,2 | 30 | 2 / 2.183 |

  - **A rede neural custa ~4,8 ms de GPU real por quadro em 1080p**, o mesmo que a 30 FPS. A 60 FPS ela **coube** (12,4–13 de 16,7 ms) enquanto a CPU estava livre.
  - **Resultado inesperado:** as janelas com a rede desligada tiveram **mais** engasgos. Elas coincidiram com o início da partida e com a morte/renascimento, então o trecho do jogo mistura o efeito. Precisa repetir, com janelas mais curtas e mais trocas, antes de tirar conclusão.
  - O limite de CPU caiu durante a sessão: 2,02 / 2,07 / 2,05 GHz até 22:45, depois 1,08 / 1,40 / 1,48 GHz, com pele a ~49,9 °C (`caps11-12-gears.log`).
- **Revisão do achado 7 / item 5 da próxima build:** "a rede neural a 60 FPS não cabe" valia para os **menus** da corrida 5, com a CPU limitada e o fence como medida. No jogo, com o aparelho ainda frio, ela coube (~76% de GPU real). O desligamento automático deve olhar a ocupação real e a limitação térmica, não só o FPS.

## Perfis do stream e economia de bateria — Gears 4, 1080p60, APK 10.1.1-test (22:52–23:07)

**1080p HQ (`tizen`) × 1080p (`windows`):** os dois negociam o mesmo **H.264 Main 4.2**, com o **mesmo bitrate**: p50 12,25 contra 12,26 Mb/s, p95 ~13,4 nos dois, 0,098 bit/pixel. Neste aparelho, o HQ não entrega nada a mais. Prints em `screens/gears-hq-tizen.png` e `screens/gears-1080p-windows.png`.

**H.264 High (`64001f`):** o WebView oferece (preferência injetada por `scripts/codec.js`), mas **o servidor do xCloud recusa**. A resposta só lista Main `4d002a` e Baseline `42…`, e o próprio site recoloca o Main em primeiro na oferta. **Main é o melhor perfil disponível.** O "High" do Better xCloud na verdade escolhe o Main (`4d`). O decodificador do Poco também aceitaria H.265, VP9 e AV1, mas o xCloud transmite em H.264.

**Economia de bateria do HyperOS (A/B feito pelo usuário, mesma sessão, CPU limitada nos dois trechos):**

| Trecho | Tela | Decodificação p50/p95 | Espera | Recepção até a tela p50/p95 | Tela p95 / desvio | Engasgos a cada 2 s |
|---|---|---|---|---|---|---|
| economia desligada | **120 Hz** | **25,5 / 31,3 ms** | 12,9 ms | **46,6 / 59,0 ms** | 34,1 / 6,8 ms | 15 |
| economia ligada | **60 Hz** | **10,0 / 17,3 ms** | 5,2 ms | **22,7 / 36,1 ms** | 28,2 / 3,7 ms | 6 |

- O usuário relatou o mesmo: **frametime mais liso e latência mais baixa** com a economia ligada.
- A economia de bateria trava o painel em **60 Hz de verdade** (`vsyncRate=60`). O `BxAndroid.setRefreshRate(60)` não conseguia isso: só limitava a camada do app.
- **Revisão de hipótese:** o limite de CPU era parecido nos dois trechos (~1,1–1,5 GHz), e mesmo assim a decodificação caiu de 25 para 10 ms. Então **a decodificação dobrada das corridas 2–7 e 11–12 pode vir mais do painel a 120 Hz do que da limitação térmica**. O HyperOS troca a taxa sozinho, e isso não ficou registrado nas corridas antigas. Falta separar o efeito do painel a 60 Hz dos outros efeitos da economia de bateria (CPU, tarefas em segundo plano): repetir com **60 Hz fixo nas Configurações de tela, sem a economia**.

### Tela 60 × 120 Hz × economia de bateria — as quatro combinações (Gears 4, 1080p60, mesma noite, CPU limitada)

| Tela | Economia | Decodificação p50/p95 | Espera | Recepção até a tela p50/p95 | Tela p95 / desvio | Engasgos a cada 2 s |
|---|---|---|---|---|---|---|
| **60 Hz** (Configurações) | desligada | **9,3 / 10,8** | 6,3 | **20,7 / 29,6** | **18,6 / 2,5** | **2** |
| 60 Hz (Configurações) | ligada | 9,3 / 10,8 | 6,2 | 22,2 / 30,9 | 19,7 / 3,1 | 4 |
| 60 Hz (forçada pela economia) | ligada | 10,0 / 17,3 | 5,2 | 22,8 / 36,1 | 28,1 / 3,7 | 6 |
| 120 Hz | ligada | 9,7 / **29,1** | 4,5 | 28,2 / 55,8 | 25,8 / 5,2 | 10 |
| **120 Hz** | desligada | **25,5 / 31,3** | 12,9 | **46,7 / 59,0** | **34,1 / 7,0** | **15** |

- **Quem resolve é a tela a 60 Hz, não a economia de bateria.** Com 60 Hz fixos nas Configurações e a economia desligada, foi o melhor resultado: frametime quase constante (desvio de 2,5 ms) e recepção até a tela em ~21 ms. O usuário relatou "lisinho".
- **A 120 Hz, a decodificação fica bimodal** (p50 ~10, p95 ~29 ms com a economia ligada) ou dobrada (~25 ms desligada), e os engasgos sobem de 5 a 7 vezes. A economia de bateria só atenua.
- **Sair do app para as Configurações derruba o stream do play.xbox.com** (tela preta, "Fluxo de vídeo encerrado"). Mudar pela cortina de notificações não derruba.
- Arquivos: `hz60-fixed-*`, `hz120-saver-*`, `hz-state.log` (trocas de taxa e de economia registradas pelo vigia), `caps-hz.log`, `traces/hz-test.pftrace`.
