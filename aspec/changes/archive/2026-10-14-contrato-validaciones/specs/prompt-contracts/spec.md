# Spec: prompt-contracts (delta)

## ADDED Requirements

### Requirement: Política de validaciones declarativa por proyecto

El contrato de validaciones del framework SHALL declararse por referencia a los comandos que el proyecto
declara en `PRODUCT.md` → `## Project Commands`, y NO SHALL hardcodear comandos de validación ni asumir
el tooling del proyecto. `templates/AGENTS.md` SHALL declarar esta política dentro de un bloque `LOCKED`
para que `install`/`upgrade` la re-apliquen. Las plantillas y skills que emiten o describen pasos de
verificación SHALL aplicar la misma política. Si un comando no está declarado, la validación SHALL
saltearse y registrar la omisión; NUNCA SHALL inventarse ni asumirse un runner, linter, formatter o
typechecker.

#### Scenario: Se corre solo lo que el proyecto declara

- **WHEN** el proyecto declara sus comandos de validación en `PRODUCT.md` → `## Project Commands`
- **THEN** las validaciones corren exactamente esos comandos
- **AND** no corren comandos que el proyecto no declaró

#### Scenario: Comando faltante se registra, no se inventa

- **WHEN** el proyecto no declara un comando de validación esperado
- **THEN** esa validación se saltea
- **AND** la omisión se registra explícitamente
- **AND** no se inventa ni se asume un comando sustituto

#### Scenario: Las superficies de skill referencian los comandos declarados

- **WHEN** se revisan las plantillas/skills que emiten pasos de verificación
  (`skills/ancleto-upgrade/references/templates.md`, `skills/ancleto-pr/SKILL.md`,
  `skills/ancleto-security/SKILL.md`, `skills/ancleto-upgrade/SKILL.md`)
- **THEN** referencian los comandos declarados por el proyecto en `PRODUCT.md` → `## Project Commands`
- **AND** no fijan un comando de validación concreto
- **AND** emiten cada verificación sólo si el proyecto declara su comando

#### Scenario: La fuente de verdad y sus guardrails no re-fijan comandos

- **WHEN** se revisan `PRODUCT.md` → `## Project Commands` y su sección de guardrails
  ("Critical Files & Guardrails")
- **THEN** la sección de guardrails alinea sus validaciones con `## Project Commands` y con el bloque
  `LOCKED` `validation-commands` de `AGENTS.md`
- **AND** no enumera comandos concretos stale (ni `typecheck` ni un formatter asumido) ni la nota de
  scripts inexistentes

#### Scenario: La política vive en un bloque LOCKED

- **WHEN** se re-aplica el template sobre un proyecto en `install`/`upgrade`
- **THEN** la política de validaciones se actualiza como bloque `LOCKED`
- **AND** el texto no es host-específico

### Requirement: Format check declarativo con `not-configured` por defecto

El contrato de prompts de los agentes SHALL correr un format check solo si el proyecto declara un
formatter. Si el proyecto no declara un formatter, el format check SHALL reportarse como
`not-configured` y NO SHALL tratarse como fallo. Los prompts de agente NO SHALL hardcodear un formatter
concreto (por ejemplo Prettier) ni asumir reglas de linter específicas.

#### Scenario: Proyecto sin formatter declarado

- **WHEN** el proyecto no declara un formatter en `## Project Commands`
- **THEN** el format check se reporta como `not-configured`
- **AND** no se corre Prettier ni ningún formatter asumido

#### Scenario: Los agentes usan el formatter declarado, no uno fijo

- **WHEN** se revisan `agents/coder.md` y `agents/tester.md`
- **THEN** referencian el formatter y el linter declarados por el proyecto
- **AND** no hardcodean Prettier ni ESLint

### Requirement: Invocación acotada de la suite de tests

Las validaciones de test SHALL ejecutarse mediante el comando declarado por el proyecto (por ejemplo
`npm test`) o con rutas explícitas a los archivos relevantes. NUNCA SHALL ejecutarse `node --test` sin
acotar, que descubre archivos fuera de la suite declarada.

#### Scenario: Suite vía el comando declarado

- **WHEN** el proyecto declara un comando de test
- **THEN** la suite se corre con ese comando

#### Scenario: Nunca `node --test` sin acotar

- **WHEN** se valida un conjunto acotado de archivos
- **THEN** se pasan rutas explícitas o se usa el comando declarado
- **AND** no se corre `node --test` pelado

### Requirement: Reconciliación de superficies mergeadas por bloques

Toda ruta que invoca `mergeLocked` sobre los templates raíz (`AGENTS.md` y `PRODUCT.md`,
`src/cli/index.js` → `TEMPLATES`) —`install`/`update`/`upgrade` (vía `copyTemplates`) e `import`— SHALL
reconciliar las superficies que el framework mergea por bloques antes de mergear, para que las
instalaciones existentes no conserven guía plana obsoleta junto al bloque canónico. NO SHALL existir una
ruta que mergee `TEMPLATES` sin reconciliar. Cuando el contrato de validaciones pase a vivir en un bloque
`LOCKED`, estas rutas SHALL eliminar la lista plana legada identificada del `AGENTS.md` del proyecto y
SHALL dejar sólo el bloque canónico, sin pasos manuales. La reconciliación SHALL ser segura (no elimina
contenido del usuario fuera del bloque legado identificado), idempotente (re-ejecutarla no duplica ni
rompe), host-neutral y sin nuevas dependencias de runtime.

#### Scenario: Instalación existente queda sin la guía vieja

- **WHEN** un proyecto ya instalado tiene la lista plana legada de validaciones en `AGENTS.md`
- **AND** se corre `ancleto upgrade` (o `install`/`update`)
- **THEN** la lista plana legada se elimina
- **AND** queda el bloque canónico `LOCKED: validation-commands`
- **AND** no coexisten la guía vieja y la nueva

#### Scenario: Importar un bundle también reconcilia la guía vieja

- **WHEN** se importa un bundle (`ancleto import`) cuyo `AGENTS.md` trae el bloque canónico
- **AND** el `AGENTS.md` del proyecto destino conserva la lista plana legada de validaciones
- **THEN** la lista plana legada se elimina antes del merge
- **AND** queda sólo el bloque canónico `LOCKED: validation-commands`
- **AND** no coexisten la guía vieja y la nueva

#### Scenario: Ninguna ruta mergea `TEMPLATES` sin reconciliar

- **WHEN** se revisan las rutas que invocan `mergeLocked` sobre `TEMPLATES` (`install`/`update`/`upgrade`
  en `copyTemplates`, e `import`)
- **THEN** todas ejecutan la reconciliación de bloques planos legados antes del merge

#### Scenario: La reconciliación es segura e idempotente

- **WHEN** el bloque legado fue personalizado o no coincide exactamente con la firma reconocida
- **THEN** no se elimina contenido fuera del bloque legado identificado
- **AND** se registra un aviso
- **AND** re-ejecutar la actualización no duplica ni rompe el archivo

#### Scenario: Superficies mergeadas vs copiadas enteras

- **WHEN** se actualiza el proyecto
- **THEN** `AGENTS.md`/`PRODUCT.md` (mergeados por bloque) se reconcilian
- **AND** los assets de skill (`.opencode/skills/`, copiados enteros) se regeneran

### Requirement: Cobertura de guardas del contrato de validaciones

Las pruebas de contenido SHALL asertar el comportamiento del contrato de validaciones: la existencia de
la política en su fuente única, la ausencia de un formatter o typecheck hardcodeado, y la referencia a
los comandos declarados por el proyecto. Los guards NO SHALL fijar la redacción literal de los prompts.
Estas guardas SHALL actualizarse en el mismo change que modifica el contrato.

#### Scenario: La política se asierta en su fuente única

- **WHEN** se revisa `test/content-guards.test.js`
- **THEN** asierta la política de validaciones declarativa en `templates/AGENTS.md`
- **AND** asierta que no hay comandos ni formatter hardcodeados

#### Scenario: Las salvaguardas conservan su cobertura

- **WHEN** se actualizan los guards del contrato de validaciones
- **THEN** los guards de las salvaguardas intocables (`bash:false`, cinco flags, Validation Ledger,
  bloqueo por CRITICAL) permanecen

#### Scenario: Las superficies de skill quedan cubiertas

- **WHEN** se revisa `test/content-guards.test.js`
- **THEN** asierta que `skills/ancleto-upgrade/references/templates.md`, `skills/ancleto-pr/SKILL.md`,
  `skills/ancleto-security/SKILL.md` y `skills/ancleto-upgrade/SKILL.md` no fijan comandos de validación
  concretos
- **AND** asierta que referencian los comandos declarados por el proyecto
- **AND** asierta que `PRODUCT.md` → `## Project Commands` y sus guardrails están alineados, sin
  `typecheck` ni formatter asumido

#### Scenario: `PRODUCT.md` no duplica la fuente única ni arrastra conteos stale

- **WHEN** se revisa `PRODUCT.md`
- **THEN** la sección de guardrails NO SHALL enumerar de nuevo los comandos de validación (referencia a
  `## Project Commands` y al bloque LOCKED `validation-commands`)
- **AND** el conteo de archivos de la suite NO SHALL estar stale respecto de `test/*.test.js`
