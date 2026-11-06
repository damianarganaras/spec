# Proposal: PR-5 — conformidad sin delta y archive no-op

## Problema

Un change sin `specs/` no distingue hoy entre un fix de conformidad (la spec vigente es inequívoca y se
cita el Requirement existente) y un cambio funcional no especificado. `ancleto-workflow` y
`ancleto-continue` tratan la ausencia de `specs/` como un artifact faltante a completar, y
`ancleto-archive` salta el sync en silencio: nada exige citar el Requirement, nada reporta "sin delta"
y nada impide archivar comportamiento no especificado.

## Alcance

**Dentro:**

- **Discriminador conformidad vs delta.** Un change es de conformidad si y sólo si (i) su `proposal.md`
  cita un `spec:<capability>#<requirement>` que resuelve contra `aspec/specs/<capability>/spec.md`
  (capability y título exacto del Requirement existen), y (ii) su `specs/` no contiene ningún delta con
  bloques `ADDED/MODIFIED/REMOVED/RENAMED Requirements`. La ausencia de `specs/` por sí sola NO prueba
  conformidad: sin delta y sin cita resoluble el change no es de conformidad, y se agrega el delta o se
  agrega/corrige la cita con error explícito, nunca con archive silencioso. Si la spec falta o
  contradice el comportamiento esperado, el delta es obligatorio (`spec-required`). El camino de
  conformidad también es alcanzable abriendo un change formal con proposal breve y sin `specs/`.
- **Archive no-op sin delta.** El archive de un change de conformidad no modifica `aspec/specs/**/*.md`,
  informa explícitamente "sin delta" nombrando el Requirement citado y completa el move y la promoción
  normalmente. La garantía se enuncia acotada a esa operación y excluye a los demás escritores y a todas
  las lecturas.
- **Ruteo.** `agents/orchestrator.md` es dueño de la norma de triage; `skills/triage-clarifier/SKILL.md`
  la implementa; `skills/ancleto-workflow/SKILL.md` y `skills/ancleto-continue/SKILL.md` dejan de tratar
  la ausencia de `specs/` como artifact faltante por sí sola.
- **Consumidores y guard.** `@documenter`, `@coder`, `@tester` y `@reviewer` contemplan el change sin
  delta; `test/content-guards.test.js` fija T02/T03 con mutaciones.
- **Contrato canónico:** `aspec/specs/prompt-contracts/spec.md` (2 `ADDED Requirements`) y bookkeeping en
  `aspec/backlog.md`.

**Fuera:**

- Ejecutar o cerrar MEM-01 (runbook de curaduría sobre `.ancleto/memory.db`): requiere aprobación
  explícita y no forma parte de PR-5.
- Editar `.opencode/**` a mano: el mirror de `triage-clarifier` se regenera con `ancleto upgrade`.
- Agregar un subcomando CLI `archive` o cambiar el contrato del Contract Checkpoint / FINAL ARCHIVE
  CHECKPOINT.
- Cambiar la semántica de merge por secciones de `ADDED/MODIFIED/REMOVED/RENAMED` ni la promoción de
  decisiones aprobadas.

**Superficie de aceptación.** El archive es agent-driven: `src/cli/index.js` sólo rutea `specs` a
`specsCheckCommand` y no existe un subcomando `archive`. Por eso la aceptación es a nivel de contrato de
texto (skills/agents y el delta de `prompt-contracts`) más los content guards de
`test/content-guards.test.js`; no se declara un test ejecutable de archive porque esa superficie no
existe.

## Riesgos y aprobación

- **Aceptación no ejecutable.** "El archive sucede" no es verificable por CLI. Mitigación: los guards
  fijan los predicados de texto y cada invariante nuevo se prueba con `assertMutationBreaks`.
- **Garantía ambigua.** Decir "no toca `aspec/specs`" incluiría lecturas y ocultaría escritores
  legítimos. Mitigación: garantía acotada a "Change Archive de un change de conformidad: no modifica
  `aspec/specs/**/*.md`", con la lista de exclusiones explícita.
- **Segundo gate de verificación.** Agregarlo en la skill de archive contradiría "Don't block archiving
  on warnings". Mitigación: la mitad "sin verificación" reusa el ledger cerrado del orquestador.
- **Guard tautológico.** Un assert sin mutación no prueba nada. Mitigación: mutación obligatoria en
  scratch por cada invariante.
- **Divergencia de mirrors.** Editar sólo la fuente y regenerar con `ancleto upgrade`; no tocar
  `.opencode/skills/triage-clarifier/SKILL.md`.

**Aprobación:** este change requiere aprobación explícita del contrato en el Contract Checkpoint antes de
implementar. Esa aprobación no autoriza el archive ni el merge.

- **Aprobación del contrato:** el Contract Checkpoint de este change quedó resuelto por la autorización
  explícita de sesión del usuario (autonomía sobre los checkpoints de contract y archive); no autoriza
  merge ni operaciones destructivas.

## Delta spec

- `specs/prompt-contracts/spec.md` — 2 `ADDED`: "Clasificación de conformidad frente a cambio funcional" y
  "Archive de un change de conformidad sin delta". Ningún Requirement existente se modifica.

## Decisiones

- **memory_key:** archive-conformity-discriminator
  **Elección:** un change es de conformidad si y sólo si (i) su `proposal.md` cita un
  `spec:<capability>#<requirement>` que resuelve contra `aspec/specs/<capability>/spec.md` (capability y
  título exacto existen) y (ii) su `specs/` no contiene bloques `ADDED/MODIFIED/REMOVED/RENAMED
  Requirements`. La ausencia de `specs/` por sí sola no prueba conformidad: sin delta y sin cita
  resoluble es un error explícito, nunca un archive silencioso; si la spec falta o contradice, el delta
  es obligatorio. El camino de conformidad es alcanzable también con un change formal de proposal breve
  y sin `specs/`.
  **Descartado:** tratar la mera ausencia de `specs/` como prueba de conformidad; y exigir siempre un
  delta incluso cuando la spec vigente es inequívoca y el comportamiento ya está especificado.
  **Justificación:** el predicado mecánico prueba la resolubilidad de la cita y la ausencia de bloques
  delta; la relevancia semántica —que el Requirement citado y sus escenarios describan el comportamiento
  que el change restaura— es lo que bloquea una cita no relacionada, y es un juicio de review, no
  demostrable mecánicamente. El segundo criterio evita fabricar deltas que reescriban requisitos canónicos
  sin cambio de contrato (DEC-05).
  **Refs:** `spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional`; `change:p0-pr5-archive-conformity`
  **Estado:** aprobado

- **memory_key:** archive-noop-does-not-write-canonical-specs
  **Elección:** la garantía se enuncia acotada exactamente así: "Change Archive de un change de
  conformidad: no modifica `aspec/specs/**/*.md`." Se usa "no modifica", nunca "no toca", y se excluyen
  explícitamente: `ancleto-sync-specs`; `@documenter` en `Standalone Source-of-Truth Update`;
  `ancleto-bulk-archive`; la rama "Sync now" cuando SÍ hay delta; la rama elegida por el usuario "Archive
  without syncing"; el move a `aspec/changes/archive/`; el commit de archive de `@coder`; la promoción a
  `.ancleto/memory.db` / `working-context`; el chequeo de frescura del seed; y todas las lecturas
  (`ancleto specs check`, resolución fail-closed de `spec:`).
  **Descartado:** una garantía global tipo "el archive no toca `aspec/specs/`", sin nombrar la operación
  ni excluir a los demás escritores del mismo estado.
  **Justificación:** "no toca" incluiría lecturas (el `specs check` y la resolución de refs leen la spec
  canónica) y, sin exclusiones, la garantía se volvería falsa en cuanto el mismo estado pasa por
  `ancleto-sync-specs`, `@documenter` o `ancleto-bulk-archive`. Acotarla a la operación Change Archive de
  un change de conformidad la hace verificable y no oculta escrituras legítimas.
  **Refs:** `spec:prompt-contracts#Archive de un change de conformidad sin delta`; `change:p0-pr5-archive-conformity`
  **Estado:** aprobado

- **memory_key:** conformity-verification-reuses-closed-ledger
  **Elección:** la mitad "sin verificación" del guard se resuelve reusando el contrato vigente: el ledger
  cerrado sigue siendo responsabilidad del orquestador y la skill de archive no agrega un gate propio.
  **Descartado:** agregar un segundo gate de verificación en `skills/ancleto-archive/SKILL.md`.
  **Justificación:** un gate duplicado contradice el contrato vigente —la verificación ya es
  responsabilidad del orquestador antes de delegar review— y choca con "Don't block archiving on
  warnings" de la propia skill de archive. Reusar el ledger cerrado evita dos fuentes de verdad para el
  mismo predicado.
  **Refs:** `spec:prompt-contracts#Archive de un change de conformidad sin delta`; `change:p0-pr5-archive-conformity`
  **Estado:** aprobado

- **memory_key:** triage-routing-single-contract
  **Elección:** `agents/orchestrator.md` es dueño de la norma de ruteo y `skills/triage-clarifier/SKILL.md`
  la implementa; ambos coinciden literalmente en vocabulario de categorías (`direct-test-only`,
  `direct-implementation`, `spec-required`; `clarification-needed` sólo como pre-estado), regla de una
  sola pregunta, "ambigüedad persistente ⇒ `spec-required`" con aviso explícito, "clarificación
  insuficiente = sólo ubicación/ownership/superficie", confirmación explícita del camino directo y la
  nueva cláusula de conformidad. `ancleto-workflow` y `ancleto-continue` distinguen conformidad con cita
  resoluble (no crear delta) de cambio funcional sin delta (crear delta).
  **Descartado:** duplicar la norma en cada skill con redacciones propias; y dejar `ancleto-workflow` /
  `ancleto-continue` como están, ruteando la ausencia de `specs/` a crear un delta.
  **Justificación:** hoy `skills/ancleto-workflow/SKILL.md:50` y `skills/ancleto-continue/SKILL.md:28-31`
  convierten un change de conformidad en la creación de un delta, que es exactamente el comportamiento
  que PR-5 corrige. Una sola norma evita que las superficies deriven.
  **Refs:** `spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional`; `change:p0-pr5-archive-conformity`
  **Estado:** aprobado

- **memory_key:** mem-01-runtime-curation-out-of-scope
  **Elección:** MEM-01 queda fuera de este change; no se ejecuta ni se cierra aquí.
  **Descartado:** ejecutar el runbook de MEM-01 dentro de PR-5 para dejar el P0 completo.
  **Justificación:** MEM-01 es un runbook sobre `.ancleto/memory.db` (gitignored); ejecutarlo es una
  escritura de memoria no cubierta por la promoción de decisiones aprobadas y requiere OK explícito del
  usuario.
  **Refs:** `change:p0-pr5-archive-conformity`
  **Estado:** descartado
