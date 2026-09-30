# Proposal: Perfil de test automation estilo spectest

## Problem

`ancleto` tiene agentes `tester` y `reviewer` más el comando `cleto-verify`, pero no
existe un flujo dedicado a automation testing (Playwright): no hay generación de tests
desde el plan, ni healing de tests fallidos, ni reporte de coverage, ni un perfil que
instale todo eso de una vez. Cada proyecto arma su propio flujo a mano y el
orchestrator no sabe cuándo derivar a un workflow de testing.

## Proposed change

Agregar un perfil instalable `ancleto init --profile test` (variante `--profile
test:playwright`) que instale un `tester` ampliado con los 4 workflows
(planning/generation/healing/coverage), comandos `cleto-test-*`, estructura de specs
de testing y template `AGENTS.md` orientado a testing con convenciones Playwright. El
orchestrator decide: cambio test-only → workflow test; cambio mixto → SDD general con
apoyo del tester.

## Scope

In scope:
- Flag `--profile` en `init`/`install`, persistido en `.ancletorc` (`profile: test`).
- Carpeta de activos `profiles/test/` (agents + commands + templates).
- `tester.md` ampliado + comandos `cleto-test-proposal`, `cleto-test-apply`, `cleto-test-heal`, `cleto-test-coverage`, `cleto-test-archive`.
- Regla de ruteo del orchestrator (test-only vs mixto) y compatibilidad con `--agent copilot`.
- Guía de cuándo usar perfil test vs general.

Out of scope:
- Dependencia obligatoria del CLI externo spectest (solo puente opcional de delegación).
- Soporte de frameworks distintos a Playwright en esta fase.
- Cambios en el SDD general fuera del ruteo del orchestrator.

## Risks

- Alcance del tester ampliado rompe el contrato actual del agente: mitigación manteniendo el `tester` base intacto y activando los workflows solo con `profile: test`.
- Playwright no instalado en el proyecto destino: mitigación detectando su presencia y degradando con mensaje claro (planning/coverage sin ejecución).
- Duplicación con `cleto-verify`: mitigación definiendo `verify` como puerta general y `cleto-test-*` como workflows del perfil.
