# Tasks: Patrones de exclusión del discovery con semántica de glob segment-aware

> Change funcional. Release **MINOR 0.30.0**. Sin `design.md` (retirado del flujo nuevo).
> Tareas 1.x–4.x implementadas y verificadas; la sección 5.x (release, archive, backlog y seed)
> queda abierta.

## 1. Implementación — matcher

- [x] 1.1 Reescribir `matchesGlob` en `src/cli/index.js` (`:2187-2212`) como traducción por tokens:
      escapar todo metacarácter incluido `*` y `?`; consumir `**/` → `(?:.*/)?`, `/**` →
      `(?:/.*)?`, `**` → `.*`, `*` → `[^/]*`, `?` → `[^/]`, en ese orden. Anclar `^...$` cuando el
      patrón contiene `**`. **Archivo:** `src/cli/index.js`.
- [x] 1.2 Conservar byte-equivalente la rama sin `**`: `*` → `[^/]*` y prefijo `^(?:...)(?:/|$)`,
      de modo que `public`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml` y archivos raíz
      mantengan su resultado actual. **Archivo:** `src/cli/index.js`.
- [x] 1.3 Verificar que la traducción no lanza con `?` ni con patrones sin comodines, y que no
      introduce un segundo matcher ni una dependencia nueva. **Archivo:** `src/cli/index.js`.
- [x] 1.4 No tocar `DEFAULT_IGNORES` (`:2162`), `loadDiscoveryConfig` (`:2165-2179`), `isIgnored`
      (`:2214-2217`), `walk` (`:2219-2232`), `computeSources` (`:2234-2239`), `outputDir`,
      `checkDiscovery`/`computeImpact`, el writer, `schemaVersion` ni `ruleVersion`.
      **Archivo:** verificación en `src/cli/index.js` y `src/core/discovery-state.js`.
- [x] 1.5 No tocar `buildRepomixArgs` (`:2620`) ni `src/core/repomix-tier.js`; registrar que
      el `--ignore` de Repomix sigue delegando en minimatch. **Archivo:** verificación.

## 2. Tests

- [x] 2.1 Pins de matcher en `test/cli.test.js`: `**/*.test.*` y `**/*.spec.*` excluyen raíz y
      anidado; `**/__tests__/**` excluye raíz y anidado; `**/*.png` sigue excluyendo raíz y
      anidado. **Archivo:** `test/cli.test.js`.
- [x] 2.2 Pins de conservación: `public` y `package-lock.json` mantienen el anclaje de raíz;
      `public-x`, `documentation-extra/x`, `src/documentation/x` y `__tests__-extra/y` NO se
      excluyen por sus lookalikes. **Archivo:** `test/cli.test.js`.
- [x] 2.3 Pin de `?`: un patrón como `src/?.js` matchea exactamente un carácter no-`/` y no lanza.
      **Archivo:** `test/cli.test.js`.
- [x] 2.4 Pin de `**` intermedio: `dist/**/x.js` excluye `dist/x.js` y `dist/a/b/x.js`.
      **Archivo:** `test/cli.test.js`.
- [x] 2.5 Pin de frescura: con un estado regenerado, agregar `test/new-case.test.js` produce
      `READY`/`none` sin `changedAreas`. **Archivo:** `test/cli.test.js`.
- [x] 2.6 Pin de compatibilidad: un estado persistido con rutas ahora excluidas produce
      `STALE`/`minor` una vez cuando el área conserva al menos una ruta incluida, sin
      `materialReasons` ni reescritura, y `READY` tras regenerar. **Archivo:** `test/cli.test.js`.
- [x] 2.7 Verificar que ningún pin existente cuyo fixture dependa del comportamiento previo (por
      ejemplo `**/*.png` en raíz o lockfiles) cambió de resultado. **Archivo:** `test/cli.test.js`.

## 3. Spec delta

- [x] 3.1 Mantener `aspec/changes/discovery-exclude-glob-match/specs/cli-diagnostics/spec.md` como
      `ADDED Requirements` con el requirement nuevo y sus 10 escenarios; el merge a
      `aspec/specs/cli-diagnostics/spec.md` aplica en el archive.

## 4. Validación

- [x] 4.1 Ejecutar `npm run lint` (declarado en `PRODUCT.md` → `## Project Commands`).
- [x] 4.2 Ejecutar `npm test` (declarado) y, para la validación acotada, `node --test test/cli.test.js`.
- [x] 4.3 Registrar omisiones: format check `not-configured` (sin formatter declarado); typecheck
      no aplica (JavaScript ESM, sin `tsconfig.json`).
- [x] 4.4 Verificar de forma no destructiva que `**/*.test.*` y `**/*.spec.*` excluyen raíz y
      anidado en un fixture temporal, y que `**/*.png` sigue cubriendo ambas formas. Correr los
      chequeos de frescura con `node src/cli/index.js discovery --check` (entrypoint del working
      tree), no con el binario `ancleto` del PATH, que puede estar rezagado.

## 5. Archive, release y seed

- [ ] 5.1 Archivar el change y mergear el delta a `aspec/specs/cli-diagnostics/spec.md`.
- [ ] 5.2 Release **MINOR 0.30.0**: `package.json`, `package-lock.json`, `CHANGELOG.md`.
- [ ] 5.3 Actualizar `aspec/backlog.md` y los documentos del seed tras la implementación; regenerar
      el estado del discovery para absorber el primer `--check` tras el cambio (`material` por
      `area raiz eliminada: test` en este repo; `minor` si el área conserva rutas incluidas).
- [ ] 5.4 No tocar ni archivar `ancleto-vscode-extension`.
