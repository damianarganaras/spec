# Tasks: Desempate determinista en searchMemory

> Orden: (1) implementación en el engine → (2) tests (`@tester`) → (3) validaciones obligatorias.
> La **sección 1** es implementación (`@coder`). La **sección 2 pertenece a `@tester`** y no debe
> ejecutarse como parte de la implementación. La sección 3 son las validaciones obligatorias del
> repo.

## 1. Implementación — `src/core/memory/engine.js`

- [x] **1.1** Agregar el desempate `n.rowid` al `ORDER BY` de la rama **con filtro de tipo** en
  la función `run` (`engine.js:132-133`): `ORDER BY rank, n.rowid LIMIT ?`.
  Ref: Requirement "Orden total y truncamiento determinista de searchMemory".
- [x] **1.2** Agregar el desempate `n.rowid` al `ORDER BY` de la rama **sin filtro de tipo** en
  la función `run` (`engine.js:134`): `ORDER BY rank, n.rowid LIMIT ?`.
  Ref: Requirement "Orden total y truncamiento determinista de searchMemory".
- [x] **1.3** Confirmar que `run` es compartido por la pass 1 (AND) y la pass 2 (OR con
  prefijos), de modo que el desempate aplica a ambas sin duplicar lógica.
  Ref: Scenario "El fallback tolerante usa el mismo desempate".
- [x] **1.4** Verificar que el cambio no altera `LIMIT`, el clamp de `limit`, la condición
  `n.status = 'active'`, el scoring `bm25` ni la selección pass 1 → pass 2.
  Ref: Requirement "Orden total y truncamiento determinista de searchMemory".

## 2. Tests — propiedad de `@tester`

> **Esta sección la ejecuta `@tester`, no `@coder`.** Patrón existente: `test/memory-engine.test.js`,
> bloque `describe('searchMemory')` (`:140`), con `node:test` y el engine sobre DB temporal.

- [x] **2.1** Unit de orden total: insertar más nodos con contenido idéntico (empate de `bm25`)
  que el `limit` solicitado y verificar que dos invocaciones con la misma query sobre el mismo
  estado devuelven el **mismo subconjunto y el mismo orden**, con desempate por `rowid`
  ascendente (menor `rowid` primero).
  Ref: Requirement "Orden total y truncamiento determinista de searchMemory" / Scenario
  "Empates de score con truncamiento son deterministas".
- [x] **2.2** Unit del fallback tolerante: forzar la pass 2 (query en lenguaje natural que no
  matchea por AND) con empates de score y más matches que el `limit`, y verificar que el
  desempate por `rowid` también aplica ahí.
  Ref: Scenario "El fallback tolerante usa el mismo desempate".
- [x] **2.3** Regresión de conjunto: con `matches <= limit`, verificar que se devuelven los
  mismos nodos que antes del cambio (el desempate solo vuelve determinista el orden relativo
  entre empates; no cambia qué nodos se recuperan).
  Ref: Scenario "Sin cambio del conjunto recuperado cuando no hay truncamiento".

## 3. Validaciones obligatorias del repo

- [ ] **3.1** `npx tsc --noEmit` (typecheck). — No aplicable: el repo no tiene `tsconfig.json`
  ni `node_modules` (proyecto JS puro, sin scripts npm).
- [ ] **3.2** `npm run lint`. — No aplicable: el repo no tiene config de ESLint ni scripts npm.
- [x] **3.3** `node --test test/memory-engine.test.js`. — Suite `searchMemory` verde. Fallos
  pre-existentes en `buildWorkingContext` (inyección de topología), ajenos a este change.
