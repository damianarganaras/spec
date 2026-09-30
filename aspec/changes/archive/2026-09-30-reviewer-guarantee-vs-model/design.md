# Design: Verificación de la garantía del proposal bajo el modelo real en el reviewer

## Contexto y problema

Hoy el reviewer verifica consistencia implementación↔delta spec, pero no tiene mandato de verificar
que la **garantía declarada en el proposal** se sostenga bajo el **modelo real** del sistema. El
estado actual, confirmado contra el árbol real antes de escribir:

- `agents/reviewer.md` define tres modos de input (`aspec Change`, `direct-implementation`,
  `direct-test-only`) en `## Input Modes` (`agents/reviewer.md:30-63`). El modo `aspec Change`
  (`:32-40`) revisa contra delta specs, `tasks.md` y `design.md`. No hay mandato de garantía.
- El workflow del reviewer acota la lectura a lo mínimo: paso 2, "Read only the minimum relevant
  approved inputs and changed implementation files" (`agents/reviewer.md:68`). Los `## Scope Review
  Rules` limitan la revisión a los `task-owned files` (`:74-99`). Ambas reglas actúan como techo de
  lectura y, tal como están, impiden leer el código relevante más allá del diff.
- La salida (`## Output Expectations`, `:155-168`; bloque de formato, `:172-198`) tiene tres
  severidades y un flag `SPEC UPDATE RECOMMENDED` limitado a `direct-implementation` (`:101-117`,
  `:163`, `:187-189`). No existe un flag de garantía.
- `agents/orchestrator.md` delega el review en Path A paso 6 pasando Resolved Context Envelope +
  `task-owned files` + Validation Ledger (`:271`), se detiene ante critical (`MUST STOP … if
  @reviewer reports critical issues`, `:97`), destila flags en `### Handling subagent returns`
  (`:305-314`, campos en `:309`: `SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED`) y declara la
  salida esperada del reviewer en `### Expected output from @reviewer` (`:356-364`).

El gap es de mandato y de inputs: el reviewer puede aprobar un change correcto contra el delta spec
cuya garantía es falsa por una operación que el change no introduce.

**Fuente de verdad del artefacto.** `agents/` es la fuente; `.opencode/agents/` es una copia
generada. `install --project` → `copyTemplates` (`src/cli/index.js:867-883`, invocado `:964`) →
`copyAssets(dest = .opencode)` (`:728-733`) copia los assets `ASSETS = ['agents', 'commands',
'skills']` (`:22`), y `applyTier` reescribe el modelo de cada agente (`:985`). El manifiesto registra
`.opencode/agents` como path instalado (`.ancletorc:9-11`). Se verificó que
`.opencode/agents/reviewer.md` difiere de `agents/reviewer.md` **solo** en la línea `model:`. Por lo
tanto la edición pertenece a `agents/`; `.opencode/agents/` se regenera con `ancleto upgrade` o
`ancleto install --project` y **no** se edita a mano. Los content guards leen `agents/` vía
`ROOT/agents` (`test/content-guards.test.js:35`, `:40`, `:131`), así que la suite valida la fuente.

**Frontera del cambio.** Requiere editar **ambos** agentes: el reviewer (mandato, señal, salida) y el
orquestador (contexto de la delegación y tratamiento del flag como bloqueo). **No** hay cambio de
runtime (no se toca `src/`), **no** se agrega un stage al flujo, y la verificación
implementación↔delta spec **sigue siendo obligatoria** y no se sustituye.

## Decisión adoptada

Reutilizar el review existente, sin stage nuevo, con tres piezas:

1. Un mandato de verificación de garantía **solo en modo `aspec Change`**, con señal de aplicabilidad
   `S1 ∧ S2` que lo mantiene condicional.
2. Un flag explícito `GUARANTEE NOT SUSTAINED`, severidad `CRITICAL`, que nombra garantía, operación
   que la falsa y estado protegido.
3. Propagación de la garantía extraída y el estado protegido, como campos separados, en la
   delegación del review, más el tratamiento del flag como bloqueo reutilizando el `MUST STOP` ante
   critical ya existente (`agents/orchestrator.md:97`).

No se modifica la verificación implementación↔delta spec, ni el runtime del orquestador, ni la
construcción del working-context, ni la detección de effect-claims del spec-writer.

## Diseño técnico

### Ediciones a `agents/reviewer.md`

**Nueva sección de mandato, acotada al modo `aspec Change`.** Agregar una sección
`## Guarantee Verification Under the Real Model` explícitamente marcada como aplicable solo al modo
`aspec Change` (no a `direct-implementation` ni `direct-test-only`). Contenido:

- **Mandato.** El reviewer verifica que la garantía del proposal se sostiene bajo el **modelo real**
  = conjunto de operaciones que pueden mutar el estado que la garantía protege, **incluidas las que
  el change NO introduce** (supersesión de la misma identidad, operaciones de otros módulos, efectos
  indirectos). Es **adicional** a la consistencia implementación↔delta spec y no la reemplaza.
- **Señal de aplicabilidad `S1 ∧ S2`.** El análisis corre solo si se cumple:
  `S1` = el texto del claim nombra una operación identificable (función, comando, tool MCP, paso de
  lifecycle) con cuantificador universal o negativo ("no requiere", "nunca", "solo", "siempre", "no
  hay cambio"); `S2` = esa operación escribe por una identidad **no acotada** a la forma de lo
  escrito (`memory_key`, path, row) sobre un store cuyo read-model es una proyección filtrada u
  ordenada. Se declara explícitamente que **`S1` sola no alcanza** (sobre-dispara) y que **sin
  `S1 ∧ S2` el reviewer NO ejecuta el análisis de modelo** (quedan excluidos los changes simples,
  doc-only y cosméticos).
- **Lectura más allá del diff.** Autorizar y exigir la lectura del código fuente de las operaciones
  que pueden mutar el estado protegido, **no limitada al diff ni a los `task-owned files`**.
- **Salida.** Flag `GUARANTEE NOT SUSTAINED` en severidad `CRITICAL` que nombra (a) la garantía del
  proposal, (b) la operación que la falsa, (c) el estado protegido. No se degrada a `WARNING` ni se
  omite por quedar fuera del diff o de los `task-owned files`.
- **Contexto irresoluble.** Si con el contexto recibido no logra resolver la superficie de escritura
  o el read-model, **reporta el contexto faltante a `@orchestrator`** y **no** concluye que la
  garantía se sostiene.
- **Alcance de modo.** Solo `aspec Change`; no extender a `direct-implementation` ni
  `direct-test-only`.

**Ajustes de coherencia interna (obligatorios, no opcionales).** Dos reglas actuales contradicen el
mandato y deben abrirse de forma acotada para el análisis de garantía, sin perder su propósito
general:

- `## Required Workflow` paso 2 (`:68`): permitir las lecturas adicionales que exige el análisis de
  garantía cuando `S1 ∧ S2` se cumple, manteniendo "mínimo necesario" para el resto del review.
- `## Scope Review Rules` (`:74-99`): carve-out explícito de que un `GUARANTEE NOT SUSTAINED` no se
  descarta por caer fuera de los `task-owned files` ni del diff.

**Salida ampliada.** Sumar el flag a `## Output Expectations` (`:155-168`) y al bloque de formato
(`:172-198`) como sección propia `### GUARANTEE NOT SUSTAINED` (o "none"). Se mantiene **separada** de
`### SPEC UPDATE RECOMMENDED`: son flags de distinta naturaleza (garantía vs documentación), y
`SPEC UPDATE RECOMMENDED` sigue limitado a `direct-implementation` (`:101-117`).

### Ediciones a `agents/orchestrator.md`

- **Delegación del review (Path A paso 6, `:271`).** Cuando el change declara garantías de efecto,
  incluir en la delegación a `@reviewer`, **como campos separados** del resto del análisis, la
  garantía extraída del proposal, el estado protegido y la capability afectada (además del Resolved
  Context Envelope, `task-owned files` y Validation Ledger que ya se pasan).
- **Destilado (`### Handling subagent returns`, `:305-314`).** Agregar `GUARANTEE NOT SUSTAINED` a la
  lista de flags que se extraen y preservan como campos (`:309`).
- **Salida esperada (`### Expected output from @reviewer`, `:356-364`).** Agregar el flag / la
  conclusión de garantía.
- **Bloqueo.** Hacer explícito que `GUARANTEE NOT SUSTAINED`, por ser `CRITICAL`, activa el
  `MUST STOP` ya existente (`:97`) y que **no se avanza hacia archive mientras esté presente**. Esto
  reutiliza la regla vigente; no introduce un stage ni una regla de runtime nueva.
- **Sin stage ni runtime.** No se agrega un paso al flujo ni se modifica la construcción del
  working-context.

### Por qué la señal evita costo en changes simples

El análisis de modelo es una rama **condicional dentro del review existente**, no un stage, una
delegación ni una pasada extra del flujo. El reviewer evalúa primero `S1` (barato: solo texto del
proposal) y solo si se cumple evalúa `S2`; únicamente con `S1 ∧ S2` corre el análisis (lecturas
adicionales de código). En changes simples, doc-only o cosméticos `S1` no se cumple y no hay lectura
adicional por esta causa: el review no se vuelve más lento. El costo extra queda acotado a los
changes con claims de efecto sobre un store con read-model filtrado/ordenado.

### Alcance del modo y relación con el delta spec

La capability `review` describe la verificación ancorada en "la garantía del proposal". Los changes
`direct-implementation` no tienen proposal; limitar el mandato al modo `aspec Change` es una
concreción compatible con el delta spec, **no** una contradicción. Por eso **este diseño no requiere
modificar `specs/review/spec.md`** (el delta spec aprobado queda intacto).

### OPEN QUESTION — sección canónica "Garantía" en el proposal (diferida)

- **Riesgo.** La extracción de la garantía depende de una afirmación explícita en el **texto libre**
  del proposal. Si el proposal no la enuncia de forma extraíble, el orquestador no tiene qué
  propagar y `S1` puede no cumplirse: el análisis se omite en silencio para un change que sí tenía
  un efecto real. No hay hoy una forma determinista de verificar que la garantía fue declarada.
- **Qué lo resolvería.** Una sección canónica `## Garantía` en el proposal (operación + estado
  protegido + claim), que haría la extracción fiable, volvería `S1` determinista y permitiría anclar
  su presencia con un content guard. Sería un change aparte (toca al spec-writer y la plantilla del
  proposal).
- **Decisión diferida.** **No se resuelve ni se implementa en este change.** Se posterga hasta
  observar el primer ciclo real con esta mejora y decidir, con evidencia, si la extracción de texto
  libre alcanza o si la sección canónica es necesaria.

## Alternativas consideradas

- **(A) Solo severidad `CRITICAL`, sin flag con nombre.** Descartada por decisión de producto: el
  flag explícito `GUARANTEE NOT SUSTAINED` es el elegido (es más greppable y anclable por content
  guards que una severidad genérica).
- **(B) Nuevo stage de verificación de garantía.** Descartada: viola el no-goal de no agregar stages
  y agrega costo/coordinación sin necesidad; el review existente ya se detiene ante critical.
- **(C) Extender el análisis a `direct-implementation`.** Descartada por decisión de producto: sin
  proposal no hay garantía declarada salvo que el orquestador la enuncie; se limita a `aspec Change`.
- **(D) Sección canónica "Garantía" ahora.** Diferida como OPEN QUESTION (arriba), no como trabajo
  de este change.

## Frontera y no-regresión (explícito)

- Cambios en **ambos** agentes: `agents/reviewer.md` y `agents/orchestrator.md`.
- **No** hay cambio de runtime: no se toca `src/`.
- **No** se agrega un stage nuevo al flujo; la verificación vive dentro del review existente.
- La verificación implementación↔delta spec **sigue siendo obligatoria** y no se reemplaza.
- El reviewer **no** escribe specs ni diseño, ni reemplaza al spec-writer o al diseño.
- El flag es de naturaleza distinta a `SPEC UPDATE RECOMMENDED`; se mantienen separados.
- El análisis no corre para changes sin garantías de efecto, así que su review no se vuelve más
  lento por este cambio.

## Testabilidad (a nivel de diseño)

El entregable son documentos de agente (markdown); su superficie verificable son **content guards**
en `test/content-guards.test.js` (`node:test`), que leen `agents/*.md` (`:35`, `:131`). El delta spec
declara explícitamente como *no-testeable-por-construcción* la no-acción ("no ejecuta el análisis") y
la no-degradación de severidad, ancladas por la señal declarada, no por un test de comportamiento.
Por eso la prueba de la garantía se hace por **contenido**:

- anclar la presencia del flag `GUARANTEE NOT SUSTAINED` y su severidad `CRITICAL` en
  `agents/reviewer.md`;
- anclar la declaración de `S1 ∧ S2` y la regla negativa ("sin `S1 ∧ S2` no ejecuta el análisis") en
  `agents/reviewer.md`;
- anclar la lectura más allá del diff y el reporte de contexto faltante;
- anclar la propagación (garantía + estado protegido) y el tratamiento como bloqueo en
  `agents/orchestrator.md`.

La propiedad de los casos formales es de `@tester`; el diseño no fija los casos exactos, solo la
naturaleza content-based. El comando real del repo es `node --test <archivo>` (no hay
typecheck/lint/format en este repo).

## Riesgos y supuestos

- **Falsos positivos de aplicabilidad** (`S1` sobre-dispara). Mitigación: exigir `S1 ∧ S2`; `S1` sola
  no habilita el análisis.
- **Costo en changes simples.** Mitigación: rama condicional dentro del review; sin `S1 ∧ S2` no hay
  lectura adicional. No se agrega stage.
- **El orquestador no reconoce el flag nuevo.** Mitigación: el flag es `CRITICAL` y el orquestador ya
  se detiene ante critical (`agents/orchestrator.md:97`); además se lo agrega explícitamente al
  destilado y a la salida esperada.
- **Contexto incompleto del reviewer.** Mitigación: SHALL reportar el contexto faltante en vez de
  asumir que la garantía se sostiene.
- **Confusión con `SPEC UPDATE RECOMMENDED`.** Mitigación: naturaleza distinta; `SPEC UPDATE
  RECOMMENDED` sigue limitado a `direct-implementation`; se documentan por separado.
- **Copia generada desactualizada** (`.opencode/agents/` derivada de `agents/`). Mitigación: la
  edición va en la fuente `agents/`; la copia local se refresca con `ancleto upgrade`/`install
  --project` (fuera del alcance de este change, que no toca el runtime). Riesgo de dogfooding tardío,
  no de corrección de la fuente.
- **Extracción de la garantía desde texto libre** (ver OPEN QUESTION). Es el riesgo principal no
  resuelto; se acota con `S1 ∧ S2`, pero un proposal que no enuncia la garantía de forma extraíble
  puede quedar sin analizar. Decisión diferida.

Supuestos:

- La garantía del proposal es extraíble de una afirmación explícita del texto, no inferida.
- Los content guards (que leen `agents/*.md`) son suficientes para anclar la superficie verificable;
  la no-acción y la no-degradación quedan marcadas como no-testeable-por-construcción en el delta
  spec.

## Nota sobre el contexto de origen

La delegación **no declaró un seed técnico**. Se confirmó el estado real de `agents/reviewer.md`,
`agents/orchestrator.md`, `test/content-guards.test.js` y `src/cli/index.js` (generación de
`.opencode/agents/`) leyendo esos archivos antes de escribir este diseño. Se cierra sin cambios el
delta spec aprobado.
