# Design: Skill `ancleto-update` para actualizar artifacts ante cambios de definición

## Approach

Skill agent-driven sin binarios externos, invocable por el usuario vía `/cleto-update <change> [qué
cambió]`. Entrada: change name (si falta, listar `aspec/changes/` excluyendo `archive/` y pedir
selección — nunca auto-seleccionar, como `ancleto-continue`/`ancleto-sync-specs`) + la definición que
cambió. Flujo: (1) leer todos los artifacts presentes; (2) detectar drift delta↔spec principal y
consolidarlo con los cambios descritos por el usuario; (3) clasificar por artifact dueño; (4) aplicar
merges mínimos preservando lo no mencionado; (5) preguntar in-place vs `rev2`; (6) ofrecer
`ancleto-verify` si cambió comportamiento especificado.

Decisiones de diseño:

- **Un único dueño por cambio.** El mapeo por artifact determina dónde escribir: requisito o
  comportamiento → `specs/<capability>/spec.md`; decisión de diseño → `design.md`; alcance →
  `proposal.md`; trabajo nuevo → `tasks.md`. Si un cambio toca varios dueños, se aplica en cada uno por
  separado.
- **Merge, no overwrite.** Se preserva todo contenido no mencionado (regla idéntica a
  `ancleto-sync-specs`). En `specs/` se usa `## MODIFIED Requirements` agregando o editando escenarios
  sin copiar los existentes; en `tasks.md` se preservan los `- [x]` y las tareas nuevas van al final de
  su fase sin reordenar.
- **Detección de drift.** Para cada delta spec del change se compara con el spec principal de la misma
  capability en `aspec/specs/<capability>/spec.md`; se reportan requirements del delta ausentes o
  cambiados en el principal y se propone la realineación. Es aditivo: además de los cambios que el
  usuario describe, no en lugar de ellos.
- **Modo elegido al ejecutar.** Ante la pregunta "¿in-place o `rev2`?": in-place edita el artifact y
  agrega una entrada a un `## Change Log` en `proposal.md`; `rev2` escribe solo los artifacts afectados
  bajo `aspec/changes/<name>/rev2/` con la misma ruta relativa (`rev2/proposal.md`,
  `rev2/specs/<capability>/spec.md`, …) dejando el original intacto, más `rev2/README.md` con el motivo,
  la fecha y el origen del cambio.
- **Nunca toca lo ajeno.** No toca `aspec/changes/archive/` (si el nombre resuelve a un change
  archivado, se detiene y reporta) ni `aspec/specs/` (eso es de `ancleto-sync-specs`) ni código de
  implementación (eso es de `ancleto-apply`).
- **Idempotencia.** Correr la skill dos veces con el mismo input produce el mismo resultado.
- **Preguntar, no adivinar.** Si no es claro qué artifact o qué modo, se pregunta; el mapeo por dueño es
  el default propuesto.

## Architecture

```text
/cleto-update <change> "<qué cambió>"
  └─► skills/ancleto-update/SKILL.md
        ├── 1. Resolver change (nunca auto-seleccionar; archive/ se rechaza)
        ├── 2. Leer artifacts presentes (proposal, specs/, design, tasks)
        ├── 3. Consolidar el cambio
        │     ├── drift: delta spec  ↔  aspec/specs/<capability>/spec.md
        │     └── descripción del usuario
        ├── 4. Clasificar por dueño y aplicar merge no destructivo
        │     ├── requisito      → specs/<capability>/spec.md  (MODIFIED)
        │     ├── diseño         → design.md
        │     ├── alcance        → proposal.md
        │     └── trabajo nuevo  → tasks.md  (preserva - [x])
        ├── 5. Preguntar modo: in-place (edita + Change Log) | rev2 (rev2/<ruta>)
        └── 6. Ofrecer ancleto-verify si cambió comportamiento especificado
```

Nuevos assets (único cambio en el repo, además de registros y docs):
- `skills/ancleto-update/SKILL.md` — definición de la skill (frontmatter `name: ancleto-update`, header
  `**Artifacts language**`, pasos, mapeo por dueño, guardrails).
- `commands/cleto-update.md` — wrapper `/cleto-update` (invoca la skill; desambigua del CLI
  `ancleto update`; grounding de Work Item de `@context-resolver`).
- `test/content-guards.test.js` — `ancleto-update` en `ARTIFACT_SKILLS`; conteo de comandos `15 + 1`.
- `skills/ancleto-workflow/SKILL.md` — fila de routing + diagrama del ciclo.
- `docs/skill-ancleto-update.md` — documentación, molde de `docs/skill-ancleto-upgrade.md`.

Relación con assets existentes:
- `ancleto-propose`: crea artifacts (overwrite); `ancleto-update` los revisa (merge). Sin acoplamiento.
- `ancleto-sync-specs`: propaga change → main (unidireccional); `ancleto-update` realinea main → change
  y edita los artifacts del change. Fronteras disjuntas.
- `ancleto-verify`: verifica completitud; `ancleto-update` la ofrece al terminar, no la reemplaza.
- CLI `ancleto update`: reinstala el paquete; la skill desambigua por nombre y por `description`.

## Validation

- Header `**Artifacts language**` y keywords canónicos en el delta spec (`ancleto specs check --change
  ancleto-update --json` en verde, 0 no-canónicos).
- `test/content-guards.test.js` en verde: `ARTIFACT_SKILLS` con `ancleto-update` y conteo de comandos
  `15 + 1`; el contenido de la skill escribe el CLI como `ancleto update` (nunca la forma prohibida).
- Idempotencia del merge y de la detección de drift (dos corridas, mismo resultado).
- `npm test`, `npm run lint` y `npm run typecheck` en verde.
- Instalación por host con el mecanismo existente (`ancleto check` / `ancleto doctor`), sin cambios en
  `src/`.
