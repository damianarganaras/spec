# Spec: prompt-contracts (delta)

## ADDED Requirements

### Requirement: Paralelización de la finalización y el registro de memoria

El orquestador NO SHALL serializar la finalización del archive (`@documenter`) con el registro de memoria (`@memory-keeper`). Tras la aprobación explícita del usuario para archivar, y cuando exista un candidato real de memoria, SHALL delegar ambas etapas en paralelo. Las dos etapas SHALL operar sobre superficies disjuntas —`aspec/changes/archive/` para `@documenter` y `.ancleto/memory.db` para `@memory-keeper`— sin dependencia de salida entre sí. El resultado de una etapa NO SHALL condicionar el inicio de la otra, y el orquestador SHALL recoger y reportar el estado de ambas. Cuando no exista candidato real de memoria, el orquestador SHALL ejecutar sólo la finalización y NO SHALL delegar `@memory-keeper`. Si el registro necesitara el resultado del archive para operar, el orquestador NO SHALL paralelizar y SHALL reportar el bloqueo.

#### Scenario: Finalización y memoria en paralelo

- **WHEN** el usuario aprueba archivar el change
- **AND** existe un candidato real de memoria
- **THEN** el orquestador delega `@documenter` y `@memory-keeper` en paralelo
- **AND** no espera el retorno de una etapa para iniciar la otra

#### Scenario: Las etapas no comparten superficie ni dependencia

- **WHEN** `@documenter` y `@memory-keeper` corren en paralelo
- **THEN** `@documenter` sólo escribe bajo `aspec/`
- **AND** `@memory-keeper` sólo escribe en `.ancleto/memory.db`
- **AND** ninguna etapa requiere la salida de la otra para operar

#### Scenario: Sin candidato no se delega memoria

- **WHEN** no existe candidato real de memoria
- **THEN** el orquestador no delega `@memory-keeper`
- **AND** sólo se ejecuta la finalización del archive

_No-testeable-por-construcción: el paralelismo y la no-delegación son ordenamientos de delegaciones en runtime; no hay salida observable que pruebe la concurrencia ni su ausencia. Se anclan con un content guard que fija el contrato declarado en el orquestador._

### Requirement: affected-set determinístico por grafo de imports

El conjunto afectado (`affected-set`) de un change SHALL determinarse de forma reproducible como la clausura transitiva de **dependientes** sobre el grafo de imports del proyecto, sembrada por los `task-owned files`, e incluir siempre a los propios archivos tocados. El `affected-set` NO SHALL limitarse a los archivos tocados: SHALL incluir los dependientes directos y transitivos. El `affected-set` SHALL ser determinístico: el mismo estado del repositorio y la misma semilla SHALL producir el mismo conjunto. Cuando el proyecto declare su propio mecanismo o comando de afectados en `PRODUCT.md` → `## Project Commands`, el pipeline SHALL usar ese mecanismo en lugar del grafo de imports propio. El `affected-set` SHALL ser el objetivo de verificación de `@tester` y el scope de review de `@reviewer`.

**Taxonomía cerrada de specifiers.** Todo specifier o import del grafo del helper SHALL caer en **exactamente una** de estas cuatro categorías, mutuamente excluyentes y colectivamente exhaustivas:

1. **Relativo resoluble** → SHALL generar una **arista** de dependencia en el grafo.
2. **No relativo** (paquete npm, builtin de Node o alias de paths) → SHALL contar en `externalCount`; NO SHALL generar arista ni figurar entre los casos inconclusos.
3. **Argumento no literal en una llamada dinámica** (`import(...)` / `require(...)`) → SHALL reportarse en `unresolved` (inconcluso).
4. **Relativo irresoluble** → SHALL reportarse en `unresolved` (inconcluso).

**Clasificador conservador por argumento.** El mecanismo SHALL escanear **únicamente** las formas de llamada `import(` y `require(`, y SHALL clasificarlas **por su argumento**, no por su contenido. Una llamada SHALL considerarse **estática** cuando su argumento —tras espacios y comentarios— es un **string literal puro seguido de `)`**: cae en la categoría 1 si el literal es un relativo resoluble, o en la categoría 2 si es no relativo. **Cualquier otro argumento** —una expresión pelada, un **prefijo literal seguido de una expresión** (`'./x' + y`), un template con expresión, un argumento parentizado, etc.— SHALL reportarse en `unresolved` (categoría 3). El clasificador SHALL ser **conservador por diseño**: ante la duda SHALL reportar `unresolved`, **nunca silencio**. **Alcance escaneado (explícito).** El mecanismo SHALL escanear **únicamente** las formas de llamada `import(` y `require(`. Otras formas de invocar un import/require dinámico —p. ej. `require?.(…)`, `(require)(…)`, el acceso computed `obj['require'](…)`— NO SHALL escanearse ni reportarse: se delegan al mecanismo declarado por el proyecto (`PRODUCT.md` → `## Project Commands`). El acceso por miembro `obj.require(…)` sí se matchea léxicamente (`\brequire\b` sin lookbehind): es una **sobre-inclusión conservadora, en la dirección segura** —nunca un hueco—. Ésta es una **acotación por diseño, no un hueco**; el contrato NO SHALL prometer cobertura universal sobre dinámicas que el mecanismo no escanea.

**Frontera de externos (por construcción).** La categoría **no relativo** —paquetes npm, builtins de Node y alias de paths— es **externa** al grafo de imports del helper: NO SHALL generar arista de dependencia y NO SHALL figurar entre los casos inconclusos. La resolución de alias queda **delegada al mecanismo declarado por el proyecto** en `PRODUCT.md` → `## Project Commands`; el helper NO SHALL intentar resolverla ni presumir que un alias está cubierto. Esta frontera es una **limitación documentada**, NO un hueco: un proyecto con alias SHALL declarar su propio mecanismo de afectados para cubrirlos.

**Casos inconclusos.** Las categorías 3 y 4 —**llamadas `import(...)` / `require(...)` con argumento no literal** y **specifiers relativos irresolubles**— SHALL reportarse como inconclusos (`unresolved`) y NO SHALL asumirse cubiertas. Ninguna otra categoría SHALL reportarse como inconclusa.

**`externalCount`.** La superficie read-only del `affected-set` SHALL exponer `externalCount` como el **conteo global de OCURRENCIAS de specifiers no relativos** tratados como externos —**no** de specifiers distintos: el mismo paquete importado dos veces suma **2**—: un **dato informativo, NO un warning ni un error**, sin resolverlos ni implicar resolución alguna.

#### Scenario: Incluye dependientes, no sólo los archivos tocados

- **WHEN** se modifica un módulo del que dependen otros módulos
- **THEN** el `affected-set` incluye los dependientes directos y transitivos
- **AND** incluye además los propios archivos tocados

#### Scenario: El cómputo es determinístico

- **WHEN** se computa el `affected-set` dos veces sobre el mismo estado del repositorio con la misma semilla
- **THEN** el resultado es idéntico en ambas corridas

#### Scenario: El mecanismo declarado por el proyecto tiene prioridad

- **WHEN** el proyecto declara un comando de afectados en `PRODUCT.md` → `## Project Commands`
- **THEN** el pipeline usa ese mecanismo
- **AND** no usa el grafo de imports propio

#### Scenario: Sin dependientes el set es el de archivos tocados

- **WHEN** ningún módulo importa los archivos tocados
- **THEN** el `affected-set` es igual al conjunto de archivos tocados

#### Scenario: Los specifiers no relativos son externos por construcción

- **WHEN** un archivo importa un specifier no relativo (un paquete npm, un builtin de Node o un alias de paths)
- **THEN** ese specifier NO genera arista de dependencia en el grafo
- **AND** NO figura entre los casos inconclusos
- **AND** se cuenta en `externalCount` que expone la superficie read-only

_No-testeable-por-construcción (contraparte negativa):_ no existe un escenario que afirme que un **alias** se reporta `inconclusive`. El helper no lee configuración de alias, así que no puede distinguir un alias de un paquete npm ni observar el resultado de resolverlo; la promesa contraria no se sostiene y no se enuncia. El soporte real de alias (opción B: leer el mecanismo de paths del proyecto) queda como **follow-up out-of-scope**.

#### Scenario: El clasificador es conservador por argumento

- **WHEN** el mecanismo escanea una llamada `import(...)` o `require(...)`
- **THEN** clasifica **por su argumento**: un string literal puro (tras espacios y comentarios) seguido de `)` es estático —categoría 1 si es relativo resoluble, categoría 2 si es no relativo—
- **AND** cualquier otro argumento —expresión pelada, prefijo literal seguido de una expresión (`'./x' + y`), template con expresión, paréntesis— se reporta en `unresolved` (categoría 3)
- **AND** ante la duda reporta `unresolved`, nunca silencio

#### Scenario: Casos inconclusos se reportan como inconclusos

- **WHEN** una llamada `import(...)` / `require(...)` con argumento no literal, o un specifier **relativo** irresoluble, no puede resolverse desde el grafo
- **THEN** el `affected-set` reporta ese caso en `unresolved` como inconcluso
- **AND** ninguna otra categoría de specifier se reporta como inconclusa
- **AND** no lo asume cubierto

### Requirement: Registro de memoria en un solo paso y sólo con candidato real

El cierre de un change SHALL hacer como máximo **una** llamada a memoria, y sólo cuando exista un candidato real. Con candidato, el orquestador SHALL delegar `@memory-keeper` en Automatic Record una sola vez. Sin candidato real, el orquestador NO SHALL invocar Optional Draft, NO SHALL solicitar aprobación de memoria y SHALL finalizar sin almacenar. La cadena Automatic Record → Optional Draft → aprobación → User-Approved Record NO SHALL ejecutarse cuando no hay candidato. User-Approved Record SHALL quedar reservado a un pedido explícito del usuario.

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

_No-testeable-por-construcción: la no-invocación de Optional Draft y la ausencia de pedido de aprobación son no-acciones de un agente sin salida observable. Se anclan con un content guard que fija el contrato declarado en el orquestador._
