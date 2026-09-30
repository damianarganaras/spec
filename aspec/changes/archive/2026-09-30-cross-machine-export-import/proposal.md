# Proposal: Export / Import entre máquinas (portabilidad de proyecto)

## Problem

Al copiar un proyecto de una PC a otra (caso real: Windows → Linux, máquina T480), el
`.opencode/opencode.json` queda con el MCP `ancleto-memory` apuntando a rutas Windows
(`C:\Program Files\nodejs\node.exe`, `...\AppData\Roaming\npm\...`). En Linux, opencode
no puede spawnear el server y falla solo en la máquina destino. Hoy no existe ninguna
operación de `ancleto` para preparar/restaurar un proyecto entre máquinas.

## Proposed change

Agregar comandos CLI `ancleto export` (máquina origen: bundle portable con
`manifest.json` que guarda solo la intención MCP —nombres+tipos de servers— sin paths
absolutos) y `ancleto import` (máquina destino: aplica activos portables y regenera
las entradas MCP con las rutas locales vía `buildDefaultMcp`/`resolveBin`/
`resolveSelfCommand`, terminando con `ancleto doctor`). Sumar `ancleto import
--repair` para reparar in place un `opencode.json` con `command` apuntando a paths
inexistentes, sin necesidad de bundle.

## Scope

In scope:
- `ancleto export` (directorio portable o `--tar bundle.tgz`): `.ancletorc`, templates, `aspec/`, skills, commands, agents con tier aplicado, `manifest.json` (versión, agente, tier, idioma, flags, MCP por nombre+tipo).
- `ancleto import`: aplica portables, regenera MCP locales, corre `doctor`.
- `ancleto import --repair`: regenera solo entradas MCP rotas (criterio `existsSync`, igual que `resolveBin`).
- Wrapper opcional `/cleto-transplant` para invocarlo desde el IDE.

Out of scope:
- Exportar credenciales, tokens, `service.json`, `opencode.jsonc` global o `memory.db` (opción futura `--with-memory`).
- Export/import de reglas de memoria (eso es M1 de v0.7.0, change separado).
- Implementarlo como comando markdown `/cleto-*`: requiere spawnear procesos y escribir config, va como comando CLI real.

## Risks

- Bundle con datos sensibles por error: mitigación con lista explícita de exclusión y validación de que el manifiesto no contiene paths absolutos ni secretos.
- `import` pisa config MCP buena del destino: mitigación regenerando solo entradas ausentes o con `command` inexistente (comportamiento `--repair` implícito).
- Divergencia de versiones ancleto origen/destino: mitigación registrando la versión en `manifest.json` y advirtiendo si difiere.
