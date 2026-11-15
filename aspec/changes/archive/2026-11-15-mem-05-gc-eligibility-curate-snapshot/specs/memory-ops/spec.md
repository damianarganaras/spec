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
