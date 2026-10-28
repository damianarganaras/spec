# Spec delta: memory-ops

## ADDED Requirements

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
