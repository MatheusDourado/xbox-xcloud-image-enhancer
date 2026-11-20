# v9.7 — captura direta, tratamento que segue a compressão, painel novo e HUD

Userscript `6.7.12-imagefilter.9.7` e app Android **9.7**.

Prioridades desta versão, na ordem pedida: **fluidez**, **nitidez** e **tratamento de imagem**, com um painel redesenhado e indicadores para acompanhar durante o jogo.

## Fluidez

- **Captura direta (experimental).** Com a Fluidez ligada, a opção *Quadros: direto do decodificador* lê cada quadro decodificado da trilha WebRTC (`MediaStreamTrackProcessor`), em vez do elemento `<video>`. O vídeo exibe no máximo um quadro por atualização da tela: quadros que chegam juntos (comum em 5G) são descartados antes do tratamento.
  - **WebRTC real no Chromium**, com quadros chegando em pares a 3 ms um do outro: pelo vídeo chegaram ao tratamento 46–47 de ~80 quadros; pela captura direta, todos.
  - Cada `VideoFrame` é tratado numa textura do compassador e fechado na hora, então o decodificador de hardware nunca espera.
  - Respeita o limite de FPS do Better xCloud e pausa com a aba em segundo plano.
  - **Volta sozinha ao vídeo, com o motivo no painel**, se o navegador não tiver o recurso, se não chegar quadro em 2 s ou se a GPU recusar os primeiros quadros.
- **Compassador:** cada origem tem seu relógio. Trocar entre vídeo e captura direta, ou um salto de tempo acima de 1 s, reinicia o estado. Antes, trocar a origem no meio da sessão deixava todo quadro em +3 ms, ou seja, a Fluidez desligada sem aviso (achado da revisão adversarial).

## Nitidez e tratamento

- **Adaptar à compressão (ligado):** limpeza de blocos, degradês e detalhe seguem o **QP** médio do H.264 (nível de compressão do stream, lido do WebRTC), como o filtro de deblocking de um codec.
  - No QP 28 tudo fica igual à v9.
  - Stream limpo (QP ≤ 20): limpeza ×0,6 e detalhe ×1,2. Stream muito comprimido (QP ≥ 36): limpeza ×1,4 e detalhe ×0,8.
  - Média ponderada pelos quadros e histerese de dois passos, para não oscilar. Recomeça a cada sessão.
- **Perfis:**
  - *Natural*: padrão medido da v9.
  - *Console*: Nitidez 2, menos cintilação.
  - *Nítido*.
  - *Bitrate baixo*: mais limpeza.
  - *Leve*: menos GPU, saída nativa.
- **Nitidez pelo controle:** o Better xCloud ajusta sliders com `parseInt(step)`, e o slider antigo (passo 0,5) não mudava pelo D-pad.

## Painel e HUD

Design próprio. Três direções independentes (minimalista de jogo, nativa do Xbox, laboratório de ajuste) foram comparadas por um juiz, que verificou cada regra contra o código de navegação do Better xCloud. Base escolhida: a nativa do Xbox, com o cartão ao vivo e a linha Servidor → Chegada → Tela da direção de telemetria.

- **Cartão ao vivo:** FPS, ritmo (±ms e p95), travadas (ou "captura direta") e latência estimada, com gráfico do ritmo na tela e linha de vídeo/rede (resolução, codec, decodificador, Mb/s, QP, perda).
- **Seções:**
  - **01 Fluidez:** veredito com ação de um toque, por exemplo *Usar captura direta*; "onde nasce a oscilação" (servidor, chegada, tela); descartes por minuto.
  - **02 Nitidez e imagem:** perfis, Nitidez, método, saída, *Adaptar à compressão* com o QP ao vivo, Comparação.
  - **03 Ajuste fino:** mostra o valor efetivo quando a adaptação altera a força.
  - **04 Desempenho e rede:** GPU, latência por etapa, stream e decodificador.
  - **05 Indicadores e ferramentas:** HUD, canto, diagnóstico, medição, copiar e restaurar.
- **Controle, toque e teclado:** nenhum `<select>`. Cada escolha é um controle segmentado sobre um `range` de passos inteiros: o D-pad muda o valor, A alterna e um toque escolhe.
  - O foco nunca para escondido sob o seletor fixo de jogo do Better xCloud.
  - No celular, os alvos de toque têm 40 px ou mais.
  - Na TV, os textos têm tamanho para ver do sofá.
- **Avisos no topo:** os que têm ação (*Usar Auto*, *Ir para Renderizador*) aparecem sempre; os demais abrem em "Mostrar +N avisos".
- **HUD (indicadores durante o jogo):**
  - *Compacto*: FPS, ritmo, travadas e latência, mais alertas quando algo vai mal.
  - *Completo*: ritmo, quadros, Fluidez, latência por etapa, vídeo, rede e aviso.
  - No celular, o HUD fica na **faixa preta ao lado do vídeo 16:9**, sem cobrir o jogo. Na TV, é um cartão translúcido no canto escolhido, abaixo da barra de estatísticas do Better xCloud.
  - Atualiza 2 vezes por segundo, não recebe foco nem toque, e esmaece depois de 10 s com tudo bom.
- **Cores:** só o que pede atenção ganha cor (amarelo ou vermelho), com formas para daltônicos (●, ◆, ▲). Uma piora aparece depois de 1 s; uma melhora, na hora.

A interface passou por três revisões (visual, entrada e código), com 29 achados. Todos os graves e menores foram corrigidos, e os de detalhe aplicados quando simples.

## Diagnóstico

- Telemetria compartilhada, uma vez por segundo, só quando o painel, o HUD ou a adaptação precisam: codec, FPS recebidos, decodificador, RTT, buffer, decodificação, bitrate, perda de pacotes, QP, quadros perdidos e congelamentos.
- **Avisos automáticos:** renderizador diferente de WebGL2, bitrate limitado, resolução abaixo de 1080p, stream abaixo de 1080p, decodificação por software, perda de pacotes acima de 1% e saída acima da tela.
- **App Android:** *Encerrar e exportar medição* agora salva o JSON em `Downloads/xCloud ImageFilter`, e *Copiar configuração* usa a área de transferência do sistema.
- **Medição:** voltar a uma configuração (por exemplo, um nível de QP já visto) continua o mesmo segmento, e o limite de 256 configurações aparece como motivo da parada.

## Validação

- **43 testes Node:** compassador com troca de relógio, adaptação por QP com histerese e troca de sessão, resumo de rede, perfis e segmentos da medição.
- **114 verificações Chrome/WebGL/DOM do painel e do HUD:**
  - ações dos avisos;
  - seletor do Better xCloud no modo controle;
  - painel oculto sem temporizadores;
  - campos nulos sem "undefined"/"NaN";
  - HUD em todos os layouts.
- **43 regressões de pixels e 11 casos de movimento.**
- **16 verificações de captura direta num WebRTC real no Chromium:**
  - todos os quadros entregues;
  - agendamento real após a troca de origem;
  - limite de FPS;
  - fallback sem o recurso;
  - limpeza ao destruir o player.
- **Revisões adversariais:**
  - no motor, 16 achados, 14 confirmados por um verificador independente e corrigidos;
  - na interface, 29 achados nas lentes visual, entrada e código, corrigidos.
- **APK:** assinado com o certificado da série 9.x; userscript embarcado conferido.

Não testado em aparelho nem em sessão real do xCloud. A captura direta é experimental e fica desligada até você escolher *Direta*.

Arquivos: `better-xcloud-image-filter.user.js` e `xcloud-imagefilter-9.7.apk` (instala por cima da 9.x).
