# Proposal: Aislar del cwd las pruebas de `buildWorkingContext`

## Problema

`buildWorkingContext(scope, maxTokens = MAX_TOKENS, cwd = process.cwd())` resuelve el bloque
`<ProjectTopology>` leyendo `.discovery-map.json` desde `cwd` (`src/core/memory/engine.js:89`,
`:98`, `:119`; helper `readTopologySummary(cwd)` en `src/core/discovery.js:64-73`). Cuando ese
resumen existe, el resultado **antepone** `<ProjectTopology>` al bloque de reglas
(`engine.js:119`, `formatTopologyBlock` en `:58-64`).

`test/memory-engine.test.js` crea un `engine` a nivel de módulo con su `memory.db` en un
directorio temporal aislado (`:11-13`), pero varias pruebas llaman `buildWorkingContext` **sin el
tercer argumento**, por lo que heredan `process.cwd()` —la raíz del repo, que sí tiene
`.discovery-map.json`— en lugar de su directorio aislado.

Consecuencia: hay **12 llamadas** que omiten la raíz y **6 aserciones** que rompen por eso. El
conteo y la composición se establecieron empíricamente ejecutando el runner del repo
(`node --test test/memory-engine.test.js`), no por estimación estática:

| Línea de llamada | Llamada (sin 3er arg) | Aserción que rompe |
|---|---|---|
| `:126` | `buildWorkingContext('repo')` | `:127` `startsWith('<ProjectMemoryRules>')` |
| `:136` | `buildWorkingContext('scope-vacio')` | `:136` `=== null` |
| `:419` | `buildWorkingContext('project')` | `:420` `startsWith('<ProjectMemoryRules>')` |
| `:431` | `buildWorkingContext('project')` | cwd-dependiente (no rompe hoy) |
| `:436` | `buildWorkingContext('feature')` | cwd-dependiente (no rompe hoy) |
| `:441` | `buildWorkingContext('task')` | cwd-dependiente (no rompe hoy) |
| `:449` | `buildWorkingContext('project')` | cwd-dependiente (no rompe hoy) |
| `:454` | `buildWorkingContext('scope-inexistente')` | `:454` `=== null` |
| `:477` | `withEngine`: `eng.buildWorkingContext('project', 75)` | `:478` `startsWith('<ProjectMemoryRules>')` |
| `:498` | `withEngine`: `eng.buildWorkingContext('project', 60)` | cwd-dependiente (no aserta prefijo) |
| `:512` | `withEngine`: `eng.buildWorkingContext('task', 50)` | cwd-dependiente (no aserta prefijo) |
| `:522` | `withEngine`: `eng.buildWorkingContext('project', 5)` | `:523` `startsWith('<ProjectMemoryRules>')` |

**Evidencia empírica (no reconciliada con estimaciones):**

- **Baseline antes del fix:** 6 fallos / 38 pass / 44 tests. Fallos: `:127`, `:136`, `:420`,
  `:454` (engine compartido) y `:477`, `:522` (fixture `withEngine`).
- **Tras las 8 ediciones del engine compartido:** 2 fallos / 42 pass / 44 tests. Restantes:
  `:477` y `:522`.

Las 4 llamadas del fixture `withEngine` (`:477`, `:498`, `:512`, `:522`) crean su propio tmpdir,
pero el helper invoca el callback solo con el `engine` (`fn(eng)` en `:463`), de modo que el tmpdir
no llega a las llamadas y estas heredan `process.cwd()`. `:498` y `:512` pasan hoy porque no
asertan prefijo, pero igual son cwd-dependientes y deben quedar aisladas.

## Cambio propuesto

Corregir el aislamiento **en los tests**, en dos fases con el mismo patrón (raíz explícita como
tercer argumento), en todas las llamadas que hoy la omiten, usando el directorio temporal aislado
de cada prueba como raíz:

1. **Engine compartido:** pasar `dir` (`:11`) como tercer argumento en las 8 llamadas `:126`,
   `:136`, `:419`, `:431`, `:436`, `:441`, `:449`, `:454`.
2. **Fixture `withEngine` (alcance ampliado, aprobado por el usuario):** propagar el `dir` del
   fixture al callback (`fn(eng, dir)`, igual que `withTopologyEngine` en `:612`) y pasar esa raíz
   como tercer argumento en las 4 llamadas `:477`, `:498`, `:512`, `:522`. Estas ya pasan su
   `maxTokens`, así que solo se agrega la raíz.

Esos directorios temporales no contienen `.discovery-map.json`, así que `readTopologySummary`
devuelve `null`, no se antepone `<ProjectTopology>` y el resultado vuelve a ser determinista e
independiente del cwd. **Objetivo de salida: 0 fallos sobre las 44 pruebas.**

No se toca código de producción.

## Restricción obligatoria (constraint)

- El fix SHALL vivir **exclusivamente en los tests**. NO SHALL modificarse código de producción.
- `buildWorkingContext` **puede** recibir la raíz explícita como argumento (ya la soporta), pero
  NO SHALL cambiar su comportamiento por defecto ni su firma pública para acomodar los tests: el
  parámetro `cwd` conserva el default `process.cwd()`, y la precedencia de `<ProjectTopology>`
  cuando existe el resumen de topología se mantiene.

## Alcance

In scope (solo `test/memory-engine.test.js`):

- Ajustar las 8 llamadas del `engine` compartido que omiten el tercer argumento (`:126`, `:136`,
  `:419`, `:431`, `:436`, `:441`, `:449`, `:454`) para pasar la raíz explícita aislada.
- Propagar el `dir` del fixture `withEngine` al callback y pasarlo como tercer argumento en sus 4
  llamadas (`:477`, `:498`, `:512`, `:522`).

Out of scope (no-goals):

- **No** se modifica `src/core/memory/engine.js` ni `src/core/discovery.js`.
- **No** se cambia la lógica de topología, el default `process.cwd()`, ni la firma pública de
  `buildWorkingContext`.
- **No** se tocan las pruebas que ya pasan la raíz explícita (`:632`, `:649`, `:659`, `:672`), el
  fixture `withTopologyEngine` (`:608-626`) ni ninguna aserción.
- **No** se generan tests nuevos: solo se corrige el aislamiento de las llamadas existentes.

## Riesgos

- **Acoplamiento implícito al tmpdir:** atar las aserciones a una raíz sin `.discovery-map.json`
  es intencional pero implícito. Mitigación — el delta spec fija el invariante (raíz explícita ⇒
  sin `<ProjectTopology>`; sin argumento ⇒ comportamiento sin cambios) para que no se revierta
  por accidente.
- **Mapa no deseado en el tmpdir:** el tmpdir podría contener un `.discovery-map.json` si un test
  lo sembrara. Mitigación — ni `dir` (`:11`) ni el tmpdir de `withEngine` se usan para sembrar
  topología; las pruebas de topología usan su propio `withTopologyEngine`.
- **Regresión del fixture:** cambiar `withEngine(fn)` a `fn(eng, dir)` agrega un argumento a los
  callbacks. Mitigación — los callbacks actuales lo aceptan o lo ignoran; el patrón ya existe en
  `withTopologyEngine` y no cambia el comportamiento del fixture.

## Nota sobre el contexto de origen

Contexto producido con rutas citadas y precedente de memoria del repo
(`memory-engine-test-fallos-aislamiento-cwd`); el comportamiento real se confirmó contra
`src/core/memory/engine.js`, `src/core/discovery.js` y `test/memory-engine.test.js` antes de
escribir esta spec. Los conteos de fallos provienen de ejecuciones reales del runner
(`node --test test/memory-engine.test.js`). Sin Work Item asociado (Azure DevOps deshabilitado en
`.ancletorc`).
