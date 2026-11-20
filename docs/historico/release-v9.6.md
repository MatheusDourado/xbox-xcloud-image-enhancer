# v9.6 — Fluidez: quadros exibidos em ritmo constante

Userscript `6.7.12-imagefilter.9.6` e app Android **9.6**. Imagem igual à v9.5.1.

Motivo: a 30 fps (Forza Horizon 6 no modo qualidade, Gears), a câmera dava micro travadas com o contador em 30 FPS. Nos testes no Poco F7 (5G), o intervalo entre quadros variava ±10 ms, com picos de 50–65 ms. Isso não melhorou ao tirar o FSR (não é custo de GPU) nem com o buffer do WebRTC (a "Suavidade"). Até aqui, cada quadro era desenhado **no instante em que chegava**, e qualquer variação ia direto para a tela.

## Novidades

- **Fluidez (ritmo de exibição)**, no painel:
  - *Desligada* (padrão): como antes, exibe ao chegar.
  - *Equilibrada*: cada quadro é tratado ao chegar, guardado numa textura e **exibido seguindo o ritmo de captura do servidor** (timestamp RTP do WebRTC), com uma espera adaptativa igual ao percentil 95 do atraso recente da rede. Elimina a irregularidade da rede e do decodificador e mantém a do próprio jogo.
  - *Máxima*: impõe uma grade fixa (33,3 ms a 30 fps, 16,7 ms a 60 fps), que regulariza também um ritmo irregular do jogo ou do servidor. Espera um pouco maior.
  - A troca é **latência**: o painel mostra a espera real (`Fluidez equilibrada: +9,4 ms de espera`). A fila nunca passa de ~1,5 quadro atrás do tempo real; se atrasar, o quadro mais antigo é descartado e contado.
- **Origem do ritmo**, no painel: `Origem: servidor 33,3 ± 0,4 • chegada 33,6 ± 9,8`. O *servidor* é o intervalo entre as capturas no xCloud; a *chegada*, o intervalo de recebimento no aparelho. Se o servidor já vem irregular, a causa é o jogo ou o encoder (use *Máxima*); se só a chegada varia, é a rede ou o decodificador (*Equilibrada* resolve).
- **Ritmo na tela** passa a medir o momento em que o quadro é realmente exibido.

## Simulação (stream de 30 fps com chegada irregular tipo 5G, tela de 120 Hz)

| Modo | Variação na tela | Travadas | Espera extra |
| --- | --- | --- | --- |
| Desligada (exibe ao chegar) | ±6,7 ms | 7 | 0 |
| Equilibrada | ±2,4 ms | 0 | ~9 ms |
| Máxima | ±0,5 ms | 0 | ~17 ms |

Com tela a 60 Hz, a Equilibrada chegou a ±0,0 ms (todos os quadros exatamente a cada 2 atualizações), com ~17 ms de espera. Simulação, não medição no aparelho.

## Como testar

1. No Forza Horizon 6 (qualidade, 30 fps), com Fluidez **Desligada**, anote **Ritmo na tela** e **Origem**.
2. Mude para **Equilibrada** (vale na hora) e compare o Ritmo, as travadas e a sensação ao girar a câmera.
3. Se o **servidor** aparecer irregular, teste **Máxima**.
4. Deixe a **Suavidade** em Automático; a Fluidez a substitui.
5. **Copiar configuração** agora inclui o estado da Fluidez.

Validação: 36 testes Node (compassador: chegada irregular → cadência estável, modo máximo, descarte da fila e relógio RTP de 32 bits), 73 verificações Chrome/WebGL/DOM (texturas persistentes, exibição pelo relógio do compassador, liberação ao desligar, linhas de origem e espera), 43 regressões de pixels e 11 casos de movimento. APK com o mesmo certificado da série 9.x. Não testado ainda no aparelho.

Assets: `better-xcloud-image-filter.user.js` (PC) e `xcloud-imagefilter-9.6.apk` (instala por cima da 9.x).
