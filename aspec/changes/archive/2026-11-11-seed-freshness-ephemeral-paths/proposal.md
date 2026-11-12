# Proposal: Rutas efímeras fuera de la frescura del seed

## Intención

`ancleto discovery --check` hoy cuenta `.ancleto/**` y el `.discovery-map.json` de la raíz como
cambios del repositorio. Como `.ancleto/memory.db`, sus `-wal`/`-shm` y el mapa de descubrimiento
mutan con cualquier operación de memoria, el seed queda `STALE` de forma permanente aunque la
arquitectura no haya cambiado. Este change hace que esas rutas efímeras dejen de contar como cambio
de frescura; la regeneración del seed sigue siendo parte del checklist de release.

Es un cambio **funcional** (no de conformidad): el comportamiento observable de
`discovery --check` cambia, por eso lleva un delta MODIFIED sobre la capability `cli-diagnostics`.
Release **MINOR 0.28.0**.

## Alcance

In scope:

- `src/cli/index.js` — un predicado anclado de ruta efímera y su aplicación simétrica dentro de
  `checkDiscovery`, incluida la atribución por diff de archivos que excusa el desvío de hash.
- `test/cli.test.js` — pins de comportamiento para rutas efímeras, anclaje del predicado, estado
  legacy y conservación de los pins existentes.
- `aspec/changes/seed-freshness-ephemeral-paths/**` — estos artifacts.
- `aspec/specs/cli-diagnostics/spec.md` — sólo en el archive, por merge del delta.

Out of scope (explícito, no se implementa aquí):

- Cualquier exclusión adicional de rutas: `docs/**`, `aspec/**`, `documentation/**` o logs de
  auditoría.
- El contenido del pack de Repomix y la lista de ignore de `src/core/repomix-tier.js`.
- Cualquier cambio a la forma del estado persistido o a `ruleVersion` (NO `ruleVersion: 3`).
- La deuda del pin offline de `packDiscovery` (queda diferida).
- Todos los demás diferimientos del backlog: A3/#4, A4/MEM-05, A5/CH-06b, A6, A7, D, #6,
  T27/CH-01, CH-00, CH-07, CH-08/MEM-06, CH-09a-g, CH-10, copilot-mcp runtime y la extensión de
  VS Code.
- La reconciliación de `docs/PLAN...` y `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` (sólo una nota
  mínima si el ítem vive ahí).

## Requisitos

- `discovery --check` SHALL considerar rutas efímeras exactamente a `.discovery-map.json` en la raíz
  del repositorio y a `.ancleto` más cualquier ruta bajo `.ancleto/`.
- El predicado SHALL estar anclado a la ruta completa: NO SHALL coincidir con `.ancletorc`,
  `.ancleto-notes.md` ni `src/ancleto/x.js`.
- El filtro SHALL aplicarse simétricamente a la vista persistida y a la vista actual de `sources`
  antes de `computeImpact`, de modo que ni las altas ni las bajas efímeras produzcan áreas ni
  razones de materialidad.
- `storedFileHashes` y `currentFileHashes` SHALL seguir siendo mapas completos, para poder atribuir
  cambios reales y para que el writer no cambie.
- Cuando el hash persistido no coincida, el estado SHALL seguir siendo `READY` sólo si, sobre los
  mapas completos, hay al menos una ruta cambiada (alta, baja o contenido distinto) y todas las
  rutas cambiadas son efímeras. Un desvío de hash sin rutas cambiadas NO SHALL excusarse.
- Un estado legacy sin `fileHashes` NO SHALL volverse `READY` ni material por esta regla: sigue
  `STALE` minor con `materialReasons: []` y la nota exacta existente.
- El writer (`packDiscovery`) NO SHALL cambiar: persiste `version: 1`, `generatedAt`, `sources`,
  `fileHashes`, `hash`, `ruleVersion: 2`, `semantic` y `packTokens` con los campos crudos intactos.
- NO SHALL agregarse configuración nueva, ni un segundo oráculo, ni un hash global derivado o
  filtrado.
- MISSING/PARTIAL y `seedMapPresent` NO SHALL cambiar; tampoco la materialidad de
  `package-lock.json`/`CHANGELOG.md` ni la normalización de `version` del `package.json` de la raíz.

## Riesgos con mitigación

- **Excusar de más**: conceder `READY` ante cualquier desvío de hash ocultaría cambios reales.
  Mitigación: la excusa exige ≥1 ruta cambiada y que todas sean efímeras; cero rutas cambiadas
  conserva el pin de hash desincronizado (`test/cli.test.js:7081`).
- **Predicado demasiado ancho**: un `startsWith('.ancleto')` atraparía `.ancletorc` y
  `.ancleto-notes.md`. Mitigación: igualdad exacta con `.ancleto` más prefijo `.ancleto/`, con pin
  de anclaje dedicado.
- **Estados legacy ilegibles**: sin `fileHashes` no hay atribución posible.
  Mitigación: se preserva `STALE` minor con `materialReasons: []` y jamás se promueve a material.
- **Cambio de significado de estados persistidos**: si el hash global se filtrara, los estados
  guardados quedarían inválidos. Mitigación: no se deriva ningún hash; el estado se compara como
  hoy y la pertenencia de rutas es un predicado de lectura.
- **Rollback a 0.27.0**: si el writer cambiara, una CLI previa leería distinto. Mitigación: writer
  intacto y estado sin cambios de forma.

## Decisión de arquitectura

Un único predicado anclado en `src/cli/index.js` decide la pertenencia de rutas efímeras. El filtro
se aplica simétricamente a las dos vistas de `sources` (persistida y actual) dentro de
`checkDiscovery`, justo antes de construir el argumento de `computeImpact`; los mapas de hashes por
archivo permanecen completos y el bucle de comparación recorre sólo las `sources` filtradas, así que
las claves efímeras nunca se iteran.

El oráculo de `READY` conserva su comparación de hash por regla declarada. Se agrega una segunda vía
de excusa: si los hashes difieren, se calcula un diff por archivo sobre los mapas completos y se
concede `READY`/`none`/`continue` sólo cuando hay al menos una ruta cambiada y todas son efímeras.
Sin rutas cambiadas no hay excusa, y un estado sin `fileHashes` no puede atribuir, por lo que sigue
`STALE` minor.

No se toca el writer, no se agrega configuración, no se introduce un hash global filtrado y no se
cambia `ruleVersion`: la regla de `ruleVersion` gobierna la normalización de contenido, mientras que
la pertenencia de rutas es una decisión de lectura aplicada a ambas vistas.

## Validación planificada

- `npm run lint` (comando declarado en `PRODUCT.md`).
- `npm test` (comando declarado; para validaciones acotadas, rutas explícitas a `test/cli.test.js`).
- Format check: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (paquete JavaScript ESM, sin `tsconfig.json`).
- Pins nombrados en `tasks.md` para rutas efímeras, anclaje, estado legacy, hash desincronizado y
  cambios materiales reales.

## Rutas autorizadas

- `src/cli/index.js`
- `test/cli.test.js`
- `aspec/changes/seed-freshness-ephemeral-paths/**`
- `aspec/specs/cli-diagnostics/spec.md` (sólo en archive, vía merge del delta)

## Decisiones

- **memory_key:** seed-freshness-ephemeral-paths-reader-side-filter
  **Elección:** un único predicado anclado `isEphemeralSource(rel)` aplicado simétricamente a las vistas persistida y actual de `sources` dentro de `checkDiscovery`; el writer queda intacto.
  **Descartado:** excluir las rutas en `DEFAULT_IGNORES`/`walk`, filtrar sólo dentro de `computeImpact`, derivar un hash global filtrado, subir a `ruleVersion: 3` o agregar una exclusión configurable.
  **Justificación:** filtrar en el lector mantiene el estado persistido crudo y compatible, aplica la misma regla a altas, bajas y modificaciones, y evita que las rutas efímeras siquiera entren al bucle de comparación.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:seed-freshness-ephemeral-paths
- path:src/cli/index.js

**Estado:** aprobado

- **memory_key:** seed-freshness-ephemeral-diff-attribution
  **Elección:** el desvío de hash se excusa como `READY` sólo cuando el diff por archivo sobre los mapas completos tiene al menos una ruta cambiada y todas son efímeras; un desvío sin rutas cambiadas sigue `STALE`, y un estado sin `fileHashes` sigue `STALE` minor con `materialReasons: []`.
  **Descartado:** tratar cualquier desvío de hash como efímero, o reconstruir un hash global filtrado para comparar.
  **Justificación:** la excusa acotada arregla la monotonía sin ocultar cambios reales ni romper el pin de hash desincronizado, y respeta que sin hashes por archivo no hay atribución posible.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:seed-freshness-ephemeral-paths

**Estado:** aprobado

- **memory_key:** seed-freshness-no-ruleversion-bump
  **Elección:** no se introduce `ruleVersion: 3`; `ruleVersion` sigue gobernando la normalización de contenido y la pertenencia de rutas es un predicado de lectura aplicado a ambas vistas.
  **Descartado:** bumpear `ruleVersion` o cambiar la forma del estado persistido.
  **Justificación:** el writer y el shape del estado no cambian, los estados 0.27.0 siguen por la ruta semántica y un rollback lee los campos crudos de forma consistente.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:seed-freshness-ephemeral-paths
- path:src/cli/index.js

**Estado:** aprobado

- **memory_key:** seed-freshness-ancleto-area-deferred
  **Elección:** el diferimiento de excluir `.ancleto/**` y `.discovery-map.json` queda CERRADO en 0.28.0 con el filtro de lectura de este change; los diferimientos que quedan son las exclusiones adicionales (`docs/`, `aspec/`, `documentation/`, logs de auditoría), la lista de ignore del pack de Repomix y el pin offline de `packDiscovery`.
  **Descartado:** ninguna relevante.
  **Justificación:** la exclusión antes diferida ahora está implementada; mantener la decisión anterior como vigente afirmaría lo contrario del comportamiento del CLI.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:seed-freshness-ephemeral-paths

**Estado:** aprobado
