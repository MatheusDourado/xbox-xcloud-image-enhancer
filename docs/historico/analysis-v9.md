# Análise objetiva v9 — 2026-10-10

Objetivo: ajustar o pós-processamento com medição, e não no olho, para os dois cenários de uso:

- **Dell Vostro 3400 (Iris Xe, Chrome)**: stream 1080p, HDMI 1080p para TV 4K. O vídeo é exibido em 1080p.
- **Poco F7 (app Android v9)**: stream 1080p numa tela de 1220–1280 px de altura. O vídeo é ampliado para a tela.

## Bancada (`tools/eval/`)

1. **Referências limpas** em 1440p (`make_eval_set.py`): três cenas com câmera em movimento (pan, zoom lento e partículas rápidas).
   - Texturas de jogo de 2048 px (Khronos glTF-Sample-Assets: FlightHelmet e DamagedHelmet, CC-BY 4.0).
   - Texturas do Sponza.
   - Céu em degradê com nuvens, foto e HUD (texto branco e colorido, barras, linhas finas).
2. **Referência do Dell** = Lanczos para 1920×1080. **Referência do Poco** = Lanczos para 2276×1280.
3. **Stream tipo xCloud**: x264 `veryfast`, `zerolatency`, sem B-frames, 4:2:0 BT.709 com faixa limitada, CBR de 10, 15 e 20 Mbps. Decodificado com croma bilinear, como no navegador. O PSNR-Y do stream fica entre 33 e 39 dB, a faixa típica de jogo em streaming. Na primeira tentativa, só com pan, ficou entre 40 e 48 dB e foi descartada por ser limpa demais.
4. **Pipeline real**: os shaders WebGL2 do userscript rodando no Chromium (`run_eval.py`). São 18 amostras (3 cenas × 3 bitrates × 2 quadros P), em recortes centrais de 864×486 que correspondem exatamente a 1024×576 em 1280p.
5. **Métricas, em relação à referência limpa:**
   - SSIM-Y.
   - PSNR-Y e PSNR de croma.
   - **Detalhe**: ganho do passa-alta correlacionado com a referência; 1,0 equivale à nitidez do render limpo.
   - **Energia**: passa-alta total da saída dividido pelo da referência. O que passa do detalhe é ruído ou artefato amplificado.
   - **Halo**: overshoot além da faixa 3×3 da referência em bordas fortes.

**Critério**: nitidez igual à do jogo original (Detalhe ≥ 0,97) com a maior fidelidade (SSIM), usando o croma para desempate. Nitidez sozinha aumenta o detalhe, mas também o ruído do encoder; sem a restrição de detalhe, a métrica escolheria "sem nitidez".

## Resultados — Dell (1080p nativo)

Média das 18 amostras:

| Configuração | SSIM | Detalhe | Energia | Halo | Croma dB |
| --- | --- | --- | --- | --- | --- |
| Stream sem filtro | 0,942 | 0,71 | 0,71 | 0,08 | 33,23 |
| CAS 2 puro (Better xCloud) | 0,892 | 1,19 | 2,36 | 3,06 | 33,12 |
| v8.6 padrão (CAS 2) | 0,909 | 1,00 | 1,68 | 0,80 | 33,49 |
| v8.6 com Detalhe 20% (detalhe 0,98) | 0,913 | 0,98 | 1,60 | 0,70 | 33,49 |
| **v9 padrão (USM 3, luma, piso 4)** | **0,930** | 0,97 | 1,43 | 0,75 | **33,65** |

Com a mesma nitidez, a v9 tem SSIM cerca de 0,017 maior, 11% menos ruído amplificado e cor mais fiel.

O que a busca por coordenadas (`search.py`) e as variações mostraram:

- **USM supera CAS e RCAS** com detalhe igual: USM 3 deu SSIM 0,931 com detalhe 0,971; CAS 2 deu 0,917 com 0,972; RCAS precisa de intensidade 10 para chegar a 0,99 e fica com 0,912.
- **Nitidez só na luma**: mesmo SSIM e +0,21 dB de croma. Não amplifica os blocos de cor do 4:2:0. Num degrau colorido, o desvio de cor foi de 0 nível, contra 9 em RGB.
- **Piso de ruído** do limitador (diferenças locais menores que N níveis não recebem nitidez): 1 → 4 deu +0,0015 de SSIM com o mesmo detalhe. Acima de 6, o detalhe cai.
- **Detalhe** 20% é melhor que 35%: SSIM 0,932 contra 0,928 com detalhe ≥ 0,97.
- **Cor nas bordas** 75%: melhor croma e SSIM que 50%. **Compressão** 35–100% quase não muda nada a esses bitrates; ficou em 50%.
- **Antialiasing** 25–50% reduz detalhe (0,93 e 0,88) e só é bom para quem prioriza bordas suaves. Fica desligado.
- **Degradês**: o x264 a 10–20 Mbps não reproduziu o banding desta cena (as nuvens atuam como dither), então a métrica não viu ganho (SSIM −0,002). Mantido em 30% pela melhora observada no Dell. Uma cena específica de banding fica para depois.

## Resultados — Poco F7 (tela de 1280 px)

| Caminho | SSIM | Detalhe | Energia | Halo |
| --- | --- | --- | --- | --- |
| Stream esticado pelo navegador | 0,913 | 0,39 | 0,31 | 0,01 |
| v8.6 em 1080p, esticado pelo navegador | 0,913 | 0,54 | 0,64 | 0,09 |
| v9 em 1080p, esticado pelo navegador | 0,921 | 0,53 | 0,58 | 0,09 |
| **v9 FSR → 1280p, USM 2** | 0,920 | 0,63 | 0,83 | 0,23 |
| **v9 FSR → 1280p, USM 3 (padrão)** | 0,917 | 0,67 | 0,98 | 0,36 |
| v9 FSR → 1280p, CAS 3 | 0,898 | 0,73 | 1,42 | 0,56 |

Quando o navegador estica o canvas de 1080p para a tela, a interpolação bilinear vem depois da nitidez e apaga parte dela. Renderizar na altura real do vídeo na tela (FSR EASU + USM no tamanho final) dá **+19% a +27% de detalhe** com SSIM praticamente igual, e supera a v8.6 nas duas métricas. Por isso a saída **Automática** passou a usar a altura física do vídeo na tela (`getBoundingClientRect × devicePixelRatio`, em degraus de 8 px, até 2160p). Com HDMI 1080p ou janela menor, fica nativa. A referência em 1280p tem mais detalhe do que um stream 1080p consegue carregar, então nenhum caminho chega a 1,0.

## Custo

GPU emulada em CPU (SwiftShader), só como valor relativo: v9 em 1080p custa +3% em relação à v8.6; FSR para 1280p custa +38%, porque são 1,4× mais pixels mais a passagem do EASU. O Dell continua no caminho de 1080p. Os tempos reais na Iris Xe e na Adreno 825 precisam ser medidos com **Iniciar/Encerrar medição**.

## Limitações

- Conteúdo sintético montado com texturas reais, não gameplay. O encoder é o x264, não o de hardware do xCloud.
- SSIM e PSNR não medem preferência pessoal de nitidez. A Nitidez continua ajustável de 0 a 10.
- Banding não reproduzido; ver Degradês.

## Reproduzir

```sh
pip install playwright numpy pillow   # Chromium já instalado; ffmpeg com libx264
python3 tools/eval/make_eval_set.py <pasta com as texturas>
python3 -m http.server 8765 --bind 127.0.0.1 &
python3 tools/eval/search.py 1080 > output/eval/search-1080.log
```

Texturas usadas: em `KhronosGroup/glTF-Sample-Assets/Models`, os arquivos `FlightHelmet/glTF/*BaseColor.png` (LeatherParts, RubberWood, MetalParts), `DamagedHelmet/glTF/Default_albedo.jpg` e seis texturas `Sponza/glTF/*.jpg`; em `opencv/opencv/samples/data`, `starry_night.jpg` e `building.jpg`. Os arquivos gerados ficam em `output/eval/`, que é ignorado pelo Git.
