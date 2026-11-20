# Tasks: Import de memoria — `scope` como string no vacío

> Change funcional acotado. Sin `design.md`: la regla vive en el validador compartido y no cambia
> arquitectura, schema ni política de upsert.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test`; para pasos acotados, rutas explícitas. Format check `not-configured`; typecheck no
> aplica (JavaScript ESM, sin `tsconfig.json`).

## File-set de implementación (autorizado)

- `src/core/memory/engine.js` — `validateImportEntries` únicamente.
- `src/cli/index.js` — pre-validación del write en `memoryImport` con el mismo formato
  `ancleto: import invalido: ...` que el dry-run.
- `test/memory-engine.test.js` — oráculos de `importNodes` y paridad con `classifyImport`.
- `test/cli.test.js` — mensaje y código de salida del dry-run y del write.
- `aspec/changes/memory-import-scope-string/**` — estos artefactos.

Fuera del file-set: schema y `database.js`, `decideImportEntry`, `simulateImportClassification`,
`importNodes`/`classifyImport` más allá de heredar la validación, cualquier cierre de vocabulario de
`scope`, `MEM-01`, JEV/Lucas, `package.json` y la base real `.ancleto/memory.db`.

## Fase 1 — Validación compartida

- [x] **1.1** Agregar en `validateImportEntries` (`src/core/memory/engine.js:63-87`), después de las
  reglas actuales de `type` y `createdAt`, una comprobación de `scope`: debe ser
  `typeof entry.scope === 'string'` y `entry.scope.trim() !== ''`. Lanzar
  `entry[${i}].scope invalido: ...` indicando que se esperaba un string no vacío.
  **Hecho cuando:** un `scope` numérico, booleano, objeto, array o de sólo espacios lanza un error
  cuyo texto contiene literalmente `entry[i].scope` con el índice real, y no se usa `String(scope)`
  ni ninguna coerción.

- [x] **1.2** Verificar que la comprobación queda dentro del único validador consumido por
  `importNodes` (`engine.js:1336`) y por `classifyImport` (`:1374`) y por el camino sin base del CLI
  (`src/cli/index.js:3097`), sin duplicar la regla en otro módulo.
  **Hecho cuando:** `grep` de la regla de `scope` da un solo punto de definición y el cambio en
  `src/cli/index.js` se limita a la pre-validación del write (reutiliza el validador compartido, sin
  duplicar la regla).

- [x] **1.3** Confirmar que `decideImportEntry` (`engine.js:95-107`), `simulateImportClassification`
  (`:115-155`), el bindeo de `entry.scope` (`:1348`, `:1355`) y el schema
  (`src/core/memory/database.js:5-30`) quedan intactos.
  **Hecho cuando:** el diff de implementación solo toca `validateImportEntries` y el upsert sigue
  comparando `scope`, `content` y `justification` como hoy.

## Fase 2 — Tests

- [x] **2.1** Cubrir el rechazo en `test/memory-engine.test.js` (describe `importNodes`,
  `:1310`): `scope` numérico, booleano, objeto, array y string de espacios. Assert del mensaje que
  nombra `entry[<i>].scope` y de que la base queda sin nodos.
  **Hecho cuando:** cada caso falla con el mensaje nuevo y `SELECT` posterior devuelve cero filas.

- [x] **2.2** Cubrir `scope: null` y `scope` ausente: deben seguir reportándose como campo
  obligatorio faltante, no con el mensaje nuevo.
  **Hecho cuando:** ambos casos abortan sin escribir y el mensaje identifica `scope` como campo
  obligatorio.

- [x] **2.3** Cubrir la aceptación: un `scope` string no vacío fuera de `{project, feature, task}`
  (p. ej. `global`) se importa y se persiste verbatim.
  **Hecho cuando:** el nodo queda activo con `scope='global'` y el import devuelve
  `inserted: 1`.

- [x] **2.4** Cubrir la paridad dry-run/write: el mismo archivo con `scope` no-string produce el
  mismo mensaje por `classifyImport` y por `importNodes`; ninguna clasificación parcial y cero
  escrituras. Verificar también el camino de base ausente del dry-run.
  **Hecho cuando:** el mensaje coincide entre ambos caminos, el dry-run no emite `summary`/`entries`
  y la base (o su ausencia) queda sin cambios.

- [x] **2.5** Cubrir el mensaje y el código de salida del CLI en `test/cli.test.js` (describe
  `memory import --dry-run`, `:3999`): archivo con `scope` numérico → código 1, stderr con
  `entry[i].scope`, sin escritura.
  **Hecho cuando:** el test falla si el mensaje deja de nombrar el campo o si el comando escribe.

- [x] **2.6** Verificar no regresión de los fixtures existentes: los seeds de
  `test/memory-fixtures.test.js`, `test/curation.test.js` y `test/repair-refs.test.js` usan `scope`
  string y siguen importándose igual.
  **Hecho cuando:** la suite de esos archivos pasa sin cambios de fixture.

## Fase 3 — Validación

- [x] **3.1** Ejecutar `npm run lint`.
  **Hecho cuando:** sale con código 0.

- [x] **3.2** Ejecutar los tests acotados con rutas explícitas:
  `node --test test/memory-engine.test.js test/cli.test.js`.
  **Hecho cuando:** sale con código 0 y sin fallos nuevos respecto del baseline.

- [x] **3.3** Ejecutar `npm test`.
  **Hecho cuando:** la suite declarada pasa completa; cualquier skip preexistente se reporta como
  tal. Ledger: 1519 tests (1514 pass, 0 fail, 5 skip).

- [x] **3.4** Registrar las validaciones no configuradas: format check `not-configured` (el repo no
  declara formatter) y typecheck `n/a` (sin `tsconfig.json`).
  **Hecho cuando:** ambas omisiones quedan anotadas en el reporte de cierre del change.
