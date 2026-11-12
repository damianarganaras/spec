# Tasks: Caché del regex compilado en el matcher de `discovery.exclude`

## 1. Crear `src/core/discovery-glob.js`

- [x] Crear `src/core/discovery-glob.js` sin dependencias ni imports, exportando `escapeRe`,
      `compileGlob` y `matchesGlob` (una sola implementación de cada uno).
- [x] Exportar `compileGlob(glob)`: tokenizar verbatim (`**/` → `(?:.*/)?`, `/**` → `(?:/.*)?`,
      `**` → `.*`, `*` → `[^/]*`, `?` → `[^/]`, literales escapados), anclar `^…$` si el glob
      contiene `**` y `^…(/|$)` si no, compilar sin flags `g`/`y`, y cachear en un `Map`
      módulo-level con clave igual al string exacto del glob.
- [x] Exportar `matchesGlob(rel, glob)` como `compileGlob(glob).test(rel)`.
- [x] Verificar que el módulo exporta `escapeRe`, `compileGlob` y `matchesGlob`, que no importa
      nada (sin ciclo) y que no expone la caché.

## 2. Conectar `src/cli/index.js`

- [x] Importar `escapeRe` y `matchesGlob` desde `./core/discovery-glob.js`.
- [x] Eliminar las definiciones locales de `escapeRe` (`src/cli/index.js:2181`) y `matchesGlob`
      (`:2187-2212`).
- [x] Dejar que los tres usos de `escapeRe` (`:1517`, `:1533`, `:1571`) resuelvan al import.
- [x] Confirmar que `isIgnored`, `walk` y `computeSources` no cambian y que
      `DEFAULT_IGNORES`/`outputDir`/`buildRepomixArgs` siguen intactos.

## 3. Test de equivalencia y caché

- [x] Crear `test/discovery-glob.test.js` comparando por **resultados** (booleanos), sin copiar el
      regex ni hardcodear rutas del change activo.
- [x] Cubrir los 10 escenarios canónicos de
      `aspec/specs/cli-diagnostics/spec.md:1019-1092`.
- [x] Cubrir los pares de los 9 pins de `test/cli.test.js:7820-7969`.
- [x] Cubrir límites: `a**b`, `***`, `x**`, `**x`, `**/**`, `./x`, `/x`, `x/`, backslash,
      `?` con carácter astral, segmento con `\n`, metacaracteres, diferencias de case y glob vacío.
- [x] Pinear la caché: `compileGlob(g) === compileGlob(g)` para el mismo string.
- [x] Ejecutar `node --test test/discovery-glob.test.js` y confirmar que pasa.

## 4. Validación

- [x] `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- [x] `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test`, o con rutas explícitas
      `node --test test/discovery-glob.test.js test/cli.test.js`.
- [x] Registrar format check como `not-configured` y typecheck como `n/a` (no declarados en
      `PRODUCT.md` → `## Project Commands`).
