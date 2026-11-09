# Spec delta: fix-discovery-seedmap-present — cli-diagnostics

## ADDED Requirements

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
