# Tasks: ch-14-tier-gratis-import-integrity

> Implementación y tests en tareas separadas; cada tarea es verificable por sí sola.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint con `npm run lint` y tests
> con `npm test` o, para validaciones acotadas, `node --test` con rutas explícitas — **nunca**
> `node --test` sin acotar. Format check: `not-configured` (el repo no declara formatter).
> Typecheck: no aplica (JavaScript sin `tsconfig.json`).
> Este change no implementa el rechazo del tier `gratis` en primarios ni el assert de runtime de la
> cadena (ver `proposal.md` → Decisiones).

## Fase 1 — Predicado `freeTierOnPrimary`

- [x] 1. En `src/core/tier-models.js`, junto a `isKnownGratisModel` (`:113-115`), exportar el
      predicado puro `freeTierOnPrimary(model, mode)` que devuelve verdadero sólo si
      `isKnownGratisModel(model)` y `String(mode).trim() === 'primary'`. Sin argumento de tier, sin
      E/S, sin red y sin procesos. Reutilizar `isKnownGratisModel`; no duplicar la comparación del
      ID.
- [x] 2. En `test/tier-models.test.js`, agregar la tabla de verdad del predicado:
      `opencode/big-pickle` + `primary` → verdadero; `primary` con espacios → verdadero;
      `opencode/big-pickle` + `subagent`, `undefined`, `null` o cadena vacía → falso; un modelo pago
      + `primary` → falso; el ID legacy `opencode/muse-spark-1.3-contributor-free` → falso.

## Fase 2 — Aviso en `applyTier`

- [x] 3. En `src/cli/index.js`, sumar `freeTierOnPrimary` al import de
      `../core/tier-models.js` (`:23`). En `applyTier` (`:593-602`), tras calcular el contenido
      reemplazado `o`, leer el `mode:` del frontmatter existente con `parseFrontmatter` (ya importado
      en `:13`) y, sólo cuando `o !== c`, evaluar `freeTierOnPrimary(model, mode)`. Si es verdadero,
      emitir `console.warn` con el literal exacto de `specs/agent-model-tiers/spec.md` (nombrando el
      agente y el modelo free) y continuar. No lanzar, no cambiar `model`, no cambiar el valor de
      retorno y no advertir cuando `o === c`.
- [x] 4. En `test/cli.test.js`, agregar el escenario de `install --project --tier gratis` en host
      `opencode`: el orquestador queda con `model:` gratis, `stderr` contiene `403` y
      `agente primario`, el exit code es 0 y el mirror de un subagente no produce ese aviso.
- [x] 5. En `test/cli.test.js`, agregar la verificación de idempotencia de contenido: aplicar `gratis`
      dos veces deja el archivo byte a byte idéntico, con exactamente una línea `model:` y el tier
      todavía aplicado. Afirmar que una segunda corrida real de `install --tier gratis` vuelve a
      emitir el aviso, porque `install`/`update`/`init`/`import` re-materializan los assets canónicos
      antes de `applyTier`; no afirmar su ausencia. La rama `o === c` de `applyTier` no es alcanzable
      por la CLI (`applyTier` no se exporta) y se cubre sólo de forma estructural.

## Fase 3 — Aviso en `check`

- [x] 6. En `src/cli/index.js`, dentro de `checkAgentsFrontmatter` (`:2988-3117`), cuando el
      contenido instalado declare `mode: primary` y su `model:` instalado satisfaga
      `freeTierOnPrimary`, acumular una entrada advisory con la forma exacta de
      `specs/agent-model-tiers/spec.md`: `<dirRel>/<file> (modelo free <model> sobre un agente primario: puede responder 403 en OpenCode)`. Propagar esas entradas al arreglo `warnings` de
      `checkCommand` (`:2960-2975`) —por ejemplo, devolviéndolas al caller— sin tocar el `console.log`
      de divergencia existente.
- [x] 7. En `src/cli/index.js`, confirmar que la nueva entrada no incrementa `missing` ni `orphans` y
      que el cierre `process.exit(missing > 0 ? 1 : 0)` (`:2976`) queda intacto. Un archivo de agente
      ausente, `mode: subagent` o `mode:` ausente no producen aviso.
- [x] 8. En `test/cli.test.js`, agregar el escenario de `check` sobre un proyecto instalado con
      `gratis`: el aviso contiene `403` y `agente primario`, el exit code es 0 y el resumen no suma
      faltantes ni huérfanos. Agregar el caso negativo con `mode: subagent`.
- [x] 9. En `test/cli.test.js`, agregar el caso de detección por `mode:` y no por nombre: un agente
      primario distinto de `orchestrator` recibe el aviso y un archivo con `mode: subagent` no lo
      recibe.

## Fase 4 — `import` registra `installedPaths`

- [x] 10. En `src/cli/index.js:4236`, capturar el retorno de `installAgentAssets` en una variable
      `written` en lugar de descartarlo.
- [x] 11. En `src/cli/index.js:4207-4247`, escribir el manifiesto después de
      `installAgentAssets`, `installProfileOverlay` y `applyTier` (reubicar la escritura o reescribir
      el manifiesto después de los assets; ambas formas son equivalentes). Mantener los campos que
      hoy se toman de `bundleRc` (`agent`, `language`, `profile`, `gratisModel`, `azure`,
      `discovery`).
- [x] 12. En `src/cli/index.js`, pasar a `writeManifest` un `installedPaths` calculado con
      `unionInstalledPaths(existingRc?.installedPaths, { templates, ...written, ...bundleCopied })`
      (`unionInstalledPaths`, `:1180-1186`), donde `templates` son los nombres de template que el
      bundle aportó y el import escribió o fusionó, `written` son los directorios que devuelve
      `installAgentAssets` y `bundleCopied` es el objeto `{ agents, commands, skills }` con los
      directorios `.opencode/*` efectivamente copiados desde el bundle (`:4243-4246`). La unión
      deduplica: una ruta escrita por ambos caminos aparece una sola vez. No leer ni esparcir
      `bundleRc.installedPaths`.
- [x] 13. En `test/cli.test.js`, agregar la regresión de M1: importar un bundle que trae
      `.opencode/agents`, `.opencode/commands` y `.opencode/skills` sobre un destino donde esos
      directorios provienen de la copia del bundle y no de `installAgentAssets`; afirmar que
      `installedPaths` los incluye y que una ruta escrita por ambos caminos figura una sola vez.
- [x] 14. En `test/cli.test.js:1204-1216`, reforzar el escenario de import sobre destino fresco para
      dejar de pasar de forma vacua: afirmar `installedPaths.agents/commands/skills` con las rutas
      `.opencode/*` y `installedPaths.templates` con `AGENTS.md`, y que `check` siga con exit 0.
- [x] 15. En `test/cli.test.js`, agregar el escenario de unión: destino instalado previamente con
      `--agent cursor` e import de un bundle `opencode`; ambas rutas quedan en `installedPaths` y
      ninguna previa se pierde.
- [x] 16. En `test/cli.test.js`, agregar el escenario de contaminación: el `.ancletorc` del bundle
      declara `installedPaths` con rutas ajenas (p. ej. `otra-maquina/agents`); el destino no las
      incorpora y `check` no reporta directorios faltantes por ellas.
- [x] 17. En `test/cli.test.js`, agregar el escenario de reimportación: importar dos veces el mismo
      bundle no duplica entradas en `installedPaths` y preserva el valor previo cuando el bundle no
      trae `.ancletorc`.
- [x] 18. En `test/cli.test.js`, extender la no-regresión de `import`: `--repair` sigue regenerando
      sólo la entrada MCP rota, `.ancleto-tier` conserva el tier aplicado, el MCP se regenera con
      rutas locales y `doctor` corre al final. `export` no cambia.

## Fase 5 — README

- [x] 19. En `README.md`, junto a la nota del tier `gratis` (`:546-548`), agregar un párrafo breve que
      declare que el tier está pensado para subagentes y que un modelo free sobre un agente primario
      custom puede responder 403. Sin garantizar el error ni prometer detección de overrides de
      `opencode.json`.

## Fase 6 — Consolidación de specs

- [x] 20. Verificar que el delta `specs/agent-model-tiers/spec.md` de este change conserva ambos
      headings y deja cada obligación enunciada una sola vez: el snapshot y su refresco en "Snapshot
      de catálogo verificado y guard de disponibilidad de IDs"; la derivación, los helpers, la
      cobertura del guard y la pre-validación de `--write` en "Integridad de los IDs declarados
      contra el snapshot".
- [x] 21. Al archivar, reemplazar el cuerpo de ambos requirements en
      `aspec/specs/agent-model-tiers/spec.md` por el texto consolidado del delta `MODIFIED`, sin
      eliminar ninguno de los dos headings, sin cambiar comportamiento y conservando la nota de
      proceduralidad `_Testeable con …_` que cada uno declara.

## Fase 7 — Validación

- [x] 22. Ejecutar `npm run lint`.
- [x] 23. Ejecutar
      `node --test test/tier-models.test.js test/cli.test.js test/agent-model-coherence.test.js`.
- [x] 24. Ejecutar `node --test test/model-catalog.test.js`.
- [x] 25. Ejecutar
      `node src/cli/index.js specs --change ch-14-tier-gratis-import-integrity` y confirmar que los
      deltas usan los keywords canónicos.
