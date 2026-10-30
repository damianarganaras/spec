# Design: MEM-03 — refs fail-closed, promoción al archivar y backfill

## Context

El motor de memoria expone un único camino de escritura, `recordNode(input, context)` en
`src/core/memory/engine.js:208-239`, con supersesión atómica por `memory_key` y procedencia resuelta
por el runtime (`source`). La superficie MCP (`src/core/memory/mcp-server.js:16`) escribe con
`source: 'mcp:ancleto-memory'`; el toolkit in-process (`createMemoryToolkit` sin contexto) usa
`tool:recordRule` / `tool:recordDecision` como default, no como superficie de producción; el CLI
importa con `cli:import` e `importNodes` conserva LWW. El bloque `<ProjectMemoryRules>` ya se refresca
sólo para `rule` + `project` o por supersesión.

Lo que hoy no existe: ningún parseo de referencias, ninguna validación de fuente en la escritura,
ninguna regla determinística que decida qué se promueve al archivar, y `skills/ancleto-archive`
registra lecciones "por juicio" sin gate. Los cinco `design.md` históricos con decisiones únicas
existen todavía y PR-4 los elimina.

Restricciones de superficie: sólo `src/core/memory/engine.js` puede cambiar bajo `src/`; no se
pueden tocar `working-context.js`, `tools.js`, `mcp-server.js`, `src/cli/index.js` ni
`test/content-guards.test.js`. Las skills y `agents/memory-keeper.md` sí. Esa restricción condiciona
dos decisiones de mecánica: la raíz para resolver refs se deriva dentro del engine y la validación se
acota por procedencia en lugar de por un borde nuevo.

## Approach

### 1. Gramática de refs y materialización

Un nodo nuevo declara sus refs dentro de `content`, después de una línea `refs:` al inicio de línea
seguida de una lista con guion. Gramática cerrada:

```text
refs:
  - spec:<capability>#<heading>
  - change:<slug>
  - path:<repository-relative-path>
  - commit:<sha>
  - workitem:<tracker>:<key>
```

- `spec:` y `change:` son anclas obligatorias para `decision` (al menos una).
- `rule` requiere al menos una de `path:` / `spec:` / `change:` / un `path:` que apunte a un archivo
  existente bajo `test/`.
- `commit:` y `workitem:` son opcionales; se valida su forma, no se resuelven (no se invoca git ni
  un tracker).
- Una línea dentro del bloque que no matchea la gramática, o un bloque `refs:` sin entradas válidas,
  se rechaza: fail-closed, nunca se ignora.
- Sin tabla ni columna nueva. La consulta inversa sigue siendo textual sobre `content`; `memory_refs`
  sólo se consideraría si el texto fallara medido (§5.9).

### 2. Dónde y sobre qué se valida

La validación vive en `recordNode`, después de validar `memory_key`/`type`/`content`/`scope` y
**antes** de abrir la transacción: un rechazo no escribe ni supersede nada.

Se aplica a toda escritura que pasa por `recordNode`, con una única exención explícita: la procedencia
resuelta por el runtime es exactamente `runtime` (default programático y fixtures). Cualquier otro
valor de `context.source` se valida, incluido uno no previsto: fail-closed por construcción. La
superficie real de captura en producción es `mcp:ancleto-memory`; una procedencia `agent:<rol>`
provista por el host también se valida. `cli:import` queda fuera porque no pasa por `recordNode` y
conserva su LWW (riesgo #10).

El ajuste de los fixtures que quedan bajo esta validación —mecánica ajena al engine— se ejecuta en la
task 5.1.

El rechazo de secretos, en cambio, es incondicional para cualquier `source`: guardar una credencial
nunca es correcto. Se inspeccionan `content` y `justification` con patrones de credencial (claves
`sk-`/`ghp_`/`AKIA`, `Authorization: Bearer`, asignaciones tipo `TOKEN=`/`PASSWORD=` y bloques de
clave privada). El mensaje nombra la `memory_key` y la regla, y **nunca** repite el valor detectado.

### 3. Resolución

La raíz del proyecto se toma de `context.projectRoot` si el runtime la provee (el server MCP ya la
resuelve) y, si no, se deriva del `dbPath` que `createMemoryEngine` recibe: subir hasta el primer
ancestro con `.ancletorc` y, si no hay, usar el candidato `.ancleto/`. Nunca `process.cwd()`. Para no
crear un ciclo de imports (`working-context.js` importa `engine.js`), el engine lleva su propio
resolvedor mínimo; el test de paridad con `resolveMemoryProjectRoot` fija el mismo resultado.

`change:<slug>` busca exactamente dos ubicaciones: `aspec/changes/<slug>` (activo) y cualquier
directorio `aspec/changes/archive/<YYYY-MM-DD>-<slug>` cuyo nombre termine en `-<slug>`. Exactamente
una coincidencia ⇒ resuelve. Cero ⇒ rechazo "no resuelve". Dos o más ⇒ rechazo por ambigüedad, sin
elegir. Un change archivado y un change activo con el mismo slug son ambigüedad, no preferencia.

`spec:<cap>#<heading>` lee `aspec/specs/<cap>/spec.md` y compara el heading contra cada línea
`### Requirement: <texto>` con dos formas: exacta (trim y colapso de espacios) y canónica
(minúsculas, sin diacríticos, sin backticks ni negritas, espacios colapsados). Cero coincidencias ⇒
rechazo. Dos o más bajo cualquiera de las dos formas ⇒ ambigüedad reportada, sin elegir. No se usa
FTS: el índice sólo contiene `memory_nodes.content`.

`path:<rel>` se normaliza, se rechaza si es absoluto o contiene `../`, y debe existir como archivo
dentro de la raíz. `:linea` se acepta como hint y se descarta para la resolución.

Formato de error: siempre nombra la `memory_key` y la regla violada, y la ref ofensora cuando aplica.
Ejemplos: `refs: decision "auth-session-policy" requiere al menos una ref spec:<cap>#<heading> o
change:<slug>`; `refs: change "foo" no resuelve a un change (0 coincidencias)`; `refs: spec
"memory-engine#..." es ambiguo (2 coincidencias)`; `contenido rechazado en "k": parece contener una
credencial`.

### 4. Promoción al archivar

El gate lo ejecuta el rol que archiva (`skills/ancleto-archive`, y por change en
`skills/ancleto-bulk-archive`), no `@memory-keeper`:

1. Leer `aspec/changes/<name>/proposal.md` y extraer los bloques de `## Decisiones`.
2. Candidato = bloque con `memory_key` propia y `Estado: aprobado`. La forma de una línea no lo es
   (no tiene `memory_key` ni `Estado`). Sólo se promueven `decision`: `rule` nunca sale de
   `## Decisiones`.
3. Preflight del lote completo: claves únicas dentro del lote, refs presentes, `Estado` aprobado y
   sin candidato de sesión (notas transitorias, estado de tareas, resumen de sesión). Cualquier
   violación ⇒ **0 escrituras** y reporte por bloque con su ubicación en el proposal.
4. Cero candidatos ⇒ **0 escrituras y 0 delegaciones**: no se invoca `@memory-keeper` en absoluto.
5. Con candidatos válidos, se delega una sola vez a `@memory-keeper` en modo Promotion con el slug del
   change y los bloques verbatim. El agente escribe un `recordDecision` por bloque (una llamada por
   decisión aprobada), con `content` = 1–3 oraciones + bloque `refs:`, y reporta por clave.
6. Si una escritura falla, el resultado se reporta como **archivado, memoria pendiente**, con la
   clave y el motivo, y la instrucción de reintento. Nunca se reporta "archivado y memorizado" si
   sólo se archivó.

La explicación completa (Elección / Descartado / Justificación / Refs) **no** se copia al nodo: el
nodo es de 1–3 oraciones y la justificación completa queda en el `proposal.md` versionado, que se
mueve al archive. La promoción no trunca ni reescribe el artifact.

Duplicados: mismo tema, dos claves ⇒ se reporta y se remite a `memory merge` (ya existe). Contradicción
cross-key ⇒ se reportan ambas claves con sus fuentes y se remite a resolución humana; nunca se
resuelve por similitud textual. Misma clave con contenidos distintos en un lote ⇒ se rechaza el lote.

### 5. Backfill de las cinco únicas

Mecanismo: las cinco decisiones se escriben completas en el `## Decisiones` de **este** proposal
(versionado en Git y archivado con el change) y se promueven con el mismo gate al archivar este
change. Cada bloque lleva la evidencia `file:line` del `design.md` de origen en su `Justificación` y
refs resolubles (`change:<slug>` al archive histórico + `path:` a la fuente viva). No hay migración a
ciegas ni backfill de los ~94 nodos: sólo estas cinco.

### 6. Superficies de prompt

- `agents/memory-keeper.md`: modo Promotion con preflight propio (defensa en profundidad), composición
  de `content` con `refs:`, prohibición de inventar `memory_key`, rechazo de secretos y de candidatos
  de sesión, y regla de contradicción (reportar, no elegir).
- `skills/ancleto-archive`: se reemplaza el paso "Capture lessons" por el gate de promoción; el shape
  de `## Decisiones` se **referencia** (`agents/spec-writer.md`), no se re-enuncia. Guardrails: cero
  candidatos ⇒ cero escrituras y cero spawn; fallo ⇒ memoria pendiente.
- `skills/ancleto-bulk-archive`: mismo gate por change; si ningún change tiene candidatos, cero
  delegaciones en el lote.
- `skills/ancleto-verify`: deja de ser un segundo punto de promoción; registra sólo hallazgos
  durables que no sean decisiones del change, con refs, y no toca `## Decisiones`.

## Test plan

Todos los asserts son predicates de comportamiento sobre el engine en
`test/memory-engine.test.js`; no se agregan literales de oración.

| Test | Predicado | Nota |
|---|---|---|
| T05 | una `decision` escrita por superficie de captura con refs resolubles queda activa y su `content` contiene el bloque `refs:` parseable | además: `sqlite_master` idéntico antes/después |
| T06 | una decisión en forma de una línea no tiene `memory_key` y el motor rechaza la escritura sin clave: 0 nodos nuevos | "0 spawn" es `No-testeable-por-construcción` (no-acción de un agente) |
| T09 | `change:<slug>` de un change archivado resuelve al directorio único; dos coincidencias ⇒ rechazo por ambigüedad | |
| T21 | dos afirmaciones sobre la misma `memory_key` ⇒ una sola activa y ambas en el historial; el lote con clave repetida y contenido divergente se rechaza antes de escribir | la mitad cross-key es `No-testeable-por-construcción` (juicio humano) |
| T23 | `content`/`justification` con patrón de credencial ⇒ rechazo, 0 nodos, mensaje con `memory_key` y sin el valor | candidato de sesión: cubierto por el gate de promoción, no por el engine |
| T29 | `spec:<cap>#<heading>` con dos headings que canonicalizan igual ⇒ rechazo por ambigüedad, sin elegir | |

Tests de no regresión explícitos: `importNodes` sin refs sigue aceptando y conservando LWW; una
escritura `runtime` sin refs sigue aceptada; el conjunto de objetos de `sqlite_master` no cambia (no
aparece `memory_refs`); los `inputSchema` MCP no ganan campos.

## Risks

- **Superficie de test:** `test/mcp.test.js` debe actualizarse (dos fixtures) para no romper con la
  validación; se declara en el proposal y en tasks.
- **Duplicación del resolvedor de raíz:** el engine replica la precedencia de
  `resolveMemoryProjectRoot` para evitar el ciclo de imports; un test de paridad evita la deriva.
- **Falsos positivos de secretos:** el detector es heurístico; se acota a patrones de credencial y se
  documenta que un texto legítimo con `TOKEN=` debe reformularse.
- **Lote grande:** el preflight recorre todos los bloques antes de escribir; es O(n) sobre pocas
  decisiones por change.
- **T20 ausente:** el reintento de una promoción parcial supersede la misma clave y agrega historial;
  se declara como dependencia conocida, no se implementa acá.

## Out of scope

- `importNodes` (LWW intacto), `memory_refs`, migración de schema, backfill masivo.
- Idempotencia de `recordNode` (T20).
- Eliminación de `design.md`/`context.md` (PR-4) y conformidad sin delta (PR-5).
- Cualquier cambio en `.opencode/**` a mano.
