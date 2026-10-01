# Spec delta: fix-antigravity-skill-dir

## MODIFIED Requirements

### Requirement: Directorio de skills de Antigravity

The system SHALL instalar las skills de Antigravity en el directorio que el IDE escanea.

#### Scenario: Install con agente antigravity

- **WHEN** se ejecuta `ancleto install --agent antigravity`
- **THEN** las skills quedan en `.agents/skills/` (y en `.agent/skills/` como fallback solo si no existe)
- **AND** ningún archivo se escribe en `.antigravity/skills`

#### Scenario: Install global con agente antigravity

- **WHEN** se ejecuta `ancleto install --global --agent antigravity`
- **THEN** las skills quedan en `~/.gemini/antigravity/skills/`

## ADDED Requirements

### Requirement: Gate de garantía IDE/CLI

The system SHALL declarar soporte de Antigravity solo con evidencia en ambos entornos.

#### Scenario: Cierre del soporte

- **WHEN** las skills `ancleto-*` se descubren en Antigravity IDE y en Antigravity CLI sin warnings de frontmatter
- **THEN** el soporte se declara garantizado y se documenta con la evidencia
