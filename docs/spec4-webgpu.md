# Spec 4 — Renderizador WebGPU opcional

Registro da Spec 4 na branch `claude/specs-autonomas`, em 2026-11-07. Primeira parte (passada `spatial`) das 06:27 às 06:50 (horário local). Segunda parte (renderizador completo, integração e medições do caminho inteiro) até 10:38 UTC, com fechamento do registro na nuvem. Dados brutos em `docs/medicoes/spec4/` e bancada em `tools/device/spec4/`. Sem versão nova e sem APK publicado.

## Resumo

**Estado:** Spec 4 encerrada. O renderizador WebGPU existe, está no userscript como opção manual e passa nos testes de equivalência e de integração no Poco. **Não é o padrão:** em sessão a 30 FPS no Poco, ele gasta mais GPU que o WebGL2.

**Feito.**

- Port WGSL de todas as passadas do caminho espacial (`src/webgpu/`): `spatial` (Compressão, Degradês, Cor nas bordas, Detalhe e AA fundido), EASU, CAS/`casFiltered`, RCAS, SGSR e cópia.
- Renderizador `src/webgpu-engine.js`, com a mesma interface do `Engine` (`render`, `present`, `outputSize`, `budget`, `diagnostics`). As decisões de cada quadro vêm de `BxRestoration.framePlan`, compartilhado pelos dois renderizadores.
- Importação do quadro com `importExternalTexture`. Uma variante por compute shader funde a conversão YUV→RGB na `spatial`, lendo blocos 32×32 para a memória de workgroup; ela fica desligada.
- Opção **Renderizador** no painel (Auto, WebGL2, WebGPU, marcada EXP). O WebGPU desenha num canvas próprio, sob o do Better xCloud, que fica transparente.
- Fallback para o WebGL2 sem recarregar: em falha de criação, erro de validação, device perdido ou quadro que só o WebGL2 desenha (temporal, reconstrução neural).
- `timestamp-query` alimenta o orçamento de GPU.
- **Auto continua WebGL2 em todos os aparelhos** (`AUTO_WEBGPU` vazio).

**Números principais.** Poco F7, saída 2276×1280, clipe H.264 1080p a 30 FPS, padrões da Spec 3:

| Medida | WebGL2 | WebGPU | WebGPU compute |
| --- | --- | --- | --- |
| Sessão, GPU por quadro (Perfetto `gpu_work_period`), Fluidez | 10,2 ms* | 11,9–12,1 ms | 16,0–16,2 ms |
| Sessão, sem Fluidez | 10,2–10,3 ms | 12,0–12,2 ms | — |
| Sessão, captura direta (`VideoFrame`) | 10,2–10,4 ms | 12,0–12,2 ms | — |
| Sessão, SGSR | 4,5–5,2 ms | 7,8–8,1 ms | — |
| Rajada, parede por quadro | 10,4 ms | 3,3 ms | 4,2 ms |

\* 11,8 ms na rodada logo depois do aquecimento; 10,2 ms na repetição.

Em rajada, o WebGPU parece 3 vezes mais barato. **Em sessão, ele gasta 17% a mais** (SGSR, 60% a mais), sem perder quadros em nenhum dos dois. A Spec 2 já tinha mostrado que o upload do WebGL2 em rajada vira uma barreira e exagera o custo. A rajada não serve para decidir o renderizador.

**Imagem.** Com os mesmos bytes de entrada, o WebGPU fica a no máximo 0,025 nível de média do WebGL2 em 16 configurações, no Poco (26 checagens). Com o quadro decodificado, a diferença sobe para cerca de 0,38 nível, e ela vem da conversão de cor do **WebGL2 no Adreno**. A conversão do WebGPU no Poco bate com a referência do Vostro (média 0,05, máximo 2 níveis); a do WebGL2 não (média 0,43–0,49, máximo 74–93, 3–4 níveis em bordas de croma).

**Critérios de aceite.**

| Critério | Situação |
| --- | --- |
| Imagem equivalente nas regressões de pixel | **atendido**: `webgpu-equivalence` com 26 checagens no Poco e na CI (SwiftShader) |
| Custo igual ou menor no Poco F7 | **não atendido**: +17% de GPU em sessão no caminho padrão, +60% com SGSR |
| Fallback sem travar nem recarregar | **atendido nos testes**: `renderer-harness` com 24 checagens no Poco; não testado numa partida |
| Tempo de GPU com `timestamp-query` | **atendido**: alimenta o orçamento; no Poco, o WebView passa a ter tempo de GPU em vez da cadência |

Com o segundo critério em aberto, o **Auto fica em WebGL2**. O WebGPU fica disponível para quem escolher manualmente.

**Lacunas.** Falta testar numa partida real no xCloud. Faltam a sessão no Vostro (os casos estão em `tools/device/spec4/cases-sessao-vostro.json`, mas não há resultado) e o `shader-f16`. Não está explicado por que o WebGPU gasta mais em sessão (abaixo, Leitura).

**Próximo passo.** Testar a opção WebGPU numa partida no Poco: fallback, HUD e travadas na criação. Depois, `shader-f16` no WGSL e uma nova sessão, para ver se a diferença de 1,8 ms/quadro vem da precisão (`f32` contra `mediump`).

## Tarefas da seção 5

| # | Tarefa | Situação |
| --- | --- | --- |
| 1 | Detectar WebGPU no WebView do Poco e no Chrome do Vostro | **feito** (Spec 1, conferido aqui) |
| 2 | Camada comum de renderizador | **feito**: `BxRestoration.framePlan` decide o quadro, os dois motores só desenham |
| 3 | Importar o quadro sem cópia | **feito**: `importExternalTexture`, seguido de cópia para RGBA8 (ou do bloco em compute) |
| 4 | Portar shaders para WGSL | **feito** para o caminho espacial; temporal e neural ficam no WebGL2 |
| 5 | Fundir etapas com compute shader | **feito e desligado**: mais caro que cópia + fragmento no Poco (sessão e rajada) e no Vostro em 1280p |
| 6 | Opção no painel (Automático, WebGL2, WebGPU) | **feito**, Auto em WebGL2 |
| 7 | Custo nos dois renderizadores | **feito** no Poco (sessão e rajada) e no Vostro (rajada) |

### Tarefa 1: detecção

Conferi a sonda da Spec 1 (`docs/spec1-estudo.md`, seção WebGPU) contra a bancada desta spec. Hoje:

| Item | Poco F7 (WebView 156, app) | Vostro 3400 (Chrome 157) |
| --- | --- | --- |
| Adaptador | `qualcomm` / `adreno-8xx`, não é fallback | `intel` / `gen-12lp`, não é fallback |
| WebGL2 | `Adreno (TM) 825`, sem cronômetro, `mediump` real | ANGLE D3D11 Iris Xe, com cronômetro, `highp` |
| `timestamp-query` | sim, device criado com o recurso | sim |
| `shader-f16`, `subgroups` | sim (Spec 1); não usados aqui | sim (Spec 1); não usados aqui |
| `importExternalTexture` | funciona com `<video>` | funciona |
| Compilação do módulo WGSL | 8–12 ms | 0–1 ms |
| Criação do pipeline | **793–946 ms** com `texture_external`, 68–99 ms com textura comum | 1–64 ms |

O tempo de pipeline com `texture_external` no Poco quase chega a 1 s. Em jogo, isso precisa de `createRenderPipelineAsync` antes da partida, como o aquecimento das variantes GLSL, senão vira uma travada.

## Decisões

**Primeira parte: sem integração.** (Superada pela segunda parte.) A sessão começou às 06:27, e o Matheus testa de manhã. O motor WebGL2 tinha acabado de mudar na Spec 3 sem validação em partida. Integrar um segundo renderizador exige outro canvas, porque o Better xCloud já criou o contexto `webgl2` no dele, e mexe no pacer, na captura direta e no HUD. Nada disso daria para validar sem uma partida. A opção mais segura foi medir a hipótese central (custo e equivalência da passada mais pesada) e não tocar no que vai para o teste.

**Opção no painel só com o renderizador completo.** Na primeira parte, a opção não faria nada, então ficou de fora. Com o renderizador completo, ela entrou como pede o brief. O Auto consulta `BxRestoration.AUTO_WEBGPU`, uma lista de adaptadores (`vendor`, `architecture`) que cumprem os dois critérios de aceite, hoje vazia. Para promover uma GPU basta incluí-la ali.

**Canvas próprio sob o do Better xCloud.** O Better xCloud já criou o contexto `webgl2` no canvas dele, e um canvas não aceita dois contextos. O WebGPU desenha num canvas inserido logo antes, com o mesmo tamanho e estilo, e o canvas WebGL2 fica transparente, mas continua recebendo a entrada. No fallback, o canvas WebGPU sai e o WebGL2 volta a ser visível já no quadro seguinte.

**Compute desligado.** A `spatial` por compute evita a textura de entrada, mas em sessão no Poco ela gastou 16,1 ms/quadro, contra 12,0 ms da cópia + fragmento. Em rajada, gastou 4,2 contra 3,3 ms. No Vostro, só ganhou em 1080p nativo (2,81 contra 3,50 ms) e perdeu em 1280p (5,25 contra 4,87 ms). Fica no código (`computeSpatial`) para medir de novo com `shader-f16`.

**Convenção de coordenadas do GL no WGSL.** O WebGL2 sobe o quadro com `UNPACK_FLIP_Y`, então a linha 0 é a de baixo. No WebGPU a linha 0 é a de cima. O WGSL converte cada coordenada para o referencial do GL (`p`, `fc`) e só inverte a linha na leitura. Assim os deslocamentos assimétricos dos Degradês e o padrão de dither ficam iguais, e a diferença no Vostro cai para 0,00005 nível. Os portes seguintes devem seguir a mesma regra.

**Variantes por constante de pipeline.** As chaves `SPATIAL_*` viraram `override` do WGSL, preenchidas por `BxRestoration.spatialProfile`. A decisão sobre o que compilar fica num lugar só para os dois renderizadores, e a lógica dos filtros não é reescrita fora do shader. O shader em si existe nas duas linguagens; a equivalência é garantida pela comparação de pixels, não por geração automática.

**`f32` em todo o WGSL.** O WebGL2 usa `mediump` no Poco, e o WGSL usa `f32`. Isso explica pelo menos parte da passada isolada mais cara no Poco (0,99 contra 0,65 ms). `shader-f16` existe nos dois aparelhos, mas exige reescrever os tipos e não coube na noite.

## Medições da segunda parte: caminho inteiro

Bancada `tools/device/spec4/session.html` e `session.js`: o mesmo `restoration.bundle.js` do userscript, com o `Engine` (WebGL2) e o `BxWebGPU` (WebGPU) lado a lado. Só o canvas do renderizador medido fica visível. Clipe `game30` (H.264 1080p a 30 FPS) tocando em `<video>`, quadros por `requestVideoFrameCallback` como no userscript, ou por `MediaStreamTrackProcessor` na captura direta. Configurações padrão da Spec 3, saída 2276×1280 no Poco.

### Sessão a 30 FPS no Poco

`docs/medicoes/spec4/poco-sessao.json`, 20 s por caso, ordem A-B espelhada para separar efeito de aquecimento. A GPU por quadro é o `gpu_work_period` do Perfetto dividido pelos quadros. Ela inclui a composição do WebView, como na Spec 3.

| Caso | Rodada A | Rodada B | Quadros perdidos (A/B) |
| --- | --- | --- | --- |
| WebGL2, Fluidez | 11,76 | 10,22 | 5 / 0 |
| WebGPU, Fluidez | 11,94 | 12,07 | 2 / 4 |
| WebGPU compute, Fluidez | 16,04 | 16,21 | 0 / 3 |
| WebGL2, sem Fluidez | 10,29 | 10,21 | 0 / 3 |
| WebGPU, sem Fluidez | 12,20 | 11,96 | 0 / 0 |
| WebGL2, captura direta | 10,38 | 10,21 | 0 / 0 |
| WebGPU, captura direta | 12,24 | 11,99 | 0 / 0 |
| WebGL2, SGSR | 5,17 | 4,52 | 3 / 2 |
| WebGPU, SGSR | 7,79 | 8,11 | 2 / 3 |

Todos os casos mantiveram 29,9–30,05 FPS, com CPU de 1,2–2,1 ms por quadro (mediana) e lacuna p95 de 33,5–41,7 ms (a de 41 ms aparece com Fluidez, nos dois renderizadores). Nenhum erro do WebGPU. GPU de 46,6 a 51 °C, estado térmico 0, bateria em 35–36% carregando.

**`timestamp-query` na sessão** (`poco-sessao-timestamps.json`, 8 s por caso), GPU medida pelo próprio WebGPU, mediana por quadro: Fluidez 10,2 ms, sem Fluidez 10,5 ms, SGSR 5,3 ms, compute 13,7 ms, padrões v9 13,5 ms. O Perfetto dá cerca de 1,8 ms a mais, que é a composição do canvas.

**Leitura.**

- O WebGPU gasta de 1,7 a 1,9 ms a mais por quadro no caminho padrão, nas duas rodadas. Isso é estável e maior que a variação entre rodadas (exceto a primeira do WebGL2, logo depois do aquecimento).
- Em rajada, a ordem se inverte. A importação do WebGPU não evita trabalho real de GPU, só a barreira do upload, que em sessão já não pesa (Spec 2).
- A diferença no SGSR (+2,6 a 3,6 ms) é maior que a da `spatial` isolada. O SGSR no WebGPU recebe o quadro já copiado para RGBA8; no WebGL2 ele lê a textura do upload direto. Isso explica parte da diferença, mas não ela toda (inferência).
- Possíveis causas restantes, não isoladas: `f32` contra `mediump`, um canvas a mais na composição e o clock baixo da GPU a 30 FPS (Spec 2), que amplia qualquer diferença fixa.

### Rajada do caminho inteiro

`poco-rajada-r2.json` (com a expressão de `tools/device/spec4/burst-expr.js`), `vostro-rajada-1080.json` e `vostro-rajada-1280.json`. São 40 quadros seguidos com o vídeo pausado, 3 rodadas em ordem sorteada; a tabela traz a mediana de parede em ms por quadro, com o timestamp do WebGPU entre parênteses.

| Caso | Poco 1280p | Vostro 1080p (nativo) | Vostro 1280p |
| --- | --- | --- | --- |
| WebGL2 | 10,38 | 3,01 | 5,03 |
| WebGL2 com `VideoFrame` | 10,31 | 3,05 | 5,27 |
| WebGPU | 3,25 (2,95) | 3,50 (3,13) | 4,87 (4,97) |
| WebGPU com `VideoFrame` | 3,19 (2,95) | 2,58 (2,55) | 5,02 (4,76) |
| WebGPU compute | 4,17 (3,80) | 2,81 (2,86) | 5,25 (4,89) |
| WebGL2, SGSR | 5,30 | 3,31 | 2,87 |
| WebGPU, SGSR | 2,04 (1,90) | 2,43 (2,28) | 2,61 (2,55) |
| WebGL2, padrões v9 | 10,75 | 3,94 | 6,03 |
| WebGPU, padrões v9 | 4,08 (3,80) | 4,33 (4,11) | 5,85 (5,56) |

A primeira rajada do Poco (`poco-rajada-r1.json`) usou uma versão anterior da expressão, que não foi guardada. Nela, o WebGPU padrão deu 4,16 ms, a cópia 3,20 ms e os padrões v9 8,59 ms. O v9 da segunda rajada (4,08 ms) é metade do da primeira e igual ao WebGPU padrão. Não sei se a primeira rodou outra configuração ou se a segunda não aplicou o v9; por isso **o número do v9 em WebGPU fica sem conclusão**. O timestamp no Poco anda em degraus de cerca de 0,85 ms, então a coluna de parede é a referência.

### Conversão do quadro (entrada)

O H.264 decodifica de forma idêntica em qualquer aparelho, então uma diferença no quadro convertido vem da conversão YUV→RGB. No Vostro, a conversão do WebGL2 e a do WebGPU são idênticas nos dois instantes testados (`vostro-entrada.json`, diferença 0). Ela foi guardada como referência (`output/spec4-entrada-*.bin`, fora do git) e comparada com as duas do Poco (`poco-entrada.json`), em níveis de 0 a 255:

| Instante | WebGL2 do Poco contra a referência | WebGPU do Poco contra a referência | Bordas de croma, WebGL2 / WebGPU |
| --- | --- | --- | --- |
| 2,02 s | média 0,43; 5,5% acima de 1; máx. 93 | média 0,048; 0,003% acima de 1; máx. 2 | média 4,0 / 0,12 |
| 5,02 s | média 0,49; 6,5% acima de 1; máx. 74 | média 0,052; 0,004% acima de 1; máx. 2 | média 3,0 / 0,10 |

A diferença de 0,34 nível relatada na primeira parte é do **upload do WebGL2 no Adreno**, que suaviza o croma de outro jeito, principalmente nas bordas. O WebGPU no Poco reproduz a conversão do Chrome no Intel. Que essa seja a conversão "certa" é inferência: as duas coincidem, mas não comparei com uma conversão de referência fora do navegador.

Com o caminho inteiro (`poco-pixels.json`), WebGPU contra WebGL2 com o quadro decodificado por cada API: média 0,31–0,39 nível, máximo 70–83, em todos os casos (Spec 3, v9, tudo ligado, SGSR). Compute e cópia diferem do WebGL2 da mesma forma. A diferença é da entrada, não dos shaders.

### Suítes no Poco

As páginas da CI, rodadas dentro do WebView do Poco com `tools/device/spec4/suite.cjs`:

- `webgpu-equivalence.html` (`poco-suite-equivalencia.json`): **26 de 26**. O pior caso com os mesmos bytes foi o SGSR, com média 0,020 e máximo 17 níveis. Com `VideoFrame` importado, o pior foi o EASU, com máximo 20 níveis em 0,13% dos valores.
- `renderer-harness.html` (`poco-suite-integracao.json`): **24 de 24**: Auto em WebGL2 sem criar canvas WebGPU, troca para o WebGPU quando os pipelines ficam prontos, captura direta, pacer, `timestamp-query` no orçamento, devolução ao WebGL2 com o temporal, fallback em falha.

Criação do device e aquecimento dos pipelines no Poco: 185–490 ms e 155–455 ms. O aquecimento roda antes de o WebGPU assumir, então não trava o jogo.

## Medições da primeira parte: passada `spatial`

Aparelhos: Poco F7 em USB, com o app `com.imagefilter.xcloud` na frente e a bancada servida pelo CDP (`https://bench.invalid`, como na Spec 2). Vostro com Chrome 157 local, num perfil temporário. O clipe é `output/videos/game30.mp4` (H.264 1080p), com o vídeo pausado num quadro. Rajadas de 40 passadas em alvos RGBA8 alternados, 5 rodadas em ordem sorteada, todos os casos aquecidos antes.

O tempo de parede inclui a espera do fim (1 px de `readPixels` no GL, `onSubmittedWorkDone` no WebGPU), por isso é a coluna comparável entre as APIs no Poco, que não tem cronômetro no WebGL2. O `timestamp-query` mede só o intervalo entre a primeira e a última passada.

**Poco F7, segunda rodada** (`docs/medicoes/spec4/poco-cost.json`), ms por passada, mediana de parede (timestamp entre parênteses):

| Caso | GL `spatial` | GL upload + `spatial` | GPU textura | GPU `texture_external` direta | GPU importação + cópia + `spatial` |
| --- | --- | --- | --- | --- | --- |
| Padrões da Spec 3 | 0,65 | 1,78 | 0,99 (0,71) | 1,74 (1,39) | 1,36 (0,80) |
| Padrões v9 | 1,35 | 3,13 | 2,12 (1,68) | 5,09 (4,73) | 2,59 (2,01) |
| Tudo ligado | 1,71 | 3,78 | 2,54 (2,16) | 5,84 (5,38) | 2,54 (1,99) |

A primeira rodada no Poco, sem o caso de cópia, deu valores parecidos: GL upload + `spatial` com 2,29, 3,31 e 3,11 ms; `texture_external` direta com 1,81, 5,77 e 6,33 ms.

**Vostro 3400** (`docs/medicoes/spec4/vostro-cost.json`), ms por passada, mediana de parede (cronômetro ou timestamp entre parênteses):

| Caso | GL `spatial` | GL upload + `spatial` | GPU textura | GPU `texture_external` direta | GPU importação + cópia + `spatial` |
| --- | --- | --- | --- | --- | --- |
| Padrões da Spec 3 | 0,94 (0,92) | 1,30 (0,86) | 1,02 (0,97) | 1,68 (1,62) | 1,35 (1,28) |
| Padrões v9 | 1,67 (1,64) | 2,00 (1,56) | 2,18 (2,12) | 5,00 (4,94) | 2,47 (2,41) |
| Tudo ligado | 1,75 (1,73) | 2,06 (1,62) | 2,39 (2,34) | 5,42 (5,37) | 2,65 (2,60) |

**Leitura.**

- Ler a `texture_external` em cada tap é a pior opção: cada leitura converte YUV→RGB de novo, e a `spatial` lê de 13 a 30 texels por pixel. Uma cópia para RGBA8 logo depois da importação sai bem mais barata e deve ser o caminho do motor.
- A vantagem do WebGPU no Poco vem da importação, não do shader. A Spec 2 mostrou que o upload do WebGL2 em rajada funciona como barreira e exagera o custo: em sessão ao vivo, o upload ocupou 0,5–0,6 ms de GPU, não os 1,1–2,4 ms que a rajada sugere. **O ganho pode encolher ou sumir em sessão**, e isso precisa ser medido antes de qualquer decisão.
- No Vostro o WebGPU não compensa: a mesma passada é 5 a 30% mais cara, e a importação não ajuda, porque o upload ali já é barato.

**Equivalência de imagem** (`*-compare.json` e `*-compare-mesma-entrada.json`), diferença por canal em níveis de 0 a 255:

| Comparação | Vostro | Poco |
| --- | --- | --- |
| Entrada: upload WebGL2 contra cópia WebGPU do mesmo quadro | — | média 0,34; 4,5% acima de 1; máx. 84 |
| `spatial`, mesmos bytes, WGSL contra GLSL `highp` | média 0,00005–0,00009; 0% acima de 1; máx. 10 (1 valor) | média 0,0025–0,0036; 0,009–0,013% acima de 1; máx. 98–99 |
| `spatial`, mesmos bytes, WGSL contra a variante GL `mediump` | igual à linha acima (lá é `highp`) | média 0,037–0,039; 0,025–0,029% acima de 1 |
| Referência: GLSL genérico contra a variante `mediump` | 0 | média 0,036–0,038; 0,019–0,020% acima de 1; máx. 52 |
| `spatial` com o quadro decodificado por cada API | igual à linha de mesmos bytes | média 0,29–0,32; 3,8–3,9% acima de 1 |

Com a mesma entrada, o WGSL fica mais perto do GLSL `highp` do que o `mediump` que já está em produção, então a tolerância da Spec 3 cobre o port. A diferença com o quadro decodificado vem da conversão de cor do quadro, não do shader. Cabe ao Matheus ver se ela é perceptível; a média de 0,34 nível sugere que não, mas o máximo de 84 indica bordas de croma convertidas de outro jeito (inferência, não inspecionado).

**Poco durante a rodada.** Bateria em 34%, carregando por USB, de 32,8 a 33,3 °C; GPU de 40 a 55 °C nas rajadas; estado térmico 0. Nenhuma pausa por calor. Nenhum APK instalado e nenhuma configuração alterada. No fim, o WebView voltou para `xbox.com` e o `adb forward` foi removido.

## Tabela de custos (seção 8), coluna WebGPU

O custo que decide é o da sessão (acima): caminho padrão inteiro no Poco, com 10,2 ms no WebGL2 contra 12,0 ms no WebGPU, e SGSR com 4,5–5,2 contra 7,8–8,1 ms. A tabela abaixo é da primeira parte e mostra só a passada `spatial`, em 1080p, em rajada, com o quadro importado (importação + cópia + `spatial` no WebGPU, upload + `spatial` no WebGL2):

| Filtro | Poco WebGL2 | Poco WebGPU | Vostro WebGL2 | Vostro WebGPU |
| --- | --- | --- | --- | --- |
| Compressão, Degradês, Cor nas bordas e Detalhe (padrões da Spec 3) | 1,78 | 1,36 | 1,30 | 1,35 |
| Os mesmos com os padrões v9 | 3,13 | 2,59 | 2,00 | 2,47 |
| Antialiasing fundido (tudo ligado) | 3,78 | 2,54 | 2,06 | 2,65 |
| FSR 1 EASU | 1,48–2,59 (Specs 1 e 3) | portado; não isolado | 1,96–2,01 | portado; não isolado |
| Nitidez final | 0,67–1,24 | portado; não isolado | 0,81–1,31 | portado; não isolado |
| SGSR (opção, caminho inteiro em sessão) | 4,5–5,2 | 7,8–8,1 | sem sessão | sem sessão |
| Temporal, reconstrução neural | ver Spec 1 | fora de escopo | ver Spec 1 | fora de escopo |

## Testes

Segunda parte, conferida na nuvem com o Chromium do Playwright (SwiftShader, sem GPU), `python3 tools/run-browser-tests.py --executable /opt/pw-browsers/chromium`:

| Suíte | Resultado |
| --- | --- |
| Node (`node --test tests/*.cjs`) | 69 de 69 |
| `node --check` do userscript e do `player.js`; build sem diferença | ok |
| `filter-harness` | 117 passam (a falha antiga `Cut rejects old dark history` não aparece mais) |
| `regressions-v7` | 62 passam |
| `motion-quality` | 11 passam |
| `capture-harness` | 27 passam |
| `webgpu-equivalence` | 26 passam (SwiftShader); 26 de 26 no Poco |
| `renderer-harness` | 24 passam (SwiftShader); 24 de 24 no Poco |

**Correção na CI.** No Linux sem GPU, o primeiro conjunto de flags do WebGPU recebe o adaptador SwiftShader. Nele, `importExternalTexture` de um `<video>` falha ("Failed to import texture from video"). Só com `--use-angle=swiftshader`, o device é destruído logo depois da importação. As duas suítes WebGPU falhavam assim, e a CI teria falhado no primeiro push. A importação só funciona com ANGLE e Vulkan também no SwiftShader (`--use-angle=swiftshader --enable-features=Vulkan --use-vulkan=swiftshader`). O `tools/run-browser-tests.py` agora passa para esse conjunto quando o primeiro cai no SwiftShader; numa máquina com GPU, o primeiro conjunto continua valendo.

Primeira parte (no Vostro, Chrome 157): Node 65 de 65, `regressions-v7` 62, `motion-quality` 11, `capture-harness` 26, `filter-harness` com a falha conhecida. O `regression-harness.py` passou a comparar o nome-base da passada (`p.split('@')[0]`), igual ao commit `5290ec9` da branch da release.

## Pendências

- **Partida real no xCloud com Renderizador = WebGPU** no Poco: fallback, HUD, travadas na criação, sessão de 20 min. Nada disso foi testado fora da bancada.
- Sessão a 30 FPS no Vostro (casos prontos em `cases-sessao-vostro.json`).
- Explicar os +1,8 ms/quadro do WebGPU em sessão no Poco: `shader-f16`, custo da composição do segundo canvas e SGSR lendo direto da importação.
- Repetir a rajada v9 em WebGPU, que deu 8,59 ms numa rodada e 4,08 ms na outra.
- Compute: medir de novo depois do `shader-f16`; hoje está desligado.
- Temporal e reconstrução neural continuam só no WebGL2. Com eles ligados, o quadro volta para o WebGL2.
- O Matheus deve conferir se o croma do WebGL2 no Adreno (3–4 níveis de média nas bordas, contra a conversão do WebGPU e do Vostro) é visível. Se for, é um argumento a favor do WebGPU no Poco independente do custo.
