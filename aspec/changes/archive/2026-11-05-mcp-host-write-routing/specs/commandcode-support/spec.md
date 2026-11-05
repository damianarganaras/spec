# Spec delta: mcp-host-write-routing — commandcode-support

## MODIFIED Requirements

### Requirement: MCP de proyecto de `commandcode`

Al instalar, inicializar o importar con alcance de proyecto para `agent: commandcode`, el CLI SHALL generar o mergear el MCP de proyecto en `.mcp.json` con esquema `{ "mcpServers": { "<name>": { "transport": "stdio", "command": "...", "args": [...], "env": {...} } } }`, resuelto desde el descriptor único de destino MCP por host. `init --agent commandcode`, `install --project --agent commandcode`, `import` e `import --repair` con host activo `commandcode` SHALL escribir ese archivo y NO SHALL crear ni escribir `.opencode/opencode.json`.

El merge SHALL ser no destructivo: NO SHALL pisar un servidor homónimo ni las claves top-level preexistentes del usuario. En `install`/`init`, un `.mcp.json` inválido SHALL avisarse sin sobrescribirse. En `import`/`import --repair`, un `.mcp.json` no parseable SHALL avisarse nombrando el archivo y SHALL sobrescribirse con la configuración nueva, sin abortar.

Sin `--project` (instalación global) el CLI NO SHALL escribir `.mcp.json`. Este requirement NO SHALL crear un escritor de `.mcp.json` para `claude`; el archivo pertenece a `commandcode` cuando ese host está activo o instalado.

#### Scenario: `install --project --agent commandcode` configura el MCP de memoria

- **WHEN** se ejecuta `ancleto install --project --agent commandcode`
- **THEN** `.mcp.json` contiene `mcpServers.ancleto-memory` con `transport: stdio` y un `command` válido
- **AND** NO SHALL crearse `.opencode/opencode.json`
- **AND** el comando completa con exit 0

#### Scenario: `init --agent commandcode` escribe el MCP de proyecto

- **WHEN** se ejecuta `ancleto init --agent commandcode` en un proyecto vacío
- **THEN** `.mcp.json` contiene los servidores MCP habilitados
- **AND** NO SHALL crearse `.opencode/opencode.json`
- **AND** el comando completa con exit 0

#### Scenario: `import --repair` apunta a `.mcp.json` y no a `.opencode/opencode.json`

- **WHEN** se ejecuta `import --repair` con host activo `commandcode`
- **THEN** el CLI repara `.mcp.json`
- **AND** NO SHALL crear `.opencode/opencode.json`
- **AND** ejecutar el mismo `import --repair` dos veces NO SHALL cambiar el resultado

#### Scenario: Merge no destructivo

- **WHEN** existe un `.mcp.json` con un servidor homónimo o claves top-level propias
- **THEN** el contenido preexistente NO SHALL modificarse
- **AND** sólo se agregan los servidores ausentes

#### Scenario: `.mcp.json` inválido en install no se sobrescribe

- **WHEN** existe un `.mcp.json` que no es JSON válido y se ejecuta `install --project --agent commandcode`
- **THEN** el CLI emite un aviso
- **AND** NO SHALL sobrescribir el archivo

#### Scenario: `.mcp.json` no parseable en import se avisa y se reemplaza

- **WHEN** existe un `.mcp.json` que no es JSON válido y se ejecuta `import --repair` con host activo `commandcode`
- **THEN** el CLI emite un aviso que nombra el archivo
- **AND** lo sobrescribe con la configuración MCP nueva
- **AND** el comando no aborta

#### Scenario: La instalación global no escribe `.mcp.json`

- **WHEN** se ejecuta `install` sin `--project` para `agent: commandcode`
- **THEN** el CLI NO SHALL escribir `.mcp.json`
- **AND** conserva el comportamiento previo de instalación global
