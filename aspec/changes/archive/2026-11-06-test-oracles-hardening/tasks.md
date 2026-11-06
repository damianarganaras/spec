# Tasks: endurecimiento de oráculos de test (conformidad)

> Alcance: agregar oráculos de test para propiedades ya declaradas en `spec-sync` y
> `prompt-contracts`. Sin cambios en `src/**`, sin delta de specs, sin cambio observable de
> comportamiento.

## Tests

- [x] **T1 — Idempotencia y cero escrituras del dry-run de `specs merge`.**
  En `test/specs-merge.test.js`, sobre un fixture temporal:
  - Ejecutar dos veces consecutivas `specs merge --change <fixture> --dry-run --json` y afirmar
    stdout byte-idéntico y el mismo exit code en ambas corridas.
  - Afirmar cero escrituras acumuladas comparando un hash del árbol completo (rutas + contenidos)
    antes y después de la segunda corrida; usar `mtime` sólo como señal secundaria.
  - Repetir el caso fail-closed `specs merge --change archive --dry-run --json`: mismo exit 2 en
    ambas corridas y cero escrituras.
  Archivos: `test/specs-merge.test.js`.

- [x] **T2 — Oráculos de clasificación de imports dinámicos.**
  En `test/affected-set.test.js`, sobre un fixture temporal, afirmar la taxonomía cerrada:
  - `import('node:sqlite')` → externo: suma a `externalCount` y NO figura en `unresolved`.
  - `import('node:sqlite', { with: { type: 'json' } })` → `unresolved` como
    `import(<dynamic>)` (contrato conservador vigente, segundo argumento incluido).
  - `import(someVar)` → `unresolved` como `import(<dynamic>)`.
  - `import('./missing.js')` → `unresolved` como specifier relativo irresoluble.
  - `import('./exists.js')` → arista resuelta (el archivo destino entra al affected-set).
  Archivos: `test/affected-set.test.js`.

- [x] **T3 — Invariante negativa: un test que spawnea el CLI no entra al affected-set.**
  En `test/affected-set.test.js`, sobre un fixture temporal donde un archivo de test spawnea el CLI
  sin importarlo, afirmar que ese archivo de test NO entra al affected-set del source del CLI. El
  test debe enunciar explícitamente que documenta un límite estructural del grafo y que el
  affected-set NO es un contrato completo de selección de tests.
  Archivos: `test/affected-set.test.js`.

## Validación

- [x] **T4 — Validación declarada.**
  - `npm run lint`
  - `npm test` (glob declarado `test/*.test.js`)

  Format: `not-configured`. Typecheck: `n/a`.
