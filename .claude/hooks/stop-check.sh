#!/usr/bin/env bash
# Stop hook: when code changed, the turn cannot end with a broken build, test or lint.
# Exit 2 = keep working (stderr goes back to Claude). Tested by .claude/hooks/test-hooks.sh.
input="$(cat)"
case "$input" in *'"stop_hook_active": true'*|*'"stop_hook_active":true'*) exit 0 ;; esac
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$root" || exit 0
[ -z "$(git status --porcelain -- src tools tests player script.js android biome.json ruff.toml)" ] && exit 0
log="$(mktemp)"
if "$root/tools/check.sh" rapido >"$log" 2>&1; then rm -f "$log"; exit 0; fi
{ echo "tools/check.sh rapido falhou. Corrija a causa antes de encerrar (não pule teste nem desligue regra):"; grep -E "^ *✖|::error|^ *×|FAIL|Error:|error:" "$log" | head -20; echo "--- fim do log:"; tail -15 "$log"; } >&2
rm -f "$log"
exit 2
