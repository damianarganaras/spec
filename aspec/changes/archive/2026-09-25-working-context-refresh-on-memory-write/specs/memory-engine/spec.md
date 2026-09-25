# Spec delta: working-context-refresh-on-memory-write

## ADDED Requirements

### Requirement: Frescura del working-context tras escrituras MCP

El bloque `<ProjectMemoryRules>` de `.ancleto/working-context.md` SHALL regenerarse desde la
memoria activa cuando una escritura MCP lo altere, sin exigir un lifecycle point (`init`,
`install --project`, `upgrade`) ni un comando manual. La regeneración SHALL dispararse cuando
ocurra al menos una de estas condiciones:

- (a) **contribución directa:** el nodo registrado tiene `type = 'rule'` y `scope = 'project'`; o
- (b) **efecto por supersesión:** la escritura supersede una `memory_key` existente, **sin importar
  el `type` ni el `scope` del nodo entrante**.

Las escrituras MCP que NO cumplan ninguna de las dos condiciones NO SHALL disparar la
regeneración. El mecanismo es refresh-on-write filtrado; el render on-demand al leer queda
descartado.

#### Scenario: Alta por MCP de una regla de proyecto refresca el working-context

- **WHEN** se registra una regla de scope `project` mediante `recordRule` y el nodo queda activo
- **AND** se lee el working-context después de la escritura
- **THEN** el working-context incluye la nueva regla

#### Scenario: Supersesión por MCP de una regla de proyecto refresca el working-context

- **WHEN** se registra una `memory_key` ya existente con scope `project` mediante `recordRule`
- **AND** el nodo previo de esa clave queda `superseded`
- **THEN** una lectura posterior del working-context muestra el contenido nuevo y no el previo

#### Scenario: Una escritura cross-type/cross-scope que supersede una regla de proyecto refresca

- **WHEN** se registra una `memory_key` existente mediante `recordDecision`, o mediante `recordRule`
  con scope `feature` o `task`, de modo que un nodo `rule` de scope `project` con esa clave queda
  `superseded`
- **AND** se lee el working-context después de la escritura
- **THEN** el working-context ya no incluye la regla de proyecto retirada

#### Scenario: Una escritura de decisión que no supersede no dispara refresh

- **WHEN** se registra una decisión con scope `project` mediante `recordDecision` que no supersede
  ningún nodo
- **THEN** el working-context no se regenera por esa escritura
- **AND** su contenido permanece idéntico

#### Scenario: Una regla de scope no proyectado que no supersede no dispara refresh

- **WHEN** se registra una regla con scope `feature` o `task` mediante `recordRule` que no supersede
  ningún nodo
- **THEN** el working-context no se regenera por esa escritura

#### Scenario: Los lifecycle points siguen regenerando

- **WHEN** se ejecuta `ancleto init`, `ancleto install --project`, `ancleto upgrade` o
  `ancleto memory context --out`
- **THEN** el working-context se regenera desde la memoria activa

### Requirement: Raíz de proyecto del refresh disparado por MCP

El refresh del working-context disparado por una escritura MCP SHALL calcular la ruta de salida y
el bloque `<ProjectTopology>` a partir de la raíz de proyecto detectada por la presencia de
`.ancletorc`, y NO SHALL usar el directorio de trabajo (`cwd`) del proceso del server MCP como
raíz.

#### Scenario: Topología y salida desde la raíz del proyecto

- **WHEN** el server MCP se resuelve con una raíz de proyecto distinta del `cwd` del proceso
- **AND** se registra una regla de scope `project` mediante `recordRule`
- **THEN** el working-context se escribe bajo la raíz detectada por `.ancletorc`
- **AND** el bloque `<ProjectTopology>` corresponde al `.discovery-map.json` de esa raíz

### Requirement: Robustez del refresh del working-context

La escritura MCP SHALL persistir y devolver el nodo registrado aunque falle el refresh del
contexto. El refresh SHALL ser idempotente y NO SHALL corromper `.ancleto/memory.db` ni provocar
recursión o deadlock.

#### Scenario: Falla del refresh no pierde la escritura

- **WHEN** una escritura MCP se registra correctamente en `memory.db` pero el refresh del
  working-context falla
- **THEN** la tool devuelve el nodo registrado como resultado exitoso
- **AND** la memoria persistida contiene el nodo

#### Scenario: Refresh repetido es idempotente

- **WHEN** el refresh del working-context se ejecuta dos veces sin escrituras intermedias
- **THEN** el contenido resultante es idéntico en ambas ejecuciones

#### Scenario: Sin recursión ni corrupción

- **WHEN** se refresca el working-context como parte de una escritura MCP
- **THEN** el proceso no recursa ni queda en deadlock
- **AND** `.ancleto/memory.db` permanece íntegra (índice FTS5 consistente)
