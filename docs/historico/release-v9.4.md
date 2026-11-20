# v9.4 — teste do H.264 High e quebra da latência do vídeo

Userscript `6.7.12-imagefilter.9.4` e app Android **9.4**. Imagem igual à v9.3.

O teste da v9.3 confirmou: o xCloud só aceita H.264. Esta versão testa o **perfil High** do H.264 e mostra onde está a latência do vídeo.

- **Codec (teste)** agora tem só *Automático* e *Forçar H.264 High*: AV1, H.265 e VP9 saíram, porque o teste da v9.3 confirmou que o xCloud não os aceita (quem os tinha selecionado volta para Automático).
- **Forçar H.264 High**: oferece ao servidor só H.264 com `profile-level-id` 64 (High). O High acrescenta a transformada 8×8 e matrizes de quantização ao Main (que é o "Alta" do Better xCloud). No mesmo bitrate costuma render ~5–10% de eficiência, principalmente em degradês e texturas suaves. O ganho depende de o **servidor** aceitar e usar esse perfil.
- O painel mostra o **perfil negociado**: `Codec H264 High` / `Main` / `Baseline`. O JSON da medição também registra o perfil.
- **Quebra da latência** no painel, a cada 2 s:
  `Latência: rede (RTT) • buffer • decodificação (DT) • tratamento`
  - *rede (RTT)*: ida e volta até o servidor (a parte que muda entre 5G e Wi-Fi).
  - *buffer*: tempo médio que cada quadro espera no jitter buffer do WebRTC.
  - *decodificação (DT)*: igual ao indicador DT do Better xCloud.
  - *tratamento*: GPU p95 do nosso pipeline.
- **FPS recebidos** do stream. Com jogos a 30 fps, cada quadro dura 33 ms; os ~10 ms de DT ficam dentro desse intervalo.

## Como testar o H.264 High

1. **Codec (teste) → Forçar H.264 High — teste**, feche o jogo e abra de novo.
2. Se abrir e o painel mostrar `Codec H264 High`: o servidor aceita. Compare a imagem com **Automático** na mesma cena.
3. Se abrir mas mostrar `Main` ou `Baseline`: o servidor ignorou o pedido.
4. Se não abrir: o servidor não aceita. Volte para **Automático**.
5. Se o painel disser "H.264 High não anunciado por este navegador": o WebView/Chrome do aparelho não oferece High no WebRTC, e a sessão segue normal.

Se o High não funcionar, a opção sai na v9.5.

A "Qualidade visual" do Better xCloud ("Alta" = perfil Main) só reordena perfis e não desfaz o teste; pode continuar em Alta.

Validação: 27 testes Node, 59 verificações Chrome/WebGL/DOM (linha de latência com WebRTC simulado: perfil, FPS, RTT, buffer, DT), 41 regressões de pixels e 11 casos de movimento. O resultado com o servidor depende do seu teste.

Assets: `better-xcloud-image-filter.user.js` (PC) e `xcloud-imagefilter-9.4.apk` (instala por cima da 9.x).
