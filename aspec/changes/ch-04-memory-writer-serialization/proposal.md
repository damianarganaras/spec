# Proposal: Serialización segura de escritores concurrentes sobre la base de memoria

## Contexto y problema

La memoria del repositorio vive en `.ancleto/memory.db` (SQLite nativo `node:sqlite`, WAL + FTS5) y
es escrita por cinco caminos del engine: `recordNode`, `import`, `gc`, `merge` y `consolidate`. El
ítem #4 del backlog ("exclusión mutua de escritores") se difirió cinco veces con la etiqueta
**"prosa-only, sin mutex ejecutable"**, asumiendo que no existía serialización real. Esa premisa es
**parcialmente falsa**: el mutex ya existe en el código y funciona para la contención normal.

Anclas canónicas de esta propuesta:

- `spec:memory-engine#Idempotencia de reescritura idéntica en recordNode`
  (`aspec/specs/memory-engine/spec.md:914`) — ancla del camino único de escritura.
- `spec:prompt-contracts#Paralelización de la finalización y el registro de memoria`
  (`aspec/specs/prompt-contracts/spec.md:539`) — el orquestador no puede serializarse.
- `spec:memory-ops#Merge de nodos por supersesión` (`aspec/specs/memory-ops/spec.md:473`).
- `spec:memory-engine#Validación fail-closed de refs en el camino único de escritura`
  (`aspec/specs/memory-engine/spec.md:641`).

### Evidencia verificada

Lo que **ya existe**:

- `src/core/memory/database.js:49-51` aplica `journal_mode = WAL`, `foreign_keys = ON` y
  `busy_timeout = 5000`; `:46` también fija `busy_timeout` en la apertura read-only.
- `BEGIN IMMEDIATE` en los cinco caminos de escritura, con `COMMIT`/`ROLLBACK` pareados:
  `src/core/memory/engine.js:938` (recordNode), `:1043` (import), `:1108` (gc), `:1182` (merge) y
  `:1284` (consolidate).
- FTS5 external-content con los tres triggers AI/AD/AU en `src/core/memory/database.js:24-39`, de
  modo que la escritura del índice es transaccional con la de `memory_nodes`.
- Checkpoint centralizado en `src/core/memory/database.js:90-97`.

Lo que **falta** (gap real):

- Ningún camino captura `SQLITE_BUSY`/`SQLITE_LOCKED` ni reintenta: el error crudo del driver llega
  al usuario.
- No hay un error nombrado que identifique la contención como causa.
- No hay oráculo offline reproducible que pruebe la concurrencia sin tocar la base real.

Medición empírica ya realizada (8 procesos hijos × 25 escrituras sobre una copia temporal): con el
código actual hay 0 errores, exactamente 1 nodo activo por `memory_key`, conteo de superseded exacto,
FTS == `memory_nodes` y `quick_check ok`. El gap es reproducible cuando un escritor retiene el
write-lock 7 s: el engine falla a los 5053 ms con `SQLITE_BUSY` crudo; con retry acotado commitea a
los 7032 ms. Contramedición medida: `DEFERRED` + retry **pierde escrituras** por
`SQLITE_BUSY_SNAPSHOT` (errcode 517), por eso el retry va sobre `BEGIN IMMEDIATE`.

## Requisito citado

- `spec:memory-engine#Idempotencia de reescritura idéntica en recordNode`
- `spec:prompt-contracts#Paralelización de la finalización y el registro de memoria`

El delta vive en `memory-engine` porque ese engine es dueño del camino de escritura. No se reescribe
ningún requirement existente: se agrega uno nuevo con `## ADDED Requirements`.

## Alcance

In scope:

- `src/core/memory/database.js` — helper único de transacción de escritura, política exportada como
  constante y error nombrado con `code`/`name`.
- `src/core/memory/engine.js` — los cinco caminos de escritura reutilizan el helper; ningún otro
  comportamiento cambia.
- `test/memory-writers.test.js` y su fixture de proceso hijo — oráculo offline sobre base temporal.
- `test/affected-tests.json` — declaración de la suite nueva para la selección por affected-set.
- `aspec/changes/ch-04-memory-writer-serialization/**` — estos artefactos.
- `aspec/backlog.md` — cierre del ítem #4 al terminar la implementación.

Out of scope (explícito):

- Lockfile con PID/stale detection.
- Broker o proceso single-writer.
- `BEGIN DEFERRED` con retry (pierde escrituras por errcode 517).
- Cambios de PRAGMAs persistidos (`journal_mode`, `synchronous`), schema, índices o `busy_timeout`.
- `ruleVersion` (pertenece al estado de discovery, no a la base).
- La reparación `memory doctor --rebuild` (sexto camino de escritura, preexistente y fuera del
  file-set de este change): no adquiere el helper y queda como deuda registrada.
- `agents/**`, `skills/**`, `templates/**`, `commands/**`, `.opencode/**`, `opencode.json`, `docs/**`.
- La base real `.ancleto/memory.db` durante los tests.

## Supuestos

- `node:sqlite` expone `errcode` en los errores de `DatabaseSync`, suficiente para distinguir 5/6.
- `busy_timeout` aplica a `BEGIN IMMEDIATE` y el driver devuelve el error al agotarse ese timeout.
- La medición empírica citada se reprodujo en el entorno del repo (Windows, Node ≥ 24).

## Riesgos con mitigación

- **Latencia ampliada bajo contención sostenida.** El presupuesto es acotado: 3 intentos como máximo y
  backoff determinístico de 200/600 ms; no hay retry infinito.
- **Enmascarar errores que no son de lock.** Sólo se reintenta errcode 5/6; validación fail-closed de
  refs, secretos y grupo inválido hacen rollback y se propagan tal cual.
- **Serializar de más y romper la paralelización.** El mecanismo es por conexión y por transacción,
  sin lock global de proceso; las superficies `aspec/changes/archive/` y `.ancleto/memory.db` siguen
  disjuntas.
- **Cambiar el orden de validación.** El helper sólo reemplaza begin/commit/rollback; las
  validaciones siguen ejecutándose antes de abrir la transacción.
- **Oráculo frágil por tiempos.** Se usan márgenes amplios y aserciones de estado final (nodos,
  superseded, FTS, `quick_check`), no de duración exacta, salvo el umbral > 5000 ms que prueba que la
  contención superó `busy_timeout`.
- **Suite lenta en CI.** La concurrencia y el lock retenido son costosos pero acotados; se mantienen
  N y M pequeños y el test se declara en el affected-set para no correrlo fuera de contexto.
- **Reejecutar un cuerpo ya iniciado.** El retry cubre sólo la adquisición del lock; una transacción
  ya abierta nunca se re-ejecuta.
- **Garantía sobre-afirmada por un sexto escritor preexistente.** El delta acota el SHALL a los cinco
  caminos del engine; `doctor --rebuild` se registra como deuda en el backlog.

## Plan de validación

Comandos declarados en `PRODUCT.md` → `## Project Commands`:

- Lint: `npm run lint`.
- Tests acotados de memoria con rutas explícitas:
  `node --test test/memory-engine.test.js test/memory-writers.test.js test/stats-failures.test.js test/curation.test.js`.
- Suite completa: `npm test`.
- Selección de tests: `node --test test/test-selection.test.js`.
- Format check: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (JavaScript ESM, sin `tsconfig.json`).

## Decisiones

**memory_key:** memory-writer-serialization

**Elección:** conservar `busy_timeout = 5000` y WAL, y agregar un helper único de transacción de
escritura con `BEGIN IMMEDIATE` + retry acotado (máximo 3 intentos, backoff 200/600 ms sin jitter),
error nombrado `MEMORY_DB_BUSY` y un oráculo offline en `test/memory-writers.test.js`; los cinco
caminos del engine lo reutilizan.

**Descartado:** lockfile PID/stale; broker single-writer; WAL + retry sin `BEGIN IMMEDIATE`;
NO-OP/documentar el límite.

**Justificación:** el código actual ya es, en sustancia, "busy_timeout + `BEGIN IMMEDIATE`"
(`src/core/memory/database.js:49-51`, `src/core/memory/engine.js:938,1043,1108,1182,1284`) y mide 0
errores con 8×25 escrituras concurrentes; el gap aparece con un lock retenido 7 s (falla a los
5053 ms con `SQLITE_BUSY` crudo, con retry commitea a los 7032 ms). `DEFERRED` + retry pierde
escrituras por `SQLITE_BUSY_SNAPSHOT` (errcode 517), y un lockfile/broker agregaría estado y un punto
de fallo que el propio SQLite ya resuelve. Falta sólo retry acotado, error nombrado y oráculo.

**Refs:**
- spec:memory-engine#Idempotencia de reescritura idéntica en recordNode
- spec:memory-ops#Merge de nodos por supersesión
- change:ch-04-memory-writer-serialization

**Estado:** aprobado
