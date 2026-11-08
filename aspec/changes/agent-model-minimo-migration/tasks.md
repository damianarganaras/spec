# Tasks: Alineación del tier `minimo` a la canónica migrada

## 1. Alineación de la tabla de tiers

- [x] 1.1 En `src/core/tier-models.js`, alinear `TIERS.minimo` para los diez agentes a
  `opencode-go/deepseek-v4.1-flash` (el modelo que ya declara `agents/*.md`).
- [x] 1.2 En `src/core/tier-models.js`, alinear `MINIMO_CHAIN` a
  `['opencode-go/deepseek-v4.1-flash', 'opencode/deepseek-v4.1-flash-free']`, con la cabeza primero y
  sin `commandcode/deepseek/deepseek-v4.1-flash`.
- [x] 1.3 Verificar que no queden referencias derivadas incoherentes en `src/` (shell declarado:
  Windows PowerShell 5.1; `rg` no disponible):
  `Get-ChildItem -Recurse -Filter *.js -Path src | Select-String -Pattern 'commandcode/deepseek/deepseek-v4.1-flash'`.
  Excluir `src/core/model-catalog.json`: es el snapshot de disponibilidad, no una declaración
  derivada, y no se toca. Si aparece otra declaración derivada bajo `src/`, alinearla al mismo ID y
  anotarla.

## 2. Documentación y mensaje

- [x] 2.1 Alinear documentación: `README.md` (filas del modelo `minimo` y cadena de candidatos) y
  `AGENTS.md` (nota de modelo por defecto, fuera de bloques LOCKED) a
  `opencode-go/deepseek-v4.1-flash` y cadena de 2.
- [x] 2.2 En `src/cli/index.js`, pluralizar el aviso de divergencia que hoy emite
  `en ${tierDiff} agentes` a `1 agente` / `N agentes`.

## 3. Tests

- [x] 3.1 Confirmar que `test/agent-model-coherence.test.js` pasa sin cambios: el guard deriva el
  modelo canónico de `agents/*.md` y compara `TIERS.minimo[n] === modelOf(agents/n.md)` y
  `=== TIER_CHAINS.minimo[n][0]`; no codifica proveedor. Ajustar sólo si el cambio de valores expone
  una aserción hardcodeada.
- [x] 3.2 No agregar un caso duplicado de «tier minimo == canónica»: el caso
  `TIERS.minimo cubre el mismo conjunto de agentes y el mismo modelo que la canónica` ya lo fija. Si
  se agrega cobertura nueva, debe aportar algo que el guard actual no cubra y debe seguir derivando
  de la canónica sin codificar identificadores de proveedor.

## 4. Validación

- [x] 4.1 Correr la validación acotada con rutas explícitas:
  `node --test test/agent-model-coherence.test.js test/cli.test.js`.
- [x] 4.2 Correr `npm run lint`.
- [x] 4.3 Correr `npm test` (comando declarado). El format check es `not-configured` y el typecheck
  no aplica (paquete JavaScript, sin `tsconfig.json`).
- [x] 4.4 Confirmar que no cambiaron `agents/*.md`, `opencode.json`, `src/core/model-catalog.json` ni
  `package.json`.

## Nota de release

`agents/**` cambió en el release por `9e45105`. El release DEBE correr `ancleto upgrade` y commitear
los tracked files si cambian (los mirrors `.opencode/agents/*.md` derivan de la canónica), además de
aplicar la versión 0.24.0.
