# Proposal: Soporte de Command Code como host nativo

## Problem

`ancleto` soporta los hosts `opencode`, `claude`, `vscode`, `antigravity`, `cursor`, `roo` y
`copilot` (modelo `AGENT_TARGETS` en `src/cli/index.js`). Command Code (CLI `cmd`, de
CommandCodeAI) no está soportado: un usuario que trabaja con `cmd` no puede instalar el catálogo
de skills, los subagentes ni los comandos `/cleto-*` en su layout nativo.

Command Code tiene un modelo de configuración propio que no coincide con ningún host existente:

- Directorios nativos bajo `.commandcode/`: `skills/` (Agent Skills, `SKILL.md`), `agents/`
  (subagentes `<n>.md` con frontmatter) y `commands/` (slash commands `<n>.md`, el body es el prompt).
- El frontmatter de sus agents usa `name`, `description`, `tools` (lista de ids propios o `"*"`),
  `disallowedTools`, `model`, `permissionMode`, etc. **Un `tools` omitido significa "ningún tool"**
  (a diferencia de otros hosts), así que copiar el frontmatter de opencode verbatim o dropear
  `tools` deja a los subagentes sin capacidad.
- El MCP de proyecto vive en `.mcp.json` (scope `project`), con esquema `mcpServers` /
  `transport: stdio` / `command` / `args` / `env`.
- Lee `AGENTS.md` como memoria/instrucciones del proyecto (ancleto ya lo instala).

## Proposed change

Agregar `commandcode` como host nativo de primera clase:

1. **Ruteo nativo** (`AGENT_TARGETS`): skills → `.commandcode/skills`, agents →
   `.commandcode/agents`, commands → `.commandcode/commands`.
2. **Adaptador de frontmatter de agents** para `commandcode`: preserva `description`, inyecta
   `name` desde el archivo, elimina `mode`/`color`/`temperature`/`permission`, omite `model`
   (el host hereda el modelo de sesión) y traduce el mapa `tools` de opencode a la lista de ids
   verificados de Command Code. Las claves sin id verificado se omiten con aviso a stderr
   (nunca en silencio). Un agent sin `tools` declarado recibe `tools: "*"` (preserva el default
   "todas las tools" de opencode).
3. **MCP de proyecto** (`mergeCommandCodeMcp`): merge no destructivo hacia `.mcp.json`
   (`transport: stdio`, `command`, `args`, `env`), igual criterio que `mergeAntigravityMcp` y
   `mergeCopilotMcp`. Segunda excepción host-MCP de `agent-install-routing`, junto a antigravity.
4. **Nota de modelo** en el orchestrator: los tiers no reescriben modelos para este host (el
   `model` se hereda); la nota indica elegir con `/model`.
5. **Alta del host**: `SUPPORTED_AGENTS`, wizard, `--agent commandcode`, persistencia en
   `.ancletorc`.

## Scope

In scope:

- `commandcode` en `AGENT_TARGETS`, `SUPPORTED_AGENTS` y `KNOWN_HOSTS`/`TRANSFORM_AGENTS`.
- Nueva rama del adaptador (`adaptCommandCodeFrontmatter`) + mapa verificado de tools.
- `mergeCommandCodeMcp` hacia `.mcp.json` en `install --project`/`init` (y refresh en `upgrade`).
- Nota de modelo de Command Code en el orchestrator (análoga a `COPILOT_MODEL_NOTE`).
- Tests de ruteo, adaptador, MCP y `check`.
- Deltas de spec sobre `agent-install-routing` y `skill-frontmatter-adapters`; nueva capability
  `commandcode-support`.

Out of scope:

- Adaptar el **body** de los `commands` (hoy invocan "the Skill tool"). Se copian verbatim, como
  en el resto de los hosts; la diferencia con `/skill:<name>` de Command Code queda registrada
  como riesgo/limitación.
- Aplicar selección de modelos por tier/rol en Command Code (el `model` se hereda).
- Importar/exportar MCP desde otros agentes (Command Code tiene `/import` propio).
- Cualquier cambio en el motor de tiers o en el motor de memoria.

## Risks

- **Agents sin tools**: mitigado con el mapa verificado y `tools: "*"` cuando el origen no declara
  `tools`; nunca se emite un id inventado (política de `skill-frontmatter-adapters`).
- **Tools MCP de memoria**: `memory-keeper` declara `searchMemory`/`recordRule`/`recordDecision`.
  Se emiten como `mcp__ancleto-memory__<tool>` (convención documentada `mcp__<server>__<tool>`,
  servidor propio y conocido) Y se mergea `.mcp.json`; si el usuario corre `--no-mcp`, esas tools
  quedan referenciando un servidor ausente.
- **Commands verbatim**: el body dice "invoke the X skill"; en Command Code el equivalente es
  `/skill:<name>`. Documentado como limitación; no se transforma especulativamente.
- **`.mcp.json` compartido con Claude**: Command Code y Claude usan el mismo archivo; el merge es
  no destructivo y el descubrimiento compartido es un efecto del host (no se arbitra).
- **Formato de Command Code cambiante**: el mapa de tools se ciñe a los ids documentados; una
  clave no listada se omite con aviso, nunca se inventa.
