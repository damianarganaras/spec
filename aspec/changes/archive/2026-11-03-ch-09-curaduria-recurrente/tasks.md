# Tasks: CH-09 — Curaduría recurrente read-only de refs y duplicados

> Implementación y tests quedan en fases separadas; cada fase es verificable por sí sola.

## Fase 1 — Módulo `src/core/memory/curation.js`

- [x] Crear `src/core/memory/curation.js` como módulo puro que exporta una única función de
      reporte; no abre conexiones ni escribe archivos.
- [x] Componer la clasificación de refs con `resolveNodeRefs`; no agregar parser,
      gramática ni resolvedor propios. `inspectRefs` no se usa: es un agregado de nivel doctor y
      no expone `reason` por ref.
- [x] Agregar a `consolidate` en `src/core/memory/engine.js` la opción aditiva
      `includeNearDuplicates` (default `true`) y reenviarla desde el engine read-only; sin otro
      cambio de comportamiento.
- [x] Componer la agrupación de duplicados exactos con `consolidate({ dryRun: true, includeNearDuplicates: false })`; no
      reimplementar la normalización ni la cadena de canónico.
- [x] Producir las secciones `brokenRefs`, `unverifiable` y `exactDuplicates` con los campos del
      contrato.
- [x] Aplicar orden total (`memory_key` ascendente y luego orden de aparición), forma POSIX y
      eliminación del sufijo `:line` en refs `path:`; no usar `localeCompare` ni depender del orden
      de la consulta o del `rowid`.
- [x] Excluir timestamps y campos volátiles de la salida.
- [x] Memoizar la clasificación por `content` de nodo dentro de la corrida para no re-resolver
      duplicados exactos equivalentes.
- [x] Derivar la raíz del proyecto de la ruta de la base con `resolveMemoryProjectRoot`, no de
      `process.cwd()`.

## Fase 2 — Subcomando `ancleto memory curate`

- [x] En `src/cli/index.js`, agregar `memoryCurateCmd(flags)` y enrutarlo desde `memoryCmd` junto
      a `context`, `list`, `doctor`, `export`, `import`, `gc`, `snapshot`, `merge` y `consolidate`.
- [x] Abrir la base exclusivamente con `createReadonlyMemoryEngine` (`readonly: true`,
      `migrate: false`); no aceptar `--rebuild` ni ningún camino de escritura.
- [x] Parsear `--json` y `--strict`; rechazar flags desconocidos con uso y código distinto de `0`.
- [x] Reportar `no-db` de forma explícita cuando la base no existe, con código distinto de `0` y
      sin imprimir secciones vacías que sugieran "sin hallazgos".
- [x] Implementar los códigos de salida: `0` advisory por defecto, distinto de `0` con `--strict`
      sólo ante refs rotas o grupos exactos; `unverifiable` no afecta el código.
- [x] Imprimir el resumen legible de las tres secciones y, con `--json`, el objeto parseable.
- [x] Agregar la línea de uso de `curate` al usage de la familia `memory`.
- [x] Agregar una línea `ancleto memory curate [--json] [--strict]` al bloque de comandos `memory`
      de `README.md` (alrededor de la línea 403).

## Fase 3 — Tests de `test/curation.test.js`

- [x] Verificar que el reporte de duplicados coincide con
      `consolidate({ dryRun: true })` sobre la misma fixture y que la clasificación de refs
      coincide con `resolveNodeRefs`.
- [x] Cubrir refs rotas: `memory_key`, `kind`, ref declarada y `reason` para `spec:`, `change:` y
      `path:`, en orden de aparición.
- [x] Cubrir duplicados exactos: canónico por refs, miembros no canónicos y ningún cambio de
      `status`, `superseded_by` ni `superseded_at`.
- [x] Cubrir `commit:`/`workitem:` en `unverifiable` y fuera de `brokenRefs`.
- [x] Cubrir códigos de salida advisory y `--strict` con los mismos hallazgos.
- [x] Cubrir base ausente: `status` `no-db` y código distinto de `0`.
- [x] Cubrir determinismo: dos corridas idénticas, paths POSIX, sin `:line`, sin timestamps.
- [x] Cubrir la invariante negativa: `.db` byte a byte idéntico, `sqlite_master` idéntico,
      conteo y estado de nodos idénticos, dos corridas idempotentes.
- [x] Cubrir en `test/memory-engine.test.js` que el default de `consolidate` conserva el reporte de
      near-duplicates y que `includeNearDuplicates: false` omite esa sección.
- [x] Ejecutar los tests con rutas explícitas: `node --test test/curation.test.js`.

## Fase 4 — Backlog de los diferidos

- [x] En `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`, registrar las filas de los diferidos de
      CH-09: gate de criticalidad sobre `consolidate --apply`, auto-reparación de refs y curaduría
      periódica automática (cron/servicio).
- [x] Registrar en backlog el tope de escala del escaneo con disparador explícito ("si una corrida
      real de `memory curate` supera X nodos o Y ms"), no como código.
- [x] Marcar la fila `CH-09` como cerrada por el change `ch-09-curaduria-recurrente`, con la
      razón de cada diferido.

## Fase 5 — Validación declarada

- [x] Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- [x] Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test`; para validación
      acotada, `node --test test/curation.test.js` con ruta explícita, nunca `node --test` a secas.
- [x] Registrar Format como `not-configured` y Typecheck como no existente, según
      `PRODUCT.md` → `## Project Commands`.
- [x] Confirmar que en `src/core/memory/engine.js` la única modificación es el opt-out
      `includeNearDuplicates` de `consolidate` (default intacto) y su forwarding en el engine
      read-only; no se tocaron `src/core/memory/doctor.js`, `src/core/memory/database.js`, schema,
      migraciones, `.opencode/**`, `agents/**` ni `skills/**`.
- [x] Confirmar que la única modificación en `src/cli/index.js` es el cableado de `curate`.
