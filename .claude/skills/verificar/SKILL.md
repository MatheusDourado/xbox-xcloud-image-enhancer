---
name: verificar
description: Roda as verificações do projeto (build, arquivos gerados, testes Node, lint e, no nível completo, testes de navegador). Use antes de dizer que algo está pronto, antes de commit e antes de abrir PR ou release.
---

# Verificar

Um único script faz tudo, e é o mesmo que o CI e o hook de parada usam:

```bash
tools/check.sh rapido     # ~5 s: build, node --test, node --check, Biome, ruff
tools/check.sh completo   # + Playwright (minutos); obrigatório antes de PR e release
```

Regras:

1. Rode `rapido` depois de qualquer mudança em `src/`, `tools/`, `tests/`, `player/`.
2. Rode `completo` antes de abrir PR e antes de release.
3. O build reescreve os arquivos gerados (`better-xcloud-image-filter.user.js`, `xcloud-image-filter-play.user.js`, `output/restoration.bundle.js`). Commite-os junto com a mudança em `src/`.
4. Só diga "pronto" com a última linha `check.sh <nível>: OK` na mão, e cite o comando rodado. Falhou: não está pronto; corrija a causa, não o teste.
5. Não desligue regra de lint nem pule teste para passar. Se a regra estiver errada para o projeto, mude `biome.json`/`ruff.toml` com comentário do porquê e diga isso ao usuário.
6. Mudança visual ou de shader: os testes não medem qualidade de imagem nem custo de GPU no aparelho. Diga isso, e use a skill `medicao-aparelho` quando o efeito no Poco importar.
