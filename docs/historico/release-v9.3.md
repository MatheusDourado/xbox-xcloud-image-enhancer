# v9.3 — teste de codec (AV1 / H.265 / VP9)

Userscript `6.7.12-imagefilter.9.3` e app Android **9.3**. Imagem igual à v9.2.

O xCloud envia **H.264**. O codec é escolhido pelo **servidor**: no início da sessão, o navegador informa o que sabe decodificar e o servidor escolhe. Esta versão permite descobrir se o servidor aceita outro codec, oferecendo **só** o codec escolhido.

- **Codec (teste)** no painel **Tratamento de imagem • v9.3**: *Automático (H.264 do xCloud)*, *Forçar AV1*, *Forçar H.265* ou *Forçar VP9*. Vale a partir do próximo início de jogo. Usa a API padrão `setCodecPreferences` antes de o xCloud criar a oferta WebRTC.
- A linha de diagnóstico mostra o **codec negociado**: `Codec AV1 • Decodificação: … • DT …`. O codec também vai para o JSON de **Iniciar/Encerrar medição**.
- Se o navegador não decodificar o codec escolhido (ex.: H.265 em alguns Chromes), o painel avisa e a sessão usa o padrão.

## Como testar

1. Selecione **Forçar AV1 — teste**, feche o jogo e abra de novo.
2. **Se o jogo abrir**: confira a linha `Codec …` no painel. Se for AV1, o servidor aceita e vale comparar a imagem com o H.264 no mesmo bitrate.
3. **Se a sessão não abrir ou der erro**: o servidor não aceita esse codec. Volte para **Automático** e abra o jogo normalmente.
4. Repita com **H.265** e **VP9**.

Nada fica alterado de forma permanente: em Automático, a negociação é a mesma de antes.

Validação: 26 testes Node, 59 verificações Chrome/WebGL/DOM (oferta WebRTC real com só VP9 e auxiliares no modo forçado e intacta no Automático; H.265 sem suporte é reportado), 41 regressões de pixels e 11 casos de movimento. O resultado com o servidor do xCloud depende do seu teste.

Assets: `better-xcloud-image-filter.user.js` (PC) e `xcloud-imagefilter-9.3.apk` (instala por cima da 9.x).
