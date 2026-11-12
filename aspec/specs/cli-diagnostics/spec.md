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

`ancleto doctor` SHALL resolver el archivo de configuración MCP del proyecto desde el descriptor único de destino MCP por host, con esta precedencia: el host activo (`rc.agent`, `opencode` por defecto) cuando declara destino; luego los hosts instalados que declaran destino, en el orden `opencode`, `antigravity`, `commandcode`, `copilot`. SHALL validar sólo el primer archivo de proyecto existente de esa resolución.

Para `opencode`, el archivo de proyecto SHALL resolverse entre `.opencode/opencode.json` y `.opencode/opencode.jsonc`, en ese orden. Para el resto de los hosts con destino, SHALL usar el archivo único que declare el descriptor.

Si no existe ningún archivo de proyecto en esa resolución, `doctor` SHALL conservar el fallback a la configuración global de `opencode`: `globalConfigDir()/opencode.json` y `globalConfigDir()/opencode.jsonc`. El fallback global SHALL seguir siendo sólo de `opencode`; `doctor` NO SHALL validar configuraciones globales de otros hosts.

Cuando valide la config del proyecto, el reporte SHALL nombrar su ruta relativa con separadores `/` (por ejemplo `.opencode/opencode.json`, `.agents/mcp_config.json`, `.mcp.json` o `copilot-mcp.json`). Cuando valide la config global, SHALL conservar el nombre base del archivo. Los mensajes SHALL conservar las formas existentes:

- `✔ <ruta> valido` cuando el contenido parsea;
- `✖ <ruta> JSON invalido` cuando el contenido no parsea;
- `⚠ opencode.json no encontrado (config MCP)` cuando no existe ninguna configuración.

Si existe una config de proyecto para el host resuelto, `doctor` NO SHALL caer al fallback global aunque esa config sea inválida. El parseo SHALL ser el existente (`JSON.parse` sobre el contenido sin BOM); este requirement NO SHALL agregar parseo tolerante de comentarios para `.jsonc`.

`doctor` NO SHALL validar `.vscode/mcp.json` ni `.roo/mcp.json`. Un `.mcp.json` SHALL validarse sólo cuando `commandcode` sea el host activo o instalado que lo declara; un proyecto sólo-`claude` que tiene un `.mcp.json` preexistente NO SHALL validarlo.

El estado MCP SHALL seguir siendo advisory: una config inválida o ausente NO SHALL alterar el exit code, que SHALL seguir siendo fatal sólo por Node < 24 o por fallo al importar `node:sqlite`.

#### Scenario: El proyecto con config válida se valida y reporta la ruta relativa

- **WHEN** el proyecto actual tiene `.opencode/opencode.json` con JSON válido y se ejecuta `ancleto doctor`
- **THEN** `doctor` valida ese archivo y reporta `.opencode/opencode.json valido`
- **AND** el exit code es 0

#### Scenario: Config de proyecto inválida no cae al fallback global

- **WHEN** el proyecto actual tiene `.opencode/opencode.json` con JSON inválido y la config global es válida
- **THEN** `doctor` reporta `.opencode/opencode.json JSON invalido`
- **AND** NO SHALL validar la config global en esa ejecución
- **AND** el exit code es 0

#### Scenario: Sin config de proyecto se conserva el fallback global

- **WHEN** el proyecto actual no tiene ningún archivo MCP de proyecto para el host resuelto y existe la config global de `opencode`
- **THEN** `doctor` valida la config global y reporta su nombre base
- **AND** si no existe ninguna config, reporta `opencode.json no encontrado (config MCP)`

#### Scenario: Un proyecto `antigravity` valida su MCP de workspace

- **WHEN** el proyecto tiene `.agents/mcp_config.json` y el host activo o instalado es `antigravity`
- **THEN** `doctor` valida ese archivo y reporta `.agents/mcp_config.json valido` o `JSON invalido`
- **AND** NO SHALL validar `.opencode/opencode.json` en esa ejecución

#### Scenario: Un proyecto sólo-`copilot` no se lee como `vscode`

- **WHEN** el proyecto tiene `copilot-mcp.json` y el host activo o instalado es `copilot`, sin `.opencode` ni `.github/agents`
- **THEN** `doctor` valida `copilot-mcp.json`
- **AND** NO SHALL tratar el proyecto como `vscode` ni validar `.vscode/mcp.json`

#### Scenario: Un proyecto sólo-`claude` no valida `.mcp.json` ni `.opencode`

- **WHEN** el proyecto tiene un `.mcp.json` preexistente y el host activo o instalado es `claude`
- **THEN** `doctor` NO SHALL validar `.mcp.json`
- **AND** NO SHALL crear ni validar `.opencode/opencode.json` por ese motivo

#### Scenario: Un hallazgo MCP no cambia el exit

- **WHEN** `doctor` encuentra una config MCP inválida o ausente
- **THEN** el exit code sigue siendo 0
- **AND** el comando no escribe ni modifica archivos

#### Scenario: Las configuraciones MCP de otros hosts quedan excluidas

- **WHEN** el proyecto tiene `.agents/mcp_config.json`, `.mcp.json`, `copilot-mcp.json` o
  `.vscode/mcp.json` y no existe `.opencode/opencode.json`
- **THEN** `doctor` SHALL validar sólo el destino MCP del host activo o instalado que declare un
  archivo de proyecto
- **AND** NO SHALL validar los destinos de hosts que no están instalados ni son el host activo, ni
  `.vscode/mcp.json`
- **AND** si ningún host con destino declara un archivo de proyecto existente, resuelve la config
  MCP por el fallback global de `opencode`

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

`ancleto check` SHALL inspeccionar la configuración MCP de proyecto de cada host instalado que declare un destino en el descriptor único. Los hosts instalados SHALL derivarse de la unión de `installedPaths` y NO SHALL derivarse de un único `rc.agent` ni de una resolución directorio→host que pueda leer `.github/prompts` como `vscode` cuando el host real es `copilot`.

Para cada destino declarado:

- `opencode` SHALL usar `.opencode/opencode.json` o `.opencode/opencode.jsonc` (el existente);
- `antigravity` SHALL usar `.agents/mcp_config.json`;
- `commandcode` SHALL usar `.mcp.json`;
- `copilot` SHALL usar `copilot-mcp.json`.

Cuando el archivo exista y no sea JSON parseable, `check` SHALL emitir un único aviso por archivo con el texto `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP`, con `<ruta>` relativa al proyecto y separadores `/`.

Cuando el archivo parsee, `check` SHALL emitir un aviso por cada entrada MCP cuyo comando esté roto según el predicado de salud de comandos MCP. Para los esquemas `mcpServers` de `antigravity` y `commandcode`, `check` SHALL normalizar la entrada `{ command: <string>, args: [...] }` a la forma canónica `{ command: [<string>, ...<args>] }` antes de aplicar el predicado. El texto SHALL ser `MCP '<nombre>' tiene un comando roto (<detalle>)`, donde `<detalle>` SHALL ser el primer elemento sólo cuando `command` sea un arreglo y ese elemento sea un string no vacío; en cualquier otra forma SHALL ser `command ausente`.

Cuando el mapa de entradas del esquema (`cfg.mcp` o `cfg.mcpServers`, según el destino) no sea un objeto plano —por ejemplo string, arreglo, número o `null`—, `check` NO SHALL emitir avisos de estado MCP y NO SHALL tratarlo como error de parseo.

Cuando no exista configuración MCP de proyecto para ninguno de los destinos declarados, o todas las entradas sean sanas, `check` NO SHALL emitir ningún aviso de estado MCP.

`check` NO SHALL inspeccionar la configuración global ni archivos de hosts que no declaren destino. En particular, un `.mcp.json` preexistente en un proyecto sin `commandcode` instalado NO SHALL inspeccionarse.

Los avisos NO SHALL cambiar el exit code (`missing > 0 ? 1 : 0`), NO SHALL incrementar `missing` ni `orphans`, NO SHALL alterar el conjunto de aceptación del oráculo y NO SHALL escribir ni regenerar archivos.

El aviso NO SHALL cambiar la decisión de la compuerta de compresión: una entrada `caveman` presente y rota SHALL seguir contando como compresión presente a los efectos de esa compuerta, y SHALL producir su propio aviso.

#### Scenario: Una config no parseable produce un aviso con la ruta

- **WHEN** el proyecto tiene `.opencode/opencode.json` con contenido que no parsea como JSON y se ejecuta `ancleto check`
- **THEN** `check` emite el aviso `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP`
- **AND** el exit code queda determinado sólo por `missing > 0 ? 1 : 0`
- **AND** ningún archivo del proyecto se modifica

#### Scenario: Una entrada con comando roto produce un aviso

- **WHEN** la config MCP del proyecto parsea y una entrada declara un comando roto
- **THEN** `check` emite un aviso que nombra la entrada y el detalle del comando
- **AND** las entradas sanas no producen aviso

#### Scenario: `commandcode` normaliza `command` string y `args`

- **WHEN** el proyecto tiene `.mcp.json` con `mcpServers.<n> = { command: '<ruta absoluta inexistente>', args: [] }` y `commandcode` está instalado
- **THEN** `check` aplica el predicado de salud a la forma normalizada `{ command: ['<ruta absoluta inexistente>'] }`
- **AND** emite el aviso de comando roto para esa entrada

#### Scenario: Un proyecto sólo-`copilot` inspecciona `copilot-mcp.json` y no `vscode`

- **WHEN** el proyecto declara `copilot` en la unión de hosts instalados y tiene `copilot-mcp.json` con una entrada rota
- **THEN** `check` inspecciona `copilot-mcp.json` y emite el aviso de comando roto
- **AND** NO SHALL tratar `.github/prompts` como un destino de `vscode` ni omitir la inspección por esa ambigüedad

#### Scenario: Un host sin destino no se inspecciona

- **WHEN** el proyecto sólo tiene `claude` instalado y existe un `.mcp.json` preexistente
- **THEN** `check` NO SHALL inspeccionar `.mcp.json` ni `.opencode/opencode.json`
- **AND** NO SHALL emitir avisos de estado MCP por esos archivos

#### Scenario: La config global no se inspecciona

- **WHEN** el proyecto no tiene config MCP de proyecto y la config global de `opencode` declara una entrada rota
- **THEN** `check` NO SHALL emitir el aviso de comando roto por la config global
- **AND** el exit code no cambia

#### Scenario: Un mapa de entradas no-objeto no produce avisos

- **WHEN** la config MCP del proyecto parsea pero el mapa `mcp` o `mcpServers` es un string, un arreglo, un número o `null`
- **THEN** `check` NO SHALL emitir avisos de estado MCP
- **AND** `check` NO SHALL reportar la config como JSON inválido

#### Scenario: Sin config MCP o con todo sano no hay aviso

- **WHEN** el proyecto no tiene ningún destino MCP declarado, o sus configs parsean y todas las entradas son sanas
- **THEN** `check` NO SHALL emitir ningún aviso de estado MCP
- **AND** el exit code y el resto de la salida no cambian

#### Scenario: Un hallazgo MCP no cambia el exit 1 por faltantes

- **WHEN** `check` encuentra una entrada MCP rota y además hay archivos faltantes
- **THEN** el exit code sigue siendo 1 por los faltantes
- **AND** el aviso MCP no incrementa `missing` ni `orphans`

#### Scenario: `caveman` presente pero roto produce aviso sin mover la compuerta

- **WHEN** la config MCP del proyecto declara `caveman` con un comando roto y se ejecuta `ancleto check`
- **THEN** `check` emite el aviso de comando roto para `caveman`
- **AND** la compuerta de la nota de compresión sigue considerando presente a `caveman`

#### Scenario: Un mapa `mcp` no-objeto no produce avisos

- **WHEN** la config MCP del proyecto parsea pero `mcp` es un string, un arreglo, un número o `null`
- **THEN** `check` NO SHALL emitir avisos de estado MCP
- **AND** `check` NO SHALL reportar la config como JSON inválido

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

#### Scenario: Los comandos resuelven el mismo archivo para el mismo host

- **WHEN** el proyecto tiene `.opencode/opencode.jsonc` y no tiene `.opencode/opencode.json`, y el host es `opencode`
- **THEN** `check`, `doctor` y la lectura de `import` resuelven `.opencode/opencode.jsonc`
- **AND** ninguno resuelve un archivo distinto para ese host

#### Scenario: Los destinos cambian por host

- **WHEN** el proyecto tiene `.agents/mcp_config.json`, `.mcp.json` y `copilot-mcp.json`, y los hosts `antigravity`, `commandcode` y `copilot` figuran instalados
- **THEN** `check` resuelve cada uno de esos archivos para su host
- **AND** `doctor` valida el archivo del host activo primero y no mezcla los esquemas

#### Scenario: `export` resuelve el destino del host activo

- **WHEN** el proyecto tiene `copilot-mcp.json` con entradas MCP, no tiene `.opencode/opencode.json`, y el host activo es `copilot`
- **THEN** `export` resuelve `copilot-mcp.json` como fuente de la intención MCP
- **AND** NO SHALL leer `.opencode/opencode.json` ni `.opencode/opencode.jsonc`

#### Scenario: `export` avisa y exporta intención vacía cuando el destino no parsea

- **WHEN** el destino declarado del host activo existe y no es JSON parseable y se ejecuta `ancleto export`
- **THEN** `export` emite un único aviso no bloqueante que nombra la ruta relativa del archivo
- **AND** el manifiesto exporta intención MCP vacía
- **AND** el exit code es 0

#### Scenario: `export` en host sin destino conserva la lectura legacy de `opencode`

- **WHEN** el host activo es `claude` y el proyecto tiene `.opencode/opencode.json` con entradas MCP
- **THEN** `export` conserva esa lectura como intención MCP
- **AND** NO SHALL incorporar `.mcp.json` como intención MCP del bundle

#### Scenario: `export` con destino inexistente exporta intención vacía sin aviso

- **WHEN** el destino declarado del host activo no existe y se ejecuta `ancleto export`
- **THEN** el manifiesto exporta intención MCP vacía
- **AND** NO SHALL emitir un aviso por la ausencia del archivo
- **AND** el exit code es 0

#### Scenario: `doctor` conserva fallback y mensajes

- **WHEN** el proyecto no tiene ninguno de los archivos de proyecto y existe la configuración global de `opencode`, o no existe ninguna configuración
- **THEN** `doctor` conserva el fallback global y el mensaje `no encontrado` respectivamente
- **AND** el exit code no cambia por el estado de la configuración MCP

#### Scenario: Los tres comandos resuelven el mismo archivo

- **WHEN** el proyecto tiene `.opencode/opencode.jsonc` y no tiene `.opencode/opencode.json`
- **THEN** `check`, `doctor` y la lectura de `export`/`import` resuelven `.opencode/opencode.jsonc`
- **AND** ninguno resuelve un archivo distinto para el mismo proyecto

### Requirement: Manejo de `--help` sin ejecución en subcomandos que mutan estado

`ancleto <subcomando> --help` y `ancleto <subcomando> -h` SHALL imprimir el uso del subcomando a
STDOUT y SHALL salir con exit code 0 antes de ejecutar el handler del subcomando. La presencia de
`--help` o `-h` en cualquier posición del argv del subcomando SHALL activar este comportamiento.

El conjunto de subcomandos alcanzado SHALL ser: `install`, `update`, `upgrade`, `init`, `memory`,
`import`, `export`, `mcp`, `specs` (nivel superior), `specs merge` y `projects`. Para `memory`, el
guard SHALL aplicar tanto a `memory --help` como a `memory <subcomando> --help`. Para `projects`, el
guard SHALL aplicar a `projects --help` y a `projects <subcomando> --help`, incluidos `projects scan`,
`projects prune`, `projects update` y `projects list --update`, y también cuando el alias
`ancleto list --projects` delega en el handler de `projects`.

El texto de uso SHALL identificar el comando y sus argumentos y SHALL ser consistente con la sinopsis
de la ayuda global `HELP`. El texto MAY mantenerse como constantes por comando y NO SHALL omitir
ningún flag documentado del comando. Para `memory` y para `projects`, SHALL cubrir los subcomandos
listados en el uso que hoy se imprime a stderr ante un subcomando desconocido. Para `specs`, SHALL
incluir las formas de `specs check` y `specs merge`.

El guard NO SHALL ejecutar el handler, NO SHALL escribir archivos, NO SHALL crear directorios y NO
SHALL iniciar el servidor MCP. La invariante SHALL ser verificable comparando bytes y `mtime` de
`.ancletorc` y de `.opencode/**` antes y después de una invocación con `--help` en un proyecto
temporal, y comparando bytes y `mtime` del registro de proyectos en
`ANCLETO_PROJECTS_FILE` cuando esa variable apunte a un archivo temporal.

`ancleto discovery --help` y la ayuda global de `ancleto --help`, `ancleto -h` y `ancleto` sin
argumentos SHALL conservar su salida y su exit code actuales.

Las invocaciones sin `--help` ni `-h` NO SHALL cambiar: el parseo de argumentos, los textos de error y
los exit codes por argumentos faltantes o desconocidos SHALL ser los mismos.

Los subcomandos read-only `check`, `doctor`, `stats`, `list` (sin `--projects`) y `affected` quedan
explícitamente fuera de este requirement: NO SHALL agregarse el guard y su comportamiento ante
`--help` NO SHALL cambiar. `specs check --help` también queda fuera.

#### Scenario: `install` y `update` con `--help` imprimen uso sin instalar

- **WHEN** se ejecuta `ancleto install --help` o `ancleto update -h` en un directorio temporal
- **THEN** el comando imprime a STDOUT el uso de `install`/`update`
- **AND** sale con exit code 0
- **AND** no crea ni modifica `.ancletorc`, `.opencode/**` ni ningún otro archivo

#### Scenario: `upgrade` con `--help` no re-aplica templates

- **WHEN** se ejecuta `ancleto upgrade --help` en un directorio temporal sin `.ancletorc`
- **THEN** imprime a STDOUT el uso de `upgrade`
- **AND** sale con exit code 0
- **AND** no re-aplica templates, skills ni manifiesto

#### Scenario: `init` con `--help` no crea el scaffold

- **WHEN** se ejecuta `ancleto init --help` en un directorio temporal sin `.ancletorc`
- **THEN** imprime a STDOUT el uso de `init`
- **AND** sale con exit code 0
- **AND** no crea `.ancletorc`, `.opencode/**`, `aspec/config.yaml` ni ningún otro archivo

#### Scenario: `memory` con `--help` no ejecuta la operación

- **WHEN** se ejecuta `ancleto memory --help`, `ancleto memory -h` o `ancleto memory <subcomando> --help`
- **THEN** imprime a STDOUT el uso de `memory` y sus subcomandos
- **AND** sale con exit code 0
- **AND** no ejecuta la operación ni escribe en `.ancleto/memory.db`

#### Scenario: `import` y `export` con `--help` no importan ni exportan

- **WHEN** se ejecuta `ancleto import --help` o `ancleto export --help`
- **THEN** imprime a STDOUT el uso correspondiente
- **AND** sale con exit code 0
- **AND** no escribe bundle, config MCP ni manifiesto

#### Scenario: `mcp` con `--help` no inicia el servidor

- **WHEN** se ejecuta `ancleto mcp --help`
- **THEN** imprime a STDOUT el uso de `mcp`
- **AND** sale con exit code 0
- **AND** no inicia el servidor MCP ni abre `.ancleto/memory.db`

#### Scenario: `specs` y `specs merge` con `--help` no aplican el delta

- **WHEN** se ejecuta `ancleto specs --help` o `ancleto specs merge --help`
- **THEN** imprime a STDOUT el uso de `specs` con las formas de `specs check` y `specs merge`
- **AND** sale con exit code 0
- **AND** no valida ni aplica ningún delta ni escribe bajo `aspec/specs/**`

#### Scenario: `projects` con `--help` no escribe el registro de proyectos

- **WHEN** se ejecuta `ancleto projects --help`, `ancleto projects prune --help`,
  `ancleto projects update --help`, `ancleto projects scan --help` o
  `ancleto projects list --update --help` en un directorio temporal con `ANCLETO_PROJECTS_FILE`
  apuntando a un archivo temporal
- **THEN** imprime a STDOUT el uso de `projects` con sus subcomandos
- **AND** sale con exit code 0
- **AND** el registro de proyectos queda con los mismos bytes y el mismo `mtime`
- **AND** no se actualiza ningún proyecto ni se crea ni modifica ningún archivo

#### Scenario: `-h` es equivalente a `--help` en todo el conjunto

- **WHEN** se ejecuta cada subcomando del conjunto (`install`, `update`, `upgrade`, `init`, `memory`,
  `import`, `export`, `mcp`, `specs`, `specs merge` y `projects` con sus subcomandos) con `-h` en
  lugar de `--help`
- **THEN** el comportamiento es idéntico: uso en STDOUT, exit code 0 y cero escrituras

#### Scenario: La ayuda no escribe ni siquiera en un proyecto ya inicializado

- **WHEN** se ejecuta cada subcomando del conjunto con `--help` en un proyecto temporal ya inicializado
- **THEN** los bytes y el `mtime` de `.ancletorc` y de todos los archivos bajo `.opencode/**` quedan idénticos antes y después

#### Scenario: `discovery --help` y la ayuda global no cambian

- **WHEN** se ejecuta `ancleto discovery --help`, `ancleto --help`, `ancleto -h` o `ancleto` sin argumentos
- **THEN** la salida y el exit code son los actuales
- **AND** el texto de ayuda de `discovery` no cambia

#### Scenario: Una invocación sin `--help` conserva su comportamiento

- **WHEN** se ejecuta cualquiera de los subcomandos del conjunto sin `--help` ni `-h`
- **THEN** el parseo de argumentos, los textos de error y los exit codes por argumentos faltantes o desconocidos son los mismos que antes del cambio

#### Scenario: Los subcomandos read-only quedan fuera del guard

- **WHEN** se ejecuta `ancleto check --help`, `ancleto doctor --help`, `ancleto stats --help`,
  `ancleto list --help`, `ancleto affected --help` o `ancleto specs check --help`
- **THEN** el guard de ayuda no se aplica
- **AND** su comportamiento es el mismo que antes del cambio

### Requirement: `discovery --check` reporta la presencia del seed-map en cualquier estado

`ancleto discovery --check` SHALL reportar `seedMapPresent` a partir de la presencia real de
`seed-map.json` en el directorio de salida del discovery, con independencia del estado calculado
(`READY`, `STALE`, `PARTIAL` o `MISSING`). El campo SHALL ser `true` cuando el archivo exista y sea
parseable con la forma esperada —`docs` es un objeto plano (no arreglo, no `null`)—, y SHALL ser
`false` en cualquier otro caso, incluido el archivo ausente o malformado.

El cálculo de `seedMapPresent` NO SHALL depender de la rama de estado ni del resultado del diff de
impacto; SHALL realizarse una sola vez por ejecución.

`affectedDocs` SHALL conservar su semántica actual: SHALL ser la intersección entre las áreas
cambiadas y los documentos declarados en `seed-map.json` sólo en estado `STALE` con impacto `minor`
o `material`. En `READY`, `PARTIAL` y `MISSING`, `affectedDocs` SHALL ser `[]`.

Un `seed-map.json` ausente o malformado NO SHALL lanzar, NO SHALL alterar el exit code del comando
—que SHALL seguir siendo 0 cuando el comando completa— y NO SHALL impedir la emisión del JSON.

La salida SHALL seguir siendo JSON con `schemaVersion: 2`, y el comando SHALL seguir siendo
read-only: NO SHALL escribir ni modificar archivos bajo el directorio de salida del discovery.

#### Scenario: READY con seed-map válido reporta presencia sin afectar documentos

- **WHEN** el seed está `READY` y existe un `seed-map.json` válido en el directorio de salida
- **THEN** la salida reporta `state:READY`, `impact:none`, `recommendedAction:continue`,
  `seedMapPresent:true` y `affectedDocs:[]`
- **AND** el exit code es 0

#### Scenario: READY sin seed-map no reporta presencia

- **WHEN** el seed está `READY` y no existe `seed-map.json`
- **THEN** la salida reporta `seedMapPresent:false` y `affectedDocs:[]`
- **AND** el resto de los campos de estado no cambian

#### Scenario: STALE con seed-map válido conserva la intersección

- **WHEN** el seed está `STALE` por impacto `minor` o `material` y existe un `seed-map.json` válido
- **THEN** la salida reporta `seedMapPresent:true`
- **AND** `affectedDocs` contiene los documentos cuyas áreas intersecan las áreas cambiadas,
  ordenados como hoy
- **AND** el comportamiento es el mismo que antes del cambio

#### Scenario: STALE sin seed-map o con seed-map malformado no reporta presencia ni documentos

- **WHEN** el seed está `STALE` y `seed-map.json` no existe, no parsea, o no declara `docs` como
  objeto plano (no arreglo, no `null`)
- **THEN** la salida reporta `seedMapPresent:false` y `affectedDocs:[]`
- **AND** el comando no lanza y el exit code es 0

#### Scenario: PARTIAL con seed-map válido reporta presencia sin afectar documentos

- **WHEN** el seed está `PARTIAL` y existe un `seed-map.json` válido en el directorio de salida
- **THEN** la salida reporta `seedMapPresent:true` y `affectedDocs:[]`
- **AND** el exit code es 0

#### Scenario: MISSING con seed-map válido reporta presencia sin afectar documentos

- **WHEN** el seed está `MISSING` y existe un `seed-map.json` válido en el directorio de salida
- **THEN** la salida reporta `seedMapPresent:true` y `affectedDocs:[]`
- **AND** el exit code es 0

#### Scenario: Un seed-map con `docs` no-objeto plano no reporta presencia

- **WHEN** existe un `seed-map.json` parseable como JSON cuyo campo `docs` es un arreglo o `null`
- **THEN** la salida reporta `seedMapPresent:false` y `affectedDocs:[]`
- **AND** el exit code es 0

#### Scenario: Un seed-map malformado no rompe el check

- **WHEN** `seed-map.json` existe con contenido no parseable y se ejecuta `ancleto discovery --check`
- **THEN** la salida es JSON válido con `seedMapPresent:false` y `affectedDocs:[]`
- **AND** el exit code es 0
- **AND** ningún archivo del directorio de salida se modifica

#### Scenario: La salida conserva el contrato JSON y la semántica de estados

- **WHEN** se ejecuta `ancleto discovery --check` en cualquier estado
- **THEN** la salida mantiene `schemaVersion: 2` y los campos de estado existentes
- **AND** el comando no escribe archivos
- **AND** los exit codes y la semántica de `READY`, `STALE`, `MISSING` y `PARTIAL` no cambian

### Requirement: Clasificación determinista de frescura del seed en discovery --check

`ancleto discovery --check` SHALL emitir un JSON con `schemaVersion: 2`, SHALL ser read-only y
SHALL salir con exit code 0 cuando completa. El campo `impact` SHALL pertenecer a
{`none`, `minor`, `material`} y SHALL calcularse con esta precedencia: `material` cuando
`materialReasons` no está vacío; en caso contrario `minor` cuando `changedAreas` o `notes` no están
vacíos; en caso contrario `none`. `recommendedAction` SHALL ser `regenerate` cuando `impact` es
`material` y `continue` cuando es `minor` o `none`, excepto cuando el estado es `MISSING` (que
reporta `generate`) o `PARTIAL` (que reporta `complete`), aun cuando su `impact` es `none`.

SHALL considerarse archivo material, anclado al repositorio, exactamente:

- `package.json`, sólo en la raíz (un `package.json` anidado NO SHALL ser material);
- `tsconfig.json` y `tsconfig.<sufijo>.json` (equivalente a la regex `^tsconfig(\..+)?\.json$`) y
  `jsconfig.json`;
- `(vite|webpack|rollup|next|nuxt|astro|svelte|tailwind).config.[cm]?[jt]s`;
- `docker-compose.yml` y `docker-compose.yaml`;
- `Dockerfile`;
- `index.html`;
- `src/(main|index).[cm]?[jt]sx?`, sólo en esa profundidad.

NO SHALL ser material ningún otro archivo, incluidos `package-lock.json` en la raíz y cualquier
`package.json` anidado. `discovery --check` SHALL ignorar los directorios `node_modules`, `.git` y
`dist` (`DEFAULT_IGNORES`) y el `outputDir` del discovery (`docs/technical-discovery` por defecto).

Como excepción a la regla anterior, el valor de la clave `version` de primer nivel del `package.json`
de la raíz NO SHALL contar como cambio de contenido ni como cambio material. Cualquier otro cambio en
ese archivo —por ejemplo `dependencies`, `scripts`, `engines`, `workspaces`, indentación, orden de
claves o una `version` anidada— SHALL seguir siendo material y SHALL reportar la razón exacta
`archivo material modificado: package.json`.

`areaOf` SHALL ser el primer segmento de la ruta. Un archivo en la raíz SHALL ser su propia área
(por ejemplo, `Dockerfile` → área `Dockerfile` y `NOTES.md` → área `NOTES.md`).

SHALL considerarse ruta efímera, mediante un único predicado anclado al repositorio, exactamente:

- `.discovery-map.json`, sólo en la raíz del repositorio (un `.discovery-map.json` anidado NO SHALL
  ser efímero);
- `.ancleto` y cualquier ruta que empiece con `.ancleto/`;
- `documentation` y cualquier ruta que empiece con `documentation/`, sólo anclado a la raíz del
  repositorio;
- `audit logs` y cualquier ruta que empiece con `audit logs/` (el nombre literal contiene un
  espacio), sólo anclado a la raíz del repositorio.

El predicado NO SHALL coincidir con `.ancletorc`, `.ancleto-notes.md` ni `src/ancleto/x.js`: la
comparación SHALL ser por ruta completa contra los literales anteriores o contra los prefijos
`.ancleto/`, `documentation/` y `audit logs/`, nunca por prefijo del nombre de archivo ni por segmento
arbitrario. En particular, el anclaje a la raíz de `documentation` y `audit logs` SHALL impedir que
`docs/documentation/x.md`, `documentation-extra/x.md`, `src/documentation/x.js`,
`docs/audit logs/x.log` y `audit logs-extra/x.log` se consideren efímeros. Las rutas efímeras SHALL
seguir presentes en `sources` y en `fileHashes` del estado persistido; sólo quedan excluidas del
cálculo de frescura.

`computeImpact` SHALL comparar `stored.sources` del estado persistido con las rutas actuales, con
ambas vistas filtradas por el predicado de rutas efímeras, y SHALL atribuir el contenido con la vista
efectiva de `stored.fileHashes` (mapas completos, sin filtrar), y SHALL producir en `materialReasons`
únicamente estas formas exactas:

- archivo material nuevo: `archivo material nuevo: <rel>`;
- archivo material eliminado: `archivo material eliminado: <rel>`;
- archivo material modificado: `archivo material modificado: <rel>`;
- área raíz nueva: `area raiz nueva: <área>`;
- área raíz eliminada: `area raiz eliminada: <área>`.

La vista efectiva de hashes SHALL usar el hash normalizado del `package.json` de la raíz cuando el
estado declara la regla normalizada, y el hash crudo persistido para el resto de los archivos. Esta
vista se construye antes de invocar `computeImpact`; `computeImpact`, `areaOf`, `isMaterialFile`,
`MATERIAL_FILE_RES` y `DEFAULT_IGNORES` NO SHALL cambiar su comportamiento.

El filtro de rutas efímeras SHALL aplicarse simétricamente a `stored.sources` y a las rutas actuales
antes de invocar `computeImpact`, de modo que ni las altas ni las bajas efímeras produzcan áreas ni
razones de materialidad. En particular, la ausencia total de `documentation/` o de `audit logs/` en
el árbol actual NO SHALL producir `area raiz eliminada`. `storedFileHashes` y `currentFileHashes` NO
SHALL filtrarse y SHALL seguir siendo mapas completos: el bucle de comparación recorre sólo las rutas
filtradas, así que las claves efímeras nunca se iteran.

`changedAreas` SHALL contener las áreas de altas, bajas y modificaciones detectadas sobre la vista
efectiva de hashes, ordenadas y deduplicadas, y NO SHALL incluir áreas cuyos únicos cambios sean rutas
efímeras. El orden y la cardinalidad de `materialReasons` y de `notes` NO SHALL considerarse parte del
contrato.

`notes` SHALL contener, sólo cuando el estado previo no tiene `fileHashes` y no hay
`changedAreas`, el texto exacto
`estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area`, y
ese caso SHALL forzar `impact: minor`.

El cálculo de `affectedDocs` NO SHALL ser redefinido por este Requirement: queda regido por el
Requirement existente de `discovery --check` sobre la presencia del seed-map.

El hash por archivo SHALL ser `sha256(content).digest('hex').slice(0,16)` y el hash global SHALL ser
el sha256 acumulado de `rel + '\0' + content.length + '\0' + content + '\n'`. Para el `package.json`
de la raíz, el `content` hasheado SHALL ser una normalización byte-preserving: SHALL reemplazarse
únicamente el valor del escape de la clave `version` de primer nivel por un centinela fijo,
preservando todos los demás bytes del archivo, incluidas la indentación, el orden de claves y las
`version` anidadas. Si el JSON no parsea, o `version` no es un string de primer nivel, SHALL
hashearse el contenido crudo. El mismo texto normalizado SHALL alimentar tanto el hash por archivo
como el hash global.

La estructura de estado SHALL ser: si faltan documentos esperados, `MISSING` (con
`recommendedAction: generate`) o `PARTIAL` (con `recommendedAction: complete`) con `impact: none` y
con `changedAreas`, `materialReasons`, `notes` y `affectedDocs` vacíos (`missingDocs` lista los
documentos faltantes); si están completos y el hash actual coincide con el hash persistido comparado
según la regla de hash declarada por el estado, `READY` con `impact: none` y arreglos vacíos; si el
hash no coincide pero, sobre los `sources` completos y los mapas completos de hashes por archivo,
existe al menos una ruta cambiada (alta, baja o contenido distinto) y todas las rutas cambiadas son
efímeras, `READY` con
`impact: none`, `recommendedAction: continue` y arreglos vacíos; si no existe
`.discovery-state.json` o el estado no tiene `hash`, `STALE` con `impact: material`,
`recommendedAction: regenerate` y `changedAreas`, `materialReasons`, `notes` y `affectedDocs` vacíos,
sin atribuir materialidad por archivo ni por área; en cualquier otro caso, `STALE` con el `impact` y
el `recommendedAction` que resulten de `computeImpact` sobre las vistas filtradas, según la
precedencia declarada.

Un desvío de hash sin ninguna ruta cambiada NO SHALL excusarse como `READY`: el estado SHALL seguir
`STALE` con el `impact` que devuelva `computeImpact`. Un estado sin `fileHashes` NO SHALL permitir
atribuir rutas, por lo que el desvío de hash SHALL permanecer `STALE` con `impact: minor`,
`materialReasons: []` y la nota exacta de `notes`, aun cuando el árbol actual sólo difiera en rutas
efímeras; esta regla NO SHALL convertirlo en `READY` ni en material.

El estado persistido SHALL conservar `hash` y `fileHashes` con los bytes crudos y SHALL declarar
`ruleVersion: 2` cuando fue generado con la regla normalizada, junto con
`semantic: { hash, fileHashes }`, donde `semantic.fileHashes` contiene sólo las entradas cuyo hash
normalizado difiere del crudo (la del `package.json` de la raíz, cuando aplica) y `semantic.hash` es
el hash global normalizado. El lector SHALL usar `semantic.hash` y las entradas de
`semantic.fileHashes` cuando `ruleVersion` es `2` y el bloque `semantic` tiene forma válida
(`hash` string y `fileHashes` objeto no-array). Un estado con `ruleVersion: 2` cuyo bloque
`semantic` no tenga esa forma SHALL compararse con la regla cruda, igual que cualquier otro
estado, incluido un estado legacy sin `ruleVersion`, byte-idéntico al comportamiento previo.

El writer del pack NO SHALL cambiar: SHALL seguir persistiendo
`{ version: 1, generatedAt, sources, fileHashes, hash, ruleVersion: 2, semantic, packTokens }` con
`sources` y `fileHashes` crudos y completos, incluidas las rutas efímeras (entre ellas
`documentation/**` y `audit logs/**`), para que un lector previo lea los campos crudos y `semantic`
exactamente como antes. Cuando `documentation/` o `audit logs/` existen en el árbol, el writer SHALL
listar sus rutas en `sources` y en `fileHashes` sin filtrarlas: persiste el resultado crudo del walk y
nunca aplica el predicado de rutas efímeras al escribir. La incorporación de rutas efímeras NO
SHALL cambiar `ruleVersion`: la regla de `ruleVersion` gobierna la normalización de contenido y la
pertenencia de rutas es un predicado de lectura aplicado a ambas vistas. NO SHALL agregarse
configuración nueva, NO SHALL introducirse un segundo oráculo y NO SHALL persistirse ni compararse un
hash global derivado o filtrado.

El comando NO SHALL modificar ningún archivo del proyecto. En particular, `discovery --check` NO
SHALL escribir ni regenerar el seed, el estado ni el `seed-map.json`, y NO SHALL migrar ni reescribir
estados legacy.

Estas reglas son el contrato observable de `discovery --check`. El estado declara la regla de hash
con la que fue generado y los estados sin declaración conservan el comportamiento previo, por lo que
un cambio en la regla de hash NO SHALL alterar el significado de los `.discovery-state.json` ya
persistidos. Un cambio en `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `isMaterialFile`, `areaOf`,
`computeImpact` o en el predicado de rutas efímeras sí cambia el comportamiento del comando y SHALL
reflejarse en este Requirement.

#### Scenario: Un cambio no material en un área existente es minor

- **WHEN** el estado persistido está completo y se modifica un archivo existente no material dentro
  de un área existente, por ejemplo `src/app.js` o `package-lock.json` de la raíz
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `materialReasons` es `[]`
- **AND** `changedAreas` contiene el área afectada (`src` o `package-lock.json`, respectivamente),
  ordenada y sin duplicados

#### Scenario: Bump de version con lock y CHANGELOG reflejados es minor sin materialidad

- **WHEN** el único cambio es el valor de la clave `version` de primer nivel del `package.json` de la
  raíz, reflejado en `package-lock.json` y `CHANGELOG.md`
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `materialReasons` es `[]` y no incluye ninguna razón de materialidad para `package.json`
- **AND** `changedAreas` contiene las áreas de los archivos realmente modificados
  (`package-lock.json` y `CHANGELOG.md`) y no incluye `package.json` por el bump de `version`

#### Scenario: Bump de version como único cambio del árbol deja el estado READY

- **WHEN** el único cambio en el árbol es el valor de la clave `version` de primer nivel del
  `package.json` de la raíz, sin otros archivos modificados
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `materialReasons`, `changedAreas` y `notes` quedan vacíos

#### Scenario: Un archivo material nuevo o modificado en un campo distinto de version es material con la razón exacta

- **WHEN** se agrega un archivo material nuevo, por ejemplo `src/index.ts`, o se modifica un archivo
  material existente en un campo distinto de la clave `version` de primer nivel, por ejemplo el
  `package.json` de la raíz cambiando `dependencies`
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye la razón exacta `archivo material nuevo: src/index.ts` o
  `archivo material modificado: package.json`, según el caso

#### Scenario: Un bump de version junto con un cambio real sigue siendo material

- **WHEN** el valor de la clave `version` de primer nivel del `package.json` de la raíz cambia junto
  con otro campo del mismo archivo, por ejemplo `scripts` o `dependencies`
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material modificado: package.json`

#### Scenario: Un reformateo del package.json sin cambiar version es material

- **WHEN** se reformatea el `package.json` de la raíz, por ejemplo cambiando la indentación de dos a
  cuatro espacios, sin cambiar el valor de la clave `version` de primer nivel
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material modificado: package.json`

#### Scenario: Un cambio en una version anidada es material

- **WHEN** cambia una clave `version` anidada del `package.json` de la raíz, por ejemplo
  `config.version`, sin cambiar la `version` de primer nivel
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material modificado: package.json`

#### Scenario: Un archivo material eliminado es material

- **WHEN** se elimina un archivo material, por ejemplo `Dockerfile`, cuyo árbol de archivos produce
  también la desaparición de su área de raíz
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material eliminado: Dockerfile` y puede incluir además
  `area raiz eliminada: Dockerfile`
- **AND** la cantidad y el orden de las razones no se prometen

#### Scenario: Un área raíz nueva por un archivo raíz no material es material

- **WHEN** se agrega en la raíz un archivo no material, por ejemplo `NOTES.md`, que crea un área que
  antes no existía
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `area raiz nueva: NOTES.md`

#### Scenario: Un área raíz eliminada es material

- **WHEN** desaparece un área de raíz porque se elimina su último archivo, por ejemplo `lib/x.js`
  como única entrada del área `lib`
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `area raiz eliminada: lib`

#### Scenario: Los archivos ignorados y el outputDir no afectan el estado

- **WHEN** se agrega un archivo cubierto por `DEFAULT_IGNORES`, por ejemplo `dist/x.js`, o un archivo
  dentro de `docs/technical-discovery/` (el `outputDir` del discovery)
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `materialReasons`, `changedAreas` y `notes` quedan vacíos

#### Scenario: MISSING y PARTIAL recomiendan generar o completar

- **WHEN** faltan todos o parte de los documentos esperados del seed
- **THEN** la salida reporta `state:MISSING` con `recommendedAction:generate`, o `state:PARTIAL` con
  `recommendedAction:complete`, según el caso
- **AND** `impact` es `none` y `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son `[]`

#### Scenario: Sin estado persistido el resultado es material con arreglos vacíos

- **WHEN** no existe `.discovery-state.json` o el estado existente no declara `hash`
- **THEN** la salida reporta `state:STALE`, `impact:material` y `recommendedAction:regenerate`
- **AND** `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son todos `[]`
- **AND** el comando NO SHALL atribuir materialidad por archivo ni por área

#### Scenario: Sin fileHashes previos el resultado es minor con la nota exacta

- **WHEN** el estado previo no tiene `fileHashes` y, tras cambiar contenido, no hay áreas detectables
  por hashes
- **THEN** la salida reporta `impact:minor` y `recommendedAction:continue`
- **AND** `notes` contiene el texto exacto
  `estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area`

#### Scenario: Un estado persistido sin ruleVersion conserva el comportamiento previo

- **WHEN** el estado persistido no declara `ruleVersion: 2` (estado legacy)
- **THEN** la comparación usa la regla cruda, byte-idéntica al comportamiento previo
- **AND** un estado legacy que sólo difiere en el valor de `version` de primer nivel del
  `package.json` de la raíz sigue reportando `impact:material` y `recommendedAction:regenerate`
- **AND** el comando no migra ni reescribe el estado, y los archivos del proyecto quedan idénticos

#### Scenario: Version no-string o JSON inválido se hashea crudo

- **WHEN** el `package.json` de la raíz no parsea como JSON, o su clave `version` de primer nivel no
  es un string
- **THEN** el contenido se hashea crudo, sin normalización
- **AND** si el contenido difiere del persistido, la salida reporta `impact:material` y
  `recommendedAction:regenerate`, con `archivo material modificado: package.json` en
  `materialReasons`

#### Scenario: discovery --check no modifica archivos

- **WHEN** se ejecuta `ancleto discovery --check` sobre un proyecto con seed y estado persistidos
- **THEN** los bytes y el `mtime` de los archivos del proyecto, incluidos el seed, el estado y el
  `seed-map.json`, quedan idénticos antes y después
- **AND** el exit code es 0 y la salida sigue siendo JSON con `schemaVersion: 2`

#### Scenario: Un cambio efímero solamente en un estado ruleVersion:2 es READY sin escrituras

- **WHEN** el estado persistido declara `ruleVersion: 2` y sus `sources` y `fileHashes` incluyen rutas
  efímeras como `.ancleto/memory.db`, `.ancleto/memory.db-wal` y `.discovery-map.json`, y el árbol
  actual cambia sólo en esas rutas
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `changedAreas`, `materialReasons` y `notes` son `[]`, y `affectedDocs` es `[]`
- **AND** los bytes y el `mtime` del seed, del estado, del `seed-map.json` y del `.discovery-map.json`
  quedan idénticos antes y después

#### Scenario: Un cambio efímero junto con un cambio real en src es minor con el área src

- **WHEN** el estado persistido incluye rutas efímeras y, respecto del estado, cambia una ruta
  efímera y un archivo existente no material bajo `src`, por ejemplo `src/app.js`
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `changedAreas` es exactamente `['src']` y no incluye `.ancleto` ni `.discovery-map.json`
- **AND** `materialReasons` es `[]`

#### Scenario: Un archivo efímero nuevo deja el estado READY

- **WHEN** aparece un archivo efímero nuevo, por ejemplo `.ancleto/memory.db-wal`, que no estaba en
  `sources` del estado persistido
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son `[]`

#### Scenario: La eliminación del área .ancleto completa deja el estado READY

- **WHEN** el estado persistido lista `.ancleto/memory.db` y `.ancleto/memory.db-wal` y ambos
  desaparecen del árbol, de modo que el área `.ancleto` queda sin archivos
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `changedAreas` y `materialReasons` son `[]`
- **AND** no aparecen `area raiz eliminada: .ancleto` ni
  `area raiz eliminada: .discovery-map.json`

#### Scenario: Un estado legacy sin fileHashes con churn efímero sigue minor con materialReasons vacío

- **WHEN** el estado persistido es `version: 1` sin `fileHashes` y el único cambio del árbol es en
  rutas efímeras como `.ancleto/memory.db`
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `materialReasons` es `[]` y `changedAreas` es `[]`
- **AND** `notes` contiene el texto exacto
  `estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area`
- **AND** el estado no se reporta como `READY` ni como material

#### Scenario: Las rutas con nombre parecido a .ancleto no son efímeras

- **WHEN** el estado y el árbol incluyen `.ancletorc`, `.ancleto-notes.md` y `src/ancleto/x.js`,
  ninguno cubierto por `DEFAULT_IGNORES`, y cambia el contenido de uno de ellos
- **THEN** ninguna de esas rutas se considera efímera
- **AND** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `changedAreas` contiene el área de la ruta modificada (`.ancletorc`, `.ancleto-notes.md` o
  `src`, según el caso)

#### Scenario: Un cambio arquitectónico real sigue siendo material con rutas efímeras presentes

- **WHEN** el estado incluye rutas efímeras y se elimina un archivo material como `Dockerfile`,
  mientras alguna ruta efímera también cambia
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material eliminado: Dockerfile`

#### Scenario: Un bump de version bajo ruleVersion:2 con rutas efímeras presentes sigue READY

- **WHEN** el estado persistido declara `ruleVersion: 2`, incluye rutas efímeras y el único cambio
  real del árbol es el valor de la clave `version` de primer nivel del `package.json` de la raíz
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `changedAreas`, `materialReasons`, `notes` y `affectedDocs` quedan vacíos

#### Scenario: El seed-map presente y affectedDocs conservan su contrato con rutas efímeras

- **WHEN** el estado sólo cambió en rutas efímeras y existe un `seed-map.json` válido en el
  directorio de salida cuyos documentos mapean a las áreas `.ancleto` o `.discovery-map.json`
- **THEN** la salida reporta `seedMapPresent:true` y `affectedDocs:[]`
- **AND** `changedAreas` es `[]`

#### Scenario: Un cambio de contenido bajo documentation es READY

- **WHEN** el estado persistido incluye rutas bajo `documentation/` y cambia sólo el contenido de una
  de ellas
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son `[]`

#### Scenario: La ausencia completa de documentation en un clon fresco deja el estado READY

- **WHEN** el estado persistido lista rutas bajo `documentation/` y esas rutas no existen en el árbol
  actual, como en un clon fresco
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `materialReasons` no contiene `area raiz eliminada: documentation`
- **AND** `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son `[]`

#### Scenario: Un cambio de contenido bajo audit logs es READY

- **WHEN** el estado persistido incluye rutas bajo `audit logs/` y cambia sólo el contenido de una de
  ellas
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son `[]`

#### Scenario: La ausencia completa de audit logs en un clon fresco deja el estado READY

- **WHEN** el estado persistido lista rutas bajo `audit logs/` y esas rutas no existen en el árbol
  actual, como en un clon fresco
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `materialReasons` no contiene `area raiz eliminada: audit logs`
- **AND** `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son `[]`

#### Scenario: Las rutas con nombre parecido a documentation no son efímeras

- **WHEN** cambia el contenido de `docs/documentation/x.md`, `documentation-extra/x.md` o
  `src/documentation/x.js`, ninguna anclada a la raíz como directorio efímero
- **THEN** ninguna de esas rutas se considera efímera
- **AND** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `changedAreas` contiene el área de la ruta modificada (`docs`, `documentation-extra` o
  `src`, según el caso)

#### Scenario: Un cambio real junto con churn de documentation y audit logs es minor con el área real

- **WHEN** el estado persistido incluye rutas bajo `documentation/` y `audit logs/`, cambia contenido
  en ambas áreas y además se modifica un archivo no material existente bajo `src`, por ejemplo
  `src/app.js`
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `changedAreas` es exactamente `['src']`
- **AND** `materialReasons` es `[]`

#### Scenario: Los cambios de contenido en docs y aspec siguen contando como frescura

- **WHEN** cambia el contenido de un archivo existente bajo `docs/` o bajo `aspec/`
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `changedAreas` contiene `docs` o `aspec`, según el caso
- **AND** `materialReasons` es `[]`

#### Scenario: El estado persistido sigue listando documentation y audit logs en sources

- **WHEN** el estado persistido fue generado con el writer sin cambios e incluye rutas bajo
  `documentation/` y `audit logs/` en `sources` y en `fileHashes`
- **THEN** el estado conserva esas entradas crudas y completas
- **AND** `discovery --check` las excluye del cálculo de frescura sin haberlas borrado del estado
- **AND** el comando no reescribe ni migra el estado

### Requirement: Semántica por segmentos de los patrones de exclusión del discovery

`ancleto discovery` SHALL evaluar cada patrón de `discovery.exclude` de `.ancletorc` contra rutas
relativas al repositorio con separador `/`, y SHALL excluir de `sources` toda ruta que coincida
con al menos un patrón. Los patrones SHALL interpretarse con esta traducción, aplicada antes del
anclaje:

- todo metacarácter de expresión regular excepto `*` y `?` SHALL tratarse como literal; `*` y `?`
  se expanden según sus wildcards;
- la secuencia `**/` SHALL traducirse a `(?:.*/)?`;
- la secuencia `/**` SHALL traducirse a `(?:/.*)?`;
- un `**` restante SHALL traducirse a `.*`;
- un `*` restante SHALL traducirse a `[^/]*`;
- un `?` restante SHALL traducirse a `[^/]`.

Las secuencias `**/` y `/**` SHALL consumirse antes que un `**` suelto. Un patrón que contiene
`**` SHALL quedar anclado en ambos extremos como `^...$`. Un patrón sin `**` SHALL conservar el
comportamiento existente: cada `*` se traduce a `[^/]*` y el patrón se ancla como prefijo con
`^(?:...)(?:/|$)`, de modo que el patrón `p` coincide con `p` y con `p/<resto>`, pero NO con
`p-<sufijo>`. Un `?` SHALL coincidir con exactamente un carácter que no sea `/` y NO SHALL lanzar
al compilarse.

`DEFAULT_IGNORES` y el `outputDir` del discovery NO SHALL cambiar su comportamiento. El estado
persistido SHALL conservar `schemaVersion: 2` y `ruleVersion: 2`, y el writer y la forma del estado
no cambian. La semántica de los patrones SHALL aplicarse sólo a la lectura: un estado persistido que
ya contiene rutas que ahora coinciden SHALL quedar `STALE` con `impact: minor` una vez, sin
migración ni reescritura del estado, siempre que el área de esas rutas siga teniendo al menos una
ruta incluida en el árbol actual; si un área pierde todas sus rutas incluidas, SHALL regir la
clasificación `material` por `area raiz eliminada` que ya define la canónica. Tras la próxima
regeneración las mismas rutas NO SHALL volver a producir `changedAreas`.

#### Scenario: `**/*.test.*` excluye archivos de test en la raíz y anidados

- **WHEN** `discovery.exclude` contiene `**/*.test.*` y el árbol tiene `a.test.js`,
  `src/b.test.js` y `test/specs-merge.test.js`
- **THEN** `sources` NO incluye ninguna de esas tres rutas
- **AND** `sources` conserva `src/foo.testjs` y `src/foo.tests.js`, que no contienen el segmento
  literal `.test.`

#### Scenario: `**/*.spec.*` excluye archivos de spec en la raíz y anidados

- **WHEN** `discovery.exclude` contiene `**/*.spec.*` y el árbol tiene `a.spec.js` y
  `src/nested/b.spec.ts`
- **THEN** `sources` NO incluye ninguna de esas dos rutas
- **AND** `sources` conserva `src/spec-utils.js`

#### Scenario: `**/__tests__/**` excluye el directorio en la raíz y anidado

- **WHEN** `discovery.exclude` contiene `**/__tests__/**` y el árbol tiene `__tests__/a.js` y
  `src/__tests__/b.js`
- **THEN** `sources` NO incluye ninguna de esas dos rutas
- **AND** `sources` conserva `src/__tests__-extra/c.js`

#### Scenario: `**/*.png` sigue excluyendo imágenes en la raíz y anidadas

- **WHEN** `discovery.exclude` contiene `**/*.png` y el árbol tiene `logo.png`,
  `assets/icon.png` y `src/a/b/deep.png`
- **THEN** `sources` NO incluye ninguna de esas tres rutas
- **AND** `sources` conserva `assets/icon.png.bak`

#### Scenario: Un patrón sin `**` conserva el comportamiento de prefijo

- **WHEN** `discovery.exclude` contiene `public` y `package-lock.json`
- **THEN** `sources` NO incluye `public`, `public/index.html` ni `package-lock.json`
- **AND** `sources` conserva `public-x/index.html` y `src/package-lock.json`

#### Scenario: Los lookalikes no matchean

- **WHEN** `discovery.exclude` contiene `public`, `documentation` y `**/__tests__/**`
- **THEN** `sources` conserva `public-x/index.html`, `documentation-extra/x.md`,
  `src/documentation/x.js` y `__tests__-extra/y.js`
- **AND** ninguna de esas rutas queda excluida por el patrón cuya forma se parece

#### Scenario: `?` matchea un solo carácter y no lanza

- **WHEN** `discovery.exclude` contiene `src/?.js` y se ejecuta `ancleto discovery`
- **THEN** `sources` NO incluye `src/a.js`
- **AND** `sources` conserva `src/ab.js` y `src/nested/a.js`
- **AND** el comando no lanza y su exit code es 0

#### Scenario: `**` intermedio cruza cero o más segmentos

- **WHEN** `discovery.exclude` contiene `dist/**/x.js` y el árbol tiene `dist/x.js` y
  `dist/a/b/x.js`
- **THEN** `sources` NO incluye ninguna de esas dos rutas
- **AND** `sources` conserva `src/x.js`

#### Scenario: Un commit test-only no produce el área `test` con un estado regenerado

- **WHEN** el estado persistido se generó después de este cambio y el único cambio del repositorio
  es agregar `test/new-case.test.js`
- **THEN** `discovery --check` reporta `state: READY`, `impact: none` y `recommendedAction:
  continue`
- **AND** `changedAreas` y `materialReasons` están vacíos
- **AND** `changedAreas` NO contiene `test`

#### Scenario: Un estado previo al cambio queda `STALE`/`minor` una sola vez

- **WHEN** el estado persistido contiene en `sources` rutas que este cambio ahora excluye, el área
  de esas rutas sigue teniendo al menos una ruta incluida en el árbol actual, y se ejecuta
  `discovery --check` una vez
- **THEN** la salida reporta `state: STALE` e `impact: minor`
- **AND** `materialReasons` está vacío
- **AND** el estado persistido no se reescribe ni se migra, y tras regenerar el seed una corrida
  posterior reporta `state: READY`
