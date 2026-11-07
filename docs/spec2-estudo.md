# Spec 2 — Estudo de eficiência de GPU

Registro da Spec 2 na branch `claude/specs-autonomas`, em 2026-11-06 e 07: upload real, MSAA, hipóteses 10.1 a 10.5, estudo externo 10.6 e ranking para a Spec 3. Nada em `src/`, `script.js` ou no APK mudou.

## Resumo

**Estado:** Spec 2 encerrada

**Conclusão:** o caminho padrão do Poco usa 16,8 ms de GPU por quadro em ritmo real, e não os cerca de 5 ms da rajada da Spec 1. A 60 FPS isso ocupa 88% da GPU. Um caminho candidato, com duas passadas, cai para 4,8 ms e 30% de ocupação a 60 FPS, com índice visual igual ou melhor. Falta validar em partida real.

| Poco F7, saída 1280p, H.264 real | Hoje | Candidato | Variação |
| --- | --- | --- | --- |
| GPU ativa por quadro, 30 FPS | 16,8 ms (50%) | 4,8 ms (14%) | −71% |
| GPU ativa por quadro, 60 FPS | 16,2 ms (88%) | 5,5 ms (30%) | −66% |
| Latência até a GPU terminar (fence p50), 30 FPS | 24,5 ms | 12,4 ms | −49% |
| Latência até a GPU terminar (fence p50), 60 FPS | 44 ms | 15 ms | −66% |
| Soma das passadas com GPU no máximo | 6,6 ms | 1,7 ms | −74% |
| Índice visual (seção Ganho visual) | referência | +0,74 ponto | melhor |

O candidato é `spatial` em `mediump` com constantes, sem Compressão e sem Detalhe, seguido de SGSR 1 sem `textureGather`. Foi medido com desenho direto no canvas, e "Hoje" com Fluidez, que custa cerca de 0,4 ms a mais.

**Prioridades do pedido**

1. **Upload de vídeo real:** custa pouco na GPU, cerca de 0,6 ms por quadro em ritmo real no Poco. Os 9 ms da Spec 1 não são o custo do upload: a mesma diferença aparece só em rajada, em que cada upload impede a GPU de encadear quadros (inferência sobre a causa). O custo que importa é 1,4 ms de CPU na thread principal.
2. **MSAA do canvas:** está ativo, com 4 amostras, mas custa perto de zero no Poco. No Vostro custa cerca de 0,7 ms por quadro.
3. **Hipóteses 10.1 a 10.5:** tabela em Hipóteses. As que mais renderam foram `mediump` e constantes. As refutadas foram `texSubImage2D`, `invalidateFramebuffer`, cache em Degradês e pular Detalhe na mesma passada.
4. **Estudo externo 10.6:** SGSR 1 é a técnica que vale portar agora. Medido aqui, custa 0,8–0,95 ms no lugar de 3,2 ms de EASU com nitidez.

**Descobertas que mudam o planejamento**

- **Custo em ms depende do clock.** A GPU fica em clock baixo com carga leve. A rajada mede a capacidade; a sessão real mede 3× mais tempo ocupado. O orçamento deve usar ocupação, não só ms.
- **`power/gpu_work_period` funciona no Poco.** Pelo Perfetto, dá tempo de GPU ativa por app sem cronômetro no WebView.
- **A 60 FPS o `<video>` perde cerca de 10% dos quadros mesmo com GPU folgada.** A margem de 10% da adaptação pode disparar à toa nesse caminho. A captura em Worker entregou 60,2 FPS.
- **A nitidez padrão passa do ponto neste clipe.** USM 3 dá 1,5× a energia de detalhe da referência; USM 2 melhora o índice sem custo.
- **Compressão não mostrou efeito mensurável**, nem a 100% em 5 Mb/s, e custa 0,4–0,5 ms com a GPU no máximo.

**Próximo passo:** Spec 3, na ordem do ranking abaixo. Primeiro passo de validação: comparar nitidez e SGSR numa partida real.

## Ranking para a Spec 3

Ordem de implementação por ganho visual dividido por custo de GPU no Poco. Item com custo zero ou negativo vem antes de qualquer item com custo positivo, ordenado por economia sem perda visual.

- **Δ GPU real:** tempo ativo por quadro a 30 FPS, saída 1280p.
- **Δ GPU topo:** soma com a GPU no máximo.
- **Δ visual:** pontos do índice, contra o padrão atual.
- **Base:** M = custo e ganho medidos. I = inferência em ao menos um dos dois.

| # | Melhoria | Δ GPU real | Δ GPU topo | Δ visual | Ganho/custo | Base |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Nitidez padrão de 3 para 2 | 0 | 0 | +1,22 | sem custo | M |
| 2 | `spatial` em `mediump` com variante por perfil | cerca de −3 ms | −1,2 ms | 0 | economia sem perda | M |
| 3 | Compressão desligada por padrão | −2,4 ms isolada | −0,4 ms | 0 | economia sem perda | M |
| 4 | Detalhe desligado com nitidez 2 | −3,3 ms isolada | −0,7 ms | −0,09 | 37 ms por ponto perdido | M |
| 5 | SGSR 20/1,0 no lugar de EASU e nitidez | −4,7 ms | −2,3 ms | −0,64 contra o item 1; +0,58 contra hoje | 7,4 ms por ponto perdido | M |
| 6 | Margem da adaptação por caminho, e captura direta a 60 FPS | 0 | 0 | evita redução indevida | sem custo | I |
| 7 | Render em Worker com OffscreenCanvas | 0 | 0 | fluidez: 25,9 → 29,5 FPS com thread ocupada | sem custo de GPU | M |
| 8 | Nitidez ou SGSR no `present`, sem a cópia da Fluidez | cerca de −1 ms | −0,4 ms | 0 | economia sem perda | I |
| 9 | `antialias:false` | 0 no Poco, −0,7 ms no Vostro | 0 | 0 | sem custo | M |
| 10 | Degradês de 30% para 60% | 0 | 0 | banding −11% contra o stream | sem custo | M |
| 11 | `desynchronized` só no Vostro, como opção | 0 no Poco, cerca de −1 ms no Vostro | 0 | ritmo: p95 50 → 34 ms no Vostro | a validar | M |
| 12 | Croma com CfL Lite | não medido | não medido | teto baixo: hoje +0,08 dB | desconhecido | I |

**Lista negativa, não implementar:** `texSubImage2D`, `invalidateFramebuffer` geral, máscara na mesma passada, troca de `texelFetch` por `texture`, Degradês com padrão rotacionado, RGBA16F no modo padrão, 120 Hz, reconstrução neural e temporal por padrão.

**Dois perfis para a Spec 3 decidir com captura real**

| Perfil | Passadas | 30 FPS | 60 FPS | Δ visual |
| --- | --- | --- | --- | --- |
| Fluido | `spatial` candidato, SGSR 20/1,0 | 4,8 ms, 14% | 5,5 ms, 30% | +0,74 |
| Qualidade | `spatial` `mediump`, EASU, USM 2 | 13,6 ms, 40% | 12,8 ms, 69% | +1,22 |

O perfil Qualidade não cabe em metade do intervalo a 60 FPS. A Spec 3 pode usar Fluido a 60 FPS e Qualidade a 30 FPS.

**Cuidados ao portar**

- O `casFiltered` também aplica dither e `finishColor`. Sem essa passada, o SGSR precisa absorver isso.
- O CI roda em SwiftShader, que ignora `mediump`. A regressão de pixel precisa rodar também no Adreno.
- Em `mediump`, 0,01% dos valores muda mais de 1 nível, com máximo de 79, por degraus de limiar na Cor nas bordas. A diferença média é 0,02 nível.
- Incluir o aviso BSD-3 do SGSR no userscript e no APK.

## Método

Tudo fica em `tools/device/spec2/` e os dados brutos em `docs/medicoes/spec2/`.

**Vídeo.** Sem ffmpeg, o clipe é codificado no Chrome do Vostro com WebCodecs, em H.264 Main e taxa constante:

| Clipe | Taxa | Conteúdo |
| --- | --- | --- |
| `game30` | 8,9 Mb/s, 0,143 bit/pixel, 1080p30 | fotos com câmera em movimento, partículas e HUD |
| `game60` | 15 Mb/s, 0,121 bit/pixel, 1080p60 | igual |
| `ceu9`, `ceu5` | 9 e 5 Mb/s, 1080p30 | céu liso sobre chão detalhado, para banding e blocos |

As imagens são papéis de parede do Windows, usados só localmente, e os vídeos ficam em `output/`, fora do Git. O Poco decodifica em hardware. Não é uma partida real.

**Três medidas**

| Nome | Como | Responde |
| --- | --- | --- |
| Rajada | quadro pausado, GPU aquecida antes de cada amostra, ordem sorteada, 40 repetições, 3 cenas, 3 rodadas | capacidade e comparação de variantes |
| Ao vivo | um quadro por `requestVideoFrameCallback`, com leitura de 1 px no fim | latência e CPU |
| Sessão | sem espera; desenho por rVFC, canvas na tela, Fluidez opcional | ocupação real |

Na sessão, o tempo vem de `power/gpu_work_period` no Poco, a cada cerca de 1 s por UID, e do contador `GPU Engine` no Vostro. **GPU por quadro** é a ocupação dividida pelo FPS. Inclui composição do navegador.

**Condições**

| Máquina | Ambiente | Condições |
| --- | --- | --- |
| Poco F7 | WebView 156 do app, em primeiro plano, 60 Hz, USB | bateria 25 → 19%, 32–42 °C, estado térmico 0 em toda a rodada |
| Vostro 3400 | Chrome 157, D3D11, janela maximizada em tela 1366×768 | na tomada, 100%; sem sensor térmico gravado |

Os JSON do Poco têm `before` e `after`, e a sessão longa tem amostra a cada 30 s. Na bancada do Vostro, as linhas com nome `1280` rodaram em 1920×1080. Para EASU a 1280p no Vostro, vale o número da Spec 1.

**Equivalência com o player de testes.** O `player/index.html` e a bancada dão o mesmo resultado, com `antialias:false` e saída nativa:

| Página | GPU por quadro | FPS |
| --- | --- | --- |
| `player/index.html` | 10,9 e 10,7 ms | 30,1 |
| Bancada | 11,1 e 11,2 ms | 30 |

A bancada existe porque o player não permite repetir cenários nem trocar `antialias`.

## Custo de clock: por que 5 ms viraram 16 ms

**Medido.** O mesmo caminho padrão, em 1280p, no Poco:

| Condição | Por quadro |
| --- | --- |
| Soma das passadas em rajada, sem upload | 6 ms |
| `render()` em rajada, sem upload | 6,0 ms |
| Sessão a 30 FPS, tempo ativo da GPU | 16,8 ms |
| Sessão com a carga repetida 4× no mesmo quadro | 6,5 ms por repetição |
| Sessão com a carga repetida 8× | 4,6 ms por repetição |

A hipótese de clock baixo foi testada de três formas:

| Teste | Resultado | Leitura |
| --- | --- | --- |
| Saturar e depois quadros a cada 33 ms | 6 ms no início, 8 ms aos 200 ms, 18 ms aos 800 ms | muda aos poucos, então é regulador e não cache frio |
| Repouso e depois rajada | 12,9 ms nos primeiros 100 ms, depois 4,9 ms | sobe em cerca de 100 ms |
| Quadros isolados sem saturar antes, intervalo de 0 a 100 ms | 17,7–18,3 ms em todos | sem saturar, o clock não sobe |

O Vostro repete o padrão com menos força: 2,8 ms em rajada, 6 ms espaçado.

O WebGPU não mudou isso: a mesma passada pesada deu 6,3 ms ativos por quadro em WebGL2 e em WebGPU. Com `timestamp-query`, a passada leva 3,87 ms espaçada e 2,82 ms sob carga.

**Inferência.** O regulador segura o clock enquanto a ocupação está abaixo de cerca de 90%. Não dá para separar clock da GPU e clock de memória, porque nenhum dos dois é legível (Lacunas). Consequências:

- 16,8 ms não é gargalo: há capacidade para cerca de 5 ms por quadro no clock alto.
- É latência real: o quadro leva 16 ms na GPU em vez de 5 ms.
- A 60 FPS o regulador ainda não sobe, com 88% de ocupação e fila de 44 ms até a GPU terminar. Essa fila pode explicar parte do que o Matheus sente como GPU no talo.
- Comparações em ms só valem na mesma condição. Variantes foram comparadas em rajada aquecida.

## Upload de quadro de vídeo

| Medida | Poco F7 | Vostro 3400 |
| --- | --- | --- |
| GPU ativa, só upload, sessão a 30 FPS | 0,5–0,6 ms | não isolado |
| Latência a mais, ao vivo, só upload | +2,8 ms | +1,0 ms |
| Latência a mais dentro do caminho padrão | +2,3 ms | +0,8 ms |
| CPU da thread principal, p50 e p95 | 1,4 e 2,4 ms | 0,1 e 0,3 ms |
| Rajada, só upload | 1,96 ms | 0,37 ms |
| `texSubImage2D` em textura imutável, rajada | 5,39 ms | 2,98 ms |
| `texSubImage2D`, ao vivo, tempo total | 14,1 ms | 4,8 ms |

- **Sem efeito:** flip Y, RGB em vez de RGBA, `UNPACK_COLORSPACE_CONVERSION` e `VideoFrame` em vez de `<video>`. Todos ficam dentro do ruído.
- **Pior:** `ImageBitmap`, com 3,9 ms no Poco e 2,2 ms no Vostro.
- **Canvas 2D:** 2,3 ms no Poco, parecido com vídeo. Isso responde à dúvida da Spec 1: canvas 2D representava o custo isolado razoavelmente.

**Os 9 ms da Spec 1.** O `render()` em rajada com upload a cada quadro dá 13,8 ms no Poco; sem upload, 6,0 ms. O upload sozinho dá 2 ms. Rodízio de saídas e duas texturas de entrada não mudaram os 13,8 ms. Em sessão real a diferença é 2,3 ms. A leitura é que o upload funciona como barreira, impedindo o encadeamento em rajada (inferência). Se for isso, o caminho atual tem limite prático perto de 72 quadros por segundo.

**WebGPU (entrada para a Spec 4).** `importExternalTexture` funciona nos dois aparelhos. Passada amostrando o quadro: 0,33 ms no Poco, contra 0,26 ms em textura comum, com resolução de 0,066 ms. O custo de CPU na importação foi 1,9 ms no Poco.

## MSAA do canvas

`antialias:true` está ativo nos dois: `gl.SAMPLES` é 4, e uma borda diagonal gerou níveis parciais (63, 127, 191), que não aparecem com `antialias:false`.

| Sessão, duas rodadas, canvas na tela | Sem MSAA | Com MSAA |
| --- | --- | --- |
| Poco, 1280p direto | 16,5 e 16,6 ms | 16,7 e 16,6 ms |
| Poco, 1280p com Fluidez | 16,8 e 17,1 ms | 17,0 e 17,1 ms |
| Poco, carga saturada ×8 | 22,6 e 22,9 FPS | 23,3 e 22,2 FPS |
| Vostro, 1080p direto | 6,3 e 6,7 ms | 7,1 e 7,4 ms |
| Vostro, 1080p com Fluidez | 6,9 e 7,1 ms | 7,5 e 7,6 ms |
| Vostro, 60 FPS | 6,4 e 6,8 ms | 7,3 e 7,4 ms |

**Poco:** custo dentro do ruído, até 0,2 ms. Em GPU por blocos, a resolução acontece no próprio bloco (inferência). **Vostro:** cerca de 0,7 ms por quadro. Como só há um triângulo de tela cheia, o MSAA não melhora a imagem, então desligar é seguro.

## Tabela de custos (seção 8)

Em 1080p. **Topo** é rajada com GPU no máximo, três rodadas. **Real** é sessão a 30 FPS, uma rodada. Filtros dentro do `spatial` são o acréscimo sobre o `spatial` vazio.

| Filtro | Poco topo (ms) | Poco real (ms) | Vostro topo (ms) | Vostro real (ms) | Ganho medido, contra o stream | Padrão |
| --- | --- | --- | --- | --- | --- | --- |
| Compressão | +0,42 a +0,51 | +2,4 | +0,20 a +0,26 | +0,9 | nenhum, nem a 100% em 5 Mb/s | ligado 50% |
| Degradês | +1,00 a +1,11 | +3,9 | +0,34 a +0,41 | +1,2 | banding −5%; −11% com 60%, −14% com 100% | ligado 30% |
| Cor nas bordas | +0,17 a +0,32 | +1,8 | +0,09 a +0,13 | +1,1 | croma +0,08 dB | ligado 75% |
| Detalhe | +0,76 a +0,88 | +3,3 | 0 a +0,02 | +1,9 | `detail` 0,67 → 0,71; com USM 3 só soma excesso | ligado 20% |
| Antialiasing | +0,34 a +0,47 | +2,0 | +0,07 a +0,10 | +1,0 | halo −71%, `detail` −0,11 | desligado |
| Temporal | sem rajada; +11,9 na Spec 1 | +8,3 | sem rajada; +3,6 na Spec 1 | +2,8 | cintilação 4,85 → 4,78 | desligado |
| FSR 1 EASU para 1280p | 2,01–2,08 | não isolado | 1,96–2,01 (Spec 1) | não aplicável | `detail` 0,42 → 0,53 contra esticar | automático |
| Nitidez USM 3 | 0,87–0,89; 1,17–1,23 em 1280p | não isolado | 0,85–0,91 | não isolado | `detail` 0,70 → 0,95, cintilação +27% | USM 3 |
| Reconstrução neural | 2,33–2,59 | +5,2 | 4,26–4,39 | +3,1 | `detail` igual, halo +18% | desligado |

Apoio: `spatial` vazio 0,62–0,72 (Poco) e 1,20–1,26 (Vostro); `spatial` padrão 2,87–2,95 e 1,96–2,15; cópia em 1080p 0,26–0,31 e 0,73–0,82; `present` em 1280p 0,38–0,41 no Poco.

**Filtros em conjunto**

| Conjunto, sessão a 30 FPS | Poco | Vostro |
| --- | --- | --- |
| Só upload, `spatial` vazio e nitidez | 3,95 ms | 4,16 ms |
| Padrão em 1080p | 11,5 ms | 7,3 ms |
| Padrão em 1280p | 16,8 ms | não aplicável |

Os valores de Poco topo substituem a Spec 1, que os mediu com imagem sintética e sem aquecimento. As faixas mudam pouco, salvo Degradês e Detalhe, que eram 0,84–0,94 e 0,44–0,76.

## Ganho visual

**Método.** `tools/eval` adaptado para dois clipes (`eval_gain.py`, `eval_gain2.py`), 3 quadros por cena, recorte central, contra a referência limpa e o stream sem filtro. Roda em SwiftShader, então `mediump` não aparece nessas métricas. Para isso há a comparação no Adreno, em `poco-diffs.json` e `poco-candidato-conferencia.json`.

**Índice visual.** `100·SSIM + 10·detail − 5·|energy − 1| − 2·halo`. É uma escolha deste estudo para ter um número único, não uma medida padrão. Dobrei cada peso para ver o efeito: USM 2 continua positivo em todos; o SGSR fica negativo só com peso dobrado em `detail`.

| 1280p, clipe `game30` | SSIM | PSNR | `detail` | `energy` | halo | Índice |
| --- | --- | --- | --- | --- | --- | --- |
| Stream esticado | 0,9220 | 36,02 | 0,424 | 0,37 | 0,005 | −3,78 |
| Filtros em 1080p, depois esticado | 0,9264 | 35,94 | 0,589 | 0,74 | 0,117 | −0,08 |
| Padrão, USM 3 | 0,9198 | 34,99 | 0,723 | 1,26 | 0,430 | 0 |
| USM 2 | 0,9233 | 35,49 | 0,668 | 1,04 | 0,267 | +1,22 |
| USM 1,5 | 0,9246 | 35,71 | 0,640 | 0,94 | 0,200 | +1,08 |
| RCAS 5 | 0,9239 | 35,73 | 0,620 | 0,92 | 0,156 | +0,82 |
| USM 2, sem Detalhe | 0,9246 | 35,75 | 0,643 | 0,95 | 0,224 | +1,13 |
| SGSR limiar 8, força 2 (original) | 0,9106 | 34,22 | 0,716 | 1,59 | 0,200 | −2,22 |
| SGSR 20/1,0 | 0,9195 | 35,33 | 0,634 | 1,08 | 0,130 | +0,58 |
| SGSR 20/1,0, sem Detalhe | 0,9195 | 35,50 | 0,611 | 0,99 | 0,098 | +0,74 |

**Cintilação em 1080p:** stream 3,77; USM 3 4,85; USM 2 4,42; USM 2 sem Detalhe 4,16; RCAS 3 4,00.

- **Energia acima de 1 é excesso.** Em 1080p, USM 3 chega a 1,52, com 2,5 dB a menos de PSNR que o stream. O v9 calibrou com outro conteúdo, então isso precisa de confirmação em captura real.
- **RCAS não é melhor que USM na mesma nitidez.** RCAS 5 fica perto de USM 1,5.
- **O limiar original do SGSR não serve para vídeo comprimido.** Com 8/255 ele realça artefato; 20/255 e força 1,0 funcionaram.
- **Degradês com padrão rotacionado:** igual ao atual.

## Hipóteses 10.1 a 10.5

Custo em rajada aquecida no Poco, salvo indicação.

### 10.1 Menos passadas e menos memória

| Hipótese | Resultado | Veredito |
| --- | --- | --- |
| Fundir filtros reduz custo | Cópia extra em 1080p custa +0,22 ms (Poco) e +0,5 ms (Vostro). USM fundido no `spatial`: +0,26 ms contra 0,88 ms da passada | **Parcial.** Fundir ajuda, mas a conta do shader pesa mais que a ida à memória no Poco |
| Ampliar só no fim | Já é assim. Filtros em 1080p com compositor perdem `detail` 0,72 → 0,59 | Confirmada |
| RGBA8 em vez de RGBA16F | Cópia em 1280p: 0,35 → 0,73 ms. `spatial`: igual no Poco, +0,15 ms no Vostro | **Confirmada** em passada de banda; manter RGBA8 |
| Alocar uma vez | Alvos já são reutilizados. Reusar a textura de entrada com `texSubImage2D` piora 2,7× | **Refutada** para o upload |
| `invalidateFramebuffer` ou `clear` | `present` 0,39 → 0,30 ms. EASU e nitidez sem ganho. Vostro piora 0,2 ms | **Refutada**, salvo cópia pura |

### 10.2 Shaders mais baratos

| Hipótese | Resultado | Veredito |
| --- | --- | --- |
| `mediump` | `spatial` 2,90 → 2,29 ms, nitidez 1,20 → 0,93 ms, SGSR 1,3 → 0,95 ms. Vostro sem efeito (saída idêntica) | **Confirmada** no Poco |
| Menos leituras, `textureGather` | Não existe em GLSL ES 3.00. `texture` no lugar de `texelFetch`: igual | Refutada no WebGL2 |
| Amostras distantes pesam em Degradês (achado 4) | Raio 2 e raio 8 custam igual, 1,71 ms | **Refutada.** A causa é outra, e `mediump` com constantes derrubou esse custo |
| Máscara e filtro só onde precisa | Pular Detalhe na mesma passada: 2,90 → 2,87 ms. Passada em ¼ de resolução: não testada | **Refutada** na forma testada; pendente em ¼ |
| Variantes por perfil | `spatial` 2,90 → 2,15 ms; com `mediump`, 1,73 ms; com o conjunto candidato, 0,81 ms | **Confirmada**, o maior ganho do estudo |
| Aquecer shaders | Motor inteiro frio: 326 ms (Poco) e 578 ms (Vostro), no início. Primeiro uso: +1,1 e +2,9 ms | **Baixo valor:** já compila tudo antes. Sem `KHR_parallel_shader_compile` no Poco |

### 10.3 Nada de travar a CPU

| Hipótese | Resultado | Veredito |
| --- | --- | --- |
| Sem espera síncrona | Sem `readPixels` e `finish` no quadro; `getError` só em 3 quadros da captura direta. Custo por quadro: `render()` 2 ms de CPU, quase todo upload | Confirmado por leitura de código e medida |
| Só quadro novo | rVFC com `token`; Fluidez apresenta só quadro novo | Confirmado por leitura de código |
| Atributos do contexto | `alpha` e `preserveDrawingBuffer` já desligados; `antialias` ligado | Ver MSAA |
| `desynchronized` | Poco: aceito, sem ganho, 60 FPS cai de 54,5 para 52 FPS. Vostro: −1 ms e ritmo p95 50 → 34 ms | **Só Vostro**, como opção; não avaliei tearing |
| Worker com OffscreenCanvas | Ver abaixo | **Confirmada** no Poco |

| Render, Poco | Main livre | Main ocupada | Worker livre | Worker ocupado |
| --- | --- | --- | --- | --- |
| 30 FPS: FPS | 30,0 | 25,9 | 30,1 | 29,5 |
| 30 FPS: intervalo p95 | 50,9 ms | 74,8 ms | 34,5 ms | 58,4 ms |
| 60 FPS: FPS | 56,8 | 45,9 | 60,2 | 50,7 |
| 60 FPS: intervalo p95 | 32,7 ms | 48,5 ms | 17,9 ms | 45,2 ms |

A thread ocupada simula tarefas de cerca de 30 ms a cada 120 ms. O Worker recebe `MediaStreamTrackProcessor` via `captureStream`, não uma trilha WebRTC. No Vostro, com thread ocupada, quase não houve ganho: 27,5 contra 27,9 FPS (causa não investigada).

### 10.4 Folga, calor e ritmo

**Sessão longa, 21 minutos cada, padrão com MSAA e Fluidez:**

| Medida | 30 FPS | 60 FPS |
| --- | --- | --- |
| GPU ocupada, início e fim | 51,6% e 51,6% | 88,6% e 87,1% |
| FPS desenhado | 29,96 | 54,31 |
| Quadros perdidos pelo `<video>` | 1 de 37.713 | 7.277 de 75.412 |
| Bateria, temperatura final | 38,8 °C | 42,1 °C |
| Carcaça, máximo | 42,4 °C | 46,3 °C |
| GPU, máximo | 56,2 °C | 61,4 °C |
| Estado térmico | 0 | 0 |

Não houve queda de desempenho em 21 minutos. A 60 FPS a temperatura ainda subia no fim, então um jogo mais longo pode mudar isso. Uma partida real soma rede e rádio.

| Hipótese | Resultado | Veredito |
| --- | --- | --- |
| Metade do intervalo para o tratamento | 30 FPS: hoje 50%, no limite. 60 FPS: hoje 88%, estoura; candidato 30% | **Confirmada** como regra, medindo ocupação |
| 4 ms a 60 FPS e 8 ms a 30 FPS | Em ms com GPU no máximo: hoje 6,6 ms; candidato 1,7 ms | **Vale só como ms de topo.** Em ms reais são 8,3 e 16,7 |
| Calor em sessão longa | Sem queda em 21 min | **Refutada** neste teste; sem jogo real |
| Casar a taxa da tela | O Poco só tem 60, 90 e 120 Hz. 30 Hz não existe. Em 120 Hz: mesma FPS, +1 ponto de ocupação | **Refutada:** manter 60 Hz |
| Adaptar por tendência | Ocupação não variou nas sessões. Fence p50 sobre o intervalo: 0,7 a 30 FPS e 2,6 a 60 FPS hoje; 0,4 e 0,9 no candidato | **Inferência:** usar fence acima de 1,5 intervalo por 3 janelas como aviso antecipado |

**Margem da adaptação (pendência da Spec 1).** A 60 FPS o `<video>` entregou 52–55 FPS, com a GPU a 41% ou a 88%, de modo que a perda não vem da GPU. Isso é 8–13% e cruza a margem de 10% do achado 1, com risco de cortar a saída sem motivo, e a redução é permanente. O dado vem de arquivo, não de WebRTC: a v9.6.1 registrou cerca de 2% em stream real. A 30 FPS a perda é 0,1%. A Spec 3 deve subir a margem do caminho `<video>` ou usar captura direta a 60 FPS.

### 10.5 Medir de verdade na Adreno

| Item | Resultado |
| --- | --- |
| Tempo de GPU | **Obtido.** `power/gpu_work_period` no Perfetto, por UID, a cada ~0,93 s. Só o app aparece, então o SurfaceFlinger não usa GPU aqui |
| Clock por quadro | **Não obtido.** `/sys/class/kgsl` e `/sys/kernel/gpu` sem permissão; `power/gpu_frequency` sem eventos; `clk_set_rate` mostra só `gpu_cc_gmu` a 650 MHz, sem o clock do núcleo |
| Banda de memória | **Não obtida.** Eventos `kgsl/*`, `devfreq/*` e `interconnect/*` não existem para o Perfetto no aparelho; `power_rails` veio vazio |
| Android GPU Inspector, Snapdragon Profiler | **Não testados.** Não estão instalados e o documento não autoriza baixar. O Perfetto não lista `gpu.counters` nem `gpu.renderstages`, então o AGI pode não ter contadores aqui (inferência) |
| Linha do tempo | **Parcial.** Frame timeline e atrace funcionam; config em `tools/device/spec2/perfetto-linha-do-tempo.pbtx` |
| Cada filtro isolado e em conjunto | Feito, ver Tabela de custos |

**Linha do tempo, sessão de 15 s.** O layer do app teve 1 quadro com `app_deadline` em 964 a 30 FPS e 3 em 907 a 60 FPS; o resto é `buffer_stuffing` ou sem atraso. Só contei categorias: `tools/device/spec2/pftrace.py` lê o Perfetto sem `trace_processor`, e as travadas individuais não foram analisadas.

## Estudo externo (seção 10.6)

Pesquisa com fontes primárias feita em subagente, revisada aqui. Conferi o shader do SGSR 1 linha a linha contra o protótipo, e as licenças de SGSR, FSR, libplacebo, NIS e Anime4K em seus arquivos. Custo **publicado** veio da fonte; **medido** é deste estudo; **estimativa** é inferência. Sem número publicado para Adreno 825.

| Técnica | Melhora | Custo | Cabe em passada fundida | Licença | Vale portar |
| --- | --- | --- | --- | --- | --- |
| [SGSR 1](https://github.com/SnapdragonStudios/snapdragon-gsr) | Escala e nitidez em 1 passada, 12 amostras; não trata blocos nem croma | **Medido:** 0,8–0,95 ms em 1280p. Publicado: 0,29 ms, SD 8 Gen 2, entrada 1240×576 | Funde escala e nitidez; não funde com `spatial` | [BSD-3-Clause](https://raw.githubusercontent.com/SnapdragonStudios/snapdragon-gsr/main/LICENSE) | **Sim**, sem gather |
| SGSR 2 | Temporal | Publicado: 0,9 ms, SD 8 Gen 3 | Não | BSD-3-Clause | Não: exige profundidade e vetores |
| [libplacebo](https://libplacebo.org/options/) e mpv, deband | Banding; não remove bloco forte | 1 + 4 leituras por iteração; sem ms publicado | Sim | [LGPL-2.1](https://raw.githubusercontent.com/haasn/libplacebo/master/LICENSE); [`vf_deband`](https://raw.githubusercontent.com/FFmpeg/FFmpeg/master/libavfilter/vf_deband.c) e [`Deband.fx`](https://raw.githubusercontent.com/crosire/reshade-shaders/slim/Shaders/Deband.fx) com aviso MIT | Só a ideia. Padrão rotacionado testado aqui: sem ganho |
| Deband por máscara | Não encontrado nas opções de libplacebo e mpv | — | — | — | Não |
| Escaladores polares (`ewa_lanczos`) | Nitidez de escala; pode realçar artefato | Estimativa: cerca de 33 leituras | Não | LGPL-2.1 | Não |
| [CfL Lite](https://github.com/Artoriuz/glsl-chroma-from-luma-prediction) | Croma 4:2:0 | 25 leituras sem gather; sem ms | Sim, com amostra bilinear (estimativa) | [MIT](https://raw.githubusercontent.com/Artoriuz/glsl-chroma-from-luma-prediction/main/LICENSE) | Experimento, depois do ranking |
| [Anime4K](https://github.com/bloc97/Anime4K) | Traço de anime | 4–5 passadas; estimativa acima de 8 ms | Não | [MIT](https://raw.githubusercontent.com/bloc97/Anime4K/master/LICENSE) | Não |
| [FSRCNNX](https://github.com/igv/FSRCNN-TensorFlow) | Luma ×2 | 14 passadas; estimativa cerca de 14× a rede atual | Não | LGPL-3.0+ no shader | Não; só a ideia de treinar com artefato |
| ArtCNN | Luma, croma, JPEG | Compute; sem ms | Não | [MIT](https://raw.githubusercontent.com/Artoriuz/ArtCNN/main/LICENSE) | Só em WebGPU, se couber |
| [FSR 1 EASU](https://github.com/GPUOpen-Effects/FidelityFX-FSR) | Escala | **Medido:** 2,01–2,08 ms. Publicado: até 0,2 ms em 1440p, RX 6800 XT | Não | [MIT](https://raw.githubusercontent.com/GPUOpen-Effects/FidelityFX-FSR/master/license.txt) | Já portado; manter no perfil Qualidade |
| FSR 1 RCAS | Nitidez | **Medido:** 1,4 ms em 1280p | Não, precisa de vizinhos | MIT | Já portado; sem vantagem sobre USM |
| [CAS](https://github.com/GPUOpen-Effects/FidelityFX-CAS) | Nitidez | 5 leituras; sem ms | Não | MIT no cabeçalho | Já portado; CAS 3 teve o pior índice |
| [NVIDIA Image Scaling](https://github.com/NVIDIAGameWorks/NVIDIAImageScaling) | Escala e nitidez em 1 passada | Sem ms; depende de compute | Não em fragment | [MIT](https://raw.githubusercontent.com/NVIDIAGameWorks/NVIDIAImageScaling/main/licence.txt) | Só em WebGPU, contra SGSR |

**Impacto de licença.** BSD e MIT exigem manter avisos no userscript e no APK. LGPL e GPL não entram no bundle: de libplacebo, mpv e FSRCNNX só reimplementar a ideia. Nada no ranking depende de código LGPL ou GPL. Não é parecer jurídico.

**Não verificado na pesquisa:** custo publicado de CAS, NIS, Anime4K, FSRCNNX e ArtCNN; saída exata das medições do SGSR 1; páginas da Qualcomm, que vieram vazias; texto normativo de `textureGather` no WGSL.

## Registro de decisões e problemas

- **Tela ligada:** nenhuma configuração do sistema foi alterada. `stay_on_while_plugged_in` e `screen_off_timeout` continuam como estavam, porque mudar configuração do aparelho não é algo que eu deva fazer sem o Matheus. O app já mantém a tela: `FLAG_KEEP_SCREEN_ON` no código, e `SCREEN_BRIGHT_WAKE_LOCK` em nome do app no `dumpsys power`. As sessões de 21 minutos terminaram sem a tela apagar.
- **Bancada no WebView:** o app recusa HTTP sem TLS, então o CDP serve a bancada em `https://bench.invalid`. O app não muda.
- **Sensores:** as primeiras medições gravaram `cpu0` e `gpu` da lista em cache do `thermalservice`. Só `poco-carga.json` permanece com esse campo (`gpuC`) inválido, e `tempC`, `level` e `thermal` estão corretos nele. As demais foram refeitas.
- **Alvo 16F:** a primeira rodada do Vostro deu `glError` 1282 e 0,017 ms, porque `readPixels` em RGBA8 não funciona em alvo float. Corrigido e refeito, com `glError` 0.
- **Rajada sem aquecimento:** as primeiras rodadas dependiam do caso anterior (`spatialPadrao` 3,3 contra 2,3 ms), porque o clock ainda subia. Todas foram refeitas com aquecimento e ordem sorteada.
- **`render()` apaga alvos:** alvos sem prefixo `paced` são removidos, o que invalidou as primeiras rodadas ao vivo de upload. Corrigido e refeito.
- **Pausa térmica:** depois da sessão a 60 FPS, a 42,1 °C, pausei 6 minutos antes da última rodada. A proteção automática (45 °C, estado térmico 3 ou bateria 10%) não disparou.
- **Taxa de 120 Hz:** alterei a preferência do app só no teste, por `BxAndroid.setRefreshRate`, e devolvi a 60.
- **Estado final do Poco:** WebView de volta em `https://www.xbox.com/pt-BR/play`, 60 Hz, bateria 19%, 39,4 °C, `adb forward` e `reverse` removidos, traces da rodada apagados.
- **JSON exportado:** `Downloads/xCloud ImageFilter` não existe no aparelho. A leitura fica pendente de uma partida real.

## Testes

Só `tools/device/spec2/` e `docs/` mudaram; o bundle gerado é o mesmo.

| Suíte | Resultado |
| --- | --- |
| Node | 50 de 50 |
| `regressions-v7`, Chrome 157 | passou, 43 |
| `motion-quality`, Chrome 157 | passou, 11 |
| `capture-harness`, Chrome 157 | passou, 26 |
| `filter-harness`, Chrome 157 | falhou em `Cut rejects old dark history`, a mesma falha da Spec 1 |

Chromium do Playwright indisponível: o pacote local é 1.64 e pede um navegador não instalado. No Windows, é preciso rodar com `PYTHONUTF8=1`.

## Lacunas

- **xCloud real:** nada aqui rodou numa partida. Falta validar nitidez, SGSR e a adaptação, com o Matheus jogando.
- **Conteúdo:** clipe sintético de fotos, codificado por hardware Intel. O encoder do xCloud é outro, e os ganhos de Compressão, Degradês e nitidez podem mudar. A conclusão de que Compressão não atua vale para estes clipes.
- **Clock e banda:** não legíveis no aparelho. A leitura de clock vem do comportamento no tempo.
- **`coolGpu`:** o HAL mostrou nível 3 de resfriamento da GPU o tempo todo, inclusive parado, com estado térmico 0. Não sei o que limita; o "topo" pode estar abaixo do máximo real da Adreno 825.
- **Android GPU Inspector e Snapdragon Profiler:** pendentes de autorização para instalar.
- **Candidato com Fluidez:** medido só em desenho direto; falta somar o `present` ou mover a última passada para ele.
- **Cintilação do SGSR:** não medida, porque as sequências existem só em 1080p.
- **`mediump` nas métricas visuais:** o índice roda em SwiftShader. No Adreno só há distância de pixels.
- **CfL Lite e máscara em ¼ de resolução:** não prototipados.
- **Worker no Vostro:** sem ganho com a thread ocupada, sem causa investigada.
- **60 FPS em WebRTC:** a perda do `<video>` foi medida com arquivo.
- **Vostro na TV:** medido em tela 1366×768, sem HDMI 1080p; composição pode custar mais na TV.
- **Testes:** `capture-harness` instável e limite de `filter-harness` calibrado só para SwiftShader seguem como na Spec 1.
