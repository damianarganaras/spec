# Proposal: presupuesto configurable del working-context

## Problem

`buildWorkingContext` corta el bloque `<ProjectMemoryRules>` con un presupuesto fijo de 2.000 tokens
(8.000 caracteres). La re-medición con el path real de render —`renderWorkingContextBlock` con las
`criticalKeys` literales de `.ancletorc` como `required`— muestra que las 7 claves críticas ya entran
(7/7, mismo orden), pero sólo entran **11 de 50** reglas activas de scope `project`; del cohorte más
viejo (25%) no sobrevive ninguna (0/11). El problema no es el pin de claves críticas: es que el
presupuesto recorta reglas activas que el orquestador debería ver.

## Proposed change

Hacer configurable el presupuesto y subir el default:

- Default de **4.000 tokens** (`maxChars = maxTokens × 4` ⇒ 16.000 caracteres).
- Override por proyecto: `.ancletorc` → `memory.maxTokens` (entero positivo).
- Override por entorno: `ANCLETO_WORKING_CONTEXT_TOKENS`.
- Sin tope opt-in: `0` o `"unlimited"` incluye todas las reglas activas y omite el
  `<ContextOverflowWarning>`.
- Precedencia: entorno → `.ancletorc` → default. Valor inválido o ausente, y `.ancletorc` ausente,
  resuelven al default de 4.000; la lectura nunca lanza.
- `required`/`criticalKeys` conservan prioridad y fail-closed; el aviso de overflow para
  presupuestos finitos, el orden determinístico y el literal del aviso no cambian.

## Scope

In scope:

- Resolución del presupuesto en `src/core/memory/working-context.js` (config + entorno + tolerancia).
- Default y modo sin tope en `src/core/memory/engine.js`.
- Tests de presupuesto, tolerancia, override y modo sin tope.
- Deltas `MODIFIED` en `specs/memory-engine/spec.md` y `specs/prompt-contracts/spec.md`.

Out of scope:

- MEM-01 y cualquier reingeniería del motor de memoria.
- JEV/Lucas y cualquier juez semántico o `ancleto judge`, y cualquier criterio de ranking o búsqueda
  semántica.
- Schema, migraciones, columnas o tablas nuevas; el bloque `refs:` no se toca.
- `searchMemory`, el orden de recall y el packing por cantidad de reglas.
- Que `ancleto init` / `ancleto install` escriban `memory.maxTokens`: la clave es opcional y la
  ausencia ya cae al default.
- La deuda declarada de la ventana `[piso del wrapper, piso + aviso mínimo]`.

## Evidence

- Spike archivado (medición, no cambio de producto):
  `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/spike/`.
- `criticalKeys`: **7/7** incluidas y en el orden declarado (`sameOrder: true`).
- Reglas incluidas por presupuesto bajo 2.000 tokens: **11/50** de scope `project`.
- Del cohorte más viejo (25%): **0/11** sobrevive al presupuesto.
- Corpus: 53 rules activas, 50 de scope `project`; evidencia direccional de un solo corpus.

## Risks

- El default duplica el techo inyectado por sesión (8.000 → 16.000 caracteres): más costo de tokens
  para todo proyecto que no configure nada. Es el tradeoff aprobado y queda revertible por proyecto
  o por entorno.
- `"unlimited"` puede desbordar la ventana del modelo si el corpus crece; es opt-in explícito.
- Tests que dependen del default de 2.000 (T7 y T12 de `test/working-context.test.js`) fallarán con
  el default nuevo y deben re-ajustarse; el literal `${omitted} rules omitted.` y el orden del aviso
  se conservan.
- Cambiar configuración o entorno cambia el bloque renderizado: el chequeo de frescura puede reportar
  `desactualizado` hasta el siguiente refresh. Es esperado; con configuración, entorno y BD fijos el
  render sigue siendo determinístico.
- No hay cambio de schema ni dependencias: cero-deps y `node:sqlite` intactos.

## Decisiones

- **memory_key:** working-context-budget-configurable
  **Elección:** presupuesto del working-context configurable, con default de 4.000 tokens, override por `.ancletorc` → `memory.maxTokens` y por `ANCLETO_WORKING_CONTEXT_TOKENS`, y modo sin tope vía `0` o `"unlimited"`.
  **Descartado:** mantener 2.000 tokens fijos; subir el default sin configuración; limitar el bloque por cantidad de reglas en lugar de caracteres; usar un `maxChars` no finito como único mecanismo del modo sin tope.
  **Justificación:** con 2.000 tokens entran 11/50 reglas activas aunque las 7 claves críticas ya están pinneadas (7/7); el recorte omite reglas que el orquestador debería ver. 4.000 tokens lleva el techo a 16.000 caracteres y el costo queda revertible por proyecto o por entorno, sin schema ni dependencias.
  **Refs:**
- spec:memory-engine#Aviso de overflow accionable para el orquestador
- change:memory-working-context-budget

  **Estado:** aprobado
