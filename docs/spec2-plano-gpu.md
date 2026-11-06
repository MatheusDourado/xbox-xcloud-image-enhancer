# Spec 2 — Plano de eficiência de GPU (ranking)

Entrada: [Spec 1](spec1-estudo-codigo.md). Cada item é hipótese até ser medido no Poco F7 com `player/stage-cost.html` e no Perfetto/AGI. "Custo" é o que o item economiza ou acrescenta; "ganho visual" é contra o padrão v9 atual.

## Ranking (ordem de implementação da Spec 3)

Critério: (ganho de fluidez ou de imagem) ÷ (custo de GPU + risco). Itens sem mudança de imagem vêm primeiro porque são verificáveis pelas regressões de pixel existentes.

| # | Melhoria | Efeito esperado | Muda a imagem? | Risco | Esforço |
| --- | --- | --- | --- | --- | --- |
| 0 | **Medir no Poco**: `stage-cost.html` no WebView e no Chrome do aparelho + Perfetto com a sessão do player | Preenche a tabela de custos; diz se o gargalo é upload, banda ou conta | Não | Nenhum | Baixo |
| 1 | **Adaptação funcionar sem timer** (achado 1 da Spec 1): usar como referência a cadência que chega ao tratamento (servidor/chegada, limitada pelo FPS-alvo do Better xCloud) quando não houver referência do modo original | Corta filtros antes do stuttering no Poco; hoje nada corta | Só quando há sobrecarga | Médio: rajadas de rede podem disparar um corte desnecessário; usar janela longa e exigir `missed`/`dropped` crescente | Baixo |
| 2 | **Fluidez sem a passada de cópia**: guardar no slot `paced` o quadro antes da nitidez (resolução do vídeo) e rodar EASU/nitidez no `present` | −1 passada em resolução de saída por quadro; slots ficam 1,4× menores no Poco | Não (mesmos shaders, mesma ordem) | Baixo; o trabalho de GPU passa para o tick do rAF | Médio |
| 3 | **`invalidateFramebuffer`** antes de desenhar em cada alvo intermediário (espacial, EASU, paced, neural) | Evita carregar tile antigo na Adreno; ganho de banda sem mudar pixels | Não | Baixo | Baixo |
| 4 | **Vizinhança única na passada espacial**: ler o losango 5×5 (13 texels) uma vez e reutilizar na Compressão, Detalhe e AA | Até −8 leituras/pixel com Detalhe ligado | Não | Baixo | Baixo |
| 5 | **Inverter Y no shader** em vez de `UNPACK_FLIP_Y` | Pode remover uma cópia de quadro no upload, conforme o caminho do Chrome | Não | Médio: todos os primeiros estágios leem a entrada; a regressão de pixel pega erro | Médio |
| 6 | **EASU + nitidez em uma passada** no Auto do Poco: nitidez barata (RCAS de 5 leituras ou USM por amostras bilineares) aplicada sobre a amostra do EASU, ou nitidez antes, na resolução do vídeo, e EASU por último | −1 passada em 1280p; o Auto passaria a custar perto da saída nativa | Sim, pouco; medir detalhe/halo com `tools/eval` | Médio | Médio |
| 7 | **`mediump`/fp16** nos shaders espacial, EASU e nitidez, mantendo `highp` nas coordenadas | Até 2× a vazão de conta na Adreno | Sim, possivelmente (limiares de 0,003 ficam perto da precisão do fp16 em 0,5–1,0) | Médio | Médio |
| 8 | **Máscara em ¼ de resolução** para Degradês e Compressão: classificar regiões planas/bloco num alvo pequeno e só filtrar onde a máscara manda | Corta leituras nas regiões que não precisam | Sim, pouco | Médio | Alto |
| 9 | **Detalhe mais barato**: anel de 8 bilineares → 4 bilineares (`textureGather` não existe no WebGL2; no WebGPU, `textureGather`) | −4 a −8 leituras no filtro mais caro | Sim, pouco | Médio | Médio |
| 10 | **Contexto `desynchronized`** e render num Worker com `OffscreenCanvas` | Menos latência e menos disputa com a thread do xCloud | Não | Alto: o contexto é criado pelo Better xCloud | Alto |
| 11 | **Padrões por dispositivo**: no Poco, Qualidade (16F) e temporal ficam bloqueados; orçamento 4 ms a 60 FPS e 8 ms a 30 FPS (10.4) | Folga para decodificação e composição | Não no padrão | Baixo | Baixo |

Deixados de fora, com motivo:
- **Temporal**: a análise v9.1 mostrou que o erro do H.264 é correlacionado no tempo (quadros P copiam os anteriores), então a média piora. Custa 5 passadas e histórico 16F. Fica desligado e primeiro na ordem de corte, como já está.
- **Reconstrução neural em WebGL2**: 33 MB/quadro só de gravação para SSIM +0,004 em 1080p e 0 em 1280p. Só volta como compute fundido no WebGPU (Spec 4, tarefa 5).
- **Modo Qualidade (16F)** como padrão: dobra a banda dos intermediários; o ganho visual não foi medido.

## Técnicas externas (10.6)

| Projeto/técnica | O que melhora | Custo | Cabe numa passada fundida? | Licença | Vale portar? |
| --- | --- | --- | --- | --- | --- |
| libplacebo / mpv `deband` | Degradês com amostragem aleatória em várias iterações e grão | 1–4 iterações × 4 leituras | Sim (já há versão própria inspirada) | LGPL-2.1 (código não pode ser copiado para o userscript MIT sem cuidado) | Só a ideia: já feito |
| FSR 1 EASU + RCAS (AMD) | Ampliação com bordas preservadas + nitidez com limite | EASU 12 leituras; RCAS 5 | EASU+RCAS juntos só em compute (RCAS precisa de vizinhos do EASU) | MIT | Já portado; RCAS é a nitidez mais barata na bancada |
| CAS (AMD) | Nitidez adaptativa | 9 leituras | Sim | MIT | Já existe (upstream) |
| NVIDIA Image Scaling (NIS) | Escala + nitidez em uma passada, coeficientes em tabela | 1 passada, ~6×6 taps, otimizado para compute | Sim, é uma passada | MIT | **Candidato** para substituir EASU + nitidez no Auto do Poco (item 6) |
| Snapdragon Game Super Resolution (SGSR 1, Qualcomm) | Ampliação espacial de 1 passada, 12 leituras, feita para a Adreno | Muito baixo; usa `textureGather` e fp16 | Sim | BSD-3-Clause | **Candidato forte** para o Poco (item 6); no WebGL2 sem gather, 12 leituras normais |
| Anime4K | Reconstrução de linhas para anime | Vários passes CNN | Não | MIT | Não: conteúdo é jogo realista |
| FSRCNNX | Super-resolução CNN em shader mpv | 8–16 canais, várias passadas, caro | Não em WebGL2 | LGPL-3.0 | Não no Poco; mesma conclusão da rede própria |

## Orçamento proposto

- Poco F7 a 30 FPS do servidor: tratamento ≤ 8 ms; a 60 FPS: ≤ 4 ms (seção 10.4). O padrão de orçamento atual (6 ms) só age com timer de GPU, que o Poco não tem — por isso o item 1 vem antes de qualquer filtro novo.
- Ordem de corte proposta: temporal → neural → saída ampliada (Auto 1280p → nativa) → AA → degradês → compressão → detalhe → cor nas bordas. É a ordem atual, com a neural antes da saída ampliada, porque custa mais e quase não ganha.

## Próximo passo

Spec 3 começa pelo item 0 (medição no Poco) e implementa 1 → 4 nessa ordem, cada um com os testes Node, regressão de pixel e movimento, e a bancada antes/depois.
