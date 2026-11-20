# v10.1.2 (pré-lançamento) — correções da auditoria da v10.1.1 (última versão)

> **Esta versão é o resultado de uma auditoria da última release publicada, a [v10.1.1-beta.1](https://github.com/MatheusDourado/xbox-xcloud-image-enhancer/releases/tag/v10.1.1-beta.1).** Após os testes da v10.1.1 feitos por outros usuários, o código dela (commit `cb0b931`, idêntico ao `main` em `29eb276` nos fontes, shaders e userscripts) passou por uma auditoria estática independente. Cada mudança abaixo cita o achado correspondente (C01–C15). Este é um **pré-lançamento**: foi validado só com os testes automatizados, ainda sem gameplay nem GPU real.

Userscripts `6.7.12-imagefilter.10.1.2` (www.xbox.com, sobre o Better xCloud 6.7.12) e `10.1.2-play` (play.xbox.com), app Android **10.1.2** (`versionCode` 100102). Inclui tudo da [v10.1.1](release-v10.1.1.md).

## Origem

Testes da v10.1.1 por outros usuários relataram, no Fortnite (notebook com RTX 3050), que a imagem degrada muito quando a câmera se move e que o antialiasing parece sumir em movimento. Uma auditoria estática independente do código (10/11/2026) concluiu que os relatos são plausíveis, mas que **não dá para fechar a causa sem frames e configurações da sessão**. Ela apontou defeitos concretos de medição e controle (P1) e limitações de algoritmo (P2/P3). Esta versão corrige os defeitos e torna os cortes visíveis. **Os padrões de imagem não mudaram** (AA, temporal e neural continuam em 0; nitidez, degradês e cor iguais), como a auditoria recomenda antes de um A/B controlado.

## O que mudou

### Cortes automáticos visíveis e reversíveis (C02, P1)
- O orçamento de GPU guarda **todas** as reduções, em ordem (`status.cuts`), não só a última. O painel lista todas em "Desempenho e rede", e um corte posterior não esconde mais o "Antialiasing desligado".
- Novo `status.effective`, tirado do mesmo plano que desenha o quadro: forças efetivas depois da adaptação à compressão e do orçamento, o caminho do AA, os valores pedidos e o que foi cortado.
- Os sliders **Antialiasing** e **Estabilidade em movimento** mostram **Cortado** quando o orçamento os desligou. Há avisos (`aa-cut`, `temporal-cut`) com o botão **Religar** (`api.restoreBudget()`), que liga tudo de novo sem mudar os ajustes. Continua não havendo recuperação automática.
- O corte do temporal avisa que o antialiasing passa para o passe espacial (C03).

### Antialiasing fundido limitado (C03, P2)
- No passe espacial (temporal desligado), o delta do AA era somado a um resultado já alterado por limpeza, degradês, cor e detalhe, sem validar o resultado final. Agora o delta é limitado à envoltória de luma da vizinhança da fonte: o AA não cria overshoot novo sobre o que os outros filtros fizeram. GLSL e WGSL iguais. Só age com AA > 0.

### Temporal: estimação de movimento consistente (C06 e C07, P2)
- **C06:** a busca fina comparava o quadro bruto com o histórico **já processado** (spatial, neural, mistura temporal), então o erro podia refletir a restauração, não o movimento. Agora ela compara o quadro bruto com o **quadro bruto anterior**, o mesmo sinal da busca grossa. O histórico processado só é misturado. Custa uma cópia em tamanho de fonte por quadro, só com Estabilidade > 0.
- **C07:** a imagem a 1/4 da busca grossa era uma amostra bilinear por pixel (lia 2×2 de 16 pixels), e detalhes finos e periódicos (cercas, grama) viravam falso padrão. Novo passe `downsample`: média da área 4×4 com quatro amostras bilineares.

### Medição por quadro apresentado (C09, P1)
- Cada quadro renderizado durante uma medição recebe um ID que acompanha o slot da Fluidez. `present()` ou o descarte do slot fecham esse ID.
- Por segmento: `presentation` = `{finalScheduled, finalExecuted, presented, discarded, repeated}`. Antes, um passe final agendado (`@present`) contava como executado mesmo quando a Fluidez descartava o quadro.
- Os intervalos `display` e `wait` vão para o segmento do quadro **apresentado**, não para o do último renderizado (com A/B e fila, eram de outra configuração).
- Novo `frames` no relatório: uma linha por quadro (até 20 mil) com segmento, horário de render e de apresentação e estado. Relatório **schema 4**.

### Latência rotulada pelo que mede (C10, P1)
- "Latência" no painel e no HUD virou **"Atraso estimado do vídeo"** / **"Atraso est."**, com a nota de que é soma de médias e percentis de trechos diferentes e **não** o atraso do controle à tela.
- Nova série medida `treated`: do recebimento do quadro até a submissão da imagem tratada ao canvas, por quadro. A documentação de `pipeline` (vídeo sem tratamento até a composição) e `late` (fim da CPU, antes do passe final diferido) foi corrigida.

### Limite de decodificação por leitura (C11, P1, play.xbox.com)
- O limite de 8 ms valia só na média desde o início: com a média baixa, uma piora recente passava (contraexemplo da auditoria: 12 ms por quadro entre duas leituras). Agora cada objeto consultado (conexão ou receiver) mantém, por stream, um `totalDecodeTime` virtual monotônico que cresce no máximo 8 ms por quadro decodificado desde a leitura anterior. Contadores reiniciados recomeçam do valor nativo.
- "Impedir queda de resolução" é fixado por conexão na primeira leitura: ligar ou desligar no meio do jogo não cria salto no acumulado e passa a valer no próximo jogo, como o texto já dizia. A telemetria do script continua lendo o valor real.

### Adaptação à compressão sem estado herdado (C08, P2)
- Troca de stream de entrada (`id`/SSRC), codec ou tamanho do quadro reinicia os deltas, a média de QP e a janela de bits por pixel.
- O QP (escala 0–51 do H.264) só é usado com H.264. Outros codecs usam a estimativa pela taxa de bits.
- Amostras de bits por pixel expiram depois de 60 s.

### Captura direta com watchdog (C13, P2)
- Depois dos primeiros quadros, se o reader parar de entregar enquanto o `<video>` segue apresentando (mais de 5 quadros novos em 1 s, página visível, sem pausa; 3 s sem o contador do vídeo), o caminho de vídeo assume. Ele tenta de novo depois de uma mudança de Captura ou Fluidez. Trocar a origem reinicia o histórico temporal, porque os relógios são diferentes.

### Pequenos ajustes de kernel
- **Degradês (C12, P3):** os pares de amostras opostas usavam `floor`, e `floor(-a) ≠ -floor(a)` deslocava a média meio pixel para −x/−y (ex.: força 0,6 → offsets `(5,2), (−6,−3), (2,−6), (−3,5)`). Agora usam `trunc`, e os pares ficam exatamente opostos (`(5,2), (−5,−2), (2,−5), (−2,5)`). A diferença de pixels é pequena e só aparece em regiões lisas; GLSL e WGSL continuam equivalentes.
- **SGSR:** guarda no denominador da soma de pesos (`s.y/s.x`), um ponto de robustez numérica.

## O que não mudou (e por quê)

Segundo a auditoria, estes pontos são evolução de algoritmo que precisa de corpus fixo e A/B nos mesmos quadros antes de mudar o padrão:
- **C01:** cobertura do AA espacial (diagonais rasas e contraste baixo) e comparação com FXAA/SMAA.
- **C04:** nitidez modulada por confiança de borda e artefato.
- **C05:** confiança e mistura do temporal (revisar só depois da C06/C07, agora corrigidas).
- **C14:** ampliação das bancadas para movimento.
- **C15:** manifesto e estabilidade da rede neural.
- **D.3:** temporal híbrido, máscara regional, perfis por dispositivo.

A recuperação automática do orçamento (com histerese) também ficou para depois: agora há o controle explícito **Religar**.

## Para os testadores (relato do Fortnite)

Para separar entrada, filtro e cortes, exporte uma medição (Indicadores e ferramentas → Iniciar medição) com:
- o **Tratada** como estava;
- o **Original** na mesma cena;
- só a nitidez (**Comparação → Só nitidez**).

O relatório agora diz, por segmento, o que rodou de fato (`config.effective`, `presentation`) e em que momento cada corte aconteceu (`events` do tipo `degrade`). Se o slider de Antialiasing mostrar **Cortado**, o AA não estava rodando.

## Verificação

- `node --test tests/*.cjs`: 92 testes, incluindo novos para o registro de cortes, o estado efetivo e o caminho do AA, os IDs por quadro e o contraexemplo do limite de decodificação (4 → 12 → 21 → 4 ms).
- `tools/run-browser-tests.py` (Chromium headless, SwiftShader): todas as suítes passam, incluindo a de regressões WebGL, a de qualidade em movimento (temporal), a de captura direta, a de play.xbox.com e a de equivalência WebGPU ↔ WebGL2.
- **Sem teste em gameplay ou em GPU real nesta rodada.**
