# Proposal: Clarificaciones de spec — slug de `change:` sin fecha y hogar de la severidad

## Problem

**MEM-07 (backlog §5): la gramática de `change:` no dice que el slug va sin fecha.** El Requirement
`Refs normalizadas materializadas en el contenido del nodo` de `aspec/specs/memory-engine/spec.md`
define la forma `change:<stable-change-slug>` pero no aclara que el slug se escribe **sin** el
prefijo `YYYY-MM-DD-`; la fecha la aporta el nombre del directorio `aspec/changes/archive/`. El
resolver ya antepone la fecha al buscar el archive (`src/core/memory/engine.js`, `resolveChangeRef`,
líneas 262-291, regex `^\d{4}-\d{2}-\d{2}-<slug>$`), de modo que una ref con el prefijo de fecha
falla con `referencia un change inexistente` (`engine.js:280`). No cambia el contrato: falta la
aclaración en la fuente normativa. La trampa costó un ciclo completo de review en el backfill: 5/5
escrituras rechazadas.

**CH-11 (backlog §5): la severidad de `cleto-review` no vive en su hogar normativo.** La regla de
asignación de severidad está sólo en `skills/ancleto-review/SKILL.md:36-42,61-63,70`, mientras
`aspec/specs/code-review/spec.md:59-66` enumera severidades y el cap de 5 por severidad, pero no
define cuándo un hallazgo es `CRITICAL`, `WARNING` o `SUGGESTION`. La spec no cubre el comportamiento
que la skill implementa.

## Proposed change

Dos deltas de spec, uno por ítem:

- **`memory-engine`** — `## MODIFIED Requirements` sobre
  `Refs normalizadas materializadas en el contenido del nodo`, con el cuerpo completo reescrito:
  `change:<stable-change-slug>` se escribe con el slug **tal como se nombra el change**, sin
  `YYYY-MM-DD-`; el prefijo lo aporta el nombre del directorio archivado y NO SHALL incluirse en la
  ref. Se agregan los scenarios que fijan el slug canónico resolviendo y el slug con fecha
  reportado como inexistente.
- **`code-review`** — `## MODIFIED Requirements` sobre
  `Reporte estructurado sin modificación de código`, con el cuerpo completo reescrito e incorporando
  la regla de severidad: `CRITICAL` sólo para duplicación **literal** o dead code **probado** dentro
  del scope; redundancia **inferida** o ubicación **discutible** → `WARNING` o `SUGGESTION`; ante
  duda se degrada.

`agents/spec-writer.md` (`## Decisions Section`) re-enuncia hoy el formato de refs en vez de
referenciarlo. Su ajuste lo hace `@coder` en paralelo y queda como tarea de este change: la **fuente
única** del formato de refs es el Requirement `Refs normalizadas materializadas en el contenido del
nodo` de `memory-engine`, y `agents/spec-writer.md` debe apuntar a él en lugar de repetirlo. Este
change no edita `agents/**` más allá de la sección `## Decisions Section` de `agents/spec-writer.md`,
y no edita los mirrors (`.opencode/**`, que sólo regenera `ancleto upgrade`).

## Scope

In scope:

- Delta `memory-engine` sobre `Refs normalizadas materializadas en el contenido del nodo`.
- Delta `code-review` sobre `Reporte estructurado sin modificación de código`.
- El ajuste de `agents/spec-writer.md` → `## Decisions Section`, ejecutado por `@coder`, para que
  referencie el Requirement de refs como fuente única.

Out of scope:

- Cambiar `resolveChangeRef`, el parser de refs o cualquier comportamiento del resolver.
- Cambiar el comportamiento de `cleto-review` o de `skills/ancleto-review/SKILL.md`.
- Backfill masivo de nodos de memoria existentes.
- Cualquier cambio bajo `src/`, `test/` o `skills/**`.

## Risks

- **Duplicación de la regla de severidad** entre la spec y la skill: mitigación — la spec pasa a ser
  el hogar normativo; si la duplicación se vuelve material, un change posterior hace que la skill
  apunte a la spec.
- **El ajuste de `agents/spec-writer.md` rompe un content guard** (`test/content-guards.test.js`
  valida el contenido de `## Decisions Section`): lo valida `@tester` en la fase de validación.
- **La reescritura del cuerpo completo de cada Requirement en el delta pierde cláusulas**: el merge
  sólo preserva lo que el delta no menciona, así que ambos deltas reproducen el cuerpo vigente y
  agregan únicamente la aclaración; se revisa en la fase de review.

## Decisiones

- **memory_key:** `severidad-con-hogar-en-la-spec`
  **Elección:** La regla de asignación de severidad de `cleto-review` vive en
  `aspec/specs/code-review/spec.md` como comportamiento normativo; la skill queda como
  implementación que la consume.
  **Descartado:** Dejar la regla únicamente en `skills/ancleto-review/SKILL.md` y limitar la spec a
  enumerar severidades y cap.
  **Justificación:** La spec es la fuente normativa del flujo aspec y hoy no cubre la asignación
  (`aspec/specs/code-review/spec.md:59-66`), mientras la skill la define en
  `skills/ancleto-review/SKILL.md:36-42,61-63,70`; sin la regla en la spec no hay cobertura
  verificable y cualquier cambio de la skill queda sin delta.
  **Refs:** `change:clarificaciones-spec-severidad-y-refs`; `path:aspec/specs/code-review/spec.md`;
  `path:skills/ancleto-review/SKILL.md`;
  `spec:code-review#reporte estructurado sin modificación de código`
  **Estado:** propuesto
