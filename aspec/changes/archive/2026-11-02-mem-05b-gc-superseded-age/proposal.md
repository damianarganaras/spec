# Proposal: MEM-05b — memory gc mide la antigüedad de supersesión

## Origen

Backlog `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`, fila `MEM-05b`. No hay Work Item de Azure
DevOps asociado: este change no declara `Related Work Item`.

## Problem

`gcSuperseded` (`src/core/memory/engine.js:1027-1056`) selecciona y borra con:

```sql
WHERE status='superseded' AND created_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || ? || ' days')
```

(`engine.js:707-713`). `created_at` es la fecha de creación **original** del nodo. Un nodo creado
hace 100 días que se supersede **hoy** queda inmediatamente elegible para borrado físico con el
default de 30 días: la ventana de gracia es inexistente.

No alcanza con un proxy basado en el `created_at` del sucesor: `merge` (`engine.js:1119`) y
`consolidate` (`engine.js:1212`) **no insertan un nodo nuevo**; apuntan `superseded_by` a un canónico
**activo** cuya `created_at` puede ser arbitrariamente vieja. Sólo `recordNode` (`engine.js:899-900`)
e `importNodes` (`engine.js:988-989`) insertan sucesor. Por eso el instante de supersesión debe
registrarse explícitamente.

Contexto normativo vigente que este change modifica deliberadamente:

- `aspec/specs/memory-ops/spec.md:113-121` manda medir la antigüedad con `created_at` como proxy
  "porque `superseded_at` no existe y los cambios de schema están fuera de scope", con Scenario en
  `:123-129`.
- `aspec/specs/memory-ops/spec.md:422-423` dice "NO SHALL requerirse migración de schema;
  `superseded_at` NO SHALL agregarse".
- `aspec/specs/memory-engine/spec.md:544-545` y su Scenario `:566-570` fijan "sin migración de
  schema" y "la lectura de `memory_nodes` conserva su DDL actual" para el contrato de refs.
- El change archivado `2026-11-02-mem-05-recall-task-aware` declaró explícitamente este caso como
  **disparador de reapertura** (`proposal.md:133-137`).

## Proposed change

1. **Columna aditiva `superseded_at TEXT`** en `memory_nodes`, agregada a `MIGRATIONS` para DBs
   nuevas, más una migración aditiva **guardada** para DBs existentes en
   `src/core/memory/database.js`: consultar `PRAGMA table_info(memory_nodes)` y, sólo si falta,
   `ALTER TABLE memory_nodes ADD COLUMN superseded_at TEXT`. No se crean tablas, índices, triggers
   ni vistas: el conjunto de objetos de `sqlite_master` no cambia.
2. **La supersesión registra el instante:** el statement `supersede` (`engine.js:699`) pasa a
   `SET status='superseded', superseded_by=?, superseded_at=?`. Cubre `recordNode`, `importNodes`,
   `merge` y `consolidate` porque todas esas rutas usan el mismo statement.
3. **Backfill conservador:** para filas ya `superseded`, `superseded_at = created_at`. Preserva
   **exactamente** la elegibilidad actual: no hay cambio retroactivo de retención ni crecimiento
   sorpresivo. El fix es forward-looking.
4. **`gc` mide `COALESCE(superseded_at, created_at)`** en **ambos** statements (`gcSelect` para
   dry-run y `gcDelete` para el purge), de modo que dry-run y purge real coinciden. Se conservan
   `--days` (default 30), `VACUUM` + `REINDEX` post-commit y la exclusión de nodos `active`.
5. **Preparación lazy de todo statement que referencia `superseded_at`:** ningún statement con esa
   columna se prepara en el constructor de `buildEngine`. El statement `supersede`
   (`SET status='superseded', superseded_by=?, superseded_at=?`) pasa a prepararse lazy y memoizado
   mediante un helper interno (p. ej. `getSupersede()`), usado por `recordNode`, `importNodes`,
   `merge` y `consolidate`; `gcSelect`/`gcDelete` se preparan dentro de `gcSuperseded`. Así,
   construir un engine con `openDatabase(..., { migrate:false, readonly:true })` sobre una DB vieja
   sin la columna no falla en `buildEngine`, y `memory doctor`/`memory list` siguen funcionando. La
   CLI de `gc` siempre abre el engine de escritura, que migra.
6. **Tests actualizados:** el Scenario vigente y los tests actuales
   (`test/memory-engine.test.js:1310-1375`; `test/mcp.test.js:350-351`) codifican el contrato viejo.
   Pasan a afirmar: un nodo creado hace 40 días pero superseded hace 2 días **sobrevive** a
   `gc({ days: 30 })`; uno superseded hace 40 días se purga; el dry-run cuenta lo mismo que el
   purge; los activos quedan intactos. Los tests fijan `superseded_at` directamente para simular
   edad de supersesión, porque no hay flag de CLI para eso.

## Scope

In scope:

- `src/core/memory/database.js`: columna en `MIGRATIONS`, migración aditiva guardada y backfill.
- `src/core/memory/engine.js`: registro de `superseded_at` en el statement `supersede`, medición
  por `COALESCE(superseded_at, created_at)` y preparación lazy de todo statement que referencia
  `superseded_at` (`supersede`, `gcSelect`, `gcDelete`).
- `test/memory-engine.test.js` y `test/mcp.test.js`: reemplazo del contrato viejo y cobertura nueva.
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`: anotar el cierre de la fila `MEM-05b`.

Non-goals:

- Cambiar el default de `--days`, agregar flags de CLI o tocar la superficie MCP.
- Proxies basados en `superseded_by` (inválidos por `merge`/`consolidate`).
- Crear tablas nuevas, cambiar `memory_key`/ids o alterar `export`/`import`/`listNodes`.
- `inspectRefs` sin captura de I/O, conteo `commit:`/`workitem:`, `memory consolidate` cableado al
  archive, DB canónica por worktree y política de seed: deuda declarada, fuera de alcance.
- Regenerar el technical seed.

## Paths autorizados del change

- `src/core/memory/database.js`
- `src/core/memory/engine.js`
- `test/memory-engine.test.js`
- `test/mcp.test.js`
- `test/memory-fixtures.test.js` (sólo si un assert depende del DDL, `PRAGMA table_info` o
  `sqlite_master`)
- `test/memory-pr1-contract.test.js` (sólo si un assert depende del DDL, `PRAGMA table_info` o
  `sqlite_master`)
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`

## Risks

- **El backfill no otorga gracia retroactiva.** Un nodo histórico superseded hace 100 días sigue
  elegible en el próximo `gc`. Es intencional: preserva la retención actual y evita que la DB crezca
  por una migración. El cambio corrige la semántica hacia adelante.
- **Filas insertadas por fuera del engine pueden quedar con `superseded_at` NULL.** `COALESCE` cae a
  `created_at` y reproduce la semántica vieja para esas filas. No hay caminos de producción que
  inserten nodos sin pasar por el statement compartido; los fixtures de test sí, y deben fijar la
  columna cuando el caso lo requiera.
- **Un engine read-only sobre una DB previa a la columna no puede ejecutar gc.** Ningún statement
  que referencia `superseded_at` se prepara en el constructor de `buildEngine`, así que el engine
  entero se construye y `memory doctor`/`memory list` siguen funcionando; `gc` y las escrituras
  sobre esa DB read-only pueden fallar explícitamente. La CLI de `gc` abre siempre el engine de
  escritura, que migra antes de operar, así que no hay camino de usuario afectado.
- **Los fixtures que comparan el texto DDL completo de `memory_nodes` cambian** por el `ALTER
  TABLE`: el conjunto de objetos de `sqlite_master` no cambia, pero el texto `.sql` de la tabla sí.
  Si alguno rompe, el ajuste pertenece a este change, no a un follow-up.
- **Conflicto normativo resuelto en dos capabilities.** `memory-ops` y `memory-engine` prohibían la
  migración. El delta hace el `MODIFIED` mínimo en ambas; el SHALL de GC vive sólo en
  `memory-ops`.

## Decisiones

- **memory_key:** `gc-superseded-at-columna`
  **Elección:** Registrar el instante de supersesión en una columna aditiva `superseded_at TEXT` de
  `memory_nodes`, con migración guardada por `PRAGMA table_info` para DBs existentes y preparación
  lazy de todo statement que referencia `superseded_at` (`supersede`, `gcSelect`, `gcDelete`).
  **Descartado:** Deducir la fecha de supersesión desde `superseded_by` (o desde el `created_at` del
  sucesor).
  **Justificación:** `merge` y `consolidate` no insertan un nodo sucesor: enlazan a un canónico
  activo cuya `created_at` puede ser arbitrariamente vieja, así que el proxy no existe en dos de
  las cuatro rutas de supersesión. El instante sólo se puede conocer si se persiste al momento de
  escribir. La columna no crea objetos nuevos en `sqlite_master` y la guarda mantiene compatibilidad
  con DBs existentes.
  **Refs:** `change:mem-05b-gc-superseded-age`; `path:src/core/memory/database.js`;
  `path:src/core/memory/engine.js`; `spec:memory-ops#Garbage collection de nodos superseded`
  **Estado:** aprobado

- **memory_key:** `gc-backfill-preserva-elegibilidad`
  **Elección:** Para las filas ya `superseded`, el backfill fija `superseded_at = created_at`.
  **Descartado:** Backfill con el instante de la migración (`now`), que daría 30 días de gracia
  retroactiva a todo el histórico.
  **Justificación:** `created_at` reproduce exactamente la elegibilidad que la base ya tenía: no hay
  cambio retroactivo de retención ni crecimiento sorpresivo de la DB por una migración. La ventana
  de gracia correcta aplica a las supersesiones nuevas, que son las que el bug afecta de aquí en
  adelante.
  **Refs:** `change:mem-05b-gc-superseded-age`; `path:src/core/memory/database.js`;
  `spec:memory-ops#Garbage collection de nodos superseded`
  **Estado:** aprobado
