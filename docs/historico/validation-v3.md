# Validação da versão 6.7.12-imagefilter.3

2026-10-09. Implementação realizada sobre script.js (Better xCloud 6.7.12).

## Resultado técnico

- Sete testes Node passaram: configurações, histórico, adaptação GPU, isolamento de referência e adaptação por cadência.
- Verificação de sintaxe passou para userscript e player.
- Vinte e duas verificações no Chrome/WebGL2 passaram, incluindo redução do salto numa borda sintética de compressão, alteração de degradês, estabilidade de preto, corte de cena, FSR, diagnóstico, descarte de recursos e integração com refreshPlayer do Better xCloud.
- O player carregou e reproduziu o arquivo H.264 de 5 Mbps em 1920×1080/60. Tempo GPU total p95 observado nesta execução curta no Mac: aproximadamente 2,14 ms. Não é benchmark do Dell nem de latência completa.
- A exportação do quadro PNG funcionou. Evidência: output/playwright/exported-frame.png.
- FFprobe confirmou 1920×1080, 60 FPS nas quatro amostras. Bitrates médios: referência CRF10 15,31 Mbps; alvos 5/15/20 Mbps resultaram em 4,87/14,60/19,49 Mbps.

## Decisões de implementação

- Temporal inicia desligado: não há ainda evidência de ganho perceptível sem rastros em Hellblade. Está implementado e testável pelo controle.
- O budget GPU usa tempo total como limite conservador de 3 ms, incluindo upload/CAS, em vez de atribuir com falsa precisão apenas o custo adicional. A referência não reduz os efeitos.
- Sem timers, adaptação exige referência de cadência medida no mesmo vídeo, resolução e continuidade. Referência é invalidada em pausa/seek, nova fonte e mudança de dimensões; o adaptador também invalida ao trocar o alvo de FPS.
- Debanding é uma implementação própria; libplacebo serviu como referência conceitual. Nenhum código LGPL foi incorporado.
- A amostra sintética é reproduzível e gerada localmente; não foi baixado gameplay do YouTube. Referência CRF10 é de boa qualidade, não lossless. Ela não permite concluir ganho visual em Hellblade.

## Revisão independente e correções

A revisão identificou mistura de medições de referência com tratamento, reset incompleto da adaptação, programa GL errado após render e referência de cadência obsoleta. Esses pontos foram corrigidos. Foram acrescentadas verificações de regressão para isolamento da referência, reset do budget e atualização das configurações originais.

## Pendências para aceitação no aparelho

1. Comparar CAS em 2 e novo tratamento na mesma cena de Hellblade, com câmera parada e girando. Avaliar rostos, cabelo, roupas, sombras e textos.
2. Testar temporal em 20–40% e verificar rastros durante movimentos rápidos e cortes. Uma busca com correspondência ruim deve reduzir seu aproveitamento.
3. Medir pelo menos dez minutos no Dell, usando o mesmo trecho e resolução. A queda de cadência deve ficar abaixo de 5% frente ao CAS.
4. Validar fullscreen e sessão real de xCloud no Windows. Aqui a integração foi exercitada com o renderizador upstream e uma fonte sintética, sem sessão autenticada do serviço.

A implementação está disponível para teste. Os critérios de ganho visual em Hellblade e desempenho sustentado no Dell **não foram comprovados**. Não interpretar compilação ou mudança de pixels como evidência de reconstrução de texturas perdidas.

## Continuação: versão 6.7.12-imagefilter.4

A busca temporal foi ampliada: busca fina local, busca grosseira até 32 pixels da fonte e refinamento até aproximadamente 40 pixels. O campo de movimento usa amostragem nearest e decodificação arredondada para não misturar vetores de regiões diferentes nem introduzir deslocamento fracionário pela quantização RGBA8.

Foi criado `tools/quality-harness.py`, que usa uma textura de blocos não periódica com movimento conhecido e ruído determinístico de ±4 níveis. A referência é a textura limpa com a mesma etapa de nitidez. Temporal foi testado em 100%, com as outras correções espaciais desligadas, para isolar sua contribuição. Cada caso mede 25 quadros após aquecimento.

| Deslocamento por quadro | Redução de erro MSE com temporal |
| --- | --- |
| 0 pixels | 30,25% |
| 4 pixels | 31,27% |
| 8 pixels | 31,43% |
| 16 pixels | 31,54% |
| 32 pixels | 27,24% |

A versão anterior reduzia apenas 0,88% nesse mesmo caso de 16 pixels por quadro. O teste agora exige pelo menos 15% de redução em todos os cinco casos e passou no Chrome local.

Este resultado comprova redução de ruído na amostra sintética com movimento conhecido. Não comprova reconstrução de texturas perdidas na compressão, melhora de gameplay real ou fluidez no Dell. Temporal permanece desligado por padrão e a aceitação no aparelho segue pendente. O tempo GPU de 2,14 ms registrado acima foi medido na v3 com temporal desligado, não nesta nova busca temporal.

## Continuação: versão 6.7.12-imagefilter.5 — imagens reais

Fonte: trailer oficial do Xbox, https://www.youtube.com/watch?v=3VYGOkMnGCE . Foi baixado um trecho solicitado de 35–45 segundos, em VP9/4K, sem cookies nem login. A extração por keyframes pode conter preroll; a referência local foi recodificada para 1080p e a cena foi selecionada por inspeção visual (Senua numa ponte em cenário escuro). Os arquivos ficam em output/videos, ignorado pelo git.

Referência local H.264 CRF12. Versão degradada H.264 CRF32 com teto 5 Mbps e taxa efetiva de 0,407 Mbps; não simula exatamente o xCloud. A comparação usa um segundo consecutivo a partir de 5 segundos do arquivo local; os cinco primeiros quadros são aquecimento e quadros totalmente pretos são excluídos. Foram medidos 23 quadros válidos. Métricas em luminância, amostragem a cada quatro pixels e máscara que exclui luminância menor que 5/255.

| Modo | MSE luminância | MSE das diferenças horizontais | GPU total p95 neste benchmark |
| --- | --- | --- | --- |
| CAS em 2 | 3,917636 | 2,367711 | Não coletado pelo budget |
| Espacial | 3,690342 | 2,135022 | 2,18 ms |
| Espacial + temporal 30% | 3,688004 | 2,134206 | 7,56 ms |

O espacial reduziu o erro de luminância aproximadamente 5,8% e o erro nas diferenças horizontais aproximadamente 9,8% frente ao CAS. O temporal acrescentou somente aproximadamente 0,06% de redução de erro de luminância frente ao espacial neste trecho. Os números não são um índice geral de qualidade percebida. O benchmark utiliza vários contextos e leituras de pixels para análise; seu tempo GPU não equivale ao comportamento de uma sessão normal de jogo.

Os resultados do primeiro intervalo, que continha um logotipo, foram descartados. Uma execução com referências vazias também foi descartada. O harness agora aguarda a atualização de apresentação após seek, exclui quadros pretos e exige quantidade mínima de quadros visíveis.

A v5 alterna buffers de histórico e de imagem reduzida em vez de copiar os dois a cada quadro. Não há evidência suficiente para atribuir ganho de desempenho a essa otimização; a correção deve ser confirmada nas regressões. Temporal continua desligado por padrão devido ao custo e ao pequeno ganho adicional observado nessa cena. Reconstrução de detalhes perdidos e desempenho sustentado no Dell seguem sem comprovação.

## Versão 6.7.12-imagefilter.6 — menu e troca de sessão

O usuário relatou melhora visual inicial com a v5, ainda sem avaliação prolongada. Solicitou controles no menu nativo, remoção das correções experimentais de cores e nitidez ajustável. Relatou que mudar de jogo impedia o diagnóstico até recarregar a aba.

Causa encontrada no gerenciador upstream: `destroy()` remove o canvas sem reiniciar `playerType`; uma sessão seguinte com o mesmo tipo não recria o renderizador. O build agora reinicia esse estado. A inicialização do adaptador também verifica `isStopped` depois do await, evitando reativar um motor encerrado. O erro inicial de importação relatado não foi reproduzido; essa proteção não prova sua causa.

Os controles extras são inseridos no grupo Vídeo, após Nitidez, usando as classes de linhas do Better xCloud. Uma instância dos controles é reutilizada quando o menu é reconstruído. Nitidez, processamento CAS/USM e modo Qualidade/Performance vêm das preferências nativas em cada renderização, inclusive quando o quadro não mudou. A referência CAS2 continua fixa. O limitador de halos normaliza os limites de vizinhança no modo Qualidade para preservar luminância uniforme.

Validação local: nove testes Node passaram, incluindo três sessões consecutivas com o gerenciador extraído do userscript gerado. O harness Chrome passou 32 verificações WebGL/DOM, incluindo nitidez alterando pixels, preservação de luminância no modo Qualidade, controles montados no contêiner do menu, valores mantidos após reconstrução do menu, diagnóstico num novo player e encerramento durante setup assíncrono. A sessão autenticada de xCloud e a aparência do menu no Dell ainda precisam da confirmação do usuário.

## Versão 6.7.12-imagefilter.7 — saída forçada, AA e orçamento GPU

Seleção de saída nativa, 1440p ou 2160p, com proporção da fonte preservada. Para fonte 16:9 resulta em 2560×1440 ou 3840×2160. Não depende do tamanho CSS da tela nem do DPR. A saída nativa acompanha a resolução efetivamente decodificada; selecionar 4K não altera o stream enviado pelo serviço nem o sinal HDMI do Windows. O player local compartilha a mesma seleção e o mesmo motor.

Antialiasing direcional próprio, opcional e desligado por padrão: detecta bordas inclinadas com alto contraste e mistura amostras ao longo da direção da borda. Executa após temporal, antes de EASU e nitidez. Não usa dados geométricos do jogo; não equivale a MSAA/TAA nem promete reduzir todo o shimmering. O teste comprova mistura na borda sintética inclinada e preservação de preto/branco uniforme e borda alinhada aos eixos.

Política GPU: limiares de 3, 6, 10 ms ou manual (0), mantendo a medição p95. Manual impede reduções automáticas por tempo GPU e cadência; não desativa a rejeição temporal de correspondências ruins. As etapas de pixels já rodam na GPU em todas as políticas.

Doze testes Node e 40 verificações WebGL/DOM passaram. O Chrome renderizou targets 3840×2160 e 2560×1440 independentemente da janela menor, retornou à saída nativa e não apresentou erros GL. Isso comprova tamanho interno e execução; não comprova fluidez 4K no Dell nem resolução física recebida pela TV. A avaliação visual de AA em Hellblade permanece pendente.

## Versão 6.7.12-imagefilter.7.1 — correções para GPU integrada

Revisão e implementação em 2026-10-09 (horário de São Paulo), sobre `1b33753`.

### Defeitos reproduzidos antes das correções

- Num degrau cinza 100/120 e nitidez máxima, USM produziu extremos 86/134 no modo Performance e 83/137 no modo Qualidade. Só o CAS tinha o limite de halos.
- A cadeia nativa quantizava o resultado espacial e a nitidez para RGBA8 antes do dithering. Uma coluna de borda suavizada permaneceu inteiramente no nível 57; o ruído final não recuperava sua distribuição fracionária.
- Debanding a 100% reduziu uma linha fina de cinza 104 sobre fundo 100 para 101, apagando textura de baixo contraste.
- O teste temporal original cobria apenas múltiplos de quatro pixels. Ao incluir 2 e 6 pixels por quadro, a redução de erro ficou em 6,82% e 7,13%, abaixo do limiar de 15% do harness.
- A adaptação desativava temporal mesmo quando ele já estava desligado, não limitava a resolução/AA e mantinha a mesma quantidade de amostras no primeiro nível reduzido de debanding.

### Alterações verificadas

- Nitidez e acabamento executam juntos. Configuração padrão nativa: duas passagens; tratamentos espaciais/temporal/AA desligados: uma passagem. CAS e original também não precisam do intermediário final.
- CAS e USM respeitam o intervalo local com margem de quatro níveis. Diferenças locais muito pequenas recebem menos nitidez; a limpeza espacial protege reversões de gradiente, sem um mapa ou passagem de classificação adicional.
- Performance usa intermediários espaciais RGBA8 com dithering antes da primeira quantização. Qualidade usa RGBA16F quando suportado; o histórico temporal também usa essa precisão quando disponível. Movimento, corte e imagens reduzidas continuam em RGBA8. Testado o fallback de Qualidade forçando a ausência da extensão de float targets.
- A borda suavizada agora distribui os níveis 57 e 58 em ambos os caminhos. A linha fina permanece em 104. Esse teste comprova o funcionamento da quantização e a preservação dessa textura sintética, não a qualidade perceptual de todo vídeo.
- Movimento recebe refinamento na resolução original em passos de um pixel e meio pixel, calculado somente no campo reduzido de vetores. Codificação RGBA8 preserva zero e passos de meio pixel exatamente. Amostras do quadro atual são reutilizadas entre candidatos. O campo continua baseado em blocos; não é optical flow denso nem TAA do jogo.
- Sob sobrecarga sustentada, apenas tratamentos ativos são reduzidos: temporal, resolução ampliada, AA, amostras de debanding e limpeza. Preferências salvas permanecem intactas. Timings de uma etapa de adaptação anterior não provocam imediatamente outra redução. O modo manual impede todas essas reduções.
- Redução de resolução funciona através do adaptador inclusive num quadro pausado. Voltar à resolução nativa libera a textura ampliada. Desligar tratamentos libera seus intermediários. Alterar os controles reinicia orçamento/histórico; não há recuperação automática de carga para evitar oscilações.

### Verificação local

16 testes Node, 44 verificações de integração WebGL/DOM e 12 regressões de pixels/passagens/memória passaram. A compilação dos shaders reais e as verificações de sintaxe do userscript, adaptador, motor e player passaram.

O harness temporal passou nos 11 deslocamentos: 0–8, 16 e 32 pixels/quadro. Redução de MSE observada: aproximadamente 17,0% em 2 pixels, 18,7% em 6 pixels, 38,2% em 4 pixels e 34,4% em 32 pixels. Cada comparação usa a mesma nitidez na referência limpa e nos modos comparados da versão atual. Como a nitidez e a precisão também mudaram, esses números não isolam o ganho do novo estimador frente à v7.

Foi feita uma amostragem curta de custo em Chrome/ANGLE Metal, **Apple M4**, fonte canvas 1920×1080, 150 quadros por configuração, orçamento manual e últimas 60 amostras GPU. Não inclui decode de vídeo nem mede latência de controle:

| Motor | Temporal desligado, GPU p95 | Temporal 30%, GPU p95 |
| --- | --- | --- |
| v7 (`1b33753`) | 2,71 ms | 5,43 ms |
| v7.1 final, Performance | 2,74 ms | 5,30 ms |

O custo foi semelhante nessa execução; menos passagens **não comprovaram ganho de velocidade**. Uma primeira variante com buffers espaciais de 16 bits por padrão mediu 2,97 ms; por isso essa precisão foi reservada ao modo Qualidade e ao histórico opcional. Não extrapolar esses tempos para a Intel Iris Xe.

Reprodução: gerar os três harnesses descritos no README e abrir suas páginas com cache desativado. `python3 tools/performance-harness.py` gera `/output/playwright/cost-v7.html`; adicionar `?baseline` usa o bundle da v7 extraído do Git. Alternar as versões sob as mesmas condições. Os testes existentes de Hellblade não foram repetidos: os vídeos usados anteriormente não são distribuídos pelo Git.

Permanecem necessárias a avaliação visual de gameplay real e a medição sustentada no Dell. Temporal e AA continuam desligados por padrão; saída nativa, CAS 2, Performance e orçamento de 3 ms são o ponto inicial. Nenhuma reconstrução por IA, supersampling adicional ou alteração de decoder foi introduzida.
