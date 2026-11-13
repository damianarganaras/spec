# Proposal: Selección determinística y segura de tests por affected-set

## Contexto y problema

`ancleto affected` computa hoy un `affected-set` correcto como **clausura de dependientes** sobre el
grafo de imports (`src/core/affected-set.js`: `buildImportGraph` en `:214-250`, `computeAffectedSet`
en `:253-280`), pero ese conjunto **no es un contrato de selección de tests**. El grafo sólo indexa
`.js/.mjs/.cjs/.ts/.tsx` (`:29`, `:51-52`) y sólo crea aristas para relativos resolubles (`:200-209`,
`:232-233`). Las suites que ejercitan un módulo sin importarlo quedan fuera por construcción.

Evidencia empírica sobre el working tree (entrypoint `node src/cli/index.js`):

```
node src/cli/index.js affected --json src/cli/index.js
→ affected = ["src/cli/index.js"]   (1 archivo)
  unresolved = 26, externalCount = 494, exit 0
```

Es decir: **un cambio al CLI no selecciona `test/cli.test.js`**, la suite que más lo ejercita. El
contrato actual (`src/cli/index.js:3838`) es exactamente
`{ seeds, affected, unresolved, externalCount }`, y el handler (`:3811-3852`) trata cualquier token
que no sea `--json`/`--cwd` como semilla (`:3819-3828`); el exit 1 sólo ocurre por uso inválido
(`:3814-3816`, `:3829-3831`).

Clases de escape verificadas, una por archivo y con `file:line`:

- **Spawn del CLI sin arista de import:** `test/cli.test.js:16,20`; `test/stats-failures.test.js:12,16`;
  `test/specs-merge.test.js:22,26`; `test/memory-pr1-contract.test.js:21,53`;
  `test/discovery-topology.test.js:11,14`; `test/mcp.test.js:13,35,66`;
  `test/memory-engine.test.js:2003,2040`; `test/curation.test.js:20,55`;
  `test/affected-set.test.js:11,27`.
- **Lectura de markdown/templates/skills/agents/commands/docs:** `test/content-guards.test.js:44-46,54,120,172-179,300,517,1558,2532`;
  `test/cli.test.js:274-276,925,968,984,1165`; `test/agent-model-coherence.test.js:27,31,94,97,105`;
  `test/model-catalog-discovery.test.js:22-25`; `test/adapters-frontmatter.test.js:301`;
  `test/linter-config.test.js:42,52`.
- **DB directa:** `test/stats-failures.test.js:8,49,100,764,772` usa `DatabaseSync` y el esquema de
  `src/core/memory/database.js` sin importarlo.
- **`import()` dinámico:** los literales de `test/memory-fixtures.test.js:1239,1284` sí crean arista;
  el import embebido en un string `-e` de `test/cli.test.js:5852` no.
- **Sin arista a `src/` en absoluto:** `test/stats-failures.test.js`, `test/linter-config.test.js`.

El límite ya está documentado como invariante negativa en `test/affected-set.test.js:505-533`: una
suite spawn-only no entra al `affected-set`. Lo que falta es un **contrato de selección** que nombre
las suites excluidas y sus razones, en lugar de dejar que un consumidor confunda "affected-set" con
"tests a correr". El inventario es de 22 archivos `test/*.test.js` y la suite declarada es
`node --test "test/*.test.js"` (`package.json:35`, `PRODUCT.md` → `## Project Commands`). No existe
manifiesto test→target ni CI de tests adicional.

Es un cambio **funcional** (no de conformidad): agrega una superficie observable nueva
(`ancleto affected --tests`) y un plan de selección, sin alterar el comportamiento actual sin el flag.

## Requisito citado

- `spec:prompt-contracts#affected-set determinístico por grafo de imports`
  (`aspec/specs/prompt-contracts/spec.md:565`).

La capability correcta es `prompt-contracts`: allí vive el contrato del `affected-set` como objetivo
de verificación de `@tester` y scope de review de `@reviewer` (`:567`), y el uso del affected-set como
scope ya está fijado en `aspec/specs/review/spec.md:168,189-192`. El delta agrega un requirement nuevo
(`## ADDED Requirements`) y **no** reescribe el requirement existente.

## Alcance

In scope:

- `src/core/test-selection.js` (nuevo) — módulo puro que computa el plan de selección reutilizando
  `computeAffectedSet`; sin duplicar el grafo.
- `test/affected-tests.json` (nuevo) — manifiesto cerrado `version: 1` con `always` y `couplings`.
- `src/cli/index.js` — flag aditivo `--tests` en `affectedCommand` (`:3811-3852`) y su despacho; el
  JSON sin `--tests` queda byte-idéntico.
- `scripts/test-affected.mjs` (nuevo) y script `test:affected` en `package.json` — consumidor que
  computa el plan sin spawnear el CLI, ejecuta `node --test` con rutas explícitas sólo si
  `complete === true`, y cae a la suite completa declarada si no.
- Tests en `test/test-selection.test.js` (nuevo).
- Delta `aspec/changes/ch-06b-affected-test-selection/specs/prompt-contracts/spec.md`; el merge a
  `aspec/specs/prompt-contracts/spec.md` ocurre sólo en el archive.

Out of scope (explícito):

- **No** se modifica `computeAffectedSet` ni su JSON sin `--tests` (mismos cuatro campos, mismo orden,
  mismos valores; `src/cli/index.js:3838`).
- **No** se toca CI/`publish.yml` en esta release.
- **No** se toca la DB real `.ancleto/memory.db`; el plan es read-only.
- **No** se implementa análisis estático de tests como selector (no se parsea el cuerpo de un test
  para inferir qué módulo ejercita).
- **No** se agregan dependencias de runtime ni se inventa un runner distinto del declarado.
- **No** se tocan `.opencode/**`, las tres superficies de modelo (`agents/*.md`,
  `.opencode/agents/*.md`, `opencode.json`), `~/.config/opencode/**`,
  `aspec/changes/ancleto-vscode-extension/`, `docs/PLAN*` ni `docs/BACKLOG_*`.

## Opciones evaluadas

| Opción | Gana | Cuesta | Release | Riesgos |
|---|---|---|---|---|
| (a) NO-OP: documentar el límite y cerrar sin código | Cero superficie nueva; el invariante de `test/affected-set.test.js:505-533` ya lo enuncia | Un cambio al CLI sigue sin seleccionar `test/cli.test.js` (evidencia empírica); el consumidor sigue sin contrato de exclusión | PATCH / no-op | Falsa confianza: "affected-set" se usa como si fuera "tests a correr"; cobertura silenciosa |
| (b) Manifiesto estático puro: mapa test→target sin grafo | Simple, determinista, sin acoplarse al grafo | Mantenimiento manual total; todo archivo nuevo sin declarar es un hueco silencioso; no aprovecha la clausura ya existente | MINOR | Deriva del manifiesto no detectada; selección insegura ante cambios en `src/` |
| (c) Grafo puro: tests derivados sólo del affected-set | Sin manifiesto; reutiliza el cómputo existente | Las 9 suites spawn-only, las lectoras de markdown y la de DB directa nunca se seleccionan; `test/stats-failures.test.js` y `test/linter-config.test.js` no tienen arista a `src/` | MINOR | Sub-selección insegura: es exactamente el fallo actual, ahora presentado como contrato |
| **(d) Híbrido (elegido): grafo + manifiesto cerrado + gate fail-closed** | Cubre ambos mundos (aristas reales y acoplamientos no-import), nombra exclusiones y nunca miente sobre completitud | Un manifiesto versionado que mantener y un gate `complete` que implementar y testear | **MINOR 0.32.0** | Manifiesto desactualizado → lo detecta `manifest-gap` y degrada a suite completa, no a selección parcial |

Se elige **(d)**. Es el único que hace la selección **segura** (nunca corre un subconjunto cuando el
cierre no es confiable) y **determinista** (orden estable, razones explícitas) sin reabrir el
`affected-set` ni romper el contrato actual.

## Release

**MINOR 0.32.0** (FASE 2). Justificación observable: se agrega superficie pública nueva y aditiva
—flag `--tests`, objeto `tests` en el JSON y script `test:affected`— sin cambio breaking: sin el flag,
la salida actual es byte-idéntica y el exit code no cambia. Semver: funcionalidad nueva compatible →
MINOR.

## Rollback

- El campo `tests` es **aditivo**; sin `--tests` el JSON es el actual.
- Un binario viejo trata `--tests` como semilla (por `src/cli/index.js:3819-3828`), de modo que la
  respuesta no trae `tests`. Por eso el consumidor **DEBE** exigir `tests.complete === true` (o la
  presencia de `tests`) y, en su defecto, caer a la suite completa declarada. Nunca interpreta la
  ausencia del campo como "selección vacía".
- El manifiesto es estático `version: 1`, sin migración: revertir el código lo deja inerte, porque un
  JSON no es nodo del grafo (sólo se indexan `.js/.mjs/.cjs/.ts/.tsx`, `:29`, `:51-52`).

## Riesgos con mitigación

- **Manifiesto incompleto o desactualizado:** un test nuevo sin arista a `src/` y sin declarar produce
  `complete:false` con `manifest-gap`, y el consumidor corre la suite completa. El modo degradado es
  el seguro.
- **Cierre no confiable por imports irresolubles:** cualquier archivo de `affected` con imports no
  resueltos produce `complete:false` con `unresolved-in-closure`. No se asume cobertura.
- **Selección demasiado angosta por coupling mal declarado:** el manifiesto declara `trigger` (globs)
  y `tests`; un `trigger` que no interseca `affected` deja la suite fuera, pero el gate de
  completitud no lo detecta. Mitigación: los couplings del repo cubren una por una las clases de
  escape verificadas arriba, y los tests pinean cada clase.
- **Confundir `complete:true` con cobertura semántica universal:** se documenta como invariante
  negativa explícita y se pinea en el delta y en tests.
- **Determinismo aparente por orden de filesystem:** `selected`, `excluded` y `reasons` se ordenan
  lexicográficamente; dos corridas idénticas deben producir JSON byte-idéntico.

## Decisiones

**memory_key:** affected-test-selection-hybrid-closed-manifest

**Elección:** `ancleto affected --tests` combina la clausura del grafo con un manifiesto cerrado
`test/affected-tests.json` (`always` + `couplings`) y devuelve `tests.selected`/`tests.excluded`
sobre el universo `test/*.test.js`; el cómputo vive en `src/core/test-selection.js` y reutiliza
`computeAffectedSet` sin duplicar el grafo.

**Descartado:** NO-OP/documentar el límite; manifiesto estático puro; grafo puro.

**Justificación:** el grafo no ve spawn ni lecturas de markdown/DB (`test/cli.test.js:16,20`;
`test/stats-failures.test.js:8,49`; `test/content-guards.test.js:44-46`) y el manifiesto puro deriva;
el híbrido cubre ambos sin tocar `computeAffectedSet` ni el JSON actual sin `--tests`.

**Refs:**
- spec:prompt-contracts#affected-set determinístico por grafo de imports
- change:ch-06b-affected-test-selection

**Estado:** aprobado

**memory_key:** affected-test-selection-complete-gate-fail-closed

**Elección:** `tests.complete` es un gate fail-closed: sólo `true` habilita ejecutar `selected`; ante
`manifest-missing`, `manifest-invalid`, `manifest-gap`, `test-glob-missing` o `unresolved-in-closure`
el consumidor corre la suite completa declarada, y `complete:true` no promete completitud semántica
universal.

**Descartado:** asumir completitud cuando el manifiesto está incompleto o el cierre tiene imports
irresolubles; inferir tests por heurística estática.

**Justificación:** la selección debe ser segura y determinista; un falso `complete` produce cobertura
silenciosa, mientras que el fallback a la suite completa es el modo seguro y observable.

**Refs:**
- spec:prompt-contracts#affected-set determinístico por grafo de imports
- change:ch-06b-affected-test-selection

**Estado:** aprobado
