# Proposal: Documentar y pinear el detector de frescura del seed

## Problem

`ancleto discovery --check` ya calcula el estado del seed y su impacto (`none`, `minor`,
`material`) con reglas empíricas precisas —lista de archivos materiales, `areaOf`,
`computeImpact`, `notes`, `affectedDocs`—, pero esas reglas no están fijadas en la spec canónica de
`cli-diagnostics`. Sin una definición escrita, cualquier edición futura de `MATERIAL_FILE_RES`,
`DEFAULT_IGNORES`, `isMaterialFile`, `areaOf` o `computeImpact` puede pasar inadvertida como un
cambio de comportamiento y romper el significado de los `.discovery-state.json` ya persistidos.

## Proposed change

Agregar un Requirement `ADDED` en la capability `cli-diagnostics` que documente el comportamiento
**vigente** del detector de frescura del seed, con sus razones exactas de materialidad y sus
invariantes, y pinearlo con tests de regresión. Es un change funcional en su clasificación de
artefacto, pero **no cambia el comportamiento del producto**: no se tocan constantes ni funciones
de runtime. El release objetivo es `0.26.1` (PATCH documental/test); el bump de versión no se hace
en este change (FASE 8).

## Scope

In scope:

- Delta `ADDED` en `aspec/changes/spec-seed-freshness-detector/specs/cli-diagnostics/spec.md` con un
  único `## ADDED Requirements`.
- Tests de pin en `test/cli.test.js` que afirmen `state`, `impact`, `recommendedAction`,
  `changedAreas`, `materialReasons`/`notes` y `affectedDocs`, no sólo `impact`.
- Invariante negativa de un cambio no material en un área existente (`minor`) y snapshot de
  read-only.
- Verificación declarativa con `npm run lint` y `npm test`.

Out of scope:

- Cambios en `src/cli/index.js` y en `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `isMaterialFile`,
  `areaOf` o `computeImpact`.
- Cambios en `src/core/specs-merge.js` y en `aspec/specs/**`; la spec canónica se actualiza recién en
  FASE 7 vía `ancleto specs merge`.
- Cambios en `agents/**`, `skills/**`, `commands/**`, `templates/**`, extensión de VS Code u
  `opencode.json`.
- Bump de versión y reconciliación de `docs/PLAN...` o `docs/BACKLOG...` (FASE 8).

Exclusiones explícitas de este release:

- A2c: el producto deja de contar como ítem de este change.
- A3 (#4 exclusión mutua).
- A4 (MEM-05 working-context).
- A5 (CH-06b `--tests`).
- A6 (T27/CH-10/CH-08/MEM-06/CH-00/CH-07/CH-09a–g).
- A7 (housekeeping de memoria, sin OK literal).

## Risks

- Un test que afirme textos exactos queda acoplado al oráculo; es deliberado, porque el objetivo es
  detectar cualquier cambio de regla.
- El fixture existente (`seedFixture`) debe reutilizarse con rutas explícitas para no ampliar el
  alcance de la suite.
- Documentar el comportamiento vigente sin tocar la canónica evita deriva, pero la promoción real
  depende de `ancleto specs merge` en FASE 7.

## Assumptions

- La ficha empírica recibida (reproducida con el CLI real) es el oráculo y se transcribe sin
  generalizar.
- `test/cli.test.js` conserva `seedFixture` y el helper `run` usados por el bloque de
  `discovery --check`.

## Decisiones

- **memory_key:** seed-freshness-detector-documented-in-cli-diagnostics
  **Elección:** Documentar el detector vigente como `ADDED` en la capability `cli-diagnostics`,
  donde ya viven `seedMapPresent` y `affectedDocs`, sin crear una capability `discovery` ni tocar
  runtime.
  **Descartado:** Crear una capability nueva `discovery` o cambiar el código del detector.
  **Justificación:** El contrato de estado y documentos ya pertenece a `cli-diagnostics`; crear otra
  capability duplicaría el dueño del comportamiento y un cambio de runtime excede este release
  documental.
**Refs:**
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
  - path:src/cli/index.js
**Estado:** aprobado

- **memory_key:** seed-freshness-rule-change-requires-minor
  **Elección:** Cambiar `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `areaOf` o `computeImpact` es un
  cambio de comportamiento que requiere un delta `MODIFIED` y un release minor, no un patch
  documental.
  **Descartado:** Tratar una edición de esas reglas como mantenimiento sin efecto observable.
  **Justificación:** Los `.discovery-state.json` persistidos guardan hashes sin versión de reglas,
  por lo que una edición cambia el significado de los estados ya guardados.
**Refs:**
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
  - path:src/cli/index.js
**Estado:** aprobado
