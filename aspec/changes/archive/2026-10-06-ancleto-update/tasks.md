# Tasks: Skill `ancleto-update` para actualizar artifacts ante cambios de definición

## Fase 1 — Asset de la skill

- [x] Crear `skills/ancleto-update/SKILL.md` con frontmatter `name: ancleto-update`, header `**Artifacts language**`, sin binarios externos: pasos resolver-change → leer artifacts → consolidar (drift + descripción) → clasificar por dueño → merge no destructivo → preguntar modo → ofrecer verify.
- [x] Definir en `SKILL.md` el mapeo por dueño (requisito → `specs/<capability>/spec.md`; diseño → `design.md`; alcance → `proposal.md`; trabajo nuevo → `tasks.md`).
- [x] Definir en `SKILL.md` la regla de preservación (merge, no overwrite), idempotencia y el uso de `## MODIFIED Requirements` sin copiar escenarios existentes.
- [x] Definir en `SKILL.md` los guardrails: no tocar `aspec/changes/archive/`, no tocar `aspec/specs/` (es de `ancleto-sync-specs`), no tocar código de implementación (es de `ancleto-apply`), preguntar en vez de adivinar, no auto-seleccionar el change.
- [x] Crear `commands/cleto-update.md` (wrapper `/cleto-update`: invoca la skill; desambigua del CLI `ancleto update`; Work Item grounding de `@context-resolver`).

## Fase 2 — Modos y detección

- [x] Implementar la pregunta de modo al ejecutar: in-place (edita el artifact + entrada en `## Change Log` de `proposal.md`) vs `rev2` (escribe solo los artifacts afectados bajo `aspec/changes/<name>/rev2/` con igual ruta relativa, más `rev2/README.md` con motivo/fecha/origen).
- [x] Implementar la detección de drift delta spec ↔ `aspec/specs/<capability>/spec.md` (requirements del delta ausentes o cambiados en el principal) y la propuesta de realineación, de forma aditiva a los cambios descritos por el usuario.
- [x] Implementar la preservación de `- [x]` en `tasks.md` y el alta de tareas nuevas al final de su fase, sin reordenar.

## Fase 3 — Registro y documentación

- [x] Sumar `ancleto-update` a `ARTIFACT_SKILLS` en `test/content-guards.test.js` y ajustar el conteo de comandos de `14 + 1` a `15 + 1`.
- [x] Agregar la fila de routing y actualizar el diagrama del ciclo en `skills/ancleto-workflow/SKILL.md`.
- [x] Crear `docs/skill-ancleto-update.md` siguiendo el molde de `docs/skill-ancleto-upgrade.md`.

## Fase 4 — Verificación

- [x] Correr `ancleto specs check --change ancleto-update --json` y normalizar keywords canónicos (verde, 0 no-canónicos).
- [x] Verificar que el contenido de la skill escribe el CLI como `ancleto update` (nunca la forma prohibida por `content-guards`) — grep sin coincidencias.
- [x] Correr `npm test` (incluye `content-guards`), `npm run lint` y `npm run typecheck` en verde — `npm test` 392/392 y `npm run lint` limpio; no existe script `typecheck` ni `tsconfig.json` (repo JS), por lo que se omitió.
- [x] Verificar la instalación por host con el mecanismo existente (`ancleto check` / `ancleto doctor`) sin cambios en `src/`, y confirmar idempotencia (dos corridas, mismo resultado) — copias idénticas a la fuente; `ancleto check` marca los 2 assets nuevos como huérfanos porque el catálogo del CLI (0.11.1) todavía no los conoce (comportamiento esperado, igual que en `cleto-review`).
- [x] Registrar reglas/decisiones reusables vía `recordRule`/`recordDecision` — `artifact-update-skill-boundary`, `new-artifact-skill-checklist`.
- [x] Archivar el change con `/cleto-archive` (acción explícita del usuario, posterior al verify).
