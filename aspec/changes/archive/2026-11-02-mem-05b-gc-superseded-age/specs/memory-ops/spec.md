# Delta: memory-ops — GC mide la antigüedad de supersesión

## MODIFIED Requirements

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
`recordNode`, `importNodes`, `merge` y `consolidate`. Los statements de selección y borrado de GC
(`gcSelect`, `gcDelete`) SHALL prepararse dentro de la invocación de `gcSuperseded`. El objetivo es
que un engine read-only abierto con `migrate: false` sobre una base previa a la columna no falle al
construirse, de modo que `memory doctor` y `memory list` sigan funcionando sobre esa base.

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

### Requirement: Consolidación determinística de nodos duplicados

El sistema SHALL exponer el subcomando `ancleto memory consolidate [--apply] [--json]` dentro
de la familia existente `memory`. Sin `--apply`, el subcomando SHALL operar en dry-run por
defecto y NO SHALL escribir en la base de datos ni en el filesystem. El subcomando SHALL
aceptar `--json` para una salida estructurada. El subcomando SHALL ser un wrapper fino sobre
la operación del engine y NO SHALL introducir una tool MCP nueva.

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
Con `--json`, la salida SHALL ser un objeto JSON parseable.

**Read-only.** El engine SHALL exponer `consolidate({ dryRun = true } = {})`. En el engine
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
