# Spec delta: host-neutral-bundle — cli-diagnostics

## MODIFIED Requirements

### Requirement: Descubrimiento único de la config MCP del proyecto

`ancleto check`, `ancleto doctor`, `ancleto import`/`import --repair` y `ancleto export` SHALL resolver la configuración MCP desde un dueño único de destinos por host, y NO SHALL inventar rutas literales por comando.

Para `opencode`, el par de nombres candidatos de la configuración MCP del proyecto SHALL seguir teniendo un único dueño de módulo (`PROJECT_MCP_CANDIDATES`), y la lectura SHALL resolver el primer archivo existente entre `.opencode/opencode.json` y `.opencode/opencode.jsonc`, en ese orden.

Para los demás hosts, el destino SHALL ser el archivo único que declare el descriptor de destinos MCP por host. El descriptor SHALL poseer el destino y el esquema; la constante de candidatos de `opencode` SHALL poseer sólo los nombres de archivo.

Las semánticas de selección SHALL ser intencionalmente distintas por consumidor:

- `check` resuelve todos los destinos declarados de los hosts instalados;
- `doctor` resuelve el destino del host activo y luego el de los hosts instalados, con fallback global sólo-opencode;
- `import`/`import --repair` resuelven el destino del host activo;
- `export` resuelve el destino del host activo cuando ese host declara destino; cuando el host activo no declara destino, conserva la lectura legacy de `.opencode/opencode.json` o `.opencode/opencode.jsonc`.

Para un mismo host con destino y estado del proyecto, `check`, `doctor`, `import` y `export` SHALL resolver el mismo archivo. Para un host sin destino, `export` NO SHALL resolver `copilot-mcp.json`, `.mcp.json` ni `.agents/mcp_config.json`.

`doctor` SHALL conservar su fallback a la configuración global cuando no exista configuración de proyecto, sus textos (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`, `⚠ opencode.json no encontrado (config MCP)`) y su exit code (fatal sólo por Node < 24 o por fallo al importar `node:sqlite`). `export` e `import` SHALL conservar su contrato de lectura: la ruta resuelta y el contenido parseado, con contenido vacío cuando el archivo no parsea o no existe. Cuando un destino declarado del host activo exista y no parsea, `export` SHALL emitir a stderr un único aviso no bloqueante que nombre el archivo con ruta relativa al proyecto, y SHALL exportar intención MCP vacía sin cambiar el exit code.

#### Scenario: `export` resuelve el destino del host activo

- **WHEN** el proyecto tiene `copilot-mcp.json` con entradas MCP, no tiene `.opencode/opencode.json`, y el host activo es `copilot`
- **THEN** `export` resuelve `copilot-mcp.json` como fuente de la intención MCP
- **AND** NO SHALL leer `.opencode/opencode.json` ni `.opencode/opencode.jsonc`

#### Scenario: `export` avisa y exporta intención vacía cuando el destino no parsea

- **WHEN** el destino declarado del host activo existe y no es JSON parseable y se ejecuta `ancleto export`
- **THEN** `export` emite un único aviso no bloqueante que nombra la ruta relativa del archivo
- **AND** el manifiesto exporta intención MCP vacía
- **AND** el exit code es 0

> **Reemplazo de scenario:** al sincronizar, eliminar el scenario canónico «`export` conserva la lectura sólo-opencode»; el scenario vigente es «`export` en host sin destino conserva la lectura legacy de `opencode`».

#### Scenario: `export` en host sin destino conserva la lectura legacy de `opencode`

- **WHEN** el host activo es `claude` y el proyecto tiene `.opencode/opencode.json` con entradas MCP
- **THEN** `export` conserva esa lectura como intención MCP
- **AND** NO SHALL incorporar `.mcp.json` como intención MCP del bundle

#### Scenario: `export` con destino inexistente exporta intención vacía sin aviso

- **WHEN** el destino declarado del host activo no existe y se ejecuta `ancleto export`
- **THEN** el manifiesto exporta intención MCP vacía
- **AND** NO SHALL emitir un aviso por la ausencia del archivo
- **AND** el exit code es 0
