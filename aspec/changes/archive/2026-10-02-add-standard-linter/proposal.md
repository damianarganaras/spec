# Proposal: Add Standard Linter

## Problem

El repositorio no tiene linter. Tres changes consecutivos (`reviewer-guarantee-vs-model`, `add-multi-agent-cli-support`, `add-antigravity-full-support`) se publicaron con "gates ausentes (no bloqueante)" — la verificación fue 100% manual + `node --test`. El backlog (B7) recomienda agregar un linter mínimo para consistencia.

`AGENTS.md` declara `npm run lint` como validación obligatoria, pero el script no existe. Las reglas de memoria `repo-validation-commands`, `validacion-real-node-test-sin-tooling` y `test-runner-invocation` documentan esta ausencia como esperada — este change la elimina.

**Caveat honesto (heredado de B7):** un linter NO ataja la clase de bugs de esos changes (IDs inventados, conflación MCP, `cmdSpec` mal derivado). Eso lo atrapa un test, no un linter. El valor del linter es consistencia de código, no correctness de negocio.

## Proposed change

Agregar ESLint como devDependency con configuración mínima (4 reglas), script `npm run lint`, paso de lint en CI (`publish.yml`), y fix de las violaciones existentes en `src/` y `test/`.

## Scope

In scope:
- `eslint` como devDependency (no rompe "zero-dependencies" — ese contrato aplica solo a runtime/`dependencies`).
- Config mínima: `no-undef`, `no-unused-vars`, `eqeqeq`, `no-dupe-keys`.
- Formato de config: flat config (`eslint.config.js`) — estándar actual de ESLint 9+, sin archivos legacy `.eslintrc.*`.
- Script `npm run lint` en `package.json`.
- Paso de lint en CI (`publish.yml`), antes de los tests.
- Fix de violaciones existentes en `src/` y `test/` (no ignores, no `// eslint-disable`).
- `npm run test` como alias de `node --test "test/*.test.js"` (aprovechar que se agrega `scripts`).

Out of scope:
- Prettier (reformatearía todo `src/` y `test/` → churn enorme; si se quiere, va como change aparte).
- Reglas adicionales más allá de las 4 declaradas.
- Lint de archivos `.md`, `.yaml`, `.json` (solo `.js` en `src/` y `test/`).
- Cambios en `AGENTS.md` o `PRODUCT.md` (la discrepancia con los gates se resuelve naturalmente al existir los scripts; las reglas de memoria se superseden al archivar).

## Risks

- **Violaciones inesperadas:** si hay muchas violaciones de `no-undef` (variables globales implícitas) o `no-unused-vars`, el fix puede tocar más archivos de lo esperado. Mitigación: las 4 reglas son conservadoras y el código es maduro (162 tests verdes); se espera un número bajo de violaciones.
- **`no-undef` en ESM:** en módulos ESM, las variables no declaradas son raras (el módulo tiene scope propio). Riesgo bajo.
- **CI break:** si el lint falla en CI, bloquea el publish. Mitigación: el paso de lint corre antes de tests y publish; si falla, se arregla antes de mergear. Es el comportamiento deseado.
- **Reglas de memoria stale:** las reglas `repo-validation-commands`, `validacion-real-node-test-sin-tooling`, `test-runner-invocation` y `readme-text-guards` documentan que lint no existe — quedan obsoletas al implementar. Se superseden al archivar el change.
