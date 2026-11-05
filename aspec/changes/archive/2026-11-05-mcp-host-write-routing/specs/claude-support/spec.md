# Spec delta: mcp-host-write-routing — claude-support

## MODIFIED Requirements

### Requirement: MCP de host fuera de alcance para `claude`

El CLI NO SHALL generar ni transformar configuración MCP específica de host al instalar, inicializar, actualizar o importar para `claude`. En particular, el CLI NO SHALL crear `.mcp.json`, NO SHALL convertirlo desde otro esquema, NO SHALL crear `.opencode/opencode.json` como fallback y NO SHALL borrar ni pisar un `.mcp.json` preexistente del usuario.

`claude` SHALL resolverse como un host sin destino MCP en el descriptor único. Cuando el MCP esté habilitado, el CLI SHALL emitir como máximo un aviso no bloqueante que nombre `claude`; NO SHALL abortar y NO SHALL cambiar el exit code.

Una corrida con host activo `claude` NO SHALL borrar ni reescribir un `.opencode` preexistente de una instalación previa de `opencode`. Ese archivo sólo SHALL validarse por `check` si `opencode` figura en la unión de hosts instalados.

#### Scenario: No se crea `.mcp.json` ni `.opencode/opencode.json`

- **WHEN** se ejecuta `install --project --agent claude` o `init --agent claude` con el MCP habilitado
- **THEN** el CLI NO SHALL crear `.mcp.json`
- **AND** NO SHALL crear ni escribir `.opencode/opencode.json` por ese motivo
- **AND** emite como máximo un aviso no bloqueante que nombra `claude`
- **AND** el comando completa con exit 0

#### Scenario: `.mcp.json` preexistente se conserva

- **WHEN** existe un `.mcp.json` del usuario y se instala con `agent: claude`
- **THEN** el contenido preexistente de `.mcp.json` NO SHALL modificarse

#### Scenario: Un proyecto mixto conserva el `.opencode` previo

- **WHEN** un proyecto tiene `.opencode/opencode.json` de una instalación previa de `opencode` y se ejecuta una corrida con host activo `claude`
- **THEN** el archivo `.opencode/opencode.json` existente NO SHALL borrarse ni reescribirse
- **AND** `check` SHALL seguir validándolo porque `opencode` figura en la unión de hosts instalados

#### Scenario: `import --repair` con `claude` no crea `.opencode/opencode.json` y es idempotente

- **WHEN** se ejecuta `import --repair` con host activo `claude`
- **THEN** el CLI NO SHALL crear `.opencode/opencode.json`
- **AND** emite como máximo un aviso no bloqueante que nombra `claude`
- **AND** ejecutar el mismo `import --repair` dos veces NO SHALL cambiar el resultado
