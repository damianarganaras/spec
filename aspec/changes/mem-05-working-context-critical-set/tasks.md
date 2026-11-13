# Tasks: Conjunto crítico estable del working-context

## 1. Lectura de la configuración

- [x] T1 — Agregar `readCriticalMemoryKeys(projectRoot)` en `src/core/memory/working-context.js`: lee `.ancletorc` → `memory.criticalKeys`; ausente, JSON inválido, valor no-array o entradas no-string se normalizan a `[]` (tolerante, sin lanzar).
- [x] T2 — Usar `readCriticalMemoryKeys` en `renderWorkingContextBlock` y en `refreshWorkingContextOnWrite`, pasando `{ required }` como cuarto argumento a `engine.buildWorkingContext(scope, undefined, projectRoot, { required })`; en el camino día-cero (sin engine) no se consulta la configuración.

## 2. Configuración inicial

- [x] T3 — Agregar la clave aditiva `memory.criticalKeys` en `.ancletorc` con las 7 claves verificadas como `rule` activas de scope `project`: `repo-validation-commands`, `node-test-scope-explicit-paths`, `delta-modified-restates-requirement-body`, `content-guard-change-artifact-location`, `agent-model-three-surfaces`, `working-context-render`, `content-guard-literal-overflow-warning`.

## 3. Política de fallo

- [x] T4 — En `memoryContext` (`src/cli/index.js`): capturar el error de `renderWorkingContextBlock`, escribir el mensaje en `stderr` nombrando la `memory_key`, fijar `process.exitCode = 1` y NO escribir el archivo destino (ni con `--out`).
- [x] T5 — En `refreshWorkingContext` (lifecycle) y `refreshWorkingContextOnWrite` (on-write): capturar el error de render, emitir `console.warn` nombrando la `memory_key` y no escribir un bloque degradado; el camino de `memory doctor` queda best-effort con el mismo criterio.

## 4. Tests

- [x] T6 — Test del renderer con DB temporal y `.ancletorc` temporal: las claves críticas se inyectan primero y en el orden declarado.
- [x] T7 — Test de desplazamiento: con presupuesto ajustado, una no crítica no entra si una crítica quedó fuera.
- [x] T8 — Test de clave crítica inexistente o inactiva: la generación falla con un error que nombra la `memory_key`.
- [x] T9 — Test de configuración malformada (`memory.criticalKeys` ausente, no-array o JSON inválido): equivale a `[]` y el bloque es idéntico al vigente.
- [x] T10 — Test de la superficie explícita: `ancleto memory context` falla con código distinto de cero y no sobrescribe el archivo previo.
- [x] T11 — Test del lifecycle/on-write: el fallo emite `console.warn` con la `memory_key` y no escribe un bloque degradado.
- [x] T12 — Test de regresión del `<ContextOverflowWarning>`: con una DB temporal sin claves críticas, el texto, el conteo y el orden de las claves omitidas no cambian.
- [x] T13 — Verificar que ningún test abre la DB real `.ancleto/memory.db` (todo usa rutas temporales).

## 5. Validación y cierre

- [ ] T14 — Ejecutar `npm run lint` con `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- [ ] T15 — Ejecutar `npm test` con `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run test`.
- [ ] T16 — Registrar el cierre SÓLO en `aspec/backlog.md` (cerrar el ítem P1 · MEM-05 y actualizar 'Última actualización'); `docs/BACKLOG_*` es de lectura, no se edita.
