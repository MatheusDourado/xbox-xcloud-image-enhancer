# Better xCloud — tratamento experimental v9.7.1

A **v9.7.1** corrige o que a primeira medição num aparelho real (Poco F7, Gears of War: E-Day) mostrou:
- **Adaptar à compressão** funciona sem o QP: o WebView do Android não informa o QP, e a adaptação ficava parada. Agora a compressão é estimada pela taxa de bits por pixel.
- **Tempo de GPU estimado** quando o navegador não tem cronômetro de GPU.
- **A medição registra o ritmo:** intervalos de cada quadro na tela, na chegada e no servidor, espera da Fluidez e uma linha do tempo por segundo da rede.

Veja [notas v9.7.1](docs/release-v9.7.1.md).

A **v9.7** prioriza **fluidez, nitidez e tratamento**:
- **Captura direta:** opcional, com a Fluidez ligada. Lê cada quadro decodificado da trilha WebRTC; quando os quadros chegam juntos, o vídeo exibe só um por atualização da tela e descarta os outros.
- **Tratamento que segue a compressão (QP) do stream.**
- **Perfis prontos.**
- **Painel redesenhado:** navegável por controle e toque.
- **Indicadores durante o jogo (HUD):** no celular, ficam na faixa preta lateral.

Veja [notas v9.7](docs/release-v9.7.md) e a [API do painel](docs/api-imagefilter.md).

A **v9.6.1** corrige a **Fluidez Máxima**, que com 2% de quadros faltando na origem escorregava a grade, acumulava espera e descartava quadros, e passa a desenhar todo quadro novo exibido pelo navegador. O painel mostra os quadros pulados antes do tratamento. Veja [notas v9.6.1](docs/release-v9.6.1.md).

A **v9.6** adiciona a **Fluidez**: cada quadro é tratado ao chegar e exibido em ritmo constante (seguindo o servidor ou numa grade fixa de 30/60 fps), contra as micro travadas a 30 fps em rede móvel. O painel mostra a origem do ritmo (servidor x chegada) e a espera acrescentada. Veja [notas v9.6](docs/release-v9.6.md).

Userscript Windows/Chrome/Tampermonkey baseado no Better xCloud 6.7.12 fornecido em `script.js`. O original foi preservado. A integração anterior foi confirmada pelo diagnóstico magenta no Dell; o tratamento anterior não trouxe ganho perceptível.

A **v9.5.1** corrige perdas de quadros no limitador de FPS, aplica **Suavidade** independentemente do renderizador e mantém RCAS na comparação de referência. O painel distingue o alvo de buffer solicitado do atraso medido; redesenhar o mesmo quadro não infla o ritmo. Veja [notas v9.5.1](docs/release-v9.5.1.md).

A **v9.4** testou o **H.264 High** (o xCloud só aceita H.264) e mostra no painel a latência por etapa: rede, buffer, decodificação e tratamento. Veja [notas v9.4](docs/release-v9.4.md).

A **v9.3** adicionou o **Codec (teste)**: oferece ao servidor só AV1, H.265 ou VP9 para descobrir se o xCloud aceita algo além do H.264. Veja [notas v9.3](docs/release-v9.3.md).

A **v9.2** mostrou no painel se a decodificação é por hardware e o DT por quadro, e marca o app Android como jogo (Game Turbo/Game Mode). Veja [notas v9.2](docs/release-v9.2.md).

A **v9.1** adicionou a **Reconstrução neural** experimental (desligada por padrão) e mede por que a nitidez alta não parece natural: ela aumenta a cintilação de textura. Para aparência de console, use Nitidez 2–3. Veja [análise v9.1](docs/analysis-v9.1.md).

A **v9** ajustou os padrões por medição objetiva (stream H.264 tipo xCloud comparado com referências limpas): nitidez **USM só na luma** (intensidade 3), piso de ruído no limitador, Detalhe 20%, Cor nas bordas 75%, e saída **Automática na altura real do vídeo na tela**, que no celular usa FSR e aplica a nitidez no tamanho final. Veja [análise v9](docs/analysis-v9.md).

A v8.6 devolveu o controle de nitidez: slider **Nitidez** (0–10, passo 0,5) no próprio painel, usado pelo tratamento e pela referência só CAS. O limitador de halos agora cresce com a intensidade (±4/255 em 2, ±12/255 em 10) e não corta mais o realce de textura de baixo contraste; na v8.5, nem a Nitidez 10 superava a referência CAS 2. O AA foi fundido na passagem espacial quando o temporal está desligado, sem passagem extra. Veja [validação v8.6](docs/validation-v8.6.md).

A v8.5 acrescentou **Cor nas bordas** (reconstrução da cor 4:2:0 guiada pela luma), **Detalhe** (realce só na luma, com coring contra ruído e ringing do encoder), saída **Automática** pela resolução física da tela/HDMI, EASU lendo cada texel uma vez e orçamento padrão de 6 ms. Tudo roda no mesmo passe espacial em 1080p; o padrão continua em duas passagens. Veja [validação v8.5](docs/validation-v8.5.md).

A v8 acrescentou **limpeza seletiva de cor/textura**, comparação com a limpeza v7.1, **RCAS experimental** como alternativa à nitidez nativa e exportação de diagnósticos. O padrão permanece em duas passagens WebGL2, CAS 2, saída nativa, Performance e orçamento 3 ms; temporal e AA desligados. Veja [pesquisa](docs/research-v8.md), [validação v8](docs/validation-v8.md) e [fontes/licenças v8](docs/third-party-v8.md).

Em **Limpeza espacial**, alterne Seletiva v8 / Referência v7.1 para comparar. Em **Nitidez final**, RCAS substitui CAS/USM, usa o mesmo controle de intensidade com outra escala e continua opcional. Não há comprovação de superioridade geral ou ganho sustentado na Iris Xe.

Use **Iniciar medição** e **Encerrar e exportar medição** no menu ou player para baixar um JSON local com o build, configurações, tempos GPU e contadores disponíveis. A captura é optativa, separa mudanças de configuração e não mede latência do controle. Exporte antes de encerrar a sessão. O player encerra a captura ao trocar de arquivo. A validação física no Dell segue pendente.

A v7.1 corrige as pendências de degradês, halos e movimento da v7. O caminho padrão em resolução nativa usa duas passagens de pixels na GPU (antes eram três), com nitidez e acabamento unidos. No modo Performance, os intermediários espaciais usam `RGBA8` com dithering antes da primeira quantização, preservando a distribuição dos níveis sem dobrar a memória desses buffers. No modo Qualidade e no histórico temporal opcional, usa-se `RGBA16F` quando disponível; há fallback para 8 bits. Buffers de movimento continuam em 8 bits. Isso não muda a profundidade de cor do stream ou da saída HDMI.

Para o Vostro 3400 ligado à TV por HDMI 1080p, comece em **saída Automática (resolve para nativa), Nitidez 3–5 no painel, orçamento 6 ms, Cor nas bordas 50%, Detalhe 35%, Degradês 30–50%, temporal e AA desligados**. A TV continua responsável por ampliar o sinal recebido para seu painel 4K. Forçar 4K no canvas não cria informação de uma renderização 4K do jogo, nem muda o sinal HDMI.

## Android (v9.7.1)

Há um APK de teste em `android/dist/xcloud-imagefilter-9.7.1.apk`: um app WebView próprio que abre o xCloud com este userscript (v9.7.1). Veja [android/README.md](android/README.md).

## Instalar

1. Desative outras versões do Better xCloud no Tampermonkey. Não execute duas juntas.
2. Substitua todo o conteúdo do script experimental por `better-xcloud-image-filter.user.js`, salve e recarregue o xCloud.
3. Mantenha resolução **1080p HQ**, qualidade **Alta**, bitrate **Ilimitado** e renderizador **WebGL2**.
4. Abra **Tratamento de imagem** no menu do Better xCloud, na seção **Vídeo**, logo após **Renderizador**.
5. Compare **Referência: só nitidez** e **Novo tratamento** na mesma cena, com a mesma Nitidez. **Vídeo original** desliga o tratamento e a nitidez.

Desde a v8.6, a intensidade vem do slider **Nitidez** do painel (0–10, passo 0,5); o slider nativo do Better xCloud não é usado no tratamento. O método vem de **Nitidez final** no painel; a opção **Seguir menu nativo** usa CAS/USM do Better xCloud. O modo Performance/Qualidade continua vindo do menu nativo. Há uma única etapa de nitidez após o tratamento e o upscale. **Referência: só nitidez** usa a mesma intensidade, sem os demais tratamentos; **Vídeo original** não aplica nitidez.

Compressão, degradês, temporal, upscale e diagnóstico ficam no mesmo menu. Os controles experimentais de saturação, contraste e sombras foram removidos; valores antigos dessas correções são neutralizados. O tratamento, incluindo a Nitidez do painel, é salvo para todos os jogos. A v6 também reinicia o tipo do renderizador ao encerrar a sessão para recriar o canvas no jogo seguinte e impede que uma inicialização assíncrona reative um motor já encerrado.

As configurações experimentais usam uma nova chave de armazenamento, sem importar os valores de 100% dos testes anteriores. Atualização oficial automática fica desativada nesta distribuição.

## Controles

| Controle | Efeito |
| --- | --- |
| Nitidez | 0–10 em passos de 0,5. CAS/USM (ou RCAS) após o tratamento, com limite de halo proporcional à intensidade. Também define a intensidade da referência só nitidez. |
| Compressão | Suaviza pequenos saltos entre regiões uniformes; protege bordas fortes e extremos locais de textura. Não é reconstrução por IA. |
| Degradês | Suaviza faixas com amostragem até 8 pixels, preservação de textura fina e dithering na quantização. |
| Cor nas bordas | O vídeo chega com cor em meia resolução (4:2:0) e o navegador a amplia borrada. Em bordas de luma, usa a cor limpa de cada lado (2 px) e a luma do pixel para decidir o lado. Cor fora dessa mistura (linhas finas, texto colorido) é preservada. |
| Detalhe | Realce de textura fina e contraste local (raio ~3 px) somente na luma, antes de temporal/upscale. Coring ignora diferenças fracas e cresce perto de bordas fortes, para não realçar ruído e ringing do encoder. Overshoot limitado. |
| Estabilidade em movimento | Tratamento temporal experimental: busca grosseira até aproximadamente 40 pixels e refinamento local em passos de meio pixel. Rejeita correspondências ruins e cortes. |
| Resolução de saída | Automática (padrão) usa a resolução física da tela/sinal HDMI: com HDMI 1080p fica nativa. Nativa (1080p quando essa for a fonte), 2K/1440p ou 4K/2160p. Mantém a proporção da fonte; os tamanhos indicados assumem 16:9. FSR 1 EASU amplia quando a saída supera a fonte, independentemente do tamanho da janela. |
| Antialiasing | Suavização direcional de bordas inclinadas antes do upscale/nitidez. Sem temporal, roda dentro da passagem espacial (sem custo de passagem extra). Inicia desligado; experimente 0–25%: valores altos suavizam bordas e reduzem a nitidez. Não é MSAA/TAA do jogo. |
| Tratamento na GPU | Adaptar acima de 3, 6 (padrão) ou 10 ms, ou manter todos os filtros ativos sem redução automática. |

Valores iniciais (v9): Nitidez 3 (USM só na luma), compressão 50%, degradês 30%, cor nas bordas 75%, detalhe 20%; temporal, antialiasing e reconstrução neural **desligados**; saída Automática, orçamento 6 ms, Fluidez e Suavidade desligadas. Experimente temporal em 20–40% e compare giros de câmera. Durante movimentos grandes, a etapa temporal pode rejeitar todo o histórico: isso protege contra rastros, mas limita o ganho.

**Diagnóstico: colorir imagem** confirma execução pela tonalidade magenta. **Restaurar tratamento** também reinicia o histórico e a adaptação de desempenho. Abra o menu de vídeo também durante tela cheia.

## Desempenho e limites

O painel informa quadros, cadência e, quando disponível, tempo GPU total no percentil 95. A medição GPU inclui os comandos de upload e todos os passes: é um limite conservador, não uma medição isolada de custo adicional. Acima do limite escolhido (6 ms por padrão) sustentado, reduz apenas etapas ativas nesta ordem: temporal; saída ampliada (2160p → 1440p → nativa, quando acima da fonte); AA; reconstrução neural; degradês (quatro amostras → duas → desligado); limpeza de compressão; detalhe e cor nas bordas. As preferências salvas são preservadas, e o painel mostra a resolução efetiva. Texturas que deixam de ser necessárias são liberadas.

**Manter todos os filtros ativos** impede essas reduções automáticas. Ajustar um controle do tratamento ou restaurá-lo reinicia a adaptação; ela não aumenta novamente a carga por conta própria. Todo o processamento dos pixels ocorre na GPU via WebGL2; essa opção não aumenta o clock nem altera a GPU escolhida pelo Chrome. A nitidez final permanece ativa conforme o controle nativo. CAS e USM têm limite de halos, e diferenças locais muito pequenas recebem menos reforço para evitar amplificar ruído.

Sem timers GPU, a adaptação compara os quadros exibidos com os quadros que o decodificador entrega naquele momento, respeitado o limite de FPS do Better xCloud. Uma queda por três janelas de dois segundos reduz os mesmos tratamentos: mais de 5% na captura direta e mais de 10% no elemento `<video>`, que também pula quadros sem sobrecarga. Se o navegador não informar os quadros recebidos, a referência é um trecho previamente medido em CAS/original, invalidada por mudanças de fonte, resolução selecionada ou alvo de FPS; sem ela, o painel informa apenas cadência. Não confundir isso com medição de latência dos controles.

O filtro processa quadros novos e não aguarda quadros futuros. Não controla o bitrate enviado pelo servidor, não recupera garantidamente texturas apagadas e não implementa FSR temporal de jogos nem IA. A seleção de saída chega a 2160p. Forçar 4K usa quatro vezes mais pixels que 1080p em várias etapas e pode reduzir a fluidez. Se o Windows enviar sinal de 1080p para a TV, o resultado 4K será reduzido para esse sinal; o userscript não muda a resolução do Windows/HDMI. Para exibir 4K físico, configure a saída do Windows em 3840×2160, se suportada pelo equipamento e conexão.

## Player para testes com vídeo

O player usa **o mesmo motor** do userscript. Abra um vídeo local, pause numa cena e alterne os modos; exporte o quadro para comparação. É possível usar arquivos de vídeos do YouTube obtidos com autorização, mas não URLs do site nem players incorporados: acesso à textura pode ser restringido por origem.

```sh
python3 tools/build.py
python3 -m http.server 8765 --bind 127.0.0.1
```

Abra `http://127.0.0.1:8765/player/`. Os dois lados usam o mesmo elemento de vídeo, portanto não há divergência entre instantes.

```sh
python3 tools/make-test-videos.py
```

Requer FFmpeg com libx264. Gera `output/videos/reference.mp4` e versões com alvos de 5, 15 e 20 Mbps. A referência é H.264 de alta qualidade (CRF 10), **não lossless**; a cena é sintética, não Hellblade. Os alvos são limites do encoder e a taxa real pode ficar abaixo deles em cenas simples. Os arquivos foram gerados nesta sessão e podem ser usados imediatamente.

## Verificação

```sh
node --test tests/*.cjs
node --check better-xcloud-image-filter.user.js
python3 -m pip install playwright==1.60.0
python3 -m playwright install chromium
python3 tools/run-browser-tests.py
```

Com o servidor acima, abra `/output/playwright/filter-harness.html`, `/output/playwright/regressions-v7.html` e `/output/playwright/motion-quality.html`. Testam shaders reais, modos, dithering, preservação de textura, halos CAS/USM, corte, preto, upscale, adaptação, diagnóstico e liberação de recursos. Ao desenvolver, desative o cache no navegador para não medir um bundle anterior. O player permite validar reprodução de vídeo, exportação e ajustes.

Consulte `docs/validation-v3.md` para os resultados e as pendências. Mudança em pixels não comprova melhora visual. A aprovação de ganho em Hellblade e teste de pelo menos dez minutos no Dell continuam necessários; não há evidência para prometer que essa versão resolve o problema.

Use o [roteiro de comparação no Dell](docs/teste-dell.md) para registrar os três modos na mesma sessão.

## Fontes e licenças

- Better xCloud: https://github.com/redphx/better-xcloud — MIT, redphx.
- FSR 1: https://github.com/GPUOpen-Effects/FidelityFX-FSR — MIT, AMD. Fonte original vendorizada em `src/vendor/ffx_fsr1.h`; port GLSL em `src/shaders/easu.glsl`, com licença preservada. Usa reciprocais exatos e emulação de textureGather por texelFetch no WebGL2.
- libplacebo: https://github.com/haasn/libplacebo — referência conceitual de debanding; nenhum código foi copiado. O debanding implementado é próprio.

Não adicionar sharpening de outro aplicativo sobre o resultado sem compará-lo isoladamente. Para retornar à versão oficial, desative este script e reative o original.

## Verificação de movimento v4

`python3 tools/quality-harness.py` gera `/output/playwright/motion-quality.html`. Compara erro em textura não periódica limpa e ruidosa, usando a mesma etapa de nitidez, em deslocamentos de 0 a 8, 16 e 32 pixels por quadro. Exige redução de erro de pelo menos 15% em cada caso. É um teste de redução de ruído em movimento, não uma prova de recuperação de detalhes descartados pelo xCloud.

## Teste com imagens reais de Hellblade

Foi usado um trecho curto do trailer oficial Xbox (`https://www.youtube.com/watch?v=3VYGOkMnGCE`), disponibilizado publicamente. Referência 4K reduzida para 1080p e uma versão H.264 CRF32 com teto de 5 Mbps. A taxa efetiva dessa amostra foi 0,407 Mbps: não é uma reprodução exata do seu stream de 5 Mbps. `tools/gameplay-harness.py` gera uma comparação de luminância e bordas sobre os arquivos locais correspondentes. Quadros pretos são excluídos e a medição exige ao menos oito quadros visíveis. Não há download automático no userscript.

Em 23 quadros desse trecho, o tratamento espacial teve menor erro que CAS em 2; o temporal acrescentou ganho muito pequeno e maior custo. Por isso permanece desligado por padrão. A v5 evita duas cópias de históricos usando buffers alternados. Veja o registro de validação para números e limitações.
