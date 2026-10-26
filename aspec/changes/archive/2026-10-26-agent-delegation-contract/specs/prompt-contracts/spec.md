# Spec delta: prompt-contracts

> Delta sobre `aspec/specs/prompt-contracts/spec.md`.
> Requirements agregados y modificados por `agent-delegation-contract`. Los keywords y los nombres de
> archivo quedan en inglés literal; el contenido va en español.

## ADDED Requirements

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

## MODIFIED Requirements

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
