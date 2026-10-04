# Spec delta: memory-engine

## ADDED Requirements

### Requirement: Procedencia de escritura gestionada por el runtime

El motor SHALL registrar la procedencia de cada nodo en la columna `source`, resuelta
**exclusivamente** desde el contexto de runtime confiable. Un valor `source` presente en el input
del caller (args de tool o argumento directo a `recordNode`) NO SHALL tener efecto sobre la
procedencia persistida. Cada superficie de escritura confiable SHALL registrar un valor de
procedencia propio y estable que la identifique:

- `mcp:ancleto-memory` — escrituras vía las tools MCP (`recordRule`, `recordDecision`).
- `cli:import` — escrituras vía `ancleto memory import`.
- `runtime` — uso programático del engine sin contexto de procedencia explícito.
- `agent:<rol>` — cuando el runtime confiable provee una identidad de agente (nunca el caller).

`source` NO SHALL aparecer en las firmas JSON Schema de entrada de las tools MCP.

#### Scenario: Un source forjado en los args no tiene efecto

- **WHEN** el caller invoca una tool MCP (o `recordNode`) incluyendo un `source` propio
- **THEN** el nodo persistido conserva el `source` resuelto por el runtime
- **AND** el valor forjado no se almacena

#### Scenario: Procedencia de la superficie MCP

- **WHEN** se registra un nodo mediante `recordRule` o `recordDecision` a través del server MCP
- **THEN** el nodo persistido tiene `source = 'mcp:ancleto-memory'`

#### Scenario: Procedencia de la superficie de import

- **WHEN** `ancleto memory import` inserta o actualiza un nodo
- **THEN** el nodo persistido tiene `source = 'cli:import'`

#### Scenario: Procedencia por defecto del runtime

- **WHEN** se invoca `engine.recordNode(...)` sin un contexto de procedencia
- **THEN** el nodo persistido tiene `source = 'runtime'`

### Requirement: Exposición de procedencia en la lectura de operador

La lectura del motor orientada al LLM (`searchMemory`) SHALL seguir excluyendo los campos
gestionados por el runtime, incluido `source`. La lectura de operador (`listNodes`, usada por
`ancleto memory list`) SHALL exponer `source` como campo de solo lectura en cada nodo devuelto,
de modo que la procedencia sea auditable. La exposición NO SHALL modificar las firmas JSON Schema
de entrada de las tools MCP.

#### Scenario: La lectura de operador incluye la procedencia

- **WHEN** se invoca `listNodes()` sobre una memoria con nodos activos
- **THEN** cada nodo devuelto incluye el campo `source`

#### Scenario: La lectura del LLM sigue ocultando los campos del runtime

- **WHEN** se invoca `searchMemory()`
- **THEN** el resultado NO incluye `source`, `confidence`, `status` ni `id`

#### Scenario: El JSON del CLI expone la procedencia

- **WHEN** se ejecuta `ancleto memory list --json`
- **THEN** cada nodo del JSON incluye el campo `source`

#### Scenario: Las firmas MCP no exponen la procedencia

- **WHEN** se serializan los `inputSchema` de las tools MCP
- **THEN** ninguno contiene `source`, `confidence`, `status` ni `id`

### Requirement: Frontera entre procedencia y enforcement

La procedencia SHALL ser un dato **descriptivo de auditoría**. El motor NO SHALL usar `source`
para autorizar ni denegar escrituras, y NO SHALL tratar como verificada una identidad de actor
auto-declarada por el caller. En la arquitectura actual (MCP sobre stdio, sin canal de identidad
autenticado), la superficie de escritura del runtime es el único actor registrable; el rol del
LLM NO SHALL registrarse como si estuviera autenticado. La implementación de enforcement de
ownership SHALL quedar fuera de este change.

#### Scenario: La procedencia no autoriza escrituras

- **WHEN** se registra un nodo desde cualquier superficie confiable
- **THEN** el motor lo persiste sin evaluar `source` como condición de autorización

#### Scenario: La procedencia describe la superficie, no el rol del LLM

- **WHEN** se audita la procedencia de un nodo escrito por una tool MCP
- **THEN** la procedencia identifica la superficie de escritura (`mcp:ancleto-memory`)
- **AND** no afirma una identidad de rol del LLM como verificada
