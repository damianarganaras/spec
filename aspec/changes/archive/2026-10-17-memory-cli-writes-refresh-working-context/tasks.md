# Tasks: Refrescar el working-context en todas las escrituras de memoria

## Fase 1 — Refresh del working-context en escrituras CLI

- [x] **1.1** En `memoryImport` (`src/cli/index.js`), tras `engine.importNodes(json)`, si
  `summary.inserted + summary.updated > 0`, llamar al refresh **compare-based**
  (`refreshWorkingContextOnWrite(engine, projectDir)`, nuevo helper en `working-context.js`) dentro
  de un `try/catch` aislado que avise por stderr sin abortar. Reusa la conexión abierta (no llama a
  `refreshWorkingContext`). El compare-based reescribe solo si el bloque cambió, satisfaciendo el
  escenario "un import que no altera el bloque no lo reescribe".
  Ref: Requirement "Frescura del working-context tras escrituras de la CLI".

- [x] **1.2** `writeWorkingContext`/`refreshWorkingContextOnWrite` se importan en `src/cli/index.js`;
  no se abre una segunda conexión (se reusa el `engine` abierto).

- [x] **1.3** Verificado: `memory export`, `memory list`, `memory doctor` y `memory gc` NO disparan
  refresh (export/list son read-only; gc purga superseded sin cambiar reglas activas).

## Fase 2 — Señal de staleness

- [x] **2.1** `checkWorkingContextFreshness(engine, projectRoot, scope)` en `working-context.js`:
  renderiza con `renderWorkingContextBlock` y compara contra `.ancleto/working-context.md` con
  normalización acotada (CRLF, espacios finales por línea, salto final). Reporta
  `ok` / `ausente` / `desactualizado`. Read-only (no escribe).
  Ref: Requirement "Detección de staleness del working-context".

- [x] **2.2** Expuesto en `ancleto memory doctor` (`src/cli/index.js` → `memoryDoctorCmd`), con
  `resolveMemoryProjectRoot` + `createReadonlyMemoryEngine`. Línea `Working-context: <estado>`.
  **Decisión:** el staleness es **advisory** y NO altera el exit code (que sigue midiendo la
  integridad de la DB); cuando no está `ok` se sugiere `ancleto memory context --out`.

- [x] **2.3** Superficie elegida: `ancleto memory doctor` (reusa el subcomando de diagnóstico;
  no se amplía `memory context`).

## Fase 3 — Contrato y documentación

- [x] **3.1** Delta de spec `specs/memory-engine/spec.md`: Requirement "Frescura del working-context
  tras escrituras de la CLI" y sus escenarios.

- [x] **3.2** Delta de spec `specs/memory-engine/spec.md`: Requirement "Detección de staleness del
  working-context" y sus escenarios.

- [x] **3.3** `README.md` (nota de puntos de regeneración) y `agents/orchestrator.md`
  (`## Project Memory Rules`) alineados: incluyen las escrituras CLI y el chequeo de staleness.

- [x] **3.4** Seed técnico `docs/technical-discovery/units/memory-engine.md` alineado (refresh no
  exclusivo de MCP; `refreshWorkingContextOnWrite`/`checkWorkingContextFreshness`).

## Fase 4 — Tests

- [x] **4.1** CLI: `memory import` de una `rule` scope `project` materializa el working-context e
  incluye la regla (`test/cli.test.js`). Ref: Scenario "El import de una regla de proyecto refresca
  el working-context".

- [x] **4.2** CLI: `memory import` de una decision no proyectada no crea el archivo. Unit:
  `refreshWorkingContextOnWrite` no crea archivo cuando no altera el bloque.

- [x] **4.3** CLI: fallo del refresh en import no pierde la escritura (nodo persistido, exit 0,
  aviso por stderr). Unit: helper compare-based.

- [x] **4.4** Unit: `checkWorkingContextFreshness` reporta `ok`/`ausente`/`desactualizado` y no muta
  el archivo; CLI: `memory doctor` reporta staleness sin cambiar el exit code.

- [x] **4.5** `node --test test/memory-engine.test.js test/mcp.test.js test/working-context.test.js
  test/cli.test.js` (335 ok) y comandos declarados `npm test` (503 ok) + `npm run lint` (limpio).
