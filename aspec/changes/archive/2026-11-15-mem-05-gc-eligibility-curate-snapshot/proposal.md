# Proposal: MEM-05 — GC por instante, snapshot de lectura en curaduría y gramática de refs con fuente única

## Contexto y problema

Tres defectos medidos comparten una misma raíz: decisiones de elegibilidad y de composición tomadas
sobre texto y sobre lecturas sueltas, no sobre instantes ni sobre un snapshot.

**MEM-05d — la elegibilidad de `memory gc` compara texto, no instantes.** El cutoff se calcula una
vez en `src/core/memory/engine.js:1166` como
`new Date(Date.now() - days * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z')` — es decir, **sin**
milisegundos. Los cuatro writers de supersesión escriben `new Date().toISOString()` **con**
milisegundos (`engine.js:1056`, `:1121`, `:1251`, `:1341`). Los tres statements de GC comparan texto:
SELECT (`engine.js:820-823`), DELETE (`:829-831`) y DETACH de `superseded_by` (`:839-845`), todos con
`COALESCE(superseded_at, created_at) < ?`. En el mismo segundo, `...:00.123Z` ordena **antes** que
`...:00Z` porque `'.' < 'Z'`: un nodo superseded en `[cutoff, cutoff + 1 s)` se considera anterior al
cutoff y se purga hasta casi 1 s antes de tiempo con cualquier `--days`. Es un defecto de corrección,
no de rendimiento: `julianday()` sobre ambas formas devuelve un número válido y ordena por instante.

**CH-09f — `memory curate` lee sus dos insumos en dos snapshots distintos.** `curateMemory`
(`src/core/memory/curation.js:27-88`) hace `engine.listNodes({ status: 'active' })` (`:34`) y
`engine.consolidate({ dryRun: true, includeNearDuplicates: false })` (`:79`) en dos statements sin
transacción. Bajo un escritor concurrente, las dos lecturas ven estados commiteados distintos (se
midió un listado de 3 nodos y una detección posterior sobre 4). El reporte puede describir un estado
que nunca existió.

**CH-09g — el literal de gramática de refs vive duplicado.** El mismo par de literales (`'refs:'` y
`'inválido (gramática)'`) aparece en dos puntos de clasificación: `engine.js:714` y `:718` dentro de
`inspectRefs` (consumido por `doctor`) y `curation.js:53` y `:57` dentro de `curateMemory`. El texto
observable y los exit codes no deben cambiar; la definición, sí debe tener un solo dueño.

Anclas canónicas:

- `spec:memory-ops#Garbage collection de nodos superseded` (`aspec/specs/memory-ops/spec.md:115`).
- `spec:memory-ops#Curaduría read-only con memory curate` (`aspec/specs/memory-ops/spec.md:1169`; el
  heading literal incluye backticks alrededor de `memory curate`, que la resolución canónica elimina).

## Requisito citado

- `spec:memory-ops#Garbage collection de nodos superseded` — heading literal
  `### Requirement: Garbage collection de nodos superseded`.
- `spec:memory-ops#Curaduría read-only con memory curate` — heading literal
  `### Requirement: Curaduría read-only con` seguido de `memory curate` entre backticks; la
  resolución canónica elimina los backticks, por eso la ref sin ellos resuelve.

El delta vive en `memory-ops` porque esa capability es dueña del contrato de GC y de curaduría. Se
reescriben **completos** los dos requirements con `## MODIFIED Requirements`; no se crea una
capability nueva.

## Alcance

In scope:

- `src/core/memory/database.js` — `runReadTransaction(db, fn)`: `BEGIN DEFERRED`, sin retry, sin
  escribir, `ROLLBACK` ante error; hermano de `runImmediateTransaction` (`database.js:141`).
- `src/core/memory/engine.js` — los **tres** statements de GC pasan a
  `julianday(COALESCE(superseded_at, created_at)) < julianday(?)` con un único cutoff por invocación;
  una constante exportada con el literal de gramática de refs usada por `inspectRefs`; método
  `readTransaction(fn)` sobre la conexión existente, válido también para el engine read-only
  (`engine.js:761-763`).
- `src/core/memory/curation.js` — `listNodes` y `consolidate({ dryRun: true })` dentro de
  `engine.readTransaction(...)`, con los resultados capturados; resolución de refs contra el
  filesystem **después** del commit; importa la constante de gramática.
- `aspec/changes/mem-05-gc-eligibility-curate-snapshot/specs/memory-ops/spec.md` — delta `MODIFIED`.
- `test/memory-engine.test.js`, `test/curation.test.js` y `test/memory-writers.test.js` — cobertura
  de frontera de segundo, formatos mixtos, fechas no parseables, `deleted` reservado, snapshot único.

Out of scope (explícito):

- Índices, tablas, columnas, triggers o vistas nuevos. El contrato de `memory-ops`/`memory-engine`
  los prohíbe; el `SCAN memory_nodes` se acepta como limitación.
- Cambiar el formato persistido de `superseded_at`/`created_at`.
- Tocar los cinco caminos de escritura, el statement `supersede` o su formato de fecha.
- `runImmediateTransaction` para lectura (pide lock de escritura y reintenta: es otro mecanismo).
- `agents/**`, `skills/**`, `commands/**`, `templates/**`, `.opencode/**`, `opencode.json`, las tres
  superficies de modelo, `docs/PLAN*`, `docs/BACKLOG_*`, `aspec/changes/ancleto-vscode-extension/**`.
- `memory gc` real sobre `.ancleto/memory.db`; toda prueba usa bases temporales.
- El bump de versión a `0.35.0` (MINOR) queda para FASE 9: este change no edita `package.json`.

## Supuestos

- `julianday()` acepta las dos formas ISO-8601 persistidas (con y sin milisegundos) y devuelve `NULL`
  para un valor no parseable. Medido sobre `node:sqlite` con SQLite 3.51.3.
- `BEGIN DEFERRED` sobre una conexión `readOnly: true` en WAL produce un snapshot consistente, no abre
  camino de escritura (un `INSERT` falla con "attempt to write a readonly database") y no bloquea a un
  writer activo.
- Ningún camino de escritura produce `status='deleted'`: el valor del CHECK (`database.js:11`) es un
  estado reservado, inalcanzable por código.
- Los cuatro writers seguirán escribiendo milisegundos: este change no normaliza el dato persistido.

## Riesgos con mitigación

- **Cambiar el conjunto purgado por accidente.** Sólo cambia la comparación; el cutoff, el umbral, el
  orden DETACH→DELETE, `VACUUM`/`REINDEX`, la exclusión de `active` y la preparación lazy quedan
  iguales. Los escenarios de paridad dry-run/purge y de edad de supersesión se conservan literales.
- **Un valor no parseable se vuelve elegible por NULL.** La comparación con NULL no es verdadera, así
  que la fila se retiene. Se cubre con test explícito; la política es conservadora: nunca purgar por
  un valor que no se puede interpretar.
- **Una transacción de lectura retiene el WAL y frena el checkpoint.** La transacción cubre sólo dos
  statements en memoria; la resolución de refs contra el filesystem ocurre después del `COMMIT`. Se
  verifica que un escritor concurrente confirme y que no quede transacción abierta al volver.
- **Reutilizar el helper de escritura para leer.** `runImmediateTransaction` hace `BEGIN IMMEDIATE` y
  reintenta contención: es el mecanismo equivocado para lectura y lo prohíbe el contrato de este
  change. Se agrega un helper hermano sin retry y sin escritura.
- **Deriva del texto de gramática inválida.** La constante exportada conserva exactamente
  `'refs:'` y `'inválido (gramática)'`; el test compara la salida con la del diagnóstico vigente.
- **Costo de `SCAN`.** `EXPLAIN QUERY PLAN` da el mismo `SCAN memory_nodes` con texto y con
  `julianday`; el DELETE suma un segundo `SCAN` por la self-FK. Se acepta y se documenta; no se agrega
  índice porque el contrato lo prohíbe.
- **Read-only que no puede abrir transacción.** El engine read-only comparte `buildEngine`
  (`engine.js:768-772`), así que hereda `readTransaction`; se prueba sobre `createReadonlyMemoryEngine`.

## Plan de validación

Comandos declarados en `PRODUCT.md` → `## Project Commands`:

- Lint: `npm run lint`.
- Tests acotados con rutas explícitas:
  `node --test test/memory-engine.test.js test/curation.test.js test/memory-writers.test.js`.
- Suite completa: `npm test`.
- Format check: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (JavaScript ESM, sin `tsconfig.json`).

## Paths autorizados del change

- `src/core/memory/database.js`
- `src/core/memory/engine.js`
- `src/core/memory/curation.js`
- `test/memory-engine.test.js`
- `test/curation.test.js`
- `test/memory-writers.test.js`
- `aspec/changes/mem-05-gc-eligibility-curate-snapshot/**`

## Decisiones

- **memory_key:** memory-gc-instant-comparison
- **Elección:** comparar la elegibilidad de GC como instantes con
  `julianday(COALESCE(superseded_at, created_at)) < julianday(?)` en los tres statements —selección
  del dry-run, borrado y desvinculación de `superseded_by`— alimentados por un único cutoff calculado
  una vez por invocación.
- **Descartado:** normalizar el texto persistido (reescribir `superseded_at` con o sin
  milisegundos) para que la comparación textual alcance; agregar un índice sobre `status` y la fecha.
- **Justificación:** los cuatro writers escriben milisegundos y el cutoff no, y el orden textual pone
  `'.'` antes que `'Z'`, purgando hasta casi 1 s antes en el segundo de frontera. `julianday()`
  ordena por instante en ambas formas y devuelve NULL para un valor no parseable, lo que retiene la
  fila (conservador). El `EXPLAIN QUERY PLAN` es el mismo `SCAN` con texto y con `julianday`, y el
  contrato prohíbe índices nuevos, así que el desempeño no justifica cambiar el dato.
- **Refs:**
- spec:memory-ops#Garbage collection de nodos superseded
- change:mem-05-gc-eligibility-curate-snapshot
- **Estado:** aprobado

- **memory_key:** memory-curate-read-snapshot
- **Elección:** agregar `runReadTransaction(db, fn)` en `database.js` (`BEGIN DEFERRED`, sin retry, sin
  escribir, `ROLLBACK` ante error) y `engine.readTransaction(fn)`; `curateMemory` lee `listNodes` y
  `consolidate({ dryRun: true })` dentro de esa transacción y resuelve refs contra el filesystem
  después del commit.
- **Descartado:** reutilizar `runImmediateTransaction` (`BEGIN IMMEDIATE` + retry) para la lectura;
  dejar las dos lecturas sin transacción y deduplicar estados; abrir una segunda conexión.
- **Justificación:** dos statements sin transacción ven estados commiteados distintos bajo un escritor
  concurrente (listado 3→4 medido). `BEGIN DEFERRED` sobre la conexión `readOnly: true` en WAL da un
  snapshot consistente, no abre camino de escritura (el `INSERT` falla con "attempt to write a
  readonly database") y no bloquea al writer. El helper de escritura adquiere lock de escritura y
  reintenta contención, lo que es incorrecto para una lectura read-only.
- **Refs:**
- spec:memory-ops#Curaduría read-only con memory curate
- change:mem-05-gc-eligibility-curate-snapshot
- **Estado:** aprobado

- **memory_key:** memory-ref-grammar-single-source
- **Elección:** exportar desde `engine.js` una única constante con el literal de clasificación de
  gramática (`'refs:'` y `'inválido (gramática)'`) y consumirla tanto en `inspectRefs` como en
  `curateMemory`.
- **Descartado:** mantener el literal duplicado en los dos módulos; mover la clasificación a un módulo
  nuevo.
- **Justificación:** el mismo par de literales aparece en cuatro puntos (`engine.js:714`, `:718`,
  `curation.js:53`, `:57`); una definición única elimina la deriva sin cambiar el texto observable, el
  orden ni los exit codes. Un módulo nuevo no aporta: el dueño natural del parser y de su gramática ya
  es el engine.
- **Refs:**
- spec:memory-ops#Curaduría read-only con memory curate
- spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos
- change:mem-05-gc-eligibility-curate-snapshot
- **Estado:** aprobado
