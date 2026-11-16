---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el recall task-aware, la validación de refs, la reparación explícita de refs no resueltas (0.37.0), el working-context, las ops export/import/gc, snapshot, merge, consolidate, curate, doctor, la promoción de decisiones al archivar y la serialización de escritores concurrentes (MEMORY_DB_BUSY) y el rebuild de doctor en transacción inmediata (0.33.1), el import con dry-run clasificado (0.34.0) el GC por instante con snapshot de lectura en curate (0.35.0), la puerta de criticidad pre-write en merge/consolidate --apply (0.36.0), el estado advisory de memoria (0.38.0) y el doctor sobre base sin esquema (0.38.0)"
covers: [motor de memoria, tools MCP, recall, preview, expand, keys, required, conjunto crítico, memory.criticalKeys, política de fallo, refs, reparación de refs, repair-refs, allowlist-inexistente, preservacion-byte-a-byte, planRefRepair, repairRefs, secretos, working-context, export/import, gc, snapshot, merge, consolidate, curate, doctor, promoción al archivar, orden del archive, idempotencia de recordNode, serialización de escritores, MEMORY_DB_BUSY, retry acotado, runImmediateTransaction, runReadTransaction, doctor-rebuild, import-dry-run, decideImportEntry, databasePresent, clasificacion-read-only, gc-julianday, fechas-no-parseables, deleted-reservado, curate-snapshot, REF_GRAMMAR, puerta-de-criticidad, criticalAffected, force-critical, MEMORY_CRITICAL_KEY, critical-key-gate, memory-status, estado-advisory, inspectMemoryStatus, expected, gap, recovery, no-db, uninitialized, doctor-sin-esquema]
sources: ["src/core/memory/**", "aspec/specs/memory-ops/spec.md", "aspec/specs/memory-engine/spec.md", "aspec/changes/archive/2026-11-07-memory-record-idempotency", "aspec/changes/archive/2026-11-12-mem-05-working-context-critical-set", "aspec/changes/archive/2026-11-13-ch-04-memory-writer-serialization", "aspec/changes/archive/2026-11-13-ch-08-memory-import-dry-run-classified", "aspec/changes/archive/2026-11-15-mem-05-gc-eligibility-curate-snapshot", "aspec/changes/archive/2026-11-15-ch-09a-criticality-gate", "aspec/changes/archive/2026-11-16-memory-repair-refs", "aspec/changes/archive/2026-11-16-memory-gap-declaration", "test/memory-writers.test.js", "test/memory-engine.test.js", "test/curation.test.js", "test/repair-refs.test.js", "test/memory-status.test.js", "test/memory-doctor-uninitialized.test.js", "test/fixtures/memory-writer-child.mjs", "agents/orchestrator.md", "agents/documenter.md", "skills/ancleto-archive/SKILL.md", "skills/ancleto-bulk-archive/SKILL.md", "skills/ancleto-onboard/SKILL.md"]
generatedAt: 2026-11-16T14:59:46Z
pluginVersion: 0.38.0
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
`MEMORY_DB_BUSY`; schema, PRAGMAs persistidos, recall y ops no cambian. **0.33.1 suma el sexto
camino**: `memory doctor --rebuild` ejecuta rebuild FTS5 + integrity-check dentro del mismo helper
(`doctor-rebuild`) y reporta `MEMORY_DB_BUSY` en el detalle; el `doctor` por defecto sigue
read-only (ver "Escritura y supersesión"). **0.34.0** suma el import con `--dry-run`/`--json` sin
tocar el esquema. **0.35.0 sí corrige el motor**: `memory gc` resuelve la elegibilidad por instante
con `julianday` y retiene fechas no parseables, `status='deleted'` queda documentado como reservado,
`memory curate` compone su reporte bajo un único snapshot de lectura y el literal de gramática de
refs pasa a una constante exportada (`REF_GRAMMAR`); sin cambio de schema ni de formato persistido
(ver "GC por instante y snapshot de curaduría"). **0.36.0 sí toca el camino de escritura**: `merge`
y `consolidate` reciben `criticalKeys`/`forceCritical`, calculan `criticalAffected` y evalúan una
puerta de criticidad dentro de la transacción inmediata, antes de superseder; el dry-run reporta sin
bloquear y el rechazo real sale con exit 2 (ver "Puerta de criticidad pre-write"). Sin cambio de
schema, PRAGMAs ni `ruleVersion`. **0.37.0 agrega una opción de escritura reparativa**: `repairRefs`
reutiliza el parser de `refs:` y el resolvedor de escritura para quitar solo refs `inexistente` de
un único nodo activo, con dry-run sobre el engine read-only y `--apply` por supersede bajo el mismo
gate crítico (ver "Reparación de refs"). Sin cambio de schema, PRAGMAs ni `ruleVersion`. **0.38.0
agrega una superficie de sólo lectura**: `inspectMemoryStatus` (`src/core/memory/status.js`)
clasifica la base en `ok`/`empty`/`no-db`/`uninitialized`, deriva `expected` de los `proposal.md`
archivados y calcula `gap` con recuperación por export/import/snapshot; además `memory doctor` ya no
aborta sobre una base sin esquema y completa sus cinco checks (ver "Estado advisory de memoria").
Sin cambio de schema, PRAGMAs persistentes ni `ruleVersion`.

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
  `consolidate`— lo comparten y, desde 0.33.1, también `doctor --rebuild` con la operación
  `doctor-rebuild`: rebuild de FTS5 + integrity-check en una única transacción, `rebuilt` sólo tras
  `COMMIT` exitoso y `MEMORY_DB_BUSY` en el detalle si se agota la contención. `curate`, los
  dry-runs, `snapshot`, el `doctor` por defecto y el engine read-only siguen sin retry. El oráculo
  offline es `test/memory-writers.test.js` con el fixture `test/fixtures/memory-writer-child.mjs`,
  sobre una base temporal y procesos hijos.
- La procedencia decide una sola cosa: si la escritura pasa por validación de refs. La excepción es
  el valor exacto `runtime`; el resto se valida fail-closed.

### Import con dry-run clasificado (0.34.0)

- `ancleto memory import --dry-run <archivo.json> [--json]` es una simulación read-only: abre con
  `createReadonlyMemoryEngine` (`migrate: false`), no abre transacción, no llama `importNodes`,
  `recordNode`, `gc` ni `checkpoint`, y no refresca el working-context.
- `importNodes` y `classifyImport` comparten `decideImportEntry`; el preview recorre el archivo en
  orden y simula el estado por `memory_key`, así que los duplicados secuenciales predicen el mismo
  `inserted`/`updated`/`skipped` que el import real.
- Buckets: `nuevo` (sin activo ni historial → `insert`), `identico` y `divergente` (hay activo;
  `supersede` sólo si el `createdAt` entrante es estrictamente más nuevo, si no `skip`) y
  `tombstone` (sin activo pero con historial `superseded` → `skip`). `createdAt` queda fuera de la
  identidad; `content` y `justification` se comparan con el saneador de `exportActive`, por lo que un
  path absoluto redactado no produce un `divergente` falso.
- Salida: resumen `{ nuevo, identico, divergente, tombstone }` y `{ memory_key, classification,
  action }` por entrada; con `--json`, `{ dryRun: true, databasePresent, summary, entries }`. Si la
  base no existe, `databasePresent: false` y no se crea. Exit 0 en éxito y 1 por archivo faltante,
  JSON inválido o entrada fuera del esquema, sin clasificación parcial.
- El `tombstone` no se persiste: el esquema no tiene `deleted_at` y no se agrega. `reindex` desde
  proposals y un gate fail-closed en `import` se refutaron (ver `decisions.md`).

### GC por instante y snapshot de curaduría (0.35.0)

- **Elegibilidad por instante**: `gcSuperseded({ days, dryRun })` calcula un cutoff único y los tres
  statements (`gcSelect`, `gcDelete` y el DETACH de `superseded_by`) comparan
  `julianday(COALESCE(superseded_at, created_at)) < julianday(?)`. La comparación textual anterior
  podía purgar hasta casi 1 s antes de tiempo cuando `superseded_at` traía milisegundos y el cutoff
  no (`'.' < 'Z'`). Una fila con fecha no parseable queda con `julianday(...) = NULL` y se retiene:
  nunca se purga por un valor que no puede interpretar.
- **`deleted` reservado**: el CHECK de `status` admite `deleted`, pero ningún camino de escritura lo
  produce; `gc` lo ignora en selección, borrado y conteo. No se agregó ninguna escritura de ese
  estado.
- **Snapshot único en `curate`**: `curateMemory` exige `engine.readTransaction(fn)` y ejecuta
  `listNodes({ status: 'active' })` y `consolidate({ dryRun: true, includeNearDuplicates: false })`
  dentro de una única `runReadTransaction` (`BEGIN DEFERRED` … `COMMIT`, `ROLLBACK` ante error). La
  transacción no escribe, no migra y no adquiere `runImmediateTransaction` ni su retry. Las refs
  contra el filesystem se resuelven después del commit, así el I/O no mantiene el snapshot abierto;
  bajo WAL no bloquea a otros lectores ni escritores.
- **Gramática de refs con fuente única**: `REF_GRAMMAR = { ref: 'refs:', reason: 'inválido
  (gramática)' }` se exporta desde `engine.js` y lo consumen `inspectRefs` (doctor) y `curation.js`;
  el texto, el motivo y los exit codes observables no cambian.
- **Invariantes**: sin cambios de schema, del formato persistido de `superseded_at`/`created_at`, de
  PRAGMAs, del statement `supersede`, de los cinco caminos de escritura ni de `ruleVersion`; GC no
  crea índices ni otros objetos de schema (se acepta `SCAN memory_nodes`).
- **Oráculo**: `test/memory-engine.test.js`, `test/curation.test.js` y `test/memory-writers.test.js`
  (frontera de segundo, formatos mixtos con y sin milisegundos, fecha no parseable, `deleted`
  reservado, snapshot único y no retención del WAL). No se ejecutó la suite en esta generación.

### Puerta de criticidad pre-write (0.36.0)

- **Entradas**: `merge({ target, sources, dryRun, criticalKeys = [], forceCritical = false })` y
  `consolidate({ dryRun, includeNearDuplicates, criticalKeys = [], forceCritical = false })`. El
  engine **no lee `.ancletorc`**: el CLI resuelve el conjunto con `readCriticalMemoryKeys(projectRoot)`
  sobre la raíz derivada de la base y lo inyecta. `createReadonlyMemoryEngine` acepta `criticalKeys`
  en dry-run y sigue rechazando la corrida real.
- **Riesgo calculado**: `affectedCriticalKeys` devuelve la intersección determinística (sin locale)
  entre `criticalKeys` y los nodos que serían superseded: sources en `merge`, miembros `superseded`
  de los grupos exactos en `consolidate`. El target/canónico no cuenta; los near-duplicates tampoco.
  El plan/reporte expone `criticalAffected` junto a `target`/`sources`/`superseded` (merge) o
  `exactGroups`/`superseded`/`nearDuplicates` (consolidate).
- **Dry-run**: devuelve `criticalAffected` y **nunca** bloquea; `--force-critical` no tiene efecto.
- **Apply atómico**: dentro de `runImmediateTransaction` (`BEGIN IMMEDIATE`), antes del primer
  `getSupersede().run`, si `criticalAffected` no está vacío y `forceCritical` es falso se lanza un
  error con `code: 'MEMORY_CRITICAL_KEY'` y el mensaje nombra cada clave y `--force-critical`. El
  rechazo no omite miembros —o aplica todos los grupos o ninguno—, revierte la transacción y no
  refresca el working-context. Con `forceCritical` la escritura y el refresh post-escritura siguen
  el camino vigente (incluido el fallo del refresh si se supersedió una `rule` crítica).
- **CLI**: el rechazo se mapea a exit 2 sin inspeccionar el mensaje; con `--json`, stdout es
  `{"error":"critical-key-gate","criticalAffected":[...]}`; sin `--json`, stderr nombra las claves.
  Además, `memory consolidate` sin base sale con código 1 y no la crea.
- **Invariantes**: sin schema, PRAGMAs, columnas, tipos de nodo ni `ruleVersion` nuevos; el conjunto
  crítico sigue siendo configuración aditiva y una lista vacía reproduce el comportamiento previo.
- **Oráculo**: `test/memory-engine.test.js` (dry-run reporta, rechazo deja cero filas, `forceCritical`
  aplica, target/near-duplicates no cuentan, orden determinístico, read-only) y `test/cli.test.js`
  (exit 2, JSON, texto humano, pin de `MEMORY_USAGE` y `consolidate` sin base). No se ejecutó la
  suite en esta generación.

### Reparación de refs (0.37.0)

- **Entrada**: `ancleto memory repair refs --memory-key <key> [--apply] [--json] [--force-critical]`.
  `repairRefs({ memoryKey, dryRun, criticalKeys, forceCritical })` selecciona un **único nodo activo**
  y falla cerrado si la cardinalidad no es exactamente 1. El `content` se parsea con el mismo
  `parseRefsBlock` del camino de escritura y se resuelve con `resolveRefResult`; no hay parser ni
  resolvedor paralelos.
- **Allowlist**: solo se remueve una ref verificable con `ok: false` y motivo exactamente
  `inexistente`. `commit:`/`workitem:` no son verificables localmente y nunca se remueven; cualquier
  otro motivo —incluido `ambiguo (<n> coincidencias)` y los futuros— se conserva. El filtro no tiene
  default: un motivo desconocido se retiene.
- **Preservación byte a byte**: el `content` reparado se obtiene quitando líneas completas (texto +
  EOL), sin re-render desde `parsed.refs`; prosa, separadores, indentación y el resto de las refs
  quedan byte-idénticos. Cada elemento conserva su EOL, así que quitar una línea no altera las demás
  ni el separador final.
- **Dry-run y apply**: dry-run es el default y corre sobre `createReadonlyMemoryEngine`
  (`migrate: false`), sin transacción ni escritura. `--apply` usa el writer transaccional
  (`runImmediateTransaction`) y supersede el nodo anterior conservando su `content` original como
  historial; refresca el working-context con la misma guarda que `import`/`merge`/`consolidate`. Un
  no-op no abre transacción, no escribe ni refresca.
- **Fail-closed compartido**: el plan y la escritura validan el `content` candidato con la misma
  validación de refs que `recordNode`; si tras la remoción queda otra ref ambigua o inválida, el
  dry-run falla igual que el apply y nombra la ref ofensora (no reporta un plan aplicable).
  La selección y el plan se revalidan bajo lock para no superseder un nodo distinto si el estado
  deriva entre el plan y la escritura.
- **Gate crítico**: `--apply` sobre una `memory_key` de `memory.criticalKeys` sin
  `--force-critical` no escribe y sale con código 2; con `--json`,
  `{"error":"critical-key-gate","criticalAffected":[...]}`. El dry-run reporta `critical: true` y
  sale 0; el flag no tiene efecto en dry-run.
- **Salida JSON determinística**: `status`, `memory_key`, `dry_run`, `applied`, `critical`,
  `removed[]` y `remaining`. `remaining` solo aparece en un plan resuelto (`ok`/no-op); en `no-db` y
  `error` se omite porque el nodo conserva sus refs.
- **Refutado con evidencia**: redirigir refs entre `memory_key`, reescribir un bloque `refs:`
  malformado y reactivar un nodo `superseded`. Sin cambios de schema, PRAGMAs persistentes ni
  `ruleVersion`: un binario `0.36.0` lee el mismo estado persistido.
- **Oráculo**: `test/repair-refs.test.js` (allowlist, preservación byte a byte, dry-run/apply,
  cardinalidad, no-op sin escritura y gate crítico) y `test/memory-engine.test.js`. No se ejecutó la
  suite en esta generación.

### Estado advisory de memoria (0.38.0)

- **Entrada**: `ancleto memory status [--json]`, wrapper fino sobre `inspectMemoryStatus({ cwd })`
  en `src/core/memory/status.js`. No agrega tools MCP, no escribe y no funciona como gate de archive
  ni de promoción.
- **Estados de la base**: `ok` (archivo con esquema y ≥1 nodo activo), `empty` (archivo con esquema
  y 0 activos), `no-db` (archivo ausente) y `uninitialized` (archivo presente sin `memory_nodes`,
  por ejemplo 0 bytes).
- **Memoria esperable**: `inspectExpected(cwd)` recorre `aspec/changes/archive/*/proposal.md` con
  corte temprano. Un proposal aporta evidencia si contiene una línea que empieza con
  `## Decisiones` y otra que, tras quitar indentación y un bullet `- `/`* `, empieza con
  `**memory_key:**`. Un error de lectura cuenta como no-match y nunca declara gap; `.ancletorc`,
  `aspec/specs/**` y `CHANGELOG.md` no son evidencia.
- **Gap**: `gap = expected && status !== 'ok'`. `evidence` es 1/0 por corte temprano. Cuando hay
  gap, `recovery` nombra los caminos existentes `ancleto memory export`, `ancleto memory import` y
  `ancleto memory snapshot`; sin gap es `[]` y no se agrega advertencia.
- **Raíz única**: la DB (`defaultMemoryDbPath(cwd)`) y la evidencia se derivan del mismo `cwd`; un
  subdirectorio sin `aspec/changes/archive` propio no declara gap. Esto impide mezclar raíces y
  declarar un gap falso.
- **Read-only**: pre-check de existencia y apertura con `{ migrate: false, readonly: true }`; no
  crea `.ancleto/` ni `memory.db`, no ejecuta DDL, `INSERT`/`UPDATE`/`DELETE`, checkpoint ni refresh
  del working-context. La materialización de `-shm`/`-wal` vacío por SQLite no cuenta como escritura.
- **Salida y exit codes**: sin `--json`, una línea con el estado y, si hay gap, una línea accionable;
  con `--json`, `{ status, expected, gap, dbPresent, activeNodes, evidence, recovery }`. Sale 0 en
  los cuatro estados; 1 sólo por error inesperado de E/S/apertura o flag desconocida, con mensaje en
  stderr y sin stack trace.
- **Doctor sin esquema**: `memoryDoctor` detecta la ausencia de `memory_nodes` antes de cualquier
  statement y devuelve los cinco checks (`Integridad DB`, `Indice FTS5`, `Reglas activas
  (unicidad)`, `Refs de nodos activos`, `Checkpoint WAL`) con `ok: false` y `detail`
  `no verificable: esquema no inicializado`; el CLI sale ≠ 0 sin excepción no capturada ni stack
  trace y no construye el engine read-only de frescura.
- **Invariantes**: sin cambios de schema, PRAGMAs persistentes, `ruleVersion` ni forma del
  export/snapshot. `CH-01/T27` se cierra por la declaración explícita del gap; el reindex desde
  `proposals` sigue refutado.
- **Oráculo**: `test/memory-status.test.js` (estados, evidencia, gap, raíz única, read-only y JSON),
  `test/memory-doctor-uninitialized.test.js` (path sin esquema) y `test/cli.test.js` (dispatch y
  salida). No se ejecutó la suite en esta generación.

### Refs y secretos

- Gramática cerrada de `refs:`: `spec:`, `change:`, `path:`, `commit:`, `workitem:`. El bloque
  empieza en una línea `refs:` y termina en la primera línea en blanco o no indentada que no es
  item. Un segundo bloque, una gramática inválida o una línea indentada inválida son `error`
  (fail-closed). Desde 0.35.0 el par de literales de ese diagnóstico (`refs:` /
  `inválido (gramática)`) vive sólo en `REF_GRAMMAR` y lo comparten `inspectRefs` y `curate`.
- `resolveNodeRefs` resuelve `spec:`/`change:`/`path:` contra la raíz del repo; `commit:` y
  `workitem:` se reportan como no verificables. La raíz se deriva de `context.projectRoot` o de la
  ubicación de la DB, nunca de `process.cwd()`.
- **Reparación (0.37.0)**: `planRefRepair` usa `parseRefsBlock` + `resolveRefResult` y remueve solo
  refs con motivo `inexistente`; el resto del `content` queda intacto. Un bloque `refs:` malformado
  no se reescribe: sigue siendo un error fail-closed.
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
| `import` | Upsert por `memory_key`; no reactiva superseded; `--dry-run` clasifica sin escribir; si el JSON es más reciente supersede, si no no-op |
| `gc --days N` | Purga superseded por instante: `julianday(COALESCE(superseded_at, created_at)) < julianday(cutoff)` con cutoff único; retiene fechas no parseables e ignora `deleted`; detacha `superseded_by` antes del DELETE; `--dry-run` no escribe (0.35.0) |
| `snapshot` | Copia consistente con historial (`VACUUM INTO`, conexión read-only, reemplazo seguro en Windows) |
| `merge` | Supersede sources activas hacia un target activo; valida todo antes de una única transacción; `--dry-run` no escribe; desde 0.36.0 una source crítica sin `--force-critical` rechaza con exit 2 antes de escribir |
| `consolidate` | Duplicados exactos por `type` + content normalizado; canónico por orden total; `--apply` supersede; near-duplicates solo reporte; `includeNearDuplicates: false` evita O(n²); desde 0.36.0 el gate crítico reporta `criticalAffected` y bloquea el apply sin `--force-critical` |
| `curate` | Read-only: refs rotas, no verificables (`commit:`/`workitem:`) y duplicados exactos, compuestos bajo un único snapshot `BEGIN DEFERRED`; advisory, `--strict` convierte hallazgos en exit ≠ 0 (0.35.0) |
| `repair refs` | Dry-run read-only por defecto; `--apply` supersede un único nodo activo quitando solo refs con motivo `inexistente` y preservando el resto byte a byte; `commit:`/`workitem:` y otros motivos se conservan; gate crítico con exit 2 (0.37.0) |
| `status` | Read-only y advisory: `ok`/`empty`/`no-db`/`uninitialized`, `expected` de proposals archivados, `gap = expected && status !== 'ok'` y `recovery` export/import/snapshot; exit 0 en los cuatro estados y `--json` con siete campos (0.38.0) |
| `doctor` | Cinco checks read-only: integridad, FTS5, reglas activas, refs de nodos activos, checkpoint WAL; sobre una base sin esquema completa los cinco con `ok: false` y sale ≠ 0 sin abortar (0.38.0); `--rebuild` es el único camino mutante y desde 0.33.1 ejecuta rebuild + integrity-check dentro de `runImmediateTransaction` (`doctor-rebuild`) |

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
- **Gate de criticidad (0.36.0)**: `merge` y `consolidate --apply` no superseden una clave de
  `memory.criticalKeys` sin `--force-critical`. El dry-run reporta `criticalAffected` y el rechazo
  real (exit 2, `MEMORY_CRITICAL_KEY`) ocurre dentro de la transacción, antes de cualquier `UPDATE`;
  `--force-critical` no suprime el fallo posterior del refresh. Un binario 0.35.0 ignora el flag y
  puede superseder una clave crítica (riesgo de downgrade documentado).
- **Reparación acotada (0.37.0)**: `memory repair refs` no redirige refs, no reescribe bloques
  `refs:` malformados y no reactiva superseded; solo quita refs `inexistente` de un nodo activo. La
  escritura es un supersede normal, así que el nodo anterior conserva su `content` original. Sin
  schema, PRAGMAs persistentes ni `ruleVersion` nuevos.
- **Estado advisory (0.38.0)**: `memory status` es sólo lectura y nunca un gate: no crea la base,
  no importa, no refresca el working-context y no altera el `healthy`/exit de `memory doctor`. La
  evidencia y la DB comparten la raíz `cwd`, y `gap` sólo se declara con evidencia versionada.
- **Doctor robusto (0.38.0)**: una base existente sin `memory_nodes` no lanza una excepción; el
  reporte conserva los cinco checks y el comando sale ≠ 0. Un binario anterior podía abortar en ese
  caso.
- **Read-only por defecto**: `list`, `status`, `doctor`, `curate` y `consolidate` sin `--apply` no
  migran ni escriben. `no-db` nunca se reporta como reporte limpio.
- **`source` no es forjable**: un `source` en los args del caller se ignora; lo resuelve el runtime.
- **Riesgo de presupuesto**: una requerida no se trunca ni se degrada al aviso; si no entra, falla
  con diagnóstico (key + ruta de refs resueltas). Desde 0.31.0 el conjunto requerido se declara en
  `.ancletorc` → `memory.criticalKeys` (seam de configuración, no de DB): una clave inexistente,
  inactiva o fuera de presupuesto falla visiblemente según la superficie.
- **Predicción del import (0.34.0)**: el dry-run y `importNodes` comparten `decideImportEntry`, de
  modo que la acción (`insert`/`supersede`/`skip`) y los contadores predicen el import real; la
  identidad usa el saneador de `exportActive`, así que un round-trip legítimo con paths absolutos no
  se marca `divergente`. Un `tombstone` no es estado persistido: sólo historial `superseded` sin activo.
- **Riesgo de consistencia**: `merge`/`consolidate` revalidan bajo lock y abortan si el target dejó
  de estar activo; `gc` usa un cutoff único para SELECT, DELETE y DETACH y, desde 0.35.0, compara
  instantes con `julianday` (retiene fechas no parseables); `curate` compone sus dos lecturas bajo un
  único snapshot `BEGIN DEFERRED` y resuelve refs después del commit.
- **Estados reservados (0.35.0)**: `status='deleted'` existe en el CHECK del esquema pero ningún
  camino de escritura lo produce; `gc` lo ignora y el import no lo reactiva. No se agregan
  escrituras de ese estado.
- **Riesgo de contención (0.33.0–0.33.1)**: el retry es acotado (3 intentos, 200/600 ms) para no
  ampliar la latencia indefinidamente; bajo un lock retenido más allá del presupuesto la operación
  falla con `MEMORY_DB_BUSY` y sin transacción abierta. Desde 0.33.1 `memory doctor --rebuild`
  también adquiere el lock con el helper (`doctor-rebuild`) y surfacea `MEMORY_DB_BUSY` en el
  detalle del check; el `doctor` por defecto sigue read-only.
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
| `src/core/memory/engine.js` | Núcleo: recall, refs, supersesión, ops, consolidate; desde 0.35.0 `REF_GRAMMAR`, GC con `julianday` y `readTransaction`; desde 0.36.0 `affectedCriticalKeys` y gate `MEMORY_CRITICAL_KEY` en `merge`/`consolidate`; desde 0.37.0 `planRefRepair` y `repairRefs` |
| `src/core/memory/database.js` | Apertura, migraciones aditivas, checkpoint WAL, `runImmediateTransaction` (0.33.0), `runReadTransaction` (`BEGIN DEFERRED`, 0.35.0), política de retry y `MemoryDatabaseBusyError` |
| `src/core/memory/tools.js` | Handlers de `searchMemory`/`recordRule`/`recordDecision` |
| `src/core/memory/mcp-server.js` | Servidor MCP stdio |
| `src/core/memory/working-context.js` | Render, refresh, frescura y lectura de `memory.criticalKeys` |
| `src/core/memory/status.js` | Estado advisory `ok`/`empty`/`no-db`/`uninitialized`, `expected`, `gap` y `recovery`; `inspectMemoryStatus` es el único camino y deriva DB y evidencia del mismo `cwd` (0.38.0) |
| `src/core/memory/doctor.js` | Diagnóstico read-only, path sin esquema con cinco checks fallidos (0.38.0) y rebuild FTS5 dentro de `runImmediateTransaction` desde 0.33.1; exporta `SCHEMA_UNINITIALIZED_DETAIL` |
| `src/core/memory/curation.js` | Curaduría read-only de refs y duplicados; desde 0.35.0 compone bajo `engine.readTransaction` e importa `REF_GRAMMAR` |
| `src/core/memory/snapshot.js` | Copia consistente con historial |
| `aspec/specs/memory-ops/spec.md` | Requirements de ops y de la promoción al archivar antes del move; desde 0.35.0 GC y `memory curate` se reescribieron en el lugar (instante, `deleted` reservado, snapshot único); desde 0.36.0 la puerta de criticidad de merge/consolidación; desde 0.37.0 el subcomando `memory repair refs` y la allowlist `inexistente` |
| `aspec/specs/memory-engine/spec.md` | Requirement de idempotencia de reescritura idéntica en `recordNode` (0.23.0); `Orden determinístico de inyección de reglas` con 7 escenarios y `Conjunto crítico estable del working-context` (0.31.0); desde 0.33.0 `Serialización de escritores concurrentes sobre la base de memoria`; desde 0.33.1 el requirement de doctor se actualizó en el lugar |
| `aspec/changes/archive/2026-11-12-mem-05-working-context-critical-set/` | Delta `ADDED` del conjunto crítico y `MODIFIED` del orden determinístico; `MEM-05` cerrado en 0.31.0 |
| `aspec/changes/archive/2026-11-13-ch-08-memory-import-dry-run-classified/` | Delta `ADDED` del import con dry-run clasificado; cierra `CH-08` en 0.34.0 |
| `aspec/changes/archive/2026-11-15-mem-05-gc-eligibility-curate-snapshot/` | Delta `MODIFIED` de GC y curaduría (instante, `deleted` reservado, snapshot único y `REF_GRAMMAR`); cierra `MEM-05` en 0.35.0 |
| `aspec/changes/archive/2026-11-15-ch-09a-criticality-gate/` | Delta `MODIFIED` de merge, consolidación y comando CLI en `memory-ops`; puerta de criticidad pre-write, `criticalAffected`, `--force-critical` y exit 2; cierra `CH-09a` en 0.36.0 |
| `aspec/changes/archive/2026-11-16-memory-repair-refs/` | Delta `ADDED` del subcomando `memory repair refs` y de la reparación de refs en `memory-ops`; allowlist `inexistente`, preservación byte a byte, dry-run read-only y gate crítico; cierra `CH-09b` en 0.37.0 |
| `aspec/changes/archive/2026-11-16-memory-gap-declaration/` | Delta `ADDED` del subcomando `memory status` y del estado advisory en `memory-ops`; `expected`/`gap`/`recovery`, raíz única en `cwd`, read-only y fix de `memory doctor` sin esquema; cierra `CH-01/T27` en 0.38.0 |
| `aspec/changes/archive/2026-11-13-ch-04-memory-writer-serialization/` | Delta `ADDED` de serialización de escritores concurrentes; cierra `CH-04` en 0.33.0 |
| `test/memory-engine.test.js`, `test/curation.test.js` | Cobertura de GC por instante, formatos mixtos, fechas no parseables, `deleted` reservado y snapshot único de `curate` (0.35.0) |
| `test/repair-refs.test.js` | Cobertura de la reparación explícita de refs: allowlist, preservación byte a byte, dry-run/apply y gate crítico (0.37.0) |
| `test/memory-status.test.js`, `test/memory-doctor-uninitialized.test.js` | Cobertura del estado advisory (estados, evidencia, gap, raíz única, read-only, `--json`) y del doctor sobre base sin esquema (0.38.0) |
| `test/memory-writers.test.js`, `test/fixtures/memory-writer-child.mjs` | Oráculo offline de escritores concurrentes y fixture de proceso hijo (0.33.0–0.33.1; cubre el rebuild de doctor bajo contención desde 0.33.1) |
| `aspec/specs/cli-diagnostics/spec.md` | Fuera de esta unidad: contrato de frescura del seed (0.26.1) que no toca el motor |
| `agents/orchestrator.md` | Secuencia del archive y delegación de la promoción entre fase A y fase B |
| `agents/documenter.md` | Fase A (merge, sin move) y fase B (move, sólo tras la promoción) |
| `skills/ancleto-archive/SKILL.md`, `skills/ancleto-bulk-archive/SKILL.md`, `skills/ancleto-onboard/SKILL.md` | Gate de promoción, move y literales de fallo |
| `docs/technical-discovery/decisions.md` | Reglas de memoria y frontera repo/agente |
