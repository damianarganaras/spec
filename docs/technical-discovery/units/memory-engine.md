---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el recall task-aware, la validación de refs, el working-context, las ops export/import/gc, snapshot, merge, consolidate, curate, doctor, la promoción de decisiones al archivar y la serialización de escritores concurrentes (MEMORY_DB_BUSY)"
covers: [motor de memoria, tools MCP, recall, preview, expand, keys, required, conjunto crítico, memory.criticalKeys, política de fallo, refs, secretos, working-context, export/import, gc, snapshot, merge, consolidate, curate, doctor, promoción al archivar, orden del archive, idempotencia de recordNode, serialización de escritores, MEMORY_DB_BUSY, retry acotado, runImmediateTransaction]
sources: ["src/core/memory/**", "aspec/specs/memory-ops/spec.md", "aspec/specs/memory-engine/spec.md", "aspec/changes/archive/2026-11-07-memory-record-idempotency", "aspec/changes/archive/2026-11-12-mem-05-working-context-critical-set", "aspec/changes/archive/2026-11-13-ch-04-memory-writer-serialization", "test/memory-writers.test.js", "test/fixtures/memory-writer-child.mjs", "agents/orchestrator.md", "agents/documenter.md", "skills/ancleto-archive/SKILL.md", "skills/ancleto-bulk-archive/SKILL.md", "skills/ancleto-onboard/SKILL.md"]
generatedAt: 2026-11-13T19:05:43Z
pluginVersion: 0.33.0
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

Persistir las reglas y decisiones del proyecto en `.ancleto/memory.db` (SQLite + FTS5 vía
`node:sqlite`) y exponerlas a los agentes como contexto inyectable y como tools MCP. La memoria es
local al repositorio, versionable con el equipo y separada de la memoria de sesión del agente.
Sin cambios de motor en 0.19.0, 0.20.0, 0.20.1, 0.21.0, 0.22.0 ni 0.22.1. En 0.21.0 sólo se
promovieron como datos cuatro decisiones del archive de conformidad
(`archive-conformity-discriminator`, `archive-noop-does-not-write-canonical-specs`,
`conformity-verification-reuses-closed-ledger`, `triage-routing-single-contract`); en 0.22.0 el
merge de specs tampoco abre ni escribe la DB. En 0.22.1 la novedad es de **contrato de archive**: la
promoción de `## Decisiones` aprobadas ocurre antes del move y su secuencia vive en `agents/` y
`skills/`, no en el engine. El esquema, el recall y las ops no cambiaron. **0.23.0** sí toca el
engine: `recordNode` trata como no-op la reescritura idéntica de una `memory_key` (ver
"Escritura y supersesión"); el esquema, el recall y las ops siguen sin cambios. **0.24.0** tampoco
toca el motor: la alineación del tier `minimo` y el guard de `specs merge` viven en
`src/core/tier-models.js` y `src/core/specs-merge.js`, fuera de `src/core/memory/**`. **0.25.0**
tampoco: sólo cambia el contrato de prompt del archive (el sync invoca `specs merge`) y el guard de
`--help` en el dispatch del CLI. **0.26.0–0.26.1** tampoco lo tocan: el cálculo state-independent
de `seedMapPresent` y el detector de frescura viven en `checkDiscovery`; **0.26.2** sólo agrega
tests (walkers de snapshot y pines de frescura); **0.26.x** es documental/test (`cli-diagnostics` y
el guard estructural de deltas de `spec-sync`), fuera de `src/core/memory/**`, y el motor, el
esquema, el recall y las ops siguen sin cambios. **0.27.0–0.30.2** no tocan el motor: la
normalización del `version` del `package.json` raíz, el filtro de rutas efímeras y el matcher de
`discovery.exclude` viven en
`checkDiscovery`/`computeSources` (`src/cli/index.js`) y, desde 0.30.1, en
`src/core/discovery-glob.js`; desde 0.30.2 el armado offline del estado vive en
`src/core/discovery-state.js`, siempre fuera de `src/core/memory/**`. **0.31.0 sí toca esta unidad
sólo en el renderer**: `working-context.js` lee el conjunto crítico de `.ancletorc` y lo pasa como
`required`; el engine, el esquema, el recall y las ops no cambian. **0.32.0 no toca esta unidad**:
la selección de tests (`src/core/test-selection.js`) es read-only y no abre `.ancleto/memory.db`.
**0.33.0 sí toca el camino de escritura**: los cinco writers del engine comparten
`runImmediateTransaction` (`src/core/memory/database.js`) con retry acotado y error nombrado
`MEMORY_DB_BUSY`; schema, PRAGMAs persistidos, recall y ops no cambian (ver "Escritura y
supersesión").

## Recorrido relevante

### Escritura y supersesión

- `createMemoryEngine(dbPath)` abre en escritura, aplica `journal_mode=WAL` y migraciones aditivas
  (`database.js`); `createReadonlyMemoryEngine` abre sin migrar ni escribir.
- `recordNode(input, context)` valida refs y secretos **antes** de abrir transacción, resuelve
  `source` desde `context` (nunca del caller) y supersede por `memory_key` sin filtrar `type`/`scope`.
- **Idempotencia de reescritura idéntica (0.23.0)**: si ya existe un nodo activo con la misma
  `memory_key` y la tupla `(type, scope, content, justification)` es **exactamente igual**, la
  escritura es un **no-op total**: no inserta nodo, no supersede, devuelve `superseded: 0` y los
  valores persistidos del nodo activo, incluido su `created_at` original. `createdAt`, `source` y
  `confidence` quedan **fuera** de la identidad. Cualquier diferencia en la tupla sigue el camino
  normal: supersede el activo, inserta un nodo nuevo con UUID nuevo y devuelve `superseded: 1`.
  La validación de refs y secretos corre antes de la comprobación de identidad, así que un rechazo
  nunca se convierte en no-op. `importNodes` no cambia: conserva su semántica last-writer-wins por
  `createdAt`.
- **Serialización de escritores (0.33.0)**: `runImmediateTransaction(db, operation, fn, policy)`
  (`database.js`) es el único helper de transacción de escritura: abre con `BEGIN IMMEDIATE`, ejecuta
  el cuerpo y hace `COMMIT`; ante cualquier error del cuerpo o del `COMMIT` hace `ROLLBACK` sólo si
  `db.isTransaction` y propaga el error original. `MEMORY_WRITE_RETRY_POLICY` fija 3 intentos y
  backoff de 200/600 ms sin jitter. Sólo se reintenta la **adquisición** del lock ante
  `SQLITE_BUSY`/`SQLITE_LOCKED` (`errcode` 5/6, enmascarado a los 8 bits bajos para cubrir codes
  extendidos como 517); una transacción ya abierta nunca se re-ejecuta. Al agotar el presupuesto se
  lanza `MemoryDatabaseBusyError` (`code: 'MEMORY_DB_BUSY'`), que nombra la operación y los intentos
  y no incluye contenido ni secretos. Los cinco caminos —`recordNode`, `import`, `gc`, `merge` y
  `consolidate`— lo comparten; `doctor`, `curate`, los dry-runs, `snapshot` y el engine read-only no
  adquieren retry. El oráculo offline es `test/memory-writers.test.js` con el fixture
  `test/fixtures/memory-writer-child.mjs`, sobre una base temporal y procesos hijos.
- La procedencia decide una sola cosa: si la escritura pasa por validación de refs. La excepción es
  el valor exacto `runtime`; el resto se valida fail-closed.

### Refs y secretos

- Gramática cerrada de `refs:`: `spec:`, `change:`, `path:`, `commit:`, `workitem:`. El bloque
  empieza en una línea `refs:` y termina en la primera línea en blanco o no indentada que no es
  item. Un segundo bloque, una gramática inválida o una línea indentada inválida son `error`
  (fail-closed).
- `resolveNodeRefs` resuelve `spec:`/`change:`/`path:` contra la raíz del repo; `commit:` y
  `workitem:` se reportan como no verificables. La raíz se deriva de `context.projectRoot` o de la
  ubicación de la DB, nunca de `process.cwd()`.
- `looksLikeSecret` rechaza credenciales de forma incondicional y **nunca repite el valor**.

### Recall (`searchMemory`)

- Orden total determinístico: requerido → anclaje declarado (`refs:` válido) → scope
  (`project` > `feature` > `task`) → bm25 ascendente → `memory_key` ascendente (sin `rowid`).
- Preview por defecto: prefijo literal de hasta 240 caracteres con `content_truncated` y `limit` 5.
  `expand: true` devuelve el payload completo; `keys` expande solo claves presentes en la página.
- `required` es una entrada de llamada, no estado del nodo: promueve `memory_key` al frente y falla
  si no existe/está inactiva/no cumple el `type` o no entra en el `limit`/presupuesto.
- El bloque proactivo (`buildWorkingContext`) tiene un presupuesto de caracteres; las omitidas se
  listan hasta 40 y el resto se cuenta como `+N`. Si ni el aviso mínimo entra, se omite el aviso.

### Working-context

- `renderWorkingContextBlock(engine, projectRoot, scope)` es el único camino de render: usa el
  engine vivo si existe o, en día-cero, solo la topología. `writeWorkingContextBlock` persiste el
  bloque; `writeWorkingContext` conserva paridad de salto final.
- `refreshWorkingContextOnWrite` es compare-based: reescribe solo si el bloque difiere y no crea un
  archivo vacío. Se dispara en escrituras del lifecycle y en `import`/`merge`/`consolidate`.
- **Conjunto crítico (0.31.0)**: `readCriticalMemoryKeys(projectRoot)` lee
  `.ancletorc` → `memory.criticalKeys` con lectura tolerante: archivo ausente, JSON inválido, valor
  no-array o entradas no-string equivalen a `[]`; las strings vacías se descartan. Los dos puntos de
  render (`renderWorkingContextBlock` y `refreshWorkingContextOnWrite`) lo pasan como
  `{ required }` a `buildWorkingContext`; las claves declaradas entran primero, en su orden, y una
  no crítica no las desplaza. No hay escritura en la DB ni cambio de schema.
- **Política de fallo (0.31.0)**: si una clave crítica no existe, está inactiva o no entra en el
  presupuesto, `ancleto memory context` (incluido `--out`) sale con código ≠ 0 y no sobrescribe el
  archivo previo; el lifecycle (`init`/`install`/`upgrade`) y el on-write del MCP emiten
  `console.warn` y no escriben un bloque degradado; el on-write propaga el error y
  `memory merge`/`memory consolidate --apply` salen ≠ 0. `<ContextOverflowWarning>` no cambia.
- `checkWorkingContextFreshness` es read-only y devuelve `ausente`/`desactualizado`/`ok`.

### Operaciones

| Operación | Contrato |
|---|---|
| `export` | Solo nodos activos; sanea paths absolutos; no exporta historial |
| `import` | Upsert por `memory_key`; no reactiva superseded; si el JSON es más reciente supersede, si no no-op |
| `gc --days N` | Purga superseded por `COALESCE(superseded_at, created_at)`; detacha `superseded_by` antes del DELETE; `--dry-run` no escribe |
| `snapshot` | Copia consistente con historial (`VACUUM INTO`, conexión read-only, reemplazo seguro en Windows) |
| `merge` | Supersede sources activas hacia un target activo; valida todo antes de una única transacción; `--dry-run` no escribe |
| `consolidate` | Duplicados exactos por `type` + content normalizado; canónico por orden total; `--apply` supersede; near-duplicates solo reporte; `includeNearDuplicates: false` evita O(n²) |
| `curate` | Read-only: refs rotas, no verificables (`commit:`/`workitem:`) y duplicados exactos; advisory, `--strict` convierte hallazgos en exit ≠ 0 |
| `doctor` | Cinco checks read-only: integridad, FTS5, reglas activas, refs de nodos activos, checkpoint WAL; `--rebuild` es el único camino mutante |

### Promoción al archivar (0.22.1)

El requirement “Promoción al archivar sólo de decisiones duraderas aprobadas” de
`aspec/specs/memory-ops/spec.md` fija la secuencia canónica del archive:

1. merge/sync de specs si hay delta — desde 0.25.0, siempre mediante
   `ancleto specs merge --change <slug>`; un exit no cero aborta el archive antes del preflight y del
   move;
2. preflight read-only del lote de `## Decisiones`, fail-closed;
3. promoción de los bloques con `memory_key` propia y `Estado: aprobado`;
4. move del directorio a `aspec/changes/archive/YYYY-MM-DD-<slug>/` sin modificarlo;
5. summary/commit.

La promoción corre **después del merge y antes del move** para que las refs `path:` dentro del
change sigan resolviendo. Sólo se promueven `decision`; nunca `rule`, y el rol que archiva no
inventa `memory_key`. Un bloque de una línea (`decisión | alternativa | por qué | fuente`) no es
candidato. El gate valida el lote completo antes de la primera escritura; una violación deja cero
escrituras y no mueve el change.

`@documenter` separa **fase A** (sólo merge, retorna `phase A complete`) y **fase B** (sólo move,
invocada tras confirmar la promoción). `@orchestrator` corre Automatic Record en paralelo con la
fase A, luego la promoción, luego la fase B. La secuencia se replica en
`skills/ancleto-archive/SKILL.md`, `skills/ancleto-bulk-archive/SKILL.md` y la Phase 9 de
`skills/ancleto-onboard/SKILL.md`.

- Fallo de preflight/promoción antes del move: el change no se mueve y se reporta
  **`no archivado; memoria pendiente`** (`not archived; memory pending`), con `memory_key` y motivo.
- Fallo del move tras promoción exitosa: **`memoria promovida; NO archivado`**
  (`memory promoted; NOT archived`).
- `archivado, memoria pendiente` queda eliminado: presume move-before-promote.

## Reglas, contratos y riesgos

- **`memory_key` es identidad transversal**: una nueva versión con payload distinto supersede la
  anterior sin filtrar `type`/`scope`; los nodos superseded quedan como historia y no se reactivan al
  importar. La única excepción es la reescritura con `(type, scope, content, justification)`
  exactamente iguales, que es no-op (0.23.0).
- **Fail-closed**: una ref inválida, un bloque `refs:` múltiple o un secreto rechazan la escritura
  completa; no se escribe parcialmente.
- **Read-only por defecto**: `list`, `doctor`, `curate` y `consolidate` sin `--apply` no migran ni
  escriben. `no-db` nunca se reporta como reporte limpio.
- **`source` no es forjable**: un `source` en los args del caller se ignora; lo resuelve el runtime.
- **Riesgo de presupuesto**: una requerida no se trunca ni se degrada al aviso; si no entra, falla
  con diagnóstico (key + ruta de refs resueltas). Desde 0.31.0 el conjunto requerido se declara en
  `.ancletorc` → `memory.criticalKeys` (seam de configuración, no de DB): una clave inexistente,
  inactiva o fuera de presupuesto falla visiblemente según la superficie.
- **Riesgo de consistencia**: `merge`/`consolidate` revalidan bajo lock y abortan si el target dejó
  de estar activo; `gc` usa un cutoff único para SELECT y DELETE.
- **Riesgo de contención (0.33.0)**: el retry es acotado (3 intentos, 200/600 ms) para no ampliar la
  latencia indefinidamente; bajo un lock retenido más allá del presupuesto la operación falla con
  `MEMORY_DB_BUSY` y sin transacción abierta. `memory doctor --rebuild`, sexto camino mutante
  preexistente, queda fuera de la garantía del helper y se registra como deuda.
- **MCP**: `src/core/memory/mcp-server.js` expone `searchMemory`, `recordRule` y `recordDecision`
  por stdio; stdout es el canal JSON-RPC y los avisos van a stderr.
- **Orden del archive (0.22.1)**: la promoción es una escritura de memoria disparada por el archive,
  no por el engine. Un fallo de promoción no mueve el change; un fallo del move posterior no revierte
  la memoria ya promovida y se reporta con el literal correspondiente. La aceptación vive en los
  contratos de `agents/`/`skills/` y en `test/content-guards.test.js`.
- **Sin promoción parcial**: el lote se valida completo antes de escribir; dos bloques con la misma
  `memory_key` y contenido/refs distintos rechazan el lote entero. Dos claves contradictorias se
  reportan y se remiten a decisión humana o a `memory merge`.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/memory/engine.js` | Núcleo: recall, refs, supersesión, ops, consolidate |
| `src/core/memory/database.js` | Apertura, migraciones aditivas, checkpoint WAL, `runImmediateTransaction`, política de retry y `MemoryDatabaseBusyError` (0.33.0) |
| `src/core/memory/tools.js` | Handlers de `searchMemory`/`recordRule`/`recordDecision` |
| `src/core/memory/mcp-server.js` | Servidor MCP stdio |
| `src/core/memory/working-context.js` | Render, refresh, frescura y lectura de `memory.criticalKeys` |
| `src/core/memory/doctor.js` | Diagnóstico read-only y rebuild FTS5 |
| `src/core/memory/curation.js` | Curaduría read-only de refs y duplicados |
| `src/core/memory/snapshot.js` | Copia consistente con historial |
| `aspec/specs/memory-ops/spec.md` | Requirements de ops y de la promoción al archivar antes del move |
| `aspec/specs/memory-engine/spec.md` | Requirement de idempotencia de reescritura idéntica en `recordNode` (0.23.0); `Orden determinístico de inyección de reglas` con 7 escenarios y `Conjunto crítico estable del working-context` (0.31.0); desde 0.33.0 `Serialización de escritores concurrentes sobre la base de memoria` |
| `aspec/changes/archive/2026-11-12-mem-05-working-context-critical-set/` | Delta `ADDED` del conjunto crítico y `MODIFIED` del orden determinístico; `MEM-05` cerrado en 0.31.0 |
| `aspec/changes/archive/2026-11-13-ch-04-memory-writer-serialization/` | Delta `ADDED` de serialización de escritores concurrentes; cierra `CH-04` en 0.33.0 |
| `test/memory-writers.test.js`, `test/fixtures/memory-writer-child.mjs` | Oráculo offline de escritores concurrentes y fixture de proceso hijo (0.33.0) |
| `aspec/specs/cli-diagnostics/spec.md` | Fuera de esta unidad: contrato de frescura del seed (0.26.1) que no toca el motor |
| `agents/orchestrator.md` | Secuencia del archive y delegación de la promoción entre fase A y fase B |
| `agents/documenter.md` | Fase A (merge, sin move) y fase B (move, sólo tras la promoción) |
| `skills/ancleto-archive/SKILL.md`, `skills/ancleto-bulk-archive/SKILL.md`, `skills/ancleto-onboard/SKILL.md` | Gate de promoción, move y literales de fallo |
| `docs/technical-discovery/decisions.md` | Reglas de memoria y frontera repo/agente |
