---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el working-context y sus reglas"
sources: ["src/core/memory/**"]
sourcesSha: 50a0e07371dc4515bd743ae7b609f23b9c0d35a86abbfa35ee58139980696d63
generatedAt: 2026-09-30T14:03:46Z
pluginVersion: 0.7.1
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Responsabilidad

Retener reglas y decisiones del proyecto entre sesiones de IA, en una base SQLite **local**
(`.ancleto/memory.db`), sin bases vectoriales. Un mismo motor soporta tres consumidores:
tools MCP del LLM, subcomandos CLI y el working-context inyectado al system prompt.
Evidencia: `README.md`, `DESIGN-memory-engine-v0.2.0.md`.

## Componentes

| Archivo | Rol |
|---|---|
| `src/core/memory/database.js` | Abre la DB (`openDatabase`), PRAGMAs (`WAL`, `foreign_keys`, `busy_timeout=5000`), migraciones idempotentes, FTS5 external-content, triggers, `checkpointDatabase` (merge del WAL). |
| `src/core/memory/engine.js` | Núcleo: `defaultMemoryDbPath`, `createMemoryEngine`, `createReadonlyMemoryEngine`, `buildWorkingContext`, `searchMemory` (BM25, escape FTS5, fallback AND→OR), `recordNode`, `listNodes`, `checkpoint`, `close`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers` (JSON Schema de `searchMemory`/`recordRule`/`recordDecision`) y `createMemoryToolkit`. |
| `src/core/memory/mcp-server.js` | `createMemoryServer`/`serveMemoryMcp`: servidor MCP stdio sin dependencias; maneja JSON-RPC, `handle`, `respond`, `fail`. |
| `src/core/memory/doctor.js` | `memoryDoctor`: integridad, detección de inconsistencias FTS5 y rebuild de índice / duplicados de activas. |
| `src/core/memory/working-context.js` | Invariante "memoria activa → `working-context.md`": `workingContextPath`, `shouldRefreshWorkingContext`, `resolveMemoryProjectRoot`, `writeWorkingContext`. |

## Flujo

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `searchMemory(query)`: intenta primero una consulta FTS5 precisa (AND por términos); si no
   hay resultados, reintenta tolerante (OR con prefijos `*`). El prefijo `*` va dentro del
   `MATCH` porque FTS5 no acepta parámetros en `ORDER BY rank`. Devuelve nodos activos.
3. `recordRule`/`recordDecision`: `recordNode` abre `BEGIN IMMEDIATE`, marca `superseded` el
   nodo activo con la misma `memory_key` e inserta el nuevo. El runtime completa
   `source`/`confidence`/`status`/`id`; el LLM nunca los provee.
4. **Refresh del working-context**: `shouldRefreshWorkingContext(result)` decide si corresponde
   regenerar el archivo —(a) el nodo entrante es `rule` + scope `project` (alimenta el bloque),
   o (b) hubo supersesión (cualquier `memory_key` pudo retirar del bloque una rule `project`).
   El over-refresh intencional es aceptable porque el único consumidor lee el archivo una vez
   por sesión. `writeWorkingContext` renderiza desde el engine vivo y persiste el `.md`.
5. `buildWorkingContext(scope, maxTokens)`: materializa `<ProjectMemoryRules>` (reglas activas,
   scope `project`) y `<ProjectTopology>`; trunca de forma segura con `<ContextOverflowWarning>`
   si excede el presupuesto. Lo consume `ancleto memory context` y `agents/orchestrator.md`.
6. `ancleto memory doctor`: verifica integridad, reconstruye FTS5 y fusiona el WAL para dejar el
   `.db` seguro de copiar.

## Reglas invariantes

- **Una sola activa por `memory_key`** (supersesión atómica; índice único parcial).
- **SSOT del runtime**: `source`/`confidence`/`status`/`id` fuera de los JSON Schema;
  `additionalProperties: false` y args forjados ignorados (anti prompt-injection).
- **FTS5** external content con `content_rowid='rowid'`, tokenizer
  `unicode61 remove_diacritics 1` (sin Porter Stemmer) y triggers INSERT/UPDATE/DELETE.
- **Scopes jerárquicos** `project < feature < task`; default `project` (un default erróneo
  `repo` dejaba reglas invisibles para `<ProjectMemoryRules>`; se corrigió en v0.6.14).
- **Solo reglas activas con scope `project`** se inyectan en `<ProjectMemoryRules>`; las
  decisiones `project` se recuperan reactivamente con `searchMemory`.
- **Raíz del proyecto desde la DB, no desde el cwd**: `resolveMemoryProjectRoot` prioriza el
  primer ancestro con `.ancletorc`; si no, el candidato derivado de `dbPath` con layout
  `.ancleto/`. El refresh es best-effort (no hay raíz → no escribe).
- Apertura read-only (`createReadonlyMemoryEngine`) para inspección sin migrar ni tocar el WAL.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/memory/database.js` | Conexión, PRAGMAs, migraciones, FTS5. |
| `src/core/memory/engine.js` | `buildWorkingContext`, `searchMemory`, `recordNode`. |
| `src/core/memory/working-context.js` | Persistencia y trigger de refresh del `.md` derivado. |
| `src/core/memory/tools.js` | Contrato JSON Schema de las 3 tools. |
| `src/core/memory/mcp-server.js` | Transporte MCP stdio. |
| `DESIGN-memory-engine-v0.2.0.md` | Diseño congelado del motor. |
| `test/memory-engine.test.js`, `test/mcp.test.js`, `test/working-context.test.js` | Suite del motor, MCP y working-context. |
