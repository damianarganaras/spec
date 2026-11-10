# Tasks: Alinear el spec de frescura con el `recommendedAction` real de `discovery --check`

> Change funcional con delta `MODIFIED`. Sin cambio de runtime: se alinea el spec al código y se fija
> el contrato con tests. El release (patch `0.26.3`), el tag y el publish se manejan aparte.

## 1. Autorar el delta `MODIFIED` de `cli-diagnostics`

**Archivo:** `aspec/changes/align-freshness-recommended-action-spec/specs/cli-diagnostics/spec.md`

- Abrir `## MODIFIED Requirements` con el heading exacto
  `### Requirement: Clasificación determinista de frescura del seed en discovery --check`.
- Reenunciar el **cuerpo completo** del Requirement, porque el merge reemplaza el bloque entero
  (`src/core/specs-merge.js`:265-280), con sólo dos ediciones:
  - en la frase de `recommendedAction`, conservar «`regenerate` cuando `impact` es `material` y
    `continue` cuando es `minor` o `none`» y agregar «, excepto cuando el estado es `MISSING` (que
    reporta `generate`) o `PARTIAL` (que reporta `complete`), aun cuando su `impact` es `none`.»;
  - en el párrafo de estructura de estado, hacer explícitos `MISSING` (con
    `recommendedAction: generate`) y `PARTIAL` (con `recommendedAction: complete`).
- Reenunciar **textualmente** los 9 escenarios canónicos del bloque
  (`aspec/specs/cli-diagnostics/spec.md`:630-697) y agregar el scenario nuevo
  `#### Scenario: MISSING y PARTIAL recomiendan generar o completar`.
- No tocar ningún otro requirement ni ningún otro escenario del spec canónico.

**Verificación:** el delta contiene un único `### Requirement:`; el cuerpo y los 9 escenarios
reenunciados coinciden palabra por palabra con el canónico salvo las dos frases editadas; el scenario
nuevo usa `WHEN`/`THEN`/`AND` y afirma `state:MISSING` → `recommendedAction:generate`,
`state:PARTIAL` → `recommendedAction:complete`, `impact:none` y los cuatro arreglos vacíos.

## 2. Fijar `recommendedAction` en los tests de `MISSING` y `PARTIAL`

**Archivo:** `test/cli.test.js`

- En el test `PARTIAL con seed-map valido` (:6714) agregar
  `assert.equal(j.recommendedAction, 'complete')` junto a las aserciones existentes.
- En el test `MISSING con seed-map valido` (:6733) agregar
  `assert.equal(j.recommendedAction, 'generate')` junto a las aserciones existentes.
- Reemplazar el comentario :6712-6713 —que declara la omisión intencional de `recommendedAction`
  porque el código y la regla canónica diferían— por una nota de que el valor ya es canónico y está
  pineado.
- Conservar intactas las demás aserciones y no agregar casos duplicados.

**Verificación:** cada test falla si el runtime deja de emitir `generate`/`complete` y pasa con el
código actual (`src/cli/index.js`:2347-2356).

## 3. Validación

**Archivos:** sin cambios adicionales

- Lint declarado: `npm run lint`.
- Tests acotados: `node --test test/cli.test.js`.
- Suite declarada: `npm test` (`node --test "test/*.test.js"`, el glob declarado en `PRODUCT.md`).

Entorno declarado: Windows PowerShell 5.1 (`.ancleto/machine-env.md`). Si un comando falla por
entorno, reportar el shell y el comando textual en lugar de reintentar con otra sintaxis.

## Fuera de alcance

- Bump de versión, tag y publish (los maneja el orquestador; patch `0.26.3`).
- Archivar el change.
- Editar `src/cli/index.js` o cualquier otro archivo de runtime.
- Editar `aspec/specs/**` antes del archive: el merge del delta ocurre al archivar.
- Superficie de producto (`agents/**`, `skills/**`, `commands/**`, `templates/**`).
