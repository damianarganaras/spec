# Tasks: Puerta de criticidad en `memory consolidate --apply` y `memory merge`

> Change funcional. Sin `design.md`: la decisión de arquitectura queda fijada en
> `## Decisiones` del proposal.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test` (`node --test "test/*.test.js"`); para pasos acotados, el mismo runner con rutas
> explícitas. Format check `not-configured`; typecheck no aplica (JavaScript ESM, sin
> `tsconfig.json`).

## File-set de implementación (autorizado)

- `src/core/memory/engine.js` — parámetros `criticalKeys` / `forceCritical`, cálculo de
  `criticalAffected` y puerta pre-write en `merge` y `consolidate`.
- `src/cli/index.js` — sólo `memoryMerge`, `memoryConsolidate`, el import de
  `readCriticalMemoryKeys`, `MEMORY_USAGE` y el texto de ayuda de `memory`.
- `test/memory-engine.test.js` — tests del gate a nivel motor.
- `test/cli.test.js` — tests del flag, `criticalAffected`, exit codes y pin de uso.
- `aspec/specs/memory-ops/spec.md` — sólo en el archive, por merge del delta.
- `package.json` y `CHANGELOG.md` — sólo en la fase de release.

Fuera del file-set: `src/core/memory/database.js` y el esquema (sin columnas ni PRAGMA nuevos),
`curation.js`, `tools.js`, `mcp-server.js`, `gc`, `import`, `recordNode`, el refresh del
working-context, `.ancleto/memory.db` real, `agents/**`, `skills/**`, `commands/**`,
`templates/**`, `.opencode/**` y `opencode.json`.

## Fase 1 — Motor: cálculo del riesgo y puerta atómica

- [x] 1.1 Extender `consolidate({ dryRun, criticalKeys = [], forceCritical = false })` (`src/core/memory/engine.js:1277`) y `merge({ target, sources, dryRun, criticalKeys = [], forceCritical = false })` (`:1242`) sin que el engine lea `.ancletorc` ni cambie sus defaults de comportamiento.
- [x] 1.2 Calcular `criticalAffected` como la intersección entre `criticalKeys` y los miembros que se supersederían: en `consolidate`, los `superseded` de los grupos exactos; en `merge`, las `sources`. Excluir al canónico y al target, y no incluir near-duplicates. Ordenar de forma determinística, sin locale.
- [x] 1.3 Incluir `criticalAffected` en el reporte de `consolidate` y en el plan de `merge` sin alterar `dryRun`, `exactGroups`, `superseded`, `nearDuplicates`, `target` ni `sources`.
- [x] 1.4 En `consolidate`, evaluar la puerta dentro de `runImmediateTransaction` (`:1344`), antes del primer `getSupersede().run`; si `criticalAffected` no está vacío y `forceCritical` es falso, lanzar un error con `code: 'MEMORY_CRITICAL_KEY'` cuyo mensaje nombre cada clave. No omitir miembros: el rechazo aborta todos los grupos.
- [x] 1.5 En `merge`, evaluar la puerta dentro de `runImmediateTransaction` (`:1247`), antes del bucle de `getSupersede().run`; mismo `code` y mismo mensaje. Verificar que un rechazo deje cero filas modificadas.
- [x] 1.6 Con `dryRun`, devolver `criticalAffected` y no lanzar por criticidad en ninguna de las dos operaciones; con `forceCritical`, aplicar y conservar el comportamiento post-escritura vigente.
- [x] 1.7 Confirmar que `createReadonlyMemoryEngine` sigue rechazando `consolidate({ dryRun: false })` y `merge({ dryRun: false })`, y que acepta `criticalKeys` en dry-run sin escribir.

## Fase 2 — CLI: resolución del set, flag y códigos de salida

- [x] 2.1 Importar `readCriticalMemoryKeys` desde `src/core/memory/working-context.js` y resolver `const projectRoot = resolveMemoryProjectRoot(dbPath)` antes de abrir el engine, tanto en dry-run como en corrida real.
- [x] 2.2 Pasar `criticalKeys: readCriticalMemoryKeys(projectRoot)` a `engine.consolidate(...)` en `memoryConsolidate` (`src/cli/index.js:3087-3141`) y a `engine.merge(...)` en `memoryMerge` (`:3023-3082`).
- [x] 2.3 Parsear `--force-critical`: pasarlo al engine sólo cuando la corrida sea real (`--apply` en consolidate, sin `--dry-run` en merge); en dry-run no debe tener efecto.
- [x] 2.4 En `memory consolidate --apply`, mapear el error `MEMORY_CRITICAL_KEY` a exit `2`: con `--json`, stdout `{ "error": "critical-key-gate", "criticalAffected": [...] }`; sin `--json`, stderr con las claves y la mención de `--force-critical`. No refrescar el working-context en ese camino.
- [x] 2.5 En `memory merge` real, aplicar el mismo mapeo y la misma salida JSON; en dry-run, incluir `criticalAffected` en el JSON y en el texto humano, y salir `0` aunque no esté vacío.
- [x] 2.6 Conservar exit `1` para los rechazos de contrato, el fallo del refresh post-escritura y cualquier error interno; exit `0` para éxito y no-op.
- [x] 2.7 Actualizar `MEMORY_USAGE` (`:137-138`), el texto de ayuda (`:112,114`) y los mensajes de uso de `memoryMerge` (`:3027,3033`) y `memoryConsolidate` (`:3090`) con `--force-critical`.
- [x] 2.8 Verificar el orden: la puerta corre antes de cualquier `UPDATE` y antes del refresh; con `--force-critical` el refresh y su manejo de error quedan intactos.

## Fase 3 — Tests de motor

- [ ] 3.1 Test: `consolidate` dry-run reporta `criticalAffected` con la clave crítica que sería superseded y no modifica filas.
- [ ] 3.2 Test: `consolidate({ dryRun: false })` sin `forceCritical` lanza con `code: 'MEMORY_CRITICAL_KEY'`, ninguna fila cambia y el canónico no se altera.
- [ ] 3.3 Test: `consolidate({ dryRun: false, forceCritical: true })` aplica los grupos y deja `criticalAffected` igual al riesgo calculado.
- [ ] 3.4 Test: una clave crítica que queda canónica no aparece en `criticalAffected`; los near-duplicates tampoco.
- [ ] 3.5 Test: `criticalKeys` vacío o ausente produce `criticalAffected: []` y el reporte y la aplicación son idénticos al comportamiento previo.
- [ ] 3.6 Test: `merge` dry-run reporta `criticalAffected` y no escribe; `merge` real sin `forceCritical` lanza con el `code` y deja cero filas; con `forceCritical` aplica.
- [ ] 3.7 Test: un target crítico no bloquea el merge; una source no crítica tampoco.
- [ ] 3.8 Test: el orden de `criticalAffected` es determinístico y dos corridas sobre el mismo estado producen el mismo arreglo.
- [ ] 3.9 Test: el engine read-only acepta `criticalKeys` en dry-run y sigue rechazando la corrida real.

## Fase 4 — Tests de CLI

- [ ] 4.1 Test: `memory consolidate --apply` con clave crítica afectada sale `2`, nombra la clave por stderr y no imprime `consolidate OK`.
- [ ] 4.2 Test: la misma corrida con `--json` emite en stdout un objeto parseable con `error: "critical-key-gate"` y `criticalAffected`.
- [ ] 4.3 Test: `memory consolidate` (dry-run) con la misma clave sale `0`, reporta `criticalAffected` en texto humano y JSON, y no muta la base ni el working-context.
- [ ] 4.4 Test: `memory consolidate --apply --force-critical` aplica la supersesión y refresca el bloque.
- [ ] 4.5 Test: `memory merge` real con source crítica sale `2` sin escribir ni refrescar el bloque; con `--json`, emite el objeto de error.
- [ ] 4.6 Test: `memory merge --dry-run` con source crítica sale `0`, reporta `criticalAffected` en texto humano y JSON, y no escribe.
- [ ] 4.7 Test: `memory merge --force-critical` aplica el merge y refresca el bloque.
- [ ] 4.8 Test: sin `.ancletorc` o con `criticalKeys: []`, los caminos felices existentes de `merge` y `consolidate` conservan exit `0` y el mismo reporte, con `criticalAffected: []`.
- [ ] 4.9 Test de regresión: la clave crítica fantasma existente (`test/cli.test.js:9477-9487` y `:3883-3900`) sigue saliendo `1` tras el commit, no `2`, porque no está entre los nodos afectados.
- [ ] 4.10 Test: `--force-critical` sobre una `rule` crítica del scope inyectado aplica el merge/consolidate en la base y falla el refresh con exit `1`, dejando el bloque desactualizado; documenta el riesgo residual.
- [ ] 4.11 Actualizar el pin de `MEMORY_USAGE` (`test/cli.test.js:9714-9733`) con las dos líneas nuevas.

## Fase 5 — Validación declarada

- [x] 5.1 Ejecutar `npm run lint` y confirmar `passed`.
- [ ] 5.2 Ejecutar `node --test "test/memory-engine.test.js" "test/cli.test.js"` con rutas explícitas y confirmar verde.
- [ ] 5.3 Ejecutar `npm test` y confirmar la suite completa en verde.
- [x] 5.4 Registrar format check `not-configured` y typecheck no aplica; no inventar comandos.
- [x] 5.5 Reproducir el invariante sobre una base temporal: dry-run reporta; apply sin flag sale `2` con cero filas; `--force-critical` aplica; `criticalKeys` vacío reproduce el comportamiento previo. No usar `.ancleto/memory.db` real.

## Fase 6 — Release y cierre

- [ ] 6.1 Confirmar la versión vigente en `package.json` y aplicar un bump MINOR (flag y garantía observable nuevos); no tocar `ruleVersion` ni el schema.
- [ ] 6.2 Agregar la entrada de `CHANGELOG.md` con la puerta, el flag, el exit `2`, la cobertura de `merge` y la nota de downgrade (`0.35.0` ignora `--force-critical`).
- [ ] 6.3 Actualizar `aspec/backlog.md` y, si el ítem vive ahí, `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` con lo hecho, lo diferido (CH-09e) y lo pendiente.
- [ ] 6.4 Archivar el change con `ancleto-archive` para promover el delta a `aspec/specs/memory-ops/spec.md`; verificar que el merge reescribió los tres requirements completos.
- [ ] 6.5 No commitear ni pushear: el commit lo hace `@coder` y el push queda fuera de este change.
