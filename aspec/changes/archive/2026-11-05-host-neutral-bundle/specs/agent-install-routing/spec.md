# Spec delta: host-neutral-bundle — agent-install-routing

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

Ningún host distinto de `opencode` SHALL usar `.opencode/opencode.json` como **destino de escritura** en alcance de proyecto. Un `.opencode` preexistente de una instalación previa de `opencode` NO SHALL borrarse ni reescribirse por una corrida cuyo host activo sea distinto.

`import <bundle>` e `import --repair` SHALL escribir en el destino del host activo, no en un destino fijo de `opencode`. Cuando el host activo no tenga destino, `import` NO SHALL crear `.opencode/opencode.json` y SHALL aplicar el aviso único del párrafo anterior.

La garantía es de alcance de proyecto y de host activo: NO SHALL aplicarse a la instalación global sin proyecto, que conserva su comportamiento previo sólo-opencode. El CLI NO SHALL borrar archivos MCP preexistentes ni entradas existentes.

Los merges SHALL ser no destructivos e idempotentes: SHALL agregar sólo nombres ausentes, NO SHALL borrar entradas ni archivos existentes, y ejecutar dos veces `import`, dos veces `install` o `upgrade` después de `install` NO SHALL cambiar el conjunto de entradas MCP del host.

`.vscode/mcp.json`, `.roo/mcp.json` y un `.mcp.json` escrito para `claude` SHALL quedar fuera de alcance: el CLI NO SHALL crearlos.

> **Reemplazo de scenario:** al sincronizar, eliminar el scenario canónico «La intención MCP del bundle queda excluida»; el scenario vigente es «La intención MCP del bundle se lee del destino del host activo».

#### Scenario: La intención MCP del bundle se lee del destino del host activo

- **WHEN** se ejecuta `export` en un proyecto cuyo host activo es `copilot`, `antigravity` o `commandcode`
- **THEN** la intención MCP del manifiesto SHALL provenir del destino MCP que el descriptor declara para ese host
- **AND** el ruteo de escritura MCP de este requirement NO SHALL verse afectado
