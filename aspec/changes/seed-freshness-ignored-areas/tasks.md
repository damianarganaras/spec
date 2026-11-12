# Tasks: Áreas ignoradas fuera de la frescura del seed

> Change funcional. Release **MINOR 0.29.0**. Sin `design.md`.
> Todas las tareas quedan abiertas; nada se marca como hecho en este change.

## 1. Implementación — lector de frescura

- [x] 1.1 Extender `isEphemeralSource` en `src/cli/index.js` (`:2372-2374`) para aceptar, anclados a
      la raíz, `rel === 'documentation'`/`rel.startsWith('documentation/')` y
      `rel === 'audit logs'`/`rel.startsWith('audit logs/')` (nombre literal con espacio), además de
      las reglas existentes de `.discovery-map.json` y `.ancleto`.
- [x] 1.2 Actualizar el comentario del predicado para declarar el anclaje a la raíz y las negativas:
      `docs/documentation/x.md`, `documentation-extra/x.md` y `src/documentation/x.js` NO son
      efímeras. No comparar por segmento arbitrario ni por prefijo del nombre de archivo.
- [x] 1.3 Verificar que el filtro simétrico existente en `checkDiscovery` (`:2532-2533`) ya cubre
      altas, bajas y modificaciones de esas dos áreas; no agregar un segundo punto de filtrado.
- [x] 1.4 No tocar `computeImpact`, `areaOf`, `isMaterialFile`, `MATERIAL_FILE_RES`,
      `DEFAULT_IGNORES`, `isEphemeralOnlyChange`, `walk`/`.gitignore`, la lista de ignore de Repomix
      ni el writer `src/core/discovery-state.js`; `ruleVersion` sigue en `2`.

## 2. Tests — pins en `test/cli.test.js`

- [x] 2.1 Pin: cambio de contenido bajo `documentation/` → `READY`, `impact:none`,
      `recommendedAction:continue`, `changedAreas`/`materialReasons`/`notes`/`affectedDocs` vacíos.
- [x] 2.2 Pin: ausencia total de `documentation/` respecto del estado → `READY`/`none` y sin
      `area raiz eliminada: documentation`.
- [x] 2.3 Pin: cambio de contenido bajo `audit logs/` → `READY`, arreglos vacíos.
- [x] 2.4 Pin: ausencia total de `audit logs/` → `READY`/`none` y sin
      `area raiz eliminada: audit logs`.
- [x] 2.5 Pin de anclaje: `docs/documentation/x.md`, `documentation-extra/x.md` y
      `src/documentation/x.js` NO son efímeras; un cambio en cada una reporta `STALE`/`minor` con su
      área (`docs`, `documentation-extra`, `src`).
- [x] 2.6 Pin: `src/app.js` modificado junto con churn de `documentation/` y `audit logs/` →
      `STALE`/`minor` con `changedAreas` exactamente `['src']` y `materialReasons: []`.
- [x] 2.7 Pin: cambio de contenido en `docs/` o en `aspec/` → `STALE`/`minor` con el área
      correspondiente, fijando que siguen contando.
- [x] 2.8 Pin: el estado persistido sigue listando rutas bajo `documentation/` y `audit logs/` en
      `sources`/`fileHashes`, y `--check` las ignora sin reescribir ni migrar el estado.
- [x] 2.9 Verificar que ningún pin existente cuyo fixture no incluya esas áreas cambió de resultado.

## 3. Spec delta

- [x] 3.1 Mantener `aspec/changes/seed-freshness-ignored-areas/specs/cli-diagnostics/spec.md` como
      MODIFIED con el cuerpo completo del Requirement, los 26 escenarios existentes y los 8 nuevos;
      el merge aplica en el archive.

## 4. Validación

- [x] 4.1 Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint` (declarado como
      `npm run lint`).
- [x] 4.2 Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test` (declarado como
      `npm test`); acotar con ruta explícita `test/cli.test.js`.
- [ ] 4.3 Registrar omisiones: format check `not-configured` (sin formatter declarado); typecheck no
      aplica (JavaScript ESM, sin `tsconfig.json`).

## 5. Archive y release

- [ ] 5.1 Archivar el change y mergear el delta a `aspec/specs/cli-diagnostics/spec.md`.
- [ ] 5.2 Release **MINOR 0.29.0**: `package.json`, `package-lock.json`, `CHANGELOG.md`.
- [ ] 5.3 Actualizar `aspec/backlog.md` y los documentos del seed tras la implementación.
- [x] 5.4 No tocar ni archivar `ancleto-vscode-extension`.
