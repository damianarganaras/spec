# Spec delta: clarify-project-memory-rules-decisions

## ADDED Requirements

### Requirement: Alcance del bloque de reglas proactivas

El bloque `<ProjectMemoryRules>` SHALL contener únicamente nodos activos de tipo `rule` (con el
filtrado active/superseded y el orden existentes). Los nodos `decision`, cualquiera sea su
scope, NO SHALL inyectarse proactivamente en ese bloque. La recuperación de decisions SHALL
permanecer reactiva vía `searchMemory`.

#### Scenario: Las decisiones con scope project no entran al bloque

- **WHEN** existe una `decision` activa con scope `project`
- **THEN** el bloque `<ProjectMemoryRules>` no la incluye
- **AND** esa decision sigue siendo recuperable con `searchMemory`

#### Scenario: Las reglas con scope project siguen entrando

- **WHEN** existe una `rule` activa con scope `project`
- **THEN** el bloque `<ProjectMemoryRules>` la incluye

#### Scenario: Scope no-project no se inyecta en el contexto de project

- **WHEN** existe una `rule` activa con scope `feature` o `task`
- **AND** se construye el contexto para scope `project`
- **THEN** el bloque no la incluye

### Requirement: Coherencia entre contrato documentado e inyección

La documentación de producto y la descripción del campo `scope` de las tools MCP SHALL describir
con precisión qué nodos se inyectan proactivamente: las `rule` activas con scope `project`. Las
`decision` son reactivas. NO SHALL afirmarse que toda entrada de scope `project` (incluidas las
`decision`) entra en `<ProjectMemoryRules>`.

#### Scenario: El README no promete inyección de decisiones

- **WHEN** se revisa la descripción de scopes en `README.md`
- **THEN** el texto indica que las `rule` con scope `project` entran en `<ProjectMemoryRules>`
- **AND** no afirma que las `decision` entren al bloque

#### Scenario: La descripción del schema coincide

- **WHEN** se inspecciona la descripción del campo `scope` de las tools MCP
  (`src/core/memory/tools.js`)
- **THEN** describe el alcance de `project` de forma consistente con el comportamiento real
  (rules proactivas; decisions reactivas)
