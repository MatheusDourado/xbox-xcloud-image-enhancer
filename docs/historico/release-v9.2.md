# v9.2 — app Android como jogo e diagnóstico do decodificador

Userscript `6.7.12-imagefilter.9.2` e app Android **9.2**. Imagem igual à v9.1.

Motivo: no Poco F7, o indicador **DT** do Better xCloud mostrava ~10 ms, contra ~0,5 ms no notebook. O DT é o tempo de decodificação por quadro informado pelo WebRTC (`totalDecodeTime ÷ framesDecoded`) e não inclui o tratamento de imagem. No Android, o WebView decodifica no hardware pelo **MediaCodec**, e a medição inclui a fila interna dele; 5–15 ms são comuns mesmo com decodificação por hardware. No Windows, o decodificador D3D11 da Iris Xe dá valores bem menores.

- **App marcado como jogo** (`appCategory="game"` e configuração do Game Mode do Android 13+): o HyperOS e o painel de jogos do Android passam a reconhecê-lo. Adicione **xCloud ImageFilter** ao **Game Turbo** (Segurança → Game Turbo, ou o painel de jogos) e escolha o modo desempenho, se houver. Isso tende a manter CPU e GPU mais altas e o MediaCodec mais rápido e estável. O "downscaling" automático e a troca de FPS pelo sistema ficam **desligados**, porque reduziriam a resolução do canvas ou a cadência do stream.
- **Diagnóstico do decodificador** no painel **Tratamento de imagem • v9.2**: linha `Decodificação: hardware/software (implementação) • DT x ms`, atualizada a cada 2 s, e os mesmos campos (`decoderImplementation`, `powerEfficientDecoder`) no JSON de **Iniciar/Encerrar medição**. O Chrome pode esconder esses campos por privacidade; nesse caso aparece "não informado pelo navegador", mas o DT continua.

Para testar o DT: compare antes e depois de colocar o app no Game Turbo. Teste também **Better xCloud → Qualidade visual** (perfil do H.264); em alguns aparelhos, o perfil mais simples reduz um pouco o tempo do MediaCodec.

Validação: 25 testes Node, 56 verificações Chrome/WebGL/DOM (inclui a linha do decodificador com WebRTC simulado), 41 regressões de pixels e 11 casos de movimento. Manifesto do APK conferido (`appCategory`, `isGame`, `game_mode_config`). Não testado ainda no aparelho.

Assets: `better-xcloud-image-filter.user.js` (PC) e `xcloud-imagefilter-9.2.apk` (instala por cima da 9.x).
