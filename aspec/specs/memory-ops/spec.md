# Spec: memory-ops

## Purpose

Operaciones de portabilidad, diagnóstico y mantenimiento de la memoria del proyecto
(`.ancleto/memory.db`): snapshot consistente con historial, export e import de nodos activos
vía JSON, diagnóstico read-only (`doctor`), merge por supersesión, consolidación determinística
de duplicados exactos (`consolidate`), curaduría read-only de refs y duplicados exactos
(`curate`) y garbage collection de nodos superseded. Expuestas como subcomandos del grupo
`ancleto memory`.

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
`status='superseded'` y **antigüedad de supersesión** mayor al umbral (default 30 días). La
antigüedad SHALL medirse como `COALESCE(superseded_at, created_at)`, donde `superseded_at` es el
instante en que el nodo dejó de estar activo. `created_at` es la fecha de creación original del nodo
y NO SHALL usarse como medida principal de la edad de supersesión. La misma expresión de antigüedad
SHALL gobernar tanto el dry-run como el purge real, de modo que el conteo del dry-run coincida con
la cantidad de nodos efectivamente borrados para el mismo estado de la base. El umbral SHALL ser
configurable vía `opts.days`. Después del purge, el sistema SHALL ejecutar `VACUUM` y `REINDEX`
post-commit (SQLite no permite `VACUUM` dentro de una transacción). Los nodos con `status='active'`
NO SHALL ser afectados bajo ninguna condición.

**Comparación de instantes.** La elegibilidad SHALL resolverse como una comparación de instantes y
NO como una comparación de texto. Los tres statements de GC —selección para el dry-run, borrado y
desvinculación de `superseded_by`— SHALL comparar
`julianday(COALESCE(superseded_at, created_at)) < julianday(?)` contra el mismo valor de cutoff. La
evaluación NO SHALL depender de la representación textual persistida: dos escrituras del mismo
instante, con o sin milisegundos, SHALL compararse como el mismo instante. Un nodo cuyo instante es
igual o posterior al cutoff NO SHALL purgarse, aunque su texto ordene antes que el texto del cutoff
por la diferencia de milisegundos. El cutoff SHALL calcularse una sola vez por invocación y ese
único valor SHALL alimentar las tres sentencias, de modo que no exista una ventana en la que una fila
cruce el umbral entre la selección y el borrado.

**Fechas no parseables.** Una fila cuyo `COALESCE(superseded_at, created_at)` no pueda interpretarse
como instante SHALL ser RETENIDA. `julianday()` sobre un valor no parseable produce NULL, y esa fila
NO SHALL tratarse como elegible ni ser purgada, en dry-run ni en purge real: el sistema NUNCA SHALL
purgar por un valor que no puede interpretar.

**Estados fuera del alcance.** El valor `deleted` del CHECK de `status` es un estado RESERVADO que ningún camino de
escritura produce; `gc` SHALL ignorarlo en la selección, en el borrado y en el conteo, y NO SHALL
interpretarlo como `superseded` ni como candidato a purga. Este change NO SHALL agregar ni activar
escrituras de `status='deleted'`.

**Registro del instante.** Toda supersesión SHALL escribir `superseded_at` con el instante de la
operación, en el mismo statement que marca `status='superseded'` y `superseded_by`. El registro
SHALL aplicar a todas las rutas de supersesión del engine: `recordNode`, `importNodes`, `merge` y
`consolidate`. Ninguna ruta SHALL insertar un nodo sucesor con el único fin de registrar el
instante.

**Schema aditivo.** `memory_nodes` SHALL incorporar la columna `superseded_at TEXT`. Para una base
nueva, la columna SHALL declararse en la creación de la tabla. Para una base existente, la
migración SHALL ser aditiva y guardada: consultar `PRAGMA table_info(memory_nodes)` y ejecutar
`ALTER TABLE memory_nodes ADD COLUMN superseded_at TEXT` sólo si la columna falta. La migración NO
SHALL crear tablas, índices, triggers ni vistas: el conjunto de objetos de `sqlite_master` (nombre y
tipo) SHALL ser idéntico antes y después. El texto DDL de `memory_nodes` sí cambia por el `ALTER
TABLE`, y eso NO SHALL interpretarse como un objeto nuevo.

**Backfill.** Las filas existentes con `status='superseded'` y `superseded_at` NULL SHALL recibir
`superseded_at = created_at`. El backfill NO SHALL extender ni acortar la elegibilidad de las filas
históricas: un nodo que era elegible antes de la migración SHALL seguir siendo elegible con el mismo
umbral, y uno que no lo era SHALL seguir sin serlo. El cambio de semántica SHALL ser forward-looking.

**Preparación lazy.** Ningún statement que referencie `superseded_at` SHALL prepararse en el
constructor de `buildEngine`. El statement `supersede` —que escribe
`status='superseded', superseded_by, superseded_at`— SHALL prepararse de forma lazy y memoizada
mediante un helper interno (p. ej. `getSupersede()`), y ese helper SHALL ser la única vía usada por
`recordNode`, `importNodes`, `merge` y `consolidate`. Los statements de selección, borrado y
desvinculación de GC (`gcSelect`, `gcDelete` y `gcDetach`) SHALL prepararse dentro de la invocación
de `gcSuperseded`. El objetivo es que un engine read-only abierto con `migrate: false` sobre una base
previa a la columna no falle al construirse, de modo que `memory doctor` y `memory list` sigan
funcionando sobre esa base.

**Limitación de plan.** GC SHALL aceptarse como `SCAN memory_nodes`: el contrato vigente prohíbe
tablas, índices, triggers y vistas nuevos, así que GC NO SHALL agregar un índice para esta consulta.
La ausencia de índice NO SHALL justificar un cambio de semántica, un purge distinto ni un recorte de
los escenarios de este requirement. GC NO SHALL crear objetos de schema.

#### Scenario: GC mide la edad de supersesión, no la de creación

- **WHEN** hay dos nodos superseded: uno creado hace 40 días y superseded hace 2 días, y otro
  superseded hace 40 días
- **AND** se invoca `gcSuperseded({ days: 30 })`
- **THEN** sólo el nodo superseded hace 40 días es purgado
- **AND** el nodo superseded hace 2 días permanece, aunque su `created_at` sea anterior al umbral

#### Scenario: GC no toca nodos activos

- **WHEN** hay nodos activos y superseded
- **AND** se invoca `gcSuperseded({ days: 30 })`
- **THEN** todos los nodos activos permanecen intactos

#### Scenario: Dry-run coincide con el purge real

- **WHEN** coexisten nodos superseded que cumplen y que no cumplen el umbral
- **AND** se invoca `gcSuperseded({ days: 30, dryRun: true })` y luego `gcSuperseded({ days: 30 })`
  sobre el mismo estado
- **THEN** la cantidad reportada por el dry-run coincide con la cantidad de nodos borrados
- **AND** los nodos que sobreviven son exactamente los que no eran elegibles

#### Scenario: La supersesión registra el instante

- **WHEN** un nodo activo con `created_at` de hace 100 días es superseded por una escritura nueva
- **THEN** el nodo queda con `status='superseded'`, `superseded_by` del sucesor y `superseded_at`
  igual al instante de la operación
- **AND** `gcSuperseded({ days: 30 })` no lo purga

#### Scenario: Merge y consolidate registran el instante sin insertar sucesor

- **WHEN** `merge` o `consolidate --apply` supersede un nodo source cuya `created_at` es antigua
- **THEN** el source queda con `superseded_at` igual al instante de la operación
- **AND** no se inserta ningún nodo nuevo para registrar ese instante
- **AND** `gcSuperseded({ days: 30 })` no lo purga

#### Scenario: Migración aditiva sobre una base existente

- **WHEN** se abre una base creada antes de este change, sin la columna `superseded_at`
- **AND** se abre con migraciones habilitadas
- **THEN** `memory_nodes` incorpora la columna `superseded_at`
- **AND** el conjunto de objetos de `sqlite_master` no incorpora tablas, índices, triggers ni vistas

#### Scenario: Backfill preserva la elegibilidad histórica

- **WHEN** una base previa tiene un nodo `superseded` con `created_at` de hace 40 días y otro con
  `created_at` de hace 10 días
- **AND** se aplica la migración con backfill
- **THEN** ambos quedan con `superseded_at` igual a su `created_at`
- **AND** `gcSuperseded({ days: 30 })` purga sólo el de 40 días, igual que antes de la migración
- **AND** los nodos `active` conservan `superseded_at` NULL

#### Scenario: Engine read-only sobre una base previa no falla al construirse

- **WHEN** se construye un engine con `openDatabase(dbPath, { migrate: false, readonly: true })`
  sobre una base que no tiene la columna `superseded_at`
- **THEN** el engine se construye sin error
- **AND** la construcción no prepara ningún statement que referencie `superseded_at`
- **AND** las lecturas que no tocan GC siguen funcionando

#### Scenario: La frontera del segundo no purga antes de tiempo

- **WHEN** el cutoff de `gcSuperseded({ days })` cae en un segundo sin milisegundos y un nodo
  superseded tiene `superseded_at` en ese mismo segundo pero con milisegundos
- **THEN** el nodo NO es purgado, porque su instante no es anterior al cutoff
- **AND** el dry-run tampoco lo cuenta como elegible

#### Scenario: Formatos mixtos con y sin milisegundos se comparan como instantes

- **WHEN** dos nodos superseded representan el mismo instante anterior al cutoff, uno con
  `superseded_at` con milisegundos y otro sin ellos
- **AND** se invoca primero el dry-run y luego el purge real
- **THEN** ambos nodos son elegibles por igual según su instante
- **AND** el conjunto purgado coincide exactamente con el contado por el dry-run

#### Scenario: Una fecha no parseable se retiene

- **WHEN** un nodo superseded tiene un `superseded_at` no nulo que no puede interpretarse como
  instante
- **AND** se invoca `gcSuperseded({ days: 30, dryRun: true })` y luego `gcSuperseded({ days: 30 })`
- **THEN** el nodo no se cuenta como elegible en el dry-run
- **AND** el nodo no se purga, aunque su `created_at` sea muy anterior al cutoff

#### Scenario: `deleted` reservado no se purga ni se cuenta

- **WHEN** la base contiene una fila con `status='deleted'` y una antigüedad anterior al cutoff
- **AND** se invoca `gcSuperseded({ days: 30, dryRun: true })` y luego `gcSuperseded({ days: 30 })`
- **THEN** la fila no se cuenta como superseded en el dry-run
- **AND** la fila no se purga en el purge real
- **AND** la fila conserva su `status` y su `superseded_by`

#### Scenario: GC no crea objetos de schema

- **WHEN** se ejecuta `gcSuperseded({ days: 30 })` sobre una base con nodos elegibles
- **THEN** el conjunto de objetos de `sqlite_master` (nombre y tipo) es idéntico antes y después
- **AND** la semántica de elegibilidad aplicada es la de los escenarios anteriores

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
existente `memory`, junto a `context`, `list`, `doctor`, `export`, `import`, `gc`, `merge`,
`consolidate` y `curate`. El subcomando SHALL aceptar `--force` para la sobrescritura explícita y
`--json` para la salida estructurada. SHALL ser un wrapper fino sobre la función de snapshot: NO SHALL
introducir tablas nuevas, agentes nuevos ni cambiar la semántica de `memory export`.

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

`memory doctor` SHALL abrir la base con `{ migrate: false, readonly: true }` en su modo por
defecto y NO SHALL ejecutar checkpoint, DDL, `INSERT` sobre `memory_fts`, reconstrucción de FTS ni
ningún pragma mutante. El modo por defecto NO SHALL escribir datos: el contenido de `db` y de
`-wal` NO SHALL cambiar.

La apertura read-only que hace SQLite PUEDE materializar `-shm` y un `-wal` de 0 bytes cuando no
existían, porque el acceso WAL en read-only requiere el índice de memoria compartida. Esa
materialización NO SHALL reportarse como falla de `doctor`, NO SHALL alterar el contenido de la
base y SHALL quedar verificada por test. Ningún nodo SHALL crearse, modificarse ni borrarse por esa
materialización.

El reporte SHALL conservar la forma `{ checks: [{ name, ok, detail }], healthy, rebuilt }`. `ok`
SHALL seguir siendo booleano y SHALL significar "no se detectó falla". Los cinco checks SHALL
mantenerse con sus nombres actuales: `Integridad DB`, `Indice FTS5`, `Reglas activas (unicidad)`,
`Refs de nodos activos` y `Checkpoint WAL`.

El path temprano de esquema no inicializado SHALL reportar los cinco checks con `ok: false`; los
checks no ejecutables SHALL llevar `detail` `no verificable: esquema no inicializado`.

El comando `ancleto memory doctor` SHALL completar de forma determinista también sobre una base sin
esquema: tras reportar los cinco checks SHALL salir con código distinto de `0` sin lanzar una
excepción no capturada ni imprimir stack trace, y NO SHALL construir un engine read-only que
prepare statements contra `memory_nodes` cuando esa tabla no existe.

En modo por defecto, `Indice FTS5` SHALL intentar siempre una verificación **ejecutable** en
read-only y sólo SHALL reportarse `skipped` cuando la verificación no sea ejecutable por una
limitación del esquema. La cantidad de filas indexadas SHALL obtenerse de la tabla sombra de FTS5
(`memory_fts_docsize`), porque en FTS5 external-content `count(*)` sobre la tabla FTS resuelve
contra la tabla de contenido y siempre coincide. Los tres resultados posibles SHALL ser:

1. `memory_fts` no existe (esquema incompleto) → `ok: false` y `detail` que diga que el índice FTS
   está ausente y que la búsqueda no funciona. NUNCA SHALL reportarse `skipped`: es una falla
   detectable en read-only.
2. `memory_fts` existe pero la tabla sombra no es consultable (p. ej. FTS creado con
   `columnsize=0`) → `ok: true`, `skipped: true` y `detail` con el motivo. NO SHALL bajar `healthy`
   ni cambiar el exit code.
3. La consulta funciona → comparar con `memory_nodes`: si coinciden, `ok: true` con ambas
   cantidades en el `detail`; si difieren, `ok: false` nombrando ambas cantidades e indicando que
   `--rebuild` repara.

El integrity-check completo de FTS5 (el `INSERT` de control) SHALL ejecutarse sólo con `--rebuild`;
en modo por defecto el `detail` SHALL aclarar que la integridad completa no es verificable en
read-only.

El check `Checkpoint WAL` en modo por defecto SHALL reportarse `skipped: true` con `ok: true`, y su
`detail` SHALL incluir el estado observable del WAL: si el archivo `-wal` existe y cuántos bytes
tiene. En modo por defecto NO SHALL ejecutar checkpoint, `PRAGMA wal_checkpoint` ni ninguna
operación que lo fuerce. Con `--rebuild`, SHALL ejecutar el checkpoint y reportar su resultado.

`skipped` SHALL quedar reservado a los checks que no pueden ejecutarse en absoluto en el modo activo
o por una limitación del esquema. Un check omitido NO SHALL reportarse como consistente ni como
inconsistente. `healthy` SHALL ser `false` únicamente cuando algún check tenga `ok: false`; un check
omitido NO SHALL volver `healthy: false` ni cambiar el exit code.

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

La propiedad verificada por este scenario es "no hubo checkpoint ni escritura de datos", no "cero
bytes en los tres archivos".

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

- **WHEN** se ejecuta `memory doctor` en modo read-only sobre una fixture cuyo esquema no tiene
  `memory_fts`
- **THEN** el check `Indice FTS5` reporta `ok: false`
- **AND** NO expone el campo `skipped`
- **AND** su `detail` indica que el índice FTS está ausente y que la búsqueda no funciona
- **AND** `healthy` es `false` y el código de salida es distinto de `0`

#### Scenario: Tabla sombra no consultable

- **WHEN** se ejecuta `memory doctor` en modo read-only sobre una fixture cuyo `memory_fts` existe
  pero la tabla sombra no es consultable (p. ej. creado con `columnsize=0`)
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

- **WHEN** `PRAGMA quick_check` no devuelve `ok` o existen dos nodos activos con la misma
  `memory_key`
- **THEN** el check correspondiente reporta `ok: false`
- **AND** `healthy` es `false`
- **AND** el código de salida es distinto de `0`

#### Scenario: Forma del reporte retrocompatible

- **WHEN** un consumidor lee el reporte de `memory doctor`
- **THEN** cada check expone `name`, `ok` y `detail`
- **AND** el reporte expone `checks`, `healthy` y `rebuilt`
- **AND** el estado omitido, cuando corresponde, se distingue por el campo opcional `skipped`,
  ausente en los checks verificados

#### Scenario: El reporte incluye el check de refs

- **WHEN** un consumidor lee el reporte de `memory doctor` en modo por defecto
- **THEN** el reporte incluye el check `Refs de nodos activos` con `name`, `ok` y `detail`
- **AND** los checks se reportan en el orden `Integridad DB`, `Indice FTS5`,
  `Reglas activas (unicidad)`, `Refs de nodos activos` y `Checkpoint WAL`

#### Scenario: Base sin esquema completa sin excepción no capturada

- **WHEN** se ejecuta `ancleto memory doctor` sobre una base de 0 bytes o sin `memory_nodes`
- **THEN** el comando imprime los cinco checks con `ok: false`
- **AND** el comando termina sin lanzar una excepción no capturada ni imprimir stack trace
- **AND** el comando sale con código distinto de `0`

### Requirement: Reparación explícita con `memory doctor --rebuild`

`memory doctor --rebuild` SHALL ser el único camino de `doctor` que escribe en la base. Al usarse, SHALL
abrir la base en modo escritura, reconstruir el índice FTS5, verificar su consistencia y reportar
`rebuilt: true`. Los cinco checks SHALL quedar verificados en este modo, sin checks omitidos; la única
omisión admitida es `Refs de nodos activos` cuando la raíz del proyecto no se puede derivar y no hay
defecto detectable sin raíz (bloque `refs:` malformado o repetido), y esa omisión NO SHALL impedir que el
índice FTS5 se reconstruya ni que `rebuilt` sea `true`. En modo por defecto,
`rebuilt` NO SHALL ser `true` y el índice NO SHALL modificarse.

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

El sistema SHALL exponer un método de merge en el engine que reciba `target`, `sources`,
`dryRun`, `criticalKeys` y `forceCritical`, y que superseda cada source hacia el target sin crear
nodos ni contenido nuevo.

El contrato SHALL ser:

- `target` SHALL ser la `memory_key` de un nodo activo existente. Si no existe, la operación SHALL fallar
  con un mensaje que nombre la `memory_key` y el motivo.
- Cada source SHALL ser la `memory_key` de un nodo activo, distinta del target y única dentro de la lista.
  Si alguna no existe, está superseded, es igual al target o está repetida, la operación SHALL fallar con
  un mensaje que nombre la `memory_key` y el motivo.
- El `type` del target y el de cada source SHALL ser idéntico. Si difiere, la operación SHALL fallar
  nombrando las `memory_key` involucradas y sus tipos, sin modificar ninguna fila.
- La corrida real SHALL marcar cada source con `status='superseded'`,
  `superseded_by=<id del nodo target>` y `superseded_at=<instante de la operación>` en una sola
  transacción. Si una source deja de estar activa al momento de escribir, la transacción SHALL hacer
  rollback total.
- Con `dryRun`, la operación NO SHALL escribir nada en la base y SHALL reportar el plan: target, sources y
  cantidad de nodos que se supersederían.
- El nodo target SHALL permanecer activo y con su contenido sin cambios.
- El método SHALL operar únicamente sobre la base de datos y NO SHALL tener efectos sobre el filesystem. El
  refresco del bloque de contexto inyectado NO SHALL ser responsabilidad de este método.
- NO SHALL crearse tablas nuevas (`memory_refs` ni ninguna otra). La única estructura de schema
  admitida es la columna aditiva `superseded_at` de `memory_nodes`, cuyo contrato se fija en
  `Garbage collection de nodos superseded` y NO se re-enuncia acá. La operación NO SHALL crear
  objetos nuevos en `sqlite_master`.
- Ningún nodo cuya `memory_key` no esté en `sources` SHALL ser modificado; en particular
  `node-test-scope-explicit-paths` SHALL permanecer intacta en todo merge que no la nombre.
- El método NO SHALL leer `.ancletorc`: el conjunto de `memory_key` críticas SHALL llegar
  inyectado por el llamador. El riesgo SHALL ser la intersección entre ese conjunto y las
  `sources` que la corrida supersedería; una clave crítica que es el target NO SHALL contar como
  riesgo. El plan SHALL reportar `criticalAffected` con esas claves, ordenadas
  lexicográficamente de forma determinística y sin locale.
- Sin `dryRun`, si `criticalAffected` no está vacío y `forceCritical` no está activo, la
  operación SHALL fallar antes de escribir ninguna fila, con un error cuyo `code` sea
  `MEMORY_CRITICAL_KEY` y cuyo mensaje nombre cada `memory_key` afectada. La puerta SHALL evaluarse
  dentro de la transacción `BEGIN IMMEDIATE`; el conjunto de riesgo SHALL derivarse del plan
  calculado antes de abrirla y cada escritura SHALL revalidar por `id` que el nodo siga activo, de
  modo que un rechazo o una carrera deje cero filas del plan aplicadas sin verificar.
- Con `dryRun`, la operación NO SHALL bloquear por criticidad: SHALL reportar
  `criticalAffected` con el plan, aunque no esté vacío.

#### Scenario: Dry-run reporta sin escribir

- **WHEN** se invoca el merge con `dryRun` sobre un target activo y dos sources activas
- **THEN** el plan reporta el target, las dos sources y la cantidad a superseder
- **AND** ninguna de las tres filas cambia de estado ni de `superseded_by` ni de `superseded_at`

#### Scenario: Merge real crea el vínculo

- **WHEN** se ejecuta el merge sin `dryRun` sobre un target activo y dos sources activas
- **THEN** cada source queda con `status='superseded'`
- **AND** cada source queda con `superseded_by` igual al `id` del nodo target
- **AND** cada source queda con `superseded_at` igual al instante de la operación
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

#### Scenario: Dry-run reporta una source crítica sin bloquear

- **WHEN** se invoca el merge con `dryRun` y una source tiene una `memory_key` declarada en
  `criticalKeys`
- **THEN** el plan reporta esa `memory_key` en `criticalAffected`
- **AND** la operación no lanza por criticidad
- **AND** ninguna fila cambia de estado

#### Scenario: Merge real con source crítica rechaza sin escribir

- **WHEN** se invoca el merge real con una source crítica y sin `forceCritical`
- **THEN** la operación falla con `code` `MEMORY_CRITICAL_KEY`
- **AND** el mensaje nombra la `memory_key` afectada
- **AND** ninguna source queda superseded y el target permanece activo

#### Scenario: Autorización explícita aplica el merge

- **WHEN** se invoca el merge real con una source crítica y `forceCritical` activo
- **THEN** cada source queda superseded hacia el target como en un merge sin claves críticas
- **AND** el target permanece activo

#### Scenario: Sin claves críticas el comportamiento no cambia

- **WHEN** `criticalKeys` está ausente o vacío
- **THEN** `criticalAffected` es la lista vacía
- **AND** el merge real se comporta igual que antes de esta puerta, sin requerir autorización
  explícita

### Requirement: Comando CLI `ancleto memory merge`

El sistema SHALL exponer el subcomando
`ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--force-critical] [--json]`.
`--sources` SHALL
aceptarse como lista separada por comas. `--target` y `--sources` SHALL ser obligatorios; si falta alguno,
el comando SHALL salir con código distinto de `0` y mostrar el uso.

Con `--dry-run`, el comando SHALL imprimir el plan y NO SHALL escribir ni la base ni el bloque de contexto
derivado. Sin `--dry-run`, SHALL imprimir un resumen con la cantidad de nodos superseded y SHALL refrescar
el bloque de contexto. Ante cualquier rechazo del contrato de merge, SHALL salir con código distinto de `0`
y un mensaje que nombre la `memory_key` y el motivo.

El subcomando SHALL resolver el conjunto crítico con `readCriticalMemoryKeys` sobre la raíz del
proyecto derivada de la base (`resolveMemoryProjectRoot(dbPath)`) y SHALL inyectarlo en la
operación del engine. El plan SHALL incluir `criticalAffected`. Con `--dry-run`, el comando NO
SHALL bloquear por criticidad: SHALL reportar `criticalAffected` y salir con código `0` aun cuando
no esté vacío; `--force-critical` NO SHALL tener efecto en dry-run. Sin `--json`, el plan legible
SHALL nombrar las claves de `criticalAffected` cuando no esté vacío.

Sin `--dry-run`, si `criticalAffected` no está vacío y no se pasó `--force-critical`, el comando
SHALL salir con código `2` sin escribir la base ni refrescar el bloque. Con `--json` SHALL emitir
en stdout un objeto JSON parseable con `error: "critical-key-gate"` y `criticalAffected`; sin
`--json` SHALL escribir en stderr un mensaje que nombre cada clave afectada y mencione
`--force-critical`. Con `--force-critical`, el merge real SHALL aplicarse y SHALL conservar el
refresco post-escritura vigente. Cualquier otro rechazo del contrato de merge SHALL conservar el
código `1`.

El subcomando SHALL aceptar `--json`. Con `--json`, SHALL imprimir un objeto JSON parseable con al menos
`dryRun`, `target`, `sources`, `superseded` y `criticalAffected`; sin `--json`, el resumen legible se mantiene.

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
- **AND** incluye `dryRun: true`, `target`, `sources`, `superseded` y `criticalAffected`
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

#### Scenario: Dry-run por CLI reporta la crítica afectada sin bloquear

- **WHEN** se ejecuta `ancleto memory merge --dry-run --target k-target --sources k-src` y `k-src`
  está declarada en `memory.criticalKeys`
- **THEN** la salida incluye `k-src` en `criticalAffected`
- **AND** el comando sale con código `0`
- **AND** la base y el bloque de contexto no se modifican

#### Scenario: Merge real con source crítica rechaza con código 2

- **WHEN** se ejecuta `ancleto memory merge --target k-target --sources k-src` sin
  `--force-critical` y `k-src` está declarada crítica
- **THEN** el comando sale con código `2`
- **AND** con `--json`, stdout es un objeto JSON parseable con `error: "critical-key-gate"` y
  `criticalAffected`
- **AND** sin `--json`, stderr nombre `k-src` y mencione `--force-critical`
- **AND** ninguna source queda superseded
- **AND** el bloque de contexto no se reescribe

#### Scenario: `--force-critical` habilita el merge real

- **WHEN** se ejecuta el mismo merge real con `--force-critical`
- **THEN** cada source queda superseded hacia el target
- **AND** el comando refresca el bloque de contexto como una corrida real normal

#### Scenario: Sin claves críticas el comportamiento no cambia

- **WHEN** `memory.criticalKeys` está ausente, no es un array o es una lista vacía
- **THEN** `criticalAffected` es la lista vacía
- **AND** el dry-run y el merge real se comportan igual que antes de esta puerta, sin requerir
  `--force-critical`

### Requirement: Harness de regresión golden M01–M10

El harness SHALL versionar `test/fixtures/memory/golden.json` con exactamente diez entradas `M01`–`M10`.
Cada entrada SHALL declarar `id`, `query`, `status` (`active` o `deferred`) y `expected` cuando está
activa; una entrada `deferred` SHALL declarar además un `blocker` no vacío que nombre el tramo o runbook
que la habilitará.

El harness SHALL evaluar siempre contra una base fixture congelada, sembrada desde
`test/fixtures/memory/seed.json` con el formato que produce `exportActive()` y con el `importNodes`
existente. Para los casos que resuelven refs, la base SHALL sembrarse además desde
`test/fixtures/memory/golden-refs-seed.json`, con el mismo formato y el mismo `importNodes`. NO SHALL
leer `.ancleto/memory.db` viva y NO SHALL introducir un loader nuevo.

En este corte SHALL haber exactamente cinco entradas activas: `M01` (la regla del test runner
vendorizado aparece en el top-3 de resultados), `M04` (un nodo recuperado expone la ubicación de su
ref `spec:`), `M05` (un nodo recuperado expone la ubicación de su ref `change:`) y `M06` (un nodo
recuperado reporta la ambigüedad de su ref `change:` sin elegir), junto con `M07` (una fuente
inexistente no produce referencia inventada y la consulta se abstiene). Las cinco restantes SHALL
estar `deferred` con su blocker nombrado: `M02` → runbook MEM-01; `M03` → PR-3 (backfill de las cinco
decisiones únicas); `M08`, `M09` → PR-2/PR-3; `M10` → MEM-06 (P2).

`expected.mode` SHALL admitir `topK`, `abstain` y `refs`. El modo `refs` SHALL buscar por la `query`
de la entrada, exigir las `memory_keys` esperadas en el top-`k` y resolver las refs del nodo
recuperado contra el root versionado `test/fixtures/memory/refs-root/`; por cada ref esperada SHALL
comparar `path`, `heading` o `reason` según el caso. El harness NO SHALL omitir en silencio un modo
desconocido, una ref esperada ausente o una comparación sin resultado: cualquiera de esos casos SHALL
fallar el test.

El test SHALL fallar si una entrada `deferred` no declara blocker, si el conjunto de entradas diferidas
difiere de la allowlist explícita declarada en el test, o si una entrada activa no produce su `expected`.
NO SHALL existir skip silencioso.

#### Scenario: M01 recupera la regla del test runner

- **WHEN** el harness evalúa `M01` contra la fixture congelada
- **THEN** el resultado incluye en el top-3 la regla del test runner vendorizado

#### Scenario: M04 expone el path y el heading del spec

- **WHEN** el harness evalúa `M04` contra la fixture congelada y resuelve la ref contra `refs-root`
- **THEN** el nodo esperado aparece en el top-3
- **AND** la ref `spec:` devuelve el path `aspec/specs/prompt-contracts/spec.md` y el heading
  `Política de validaciones declarativa por proyecto`

#### Scenario: M05 expone el directorio del change archivado

- **WHEN** el harness evalúa `M05` contra la fixture congelada y resuelve la ref contra `refs-root`
- **THEN** el nodo esperado aparece en el top-3
- **AND** la ref `change:` devuelve el path
  `aspec/changes/archive/2026-10-28-reingenieria-memoria-first`

#### Scenario: M06 reporta ambigüedad sin elegir

- **WHEN** el harness evalúa `M06` contra la fixture congelada y resuelve la ref contra `refs-root`,
  donde dos archives declaran el mismo slug
- **THEN** el nodo esperado aparece en el top-3
- **AND** la ref `change:` devuelve `reason` `ambiguo (2 coincidencias)` y no devuelve `path`

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

La secuencia de archive SHALL ser: (1) merge/sync de specs cuando hay delta; (2) preflight del lote de
promoción, read-only y fail-closed; (3) promoción de los bloques aprobados; (4) move del directorio del
change a `aspec/changes/archive/YYYY-MM-DD-<slug>/` sin modificarlo; (5) summary/commit. La promoción
SHALL ejecutarse después del merge y antes del move. La secuencia SHALL quedar codificada en las
superficies canónicas de archive (`agents/orchestrator.md`, `agents/documenter.md`,
`skills/ancleto-archive/SKILL.md`, `skills/ancleto-bulk-archive/SKILL.md`,
`skills/ancleto-onboard/SKILL.md`), y la release SHALL regenerar los mirrors instalados con `ancleto
upgrade` antes de cerrar. Esta secuencia NO SHALL alterar la paralelización de Automatic Record: ésa es
memoria episódica, una superficie disjunta.

Si el preflight o la promoción fallan antes del move, el change NO SHALL moverse y NO SHALL quedar
ninguna escritura por una violación del gate; el resultado SHALL reportarse con el literal canónico
**no archivado; memoria pendiente**, nombrando la `memory_key` y el motivo, con instrucción de
reintento. Si el move falla después de una promoción exitosa, el resultado SHALL reportarse con el
literal canónico **memoria promovida; NO archivado**, con instrucción de reintento. Las superficies de
producto en inglés SHALL usar los equivalentes exactos `not archived; memory pending` y `memory
promoted; NOT archived` respectivamente, sin otras variantes. El resultado **archivado, memoria
pendiente** NO SHALL usarse: presume un move anterior a la promoción y ya no describe la secuencia. El
sistema NO SHALL reportar "archivado y memorizado" si sólo se archivó. Dos `memory_key` distintas que
se contradicen NO SHALL resolverse por similitud textual: SHALL reportarse con sus fuentes y remitirse
a resolución humana o a `memory merge` cuando sean duplicados.

_No-testeable-por-construcción: que el rol que archiva no delegue a `@memory-keeper` con cero
candidatos y que el detector de contradicciones cross-key no elija por similitud son no-acciones y
juicios sin salida observable. Se anclan en el contrato de prompt de la skill; la parte determinística
—una sola activa por `memory_key` y rechazo del lote con clave repetida— se verifica en el engine._

#### Scenario: Promoción con decisiones duraderas crea nodos con refs

- **WHEN** el `proposal ## Decisiones` de un change tiene bloques con `memory_key` propia, `Estado: aprobado` y refs resolubles
- **THEN** al archivar se crea un nodo activo por decisión
- **AND** cada nodo contiene su bloque `refs:` normalizado en `content`
- **AND** la `memory_key` de cada nodo es la declarada en el bloque

#### Scenario: Decisión no duradera no produce nodo ni delegación

- **WHEN** el `proposal ## Decisiones` está ausente, vacío, o todos sus bloques carecen de `memory_key` propia o de `Estado: aprobado`
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

#### Scenario: La promoción corre antes del move

- **WHEN** un change con decisiones aprobadas se archiva y tiene delta o no lo tiene
- **THEN** el merge/sync de specs se completa primero
- **AND** la promoción de las decisiones aprobadas se completa antes de mover el directorio
- **AND** el directorio se mueve a `aspec/changes/archive/YYYY-MM-DD-<slug>/` sin modificarse

#### Scenario: Fallo de preflight o de promoción antes del move

- **WHEN** el preflight del lote o la promoción falla antes de mover el change
- **THEN** el change no se mueve
- **AND** no queda ninguna escritura por una violación del gate
- **AND** el reporte usa el literal canónico `no archivado; memoria pendiente` (en superficies en inglés, `not archived; memory pending`) y nombra la `memory_key` y el motivo con reintento

#### Scenario: Fallo del move después de una promoción exitosa

- **WHEN** la promoción de las decisiones aprobadas se completa y el move del directorio falla
- **THEN** el reporte usa el literal canónico `memoria promovida; NO archivado` (en superficies en inglés, `memory promoted; NOT archived`) con instrucción de reintento
- **AND** no se reporta como archivado ni como "archivado, memoria pendiente"

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

### Requirement: Diagnóstico de refs no resueltas en nodos activos

El check `Refs de nodos activos` SHALL reportarse con la misma forma `{ name, ok, detail }` que los demás
checks y SHALL ejecutarse tanto en el modo por defecto como con `--rebuild`. El check NO SHALL escribir en
la base: SHALL limitarse a leer `aspec/specs/**/spec.md`, listar `aspec/changes/**` y usar
`existsSync`/`statSync`. NO SHALL ejecutar checkpoint, DDL, indexación de FTS ni pragma mutante.

El check SHALL revisar cada nodo con `status='active'` y, por cada ref de tipo `spec:`, `change:` o
`path:` declarada en su bloque `refs:`, determinar si resuelve. SHALL reutilizar el mismo parser, la misma
gramática y la misma resolución que el camino de escritura del engine; NO SHALL existir un segundo parser
ni un segundo resolvedor. `commit:` y `workitem:` NO SHALL verificarse en este corte: SHALL excluirse del
listado de rotas y su conteo aparte como no verificables SHALL agregarse sólo en el `detail` sin rotas,
nunca en el `detail` con rotas.

Un ref de un nodo activo que no resuelve SHALL ser una falla detectable: el check SHALL reportar
`ok: false`, `healthy` SHALL ser `false` y el comando SHALL salir con código distinto de `0`. El sistema
NO SHALL resolver la ambigüedad eligiendo una coincidencia: una ref con más de una coincidencia SHALL
reportarse como ambigua con la cantidad. El sistema NO SHALL abortar ante una ref rota: SHALL completar el
reporte con todas las rotas encontradas.

La omisión del check —reportar `ok: true` con `skipped: true` y el motivo— SHALL aplicar SÓLO cuando se
cumplen las tres condiciones a la vez: hay refs `spec:`, `change:` o `path:` que verificar, NO hay
defecto detectable sin raíz (bloque `refs:` malformado o repetido) y la raíz del proyecto no se puede
derivar. Esa omisión NO SHALL bajar `healthy` ni cambiar el exit code, y SHALL ser el único caso en que
el check usa `skipped`. Si hay un defecto detectable sin raíz, el check SHALL reportar `ok: false`
nombrando la `memory_key` y el motivo, aun sin raíz. Si no hay refs `spec:`, `change:` o `path:` que
verificar —base vacía, nodos sin bloque `refs:` o nodos con solo `commit:`/`workitem:`— el check NO
SHALL requerir la raíz del proyecto y NO SHALL reportarse `skipped`.

Sin refs NO SHALL ser falla. Una base con 0 refs verificables, o con nodos activos sin bloque `refs:`,
SHALL reportarse `ok: true` con un `detail` que diga `0 refs verificadas` y el conteo de nodos activos
revisados. Una base vacía NO SHALL reportarse `skipped` ni como falla.

Los motivos SHALL ser acotados y estables para los tres tipos:

- `inexistente`: el spec, el change o el path no existe.
- `ambiguo (<n> coincidencias)`: hay más de una coincidencia; el sistema no elige.
- `inválido (<causa>)`: la ref no matchea la gramática, declara un `path:` absoluto, contiene `../` o el
  nodo declara más de un bloque `refs:`.

Un bloque `refs:` vacío NO SHALL aportar refs y NO SHALL reportarse como falla.

El `detail` sin rotas SHALL ser
`N refs verificadas en M nodos activos; 0 no resuelven`, donde `M` es la cantidad de nodos activos
revisados; si existen refs `commit:` o `workitem:`, SHALL agregarse el conteo aparte como no verificables.
El `detail` con rotas SHALL ser
`K refs no resuelven: "<memory_key>" -> <ref textual> (<motivo>); ...`, con cada entrada identificada por
la `memory_key` del nodo y la ref textual tal cual aparece en `content`. Las entradas SHALL listarse
ordenadas por `memory_key` —y, a igual `memory_key`, en el orden en que aparecen las refs en `content`—,
de modo que dos corridas consecutivas produzcan el mismo `detail`.

El sistema NO SHALL agregar una variante de `change:` con fecha. El slug canónico SHALL ser el del change
activo o el del archive `YYYY-MM-DD-<slug>`; una ref `change:<YYYY-MM-DD-slug>` SHALL reportarse como no
resuelta con motivo `inexistente`.

Queda fuera de alcance resolver `path:` con `realpath` o exigir containment de symlinks: se conserva la
validación léxica y de existencia del camino de escritura. Ese gap SHALL declararse como no-goal y NO SHALL
prometerse detección de paths que escapan por symlink.

#### Scenario: Change archivado único resuelve sin rotas (T09)

- **WHEN** existe un único `aspec/changes/archive/YYYY-MM-DD-<slug>` y un nodo activo declara
  `change:<slug>`
- **THEN** el check `Refs de nodos activos` reporta `ok: true`
- **AND** su `detail` indica `0 no resuelven`
- **AND** `healthy` es `true`

#### Scenario: Dos archives con el mismo slug se reportan ambiguos (T09)

- **WHEN** existen dos directorios `aspec/changes/archive/YYYY-MM-DD-<slug>` que matchean el mismo slug y
  un nodo activo declara `change:<slug>`
- **THEN** el check reporta `ok: false` y `healthy` es `false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y `ambiguo (2 coincidencias)`
- **AND** el sistema no elige ninguno de los dos archives y `doctor` completa el reporte sin abortar

#### Scenario: Heading de spec ambiguo se reporta sin elegir (T29)

- **WHEN** un `spec.md` declara dos `### Requirement:` que canonicalizan al mismo heading y un nodo activo
  declara `spec:<capability>#<heading>`
- **THEN** el check reporta `ok: false` y `healthy` es `false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y `ambiguo (2 coincidencias)`
- **AND** el sistema no elige ninguno de los dos headings

#### Scenario: Spec inexistente o heading sin coincidencia se reporta

- **WHEN** un nodo activo declara `spec:<capability>#<heading>` y no existe el `spec.md` o ningún heading
  coincide
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y el motivo `inexistente`

#### Scenario: Change sin activo ni archive coincidente se reporta

- **WHEN** un nodo activo declara `change:<slug>` y no existe `aspec/changes/<slug>` ni un archive
  `YYYY-MM-DD-<slug>`
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y el motivo `inexistente`

#### Scenario: Path inexistente se reporta

- **WHEN** un nodo activo declara `path:<repository-relative-path>` y el archivo no existe
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y el motivo `inexistente`

#### Scenario: Path absoluto o con ../ se reporta inválido

- **WHEN** un nodo activo declara un `path:` absoluto o con `../`
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y un motivo `inválido` que distingue el path
  absoluto del `../`

#### Scenario: Ref con gramática inválida se reporta

- **WHEN** un nodo activo declara en su bloque `refs:` una línea que no matchea la gramática
- **THEN** el check reporta `ok: false`
- **AND** su `detail` usa la línea ofensora como ref textual y el motivo `inválido (gramática)`

#### Scenario: Bloque refs repetido se reporta inválido

- **WHEN** un nodo activo declara más de un bloque `refs:`
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key` y el motivo `inválido (gramática)`

#### Scenario: Change con prefijo de fecha no resuelve

- **WHEN** un nodo activo declara `change:<YYYY-MM-DD-slug>` y el archive existe como
  `aspec/changes/archive/YYYY-MM-DD-<slug>`
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la ref textual y el motivo `inexistente`
- **AND** una ref `change:<slug>` sobre el mismo archive resuelve

#### Scenario: Frontera de commit y workitem

- **WHEN** un nodo activo declara únicamente refs `commit:` y `workitem:`
- **THEN** el check reporta `ok: true`
- **AND** esas refs no aparecen en el listado de rotas
- **AND** si existen, se cuentan aparte como no verificables en el `detail`

#### Scenario: Nodos activos sin refs no son falla

- **WHEN** la base tiene nodos activos que no declaran bloque `refs:` o declaran un bloque vacío
- **THEN** el check reporta `ok: true`
- **AND** su `detail` indica `0 refs verificadas` y el conteo de nodos activos revisados
- **AND** `healthy` es `true`

#### Scenario: DB vacía reporta cero refs verificadas

- **WHEN** la base tiene el esquema inicializado y 0 nodos
- **THEN** el check `Refs de nodos activos` reporta `ok: true`
- **AND** su `detail` indica `0 refs verificadas`
- **AND** el check NO expone `skipped`
- **AND** `healthy` es `true`

#### Scenario: Raíz de proyecto no resoluble omite el check

- **WHEN** hay refs que verificar, no hay defecto detectable sin raíz y `doctor` no puede derivar la raíz
  del proyecto
- **THEN** el check reporta `ok: true` y `skipped: true`
- **AND** su `detail` nombra el motivo de la omisión
- **AND** `healthy` no baja y el exit code no cambia

#### Scenario: Raíz no derivable con bloque refs malformado no omite el check

- **WHEN** hay refs que verificar, `doctor` no puede derivar la raíz del proyecto y un nodo activo declara
  un bloque `refs:` malformado
- **THEN** el check reporta `ok: false` y NO expone `skipped`
- **AND** su `detail` nombra la `memory_key` y el motivo `inválido (gramática)`

#### Scenario: Esquema no inicializado reporta el check como no verificable

- **WHEN** `doctor` corre sobre una base sin `memory_nodes`
- **THEN** el reporte incluye los cinco checks con `ok: false`
- **AND** el check `Refs de nodos activos` lleva `detail` `no verificable: esquema no inicializado`

#### Scenario: No-mutación al verificar refs rotas

- **WHEN** `doctor` corre en modo por defecto sobre una fixture con nodos activos cuyas refs no resuelven
- **THEN** los bytes del `.db` no cambian; si el `-wal` existía antes, sus bytes tampoco cambian
- **AND** el conjunto de nodos activos no cambia
- **AND** una segunda corrida es idempotente: no cambia ningún byte de `.db` y `-wal` respecto de la
  primera
- **AND** los sidecars `-shm` o un `-wal` de 0 bytes materializados por la apertura read-only no se
  reportan como falla

#### Scenario: Refs sin indentar cuentan como verificadas

- **WHEN** un nodo activo declara `refs:` seguido de items de lista sin indentar
- **THEN** esas refs cuentan como verificadas en el `detail` del check
- **AND** una ref rota entre ellas se reporta con su `memory_key`, la ref textual y el motivo,
  igual que una ref indentada

### Requirement: Consolidación determinística de nodos duplicados

El sistema SHALL exponer el subcomando
`ancleto memory consolidate [--apply] [--force-critical] [--json]` dentro de la familia existente
`memory`. Sin `--apply`, el subcomando SHALL operar en dry-run por defecto y NO SHALL escribir en
la base de datos ni en el filesystem. El subcomando SHALL aceptar `--json` para una salida
estructurada. El subcomando SHALL ser un wrapper fino sobre la operación del engine y NO SHALL
introducir una tool MCP nueva.

**Normalización.** Dos nodos activos SHALL considerarse duplicados exactos cuando comparten
`type` y sus `content` normalizados son idénticos. La normalización SHALL quitar el bloque
`refs:` (la línea `refs:` y sus ítems), aplicar trim, colapsar secuencias de whitespace a un
espacio, convertir a minúsculas y quitar diacríticos. La comparación exacta SHALL realizarse
sólo entre nodos activos del mismo `type`; el `scope` NO SHALL formar parte de la agrupación
y puede diferir entre miembros. Un `content` cuya prosa normalizada queda vacía (sólo bloque
`refs:`) NO SHALL agruparse, para no colapsar provenance distinta.

**Canónico.** Para cada grupo de duplicados exactos del mismo `type` con dos o más miembros, el sistema SHALL
elegir exactamente un canónico aplicando, en orden, estos criterios: (1) mayor cantidad de
refs declaradas; (2) `created_at` más reciente; (3) scope más amplio, con el orden
`project` > `feature` > `task`; (4) `content` original más largo; (5) `rule` antes que
`decision`; (6) `memory_key` lexicográficamente menor, comparada sin locale. La elección NO
SHALL depender del orden de iteración de la base ni del orden de llegada de los nodos.

**Aplicación.** Con `--apply`, el sistema SHALL superseder a todos los miembros no canónicos
de cada grupo exacto, dejándolos con `status='superseded'`, `superseded_by` igual al `id`
del canónico y `superseded_at` igual al instante de la operación. La operación NO SHALL borrar
filas, NO SHALL crear nodos y NO SHALL modificar `memory_key` ni `content` del canónico. Todos
los grupos SHALL aplicarse en una sola transacción atómica: si un miembro dejó de estar activo
al momento de escribir, la transacción SHALL hacer rollback total. Una segunda corrida sobre el
mismo estado SHALL reportar cero grupos aplicables.

**Puerta de criticidad.** El conjunto de `memory_key` críticas SHALL ser el declarado en
`.ancletorc` bajo `memory.criticalKeys`, con la lectura tolerante vigente: ausente, no-array, JSON
inválido o con entradas que no son strings SHALL equivaler a la lista vacía, y las strings vacías
SHALL descartarse. El engine NO SHALL leer `.ancletorc`; el subcomando SHALL resolver el conjunto
con el helper existente `readCriticalMemoryKeys` sobre la raíz derivada de la base y SHALL
inyectarlo en la operación.

El riesgo de la corrida SHALL ser la intersección entre ese conjunto y las `memory_key` que la
corrida supersedería en los grupos exactos. Una clave crítica que queda canónica NO SHALL contar
como riesgo, y los near-duplicates NO SHALL contar. El reporte SHALL exponer `criticalAffected`
con esas claves, ordenadas lexicográficamente de forma determinística y sin locale.

Con `--apply`, si `criticalAffected` no está vacío y no se pasó `--force-critical`, la operación
SHALL rechazar antes de escribir ninguna fila: cero nodos modificados, cero grupos aplicados y el
working-context derivado sin reescribir. La puerta NO SHALL omitir miembros de un grupo: o se
aplican todos los grupos exactos o se rechaza la operación completa. El rechazo SHALL propagarse
como un error cuyo `code` sea `MEMORY_CRITICAL_KEY` y cuyo mensaje nombre cada `memory_key`
afectada y mencione `--force-critical` como vía explícita. La puerta SHALL evaluarse dentro de la
transacción `BEGIN IMMEDIATE`; el conjunto de riesgo SHALL derivarse del plan calculado antes de
abrirla y cada escritura SHALL revalidar por `id` que el nodo siga activo, de modo que un rechazo
o una carrera deje cero filas del plan aplicadas sin verificar.

Con `--force-critical` la corrida SHALL aplicar los grupos como hoy y SHALL conservar el
comportamiento post-escritura vigente, incluido el refresco del working-context y su código de
salida ante un fallo de refresh. El dry-run NO SHALL bloquear nunca por criticidad: SHALL reportar
`criticalAffected` y salir con código `0` aun cuando no esté vacío; en dry-run `--force-critical`
NO SHALL tener efecto. Sin `--json`, cuando `criticalAffected` no esté vacío, el texto humano
SHALL nombrar esas claves. El subcomando SHALL salir con código `2` cuando `--apply` rechaza por
esta puerta y NO SHALL escribir la base ni el bloque derivado; con `--json` SHALL emitir en
stdout un objeto JSON parseable con `error: "critical-key-gate"` y `criticalAffected`, y sin
`--json` SHALL escribir en stderr un mensaje que nombre las claves. Cualquier otro error de la
operación SHALL conservar el código `1`.

**Near-duplicates.** El reporte SHALL incluir, de forma informativa y separada de los grupos
exactos, los pares de nodos activos que cumplan simultáneamente: mismo `type`, mismo `scope`,
`content` normalizado distinto y similitud Jaccard ≥ 0,60 sobre el conjunto de tokens del
`content` normalizado, con tokens separados por whitespace y deduplicados. `--apply` NO
SHALL superseder near-duplicates; la aplicación SHALL limitarse a los grupos exactos.

**Salida determinística.** Para la misma entrada, dos corridas SHALL producir el mismo
reporte. Los grupos exactos SHALL ordenarse por el `type` del canónico y, a igual `type`, por
su `memory_key`; sus miembros SHALL ordenarse según los criterios de canónico. Los pares
near-duplicate SHALL ordenarse por similitud descendente y, a igual similitud, por sus
`memory_key`. El reporte SHALL identificar cada
grupo, su canónico, sus miembros y, tras `--apply`, qué nodos fueron superseded y hacia cuál.
El reporte SHALL incluir `criticalAffected` tanto en dry-run como en `--apply`.
Con `--json`, la salida SHALL ser un objeto JSON parseable.

**Read-only.** El engine SHALL exponer
`consolidate({ dryRun = true, criticalKeys = [], forceCritical = false } = {})`. En el engine
read-only, `consolidate` SHALL permitir sólo `dryRun: true` y SHALL rechazar una corrida real
antes de tocar la conexión, con el mismo patrón que `merge`. El subcomando en modo dry-run
SHALL usar la conexión read-only.

**Contexto derivado.** Tras `--apply`, el subcomando SHALL refrescar
`.ancleto/working-context.md` con el mismo render que el refresh on-write existente
(`refreshWorkingContextOnWrite`), derivando la raíz del directorio de la base
(`resolveMemoryProjectRoot(dbPath)`). El dry-run NO SHALL escribir ese archivo.

**Sin schema.** La operación NO SHALL crear objetos nuevos (tablas, índices, triggers ni
vistas). El conjunto de objetos de `sqlite_master` SHALL ser idéntico antes y después de
`--apply`. La columna aditiva `superseded_at` de `memory_nodes` pertenece al contrato de
`Garbage collection de nodos superseded` y NO se re-enuncia acá.

#### Scenario: Dry-run no escribe

- **WHEN** se ejecuta `ancleto memory consolidate` sobre una base con un grupo de duplicados
  exactos
- **THEN** el reporte incluye el grupo y su canónico
- **AND** ningún nodo cambia `status`, `superseded_by` ni `superseded_at`
- **AND** el bloque de contexto derivado no se reescribe

#### Scenario: Grupo exacto elige canónico por refs y supersede el resto

- **WHEN** se ejecuta `--apply` sobre un grupo de tres nodos del mismo `type` con el mismo
  `content` normalizado, donde uno declara dos refs, otro una y otro ninguna
- **THEN** el nodo con dos refs permanece activo como canónico
- **AND** los otros dos quedan con `status='superseded'`
- **AND** el `superseded_by` de cada uno es igual al `id` del canónico
- **AND** el `superseded_at` de cada uno es igual al instante de la operación
- **AND** ninguna fila es borrada

#### Scenario: Mismo texto en `type` distinto no se agrupa

- **WHEN** un nodo `decision` y un nodo `rule` activos tienen `content` normalizado idéntico
- **THEN** no forman parte del mismo grupo exacto
- **AND** ninguno de los dos es superseded por el otro
- **AND** el reporte no propone esa supersesión

#### Scenario: Prosa vacía no se agrupa

- **WHEN** dos nodos activos del mismo `type` tienen un `content` cuya prosa normalizada queda
  vacía porque sólo declaran el bloque `refs:`
- **THEN** no forman un grupo exacto
- **AND** `--apply` no modifica el `status` ni el `superseded_by` de ninguno de los dos

#### Scenario: Empate resuelto por `created_at` y `memory_key`

- **WHEN** tres nodos del mismo grupo tienen la misma cantidad de refs y dos comparten el
  `created_at` más reciente
- **THEN** el canónico es uno de los que tienen el `created_at` más reciente
- **AND** si el empate persiste, gana la `memory_key` lexicográficamente menor
- **AND** dos corridas consecutivas eligen el mismo canónico

#### Scenario: Near-duplicate sólo se reporta

- **WHEN** dos nodos activos del mismo `type` y `scope` tienen `content` normalizado distinto
  y Jaccard ≥ 0,60
- **THEN** el par aparece en la sección informativa con su similitud
- **AND** `--apply` no modifica el `status` ni el `superseded_by` de ninguno de los dos

#### Scenario: Engine read-only rechaza `--apply`

- **WHEN** se invoca `consolidate({ dryRun: false })` sobre el engine read-only
- **THEN** la operación lanza un error que indica que la conexión es read-only
- **AND** no se escribe ningún nodo ni archivo

#### Scenario: Misma entrada, mismo reporte

- **WHEN** se ejecuta el dry-run dos veces sobre la misma base
- **THEN** las dos salidas son idénticas
- **AND** ninguna corrida modifica nodos

#### Scenario: Sin schema nuevo

- **WHEN** se ejecuta `--apply` sobre una base con grupos exactos
- **THEN** el conjunto de objetos de `sqlite_master` es idéntico antes y después
- **AND** no se creó ninguna tabla ni índice

#### Scenario: Dry-run reporta `criticalAffected` sin bloquear

- **WHEN** se ejecuta el dry-run sobre una base donde un miembro que sería superseded tiene una
  `memory_key` declarada en `memory.criticalKeys`
- **THEN** el reporte incluye esa `memory_key` en `criticalAffected`
- **AND** el comando sale con código `0`
- **AND** ningún nodo cambia de estado y el bloque derivado no se reescribe

#### Scenario: `--apply` con clave crítica afectada rechaza sin escribir

- **WHEN** se ejecuta `--apply` sobre el mismo estado, sin `--force-critical`
- **THEN** el comando sale con código `2`
- **AND** el mensaje nombre la `memory_key` afectada y mencione `--force-critical`
- **AND** con `--json`, stdout es un objeto JSON parseable con `error: "critical-key-gate"` y
  `criticalAffected`
- **AND** ningún nodo cambia `status`, `superseded_by` ni `superseded_at`
- **AND** el bloque de contexto derivado no se reescribe

#### Scenario: `--apply --force-critical` aplica los grupos

- **WHEN** se ejecuta `--apply --force-critical` sobre el mismo estado
- **THEN** los grupos exactos se aplican como en una corrida sin claves críticas
- **AND** cada miembro no canónico queda superseded hacia su canónico
- **AND** el comando sale con código `0` si el refresco del working-context no falla

#### Scenario: Sin claves críticas el comportamiento no cambia

- **WHEN** `memory.criticalKeys` está ausente, no es un array o es una lista vacía
- **THEN** `criticalAffected` es la lista vacía
- **AND** el dry-run y `--apply` se comportan igual que antes de esta puerta, sin requerir
  `--force-critical`

#### Scenario: Base de memoria ausente

- **WHEN** se ejecuta `ancleto memory consolidate` en un directorio sin `.ancleto/memory.db`
- **THEN** el comando sale con código `1` y un mensaje que indica que no hay memoria en el repositorio
- **AND** no crea la base ni el bloque derivado

### Requirement: Curaduría read-only con `memory curate`

El sistema SHALL exponer el subcomando `ancleto memory curate [--json] [--strict]` dentro de la
familia existente `memory`. El subcomando SHALL ser un wrapper fino sobre un módulo puro en
`src/core/memory/curation.js` y NO SHALL introducir una tool MCP nueva.

**Composición, no duplicación.** El módulo SHALL componer las primitivas existentes:
`resolveNodeRefs` para clasificar cada ref de cada nodo —es la primitiva que aporta `kind` y
`reason` por ref— y `consolidate({ dryRun: true, includeNearDuplicates: false })` para duplicados
exactos. `inspectRefs` es un agregado de nivel doctor que no expone `reason` por ref y NO es la
primitiva que compone este módulo. El módulo NO SHALL contener SQL propio, un parser de refs propio,
un resolvedor de refs propio ni una segunda normalización de duplicados, cualquiera sea la primitiva
que componga. El literal de clasificación de gramática inválida —la línea ofensora `refs:` y el
motivo `inválido (gramática)`— SHALL tener una única definición exportada por el engine y SHALL ser
el mismo literal que usa el diagnóstico de refs; la curaduría NO SHALL redeclararlo. Un duplicado
exacto SHALL ser el que produce esa primitiva: `type` igual y `content` normalizado sin el bloque
`refs:`; el canónico SHALL ser el que elige su cadena fija de criterios. Como la curaduría no reporta
near-duplicates, SHALL invocar la primitiva con `includeNearDuplicates: false` para no pagar ese
escaneo; la definición de duplicado exacto y el default de esa primitiva NO cambian.

**Snapshot de lectura.** El reporte SHALL componerse bajo UN único snapshot de lectura: la lectura de
los nodos activos y la detección de duplicados exactos SHALL ejecutarse dentro de una misma
transacción diferida read-only (`BEGIN DEFERRED` … `COMMIT`, con `ROLLBACK` ante error). Esa
transacción NO SHALL escribir, NO SHALL migrar y NO SHALL adquirir el helper de escritura ni su
retry. Bajo `journal_mode=WAL` NO SHALL bloquear a otros lectores ni a escritores, y SHALL cerrarse
antes de resolver refs contra el filesystem, de modo que el I/O no mantenga el snapshot abierto. Una
escritura confirmada por otro proceso entre las dos lecturas NO SHALL ser visible en ninguna de las
dos: ambas SHALL ver el mismo estado, correspondiente al instante en que se abrió la transacción. Si
una lectura falla, el error SHALL propagarse como estado distinto de `ok` y NO SHALL quedar la
transacción abierta.

**Read-only.** El comando SHALL abrir la base exclusivamente con `readonly: true` y
`migrate: false`. NO SHALL aceptar `--rebuild` ni ejecutar `VACUUM`, `VACUUM INTO`, snapshot, DDL,
`PRAGMA` mutante, `INSERT`, `UPDATE`, `DELETE`, escritura de `superseded_by`/`superseded_at`,
`recordRule`, `recordDecision` ni promoción de ningún tipo.

**Contenido del reporte.** El reporte SHALL contener estas secciones:

- `brokenRefs`: una entrada por ref no resuelta de un nodo activo, con `memory_key`, `kind`
  (`spec`, `change` o `path`), `ref` y `reason`. `ref` SHALL ser el texto declarado en `content`,
  con exactamente dos transformaciones: los separadores de path normalizados a `/` y, si existe,
  el sufijo final `:line` eliminado. NO SHALL colapsar `.` ni `..`, y NO SHALL resolverse,
  canonicalizarse ni normalizarse de ninguna otra forma. `reason` SHALL ser un string informativo
  NO enumerado: la curaduría SHALL reutilizar tal cual el motivo que emite el diagnóstico vigente
  para la ref, sin traducirlo ni filtrarlo
  contra una lista cerrada. Los valores `inexistente`, `ambiguo (<n> coincidencias)`,
  `inválido (<causa>)` y `sin raíz` son ejemplos de esa salida, no una enumeración exhaustiva.
  Una ref que no puede verificarse porque no hay raíz de proyecto disponible SHALL reportarse como
  hallazgo con su `reason`, nunca omitirse en silencio.
  Cuando el nodo declara un bloque `refs:`
  malformado o repetido, la entrada SHALL usar la línea ofensora —o `refs:`— como `ref`, omitir
  `kind` y reportar `reason` `inválido (gramática)`.
- `unverifiable`: una entrada por ref `commit:` o `workitem:`, con `memory_key`, `kind`, `ref` y
  `reason` `no verificable`. Esas refs NO SHALL contarse como rotas ni afectar el código de salida.
- `exactDuplicates`: un grupo por conjunto de dos o más nodos activos con `content` normalizado
  idéntico y mismo `type`, con su `canonical` y su `superseded`. `canonical` es el nodo canónico del
  grupo, `superseded` lista los nodos restantes del grupo y un grupo reportado siempre tiene al
  menos una entrada en `superseded`. Los grupos SHALL ordenarse por `type` y, a igual `type`, por
  la `memory_key` del canónico; las `memory_key` de `superseded` SHALL conservar el orden de la
  cadena de canónico.

La curaduría NO SHALL modificar el estado de ningún nodo: los nodos de `superseded` en un grupo
exacto SHALL seguir activos y sin cambios en `superseded_by` ni `superseded_at`. Reportar un
duplicado NO SHALL equivaler a consolidarlo.

**Determinismo.** Para la misma entrada, dos corridas SHALL producir la misma salida. El orden
SHALL ser total: `memory_key` ascendente y, a igual `memory_key`, el orden de aparición de la ref
dentro de `content`. Los paths SHALL emitirse en forma POSIX y sin sufijo `:line`. La salida NO
SHALL incluir timestamps ni campos volátiles. El orden NO SHALL depender de `localeCompare`, del
orden de `readdir` ni del orden de `rowid`.

**Códigos de salida.** El comando SHALL ser advisory por defecto: SHALL salir con `0` aun cuando
el reporte contenga refs rotas o grupos de duplicados exactos. Con `--strict`, SHALL salir con
código distinto de `0` cuando exista al menos una ref rota o un grupo exacto. Las refs
`unverifiable` NO SHALL afectar el código de salida en ningún modo.

Cuando la base no exista, el comando SHALL reportar el estado `no-db` de forma explícita y salir
con código distinto de `0`, con y sin `--strict`. El estado `no-db` NUNCA SHALL presentarse como un
reporte limpio. Cualquier error de apertura o lectura SHALL reportarse como estado distinto de
`ok` con su motivo y código distinto de `0`, nunca como reporte limpio.

**Salida JSON.** Con `--json`, la salida SHALL ser un objeto JSON parseable con las claves
`status`, `brokenRefs`, `unverifiable` y `exactDuplicates`. Sin
`--json`, la salida SHALL ser un resumen legible con las mismas secciones.

#### Scenario: Refs rotas listadas con evidencia

- **WHEN** se ejecuta `ancleto memory curate --json` sobre una base con un nodo activo
  `memory_key='regla-a'` que declara `path:src/no-existe.js`, `spec:memory-ops#no-existe` y
  `change:no-existe`
- **THEN** `brokenRefs` contiene tres entradas con `memory_key='regla-a'`
- **AND** cada entrada expone `kind` (`path`, `spec`, `change`), la ref declarada y `reason`
  `inexistente`
- **AND** las entradas respetan el orden de aparición de las refs en `content`

#### Scenario: Duplicados exactos se reportan sin superseder

- **WHEN** se ejecuta `ancleto memory curate --json` sobre una base con tres nodos activos del
  mismo `type` y el mismo `content` normalizado, donde uno declara dos refs y los otros ninguna
- **THEN** `exactDuplicates` contiene un grupo cuyo `canonical` es el nodo con dos refs
- **AND** `superseded` contiene las `memory_key` de los otros dos
- **AND** los tres nodos siguen con `status='active'` y sin `superseded_by` ni `superseded_at`
- **AND** el conjunto de filas de `memory_nodes` es idéntico antes y después

#### Scenario: Advisory por defecto y `--strict` opt-in

- **WHEN** se ejecuta `ancleto memory curate` sobre una base con una ref rota y un grupo exacto
- **THEN** el comando sale con código `0`
- **AND** se ejecuta `ancleto memory curate --strict` sobre la misma base
- **AND** el comando sale con código distinto de `0`

#### Scenario: Base ausente se reporta como `no-db`

- **WHEN** se ejecuta `ancleto memory curate --json` en un repo sin `.ancleto/memory.db`
- **THEN** la salida expone `status` `no-db`
- **AND** el comando sale con código distinto de `0`
- **AND** la salida NO SHALL presentarse como un reporte limpio ni con secciones vacías que
  sugieran "sin hallazgos"

#### Scenario: Orden y forma de paths determinísticos

- **WHEN** se ejecuta `ancleto memory curate --json` dos veces sobre la misma base, cuyos nodos
  declaran refs de path con separadores `\` y sufijos `:line`
- **THEN** las dos salidas son idénticas
- **AND** una ref declarada como `path:src\core\..\memory\x.js:12` se reporta exactamente como
  `path:src/core/../memory/x.js`, sin colapsar `..` ni resolverla
- **AND** una ref declarada como `path:src\a.js:7` se reporta exactamente como `path:src/a.js`
- **AND** los paths aparecen en forma POSIX, sin sufijo `:line`
- **AND** las entradas están ordenadas por `memory_key` y luego por orden de aparición
- **AND** la salida no contiene timestamps ni campos volátiles

#### Scenario: `commit:` y `workitem:` se reportan aparte, nunca como rotas

- **WHEN** un nodo activo declara únicamente refs `commit:` y `workitem:`
- **THEN** aparecen en `unverifiable` con `reason` `no verificable`
- **AND** `brokenRefs` no las incluye
- **AND** el código de salida es `0`, también con `--strict`

#### Scenario: La curaduría no escribe de ninguna forma

- **WHEN** se ejecuta `ancleto memory curate` sobre una fixture con refs rotas y duplicados
  exactos, en `journal_mode=DELETE`
- **THEN** los bytes de `.db` son idénticos antes y después
- **AND** el conjunto de objetos de `sqlite_master` es idéntico antes y después
- **AND** la cantidad de nodos y sus `status`, `superseded_by` y `superseded_at` no cambian
- **AND** dos corridas consecutivas son idempotentes

#### Scenario: La composición lee bajo un único snapshot

- **WHEN** se ejecuta `ancleto memory curate --json` y otro proceso confirma un nodo activo nuevo
  después de que la curaduría leyó los nodos activos
- **THEN** el nodo nuevo no aparece en `brokenRefs`, `unverifiable` ni `exactDuplicates`
- **AND** la lectura de nodos y la detección de duplicados exactos ven el mismo estado
- **AND** sin escrituras concurrentes, dos corridas consecutivas son idénticas

#### Scenario: El snapshot no deja el WAL retenido ni bloquea escritores

- **WHEN** la curaduría corre mientras un escritor concurrente confirma una escritura
- **THEN** el escritor confirma sin `MEMORY_DB_BUSY` y sin esperar a que la curaduría termine
- **AND** al volver la curaduría no queda ninguna transacción abierta
- **AND** una escritura posterior en otra conexión confirma sin esperar

#### Scenario: El texto y el motivo de gramática inválida no cambian

- **WHEN** un nodo activo declara un bloque `refs:` repetido o una línea no-item dentro del bloque
- **THEN** la entrada usa `refs:` o la línea ofensora como `ref`, omite `kind` y reporta `reason`
  `inválido (gramática)`
- **AND** el texto y el motivo coinciden con los del diagnóstico de refs vigente
- **AND** los códigos de salida no cambian respecto de la curaduría anterior

_No-testeable-por-construcción: que el módulo no contenga una ruta de escritura ni un segundo
parser o normalizador es una propiedad de construcción sin salida observable directa. Se ancla en
el contrato del módulo descrito arriba y en la revisión de código; el efecto observable —la base
byte a byte idéntica— sí queda cubierto por el scenario anterior. Lo mismo aplica a que el literal
de gramática tenga un único punto de definición._

### Requirement: Import con dry-run clasificado por memory_key

El sistema SHALL exponer `ancleto memory import --dry-run <archivo.json> [--json]` como una
simulación read-only del import. La garantía central SHALL ser que la clasificación predice
exactamente el efecto que tendría `import` sobre la misma entrada en el mismo estado: el dry-run y
`importNodes` SHALL compartir una única función de decisión, sin duplicar la política.

**Clasificación.** Para cada entrada, en el orden del archivo, el sistema SHALL clasificarla por
`memory_key` en uno de cuatro buckets, definidos así:

- `nuevo`: no existe nodo activo para la key y no existe historial `superseded`; acción `insert`.
- `identico`: existe un nodo activo y su payload durable —`type`, `scope`, `content`,
  `justification`— es igual al entrante; acción `supersede` si el `createdAt` entrante es
  estrictamente más nuevo, y `skip` si es más viejo o igual.
- `divergente`: existe un nodo activo y el payload durable difiere del entrante; acción `supersede`
  si el `createdAt` entrante es estrictamente más nuevo, y `skip` si es más viejo o igual.
- `tombstone`: no existe nodo activo pero sí existe historial `superseded` para la key; acción
  `skip`.

`createdAt` NO SHALL formar parte de la identidad del payload. La comparación de `content` y de
`justification` SHALL aplicar el mismo saneador que usa `exportActive` sobre ambos lados —el campo
del nodo activo local y el de la entrada—, de modo que un round-trip legítimo export→import y una
entrada con el `content` o el `justification` crudo del nodo local clasifiquen `identico` y no
`divergente`. Ese saneado SHALL tratar los paths absolutos como no semánticos; por lo tanto un
`identico` puede corresponder a un `content` que igual cambia en bytes al importar (el path redactado
reemplaza al original) y esa diferencia NO SHALL reportarse como `divergente`: la promesa de
predicción exacta aplica a la acción (`insert`/`supersede`/`skip`) y a los contadores, no a la
igualdad byte a byte del `content`.

`tombstone` NO SHALL ser un estado persistido: el esquema no tiene tombstone ni `deleted_at`, NO
SHALL agregarse ninguno, y el término SHALL describir únicamente "retirada local que el import
saltea".

**Simulación secuencial.** Los duplicados de la misma `memory_key` dentro del archivo SHALL
simularse en el orden del archivo sobre el estado que deja cada entrada anterior, igual que
`importNodes`; NO SHALL usarse una foto estática del estado inicial. La acción predicha por entrada
SHALL coincidir con el efecto real del import: `insert` con un nodo insertado, `supersede` con un
nodo previo superseded y uno nuevo activo, `skip` con ningún cambio. Los conteos por acción SHALL
coincidir con `inserted`, `updated` y `skipped` del import real sobre el mismo estado.

**Read-only estricto.** El dry-run SHALL abrir la base con `createReadonlyMemoryEngine`
(`migrate: false`) y NO SHALL ejecutar `runImmediateTransaction`, `checkpoint`, `recordNode`,
`importNodes`, `gc` ni el refresh del working-context. La garantía SHALL ser: ninguna sentencia de
escritura y `.db` con bytes idénticos. La ausencia de sidecars `-wal`/`-shm` NO SHALL afirmarse como
parte del contrato. Si la base existe, el sistema SHALL reportar `databasePresent: true` sin
escribirla. Si la base no existe, el sistema NO SHALL crearla y SHALL reportar
`databasePresent: false`, clasificando cada entrada mediante la misma simulación secuencial sobre un
estado vacío: una entrada cuyo `memory_key` no se repite en el archivo resulta `nuevo` con acción
`insert`, y un duplicado posterior se clasifica contra la entrada anterior; la corrida sigue
saliendo con código 0.

**Salida.** El sistema SHALL producir un resumen `{ nuevo, identico, divergente, tombstone }` y, por
entrada, `{ memory_key, classification, action }`, en el orden del archivo. Con `--json` SHALL
emitir `{ dryRun: true, databasePresent, summary, entries }`. Sin `--json` SHALL emitir un texto
humano con el resumen y una línea por cada entrada cuya acción sea `skip` con clasificación
`divergente` o `tombstone`. El sistema SHALL salir con código 0 en éxito y con código 1 sólo cuando
falte el archivo, el archivo no exista, el JSON no sea parseable, una entrada no satisfaga el
esquema que `importNodes` exige, o la base exista pero no pueda abrirse en sólo lectura. En el caso
de entrada inválida NO SHALL emitirse una clasificación parcial; en el caso de apertura fallida NO
SHALL emitirse clasificación alguna.

#### Scenario: Bucket `nuevo` inserta

- **WHEN** se ejecuta el dry-run sobre una entrada cuya `memory_key` no tiene nodo activo ni
  historial `superseded`
- **THEN** la entrada se clasifica `nuevo` con acción `insert`
- **AND** el resumen incrementa `nuevo` en 1

#### Scenario: Bucket `identico` con `createdAt` más nuevo supersede

- **WHEN** existe un nodo activo con el mismo payload durable y la entrada trae un `createdAt`
  estrictamente más nuevo
- **THEN** la entrada se clasifica `identico` con acción `supersede`

#### Scenario: Bucket `identico` sin `createdAt` más nuevo omite

- **WHEN** existe un nodo activo con el mismo payload durable y la entrada trae un `createdAt` más
  viejo o igual
- **THEN** la entrada se clasifica `identico` con acción `skip`

#### Scenario: Bucket `divergente` con `createdAt` más nuevo supersede

- **WHEN** existe un nodo activo con payload durable distinto y la entrada trae un `createdAt`
  estrictamente más nuevo
- **THEN** la entrada se clasifica `divergente` con acción `supersede`

#### Scenario: Divergencia con `createdAt` igual queda visible y omite

- **WHEN** dos bases divergen en el payload de una key con `createdAt` igual
- **THEN** la entrada se clasifica `divergente` con acción `skip`
- **AND** la línea de la entrada aparece en la salida humana, porque hoy ese caso es invisible

#### Scenario: Bucket `divergente` con `createdAt` más viejo omite

- **WHEN** existe un nodo activo con payload durable distinto y la entrada trae un `createdAt` más
  viejo
- **THEN** la entrada se clasifica `divergente` con acción `skip`

#### Scenario: Bucket `tombstone` omite sin reactivar

- **WHEN** no existe nodo activo para la key pero sí existe historial `superseded`
- **THEN** la entrada se clasifica `tombstone` con acción `skip`
- **AND** no se reporta ningún nodo activo para esa key

#### Scenario: La acción predicha coincide con el efecto del import real

- **WHEN** se ejecuta el dry-run y luego `importNodes` sobre dos fixtures con el mismo estado inicial
  y el mismo archivo
- **THEN** la cantidad de acciones `insert` coincide con `inserted`
- **AND** la cantidad de acciones `supersede` coincide con `updated`
- **AND** la cantidad de acciones `skip` coincide con `skipped`

#### Scenario: Orden del archivo y determinismo

- **WHEN** se ejecuta el dry-run dos veces sobre el mismo estado y el mismo archivo
- **THEN** las entradas aparecen en el orden del archivo en ambas corridas
- **AND** la salida es idéntica entre ambas corridas

#### Scenario: Cero escrituras y working-context intacto

- **WHEN** se ejecuta el dry-run sobre una base existente y un archivo con entradas de los cuatro
  buckets
- **THEN** los bytes del archivo `.db` son idénticos antes y después
- **AND** ningún nodo cambia de estado
- **AND** `.ancleto/working-context.md` no se refresca ni cambia

#### Scenario: Base ausente no se crea y las keys únicas resultan nuevas

- **WHEN** se ejecuta el dry-run y `.ancleto/memory.db` no existe, con un archivo cuyas
  `memory_key` no se repiten
- **THEN** la salida reporta `databasePresent: false`
- **AND** cada entrada se clasifica `nuevo` con acción `insert`
- **AND** el archivo de base no se crea
- **AND** el código de salida es 0

#### Scenario: Duplicados de la misma key se simulan en orden secuencial

- **WHEN** el archivo contiene dos entradas de la misma `memory_key`, la segunda con payload distinto
  y `createdAt` más nuevo, y la key no existe en la base
- **THEN** la primera se clasifica `nuevo` con acción `insert`
- **AND** la segunda se clasifica `divergente` con acción `supersede`, comparada contra el estado que
  dejó la primera
- **AND** el import real sobre el mismo estado reporta `inserted: 1` y `updated: 1`

#### Scenario: El round-trip export→import no produce divergente falso

- **WHEN** un nodo activo contiene un path absoluto y la entrada es la que produce `exportActive`
  para ese nodo, con el path redactado
- **THEN** la entrada se clasifica `identico`
- **AND** no se clasifica `divergente`

#### Scenario: Salida JSON

- **WHEN** se ejecuta `ancleto memory import --dry-run <archivo.json> --json`
- **THEN** la salida es un objeto JSON parseable
- **AND** incluye `dryRun: true`, `databasePresent`, `summary` y `entries`
- **AND** cada entrada de `entries` incluye `memory_key`, `classification` y `action`

#### Scenario: Salida humana muestra los skip invisibles

- **WHEN** se ejecuta el dry-run sin `--json` con entradas `divergente` y `tombstone` que se omiten
- **THEN** la salida muestra el resumen de los cuatro buckets
- **AND** muestra una línea por cada entrada con acción `skip` y clasificación `divergente` o
  `tombstone`

#### Scenario: Archivo ausente o JSON inválido sale con código 1

- **WHEN** falta el argumento de archivo, el archivo no existe o el JSON no es parseable
- **THEN** el comando sale con código 1
- **AND** no se escribe en la base

#### Scenario: Payload crudo igual al local clasifica identico

- **WHEN** existe un nodo activo cuyo `content` contiene un path absoluto y la entrada trae
  exactamente ese mismo `content` sin redactar, con `createdAt` más nuevo
- **THEN** la entrada se clasifica `identico` con acción `supersede`
- **AND** no se clasifica `divergente`

#### Scenario: Path absoluto en justification no produce divergente falso

- **WHEN** existe un nodo activo cuyo `justification` contiene un path absoluto y la entrada es la
  que produce `exportActive` para ese nodo, con el path redactado
- **THEN** la entrada se clasifica `identico`
- **AND** no se clasifica `divergente`

#### Scenario: Base ausente con key duplicada predice el import real

- **WHEN** la base no existe y el archivo trae dos entradas de la misma `memory_key`, la segunda con
  contenido distinto y `createdAt` más nuevo
- **THEN** la primera se clasifica `nuevo` con acción `insert`
- **AND** la segunda se clasifica `divergente` con acción `supersede`
- **AND** el import real sobre ese mismo estado reporta `inserted: 1` y `updated: 1`
- **AND** el archivo de base se crea sólo por el import, nunca por el dry-run

### Requirement: Reparación explícita de refs no resueltas con `memory repair refs`

El sistema SHALL exponer el subcomando
`ancleto memory repair refs --memory-key <key> [--apply] [--force-critical] [--json]` dentro de la
familia existente `memory`. El subcomando SHALL ser un wrapper fino sobre un método del engine y NO
SHALL introducir una tool MCP nueva ni un comando `memory restore`.

**Operación única.** La operación SHALL remover de un nodo activo exactamente las refs declaradas
en su bloque `refs:` cuya resolución devuelva `ok: false` con motivo `inexistente`. El resto del
`content` SHALL permanecer byte-idéntico: prosa, separadores, indentación y las demás refs NO SHALL
alterarse. Las refs `commit:` y `workitem:` NO SHALL removerse nunca porque no son verificables
localmente. Las refs con motivo `ambiguo (<n> coincidencias)` NO SHALL removerse.

**Allowlist fail-closed.** La única ref removible SHALL ser la que devuelve `ok: false` con motivo
exactamente `inexistente`; cualquier otro motivo —incluido uno nuevo no contemplado— NO SHALL
considerarse removible ni removerse. La lista de motivos removibles NO SHALL interpretarse como
complemento de la de motivos diagnosticados.

Si la raíz del proyecto no se puede derivar, el comando SHALL salir con código `1` sin escribir. La
reparación NO SHALL redirigir una ref de una `memory_key` a otra, NO SHALL reescribir un bloque
`refs:` malformado y NO SHALL reactivar un nodo `superseded`.

**Selección fail-closed.** `--memory-key` SHALL ser obligatoria. Sin ella, el comando SHALL mostrar
el uso y salir con código `1`; una flag desconocida SHALL producir el mismo rechazo. La operación
SHALL exigir exactamente un nodo activo con la `memory_key` indicada; con cero o con dos o más
nodos activos SHALL salir con código `1` sin escribir la base ni el working-context.

**Dry-run y aplicación.** Sin `--apply`, el comando SHALL operar en dry-run, SHALL abrir la base en
modo read-only con `migrate: false` y NO SHALL escribir la base ni el working-context; los bytes de
`.ancleto/memory.db` SHALL permanecer idénticos. La materialización de sidecars vacíos
(`-wal`/`-shm`) por una lectura read-only NO SHALL contar como escritura. El dry-run SHALL reportar
el plan de remoción. Con `--apply`, SHALL aplicar la reparación.
El dry-run SHALL validar el `content` candidato con la misma validación que usa la escritura, de
modo que un plan que `--apply` rechazaría NO SHALL reportarse como aplicable; en ese caso la salida
SHALL ser `status: "error"` con código `1` y cero escrituras, nombrando la ref que impide la
escritura.

**Camino de escritura.** La escritura SHALL realizarse mediante un método del engine que supersede
el nodo activo por el mismo writer transaccional `BEGIN IMMEDIATE` y las mismas primitivas de
gramática y resolución que el camino único de escritura. NO SHALL ejecutarse un `UPDATE` crudo de
`content` ni SHALL usarse `import` como sustituto. La operación SHALL preservar la unicidad de nodo
activo por `memory_key`, SHALL preservar `created_at`, `scope`, `type` y `justification`, y SHALL
dejar el nodo anterior con `status='superseded'` y su `content` original. El índice FTS SHALL quedar
alineado por los triggers existentes; la búsqueda SHALL encontrar el `content` reparado.

**Rechazos.** El comando SHALL rechazar con código `1` y cero escrituras cuando el nodo declare un
bloque `refs:` malformado o repetido, o cuando la reparación dejaría el nodo con cero refs. El
rechazo por cero refs SHALL remitir a `memory export` y `memory import` como vías de recuperación.
NO SHALL reescribirse la gramática para volver a aceptar el bloque.

**Puerta de criticidad.** Si la `memory_key` pertenece a `.ancletorc` bajo `memory.criticalKeys`, el
dry-run SHALL reportar `critical: true` y SHALL salir con código `0`; `--apply` sin
`--force-critical` NO SHALL escribir y SHALL emitir, con `--json`,
`{ "error": "critical-key-gate", "criticalAffected": [<key>] }`, saliendo con código `2`; con
`--force-critical` SHALL aplicar. El engine NO SHALL leer `.ancletorc`: el conjunto SHALL
inyectarlo el subcomando.

**Idempotencia.** Tras una aplicación exitosa, una segunda corrida sobre el mismo estado SHALL
reportar `no-op` y salir con código `0` sin escribir.

**Working-context.** Tras una aplicación exitosa, el subcomando SHALL refrescar el bloque proactivo
del working-context por la vía existente, derivando la raíz del directorio de la base. Un error de
render SHALL propagarse como salida distinta de `0`; el mensaje SHALL afirmar que la reparación sí
se aplicó y que el bloque quedó desactualizado.

**Salida.** Con `--json`, la salida SHALL ser un objeto JSON parseable con `status` (`ok`, `no-op`,
`no-db` o `error`), `memory_key`, `dry_run`, `applied`, `critical`, `removed[]` y `remaining`. Cada
entrada de `removed[]` SHALL incluir `kind`, `ref` —el texto declarado tal cual— y `reason`;
`remaining`, la cantidad de refs conservadas, SHALL estar presente sólo cuando `status` es `ok` o
`no-op`, y SHALL omitirse en `error` y en `no-db`. Cuando `status` es `error`, el objeto SHALL
incluir además `reason`, un string con el motivo del rechazo. El orden de `removed[]` SHALL ser el
orden de aparición en `content`, sin timestamps ni campos volátiles. Sin `--json`, SHALL imprimirse
un resumen legible. Si la base no existe, `status` SHALL ser `no-db` y la salida SHALL ser distinta
de `0`.

**Compatibilidad.** El change NO SHALL modificar el schema, los PRAGMAs persistentes ni
`ruleVersion`; un binario `0.36.0` SHALL leer el mismo estado persistido.

**Rollback.** Al no existir un comando `restore`, el procedimiento documentado SHALL ser: snapshot
previo con `memory snapshot --out`; para revertir, copiar el snapshot sobre `.ancleto/memory.db`,
borrar los sidecars `-wal`/`-shm` y verificar `PRAGMA quick_check='ok'`, la igualdad entre
`memory_fts_docsize` y `memory_nodes`, y el `content` restaurado. El nodo anterior SHALL quedar
`superseded` conservando su `content` original en la tabla; la recuperación soportada es el snapshot
previo (`memory snapshot --out`) y la inspección con `memory list --all`. `memory export` NO lo
incluye porque sólo exporta nodos activos.

#### Scenario: Ref inexistente removida con el resto del content intacto

- **WHEN** un nodo activo declara una ref `spec:`, `change:` o `path:` que resuelve `ok: false` con
  motivo `inexistente` junto con prosa y otras refs
- **THEN** el dry-run reporta esa ref en `removed[]` y no escribe
- **AND** `--apply` la remueve
- **AND** todo el `content` distinto de la línea removida permanece byte-idéntico, incluidas la
  prosa, la indentación y las demás refs

#### Scenario: Refs ambiguas no se remueven

- **WHEN** el nodo declara refs cuyo motivo es `ambiguo (<n> coincidencias)`
- **THEN** ninguna aparece en `removed[]`
- **AND** `--apply` las conserva en el `content`

#### Scenario: Refs no verificables nunca se remueven

- **WHEN** el nodo declara refs `commit:` o `workitem:`
- **THEN** no aparecen en `removed[]` en dry-run ni se eliminan con `--apply`
- **AND** `remaining` las cuenta entre las refs conservadas

#### Scenario: Dry-run estrictamente read-only

- **WHEN** se ejecuta `memory repair refs --memory-key <key>` sin `--apply`
- **THEN** los bytes de `.ancleto/memory.db`, los objetos de `sqlite_master` y el working-context
  son idénticos antes y después
- **AND** la salida reporta el plan de remoción

#### Scenario: Aplicación por supersede con FTS alineado

- **WHEN** se ejecuta `--apply` sobre un nodo con una ref `inexistente`
- **THEN** queda exactamente un nodo activo con esa `memory_key`
- **AND** `created_at`, `scope`, `type` y `justification` se preservan
- **AND** el nodo anterior queda `superseded` con su `content` original
- **AND** `memory_fts_docsize` coincide con la cantidad de filas de `memory_nodes`
- **AND** la búsqueda encuentra el `content` reparado

#### Scenario: Selección fail-closed por cardinalidad

- **WHEN** hay cero o más de un nodo activo con la `--memory-key`
- **THEN** el comando sale con código `1`
- **AND** no escribe la base ni el working-context

#### Scenario: Bloque malformado o repetido rechazado

- **WHEN** el nodo declara un bloque `refs:` malformado o más de un bloque `refs:`
- **THEN** el comando sale con código `1`
- **AND** no escribe la base ni el working-context

#### Scenario: Reparación que dejaría cero refs rechazada

- **WHEN** todas las refs del bloque son `inexistente`
- **THEN** el comando sale con código `1` sin escribir
- **AND** el mensaje remite a `memory export` y `memory import`

#### Scenario: Puerta de criticidad con exit 2

- **WHEN** la `memory_key` está en `.ancletorc` bajo `memory.criticalKeys`
- **THEN** el dry-run reporta `critical: true` y sale `0`
- **AND** `--apply` sin `--force-critical` sale `2`, no escribe y, con `--json`, emite
  `error: "critical-key-gate"`
- **AND** `--apply --force-critical` aplica la reparación

#### Scenario: Segunda corrida es no-op

- **WHEN** se repite el comando tras una aplicación exitosa
- **THEN** reporta `status: "no-op"`
- **AND** sale con código `0` sin escribir

#### Scenario: Rollback por snapshot verificado

- **WHEN** sobre una base temporal se toma un snapshot, se aplica la reparación y se restaura
  copiando el snapshot sobre la base
- **THEN** `PRAGMA quick_check` devuelve `ok`
- **AND** `memory_fts_docsize` coincide con `memory_nodes`
- **AND** el `content` es igual al previo a la reparación

#### Scenario: Sin cambios de schema y lectura por el binario previo

- **WHEN** se compara `sqlite_master` antes y después de `--apply`
- **THEN** no aparecen tablas, columnas ni índices nuevos
- **AND** un lector del estado persistido previo, como el binario `0.36.0`, sigue leyendo la base

#### Scenario: El plan no aplicable se rechaza antes de escribir

- **WHEN** un nodo activo declara una ref con motivo `inexistente` y otra con motivo
  `ambiguo (2 coincidencias)`
- **THEN** `memory repair refs --memory-key <k> --json` (dry-run) sale con código `1`,
  `status: "error"` y sin `removed`
- **AND** `--apply` sale con código `1` y no modifica bytes de la base ni el `working-context`
- **AND** el motivo nombra la ref no removible
- **AND** las refs `ambiguo` no se eliminan ni se reportan como removibles.

#### Scenario: Working-context refrescado tras reparar una regla crítica del proyecto

- **WHEN** `--apply` repara un nodo `type:'rule'`, `scope:'project'`
- **THEN** el bloque proactivo del working-context del proyecto se refresca y refleja el `content`
  nuevo
- **AND** el nodo `superseded` conserva el `content` original

### Requirement: Estado de memoria con `ancleto memory status`

El sistema SHALL exponer el subcomando `ancleto memory status [--json]` dentro de la familia
existente `memory`, como superficie read-only y advisory. El subcomando SHALL ser un wrapper fino
sobre un módulo puro en `src/core/memory/` y NO SHALL introducir una tool MCP nueva.

**Estados de la base.** `status` SHALL admitir exactamente cuatro valores: `ok` cuando el archivo
de la base existe, el esquema está inicializado y hay al menos un nodo activo; `empty` cuando el
archivo existe, el esquema está inicializado y hay cero nodos activos; `no-db` cuando el archivo
no existe; `uninitialized` cuando el archivo existe pero no tiene el esquema (por ejemplo, 0
bytes).

**Raíz de la evidencia.** La raíz de la evidencia y la del `dbPath` SHALL ser la misma: el
directorio de trabajo actual (`cwd`). La evidencia SHALL buscarse en `<cwd>/aspec/changes/archive` y
NUNCA SHALL resolverse subiendo a un directorio ancestro. En consecuencia, desde un subdirectorio
que no tiene un `aspec/changes/archive` propio, `expected` SHALL ser `false` y NO SHALL declararse
gap.

**Memoria esperable.** `expected` SHALL ser `true` cuando existe al menos un
`aspec/changes/archive/*/proposal.md` que cumple ambas condiciones: (i) contiene al menos una
línea que empieza con `## Decisiones`, admitiendo prefijos como `## Decisiones de producto`; y
(ii) contiene al menos una línea cuyo contenido, después de quitar la indentación y un bullet
opcional `- ` o `* `, empieza con `**memory_key:**`. Se aceptan por lo tanto `**memory_key:** valor`,
`- **memory_key:** valor` y `* **memory_key:** valor`; NO se acepta una línea con texto previo
distinto de un bullet, ni la forma con el marcador envuelto en backticks (`` `**memory_key:**` ``).
Los backticks alrededor del valor no afectan el match. El escaneo SHALL ser acotado,
con corte temprano en el primer archivo que cumple ambas condiciones. Un error de lectura de
cualquier archivo SHALL tratarse como no-match, de modo que el sistema NUNCA SHALL declarar un gap
por evidencia ilegible. NO SHALL considerarse evidencia la mera existencia de `.ancletorc`, de
`aspec/specs/**` ni de `CHANGELOG.md`.

**Gap.** `gap` SHALL ser `true` únicamente cuando `expected` es `true` y `status` es distinto de
`ok`.

**Salida humana.** Sin `--json`, el comando SHALL imprimir una línea con el estado. Cuando `gap`
sea `true`, SHALL imprimir además una línea accionable que nombre los caminos de recuperación
EXISTENTES: `ancleto memory export` para producir el JSON portable, `ancleto memory import` para
restaurarlo y `ancleto memory snapshot` para obtener una copia consistente con historial. Cuando
`gap` sea `false`, NO SHALL agregar advertencia alguna.

**Salida JSON.** Con `--json`, SHALL emitir un objeto JSON parseable con `status`, `expected`,
`gap`, `dbPresent`, `activeNodes`, `evidence` y `recovery`. `dbPresent` SHALL ser `true` cuando el
archivo exista, aun sin esquema. `activeNodes` SHALL ser `0` cuando no haya base o el esquema no
esté inicializado. `evidence` SHALL ser la cantidad de proposals archivados que aportaron evidencia
bajo el corte temprano (`1` cuando `expected` sea `true`, `0` cuando sea `false`). `recovery` SHALL
ser un array de comandos sugeridos y SHALL ser vacío cuando `gap` sea `false`.

**Códigos de salida.** El comando SHALL salir con código `0` en todos los estados, con y sin
`--json`, incluidos `empty`, `no-db` y `uninitialized`. El código `1` SHALL reservarse a un error
inesperado de E/S o de apertura de SQLite distinto de "archivo ausente"; en ese caso SHALL escribir
un mensaje en stderr sin stack trace. Una invocación con flags no reconocidas SHALL ser un error de
uso y SHALL salir con código `1`, con mensaje en stderr y sin stack trace, siguiendo el precedente de
`memory curate`. El comando NUNCA SHALL funcionar como gate.

**Read-only.** El comando SHALL verificar la existencia del archivo de la base antes de abrirlo y
SHALL abrirlo con migraciones deshabilitadas y acceso de sólo lectura. NO SHALL crear el directorio
`.ancleto/` ni el archivo `memory.db`; NO SHALL ejecutar `journal_mode=WAL`, migraciones, DDL,
`INSERT`, `UPDATE`, `DELETE`, checkpoint ni el refresh del working-context. La apertura read-only
PUEDE materializar `-shm` y un `-wal` de 0 bytes; esa materialización NO SHALL contar como escritura
ni reportarse como falla, y NO SHALL alterar el contenido de la base.

**Invariantes negativas.** El comando NO SHALL escribir memoria, NO SHALL importar nodos
automáticamente ni SHALL tocar `.ancleto/working-context.md`. NO SHALL declarar gap cuando no hay
evidencia versionada. NO SHALL ser un segundo gate de archive ni de promoción: no se invoca desde la
secuencia de archive, no altera el `healthy` ni el exit de `memory doctor`, y no altera el exit de
`ancleto check`.

**Compatibilidad.** El comando NO SHALL cambiar el schema, los PRAGMAs persistentes ni la forma del
export o del snapshot: el conjunto de objetos de `sqlite_master` y los PRAGMAs persistentes —en
particular `journal_mode`— SHALL ser idénticos antes y después, y las claves y los tipos de los
campos del JSON de `ancleto memory export` NO SHALL cambiar.

#### Scenario: Base con nodos activos reporta `ok` sin gap

- **WHEN** existe `.ancleto/memory.db` con esquema y al menos un nodo activo
- **AND** existe evidencia versionada de memoria esperable
- **THEN** `status` es `ok`
- **AND** `expected` es `true` y `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: Base inicializada sin nodos activos declara gap

- **WHEN** existe `.ancleto/memory.db` con esquema y cero nodos activos
- **AND** existe evidencia versionada de memoria esperable
- **THEN** `status` es `empty` y `gap` es `true`
- **AND** la salida humana nombra `ancleto memory export`, `ancleto memory import` y
  `ancleto memory snapshot`
- **AND** `recovery` contiene esos tres comandos
- **AND** el comando sale con código `0`

#### Scenario: Base ausente declara el gap sin crearla

- **WHEN** `.ancleto/memory.db` no existe
- **AND** existe evidencia versionada de memoria esperable
- **THEN** `status` es `no-db`, `dbPresent` es `false`, `activeNodes` es `0` y `gap` es `true`
- **AND** el comando sale con código `0`

#### Scenario: Archivo de 0 bytes reporta `uninitialized`

- **WHEN** el archivo `.ancleto/memory.db` existe con 0 bytes o sin esquema de memoria
- **AND** existe evidencia versionada de memoria esperable
- **THEN** `status` es `uninitialized`, `dbPresent` es `true`, `activeNodes` es `0` y `gap` es `true`
- **AND** el comando no crea el esquema ni escribe en el archivo
- **AND** el comando sale con código `0`

#### Scenario: `--json` expone el contrato completo

- **WHEN** se ejecuta `ancleto memory status --json`
- **THEN** la salida es un objeto JSON parseable
- **AND** incluye las claves `status`, `expected`, `gap`, `dbPresent`, `activeNodes`, `evidence` y
  `recovery`
- **AND** `recovery` es un array vacío cuando `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: Sin gap no se agrega advertencia

- **WHEN** el estado es `ok` y `expected` es `true`
- **THEN** la salida humana contiene una sola línea de estado
- **AND** no agrega ninguna advertencia ni línea accionable
- **AND** `recovery` es la lista vacía

#### Scenario: `## Decisiones` sin una forma soportada de `memory_key` no es evidencia

- **WHEN** un `proposal.md` archivado contiene una línea `## Decisiones`
- **AND** no contiene ninguna línea con `**memory_key:**` en columna 0 ni con un bullet `- ` o `* `
  antes del marcador
- **AND** la única línea candidata envuelve el marcador en backticks (`` `**memory_key:**` ``)
- **AND** ningún otro archive aporta evidencia
- **THEN** `expected` es `false`
- **AND** `gap` es `false` aun cuando el estado sea `empty` o `no-db`
- **AND** el comando sale con código `0`

#### Scenario: `**memory_key:**` sin `## Decisiones` no es evidencia

- **WHEN** un `proposal.md` archivado contiene una línea que empieza con `**memory_key:**`
- **AND** no contiene ninguna línea que empiece con `## Decisiones`
- **AND** ningún otro archive aporta evidencia
- **THEN** `expected` es `false`
- **AND** `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: El prefijo `## Decisiones de producto` es evidencia

- **WHEN** un `proposal.md` archivado contiene una línea `## Decisiones de producto`
- **AND** contiene al menos una línea que empieza con `**memory_key:**`
- **THEN** `expected` es `true`
- **AND** `evidence` es `1`

#### Scenario: Las formas soportadas de la clave son evidencia

- **WHEN** un `proposal.md` archivado declara `## Decisiones` y la clave en columna 0
  (`**memory_key:** valor`), como `2026-11-13-ch-04-memory-writer-serialization/proposal.md`
- **AND** otro declara `## Decisiones` y la clave con bullet `-`
  (`- **memory_key:** valor`), como `2026-11-16-memory-repair-refs/proposal.md`
- **AND** otro declara `## Decisiones` y la clave con bullet `*` (`* **memory_key:** valor`)
- **THEN** `expected` es `true` en los tres casos
- **AND** `evidence` es `1` por el corte temprano
- **AND** una clave cuyo valor viene entre backticks, como en
  `2026-11-04-ch-12-agentic-model-discovery/proposal.md`, también es evidencia

#### Scenario: Un error de lectura no declara gap

- **WHEN** la lectura de un `proposal.md` archivado falla
- **AND** ningún otro archive aporta evidencia
- **THEN** ese archivo se trata como no-match
- **AND** `expected` es `false` y `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: Repo sin evidencia versionada nunca declara gap

- **WHEN** `aspec/changes/archive` no existe o no contiene ningún `proposal.md` con el predicado
- **AND** el estado es `no-db`, `uninitialized` o `empty`
- **THEN** `expected` es `false` y `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: Desde un subdirectorio sin archive propio no declara gap

- **WHEN** se ejecuta `ancleto memory status --json` desde un subdirectorio del repo
- **AND** ese subdirectorio no tiene `aspec/changes/archive`
- **AND** el repo padre sí tiene `aspec/changes/archive` con evidencia
- **AND** la base bajo el `cwd` no existe
- **THEN** `expected` es `false` y `gap` es `false`
- **AND** la evidencia no se busca subiendo a un directorio ancestro
- **AND** el comando sale con código `0`

#### Scenario: No crea `.ancleto/` ni el archivo de base

- **WHEN** se ejecuta `ancleto memory status` en un repo sin `.ancleto/`
- **THEN** el directorio `.ancleto/` no se crea
- **AND** el archivo `.ancleto/memory.db` no se crea

#### Scenario: No escribe memoria

- **WHEN** se ejecuta `ancleto memory status` sobre una base con nodos
- **THEN** los bytes del archivo `.db` son idénticos antes y después
- **AND** la cantidad de nodos y sus `status`, `content` y `superseded_by` no cambian
- **AND** el conjunto de objetos de `sqlite_master` es idéntico antes y después
- **AND** dos corridas consecutivas son idempotentes

#### Scenario: No toca el working-context

- **WHEN** existe `.ancleto/working-context.md` y se ejecuta `ancleto memory status`
- **THEN** el contenido del archivo es idéntico antes y después
- **AND** el comando no lo regenera aunque `gap` sea `true`

#### Scenario: No importa nodos automáticamente

- **WHEN** existe un JSON de export disponible y `ancleto memory status` reporta `gap` `true`
- **THEN** ningún nodo se importa
- **AND** `activeNodes` no cambia respecto del estado previo

#### Scenario: La señal no altera `memory doctor` ni `ancleto check`

- **WHEN** se ejecuta `ancleto memory status` con `gap` `true`
- **THEN** el `healthy` y el código de salida de `memory doctor` son los mismos que antes de la corrida
- **AND** el código de salida de `ancleto check` es el mismo que antes de la corrida

#### Scenario: Los sidecars de la lectura read-only no cuentan como escritura

- **WHEN** se ejecuta `ancleto memory status` sobre una fixture en `journal_mode=DELETE` sin sidecars
- **THEN** los bytes del archivo `.db` son idénticos antes y después
- **AND** pueden aparecer `-shm` y un `-wal` de 0 bytes, y eso no se reporta como falla
- **AND** una segunda corrida no cambia ningún byte respecto de la primera

#### Scenario: Exit code `0` en todos los estados

- **WHEN** se ejecuta `ancleto memory status`, con y sin `--json`, en los estados `ok`, `empty`,
  `no-db` y `uninitialized`
- **THEN** el comando sale con código `0` en todos los casos

#### Scenario: Un error inesperado de apertura sale con código `1`

- **WHEN** el archivo de base existe pero no puede abrirse o leerse por un error de E/S o de SQLite
  distinto de "archivo ausente"
- **THEN** el comando sale con código `1`
- **AND** escribe un mensaje en stderr
- **AND** no imprime stack trace

#### Scenario: Una flag no reconocida es un error de uso

- **WHEN** se ejecuta `ancleto memory status` con una flag no reconocida
- **THEN** el comando sale con código `1`
- **AND** escribe un mensaje en stderr
- **AND** no imprime stack trace
- **AND** no crea ni escribe la base

#### Scenario: Compatibilidad del estado persistido

- **WHEN** se ejecuta `ancleto memory status` sobre una base existente
- **THEN** el conjunto de objetos de `sqlite_master` es idéntico antes y después
- **AND** los PRAGMAs persistentes, en particular `journal_mode`, son idénticos antes y después
- **AND** las claves y los tipos de los campos del JSON de `ancleto memory export` no cambian

_No-testeable-por-construcción: que el comando no se invoque desde la secuencia de archive ni desde
la promoción es una propiedad de composición sin salida observable directa. Se ancla en el contrato
del comando descrito arriba y en la revisión de código; el efecto observable —que `doctor` y
`check` no cambian— sí queda cubierto por escenario._
