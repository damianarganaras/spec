# Proposal: endurecimiento de oráculos de test (conformidad)

## Intención

Cerrar tres huecos de cobertura que dejan sin oráculo ejecutable propiedades ya declaradas en las
specs canónicas: la idempotencia byte a byte del dry-run de `specs merge`, la clasificación
conservadora de imports dinámicos y el límite estructural del affected-set cuando un archivo de test
spawnea el CLI sin importarlo. Es un change de **conformidad**: no cambia comportamiento observable
ni contratos; agrega tests que fijan lo que el producto ya hace.

## Alcance

### Incluye

- **T1 — Idempotencia del dry-run de `specs merge`.** En `test/specs-merge.test.js`, un fixture
  temporal corre dos veces `specs merge --change <fixture> --dry-run --json` y afirma stdout
  byte-idéntico, mismo exit code y cero escrituras acumuladas (hash/mtime del árbol). Incluye el caso
  fail-closed de `--change archive --dry-run` repetido: mismo exit 2 y cero escrituras.
- **T2 — Oráculos de clasificación de imports dinámicos.** En `test/affected-set.test.js`, un fixture
  temporal fija la taxonomía cerrada: `import('node:sqlite')` → externo (`externalCount`, nunca
  `unresolved`); `import('node:sqlite', { with: { type: 'json' } })` → `unresolved` como
  `import(<dynamic>)`; `import(someVar)` → `unresolved`; `import('./missing.js')` → `unresolved`;
  `import('./exists.js')` → arista resuelta.
- **T3 — Invariante negativa del affected-set.** En `test/affected-set.test.js`, un fixture temporal
  donde un archivo de test spawnea el CLI sin importarlo demuestra que ese test NO entra al
  affected-set del source del CLI, y enuncia explícitamente que el affected-set NO es un contrato
  completo de selección de tests.
- **T4 — Validación declarada.**

### Fuera de alcance (exclusiones explícitas)

- NO se toca `src/**` ni se agregan flags, comandos ni opciones.
- NO se toca `agents/**`, `skills/**`, `commands/**`, `templates/**` ni `.opencode/**`.
- NO se modifica `aspec/specs/**`: este change no lleva delta.
- NO se reabre CH-06b, CH-00, CH-07, la extensión VS Code ni la reconciliación de docs de
  reingeniería.
- NO hay cambio observable de comportamiento: es un release patch documental/test.

## Requisitos citados (conformidad)

Sin delta en `specs/`. Los requisitos que estos tests vuelven ejecutables ya existen y resuelven al
heading canónico exacto:

- `spec:spec-sync#Dry-run sin escrituras en specs merge` — el dry-run computa y reporta el plan sin
  escribir, con los mismos exit codes que la ejecución real.
- `spec:spec-sync#Merge determinístico de delta specs sobre specs canónicos existentes` — el merge es
  determinístico e idempotente; dos corridas producen el mismo resultado y un plan sin cambios no
  escribe.
- `spec:prompt-contracts#affected-set determinístico por grafo de imports` — el clasificador es
  conservador por argumento: un specifier no relativo de un `import(...)` literal puro es externo
  (`externalCount`), y cualquier otro argumento cae en `unresolved`.

## Hechos verificados

- `staticCallSpecifier` (`src/core/affected-set.js`) sólo acepta como estático un literal puro
  seguido de `)`; los specifiers no relativos suman `externalCount` en `buildImportGraph`. Por eso
  `import('node:sqlite')` ya es externo, no un defecto.
- `import('node:sqlite', { with: { type: 'json' } })` cae en `unresolved` como `import(<dynamic>)`
  **por diseño conservador declarado**: el segundo argumento es "cualquier otro argumento".
- Reporte real (`affected --cwd . --json src/core/affected-set.js`): `affected`=3, `unresolved`=22
  (8 `import(<dynamic>)`, 4 `require(<dynamic>)`, 10 relativos), `externalCount`=469. `node:sqlite`
  NO aparece en `unresolved`.
- `test/cli.test.js` no importa `src/cli/index.js`: lo spawnea, así que nunca entra al affected-set
  del CLI. Es una limitación estructural del grafo, no un bug.
- `specs merge --change <slug> --dry-run --json` dos veces: exit code idéntico, stdout byte-idéntico
  y cero escrituras (hash de árbol igual). `--change archive --dry-run` sale 2 con cero escrituras.
- Hoy sólo hay un test de dry-run; no hay test que lo ejecute dos veces ni que afirme byte-identidad
  y cero escrituras acumuladas.
- En `test/affected-set.test.js` faltan el caso `import('node:sqlite')` explícito, el caso
  `import('node:sqlite', { ... })` y la invariante negativa de "archivo que spawnea no entra al
  affected-set".

## Decisión de arquitectura

No aplica: no se introduce capa, contrato ni abstracción nueva. El change sólo agrega oráculos de
test sobre contratos vigentes. Las decisiones durables quedan en `## Decisiones`.

## Riesgos y mitigación

- **Test frágil por hash/mtime del árbol.** Mitigación: comparar el árbol completo con una función de
  hash determinística sobre rutas y contenidos, y usar `mtime` sólo como señal secundaria en un
  fixture temporal aislado.
- **`import('node:sqlite', { with: ... })` podría leerse como un defecto a corregir.** Mitigación:
  T2 afirma el contrato conservador vigente (`unresolved`), no un comportamiento deseado alternativo,
  y el test enuncia el porqué.
- **El invariante negativo de T3 podría interpretarse como un bug.** Mitigación: el test documenta
  explícitamente que reproduce un límite estructural del grafo y que el affected-set no es un
  contrato completo de selección de tests.
- **Duplicar oráculos existentes.** Mitigación: T1 cubre la doble corrida y la byte-identidad que hoy
  no existen; T2/T3 cubren exactamente los casos ausentes.

## Validación planificada

- `npm run lint`
- `npm test` (glob declarado `test/*.test.js`)
- Format: `not-configured` (el repositorio no declara formatter).
- Typecheck: `n/a` (paquete JavaScript sin `tsconfig.json`).

## Rutas autorizadas

- `test/specs-merge.test.js` — T1.
- `test/affected-set.test.js` — T2 y T3.
- `aspec/changes/test-oracles-hardening/**` — artefactos del change.

No se crea ni modifica `aspec/specs/**`: change de conformidad sin delta.

## Decisiones

- **memory_key:** affected-set-dynamic-classification-already-conformant
  **Elección:** El clasificador del affected-set ya trata como externo todo specifier no relativo de
  un `import(...)`/`require(...)` cuyo argumento es un literal puro; `import('node:sqlite')` NO es un
  defecto y NO debe reimplementarse.
  **Descartado:** Abrir un change correctivo que reclasifique `import('node:sqlite')`.
  **Justificación:** El símbolo `staticCallSpecifier` y `buildImportGraph` ya implementan la
  taxonomía declarada, y el reporte real no lista `node:sqlite` en `unresolved`; reimplementarlo
  duplicaría una regla vigente. Verificar por símbolo antes de abrir un change evita trabajo
  especulativo.
  **Estado:** aprobado

refs:
  - path:src/core/affected-set.js
  - path:test/affected-set.test.js
  - path:aspec/specs/prompt-contracts/spec.md
  - change:test-oracles-hardening

- **memory_key:** affected-set-projection-deferred-structural
  **Elección:** Mantener diferida la proyección `affected ∩ test/*.test.js` porque su incompletitud es
  estructural, no trabajo pendiente.
  **Descartado:** Declarar la proyección como "contrato completo" o implementarla ahora.
  **Justificación:** Las suites que spawnean el CLI no tienen arista de import y los content guards
  leen markdown que el grafo no indexa; declararla completa no la vuelve segura. Sólo se reabre con
  un consumidor probado y un contrato que nombre las suites excluidas.
  **Estado:** aprobado

refs:
  - path:test/cli.test.js
  - path:test/content-guards.test.js
  - path:src/core/affected-set.js
  - path:aspec/specs/prompt-contracts/spec.md
  - change:test-oracles-hardening

- **memory_key:** specs-merge-write-atomicity-deferred-again
  **Elección:** No implementar atomicidad multi-archivo en la fase de escritura de `specs merge`.
  **Descartado:** Temp+backup+rollback sobre la fase de escritura.
  **Justificación:** No da atomicidad real entre renames, agrega sidecars fuera del alcance declarado
  y convertiría una exclusión explícita en una garantía no sostenible. La propiedad valiosa es el
  fail-closed del plan con cero escrituras, no la atomicidad de la escritura.
  **Estado:** descartado

refs:
  - path:src/cli/index.js
  - path:aspec/specs/spec-sync/spec.md
  - change:test-oracles-hardening
