# Design: Soporte de Command Code como host nativo

## Approach

Tratar a `commandcode` como un host más del modelo `AGENT_TARGETS`, reutilizando toda la maquinaria
multi-host (ruteo por host, adaptador de frontmatter con dueño único, manifiesto acumulativo,
`check` derivado de `installedHostsFromPaths`). Las diferencias se concentran en dos piezas:

1. **Adaptador de agents** propio: Command Code espera `tools` como lista de ids, con `default =
   ningún tool`, y no acepta `model` de `opencode-go`. No sirve ni el `dropManagedKeys` de
   `claude`/`vscode`/`copilot` (dropear `tools` deja al subagente inútil) ni el adaptador de
   `antigravity` (ids distintos). Se agrega `adaptCommandCodeFrontmatter`, con un mapa cerrado de
   ids verificados en la doc oficial y omisión-con-aviso para lo no mapeable.
2. **MCP de proyecto** en `.mcp.json`, segunda excepción host-MCP junto a `.agents/mcp_config.json`
   de antigravity. Se agrega `mergeCommandCodeMcp`, mismo criterio no destructivo que
   `mergeAntigravityMcp`/`mergeCopilotMcp`.

Los **commands** se copian verbatim (el body es el prompt); no se reescriben las referencias al
"Skill tool". Es una limitación documentada, consistente con el resto de los hosts.

## Decisions

- **Id de host**: `commandcode` (producto "Command Code", binario `cmd`).
- **Directorio raíz**: `.commandcode/` (project scope). Los tres assets son nativos.
- **Adaptador**: nueva rama explícita en el dispatch de `adaptFrontmatter`; `commandcode` entra en
  `KNOWN_HOSTS` y en `TRANSFORM_AGENTS`. Usa `parseToolFlags` (ya existente) para leer el mapa.
- **`name`**: se inyecta desde el nombre del archivo (el host lo requiere; determinista y sin
  sanitización necesaria para los nombres kebab de ancleto).
- **`model`**: se omite → `inherit` (no se mapea el catálogo `opencode-go/*`).
- **`tools` ausente** en el origen → `tools: "*"` (preserva el default "todas" de opencode).
  **`tools` presente** → lista mapeada (solo claves `true`); si queda vacía, `tools: []`.
- **Tools MCP de memoria**: `searchMemory`/`recordRule`/`recordDecision` se emiten como
  `mcp__ancleto-memory__<tool>` (convención documentada; servidor propio registrado por
  `buildDefaultMcp`).
- **MCP**: `mergeCommandCodeMcp` escribe `.mcp.json` con `{ mcpServers: { [name]: { transport:
  'stdio', command, args, env? } } }`; no pisa un servidor homónimo; JSON inválido → aviso sin
  sobrescribir. Solo aplica con `projectDir` (`.mcp.json` es project scope en Command Code).
- **Tiers**: no reescriben `model` en `.commandcode/agents` (el campo no existe). Se agrega
  `COMMANDCODE_MODEL_NOTE` al orchestrator, análoga a `COPILOT_MODEL_NOTE`.

## Architecture

```text
src/cli/index.js
├── SUPPORTED_AGENTS += 'commandcode'
├── AGENT_TARGETS.commandcode = {
│     skills:   { dir: '.commandcode/skills' },
│     agents:   { dir: '.commandcode/agents',   ext: '.md' },
│     commands: { dir: '.commandcode/commands', ext: '.md' } }
├── installAgentAssets(projectDir, 'commandcode')
│     ├── skills/    → .commandcode/skills/<n>/SKILL.md   (identity)
│     ├── agents/    → .commandcode/agents/<n>.md         (adaptCommandCodeFrontmatter)
│     └── commands/  → .commandcode/commands/<n>.md       (verbatim)
├── COMMANDCODE_MODEL_NOTE  (append a orchestrator.prompt)
├── setupHostMcp()
│     └── agent === 'commandcode' && projectDir → mergeCommandCodeMcp(projectDir) → .mcp.json
└── checkAgentsFrontmatter()  (host = commandcode, sin cambio de lógica)

src/core/adapters/frontmatter.js
├── KNOWN_HOSTS      += 'commandcode'
├── TRANSFORM_AGENTS += 'commandcode'
├── COMMANDCODE_TOOL_MAP  (ids verificados, tabla cerrada)
├── COMMANDCODE_MCP_TOOL_MAP (mcp__ancleto-memory__*)
└── adaptCommandCodeFrontmatter(content, name)

.commandcode/
├── skills/<n>/SKILL.md     # Agent Skills estándar (identity)
├── agents/<n>.md           # name, description, tools: [...] (adaptado)
└── commands/<n>.md         # body = prompt (verbatim)
.mcp.json                   # { mcpServers: { ancleto-memory: { transport: stdio, ... } } }
AGENTS.md                   # memoria/instrucciones (ya lo instala ancleto)
```

Derivación del frontmatter (opencode → Command Code):

```text
description            → description        (preserva)
mode/color/temperature → ✗ elimina
permission             → ✗ elimina (Command Code usa permissionMode, sin equivalente verificado)
model: opencode-go/*   → ✗ omite            (host hereda el modelo de sesión)
tools (mapa)           → tools: [ids]       (mapa verificado; no mapeables → omit+warn)
    read→read_file  write→write_file  edit→edit_file  bash→shell_command
    grep→grep  glob→glob  webfetch→web_fetch  websearch→web_search  todowrite→todo_write
    searchMemory/recordRule/recordDecision → mcp__ancleto-memory__*
    skill/task/patch/... → ✗ omit+warn (sin id verificado)
```

## Validation

- Tests con fixture: `install --project --agent commandcode` crea `.commandcode/{skills,agents,commands}`
  y `.mcp.json` con `ancleto-memory` (`transport: stdio`, rutas válidas)
- Test del adaptador: `mode`/`color`/`temperature`/`permission` ausentes, `model` ausente, `tools`
  mapeado, clave desconocida omitida con aviso a stderr, agent sin `tools` → `tools: "*"`
- Test de MCP: no pisa servidor homónimo ni claves preexistentes; JSON inválido → aviso
- `ancleto check` sobre el layout `commandcode` sin divergencias ni faltantes
- `node --test test/*.test.js` en verde
- Verificación manual documentada: en una sesión `cmd` aparecen las skills, los subagentes y los
  `/cleto-*`, y el MCP de memoria responde
