# v9.1 — reconstrução neural experimental e análise de "naturalidade"

Userscript `6.7.12-imagefilter.9.1` e app Android **9.1**. Os padrões continuam os da v9; nada muda na imagem até você ligar a opção nova.

- **Reconstrução neural (experimental, desligada por padrão)**: rede pequena treinada com streams H.264 tipo xCloud. Ela limpa blocos e ruído do encoder **antes** da nitidez, para a nitidez realçar textura e não sujeira. Com a mesma nitidez, mede +0,004 de SSIM e 3% menos cintilação. Custa cerca de +30% de GPU. Ao ligar, use Nitidez ~2,5. Precisa de render em float; se a GPU não tiver, a opção é ignorada.
- **Análise do "não parece natural"** (`docs/historico/analysis-v9.1.md`): toda nitidez aumenta a cintilação de textura entre quadros (+23% na v9 padrão; bem mais no máximo). Acumular quadros como o DLSS não funciona no stream, porque o erro do H.264 se repete entre quadros.
- **Recomendação** para aparência de console: Nitidez 2–3, evitando 6–10.
- Bancada nova: medição em sequência de quadros com métrica de cintilação, e treino/avaliação da rede em `tools/nn/`.

Validação: 24 testes Node, 55 verificações Chrome/WebGL/DOM, 41 regressões de pixels (rede: duas passagens antes da espacial, campo plano preservado, ignorada sem render em float; shader igual ao modelo treinado) e 11 casos de movimento. Não testado ainda no Dell nem no Poco F7.

Assets: `better-xcloud-image-filter.user.js` e `xcloud-imagefilter-9.1.apk` (instala por cima da 9.0.x).
