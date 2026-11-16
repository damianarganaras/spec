# Tasks: declaración advisory del gap de memoria esperable con `memory status`

> Change funcional. Sin `design.md`: la arquitectura queda fijada en `## Decisiones` del proposal.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test` (`node --test "test/*.test.js"`); para pasos acotados, el mismo runner con rutas
> explícitas. Format check `not-configured`; typecheck no aplica (JavaScript ESM, sin
> `tsconfig.json`).

## File-set de implementación (autorizado)

- `src/core/memory/status.js` — módulo puro nuevo: estados, predicado `expected`, `gap`,
  `recovery`.
- `src/cli/index.js` — subcomando `memory status`, ayuda, `MEMORY_USAGE`, despacho y corrección de
  `memory doctor` sobre base sin esquema.
- `test/memory-status.test.js` — suite nueva.
- `test/memory-doctor-uninitialized.test.js` — suite nueva del arreglo de `doctor`.
- `test/cli.test.js` — pin de `MEMORY_USAGE` y casos de CLI.
- `test/affected-tests.json` — coupling de las suites que spawnean la CLI.
- `aspec/specs/memory-ops/spec.md` — sólo en el archive, por merge del delta.
- `package.json`, `package-lock.json` y `CHANGELOG.md` — sólo en release.
- `aspec/backlog.md` y `docs/technical-discovery/**` — sólo en cierre.

Fuera del file-set: el schema y `src/core/memory/database.js`, `engine.js`, `doctor.js`,
`curation.js`, `snapshot.js`, `tools.js`, `mcp-server.js`, `working-context.js`; los subcomandos
`memory export`, `import`, `snapshot`, `curate`, `doctor` (salvo el arreglo de apertura), `merge` y
`consolidate`; el `.ancleto/memory.db` real; `agents/**`, `skills/**`, `commands/**`,
`templates/**`, `.opencode/**`, `opencode.json`, `AGENTS.md` y `PRODUCT.md`.

## Fase 1 — Módulo de estado (read-only)

- [ ] 1.1 Crear `src/core/memory/status.js` con `inspectMemoryStatus({ projectRoot, dbPath })` que
  devuelva `{ status, expected, gap, dbPresent, activeNodes, evidence, recovery }`, sin ninguna
  ruta de escritura.
- [ ] 1.2 Clasificar el estado con pre-check `existsSync(dbPath)` y apertura
  `openDatabase(dbPath, { migrate: false, readonly: true })`: `no-db` sin abrir cuando el archivo no
  existe; `uninitialized` cuando `sqlite_master` no declara `memory_nodes`; `empty` u `ok` según
  `COUNT(*)` de `memory_nodes` con `status='active'`.
- [ ] 1.3 Implementar `expected` sobre `readdirSync(join(projectRoot, 'aspec', 'changes', 'archive'))`:
  por cada `proposal.md`, exigir una línea con prefijo `## Decisiones` y una línea con prefijo
  `**memory_key:**`; cortar en el primer archivo que cumple ambas condiciones; tratar cualquier
  error de lectura como no-match; devolver `evidence` `1` cuando `expected` es `true` y `0` cuando es
  `false`.
- [ ] 1.4 Calcular `gap = expected && status !== 'ok'` y `recovery` con los comandos existentes
  `ancleto memory export`, `ancleto memory import` y `ancleto memory snapshot` sólo cuando `gap` es
  `true`; array vacío en caso contrario.
- [ ] 1.5 Mapear errores: archivo ausente → `no-db`; error de E/S o de apertura de SQLite distinto
  de archivo ausente → propagar un error con mensaje legible para que el CLI lo traduzca a exit `1`
  sin stack.

## Fase 2 — CLI y arreglo de `doctor`

- [ ] 2.1 Agregar `memoryStatusCmd(flags)` en `src/cli/index.js`, con `--json` como única opción
  nueva; derivar `dbPath` con `defaultMemoryDbPath()` y `projectRoot` con
  `resolveMemoryProjectRoot(dbPath)` o `process.cwd()` como fallback.
- [ ] 2.2 Sin `--json`, imprimir una línea de estado y, sólo cuando `gap` sea `true`, una línea
  accionable con `ancleto memory export`, `ancleto memory import` y `ancleto memory snapshot`; sin
  gap, no imprimir advertencia.
- [ ] 2.3 Con `--json`, imprimir el objeto con `status`, `expected`, `gap`, `dbPresent`,
  `activeNodes`, `evidence` y `recovery`; salir con `0` en `ok`, `empty`, `no-db` y
  `uninitialized`; salir con `1` sólo ante error de E/S o apertura, con mensaje en stderr y sin
  stack.
- [ ] 2.4 Despachar `status` en `memoryCmd` (`src/cli/index.js:3374-3423`), junto a `context`,
  `list`, `doctor`, `export`, `import`, `gc`, `snapshot`, `merge`, `consolidate`, `curate` y
  `repair`.
- [ ] 2.5 Actualizar `MEMORY_USAGE` (`src/cli/index.js:131-143`) y la ayuda de la familia `memory`
  (`src/cli/index.js:99-117`) con la línea de `status`.
- [ ] 2.6 Corregir `memoryDoctorCmd` (`src/cli/index.js:2757-2792`): construir el engine read-only
  de frescura dentro del `try` y no construirlo cuando el esquema no está inicializado, de modo que
  una base de 0 bytes imprima los cinco checks y termine sin excepción no capturada ni stack; cuando
  el esquema sí existe, conservar exactamente los cinco checks, sus nombres, su orden y el criterio
  de `healthy`.

## Fase 3 — Tests

- [ ] 3.1 Crear `test/memory-status.test.js` con fixtures en `tmpdir` y el patrón de spawn del CLI
  usado por `test/cli.test.js`; sin tocar `.ancleto/memory.db` real.
- [ ] 3.2 Tests de estados: `ok` con nodos activos, `empty` con esquema y 0 nodos, `no-db` sin
  archivo y `uninitialized` con archivo de 0 bytes o sin `memory_nodes`; verificar `dbPresent` y
  `activeNodes` en cada caso.
- [ ] 3.3 Tests del predicado: `## Decisiones de producto` cuenta como prefijo; `## Decisiones` sin
  una forma soportada de `memory_key` no es evidencia; `**memory_key:**` sin `## Decisiones` no es
  evidencia; error de lectura tratado como no-match; archive vacío o ausente no declara gap.
- [ ] 3.4 Test de las formas soportadas de la clave: pinea `**memory_key:** valor` en columna 0,
  `- **memory_key:** valor` con bullet `-` y `* **memory_key:** valor` con bullet `*` como evidencia;
  pinea que el marcador envuelto en backticks (`` `**memory_key:**` ``) NO es evidencia y que los
  backticks alrededor del valor no impiden el match.
- [ ] 3.5 Tests de `gap` y `recovery`: gap `true` en `empty`, `no-db` y `uninitialized` con
  evidencia; `recovery` con los tres comandos existentes; gap `false` en `ok` y en repo sin
  evidencia; sin advertencia humana cuando no hay gap.
- [ ] 3.6 Test de la forma `--json`: objeto parseable con las siete claves y `recovery` vacío
  cuando no hay gap.
- [ ] 3.7 Tests de invariantes negativas: no crea `.ancleto/` ni `memory.db`; no cambia bytes del
  `.db`, filas, `status`, `content` ni `sqlite_master`; no toca `.ancleto/working-context.md`; no
  importa nodos; dos corridas consecutivas son idempotentes.
- [ ] 3.8 Test de sidecars: sobre `journal_mode=DELETE` sin sidecars, `.db` queda byte-idéntico y
  la eventual materialización de `-shm` y `-wal` de 0 bytes no se reporta como falla.
- [ ] 3.9 Test de exit codes: `0` en los cuatro estados con y sin `--json`; `1` y mensaje en stderr
  sin stack ante un archivo de base que no puede abrirse o leerse.
- [ ] 3.10 Test de no acoplamiento: comparar el exit y la salida de `memory doctor` y de
  `ancleto check` antes y después de `memory status` con gap `true`.
- [ ] 3.11 Crear `test/memory-doctor-uninitialized.test.js`: base de 0 bytes → cinco checks, orden
  exacto, salida con código distinto de `0` y ausencia de stack trace; base con esquema → los cinco
  checks y su orden intactos, sin cambios en `healthy`.
- [ ] 3.12 Actualizar el pin de `MEMORY_USAGE` (`test/cli.test.js:9964`) con la línea nueva y
  confirmar el orden exacto.
- [ ] 3.13 Declarar `test/memory-status.test.js` y `test/memory-doctor-uninitialized.test.js` en los
  couplings `src/cli/**` y `src/core/memory/**` de `test/affected-tests.json` según corresponda, sin
  duplicar entradas.

## Fase 4 — Validación declarada

- [ ] 4.1 Ejecutar `npm run lint` y confirmar `passed`.
- [ ] 4.2 Ejecutar
  `node --test "test/memory-status.test.js" "test/memory-doctor-uninitialized.test.js" "test/cli.test.js" "test/delta-spec-structure.test.js"`
  con rutas explícitas y confirmar verde.
- [ ] 4.3 Ejecutar `npm test` y confirmar la suite completa en verde.
- [ ] 4.4 Registrar format check `not-configured` y typecheck no aplica; no inventar comandos.
- [ ] 4.5 Reproducir el contrato completo sobre fixtures en `tmpdir`; nunca usar
  `.ancleto/memory.db` real.

## Fase 5 — Release y cierre

- [ ] 5.1 Aplicar el bump MINOR de `0.37.0` a `0.38.0` en `package.json` y `package-lock.json`; no
  tocar schema, PRAGMAs persistentes ni `ruleVersion`.
- [ ] 5.2 Agregar la entrada de `CHANGELOG.md` con el subcomando, los cuatro estados, el exit `0`
  advisory, los caminos de recuperación, el arreglo de `doctor` sobre base sin esquema y el
  rollback por revert del commit de release.
- [ ] 5.3 Actualizar `aspec/backlog.md` y, si el ítem vive ahí, `docs/technical-discovery/**` con lo
  hecho y lo pendiente.
- [ ] 5.4 Archivar el change y promover el delta a `aspec/specs/memory-ops/spec.md` sólo por merge;
  verificar que el requirement nuevo conserva sus veintiún escenarios y que el requirement modificado
  de `doctor` conserva el cuerpo completo y sus once escenarios.
- [ ] 5.5 No commitear ni pushear como parte de este change: el commit lo hace `@coder` y el push
  queda fuera de este change.
