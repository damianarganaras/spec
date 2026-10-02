# Tasks: Memory Ops — Export/Import/GC

## Implementación

- [x] **T1**: Agregar método `exportActive()` en `src/core/memory/engine.js`
  - Consultar `findActive()` y mapear al formato JSON
  - Sanitizar paths absolutos en `content` y `justification`
  - Retornar array de nodos

- [x] **T2**: Agregar método `importNodes(json)` en `src/core/memory/engine.js`
  - Validar schema de cada entrada (campos requeridos)
  - Para cada nodo: buscar por `memory_key`, aplicar lógica de upsert (insertar, superseder,
    reactivar, o no-op según `createdAt`)
  - Preservar `createdAt` del JSON (agregar parámetro opcional a `recordNode`)
  - Todo en transacción; abortar si alguna entrada es inválida

- [x] **T3**: Agregar método `gcSuperseded(opts)` en `src/core/memory/engine.js`
  - DELETE de nodos superseded con antigüedad > `opts.days` (default 30)
  - Si `opts.dryRun`: SELECT count + estimated_bytes en lugar de DELETE
  - Ejecutar VACUUM + REINDEX después del DELETE (no en dry-run)
  - Todo en transacción

- [x] **T4**: Agregar subcomando `memory export` en `src/cli/index.js`
  - Parsear `--out <file>`
  - Invocar `engine.exportActive()`
  - Escribir a stdout o a archivo

- [x] **T5**: Agregar subcomando `memory import` en `src/cli/index.js`
  - Leer archivo JSON
  - Invocar `engine.importNodes(json)`
  - Reportar resumen (insertados, actualizados, omitidos)

- [x] **T6**: Agregar subcomando `memory gc` en `src/cli/index.js`
  - Parsear `--dry-run` y `--days <n>`
  - Invocar `engine.gcSuperseded(opts)`
  - Reportar resultado

## Testing

- [x] **T7**: Tests para `exportActive()` en `test/memory-engine.test.js`
  - Insertar 2 activos + 1 superseded, exportar, asertar que solo van los 2 activos
  - Verificar sanitización de paths absolutos

- [x] **T8**: Tests para `importNodes()` en `test/memory-engine.test.js`
  - Import en BD vacía: 3 nodos quedan activos
  - Idempotencia: importar 2 veces deja mismo estado
  - Upsert: `createdAt` más reciente supersede al existente
  - No sobrescribe: `createdAt` más antiguo no cambia el existente
  - Entrada inválida: aborta sin insertar

- [x] **T9**: Tests para `gcSuperseded()` en `test/memory-engine.test.js`
  - 2 superseded (40 y 10 días), GC con umbral 30: solo el de 40 se borra
  - Nodos activos no se tocan
  - Dry-run: reporta sin borrar

## Validación

- [x] **T10**: Correr `npm run typecheck`, `npm run lint`, `npm test` y verificar que todo pasa
