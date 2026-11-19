# Tasks: model-catalog-guard-opencode-json

> Implementación y tests en tareas separadas; cada tarea es verificable por sí sola.
> Validaciones declaradas: `npm run lint` (`eslint src/ test/ scripts/`) y `npm test`
> (`node --test "test/*.test.js"`). Para validaciones acotadas, pasar rutas explícitas; nunca
> `node --test` sin acotar.
> Este change no refresca `src/core/model-catalog.json`, no cambia IDs y no modifica
> `opencode.json` ni el aviso advisory de `check`.

## Fase 1 — Collector único de declaraciones versionadas

- [x] 1. Crear `src/core/model-declarations.js` con `readModelDeclarations({ rootDir })`, que
      devuelve `[{ id, source }]` para `agents/*.md`, `profiles/*/agents/*.md` y `opencode.json`
      (`agent.<nombre>.model`). Usar `opencode.json#agent.<nombre>.model` como origen; ignorar
      valores que no sean strings; no excluir `inherit` en el collector (lo hace
      `declaredModelIds`).
- [x] 2. Implementar el collector en modo fail-closed: una fuente requerida ilegible o un
      `opencode.json` con JSON inválido falla con un mensaje que nombra la fuente. No importar
      `node:child_process`, no usar red y no leer `.opencode/**` ni `.ancletorc`.
- [x] 3. Verificar que `declaredModelIds` en `src/core/tier-models.js` no necesita cambios: sigue
      recibiendo `agentModels: [{ id, source }]`, deduplicando y excluyendo `inherit`.

## Fase 2 — Guard de tests

- [x] 4. En `test/model-catalog.test.js`, reemplazar `agentModelEntries()` por
      `readModelDeclarations({ rootDir: ROOT })`, sumar `opencode.json` al conjunto combinado de
      fuentes y actualizar el título y la aserción de cobertura para nombrar las cinco fuentes.
- [x] 5. Agregar al guard un grupo propio de `opencode.json` con
      `declaredModelIds({ tiers: {}, chains: {}, agentModels: opencodeEntries })`; afirmar que el
      archivo aporta al menos una declaración, que cada `agent.<nombre>.model` figura en el snapshot
      y que el grupo conserva el origen `opencode.json#agent.<nombre>.model`.
- [x] 6. Extender el caso negativo de `test/model-catalog.test.js` para retirar de una copia del
      snapshot un ID declarado por `opencode.json` y afirmar que el grupo de `opencode.json` lo
      reporta con su origen, aunque el mismo ID esté declarado por `TIERS` o por un agente.

## Fase 3 — Pre-validación de `--write`

- [x] 7. En `scripts/refresh-model-catalog.mjs`, reemplazar `readAgentModels()` por
      `readModelDeclarations({ rootDir })` en la derivación por defecto del gate de `--write`.
      Conservar la inyección de `declaredIds`: con `declaredIds` provisto no se leen archivos.
- [x] 8. Mantener el comportamiento fail-closed del gate: si falta un ID declarado en
      `TIERS`/`TIER_CHAINS`, `agents/*.md`, `profiles/*/agents/*.md` u `opencode.json`, salir con
      exit code 1, nombrar ID y origen y no escribir ni el snapshot commiteado ni el candidato.

## Fase 4 — Tests

- [x] 9. Crear `test/model-declarations.test.js` con tests offline del collector sobre directorios
      temporales: lee `agents/*.md` y `profiles/*/agents/*.md`; lee `opencode.json`; conserva el
      origen `opencode.json#agent.<nombre>.model`; ignora valores no string; falla con `agents/`,
      `profiles/` u `opencode.json` ausentes o ilegibles, y con JSON inválido; no lee
      `.opencode/**` ni `.ancletorc`; no importa `node:child_process` ni usa red.
- [x] 10. Agregar en `test/model-catalog-discovery.test.js` un caso de `main(['--write'], ...)` con
      `rootDir` de fixture que contenga `agents/`, `profiles/` y `opencode.json` con un
      `agent.<nombre>.model` ausente del candidato, sin `declaredIds`; afirmar exit 1, mensaje con el
      ID y `opencode.json#agent.<nombre>.model`, snapshot byte-idéntico y candidato no escrito.
- [x] 11. Verificar que el guard de contenido de `test/model-catalog-discovery.test.js` sigue
      afirmando que `src/core/model-catalog.js` y `src/core/tier-models.js` no importan
      `node:child_process` ni ejecutan procesos, y que no falla porque
      `scripts/refresh-model-catalog.mjs` importe `node:child_process`.

## Fase 5 — Validación y ledger

- [x] 12. Ejecutar las validaciones acotadas con rutas explícitas:
      `node --test test/model-catalog.test.js`, `node --test test/model-declarations.test.js` y
      `node --test test/model-catalog-discovery.test.js`. Confirmar que no se ejecuta
      `opencode models` ni se usa red.
- [x] 13. Ejecutar `npm run lint` y corregir sólo las violaciones introducidas por este change.
- [x] 14. Ejecutar `npm test` y registrar el resultado. Si una validación no está declarada,
      registrarla como omitida en vez de inventar un runner.
- [x] 15. Verificar que `TIERS`, `TIER_CHAINS`, `resolveTierModels`, `src/core/model-catalog.json`,
      `opencode.json`, `package.json` → `files` y el aviso advisory de `check` no cambiaron; que no
      hay dependencias de runtime nuevas ni cambios de schema/PRAGMAs de memoria.
- [ ] 16. Actualizar el ledger `aspec/backlog.md` con el estado del change, el alcance y la ausencia
      de release; registrar en `proposal.md` → `## Decisiones` cualquier tradeoff no anticipado con
      su alternativa descartada y evidencia, sin inventar refs.
