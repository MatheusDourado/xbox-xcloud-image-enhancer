---
name: release
description: Prepara uma versão nova (bump em todos os lugares, notas, verificação completa, PR e tag local). Só quando o usuário pedir uma release.
disable-model-invocation: true
argument-hint: "<versão, ex.: 10.1.4>"
---

# Release

Versão nova: `$ARGUMENTS` (formato `X.Y.Z`; sufixo `-beta.N` só na tag, vira pré-lançamento). Anterior: `src/panel.js` `VERSION`.

1. **Branch**: `release/vX.Y.Z` a partir da `main` atualizada.
2. **Bump**: troque a versão anterior pela nova em todos os lugares:
   - `src/panel.js` (`VERSION`), `src/restoration-engine.js` (`version` do relatório e nome do arquivo de diagnóstico), `src/i18n.js` (comentário);
   - `tools/build.py` (`BxBuild.version`, `@version` dos dois userscripts, mensagem final);
   - `android/AndroidManifest.xml` (`versionName` e `versionCode` `MMmmpp`);
   - `tests/engine.test.cjs`, `tools/browser-harness.py`;
   - `README.md` (versão atual, nome do APK, linha nova na tabela do histórico), `android/README.md`.
   `BuildConfigInfo.java` é atualizado pelo `android/build.sh`; atualize-o também para o commit ficar coerente.
3. **Conferir**: `git grep -n "<versão anterior>" -- ':!docs/historico' ':!docs/superpowers'` só pode listar a linha do histórico no README e a nota anterior.
4. **Notas**: crie `docs/release-vX.Y.Z.md` no formato de `docs/release-v<anterior>.md` (a 1ª linha vira o título da release no GitHub). Mova a nota anterior: `git mv docs/release-v<anterior>.md docs/historico/` e corrija os links (README).
5. **Docs**: se mudou comando, estrutura ou regra, atualize `AGENTS.md` e `docs/README.md`.
6. **Verificar**: `tools/check.sh completo` deve terminar em `check.sh completo: OK`. Rode o build e commite os gerados.
7. **Commit e PR**: `vX.Y.Z: <resumo>`; PR para `main` com o template; espere o CI verde. O merge é do usuário.
8. **Tag**: depois do merge, `git tag vX.Y.Z` no commit da `main`. Empurrar a tag publica a release (o CI anexa userscripts e APK): o push da tag pede confirmação do usuário. Não empurre sem ela.
