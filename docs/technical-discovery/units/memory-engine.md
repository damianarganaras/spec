---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el recall task-aware, la validación de refs, el working-context, las ops export/import/gc, snapshot, merge, consolidate, curate y doctor"
covers: [motor de memoria, tools MCP, recall, preview, expand, keys, required, refs, secretos, working-context, export/import, gc, snapshot, merge, consolidate, curate, doctor]
sources: ["src/core/memory/**"]
generatedAt: 2026-11-04T17:02:55Z
pluginVersion: 0.18.12
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

Persistir las reglas y decisiones del proyecto en `.ancleto/memory.db` (SQLite + FTS5 vía
`node:sqlite`) y exponerlas a los agentes como contexto inyectable y como tools MCP. La memoria es
local al repositorio, versionable con el equipo y separada de la memoria de sesión del agente.

## Recorrido relevante

### Escritura y supersesión

- `createMemoryEngine(dbPath)` abre en escritura, aplica `journal_mode=WAL` y migraciones aditivas
  (`database.js`); `createReadonlyMemoryEngine` abre sin migrar ni escribir.
- `recordNode(input, context)` valida refs y secretos **antes** de abrir transacción, resuelve
  `source` desde `context` (nunca del caller) y supersede por `memory_key` sin filtrar `type`/`scope`.
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

## Reglas, contratos y riesgos

- **`memory_key` es identidad transversal**: una nueva versión supersede la anterior; los nodos
  superseded quedan como historia y no se reactivan al importar.
- **Fail-closed**: una ref inválida, un bloque `refs:` múltiple o un secreto rechazan la escritura
  completa; no se escribe parcialmente.
- **Read-only por defecto**: `list`, `doctor`, `curate` y `consolidate` sin `--apply` no migran ni
  escriben. `no-db` nunca se reporta como reporte limpio.
- **`source` no es forjable**: un `source` en los args del caller se ignora; lo resuelve el runtime.
- **Riesgo de presupuesto**: una requerida no se trunca ni se degrada al aviso; si no entra, falla
  con diagnóstico (key + ruta de refs resueltas).
- **Riesgo de consistencia**: `merge`/`consolidate` revalidan bajo lock y abortan si el target dejó
  de estar activo; `gc` usa un cutoff único para SELECT y DELETE.
- **MCP**: `src/core/memory/mcp-server.js` expone `searchMemory`, `recordRule` y `recordDecision`
  por stdio; stdout es el canal JSON-RPC y los avisos van a stderr.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/memory/engine.js` | Núcleo: recall, refs, supersesión, ops, consolidate |
| `src/core/memory/database.js` | Apertura, migraciones aditivas, checkpoint WAL |
| `src/core/memory/tools.js` | Handlers de `searchMemory`/`recordRule`/`recordDecision` |
| `src/core/memory/mcp-server.js` | Servidor MCP stdio |
| `src/core/memory/working-context.js` | Render, refresh y frescura del bloque |
| `src/core/memory/doctor.js` | Diagnóstico read-only y rebuild FTS5 |
| `src/core/memory/curation.js` | Curaduría read-only de refs y duplicados |
| `src/core/memory/snapshot.js` | Copia consistente con historial |
| `docs/technical-discovery/decisions.md` | Reglas de memoria y frontera repo/agente |
