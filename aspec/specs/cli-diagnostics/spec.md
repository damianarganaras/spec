# Spec: cli-diagnostics

## Purpose

Diagnósticos read-only de la CLI sobre el estado del proyecto. Define cómo `check` reporta la deriva
de `.ancletorc.version` y el estado de los comandos MCP como avisos advisory que no alteran el oráculo
ni el exit code, cómo `doctor` valida la config MCP de `opencode` cuando existe, con precedencia de
proyecto sobre global y sin validar las configuraciones MCP de otros hosts, cómo `import` avisa antes
de reemplazar una config no parseable, y la regla única que fija la salud de una entrada MCP y el
descubrimiento de la config MCP del proyecto.

## Requirements

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

### Requirement: Salud de un comando MCP según existencia de la ruta

`ancleto` SHALL decidir la salud de una entrada MCP con un único predicado, compartido por todos los
caminos que reparan o refrescan configuración MCP (`import`, `import --repair` y los refrescos de los
hosts que escriben MCP).

Una entrada SHALL considerarse rota cuando:

- `command` no es un arreglo, o es un arreglo vacío;
- su primer elemento no es un string no vacío;
- su primer elemento es una ruta absoluta de la plataforma actual y esa ruta no existe.

Una entrada NO SHALL considerarse rota cuando su primer elemento es un comando simple que no es una
ruta absoluta del host (se presume resuelto por PATH), ni cuando es una ruta absoluta existente. Una
ruta absoluta de Windows con letra de unidad (`C:\nvm4w\nodejs\node.exe`, `c:/...`) SHALL ser sana
cuando el archivo exista. La forma con letra de unidad NO SHALL considerarse rota por su forma: SHALL
evaluarse como ruta absoluta sólo cuando la plataforma actual la trate como tal y, en las demás
plataformas, SHALL caer en la regla de comando simple.

El predicado NO SHALL ejecutar el comando, resolver PATH con procesos externos ni agregar
dependencias para decidir la salud.

#### Scenario: Una ruta absoluta de Windows existente es sana

- **WHEN** una entrada declara como primer elemento `C:\nvm4w\nodejs\node.exe` (o `c:/...`) en una
  plataforma Windows y ese archivo existe
- **THEN** el predicado NO SHALL considerar la entrada rota
- **AND** los caminos de reparación NO SHALL reescribir esa entrada

#### Scenario: Una ruta absoluta inexistente es rota

- **WHEN** el primer elemento de `command` es una ruta absoluta del host y el archivo no existe
- **THEN** el predicado SHALL considerar la entrada rota
- **AND** los caminos de reparación SHALL poder regenerarla cuando exista una definición nueva

#### Scenario: Un comando simple resuelto por PATH es sano

- **WHEN** el primer elemento de `command` es un nombre de comando que no es una ruta absoluta del
  host, por ejemplo `custom-mcp`
- **THEN** el predicado NO SHALL considerar la entrada rota
- **AND** la entrada NO SHALL reescribirse

#### Scenario: Un comando inválido es roto

- **WHEN** una entrada no declara `command`, lo declara como arreglo vacío, o su primer elemento no es
  un string no vacío
- **THEN** el predicado SHALL considerar la entrada rota

### Requirement: `check` emite avisos advisory de estado MCP

`ancleto check` SHALL inspeccionar la configuración MCP del proyecto y SHALL agregar avisos advisory
al arreglo de warnings existente, impresos como `  ⚠ <texto>`.

- Cuando la configuración del proyecto exista y no sea JSON parseable, `check` SHALL emitir un único
  aviso cuyo texto, sin el glifo, SHALL ser
  `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP`
  —con `<ruta>` relativa al proyecto y separadores `/`, por ejemplo `.opencode/opencode.json`—.
- Cuando la configuración del proyecto parsee, `check` SHALL emitir un aviso por cada entrada MCP cuyo
  comando esté roto según el predicado de salud, con el texto
  `MCP '<nombre>' tiene un comando roto (<detalle>)`, donde `<detalle>` SHALL ser el primer elemento
  sólo cuando `command` sea un arreglo y ese elemento sea un string no vacío; en cualquier otra forma
  —`command` como string, arreglo vacío, primer elemento no string o `command` ausente— SHALL ser
  `command ausente`.
- Cuando `cfg.mcp` no sea un objeto plano —por ejemplo string, arreglo, número o `null`—, `check` NO
  SHALL emitir avisos de estado MCP y NO SHALL tratarlo como error de parseo.
- Cuando no exista configuración MCP de proyecto, o todas las entradas sean sanas, `check` NO SHALL
  emitir ningún aviso de estado MCP.

Los avisos NO SHALL cambiar el exit code (`missing > 0 ? 1 : 0`), NO SHALL incrementar `missing` ni
`orphans`, NO SHALL alterar el conjunto de aceptación del oráculo y NO SHALL escribir ni regenerar
archivos. `check` NO SHALL inspeccionar configuraciones MCP de otros hosts ni la configuración global.

El aviso NO SHALL cambiar la decisión de la compuerta de compresión: una entrada `caveman` presente y
rota SHALL seguir contando como compresión presente a los efectos de esa compuerta, y SHALL producir
su propio aviso.

#### Scenario: Una config no parseable produce un aviso con la ruta

- **WHEN** el proyecto tiene `.opencode/opencode.json` con contenido que no parsea como JSON y se
  ejecuta `ancleto check`
- **THEN** `check` emite el aviso `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP`
- **AND** el exit code queda determinado sólo por `missing > 0 ? 1 : 0`
- **AND** ningún archivo del proyecto se modifica

#### Scenario: Una entrada con comando roto produce un aviso

- **WHEN** la config MCP del proyecto parsea y una entrada declara un comando roto
- **THEN** `check` emite un aviso que nombra la entrada y el detalle del comando
- **AND** las entradas sanas no producen aviso

#### Scenario: `caveman` presente pero roto produce aviso sin mover la compuerta

- **WHEN** la config MCP del proyecto declara `caveman` con un comando roto y se ejecuta `ancleto check`
- **THEN** `check` emite el aviso de comando roto para `caveman`
- **AND** la compuerta de la nota de compresión sigue considerando presente a `caveman`

#### Scenario: Un mapa `mcp` no-objeto no produce avisos

- **WHEN** la config MCP del proyecto parsea pero `mcp` es un string, un arreglo, un número o `null`
- **THEN** `check` NO SHALL emitir avisos de estado MCP
- **AND** `check` NO SHALL reportar la config como JSON inválido

#### Scenario: Sin config MCP o con todo sano no hay aviso

- **WHEN** el proyecto no tiene `.opencode/opencode.json` ni `.opencode/opencode.jsonc`, o su config
  parsea y todas las entradas son sanas
- **THEN** `check` NO SHALL emitir ningún aviso de estado MCP
- **AND** el exit code y el resto de la salida no cambian

### Requirement: `import` avisa antes de reemplazar una config MCP no parseable

Cuando la configuración MCP del proyecto exista y no sea JSON parseable, `ancleto import` (con o sin
bundle, incluido `--repair`) SHALL emitir a stderr, antes de reemplazarla, un aviso que nombre el
archivo, con el texto
`ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP nueva`.
El aviso SHALL emitirse una sola vez por ejecución.

La decisión de reemplazo NO SHALL cambiar: la configuración no parseable SHALL seguir siendo
sobrescrita por la configuración nueva, y el exit code de `import` NO SHALL cambiar por este aviso.
Una configuración parseable NO SHALL producir el aviso.

#### Scenario: Una config no parseable se avisa y se reemplaza

- **WHEN** el proyecto tiene una config MCP no parseable y se ejecuta `ancleto import --repair`
- **THEN** el comando emite el aviso que nombra el archivo
- **AND** la config se reemplaza por la configuración MCP nueva
- **AND** el exit code no cambia por el aviso

#### Scenario: Una config parseable no produce aviso

- **WHEN** el proyecto tiene una config MCP parseable y se ejecuta `ancleto import --repair`
- **THEN** el comando NO SHALL emitir el aviso de reemplazo
- **AND** la reparación se limita a las entradas rotas

### Requirement: Descubrimiento único de la config MCP del proyecto

`ancleto check`, `ancleto doctor` y la lectura de la config MCP que consumen `export` e `import` SHALL
resolver el archivo de configuración MCP del proyecto con una única regla compartida: el primer
archivo existente entre `.opencode/opencode.json` y `.opencode/opencode.jsonc`, en ese orden. Para un
mismo estado del proyecto, todos esos comandos SHALL resolver el mismo archivo.

El par de nombres candidatos de la config MCP del proyecto SHALL tener un único dueño: una constante
de módulo. La constante SHALL poseer únicamente el conjunto de nombres, NO las semánticas de selección
de sus consumidores: la lectura resuelve el primer existente, la combinación de MCP recolecta todos
los archivos existentes y la detección de compresión prueba todos los candidatos. Esas diferencias de
selección son intencionales y NO SHALL interpretarse como duplicación de la regla.

`doctor` SHALL conservar su fallback a la configuración global cuando no exista configuración de
proyecto, sus textos (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`,
`⚠ opencode.json no encontrado (config MCP)`) y su exit code (fatal sólo por Node < 24 o por fallo al
importar `node:sqlite`). `export` e `import` SHALL conservar su contrato de lectura: la ruta resuelta
y el contenido parseado, con contenido vacío cuando el archivo no parsea o no existe.

#### Scenario: Los tres comandos resuelven el mismo archivo

- **WHEN** el proyecto tiene `.opencode/opencode.jsonc` y no tiene `.opencode/opencode.json`
- **THEN** `check`, `doctor` y la lectura de `export`/`import` resuelven `.opencode/opencode.jsonc`
- **AND** ninguno resuelve un archivo distinto para el mismo proyecto

#### Scenario: `doctor` conserva fallback y mensajes

- **WHEN** el proyecto no tiene ninguno de los dos archivos de proyecto y existe la configuración
  global, o no existe ninguna configuración
- **THEN** `doctor` conserva el fallback global y el mensaje `no encontrado` respectivamente
- **AND** el exit code no cambia por el estado de la configuración MCP
