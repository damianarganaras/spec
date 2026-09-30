# Spec delta: ancleto-vscode-extension (continuación — implementación)

## ADDED Requirements

### Requirement: Scaffold de la extensión

The system SHALL proveer el layout `vscode-extension/` con manifiesto, punto de entrada y recursos.

#### Scenario: Apertura en Extension Development Host

- **WHEN** se abre el proyecto con la extensión scaffoldeada y se presiona `F5`
- **THEN** el host de desarrollo activa la extensión sin errores y registra los comandos `ancleto.*`

### Requirement: Paridad funcional CLI y paleta

The system SHALL exponer cada comando CLI como comando de la Command Palette sobre el workspace abierto.

#### Scenario: Install desde la paleta

- **WHEN** el usuario ejecuta `Ancleto: Install` en un workspace abierto
- **THEN** corre el mismo flujo que `ancleto install` (incluido merge `LOCKED`) y notifica el resultado en VS Code

#### Scenario: Comandos de diagnóstico en Output Channel

- **WHEN** el usuario ejecuta `Ancleto: Doctor` (o discovery/memory/mcp/check/stats)
- **THEN** la salida del núcleo aparece en Output Channel o terminal integrado

### Requirement: Build npm a vsix y publish dual

The system SHALL construir el `.vsix` desde el código npm y publicarlo junto a npm en cada tag.

#### Scenario: Tag versionado publica en ambos canales

- **WHEN** se pushea un tag `v*`
- **THEN** el CI ejecuta tests, corre `npm run build:vsix` y publica la misma versión en npm, VS Marketplace y Open VSX
- **AND** el `.vsix` instala localmente con `code --install-extension` sin dependencias de runtime nuevas
