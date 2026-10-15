# Spec: agent-install-routing (delta)

## ADDED Requirements

### Requirement: Compresión por defecto con uso condicional host-scoped y compuerta de medición

El CLI SHALL configurar el MCP de compresión (caveman) por defecto cuando su binario esté disponible, como configuración del host (`opencode.json` para `opencode`, `.agents/mcp_config.json` para `antigravity`), sin introducir configuración MCP de host fuera de esa excepción. La directiva de uso de la compresión SHALL ser condicional al host: SHALL materializarse sólo en superficies de un host cuya configuración MCP incluya la tool de compresión y NO SHALL escribirse en texto compartido entre hosts. El default SHALL ser reversible a opt-in mediante una compuerta de medición: si el consumo neto medido con `ancleto stats` no desciende en la ventana de observación definida, el default SHALL volver a opt-in.

#### Scenario: Default cuando el binario está disponible

- **WHEN** se instala y el binario de caveman está disponible en el sistema
- **THEN** el CLI configura el MCP de compresión para el host
- **AND** no agrega configuración MCP de host fuera de `opencode`/`antigravity`

#### Scenario: La directiva de uso no se filtra a texto compartido

- **WHEN** se instala para un host que no incluye la tool de compresión
- **THEN** ningún asset compartido entre hosts contiene la directiva de uso de la compresión

#### Scenario: La directiva vive sólo donde existe la tool

- **WHEN** se instala para un host cuya configuración MCP incluye la tool de compresión
- **THEN** la directiva de uso se materializa sólo en las superficies de ese host

#### Scenario: La compuerta revierte a opt-in

- **WHEN** la medición con `ancleto stats` no observa un descenso neto en la ventana definida
- **THEN** el default de caveman se revierte a opt-in

## MODIFIED Requirements

### Requirement: Configuración MCP específica de host fuera de alcance

El CLI NO SHALL generar ni transformar configuración MCP específica de host como parte del ruteo multi-agente, con una **única excepción**: para `agent: antigravity` el CLI SHALL generar o mergear el MCP de
workspace `.agents/mcp_config.json` (ver `antigravity-support`). El MCP de compresión (caveman) y el de memoria propia se configuran como servidores MCP del host por defecto (`opencode.json` para `opencode` y el de workspace para `antigravity`); no habilitan configuración MCP de host nueva para el resto de los hosts. `.mcp.json` (Claude) y `.vscode/mcp.json`
(VS Code) SHALL quedar fuera de alcance. El CLI NO SHALL borrar ni pisar configuración MCP preexistente del
usuario.

#### Scenario: El ruteo no genera config MCP de host fuera de la excepción

- **WHEN** se instala con un host soportado distinto de `antigravity`
- **THEN** el CLI NO SHALL crear `.mcp.json` ni `.vscode/mcp.json`
- **AND** la configuración MCP preexistente del usuario se conserva

#### Scenario: `antigravity` sí obtiene su MCP de workspace

- **WHEN** se instala con `agent: antigravity`
- **THEN** el CLI crea o actualiza `.agents/mcp_config.json`
- **AND** el contenido preexistente de `mcpServers` no se pisa

#### Scenario: caveman no habilita MCP de host nuevo fuera de la excepción

- **WHEN** se instala con el binario de caveman disponible en un host distinto de `opencode` y `antigravity`
- **THEN** el CLI conserva el MCP de compresión como comportamiento por defecto del host permitido
- **AND** NO SHALL crear configuración MCP de host nueva para ese otro host
