# v10.2.1 — Fluidez sem descarte de quadros colados e GPU sem número falso

Userscripts `6.7.12-imagefilter.10.2.1` (www.xbox.com, sobre o Better xCloud 6.7.12) e `10.2.1-play` (play.xbox.com), app Android **10.2.1** (`versionCode` 100201). Inclui tudo da [v10.2.0](historico/release-v10.2.0.md). Nenhum filtro de imagem mudou.

Correções a partir do teste da v10.2.0 no Poco F7 (Gears of War 4, 60 FPS, tela a 60 Hz). Como a v10.2.0, esta versão saiu sem medição no aparelho: o efeito foi reproduzido e corrigido num teste com o padrão de quadros da sessão, não no celular.

## O que mudou

### Fluidez: quadros que chegam colados não são mais descartados
- No teste, a Fluidez descartava 258 a 546 quadros por minuto (até ~15% do stream). O tempo médio entre quadros na tela ficava em ~20 ms com p95 de 33 ms, com 60 FPS chegando.
- Causa: o servidor captura alguns quadros a ~8 ms um do outro e depois deixa um intervalo de ~25 ms. Com a tela a 60 Hz, dois quadros venciam na mesma atualização; a Fluidez mostrava o mais novo, descartava o anterior e ficava sem quadro na atualização seguinte (o buraco de 33 ms).
- Agora o mais novo espera a próxima atualização. O par vira dois quadros seguidos de 16,7 ms. Vale para Equilibrada e Máxima.
- Custo: nesses momentos o quadro mais novo aparece até uma atualização (16,7 ms) depois.
- Se o indicador `desc` continuar alto depois desta versão, o aparelho não está conseguindo desenhar 60 quadros por segundo: aí a causa é a GPU, e vale reduzir Nitidez/Detalhe, usar SGSR ou saída Nativa.

### Uso de GPU: sem número quando não há medição
- A v10.2.0 mostrava `GPU ≈190%` a `≈650%`. O número vinha da estimativa por fence, que conta o tempo até a GPU terminar o quadro com a fila junto, e não o trabalho da GPU.
- Agora o HUD só mostra percentual com medição real: a carga da GPU inteira lida pelo app, ou o tempo de GPU do tratamento onde o navegador tem cronômetro de GPU (desktop, ou renderizador WebGPU). Sem medição mostra `—`.
- No WebView do Android com WebGL2 não existe cronômetro de GPU. O app passa a tentar mais dois caminhos do sistema para ler a carga real; se o HyperOS negar todos, o campo fica em `—`.

### Observado no teste da v10.2.0
- **1440p:** com a opção ligada, o servidor continuou enviando 1920×1080. O pedido não mudou o stream nesta conta e neste jogo.
- **60 Hz:** "Fixada em 60 Hz pelo app" funcionou, sem aviso de tela a 120 Hz.

## Para quem mexe no código
- `createPacer().tick()`: com mais de um quadro vencido, mostra o penúltimo e mantém o último na fila (`tests/engine.test.cjs`, padrão de captura 16,7/8,3/25 ms).
- `snapshot().gpuPct` não usa mais `status.gpuEstimate`; `BxAndroid.getGpuBusy()` tenta `gpu_busy_percentage`, `gpubusy` e `/sys/kernel/gpu/gpu_busy`.
