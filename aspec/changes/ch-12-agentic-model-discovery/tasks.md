# Tasks: ch-12-agentic-model-discovery

> Implementación y tests en fases separadas; cada fase es verificable por sí sola.
> Shell: Windows PowerShell 5.1. `rg` no disponible → `Select-String`.
> Runner: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run <script>`.
> Nunca `node --test` sin acotar; los tests se invocan con rutas explícitas.

## Fase 0 — Línea base y viabilidad del CLI (verificación)

- [x] Verificar `opencode --version` y que `opencode models --refresh` y
      `opencode models <provider> --verbose --refresh` funcionen en la máquina de mantenimiento.
      Registrar versión y fecha. Si `--refresh` no existe o cambia la forma de la salida, detenerse y
      reportarlo; no inventar un fallback silencioso.
- [x] Registrar el estado base de `src/core/model-catalog.json`: proveedores, cantidad de IDs y hash
      (`git hash-object src/core/model-catalog.json`). No escribir el archivo.
- [x] Confirmar que `.ancleto/` está gitignored y que `.ancleto/model-catalog.candidate.json` no se
      commitea.

## Fase 1 — Helpers puros de catálogo (implementación)

- [x] Crear `src/core/model-catalog.js` con `providersFromFlatOutput(raw)`: parsea líneas
      `provider/model`, ignora líneas vacías o sin `/`, toma el proveedor como el primer segmento,
      deduplica y devuelve una lista ordenada. Debe tolerar IDs con más de un `/`
      (`commandcode/deepseek/deepseek-v4.1-flash`). Listo cuando una salida con cinco proveedores y
      IDs multisegmento devuelve exactamente esos cinco, sin duplicados.
- [x] En `src/core/model-catalog.js`, implementar `parseVerboseProviderOutput(provider, raw)` puro,
      movido de `scripts/refresh-model-catalog.mjs`: detecta encabezados `^<provider>/\\S+$`, acumula
      el bloque JSON de metadatos, emite `{ id, cost, limit }` con `null` cuando faltan datos y
      deduplica por `id` conservando la primera aparición. No lee archivos ni ejecuta procesos.
- [x] En `src/core/model-catalog.js`, implementar `diffCatalogSnapshots(current, next)` con altas,
      bajas y cambios de `cost`/`limit` por proveedor e ID, en orden determinista. Incluir el valor
      anterior y el nuevo en cada cambio. Un snapshot igual a sí mismo debe producir un diff vacío.
- [x] En `src/core/model-catalog.js`, implementar `validateCatalogSnapshot(snapshot)` que devuelva
      `{ ok, errors }` y valide: `generated_at` con formato `^\\d{4}-\\d{2}-\\d{2}$`; `source.method`
      string no vacío; `source.providers` array no vacío cuyos elementos coincidan exactamente con
      las claves de `providers`; cada proveedor con al menos una entrada; cada `id` string con el
      prefijo `<provider>/`; ausencia de IDs duplicados; forma de `cost`/`limit` cuando existan.
- [x] En `src/core/model-catalog.js`, implementar `discoveryStatus({ binaryMissing, networkMarker,
      failedProviders, providerCount })` que devuelva exactamente uno de `available`,
      `binary-missing`, `network-unavailable` o `partial`, con esta precedencia:
      `binary-missing` > `partial` (si hay proveedores fallidos o ninguno enumerado) >
      `network-unavailable` (marcador presente) > `available`.
- [x] En `src/core/model-catalog.js`, implementar `freeModelViolations(snapshot, ids)` que devuelva
      los IDs pedidos que no figuran en el snapshot o cuyo `cost.input`/`cost.output` no sea 0.
- [x] En `src/core/model-catalog.js`, implementar `catalogAgeDays(generatedAt, now)` y
      `isCatalogStale(generatedAt, now, maxDays = 90)` con parseo UTC de `YYYY-MM-DD` y sin estado
      global. Un `generated_at` inválido debe devolver `null`/`false`, no lanzar.
- [x] Confirmar que `src/core/model-catalog.js` no importa `node:child_process`, `node:fs`,
      `node:http`/`node:https` ni usa `spawn`/`exec`, y que no declara `TIERS` ni `TIER_CHAINS`.

## Fase 2 — Script de descubrimiento (implementación)

- [x] Reescribir `scripts/refresh-model-catalog.mjs` para importar los helpers puros y mantener
      `spawnSync` sólo en este archivo, con el manejo de Windows vigente
      (`shell: process.platform === 'win32'`).
- [x] Enumerar proveedores con `opencode models --refresh` (salida plana) usando
      `providersFromFlatOutput`; no usar `Object.keys(current.providers)` como fuente de la
      enumeración. Si no se enumera ningún proveedor, tratar la corrida como `partial`.
- [x] Consultar cada proveedor con `opencode models <provider> --verbose --refresh`; registrar
      exit code, error de spawn, stderr y presencia de `Failed to fetch models.dev`. Un proveedor sin
      entradas parseadas cuenta como fallido.
- [x] Clasificar con `discoveryStatus` e imprimir siempre el reporte con fecha, método, proveedores
      enumerados y estado; si el estado no es `available`, agregar el diagnóstico (proveedores
      fallidos, marcador offline) y salir con exit code no cero sin escribir el snapshot commiteado.
- [x] Construir el snapshot candidato con `generated_at` igual a la fecha de la corrida,
      `source.method` igual a `opencode models <provider> --verbose --refresh`, `source.providers`
      igual a los proveedores enumerados y `providers` con las entradas parseadas; validarlo con
      `validateCatalogSnapshot` y rechazar `opencode/big-pickle` no gratis con
      `freeModelViolations`.
- [x] Calcular el diff contra el snapshot vigente con `diffCatalogSnapshots` e imprimir un reporte
      legible con estado, fecha, proveedores, cantidad de IDs, altas, bajas y cambios de
      `cost`/`limit`.
- [x] Escribir el snapshot candidato en `.ancleto/model-catalog.candidate.json` (crear el directorio
      con `mkdirSync(..., { recursive: true })`) sólo cuando el estado sea `available` y las
      validaciones pasen; el archivo candidato no se commitea.
- [x] Agregar una acción explícita `--write` (default dry-run) que reemplace
      `src/core/model-catalog.json` sólo con estado `available` y validaciones en verde. Implementar
      la escritura con un archivo temporal en el mismo directorio + `renameSync`, limpieza en
      `finally` y error no cero si el rename falla; exportar `writeJsonAtomic(path, value)` para
      testearla sin ejecutar `opencode`.
- [x] Ejecutar `main()` sólo cuando el script sea el entry point (`import.meta.url` contra
      `pathToFileURL(process.argv[1]).href`), para que los tests puedan importar
      `writeJsonAtomic` sin disparar el descubrimiento.
- [x] Actualizar el encabezado del script: manual, nunca en CI ni como parte de otro comando,
      `--write` explícito, clasificaciones, ubicación del candidato y regla de no commitearlo.

## Fase 3 — Refresco del snapshot (implementación de datos)

- [x] Ejecutar `node scripts/refresh-model-catalog.mjs` (dry-run) y revisar el diff contra el
      snapshot vigente y contra la evidencia del 2026-11-03 (5 proveedores / 211 IDs). Registrar la
      fecha y los conteos reales.
- [x] Si el estado es `available` y las validaciones pasan, ejecutar
      `node scripts/refresh-model-catalog.mjs --write`; confirmar que `source.providers` contiene
      todos los proveedores enumerados y que el schema no cambió.
- [x] Confirmar en el snapshot nuevo que `opencode/big-pickle` tiene `cost.input: 0` y
      `cost.output: 0`, que no hay IDs duplicados ni IDs sin prefijo de proveedor y que el guard de
      `test/model-catalog.test.js` sigue en verde.
- [x] Confirmar que `.ancleto/model-catalog.candidate.json` no está trackeado por git y que no se
      commitea.

## Fase 4 — Aviso de deriva en `check` (implementación)

- [x] En `checkCommand` (`src/cli/index.js:2830`), cargar el catálogo una sola vez cuando
      `installedHosts` incluya `opencode`, con `try/catch`: si falla, dejarlo en `null` y conservar
      el comportamiento actual. No cargar el catálogo cuando el host no es `opencode`.
- [x] En `checkCommand`, emitir como máximo un aviso informativo por ejecución si el catálogo es
      legible y `isCatalogStale(catalog.generated_at, new Date())` es verdadero. El aviso debe
      nombrar la antigüedad y sugerir `scripts/refresh-model-catalog.mjs`.
- [x] Pasar el catálogo cargado a `checkAgentsFrontmatter` y reutilizarlo en la resolución del tier
      (`resolveTierModels` con `chains: TIER_CHAINS`, `gratisOverride` y `allowUnresolved: true`),
      preservando el fallback actual cuando el catálogo es `null`.
- [x] En `checkAgentsFrontmatter` (`src/cli/index.js:2918`), cuando `host === 'opencode'` y el
      catálogo es legible, extraer el `model:` del archivo instalado y, si no figura en el snapshot,
      emitir un warning por archivo que nombre el `dirRel`/archivo, el ID y la sugerencia de refresco.
      No alterar `conTierEstados`, `tierDiff`, el conjunto de aceptación ni el exit code.
- [x] Omitir el aviso de deriva cuando el catálogo es `null` o ilegible (conservar el aviso existente
      de catálogo no verificable) y cuando el host elimina `model:` o emite `model: inherit`.
- [x] Confirmar que un proyecto con todos los `model:` del mirror presentes en el snapshot no produce
      avisos nuevos y que los tests existentes del oráculo siguen en verde.

## Fase 5 — Documentación del mantenimiento (implementación)

- [x] Agregar al final de `README.md` (después de la sección de referencia de agentes y modelos, línea
      ~544) una subsección `### Mantenimiento del catálogo de modelos` que documente:
      `node scripts/refresh-model-catalog.mjs` (dry-run) y `--write`; las cuatro clasificaciones
      (`available`, `binary-missing`, `network-unavailable`, `partial`); el reporte candidato en
      `.ancleto/model-catalog.candidate.json` y su regla de no commitearlo; la revisión del diff, la
      validación y el commit del snapshot; y que el descubrimiento no corre en
      `install`/`update`/`init`/`import`/`check`/tests/CI.
- [x] En la misma subsección, documentar la mini-sesión de investigación con agentes/skills
      existentes: `technical-discovery` para el análisis acotado del diff y `memory-keeper` para
      registrar la decisión. No crear un agente ni una skill nuevos.

## Fase 6 — Tests de helpers puros y documentación (tests)

- [ ] Crear `test/model-catalog-discovery.test.js` y cubrir `providersFromFlatOutput` con: cinco
      proveedores, IDs multisegmento (`commandcode/deepseek/deepseek-v4.1-flash`), duplicados,
      líneas vacías y líneas sin `/`.
- [ ] Cubrir `parseVerboseProviderOutput` con un fixture de `--verbose`: IDs con `cost` y `limit`,
      entradas sin metadatos (`null`), JSON malformado y IDs duplicados.
- [ ] Cubrir `diffCatalogSnapshots`: alta, baja, cambio de `cost`, cambio de `limit`, snapshot igual
      (diff vacío) y orden determinista.
- [ ] Cubrir `validateCatalogSnapshot`: snapshot válido; fecha inválida; `source.providers`
      desalineado de las claves; proveedor vacío; ID sin prefijo; ID duplicado; `source` ausente.
- [ ] Cubrir `discoveryStatus`: `available`, `binary-missing`, `network-unavailable`, `partial` por
      proveedor fallido y `partial` por cero proveedores.
- [ ] Cubrir `freeModelViolations`: `opencode/big-pickle` con costo 0 pasa; con costo no cero falla;
      ausente del snapshot falla.
- [ ] Cubrir `catalogAgeDays` e `isCatalogStale`: fecha fresca, fecha de 90 días, fecha anterior a 90
      días, fecha inválida y cálculo en UTC.
- [ ] Cubrir `writeJsonAtomic` importado desde `scripts/refresh-model-catalog.mjs`: escribe un archivo
      nuevo, reemplaza uno existente, no deja temporales y, ante un destino inválido (p. ej. un
      directorio), falla sin truncar el contenido previo. El test no ejecuta `opencode`.
- [ ] Agregar guards de contenido: `src/core/model-catalog.js` no contiene `child_process`, `node:fs`
      ni `spawn(`; `src/core/tier-models.js` sigue sin `child_process`; `README.md` contiene los
      tokens del procedimiento (`binary-missing`, `network-unavailable`, `partial`,
      `.ancleto/model-catalog.candidate.json`, `--write`).
- [ ] Confirmar que `test/model-catalog-discovery.test.js` no invoca `opencode`, no usa red y no
      escribe fuera de directorios temporales.

## Fase 7 — Tests de `check`: deriva y antigüedad (tests)

- [ ] En `test/cli.test.js`, agregar el caso de deriva: proyecto temporal instalado; reemplazar un
      `model:` del mirror por un ID ausente de un snapshot inyectado con `ANCLETO_MODEL_CATALOG`;
      ejecutar `check`; afirmar el warning con archivo e ID, la sugerencia de refresco y exit code 0.
- [ ] En `test/cli.test.js`, afirmar que el aviso de deriva no altera el conjunto de aceptación del
      oráculo: un mirror con un estado de tier aceptado no gana un `frontmatter diverge` nuevo por la
      sola ausencia en el catálogo.
- [ ] En `test/cli.test.js`, agregar el caso de catálogo ilegible: `ANCLETO_MODEL_CATALOG` apunta a
      un archivo inexistente o inválido; afirmar el aviso existente de catálogo no verificable, la
      ausencia del warning de deriva y exit code 0.
- [ ] En `test/cli.test.js`, agregar el caso de catálogo antiguo: snapshot inyectado con
      `generated_at` anterior a 90 días; afirmar un único aviso informativo, la resolución normal y
      exit code 0.
- [ ] En `test/cli.test.js`, agregar el caso de catálogo fresco: snapshot inyectado con
      `generated_at` reciente; afirmar que no hay aviso de antigüedad.
- [ ] En `test/cli.test.js`, agregar el caso de host sin `model:` gestionado (`antigravity` con
      `model: inherit` y/o un host que elimina `model:`): afirmar que no se evalúa deriva.
- [ ] Confirmar que los tests existentes del oráculo de tier y de `check` siguen pasando sin cambios
      de expectativas.

## Fase 8 — Validación declarada

- [ ] Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- [ ] Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test`.
- [ ] Ejecutar la validación acotada con rutas explícitas:
      `node --test test/model-catalog-discovery.test.js test/model-catalog.test.js test/cli.test.js test/agent-model-coherence.test.js test/content-guards.test.js`.
- [ ] Registrar Format como `not-configured` y Typecheck como no aplicable, según `PRODUCT.md` →
      `## Project Commands`.
- [ ] Confirmar que no se modificaron `.opencode/**`, `opencode.json`, `agents/*.md`,
      `profiles/**` ni `~/.cache/opencode/models.json`; que no se agregó un agente o skill nuevos; y
      que `.ancleto/model-catalog.candidate.json` no se commitea.
- [ ] Reportar el diff del snapshot (proveedores, IDs, altas, bajas y cambios de costo) y el
      resultado de las validaciones.
