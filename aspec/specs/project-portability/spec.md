# Spec: project-portability

## ADDED Requirements

### Requirement: Export portable sin rutas absolutas

The system SHALL generar un bundle portable cuyo manifiesto no contenga paths absolutos ni secretos.

#### Scenario: Export en máquina origen

- **WHEN** se ejecuta `ancleto export`
- **THEN** se genera el bundle con `manifest.json` (versión, agente, tier, idioma, flags, MCP por nombre+tipo)
- **AND** el manifiesto no contiene paths absolutos, credenciales ni datos de sesión

### Requirement: Import regenera MCP locales

The system SHALL aplicar los portables y regenerar las entradas MCP con rutas del host destino.

#### Scenario: Import en máquina destino

- **WHEN** se ejecuta `ancleto import` con un bundle válido
- **THEN** los activos portables quedan aplicados y el MCP apunta a rutas locales válidas
- **AND** al final se corre `doctor` y se reporta el resultado

### Requirement: Reparación in place sin bundle

The system SHALL regenerar las entradas MCP rotas del proyecto actual sin requerir bundle.

#### Scenario: Import con repair

- **WHEN** se ejecuta `ancleto import --repair` y una entrada MCP tiene `command` inexistente
- **THEN** solo esa entrada se regenera y las entradas sanas permanecen intactas
