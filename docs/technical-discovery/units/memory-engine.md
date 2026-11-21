---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, el recall BM25-first, el presupuesto configurable del working-context, la validación del import, las tools MCP, las refs y las operaciones de memoria"
covers: [motor de memoria, tools MCP, recall BM25-first, presupuesto del working-context, validación de import, refs, secretos, export/import, gc, snapshot, merge, consolidate, curate, doctor, status, concurrencia]
sources: ["src/core/memory/**", "src/cli/index.js", "aspec/changes/archive/2026-11-20-memory-import-scope-string/**", "aspec/changes/archive/2026-11-20-memory-working-context-budget/**", "aspec/changes/archive/2026-11-20-memory-recall-bm25-first/**", "aspec/specs/memory-engine/spec.md", "aspec/specs/memory-ops/spec.md", "aspec/specs/prompt-contracts/spec.md", "CHANGELOG.md"]
generatedAt: 2026-11-21T05:55:56.128Z
pluginVersion: 0.43.1
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

La memoria del proyecto guarda reglas y decisiones que deben sobrevivir a la sesión y compartirse
con el equipo. Vive en `.ancleto/memory.db` (SQLite nativo + FTS5), no sale del repositorio y se
consume por tools MCP y por subcomandos `memory`. No es la memoria de sesión del agente: una
entrada vive en una sola memoria (`AGENTS.md` → `memory-boundary`). El working-context derivado
inyecta reglas y topología en cada sesión; desde 0.42.0 su tamaño es configurable y desde 0.43.0
el import valida `scope` como string. La release 0.43.1 **no** cambia este motor: es test + spec
(matriz de hosts), sin alteraciones de runtime, schema ni contrato de memoria.

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

### Import y su validación (0.43.0)

1. `validateImportEntries(json)` recorre todas las entradas antes de cualquier procesamiento:
   exige `memory_key`, `type` (`rule`|`decision`), `content`, `scope` y `createdAt` presentes y no
   nulos/vacíos, y `createdAt` parseable.
2. **`scope` debe ser string con `trim()` no vacío**. Un número, booleano, objeto, array o string
   de sólo espacios se rechaza con `entry[i].scope invalido: <valor> (se esperaba un string no
   vacio)`; `null`/ausente/`""` se reporta como campo obligatorio faltante. El mensaje formatea el
   valor crudo con `formatRawValue`, que nunca lanza (ni con `BigInt`, ciclos o
   `Symbol.toPrimitive` defectuoso).
3. **Sin coerción**: el valor aceptado se persiste tal cual; no se restringe a un vocabulario
   cerrado (`global` es válido), igual que `recordNode`.
4. `importNodes` aplica la validación antes de la transacción; `classifyImport` (dry-run) usa la
   misma función, así que un archivo inválido aborta entero en ambos caminos, sin clasificación
   parcial.
5. El write del CLI pre-valida con la misma función y reporta `ancleto: import invalido: …`
   (exit 1) **antes** de abrir o crear la base, en lugar de escapar como stack.

Evidencia: `src/core/memory/engine.js` (`validateImportEntries`, `formatRawValue`,
`classifyImport`, `importNodes`), `src/cli/index.js` (`memoryImport`), `CHANGELOG.md` (0.43.0,
publicada: tag `v0.43.0` → `9a7220c`, run `44827344442`, npm `latest`).

### Lectura y recall (BM25-first desde 0.41.0)

- `searchMemory` usa FTS5: intento preciso (AND por términos) y fallback tolerante (OR con
  prefijos) **solo si el primero no devuelve nada**.
- **Orden total de recall**: `required` (orden declarado) → `bm25` ascendente → anclaje declarado
  → `scope` (project > feature > task) → `memory_key`. `score` es el bm25 de FTS5 (negativo: mejor
  primero) y es el criterio primario después de las requeridas; anclaje y scope solo desempatan a
  igual score. Se rankea antes de recortar al `limit`, de modo que la página es el prefijo del
  orden total. Evidencia: `src/core/memory/engine.js` (`compareRecall`).
- Modo por defecto: **preview** (prefijo de hasta 240 caracteres, flag `content_truncated`).
  `expand: true` devuelve el payload completo; `keys: [...]` expande solo claves presentes.
- `required: [...]` promueve keys al frente y falla si no entran en el límite o en el presupuesto.
- Un aviso de overflow lista hasta 40 claves omitidas y resume el resto como `+N`.

### Presupuesto del working-context (0.42.0)

- **Dueño de la resolución**: `src/core/memory/working-context.js` →
  `resolveWorkingContextMaxTokens(projectRoot)`, junto a la lectura de `memory.criticalKeys`. El
  engine conserva un default de 4000 tokens para llamadas directas, pero **no lee `.ancletorc`**.
- **Precedencia**: `ANCLETO_WORKING_CONTEXT_TOKENS` (definida y no vacía) →
  `memory.maxTokens` de `.ancletorc` → default **4000 tokens**. Un env definido e inválido resuelve
  al default y **no** cae a `.ancletorc` (es un override explícito).
- **Aritmética**: `maxChars = maxTokens × CHARS_PER_TOKEN`, con `CHARS_PER_TOKEN = 4` (16.000
  caracteres por default). Antes de cortar reglas se reserva para el aviso
  `min(1500, 15% de maxChars)`, acotado a `maxChars`.
- **Gramática tolerante**: entero positivo; `0` o `"unlimited"` desactivan el tope. Todo lo demás
  (vacío, `null`, negativo, decimal, no numérico, tipo inesperado, sin `.ancletorc`) resuelve al
  default de 4000. La lectura nunca lanza ni impide el render.
- **Modo sin tope**: el resolver entrega `Infinity` como centinela explícito; el render incluye
  todas las reglas activas del scope, **no** emite `<ContextOverflowWarning>` ni el aviso por
  consola, y no pasa por el piso estructural. `null`/`undefined` no son “sin tope”: se normalizan
  al default finito (`isUnlimitedWorkingContext`).
- **`required` sigue fail-closed**: las `criticalKeys` se resuelven antes del corte y una regla
  requerida que no entra falla con error diagnóstico; nunca se omite en silencio. El aviso de
  overflow lista solo reglas no requeridas omitidas.
- **Superficies**: refresh on-write, `memory context --out`, chequeo de frescura y MCP comparten
  `renderWorkingContextBlock`, así que resuelven el mismo presupuesto y son determinísticos para
  configuración, entorno y BD fijos. Un cambio de configuración puede dejar el artefacto
  `desactualizado` hasta el próximo refresh.
- **Motivación y evidencia**: con el presupuesto anterior (2.000 tokens / 8.000 chars) entraban
  11/50 reglas activas; las 7/7 críticas ya estaban pinneadas y las “viejas-25%” quedaban 0/11. El
  nuevo default duplica el techo y es reversible con `memory.maxTokens` o el entorno. Change
  `memory-working-context-budget` archivado en
  `aspec/changes/archive/2026-11-20-memory-working-context-budget/`; deltas promovidos a
  `aspec/specs/memory-engine/spec.md` y `aspec/specs/prompt-contracts/spec.md`; release publicado
  en `0.42.0` (tag `v0.42.0` → `c6319c8`, run `44808502480`, npm `latest`).

### Evidencia de la decisión 0.41.0 (spike)

- Change `memory-recall-bm25-first` archivado en
  `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/`; incluye los spikes `memspike`
  (extracción, rankers, tuning, contexto) y `memspike2` (medición de la réplica y la llamada
  real). La implementación quedó en el motor y la spec se promovió a
  `aspec/specs/memory-engine/spec.md`.
- Medición: 53 rules, 37 queries y 98 pares; nDCG@5 `0.656 → 0.843` y MRR@5 `0.633 → 0.923`
  (`spike/memspike/eval_result.json`, `spike/memspike/tuning.json`).
- La release que contiene ese cambio es `0.41.0` (tag `v0.41.0` sobre `5c171bc`, run
  `44781865327`, `latest` en npm). El presupuesto del working-context **no** cambió en 0.41.0;
  cambia en 0.42.0.

### Tools MCP

`createMemoryServer` implementa JSON-RPC por stdio y expone `searchMemory`, `recordRule` y
`recordDecision`. El servidor se registra como `ancleto-memory`; `stdout` es el canal JSON-RPC y
los diagnósticos van a `stderr`. Evidencia: `src/core/memory/mcp-server.js`,
`src/core/memory/tools.js`.

### Operaciones

| Operación | Semántica |
| --- | --- |
| `export` | Solo nodos activos; sanea paths absolutos en `content`/`justification` |
| `import` | Valida el archivo completo (incluido `scope` string) antes de la transacción; upsert por `memory_key`; no reactiva solo-superseded; aborta el batch si una entrada es inválida |
| `import --dry-run` | Clasifica con el mismo validador y simulador que el import real, sin escribir |
| `gc` | Purga superseded por edad de supersesión; dry-run read-only; apply usa `VACUUM`+`REINDEX` best-effort |
| `snapshot` | Copia consistente con `VACUUM INTO`; incluye historial; reemplazo seguro en Windows |
| `merge` | Supersede sources activas hacia un target activo; dry-run default; puerta de criticidad |
| `consolidate` | Agrupa duplicados exactos por `type` + contenido normalizado; dry-run default; near-duplicates solo se reportan |
| `curate` | Reporte read-only de duplicados exactos, refs rotas y no verificables; `--strict` cambia exit |
| `repair refs` | Dry-run default; remueve solo refs verificables con motivo `inexistente`; `--apply` escribe |
| `doctor` | Cinco checks de integridad + frescura advisory del working-context; read-only salvo `--rebuild` |
| `status` | Estado advisory del gap de memoria; exit 0 en los cuatro estados |

## Reglas, contratos y riesgos

- **Identidad**: `memory_key` es la clave; `type`/`scope` no participan de la identidad de
  supersesión. `createdAt`, `source` y `confidence` no son identidad.
- **Validación de import**: un solo dueño (`validateImportEntries`), compartido por import,
  dry-run y pre-check del CLI; endurecerla no cambia la semántica de upsert ni el shape persistido
  (`memory-engine` lo declara explícitamente).
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
- **Working-context**: dueño único del render/escritura y de la resolución del presupuesto; la
  raíz se deriva de `.ancletorc` o de la ubicación de la DB, no del cwd. Sin base se renderiza la
  topología (día-cero); sin topología ni reglas no se fabrica contenido.
- **Presupuesto**: un valor inválido cae al default sin lanzar; un valor muy chico puede omitir
  reglas no requeridas (con aviso); `unlimited` no emite aviso y puede volcar todo el corpus. El
  tope de 5 reglas/1.500 bytes del campo destilado de `prompt-contracts` es independiente y no se
  compone con este presupuesto.
- **Snapshot**: no usa `openDatabase` (fijaría WAL y mutaría la fuente); `VACUUM INTO` lee el estado
  commiteado. En Windows el reemplazo aparta el destino, mueve la copia y restaura el backup si
  falla.
- **Riesgo**: el monolito `src/cli/index.js` orquesta las superficies; el engine debe seguir siendo
  el dueño de SQL e invariantes, y la CLI solo el dueño de la presentación/exit codes.

## Paths clave

| Path | Rol |
| --- | --- |
| `src/core/memory/database.js` | Apertura, WAL, migración aditiva y transacciones |
| `src/core/memory/engine.js` | Motor: record, search/recall, `validateImportEntries`, `buildWorkingContext`, refs, merge, consolidate, gc, import/export |
| `src/core/memory/working-context.js` | Render, persistencia, frescura y resolución del presupuesto |
| `src/core/memory/tools.js` | Handlers de las tools MCP |
| `src/core/memory/mcp-server.js` | Servidor JSON-RPC por stdio |
| `src/core/memory/doctor.js` | Cinco checks de integridad |
| `src/core/memory/status.js` | Estado advisory del gap y detección de esquema |
| `src/core/memory/snapshot.js` | Copia consistente de la base |
| `src/core/memory/curation.js` | Curaduría read-only |
| `src/cli/index.js` | Subcomandos `memory`, pre-validación del import, puerta de criticidad y exit codes |
| `.ancletorc` | Configuración de proyecto: `memory.maxTokens` y `memory.criticalKeys` (valores omitidos) |
| `aspec/changes/archive/2026-11-20-memory-import-scope-string/**` | Evidencia y delta del `scope` string en el import |
| `aspec/changes/archive/2026-11-20-memory-working-context-budget/**` | Evidencia y contrato del presupuesto configurable |
| `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/spike/**` | Evidencia y medición del recall BM25-first |
| `.ancleto/memory.db` | Base local (no versionada) |
