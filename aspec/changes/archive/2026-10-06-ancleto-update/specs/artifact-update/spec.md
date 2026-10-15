## ADDED Requirements

### Requirement: Actualización in-place de artifacts de un change existente ante cambios de definición

The system SHALL actualizar los artifacts de un change existente cuando cambia una definición, editando
el artifact dueño del cambio y preservando el contenido no mencionado. La clasificación SHALL ser:
requisito o comportamiento → `specs/<capability>/spec.md`; decisión de diseño → `design.md`; alcance →
`proposal.md`; trabajo nuevo → `tasks.md`. La operación SHALL ser un merge no destructivo, NO SHALL
sobrescribir el artifact completo, y SHALL ser idempotente.

#### Scenario: Un requisito cambia

- **WHEN** la definición que cambió es un requisito o comportamiento
- **THEN** el artifact actualizado es el delta spec `specs/<capability>/spec.md`
- **AND** el cambio se expresa con `## MODIFIED Requirements` sin copiar escenarios existentes
- **AND** el contenido no mencionado del delta spec se preserva

#### Scenario: Cambia el alcance o el diseño

- **WHEN** la definición que cambió es el alcance del change
- **THEN** el artifact actualizado es `proposal.md`
- **AND** las secciones no afectadas se preservan
- **WHEN** la definición que cambió es una decisión de diseño
- **THEN** el artifact actualizado es `design.md`

#### Scenario: Aparece trabajo nuevo

- **WHEN** el cambio de definición agrega trabajo de implementación
- **THEN** las tareas nuevas se agregan al final de su fase en `tasks.md`
- **AND** las tareas ya marcadas `- [x]` se preservan
- **AND** no se reordenan las tareas existentes

#### Scenario: Idempotencia

- **WHEN** se ejecuta la actualización dos veces con el mismo cambio de definición
- **THEN** el resultado es el mismo en ambas corridas

### Requirement: Detección de drift entre los delta specs y los specs principales

The system SHALL detectar el drift entre cada delta spec del change y el spec principal de la misma
capability en `aspec/specs/<capability>/spec.md`, reportando los requirements del delta que están
ausentes o cambiados en el principal, y SHALL proponer su realineación. La detección de drift SHALL ser
aditiva a los cambios que el usuario describe y NO SHALL sustituirlos.

#### Scenario: Requirement del delta ausente en el spec principal

- **WHEN** un requirement del delta spec del change no existe en el spec principal de esa capability
- **THEN** se reporta el drift con el requirement afectado
- **AND** se propone realinear el delta con el principal

#### Scenario: Drift más cambio descrito por el usuario

- **WHEN** existe drift y además el usuario describe un cambio en la definición
- **THEN** se aplican ambos: la realineación del drift y el cambio descrito
- **AND** no se omite ninguno de los dos

### Requirement: Elección del modo de escritura al ejecutar

The system SHALL preguntar al usuario, al ejecutar la actualización, si el modo de escritura es
in-place o `rev2`, y NO SHALL elegir el modo por sí mismo.

#### Scenario: Modo in-place

- **WHEN** el usuario elige el modo in-place
- **THEN** el artifact se edita en su lugar
- **AND** se agrega una entrada con el cambio aplicado al `## Change Log` de `proposal.md`

#### Scenario: Modo `rev2`

- **WHEN** el usuario elige el modo `rev2`
- **THEN** solo los artifacts afectados se escriben bajo `aspec/changes/<name>/rev2/` con la misma ruta relativa
- **AND** los artifacts originales quedan intactos
- **AND** se escribe `rev2/README.md` con el motivo, la fecha y el origen del cambio

### Requirement: Límites de alcance de la actualización

The system SHALL limitar la actualización a los artifacts del change. NO SHALL modificar
`aspec/changes/archive/` ni los specs principales en `aspec/specs/` ni código de implementación. Cuando
el cambio de definición altera comportamiento especificado, SHALL ofrecer `ancleto-verify` al terminar.

#### Scenario: Change archivado

- **WHEN** el nombre indicado resuelve a un change dentro de `aspec/changes/archive/`
- **THEN** la skill se detiene y lo reporta sin modificar nada

#### Scenario: Sin selección automática del change

- **WHEN** el change no está indicado y la inferencia desde el contexto es ambigua
- **THEN** se listan los changes disponibles y se pregunta al usuario
- **AND** no se auto-selecciona ninguno

#### Scenario: Cambió comportamiento especificado

- **WHEN** la actualización modifica un requisito o comportamiento especificado
- **THEN** la skill ofrece ejecutar `ancleto-verify` al terminar
