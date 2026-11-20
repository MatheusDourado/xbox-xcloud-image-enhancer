#!/usr/bin/env bash
# Single source of the project checks, used by the `verificar` skill, the Claude Code Stop hook and CI.
# Usage: tools/check.sh [rapido|completo]   (default: rapido)
#   rapido   build + generated files + node tests + node --check + lint (~5 s)
#   completo rapido + Playwright browser suites (minutes)
# In CI (CI=true) the build must not change the committed generated files.
set -euo pipefail
cd "$(dirname "$0")/.."
level="${1:-rapido}"
case "$level" in rapido|completo) ;; *) echo "uso: tools/check.sh [rapido|completo]" >&2; exit 64 ;; esac

need() { command -v "$1" >/dev/null 2>&1 || { echo "check.sh: falta '$1'. $2" >&2; exit 1; }; }
step() { echo "== $*"; }

# build.py needs Python 3.10+; macOS ships 3.9, so fall back to uv.
if command -v python3 >/dev/null 2>&1 && python3 -c 'import sys; sys.exit(sys.version_info < (3, 10))'; then
  py=(python3)
else
  need uv "Instale Python 3.10+ ou uv (https://docs.astral.sh/uv/)."
  py=(uv run -q -p 3.12 --no-project python)
fi
need node "Instale Node 22."
need npx "Instale Node 22 (traz o npx)."
need uvx "Instale uv (https://docs.astral.sh/uv/), que traz o uvx."

generated=(better-xcloud-image-filter.user.js xcloud-image-filter-play.user.js output/restoration.bundle.js)

step build
"${py[@]}" tools/build.py
if [ "${CI:-}" = "true" ]; then
  git diff --exit-code -- "${generated[@]}" || { echo "::error::Arquivos gerados desatualizados: rode tools/build.py e faça commit"; exit 1; }
fi

step "node --test"
node --test tests/*.cjs

step "node --check"
for f in "${generated[@]:0:2}" player/player.js; do node --check "$f"; done

step "biome (bugs)"
npx -y @biomejs/biome@2.6.8 lint .

step "ruff (bugs)"
uvx -q ruff@0.17.6 check .

if [ "$level" = completo ]; then
  step "browser (Playwright)"
  if "${py[@]}" -c 'import playwright' 2>/dev/null; then
    "${py[@]}" tools/run-browser-tests.py
  else
    need uv "Instale uv ou: python3 -m pip install playwright==1.60.0"
    uv run -q -p 3.12 --no-project --with playwright==1.60.0 python tools/run-browser-tests.py
  fi
fi

echo "check.sh $level: OK"
