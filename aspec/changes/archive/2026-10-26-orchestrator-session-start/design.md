# Design: Intake de sesión, techo de lecturas acotado y recall accionable

## Context

Este design implementa el contrato ya aprobado en `proposal.md`, `specs/prompt-contracts/spec.md` y `specs/memory-engine/spec.md`. El proposal difirió explícitamente dos parámetros: (1) alcance de "5 por turno" y (2) agente receptor de la lectura delegada por encima del tope. Acá se resuelven sin ambigüedad, junto con el agente receptor de `git status --short`, que el spec dejó como "un agente con shell".

Restricciones de redacción ya fijadas por guards existentes, que condicionan el texto objetivo:

- `test/content-guards.test.js:722-739` exige que `## Repository Reading Limit` conserve `do NOT consume this ceiling` y que `### PROHIBITED ACTIONS` conserve `do not consume the ceiling`, con `## Project Memory Rules` y `## Machine Environment` presentes en ambos tramos.
- `test/memory-engine.test.js:536` fija el prefijo `Context truncated due to size limits. <n> rules omitted`; `:526`, `:552` y `:563` fijan `1 rules omitted`.

Superficies reales verificadas: `agents/orchestrator.md` es la fuente (406 líneas); `.opencode/agents/orchestrator.md` (413 líneas) es generado y sólo difiere por la sección de compresión del host. El registro real de agentes es `agents/*.md` (10 archivos, sin `general.md`).

## Decisions

### D1 — "5 por turno" = por mensaje del usuario

**Decisión:** un turno es **un mensaje del usuario**. El tope cuenta sólo los archivos que ese mensaje nombra explícitamente y se reinicia en el mensaje siguiente. Si un mensaje nombra 6 o más archivos, el orquestador lee directamente los **primeros cinco en el orden en que fueron nombrados** y delega las lecturas restantes a `@technical-discovery` en una sola delegación, declarando cuáles leyó y cuáles delegó. No hay conteo más allá del tope porque la lectura se detiene ahí.

**Justificación (ownership y costo):**

- El orquestador no tiene estado durable entre turnos más allá de su propio contexto. Un tope por mensaje es verificable desde el único mensaje que está respondiendo.
- Un conteo acumulado exigiría bookkeeping que el prompt no puede verificar: tendría que llevar la cuenta en prosa a través de turnos, y el presupuesto se degradaría en silencio hacia el final de la sesión sin un disparador observable.
- No colisiona con el techo de 3 archivos: los archivos nombrados están exentos de ese techo, así que ambos topes se evalúan por mensaje y no se acumulan entre sí.

**Regla testable (única):** los archivos que el usuario nombra no consumen el techo de tres; el sexto archivo nombrado en un mismo mensaje se delega en lugar de leerse; y no hay conteo más allá del tope porque la lectura se detiene ahí.

**Alternativa rechazada:** acumulado por sesión. Requiere estado que el prompt no tiene, no es auditable y degrada el presupuesto sin señal.

### D2 — Lectura por encima del tope → `@technical-discovery`

**Decisión:** tanto (a) la lectura de un archivo que el usuario nombró por ruta exacta y excede el tope, como (b) una pregunta de contexto de repositorio, se delegan a `@technical-discovery`.

**Registro real:** `@technical-discovery` es el único agente read-only cuyo ownership es la orientación de repositorio; tiene `read`, `grep` y `glob`, y su prompt ya permite abrir una ruta citada (`agents/technical-discovery.md:102-114`). El orquestador ya lo nombra como compuerta de lecturas por encima del techo (`:58`) y como dueño de la inspección read-only de estado (`:60`, `:82`).

**Por qué el mismo dueño en (a) y (b), sin que sea coincidencia:**

- (a) es la lectura de una ruta conocida que el tope prohíbe al orquestador: se delega porque el orquestador no puede ejecutarla, y el receptor debe ser read-only.
- (b) es una pregunta de contexto: se delega porque la orientación de repositorio es el trabajo de `@technical-discovery`.
- Ambos son "lecturas que el orquestador no hace por sí mismo", y el mismo agente es dueño de ambas por rol, no por conveniencia.

**Rechazos:**

- `@general`: no existe en `agents/`; es el fallback incorporado del host, sin ownership de repositorio y sin garantía read-only.
- `@coder`: implementador write-capable; delegarle una lectura mezcla orientación con implementación y arriesga ediciones no pedidas.
- `@reviewer`: read-only, pero es dueño del review de trabajo terminado, no de la orientación de intake.
- `@memory-keeper`: lee memoria, no archivos de repositorio; usaría al dueño equivocado.
- `@spec-writer`, `@documenter`, `@tester`, `@technical-seed-writer`: write-capable y de otros dominios.

### D3 — `git status --short` → `@technical-discovery`

**Registro real de agentes con shell:** `@coder`, `@tester`, `@documenter`, `@context-resolver`, `@technical-discovery`, `@technical-seed-writer`. Sólo `@technical-discovery` tiene ownership de estado read-only del repositorio (`agents/orchestrator.md:60`, `:82`), pero hoy su allowlist de bash deniega todo salvo `ancleto discovery --check` (`agents/technical-discovery.md:15-18`) y su prompt dice "Do not execute any other command" (`:75`).

**Decisión:** se delega a `@technical-discovery` y se agrega el enabler mínimo: la entrada de permiso `'git status --short': allow` y una cláusula de prompt que autoriza exactamente ese comando cuando la delegación pide estado del árbol. Es aditivo y read-only.

**Contrato de comando:**

- cwd: raíz del repositorio.
- Comando exacto: `git status --short` (sin flags adicionales, sin `--porcelain` redundante).
- Forma esperada: formato porcelain v1 corto, una línea `XY path` por entrada; salida vacía = árbol limpio.
- El resultado se devuelve verbatim, sin interpretación ni resumen.
- Disparador: "the request touches repo state" (rama, working tree, archivos sin commitear o untracked). Se ejecuta una vez por intake de sesión, no por turno.

**Rechazos:**

- `@coder`: agente de implementación, no inspector de estado; además escribe.
- `@tester`, `@documenter`, `@technical-seed-writer`: write-capable y de otros dominios.
- `@context-resolver`: dueño del grounding externo (Work Item) y su allowlist es sólo `az`.
- `@general`: no está en el registro del proyecto.

## Changes

### `agents/orchestrator.md` (fuente, 406 líneas)

**1. `## Repository Reading Limit` (`:52`-`:60`).** Se reemplazan `:54`-`:58` por un único párrafo que absorbe la exención y el "cuarto archivo". `:56` (exención proactiva) y `:60` (ownership de `@technical-discovery`) se conservan. Texto objetivo:

> The orchestrator MUST NEVER read more than **three repository files** to answer a user question or establish repository context that the user did not name. This is a ceiling, not a target. Do not work around the limit with broad searches, repository sweeps, or repeated delegations that reconstruct the repository from source files. Files the user names explicitly in a message are exempt from this ceiling, up to **five named files per user message**: a turn is one user message, the cap counts only the files named in that message and resets on the next one, and named files never consume the three-file ceiling. A file counts as named only when the user asks the orchestrator to read it or names it as the target of the task; a file merely mentioned in passing is not named. When a message names more than five files, read the first five in the order named and delegate the remaining reads to `@technical-discovery` instead of reading them directly — no counting is required past the cap because reading stops there. Before reading a fourth un-directed repository file, delegate the focused question to `@technical-discovery`; a named file past the five-file cap is delegated the same way.

**2. `### PROHIBITED ACTIONS` (`:90`).** Se reescribe el bullet absoluto para reconciliarlo. Texto objetivo:

> - **NEVER** read a fourth un-directed repository file to answer a repository-context question; use the Technical Discovery gate instead. Files the user names explicitly are exempt up to five per user message, and a sixth named file is delegated, not read. The proactive `## Project Memory Rules` and `## Machine Environment` reads do not consume the ceiling

**3. Nueva sección `## Session Intake`.** Se inserta entre `### MANDATORY STOPS` (`:100`) y `## Active Change Check` (`:102`). Texto objetivo:

> ## Session Intake
>
> This intake reads session state, not repository context: it does not contradict Lazy Repository Context Routing and it never loads source files. It runs once at the start of a session, before any Work Item is fetched.
>
> 1. **Active changes** — list the entries of `aspec/changes/` excluding `archive/` once, and compare them by name only. Do not resolve a Work Item id to a change here: the Active Change Check owns that match and consumes this list instead of listing the directory again.
> 2. **Repository tree** — when the request touches repository state (branch, working tree, uncommitted or untracked files), delegate exactly one `git status --short` to `@technical-discovery` and use its output as-is. The orchestrator has no shell and never runs it directly.
> 3. **Report only differences** — report an active change only when it differs from the requested change; when the request is new work with no matching change, every active change is foreign. When the tree is clean and no active change is foreign, emit nothing and continue with the request; in that case the intake adds no further delegation.
>
> Never fetch a Work Item in this step.

**4. `## Active Change Check` (`:104`).** Una línea: reemplazar "Then check `aspec/changes/` for an **active (unarchived) change**" por "Then match the active-change list produced by Session Intake for an **active (unarchived) change**". Evita una segunda lectura del directorio y una segunda comparación.

**5. `## Team Memory`, bullet Recall (`:172`).** Se agrega el disparador de overflow, sin tocar la prohibición de `searchMemory` de `:170`. Texto objetivo (fragmento):

> ... Delegate one Recall only when the user explicitly asks about prior experience, when cross-cutting or high-risk work could materially benefit from precedent, when the working context contains a `<ContextOverflowWarning>`, or when current evidence exposes a non-obvious failure, constraint, or workaround that code and specifications do not explain. A `<ContextOverflowWarning>` is an immediate trigger: delegate exactly one Recall to `@memory-keeper` with the task topic before delegating any other stage, and never repeat it for the same warning. ...

**Orden respecto de `## Lazy Repository Context Routing` (`:41`):** Session Intake va después, porque Lazy Routing gobierna la carga de contexto de repositorio bajo demanda y el intake es estado de sesión (un listado de directorio y, a lo sumo, un `git status` delegado). Va antes de `## Active Change Check` porque produce el listado que ese check consume, y antes de `## Intake — Work Item Context` (`:118`), el único lugar que hace fetch de un Work Item: así el intake no puede re-disparar ese fetch ni duplicar el match.

### `src/core/memory/engine.js`

**`:144`.** Reemplazo del literal, en una sola línea, conservando el tag y la interpolación:

```js
block += `\n<ContextOverflowWarning>Context truncated due to size limits. ${omitted} rules omitted. Delegate one Recall to @memory-keeper with the task topic before delegating any other stage.</ContextOverflowWarning>`
```

Conserva el prefijo `Context truncated due to size limits.` y `${omitted} rules omitted` a propósito: `test/memory-engine.test.js:536` y `:526`/`:552`/`:563` dependen de ellos. No menciona `searchMemory`.

**`:145`.** No cambia: el `console.warn` con el conteo en español sigue igual (spec `memory-engine`, escenario "El resto del aviso no cambia").

### `agents/technical-discovery.md`

Enabler mínimo de D3 (aditivo, read-only):

- `:15-18`, allowlist de bash: agregar `'git status --short': allow` bajo `'*': deny`.
- `:75`, junto a "Do not execute any other command.": agregar "The single exception is a delegated repository-tree state request: run exactly `git status --short` once from the repository root, return its output unchanged, and never run it on your own initiative."

### `.opencode/agents/orchestrator.md` (generado)

Se regenera con el mecanismo existente (`ancleto upgrade`, o `ancleto install`), nunca a mano. La sección `## Compresión de contexto (tool del host)` la agrega el CLI (`CAVEMAN_USAGE_NOTE`, `src/cli/index.js:1049-1062`) cuando la config MCP del host incluye la compresión; sobrevive la regeneración mientras `.opencode/opencode.json` siga declarando ese MCP. Verificar su presencia después de regenerar.

### `.ancleto/working-context.md` (derivado)

Contiene el texto viejo en `:36`. No se edita a mano. Para dogfooding: `ancleto upgrade` (punto de lifecycle que lo materializa) o `ancleto memory context --out .ancleto/working-context.md`, y luego reiniciar la sesión para que el orquestador lo relea. El archive no edita este archivo.

## Verification

Comandos declarados (`PRODUCT.md` → `## Project Commands`):

- Lint: `npm run lint`
- Tests: `npm test`, o acotado `node --test test/content-guards.test.js test/memory-engine.test.js`
- Format: `not-configured`
- Typecheck: no aplica (JavaScript sin `tsconfig.json`)

**Assertion existente sobre el literal viejo (crítica):** `test/memory-engine.test.js:536` — `/Context truncated due to size limits\. (\d+) rules omitted/`. También `:526`, `:552`, `:563` — `/1 rules omitted/`. Se mantienen verdes porque el nuevo literal conserva prefijo y conteo. Ningún test existente afirma la cláusula `searchMemory` del aviso. `test/content-guards.test.js:722-739` debe seguir verde: el nuevo párrafo conserva sus literales.

**Tests nuevos:**

- `test/memory-engine.test.js`, junto a `:530` (cláusula d, ejecutable): el aviso generado contiene `@memory-keeper` y `Recall`, no matchea `/searchMemory/`, y sigue matcheando el conteo de reglas omitidas.
- `test/content-guards.test.js` (hogar establecido):
  - (a) reconciliación del techo: `## Repository Reading Limit` contiene la exención de archivos nombrados, el tope de cinco por mensaje, la delegación por encima del tope y la cota de "merely mentioned"; `### PROHIBITED ACTIONS` contiene "un-directed" y ya no contiene el absoluto `NEVER read a fourth repository file to answer a repository-context question`; los literales del guard `722-739` siguen presentes.
  - (b) tope: el mismo tramo afirma "five named files per user message" y la delegación del sexto; el conteo en runtime queda `no-testeable-por-construcción`.
  - (c) intake: existe `## Session Intake` antes de `## Active Change Check`; contiene `git status --short`, `@technical-discovery` y la condición de silencio (árbol limpio + sin change ajeno → no reporte); la no-acción real queda `no-testeable-por-construcción`.
  - (d) contrato del orquestador: `## Team Memory` menciona `<ContextOverflowWarning>`, un único Recall y `@memory-keeper`.
  - Enabler D3: `agents/technical-discovery.md` incluye `'git status --short'` en la allowlist y la cláusula de comando único.

**Sin guard (no-testeable-por-construcción):** el conteo real de 5 archivos por mensaje; la ausencia efectiva de reporte cuando el árbol está limpio; la unicidad de la delegación de Recall por warning; y la ausencia de texto contradictorio (se ancla con content guard, no es comportamiento ejecutable).

## Guarantee Mapping

| Cláusula | Artefacto que la sostiene | Test / guard |
| --- | --- | --- |
| (a) Ningún texto absoluto contradice la exención | `agents/orchestrator.md` §Repository Reading Limit (`:54`-`:58` fusionados) y `:90` reescrito | Content guard nuevo, `test/content-guards.test.js:791-794`: fija la sentencia del techo **con su calificador** "that the user did not name" (sobre el tramo normalizado y desnegreado), más "un-directed" y la ausencia del absoluto viejo; `test/content-guards.test.js:722-739` sigue verde |
| (b) El tope de 5 impide lecturas ilimitadas | `agents/orchestrator.md` §Repository Reading Limit: tope por mensaje y delegación del sexto | Content guard nuevo, `test/content-guards.test.js:817-819`: fija **ambos** anclas de no-acumulación — "the cap counts only the files named in that message and resets on the next one" y "no counting is required past the cap" — además de "five named files per user message" + delegación; conteo real no-testeable-por-construcción |
| (c) El intake no agrega costo sin nada que reportar | `agents/orchestrator.md` `## Session Intake`, condición de silencio y git condicional | Content guard nuevo: condición de silencio + `git status --short` a `@technical-discovery`; silencio real no-testeable-por-construcción |
| (d) El aviso sólo nombra capacidades reales | `src/core/memory/engine.js:144` y `agents/orchestrator.md:178`, ambos incondicionales | Test ejecutable en `test/memory-engine.test.js`: `@memory-keeper` presente, `searchMemory` ausente, conteo conservado; el aviso y `:178` coinciden en disparar el Recall sin condición (las superficies mergeadas siguen fuera de alcance) |

Nota sobre (a) y (b): ambos guards acotan la búsqueda al tramo de `## Repository Reading Limit` mediante el slicer `section()` (`test/content-guards.test.js:767`, que corta en `## Technical Seed Result`) y las mismas helpers de normalización (`normalize` en `:764`, `deBold` en `:765`); se validaron por mutación en una copia descartable — quitar el calificador rompe (a), y quitar cualquiera de las dos frases de no-acumulación rompe (b) — que es la razón por la que no son tautológicos.

## Risks

- **Loophole de la exención:** "the user named it" aplicado a archivos apenas mencionados al pasar. Mitigación en el texto: "A file counts as named only when the user asks the orchestrator to read it or names it as the target of the task; a file merely mentioned in passing is not named", y el content guard fija esa cota.
- **El intake como costo obligatorio en cada turno:** mitigación: corre una vez por sesión, el `git status` se delega sólo si el pedido toca el estado del repo, y el listado es el mismo que consume Active Change Check (sin segunda lectura). No se re-ejecuta por turno.
- **Ampliación de superficie en `agents/technical-discovery.md`:** es un enabler mínimo y aditivo; el riesgo de ampliar un agente read-only se acota con la allowlist de string exacto (`git status --short`) y la cláusula "exactly once, read-only". Debe reflejarse en `tasks.md` cuando se genere.
- **Drift del mirror:** se regenera, nunca se edita a mano; la nota de compresión del host sobrevive por la compuerta del CLI.
- **`working-context.md` desactualizado:** exige `ancleto upgrade` + reinicio de sesión antes del dogfooding; el archive no lo edita.

## Out of Scope

- Backlog ítem 12 (`BACKLOG.md:309`): orden y presupuesto del working-context.
- Backlog ítem 13 (`BACKLOG.md:311`): duplicados/stale y consolidación de memoria.
- Backlog ítem 1 (`BACKLOG.md:282`): contrato de capacidades y ownership de subagentes.
- `aspec/changes/ancleto-vscode-extension/`: change ajeno, parkeado, 0/21 tareas; no se toca ni se archiva.
- `tasks.md` de este change: no se genera en esta etapa.
- Guía residual de `searchMemory` en las superficies mergeadas: diferida a su propio change, registrada en `BACKLOG.md` ítem 17 (`BACKLOG.md:319`); este design no toca `AGENTS.md`, `PRODUCT.md` ni `templates/`.
