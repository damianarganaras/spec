# Proposal: Intake de sesión, techo de lecturas acotado y recall accionable en el orquestador

## Problem

Tres defectos verificados en el arranque de sesión del orquestador.

**1. El aviso de overflow no es accionable.** `src/core/memory/engine.js:144` emite:

```js
block += `\n<ContextOverflowWarning>Context truncated due to size limits. ${omitted} rules omitted. Use the 'searchMemory' tool to query historical architectural decisions if you lack specific context.</ContextOverflowWarning>`
```

El aviso ordena usar `searchMemory`, una tool que el orquestador no tiene y que tiene prohibido llamar (`agents/orchestrator.md:170`). Salida real de overflow (DB temporal fuera del repo, 40 reglas importadas, exit 0):

```
ancleto: 26 reglas omitidas por limite de tamano (scope "project")
<ProjectMemoryRules>
<ContextOverflowWarning>Context truncated due to size limits. 26 rules omitted. Use the 'searchMemory' tool to query historical architectural decisions if you lack specific context.</ContextOverflowWarning>
</ProjectMemoryRules>
```

Ocurrencia viva en este repo — `.ancleto/working-context.md:36`:

```
<ContextOverflowWarning>Context truncated due to size limits. 2 rules omitted. Use the 'searchMemory' tool to query historical architectural decisions if you lack specific context.</ContextOverflowWarning>
```

Presupuesto que produce el recorte: `MAX_TOKENS = 2000` (`engine.js:9`), `CHARS_PER_TOKEN = 4` (`:8`), `maxChars = Number(maxTokens) * CHARS_PER_TOKEN` (`:131`), `omitted = rows.length - includedCount` (`:142`); el aviso también se registra por consola en `:145`. Grounding en backlog: ítem 2 (`BACKLOG.md:284`).

**2. El techo de lecturas es absoluto y contradice una instrucción explícita del usuario.** Texto vigente en `agents/orchestrator.md`:

- `:54` — "The orchestrator MUST NEVER read more than **three repository files** to answer a user question or establish repository context. This is a ceiling, not a target. Do not work around the limit with broad searches, repository sweeps, or repeated delegations that reconstruct the repository from source files."
- `:58` — "Before reading a fourth repository file, delegate the focused question to `@technical-discovery`."
- `:90` — "**NEVER** read a fourth repository file to answer a repository-context question; use the Technical Discovery gate instead. The proactive `## Project Memory Rules` and `## Machine Environment` reads do not consume the ceiling"

Hoy sólo están exentas las lecturas proactivas (`:56`), y ningún archivo nombrado por el usuario queda exento. Grounding en backlog: ítem 8 (`BACKLOG.md:296`).

**3. El intake no detecta trabajo ajeno.** El "Active Change Check" (`agents/orchestrator.md:102-114`) sólo mira `aspec/changes/`; no hay paso de estado del árbol ni de changes activos ajenos. Grounding en backlog: ítem 5 (`BACKLOG.md:290`).

## Proposed change

Tres piezas en el arranque de sesión, todas normativas en el prompt del orquestador salvo el texto del aviso:

- **R1 — Intake.** Al iniciar: detectar changes activos en `aspec/changes/` excluyendo `archive/` y reportarlos sólo si alguno difiere del solicitado; delegar `git status --short` a un agente con shell cuando el pedido toca el estado del repo (el orquestador no tiene shell). Si el árbol está limpio y no hay changes ajenos, no se emite salida.
- **R2 — Techo de lecturas.** Sumar a la exención de lecturas proactivas la de archivos que el usuario nombra explícitamente, con tope de 5 por turno; por encima del tope la lectura se delega. La exención vive dentro del mismo párrafo del techo y neutraliza el texto absoluto de `:54`, `:58` y `:90`.
- **R3 — Overflow.** Ante `<ContextOverflowWarning>`, el orquestador delega UN Recall a `@memory-keeper` con el topic de la tarea antes de delegar el resto. El aviso en `src/core/memory/engine.js` deja de apuntar a `searchMemory` y apunta a esa delegación.

Superficies tocadas: `agents/orchestrator.md` (fuente), `src/core/memory/engine.js` (texto del aviso), `agents/technical-discovery.md` (enabler read-only de `git status --short`) y los mirrors generados `.opencode/agents/orchestrator.md` y `.opencode/agents/technical-discovery.md`, que se regeneran y nunca se editan a mano.

## Scope

### In

- `agents/orchestrator.md`: intake de sesión, techo de lecturas y delegación de Recall ante overflow.
- `src/core/memory/engine.js`: una línea de texto del `<ContextOverflowWarning>`.
- `agents/technical-discovery.md`: recibe `'git status --short': allow` porque ya es dueño del estado read-only del repositorio (`agents/orchestrator.md:60`, `:82`) y sumar un literal read-only a un rol con `'*': deny` otorga estrictamente menos privilegio que enrutar el mismo comando a un agente con `'*': allow`.
- Regeneración de los mirrors `.opencode/agents/orchestrator.md` y `.opencode/agents/technical-discovery.md` por el mecanismo existente.

### Out

- Backlog ítem 12 (`BACKLOG.md:309`): orden y presupuesto del working-context.
- Backlog ítem 13 (`BACKLOG.md:311`): duplicados/stale y consolidación de memoria.
- Backlog ítem 1 (`BACKLOG.md:282`): contrato de capacidades y ownership de subagentes.
- `aspec/changes/ancleto-vscode-extension/` (change ajeno, parkeado, 0/21 tareas): no se toca ni se archiva.
- `design.md` y `tasks.md` de este change: no se generan en esta etapa.
- Guía residual de `searchMemory` en las superficies mergeadas (`AGENTS.md`, `templates/AGENTS.md`, `PRODUCT.md`, `templates/PRODUCT.md`): diferida a su propio change, registrada en `BACKLOG.md` ítem 17 (`BACKLOG.md:319`). Des-hardcodear ese contrato sobre superficies mergeadas exige un bloque `LOCKED` y reconciliar el texto plano legacy en toda ruta que mergea `TEMPLATES` (`src/cli/index.js`), así que no entra acá.

Nota de bookkeeping: `BACKLOG.md` recibió el ítem 17 durante este change (3 inserciones / 1 borrado, un solo hunk); ese diff es el registro de la deferral, no scope de implementación.

## Guarantee

- (a) La exención del techo no queda contradicha por ningún texto absoluto remanente en `agents/orchestrator.md`.
- (b) El tope de 5 impide lecturas ilimitadas de archivos nombrados por el usuario.
- (c) El intake no agrega costo cuando no hay nada que reportar, y su único enabler —`'git status --short': allow` en `agents/technical-discovery.md`— no amplía la superficie de escritura: la allowlist sigue denegando `'*'`.
- (d) El texto del aviso sólo menciona capacidades que el orquestador realmente tiene.

## Risks

- Queda texto absoluto remanente en otra parte de `agents/orchestrator.md` que reintroduce el techo rígido: se revisan todas las apariciones del techo y se ancla con un content guard de comportamiento.
- El mirror `.opencode/agents/orchestrator.md` diverge de la fuente: se regenera, nunca se edita a mano.
- El cambio del aviso rompe un guard existente que fija su literal: el guard se actualiza en el mismo change y pasa a asertar comportamiento.
- Los parámetros diferidos (alcance del "turno" y agente receptor de la lectura delegada) se resuelven mal en implementación: quedan explícitamente diferidos a `design.md` y no se norman en el spec.

## Constraints

- No se escribe en `.ancleto/memory.db`.
- Los commits y el merge a `development` pertenecen a un agente con git; no hay push sin autorización explícita del usuario.
- El archive exige `ancleto upgrade` + reinicio de sesión antes del dogfooding.
