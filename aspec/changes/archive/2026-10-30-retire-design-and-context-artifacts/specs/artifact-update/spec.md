# Delta Spec: artifact-update

## MODIFIED Requirements

### Requirement: Actualización in-place de artifacts de un change existente ante cambios de definición

The system SHALL actualizar los artifacts de un change existente cuando cambia una definición, editando
el artifact dueño del cambio y preservando el contenido no mencionado. La clasificación SHALL ser:
requisito o comportamiento → `specs/<capability>/spec.md`; decisión de diseño → `proposal.md ##
Decisiones`; alcance → `proposal.md`; trabajo nuevo → `tasks.md`. `design.md` NO SHALL crearse ni
actualizarse. La operación SHALL ser un merge no destructivo, NO SHALL sobrescribir el artifact completo,
y SHALL ser idempotente.

#### Scenario: Cambia el alcance o el diseño

- **WHEN** la definición que cambió es el alcance del change
- **THEN** el artifact actualizado es `proposal.md`
- **AND** las secciones no afectadas se preservan
- **WHEN** la definición que cambió es una decisión de diseño
- **THEN** el artifact actualizado es `proposal.md`, en su sección `## Decisiones`
- **AND** NO se crea ni se actualiza un `design.md`

#### Scenario: Change legacy con artifacts retirados

- **WHEN** el change que se actualiza fue creado antes del retiro y todavía contiene `design.md` o
  `context.md`
- **THEN** esos archivos se tratan como legacy opcional, nunca como artifact dueño
- **AND** una decisión de diseño se escribe en `proposal.md ## Decisiones`, no en el `design.md` legacy
- **AND** el `design.md` y el `context.md` legacy se preservan in situ sin migrarse ni eliminarse

### Requirement: Límites de alcance de la actualización

The system SHALL limitar la actualización a los artifacts del change. NO SHALL modificar
`aspec/changes/archive/` ni los specs principales en `aspec/specs/` ni código de implementación. Cuando
el cambio de definición altera comportamiento especificado, SHALL ofrecer `ancleto-verify` al terminar.
Los `design.md` y `context.md` de un change archivado NO SHALL eliminarse, moverse ni reescribirse.

#### Scenario: Archive legacy intacto

- **WHEN** el nombre indicado resuelve a un change dentro de `aspec/changes/archive/`
- **THEN** la skill se detiene y lo reporta sin modificar nada
- **AND** un `design.md` o `context.md` dentro de un change archivado no se elimina, mueve ni reescribe
