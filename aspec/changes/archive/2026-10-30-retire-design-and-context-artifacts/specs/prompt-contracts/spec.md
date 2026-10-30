# Delta Spec: prompt-contracts

## ADDED Requirements

### Requirement: Retiro de `design.md` y `context.md` sin artifact sucesor

Ningún generador de artifacts SHALL producir `design.md` ni `context.md` en un change nuevo. Ningún
consumidor SHALL exigirlos como precondición ni reportar su ausencia como artifact faltante. El retiro
NO SHALL introducir un artifact sucesor ni un archivo de diseño renombrado: una decisión durable SHALL
registrarse en `proposal.md ## Decisiones`, con la forma que define `agents/spec-writer.md`. La lectura de
un `design.md` o `context.md` legacy SHALL permanecer disponible como opcional, y ningún artifact de un
change archivado SHALL eliminarse, migrarse ni reescribirse. Al archivar, el directorio del change SHALL
moverse sin modificarse.

#### Scenario: Generador de un change nuevo

- **WHEN** cualquiera de los generadores de artifacts escribe los artifacts de un change nuevo
- **THEN** no produce `design.md` ni `context.md`
- **AND** una decisión durable se escribe en `proposal.md ## Decisiones`
- **AND** no se crea ningún artifact sucesor para el diseño

#### Scenario: Consumidor ante un change nuevo

- **WHEN** un consumidor de artifacts (`@coder`, `@tester`, `@reviewer`, `@documenter`, `@orchestrator`,
  `ancleto-apply`, `ancleto-verify`, `ancleto-bulk-archive`) procesa un change nuevo que no tiene
  `design.md` ni `context.md`
- **THEN** no los reporta como artifact faltante ni condiciona el flujo a su presencia
- **AND** la verificación de completitud se apoya en `tasks.md` y en `specs/`

#### Scenario: Change legacy con artifacts retirados

- **WHEN** un change, activo o archivado, contiene un `design.md` o un `context.md` de una versión previa
- **THEN** se leen como legacy opcional
- **AND** no se eliminan, migran ni reescriben
- **AND** las decisiones históricas ya respaldadas en memoria siguen siendo recuperables

#### Scenario: Archive sin borrado de scaffold legacy

- **WHEN** se archiva un change activo que todavía contiene un `context.md` legacy
- **THEN** el directorio del change se mueve sin modificarse
- **AND** el `context.md` legacy no se borra
