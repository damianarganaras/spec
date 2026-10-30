# Spec: memory-ops

## Purpose

Operaciones de portabilidad, diagnóstico y mantenimiento de la memoria del proyecto
(`.ancleto/memory.db`): snapshot consistente con historial, export e import de nodos activos
vía JSON, diagnóstico read-only (`doctor`), merge por supersesión y garbage collection de
nodos superseded. Expuestas como subcomandos del grupo `ancleto memory`.

## Requirements

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
omitidos).

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

### Requirement: Snapshot consistente de la base de memoria

El sistema SHALL exponer una función de snapshot en `src/core/memory/snapshot.js` que produzca una copia
consistente de la base de memoria usando `VACUUM INTO`. La implementación NO SHALL copiar el archivo `.db`
con mecanismos de copia de archivos mientras el WAL está activo. La copia SHALL incluir el historial
completo: los nodos con `status='superseded'` y su columna `superseded_by` SHALL estar presentes, por lo
que el snapshot NO SHALL limitarse a los nodos activos que devuelve `memory export`.

La función SHALL rechazar, sin escribir nada, cuando la ruta resuelta del destino es igual a la de la
fuente. SHALL rechazar sobrescribir un archivo existente salvo que el llamador pida la sobrescritura de
forma explícita. Cuando el destino no existe, SHALL crear el archivo en la ruta indicada. La operación NO
SHALL migrar el esquema de la fuente ni ejecutar checkpoint sobre ella.

El comando de copia NO SHALL construir el SQL de `VACUUM INTO` por concatenación insegura de la ruta. La
ruta del destino SHALL pasarse como parámetro vinculado o, si el motor no lo permite, escaparse duplicando
las comillas simples y delimitándola con comillas simples. Una ruta válida que contenga `'` SHALL funcionar.

#### Scenario: Copia con historial

- **WHEN** la fuente tiene un nodo activo y un nodo superseded cuyo `superseded_by` apunta al activo
- **THEN** el snapshot restaurado contiene ambos nodos
- **AND** el nodo superseded conserva el mismo `superseded_by`

#### Scenario: Restauración reproducible desde snapshot (T18)

- **WHEN** se crea un snapshot y se abre como base nueva
- **THEN** las `memory_key` activas son las mismas que en la fuente
- **AND** los `superseded_by` son los mismos que en la fuente
- **AND** las consultas golden ejecutables devuelven el mismo resultado que contra la fuente

#### Scenario: Destino igual a la fuente

- **WHEN** la ruta resuelta del destino es igual a la de la fuente
- **THEN** la operación falla con un mensaje que nombra el conflicto
- **AND** no se escribe ni se borra ningún archivo

#### Scenario: Destino existente sin pedido explícito

- **WHEN** el destino ya existe y no se pidió sobrescritura explícita
- **THEN** la operación falla con un mensaje que nombra la ruta
- **AND** el archivo existente queda intacto

#### Scenario: Sobrescritura explícita

- **WHEN** el destino ya existe y se pidió sobrescritura explícita
- **THEN** el destino se reemplaza por el snapshot
- **AND** el resultado es una base SQLite válida con el contenido de la fuente

#### Scenario: Destino con apóstrofo en el nombre

- **WHEN** se crea un snapshot cuyo destino es una ruta válida que contiene `'`
- **THEN** el snapshot se crea en esa ruta
- **AND** el archivo resultante es una base SQLite válida con el contenido de la fuente

### Requirement: Comando CLI `ancleto memory snapshot`

El sistema SHALL exponer el subcomando `ancleto memory snapshot --out <archivo.db>` dentro de la familia
existente `memory`, junto a `context`, `list`, `doctor`, `export`, `import` y `gc`. El subcomando SHALL
aceptar `--force` para la sobrescritura explícita y `--json` para la salida estructurada. SHALL ser un
wrapper fino sobre la función de snapshot: NO SHALL introducir tablas nuevas, agentes nuevos ni cambiar
la semántica de `memory export`.

Sin `--json`, el comando SHALL imprimir un resumen legible que incluya la ruta del snapshot y su tamaño.
Con `--json`, SHALL imprimir un objeto JSON parseable que incluya al menos `out` y `bytes`. Ante falta de
`--out`, fuente inexistente, destino igual a la fuente o destino existente sin `--force`, el comando
SHALL salir con código distinto de `0` y un mensaje que nombre el motivo.

#### Scenario: Snapshot a archivo con resumen legible

- **WHEN** se ejecuta `ancleto memory snapshot --out backup.db` sobre un repo con memoria
- **THEN** `backup.db` contiene una base SQLite con el contenido y el historial de la fuente
- **AND** la salida nombra la ruta y el tamaño del archivo creado

#### Scenario: Snapshot con `--json`

- **WHEN** se ejecuta `ancleto memory snapshot --out backup.db --json`
- **THEN** la salida es un objeto JSON parseable
- **AND** incluye las claves `out` y `bytes`

#### Scenario: Falta `--out`

- **WHEN** se ejecuta `ancleto memory snapshot` sin `--out`
- **THEN** el comando sale con código distinto de `0`
- **AND** el mensaje muestra el uso correcto

### Requirement: `memory doctor` estrictamente read-only

`memory doctor` SHALL abrir la base con `{ migrate: false, readonly: true }` en su modo por defecto y NO
SHALL ejecutar checkpoint, DDL, `INSERT` sobre `memory_fts`, reconstrucción de FTS ni ningún pragma
mutante. El modo por defecto NO SHALL escribir datos: el contenido de `db` y de `-wal` NO SHALL cambiar.

La apertura read-only que hace SQLite PUEDE materializar `-shm` y un `-wal` de 0 bytes cuando no existían,
porque el acceso WAL en read-only requiere el índice de memoria compartida. Esa materialización NO SHALL
reportarse como falla de `doctor`, NO SHALL alterar el contenido de la base y SHALL quedar verificada por
test. Ningún nodo SHALL crearse, modificarse ni borrarse por esa materialización.

El reporte SHALL conservar la forma `{ checks: [{ name, ok, detail }], healthy, rebuilt }`. `ok` SHALL
seguir siendo booleano y SHALL significar "no se detectó falla". Los cuatro checks SHALL mantenerse con
sus nombres actuales: `Integridad DB`, `Indice FTS5`, `Reglas activas (unicidad)` y `Checkpoint WAL`.

En modo por defecto, `Indice FTS5` SHALL intentar siempre una verificación **ejecutable** en read-only y
sólo SHALL reportarse `skipped` cuando la verificación no sea ejecutable por una limitación del esquema.
La cantidad de filas indexadas SHALL obtenerse de la tabla sombra de FTS5 (`memory_fts_docsize`), porque en
FTS5 external-content `count(*)` sobre la tabla FTS resuelve contra la tabla de contenido y siempre
coincide. Los tres resultados posibles SHALL ser:

1. `memory_fts` no existe (esquema incompleto) → `ok: false` y `detail` que diga que el índice FTS está
   ausente y que la búsqueda no funciona. NUNCA SHALL reportarse `skipped`: es una falla detectable en
   read-only.
2. `memory_fts` existe pero la tabla sombra no es consultable (p. ej. FTS creado con `columnsize=0`) →
   `ok: true`, `skipped: true` y `detail` con el motivo. NO SHALL bajar `healthy` ni cambiar el exit code.
3. La consulta funciona → comparar con `memory_nodes`: si coinciden, `ok: true` con ambas cantidades en el
   `detail`; si difieren, `ok: false` nombrando ambas cantidades e indicando que `--rebuild` repara.

El integrity-check completo de FTS5 (el `INSERT` de control) SHALL ejecutarse sólo con `--rebuild`; en modo
por defecto el `detail` SHALL aclarar que la integridad completa no es verificable en read-only.

El check `Checkpoint WAL` en modo por defecto SHALL reportarse `skipped: true` con `ok: true`, y su `detail`
SHALL incluir el estado observable del WAL: si el archivo `-wal` existe y cuántos bytes tiene. En modo por
defecto NO SHALL ejecutar checkpoint, `PRAGMA wal_checkpoint` ni ninguna operación que lo fuerce. Con
`--rebuild`, SHALL ejecutar el checkpoint y reportar su resultado.

`skipped` SHALL quedar reservado a los checks que no pueden ejecutarse en absoluto en el modo activo o por
una limitación del esquema. Un check omitido NO SHALL reportarse como consistente ni como inconsistente.
`healthy` SHALL ser `false` únicamente cuando algún check tenga `ok: false`; un check omitido NO SHALL
volver `healthy: false` ni cambiar el exit code.

#### Scenario: No-mutación sin WAL activo (T11)

- **WHEN** se ejecuta `memory doctor` sobre una fixture en `journal_mode=DELETE`, sin WAL activo
- **THEN** los bytes del archivo `.db` son idénticos antes y después
- **AND** no se crean archivos `-wal` ni `-shm` que no existieran antes

#### Scenario: No-mutación con WAL activo (T24)

- **WHEN** se ejecuta `memory doctor` sobre una fixture con `-wal` presente y frames sin checkpoint
- **THEN** los bytes del `.db` y del `-wal` son idénticos antes y después
- **AND** el tamaño del `-wal` no disminuye
- **AND** el `-shm` no se crea si no existía, no se trunca y su tamaño no cambia
- **AND** el read-mark del `-shm` puede cambiar y queda excluido de la igualdad byte a byte

La propiedad verificada por este scenario es "no hubo checkpoint ni escritura de datos", no "cero bytes
en los tres archivos".

#### Scenario: No-mutación con WAL frío

- **WHEN** la fixture está en modo WAL, cerrada limpia, sin `-wal` ni `-shm`
- **THEN** los bytes de `db` no cambian
- **AND** la base no gana ni pierde nodos
- **AND** pueden aparecer `-shm` y un `-wal` de 0 bytes, y eso no se reporta como falla
- **AND** el `detail` del check `Checkpoint WAL` indica si el `-wal` existe y su tamaño en bytes
- **AND** una segunda corrida no cambia ningún byte respecto de la primera

#### Scenario: Alineación FTS correcta

- **WHEN** se ejecuta `memory doctor` en modo read-only sobre una fixture consistente, con cada nodo
  indexado en `memory_fts`
- **THEN** el check `Indice FTS5` reporta `ok: true`
- **AND** `healthy` es `true`
- **AND** el check NO expone el campo `skipped`
- **AND** su `detail` incluye la cantidad de filas de `memory_fts_docsize` y la de `memory_nodes`

#### Scenario: Índice FTS ausente

- **WHEN** se ejecuta `memory doctor` en modo read-only sobre una fixture cuyo esquema no tiene `memory_fts`
- **THEN** el check `Indice FTS5` reporta `ok: false`
- **AND** NO expone el campo `skipped`
- **AND** su `detail` indica que el índice FTS está ausente y que la búsqueda no funciona
- **AND** `healthy` es `false` y el código de salida es distinto de `0`

#### Scenario: Tabla sombra no consultable

- **WHEN** se ejecuta `memory doctor` en modo read-only sobre una fixture cuyo `memory_fts` existe pero la
  tabla sombra no es consultable (p. ej. creado con `columnsize=0`)
- **THEN** el check `Indice FTS5` reporta `ok: true` y `skipped: true`
- **AND** su `detail` nombra el motivo de la omisión
- **AND** `healthy` es `true`, `rebuilt` es `false` y el código de salida es `0`

#### Scenario: Alineación FTS rota

- **WHEN** se remueve el trigger de indexación y se inserta un nodo que no queda indexado
- **THEN** el check `Indice FTS5` reporta `ok: false`
- **AND** `healthy` es `false` y el código de salida es distinto de `0`
- **AND** su `detail` nombra la cantidad de `memory_fts_docsize`, la de `memory_nodes` e indica que
  `--rebuild` repara

#### Scenario: Detección real de problemas sigue vigente

- **WHEN** `PRAGMA quick_check` no devuelve `ok` o existen dos nodos activos con la misma `memory_key`
- **THEN** el check correspondiente reporta `ok: false`
- **AND** `healthy` es `false`
- **AND** el código de salida es distinto de `0`

#### Scenario: Forma del reporte retrocompatible

- **WHEN** un consumidor lee el reporte de `memory doctor`
- **THEN** cada check expone `name`, `ok` y `detail`
- **AND** el reporte expone `checks`, `healthy` y `rebuilt`
- **AND** el estado omitido, cuando corresponde, se distingue por el campo opcional `skipped`, ausente en
  los checks verificados

### Requirement: Reparación explícita con `memory doctor --rebuild`

`memory doctor --rebuild` SHALL ser el único camino de `doctor` que escribe en la base. Al usarse, SHALL
abrir la base en modo escritura, reconstruir el índice FTS5, verificar su consistencia y reportar
`rebuilt: true`. Los cuatro checks SHALL quedar verificados en este modo, sin checks omitidos. En modo por
defecto, `rebuilt` NO SHALL ser `true` y el índice NO SHALL modificarse.

El sistema NO SHALL crear un comando `memory maintenance`.

#### Scenario: Reparación de un índice inconsistente

- **WHEN** el trigger de indexación fue removido y un nodo quedó sin indexar
- **THEN** el modo por defecto reporta el check `Indice FTS5` como `ok: false` por alineación rota, no como
  omitido
- **AND** `memory doctor --rebuild` deja `healthy: true`, `rebuilt: true` y el check FTS verificado
- **AND** una búsqueda posterior encuentra el nodo antes no indexado

#### Scenario: Modo por defecto no repara

- **WHEN** se ejecuta `memory doctor` sin `--rebuild`
- **THEN** el reporte devuelve `rebuilt: false`
- **AND** el índice FTS5 no se reconstruye

### Requirement: Merge de nodos por supersesión

El sistema SHALL exponer un método de merge en el engine que reciba `target`, `sources` y `dryRun`, y que
superseda cada source hacia el target sin crear nodos ni contenido nuevo.

El contrato SHALL ser:

- `target` SHALL ser la `memory_key` de un nodo activo existente. Si no existe, la operación SHALL fallar
  con un mensaje que nombre la `memory_key` y el motivo.
- Cada source SHALL ser la `memory_key` de un nodo activo, distinta del target y única dentro de la lista.
  Si alguna no existe, está superseded, es igual al target o está repetida, la operación SHALL fallar con
  un mensaje que nombre la `memory_key` y el motivo.
- El `type` del target y el de cada source SHALL ser idéntico. Si difiere, la operación SHALL fallar
  nombrando las `memory_key` involucradas y sus tipos, sin modificar ninguna fila.
- La corrida real SHALL marcar cada source con `status='superseded'` y
  `superseded_by=<id del nodo target>` en una sola transacción. Si una source deja de estar activa al
  momento de escribir, la transacción SHALL hacer rollback total.
- Con `dryRun`, la operación NO SHALL escribir nada en la base y SHALL reportar el plan: target, sources y
  cantidad de nodos que se supersederían.
- El nodo target SHALL permanecer activo y con su contenido sin cambios.
- El método SHALL operar únicamente sobre la base de datos y NO SHALL tener efectos sobre el filesystem. El
  refresco del bloque de contexto inyectado NO SHALL ser responsabilidad de este método.
- NO SHALL crearse tablas nuevas (`memory_refs` ni ninguna otra). La columna `superseded_by` ya existe y
  NO SHALL requerirse migración de schema; `superseded_at` NO SHALL agregarse.
- Ningún nodo cuya `memory_key` no esté en `sources` SHALL ser modificado; en particular
  `node-test-scope-explicit-paths` SHALL permanecer intacta en todo merge que no la nombre.

#### Scenario: Dry-run reporta sin escribir

- **WHEN** se invoca el merge con `dryRun` sobre un target activo y dos sources activas
- **THEN** el plan reporta el target, las dos sources y la cantidad a superseder
- **AND** ninguna de las tres filas cambia de estado ni de `superseded_by`

#### Scenario: Merge real crea el vínculo

- **WHEN** se ejecuta el merge sin `dryRun` sobre un target activo y dos sources activas
- **THEN** cada source queda con `status='superseded'`
- **AND** cada source queda con `superseded_by` igual al `id` del nodo target
- **AND** el target permanece activo y con el mismo contenido

#### Scenario: Target inexistente

- **WHEN** el target no corresponde a un nodo activo
- **THEN** la operación falla nombrando la `memory_key` del target y el motivo
- **AND** no se modifica ninguna fila

#### Scenario: Source inválida

- **WHEN** alguna source no existe, está superseded, coincide con el target o está repetida
- **THEN** la operación falla nombrando esa `memory_key` y el motivo
- **AND** ninguna otra source queda superseded

#### Scenario: Tipo incompatible

- **WHEN** el `type` del target difiere del `type` de alguna source
- **THEN** la operación falla nombrando las `memory_key` involucradas y sus tipos
- **AND** no se modifica ninguna fila

#### Scenario: Sin tabla nueva

- **WHEN** se ejecuta un merge real
- **THEN** el conjunto de objetos de `sqlite_master` es idéntico antes y después
- **AND** no se crea la tabla `memory_refs`

#### Scenario: Nodo no nombrado intacto

- **WHEN** se ejecuta un merge que no incluye `node-test-scope-explicit-paths` en `sources`
- **THEN** ese nodo conserva su `status` y su `superseded_by` sin cambios

### Requirement: Comando CLI `ancleto memory merge`

El sistema SHALL exponer el subcomando
`ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]`. `--sources` SHALL
aceptarse como lista separada por comas. `--target` y `--sources` SHALL ser obligatorios; si falta alguno,
el comando SHALL salir con código distinto de `0` y mostrar el uso.

Con `--dry-run`, el comando SHALL imprimir el plan y NO SHALL escribir ni la base ni el bloque de contexto
derivado. Sin `--dry-run`, SHALL imprimir un resumen con la cantidad de nodos superseded y SHALL refrescar
el bloque de contexto. Ante cualquier rechazo del contrato de merge, SHALL salir con código distinto de `0`
y un mensaje que nombre la `memory_key` y el motivo.

El subcomando SHALL aceptar `--json`. Con `--json`, SHALL imprimir un objeto JSON parseable con al menos
`dryRun`, `target`, `sources` y `superseded`; sin `--json`, el resumen legible se mantiene.

El refresco del bloque es responsabilidad de este subcomando, igual que en `import`, `gc` y `recordNode`;
NO SHALL atribuirse al método de merge del engine. Tras una corrida real, el subcomando SHALL refrescar
`.ancleto/working-context.md` con el mismo render que usa el refresh on-write existente
(`renderWorkingContextBlock` / `refreshWorkingContextOnWrite`), sin un camino de render paralelo. Las
`memory_key` superseded NO SHALL seguir apareciendo como reglas activas en el bloque; el target SHALL
seguir apareciendo cuando es una regla del scope inyectado.

El destino del refresco SHALL derivarse del directorio de la base resuelta
(`resolveMemoryProjectRoot(dbPath)`), NO de `process.cwd()`: en producción ambas rutas coinciden, y en
fixtures (`tmpdir`) la derivación mantiene el aislamiento y NO SHALL escribir en el `.ancleto/` del
repositorio.

#### Scenario: Dry-run por CLI

- **WHEN** se ejecuta `ancleto memory merge --dry-run --target k-target --sources k-1,k-2`
- **THEN** la salida reporta el target, las dos sources y cuántos nodos se supersederían
- **AND** la base no se modifica

#### Scenario: Salida JSON en dry-run

- **WHEN** se ejecuta `ancleto memory merge --dry-run --target k-target --sources k-1,k-2 --json`
- **THEN** la salida es un objeto JSON parseable
- **AND** incluye `dryRun: true`, `target`, `sources` y `superseded`
- **AND** la base no se modifica

#### Scenario: Corrida real por CLI refresca el bloque

- **WHEN** se ejecuta `ancleto memory merge --target k-target --sources k-1,k-2` sin `--dry-run` sobre una
  fixture en `tmpdir`
- **THEN** el bloque de contexto se reescribe bajo el directorio de la base
- **AND** el `.ancleto/` del repositorio permanece sin cambios

#### Scenario: Merge refresca el bloque inyectado

- **WHEN** se ejecuta un merge real sobre un target activo de tipo `rule` y dos sources activas de tipo
  `rule` del scope inyectado, sobre una fixture en `tmpdir` cuyo bloque ya incluye las sources
- **THEN** `.ancleto/working-context.md` bajo el directorio de la base ya no lista las `memory_key` de las
  sources como reglas activas
- **AND** el bloque sigue listando la `memory_key` del target
- **AND** no se escribe en el `.ancleto/` del repositorio

#### Scenario: Dry-run por CLI no escribe el bloque

- **WHEN** se ejecuta `ancleto memory merge --dry-run --target k-target --sources k-1,k-2`
- **THEN** el archivo del bloque de contexto queda idéntico a como estaba antes

#### Scenario: Falta un flag obligatorio

- **WHEN** se ejecuta `ancleto memory merge` sin `--target` o sin `--sources`
- **THEN** el comando sale con código distinto de `0`
- **AND** el mensaje muestra el uso correcto

#### Scenario: Rechazo nombrando la key

- **WHEN** se ejecuta `ancleto memory merge --target k-inexistente --sources k-1`
- **THEN** el comando sale con código distinto de `0`
- **AND** el mensaje nombra `k-inexistente` y el motivo del rechazo

### Requirement: Harness de regresión golden M01–M10

El harness SHALL versionar `test/fixtures/memory/golden.json` con exactamente diez entradas `M01`–`M10`.
Cada entrada SHALL declarar `id`, `query`, `status` (`active` o `deferred`) y `expected` cuando está
activa; una entrada `deferred` SHALL declarar además un `blocker` no vacío que nombre el tramo o runbook
que la habilitará.

El harness SHALL evaluar siempre contra una base fixture congelada, sembrada desde
`test/fixtures/memory/seed.json` con el formato que produce `exportActive()` y con el `importNodes`
existente. NO SHALL leer `.ancleto/memory.db` viva y NO SHALL introducir un loader nuevo.

En PR-1 SHALL haber exactamente dos entradas activas: `M01` (la regla del test runner vendorizado aparece
en el top-3 de resultados) y `M07` (una fuente inexistente no produce referencia inventada y la consulta
se abstiene). Las ocho restantes SHALL estar `deferred` con su blocker nombrado: `M02` → runbook MEM-01;
`M03` → PR-3 (backfill de las cinco decisiones únicas); `M04`, `M05`, `M06` → MEM-04 (resolver de refs
`spec:` / `change:`); `M08`, `M09` → PR-2/PR-3; `M10` → MEM-06 (P2).

El test SHALL fallar si una entrada `deferred` no declara blocker, si el conjunto de entradas diferidas
difiere de la allowlist explícita declarada en el test, o si una entrada activa no produce su `expected`.
NO SHALL existir skip silencioso.

#### Scenario: M01 recupera la regla del test runner

- **WHEN** el harness evalúa `M01` contra la fixture congelada
- **THEN** el resultado incluye en el top-3 la regla del test runner vendorizado

#### Scenario: M07 se abstiene ante una fuente inexistente

- **WHEN** el harness evalúa `M07` contra la fixture congelada
- **THEN** el resultado es el esperado por la entrada
- **AND** no se fabrica ninguna referencia a una fuente inexistente

#### Scenario: Allowlist de diferidas

- **WHEN** el conjunto de entradas `deferred` difiere de la allowlist explícita del test
- **THEN** el test falla

#### Scenario: Diferida sin blocker

- **WHEN** una entrada `deferred` no declara `blocker`
- **THEN** el test falla nombrando la entrada

### Requirement: Promoción al archivar sólo de decisiones duraderas aprobadas

Al archivar un change, el rol que archiva SHALL promover a `.ancleto/memory.db` exclusivamente las
decisiones duraderas declaradas en `proposal ## Decisiones`, aplicando un gate determinístico antes
de cualquier escritura. El shape de `## Decisiones` SHALL referenciarse desde
`agents/spec-writer.md`, no re-enunciarse en la superficie de archive.

Un bloque es candidato sólo si tiene `memory_key` propia y `Estado: aprobado`. La forma de una línea
—decisión, alternativa descartada, por qué y fuente— NO SHALL ser promovible: no tiene `memory_key`
ni `Estado`. Sólo se promueven decisiones: una `rule` NO SHALL promoverse desde `## Decisiones`. La
`memory_key` SHALL ser la declarada en el bloque; el rol que archiva NO SHALL inventar ni derivar una
clave a partir del change.

El gate SHALL validar el lote completo antes de la primera escritura: claves propias, claves únicas
dentro del lote, `Estado: aprobado`, refs presentes y resolubles, y ausencia de candidatos de sesión
(transcripción, estado transitorio de tareas, resumen de sesión). Cualquier violación SHALL producir
cero escrituras y un reporte por bloque con su ubicación en el `proposal.md`; no SHALL existir
promoción parcial. Cuando dos bloques del lote comparten `memory_key` y difieren en contenido o refs,
el lote entero SHALL rechazarse reportando ambos bloques y su fuente.

Cero candidatos SHALL implicar cero escrituras de memoria y cero delegaciones a `@memory-keeper`: la
regla la aplica el rol que archiva y NO SHALL delegarse la decisión de "no hay nada" al agente de
memoria. Con candidatos válidos, la promoción SHALL escribir un nodo por decisión aprobada, con el
bloque `refs:` normalizado dentro de `content`. La explicación completa (Elección, Descartado,
Justificación y Refs) NO SHALL copiarse al nodo ni truncarse en el proposal: el nodo se limita a una
a tres oraciones y el artifact versionado conserva el detalle.

Si una escritura falla después de mover el change, el resultado SHALL reportarse como **archivado,
memoria pendiente**, nombrando la `memory_key` y el motivo, con instrucción de reintento. El sistema
NO SHALL reportar "archivado y memorizado" si sólo se archivó. Dos `memory_key` distintas que se
contradicen NO SHALL resolverse por similitud textual: SHALL reportarse con sus fuentes y remitirse a
resolución humana o a `memory merge` cuando sean duplicados.

#### Scenario: Promoción con decisiones duraderas crea nodos con refs

- **WHEN** el `proposal ## Decisiones` de un change tiene bloques con `memory_key` propia,
  `Estado: aprobado` y refs resolubles
- **THEN** al archivar se crea un nodo activo por decisión
- **AND** cada nodo contiene su bloque `refs:` normalizado en `content`
- **AND** la `memory_key` de cada nodo es la declarada en el bloque

#### Scenario: Decisión no duradera no produce nodo ni delegación

- **WHEN** el `proposal ## Decisiones` está ausente, vacío, o todos sus bloques carecen de
  `memory_key` propia o de `Estado: aprobado`
- **THEN** no se escribe ningún nodo
- **AND** no se delega `@memory-keeper`
- **AND** el resumen del archive informa que no hubo memorias promovidas

#### Scenario: La forma de una línea no se promueve

- **WHEN** una decisión está escrita en la forma `decisión | alternativa descartada | por qué | fuente`
- **THEN** no se selecciona como candidata
- **AND** no se inventa una `memory_key` para promoverla

#### Scenario: Una regla nunca se promueve desde `## Decisiones`

- **WHEN** un bloque de `## Decisiones` se clasifica como restricción permanente
- **THEN** no se escribe mediante `recordRule` desde el gate de promoción
- **AND** el resumen reporta que la promoción sólo admite decisiones

#### Scenario: Dos afirmaciones contradictorias no se publican ambas

- **WHEN** dos bloques del lote comparten `memory_key` y difieren en contenido o refs
- **THEN** el lote se rechaza completo sin escribir ningún nodo
- **AND** el reporte nombra ambas afirmaciones, sus refs y su ubicación en el proposal

#### Scenario: Fallo de promoción no se reporta como éxito

- **WHEN** el change ya se movió al archive y una escritura de memoria falla
- **THEN** el resultado se reporta como archivado con memoria pendiente
- **AND** se nombran la `memory_key` y el motivo
- **AND** no se afirma que el change quedó memorizado

#### Scenario: Un candidato de sesión no se guarda ni se inyecta

- **WHEN** el lote contiene una nota de sesión, un estado transitorio de tareas o un resumen de sesión
- **THEN** ese bloque no se selecciona como candidato
- **AND** si es lo único que hay, no se escribe ningún nodo ni se delega `@memory-keeper`
- **AND** su texto no aparece en el bloque `<ProjectMemoryRules>`

#### Scenario: Dos claves contradictorias se reportan sin publicar la nueva

- **WHEN** el gate identifica dos `memory_key` distintas que afirman posiciones contradictorias sobre
  el mismo tema
- **THEN** no se promueve la nueva afirmación
- **AND** el reporte nombra ambas `memory_key` con sus fuentes
- **AND** la resolución se remite a decisión humana o a `memory merge` si son duplicados

_No-testeable-por-construcción: que el rol que archiva no delegue a `@memory-keeper` con cero
candidatos y que el detector de contradicciones cross-key no elija por similitud son no-acciones y
juicios sin salida observable. Se anclan en el contrato de prompt de la skill; la parte determinística
—una sola activa por `memory_key` y rechazo del lote con clave repetida— se verifica en el engine._

### Requirement: Backfill de las decisiones históricas únicas

Las cinco decisiones únicas detectadas en `design.md` históricos SHALL quedar (i) versionadas en Git
con su explicación completa —Elección, Descartado, Justificación y Refs— antes de que el flujo
elimine `design.md`, y (ii) promovidas a memoria con refs resolubles. La explicación completa SHALL
vivir en el artifact versionado —el `## Decisiones` del change que ejecuta el backfill, archivado
junto con él—, porque el nodo de memoria se limita a una a tres oraciones. La migración NO SHALL ser
ciega: cada decisión SHALL declarar la evidencia `file:line` de su `design.md` de origen. Cuando el
`design.md` de origen no enuncie una alternativa descartada formal, el artifact SHALL declararlo como
gap en lugar de inventar una.

El backfill SHALL limitarse a esas cinco decisiones y a los nodos críticos que el equipo marque
explícitamente; NO SHALL migrar los nodos existentes sin refs. Las cinco `memory_key` SHALL ser
claves de dominio estables, sin prefijo de fecha ni identificador de change; el origen del backfill
SHALL preservarse como ref `change:<slug>` al archive histórico, nunca dentro de la clave.

#### Scenario: Las cinco decisiones son recuperables desde una sesión nueva

- **WHEN** se consulta la memoria por cada una de las cinco decisiones históricas
- **THEN** cada una se recupera como nodo activo
- **AND** su bloque `refs:` contiene una ref `change:` que resuelve al archive histórico
- **AND** cada `path:` declarado existe en el repositorio

#### Scenario: La explicación completa sobrevive

- **WHEN** se lee el `proposal ## Decisiones` archivado del change de backfill
- **THEN** cada una de las cinco decisiones conserva Elección, Descartado, Justificación y Refs
- **AND** la explicación no depende del nodo de memoria, que puede ser más corto

#### Scenario: Evidencia de origen declarada

- **WHEN** se revisa una de las cinco decisiones
- **THEN** su Justificación nombra el `design.md` de origen con su rango de líneas

#### Scenario: Sin backfill masivo

- **WHEN** se ejecuta el backfill
- **THEN** sólo se escriben las cinco decisiones únicas y los nodos críticos marcados
- **AND** los nodos existentes sin refs no se reescriben ni se cuentan como migrados
