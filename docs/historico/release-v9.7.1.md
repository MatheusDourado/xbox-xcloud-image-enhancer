# v9.7.1 — compressão sem QP, GPU estimada e medição com ritmo

Userscript `6.7.12-imagefilter.9.7.1` e app Android **9.7.1**.

## Origem

Primeira medição num aparelho real: Poco F7 (Android 16, WebView Chrome 155) com o xCloud real, jogando *Gears of War: E-Day*, captura direta e Fluidez Equilibrada.

- **O que funcionou:**
  - captura direta: 4.659 de 4.662 quadros decodificados chegaram à tela;
  - rede: 20 ms de ida e volta e 0,008% de perda;
  - exportação para Downloads/xCloud ImageFilter.
- **O jogo veio a 30 FPS do servidor** durante a partida. Nos menus, veio a ~60.
- **O que a medição revelou:**
  1. O WebView do Android não informa o QP (`qpSum`). O *Adaptar à compressão* ficou parado, e o painel, em "Aguardando o QP do stream…".
  2. Sem cronômetro de GPU (`EXT_disjoint_timer_query_webgl2`), não havia tempo de GPU no painel nem na medição.
  3. A medição só trazia o FPS médio. Não dava para saber se os 30 FPS saíram estáveis na tela.

## Compressão estimada pela taxa de bits

- Sem QP, *Adaptar à compressão* usa os **bits por pixel** de cada quadro: bytes recebidos × 8 / (quadros × largura × altura).
- 0,12 bit/pixel (15 Mb/s em 1080p60, o meio dos streams de calibração da v9) equivale ao QP 28 neutro. Cada dobro equivale a 4 QP a menos. O H.264 precisa de cerca de 6 por dobro; a inclinação menor mantém perto do neutro uma estimativa que não enxerga o conteúdo da cena.
- Usa o **percentil 80 do último minuto**. Uma cena parada gasta poucos bits com QP baixo e não é lida como compressão forte.
  - Segundos com menos de 10 quadros (travadas) ficam de fora.
  - A primeira estimativa sai após 5 s, com a mesma histerese do QP.
- O painel mostra "Estimado pela taxa de bits (sem QP neste aparelho): 0,18 bit/pixel ≈ QP 26 · nível 0,3". Antes da primeira estimativa, mostra "Este aparelho não informa o QP: estimando pela taxa de bits…". Em *04 Desempenho e rede*, o QP aparece como "≈26 (pela taxa de bits)", nunca como leitura real.
- Com os números dessa sessão (9 Mb/s em 1080p30, ~0,15–0,18 bit/pixel), o stream é lido como pouco comprimido: um pouco menos de limpeza e um pouco mais de detalhe.

## Tempo de GPU estimado

- Sem cronômetro de GPU, um *fence* a cada 0,5 s mede **do início dos comandos de um quadro até a GPU concluí-lo**.
- É um limite superior, porque inclui o trabalho que já estava na fila. Serve só para exibição: a redução automática continua pela cadência.
- No painel: "≈X ms de 33 ms por quadro". A classificação é boa até um intervalo de quadro e ruim acima de dois: a GPU processa quadros sobrepostos, então um quadro pode levar mais que o intervalo sem perder FPS.
- O valor também entra na latência estimada por etapa.

## Medição com ritmo (`schema: 2`)

Formato completo em [api-imagefilter.md](../api-imagefilter.md#medição--relatório-de-apiexportmeasurement-schema-2).

- **Por configuração**, intervalos entre quadros:
  - **exibidos** (`display`);
  - **chegando ao tratamento** (`arrival`);
  - **capturados no servidor** (`server`);
  - mais a **espera da Fluidez** (`wait`) e os descartes.

  Cada série tem média, p50/p95/p99, máximo, desvio, tremidas e as amostras.
- **Linha do tempo por segundo:**
  - FPS recebido e exibido;
  - Mb/s, perda e RTT;
  - decodificação e buffer;
  - QP ou bits por pixel e nível da adaptação;
  - GPU, espera e captura.
- **Metadados:**
  - método de GPU (`timer`/`fence`);
  - tela e taxa de atualização medida;
  - preferências do Better xCloud;
  - versão do app;
  - estado da captura e da Suavidade.

  O estado final inclui o ritmo, a origem e os avisos.
- **Resumos sem limite de duração.** Contagem, média, desvio e máximo são exatos, e os percentis vêm de faixas de 0,1 ms. Só as amostras brutas param em 300 mil, e a GPU tem limite próprio. Uma sessão longa a 60 FPS continua com estatísticas completas em todos os segmentos.
- **Troca de app no meio da medição:** o tempo com a página oculta não entra como intervalo de quadro.
- **Quadros pulados pelo `<video>`** contados por segmento (`videoSkipped`), para separar irregularidade do servidor de quadros perdidos no aparelho.
- **Arquivo:** JSON indentado, com cada lista de amostras numa linha só.
- Na captura direta, o painel passa a ler o ritmo do servidor pelos timestamps do próprio `VideoFrame`. Antes vinha do elemento de vídeo, que não vê os quadros que chegam juntos. Ao trocar entre vídeo e captura direta, as janelas recomeçam, sem misturar relógios.
  - A chegada usa o horário de recepção da rede quando o navegador o fornece (`VideoFrame.metadata().receiveTime`).
  - Sem esse horário, mede a entrega do quadro ao script, que inclui decodificação e atrasos da thread principal. O painel mostra esse valor, mas não o trata como rede: um atraso do aparelho não vira a sugestão "mais buffer".
- A telemetria também roda durante a medição, mesmo com painel, HUD e adaptação desligados.

## Validação

- **47 testes Node.** Novos testes cobrem:
  - bits por pixel → QP e o fallback no adaptador (percentil 80, cenas paradas, travadas e compressão alta sustentada);
  - segmentos com intervalos, descartes e linha do tempo;
  - resumos além do corte de 300 mil amostras;
  - arquivo exportado pela ponte Android.
- **117 verificações Chrome/WebGL/DOM do painel e do HUD.** Novas:
  - estimativa pela taxa de bits marcada como estimativa;
  - mensagem "não informa o QP";
  - tempo de GPU estimado contra o intervalo de quadro.
- **26 verificações num WebRTC real no Chromium.** A medição atravessa a troca vídeo → captura direta e confere:
  - quatro séries por segmento;
  - nenhum intervalo entre relógios diferentes;
  - nenhum intervalo atravessando a página oculta (sem a correção, aparecia um de 1.547 ms);
  - quadros pulados por segmento;
  - linha do tempo do `getStats` real;
  - método `fence` e 59,9 Hz medidos;
  - arquivo pela ponte Android.
- **Regressões:** 43 de pixels e 11 de movimento, inalteradas.
- **Revisão adversarial:** três revisores independentes (medição, fence de GPU e fallback/interface), e cada achado conferido por um verificador.
  - **Confirmados e corrigidos (6):**
    - chegada na captura direta tratada como rede;
    - intervalos atravessando a página oculta;
    - leitura atrasada do fence contada como tempo de GPU;
    - resumo da seção 04 sem a estimativa;
    - legenda da latência com p95 enquanto a soma usava p50;
    - bits por pixel arredondados em *Copiar configuração*.
  - **Não confirmados, mas adotados por custo baixo:**
    - resumos que não param no corte;
    - quadros pulados por segmento;
    - tremidas desligadas na espera;
    - mais casas decimais nos bits por pixel da linha do tempo.
- **APK:** assinado com o certificado da série 9.x; userscript embarcado conferido.

As correções vêm da sessão real no Poco F7, mas a v9.7.1 ainda não rodou no aparelho. A calibração dos bits por pixel (0,12 = QP 28) é uma estimativa e deve ser revista com a próxima medição.

Arquivos: `better-xcloud-image-filter.user.js` e `xcloud-imagefilter-9.7.1.apk` (instala por cima da 9.x).
