#!/usr/bin/env bash
# Self-test for the Claude Code hooks: feeds hook-shaped JSON on stdin and checks exit codes.
# Run: bash .claude/hooks/test-hooks.sh
set -uo pipefail
root="$(git rev-parse --show-toplevel)"
dir="$root/.claude/hooks"
fail=0

bash_json() { python3 -c 'import json,sys; print(json.dumps({"tool_name":"Bash","tool_input":{"command":sys.argv[1]}}))' "$1"; }
file_json() { python3 -c 'import json,sys; print(json.dumps({"tool_name":sys.argv[1],"tool_input":{"file_path":sys.argv[2]}}))' "$1" "$2"; }

expect() { # expect <code> <hook> <json> <label>
  local got
  printf '%s' "$3" | CLAUDE_PROJECT_DIR="$root" bash "$dir/$2" >/dev/null 2>&1; got=$?
  if [ "$got" = "$1" ]; then echo "ok   $4"; else echo "FAIL $4 (esperado $1, veio $got)"; fail=1; fi
}

for c in 'git push --force origin x' 'git push -f' 'git push origin +main' 'git push origin main' \
         'git push origin HEAD:main' 'git reset --hard HEAD~1' 'git clean -fdx' 'rm -rf src' 'rm -fr /tmp/x' \
         'bash -c "git push -f"' 'cd x && git reset --hard' 'git -C . push --force-with-lease origin x' \
         'echo x > better-xcloud-image-filter.user.js' "sed -i '' s/a/b/ script.js" 'git checkout -- .' 'git restore .'; do
  expect 2 guard.sh "$(bash_json "$c")" "bloqueia: $c"
done
for c in 'git push origin MatheusDourado/x' 'git push -u origin feat/y' 'git status' 'rm -f output/tmp.txt' \
         'git reset --soft HEAD~1' 'git diff -- script.js' 'cat script.js | head' 'tools/check.sh rapido' 'git checkout -b nova'; do
  expect 0 guard.sh "$(bash_json "$c")" "deixa: $c"
done
for f in better-xcloud-image-filter.user.js xcloud-image-filter-play.user.js output/restoration.bundle.js script.js; do
  expect 2 guard.sh "$(file_json Edit "$root/$f")" "bloqueia Edit: $f"
  expect 2 guard.sh "$(file_json Write "$root/$f")" "bloqueia Write: $f"
done
expect 0 guard.sh "$(file_json Edit "$root/src/panel.js")" "deixa Edit: src/panel.js"
expect 0 guard.sh "$(file_json Edit "$root/tests/script.js.test.cjs")" "deixa Edit: nome parecido"

expect 0 stop-check.sh '{"stop_hook_active": true}' "stop: stop_hook_active sai sem rodar"
if [ -z "$(git -C "$root" status --porcelain -- src tools tests player script.js android biome.json ruff.toml)" ]; then
  expect 0 stop-check.sh '{"stop_hook_active": false}' "stop: sem mudança de código sai 0"
else
  echo "skip stop: há mudança de código no worktree"
fi

exit $fail
