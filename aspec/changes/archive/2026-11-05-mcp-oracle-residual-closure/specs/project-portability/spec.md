# Spec delta: mcp-oracle-residual-closure — project-portability

## MODIFIED Requirements

### Requirement: Reparación in place sin bundle

`ancleto import --repair` SHALL regenerar las entradas MCP rotas del proyecto actual sin requerir
bundle. La salud de cada entrada SHALL decidirse con el único predicado de salud de comandos MCP,
compartido con `check` y con los caminos que reparan o refrescan la configuración MCP del proyecto.

Una entrada SHALL considerarse rota cuando:

- `command` está ausente, no es un arreglo, o es un arreglo vacío;
- su primer elemento no es un string no vacío;
- su primer elemento es una ruta absoluta de la plataforma actual y esa ruta no existe.

Una entrada NO SHALL considerarse rota cuando su primer elemento es un nombre simple que no es una
ruta absoluta del host, aunque ese nombre no resuelva en `PATH`: el predicado NO SHALL ejecutar el
comando ni resolver `PATH` con procesos externos. Una entrada con una ruta absoluta existente,
incluida una ruta de Windows con letra de unidad (`C:\nvm4w\nodejs\node.exe`, `c:/...`), SHALL
considerarse sana.

La reparación SHALL limitarse a las entradas rotas: las entradas sanas NO SHALL reescribirse ni
alterarse. El exit code de `import --repair` NO SHALL cambiar por este predicado.

Una configuración MCP no parseable NO SHALL reclasificarse aquí: su tratamiento vigente es el de la
decisión `m2-nonparseable-config-warn-only` (aviso que nombra el archivo y reemplazo por la
configuración nueva), sin reparación por entrada.

#### Scenario: Import con repair

- **WHEN** se ejecuta `ancleto import --repair` y una entrada MCP tiene un `command` roto según el
  predicado
- **THEN** sólo esa entrada se regenera y las entradas sanas permanecen intactas

#### Scenario: `command` ausente o vacío es roto

- **WHEN** una entrada MCP no declara `command`, lo declara como arreglo vacío, o su primer elemento
  no es un string no vacío
- **THEN** el predicado SHALL considerar la entrada rota
- **AND** `import --repair` SHALL poder regenerarla cuando exista una definición nueva

#### Scenario: Un nombre simple que no resuelve en PATH es sano

- **WHEN** el primer elemento de `command` es un nombre simple que no es una ruta absoluta del host,
  por ejemplo `custom-mcp`, y ese nombre no resuelve en `PATH`
- **THEN** el predicado NO SHALL considerar la entrada rota
- **AND** `import --repair` NO SHALL reescribir esa entrada
- **AND** el predicado NO SHALL ejecutar el comando ni resolver `PATH` para decidirlo

#### Scenario: Una ruta absoluta inexistente es rota

- **WHEN** el primer elemento de `command` es una ruta absoluta de la plataforma actual y el archivo
  no existe
- **THEN** el predicado SHALL considerar la entrada rota
- **AND** `import --repair` SHALL poder regenerarla cuando exista una definición nueva

#### Scenario: Una ruta absoluta existente es sana

- **WHEN** el primer elemento de `command` es una ruta absoluta de la plataforma actual y el archivo
  existe
- **THEN** el predicado NO SHALL considerar la entrada rota
- **AND** `import --repair` NO SHALL reescribir esa entrada

#### Scenario: Una config MCP no parseable no se reclasifica aquí

- **WHEN** la configuración MCP del proyecto existe y no es JSON parseable
- **THEN** el predicado de salud por entrada NO SHALL aplicarse ni reclasificar el archivo
- **AND** se conserva el tratamiento de `m2-nonparseable-config-warn-only`: aviso que nombra el
  archivo y reemplazo por la configuración MCP nueva
- **AND** el exit code de `import --repair` no cambia por este aviso
