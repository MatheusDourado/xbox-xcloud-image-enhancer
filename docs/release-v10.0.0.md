# v10.0.0 (beta de teste) — renderizador WebGPU opcional

Userscript `6.7.12-imagefilter.10.0.0` e app Android **10.0.0**. Pré-lançamento para o Matheus testar em partida real. Inclui tudo da [v9.8.0](release-v9.8.0.md) (Specs 1 a 3). **Nada desta versão foi visto numa partida do xCloud.**

## Origem

Spec 4 da rodada autônoma de 6 e 7 de novembro de 2026: [Spec 4 — renderizador WebGPU opcional](spec4-webgpu.md). As Specs 1 a 3 entraram na v9.8.0.

## O que mudou

- **Renderizador WebGPU opcional.** Nova linha *Renderizador* no painel (Auto, WebGL2, WebGPU, marcada EXP).
  - Ports WGSL de todo o caminho espacial: Compressão, Degradês, Cor nas bordas, Detalhe, AA fundido, EASU, nitidez (USM/CAS), RCAS e SGSR.
  - O quadro é importado sem upload (`importExternalTexture`), inclusive na captura direta.
  - O WebGPU desenha num canvas próprio, sob o do Better xCloud.
- **Volta para o WebGL2 sem recarregar** se o WebGPU falhar (criação, erro de validação, device perdido). O mesmo vale para quadros com temporal ou reconstrução neural, que só existem no WebGL2. O status do painel diz o motivo.
- **Tempo de GPU real no WebView** com o WebGPU: o `timestamp-query` alimenta a adaptação, em vez da estimativa pela cadência.
- **Auto continua em WebGL2 em todos os aparelhos.** No Poco F7, em sessão a 30 FPS, o WebGPU gastou mais GPU:

| Caminho (Poco F7, saída 1280p) | WebGL2 | WebGPU |
| --- | --- | --- |
| Padrão (EASU + nitidez) | 10,2 ms/quadro | 12,0 ms/quadro |
| SGSR | 4,5–5,2 ms/quadro | 7,8–8,1 ms/quadro |

- **Imagem:** com a mesma entrada, o WebGPU fica a no máximo 0,025 nível de média do WebGL2. No Poco, a conversão de cor do quadro no WebGPU bate com a do Chrome no PC. A do WebGL2 no Adreno difere cerca de 3–4 níveis nas bordas de cor.

## O que testar

1. Os itens da v9.8.0, se ainda não foram testados.
2. *Renderizador* → **WebGPU** numa partida: a imagem aparece, não trava na troca, e o HUD mostra o tempo de GPU.
3. Com WebGPU, ligar o Temporal: a imagem deve voltar ao WebGL2 sem recarregar; ao desligar, deve voltar ao WebGPU.
4. Comparar as bordas coloridas (HUD, textos vermelhos ou azuis) entre WebGL2 e WebGPU.
5. Exportar a medição das duas opções.

## Testes

- Node: 69 de 69.
- Playwright no Chromium com SwiftShader: painel e HUD 117, regressões de pixel 62, movimento 11, captura 27, equivalência WebGPU × WebGL2 26, integração do renderizador 24.
- No WebView do Poco F7: equivalência 26 de 26 e integração 24 de 24.
- A CI passa a rodar as suítes WebGPU com ANGLE e Vulkan no SwiftShader; sem isso, o SwiftShader não importa vídeo.
- O APK é assinado com a mesma chave de teste da série 9.x e instala por cima sem apagar dados. Esta build não foi instalada no Poco antes de publicar.

## Pendências

- Validação em partida real (v9.8.0 e v10.0.0).
- Entender os +1,8 ms/quadro do WebGPU no Poco: `shader-f16`, o canvas a mais na composição, a cópia do quadro antes do SGSR.
- Sessão a 30 FPS no Vostro.
- Variante compute da `spatial`: existe, mas está desligada por ser mais cara.
