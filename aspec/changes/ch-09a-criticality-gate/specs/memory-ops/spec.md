# Spec delta: ch-09a-criticality-gate — memory-ops

## MODIFIED Requirements

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
