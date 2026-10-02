# Spec delta: memory-ops

## ADDED Requirements

### Requirement: Export de nodos activos a JSON

El sistema SHALL exponer un método `exportActive()` en el engine de memoria que devuelva un
array de nodos activos (rules y decisions) en formato JSON. Cada nodo SHALL incluir los
campos `memory_key`, `type`, `content`, `justification`, `scope`, `createdAt`. Los nodos con
`status='superseded'` NO SHALL incluirse en el export. Antes de escribir, el sistema SHALL
sanitizar los campos `content` y `justification` reemplazando paths absolutos (patrones
Windows `X:\...` y Unix `/home/...`, `/Users/...`) con `<redacted>`.

#### Scenario: Export de nodos activos

- **WHEN** se invoca `exportActive()` sobre una BD con 2 nodos activos y 1 superseded
- **THEN** el resultado es un array de 2 elementos
- **AND** cada elemento tiene los campos `memory_key`, `type`, `content`, `justification`,
  `scope`, `createdAt`
- **AND** el nodo superseded no está incluido

#### Scenario: Sanitización de paths absolutos

- **WHEN** un nodo activo tiene en `content` un path absoluto como `C:\Users\damia\repo`
- **THEN** el export reemplaza ese path con `<redacted>`

### Requirement: Comando CLI `ancleto memory export`

El sistema SHALL exponer el subcomando `ancleto memory export [--out <file>]` que invoca
`exportActive()` y escribe el resultado. Si `--out` no se especifica, la salida SHALL ir a
`stdout`. Si se especifica, SHALL escribirse al archivo indicado.

#### Scenario: Export a stdout

- **WHEN** se ejecuta `ancleto memory export` sin `--out`
- **THEN** el JSON se imprime en `stdout`

#### Scenario: Export a archivo

- **WHEN** se ejecuta `ancleto memory export --out backup.json`
- **THEN** el archivo `backup.json` contiene el JSON de nodos activos

### Requirement: Import de nodos desde JSON con upsert por memory_key

El sistema SHALL exponer un método `importNodes(json)` en el engine que recibe un array de
nodos en el formato de export y los inserta o actualiza en la BD. Para cada entrada, el
sistema SHALL buscar un nodo existente por `memory_key`. Si no existe, SHALL insertarlo con
el `createdAt` del JSON. Si existe y tiene `status='active'`, SHALL comparar `createdAt`: si
el del JSON es más reciente, SHALL superseder el existente; si el existente es más reciente o
igual, SHALL dejarlo sin cambios (idempotencia). Si existe y tiene `status='superseded'`,
SHALL saltarlo sin modificarlo (los nodos superseded son historial y NO SHALL ser
reactivados por el import). El sistema SHALL validar que cada entrada tenga los campos
requeridos antes de procesar; si alguna falla, SHALL abortar todo el import (transacción) y
reportar el error.

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

### Requirement: Comando CLI `ancleto memory import`

El sistema SHALL exponer el subcomando `ancleto memory import <file>` que lee el archivo JSON,
invoca `importNodes(json)`, y reporta un resumen (cantidad de nodos insertados, actualizados,
omitiidos).

#### Scenario: Import exitoso

- **WHEN** se ejecuta `ancleto memory import backup.json`
- **THEN** se reporta la cantidad de nodos insertados, actualizados y omitidos

### Requirement: Garbage collection de nodos superseded

El sistema SHALL exponer un método `gcSuperseded(opts)` en el engine que purga nodos con
`status='superseded'` y antigüedad mayor al umbral (default 30 días). La antigüedad SHALL
medirse usando `created_at` como proxy de la edad del nodo (la columna `superseded_at` no
existe en el schema y los cambios de schema están fuera de scope). El umbral SHALL ser
configurable vía `opts.days`. Después del purge, el sistema SHALL ejecutar `VACUUM` y
`REINDEX` post-commit (SQLite no permite VACUUM dentro de una transacción). Los nodos con
`status='active'` NO SHALL ser afectados bajo ninguna condición.

#### Scenario: GC purga solo superseded antiguos

- **WHEN** hay 2 nodos superseded, uno con `created_at` de hace 40 días y otro de hace
  10 días
- **AND** se invoca `gcSuperseded({ days: 30 })`
- **THEN** solo el nodo de 40 días es purgado
- **AND** el nodo de 10 días permanece

#### Scenario: GC no toca nodos activos

- **WHEN** hay nodos activos y superseded
- **AND** se invoca `gcSuperseded({ days: 30 })`
- **THEN** todos los nodos activos permanecen intactos

#### Scenario: Dry-run reporta sin borrar

- **WHEN** se invoca `gcSuperseded({ days: 30, dryRun: true })`
- **THEN** se reporta la cantidad de nodos que serían purgados y el tamaño estimado a liberar
- **AND** ningún nodo es borrado

### Requirement: Comando CLI `ancleto memory gc`

El sistema SHALL exponer el subcomando `ancleto memory gc [--dry-run] [--days <n>]` que invoca
`gcSuperseded(opts)`. Sin `--dry-run`, SHALL ejecutar el purge + VACUUM + REINDEX y reportar
la cantidad de nodos purgados. Con `--dry-run`, SHALL solo reportar sin modificar la BD.

#### Scenario: GC con dry-run

- **WHEN** se ejecuta `ancleto memory gc --dry-run`
- **THEN** se reporta cuántos nodos serían purgados y el tamaño estimado
- **AND** la BD no se modifica

#### Scenario: GC sin dry-run

- **WHEN** se ejecuta `ancleto memory gc`
- **THEN** los nodos superseded antiguos son purgados
- **AND** se ejecuta VACUUM + REINDEX
- **AND** se reporta la cantidad de nodos purgados
