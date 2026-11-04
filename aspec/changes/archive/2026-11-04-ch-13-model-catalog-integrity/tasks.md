# Tasks: ch-13-model-catalog-integrity

> Implementación y tests en tareas separadas; cada tarea es verificable por sí sola.
> Validaciones declaradas: `npm run lint` (`eslint src/ test/ scripts/` tras este change) y
> `npm test` (`node --test "test/*.test.js"`). Para validaciones acotadas, pasar rutas explícitas;
> nunca `node --test` sin acotar.
> Este change no refresca `src/core/model-catalog.json` ni inventa IDs.

## Fase 1 — Helpers puros de IDs declarados

- [ ] 1. En `src/core/tier-models.js`, exponer `declaredModelIds({ tiers, chains, agentModels })` como
      función pura: recibe `TIERS`, `TIER_CHAINS` y las fuentes de frontmatter ya leídas
      (`agents/*.md`, `profiles/*/agents/*.md`), deriva todos los IDs declarados (incluidos todos los
      candidatos de cada cadena), excluye `inherit`, deduplica y conserva un origen estable por ID en
      un `Map`. No lee archivos, no usa red y no importa `node:child_process`.
- [ ] 2. En `src/core/model-catalog.js`, mover `modelIdsFromCatalog` desde `tier-models.js`,
      re-exportarlo desde `tier-models.js` para conservar la API y exponer
      `missingModelIdsInCatalog(snapshot, ids)`, que lo reutiliza para devolver las entradas
      `{ id, source }` ausentes sin duplicar la extracción de IDs, sin mutar el snapshot y sin
      depender de un catálogo global.
- [ ] 3. Escribir tests unitarios en `test/model-catalog.test.js` para los helpers: declaraciones de
      los tres tiers, `TIER_CHAINS` completo, canónica y perfiles; exclusión de `inherit`; dedupe;
      catálogo con todos los IDs (sin ausencias); catálogo sin un ID (ausencia con origen); y pureza
      (sin E/S ni procesos). El guard debe derivar con `declaredModelIds` y comparar con
      `missingModelIdsInCatalog`; reemplazar el helper local `declaredModels()` del test para
      eliminar la duplicación.
- [ ] 4. Extender el guard existente de `test/model-catalog.test.js` para que falle nombrando el ID y
      su origen cuando falte un declarado en `TIERS`, `TIER_CHAINS`, `agents/*.md` o
      `profiles/*/agents/*.md`; verificar que no lee `.opencode/**` ni ejecuta `opencode models`.

## Fase 2 — Gate de `--write` en el script

- [ ] 5. En `scripts/refresh-model-catalog.mjs`, importar `TIERS`/`TIER_CHAINS` y `declaredModelIds`
      desde `src/core/tier-models.js`, y `missingModelIdsInCatalog` desde
      `src/core/model-catalog.js`. Implementar la derivación de IDs declarados leyendo `agents/*.md` y
      `profiles/*/agents/*.md` bajo el `rootDir` efectivo, con default al root del repositorio.
- [ ] 6. Extender `main(argv, options)` para aceptar `declaredIds` y `rootDir` inyectables. Cuando
      `declaredIds` se provee, no leer archivos para las declaraciones; cuando no, derivarlas de
      `TIERS`/`TIER_CHAINS` y de los archivos versionados bajo `rootDir`.
- [ ] 7. En la rama `--write`, pre-validar contra el snapshot candidato que todos los IDs declarados
      existan. Si falta al menos uno: imprimir los IDs y orígenes ausentes, salir con exit 1 y no
      escribir ni el snapshot commiteado ni el candidato. Si todos existen, continuar con la escritura
      atómica existente.
- [ ] 8. Mantener el dry-run actual sin gate: sigue escribiendo el candidato y no toca el snapshot
      commiteado cuando la corrida es `available`.
- [ ] 9. Escribir tests herméticos en `test/model-catalog-discovery.test.js` para el gate: un ID
      declarado ausente del candidato con `--write` sale con exit 1, deja el snapshot byte-idéntico y
      no escribe candidato; todos los IDs presentes con `--write` escriben candidato y snapshot; el
      dry-run no cambia de comportamiento. Usar `declaredIds` y `rootDir` de fixture; no depender del
      repositorio real.
- [ ] 10. Ajustar el test existente de `--write` (`available` escribe candidato y snapshot) para
      inyectar `declaredIds` coherentes con su fixture mínimo, de modo que el gate no falle por IDs
      del repositorio real.

## Fase 3 — Aviso advisory en `check`

- [ ] 11. En `src/cli/index.js`, cuando `modelCatalog` sea válido, derivar los IDs declarados con el
      helper puro (leyendo `agents/*.md` y `profiles/*/agents/*.md`) y calcular los ausentes del
      snapshot. Emitir como máximo un aviso no bloqueante por ejecución, con los IDs y su origen y
      con una referencia al "repositorio fuente"; el texto debe ser distinguible del aviso de deriva
      por mirror para no alterar los contadores existentes.
- [ ] 12. Si `modelCatalog` es `null` (ilegible, corrupto o inválido), no emitir el aviso advisory ni
      el de deriva; conservar el aviso existente de catálogo no verificable. No tocar
      `tierCandidates`, la lógica de `frontmatter diverge`, la aceptación del oráculo ni el exit code.
- [ ] 13. Escribir tests en `test/cli.test.js`: snapshot válido con un ID declarado ausente produce un
      único aviso advisory, exit 0 y ningún cambio en el oráculo ni en `frontmatter diverge`; snapshot
      `null`, ilegible o con forma inválida no produce aviso advisory ni deriva; el aviso advisory no
      se cuenta como aviso de deriva por mirror; un host sin `opencode` no lo emite.
- [ ] 14. Verificar que los tests existentes de deriva, antigüedad y `model: inherit` siguen pasando
      con el nuevo aviso (mensaje distinto y una sola emisión por ejecución).

## Fase 4 — Snapshot corrupto

- [ ] 15. En `scripts/refresh-model-catalog.mjs`, modificar `readCurrent(path)` para que, ante un
      JSON ilegible o ausente, devuelva el baseline vacío y emita un aviso explícito de catálogo
      ilegible, sin lanzar. El baseline se usa sólo para el diff; no se trata como snapshot
      autoritativo ni habilita escrituras.
- [ ] 16. Escribir tests directos en `test/model-catalog-discovery.test.js`: `readCurrent` con un
      archivo corrupto devuelve baseline vacío y emite el aviso; el diff reporta todas las entradas
      del candidato como altas; el snapshot commiteado no se modifica; `check` con un snapshot
      corrupto mantiene `null` y no produce deriva ni aviso advisory.

## Fase 5 — Binario ausente independiente del locale

- [ ] 17. Redefinir `looksBinaryMissing(result)` en `scripts/refresh-model-catalog.mjs`: verdadero si
      `error.code === 'ENOENT'`; o si el resultado no es exitoso (`status` distinto de 0 o `error`
      presente), `stdout` no contiene ninguna línea `provider/...` (según
      `providersFromFlatOutput`) y `stderr` coincide con un patrón de "not found / not recognized" en
      varios idiomas. Falso cuando `status === 0` salvo `ENOENT`, y falso cuando `stdout` enumera al
      menos un proveedor, aunque `stderr` contenga el patrón.
- [ ] 18. Escribir tests directos en `test/model-catalog-discovery.test.js`: `ENOENT`; mensajes de
      shell en inglés, español y al menos otro locale con `stdout` vacío; `ETIMEDOUT` con `stdout`
      vacío no es `binary-missing`; corrida exitosa con líneas `provider/...` y "not found" en
      `stderr` no es `binary-missing`; corrida exitosa con `stdout` vacío y sin error no es
      `binary-missing`.
- [ ] 19. Verificar la integración con `discoveryStatus`: `binary-missing` sólo se clasifica en los
      casos anteriores; los demás errores de spawn siguen siendo `partial`.

## Fase 6 — Guard de `child_process` transitivo

- [ ] 20. Corregir el guard de contenido de `test/model-catalog-discovery.test.js`: afirmar que
      `src/core/model-catalog.js` y `src/core/tier-models.js` no importan `node:child_process` ni
      ejecutan procesos; permitir explícitamente que `scripts/refresh-model-catalog.mjs` importe
      `node:child_process` y que el test que lo importa lo cargue de forma transitiva. Eliminar la
      afirmación de que el test no importa `child_process` si el test importa el script.
- [ ] 21. Mantener el test de `test/model-catalog.test.js` que exige que `tier-models.js` no importe
      `node:child_process`, y agregar la aserción equivalente para `model-catalog.js`.

## Fase 7 — Remedio sin `scripts/` publicado

- [ ] 22. Reformular en `src/cli/index.js` el mensaje de remedio del aviso (deriva, advisory y
      antigüedad) y en `src/core/tier-models.js` el error del resolver que sugiere refrescar el
      catálogo, para que ambos refieran al "repositorio fuente" y no incluyan ninguna ruta
      `scripts/...` en el texto emitido. El usuario del paquete instalado no debe recibir un comando
      que no puede ejecutar. No cambiar la forma de `TIERS`/`TIER_CHAINS` ni la resolución.
- [ ] 23. Actualizar `README.md` para declarar que `scripts/` vive sólo en el repositorio fuente y no
      se publica; ajustar el literal del remedio en la sección de mantenimiento.
- [ ] 24. Actualizar los literales exactos en `test/cli.test.js` y en cualquier content guard que
      fije el mensaje; agregar una aserción de que el aviso nombra "repositorio fuente" y no contiene
      una ruta `scripts/` ejecutable. En `test/model-catalog.test.js`, extender la aserción del error
      del resolver para exigir que nombre el agente y la cadena y que no ofrezca una ruta
      `scripts/...`.

## Fase 8 — Lint de `scripts/`

- [ ] 25. Cambiar `package.json` → `scripts.lint` a `eslint src/ test/ scripts/`.
- [ ] 26. Actualizar `PRODUCT.md` → `## Project Commands` con el mismo comando y alcance.
- [ ] 27. Actualizar `test/linter-config.test.js` (string exacto) y cualquier test de contrato que
      fije el comando; actualizar el delta de `linter-standard` para cubrir `src/`, `test/` y
      `scripts/`.
- [ ] 28. Ejecutar `npm run lint` y corregir las violaciones que aparezcan en `scripts/` o en los
      tests tocados, sin agregar reglas, ignores ni directivas `eslint-disable`.

## Fase 9 — Supersesión y verificación final

- [ ] 29. Confirmar que la decisión `normal-gratis-advisory-catalog-integrity` queda registrada en
      `proposal.md` como supersesora de `normal-gratis-not-runtime-validated`, y que
      `resolveTierModels`, `TIERS` y `TIER_CHAINS` no cambian de forma ni de comportamiento.
- [ ] 30. Ejecutar las validaciones acotadas con rutas explícitas:
      `node --test test/model-catalog.test.js`, `node --test test/model-catalog-discovery.test.js`,
      `node --test test/cli.test.js`, `node --test test/linter-config.test.js`,
      `node --test test/content-guards.test.js` y `node --test test/agent-model-coherence.test.js`.
- [ ] 31. Ejecutar `npm run lint` y `npm test`; registrar el resultado. Si una validación no está
      declarada, registrarla como omitida en vez de inventar un runner.
- [ ] 32. Verificar que `src/core/model-catalog.json` conserva 5 proveedores / 211 IDs y
      `generated_at 2026-11-04`, sin IDs inventados ni cambios de resolución; si el archivo difiere,
      reportarlo y no corregirlo en este change.
- [ ] 33. Registrar en el resumen final la deriva del technical seed (`STALE`/`minor`) sin
      regenerarlo.
