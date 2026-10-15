# Spec: review

## Purpose

Verificación de la consistencia y de la garantía del proposal en el review de un change. Define el
mandato de verificar que la garantía declarada en el proposal se sostiene bajo el modelo real del
sistema, su señal de aplicabilidad, la salida ante una garantía no sostenida, los inputs y el
contexto necesarios, y la frontera del review respecto del flujo y de los modos de trabajo.

## Requirements

### Requirement: Verificación de la garantía del proposal bajo el modelo real

El reviewer SHALL verificar, en todo change que declare garantías sobre efectos de operaciones sobre
estado, que la garantía del proposal se sostiene bajo el **modelo real** del sistema. Esta
verificación es **adicional** a la consistencia implementación↔delta spec, que SHALL seguir siendo
obligatoria y NO SHALL ser sustituida por aquella.

**Modelo real** es el conjunto de operaciones que pueden mutar el estado que la garantía protege,
incluidas las operaciones que el change NO introduce (supersesión de la misma identidad, operaciones
de otros módulos, efectos indirectos). El reviewer NO SHALL limitar el análisis a las operaciones
introducidas por el change ni al diff.

La verificación SHALL concluir con un resultado explícito: la garantía se sostiene bajo el modelo
real, o no se sostiene.

#### Scenario: Una operación externa al change falsa la garantía

- **WHEN** el proposal declara una garantía sobre un estado `E`
- **AND** existe una operación fuera del change que puede mutar `E` de modo que la garantía deja de
  cumplirse
- **THEN** el reviewer concluye que la garantía NO se sostiene bajo el modelo real

#### Scenario: La consistencia con el delta spec no sustituye la verificación

- **WHEN** la implementación matchea el delta spec y la verificación de modelo aplica
- **THEN** el reviewer emite además la conclusión sobre la garantía
- **AND** no reporta la verificación de modelo como reemplazo de la consistencia implementación↔spec

### Requirement: Señal de aplicabilidad del análisis de modelo

El reviewer SHALL aplicar el análisis de modelo solo cuando se cumple la señal S1 ∧ S2 de detección
de effect-claim:

- **S1 (texto del claim):** el proposal enuncia una operación identificable (función, comando, tool
  MCP o paso de lifecycle) y suele llevar un cuantificador universal o negativo ("no requiere",
  "nunca", "solo", "siempre", "no hay cambio").
- **S2 (contexto técnico):** la operación nombrada escribe o actúa por una identidad NO acotada a la
  forma de lo escrito (`memory_key`, path, row) sobre un store cuyo read-model es una proyección
  filtrada u ordenada.

S1 por sí sola sobre-dispara y NO SHALL ser suficiente. Cuando S1 ∧ S2 no se cumple, el reviewer NO
SHALL ejecutar el análisis de modelo: quedan excluidos los changes simples, doc-only y cosméticos.

#### Scenario: Change con claim de efecto sobre un store con read-model filtrado

- **WHEN** el proposal enuncia que una operación "no afecta" un bloque y esa operación escribe por
  una identidad no acotada sobre un store cuyo read-model está filtrado
- **THEN** S1 ∧ S2 se cumple y el reviewer aplica el análisis de modelo

#### Scenario: Change doc-only o cosmético sin claims de efecto

- **WHEN** el proposal no enuncia ninguna operación identificable con cuantificador universal o
  negativo sobre estado
- **THEN** S1 no se cumple y el reviewer NO aplica el análisis de modelo

_No-testeable-por-construcción: el entregable es una no-acción de un agente; no hay salida
observable que pruebe que el análisis no se ejecutó. Se ancla con la señal de aplicabilidad
declarada, no con un test._

### Requirement: Salida ante garantía no sostenida

Cuando la verificación concluye que la garantía no se sostiene, el reviewer SHALL emitir un flag
explícito `GUARANTEE NOT SUSTAINED`, clasificado como `CRITICAL`. El flag SHALL nombrar la garantía
del proposal, la operación que la falsa y el estado protegido.

El reviewer NO SHALL degradar el hallazgo a `WARNING` ni omitirlo por no estar entre los task-owned
files o por quedar fuera del diff. El orquestador SHALL tratar `GUARANTEE NOT SUSTAINED` como un
bloqueo y NO SHALL avanzar hacia archive mientras esté presente.

#### Scenario: El flag nombra garantía, operación y estado

- **WHEN** el reviewer concluye que la garantía no se sostiene
- **THEN** el reporte incluye el flag `GUARANTEE NOT SUSTAINED` en severidad `CRITICAL`
- **AND** nombra la garantía, la operación que la falsa y el estado protegido

#### Scenario: El flag no se degrada a warning

- **WHEN** la operación que falsa la garantía no fue modificada por el change
- **THEN** el reviewer mantiene `GUARANTEE NOT SUSTAINED` como `CRITICAL`
- **AND** NO lo reporta como `WARNING` ni como fuera de scope

_No-testeable-por-construcción: la severidad efectiva la asigna un agente en runtime; un content
guard puede anclar la presencia del nombre y la severidad, pero no probar la no-degradación._

### Requirement: Inputs y contexto del reviewer para el análisis de modelo

Para el análisis de modelo, el reviewer SHALL disponer de:

- la **garantía extraída del proposal** como campo separado del resto del análisis;
- el **modelo de estado** que esa garantía protege (qué operaciones pueden mutarlo);
- **acceso de lectura al código fuente relevante** de esas operaciones, no limitado al diff ni a los
  archivos modificados.

El proposal SHALL declarar la garantía de forma extraíble y el orquestador SHALL propagarla, como
campo separado, en la delegación del review, junto con el estado protegido y la capability afectada.
Cuando el reviewer no pueda resolver el estado protegido o la superficie de escritura con el contexto
recibido, SHALL reportar el contexto faltante al orquestador en lugar de asumir que la garantía se
sostiene.

#### Scenario: El orquestador propaga la garantía y el estado protegido

- **WHEN** un change declara una garantía de efecto sobre estado
- **THEN** el orquestador incluye en la delegación del review la garantía extraída y el estado
  protegido como campos separados
- **AND** el reviewer lee el código fuente de las operaciones que pueden mutar ese estado, más allá
  de los archivos cambiados

#### Scenario: El reviewer reporta el contexto faltante en lugar de asumir

- **WHEN** el reviewer no logra resolver la superficie de escritura o el read-model con el contexto
  recibido
- **THEN** reporta el contexto faltante al orquestador
- **AND** NO concluye que la garantía se sostiene

### Requirement: Frontera y no-regresión del review

La mejora vive dentro del review existente y NO SHALL agregar un stage nuevo al flujo. La verificación
implementación↔delta spec SHALL seguir siendo obligatoria. El reviewer NO SHALL escribir specs ni
diseño, ni reemplazar al spec-writer o al diseño: solo evalúa lo que ya existe.

El reviewer NO SHALL ejecutar el análisis de modelo completo para changes sin garantías sobre efectos
de operaciones, de modo que el review de esos changes NO SHALL volverse más lento por este cambio.

El mandato de verificación de garantía bajo el modelo real SHALL aplicar **solo** en modo `aspec Change`;
NO SHALL ejecutarse para trabajo de tipo `direct-implementation` ni `direct-test-only`.

#### Scenario: El flujo mantiene sus stages

- **WHEN** se recorre un change `spec-required` con la mejora vigente
- **THEN** el flujo conserva los mismos stages que antes
- **AND** la verificación de garantía ocurre dentro del review existente

_No-testeable-por-construcción: la ausencia de un stage nuevo es un invariante estructural negativo;
no hay salida ejecutable que lo observe. Se verifica por inspección del artefacto, no por test._

#### Scenario: Change sin garantías de efecto no paga el análisis de modelo

- **WHEN** un change no declara garantías sobre efectos de operaciones sobre estado
- **THEN** el reviewer no ejecuta el análisis de modelo
- **AND** el review no incorpora lectura adicional de código por esta causa

_No-testeable-por-construcción: es una no-acción de un agente; no hay salida observable que pruebe la
ausencia de costo adicional. Se acota con la señal S1 ∧ S2._

#### Scenario: El análisis de modelo no corre fuera de modo aspec Change

- **WHEN** el review se ejecuta en modo `direct-implementation` o `direct-test-only`
- **THEN** el reviewer NO ejecuta el análisis de modelo
- **AND** no emite `GUARANTEE NOT SUSTAINED`

_No-testeable-por-construcción: es una no-acción de un agente acotada por modo; no hay salida
observable que pruebe que el análisis no se ejecutó. Se ancla con la frontera de modo declarada en el
Requirement._

### Requirement: Reviewer sin rebote con Validation Ledger prearmado

El reviewer NO SHALL disponer de `bash`. Para que no requiera re-verificación, SHALL recibir un **Validation Ledger prearmado y cerrado** y el **affected-set** como parte de su input. Un **Validation Ledger prearmado y cerrado** es un ledger en el que cada comando relevante al scope de review —tests del change, tests del `affected-set`, format check y lint declarados por el proyecto— tiene una entrada con clasificación terminal (`passed`, `task-regression`, `pre-existing-unrelated`, `not-configured` o `inconclusive`) y evidencia preservada (entrada de ledger para comandos; `file:line` para código). Cuando el proyecto no declara un format check o un lint en `PRODUCT.md` → `## Project Commands`, la entrada correspondiente SHALL registrarse con clasificación terminal `not-configured`, tratada como no-fallo y consistente con el bloque `LOCKED: validation-commands` de `templates/AGENTS.md`; una entrada `not-configured` SHALL cerrar el ledger para ese comando y NO SHALL contar como entrada faltante ni bloquear el review. El ledger SHALL ser producido por `@tester` y armado/verificado como cerrado por `@orchestrator` antes de delegar el review. El orquestador NO SHALL delegar el review con un ledger no cerrado: SHALL detenerse en la etapa de `@tester` para que cierre las entradas faltantes. El reviewer SHALL consumir el ledger sin reconstruirlo ni resumirlo y NO SHALL solicitar una re-delegación a `@tester` por evidencia de comando faltante o inconclusa dentro del scope cubierto. Las salvaguardas se preservan: el reviewer SHALL seguir sin `bash`, la verificación de garantías bajo el modelo real SHALL seguir vigente —incluido el reporte de **contexto** faltante, que no es evidencia de comando— y el flag `GUARANTEE NOT SUSTAINED` SHALL seguir clasificado como `CRITICAL`.

#### Scenario: El tester produce el ledger y el orquestador lo arma cerrado

- **WHEN** `@tester` devuelve el Validation Ledger del change
- **THEN** cada comando relevante al scope tiene una entrada con clasificación terminal
- **AND** `@orchestrator` verifica el cierre y pasa el ledger sin cambios al reviewer

#### Scenario: Ledger no cerrado detiene el review

- **WHEN** el ledger no cubre algún comando del scope de review
- **THEN** `@orchestrator` no delega el review
- **AND** se detiene en la etapa de `@tester` para que cierre la entrada faltante

#### Scenario: Format check o lint no declarados se registran como not-configured

- **WHEN** el proyecto no declara un format check o un lint en `PRODUCT.md` → `## Project Commands`
- **THEN** el ledger prearmado registra esa entrada con clasificación terminal `not-configured`
- **AND** la trata como no-fallo, no como entrada faltante
- **AND** el review no se bloquea por esa entrada

#### Scenario: El scope de review es el affected-set

- **WHEN** se delega el review de un change
- **THEN** el scope es el `affected-set` (dependientes incluidos) propagado por el orquestador
- **AND** no se limita a la unión de archivos tocados

#### Scenario: La frontera sin bash y el flag CRITICAL se preservan

- **WHEN** se revisa el contrato del reviewer
- **THEN** el reviewer sigue sin `bash` (`bash: false`)
- **AND** `GUARANTEE NOT SUSTAINED` sigue vigente como `CRITICAL`
- **AND** la verificación de garantías bajo el modelo real conserva su lectura más allá del diff

#### Scenario: El reviewer no pide re-verificación dentro del scope cubierto

- **WHEN** el reviewer recibe el ledger prearmado cerrado y no falta ninguna entrada del scope
- **THEN** usa el ledger como evidencia
- **AND** no pide una re-delegación a `@tester` por evidencia faltante o inconclusa

_No-testeable-por-construcción: el no-pedido de re-delegación es una no-acción de un agente sin salida observable. El invariante "el reviewer NO recibe bash" sí tiene test (`test/content-guards.test.js`); el no-pedido se ancla con un content guard que fija el contrato declarado en el prompt del reviewer._
