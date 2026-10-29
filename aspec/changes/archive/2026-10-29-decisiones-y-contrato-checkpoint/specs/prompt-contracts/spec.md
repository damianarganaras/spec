# Delta: prompt-contracts

## ADDED Requirements

### Requirement: El proposal registra las decisiones con su alternativa descartada

`proposal.md` SHALL contener una sección `## Decisiones`. Cada decisión SHALL registrar `memory_key`,
`Elección`, `Descartado`, `Justificación`, `Refs` y `Estado`. Una decisión simple MAY codificarse en una
sola línea con la forma `decisión | alternativa descartada | por qué | fuente/evidencia`; esa forma es
semánticamente equivalente al bloque y SHALL poder completarse a los seis campos sin pérdida de
información. El lector SHALL preservar esa equivalencia y NO SHALL exigir el bloque cuando la línea ya
trae el contenido. `Estado` SHALL ser uno de `propuesto`, `aprobado`, `enmendado` o `descartado`. La
sección SHALL completarse también durante la implementación cuando surja un tradeoff no previsto, y
SHALL escribirla el dueño del artifact, no el orquestador ni el implementador.

#### Scenario: Generación del proposal

- **WHEN** cualquiera de los generadores de artifacts (`@spec-writer`, `ancleto-propose`, `ancleto-ff`, `ancleto-continue`, `ancleto-new`, `ancleto-onboard`, `ancleto-upgrade`) escribe el `proposal.md` de un change
- **THEN** el proposal incluye la sección `## Decisiones`
- **AND** cada decisión registrada usa los seis campos o la forma de una línea equivalente

#### Scenario: Decisión que nace durante la implementación

- **WHEN** durante la implementación surge un tradeoff no previsto
- **THEN** la decisión se agrega a `proposal ## Decisiones` con su alternativa descartada y su evidencia
- **AND** la escritura la realiza el dueño del artifact, no el orquestador ni el implementador

#### Scenario: Solo decisiones duraderas

- **WHEN** una decisión es una línea de implementación obvia
- **THEN** no se registra como decisión en el proposal ni se promueve a memoria

### Requirement: El checkpoint de aprobación aprueba el contrato del cambio

El checkpoint posterior a `@spec-writer` SHALL presentar el contrato del cambio — intención, alcance,
`Requirement` nuevo o existente citado, riesgos, decisión de arquitectura cuando aplique, validación
prevista y paths autorizados — en menos de una pantalla, y SHALL esperar aprobación explícita del
usuario. El checkpoint NO SHALL enumerar artifacts ni pedir la aprobación de documentos generados, y
NO SHALL condicionarse a la existencia de `design.md`. La aprobación del contrato habilita la
implementación y NO SHALL interpretarse como aprobación del archive ni del merge.

#### Scenario: Checkpoint con contrato completo

- **WHEN** `@spec-writer` termina de generar los artifacts de un change que requiere especificación
- **THEN** el orquestador presenta intención, alcance, `Requirement` nuevo o existente, riesgos, decisión
  de arquitectura si aplica, validación prevista y paths autorizados en menos de una pantalla
- **AND** espera una respuesta explícita antes de delegar la implementación
- **AND** no enumera documentos generados como objeto de la aprobación

#### Scenario: Enmienda cuando cambia el contrato

- **WHEN** después del checkpoint cambia el alcance, el riesgo o la decisión de arquitectura
- **THEN** el orquestador presenta el contrato enmendado y espera una nueva aprobación explícita antes de
  continuar
- **AND** una decisión descubierta durante la implementación que no altera alcance, riesgo ni
  arquitectura se agrega al `proposal ## Decisiones` sin exigir una nueva aprobación

#### Scenario: Los stops no se confunden entre sí

- **WHEN** el contrato del change está aprobado, la implementación está validada y el review no tiene
  hallazgos críticos
- **THEN** el archive sigue siendo un stop separado que espera aprobación explícita del usuario
- **AND** el merge sigue siendo un stop separado que espera aprobación explícita para ese caso
- **AND** ninguno de los dos se satisface con la aprobación del contrato
