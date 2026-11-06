# Log de execução das specs

## Resumo da rodada de 06/nov/2026 (sessão em nuvem, sem aparelho)

**Feito**
- Spec 1: código e shaders lidos e mapeados — [spec1-estudo-codigo.md](spec1-estudo-codigo.md). A reconstrução neural foi documentada: CNN própria de 225 parâmetros em shader WebGL2 gerado no build, treinada em JAX, sem biblioteca de ML.
- Bancada de custo por etapa: `player/stage-cost.html` + `tools/stage-cost.cjs`. Mede cada filtro isolado com o mesmo motor do userscript e já sonda o WebGPU (adaptador, `timestamp-query`, `shader-f16`, limites), que é a tarefa 1 da Spec 4.
- Spec 2: ranking de melhorias — [spec2-plano-gpu.md](spec2-plano-gpu.md).

**Medido** (SwiftShader, só relativo): padrão v9 1080p = 100%; espacial = 88% disso; Detalhe é o filtro mais caro; Auto em 1280p (Poco) = 138%; modo Qualidade = 117%; neural = +45% sobre a base; RCAS custa ~1/8 da USM.

**Achado principal**: sem timer de GPU (WebView do Android), a adaptação automática não tem referência de FPS e nunca reduz o tratamento no Poco F7. É o item 1 do ranking.

**Não feito / pendente**
- Nenhuma medição no Poco F7 nem no Vostro: esta sessão roda num container em nuvem, sem ADB e sem o aparelho. As colunas de dispositivo da tabela de custos continuam vazias.
- Spec 3 (implementação) não começou: o primeiro item é a medição no aparelho, e as mudanças de comportamento do ranking precisam dela para antes/depois.
- Spec 4: só a sonda de WebGPU está pronta; falta rodar no aparelho.
- Testes Playwright em Python (`tools/run-browser-tests.py`) não rodaram aqui: o pacote Python `playwright` não está instalado no container. Nenhum arquivo do motor, shader ou userscript foi alterado (o build regenerado é idêntico ao commitado), então as regressões de pixel e movimento não são afetadas.

**Próximo passo**: rodar a bancada no Poco (abaixo), preencher a tabela e implementar o item 1 do ranking.

## Como rodar a bancada no Poco F7 (ADB)

Pelo PC com o repositório:

```bash
python3 tools/build.py
```

```bash
python3 -m http.server 8000
```

```bash
adb reverse tcp:8000 tcp:8000
```

No Chrome do Poco, abrir `http://localhost:8000/player/stage-cost.html?ms=4000&out=1280` e tocar em **Medir**; depois **Exportar JSON**. Para ler pelo PC, abrir `chrome://inspect` com a depuração USB ligada e rodar `copy(JSON.stringify(stageCostReport()))` no console. Para o WebView do app, a mesma página pode ser aberta pelo app se ele permitir navegar para `localhost` (a confirmar); senão, comparar o Chrome do aparelho, que usa o mesmo motor de GPU.

Antes e depois de cada rodada, anotar bateria e temperatura:

```bash
adb shell dumpsys battery | grep -E 'level|temperature'
```

Repetir com `&video=<arquivo>` (mesma origem, por exemplo um MP4 de teste em `output/videos/`) para medir o upload de um quadro de vídeo real em vez de um canvas.

Leitura do relatório: `msPerFrame` é a vazão (lote de 10 quadros + leitura de 1 pixel), incluindo o upload; `deltaMs` subtrai a linha "base"; `timerP50` só aparece onde há `EXT_disjoint_timer_query_webgl2` (Vostro/Chrome desktop). O campo `webgpu` responde à tarefa 1 da Spec 4.

## Decisões tomadas sem confirmação

- Não alterar o comportamento do userscript nesta rodada: sem medição no aparelho não há como provar ganho, e a regra é escolher a opção mais segura.
- Bancada mede vazão com leitura síncrona de 1 pixel por lote. Isso é proibido no caminho do jogo (10.3), mas é o único jeito de medir sem timer; a página é só de bancada.
- A sonda do WebGPU desiste após 5 s (no Chromium headless, `requestAdapter` não responde).

## Validação desta rodada

- `node --test tests/*.cjs`: 47/47 passando antes e depois.
- `python3 tools/build.py`: userscript e bundle regenerados sem diferença.
- `node tools/stage-cost.cjs 3000 1280`: duas rodadas com os mesmos números (±10%).
