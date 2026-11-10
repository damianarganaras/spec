# Tasks: Documentar y pinear el detector de frescura del seed

## 1. Delta de spec

- [x] 1.1 Escribir el delta `ADDED` en
  `aspec/changes/spec-seed-freshness-detector/specs/cli-diagnostics/spec.md` con un único
  `## ADDED Requirements` y el Requirement
  `### Requirement: Clasificación determinista de frescura del seed en discovery --check`, con los
  nueve scenarios y las formas exactas de `materialReasons`/`notes`.

## 2. Tests de pin

- [x] 2.1 Agregar en `test/cli.test.js` tests de pin que reutilicen `seedFixture` y cubran los nueve
  scenarios del Requirement, afirmando `state`, `impact`, `recommendedAction`, `changedAreas`,
  `materialReasons`/`notes` y `affectedDocs` —no sólo `impact`.
- [x] 2.2 Incluir la invariante negativa de un cambio no material en un área existente (`minor`) y
  un snapshot de read-only que compare bytes y `mtime` antes y después de `discovery --check`.

## 3. Verificación

- [x] 3.1 Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint` y registrar el
  resultado.
- [x] 3.2 Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test` y registrar el
  resultado.
