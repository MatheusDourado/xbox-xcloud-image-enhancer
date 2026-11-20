# v9.8.0 (beta de teste) — menos GPU no Poco F7

Userscript `6.7.12-imagefilter.9.8.0` e app Android **9.8.0**. Pré-lançamento para o Matheus testar em partida real. **Nada desta versão foi visto numa partida do xCloud.**

## Origem

Specs 1 a 3 da rodada autônoma de 6 e 7 de novembro de 2026, na branch `claude/specs-autonomas`:

- [Spec 1 — estudo do código](spec1-estudo.md)
- [Spec 2 — eficiência de GPU e ranking](spec2-estudo.md)
- [Spec 3 — implementação](spec3-implementacao.md)

A Spec 2 mostrou que, em ritmo real a 30 FPS, o caminho padrão usava 16,8 ms de GPU por quadro no Poco, não os cerca de 5 ms medidos em rajada. A 60 FPS isso ocupava 88% da GPU. A 9.8.0 implementa 10 dos 12 itens do ranking. A Spec 4 (WebGPU) **não está nesta versão**.

## O que mudou

| Mudança | Efeito medido (bancada, clipe H.264) |
| --- | --- |
| Padrões novos: nitidez 2, Compressão 0, Detalhe 0, Degradês 60% | índice visual melhor na bancada; **mudança de imagem, valide** |
| `spatial` em `mediump` nas GPUs de meia precisão, com variantes por perfil | Poco: 13,9 → 11,2 ms por quadro |
| Canvas sem MSAA | Poco: 0; Vostro: −0,6 a −0,8 ms |
| Última passada desenhada no `present`, sem cópia, com Fluidez | −0,6 a −2,6 ms no Poco |
| SGSR 1 (Qualcomm) como **opção** de escalador | Poco: 11,1 → 5,6 ms; o padrão continua EASU + nitidez |
| Margem da adaptação por caminho: 5% captura direta, 10% `<video>` a 30 FPS, 20% acima de 45 FPS | evita reduzir à toa a 60 FPS |
| Opção Baixa latência (`desynchronized`), desligada | só para PC a 30 FPS; a 60 FPS derrubou quadros no Vostro |
| Adaptação sem cronômetro de GPU segue a taxa real do decodificador | antes, no WebView, nunca reduzia |

- **Caminho de volta:** o padrão antigo continua no painel como preset **Padrão v9**. Quem tinha os padrões v9 salvos migra uma vez para os novos; quem personalizou mantém.
- **SGSR:** em *Escalador/nitidez*, só age quando a saída é maior que a fonte.

## O que testar

1. Os padrões novos contra o preset **Padrão v9**, no mesmo jogo.
2. SGSR contra EASU + nitidez, com saída ampliada (1280p no Poco).
3. Fluidez e travadas a 60 FPS (menus) e a 30 FPS (partida); se puder, com captura direta.
4. Exportar a medição (vai para Downloads/xCloud ImageFilter) para a próxima rodada.

## Testes

- Node: 65 de 65.
- Playwright no Chromium do CI (SwiftShader): painel e HUD 117, regressões de pixel 62, movimento 11.
- `capture-harness`: falha intermitente já registrada na Spec 1 (`No display or wait interval spans the hidden page`), também presente na v9.7.1.
- Uma checagem de regressão dependia do tempo de compilação da variante do `spatial`; passou a comparar o nome base da passada.
- O APK é assinado com a mesma chave de teste da 9.7.1 e instala por cima sem apagar dados. Esta build não foi instalada no Poco antes de publicar, para não interromper a Spec 4.

## Pendências

- Validação em partida real de tudo acima.
- Render em Worker (item 7) e CfL Lite (item 12) não entraram.
- Sessão longa de 20 min e medição conjunta do caminho final.
- WebGPU (Spec 4) em andamento.
