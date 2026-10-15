---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el working-context (día-cero), la procedencia source y las ops export/import/gc"
covers: [motor de memoria, tools, working-context, día-cero, procedencia source, export/import/gc]
sources: ["src/core/memory/**"]
sourcesSha: 5a36e6c3622e5ed4b3f411a8ad717d7d743f554a1741b0f12ce5bf7593d1b683
generatedAt: 2026-10-14T22:01:41Z
pluginVersion: 0.11.1
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

Retener reglas y decisiones del proyecto entre sesiones de IA, en una base SQLite **local**
(`.ancleto/memory.db`), sin bases vectoriales. Un mismo motor soporta cuatro consumidores:
tools MCP del LLM, subcomandos CLI (incluidas las ops export/import/gc), el working-context
inyectado al system prompt y el doctor. Evidencia: `README.md`,
`DESIGN-memory-engine-v0.2.0.md`, `aspec/specs/memory-ops/spec.md`.

## Recorrido relevante

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `recordRule`/`recordDecision` supersede atómicamente por `memory_key` y puede refrescar el
   working-context.
3. `ancleto memory export|import|gc` mueven/purgan nodos sin cambiar el schema.
4. `buildWorkingContext` materializa `<ProjectMemoryRules>`/`<ProjectTopology>` para el prompt.

## Componentes

| Archivo | Rol |
|---|---|
| `src/core/memory/database.js` | Abre la DB (`openDatabase`), PRAGMAs (`WAL`, `foreign_keys`, `busy_timeout=5000`), migraciones idempotentes, FTS5 external-content, triggers, `checkpointDatabase` (merge del WAL). |
| `src/core/memory/engine.js` | Núcleo: `defaultMemoryDbPath`, `createMemoryEngine`, `createReadonlyMemoryEngine`, `buildWorkingContext`, `searchMemory` (BM25, escape FTS5, fallback AND→OR), `recordNode` (procedencia `source`), `listNodes`, `formatTopologyBlock`, **`exportActive`, `importNodes`, `gcSuperseded`**, `sanitizePaths`, `checkpoint`, `close`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers` (JSON Schema de las 3 tools) y `createMemoryToolkit`. |
| `src/core/memory/mcp-server.js` | `createMemoryServer`/`serveMemoryMcp`: servidor MCP stdio sin dependencias; maneja JSON-RPC, `handle`, `respond`, `fail`. |
| `src/core/memory/doctor.js` | `memoryDoctor`: integridad, detección de inconsistencias FTS5 y rebuild de índice / duplicados de activas. |
| `src/core/memory/working-context.js` | Render único (`renderWorkingContextBlock`) + persistencia (`writeWorkingContext`, `writeWorkingContextBlock`), trigger de refresh (`shouldRefreshWorkingContext`) y resolución de raíz (`resolveMemoryProjectRoot`, `workingContextPath`); **día-cero** sin DB desde la topología. |

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
- **`ancleto memory gc [--dry-run] [--days N]`** → `gcSuperseded({days, dryRun})`: purga nodos
  `superseded` con antigüedad mayor al umbral (default 30 días). La antigüedad se mide con
  `created_at` como **proxy** (no existe `superseded_at`). Tras el DELETE hace `VACUUM` +
  `REINDEX` post-commit (SQLite no permite `VACUUM` en transacción); si la compactación falla,
  la DB queda consistente. `--dry-run` solo reporta conteo y bytes estimados. Los nodos
  activos nunca se tocan.

## Working-context día-cero y render compartido (`token-budget`)

- **Un único render**: `renderWorkingContextBlock(engine, projectRoot, scope)` en
  `src/core/memory/working-context.js` compone el bloque (topología + reglas activas) y es el
  camino compartido por el refresh de lifecycle y por `ancleto memory context`; cada consumidor
  decide el destino. `writeWorkingContextBlock(projectRoot, block)` es el dueño único de la
  escritura síncrona del artefacto; `writeWorkingContext` mantiene la firma con raíz explícita.
- **Día-cero (opción a)**: si **no** existe `.ancleto/memory.db` pero sí `.discovery-map.json`,
  el CLI materializa igual `.ancleto/working-context.md` con el bloque `<ProjectTopology>`
  (creando `.ancleto/` si falta) **sin abrir el motor**. El bloque de topología no depende de la
  DB ni de reglas. La composición usa `readTopologySummary` + `formatTopologyBlock` (exportado
  por `engine.js`). Sin topología ni reglas, el bloque es `null`: no se crea contenido ficticio.
- **Contrato del motor preservado**: `buildWorkingContext` conserva firma y default
  (`scope, maxTokens=MAX_TOKENS, cwd=process.cwd()`) y sigue devolviendo `null` sin topología ni
  reglas; la materialización día-cero vive en la capa CLI. Evidencia: `src/cli/index.js`
  (`refreshWorkingContext`, `memoryContext`), `src/core/memory/working-context.js`,
  `src/core/memory/engine.js` (`formatTopologyBlock`),
  `aspec/changes/token-budget/specs/memory-engine/spec.md`.

## Procedencia de escritura (`source`, `memory-actor-provenance`)

- `source` es un atributo de **procedencia runtime-owned**: se resuelve exclusivamente desde
  `context.source || 'runtime'` y **nunca** desde `input` (un `source` forjado en los args se
  ignora, igual que `id`/`status`/`confidence`). Vocabulario estable por superficie de escritura:
  `mcp:ancleto-memory` (tools MCP), `cli:import` (import del CLI), `runtime` (default
  programático) y `agent:<rol>` (solo si un runtime confiable lo provee; el rol del LLM no es
  observable y no se registra como verificado).
- **Exposición**: se muestra en la lectura de operador (`listNodes`, `ancleto memory list
  --json`), pero **no** en `searchMemory` ni en las firmas JSON Schema de las tools MCP
  (encapsulamiento preservado).
- **Frontera auditoría vs enforcement**: la procedencia es **descriptiva**; el motor **no**
  autoriza ni deniega escrituras en base a ella (MCP stdio sin canal de identidad autenticado).
  El enforcement de ownership no es sostenible y no se promete. No hay cambio de schema.
  Evidencia: `src/core/memory/engine.js` (`recordNode`), `src/core/memory/mcp-server.js`,
  `src/core/memory/tools.js`, `aspec/changes/archive/2026-10-05-memory-actor-provenance/`.

## Flujo

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `searchMemory(query)`: intenta primero FTS5 preciso (AND por términos); si no hay
   resultados, reintenta tolerante (OR con prefijos `*`). El prefijo va dentro del `MATCH`
   porque FTS5 no acepta parámetros en `ORDER BY rank`. Devuelve nodos activos.
3. `recordRule`/`recordDecision`: `recordNode` abre `BEGIN IMMEDIATE`, marca `superseded` el
   nodo activo con la misma `memory_key` e inserta el nuevo. El runtime completa
   `source`/`confidence`/`status`/`id`; el LLM nunca los provee.
4. **Refresh del working-context**: `shouldRefreshWorkingContext(result)` decide si regenerar
   —(a) el nodo entrante es `rule` + scope `project`, o (b) hubo supersesión (cualquier
   `memory_key` pudo retirar del bloque una rule `project`). El over-refresh intencional es
   aceptable porque el único consumidor lee el archivo una vez por sesión.
5. `buildWorkingContext(scope, maxTokens)`: materializa `<ProjectMemoryRules>` (reglas activas,
   scope `project`) y `<ProjectTopology>`; trunca de forma segura con `<ContextOverflowWarning>`
   si excede el presupuesto.
6. `ancleto memory doctor`: verifica integridad, reconstruye FTS5 y fusiona el WAL para dejar el
   `.db` seguro de copiar.

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
- Apertura read-only (`createReadonlyMemoryEngine`) para inspección sin migrar ni tocar el WAL.
- **Export/import/gc no cambian el schema ni agregan dependencias**: solo `node:sqlite`.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/memory/database.js` | Conexión, PRAGMAs, migraciones, FTS5. |
| `src/core/memory/engine.js` | `buildWorkingContext`, `searchMemory`, `recordNode`, `formatTopologyBlock`, `exportActive`, `importNodes`, `gcSuperseded`, `sanitizePaths`. |
| `src/core/memory/working-context.js` | `renderWorkingContextBlock`, `writeWorkingContext`/`writeWorkingContextBlock`, `shouldRefreshWorkingContext`, `resolveMemoryProjectRoot` (día-cero). |
| `aspec/changes/token-budget/specs/memory-engine/spec.md` | Contrato de día-cero y coherencia documentado↔inyección. |
| `aspec/changes/archive/2026-10-05-memory-actor-provenance/` | Contrato de procedencia `source` (auditoría vs enforcement). |
| `src/core/memory/tools.js` | Contrato JSON Schema de las 3 tools. |
| `src/core/memory/mcp-server.js` | Transporte MCP stdio. |
| `src/cli/index.js` | `memoryExport`, `memoryImport`, `memoryGc`, `memoryCmd`. |
| `aspec/specs/memory-ops/spec.md` | Contrato de las ops export/import/gc. |
| `DESIGN-memory-engine-v0.2.0.md` | Diseño congelado del motor. |
| `test/memory-engine.test.js`, `test/mcp.test.js`, `test/working-context.test.js` | Suite del motor, MCP, ops CLI y working-context. |
