---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el working-context y las ops export/import/gc"
covers: [motor de memoria, tools, working-context, export/import/gc]
sources: ["src/core/memory/**"]
sourcesSha: c6c49e095b611f0fa4387d9c2555fc2f3d16634fc23c400ed1d1939b122f87d7
generatedAt: 2026-10-06T23:01:00Z
pluginVersion: 0.11.1
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

Retener reglas y decisiones del proyecto entre sesiones de IA, en una base
SQLite **local** (`.ancleto/memory.db`), sin bases vectoriales. Un mismo
motor soporta cuatro consumidores: tools MCP del LLM, subcomandos CLI
(incluidas las ops export/import/gc), el working-context inyectado al system
prompt y el doctor. Evidencia: `README.md`,
`DESIGN-memory-engine-v0.2.0.md`, `aspec/specs/memory-ops/spec.md`.

## Recorrido relevante

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3
   tools al IDE.
2. `recordRule`/`recordDecision` superseden atómicamente por `memory_key` y
   pueden refrescar el working-context.
3. `ancleto memory export|import|gc` mueven/purgan nodos sin cambiar el
   schema.
4. `buildWorkingContext` materializa `<ProjectMemoryRules>`/
   `<ProjectTopology>` para el prompt.

## Componentes

| Archivo | Rol |
|---|---|
| `src/core/memory/database.js` | Abre la DB (`openDatabase`), PRAGMAs (`WAL`, `foreign_keys`, `busy_timeout=5000`), migraciones idempotentes, FTS5 external-content, triggers, `checkpointDatabase` (merge del WAL). |
| `src/core/memory/engine.js` | Núcleo: `defaultMemoryDbPath`, `createMemoryEngine`, `createReadonlyMemoryEngine`, `buildWorkingContext`, `searchMemory` (BM25, escape FTS5, fallback AND→OR), `recordNode`, `listNodes`, `exportActive`, `importNodes`, `gcSuperseded`, `sanitizePaths`, `tokenize`, `publicNode`, `formatTopologyBlock`, `checkpoint`, `close`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers` (JSON Schema de las 3 tools) y `createMemoryToolkit`. |
| `src/core/memory/mcp-server.js` | `createMemoryServer`/`serveMemoryMcp`: servidor MCP stdio sin dependencias; maneja JSON-RPC, `handle`, `respond`, `fail`. |
| `src/core/memory/doctor.js` | `memoryDoctor`: integridad, detección de inconsistencias FTS5 y rebuild de índice / duplicados de activas. |
| `src/core/memory/working-context.js` | Invariante "memoria activa → `working-context.md`": `workingContextPath`, `shouldRefreshWorkingContext`, `resolveMemoryProjectRoot`, `writeWorkingContext`. |

## Operaciones export / import / gc (`memory-ops-export-import-gc`)

Expuestas como subcomandos del grupo `memory`:

- **`ancleto memory export [--out <archivo>]`** → `exportActive()`: array
  JSON de nodos activos con `{memory_key, type, content, justification,
  scope, createdAt}`. Los superseded no se incluyen. Antes de serializar,
  `sanitizePaths` reemplaza paths absolutos (Windows `C:\...`, Unix
  `/home/...`, `/Users/...`) por `<redacted>`. Sin `--out` va a stdout.
- **`ancleto memory import <archivo>`** → `importNodes(json)`: valida el
  schema de cada entrada y **aborta el batch completo** si alguna es
  inválida. Upsert por `memory_key`: inserta si no existe (con el
  `createdAt` del JSON); si existe activo, supersede solo cuando el
  `createdAt` del JSON es más reciente (empate/no más nuevo = no-op →
  idempotente); si existe superseded, lo saltea (los superseded **no se
  reactivan**). Reporta insertados/actualizados/omitidos.
- **`ancleto memory gc [--dry-run] [--days N]`** → `gcSuperseded({days,
  dryRun})`: purga nodos `superseded` con antigüedad mayor al umbral
  (default 30 días). La antigüedad se mide con `created_at` como **proxy**
  (no existe `superseded_at`). Tras el DELETE hace `VACUUM` + `REINDEX`
  post-commit (SQLite no permite `VACUUM` en transacción); si la
  compactación falla, la DB queda consistente. `--dry-run` solo reporta
  conteo y bytes estimados. Los nodos activos nunca se tocan.

## Flujo

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3
   tools al IDE.
2. `searchMemory(query)`: intenta primero FTS5 preciso (AND por términos);
   si no hay resultados, reintenta tolerante (OR con prefijos `*`). El
   prefijo va dentro del `MATCH` porque FTS5 no acepta parámetros en
   `ORDER BY rank`. Devuelve nodos activos.
3. `recordRule`/`recordDecision`: `recordNode` abre `BEGIN IMMEDIATE`,
   marca `superseded` el nodo activo con la misma `memory_key` e inserta
   el nuevo. El runtime completa `source`/`confidence`/`status`/`id`; el
   LLM nunca los provee.
4. **Refresh del working-context**: `shouldRefreshWorkingContext(result)`
   decide si regenerar —(a) el nodo entrante es `rule` + scope `project`,
   o (b) hubo supersesión (cualquier `memory_key` pudo retirar del bloque
   una rule `project`). El over-refresh intencional es aceptable porque
   el único consumidor lee el archivo una vez por sesión.
5. `buildWorkingContext(scope, maxTokens)`: materializa
   `<ProjectMemoryRules>` (reglas activas, scope `project`) y
   `<ProjectTopology>`; trunca de forma segura con
   `<ContextOverflowWarning>` si excede el presupuesto.
6. `ancleto memory doctor`: verifica integridad, reconstruye FTS5 y
   fusiona el WAL para dejar el `.db` seguro de copiar.

## Reglas invariantes

- **Una sola activa por `memory_key`** (supersesión atómica; índice único
  parcial).
- **SSOT del runtime**: `source`/`confidence`/`status`/`id` fuera de los
  JSON Schema; `additionalProperties: false` y args forjados ignorados
  (anti prompt-injection).
- **FTS5** external content con `content_rowid='rowid'`, tokenizer
  `unicode61 remove_diacritics 1` (sin Porter Stemmer) y triggers
  INSERT/UPDATE/DELETE.
- **Scopes jerárquicos** `project < feature < task`; default `project`.
- **Solo reglas activas con scope `project`** se inyectan en
  `<ProjectMemoryRules>`; las decisiones `project` se recuperan
  reactivamente con `searchMemory`.
- **Raíz del proyecto desde la DB, no desde el cwd**:
  `resolveMemoryProjectRoot` prioriza el primer ancestro con `.ancletorc`;
  si no, el candidato derivado de `dbPath` con layout `.ancleto/`. El
  refresh es best-effort.
- Apertura read-only (`createReadonlyMemoryEngine`) para inspección sin
  migrar ni tocar el WAL.
- **Export/import/gc no cambian el schema ni agregan dependencias**:
  solo `node:sqlite`.

## Cambios archivados que tocaron este módulo

- `2026-10-02-memory-ops-export-import-gc` (M1+M2): `exportActive`,
  `importNodes`, `gcSuperseded` y `sanitizePaths`. Spec:
  `aspec/specs/memory-ops/spec.md`.
- `2026-10-05-memory-actor-provenance` (B5 del backlog): autor/procedencia
  en el campo `source` (runtime-owned, vocabulario controlado: `mcp:
  ancleto-memory`, `cli:import`, `tool:recordRule`, `tool:recordDecision`,
  `runtime`, `agent:<rol>` solo si el runtime lo provee). Archivado y
  respaldado por un delta sobre `aspec/specs/memory-engine/spec.md`; el
  contrato del motor no cambia de esquema.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/memory/database.js` | Conexión, PRAGMAs, migraciones, FTS5. |
| `src/core/memory/engine.js` | `buildWorkingContext`, `searchMemory`, `recordNode`, `exportActive`, `importNodes`, `gcSuperseded`, `sanitizePaths`, `tokenize`. |
| `src/core/memory/working-context.js` | Persistencia y trigger de refresh del `.md` derivado. |
| `src/core/memory/tools.js` | Contrato JSON Schema de las 3 tools. |
| `src/core/memory/mcp-server.js` | Transporte MCP stdio. |
| `src/cli/index.js` | `memoryExport`, `memoryImport`, `memoryGc`, `memoryCmd`. |
| `aspec/specs/memory-ops/spec.md` | Contrato de las ops export/import/gc. |
| `aspec/specs/memory-engine/spec.md` | Contrato del motor (incluye delta de actor/procedencia). |
| `DESIGN-memory-engine-v0.2.0.md` | Diseño congelado del motor. |
| `test/memory-engine.test.js`, `test/mcp.test.js`, `test/working-context.test.js` | Suite del motor, MCP, ops CLI y working-context. |