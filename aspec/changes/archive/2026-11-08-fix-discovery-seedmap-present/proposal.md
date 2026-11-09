# Proposal: fix-discovery-seedmap-present

## Contexto

`ancleto discovery --check` (handler `checkDiscovery` en `src/cli/index.js`) reporta
`seedMapPresent:false` aunque exista un `seed-map.json` válido. El campo se inicializa en `false`
(`src/cli/index.js:2344`) y sólo se reasigna dentro del branch `STALE`
(`src/cli/index.js:2380-2381`). En el branch `READY` (`src/cli/index.js:2370-2373`) nunca se
reasigna, así que el estado al día siempre publica `false`.

Defecto reproducido empíricamente: `state:READY` + `seed-map.json` válido →
`seedMapPresent:false`. La suite actual sólo cubre el camino `STALE`
(`test/cli.test.js:6569-6605`), y el quirk ya está documentado como preexistente en
`docs/technical-discovery/unknowns.md:167` y en `aspec/backlog.md:178`.

## Propuesta

Hoistear la lectura de `seed-map.json` (`readSeedMap`) antes de la bifurcación de estados y calcular
`seedMapPresent = seedMap !== null` una única vez por ejecución, con independencia de `READY`,
`STALE`, `PARTIAL` o `MISSING`.

`affectedDocs` conserva su semántica actual: se calcula sólo en `STALE` como la intersección de
`seedMap` con `changedAreas`; en `READY`, `PARTIAL` y `MISSING` queda `[]`.

El cambio no agrega campos a la salida, no modifica mensajes, no altera `schemaVersion: 2`, no
cambia exit codes y sigue siendo read-only (no escribe en el directorio de salida).

## Contrato de comportamiento

- `READY` + seed-map válido → `state:READY`, `impact:none`, `recommendedAction:continue`,
  `seedMapPresent:true`, `affectedDocs:[]`.
- `READY` sin seed-map → `seedMapPresent:false`, `affectedDocs:[]`.
- `STALE` (`minor` o `material`) + seed-map válido → `seedMapPresent:true` y `affectedDocs` igual
  a la intersección actual (sin cambios).
- `STALE` + seed-map ausente o malformado → `seedMapPresent:false`, `affectedDocs:[]` (sin cambios).
- Seed-map malformado no lanza (`readSeedMap` ya hace catch) → `seedMapPresent:false`, exit 0.
- Invariantes preservadas: `schemaVersion:2`, salida JSON, read-only, exit codes y semántica de
  `READY`/`STALE`/`MISSING`/`PARTIAL`.
- `seedMapPresent` refleja la presencia real del archivo en cualquier estado; `affectedDocs` sigue
  siendo STALE-only.

## Alcance

In scope:

- `checkDiscovery` en `src/cli/index.js`: punto único de cálculo de `seedMapPresent`.
- Tests en `test/cli.test.js` para los cuatro cruces estado × seed-map del contrato.
- Delta de `cli-diagnostics` con el requirement ADDED.

Out of scope:

- A2: detector de frescura (#18).
- A3: exclusión mutua (#4).
- A4: presupuesto de working-context (MEM-05).
- A5: flag `--tests` (CH-06b).
- A6: T27, CH-10, CH-08, CH-00, CH-07 y CH-09.
- A7: housekeeping de memoria.
- `--help` y dispatch de subcomandos.
- Tiers y modelos.
- Memoria, archive y merge de specs.
- `agents/**`, `skills/**`, `commands/**`, `templates/**`.
- Bump de versión (release 0.26.0), regeneración del seed y actualización del backlog: fases
  posteriores del release, no de este change.

## Riesgos

- `readSeedMap` pasa a ejecutarse en todos los estados: agrega una lectura de `seed-map.json` en
  `READY`/`PARTIAL`/`MISSING`. Mitigación: `readSeedMap` ya devuelve `null` ante ausencia o error de
  parseo; el costo es una lectura acotada y sin efectos.
- Consumidores que dependían del `false` en `READY` documentado como quirk: el cambio lo corrige de
  forma deliberada. Mitigación: el delta fija el contrato y la release objetivo es minor.
- Riesgo de ampliar `affectedDocs` a otros estados al hoistear la lectura: mitigación explícita en
  tasks y tests — la intersección se mantiene sólo en el branch `STALE`.
- Seed-map malformado: no debe romper el comando. Mitigación: el catch existente de `readSeedMap`
  y un escenario que verifica exit 0 y JSON válido.

## Decisiones

- **memory_key:** discovery-seedmap-present-state-independent
  **Elección:** Calcular `seedMapPresent` una sola vez con `readSeedMap`, con independencia del
  estado (`READY`, `STALE`, `PARTIAL`, `MISSING`); `affectedDocs` sigue calculándose sólo en
  `STALE` como intersección de `seedMap` con `changedAreas`.
  **Descartado:** Mantener la asignación dentro del branch `STALE` y duplicarla en cada rama que
  necesite el dato.
  **Justificación:** Un único punto de cálculo elimina la divergencia entre estados y garantiza que
  `seedMapPresent` refleje el archivo real sin duplicar lecturas ni lógica, preservando la semántica
  STALE-only de `affectedDocs`.
**Refs:**
  - spec:cli-diagnostics#discovery --check reporta la presencia del seed-map en cualquier estado
  - change:fix-discovery-seedmap-present
  - path:src/cli/index.js
  - path:test/cli.test.js
**Estado:** aprobado

- **memory_key:** discovery-freshness-detector-a2
  **Elección:** Descartar el detector de frescura (#18) en este change.
  **Descartado:** Implementar A2 junto con la corrección de `seedMapPresent`.
  **Justificación:** No hay defecto observado que lo justifique, invalidaría los estados de frescura
  persistidos en `.discovery-state.json` y no existe spec canónica del detector; incluirlo ampliaría
  el alcance sin evidencia y rompería la compatibilidad del estado persistido.
**Refs:**
  - change:fix-discovery-seedmap-present
  - path:src/cli/index.js
**Estado:** descartado

- **memory_key:** discovery-mutual-exclusion-a3
  **Elección:** Descartar la exclusión mutua entre estados (#4) en este change.
  **Descartado:** Agregar exclusión mutua entre `READY`, `STALE`, `PARTIAL` y `MISSING`.
  **Justificación:** La spec canónica exige paralelización y el cambio sería prosa-only, sin
  comportamiento verificable; no corresponde al defecto de reporte.
**Refs:**
  - change:fix-discovery-seedmap-present
  - path:src/cli/index.js
**Estado:** descartado

- **memory_key:** discovery-working-context-budget-a4
  **Elección:** Descartar el presupuesto de working-context (MEM-05) en este change.
  **Descartado:** Introducir el presupuesto de working-context junto con el fix.
  **Justificación:** El presupuesto está congelado en la capa `memory-engine` y depende de MEM-01 y
  CH-09a, ajenos a `checkDiscovery`; tocarlo aquí mezcla capas y adelanta trabajo no aprobado.
**Refs:**
  - change:fix-discovery-seedmap-present
  - path:src/cli/index.js
**Estado:** descartado

- **memory_key:** discovery-tests-flag-a5
  **Elección:** Descartar el flag `--tests` (CH-06b) en este change.
  **Descartado:** Agregar un flag `--tests` al comando `discovery`.
  **Justificación:** `--tests` no existe y su diseño tiene incompletitud estructural —no hay contrato
  de qué tests incluir ni cómo acotarlos—; implementarlo excede el defecto de `seedMapPresent`.
**Refs:**
  - change:fix-discovery-seedmap-present
  - path:src/cli/index.js
**Estado:** descartado

- **memory_key:** discovery-offline-tests-a6
  **Elección:** Descartar T27, CH-10, CH-08, CH-00, CH-07 y CH-09 en este change.
  **Descartado:** Incluir esos ítems junto con la corrección.
  **Justificación:** No hay evidencia nueva y no son offline-testeables, por lo que introducirían
  trabajo no verificable en la suite declarada.
**Refs:**
  - change:fix-discovery-seedmap-present
**Estado:** descartado

- **memory_key:** discovery-memory-housekeeping-a7
  **Elección:** Descartar el housekeeping de memoria en este change.
  **Descartado:** Ejecutar housekeeping de memoria junto con el fix.
  **Justificación:** Requiere OK literal del usuario, que no fue otorgado, y colisiona con la regla
  activa `tier-minimo-*`; la memoria no es una superficie de este fix.
**Refs:**
  - change:fix-discovery-seedmap-present
**Estado:** descartado
