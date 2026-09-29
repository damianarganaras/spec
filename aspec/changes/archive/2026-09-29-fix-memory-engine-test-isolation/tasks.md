# Tasks: Aislar del cwd las pruebas de `buildWorkingContext`

> Orden: (a) baseline de tests → (b) fix fase 1 (engine compartido) → (c) re-run → (d) fix fase 2
> (`withEngine`, alcance ampliado aprobado) → (e) re-run final a 0 fallos → (f) format check + lint.
> Todo el trabajo vive en `test/memory-engine.test.js`; **no se modifica código de producción**
> (`src/core/memory/engine.js` y `src/core/discovery.js` quedan intactos).
> Responsabilidades separables: las **secciones 2 y 4** son el fix (`@coder`); la **sección 6** es la
> **validación formal y la ejecuta `@tester`**, no `@coder`.

## 1. Baseline empírico (antes del fix) — evidencia de conteo

> El archivo se ejecuta **sin modificar**. Objetivo: registrar el conteo real y su composición.

- [x] **1.1** Ejecutar el runner de tests del repo sobre el archivo sin cambios:
  `node --test test/memory-engine.test.js` y registrar el **conteo real de fallos** (baseline) junto con
  los nombres de los tests que fallan.
  **Baseline real: 6 fallos** (44 tests, 38 pass, 6 fail):
  1. `inyecta reglas activas del scope en el bloque con etiqueta de no confiables` (`:127`)
  2. `devuelve null cuando no hay reglas en el scope` (`:136`)
  3. `genera XML bien formado con etiqueta de no confiables` (`:420`)
  4. `devuelve null para scope sin reglas activas` (`:454`)
  5. `trunca reglas enteras (nunca corta strings) y el XML cierra correctamente` (`:478`, llamada `:477`)
  6. `con limite muy chico no incluye reglas y el XML sigue valido` (`:523`, llamada `:522`)

  **Hallazgo:** los fallos 5 y 6 provienen de las pruebas con `withEngine` (`:477`, `:522`). Esas
  llamadas también omiten el tercer argumento y heredan `process.cwd()` — la premisa de que "ya pasan la
  raíz" era falsa. Ver `## Hallazgo`.
- [x] **1.2** Registrar ese conteo baseline en el reporte final del change (número exacto + tests
  afectados), como punto de comparación obligatorio contra el conteo posterior al fix.

## 2. Fix fase 1: aislamiento en el engine compartido — `@coder`

> Agregar la raíz explícita `dir` (`test/memory-engine.test.js:11`) como **tercer** argumento.
> Como `cwd` es el tercer parámetro, hay que pasar el segundo (`maxTokens`) como `undefined`
> para conservar el default `MAX_TOKENS`. **No** escribir `buildWorkingContext(scope, dir)`.
> Ref: Requirement "Aislamiento del cwd en las pruebas de `buildWorkingContext`" / Scenario
> "El engine compartido no hereda el cwd".

- [x] **2.1** `:126`: pasar `dir` como tercer argumento → `engine.buildWorkingContext('repo', undefined, dir)`.
  Ref: Scenario "Resultado aislado sin resumen de topología".
- [x] **2.2** `:136`: pasar `dir` como tercer argumento → `engine.buildWorkingContext('scope-vacio', undefined, dir)`.
  Ref: Scenario "Resultado aislado sin resumen de topología".
- [x] **2.3** `:419`: pasar `dir` como tercer argumento → `engine.buildWorkingContext('project', undefined, dir)`.
- [x] **2.4** `:431`: pasar `dir` como tercer argumento → `engine.buildWorkingContext('project', undefined, dir)`.
- [x] **2.5** `:436`: pasar `dir` como tercer argumento → `engine.buildWorkingContext('feature', undefined, dir)`.
- [x] **2.6** `:441`: pasar `dir` como tercer argumento → `engine.buildWorkingContext('task', undefined, dir)`.
- [x] **2.7** `:449`: pasar `dir` como tercer argumento → `engine.buildWorkingContext('project', undefined, dir)`.
- [x] **2.8** `:454`: pasar `dir` como tercer argumento → `engine.buildWorkingContext('scope-inexistente', undefined, dir)`.
- [x] **2.9** Confirmar que **no** se tocaron las pruebas que ya pasan la raíz (`:632`, `:649`, `:659`,
  `:672`) ni `withTopologyEngine` (`:608-626`), y que no se modificó ninguna aserción.
  Ref: Requirement "Invariancia de la firma y del comportamiento por defecto de `buildWorkingContext`".
  **Confirmado:** `git diff` limitado a `test/memory-engine.test.js`, 8 inserciones / 8 deleciones, todas en
  las llamadas `:126`, `:136`, `:419`, `:431`, `:436`, `:441`, `:449`, `:454`. Ninguna aserción modificada.
- [x] **2.10** Confirmar que ningún archivo fuera de `test/memory-engine.test.js` fue modificado
  (`git status` limitado a `src/`).
  **Confirmado:** `git status --porcelain -- src/` vacío y `git diff --stat -- src/` con 0 líneas.
  `src/core/memory/engine.js` y `src/core/discovery.js` intactos.

## 3. Re-run tras fase 1 (evidencia intermedia)

- [x] **3.1** Re-ejecutar `node --test test/memory-engine.test.js` y registrar el **conteo de fallos**
  posterior a la fase 1. Comparar con el baseline de `1.1`.
  **Posterior real: 2 fallos** (44 tests, 42 pass, 2 fail). Baseline 6 → posterior 2 (4 corregidos).
  Fallos restantes:
  1. `trunca reglas enteras (nunca corta strings) y el XML cierra correctamente` (`:478`; llamada `:477`
     `eng.buildWorkingContext('project', 75)`): omite el tercer argumento → hereda `process.cwd()`.
  2. `con limite muy chico no incluye reglas y el XML sigue valido` (`:523`; llamada `:522`
     `eng.buildWorkingContext('project', 5)`): idem.
  Ambas viven en `withEngine`, cuyo callback no propaga su tmpdir. Ver `## Hallazgo`.
- [x] **3.2** Verificar que las 4 aserciones del engine compartido hoy rotas pasan: `:127`
  (`startsWith('<ProjectMemoryRules>')`), `:136` (`=== null`), `:420`
  (`startsWith('<ProjectMemoryRules>')`), `:454` (`=== null`).
  Ref: Scenario "Resultado aislado sin resumen de topología" y "Determinismo independiente del cwd del proceso".
  **Confirmado:** los 4 tests pasan tras la fase 1.
- [x] **3.3** Verificar no regresión de las pruebas de topología (`:628`, `:646`, `:656`, `:668`): con la
  raíz `dir` de `withTopologyEngine` el bloque sigue encabezando con `<ProjectTopology>` cuando hay mapa.
  Ref: Scenario "La topología sigue precediendo al bloque de reglas".
  **Confirmado:** las 4 pruebas del suite "buildWorkingContext — inyeccion de topologia (D3)" siguen verdes.

## 4. Fix fase 2 (alcance ampliado aprobado): propagar la raíz de `withEngine` — `@coder`

> El usuario **aprobó ampliar el alcance**: propagar el `dir` del fixture `withEngine` a las 4 llamadas
> restantes. Mismo patrón que la fase 1, **solo tests, sin tocar producción**. `withEngine` hoy invoca
> `fn(eng)` (`:463`); debe invocar `fn(eng, dir)` como ya hace `withTopologyEngine` (`:612`).
> Estas llamadas ya pasan su `maxTokens`: solo se agrega la raíz como tercer argumento.
> Ref: Requirement "Aislamiento del cwd en las pruebas de `buildWorkingContext`" / Scenario
> "El fixture con tmpdir propaga su raíz aislada".

- [x] **4.1** `:463` (helper `withEngine`): propagar el `dir` del fixture al callback →
  `return fn(eng, dir)`.
  **Hecho.**
- [x] **4.2** `:477`: pasar la raíz del fixture → `eng.buildWorkingContext('project', 75, dir)`
  (callbacks `:471` y `:494` deben aceptar `(eng, dir)`).
  Ref: Scenario "El fixture con tmpdir propaga su raíz aislada".
  **Hecho:** los 4 callbacks `withEngine((eng) => {` pasaron a `(eng, dir) =>` (líneas `:471`, `:494`,
  `:507`, `:520`).
- [x] **4.3** `:498`: pasar la raíz del fixture → `eng.buildWorkingContext('project', 60, dir)`.
  **Hecho.**
- [x] **4.4** `:512`: pasar la raíz del fixture → `eng.buildWorkingContext('task', 50, dir)`.
  **Hecho.**
- [x] **4.5** `:522`: pasar la raíz del fixture → `eng.buildWorkingContext('project', 5, dir)`
  (callbacks `:507` y `:520` deben aceptar `(eng, dir)`).
  Ref: Scenario "El fixture con tmpdir propaga su raíz aislada".
  **Hecho.**
- [x] **4.6** Confirmar que ninguna aserción se modificó y que `withTopologyEngine` (`:608-626`) y las
  pruebas que ya pasan la raíz (`:632`, `:649`, `:659`, `:672`) quedan intactas.
  **Confirmado:** `git diff` solo toca las 9 líneas de la fase 2 (helper + 4 callbacks + 4 llamadas);
  ninguna aserción ni el bloque `withTopologyEngine`/topología fueron modificados.
- [x] **4.7** Confirmar que ningún archivo fuera de `test/memory-engine.test.js` fue modificado:
  `git status --porcelain -- src/` vacío y `git diff --stat -- src/` con 0 líneas.
  Ref: Requirement "Invariancia de la firma y del comportamiento por defecto de `buildWorkingContext`".
  **Confirmado:** `git status --porcelain -- src/` vacío y `git diff --stat -- src/` con 0 líneas.

## 5. Re-run final (44 pruebas) — objetivo 0 fallos

- [x] **5.1** Re-ejecutar `node --test test/memory-engine.test.js` y registrar el **conteo de fallos
  posterior a la fase 2**. **Criterio de salida: 0 fallos sobre 44 pruebas.**
  **Posterior real: 0 fallos** (44 tests, 44 pass, 0 fail). Criterio de salida cumplido.
- [x] **5.2** Dejar registrados los **tres conteos como evidencia** en el reporte final: baseline 6
  (38 pass) → fase 1: 2 (42 pass) → fase 2: 0 (44 pass). Si el conteo no es 0, documentar cada fallo
  restante y su causa sin reconciliar con estimaciones.
  **Registrado:** 6 → 2 → 0, exactamente el objetivo.
- [x] **5.3** Verificar que las 6 aserciones que fallaban pasan (`:127`, `:136`, `:420`, `:454`, `:478`,
  `:523`) y que las pruebas de topología (`:628`, `:646`, `:656`, `:668`) siguen verdes.
  Ref: Scenarios "Resultado aislado sin resumen de topología", "El fixture con tmpdir propaga su raíz
  aislada" y "La topología sigue precediendo al bloque de reglas".
  **Confirmado:** las 6 pruebas pasan; el suite "buildWorkingContext — inyeccion de topologia (D3)"
  (4 pruebas) sigue verde, preservando la precedencia de `<ProjectTopology>` con mapa real.

## 6. Validación formal — propiedad de `@tester`

> **Esta sección la ejecuta `@tester`, no `@coder`.** Debe correr **después** de las ediciones de las
> secciones 2 y 4. Incluye los checks no-escritores post-edición.

- [x] **6.1** Ejecutar la suite del archivo afectado: `node --test test/memory-engine.test.js`, y
  confirmar **0 fallos** (o documentar fallos ajenos a este change).
  **Evidencia (reproducida):** `node --test test/memory-engine.test.js` → **44 tests, 44 pass, 0 fail**,
  EXIT=0. Ejecutado desde el repo root y desde un cwd temporal sin `.discovery-map.json` (mismo resultado
  en ambos). Conteos acumulados: baseline 6 → fase 1: 2 → fase 2: 0.
- [x] **6.2** **Format check no-escritor**: ejecutar un check que **no escriba** sobre
  `test/memory-engine.test.js` (p. ej. `node --check test/memory-engine.test.js` para validación de
  sintaxis; y `npx --yes prettier --check test/memory-engine.test.js` si hay formateador disponible).
  Confirmar que el archivo queda sin cambios (ningún write).
  **Evidencia:** `node --check test/memory-engine.test.js` → OK, sintaxis válida, sin writes.
  **Prettier: gate ausente** — el repo no tiene `node_modules`, ni config Prettier, ni devDeps/scripts en
  `package.json`, por lo que el check no es ejecutable sin red. Archivo sin cambios (ningún write).
- [x] **6.3** **Lint pass** tras las ediciones: ejecutar el lint configurado en el repo; si no existe
  (el repo declara no tener config de ESLint ni scripts npm — ver `PRODUCT.md:115`), documentarlo
  explícitamente y tomar `node --check` + `node --test` como gates disponibles.
  **Evidencia:** **lint: gate ausente** — el repo no tiene config ESLint ni scripts npm (ver
  `PRODUCT.md:115`). Se documenta explícitamente y **no se inventó lint**; los gates disponibles usados
  fueron `node --check` + `node --test`.
- [x] **6.4** Verificar que la restricción se cumplió: `test/memory-engine.test.js` es el único archivo
  modificado; `src/core/memory/engine.js` y `src/core/discovery.js` sin cambios; firma y default de
  `buildWorkingContext` intactos.
  **Evidencia:** `test/memory-engine.test.js` es el único archivo modificado. `git status --porcelain -- src/`
  vacío y `git diff --stat -- src/` con 0 líneas → `src/core/memory/engine.js` y `src/core/discovery.js`
  intactos. Firma y default de `buildWorkingContext(scope, maxTokens = MAX_TOKENS, cwd = process.cwd())`
  en `engine.js:89` intactos.
  **Conjunto afectado adicional:** `node --test test/working-context.test.js test/discovery-topology.test.js`
  → **24/24, 0 fail**.

## Hallazgo (resuelto por ampliación de alcance aprobada)

El baseline empírico (6 fallos) coincidió con el conteo reportado, pero su **composición** contradijo el
supuesto del alcance original: 2 de los 6 fallos eran de las pruebas `withEngine` (`:477`, `:522`), que el
alcance marcaba como "no tocar" asumiendo que ya pasaban la raíz. Esa premisa era falsa: el fixture
propio tmpdir pero su callback no recibía el `dir`. Con las 8 ediciones de la fase 1 el archivo quedaba en
**2 fallos**, incumpliendo el criterio de salida "0 fallos".

El usuario **aprobó la ampliación de alcance** (opción B): propagar el `dir` de `withEngine` a las 4
llamadas restantes (`:477`, `:498`, `:512`, `:522`) con el mismo patrón, solo tests. El delta spec
(Requirement general + Scenario "El fixture con tmpdir propaga su raíz aislada") cubre ahora esas 4
llamadas. La sección 4 ejecuta esa ampliación.
