---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el working-context (día-cero), el refresh on-write (MCP y CLI), la procedencia source, las ops export/import/gc y el chequeo advisory de staleness"
covers: [motor de memoria, tools, working-context, día-cero, procedencia source, export/import/gc, refresh on-write CLI, staleness advisory]
sources: ["src/core/memory/**"]
generatedAt: 2026-10-26T11:50:00Z
pluginVersion: 0.15.0
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

Retener reglas y decisiones del proyecto entre sesiones de IA, en una base SQLite **local**
(`.ancleto/memory.db`), sin bases vectoriales. Un mismo motor soporta cuatro consumidores:
tools MCP del LLM, subcomandos CLI (incluidas las ops export/import/gc y el chequeo advisory),
el working-context inyectado al system prompt y el doctor. Evidencia: `README.md`,
`DESIGN-memory-engine-v0.2.0.md`, `aspec/specs/memory-ops/spec.md`,
`aspec/specs/memory-engine/spec.md`,
`aspec/changes/archive/2026-10-17-memory-cli-writes-refresh-working-context/`.

## Recorrido relevante

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `recordRule`/`recordDecision` supersede atómicamente por `memory_key` y puede refrescar el
   working-context (filtrado por `shouldRefreshWorkingContext`).
3. `ancleto memory export|import|gc|context|list|doctor` mueven/inspeccionan/purgan/regeneran
   nodos; `memory import` refresca el working-context compare-based;
   `memory doctor` agrega una línea advisory de frescura del working-context.
4. `buildWorkingContext` materializa `<ProjectMemoryRules>`/`<ProjectTopology>` para el prompt.

## Componentes

| Archivo | Rol |
|---|---|
| `src/core/memory/database.js` | Abre la DB (`openDatabase`), PRAGMAs (`WAL`, `foreign_keys`, `busy_timeout=5000`), migraciones idempotentes, FTS5 external-content, triggers, `checkpointDatabase` (merge del WAL). |
| `src/core/memory/engine.js` | Núcleo: `defaultMemoryDbPath`, `createMemoryEngine`, `createReadonlyMemoryEngine`, `buildWorkingContext`, `searchMemory` (BM25, escape FTS5, fallback AND→OR), `recordNode` (procedencia `source`), `listNodes`, `formatTopologyBlock`, `exportActive`, `importNodes`, `gcSuperseded`, `sanitizePaths`, `checkpoint`, `close`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers` (JSON Schema de las 3 tools) y `createMemoryToolkit`; tras `recordNode`, evalúa `shouldRefreshWorkingContext(result)` y, si aplica, llama `writeWorkingContext(engine, projectRoot)` dentro de un `try/catch`. |
| `src/core/memory/mcp-server.js` | `createMemoryServer`/`serveMemoryMcp`: servidor MCP stdio sin dependencias; maneja JSON-RPC, `handle`, `respond`, `fail`. |
| `src/core/memory/doctor.js` | `memoryDoctor`: integridad, detección de inconsistencias FTS5 y rebuild de índice / duplicados de activas. |
| `src/core/memory/working-context.js` | Render único (`renderWorkingContextBlock`) + persistencia (`writeWorkingContext`, `writeWorkingContextBlock`), trigger MCP (`shouldRefreshWorkingContext`), refresh on-write CLI compare-based (`refreshWorkingContextOnWrite`), chequeo de staleness advisory (`checkWorkingContextFreshness`), normalización acotada (`normalizeBlock`, `readWorkingContextFile`), resolución de raíz (`resolveMemoryProjectRoot`, `workingContextPath`); día-cero sin DB desde la topología. |

## Operaciones export / import / gc (`memory-ops-export-import-gc`)

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
- **`ancleto memory doctor [--rebuild]`** → además del chequeo de integridad habitual
  (PRAGMAs, FTS5, duplicados), emite la línea **advisory**
  `Working-context: <ok|ausente|desactualizado>` usando `checkWorkingContextFreshness` con
  `createReadonlyMemoryEngine` (no toca el WAL ni migra). El exit code sigue midiendo la
  integridad de la DB. Cuando no está `ok`, sugiere `ancleto memory context --out` para corregir.
  Evidencia: `src/cli/index.js` (`memoryDoctorCmd`), `src/core/memory/working-context.js`,
  `aspec/specs/memory-engine/spec.md`.
- **`ancleto memory list [--type X] [--scope X] [--all] [--json]`** y
  **`ancleto memory context [--scope X] [--out <archivo>]`** completan la superficie.
  `memory list` es **read-only** (no toca la base); `memory context` materializa
  `.ancleto/working-context.md` por el mismo camino único de render.

## Working-context día-cero y render compartido (`token-budget`, archivado)

- **Un único render**: `renderWorkingContextBlock(engine, projectRoot, scope)` en
  `src/core/memory/working-context.js` compone el bloque (topología + reglas activas) y es el
  camino compartido por el refresh de lifecycle, el refresh on-write MCP, el refresh on-write CLI
  y `ancleto memory context`; cada consumidor decide el destino. `writeWorkingContextBlock(projectRoot, block)`
  es el dueño único de la escritura síncrona del artefacto; `writeWorkingContext` mantiene la
  firma con raíz explícita.
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

## Cierre del pipeline: memoria en un paso (`throughput-pipeline`, archivado)

El change archivado `throughput-pipeline` **no cambia el motor ni el schema**. Ajusta el
**contrato de cierre** en los prompts: el cierre hace **como máximo una** llamada a memoria y
**solo** con candidato real (Automatic Record); sin candidato no se invoca Optional Draft ni se
pide aprobación, y User-Approved Record queda a pedido explícito del usuario. La paralelización
`@documenter` ∥ `@memory-keeper` del cierre escribe en `.ancleto/memory.db` sobre superficie
disjunta del archive, con la misma tooling (MCP `ancleto-memory`). Evidencia:
`agents/memory-keeper.md`, `agents/orchestrator.md`,
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
- **CLI** (`src/cli/index.js` → `memoryImport`): **`refreshWorkingContextOnWrite(engine,
  projectRoot, scope)`** en `src/core/memory/working-context.js`. Es **compare-based**:
  renderiza el bloque esperado y reescribe el archivo **solo si difiere** del contenido en
  disco (con `normalizeBlock` que tolera CRLF, espacios finales por línea y salto final); no
  crea un archivo vacío cuando no hay nada que inyectar. Reusa la conexión abierta (no abre un
  segundo engine). Envuelto en `try/catch` aislado: si el refresh falla, el import igual se
  reporta como exitoso y el fallo se avisa por stderr (mismo criterio de robustez que MCP).
- **Puntos que NO disparan refresh**: `memory export`, `memory list`, `memory doctor` (read-only
  o solo WAL), `memory gc` (purga superseded sin alterar el bloque de reglas activas),
  `memory context --out` (es el destino manual).

Superficies actuales:

| Superficie | Refresca |
|---|---|
| MCP `recordRule`/`recordDecision` (`tools.js`) | sí (filtrado) |
| CLI `memory import` | sí (compare-based; best-effort) |
| Lifecycle `init`/`install --project`/`upgrade` | sí |
| CLI `memory context --out` | sí (manual) |
| CLI `memory export`/`list`/`doctor`/`gc` | no (read-only o sin alterar el bloque) |

## Chequeo de staleness del working-context (`2026-10-17-memory-cli-writes-refresh-working-context`, archivado)

- **`checkWorkingContextFreshness(engine, projectRoot, scope)`** en
  `src/core/memory/working-context.js`: renderiza el bloque esperado con `renderWorkingContextBlock`
  y lo compara (vía `normalizeBlock`, que tolera CRLF, espacios finales por línea y salto final)
  contra el contenido actual de `.ancleto/working-context.md`. Devuelve uno de tres estados:
  `ok` (coincide, o no hay nada que inyectar y el archivo está vacío/ausente),
  `ausente` (hay bloque para inyectar pero el archivo no existe) o
  `desactualizado` (existe y difiere).
- **Read-only**: nunca escribe el archivo. Corregir el staleness es responsabilidad de
  `ancleto memory context --out` (manual) o del refresh on-write (auto).
- **Superficie**: línea advisory `Working-context: <estado>` en `ancleto memory doctor`
  (`memoryDoctorCmd` en `src/cli/index.js`). El exit code sigue midiendo la integridad de la DB;
  el staleness es advisory y **no** lo altera.

Evidencia: `src/core/memory/working-context.js`, `src/cli/index.js` (`memoryImport`,
`memoryDoctorCmd`), `aspec/changes/archive/2026-10-17-memory-cli-writes-refresh-working-context/`,
`aspec/specs/memory-engine/spec.md`.

## Independencia del entorno de máquina

`.ancleto/machine-env.md` es un artefacto **separado** del working-context: no se mezcla con
`<ProjectMemoryRules>` ni con `AGENTS.md`, no se genera desde la DB y no dispara refreshes de
memoria. `src/core/machine-env.js` es su dueño exclusivo; la memoria no lo lee ni lo escribe.
Evidencia: `src/core/machine-env.js`, `aspec/specs/machine-environment/spec.md`.

## Flujo

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `searchMemory(query)`: intenta primero FTS5 preciso (AND por términos); si no hay
   resultados, reintenta tolerante (OR con prefijos `*`). El prefijo va dentro del `MATCH`
   porque FTS5 no acepta parámetros en `ORDER BY rank`. Devuelve nodos activos.
3. `recordRule`/`recordDecision`: `recordNode` abre `BEGIN IMMEDIATE`, marca `superseded` el
   nodo activo con la misma `memory_key` e inserta el nuevo. El runtime completa
   `source`/`confidence`/`status`/`id`; el LLM nunca los provee.
4. **Refresh del working-context** — dos caminos sobre el mismo render:
   - (a) **MCP** (`tools.js`): `shouldRefreshWorkingContext(result)` — (i) el nodo entrante
     es `rule` + scope `project`, **o** (ii) hubo supersesión (cualquier `memory_key` pudo
     retirar del bloque una rule `project`). Si aplica, `writeWorkingContext(engine,
     projectRoot)` dentro de `try/catch`.
   - (b) **CLI** (`src/cli/index.js`): tras `engine.importNodes(json)`, `memoryImport` llama a
     `refreshWorkingContextOnWrite(engine, projectDir)`, que re-renderiza y reescribe solo si
     el bloque cambió (compare-based); reusa la conexión.
5. `buildWorkingContext(scope, maxTokens)`: materializa `<ProjectMemoryRules>` (reglas activas,
   scope `project`) y `<ProjectTopology>`; trunca de forma segura con `<ContextOverflowWarning>`
   si excede el presupuesto.
6. `ancleto memory doctor`: verifica integridad, reconstruye FTS5 y fusiona el WAL para dejar el
   `.db` seguro de copiar. Además emite, de forma **advisory** (no afecta el exit code), la línea
   `Working-context: <ok|ausente|desactualizado>`.

## Reglas invariantes

- **Una sola activa por `memory_key`** (supersesión atómica; índice único parcial).
- **SSOT del runtime**: `source`/`confidence`/`status`/`id` fuera de los JSON Schema;
  `additionalProperties: false` y args forjados ignorados (anti prompt-injection).
- **FTS5** external content con `content_rowid='rowid'`, tokenizer
  `unicode61 remove_diacritics 1` (sin Porter Stemmer) y triggers INSERT/UPDATE/DELETE.
- **Scopes jerárquicos** `project < feature < task`; default `project`.
- **Solo reglas activas con scope `project`** se inyectan en `<ProjectMemoryRules>`; las
  decisiones `project` se recuperan reactivamente con `searchMemory`.
- **Raíz del proyecto desde la DB, no desde el cwd**: `resolveMemoryProjectRoot` prioriza el
  primer ancestro con `.ancletorc`; si no, el candidato derivado de `dbPath` con layout
  `.ancleto/`. El refresh es best-effort.
- Apertura read-only (`createReadonlyMemoryEngine`) para inspección sin migrar ni tocar el WAL
  (la usa `memory list` y `memory doctor` para el chequeo advisory).
- **Refresh on-write MCP y CLI comparten el mismo render y la misma firma**: cualquier
  supersesión o contribución directa dispara la regeneración; en CLI, `import` no abre un
  segundo engine.
- **Export/import/gc no cambian el schema ni agregan dependencias**: solo `node:sqlite`.
- **Staleness advisory es no bloqueante** (no altera el exit code); corregir requiere lifecycle
  point, `memory context --out` o un `import`/`recordRule` posterior.
- **`machine-env` es ortogonal**: no se persiste en la DB ni se inyecta en `<ProjectMemoryRules>`.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/memory/database.js` | Conexión, PRAGMAs, migraciones, FTS5. |
| `src/core/memory/engine.js` | `buildWorkingContext`, `searchMemory`, `recordNode`, `formatTopologyBlock`, `exportActive`, `importNodes`, `gcSuperseded`, `sanitizePaths`. |
| `src/core/memory/working-context.js` | `renderWorkingContextBlock`, `writeWorkingContext`/`writeWorkingContextBlock`, `shouldRefreshWorkingContext` (MCP), `refreshWorkingContextOnWrite` (CLI, compare-based), `checkWorkingContextFreshness`, `normalizeBlock`, `readWorkingContextFile`, `resolveMemoryProjectRoot` (día-cero), `workingContextPath`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers`, `createMemoryToolkit`, refresh on-write MCP filtrado. |
| `src/core/memory/mcp-server.js` | Transporte MCP stdio. |
| `src/cli/index.js` | `memoryExport`, `memoryImport` (con refresh on-write), `memoryGc`, `memoryContext`, `memoryListCmd`, `memoryDoctorCmd` (con advisory), `memoryCmd`. |
| `aspec/specs/memory-engine/spec.md` | Contrato de día-cero, refresh on-write MCP/CLI y chequeo de staleness. |
| `aspec/changes/archive/2026-10-17-memory-cli-writes-refresh-working-context/` | Change archivado con proposal/design/tasks y delta de spec. |
| `aspec/changes/archive/2026-10-14-token-budget/` | Delta de día-cero del working-context. |
| `aspec/changes/archive/2026-10-05-memory-actor-provenance/` | Contrato de procedencia `source` (auditoría vs enforcement). |
| `aspec/specs/memory-ops/spec.md` | Contrato de las ops export/import/gc. |
| `DESIGN-memory-engine-v0.2.0.md` | Diseño congelado del motor. |
| `test/memory-engine.test.js`, `test/mcp.test.js`, `test/working-context.test.js`, `test/cli.test.js` | Suite del motor, MCP, working-context y CLI. |
