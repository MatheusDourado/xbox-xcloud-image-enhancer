# Validação v8.6 — 2026-10-10

Base: `96ad3bf` (v8.5). Ambiente local: Chromium headless com ANGLE/SwiftShader (CPU). **Não é validação no Dell/Iris Xe nem sessão de xCloud.**

## Problema relatado na v8.5 (Dell Vostro 3400, Iris Xe, Chrome)

- Degradês melhoraram, mas falta nitidez: **Referência CAS 2** parecia mais nítida que o tratamento, e não havia como aumentar o peso do CAS de forma perceptível.
- GPU p95 de 6–8 ms com Degradês 100% e AA 100%; 3,5 ms com AA 0.

## Causa encontrada

1. O limitador anti-halo do CAS/USM/RCAS no tratamento (`limitSharpen`) fazia duas coisas:
   - reduzia o realce em vizinhanças com faixa abaixo de 12/255 — justamente textura de baixo contraste (pele, tecido, vegetação, asfalto);
   - prendia o resultado a ±4/255 da vizinhança em **qualquer** intensidade.
   Resultado medido (ganho de alta frequência numa textura de ruído multiescala, 1 = sem nitidez):

   | Caminho | v8.5 | v8.6 |
   | --- | --- | --- |
   | Referência CAS 2 (sem limitador) | 2,29 | 2,29 |
   | Tratamento padrão, Nitidez 2 | 1,75 | 2,07 |
   | Tratamento padrão, Nitidez 6 | 2,21 | 3,29 |
   | Tratamento padrão, Nitidez 10 | 2,40 | 4,43 |

   Na v8.5, nem a Nitidez 10 passava da referência CAS 2: o controle existia, mas quase não mudava a imagem.
2. A intensidade vinha do slider nativo **Nitidez** do Better xCloud, fora do painel, e a referência ficava fixa em 2.
3. O AA era uma passagem de tela inteira extra com buffer 1080p próprio. Na Iris Xe, que usa a RAM do sistema, cada passagem extra custa banda de memória; isso é coerente com o salto relatado, embora o número exato não tenha sido medido aqui.

## Mudanças

- **Nitidez no painel** (0–10, passo 0,5), aplicada ao tratamento **e** à referência "só CAS" (A/B com a mesma intensidade). O slider nativo deixa de influenciar este painel; CAS/USM e Performance/Qualidade continuam vindo do menu nativo.
- **Limitador proporcional**: margem de halo = (2 + Nitidez)/255 → ±4 em 2 (igual à v8.5), ±12 em 10. A atenuação de baixo contraste agora só ignora diferenças de 1–5/255 (ruído/dither), não textura real. Vale para CAS, USM e RCAS.
- **AA fundido na passagem espacial** quando o temporal está desligado: o caminho padrão continua com duas passagens mesmo com AA ligado. Com temporal ligado, o AA continua separado (precisa vir depois do histórico).
- Versão `6.7.12-imagefilter.8.6`; diagnóstico `version: '8.6'`.

## Evidência

- 22 testes Node.
- 53 verificações Chrome/WebGL/DOM (novas: slider Nitidez no painel com passo 0,5; o slider nativo não sobrescreve o painel; a referência acompanha o painel).
- 36 regressões de pixels. Novas: halo ±4 em Nitidez 2 e ±12 em 10 para CAS/USM/RCAS em Performance e Qualidade; AA fundido mantém 2 passagens (`spatial`, `casFiltered`); AA continua separado com temporal; em textura 2×2 ±8, a Nitidez 6 do tratamento supera a referência CAS 2 (3,01 vs 2,61).
- 11 movimentos sintéticos passaram; temporal inalterado.
- Custo relativo em SwiftShader 1080p (CPU, não representa Iris Xe): padrão + AA 100 caiu de 5,55× para 5,52× o original e Degradês 100 + AA 100 de 6,16× para 5,87×. Em CPU o gargalo é ALU; o ganho esperado na Iris Xe vem da banda de memória economizada e precisa ser medido no Dell.

## Recomendações para o Dell

- Comece com **Nitidez 3–5**, Detalhe 35–60%, Degradês **30–50%** e AA **0–25%**. Degradês 100% amplia o raio para 8 px e aceita diferenças de até ~13/255 como "plano", o que alisa textura fraca. AA alto suaviza bordas diagonais; os dois vão contra a nitidez.
- Compare **Novo tratamento** e **Referência: só CAS** com a mesma Nitidez.
- GPU p95 não é latência: a 60 FPS o quadro tem 16,7 ms. Enquanto o p95 ficar abaixo de ~10–12 ms e não houver queda de FPS, o efeito na latência é pequeno. Saída 4K com HDMI 1080p só aumenta o custo.
