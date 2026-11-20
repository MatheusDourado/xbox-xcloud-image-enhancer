@AGENTS.md

## Claude Code

- Skills do projeto: `verificar` (antes de dizer pronto), `release` (só quando o usuário pedir, `/release`), `medicao-aparelho` (testes no Poco por adb).
- Planejar e executar: skills do superpowers (brainstorming → writing-plans → executing-plans), seguindo a esteira acima.
- Memória entre sessões: claude-mem. Registre decisões e lições, não o que já está no git.
- Os hooks rodam também em modo bypass. Se um bloqueio parecer falso positivo, reformule o comando (texto entre aspas não conta) ou avise o usuário; não contorne.
