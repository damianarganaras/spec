# Proposal: Dry-run clasificado de `memory import`

## Related Work Item

No aplica: este change no tiene Work Item asociado y no se inventa uno.

## Contexto y problema

`ancleto memory import` es el camino documentado para restaurar un snapshot y la única vía de
importación de nodos. Hoy no tiene dry-run: el handler toma como archivo el primer argumento que no
empieza con `-` (`src/cli/index.js:2859`) y llama directo a `importNodes` (`:2878-2881`), de modo que
un flag inexistente se ignora. Medido: `ancleto memory import --dry-run <archivo.json>` imprime
`insertados:1` y escribe la fila.

Dos defectos medidos justifican el cambio:

1. **La decisión del import es invisible y el LWW no muestra el diff.** Con dos bases divergentes y
   `createdAt` igual, `importNodes` compara con `>` estricto (`src/core/memory/engine.js:1038`) y
   cae en `skipped` (`:1047-1049`); un round-trip A↔B deja `ALPHA` vs `BETA` con
   `anyConflictSignal:false`. Con `createdAt` distinto, el más nuevo supersede sin diff
   (`:1039-1046`). El operador no puede saber, sin escribir, qué entradas insertarían, cuáles
   supersederían y cuáles divergen.
2. **No hay preview read-only.** Como el flag no existe, cualquier intento de inspeccionar el efecto
   de un import escribe. La garantía central que se agrega es que la clasificación predice
   exactamente el efecto de `import` sobre la misma entrada, con la misma función de decisión y sin
   duplicar la política.

## Requisito citado

- `spec:memory-ops#Import de nodos desde JSON con upsert por memory_key`
  (`aspec/specs/memory-ops/spec.md:52`).

El change **extiende sin modificar** ese requirement: `importNodes` conserva su semántica y su
resumen `{ inserted, updated, skipped }`. El delta agrega un requirement nuevo bajo
`## ADDED Requirements`; no hay `## MODIFIED`.

## Disparador evaluado

El disparador multi-worktree/multi-dev **NO está verificado**: no hay evidencia medida en este
repositorio de worktrees paralelos ni de varios devs divergiendo la misma base. La pieza se justifica
por los dos defectos medidos arriba, no por ese disparador; no se usa como argumento de alcance.

## Intención

Agregar `ancleto memory import --dry-run <archivo.json> [--json]` que clasifique cada entrada por
`memory_key` en cuatro buckets —`nuevo`, `identico`, `divergente`, `tombstone`— con una acción
predicha —`insert`, `supersede`, `skip`— y un resumen, sobre una conexión estrictamente read-only.
El dry-run y `importNodes` comparten una única función de decisión, de modo que la predicción no
puede derivar del import.

## Alcance

In scope:

- `src/core/memory/engine.js` — extraer la decisión por entrada de `importNodes` (`:1030-1064`) a una
  función única y exponer un método de clasificación read-only que simule el archivo completo en
  orden. `importNodes` pasa a consumir la misma función sin cambiar su comportamiento.
- `src/cli/index.js` — `--dry-run` y `--json` en `memoryImport` (`:2858-2892`), apertura con
  `createReadonlyMemoryEngine` (`engine.js:670`), `databasePresent`, salida y exit codes. Texto de
  `MEMORY_USAGE` (`:134`) y de la ayuda (`:108`).
- Delta de `memory-ops` (`specs/memory-ops/spec.md` dentro de este change) con
  `## ADDED Requirements`.
- Tests en `test/memory-engine.test.js` (nivel engine) y `test/cli.test.js` (nivel CLI).

Out of scope, refutado con evidencia:

- **`memory reindex` desde proposals/specs.** El `content` persistido es una composición de 1–3
  frases (`agents/memory-keeper.md:87`), y `skills/ancleto-archive/SKILL.md:69` pasa los bloques
  "verbatim" al agente; el bloque del proposal nunca es byte-igual al `content` almacenado. Además
  `rule` no tiene contraparte en Git. Un reindex supersedería memoria aprobada con prosa cruda.
- **Gate fail-closed en `import`.** `import` es el camino documentado de restore del snapshot
  (`spec:memory-ops#Snapshot consistente de la base de memoria`) y cuatro requirements canónicos
  fijan la semántica de `importNodes`:
  - `spec:memory-ops#Import de nodos desde JSON con upsert por memory_key` (`:52-63`)
  - el requirement de la CLI de import (`:104-108`), sin ref porque su título contiene backticks
  - `spec:memory-engine#Validación fail-closed de refs en el camino único de escritura` (`:641-650`,
    que declara `cli:import` fuera de `recordNode` con LWW)
  - `spec:memory-engine#Idempotencia de reescritura idéntica en recordNode` (`:914-934`, que manda no
    modificar `importNodes`)

  Cambiarlo exigiría cuatro `## MODIFIED` y rompería el restore; sin reindex no hay vía de
  recuperación.
- **Tombstone persistido.** El esquema no tiene tombstone ni `deleted_at`; no se agrega ninguno. El
  término describe sólo "retirada local, el import lo saltea" (historial `superseded` existe y no
  hay activo).
- Dry-run que escriba, `--on-conflict`, `formatVersion`.
- `importNodes` fail-open en refs: `:1011-1067` no llama `validateRefsForWrite`, que sí corre en
  `recordNode` (`:929-936`). Es conformidad declarada, no defecto, y no se toca.

**No-garantía explícita.** El contrato read-only es "ninguna sentencia de escritura y `.db` con
bytes idénticos". NO se promete la ausencia de sidecars `-wal`/`-shm`: SQLite puede materializarlos
al abrir en read-only, igual que `memory doctor`.

## Evidencia medida citada

- Identidad sin `createdAt`: `importNodes` compara con `>` estricto (`src/core/memory/engine.js:1038`)
  y cae en `skipped` (`:1047-1049`); precedente de identidad sin `createdAt` en
  `spec:memory-engine#Idempotencia de reescritura idéntica en recordNode`.
- `exportActive` sanea paths absolutos (`engine.js:993-1002`) y es determinista
  (`ORDER BY created_at, rowid`, `:755`). Comparar el `content` crudo produciría `divergente` falso
  en un round-trip legítimo.
- `importNodes` supersede sin diff cuando el `createdAt` entrante es más nuevo (`:1039-1046`).

## Riesgos con mitigación

- **Divergencia de política entre preview e import:** se extrae una sola función de decisión y se
  pinea la equivalencia acción↔efecto contra un import real.
- **Falso `divergente` por paths absolutos:** la identidad usa la forma saneada que produce
  `exportActive`; se pinea con un round-trip real.
- **Base previa sin `superseded_at`:** la clasificación sólo lee el nodo activo y el conteo
  `superseded`; la preparación lazy de `superseded_at` ya es contrato de GC y no se toca.
- **Base ausente:** se verifica existencia antes de abrir; nunca se crea desde el dry-run.
- **Texto de ayuda pineado:** `test/cli.test.js:9468-9487` fija `MEMORY_USAGE`; se actualiza en el
  mismo change.

## Decisiones

**memory_key:** memory-import-dry-run-shares-decision-function

**Elección:** la clasificación del dry-run y `importNodes` comparten una única función de decisión
que, dada la entrada y el estado activo/historial de su `memory_key`, devuelve el bucket y la acción;
el preview recorre el archivo en orden y aplica esa misma función.

**Descartado:** duplicar la política en un camino de preview independiente.

**Justificación:** duplicar la política haría que el preview derive del import y rompería la garantía
de predicción exacta; una sola función la hace verificable por equivalencia.

**Refs:**
- spec:memory-ops#Import de nodos desde JSON con upsert por memory_key
- spec:memory-engine#Idempotencia de reescritura idéntica en recordNode
- change:ch-08-memory-import-dry-run-classified

**Estado:** aprobado

**memory_key:** memory-import-dry-run-sanitized-identity

**Elección:** la identidad de payload compara `type`, `scope`, `content` y `justification` usando
para `content` la forma saneada con el mismo saneador que `exportActive`.

**Descartado:** comparar el `content` local crudo contra la entrada.

**Justificación:** `exportActive` redacta paths absolutos (`src/core/memory/engine.js:993-1002`);
comparar el crudo clasifica `divergente` un round-trip legítimo export→import.

**Refs:**
- spec:memory-ops#Export de nodos activos a JSON
- spec:memory-ops#Import de nodos desde JSON con upsert por memory_key
- change:ch-08-memory-import-dry-run-classified

**Estado:** aprobado

**memory_key:** memory-reindex-from-proposals-refuted-composed-content

**Elección:** se refuta `memory reindex` desde proposals/specs y no se implementa.

**Descartado:** reconstruir nodos desde los bloques de `proposal.md`/`spec.md`.

**Justificación:** el `content` almacenado es una composición de 1–3 frases
(`agents/memory-keeper.md:87`; `skills/ancleto-archive/SKILL.md:69` pasa los bloques verbatim al
agente), no el bloque byte-igual, y `rule` no tiene fuente en Git; un reindex supersedería memoria
aprobada con prosa cruda.

**Refs:**
- spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas
- spec:memory-ops#Backfill de las decisiones históricas únicas
- change:ch-08-memory-import-dry-run-classified

**Estado:** aprobado

**memory_key:** memory-import-fail-closed-rejected-snapshot-restore

**Elección:** se rechaza un gate fail-closed en `import` y se conserva su semántica LWW.

**Descartado:** validar refs u otro gate bloqueante en el camino de import.

**Justificación:** `import` es el restore documentado del snapshot y cuatro requirements canónicos
fijan la semántica de `importNodes`; cambiarla exige cuatro `## MODIFIED` y rompe el restore, y sin
reindex no queda vía de recuperación.

**Refs:**
- spec:memory-ops#Snapshot consistente de la base de memoria
- spec:memory-engine#Validación fail-closed de refs en el camino único de escritura
- spec:memory-engine#Idempotencia de reescritura idéntica en recordNode
- change:ch-08-memory-import-dry-run-classified

**Estado:** aprobado
