# Tasks: Skill `cleto-review` de revisión de código

## Fase 1 — Skill

- [x] Crear `skills/ancleto-review/SKILL.md` (frontmatter `name: ancleto-review`, sin binarios externos): pasos resolver-scope → detectores → reporte, heurística de degradación de severidad, cap de 5 hallazgos por severidad, citas `file:line` sin pegar diffs.
- [x] Crear `commands/cleto-review.md` (wrapper `/cleto-review`: invoca la skill, scope como input libre, grounding de Work Item de `@context-resolver`).
- [x] Verificar instalación por host con el mecanismo existente (`ancleto check` en verde, skill visible en el agente configurado) — `check` detectó los 2 assets nuevos sin cambios en `src/`; copias instaladas en `.opencode/` (gitignored); `check` en verde.

## Fase 2 — Detectores (implementados como secciones del paso 3 de `SKILL.md`)

- [x] Detector código repetido: bloques gemelos dentro del scope (reporta ambos `file:line` + sugiere extracción).
- [x] Detector método redundante: lógica del scope que ya existe fuera del diff (cita el `file:line` externo como evidencia, recomienda reutilizar).
- [x] Detector código mal ubicado: contradicción con el mapa del proyecto (`PRODUCT.md`, estructura, `aspec/specs/`); recomienda la ubicación correcta.
- [x] Detector código sin uso: funciones/imports del scope sin referencias en el repo (búsqueda de llamadas); recomienda eliminar.

## Fase 3 — Scope y cierre

- [x] Implementar gramática de scope MVP (`#nro` → `git log --grep`, rangos `A..B`/`HEAD~n`, paths, worktree) con pregunta al usuario si es ambiguo (nunca adivinar) — vive en `SKILL.md` (Input + paso 1).
- [x] Pasar `ancleto specs check --change cleto-review --json` y normalizar keywords — verde (12 archivos, 0 no-canónicos).
- [x] Registrar reglas/decisiones reusables vía `recordRule`/`recordDecision` (frontera review vs reviewer/verify) y archivar con `/cleto-archive` — memoria registrada (`review-vs-reviewer-verify-boundary`, `new-wrapper-command-checklist`); archivado pendiente (comando aparte).
