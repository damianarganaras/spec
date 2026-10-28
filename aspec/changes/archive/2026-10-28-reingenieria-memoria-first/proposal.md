# Proposal: Reingeniería memoria-first — PR-1 (snapshot, doctor read-only, merge)

> Change contenedor del programa de reingeniería memoria-first. Este tramo cubre **exclusivamente PR-1**.
> Work Item: no aplica — `.ancletorc` declara `azure.enabled: false`.
> Sin `design.md` por decisión D del programa: el enfoque técnico vive en este proposal y en el delta
> `specs/memory-ops/spec.md`.

## Problem

La memoria del proyecto ya es la fuente de contexto principal, pero su superficie de mantenimiento
todavía no es confiable para operarla:

- `memory doctor` **muta la base** aunque se presente como diagnóstico: abre read-write (lo que dispara
  `PRAGMA journal_mode=WAL`), ejecuta un `INSERT` de `integrity-check` en FTS5, puede reconstruir el
  índice y hace `checkpointDatabase()` (`PRAGMA wal_checkpoint(TRUNCATE)`). Un comando de diagnóstico
  que reescribe el WAL no sirve para auditar ni para correr sobre una copia dudosa.
- No existe una forma de obtener una **copia consistente con historial**. `memory export` sólo exporta
  nodos activos y sanitiza contenido; no sirve para rollback ni para el runbook MEM-01 (P0-2), que
  necesita `superseded_by`.
- No hay forma de **consolidar duplicados**: superseder manualmente varios `memory_key` hacia un target
  requiere SQL a mano, sin transacción ni validación de que el target exista.
- No hay **regresión medible** de la recuperación: las consultas de referencia se evalúan contra la
  memoria viva, que cambia, así que no hay señal estable de que el motor siga recuperando lo mismo.

## Proposed change

Implementar PR-1 del programa memoria-first con cuatro entregables y su evidencia de test:

1. **Snapshot consistente** — `src/core/memory/snapshot.js`: copia atómica vía `VACUUM INTO` (nunca
   `fs.copyFile` del `.db` con WAL activo), con historial incluido, rechazo de `target == source` y
   rechazo de sobrescritura sin pedido explícito.
2. **CLI de snapshot** — `ancleto memory snapshot --out <archivo.db>` como subcomando de la familia
   `memory`; wrapper fino, con `--force` y `--json`, sin tabla ni agente nuevo.
3. **`memory doctor` estrictamente read-only** — por defecto abre `{migrate:false, readonly:true}` y no
   ejecuta checkpoint, DDL ni pragma mutante; el chequeo FTS no mutante detecta desalineación de filas
   entre `memory_fts_docsize` y `memory_nodes`, el check de WAL reporta el estado observable del `-wal` sin
   forzar checkpoint, y `--rebuild` sigue siendo el único camino que escribe.
4. **`memory merge` mínimo** — `ancleto memory merge --dry-run --target <key> --sources <k1,k2,...>`:
   supersede cada source activo hacia un target activo existente, en una sola transacción, reutilizando
   los helpers de supersesión del engine; sin tabla nueva. Tras un merge real refresca el bloque de
   contexto inyectado (`dryRun` no escribe nada).

Más los fixtures y tests que hacen verificable lo anterior (`seed.json` en formato `exportActive()`,
`golden.json` M01–M10, `test/memory-fixtures.test.js`, ampliación de `test/memory-engine.test.js`).

## Alcance del contenedor

Este change es el **contenedor** del programa memoria-first, pero su ejecución es por tramos. Sólo PR-1
es alcance de este change.

Quedan declarados fuera de alcance, sin detallarse: **PR-2** (sección `## Decisiones` en generadores,
contrato de checkpoint), **PR-3** (promoción/backfill, refs obligatorias y fail-closed de refs),
**PR-4** (eliminación de `design.md`/`context.md`), **PR-5** (conformidad sin delta) y el runbook
**MEM-01** (P0-2). Cada tramo se especificará en su propio change.

## Enfoque técnico (reemplaza `design.md`)

- **Snapshot.** Se produce con `VACUUM INTO` sobre una conexión fuente que no migra ni ejecuta checkpoint:
  SQLite escribe un archivo nuevo con el estado comprometido, WAL incluido, y el historial completo
  (`superseded` + `superseded_by`). El destino se valida antes de tocar nada: ruta resuelta distinta de
  la fuente, y destino inexistente salvo sobrescritura explícita. No se reutiliza `memory export` ni se
  cambia su semántica.
- **CLI snapshot.** `memory snapshot` se agrega al dispatch existente junto a `context`, `list`, `doctor`,
  `export`, `import`, `gc`; imprime un resumen legible o `--json`. Nada de servicio intermedio: el
  subcomando es wrapper fino sobre `snapshot.js`.
- **Doctor.** El modo por defecto usa la opción `readonly` que `openDatabase` ya expone. Los cuatro checks
  actuales se conservan con sus nombres. `Indice FTS5` verifica en read-only la alineación de filas
  (`memory_fts_docsize` vs `memory_nodes`), un chequeo no mutante que detecta el fallo más común (trigger de
  indexación removido); el integrity-check completo y la reconstrucción quedan sólo en `--rebuild`.
  `Checkpoint WAL` se reporta omitido pero con el estado observable del `-wal` (existencia y bytes), sin
  ejecutar checkpoint. `--rebuild` conserva el camino de escritura y vuelve a verificar los cuatro checks.
- **Merge.** Método nuevo en el engine que reutiliza el statement `supersede` y el patrón transaccional de
  `recordNode` (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`). No inserta nodos, no acepta contenido, no
  toca el target y no tiene efectos sobre el filesystem. El CLI parsea flags, reporta y es quien refresca el
  bloque de contexto tras un merge real con `refreshWorkingContextOnWrite` (el mismo render que el refresh
  on-write), derivando el destino del directorio de la DB
  (`dirname(resolvedDbPath)/working-context.md`, vía el helper existente
  `resolveMemoryProjectRoot(dbPath)`), no de `process.cwd()`. Con `dryRun` el comando retorna antes de
  escribir cualquier archivo.
- **Fixtures/golden.** El seed usa el formato exacto de `exportActive()` y se siembra con el
  `importNodes` existente (sin loader nuevo). El harness evalúa siempre contra una DB fixture congelada,
  nunca contra la memoria viva, y trata lo no ejecutable como `deferred` con blocker y allowlist
  explícita.

## Scope

In scope:

- `MEM-00` + `MEM-02` en lo que respecta a snapshot, doctor read-only y merge.
- Snapshot con historial, su CLI y la verificación de restauración (T18).
- Doctor read-only con degradación explícita y `--rebuild` como único camino de escritura (T11, T24).
- Diagnóstico read-only de FTS por alineación de filas y reporte del estado observable del `-wal` sin
  checkpoint.
- Merge mínimo con dry-run, validación fail-closed, transacción única, sin tabla nueva y refresco del
  bloque de contexto inyectado tras un merge real; `--json` para consumo estructurado.
- Fixtures `seed.json` / `golden.json`, harness M01–M10 (M01 y M07 ejecutables; 8 diferidas) y tests.

Out of scope:

- Tocar `.ancleto/memory.db` viva. Todos los tests usan fixtures en `tmpdir` con ruta inyectada; no se
  agrega variable de entorno para el path de memoria y `defaultMemoryDbPath()` no cambia.
- Crear `memory maintenance`, tablas, `memory_refs`, agentes, vectores, embeddings, grafo o servicio
  central.
- PR-2, PR-3, PR-4, PR-5 y runbook MEM-01.
- Cambiar la semántica de `memory export` / `import` / `gc`. `import` conserva su LWW hasta P2 (límite
  conocido declarado) y no se corrige en PR-1 la derivación de ruta de su refresh de working-context
  (discrepancia declarada en Risks).
- Editar la spec canónica `aspec/specs/memory-ops/spec.md` en PR-1: el delta vive en el change y se
  sincroniza al archivar.
- Commit, push o merge de git.

## Decisiones

- **D1 — No-mutación de datos (WAL activo y WAL frío).** La propiedad garantizada es "no hubo checkpoint
  ni escritura de datos", no "cero bytes en los tres archivos". Con WAL activo, `.db` y `-wal` SHALL quedar
  idénticos byte a byte, el `-wal` no SHALL bajar de tamaño y el `-shm` sólo puede cambiar su read-mark.
  Sobre una base WAL cerrada limpia, la apertura read-only de SQLite materializa `-shm` y un `-wal` de 0
  bytes: es un límite conocido y verificado del motor de storage, no una violación — no cambia el contenido
  de `.db`, no crea ni borra nodos y queda fijado por un scenario propio. Precedente:
  `aspec/specs/session-failure-report/spec.md:353-357,371` y `test/stats-failures.test.js:90-94`. El probe
  lo confirmó en Node 24 / SQLite 3.51.3 (win32-x64).
- **D2 — Representación del check omitido.** Se preserva la forma `{checks:[{name,ok,detail}],
  healthy, rebuilt}` y los cuatro nombres de check. Un check omitido reporta `ok: true` (semántica: "no se
  detectó falla") más un campo adicional `skipped: true` y un `detail` que dice "omitido: no verificable
  en modo read-only". `healthy` sólo es `false` si algún check tiene `ok: false`, y el exit code no
  cambia. La salida legible distingue el omitido de un check verificado en verde.
- **D3 — Snapshot por `VACUUM INTO`, no copia de archivos.** Garantiza consistencia con WAL sin depender
  de un checkpoint previo e incluye el historial que `memory export` descarta. La sobrescritura es
  explícita (`--force`); `target == source` es error siempre.
- **D4 — Merge reutiliza la supersesión existente.** Un método del engine sobre el statement `supersede`
  dentro de una única `BEGIN IMMEDIATE`; sin `insertNode`, sin contenido nuevo, sin `memory_refs`, sin
  migración (`superseded_by` ya existe; `superseded_at` no se agrega). Se agrega una validación no pedida
  pero necesaria para un plan determinista: las `sources` deben ser únicas. El refresco del bloque de
  contexto inyectado es responsabilidad del **subcomando CLI**, igual que en `import` / `gc` / `recordNode`:
  el método del engine opera sólo sobre la base y no toca el filesystem. El subcomando reutiliza
  `refreshWorkingContextOnWrite` (mismo render que el refresh on-write), con destino derivado del directorio
  de la DB (`dirname(resolvedDbPath)/working-context.md`), no de `process.cwd()`. `dryRun` no escribe nada:
  ni DB ni working-context.
- **D5 — Golden nunca contra memoria viva.** `seed.json` usa el formato de `exportActive()` y se siembra
  con `importNodes`; `golden.json` declara 10 entradas con `status` `active|deferred`, `blocker`
  obligatorio para diferidas y allowlist explícita en el test. Un diferido sin blocker o un set distinto
  al allowlist hace fallar el test; no hay skip silencioso.
- **D6 — Sin `design.md`.** Decisión D del programa: este tramo no genera `design.md` ni `context.md`. El
  diseño queda aquí y en el delta; la spec canónica se sincroniza recién al archivar.
- **D7 — Pulido de la superficie read-only y del merge (G1–G5).**
  - `Indice FTS5` detecta en read-only por **alineación de filas** (`memory_fts_docsize` vs `memory_nodes`):
    es un chequeo no mutante y cubre el fallo más común (trigger de indexación removido); el integrity-check
    completo sigue reservado a `--rebuild`. La cantidad se lee de la tabla sombra porque en FTS5
    external-content `count(*)` sobre la tabla FTS resuelve contra la tabla de contenido y siempre coincide.
  - **R1 — Omitido no es falla, ausente sí.** Un check no verificable por una limitación de esquema se
    reporta omitido (`ok: true` + `skipped: true`), nunca como falla; pero un índice FTS **ausente** sí es
    una falla detectable en read-only (`ok: false`).
  - **R2 — El refresh del bloque no finge éxito.** Si el refresco del bloque derivado falla tras un merge
    real, el comando no finge éxito: el merge queda aplicado, se reporta el bloque desactualizado y cómo
    regenerarlo, y el exit code es distinto de `0`.
  - `Checkpoint WAL` reporta en modo default el **estado observable** del `-wal` (existencia y bytes) y no
    ejecuta checkpoint, porque el diagnóstico no debe forzar la operación que audita.
  - El SQL de snapshot **no se concatena**: la ruta se pasa como parámetro vinculado o se escapa duplicando
    comillas simples, porque un destino con `'` no debe romper el comando ni abrir inyección.
  - `merge` exige **mismo `type`** entre target y sources, porque superseder tipos distintos mezcla
    semánticas y rompe el contrato de la regla que queda activa.
  - `merge` acepta **`--json`** con al menos `dryRun`, `target`, `sources` y `superseded`, para consumo
    determinista por agentes y scripts sin parsear texto, igual que el resto de la familia `memory`.

## Risks

- **Integridad FTS parcialmente verificable en read-only:** la alineación de filas detecta el caso "filas
  desindexadas" (trigger removido, inserción sin indexar), pero no la corrupción interna del índice ni un
  índice desalineado en contenido con el mismo conteo. Mitigación: un índice ausente se reporta como falla
  detectable (`ok: false`), no como omisión, el `detail` aclara que la integridad completa no es
  verificable en read-only, y `--rebuild` es el único camino que ejecuta el integrity-check completo y
  repara.
- **Verificación FTS dependiente de `columnsize`:** leer la cantidad de filas de `memory_fts_docsize`
  depende de la configuración del índice: con `columnsize=0` la tabla sombra no existe o no es consultable
  y la verificación no es ejecutable. Mitigación: los tres estados explícitos —índice ausente ⇒ falla,
  sombra no consultable ⇒ omitido (`ok: true` + `skipped: true`, sin afectar `healthy` ni el exit code),
  consulta posible ⇒ comparación y veredicto— muestran siempre un resultado honesto y distinguible.
- **Sidecars `-shm` / `-wal` dependientes de plataforma/SQLite:** sobre una base WAL fría la apertura
  read-only materializa `-shm` y un `-wal` de 0 bytes. Mitigación: la garantía se enuncia sobre el contenido
  (`db` y `-wal` sin cambios, nodos intactos) y no sobre la ausencia de sidecars; un scenario dedicado fija
  el comportamiento observado y debe fallar si cambia.
- **Sobrescritura de snapshot:** borrar un archivo existente es destructivo. Mitigación: sólo con `--force`
  explícito, `target == source` rechazado siempre y el mensaje nombra la ruta.
- **El refresco escribe un archivo derivado:** un merge real reescribe `.ancleto/working-context.md`.
  Mitigación: el destino se deriva del directorio de la base
  (`dirname(resolvedDbPath)/working-context.md`), no de `process.cwd()`, de modo que las fixtures en
  `tmpdir` se mantienen aisladas y nunca escriben el `.ancleto/` del repositorio; en producción ambas rutas
  coinciden. Discrepancia declarada, no corregida en PR-1: `memory import` refresca desde `process.cwd()`
  (`src/cli/index.js:2347` y `:2354`, vía `refreshWorkingContextOnWrite`) aunque ya existe
  `resolveMemoryProjectRoot(dbPath)` (`src/core/memory/working-context.js:26`); se corrige en un tramo
  posterior sin cambiar la semántica de `import` acá.
- **Deriva del set diferido:** el allowlist del harness falla si cambia el conjunto de diferidas o falta un
  blocker, evitando que M02–M10 se olviden.
- **Locks de WAL en Windows durante los tests:** mitigación: fixtures en `tmpdir`, cierre explícito y
  limpieza best-effort, igual que los tests de memoria existentes.
