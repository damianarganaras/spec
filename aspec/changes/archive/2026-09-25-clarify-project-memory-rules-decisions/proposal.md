# Proposal: Aclarar qué nodos entran en `<ProjectMemoryRules>` (rules vs decisions)

## Problema

El bloque inyectado `<ProjectMemoryRules>` solo contiene nodos `rule`. `buildWorkingContext`
filtra `WHERE type = 'rule'` (`src/core/memory/engine.js:94`), así que los nodos `decision` con
scope `project` nunca entran al bloque.

En cambio, parte de la documentación de producto afirma que el scope `project` entra al bloque,
sin distinguir tipo:

- `README.md:336`: "Cada entrada tiene un `scope`: `project` (default, entra en
  `<ProjectMemoryRules>`), `feature` o `task`."
- `src/core/memory/tools.js:8` (descripción del campo `scope` en el schema de las tools MCP):
  "project (default, entra en <ProjectMemoryRules>)".

Esto produce una incoherencia entre el contrato documentado y el comportamiento real.

## Contradicción con el recall del orquestador (importante)

El contexto recibido afirma que este caso no tiene antecedente registrado y recomienda
**(a) fix de código** (inyectar decisions). La evidencia del repo lo contradice: **la exclusión
de decisions es diseño intencional, documentado y testeado**:

- `DESIGN-memory-engine-v0.2.0.md:59-65` — sección "Ciclo de vida del contexto (Rules vs
  Decisions)": rules proactivas dentro de `<ProjectMemoryRules>`; decisions reactivas vía
  `searchMemory`.
- `docs/technical-discovery/decisions.md:24-27` — regla estructural #4 repite el mismo contrato.
- `docs/technical-discovery/units/memory-engine.md:55` — "Rules = proactivas (system prompt,
  datos no confiables); decisions = reactivas (`searchMemory`)."
- `test/memory-engine.test.js:310-314` — test explícito `'no mezcla decisiones dentro del
  working context'` que assertea la exclusión.
- `test/memory-engine.test.js:120-133` — assertea `doesNotMatch /decisión de prueba/` en el
  bloque.
- `agents/memory-keeper.md:82` — "**Rules** with scope `project` flow into the proactive
  `<ProjectMemoryRules>` block" (dice *Rules*, no *entries*).

Por lo tanto la lectura consistente con el repositorio es: **el defecto está en la
documentación** (`README.md:336` y la descripción del schema en `src/core/memory/tools.js:8`),
no en el código. Este proposal **invierte la recomendación del orquestador**: recomienda
(b) corregir la doc/schema, y pedir confirmación en el checkpoint.

## Cambio propuesto

Alinear el contrato documentado con el comportamiento intencional y vigente: solo los nodos
`rule` activos con scope `project` se inyectan proactivamente en `<ProjectMemoryRules>`; los
`decision` permanecen reactivos vía `searchMemory`. Se corrige el texto impreciso del README y
de la descripción del schema `scope`.

## Decisión abierta (eje)

- **(a) Fix de código**: inyectar también los `decision` activos de scope `project`.
- **(b) Fix de doc**: excluir `decision` (comportamiento actual) y corregir `README.md:336` y
  `tools.js:8`.

Recomendación de este proposal: **(b)**, por la evidencia de diseño, seed y tests. El usuario
puede invertirla en el checkpoint; si elige (a), esta spec debe reescribirse (los requirements
de abajo describen (b)).

## Alcance

In scope:

- Contrato observable de `<ProjectMemoryRules>`: incluye solo `rule` activas de scope `project`
  (con el filtrado active/superseded y el orden existentes); las `decision` no se inyectan.
- Coherencia de la doc/schema que hoy afirma lo contrario (`README.md:336`,
  `src/core/memory/tools.js:8`).

Out of scope (no-goals):

- No cambia el tratamiento de nodos de scope `feature` o `task`.
- No inyecta nodos de scope distinto de `project` en el contexto de scope `project`.
- No cambia la recuperación reactiva de decisions (`searchMemory`).
- No modifica el mecanismo de frescura del archivo: eso pertenece al change hermano
  `working-context-refresh-on-memory-write`.

## Riesgos

- Si el producto realmente quiere (a), este change queda obsoleto y hay que rehacerlo: mitigar
  confirmando la decisión en el checkpoint antes de implementar.
- La palabra "entradas" del README puede haberse escrito a propósito de forma genérica; corregir
  el texto cambia documentación de producto visible para usuarios.
- Editar `src/core/memory/tools.js` toca la descripción de las 3 tools MCP (superficie de
  producto instalable): el cambio debe limitarse al string de descripción, sin alterar schemas
  ni comportamiento.

## Rationale de la separación (dos changes)

Distinto layer (read/render path vs write path del hermano), root cause (contrato incoherente vs
archivo no refrescado), acceptance (coherencia doc/código vs frescura observable) y eje de
riesgo. Aprobables, verificables y reversibles por separado; no duplican guardas. Comparten la
capability `memory-engine` como cambios hermanos.

## Nota sobre el contexto de origen

Contexto producido con un seed técnico validado del repo (v0.6.37); se confirmó el
comportamiento real en código, tests y doc con `file:line` antes de escribir esta spec. Se
reportó como contradicción, no se aplanó.
