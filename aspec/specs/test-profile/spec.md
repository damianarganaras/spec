# Spec: test-profile

## ADDED Requirements

### Requirement: Perfil test instalable

The system SHALL instalar el perfil de test automation cuando se indica `--profile test`.

#### Scenario: Init con perfil test

- **WHEN** se ejecuta `ancleto init --profile test`
- **THEN** se persiste `profile: test` en `.ancletorc` y se instalan el tester ampliado, los comandos `cleto-test-*` y la estructura `testspec/specs` + `testspec/changes`
- **AND** un `init` sin `--profile` instala exactamente los activos generales actuales

### Requirement: Ruteo del orchestrator por tipo de cambio

The system SHALL derivar los cambios test-only al workflow del perfil y los mixtos al SDD general.

#### Scenario: Cambio test-only con perfil test

- **WHEN** el orchestrator recibe un cambio test-only en un proyecto con `profile: test`
- **THEN** delega planning/generation/healing/coverage al tester ampliado

#### Scenario: Cambio mixto con perfil test

- **WHEN** el orchestrator recibe un cambio mixto en un proyecto con `profile: test`
- **THEN** sigue el SDD general con apoyo del tester ampliado

### Requirement: Compatibilidad del perfil con Copilot

The system SHALL instalar los activos del perfil test en el directorio del agente configurado.

#### Scenario: Perfil test con agente copilot

- **WHEN** se ejecuta `ancleto init --profile test --agent copilot`
- **THEN** los prompts del perfil quedan disponibles en `.github/prompts/`
