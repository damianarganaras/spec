# Motor de Memoria Persistente — v0.2.0 (diseño congelado)

> Congelado por el Arquitecto el 2026-09-17 para la v0.2.0. Desviarse de esta
> especificación exige re-abrir la decisión en el BACKLOG. El código del motor NO está
> implementado aún; este documento es la especificación a implementar.

## 1. Entorno

- `engines.node: ">=24.0.0"` en `package.json` — el motor usa el módulo nativo
  `node:sqlite` (`DatabaseSync`).
- Política **Zero-Dependencies** mantenida: sin `better-sqlite3` ni binarios C++ externos.

## 2. Base de datos

- **Ubicación**: `.ancleto/memory.db` — local por repositorio.

### 2.1 Tabla `memory_nodes`

| Columna | Tipo / Regla |
| --- | --- |
| `rowid` | entero (rowid de SQLite) |
| `id` | UUID/ULID, generado por el runtime TS |
| `memory_key` | clave conceptual; UNIQUE sobre nodos `active` |
| `type` | `'rule'` \| `'decision'` |
| `scope` | ámbito del nodo (repo/área) |
| `status` | `'active'` \| `'superseded'` \| `'deleted'` |
| `content` | texto |
| `justification` | texto |
| `superseded_by` | referencia al nodo que lo supersede |
| `source` | gestionado por el runtime TS — nunca por el LLM |
| `confidence` | gestionado por el runtime TS — nunca por el LLM |
| `created_at` | timestamp |

### 2.2 Full-Text Search (FTS5)

- Tabla virtual `memory_fts` enlazada vía `content_rowid`.
- Tokenizer: `unicode61 remove_diacritics 1` — **sin** Porter Stemmer.
- Triggers de sincronización atómica: `INSERT`, `UPDATE`, `DELETE`.

### 2.3 PRAGMAs obligatorias

- `journal_mode = WAL`
- `foreign_keys = ON`
- `busy_timeout = 5000`

## 3. Interfaces y capa de seguridad

- **Tools expuestas al LLM — solo 3**:
  - `searchMemory` — recuperación con BM25.
  - `recordRule` — registra una regla.
  - `recordDecision` — registra una decisión.
- **Encapsulamiento**: `source`, `confidence`, `status` e `id` son gestionados 100% por el
  runtime de TypeScript. **Nunca** aparecen en las firmas JSON Schema de las tools:
  previene prompt injection y elevación de privilegios.
- **Supersesión atómica**: se ejecuta por la clave conceptual `memory_key` en una
  transacción atómica `BEGIN IMMEDIATE` — marca el nodo previo como `superseded` e inserta
  el nuevo. El LLM no gestiona genealogía de IDs.

## 4. Ciclo de vida del contexto (Rules vs Decisions)

- **Rules**: recuperadas **proactivamente** durante `buildWorkingContext()` e inyectadas en
  el System Prompt delimitadas dentro del bloque `<ProjectMemoryRules>`, etiquetadas como
  **datos no confiables**.
- **Decisions**: recuperadas **reactivamente**; el LLM debe usar `searchMemory` cuando
  necesite consultar justificaciones históricas.

## 5. Implicancias para el framework

- Resuelve la decisión pendiente de memoria: motor propio con `node:sqlite` en lugar de
  adaptar a engram/mem0.
- `memory-keeper` deja de apuntar a mem0 / `litellm_mem0-*`.
- El contrato agnóstico de `openspec-recall` (mem0/engram) se revisará al implementar.
- Requiere Node >= 24 en el runtime.