# v9.6.1 — Fluidez Máxima sem deriva, quadros novos sempre desenhados

Userscript `6.7.12-imagefilter.9.6.1` e app Android **9.6.1**. Imagem igual à v9.6, exceto a referência só nitidez com saída acima do vídeo (abaixo).

Motivo: no Poco F7 (export do painel), a **Fluidez Máxima** deixou o ritmo na tela pior que a chegada (±8,2 ms contra ±5,3 ms, 3 travadas em 2 s), com +35,6 ms de espera e 287 quadros descartados. O servidor mandava `34,0 ± 4,7 ms`: exatamente 30 FPS com ~2% dos quadros faltando (média 33,3 × 1,02; desvio 33,3 × √(0,02 × 0,98) = 4,67).

## Correções

- **Fluidez Máxima:** a cadência era a *média* dos intervalos, e cada quadro faltando a esticava para 34,0 ms, fora da tolerância de 0,6 ms para fixar 30 FPS. A grade de 34,0 ms escorregava 0,67 ms por quadro: a espera crescia até o limite de 1,5 quadro, então quadros eram descartados e o ciclo recomeçava. Agora:
  - a cadência é a **mediana** dos intervalos (um quadro faltando não a altera), fixada em 30/60 FPS com tolerância de 2/1 ms;
  - a grade conta **períodos inteiros**: um quadro que falta na origem mantém o anterior por exatamente dois períodos, e o seguinte volta ao horário certo;
  - a grade segue o relógio do servidor devagar (5% por quadro): absorve deriva, não o tremor;
  - a espera cobre o maior atraso dos últimos 3 s (Máxima) ou o percentil 95 (Equilibrada). Sobe na hora e **desce 0,25 ms por quadro** quando a rede acalma; antes, na Máxima, ela só subia.
- **Quadros novos pulados:** o adaptador reconhecia quadro novo pelo `totalVideoFrames`, que no WebRTC conta quadros na *chegada*. Um quadro chegado antes do callback anterior podia ser exibido depois com o mesmo número e não era desenhado. Reproduzido num WebRTC local no Chromium (1 vez a cada ~280 quadros). Agora usa `presentedFrames` do `requestVideoFrameCallback`.
- **Diagnóstico novo:** `Quadros pulados antes do tratamento: X de Y em 2 s`. São quadros que o navegador exibiu entre dois callbacks, ou seja, que nunca chegaram ao tratamento nem à tela. Se esse número explicar os ~2% de buracos, eles nascem no aparelho (quadros chegando juntos), não no servidor.
- **Referência só nitidez:** com a saída maior que o vídeo (Automática no celular, 2K/4K), o CAS/USM da referência amostrava vizinhos a menos de um texel e ficava até 4× mais fraco (USM: 7 contra 28 níveis em 2×). Agora usa o tamanho do vídeo.
- **Fluidez após erro:** uma falha da GPU ou a restauração do contexto encerram também o laço de exibição da Fluidez.
- **Painel:** não mostra mais "Codec undefined" antes de o navegador informar o codec.
- **App Android:** se o sistema encerrar o app em segundo plano e nada puder ser restaurado, abre o xCloud em vez de uma tela preta.

## Simulação (fluxo do app: um quadro de vídeo por atualização da tela, tela de 120 Hz)

| Cenário | Modo | Variação na tela | Travadas em 2 s | Espera | Descartados/min |
| --- | --- | --- | --- | --- | --- |
| Export (30 FPS, 2% faltando) | Máxima v9.6 | ±3,0 ms | 0,24 | 27,4 ms | 9 |
| | **Máxima v9.6.1** | ±4,9 ms | 1,28 | **5,1 ms** | **0** |
| 5G com picos (10% +20–35 ms) | Máxima v9.6 | ±4,7 ms | 0,76 | 25,8 ms | 29 |
| | **Máxima v9.6.1** | ±7,2 ms | 2,66 | 30,2 ms | **0** |
| Jogo irregular (captura ±4 ms) | Máxima v9.6 | ±0,2 ms | 0 | 13,5 ms | 0 |
| | **Máxima v9.6.1** | ±1,7 ms | 0,07 | 15,0 ms | 1 |

Atenção à leitura: a v9.6 parecia ter menos "travadas" porque **escondia** os buracos. Atrasava tudo e descartava quadros, mas o intervalo na tela continuava regular, e um quadro descartado faz o conteúdo pular sem aparecer como travada. As travadas restantes da v9.6.1 são os quadros que faltam antes do tratamento, exibidos no tempo certo. No aparelho, a v9.6 ainda mostrou ±8,2 ms. Simulação, não medição no aparelho.

## Como testar

1. Fluidez **Equilibrada** e **Máxima**, cada uma por alguns minutos no mesmo jogo. Com o servidor regular, as duas devem ficar parecidas; a Máxima espera mais quando a rede oscila.
2. Anote **Ritmo na tela**, **Origem** e a linha nova **Quadros pulados antes do tratamento**.
3. Repita com **Suavidade** em Automático e em 33/50 ms: um buffer maior pode reduzir os quadros que chegam juntos e são pulados.
4. Envie **Copiar configuração** de cada teste.

Validação local: **37 testes Node** (inclui o cenário do export: cadência fixada em 30 FPS, nenhum descarte, espera que volta a cair após uma rajada; o compassador da v9.6 falha nele), **78 verificações Chrome/WebGL/DOM**, **43 regressões de pixels** e **11 casos de movimento**. APK assinado com o certificado da série 9.x. Não testado no aparelho.

Arquivos: `better-xcloud-image-filter.user.js` e `android/dist/xcloud-imagefilter-9.6.1.apk` (instala por cima da 9.6).
