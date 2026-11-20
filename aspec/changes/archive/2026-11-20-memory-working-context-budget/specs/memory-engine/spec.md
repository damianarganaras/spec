## MODIFIED Requirements

### Requirement: Aviso de overflow accionable para el orquestador

El `<ContextOverflowWarning>` emitido por `buildWorkingContext` SHALL nombrar únicamente capacidades
que el orquestador tiene: SHALL indicar que se delegue un Recall a `@memory-keeper` con el topic de
la tarea. NO SHALL referenciar `searchMemory` ni ninguna otra tool de la que el orquestador no
disponga.

El presupuesto del bloque SHALL ser configurable. El render SHALL resolver un `maxTokens` efectivo
con esta precedencia: (1) la variable de entorno `ANCLETO_WORKING_CONTEXT_TOKENS`, cuando está
definida y no vacía; (2) `memory.maxTokens` de `.ancletorc`; (3) el default de 4000 tokens. El
`maxChars` del bloque SHALL ser `maxTokens × CHARS_PER_TOKEN` con `CHARS_PER_TOKEN = 4`; el default
SHALL equivaler a 16.000 caracteres. Un valor inválido —no entero, negativo, no numérico o de tipo
inesperado— SHALL resolver al default de 4000 tokens, y la ausencia de `.ancletorc` SHALL equivaler
al default. La lectura de la configuración SHALL ser tolerante: NO SHALL lanzar y NO SHALL impedir
el render.

Los valores `0` y `"unlimited"` SHALL desactivar el tope: SHALL incluirse toda regla activa del
scope, el bloque NO SHALL emitir `<ContextOverflowWarning>` ni el registro de reglas omitidas por
consola, y el presupuesto NO SHALL aplicarse. El modo sin tope SHALL ser un estado explícito del
render y NO SHALL confundirse con un presupuesto finito por debajo del piso estructural.

El bloque completo `<ProjectMemoryRules>` —wrapper, etiqueta de datos no confiables, reglas
incluidas y `<ContextOverflowWarning>`— SHALL respetar el presupuesto `maxTokens × CHARS_PER_TOKEN`
cuando el presupuesto es finito. Antes de cortar reglas, el render SHALL reservar para el aviso
`min(1.500, 15% de maxChars)` caracteres, acotado a `maxChars`. Por debajo del piso que exige el
wrapper —`<ProjectMemoryRules>`, la etiqueta de datos no confiables y el cierre— NO SHALL incluirse
ninguna regla, y el bloque SHALL seguir siendo XML bien formado. El presupuesto SHALL considerarse
aplicable a todo `maxChars` que cubra ese piso.

Deuda declarada, fuera de este change: la ventana `[piso del wrapper, piso del wrapper + aviso
mínimo]`. En esa ventana puede entrar una regla corta aunque el contrato no lo permita, y si ni el
aviso mínimo entra, `formatOverflowWarning` devuelve `''` y la omisión no requerida queda sólo en
`console.warn`. La aritmética del presupuesto finito no se toca.

El aviso SHALL conservar el conteo de reglas omitidas y el registro por consola, y SHALL nombrar las
`memory_key` de las reglas omitidas en el mismo orden determinístico de inyección, hasta un tope de
40 claves. Si la reserva de caracteres o el tope dejan claves sin listar, el aviso SHALL agregar el
sufijo `+N`, donde `N` es la cantidad de reglas omitidas que no se listaron. El orden de las claves
listadas SHALL ser siempre un prefijo del orden de inyección.

Las reglas declaradas en `required` NO SHALL contarse como omitidas ni listarse en el aviso: o se
inyectan completas o la construcción falla con el error diagnóstico definido en
`Recall task-aware con orden total, preview expandible y keys requeridas`. El aviso SHALL gobernar
únicamente las reglas no requeridas que no entran en el presupuesto.

Para una configuración, un entorno y un estado de BD fijos, el bloque renderizado y el conjunto de
reglas incluidas SHALL ser determinísticos.

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
- **AND** el recorte sigue gobernado por el presupuesto resuelto y `CHARS_PER_TOKEN`

#### Scenario: El presupuesto incluye el aviso

- **WHEN** se construye el bloque con un presupuesto finito que cubre el piso fijo del wrapper y del
  aviso mínimo
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

#### Scenario: Una regla requerida no aparece como omitida

- **WHEN** el bloque se construye con `required` y hay reglas no requeridas que no entran en el
  presupuesto
- **THEN** el aviso lista únicamente las `memory_key` omitidas no requeridas
- **AND** ninguna `memory_key` declarada en `required` aparece en el aviso ni en el conteo

#### Scenario: El default es de 4.000 tokens

- **WHEN** no hay `ANCLETO_WORKING_CONTEXT_TOKENS` ni `memory.maxTokens` en `.ancletorc`
- **THEN** el presupuesto efectivo es de 4000 tokens
- **AND** el bloque `<ProjectMemoryRules>` no excede 16.000 caracteres

#### Scenario: La configuración del proyecto fija el presupuesto

- **WHEN** `.ancletorc` declara `memory.maxTokens` con un entero positivo
- **THEN** el presupuesto efectivo es ese entero
- **AND** el corte de reglas y la reserva del aviso se calculan sobre `maxTokens × 4`

#### Scenario: El override de entorno prevalece sobre el proyecto

- **WHEN** `ANCLETO_WORKING_CONTEXT_TOKENS` está definida con un valor válido y `.ancletorc` también
  declara `memory.maxTokens`
- **THEN** el presupuesto efectivo es el del entorno
- **AND** `memory.maxTokens` no se aplica

#### Scenario: Un valor inválido o ausente cae al default

- **WHEN** el valor del entorno o de `.ancletorc` es no entero, negativo, no numérico o de tipo
  inesperado, o la configuración no existe
- **THEN** el presupuesto efectivo es de 4000 tokens
- **AND** el render no falla ni lanza por la configuración

#### Scenario: Sin tope se incluyen todas las reglas

- **WHEN** el presupuesto resuelto es `0` o `"unlimited"` y las reglas activas exceden cualquier
  presupuesto finito
- **THEN** el bloque incluye todas las `memory_key` activas del scope
- **AND** el bloque es XML bien formado
- **AND** no se emite `<ContextOverflowWarning>` ni el registro de reglas omitidas por consola

#### Scenario: Determinismo con presupuesto configurado

- **WHEN** se renderiza dos veces el bloque con la misma configuración, el mismo entorno y un estado
  de BD sin cambios
- **THEN** el bloque y el conjunto de reglas incluidas son idénticos
