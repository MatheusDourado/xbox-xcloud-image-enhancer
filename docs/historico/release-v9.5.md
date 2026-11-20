# v9.5 — suavidade do vídeo, ritmo de quadros e taxa da tela

Userscript `6.7.12-imagefilter.9.5` e app Android **9.5**. Imagem igual à v9.4.

Motivo: no Poco F7 com 5G, a 30 fps, a câmera tinha travadinhas mesmo com o contador em 30 FPS. A média de FPS esconde a irregularidade: o que importa é cada quadro chegar a ~33,3 ms do anterior. Em rede móvel, os quadros chegam em rajadas, e o buffer mínimo que o xCloud usa (pela baixa latência) repassa essa variação para a tela.

- **Suavidade (buffer de vídeo)**: *Automático* (padrão do xCloud), *+17 ms*, *+33 ms* ou *+50 ms*. Define o buffer mínimo do vídeo no WebRTC (`jitterBufferTarget`), para os quadros saírem em ritmo constante. É um **piso**: se a rede já exige 20 ms e você escolhe 33, entram ~13 ms. No pior caso, o valor inteiro. Vale na hora, sem reiniciar o jogo. Compare o "buffer" da linha de latência antes e depois.
- **Ritmo** no painel: `Ritmo: 33,4 ms ± 6,1 • p95 48,0 ms • 3 travadas em 2 s` (intervalo médio entre quadros, variação, percentil 95 e quadros atrasados acima de 1,5× o normal). Serve para escolher a menor Suavidade que zera as travadas.
- **Taxa da tela (app)**, só no Android: *Sistema decide* ou *Fixar em 60/90/120 Hz* (as taxas reais do aparelho). Fixar evita o sistema alternar a taxa, o que quebra o ritmo. Com stream a 30 fps, 120 Hz não deixa o vídeo mais fluido (cada quadro fica 4 atualizações em vez de 2), mas reduz em média ~4 ms o tempo até o quadro aparecer e deixa menus e toque mais fluidos. O app não restringe a taxa; o padrão continua *Sistema decide*.
- **Copiar configuração**: gera um texto com as opções do tratamento, as do Better xCloud (resolução alvo, qualidade visual, bitrate, renderizador, limite de FPS, região), a tela, a versão do app e as linhas de latência e ritmo. Copia para a área de transferência ou mostra o texto para copiar à mão. Não inclui dados da conta.
- **Teste de codec removido**: o xCloud recusou AV1, H.265, VP9 e H.264 High. A negociação volta a ser a do Better xCloud.

## Sugestão de teste (5G)

1. Em Automático, mexa a câmera e anote **Ritmo** e **buffer**.
2. Suba para **+17 ms**. Se ainda houver travadas, **+33 ms**. Pare no primeiro valor que deixar a câmera lisa.
3. Em **Taxa da tela (app)**, teste **Fixar em 120 Hz**.
4. Toque em **Copiar configuração** e cole o texto na conversa para revisão.

Controle com fio USB-C (ex.: GameSir G8 Galileo) já é a opção de menor latência no celular.

Validação: 28 testes Node, 63 verificações Chrome/WebGL/DOM (buffer aplicado e restaurado no receptor de vídeo durante o jogo, linha de ritmo, exportação da configuração, seletor de taxa só com a ponte do app), 41 regressões de pixels e 11 casos de movimento. Não testado ainda no aparelho.

Assets: `better-xcloud-image-filter.user.js` (PC) e `xcloud-imagefilter-9.5.apk` (instala por cima da 9.x).
