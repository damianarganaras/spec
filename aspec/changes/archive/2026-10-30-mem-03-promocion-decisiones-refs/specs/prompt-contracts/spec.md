# Delta: prompt-contracts

## MODIFIED Requirements

### Requirement: Registro de memoria en un solo paso y sólo con candidato real

El cierre de un change SHALL hacer como máximo **una** llamada de memoria en modo Automatic Record, y
sólo cuando exista un candidato real. Con candidato, el orquestador SHALL delegar `@memory-keeper` en
Automatic Record una sola vez. Sin candidato real, el orquestador NO SHALL invocar Optional Draft, NO
SHALL solicitar aprobación de memoria y SHALL finalizar sin almacenar. La cadena Automatic Record →
Optional Draft → aprobación → User-Approved Record NO SHALL ejecutarse cuando no hay candidato.
User-Approved Record SHALL quedar reservado a un pedido explícito del usuario.

La promoción de las decisiones duraderas de `proposal ## Decisiones` NO SHALL contarse dentro de ese
límite de una llamada: es una operación distinta, con su propio gate. La promoción SHALL escribir una
llamada por decisión promovible —es decir, una por bloque con `memory_key` propia y `Estado:
aprobado`—, SHALL usar el modo Promotion de `@memory-keeper`, NO SHALL encadenar Optional Draft ni
pedir aprobación adicional por cada bloque, y NO SHALL delegar `@memory-keeper` cuando el lote no
tiene candidatos. Las decisiones marcadas `propuesto`, `enmendado` o `descartado` NO SHALL
promoverse. La promoción NO SHALL reinterpretar ni reescribir el texto aprobado del proposal.

#### Scenario: Un solo call cuando existe candidato

- **WHEN** existe un candidato real de memoria
- **THEN** el orquestador delega Automatic Record una sola vez
- **AND** no encadena Optional Draft

#### Scenario: Sin candidato no hay ping-pong de memoria

- **WHEN** no existe candidato real de memoria
- **THEN** el orquestador no invoca Optional Draft
- **AND** no solicita aprobación de memoria
- **AND** finaliza sin almacenar

#### Scenario: User-Approved Record queda reservado al pedido del usuario

- **WHEN** el usuario pide explícitamente almacenar un texto de memoria
- **THEN** se delega User-Approved Record con ese texto
- **AND** no se reescribe el texto aprobado

#### Scenario: La promoción no consume el presupuesto de Automatic Record

- **WHEN** el change archiva tres decisiones aprobadas y además tiene un candidato de Automatic Record
- **THEN** se escriben tres nodos por promoción, uno por bloque aprobado
- **AND** el candidato de Automatic Record se escribe en una única llamada adicional
- **AND** ninguna de las dos operaciones encadena Optional Draft

#### Scenario: Sin decisiones aprobadas no hay delegación de promoción

- **WHEN** el `proposal ## Decisiones` no tiene bloques con `memory_key` propia y `Estado: aprobado`
- **THEN** el orquestador no delega la promoción a `@memory-keeper`
- **AND** el archive informa que no hubo memorias promovidas

#### Scenario: Una decisión propuesta no se promueve

- **WHEN** un bloque declara `Estado: propuesto`, `enmendado` o `descartado`
- **THEN** no se promueve
- **AND** el bloque permanece versionado en el proposal

_No-testeable-por-construcción: la cuenta de llamadas y la ausencia de delegación son ordenamientos
de runtime sin salida observable. Se anclan en el contrato de prompt de la skill y del agente; la
promoción determinística por bloque se verifica en el engine y en el gate del archive._

### Requirement: El proposal registra las decisiones con su alternativa descartada

`proposal.md` SHALL contener una sección `## Decisiones`. Cada decisión SHALL registrar `memory_key`,
`Elección`, `Descartado`, `Justificación`, `Refs` y `Estado`. Una decisión simple MAY codificarse en una
sola línea con la forma `decisión | alternativa descartada | por qué | fuente/evidencia`; esa forma es
semánticamente equivalente al bloque y SHALL poder completarse a los seis campos sin pérdida de
información. El lector SHALL preservar esa equivalencia y NO SHALL exigir el bloque cuando la línea ya
trae el contenido. `Estado` SHALL ser uno de `propuesto`, `aprobado`, `enmendado` o `descartado`. La
sección SHALL completarse también durante la implementación cuando surja un tradeoff no previsto, y
SHALL escribirla el dueño del artifact, no el orquestador ni el implementador.

La equivalencia semántica NO SHALL extenderse a la promoción a memoria. Sólo un bloque que declara
`memory_key` propia y `Estado: aprobado` SHALL ser promovible. La forma de una línea NO SHALL promoverse
porque no declara identidad (`memory_key`) ni estado, y SHALL permanecer versionada en el proposal. La
promoción NO SHALL derivar ni inventar una `memory_key` para habilitar esa forma.

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

#### Scenario: Una decisión en una línea no produce nodo de memoria

- **WHEN** el `proposal ## Decisiones` contiene una decisión escrita en una línea con decisión,
  alternativa descartada, justificación y fuente
- **THEN** la decisión queda versionada en el proposal
- **AND** no se produce ningún nodo de memoria por esa decisión

_No-testeable-por-construcción: la no-promoción es una no-acción del gate. Se ancla en el contrato y
en T06, que verifica que el motor rechaza una escritura sin `memory_key`._
