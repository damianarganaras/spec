# Tasks: Superficies de lectura de memoria estrictamente read-only

> Delta: `specs/memory-ops/spec.md` (ADDED transversal). Contrato de `status`/`doctor` sin
> cambios. Sin schema nuevo, sin PRAGMAs persistentes nuevos, sin cambio de `ruleVersion`.

## Fase 1 — Helper de detección de esquema

- [x] 1.1 Extraer de `src/core/memory/status.js` un helper exportado de detección de esquema que consulte si `sqlite_master` declara `memory_nodes`, reutilizando la consulta existente sin duplicar el literal SQL.
- [x] 1.2 Hacer que `inspectDatabase` use el helper extraído sin alterar `status` ni `doctor` (mismos estados, mismos exit codes, misma salida).

## Fase 2 — Apertura read-only y degradación por superficie

- [x] 2.1 `memory context`: precheck de esquema; tratar "sin base" y "sin esquema" como día-cero; construir `createReadonlyMemoryEngine` sólo cuando hay esquema y con `migrate: false`.
- [x] 2.2 `memory export`: precheck; mensaje que nombra el esquema no inicializado y exit 1 sin migrar; `createReadonlyMemoryEngine` cuando hay esquema.
- [x] 2.3 `memory list`: mover la construcción del engine dentro del manejo de error y después del precheck; mensaje "sin esquema" con exit 0 y mensaje "sin nodos" con exit 0.
- [x] 2.4 `memory curate`: precheck; exit 1 sin stack cuando falta el esquema; conservar la apertura read-only vigente cuando hay esquema.
- [x] 2.5 `memory merge --dry-run`: construir el engine dentro del manejo de error y después del precheck; exit 1 sin stack cuando falta el esquema; conservar las validaciones de merge cuando hay esquema.
- [x] 2.6 `memory repair refs` sin `--apply`: idem merge; exit 1 sin stack cuando falta el esquema; conservar las validaciones de repair cuando hay esquema.
- [x] 2.7 `memory import --dry-run`: precheck; sin esquema simular sobre estado vacío reportando `databasePresent: true` y exit 0, sin crear ni migrar la base.
- [x] 2.8 Asegurar que ninguna superficie de lectura cree `.ancleto/` ni `.ancleto/memory.db` al abrir; `context --out` sigue siendo la única que escribe el working-context.
- [x] 2.9 Verificar que las superficies ya read-only (`curate`, `status`, `doctor`) reutilizan el helper y no adquieren escrituras nuevas.

## Fase 3 — Tests

- [x] 3.1 Crear `test/memory-readonly-surfaces.test.js` con la matriz de 4 estados de base (sin `.ancleto/`, 0 bytes o sin `memory_nodes`, esquema con 0 nodos, esquema con nodos) × superficies: código de salida, mensaje, SHA-256 del `.db` y `sqlite_master`.
- [x] 3.2 Cubrir en el mismo test que ninguna superficie crea `.ancleto/` ni `memory.db`, y que `context --out` escribe el working-context sin tocar el `.db`.
- [x] 3.3 Cubrir sidecars: tolerados en `journal_mode=WAL` y ausentes en `journal_mode=DELETE`.
- [x] 3.4 Cubrir base ilegible: mensaje distinguible de "sin esquema" y salida distinta de 0 sin stack.
- [x] 3.5 Declarar `test/memory-readonly-surfaces.test.js` en `test/affected-tests.json` bajo los couplings `src/cli/**` y `src/core/memory/**`, porque spawnea el CLI sin importarlo.
- [x] 3.6 Confirmar sin editarlos que siguen verdes los tests pinneados: `memory-status.test.js`, `memory-doctor-uninitialized.test.js`, `curation.test.js`, `cli.test.js:3779-3880`, `mcp.test.js:239-244` y `cli.test.js:4093-4130`.

## Fase 4 — Validación

- [x] 4.1 Ejecutar `npm run lint`.
- [x] 4.2 Ejecutar `npm test` (suite declarada) y la corrida acotada `node --test test/memory-readonly-surfaces.test.js`.

## Fase 5 — Release y seed

- [ ] 5.1 Subir la versión MINOR a `0.39.0` en `package.json` y registrar el cambio en `CHANGELOG.md`.
- [ ] 5.2 Regenerar el technical seed en `docs/technical-discovery/`; si el chequeo read-only previo reporta `STALE` con `impact: material`, pedir aprobación explícita antes de regenerar y anotar el resultado.
- [ ] 5.3 Confirmar que no hay cambios de schema, de PRAGMAs persistentes ni de `ruleVersion`.
