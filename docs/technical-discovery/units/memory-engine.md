---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el working-context (día-cero), el refresh on-write (MCP y CLI), la procedencia source, las ops export/import/gc, snapshot, merge, el doctor read-only, el aviso de overflow y su consumo por el orquestador"
covers: [motor de memoria, tools, working-context, día-cero, procedencia source, export/import/gc, snapshot consistente, merge por supersesión, doctor read-only, refresh on-write CLI, staleness advisory, aviso de overflow, Recall delegado]
sources: ["src/core/memory/**"]
generatedAt: 2026-10-28T20:24:06Z
pluginVersion: 0.15.3
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

Retener reglas y decisiones del proyecto entre sesiones de IA, en una base SQLite **local**
(`.ancleto/memory.db`), sin bases vectoriales. Un mismo motor soporta cuatro consumidores:
tools MCP del LLM, subcomandos CLI (ops de mantenimiento, snapshot, merge y chequeo de
integridad), el working-context inyectado al system prompt y el doctor. Evidencia:
`README.md`, `DESIGN-memory-engine-v0.2.0.md`, `aspec/specs/memory-ops/spec.md`,
`aspec/specs/memory-engine/spec.md`,
`aspec/changes/archive/2026-10-28-reingenieria-memoria-first/`.

## Recorrido relevante

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `recordRule`/`recordDecision` supersede atómicamente por `memory_key` y puede refrescar el
   working-context (filtrado por `shouldRefreshWorkingContext`).
3. `ancleto memory export|import|gc|snapshot|merge|context|list|doctor` mueven, copian,
   consolidan, inspeccionan y verifican la memoria:
   - `import` y `merge` (real) refrescan el working-context compare-based;
   - `snapshot` produce una copia binaria con historial;
   - `doctor` audita en read-only y reporta la frescura del working-context.
4. `buildWorkingContext` materializa `<ProjectMemoryRules>`/`<ProjectTopology>` para el prompt;
   si trunca, agrega `<ContextOverflowWarning>` (ver "Aviso de overflow").

## Componentes

| Archivo | Rol |
|---|---|
| `src/core/memory/database.js` | Abre la DB (`openDatabase`, con opción `readonly`), PRAGMAs (`WAL`, `foreign_keys`, `busy_timeout=5000`), migraciones idempotentes, FTS5 external-content, triggers, `checkpointDatabase` (merge del WAL). |
| `src/core/memory/engine.js` | Núcleo: `defaultMemoryDbPath`, `createMemoryEngine`, `createReadonlyMemoryEngine`, `buildWorkingContext`, `searchMemory` (BM25, escape FTS5, fallback AND→OR), `recordNode` (procedencia `source`), `listNodes`, `formatTopologyBlock`, `exportActive`, `importNodes`, `gcSuperseded`, **`validateMerge`/`merge`**, `sanitizePaths`, `checkpoint`, `close`. Presupuesto del bloque: `CHARS_PER_TOKEN = 4`, `MAX_TOKENS = 2000`. |
| `src/core/memory/snapshot.js` | **Dueño único de la copia binaria**: `realpathish`/`sameFile` (identidad de archivo), `vacuumInto` (`VACUUM INTO` con destino vinculado), `verifySnapshot` (`quick_check`), `replaceDestination` (temporal + backup/restore en Windows) y `snapshotDatabase(dbPath, outPath, { overwrite })`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers` (JSON Schema de las 3 tools) y `createMemoryToolkit`; tras `recordNode`, evalúa `shouldRefreshWorkingContext(result)` y, si aplica, llama `writeWorkingContext(engine, projectRoot)` dentro de un `try/catch`. |
| `src/core/memory/mcp-server.js` | `createMemoryServer`/`serveMemoryMcp`: servidor MCP stdio sin dependencias; maneja JSON-RPC, `handle`, `respond`, `fail`. |
| `src/core/memory/doctor.js` | `memoryDoctor(dbPath, { rebuild })`: **read-only por defecto** (`openDatabase(..., { migrate: false, readonly: true })`); cuatro checks con nombres estables; `--rebuild` es el único camino de escritura. |
| `src/core/memory/working-context.js` | Render único (`renderWorkingContextBlock`) + persistencia (`writeWorkingContext`, `writeWorkingContextBlock`), trigger MCP (`shouldRefreshWorkingContext`), refresh on-write CLI compare-based (`refreshWorkingContextOnWrite`), chequeo de staleness advisory (`checkWorkingContextFreshness`), normalización acotada (`normalizeBlock`, `readWorkingContextFile`), resolución de raíz (`resolveMemoryProjectRoot`, `workingContextPath`); día-cero sin DB desde la topología. |

## Operaciones export / import / gc (`memory-ops`)

Expuestas como subcomandos del grupo `memory`:

- **`ancleto memory export [--out <archivo>]`** → `exportActive()`: array JSON de nodos
  activos con `{memory_key, type, content, justification, scope, createdAt}`. Los superseded
  no se incluyen. Antes de serializar, `sanitizePaths` reemplaza paths absolutos (Windows
  `X:\...`, Unix `/home/...`, `/Users/...`) por `<redacted>`. Sin `--out` va a stdout.
- **`ancleto memory import <archivo>`** → `importNodes(json)`: valida el schema de cada entrada
  y **aborta el batch completo** si alguna es inválida. Upsert por `memory_key`: inserta si no
  existe (con el `createdAt` del JSON); si existe activo, supersede solo cuando el `createdAt`
  del JSON es más reciente (empate/no más nuevo = no-op → idempotente); si existe superseded,
  lo saltea (los superseded **no se reactivan**). Reporta insertados/actualizados/omitidos.
  Tras la importación, **`memoryImport`** en `src/cli/index.js` invoca
  `refreshWorkingContextOnWrite(engine, projectDir)` dentro de un `try/catch` aislado
  (`memoryImport` se considera exitoso aunque el refresh falle; el fallo se reporta por stderr).
- **`ancleto memory gc [--dry-run] [--days N]`** → `gcSuperseded({days, dryRun})`: purga nodos
  `superseded` con antigüedad mayor al umbral (default 30 días). La antigüedad se mide con
  `created_at` como **proxy** (no existe `superseded_at`). Tras el DELETE hace `VACUUM` +
  `REINDEX` post-commit; si la compactación falla, la DB queda consistente. `--dry-run` solo
  reporta conteo y bytes estimados. Los nodos activos nunca se tocan. **`memory gc` no dispara
  refresh** (purga superseded sin alterar el bloque de reglas activas).
- **`ancleto memory list [--type X] [--scope X] [--all] [--json]`** y
  **`ancleto memory context [--scope X] [--out <archivo>]`** completan la superficie.
  `memory list` es **read-only** (no toca la base); `memory context` materializa
  `.ancleto/working-context.md` por el mismo camino único de render.

## Snapshot consistente con historial (PR-1, `2026-10-28-reingenieria-memoria-first`)

`ancleto memory snapshot --out <archivo.db> [--force] [--json]` es un **wrapper fino** sobre
`snapshotDatabase` en `src/core/memory/snapshot.js`:

- **Fuente read-only, sin efectos**: no usa `openDatabase` (ese helper fija
  `PRAGMA journal_mode=WAL` y mutaría la fuente); abre una conexión directa read-only, sin
  pragmas ni migraciones. `VACUUM INTO` lee el estado **commiteado** (incluido el WAL) y escribe
  un archivo nuevo, así que la fuente no se toca.
- **Historial incluido**: copia `memory_nodes` completa (`superseded` + `superseded_by`), a
  diferencia de `memory export`, que solo exporta nodos activos y sanitiza contenido. Restaurar
  el snapshot reproduce el estado de la base, no solo las reglas vigentes.
- **Destino validado antes de tocar nada**: la ruta se resuelve y se compara por **identidad de
  archivo**, no por string. `realpathish` usa `realpathSync.native` y, para una ruta que todavía
  no existe, resuelve el ancestro existente más cercano y recompone el resto; `sameFile` compara
  ambos. Así se rechaza `target == source` también por mayúsculas, symlink o junction en Windows.
  Un destino existente sin `--force` es error; `--force` es la sobrescritura explícita.
- **Ruta como parámetro vinculado**: `VACUUM INTO` acepta una expresión SQL, pero el destino
  viaja como parámetro (`?`), nunca interpolado — soporta apóstrofos y otros caracteres.
- **Publicación atómica best-effort**: escribe en `.<basename>.<pid>-<uuid>.tmp` en el **mismo
  directorio** (mismo volumen), verifica con `PRAGMA quick_check` y solo entonces reemplaza.
  En Windows `rename` no reemplaza un destino existente: se aparta el viejo a
  `<target>.bak-<uuid>`, se mueve la copia nueva y se borra el backup; si el movimiento final
  falla, se restaura el backup. En ningún camino de error se pierden a la vez el destino previo
  y la copia nueva. Un `.bak` remanente tras un éxito no invalida la copia; el temporal se
  limpia (incluidos sus sidecars `-wal`/`-shm`) sin enmascarar el error original.
- **Salida**: `{ out, bytes }` (o texto legible); falla con código ≠ 0 si falta `--out`, si no
  hay memoria en el repo o si el snapshot no se pudo producir/verificar.

Evidencia: `src/core/memory/snapshot.js`, `src/core/memory/database.js` (`openDatabase`),
`src/cli/index.js` (`memorySnapshot`), `aspec/specs/memory-ops/spec.md`.

## `memory doctor` estrictamente read-only (PR-1)

- **Modo por defecto**: `openDatabase(dbPath, { migrate: false, readonly: true })`. No ejecuta
  checkpoint, DDL ni `INSERT` sobre FTS: sirve para auditar la base (o una copia dudosa) sin
  reescribir el WAL.
- **Cuatro checks con nombres estables**: `Integridad DB` (`PRAGMA quick_check`),
  `Indice FTS5`, `Reglas activas (unicidad)` (duplicados de `memory_key` entre activos),
  `Checkpoint WAL`.
- **`Indice FTS5` en tres estados**: (1) el índice `memory_fts` no existe ⇒ **falla** (nunca
  `skipped`; la búsqueda está rota aunque `memory_nodes` exista); (2) la tabla sombra
  `memory_fts_docsize` no es consultable ⇒ **omitido** (no baja `healthy` ni el exit code; p. ej.
  FTS5 con `columnsize=0`); (3) si es consultable, compara `count(*)` de la sombra contra
  `memory_nodes`. El `count(*)` de `memory_fts` **no** sirve: al ser external-content, FTS5 lo
  resuelve contra `memory_nodes` y contaría nodos sin indexar.
- **`Checkpoint WAL` read-only**: reporta el estado observable del archivo `-wal` (existencia y
  bytes) **sin** ejecutar checkpoint; el check se marca omitido.
- **`--rebuild` es el único camino de escritura**: ejecuta
  `INSERT INTO memory_fts(memory_fts) VALUES('rebuild')`, corre el integrity-check completo
  (`INSERT ... VALUES('integrity-check', 1)`) y checkpointea el WAL (`checkpointDatabase`).
  Vuelve a reportar los cuatro checks.
- **Error path**: los cuatro nombres se conservan y cada check no ejecutable se reporta como
  falla con su motivo (nunca se omite del array).
- **Advisory adicional**: `memoryDoctorCmd` agrega `Working-context: <ok|ausente|desactualizado>`
  con `checkWorkingContextFreshness` sobre un engine read-only; no altera el exit code, que
  sigue midiendo la integridad de la DB. Si no hay `.ancleto/memory.db`, el comando sale con 0
  y un mensaje.

Evidencia: `src/core/memory/doctor.js`, `src/cli/index.js` (`memoryDoctorCmd`),
`aspec/specs/memory-ops/spec.md` (requirements "`memory doctor` estrictamente read-only" y
"Reparación explícita con `memory doctor --rebuild`").

## Merge por supersesión (PR-1)

`ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]` consolida
duplicados **sin crear nodos ni aceptar contenido**:

- **Validación compartida** (`validateMerge`, usada por el engine de escritura y el read-only):
  target obligatorio y **activo**; sources lista no vacía, sin claves vacías ni repetidas,
  distintas del target, **activas** y con el **mismo `type`** que el target. Cualquier
  violación falla **antes** de abrir transacción, con mensaje específico (`target` inexistente,
  `source` inexistente/inactiva, tipo incompatible, source repetida, source igual al target).
- **Una única transacción**: `BEGIN IMMEDIATE`, un `UPDATE` por source con el mismo statement
  `supersede` de `recordNode`, y `COMMIT`. Si algo falla, `ROLLBACK` total: la base queda
  intacta. Antes de escribir **revalida bajo lock** que el target siga activo; si una source
  dejó de estarlo, `changes == 0` y se aborta revirtiendo todo.
- **Sin schema nuevo**: no hay tabla, columna ni migración; el vínculo es el `superseded_by`
  existente. El target no se modifica y los nodos no nombrados quedan intactos.
- **`--dry-run`**: devuelve `{ dryRun: true, target, sources, superseded }` sin abrir
  transacción ni escribir. El CLI usa `createReadonlyMemoryEngine` en ese modo (cuyo `merge`
  rechaza cualquier corrida real) para no disparar `PRAGMA journal_mode=WAL` ni migraciones.
- **Merge real por CLI**: usa `createMemoryEngine`, imprime el resultado (texto o `--json`) y
  refresca el working-context con `refreshWorkingContextOnWrite(engine, projectRoot)`,
  derivando `projectRoot` de `resolveMemoryProjectRoot(dbPath)` (no de `process.cwd()`, lo que
  aísla fixtures en tmpdir). Si ese refresh falla, el merge **ya está commiteado**: el comando
  sale con código ≠ 0, dice cuántos nodos se supersedieron hacia qué target y cómo regenerar el
  bloque (`ancleto memory context --out <ruta>`); no revierte la base.

Evidencia: `src/core/memory/engine.js` (`validateMerge`, `merge`, `buildReadonlyEngine`),
`src/cli/index.js` (`memoryMerge`, `requiredMemoryFlag`),
`aspec/specs/memory-ops/spec.md` (requirements "Merge de nodos por supersesión" y
"Comando CLI `ancleto memory merge`").

## Working-context día-cero y render compartido (`token-budget`, archivado)

- **Un único render**: `renderWorkingContextBlock(engine, projectRoot, scope)` en
  `src/core/memory/working-context.js` compone el bloque (topología + reglas activas) y es el
  camino compartido por el refresh de lifecycle, el refresh on-write MCP, el refresh on-write CLI
  y `ancleto memory context`; cada consumidor decide el destino.
  `writeWorkingContextBlock(projectRoot, block)` es el dueño único de la escritura síncrona del
  artefacto; `writeWorkingContext` mantiene la firma con raíz explícita.
- **Día-cero (opción a)**: si **no** existe `.ancleto/memory.db` pero sí `.discovery-map.json`,
  el CLI materializa igual `.ancleto/working-context.md` con el bloque `<ProjectTopology>`
  (creando `.ancleto/` si falta) **sin abrir el motor**. La composición usa `readTopologySummary`
  + `formatTopologyBlock` (exportado por `engine.js`). Sin topología ni reglas, el bloque es
  `null`: no se crea contenido ficticio.
- **Contrato del motor preservado**: `buildWorkingContext` conserva firma y default
  (`scope, maxTokens=MAX_TOKENS, cwd=process.cwd()`) y sigue devolviendo `null` sin topología ni
  reglas; la materialización día-cero vive en la capa CLI. Evidencia: `src/cli/index.js`
  (`refreshWorkingContext`, `memoryContext`), `src/core/memory/working-context.js`,
  `aspec/specs/memory-engine/spec.md`,
  `aspec/changes/archive/2026-10-14-token-budget/specs/memory-engine/spec.md`.

## Procedencia de escritura (`source`, `memory-actor-provenance`, archivado)

- `source` es un atributo de **procedencia runtime-owned**: se resuelve exclusivamente desde
  `context.source || 'runtime'` y **nunca** desde `input` (un `source` forjado en los args se
  ignora, igual que `id`/`status`/`confidence`). Vocabulario estable por superficie de escritura:
  `mcp:ancleto-memory` (tools MCP), `cli:import` (import del CLI), `runtime` (default
  programático) y `agent:<rol>` (solo si un runtime confiable lo provee).
- **Exposición**: se muestra en la lectura de operador (`listNodes`, `ancleto memory list
  --json`), pero **no** en `searchMemory` ni en las firmas JSON Schema de las tools MCP.
- **Frontera auditoría vs enforcement**: la procedencia es **descriptiva**; el motor **no**
  autoriza ni deniega escrituras en base a ella (MCP stdio sin canal de identidad autenticado).
  No hay cambio de schema. Evidencia: `src/core/memory/engine.js` (`recordNode`),
  `src/core/memory/mcp-server.js`, `src/core/memory/tools.js`,
  `aspec/changes/archive/2026-10-05-memory-actor-provenance/`.

## Aviso de overflow accionable (`memory-engine`, archivado 2026-10-26)

`buildWorkingContext` trunca el bloque `<ProjectMemoryRules>` contra
`maxChars = MAX_TOKENS * CHARS_PER_TOKEN` (2.000 tokens × 4 = **8.000 caracteres**) y, cuando
omite reglas, anexa **incondicionalmente** el aviso:

```text
<ContextOverflowWarning>Context truncated due to size limits. N rules omitted. Delegate one
Recall to @memory-keeper with the task topic before delegating any other stage.</ContextOverflowWarning>
```

- **El aviso nombra sólo capacidades que el orquestador tiene.** El texto anterior pedía usar
  la tool `searchMemory`, que el orquestador no expone y tiene prohibido llamar; la versión
  vigente **no la menciona**.
- **Consumidor del aviso: `@orchestrator`.** La sección "Team Memory" de `agents/orchestrator.md`
  declara el `<ContextOverflowWarning>` como trigger inmediato: delegar **exactamente un**
  Recall a `@memory-keeper` con el topic de la tarea **antes** de delegar cualquier otra etapa,
  y no repetirlo para el mismo warning.
- **Lo que no cambió**: la tool `searchMemory` sigue expuesta por el MCP `ancleto-memory` al
  IDE (3 tools, sin cambios de schema); el cambio es del **consumidor**, no del motor.
- **Guardas**: `test/memory-engine.test.js` aserta que el bloque menciona `@memory-keeper` y
  `Recall` y que **no** contiene `searchMemory`; `test/content-guards.test.js` fija el trigger
  y la unicidad del Recall en el contrato del orquestador.
- **Deuda abierta**: cuatro superficies mergeadas (`AGENTS.md`, `PRODUCT.md`,
  `templates/AGENTS.md`, `templates/PRODUCT.md`) siguen dando el consejo viejo de invocar
  `searchMemory` ante el warning. No es un hecho vigente del runtime, pero es lo que los agentes
  del repo reciben hoy. Des-hardcodear ese contrato exige un bloque `LOCKED` y reconciliar el
  texto plano legacy en toda ruta que mergea `TEMPLATES` (`mergeTemplateInto` →
  `reconcileLegacyBlocks`, `src/cli/index.js`). Evidencia: `AGENTS.md`, `PRODUCT.md`,
  `templates/**`, `aspec/specs/prompt-contracts/spec.md`.

## Cierre del pipeline: memoria en un paso (`throughput-pipeline`, archivado)

El change archivado `throughput-pipeline` **no cambia el motor ni el schema**. Ajusta el
**contrato de cierre** en los prompts: el cierre hace **como máximo una** llamada a memoria y
**solo** con candidato real (Automatic Record); sin candidato no se invoca Optional Draft ni se
pide aprobación, y User-Approved Record queda a pedido explícito del usuario. La paralelización
`@documenter` ∥ `@memory-keeper` del cierre escribe en `.ancleto/memory.db` sobre superficie
disjunta del archive. Evidencia: `agents/memory-keeper.md`, `agents/orchestrator.md`,
`aspec/specs/prompt-contracts/spec.md`,
`aspec/changes/archive/2026-10-15-throughput-pipeline/`.

## Refresh on-write en **ambas** superficies (`2026-10-17-memory-cli-writes-refresh-working-context`, archivado)

El bloque `<ProjectMemoryRules>` de `.ancleto/working-context.md` se regenera tras cualquier
escritura que pueda alterarlo, por el **mismo camino único de render**
(`renderWorkingContextBlock` + `writeWorkingContext`):

- **MCP** (`tools.js`): filtrado por `shouldRefreshWorkingContext({ node, superseded })`. Se
  dispara si (a) el nodo entrante es `rule` + scope `project`, **o** (b) hubo supersesión de
  cualquier `memory_key` (cross-type/cross-scope: el over-refresh intencional es aceptable
  porque el único consumidor lee el archivo una vez por sesión).
- **CLI** (`src/cli/index.js`): **`refreshWorkingContextOnWrite(engine, projectRoot, scope)`**
  en `src/core/memory/working-context.js`. Es **compare-based**: renderiza el bloque esperado y
  reescribe el archivo **solo si difiere** del contenido en disco (con `normalizeBlock` que
  tolera CRLF, espacios finales por línea y salto final); no crea un archivo vacío cuando no hay
  nada que inyectar. Reusa la conexión abierta (no abre un segundo engine). Lo invocan
  `memory import` y, desde PR-1, `memory merge` (solo en merge real).
- **Puntos que NO disparan refresh**: `memory export`, `memory list`, `memory doctor` (read-only),
  `memory gc` (purga superseded sin alterar el bloque de reglas activas), `memory snapshot`
  (copia binaria) y `memory merge --dry-run` (no escribe) y `memory context --out` (es el
  destino manual).

Superficies actuales:

| Superficie | Refresca |
|---|---|
| MCP `recordRule`/`recordDecision` (`tools.js`) | sí (filtrado) |
| CLI `memory import` | sí (compare-based; best-effort) |
| CLI `memory merge` (real) | sí (compare-based; falla ⇒ exit ≠ 0, merge ya aplicado) |
| Lifecycle `init`/`install --project`/`upgrade` | sí |
| CLI `memory context --out` | sí (manual) |
| CLI `memory export`/`list`/`doctor`/`gc`/`snapshot`/`merge --dry-run` | no (read-only o sin alterar el bloque) |

## Chequeo de staleness del working-context (`2026-10-17-memory-cli-writes-refresh-working-context`, archivado)

- **`checkWorkingContextFreshness(engine, projectRoot, scope)`** en
  `src/core/memory/working-context.js`: renderiza el bloque esperado con `renderWorkingContextBlock`
  y lo compara (vía `normalizeBlock`) contra el contenido actual de
  `.ancleto/working-context.md`. Devuelve `ok`, `ausente` o `desactualizado`.
- **Read-only**: nunca escribe el archivo. Corregir el staleness es responsabilidad de
  `ancleto memory context --out` (manual) o del refresh on-write (auto).
- **Superficie**: línea advisory `Working-context: <estado>` en `ancleto memory doctor`
  (`memoryDoctorCmd`). El exit code sigue midiendo la integridad de la DB.

Evidencia: `src/core/memory/working-context.js`, `src/cli/index.js` (`memoryImport`,
`memoryMerge`, `memoryDoctorCmd`),
`aspec/changes/archive/2026-10-17-memory-cli-writes-refresh-working-context/`,
`aspec/specs/memory-engine/spec.md`.

## Independencia del entorno de máquina

`.ancleto/machine-env.md` es un artefacto **separado** del working-context: no se mezcla con
`<ProjectMemoryRules>` ni con `AGENTS.md`, no se genera desde la DB y no dispara refreshes de
memoria. `src/core/machine-env.js` es su dueño exclusivo; la memoria no lo lee ni lo escribe.
La sonda de invocabilidad de herramientas (`--version`, acotada) y las llamadas acotadas a
`git` que usa para detectar el EOL viven en ese mismo módulo: son ortogonales al motor de
memoria y no tocan la DB. Evidencia: `src/core/machine-env.js`,
`aspec/specs/machine-environment/spec.md`.

## Flujo

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `searchMemory(query)`: intenta primero FTS5 preciso (AND por términos); si no hay
   resultados, reintenta tolerante (OR con prefijos `*`). El prefijo va dentro del `MATCH`
   porque FTS5 no acepta parámetros en `ORDER BY rank`. Devuelve nodos activos.
3. `recordRule`/`recordDecision`: `recordNode` abre `BEGIN IMMEDIATE`, marca `superseded` el
   nodo activo con la misma `memory_key` e inserta el nuevo. El runtime completa
   `source`/`confidence`/`status`/`id`; el LLM nunca los provee.
4. **Refresh del working-context** — dos caminos sobre el mismo render:
   - (a) **MCP** (`tools.js`): `shouldRefreshWorkingContext(result)`; si aplica,
     `writeWorkingContext(engine, projectRoot)` dentro de `try/catch`.
   - (b) **CLI** (`src/cli/index.js`): tras `engine.importNodes(json)` o tras un `merge` real,
     `refreshWorkingContextOnWrite` re-renderiza y reescribe solo si el bloque cambió.
5. `buildWorkingContext(scope, maxTokens)`: materializa `<ProjectMemoryRules>` (reglas activas,
   scope `project`) y `<ProjectTopology>`; trunca de forma segura con `<ContextOverflowWarning>`
   si excede el presupuesto, y ese aviso **delega un Recall a `@memory-keeper`**.
6. **Mantenimiento**: `memory doctor` audita sin mutar (o repara con `--rebuild`);
   `memory snapshot --out` copia la base con historial; `memory merge` consolida duplicados;
   `memory export|import|gc` mueven y purgan nodos activos.

## Reglas invariantes

- **Una sola activa por `memory_key`** (supersesión atómica; índice único parcial).
- **SSOT del runtime**: `source`/`confidence`/`status`/`id` fuera de los JSON Schema;
  `additionalProperties: false` y args forjados ignorados (anti prompt-injection).
- **FTS5** external content con `content_rowid='rowid'`, tokenizer
  `unicode61 remove_diacritics 1` (sin Porter Stemmer) y triggers INSERT/UPDATE/DELETE.
- **Scopes jerárquicos** `project < feature < task`; default `project`.
- **Solo reglas activas con scope `project`** se inyectan en `<ProjectMemoryRules>`; las
  decisiones `project` se recuperan reactivamente con `searchMemory` — pero **el orquestador no
  la invoca**: delega el Recall en `@memory-keeper`.
- **Raíz del proyecto desde la DB, no desde el cwd**: `resolveMemoryProjectRoot` prioriza el
  primer ancestro con `.ancletorc`; si no, el candidato derivado de `dbPath` con layout
  `.ancleto/`. El refresh es best-effort.
- **Read-only significa sin escritura**: `createReadonlyMemoryEngine` no migra ni toca el WAL;
  lo usan `memory list`, el advisory de `memory doctor` y `memory merge --dry-run`.
- **Doctor no muta por defecto** y **`--rebuild` es el único camino que escribe**; el chequeo
  completo de FTS5 no se puede hacer en read-only.
- **Snapshot no comparte código de escritura con el motor**: fuente read-only + `VACUUM INTO` +
  `quick_check` + reemplazo con backup/restore; nunca `fs.copyFile`.
- **Merge no crea nodos, no transfiere contenido y no cambia el schema**: solo enlaza sources
  activas del mismo `type` al target; es atómico y revalida bajo lock.
- **Export/import/gc/snapshot/merge no agregan dependencias**: solo `node:sqlite` y `node:fs`.
- **El aviso de overflow nombra sólo capacidades existentes**: delega un Recall a
  `@memory-keeper` y no menciona `searchMemory`.
- **Staleness advisory es no bloqueante** (no altera el exit code).
- **`machine-env` es ortogonal**: no se persiste en la DB ni se inyecta en `<ProjectMemoryRules>`.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/memory/database.js` | Conexión (con opción `readonly`), PRAGMAs, migraciones, FTS5. |
| `src/core/memory/engine.js` | `buildWorkingContext` (incluye el `<ContextOverflowWarning>`), `searchMemory`, `recordNode`, `formatTopologyBlock`, `exportActive`, `importNodes`, `gcSuperseded`, `validateMerge`/`merge`, `sanitizePaths`. |
| `src/core/memory/snapshot.js` | `snapshotDatabase`, `vacuumInto`, `verifySnapshot`, `replaceDestination`, `realpathish`/`sameFile`. |
| `src/core/memory/doctor.js` | `memoryDoctor` read-only, `observeWal`, checks `Integridad DB`/`Indice FTS5`/`Reglas activas (unicidad)`/`Checkpoint WAL`, rebuild explícito. |
| `src/core/memory/working-context.js` | `renderWorkingContextBlock`, `writeWorkingContext`/`writeWorkingContextBlock`, `shouldRefreshWorkingContext` (MCP), `refreshWorkingContextOnWrite` (CLI), `checkWorkingContextFreshness`, `normalizeBlock`, `readWorkingContextFile`, `resolveMemoryProjectRoot`, `workingContextPath`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers`, `createMemoryToolkit`, refresh on-write MCP filtrado. |
| `src/core/memory/mcp-server.js` | Transporte MCP stdio. |
| `src/cli/index.js` | `memoryExport`, `memoryImport`, `memoryGc`, `memorySnapshot`, `memoryMerge`, `memoryContext`, `memoryListCmd`, `memoryDoctorCmd`, `memoryCmd`, `requiredMemoryFlag`. |
| `aspec/specs/memory-ops/spec.md` | Contrato de **13 Requirements**: export/import/gc, snapshot, doctor read-only, `--rebuild`, merge, CLI de snapshot/merge y harness golden M01–M10. |
| `aspec/specs/memory-engine/spec.md` | Contrato de día-cero, refresh on-write MCP/CLI, staleness advisory y aviso de overflow accionable. |
| `aspec/changes/archive/2026-10-28-reingenieria-memoria-first/` | Change archivado de PR-1 (proposal, tasks y delta de `memory-ops`; sin `design.md` por decisión del programa). |
| `aspec/changes/archive/2026-10-26-orchestrator-session-start/` | Change archivado del aviso de overflow (delta de `memory-engine` y `prompt-contracts`). |
| `aspec/changes/archive/2026-10-17-memory-cli-writes-refresh-working-context/` | Change archivado con proposal/design/tasks y delta de spec. |
| `aspec/changes/archive/2026-10-14-token-budget/` | Delta de día-cero del working-context. |
| `aspec/changes/archive/2026-10-05-memory-actor-provenance/` | Contrato de procedencia `source` (auditoría vs enforcement). |
| `DESIGN-memory-engine-v0.2.0.md` | Diseño congelado del motor. |
| `agents/orchestrator.md` | Consumidor del `<ContextOverflowWarning>`: delega un único Recall en `@memory-keeper`. |
| `test/memory-engine.test.js`, `test/mcp.test.js`, `test/working-context.test.js`, `test/memory-pr1-contract.test.js`, `test/memory-fixtures.test.js`, `test/fixtures/{seed,golden}.json` | Suite del motor, MCP, working-context, contrato de PR-1 y harness golden M01–M10. |
