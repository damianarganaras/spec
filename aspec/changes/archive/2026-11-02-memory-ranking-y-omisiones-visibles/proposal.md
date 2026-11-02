# Proposal: Ranking de inyección y omisiones visibles en `<ProjectMemoryRules>`

## Problemática

`buildWorkingContext` (`src/core/memory/engine.js:526-557`) selecciona las `rule` activas del scope
y su jerarquía, y las ordena por scope, `created_at DESC` y `rowid DESC`. El orden no distingue una
regla que declara provenance —un bloque `refs:` con `spec:`, `change:` o `path:`— de una que no lo
declara, así que una regla anclada y verificable puede quedar fuera frente a una regla histórica sin
anclaje.

El corte compara el bloque acumulado contra `maxChars = maxTokens × CHARS_PER_TOKEN` **sin** contar
la topología ni el `<ContextOverflowWarning>`, que se agrega después. El bloque entregado excede el
presupuesto declarado (~2.026 tokens con el default de 2.000). Además, el aviso sólo informa cuántas
reglas se omitieron: el orquestador no sabe **cuáles** quedaron afuera y no puede decidir un Recall
dirigido.

Diagnóstico medido sobre 135 nodos (read-only):

- 107 activos: 29 `rule` y 78 `decision`.
- Con 29 rules de scope `project` entran 11 y se omiten 18.
- 0 duplicados exactos; 0 near-dups con Jaccard ≥ 0,60; 1 par en 0,45–0,60.
- 72/107 activos sin refs (24/29 rules), todos anteriores al contrato de refs (2026-09-25 → 10-29).
- 0 refs no resolubles.

La consecuencia es doble: el orden decide la retención sin un criterio de calidad verificable, y el
aviso no permite accionar sobre lo omitido.

## Proposed change

Tres cambios acotados al render, sin tabla, columna, migración, tool MCP ni comando CLI nuevo:

1. **Orden determinístico con anclaje.** Dentro del scope ya filtrado: (a) primero las reglas que
   declaran al menos una ref `spec:`, `change:` o `path:` en su bloque `refs:`; (b) luego
   `created_at DESC`; (c) luego `memory_key` lexicográfico ascendente. El anclaje se evalúa **sólo
   parseando** el `content` con el parser existente, sin resolver refs ni tocar el filesystem.
2. **Presupuesto correcto.** El bloque completo —wrapper, etiqueta de no confiables, reglas y
   `<ContextOverflowWarning>`— respeta `maxTokens × CHARS_PER_TOKEN`. Antes de cortar reglas se
   reserva para el aviso `min(1.500, 15% de maxChars)`, acotado a `maxChars`.
3. **Omisiones visibles.** Cuando hay reglas omitidas, el aviso nombra sus `memory_key` en el mismo
   orden de inyección, con tope de 40 claves y sufijo `+N` para las no listadas. Conserva el conteo,
   el registro por consola y la indicación de delegar un Recall a `@memory-keeper`; no menciona
   `searchMemory`.

## Scope

In scope:

- `buildWorkingContext`: criterio de orden por anclaje declarado y desempates determinísticos.
- `buildWorkingContext`: reserva del aviso y cómputo del presupuesto sobre el bloque completo.
- `<ContextOverflowWarning>`: manifiesto de `memory_key` omitidas, tope y `+N`.
- Tests de orden, presupuesto, manifiesto, regresiones y determinismo en `test/memory-engine.test.js`.
- Ajuste de las pruebas de truncamiento existentes cuyos conteos exactos dependen de la aritmética
  de presupuesto anterior, preservando sus invariantes (reglas enteras, XML válido, conteo correcto).
- Verificación de que el bloque/frescura de `test/working-context.test.js` sigue coherente.

Out of scope (no-goals explícitos):

- Backfill automático de refs en los 72 nodos sin provenance: se cura en una pasada separada con
  aprobación por lote, fuera de este change.
- Consolidación de duplicados o near-dups: no hay duplicados medidos que la justifiquen.
- `realpath` o containment de symlinks para `path:`.
- MEM-05 (orden de recall task-aware en `searchMemory`).
- Cambios a `memory doctor`, `inspectRefs`, `resolveNodeRefs` o al conjunto/orden de sus cinco
  checks.
- Tabla, columna, migración de schema, tool MCP nueva o comando CLI nuevo.
- Cambios a `.opencode/**` o `agents/**`.

Paths autorizados del change:

- `src/core/memory/engine.js`
- `test/memory-engine.test.js`
- `test/working-context.test.js`
- `aspec/changes/memory-ranking-y-omisiones-visibles/**`

## Assumptions

- El camino de escritura ya valida las refs al escribir; una ref declarada resolvía en ese momento.
  Por eso el render puede confiar en la declaración sin volver a resolverla.
- El parser `parseRefsBlock` alcanza para decidir anclaje: un bloque inválido o múltiple no aporta
  anclaje, que es el comportamiento conservador esperado.
- `CHARS_PER_TOKEN = 4` y `MAX_TOKENS = 2000` se conservan; sólo cambia qué se cuenta dentro del
  presupuesto.
- El orden de scope vigente (`task` → `feature` → `project`) se mantiene como criterio primario.
- Existe un piso fijo de caracteres (wrapper, etiqueta de no confiables, cierre y aviso mínimo) por
  debajo del cual ningún render puede respetar `maxChars`. El contrato de presupuesto aplica a
  presupuestos que cubren ese piso.

## Risks

- **La reserva del aviso reduce las reglas que entran en presupuestos chicos.** Mitigación: los
  tests de truncamiento se actualizan para afirmar invariantes (reglas enteras, XML cerrado, conteo
  correcto, presupuesto respetado) en lugar de conteos accidentales de la aritmética anterior.
- **El manifiesto puede desbordar la reserva si las claves son largas.** Mitigación: el tope de 40
  claves se combina con la reserva de caracteres; si la reserva corta primero, se listan menos
  claves y `+N` cuenta todas las no listadas.
- **El anclaje por parseo puede preferir una regla cuya ref ya no resuelve.** Mitigación: se acepta
  como trade-off explícito —el camino de escritura validó al crear el nodo y el render no suma
  I/O—; la cura de provenance queda en la pasada separada.
- **El texto del aviso es consumido por aserciones existentes.** Mitigación: se preservan el prefijo
  `Context truncated due to size limits. <n> rules omitted`, la mención de `@memory-keeper` y la
  ausencia de `searchMemory`; el manifiesto se agrega como texto adicional.
- **El desempate lexicográfico reordena salidas previas.** Mitigación: el orden es total y
  determinístico, y queda fijado por tests de dos corridas idénticas.
- **Presupuestos degenerados (`maxTokens` menor que el piso fijo) no pueden cumplir el límite.**
  Mitigación: el contrato declara el piso; por debajo de él se conserva un bloque bien formado y no
  se incluye ninguna regla.

## Decisiones

- **memory_key:** `memory-inyeccion-orden-anclaje`
  **Elección:** Dentro del scope ya filtrado, el orden es (a) reglas con al menos una ref `spec:`,
  `change:` o `path:` declarada en su bloque `refs:`, (b) `created_at DESC`, (c) `memory_key`
  lexicográfico ascendente. El anclaje se decide sólo parseando el bloque, sin resolver refs.
  **Descartado:** Mantener `created_at DESC, rowid DESC` y confiar en la recencia, o resolver cada
  ref contra el filesystem para ordenar por verificabilidad real.
  **Justificación:** El anclaje declarado es un proxy barato y determinístico de provenance
  verificable, y el camino de escritura ya garantiza que una ref declarada resolvía al escribirse.
  Resolver refs en el render agregaría I/O y latencia al camino de contexto sin cambiar la decisión
  de retención. El desempate por `memory_key` cierra el orden total que `rowid` no garantiza entre
  bases.
  **Refs:** `change:memory-ranking-y-omisiones-visibles`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Alcance del bloque de reglas proactivas`
  **Estado:** aprobado

- **memory_key:** `memory-bloque-presupuesto-incluye-warning`
  **Elección:** El bloque completo `<ProjectMemoryRules>` —wrapper, etiqueta, reglas y aviso— SHALL
  respetar `maxTokens × CHARS_PER_TOKEN`. Antes de cortar reglas se reserva para el aviso
  `min(1.500, 15% de maxChars)`, acotado a `maxChars`.
  **Descartado:** Conservar el corte actual sobre el bloque parcial y agregar el aviso después, o
  descontar sólo la longitud del texto fijo del aviso sin reserva proporcional.
  **Justificación:** El presupuesto declarado es sobre el bloque entregado; contar sólo una parte
  produce el desborde medido (~2.026 tokens sobre 2.000). Una reserva proporcional con techo evita
  que el aviso crezca sin límite y mantiene el presupuesto verificable con una sola aserción.
  **Refs:** `change:memory-ranking-y-omisiones-visibles`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Aviso de overflow accionable para el orquestador`
  **Estado:** aprobado

- **memory_key:** `memory-omisiones-nombradas`
  **Elección:** Cuando hay reglas omitidas, el `<ContextOverflowWarning>` nombra sus `memory_key` en
  el orden de inyección, hasta 40 claves, con sufijo `+N` para las no listadas. Conserva el conteo,
  el log por consola y la delegación de Recall a `@memory-keeper`, y no menciona `searchMemory`.
  **Descartado:** Dejar sólo el número de omitidas, o listar todas las claves sin tope.
  **Justificación:** El número no permite decidir un Recall dirigido; el nombre sí. Un tope con `+N`
  mantiene el aviso acotado y compatible con la reserva de caracteres, sin reintroducir el desborde
  que este change corrige.
  **Refs:** `change:memory-ranking-y-omisiones-visibles`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Aviso de overflow accionable para el orquestador`
  **Estado:** aprobado

- **memory_key:** `memory-provenance-curacion-separada`
  **Elección:** Los 72 nodos activos sin refs se curan en una pasada separada, por runbook y con
  aprobación por lote. El render no backfillea, no revalida y no reescribe nodos.
  **Descartado:** Backfill automático por heurística en este change, o revalidar refs en el render.
  **Justificación:** 24/29 rules y 72/107 activos son anteriores al contrato de refs; una heurística
  inventaría provenance no verificable. La cura por lote preserva la trazabilidad y no mezcla
  migración de datos con cambio de render. `memory doctor`, `inspectRefs` y el quinto check quedan
  intactos porque hay tests que fijan los cinco checks y su orden.
  **Refs:** `change:memory-ranking-y-omisiones-visibles`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Validación fail-closed de refs en el camino único de escritura`
  **Estado:** aprobado

- **memory_key:** `memory-consolidacion-guard-futuro`
  **Elección:** No se consolida ni deduplica en este change. La consolidación queda diferida y sólo
  se justificaría si una medición futura muestra duplicados o near-dups accionables.
  **Descartado:** Agregar ahora un guard o una heurística de consolidación durante el render.
  **Justificación:** La medición da 0 duplicados exactos, 0 near-dups con Jaccard ≥ 0,60 y un solo
  par en 0,45–0,60: no hay material que consolidar. Un guard preventivo sin señal medible agrega
  complejidad y riesgo de perder contenido sin beneficio verificable.
  **Refs:** `change:memory-ranking-y-omisiones-visibles`; `path:src/core/memory/engine.js`
  **Estado:** aprobado
