# Spec delta: add-commandcode-support — skill-frontmatter-adapters

> Delta sobre `aspec/specs/skill-frontmatter-adapters/spec.md`.
> Sólo se especifican los requirements modificados y agregados por este change.

## MODIFIED Requirements

### Requirement: Adaptador de frontmatter de agents para hosts cuyo formato difiere

El frontmatter de los agents de opencode NO SHALL copiarse verbatim a un host cuyo formato de agents difiera
del origen. Al instalar agents para `agent: claude`, `agent: vscode`, `agent: antigravity` o
`agent: commandcode`, el transformador SHALL aplicar la adaptación documentada de ese host. Para `claude` y
`vscode` SHALL eliminar las claves específicas de opencode (`mode`, `color`, `temperature`, `permission`) y
SHALL aplicar la política de campos sin equivalencia a `model` y `tools`. Para `antigravity` SHALL aplicar la
adaptación específica definida en el requirement "Adaptación de frontmatter de agents para `antigravity`".
Para `commandcode` SHALL aplicar la adaptación específica definida en el requirement "Adaptación de
frontmatter de agents para `commandcode`". El campo `description` SHALL preservarse en todos los casos. Para
el resto de los hosts y tipos de asset sin adaptación documentada, la instalación SHALL ser identity.

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

#### Scenario: Los agents de Command Code pasan por su adaptación documentada

- **WHEN** se instala con `agent: commandcode` un agent cuyo frontmatter declara `mode`, `color`,
  `temperature`, `permission`, `model` de `opencode-go` y `tools` en forma de mapa
- **THEN** el `.commandcode/agents/<n>.md` instalado NO SHALL contener `mode:`, `color:`,
  `temperature:`, `permission:` ni `model` de `opencode-go`
- **AND** `tools` sale como lista de ids de Command Code (o `"*"` si el origen no declara `tools`)
- **AND** el campo `description` se conserva

### Requirement: Host desconocido → passthrough con aviso

Cuando el `host` recibido por el adaptador no corresponda a ningún host conocido (opencode, claude,
vscode, antigravity, cursor, roo, copilot, commandcode), el adaptador SHALL retornar el contenido sin
cambios (passthrough) y SHALL emitir un aviso a stderr indicando que el agent es desconocido. El adaptador
NO SHALL abortar ni lanzar una excepción.

#### Scenario: Host desconocido no rompe la instalación

- **WHEN** se llama al adaptador con `host: 'unknown-host'`
- **THEN** el contenido retornado es byte-idéntico al de entrada
- **AND** el CLI emite a stderr: `unknown agent 'unknown-host', passthrough`
- **AND** el comando completa con exit 0

## ADDED Requirements

### Requirement: Adaptación de frontmatter de agents para `commandcode`

Al instalar agents para `agent: commandcode`, el transformador SHALL producir un frontmatter con la
convención de Command Code: `name` (requerido por el host, derivado del nombre del archivo del agent),
`description` (preservado) y `tools` (lista de ids de Command Code o el comodín `"*"`). Las claves
`mode`, `color`, `temperature` y `permission` SHALL eliminarse. El campo `model` SHALL omitirse: Command
Code hereda el modelo de sesión y el transformador NO SHALL mapear un identificador `opencode-go/*` a un
alias de Command Code.

El mapeo de `tools` SHALL usar **sólo** ids verificados en la documentación de Command Code:
`read`→`read_file`, `write`→`write_file`, `edit`→`edit_file`, `bash`→`shell_command`, `grep`→`grep`,
`glob`→`glob`, `webfetch`→`web_fetch`, `websearch`→`web_search`, `todowrite`→`todo_write`. Sólo se
mapean claves con valor `true`. Las claves de memoria del framework (`searchMemory`, `recordRule`,
`recordDecision`) SHALL emitirse como tools MCP con la convención documentada
`mcp__ancleto-memory__<tool>`. Toda clave de `tools` sin id verificado (`skill`, `task`, `patch`,
`multiedit`, `todoread` u otra) SHALL omitirse con aviso a stderr de forma no bloqueante (exit code sin
cambios): nunca en silencio. Cuando el agent no declare `tools`, el transformador SHALL emitir
`tools: "*"` (preserva el default "todas" de opencode; el default de Command Code es "ninguna"). Cuando
`tools` esté presente sin ninguna clave `true`, SHALL emitir `tools: []`.

#### Scenario: `name` inyectado y `description` preservado

- **WHEN** se instala el agent `coder` para `agent: commandcode`
- **THEN** `.commandcode/agents/coder.md` contiene `name: coder`
- **AND** conserva el `description` de origen intacto

#### Scenario: `tools` en mapa se deriva a la lista de ids verificados

- **WHEN** se instala para `agent: commandcode` un agent con `tools: { read: true, write: true,
  edit: true, bash: true, grep: false }`
- **THEN** el frontmatter instalado contiene `tools: [read_file, write_file, edit_file, shell_command]`
- **AND** NO contiene el mapa de identificadores de opencode

#### Scenario: Una tool sin id verificado se omite con aviso

- **WHEN** se instala para `agent: commandcode` un agent con `tools: { read: true, skill: true }`
- **THEN** la lista instalada incluye `read_file` y NO incluye ningún id para `skill`
- **AND** el CLI emite a stderr un aviso que nombra la tool omitida
- **AND** el comando completa con exit 0

#### Scenario: `model` se omite y no arrastra el catálogo de opencode

- **WHEN** se instala para `agent: commandcode` un agent con `model: opencode-go/minimax-m3`
- **THEN** el frontmatter instalado NO SHALL contener ningún identificador de modelo de `opencode-go`
- **AND** el campo `model` se omite (el host hereda su default)

#### Scenario: `tools` ausente equivale a todas las tools

- **WHEN** se instala para `agent: commandcode` un agent cuyo frontmatter no declara `tools`
- **THEN** el frontmatter instalado contiene `tools: "*"`
