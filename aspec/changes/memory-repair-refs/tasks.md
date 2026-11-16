# Tasks: ReparaciÃ³n explÃ­cita de refs no resueltas con `memory repair refs`

> Change funcional. Sin `design.md`: la decisiÃ³n de arquitectura queda fijada en `## Decisiones`
> del proposal.
> Validaciones declaradas en `PRODUCT.md` â†’ `## Project Commands`: lint `npm run lint`; tests
> `npm test` (`node --test "test/*.test.js"`); para pasos acotados, el mismo runner con rutas
> explÃ­citas. Format check `not-configured`; typecheck no aplica (JavaScript ESM, sin
> `tsconfig.json`).

## File-set de implementaciÃ³n (autorizado)

- `src/core/memory/engine.js` â€” spans de lÃ­nea en el parser existente y mÃ©todo de reparaciÃ³n.
- `src/cli/index.js` â€” subcomando, flags, despacho, salidas, exit codes y refresh.
- `test/repair-refs.test.js` â€” suite nueva.
- `test/cli.test.js` â€” pin de `MEMORY_USAGE` y casos de CLI.
- `test/affected-tests.json` â€” coupling de la suite que spawnea la CLI.
- `aspec/specs/memory-ops/spec.md` â€” sÃ³lo en el archive, por merge del delta.
- `package.json`, `package-lock.json` y `CHANGELOG.md` â€” sÃ³lo en release.
- `aspec/backlog.md` y `docs/technical-discovery/**` â€” sÃ³lo en cierre.

Fuera del file-set: el schema y `src/core/memory/database.js`, `curation.js`, `doctor.js`,
`snapshot.js`, `tools.js`, `mcp-server.js`, `memory curate`, `memory doctor`, `memory snapshot`,
`memory export`, `memory import`, el `.ancleto/memory.db` real, `agents/**`, `skills/**`,
`commands/**`, `templates/**`, `.opencode/**` y `opencode.json`.

## Fase 1 â€” Motor: parser con spans y mÃ©todo de reparaciÃ³n

- [x] 1.1 Extender `parseRefsBlock` (`src/core/memory/engine.js:332-357`) para exponer, por cada
  Ã­tem, el Ã­ndice de lÃ­nea y el texto crudo de la lÃ­nea, sin crear un segundo parser y sin cambiar
  la forma pÃºblica de `resolveNodeRefs` (`:651-681`).
- [x] 1.2 Implementar en `buildEngine` el mÃ©todo
  `repairRefs({ memoryKey, dryRun = true, criticalKeys = [], forceCritical = false })`, con el
  engine como Ãºnico dueÃ±o de la selecciÃ³n y la escritura.
- [x] 1.3 Calcular las refs removibles con la resoluciÃ³n existente: sÃ³lo `ok: false` con motivo
  exactamente `inexistente`; excluir `commit:`, `workitem:`, `ambiguo (<n> coincidencias)` y
  `sin raÃ­z`; preservar el orden de apariciÃ³n en `content`.
- [x] 1.4 Rechazar antes de escribir cuando el bloque `refs:` estÃ¡ malformado o repetido, y cuando
  la reparaciÃ³n dejarÃ­a cero refs; el mensaje de cero refs remite a `memory export` y
  `memory import`. No reescribir la gramÃ¡tica.
- [x] 1.5 Implementar la escritura dentro de `runImmediateTransaction`: releer el nodo activo por
  `memory_key`, revalidar que sea exactamente uno, superseder con `getSupersede()` e insertar el
  nodo reparado con `insertNode`, preservando `created_at`, `scope`, `type` y `justification`; el
  nodo anterior conserva su `content` original. Sin `UPDATE` crudo de `content` y sin `import`.
- [x] 1.6 Calcular `criticalAffected` dentro de la transacciÃ³n y lanzar un error con cÃ³digo
  `MEMORY_CRITICAL_KEY` cuando `dryRun` es falso, la clave es crÃ­tica y no se pasÃ³
  `forceCritical`; el dry-run nunca bloquea.
- [x] 1.7 Devolver `no-op` sin escribir cuando no hay refs removibles; una segunda corrida tras un
  apply exitoso debe quedar en ese camino.
- [x] 1.8 Devolver un resultado determinÃ­stico con `status`, `dryRun`, `applied`, `critical`,
  `removed[]` (`kind`, `ref`, `reason`) y `remaining`, sin timestamps ni campos volÃ¡tiles.
- [x] 1.9 Confirmar que el engine read-only acepta `repairRefs({ dryRun: true })` y rechaza
  `repairRefs({ dryRun: false })` antes de tocar la conexiÃ³n.

## Fase 2 â€” CLI: subcomando, gates y salidas

- [x] 2.1 Agregar el conjunto de flags permitidas y `memoryRepairRefs(flags)`: `--memory-key`
  obligatoria, `--apply`, `--force-critical` y `--json`. Sin `--memory-key` o con una flag
  desconocida, mostrar el uso y salir con cÃ³digo `1`.
- [x] 2.2 Implementar dry-run por defecto y estricto: abrir con `createReadonlyMemoryEngine` cuando
  no hay `--apply`, y con `createMemoryEngine` sÃ³lo cuando hay `--apply`; no escribir la base ni el
  working-context en dry-run.
- [x] 2.3 Resolver `projectRoot` con `resolveMemoryProjectRoot(dbPath)` y pasar
  `criticalKeys: readCriticalMemoryKeys(projectRoot)`; `forceCritical` sÃ³lo tiene efecto en la
  corrida real.
- [x] 2.4 Mapear `MEMORY_CRITICAL_KEY` con el helper `criticalGateExit` existente
  (`src/cli/index.js:3025-3033`): exit `2`; con `--json`,
  `{ "error": "critical-key-gate", "criticalAffected": [...] }`; sin `--json`, stderr con las
  claves y la menciÃ³n de `--force-critical`.
- [x] 2.5 Emitir la salida JSON con `status` (`ok`, `no-op`, `no-db`, `error`), `memory_key`,
  `dry_run`, `applied`, `critical`, `removed[]` y `remaining`; sin `--json`, imprimir un resumen
  legible equivalente. Base ausente: `status: "no-db"` y salida distinta de `0`.
- [x] 2.6 Tras un apply exitoso, refrescar el working-context con
  `refreshWorkingContextOnWrite(engine, projectRoot)`; si el render falla, salir distinto de `0`
  afirmando que la reparaciÃ³n sÃ­ se aplicÃ³ y que el bloque quedÃ³ desactualizado, con la vÃ­a de
  regeneraciÃ³n.
- [x] 2.7 Despachar `memory repair refs` en `memoryCmd` (`src/cli/index.js:3252-3297`) y rechazar
  cualquier otro subcomando de `repair` con uso y cÃ³digo `1`.
- [x] 2.8 Actualizar `MEMORY_USAGE` (`src/cli/index.js:129-140`) y la entrada `memory` de
  `SUBCOMMAND_HELP` (`:5174`), que compone esa lista; verificar que el texto de error de
  subcomando desconocido (`:3295`) tambiÃ©n la muestre.
- [x] 2.9 No modificar `memoryCurateCmd`, `memoryDoctorCmd`, `memorySnapshot`, `memoryExport`,
  `memoryImport` ni la superficie MCP.

## Fase 3 â€” Tests

- [ ] 3.1 Crear `test/repair-refs.test.js` con fixtures en `tmpdir` y el patrÃ³n de spawn del CLI
  usado por `test/cli.test.js`; sin tocar `.ancleto/memory.db` real.
- [ ] 3.2 Test S1: una ref `inexistente` se reporta en dry-run y se remueve con `--apply`; el resto
  del `content` queda byte-idÃ©ntico.
- [ ] 3.3 Test S2 y S3: `ambiguo` y `sin raÃ­z` no se remueven; `commit:` y `workitem:` nunca se
  remueven ni se eliminan con `--apply`.
- [ ] 3.4 Test S4: dry-run no cambia los bytes de `.db`, los objetos de `sqlite_master` ni el
  working-context.
- [ ] 3.5 Test S5: `--apply` deja una sola activa, preserva `created_at`, `scope`, `type` y
  `justification`, deja el anterior `superseded`, alinea `memory_fts_docsize` con `memory_nodes` y
  la bÃºsqueda encuentra el `content` nuevo.
- [ ] 3.6 Test S6: cero o mÃ¡s de un nodo activo con la clave sale `1` sin escrituras; sin
  `--memory-key` y con flag desconocida tambiÃ©n sale `1` mostrando uso.
- [ ] 3.7 Test S7 y S8: bloque malformado o repetido sale `1` sin escrituras; reparaciÃ³n que
  dejarÃ­a cero refs sale `1` sin escrituras y remite a `memory export`/`memory import`.
- [ ] 3.8 Test S9: clave crÃ­tica reporta `critical: true` en dry-run y sale `0`; `--apply` sin
  `--force-critical` sale `2`, no escribe y emite `error: "critical-key-gate"` con `--json`; con
  `--force-critical` aplica.
- [ ] 3.9 Test S10: la segunda corrida reporta `no-op` y sale `0` sin escribir.
- [ ] 3.10 Test S11: sobre una base temporal, snapshot â†’ apply â†’ restore deja `quick_check='ok'`,
  `docsize == nodes` y el `content` previo.
- [ ] 3.11 Test S12: `sqlite_master` no gana tablas, columnas ni Ã­ndices; un lector del estado
  previo sigue leyendo la base.
- [ ] 3.12 Actualizar el pin de `MEMORY_USAGE` (`test/cli.test.js:9964-9983`) con la lÃ­nea nueva y
  confirmar el orden exacto.
- [ ] 3.13 Declarar `test/repair-refs.test.js` en el coupling correspondiente de
  `test/affected-tests.json` para la suite que spawnea el CLI, sin duplicar entradas.

## Fase 4 â€” ValidaciÃ³n declarada

- [ ] 4.1 Ejecutar `npm run lint` y confirmar `passed`.
- [ ] 4.2 Ejecutar `node --test "test/repair-refs.test.js" "test/cli.test.js"` con rutas
  explÃ­citas y confirmar verde.
- [ ] 4.3 Ejecutar `npm test` y confirmar la suite completa en verde.
- [ ] 4.4 Registrar format check `not-configured` y typecheck no aplica; no inventar comandos.
- [ ] 4.5 Reproducir el contrato completo sobre una base temporal (S1â€“S12); nunca usar
  `.ancleto/memory.db` real.

## Fase 5 â€” Release y cierre

- [ ] 5.1 Aplicar el bump MINOR de `0.36.0` a `0.37.0` en `package.json` y `package-lock.json`; no
  tocar schema, PRAGMAs persistentes ni `ruleVersion`.
- [ ] 5.2 Agregar la entrada de `CHANGELOG.md` con el subcomando, el dry-run, los exit codes `0`,
  `1` y `2`, y el procedimiento de rollback por snapshot.
- [ ] 5.3 Actualizar `aspec/backlog.md` y, si el Ã­tem vive ahÃ­, `docs/technical-discovery/**` con lo
  hecho y lo pendiente.
- [ ] 5.4 Archivar el change y promover el delta a `aspec/specs/memory-ops/spec.md` sÃ³lo por merge;
  verificar que el requirement y sus doce escenarios quedaron Ã­ntegros.
- [ ] 5.5 No commitear ni pushear: el commit lo hace `@coder` y el push queda fuera de este change.
