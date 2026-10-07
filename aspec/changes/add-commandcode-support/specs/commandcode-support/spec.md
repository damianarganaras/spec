# Spec delta: add-commandcode-support — commandcode-support

## ADDED Requirements

### Requirement: Alta y persistencia de `commandcode` como host soportado

El CLI SHALL aceptar `commandcode` como valor válido de `--agent` y en el wizard de selección de
host, sin abortar. Se persiste en `.ancletorc` (`agent`), se preserva en ejecuciones subsecuentes y
aparece en la ayuda y en los textos de selección. El valor por defecto del CLI NO SHALL cambiar
(`opencode`).

#### Scenario: `--agent commandcode` no aborta

- **WHEN** se ejecuta `ancleto init --agent commandcode` o `ancleto install --project --agent commandcode`
- **THEN** el comando completa con exit 0
- **AND** `.ancletorc.agent` es `commandcode`

#### Scenario: `commandcode` se preserva en ejecuciones subsecuentes

- **WHEN** existe `.ancletorc` con `agent: commandcode` y se ejecuta un `install`/`init` posterior sin `--agent`
- **THEN** el host resuelto sigue siendo `commandcode`

### Requirement: Directorios y manifiesto de `commandcode`

Para el host `commandcode`, el CLI SHALL instalar las skills en `.commandcode/skills/<n>/SKILL.md`,
los agents en `.commandcode/agents/<n>.md` y los commands en `.commandcode/commands/<n>.md`, y SHALL
registrar esas tres rutas en el manifiesto `.ancletorc`. El ruteo SHALL usar el mismo modelo de
destino por host que el resto de los hosts. El CLI NO SHALL escribir agents ni commands de
`commandcode` en el directorio base de otro host.

#### Scenario: Assets de `commandcode` en sus rutas

- **WHEN** se instala con `agent: commandcode`
- **THEN** las skills quedan en `.commandcode/skills`
- **AND** los agents quedan en `.commandcode/agents`
- **AND** los commands quedan en `.commandcode/commands`

#### Scenario: Manifiesto de `commandcode` veraz

- **WHEN** se instala con `agent: commandcode`
- **THEN** `.ancletorc.installedPaths.skills` incluye `.commandcode/skills`
- **AND** `.ancletorc.installedPaths.agents` incluye `.commandcode/agents`
- **AND** `.ancletorc.installedPaths.commands` incluye `.commandcode/commands`
- **AND** `ancleto check` valida el layout sin reportar faltantes

### Requirement: Adaptación de frontmatter de agents para `commandcode`

El frontmatter de los agents de opencode NO SHALL copiarse verbatim a `.commandcode/agents`. El
adaptador SHALL producir un frontmatter con la convención de Command Code: `name` (inyectado desde
el nombre del archivo), `description` (preservado) y `tools` (lista de ids de Command Code o `"*"`).
Las claves específicas de opencode `mode`, `color`, `temperature` y `permission` SHALL eliminarse.
El campo `model` SHALL omitirse (el host hereda el modelo de sesión cuando no se declara): el
adaptador NO SHALL mapear un identificador `opencode-go/*` a un alias de Command Code.

#### Scenario: `name` inyectado y `description` preservado

- **WHEN** se instala el agent `coder` para `agent: commandcode`
- **THEN** `.commandcode/agents/coder.md` contiene `name: coder`
- **AND** conserva el `description` de origen intacto

#### Scenario: Claves de opencode no se copian

- **WHEN** se instala para `agent: commandcode` un agent cuyo frontmatter declara `mode`, `color`,
  `temperature` y `permission`
- **THEN** el `.md` instalado NO SHALL contener `mode:`, `color:`, `temperature:` ni `permission:`

#### Scenario: `model` se omite y no arrastra el catálogo de opencode

- **WHEN** se instala para `agent: commandcode` un agent con `model: opencode-go/minimax-m3`
- **THEN** el frontmatter instalado NO SHALL contener un identificador de modelo de `opencode-go`
- **AND** el campo `model` se omite (el host hereda su default)

### Requirement: Mapa verificado de tools de `commandcode` y política de omisión

Al instalar agents para `agent: commandcode`, el transformador SHALL traducir el mapa `tools` de
opencode a la lista de ids de Command Code usando **sólo** ids verificados en la documentación del
host: `read`→`read_file`, `write`→`write_file`, `edit`→`edit_file`, `bash`→`shell_command`,
`grep`→`grep`, `glob`→`glob`, `webfetch`→`web_fetch`, `websearch`→`web_search`,
`todowrite`→`todo_write`. Las claves de memoria propias del framework (`searchMemory`, `recordRule`,
`recordDecision`) SHALL emitirse como tools MCP con la convención documentada
`mcp__ancleto-memory__<tool>`. Sólo se mapean claves con valor `true`.

Cuando el mapa `tools` declare una clave sin id verificado (por ejemplo `skill`, `task`, `patch`,
`multiedit`, `todoread` o cualquier otra), el transformador NO SHALL emitir un id y SHALL avisar por
stderr de forma no bloqueante (exit code sin cambios): nunca en silencio. Cuando el agent declare
`tools` presente pero sin ninguna clave `true`, el transformador SHALL emitir `tools: []`.

#### Scenario: `tools` en mapa se deriva a la lista de ids verificados

- **WHEN** se instala para `agent: commandcode` el agent `coder` con `tools: { read: true, write: true,
  edit: true, bash: true }`
- **THEN** el frontmatter instalado contiene `tools: [read_file, write_file, edit_file, shell_command]`
- **AND** NO contiene el mapa de identificadores de opencode

#### Scenario: Las tools de memoria se emiten como tools MCP

- **WHEN** se instala para `agent: commandcode` el agent `memory-keeper` con `tools: { read: true,
  grep: true, searchMemory: true, recordRule: true, recordDecision: true }`
- **THEN** el `tools` instalado incluye `mcp__ancleto-memory__searchMemory`,
  `mcp__ancleto-memory__recordRule` y `mcp__ancleto-memory__recordDecision`

#### Scenario: Una clave sin id verificado se omite con aviso

- **WHEN** se instala para `agent: commandcode` el agent `orchestrator` con `tools: { read: true,
  skill: true }`
- **THEN** el `tools` instalado incluye `read_file` y NO incluye ningún id para `skill`
- **AND** el CLI emite a stderr un aviso por la tool omitida
- **AND** el comando completa con exit 0

#### Scenario: `tools` con sólo claves `false` produce lista vacía

- **WHEN** se instala para `agent: commandcode` un agent con `tools: { read: false, write: false }`
- **THEN** el frontmatter instalado contiene `tools: []`

### Requirement: `tools` ausente en el origen equivale a todas las tools

Cuando el agent de origen no declare el campo `tools`, el transformador SHALL emitir `tools: "*"`
porque el default de opencode es "todas las tools" y el default de Command Code es "ninguna": omitir
el campo cambiaría la semántica.

#### Scenario: Agent sin `tools` recibe el comodín

- **WHEN** se instala para `agent: commandcode` un agent cuyo frontmatter no declara `tools`
- **THEN** el frontmatter instalado contiene `tools: "*"`

### Requirement: MCP de proyecto de `commandcode`

Al instalar con `--project` para `agent: commandcode`, el CLI SHALL generar o mergear el MCP de
proyecto en `.mcp.json` con esquema `{ "mcpServers": { "<name>": { "transport": "stdio", "command":
"...", "args": [...], "env": {...} } } }`. El merge SHALL ser no destructivo: NO SHALL pisar un
servidor homónimo ni las claves top-level preexistentes del usuario, y un `.mcp.json` inválido SHALL
avisarse sin sobrescribirse. Sin `--project` (instalación global) el CLI NO SHALL escribir
`.mcp.json` (es project scope en Command Code).

#### Scenario: `install --project --agent commandcode` configura el MCP de memoria

- **WHEN** se ejecuta `ancleto install --project --agent commandcode`
- **THEN** `.mcp.json` contiene `mcpServers.ancleto-memory` con `transport: stdio` y un `command` válido
- **AND** el comando completa con exit 0

#### Scenario: Merge no destructivo

- **WHEN** existe un `.mcp.json` con un servidor homónimo o claves top-level propias
- **THEN** el contenido preexistente NO SHALL modificarse
- **AND** sólo se agregan los servidores ausentes

#### Scenario: `.mcp.json` inválido no se sobrescribe

- **WHEN** existe un `.mcp.json` que no es JSON válido
- **THEN** el CLI emite un aviso y NO SHALL sobrescribir el archivo

### Requirement: Nota de modelo de `commandcode`

El CLI SHALL anexar al agent `orchestrator` instalado para `commandcode` una nota que indique que los
tiers de ancleto no reescriben modelos en este host (el `model` se hereda de la sesión) y que el
modelo se elige con `/model`. La nota NO SHALL aplicarse a otros agents ni a otros hosts.

#### Scenario: El orchestrator de `commandcode` lleva la nota

- **WHEN** se instala con `agent: commandcode`
- **THEN** `.commandcode/agents/orchestrator.md` incluye la nota de modelo de Command Code
- **AND** los demás agents no la incluyen

### Requirement: Commands verbatim y limitación documentada

Los `commands/cleto-*.md` SHALL copiarse a `.commandcode/commands/<n>.md` sin reescribir su body
(igual criterio que el resto de los hosts). El body invoca "the Skill tool", que no es el mecanismo
de invocación de skills de Command Code (`/skill:<name>`): esta diferencia SHALL quedar registrada
como limitación conocida y NO SHALL resolverse con una transformación especulativa.

#### Scenario: Los commands se copian sin transformar el body

- **WHEN** se instala con `agent: commandcode`
- **THEN** existe `.commandcode/commands/cleto-propose.md`
- **AND** su body es idéntico al de `commands/cleto-propose.md` de origen
