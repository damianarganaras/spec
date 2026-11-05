---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-11-05T03:53:28Z
pluginVersion: 0.18.16
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
- **Un dueño por invariante**: `TIERS`/`TIER_CHAINS`, el resolver, `declaredModelIds` y
  `freeTierOnPrimary` viven en `src/core/tier-models.js`; el parseo/diff/validación/integridad del
  catálogo y `modelIdsFromCatalog`/`missingModelIdsInCatalog`, en `src/core/model-catalog.js`; la
  adaptación de frontmatter y `frontmatterValue`, en `src/core/adapters/frontmatter.js`; la
  detección de entorno, en `src/core/machine-env.js`; el render del working-context, en
  `src/core/memory/working-context.js`; la decisión de la nota de compresión, en
  `src/cli/index.js` → `resolvesHostCompression`; la superficie local de agentes y el oráculo de
  tier, en `src/cli/index.js` → `localAgentDirs`/`checkTierOrphan`.
- **Assets instalables = superficie de producto**: cambios en `agents/`, `commands/`, `skills/`,
  `templates/` o `profiles/` alteran lo que reciben todos los proyectos usuarios (`PRODUCT.md`).

## Modelos y tiers (estado 0.18.16)

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
- La invariante `TIERS.minimo[agente] === TIER_CHAINS.minimo[agente][0]` se cubre con tests
  (`test/agent-model-coherence.test.js`) y con el guard estructural de la spec, **no** con un assert
  de runtime: `TIER_CHAINS` solo existe para `minimo`, y un assert genérico rompería los seams puros
  `resolveTierModels`/`declaredModelIds` que aceptan `tiers`/`chains` inyectados.
- **0.18.15**: `aspec/specs/agent-model-tiers/spec.md` incorporó el requirement
  “El aviso de tier huérfano requiere una superficie de agentes locales” durante el archive del
  change `check-doctor-state-parity`. No cambió `TIERS`, `TIER_CHAINS` ni el resolver.

### Aviso de modelo gratis sobre un agente primario (0.18.13)

- **Predicado único**: `freeTierOnPrimary(model, mode)` (`src/core/tier-models.js`) devuelve verdadero
  solo si `model` satisface `isKnownGratisModel` y `String(mode).trim() === 'primary'`. Es puro: no
  recibe ni infiere un tier, no lee archivos, no hace red y no ejecuta procesos. La invariante es
  **modelo + modo**, con independencia de cómo se instaló el modelo.
- **Set-time (`applyTier`)**: cuando el reemplazo de `model:` cambia el contenido (`o !== c`), lee el
  `mode:` del frontmatter existente con `frontmatterValue(parseFrontmatter(c).entries?.find(e => e.key === 'mode'))`
  y, si el agente es `mode: primary` y el modelo objetivo es gratis, emite por `stderr`
  (`console.warn`) el aviso:
  `ancleto: tier gratis: <agent> es un agente primario (mode: primary) y usará el modelo free <model>; OpenCode puede responder 403 "free tier can only be used from within OpenCode". Usá un modelo pago en el agente primario.`
  No lanza, no cambia el modelo escrito ni el valor de retorno. La rama `o === c` no advierte
  (idempotencia del reemplazo).
- **Inspect-time (`checkAgentsFrontmatter`)**: si el `mode:` **instalado** es `primary` y su
  `model:` instalado satisface `freeTierOnPrimary`, agrega la entrada advisory
  `<dirRel>/<file> (modelo free <model> sobre un agente primario: puede responder 403 en OpenCode)`.
  No incrementa `missing` ni `orphans` y no altera el contrato de salida `missing > 0 ? 1 : 0`.
- La detección se deriva **solo del `mode:` del frontmatter**, nunca del nombre del agente ni de su
  posición en `TIERS`; un `mode: subagent`, un archivo sin `mode:` o un agente ausente no producen
  aviso.
- **Por qué advisory y no bloqueo**: el 403 depende del runtime de OpenCode y de overrides
  `opencode.json → agent.<nombre>.model` invisibles para ancleto. Bloquear rompería instalaciones
  válidas y el contrato de exit de `check`. Decisión aprobada:
  `gratis-free-tier-primary-advisory-nonblocking`.
- **Riesgo del canal**: el aviso de `applyTier` va a `stderr`; wrappers de CI que tratan `stderr`
  como error lo verán, pero el exit code sigue siendo 0.

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

### Integridad de IDs declarados (0.18.12, consolidada en 0.18.13)

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
- **Consolidación documental (0.18.13)**: `aspec/specs/agent-model-tiers/spec.md` tenía dos
  requirements que reenunciaban la integridad de IDs. Se consolidaron con `MODIFIED Requirements`
  conservando **ambos headings** para no romper refs `spec:`/`change:` existentes; la regla
  estricta de `--write` (pre-validar IDs y abortar antes de escribir) queda como enunciación
  autoritativa única. Decisión: `spec-consolidation-preserve-headings`.

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
- **Advisory de modelo gratis sobre primario (0.18.13)**: ver la subsección anterior. Es una entrada
  adicional de la misma salida de avisos, no bloqueante.
- **Antigüedad**: un único aviso informativo por ejecución cuando `generated_at` supera **90 días**
  (`isCatalogStale`), sin TTL en runtime ni efecto en la resolución.
- **Deriva de `.ancletorc.version` (0.18.15)**: ver “Diagnósticos de estado”. Es otro aviso de la
  misma lista, no bloqueante.
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

### Validación de `manifest.mcp` en `import` (0.18.14)

- Antes de cualquier escritura, `importCmd` exige que `manifest.mcp` sea **array** cuando está
  presente (`manifest.mcp !== undefined`). Un valor no-array aborta con
  `ancleto: bundle invalido (manifest.mcp no es un arreglo)` y exit 1
  (`src/cli/index.js` → `importCmd`).
- Cada entrada del array debe ser un objeto con `name` **string no vacío**; si alguna no lo es,
  aborta con `ancleto: bundle invalido (manifest.mcp con entradas invalidas)` y exit 1.
- **Por qué antes del primer write**: `manifest.mcp` se consume después para derivar
  `intendedMcpNames` (`m.name`). Sin la validación, un bundle malformado reventaría a mitad del
  import y dejaría manifiesto, templates o assets ya escritos (import parcial).
- Un bundle con `manifest.mcp` ausente sigue siendo válido; la validación solo se aplica cuando la
  clave existe.

### `import` registra `installedPaths` (0.18.13)

- **La regla**: cuando el bundle incluye `.ancletorc`, el manifiesto se escribe **después** de las
  escrituras de assets que registra y con
  `installedPaths = unionInstalledPaths(<installedPaths del destino>, <lo escrito por este import>)`
  para las cuatro claves `templates|agents|commands|skills`.
- **Qué es "lo escrito"**: los templates efectivamente escritos más lo que devuelve
  `installAgentAssets` (destinos relativos del proyecto). Además se incorporan los directorios
  copiados desde el bundle —`.opencode/agents`, `.opencode/commands` y `.opencode/skills`— a la
  misma unión.
- **Nunca se hereda del bundle**: `export` copia `.ancletorc` verbatim, así que sus rutas describen
  la máquina origen; copiarlas produciría faltantes falsos en el destino. Un bundle sin
  `.ancletorc` no reescribe el manifiesto.
- `unionInstalledPaths` deduplica por clave con `Set`, de modo que una ruta escrita tanto por la
  copia del bundle como por la instalación de assets figura una sola vez, y reimportar no duplica.
- **Cambio observable**: el `check` posterior a un `import` deja de ser vacuo; puede reportar
  faltantes u huérfanos reales antes ocultos por un `installedPaths` vacío. Es la consecuencia
  buscada. Decisión aprobada: `import-installed-paths-union-not-copy`.

## Diagnósticos de estado (0.18.15)

Change archivado:
`aspec/changes/archive/2026-11-04-check-doctor-state-parity/` (proposal, tasks y deltas de
`agent-model-tiers` y `cli-diagnostics`). El change es **solo de oráculo**: ningún escritor
(`init`, `install`, `update`, `upgrade`, `import`, `export`) cambia. La capability canónica es
`aspec/specs/cli-diagnostics/spec.md`.

### Tier dormido (H7)

- **Invariante**: el aviso de tier huérfano de `check` sólo se emite si el proyecto declara al menos
  una **superficie local de agentes**. La superficie se deriva de `localAgentDirs(rc)`: la unión de
  `installedPaths.agents` y el target de agentes del host resuelto en `rc.agent`
  (`AGENT_TARGETS[agent].agents.dir`).
- Si `localAgentDirs(rc)` devuelve `[]` (hosts como `cursor` o `roo`, sin target de agentes), el
  tier queda **dormido**: no se avisa, aunque `.opencode/.ancleto-tier` exista con un tier válido.
- Si hay al menos un directorio declarado pero la suma de archivos `.md` en los directorios
  existentes es `0`, se conserva el aviso histórico
  `tier "<t>" sin agentes locales donde aplicarlo…`.
- Sin archivo de tier o con un tier fuera de `TIERS` no hay aviso. El aviso no suma a `missing` ni
  `orphans` y no altera `missing > 0 ? 1 : 0`.
- **Por qué la superficie y no una lista de hosts**: `localAgentDirs` ya es el dueño de “qué
  superficies declara el proyecto”; filtrar por nombre de host duplicaría esa regla y volvería a
  divergir al agregar un host sin agentes. Decisión aprobada:
  `oracle-tier-orphan-requires-agent-surface`.
- **Riesgo aceptado**: un manifiesto incompleto que omita `installedPaths.agents` y use un host sin
  target de agentes queda silencioso. El escenario `test/cli.test.js` que borra `.opencode/agents`
  y vacía `installedPaths.agents` con `agent: opencode` sigue avisando, porque el target de
  `opencode` vuelve a agregar `.opencode/agents`.

### Deriva de `.ancletorc.version` (H13)

- `check` compara `rc.version` con `packageVersion()` (lee `version` de `package.json` en `ROOT`) y,
  cuando `typeof rc.version === 'string'`, no está vacío y difiere, agrega **una sola vez** a la
  lista de warnings:
  `.ancletorc registra v<rcVersion> y el CLI es v<cliVersion>; corré 'ancleto upgrade' para regenerar los artefactos locales`.
  El printer existente la imprime como `  ⚠ <texto>`.
- No hay aviso si `version` falta, es `""`, no es string (`null`, número, objeto) o coincide con la
  versión del CLI.
- No cambia el exit code, no incrementa contadores, no altera el conjunto de aceptación, no escribe
  archivos y no ejecuta `upgrade`. Éste sigue siendo el único remediador.
- **Por qué advisory y no reparación**: `check` es read-only y su exit ya está definido por
  faltantes; convertir la deriva en un fallo rompería CI que depende de ese contrato. Decisión
  aprobada: `oracle-version-drift-advisory-readonly`.
- **Riesgo aceptado**: la comparación es literal; una diferencia de build metadata o pre-release
  produce el aviso. El costo es informativo.

### Config MCP de `doctor` (H14)

- Precedencia: `.opencode/opencode.json` del proyecto → `.opencode/opencode.jsonc` del proyecto →
  `globalConfigDir()/opencode.json` → `globalConfigDir()/opencode.jsonc`. Se valida **sólo el primer
  archivo existente**; no se validan proyecto y global a la vez.
- La ruta del proyecto se reporta relativa con separadores `/` (por ejemplo
  `.opencode/opencode.json`); la global, por `basename`.
- Mensajes conservados: `✔ <ruta> valido`, `✖ <ruta> JSON invalido`, y
  `⚠ opencode.json no encontrado (config MCP)` cuando no existe ninguno de los cuatro.
- Si existe config de proyecto, **no** se cae al fallback global aunque esa config sea inválida. El
  parseo es el existente (`JSON.parse` sobre el contenido sin BOM); un `.jsonc` con comentarios se
  reporta inválido a propósito.
- `doctor` **no** valida `.agents/mcp_config.json`, `.mcp.json`, `copilot-mcp.json` ni
  `.vscode/mcp.json`. El exit code sigue siendo fatal sólo por Node < 24 o fallo al importar
  `node:sqlite`; config inválida o ausente no lo altera.
- **Por qué proyecto primero**: el proyecto es el ámbito donde `install`/`init` escriben la config
  MCP de `opencode`; validar la global primero medía un archivo que puede no ser el efectivo.
  Decisión aprobada: `doctor-prefers-project-mcp-config`.

### Fuera de alcance (diferido)

H3/H4/H6 (ruteo MCP por host), H5 (entrada caveman contada como compresión), H8 (tier en
`upgrade`), H9 (`installedPaths` multi-host), H10/H11/H12 (portabilidad multi-host) siguen fuera.
M2 (config MCP no parseable) quedó **parcialmente** atendido en 0.18.16: `import` ahora avisa antes
de reemplazarla, pero la decisión de sobrescribir y el carve-out de la nota de compresión no cambian.
Cada uno de los restantes cambia propiedad de estado o contratos congelados (config MCP por host,
byte-identidad de `upgrade`, layout de `export`), no un diagnóstico. Decisión:
`deferred-write-vs-validate-backlog` (estado: descartado como parte de este change).

## Salud de comandos MCP (0.18.16)

Change archivado: `aspec/changes/archive/2026-11-05-mcp-command-health/` (proposal, tasks y delta
`cli-diagnostics`). Los requirements canónicos viven en `aspec/specs/cli-diagnostics/spec.md`. El
change corrige el predicado de salud, unifica el descubrimiento de la config MCP de proyecto y agrega
avisos read-only; **no** cambia el ruteo de escritura MCP por host, la portabilidad ni los tiers.

### Predicado único de salud (`mcpCommandBroken`)

- Una entrada MCP está **rota** sólo cuando: `command` no es un arreglo, o está vacío; su primer
  elemento no es un string no vacío; o su primer elemento es una ruta absoluta de la plataforma
  actual y `existsSync` es falso (`src/cli/index.js` → `mcpCommandBroken`).
- Está **sana** cuando el primer elemento es un comando simple (se presume resuelto por `PATH`) o una
  ruta absoluta existente. Una ruta Windows con letra de unidad (`C:\nvm4w\nodejs\node.exe`,
  `c:/...`) es sana si el archivo existe; la forma con letra de unidad **no** se declara rota por su
  forma. En una plataforma que no la trata como absoluta, cae en la regla de comando simple.
- El predicado no ejecuta el comando, no resuelve `PATH` con procesos externos y no agrega
  dependencias; usa `isAbsolute` y `existsSync`.
- Lo comparten `repairProjectMcp` (`import`/`import --repair`), `refreshCopilotMcp`,
  `refreshCommandCodeMcp` y el aviso advisory de `check`.
- **Cambio observable**: `import --repair` y los `refresh*` dejan de reescribir entradas sanas; en
  Windows, el default `[process.execPath, ...]` deja de quedar "roto" apenas se escribe. Un proyecto
  que dependía del rewrite ciego ya no obtiene esa normalización.

### Descubrimiento único de la config MCP de proyecto

- `PROJECT_MCP_CANDIDATES = ['opencode.json', 'opencode.jsonc']` (`src/cli/index.js`) es el único
  dueño del **conjunto de nombres**; no posee la semántica de selección de cada consumidor.
- `findProjectMcpFile(projectDir)` devuelve el primer archivo existente entre
  `.opencode/opencode.json` y `.opencode/opencode.jsonc`, o `null`.
- `readProjectMcp(projectDir)` usa ese helper y devuelve `{ file, cfg }`; desde 0.18.16 agrega
  `error` cuando el archivo existe y no parsea (`{ file, cfg: {}, error }`). `export` e `import`
  conservan su contrato de lectura.
- `check` y `doctor` comparten la regla de lectura. `doctor` conserva su fallback global y sus
  mensajes (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`,
  `⚠ opencode.json no encontrado (config MCP)`).
- `mergeMcp` conserva su semántica: recolecta **todos** los candidatos existentes y mergea en cada
  uno. `hostConfigHasCompression` conserva la suya: prueba todos los candidatos y considera presente
  `caveman` si alguna config parseable lo declara. La diferencia de selección es intencional.
- No se agrega parseo tolerante de JSONC: un `.jsonc` con comentarios sigue siendo no parseable.

### Avisos advisory de `check`

- `check` inspecciona **sólo** la config MCP del proyecto (no la global ni la de otros hosts). Sin
  config o con todas las entradas sanas, no emite avisos de estado MCP.
- Si la config existe y no parsea, agrega un único aviso:
  `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP` (ruta relativa con `/`).
- Si parsea y `cfg.mcp` es un objeto plano, agrega un aviso por entrada rota:
  `MCP '<nombre>' tiene un comando roto (<detalle>)`. `<detalle>` es el primer elemento sólo cuando
  `command` es un arreglo y ese elemento es un string no vacío; en cualquier otra forma es
  `command ausente`.
- Si `cfg.mcp` no es objeto plano (string, arreglo, número o `null`), no hay avisos MCP y no se
  reporta error de parseo.
- Los avisos se suman al arreglo `warnings` existente y se imprimen como `  ⚠ <texto>`; no cambian el
  exit code (`missing > 0 ? 1 : 0`), no incrementan `missing`/`orphans`, no alteran el oráculo y no
  escriben archivos.
- **`caveman` roto**: produce su propio aviso, pero la compuerta de la nota de compresión sigue
  considerándolo presente (`hostConfigHasCompression` no consulta `mcpCommandBroken`).

### Aviso de `import` antes de reemplazar

- Si la config MCP de proyecto existe y no parsea, `repairProjectMcp` emite a `stderr`, antes de
  escribir, `ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP nueva`.
- El aviso se emite una vez por ejecución y aplica a `import` con bundle y a `import --repair`.
- La decisión de reemplazo **no** cambia: la config no parseable sigue siendo sobrescrita por la
  nueva y el exit code no cambia por el aviso. Una config parseable no produce el aviso; la
  reparación se limita a las entradas rotas y a las ausentes de `intendedNames`.

### Riesgos aceptados

- **Ruido advisory**: un binario de un servidor de usuario que no exista en esta máquina produce un
  aviso por entrada; no bloquea.
- **Alcance de la inspección**: `check` y `doctor` no ven la config global ni las configs MCP de
  otros hosts (`copilot-mcp.json`, `.mcp.json`, `.agents/mcp_config.json`).
- **Existencia en el host actual**: una ruta absoluta válida en otra máquina se reporta rota en
  ésta; es la condición real que evalúa el predicado, no una lista de excepciones.
- **M2 deja de ser silencioso, no de ser destructivo**: `import` avisa, pero sigue reemplazando el
  archivo ilegible sin backup. La nota de compresión y la decisión de escritura no cambian.
- **JSONC comentado**: sigue reportándose inválido; el change no agrega tolerancia de comentarios.

## Nota de compresión host-scoped (0.18.14)

- **Invariante**: para el orchestrator del **host activo** de la corrida (el host que el comando
  está instalando o importando), `CAVEMAN_USAGE_NOTE` existe si y sólo si ese host soporta
  compresión y la **config MCP final de ese mismo host** incluye `caveman`
  (`aspec/specs/agent-install-routing/spec.md`, requirement
  “Compresión por defecto con uso condicional host-scoped y compuerta de medición”).
- **Helper único**: `resolvesHostCompression(projectDir, host, { writesCaveman = false, intendedNames = null })`
  (`src/cli/index.js`, junto a `hostConfigHasCompression`):
  1. `false` si `hostSupportsCompression(host)` es falso (`opencode` y `antigravity` son los únicos
     hosts con soporte).
  2. `true` si `hostConfigHasCompression(projectDir, host)` ya encuentra `caveman` en disco.
  3. `false` si no hay escritura pendiente (`writesCaveman` falso).
  4. `true` si hay escritura pendiente y `intendedNames` es `null` o incluye `'caveman'`.
- **Fuente de verdad en disco**: `hostConfigHasCompression` lee `.agents/mcp_config.json`
  (antigravity) o `.opencode/opencode.json` + `.opencode/opencode.jsonc` (opencode), acepta
  `mcp`/`mcpServers` y busca la clave `caveman`; un archivo ausente o un JSON inválido no aporta la
  tool. Es la misma fuente que usa `check`.
- **Gates**: `install` pasa `writesCaveman: Boolean(mcpMap && mcpMap.caveman)`; `init` hace lo
  mismo con su `mcpMap`; `import` pasa `writesCaveman: agent === 'opencode' && Boolean(freshProjectMcp.caveman)`
  e `intendedNames` derivado de `manifest.mcp`. `repairProjectMcp` solo escribe
  `.opencode/opencode.json`, por eso `import` no cuenta escritura pendiente para antigravity.
- **Alcance excluido**: H3 (escrituras MCP en `.opencode` originadas por otro host), H9
  (`installedPaths` multi-host) y la rama global de `install` sin `--project` quedan fuera. La
  rama global copia `agents/**` verbatim y `check` no la evalúa. En proyectos mixtos, un aviso
  advisory de `check` no invalida el invariante acotado.
- **Excepción M2**: si la config MCP del host no es JSON parseable, `install`/`init` omiten esa
  escritura y avisan; la nota se materializa igual por la escritura pendiente y `check` puede
  divergir. `import <bundle>` en `opencode` queda fuera: `repairProjectMcp` sobrescribe la config;
  desde 0.18.16 emite un aviso por `stderr` antes de reemplazarla, pero no cambia la decisión.
- **`import --repair` sin bundle**: no reescribe assets y, por lo tanto, **no sanea** una nota
  legada; solo `import <bundle>` la re-materializa.
- **Contrato de `check` intacto**: la divergencia de frontmatter sigue siendo advisory, la
  comparación sigue siendo del archivo completo y el exit sigue siendo `missing > 0 ? 1 : 0`.
- **Change archivado**: `aspec/changes/archive/2026-11-04-host-compression-note-consistency/`
  (proposal con enmiendas R1/R2, tasks y deltas). Decisiones aprobadas:
  `compression-note-gate`, `compression-note-active-host-scope`, `tier-applytest-overlay-guard`.

## Superficies del `model:` (nota operativa)

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
- **Pack actual**: tier `minimo`, 786 archivos enumerados, ~36.579 tokens (comprimido). El
  `.discovery-map.json` regenerado reporta 796 archivos (aspec 228, docs 21, test 26, etc.).

## Lint y publicación

- `npm run lint` ejecuta `eslint src/ test/ scripts/` con flat config y cuatro reglas
  (`no-undef`, `no-unused-vars` con patrones `^_`, `eqeqeq`, `no-dupe-keys`); `scripts/` comparte
  exactamente la misma configuración, sin plugin ni ignore nuevo (`eslint.config.js`, `PRODUCT.md`).
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
- **Detección parcial del 403**: el aviso free-on-primary no ve overrides
  `opencode.json → agent.<nombre>.model`; por eso el mensaje dice "puede", nunca garantiza el 403.
- **Check post-import no vacuo**: al poblarse `installedPaths`, un import puede exponer faltantes u
  huérfanos reales. Es el comportamiento correcto y un cambio observable.
- **Tier dormido silencioso (0.18.15)**: un manifiesto incompleto que omita `installedPaths.agents`
  y un host sin target de agentes no produce aviso. Es el comportamiento buscado, pero oculta el
  caso degenerado.
- **Deriva de versión literal (0.18.15)**: cualquier diferencia de string (pre-release o build)
  dispara el advisory; no distingue semánticamente. Es informativo y no bloquea.
- **`.jsonc` con comentarios (0.18.15)**: `doctor` lo reporta inválido porque conserva `JSON.parse`
  estricto; es deliberado para no ampliar alcance.
- **Nota de compresión y proyectos mixtos**: la consistencia cross-host (H3/H9) no está resuelta;
  `check` puede seguir avisando en proyectos con varios hosts. El invariante 0.18.14 es acotado al
  host activo y no promete más.
- **Config MCP no parseable (M2)**: `install`/`init` no pueden leer el estado en disco y materializan
  la nota por la escritura pendiente; `check` puede divergir. Desde 0.18.16 `import` avisa antes de
  reemplazarla, pero sigue sin conservar el contenido ilegible. Es una limitación degenerada aceptada.
- **Ruido y alcance de la salud MCP (0.18.16)**: `check` sólo inspecciona la config MCP del proyecto
  y reporta como roto cualquier binario absoluto ausente en esta máquina; un comando simple se
  presume sano sin resolver `PATH`. Son avisos, no fallos.
- **Artefactos locales**: `.ancletorc` y `.ancleto/machine-env.md` están en `0.18.16` en este
  checkout; siguen siendo derivados gitignored. Si se regeneran con otra versión, el seed no cambia
  porque no los usa como fuente.
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
