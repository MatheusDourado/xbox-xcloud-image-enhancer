# v10.1.0 (beta de teste) — correções, avisos e medição para o play.xbox.com

Userscripts `6.7.12-imagefilter.10.1.0` (www.xbox.com, sobre o Better xCloud 6.7.12) e `10.1.0-play` (play.xbox.com), app Android **10.1.0** (`versionCode` 100100). Pré-lançamento para o Matheus testar no Poco F7. Inclui tudo da [v10.0.0](release-v10.0.0.md). **Esta build ainda não rodou no Poco nem numa partida real**: tudo abaixo foi conferido em Node e em Chromium/SwiftShader.

## Origem

[Auditoria do pipeline no play.xbox.com](auditoria-play-xbox-com.md), feita em duas fases sobre o commit `16e64fc` (o código da v10.0.0; o APK 10.0.0 embarca o mesmo userscript):

- **Fase 1 (sem código):** seis frentes investigadas e, em seguida, verificadas de forma adversarial pelo modelo Fable (um verificador por frente, esforço alto). Os achados usam os IDs do documento (R1, R3, R9, R10, F8, F10, F11, N5, M17 etc.) e a lista deduplicada de mudanças fica na seção 12.1.
- **Fase 2 (esta versão):** implementada pelo Fable com o escopo aprovado pelo usuário, **"Correções + avisos + medição"**: defeitos confirmados, dicas do painel, avisos quando a rede neural não roda ou foi cortada, instrumentação da medição e pré-aquecimento do shader dos ajustes salvos. Ficou **fora** por decisão: repesar o Detalhe, `mediump` na rede, `untouched` antes do croma, otimizar o laço rVFC, mudar qualquer padrão ou preset e retreinar a rede (ver Pendências).

## O que mudou

### Correções (grupo 1: `fix(renderizador)`)

- **R3 — canvas WebGPU no site novo.** No play.xbox.com a posição do canvas vem só da classe `bxif-play-canvas` (`src/play/host.js`); o canvas do WebGPU não a recebia e ficava em fluxo, abaixo do vídeo. Agora ele herda as classes e o `aria-hidden` do canvas WebGL2, e `syncCanvas` mantém as classes sincronizadas a cada quadro. No site antigo o CSS `#game-stream canvas` já cobria os dois. O `play-harness` confere classe, `aria-hidden`, `position: absolute`, retângulo igual ao do WebGL2 e remoção ao voltar para Auto.
- **F11 — direção do antialiasing.** Em `spatial.glsl`, `antialias.glsl` e `spatial.wgsl` a direção estava espelhada: para uma rampa `L = a·x + b·y`, os vizinhos diagonais davam `dir = −4·(b, a)`, e a 45° as duas amostras caíam através da borda. `dir.y` passa a `ne + se − nw − sw`, ou seja, `dir = 4·(−b, a) ⟂ (a, b)`. Na bancada (borda 50/200 a 30° e 45°, AA 1, fundido e em passe separado) a transição cai para ≤ 1,6 px por pixel de borda (antes 2,0 e 2,83) e o contraste através da borda sobe para ≥ 85% (antes 73% e 70%). **Só age com Antialiasing > 0; com AA 0 (padrão) os bytes não mudam.**
- **R10 — medição ao trocar de renderizador.** A medição passa a ser do player (`player.bxDiagnostics`), compartilhada pelos motores WebGL2 e WebGPU; cada segmento leva `config.renderer` (`webgl2` ou `webgpu`), então trocar de renderizador durante a gravação só abre outro segmento, em vez de perder os dados. `exportMeasurement` não grava arquivo sem segmentos e o painel avisa: "Medição sem quadros tratados: nada exportado".
- **R1 — `status.renderer.probe`.** Recebe `{vendor, architecture}` do adaptador quando um motor WebGPU é criado e, só enquanto `AUTO_WEBGPU` nomear alguma GPU e o ajuste for Auto, por uma sondagem única (`requestAdapter` sem device). Com a lista vazia, como hoje, nada muda: Auto continua em WebGL2 e nenhum `requestAdapter` é feito só para sondar.

### Dicas e avisos do painel (grupo 2: `feat(painel)`)

- **Dicas corrigidas** (N15, F2, M17, F21–F23): Método **Nativo** diz, quando não há menu do Better xCloud (caso do play.xbox.com), que aplica o processamento salvo (CAS por padrão); **Reconstrução neural** passa de "~30% mais GPU" para "+45% de GPU em sessão a 30 FPS na bancada do Poco; qualquer valor acima de 0 custa o mesmo" e perde o conselho "use Nitidez ~2,5"; **Compressão** diz o que faz (degraus de bloco em áreas lisas) e o que não remove (ringing, mosquito; pouco efeito acima de ~10 Mb/s); **Detalhe** avisa que realça as mesmas frequências finas que a Nitidez, que os perfis vão até 35% e que o excesso vira halo e cintilação; **Degradês** acrescenta que borra bordas suaves de baixo contraste.
- **Aliviar GPU sem cronômetro de GPU** (2.4): com `status.measurement === 'cadence'` (WebGL2 no Poco) a dica diz que 3, 6 e 10 ms se comportam igual, que a redução segue a cadência e que só **Nunca** a desliga.
- **Estado da rede neural visível** (N5): `status.neural` em `off`, `running`, `no-float` (sem `EXT_color_buffer_float`) ou `cut` (cortada pelo orçamento). Avisos novos `neural-float` e `neural-cut` ("Reconstrução neural pedida, mas não está rodando: …") com a saída indicada (Restaurar tratamento ou Aliviar GPU = Nunca); o slider ganha a etiqueta Rodando/Cortada/Sem float no lugar de EXP; o HUD mostra **SEM NEURAL**; "Copiar configuração" e o relatório levam `neural` e `measurement`.
- **GPU por fence rotulado** (R9): "Tratamento (GPU ≈ fence, p95)" e a nota "Estimado por fence … limite superior" no painel; chip "GPU ≈fence" e legenda "T≈fence" no HUD; cada segmento do relatório traz `gpu.method` (`timer`, `timestamp`, `fence` ou `null`).

### Medição e pré-aquecimento (grupo 3: `feat(medicao)`) — schema 2 → 3

- **Passes por segmento** (3.5 item 4, 2.9): cada quadro registra os passes na ordem (ex.: `upload, nnFeatures, nnApply, spatial@mediump.1.1.4.1.0.0.1.1, casFiltered#1`); o segmento conta quadros por sequência distinta (`segment.passes`) e guarda o passe final com `filterId` (`segment.final`). O `spatial` genérico, usado enquanto a variante compila, conta à parte sem abrir segmento. Com Fluidez o passe final roda em `present()` e termina em `@present`. O WebGPU registra o equivalente (`import`/`upload`, `spatialCompute`, variante ou genérico).
- **Séries novas por segmento** (3.5 itens 1 e 2), com p50/p95/p99: `cpu` (tempo de `updateFrame`/`renderDirect` na thread principal), `slack` (`expectedDisplayTime` − fim do processamento; pode ser negativa) e `pipeline` (`presentationTime` − `receiveTime`), a partir dos metadados do rVFC, guardados só durante a medição.
- **`events[]`** (3.5 item 3), até 500 com `eventsTruncated`: `compile` (variante do `spatial`, com a duração do `finishProgram`), `compile-failed`, `target` (alocação/realocação com bytes), `degrade` (`reason` e `revision`), `renderer`, `renderer-failed`, `fluidity`, `capture` e `resize`.
- **`status`/`metadata`/timeline:** `report.status` leva `adaptation` (`budget.reason`), `display`, `resolution`, `renderer` e `neural`; `metadata` ganha `gpu {renderer, vendor}` (via `WEBGL_debug_renderer_info`, `null` sem a extensão), `spatialPrecision`, `parallelCompile` e `warmMs`; a timeline leva `width`/`height` da fonte, `display` e `refreshHz` (F10).
- **F8 — pré-aquecimento da variante dos ajustes salvos.** `Engine` e `BxWebGPU.create` recebem os ajustes atuais e compilam, além da variante dos padrões, a variante do `spatial` que o `framePlan` desses ajustes vai usar (com `wait = true` no WebGL2). Antes, no Poco (sem `KHR_parallel_shader_compile`), essa variante era finalizada de forma bloqueante no 2º quadro.
- Fora da medição o custo por quadro é uma checagem booleana; rastro de passes, séries e eventos só existem com a gravação ativa. `docs/api-imagefilter.md` descreve os campos novos.

## O que NÃO mudou

- **Imagem padrão idêntica.** Com Antialiasing 0 (padrão), a saída em pixels do WebGL2 e do WebGPU é a mesma do commit `16e64fc` para qualquer configuração: o `regression-harness` compara bytes e, no grupo 1, o bundle novo foi conferido contra o do `16e64fc` em 19 configurações (bytes idênticos nos dois motores). A **única** mudança de imagem é a direção do AA, e ela só age com AA > 0.
- **Padrões e presets iguais** aos da v10.0.0 (Compressão 0, Nitidez 2 USM, Detalhe 0, Degradês 60%, Cor nas bordas 75%, rede 0, AA 0, saída Auto com EASU, Renderizador Auto → WebGL2, Aliviar GPU 6 ms e Adaptar ligado; os presets mantêm os valores da v10.0.0). Nenhum shader foi repesado; a rede não foi retreinada nem passou a `mediump`.
- O Better xCloud (`script.js`) não foi editado; todos os patches estão em `src/`.

## Sugestões de configuração para testar (não são padrões novos)

Vêm das seções 6.4 e 10 da auditoria. São hipóteses para o A/B no Poco, não ajustes aplicados pela versão:

- **Compressão 0** (já é o padrão): A/B 0 × 30 em cena escura com blocos; a etapa só suaviza degraus monótonos.
- **Degradês 60%** (padrão), 30% se a prioridade for textura: 100 × 60 × 30 × 0 em céu, neblina e asfalto; a 100% a etapa come ~metade do grão de 1–3 níveis.
- **Detalhe 0–35%** em vez de 100%: realça as mesmas frequências que a Nitidez; acima do que os perfis usam (≤ 35%) vira halo e cintilação.
- **Aliviar GPU = Nunca** durante os testes, ou conferir `budget.revision` 0: sem cronômetro de GPU a redução por cadência altera Degradês/Compressão/rede sem avisar e contamina qualquer A/B.
- **Saída Auto** para comparar EASU × SGSR: em saída Nativa os dois planos são iguais e nenhum escalador roda (seção 1, item 1); só em Auto `effective.scaler` muda.
- **Rede 0 × 100%** no A/B (matriz da seção 5.5), com Renderizador WebGL2 e "Nunca": agora o painel e o relatório dizem se a rede rodou, foi cortada ou não tem float targets.

## O que testar no Poco (resumo da seção 9 da auditoria)

Via adb por Wi-Fi (Opções do desenvolvedor → Depuração por Wi-Fi) e `chrome://inspect`; o app já habilita a depuração do WebView e salva o export em `Downloads/xCloud ImageFilter`.

1. Fixar versões: commit, APK 10.1.0, versão do WebView, `BxBuild.sourceSha256`.
2. DevTools → snippet de estado (9.3): `floatTargets`, extensões, `budget`, `status.resolution`, `status.net`, e agora `status.neural` e `status.measurement`.
3. Condições iniciais (`thermalservice`, `battery`); taxa da tela fixa em 60 Hz pelo painel do app.
4. Perfetto longo (frametimeline + `gpu_work_period`): no WebGL2 do Poco o `gpu.*` por segmento é fence (`gpu.method: 'fence'`), não tempo de GPU.
5. Painel → **Iniciar medição**; fechar o painel; HUD desligado ou compacto; **desconectar o DevTools** (divide o rádio com o stream).
6. Série de 10–20 min, uma variável por vez, ABAB a cada 2–3 min, anotando horários e engasgos percebidos: (a) rede 100% × 0%; (b) Fluidez desligada × Equilibrada × Equilibrada + Direta; (c) 60 × 120 Hz; (d) Original × Tratada; (e) Aliviar GPU Nunca × 6 ms; (f) Nativa × Auto e, em Auto, EASU × SGSR. Um jogo a 30 FPS e outro a 60 FPS.
7. **Encerrar e exportar medição** e **Copiar configuração**; conferir `segments.length > 0`, `config.renderer`, `segment.passes`/`final`, as séries `cpu`/`slack`/`pipeline`, `events[]` (compilações, realocações, `degrade`) e a timeline (`refreshHz`, `width`/`height`).
8. Janela curta (18 s) num engasgo: Perfetto curto + DevTools Performance; cruzar com `events[]` e `slack` do export.
9. Com Renderizador **WebGPU** no play.xbox.com: o canvas tratado deve cobrir o vídeo (R3), e o export deve seguir ao voltar para Auto (R10).
10. Observar as dicas e avisos novos: etiqueta da rede no slider, aviso "Reconstrução neural pedida, mas não está rodando", "GPU ≈ fence" no painel/HUD, dica de Aliviar GPU sem cronômetro.

## Testes executados (esta build)

- Node (`node --test tests/*.cjs`): **76 de 76**; `node --check` nos dois userscripts e em `player/player.js`.
- Playwright no Chromium com SwiftShader (`tools/run-browser-tests.py`): painel e HUD **145**, regressões de pixel **68**, movimento **11**, captura **30**, play.xbox.com **31**, equivalência WebGPU × WebGL2 **26** e integração do renderizador **33**, todos PASS (a suíte WebGPU cai sozinha para os flags do SwiftShader; o `FAIL (0 checks)` seguido do PASS é esperado).
- A CI regenera os arquivos (`tools/build.py`), repete os testes e gera o APK `android/dist/xcloud-imagefilter-10.1.0.apk` com a mesma chave de teste da série 9.x/10.0.0 (instala por cima). O APK não foi instalado no Poco antes de publicar.

## Pendências

- Validação em partida real (v9.8.0, v10.0.0 e v10.1.0) e o protocolo da seção 9 no Poco.
- Itens da 12.1 marcados **"precisa medir antes"**, deixados de fora por isso: repesar o Detalhe (`fine` 0,3–0,5), variante `mediump` da rede, `untouched` antes do bloco de croma (A/B Cor nas bordas 0 × 0,75 com Detalhe), tirar trabalho repetido do laço rVFC (só se um traço mostrar GC em quadros longos), teste de regressão dos limites empilhados Detalhe 1 + USM 2 (teto só após medir na GPU real) e mudar o padrão do AA (refazer a bancada com a direção corrigida).
- Da 12.1 sem medição prévia, ainda não feitos: valores efetivos ao lado dos sliders quando Adaptar os altera (M19), métrica de bancada `detailLow`, metadados do treino em `src/nn/*.json` (N9), LoAF e térmico na medição (3.5 itens 5 e 7).
- Pendências herdadas da v10.0.0: os +1,8 ms/quadro do WebGPU no Poco; sessão a 30 FPS no Vostro; variante compute da `spatial`.
