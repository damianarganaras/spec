# Tasks: Reparación explícita de refs no resueltas con `memory repair refs`

> Change funcional. Sin `design.md`: la decisión de arquitectura queda fijada en `## Decisiones`
> del proposal.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test` (`node --test "test/*.test.js"`); para pasos acotados, el mismo runner con rutas
> explícitas. Format check `not-configured`; typecheck no aplica (JavaScript ESM, sin
> `tsconfig.json`).

## File-set de implementación (autorizado)

- `src/core/memory/engine.js` — spans de línea en el parser existente y método de reparación.
- `src/cli/index.js` — subcomando, flags, despacho, salidas, exit codes y refresh.
- `test/repair-refs.test.js` — suite nueva.
- `test/cli.test.js` — pin de `MEMORY_USAGE` y casos de CLI.
- `test/affected-tests.json` — coupling de la suite que spawnea la CLI.
- `aspec/specs/memory-ops/spec.md` — sólo en el archive, por merge del delta.
- `package.json`, `package-lock.json` y `CHANGELOG.md` — sólo en release.
- `aspec/backlog.md` y `docs/technical-discovery/**` — sólo en cierre.

Fuera del file-set: el schema y `src/core/memory/database.js`, `curation.js`, `doctor.js`,
`snapshot.js`, `tools.js`, `mcp-server.js`, `memory curate`, `memory doctor`, `memory snapshot`,
`memory export`, `memory import`, el `.ancleto/memory.db` real, `agents/**`, `skills/**`,
`commands/**`, `templates/**`, `.opencode/**` y `opencode.json`.

## Fase 1 — Motor: parser con spans y método de reparación

- [x] 1.1 Extender `parseRefsBlock` (`src/core/memory/engine.js:332-357`) para exponer, por cada
  ítem, el índice de línea y el texto crudo de la línea, sin crear un segundo parser y sin cambiar
  la forma pública de `resolveNodeRefs` (`:651-681`).
- [x] 1.2 Implementar en `buildEngine` el método
  `repairRefs({ memoryKey, dryRun = true, criticalKeys = [], forceCritical = false })`, con el
  engine como único dueño de la selección y la escritura.
- [x] 1.3 Calcular las refs removibles con la resolución existente: sólo `ok: false` con motivo
  exactamente `inexistente`; excluir `commit:`, `workitem:`, `ambiguo (<n> coincidencias)` y
  `sin raíz`; preservar el orden de aparición en `content`.
- [x] 1.4 Rechazar antes de escribir cuando el bloque `refs:` está malformado o repetido, y cuando
  la reparación dejaría cero refs; el mensaje de cero refs remite a `memory export` y
  `memory import`. No reescribir la gramática.
- [x] 1.5 Implementar la escritura dentro de `runImmediateTransaction`: releer el nodo activo por
  `memory_key`, revalidar que sea exactamente uno, superseder con `getSupersede()` e insertar el
  nodo reparado con `insertNode`, preservando `created_at`, `scope`, `type` y `justification`; el
  nodo anterior conserva su `content` original. Sin `UPDATE` crudo de `content` y sin `import`.
- [x] 1.6 Calcular `criticalAffected` dentro de la transacción y lanzar un error con código
  `MEMORY_CRITICAL_KEY` cuando `dryRun` es falso, la clave es crítica y no se pasó
  `forceCritical`; el dry-run nunca bloquea.
- [x] 1.7 Devolver `no-op` sin escribir cuando no hay refs removibles; una segunda corrida tras un
  apply exitoso debe quedar en ese camino.
- [x] 1.8 Devolver un resultado determinístico con `status`, `dryRun`, `applied`, `critical`,
  `removed[]` (`kind`, `ref`, `reason`) y `remaining`, sin timestamps ni campos volátiles.
- [x] 1.9 Confirmar que el engine read-only acepta `repairRefs({ dryRun: true })` y rechaza
  `repairRefs({ dryRun: false })` antes de tocar la conexión.
- [ ] 1.10 Validar en el plan el `content` candidato con la misma validacion que usa la escritura,
  de modo que un plan que `--apply` rechazaria se reporte como `status: "error"` con codigo `1`,
  cero escrituras y la ref que impide la escritura nombrada; cubrirlo con el escenario S13.

## Fase 2 — CLI: subcomando, gates y salidas

- [x] 2.1 Agregar el conjunto de flags permitidas y `memoryRepairRefs(flags)`: `--memory-key`
  obligatoria, `--apply`, `--force-critical` y `--json`. Sin `--memory-key` o con una flag
  desconocida, mostrar el uso y salir con código `1`.
- [x] 2.2 Implementar dry-run por defecto y estricto: abrir con `createReadonlyMemoryEngine` cuando
  no hay `--apply`, y con `createMemoryEngine` sólo cuando hay `--apply`; no escribir la base ni el
  working-context en dry-run.
- [x] 2.3 Resolver `projectRoot` con `resolveMemoryProjectRoot(dbPath)` y pasar
  `criticalKeys: readCriticalMemoryKeys(projectRoot)`; `forceCritical` sólo tiene efecto en la
  corrida real.
- [x] 2.4 Mapear `MEMORY_CRITICAL_KEY` con el helper `criticalGateExit` existente
  (`src/cli/index.js:3025-3033`): exit `2`; con `--json`,
  `{ "error": "critical-key-gate", "criticalAffected": [...] }`; sin `--json`, stderr con las
  claves y la mención de `--force-critical`.
- [x] 2.5 Emitir la salida JSON con `status` (`ok`, `no-op`, `no-db`, `error`), `memory_key`,
  `dry_run`, `applied`, `critical`, `removed[]` y `remaining`; sin `--json`, imprimir un resumen
  legible equivalente. Base ausente: `status: "no-db"` y salida distinta de `0`.
- [x] 2.6 Tras un apply exitoso, refrescar el working-context con
  `refreshWorkingContextOnWrite(engine, projectRoot)`; si el render falla, salir distinto de `0`
  afirmando que la reparación sí se aplicó y que el bloque quedó desactualizado, con la vía de
  regeneración.
- [x] 2.7 Despachar `memory repair refs` en `memoryCmd` (`src/cli/index.js:3252-3297`) y rechazar
  cualquier otro subcomando de `repair` con uso y código `1`.
- [x] 2.8 Actualizar `MEMORY_USAGE` (`src/cli/index.js:129-140`) y la entrada `memory` de
  `SUBCOMMAND_HELP` (`:5174`), que compone esa lista; verificar que el texto de error de
  subcomando desconocido (`:3295`) también la muestre.
- [x] 2.9 No modificar `memoryCurateCmd`, `memoryDoctorCmd`, `memorySnapshot`, `memoryExport`,
  `memoryImport` ni la superficie MCP.

## Fase 3 — Tests

- [ ] 3.1 Crear `test/repair-refs.test.js` con fixtures en `tmpdir` y el patrón de spawn del CLI
  usado por `test/cli.test.js`; sin tocar `.ancleto/memory.db` real.
- [ ] 3.2 Test S1: una ref `inexistente` se reporta en dry-run y se remueve con `--apply`; el resto
  del `content` queda byte-idéntico.
- [ ] 3.3 Test S2 y S3: `ambiguo` y `sin raíz` no se remueven; `commit:` y `workitem:` nunca se
  remueven ni se eliminan con `--apply`.
- [ ] 3.4 Test S4: dry-run no cambia los bytes de `.db`, los objetos de `sqlite_master` ni el
  working-context.
- [ ] 3.5 Test S5: `--apply` deja una sola activa, preserva `created_at`, `scope`, `type` y
  `justification`, deja el anterior `superseded`, alinea `memory_fts_docsize` con `memory_nodes` y
  la búsqueda encuentra el `content` nuevo.
- [ ] 3.6 Test S6: cero o más de un nodo activo con la clave sale `1` sin escrituras; sin
  `--memory-key` y con flag desconocida también sale `1` mostrando uso.
- [ ] 3.7 Test S7 y S8: bloque malformado o repetido sale `1` sin escrituras; reparación que
  dejaría cero refs sale `1` sin escrituras y remite a `memory export`/`memory import`.
- [ ] 3.8 Test S9: clave crítica reporta `critical: true` en dry-run y sale `0`; `--apply` sin
  `--force-critical` sale `2`, no escribe y emite `error: "critical-key-gate"` con `--json`; con
  `--force-critical` aplica.
- [ ] 3.9 Test S10: la segunda corrida reporta `no-op` y sale `0` sin escribir.
- [ ] 3.10 Test S11: sobre una base temporal, snapshot → apply → restore deja `quick_check='ok'`,
  `docsize == nodes` y el `content` previo.
- [ ] 3.11 Test S12: `sqlite_master` no gana tablas, columnas ni índices; un lector del estado
  previo sigue leyendo la base.
- [ ] 3.12 Actualizar el pin de `MEMORY_USAGE` (`test/cli.test.js:9964-9983`) con la línea nueva y
  confirmar el orden exacto.
- [ ] 3.13 Declarar `test/repair-refs.test.js` en el coupling correspondiente de
  `test/affected-tests.json` para la suite que spawnea el CLI, sin duplicar entradas.

## Fase 4 — Validación declarada

- [ ] 4.1 Ejecutar `npm run lint` y confirmar `passed`.
- [ ] 4.2 Ejecutar `node --test "test/repair-refs.test.js" "test/cli.test.js"` con rutas
  explícitas y confirmar verde.
- [ ] 4.3 Ejecutar `npm test` y confirmar la suite completa en verde.
- [ ] 4.4 Registrar format check `not-configured` y typecheck no aplica; no inventar comandos.
- [ ] 4.5 Reproducir el contrato completo sobre una base temporal (S1–S13); nunca usar
  `.ancleto/memory.db` real.

## Fase 5 — Release y cierre

- [ ] 5.1 Aplicar el bump MINOR de `0.36.0` a `0.37.0` en `package.json` y `package-lock.json`; no
  tocar schema, PRAGMAs persistentes ni `ruleVersion`.
- [ ] 5.2 Agregar la entrada de `CHANGELOG.md` con el subcomando, el dry-run, los exit codes `0`,
  `1` y `2`, y el procedimiento de rollback por snapshot.
- [ ] 5.3 Actualizar `aspec/backlog.md` y, si el ítem vive ahí, `docs/technical-discovery/**` con lo
  hecho y lo pendiente.
- [ ] 5.4 Archivar el change y promover el delta a `aspec/specs/memory-ops/spec.md` sólo por merge;
  verificar que el requirement y sus trece escenarios quedaron íntegros.
- [ ] 5.5 No commitear ni pushear: el commit lo hace `@coder` y el push queda fuera de este change.
