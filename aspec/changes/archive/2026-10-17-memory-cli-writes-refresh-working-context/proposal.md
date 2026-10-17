# Proposal: Refrescar el working-context en todas las escrituras de memoria

## Problem

El invariante "memoria activa → `.ancleto/working-context.md`" hoy **solo se sostiene para
escrituras MCP**. La regeneración del bloque `<ProjectMemoryRules>` se dispara desde
`createMemoryToolHandlers` (`src/core/memory/tools.js:68-74`), que es el único punto con
refresh-on-write. Los demás caminos de escritura del CLI (`ancleto memory import`) persisten
nodos en `.ancleto/memory.db` pero **no regeneran el artefacto derivado**
(`src/cli/index.js:2291-2317`, `memoryImport` llama directo a `engine.importNodes(json)`).

Consecuencia observable: un usuario que da de alta reglas con la CLI (su camino "sin agente")
las ve persistidas y recuperables con `searchMemory`, pero **no se inyectan** en la sesión
siguiente hasta que corra un lifecycle point (`init`, `install --project`, `upgrade`) o
`ancleto memory context --out`. Como esos puntos rara vez se vuelven a correr, la regla queda
"guardada pero nunca usada": el síntoma reportado.

Agravantes:

- El failure mode es **silencioso**: nada avisa que `working-context.md` está desactualizado
  respecto de `memory.db`.
- El spec vigente acota el requisito a escrituras MCP (capability `memory-engine`,
  "Frescura del working-context tras escrituras MCP"), de modo que la CLI queda fuera del
  contrato por diseño, no por olvido casual.
- El change archivado `aspec/changes/archive/2026-09-25-working-context-refresh-on-memory-write/`
  fijó el mecanismo (refresh-on-write filtrado) pero lo cableó solo en `tools.js`.

## Proposed change

1. **Extender el refresh-on-write a todas las superficies de escritura.** Tras una operación
   del CLI que modifica nodos activos (`ancleto memory import`), regenerar
   `.ancleto/working-context.md` por el **mismo camino único de render**
   (`refreshWorkingContext` / `renderWorkingContextBlock`), reusando la conexión abierta.
2. **Hacer visible el staleness.** Que el CLI pueda reportar que el working-context está
   ausente o desactualizado respecto de las reglas activas, para que este failure mode deje de
   ser silencioso (superficie a definir en `design.md`; candidato: chequeo en
   `ancleto memory doctor`).
3. **Alinear el contrato.** Agregar el requisito de frescura para las escrituras de la CLI
   (compañero del vigente, acotado a MCP) y actualizar la documentación que hoy enumera solo los
   puntos de regeneración (`README.md`, `agents/orchestrator.md`, seed técnico).

## Scope

**In scope**

- Refresh del working-context disparado por `ancleto memory import` (y cualquier otra escritura
  CLI que altere el bloque) reusando el render existente.
- Señal de staleness/ausencia del working-context expuesta por el CLI.
- Delta de specs + alineación de documentación afectada.

**Out of scope**

- Cambiar la semántica de `searchMemory`, el schema de la DB o la supersesión por `memory_key`.
- Nuevos subcomandos de escritura de memoria (no se agrega `memory add`/`record`).
- Cambiar el contrato del orquestador (sigue leyendo el archivo como datos no confiables y sin
  generar nada por su cuenta).
- La frontera repo/agente (engram) y la procedencia `source` (ya resueltas).

## Risks

- **Doble refresh / redundancia con lifecycle points:** `init`/`install`/`upgrade` ya refrescan;
  agregar refresh en `import` es aditivo y no cambia esos caminos. Mitigación: reusar
  `refreshWorkingContext` como único punto de render y mantener idempotencia.
- **`import` que no toca el bloque (solo `decision`, o `rule` no-project):** un refresh
  innecesario reescribe el archivo. Mitigación: el over-refresh ya es aceptado para MCP
  (el consumidor lee una vez por sesión); reevaluar con el mismo criterio y, si se quiere,
  gatillar solo cuando `inserted + updated > 0`.
- **Regresión en tests de aislamiento del motor:** `import` hoy cierra el engine sin efectos de
  filesystem. Mitigación: cubrir con test que el archivo se regenera y que un import inválido
  no lo altera.
- **Staleness check con falsos positivos:** comparar contenido renderizado vs archivo puede
  marcar stale por diferencias triviales (orden, saltos). Mitigación: definir la comparación en
  `design.md` con una normalización acotada.
