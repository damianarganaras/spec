# Proposal: Skill `ancleto-update` para actualizar artifacts ante cambios de definición

## Problem

Hoy las skills del ciclo aspec cubren crear (`ancleto-propose`, `ancleto-new`), completar faltantes
(`ancleto-continue`) y propagar deltas hacia los specs principales (`ancleto-sync-specs`), pero
ninguna **actualiza in-place los artifacts de un change existente cuando cambia una definición**.
Ante un requirement de `aspec/specs/` que se modifica, o un cambio de alcance/diseño durante la
implementación, las salidas actuales son reescribir todo con `ancleto-propose` (overwrite, sin merge)
o editar los archivos a mano sin guardrails. Además, `ancleto-sync-specs` es estrictamente
unidireccional (change → main), así que no cubre el sentido inverso (main → change). El resultado son
artifacts obsoletos que `ancleto-verify` y `ancleto-archive` tratan después como fuente de verdad.

## Proposed change

Crear la skill `ancleto-update` (comando `/cleto-update`) que, dado un change existente y una
definición que cambió (un spec principal actualizado, o un cambio de alcance/diseño que describe el
usuario), reescriba los artifacts afectados con **merge no destructivo**, preservando lo no
mencionado. La skill:

- Clasifica el cambio por artifact dueño: requisito/comportamiento → `specs/`; decisión de diseño →
  `design.md`; alcance → `proposal.md`; trabajo nuevo → `tasks.md`.
- Detecta **drift** entre los delta specs del change y los specs principales, y además aplica los
  cambios que el usuario describe (ambos modos).
- Pregunta al ejecutar si escribe **in-place** o genera una revisión `rev2` (ambas modalidades, a
  elección del usuario).
- En `tasks.md` preserva los `- [x]` y agrega tareas nuevas; en `specs/` usa `MODIFIED Requirements`
  sin duplicar escenarios existentes.
- Ofrece `ancleto-verify` al terminar cuando cambió comportamiento especificado.

## Scope

In scope:
- `skills/ancleto-update/SKILL.md` (sin binarios externos) + `commands/cleto-update.md`.
- Detección de drift delta↔spec principal y aplicación de los cambios descritos por el usuario.
- Dos modos de escritura elegidos al ejecutar: in-place y `rev2`.
- Registro en `test/content-guards.test.js`: sumar `ancleto-update` a `ARTIFACT_SKILLS` y ajustar el
  conteo de comandos (`14 + 1` → `15 + 1`).
- Fila de routing y diagrama en `skills/ancleto-workflow/SKILL.md`.
- Documentación `docs/skill-ancleto-update.md` siguiendo el molde de `docs/skill-ancleto-upgrade.md`.

Out of scope:
- Cambios en `src/` (reutiliza el mecanismo de instalación por host existente).
- Auto-fix de implementación o de código (la skill solo toca artifacts).
- Volver bidireccional a `ancleto-sync-specs` ni reescribir su lógica.
- Detección de cambios sin input: la skill parte de una definición declarada por el usuario o de un
  drift detectado y confirmado, nunca inventa el cambio.

## Related Work Item

- No hay Work Item asociado; el pedido surgió de la conversación (`ancleto spec tiene una skill de update...`).

## Risks

- Colisión de nombre con el CLI `ancleto update` (que reinstala el paquete): mitigación con
  desambiguación explícita en el `description` del wrapper y en la skill ("skill = actualiza
  artifacts; CLI `ancleto update` = reinstala"). Nota: en el contenido debe escribirse el CLI como
  `ancleto update` — nunca `aspec update`, prohibido por `content-guards`.
- Merge destructivo que borre contenido no mencionado: mitigación con la regla de preservación
  (idéntica a `ancleto-sync-specs`) y verificación de idempotencia.
- Drift detectado sobre un change ya archivado: mitigación con la regla de no tocar
  `aspec/changes/archive/` y reportar en su lugar.
- Ambigüedad sobre qué artifact actualizar: mitigación preguntando en lugar de adivinar, con el mapeo
  por dueño como default propuesto.
