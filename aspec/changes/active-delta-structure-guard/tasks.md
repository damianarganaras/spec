# Tasks: Guard estructural de delta specs de changes activos

> Change funcional con delta `ADDED` en `spec-sync`. Cero cambio de runtime: el trabajo es un archivo
> de test nuevo más los artifacts del change.

## 1. Crear el guard estructural en `test/delta-spec-structure.test.js`

**Archivo:** `test/delta-spec-structure.test.js` (nuevo)

- Importar el parser real del merge: `import { parseDeltaSpec } from '../src/core/specs-merge.js'`.
  No duplicar regex ni reimplementar la gramática.
- Definir los helpers `assertDeltaValid(text)` y `assertDeltaInvalid(text)`, ambos anclados a
  `parseDeltaSpec(...).errors`, para que el oráculo sea el parser y no una regla propia.
- Agregar fixtures literales válidos con bloques `## ADDED Requirements` / `## MODIFIED Requirements`
  canónicos, `### Requirement:` con título y escenarios.
- Agregar los cinco casos inválidos medidos con el parser real: prosa suelta dentro de una sección,
  `### Requirement:` sin título, `## BOGUS Requirements`, `## ADDED Requirement` en singular, y
  `### Requirement:` indentado. Cada uno debe producir `errors.length > 0`.
- **No** incluir como inválido el segundo `# H1` dentro del cuerpo de una sección: el parser lo acepta
  (`errors === 0`) y sería un falso rojo.
- Incluir la mutación: cada predicado tiene un caso donde se rompe; un fixture válido mutado en el
  punto que el predicado mide debe pasar a inválido.
- Implementar `collectActiveDeltas(root)` leyendo `aspec/changes` bajo un `root` inyectado, saltando
  la entrada llamada exactamente `archive` por identidad, y descendiendo a
  `<change>/specs/<capability>/spec.md`.
- Probar el colector con un árbol temporal: 0 changes; 1 change con 2 capabilities; N changes; y
  `archive/<fecha>-<slug>/specs/...` más `archive/specs/...` malformados que no deben aparecer en el
  resultado.
- Agregar el barrido live tolerante a 0 changes: fail-closed sólo si `aspec/changes` no existe o no
  es legible, o si un `spec.md` presente no puede leerse o parsearse.
- No hardcodear el slug de ningún change activo.

**Verificación:** el archivo falla si una malformación deja de producir errores; el colector devuelve
contenido de `archive/` cuando se rompe la exclusión por identidad; y el barrido live pasa con cero
deltas activos.

## 2. Verificar el barrido live contra los deltas activos actuales

**Archivo:** `test/delta-spec-structure.test.js` (sin cambios adicionales)

- Confirmar que el barrido live sobre `aspec/changes` devuelve los deltas activos actuales
  (`ancleto-vscode-extension`: `vscode-implementation` y `vscode-distribution`) y que ambos parsean
  con 0 errores.
- Confirmar que `archive/` no aporta entradas al resultado, aunque contenga deltas que el parser
  rechaza.
- La aserción debe tolerar 0 deltas para sobrevivir al archive del último change activo.

**Verificación:** el test reporta exactamente las rutas activas esperadas y ningún path bajo
`aspec/changes/archive/`.

## 3. Correr las validaciones declaradas

**Archivos:** `test/delta-spec-structure.test.js`, `aspec/changes/active-delta-structure-guard/*`

- Lint: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- Test acotado durante desarrollo: `node --test test/delta-spec-structure.test.js`.
- Suite declarada: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run test`.

Entorno declarado: Windows PowerShell 5.1 (`.ancleto/machine-env.md`). Si un comando falla por
entorno, reportar el shell declarado y el comando textual en lugar de reintentar con otra sintaxis.

## Fuera de alcance

- Extender `specsCheckCommand` o cualquier edición bajo `src/`.
- Superficie de producto (`agents/`, `skills/`, `commands/`, `templates/`, `.opencode/`).
- Specs canónicas de `aspec/specs/` y el change diferido `ancleto-vscode-extension`.
- Bump de versión, tag y publish; archivo del change.
