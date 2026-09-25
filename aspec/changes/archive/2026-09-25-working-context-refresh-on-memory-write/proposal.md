# Proposal: Refrescar el working-context tras escrituras de memoria por MCP

## Problema

El contexto inyectado que arma el orquestador vive en `.ancleto/working-context.md`
(bloque `<ProjectMemoryRules>`). Hoy ese archivo solo se regenera en puntos de ciclo de vida
y de forma manual:

- `ancleto init` → `refreshWorkingContext` (`src/cli/index.js:1087`)
- `ancleto install --project` → `refreshWorkingContext` (`src/cli/index.js:932`)
- `ancleto upgrade` → `refreshWorkingContext` (`src/cli/index.js:996`)
- manualmente con `ancleto memory context --out` (`src/cli/index.js:1434`)

Ninguna tool MCP lo invoca. `createMemoryToolHandlers` (`src/core/memory/tools.js:64-70`)
solo llama a `engine.recordNode` (`src/core/memory/engine.js:156`), que escribe
`.ancleto/memory.db`; `serveMemoryMcp` (`src/core/memory/mcp-server.js:64`) nunca llama a
`refreshWorkingContext`. Consecuencia: tras grabar una regla o decisión por MCP, el
working-context queda desactualizado de inmediato hasta el próximo lifecycle point o un
comando manual.

La propia doc lo reconoce: `README.md:338` dice que el archivo "se regenera solo en `init`,
`install --project` y `upgrade`". El recall del repo lo registra como gap pendiente (G1), **no**
como diseño deliberado: no existe decisión registrada de excluir el refresh.

## Cambio propuesto

Garantizar que el working-context refleje la memoria activa vigente sin exigir un lifecycle
point ni un comando manual. La garantía es observable: tras cualquier escritura MCP que altere
el conjunto de nodos activos de scope `project` (incluida la supersesión de una `memory_key`
existente), una lectura posterior del working-context muestra ese cambio.

El **mecanismo queda decidido** como **Opción 1 — supraconjunto conservador**: el refresh del
working-context se dispara como parte de la escritura MCP cuando se cumple
`(rule + scope project)` **o** `superseded > 0`, evaluado sobre el resultado de `recordNode`. El
over-refresh que esa condición puede producir es **consecuencia intencional** de la forma actual
del engine, **no** un bug pendiente. La **Opción 2** —exponer el nodo superseded para un refresh
selectivo— queda **diferida** como mejora futura. El detalle vive en `design.md`.

Los lifecycle points actuales (`init`, `install --project`, `upgrade`,
`ancleto memory context --out`) siguen siendo válidos, pero dejan de ser los únicos.

## Alcance

In scope:

- Garantía de frescura del working-context tras escrituras MCP (`recordRule`/`recordDecision`)
  que cambian nodos activos de scope `project`.
- Robustez observable del refresh: la escritura MCP persiste y devuelve el nodo registrado
  aunque falle el refresh; el refresh es idempotente y no corrompe `memory.db` ni provoca
  recursión/deadlock.

Out of scope (no-goals):

- No cambia la semántica de `init`/`install --project`/`upgrade`/`memory context --out`.
- No cambia la ubicación ni el formato de `.ancleto/working-context.md` salvo que sea
  imprescindible.
- No modifica la forma del resultado de `recordNode` ni expone el nodo superseded: la Opción 2
  (refresh selectivo) queda fuera de alcance, diferida como mejora futura.
- No cambia **qué** nodos se inyectan: eso pertenece al change hermano
  `clarify-project-memory-rules-decisions`.

## Decisión de mecanismo (adoptada)

- **Opción 1 — supraconjunto conservador.** El refresh del working-context se dispara en la
  escritura MCP cuando `(rule + scope project)` **o** `superseded > 0`, evaluado sobre el
  resultado de `recordNode`. El over-refresh resultante es **intencional** por la forma actual del
  engine, no un defecto pendiente.
- **Opción 2 — refresh selectivo exponiendo el nodo superseded** (diferida): queda como mejora
  futura, fuera del alcance de este change.
- **render-on-demand al leer**: descartada (depende de un hook de arranque fuera del repo).

## Riesgos

- Escritura MCP más lenta por el refresh: mitigar con idempotencia y refresh best-effort que
  no bloquee la respuesta de la tool.
- Concurrencia al reabrir `memory.db` desde el proceso MCP con el engine ya abierto: riesgo de
  bloqueo o corrupción; la requirement exige explícitamente no-corrupción y no-deadlock.
- Superficie de producto instalable: `refreshWorkingContext` vive hoy en `src/cli/index.js`
  (interno). Llevarlo a `src/core/memory/` afecta el contrato del motor; el diseño debe
  justificar dónde vive el invariante.

## Rationale de la separación (dos changes)

Este caso y su hermano difieren en: layer (write path vs read/render path), root cause (nadie
refresca el archivo vs filtro `type = 'rule'`), acceptance/verificación y eje de decisión/riesgo.
Son aprobables, verificables y reversibles por separado y no duplican guardas. Comparten la
capability `memory-engine` (contexto inyectado) como cambios hermanos.

## Nota sobre el contexto de origen

Contexto producido con un seed técnico validado del repo (v0.6.37); se confirmó el
comportamiento real en código y doc con `file:line` antes de escribir esta spec.
