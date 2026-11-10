# xCloud Enhanced

Tratamento de imagem na GPU e stream em 1080p para o Xbox Cloud Gaming. Funciona no site antigo (`www.xbox.com/play`, sobre o [Better xCloud](https://github.com/redphx/better-xcloud) 6.7.12) e no site novo (`play.xbox.com`), no navegador com Tampermonkey e num app Android próprio.

Projeto **não oficial**, sem vínculo com a Microsoft nem com o Better xCloud.

**Versão atual: v10.1.1.** Veja [notas da v10.1.1](docs/release-v10.1.1.md) e baixe em [Releases](https://github.com/MatheusDourado/xbox-xcloud-image-enhancer/releases/latest).

## O que faz

- **1080p no play.xbox.com.** No celular, o site novo pede 720p com H.264 *Baseline*. O xCloud Enhanced pede 1080p: o servidor responde H.264 *Main*, e o bitrate vai de ~6 para ~12 Mb/s.
- **Impedir queda de resolução.** Sem isso, o servidor volta a 720p em ~15 s, porque o site informa o tempo de decodificação do aparelho. Para o site, o app informa 8 ms. O tratamento e a medição continuam lendo o valor real.
- **Tratamento na GPU** (WebGL2, com WebGPU opcional):
  - limpeza de compressão, Degradês (debanding), Cor nas bordas (croma 4:2:0) e Detalhe;
  - Nitidez USM/CAS/RCAS;
  - ampliação FSR 1 EASU ou SGSR;
  - antialiasing, estabilidade em movimento e reconstrução neural, todos opcionais.
- **Fluidez:** cada quadro é tratado ao chegar e exibido num ritmo constante. Há também captura direta do decodificador.
- **HUD durante o jogo:** bitrate, decodificação, RTT, frametime e custo de GPU.
- **Medição exportável** (JSON, schema 3): segmentos por configuração, passes que rodaram, séries de CPU, folga e pipeline, e eventos datados.
- **Botão flutuante "xCloud Enhanced"** no play.xbox.com: arrastável, com a posição salva e fora do menu do Xbox. O painel fecha ao tocar fora. Atalho **Alt+Shift+F**.

## Instalar

### Android

1. Baixe `xcloud-imagefilter-10.1.1.apk` em [Releases](https://github.com/MatheusDourado/xbox-xcloud-image-enhancer/releases/latest) e instale. O APK não vem da Play Store, então o Android vai pedir para permitir a instalação.
2. Abra **xCloud Enhanced** (ícone de nuvem com controle). É um app WebView que abre o xCloud com os dois scripts já carregados.

Detalhes em [android/README.md](android/README.md).

### Navegador (Tampermonkey)

| Site | Script |
| --- | --- |
| `play.xbox.com` (site novo) | `xcloud-image-filter-play.user.js` |
| `www.xbox.com/play` (site antigo) | `better-xcloud-image-filter.user.js` (já inclui o Better xCloud 6.7.12; desative outras cópias do Better xCloud) |

A Microsoft decide, a cada acesso, se `www.xbox.com/play` fica no site antigo ou redireciona para o novo. Instale os dois scripts.

- **No site antigo**, o painel fica no menu do Better xCloud, em Vídeo → **Tratamento de imagem**. A resolução vem do Better xCloud: use **1080p** e ligue **Impedir queda de resolução**.
- **No site novo**, o painel abre pelo botão **xCloud Enhanced**. A resolução e o anti-queda ficam em **Desempenho e rede** e valem a partir do próximo jogo.

## Configuração recomendada

Valem para o Poco F7 (Snapdragon 8s Gen 4, HyperOS), medido em [docs/medicoes/poco-nfs-2026-11-09](docs/medicoes/poco-nfs-2026-11-09/CONCLUSOES.md). Devem servir de ponto de partida para outros aparelhos.

- **Tela em 60 Hz** (Configurações → Tela) **antes** de abrir jogos a 60 FPS.
  - A 120 Hz, a decodificação vai de ~9 para ~25 ms e a latência local de ~21 para ~47 ms.
  - A opção "Taxa da tela" do painel ainda não troca o painel no HyperOS.
  - Sair do app para as Configurações durante o jogo derruba o stream.
- **Resolução do stream: 1080p**, com **Impedir queda de resolução**. O "1080p HQ" deu o mesmo stream, e o xCloud não aceita H.264 High.
- **Renderizador: WebGL2.** No Adreno ele gastou ~2,3 ms a menos de GPU que o WebGPU, com a mesma latência.
- **Fluidez: Equilibrada.** O frametime fica mais regular por ~4 ms de espera.
- **Saída: Auto.** O SGSR custa ~0,5 ms a mais que a Nativa e melhora o ritmo.
- **Reconstrução neural:** custa ~5 ms de GPU em 1080p. Cabe a 30 e a 60 FPS com o aparelho frio; desligue se esquentar ou engasgar.
- **RTT inicial acima de ~50 ms:** saia e entre de novo na fila. Na mesma região, um servidor deu 24 ms e outro 73 ms.

## Controles

| Controle | Efeito |
| --- | --- |
| Resolução do stream (play.xbox.com) | Auto, 1080p (padrão; o app se apresenta como Windows) ou 1080p HQ (como TV Samsung). Vale no próximo jogo. |
| Impedir queda de resolução (play.xbox.com) | Ligado por padrão. O site informa 8 ms de decodificação ao servidor; o app mostra o valor real no aviso. |
| Nitidez | 0–10 (passo 0,5). USM só na luma, CAS ou RCAS, aplicada depois do tratamento e da ampliação, com limite de halo proporcional. |
| Compressão | Suaviza degraus de bloco em áreas lisas; protege bordas e textura. Pouco efeito acima de ~10 Mb/s. |
| Degradês | Remove faixas (banding) com até 8 px de amostragem, preservando a textura fina, com dithering na quantização. |
| Cor nas bordas | Reconstrói a cor 4:2:0 guiada pela luma nas bordas. |
| Detalhe | Realce de textura fina só na luma, com coring contra o ruído do encoder. Realça as mesmas frequências que a Nitidez: o excesso vira halo e cintilação. |
| Reconstrução neural | Rede pequena antes do tratamento espacial (só WebGL2). Qualquer valor acima de 0 custa o mesmo. |
| Estabilidade em movimento | Temporal experimental com busca de movimento; rejeita histórico ruim e cortes. |
| Antialiasing | Suavização direcional de bordas antes da ampliação. Comece em 0–25%. |
| Resolução de saída | Auto (altura física do vídeo na tela), Nativa, 1440p ou 2160p. Escalador EASU ou SGSR. |
| Fluidez / Captura | Desligada, Equilibrada ou Máxima; origem pelo elemento de vídeo ou direto do decodificador. |
| Aliviar GPU | Reduz etapas acima de 3, 6 (padrão) ou 10 ms; **Nunca** mantém tudo. |
| Renderizador | Auto (WebGL2), WebGL2 ou WebGPU (experimental, volta sozinho para o WebGL2). |
| Comparação | Tratada, só nitidez (referência) ou vídeo original. |

**Valores iniciais:** Nitidez 2, Degradês 60%, Cor nas bordas 75%; Compressão, Detalhe, temporal, antialiasing e rede neural desligados; saída Auto com EASU; Aliviar GPU em 6 ms; Fluidez desligada; stream 1080p com anti-queda.

**Perfis prontos:** Natural (padrão), Console, Nítido, Bitrate baixo, Leve e Padrão v9. **Restaurar tratamento** volta aos padrões e mantém o HUD.

A API do painel e o formato da medição estão em [docs/api-imagefilter.md](docs/api-imagefilter.md).

## Desempenho e limites

- O painel mostra a GPU no p95. No WebGL2 do Android não há cronômetro de GPU: o valor vem de *fence*, que é um limite superior. No Poco ele superestima ~1,8× o tempo real. Para medir de verdade, use o Perfetto (`gpu_work_period`); veja [docs/proxima-sessao-testes-poco.md](docs/proxima-sessao-testes-poco.md).
- Acima do limite de "Aliviar GPU", o app desliga etapas nesta ordem: temporal, saída ampliada, AA, rede neural, degradês, compressão, detalhe e cor. As preferências salvas não mudam, e o painel mostra o que está efetivo.
- O tratamento não controla o bitrate do servidor nem recupera detalhes que a compressão descartou.
- O 1080p e o anti-queda dependem do comportamento atual do site (`/v5/sessions/cloud/play`, `x-ms-device-info`, `WebRtcStreamV1`) e podem parar de funcionar se a Microsoft mudar o site.

## Desenvolvimento

```sh
python3 tools/build.py
node --test tests/engine.test.cjs tests/filter.test.cjs tests/play.test.cjs tests/playback.test.cjs
python3 tools/run-browser-tests.py
```

- `src/`: motor (`restoration-engine.js`), adaptador (`image-filter.js`), painel, HUD, host e prelude do play.xbox.com (`src/play/`), shaders e WebGPU.
- `tools/build.py` gera `better-xcloud-image-filter.user.js`, `xcloud-image-filter-play.user.js` e `output/restoration.bundle.js`.
- `android/`: app WebView. O build está em [android/README.md](android/README.md).
- **Player de teste:** com `python3 -m http.server 8765 --bind 127.0.0.1`, abra `http://127.0.0.1:8765/player/` para comparar os modos sobre um vídeo local com o mesmo motor. `tools/make-test-videos.py` gera vídeos de teste (precisa do FFmpeg com libx264).
- **Testes no aparelho:** ferramentas e roteiro em `tools/device/` e em [docs/medicoes/poco-nfs-2026-11-09/scripts](docs/medicoes/poco-nfs-2026-11-09/scripts).

## Próxima versão

Prioridades em [docs/proxima-build.md](docs/proxima-build.md):
1. travar a tela em 60 Hz de verdade;
2. parar a composição sem quadro novo;
3. avisos de servidor distante e de limitação térmica;
4. rede neural e renderizador automáticos pela GPU real;
5. painel em inglês.

## Histórico

| Versão | Destaques |
| --- | --- |
| [v10.1.1](docs/release-v10.1.1.md) | 1080p e anti-queda no play.xbox.com; nome, ícone e widget xCloud Enhanced; HUD estável; primeiros testes ao vivo no Poco |
| [v10.1.0](docs/release-v10.1.0.md) | Correções da auditoria do play.xbox.com, avisos da rede neural, medição schema 3 |
| [v10.0.0](docs/release-v10.0.0.md) | Renderizador WebGPU opcional (Specs 1–4) |
| [v9.8.0](docs/release-v9.8.0.md) | Menos GPU no Poco: padrões novos, `mediump`, SGSR |
| [v9.7.1](docs/release-v9.7.1.md) · [v9.7](docs/release-v9.7.md) | Adaptação sem QP, captura direta, perfis, painel e HUD novos |
| [v9.6.1](docs/release-v9.6.1.md) · [v9.6](docs/release-v9.6.md) | Fluidez (ritmo constante na exibição) |
| [v9.5.1](docs/release-v9.5.1.md) · [v9.4](docs/release-v9.4.md) · [v9.3](docs/release-v9.3.md) · [v9.2](docs/release-v9.2.md) | Suavidade, latência por etapa, testes de codec, decodificação por hardware |
| [v9.1](docs/analysis-v9.1.md) · [v9](docs/analysis-v9.md) | Reconstrução neural; padrões por medição objetiva |
| [v8.6](docs/validation-v8.6.md) · [v8.5](docs/validation-v8.5.md) · [v8](docs/validation-v8.md) | Nitidez no painel, Cor nas bordas, Detalhe, RCAS, limpeza seletiva |
| [v3–v7](docs/validation-v3.md) | Motor WebGL2 em duas passagens, degradês, temporal e FSR 1 |

## Fontes e licenças

- Better xCloud: https://github.com/redphx/better-xcloud — MIT, redphx. A build do site antigo reutiliza a versão 6.7.12 (`script.js`, preservado).
- FSR 1: https://github.com/GPUOpen-Effects/FidelityFX-FSR — MIT, AMD. Fonte original em `src/vendor/ffx_fsr1.h`; port GLSL em `src/shaders/easu.glsl`, com a licença preservada.
- libplacebo: https://github.com/haasn/libplacebo — referência conceitual do debanding; nenhum código foi copiado.
