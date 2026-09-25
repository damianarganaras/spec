# Spec: memory-engine

## Purpose

Memoria persistente del proyecto (`.ancleto/memory.db`) consultada por el orquestador y expuesta
vía tools MCP. Define qué nodos se inyectan proactivamente en el system prompt y cuáles se
recuperan reactivamente, y mantiene coherente el contrato documentado con el comportamiento real.

## Requirements

### Requirement: Alcance del bloque de reglas proactivas

El bloque `<ProjectMemoryRules>` SHALL contener únicamente nodos activos de tipo `rule` (con el
filtrado active/superseded y el orden existentes). Los nodos `decision`, cualquiera sea su
scope, NO SHALL inyectarse proactivamente en ese bloque. La recuperación de decisions SHALL
permanecer reactiva vía `searchMemory`.

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

### Requirement: Coherencia entre contrato documentado e inyección

La documentación de producto y la descripción del campo `scope` de las tools MCP SHALL describir
con precisión qué nodos se inyectan proactivamente: las `rule` activas con scope `project`. Las
`decision` son reactivas. NO SHALL afirmarse que toda entrada de scope `project` (incluidas las
`decision`) entra en `<ProjectMemoryRules>`.

#### Scenario: El README no promete inyección de decisiones

- **WHEN** se revisa la descripción de scopes en `README.md`
- **THEN** el texto indica que las `rule` con scope `project` entran en `<ProjectMemoryRules>`
- **AND** no afirma que las `decision` entren al bloque

#### Scenario: La descripción del schema coincide

- **WHEN** se inspecciona la descripción del campo `scope` de las tools MCP
  (`src/core/memory/tools.js`)
- **THEN** describe el alcance de `project` de forma consistente con el comportamiento real
  (rules proactivas; decisions reactivas)

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

### Requirement: Límites del fallback OR-prefijo de `searchMemory`

`searchMemory` SHALL resolver cada consulta en dos passes sobre el índice FTS5, con builders
propios en `src/core/memory/engine.js`: la **pass 1** con AND sobre los términos crudos citados
(`ftsQuery`) y la **pass 2** con OR sobre prefijos `*` derivados de la tokenización
(`ftsQueryLoose`). La pass 2 SHALL ejecutarse únicamente cuando la pass 1 devuelve 0 resultados;
NO SHALL ampliar el recall sobre un hit ya existente de la pass 1. Los resultados de cada pass
SHALL ordenarse por `rank` con el mejor primero —en FTS5 `bm25` es negativo y `ORDER BY rank` es
numéricamente ascendente, por lo que NO SHALL usarse `rank DESC`— y SHALL aplicar un desempate
secundario por `n.rowid` ascendente: `ORDER BY rank, n.rowid`. Ante un empate de `rank`, gana el
nodo con `rowid` menor (el más antiguo). El desempate SHALL aplicarse tanto a la pass 1 (AND) como
a la pass 2 (OR con prefijos), de modo que el orden sea **total**. Cuando la cantidad de
coincidencias supere el `limit`, ese orden total SHALL determinar de forma unívoca el subconjunto
truncado.

`searchMemory` SHALL ser determinista para un estado de BD fijo: la misma query sobre el mismo
corpus devuelve resultados idénticos en contenido y orden. La variabilidad de resultados con una
misma query NO SHALL atribuirse a aleatoriedad de la búsqueda, sino a mutación concurrente del
corpus entre invocaciones.

#### Scenario: El fallback no se ejecuta si la pass 1 tiene resultados

- **WHEN** una consulta produce al menos un resultado en la pass 1 (AND con términos crudos)
- **THEN** `searchMemory` devuelve ese resultado
- **AND** no ejecuta la pass 2 (OR con prefijos), por lo que el recall no se amplía sobre un hit
  existente

#### Scenario: Los términos únicos o prefijos cortos pueden desplazar al nodo esperado

- **WHEN** la consulta se compone de un solo término, o de términos que la tokenización reduce a
  prefijos cortos (p. ej. `work`, `mem`)
- **THEN** la pass 1 puede devolver 0 resultados y la pass 2 amplía el recall
- **AND** el nodo esperado puede quedar en posición #2 o posterior (reproducido: `work` y `mem`
  dejan al nodo esperado en #2 de forma sistemática, 10/10 invocaciones)

#### Scenario: Determinismo para un estado de BD fijo

- **WHEN** se ejecuta la misma consulta dos veces sobre un corpus sin cambios entre invocaciones
- **THEN** `searchMemory` devuelve resultados idénticos en contenido y orden
