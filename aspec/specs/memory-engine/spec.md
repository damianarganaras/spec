# Spec: memory-engine

## Purpose

Memoria persistente del proyecto (`.ancleto/memory.db`) consultada por el orquestador y expuesta
vía tools MCP. Define qué nodos se inyectan proactivamente en el system prompt y cuáles se
recuperan reactivamente, mantiene coherente el contrato documentado con el comportamiento real y
define la materialización día-cero del working-context con la topología, incluso sin base de memoria.

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

La documentación de producto y la descripción del campo `scope` de las tools MCP SHALL describir con precisión qué nodos se inyectan proactivamente: las `rule` activas con scope `project`. Las `decision` son reactivas. NO SHALL afirmarse que toda entrada de scope `project` (incluidas las `decision`) entra en `<ProjectMemoryRules>`. La documentación SHALL describir además la inyección día-cero: el bloque `<ProjectTopology>` se materializa e inyecta desde el día cero aunque no haya reglas ni base de memoria, y la descripción de la materialización del working-context SHALL coincidir con el comportamiento real de la CLI.

#### Scenario: El README no promete inyección de decisiones

- **WHEN** se revisa la descripción de scopes en `README.md`
- **THEN** el texto indica que las `rule` con scope `project` entran en `<ProjectMemoryRules>`
- **AND** no afirma que las `decision` entren al bloque

#### Scenario: La descripción del schema coincide

- **WHEN** se inspecciona la descripción del campo `scope` de las tools MCP
  (`src/core/memory/tools.js`)
- **THEN** describe el alcance de `project` de forma consistente con el comportamiento real
  (rules proactivas; decisions reactivas)

#### Scenario: El README no se contradice sobre el día-cero

- **WHEN** se comparan las secciones del README que describen la materialización del working-context
- **THEN** ambas coinciden con la implementación: la topología se inyecta desde el día cero (con o sin reglas)
- **AND** ninguna condiciona la materialización a la existencia previa de memoria

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

### Requirement: Aislamiento del cwd en las pruebas de `buildWorkingContext`

Las pruebas de `buildWorkingContext` SHALL pasar la raíz del proyecto explícita como tercer
argumento, de modo que la construcción del bloque NO dependa del directorio de trabajo
(`process.cwd()`) del proceso de test. Las llamadas que usan el `engine` compartido de
`test/memory-engine.test.js` NO SHALL omitir la raíz. Los fixtures que crean su propio directorio
temporal SHALL propagar ese directorio a sus callbacks, y las llamadas dentro de ellos NO SHALL
omitir la raíz.

#### Scenario: Resultado aislado sin resumen de topología

- **WHEN** una prueba invoca `buildWorkingContext(scope, maxTokens, root)` con una raíz aislada
  que no contiene `.discovery-map.json`
- **THEN** el resultado NO incluye `<ProjectTopology>`
- **AND** el resultado empieza con `<ProjectMemoryRules>` cuando el scope tiene reglas activas
- **AND** el resultado es `null` cuando el scope no tiene reglas activas

#### Scenario: Determinismo independiente del cwd del proceso

- **WHEN** la misma prueba se ejecuta desde un directorio de trabajo que contiene
  `.discovery-map.json` y desde uno que no
- **THEN** para la misma raíz explícita el bloque resultante es idéntico
- **AND** las aserciones de prefijo (`startsWith('<ProjectMemoryRules>')`) y de `null` se cumplen
  en ambos casos

#### Scenario: El engine compartido no hereda el cwd

- **WHEN** una prueba usa el `engine` compartido cuyo `memory.db` vive en un directorio temporal
  aislado
- **AND** invoca `buildWorkingContext` para verificar el bloque de reglas
- **THEN** la raíz pasada es el directorio temporal del engine, no `process.cwd()`

#### Scenario: El fixture con tmpdir propaga su raíz aislada

- **WHEN** una prueba usa un fixture que crea su propio directorio temporal y su `engine`
  (`withEngine`)
- **AND** invoca `buildWorkingContext(scope, maxTokens, root)` con el límite de tokens de la
  prueba
- **THEN** la raíz pasada es el directorio temporal del fixture, no `process.cwd()`
- **AND** el resultado empieza con `<ProjectMemoryRules>` y cierra con `</ProjectMemoryRules>`
  cuando hay reglas activas
- **AND** el truncamiento por límite de tokens es determinista e independiente del cwd del proceso

### Requirement: Invariancia de la firma y del comportamiento por defecto de `buildWorkingContext`

La corrección de aislamiento SHALL vivir exclusivamente en los tests. `buildWorkingContext` NO
SHALL cambiar su firma pública ni su comportamiento por defecto: el parámetro `cwd` SHALL
conservar el default `process.cwd()`, y cuando exista un resumen de topología en la raíz recibida
el bloque SHALL anteponer `<ProjectTopology>` a `<ProjectMemoryRules>`.

#### Scenario: La llamada sin raíz explícita conserva el default

- **WHEN** se invoca `buildWorkingContext(scope)` sin el tercer argumento
- **THEN** la topología se lee desde `process.cwd()`, sin cambios de comportamiento

#### Scenario: La topología sigue precediendo al bloque de reglas

- **WHEN** la raíz recibida contiene un `.discovery-map.json` válido
- **THEN** el bloque resultante empieza con `<ProjectTopology>`
- **AND** `<ProjectMemoryRules>` aparece después de `<ProjectTopology>`

#### Scenario: Sin topología el bloque de reglas encabeza

- **WHEN** la raíz recibida no contiene un `.discovery-map.json` válido
- **THEN** el bloque resultante empieza con `<ProjectMemoryRules>` cuando hay reglas activas
- **AND** es `null` cuando no hay reglas activas

### Requirement: Procedencia de escritura gestionada por el runtime

El motor SHALL registrar la procedencia de cada nodo en la columna `source`, resuelta
**exclusivamente** desde el contexto de runtime confiable. Un valor `source` presente en el input
del caller (args de tool o argumento directo a `recordNode`) NO SHALL tener efecto sobre la
procedencia persistida. Cada superficie de escritura confiable SHALL registrar un valor de
procedencia propio y estable que la identifique:

- `mcp:ancleto-memory` — escrituras vía las tools MCP (`recordRule`, `recordDecision`).
- `cli:import` — escrituras vía `ancleto memory import`.
- `tool:recordRule` / `tool:recordDecision` — valor por defecto que emite el toolkit
  in-process (`createMemoryToolkit`, `src/core/memory/tools.js:81-82`) según la tool
  invocada, cuando no se provee un `source` de runtime explícito.
- `runtime` — uso directo del engine (`recordNode`) por código que no pasa por una tool
  nombrada, sin contexto de procedencia explícito.
- `agent:<rol>` — cuando el runtime confiable provee una identidad de agente (nunca el caller).

`source` NO SHALL aparecer en las firmas JSON Schema de entrada de las tools MCP.

#### Scenario: Un source forjado en los args no tiene efecto

- **WHEN** el caller invoca una tool MCP (o `recordNode`) incluyendo un `source` propio
- **THEN** el nodo persistido conserva el `source` resuelto por el runtime
- **AND** el valor forjado no se almacena

#### Scenario: Procedencia de la superficie MCP

- **WHEN** se registra un nodo mediante `recordRule` o `recordDecision` a través del server MCP
- **THEN** el nodo persistido tiene `source = 'mcp:ancleto-memory'`

#### Scenario: Procedencia de la superficie de import

- **WHEN** `ancleto memory import` inserta o actualiza un nodo
- **THEN** el nodo persistido tiene `source = 'cli:import'`

#### Scenario: Procedencia por defecto del toolkit in-process

- **WHEN** se registra un nodo vía el toolkit in-process (`createMemoryToolkit`) sin un `source` explícito
- **THEN** el nodo persistido tiene `source = 'tool:recordRule'` o `source = 'tool:recordDecision'`
  según la tool invocada

#### Scenario: Procedencia por defecto del runtime

- **WHEN** se invoca `engine.recordNode(...)` sin un contexto de procedencia
- **THEN** el nodo persistido tiene `source = 'runtime'`

### Requirement: Exposición de procedencia en la lectura de operador

La lectura del motor orientada al LLM (`searchMemory`) SHALL seguir excluyendo los campos
gestionados por el runtime, incluido `source`. La lectura de operador (`listNodes`, usada por
`ancleto memory list`) SHALL exponer `source` como campo de solo lectura en cada nodo devuelto,
de modo que la procedencia sea auditable. La exposición NO SHALL modificar las firmas JSON Schema
de entrada de las tools MCP.

#### Scenario: La lectura de operador incluye la procedencia

- **WHEN** se invoca `listNodes()` sobre una memoria con nodos activos
- **THEN** cada nodo devuelto incluye el campo `source`

#### Scenario: La lectura del LLM sigue ocultando los campos del runtime

- **WHEN** se invoca `searchMemory()`
- **THEN** el resultado NO incluye `source`, `confidence`, `status` ni `id`

#### Scenario: El JSON del CLI expone la procedencia

- **WHEN** se ejecuta `ancleto memory list --json`
- **THEN** cada nodo del JSON incluye el campo `source`

#### Scenario: Las firmas MCP no exponen la procedencia

- **WHEN** se serializan los `inputSchema` de las tools MCP
- **THEN** ninguno contiene `source`, `confidence`, `status` ni `id`

### Requirement: Frontera entre procedencia y enforcement

La procedencia SHALL ser un dato **descriptivo de auditoría**. El motor NO SHALL usar `source`
para autorizar ni denegar escrituras, ni para asignar o retirar ownership y permisos sobre los
nodos, y NO SHALL tratar como verificada una identidad de actor auto-declarada por el caller.
`source` SÍ MAY condicionar la **validación de contenido** que se aplica a una escritura sobre
`recordNode`: cada regla de contenido SHALL declarar si es incondicional o si tiene una exención
por procedencia, y una exención NO SHALL extender la escritura más allá de esa regla. En
particular, la validación de refs declara su exención para la procedencia `runtime`, mientras que
el rechazo de secretos se declara incondicional y se evalúa en toda escritura. En la arquitectura
actual (MCP sobre stdio, sin canal de identidad autenticado), la superficie de escritura del
runtime es el único actor registrable; el rol del LLM NO SHALL registrarse como si estuviera
autenticado. La implementación de enforcement de ownership SHALL quedar fuera de este change.

#### Scenario: La procedencia no autoriza escrituras

- **WHEN** se registra un nodo desde cualquier superficie confiable
- **THEN** el motor lo persiste sin evaluar `source` como condición de autorización

#### Scenario: La procedencia describe la superficie, no el rol del LLM

- **WHEN** se audita la procedencia de un nodo escrito por una tool MCP
- **THEN** la procedencia identifica la superficie de escritura (`mcp:ancleto-memory`)
- **AND** no afirma una identidad de rol del LLM como verificada

#### Scenario: Una exención de contenido no altera ownership ni permisos

- **WHEN** se invoca `recordNode` con procedencia `runtime`
- **THEN** la exención de refs se aplica sólo a esa validación de contenido
- **AND** no se saltea ninguna otra validación de contrato ni cambia el ownership del nodo
- **AND** el rechazo de secretos se evalúa igual que en cualquier otra procedencia

### Requirement: Materialización día-cero del working-context con topología

El CLI NO SHALL omitir la materialización de `.ancleto/working-context.md` por la sola ausencia de `.ancleto/memory.db`. Aunque no exista la base o no haya reglas activas, cuando exista un `.discovery-map.json` en la raíz del proyecto el CLI SHALL escribir el bloque `<ProjectTopology>` en el working-context, creando `.ancleto/` si falta. El bloque `<ProjectTopology>` NO depende de la base de memoria ni de reglas. La construcción de la topología sin base SHALL realizarse sin abrir el motor. El comportamiento de `buildWorkingContext` (firma, default de `cwd` y resultado nulo sin topología y sin reglas) SHALL permanecer sin cambios: la materialización día-cero vive en la capa CLI.

#### Scenario: Repo nuevo sin memoria materializa la topología

- **WHEN** no existe `.ancleto/memory.db`
- **AND** existe un `.discovery-map.json` en la raíz
- **THEN** el CLI materializa `.ancleto/working-context.md` con el bloque `<ProjectTopology>`
- **AND** crea `.ancleto/` si no existía

#### Scenario: Sin topología ni reglas no se crea contenido ficticio

- **WHEN** no existe `.ancleto/memory.db` ni un `.discovery-map.json` válido
- **THEN** el CLI no escribe un bloque con contenido ficticio

#### Scenario: El motor conserva su contrato

- **WHEN** se invoca `buildWorkingContext` sin topología y sin reglas activas
- **THEN** sigue devolviendo `null`
- **AND** su firma y el default `cwd = process.cwd()` no cambian

### Requirement: Frescura del working-context tras escrituras de la CLI

El bloque `<ProjectMemoryRules>` de `.ancleto/working-context.md` SHALL regenerarse desde la
memoria activa cuando una operación de escritura del CLI altere los nodos que lo componen, sin
exigir un lifecycle point (`init`, `install --project`, `upgrade`) ni un comando manual. En
particular, `ancleto memory import` SHALL disparar la regeneración usando el mismo camino único
de render que el refresh de MCP (`writeWorkingContext` / `renderWorkingContextBlock`) sobre la
conexión ya abierta por el comando. La regeneración SHALL ser best-effort: si falla, la
importación persistida SHALL considerarse exitosa igualmente y el fallo SHALL reportarse por
stderr sin abortar.

#### Scenario: El import de una regla de proyecto refresca el working-context

- **WHEN** se importa por `ancleto memory import` un JSON con una `rule` activa de scope `project`
- **AND** se lee el working-context después del import
- **THEN** el working-context incluye la nueva regla

#### Scenario: Un import que no altera el bloque no lo reescribe

- **WHEN** se importa por `ancleto memory import` una `decision` de scope no proyectado que no
  supersede ninguna `rule` de proyecto
- **THEN** el working-context no se regenera por ese import

#### Scenario: Falla del refresh no pierde la escritura

- **WHEN** el import persiste los nodos en `memory.db` pero la regeneración del working-context falla
- **THEN** el comando reporta la importación como exitosa
- **AND** la memoria persistida contiene los nodos importados
- **AND** el fallo del refresh se reporta por stderr

### Requirement: Detección de staleness del working-context

El CLI SHALL poder reportar de forma read-only si `.ancleto/working-context.md` está al día
respecto de las reglas activas. El chequeo SHALL renderizar el bloque esperado con el mismo
camino de render que el refresh y compararlo (con normalización acotada de líneas y salto final)
contra el contenido actual del archivo, reportando uno de tres estados: `ok`, `ausente` o
`desactualizado`. El chequeo NO SHALL escribir el archivo; corregir el staleness queda a cargo
del refresh on-write o de `ancleto memory context --out`.

#### Scenario: Working-context al día

- **WHEN** el contenido de `.ancleto/working-context.md` coincide con el bloque renderizado desde
  la memoria activa
- **THEN** el chequeo reporta `ok`

#### Scenario: Working-context ausente

- **WHEN** existen reglas activas que componen el bloque pero `.ancleto/working-context.md` no existe
- **THEN** el chequeo reporta `ausente`

#### Scenario: Working-context desactualizado

- **WHEN** el contenido de `.ancleto/working-context.md` no coincide con el bloque renderizado
  desde la memoria activa
- **THEN** el chequeo reporta `desactualizado`

#### Scenario: El chequeo no muta el archivo

- **WHEN** se ejecuta el chequeo de staleness sobre un working-context desactualizado
- **THEN** el contenido del archivo no cambia

### Requirement: Aviso de overflow accionable para el orquestador

El `<ContextOverflowWarning>` emitido por `buildWorkingContext` SHALL nombrar únicamente capacidades que el orquestador tiene: SHALL indicar que se delegue un Recall a `@memory-keeper` con el topic de la tarea. NO SHALL referenciar `searchMemory` ni ninguna otra tool de la que el orquestador no disponga. El aviso SHALL conservar el conteo de reglas omitidas, el registro por consola y el presupuesto de caracteres vigentes.

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

### Requirement: Refs normalizadas materializadas en el contenido del nodo

Todo nodo nuevo SHALL declarar sus referencias dentro de `content`, en un bloque parseable que
comienza con una línea `refs:` seguida de una lista con guion. La gramática SHALL ser cerrada y
normalizada:

```text
spec:<capability>#<stable-heading>
change:<stable-change-slug>
path:<repository-relative-path>
commit:<git-sha>
workitem:<tracker>:<external-key>
```

`commit:` y `workitem:` son opcionales. Las refs NO SHALL materializarse en una tabla ni en una
columna nueva: NO SHALL crearse `memory_refs` ni una migración de schema. La consulta inversa por
`spec:` o `change:` SHALL resolverse sobre el texto indexado de `content`. El bloque `refs:` es el
único elemento estructurado admitido en `content`.

#### Scenario: Un nodo declara sus refs en el contenido

- **WHEN** se escribe un nodo nuevo con un bloque `refs:` que contiene `change:mem-03-promocion-decisiones-refs`
  y `path:src/core/memory/engine.js`
- **THEN** el nodo persistido mantiene esas refs dentro de `content`
- **AND** el conjunto de objetos de `sqlite_master` es idéntico antes y después de la escritura

#### Scenario: Sin tabla ni columna nueva

- **WHEN** se escribe un nodo con refs
- **THEN** no existe la tabla `memory_refs` ni una columna de refs
- **AND** la lectura de `memory_nodes` conserva su DDL actual

### Requirement: Validación fail-closed de refs en el camino único de escritura

La validación de refs SHALL vivir en `recordNode`, el camino único de escritura del engine, y SHALL
ejecutarse antes de abrir la transacción: un rechazo NO SHALL escribir ni superseder ningún nodo. La
política SHALL ser fail-closed por construcción: se validan todas las escrituras que pasan por
`recordNode` y la única exención es una procedencia resuelta por el runtime exactamente igual a
`runtime` (default programático y fixtures). Una procedencia no prevista NO SHALL quedar exenta.
`cli:import` queda fuera porque NO SHALL pasar por `recordNode` y conserva su semántica
last-writer-wins. La superficie real de captura en producción es `mcp:ancleto-memory`; una
procedencia `agent:<rol>` provista por el host SHALL validarse por ser distinta de `runtime`.

Una `decision` SHALL tener al menos una ref `spec:` o `change:`. Una `rule` SHALL tener al menos una
ref `path:`, `spec:` o `change:`, o un `path:` que apunte a un archivo existente bajo `test/`. Un
bloque `refs:` vacío, una línea que no matchea la gramática o un prefijo de ref desconocido SHALL
rechazarse, nunca ignorarse. `path:` SHALL ser relativo al repositorio, NO SHALL ser absoluto, NO
SHALL contener `../` y SHALL apuntar a un archivo existente; un sufijo `:linea` es sólo un hint y NO
SHALL usarse para resolver.

Todo rechazo SHALL nombrar la `memory_key` y la regla violada, y la ref ofensora cuando aplique. Los
nodos existentes sin refs NO SHALL revalidarse, NO SHALL generar error y NO SHALL backfillearse. Las
firmas JSON Schema de las tools MCP NO SHALL ganar campos: `memory_key`, `content`, `justification` y
`scope` siguen siendo la superficie.

#### Scenario: Decisión sin ancla rechazada

- **WHEN** una superficie de captura intenta escribir una `decision` sin ref `spec:` ni `change:`
- **THEN** `recordNode` lanza un error que nombra la `memory_key` y la regla violada
- **AND** no se crea ni se supersede ningún nodo

#### Scenario: Regla sin anclaje rechazada

- **WHEN** una superficie de captura intenta escribir una `rule` sin `path:`, `spec:`, `change:` ni
  anclaje a un test existente
- **THEN** `recordNode` lanza un error que nombra la `memory_key` y la regla violada
- **AND** la base queda sin cambios

#### Scenario: Ref con prefijo desconocido o path inválido rechazada

- **WHEN** el bloque `refs:` contiene un prefijo no previsto, un `path:` absoluto o un `path:` con
  `../`
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref ofensora

#### Scenario: Los nodos existentes sin refs no generan error

- **WHEN** la memoria contiene nodos activos escritos antes de esta validación, sin refs
- **THEN** ninguna lectura los revalida ni falla
- **AND** no se reescriben ni se backfillean

#### Scenario: El import conserva su semántica

- **WHEN** se importa un JSON con entradas sin refs mediante `importNodes`
- **THEN** el import inserta y actualiza con la semántica last-writer-wins existente
- **AND** no aplica la validación de refs

#### Scenario: La escritura programática no se valida

- **WHEN** se invoca `engine.recordNode` con procedencia `runtime` (default, sin `source`) y sin refs
- **THEN** el nodo se persiste
- **AND** la validación de refs no se ejecuta

#### Scenario: Una procedencia distinta de runtime se valida

- **WHEN** se invoca `engine.recordNode` con `context.source` `agent:memory-keeper` y `content` sin refs
- **THEN** `recordNode` lanza un error que nombra la `memory_key` y la regla violada
- **AND** no se crea ni se supersede ningún nodo

### Requirement: Resolución de refs `change:` con unicidad

Una ref `change:<slug>` SHALL resolver a exactamente una ubicación: `aspec/changes/<slug>` para un
change activo, o un directorio `aspec/changes/archive/YYYY-MM-DD-<slug>` cuyo nombre coincida
exactamente con el formato `YYYY-MM-DD-<slug>` con el slug completo, sin admitir sufijos parciales del
slug, para un change archivado. La resolución SHALL validar unicidad: cero coincidencias o más de
una SHALL rechazar la escritura. El sistema NO SHALL elegir arbitrariamente entre un change activo y
uno archivado con el mismo slug, ni entre dos archives que coincidan.

#### Scenario: Una ref a un change archivado resuelve

- **WHEN** se escribe un nodo con `change:<slug>` y existe un único
  `aspec/changes/archive/YYYY-MM-DD-<slug>`
- **THEN** la ref resuelve y la escritura se acepta

#### Scenario: Una ref a un change activo resuelve

- **WHEN** se escribe un nodo con `change:<slug>` y existe `aspec/changes/<slug>`
- **THEN** la ref resuelve y la escritura se acepta

#### Scenario: Ref inexistente rechazada

- **WHEN** se escribe un nodo con `change:<slug>` y no existe ni el change activo ni un archive
  coincidente
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref

#### Scenario: Un slug parcial no resuelve

- **WHEN** se escribe un nodo con `change:<slug-parcial>` y el archive existente sólo coincide como
  sufijo de un slug más largo
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref
- **AND** la resolución no acepta coincidencias por sufijo parcial

#### Scenario: Ambigüedad no se resuelve al azar

- **WHEN** existen dos ubicaciones que coinciden con `change:<slug>`
- **THEN** la escritura se rechaza nombrando la `memory_key`, la ref y la ambigüedad
- **AND** el sistema no selecciona ninguna de las dos

### Requirement: Resolución de refs `spec:` por heading canónico

Una ref `spec:<capability>#<heading>` SHALL resolverse contra `aspec/specs/<capability>/spec.md`
comparando el heading contra las líneas `### Requirement: <texto>` del archivo, en forma exacta
(trim y colapso de espacios) y canónica (minúsculas, sin diacríticos, sin backticks ni negritas,
espacios colapsados). La resolución NO SHALL usar FTS, porque el índice sólo contiene el contenido de
`memory_nodes`. Cero coincidencias SHALL rechazar la escritura. Dos o más coincidencias bajo
cualquiera de las dos formas SHALL reportar ambigüedad y rechazar la escritura, sin elegir.

#### Scenario: Heading exacto resuelve

- **WHEN** se escribe un nodo con `spec:memory-engine#Alcance del bloque de reglas proactivas`
- **THEN** la ref resuelve contra el `Requirement` correspondiente y la escritura se acepta

#### Scenario: Heading canónico resuelve

- **WHEN** el heading de la ref difiere en mayúsculas, espacios o diacríticos del heading canónico
- **THEN** la ref resuelve por la forma canónica y la escritura se acepta

#### Scenario: Capability o heading inexistente rechazado

- **WHEN** la capability no tiene `spec.md` o el heading no coincide con ningún `Requirement`
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref

#### Scenario: Ambigüedad de heading reportada

- **WHEN** dos `Requirement` distintos canonicalizan al mismo heading
- **THEN** la escritura se rechaza reportando la ambigüedad
- **AND** el sistema no elige uno de los dos

### Requirement: Rechazo de secretos en el camino de escritura

Toda escritura de un nodo nuevo SHALL inspeccionar `content` y `justification` y SHALL rechazarla si
contiene un patrón de credencial: claves con prefijo `sk-`, `ghp_` o `AKIA`, encabezados
`Authorization: Bearer`, asignaciones tipo `TOKEN=`/`SECRET=`/`PASSWORD=` y bloques de clave privada.
El rechazo SHALL ser incondicional, sin importar la procedencia, y NO SHALL escribir ni superseder
ningún nodo. El mensaje SHALL nombrar la `memory_key` y la regla violada y NO SHALL repetir el valor
detectado. Un candidato de sesión —transcripción, estado transitorio de tareas o resumen de sesión— NO
SHALL clasificarse como decisión duradera en la captura; su rechazo corresponde al gate de promoción y
NO SHALL resolverse por heurística en el engine.

#### Scenario: Credencial en el contenido rechazada

- **WHEN** se intenta escribir un nodo cuyo `content` contiene `Authorization: Bearer <valor>`
- **THEN** la escritura se rechaza nombrando la `memory_key` y la regla
- **AND** el mensaje no incluye el valor detectado
- **AND** no se crea ningún nodo

#### Scenario: Credencial en la justificación rechazada

- **WHEN** se intenta escribir un nodo cuya `justification` contiene `API_TOKEN=<valor>`
- **THEN** la escritura se rechaza y la base queda sin cambios

#### Scenario: Texto sin credenciales no se bloquea

- **WHEN** `content` menciona una variable de entorno por su nombre sin asignarle un valor
- **THEN** la escritura se acepta

### Requirement: Render del bloque proactivo sin el bloque `refs:`

El render de `<ProjectMemoryRules>` en `buildWorkingContext` SHALL mostrar, por cada regla, sólo la
**prosa** de su `content`, omitiendo el bloque `refs:` completo —la línea `refs:` y sus entradas—.
El `content` **almacenado** SHALL permanecer intacto con sus refs: el recorte SHALL aplicarse
únicamente en el render del bloque proactivo y NO SHALL persistirse ni propagarse a otras salidas.
La lectura de operador, `export`, `list`, `searchMemory` y las tools MCP NO SHALL cambiar. Las
refs se resuelven bajo demanda y NO SHALL consumir el presupuesto fijo (`maxChars`) del bloque. El
orden, el filtro de nodos, el tope y el `<ContextOverflowWarning>` SHALL conservarse sin cambios.
Una regla cuyo `content` no tenga bloque `refs:` SHALL renderizarse igual que antes.

#### Scenario: Una regla con `refs:` se renderiza sin el bloque

- **WHEN** una regla activa del scope inyectado tiene un `content` compuesto por prosa seguida de un
  bloque `refs:` válido
- **THEN** el bloque `<ProjectMemoryRules>` muestra la prosa de esa regla
- **AND** el bloque NO muestra la línea `refs:` ni sus entradas
- **AND** el `content` almacenado del nodo sigue conteniendo el bloque `refs:`

#### Scenario: Una regla sin `refs:` no cambia

- **WHEN** una regla activa del scope inyectado tiene un `content` sin bloque `refs:`
- **THEN** el bloque `<ProjectMemoryRules>` la renderiza con la prosa completa, igual que antes
- **AND** no se agrega ni se quita texto

#### Scenario: Las demás salidas conservan las refs

- **WHEN** se lee el mismo nodo por `export`, `list`, `searchMemory` o las tools MCP
- **THEN** el `content` devuelto incluye su bloque `refs:`
- **AND** el orden, el filtro, el tope y el aviso de truncamiento del bloque proactivo no cambian
