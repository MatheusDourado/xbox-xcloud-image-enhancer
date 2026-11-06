# xCloud Image Enhancer — Estudo e Specs

Repositório: MatheusDourado/xbox-xcloud-image-enhancer (antigo upscale\_image\_ai\_xcloud). Versão atual: v9.7.1. Base: Better xCloud 6.7.12 (redphx, MIT), userscript para Tampermonkey/Chrome, mais um app Android próprio em WebView.

Fonte deste estudo: README da v9.7.1. O código JS (better-xcloud-image-filter.user.js e src/) ainda NÃO foi lido diretamente — ver Lacunas.

## 1. Dispositivos-alvo

- **Poco F7** — 12 GB RAM + 6 GB swap, GPU Adreno 825. Dispositivo principal (uso como portátil, também emulação com Eden e AetherSX2/ARMSX2). Observação do Matheus: a GPU trabalha no talo ou perto do pico, gerando stuttering.
- **Dell Vostro 3400** — Intel Iris Xe integrada, ligado à TV por HDMI 1080p.
- Stream: H.264 perfil Main (8 bits, 4:2:0). O xCloud só aceitou H.264 nos testes (v9.3 tentou AV1, H.265 e VP9; v9.4 testou H.264 High).

## 2. Pipeline atual de tratamento (WebGL2)

Tudo roda na GPU via WebGL2, em geral em duas passagens de pixels na resolução nativa.

- **Compressão**: suaviza pequenos saltos entre regiões uniformes, protegendo bordas fortes. Não é IA.
- **Degradês (debanding)**: amostragem até 8 px, preservação de textura fina e dithering na quantização. Conceito inspirado no libplacebo, implementação própria.
- **Cor nas bordas**: reconstrução da cor 4:2:0 guiada pela luma (2 px de cada lado).
- **Detalhe**: realce de textura só na luma (raio \~3 px), com coring contra ruído e ringing do encoder.
- **Estabilidade em movimento (temporal)**: busca até \~40 px e refinamento em meio pixel; desligado por padrão porque o ganho foi pequeno e o custo alto.
- **Antialiasing**: suavização direcional de bordas, fundida na passagem espacial quando o temporal está desligado.
- **Upscale**: FSR 1 EASU (port GLSL da AMD) quando a saída supera a fonte; saída Automática, Nativa, 1440p ou 2160p.
- **Nitidez final**: CAS, USM só na luma ou RCAS, slider 0–10, com limite de halo proporcional.
- **Reconstrução neural**: experimental, desligada por padrão.
- **Buffers**: RGBA8 com dithering no modo Performance; RGBA16F no modo Qualidade e no histórico temporal.

Padrões da v9: Nitidez 3 (USM luma), Compressão 50%, Degradês 30%, Cor nas bordas 75%, Detalhe 20%, orçamento 6 ms; temporal, AA e neural desligados.

## 3. Fluidez, latência e medição

- **Fluidez (v9.6)**: cada quadro tratado ao chegar e exibido em ritmo constante (segue o servidor ou grade fixa 30/60 fps).
- **Captura direta (v9.7)**: lê cada quadro decodificado da trilha WebRTC; quando chegam juntos, exibe um por atualização e descarta os outros.
- **Adaptar à compressão**: segue o QP do stream; na v9.7.1, como o WebView do Android não informa QP, a compressão passou a ser estimada por bits por pixel.
- **Tempo de GPU**: medido por timer quando existe; estimado na v9.7.1 quando o navegador não tem timer.
- **Adaptação de desempenho**: acima do orçamento (3, 6 ou 10 ms) reduz, nesta ordem: temporal, saída ampliada, AA, neural, degradês, compressão, detalhe e cor nas bordas.
- **Medição exportável**: JSON com build, configs, tempos de GPU e ritmo por quadro (tela, chegada, servidor).
- **Painel e HUD (v9.7)**: FPS, ritmo, travadas, latência estimada, resolução, codec, decodificador, Mb/s, QP e perda.

## 4. Plano por specs

- **Spec 1 — Estudo do projeto**: mapear o código JS e os shaders, o pipeline de captura e o custo de GPU por etapa. Modelo rápido, esforço médio.
- **Spec 2 — Estudo e planejamento**: pesquisar projetos open source e técnicas, decidir o que implementar. Modelo mais forte, esforço alto.
- **Spec 3 — Implementação**: tarefas pequenas; modelo intermediário, e o forte só em shader e desempenho.
- **Regra transversal**: orçamento de GPU por quadro que nenhum tratamento pode estourar, principalmente na Adreno 825.

## 5. Ideia: renderizador WebGPU opcional

- Manter WebGL2 e adicionar WebGPU como opção, com detecção automática e fallback.
- Ganhos esperados: importar o quadro de vídeo sem cópia e usar compute shader para fundir etapas numa passada só.
- Requisito: mesmos efeitos nos dois renderizadores, sem duplicar a lógica.
- A confirmar: suporte a WebGPU no WebView do Android no Poco F7 (Chrome no Android 12+ com GPU Qualcomm já suporta).

WebGPU é um dos objetivos principais do projeto e vira uma spec própria (Spec 4), executada depois do estudo e antes de novos filtros pesados.

Tarefas da Spec 4:

1. Detectar suporte a WebGPU no WebView do app Android (Chrome 155 no Poco F7) e no Chrome do Vostro; registrar adaptador, limites e recursos disponíveis.
2. Criar uma camada comum de renderizador, com WebGL2 e WebGPU por trás da mesma interface, para os filtros não serem escritos duas vezes na lógica.
3. Importar o quadro do vídeo sem cópia (importExternalTexture, ou VideoFrame na captura direta).
4. Portar os shaders para WGSL, começando pelo caminho padrão: compressão, degradês, cor nas bordas, detalhe, FSR 1 EASU e nitidez.
5. Fundir etapas com compute shader numa passada só onde possível, usando memória compartilhada de workgroup.
6. Adicionar a opção no painel: Automático, WebGL2 ou WebGPU; o automático cai para WebGL2 se o WebGPU falhar ou não existir.
7. Medir o custo por quadro nos dois renderizadores, no mesmo vídeo e com os mesmos filtros, e preencher a tabela de custos.

Critérios de aceite:

- Imagem equivalente ao WebGL2 nos testes de regressão de pixel (diferença dentro da tolerância).
- Custo de GPU igual ou menor que o do WebGL2 no Poco F7; se for maior, WebGPU não vira padrão.
- Fallback para WebGL2 sem travar o jogo nem recarregar a página.
- Medição de tempo de GPU com timestamp query quando o WebGPU oferecer, corrigindo a lacuna do cronômetro no WebView.

## 6. Lacunas e achados (atualizar conforme os agentes avançam)

- Código JS e shaders ainda não lidos diretamente; estudo baseado só no README.
- README diz que a validação física no Dell e o teste longo em Hellblade seguem pendentes; não há prova de ganho sustentado na Iris Xe.
- Tempo de GPU na Adreno é estimado, não medido: precisa de método confiável para saber o custo real de cada etapa.
- Orçamento padrão de 6 ms pode ser alto demais para o Poco F7, que já está no limite.
- WebView do Android não expõe QP; a estimativa por bits por pixel precisa ser validada.
- Temporal teve ganho pequeno e custo alto; reavaliar se vale manter.

## 7. Medição real no Poco F7 (release v9.7.1, 18 out.)

Primeira sessão em aparelho real: Poco F7, Android 16, WebView Chrome 155, Gears of War: E-Day, captura direta e Fluidez Equilibrada.

- **Funcionou**: captura direta entregou 4.659 de 4.662 quadros; rede com 20 ms de ida e volta e 0,008% de perda; exportação para Downloads/xCloud ImageFilter.
- **Servidor**: 30 FPS na partida (\~60 nos menus), cerca de 9 Mb/s em 1080p30 (\~0,15–0,18 bit/pixel).
- **Limitações do WebView**: não informa QP (qpSum) e não tem cronômetro de GPU (EXT\_disjoint\_timer\_query\_webgl2).
- **Correções da 9.7.1**: compressão estimada por bits por pixel (0,12 bit/pixel ≈ QP 28, percentil 80 do último minuto); tempo de GPU estimado por fence a cada 0,5 s, que é limite superior e só serve para exibição; medição schema 2 com ritmo de tela, chegada e servidor, e linha do tempo por segundo.
- **Validação**: 47 testes Node, 117 verificações de painel e HUD, 26 em WebRTC real no Chromium, 43 regressões de pixel e 11 de movimento inalteradas.

Novas lacunas:

- A v9.7.1 ainda não rodou no Poco F7; as correções vêm da sessão da v9.7.
- A calibração 0,12 bit/pixel = QP 28 é estimativa e precisa ser revista com a próxima medição.
- Sem custo de GPU confiável por etapa na Adreno, não dá para montar o orçamento por filtro; o fence mede o quadro inteiro, com fila.
- WebView Chrome 155 é promissor para WebGPU, mas o suporte ainda não foi testado no aparelho.

* **Reconstrução neural (v9.1)**: ninguém sabe ainda como foi implementada (shader WebGL próprio, ONNX, TensorFlow.js ou outro), qual o tamanho do modelo, como foi treinado nem quanto custa na GPU. Primeira tarefa da Spec 1: ler o código e documentar isso.

## 8. Meta: o mais perto possível da imagem nativa, com custo explícito

Objetivo: extrair o máximo de qualidade do stream H.264 Main 8 bits 4:2:0 no cliente, sabendo que não chega a uma imagem nativa, sem causar stuttering por gargalo de GPU.

Regras para toda melhoria:

- Todo filtro (cor, degradê, compressão, detalhe, AA, temporal, FSR, nitidez, reconstrução neural) documenta seu custo de GPU em ms por quadro, medido no Poco F7 (Adreno 825) e no Vostro 3400 (Iris Xe), em 1080p, e no WebGL2 e no WebGPU quando existir.
- Cada filtro documenta também o ganho visual medido contra a referência e o vídeo original, na mesma cena.
- A soma dos filtros ativos não pode estourar o orçamento do dispositivo; a 30 FPS do servidor há 33 ms por quadro, mas a 60 FPS só 16,7 ms, e a decodificação e o navegador também usam a GPU.
- Filtro com ganho pequeno e custo alto fica desligado por padrão (caso atual do temporal) e entra na ordem de corte automático.
- A reconstrução neural é tratada como o item mais caro: só entra com medição de custo e ganho no Poco F7.

Tabela de custos a preencher na Spec 1:

| Filtro | Custo Poco F7 (ms) | Custo Vostro (ms) | Ganho medido | Padrão |
| --- | --- | --- | --- | --- |
| Compressão |  |  |  | ligado 50% |
| Degradês |  |  |  | ligado 30% |
| Cor nas bordas |  |  |  | ligado 75% |
| Detalhe |  |  |  | ligado 20% |
| Antialiasing |  |  |  | desligado |
| Temporal |  |  |  | desligado |
| FSR 1 EASU |  |  |  | automático |
| Nitidez final |  |  |  | USM 3 |
| Reconstrução neural |  |  |  | desligado |

## 9. Execução autônoma (rodada longa de madrugada)

O Claude Code executa todas as specs de forma autônoma, sem ninguém acompanhando, com o Poco F7 conectado por ADB em modo depuração.

Regras para o agente:

- Não parar para pedir confirmação. Diante de dúvida, escolher a opção mais segura, registrar a decisão na seção de Lacunas e seguir.
- Trabalhar numa branch própria, com commits pequenos e frequentes. Nunca mexer na main, nem publicar release ou APK sem aprovação.
- Documentar tudo neste documento ou num arquivo de log no repositório: o que fez, o que mediu, o que falhou e o que ficou pendente.
- Rodar os testes existentes (Node, Playwright, regressões de pixel e movimento) depois de cada mudança; se quebrar, reverter e registrar.

No aparelho, via ADB:

- Manter a tela ligada durante a rodada e registrar bateria e temperatura a cada medição; se esquentar demais, pausar e anotar, porque calor derruba o clock da Adreno e distorce os custos.
- Depurar o WebView remotamente pelo Chrome DevTools para ler console, medições e o JSON exportado em Downloads/xCloud ImageFilter.
- Instalar APKs de teste só por cima da série 9.x, sem apagar os dados do app.

Limites a considerar:

- O xCloud real exige conta logada e uma partida ativa, e pode encerrar sessão parada; sem alguém jogando, as medições de custo devem usar o player de testes com vídeos locais, que roda o mesmo motor.
- Medições no xCloud real ficam marcadas como pendentes para uma sessão com o Matheus jogando.
- Ao fim da rodada, deixar um resumo no topo do log: o que foi feito, números medidos, lacunas novas e próximo passo.

## 10. Spec 2 — Revisão e estudo de eficiência de GPU

Objetivo: tratar a imagem com o menor custo de GPU possível, sem stuttering, sem travadas e sem gargalo de shader, deixando folga para a GPU. Cada técnica abaixo é hipótese a medir no Poco F7 e no Vostro, não verdade pronta.

Ponto de partida: a Adreno 825 e a Iris Xe são GPUs móveis ou integradas, e nelas o maior custo costuma ser largura de banda de memória (ler e gravar texturas inteiras), não a conta do shader. A Adreno ainda trabalha por blocos (tiles), então cada passada que grava uma textura de tela inteira e lê de novo sai cara.

### 10.1 Menos passadas e menos memória

- Fundir o máximo de filtros numa passada só; cada textura intermediária de tela inteira é uma ida e volta à memória.
- Tratar tudo na resolução do vídeo e ampliar só no fim (FSR EASU), com a nitidez junto ou logo depois.
- Preferir RGBA8 com dithering a RGBA16F onde a qualidade permitir; 16F dobra a banda.
- Alocar texturas e buffers uma vez e reutilizar; nunca recriar por quadro.
- Descartar conteúdo antigo ao desenhar (clear ou invalidateFramebuffer), para a Adreno não recarregar o tile da memória.

### 10.2 Shaders mais baratos

- Usar meia precisão (mediump no GLSL, f16 no WGSL quando shader-f16 existir); na Adreno isso pode dobrar a vazão de conta.
- Reduzir leituras de textura: filtros separáveis, amostras compartilhadas, textureGather onde houver.
- Calcular máscaras de análise (onde tem degradê, onde tem bloco, onde tem borda) em resolução reduzida, um quarto ou menos, e só aplicar o filtro caro onde a máscara manda.
- Evitar desvios dinâmicos pesados dentro do shader; preferir variantes compiladas por perfil.
- Pré-compilar e aquecer os shaders antes do jogo, para não ter travada na primeira vez que um efeito liga.

### 10.3 Nada de travar a CPU esperando a GPU

- Nenhum readPixels, getError, finish ou espera síncrona no caminho do quadro; leituras de medição só assíncronas e espaçadas.
- Desenhar só quando chega quadro novo (requestVideoFrameCallback ou VideoFrame), nunca redesenhar o mesmo quadro.
- Contexto do canvas com alpha, antialias e preserveDrawingBuffer desligados, e testar a opção desynchronized de baixa latência.
- Avaliar mover o render para um Worker com OffscreenCanvas, para a thread principal do xCloud não atrasar o quadro.

### 10.4 Folga, calor e ritmo

- Mirar no máximo metade do intervalo de quadro para o tratamento; a decodificação, a composição do navegador e o sistema também usam a GPU.
- Proposta inicial a validar: até 4 ms por quadro no Poco F7 a 60 FPS e até 8 ms a 30 FPS.
- Medir em sessão longa (20 min ou mais), porque o celular esquenta, a Adreno baixa o clock e um custo que cabia no começo deixa de caber.
- Casar a taxa da tela com o stream (30 ou 60 Hz no Poco) para não sobrar quadro repetido nem pulado.
- A adaptação automática deve agir antes do stuttering: reduzir por tendência de custo, não só depois que o FPS cai.

### 10.5 Medir de verdade na Adreno

- Usar o Android GPU Inspector ou o Snapdragon Profiler via ADB para ler tempo de GPU, banda de memória e clock por quadro, já que o WebView não tem cronômetro.
- Usar o Perfetto via ADB para ver a linha do tempo de CPU, GPU e composição e achar a origem de cada travada.
- Medir cada filtro isolado e em conjunto, no player de testes, e preencher a tabela da seção 8.

### 10.6 Estudo de projetos e técnicas externas

- Estudar outros pós-processadores de vídeo em tempo real: libplacebo e mpv (debanding, deband por máscara, escaladores), Anime4K e FSRCNNX (reconstrução leve em shader), FSR 1 e RCAS da AMD, CAS, NVIDIA Image Scaling, Snapdragon Game Super Resolution da Qualcomm, feita justamente para a Adreno.
- Para cada técnica, registrar: o que melhora, custo estimado, se cabe numa passada fundida, licença e se vale portar.

Entregável da Spec 2: um ranking de melhorias por ganho visual dividido por custo de GPU no Poco F7, que vira a ordem de implementação da Spec 3.
