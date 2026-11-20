# v10.2.0 — frame time e GPU no HUD, tela a 60 Hz e pedido de 1440p

Userscripts `6.7.12-imagefilter.10.2.0` (www.xbox.com, sobre o Better xCloud 6.7.12) e `10.2.0-play` (play.xbox.com), app Android **10.2.0** (`versionCode` 100200). Inclui tudo da [v10.1.3](historico/release-v10.1.3.md). Nenhum filtro de imagem mudou: tratamento e padrões são os mesmos.

Esta versão saiu sem medição no aparelho. O voto de 60 Hz, o pedido de 1440p e a leitura da carga da GPU foram testados só na lógica (testes Node e de navegador). O efeito real no Poco F7 ainda precisa ser medido.

## O que mudou

### Indicadores no jogo (HUD)
- **Frame time explícito.** A linha de ritmo mostra o tempo médio entre quadros na tela e o desvio: `MS 16,7 ±0,9`. 16,7 ms é 60 FPS e 33,3 ms é 30 FPS; o desvio diz o quanto oscila. O HUD completo mostra também o p95.
- **Uso de GPU em %**, no compacto, na coluna lateral do celular e no completo. Amarelo a partir de 75%, vermelho a partir de 90%.
  - Sem `≈`: carga da GPU inteira, lida pelo app Android no driver Adreno.
  - Com `≈`: o sistema não deixou ler (ou é navegador). O número é o tempo de GPU do tratamento dividido pelo tempo de quadro. Cobre só o tratamento, e a estimativa lê alto no WebGL2.
- **Barra de atraso com cores distintas** no HUD completo, repetidas nas letras da legenda: rede (R) azul, buffer (B) roxo, decodificação (D) laranja, tratamento (T) verde, espera (E) rosa. Antes eram cinco tons de cinza.

### Tela a 120 Hz com jogo a 60 FPS
- **Aviso novo** no painel e no HUD quando a tela está a 90/120 Hz e o stream chega a ~60 FPS. Na medição de 2026-11-09 no Poco F7 essa foi a maior causa local de engasgos: a 60 Hz a decodificação caiu de 25 para 9 ms e o desvio do frame time de 7 para 2,5 ms.
- **O app lê a taxa real do painel** (`BxAndroid.getDisplayHz()`). Se você fixou 60 Hz em *Taxa da tela* e o sistema manteve 120 Hz, o aviso diz isso e sugere mudar nas configurações do Android.
- **Voto de 60 Hz no Android 15+.** Ao fixar *Taxa da tela*, o app passa a pedir a taxa também pelo próprio WebView e desliga o aumento de taxa por toque. O padrão continua "Sistema". O HyperOS já ignorou o pedido antigo e pode ignorar este.

### 1440p no play.xbox.com (experimental)
- *Resolução do stream* ganhou **1440p**. O app declara uma TV (Tizen) com tela 2560×1440 e pede 1440p pelos canais de dados, como clientes nativos fazem.
- O servidor decide o que envia. Nenhuma fonte prova que ele entrega mais que 1080p a este cliente. Confira a resolução recebida no HUD; se nada mudar ou a sessão falhar, volte para 1080p.
- Vale no próximo jogo: saia e entre de novo.

## Para testar no Poco F7

1. Em *Fluidez* → *Taxa da tela*, escolha 60 Hz e entre num jogo a 60 FPS. O aviso de tela a 120 Hz deve sumir; se continuar, o sistema ignorou o pedido.
2. Ligue os indicadores e veja se `GPU` aparece com ou sem `≈`.
3. Em *Desempenho e rede* → *Resolução do stream*, escolha 1440p, saia do jogo e entre de novo. Veja a resolução no HUD completo (linha Vídeo) ou no painel.

## Para quem mexe no código
- `status.panelHz` e `status.gpuBusy` (também na linha do tempo da medição); aviso `panel-hz`.
- `streamResolution: '1440p'` e `status.stream.qhd` ([play-xbox-com.md](play-xbox-com.md)); ponte `getDisplayHz()` e `getGpuBusy()` ([api-imagefilter.md](api-imagefilter.md)).
- Decisões e o que ficou fora da pesquisa: [design](superpowers/specs/2026-11-20-v10-2-ritmo-fonte-design.md).
