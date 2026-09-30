# Proposal: Soporte completo de Antigravity en `init` / `install --project`

## Problem

Cuando un usuario elige `antigravity` en `ancleto init` (o `ancleto install --project`), la instalación
queda **a medias**: el CLI sólo materializa `.agents/skills` y descarta `agents` y `commands` con un aviso
`skip agents: not supported by host 'antigravity'` / `skip commands: not supported by host 'antigravity'`.
Además no genera el MCP de workspace de Antigravity y `check`/tier quedan acoplados a `.opencode/*`
(falso "tier sin agentes locales"). El requisito del usuario es que, tras elegir Antigravity, el proyecto
quede **totalmente funcional y listo para usarse**, con todo configurado automáticamente en el `init`.

Estado confirmado contra el código (`src/cli/index.js`, tras el change archivado
`add-multi-agent-cli-support`):

- `AGENT_TARGETS` (`:742-763`) declara `antigravity: { skills: { dir: '.agents/skills' }, agents: null,
  commands: null }` → sólo skills; agents/commands `null` disparan `warnUnsupportedAsset` (`:806-808`).
- `adaptFrontmatter` (`:797-803`) sólo adapta agents para `AGENT_ADAPTER_HOSTS = { claude, vscode }`
  (`:794`); Antigravity no participa del pipeline.
- `mergeMcp` (`:697-730`) escribe **sólo** `opencode.json`/`opencode.jsonc` con el esquema
  `{ mcp: { <n>: { type:'local', enabled, command:[...] } } }`; `initProject` (`:1158-1242`) **no** llama a
  `mergeMcp` en absoluto.
- `registerProject` (`:154-174`), `projectStatus` (`:227-244`) y `checkTierOrphan` (`:1746-1761`) leen
  `.opencode/agents` y `.opencode/.ancleto-tier` fijos. Deuda conocida registrada en memoria
  (`host-agent-layout-coupling`): un proyecto no-opencode con `--tier` recibe un falso warning y figura
  como global.

## Evidencia verificada de Antigravity (insumo de la delegación — no se re-investiga)

| Aspecto | Evidencia |
|---|---|
| Raíz nativa | `.agents/` (workspace) |
| Skills | `.agents/skills/<n>/SKILL.md` (ya soportado) |
| Agents (subagents) | `.agents/agents/<n>.md` **o** `.agents/agents/<n>/agent.md` |
| Frontmatter de agent | `name` (req), `description` (req), `tools: string[]` (default **`[]`**), `mainAgent` (bool, def. true), `subagent` (bool, def. true), `model` (`inherit\|flash\|pro`), `commandExecutionPolicy` (`off\|auto\|eager\|sandbox`), `mcpServers`, `skills`/`plugins` |
| Tool ids **confirmados en frontmatter de subagents** (únicos emitibles) | `view_file`, `replace_file_content`, `grep_search`, `run_command`, `manage_task` |
| Tools **solo SDK** (`BuiltinTools`, Python SDK) — NO frontmatter | `list_directory`, `search_directory`, `find_file`, `create_file`, `edit_file`, `ask_question`, `start_subagent`, `generate_image`, `search_web`, `read_url_content`, `finish` |
| Tools **no encontrados en docs** (solo comunidad) | `call_mcp_tool`, `write_to_file`, `multi_replace_file_content`, `list_dir`, `send_message` |
| Tools de **delegación** (lado padre/runtime; NO van en `tools` del subagente) | `invoke_subagent` (lo invoca el **padre**; la invocación la habilita **`subagent: true`**), `start_subagent`, `define_subagent` |
| **Regla de decisión** | Si un id no está confirmado en la tabla de frontmatter de subagents, **NO se emite — exista o no en el SDK**. Sólo (A) es emitible; (B)/(C)/(D) se omiten con aviso |
| Tools de ancleto **sin id en frontmatter** | `write`, `glob`, `task`, `webfetch`, `websearch` → se **omiten con aviso** hasta confirmar el listado oficial completo (deuda). `edit` → `replace_file_content` (frontmatter), **no** `edit_file` (SDK) |
| MCP | el **mecanismo** de MCP no se configura por `tools`: se expresa por el campo `mcpServers` (agent-level) y/o `.agents/mcp_config.json` de workspace. Toda clave de MCP declarada **dentro** del mapa `tools` (`mcpServers`, `mcp_*`, `call_mcp_tool`) **no** es un id verificado → **omitir con aviso** (no en silencio). `call_mcp_tool` queda **prohibido** (no lo emite el adaptador) |
| ⚠️ Known issue | Un tool name inexistente **cuelga el subagent** → el mapeo debe usar sólo ids con evidencia oficial |
| Commands | Antigravity no tiene dir de commands de proyecto; su equivalente son *Workflows* (`/workflow-name`), **deprecados a favor de Agent Skills** (migración nov‑2026) |
| MCP (workspace) | `.agents/mcp_config.json` = `{ "mcpServers": { "<n>": { "command": "...", "args": [...], "env": {...} } } }` |
| Rules | `.agents/rules/` (md) — fuera del modelo de assets de ancleto |

## Proposed change

Un change con tres recortes coherentes, reutilizando el mecanismo existente (`AGENT_TARGETS`,
`installAgentAssets`, `adaptFrontmatter`) — no se reinventa el ruteo:

1. **`agent-install-routing` (MODIFIED)** — Antigravity deja de ser "agents/commands no soportados". Se
   actualiza la cobertura de soporte, el ejemplo del aviso no bloqueante (pasa a `cursor`/`roo`) y la
   exclusión de MCP de host, que ahora tiene una **excepción acotada a Antigravity**.
2. **`skill-frontmatter-adapters` (MODIFIED + ADDED)** — Antigravity entra al conjunto de hosts cuyo
   formato de agents difiere y se agrega el adaptador específico con **mapeo verificado** de `tools` a ids
   de Antigravity (política: nunca inventar un id).
3. **`antigravity-support` (ADDED, capability nueva)** — directorios de assets, materialización de
   `commands` como skills, MCP de workspace `.agents/mcp_config.json`, instalación completa desde `init`
   y desacople de `check`/tier del layout `.opencode/*`.

### Decisión que este change supersede (acotada)

El change archivado fijó **`cli.host-mcp-config-out-of-scope`**: el CLI nunca genera/transforma
configuración MCP de host (`mcp_config.json` incluido). Este change **supersede esa decisión sólo para
Antigravity**: el CLI sí genera/mergea `.agents/mcp_config.json` no destructivamente, porque sin el MCP de
memoria la instalación no queda "lista para usarse". Para el resto de los hosts la decisión sigue vigente
(`.mcp.json` de Claude y `.vscode/mcp.json` siguen OOS).

### Cambio de comportamiento declarado

`init` pasará a configurar el MCP del host igual que `install` (mismo dueño, sin rama especial por host).
Efecto observable: `init --agent opencode` ahora también configura `opencode.json`; `init --agent
antigravity` escribe `.agents/mcp_config.json`. Se agrega `--no-mcp` a `init` para conservar el escape.

## Scope

In scope:

- `src/cli/index.js`: destino de agents para Antigravity, adaptador de agents de Antigravity, materialización
  de `commands` como skills, MCP de workspace `.agents/mcp_config.json`, wiring de `init`, y desacople
  host-aware de `registerProject` / `projectStatus` / `checkTierOrphan` / `check`.
- Delta specs: `specs/agent-install-routing/`, `specs/skill-frontmatter-adapters/`,
  `specs/antigravity-support/`.
- Actualización de los tests que hoy afirman que Antigravity no instala agents/commands (`test/cli.test.js`
  5.2) y nuevos tests por recorte.
- `README.md`: documentar el soporte completo de Antigravity y el archivo MCP de workspace.

Out of scope (no-goals explícitos):

- **Antigravity Rules** (`.agents/rules/`): fuera del modelo de assets de ancleto.
- **Workflows** (`.agent/workflows/`): deprecados; no se generan.
- **MCP de host para el resto de los hosts**: `.mcp.json` (Claude) y `.vscode/mcp.json` (VS Code) siguen OOS.
- **MCP global de Antigravity** (`~/.gemini/config/mcp_config.json`): sólo workspace.
- **`--global`**: sigue siendo configuración de opencode.
- **`engram`/`azure-devops` en `init`**: las banderas `--with-engram` y el MCP de Azure siguen siendo
  instalación vía `install`; no se agregan a `init`.
- **Tier → `flash`/`pro`**: no se inventa una equivalencia; ver Open Questions.
- **`commandExecutionPolicy`**: no se deriva de `permission` en este change.
- **`doctor`**: sigue validando `opencode.json`; su actualización queda como backlog.
- **Compatibilidad con versiones previas de Antigravity**: no se declara; se implementa contra la evidencia
  vigente.

## Risks

- **Tool id incorrecto cuelga el subagent** (known issue de Antigravity). Mitigación: sólo se emiten ids
  **confirmados en el frontmatter de subagents** (`view_file`, `replace_file_content`, `grep_search`,
  `run_command`, `manage_task`) y política de **omitir antes que inventar**. `grep` queda resuelto a
  `grep_search`; `search_directory` pertenece al SDK de Python (columna solo-SDK), no al frontmatter (OQ1
  cerrada).
- **Capacidades omitidas (deuda)**: `write`, `glob`, `task`, `webfetch` y `websearch` no tienen id en el
  frontmatter y se **omiten con aviso** hasta confirmar el listado oficial completo de tool ids. Los agents de
  Antigravity no tendrán esas capacidades mientras persista la deuda; tampoco se emiten ids de las columnas
  solo-SDK, comunidad ni delegación (`invoke_subagent`/`start_subagent`/`define_subagent` no son tools de
  subagente).
- **Conflación de MCP**: el adaptador **no** debe inferir "usa MCP" desde claves desconocidas del mapa `tools`
  ni emitir `call_mcp_tool` (prohibido). El mecanismo de MCP se resuelve por `mcpServers`/config de workspace;
  las claves de MCP declaradas dentro de `tools` se **omiten con aviso** (nunca en silencio).
- **`skill` no es una tool de Antigravity**: los agents que hoy declaran `skill: true` (orchestrator,
  spec-writer, technical-seed-writer) no pierden la capacidad: `skill` se traduce al campo `skills: [...]` del
  frontmatter (o se omite) y Antigravity surfacea las skills automáticamente al inicio de sesión (OQ2 cerrada).
- **Directorio compartido `.agents/skills`**: los command-skills conviven con el catálogo de skills. Si
  `check` no se vuelve host-aware, reportaría huérfanos falsos. Mitigación: `check` deriva el conjunto
  esperado del host, no de `ROOT/<cat>` aislado.
- **Cambio de comportamiento de `init`** (MCP ahora en `init`): puede afectar tests/expectativas previas de
  `init`. Mitigación: `--no-mcp`; tests explícitos del nuevo comportamiento.
- **`mainAgent`/`subagent`**: la semántica exacta de los dos booleanos no está finamente documentada.
  Mitigación: mapeo determinista desde `mode` y open question.

## Open Questions and Assumptions

Assumptions:

- Los tool ids y el esquema de `mcp_config.json` provistos en la delegación reflejan la documentación
  oficial vigente de Antigravity.
- `.agents/skills` es la raíz de skills de workspace y es leído por Antigravity.
- Los command-skills son ejecutables por Antigravity igual que cualquier skill (invocación `/`).

Open questions (estado tras verificación contra docs oficiales de Antigravity):

1. **Cerrada (OQ1)**: `grep` se mapea a `grep_search` (frontmatter de subagents). `search_directory` no
   aplica (pertenece al SDK de Python, no al frontmatter).
2. **Cerrada (OQ2)**: `skill` no es una tool; se traduce al campo `skills: [...]` del frontmatter cuando el
   agent declara skills conocidas; si no, se omite. Antigravity surfacea skills automáticamente.
3. **Decidida (OQ3, deuda)**: tier → `flash`/`pro` no se mapea; `model: inherit` fijo.
4. **Decidida (OQ4, deuda)**: `mainAgent: true` y `subagent: true` por defecto (cuando no hay `mode`); no se
   inventa una derivación más fina.
5. **Decidida (OQ5, deuda)**: `commandExecutionPolicy` con default documentado `sandbox`; no derivado de
   `permission`.
6. **Abierta (OQ6, deuda)**: el listado oficial completo de tool ids del frontmatter de subagents no está
   verificado. Hasta confirmarlo, `write`/`glob`/`task`/`webfetch`/`websearch` se omiten con aviso (regla
   dura: nunca emitir un id no confirmado en el frontmatter, exista o no en el SDK).

## Nota sobre el contexto de origen

Contexto de la delegación **sin Work Item** (Azure DevOps deshabilitado). La evidencia de Antigravity
proviene de la delegación (documentación oficial verificada); los paths citados (`src/cli/index.js`,
`agents/*.md`, `commands/*.md`, `skills/*/SKILL.md`, `test/cli.test.js`) se confirmaron contra el código
real. Seed técnico existente: `docs/technical-discovery/units/cli-install.md` (previo a esta
investigación); no se regenera.
