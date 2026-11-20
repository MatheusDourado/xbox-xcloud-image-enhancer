# Análise v9.1 — "DLSS para streaming": até onde dá para ir

Relato do Poco F7 com a v9: o banding sumiu, mas a nitidez, mesmo no máximo, "não parece natural, não parece o console". Esta análise mede por quê e testa duas ideias no estilo DLSS. Usa a bancada da v9 (`docs/historico/analysis-v9.md`) e acrescenta medição em sequência de quadros.

## 1. Por que a nitidez não parece natural: cintilação

Nova métrica em `tools/eval/run_eval.py` (`sequence`): 18 quadros consecutivos passam pelo pipeline real. A **cintilação** é a variação de luma entre quadros que não existe na referência, ou seja, textura "fervilhando".

| | SSIM | Detalhe | Cintilação |
| --- | --- | --- | --- |
| Stream sem filtro | 0,947 | 0,71 | 3,65 |
| v9 (USM 3) | 0,935 | 0,98 | **4,49 (+23%)** |
| v9 com temporal 100% | 0,937 | 0,97 | 4,37 |

Toda nitidez amplifica o ruído do encoder, e esse ruído muda a cada quadro. Num console a textura fica parada; aqui ela tremula. Nitidez no máximo deixa isso pior.

## 2. Acumulação temporal (o ingrediente do DLSS/TAA): não ajuda no stream

Teste de teto teórico: alinhamos os quadros anteriores com o **movimento exato** (conhecido, porque a cena é gerada) e fizemos a média, como faz o DLSS.

| Cena | 1 quadro | 2 quadros | 4 quadros | 8 quadros |
| --- | --- | --- | --- | --- |
| Texturas | 37,2 dB | 34,9 | 34,0 | 33,6 |
| Sponza | 34,7 dB | 34,0 | 33,6 | 33,4 |
| Céu/HUD | 36,7 dB | 34,7 | 34,0 | 33,7 |

A média **piora**. Os quadros P do H.264 copiam os anteriores, então o erro é correlacionado no tempo e não se cancela. Além disso, reamostrar em subpixel borra. O DLSS funciona porque o jogo entrega amostras novas e independentes a cada quadro (jitter); o stream não entrega. No stream, o temporal só serve para estabilizar a imagem, não para recuperar detalhe.

## 3. Reconstrução neural (o que o RTX Video Super Resolution faz)

Rede convolucional pequena, treinada em JAX/CPU (`tools/nn/`):
- Pares "luma decodificada do H.264 a 8–25 Mbps → render limpo".
- 16 cenas com **57 texturas que não estão na avaliação**.
- Arquitetura `conv3×3(1→8) → ReLU → conv1×1(8→8) → ReLU → conv3×3(8→1)`, somada à luma. São cerca de 210 multiplicações por pixel e duas passagens WebGL2, com os pesos embutidos no shader (`tools/nn_glsl.py`). O shader confere com o modelo em JAX: diferença de até 1 nível, que é arredondamento.

O que foi testado:
- A rede maior (12 canais, campo 9×9) reduziu o erro 5,1% contra 2,8% da leve, mas custa cerca de 14× mais, e no pipeline completo não ganhou da leve.
- Dar mais peso ao detalhe no treino (perda de Laplaciano ×2 e ×5) **não** fez a rede gerar mais detalhe: ela continua em ~0,74. Com um único quadro, a rede só reconstrói o que dá para inferir com segurança; o resto foi apagado pelo encoder.

No pipeline completo (18 amostras, mesmo nível de detalhe ≈ 0,98):

| | SSIM | PSNR | Ruído | Halo | Cintilação |
| --- | --- | --- | --- | --- | --- |
| v9 | 0,930 | 33,95 | 1,43 | 0,75 | 4,49 |
| v9 + rede, USM 2,5, Detalhe 20% | 0,934 | 34,09 | 1,41 | 0,90 | 4,35 |
| Poco 1280p: v9 | 0,917 | 33,10 | 0,98 | 0,36 | — |
| Poco 1280p: v9 + rede, USM 2,5 | 0,917 | 33,13 | 0,98 | 0,45 | — |

Custo relativo (GPU emulada): **+31%**. O ganho é real mas pequeno, por isso a rede entra como **opção experimental desligada** ("Reconstrução neural"). Comparar no olho vale a pena: quando ligada, use Nitidez ~2,5.

## Conclusão

- A distância até o console, o Boosteroid ou o GeForce Now é a informação que o encoder do xCloud descarta: 15–20 Mbps contra 45–75 Mbps. Filtro de pós-processamento não recupera o que não chegou.
- O mais "natural" é **menos nitidez com o ruído limpo antes**, e não nitidez máxima. Para quem quer aparência de console, a sugestão é Nitidez 2–3. Os valores 6–10 aumentam halos e cintilação.
- Um ganho grande exigiria uma rede bem maior, que não cabe em tempo real na Iris Xe em WebGL. Talvez caiba no Poco F7 com WebGPU; fica como próximo passo, junto com estabilização temporal da nitidez.

## Reproduzir

```sh
python3 tools/nn/make_train_set.py <texturas de treino> 16   # output/nn/train.npz
python3 tools/nn/train.py restore 8 1 4000                      # src/nn/restore.json
python3 tools/nn/eval_nn.py restore                              # avaliação só da luma
python3 tools/build.py                                           # gera os shaders da rede
```
