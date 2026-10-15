# Spec: prompt-contracts (delta)

## ADDED Requirements

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
