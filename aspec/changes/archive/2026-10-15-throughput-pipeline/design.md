# Design: Pipeline de mayor throughput

## Approach

El change reduce round-trips del pipeline (latencia y tokens) sin degradar calidad, con dos principios ya vigentes en el repo: **ownership único** (cada contrato vive en una sola superficie) y **mesura antes de aceptar** (todo recorte se acepta sólo si ΔQ ≥ 0, métrica Q = (1−RR)(1−escapes)).

Las cuatro mejoras son acotadas y se apoyan en los artefactos de control que el framework ya preserva (`task-owned files`, `Validation Ledger`, flags). El diseño las ordena para que el `affected-set` y el ledger prearmado formen una misma cadena: **`@coder` → `@tester` (computa `affected-set` + ledger cerrado) → `@orchestrator` (arma/verifica cierre) → `@reviewer` (consume, sin rebote)**.

Convenciones que condicionan el diseño: **zero-deps de runtime**, **multi-host** (nada host-específico en texto compartido), `test/content-guards.test.js` fija contratos de prompt (**se actualiza en el mismo change**) y **no breaking** para proyectos usuarios.

## Architecture

### 1. Paralelización de la finalización y el registro de memoria

- **Hoy**: `orchestrator.md` Path A pasa del archive (paso 8, `@documenter`) al registro (paso 9, `@memory-keeper`) de forma secuencial (`agents/orchestrator.md:275-276`).
- **Nuevo**: tras la aprobación explícita del usuario para archivar y cuando exista candidato real de memoria, el orquestador delega `@documenter` y `@memory-keeper` **en paralelo**. Superficies disjuntas: `@documenter` escribe sólo bajo `aspec/`; `@memory-keeper` escribe sólo en `.ancleto/memory.db`. Sin dependencia de salida entre sí: el nombre del change (dato que el registro necesita) se conoce antes del archive.
- **Invariante**: si `@memory-keeper` necesitara el resultado del archive para operar, no se paraleliza y se reporta como bloqueo. El orquestador recoge y reporta el estado de ambas etapas.
- **Sin candidato**: sólo corre `@documenter` (ver §4). La paralelización no aplica.

### 2. Reviewer sin rebote — Validation Ledger prearmado

**Definición.** El **ledger prearmado** es un Validation Ledger **completo y cerrado** para el scope de review: cada comando relevante al scope —tests del change, tests del `affected-set`, format check y lint declarados por el proyecto— tiene una entrada con **clasificación terminal** (`passed`, `task-regression`, `pre-existing-unrelated`, `not-configured` o `inconclusive`) y evidencia preservada (entrada de ledger para comandos; `file:line` para código).

**Quién lo arma.**
- `@tester` **produce** el ledger (es el dueño de la evidencia; tiene bash, el reviewer no).
- `@orchestrator` **arma/verifica el cierre** antes de delegar el review: comprueba que no falte ninguna entrada del scope y lo pasa **sin cambios** (destilado, no reconstruido).
- `@reviewer` lo **consume** como evidencia y no lo reconstruye ni resume.

**Invariantes que debe preservar el ledger prearmado.**
- **Clasificación terminal** en cada entrada del scope (ningún comando del scope sin clasificar).
- **`not-configured` como no-fallo registrado**: cuando el proyecto no declara format check ni lint en `PRODUCT.md` → `## Project Commands`, la entrada del ledger SHALL registrarse con clasificación terminal `not-configured` y tratarse como no-fallo, consistente con el bloque `LOCKED: validation-commands` de `templates/AGENTS.md` (format check no declarado → `not-configured`; comando no declarado → se saltea y se registra la omisión). Una entrada `not-configured` cierra el ledger para ese comando: NO SHALL contar como entrada faltante ni bloquear el review.
- **Evidencia como field**: entradas de ledger para comandos, `file:line` para código; nunca prosa, logs ni diffs.
- **Los cinco artefactos de control** intactos (`task-owned files`, Validation Ledger, `SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED`, `GUARANTEE NOT SUSTAINED`).
- **`bash:false` en el reviewer** y **bloqueo por CRITICAL** sin cambios.
- **Verificación de garantías bajo modelo real** intacta: el reviewer sigue leyendo fuente más allá del diff y sigue reportando **contexto** faltante (que no es evidencia de comando) cuando no puede resolver el modelo.
- **Sin rebote**: el reviewer NO SHALL pedir re-delegación a `@tester` por evidencia de comando faltante o inconclusa **dentro del scope cubierto** por el ledger. Si el ledger no cubre algún comando del scope, el orquestador NO delega el review: se detiene en la etapa de tester para cerrar la entrada.

**Cambios de prompt**: `reviewer.md` (`:170`, `:197`) se ajusta para consumir el ledger prearmado; `tester.md` y `orchestrator.md` declaran producción y cierre del ledger.

### 3. `affected-set` determinístico por grafo de imports

**Definición.** `affected-set` = **clausura transitiva de dependientes** sobre el grafo de imports del proyecto, sembrada por los `task-owned files`, **más** los propios `task-owned files`. Incluye dependientes directos y transitivos; no se limita a los archivos tocados.

**Determinismo.** Mismo estado del repositorio + misma semilla → mismo conjunto. Un agente (no determinístico) no puede garantizarlo por sí solo: se requiere un cómputo reproducible.

**Mecanismo (recomendado).**
- Módulo zero-dep en `src/core/` que construye el grafo de imports por parseo **estático** de `import` / `export … from` / `require(` / `import(` en `.js/.mjs/.cjs/.ts/.tsx`, resuelve especificadores relativos y respeta los ignores del proyecto (`TOPOLOGY_IGNORED_DIRS`). Devuelve la clausura de dependientes de la semilla.
- Superficie **read-only** por CLI para que el tester la invoque con bash (el orquestador y el reviewer no tienen bash).
- **Prioridad**: si `PRODUCT.md` → `## Project Commands` declara un mecanismo/comando de afectados, el pipeline lo usa en lugar del grafo propio. En un monorepo con runner de afectados, ese comando gana.
- **Taxonomía cerrada (4 categorías)**: todo specifier del grafo cae en **exactamente una** de: (1) **relativo resoluble** → arista de dependencia; (2) **no relativo** (paquete npm, builtin, alias de paths) → `externalCount`, sin arista ni `unresolved`; (3) **argumento no literal en una llamada `import(...)` / `require(...)`** → `unresolved`; (4) **relativo irresoluble** → `unresolved`. Son mutuamente excluyentes y colectivamente exhaustivas: ninguna otra categoría se reporta inconclusa.
- **Clasificador conservador por argumento (no por contenido)**: el mecanismo escanea sólo las formas de llamada `import(` / `require(` y clasifica **por el argumento** de la llamada, no por su contenido. Si el argumento —tras espacios y comentarios— es un **string literal puro seguido de `)`**, la llamada es estática (categoría 1 si el literal es un relativo resoluble; categoría 2 si es no relativo); **cualquier otro argumento** —expresión pelada, **prefijo literal más expresión** (`'./x' + y`), template con expresión, paréntesis, etc.— es `unresolved` (categoría 3). La etiqueta «sin literal» designa ahora «argumento que **no** es un literal puro». Clasificar por argumento y **no** por un regex de contenido **evita el falso positivo del backtracking**: `require( 'x')` (con espacios) se resuelve como literal, no como dinámico. Es **conservador por diseño** —ante la duda, `unresolved`, nunca silencio—. **Alcance escaneado (explícito)**: sólo las formas de llamada `import(` / `require(`; otras formas de invocar un import/require dinámico (p. ej. `require?.(…)`, `(require)(…)`, el acceso computed `obj['require'](…)`) no se escanean ni se reportan y se delegan al mecanismo declarado por el proyecto (`## Project Commands`). El acceso por miembro `obj.require(…)` sí se matchea léxicamente (`\brequire\b` sin lookbehind): **sobre-inclusión conservadora, en la dirección segura**, nunca un hueco. Es una **acotación por diseño, no un hueco**, y **no promete universalidad** sobre dinámicas que el mecanismo no escanea.
- **Frontera de externos (por construcción)**: la categoría **no relativo** (paquetes npm, builtins de Node, **alias de paths**) es externa al grafo: **no genera arista** y **no entra en `unresolved`**. El helper no lee configuración de alias, así que no puede distinguir un alias de un paquete npm; por eso **no los resuelve ni los presume cubiertos**. Es una **limitación documentada**, no un hueco: la resolución de alias queda **delegada al mecanismo declarado por el proyecto** (`PRODUCT.md` → `## Project Commands`) y el soporte real de alias (opción B) es **follow-up out-of-scope**.
- **Casos inconclusos** (categorías 3 y 4: **llamadas `import(...)` / `require(...)` con argumento no literal** y **relativos** irresolubles): se reportan en `unresolved`, no se asumen cubiertos; **ninguna otra categoría** se reporta inconclusa.
- **`externalCount` en una línea**: la superficie read-only expone `externalCount` como el **conteo global de ocurrencias de specifiers no relativos** (no de specifiers distintos: el mismo paquete importado dos veces suma 2) tratados como externos — **dato informativo, no warning ni error**, sin resolverlos ni implicar resolución alguna.
- **`seeds` normalizados**: la salida JSON del subcomando read-only expone las semillas **normalizadas** (las mismas del cómputo: relativas-posix respecto de `rootDir`), no los args crudos, de modo que `seeds` y `affected` queden en el mismo espacio. Hoy `src/cli/index.js:2626` imprime los args crudos mientras `affected` viene normalizado.

**Consumo.** El `affected-set` es el **scope de review** (`reviewer.md` pasa de "unión de `task-owned files` y relacionados directos" al `affected-set`) y el **objetivo de verificación** del tester (`tester.md:60`, prioridad de verificación ya declarada). El orquestador lo propaga junto con el ledger.

**Reuso existente**: el repo ya tiene `src/core/discovery.js` (`buildTopologyMap`, `readTopologySummary`) y sus ignores. El helper de imports es un módulo nuevo porque el discovery map guarda sólo conteos de archivos, no aristas del grafo.

**No contradice la frontera de no-regresión del review.** El `affected-set` determinístico por grafo de imports es **complementario** a la garantía "Frontera y no-regresión del review" de la capability `review` (`aspec/specs/review/spec.md`): incluir los dependientes **refuerza** la no-regresión, no la relaja. El review sigue viviendo dentro del review existente (sin stage nuevo) y su scope se amplía de forma reproducible a los afectados —exactamente lo que la no-regresión exige cubrir—, por lo que no hay contradicción entre el mecanismo del `affected-set` y esa frontera.

### 4. Memoria en un solo paso y sólo con candidato real

- **Hoy**: el cierre puede encadenar Automatic Record → Optional Draft → aprobación → User-Approved Record (`orchestrator.md:157-158`, `:276`, `:288`), gastando hasta tres llamadas + un round-trip con el usuario cuando no hay candidato real.
- **Nuevo**: el cierre hace **como máximo una** llamada a memoria, y **sólo** si existe un candidato real (Automatic Record). Sin candidato real: no se invoca Optional Draft, no se pide aprobación de memoria y se finaliza sin almacenar.
- **User-Approved Record** queda reservado a un pedido explícito del usuario.
- `memory-keeper.md` alinea sus modos: Automatic Record sigue costando exactamente una llamada y sigue siendo el único camino automático del cierre.

### Home de capacidades (decisión de diseño)

- **`prompt-contracts`** (delta con items 1, 3, 4): es la capacidad que ya posee "los contratos de los prompts del framework (orquestador, agentes, skills y `AGENTS.md`)" y los artefactos de control del destilado. El flujo del pipeline (paralelización, affected-set, paso de memoria) es contrato de esos prompts. Reuso en vez de inventar una capacidad nueva.
- **`review`** (delta con item 2): la capacidad ya posee "la frontera del review respecto del flujo y de los modos de trabajo" y los inputs del reviewer. El "reviewer sin rebote con ledger prearmado" es un contrato de input/frontera del reviewer. Reuso en vez de inventar una capacidad nueva.

### Salvaguardas intocables (restricción de diseño)

Nada de este change elimina ni degrada: verificación de garantías bajo modelo real; `affected-set` incluyendo dependientes; `bash:false` en reviewer/orchestrator/spec-writer; Validation Ledger + los cinco flags; bloqueo por CRITICAL; baseline reproducible.

### Blast radius (superficies que la implementación planea tocar)

- Prompts: `agents/orchestrator.md`, `agents/tester.md`, `agents/reviewer.md`, `agents/memory-keeper.md`.
- Código: `src/core/affected-set.js` (nuevo, zero-dep) y `src/cli/index.js` (superficie read-only del `affected-set`).
- Tests: `test/content-guards.test.js` (obligatorio en el mismo change) y tests del helper/CLI (nuevos o extendiendo `test/cli.test.js`).
- No se tocan `templates/AGENTS.md` ni el contrato `LOCKED: validation-commands`.

### Negative invariants (marcado)

Los invariantes negativos de runtime (paralelismo efectivo, no-invocación de Optional Draft sin candidato, no-pedido de re-delegación por el reviewer) **no son testeables por construcción**: son no-acciones de un agente sin salida observable. Se anclan con **content guards** que fijan el contrato declarado en el prompt y se marcan como `_No-testeable-por-construcción_` en el delta spec. El invariante "el reviewer NO recibe bash" **sí** tiene test (`test/content-guards.test.js` → `orchestrator, reviewer y spec-writer siguen sin bash`).

## Validation

- **Baseline T0' (primero)**: registrar RR/escapes de los últimos 10 changes archivados y Q = (1−RR)(1−escapes); duración cronometrada de `npm test` (el comando declarado en `PRODUCT.md` → `## Project Commands`) y consumo de `ancleto stats` (ventana definida). Se registra antes de tocar prompts.
- **Guards**: `node --test test/content-guards.test.js` en verde, con asserts nuevos (paralelización declarada, ledger prearmado, affected-set determinístico con dependientes, memoria en un paso) y **sin eliminar** los asserts de las salvaguardas (`bash:false`, cinco flags, Validation Ledger, CRITICAL).
- **Helper**: test del `affected-set` que prueba (a) inclusión de dependientes, (b) determinismo (dos corridas → mismo set), (c) semilla sin dependientes → set = archivos tocados.
- **Regresión**: suite completa `npm test` en verde y comparación de duración contra T0'.
- **Efecto del recorte**: `ancleto stats` post-change vs T0' + ΔQ ≥ 0. Un recorte con ΔQ < 0 se revierte.
- **No host-específico**: confirmar que ningún asset compartido gana texto host-específico.
- **Implementación vs validación separadas**: tareas de prompts/helper (implementación) y tareas de guards/tests/baseline (validación) no se mezclan.

## Open questions

- **Superficie CLI del `affected-set`**: subcomando read-only nuevo vs flag sobre `check`. El contrato del delta spec es agnóstico; el diseño recomienda un subcomando read-only dedicado por claridad de ownership.

## Deferred / out of scope

- **Retiro del modo Optional Draft**: **deferred** a un change posterior. Este change no retira el modo: sólo elimina su invocación automática sin candidato. El modo permanece vivo y disponible ante pedido explícito del usuario, y su retiro se planifica por separado. No es una decisión abierta de este change.
