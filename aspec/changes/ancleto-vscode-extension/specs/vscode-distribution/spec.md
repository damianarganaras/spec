## ADDED Requirements

### Requirement: Distribución dual npm y VS Code Marketplace

The system SHALL ofrecer `ancleto` tanto como paquete npm (`@ancleto/spec`) como extensión de VS Code (`.vsix` en VS Marketplace y Open VSX), manteniendo versionado único y paridad funcional.

#### Scenario: Instalación vía Marketplace

- **WHEN** el usuario instala la extensión desde VS Marketplace u Open VSX
- **THEN** obtiene las mismas capacidades que con `npm install -g @ancleto/spec` sin requerir npm manualmente

#### Scenario: Versionado único

- **WHEN** se publica un tag `v*`
- **THEN** se publican la misma versión en npm y en Marketplace/Open VSX

### Requirement: Activación y paridad de comandos en VS Code

The system SHALL exponer los comandos de la CLI (`install`, `update`, `discovery`, `memory`, `mcp`, `doctor`) como comandos de la Command Palette con equivalencia 1:1.

#### Scenario: Comando Install desde la paleta

- **WHEN** el usuario ejecuta `Ancleto: Install` en un workspace abierto
- **THEN** se ejecuta el mismo flujo que `ancleto install`, incluyendo merge de bloques `LOCKED`, y se notifica el resultado en VS Code

#### Scenario: Host sin Node compatible

- **WHEN** la extensión se activa en un host con Node < 24
- **THEN** muestra un mensaje de degradación claro y no intenta usar `node:sqlite`

### Requirement: Empaquetado sin dependencias de runtime

The system SHALL empaquetar en el `.vsix` el núcleo existente (`src/`, `agents/`, `commands/`, `skills/`, `templates/`) sin agregar dependencias de runtime.

#### Scenario: Auditoría de dependencias

- **WHEN** se construye el `.vsix` con `vsce package`
- **THEN** el manifiesto no contiene dependencias de runtime nuevas y el contrato zero-dependencies sigue válido

### Requirement: Transformación npm a vsix para deploy rápido

The system SHALL proveer un build que transforma el código npm (fuente de verdad) al formato que usa el `.vsix`, de modo que cada cambio nuevo se deploye sin edición manual duplicada.

#### Scenario: Cambio nuevo en npm llega al vsix

- **WHEN** se modifica `src/`, `agents/`, `commands/`, `skills/` o `templates/` y se corre el build (`npm run build:vsix`)
- **THEN** el `.vsix` generado contiene el código actualizado con la misma versión de `package.json`, sin pasos manuales

### Requirement: Deploy desde GitHub al Marketplace

The system SHALL publicar la extensión a VS Marketplace y Open VSX desde GitHub Actions en tags `v*`, en paralelo al publish npm.

#### Scenario: Release con tag versionado

- **WHEN** se pushea un tag `v*`
- **THEN** el workflow ejecuta tests, construye el `.vsix` desde el código npm y lo publica a VS Marketplace y Open VSX con la misma versión
