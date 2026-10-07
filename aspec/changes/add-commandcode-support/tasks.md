# Tasks: Soporte de Command Code como host nativo

## Fase 1 — Alta del host y ruteo nativo

- [x] Sumar `commandcode` a `SUPPORTED_AGENTS` (`src/cli/index.js`) con cobertura del wizard y de `--agent commandcode`.
- [x] Agregar la entrada `commandcode` a `AGENT_TARGETS`: skills `.commandcode/skills`, agents `.commandcode/agents` (`.md`), commands `.commandcode/commands` (`.md`).
- [x] Verificar persistencia en `.ancletorc` (`agent: commandcode`) y preservación en ejecuciones subsecuentes.
- [x] Verificar que `applyTier` no reescribe `model` bajo `.commandcode/agents` (no existe el campo).

## Fase 2 — Adaptador de frontmatter de agents

- [x] Agregar `commandcode` a `KNOWN_HOSTS` y a `TRANSFORM_AGENTS` (`src/core/adapters/frontmatter.js`).
- [x] Definir `COMMANDCODE_TOOL_MAP` (tabla cerrada) y `COMMANDCODE_MCP_TOOL_MAP` (`mcp__ancleto-memory__*`).
- [x] Implementar `adaptCommandCodeFrontmatter(content, name)`: inyecta `name`, preserva `description`, elimina `mode`/`color`/`temperature`/`permission`, omite `model` (inherit).
- [x] Traducir `tools` mapa → lista; clave sin id verificado → omisión con aviso a stderr (exit 0).
- [x] Agent sin `tools` declarado → `tools: "*"`; `tools` con sólo claves `false` → `tools: []`.
- [x] Cablear la rama `commandcode` en el dispatch de `adaptFrontmatter` (sólo `assetKind === 'agents'`).

## Fase 3 — MCP de proyecto (`.mcp.json`)

- [x] Implementar `mergeCommandCodeMcp(projectDir, mcpMap)`: `mcpServers` con `transport: 'stdio'`, `command`, `args`, `env?`; merge no destructivo.
- [x] No pisar un servidor homónimo ni claves top-level preexistentes; JSON inválido → aviso sin sobrescribir.
- [x] Cablear en `setupHostMcp` (`agent === 'commandcode' && projectDir`) y sólo con `projectDir` (project scope).
- [x] Extender `upgrade` para regenerar/self-heal de entradas de `.mcp.json` (análogo a `refreshCopilotMcp`).

## Fase 4 — Nota de modelo y documentación

- [x] Agregar `COMMANDCODE_MODEL_NOTE` y anexarla al `orchestrator` (análoga a `COPILOT_MODEL_NOTE`) en install y en `check`.
- [x] Documentar que los tiers no reescriben modelos en Command Code (modelo heredado; se elige con `/model`).
- [x] Registrar como limitación que el body de los `commands` invoca "the Skill tool" (equivalente Command Code: `/skill:<name>`).

## Fase 5 — Tests y verificación

- [x] Test de ruteo: `install --project --agent commandcode` crea los tres directorios y registra `installedPaths` veraces.
- [x] Test del adaptador: keys dropeadas, `model` ausente, `tools` mapeado, clave desconocida con aviso, `tools: "*"` cuando falta.
- [x] Test de MCP: `.mcp.json` creado con `ancleto-memory` (`transport: stdio`); no destructivo; JSON inválido avisa.
- [x] Test de `check` sobre layout `commandcode` (sin faltantes ni divergencias de frontmatter).
- [x] `node --test test/*.test.js` en verde.
- [x] Verificación manual documentada en una sesión `cmd` (skills, subagentes, `/cleto-*`, MCP de memoria).
