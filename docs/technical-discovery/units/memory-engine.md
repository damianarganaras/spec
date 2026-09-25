---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM y sus reglas"
sources: ["src/core/memory/**"]
sourcesSha: 862bbd38fc41c71c6624a5357ee7e73d65d91c0ba05f3dac11e25ab17142c6c4
generatedAt: 2026-09-25T14:03:34Z
pluginVersion: 0.6.37
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
| `src/core/memory/engine.js` | Núcleo: `defaultMemoryDbPath`, `createMemoryEngine`, `createReadonlyMemoryEngine`, `buildWorkingContext`, `searchMemory` (BM25, escape FTS5, fallback), `recordNode`, `listNodes`, `checkpoint`, `close`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers` (JSON Schema de `searchMemory`/`recordRule`/`recordDecision`) y `createMemoryToolkit`. |
| `src/core/memory/mcp-server.js` | `createMemoryServer`/`serveMemoryMcp`: servidor MCP stdio sin dependencias; maneja JSON-RPC, `handle`, `respond`, `fail`. |
| `src/core/memory/doctor.js` | `memoryDoctor`: integridad, detección de inconsistencias FTS5 y rebuild de índice / duplicados de activas. |

## Flujo

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `searchMemory(query)`: intenta primero una consulta FTS5 precisa (AND por términos); si no
   hay resultados, reintenta tolerante (OR con prefijos `*`). El prefijo `*` va dentro del
   `MATCH` porque FTS5 no acepta parámetros en `ORDER BY rank`. Devuelve nodos activos.
3. `recordRule`/`recordDecision`: `recordNode` abre `BEGIN IMMEDIATE`, marca `superseded` el
   nodo activo con la misma `memory_key` e inserta el nuevo. El runtime completa
   `source`/`confidence`/`status`/`id`; el LLM nunca los provee.
4. `buildWorkingContext(scope, maxTokens)`: materializa `<ProjectMemoryRules>` (reglas activas,
   scope `project`) y `<ProjectTopology>`; trunca de forma segura con `<ContextOverflowWarning>`
   si excede el presupuesto. Lo consume `ancleto memory context` y `agents/orchestrator.md`.
5. `ancleto memory doctor`: verifica integridad, reconstruye FTS5 y fusiona el WAL para dejar el
   `.db` seguro de copiar.

## Reglas invariantes

- **Una sola activa por `memory_key`** (supersesión atómica; índice único parcial).
- **SSOT del runtime**: `source`/`confidence`/`status`/`id` fuera de los JSON Schema;
  `additionalProperties: false` y args forjados ignorados (anti prompt-injection).
- **FTS5** external content con `content_rowid='rowid'`, tokenizer
  `unicode61 remove_diacritics 1` (sin Porter Stemmer) y triggers INSERT/UPDATE/DELETE.
- **Scopes jerárquicos** `project < feature < task`; default `project` (un default erróneo
  `repo` dejaba reglas invisibles para `<ProjectMemoryRules>`; se corrigió en v0.6.14).
- Rules = proactivas (system prompt, datos no confiables); decisions = reactivas (`searchMemory`).
- Apertura read-only (`createReadonlyMemoryEngine`) para inspección sin migrar ni tocar el WAL.

## Paths clave

`src/core/memory/database.js`, `src/core/memory/engine.js`, `src/core/memory/tools.js`,
`src/core/memory/mcp-server.js`, `src/core/memory/doctor.js`,
`DESIGN-memory-engine-v0.2.0.md`, `test/memory-engine.test.js`, `test/mcp.test.js`.
