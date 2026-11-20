# AGENTS.md — xCloud Enhanced

Guia para agentes de IA (Claude Code, Codex e outros). Curto de propósito: só o que vale em toda sessão. Procedimentos longos ficam nas skills (`.claude/skills/`), regras de área em `.claude/rules/`, documentação em [docs/README.md](docs/README.md).

## O projeto

Tratamento de imagem na GPU (WebGL2, WebGPU opcional) e stream 1080p para o Xbox Cloud Gaming. Entregas: dois userscripts (Tampermonkey) e um APK Android (WebView que injeta os scripts). Aparelho de referência: Poco F7 (Snapdragon 8s Gen 4, Adreno 825). Versão atual: ver `src/panel.js` (`VERSION`).

## Mapa

| Caminho | O que é |
| --- | --- |
| `src/` | código-fonte do motor, painel, HUD, i18n, `play/` (play.xbox.com), `shaders/` (GLSL), `webgpu/` (WGSL), `nn/restore.json` (pesos) |
| `script.js` | Better xCloud 6.7.12 original, base que o build modifica. **Nunca editar.** |
| `tools/build.py` | gera os 3 arquivos gerados abaixo |
| `tools/check.sh` | todas as verificações (skill `verificar`, hook de parada e CI) |
| `tools/run-browser-tests.py` + `*-harness.py` | suítes Playwright (WebGL, DOM, pixels, WebGPU) |
| `tools/ui-preview.py`, `tools/make-test-videos.py` | prévia da UI; vídeos para o `player/` |
| `tests/*.cjs` | testes Node (`node --test`) |
| `player/` | player local de teste (`python3 -m http.server 8765`, abrir `/player/`) |
| `android/` | app WebView; build em `android/build.sh` |
| `tools/device/`, `tools/eval/`, `tools/nn/` | ferramentas de medição e pesquisa de specs já concluídas. Arquivo: rodam, mas não são mantidas nem lintadas. `tools/nn/train.py` regenera `src/nn/restore.json`. |
| `docs/` | só o que vale hoje; `docs/historico/` = versões anteriores; `docs/pesquisa/` = pesquisas ativas |

**Arquivos gerados** (commitados; o CI falha se não baterem com o build): `better-xcloud-image-filter.user.js`, `xcloud-image-filter-play.user.js`, `output/restoration.bundle.js`. Nunca editar à mão: mude `src/` e rode o build. O guardião bloqueia a edição.

## Comandos

```bash
tools/check.sh rapido      # ~5 s: build, node --test, node --check, Biome, ruff
tools/check.sh completo    # + testes de navegador (Playwright); antes de PR e release
uv run -p 3.12 --no-project tools/build.py   # só o build (precisa de Python 3.10+; o macOS traz 3.9)
android/build.sh           # APK (Linux; ver android/README.md)
```

Ferramentas: Node 22, `uv` (traz Python 3.12, `uvx ruff`), `npx` (Biome). LSP para agentes: `npm i -g typescript-language-server typescript pyright` + plugins `typescript-lsp` e `pyright-lsp` do marketplace oficial do Claude Code.

## Esteira

1. **Entender**: pedido novo ou ambíguo começa por brainstorming; design em `docs/superpowers/specs/AAAA-MM-DD-<tema>-design.md`.
2. **Planejar**: plano em `docs/superpowers/plans/`. Nada de código antes do design aprovado pelo usuário.
3. **Executar**: em branch (nunca na `main`), menor mudança que resolve. Lógica nova vem com teste que falhou antes.
4. **Testar**: `tools/check.sh rapido` sempre; `completo` antes de PR. Só dizer "pronto" com a saída do comando. Mudança de shader ou de desempenho: os testes não medem custo de GPU nem qualidade no aparelho; diga isso e use a skill `medicao-aparelho` quando importar.
5. **Entregar**: revisão → PR com o template → CI verde → merge pelo usuário. Release só pela skill `release`.

## Guardiões (`.claude/settings.json`, `.claude/hooks/`)

- Bloqueados: push com `--force`/`-f`/`+ref`, push para `main` (ou a partir dela), `git reset --hard`, `git clean -f`, descartar o worktree inteiro (`git checkout -- .`, `git restore .`), `rm -rf`, editar os gerados e `script.js`.
- Pedem confirmação do usuário: push de tag `v*`, `gh release`, `gh pr merge`.
- Hook de parada: se houve mudança de código, a sessão não encerra com `tools/check.sh rapido` falhando.
- Bloqueio é para parar e repensar, não para contornar. Se a ação for mesmo necessária, peça ao usuário.
- Testes dos hooks: `bash .claude/hooks/test-hooks.sh`.

## Convenções

- Docs, painel e commits em português; comentários de código em inglês.
- Commits no estilo `tipo: resumo` (`feat`, `fix`, `docs`, `ci`, `chore`).
- Versão aparece em vários arquivos; a skill `release` tem a lista e confere com `git grep`.
- Medições: só `README.md`, `CONCLUSOES.md` e scripts entram no git; dados brutos são ignorados.
