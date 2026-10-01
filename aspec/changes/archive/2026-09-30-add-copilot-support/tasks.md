# Tasks: Soporte de GitHub Copilot (VS Code y Visual Studio)

## Fase 1 — Registro del agente en el CLI

- [x] Sumar `'copilot'` a `SUPPORTED_AGENTS` (`src/cli/index.js`) con tests del wizard y `--agent copilot`.
- [x] Agregar `AGENT_SKILLS_DIR['copilot'] = '.github/prompts'` y persistencia `agent: copilot` en `.ancletorc`.
- [x] Verificar que `applyTier` no reescribe nada bajo `.github/prompts` (sin `model:`).

## Fase 2 — Conversión de prompts y MCP

- [x] Implementar conversión `agents/*.md` + `commands/*.md` → `.github/prompts/*.prompt.md` en `installAgentSkills`.
- [x] Extender `mergeMcp` hacia `copilot-mcp.json` con merge no destructivo.
- [x] Cablear `--project` y `upgrade --agent copilot` (regenera prompts, preserva `copilot-instructions.md` custom).

## Fase 3 — Documentación y verificación

- [x] Documentar la limitación de modelos (picker + tiers como esfuerzo) en la guía.
- [x] Tests con fixture: install crea prompts + MCP válido; upgrade no trunca customs.
- [x] Verificación manual en VS Code y Visual Studio 2022+ (agentes visibles, MCP responde).
- [x] Suite `node --test` en verde.
