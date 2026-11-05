# Spec: copilot-support

## ADDED Requirements

### Requirement: Instalación de prompts de Copilot

El sistema SHALL instalar los agentes y comandos como prompt files de Copilot cuando el agente configurado es `copilot`. El sistema SHALL escribir la configuración MCP de proyecto en `copilot-mcp.json` con esquema `{ "mcp": { "<name>": { ... } } }`, resuelta desde el descriptor único de destino MCP por host.

`init --agent copilot`, `install --agent copilot`, `update --agent copilot` e `import`/`import --repair` con host activo `copilot` SHALL escribir `copilot-mcp.json` y NO SHALL crear ni escribir `.opencode/opencode.json`. `upgrade --agent copilot` SHALL refrescar `copilot-mcp.json` sin crear ni escribir `.opencode/opencode.json`.

El merge SHALL ser no destructivo e idempotente: SHALL agregar sólo nombres ausentes, preservar entradas y claves preexistentes y NO SHALL borrar el archivo. En `install`/`init`, un `copilot-mcp.json` inválido SHALL avisarse sin sobrescribirse. En `import`/`import --repair`, un `copilot-mcp.json` no parseable SHALL avisarse nombrando el archivo y SHALL sobrescribirse con la configuración nueva, sin abortar.

#### Scenario: Install con agente copilot

- **WHEN** se ejecuta `ancleto install --agent copilot` en un proyecto
- **THEN** se crean `.github/prompts/*.prompt.md` generados desde `agents/*.md` y `commands/*.md` con instrucciones idénticas
- **AND** se crea `copilot-mcp.json` con los MCP habilitados mediante merge no destructivo
- **AND** NO SHALL crearse ni escribirse `.opencode/opencode.json` por ese motivo

#### Scenario: Init con agente copilot

- **WHEN** se ejecuta `ancleto init --agent copilot` en un proyecto vacío
- **THEN** se crea `copilot-mcp.json` con los MCP habilitados
- **AND** NO SHALL crearse ni escribirse `.opencode/opencode.json` por ese motivo
- **AND** el comando completa con exit 0

#### Scenario: Merge no destructivo

- **WHEN** existe `copilot-mcp.json` con un servidor propio y se instala con `agent: copilot`
- **THEN** el servidor propio y las claves preexistentes permanecen intactos
- **AND** sólo se agregan los servidores ausentes

#### Scenario: `import --repair` con `copilot` no crea `.opencode/opencode.json`

- **WHEN** se ejecuta `import --repair` con host activo `copilot`
- **THEN** el CLI escribe o repara `copilot-mcp.json`
- **AND** NO SHALL crear `.opencode/opencode.json`
- **AND** ejecutar el mismo `import --repair` dos veces NO SHALL cambiar el resultado

#### Scenario: Un `copilot-mcp.json` inválido en install no se sobrescribe

- **WHEN** existe un `copilot-mcp.json` que no es JSON válido y se ejecuta `install --agent copilot`
- **THEN** el CLI emite un aviso
- **AND** NO SHALL sobrescribir el archivo

#### Scenario: Un `copilot-mcp.json` no parseable en import se avisa y se reemplaza

- **WHEN** existe un `copilot-mcp.json` que no es JSON válido y se ejecuta `import --repair` con host activo `copilot`
- **THEN** el CLI emite un aviso que nombra el archivo
- **AND** lo sobrescribe con la configuración MCP nueva
- **AND** el comando no aborta

#### Scenario: Upgrade después de install es idempotente

- **WHEN** se ejecuta `upgrade --agent copilot` después de `install --agent copilot`
- **THEN** `copilot-mcp.json` conserva el mismo conjunto de entradas
- **AND** NO SHALL crearse `.opencode/opencode.json`

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
