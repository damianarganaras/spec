# Proposal: Integridad del catálogo de modelos declarado

## Intención

Cerrar la brecha entre los IDs de modelo que el repositorio declara (`TIERS`, `TIER_CHAINS`,
`agents/*.md` y `profiles/*/agents/*.md`) y el snapshot verificado
(`src/core/model-catalog.json`), sin cambiar la resolución de runtime de los tiers. El change
convierte esa integridad en una verificación reutilizable: helpers puros, gate previo a `--write`,
aviso advisory en `check` y guard de tests. Además corrige la detección de binario ausente para que
no dependa del locale, endurece el manejo de un snapshot corrupto y alinea el lint y los mensajes de
remedio con la realidad de un paquete que no publica `scripts/`.

## Problema

- **El gate de escritura del catálogo es tardío.** `scripts/refresh-model-catalog.mjs --write`
  reemplaza el snapshot sin verificar antes que sobrevivan los IDs declarados en `TIERS`,
  `TIER_CHAINS`, `agents/*.md` y `profiles/*/agents/*.md`. Hoy la ausencia se detecta recién en el
  guard de tests, después de que el snapshot ya se reescribió.
- **`check` no avisa sobre IDs declarados ausentes.** Sólo reporta deriva de un `model:` del mirror
  instalado. Un ID roto en `TIERS` o en un perfil no se ve hasta que la resolución o el host fallan.
- **La detección de binario ausente depende del locale y puede dar falsos positivos.**
  `looksBinaryMissing` concatena `stderr` y `stdout` y aplica una regex de mensajes en inglés/español;
  una corrida exitosa cuyo `stderr` contenga "not found" puede clasificarse como `binary-missing`.
- **Un snapshot corrupto se trata como vacío en el refresco.** `readCurrent` devuelve
  `{ providers: {} }` sin aviso; el diff muestra todas las entradas como altas y no distingue
  "catálogo corrupto" de "catálogo vacío legítimo".
- **El guard de contenido afirma más de lo que verifica.** El test del descubrimiento importa
  `scripts/refresh-model-catalog.mjs`, que importa `node:child_process` transitivamente, pero el guard
  se presenta como si el propio test no cargara procesos. La regla correcta es: los módulos puros
  (`model-catalog.js`, `tier-models.js`) no importan `node:child_process`; el script sí puede.
- **El remedio apunta a `scripts/`, que no se publica.** `package.json` excluye `scripts/` de
  `files`. Un consumidor del paquete instalado que siga el mensaje
  `node scripts/refresh-model-catalog.mjs` del aviso de `check`, o el error del resolver que sugiere
  `scripts/refresh-model-catalog.mjs`, no encuentra el archivo.
- **El lint no cubre `scripts/`.** El comando declarado es `eslint src/ test/`, aunque
  `scripts/refresh-model-catalog.mjs` es código versionado con la misma expectativa estática.
- **La decisión `normal-gratis-not-runtime-validated` quedó incompleta.** Declaró que `normal` y
  `gratis` no se validan en runtime, pero no definió ninguna verificación de integridad para sus IDs
  declarados.

## Cambio propuesto

1. **Helpers puros de IDs declarados, cada uno en su dueño.** `src/core/tier-models.js` expone
   `declaredModelIds({ tiers, chains, agentModels })`: deriva los IDs de `TIERS`, `TIER_CHAINS` y de
   las fuentes de frontmatter ya leídas, excluye `inherit`, deduplica y conserva el origen en un
   `Map`. En `src/core/model-catalog.js`, `missingModelIdsInCatalog(snapshot, ids)` compara esas
   declaraciones contra el snapshot reutilizando `modelIdsFromCatalog`; ese extractor pasa a vivir en
   `model-catalog.js` y `tier-models.js` lo re-exporta para compatibilidad de API. Ambos son puros:
   sin E/S, sin red y sin `node:child_process`.
2. **Gate de `--write`.** `scripts/refresh-model-catalog.mjs` pre-valida, antes de escribir, que todo
   ID declarado en `TIERS`/`TIER_CHAINS` y en las líneas `model:` de `agents/*.md` y
   `profiles/*/agents/*.md` exista en el snapshot candidato. Si falta alguno, sale con exit 1 y no
   escribe. `main(argv, options)` acepta `declaredIds` y `rootDir` inyectables para tests herméticos.
3. **Aviso advisory en `check`.** Si el catálogo cargado es válido y hay IDs declarados ausentes,
   `check` emite un único aviso no bloqueante por ejecución, con los IDs y su origen. No toca
   `tierCandidates`, la lógica de `frontmatter diverge` ni el exit code. Si el catálogo es `null`, no
   emite el aviso.
4. **Detección de binario ausente independiente del locale.** `looksBinaryMissing` se redefine como
   `ENOENT` o (`stdout` sin líneas `provider/...` y `stderr` con un patrón de "not found / not
   recognized" en varios idiomas), sin falso positivo en corridas exitosas. Se cubre con tests
   directos.
5. **Snapshot corrupto.** `check` mantiene el catálogo como `null`; `readCurrent` del script devuelve
   un baseline vacío y emite un aviso explícito. Ningún conjunto vacío debe producir deriva falsa.
6. **Guard de `child_process` transitivo.** Se corrige el falso positivo de
   `test/model-catalog-discovery.test.js`: el script puede importar `node:child_process`; los módulos
   puros no.
7. **Remedio sin ruta instalada.** El mensaje de remedio del aviso de `check` y el error del
   resolver que sugiere refrescar el catálogo pasan a referir al "repositorio fuente", sin una ruta
   que implique ejecución desde el paquete instalado. Se actualizan los literales en spec,
   `README.md` y tests en el mismo change.
8. **Lint de `scripts/`.** El comando declarado pasa a `eslint src/ test/ scripts/`; se actualizan
   `package.json`, `PRODUCT.md` → `## Project Commands` y los tests de contrato que fijan el string.
9. **Superseder la decisión de alcance.** La integridad de IDs declarados se valida de forma advisory
   en `check`, como gate de `--write` y como guard de tests, sin cambiar la resolución runtime de
   `normal`/`gratis` (siguen sin cadenas ni catálogo en el resolver).

## Impacto

- **`check`**: suma un aviso advisory por ejecución cuando el snapshot es válido y faltan IDs
  declarados. El exit code sigue dependiendo sólo de `missing`; `tierCandidates`, la aceptación del
  oráculo y `frontmatter diverge` no cambian.
- **Refresco del catálogo**: `--write` puede fallar antes de escribir si un ID declarado no sobrevive.
  El dry-run y la escritura atómica existente se conservan.
- **Descubrimiento**: `looksBinaryMissing` deja de depender de un único locale y evita clasificar como
  `binary-missing` una corrida exitosa; un snapshot vigente corrupto se reporta explícitamente.
- **Tooling**: `npm run lint` cubre `scripts/`; no se agregan reglas, plugins ni dependencias.
- **Mensajes**: el aviso de `check` y el error del resolver dejan de ofrecer una ruta `scripts/...`
  a una instalación; la resolución no cambia.
- **Sin impacto en runtime**: `TIERS`, `TIER_CHAINS`, `resolveTierModels` y
  `src/core/model-catalog.json` no cambian de forma ni de comportamiento.

## Alcance

**In scope**

- `src/core/model-catalog.js`: hogar de `modelIdsFromCatalog` y de `missingModelIdsInCatalog`, sin
  duplicar la extracción de IDs del snapshot.
- `src/core/tier-models.js`: agrega `declaredModelIds` y re-exporta `modelIdsFromCatalog`; conserva
  la forma de `TIERS`/`TIER_CHAINS`, la resolución y sólo ajusta el literal del error de refresco.
- `scripts/refresh-model-catalog.mjs`: gate de `--write`, `declaredIds`/`rootDir` inyectables,
  `readCurrent` con aviso de corrupción y `looksBinaryMissing` independiente del locale.
- `src/cli/index.js`: aviso advisory de IDs declarados en `check`, reutilizando el catálogo cargado.
- `test/model-catalog.test.js`: cobertura de los helpers y guard que usa `declaredModelIds` +
  `missingModelIdsInCatalog` sobre las cuatro fuentes, sin un helper local de declaraciones.
- `test/model-catalog-discovery.test.js`: gate de escritura, `readCurrent`, `looksBinaryMissing` y
  corrección del guard de `child_process`.
- `test/cli.test.js`: aviso advisory, snapshot corrupto y literal del remedio.
- `test/linter-config.test.js`: string exacto del comando de lint.
- `README.md`, `PRODUCT.md`, `package.json`: procedimiento, comando declarado y remedio.
- Deltas de `agent-model-tiers` y `linter-standard` bajo este change.

**Out of scope / no-goals**

- Cambiar la forma de `TIERS` (agente→string) o agregar cadenas a `normal`/`gratis`.
- Validar `normal`/`gratis` contra el catálogo en runtime o cambiar `resolveTierModels`.
- Descubrir modelos en `install`, `update`, `init`, `import`, `check`, tests o CI.
- Publicar `scripts/` en `package.json` o mover el script dentro de `src/`.
- Refrescar o reescribir `src/core/model-catalog.json` y inventar IDs.
- Crear una capability, un agente o una skill nuevos.
- Regenerar el technical seed (estado `STALE`/`minor`, sólo se registra).

## Arquitectura

- **Cada helper en el módulo dueño de su invariante.** `src/core/tier-models.js` sigue siendo el
  único dueño de `TIERS`/`TIER_CHAINS` y expone `declaredModelIds`, que deriva de valores ya
  recibidos. `src/core/model-catalog.js` es el hogar de `modelIdsFromCatalog` y de
  `missingModelIdsInCatalog`; `tier-models.js` re-exporta el extractor para conservar su API. Así la
  extracción de IDs tiene un solo dueño y no se crea un ciclo entre módulos.
- **E/S y procesos sólo en el borde.** El script lee archivos y ejecuta `opencode`; pasa los
  contenidos a `declaredModelIds`. `check` lee los archivos versionados y usa los mismos helpers
  puros.
- **El gate precede a toda escritura.** La validación de IDs corre antes de escribir el candidato y
  antes de reemplazar el snapshot cuando se pidió `--write`; un fallo deja ambos archivos intactos.
- **El aviso advisory no comparte camino con el oráculo.** `tierCandidates`, la aceptación de
  `frontmatter` y el exit code quedan sin cambios; el aviso usa un texto distinguible del aviso de
  deriva por mirror para no alterar los contadores existentes.
- **Sin capability nueva.** El contrato vive en `agent-model-tiers`; el alcance de lint vive en
  `linter-standard`.

## Spec delta

- `aspec/changes/ch-13-model-catalog-integrity/specs/agent-model-tiers/spec.md`
  - **ADDED** `Integridad de los IDs declarados contra el snapshot`: `declaredModelIds` en
    `tier-models.js`, `missingModelIdsInCatalog` en `model-catalog.js` con `modelIdsFromCatalog`
    re-exportado, guard sobre las cuatro fuentes, gate de `--write`, inyección de
    `declaredIds`/`rootDir` y corrección del guard de `child_process`.
  - **ADDED** `Detección de binario ausente independiente del locale`.
  - **ADDED** `Baseline vacío y aviso ante snapshot ilegible en el refresco`.
  - **MODIFIED** `Advertencia no bloqueante de deriva del catálogo en check`: aviso advisory de IDs
    declarados, invariante de catálogo `null` y ausencia de deriva falsa.
  - **MODIFIED** `Procedimiento de mantenimiento del catálogo documentado`: `scripts/` sólo en el
    repositorio fuente y remedios (aviso de `check` y error del resolver) sin ruta instalada.
- `aspec/changes/ch-13-model-catalog-integrity/specs/linter-standard/spec.md`
  - **MODIFIED** `Configuración de ESLint mínima`, `Script npm de lint` y
    `Código existente libre de violaciones`: alcance `src/`, `test/` y `scripts/`.

## Paths autorizados del change

- `aspec/changes/ch-13-model-catalog-integrity/**`
- `src/core/model-catalog.js`
- `src/core/tier-models.js` (`declaredModelIds`, re-export de `modelIdsFromCatalog` y el literal del
  error de refresco; sin cambios de forma ni resolución)
- `scripts/refresh-model-catalog.mjs`
- `src/cli/index.js`
- `test/model-catalog.test.js`
- `test/model-catalog-discovery.test.js`
- `test/cli.test.js`
- `test/linter-config.test.js`
- `test/content-guards.test.js` (sólo si el literal del remedio lo exige)
- `README.md`
- `PRODUCT.md`
- `package.json`

## Riesgos

- **(i) Colisión con los contadores del aviso de deriva.** Los tests actuales cuentan
  `ausente del catálogo de modelos` por cada mirror. Mitigación: el aviso advisory usa un texto
  distinguible, se emite una sola vez y los tests afirman ambos avisos por separado.
- **(ii) Tests de `--write` existentes sin IDs inyectados.** El gate fallaría contra fixtures
  mínimos. Mitigación: los tests pasan `declaredIds`/`rootDir` explícitos; el default sigue leyendo
  el repositorio real.
- **(iii) Falso positivo del gate por `inherit` o por líneas no-modelo.** Mitigación: sólo se
  consideran líneas `model:` y se excluye `inherit`; `declaredModelIds` deduplica antes de comparar.
- **(iv) Lint de `scripts/` descubre violaciones preexistentes.** Mitigación: se corrigen en este
  change y se valida con `npm run lint`; no se agregan reglas nuevas ni ignores.
- **(v) `looksBinaryMissing` demasiado amplio.** Mitigación: `status === 0` nunca es
  `binary-missing` salvo `ENOENT`; si `stdout` enumera al menos un `provider/`, no se evalúa el
  patrón de `stderr`.
- **(vi) Snapshot corrupto tratado como vacío.** Mitigación: `check` mantiene `null`; el script
  devuelve baseline y avisa; ningún set vacío dispara deriva.

## Supuestos

- El snapshot versionado sigue siendo el del baseline verificado: 5 proveedores, 211 IDs,
  `generated_at 2026-11-04`, en sync con `opencode models` (diff 0). Este change no lo refresca.
- `TIERS` conserva la forma agente→string en los tres tiers y `TIER_CHAINS` sólo existe para
  `minimo`; no se agregan cadenas a `normal`/`gratis`.
- `check` carga el catálogo sólo cuando el host instalado incluye `opencode`; el aviso advisory sigue
  esa misma condición.
- `scripts/` no está en `files` de `package.json`; el paquete instalado no lo incluye.
- El technical seed está `STALE` con `impact: minor`; se registra la deriva y no se regenera en este
  change.

## Decisiones

- **memory_key:** `normal-gratis-advisory-catalog-integrity`
  **Elección:** la integridad de los IDs declarados se valida en tres puntos —aviso advisory en
  `check`, gate previo a `--write` y guard de tests— sin cambiar la resolución runtime de
  `normal`/`gratis`; supersede a `normal-gratis-not-runtime-validated`.
  **Descartado:** agregar cadenas de catálogo a `normal`/`gratis` o validar todos los tiers en el
  resolver; hacer fallar `check` por un ID declarado ausente.
  **Justificación:** detecta IDs rotos antes de que fallen el host o el refresco sin alterar el
  contrato offline y determinista del runtime; los tiers sin cadena conservan su resolución actual.
  **Refs:** `change:ch-13-model-catalog-integrity`;
  `decision:normal-gratis-not-runtime-validated`; `path:src/core/model-catalog.js`;
  `path:scripts/refresh-model-catalog.mjs`; `path:src/cli/index.js`;
  `spec:agent-model-tiers#Advertencia no bloqueante de deriva del catálogo en check`
  **Estado:** aprobado

- **memory_key:** `scripts-not-shipped-remedy-reword`
  **Elección:** el mensaje de remedio del aviso de `check` y el error del resolver refieren al
  "repositorio fuente" y no incluyen una ruta ejecutable de `scripts/`; README, spec y tests usan el
  mismo literal actualizado.
  **Descartado:** publicar `scripts/` en `files`; mantener el mensaje con
  `node scripts/refresh-model-catalog.mjs`; mover el script a `src/`.
  **Justificación:** `package.json` excluye `scripts/` del paquete publicado; una ruta a un archivo
  inexistente en la instalación convierte el remedio en un callejón sin salida.
  **Refs:** `change:ch-13-model-catalog-integrity`; `path:src/cli/index.js`;
  `path:src/core/tier-models.js`; `path:README.md`; `path:package.json`;
  `spec:agent-model-tiers#Procedimiento de mantenimiento del catálogo documentado`
  **Estado:** aprobado

- **memory_key:** `lint-scope-includes-scripts`
  **Elección:** el único comando declarado de lint pasa a `eslint src/ test/ scripts/`, reflejado en
  `package.json`, `PRODUCT.md` y los tests de contrato.
  **Descartado:** dejar `scripts/` fuera del lint; agregar un segundo script o una configuración
  separada para `scripts/`.
  **Justificación:** `scripts/refresh-model-catalog.mjs` es código versionado con la misma expectativa
  estática que `src/` y `test/`; un solo comando evita runners y superficies de configuración nuevas.
  **Refs:** `change:ch-13-model-catalog-integrity`; `path:package.json`; `path:PRODUCT.md`;
  `path:test/linter-config.test.js`; `spec:linter-standard#Script npm de lint`
  **Estado:** aprobado

- **memory_key:** `looksbinbinary-locale-independent`
  **Elección:** `looksBinaryMissing` detecta `ENOENT` o, sólo con `status` no exitoso, ausencia de
  líneas `provider/...` en `stdout` más un patrón de "not found / not recognized" en varios idiomas
  en `stderr`.
  **Descartado:** concatenar `stdout` y `stderr` y aplicar la regex actual; confiar sólo en el exit
  code; reconocer únicamente mensajes en inglés.
  **Justificación:** evita falsos positivos en corridas exitosas que escriben "not found" en `stderr`
  y reconoce el fallo de shell en Windows y en otros locales sin depender de un texto único.
  **Refs:** `change:ch-13-model-catalog-integrity`; `path:scripts/refresh-model-catalog.mjs`;
  `path:test/model-catalog-discovery.test.js`;
  `spec:agent-model-tiers#Descubrimiento dev-only del catálogo con clasificación de frescura`
  **Estado:** aprobado

- **memory_key:** `declared-ids-helper-ownership`
  **Elección:** `declaredModelIds` vive en `src/core/tier-models.js` (dueño de `TIERS`/`TIER_CHAINS`);
  `modelIdsFromCatalog` se mueve a `src/core/model-catalog.js` y se re-exporta desde `tier-models.js`;
  `missingModelIdsInCatalog` vive en `model-catalog.js` y reutiliza ese extractor.
  **Descartado:** ubicar ambos helpers en `model-catalog.js` con el nombre `missingDeclaredModelIds`;
  duplicar la extracción de IDs en un helper privado; dejar `tier-models.js` limitado al literal del
  error.
  **Justificación:** cada helper queda en el módulo dueño de su invariante, la extracción de IDs tiene
  un solo dueño y la re-exportación conserva la API pública sin crear un ciclo entre módulos.
  **Refs:** `change:ch-13-model-catalog-integrity`; `path:src/core/tier-models.js`;
  `path:src/core/model-catalog.js`; `path:test/model-catalog.test.js`;
  `spec:agent-model-tiers#Integridad de los IDs declarados contra el snapshot`
  **Estado:** aprobado

## Change Log

- 2026-11-04 — Creación del change a partir del alcance aprobado de CH-13 y de la evidencia
  verificada en `8f48a59` (v0.18.11). Sin technical seed nuevo: el seed está `STALE`/`minor`.
- 2026-11-04 — Alineación con la implementación real: `declaredModelIds` en `tier-models.js`,
  `missingModelIdsInCatalog` en `model-catalog.js` y `modelIdsFromCatalog` re-exportado; guard sobre
  las cuatro fuentes.
