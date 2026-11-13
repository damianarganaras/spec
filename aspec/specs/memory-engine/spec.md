# Spec: memory-engine

## Purpose

Memoria persistente del proyecto (`.ancleto/memory.db`) consultada por el orquestador y expuesta
vía tools MCP. Define qué nodos se inyectan proactivamente en el system prompt y cuáles se
recuperan reactivamente, mantiene coherente el contrato documentado con el comportamiento real y
define la materialización día-cero del working-context con la topología, incluso sin base de memoria.

## Requirements

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

### Requirement: Coherencia entre contrato documentado e inyección

La documentación de producto y la descripción del campo `scope` de las tools MCP SHALL describir con precisión qué nodos se inyectan proactivamente: las `rule` activas con scope `project`. Las `decision` son reactivas. NO SHALL afirmarse que toda entrada de scope `project` (incluidas las `decision`) entra en `<ProjectMemoryRules>`. La documentación SHALL describir además la inyección día-cero: el bloque `<ProjectTopology>` se materializa e inyecta desde el día cero aunque no haya reglas ni base de memoria, y la descripción de la materialización del working-context SHALL coincidir con el comportamiento real de la CLI.

La documentación de producto (`README.md`) SHALL describir `searchMemory` de forma consistente con
`Recall task-aware con orden total, preview expandible y keys requeridas`: SHALL indicar que el
modo por defecto devuelve una previsualización —prefijo literal de hasta 240 caracteres, `limit` 5
y `content_truncated`— y NO SHALL presentar el `content` completo como resultado por defecto.
SHALL nombrar `expand`, `keys` y `required` como las entradas de llamada que habilitan el
contenido completo, la expansión selectiva y la promoción de claves. La documentación de uso para
agentes SHALL remitirse al bloque canónico `LOCKED: memory-protocol` de `AGENTS.md`.

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

#### Scenario: El README describe el modo preview por defecto

- **WHEN** se revisa la fila de `searchMemory` en `README.md`
- **THEN** indica que el modo por defecto devuelve una previsualización con `limit` 5 y
  `content_truncated`
- **AND** no presenta el `content` completo como resultado por defecto

#### Scenario: El README nombra las entradas de expansión y requisitos

- **WHEN** se revisa la fila de `searchMemory` en `README.md`
- **THEN** nombra `expand`, `keys` y `required`
- **AND** describe el preview como un prefijo literal de hasta 240 caracteres

#### Scenario: El README remite al protocolo canónico

- **WHEN** se revisa la descripción de uso de `searchMemory` en `README.md`
- **THEN** remite al bloque `LOCKED: memory-protocol` de `AGENTS.md` como fuente del protocolo para
  agentes

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
NO SHALL ampliar el recall sobre un hit ya existente de la pass 1.

Los resultados de cada pass SHALL ordenarse por el orden total definido en `Recall task-aware con
orden total, preview expandible y keys requeridas`: requerido, anclaje declarado, scope específico,
`bm25` ascendente y `memory_key` ascendente. En FTS5 `bm25` es negativo y `ORDER BY rank` es
numéricamente ascendente, por lo que NO SHALL usarse `rank DESC`. El orden NO SHALL usar `n.rowid`
como criterio ni como desempate. El orden SHALL aplicarse tanto a
la pass 1 (AND) como a la pass 2 (OR con prefijos), de modo que sea **total**. Cuando la cantidad
de coincidencias supere el `limit`, ese orden total SHALL determinar de forma unívoca el
subconjunto devuelto.

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
- **AND** el nodo esperado puede quedar en posición #2 o posterior; es una limitación conocida del
  fallback OR-prefijo, sin un conteo fijo de invocaciones

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

El `<ContextOverflowWarning>` emitido por `buildWorkingContext` SHALL nombrar únicamente capacidades
que el orquestador tiene: SHALL indicar que se delegue un Recall a `@memory-keeper` con el topic de
la tarea. NO SHALL referenciar `searchMemory` ni ninguna otra tool de la que el orquestador no
disponga.

El bloque completo `<ProjectMemoryRules>` —wrapper, etiqueta de datos no confiables, reglas
incluidas y `<ContextOverflowWarning>`— SHALL respetar el presupuesto
`maxTokens × CHARS_PER_TOKEN`. Antes de cortar reglas, el render SHALL reservar para el aviso
`min(1.500, 15% de maxChars)` caracteres, acotado a `maxChars`. Por debajo del piso que exige el
wrapper —`<ProjectMemoryRules>`, la etiqueta de datos no confiables y el cierre— NO SHALL incluirse
ninguna regla, y el bloque SHALL seguir siendo XML bien formado. El presupuesto SHALL considerarse
aplicable a todo `maxChars` que cubra ese piso.

Deuda declarada, fuera de este change: la ventana `[piso del wrapper, piso del wrapper + aviso
mínimo]`. En esa ventana puede entrar una regla corta aunque el contrato no lo permita, y si ni el
aviso mínimo entra, `formatOverflowWarning` devuelve `''` y la omisión no requerida queda sólo en
`console.warn`. No se toca la aritmética del presupuesto.

El aviso SHALL conservar el conteo de reglas omitidas y el registro por consola, y SHALL nombrar las
`memory_key` de las reglas omitidas en el mismo orden determinístico de inyección, hasta un tope de
40 claves. Si la reserva de caracteres o el tope dejan claves sin listar, el aviso SHALL agregar el
sufijo `+N`, donde `N` es la cantidad de reglas omitidas que no se listaron. El orden de las claves
listadas SHALL ser siempre un prefijo del orden de inyección.

Las reglas declaradas en `required` NO SHALL contarse como omitidas ni listarse en el aviso: o se
inyectan completas o la construcción falla con el error diagnóstico definido en
`Recall task-aware con orden total, preview expandible y keys requeridas`. El aviso SHALL gobernar
únicamente las reglas no requeridas que no entran en el presupuesto.

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

#### Scenario: Una regla requerida no aparece como omitida

- **WHEN** el bloque se construye con `required` y hay reglas no requeridas que no entran en el
  presupuesto
- **THEN** el aviso lista únicamente las `memory_key` omitidas no requeridas
- **AND** ninguna `memory_key` declarada en `required` aparece en el aviso ni en el conteo

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

`change:<stable-change-slug>` SHALL escribirse con el slug del change **tal como se nombra el
change**, sin el prefijo `YYYY-MM-DD-`. El prefijo de fecha lo aporta únicamente el nombre del
directorio archivado (`aspec/changes/archive/YYYY-MM-DD-<slug>`) y NO SHALL incluirse en la ref.

`commit:` y `workitem:` son opcionales. Las refs NO SHALL materializarse en una tabla ni en una
columna: NO SHALL crearse `memory_refs` ni ninguna migración de schema para refs. La columna
operativa `superseded_at` de `memory_nodes` pertenece al contrato de GC de `memory-ops` y NO SHALL
interpretarse como materialización de refs. La consulta inversa por
`spec:` o `change:` SHALL resolverse sobre el texto indexado de `content`. El bloque `refs:` es el
único elemento estructurado admitido en `content`.

Los items de la lista SHALL poder ir indentados o no, y ambas formas SHALL parsearse de forma
idéntica: un item es toda línea que matchea un guion seguido de un espacio (`- `) con cualquier
indentación previa, incluida ninguna, y su contenido SHALL validarse contra la gramática cerrada.

El bloque SHALL terminar en la primera línea en blanco o en la primera línea que no sea item de
lista ni esté indentada. Una línea indentada que no es item SHALL permanecer dentro del bloque y
SHALL ser inválida. Toda línea no-item dentro del bloque SHALL ser inválida. Un bloque sin items NO
SHALL aportar refs; el rechazo en escritura de ese caso corresponde al Requirement de validación
fail-closed y NO se re-enuncia acá.

#### Scenario: Un nodo declara sus refs en el contenido

- **WHEN** se escribe un nodo nuevo con un bloque `refs:` que contiene `change:mem-03-promocion-decisiones-refs`
  y `path:src/core/memory/engine.js`
- **THEN** el nodo persistido mantiene esas refs dentro de `content`
- **AND** el conjunto de objetos de `sqlite_master` es idéntico antes y después de la escritura

#### Scenario: Sin tabla ni columna de refs

- **WHEN** se escribe un nodo con refs
- **THEN** no existe la tabla `memory_refs` ni una columna de refs
- **AND** `memory_nodes` no incorpora ninguna columna derivada de las refs

#### Scenario: Items sin indentar se parsean

- **WHEN** un `content` declara `refs:` seguido de items de lista sin indentación
- **THEN** los items se parsean y se validan igual que los items indentados
- **AND** el bloque aporta todas las refs declaradas

#### Scenario: Items indentados siguen funcionando

- **WHEN** un `content` declara `refs:` seguido de items de lista indentados
- **THEN** los items se parsean y se validan como antes
- **AND** el bloque aporta todas las refs declaradas

#### Scenario: El bloque termina en línea en blanco

- **WHEN** un `content` declara `refs:` con items y luego una línea en blanco seguida de prosa
- **THEN** el bloque termina antes de la línea en blanco
- **AND** la prosa posterior no se interpreta como refs

#### Scenario: Línea no-item dentro del bloque es inválida

- **WHEN** un `content` declara `refs:` y dentro del bloque aparece una línea indentada que no es
  item de lista
- **THEN** esa línea se reporta como inválida
- **AND** no se ignora ni se trata como continuación válida del bloque

#### Scenario: El slug canónico de `change:` resuelve

- **WHEN** se escribe un nodo con `change:<stable-change-slug>` y el slug corresponde al nombre del
  change, activo o archivado, sin el prefijo de fecha
- **THEN** la ref resuelve y la escritura se acepta
- **AND** la ref no incluye el prefijo `YYYY-MM-DD-`

#### Scenario: El slug con prefijo de fecha no resuelve

- **WHEN** se escribe un nodo con `change:<YYYY-MM-DD-slug>` incluyendo el prefijo de fecha en la
  ref
- **THEN** la escritura se rechaza nombrando la `memory_key` y la ref
- **AND** la resolución reporta el change como inexistente, porque el prefijo de fecha sólo lo
  aporta el nombre del directorio archivado

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

### Requirement: Exposición de la ubicación resuelta de las refs

El engine SHALL exponer una única superficie read-only, `resolveNodeRefs({ content, projectRoot })`,
que parsea el bloque `refs:` de un nodo y devuelve, en el orden en que las refs están declaradas, la
ubicación resuelta de cada una. La superficie SHALL reutilizar el parser de bloques `refs:` y la
resolución de refs del camino de escritura; NO SHALL existir un segundo parser ni un segundo
resolvedor. La llamada NO SHALL escribir en la base ni en el filesystem y NO SHALL modificar nodos.

Cada entrada SHALL identificar la ref textual declarada, su `kind` y su `verifiable`. Una ref
`spec:`, `change:` o `path:` que resuelve SHALL devolver `ok: true` y su ubicación; una que no
resuelve SHALL devolver `ok: false` y un `reason` acotado de la taxonomía vigente: `inexistente`,
`ambiguo (<n> coincidencias)`, `inválido (<causa>)` o
`inválido (lectura no disponible: <CODE>)`.

La ubicación SHALL ser:

- `change:` → el path repo-relativo del directorio resuelto, con separadores `/`:
  `aspec/changes/<slug>` para el activo o `aspec/changes/archive/YYYY-MM-DD-<slug>` para el
  archivado.
- `spec:` → el path `aspec/specs/<capability>/spec.md` y el texto **real** del `### Requirement:`
  que matcheó, no su forma canónica. La resolución NO SHALL usar FTS.
- `path:` → el path repo-relativo normalizado, con separadores `/` y sin el sufijo `:linea`. NO
  SHALL resolverse con `realpath` ni exigir containment de symlinks.

Una ref `commit:` o `workitem:` NO SHALL reportarse como resuelta ni como rota: SHALL devolverse con
`verifiable: false` y sin ubicación ni `reason`. Cuando una ref de `spec:` o `change:` tiene más de
una coincidencia, el sistema NO SHALL elegir: SHALL reportar `ambiguo (<n> coincidencias)` y omitir
la ubicación. Cero coincidencias SHALL reportarse como `inexistente` y NO SHALL abortar la
resolución de las demás refs del nodo.

Sin raíz de proyecto, la superficie NO SHALL intentar resolver: SHALL devolver `needsRoot: true` y
cada ref verificable SHALL devolver `ok: false` con `reason` `sin raíz`, sin abortar el resto de las
refs del nodo. Esa condición SHALL ser una abstención y NO SHALL reportarse como falla del nodo.
`needsRoot` SHALL ser `true` sólo si el nodo declara al menos una ref `spec:`, `change:` o `path:`.

Una línea inválida del bloque `refs:` SHALL devolver `refs: []` y exponer el defecto en el campo raíz
`error` con el texto de esa línea; más de un bloque `refs:` SHALL devolver `refs: []` y exponer el
conteo en el campo raíz `blocks` (> 1). En ambos casos la llamada NO SHALL lanzar, el defecto NO
SHALL ignorarse y las refs de ese bloque NO SHALL resolverse. Un error de lectura durante la
resolución de una ref SHALL reportarse como `inválido (lectura no disponible: <CODE>)` para esa ref,
sin abortar el nodo ni las refs restantes.

#### Scenario: Un change activo expone su directorio

- **WHEN** un nodo declara `change:<slug>` y existe `aspec/changes/<slug>`
- **THEN** la entrada de esa ref devuelve `ok: true` y `path` `aspec/changes/<slug>`

#### Scenario: Un change archivado expone su directorio

- **WHEN** un nodo declara `change:<slug>` y existe un único
  `aspec/changes/archive/YYYY-MM-DD-<slug>`
- **THEN** la entrada de esa ref devuelve `ok: true` y el path repo-relativo de ese archive

#### Scenario: Un spec expone path y el heading real

- **WHEN** la ref `spec:<capability>#<heading>` difiere en mayúsculas o diacríticos del
  `### Requirement:` del archivo pero canonicaliza al mismo heading
- **THEN** la entrada devuelve `ok: true`, el path del `spec.md` de la capability y el texto real
  del heading tal como figura en el archivo

#### Scenario: Un spec ambiguo no elige

- **WHEN** dos `### Requirement:` del mismo `spec.md` canonicalizan al heading de la ref
- **THEN** la entrada devuelve `ok: false` y `reason` `ambiguo (2 coincidencias)`
- **AND** no devuelve `path` ni `heading`

#### Scenario: Un change ambiguo no elige

- **WHEN** existen dos archives que coinciden con `change:<slug>`
- **THEN** la entrada devuelve `ok: false` y `reason` `ambiguo (2 coincidencias)`
- **AND** no devuelve `path` y no selecciona ninguno de los dos

#### Scenario: Un path se expone normalizado

- **WHEN** un nodo declara `path:` con separadores `\` y sufijo `:linea` y el archivo existe
- **THEN** la entrada devuelve `ok: true` y el path repo-relativo con separadores `/`
- **AND** el path devuelto no incluye el sufijo `:linea`

#### Scenario: commit y workitem no son verificables

- **WHEN** un nodo declara `commit:<sha>` o `workitem:<tracker>:<key>`
- **THEN** la entrada devuelve `verifiable: false`
- **AND** no devuelve ubicación y no reporta la ref como resuelta ni como rota

#### Scenario: Sin raíz no hay resolución y queda como abstención

- **WHEN** se invoca la superficie con refs `spec:`, `change:` o `path:` y sin `projectRoot`
- **THEN** el resultado reporta `needsRoot: true`
- **AND** cada ref verificable devuelve `ok: false` y `reason` `sin raíz`
- **AND** las refs restantes del nodo no se abortan y la condición no se reporta como falla del nodo

#### Scenario: Una línea inválida queda en la raíz del resultado

- **WHEN** el `content` declara un bloque `refs:` con un item de gramática inválida
- **THEN** el resultado devuelve `refs: []` y el campo raíz `error` con el texto de esa línea
- **AND** la llamada no lanza y no resuelve las refs de ese bloque

#### Scenario: Más de un bloque refs queda en la raíz del resultado

- **WHEN** el `content` declara dos o más bloques `refs:`
- **THEN** el resultado devuelve `refs: []` y el campo raíz `blocks` con el conteo (> 1)
- **AND** la llamada no lanza y no resuelve las refs de esos bloques

#### Scenario: Error de lectura no aborta el nodo

- **WHEN** la lectura de una fuente referenciada falla con un código del runtime
- **THEN** la entrada de esa ref devuelve `ok: false` y
  `reason` `inválido (lectura no disponible: <CODE>)`
- **AND** las demás refs del nodo se resuelven igual

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

### Requirement: Idempotencia de reescritura idéntica en recordNode

`recordNode` SHALL comparar la escritura entrante contra el nodo activo de la misma `memory_key` y
SHALL tratar como no-op una reescritura idéntica. La identidad SHALL definirse por la tupla
(`memory_key`, `type`, `scope`, `content`, `justification`) comparada por igualdad exacta de string
contra el nodo activo. `createdAt`, `source` y `confidence` NO SHALL formar parte de la identidad.

Cuando los cinco campos coincidan, `recordNode` NO SHALL insertar, NO SHALL actualizar y NO SHALL
superseder; la transacción SHALL abrir y cerrar limpiamente y el resultado SHALL devolver
`superseded: 0` junto con los valores persistidos del nodo activo —`memory_key`, `type`, `scope`,
`content`, `justification` y el `created_at` existente—. Cuando cualquiera de los cinco campos
difiera, el comportamiento SHALL permanecer sin cambios: superseder el nodo activo, insertar un
nodo nuevo con un UUID nuevo y devolver `superseded: 1`.

El orden de validación NO SHALL cambiar: `looksLikeSecret` y `validateRefsForWrite` SHALL ejecutarse
antes de abrir la transacción y antes de la comprobación de identidad, de modo que una escritura
rechazada siga rechazándose aunque sea idéntica. El objeto devuelto NO SHALL ganar campos y se
mantiene la decisión `recordnode-return-shape-no-superseded-node`.

`importNodes` NO SHALL modificarse: conserva su semántica last-writer-wins por `createdAt`. Los
caminos de supersesión de `merge` y `consolidate` NO SHALL modificarse.

Como consecuencia, una reescritura idéntica de un nodo `rule` + `project` ya no SHALL disparar el
refresh del working-context por la condición de supersesión; SHALL seguir disparándolo por la
condición de contribución directa (`type === 'rule' && scope === 'project'`). Una reescritura
idéntica de una `decision` NO SHALL disparar refresh porque no ocurrió cambio. Este efecto es
intencional.

#### Scenario: Reescritura idéntica de una memory_key no crea nodo ni supersede

- **WHEN** se registra una `memory_key` activa con un payload idéntico en `type`, `scope`, `content`
  y `justification` al del nodo activo
- **THEN** no se inserta ningún nodo nuevo
- **AND** el nodo activo no se supersede
- **AND** el resultado devuelve `superseded: 0`

#### Scenario: Reescritura con contenido distinto supersede como hoy

- **WHEN** se registra una `memory_key` activa con un `content` distinto al del nodo activo
- **THEN** el nodo activo se supersede
- **AND** se inserta un nodo nuevo con un UUID nuevo
- **AND** el resultado devuelve `superseded: 1`

#### Scenario: Reescritura idéntica devuelve los valores persistidos del nodo activo

- **WHEN** una reescritura idéntica se trata como no-op
- **THEN** el resultado devuelve `memory_key`, `type`, `scope`, `content` y `justification` del nodo
  activo
- **AND** el `created_at` devuelto es el `created_at` existente del nodo activo, no uno nuevo
- **AND** el objeto devuelto no incorpora campos adicionales

#### Scenario: La validación de refs se ejecuta antes de la comprobación de identidad

- **WHEN** una escritura es idéntica al nodo activo pero no cumple la validación de refs
- **THEN** `recordNode` la rechaza nombrando la `memory_key` y la regla violada
- **AND** no se inserta ni se supersede ningún nodo
- **AND** el rechazo ocurre antes de la comprobación de identidad

#### Scenario: La identidad cruza type y scope: un type o scope distinto supersede

- **WHEN** se registra la misma `memory_key` con `content` y `justification` idénticos pero con un
  `type` o un `scope` distinto al del nodo activo
- **THEN** el nodo activo se supersede
- **AND** se inserta un nodo nuevo
- **AND** el resultado devuelve `superseded: 1`

#### Scenario: La idempotencia no altera importNodes

- **WHEN** se importa mediante `importNodes` una entrada con la misma `memory_key` que un nodo
  existente
- **THEN** el import conserva su semántica last-writer-wins por `createdAt`
- **AND** no aplica la comprobación de identidad de `recordNode`

### Requirement: Render del bloque proactivo sin el bloque `refs:`

El render de `<ProjectMemoryRules>` en `buildWorkingContext` SHALL mostrar, por cada regla, sólo la
**prosa** de su `content`, omitiendo el bloque `refs:` completo —la línea `refs:` y sus entradas—.
El `content` **almacenado** SHALL permanecer intacto con sus refs: el recorte SHALL aplicarse
únicamente en el render del bloque proactivo y NO SHALL persistirse ni propagarse a otras salidas.
La lectura de operador, `export`, `list`, las tools MCP y `searchMemory` con `expand: true` —que
devuelve el `content` byte a byte— NO SHALL cambiar. El modo preview por defecto de `searchMemory`
es el contrato nuevo de este change y queda fuera de esta garantía de no cambio. Las refs se
resuelven bajo demanda y NO SHALL consumir el presupuesto fijo (`maxChars`) del bloque. El orden, el
filtro de nodos, el tope y el `<ContextOverflowWarning>` SHALL conservarse sin cambios. Una regla
cuyo `content` no tenga bloque `refs:` SHALL renderizarse igual que antes.

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

- **WHEN** se lee el mismo nodo por `export`, `list`, las tools MCP o `searchMemory` con `expand: true`
- **THEN** el `content` devuelto incluye su bloque `refs:`
- **AND** el orden, el filtro, el tope y el aviso de truncamiento del bloque proactivo no cambian

### Requirement: Orden determinístico de inyección de reglas

El orden de inyección de `rule` en `<ProjectMemoryRules>` SHALL ser determinístico y total. El
criterio SHALL aplicarse en este orden:

1. Reglas declaradas en `required`: primero, en el orden en que el llamador las declaró.
2. Jerarquía de scope: `task` antes que `feature` antes que `project`.
3. Anclaje declarado: las reglas que declaran al menos una ref `spec:`, `change:` o `path:` en su
   bloque `refs:` antes que las que no declaran ninguna.
4. `created_at` descendente.
5. `memory_key` lexicográfico ascendente.

`required` SHALL ser la clave `required` del cuarto argumento de opciones de
`buildWorkingContext`, con la firma `buildWorkingContext(scope, maxTokens, cwd, { required })`;
NO SHALL persistirse, NO SHALL ser una columna ni una tabla, y NO SHALL
formar parte del nodo devuelto por las superficies de lectura. Su efecto SHALL limitarse al orden y
al presupuesto de esa construcción.

El renderer del working-context SHALL obtener `required` del conjunto crítico declarado en la
configuración del proyecto (`.ancletorc` → `memory.criticalKeys`) y SHALL pasarlo como ese cuarto
argumento. Cuando la configuración no declara la clave, `required` SHALL ser `[]`.

Una regla no declarada en `required` NO SHALL desplazar a una requerida: mientras una requerida entre
en el presupuesto, ninguna no requerida se incluye si esa requerida queda fuera.

El anclaje SHALL determinarse únicamente parseando el bloque `refs:` del `content`. La evaluación
NO SHALL resolver las refs, NO SHALL consultar el filesystem ni la base de datos, y NO SHALL agregar
I/O al render. Una regla sin bloque `refs:`, con un bloque inválido o con un bloque que sólo declara
`commit:` o `workitem:` NO SHALL contar como anclada.

Dos corridas de `buildWorkingContext` sobre el mismo estado de memoria, el mismo `maxTokens` y las
mismas `required` SHALL producir el mismo bloque. Para un estado de DB fijo y la misma configuración
de claves críticas, el orden y el corte SHALL ser determinísticos.

#### Scenario: La regla requerida se inyecta primero

- **WHEN** dos reglas activas del scope inyectado compiten por el presupuesto
- **AND** una de ellas está declarada en `required` y la otra tiene mejor scope o mejor anclaje
- **THEN** la regla requerida se ordena antes
- **AND** si sólo entra una, entra la requerida

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

#### Scenario: El conjunto requerido proviene de la configuración del proyecto

- **WHEN** `.ancletorc` declara `memory.criticalKeys` con una lista de `memory_key`
- **THEN** el renderer del working-context pasa esas claves como `required`
- **AND** el orden declarado en la configuración es el orden de inyección

#### Scenario: Una regla no crítica no desplaza a una requerida

- **WHEN** el presupuesto no alcanza para todas las reglas activas del scope
- **AND** una regla requerida entra en el presupuesto
- **THEN** ninguna regla no requerida se incluye si esa requerida quedó fuera
- **AND** el corte no altera el orden determinístico de las reglas incluidas

### Requirement: Recall task-aware con orden total, preview expandible y keys requeridas

`searchMemory` SHALL devolver resultados en un orden total determinístico, independiente de
`n.rowid` y del orden físico de inserción, aplicado después de filtrar `status = 'active'` y el
`type` solicitado. El orden SHALL ser, en este orden:

1. Nodos cuyas `memory_key` están declaradas en `required`, en el orden declarado por el llamador.
2. Nodos que declaran al menos una ref `spec:`, `change:` o `path:` en su bloque `refs:`
   (anclaje declarado, decidido parseando el content sin resolver refs ni hacer I/O) antes que los
   que no declaran ninguna.
3. Scope más específico según `SCOPE_RANK`: `task` antes que `feature` antes que `project`.
4. `bm25` ascendente, con el mejor primero.
5. `memory_key` lexicográfico ascendente.

`n.rowid` NO SHALL usarse como criterio de orden ni como desempate. Cuando la cantidad de
coincidencias supere el `limit`, el subconjunto devuelto SHALL ser el prefijo de longitud `limit`
de ese orden total. Dos corridas sobre un mismo estado SHALL devolver el mismo contenido y el mismo
orden.

`searchMemory` SHALL devolver previsualizaciones por defecto y NO SHALL incluir el `content`
completo en ese modo. Cada resultado previsualizado SHALL incluir `memory_key`, `type`, `scope`,
`created_at`, `preview` y `content_truncated`. La `preview` SHALL ser un prefijo literal del
`content` —los mismos bytes para ese tramo, sin normalizar espacios ni saltos de línea— de a lo sumo
240 caracteres; cuando el `content` exceda 240 caracteres, la `preview` SHALL ser
`content.slice(0, 239)` seguida de `…`, y cuando no exceda, SHALL ser el `content` sin cambios. Si el
último code unit del corte es un high surrogate (`0xD800`–`0xDBFF`), el corte SHALL reducirse un code
unit más, de modo que la `preview` resultante siga siendo de a lo sumo 240 caracteres y siempre un
prefijo literal del `content`.
`content_truncated` SHALL ser `true` exactamente cuando el `content` excede 240 caracteres; a 240
caracteres exactos NO SHALL haber recorte y `content_truncated` SHALL ser `false`. NO SHALL existir
truncamiento sin marca.

`expand: true` SHALL devolver el `content` completo en lugar de la previsualización, con la forma
heredada exacta de seis campos: `memory_key`, `type`, `scope`, `content`, `justification` y
`created_at`. `keys` SHALL expandir el `content` completo únicamente de las `memory_key` indicadas
que estén presentes en la página devuelta; el resto de la página SHALL conservar la previsualización.
Una `memory_key` pedida que esté ausente de la página devuelta —aunque exista en la DB— SHALL
provocar un error explícito que la nombre, sin descartarla en silencio. Si se envían `expand: true` y
`keys` a la vez, `expand: true` SHALL prevalecer.

El `limit` por defecto SHALL ser 5 y SHALL conservar el clamp `[1, 50]`. El payload heredado se
garantiza con `expand: true` y un `limit` explícito; el cambio de default de 10 a 5 es intencional
y forma parte del contrato nuevo.

`required` SHALL ser una lista de `memory_key` recibida en la llamada, NO SHALL persistirse y NO
SHALL ser una columna ni una tabla. En `searchMemory`, los nodos requeridos SHALL devolverse primero
aun cuando el match FTS no los incluya, y SHALL respetar el filtro `type` y `status = 'active'`. Si
una `memory_key` requerida no existe, no está activa o no satisface el filtro `type`, la llamada
SHALL fallar con un error que nombre la `memory_key`; nunca SHALL omitirla en silencio. Si
`required.length` excede el `limit` efectivo, la llamada SHALL fallar con un error que nombre las
`memory_key` que no entran; nunca SHALL descartarlas. Cuando la
consulta no produce términos FTS y hay keys requeridas, la llamada SHALL devolver las requeridas y
ningún otro resultado; sin keys requeridas SHALL devolver `[]`.

`buildWorkingContext` SHALL aceptar `required` con la firma
`buildWorkingContext(scope, maxTokens, cwd, { required })`, preservando la firma posicional vigente
`(scope, maxTokens, cwd)`. Las reglas requeridas SHALL
inyectarse completas y primero, en el orden declarado. Si una `memory_key` requerida no existe como
`rule` activa del scope inyectado, la construcción SHALL fallar con un error que nombre la
`memory_key`. Si una regla requerida no entra en el presupuesto disponible —el mismo techo que usa
la inclusión normal: `maxChars` menos el wrapper y la reserva del aviso—, la construcción SHALL
fallar con un error que nombre la `memory_key` y la ruta repo-relativa de sus refs resueltas,
obtenida reutilizando `resolveNodeRefs`; si ninguna ref declarada resuelve con `ok: true` y `path`
—no declara refs, o todas están rotas, ambiguas o sin raíz—, el error SHALL indicar
`sin refs resolubles`. La construcción NO SHALL truncar el contenido de una regla requerida, NO
SHALL devolver un bloque parcial y NO SHALL degradar la requerida a una omisión silenciosa.

#### Scenario: El requerido va primero aunque el bm25 lo deje último

- **WHEN** `searchMemory` recibe `required: ['k-req']` y la query matchea `k-req` junto con nodos de
  mejor `bm25`
- **THEN** `k-req` es el primer resultado
- **AND** el resto conserva el orden total

#### Scenario: El anclaje declarado gana al scope más específico

- **WHEN** dos nodos empatan en requerido y uno declara una ref `spec:`, `change:` o `path:`
  mientras el otro no declara ninguna, aunque el segundo tenga un scope más específico
- **THEN** el nodo anclado se ordena antes

#### Scenario: El empate de bm25 se resuelve por memory_key, no por rowid

- **WHEN** varios nodos con contenido idéntico empatan en `bm25` y `limit` es menor que la cantidad
  de coincidencias
- **THEN** el subconjunto devuelto son las `memory_key` lexicográficamente menores
- **AND** insertar los mismos nodos en orden inverso no cambia el subconjunto ni el orden

#### Scenario: Reconstruir la DB no cambia el orden

- **WHEN** se exporta el corpus y se importa en una base nueva, de modo que los `rowid` cambian
- **THEN** la misma query devuelve el mismo orden y el mismo subconjunto de `memory_key`

#### Scenario: La previsualización se marca

- **WHEN** el `content` de un nodo excede 240 caracteres y se invoca `searchMemory` sin `expand`
- **THEN** el resultado incluye `preview` de como máximo 240 caracteres terminado en `…`
- **AND** `content_truncated` es `true`
- **AND** el resultado no incluye el campo `content`

#### Scenario: Exactamente 240 caracteres no se recorta

- **WHEN** el `content` de un nodo tiene exactamente 240 caracteres y se invoca `searchMemory` sin `expand`
- **THEN** `preview` es el `content` completo, sin `…`
- **AND** `content_truncated` es `false`

#### Scenario: 241 caracteres se recorta como prefijo literal

- **WHEN** el `content` de un nodo tiene 241 caracteres y se invoca `searchMemory` sin `expand`
- **THEN** `preview` tiene 240 caracteres, termina en `…` y sus primeros 239 caracteres coinciden con los primeros 239 del `content`
- **AND** `content_truncated` es `true`

#### Scenario: expand devuelve el payload heredado

- **WHEN** se invoca `searchMemory` con `expand: true`
- **THEN** cada resultado tiene exactamente los seis campos heredados
- **AND** `content` coincide byte a byte con el contenido almacenado

#### Scenario: keys expande sólo las claves pedidas presentes en la página

- **WHEN** se invoca `searchMemory` con `keys: ['k2']` sobre una página que contiene `k1` y `k2`
- **THEN** `k2` devuelve su `content` completo
- **AND** `k1` conserva su previsualización

#### Scenario: Una clave pedida ausente de la página falla

- **WHEN** `keys` incluye una `memory_key` ausente de la página devuelta, aunque exista en la DB
- **THEN** la llamada falla nombrando la clave
- **AND** no devuelve resultados parciales

#### Scenario: El default de limit es 5

- **WHEN** se omite `limit` y hay más de cinco coincidencias
- **THEN** se devuelven cinco resultados

#### Scenario: Una key requerida inexistente falla

- **WHEN** `searchMemory` recibe `required` con una `memory_key` que no existe o está inactiva
- **THEN** la llamada falla con un error que nombra la `memory_key`
- **AND** no devuelve resultados parciales

#### Scenario: required excedido falla nombrando las keys que no entran

- **WHEN** `searchMemory` recibe `required` con más `memory_key` que el `limit` efectivo
- **THEN** la llamada falla con un error que nombra las `memory_key` que no entran
- **AND** no descarta ninguna requerida en silencio ni eleva el `limit`

#### Scenario: Una requerida fuera de presupuesto falla con key y ruta

- **WHEN** `buildWorkingContext` recibe `required` y una regla requerida no entra en el presupuesto
- **THEN** la construcción falla con un error que nombra la `memory_key`
- **AND** el error incluye la ruta repo-relativa de las refs resueltas de esa regla
- **AND** no se devuelve un bloque parcial

#### Scenario: La requerida sin refs resolubles se informa como tal

- **WHEN** una regla requerida no entra en el presupuesto y ninguna ref declarada resuelve con `ok: true` y `path`
- **THEN** el error indica `sin refs resolubles` junto con la `memory_key`

#### Scenario: required no se persiste

- **WHEN** se invoca `buildWorkingContext` o `searchMemory` con `required`
- **THEN** el nodo recuperado después no expone un campo `required`
- **AND** el schema de la base no incorpora columnas ni tablas por `required`

### Requirement: Conjunto crítico estable del working-context

La configuración del proyecto SHALL poder declarar un conjunto de `memory_key` críticas en
`.ancletorc`, bajo la clave aditiva `memory.criticalKeys`. El renderer del working-context SHALL leer
esa lista en sus dos puntos de render (`renderWorkingContextBlock` y `refreshWorkingContextOnWrite`)
y SHALL pasarla como `required` a `buildWorkingContext`. Las claves declaradas SHALL inyectarse
primero, en el orden declarado, sin que una regla no crítica pueda desplazarlas.

La lectura SHALL ser tolerante: si la clave está ausente, no es un array o contiene entradas que no
son strings, el valor efectivo SHALL ser la lista vacía y el comportamiento SHALL ser idéntico al
vigente.

Si una `memory_key` declarada no existe como `rule` activa del scope inyectado, o no entra en el
presupuesto, la generación SHALL fallar con un error que nombre la `memory_key`. En la superficie
explícita `ancleto memory context` (incluido `--out`) el proceso SHALL salir con código distinto de
cero y NO SHALL sobrescribir el archivo de working-context previo. El refresh de lifecycle (`init`,
`install`, `upgrade`) y la superficie on-write del MCP SHALL mantener el fallo visible con
`console.warn` nombrando la `memory_key` y NO SHALL escribir un bloque degradado; el refresh on-write
SHALL propagar el error de render a su llamador, y el llamador del MCP SHALL registrarlo con
`console.warn` y continuar best-effort. Las superficies que aplican una escritura y refrescan el
working-context como efecto derivado, `memory merge` y `memory consolidate --apply`, SHALL salir con
código distinto de cero cuando ese refresh falla por una clave crítica, y NO SHALL reportar éxito con
el bloque derivado desactualizado.

Este requirement NO SHALL alterar el contrato de `Aviso de overflow accionable para el orquestador`:
el texto, el conteo, el tope de claves y los consumidores de `<ContextOverflowWarning>` permanecen
iguales.

#### Scenario: Las claves críticas se inyectan siempre primero

- **WHEN** `.ancletorc` declara `memory.criticalKeys` con claves que son `rule` activas del scope inyectado
- **THEN** esas reglas se ordenan al frente del bloque, en el orden declarado
- **AND** se ordenan antes que cualquier regla no declarada, aunque la no declarada tenga mejor scope o mejor anclaje

#### Scenario: Una clave crítica inexistente, inactiva o fuera de presupuesto falla

- **WHEN** una `memory_key` declarada en `memory.criticalKeys` no existe como `rule` activa del scope inyectado, está inactiva o no entra en el presupuesto de la construcción
- **THEN** la generación falla con un error que nombra esa `memory_key`
- **AND** no se devuelve un bloque parcial

#### Scenario: La CLI explícita falla sin sobrescribir el archivo previo

- **WHEN** `ancleto memory context`, con o sin `--out`, encuentra el error de una clave crítica
- **THEN** el proceso termina con código distinto de cero
- **AND** el mensaje de error nombra la `memory_key`
- **AND** el archivo de working-context previo, si existía, queda sin cambios

#### Scenario: El lifecycle y el on-write advierten sin escribir un bloque degradado

- **WHEN** un refresh de lifecycle (`init`, `install`, `upgrade`) o el refresh on-write del MCP encuentra el error de una clave crítica
- **THEN** el refresh de lifecycle o el llamador del on-write emite `console.warn` nombrando la `memory_key`
- **AND** no se escribe un bloque degradado en el archivo de working-context

#### Scenario: Sin la clave de configuración el comportamiento no cambia

- **WHEN** `memory.criticalKeys` está ausente, no es un array o es inválida
- **THEN** el valor efectivo es la lista vacía
- **AND** el bloque generado es idéntico al vigente, incluido el orden, el corte y el `<ContextOverflowWarning>`
