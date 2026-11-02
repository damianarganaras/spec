# Delta: memory-ops

## ADDED Requirements

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
de cada grupo exacto, dejándolos con `status='superseded'` y `superseded_by` igual al `id`
del canónico. La operación NO SHALL borrar filas, NO SHALL crear nodos y NO SHALL modificar
`memory_key` ni `content` del canónico. Todos los grupos SHALL aplicarse en una sola
transacción atómica: si un miembro dejó de estar activo al momento de escribir, la
transacción SHALL hacer rollback total. Una segunda corrida sobre el mismo estado SHALL
reportar cero grupos aplicables.

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

**Sin schema.** La operación NO SHALL crear tablas, columnas, índices ni migraciones. El
conjunto de objetos de `sqlite_master` SHALL ser idéntico antes y después de `--apply`.

#### Scenario: Dry-run no escribe

- **WHEN** se ejecuta `ancleto memory consolidate` sobre una base con un grupo de duplicados
  exactos
- **THEN** el reporte incluye el grupo y su canónico
- **AND** ningún nodo cambia `status` ni `superseded_by`
- **AND** el bloque de contexto derivado no se reescribe

#### Scenario: Grupo exacto elige canónico por refs y supersede el resto

- **WHEN** se ejecuta `--apply` sobre un grupo de tres nodos del mismo `type` con el mismo
  `content` normalizado, donde uno declara dos refs, otro una y otro ninguna
- **THEN** el nodo con dos refs permanece activo como canónico
- **AND** los otros dos quedan con `status='superseded'`
- **AND** el `superseded_by` de cada uno es igual al `id` del canónico
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
- **AND** no se creó ninguna tabla, columna ni índice
