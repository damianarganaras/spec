# Tasks: Merge determinístico de delta specs

> Change `ch-06a-specs-merge-deterministic`. Implementación de CH-06a; fuera de alcance CH-06b, CH-07,
> MEM-05 y cualquier cambio en `package.json` hasta la release de la FASE 8.

## Fase 1 — Artifacts

- [x] Escribir `aspec/changes/ch-06a-specs-merge-deterministic/proposal.md` con intención, alcance, riesgos, arquitectura, validación, rutas autorizadas y `## Decisiones`.
- [x] Escribir el delta `aspec/changes/ch-06a-specs-merge-deterministic/specs/spec-sync/spec.md` con los cinco requirements y sus escenarios.
- [x] Escribir `aspec/changes/ch-06a-specs-merge-deterministic/tasks.md` con las fases de implementación y validación.

## Fase 2 — Módulo de merge puro

- [x] Crear `src/core/specs-merge.js` con el parser de spec canónico: `# Spec:`, `## Purpose`, `## Requirements` y bloques `### Requirement:` con sus `#### Scenario:`.
- [x] Agregar en `src/core/specs-merge.js` el parser de delta para `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` y `## RENAMED Requirements`, incluyendo `- FROM:` / `- TO:`.
- [x] Implementar en `src/core/specs-merge.js` el plan de merge por título exacto para ADDED, MODIFIED, REMOVED y RENAMED, preservando los requirements no mencionados.
- [x] Implementar en `src/core/specs-merge.js` el error fail-closed con capability, requirement y motivo para 0/≥2 coincidencias, cuerpo faltante, contenido ADDED conflictivo, RENAMED ambos/ninguno, FROM/TO faltantes, capability sin spec canónico y bloque malformado.
- [x] Implementar en `src/core/specs-merge.js` la serialización del spec resultante preservando el contenido no mencionado y el separador de línea dominante del archivo original.

## Fase 3 — Cableado de la CLI

- [x] Agregar en `src/cli/index.js` la resolución del change activo en `aspec/changes/<slug>/` o archivado en `aspec/changes/archive/*-<slug>/`, con exit 2 ante 0 o ≥2 coincidencias.
- [x] Enrutar el token `merge` dentro del `case 'specs'` de `src/cli/index.js`, manteniendo `specs check` y `specs` sin argumentos con el comportamiento actual.
- [x] Implementar en `src/cli/index.js` el parseo de `--change <slug>`, `--dry-run` y `--json`, y los códigos de salida 0/1/2.
- [x] Implementar en `src/cli/index.js` el flujo de dos fases: computar todos los planes y escribir solo si ninguno falla, con cero escrituras en `--dry-run`.
- [x] Implementar en `src/cli/index.js` la salida `--json` del plan y del resultado con las capabilities, operaciones y errores fail-closed.

## Fase 4 — Tests

- [x] Crear `test/specs-merge.test.js` con tests unitarios del parser y del plan puro de `src/core/specs-merge.js`.
- [x] Agregar en `test/specs-merge.test.js` casos de ADDED, MODIFIED, REMOVED y RENAMED por título exacto, incluyendo MODIFIED que reescribe cuerpo y escenarios y contenido no mencionado preservado.
- [x] Agregar en `test/specs-merge.test.js` la matriz fail-closed: 0/≥2 coincidencias, cuerpo faltante, ADDED conflictivo, RENAMED ambos/ninguno, FROM/TO faltantes, capability inexistente y bloque malformado, verificando exit 2 y mensaje.
- [x] Agregar en `test/specs-merge.test.js` el test de idempotencia: segunda corrida byte a byte idéntica y plan vacío sin escritura.
- [x] Agregar en `test/specs-merge.test.js` el test de `--dry-run` con cero escrituras, verificando contenido y `mtime` sin cambios.
- [x] Agregar en `test/specs-merge.test.js` el test de atomicidad entre capabilities: un fallo en una capability no escribe ninguna de las restantes.
- [x] Agregar en `test/specs-merge.test.js` el test de compatibilidad de `specs check` y `specs` sin token `merge`.
- [x] Agregar en `test/specs-merge.test.js` el test de alcance: no se tocan delta files, change folder, memoria, seed ni `package.json`, y no se crean capabilities nuevas.

## Fase 5 — Validación

- [x] Ejecutar `npm run lint` (`eslint src/ test/ scripts/`).
- [x] Ejecutar `node --test "test/specs-merge.test.js"` con ruta explícita durante la implementación.
- [x] Ejecutar `npm test` (`node --test "test/*.test.js"`) y confirmar la suite completa en verde.

## Fase 6 — Cierre del change

- [ ] Ejecutar `ancleto-verify` sobre el change y confirmar los cinco requirements del delta contra la implementación.
- [ ] Ejecutar `ancleto-archive` para promover el delta `spec-sync` a `aspec/specs/spec-sync/spec.md`.
