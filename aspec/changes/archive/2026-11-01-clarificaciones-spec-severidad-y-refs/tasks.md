# Tasks: Clarificaciones de spec — slug de `change:` sin fecha y hogar de la severidad

## Fase 1 — Deltas de spec

- [x] Delta `memory-engine`: reescribir el Requirement `Refs normalizadas materializadas en el contenido del nodo` conservando su cuerpo vigente y agregando que `change:<stable-change-slug>` usa el slug sin el prefijo `YYYY-MM-DD-`.
- [x] Delta `memory-engine`: agregar los scenarios del slug canónico que resuelve y del slug con prefijo de fecha reportado como inexistente.
- [x] Delta `code-review`: reescribir el Requirement `Reporte estructurado sin modificación de código` conservando su cuerpo vigente e incorporando la regla de asignación de severidad.
- [x] Delta `code-review`: agregar los scenarios de duplicación literal o dead code probado (`CRITICAL`), redundancia inferida o ubicación discutible (`WARNING`/`SUGGESTION`) y degradación ante duda.

## Fase 2 — Ajuste de `agents/spec-writer.md` (`@coder`)

- [x] En `agents/spec-writer.md` → `## Decisions Section`, reemplazar la re-enunciación del formato de refs por una referencia al Requirement `Refs normalizadas materializadas en el contenido del nodo` de `memory-engine`, que es la fuente única. Se conservó la oración `Never invent refs; record only refs that resolve.`: el cambio se limita a la re-enunciación.

## Fase 3 — Validación (`@tester`)

- [x] `npm test`, con `test/content-guards.test.js` incluido en el set.
- [x] `npm run lint`.
- [x] Confirmar que el ajuste de `agents/spec-writer.md` no rompe ningún content guard.

## Fase 4 — Review

- [x] Revisar que los dos deltas reescriban el cuerpo completo del Requirement sin perder cláusulas existentes.
- [x] Revisar que los keywords (`### Requirement:`, `#### Scenario:`, `WHEN`/`THEN`/`AND`, `SHALL`) permanezcan literales en inglés.

## Fase 5 — Archive

- [x] Sincronizar los deltas a `aspec/specs/**` al archivar el change.
  Merge del 2026-11-01: `Refs normalizadas materializadas en el contenido del nodo` (memory-engine) y
  `Reporte estructurado sin modificación de código` (code-review) reemplazados por el cuerpo del delta y
  sus scenarios mergeados por nombre; el resto de los Requirements de ambas specs quedó intacto y el cap
  de severidades con su enumeración se conservó. Archive: `aspec/changes/archive/2026-11-01-clarificaciones-spec-severidad-y-refs/`.

## Estado

Implementación y validación completas: `test/content-guards.test.js` 114/114, `npm test` 710 pass / 4 skip / 0 fail, `npm run lint` limpio, format y typecheck `not-configured`. Review aprobado (`APPROVED`, dos WARNING corregidos) y archive completo con sync de los deltas el 2026-11-01.
