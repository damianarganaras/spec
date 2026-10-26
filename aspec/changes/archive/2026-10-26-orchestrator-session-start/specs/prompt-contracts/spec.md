# Spec delta: prompt-contracts

Capability reutilizada: `prompt-contracts` ya es la dueña del contrato del prompt del orquestador (reglas de runtime, deduplicación, destilado y salvaguardas); R1, R2 y la delegación de R3 son contrato del orquestador, no un dominio nuevo.

## ADDED Requirements

### Requirement: Intake de sesión con estado del árbol y changes activos

Al inicio de sesión, el orquestador SHALL detectar los changes activos en `aspec/changes/` excluyendo `archive/` y SHALL reportarlos únicamente cuando alguno de ellos difiera del change solicitado. Cuando el pedido toque el estado del repositorio, el orquestador SHALL delegar `git status --short` a un agente con shell, porque el orquestador no dispone de shell. Cuando el árbol esté limpio y no exista un change activo ajeno, el orquestador NO SHALL emitir reporte alguno.

#### Scenario: Un change activo ajeno se reporta

- **WHEN** al iniciar la sesión existe en `aspec/changes/` un change activo distinto del solicitado
- **THEN** el orquestador lo reporta antes de continuar con el pedido

#### Scenario: El estado del árbol se delega a un agente con shell

- **WHEN** el pedido toca el estado del repositorio
- **THEN** el orquestador delega `git status --short` a un agente con shell
- **AND** no intenta ejecutarlo por sí mismo

#### Scenario: Sin nada que reportar no hay salida

- **WHEN** el árbol está limpio
- **AND** no existe un change activo ajeno al solicitado
- **THEN** el orquestador no emite reporte de intake
- **AND** continúa con el pedido sin costo adicional

_No-testeable-por-construcción: la ausencia de reporte es una no-acción sin salida observable; no existe artefacto que pruebe el silencio. Se ancla con un content guard que fija la condición de silencio en el contrato del orquestador._

### Requirement: Exención acotada de lecturas para archivos nombrados por el usuario

El párrafo del techo de lecturas de `agents/orchestrator.md` SHALL declarar, dentro del mismo párrafo y junto al techo de tres archivos, que los archivos que el usuario nombra explícitamente en su mensaje están exentos del techo con un tope de 5 por turno; al superar el tope, la lectura SHALL delegarse en lugar de ejecutarse directamente. El mismo párrafo SHALL conservar la exención de las lecturas proactivas ya vigentes. Ninguna afirmación absoluta del prompt del orquestador SHALL contradecir esta exención.

#### Scenario: Los archivos nombrados por el usuario no consumen el techo

- **WHEN** el usuario nombra explícitamente hasta 5 archivos en su mensaje
- **THEN** el orquestador los lee directamente
- **AND** esas lecturas no consumen el techo de tres archivos de contexto no dirigido

#### Scenario: Por encima del tope la lectura se delega

- **WHEN** el usuario nombra explícitamente más archivos que el tope de 5 en un turno
- **THEN** la lectura que excede el tope se delega
- **AND** el orquestador no la ejecuta directamente

#### Scenario: La exención vive en el párrafo del techo

- **WHEN** se revisa la sección del techo de lecturas en `agents/orchestrator.md`
- **THEN** la exención de archivos nombrados por el usuario, su tope de 5 y la delegación por encima del tope están en el mismo párrafo que el techo
- **AND** no aparecen como una regla separada que el techo pueda contradecir

#### Scenario: No queda texto absoluto que contradiga la exención

- **WHEN** se revisan todas las afirmaciones del techo de lecturas en `agents/orchestrator.md`
- **THEN** ninguna prohíbe en términos absolutos leer archivos nombrados por el usuario dentro del tope
- **AND** las referencias a "cuarto archivo" quedan reconciliadas con la exención

_No-testeable-por-construcción: la ausencia de texto contradictorio es una propiedad negativa del contenido y no un comportamiento ejecutable; se ancla con un content guard que asierta la reconciliación del techo y la presencia de la exención acotada, sin fijar la redacción literal._

> Pendiente de design: quedan sin definir en este spec (1) si "5 por turno" significa por mensaje del usuario o acumulado a lo largo de la sesión, y (2) qué agente recibe la lectura delegada al superar el tope.

### Requirement: Recall delegado ante `<ContextOverflowWarning>`

Cuando el contexto de trabajo contenga un `<ContextOverflowWarning>`, el orquestador SHALL delegar un único Recall a `@memory-keeper` con el topic de la tarea, antes de delegar cualquier otra etapa. El orquestador NO SHALL llamar `searchMemory` directamente ni delegarla a un agente distinto de `@memory-keeper`.

#### Scenario: El warning dispara un Recall previo

- **WHEN** el contexto de trabajo contiene un `<ContextOverflowWarning>`
- **THEN** el orquestador delega un Recall a `@memory-keeper` con el topic de la tarea
- **AND** lo hace antes de delegar el resto de las etapas

#### Scenario: Un solo Recall por warning

- **WHEN** el orquestador procesa un `<ContextOverflowWarning>`
- **THEN** delega exactamente un Recall
- **AND** no repite la delegación por el mismo warning

#### Scenario: El orquestador no toca la memoria directamente

- **WHEN** el orquestador necesita recuperar memoria histórica
- **THEN** delega en `@memory-keeper`
- **AND** no invoca `searchMemory` por sí mismo

_No-testeable-por-construcción: la prohibición de invocar una tool ausente y la unicidad de la delegación son no-acciones sin salida observable; se anclan con un content guard que fija la delegación única y la prohibición en el contrato del orquestador._
