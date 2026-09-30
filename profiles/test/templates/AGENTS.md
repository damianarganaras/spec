# AI Agents Context (test automation profile)

> Contexto global para agentes de IA en proyectos con perfil de test automation.

<!-- LOCKED: test-profile -->
### Test automation profile (Playwright)

Este proyecto usa el perfil `test` de ancleto (`profile: test` en `.ancletorc`).

- Workflows: planning (`cleto-test-proposal`), generation (`cleto-test-apply`), healing (`cleto-test-heal`), coverage (`cleto-test-coverage`), archive (`cleto-test-archive`).
- Estructura: `testspec/specs/` (cobertura actual) + `testspec/changes/` (deltas), o reuso de `aspec/` cuando el proyecto ya lo usa.
- Framework: Playwright. Si no está instalado, los workflows degradan a análisis sin ejecución y lo reportan.
- Ruteo: cambio test-only → tester ampliado; cambio mixto → SDD general con apoyo del tester.
<!-- /LOCKED: test-profile -->
