# Proposal: MEM-04 — `memory doctor` reporta refs no resueltas

## Problem

`memory doctor` verifica integridad, alineación FTS5, unicidad de reglas activas y estado del
WAL, pero no informa si las refs declaradas por los nodos activos siguen resolviendo. Una ref
`spec:`, `change:` o `path:` rota degrada la resolución bajo demanda que sostiene la memoria
first y hoy solo se descubre cuando alguien intenta usarla. En la base medida hay 94 nodos
activos, 21 declaran refs y suman 66 refs; las 21 refs `change:` resuelven y ninguna usa prefijo
de fecha. El diagnóstico puede hacerse sin escribir un byte.

Un hallazgo posterior mostró que el parser de refs no ve una parte de las refs declaradas:
`parseRefsBlock` acepta como item cualquier línea que matchee `/^\s*-\s+/`, sin exigir
indentación, pero `refsBlockEnd` solo continúa el bloque con líneas indentadas. Un bloque `refs:`
con items sin indentar se lee como bloque vacío. Medición contra `.ancleto/memory.db` el
2026-10-30: 66 items de refs en 21 nodos activos, pero `memory doctor` verifica solo 48; 18 items
en ~6 nodos quedan invisibles (entre ellos `archive-promotion-approved-decisions-only`,
`git-commit-ownership-coder-only`, `memory-provenance-audit-not-authorization`,
`memory-refs-fail-closed-grammar`, `refs-fail-closed-superficies-captura`, `refs-raiz-desde-dbpath`,
`review-vs-reviewer-verify-boundary` y `working-context-refresh-comparison-based`). La spec
canónica de `memory-engine` no exige indentación, así que el parser es el que no conforma.

## Proposed change

Agregar a `memory doctor` un quinto check llamado `Refs de nodos activos` que, sin escribir en
la base, recorre los nodos `status='active'` y reporta cada ref `spec:`, `change:` o `path:` que
no resuelve, con su `memory_key` y la ref textual. El check reutiliza la gramática y la
resolución que ya viven en `src/core/memory/engine.js`; no agrega un segundo parser ni un
segundo resolvedor. Una ref rota de un nodo activo es una falla detectable: el check reporta
`ok: false`, `healthy: false` y el comando sale con código distinto de `0`. Una base vacía o sin
refs reporta `ok: true` con `0 refs verificadas`, nunca `skipped`. El check se agrega también al
path temprano de esquema no inicializado, como sus hermanos. Este corte es solo diagnóstico: no
resuelve refs, no reescribe nodos ni backfillea nada.

## Scope

In scope:

- Quinto check `Refs de nodos activos` en `memory doctor`, en modo por defecto y con
  `--rebuild`, con la forma `{ name, ok, detail }` y `skipped` reservado a la raíz de proyecto
  no resoluble.
- Resultado estructurado por ref en `engine.js` (ok / inexistente / ambiguo / inválido con
  motivo), reutilizado por `validateRefsForWrite` sin cambiar sus mensajes ni su semántica de
  escritura.
- Reporte de refs `spec:`, `change:` y `path:` no resueltas, con `memory_key` y ref textual.
- `commit:` y `workitem:` excluidos de las rotas y contados aparte como no verificables solo si
  existen.
- Garantía de cero escrituras: solo lecturas de `aspec/specs/**/spec.md`, listado de
  `aspec/changes/**` y `existsSync`/`statSync`.
- DB vacía y nodos activos sin bloque `refs:` reportados como `ok: true`, no como `skipped`.
- Corrección del parser de refs en `memory-engine`: `refsBlockEnd` continúa el bloque con items sin
  indentar, de modo que `parseRefsBlock` los valida igual que los indentados; se agrega el delta de
  `memory-engine` con el Requirement `Refs normalizadas materializadas en el contenido del nodo`.

Out of scope:

- Resolver, reparar o backfillear refs; el primer corte no escribe nodos.
- Resolver `commit:` contra git ni `workitem:` contra un tracker.
- Variante con fecha para `change:`: el slug canónico va sin fecha; una ref
  `change:<YYYY-MM-DD-slug>` se reporta como no resuelta.
- `realpath` o containment de symlinks para `path:`; se conserva la validación léxica y de
  existencia del camino de escritura.
- Cambios en el comportamiento de `validateRefsForWrite` más allá de la validación de items sin
  indentar: sus mensajes y su semántica fail-closed se conservan.

## Assumptions

- `resolveProjectRoot(context, dbPath)` sigue siendo la fuente de la raíz del proyecto; si no
  puede derivarla y hay refs que verificar sin defecto detectable sin raíz, el check se omite con
  `ok: true` y `skipped: true`. Con 0 refs no requiere la raíz y no se omite.
- Los nodos activos son los que tienen `status='active'`; el conteo de nodos revisados incluye
  a los que no declaran bloque `refs:`.
- La raíz de un fixture en `tmpdir` se deriva de la ubicación de la DB, igual que hoy; no se usa
  `process.cwd()`.

## Risks

- El check agrega un recorrido de archivos por corrida de `doctor`. Mitigación: solo se leen
  specs referenciados y se listan directorios de changes; no se indexa ni se escribe.
- Tests existentes asumen cuatro checks y `checks.length === 4`; se actualizan como parte del
  change, sin relajar sus asertos de contenido.
- Una ref rota nueva vuelve `healthy: false` y cambia el exit code de `doctor`; es el
  comportamiento buscado, pero puede sorprender a consumidores que asumían solo cuatro fuentes
  de falla.
- La validación de `path:` no resuelve symlinks: un path léxicamente dentro del repo pero que
  escapa por symlink no se detecta en este corte y queda declarado como gap.
- Cambio de mensaje en un caso borde: un bloque `refs:` seguido de bullets de prosa sin indentar
  (que no son refs) hoy se rechaza como `vacío` y pasará a rechazarse como ref inválida. La
  decisión de rechazo no cambia; solo el mensaje. No se agrega heurística para adivinar intención.
- El doctor puede pasar a rojo si alguna de las 18 refs antes invisibles no resuelve: sería un
  hallazgo real del check, no una regresión introducida por el parser.

## Decisiones

- **memory_key:** `doctor-refs-no-resueltas-es-falla`
  **Elección:** Una ref de un nodo activo que no resuelve es falla detectable: `ok: false`,
  `healthy: false` y exit code distinto de `0`; solo se omite el check cuando no se puede
  derivar la raíz del proyecto y no hay defecto detectable sin raíz.
  **Descartado:** Reportar las refs rotas como advertencia no bloqueante (`ok: true` con detalle)
  para no alterar la salida de `doctor`.
  **Justificación:** La base medida tiene 94 nodos activos, 21 con refs y 66 refs, con 0 rotas, así
  que el cambio no produce falsos positivos hoy; ocultar una ref rota impediría el diagnóstico que
  el corte busca y dejaría la degradación solo visible al usar la ref. El reporte
  `{ checks, healthy, rebuilt }` y el exit code derivado de `healthy` ya existen
  (`doctor.js:126`, `src/cli/index.js:2263`).
  **Refs:** `change:mem-04-doctor-referencias-no-resueltas`; `path:src/core/memory/doctor.js`;
  `spec:memory-ops#memory doctor estrictamente read-only`
  **Estado:** pendiente

- **memory_key:** `doctor-refs-resolvedor-compartido-engine`
  **Elección:** Extender `engine.js` con un resultado estructurado por ref y hacer que
  `doctor` consuma ese resultado; `validateRefsForWrite` sigue lanzando con los mismos mensajes.
  **Descartado:** Crear un módulo `refs.js` nuevo con parser y resolvedor propios.
  **Justificación:** La gramática, la unicidad de `change:` y la canonicalización de headings
  ya viven en `engine.js` y están especificadas en `memory-engine`; duplicarlas crearía dos
  fuentes de verdad y churn sobre el camino caliente de escritura. `parseRefsBlock` vive en
  `engine.js:170-195` y los `resolve*` en `:222-282`.
  **Refs:** `change:mem-04-doctor-referencias-no-resueltas`; `path:src/core/memory/engine.js`;
  `path:src/core/memory/doctor.js`;
  `spec:memory-engine#validación fail-closed de refs en el camino único de escritura`
  **Estado:** pendiente

- **memory_key:** `refs-sin-variante-change-con-fecha`
  **Elección:** No agregar una variante de `change:` con fecha. El slug canónico es el del
  change activo o el del archive `YYYY-MM-DD-<slug>`; una ref `change:<YYYY-MM-DD-slug>` se
  reporta como no resuelta.
  **Descartado:** Aceptar el prefijo `YYYY-MM-DD-` dentro de la ref como alias del slug.
  **Justificación:** Medición del 2026-10-30: 21 refs `change:` activas, 0 con prefijo
  `YYYY-MM-DD-`, y las 21 resuelven con el slug sin fecha; la fecha ya la aporta el nombre del
  directorio archivado. `resolveChangeRef` aplica el regex `^\d{4}-\d{2}-\d{2}-<slug>$` sobre
  `archive/` (`engine.js:250-269`).
  **Refs:** `change:mem-04-doctor-referencias-no-resueltas`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#resolución de refs change: con unicidad`
  **Estado:** pendiente

- **memory_key:** `refs-realpath-fuera-de-alcance`
  **Elección:** Mantener para `path:` la validación léxica y de existencia del camino de
  escritura, sin `realpath` ni containment de symlinks; el gap se declara como no-goal.
  **Descartado:** Resolver `realpath` y exigir que el destino quede dentro de la raíz del
  proyecto.
  **Justificación:** El camino de escritura ya fija la validación léxica; cambiarla solo en el
  doctor abriría una divergencia entre validar y diagnosticar, y ampliaría el primer corte más
  allá del diagnóstico sin escrituras. `resolvePathRef` ya rechaza absolutos y `../` y exige
  archivo existente (`engine.js:271-282`).
  **Refs:** `change:mem-04-doctor-referencias-no-resueltas`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#validación fail-closed de refs en el camino único de escritura`
  **Estado:** pendiente

- **memory_key:** `doctor-refs-commit-workitem-no-verificables`
  **Elección:** Excluir `commit:` y `workitem:` del listado de rotas y contarlos aparte como no
  verificables en el `detail` solo cuando existen.
  **Descartado:** Resolver `commit:` contra git y `workitem:` contra un tracker externo, o
  reportarlos como fallas.
  **Justificación:** No hay resolución local read-only de git o tracker en este corte, y hoy son
  0; reportarlos como rotas sería un falso positivo y resolverlos ampliaría el alcance. `commit:`
  y `workitem:` solo se parsean (`engine.js:137-147`); no hay resolvedor local.
  **Refs:** `change:mem-04-doctor-referencias-no-resueltas`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#refs normalizadas materializadas en el contenido del nodo`
  **Estado:** pendiente

- **memory_key:** `refs-bloque-sin-indentacion-acepta-items`
  **Elección:** `refsBlockEnd` acepta items sin indentar como continuación del bloque; los items se
  validan igual que los indentados.
  **Descartado:** Exigir indentación (dejar el parser como está) y reportar las 18 refs invisibles
  solo como conteo sin verificar.
  **Justificación:** 66 items medidos, 48 verificados, 18 invisibles en ~6 nodos; el propio
  item-regex de `parseRefsBlock:184` ya acepta el item sin indentación, así que el corte es una
  inconsistencia interna; la spec canónica no exige indentación.
  **Refs:** `change:mem-04-doctor-referencias-no-resueltas`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Refs normalizadas materializadas en el contenido del nodo`
  **Estado:** pendiente
