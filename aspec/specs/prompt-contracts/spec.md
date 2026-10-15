# Spec: prompt-contracts

## Purpose

Contratos de los prompts del framework (orquestador, agentes, skills y `AGENTS.md`) bajo el principio
de ownership único: cada regla vive en una sola superficie canónica, el destilado del contexto entre
tramos preserva los artefactos de control y la evidencia, las instrucciones específicas de host no se
filtran al texto compartido, y todo recorte de tokens se gobierna con un baseline reproducible sin
degradar las salvaguardas del flujo.

## Requirements

### Requirement: Fuente única de las reglas compartidas entre skill y agente

Toda regla que hoy se declare tanto en una skill como en un agente SHALL tener una única fuente canónica. Las reglas compartidas por todos los agentes del proyecto SHALL vivir en `AGENTS.md`; la superficie que las consumía SHALL referenciarlas en lugar de repetir su texto. Ningún prompt SHALL duplicar texto normativo ya presente en su fuente canónica.

#### Scenario: Una regla compartida deja de estar duplicada

- **WHEN** una regla que era declarada en dos superficies (skill y agente) se mueve a su fuente canónica
- **THEN** existe una sola declaración de la regla
- **AND** la otra superficie la referencia sin repetir su texto

#### Scenario: La regla de idioma vive en la fuente canónica

- **WHEN** se revisa la regla de idioma de los artifacts
- **THEN** vive en el bloque `LOCKED: artifacts-language` de `AGENTS.md`
- **AND** las skills y agentes que escriben artifacts la referencian en lugar de redeclararla

#### Scenario: La frescura del seed no se re-declara en cada superficie

- **WHEN** se revisa la regla de frescura del seed al archivar
- **THEN** tiene un único hogar canónico
- **AND** la otra superficie la referencia sin repetir el texto

### Requirement: Ausencia de duplicación de secciones en el orquestador

El orquestador SHALL declarar cada regla una sola vez. La restricción de runtime (plan/read-only) SHALL tener un único hogar canónico. El contrato de salida de cada subagente SHALL vivir en el propio agente, y el orquestador SHALL referenciarlo en lugar de re-enumerar sus campos.

#### Scenario: Runtime Safety con un único hogar

- **WHEN** se revisa el orquestador
- **THEN** la regla de plan/read-only aparece declarada una sola vez
- **AND** la sección de Workflow sólo conserva el punto de control, sin repetir la regla

#### Scenario: El contrato de salida no se re-enumera

- **WHEN** el orquestador describe la salida esperada de un subagente
- **THEN** referencia el contrato de salida del propio agente
- **AND** no re-lista los campos que el agente ya declara

#### Scenario: Los agentes conservan su contrato de salida

- **WHEN** se deduplica el orquestador
- **THEN** cada agente conserva su sección de Output Expectations y su `**Output cap**`

### Requirement: Destilado por tramo del Resolved Context Envelope

El orquestador NO SHALL reinyectar el Resolved Context Envelope verbatim a cada subagente. SHALL pasar a cada tramo sólo los campos que ese tramo necesita, y SHALL preservar siempre: (a) los cinco artefactos de control — `task-owned files`, `Validation Ledger`, `SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED`, `GUARANTEE NOT SUSTAINED` — y (b) la evidencia como `file:line`. El contrato de destilado SHALL declararse en una única sección del orquestador.

#### Scenario: El envelope llega destilado, no verbatim

- **WHEN** el orquestador delega una etapa a un subagente
- **THEN** le pasa los campos que ese tramo necesita
- **AND** no le pasa el envelope completo verbatim

#### Scenario: Los cinco artefactos de control se preservan

- **WHEN** se destila el retorno de un subagente
- **THEN** `task-owned files`, `Validation Ledger`, `SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED` y `GUARANTEE NOT SUSTAINED` se conservan íntegros cuando están presentes

#### Scenario: La evidencia viaja como field

- **WHEN** se pasa evidencia entre tramos
- **THEN** se hace como `file:line` para código y como entradas de ledger para comandos
- **AND** no se copia prosa, logs ni diffs

#### Scenario: Falta de contexto no se resuelve delegando una consulta

- **WHEN** un subagente reporta que le falta contexto
- **THEN** el orquestador le aporta el campo faltante o se detiene
- **AND** no le indica consultar Azure DevOps

### Requirement: Instrucciones específicas de host fuera del texto compartido

Toda instrucción específica de un host SHALL materializarse sólo en superficies de ese host y NO SHALL escribirse en texto compartido entre hosts (por ejemplo `AGENTS.md` o assets copiados verbatim a todos los hosts).

#### Scenario: Sin instrucción de host en texto compartido

- **WHEN** un host no dispone de una capacidad (por ejemplo una tool de compresión)
- **THEN** ningún asset compartido entre hosts contiene una instrucción que suponga esa capacidad

#### Scenario: La instrucción vive sólo donde existe la tool

- **WHEN** un host dispone de la tool
- **THEN** la instrucción de uso se materializa sólo en las superficies de ese host

### Requirement: Gobernanza del presupuesto de tokens de los prompts

Todo recorte de tokens del contrato de prompts SHALL validarse contra un baseline reproducible. El baseline SHALL registrar la duración de la suite de tests, el consumo medido por `ancleto stats` y el registro de RR/escapes de los changes recientes, con la métrica Q = (1−RR)(1−escapes). Un recorte SHALL aceptarse sólo si ΔQ ≥ 0; si ΔQ < 0, SHALL revertirse.

#### Scenario: El baseline es reproducible

- **WHEN** inicia el change
- **THEN** existe un baseline registrado con la suite cronometrada, el consumo de `ancleto stats` y RR/escapes

#### Scenario: Criterio de aceptación de un recorte

- **WHEN** se mide un recorte de tokens
- **THEN** se acepta sólo si ΔQ ≥ 0
- **AND** se revierte si ΔQ < 0

### Requirement: Salvaguardas intocables por el recorte

Ningún recorte de tokens SHALL eliminar ni degradar las salvaguardas del flujo: la verificación de garantías bajo el modelo real, la verificación de los afectados (no sólo los archivos tocados), `bash:false` en reviewer/orchestrator/spec-writer, el Validation Ledger y los cinco flags, el bloqueo por CRITICAL y el baseline reproducible.

#### Scenario: Las salvaguardas sobreviven al recorte

- **WHEN** se deduplican o destilan prompts
- **THEN** cada salvaguarda protegida sigue vigente
- **AND** cada una queda cubierta por un assert de comportamiento

### Requirement: Asserts de comportamiento en los content guards

Las pruebas de contenido SHALL asertar el comportamiento requerido mediante keywords de comportamiento y la presencia de las salvaguardas, y NO SHALL fijar la redacción literal de los prompts.

#### Scenario: La regla movida se asierta en su fuente única

- **WHEN** una regla compartida se mueve a su fuente canónica
- **THEN** el guard asierta el keyword de comportamiento en la fuente única
- **AND** deja de exigir el literal en la superficie que ahora la referencia

#### Scenario: Relajar un assert no elimina la cobertura

- **WHEN** se relaja un assert a keywords de comportamiento
- **THEN** la salvaguarda que cubría sigue teniendo un assert de comportamiento

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
