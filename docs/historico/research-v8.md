# Pesquisa e proposta v8 — Iris Xe / i7-1165G7

Data da pesquisa: **2026-10-09**. Base inspecionada: `efcd80b336244f5bd0916b86441e241fd5b9eab6` (v7.1). Escopo: pesquisa documental no GitHub, documentação técnica e fóruns; arquitetura e protocolo de aceitação. **Nenhum teste físico no Dell foi realizado nesta pesquisa.** Não implementa a v8 nem altera a release.

## Decisão recomendada

A v8 deve ser uma melhoria espacial conservadora em **1080p nativo, WebGL2, duas passagens**, com classificação local reutilizando amostras existentes. Primeiro medir a v7.1 no Dell; depois comparar limpeza seletiva e sharpening antirringing em alterações isoladas. Manter CAS 2, Performance, orçamento total de 3 ms, temporal e AA desligados como ponto de partida. RCAS merece um protótipo comparativo, não uma substituição automática de CAS. EASU permanece restrito à ampliação real. Temporal mais complexo, WebGPU e reconstrução neural ficam fora da primeira entrega.

O objetivo é reduzir artefatos visíveis sem apagar cabelo, vegetação, tecido, HUD e detalhes escuros. Não há fundamento para prometer reconstrução fiel do conteúdo eliminado pelo encoder. Reduzir halos novos também não equivale a remover ringing já presente no vídeo.

## 1. Evidência local e limites do equipamento

Foram lidos `README.md`, `docs/historico/validation-v3.md`, `src/restoration-engine.js`, shaders em `src/shaders/`, integração em `src/image-filter.js`, geração de CAS em `tools/build.py`, player e harness de desempenho.

Achados na base:

- `spatial.glsl`: centro + quatro vizinhos próximos; limpeza busca pequenos degraus sem assumir grade do codec; reversões de gradiente protegem extremos/textura; deband usa até quatro amostras distantes, raio de 2–8 pixels. A proteção já existe: v8 deve aperfeiçoá-la, não anunciá-la como novidade.
- CAS é extraído do upstream por `tools/build.py`; o caminho filtrado limita CAS e USM ao intervalo local ±4/255 e reduz reforço de diferenças pequenas. Acabamento está unido à nitidez. Comparar o CAS upstream de referência e o CAS filtrado é importante: não são numericamente idênticos.
- `Engine.render`: upload do vídeo, espacial opcional, temporal opcional, AA opcional, EASU apenas se ambas as dimensões aumentarem, nitidez/acabamento. Performance espacial RGBA8; Qualidade e histórico RGBA16F quando o target é suportado. Não existe conversão do stream para HDR/10 bits.
- Temporal: imagens reduzidas a 1/4 por eixo, vetores a aproximadamente 1/16 por eixo, busca/refino até meio pixel, corte global em 16×16 amostras, clamp local e peso limitado. `fineError` compara quadro bruto atual com histórico processado; isso pode influenciar a confiança. É uma hipótese a isolar, não um defeito visual comprovado.
- Timer envolve upload e passes; consultas assíncronas, descarte em disjoint, até quatro pendentes. O budget mantém apenas 60 amostras, úteis à adaptação, insuficientes para resumir sozinho dez minutos. `performance-harness.py` compara com v7 (`1b33753`), usa canvas, 150 quadros e últimas 60 amostras: precisa de baseline v7.1 e coleta longa para a v8.
- Player já usa `requestVideoFrameCallback` com fallback; a integração deduplica por `currentTime`. Auditar o agendamento upstream antes de alterar callbacks, evitando dois loops concorrentes.

Resultados **históricos**, não repetidos aqui: 16 testes Node, 44 verificações WebGL/DOM + 12 regressões e 11 deslocamentos sintéticos passaram. No Apple M4/ANGLE Metal, p95 nativo v7/v7.1 foi 2,71/2,74 ms; temporal 5,43/5,30 ms. Sem decode, execução curta, custo semelhante. O trecho anterior de Hellblade mostrou ganho temporal adicional muito pequeno e não foi repetido na v7.1. Nada disso estabelece margem na Iris Xe.

A [Dell documenta HDMI máximo 1920×1080 a 60 Hz, 24 bits](https://www.dell.com/support/manuals/en-us/vostro-14-3400-laptop/vostro_3400_setup_specs/left-view?guid=guid-02967f93-678d-4b21-b5b0-dc1ba3e828b1&lang=en-us). A [página comercial oficial do Vostro 3400](https://www.dell.com/en-sg/shop/business-laptop-notebook-computers/vostro-14-3400-laptop/spd/vostro-14-3400-laptop/w5180544010sgw10pro) descreve USB-C opcional apenas para dados. Não inferir DisplayPort por existir conector USB-C. O limite de saída do processador não substitui o limite do notebook.

A [ficha Intel do i7-1165G7](https://www.intel.com/content/www/us/en/products/sku/208662/intel-core-i71165g7-processor-12m-cache-up-to-4-70-ghz/specifications.html) lista 96 EUs e configuração térmica variável. Isso não determina clocks sustentados nem RAM instalada. RAM, canais, frequência, driver, refrigeração e limites de potência continuam desconhecidos. O [guia Intel Xe-LP](https://www.intel.com/content/www/us/en/developer/articles/guide/lp-api-developer-optimization-guide.html) recomenda evitar precisão/canais desnecessários para poupar banda e cache. Aplicação ao projeto: manter RGBA8 como baseline, evitar targets adicionais e medir sob decode concorrente; não converter essa orientação em previsão de milissegundos.

## 2. Pesquisa externa: evidência e alternativas

Todas as fontes abaixo foram consultadas em **2026-10-09**. Links `master` e documentação contínua são mutáveis; antes de incorporar código, fixar commit e hash do arquivo no manifesto de terceiros. Datas de publicação só são indicadas quando identificadas; data de consulta não é data de publicação.

| Alternativa / fonte | Evidência aproveitável | Decisão para v8 |
| --- | --- | --- |
| [libplacebo: opções de deband/dither](https://libplacebo.org/options/) e [código no GitHub](https://github.com/haasn/libplacebo) | Mais iterações custam; limiar elevado elimina detalhe; blue-noise exige LUT. É referência de vídeo, não benchmark WebGL/Iris Xe. | Manter uma etapa própria e poucos taps. Avaliar limiares por confiança e comparar padrão estático atual com LUT fixa apenas se houver padrão visível. |
| [AMD: implementação FSR1, EASU e RCAS](https://github.com/GPUOpen-Effects/FidelityFX-FSR/blob/master/ffx-fsr/ffx_fsr1.h) | RCAS usa cruz de cinco taps, resolve limite de reforço e oferece redução de reforço de possível ruído; não faz scaling. EASU é a etapa de ampliação. | Prototipar RCAS no passe final, em lugar de CAS, com acabamento unido. Conferir opção de denoise explicitamente. Não empilhar CAS e RCAS. |
| [AMD CAS](https://gpuopen.com/fidelityfx-cas/) | Sharpening adaptativo de baixo overhead com opção de scaling; código aberto MIT. Não valida parâmetros desta adaptação upstream. | CAS filtrado atual é controle principal; medir ganho do candidato com nitidez percebida equivalente. |
| [AMD FSR2: integração](https://gpuopen.com/manuals/fidelityfx_sdk/techniques/super-resolution-temporal/) | Depende de recursos do render, incluindo profundidade, vetores e jitter; o vídeo final não fornece esses recursos. | Não portar FSR2/3 como se fossem filtros de vídeo. Block matching não produz dados equivalentes do jogo. |
| [Khronos: timer WebGL2](https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/) (revisão 2023-06-01) | Consultas de tempo GPU e estado disjoint. | Reutilizar mecanismo atual e exportar amostras válidas; ausência da extensão precisa aparecer como N/D. |
| [MDN: boas práticas WebGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) | Upload de vídeo pode envolver conversões e mudanças internas de pipeline; chamadas bloqueantes e readback prejudicam medição. | Não assumir zero-copy; experimentar alocação estável/`texSubImage2D` isoladamente, sem prometer ganho sobre `texImage2D`. Sem `readPixels` na reprodução medida. |
| [W3C WebRTC Stats](https://www.w3.org/TR/webrtc-stats/) (draft 2025-09-25) | Contadores permitem separar decode, jitter buffer, perdas e quadros; disponibilidade varia. | Diagnóstico antes de novos filtros e registro por intervalo; não chamar isso de latência controle→TV. |

### Relatos de campo encontrados em fóruns

São observações de terceiros sem controle experimental, sem equivalência garantida com o Dell:

- [Reddit: Default renderer smooth, WebGL2 stuttery](https://www.reddit.com/r/xcloud/comments/1l6exvd/better_xcloud_default_renderer_smooth_webgl2/), tópico de junho de 2025: usuário percebe cadência pior apesar de indicador em 60 FPS; respostas mencionam decode e halos. **Confronto:** métricas WebRTC e apresentação medem etapas diferentes; o relato justifica comparar renderer nativo e canvas, não demonstra que WebGL2 sempre seja lento.
- [Reddit: Tips for Premium xcloud](https://www.reddit.com/r/xcloud/comments/1sgygbu/tips_for_premium_xcloud/), comentários de abril de 2026: sharpening/Clarity Boost descrito como intensificador de artefatos. **Confronto:** CAS/RCAS realmente reforçam contraste local; isso apoia testar overshoot e textura, mas não identifica algoritmo interno de Clarity Boost nem quantifica qualidade.
- [GitHub Discussions Better xCloud #657: WebGPU renderer](https://github.com/redphx/better-xcloud/discussions/657), discussão da versão 6.4.0: há relatos de tela preta em Android/WebView. **Confronto:** ambiente diferente do alvo; mostra necessidade de fallback e teste, não prova defeito no Windows. Migrar API não resolve por si só limitações de banda ou decode.

Não foram encontrados nesta pesquisa benchmarks controlados do pipeline v7.1 no Vostro 3400. Opiniões contraditórias de nitidez não substituem A/B de Matheus na TV.

## 3. Arquitetura incremental proposta

Fluxo padrão: `HTMLVideoElement → upload → espacial seletivo RGBA8 → sharpening + acabamento → canvas 1080p → compositor/HDMI → upscale da TV`.

### P0 — medição e controle reproduzível

Antes de mudar pixels, acrescentar exportação local de resultados no player/harness e modo diagnóstico no adaptador. Fixar hash do bundle, parâmetros solicitados e efetivos, revisão do budget, tamanho real da fonte e renderer. Guardar amostras de GPU fora da janela curta de adaptação. Não guardar SDP completo, endereços de rede ou credenciais.

Medição normal: timer total existente. Diagnóstico de passes: consultas sequenciais não aninhadas em execução separada; somas são indicativas, não uma decomposição exata do custo total. Registrar custo de instrumentação comparando ligada/desligada. Não usar `gl.finish` ou leitura síncrona para esperar resultado. Invalidar amostras em disjoint, resize, troca de modo ou sessão. Quando não houver timer, reportar cadência e drops sem inventar tempo GPU.

### P1 — confiança espacial sem mapa extra

Modificar `spatial.glsl`, preservando uma passagem:

1. Reutilizar centro, cruz e vizinhos a distância dois para calcular amplitude local, reversões, continuidade de gradiente e concordância entre lados. Usar transições suaves de confiança para evitar alternância abrupta quadro a quadro.
2. Limpeza de degrau somente quando os dois lados são aproximadamente uniformes e não há evidência de linha fina. Não alinhar a uma grade fixa 8×8/16×16: transformações, partições e scaling podem deslocar padrões. Confiança ambígua resulta em menor correção.
3. Deband condicionado por planicidade e acordo de cor, separado da limpeza. Comparar dois e quatro taps com presets fixos; começar com padrão espacial estável para não injetar cintilação. Não confundir dither com recuperação do gradiente original.
4. Dering experimental: corrigir apenas pequenas oscilações adjacentes a borda dominante quando o lado uniforme oferece suporte. Reutilizar amostras existentes primeiro. Se exigir vizinhança maior ou apagar detalhe, retirar da primeira v8. O clamp final continua necessário, mas só limita halos novos.

Primeiro candidato: mesmas 13 leituras nominais máximas do espacial atual, mudando pesos/ALU. Se a análise exigir diagonais, isolar variante de +4 taps. Não acrescentar mapa de classificação, segmentação semântica ou detecção de HUD por rede neural. Proteger HUD por comportamento conservador em bordas e linhas; testar textos explicitamente.

### P2 — nitidez com menor amplificação de artefatos

Dois candidatos independentes: (A) CAS atual com confiança local contínua e limites ajustados; (B) RCAS fiel ao código AMD, denoise habilitado e acabamento integrado. Usar os mesmos vizinhos sempre que possível. RCAS limita clipping na faixa do sinal; isso não garante ausência de halos perceptuais dentro de 0–1. Comparar com e sem limite local adicional. O valor numérico do slider não corresponde à mesma força nos dois algoritmos: calibrar por borda/visual e documentar mapeamento.

Não passar confiança no alpha sem contrato: atualmente targets escrevem alpha=1; interpolação, temporal e outros passes precisariam preservar o significado. Recalcular uma medida barata no passe final é inicialmente mais simples. Tratar cores na mesma convenção do pipeline atual; conversão linear/não linear é experimento separado, para não misturar mudança de contraste com ganho de nitidez.

### P3 — temporal apenas após aprovação espacial

Manter OFF. Antes de aumentar busca, incluir oclusões, partículas, HUD fixo sobre fundo móvel, transparências, exposição e textura repetida nos testes. Avaliar rejeição mais conservadora e consistência da comparação bruto/processado. Evitar novo histórico full-resolution só para uniformizar matching sem medir seu custo.

Alternativa barata a pesquisar em protótipo: acumulação de peso muito baixo apenas em regiões estáticas com diferença local pequena, sem busca de movimento. Ainda custa histórico e pode produzir rastros em movimento lento; não substitui motion compensation. Outra opção é estabilizar apenas parâmetros de força, sem misturar cor entre quadros; pode evitar bombeamento, mas atrasa a resposta a cortes. Nenhuma deve entrar por padrão sem ganho A/B. Busca bidirecional/optical flow denso ficam adiados pelo custo e ausência de evidência de benefício neste conteúdo.

### P4 — escalonamento e compatibilidade

EASU fica disponível para fonte menor que a saída, por exemplo 720→1080. Para stream 1080 e HDMI 1080, não roda. Forçar 1440/2160 e reduzir depois é experimento de supersampling de vídeo já decodificado, sem garantia de benefício. AA continua opcional. Manter a ordem de redução automática existente e rollback de cada candidato via flag; guardar preferências separadas do estado efetivo. Não migrar preferências nem aumentar automaticamente carga durante sessão nesta etapa.

## 4. Custo esperado: contagem, não benchmark

Estimativas abaixo são derivadas das dimensões e código local. Cache, bilinear, compilador ANGLE, conversão de vídeo e concorrência mudam tráfego físico e tempo. **Não estimamos ms na Iris Xe antes de medir.** Meta de engenharia: manter p95 total ≤3 ms no aparelho; não é capacidade comprovada.

| Operação | Contagem/armazenamento nominal | Implicação |
| --- | --- | --- |
| Target 1080p RGBA8 | 2.073.600 × 4 = 8,29 MB (7,91 MiB) | Cada target tem esse payload, sem overhead do driver |
| Target 1080p RGBA16F | 16,59 MB (15,82 MiB) | Dobro do payload, não necessariamente dobro do tempo |
| Passe simples, uma leitura + escrita RGBA8 | 16,59 MB/quadro; 0,995 GB/s a 60 FPS | Modelo lógico; não inclui upload, cache, compositor/decoder |
| Espacial atual completo | 5 próximas + 4 externas de cleanup + 4 deband = 13 fetches/pixel | ~27 milhões de chamadas/quadro; taps de deband podem cair a dois |
| CAS Performance / USM ou CAS Qualidade | 5 / 9 amostras de cor por pixel | Reutilizar taps no limiter; confirmar código gerado |
| Espacial + CAS Performance | ~18 fetches/pixel, duas passagens | ~37,3 milhões/quadro; não são 37,3 milhões de acessos DRAM independentes |
| Variante espacial +4 taps | +8,29 milhões de fetches/quadro | Precisa demonstrar vantagem visual mensurável |
| Temporal atual | Dois históricos 16F: ~33,18 MB, além de outros targets | Matching custa centenas de fetches por ponto do campo; blend é full-resolution |
| Saída 1440p / 2160p | 1,78× / 4× pixels de 1080p | Aumenta passes na saída e targets; custo total não escala exatamente por esse fator |

Fusão completa espacial+sharpening em um passe não é prioridade: obter vizinhos já filtrados pode repetir a limpeza várias vezes ou mudar o algoritmo. As duas passagens atuais são um compromisso razoável. Branch local pode economizar trabalho, mas divergência entre pixels pode reduzir a economia; medir cenas lisas e muito texturizadas. Reservar buffers e testar `texSubImage2D` é hipótese de otimização do upload, não solução garantida. Nunca baixar pixels à CPU para filtrar durante gameplay.

## 5. Browser, WebRTC e codecs realmente acessíveis

O upstream local mantém `STATES.currentStream.peerConnection`, chama APIs WebRTC e altera preferências/SDP. Isso oferece um ponto de integração existente para diagnóstico, sujeito a mudanças do site.

- `getStats()` pode fornecer codec negociado, bytes, frames, decode e jitter. Não fornece profundidade do jogo ou vetores de movimento de renderização. Contadores ausentes ficam N/D.
- [WebRTC `setCodecPreferences`](https://www.w3.org/TR/webrtc/) ordena codecs suportados na negociação; não obriga o servidor a enviar AV1/HEVC, aumentar bitrate ou disponibilizar outro perfil. Não mudar SDP/codec na primeira v8: altera a fonte e invalida A/B do filtro.
- [WebCodecs](https://www.w3.org/TR/webcodecs/) fornece codecs de baixo nível para dados fornecidos pela aplicação. Não é um comando para substituir o decoder interno da sessão WebRTC. Um pipeline alternativo exigiria acesso e integração dos dados codificados, sincronização e gestão de filas; complexidade fora deste escopo.
- [requestVideoFrameCallback](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback) oferece metadados de apresentação e, quando disponíveis, de WebRTC; execução pode chegar atrasada em relação ao vsync. Usar para identidade/cadência de quadros e comparar com agendamento atual, sem prometer redução de latência.
- Conferir aceleração, backend ANGLE e decoder em `chrome://gpu`, `chrome://media-internals` e `chrome://webrtc-internals`. Não recomendar flags experimentais globais como requisito. Nenhum shader conserta perda de pacote, jitter ou decoder atrasado.

## 6. Licenças e dependências

| Item | Situação / ação |
| --- | --- |
| Better xCloud | [MIT upstream](https://github.com/redphx/better-xcloud/blob/typescript/LICENSE); manter avisos e versão-base 6.7.12. `script.js` continua original. |
| AMD FSR1/RCAS/CAS | MIT; preservar copyright/licença AMD e registrar commit/hash do código efetivamente portado. FSR1 já está vendorizado em `src/vendor/ffx_fsr1.h`; conferir correspondência antes de reutilizar RCAS. Sem SDK binário ou pacote npm necessário. |
| libplacebo | [LGPL no repositório](https://github.com/haasn/libplacebo/blob/master/LICENSE). Usar conceitos/documentação; não copiar implementação para o userscript sem revisão das obrigações de distribuição. Nenhum código libplacebo incorporado nesta pesquisa. |
| WebGL2/WebRTC | APIs do navegador; detectar extensões, manter fallback e registrar versão do Chrome/driver. |
| LUT de ruído, se adotada | Gerar deterministicamente no projeto com algoritmo documentado ou verificar licença do asset; não copiar textura sem proveniência. |
| Validação | Python, Node, Chrome; FFmpeg/libx264 para amostras locais conforme ferramentas existentes. Não acrescentar dependência de runtime, CDN, modelo ou serviço pago. Registrar versão/build/licença das ferramentas usadas; vídeos devem ter uso autorizado. |

## 7. Protocolo A/B repetível no Dell

### Preparação

Registrar Windows/Chrome/Tampermonkey/driver, RAM total/canais/frequência, fonte de alimentação, modo de energia, resolução e frequência do sinal ativo, backend ANGLE, extensões GL, decoder/codec e versão do userscript. TV em modo jogo, mesma nitidez/redução de ruído/interpolação, mesma porta HDMI e distância de avaliação. Não assumir RAM dual-channel. Usar mesma conexão e evitar downloads concorrentes. Aquecer por cinco minutos; registrar temperatura/clocks se ferramenta já disponível, sem tornar monitor externo obrigatório.

### Conteúdo e modos

Criar corpus local autorizado com referência de alta qualidade explicitamente identificada (preferir lossless), degradados controlados e bitrate efetivo medido. Incluir sombras/degradês, pele/cabelo, vegetação, texto/HUD, linhas finas, blocos, ringing, pans lentos/rápidos, cortes, oclusão e partículas. Preservar hashes, encoder/parâmetros, FPS, timestamps e ROIs. CRF10/12 H.264 não é referência lossless; trailer recodificado não replica xCloud.

Comparar separadamente: renderer nativo do navegador; original no canvas; CAS 2; v7.1 padrão; v8 P1; v8 P1+P2A; v8 P1+P2B. Temporal é bateria posterior. Para qualidade, usar mesmo quadro/trecho no player e ordem cega A/B, pelo menos dez pares com repetição em outra ordem. Para performance, renderizar **um modo por vez**, sem split-screen ou exportação durante coleta.

Realizar três execuções de dez minutos por finalista e baseline, alternando ordem AB/BA e respeitando aquecimento. Primeiro orçamento manual para conhecer custo intrínseco; depois repetir finalistas com 3 ms para verificar adaptação. Registrar todas as reduções: um modo que desligou seus efeitos não provou eficiência com os efeitos ativos. No xCloud, repetir rota/cena na mesma sessão quando possível; tratar variabilidade de servidor/bitrate como fator de confusão. Confirmar ao menos dez minutos de gameplay real por finalista.

### Métricas e interpretação

- GPU: amostras válidas, quantidade descartada, p50/p95/p99 total e por janelas de 10 s, máximo e distribuição; não média de percentis. CPU de submissão é outra coluna. 16,67 ms é período de 60 Hz, não orçamento livre do filtro.
- Cadência: intervalos de apresentação, FPS de quadros únicos e gaps em `presentedFrames`; separar frames do vídeo, draws e contador do servidor. Observar a TV para microstutter.
- WebRTC: por intervalo, decode médio = `1000 ΔtotalDecodeTime / ΔframesDecoded`; jitter buffer médio = `1000 ΔjitterBufferDelay / ΔjitterBufferEmittedCount`. Coletar drops, freezes, perdas e bitrate por deltas; não dividir por zero, reiniciar ao trocar SSRC. Esses tempos não são p95 por quadro. Drops de APIs diferentes podem se sobrepor: não somar cegamente. [Definições W3C](https://www.w3.org/TR/webrtc-stats/).
- Qualidade: preferência cega, retenção de textura, banding, blocos, halos e cintilação por ROI. MSE/PSNR/SSIM offline ajudam em conteúdo alinhado; não substituem percepção e podem premiar blur. Medir overshoot e contraste de linhas finas; incluir deslocamentos subpixel e ruído determinístico.
- Ghosting: avaliar quadro a quadro após corte e desoclusão; medir erro na região recém-revelada e duração do resíduo contra espacial sem histórico. Movimento conhecido permite alinhar a referência e medir variância temporal sem confundir movimento com ruído.
- Latência: timer GPU não mede controle→fóton. Filmar botão/indicador físico e TV juntos a 120/240 FPS, se disponível, pelo menos 30 ações por modo em ordem alternada; informar quantização da câmera e variabilidade do serviço. Sem câmera/método físico, registrar latência ponta a ponta como **não medida**, usando apenas proxies identificados.

### Critérios propostos de aprovação (não resultados)

1. Todos os testes existentes continuam passando; novos casos preservam linhas de 1 px, preto/branco, corte, odd sizes, fallback RGBA8, resize/context loss e troca de sessão. Rodar `node --test tests/*.cjs`, sintaxe e os harnesses reais após implementar; atualizar baseline do performance harness para v7.1.
2. No Dell, p95 total ≤3 ms no preset final e queda de cadência <5% frente a CAS 2. Se CAS/original já falhar, investigar ambiente/decode antes de adicionar filtros. Sem timers, aprovação de orçamento GPU permanece pendente.
3. Como limite inicial de regressão, drops não aumentam mais que 0,5 ponto percentual frente à baseline nas execuções pareadas; sem novos freezes recorrentes. Publicar números absolutos e variabilidade, não só aprovado/reprovado.
4. Matheus prefere v8 em pelo menos 7 de 10 pares previamente escolhidos, sem perda relevante em HUD/cabelo/linhas; critério prático de aceitação individual, não estudo estatístico de usuários. Se empate, manter caminho mais barato.
5. Temporal não entra no padrão se houver rastro visível novo ou piora de erro em desoclusão; ganho em ruído sintético sozinho não basta. Não aceitar aumento consistente de latência de um quadro (16,67 ms) no teste físico; diferenças menores precisam ser comparadas à incerteza do método.

Registro mínimo por execução: `data, commit, corpus/hash, aparelho, driver, browser, codec, entrada/saída, modo, parâmetros, budget, alterações efetivas, duração, GPU p50/p95/p99, FPS, drops, freezes, decode, jitter, bitrate, qualidade, ghosting, latência/método, observações`.

## 8. Sequência concreta de trabalho

| Ordem | Arquivos previstos | Entrega e condição para seguir |
| --- | --- | --- |
| 1 | `tools/performance-harness.py`, player, diagnóstico do adaptador/engine | Baseline v7.1 exportável, amostras longas e identificação do ambiente; obter dados Dell |
| 2 | `src/shaders/spatial.glsl`, regressões/qualidade | P1 isolado, mesma quantidade de passes/targets; aprovar textura e custo |
| 3 | `tools/build.py`, shader RCAS próprio, avisos de terceiros | A/B de P2A e P2B; escolher por qualidade equivalente e custo, manter CAS como fallback |
| 4 | harness temporal; depois `motion.glsl`/`temporal.glsl` se justificado | Primeiro ampliar evidência; só então corrigir confiança ou testar alternativa estática |
| 5 | `docs/historico/validation-v3.md` ou novo registro v8 e roteiro Dell | Resultados reproduzíveis, limitações, preset aprovado; decidir release em tarefa posterior |

Conclusão da pesquisa: há uma v8 plausível sem trocar a plataforma. O investimento inicial de maior valor é **medir corretamente no Dell e tornar a correção espacial mais seletiva**, mantendo o custo estrutural atual. RCAS é o experimento seguinte mais delimitado. Não existe evidência para habilitar temporal por padrão, forçar 4K ou prometer ganho de performance no hardware alvo.
