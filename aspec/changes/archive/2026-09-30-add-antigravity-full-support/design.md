# Design: add-antigravity-full-support

## Contexto

Estado confirmado contra `src/cli/index.js` (mecanismo introducido por el change archivado
`add-multi-agent-cli-support`):

- `AGENT_TARGETS` (`:742-763`): modelo único de destino por host, con `{ dir, ext }` por asset; `null` =
  asset no soportado. Antigravity hoy: `{ skills: { dir: '.agents/skills' }, agents: null, commands: null }`.
- `installAgentAssets` (`:838-859`): dueño único de la instalación; escribe cada asset no-`null` vía
  `copyDirTransformed` (skills) o `installAssetFiles` (agents/commands), y avisa por stderr los `null`.
- `adaptFrontmatter(content, host, assetKind)` (`:797-803`): sólo transforma `agents` de
  `AGENT_ADAPTER_HOSTS = { claude, vscode }`, eliminando `mode/color/temperature/permission/model/tools`.
- `parseFrontmatter`/`serializeFrontmatter` (`:769-789`): parser propio sin dependencias, preserva orden.
- `mergeMcp` (`:697-730`): merge en `opencode.json`/`opencode.jsonc` con esquema
  `{ mcp: { <n>: { type:'local', enabled, command:[...] } } }`. `initProject` (`:1158-1242`) no lo invoca.
- `installedExtFor` (`:872-878`) y `checkCommand` (`:1688-1742`): derivan la convención de nombre del mismo
  modelo; `check` compara contra `ROOT/<cat>`.
- `registerProject` (`:154-174`), `projectStatus` (`:227-244`), `checkTierOrphan` (`:1746-1761`): acoplados
  a `.opencode/agents` y `.opencode/.ancleto-tier`.
- Cero dependencias: parser propio con `node:*`.

Este documento traduce la evidencia en decisiones. No es un volcado de la matriz.

---

## D1 — Destino de Antigravity en el modelo `AGENT_TARGETS`

Se completa la entrada de Antigravity en el modelo existente (no se crea un mecanismo nuevo):

| Asset | Destino | Formato |
|---|---|---|
| skills | `.agents/skills/<n>/SKILL.md` | Agent Skills (sin cambios) |
| agents | `.agents/agents/<n>.md` | frontmatter adaptado (D2) |
| commands | `.agents/skills/<n>/SKILL.md` | skill empaquetada (D4) |

Se elige `.agents/agents/<n>.md` (forma plana) sobre `.agents/agents/<n>/agent.md` porque coincide con la
convención `<n>.md` que ya usan opencode/claude y con `installAssetFiles` (no requiere subdirectorio por
agent).

Para `commands` el destino **no** es un directorio de commands (Antigravity no lo tiene). Se agrega al
modelo una marca de empaquetado por asset: `commands: { dir: '.agents/skills', package: 'skill-dir' }`.
`package: 'skill-dir'` es un valor nuevo, pequeño y explícito, que reutiliza el mismo dueño de instalación
en lugar de un camino de escritura paralelo.

## D2 — Adaptador de agents para Antigravity

Antigravity entra al pipeline de adaptación (`AGENT_ADAPTER_HOSTS`) pero con **transformación propia**, no
la de Claude/VS Code (que elimina `tools`). El adaptador para Antigravity produce:

| Origen (ancleto/opencode) | Destino (Antigravity) | Regla |
|---|---|---|
| (nombre del archivo) | `name: <n>` | **inyectado**; Antigravity lo exige y ancleto no lo declara |
| `description` | `description` | preservado (portable, verificado) |
| `tools` (mapa) | `tools: string[]` | derivado: sólo claves con valor `true`, mapeadas **sólo** por la columna (A) de D3 |
| `skill` (dentro del mapa `tools`) | campo `skills: [...]` | **no es tool**: se traduce al campo `skills` cuando el agent declara skills conocidas; si no, se omite (OQ2) |
| uso de MCP | campo `mcpServers` (agent-level) y/o `.agents/mcp_config.json` de workspace (D6) | **no es tool**: no se emite ningún tool id de MCP; `call_mcp_tool` **prohibido** |
| `mode: primary` | `mainAgent: true`, `subagent: false` | mapeo determinista |
| `mode: subagent` | `mainAgent: false`, `subagent: true` | mapeo determinista |
| `model` (`opencode-go/*`) | `model: inherit` | política fija (D8); sin equivalencias inventadas |
| `color`, `temperature`, `permission` | — | eliminados |
| `tools` en forma de mapa | — | reemplazado por la lista derivada |

Se emite `tools` **siempre** (aunque sea `[]`), porque el default del host es `[]` y la explicitación hace
la salida determinista y auditable. Cuando un agent **no** declare `mode`, se emiten `mainAgent: true` y
`subagent: true` (default del host, OQ4); la semántica fina de ambos booleanos queda como deuda.

El adaptador necesita el nombre base del asset, que hoy `adaptFrontmatter` no recibe. Decisión: se extiende
la firma para pasar el nombre (el instalador ya lo conoce: `installAssetFiles` hace
`base = e.name.slice(0, -MD_EXT.length)`). No se duplica el parser.

## D3 — Mapeo de `tools` a ids de Antigravity (tres columnas explícitas)

Tabla única de traducción (owner: `skill-frontmatter-adapters`). La fuente de ids emitibles es
exclusivamente la tabla de **frontmatter de subagents** de Antigravity (docs "Custom Subagents" + blog
"Introducing Custom Agents"). Todo id se clasifica en **una** de estas cuatro columnas; **sólo (A) es
emitible**.

### (A) Confirmado en el frontmatter de subagents — únicos ids emitibles

| ancleto | Antigravity frontmatter |
|---|---|
| `read` | `view_file` |
| `edit` | `replace_file_content` |
| `grep` | `grep_search` |
| `bash` | `run_command` |
| `todowrite` | `manage_task` |

- Estos **5 ids** son el **conjunto cerrado** de ids emitibles; no se agrega ninguno por analogía.
- Sólo se mapean claves con valor `true`; las `false` no producen id.
- `grep` → `grep_search` (**OQ1 cerrada**).
- `edit` → `replace_file_content` (**no** `edit_file`, que es del SDK).
- `view_file` y `run_command` también aparecen en el SDK, pero al estar **confirmados en frontmatter**
  cuentan en (A), no en (B).

### (B) Solo SDK (`BuiltinTools`, Python SDK) — NO emitibles en el frontmatter

Ids que existen en el SDK de Python pero **NO** están confirmados en la tabla de frontmatter de subagents.
**NO se transfieren por analogía al frontmatter**:

`list_directory`, `search_directory`, `find_file`, `create_file`, `edit_file`, `ask_question`,
`start_subagent`, `generate_image`, `search_web`, `read_url_content`, `finish`.

### (C) No encontrado en docs oficiales — solo guías de comunidad

Ids sin evidencia oficial (aparecen sólo en guías de comunidad, no en la documentación oficial):

`call_mcp_tool`, `write_to_file`, `multi_replace_file_content`, `list_dir`, `send_message`.

### (D) Tools de delegación (lado padre/runtime) — NO van en la lista `tools` del subagente

| Id | Rol |
|---|---|
| `invoke_subagent` | Lo invoca el **padre** para invocar un subagente. **No es un tool del subagente**: lo que **habilita** la invocación es `subagent: true` en el frontmatter, **no** un id de `tools`. |
| `start_subagent` | Delegación/runtime (lado padre); también figura en el SDK (columna B). |
| `define_subagent` | Delegación/runtime (lado padre). |

Ninguno de estos es un id del frontmatter `tools` de un subagente; **NO se emiten**.

### Filas no-tool (fuera del mapeo `tools`)

| ancleto | Resolución |
|---|---|
| `skill` | **no es tool** → campo `skills: [...]` del frontmatter (OQ2); si no, se omite |
| uso de MCP | **no es tool** → campo `mcpServers` (agent-level) y/o `.agents/mcp_config.json` de workspace (D6) |

### Regla de decisión (fija)

**Si un id no está confirmado en la tabla de frontmatter de subagents (columna A), NO se emite — exista o no
en el SDK.** Toda clave de `tools` sin id en (A) se **omite con aviso** a stderr, no bloqueante (D5). Nunca se
emite un id de (B), (C) ni (D). Un id no verificado **cuelga** el subagent (Known Issue oficial).

### MCP: conflación resuelta

- El adaptador **no** emite `call_mcp_tool` (columna C: no oficial).
- `mcpServers` como **campo** del frontmatter → **configuración** (no tool).
- Toda clave de **MCP dentro del mapa `tools`** (`mcpServers`, `mcp_*`, `call_mcp_tool`, o cualquier otra no
  confirmada) → **omitir con aviso** (no en silencio): no es un id verificado.
- Tool desconocida → **omitir con aviso**.
- El adaptador **no** infiere "usa MCP" desde claves desconocidas del mapa `tools` ni agrega un tool id.

## D4 — `commands` materializados como skills

Antigravity no tiene directorio de commands de proyecto; su equivalente (Workflows) está deprecado a favor
de Agent Skills. Decisión: los `commands/cleto-*.md` se materializan como skills en `.agents/skills/`:

- Destino: `.agents/skills/<command>/SKILL.md`.
- Frontmatter de origen (`description`) se transforma a skill: `name: <command>` + `description`.
- Body: conservado verbatim (invoca la skill `ancleto-*` correspondiente).

Racional: deja los `/cleto-*` disponibles como slash commands en Antigravity sin generar Workflows
deprecados y sin duplicar el workflow real (que vive en las skills `ancleto-*`). Los nombres `cleto-*` y
`ancleto-*` no colisionan.

**Manifiesto**: Antigravity no tiene un directorio de commands físico; los command-skills viven dentro de
`.agents/skills`. Por eso `installedPaths.commands` queda vacío para Antigravity y los command-skills son
parte del layout de skills. Esto es honesto con "unión de destinos realmente escritos" (D10 del change
archivado) y evita listar el mismo directorio bajo dos categorías con expectativas distintas.

**Consecuencia para `check`** (ver D9): el conjunto esperado de `.agents/skills` se deriva de la unión de los
hosts instalados y debe incluir el catálogo `skills/*` **y** los command-skills derivados de `commands/*`.

## D5 — Política ante tools/model no mapeables: omitir con aviso, nunca inventar

Regla única, coherente con la política de `skill-frontmatter-adapters`:

- Una clave de `tools` sin id en la columna (A) de D3 (una tool de opencode no mapeada o una tool futura)
  **no se emite** y se avisa por stderr
  (`skip tool '<k>': no verified Antigravity id for agent '<n>'`), **no bloqueante** (exit code sin cambios).
  Nunca se emite un id inventado: un id inexistente **cuelga** el subagent (Known Issue oficial). La regla
  cubre por igual a las columnas (B) solo-SDK (`find_file`, `search_web`, `read_url_content`, `edit_file`,
  `list_directory`, `search_directory`, `create_file`, `ask_question`, `finish`, `generate_image`,
  `start_subagent`), (C) comunidad (`write_to_file`, `multi_replace_file_content`, `list_dir`,
  `send_message`) y (D) delegación (`invoke_subagent`, `define_subagent`), además de `write`, `glob`, `task`,
  `webfetch` y `websearch` del mapa de ancleto.
- `skill`: **no es una tool**; se traduce al campo `skills: [...]` del frontmatter cuando el agent declara
  skills conocidas (OQ2) y, si no, se omite. No cae en el aviso de "tool sin mapear".
- **MCP**: el **mecanismo** de MCP (`mcpServers` agent-level y/o `.agents/mcp_config.json` de workspace; D6)
  queda **fuera** de la política de `tools`, pero las **claves MCP declaradas dentro de `tools`** (p. ej.
  `mcpServers`, `mcp_*`, `call_mcp_tool`) **no** son ids verificados: caen en la **política de omisión con
  aviso** (se omiten de la lista `tools` y se avisa por stderr, **no en silencio**). El adaptador **no** infiere
  "usa MCP" desde claves desconocidas del mapa `tools`. `call_mcp_tool` queda **prohibido** (columna C: no es id
  oficial y cuelga el subagent).
- `model`: no se traduce desde el catálogo `opencode-go`; se fija en `inherit` (D8).
- `mainAgent`/`subagent`: se emiten ambos `true` (default del host) cuando el agent no declare `mode`; la
  semántica fina es deuda (OQ4).
- `commandExecutionPolicy`: default documentado (`sandbox`); **no** se deriva de `permission` todavía (OQ5,
  deuda). La derivación agent-level de `mcpServers`/`plugins` **no** se hace en este change (deuda); se omiten
  (el MCP de workspace, en cambio, sí entra: D6).

## D6 — MCP de workspace de Antigravity (`.agents/mcp_config.json`)

Este MCP de workspace **entra en este change**: es condición del requisito "totalmente funcional" (sin el MCP
de memoria la instalación no queda lista para usarse), no un ítem aparte.

Nuevo dueño `setupHostMcp(projectDir, agent, mcpMap)` que despacha por host:

- `antigravity` → mergea `.agents/mcp_config.json`:
  `{ "mcpServers": { "<n>": { "command": "...", "args": [...], "env": {...} } } }`.
  Conversión desde el `mcpMap` interno (`{ type, enabled, command: [...] }`):
  `command = arr[0]`, `args = arr.slice(1)`; se descartan `type`/`enabled`.
- resto de hosts → comportamiento actual (`mergeMcp` sobre `opencode.json`), sin cambios.

Regla **no destructiva**: si `.agents/mcp_config.json` existe, se preservan sus `mcpServers` y demás claves
top-level; sólo se agregan los servidores faltantes. Un servidor homónimo preexistente **no** se pisa. Si el
archivo existe pero no es JSON parseable, se avisa y **no** se escribe.

Servidores por defecto (mismo `buildDefaultMcp({})` que `install`): `ancleto-memory`
(`[process.execPath, <index.js>, 'mcp']` → `{ command: process.execPath, args: [<index.js>, 'mcp'] }`) y
`caveman` si está en `PATH`.

`engram` y `azure-devops` quedan fuera de `init` (no-goal del proposal).

### Supersede acotado

Se **supersede** `cli.host-mcp-config-out-of-scope` **sólo para Antigravity**. `.mcp.json` (Claude) y
`.vscode/mcp.json` (VS Code) siguen OOS. Se registra la nueva decisión en memoria.

## D7 — `init` completo: MCP compartido y wiring

- `initProject` invoca `setupHostMcp(projectDir, agent, buildDefaultMcp({}))` salvo `--no-mcp`, con la
  misma semántica que `install`. Un único dueño de MCP evita una rama especial por host.
- Se agrega `--no-mcp` a `init` para conservar el escape.
- Efecto observable declarado: `init --agent opencode` ahora también configura `opencode.json`.
- `--agent antigravity` ya está en `SUPPORTED_AGENTS` (`:598`), en el wizard (`:601-610`) y en `--help`
  (`:38`). Se ajusta el texto de ayuda/README para reflejar que Antigravity instala agents/commands y MCP.

## D8 — Política de `model` para Antigravity

Los agents de Antigravity reciben `model: inherit` fijo. **No** se mapea el tier a `flash`/`pro` en este
change: sería una equivalencia no documentada (regla D5 del change archivado). Consecuencia: el tier no
reescribe modelos de Antigravity.

Esto es consistente con el comportamiento actual de Claude/VS Code, cuyos `model` se eliminan y cuyo
`applyTier` (que apunta a `.opencode/agents`) resulta un no-op. Para Antigravity, `applyTier` sigue
apuntando a `.opencode/agents`, que no existe en un proyecto antigravity-only → no-op; el `model: inherit`
lo fija el adaptador. Se documenta explícitamente para que no se interprete como un descuido. Se registra
como **deuda de producto** (OQ3): mapear tier → `flash`/`pro` exigiría una equivalencia verificada que hoy no
existe.

## D9 — `check` y tier host-aware (desacople de `.opencode/*`)

Mismo root cause en tres funciones; se resuelve con un helper único que deriva los directorios locales de
agents del host/manifiesto:

- `registerProject` (`.opencode/agents` → resuelto) y `projectStatus` (`.opencode/agents` → resuelto):
  `scoped` = existen archivos de agents en el layout instalado. Para Antigravity, `.agents/agents` → scoped.
- `checkTierOrphan` (`.opencode/agents` → resuelto): cuenta `.md` en los directorios de agents instalados.
  Con `.agents/agents` presente, **no** emite "tier sin agentes locales".
- `checkCommand`: el conjunto esperado de cada directorio se deriva de la **unión de los hosts realmente
  instalados** (leída del manifiesto/`installedPaths`), no de un único `rc.agent`. Para `.agents/skills`, el
  conjunto esperado es `skills/*` ∪ `commands/*` (empaquetados). Sin esto, los command-skills aparecerían como
  huérfanos, los commands como faltantes, y un proyecto multi-host (p. ej. `rc.agent: opencode` con
  Antigravity también instalado) reportaría huérfanos falsos.

`projectStatus` se incluye aunque la delegación nombra `registerProject`/`checkTierOrphan`: los tres leen la
misma ruta fija y arreglar sólo dos dejaría `projects list` mostrando un proyecto Antigravity como global.

## D10 — Tests

- El test existente `test/cli.test.js` **5.2** afirma que Antigravity no crea `.agents/agents` ni
  `.agents/commands` y que emite los avisos de skip. Debe **reemplazarse** por el nuevo comportamiento.
- Tests nuevos por recorte (ver `tasks.md`): ruteo de agents adaptados, mapeo de `tools` (sólo ids
  verificados; tool sin id verificado omitida con aviso y exit 0; `skill` y MCP no se emiten como tool id),
  commands→skills, MCP de workspace no destructivo, `check`/tier sin falso huérfano (incluido multi-host),
  no-regresión de opencode/claude/vscode.
- Validación real del repo: `node --test test/*.test.js` (no hay `npm run lint`/`typecheck` ejecutables; ver
  memoria `validacion-real-node-test-sin-tooling`).

## D11 — Capabilities y deltas

- `agent-install-routing` (MODIFIED): cobertura de soporte, ejemplo del aviso, MCP de host con excepción.
- `skill-frontmatter-adapters` (MODIFIED + ADDED): host set del adaptador + adaptador de Antigravity (D2/D3/D5).
- `antigravity-support` (ADDED): directorios (D1), commands→skills (D4), requiere adaptador, MCP workspace
  (D6), init completo (D7), `check`/tier host-aware (D9), política de model (D8).

---

## Open questions cerradas (resueltas contra docs oficiales)

- **OQ1 (cerrada)**: `grep` → `grep_search`, el id del frontmatter de subagents. `search_directory` **no**
  aplica (pertenece al SDK de Python `BuiltinTools`, no al frontmatter de `.agents/agents/*.md`).
- **OQ2 (cerrada)**: `skill` **no es una tool** de Antigravity. Se traduce al campo `skills: [...]` del
  frontmatter cuando el agent declara skills conocidas; si no, se omite. Antigravity surfacea skills
  automáticamente al inicio de sesión → no rompe `orchestrator`/`spec-writer`.

## Open questions abiertas

- **OQ6 (abierta)**: el listado oficial completo de tool ids del frontmatter de subagents **no** está
  completamente verificado. Hasta confirmarlo, `write`, `glob`, `task`, `webfetch` y `websearch` quedan
  **omitidas con aviso** (regla dura D3/D5). Los ids que circulan como "candidatos" (`write_to_file`,
  `find_file`, `read_url_content`, `search_web`, `invoke_subagent`) **no** son candidatos del frontmatter: su
  lugar es la columna (B) solo-SDK, (C) comunidad o (D) delegación, y **no se emiten** mientras no haya
  evidencia oficial que los confirme en el frontmatter.

## Deudas y riesgos (decididos, no bloqueantes)

- **Capacidades omitidas** (`write`/`glob`/`task`/web): sin id verificado se omiten con aviso hasta verificar
  el listado oficial completo (OQ6). Deuda de producto: los agents de Antigravity no tendrán esas capacidades.
- **MCP no es tool** (D3/D5): se expresa por `mcpServers`/workspace; `call_mcp_tool` **prohibido**.
- Tier → `flash`/`pro` (OQ3, D8): **no** se mapea; `model: inherit` fijo. Deuda de producto.
- `mainAgent`/`subagent` (OQ4, D2): cuando no hay `mode`, ambos `true` (default del host); semántica fina no
  documentada. Deuda.
- `commandExecutionPolicy` (OQ5, D5): default `sandbox` documentado; no derivado de `permission`. Deuda.
- Id de tool incorrecto cuelga el subagent (Known Issue): exige disciplina de tabla exacta.
- Cambio de comportamiento de `init` (MCP en `init`) puede tocar expectativas previas de tests.

## Non-goals

- Sin Rules, sin Workflows, sin MCP global ni de otros hosts, sin `engram`/azure en `init`.
- Sin mapeo tier→model; `commandExecutionPolicy` sólo con su default documentado (`sandbox`), sin derivarlo
  de `permission`; sin tocar `doctor`.
- Sin dependencias nuevas (`node:*`), sin cambios a tiers/modelos globales ni a la estructura de `aspec/`.
- Sin borrado ni migración destructiva de layouts previos.

## Nota sobre el contexto de origen

Contexto de la delegación sin Work Item (Azure DevOps deshabilitado). Evidencia de Antigravity provista por
la delegación (docs oficiales); confirmada contra `src/cli/index.js`, `agents/*.md`, `commands/*.md`,
`skills/*/SKILL.md` y `test/cli.test.js`. Seed existente `docs/technical-discovery/units/cli-install.md`
(previo); no se regenera.
