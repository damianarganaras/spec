# Spec delta: mcp-host-write-routing — antigravity-support

## MODIFIED Requirements

### Requirement: Configuración MCP de workspace de `antigravity`

El CLI SHALL generar o mergear `.agents/mcp_config.json` en el proyecto con el MCP de memoria de ancleto (`ancleto-memory`, stdio) y los MCP configurados, usando el esquema de Antigravity (`{ "mcpServers": { "<n>": { "command": "...", "args": [...], "env": {...} } } }`). El merge SHALL ser **no destructivo**: SHALL preservar los `mcpServers` y demás claves preexistentes y NO SHALL pisar un servidor homónimo. Si el archivo existe y no es JSON parseable, el CLI SHALL avisar y NO SHALL sobrescribirlo en `install`/`init`.

El destino `.agents/mcp_config.json` SHALL resolverse desde el descriptor único de destino MCP por host. `import <bundle>` e `import --repair` con host activo `antigravity` SHALL escribir o reparar ese mismo destino y NO SHALL crear ni escribir `.opencode/opencode.json`. En `import`/`import --repair`, un `.agents/mcp_config.json` no parseable SHALL avisarse nombrando el archivo y SHALL sobrescribirse con la configuración nueva, sin abortar. El comportamiento de `install`/`init` sobre un archivo inválido NO SHALL cambiar.

#### Scenario: Se crea el MCP de workspace con el servidor de memoria

- **WHEN** se instala con `agent: antigravity` y el MCP habilitado
- **THEN** `.agents/mcp_config.json` existe con `mcpServers.ancleto-memory.command` y sus `args`
- **AND** el esquema usa `command`/`args`/`env` (sin `type`/`enabled` de opencode)

#### Scenario: Un `mcpServers` preexistente no se pisa

- **WHEN** existe `.agents/mcp_config.json` con un servidor `propio` y se instala con `agent: antigravity`
- **THEN** el servidor `propio` permanece intacto
- **AND** el CLI agrega sólo los servidores faltantes

#### Scenario: `import` rutea al MCP de workspace

- **WHEN** se ejecuta `import <bundle>` o `import --repair` con host activo `antigravity`
- **THEN** el CLI escribe o repara `.agents/mcp_config.json`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: `import --repair` es idempotente

- **WHEN** se ejecuta dos veces `import --repair` con host activo `antigravity` sobre el mismo estado
- **THEN** `.agents/mcp_config.json` conserva el mismo conjunto de servidores
- **AND** NO SHALL crearse `.opencode/opencode.json`

#### Scenario: Un archivo inválido en import se avisa y se reemplaza

- **WHEN** existe `.agents/mcp_config.json` con contenido que no parsea como JSON y se ejecuta `import --repair` con host activo `antigravity`
- **THEN** el CLI emite un aviso que nombra el archivo
- **AND** lo sobrescribe con la configuración MCP nueva
- **AND** el comando no aborta
