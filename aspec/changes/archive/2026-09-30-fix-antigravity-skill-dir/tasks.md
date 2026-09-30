# Tasks: Fix del directorio de skills de Antigravity (+ garantía IDE/CLI)

> SUPERSEDED por `main` (v0.8.0): `AGENT_TARGETS.antigravity` + soporte completo
> (agents adaptados, commands como skills, MCP propio) cubren el fix. Garantía IDE/CLI
> validada por el usuario el 2026-09-30. Quedan los artifacts como historial.

## Fase 1 — Corrección del mapeo

- [x] Cambiar `AGENT_SKILLS_DIR.antigravity` a `.agents/skills` (`src/cli/index.js`).
- [x] Agregar fallback `.agent/skills` (solo si no existe) y destino global `~/.gemini/antigravity/skills` para `install --global`.
- [x] Verificar si Antigravity espera agentes en rutas propias y mapearlas o descartarlas con fundamento.

## Fase 2 — Tests y doc

- [x] Tests con fixture: skills en `.agents/skills/`, nada en `.antigravity/skills`; global con HOME temporal.
- [x] Test de contrato: frontmatter `name`/`description` de cada skill parsea sin warnings.
- [x] Actualizar documentación con el directorio correcto.

## Fase 3 — Gate de garantía IDE/CLI

- [x] Verificación post-instalación en Antigravity IDE (`ancleto-*` visibles).
- [x] Verificación post-instalación en Antigravity CLI (mismo criterio).
- [x] Registrar evidencia y cerrar el item de BACKLOG solo con ambas en verde.
