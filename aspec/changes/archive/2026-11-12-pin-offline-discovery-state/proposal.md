# Proposal: pinear el estado de discovery offline con un módulo puro (conformidad)

## Clasificación

**Conformidad — sin delta.** Este change no cambia comportamiento observable: es un refactor
byte-idéntico del armado y la serialización del estado de discovery. La cita canónica que resuelve
es:

- `spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check`
  (`aspec/specs/cli-diagnostics/spec.md:568`).

La cláusula aplicable vive en `aspec/specs/cli-diagnostics/spec.md:689-696` y exige que el writer
"NO SHALL cambiar: SHALL seguir persistiendo
`{ version: 1, generatedAt, sources, fileHashes, hash, ruleVersion: 2, semantic, packTokens }`".
El contrato es sobre los **bytes persistidos**, no sobre la forma del código. Como el refactor no
altera ningún byte, no hay cambio observable ni delta de spec; no hay bump de versión ni release.
No se crea `specs/` y el archive debe reportar "sin delta".

## Contexto

- `packDiscovery` (`src/cli/index.js:2601-2631`) arma el estado inline y lo serializa con
  `JSON.stringify(..., null, 2) + '\n'` en `:2618-2627`.
- La suite no ejerce `packDiscovery` offline porque depende de Repomix (`runRepomix`); por eso los
  bytes persistidos del writer sólo están cubiertos de forma implícita.
- Deuda de origen:
  `aspec/changes/archive/2026-11-11-seed-freshness-version-bump-not-material/tasks.md:41-44`,
  tarea 4.3 `[ ]`. Se dejó fuera de alcance afirmar el estado persistido porque no era ejecutable
  offline.
- La cobertura existente sólo ejercita el lector (`discovery --check`).

## Propuesta

Extraer el armado y la serialización a un módulo puro, sin mover el fs ni el orden de escritura:

- Nuevo `src/core/discovery-state.js` con:
  - `DISCOVERY_STATE_VERSION = 1`.
  - `DISCOVERY_STATE_RULE_VERSION = 2`.
  - `buildDiscoveryState({ generatedAt, sources, fileHashes, hash, semantic, packTokens })`, que
    devuelve el objeto con orden de claves `version, generatedAt, sources, fileHashes, hash,
    ruleVersion, semantic, packTokens`. Es passthrough de `sources`, `fileHashes`, `hash`,
    `semantic` y `packTokens`: no reordena, no renormaliza y no hashea.
  - `renderDiscoveryState(state)`, que devuelve `JSON.stringify(state, null, 2) + '\n'`.
- `packDiscovery` en `src/cli/index.js` (zona `2601-2631`) usa ambos helpers. Conserva
  `writeDiscoveryMap(process.cwd())` **antes** del estado, `mkdir(outputDir)`,
  `new Date().toISOString()` como `generatedAt` y
  `writeFile(statePath(outputDir), renderDiscoveryState(...))`. `checkDiscovery`, `hashSources`,
  `computeSources`, `runRepomix` y `statePath` no se tocan.
- Test en `test/cli.test.js`, importando el helper:
  - golden del string serializado con `generatedAt` inyectado;
  - `assert.deepEqual(Object.keys(state), [...])` en orden;
  - `Object.keys(state.semantic)`, `version === 1` y `ruleVersion === 2`;
  - exactamente un `\n` final, con invariante negativa explícita: nunca `\n\n`;
  - ausencia de BOM.

**Descartado:** stub de Repomix por PATH en un árbol temporal (win32/PowerShell 5.1, shim `.cmd`,
`shell: true`, `resolveBin`/`where` con PATHEXT, fallback `npx`). Tiene costo alto, es un falso
oráculo y acopla el test a Repomix, al token budget y a `npx`, que son ajenos al contrato del
estado. Además no cubre el orden `writeDiscoveryMap` → estado.

## Fuera de alcance

- El orden `writeDiscoveryMap` → estado: no es contrato de la spec y no se pinea.
- Repomix real, token budget y fallback `npx`.
- `checkDiscovery`, `hashSources`, `computeSources` y `statePath`.
- Cualquier bump de versión, tag o publish.
- Superficies de modelo (`agents/`, `.opencode/`, `opencode.json`).
- `ancleto-vscode-extension`.
- Reconciliación de `docs/PLAN`, `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` u otros documentos.
- Delta specs: no aplica a un change de conformidad.

## Paths autorizados

- `src/core/discovery-state.js` (nuevo).
- `src/cli/index.js` (sólo la zona `packDiscovery`).
- `test/cli.test.js`.
- `aspec/changes/pin-offline-discovery-state/`.
- En el cierre: `aspec/backlog.md` y el seed regenerado, sólo si el chequeo de frescura lo indica y
  con aprobación explícita.

## Validación planificada

Validaciones declarativas, según `PRODUCT.md` → `## Project Commands`:

- Lint: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- Tests: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test`.
- Tests acotados: `node --test test/cli.test.js` (ruta explícita; el runner declarado es Node Test
  Runner).
- Format: `not-configured` (el repo no declara formatter).
- Typecheck: `n/a` (no declarado; el paquete es JavaScript ESM puro).

## Decisiones

**memory_key:** discovery-state-pure-builder-serializer
**Elección:** extraer el armado y la serialización del estado de discovery a un módulo puro
`src/core/discovery-state.js` (`buildDiscoveryState` + `renderDiscoveryState`) usado por
`packDiscovery` y por la suite; el fs y el orden map→state quedan en `packDiscovery`.
**Descartado:** stub de Repomix por PATH en árbol temporal.
**Justificación:** una sola implementación testeable offline sin duplicar normalización ni el
oráculo de hashes; el serializador puro permite pinear los bytes exactos que persistía 0.28.0.
**Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:pin-offline-discovery-state

**Estado:** aprobado

**memory_key:** discovery-writer-contract-is-persisted-bytes
**Elección:** interpretar "El writer del pack NO SHALL cambiar" como contrato sobre los bytes
persistidos; un refactor byte-idéntico es conformidad sin delta.
**Descartado:** interpretar la frase como prohibición de tocar el código de `packDiscovery`
(habría exigido un delta MODIFIED).
**Justificación:** el Requirement dice "SHALL seguir persistiendo {...}" y lo justifica por la
lectura previa de los campos crudos y `semantic`.
**Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:pin-offline-discovery-state

**Estado:** aprobado

## Riesgos y supuestos

- Supuesto: `packTokens` se sigue calculando en `packDiscovery`; el helper lo recibe ya calculado.
- El golden pinea los bytes exactos. Cualquier cambio intencional futuro de la forma del estado
  debe actualizar el golden junto con la cita de la spec; es el efecto buscado del pin.
- El test importa el helper y verifica el contrato de bytes persistidos, no el cableado de fs de
  `packDiscovery`. El reemplazo es de dos líneas y queda cubierto por revisión; el orden
  map→state está explícitamente fuera de contrato.
- Si el archive intenta sincronizar specs, el change de conformidad no debe crear `specs/`; el
  resultado esperado es "sin delta".
