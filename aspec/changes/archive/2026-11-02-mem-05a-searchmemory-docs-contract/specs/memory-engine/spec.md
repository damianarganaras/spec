# Delta: memory-engine — documentación del contrato preview

## MODIFIED Requirements

### Requirement: Coherencia entre contrato documentado e inyección

La documentación de producto y la descripción del campo `scope` de las tools MCP SHALL describir con precisión qué nodos se inyectan proactivamente: las `rule` activas con scope `project`. Las `decision` son reactivas. NO SHALL afirmarse que toda entrada de scope `project` (incluidas las `decision`) entra en `<ProjectMemoryRules>`. La documentación SHALL describir además la inyección día-cero: el bloque `<ProjectTopology>` se materializa e inyecta desde el día cero aunque no haya reglas ni base de memoria, y la descripción de la materialización del working-context SHALL coincidir con el comportamiento real de la CLI.

La documentación de producto SHALL describir `searchMemory` de forma consistente con
`Recall task-aware con orden total, preview expandible y keys requeridas`: SHALL indicar que el
modo por defecto devuelve una previsualización —prefijo literal de hasta 240 caracteres, `limit` 5
y `content_truncated`— y NO SHALL presentar el `content` completo como resultado por defecto.
SHALL nombrar `expand`, `keys` y `required` como las entradas de llamada que habilitan el
contenido completo, la expansión selectiva y la promoción de claves. La documentación de uso para
agentes SHALL remitirse al bloque canónico `LOCKED: memory-protocol` de `AGENTS.md`.

#### Scenario: El README no promete inyección de decisiones

- **WHEN** se revisa la descripción de scopes en `README.md`
- **THEN** el texto indica que las `rule` con scope `project` entran en `<ProjectMemoryRules>`
- **AND** no afirma que las `decision` entren al bloque

#### Scenario: La descripción del schema coincide

- **WHEN** se inspecciona la descripción del campo `scope` de las tools MCP
  (`src/core/memory/tools.js`)
- **THEN** describe el alcance de `project` de forma consistente con el comportamiento real
  (rules proactivas; decisions reactivas)

#### Scenario: El README no se contradice sobre el día-cero

- **WHEN** se comparan las secciones del README que describen la materialización del working-context
- **THEN** ambas coinciden con la implementación: la topología se inyecta desde el día cero (con o sin reglas)
- **AND** ninguna condiciona la materialización a la existencia previa de memoria

#### Scenario: El README describe el modo preview por defecto

- **WHEN** se revisa la fila de `searchMemory` en `README.md`
- **THEN** indica que el modo por defecto devuelve una previsualización con `limit` 5 y
  `content_truncated`
- **AND** no presenta el `content` completo como resultado por defecto

#### Scenario: El README nombra las entradas de expansión y requisitos

- **WHEN** se revisa la fila de `searchMemory` en `README.md`
- **THEN** nombra `expand`, `keys` y `required`
- **AND** describe el preview como un prefijo literal de hasta 240 caracteres

#### Scenario: El README remite al protocolo canónico

- **WHEN** se revisa la descripción de uso de `searchMemory` en `README.md`
- **THEN** remite al bloque `LOCKED: memory-protocol` de `AGENTS.md` como fuente del protocolo para
  agentes
