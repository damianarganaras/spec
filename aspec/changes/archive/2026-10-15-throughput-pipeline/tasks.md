# Tasks: Pipeline de mayor throughput

> Convención: implementación y validación van en secciones separadas. Cada recorte (menos round-trips) se acepta sólo si ΔQ ≥ 0 contra el baseline T0'. No se mezclan implementación y testing en un mismo ítem.

## Fase 0 — Baseline (PRIMER task, bloqueante)

- [x] T0.1 Registrar el baseline reproducible: correr `npm test` (comando declarado en `PRODUCT.md` → `## Project Commands`) **cronometrado** y anotar la duración de la suite.
- [x] T0.2 Registrar el consumo previo con `ancleto stats` en una ventana definida y dejar constancia de la ventana.
- [x] T0.3 Registrar RR/escapes de los últimos 10 changes archivados y calcular Q = (1−RR)(1−escapes). Referencia T0 vigente (memoria `token-budget.q-metric-definition`): RR=0.10, escapes=0.00, Q=0.90.
- [x] T0.4 Fijar el criterio de aceptación: todo recorte se acepta sólo si ΔQ ≥ 0; con ΔQ < 0 se revierte.

### Registro T0' (operativo, reproducible, pre-implementación)

- **Suite (T0.1)**: `npm test` (`node --test "test/*.test.js"`) → **71 209 ms** (`duration_ms`), 93 suites, **459 tests, 459 pass, 0 fail** (Windows, Node v24.15.0).
- **Consumo (T0.2)**: `ancleto stats --limit 10` — ventana = **las 10 sesiones más recientes** de opencode para este directorio: entrada **21.3M** · salida **1.3M** · razon **1.7M** · cache **326.8M** · costo **$16.65**.
- **RR (T0.3)**: fracción de los últimos 10 changes archivados con al menos una tarea sin completar (`- [ ]`) en `tasks.md` → **2/10 = 0.20** (`2026-10-14-token-budget` con V5/V6 abiertos; `2026-10-02-add-standard-linter` con 1 abierta).
- **escapes (T0.3)**: fracción de esos 10 changes archivados sin validación registrada (sección de validación con tareas abiertas) → **1/10 = 0.10** (`token-budget`, sección `## Validación` con V5/V6 abiertos).
- **Q (T0.3) = (1 − 0.20)(1 − 0.10) = 0.72**.
- **Criterio de aceptación (T0.4)**: todo recorte se acepta sólo si ΔQ ≥ 0; con ΔQ < 0 se revierte. La duración de la suite se registra como referencia, no como gate.

### Registro post-implementación (autovalidación scoped del coder)

- **Suite**: `npm test` → **65 047 ms** (`duration_ms`), 94 suites, **466 tests, 466 pass, 0 fail** (+7 guards de `throughput-pipeline`; sin regresión, dentro del ruido respecto de T0').
- **Lint**: `npm run lint` (`eslint src/ test/`) → **exit 0, sin errores**.
- **ΔQ = 0** (el change no introduce tareas abiertas; el recorte neto de round-trips es conductual, no de tokens de prompt). ΔQ ≥ 0 ⇒ aceptado. La etapa de validación formal (`V1`–`V7`) queda a cargo de `@tester`.

## Fase 1 — Paralelización de la finalización y el registro de memoria

- [x] T1.1 En `agents/orchestrator.md`, reemplazar la secuencia serial (paso 8 `@documenter` → paso 9 `@memory-keeper`) por la delegación **paralela** tras la aprobación de archive, declarando las superficies disjuntas (`aspec/` vs `.ancleto/memory.db`) y la ausencia de dependencia de salida.
- [x] T1.2 Declarar la invariante: si el registro necesitara el resultado del archive, no se paraleliza y se reporta bloqueo; el orquestador recoge y reporta ambas etapas.
- [x] T1.3 Alinear `agents/memory-keeper.md` para operar en el cierre paralelo sin requerir el resultado del archive.

## Fase 2 — Reviewer sin rebote con Validation Ledger prearmado

- [x] T2.1 En `agents/tester.md`, declarar la producción de un Validation Ledger **completo y cerrado** para el scope de review (tests del change, tests del affected-set, format check y lint declarados por el proyecto), con clasificación terminal por entrada —incluido `not-configured` como no-fallo registrado cuando el proyecto no declara format check o lint, consistente con `LOCKED: validation-commands`—.
- [x] T2.2 En `agents/orchestrator.md`, declarar el armado/verificación del cierre del ledger antes de delegar el review y la regla "no se delega review con ledger no cerrado: se detiene en la etapa de tester".
- [x] T2.3 En `agents/reviewer.md`, ajustar el contrato de evidencia (`:170`, `:197`): consumir el ledger prearmado sin reconstruirlo y no pedir re-delegación por evidencia de comando faltante/inconclusa dentro del scope cubierto; conservar el reporte de **contexto** faltante de la verificación de garantía.
- [x] T2.4 Verificar que `agents/reviewer.md` conserva `bash: false` y que el flag `GUARANTEE NOT SUSTAINED` sigue como `CRITICAL`.

## Fase 3 — affected-set determinístico por grafo de imports

- [x] T3.1 Implementar el módulo zero-dep del grafo de imports en `src/core/` (parseo estático de `import`/`export … from`/`require`/`import(` sobre `.js/.mjs/.cjs/.ts/.tsx`, resolución de especificadores relativos, respeto de los ignores del proyecto) que devuelva la clausura transitiva de dependientes de una semilla.
- [x] T3.2 Exponer el cómputo como superficie **read-only** por CLI para que el tester lo invoque (el orquestador y el reviewer no tienen bash); respetar la prioridad del mecanismo declarado por el proyecto en `PRODUCT.md` → `## Project Commands`.
- [x] T3.3 En `agents/tester.md`, declarar el cómputo y reporte del `affected-set` (clausura de dependientes + archivos tocados) como el objetivo de verificación.
- [x] T3.4 En `agents/reviewer.md` y `agents/orchestrator.md`, cambiar el scope de review de la "unión de `task-owned files` y relacionados directos" al `affected-set` propagado, preservando el `affected-set` con dependientes.
- [x] T3.5 Clasificar cada specifier del grafo en las 4 categorías cerradas —(1) relativo resoluble ⇒ arista; (2) no relativo ⇒ `externalCount`, sin arista ni `unresolved`; (3) dinámico sin literal (`import(expr)`/`require(expr)`) ⇒ `unresolved`; (4) relativo irresoluble ⇒ `unresolved`— y reportar sólo las categorías 3 y 4 como inconclusas, nunca las 1 y 2.

## Fase 4 — Memoria en un solo paso y sólo con candidato real

- [x] T4.1 En `agents/orchestrator.md`, reemplazar el contrato de cierre de memoria: como máximo **una** llamada, sólo con candidato real (Automatic Record); sin candidato no se invoca Optional Draft, no se pide aprobación de memoria y se finaliza sin almacenar.
- [x] T4.2 Reservar User-Approved Record a un pedido explícito del usuario; alinear `agents/memory-keeper.md` para que Automatic Record sea el único camino automático del cierre.

## Fase 5 — content-guards (obligatorio en el mismo change)

- [x] T5.1 `test/content-guards.test.js`: assert de que el orquestador declara la delegación paralela `@documenter` ∥ `@memory-keeper` y el cierre de memoria en un solo paso (sin ping-pong Optional Draft sin candidato).
- [x] T5.2 `test/content-guards.test.js`: assert de que el tester declara el `affected-set` determinístico por grafo de imports incluyendo dependientes.
- [x] T5.3 `test/content-guards.test.js`: assert de que el reviewer declara el consumo del ledger prearmado cerrado y del `affected-set` como scope, sin pedir re-verificación dentro del scope cubierto.
- [x] T5.4 Verificar que se **conservan** los guards de las salvaguardas intocables (`bash:false` en reviewer/orchestrator/spec-writer, cinco flags, Validation Ledger, bloqueo por CRITICAL).

## Validación (separada de implementación)

- [x] V1 `node --test test/content-guards.test.js` en verde con los asserts nuevos y los de salvaguardas.
- [x] V2 Test del helper del `affected-set`: (a) incluye dependientes; (b) determinístico (dos corridas → mismo set); (c) sin dependientes → set = archivos tocados.
- [x] V3 Test de la superficie CLI read-only del `affected-set` (o cobertura equivalente en la suite declarada).
- [x] V4 Suite completa `npm test` (comando declarado en `PRODUCT.md` → `## Project Commands`) en verde y comparación de duración contra T0'.
- [x] V5 `ancleto stats` post-change vs T0'; evaluar ΔQ ≥ 0 y revertir todo recorte con ΔQ < 0.
- [x] V6 Confirmar que ningún asset compartido entre hosts gana texto host-específico (contrato multi-host).
- [x] V7 Confirmar que las salvaguardas intocables siguen vigentes (garantías bajo modelo real, `affected-set` con dependientes, `bash:false`, cinco flags, CRITICAL, baseline).

### Registro de validación (tester)

- **V1**: `node --test test/content-guards.test.js` → **67 pass, 0 fail** (incluye los 7 guards nuevos de `throughput-pipeline` y los de salvaguardas: `bash:false`, cinco flags, `GUARANTEE NOT SUSTAINED`/CRITICAL, Validation Ledger).
- **V2/V3**: nuevo `test/affected-set.test.js` → **26 pass, 0 fail** (helper: dependientes directos+transitivos, determinismo, sin dependientes = tocados, semilla no-nodo, normalización absoluta/relativa, ignores; casos no resolubles: dinámico y relativo irresoluble reportados, comentario con `import(...)` = sobre-reporte conservador; CLI: read-only, `--json`, `--cwd` con semilla antes/después, uso inválido exit 1, `--cwd` inexistente, inconclusos en stderr).
- **V4**: `npm test` → **492 tests, 492 pass, 0 fail, 100 suites** (sin regresión; 26 tests nuevos respecto del registro del coder).
- **V5**: `ancleto stats --limit 10 --json` → `ok: true`; ΔQ = 0 ≥ 0 (el change no deja tareas abiertas). Consumo de tokens = referencia, no gate.
- **V6**: `git diff -- agents/` sin términos host-específicos; guard de compresión host-scoped en verde.
- **Format check**: **`not-configured`** (el proyecto no declara formatter; no es fallo).
- **Lint**: `npm run lint` (`eslint src/ test/`) → exit 0.
- **Gap flagged (resuelto por Fix A)**: un especificador **no relativo** (alias de paths, p.ej. `@/lib/x`) se descartaba en silencio; el contrato vigente lo declara **externo por construcción** (sin arista, sin `unresolved`, contado en `externalCount`) y reserva `inconclusive` a `import(expr)` y relativos irresolubles. La resolución de alias queda delegada al mecanismo declarado por el proyecto. Ver V8.

### Corrección de contrato Fix (A) — remediación del hallazgo CRITICAL

> El `@reviewer` marcó CRITICAL + `GUARANTEE NOT SUSTAINED` sobre un delta que prometía reportar los **alias** como `inconclusive` (el helper no lee config de alias y no puede distinguir un alias de un paquete npm). Decisión del usuario: **corregir el contrato** para que no prometa más de lo que el helper sostiene — **no** cambiar `src/core/affected-set.js`. Estas tareas quedan abiertas hasta ejecutarse; el change no se archiva con ellas pendientes.

- [x] T6.1 (artifacts) Alinear el delta `prompt-contracts` a la **taxonomía cerrada de 4 categorías** —(1) relativo resoluble ⇒ arista; (2) no relativo ⇒ `externalCount`, sin arista ni `unresolved`; (3) dinámico sin literal (`import(expr)`/`require(expr)`) ⇒ `unresolved`; (4) relativo irresoluble ⇒ `unresolved`—, con `externalCount` como dato informativo y aliases delegados al mecanismo declarado por el proyecto.
- [x] T6.2 (helper + CLI) Exponer en la superficie read-only del `affected-set` un **conteo de specifiers externos (no relativos)** como **dato** (`--json` y salida humana), sin tratarlo como warning ni resolverlo (`src/core/affected-set.js`, `src/cli/index.js`).
- [x] T6.3 (CLI) Corregir la salida JSON para exponer las **semillas normalizadas** (las mismas del cómputo: relativas-posix respecto de `rootDir`) en lugar de los args crudos, de modo que `j.seeds` y `j.affected` queden en el mismo espacio (`src/cli/index.js:2626`).
- [x] V8 (test de frontera) `test/affected-set.test.js`: specifier no relativo ⇒ externo (sin arista, sin `unresolved`, contado en el conteo de externos); `import(expr)` ⇒ `inconclusive`; specifier relativo irresoluble ⇒ `inconclusive`.

### Registro V8 (tester — frontera Fix A)

- **Helper** (`computeAffectedSet`): specifier no relativo (`node:fs`, `some-pkg`, `@/lib/alias`) ⇒ sin arista, sin `unresolved`, `externalCount` = 3; `externalCount` determinístico multi-archivo (3); `import(expr)` ⇒ `unresolved` con `import(<dynamic>)`; relativo irresoluble ⇒ `unresolved`; contraparte negativa: un alias NO se reporta inconcluso (el contrato no la enuncia).
- **CLI read-only**: `--json` expone `seeds` **normalizadas** (`./src/a.js` y absoluto ⇒ `['src/a.js']`, mismo espacio que `affected`) y `externalCount` como dato separado de `unresolved`; la salida humana reporta el conteo de externos en **stderr**.
- **Guard alineado**: `test/content-guards.test.js` fija la frontera nueva en `agents/tester.md` (dinámico y relativo irresoluble = `inconclusive`; no relativos = externos, nunca `inconclusive`), sin debilitar los asserts de salvaguardas.
- **Contraparte negativa (alias ⇒ inconclusive)**: marcada `_No-testeable-por-construcción (contraparte negativa)_` en el delta `prompt-contracts` (`specs/prompt-contracts/spec.md:79`) — limitación documentada, no hueco.

### Registro Fix (α2) — clasificador conservador por argumento

> Reescribe la detección de llamadas dinámicas en `src/core/affected-set.js` para clasificar **por el argumento** de la llamada, no por regex sobre el contenido. Sólo se escanean `import(` y `require(` (no `import.meta`, ni el `import` estático, ni `require.resolve(`); el argumento se aísla saltando espacios y comentarios (`/* */`, `//`); un literal puro (string o template sin `${}`) seguido de `)` es estático, y cualquier otro argumento (expresión pelada, `'./x' + y`, template con expresión, paréntesis) cae en `unresolved`. Elimina el falso positivo del backtracking `(?!['"])` que marcaba `require( 'x')` como dinámico. El comentario del módulo queda alineado. Sin cambio de frontera de externos ni alias-aware (opción B sigue deferred).

- **Código**: `src/core/affected-set.js` (clasificador + comentario del módulo); `src/cli/index.js` (la línea de conteo de externos en stderr se omite cuando es `0`; `--json` conserva `externalCount`).
- **Lint**: `eslint src/ test/` → exit 0.
- **Helper**: `node --test test/affected-set.test.js` → **26 pass, 0 fail**.
- **Suite**: `node --test "test/*.test.js"` → **492 tests, 492 pass, 0 fail, 100 suites** (`duration_ms` 60 263).
- **Probes (temporales, borrados)**: literal puro → estático; `require( 'x')` → estático sin falso positivo; `require(/*c*/ 'x' )` → estático; `'./x' + y` → `unresolved`; `require.resolve(` e `import.meta` → ignorados.
- **T6.1**: `[x]` (ya marcada; sin cambio de estado).
