# Delta: memory-engine — ranking de inyección y omisiones visibles

## MODIFIED Requirements

### Requirement: Alcance del bloque de reglas proactivas

El bloque `<ProjectMemoryRules>` SHALL contener únicamente nodos activos de tipo `rule` del scope
solicitado y su jerarquía, aplicando el filtrado active/superseded existente y el orden
determinístico definido en `Orden determinístico de inyección de reglas`. Los nodos `decision`,
cualquiera sea su scope, NO SHALL inyectarse proactivamente en ese bloque. La recuperación de
decisions SHALL permanecer reactiva vía `searchMemory`.

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

### Requirement: Aviso de overflow accionable para el orquestador

El `<ContextOverflowWarning>` emitido por `buildWorkingContext` SHALL nombrar únicamente capacidades
que el orquestador tiene: SHALL indicar que se delegue un Recall a `@memory-keeper` con el topic de
la tarea. NO SHALL referenciar `searchMemory` ni ninguna otra tool de la que el orquestador no
disponga.

El bloque completo `<ProjectMemoryRules>` —wrapper, etiqueta de datos no confiables, reglas
incluidas y `<ContextOverflowWarning>`— SHALL respetar el presupuesto
`maxTokens × CHARS_PER_TOKEN`. Antes de cortar reglas, el render SHALL reservar para el aviso
`min(1.500, 15% de maxChars)` caracteres, acotado a `maxChars`. Por debajo del piso fijo que exige
el wrapper y el aviso mínimo, el bloque SHALL seguir siendo XML bien formado y NO SHALL incluir
reglas; el presupuesto SHALL considerarse aplicable a todo `maxChars` que cubra ese piso.

El aviso SHALL conservar el conteo de reglas omitidas y el registro por consola, y SHALL nombrar las
`memory_key` de las reglas omitidas en el mismo orden determinístico de inyección, hasta un tope de
40 claves. Si la reserva de caracteres o el tope dejan claves sin listar, el aviso SHALL agregar el
sufijo `+N`, donde `N` es la cantidad de reglas omitidas que no se listaron. El orden de las claves
listadas SHALL ser siempre un prefijo del orden de inyección.

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

#### Scenario: El presupuesto incluye el aviso

- **WHEN** se construye el bloque con un `maxTokens` que cubre el piso fijo del wrapper y del aviso
  mínimo
- **THEN** la longitud total del bloque `<ProjectMemoryRules>`, incluido el
  `<ContextOverflowWarning>`, es menor o igual a `maxTokens × CHARS_PER_TOKEN`
- **AND** el aviso no desborda el presupuesto que reservó

#### Scenario: Las claves omitidas se listan

- **WHEN** el bloque se trunca y hay reglas omitidas
- **THEN** el `<ContextOverflowWarning>` incluye las `memory_key` de las reglas omitidas
- **AND** las lista en el orden determinístico de inyección

#### Scenario: El tope se señala con +N

- **WHEN** hay más de 40 reglas omitidas, o la reserva de caracteres no alcanza para listarlas todas
- **THEN** el aviso lista como máximo las claves que caben en el tope y en la reserva
- **AND** agrega el sufijo `+N` con la cantidad de reglas omitidas no listadas

## ADDED Requirements

### Requirement: Orden determinístico de inyección de reglas

El orden de inyección de `rule` en `<ProjectMemoryRules>` SHALL ser determinístico y total. El
criterio SHALL aplicarse en este orden:

1. Jerarquía de scope: `task` antes que `feature` antes que `project`.
2. Anclaje declarado: las reglas que declaran al menos una ref `spec:`, `change:` o `path:` en su
   bloque `refs:` antes que las que no declaran ninguna.
3. `created_at` descendente.
4. `memory_key` lexicográfico ascendente.

El anclaje SHALL determinarse únicamente parseando el bloque `refs:` del `content`. La evaluación
NO SHALL resolver las refs, NO SHALL consultar el filesystem ni la base de datos, y NO SHALL agregar
I/O al render. Una regla sin bloque `refs:`, con un bloque inválido o con un bloque que sólo declara
`commit:` o `workitem:` NO SHALL contar como anclada.

Dos corridas de `buildWorkingContext` sobre el mismo estado de memoria y el mismo `maxTokens` SHALL
producir el mismo bloque.

#### Scenario: Una regla anclada gana a una no anclada del mismo scope

- **WHEN** dos reglas activas del mismo scope compiten por el presupuesto
- **AND** una declara al menos una ref `spec:`, `change:` o `path:` y la otra no declara ninguna
- **THEN** la regla anclada se ordena antes
- **AND** si sólo entra una, entra la anclada

#### Scenario: El scope de mayor prioridad gana

- **WHEN** existe una regla activa de scope `task` y otra de scope `project` en un contexto `task`
- **THEN** la regla de scope `task` se ordena antes que la de scope `project`

#### Scenario: El empate se resuelve por recencia y luego por memory_key

- **WHEN** dos reglas comparten scope y anclaje pero tienen distinto `created_at`
- **THEN** se ordena primero la de `created_at` más reciente
- **AND** si además comparten `created_at`, se ordena primero la de `memory_key` lexicográficamente menor

#### Scenario: Dos corridas producen el mismo bloque

- **WHEN** se invoca `buildWorkingContext` dos veces consecutivas sin escrituras intermedias
- **THEN** los dos bloques son idénticos byte a byte
