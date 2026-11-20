# Investigação de qualidade no Hellblade 2

Data: 2026-10-09. Base: script.js, Better xCloud 6.7.12 fornecido pelo usuário.

## Verificado no código

- Há opções separadas auto, 720p, 1080p e 1080p-hq.
- getOsNameFromResolution mapeia 1080p para windows e 1080p-hq para tizen. Isso altera a identidade de dispositivo enviada; não comprova qual qualidade o servidor aceitará.
- stream.video.codecProfile é separado do CAS. getSupportedCodecProfiles inspeciona perfis H.264 disponíveis; high prefere prefixo profile-level-id=4d, correspondente ao perfil Main. O nome da opção não significa H.264 High Profile.
- setCodecPreferences reordena os payloads no SDP, preservando alternativas. É preferência, não garantia de negociação.
- stream.video.maxBitrate no valor máximo representa ilimitado e não aplica patch de bitrate. Valores menores passam para patchSdpBitrate e b=AS, limitando a transmissão. Não há implementação de mínimo de bitrate.
- DT é calculado pelo delta de totalDecodeTime dividido pelo delta de framesDecoded, convertido para milissegundos. Mede decodificação, não qualidade nem latência completa.

## Teste no Dell

1. Registrar as opções atuais antes de alterar.
2. Encerrar a sessão do jogo. Nas configurações globais selecionar resolução 1080p (HQ), qualidade visual Alta se disponível e bitrate máximo Ilimitado.
3. Recarregar a página e iniciar nova sessão. Alterar opções globais durante um jogo não comprova nova negociação.
4. Manter WebGL2 + CAS em 2. Desligar o tratamento experimental para avaliar a transmissão.
5. Comparar o mesmo trecho escuro por aproximadamente 30 segundos parado e 30 segundos girando a câmera. Registrar resolução, bitrate, FPS, perdas de pacotes e de quadros.
6. Comparar com uma nova sessão em 1080p normal, mantendo servidor e demais opções. Não comparar apenas jogos distintos.

Hipótese: HQ e preferência de codec podem melhorar a fonte recebida. Não há garantia de aumento de bitrate nem de detalhe. Se HQ/Alta/Ilimitado já estiverem ativos, essa hipótese exige medir o codec efetivamente negociado e comparar a fonte; repetir a mesma configuração não é uma correção.

## Reconstrução

O filtro atual é espacial, com bilateral 3x3, debanding e CAS. Não reconstrói texturas e não detecta especificamente blocos do codec. Não houve melhora perceptível no teste do usuário.

Candidato encontrado: https://github.com/fishy-ops/webvsr . O README relata SPAN-Lite 2x com entrada 720p e saída 1440p em cerca de 22 ms numa RTX 2070 SUPER. Isso não comprova viabilidade a 60 FPS na GPU do Dell. O projeto relata ganhos menores com compressão mais forte. Não foi integrado nem validado no xCloud. Deve ser tratado como pesquisa, não substituição pronta.

Antes de ampliar o filtro, obter trecho do vídeo recebido ou capturas sem filtro e referência comparável. Avaliar reconstrução offline sobre esse material e medir preservação de detalhes/estabilidade antes de adaptar para execução contínua.

## Fontes

- Código local script.js: getOsNameFromResolution, getSupportedCodecProfiles, setCodecPreferences, patchRtcPeerConnection, patchSdpBitrate, StreamStatsCollector.
- https://better-xcloud.github.io/features/ : bitrate máximo usado para limitar; configurações globais requerem recarregamento.
- https://github.com/fishy-ops/webvsr : implementação WebGPU e desempenho declarado pelo projeto.

A FAQ oficial contém limites numéricos antigos e unidades inconsistentes. Esses números não foram usados para estabelecer limites atuais do serviço.
