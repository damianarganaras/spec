# Spec delta: add-antigravity-full-support — skill-frontmatter-adapters

## MODIFIED Requirements

### Requirement: Adaptador de frontmatter de agents para hosts cuyo formato difiere

El frontmatter de los agents de opencode NO SHALL copiarse verbatim a un host cuyo formato de agents difiera
del origen. Al instalar agents para `agent: claude`, `agent: vscode` o `agent: antigravity`, el transformador
SHALL aplicar la adaptación documentada de ese host. Para `claude` y `vscode` SHALL eliminar las claves
específicas de opencode (`mode`, `color`, `temperature`, `permission`) y SHALL aplicar la política de campos
sin equivalencia a `model` y `tools`. Para `antigravity` SHALL aplicar la adaptación específica definida en
el requirement "Adaptación de frontmatter de agents para `antigravity`". El campo `description` SHALL
preservarse en todos los casos. Para el resto de los hosts y tipos de asset sin adaptación documentada, la
instalación SHALL ser identity.

#### Scenario: Claves de opencode no se copian a Claude

- **WHEN** se instala un agent cuyo frontmatter declara `mode`, `color`, `temperature` y `permission`,
  con `agent: claude`
- **THEN** el `.md` instalado en `.claude/agents` NO SHALL contener `mode:`, `color:`, `temperature:` ni
  `permission:`
- **AND** el campo `description` se conserva

#### Scenario: Los agents de VS Code salen adaptados, no verbatim

- **WHEN** se instala con `agent: vscode` un agent cuyo frontmatter declara `mode`, `color`,
  `temperature`, `permission`, `model` de `opencode-go` y `tools` en forma de mapa
- **THEN** el `.github/agents/<n>.agent.md` instalado NO SHALL contener `mode:`, `color:`,
  `temperature:`, `permission:` ni `model` de `opencode-go`
- **AND** NO SHALL contener `tools` con el mapa de identificadores de opencode
- **AND** el campo `description` se conserva

#### Scenario: Los agents de Antigravity pasan por su adaptación documentada

- **WHEN** se instala con `agent: antigravity` un agent cuyo frontmatter declara `mode`, `color`,
  `temperature`, `permission`, `model` de `opencode-go` y `tools` en forma de mapa
- **THEN** el `.agents/agents/<n>.md` instalado NO SHALL contener `mode:`, `color:`, `temperature:` ni
  `permission:`
- **AND** NO SHALL contener `model` de `opencode-go`
- **AND** el campo `description` se conserva

## ADDED Requirements

### Requirement: Adaptación de frontmatter de agents para `antigravity`

Al instalar agents para `agent: antigravity`, el transformador SHALL producir un frontmatter con la convención
de Antigravity: `name` (requerido por el host, derivado del nombre del archivo del agent), `description`
(preservado), `tools` como **lista** de ids de Antigravity, y `model` fijo. `mode` SHALL traducirse a
`mainAgent`/`subagent`; cuando el agent no declare `mode`, el transformador SHALL emitir `mainAgent: true` y
`subagent: true` (default del host). Las claves `color`, `temperature`, `permission` y `tools` en forma de
mapa SHALL eliminarse. El transformador SHALL emitir `tools` siempre, incluso vacío, porque el default del
host es la lista vacía (no "todas las tools").

El mapeo de `tools` SHALL usar **sólo** ids **confirmados en la tabla de frontmatter de subagents** de
Antigravity: `read`→`view_file`, `edit`→`replace_file_content`, `grep`→`grep_search`, `bash`→`run_command`,
`todowrite`→`manage_task`. Sólo se mapean claves con valor `true`. `edit` SHALL resolverse a
`replace_file_content` (frontmatter), NO a `edit_file` (SDK). Un id que exista **sólo** en el SDK de Python
(`find_file`, `search_web`, `read_url_content`, `edit_file`, `list_directory`, `search_directory`,
`create_file`, `ask_question`, `finish`, `generate_image`) NO SHALL emitirse: el SDK no prueba soporte del
frontmatter. Los ids de **delegación** (`invoke_subagent`, `start_subagent`, `define_subagent`) NO SHALL
emitirse: NO son tools de subagente (el padre los invoca; la invocación de un subagente se habilita con
`subagent: true`, no con un id de `tools`). Las claves `write`, `glob`, `task`, `webfetch` y `websearch` NO
SHALL emitirse como id (no tienen id confirmado en el frontmatter; ver el requirement de política). La clave
`skill` NO SHALL emitirse como tool: SHALL resolverse por el campo `skills: [...]` del frontmatter
cuando el agent declare skills conocidas y, si no, se omite. El **mecanismo** de MCP NO SHALL resolverse por `tools`:
SHALL resolverse por el campo `mcpServers` (agent-level) y/o `.agents/mcp_config.json` de workspace. Toda clave de
`tools` que **no** esté en el conjunto confirmado —incluidas las claves de MCP (`mcpServers`, `mcp_*`,
`call_mcp_tool`)— cae en la política de **omisión con aviso**: NO SHALL emitirse como id y SHALL avisarse por
stderr (nunca en silencio). El id `call_mcp_tool` queda **prohibido** (no lo emite el adaptador).

#### Scenario: `name` inyectado y `description` preservado

- **WHEN** se instala el agent `coder` para `agent: antigravity`
- **THEN** `.agents/agents/coder.md` contiene `name: coder`
- **AND** conserva el `description` de origen intacto

#### Scenario: `tools` en mapa se deriva a la lista de ids verificados

- **WHEN** se instala para `agent: antigravity` un agent con `tools: { read: true, edit: true, bash: true,
  todowrite: true, grep: false }`
- **THEN** el frontmatter instalado contiene `tools: [view_file, replace_file_content, run_command,
  manage_task]`
- **AND** NO contiene el mapa de identificadores de opencode

#### Scenario: Un id solo-SDK no se emite

- **WHEN** se instala para `agent: antigravity` un agent con `tools: { glob: true, webfetch: true }`
- **THEN** el `tools` instalado NO SHALL contener `find_file` ni `read_url_content` (ids solo-SDK)
- **AND** el CLI emite a stderr un aviso por cada tool omitida

#### Scenario: Las tools de delegación no son tools de subagente

- **WHEN** se instala para `agent: antigravity` un agent con `tools: { task: true }`
- **THEN** el `tools` instalado NO SHALL contener `invoke_subagent`, `start_subagent` ni `define_subagent`
- **AND** la capacidad de invocar subagentes queda sujeta al campo `subagent` del frontmatter, no a un id de `tools`

#### Scenario: El uso de MCP no se emite como tool id

- **WHEN** se instala el agent `memory-keeper` para `agent: antigravity`, cuyo mapa `tools` declara `searchMemory`,
  `recordRule` y `recordDecision`
- **THEN** su `tools` instalado NO incluye `call_mcp_tool` ni ningún id de MCP
- **AND** el CLI emite a stderr un aviso por cada una de esas claves de MCP omitidas (no en silencio)
- **AND** el mecanismo de MCP se resuelve por `mcpServers` (agent-level) y/o `.agents/mcp_config.json` de workspace

#### Scenario: `model` es `inherit` y no arrastra el catálogo de opencode

- **WHEN** se instala para `agent: antigravity` un agent con `model: opencode-go/qwen3.7-plus`
- **THEN** el frontmatter instalado contiene `model: inherit`
- **AND** NO contiene ningún identificador de modelo de `opencode-go`

#### Scenario: `mode` se traduce a `mainAgent`/`subagent`

- **WHEN** se instala para `agent: antigravity` un agent con `mode: primary`
- **THEN** el frontmatter instalado declara `mainAgent: true` y `subagent: false`
- **AND** un agent con `mode: subagent` declara `mainAgent: false` y `subagent: true`
- **AND** un agent sin `mode` declara `mainAgent: true` y `subagent: true` (default del host)

#### Scenario: `skill` se resuelve por el campo `skills`, no por `tools`

- **WHEN** se instala para `agent: antigravity` un agent cuyo mapa declara `skill: true`
- **THEN** el `tools` instalado NO contiene ningún id correspondiente a `skill`
- **AND** la capacidad de skills queda cubierta por el campo `skills` del frontmatter o por el surfaceo
  automático de Antigravity

### Requirement: Política ante tools de Antigravity sin id verificado

Cuando el mapa `tools` de un agent declare una clave que no tenga un id **confirmado en el frontmatter de
subagents** de Antigravity, el transformador NO SHALL emitir un id (un tool name inexistente cuelga el
subagent). La regla es dura: si el id no está confirmado en el frontmatter, NO se emite **exista o no en el
SDK**. SHALL omitir esa tool de la lista derivada y SHALL avisar por stderr de forma no bloqueante (exit code
sin cambios). Quedan bajo esta política, entre otras: las claves `write`, `glob`, `task`, `webfetch` y
`websearch`; los ids **solo-SDK** (`find_file`, `search_web`, `read_url_content`, `edit_file`,
`list_directory`, `search_directory`, `create_file`, `ask_question`, `finish`, `generate_image`); los ids de
**comunidad** (`write_to_file`, `multi_replace_file_content`, `list_dir`, `send_message`); y los de
**delegación** (`invoke_subagent`, `start_subagent`, `define_subagent`), que no son tools de subagente. La
clave `skill` NO cae en esta política: se resuelve por el campo `skills` del frontmatter (ver el requirement
anterior). El **mecanismo** de MCP (`mcpServers` agent-level y/o `.agents/mcp_config.json` de workspace) queda
fuera de esta política porque no se configura por `tools`; en cambio, toda clave de MCP declarada **dentro** del
mapa `tools` (`mcpServers`, `mcp_*`, `call_mcp_tool` o cualquier otra) **sí** cae en la política de **omisión con
aviso**: NO SHALL emitirse como id y SHALL avisarse por stderr (nunca en silencio). `call_mcp_tool` NO SHALL
emitirse (queda prohibido).

#### Scenario: Una tool sin id verificado se omite con aviso

- **WHEN** se instala para `agent: antigravity` un agent con `tools: { read: true, write: true }`
- **THEN** la lista instalada incluye `view_file` y NO incluye ningún id para `write`
- **AND** el CLI emite a stderr un aviso que nombra la tool omitida
- **AND** el comando completa con exit 0
