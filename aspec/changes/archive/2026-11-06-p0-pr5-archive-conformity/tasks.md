# Tasks: PR-5 — conformidad sin delta y archive no-op

> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: tests `npm test` (para pasos
> acotados, `node --test test/content-guards.test.js`) y lint `npm run lint`. Format: `not-configured`.

## 1. Contrato canónico

- [x] 1.1 En `aspec/specs/prompt-contracts/spec.md`, agregar los dos `ADDED Requirements` del delta de
  este change: "Clasificación de conformidad frente a cambio funcional" y "Archive de un change de
  conformidad sin delta". No modificar `### Requirement: El checkpoint de aprobación aprueba el contrato
  del cambio` ni `### Requirement: Retiro de design.md y context.md sin artifact sucesor`; verificar que
  no cambia ningún Requirement existente (0 requisitos canónicos modificados implícitamente).

## 2. Ruteo

- [x] 2.1 En `agents/orchestrator.md`, agregar la cláusula de conformidad al vocabulario de triage y a la
  regla de ambigüedad persistente; conservar la regla de clarificación insuficiente, la confirmación
  explícita del camino directo y la prohibición de confirmación implícita. No tocar el Contract
  Checkpoint ni el FINAL ARCHIVE CHECKPOINT.
- [x] 2.2 En `skills/triage-clarifier/SKILL.md`, implementar la norma del orquestador y coincidir
  literalmente en vocabulario de categorías, regla de una sola pregunta, escalado a `spec-required` con
  aviso explícito, clarificación insuficiente (sólo ubicación/ownership/superficie) y la nueva cláusula
  de conformidad. No editar `.opencode/skills/triage-clarifier/SKILL.md` (mirror generado).
  - Reparación post-verificación: `## Direct path confirmation` exige la confirmación explícita sólo para
    `direct-implementation` (nunca implícita por silencio, demora o falta de objeción); `direct-test-only`
    no agrega ese stop y sigue sujeto al escalado, alineado con Path B y Path C de `agents/orchestrator.md`.
- [x] 2.3 En `skills/ancleto-workflow/SKILL.md` y `skills/ancleto-continue/SKILL.md`, dejar de tratar la
  ausencia de `specs/` como artifact faltante por sí sola: distinguir "change de conformidad con cita
  resoluble" (no crear delta) de "change funcional sin delta" (crear delta).
- [x] 2.4 En `agents/spec-writer.md`, no contradecirse: para un change clasificado como conformidad,
  generar `proposal.md` con la cita `spec:<capability>#<requirement>` y NO generar `specs/`; la regla
  existente "write a delta against the existing spec" aplica sólo a cambios funcionales.

## 3. Archive

- [x] 3.1 En `skills/ancleto-archive/SKILL.md`, agregar la rama no-delta explícita: reportar "sin delta"
  nombrando el Requirement citado, validar la cita `spec:<capability>#<requirement>` fail-closed antes de
  archivar (cita que no resuelve ⇒ archive rechazado) y declarar la garantía acotada "Change Archive de un
  change de conformidad: no modifica `aspec/specs/**/*.md`" con su lista de exclusiones. Reusar el ledger
  cerrado del orquestador; no agregar un segundo gate de verificación ni contradecir "Don't block
  archiving on warnings".
- [x] 3.2 En `agents/documenter.md`, condicionar `specs check` y el merge a la existencia de deltas; en un
  change de conformidad, no reportar la ausencia de `specs/` como defecto y no escribir en
  `aspec/specs/**/*.md`.

## 4. Consumidores

- [x] 4.1 En `agents/coder.md` y `agents/tester.md`, contemplar el change sin delta: leer el Requirement
  canónico citado en `proposal.md` como input de comportamiento/verificación, manteniendo el delta como
  input primario cuando existe.
- [x] 4.2 En `agents/reviewer.md`, para un change sin delta, verificar que la cita resuelve contra la spec
  canónica y que el diff no toca `aspec/specs/`.

## 5. Guards

- [x] 5.1 En `test/content-guards.test.js`, agregar T02/T03: en un change sin delta, el contrato exige que
  `proposal.md` cite `Requirement:` / `spec:<capability>#<requirement>`; el texto de archive contiene la
  rama no-delta con el reporte "sin delta" y la garantía acotada; y un change funcional sin delta no puede
  presentarse como conformidad (el guard rechaza el texto que omite el error explícito). Cada invariante
  nuevo con su mutación vía `assertMutationBreaks`.

## 6. Bookkeeping

- [x] 6.1 En `aspec/backlog.md`, marcar PR-5 como cerrado y dejar MEM-01 pendiente como runbook que
  requiere aprobación explícita; ajustar la prioridad P0 en consecuencia.
- [x] 6.2 Idempotencia del merge de archive: los dos `ADDED Requirements` ya fueron materializados en
  `aspec/specs/prompt-contracts/spec.md` durante la implementación (para que los `spec:` resuelvan). Al
  archivar, verificar que ambos Requirement ya están presentes verbatim y NO duplicarlos.

## 7. Verificación

- [x] 7.1 Correr `node --test test/content-guards.test.js` (ruta explícita) y `npm run lint` si el scope
  incluye archivos JS; registrar el format check como `not-configured`.

## Fase 5 — Archive

**Change:** p0-pr5-archive-conformity
**Archived to:** aspec/changes/archive/2026-11-06-p0-pr5-archive-conformity/
**Specs:** ✓ Synced — delta ya materializado en aspec/specs/prompt-contracts/spec.md; merge idempotente sin cambios
**Memories promoted:** archive-conformity-discriminator, archive-noop-does-not-write-canonical-specs, conformity-verification-reuses-closed-ledger, triage-routing-single-contract
