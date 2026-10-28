# Tasks: Reingeniería memoria-first — PR-1

> Change contenedor: este tramo cubre **exclusivamente PR-1** (MEM-00 + MEM-02 + merge tool).
> Sin `design.md` por decisión D del programa: el enfoque técnico está en `proposal.md` y en
> `specs/memory-ops/spec.md`.
> Orden obligatorio: la Fase 1 escribe los tests que fallan y se confirma el rojo **antes** de implementar.
> Enmienda E1/E2 aplicada in-place al delta `specs/memory-ops/spec.md` (garantía de sidecars WAL y
> atribución del refresco del bloque al subcomando CLI); deja una tarea de test pendiente en Fase 1.
> Enmienda G1–G5 aplicada in-place al delta (diagnóstico FTS por alineación, estado observable del WAL,
> escape de ruta en snapshot, `type` en merge y `merge --json`); sus tareas quedan pendientes y sin marcar.

## Estado

- **Estado**: PR-1 base completado — Fases 1 a 5 completadas y enmiendas E1/E2 y G1–G5 cerradas
- **Enmienda E1/E2 (delta)**: aplicada sobre `specs/memory-ops/spec.md` y este `tasks.md` — la garantía de
  `-shm`/`-wal` se enuncia sobre el contenido de la base y la materialización de sidecars en WAL frío, y el
  refresco del bloque queda atribuido al subcomando CLI (el método del engine no toca el filesystem).
  El test del scenario "No-mutación con WAL frío" (Fase 1) está agregado y verde.
- **Enmienda G1–G5 (delta)**: aplicada sobre `specs/memory-ops/spec.md` y este `tasks.md` — chequeo FTS por
  alineación de filas en read-only, `Checkpoint WAL` con estado observable sin checkpoint, ruta de snapshot
  parametrizada, `merge` con `type` idéntico y `merge --json`. Implementación y tests completados y verdes.
  Hallazgo de implementación G1: `count(*)` sobre `memory_fts` (external content) resuelve contra
  `memory_nodes` y no detecta nodos sin indexar; la consulta equivalente que sí funciona es
  `count(*) FROM memory_fts_docsize` (tabla sombra con una fila por documento indexado).
- **Corrección de verificación R1/R2**: aplicada — falso positivo del check `Indice FTS5` cuando no hay
  `memory_fts_docsize` (R1) y merge que no puede fingir éxito si el refresh del bloque falla (R2).
- **Última validación** (review final F1–F4):
  - `node --test test/memory-fixtures.test.js test/memory-engine.test.js test/memory-pr1-contract.test.js test/working-context.test.js test/mcp.test.js` → 148 pass / 0 fail / 0 skipped (40 suites).
  - `npm test` (`node --test "test/*.test.js"`) → 642 tests: 638 pass / 0 fail / 4 skipped (128 suites).
  - `npm run lint` → OK (exit 0).
  - Format: `not-configured`; Typecheck: no aplica (JavaScript ESM, sin `tsconfig.json`).
  - `.ancleto/**` vivo: sin cambios (tamaño + mtime idénticos en los cinco archivos; sha256 idéntico en
    `machine-env.md` y `working-context.md`. `memory.db`/`-wal`/`-shm` están tomados por el MCP de memoria
    del host, por lo que SHA256 no fue legible; tamaño y mtime no cambiaron).
  - Probes re-verificados por la suite: alineación FTS correcta y rota + `--rebuild`, WAL observable,
    apóstrofo en `--out`, type mismatch en merge, `--json` en dry-run y en merge real, FTS ausente y
    dry-run sobre DB en `journal_mode=DELETE`.
- **Bloqueos**: ninguno
- **Paths relevantes**: `src/core/memory/snapshot.js`, `src/cli/index.js`, `src/core/memory/doctor.js`,
  `src/core/memory/engine.js`, `src/core/memory/working-context.js`, `test/fixtures/memory/seed.json`,
  `test/fixtures/memory/golden.json`, `test/memory-fixtures.test.js`, `test/memory-engine.test.js`,
  `test/memory-pr1-contract.test.js`, `test/working-context.test.js`,
  `aspec/specs/memory-ops/spec.md` (destino del delta; no se edita en PR-1) y
  `.ancleto/working-context.md` (salida derivada esperada; en tests se genera bajo `tmpdir`, nunca en el
  `.ancleto/` del repo).
- **Siguiente paso**: sincronizar el delta a la spec canónica y archivar el change.

## Restricciones de ejecución

- No tocar `.ancleto/memory.db` viva: todos los tests usan fixtures en `tmpdir` con ruta inyectada.
- El refresco del working-context deriva su ruta del directorio de la DB, no de `process.cwd()`: en tests
  escribe bajo `tmpdir` y nunca en el `.ancleto/` del repo.
- No crear tablas, `memory_refs`, `memory maintenance`, agentes, vectores, embeddings, grafo ni servicio
  central.
- No cambiar la semántica de `memory export` / `import` / `gc`.
- No commit, no push, no merge de git.

## Fase 1 — Tests que fallan primero (sólo tests y fixtures)

- [x] Crear `test/fixtures/memory/seed.json` como array en el formato exacto de `exportActive()`
      (`memory_key`, `type`, `content`, `justification`, `scope`, `createdAt`), incluyendo una regla de
      test runner vendorizado y el nodo `node-test-scope-explicit-paths`.
- [x] Crear `test/fixtures/memory/golden.json` con las entradas `M01`–`M10`: `M01` y `M07` en `active` con
      su `expected`; las otras ocho en `deferred` con `blocker` nombrado.
- [x] Crear `test/memory-fixtures.test.js` con el helper de siembra que usa `createMemoryEngine` +
      `importNodes` sobre `seed.json` (sin loader nuevo) y el test de no-mutación T11 (`memory doctor`
      sobre fixture sin WAL: `.db` idéntico, sin `-wal`/`-shm` nuevos).
- [x] Agregar en `test/memory-fixtures.test.js` el test T24 (fixture con `-wal` y frames sin checkpoint:
      `.db` y `-wal` byte a byte, `-wal` no baja de tamaño, `-shm` fuera de la igualdad byte a byte pero
      sin creación, truncamiento ni cambio de tamaño).
- [x] Agregar en `test/memory-fixtures.test.js` el test del scenario "No-mutación con WAL frío": fixture en
      modo WAL cerrada limpia y sin `-wal` ni `-shm` → bytes de `db` sin cambios, sin ganancia ni pérdida de
      nodos, materialización de `-shm` y de un `-wal` de 0 bytes tolerada y no reportada como falla, y una
      segunda corrida sin cambios de bytes respecto de la primera.
- [x] Agregar en `test/memory-engine.test.js` el test de merge en dry-run con 1 target y 2 sources: no
      escribe, reporta el plan y falla hoy porque el motor no expone el método.
- [x] Agregar en `test/memory-fixtures.test.js` el harness golden: evalúa `M01` y `M07` contra la fixture
      congelada y falla si el set de `deferred` difiere del allowlist o si una diferida no tiene blocker.
- [x] Agregar en `test/memory-engine.test.js` (bloque `memory doctor`) el test de alineación FTS correcta:
      fixture consistente con cada nodo indexado → `Indice FTS5` `ok: true`, `healthy: true`, `skipped`
      ausente y `detail` con la cantidad de filas de `memory_fts` y de `memory_nodes` (G1).
- [x] Agregar en `test/memory-engine.test.js` el test de alineación FTS rota: remover el trigger de
      indexación e insertar un nodo sin indexar → `Indice FTS5` `ok: false`, `healthy: false`, exit code
      distinto de `0` y `detail` con ambas cantidades e indicación de `--rebuild` (G1).
- [x] Agregar en `test/memory-engine.test.js` la verificación de que `--rebuild` repara la desalineación
      (el nodo antes no indexado aparece en una búsqueda posterior) (G1).
- [x] Agregar en `test/memory-fixtures.test.js` (WAL frío) la aserción de que el `detail` del check
      `Checkpoint WAL` indica si el `-wal` existe y su tamaño en bytes (G2).
- [x] Agregar en `test/memory-fixtures.test.js` el test de snapshot con destino que contiene `'` → el
      archivo se crea en esa ruta y es una base SQLite válida con el contenido de la fuente (G3).
- [x] Agregar en `test/memory-engine.test.js` el test de merge con `type` incompatible entre target y una
      source → falla nombrando las `memory_key` y los tipos, sin modificar ninguna fila (G4).
- [x] Agregar en `test/memory-engine.test.js` (bloque `memory merge (CLI)`) el test de
      `ancleto memory merge --dry-run --json` → JSON parseable con `dryRun`, `target`, `sources` y
      `superseded`, y base sin cambios (G5).
- [x] Ejecutar `node --test test/memory-fixtures.test.js test/memory-engine.test.js` y registrar el rojo
      esperado de la enmienda en **Última validación**.

## Fase 2 — `memory doctor` read-only

- [x] Cambiar `memoryDoctor` para abrir por defecto con `{ migrate: false, readonly: true }` y sacar del
      camino default el checkpoint, el `INSERT` de integrity-check y el rebuild.
- [x] Representar los checks que requieren escritura como omitidos (`skipped: true`, `ok: true`, `detail`
      de no verificable) conservando los cuatro nombres y sin alterar `healthy` ni el exit code.
- [x] Mantener `--rebuild` como único camino de escritura, con los cuatro checks verificados y
      `rebuilt: true`.
- [x] Actualizar `test/memory-engine.test.js` (bloque `memory doctor`) a la nueva semántica, incluido el
      caso de reparación con `--rebuild`.
- [x] Ejecutar `node --test test/memory-engine.test.js` y registrar el resultado en **Última validación**.
- [x] Implementar en `src/core/memory/doctor.js` el chequeo no mutante de alineación de `Indice FTS5`:
      comparar el conteo de `memory_fts` con el de `memory_nodes`, reportar `ok: true` con ambas cantidades
      cuando coinciden y `ok: false` nombrando ambas cantidades y `--rebuild` cuando difieren (G1).
- [x] Dejar de reportar `Indice FTS5` como `skipped` en modo default (siempre emite resultado) y limitar
      `skipped` a los checks no ejecutables en el modo activo; el `detail` aclara que la integridad
      completa de FTS5 sólo se verifica con `--rebuild` (G1).
- [x] Cambiar el check `Checkpoint WAL` en modo default para reportar `skipped: true` con el estado
      observable del `-wal` (existencia y bytes) sin ejecutar checkpoint ni `PRAGMA wal_checkpoint`;
      conservar el checkpoint real sólo en `--rebuild` (G2).

## Fase 3 — Snapshot

- [x] Crear `src/core/memory/snapshot.js` con `VACUUM INTO`, rechazo de destino igual a la fuente y
      rechazo de destino existente salvo sobrescritura explícita.
- [x] Agregar `memory snapshot --out <archivo>` con `--force` y `--json` en `src/cli/index.js` (dispatch y
      texto de uso), como wrapper fino sobre `snapshot.js`.
- [x] Agregar en `test/memory-fixtures.test.js` el test T18 de restauración (mismas keys activas, mismos
      `superseded_by`, mismas respuestas golden) y la cobertura de flags/exit codes del subcomando.
- [x] Endurecer en `src/core/memory/snapshot.js` el armado de `VACUUM INTO`: usar parámetro vinculado o
      escapar la ruta duplicando comillas simples y delimitándola con comillas simples, sin concatenación
      insegura, de modo que una ruta con `'` funcione (G3).

## Fase 4 — Merge

- [x] Agregar el método de merge en `src/core/memory/engine.js` reutilizando el statement `supersede`
      dentro de una única transacción, con validación fail-closed de target y sources y sin inserciones.
- [x] Agregar `memory merge --target <key> --sources <k1,k2,...> [--dry-run]` en `src/cli/index.js`
      (parseo de lista, flags obligatorios, mensajes que nombran la key, exit codes).
- [x] Tras un merge real (no `--dry-run`), refrescar `.ancleto/working-context.md` **en el subcomando CLI**
      (el método del engine no toca el filesystem) por la vía existente
      (`refreshWorkingContextOnWrite`, sin render paralelo), derivando el destino del directorio de la DB
      (`dirname(resolvedDbPath)/working-context.md`, vía `resolveMemoryProjectRoot(dbPath)`), no de
      `process.cwd()`. `--dry-run` no escribe el archivo.
- [x] Agregar en `test/memory-engine.test.js` (o en el test CLI que corresponda) la verificación del
      refresco: tras merge real el bloque no lista las `memory_key` de las sources y sí lista la del
      target, y con `--dry-run` el archivo de contexto no se crea ni se modifica.
- [x] Agregar en `test/memory-engine.test.js` los tests de engine complementarios: vínculo
      `superseded_by`, fail-closed, rollback sin superseder otras sources, `sqlite_master` idéntico y
      `node-test-scope-explicit-paths` intacta (el dry-run ya quedó en Fase 1).
- [x] Validar en `src/core/memory/engine.js` que el `type` del target coincida con el de cada source antes
      de escribir; si difiere, fallar nombrando las `memory_key` involucradas y los tipos, sin modificar
      ninguna fila (G4).
- [x] Agregar `--json` a `ancleto memory merge` en `src/cli/index.js`: objeto JSON parseable con al menos
      `dryRun`, `target`, `sources` y `superseded`, manteniendo el resumen legible sin el flag (G5).

## Fase 5 — Validación de PR-1

- [x] Ejecutar `npm test` (`node --test "test/*.test.js"`).
- [x] Ejecutar `npm run lint`.
- [x] Registrar Format `not-configured` y Typecheck no aplica (paquete JavaScript ESM, sin `tsconfig.json`).
- [x] Confirmar que no se modificó `.ancleto/memory.db` viva ni se crearon tablas nuevas.
- [x] Verificar que la spec canónica `aspec/specs/memory-ops/spec.md` no se editó en PR-1 y que el delta
      queda listo para sincronizar al archivar.
- [x] Ejecutar `npm test` y `npm run lint` con la enmienda G1–G5 aplicada y registrar los resultados en
      **Última validación**.
- [x] Confirmar que `memory doctor` en modo default no muta `.db`/`-wal` con los nuevos checks (alineación
      FTS y estado observable del WAL) y que la spec canónica sigue sin editarse.

## Review no bloqueante — PR-1 (hardening)

- [x] **W1**: `snapshot --force` aparta el destino a `.bak-<rand>`, mueve la copia nueva y restaura el
      backup si el `rename` final falla; en ningún camino de error se pierden a la vez el destino previo y
      la copia nueva (`src/core/memory/snapshot.js`).
- [x] **S3**: la limpieza del temporal borra `temp`, `temp-wal` y `temp-shm` dentro de su propio
      `try/catch`, sin reemplazar el error original.
- [x] **S2**: la idempotencia del WAL frío compara `db`/`-wal` byte a byte y del `-shm` sólo presencia y
      tamaño (`test/memory-fixtures.test.js`).
- [x] **W2**: el test "snapshot no muta la fuente" declara el modo de la fixture
      (`journal_mode=DELETE`) y documenta que en WAL el open read-only puede materializar sidecars vacíos.
- [x] **S1**: test determinista de la rama `superseded !== sourceIds.length` vía trigger de SQLite (sin
      seam de producción). Limitación aceptada: la rama "target deja de estar activo dentro de
      `BEGIN IMMEDIATE`" no es observable sin seam — la revalidación ocurre en el mismo tick síncrono, sin
      punto de interleaving y sin escritura previa dentro de la transacción.
- **Última validación (review no bloqueante)**: `node --test test/memory-fixtures.test.js
  test/memory-engine.test.js test/memory-pr1-contract.test.js test/working-context.test.js` → 124 pass /
  0 fail / 0 skipped. `npm test` → 629 pass / 0 fail / 4 skipped. `npm run lint` → OK. Format
  `not-configured`; Typecheck no aplica (paquete JavaScript ESM). `.ancleto/memory.db`, `-wal`, `-shm` y
  `working-context.md` sin cambios (tamaño + mtime + sha256).

## Corrección de verificación — R1/R2

- [x] **R1**: en `src/core/memory/doctor.js`, si el conteo por `memory_fts_docsize` no es ejecutable
      (tabla sombra ausente u otro error de esa consulta), `Indice FTS5` se reporta
      `{ ok: true, skipped: true }` con `detail` `omitido: alineacion de FTS no verificable (<motivo>);
      integridad completa no verificable en read-only`. No baja `healthy` ni cambia el exit code. La
      detección real de desalineación (con `docsize` presente) sigue reportando `ok: false`.
      Test en `test/memory-fixtures.test.js`: DB con FTS5 external-content `columnsize=0` (sin
      `memory_fts_docsize`), un nodo insertado → `Indice FTS5` `ok: true` + `skipped: true`,
      `healthy: true` y `detail` con el motivo.
- [x] **R2**: en `src/cli/index.js`, si `refreshWorkingContextOnWrite` falla tras un merge real, el
      subcomando imprime el error, aclara que el merge **sí** se aplicó en la base, que
      `.ancleto/working-context.md` quedó desactualizado, indica
      `ancleto memory context --out .ancleto/working-context.md` y sale con exit code 1. No revierte el
      merge. Camino feliz y `--dry-run` sin cambios.
      Test en `test/memory-engine.test.js`: el refresh se fuerza a fallar sin seam de producción (el path
      esperado del working-context es un directorio, así `readFileSync`/`writeFileSync` falla con EISDIR);
      se asertan exit ≠ 0, el mensaje de merge aplicado + bloque desactualizado + comando de
      regeneración, y que la source quedó `superseded` (el merge no se revierte).
- **Última validación R1/R2**: ver **Estado → Última validación**.

## Corrección de la review final - F1–F4

- [x] **F1**: `memoryDoctor` distingue tres estados del check `Indice FTS5`: `memory_fts` ausente
      (`sqlite_master` por `type='table' AND name='memory_fts'`) → `{ ok: false, detail: 'indice FTS5
      ausente; la busqueda no funciona' }`, `healthy: false` y exit != 0, nunca `skipped`;
      `memory_fts` presente pero `memory_fts_docsize` no consultable (`columnsize=0`) → `skipped`; y
      consulta ejecutable → comparación con `memory_nodes`. Implementado en
      `src/core/memory/doctor.js` sin un `catch` único. Test F1 en `test/memory-fixtures.test.js`.
- [x] **F2**: `memory merge --dry-run` abre con `createReadonlyMemoryEngine(dbPath)` (sin
      `journal_mode=WAL` ni migraciones); el engine read-only expone `merge` solo para `dryRun: true`
      (una corrida real lanza `merge: la conexion es read-only`) reutilizando `validateMerge` para que el
      plan sea idéntico al de escritura (`src/core/memory/engine.js`, `src/cli/index.js`). Test nuevo en
      `test/memory-engine.test.js`: DB en `journal_mode=DELETE`, CLI spawneado con `cwd` en tmpdir →
      sha256 del `.db` idéntico, sin `-wal`/`-shm` nuevos, salida con el plan.
- [x] **F3**: test del merge real con `--json` en `test/memory-engine.test.js`: `dryRun === false` y
      `target`, `sources` y `superseded` con sus valores correctos (G5 en ambos caminos).
- [x] **F4**: el mensaje R2 deriva el destino con `workingContextPath(resolveMemoryProjectRoot(dbPath))`
      y lo usa en el texto y en el comando sugerido (`src/cli/index.js`); la aserción del test compara
      contra la ruta derivada, no contra el literal `.ancleto/working-context.md`.
- **Última validación F1–F4**: ver **Estado → Última validación**.
