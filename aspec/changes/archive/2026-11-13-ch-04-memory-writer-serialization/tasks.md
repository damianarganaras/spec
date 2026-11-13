# Tasks: Serialización segura de escritores concurrentes sobre la base de memoria

> Change funcional. Sin `design.md`.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test` (`node --test "test/*.test.js"`); para pasos acotados, rutas explícitas.
> Format check `not-configured`; typecheck no aplica (JavaScript ESM, sin `tsconfig.json`).

## File-set de implementación (autorizado)

- `src/core/memory/database.js` — helper único, política y error nombrado.
- `src/core/memory/engine.js` — sólo los cinco caminos de escritura.
- `test/memory-writers.test.js` (nuevo) — oráculo offline.
- `test/fixtures/memory-writer-child.mjs` (nuevo) — fixture de proceso hijo.
- `test/affected-tests.json` — declaración de la suite nueva.
- `aspec/backlog.md` — cierre del ítem #4.
- `aspec/changes/ch-04-memory-writer-serialization/**` — estos artefactos.

Fuera del file-set: schema, índices, PRAGMAs persistidos, `ruleVersion`, `agents/**`, `skills/**`,
`templates/**`, `commands/**`, `.opencode/**`, `opencode.json`, `docs/**` y la base real
`.ancleto/memory.db`.

## Fase 1 — Helper único de transacción de escritura

- [ ] **1.1** Exportar en `src/core/memory/database.js` la política como constante inmutable: máximo
  3 intentos y backoff creciente de 200 ms y 600 ms, sin jitter.
  **Hecho cuando:** la constante expone exactamente esos valores, no tiene estado mutable y es la
  única fuente que consume el helper.
- [ ] **1.2** Exportar el error nombrado de contención con `name`, `code = 'MEMORY_DB_BUSY'`, nombre de
  la operación e intentos realizados.
  **Hecho cuando:** el error es una instancia de `Error`, `code` y `name` son estables y legibles, y
  el mensaje no incluye contenido de nodos ni secretos.
- [ ] **1.3** Implementar en `src/core/memory/database.js` el helper único de transacción de escritura:
  `BEGIN IMMEDIATE`, cuerpo, `COMMIT`; ante cualquier error, `ROLLBACK` y propagación.
  **Hecho cuando:** ningún `BEGIN`/`COMMIT`/`ROLLBACK` de los cinco caminos queda fuera del helper y
  el comportamiento observable de una transacción exitosa no cambia.
- [ ] **1.4** Reintentar sólo la adquisición del lock ante errcode 5/6 (`SQLITE_BUSY`/`SQLITE_LOCKED`),
  hasta 3 intentos, con backoff 200/600 ms; al agotar el presupuesto, lanzar `MEMORY_DB_BUSY`.
  **Hecho cuando:** una transacción ya abierta nunca se re-ejecuta, el error final nombra la
  operación y los intentos, y no queda transacción abierta al propagarse.
- [ ] **1.5** No reintentar errores que no son de lock: validación fail-closed de refs, rechazo de
  secretos y grupo inválido hacen rollback y se propagan sin cambios.
  **Hecho cuando:** los tests existentes de validación e idempotencia siguen verdes sin relajar sus
  expectativas.

## Fase 2 — Reutilización en los cinco caminos de escritura

- [ ] **2.1** `recordNode` (`src/core/memory/engine.js:938`) usa el helper conservando las
  validaciones previas (`looksLikeSecret`, `validateRefsForWrite`) y la comprobación de identidad.
  **Hecho cuando:** la idempotencia y el shape devuelto no cambian, y la validación sigue ocurriendo
  antes de abrir la transacción.
- [ ] **2.2** `import` (`src/core/memory/engine.js:1043`) usa el helper conservando la semántica
  last-writer-wins por `createdAt`.
  **Hecho cuando:** sus tests de import siguen verdes y no hay begin/commit/rollback duplicados.
- [ ] **2.3** `gc` (`src/core/memory/engine.js:1108`) usa el helper conservando el orden de
  actualización de referencias antes del `DELETE`.
  **Hecho cuando:** sus tests de gc siguen verdes y la liberación de la FK diferida no cambia.
- [ ] **2.4** `merge` (`src/core/memory/engine.js:1182`) usa el helper conservando la supersesión y el
  refresh derivado fuera de la transacción.
  **Hecho cuando:** sus tests de merge siguen verdes y el error de lock no deja la base a medio
  merge.
- [ ] **2.5** `consolidate` (`src/core/memory/engine.js:1284`) usa el helper conservando el
  determinismo de la consolidación y el refresh derivado fuera de la transacción.
  **Hecho cuando:** sus tests de consolidate siguen verdes y el error de lock no deja nodos
  duplicados activos.

## Fase 3 — Verificación de caminos read-only

- [ ] **3.1** Verificar que `doctor`, `curate`, los dry-run de `merge`/`consolidate` y `snapshot` no
  llaman al helper ni adquieren retry.
  **Hecho cuando:** una inspección de sus rutas y sus tests confirman cero `BEGIN IMMEDIATE` y cero
  escrituras.
- [ ] **3.2** Verificar que `openDatabase(..., { migrate: false })` y la apertura read-only conservan
  `busy_timeout` y no escriben.
  **Hecho cuando:** un lector concurrente con un escritor activo no falla y la base no cambia.

## Fase 4 — Oráculo offline `test/memory-writers.test.js`

- [ ] **4.1** Crear `test/fixtures/memory-writer-child.mjs`: recibe por argumentos la ruta de la base
  temporal y sus escrituras, usa el engine real y reporta el resultado por stdout.
  **Hecho cuando:** el fixture nunca abre `.ancleto/memory.db`, no depende del cwd y propaga un exit
  code distinto de cero ante fallo.
- [ ] **4.2** Crear `test/memory-writers.test.js` con una base temporal vía `mkdtemp` y procesos hijos
  vía `spawn(process.execPath, [fixture])`.
  **Hecho cuando:** cada corrida usa un directorio temporal único, lo limpia al terminar y una
  aserción falla si la ruta coincide con la base real del repo.
- [ ] **4.3** Probar concurrencia N×M con claves colisionantes y claves únicas.
  **Hecho cuando:** no se pierde ninguna escritura confirmada, hay exactamente un nodo activo por
  `memory_key` y el conteo de superseded coincide con la secuencia.
- [ ] **4.4** Probar contención más allá de `busy_timeout`: un proceso retiene el write-lock ~7 s.
  **Hecho cuando:** el otro escritor no falla a los 5053 ms, confirma después de 5000 ms y dentro del
  presupuesto de 3 intentos, y la sincronización entre el proceso que retiene el lock y el que
  escribe se hace por señal determinista (stdout/IPC del fixture), nunca por `sleep` ciego, para
  evitar flakes.
- [ ] **4.5** Probar presupuesto agotado con una política inyectada pequeña (3 intentos y backoff
  corto) mientras el lock se retiene.
  **Hecho cuando:** el error tiene `code = MEMORY_DB_BUSY` y nombre, reporta la operación y los
  intentos, y una escritura posterior en la misma conexión funciona (sin transacción abierta).
- [ ] **4.6** Probar idempotencia de la corrida: repetir el mismo conjunto de escrituras.
  **Hecho cuando:** no se crean nodos activos extra, no aparecen superseded adicionales y el estado
  FTS no cambia.
- [ ] **4.7** Probar consistencia FTS5 y `PRAGMA quick_check` después de la concurrencia.
  **Hecho cuando:** las filas indexadas coinciden con `memory_nodes` y `quick_check` devuelve `ok`.
- [ ] **4.8** Probar que lectores y caminos read-only no se alteran con un escritor activo.
  **Hecho cuando:** `doctor`, `curate`, dry-runs, `snapshot` y `migrate: false` no fallan ni escriben.
- [ ] **4.9** Probar que el mecanismo es por conexión y no global: dos engines sobre DOS bases
  temporales distintas en directorios distintos progresan en paralelo mientras uno mantiene una
  transacción de escritura abierta.
  **Hecho cuando:** la segunda base confirma su escritura sin esperar el presupuesto de retry de la
  primera (sin aserción de duración exacta, sólo que no falla ni queda bloqueada) y el test no
  escribe bajo `aspec/`.

## Fase 5 — Declaración en el affected-set

- [ ] **5.1** Declarar `test/memory-writers.test.js` en `test/affected-tests.json`, en el coupling de
  `src/core/memory/**` y, si corresponde, en el trigger del fixture.
  **Hecho cuando:** el manifiesto conserva `version: 1`, sus rutas son repo-relative posix y la suite
  se selecciona al tocar `src/core/memory/**`.
- [ ] **5.2** Ejecutar `node --test test/test-selection.test.js`.
  **Hecho cuando:** la suite pasa sin `manifest-gap` ni rutas fuera del universo `test/*.test.js`.

## Fase 6 — Validación

- [ ] **6.1** Ejecutar `npm run lint`.
  **Hecho cuando:** termina sin errores.
- [ ] **6.2** Ejecutar
  `node --test test/memory-engine.test.js test/memory-writers.test.js test/stats-failures.test.js test/curation.test.js`.
  **Hecho cuando:** los tests acotados de memoria terminan verdes.
- [ ] **6.3** Ejecutar `npm test`.
  **Hecho cuando:** la suite completa termina sin fallos nuevos.
- [ ] **6.4** Registrar en el resumen de cierre `format: not-configured` y `typecheck: n/a`.
  **Hecho cuando:** ambas omisiones quedan declaradas, sin inventar un formatter ni un typechecker.

## Fase 7 — Cierre documental

- [ ] **7.1** Actualizar `aspec/backlog.md` (ítem #4) con el resultado medido, la decisión y cualquier
  deuda residual.
  **Hecho cuando:** la entrada deja de describir el ítem como "prosa-only, sin mutex ejecutable" y
  cita la evidencia del change.
- [ ] **7.2** Regenerar el working-context con
  `node src/cli/index.js memory context --out .ancleto/working-context.md`.
  **Hecho cuando:** el bloque queda actualizado y la base conserva schema, PRAGMAs persistidos y
  `ruleVersion` sin cambios.
