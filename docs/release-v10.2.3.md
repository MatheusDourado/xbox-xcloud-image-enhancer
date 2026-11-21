# v10.2.3 — Fluidez Auto

Userscripts `6.7.12-imagefilter.10.2.3` (www.xbox.com, sobre o Better xCloud 6.7.12) e `10.2.3-play` (play.xbox.com), app Android **10.2.3** (`versionCode` 100203). Inclui tudo da [v10.2.2](historico/release-v10.2.2.md). Nenhum filtro de imagem mudou.

## O que mudou

### Fluidez: nova opção Auto
- A Fluidez agora tem quatro opções: Desligada, Equilibrada, Máxima e **Auto**.
- A Auto começa como Equilibrada. Quando o ritmo do jogo/servidor fica irregular por 2 s, ela passa para a Máxima. Quando o ritmo fica estável por 10 s, volta para a Equilibrada.
- O critério é o mesmo do aviso "O jogo/servidor está irregular", que antes pedia para trocar à mão para a Máxima. Irregular quer dizer que o intervalo entre quadros do servidor varia mais que 18% da média. Estável quer dizer que varia até 8%. Entre os dois limites, a Auto mantém o modo atual, para não ficar trocando.
- O resumo da seção mostra qual modo está valendo, por exemplo "Auto (Máxima)". Com a Auto, o aviso diz que ela passou para a Máxima e não mostra mais o botão "Usar Máxima".
- Cada troca reinicia o relógio da Fluidez, o que pode causar uma pequena oscilação no instante da troca.

## Para quem mexe no código
- `BxRestoration.createAutoFluidity()` (`src/restoration-engine.js`) decide o modo a partir de `status.origin.server` (desvio e média do intervalo do servidor). Esse relógio não depende da Fluidez, então a troca não realimenta a própria medida.
- `settings.fluidity` aceita `auto`. `status.fluidity.mode` diz o modo em uso e `status.fluidity.auto` diz se a escolha foi a Auto.
- Teste: `tests/engine.test.cjs` ("Fluidez Auto").
