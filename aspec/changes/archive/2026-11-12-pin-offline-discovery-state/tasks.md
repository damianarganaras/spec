# Tasks: pin offline del estado de discovery

## 1. Módulo puro `src/core/discovery-state.js`

- [x] 1.1 Crear `src/core/discovery-state.js` con `DISCOVERY_STATE_VERSION = 1` y
  `DISCOVERY_STATE_RULE_VERSION = 2`.
- [x] 1.2 Implementar `buildDiscoveryState({ generatedAt, sources, fileHashes, hash, semantic,
  packTokens })` con el orden exacto de claves `version, generatedAt, sources, fileHashes, hash,
  ruleVersion, semantic, packTokens`, como passthrough sin reordenar, renormalizar ni hashear.
- [x] 1.3 Implementar `renderDiscoveryState(state)` como `JSON.stringify(state, null, 2) + '\n'`.

## 2. Cableado de `packDiscovery`

- [x] 2.1 Importar `buildDiscoveryState` y `renderDiscoveryState` en `src/cli/index.js`.
- [x] 2.2 Reemplazar sólo el armado y la serialización inline de `packDiscovery` por ambos
  helpers, conservando `writeDiscoveryMap(process.cwd())` antes del estado, `mkdir(outputDir)`,
  `new Date().toISOString()` como `generatedAt` y `writeFile(statePath(outputDir), ...)`.
- [x] 2.3 Confirmar que `checkDiscovery`, `hashSources`, `computeSources`, `runRepomix` y
  `statePath` no cambian, y que el orden map→state queda igual.

## 3. Tests en `test/cli.test.js`

- [x] 3.1 Importar `buildDiscoveryState` y `renderDiscoveryState` en `test/cli.test.js`.
- [x] 3.2 Agregar un golden del string serializado con `generatedAt` inyectado.
- [x] 3.3 Afirmar `assert.deepEqual(Object.keys(state), [...])` en orden, `Object.keys(state.semantic)`,
  `version === 1` y `ruleVersion === 2`.
- [x] 3.4 Afirmar exactamente un `\n` final (nunca `\n\n`) y la ausencia de BOM.

## 4. Validación declarada

- [x] 4.1 Correr el test acotado con ruta explícita: `node --test test/cli.test.js`.
- [x] 4.2 Correr lint: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- [x] 4.3 Correr la suite declarada: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test`.
- [x] 4.4 Registrar format como `not-configured` y typecheck como `n/a` (no declarados).

## 5. Cierre

- [ ] 5.1 Verificar que no exista `aspec/changes/pin-offline-discovery-state/specs/` ni delta, y
  que la cita `spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check`
  resuelve contra `aspec/specs/cli-diagnostics/spec.md`.
- [ ] 5.2 Verificar que la `version` de `package.json` no cambió y que no se creó tag ni publish.
- [ ] 5.3 Actualizar `aspec/backlog.md` con lo hecho, lo descartado y lo pendiente.
- [ ] 5.4 Antes de archivar, chequear la frescura del seed en modo read-only; regenerarlo sólo con
  aprobación explícita si está `STALE` con `impact: material`. Ejecutar el archive, que debe
  reportar "sin delta".
