---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-11-04T17:02:55Z
pluginVersion: 0.18.12
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Reglas estructurales (declaradas)

- **Cero dependencias de runtime**: `package.json` no tiene `dependencies`; solo `devDependencies`
  (`eslint`, `globals`). Agregar una dependencia de runtime rompe el contrato de distribución
  (`PRODUCT.md`).
- **Node ≥ 24**: obligatorio por `node:sqlite`; `ancleto doctor` bloquea con major menor
  (`src/cli/index.js`).
- **ESM puro**: `"type": "module"`; no hay TypeScript ni `tsconfig.json` pese a la mención genérica
  de `AGENTS.md` (`PRODUCT.md` lo aclara).
- **Un dueño por invariante**: `TIERS`/`TIER_CHAINS`, el resolver y `declaredModelIds` viven en
  `src/core/tier-models.js`; el parseo/diff/validación/integridad del catálogo y
  `modelIdsFromCatalog`/`missingModelIdsInCatalog`, en `src/core/model-catalog.js`; la adaptación de
  frontmatter, en `src/core/adapters/frontmatter.js`; la detección de entorno, en
  `src/core/machine-env.js`; el render del working-context, en `src/core/memory/working-context.js`.
- **Assets instalables = superficie de producto**: cambios en `agents/`, `commands/`, `skills/`,
  `templates/` o `profiles/` alteran lo que reciben todos los proyectos usuarios (`PRODUCT.md`).

## Modelos y tiers (estado 0.18.12)

### Tabla y cadenas

- `TIERS` conserva la forma **agente → string**; para los tiers con cadena, cada valor es la
  **cabeza** de su cadena. `TIERS.normal.reviewer = 'opencode-go/qwen3.8-max'`; el resto de
  `normal` sigue en `opencode-go` (`src/core/tier-models.js`).
- `TIER_CHAINS` se exporta desde el mismo módulo. `minimo` comparte una única cadena para los diez
  agentes: `commandcode/deepseek/deepseek-v4.1-flash` → `opencode-go/deepseek-v4.1-flash` →
  `opencode/deepseek-v4.1-flash-free`.
- `resolveTierModels(tier, catalog, …)` es **puro e inyectable** (recibe el catálogo). Devuelve
  `models`, `candidates` (todos los candidatos estáticos por agente) y `unresolved`. En modo
  estricto lanza error explícito si ningún candidato está disponible; `allowUnresolved` lo usa
  `check` para no abortar.
- **Contrato preservado**: `TIERS` no pasó a arrays porque `applyTier`, el oráculo, dos guards y el
  spec vigente dependen de la forma string. La cadena vive en `TIER_CHAINS`.

### Catálogo verificado

- `src/core/model-catalog.json` es un **snapshot commiteado** con `generated_at: 2026-11-04`,
  método `opencode models <provider> --verbose --refresh` y **5 proveedores / 211 IDs**:
  `opencode` (10), `opencode-go` (30), `anthropic` (20), `commandcode` (71), `openai` (80).
- `src/core/model-catalog.js` es el dueño único de los **helpers puros**: enumerar proveedores de
  la salida plana, validar nombres de proveedor antes de spawnear, parsear la salida verbose, diff
  de snapshots, validar la forma, clasificar la corrida, detectar violaciones de modelo gratuito,
  calcular antigüedad y contrastar IDs declarados. **No** importa `node:child_process`, no hace red
  y no escribe archivos.
- `modelIdsFromCatalog(catalog)` es la **única extracción de IDs** del snapshot: acepta el snapshot
  completo o un mapa proveedor→IDs y es reutilizada por `missingModelIdsInCatalog`.
  `src/core/tier-models.js` la re-exporta para conservar su API.
- `loadModelCatalog` acepta la ruta por `ANCLETO_MODEL_CATALOG` (seam de test/manual); no consulta
  red ni ejecuta procesos.
- El guard estructural `test/agent-model-coherence.test.js` + `test/model-catalog.test.js` detecta
  IDs de `TIERS`, `TIER_CHAINS`, `agents/*.md` o `profiles/*/agents/*.md` ausentes del snapshot.

### Integridad de IDs declarados (0.18.12)

- `declaredModelIds({ tiers, chains, agentModels })` (`src/core/tier-models.js`) deriva los IDs
  declarados de `TIERS` (todos los tiers/agentes), `TIER_CHAINS` (todos los candidatos) y las
  fuentes de frontmatter ya leídas (`agentModels: [{ id, source }]`). Deduplica conservando el
  primer origen en un `Map` id→origen, excluye `inherit` y es **puro**: no lee archivos, no ejecuta
  procesos ni hace red.
- `missingModelIdsInCatalog(snapshot, ids)` (`src/core/model-catalog.js`) devuelve las entradas
  declaradas (strings, `{ id, source }` o el `Map`) cuyo ID no figura en el snapshot; reutiliza
  `modelIdsFromCatalog` y no muta el snapshot.
- **Guard de tests**: la suite deriva con `declaredModelIds` y compara con
  `missingModelIdsInCatalog`, cubriendo los tres tiers, todos los candidatos, `agents/*.md` y
  `profiles/*/agents/*.md`. El mensaje nombra ID y origen. No usa red ni `.opencode/**`.
- **Guard de contenido**: `model-catalog.js` y `tier-models.js` no importan `node:child_process`;
  el script sí puede hacerlo, y el test no falla por su carga transitiva.

### Descubrimiento dev-only

- `scripts/refresh-model-catalog.mjs` es el **único punto que lanza procesos** (`opencode models`).
  Es manual y vive fuera del tarball publicado (`package.json` → `files` no incluye `scripts/`).
- Enumera **todos** los proveedores desde `opencode models --refresh` y consulta cada uno con
  `opencode models <provider> --verbose --refresh`; los nombres inseguros se rechazan antes de
  pasarlos como argumento.
- Clasificación con precedencia fija:
  `binary-missing` > `partial` (proveedor fallido o ninguno enumerado) >
  `network-unavailable` (marcador `Failed to fetch models.dev`) > `available`.
- `looksBinaryMissing(result)` es **independiente del locale**: devuelve verdadero solo con
  `error.code === 'ENOENT'` o, si la corrida falló y `stdout` no enumera proveedores, cuando
  `stderr` coincide con un mensaje de comando no encontrado/no reconocido en varios idiomas
  (inglés, español, francés, alemán, portugués). Una corrida exitosa nunca es `binary-missing`
  aunque `stderr` tenga ruido; un `provider not found` suelto es error de la app, no binario
  faltante; timeout/buffer/permisos se clasifican `partial`.
- Solo `available` habilita el candidato. Antes de escribir: valida la forma, rechaza
  `opencode/big-pickle` si su `cost.input`/`cost.output` no es 0, imprime el diff (proveedores e
  IDs altos/bajos y cambios de `cost`/`limit`) y escribe el candidato en
  `.ancleto/model-catalog.candidate.json` (local, no se commitea).
- **Gate de `--write` (0.18.12)**: antes de cualquier escritura deriva los IDs declarados desde
  `TIERS`, `TIER_CHAINS`, `agents/*.md` y `profiles/*/agents/*.md`, y los contrasta contra el
  candidato. Si falta al menos uno, sale con exit 1, nombra ID y origen, y **no escribe ni el
  snapshot commiteado ni el candidato**. Si las fuentes no se pueden leer, falla cerrado; el
  dry-run no lee esas fuentes. `main(argv, options)` acepta `declaredIds` y `rootDir` inyectables.
- `readCurrent(path)` de un snapshot ilegible devuelve `{ providers: {} }` con aviso explícito y
  usa ese baseline solo para el diff; no lo trata como snapshot autoritativo.
- El snapshot se reemplaza solo con `--write`, de forma **atómica** (temporal + rename); el dry-run
  nunca toca `src/core/model-catalog.json`.
- **Ni runtime ni CI descubren modelos ni acceden a la red**: el descubrimiento no se importa desde
  `src/` y no corre en tests, `install`/`update`/`init`/`import`/`check`.

### `gratis` es free-only

- `gratis` = `opencode/big-pickle` (costo 0) para los diez agentes; `GRATIS_FALLBACK_MODEL` es la
  única fuente (`src/core/tier-models.js`).
- Un `gratisModel` persistido desconocido se **normaliza** al fallback en `install`/`update`/`init`/
  `import`; la clave solo se reescribe si ya existía en el manifiesto.
- **Eliminado**: `MUSE_SPARK_MODEL`, `detectMuseSpark()`, `envGratisModel()` y la rama
  `ANCLETO_MUSE_SPARK`. Los modelos `*-contributor` reales no son free tier (cuestan 0.1/0.2), por
  eso no se usan como `gratis`.
- El refresh **rechaza** el candidato si `opencode/big-pickle` deja de costar 0: la invariante se
  valida en el tooling, no solo en el tier.

### Oráculo y avisos de `check`

- El oráculo de tier solo aplica a mirrors de `opencode` (el único host que escribe `model:`).
- Para `minimo`, el **conjunto de aceptación** es la cadena estática completa, con el
  resuelto-ahora primero: un mirror escrito cuando el catálogo tenía otro candidato sigue siendo
  válido.
- El catálogo se carga **una sola vez por ejecución** y solo si `opencode` está instalado. Un JSON
  parseable con forma inválida (`{}`, `{providers:{}}`, array, string) se descarta
  (`validateCatalogSnapshot`), igual que un catálogo ilegible: **no produce deriva falsa**.
- Si el catálogo no se puede verificar, `check` **no aborta**: acepta los candidatos estáticos y
  emite un aviso no bloqueante por directorio de agents (`no se pudo verificar el catálogo…`).
  `install`/`init`/`import` sí fallan con error.
- **Deriva por archivo**: si un `model:` del mirror de `opencode` no figura en el snapshot legible,
  `check` emite un warning por archivo que nombra el ID y refiere el refresco al repositorio fuente.
  No cambia el exit code ni el conjunto de aceptación.
- **Aviso advisory de IDs declarados (0.18.12)**: con catálogo válido, `check` emite como máximo
  un aviso por ejecución si un ID declarado en `TIERS`, `TIER_CHAINS`, `agents/*.md` o
  `profiles/*/agents/*.md` no figura en el snapshot. Lista ID y origen y es distinguible del
  warning de deriva por `model:` del mirror. No altera contadores, oráculo ni exit code.
- **Antigüedad**: un único aviso informativo por ejecución cuando `generated_at` supera **90 días**
  (`isCatalogStale`), sin TTL en runtime ni efecto en la resolución.
- El exit code de `check` solo cambia por faltantes; huérfanos, divergencias, deriva, advisory,
  antigüedad y catálogo no verificable son warnings.

### `import` y `hosts`

- `ancleto import` **lee y resuelve antes del primer write**: un catálogo inválido no deja un import
  a medio aplicar.
- Escribe `.opencode/.ancleto-tier` con el tier del bundle (paridad con `init`), porque `check` lee
  ese archivo como oráculo. Sin escribirlo, un import sobre un proyecto inicializado dejaba el tier
  viejo y producía divergencias falsas.
- El tier solo se aplica/resuelve en mirrors de `opencode`; en otros hosts no se resuelve ni se
  aborta.

### Superficies del `model:` (nota operativa)

`AGENTS.md` describe tres superficies: `agents/*.md` (canónica publicada), `.opencode/agents/*.md`
(mirror que regenera `ancleto upgrade`) y `~/.config/opencode/agents/*.md` (instalación global).
`opencode.json` → `agent.<nombre>.model` aplica al agente primario, no a los subagentes. El default
publicado de los agentes es `commandcode/deepseek/deepseek-v4.1-flash`; el tier que aplica `install`
sin `--tier` es `normal`.

## Memoria persistente

- **Ubicación**: `.ancleto/memory.db` (SQLite + FTS5). No sale del repositorio.
- **Identidad**: `memory_key` es la clave transversal; el `recordNode` supersede sin filtrar por
  `type`/`scope`.
- **Escritura**: toda escritura pasa por `recordNode`; valida refs `spec:`/`change:`/`path:` y
  rechaza secretos de forma incondicional. La única exención de refs es la procedencia `runtime`.
- **Procedencia (`source`)**: la resuelve el runtime (`context.source`), nunca el caller; valores
  `mcp:ancleto-memory`, `cli:import`, `runtime`, `agent:<rol>`.
- **Recall**: orden total determinístico (requerido → anclaje declarado → scope → bm25 → `memory_key`);
  preview por defecto (≤240 caracteres, `limit` 5, `content_truncated`), `expand: true` devuelve el
  payload completo y `keys` expande claves presentes en la página. `required` es entrada de llamada
  (no estado persistido); si no entra en el `limit`/presupuesto, falla.
- **Working-context**: `.ancleto/working-context.md` se renderiza desde el engine vivo o desde la
  topología en día-cero; el refresh on-write es compare-based y no crea archivos vacíos.
- **Ops read-only por defecto**: `memory doctor`, `memory curate`, `memory list` y
  `memory consolidate` (sin `--apply`) no migran ni escriben. `snapshot` usa conexión read-only y
  `VACUUM INTO`, con reemplazo seguro en Windows.

## Discovery y seed

- **Estado del seed**: `READY` si el hash de fuentes coincide con `.discovery-state.json`; `STALE`
  con `impact: material|minor`; `PARTIAL`/`MISSING` por documentos faltantes.
- **Área**: directorio de primer nivel; los archivos raíz son su propia área. `seed-map.json` mapea
  documento → áreas y permite calcular `affectedDocs`.
- **Materialidad**: `package.json`, `tsconfig*`, configs de bundlers, `Dockerfile`, `index.html`,
  `src/(main|index).*` y la aparición/desaparición de áreas raíz fuerzan `impact: material`.
- **Exclusiones**: `node_modules`, `.git`, `dist` siempre; el `outputDir` del seed se excluye del
  hash. El tier `minimo` agrega `test/**`, `docs/**` y `**/*.md` al pack.
- **Presupuesto**: `gratis` limita a 50.000 tokens; `normal`/`minimo` sin presupuesto fijo. El pack
  que excede el budget aborta.
- **Pack actual**: tier `minimo`, 769 archivos, ~35.730 tokens (comprimido); `.discovery-map.json`
  reporta 780 archivos totales.

## Lint y publicación

- `npm run lint` ejecuta `eslint src/ test/ scripts/` con flat config y cuatro reglas
  (`no-undef`, `no-unused-vars`, `eqeqeq`, `no-dupe-keys`); `scripts/` comparte exactamente la misma
  configuración, sin plugin ni ignore nuevo (`eslint.config.js`, `PRODUCT.md`).
- CI corre `npm ci` → `npm run lint` → `node --test test/*.test.js`; si lint falla no publica
  (`.github/workflows/publish.yml`).
- **`scripts/` no se publica**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`. El refresco del catálogo solo existe en el repositorio fuente; los
  mensajes de remedio no ofrecen una ruta ejecutable de `scripts/` al usuario instalado.

## Riesgos y deuda observada

- **Snapshot del catálogo envejece**: es estático; si un proveedor retira un ID, `install` falla
  recién en `ancleto` (no en el host). Mitigación: refresco manual con `--refresh`, aviso de
  antigüedad a los 90 días, guard de integridad y gate de `--write`.
- **Costo de `reviewer`**: `qwen3.8-max` (2/6) es más caro que `qwen3.8-flash`; es el tradeoff
  aceptado para `normal` (el tier de modelos más capaces).
- **Descubrimiento no publicado**: `scripts/` no está en `package.json` → `files`; el refresco del
  catálogo solo existe en el repo fuente, no en el tarball npm.
- **Un solo camino de spawn**: `scripts/refresh-model-catalog.mjs` es el único lugar con
  `node:child_process`; cualquier intento de mover el descubrimiento a `src/` rompería el contrato
  dev-only y el "cero red en runtime".
- **Gate dependiente de fuentes legibles**: `--write` falla cerrado si no puede leer `agents/` o
  `profiles/`; es intencional para no quedar ciego, pero exige correr el refresco desde el repo
  fuente completo.
- **Doble fuente de tier por host**: solo `opencode` materializa `model:`; otros hosts lo dropean
  (claude/vscode/copilot/commandcode) o emiten `model: inherit` (antigravity). Resolver el catálogo
  ahí no tendría efecto.
- **Artefacto local desactualizado**: `.ancleto/machine-env.md` registra `ancleto: 0.18.8` mientras
  `package.json` está en `0.18.12`; es un derivado que se regenera en `init`/`install`/`upgrade`, no
  un manifiesto versionado.
- **Docs legados**: `documentation/` es material lnx-cli gitignored, no runtime; `docs/` contiene
  documentación del framework y el seed.

## Reglas de proceso

- **Commits**: Conventional Commits; no directo a `main`/`master` (`AGENTS.md`).
- **Validaciones**: solo lo declarado en `PRODUCT.md`; omitir y registrar lo no declarado.
- **Frescura del seed al archivar**: `STALE` material requiere aprobación explícita del usuario;
  `minor` se anota y continúa (`AGENTS.md`).
- **Memoria vs agente**: reglas/decisiones del repo → `.ancleto/memory.db`; notas de sesión →
  memoria del agente. Una entrada vive en una sola (`AGENTS.md`).
- **Secretos**: nunca copiar valores; nombrar la variable o archivo y omitir el valor.
