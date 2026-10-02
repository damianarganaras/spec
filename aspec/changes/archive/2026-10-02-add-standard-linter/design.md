# Design: Add Standard Linter

## Approach

Agregar ESLint 9+ con flat config (`eslint.config.js`) como única configuración. ESLint es la herramienta estándar de lint para JavaScript, soporta ESM nativamente, y funciona con Node 24 sin polyfills. La config flat es el formato actual (ESLint 9+), más simple que `.eslintrc.*` y no requiere archivos legacy.

Las 4 reglas elegidas (`no-undef`, `no-unused-vars`, `eqeqeq`, `no-dupe-keys`) cubren los errores más comunes sin imponer estilo (no tocan formato, indentación, comas, ni nombres). No se agrega Prettier para evitar churn masivo.

## Architecture

```text
package.json
  ├── devDependencies: { "eslint": "^10.11.0" }
  └── scripts: { "lint": "eslint src/ test/", "test": "node --test \"test/*.test.js\"" }

eslint.config.js (flat config, ESM)
  ├── languageOptions: { ecmaVersion: "latest", sourceType: "module" }
  └── rules: { no-undef, no-unused-vars, eqeqeq, no-dupe-keys }

.github/workflows/publish.yml
  └── step "Lint" entre "npm ci" y "node --test"
        └── run: npm run lint
```

Decisiones de diseño:

- **Flat config (`eslint.config.js`)** sobre `.eslintrc.json`: ESLint 9+ lo requiere por defecto, es un archivo JS (no JSON), permite comentarios, y es el formato recomendado. El proyecto es ESM (`"type": "module"`), así que el archivo se carga como módulo.
- **`no-undef` con globals de Node:** el código usa APIs de Node (`process`, `console`, `__dirname`, `__filename`, `Buffer`). La config debe declarar `globals: { ...globals.node }` o usar `languageOptions.globals` para evitar falsos positivos. Se usa `globals` (paquete separado, liviano, también devDependency).
- **`no-unused-vars` con `argsIgnorePattern: "^_"`:** convención estándar para ignorar argumentos no usados (p. ej. callbacks con firma fija). Evita fixes innecesarios.
- **`eqeqeq: ["error", "always"]`:** fuerza `===` / `!==`. Si hay comparaciones con `null` que usan `==` intencionalmente, se evalúa caso por caso (la opción `{ null: "ignore" }` es una alternativa si aparece).
- **Scope del lint:** solo `src/` y `test/`. No `agents/`, `commands/`, `skills/`, `templates/` (son `.md`), ni `profiles/` (`.json`/`.yaml`), ni `.github/`.
- **CI:** paso de lint antes de tests. Si lint falla, no corre tests ni publish. Es el comportamiento deseado (gate bloqueante).

## Validation

- `npm run lint` pasa sin errores ni warnings en `src/` y `test/`.
- `npm test` sigue pasando (162 tests verdes) — el lint no cambia comportamiento.
- CI (`publish.yml`) corre lint antes de tests.
- `npm run lint` con una violación intencional (p. ej. `var x = 1;`) reporta el error y hace exit 1.
- Las reglas de memoria stale (`repo-validation-commands`, `validacion-real-node-test-sin-tooling`, `test-runner-invocation`, `readme-text-guards`) se superseden al archivar.
