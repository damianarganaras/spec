# Tasks: MEM-05b — memory gc mide la antigüedad de supersesión

> Orden: schema → engine → tests. Las tareas de implementación y las de test/validación se pueden
> asignar por separado. Validaciones declaradas: `npm run lint` y `npm test` con rutas explícitas;
> sin formatter (`not-configured`) y sin typecheck.

## 1. Schema aditivo y migración guardada

- [x] 1.1 En `src/core/memory/database.js`, agregar `superseded_at TEXT` al `CREATE TABLE
      memory_nodes` dentro de `MIGRATIONS`, para que una base nueva nazca con la columna.
- [x] 1.2 En `openDatabase`, después de aplicar `MIGRATIONS`, ejecutar la migración aditiva
      guardada: consultar `PRAGMA table_info(memory_nodes)` y ejecutar
      `ALTER TABLE memory_nodes ADD COLUMN superseded_at TEXT` sólo si la columna falta.
- [x] 1.3 En la misma migración guardada, backfillear
      `UPDATE memory_nodes SET superseded_at = created_at WHERE status='superseded' AND
      superseded_at IS NULL`, sin tocar filas `active`.
- [x] 1.4 Confirmar que la migración no agrega tablas, índices, triggers ni vistas: no debe existir
      ningún `CREATE` nuevo fuera del `ALTER TABLE` de la columna.

## 2. Engine: registro del instante y medición por supersesión

- [x] 2.1 En `src/core/memory/engine.js`, cambiar el statement `supersede` a
      `UPDATE memory_nodes SET status='superseded', superseded_by=?, superseded_at=? WHERE id=? AND
      status='active'`, pasando un instante ISO por ejecución.
- [x] 2.2 Propagar el instante en los cuatro llamadores del statement: `recordNode` (`:899`),
      `importNodes` (`:988`), `merge` (`:1119`) y `consolidate` (`:1212`), sin insertar nodos nuevos.
- [x] 2.3 Sacar del constructor de `buildEngine` todo statement que referencie `superseded_at`:
      preparar `supersede` de forma lazy y memoizada (helper interno, p. ej. `getSupersede()`) y
      usarlo desde `recordNode`, `importNodes`, `merge` y `consolidate`; preparar `gcSelect` y
      `gcDelete` dentro de `gcSuperseded`. Cambiar el predicado de ambos a
      `COALESCE(superseded_at, created_at) < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-' || ? || '
      days')`.
- [x] 2.4 Conservar el comportamiento vigente de `gcSuperseded`: `--days` con default 30, dry-run
      sin escritura, `DELETE` en transacción propia, `VACUUM` + `REINDEX` post-commit y exclusión de
      `status='active'`.
- [x] 2.5 Actualizar el comentario de `gcSuperseded` (`:1021-1026`) para que describa la edad de
      supersesión y no el proxy por `created_at`.

## 3. Actualización de los tests que fijan el contrato viejo

- [x] 3.1 En `test/memory-engine.test.js`, actualizar el helper `insertSuperseded` (`:1311-1319`)
      para fijar `superseded_at` junto con `created_at`, de modo que la edad simulada sea la de
      supersesión.
- [x] 3.2 Actualizar los cuatro casos de `describe('gcSuperseded')`: purga por antigüedad de
      supersesión, no toca activos, dry-run reporta sin borrar y default 30 días.
- [x] 3.3 En `test/mcp.test.js` (`:350-364`), reemplazar el caso CLI que dependía de `created_at`
      original: un nodo viejo re-grabado queda superseded con instante reciente y NO debe purgarse;
      para probar el purge, fijar `superseded_at` antiguo directamente en la DB.

## 4. Cobertura nueva

- [x] 4.1 Test: nodo creado hace 40 días y superseded hace 2 días sobrevive a
      `gcSuperseded({ days: 30 })`; nodo superseded hace 40 días se purga.
- [x] 4.2 Test: dry-run y purge real reportan/borran la misma cantidad sobre el mismo estado.
- [x] 4.3 Test: nodos `active` con `created_at` antiguo permanecen intactos y con `superseded_at`
      NULL.
- [x] 4.4 Test: `recordNode` e `importNodes` escriben `superseded_at` en el nodo previo.
- [x] 4.5 Test: `merge` y `consolidate --apply` escriben `superseded_at` en los sources sin insertar
      nodos nuevos.
- [x] 4.6 Test: migración guardada sobre una base creada sin la columna — la columna se agrega, el
      backfill deja `superseded_at = created_at` en filas `superseded`, no toca `active` y
      `sqlite_master` no incorpora objetos nuevos (mismos nombres y tipos; el DDL de `memory_nodes`
      cambia por el `ALTER TABLE` y no cuenta como objeto nuevo).
- [x] 4.7 Test: `openDatabase(dbPath, { migrate:false, readonly:true })` sobre una base previa a la
      columna construye el engine sin error y permite una lectura que no usa gc.

## 5. Documentación y cierre

- [x] 5.1 Actualizar la fila `MEM-05b` de `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` para reflejar
      el cierre y el contrato nuevo (`superseded_at`), sin reescribir el resto de la tabla.

## 6. Validación

- [x] 6.1 Ejecutar `npm run lint`.
- [x] 6.2 Ejecutar los tests con rutas explícitas:
      `node --test test/memory-engine.test.js test/mcp.test.js` (acotado; nunca `node --test` sin
      rutas).
- [x] 6.3 Registrar el format check como `not-configured` (el repo no declara formatter).
