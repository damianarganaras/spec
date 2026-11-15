# Tasks: MEM-05 — GC por instante, snapshot de lectura en curaduría y gramática de refs con fuente única

> Change funcional. Sin `design.md`.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test` (`node --test "test/*.test.js"`); para pasos acotados, rutas explícitas.
> Format check `not-configured`; typecheck no aplica (JavaScript ESM, sin `tsconfig.json`).

## File-set de implementación (autorizado)

- `src/core/memory/database.js` — helper de transacción de lectura.
- `src/core/memory/engine.js` — comparación por instante en GC, constante de gramática y
  `readTransaction`.
- `src/core/memory/curation.js` — lecturas bajo un snapshot y consumo de la constante.
- `test/memory-engine.test.js`, `test/curation.test.js`, `test/memory-writers.test.js` — oráculos.
- `aspec/changes/mem-05-gc-eligibility-curate-snapshot/**` — estos artefactos.

Fuera del file-set: schema (tablas, índices, columnas, triggers, vistas), formato persistido de
fechas, los cinco caminos de escritura, `agents/**`, `skills/**`, `commands/**`, `templates/**`,
`.opencode/**`, `opencode.json`, las tres superficies de modelo, `docs/PLAN*`, `docs/BACKLOG_*`,
`ancleto-vscode-extension`, la base real `.ancleto/memory.db` y `package.json` (el bump a `0.35.0`
es FASE 9).

## Fase 1 — `src/core/memory/database.js`

- [x] **1.1** Implementar y exportar `runReadTransaction(db, fn)` como hermano de
  `runImmediateTransaction` (`database.js:141`): `BEGIN DEFERRED`, ejecutar `fn`, `COMMIT`; ante
  cualquier error, `ROLLBACK` sólo si hay transacción activa y propagar el error original.
  **Hecho cuando:** el helper no reintenta, no escribe filas, no usa `BEGIN IMMEDIATE` y devuelve el
  valor de `fn`.
- [x] **1.2** Verificar el helper sobre una conexión `readOnly: true` en WAL.
  **Hecho cuando:** dos lecturas dentro de la transacción son estables ante un `COMMIT` externo y un
  `INSERT` intentado dentro falla con "attempt to write a readonly database" sin dejar transacción
  abierta.

## Fase 2 — `src/core/memory/engine.js`

- [x] **2.1** Cambiar los tres statements de GC (`engine.js:818-848`) a
  `julianday(COALESCE(superseded_at, created_at)) < julianday(?)`, conservando un único `cutoff`
  calculado una vez por invocación (`engine.js:1166`) y pasándolo igual a `gcSelect`, `gcDetach` y
  `gcDelete`.
  **Hecho cuando:** los tres statements usan `julianday` sobre ambos lados y el orden
  DETACH→DELETE, `VACUUM`/`REINDEX` y la preparación lazy no cambian.
- [x] **2.2** Exportar una única constante con el literal de gramática de refs (`'refs:'` y
  `'inválido (gramática)'`) y usarla en `inspectRefs` (`engine.js:714`, `:718`).
  **Hecho cuando:** el literal no está duplicado dentro de `engine.js` y el texto, el orden y los
  códigos de salida de `inspectRefs` son idénticos a los previos.
- [x] **2.3** Agregar el método `readTransaction(fn)` al engine, delegando en
  `runReadTransaction(db, fn)` sobre la conexión existente.
  **Hecho cuando:** el método está disponible también en el engine read-only
  (`createReadonlyMemoryEngine`) y no toca el helper de escritura.
- [x] **2.4** Confirmar que los cuatro writers de supersesión (`engine.js:1056`, `:1121`, `:1251`,
  `:1341`) y el statement `supersede` quedan intactos.
  **Hecho cuando:** el formato persistido sigue siendo `new Date().toISOString()` con milisegundos y
  ningún test de supersesión cambia de expectativa.

## Fase 3 — `src/core/memory/curation.js`

- [x] **3.1** Importar la constante de gramática del engine y reemplazar los literales de
  `curation.js:53` y `:57`.
  **Hecho cuando:** el texto de las entradas (`refs:` o línea ofensora, sin `kind`, motivo
  `inválido (gramática)`) es byte a byte igual al anterior.
- [x] **3.2** Envolver `engine.listNodes({ status: 'active' })` y
  `engine.consolidate({ dryRun: true, includeNearDuplicates: false })` en una sola llamada a
  `engine.readTransaction(...)`, capturando nodos y `exactGroups`.
  **Hecho cuando:** las dos lecturas ocurren dentro de la transacción y `curateMemory` no abre
  ninguna otra.
- [x] **3.3** Resolver refs contra el filesystem después del `COMMIT`, reutilizando el bucle actual
  de `resolveNodeRefs` y la memoización por `content`.
  **Hecho cuando:** ninguna llamada de resolución de paths ocurre dentro de la transacción y el
  reporte conserva secciones, orden total y determinismo.

## Fase 4 — Delta de spec

- [x] **4.1** Escribir `specs/memory-ops/spec.md` con `## MODIFIED Requirements` para los dos
  requirements, cuerpo completo y todos los escenarios previos más los nuevos.
  **Hecho cuando:** ningún escenario existente falta (se contaron y se conservaron literalmente) y
  los keywords `### Requirement:`, `#### Scenario:`, `**WHEN**`, `**THEN**`, `**AND**` y `SHALL`
  están en inglés.
- [x] **4.2** Verificar que los refs del proposal resuelven contra el heading real de cada
  requirement y que el delta no toca `aspec/specs/**`.
  **Hecho cuando:** los dos `spec:memory-ops#…` del proposal se resuelven con la forma canónica y
  las specs canónicas no registran cambios.

## Fase 5 — Tests y validación

- [x] **5.1** En `test/memory-engine.test.js`, agregar el caso de frontera de segundo: un nodo con
  `superseded_at` en el segundo del cutoff y con milisegundos no se purga ni se cuenta en dry-run.
  **Hecho cuando:** el test falla con la comparación textual previa y pasa con `julianday`.
- [x] **5.2** En `test/memory-engine.test.js`, cubrir formatos mixtos con y sin milisegundos (mismo
  instante ⇒ mismo veredicto y paridad dry-run/purge), fecha no parseable retenida, `deleted`
  reservado ignorado y `sqlite_master` idéntico antes y después de GC.
  **Hecho cuando:** cada caso tiene una aserción discriminante y no escribe en `.ancleto/memory.db`.
- [x] **5.3** En `test/curation.test.js`, cubrir el snapshot único: con un `COMMIT` externo entre la
  lectura de nodos y la detección de duplicados, el nodo nuevo no aparece en ninguna sección.
  **Hecho cuando:** el oráculo es determinista (sin sleeps ciegos), usa base temporal y verifica que
  no queda transacción abierta al volver.
- [x] **5.4** En `test/memory-writers.test.js`, verificar `runReadTransaction` sobre la conexión
  read-only: lectura estable ante un `COMMIT` externo y `INSERT` rechazado.
  **Hecho cuando:** el test usa `mkdtemp`, no depende del cwd y limpia su directorio.
- [x] **5.5** Ejecutar `npm run lint`.
  **Hecho cuando:** termina sin errores.
- [x] **5.6** Ejecutar
  `node --test test/memory-engine.test.js test/curation.test.js test/memory-writers.test.js`.
  **Hecho cuando:** los tests acotados terminan verdes.
- [x] **5.7** Ejecutar `npm test`.
  **Hecho cuando:** la suite completa termina sin fallos nuevos.
- [x] **5.8** Registrar en el resumen de cierre `format: not-configured` y `typecheck: n/a`.
  **Hecho cuando:** ambas omisiones quedan declaradas, sin inventar un formatter ni un typechecker.
