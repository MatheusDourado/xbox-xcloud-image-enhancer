# Organização do projeto e harness dos agentes — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** limpar o lixo das versões anteriores e instalar o harness (base de conhecimento, skills, guardiões, lint, esteira) descrito no design.

**Architecture:** um único script `tools/check.sh` com dois níveis (`rapido`, `completo`) é a fonte das verificações; a skill `verificar`, o hook `Stop` e o CI chamam o mesmo script. Guardiões = `permissions.deny/ask` em `.claude/settings.json` + `.claude/hooks/guard.sh` (PreToolUse). Conhecimento = `AGENTS.md` (fonte) + `CLAUDE.md` + `.claude/rules/` + `docs/README.md`.

**Tech Stack:** bash, Python 3.12 via `uv`, Node 22 (`node --test`), Biome 2 via `npx`, ruff via `uvx`, GitHub Actions, Claude Code 2.1.322 hooks/skills.

**Spec:** `docs/superpowers/specs/2026-11-20-harness-organizacao-design.md`

## Global Constraints

- Python do build: ≥ 3.10; localmente sempre `uv run -p 3.12 --no-project`; no CI, `python3` (3.12).
- Arquivos gerados (nunca editar à mão; sempre via `tools/build.py`): `better-xcloud-image-filter.user.js`, `xcloud-image-filter-play.user.js`, `output/restoration.bundle.js`. `script.js` = Better xCloud 6.7.12 original, também nunca editar.
- Depois de qualquer mudança em `src/` ou `tools/build.py`: rodar o build e commitar os gerados junto.
- Sem reescrever histórico git; sem force push.
- Lint: só regras de bug (Biome `correctness` + `suspicious`; ruff `F` + `E9`). Sem formatter.
- `AGENTS.md` + `CLAUDE.md` < 200 linhas somadas.
- Texto de docs, skills e commits em português (padrão do repo); comentários de código em inglês (padrão do repo).
- Um commit por task; mensagens no estilo do repo (`docs:`, `ci:`, `chore:`, `feat:`), terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Hook `guard.sh` recebendo comando com aspas, `&&`, `;` ou subshell (`bash -c "git push -f"`): deve bloquear igual ao comando simples. Teste em Task 6.
2. Hook `Stop` em sessão sem mudança de código ou com `stop_hook_active=true`: deve sair 0 imediatamente, sem rodar build. Teste em Task 6.
3. `tools/check.sh` rodado de outro diretório (`cd tools && ./check.sh`): deve funcionar (resolve a raiz pelo git). Teste em Task 5.
4. Link para doc movido esquecido em algum arquivo (README, `android/README.md`, comentário em `src/`, workflow): verificação por grep em Task 2 deve dar zero.
5. Máquina sem `uv`/`npx`: `check.sh` deve falhar com mensagem dizendo o que instalar, não com erro obscuro. Teste em Task 5.

---

### Task 1: Remoções simples e build com Python antigo

**Files:**
- Delete: `android/dist/xcloud-imagefilter-10.1.1.apk`, `tools/performance-harness.py`, `tools/performance-v8-harness.py`, `tools/performance-v85-harness.py`, `tools/gameplay-harness.py`
- Modify: `.gitignore` (adicionar `android/dist/`), `tools/build.py` (topo), `tools/eval/make_eval_set.py`, `tools/nn/make_train_set.py` (links quebrados)

- [ ] **Step 1:** `git rm` dos 5 arquivos. Confirmar que nada vivo os cita: `git grep -n "performance-harness\|performance-v8-harness\|performance-v85-harness\|gameplay-harness" -- ':!docs'` → vazio.
- [ ] **Step 2:** Em `tools/build.py`, antes de qualquer outra coisa: `if sys.version_info < (3, 10): sys.exit('tools/build.py precisa de Python 3.10+ (use: uv run -p 3.12 --no-project tools/build.py)')`.
- [ ] **Step 3:** Verificar: `python3 tools/build.py` (3.9.6) → sai com a mensagem acima, código 1. `uv run -p 3.12 --no-project tools/build.py && git status --porcelain` → só `tools/build.py` modificado (gerados idênticos; build.py não entra nos gerados — se entrar no fingerprint, commitar os gerados também).
- [ ] **Step 4:** (executar junto com a Task 2, porque os destinos só existem depois do `git mv`) Links quebrados: em `make_eval_set.py` trocar `docs/analysis-v8.7.md` por `docs/historico/analysis-v9.md` (doc existente mais próximo do v9 eval; caminho final da Task 2); em `make_train_set.py` trocar `docs/analysis-v10.md` por `docs/release-v10.0.0.md` → `docs/historico/release-v10.0.0.md` (release que introduziu a rede). Ler o contexto da citação antes; se nenhum doc corresponder, remover a citação.
- [ ] **Step 5:** Commit `chore: remover APK velho e harness mortos; build avisa Python < 3.10`.

### Task 2: Docs históricos em `docs/historico/`

**Files:**
- Move (`git mv`) para `docs/historico/`: `release-v8*.md`, `release-v9*.md`, `release-v10.0.0.md`, `release-v10.1.0.md`, `release-v10.1.1.md`, `release-v10.1.2.md`, `validation-*.md`, `analysis-v9.md`, `analysis-v9.1.md`, `research-v8.md`, `teste-dell.md`, `qualidade-hellblade.md`, `spec1-estudo.md`, `spec2-estudo.md`, `spec3-implementacao.md`, `auditoria-play-xbox-com.md`, `proxima-build.md`, `proxima-sessao-testes-poco.md`
- Modify: todo arquivo que cite esses caminhos (README.md, android/README.md, docs/*.md restantes, docs movidos entre si, `src/**`, `tools/**`, `.github/workflows/build-release.yml`), depois os 3 gerados via build.

- [ ] **Step 1:** `git mv` dos arquivos acima.
- [ ] **Step 2:** Reescrever referências: de `docs/<nome>` para `docs/historico/<nome>` fora de `docs/`; links relativos dentro de `docs/` (`](nome.md)` → `](historico/nome.md)` nos que ficaram; nos movidos, links para docs que ficaram ganham `../`, e para `medicoes/` viram `../medicoes/`). Script sed com a lista exata; não tocar `script.js` nem os gerados à mão.
- [ ] **Step 3:** Rebuild: `uv run -p 3.12 --no-project tools/build.py`.
- [ ] **Step 4:** Verificação de links (zero saída esperada):
  ```bash
  for f in $(git ls-files 'docs/historico/*.md' | xargs -n1 basename); do git grep -n "docs/$f\|](\(\./\)\?$f" -- ':!docs/historico' ':!docs/superpowers'; done
  ```
  E checagem de links relativos quebrados em todos os `.md`: script Python curto que extrai `](caminho)` locais (sem `http`, sem âncora pura) e testa existência relativa ao arquivo → lista vazia.
- [ ] **Step 5:** `node --test tests/*.cjs` → passa; `git diff --stat` dos gerados mostra só linhas de comentário.
- [ ] **Step 6:** Commit `docs: mover documentação histórica para docs/historico`.

### Task 3: Medições brutas fora do checkout; pesquisas versionadas

**Files:**
- Delete: em `docs/medicoes/poco-nfs-2026-11-09/`: `*-rec.json`, `*-measurement.json`, `*.log`, `screens/`
- Modify: `docs/medicoes/poco-nfs-2026-11-09/README.md`, `CONCLUSOES.md` (citações a arquivos brutos), `.gitignore`
- Move: `research_notes/Próxima melhoria imagem xCloud nativo/*.md` → `docs/pesquisa/2026-11-20-nativo/` (`git add` após `mv`; pasta `research_notes/` some)

- [ ] **Step 1:** Anotar o SHA atual de HEAD (`BASE`) antes de apagar.
- [ ] **Step 2:** `git rm` dos brutos. No topo do README da medição, uma linha: "Dados brutos (gravações, logs, prints) removidos do checkout em 2026-11-20; recuperar com `git show <BASE>:docs/medicoes/poco-nfs-2026-11-09/<arquivo>`." Citações inline (`caps4.log` etc.) ficam como estão (o nome continua válido para o `git show`).
- [ ] **Step 3:** `.gitignore`: adicionar `docs/medicoes/**/*.log`, `docs/medicoes/**/*-rec.json`, `docs/medicoes/**/screens/` (medições futuras: só conclusões vão ao git).
- [ ] **Step 4:** Mover as pesquisas. Verificar: `du -sh docs/medicoes/poco-nfs-2026-11-09` < 200 KB; `ls research_notes` → não existe.
- [ ] **Step 5:** Commit `docs: tirar medições brutas do checkout; versionar pesquisas do caminho nativo`.

### Task 4: Lint de bugs (Biome + ruff) e correções iniciais

**Files:**
- Create: `biome.json`, `ruff.toml`
- Modify: arquivos com achados reais em `src/`, `tests/`, `player/`, `tools/` (+ rebuild se `src/` mudar)

**Interfaces:**
- Produces: comandos `npx -y @biomejs/biome@2 lint .` e `uvx ruff check .` saindo 0 — usados pela Task 5.

- [ ] **Step 1:** `biome.json`: `linter.rules.recommended=false`, ligar grupos `correctness` e `suspicious` com nível `error`; `files.includes` exclui `script.js`, os 3 gerados, `output/**`, `android/**`, `docs/**`, `src/vendor/**`. Formatter desligado. Fixar `$schema` na versão instalada pelo `npx`.
- [ ] **Step 2:** `ruff.toml`: `lint.select = ["F", "E9"]`, `exclude = ["output"]`, `target-version = "py312"`.
- [ ] **Step 3:** Rodar os dois; para cada achado: bug real → corrigir; falso positivo de padrão do projeto (ex.: globais de userscript `GM_*`, `unsafeWindow`) → desligar a regra ou declarar globais no config com comentário de 1 linha do porquê. Nunca `// biome-ignore` em massa.
- [ ] **Step 4:** Se `src/` mudou: rebuild. `node --test tests/*.cjs` passa; os dois linters saem 0.
- [ ] **Step 5:** Commit `chore: lint de bugs com Biome e ruff; corrigir achados`.

### Task 5: `tools/check.sh` + skill `verificar` + CI

**Files:**
- Create: `tools/check.sh` (executável), `.claude/skills/verificar/SKILL.md`
- Modify: `.github/workflows/build-release.yml`

**Interfaces:**
- Consumes: comandos de lint da Task 4.
- Produces: `tools/check.sh [rapido|completo]` — sai 0 se tudo passa, ≠0 com a saída do passo que falhou. Usado pela Task 6 (hook Stop) e pelo CI.

- [ ] **Step 1:** `check.sh`: `set -euo pipefail`; `cd "$(git rev-parse --show-toplevel)"`; escolhe Python (`python3` se ≥ 3.10, senão `uv run -p 3.12 --no-project python`; sem nenhum dos dois → `echo "precisa de Python 3.10+ ou uv" >&2; exit 1`); idem `npx`/`uvx` com mensagem de instalação. Nível `rapido`: build → `git diff --exit-code` dos 3 gerados **contra o índice** só no CI (`CI=true`); localmente apenas reconstrói (o agente commita o resultado) → `node --test tests/*.cjs` → `node --check` dos 2 userscripts e `player/player.js` → Biome → ruff. Nível `completo`: `rapido` + `tools/run-browser-tests.py`.
- [ ] **Step 2:** Testes manuais (Review Focus 3 e 5): `tools/check.sh rapido` na raiz → 0; `(cd tools && ./check.sh rapido)` → 0; `PATH=/usr/bin:/bin tools/check.sh rapido` → mensagem de instalação, código 1; introduzir erro temporário num teste (`assert.equal(1,2)`) → código ≠0 com o nome do teste; reverter.
- [ ] **Step 3:** Skill `verificar/SKILL.md`: frontmatter `name: verificar`, `description` (quando usar: antes de dizer pronto, antes de commit/PR); corpo: rodar `tools/check.sh rapido` sempre, `completo` antes de PR/release; colar a saída final; se falhar, não dizer pronto. < 40 linhas.
- [ ] **Step 4:** Workflow: adicionar `pull_request:` (sem paths, sem tags); incluir `biome.json`, `ruff.toml`, `tools/check.sh` em `paths` do push; o passo "Userscript e testes" vira `CI=true tools/check.sh rapido`. Confirmar que "Publicar release" mantém o `if` de tag/dispatch (não roda em PR). Validar sintaxe: `uvx -q --from actionlint-py actionlint .github/workflows/build-release.yml` (ou `npx -y action-validator` se não houver) → sem erro.
- [ ] **Step 5:** Commit `ci: verificações num script único (tools/check.sh) usado por agente, hook e CI; CI em PR`.

### Task 6: Guardiões (permissions + hooks)

**Files:**
- Create: `.claude/settings.json`, `.claude/hooks/guard.sh`, `.claude/hooks/stop-check.sh`, `.claude/hooks/test-hooks.sh`

**Interfaces:**
- Consumes: `tools/check.sh rapido` (Task 5).

- [ ] **Step 1: teste primeiro** — `test-hooks.sh` alimenta os hooks com JSON no stdin e confere o código de saída:
  - guard, deve sair 2: `git push --force origin x`, `git push -f`, `git push origin +main`, `git push origin main`, `git push origin HEAD:main`, `git reset --hard HEAD~1`, `git clean -fdx`, `rm -rf src`, `bash -c "git push -f"`, `cd x && git reset --hard`; Edit/Write com `file_path` em cada gerado e em `script.js`.
  - guard, deve sair 0: `git push origin MatheusDourado/x`, `git status`, `rm -f output/tmp.txt`, `git reset --soft HEAD~1`, Edit em `src/panel.js`.
  - stop-check, deve sair 0 sem rodar nada: `{"stop_hook_active": true}`; worktree sem mudança em `src|tools|tests|player|script.js|android`.
  Rodar → falha (scripts não existem).
- [ ] **Step 2:** `guard.sh` (bash + `jq`; sem `jq` → usar `python3 -c json`): lê `tool_name`, `tool_input.command`/`tool_input.file_path`; regex sobre o comando inteiro (pega `&&`, `;`, `bash -c`); bloqueia com `echo "motivo + alternativa" >&2; exit 2`. Mensagens em português dizendo o que fazer (ex.: "arquivo gerado: edite src/ e rode tools/build.py").
- [ ] **Step 3:** `stop-check.sh`: sai 0 se `stop_hook_active` true ou se `git status --porcelain -- src tools tests player script.js android` vazio; senão roda `tools/check.sh rapido`; falhou → imprime as últimas 40 linhas no stderr e `exit 2`.
- [ ] **Step 4:** `settings.json`:
  - `permissions.deny`: `Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(git reset --hard:*)`, `Bash(git clean -f:*)`, `Bash(rm -rf:*)`, `Edit(better-xcloud-image-filter.user.js)`, `Edit(xcloud-image-filter-play.user.js)`, `Edit(output/restoration.bundle.js)`, `Edit(script.js)`, os mesmos com `Write(...)`.
  - `permissions.ask`: `Bash(git push origin v*)`, `Bash(git push --tags:*)`, `Bash(gh release:*)`.
  - `hooks.PreToolUse`: matcher `Bash|Edit|Write|MultiEdit` → `.claude/hooks/guard.sh`; `hooks.Stop` → `.claude/hooks/stop-check.sh` com timeout 120. `onFailure: "block"` no PreToolUse (confirmar o nome exato do campo na doc de hooks da versão 2.1.322 — `code.claude.com/docs/en/hooks` — antes de usar; se não existir, omitir e anotar no AGENTS.md).
  - Caminhos de hook via `"$CLAUDE_PROJECT_DIR"/.claude/hooks/...`.
- [ ] **Step 5:** `bash .claude/hooks/test-hooks.sh` → todos OK. Validar JSON: `python3 -m json.tool .claude/settings.json`.
- [ ] **Step 6:** Teste real numa sessão: pedir ao Claude `git reset --hard` → bloqueado com a mensagem; editar `script.js` → bloqueado. Registrar resultado no commit.
- [ ] **Step 7:** Commit `feat: guardiões do Claude Code (deny/ask + hooks PreToolUse e Stop)`.

### Task 7: Base de conhecimento, skills de release e medição, esteira

**Files:**
- Create: `AGENTS.md`, `CLAUDE.md`, `.claude/rules/shaders.md`, `.claude/rules/android.md`, `docs/README.md`, `.claude/skills/release/SKILL.md`, `.claude/skills/medicao-aparelho/SKILL.md`, `.github/pull_request_template.md`
- Modify: `README.md` (links para docs movidos já feitos na Task 2; aqui só apontar para `docs/README.md` e `AGENTS.md` na seção de desenvolvimento, se houver)

- [ ] **Step 1:** `AGENTS.md`: o que é (3 linhas); mapa de pastas (vivo × arquivo: `tools/device/spec2-4`, `tools/eval`, `tools/nn` = arquivo de pesquisa, não manter); comandos (`tools/check.sh rapido|completo`, build, APK `android/build.sh`, `tools/ui-preview.py`, `tools/make-test-videos.py`); regra dos gerados e do `script.js`; onde ficam versões (`src/panel.js` `VERSION`, `tools/build.py` 2 lugares, `android/AndroidManifest.xml` versionCode/versionName, `android/src/.../BuildConfigInfo.java`, `src/i18n.js`, README, `android/README.md`, `tests/engine.test.cjs`, `tools/browser-harness.py` — conferir com `git grep -n 10.1.3`); esteira (5 passos do design, seção G); guardiões existentes e o que bloqueiam; docs: `docs/README.md`.
- [ ] **Step 2:** `CLAUDE.md`: `@AGENTS.md` + 3–5 linhas específicas do Claude Code (skills `verificar`/`release`/`medicao-aparelho`, superpowers para planejar, claude-mem para memória). Verificar: `wc -l AGENTS.md CLAUDE.md` total < 200.
- [ ] **Step 3:** Regras com frontmatter `paths:` — `shaders.md` (`src/shaders/**`, `src/webgpu/**`): paridade GLSL ↔ WGSL quando o passe existe nos dois, precisão no Adreno, custo de GPU medido antes/depois, `finish.glsl` é embutido em `rcas`/`sgsr` pelo build; `android.md` (`android/**`): versão no manifest + BuildConfigInfo, APK só via `android/build.sh`, keystore de debug. Conteúdo tirado de `docs/spec4-webgpu.md`, `android/README.md` e `tools/build.py` — não inventar regra sem fonte.
- [ ] **Step 4:** `docs/README.md`: uma linha por doc vivo, uma seção "Histórico" apontando `historico/`, "Pesquisa" apontando `pesquisa/`, "Medições".
- [ ] **Step 5:** Skill `release` (`disable-model-invocation: true`): passos = atualizar todos os lugares de versão (lista do AGENTS.md; conferir com `git grep` da versão antiga = zero fora de `docs/historico`), criar `docs/release-vX.Y.Z.md` no formato do atual, `git mv` da nota anterior para `docs/historico/`, `tools/check.sh completo`, commit, PR, tag local; empurrar a tag só com confirmação (está em `permissions.ask`).
- [ ] **Step 6:** Skill `medicao-aparelho`: resumo do procedimento de `docs/medicoes/poco-nfs-2026-11-09/README.md` + `scripts/` (adb por Wi-Fi, `rec.js`, `caps.sh`, Perfetto `.pbtx`), configuração recomendada (60 Hz antes do jogo), onde salvar (nova pasta `docs/medicoes/<aparelho>-<data>/`, só README/CONCLUSOES/scripts no git — brutos ignorados).
- [ ] **Step 7:** PR template: O quê / Por quê / Como testei (saída do `tools/check.sh`) / Checklist: gerados reconstruídos, docs e AGENTS.md atualizados se mudou comando/estrutura, versão não mudou fora de release.
- [ ] **Step 8:** Checar links de todos os `.md` novos (mesmo script da Task 2) → vazio. `claude` numa sessão nova: `/skills` lista as 3 skills.
- [ ] **Step 9:** Commit `docs: AGENTS.md, CLAUDE.md, regras por área, skills de release e medição, template de PR`.

### Task 8: LSP (nível usuário, sem commit)

- [ ] **Step 1:** `npm i -g typescript-language-server typescript pyright`; verificar `typescript-language-server --version` e `pyright --version`.
- [ ] **Step 2:** `claude plugin install typescript-lsp@claude-plugins-official` e `pyright-lsp@claude-plugins-official`; verificar `claude plugin list`.
- [ ] **Step 3:** Anotar no `AGENTS.md` (seção ferramentas, 2 linhas) o comando de instalação — fazer junto no commit da Task 7 se ela ainda não foi commitada; senão commit `docs: instalação dos LSP`.

### Fechamento

- [ ] `tools/check.sh completo` → 0.
- [ ] Revisão do branch inteiro (`code-review`), depois PR para `main` com o template; CI verde no PR.
