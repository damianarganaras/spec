# Spec delta: add-copilot-support

## ADDED Requirements

### Requirement: Instalación de prompts de Copilot

The system SHALL instalar los agentes y comandos como prompt files de Copilot cuando el agente configurado es `copilot`.

#### Scenario: Install con agente copilot

- **WHEN** se ejecuta `ancleto install --agent copilot` en un proyecto
- **THEN** se crean `.github/prompts/*.prompt.md` generados desde `agents/*.md` y `commands/*.md` con instrucciones idénticas
- **AND** se crea `copilot-mcp.json` con los MCP habilitados mediante merge no destructivo

### Requirement: Upgrade preserva customs de Copilot

The system SHALL regenerar los prompts en `upgrade` sin pisar contenido custom del usuario.

#### Scenario: Upgrade con copilot-instructions custom

- **WHEN** se ejecuta `ancleto upgrade --agent copilot` y existe `copilot-instructions.md` con contenido custom
- **THEN** los `.prompt.md` se regeneran y el custom permanece intacto

### Requirement: Documentación de la limitación de modelos

The system SHALL documentar que en Copilot el tier no selecciona modelos.

#### Scenario: Usuario consulta tiers con Copilot

- **WHEN** el usuario usa `--tier` junto a `--agent copilot`
- **THEN** la guía explica que el modelo se elige en el picker y el tier se traduce a nivel de esfuerzo/pasos
