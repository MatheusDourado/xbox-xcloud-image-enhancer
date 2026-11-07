# Spec 4 — Renderizador WebGPU opcional

Registro da Spec 4 na branch `claude/specs-autonomas`, em 2026-11-07, de 06:27 a 06:50 (horário local). Dados brutos em `docs/medicoes/spec4/`, bancada em `tools/device/spec4/`. Nada foi publicado: sem push, sem versão nova, sem APK.

## Resumo

**Estado:** Spec 4 encerrada

**Feito.** Fiz um port WGSL da passada `spatial` (Compressão, Degradês, Cor nas bordas, Detalhe e AA fundido), em `src/webgpu/spatial.wgsl`, e uma bancada que roda o mesmo quadro H.264 nos dois renderizadores. A bancada compara os pixels e mede o custo com `timestamp-query`, no Vostro e no Poco. **O WebGPU não entrou no userscript nem no app.** O caminho WebGL2 não mudou; o único efeito no build é o hash `sourceSha256`.

**Números principais** (passada `spatial` em 1080p, rajada de 40 passadas, 5 rodadas intercaladas, mediana em ms por passada):

| Caso, com o quadro importado | Poco WebGL2 (upload + `spatial`) | Poco WebGPU (importação + cópia + `spatial`) | Vostro WebGL2 | Vostro WebGPU |
| --- | --- | --- | --- | --- |
| Padrões da Spec 3 | 1,78 | **1,36** | 1,30 | 1,35 |
| Padrões v9 | 3,13 | **2,59** | 2,00 | 2,47 |
| Tudo ligado (AA fundido) | 3,78 | **2,54** | 2,06 | 2,65 |

No Poco, o WebGPU sai 17 a 33% mais barato **quando entra a importação do quadro**. Com a passada isolada sobre uma textura comum, o WebGL2 `mediump` ainda ganha (0,65 contra 0,99 ms nos padrões da Spec 3). No Vostro, o WebGPU empata ou perde em todos os casos.

**Imagem.** Com os mesmos bytes de entrada, o WGSL fica a 0,00005 nível de média do GLSL no Vostro e a 0,0025 nível do GLSL `highp` no Poco (0,009% dos valores acima de 1 nível). Com o quadro decodificado por cada API, a média no Poco sobe para 0,31 nível. Essa diferença já existe na entrada: a conversão YUV→RGB do WebGL2 e a do WebGPU diferem em média 0,34 nível nesse aparelho.

**Critérios de aceite.**

| Critério | Situação |
| --- | --- |
| Imagem equivalente nas regressões de pixel | **atendido só para a passada `spatial`**, na bancada; as outras passadas não foram portadas |
| Custo igual ou menor no Poco F7 | **não demonstrado**: só a `spatial` e só em rajada; ver Lacunas |
| Fallback sem travar nem recarregar | **não implementado**: o WebGPU não roda no userscript |
| Tempo de GPU com `timestamp-query` | **funciona na bancada**, nos dois aparelhos; ainda não está no motor |

Por isso o **padrão continua WebGL2** e não há opção no painel: oferecer "WebGPU" sem um renderizador completo seria uma opção que não faz nada.

**Lacunas.** Faltam o port de EASU, nitidez (`casFiltered`) e SGSR, a integração com o canvas do Better xCloud, o painel, o fallback, a fusão por compute shader e a medição em sessão ao vivo.

**Próximo passo.** Portar EASU, `casFiltered` e SGSR com a mesma convenção de coordenadas. Depois, medir o caminho padrão inteiro em **sessão a 30 FPS** no Poco (Perfetto `gpu_work_period`, como na Spec 3), porque a vantagem atual vem da importação, e a Spec 2 mostrou que o upload em rajada exagera o custo. Só então integrar.

## Tarefas da seção 5

| # | Tarefa | Situação |
| --- | --- | --- |
| 1 | Detectar WebGPU no WebView do Poco e no Chrome do Vostro | **feito** (Spec 1, conferido aqui) |
| 2 | Camada comum de renderizador | **parcial**: o WGSL usa `BxRestoration.spatialProfile`, a mesma função que monta as variantes GLSL; o motor ainda não tem a interface comum |
| 3 | Importar o quadro sem cópia | **medido**: `importExternalTexture` funciona, mas amostrar a `texture_external` em cada tap sai caro (abaixo) |
| 4 | Portar shaders para WGSL | **parcial**: só `spatial`; faltam EASU, nitidez e SGSR |
| 5 | Fundir etapas com compute shader | **não feito** |
| 6 | Opção no painel (Automático, WebGL2, WebGPU) | **não feito**, de propósito (Decisões) |
| 7 | Custo nos dois renderizadores | **feito para a `spatial`**; a tabela da seção 8 está abaixo |

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

**Sem integração nesta noite.** A sessão começou às 06:27, e o Matheus testa de manhã. O motor WebGL2 tinha acabado de mudar na Spec 3 sem validação em partida. Integrar um segundo renderizador exige outro canvas, porque o Better xCloud já criou o contexto `webgl2` no dele, e mexe no pacer, na captura direta e no HUD. Nada disso daria para validar sem uma partida. A opção mais segura foi medir a hipótese central (custo e equivalência da passada mais pesada) e não tocar no que vai para o teste.

**Sem opção no painel.** O brief pede "Automático, WebGL2 ou WebGPU", com o Automático em WebGL2 enquanto o WebGPU não estiver validado. Sem renderizador WebGPU, a opção ou não faria nada, ou cairia sempre em WebGL2. Preferi não mostrar um controle sem efeito.

**Convenção de coordenadas do GL no WGSL.** O WebGL2 sobe o quadro com `UNPACK_FLIP_Y`, então a linha 0 é a de baixo. No WebGPU a linha 0 é a de cima. O WGSL converte cada coordenada para o referencial do GL (`p`, `fc`) e só inverte a linha na leitura. Assim os deslocamentos assimétricos dos Degradês e o padrão de dither ficam iguais, e a diferença no Vostro cai para 0,00005 nível. Os portes seguintes devem seguir a mesma regra.

**Variantes por constante de pipeline.** As chaves `SPATIAL_*` viraram `override` do WGSL, preenchidas por `BxRestoration.spatialProfile`. A decisão sobre o que compilar fica num lugar só para os dois renderizadores, e a lógica dos filtros não é reescrita fora do shader. O shader em si existe nas duas linguagens; a equivalência é garantida pela comparação de pixels, não por geração automática.

**`f32` em todo o WGSL.** O WebGL2 usa `mediump` no Poco, e o WGSL usa `f32`. Isso explica pelo menos parte da passada isolada mais cara no Poco (0,99 contra 0,65 ms). `shader-f16` existe nos dois aparelhos, mas exige reescrever os tipos e não coube na noite.

## Medições

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

Só a passada `spatial`, em 1080p, em rajada, com o quadro importado (importação + cópia + `spatial` no WebGPU, upload + `spatial` no WebGL2):

| Filtro | Poco WebGL2 | Poco WebGPU | Vostro WebGL2 | Vostro WebGPU |
| --- | --- | --- | --- | --- |
| Compressão, Degradês, Cor nas bordas e Detalhe (padrões da Spec 3) | 1,78 | 1,36 | 1,30 | 1,35 |
| Os mesmos com os padrões v9 | 3,13 | 2,59 | 2,00 | 2,47 |
| Antialiasing fundido (tudo ligado) | 3,78 | 2,54 | 2,06 | 2,65 |
| FSR 1 EASU | 1,48–2,59 (Specs 1 e 3) | não portado | 1,96–2,01 | não portado |
| Nitidez final | 0,67–1,24 | não portado | 0,81–1,31 | não portado |
| SGSR (opção) | 0,78–0,80 | não portado | 1,04–1,06 | não portado |
| Temporal, reconstrução neural | ver Spec 1 | fora de escopo | ver Spec 1 | fora de escopo |

## Testes

| Suíte | Resultado |
| --- | --- |
| Node | 65 de 65 |
| `node --check` do userscript e do `player.js` | ok |
| `regressions-v7`, Chrome 157 | 62 passam (igual à Spec 3) |
| `motion-quality` | 11 passam |
| `capture-harness` | 26 passam |
| `filter-harness` | a falha conhecida `Cut rejects old dark history` (Specs 1 e 3), nenhuma nova |

Rodados depois do commit do port, com `PYTHONUTF8=1 python tools/run-browser-tests.py --channel chrome`. Depois, por aviso da orquestradora, `tools/regression-harness.py` passou a comparar o nome-base da passada (`p.split('@')[0]`) em `Neural restoration adds two passes before the spatial pass`, igual ao commit `5290ec9` da branch da release. No Chromium do CI (Playwright, SwiftShader), a checagem falhava quando a variante `spatial@…` já tinha compilado. Aqui ela passava, e as suítes repetem o mesmo resultado depois da mudança (62, 11, 26 e a falha conhecida). As regressões rodam em WebGL2 e **não cobrem o WGSL**: a equivalência do port vem da bancada de comparação acima. Nenhum arquivo do motor, do painel ou do player mudou: o único efeito no userscript e no bundle é o hash `sourceSha256` do build, que inclui `src/`. A CI exige esse arquivo atualizado, por isso o rebuild foi commitado.

## Pendências

- Port de EASU, `casFiltered` (USM e CAS com limitador e acabamento) e SGSR, na mesma convenção de coordenadas, com comparação de mesmos bytes.
- `shader-f16` no WGSL para casar com o `mediump` do Adreno, medindo a passada isolada de novo.
- Medição em **sessão a 30 FPS** no Poco, com o caminho padrão inteiro nos dois renderizadores (Perfetto `gpu_work_period`), para confirmar se a vantagem da importação se mantém fora da rajada.
- Integração: segundo canvas sobre o do Better xCloud, a mesma interface do `Engine` (`render`, `present`, `outputSize`, `budget`, `diagnostics`), pacer, captura direta com `VideoFrame`, fallback para o WebGL2 sem recarregar, e a opção no painel com o Automático em WebGL2.
- Pipelines pré-criados com `createRenderPipelineAsync`: até 0,95 s no Poco com `texture_external`.
- Compute shader com memória de workgroup para fundir `spatial` e EASU (tarefa 5).
- Temporal e reconstrução neural ficam no WebGL2: com eles ligados, o renderizador seria o WebGL2.
- Validação visual pelo Matheus da diferença de conversão de cor do quadro no Poco (média de 0,34 nível, máx. 84).
