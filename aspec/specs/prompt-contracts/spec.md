# Spec: prompt-contracts

## Purpose

Contratos de los prompts del framework (orquestador, agentes, skills y `AGENTS.md`) bajo el principio
de ownership único: cada regla vive en una sola superficie canónica, el destilado del contexto entre
tramos preserva los artefactos de control y la evidencia, las instrucciones específicas de host no se
filtran al texto compartido, y todo recorte de tokens se gobierna con un baseline reproducible sin
degradar las salvaguardas del flujo.

## Requirements

### Requirement: Fuente única de las reglas compartidas entre skill y agente

Toda regla que hoy se declare tanto en una skill como en un agente SHALL tener una única fuente canónica. Las reglas compartidas por todos los agentes del proyecto SHALL vivir en `AGENTS.md`; la superficie que las consumía SHALL referenciarlas en lugar de repetir su texto. Ningún prompt SHALL duplicar texto normativo ya presente en su fuente canónica.

#### Scenario: Una regla compartida deja de estar duplicada

- **WHEN** una regla que era declarada en dos superficies (skill y agente) se mueve a su fuente canónica
- **THEN** existe una sola declaración de la regla
- **AND** la otra superficie la referencia sin repetir su texto

#### Scenario: La regla de idioma vive en la fuente canónica

- **WHEN** se revisa la regla de idioma de los artifacts
- **THEN** vive en el bloque `LOCKED: artifacts-language` de `AGENTS.md`
- **AND** las skills y agentes que escriben artifacts la referencian en lugar de redeclararla

#### Scenario: La frescura del seed no se re-declara en cada superficie

- **WHEN** se revisa la regla de frescura del seed al archivar
- **THEN** tiene un único hogar canónico
- **AND** la otra superficie la referencia sin repetir el texto

### Requirement: Ausencia de duplicación de secciones en el orquestador

El orquestador SHALL declarar cada regla una sola vez. La restricción de runtime (plan/read-only) SHALL tener un único hogar canónico. El contrato de salida de cada subagente SHALL vivir en el propio agente, y el orquestador SHALL referenciarlo en lugar de re-enumerar sus campos.

#### Scenario: Runtime Safety con un único hogar

- **WHEN** se revisa el orquestador
- **THEN** la regla de plan/read-only aparece declarada una sola vez
- **AND** la sección de Workflow sólo conserva el punto de control, sin repetir la regla

#### Scenario: El contrato de salida no se re-enumera

- **WHEN** el orquestador describe la salida esperada de un subagente
- **THEN** referencia el contrato de salida del propio agente
- **AND** no re-lista los campos que el agente ya declara

#### Scenario: Los agentes conservan su contrato de salida

- **WHEN** se deduplica el orquestador
- **THEN** cada agente conserva su sección de Output Expectations y su `**Output cap**`

### Requirement: Destilado por tramo del Resolved Context Envelope

El orquestador NO SHALL reinyectar el Resolved Context Envelope verbatim a cada subagente. SHALL pasar a
cada tramo sólo los campos que ese tramo necesita, y SHALL preservar siempre: (a) los cinco artefactos de
control — `task-owned files`, `Validation Ledger`, `SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED`,
`GUARANTEE NOT SUSTAINED` — y (b) la evidencia como `file:line`. El contrato de destilado SHALL declararse
en una única sección del orquestador. La regla de no copiar diffs SHALL tener una única excepción acotada:
el campo `change diff` producido por `@tester`, pasado verbatim a `@reviewer` y limitado a los archivos
task-owned de ese tramo. Ninguna otra prosa, log o diff SHALL copiarse.

#### Scenario: El envelope llega destilado, no verbatim

- **WHEN** el orquestador delega una etapa a un subagente
- **THEN** le pasa los campos que ese tramo necesita
- **AND** no le pasa el envelope completo verbatim

#### Scenario: Los cinco artefactos de control se preservan

- **WHEN** se destila el retorno de un subagente
- **THEN** `task-owned files`, `Validation Ledger`, `SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED` y
  `GUARANTEE NOT SUSTAINED` se conservan íntegros cuando están presentes

#### Scenario: La evidencia viaja como field

- **WHEN** se pasa evidencia entre tramos
- **THEN** se hace como `file:line` para código y como entradas de ledger para comandos
- **AND** no se copia prosa, logs ni diffs, salvo el campo `change diff` acotado

#### Scenario: La excepción del diff no se generaliza

- **WHEN** el retorno de otro subagente contiene un diff o prosa
- **THEN** el orquestador lo destila
- **AND** no lo copia

#### Scenario: Falta de contexto no se resuelve delegando una consulta

- **WHEN** un subagente reporta que le falta contexto
- **THEN** el orquestador le aporta el campo faltante o se detiene
- **AND** no le indica consultar Azure DevOps

### Requirement: Instrucciones específicas de host fuera del texto compartido

Toda instrucción específica de un host SHALL materializarse sólo en superficies de ese host y NO SHALL escribirse en texto compartido entre hosts (por ejemplo `AGENTS.md` o assets copiados verbatim a todos los hosts).

#### Scenario: Sin instrucción de host en texto compartido

- **WHEN** un host no dispone de una capacidad (por ejemplo una tool de compresión)
- **THEN** ningún asset compartido entre hosts contiene una instrucción que suponga esa capacidad

#### Scenario: La instrucción vive sólo donde existe la tool

- **WHEN** un host dispone de la tool
- **THEN** la instrucción de uso se materializa sólo en las superficies de ese host

### Requirement: Gobernanza del presupuesto de tokens de los prompts

Todo recorte de tokens del contrato de prompts SHALL validarse contra un baseline reproducible. El baseline SHALL registrar la duración de la suite de tests, el consumo medido por `ancleto stats` y el registro de RR/escapes de los changes recientes, con la métrica Q = (1−RR)(1−escapes). Un recorte SHALL aceptarse sólo si ΔQ ≥ 0; si ΔQ < 0, SHALL revertirse.

#### Scenario: El baseline es reproducible

- **WHEN** inicia el change
- **THEN** existe un baseline registrado con la suite cronometrada, el consumo de `ancleto stats` y RR/escapes

#### Scenario: Criterio de aceptación de un recorte

- **WHEN** se mide un recorte de tokens
- **THEN** se acepta sólo si ΔQ ≥ 0
- **AND** se revierte si ΔQ < 0

### Requirement: Salvaguardas intocables por el recorte

Ningún recorte de tokens SHALL eliminar ni degradar las salvaguardas del flujo: la verificación de garantías bajo el modelo real, la verificación de los afectados (no sólo los archivos tocados), `bash:false` en reviewer/orchestrator/spec-writer, el Validation Ledger y los cinco flags, el bloqueo por CRITICAL y el baseline reproducible.

#### Scenario: Las salvaguardas sobreviven al recorte

- **WHEN** se deduplican o destilan prompts
- **THEN** cada salvaguarda protegida sigue vigente
- **AND** cada una queda cubierta por un assert de comportamiento

### Requirement: Asserts de comportamiento en los content guards

Las pruebas de contenido SHALL asertar el comportamiento requerido mediante keywords de comportamiento y
la presencia de las salvaguardas, y NO SHALL fijar la redacción literal de los prompts. El patrón de
normalización de whitespace, acotamiento del slice a la sección y prueba por mutación en una copia scratch
SHALL aplicar a todo guard que se modifique y asierta sobre prosa y secciones de los prompts: la presencia
del invariante se asierta sobre el tramo normalizado, no sobre párrafos literales. Los guards sobre
frontmatter o bloques no prosísticos (p. ej. `tools`, `permission.bash`) SHALL usar normalización y mutación
sobre el bloque relevante, y NO SHALL exigírseles el slice por sección, porque ese concepto no aplica. La
mutación SHALL seguir siendo obligatoria en todos los casos: un guard sin mutación que lo pueda romper sigue
siendo un defecto. Un guard que fije redacción literal SHALL considerarse un defecto y SHALL migrarse cuando
se toque su contrato.

#### Scenario: La regla movida se asierta en su fuente única

- **WHEN** una regla compartida se mueve a su fuente canónica
- **THEN** el guard asierta el keyword de comportamiento en la fuente única
- **AND** deja de exigir el literal en la superficie que ahora la referencia

#### Scenario: Relajar un assert no elimina la cobertura

- **WHEN** se relaja un assert a keywords de comportamiento
- **THEN** la salvaguarda que cubría sigue teniendo un assert de comportamiento

#### Scenario: El guard normaliza y acota el slice

- **WHEN** un guard que se modifica asierta un invariante sobre prosa o una sección
- **THEN** normaliza el whitespace y acota el slice a su sección
- **AND** asierta el keyword de comportamiento dentro de ese slice

#### Scenario: El guard de frontmatter muta sin slice por sección

- **WHEN** un guard que se modifica asierta un invariante sobre frontmatter o un bloque no prosístico
- **THEN** normaliza el bloque relevante y lo muta en una copia scratch
- **AND** no se le exige un slice por sección

#### Scenario: La mutación prueba el guard

- **WHEN** el invariante se quita en una copia scratch
- **THEN** el guard falla
- **AND** cuando el invariante está presente, el guard pasa

### Requirement: Política de validaciones declarativa por proyecto

El contrato de validaciones del framework SHALL declararse por referencia a los comandos que el proyecto
declara en `PRODUCT.md` → `## Project Commands`, y NO SHALL hardcodear comandos de validación ni asumir
el tooling del proyecto. `templates/AGENTS.md` SHALL declarar esta política dentro de un bloque `LOCKED`
para que `install`/`upgrade` la re-apliquen. Las plantillas y skills que emiten o describen pasos de
verificación SHALL aplicar la misma política. Si un comando no está declarado, la validación SHALL
saltearse y registrar la omisión; NUNCA SHALL inventarse ni asumirse un runner, linter, formatter o
typechecker.

#### Scenario: Se corre solo lo que el proyecto declara

- **WHEN** el proyecto declara sus comandos de validación en `PRODUCT.md` → `## Project Commands`
- **THEN** las validaciones corren exactamente esos comandos
- **AND** no corren comandos que el proyecto no declaró

#### Scenario: Comando faltante se registra, no se inventa

- **WHEN** el proyecto no declara un comando de validación esperado
- **THEN** esa validación se saltea
- **AND** la omisión se registra explícitamente
- **AND** no se inventa ni se asume un comando sustituto

#### Scenario: Las superficies de skill referencian los comandos declarados

- **WHEN** se revisan las plantillas/skills que emiten pasos de verificación
  (`skills/ancleto-upgrade/references/templates.md`, `skills/ancleto-pr/SKILL.md`,
  `skills/ancleto-security/SKILL.md`, `skills/ancleto-upgrade/SKILL.md`)
- **THEN** referencian los comandos declarados por el proyecto en `PRODUCT.md` → `## Project Commands`
- **AND** no fijan un comando de validación concreto
- **AND** emiten cada verificación sólo si el proyecto declara su comando

#### Scenario: La fuente de verdad y sus guardrails no re-fijan comandos

- **WHEN** se revisan `PRODUCT.md` → `## Project Commands` y su sección de guardrails
  ("Critical Files & Guardrails")
- **THEN** la sección de guardrails alinea sus validaciones con `## Project Commands` y con el bloque
  `LOCKED` `validation-commands` de `AGENTS.md`
- **AND** no enumera comandos concretos stale (ni `typecheck` ni un formatter asumido) ni la nota de
  scripts inexistentes

#### Scenario: La política vive en un bloque LOCKED

- **WHEN** se re-aplica el template sobre un proyecto en `install`/`upgrade`
- **THEN** la política de validaciones se actualiza como bloque `LOCKED`
- **AND** el texto no es host-específico

### Requirement: Format check declarativo con `not-configured` por defecto

El contrato de prompts de los agentes SHALL correr un format check solo si el proyecto declara un
formatter. Si el proyecto no declara un formatter, el format check SHALL reportarse como
`not-configured` y NO SHALL tratarse como fallo. Los prompts de agente NO SHALL hardcodear un formatter
concreto (por ejemplo Prettier) ni asumir reglas de linter específicas.

#### Scenario: Proyecto sin formatter declarado

- **WHEN** el proyecto no declara un formatter en `## Project Commands`
- **THEN** el format check se reporta como `not-configured`
- **AND** no se corre Prettier ni ningún formatter asumido

#### Scenario: Los agentes usan el formatter declarado, no uno fijo

- **WHEN** se revisan `agents/coder.md` y `agents/tester.md`
- **THEN** referencian el formatter y el linter declarados por el proyecto
- **AND** no hardcodean Prettier ni ESLint

### Requirement: Invocación acotada de la suite de tests

Las validaciones de test SHALL ejecutarse mediante el comando declarado por el proyecto (por ejemplo
`npm test`) o con rutas explícitas a los archivos relevantes. NUNCA SHALL ejecutarse `node --test` sin
acotar, que descubre archivos fuera de la suite declarada.

#### Scenario: Suite vía el comando declarado

- **WHEN** el proyecto declara un comando de test
- **THEN** la suite se corre con ese comando

#### Scenario: Nunca `node --test` sin acotar

- **WHEN** se valida un conjunto acotado de archivos
- **THEN** se pasan rutas explícitas o se usa el comando declarado
- **AND** no se corre `node --test` pelado

### Requirement: Reconciliación de superficies mergeadas por bloques

Toda ruta que invoca `mergeLocked` sobre los templates raíz (`AGENTS.md` y `PRODUCT.md`,
`src/cli/index.js` → `TEMPLATES`) —`install`/`update`/`upgrade` (vía `copyTemplates`) e `import`— SHALL
reconciliar las superficies que el framework mergea por bloques antes de mergear, para que las
instalaciones existentes no conserven guía plana obsoleta junto al bloque canónico. NO SHALL existir una
ruta que mergee `TEMPLATES` sin reconciliar. Cuando el contrato de validaciones pase a vivir en un bloque
`LOCKED`, estas rutas SHALL eliminar la lista plana legada identificada del `AGENTS.md` del proyecto y
SHALL dejar sólo el bloque canónico, sin pasos manuales. La reconciliación SHALL ser segura (no elimina
contenido del usuario fuera del bloque legado identificado), idempotente (re-ejecutarla no duplica ni
rompe), host-neutral y sin nuevas dependencias de runtime.

#### Scenario: Instalación existente queda sin la guía vieja

- **WHEN** un proyecto ya instalado tiene la lista plana legada de validaciones en `AGENTS.md`
- **AND** se corre `ancleto upgrade` (o `install`/`update`)
- **THEN** la lista plana legada se elimina
- **AND** queda el bloque canónico `LOCKED: validation-commands`
- **AND** no coexisten la guía vieja y la nueva

#### Scenario: Importar un bundle también reconcilia la guía vieja

- **WHEN** se importa un bundle (`ancleto import`) cuyo `AGENTS.md` trae el bloque canónico
- **AND** el `AGENTS.md` del proyecto destino conserva la lista plana legada de validaciones
- **THEN** la lista plana legada se elimina antes del merge
- **AND** queda sólo el bloque canónico `LOCKED: validation-commands`
- **AND** no coexisten la guía vieja y la nueva

#### Scenario: Ninguna ruta mergea `TEMPLATES` sin reconciliar

- **WHEN** se revisan las rutas que invocan `mergeLocked` sobre `TEMPLATES` (`install`/`update`/`upgrade`
  en `copyTemplates`, e `import`)
- **THEN** todas ejecutan la reconciliación de bloques planos legados antes del merge

#### Scenario: La reconciliación es segura e idempotente

- **WHEN** el bloque legado fue personalizado o no coincide exactamente con la firma reconocida
- **THEN** no se elimina contenido fuera del bloque legado identificado
- **AND** se registra un aviso
- **AND** re-ejecutar la actualización no duplica ni rompe el archivo

#### Scenario: Superficies mergeadas vs copiadas enteras

- **WHEN** se actualiza el proyecto
- **THEN** `AGENTS.md`/`PRODUCT.md` (mergeados por bloque) se reconcilian
- **AND** los assets de skill (`.opencode/skills/`, copiados enteros) se regeneran

### Requirement: Cobertura de guardas del contrato de validaciones

Las pruebas de contenido SHALL asertar el comportamiento del contrato de validaciones: la existencia de
la política en su fuente única, la ausencia de un formatter o typecheck hardcodeado, y la referencia a
los comandos declarados por el proyecto. Los guards NO SHALL fijar la redacción literal de los prompts.
Estas guardas SHALL actualizarse en el mismo change que modifica el contrato.

#### Scenario: La política se asierta en su fuente única

- **WHEN** se revisa `test/content-guards.test.js`
- **THEN** asierta la política de validaciones declarativa en `templates/AGENTS.md`
- **AND** asierta que no hay comandos ni formatter hardcodeados

#### Scenario: Las salvaguardas conservan su cobertura

- **WHEN** se actualizan los guards del contrato de validaciones
- **THEN** los guards de las salvaguardas intocables (`bash:false`, cinco flags, Validation Ledger,
  bloqueo por CRITICAL) permanecen

#### Scenario: Las superficies de skill quedan cubiertas

- **WHEN** se revisa `test/content-guards.test.js`
- **THEN** asierta que `skills/ancleto-upgrade/references/templates.md`, `skills/ancleto-pr/SKILL.md`,
  `skills/ancleto-security/SKILL.md` y `skills/ancleto-upgrade/SKILL.md` no fijan comandos de validación
  concretos
- **AND** asierta que referencian los comandos declarados por el proyecto
- **AND** asierta que `PRODUCT.md` → `## Project Commands` y sus guardrails están alineados, sin
  `typecheck` ni formatter asumido

#### Scenario: `PRODUCT.md` no duplica la fuente única ni arrastra conteos stale

- **WHEN** se revisa `PRODUCT.md`
- **THEN** la sección de guardrails NO SHALL enumerar de nuevo los comandos de validación (referencia a
  `## Project Commands` y al bloque LOCKED `validation-commands`)
- **AND** el conteo de archivos de la suite NO SHALL estar stale respecto de `test/*.test.js`

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

### Requirement: Intake de sesión con estado del árbol y changes activos

Al inicio de sesión, el orquestador SHALL detectar los changes activos en `aspec/changes/` excluyendo `archive/` y SHALL reportarlos únicamente cuando alguno de ellos difiera del change solicitado. Cuando el pedido toque el estado del repositorio, el orquestador SHALL delegar `git status --short` a un agente con shell, porque el orquestador no dispone de shell. Cuando el árbol esté limpio y no exista un change activo ajeno, el orquestador NO SHALL emitir reporte alguno.

#### Scenario: Un change activo ajeno se reporta

- **WHEN** al iniciar la sesión existe en `aspec/changes/` un change activo distinto del solicitado
- **THEN** el orquestador lo reporta antes de continuar con el pedido

#### Scenario: El estado del árbol se delega a un agente con shell

- **WHEN** el pedido toca el estado del repositorio
- **THEN** el orquestador delega `git status --short` a un agente con shell
- **AND** no intenta ejecutarlo por sí mismo

#### Scenario: Sin nada que reportar no hay salida

- **WHEN** el árbol está limpio
- **AND** no existe un change activo ajeno al solicitado
- **THEN** el orquestador no emite reporte de intake
- **AND** continúa con el pedido sin costo adicional

_No-testeable-por-construcción: la ausencia de reporte es una no-acción sin salida observable; no existe artefacto que pruebe el silencio. Se ancla con un content guard que fija la condición de silencio en el contrato del orquestador._

### Requirement: Exención acotada de lecturas para archivos nombrados por el usuario

El párrafo del techo de lecturas de `agents/orchestrator.md` SHALL declarar, dentro del mismo párrafo y junto al techo de tres archivos, que los archivos que el usuario nombra explícitamente en su mensaje están exentos del techo con un tope de 5 por turno; al superar el tope, la lectura SHALL delegarse en lugar de ejecutarse directamente. El mismo párrafo SHALL conservar la exención de las lecturas proactivas ya vigentes. Ninguna afirmación absoluta del prompt del orquestador SHALL contradecir esta exención.

#### Scenario: Los archivos nombrados por el usuario no consumen el techo

- **WHEN** el usuario nombra explícitamente hasta 5 archivos en su mensaje
- **THEN** el orquestador los lee directamente
- **AND** esas lecturas no consumen el techo de tres archivos de contexto no dirigido

#### Scenario: Por encima del tope la lectura se delega

- **WHEN** el usuario nombra explícitamente más archivos que el tope de 5 en un turno
- **THEN** la lectura que excede el tope se delega
- **AND** el orquestador no la ejecuta directamente

#### Scenario: La exención vive en el párrafo del techo

- **WHEN** se revisa la sección del techo de lecturas en `agents/orchestrator.md`
- **THEN** la exención de archivos nombrados por el usuario, su tope de 5 y la delegación por encima del tope están en el mismo párrafo que el techo
- **AND** no aparecen como una regla separada que el techo pueda contradecir

#### Scenario: No queda texto absoluto que contradiga la exención

- **WHEN** se revisan todas las afirmaciones del techo de lecturas en `agents/orchestrator.md`
- **THEN** ninguna prohíbe en términos absolutos leer archivos nombrados por el usuario dentro del tope
- **AND** las referencias a "cuarto archivo" quedan reconciliadas con la exención

_No-testeable-por-construcción: la ausencia de texto contradictorio es una propiedad negativa del contenido y no un comportamiento ejecutable; se ancla con un content guard que asierta la reconciliación del techo y la presencia de la exención acotada, sin fijar la redacción literal._

> Pendiente de design: quedan sin definir en este spec (1) si "5 por turno" significa por mensaje del usuario o acumulado a lo largo de la sesión, y (2) qué agente recibe la lectura delegada al superar el tope.

### Requirement: Recall delegado ante `<ContextOverflowWarning>`

Cuando el contexto de trabajo contenga un `<ContextOverflowWarning>`, el orquestador SHALL delegar un único Recall a `@memory-keeper` con el topic de la tarea, antes de delegar cualquier otra etapa. El orquestador NO SHALL llamar `searchMemory` directamente ni delegarla a un agente distinto de `@memory-keeper`.

#### Scenario: El warning dispara un Recall previo

- **WHEN** el contexto de trabajo contiene un `<ContextOverflowWarning>`
- **THEN** el orquestador delega un Recall a `@memory-keeper` con el topic de la tarea
- **AND** lo hace antes de delegar el resto de las etapas

#### Scenario: Un solo Recall por warning

- **WHEN** el orquestador procesa un `<ContextOverflowWarning>`
- **THEN** delega exactamente un Recall
- **AND** no repite la delegación por el mismo warning

#### Scenario: El orquestador no toca la memoria directamente

- **WHEN** el orquestador necesita recuperar memoria histórica
- **THEN** delega en `@memory-keeper`
- **AND** no invoca `searchMemory` por sí mismo

_No-testeable-por-construcción: la prohibición de invocar una tool ausente y la unicidad de la delegación son no-acciones sin salida observable; se anclan con un content guard que fija la delegación única y la prohibición en el contrato del orquestador._

### Requirement: Ownership de commit, merge y push

El commit SHALL ser mecánico y local, con dueño `@coder`. El push SHALL ser una operación de release
denegada como capacidad para todos los agentes: SHALL estar denegado en el permiso de `@coder`, ninguna
definición de agente SHALL habilitarlo, y SHALL ejecutarlo el usuario, o el agente del host que el usuario
nombre en ese caso. El merge SHALL ser una capacidad permitida, pero su
autorización SHALL ser por proceso: `@coder` SHALL ejecutarlo sólo cuando el usuario haya dado OK explícito
en ese caso y NO SHALL iniciarlo por sí mismo. Ningún agente SHALL iniciar merge ni push por iniciativa
propia. `@coder` SHALL ser el único agente que commitea, en dos momentos: sus propios checkpoints de
implementación y el archive. Cada commit de checkpoint SHALL estar acotado a los archivos que el
orquestador nombró en ese checkpoint; `@coder` NO SHALL commitear archivos fuera de ese conjunto. Un merge
autorizado (`@coder`, sólo con OK explícito del usuario por caso) NO SHALL considerarse un commit de
checkpoint y queda fuera de la restricción de conjunto; se autoriza por proceso. `@documenter` NO SHALL
commitear nunca y su prohibición de git de escritura SHALL preservarse. La convención de mensajes
(Conventional Commits) y la protección de `main`/`master` SHALL referenciarse desde su fuente única en
`AGENTS.md`/`PRODUCT.md`, no re-declararse en los agentes.

#### Scenario: Commit acotado al checkpoint de implementación

- **WHEN** el orquestador delega un checkpoint de implementación y nombra el conjunto de archivos
- **THEN** `@coder` commitea únicamente esos archivos
- **AND** no stagea ni commitea archivos fuera de ese conjunto

#### Scenario: El archive lo commitea el coder

- **WHEN** `@documenter` termina el archive del change
- **THEN** el orquestador delega a `@coder` el commit de las rutas archivadas que nombró
- **AND** `@documenter` no commitea

#### Scenario: El documenter nunca commitea

- **WHEN** `@documenter` archiva un change o actualiza una spec source-of-truth
- **THEN** no ejecuta ningún comando de git de escritura
- **AND** su prohibición de git de escritura se mantiene

#### Scenario: El push lo ejecuta el usuario o el agente del host que nombre

- **WHEN** una operación de push es necesaria
- **THEN** ningún agente la ejecuta por iniciativa propia
- **AND** la ejecuta el usuario, o el agente del host que el usuario nombre en ese caso

#### Scenario: El coder tiene git push denegado

- **WHEN** se inspecciona el permiso de bash de `@coder`
- **THEN** `git push` está denegado
- **AND** `git merge` no se agrega al deny

#### Scenario: El coder ejecuta el merge sólo con OK explícito por caso

- **WHEN** el usuario dio OK explícito para mergear en ese caso
- **THEN** `@coder` ejecuta el merge
- **AND** no lo inicia por sí mismo en ningún otro caso

#### Scenario: El merge autorizado no queda sujeto al conjunto del checkpoint

- **WHEN** el usuario autoriza un merge en ese caso
- **THEN** `@coder` lo ejecuta
- **AND** ese commit no queda sujeto a la restricción del conjunto nombrado en un checkpoint anterior

#### Scenario: La convención se referencia, no se re-declara

- **WHEN** `@coder` commitea
- **THEN** sigue las reglas de Conventional Commits y de ramas protegidas de `AGENTS.md`/`PRODUCT.md`
- **AND** no repite su texto en la definición del agente

### Requirement: Declaración explícita de `task` con `true` sólo en el orquestador y su portabilidad

Las 10 definiciones de `agents/*.md` SHALL declarar la tool `task` de forma explícita. Sólo el orquestador
SHALL declarar `task: true`: exactamente una definición la habilita y SHALL ser la del orquestador; las 9
definiciones restantes SHALL declarar `task: false`. La declaración habilitada NO SHALL asumirse portable:
en los hosts cuyo adapter no puede representar la tool de delegación (Antigravity y Command Code), el
adapter SHALL descartarla con aviso visible y la brecha SHALL quedar registrada. La declaración
deshabilitada de las 9 restantes MAY no viajar en hosts sin id de delegación, porque no amplía
capacidades. La brecha de portabilidad NO SHALL ser razón para omitir la declaración en la fuente.

#### Scenario: Las 10 definiciones declaran task

- **WHEN** se inspeccionan las 10 definiciones de `agents/*.md`
- **THEN** cada una declara `task` explícitamente
- **AND** ninguna queda sin la declaración

#### Scenario: Sólo el orquestador declara task true

- **WHEN** se comparan las declaraciones de `task`
- **THEN** exactamente una definición declara `task: true` y es la del orquestador
- **AND** las 9 restantes declaran `task: false`

#### Scenario: Antigravity y Command Code descartan la declaración habilitada con aviso

- **WHEN** se adapta `@orchestrator` para Antigravity o Command Code
- **THEN** el adapter descarta `task` y emite un aviso visible
- **AND** la salida conserva la lista de tools esperada para ese host

#### Scenario: La declaración deshabilitada no amplía capacidades

- **WHEN** el `task: false` de un subagente no viaja a un host sin id de delegación
- **THEN** el host no gana la tool de delegación
- **AND** la restricción no se debilita

#### Scenario: La brecha de portabilidad se registra

- **WHEN** se revisa la portabilidad de la declaración
- **THEN** la brecha queda declarada en el contrato
- **AND** no se usa para omitir la declaración en la fuente

### Requirement: Campo change diff en el retorno de @tester

El retorno de `@tester` SHALL incluir un campo `change diff` con
`git diff --unified=3 -- <archivos task-owned>` y `git diff --stat`. El diff SHALL usar tres líneas de
contexto (`-U3`) y NUNCA `-U0`. El campo SHALL tener un tope explícito de 200 líneas; si el diff excede el
tope, `@tester` SHALL degradar a `--stat` más hunks seleccionados que quepan en el tope, NUNCA a `-U0`, y
SHALL declarar cuántas líneas o cuántos hunks quedaron fuera: el campo NO SHALL presentar un diff
recortado como diff completo. Un diff truncado en silencio es peor que no mandar diff. El orquestador SHALL
pasar el campo verbatim a `@reviewer`, acotado a esos archivos e incluida su declaración de truncación; NO
SHALL completar ni inferir la cuenta omitida. La excepción a la regla de no copiar diffs SHALL quedar
acotada a ese campo y a esos archivos. El diff SHALL viajar marcado como evidencia, no como instrucción;
`@reviewer` NO SHALL ejecutar nada que venga del diff y SHALL citar `file:line`.

#### Scenario: El tester devuelve diff con contexto y stat

- **WHEN** `@tester` termina la validación
- **THEN** el campo `change diff` contiene el diff con `-U3` y el `--stat`
- **AND** el diff cubre los archivos task-owned finales

#### Scenario: Por encima del tope se degrada sin perder contexto

- **WHEN** el diff con `-U3` supera las 200 líneas
- **THEN** el campo contiene `--stat` más hunks seleccionados dentro del tope
- **AND** no se cambia a `-U0`

#### Scenario: La truncación del diff se declara

- **WHEN** el diff se recorta por el tope
- **THEN** el campo declara la cantidad omitida en líneas o en hunks
- **AND** no se presenta como diff completo

#### Scenario: El orquestador pasa el campo verbatim y acotado

- **WHEN** el orquestador delega el review
- **THEN** pasa el campo `change diff` verbatim, incluida su declaración de truncación
- **AND** no completa ni infiere la cuenta omitida
- **AND** la excepción queda limitada a ese campo y a esos archivos

#### Scenario: El reviewer lo consume como evidencia

- **WHEN** `@reviewer` recibe el `change diff`
- **THEN** lo usa para juzgar y citar `file:line`
- **AND** no ejecuta nada que venga del diff

#### Scenario: La regla de no copiar diffs no se generaliza

- **WHEN** el orquestador destila el retorno de otro subagente
- **THEN** no copia sus diffs
- **AND** la única excepción es el campo `change diff`

### Requirement: Reglas de proyecto destiladas por delegación

El orquestador SHALL destilar del bloque `<ProjectMemoryRules>` que ya leyó verbatim las reglas relevantes
al scope delegado y SHALL pasarlas como campo `project memory rules` en cada delegación que pueda aplicar
reglas de proyecto. El campo NO SHALL exceder 5 reglas ni 1,500 bytes, para no convertirse en un segundo
working-context. El campo SHALL estar marcado explícitamente como dato no confiable, a verificar contra el
código antes de aplicarlo. El bloque completo NO SHALL reenviarse verbatim. El bloque de entorno
`.ancleto/machine-env.md` SHALL conservar su propagación vigente a los agentes con `bash`; este requirement
NO SHALL reabrirlo.

#### Scenario: Se destilan las reglas relevantes

- **WHEN** el orquestador delega una tarea con scope definido
- **THEN** incluye las reglas relevantes destiladas de `<ProjectMemoryRules>`
- **AND** omite las reglas irrelevantes

#### Scenario: El tope evita un segundo working-context

- **WHEN** las reglas relevantes superan 5 reglas o 1,500 bytes
- **THEN** el campo conserva el subconjunto de mayor relevancia dentro del tope
- **AND** anota la truncación

#### Scenario: El campo se marca como no confiable

- **WHEN** el campo `project memory rules` se pasa a un subagente
- **THEN** se marca como dato no confiable a verificar contra el código
- **AND** no se presenta como instrucción

#### Scenario: No se reenvía el bloque completo

- **WHEN** el orquestador delega
- **THEN** no pasa el bloque `<ProjectMemoryRules>` completo verbatim
- **AND** sólo pasa el destilado acotado

#### Scenario: El bloque de entorno sigue igual

- **WHEN** se revisa la propagación de `.ancleto/machine-env.md`
- **THEN** los 6 agentes con `bash` siguen recibiéndolo verbatim
- **AND** este requirement no cambia esa propagación

### Requirement: Evidencia file:line en las afirmaciones de @documenter

Cada afirmación de «actualizado» o «confirmado» en el retorno de `@documenter` SHALL estar respaldada por
`file:line` del requirement tocado. `@documenter` SHALL usar sus tools de lectura (`bash`, `glob`, `read`)
para obtener la evidencia y NO SHALL afirmar «actualizado» o «confirmado» sin ella.

#### Scenario: Una spec actualizada cita el requirement

- **WHEN** `@documenter` actualiza una spec source-of-truth
- **THEN** la afirmación incluye el `file:line` del requirement tocado

#### Scenario: Una confirmación cita el requirement

- **WHEN** `@documenter` confirma que una spec ya es consistente
- **THEN** la afirmación incluye el `file:line` que verificó

#### Scenario: Sin evidencia no hay afirmación

- **WHEN** `@documenter` no puede producir el `file:line`
- **THEN** no afirma «actualizado» ni «confirmado»
- **AND** reporta el gap

### Requirement: Ningún agente borra change folders

Ningún agente SHALL borrar change folders. Un change abandonado SHALL borrarlo el desarrollador.
`@spec-writer` NO SHALL recibir una tool de delete. El orquestador SHALL declarar este invariante en su
Active Change Check: no borra, no delega un borrado y entrega el descarte al desarrollador.

#### Scenario: El orquestador no borra ni delega el borrado

- **WHEN** un change queda abandonado
- **THEN** el orquestador no lo borra
- **AND** no delega un borrado
- **AND** indica al desarrollador que retire la carpeta

#### Scenario: El desarrollador es el dueño del borrado

- **WHEN** el desarrollador decide abandonar un change
- **THEN** el desarrollador retira `aspec/changes/{change-name}/`
- **AND** ningún agente ejecuta el paso destructivo

#### Scenario: El spec-writer no tiene delete

- **WHEN** se inspeccionan las tools de `@spec-writer`
- **THEN** no incluye una tool de delete
- **AND** no borra change folders

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

### Requirement: El checkpoint de aprobación aprueba el contrato del cambio

El checkpoint posterior a `@spec-writer` SHALL presentar el contrato del cambio — intención, alcance,
`Requirement` nuevo o existente citado, riesgos, decisión de arquitectura cuando aplique, validación
prevista y paths autorizados — en menos de una pantalla, y SHALL esperar aprobación explícita del
usuario. El checkpoint NO SHALL enumerar artifacts ni pedir la aprobación de documentos generados, y
NO SHALL condicionarse a la existencia de `design.md`. La aprobación del contrato habilita la
implementación y NO SHALL interpretarse como aprobación del archive ni del merge.

#### Scenario: Checkpoint con contrato completo

- **WHEN** `@spec-writer` termina de generar los artifacts de un change que requiere especificación
- **THEN** el orquestador presenta intención, alcance, `Requirement` nuevo o existente, riesgos, decisión
  de arquitectura si aplica, validación prevista y paths autorizados en menos de una pantalla
- **AND** espera una respuesta explícita antes de delegar la implementación
- **AND** no enumera documentos generados como objeto de la aprobación

#### Scenario: Enmienda cuando cambia el contrato

- **WHEN** después del checkpoint cambia el alcance, el riesgo o la decisión de arquitectura
- **THEN** el orquestador presenta el contrato enmendado y espera una nueva aprobación explícita antes de
  continuar
- **AND** una decisión descubierta durante la implementación que no altera alcance, riesgo ni
  arquitectura se agrega al `proposal ## Decisiones` sin exigir una nueva aprobación

#### Scenario: Los stops no se confunden entre sí

- **WHEN** el contrato del change está aprobado, la implementación está validada y el review no tiene
  hallazgos críticos
- **THEN** el archive sigue siendo un stop separado que espera aprobación explícita del usuario
- **AND** el merge sigue siendo un stop separado que espera aprobación explícita para ese caso
- **AND** ninguno de los dos se satisface con la aprobación del contrato

### Requirement: Retiro de `design.md` y `context.md` sin artifact sucesor

Ningún generador de artifacts SHALL producir `design.md` ni `context.md` en un change nuevo. Ningún
consumidor SHALL exigirlos como precondición ni reportar su ausencia como artifact faltante. El retiro
NO SHALL introducir un artifact sucesor ni un archivo de diseño renombrado: una decisión durable SHALL
registrarse en `proposal.md ## Decisiones`, con la forma que define `agents/spec-writer.md`. La lectura de
un `design.md` o `context.md` legacy SHALL permanecer disponible como opcional, y ningún artifact de un
change archivado SHALL eliminarse, migrarse ni reescribirse. Al archivar, el directorio del change SHALL
moverse sin modificarse.

#### Scenario: Generador de un change nuevo

- **WHEN** cualquiera de los generadores de artifacts escribe los artifacts de un change nuevo
- **THEN** no produce `design.md` ni `context.md`
- **AND** una decisión durable se escribe en `proposal.md ## Decisiones`
- **AND** no se crea ningún artifact sucesor para el diseño

#### Scenario: Consumidor ante un change nuevo

- **WHEN** un consumidor de artifacts (`@coder`, `@tester`, `@reviewer`, `@documenter`, `@orchestrator`,
  `ancleto-apply`, `ancleto-verify`, `ancleto-bulk-archive`) procesa un change nuevo que no tiene
  `design.md` ni `context.md`
- **THEN** no los reporta como artifact faltante ni condiciona el flujo a su presencia
- **AND** la verificación de completitud se apoya en `tasks.md` y en `specs/`

#### Scenario: Change legacy con artifacts retirados

- **WHEN** un change, activo o archivado, contiene un `design.md` o un `context.md` de una versión previa
- **THEN** se leen como legacy opcional
- **AND** no se eliminan, migran ni reescriben
- **AND** las decisiones históricas ya respaldadas en memoria siguen siendo recuperables

#### Scenario: Archive sin borrado de scaffold legacy

- **WHEN** se archiva un change activo que todavía contiene un `context.md` legacy
- **THEN** el directorio del change se mueve sin modificarse
- **AND** el `context.md` legacy no se borra
