# Spec: review (delta)

## ADDED Requirements

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
