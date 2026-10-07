# Spec delta: add-commandcode-support — agent-install-routing

> Delta sobre `aspec/specs/agent-install-routing/spec.md`.
> Sólo se especifican los requirements modificados por este change.

## MODIFIED Requirements

### Requirement: Destino nativo por host con directorio y formato por asset

El CLI SHALL derivar el destino de instalación de cada asset (`skills`, `agents`, `commands`) de un
modelo único por host que declare, para cada asset, su directorio y su convención de nombre. El CLI
SHALL escribir cada asset en el directorio que la documentación del host declara como propio, con la
convención de nombre de ese host. El CLI NO SHALL escribir `agents` ni `commands` de un host en el
directorio base de otro host.

#### Scenario: `opencode` conserva las rutas y el formato actuales

- **WHEN** se ejecuta `ancleto init` o `ancleto install --project` con el agente `opencode`
- **THEN** los assets se escriben en `.opencode/agents`, `.opencode/commands` y `.opencode/skills`
- **AND** agents y commands usan la convención `<n>.md`
- **AND** las rutas coinciden con las de las versiones anteriores (sin regresión)

#### Scenario: VS Code usa su directorio y su convención de nombre

- **WHEN** se instala con `agent: vscode`
- **THEN** las skills se escriben en `.github/skills`
- **AND** los agents se escriben como `.github/agents/<n>.agent.md` con su frontmatter **adaptado** al
  formato del host (sin claves específicas de opencode; ver `skill-frontmatter-adapters`)
- **AND** los commands se escriben como `.github/prompts/<n>.prompt.md`

#### Scenario: Antigravity usa su directorio de skills de workspace

- **WHEN** se instala con `agent: antigravity`
- **THEN** las skills se escriben en `.agents/skills`
- **AND** no se escribe ninguna skill en `.antigravity/skills`

#### Scenario: Cursor usa su directorio de skills

- **WHEN** se instala con `agent: cursor`
- **THEN** las skills se escriben en `.cursor/skills`
- **AND** no se escribe ninguna skill de cursor en otro directorio base

#### Scenario: Roo usa `.roo/skills` (evidencia 3rd-party)

- **WHEN** se instala con `agent: roo`
- **THEN** las skills se escriben en `.roo/skills`
- **AND** el CLI declara esa ruta con evidencia de fuente 3rd-party (no documentación oficial del host)

#### Scenario: Command Code usa su directorio nativo por asset

- **WHEN** se instala con `agent: commandcode`
- **THEN** las skills se escriben en `.commandcode/skills`
- **AND** los agents se escriben como `.commandcode/agents/<n>.md` con su frontmatter adaptado al
  formato del host (ver `skill-frontmatter-adapters`)
- **AND** los commands se escriben como `.commandcode/commands/<n>.md`
- **AND** no se escribe ningún asset de `commandcode` en el directorio base de otro host

### Requirement: Configuración MCP específica de host fuera de alcance

El CLI NO SHALL generar ni transformar configuración MCP específica de host como parte del ruteo
multi-agente, con **dos excepciones**: para `agent: antigravity` el CLI SHALL generar o mergear el MCP
de workspace `.agents/mcp_config.json` (ver `antigravity-support`), y para `agent: commandcode` el CLI
SHALL generar o mergear el MCP de proyecto `.mcp.json` (ver `commandcode-support`). `.vscode/mcp.json`
(VS Code) SHALL quedar fuera de alcance. El CLI NO SHALL borrar ni pisar configuración MCP preexistente
del usuario.

#### Scenario: El ruteo no genera config MCP de host fuera de las excepciones

- **WHEN** se instala con un host soportado distinto de `antigravity` y `commandcode`
- **THEN** el CLI NO SHALL crear `.mcp.json`, `.agents/mcp_config.json` ni `.vscode/mcp.json`
- **AND** la configuración MCP preexistente del usuario se conserva

#### Scenario: `antigravity` sí obtiene su MCP de workspace

- **WHEN** se instala con `agent: antigravity`
- **THEN** el CLI crea o actualiza `.agents/mcp_config.json`
- **AND** el contenido preexistente de `mcpServers` no se pisa

#### Scenario: `commandcode` sí obtiene su MCP de proyecto

- **WHEN** se instala con `agent: commandcode` y `--project`
- **THEN** el CLI crea o actualiza `.mcp.json`
- **AND** el contenido preexistente de `mcpServers` no se pisa
