# Design: Refrescar el working-context tras escrituras de memoria por MCP

## Contexto y problema

`.ancleto/working-context.md` es el artefacto derivado que el orquestador lee al arrancar
(`agents/orchestrator.md:146-148`, una sola vez, sin shell). Se compone de `<ProjectTopology>`
más el bloque `<ProjectMemoryRules>`, y hoy solo se regenera en puntos de ciclo de vida y de
forma manual:

- `ancleto init` (`src/cli/index.js:1087`), `install --project` (`:932`), `upgrade` (`:996`),
  y `ancleto memory context --out` (`memoryContext`, `:1434-1459`).

Ninguna tool MCP lo invoca. `createMemoryToolHandlers` (`src/core/memory/tools.js:64-70`) solo
llama a `engine.recordNode` (`src/core/memory/engine.js:156-187`), que escribe
`.ancleto/memory.db`; `serveMemoryMcp` (`src/core/memory/mcp-server.js:64`) nunca refresca.
Consecuencia: tras grabar por MCP, el contexto inyectado queda desactualizado hasta el próximo
lifecycle point o un comando manual. Es el residuo del gap **G1**, no un diseño deliberado: no
hay decisión registrada de excluir el refresh.

Restricción de dominio confirmada en el change hermano `clarify-project-memory-rules-decisions`:
`buildWorkingContext` (`engine.js:89-120`) compone `<ProjectMemoryRules>` solo con
`type = 'rule' AND status = 'active' AND scope IN (jerarquía)`. A scope `project` la jerarquía
es `['project']`, así que **únicamente las reglas de scope `project` alimentan el bloque**. Las
`decision` y las reglas de scope `feature`/`task` no participan del contexto inyectado a scope
`project`. **Contribución directa** = solo `rule`+`project`. Una `decision` o una regla de otro
scope **no** aporta líneas al bloque, pero puede **retirar** una `rule` de scope `project` al
superseder su misma `memory_key` (ver "Decisión adoptada", condición 2).

## Decisión adoptada

**Opción 1 — supraconjunto conservador (refresh-on-write filtrado).** El refresh del
working-context se dispara como parte de la escritura MCP con **dos condiciones**, evaluadas sobre
el resultado de `recordNode`:

1. **Contribución directa:** el nodo entrante es `type === 'rule' && scope === 'project'`.
2. **Efecto por supersesión:** `result.superseded > 0`, **sin importar el `type` ni el `scope` del
   nodo entrante**.

En seudocódigo: `shouldRefreshWorkingContext(result) = (result.node.type === 'rule' && result.node.scope === 'project') || result.superseded > 0`.

El criterio sigue siendo barato (dos comparaciones sobre datos ya presentes en el resultado) y no
hay coalescing ni flag "dirty".

**Fundamento de la segunda condición (evidencia).** El disparador basado **solo** en el nodo
entrante era **insuficiente** porque `memory_key` es una **identidad transversal**: la supersesión
opera por `memory_key` **sin filtrar `type` ni `scope`** (`findActive = SELECT id FROM memory_nodes
WHERE memory_key = ? AND status = 'active'`, `src/core/memory/engine.js:82`), respaldada por un
índice único parcial sobre `memory_key` activa (`src/core/memory/database.js:19-20`). Es intencional
y está testeado: superseder cruzando tipo `rule -> decision` con la misma clave deja una sola activa
y es la `decision` (`test/memory-engine.test.js:87-95`), y el índice rechaza una segunda activa fuera
de la transacción (`:97-107`). Por eso una escritura `recordDecision` (o un `recordRule` de otro
scope) que comparte `memory_key` con una `rule` de scope `project` **puede retirar esa rule** del
bloque `<ProjectMemoryRules>`: el filtro por nodo entrante no lo veía y dejaba el contexto stale.

Consecuencias del filtro:

- `recordDecision` **que no supersede** (`superseded = 0`) **no dispara** refresh (las decisiones no
  componen `<ProjectMemoryRules>` ni retiraron nada del conjunto activo del bloque).
- `recordRule` con scope `feature`/`task` **que no supersede** **no dispara** refresh (no entran en
  el bloque a scope `project`).
- `recordRule` con scope `project` **sí dispara** (contribución directa), incluida la **supersesión**:
  registrar una `memory_key` existente es una escritura `rule`+`project` (`recordNode` devuelve
  `superseded: 1` y el nodo nuevo activo), así que la regeneración ocurre igual.
- **Cualquier** escritura, sea `decision` o `rule`, de cualquier scope, que **superseda** una
  `memory_key` existente (`superseded = 1`) **sí dispara** refresh: pudo haber retirado del bloque
  una `rule` de scope `project` con esa clave. La afirmación absoluta "`recordDecision` no dispara
  refresh" **ya no aplica**: una `decision` que **no** supersede no dispara; una que **supersede**
  sí.

### Over-refresh: consecuencia intencional, no bug pendiente

La condición `superseded > 0` dispara refresh aunque la supersesión **no** altere el bloque, por
ejemplo un par `decision -> decision` con la misma `memory_key` (o `rule feature -> rule feature`):
el nodo retirado no era una `rule` de scope `project` y el nodo nuevo tampoco entra al bloque, así
que el contenido generado es idéntico al previo.

Esto es **intencional y aceptado** dada la forma actual del motor —**no** un defecto pendiente—:

- `recordNode` devuelve solo `{ node, superseded: 0|1 }` (`src/core/memory/engine.js:183-186`): no
  expone el nodo superseded ni su `type`/`scope`. `findActive` (`:82`) selecciona únicamente el `id`
  y descarta esa información, así que el handler **no puede** distinguir "supersesión que cambia el
  bloque" de "supersesión que no".
- El único consumidor de `working-context.md` es el orquestador al arrancar
  (`agents/orchestrator.md:146-148`), **una lectura por sesión**. El costo máximo del over-refresh es
  "un refresh por sesión con supersesión"; **no es un hot path**.
- El refresh es idempotente, así que un over-refresh que no cambia el conjunto activo reescribe bytes
  idénticos.

Volver el refresh selectivo ("solo si el conjunto activo del bloque cambió") exigiría exponer el
nodo superseded desde el motor; se documenta como **Opción 2 diferida** en "Alternativas
consideradas", no como trabajo de este change. La Opción intermedia (flag "dirty"/batch) se descarta
por complejidad sin ventaja clara dado el único consumidor.

### Fallback de raíz sin `.ancletorc` (decidido)

La resolución de `projectRoot` adopta el **fallback** como comportamiento decidido: si el walk-up
no encuentra `.ancletorc`, `resolveMemoryProjectRoot` usa el candidato derivado de `dbPath`
(`dirname(dirname(dbPath))`) como raíz mientras exista el layout `.ancleto/`; si no puede
determinar ninguna raíz, el refresh se omite (best-effort). Se elige este comportamiento —y no
omitir el refresh sin `.ancletorc`— para no perder la garantía. El detalle está en
"Resolución de project-root vía `.ancletorc`" (paso 3).

## Alternativas consideradas

- **(A) Refresh en toda escritura MCP** (cualquier tipo/scope, sin mirar `superseded`):
  descartada. Es un supraconjunto **más amplio que el adoptado**: refrescaría también escrituras
  **sin** supersesión que no alteran el bloque (p. ej. una `decision` nueva con clave propia). El
  filtro adoptado `(rule+project) OR (superseded > 0)` es un subconjunto que **conserva la
  garantía** y evita esos refrescos innecesarios, así que sigue siendo más barato y preciso.
- **(B) Render-on-demand al leer** (que el consumidor pida el bloque en el momento): descartada.
  Depende de un hook de arranque que **no existe en este repo** y que quedaría en el runtime del
  IDE (`agents/orchestrator.md`), **fuera del control de Ancleto**. El único consumidor lee el
  archivo una vez, sin shell. No es implementable dentro del repo, así que no entrega la
  garantía.
- **(C) Status quo** (solo lifecycle points y comando manual): descartada. Es precisamente el
  bug G1: deja el contexto stale tras cada escritura MCP.
- **(D) Opción 2 — refresh selectivo exponiendo el nodo superseded (diferida).** Habilitar un
  refresh "solo si el conjunto activo del bloque cambió" requiere que `recordNode` (y/o
  `findActive`) devuelvan el nodo superseded con su `type`/`scope`, hoy descartados
  (`engine.js:82`, `:183-186`). Trade-off: amplía el contrato de retorno del **write path** del
  motor (`engine.js`), agrega superficie de test, y **no produce diferencia observable para el
  consumidor actual** (orquestador, una lectura por sesión). Se difiere: reevaluar si cambia el
  consumidor o si el volumen de escrituras con supersesión lo justifica.
- **(E) Opción intermedia — flag "dirty" o batch de refrescos (descartada).** Un flag/cola que
  marque el bloque como sucio y coalesca refrescos. Se descarta: dado el único consumidor (una
  lectura por sesión), **no ofrece ventaja clara sobre la Opción 1** —no evita un costo
  relevante— y agrega estado y complejidad (dónde vive el flag, cuándo se limpia, interacción con
  el CLI/otros procesos).

`render-on-demand` queda documentada como alternativa descartada por dependencia de runtime
externo al repo; la Opción 2 queda documentada como mejora futura diferida, no como pendiente de
este change.

## Diseño técnico

### Ubicación del invariante

El invariante "memoria activa → `working-context.md`" es una preocupación del motor de memoria
(render + persistencia de un artefacto derivado), no del CLI ni del protocolo MCP. Se centraliza
en un módulo core nuevo, `src/core/memory/working-context.js`, con estas responsabilidades:

- `workingContextPath(projectRoot)` → `join(projectRoot, '.ancleto', 'working-context.md')`.
- `writeWorkingContext(engine, projectRoot, scope = 'project')` → render con
  `engine.buildWorkingContext(scope, MAX_TOKENS, projectRoot)` (el tercer argumento es la raíz,
  no un `cwd` implícito), `mkdir` recursivo y `writeFile` con `''` si el bloque es `null`
  (paridad con el refresh actual). Retorna el path o `null`.
- `shouldRefreshWorkingContext(result)` →
  `(result.node.type === 'rule' && result.node.scope === 'project') || result.superseded > 0` (el
  resultado de `recordNode`, no solo el nodo: la supersesión es la segunda señal del disparador).
- `resolveMemoryProjectRoot(dbPath)` → ver "Resolución de project-root".

`engine.js` **no cambia**: permanece como capa pura de DB + render, sin filesystem ni rutas de
proyecto. El `engine` expone `buildWorkingContext`; no se le agrega ningún método de escritura.

El `refreshWorkingContext` del CLI (`index.js:1418-1432`) se conserva con su semántica actual
(chequeo de existencia de DB y `null` sin escribir) y **delega** el render+escritura en
`writeWorkingContext`, para no mantener dos implementaciones divergentes del mismo artefacto.
Es una consolidación que preserva comportamiento byte a byte; no cambia los lifecycle points.

### Punto de enganche

El refresh engancha en la **capa de handlers MCP** (`src/core/memory/tools.js`), no dentro de
`engine.recordNode`. Razón: `recordNode` es la primitiva pura de persistencia y podría ser
llamada desde otros caminos; la frescura "tras escritura MCP" es una garantía de la **superficie
MCP**, y el filtro del trigger pertenece ahí. Mantener el engine desacoplado evita acoplar la
persistencia a filesystem y a layout de proyecto.

Flujo en `createMemoryToolHandlers(engine, runtimeContext)`:

1. `recordRule` / `recordDecision` ejecutan `engine.recordNode(...)` (sin cambios) y obtienen el
   resultado `{ node, superseded }`.
2. Si `runtimeContext.projectRoot` está presente y `shouldRefreshWorkingContext(result)`, se llama
   a `writeWorkingContext(engine, runtimeContext.projectRoot)`.
3. Ese refresh se envuelve en `try/catch`; cualquier error se registra y se descarta.

`createMemoryServer` (`mcp-server.js`) resuelve `projectRoot` **una sola vez** en la creación del
server y lo inyecta en `createMemoryToolHandlers`. Si no hay `projectRoot`, el refresh es un
no-op (opt-in), lo que mantiene compatibles los otros usos de `createMemoryToolHandlers` /
`createMemoryToolkit` (`tools.js:72-75`) y los tests existentes.

### Render desde el engine vivo (no reabrir conexión)

El refresh usa **el mismo `engine` que `createMemoryServer` retiene en su closure** (creado lazy
en el primer `tools/call`, `mcp-server.js:11-17`), en lugar de abrir una segunda conexión con
`createMemoryEngine(dbPath)`. Ventajas concretas:

- El render ve la escritura recién commiteada en la misma conexión y vista transaccional:
  `recordNode` hace `BEGIN IMMEDIATE … COMMIT` y **commitea antes de retornar** (`engine.js:171-181`).
- No hay segunda conexión compitiendo por el lock del WAL: elimina de raíz el riesgo de bloqueo
  señalado en el proposal.
- Es coherente con la vida del proceso: el engine ya está abierto para toda la sesión del server.

Esto contrasta con el `refreshWorkingContext` del CLI, que abre y cierra su propio engine porque
corre en otro proceso y en otro momento del ciclo de vida; ahí sigue siendo correcto.

### Resolución de project-root vía `.ancletorc`

El refresh **no debe** usar el `cwd` del proceso del server MCP como raíz. Si el IDE lanza el MCP
desde otro directorio, `readTopologySummary(cwd)` (`engine.js:98`) leería el
`.discovery-map.json` equivocado y el archivo se escribiría en el lugar incorrecto.

`resolveMemoryProjectRoot(dbPath)`:

1. Deriva el proyecto implícito por la ubicación de la DB: `dirname(dirname(dbPath))`
   (la DB vive en `<proyecto>/.ancleto/memory.db`).
2. Camina hacia arriba desde ese candidato buscando un directorio con `.ancletorc`; el primero
   que lo contenga es la raíz. Detecta la raíz por **`.ancletorc`**, no por el `cwd`.
3. Si no encuentra `.ancletorc`, usa el candidato derivado de `dbPath` como raíz de
   fallback (mientras exista el layout `.ancleto/`), para no perder la garantía; si no puede
   determinar ninguna raíz, el refresh se omite (best-effort).

El `projectRoot` resuelto se pasa **explícitamente** a `buildWorkingContext(scope, MAX_TOKENS,
projectRoot)` (para que `<ProjectTopology>` lea `.discovery-map.json` de la raíz correcta) y a
`workingContextPath(projectRoot)` (para escribir en la raíz correcta). Ninguna ruta se deriva del
`cwd` de forma implícita.

> Fuera de alcance (no-goal): `defaultMemoryDbPath()` sigue derivándose del `cwd` del proceso y
> `serveMemoryMcp` sigue abriendo la DB desde ahí (`mcp-server.js:64`). Este change garantiza la
> raíz **del refresh**, no reubica la DB. Se registra como riesgo.

### Robustez

- **La escritura persiste aunque falle el refresh.** `recordNode` commitea y retorna antes de
  que se intente el refresh; el refresh está en `try/catch` y su error no se propaga al resultado
  de la tool. El handler devuelve igualmente el nodo registrado.
- **Sin recursión.** El refresh hace `SELECT` + `readTopologySummary` (lectura de
  `.discovery-map.json`) + escritura de `working-context.md`. No llama a `recordNode` ni a ningún
  handler MCP, y `working-context.md` no es `memory.db`, así que no hay re-disparo. Se confirma
  que hoy ninguna ruta de render escribe memoria.
- **Sin deadlock.** Al reutilizar el engine vivo no hay segunda conexión al WAL. `node:sqlite`
  `DatabaseSync` es síncrono y `stdin` procesa líneas secuencialmente (`mcp-server.js:76-95`), así
  que el render corre después del commit en la misma línea de ejecución. No hay espera entre
  conexiones.
- **Idempotencia.** El refresh es función pura de las reglas activas y la topología. El bloque
  `<ProjectTopology>` (`formatTopologyBlock`, `engine.js:58-64`) usa solo `total_files` y
  `tree_summary`, **no** `last_updated`; no hay timestamps en el cuerpo de reglas. Dos refreshes
  sin escrituras intermedias producen bytes idénticos.
- **Aviso de error seguro para el protocolo.** Un fallo del refresh se registra por stderr
  (`console.warn`), nunca por stdout, que es el canal JSON-RPC del server (`mcp-server.js:66`).
  Así un error de refresh no corrompe el protocolo MCP.
- **Supersesión.** El trigger combina dos señales del resultado de `recordNode`: el nodo entrante
  (`result.node.type` / `.scope`) y `result.superseded`. Toda supersesión (`superseded > 0`) dispara
  refresh, **aunque el nodo entrante no sea `rule`+`project`**, porque pudo haber retirado del bloque
  una `rule` de scope `project` con la misma `memory_key` (la supersesión es transversal a
  `type`/`scope`; `engine.js:82`, `database.js:19-20`, `test/memory-engine.test.js:87-95`).
- **Over-refresh intencional.** Un `decision -> decision` (o `rule feature -> rule feature`) que
  supersede dispara refresh aunque el bloque no cambie; se acepta por ser consecuencia de la forma
  actual del motor y del único consumidor (una lectura por sesión). Ver "Over-refresh".

## Testabilidad (a nivel de diseño)

Se verifica con el patrón existente de `test/memory-engine.test.js` (`node:test`, `mkdtempSync`,
DB temporal):

- **Unit — filtro:** tabla de verdad de `shouldRefreshWorkingContext(result)`:
  `rule`+`project` → true (aunque `superseded = 0`); `decision`+`project` o `rule`+`feature`/`task`
  con `superseded = 0` → false; **cualquier** nodo (incl. `decision` y `rule` de otro scope) con
  `superseded = 1` → true.
- **Unit — resolución de raíz:** `resolveMemoryProjectRoot` con un `.ancletorc` en la raíz, con
  DB anidada, y sin `.ancletorc`.
- **Integración — trigger positivo (contribución directa):** `recordRule` scope `project` por el
  handler actualiza `working-context.md` con la regla nueva.
- **Integración — trigger positivo por supersesión cross-type/cross-scope:** un `recordDecision`
  (o `recordRule` de scope `feature`/`task`) con la misma `memory_key` que una `rule` de scope
  `project` existente retira esa rule del archivo (refresh disparado por `superseded = 1`).
- **Integración — trigger negativo:** `recordDecision` scope `project` y `recordRule` scope
  `feature`/`task` **sin supersesión** (`superseded = 0`) **no** modifican el contenido del archivo.
- **Integración — over-refresh idempotente:** un par `decision -> decision` con la misma
  `memory_key` dispara refresh pero produce bytes idénticos (no cambia el conjunto activo del bloque).
- **Integración — supersesión:** segundo `recordRule` de la misma `memory_key` deja en el archivo
  el contenido nuevo y no el previo.
- **Robustez:** forzando el fallo del refresh (p. ej. escritura no permitida), el handler devuelve
  el nodo y la DB lo contiene; el proceso no recursa ni queda en deadlock; el archivo conserva su
  contenido previo.
- **Idempotencia:** dos refreshes sin escrituras intermedias → archivo byte-idéntico.
- **Raíz vs cwd:** con `.discovery-map.json` sembrado en la raíz y el server resuelto desde otra
  raíz de DB, `<ProjectTopology>` refleja el mapa de la raíz detectada por `.ancletorc`.

Los detalles de casos y su orden van a `tasks.md`; este diseño no los fija.

## Riesgos y supuestos

- **Riesgo — DB derivada del `cwd`.** Si el IDE lanza el MCP desde un directorio que no es el
  proyecto, `defaultMemoryDbPath()` ya apunta a una DB equivocada. Este change no lo corrige
  (no-goal); lo mitiga parcialmente al usar la raíz detectada para el refresh.
- **Riesgo — costo por escritura.** Cada `recordRule` scope `project` y cada escritura **con
  supersesión** (de cualquier tipo/scope) agrega un `SELECT` + una reescritura de archivo + una
  lectura de mapa. El over-refresh (supersesión que no cambia el bloque) es **intencional y
  aceptado** (ver "Over-refresh"): acotado por el único consumidor (una lectura por sesión) y por
  la cantidad de reglas. El refresh es síncrono (no en background) para evitar carreras de
  escritura sobre el archivo.
- **Riesgo — escritura no atómica.** Igual que el refresh actual, se usa `writeFile` directo; un
  corte podría dejar el archivo parcial. El artefacto es derivado y regenerable, severidad baja;
  si se quiere robustez extra, evaluar temp+rename en tasks.
- **Riesgo — dos escritores** (MCP y CLI/manual) sobre el mismo archivo: last-write-wins,
  aceptable por ser artefacto derivado.
- **Supuesto:** las decisiones nunca **componen** `<ProjectMemoryRules>`; confirmado en
  `engine.js:93-96` y por el change hermano. Una `decision` **sí** puede alterar el bloque
  **indirectamente**, al superseder por `memory_key` una `rule` de scope `project`
  (`test/memory-engine.test.js:87-95`); por eso `superseded > 0` dispara refresh. Si cambiara el
  conjunto de nodos inyectados, revisar `shouldRefreshWorkingContext`.

## Nota sobre el contexto de origen

Contexto producido con un seed técnico validado del repo (v0.6.37); los `file:line` citados se
confirmaron en el árbol actual antes de escribir este diseño.
