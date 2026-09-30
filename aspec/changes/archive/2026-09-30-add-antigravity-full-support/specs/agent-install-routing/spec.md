# Spec delta: add-antigravity-full-support — agent-install-routing

## MODIFIED Requirements

### Requirement: Cobertura de soporte por host y exclusión de assets no verificados

El CLI SHALL tratar un asset como soportado por un host sólo cuando el directorio y el formato del host
estén verificados. `antigravity` SHALL contar como host soportado también para `agents` y `commands`: sus
`agents` usan el frontmatter adaptado de `skill-frontmatter-adapters` y sus `commands` se materializan como
skills (ver `antigravity-support`). El CLI SHALL declarar no soportados los `agents` y `commands` de
`cursor` y `roo` y NO SHALL escribir esos assets para esos hosts, evitando materializar archivos que el host
no consumiría.

#### Scenario: `antigravity` materializa agents y commands

- **WHEN** se instala con `agent: antigravity`
- **THEN** el CLI escribe los `agents` en `.agents/agents/<n>.md`
- **AND** materializa los `commands` como skills en `.agents/skills`
- **AND** NO emite un aviso de asset no soportado para `agents` ni para `commands`

#### Scenario: No se escriben agents/commands de hosts sin convención verificada

- **WHEN** se instala con `agent: cursor` o `agent: roo`
- **THEN** el CLI NO SHALL crear archivos de agents ni de commands para ese host
- **AND** las skills del host sí se escriben en su directorio de skills

### Requirement: Aviso no bloqueante por asset no soportado

Cuando un asset es no soportado para el host resuelto (por ejemplo `agents` o `commands` de `cursor` o
`roo`), el CLI SHALL emitir a **stderr** una línea por asset omitido y NO SHALL abortar: el **exit code NO
SHALL cambiar**. El aviso NO SHALL registrarse en el manifiesto `.ancletorc` (consistente con
`installedPaths` = unión de destinos realmente escritos).

#### Scenario: Un asset `null` produce un aviso a stderr sin fallar

- **WHEN** se instala con `agent: cursor`, para quien `agents` no está soportado
- **THEN** el CLI imprime en stderr una línea con formato `skip agents: not supported by host 'cursor'`
- **AND** el comando completa con exit 0
- **AND** `installedPaths.agents` de `.ancletorc` no incluye ninguna ruta de agents para ese host

### Requirement: Configuración MCP específica de host fuera de alcance

El CLI NO SHALL generar ni transformar configuración MCP específica de host como parte del ruteo
multi-agente, con una **única excepción**: para `agent: antigravity` el CLI SHALL generar o mergear el MCP de
workspace `.agents/mcp_config.json` (ver `antigravity-support`). `.mcp.json` (Claude) y `.vscode/mcp.json`
(VS Code) SHALL quedar fuera de alcance. El CLI NO SHALL borrar ni pisar configuración MCP preexistente del
usuario.

#### Scenario: El ruteo no genera config MCP de host fuera de la excepción

- **WHEN** se instala con un host soportado distinto de `antigravity`
- **THEN** el CLI NO SHALL crear `.mcp.json` ni `.vscode/mcp.json`
- **AND** la configuración MCP preexistente del usuario se conserva

#### Scenario: `antigravity` sí obtiene su MCP de workspace

- **WHEN** se instala con `agent: antigravity`
- **THEN** el CLI crea o actualiza `.agents/mcp_config.json`
- **AND** el contenido preexistente de `mcpServers` no se pisa
