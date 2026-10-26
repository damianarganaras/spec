# Spec delta: memory-engine

Capability reutilizada: `memory-engine` ya es la dueña del render del bloque `<ProjectMemoryRules>` y del `<ContextOverflowWarning>`; el texto del aviso es su superficie, distinta de la delegación que hace el orquestador.

## ADDED Requirements

### Requirement: Aviso de overflow accionable para el orquestador

El `<ContextOverflowWarning>` emitido por `buildWorkingContext` SHALL nombrar únicamente capacidades que el orquestador tiene: SHALL indicar que se delegue un Recall a `@memory-keeper` con el topic de la tarea. NO SHALL referenciar `searchMemory` ni ninguna otra tool de la que el orquestador no disponga. El aviso SHALL conservar el conteo de reglas omitidas, el registro por consola y el presupuesto de caracteres vigentes.

#### Scenario: El aviso apunta a la delegación accionable

- **WHEN** el bloque de reglas se trunca por el límite de tamaño
- **THEN** el `<ContextOverflowWarning>` indica delegar un Recall a `@memory-keeper` con el topic de la tarea
- **AND** conserva la cantidad de reglas omitidas en el texto

#### Scenario: El aviso no nombra una tool ausente

- **WHEN** se genera el `<ContextOverflowWarning>`
- **THEN** el texto no menciona `searchMemory`
- **AND** un test asevera esa ausencia

#### Scenario: El resto del aviso no cambia

- **WHEN** se trunca el bloque de reglas
- **THEN** el aviso se registra por consola con el conteo de reglas omitidas
- **AND** el recorte sigue gobernado por `MAX_TOKENS` y `CHARS_PER_TOKEN`
