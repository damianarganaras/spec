# Tasks: MEM-03 — promoción de decisiones, backfill de las 5 únicas y refs obligatorias

> Validaciones declaradas: `npm run lint` y `npm test` (`PRODUCT.md` → `## Project Commands`).
> Format: `not-configured`. Typecheck: no aplica (JavaScript sin `tsconfig.json`).

## Fase 0 — Baseline

- [x] 0.1 Registrar el baseline con el comando declarado: `npm test` (verde) y `npm run lint` (verde).
      Si el baseline no está verde, registrar el rojo preexistente y no atribuirlo a este change.

## Fase 1 — Tests primero (rojo)

- [x] 1.1 En `test/memory-engine.test.js`, agregar el caso de refs fail-closed: `decision` sin
      `spec:`/`change:` escrita por `mcp:ancleto-memory` ⇒ `recordNode` lanza y el mensaje nombra la
      `memory_key` y la regla violada; `rule` sin `path:`/`spec:`/`change:`/anclaje a test ⇒ rechazo.
- [x] 1.2 Agregar el caso de refs inválidas: `path:` absoluto o con `../`, y prefijo de ref
      desconocido ⇒ rechazo (nunca ignoradas).
- [x] 1.3 Agregar el caso de contenido sin bloque `refs:` y de bloque `refs:` vacío ⇒ rechazo con la
      `memory_key` en el mensaje.
- [x] 1.4 Agregar T09: `change:<slug>` de un change archivado (`aspec/changes/archive/YYYY-MM-DD-<slug>`
      en una fixture temporal) resuelve; 0 coincidencias y 2 coincidencias ⇒ rechazo por not-found y
      por ambigüedad, sin elegir.
- [x] 1.5 Agregar T29: dos `### Requirement:` que canonicalizan al mismo heading ⇒ rechazo por
      ambigüedad; heading exacto ⇒ resuelve; capability inexistente ⇒ rechazo.
- [x] 1.6 Agregar T23: `content` con `Authorization: Bearer …` y `justification` con `API_TOKEN=…`
      ⇒ rechazo, 0 nodos escritos, mensaje con la `memory_key` y sin el valor detectado.
- [x] 1.7 Agregar T05: una `decision` con refs resolubles escrita por superficie de captura queda
      activa, su `content` contiene el bloque `refs:` parseable y `sqlite_master` no gana objetos.
- [x] 1.8 Agregar T06 (parte determinística): una decisión en forma de una línea, sin `memory_key`,
      no produce nodo; el motor rechaza la escritura sin clave.
- [x] 1.9 Agregar T21 (parte determinística): dos escrituras con la misma `memory_key` y contenido
      distinto dejan una sola activa y conservan ambas en el historial.
- [x] 1.10 Agregar los casos de no regresión: `importNodes` con entradas sin refs mantiene el LWW;
      una escritura con procedencia `runtime` sin refs sigue aceptada; los `inputSchema` de las tools
      MCP siguen sin `source`/`confidence`/`status`/`id` y sin campos de refs.
- [x] 1.11 Verificar el rojo real de 1.1 a 1.10 con
      `node --test test/memory-engine.test.js` y registrar la causa de cada fallo.

## Fase 2 — Engine (`src/core/memory/engine.js`)

- [x] 2.1 Implementar el parser del bloque `refs:` dentro de `content` con la gramática cerrada
      (`spec:`, `change:`, `path:`, `commit:`, `workitem:`) y el rechazo de líneas inválidas.
- [x] 2.2 Implementar la validación fail-closed en `recordNode`, antes de abrir la transacción, como
      exención explícita e inversa: se valida toda escritura salvo `context.source === 'runtime'`;
      `cli:import` no pasa por `recordNode` y conserva su LWW. La superficie real de producción es
      `mcp:ancleto-memory`; cualquier otro `source` (p. ej. `agent:<rol>`) se valida. Mensajes que
      nombran `memory_key` y regla.
- [x] 2.3 Implementar la derivación de raíz (`context.projectRoot` y, si falta, `.ancletorc` hacia
      arriba desde la `memory.db`) sin usar `process.cwd()` y sin crear un ciclo de imports.
- [x] 2.4 Implementar el resolutor de `change:` (activo y `archive/YYYY-MM-DD-<slug>`, unicidad) y el
      de `spec:` (path + heading exacto/canónico, ambigüedad reportada); `path:` normalizado y
      existente.
- [x] 2.5 Implementar el rechazo incondicional de secretos en `content` y `justification`, sin eco del
      valor en el mensaje.
- [x] 2.6 Confirmar que `importNodes` no cambia y que no se agrega tabla ni columna nueva.
- [x] 2.7 En el render de `<ProjectMemoryRules>`, mostrar sólo la prosa de la regla, sin el bloque
      `refs:` (el `content` almacenado queda intacto; `export`/`list`/`searchMemory`/MCP no cambian;
      orden, filtro, tope y warning de truncamiento sin cambios). Verificado con
      `node --test test/memory-engine.test.js` (101/101).

## Fase 3 — Superficies de prompt

- [x] 3.1 En `agents/memory-keeper.md`, agregar el modo Promotion: preflight del lote, una llamada por
      decisión aprobada, `content` de 1–3 oraciones + bloque `refs:`, prohibición de inventar
      `memory_key`, rechazo de secretos y de candidatos de sesión, y regla de contradicción (reportar
      ambas claves con fuentes, no elegir).
- [x] 3.2 En `skills/ancleto-archive/SKILL.md`, reemplazar el paso de captura por el gate de promoción:
      candidato = `memory_key` propia + `Estado: aprobado`; forma de una línea no promovible; sólo
      `decision`; preflight del lote; cero candidatos ⇒ cero escrituras y cero delegación; fallo ⇒
      "archivado, memoria pendiente" con clave y motivo. Referenciar el shape de `## Decisiones` en
      `agents/spec-writer.md` sin re-enunciarlo.
- [x] 3.3 En `skills/ancleto-bulk-archive/SKILL.md`, aplicar el mismo gate por change y agregar el
      caso de lote sin candidatos (cero delegaciones).
- [x] 3.4 En `skills/ancleto-verify/SKILL.md`, quitar la promoción de decisiones del change: registrar
      sólo hallazgos durables no-decisión, con refs, y declarar que `## Decisiones` se promueve en el
      archive.
- [x] 3.5 Verificar que ninguna de las cuatro superficies re-enuncia el shape de `## Decisiones` ni
      fija redacción literal nueva (D-B).
- [x] 3.6 En `agents/orchestrator.md`, la pasada de promoción corre después del merge de specs de
      `@documenter` y nunca en paralelo; sin sync de specs igual corre y una `spec:` no resoluble se
      rechaza por fail-closed. Verificado con `node --test test/content-guards.test.js` (104/104) y
      `node src/cli/index.js upgrade` para regenerar mirrors.

## Fase 4 — Backfill de las cinco decisiones

- [x] 4.1 Verificar en `proposal.md` que las cinco decisiones históricas están completas
      (Elección / Descartado / Justificación / Refs), con su evidencia `file:line` del `design.md` de
      origen, y que el gap de la decisión 1 queda declarado.
- [x] 4.2 Verificar que cada `Refs` de las cinco resuelve: `change:<slug>` al archive histórico y cada
      `path:` a un archivo existente.
- [x] 4.3 Al archivar este change, promover las decisiones con `Estado: aprobado` por el gate de 3.2 y
      comprobar con `searchMemory` que cada una de las cinco se recupera y que sus refs resuelven.

## Fase 5 — Ajuste de fixtures y validación

- [x] 5.1 Actualizar los fixtures que caen bajo la validación fail-closed (**dos expansiones de
      superficie requeridas** declaradas en el proposal):
      - `test/mcp.test.js`: las dos escrituras MCP (`prov-mcp`, `prov-forge`) declaran refs resolubles
        en su fixture temporal.
      - `test/working-context.test.js`: sus ~10 escrituras con `{ source: 'test' }` quedan dentro de la
        exención (`source: 'runtime'`) o declaran refs resolubles, según lo que cada test esté
        asertando sobre la procedencia; no se cambia la semántica del test.
- [x] 5.2 Ejecutar `node --test test/memory-engine.test.js` y confirmar T05, T06, T09, T21, T23 y T29
      en verde.
- [x] 5.3 Ejecutar `npm test` (comando declarado) y confirmar la suite completa en verde.
- [x] 5.4 Ejecutar `npm run lint` (comando declarado).
- [x] 5.5 Registrar `Format: not-configured` (no hay formatter declarado) y typecheck no aplica.
- [x] 5.6 Verificar que `sqlite_master` no incorpora `memory_refs` y que `.opencode/**` no se editó a
      mano.
