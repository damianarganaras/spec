# Tasks: `memory gc --dry-run` estrictamente read-only

> Cambio de conformidad: sin delta de spec. Cita
> `spec:memory-ops#Comando CLI ancleto memory gc` (`aspec/specs/memory-ops/spec.md:280-297`).
> PATCH `0.39.1`. No cambia schema, PRAGMAs persistentes ni `ruleVersion`.

## Fase 1 — Apertura read-only del dry-run en el CLI

- [x] 1.1 En `memoryGc` (`src/cli/index.js:3094-3124`), conservar la validación de `--days`
  antes de abrir y separar el camino por `dryRun`.
- [x] 1.2 En `dryRun`, abrir con `openReadableMemory` (`src/cli/index.js:2718`) y nunca construir
  `createMemoryEngine`; reutilizar `hasMemorySchema` a través del helper, sin duplicar el precheck.
- [x] 1.3 Degradar sin base (`no-db`) con el mensaje vigente y `exit 0`, y sin esquema
  (`uninitialized`) con el mensaje que nombra el esquema no inicializado (`src/cli/index.js:3484`)
  y `exit 0`, sin construir engine.
- [x] 1.4 Degradar base ilegible (`unreadable`) con su mensaje propio (`src/cli/index.js:3491`) y
  `exit 1`, sin stack trace.
- [x] 1.5 En `ok`, invocar `engine.gcSuperseded({ dryRun: true, days })` y conservar el formato de
  salida del dry-run (`src/cli/index.js:3114`); una base vacía legítima reporta 0 nodos y `exit 0`.
- [x] 1.6 Dejar intacta la rama apply: `createMemoryEngine`, purge, VACUUM + REINDEX y los
  mensajes actuales (`src/cli/index.js:3110`, `:3116-3119`).

## Fase 2 — Fallback legacy en el engine

- [x] 2.1 En `getGcSelect` (`src/core/memory/engine.js:909-917`), preparar el SELECT lazy con
  `COALESCE(superseded_at, created_at)` cuando la columna exista y con `created_at` cuando no,
  detectando la columna en la conexión abierta (misma consulta de `PRAGMA table_info` que usa la
  migración en `src/core/memory/database.js:57-59`), sin migrar ni escribir.
- [x] 2.2 Verificar que el conteo de elegibles en la base legacy coincide con el de una base
  migrada equivalente y que el dry-run no agrega la columna ni objetos de schema.
- [x] 2.3 No alterar `getGcDelete`/`getGcDetach` ni la semántica de la rama apply: esa rama abre con
  migración y siempre dispone de `superseded_at`.

## Fase 3 — Tests

- [ ] 3.1 Agregar un bloque nuevo en `test/memory-readonly-surfaces.test.js` (nuevo `describe` o
  `it`s) sin modificar el array `surfaceRuns` ni sus conteos "nueve":
  - base de 0 bytes: `memory gc --dry-run` sale 0, no crea esquema y el SHA-256 del `.db` no cambia;
  - base `journal_mode=DELETE` con un superseded elegible: reporta 1 nodo, sale 0 y el `.db`
    conserva SHA-256, `sqlite_master` y nodos;
  - base ilegible: sale 1, mensaje propio y sin stack trace;
  - base legacy con `memory_nodes` sin `superseded_at`: sale 0, mismo conteo esperado por
    `created_at` y la columna sigue ausente.
- [ ] 3.2 Actualizar en `test/memory-engine.test.js:2242` la expectativa del dry-run read-only
  sobre base legacy: ya no lanza; debe devolver el conteo con fallback a `created_at`,
  conservando las aserciones de construcción lazy y de no migración (`:2225-2255`).
- [ ] 3.3 Confirmar que siguen verdes los tests pinneados de GC y del comando:
  `test/mcp.test.js:351-400` (conteo por `superseded_at`, purge y `--days`) y
  `test/memory-engine.test.js` (`describe('gcSuperseded')`).
- [ ] 3.4 Confirmar que `test/memory-readonly-surfaces.test.js` ya está declarado en
  `test/affected-tests.json` bajo los couplings de `src/cli/**` y `src/core/memory/**`; ajustar
  sólo si la selección de tests deja de cubrirlo.

## Fase 4 — Validación

- [ ] 4.1 Ejecutar `npm run lint` (comando declarado).
- [ ] 4.2 Ejecutar `npm test` (suite declarada).
- [ ] 4.3 Ejecutar la corrida acotada
  `node --test test/memory-readonly-surfaces.test.js test/memory-engine.test.js test/mcp.test.js`.
- [ ] 4.4 Verificar manualmente sobre copia temporal: dry-run sobre `.db` de 0 bytes no cambia
  tamaño ni SHA-256; base ilegible sale 1 sin stack; `memory gc` sin `--dry-run` sigue purgando.

## Fase 5 — Release

- [ ] 5.1 Subir la versión PATCH a `0.39.1` en `package.json` y registrar la corrección en
  `CHANGELOG.md`.
- [ ] 5.2 Confirmar que no hay cambios de schema, de PRAGMAs persistentes, de `ruleVersion` ni de
  la forma persistida de los nodos.
- [ ] 5.3 Confirmar que no se tocó `aspec/specs/**`, `agents/`, `skills/`, `commands/`,
  `templates/`, `.opencode/`, `opencode.json` ni superficies de modelo.
