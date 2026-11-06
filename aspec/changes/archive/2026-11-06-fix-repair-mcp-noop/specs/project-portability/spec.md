# Spec delta: fix-repair-mcp-noop — project-portability

## MODIFIED Requirements

### Requirement: Reparación in place sin bundle

`ancleto import --repair` SHALL regenerar las entradas MCP rotas del proyecto actual sin requerir bundle, en el destino del host activo que declare el descriptor único de destino MCP por host. La salud de cada entrada SHALL decidirse con el único predicado de salud de comandos MCP, compartido con `check` y con los caminos que reparan o refrescan la configuración MCP del proyecto.

El destino NO SHALL ser fijo `.opencode/opencode.json`: para `opencode` SHALL ser `.opencode/opencode.json` o el `.opencode/opencode.jsonc` existente; para `antigravity`, `.agents/mcp_config.json`; para `commandcode`, `.mcp.json`; para `copilot`, `copilot-mcp.json`.

Cuando el host activo no declare destino (`claude`, `vscode`, `cursor`, `roo`), `import --repair` NO SHALL escribir ningún archivo MCP, NO SHALL crear `.opencode/opencode.json` y SHALL emitir como máximo un aviso no bloqueante que nombre el host, sin abortar.

Una entrada SHALL considerarse rota cuando:

- `command` está ausente, no es un arreglo, o es un arreglo vacío;
- su primer elemento no es un string no vacío;
- su primer elemento es una ruta absoluta de la plataforma actual y esa ruta no existe.

Una entrada NO SHALL considerarse rota cuando su primer elemento es un nombre simple que no es una ruta absoluta del host, aunque ese nombre no resuelva en `PATH`: el predicado NO SHALL ejecutar el comando ni resolver `PATH` con procesos externos. Una entrada con una ruta absoluta existente, incluida una ruta de Windows con letra de unidad (`C:\nvm4w\nodejs\node.exe`, `c:/...`), SHALL considerarse sana.

Para los esquemas `mcpServers` de `antigravity` y `commandcode`, la reparación SHALL normalizar la entrada `{ command: <string>, args: [...] }` a la forma canónica `{ command: [<string>, ...<args>] }` antes de aplicar el predicado.

La reparación SHALL limitarse a las entradas rotas: las entradas sanas NO SHALL reescribirse ni alterarse. El exit code de `import --repair` NO SHALL cambiar por este predicado.

La reparación SHALL escribir el destino sólo cuando exista al menos una de estas condiciones: el archivo no es JSON parseable, la estructura del documento requiere normalización, o hay al menos una entrada reparada o agregada. La invariante de no-escritura de un destino sano SHALL entenderse acotada a `import` / `import --repair` (`repairProjectMcp`): en ese camino un destino sano NO SHALL reescribirse y sus bytes y su fecha de modificación SHALL permanecer idénticos. Los writers `install` / `init` (`setupHostMcp` → `mergeMcp`) y `upgrade` (`refreshCopilotMcp` / `refreshCommandCodeMcp`) reescriben el mismo destino sin este predicado y quedan fuera de esta garantía. La creación del directorio del destino SHALL ocurrir únicamente como parte de una escritura efectiva.

La estructura SHALL requerir normalización cuando el documento raíz no sea un objeto JSON (`null`, arreglo, string, número o booleano), o cuando la clave de esquema del host esté presente con un valor que no sea un objeto JSON. En un documento de raíz objeto, una clave de esquema ausente NO SHALL agregarse sólo para normalizar: SHALL materializarse únicamente si la reparación agrega entradas. Una raíz no-objeto y una config no parseable sin bundle SHALL escribirse igualmente como la configuración estructural o vacía `{<schema>: {}}`, sin agregar entradas. Un destino inexistente sin entradas que reparar o agregar NO SHALL crearse, ni como archivo ni como directorio.

Una configuración MCP no parseable NO SHALL reclasificarse aquí: su tratamiento vigente es el de la decisión `m2-nonparseable-config-warn-only` (aviso que nombra el archivo y reemplazo por una configuración válida), sin reparación por entrada ni aborto. En `import --repair` sin bundle, el reemplazo SHALL ser la configuración vacía `{<schema>: {}}` del host activo; con bundle, SHALL ser la configuración derivada del bundle. Ese tratamiento SHALL aplicarse sólo a un destino declarado del host activo; un archivo MCP de otro host o de un host sin destino NO SHALL tocarse.

#### Scenario: Import con repair en `opencode`

- **WHEN** se ejecuta `ancleto import --repair` con host activo `opencode` y una entrada MCP del proyecto tiene un `command` roto según el predicado
- **THEN** sólo esa entrada se regenera y las entradas sanas permanecen intactas

#### Scenario: `import --repair` con `copilot` escribe su destino

- **WHEN** se ejecuta `ancleto import --repair` con host activo `copilot`
- **THEN** el CLI repara `copilot-mcp.json`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: `import --repair` con `claude` no crea `.opencode/opencode.json`

- **WHEN** se ejecuta `ancleto import --repair` con host activo `claude`
- **THEN** el CLI NO SHALL crear `.opencode/opencode.json`
- **AND** emite como máximo un aviso no bloqueante que nombra `claude`
- **AND** el comando no aborta

#### Scenario: `command` ausente o vacío es roto

- **WHEN** una entrada MCP no declara `command`, lo declara como arreglo vacío, o su primer elemento no es un string no vacío
- **THEN** el predicado SHALL considerar la entrada rota
- **AND** `import --repair` SHALL poder regenerarla cuando exista una definición nueva

#### Scenario: Un nombre simple que no resuelve en PATH es sano

- **WHEN** el primer elemento de `command` es un nombre simple que no es una ruta absoluta del host, por ejemplo `custom-mcp`, y ese nombre no resuelve en `PATH`
- **THEN** el predicado NO SHALL considerar la entrada rota
- **AND** `import --repair` NO SHALL reescribir esa entrada
- **AND** el predicado NO SHALL ejecutar el comando ni resolver `PATH` para decidirlo

#### Scenario: Una ruta absoluta inexistente es rota

- **WHEN** el primer elemento de `command` es una ruta absoluta de la plataforma actual y el archivo no existe
- **THEN** el predicado SHALL considerar la entrada rota
- **AND** `import --repair` SHALL poder regenerarla cuando exista una definición nueva

#### Scenario: Una ruta absoluta existente es sana

- **WHEN** el primer elemento de `command` es una ruta absoluta de la plataforma actual y el archivo existe
- **THEN** el predicado NO SHALL considerar la entrada rota
- **AND** `import --repair` NO SHALL reescribir esa entrada

#### Scenario: Una config MCP no parseable de otro host no se toca en un host sin destino

- **WHEN** existe un `.mcp.json` no parseable y el host activo es `claude`
- **THEN** `import --repair` NO SHALL sobrescribir `.mcp.json`
- **AND** NO SHALL crear `.opencode/opencode.json`
- **AND** el exit code de `import --repair` no cambia por ese archivo

#### Scenario: Repetir `import --repair` es idempotente

- **WHEN** se ejecuta dos veces `import --repair` sobre el mismo estado
- **THEN** el destino MCP conserva el mismo conjunto de entradas
- **AND** NO SHALL crearse archivos MCP nuevos por el host sin destino

#### Scenario: Import con repair

- **WHEN** se ejecuta `ancleto import --repair` y una entrada MCP tiene un `command` roto según el
  predicado
- **THEN** sólo esa entrada se regenera y las entradas sanas permanecen intactas

#### Scenario: Una config MCP no parseable no se reclasifica aquí

- **WHEN** la configuración MCP del proyecto existe y no es JSON parseable
- **THEN** el predicado de salud por entrada NO SHALL aplicarse ni reclasificar el archivo
- **AND** se conserva el tratamiento de `m2-nonparseable-config-warn-only`: aviso que nombra el
  archivo y reemplazo por la configuración MCP nueva
- **AND** el exit code de `import --repair` no cambia por este aviso

#### Scenario: Un destino sano no se reescribe

- **WHEN** el destino MCP del host activo existe y todas sus entradas son sanas según el predicado
- **THEN** `import --repair` NO SHALL escribir el archivo
- **AND** los bytes y la fecha de modificación del destino SHALL permanecer idénticos
- **AND** el mensaje de "MCP sanos" y el exit code no cambian

#### Scenario: Un destino inexistente sin entradas que reparar no se crea

- **WHEN** el destino MCP del host activo no existe y la reparación no tiene entradas que reparar ni agregar
- **THEN** `import --repair` NO SHALL crear el archivo de destino
- **AND** NO SHALL crear el directorio que lo contendría

#### Scenario: Un root no-objeto se reemplaza

- **WHEN** el destino MCP del host activo contiene un documento raíz que no es un objeto JSON (`null`, arreglo, string, número o booleano)
- **THEN** la reparación SHALL normalizar el documento a un objeto JSON en lugar de conservarlo
- **AND** el resto del tratamiento de entradas se aplica sobre ese objeto normalizado

#### Scenario: Un valor de schema no-objeto se reemplaza

- **WHEN** el destino MCP del host activo contiene la clave de esquema del host con un valor que no es un objeto JSON, por ejemplo `{"mcp": "x"}`
- **THEN** la reparación SHALL reemplazar ese valor por un objeto JSON
- **AND** el archivo SHALL escribirse aunque no haya entradas rotas

#### Scenario: Un schema ausente no se agrega

- **WHEN** el destino MCP del host activo es un objeto JSON sin la clave de esquema del host y no hay entradas que reparar ni agregar
- **THEN** la reparación NO SHALL agregar la clave de esquema vacía
- **AND** NO SHALL escribir el archivo
