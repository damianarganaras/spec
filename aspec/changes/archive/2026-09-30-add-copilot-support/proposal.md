# Proposal: Soporte de GitHub Copilot (VS Code y Visual Studio)

## Problem

`ancleto` instala skills para `opencode`, `vscode`, `antigravity`, `cursor` y `roo`
(`SUPPORTED_AGENTS` en `src/cli/index.js:593`), pero no existe el agente `copilot`.
Los usuarios con suscripción a GitHub Copilot (VS Code o Visual Studio 2022+) no pueden
usar el orchestrador ni los subagentes en su IDE: `installAgentSkills` no sabe dónde
poner los prompts de Copilot y el mecanismo tier → modelos (`applyTier` reescribiendo
`model:` en `agents/*.md`) solo aplica a opencode, así que no hay historia definida
para Copilot.

## Proposed change

Agregar `copilot` como agente soportado: convertir `agents/*.md` y `commands/*.md` a
prompt agents de Copilot en `.github/prompts/*.prompt.md`, configurar el MCP
(`engram`, `caveman`, `ancleto-memory`) en `copilot-mcp.json` con el mismo merge no
destructivo de `opencode.json`, y documentar la limitación real de modelos (en Copilot
el modelo lo elige el usuario en el picker; los tiers se traducen a nivel de
esfuerzo/pasos, no a IDs de modelo).

## Scope

In scope:
- Sumar `'copilot'` a `SUPPORTED_AGENTS` y `AGENT_SKILLS_DIR['copilot'] = '.github/prompts'`.
- Conversión `agents/*.md` + `commands/*.md` → `.github/prompts/*.prompt.md` en `install`/`--project`/`upgrade`.
- `mergeMcp` hacia `copilot-mcp.json` (raíz o `.github/copilot-mcp.json`).
- Documentar que el tier no cambia modelos en Copilot.

Out of scope:
- Forzar selección de modelos por rol/tier en Copilot (imposible por diseño del producto).
- Soporte de otros IDEs más allá del mapeo existente.
- Cambios en el motor de tiers de opencode.

## Risks

- Divergencia entre prompts `.prompt.md` y `agents/*.md`: mitigación generando los primeros desde los segundos en cada `install`/`upgrade`, sin edición manual duplicada.
- Usuarios esperando paridad de tiers: mitigación con documentación explícita y mensaje del orchestrator pidiendo elegir modelo en el picker.
- Formato `.prompt.md` de Copilot cambiante: mitigación manteniendo frontmatter mínimo (nombre) e instrucciones idénticas al `agents/*.md` origen.
