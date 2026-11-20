#!/usr/bin/env bash
# PreToolUse guard: blocks destructive git/filesystem commands and hand edits to generated files.
# Exit 2 = block (stderr goes back to Claude). Tested by .claude/hooks/test-hooks.sh.
exec python3 -c '
import json, os, re, subprocess, sys

data = json.load(sys.stdin)
tool = data.get("tool_name", "")
inp = data.get("tool_input") or {}
root = os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd()

PROTECTED = {
    "better-xcloud-image-filter.user.js": "arquivo gerado: edite src/ e rode tools/build.py",
    "xcloud-image-filter-play.user.js": "arquivo gerado: edite src/ e rode tools/build.py",
    "output/restoration.bundle.js": "arquivo gerado: edite src/ e rode tools/build.py",
    "script.js": "Better xCloud 6.7.12 original (base do build): mude o patch em tools/build.py ou src/",
}

def block(msg):
    print("Bloqueado pelo guardião do projeto: " + msg, file=sys.stderr)
    sys.exit(2)

if tool in ("Edit", "Write", "MultiEdit", "NotebookEdit"):
    path = inp.get("file_path") or inp.get("notebook_path") or ""
    rel = os.path.relpath(os.path.realpath(os.path.join(root, path)), os.path.realpath(root))
    if rel in PROTECTED:
        block(rel + " é " + PROTECTED[rel] + ".")
    sys.exit(0)

if tool != "Bash":
    sys.exit(0)

c = raw = inp.get("command", "")
# Quoted text and heredoc bodies are data (commit messages, prompts), not commands,
# unless handed to a shell (bash -c / sh -c / eval), where the quotes hold the command.
if not re.search(r"\b(ba|z)?sh\s+-\w*c\b|\beval\b", c):
    c = re.sub(r"<<-?\s*([\x27\"]?)(\w+)\1.*?^\2$", "", c, flags=re.S | re.M)
    c = re.sub(r"\"(\\.|[^\"\\])*\"|\x27[^\x27]*\x27", "\"\"", c)
git = r"\bgit\b[^;&|]*"
rules = [
    (git + r"\bpush\b[^;&|]*(\s--force(-with-lease)?\b|\s-\w*f\b|\s\+\S)", "push forçado reescreve o remoto. Faça um commit novo."),
    (git + r"\bpush\b[^;&|]*[\s:]main\b", "push direto para main. Abra um PR (a esteira exige CI verde antes do merge)."),
    (git + r"\breset\b[^;&|]*--hard", "git reset --hard descarta trabalho. Use git stash push -m <tag> ou um commit WIP."),
    (git + r"\bclean\b[^;&|]*\s-\w*f", "git clean -f apaga arquivos não versionados sem volta."),
    (git + r"\b(checkout|restore)\b[^;&|]*\s(--\s+)?\.(\s|$)", "descartar todas as mudanças do worktree. Restaure arquivo por arquivo, sabendo o que perde."),
    (r"\brm\s+(-\w*r\w*f|-\w*f\w*r|-r\s+-f|-f\s+-r)", "rm -rf. Apague arquivos versionados com git rm; temporários um a um."),
]
for pat, msg in rules:
    if re.search(pat, c, re.I if "rm" in pat else 0):
        block(msg)

# Any push while on main.
if re.search(git + r"\bpush\b", c):
    try:
        branch = subprocess.run(["git", "-C", root, "rev-parse", "--abbrev-ref", "HEAD"], capture_output=True, text=True).stdout.strip()
    except OSError:
        branch = ""
    if branch == "main":
        block("push a partir da main. Crie um branch e abra PR.")

writes = r"(\bsed\s+-\w*i|\bperl\s+-\w*i|\btee\b|\b(mv|cp|truncate)\b)"
for name, why in PROTECTED.items():
    ref = r"(?<![\w.-])(\./)?" + re.escape(name) + r"(?![\w.-])"
    # Redirect only counts when the protected file is its target (2>&1 or > /dev/null elsewhere is fine).
    if re.search(r">\s*[\"\x27]?" + ref, raw) or (re.search(ref, raw) and re.search(writes, raw)):
        block(name + " é " + why + ".")
'
