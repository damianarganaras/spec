# Spec: memory-engine (delta)

## ADDED Requirements

### Requirement: Materialización día-cero del working-context con topología

El CLI NO SHALL omitir la materialización de `.ancleto/working-context.md` por la sola ausencia de `.ancleto/memory.db`. Aunque no exista la base o no haya reglas activas, cuando exista un `.discovery-map.json` en la raíz del proyecto el CLI SHALL escribir el bloque `<ProjectTopology>` en el working-context, creando `.ancleto/` si falta. El bloque `<ProjectTopology>` NO depende de la base de memoria ni de reglas. La construcción de la topología sin base SHALL realizarse sin abrir el motor. El comportamiento de `buildWorkingContext` (firma, default de `cwd` y resultado nulo sin topología y sin reglas) SHALL permanecer sin cambios: la materialización día-cero vive en la capa CLI.

#### Scenario: Repo nuevo sin memoria materializa la topología

- **WHEN** no existe `.ancleto/memory.db`
- **AND** existe un `.discovery-map.json` en la raíz
- **THEN** el CLI materializa `.ancleto/working-context.md` con el bloque `<ProjectTopology>`
- **AND** crea `.ancleto/` si no existía

#### Scenario: Sin topología ni reglas no se crea contenido ficticio

- **WHEN** no existe `.ancleto/memory.db` ni un `.discovery-map.json` válido
- **THEN** el CLI no escribe un bloque con contenido ficticio

#### Scenario: El motor conserva su contrato

- **WHEN** se invoca `buildWorkingContext` sin topología y sin reglas activas
- **THEN** sigue devolviendo `null`
- **AND** su firma y el default `cwd = process.cwd()` no cambian

## MODIFIED Requirements

### Requirement: Coherencia entre contrato documentado e inyección

La documentación de producto y la descripción del campo `scope` de las tools MCP SHALL describir con precisión qué nodos se inyectan proactivamente: las `rule` activas con scope `project`. Las `decision` son reactivas. NO SHALL afirmarse que toda entrada de scope `project` (incluidas las `decision`) entra en `<ProjectMemoryRules>`. La documentación SHALL describir además la inyección día-cero: el bloque `<ProjectTopology>` se materializa e inyecta desde el día cero aunque no haya reglas ni base de memoria, y la descripción de la materialización del working-context SHALL coincidir con el comportamiento real de la CLI.

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
