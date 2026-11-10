# Proposal: Alinear el spec de frescura con el `recommendedAction` real de `discovery --check`

## Clasificación

**Funcional, con delta `MODIFIED`.** No cambia el runtime: el change alinea el spec canónico de
`cli-diagnostics` con lo que el CLI ya implementa y fija ese contrato con tests. Release patch
`0.26.3`.

## Problema

`ancleto discovery --check` ya emite estos valores de `recommendedAction` (`src/cli/index.js`):

- `READY` → `continue` (:2372-2375);
- sin `.discovery-state.json` o sin `hash` → `STALE` material con `regenerate` (:2367-2371);
- `STALE` con `impact` calculado → `regenerate` si es `material`, `continue` si es `minor` o `none`
  (:2383-2390);
- `MISSING` → `generate` (:2347-2351);
- `PARTIAL` → `complete` (:2352-2356).

El Requirement canónico de frescura (`aspec/specs/cli-diagnostics/spec.md`:568-628) declara la regla
general «`recommendedAction` SHALL ser `regenerate` cuando `impact` es `material` y `continue` cuando
es `minor` o `none`» (:574-575) y describe `MISSING` y `PARTIAL` como estados con `impact: none` y
arreglos vacíos, sin excepciones (:616-617). Como ambos estados siempre reportan `impact: none`, la
regla general implica `continue`, pero el CLI emite `generate`/`complete`: divergencia verificada
entre spec y código.

La divergencia no la detecta la suite actual porque `test/cli.test.js` omite a propósito
`recommendedAction` en los dos casos (:6712-6713, comentario incluido).

## Propuesta

Resolver la divergencia **alineando el spec al código**, no el código al spec:

1. Delta `MODIFIED` de `cli-diagnostics` que reescribe el Requirement de frescura con dos únicas
   ediciones —la excepción `MISSING`/`PARTIAL` en la regla de `recommendedAction` y la mención
   explícita de `generate`/`complete` en la estructura de estado— más un scenario nuevo que fija el
   caso.
2. Fijar `recommendedAction: 'generate'`/`'complete'` en los tests de `MISSING`/`PARTIAL` de
   `test/cli.test.js` y actualizar el comentario que documentaba la omisión intencional.
3. Cero cambios de runtime: `src/cli/index.js` no se toca.

## Garantías

**Cero cambio de runtime y de comportamiento observable.** El binario y su salida no cambian; sólo se
corrige la descripción canónica y se agrega cobertura. El diff queda confinado a:

- los artifacts de este change (`aspec/changes/align-freshness-recommended-action-spec/**`);
- `test/cli.test.js`;
- al archivar, `aspec/specs/cli-diagnostics/spec.md` por el merge del delta.

Exclusiones explícitas:

- Sin superficie de producto (`agents/**`, `skills/**`, `commands/**`, `templates/**`).
- `ancleto upgrade` no es necesario.
- El bump de versión, el tag y el publish son metadata de release y se manejan aparte (patch
  `0.26.3`); no forman parte de estas tareas.

## Decisiones

- **memory_key:** freshness-recommended-action-spec-alignment
  **Elección:** alinear el spec al código verificado: `MISSING` → `generate` y `PARTIAL` → `complete`,
  con `impact: none`; `regenerate`/`continue` se conservan para `READY` y `STALE`.
  **Descartado:** mantener la regla general sin excepciones y dejar la divergencia documentada.
  **Justificación:** el código es el oráculo verificable (`src/cli/index.js`:2347-2356) y
  `generate`/`complete` describen la acción concreta; el spec debe describir el contrato observable
  vigente. Mantener la divergencia deja un spec que ningún implementador puede seguir sin contradecir
  el binario.
  **Estado:** aprobado
refs:
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
  - change:align-freshness-recommended-action-spec

- **memory_key:** pin-recommended-action-missing-partial
  **Elección:** afirmar `recommendedAction: 'generate'` en el test de `MISSING` y
  `recommendedAction: 'complete'` en el de `PARTIAL`, y corregir el comentario que declaraba la
  omisión intencional.
  **Descartado:** seguir omitiendo `recommendedAction` en esos tests.
  **Justificación:** con el delta el valor pasa a ser canónico; sin pin, la divergencia puede
  reaparecer en silencio. Los tests existentes ya afirman `state`, `impact` y los arreglos vacíos, así
  que sólo falta la aserción de la acción.
  **Estado:** aprobado
refs:
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
  - path:test/cli.test.js

- **memory_key:** align-code-to-spec-recommended-action
  **Elección:** no cambiar el runtime; el CLI sigue emitiendo `generate` para `MISSING` y `complete`
  para `PARTIAL`.
  **Descartado:** alinear el código a la regla general, haciendo que ambos estados emitan `continue`.
  **Justificación:** sería un cambio observable de la salida del comando (minor por semver), con menos
  utilidad semántica —`generate`/`complete` indican la acción concreta— y riesgo para consumidores que
  ya leen esos valores.
  **Estado:** descartado
refs:
  - path:src/cli/index.js
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check

- **memory_key:** stale-none-recommended-action-gap
  **Elección:** no cubrir en este change el caso `STALE` con `impact: none`.
  **Descartado:** agregar un pin y/o una excepción de spec para `STALE` + `impact: none`.
  **Justificación:** el cálculo puede producir ese estado (hash global distinto con fuentes y hashes
  por archivo coincidentes, por ejemplo un estado escrito con otra formulación de hash) y ningún test
  lo fija; ampliarlo excede el objetivo de alinear `MISSING`/`PARTIAL` y queda como gap conocido.
  **Estado:** descartado
refs:
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
  - path:test/cli.test.js

## Riesgos

- **Merge de delta:** `MODIFIED` reemplaza el bloque completo del requirement —cuerpo y escenarios—
  (`src/core/specs-merge.js`:265-280; `spec:spec-sync`), no sólo el cuerpo. Por eso el delta re-lista
  los 9 escenarios canónicos además del nuevo; omitirlos los borraría al archivar.
- **Precedente de release:** el change `2026-11-10-readonly-helper-and-freshness-pins` registró como
  decisión descartada que resolver esta divergencia «exige un delta `MODIFIED` más un release minor».
  Aquí no hay cambio de runtime ni de superficie publicada, por lo que `0.26.3` patch es correcto; el
  orquestador decide el release final.
- **Título exacto:** el merge casa por título literal; cualquier diferencia de espaciado o guiones en
  `### Requirement: Clasificación determinista de frescura del seed en discovery --check` falla
  cerrado (`MODIFIED requirement not found`).
- **Cobertura previa:** hoy ningún test fija `recommendedAction` para `MISSING`/`PARTIAL`, así que la
  suite pasa sin cubrir el contrato; la cobertura llega con la tarea de tests.
