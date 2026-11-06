# Delta: prompt-contracts

## ADDED Requirements

### Requirement: Clasificación de conformidad frente a cambio funcional

Un change SHALL clasificarse como **change de conformidad** si y sólo si se cumplen las dos condiciones
siguientes: (i) su `proposal.md` cita un `spec:<capability>#<requirement>` que resuelve contra
`aspec/specs/<capability>/spec.md`, es decir que la capability y el título exacto del Requirement existen;
y (ii) su `specs/` no contiene ningún delta con bloques `ADDED Requirements`, `MODIFIED Requirements`,
`REMOVED Requirements` ni `RENAMED Requirements`.

La ausencia de `specs/` por sí sola NO SHALL probar conformidad. Si un change no tiene delta y no tiene
una cita resoluble, NO SHALL clasificarse como change de conformidad: SHALL agregarse el delta o
agregarse/corregirse la cita, y la situación SHALL reportarse como error explícito, nunca resolverse con
un archive silencioso.

Cuando la spec vigente falta o contradice el comportamiento esperado, el change SHALL tratarse como
cambio funcional y SHALL requerir un delta aprobado (`spec-required`); NO SHALL presentarse como
conformidad. El camino de conformidad SHALL ser alcanzable también cuando se abre un change formal, con
`proposal.md` breve y sin `specs/`.

La norma de ruteo SHALL tener un solo dueño: `agents/orchestrator.md`. `skills/triage-clarifier/SKILL.md`
SHALL implementarla y SHALL coincidir literalmente con ella en el vocabulario de categorías
(`direct-test-only`, `direct-implementation`, `spec-required`; `clarification-needed` sólo como
pre-estado), la regla de una sola pregunta, el escalado "ambigüedad persistente ⇒ `spec-required`" con
aviso explícito al usuario, la regla de clarificación insuficiente (sólo ubicación, ownership o
superficie) y la confirmación explícita del camino directo. `skills/ancleto-workflow/SKILL.md` y
`skills/ancleto-continue/SKILL.md` NO SHALL tratar la ausencia de `specs/` como artifact faltante por sí
sola y SHALL distinguir un change de conformidad con cita resoluble (no crear delta) de un change
funcional sin delta (crear delta).

#### Scenario: Conformidad con cita resoluble y sin delta

- **WHEN** un change no tiene `specs/` y su `proposal.md` cita un `spec:<capability>#<requirement>` que
  resuelve contra la spec canónica
- **THEN** se clasifica como change de conformidad
- **AND** no se exige crear un delta
- **AND** la cita se conserva como evidencia del comportamiento especificado

#### Scenario: Ausencia de specs no prueba conformidad

- **WHEN** un change no tiene `specs/` y su `proposal.md` no cita ningún Requirement que resuelva
- **THEN** no se clasifica como change de conformidad
- **AND** se exige agregar el delta o agregar/corregir la cita
- **AND** la situación se reporta como error explícito, nunca como archive silencioso

#### Scenario: Cambio funcional sin delta

- **WHEN** el comportamiento esperado falta en la spec vigente o la contradice y el change no tiene delta
- **THEN** se clasifica como cambio funcional
- **AND** se exige un delta aprobado (`spec-required`)
- **AND** no se acepta como conformidad

#### Scenario: Ruteo consistente entre orchestrator, triage y workflow

- **WHEN** un change sin `specs/` entra al ruteo
- **THEN** `agents/orchestrator.md` y `skills/triage-clarifier/SKILL.md` coinciden literalmente en la
  categoría y en los predicados de clarificación
- **AND** `skills/ancleto-workflow/SKILL.md` y `skills/ancleto-continue/SKILL.md` no tratan la sola
  ausencia de `specs/` como artifact faltante

### Requirement: Archive de un change de conformidad sin delta

Al archivar un change de conformidad, el archive SHALL informar explícitamente "sin delta", nombrando el
`spec:<capability>#<requirement>` citado, y SHALL completar normalmente el move del directorio y la
promoción de decisiones aprobadas.

Antes de archivar, la cita SHALL validarse fail-closed: una cita que no resuelve NO SHALL aceptarse como
evidencia de conformidad y el archive SHALL rechazarse con un reporte explícito, sin escribir en
`aspec/specs/**/*.md`.

La resolubilidad de la cita NO SHALL ser suficiente por sí sola para probar conformidad: la cita SHALL ser
además **relevante**, es decir que el Requirement citado y sus escenarios SHALL describir el comportamiento
que el change restaura. El agente de archive SHALL rechazar el archive, o SHALL detenerse y preguntar al
usuario, cuando el Requirement citado no describe el comportamiento implementado. `@reviewer` SHALL reportar
la falta de relevancia como hallazgo `CRITICAL`. La relevancia es un juicio semántico y NO SHALL
presentarse como mecánicamente demostrable: la compuerta mecánica prueba la resolubilidad de la cita y la
ausencia de bloques delta, no la relevancia.

La garantía de no-escritura SHALL enunciarse acotada exactamente así: **"Change Archive de un change de
conformidad: no modifica `aspec/specs/**/*.md`."** SHALL usarse "no modifica" y NO SHALL usarse "no toca".
La garantía NO SHALL extenderse a los demás escritores ni operaciones del mismo estado: `ancleto-sync-specs`;
`@documenter` en `Standalone Source-of-Truth Update`; `ancleto-bulk-archive`; la rama "Sync now" cuando SÍ
hay delta; la rama elegida por el usuario "Archive without syncing"; el move a `aspec/changes/archive/`;
el commit de archive de `@coder`; la promoción a `.ancleto/memory.db` / `working-context`; el chequeo de
frescura del seed; y todas las lecturas (`ancleto specs check`, la resolución fail-closed de `spec:`).

El archive NO SHALL agregar un segundo gate de verificación: la verificación reusa el ledger cerrado del
orquestador y NO SHALL contradecir "Don't block archiving on warnings". La verificación de este contrato
SHALL apoyarse en el contrato de texto de las skills/agents y en content guards; NO SHALL describirse como
un test ejecutable de archive cuando esa superficie no existe.

#### Scenario: Archive no-op de un change de conformidad

- **WHEN** se archiva un change de conformidad con cita resoluble y sin delta
- **THEN** el archive informa "sin delta" nombrando el Requirement citado
- **AND** completa el move y la promoción normalmente
- **AND** no modifica `aspec/specs/**/*.md`

#### Scenario: Sin delta y sin cita resoluble

- **WHEN** un change sin delta y sin cita resoluble intenta archivarse
- **THEN** el archive se rechaza con un reporte explícito
- **AND** no escribe en `aspec/specs/**/*.md`
- **AND** no se archiva en silencio

#### Scenario: Cita resoluble pero no relevante

- **WHEN** el Requirement citado resuelve pero no describe el comportamiento que el change restaura
- **THEN** el archive se rechaza o se detiene y se pregunta al usuario
- **AND** `@reviewer` reporta la falta de relevancia como hallazgo `CRITICAL`
- **AND** la resolubilidad mecánica no se presenta como prueba de conformidad

#### Scenario: La garantía no oculta a los otros escritores

- **WHEN** el mismo estado tiene un delta y el usuario elige "Sync now", o intervienen
  `ancleto-sync-specs`, `@documenter` en `Standalone Source-of-Truth Update` o `ancleto-bulk-archive`
- **THEN** esas escrituras quedan fuera de la garantía acotada
- **AND** la garantía nombra sólo la operación Change Archive de un change de conformidad
