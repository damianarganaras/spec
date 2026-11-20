# Proposal: Recall de memoria con BM25 primario

## Problem

`searchMemory` ordena hoy `required → anclaje declarado → scope → bm25 ascendente → memory_key`.
El anclaje y el scope se aplican como tiers duros antes del score FTS, de modo que una regla con
refs `spec:`/`change:`/`path:` o un scope más específico se promueve por encima de una regla
semánticamente más relevante para la consulta. El spike midió el costo de esa precedencia:
nDCG@5 0.656 y MRR@5 0.633 con el orden actual, contra 0.843 y 0.923 cuando el score va primero.

## Proposed change

Cambiar únicamente el orden total de `compareRecall` en `src/core/memory/engine.js` a
**`required → bm25 ascendente → anclaje declarado → scope → memory_key`**. BM25 pasa a ser el
criterio primario; el anclaje y el scope quedan como desempates entre nodos con el mismo score.
El resto del contrato de `searchMemory` (preview, `expand`, `keys`, `limit`, `required`
fail-closed y su orden, determinismo, prohibición de `n.rowid`) no cambia.

## Scope

In scope:

- El orden total de `searchMemory` implementado en `compareRecall`.
- El delta `MODIFIED` del requirement de recall en `specs/memory-engine/spec.md`.

Out of scope:

- `buildWorkingContext`, el bloque inyectado y su presupuesto. La re-medición con `required` real
  dio criticalKeys 7/7 (el pin ya existe) y 11/50 reglas por budget; el residual de presupuesto es
  un ítem separado.
- Schema, migraciones, columnas o tablas nuevas.
- Scoring compuesto o ponderado, término de recencia, término de confidence y búsqueda semántica.
- Cambios en `prompt-contracts` ni en el requirement de orden de inyección del working-context.

## Evidence (spike)

- Corpus: 53 rules activas (50 `project` / 3 `feature`); `confidence = 1.0` en 53/53, con varianza
  cero, así que el término de confidence es inerte.
- Test collection: 37 queries (32 temáticas + 5 temporales); pooling top-10 × 5 rankers; 98 pares
  juzgados (graded 0/1/2, juez único LLM).
- nDCG@5: 0.656 (actual) → 0.843 (bm25-first); Recall@5: 0.769 → 0.800; MRR@5: 0.633 → 0.923;
  win/loss/tie 20/0/17.
- Recencia y confidence no aportan: sin-recencia == bm25-only exacto. El +0.19 de nDCG@5 viene de
  dejar de promover scope (y anclaje) por encima de BM25.
- Re-medición del working-context con `required` real: criticalKeys 7/7 y 11/50 reglas por budget
  ⇒ `buildWorkingContext` queda fuera de alcance.
- Límites de la evidencia: N chico (53 nodos), juez único, edades 3–21 d y un solo corpus; es señal
  direccional, no una evaluación con múltiples jueces.
- Artefactos de evidencia: `aspec/changes/memory-recall-bm25-first/spike/` (los completa @general).

## Risks

- Tests que fijan el orden actual fallarán: `test/memory-engine.test.js:4332` ("T1.2 tier: anclaje
  declarado") afirma que el anclaje precede al scope. Debe reescribirse para el nuevo orden.
- El anclaje pierde prioridad absoluta: una regla anclada con peor BM25 puede quedar debajo de una
  no anclada. Es el comportamiento aprobado; el anclaje sigue desempatando.
- Evidencia con N chico y juez único: el cambio es de una línea de comparación y reversible; la
  spec canónica se sincroniza recién al archivar.
- `required` conserva fail-closed y prioridad absoluta, así que las claves críticas no se ven
  afectadas.

## Decisiones

- **memory_key:** recall-bm25-before-scope
  **Elección:** BM25 pasa a ser el criterio primario del orden total de `searchMemory`, antes del anclaje declarado y del scope; el orden queda `required → bm25 → anclaje → scope → memory_key`.
  **Descartado:** mantener `anclaje → scope` antes de `bm25`; scoring compuesto ponderado con recencia o confidence; limitar el cambio a mover sólo el scope y dejar el anclaje como tier previo.
  **Justificación:** el spike sube nDCG@5 de 0.656 a 0.843, MRR@5 de 0.633 a 0.923 y Recall@5 de 0.769 a 0.800 con win/loss/tie 20/0/17; recencia y confidence no aportan (sin-recencia == bm25-only exacto y confidence es constante), así que el único cambio con efecto medido es dejar de promover scope y anclaje sobre el score.
  **Refs:**
- spec:memory-engine#Recall task-aware con orden total, preview expandible y keys requeridas
- change:memory-recall-bm25-first

  **Estado:** aprobado
