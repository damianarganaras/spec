# Spec delta: mcp-host-write-routing — cli-diagnostics

## MODIFIED Requirements

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

### Requirement: Descubrimiento único de la config MCP del proyecto

`ancleto check`, `ancleto doctor`, `ancleto import`/`import --repair` y la lectura de `export` SHALL resolver la configuración MCP desde un dueño único de destinos por host, y NO SHALL inventar rutas literales por comando.

Para `opencode`, el par de nombres candidatos de la configuración MCP del proyecto SHALL seguir teniendo un único dueño de módulo (`PROJECT_MCP_CANDIDATES`), y la lectura SHALL resolver el primer archivo existente entre `.opencode/opencode.json` y `.opencode/opencode.jsonc`, en ese orden.

Para los demás hosts, el destino SHALL ser el archivo único que declare el descriptor de destinos MCP por host. El descriptor SHALL poseer el destino y el esquema; la constante de candidatos de `opencode` SHALL poseer sólo los nombres de archivo.

Las semánticas de selección SHALL ser intencionalmente distintas por consumidor:

- `check` resuelve todos los destinos declarados de los hosts instalados;
- `doctor` resuelve el destino del host activo y luego el de los hosts instalados, con fallback global sólo-opencode;
- `import`/`import --repair` resuelven el destino del host activo;
- `export` conserva su lectura sólo-opencode.

Para un mismo host y estado del proyecto, `check`, `doctor` e `import` SHALL resolver el mismo archivo. `export` NO SHALL cambiar su lectura sólo-opencode.

`doctor` SHALL conservar su fallback a la configuración global cuando no exista configuración de proyecto, sus textos (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`, `⚠ opencode.json no encontrado (config MCP)`) y su exit code (fatal sólo por Node < 24 o por fallo al importar `node:sqlite`). `export` e `import` SHALL conservar su contrato de lectura: la ruta resuelta y el contenido parseado, con contenido vacío cuando el archivo no parsea o no existe.

#### Scenario: Los comandos resuelven el mismo archivo para el mismo host

- **WHEN** el proyecto tiene `.opencode/opencode.jsonc` y no tiene `.opencode/opencode.json`, y el host es `opencode`
- **THEN** `check`, `doctor` y la lectura de `import` resuelven `.opencode/opencode.jsonc`
- **AND** ninguno resuelve un archivo distinto para ese host

#### Scenario: Los destinos cambian por host

- **WHEN** el proyecto tiene `.agents/mcp_config.json`, `.mcp.json` y `copilot-mcp.json`, y los hosts `antigravity`, `commandcode` y `copilot` figuran instalados
- **THEN** `check` resuelve cada uno de esos archivos para su host
- **AND** `doctor` valida el archivo del host activo primero y no mezcla los esquemas

#### Scenario: `export` conserva la lectura sólo-opencode

- **WHEN** el proyecto sólo tiene `copilot-mcp.json` y se ejecuta `ancleto export`
- **THEN** el manifiesto conserva la lectura de la configuración MCP de `opencode`
- **AND** NO SHALL incorporar `copilot-mcp.json` como intención MCP del bundle

#### Scenario: `doctor` conserva fallback y mensajes

- **WHEN** el proyecto no tiene ninguno de los archivos de proyecto y existe la configuración global de `opencode`, o no existe ninguna configuración
- **THEN** `doctor` conserva el fallback global y el mensaje `no encontrado` respectivamente
- **AND** el exit code no cambia por el estado de la configuración MCP
