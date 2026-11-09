# Tasks: fix-discovery-seedmap-present

## 1. Implementación

- [x] 1.1 En `checkDiscovery`, leer `seed-map.json` con `readSeedMap(outputDir)` una sola vez antes de la bifurcación de estados y asignar `seedMapPresent = seedMap !== null`, con independencia de `READY`, `STALE`, `PARTIAL` o `MISSING`. Archivo: `src/cli/index.js`.
- [x] 1.2 Mantener `affectedDocs` calculado sólo en el branch `STALE` mediante `affectedDocsFor(seedMap, changedAreas)`; en `READY`, `PARTIAL` y `MISSING` debe quedar `[]`. Archivo: `src/cli/index.js`.

## 2. Tests

- [x] 2.1 Cubrir `READY` + seed-map válido: `state:READY`, `impact:none`, `recommendedAction:continue`, `seedMapPresent:true`, `affectedDocs:[]` y exit 0. Archivo: `test/cli.test.js`.
- [x] 2.2 Cubrir `READY` sin seed-map: `seedMapPresent:false`, `affectedDocs:[]` y estado `READY` intacto. Archivo: `test/cli.test.js`.
- [x] 2.3 Cubrir `STALE` válido (`minor` y `material`): `seedMapPresent:true` y `affectedDocs` igual a la intersección esperada, sin cambios respecto del comportamiento actual. Archivo: `test/cli.test.js`.
- [x] 2.4 Cubrir `STALE` con seed-map ausente o malformado: `seedMapPresent:false`, `affectedDocs:[]`, sin excepción y exit 0. Archivo: `test/cli.test.js`.
- [x] 2.5 Cubrir seed-map con `docs` no-objeto plano (arreglo/null) → `seedMapPresent:false`, `affectedDocs:[]`, exit 0. Archivo: `test/cli.test.js`.

## 3. Validación

- [x] 3.1 Ejecutar `npm run lint`.
- [x] 3.2 Ejecutar `npm test`.
