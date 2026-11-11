# Tasks: Bump de version no material para la frescura del seed

## 1. Normalización y hashes en `src/cli/index.js`

- [x] 1.1 Agregar en `src/cli/index.js` un normalizador byte-preserving para el `package.json` de la
  raíz que reemplace únicamente el valor del escape de la clave `version` de primer nivel por un
  centinela fijo, preservando indentación, orden de claves y `version` anidadas; si el JSON no
  parsea o `version` no es un string de primer nivel, devolver el contenido crudo.
- [x] 1.2 Extender `hashSources` en `src/cli/index.js` para calcular un segundo acumulado con el
  contenido normalizado, sin alterar los hashes crudos por archivo ni el hash global existente.
- [x] 1.3 Agregar tests unitarios del normalizador en `test/cli.test.js` que cubran bump de `version`,
  reformateo, `version` anidada, JSON inválido y `version` no-string.

## 2. Escritura aditiva del estado en `packDiscovery`

- [x] 2.1 En `packDiscovery` de `src/cli/index.js`, escribir el estado con `hash` y `fileHashes`
  crudos, más `ruleVersion: 2` y `semantic: { hash, fileHashes }` con los hashes normalizados, sin
  cambiar la forma de los campos previos.

## 3. Vista efectiva en `checkDiscovery`

- [x] 3.1 En `checkDiscovery` de `src/cli/index.js`, construir la vista efectiva de hashes: preferir
  `semantic.hash` y `semantic.fileHashes` cuando `ruleVersion === 2`, y usar la regla cruda en
  cualquier otro caso, incluido un estado legacy sin `ruleVersion`.
- [x] 3.2 Verificar que la vista efectiva se arme antes de llamar a `computeImpact` y que
  `computeImpact`, `areaOf`, `isMaterialFile`, `MATERIAL_FILE_RES` y `DEFAULT_IGNORES` queden sin
  cambios.
- [x] 3.3 Cubrir en `test/cli.test.js` que `discovery --check` sigue siendo read-only y no migra ni
  reescribe estados legacy.

## 4. Tests de pin en `test/cli.test.js`

- [x] 4.1 Extender el fixture de discovery para parametrizar el contenido del `package.json` de la
  raíz, `package-lock.json` y `CHANGELOG.md`.
- [x] 4.2 Agregar pins discriminantes que afirmen `state`, `impact`, `recommendedAction`,
  `changedAreas` y `materialReasons`: bump-only con lock/CHANGELOG (`minor`/`continue`, sin
  materialidad), bump-only como único cambio (`READY`/`none`), cambio real en `package.json` sin
  tocar `version` (`material`), bump + cambio real (`material`), reformateo (`material`), `version`
  anidada (`material`), estado legacy sin `ruleVersion` (comportamiento previo) y `version`
  no-string o JSON inválido (hash crudo).
- [ ] 4.3 Afirmar en `test/cli.test.js` que un estado persistido nuevo conserva `hash` y
  `fileHashes` crudos junto con `ruleVersion: 2` y `semantic`. — Fuera de alcance: `discovery` (pack)
  depende de repomix y no es ejecutable offline en la suite; la suite sólo ejercita `--check` y se
  cubrió el lector. No se agregó un stub que sustituya al código real.

## 5. Guard del delta no canónico en `test/delta-spec-structure.test.js`

- [x] 5.1 Agregar un guard fail-closed que falle cuando existe un `spec.md` bajo un change activo en
  una ruta distinta de `aspec/changes/<change>/specs/<capability>/spec.md`, reutilizando
  `parseDeltaSpec`, `withRoot` y `writeDelta` del mismo archivo.
- [x] 5.2 Excluir `aspec/changes/archive/**` del barrido en `test/delta-spec-structure.test.js` por
  identidad del nombre de la entrada.

## 6. Validación

- [x] 6.1 Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint` y registrar el
  resultado.
- [x] 6.2 Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test` y registrar el
  resultado.
