# Tasks: Selección determinística y segura de tests por affected-set

> Change funcional. Release **MINOR 0.32.0** (FASE 2). Sin `design.md`.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test` (`node --test "test/*.test.js"`); para pasos acotados, rutas explícitas.
> Format check `not-configured`; typecheck no aplica (JavaScript ESM, sin `tsconfig.json`).

## File-set de implementación (autorizado)

- `src/core/test-selection.js` (nuevo) — módulo puro dueño del plan.
- `test/affected-tests.json` (nuevo) — manifiesto cerrado `version: 1`.
- `src/cli/index.js` — sólo `affectedCommand` y su despacho: flag `--tests`.
- `scripts/test-affected.mjs` (nuevo) — consumidor del plan.
- `package.json` — sólo el script `test:affected` (el `version` se bumpea en la release).
- `test/test-selection.test.js` (nuevo) — tests del módulo, del flag y del consumidor.
- `aspec/changes/ch-06b-affected-test-selection/**` — estos artifacts.
- `aspec/specs/prompt-contracts/spec.md` — sólo en el archive, por merge del delta.

Fuera del file-set: `src/core/affected-set.js`, `test/affected-set.test.js` (su invariante negativa
`505-533` se preserva), CI/`publish.yml`, `.opencode/**`, `agents/*.md`, `.opencode/agents/*.md`,
`opencode.json`, `~/.config/opencode/**`, `aspec/changes/ancleto-vscode-extension/`, `docs/PLAN*`,
`docs/BACKLOG_*` y la DB real `.ancleto/memory.db`.

## Fase 1 — Artifacts

- [x] Escribir `aspec/changes/ch-06b-affected-test-selection/proposal.md` con contexto, evidencia, cita, alcance, opciones, release, rollback, riesgos y `## Decisiones`.
- [x] Escribir el delta `aspec/changes/ch-06b-affected-test-selection/specs/prompt-contracts/spec.md` con `## ADDED Requirements` y los escenarios del contrato.
- [x] Escribir `aspec/changes/ch-06b-affected-test-selection/tasks.md` con las fases de implementación, tests y validación.

## Fase 2 — Módulo puro `src/core/test-selection.js`

- [x] 2.1 Crear `src/core/test-selection.js` con una función pura que reciba el resultado de `computeAffectedSet` (o `rootDir` + `seeds`) y devuelva `{ selected, excluded, complete, reasons }`; reutilizar `computeAffectedSet` de `src/core/affected-set.js` sin duplicar el grafo.
- [x] 2.2 Implementar el universo `U` como los archivos bajo `test/` que matchean `*.test.js`, en rutas repo-relative posix y ordenadas; si el glob no resuelve, emitir `test-glob-missing`.
- [x] 2.3 Implementar la lectura y validación del manifiesto `test/affected-tests.json`: `version === 1`, `always` y `couplings[].tests` miembros de `U`, `trigger` como globs; manifiesto ausente/no parseable/versión distinta/rutas fuera de `U` → `manifest-missing` o `manifest-invalid`.
- [x] 2.4 Implementar `selected` como la unión de (1) tests de `U` en `affected`, (2) `always`, (3) tests de `couplings` cuyo `trigger` interseca `affected`, y (4) tests cuyo propio archivo figura en `unresolved`.
- [x] 2.5 Implementar `excluded` como `U \ selected`, con `{ file, reason: "not-affected" }`, ordenado; garantizar que ningún test quede fuera de ambos ni en ambos.
- [x] 2.6 Implementar el gate `complete`/`reasons` fail-closed con los códigos `manifest-missing`, `manifest-invalid`, `manifest-gap`, `test-glob-missing`, `unresolved-in-closure`; `reasons` únicos y ordenados, vacío si y sólo si `complete === true`.
- [x] 2.7 Implementar `manifest-gap` para todo test de `U` cuyo cierre de dependencias no toca `src/` y que no está declarado en `always` ni en ningún `coupling`.
- [x] 2.8 Garantizar read-only: el módulo no escribe archivos, no abre `.ancleto/memory.db` y no usa red.
- [x] 2.9 No modificar `src/core/affected-set.js`: `buildImportGraph` (`:214-250`) y `computeAffectedSet` (`:253-280`) quedan intactos.

## Fase 3 — Manifiesto `test/affected-tests.json`

- [x] 3.1 Crear `test/affected-tests.json` con `{ "version": 1, "always": [], "couplings": [] }` y declarar las suites que no tienen arista a `src/` (`test/stats-failures.test.js` y `test/linter-config.test.js`) mediante couplings con triggers precisos; `always` queda vacío porque ninguna suite corre para toda semilla.
- [x] 3.2 Declarar couplings con `trigger` por glob y `tests` explícitos para las clases de escape verificadas: spawn del CLI sin arista (`test/cli.test.js`, `test/specs-merge.test.js`, `test/memory-pr1-contract.test.js`, `test/discovery-topology.test.js`, `test/mcp.test.js`, `test/memory-engine.test.js`, `test/curation.test.js`, `test/affected-set.test.js`), lectura de markdown/templates/skills/agents/commands/docs (`test/content-guards.test.js`, `test/agent-model-coherence.test.js`, `test/model-catalog-discovery.test.js`, `test/adapters-frontmatter.test.js`) y DB directa (`test/stats-failures.test.js`).
- [x] 3.3 Verificar que toda ruta del manifiesto es repo-relative posix y miembro de `U`, y que cada coupling tiene un `reason` no vacío.
- [x] 3.4 Verificar que el manifiesto no introduce nodos al grafo: sólo `.js/.mjs/.cjs/.ts/.tsx` se indexan (`src/core/affected-set.js:29,51-52`), por lo que un `.json` es inerte.

## Fase 4 — Handler CLI `--tests`

- [x] 4.1 Agregar `--tests` al parseo de `affectedCommand` (`src/cli/index.js:3811-3852`) antes de la recolección de semillas, para que no se interprete como semilla.
- [x] 4.2 Hacer que `--tests` implique salida JSON y agregue el objeto `tests` (`complete`, `reasons`, `selected`, `excluded`) al objeto existente, sin cambiar `seeds`, `affected`, `unresolved` ni `externalCount`.
- [x] 4.3 Sin `--tests`, mantener byte-idéntico el JSON actual de `src/cli/index.js:3838` (cuatro campos, mismo orden, mismos valores).
- [x] 4.4 Mantener los códigos de salida actuales: exit 1 sólo por uso inválido (`:3814-3816`, `:3829-3831`); el plan no agrega códigos nuevos.
- [x] 4.5 Cablear el handler al módulo `src/core/test-selection.js`; no duplicar reglas de selección en la CLI.

## Fase 5 — Consumidor `scripts/test-affected.mjs` y `package.json`

- [x] 5.1 Crear `scripts/test-affected.mjs` que compute el plan con `src/core/test-selection.js` directamente, sin spawnear el CLI.
- [x] 5.2 Implementar el modo por defecto: si `complete === true`, ejecutar `node --test` con las rutas explícitas de `selected`; si `complete === false`, imprimir `reasons` y ejecutar `node --test "test/*.test.js"`.
- [x] 5.3 Implementar `--plan-only` y `--json` para imprimir el plan sin ejecutar ningún test (offline-testeable).
- [x] 5.4 Exigir `tests.complete === true` para ejecutar `selected`; ante ausencia del objeto `tests` o de `complete`, caer a la suite completa y nunca interpretar la ausencia como selección vacía.
- [x] 5.5 Agregar en `package.json` el script `"test:affected": "node scripts/test-affected.mjs"`; no agregar dependencias ni inventar runner.
- [x] 5.6 Verificar que el consumidor no escribe archivos, no abre `.ancleto/memory.db` y no usa red.

## Fase 6 — Tests

- [ ] 6.1 Crear `test/test-selection.test.js` con unit tests del módulo puro: universo `U`, validación del manifiesto, unión de `selected` y complemento `excluded`.
- [ ] 6.2 Pin: sin `--tests`, el JSON de `ancleto affected` conserva exactamente `seeds`, `affected`, `unresolved` y `externalCount`, sin `tests`.
- [ ] 6.3 Pin: `--tests` selecciona por import, por coupling declarado y por `always`; `excluded` enumera el complemento exacto con `reason: "not-affected"`.
- [ ] 6.4 Pin: un test de `U` sin import a `src/` y no declarado produce `complete:false` con `manifest-gap`.
- [ ] 6.5 Pin: un archivo de `affected` con imports irresolubles produce `complete:false` con `unresolved-in-closure`.
- [ ] 6.6 Pin: manifiesto ausente/inválido/versión distinta/rutas fuera de `U` produce `complete:false` con `manifest-missing` o `manifest-invalid`; glob sin archivos produce `test-glob-missing`.
- [ ] 6.7 Pin: dos corridas con la misma semilla producen JSON byte-idéntico y orden estable en `selected`/`excluded`/`reasons`.
- [ ] 6.8 Pin: el consumidor en `--plan-only`/`--json` no ejecuta tests, y con `complete:false` cae a la suite completa imprimiendo `reasons`.
- [ ] 6.9 Pin de invariante negativa: `complete:true` no promete completitud semántica universal; un acoplamiento no-import dentro de un test declarado sólo se cubre si ese test está en `always`/`coupling`.
- [ ] 6.10 Verificar que `test/affected-set.test.js:505-533` sigue verde sin debilitar su invariante negativa.

## Fase 7 — Validación

- [x] 7.1 Ejecutar `npm run lint` (declarado en `PRODUCT.md` → `## Project Commands`).
- [ ] 7.2 Ejecutar `node --test "test/test-selection.test.js" "test/affected-set.test.js"` con rutas explícitas durante la implementación.
- [ ] 7.3 Ejecutar `npm test` (`node --test "test/*.test.js"`) y confirmar la suite completa en verde.

## Fase 8 — Spec sync y release

- [ ] 8.1 Verificar el delta `prompt-contracts` contra la implementación antes de archivar.
- [ ] 8.2 Archivar el change para promover el delta a `aspec/specs/prompt-contracts/spec.md`.
- [ ] 8.3 Bumpear la release a **MINOR 0.32.0** en `package.json`, `package-lock.json` y `CHANGELOG.md`, y actualizar `aspec/backlog.md`.
