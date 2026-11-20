# Spec delta: memory-import-scope-string — memory-ops

## MODIFIED Requirements

### Requirement: Import de nodos desde JSON con upsert por memory_key

El sistema SHALL exponer un método `importNodes(json)` en el engine que recibe un array de
nodos en el formato de export y los inserta o actualiza en la BD. Para cada entrada, el
sistema SHALL buscar un nodo existente por `memory_key`. Si no existe, SHALL insertarlo con
el `createdAt` del JSON. Si existe y tiene `status='active'`, SHALL comparar `createdAt`: si
el del JSON es más reciente, SHALL superseder el existente; si el existente es más reciente o
igual, SHALL dejarlo sin cambios (idempotencia). Si existe y tiene `status='superseded'`,
SHALL saltarlo sin modificarlo (los nodos superseded son historial y NO SHALL ser
reactivados por el import).

**Validación de entrada.** El sistema SHALL validar cada entrada antes de procesar cualquiera;
si alguna falla, SHALL abortar todo el import (transacción) y reportar el error sin insertar ni
superseder ningún nodo. La validación SHALL exigir que los campos `memory_key`, `type`, `content`,
`scope` y `createdAt` estén presentes y no sean `null` ni el string vacío, que `type` sea `rule` o
`decision`, y que `createdAt` sea un string parseable como fecha. Además de estar presente,
`scope` SHALL ser un string cuyo `trim()` no sea vacío: un `scope` numérico, booleano, objeto o
array NO SHALL aceptarse, y un string compuesto sólo por espacios tampoco. Para esos casos, el
mensaje de error SHALL nombrar `entry[i].scope` —el índice de la entrada ofensora y el campo— e
indicar que se esperaba un string no vacío. La ausencia de `scope` —incluido `null` o el string
vacío— SHALL reportarse como campo obligatorio faltante. La misma validación SHALL regir
`importNodes` y la clasificación dry-run, de modo que un archivo inválido aborte entero en ambos
caminos, sin clasificación parcial y sin escritura.

**Vocabulario.** El sistema NO SHALL restringir `scope` a un vocabulario cerrado: cualquier string
con `trim()` no vacío SHALL aceptarse, igual que en `recordNode`. La validación SHALL ser de tipo y
no de dominio, y el valor aceptado SHALL persistirse tal cual, sin coerción.

#### Scenario: Import en BD vacía

- **WHEN** se invoca `importNodes(json)` sobre una BD vacía con 3 nodos
- **THEN** los 3 nodos quedan activos con el `createdAt` del JSON

#### Scenario: Import idempotente

- **WHEN** se invoca `importNodes(json)` dos veces con el mismo archivo
- **THEN** después del segundo import los nodos tienen el mismo `createdAt`, `content` y
  `justification` que después del primero

#### Scenario: Import con nodo más reciente supersede al existente

- **WHEN** existe un nodo activo con `memory_key='api-error-format'` y `createdAt=T1`
- **AND** se importa un nodo con `memory_key='api-error-format'` y `createdAt=T2` donde
  `T2 > T1`
- **THEN** el nodo original queda `superseded`
- **AND** el nuevo nodo queda activo con `createdAt=T2`

#### Scenario: Import con nodo más antiguo no sobrescribe

- **WHEN** existe un nodo activo con `memory_key='api-error-format'` y `createdAt=T2`
- **AND** se importa un nodo con `memory_key='api-error-format'` y `createdAt=T1` donde
  `T1 < T2`
- **THEN** el nodo existente permanece activo sin cambios

#### Scenario: Import saltea nodos superseded existentes

- **WHEN** existe un nodo con `memory_key='api-error-format'` y `status='superseded'`
- **AND** se importa un nodo con `memory_key='api-error-format'`
- **THEN** el nodo superseded permanece sin cambios (NO se reactiva)
- **AND** el import lo cuenta como `skipped`

#### Scenario: Import con entrada inválida aborta todo

- **WHEN** se invoca `importNodes(json)` con una entrada que no tiene `memory_key`
- **THEN** el import aborta sin insertar ningún nodo
- **AND** se reporta un error indicando el campo faltante

#### Scenario: Import con scope numérico aborta y nombra el campo

- **WHEN** se invoca `importNodes(json)` con una entrada en la posición `i` cuyo `scope` es el
  número `42`
- **THEN** el import aborta sin insertar ni superseder ningún nodo
- **AND** el error nombra `entry[i].scope`
- **AND** no se persiste ningún `scope` coercido a string

#### Scenario: Import con scope objeto o array aborta sin escribir

- **WHEN** se invoca `importNodes(json)` con una entrada cuyo `scope` es un objeto o un array
- **THEN** el import aborta antes de bindear o escribir
- **AND** el error nombra `entry[i].scope`
- **AND** la base queda sin cambios

#### Scenario: Import con scope de sólo espacios aborta

- **WHEN** se invoca `importNodes(json)` con una entrada cuyo `scope` es un string de espacios
- **THEN** el import aborta sin insertar ningún nodo
- **AND** el error nombra `entry[i].scope` e indica que se esperaba un string no vacío

#### Scenario: Import con scope null reporta campo obligatorio

- **WHEN** se invoca `importNodes(json)` con una entrada cuyo `scope` es `null`
- **THEN** el import aborta sin insertar ningún nodo
- **AND** el error reporta `scope` como campo obligatorio faltante

#### Scenario: Import acepta un scope string fuera del vocabulario de tres valores

- **WHEN** se invoca `importNodes(json)` con una entrada cuyo `scope` es un string no vacío distinto
  de `project`, `feature` y `task`, por ejemplo `global`
- **THEN** el import inserta el nodo
- **AND** el `scope` persistido es exactamente `global`

#### Scenario: Archivo inválido aborta igual en el import y en el dry-run

- **WHEN** el mismo archivo con un `scope` no-string se procesa primero con el dry-run y luego con
  `importNodes`
- **THEN** ambos caminos rechazan el archivo entero con el mismo mensaje que nombra `entry[i].scope`
- **AND** el dry-run no emite clasificación parcial
- **AND** la base queda sin cambios
