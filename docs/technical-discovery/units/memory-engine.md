---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools MCP, el recall BM25-first, las refs, el working-context y las operaciones de memoria"
covers: [motor de memoria, tools MCP, recall BM25-first, refs, secretos, working-context, export/import, gc, snapshot, merge, consolidate, curate, doctor, status, concurrencia]
sources: ["src/core/memory/**", "src/cli/index.js", "AGENTS.md", "aspec/specs/memory-engine/spec.md", "aspec/specs/memory-ops/spec.md", "aspec/changes/archive/2026-11-20-memory-recall-bm25-first/**", "CHANGELOG.md"]
generatedAt: 2026-11-20T17:05:16.811Z
pluginVersion: 0.41.0
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

La memoria del proyecto guarda reglas y decisiones que deben sobrevivir a la sesión y compartirse
con el equipo. Vive en `.ancleto/memory.db` (SQLite nativo + FTS5), no sale del repositorio y se
consume por tools MCP y por subcomandos `memory`. No es la memoria de sesión del agente: una
entrada vive en una sola memoria (`AGENTS.md` → `memory-boundary`).

## Recorrido relevante

### Escritura y supersesión

1. `recordNode(input, context)` valida refs y secretos **antes** de abrir la transacción.
2. Si el contenido es idéntico al nodo activo, es un **no-op total** (no escribe base ni WAL).
3. Si cambia, el nodo activo pasa a `superseded` y se inserta el nuevo con la misma `memory_key`.
4. La procedencia (`source`) la resuelve el runtime, no el caller: `mcp:ancleto-memory`,
   `cli:import`, `runtime` o `agent:<rol>`. Solo `runtime` exime de validar refs.
5. La puerta de criticidad rechaza (exit 2) si la operación supersedería una key de
   `.ancletorc` → `memory.criticalKeys`.
6. Tras una escritura que altera el bloque, se refresca `.ancleto/working-context.md`
   (`shouldRefreshWorkingContext` + `refreshWorkingContextOnWrite`). Un fallo de render propaga en
   merge/consolidate; en import es best-effort; en MCP se absorbe.

### Lectura y recall (BM25-first desde 0.41.0)

- `searchMemory` usa FTS5: intento preciso (AND por términos) y fallback tolerante (OR con
  prefijos) **solo si el primero no devuelve nada**; el alcance del fallback no cambió en 0.41.0.
- **Orden total de recall**: `required` (orden declarado) → `bm25` ascendente → anclaje declarado
  → `scope` (project > feature > task) → `memory_key`. `score` es el bm25 de FTS5 (negativo: mejor
  primero) y es el criterio primario después de las requeridas; anclaje y scope solo desempatan a
  igual score. Se rankea antes de recortar al `limit`, de modo que la página es el prefijo del
  orden total. Evidencia: `src/core/memory/engine.js` (`compareRecall`).
- Modo por defecto: **preview** (prefijo de 239 caracteres + `…`, flag `content_truncated`).
  `expand: true` devuelve el payload completo; `keys: [...]` expande solo claves presentes.
- `required: [...]` promueve keys al frente y falla si no entran en el límite o en el presupuesto.
- Un aviso de overflow lista hasta 40 claves omitidas y resume el resto como `+N`.
- Evidencia: `src/core/memory/engine.js`, `src/core/memory/tools.js`.

### Evidencia de la decisión 0.41.0 (spike)

- Change `memory-recall-bm25-first` archivado en
  `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/`; implementación en el commit
  `cb6592b` y spec promovida a `aspec/specs/memory-engine/spec.md`.
- Medición: 53 rules, 37 queries y 98 pares; nDCG@5 `0.656 → 0.843` y MRR@5 `0.633 → 0.923`
  (`CHANGELOG.md`, `spike/memspike/eval_result.json`, `spike/memspike/tuning.json`).
- **Sin cambio de contrato**: `buildWorkingContext` conserva su orden (scope → anclaje →
  `created_at` desc → key, con las críticas al frente) y su presupuesto (`maxChars` 8000,
  `reserve` 1200, efectivo 6800). `spike/memspike2/measure_result.json` confirma que la réplica y
  la llamada real coinciden en orden (`sameOrder: true`): 11 nodos incluidos, 7/7 críticas.

### Tools MCP

`createMemoryServer` implementa JSON-RPC por stdio y expone `searchMemory`, `recordRule` y
`recordDecision`. El servidor se registra como `ancleto-memory`; `stdout` es el canal JSON-RPC y
los diagnósticos van a `stderr`. Evidencia: `src/core/memory/mcp-server.js`,
`src/core/memory/tools.js`.

### Operaciones

| Operación | Semántica |
| --- | --- |
| `export` | Solo nodos activos; sanea paths absolutos en `content`/`justification` |
| `import` | Valida el archivo completo; upsert por `memory_key`; no reactiva solo-superseded; aborta el batch si una entrada es inválida |
| `import --dry-run` | Clasifica con el mismo simulador que el import real, sin escribir |
| `gc` | Purga superseded por edad de supersesión; dry-run read-only; apply usa `VACUUM`+`REINDEX` best-effort |
| `snapshot` | Copia consistente con `VACUUM INTO`; incluye historial; reemplazo seguro en Windows |
| `merge` | Supersede sources activas hacia un target activo; dry-run default; puerta de criticidad |
| `consolidate` | Agrupa duplicados exactos por `type` + contenido normalizado; dry-run default; near-duplicates solo se reportan |
| `curate` | Reporte read-only de duplicados exactos, refs rotas y no verificables; `--strict` cambia exit |
| `repair refs` | Dry-run default; remueve solo refs verificables con motivo `inexistente`; `--apply` escribe |
| `doctor` | Cinco checks de integridad; read-only salvo `--rebuild` |
| `status` | Estado advisory del gap de memoria; exit 0 en los cuatro estados |

## Reglas, contratos y riesgos

- **Identidad**: `memory_key` es la clave; `type`/`scope` no participan de la identidad de
  supersesión. `createdAt`, `source` y `confidence` no son identidad.
- **Fail-closed**: refs ambiguas o inexistentes rechazan la escritura; la reparación solo remueve
  `inexistente` (allowlist sin default). Un bloque `refs:` múltiple también falla.
- **Secretos**: el rechazo es incondicional y nunca repite el valor detectado.
- **Read-only estricto**: las superficies de lectura abren con `readonly: true` y
  `migrate: false`; leer no crea la base, no migra ni toca el WAL. `hasMemorySchema` es la
  detección canónica de esquema.
- **Concurrencia**: `runImmediateTransaction` usa `BEGIN IMMEDIATE` con tres intentos
  deterministas; la contención agotada se traduce a `MemoryDatabaseBusyError` (`MEMORY_DB_BUSY`).
  Una transacción abierta nunca se re-ejecuta.
- **Migración aditiva**: `superseded_at` se agrega de forma guardada; una base legacy sin la
  columna sigue funcionando y el dry-run de `gc` mide por `created_at` sin migrar.
- **Working-context**: dueño único del render/escritura; la raíz se deriva de `.ancletorc` o de
  la ubicación de la DB, no del cwd. Sin base se renderiza la topología (día-cero); sin topología
  ni reglas no se fabrica contenido. Su orden y presupuesto **no** cambiaron en 0.41.0.
- **Snapshot**: no usa `openDatabase` (fijaría WAL y mutaría la fuente); `VACUUM INTO` lee el estado
  commiteado. En Windows el reemplazo aparta el destino, mueve la copia y restaura el backup si
  falla.
- **Riesgo**: el monolito `src/cli/index.js` orquesta las superficies; el engine debe seguir siendo
  el dueño de SQL e invariantes, y la CLI solo el dueño de la presentación/exit codes.

## Paths clave

| Path | Rol |
| --- | --- |
| `src/core/memory/database.js` | Apertura, WAL, migración aditiva y transacciones |
| `src/core/memory/engine.js` | Motor: record, search/recall, refs, merge, consolidate, gc, import/export |
| `src/core/memory/tools.js` | Handlers de las tools MCP |
| `src/core/memory/mcp-server.js` | Servidor JSON-RPC por stdio |
| `src/core/memory/working-context.js` | Render y persistencia del bloque derivado |
| `src/core/memory/doctor.js` | Cinco checks de integridad |
| `src/core/memory/status.js` | Estado advisory del gap y detección de esquema |
| `src/core/memory/snapshot.js` | Copia consistente de la base |
| `src/core/memory/curation.js` | Curaduría read-only |
| `src/cli/index.js` | Subcomandos `memory`, puerta de criticidad y exit codes |
| `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/spike/**` | Evidencia y medición del recall BM25-first |
| `.ancleto/memory.db` | Base local (no versionada) |
