# Spec delta: mcp-host-write-routing — agent-install-routing

## MODIFIED Requirements

### Requirement: Configuración MCP específica de host fuera de alcance

El CLI SHALL escribir configuración MCP de proyecto sólo en el destino que declare el descriptor único de destino MCP por host, resuelto por el host activo de la corrida (`--agent` o `rc.agent`; `opencode` por defecto). El descriptor SHALL ser el dueño único del destino y del esquema de cada host. `init`, `install`/`update`, `import` e `import --repair` SHALL resolver el destino desde ese descriptor y NO SHALL usar literales de destino por comando. La configuración MCP de host deja de ser una excepción ad hoc: se limita a los destinos declarados y todo destino no declarado SHALL quedar fuera de alcance.

| host activo | destino de proyecto | esquema |
|---|---|---|
| `opencode` | `.opencode/opencode.json` (o el `.opencode/opencode.jsonc` existente) | `mcp` |
| `antigravity` | `.agents/mcp_config.json` | `mcpServers` |
| `commandcode` | `.mcp.json` | `mcpServers` |
| `copilot` | `copilot-mcp.json` | `mcp` |
| `claude`, `vscode`, `cursor`, `roo` | ninguno: no se escribe archivo MCP | — |

Para los hosts sin destino (`claude`, `vscode`, `cursor`, `roo`), el CLI NO SHALL escribir ningún archivo MCP, NO SHALL crear `.opencode/opencode.json` y, cuando el MCP esté habilitado, SHALL emitir como máximo un aviso no bloqueante que nombre el host. El aviso SHALL ir a stderr, NO SHALL abortar y NO SHALL cambiar el exit code.

Ningún host distinto de `opencode` SHALL usar `.opencode/opencode.json` como fallback en alcance de proyecto. Un `.opencode` preexistente de una instalación previa de `opencode` NO SHALL borrarse ni reescribirse por una corrida cuyo host activo sea distinto.

`import <bundle>` e `import --repair` SHALL escribir en el destino del host activo, no en un destino fijo de `opencode`. Cuando el host activo no tenga destino, `import` NO SHALL crear `.opencode/opencode.json` y SHALL aplicar el aviso único del párrafo anterior.

La garantía es de alcance de proyecto y de host activo: NO SHALL aplicarse a la instalación global sin proyecto, que conserva su comportamiento previo sólo-opencode, ni al MCP de intención de un bundle exportado, que conserva su lectura sólo-opencode. El CLI NO SHALL borrar archivos MCP preexistentes ni entradas existentes.

Los merges SHALL ser no destructivos e idempotentes: SHALL agregar sólo nombres ausentes, NO SHALL borrar entradas ni archivos existentes, y ejecutar dos veces `import`, dos veces `install` o `upgrade` después de `install` NO SHALL cambiar el conjunto de entradas MCP del host.

`.vscode/mcp.json`, `.roo/mcp.json` y un `.mcp.json` escrito para `claude` SHALL quedar fuera de alcance: el CLI NO SHALL crearlos.

#### Scenario: `opencode` escribe en su destino y con su esquema

- **WHEN** se ejecuta `init` o `install --project` con el host activo `opencode` y el MCP habilitado
- **THEN** el CLI escribe `.opencode/opencode.json` con el mapa `mcp`
- **AND** NO SHALL crear `.agents/mcp_config.json`, `.mcp.json` ni `copilot-mcp.json`

#### Scenario: `antigravity` escribe en su MCP de workspace

- **WHEN** se ejecuta `init` o `install --project` con el host activo `antigravity` y el MCP habilitado
- **THEN** el CLI escribe o mergea `.agents/mcp_config.json` con `mcpServers`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: `commandcode` escribe su MCP de proyecto

- **WHEN** se ejecuta `init` o `install --project` con el host activo `commandcode` y el MCP habilitado
- **THEN** el CLI escribe o mergea `.mcp.json` con `mcpServers`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: `copilot` escribe su MCP de proyecto

- **WHEN** se ejecuta `init` o `install --project` con el host activo `copilot` y el MCP habilitado
- **THEN** el CLI escribe o mergea `copilot-mcp.json` con el mapa `mcp`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: Un host sin destino no escribe MCP ni crea `.opencode/opencode.json`

- **WHEN** se ejecuta `init`, `install --project` o `import` con host activo `claude`, `vscode`, `cursor` o `roo` y el MCP habilitado
- **THEN** el CLI NO SHALL crear ningún archivo MCP
- **AND** NO SHALL crear ni escribir `.opencode/opencode.json` por ese motivo
- **AND** emite como máximo un aviso no bloqueante que nombra el host
- **AND** el comando completa con el exit code que ya tenía

#### Scenario: `import` apunta al host activo y no a `.opencode`

- **WHEN** se ejecuta `import <bundle>` o `import --repair` con host activo `claude`
- **THEN** el CLI NO SHALL crear `.opencode/opencode.json`
- **AND** emite como máximo un aviso no bloqueante que nombra `claude`
- **AND** el comando no aborta

#### Scenario: Un proyecto mixto conserva el `.opencode` previo

- **WHEN** un proyecto tiene `.opencode/opencode.json` de una instalación previa de `opencode` y se ejecuta una corrida con host activo `claude`
- **THEN** el archivo `.opencode/opencode.json` existente NO SHALL borrarse ni reescribirse
- **AND** `check` SHALL seguir validándolo porque `opencode` figura en la unión de hosts instalados

#### Scenario: La instalación global sin proyecto queda excluida

- **WHEN** se ejecuta `install` sin `--project` y sin un proyecto ancleto en el directorio actual
- **THEN** el ruteo de escritura MCP por host NO SHALL aplicarse
- **AND** la rama global conserva su comportamiento previo sólo-opencode
- **AND** NO SHALL escribirse `copilot-mcp.json`, `.mcp.json` ni `.agents/mcp_config.json` en el directorio de trabajo

#### Scenario: La intención MCP del bundle queda excluida

- **WHEN** se ejecuta `export` en un proyecto
- **THEN** el manifiesto MCP SHALL seguir leyéndose sólo de la configuración de `opencode`
- **AND** este change NO SHALL hacer host-aware el manifiesto de exportación

#### Scenario: Re-ejecutar no cambia el resultado

- **WHEN** se ejecuta dos veces el mismo `install` o `import` sobre el mismo estado, o `upgrade` después de `install`
- **THEN** el archivo MCP del host conserva el mismo conjunto de entradas
- **AND** NO SHALL borrarse ninguna entrada ni archivo existente
