# Organização do projeto e harness dos agentes — design

Data: 2026-11-20. Branch: `MatheusDourado/audit-release-10-1-3`. Base: v10.1.3.

## Intenção

Tirar o lixo das versões anteriores e montar um harness que impeça agente de "executar lixo": base de conhecimento curta e correta, skills com procedimento fixo, guardiões que bloqueiam ação ruim e uma esteira única (planejar → executar → testar → entregar) com as mesmas verificações no agente, no commit e no CI.

Cada mudança abaixo responde: **o quê**, **como**, **por quê**, **ganho**, **perda**.

## Objetivos, não-objetivos, anti-objetivos

- Objetivos: repo sem arquivo morto na raiz de trabalho; um agente novo entende o projeto lendo um arquivo; nenhuma sessão termina com build ou teste quebrado; comandos destrutivos bloqueados; as mesmas checagens em todo lugar.
- Não-objetivos: mudar comportamento do produto; reescrever git history; formatar o código todo; servidor de grafo/índice.
- Anti-objetivos (falha mesmo se "funcionar"): trava que demora tanto que todo mundo desliga; lint que gera centenas de mudanças de estilo; documentação que repete o código e envelhece; regra escrita só em texto, sem trava real.

## Restrições verificadas

- `tools/build.py` precisa de Python ≥ 3.10 (`write_text(newline=)`); o Mac tem 3.9.6 e o build quebra. Com `uv run -p 3.12` o build reproduz os arquivos commitados sem diff.
- O CI (`.github/workflows/build-release.yml`) reconstrói e falha se `better-xcloud-image-filter.user.js`, `xcloud-image-filter-play.user.js` ou `output/restoration.bundle.js` diferirem do commit. Eles ficam no git.
- Comentários em `src/` citam docs (`docs/spec2-estudo.md`, `docs/analysis-v9.md`, ...). Esses comentários vão para os userscripts gerados: mover doc = corrigir comentário + rebuild.
- O CI publica a release com `docs/release-<tag>.md`: a nota da versão corrente precisa estar em `docs/`.
- Build + `node --test` levam ~4 s. Playwright leva minutos.

## Abordagens consideradas

1. **Harness enxuto com ferramentas oficiais (escolhida).** `AGENTS.md` + `CLAUDE.md`, `.claude/rules`, 3 skills de projeto, hooks oficiais do Claude Code + `permissions.deny`, Biome e ruff só com regras de bug, plugins LSP oficiais, claude-mem como memória. Ganho: pouco para manter, tudo nativo. Perda: sem visão de "raio de impacto" em grafo.
2. **Harness com grafo de código (code-review-graph ou Serena).** Ganho: consulta "quem depende disto". Perda: mais um índice, instala git hooks e `.mcp.json` próprios; em ~350 arquivos o LSP + grep resolvem. Fica como evolução se o repo crescer.
3. **Pacotes prontos de terceiros (Graphify, codebase-memory-mcp, cc-safety-net, tdd-guard).** Perda: Graphify tem ~1.700 issues abertas e versão 0.9.x mudando todo dia; codebase-memory instala via `curl | bash` com daemon; cc-safety-net e tdd-guard repetem o que um script de 40 linhas e o superpowers já fazem. Descartada.

O usuário entregou o "como" ("você tem total acesso"): a escolha 1 é decisão minha.

## Mudanças

### A. Limpeza

**A1. Apagar `android/dist/xcloud-imagefilter-10.1.1.apk` e ignorar `android/dist/`.**
Por quê: APK velho (10.1.1) com app em 10.1.3; o CI gera o APK a cada build. Ganho: ninguém instala versão errada por engano; 388 KB a menos. Perda: nenhuma (APKs ficam nas Releases do GitHub).

**A2. Apagar `tools/performance-harness.py`, `performance-v8-harness.py`, `performance-v85-harness.py`, `gameplay-harness.py`.**
Por quê: comparam com bundles v7/v7.1/v8 fixados em commits antigos; o gameplay depende de vídeos Hellblade que nada gera; nenhum CI/ferramenta chama. Ganho: agente não roda nem "conserta" harness morto. Perda: reproduzir validações v3–v8.5 exige `git checkout` do commit antigo (as docs dessas validações apontam o harness, e ficam no histórico).

**A3. Mover docs históricos para `docs/historico/`.**
Vão: `release-v8*`, `release-v9*`, `release-v10.0.0`–`release-v10.1.2`, `validation-*`, `analysis-v9*.md`, `research-v8.md`, `teste-dell.md`, `qualidade-hellblade.md`, `spec1-estudo.md`, `spec2-estudo.md`, `spec3-implementacao.md`, `auditoria-play-xbox-com.md`, `proxima-build.md` e `proxima-sessao-testes-poco.md` (todos os itens `[x]`, nenhum `[ ]` aberto).
Ficam em `docs/`: `api-imagefilter.md`, `play-xbox-com.md`, `spec4-webgpu.md`, `third-party-v8.md`, `release-v10.1.3.md`, `medicoes/`.
Como: `git mv` (mantém histórico do arquivo); corrigir todos os links em README, `android/README.md`, docs, comentários de `src/`/`tools/`/CI; rebuild dos gerados.
Por quê: 42 arquivos na raiz de `docs/` sem distinção entre "vale hoje" e "valia na v8"; agente lê doc velho e toma como verdade. Ganho: raiz de `docs/` = só o que vale. Perda: diff grande de links; histórico continua acessível.

**A4. Remover dados brutos de `docs/medicoes/poco-nfs-2026-11-09/`** (`*-rec.json`, `*-measurement.json`, `*.log`, `screens/*.png`, ~20 MB).
Ficam: `README.md`, `CONCLUSOES.md`, `scripts/`. As citações a arquivos brutos passam a apontar para o commit atual (`git show 70016ad:docs/medicoes/...`).
Por quê: 20 MB de JSON/log poluem grep e contexto dos agentes; as conclusões já estão escritas. Ganho: checkout menor, busca limpa. Perda: dado bruto só via git history. Sem reescrever histórico (exigiria force push), então `.git` não encolhe.

**A5. Manter `tools/device/spec2|3|4`, `tools/eval`, `tools/nn` no lugar** e marcá-los como "arquivo" no mapa da base de conhecimento.
Por quê: são código que ainda roda e se importam por caminho relativo; mover quebra imports sem ganho. Perda: continuam no grep (aceito; são pequenos).

**A6. Corrigir links quebrados** em `tools/eval/make_eval_set.py` (`docs/analysis-v8.7.md`) e `tools/nn/make_train_set.py` (`docs/analysis-v10.md`): apontar para o doc existente mais próximo ou remover a citação.

**A7. `tools/build.py` falha cedo em Python < 3.10** com mensagem clara (uma checagem de `sys.version_info`).
Por quê: hoje falha com `TypeError` obscuro no meio do build. Ganho: agente/humano entende na hora. Perda: nenhuma.

**A8. `research_notes/` (fora do git, 5 pesquisas de 2026-11-20 sobre o caminho nativo) vai para `docs/pesquisa/2026-11-20-nativo/`** e entra no índice como pesquisa ativa. Decisão do usuário. Ganho: versionada e visível para agentes. Perda: nenhuma.

### B. Base de conhecimento

**B1. `AGENTS.md` (fonte) + `CLAUDE.md` (`@AGENTS.md` + regras específicas do Claude Code).** < 200 linhas no total.
Conteúdo: o que é o projeto; mapa de pastas (vivo × arquivo); comandos exatos (build, testes, browser, APK); arquivos gerados e a regra "nunca editar à mão"; esteira; onde está cada doc.
Por quê: hoje nenhum agente tem mapa; cada sessão redescobre. `AGENTS.md` é lido por Codex e outros; `CLAUDE.md` importa. Ganho: um lugar. Perda: precisa ser mantido (a skill de release cobra isso).

**B2. `.claude/rules/shaders.md` (paths `src/shaders/**`, `src/webgpu/**`) e `.claude/rules/android.md` (paths `android/**`).**
Carregam só quando o agente mexe na área. Por quê: regras de área (precisão mediump, paridade GLSL/WGSL, versão no manifest) não precisam estar em toda sessão. Ganho: contexto menor. Perda: mais 2 arquivos.

**B3. `docs/README.md`**: índice de 1 linha por doc (vale hoje × histórico).

**B4. Memória entre sessões:** claude-mem (já instalado, nível usuário). Nada no repo.

### C. Skills de projeto (`.claude/skills/`)

**C1. `verificar`**: os mesmos passos do CI, em níveis — rápido (build com Python 3.12, conferir que os gerados batem, `node --test`, `node --check`, lint) e completo (+ `tools/run-browser-tests.py`). Regra: só dizer "pronto" com a saída dos comandos na mão.
**C2. `release`** (`disable-model-invocation: true`, só o usuário dispara): bump de versão em todos os lugares, nota `docs/release-vX.md`, mover a nota anterior para `docs/historico/`, atualizar README/AGENTS, rodar `verificar` completo, abrir PR, criar a tag local. Empurrar a tag publica a release de verdade: fica em `permissions.ask` (o usuário confirma na hora). Decisão minha.
**C3. `medicao-aparelho`**: procedimento de medição no Poco por adb (derivado de `docs/medicoes/poco-nfs-2026-11-09/README.md` e `scripts/`), e onde salvar (só conclusões no git; brutos fora).
Por quê: procedimentos de vários passos que hoje vivem espalhados em docs de versão. Ganho: o agente segue o roteiro, não improvisa. Perda: skills envelhecem se o processo mudar (release cobra revisão).

### D. Guardiões

**D1. `.claude/settings.json` → `permissions.deny`**: `git push --force*`, push direto para `main`, `git reset --hard*`, `git clean -f*`, `rm -rf*`, `Edit`/`Write` nos 3 arquivos gerados e em `script.js` (Better xCloud original), leitura de `android/debug.keystore` desnecessária.
**D2. Hook `PreToolUse` (`.claude/hooks/guard.sh`)**: mesma política para Bash (pega variações que o padrão de permissão não pega, como `git push origin +main`), saída 2 com motivo. `onFailure: block`.
**D3. Hook `Stop` (`.claude/hooks/check.sh`)**: se há mudança em `src/`, `tools/`, `tests/`, `player/`, `script.js` ou `android/`, roda o nível rápido do `verificar` (~5 s) e bloqueia o fim da sessão se falhar, com o erro. Respeita `stop_hook_active` para não travar em loop.
Por quê: `CLAUDE.md` é orientação; a doc oficial diz que trava real é hook + deny. Ganho: agente não encerra com build quebrado nem apaga trabalho. Perda: ~5 s em cada fim de turno com código mudado; hook com bug pode atrapalhar (por isso o script é curto e testado).

### E. Qualidade

**E1. Lint só de bugs, não de estilo.** Biome (`biome.json`, regras `correctness` e `suspicious`; ignora `script.js` e gerados) e ruff (`ruff.toml`, regras `F` e `E9`). Corrigir os achados reais iniciais.
**E2. Mesmos comandos em 3 lugares:** skill `verificar`, hook `Stop` e CI (dois passos novos no workflow).
Por quê: hoje só existe `node --check`. Ganho: pega variável indefinida, import morto, closure de laço. Perda: duas ferramentas novas (via `npx`/`uvx`, sem `package.json`); estilo continua livre.
**E2b. CI roda em `pull_request`** (build, testes, lint, Playwright; sem release) e o filtro de paths inclui `biome.json`, `ruff.toml`. Por quê: hoje o workflow só roda em push para `main`/`claude/**`, então branch `MatheusDourado/...` chega ao merge sem CI, e a esteira "CI verde antes do merge" seria só texto. Ganho: CI de verdade antes do merge. Perda: mais minutos de Actions (repo público: grátis). Decisão minha. O passo de release já só roda com tag; conferir que continua assim.
**E3. Sem lefthook/pre-commit.** Por quê: hook `Stop` + CI já cobrem; projeto solo; mais um binário para instalar. Reavaliar se entrar outro contribuidor.

### F. Ferramentas externas

**F1. Plugins oficiais `typescript-lsp` e `pyright-lsp`** (nível usuário; exigem `typescript-language-server` e `pyright` globais). Ganho: ir-para-definição e referências em JS/Python. Perda: instalação global via npm. Java (3 arquivos) fica sem LSP. Instalação feita nesta sessão (decisão do usuário).
**F2. Descartados, com motivo:** code-review-graph (git hooks e `.mcp.json` próprios; redundante no tamanho atual), Serena (duplica LSP), Graphify (instável), codebase-memory-mcp (daemon, `curl | bash`), cc-safety-net/tdd-guard (substituídos por D2 e superpowers), Playwright MCP (o projeto já usa playwright via Python; a própria Microsoft recomenda CLI para agentes), skill `webapp-testing` (duplica `tools/run-browser-tests.py`).

### G. Esteira

Escrita no `AGENTS.md`:
1. Entender: superpowers `brainstorming` → design em `docs/superpowers/specs/`.
2. Planejar: `writing-plans` → plano em `docs/superpowers/plans/`.
3. Executar: branch/worktree; TDD quando há lógica; ponytail (menor mudança).
4. Testar: skill `verificar` (rápido sempre; completo antes de PR). Hook `Stop` garante o rápido.
5. Entregar: `code-review` → PR com template (`.github/pull_request_template.md`: o quê/por quê/como testou/gerados reconstruídos) → CI verde → merge. Release só pela skill `release`.

## Decisões minhas para revisar

- Docs que o código cita (`spec2-estudo`, `spec3-implementacao`, `analysis-v9*`) vão para `historico/` mesmo assim, com comentários corrigidos e rebuild.
- Dados brutos do Poco saem do checkout (ficam no git history).
- Lint só de bugs; estilo livre. Sem lefthook.
- Hook `Stop` compara os gerados com o build feito na hora (não com HEAD): edição em `src/` sem rebuild é corrigida pelo próprio hook.
- Tag de release só sai com confirmação do usuário.
- CI passa a rodar em PR.

## Deixado para quem executa

- Texto exato de `AGENTS.md`, skills e regras.
- Quais achados de lint são bug (corrigir) e quais regras desligar por gerar falso positivo — registrar no `biome.json`/`ruff.toml` com comentário.
- Ordem dos commits (um por bloco A–G).
