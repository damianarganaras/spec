# Tasks: Add Standard Linter

## Fase 1 — Configuración

- [x] Agregar `eslint` y `globals` como devDependencies en `package.json` (`npm install --save-dev eslint globals`).
- [x] Crear `eslint.config.js` (flat config, ESM) con: `@eslint/js` recommended como base desactivado (solo las 4 reglas explícitas), `languageOptions.ecmaVersion: "latest"`, `languageOptions.sourceType: "module"`, `languageOptions.globals` con globals de Node, y reglas `no-undef`, `no-unused-vars` (con `argsIgnorePattern: "^_"`), `eqeqeq` (`"always"`), `no-dupe-keys`.
- [x] Agregar scripts en `package.json`: `"lint": "eslint src/ test/"`, `"test": "node --test \"test/*.test.js\""`.

## Fase 2 — Fix de violaciones

- [x] Ejecutar `npm run lint` y registrar las violaciones encontradas en `src/` y `test/`.
- [x] Fix de violaciones de `no-undef` (declarar variables faltantes o agregar globals si son APIs de Node no cubiertas).
- [x] Fix de violaciones de `no-unused-vars` (eliminar variables/imports sin uso, o prefijar con `_` si son argumentos de callback).
- [x] Fix de violaciones de `eqeqeq` (reemplazar `==` / `!=` por `===` / `!==`).
- [x] Fix de violaciones de `no-dupe-keys` (eliminar o renombrar claves duplicadas en objetos).
- [x] Verificar que `npm run lint` pasa limpio (exit 0, sin warnings).

## Fase 3 — CI y validación

- [x] Agregar paso "Lint" en `.github/workflows/publish.yml` entre `npm ci` y `node --test` (`run: npm run lint`).
- [x] Verificar que `npm test` sigue pasando (384 tests verdes) — el lint no debe cambiar comportamiento.
- [ ] Verificar que `npm run lint` detecta una violación intencional (exit 1 con mensaje de error).
- [x] Superseder reglas de memoria stale (`repo-validation-commands`, `validacion-real-node-test-sin-tooling`, `test-runner-invocation`, `readme-text-guards`) vía `recordRule` al archivar.
