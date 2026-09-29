# Design: Aislar del cwd las pruebas de `buildWorkingContext`

## Contexto y problema

`buildWorkingContext(scope, maxTokens = MAX_TOKENS, cwd = process.cwd())` (`src/core/memory/engine.js:89`)
resuelve el bloque de topología leyendo `.discovery-map.json` desde `cwd` (`engine.js:98`, `:119`;
helper `readTopologySummary(cwd)` en `src/core/discovery.js:64-73`). Cuando ese resumen existe,
`formatTopologyBlock` (`engine.js:58-64`) **antepone** `<ProjectTopology>` al bloque de reglas
(`engine.js:119`).

`test/memory-engine.test.js` crea el `engine` compartido con su `memory.db` en un directorio temporal
aislado (`dir`, `:11`), pero **12 llamadas** a `buildWorkingContext` **omiten el tercer argumento** y por
lo tanto heredan `process.cwd()` —la raíz del repo, que sí tiene `.discovery-map.json`— en lugar de su
directorio aislado. El baseline empírico (`node --test test/memory-engine.test.js`) dio **6 fallos**
sobre 44 pruebas.

| Línea de llamada | Llamada actual (omite la raíz) | Efecto |
|---|---|---|
| `:126` | `buildWorkingContext('repo')` | rompe `:127` `startsWith('<ProjectMemoryRules>')` |
| `:136` | `buildWorkingContext('scope-vacio')` | rompe `:136` `=== null` |
| `:419` | `buildWorkingContext('project')` | rompe `:420` `startsWith('<ProjectMemoryRules>')` |
| `:431` | `buildWorkingContext('project')` | cwd-dependiente (no rompe hoy) |
| `:436` | `buildWorkingContext('feature')` | cwd-dependiente (no rompe hoy) |
| `:441` | `buildWorkingContext('task')` | cwd-dependiente (no rompe hoy) |
| `:449` | `buildWorkingContext('project')` | cwd-dependiente (no rompe hoy) |
| `:454` | `buildWorkingContext('scope-inexistente')` | rompe `:454` `=== null` |
| `:477` | `eng.buildWorkingContext('project', 75)` | rompe `:478` `startsWith('<ProjectMemoryRules>')` |
| `:498` | `eng.buildWorkingContext('project', 60)` | cwd-dependiente (no aserta prefijo) |
| `:512` | `eng.buildWorkingContext('task', 50)` | cwd-dependiente (no aserta prefijo) |
| `:522` | `eng.buildWorkingContext('project', 5)` | rompe `:523` `startsWith('<ProjectMemoryRules>')` |

Restricción ya fijada en el proposal: el fix SHALL vivir **exclusivamente en los tests**; NO SHALL
modificarse código de producción. `engine.js` ya soporta recibir la raíz explícita, así que no hace falta
tocarlo.

## Decisión adoptada

**Pasar el directorio temporal aislado de cada prueba como tercer argumento explícito en las 12 llamadas
cwd-dependientes**, en dos fases con el mismo patrón.

### Fase 1 — engine compartido (8 llamadas)

La raíz correcta es `dir` (`:11`): el mismo directorio temporal que aloja el `memory.db` del `engine`
compartido. No contiene `.discovery-map.json`, así que `readTopologySummary(dir)` devuelve `null` y
`formatTopologyBlock(null)` no antepone nada. No se crea un tmpdir nuevo.

`cwd` es el **tercer** parámetro, después de `maxTokens`; estas 8 llamadas hoy solo pasan `scope`, así
que el arreglo es `buildWorkingContext(scope, undefined, dir)`: `undefined` activa el default
`MAX_TOKENS` y conserva el tamaño de bloque actual. **No** se debe escribir
`buildWorkingContext(scope, dir)`, que asignaría el directorio a `maxTokens`.

| Línea | Antes | Después |
|---|---|---|
| `:126` | `engine.buildWorkingContext('repo')` | `engine.buildWorkingContext('repo', undefined, dir)` |
| `:136` | `engine.buildWorkingContext('scope-vacio')` | `engine.buildWorkingContext('scope-vacio', undefined, dir)` |
| `:419` | `engine.buildWorkingContext('project')` | `engine.buildWorkingContext('project', undefined, dir)` |
| `:431` | `engine.buildWorkingContext('project')` | `engine.buildWorkingContext('project', undefined, dir)` |
| `:436` | `engine.buildWorkingContext('feature')` | `engine.buildWorkingContext('feature', undefined, dir)` |
| `:441` | `engine.buildWorkingContext('task')` | `engine.buildWorkingContext('task', undefined, dir)` |
| `:449` | `engine.buildWorkingContext('project')` | `engine.buildWorkingContext('project', undefined, dir)` |
| `:454` | `engine.buildWorkingContext('scope-inexistente')` | `engine.buildWorkingContext('scope-inexistente', undefined, dir)` |

### Fase 2 — fixture `withEngine` (4 llamadas, alcance ampliado aprobado)

El fixture `withEngine` (`:459-468`) crea su propio tmpdir y su `engine`, pero hoy invoca el callback
solo con el engine:

```js
return fn(eng)   // :463 — el tmpdir no llega al callback
```

Por eso sus 4 llamadas también omiten la raíz. El arreglo replica el patrón que **ya usa**
`withTopologyEngine` (`:612`, `return fn(eng, dir)`): propagar el `dir` del fixture al callback y pasarlo
como tercer argumento. Estas llamadas ya pasan su `maxTokens`, así que solo se agrega la raíz.

| Línea | Antes | Después |
|---|---|---|
| `:463` (helper) | `return fn(eng)` | `return fn(eng, dir)` |
| `:471` (callback) | `withEngine((eng) => {` | `withEngine((eng, dir) => {` |
| `:477` | `eng.buildWorkingContext('project', 75)` | `eng.buildWorkingContext('project', 75, dir)` |
| `:494` (callback) | `withEngine((eng) => {` | `withEngine((eng, dir) => {` |
| `:498` | `eng.buildWorkingContext('project', 60)` | `eng.buildWorkingContext('project', 60, dir)` |
| `:507` (callback) | `withEngine((eng) => {` | `withEngine((eng, dir) => {` |
| `:512` | `eng.buildWorkingContext('task', 50)` | `eng.buildWorkingContext('task', 50, dir)` |
| `:520` (callback) | `withEngine((eng) => {` | `withEngine((eng, dir) => {` |
| `:522` | `eng.buildWorkingContext('project', 5)` | `eng.buildWorkingContext('project', 5, dir)` |

Nota: `:498` y `:512` no asertan prefijo y por eso pasan hoy, pero son cwd-dependientes; se aíslan igual
para dejar el archivo enteramente determinista.

## Invariancia del contrato (no se toca producción)

El fix satisface el segundo Requirement del delta spec sin modificar el motor:

- `src/core/memory/engine.js` y `src/core/discovery.js` **no cambian**.
- La firma pública de `buildWorkingContext` y su default `cwd = process.cwd()` se conservan.
- La precedencia de `<ProjectTopology>` sobre `<ProjectMemoryRules>` cuando la raíz recibida contiene un
  resumen de topología se conserva (la cubren `:628-644` y `:656-666` con `withTopologyEngine`).
- La llamada sin tercer argumento conserva el default `process.cwd()`, sin cambios de comportamiento.

## Alternativas consideradas

- **(A) Cambiar el default del engine o quitar el prefijo de topología** — descartada: viola la restricción
  del proposal y altera comportamiento de producción para acomodar un test. La topología es una feature
  deliberada (`D3`), no un bug.
- **(B) `process.chdir(dir)` en un `before`/`after` global** — descartada: el cwd es estado del proceso,
  no del test. Afecta a las demás suites y a las pruebas que hoy corren con su propio fixture, y es
  frágil frente a ejecución concurrente del runner. El aislamiento por argumento es local y explícito.
- **(C) Sembrar un `.discovery-map.json` "vacío" en el tmpdir** — descartada: no elimina la dependencia
  del cwd (seguiría heredándose el mapa del repo en las llamadas sin argumento) y agrega un archivo cuya
  forma tendría que mantenerse válida. Peor: `formatTopologyBlock` con `tree_summary` vacío igual
  devuelve un bloque, así que no neutraliza el prefijo.
- **(D) Un `mkdtemp` por prueba para cada llamada** — descartada: sobre-ingeniería. El `dir` del engine
  compartido y el tmpdir de `withEngine` ya son aislados y únicos para el archivo; crear uno nuevo por
  llamada no agrega aislamiento relevante.
- **(E) Renombrar/eliminar el `.discovery-map.json` del repo durante el test** — descartada: muta estado
  del repositorio, interfiere con otras herramientas y con el resto de la suite, y no es reversible de
  forma segura.

## Diseño técnico

### Ubicación del invariante

El invariante "el bloque de reglas es determinista respecto del cwd del proceso" pertenece a **los
fixtures del test**, no al engine. El engine correctamente acepta una raíz explícita; el defecto era que
las pruebas no la pasaban. Por eso el arreglo vive en `test/memory-engine.test.js` y no introduce ni un
parámetro nuevo ni una rama nueva en producción.

### Fixtures existentes

- `withEngine` (`:459-468`) **sí se modifica**: su callback pasa a recibir el `dir` (`fn(eng, dir)`),
  igual que `withTopologyEngine`. Es un cambio del fixture, no de sus aserciones.
- `withTopologyEngine` (`:608-617`) **no se toca**: ya pasa la raíz explícita (`fn(eng, dir)` en `:612`)
  y `seedMap` (`:619-626`) sigue sembrando el mapa para probar la precedencia de `<ProjectTopology>`.
- Las pruebas que ya pasan la raíz (`:632`, `:649`, `:659`, `:672`) no se tocan.

### Por qué `undefined` en `maxTokens` (fase 1)

El default `maxTokens = MAX_TOKENS` (2000 tokens = 8000 chars) se preserva porque un argumento
`undefined` dispara el parámetro por defecto de JavaScript. Alternativa rechazada: hardcodear `2000`
—duplica el valor en los tests y lo acopla a una constante que podría cambiar; `undefined` dice "sin
override". En la fase 2 no aplica: esas llamadas ya pasan un `maxTokens` explícito.

## Verificación

El change se verifica empíricamente con el runner del repo (`node --test test/memory-engine.test.js`;
no hay scripts npm, ver `PRODUCT.md:116`). Conteos reales ya medidos:

| Momento | Fallos | Pass | Tests |
|---|---|---|---|
| Baseline (sin fix) | **6** (`:127`, `:136`, `:420`, `:454`, `:477`, `:522`) | 38 | 44 |
| Tras fase 1 (8 ediciones) | **2** (`:477`, `:522`) | 42 | 44 |
| Tras fase 2 (objetivo) | **0** | 44 | 44 |

- **Verificación puntual:** las 6 aserciones que fallaban pasan; `:431`, `:436`, `:441`, `:449`,
  `:498`, `:512` quedan deterministas aunque no fallaran.
- **No regresión:** las pruebas de topología (`:628`, `:646`, `:656`, `:668`) siguen verdes,
  confirmando que el prefijo `<ProjectTopology>` se conserva para una raíz con mapa.

La validación formal la ejecuta `@tester` (format check no-escritor y lint pass incluidos). El detalle va
en `tasks.md`.

## Riesgos y supuestos

- **Acoplamiento implícito al tmpdir.** Atar las aserciones a una raíz sin `.discovery-map.json` es
  intencional. Mitigación: el delta spec fija el invariante para que no se revierta por accidente.
- **Mapa no deseado en el tmpdir.** Si un test sembrara `.discovery-map.json` en el tmpdir, volvería el
  prefijo. Mitigación: ni `dir` (`:11`) ni el tmpdir de `withEngine` se usan para sembrar topología; las
  pruebas de topología usan su propio `withTopologyEngine`.
- **Regresión del fixture `withEngine`.** Agregar el segundo argumento al callback no altera el
  comportamiento del fixture; el patrón ya existe en `withTopologyEngine`. Los callbacks que no usen
  `dir` simplemente lo ignoran.
- **Supuesto:** el `engine` compartido y `dir` viven a nivel de módulo (`:11-13`) y están disponibles en
  todos los `describe` afectados; el `dir` de `withEngine` es local al fixture y se propaga por el
  callback, sin necesidad de un tmpdir nuevo.

## Nota sobre el contexto de origen

Contexto producido con rutas citadas y precedente de memoria del repo
(`memory-engine-test-fallos-aislamiento-cwd`); el comportamiento real se confirmó contra
`src/core/memory/engine.js`, `src/core/discovery.js` y `test/memory-engine.test.js`. Los conteos de
fallos provienen de ejecuciones reales del runner. Sin Work Item asociado (Azure DevOps deshabilitado en
`.ancletorc`).
