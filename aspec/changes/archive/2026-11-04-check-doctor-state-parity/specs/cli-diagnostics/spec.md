## ADDED Requirements

### Requirement: `check` reporta la deriva de `.ancletorc.version` como aviso

`ancleto check` SHALL comparar el campo `version` de `.ancletorc` con la versión del CLI en ejecución
(`packageVersion()`) y SHALL agregar un aviso advisory cuando la versión registrada sea un string no
vacío distinto de la versión del CLI. El aviso SHALL emitirse una sola vez por ejecución; el texto del
mensaje, sin el glifo, SHALL ser:

`.ancletorc registra v<rcVersion> y el CLI es v<cliVersion>; corré 'ancleto upgrade' para regenerar los artefactos locales`

—con `<rcVersion>` y `<cliVersion>` sustituidos por los valores comparados—. La línea impresa SHALL
ser `  ⚠ <texto>` mediante el printer de warnings existente de `check`.

El aviso NO SHALL cambiar el exit code de `check` (`missing > 0 ? 1 : 0`), NO SHALL incrementar
`missing` ni `orphans`, NO SHALL alterar el conjunto de aceptación del oráculo y NO SHALL escribir ni
regenerar archivos. `ancleto upgrade` SHALL seguir siendo el único remediador de la deriva.

`check` NO SHALL emitir el aviso cuando `version` esté ausente, sea el string vacío, no sea un string
(`null`, número, objeto) o sea igual a la versión del CLI.

#### Scenario: Una versión registrada distinta produce el aviso

- **WHEN** `.ancletorc.version` es un string no vacío distinto de la versión del CLI y se ejecuta
  `ancleto check`
- **THEN** `check` emite el aviso con las dos versiones y la sugerencia de `ancleto upgrade`
- **AND** el exit code queda determinado sólo por `missing > 0 ? 1 : 0`
- **AND** ningún archivo del proyecto se modifica

#### Scenario: Una versión igual no produce aviso

- **WHEN** `.ancletorc.version` coincide con la versión del CLI
- **THEN** `check` NO SHALL emitir el aviso de deriva
- **AND** el resto de la salida y el exit code no cambian

#### Scenario: Versión ausente o no string no produce aviso

- **WHEN** `.ancletorc` no declara `version`, la declara como `""`, o la declara con un valor que no
  es string
- **THEN** `check` NO SHALL emitir el aviso de deriva
- **AND** el exit code no cambia por ese motivo

### Requirement: `doctor` valida la config MCP del proyecto cuando existe

`ancleto doctor` SHALL resolver la config MCP de `opencode` con esta precedencia: el
`.opencode/opencode.json` del proyecto actual, el `.opencode/opencode.jsonc` del proyecto actual,
`globalConfigDir()/opencode.json`, `globalConfigDir()/opencode.jsonc`. SHALL validar sólo el primer
archivo existente y NO SHALL validar simultáneamente la config del proyecto y la global.

Cuando valide la config del proyecto, el reporte SHALL nombrar su ruta relativa con separadores `/`
(por ejemplo `.opencode/opencode.json`). Cuando valide la config global, SHALL conservar el nombre
base del archivo. Los mensajes SHALL conservar las formas existentes:

- `✔ <ruta> valido` cuando el contenido parsea;
- `✖ <ruta> JSON invalido` cuando el contenido no parsea;
- `⚠ opencode.json no encontrado (config MCP)` cuando no existe ninguno de los cuatro archivos.

Si existe una config de proyecto, `doctor` NO SHALL caer al fallback global aunque esa config sea
inválida. El parseo SHALL ser el existente (`JSON.parse` sobre el contenido sin BOM); este
requirement NO SHALL agregar parseo tolerante de comentarios para `.jsonc`.

`doctor` NO SHALL validar `.agents/mcp_config.json`, `.mcp.json`, `copilot-mcp.json` ni
`.vscode/mcp.json`. El exit code SHALL seguir siendo fatal sólo por Node < 24 o por fallo al importar
`node:sqlite`; una config inválida o ausente NO SHALL alterarlo.

#### Scenario: El proyecto con config válida se valida y reporta la ruta relativa

- **WHEN** el proyecto actual tiene `.opencode/opencode.json` con JSON válido y se ejecuta
  `ancleto doctor`
- **THEN** `doctor` valida ese archivo y reporta `.opencode/opencode.json valido`
- **AND** el exit code es 0

#### Scenario: Config de proyecto inválida no cae al fallback global

- **WHEN** el proyecto actual tiene `.opencode/opencode.json` con JSON inválido y la config global es
  válida
- **THEN** `doctor` reporta `.opencode/opencode.json JSON invalido`
- **AND** NO SHALL validar la config global en esa ejecución
- **AND** el exit code es 0

#### Scenario: Sin config de proyecto se conserva el fallback global

- **WHEN** el proyecto actual no tiene `.opencode/opencode.json` ni `.opencode/opencode.jsonc` y
  existe la config global
- **THEN** `doctor` valida la config global y reporta su nombre base
- **AND** si no existe ninguna config, reporta `opencode.json no encontrado (config MCP)`

#### Scenario: Las configuraciones MCP de otros hosts quedan excluidas

- **WHEN** el proyecto tiene `.agents/mcp_config.json`, `.mcp.json`, `copilot-mcp.json` o
  `.vscode/mcp.json` y no tiene `.opencode/opencode.json`
- **THEN** `doctor` NO SHALL validar esos archivos
- **AND** resuelve la config MCP por el fallback global
