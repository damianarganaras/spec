# Design: Perfil de test automation estilo spectest

## Approach

Introducir el concepto de **perfil** en el CLI: `init`/`install` aceptan `--profile`
(default: perfil general actual) y lo persisten en `.ancletorc` (`profile: test`). Con
`profile: test`, `installAgentSkills` y `copyTemplates` seleccionan los activos de
`profiles/test/` en lugar de los generales: un `tester.md` ampliado con los 4
workflows, comandos `cleto-test-*`, estructura `testspec/` y un `AGENTS.md` orientado
a testing. El `tester`/`reviewer` base quedan intactos para el perfil general. El tier
aplica igual (es ortogonal al perfil). El orchestrator suma una regla de ruteo:
cambio test-only → workflow del perfil; cambio mixto → SDD general con delegación al
tester ampliado.

Decisiones de diseño:
- Nuevo directorio de activos `profiles/test/` (agents + commands + templates) versionado con el paquete; el perfil general sigue usando `agents/`, `commands/`, `templates/` como hoy.
- Estructura de testing: se reutiliza `aspec/` cuando el proyecto ya lo usa; si el proyecto es test-only se crea `testspec/specs` + `testspec/changes` con el mismo formato de artifacts.
- Los comandos `cleto-test-*` son markdown puro siguiendo el patrón `cleto-*` existente (wrappers finos de skills, fuente única).
- Puente opcional a CLI externo (`npx @speckit/spectest ...`) solo cuando el orchestrator lo decide; nunca dependencia obligatoria (contrato zero-dependencies).

## Architecture

```text
ancleto init --profile test [--agent copilot|opencode|...]
├── .ancletorc { profile: 'test', agent, tier, ... }
├── profiles/test/
│   ├── agents/tester.md      # 4 workflows: planning / generation / healing / coverage
│   ├── agents/reviewer.md    # revisión orientada a tests
│   ├── commands/cleto-test-proposal|apply|heal|coverage|archive.md
│   └── templates/AGENTS.md   # convenciones Playwright + testing
├── testspec/specs + testspec/changes  (o reuso de aspec/)
└── orchestrator: ruteo test-only → tester ampliado / mixto → SDD general

Workflows del tester ampliado:
- planning: propone qué testear (cobertura objetivo) como change de testing.
- generation: genera tests Playwright desde el plan aprobado.
- healing: ante un test fallido, diagnostica y repara (código o test).
- coverage: reporta brechas entre specs y tests existentes.
```

## Validation

- `init --profile test` en fixture crea `testspec/specs` + `testspec/changes` (o puebla `aspec/` si se elige reuso) más agentes/comandos del perfil.
- Perfil general sin cambios: `init` sin `--profile` instala exactamente lo mismo que hoy.
- `cleto-test-heal` repara un test Playwright fallido en fixture; `cleto-test-coverage` reporta una brecha conocida.
- Instalación combinada `--profile test --agent copilot` deja los prompts en `.github/prompts/`.
- Guía test-vs-general escrita y ruteo del orchestrator verificado en un cambio mixto de ejemplo.
