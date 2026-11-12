---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-11-12T16:36:00Z
pluginVersion: 0.30.0
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
  tier, en   `src/cli/index.js` → `localAgentDirs`/`checkTierOrphan`; la norma de ruteo del triage, en
  `agents/orchestrator.md` (0.21.0); el parseo, plan y serialización del merge de specs, en
  `src/core/specs-merge.js` (0.22.0–0.22.1); la secuencia de archive y la compuerta de promoción, en
  `agents/orchestrator.md`, `agents/documenter.md` y las skills de archive (0.22.1).
- **Assets instalables = superficie de producto**: cambios en `agents/`, `commands/`, `skills/`,
  `templates/` o `profiles/` alteran lo que reciben todos los proyectos usuarios (`PRODUCT.md`).

## Modelos y tiers (estado 0.30.0)

### Tabla y cadenas

- `TIERS` conserva la forma **agente → string**; para los tiers con cadena, cada valor es la
  **cabeza** de su cadena. `TIERS.normal.reviewer = 'opencode-go/qwen3.8-max'`; el resto de
  `normal` sigue en `opencode-go` (`src/core/tier-models.js`).
- `TIER_CHAINS` se exporta desde el mismo módulo. `minimo` comparte una única cadena de **dos**
  candidatos para los diez agentes: `opencode-go/deepseek-v4.1-flash` →
  `opencode/deepseek-v4.1-flash-free`. La cabeza es el modelo que publican los `agents/*.md`;
  `commandcode/deepseek/deepseek-v4.1-flash` ya no es candidato de la cadena.
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
- **0.21.0–0.25.0 no modifican** el snapshot del catálogo: los cambios de 0.21.0 viven en contratos
  de prompt, `agents/` y `skills/`; los de 0.22.0 y 0.22.1, en el merge de specs y en el orden del
  archive; 0.24.0 sólo alinea los valores de `TIERS.minimo`/`MINIMO_CHAIN` (no el snapshot); 0.25.0
  sólo rutea el sync del archive por `specs merge` y agrega el guard de `--help`.

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
  `installAgentAssets` (destinos relativos del proyecto). Desde 0.20.0, los directorios copiados
  desde el bundle —`.opencode/agents`, `.opencode/commands` y `.opencode/skills`— se incorporan a la
  misma unión **sólo cuando el host activo es `opencode`**; en los demás hosts no se copian ni se
  registran y los assets se materializan por `installAgentAssets`.
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

- **Estado 0.18.15**: la precedencia era `.opencode/opencode.json` del proyecto →
  `.opencode/opencode.jsonc` del proyecto → `globalConfigDir()/opencode.json` →
  `globalConfigDir()/opencode.jsonc`, validando **sólo el primer archivo existente**. Desde 0.19.0 la
  precedencia es host activo → hosts instalados → global (ver “Ruteo MCP por host”); los mensajes
  (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`, `⚠ opencode.json no encontrado (config MCP)`) y el
  parseo estricto se conservan. La ruta del proyecto se reporta relativa con separadores `/`; la
  global, por `basename`.
- Si existe config de proyecto, **no** se cae al fallback global aunque sea inválida. El parseo es
  `JSON.parse` sobre el contenido sin BOM; un `.jsonc` con comentarios se reporta inválido a
  propósito.
- El exit code sigue siendo fatal sólo por Node < 24 o fallo al importar `node:sqlite`; config
  inválida o ausente no lo altera. `doctor` no valida `.vscode/mcp.json` ni crea MCP para hosts sin
  destino.
- **Por qué proyecto primero**: el proyecto es el ámbito donde `install`/`init` escriben la config
  MCP de `opencode`; validar la global primero medía un archivo que puede no ser el efectivo.
  Decisión aprobada: `doctor-prefers-project-mcp-config`.

### Fuera de alcance (diferido)

H3/H4/H6 (ruteo MCP por host) y H10/H11/H12 (portabilidad multi-host) quedaron resueltos por
`mcp-host-write-routing` (0.19.0) y `host-neutral-bundle` (0.20.0). Siguen fuera: H5 (entrada
caveman contada como compresión), H8 (tier en `upgrade`) y H9/N2 (`installedPaths`/estado de tier
multi-host). M2 (config MCP no parseable) quedó **parcialmente** atendido en 0.18.16: `import` avisa
antes de reemplazarla, pero la decisión de sobrescribir y el carve-out de la nota de compresión no
cambian. La colisión `.mcp.json` entre `commandcode` y `claude` y la idempotencia del refresco de
`opencode`/`antigravity` en `upgrade` siguen diferidas por decisión explícita de 0.20.0. Cada uno de
los restantes cambia propiedad de estado o contratos congelados (byte-identidad de `upgrade`,
layout de `export`), no un diagnóstico. Decisión:
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
  `error` cuando el archivo existe y no parsea (`{ file, cfg: {}, error }`). Es la lectura legacy de
  `export` para hosts sin destino y la base de `readHostMcpIntent`.
- Desde 0.19.0 `check` y `doctor` resuelven el archivo por `resolveHostMcpDestination` /
  `resolveExistingHostMcpDestinations`; `PROJECT_MCP_CANDIDATES` sigue siendo el dueño del par de
  nombres de `opencode`. `doctor` conserva su fallback global y sus mensajes
  (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`,
  `⚠ opencode.json no encontrado (config MCP)`).
- `mergeMcp` conserva su semántica: recolecta **todos** los candidatos existentes y mergea en cada
  uno. `hostConfigHasCompression` conserva la suya: prueba todos los candidatos y considera presente
  `caveman` si alguna config parseable lo declara. La diferencia de selección es intencional.
- No se agrega parseo tolerante de JSONC: un `.jsonc` con comentarios sigue siendo no parseable.

### Avisos advisory de `check`

- **0.18.16 (histórico)**: `check` inspeccionaba **sólo** la config MCP del proyecto. Desde 0.19.0
  inspecciona los destinos declarados de todos los hosts instalados; ver “Ruteo MCP por host”. Sin
  config o con todas las entradas sanas, no emite avisos de estado MCP.
- Si el destino existe y no parsea, agrega un único aviso:
  `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP` (ruta relativa con `/`).
- Si parsea y `cfg[schema]` (o `cfg.mcp` en la lectura legacy) es un objeto plano, agrega un aviso
  por entrada rota: `MCP '<nombre>' tiene un comando roto (<detalle>)`. `<detalle>` es el primer
  elemento sólo cuando `command` es un arreglo y ese elemento es un string no vacío; en cualquier
  otra forma es `command ausente`.
- Si el mapa de servidores no es un objeto plano (string, arreglo, número o `null`), no hay avisos
  MCP y no se reporta error de parseo.
- Los avisos se suman al arreglo `warnings` existente y se imprimen como `  ⚠ <texto>`; no cambian el
  exit code (`missing > 0 ? 1 : 0`), no incrementan `missing`/`orphans`, no alteran el oráculo y no
  escriben archivos.
- **`caveman` roto**: produce su propio aviso, pero la compuerta de la nota de compresión sigue
  considerándolo presente (`hostConfigHasCompression` no consulta `mcpCommandBroken`).

### Aviso de `import` antes de reemplazar

- Si el destino MCP del host activo existe y no parsea, `repairProjectMcp` emite a `stderr`, antes de
  escribir, `ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP nueva`.
- El aviso se emite una vez por ejecución y aplica a `import` con bundle y a `import --repair`.
- La decisión de reemplazo **no** cambia: la config no parseable sigue siendo sobrescrita por la
  nueva y el exit code no cambia por el aviso. Una config parseable no produce el aviso; la
  reparación se limita a las entradas rotas y a las ausentes de `intendedNames`.

### Riesgos aceptados

- **Ruido advisory**: un binario de un servidor de usuario que no exista en esta máquina produce un
  aviso por entrada; no bloquea.
- **Alcance de la inspección (0.18.16, superado en 0.19.0)**: entonces `check` y `doctor` no veían la
  config global ni las configs MCP de otros hosts (`copilot-mcp.json`, `.mcp.json`,
  `.agents/mcp_config.json`). Desde 0.19.0 ven los destinos declarados de los hosts instalados;
  `check` sigue sin ver la config global.
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
  e `intendedNames` derivado de `manifest.mcp`. Desde 0.19.0 `repairProjectMcp` escribe el destino
  del host activo, por lo que la escritura pendiente cuenta para `opencode`, `antigravity`,
  `commandcode` o `copilot` según corresponda.
- **Alcance excluido**: H9 (`installedPaths` multi-host) y la rama global de `install` sin
  `--project` quedan fuera. La rama global copia `agents/**` verbatim y `check` no la evalúa. H3
  (escrituras MCP originadas por otro host) quedó resuelto por el descriptor de 0.19.0.
- **Excepción M2**: si la config MCP del host no es JSON parseable, `install`/`init` omiten esa
  escritura y avisan; la nota se materializa igual por la escritura pendiente y `check` puede
  divergir. `import <bundle>` reemplaza el destino del host activo (`repairProjectMcp`); desde
  0.18.16 emite un aviso por `stderr` antes de reemplazarlo, pero no cambia la decisión.
- **`import --repair` sin bundle**: no reescribe assets y, por lo tanto, **no sanea** una nota
  legada; solo `import <bundle>` la re-materializa.
- **Contrato de `check` intacto**: la divergencia de frontmatter sigue siendo advisory, la
  comparación sigue siendo del archivo completo y el exit sigue siendo `missing > 0 ? 1 : 0`.
- **Change archivado**: `aspec/changes/archive/2026-11-04-host-compression-note-consistency/`
  (proposal con enmiendas R1/R2, tasks y deltas). Decisiones aprobadas:
  `compression-note-gate`, `compression-note-active-host-scope`, `tier-applytest-overlay-guard`.

## Ruteo MCP por host (0.19.0)

Changes archivados: `aspec/changes/archive/2026-11-05-mcp-host-write-routing/` (descriptor y
ruteo de escritura) y `aspec/changes/archive/2026-11-05-mcp-oracle-residual-closure/` (texto y par
global derivado). Requirements canónicos en `aspec/specs/agent-install-routing/spec.md`,
`aspec/specs/cli-diagnostics/spec.md` y `aspec/specs/project-portability/spec.md`.

### Descriptor único de destino

- `HOST_MCP_TARGETS` (`src/cli/index.js`) declara `{ file, schema, merge }` por host:

  | Host | Archivo de proyecto | Esquema |
  |---|---|---|
  | `opencode` | `.opencode/opencode.json` o el `.jsonc` existente | `mcp` |
  | `antigravity` | `.agents/mcp_config.json` | `mcpServers` |
  | `commandcode` | `.mcp.json` | `mcpServers` |
  | `copilot` | `copilot-mcp.json` | `mcp` |
  | `claude`, `vscode`, `cursor`, `roo` | ninguno | — |

- `HOST_MCP_ORDER = ['opencode', 'antigravity', 'commandcode', 'copilot']` fija el orden
  determinista para diagnósticos. `hostMcpTarget`/`hostMcpProjectFile` resuelven el descriptor;
  `resolveHostMcpFile` respeta el par `json`/`jsonc` de `opencode` y
  `resolveHostMcpDestination` devuelve `{ host, file, schema }` o `null`.
- **Por qué un descriptor**: `src/cli/index.js` ya era dueño de `PROJECT_MCP_CANDIDATES`,
  `setupHostMcp` y los merges por host. Un mapa único evita literales de destino por comando y que
  un host nuevo herede `.opencode` por omisión. Decisión: `host-mcp-destination-descriptor`.

### Escritura y reparación

- `setupHostMcp(mcpMap, { projectDir, agent })` es el dueño único para `init`/`install`/`update`:
  sin proyecto conserva la rama global solo-opencode; con proyecto resuelve el host activo y llama
  al merge del descriptor. Un host sin destino no escribe archivo MCP, crea `.opencode` ni falla:
  emite como máximo un aviso por corrida (`warnNoMcpDestination`) y sigue.
- `import` e `import --repair` resuelven el destino del host activo y pasan `destination` a
  `repairProjectMcp`; un destino no parseable se avisa nombrando el archivo y se reemplaza (M2).
- Los merges son no destructivos e idempotentes: agregan nombres ausentes, no borran entradas ni
  archivos, y dos corridas dejan el mismo conjunto. Decisión: `host-mcp-import-routing`.
- La garantía se acota a alcance de proyecto, host activo y hosts con destino declarado. Quedan
  fuera la instalación global, el borrado de archivos preexistentes y la verificación independiente
  del consumo de `copilot-mcp.json` por Copilot (`host-mcp-write-guarantee-scope`).

### Diagnósticos host-aware

- `check` deriva los hosts instalados de `installedHostsFromPaths(rc.installedPaths)` (unión de
  destinos escritos, no un único `rc.agent`) y llama a `resolveExistingHostMcpDestinations` con
  `HOST_MCP_ORDER`. Para cada destino existente valida el JSON y avisa por entrada con
  `mcpCommandBroken`; `mcpServers` se normaliza con `normalizeHostMcpEntry`. Nunca mira la config
  global ni hosts sin destino, no escribe y no altera el exit code.
- `doctor` valida el primer destino existente entre el host activo y los hosts instalados; si no
  existe ninguno, cae al par global de `opencode` (`GLOBAL_MCP_CANDIDATES`, derivado por `basename`
  de `PROJECT_MCP_CANDIDATES`). Un archivo de proyecto inválido no cae al fallback. Los mensajes
  (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`, `⚠ opencode.json no encontrado (config MCP)`) y el
  exit code no cambian. Decisión: `mcp-oracle-host-aware-advisory`.

### Riesgos aceptados

- **Colisión `.mcp.json`**: `commandcode` escribe `.mcp.json`, un nombre que Claude también lee. Es
  preexistente y quedó explícitamente fuera (`mcp-json-collision-deferred`).
- **`.opencode` obsoleto en proyectos mixtos**: un archivo de una instalación previa se conserva y
  `check` lo sigue validando si `opencode` figura en `installedPaths`; no se borra ni se refresca
  desde un host distinto.
- **Sobrescritura M2**: `import` sigue reemplazando un destino ilegible sin backup; sólo agrega el
  aviso.
- **Copilot runtime no verificado**: el CLI declara `copilot-mcp.json` como destino, pero el
  consumo por Copilot no se verifica offline.

## Bundle host-neutral (0.20.0)

Change archivado: `aspec/changes/archive/2026-11-05-host-neutral-bundle/` (proposal, tasks y deltas
de `project-portability`, `agent-install-routing` y `cli-diagnostics`). El formato sigue siendo
`ancleto-export/1`; cambian la lectura de intención en `export` y el alcance de copia/registro en
`import`. Decisión principal: `bundle-mcp-intent-host-aware` y `bundle-asset-copy-host-scoped`.

### `export` lee la intención del host activo

- `readHostMcpIntent(projectDir, host)` (`src/cli/index.js`) resuelve el destino con
  `resolveHostMcpDestination` y devuelve `{ entries, file, error }`.
- Host con destino: si el archivo no existe, `entries = []` sin aviso; si existe y parsea, toma
  `cfg[schema]`; si existe y no parsea, `entries = []` y `error`. `export` convierte las entradas a
  `[{ name, type: def?.type || 'local', enabled: def?.enabled !== false }]`.
- Host sin destino (`claude`, `vscode`, `cursor`, `roo`): conserva la lectura legacy de
  `readProjectMcp` (`.opencode/opencode.json|jsonc`), con el mismo aviso si no parsea.
- Si `readHostMcpIntent` devuelve `error`, `export` emite una sola vez por `stderr`
  `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`, deja `manifest.mcp = []` y
  sale con 0. `manifest.flags.engram` se deriva de esa intención.
- No cambian el guard de rutas absolutas, la forma del manifiesto, el payload de assets ni `--tar`.
  Decisión: `bundle-layout-remains-v1`.

### `import` acota la copia de `.opencode` al host activo

- El host activo se resuelve igual que antes: `.ancletorc.agent` del bundle → `.ancletorc.agent`
  existente → default.
- Si el host activo es `opencode`, se copian `.opencode/{agents,commands,skills}` del bundle y se
  registran como `.opencode/<dir>`; si no, no se copian ni se registran y los assets se materializan
  sólo por `installAgentAssets`.
- `installedPaths` sigue siendo la unión de lo ya declarado, los templates escritos y los assets
  escritos (`unionInstalledPaths`); nunca se heredan rutas del bundle y no se borran rutas previas.
- Tier, estado `.opencode/.ancleto-tier`, reparación MCP, mensajes y exit codes no cambian; el tier
  sigue aplicándose sólo a `opencode` (`bundle-tier-state-unchanged`).

### Exclusiones y deuda declarada

- Colisión `.mcp.json` entre `commandcode` y `claude`.
- Idempotencia del refresco de `opencode`/`antigravity` en `upgrade`.
- Consumo runtime de `copilot-mcp.json` por Copilot (no verificable offline).
- Estado de tier sin cambios (`bundle-tier-state-unchanged`).
- Portabilidad de assets custom más allá de los canónicos (se regeneran).
- Escaneo de secretos o rutas absolutas del contenido del bundle más allá del manifiesto.

## Reparación MCP sin escritura (0.20.1)

Change archivado: `aspec/changes/archive/2026-11-06-fix-repair-mcp-noop/` (proposal, tasks y delta de
`project-portability`). Cierra el defecto de deuda de 0.20.0 sin cambiar mensajes ni exit codes.

- **Predicado de escritura único**: `repairProjectMcp` (`src/cli/index.js`) escribe el destino del
  host activo sólo si `error || normalized || fixed.length > 0`: el archivo no es JSON parseable, la
  estructura requiere normalización (raíz no-objeto o clave de esquema presente con valor
  no-objeto), o hay al menos una entrada reparada/agregada. `mkdir` vive dentro de esa rama.
- **Destino sano intacto**: un destino con todas las entradas sanas ya no se reescribe; bytes y mtime
  quedan idénticos y el mensaje `MCP sanos ... sin cambios` describe lo efectivamente hecho.
- **Destino inexistente**: sin entradas que reparar o agregar no se crea el archivo ni su directorio;
  se eliminó `!existed` como motivo de escritura.
- **Alcance acotado**: la garantía aplica a `import`/`import --repair` (`repairProjectMcp`).
  `install`/`init` (`setupHostMcp` → `mergeMcp`) y `upgrade` (`refreshCopilotMcp`/
  `refreshCommandCodeMcp`) reescriben el mismo destino y quedan fuera. Decisiones:
  `repair-mcp-write-predicate` y `repair-mcp-guarantee-scope`.
- **Preservado**: reemplazo de JSON no parseable con su aviso, reparación de entradas rotas,
  adición de nombres intencionados y normalización de raíz no-objeto. Un `.jsonc` con comentarios
  sigue sin parsear (`jsonc-comments-not-supported`).

## Conformidad sin delta (0.21.0)

Change archivado: `aspec/changes/archive/2026-11-06-p0-pr5-archive-conformity/` (proposal, tasks y
delta de `prompt-contracts`). La versión **no modifica `src/`**: el contrato vive en
`aspec/specs/prompt-contracts/spec.md`, `agents/*.md` y `skills/*`; la aceptación es textual
(skills/agents + content guards), porque no existe un subcomando CLI `archive`.

### Discriminador conformidad vs cambio funcional

- Un change es **de conformidad** si y sólo si: (i) su `proposal.md` cita un
  `spec:<capability>#<requirement>` que resuelve contra `aspec/specs/<capability>/spec.md`
  (capability y título exacto del Requirement existen), **y** (ii) su `specs/` no contiene bloques
  `ADDED/MODIFIED/REMOVED/RENAMED Requirements`.
- La **ausencia de `specs/` por sí sola no prueba conformidad**: sin delta y sin cita resoluble el
  change no es de conformidad; se agrega el delta o se agrega/corrige la cita y la situación se
  reporta como error explícito, nunca como archive silencioso.
- Si la spec vigente falta o contradice el comportamiento esperado, el delta es obligatorio
  (`spec-required`); el change no se presenta como conformidad.
- El camino de conformidad también es alcanzable abriendo un change formal con `proposal.md` breve y
  sin `specs/`.

### Archive de conformidad (no-op sobre specs)

- Al archivar un change de conformidad, el archive informa explícitamente **"sin delta"** nombrando
  el `spec:<capability>#<requirement>` citado, y completa normalmente el move del directorio y la
  promoción de decisiones aprobadas.
- Antes de archivar, la cita se valida **fail-closed**: una cita que no resuelve se rechaza con
  reporte explícito y no se escribe en `aspec/specs/**/*.md`.
- La resolubilidad **no es suficiente**: la cita debe ser además **relevante** —el Requirement y sus
  escenarios deben describir el comportamiento que el change restaura—. La relevancia es un juicio
  semántico; la compuerta mecánica sólo prueba resolubilidad y ausencia de bloques delta.
  `@reviewer` reporta la falta de relevancia como hallazgo `CRITICAL`.
- La garantía se enuncia acotada exactamente así: **"Change Archive de un change de conformidad: no
  modifica `aspec/specs/**/*.md`."** Se usa "no modifica", nunca "no toca", y quedan fuera de la
  garantía `ancleto-sync-specs`, `@documenter` en Standalone Source-of-Truth Update,
  `ancleto-bulk-archive`, la rama "Sync now" con delta, "Archive without syncing", el move a
  `aspec/changes/archive/`, el commit de archive de `@coder`, la promoción a `.ancleto/memory.db`/
  `working-context`, el chequeo de frescura del seed y todas las lecturas (`ancleto specs check`,
  resolución fail-closed de `spec:`).
- El archive **no agrega un segundo gate de verificación**: reusa el ledger cerrado del orquestador
  y no contradice "Don't block archiving on warnings".

### Ruteo alineado

- `agents/orchestrator.md` es el **dueño único de la norma de ruteo**; `skills/triage-clarifier`
  la implementa y coincide literalmente en categorías (`direct-test-only`,
  `direct-implementation`, `spec-required`; `clarification-needed` sólo como pre-estado), regla de
  una sola pregunta, "ambigüedad persistente ⇒ `spec-required`" con aviso explícito, clarificación
  insuficiente (sólo ubicación/ownership/superficie), confirmación explícita del camino directo y la
  cláusula de conformidad.
- `skills/ancleto-workflow` y `skills/ancleto-continue` dejan de tratar la ausencia de `specs/` como
  artifact faltante por sí sola: distinguen conformidad con cita resoluble (no crear delta) de
  cambio funcional sin delta (crear delta).
- `@spec-writer` no genera `specs/` para conformidad (sí `proposal.md` con la cita); `@documenter`
  condiciona `specs check` y el merge a la existencia de deltas; `@coder`, `@tester` y `@reviewer`
  contemplan el change sin delta (el reviewer verifica cita resoluble y que el diff no toque
  `aspec/specs/`).
- Los mirrors `.opencode/**` no se editan a mano: se regeneran con `ancleto upgrade`.

### Decisiones promovidas (memoria del repo)

- **`archive-conformity-discriminator`** — “un change es de conformidad si y sólo si (i) su
  `proposal.md` cita un `spec:<capability>#<requirement>` que resuelve ... y (ii) su `specs/` no
  contiene bloques `ADDED/MODIFIED/REMOVED/RENAMED Requirements`. La ausencia de `specs/` por sí
  sola no prueba conformidad: sin delta y sin cita resoluble es un error explícito, nunca un archive
  silencioso; si la spec falta o contradice, el delta es obligatorio.” **Justificación:** el
  predicado mecánico prueba resolubilidad y ausencia de delta; la relevancia semántica es juicio de
  review. Descartado: exigir siempre un delta aun con spec inequívoca (evita reescribir requisitos
  sin cambio de contrato). Refs: `spec:prompt-contracts#Clasificación de conformidad frente a cambio
  funcional`, `change:p0-pr5-archive-conformity`.
- **`archive-noop-does-not-write-canonical-specs`** — “Change Archive de un change de conformidad:
  no modifica `aspec/specs/**/*.md`”, usando "no modifica" y nunca "no toca", con la lista explícita
  de exclusiones (otros escritores, move, commit, promoción, frescura y lecturas). **Justificación:**
  "no toca" incluiría lecturas y, sin exclusiones, la garantía sería falsa en cuanto el mismo estado
  pasara por `ancleto-sync-specs`, `@documenter` o `ancleto-bulk-archive`. Refs:
  `spec:prompt-contracts#Archive de un change de conformidad sin delta`,
  `change:p0-pr5-archive-conformity`.
- **`conformity-verification-reuses-closed-ledger`** — la mitad "sin verificación" del guard reusa
  el contrato vigente: el ledger cerrado sigue siendo responsabilidad del orquestador y
  `skills/ancleto-archive/SKILL.md` no agrega un gate propio. **Justificación:** un gate duplicado
  contradice "Don't block archiving on warnings" y crea dos fuentes de verdad para el mismo
  predicado. Refs: `spec:prompt-contracts#Archive de un change de conformidad sin delta`,
  `change:p0-pr5-archive-conformity`.
- **`triage-routing-single-contract`** — `agents/orchestrator.md` es dueño de la norma y
  `skills/triage-clarifier/SKILL.md` la implementa con vocabulario literal; `ancleto-workflow` y
  `ancleto-continue` distinguen conformidad con cita resoluble de cambio funcional sin delta.
  **Justificación:** una sola norma evita que las superficies deriven; antes ambas skills convertían
  un change de conformidad en la creación de un delta. Refs:
  `spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional`,
  `change:p0-pr5-archive-conformity`.

### Riesgos aceptados

- **Aceptación no ejecutable**: no hay subcomando `archive`; los guards fijan los predicados de texto
  y cada invariante se prueba con mutación (`assertMutationBreaks`). No se declara un test ejecutable
  de archive.
- **Relevancia semántica**: la resolubilidad mecánica de la cita no prueba que el Requirement
  describa el comportamiento; queda como juicio de review (`CRITICAL` si falta).
- **Garantía acotada**: no cubre a los demás escritores del mismo estado ni las lecturas; enunciarla
  globalmente sería falso.
- **Divergencia de mirrors**: editar sólo `agents/`/`skills/` y regenerar con `ancleto upgrade`; no
  tocar `.opencode/**` a mano.
- **MEM-01 fuera de alcance**: el runbook de curaduría sobre `.ancleto/memory.db` no se ejecuta en
  este change (requiere OK explícito).

## Merge determinístico de specs (0.22.0–0.22.1)

Changes archivados: `aspec/changes/archive/2026-11-06-ch-06a-specs-merge-deterministic/` (0.22.0,
proposal, tasks y delta de `spec-sync`) y
`aspec/changes/archive/2026-11-06-specs-merge-hardening/` (0.22.1, dos `MODIFIED` sobre la misma
capability). La capability canónica resultante es `aspec/specs/spec-sync/spec.md`, con cinco
Requirements: merge determinístico, idempotencia, fail-closed, dry-run y alcance acotado. 0.22.1 no
agrega comandos ni flags; endurece el parser y el fail-closed. En 0.26.4 la capability suma un
Requirement que ancla la validación estructural de los deltas de changes activos a la suite
declarada, reutilizando `parseDeltaSpec`.

### Módulo puro y separación de capas

- `src/core/specs-merge.js` es el **dueño único** del parseo y del plan: exporta
  `parseCanonicalSpec`, `parseDeltaSpec` y `mergeSpecText`. No toca disco, no ejecuta procesos y no
  hace red.
- `src/cli/index.js` → `specsMergeCommand` resuelve rutas, lee los archivos, escribe el resultado y
  emite la salida humana o `--json`. `specsCommand` sólo desvía el token `merge`; `specs check` y
  `specs` sin argumentos conservan su comportamiento y exit codes.
- El comando **no** se cableó en `skills/ancleto-sync-specs`, `skills/ancleto-archive` ni en los
  comandos `/cleto-*`: el proposal original lo dejó fuera de alcance. La superficie disponible hoy
  es la CLI.

### Matching y operaciones

- Cada operación se aplica por **título exacto** del heading `### Requirement:`; no hay matching
  difuso ni por posición. Un título que coincide con 0 o ≥2 requirements es fail-closed.
- El parser reconoce las secciones `## ADDED Requirements`, `## MODIFIED Requirements`,
  `## REMOVED Requirements` y `## RENAMED Requirements`; un bloque de requirement termina en el
  próximo `##` o `###` (un `#### Scenario:` no corta el bloque). El delta admite **a lo sumo un**
  H1 a columna 0 al inicio, cualquiera sea su título, seguido de blancos opcionales y de la primera
  sección `##` reconocida; no hay allowlist literal de títulos. Un segundo H1, o cualquier línea no
  vacía que no sea H1 antes de esa sección, es fail-closed (preserva las cuatro formas H1 legacy de
  los archives).
- `ADDED` inserta el bloque dentro de `## Requirements` con **exactamente una línea en blanco**
  entre el bloque y la siguiente sección `##` (o el EOF, sin blanco extra); si el título ya existe
  con contenido idéntico es no-op y con contenido distinto es fail-closed. `MODIFIED` reemplaza el
  bloque completo (cuerpo y escenarios). `REMOVED` elimina el bloque y es no-op si ya no existe.
  `RENAMED` cambia sólo el heading de `FROM` a `TO`; es no-op si el título nuevo ya existe y
  fail-closed si están ambos o ninguno. Una sección `## RENAMED Requirements` vacía es no-op válido
  (exit 0, `changed:false`, `mtime` intacto).
- La serialización conserva el separador de línea dominante del archivo canónico (CRLF solo si
  supera estrictamente a los LF sueltos) y recorta líneas en blanco finales: dos corridas del mismo
  delta producen un archivo byte a byte idéntico.

### Fail-closed, atomicidad y dry-run

- La garantía de cero escrituras es **por plan**: se computan todos los planes de todas las
  capabilities antes de escribir. Ante cualquier error —título ambiguo, `MODIFIED`/`RENAMED`
  incompleto, `ADDED` conflictivo, `RENAMED` con ambos/ninguno, `FROM`/`TO` faltante,   capability sin
  spec canónico, 0 o ≥2 changes para el slug, bloque malformado o el contenedor
  `aspec/changes/archive`— el comando sale con **exit 2** y no escribe ningún spec del change; el
  mensaje nombra capability, requirement y motivo. El contenedor `archive` se detecta por identidad
  de path, no por la presencia de `proposal.md` ni por el slug, y también falla con `--dry-run`.
- **Atomicidad acotada**: el plan es fail-closed con cero escrituras; la fase de escritura es
  secuencial y no transaccional. Un error de I/O o una interrupción durante esa fase puede dejar
  escritos un prefijo de los specs del plan, sin rollback ni atomicidad entre archivos. La spec
  declara esta exclusión y no promete una garantía mayor.
- `--dry-run` computa y reporta el mismo plan con cero escrituras (contenido y `mtime` intactos) y
  usa los mismos códigos que la ejecución real. Un plan sin cambios no escribe. `--json` emite
  `{ ok, change, dryRun, capabilities, operations, changed, errors }`.
- **Alcance**: sólo se escriben `aspec/specs/<capability>/spec.md` de capabilities que ya existen y
  están presentes en el delta. No se crean capabilities nuevas, no se tocan los archivos delta, la
  carpeta del change, la memoria, el seed, `package.json`, `specs check`, `mergeLocked` ni el
  affected-set.

### Decisiones declaradas en el proposal

- **`specs-merge-structural-by-exact-title`** — matching por título exacto y `MODIFIED` reescribe el
  bloque completo. Descartado: similitud o posición. Ref:
  `spec:spec-sync#Merge determinístico de delta specs sobre specs canónicos existentes`.
- **`specs-merge-fail-closed-no-partial-write`** — plan de todas las capabilities y cero escrituras
  si cualquiera falla. Descartado: escribir capability por capability. Ref:
  `spec:spec-sync#Fail-closed ante ambigüedad o delta inválido`.
- **`specs-merge-existing-capabilities-only`** — el destino debe existir; no se infiere el purpose de
  una capability nueva. Ref: `spec:spec-sync#Alcance acotado del comando specs merge`.
- **`specs-merge-dry-run-zero-writes`** — `--dry-run` sin archivos temporales ni journal. Ref:
  `spec:spec-sync#Dry-run sin escrituras en specs merge`.
- **`specs-merge-h1-structural-preamble`** (0.22.1) — a lo sumo un H1 a columna 0 al inicio,
  cualquier título; un segundo H1 o contenido suelto antes de la primera sección falla cerrado.
  Descartado: allowlist literal de `# Delta:` / `# Spec delta:` (rompería 78 deltas legacy). Ref:
  `spec:spec-sync#Merge determinístico de delta specs sobre specs canónicos existentes`.
- **`specs-merge-archive-container-fail-closed`** (0.22.1) — `--change archive`, o cualquier slug
  que resuelva al contenedor, sale 2 con cero escrituras; detección por identidad de path.
  Descartado: detectar por `proposal.md` o por nombre. Ref:
  `spec:spec-sync#Fail-closed ante ambigüedad o delta inválido`.
- **`specs-merge-added-single-blank-line`** (0.22.1) — `ADDED` deja exactamente una línea en blanco
  entre el bloque y la sección siguiente o el EOF. Ref:
  `spec:spec-sync#Merge determinístico de delta specs sobre specs canónicos existentes`.
- **`specs-merge-write-phase-atomicity-exclusion`** (0.22.1) — la atomicidad se limita al plan; la
  fase de escritura es secuencial y no transaccional, declarada como exclusión explícita. Ref:
  `spec:spec-sync#Fail-closed ante ambigüedad o delta inválido`.

### Riesgos aceptados

- **Dependencia del formato canónico**: el merge exige los headings literales en inglés
  (`### Requirement:`, `## ADDED|MODIFIED|REMOVED|RENAMED Requirements`). `ancleto specs check`
  detecta specs traducidos o con `####` ajenos a `Scenario`; un spec no canónico puede fallar el
  merge o quedar fuera de cobertura.
- **Sin cableado en skills**: el flujo agent-driven de `ancleto-sync-specs` y del archive no invoca
  el comando automáticamente; un operador o agente debe ejecutarlo de forma explícita.
- **Atomicidad acotada**: el plan es atómico, pero la fase de escritura por archivo no rollbackea
  una falla de I/O intermedia.
- **Sin test observado en esta generación**: `test/specs-merge.test.js` existe en el repo, pero el
  pack del tier `minimo` excluye `test/**` y no se ejecutó la suite (ver `unknowns.md`).

## Orden del archive y promoción de memoria (0.22.1)

Change archivado: `aspec/changes/archive/2026-11-06-archive-order-correctness/`. La capability
canónica es `aspec/specs/memory-ops/spec.md`, requirement “Promoción al archivar sólo de decisiones
duraderas aprobadas”. No cambia el motor de memoria ni `src/`: el contrato vive en las superficies
de agentes y skills.

### Secuencia canónica

1. **Merge/sync de specs** si hay delta (fase A de `@documenter`).
2. **Preflight read-only** del lote de `## Decisiones` aprobadas, fail-closed.
3. **Promoción** de las decisiones aprobadas a `.ancleto/memory.db`.
4. **Move** del directorio a `aspec/changes/archive/YYYY-MM-DD-<slug>/`, sin modificarlo (fase B).
5. **Summary/commit**.

La promoción corre **después del merge y antes del move**, para que las refs `path:` que apuntan
dentro del change sigan resolviendo. `@documenter` separa fase A (sólo merge, retorna `phase A
complete`) y fase B (sólo move, invocada tras confirmar la promoción). `@orchestrator` corre
Automatic Record en paralelo con la fase A; la promoción nunca se ejecuta en paralelo con la fase A
ni después del move. La secuencia se replica en `skills/ancleto-archive/SKILL.md`,
`skills/ancleto-bulk-archive/SKILL.md` y la Phase 9 de `skills/ancleto-onboard/SKILL.md`.

### Semántica de fallo

- **Preflight o promoción fallidos antes del move**: el change **no se mueve**, no queda ninguna
  escritura por violación del gate y se reporta **`no archivado; memoria pendiente`** (inglés:
  `not archived; memory pending`), nombrando la `memory_key` y el motivo con reintento.
- **Move fallido tras una promoción exitosa**: se reporta **`memoria promovida; NO archivado`**
  (inglés: `memory promoted; NOT archived`) con reintento.
- El literal **`archivado, memoria pendiente`** queda eliminado: presume move-before-promote y ya
  no describe la secuencia. Tampoco se reporta "archivado y memorizado" si sólo se archivó.
- Un lote con clave repetida y contenido/refs distintos se rechaza completo; dos claves
  contradictorias se reportan con sus fuentes y se remiten a decisión humana o a `memory merge`.

### Decisiones declaradas

- **`archive-order-promote-before-move`** — secuencia merge/sync → preflight → promoción → move →
  commit; promoción antes del move y fallos con los dos literales canónicos. Ref:
  `spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas`.
- **`archive-order-content-guard`** — `test/content-guards.test.js` compara el índice textual de
  promoción y move en ambas skills; una mutación que invierte el orden debe fallar.
- **`archive-order-canonical-agent-surface`** — el orden se codifica en `agents/orchestrator.md`,
  `agents/documenter.md`, `skills/ancleto-archive`, `skills/ancleto-bulk-archive` y
  `skills/ancleto-onboard`; la release regenera mirrors con `ancleto upgrade`.

## Idempotencia de escritura, bundle legacy y EOL de templates (0.23.0)

Changes archivados: `2026-11-07-memory-record-idempotency`, `2026-11-07-portability-legacy-bundle-advisory`
y `2026-11-07-template-legacy-eol-preservation`. Son cambios acotados de comportamiento; no agregan
comandos, flags ni dependencias.

### `recordNode` no-op ante reescritura idéntica

- La identidad es la tupla `(type, scope, content, justification)` contra el nodo **activo** de la
  misma `memory_key`; `createdAt`, `source` y `confidence` quedan fuera.
- Igualdad exacta: cero inserciones, cero supersesiones, `superseded: 0` y retorno de los valores
  persistidos con el `created_at` original. Cualquier diferencia supersede e inserta un UUID nuevo.
- La validación de refs y secretos corre antes de la comprobación de identidad. `importNodes` no
  cambia (last-writer-wins por `createdAt`). Requerimiento:
  `spec:memory-engine#Idempotencia de reescritura idéntica en recordNode`.

### Bundle legacy sin `manifest.mcp`

- `manifest.mcp === undefined` emite un aviso no bloqueante por `stderr`; el exit code y lo escrito
  no cambian. `manifest.mcp: []` es silencio; un valor no-array sigue fallando con exit 1.
- Requerimiento: `spec:project-portability#Aviso de bundle legacy sin intención MCP en el import`.

### `reconcileLegacyBlocks` y EOL

- Al eliminar un run legacy, cada línea superviviente conserva su EOL original y la salida conserva
  el estado de newline final de la entrada; sin eliminación, el contenido se devuelve byte a byte.
- La semántica de qué líneas forman el run no cambia. Requerimiento:
  `spec:prompt-contracts#Preservación del fin de línea por línea al reconciliar bloques legacy`.

## Tier `minimo` y guard canónico (0.24.0)

Changes archivados: `2026-11-08-agent-model-minimo-migration` y
`2026-11-08-specs-merge-canonical-guard`. El primero es minor-class (cambia el modelo observable de
un tier); el segundo es patch-class (vuelve fail-closed un estado que el merge ya debía rechazar).

### `minimo` alineado a la canónica

- La canónica `agents/*.md` (y `opencode.json`) declara `opencode-go/deepseek-v4.1-flash` para los
  diez agentes desde el commit `9e45105`. La tabla derivada `TIERS.minimo[agente]` y la cabeza de
  `TIER_CHAINS.minimo[agente]` se alinearon al mismo ID; la cadena queda
  `opencode-go/deepseek-v4.1-flash` → `opencode/deepseek-v4.1-flash-free`.
- `MINIMO_CHAIN` retira `commandcode/deepseek/deepseek-v4.1-flash`: el proveedor dejó de usarse y
  conservarlo habría permitido instalar un modelo que la canónica nunca publica.
- La invariante es `TIERS.minimo[agente] === model: de agents/<agente>.md === cabeza de
  TIER_CHAINS.minimo[agente]`, cubierta por `test/agent-model-coherence.test.js` y el guard de la
  spec. La forma de `TIERS` no cambia; `resolveTierModels`, `applyTier` y `check` conservan su firma.
- `install`/`init`/`import --tier minimo` sobre `opencode` escriben el modelo canónico; si ningún
  candidato está en el catálogo, el error explícito nombra al agente y la cadena completa.
- Decisiones: `tier-minimo-opencode-go-alignment` (alinear la tabla derivada, no inventar IDs) y
  `agent-model-migration-source-of-truth` (la canónica manda; la tabla la sigue).

### Guard de heading de delta en la spec canónica

- `mergeSpecText(deltaText, canonicalText)` valida la canónica **antes** de parsear el delta:
  `findDeltaSectionHeadings` detecta `## ADDED Requirements`, `## MODIFIED Requirements`,
  `## REMOVED Requirements` o `## RENAMED Requirements` en columna 0 (misma semántica que el parser
  de delta, espacios finales tolerados; sin rastreo de code fences).
- Al detectarlo, devuelve el texto original intacto y errores que nombran el heading ofensor; el CLI
  agrega la capability y sale con exit 2 con cero escrituras en todo el lote, para los **cuatro**
  tipos de operación, no sólo `ADDED`. `--dry-run` produce el mismo exit 2 y tampoco escribe; `--json`
  reutiliza `ok:false`/`errors:[...]` sin campos nuevos.
- El guard es **canónica-only**: los delta specs bajo `aspec/changes/**/specs/**` conservan esos
  headings como sintaxis legítima. El merge rechaza la canónica; no la repara ni la reescribe.
- Reparación de higiene del repositorio: `aspec/specs/copilot-support/spec.md`,
  `aspec/specs/legacy-import/spec.md` y `aspec/specs/test-profile/spec.md` normalizaron su heading a
  `## Requirements`; `test/content-guards.test.js` impide que vuelva a aparecer un heading de delta
  en `aspec/specs/**`.
- Decisiones: `specs-merge-canonical-heading-fail-closed` (rechazar, no auto-normalizar) y
  `specs-merge-canonical-guard-canonical-scope` (sólo canónicas). El change también registró
  `repair-mcp-noop-already-shipped` como NO-OP: el predicado de no-escritura de `repairProjectMcp`
  ya estaba implementado y no se reabre.

## Archive ruteado y ayuda sin ejecución (0.25.0)

Changes archivados: `2026-11-08-archive-sync-via-specs-merge` (delta de `prompt-contracts`) y
`2026-11-08-cli-subcommand-help-guards` (delta de `cli-diagnostics`). Ambos son patch-class: no
agregan comandos ni flags y no cambian el formato de ningún artefacto.

### Sync de delta al archivar ruteado por `specs merge`

- El requirement “Sync de delta al archivar ruteado por specs merge” de
  `aspec/specs/prompt-contracts/spec.md` fija que, durante `Archive` y Change Archive, la única vía
  de escritura sobre `aspec/specs/<capability>/spec.md` es `ancleto specs merge --change <slug>`.
  Nunca se edita la canónica a mano ni se aplican `ADDED`/`MODIFIED`/`REMOVED`/`RENAMED`.
- `skills/ancleto-archive` y `skills/ancleto-bulk-archive` invocan el comando (una vez por change en
  bulk, en el orden determinado); `agents/documenter.md` delega el sync en la fase A. Un exit code
  distinto de 0 —en particular 2 por fail-closed— **aborta** el archive de ese change: no hay
  preflight, ni promoción, ni move.
- Si el CLI no está disponible, el archive se detiene y reporta el bloqueo; no hay fallback de
  edición manual.
- Un change de conformidad (sin bloque de delta) no invoca `specs merge`. La skill standalone
  `skills/ancleto-sync-specs` y el modo Standalone del documenter no cambian.
- Riesgo: el guard canónico de 0.24.0 ahora también cubre el camino de archive; una canónica con
  heading de sección de delta bloquea el archive completo en vez de dejar una escritura parcial.

### `--help`/`-h` en subcomandos que mutan estado

- El requirement “Manejo de `--help` sin ejecución en subcomandos que mutan estado” de
  `aspec/specs/cli-diagnostics/spec.md` cubre `install`, `update`, `upgrade`, `init`, `memory`
  (incl. subcomandos), `import`, `export`, `mcp`, `specs` a secas, `specs merge`, `projects`
  (incl. subcomandos) y el alias `list --projects`.
- El guard es central en el dispatch (`SUBCOMMAND_HELP` + `wantsHelp`, `src/cli/index.js`): imprime
  el uso en **stdout**, sale con **exit 0** y no ejecuta el comando, sin escribir `.ancletorc` ni
  `.opencode/**`. `-h` es equivalente a `--help` en todo el conjunto.
- `discovery --help` conserva su handler y su texto; la ayuda global (`ancleto --help`, `-h` o sin
  argumentos) conserva `HELP`. `check`, `doctor`, `stats`, `affected`, `list --help` y
  `specs check --help` quedan fuera del guard, igual que las invocaciones sin flag, cuyo parseo,
  errores y exit codes no cambian.

## Superficies del `model:` (nota operativa)

`AGENTS.md` describe tres superficies: `agents/*.md` (canónica publicada), `.opencode/agents/*.md`
(mirror que regenera `ancleto upgrade`) y `~/.config/opencode/agents/*.md` (instalación global).
`opencode.json` → `agent.<nombre>.model` aplica al agente primario, no a los subagentes. El default
publicado de los agentes es `opencode-go/deepseek-v4.1-flash`; el tier que aplica `install`
sin `--tier` es `normal`.

## Memoria persistente

- **Ubicación**: `.ancleto/memory.db` (SQLite + FTS5). No sale del repositorio.
- **Identidad**: `memory_key` es la clave transversal; el `recordNode` supersede sin filtrar por
  `type`/`scope` cuando el payload difiere. Desde 0.23.0, reescribir la misma `memory_key` con
  `(type, scope, content, justification)` exactamente iguales es un no-op (`superseded: 0`, sin nodo
  nuevo, devuelve los valores persistidos incluido el `created_at` original); `createdAt`, `source`
  y `confidence` no forman parte de la identidad.
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
- **0.21.0**: el archive de conformidad promovió cuatro decisiones a `.ancleto/memory.db`
  (`archive-conformity-discriminator`, `archive-noop-does-not-write-canonical-specs`,
  `conformity-verification-reuses-closed-ledger`, `triage-routing-single-contract`); el motor no
  cambió.
- **0.22.0–0.22.1**: tampoco cambian el motor. `specs merge` no abre ni escribe
  `.ancleto/memory.db`; la promoción de decisiones sigue siendo responsabilidad del archive pero,
  desde 0.22.1, ocurre **antes del move** y su secuencia vive en `agents/` y `skills/`, no en el
  engine. La promoción sólo admite `decision` con `memory_key` propia y `Estado: aprobado`; nunca
  promueve `rule` ni inventa claves.

## Discovery y seed

- **Estado del seed**: `READY` si el hash de fuentes coincide con `.discovery-state.json`; `STALE`
  con `impact: material|minor`; `PARTIAL`/`MISSING` por documentos faltantes.
- **Área**: directorio de primer nivel; los archivos raíz son su propia área. `seed-map.json` mapea
  documento → áreas y permite calcular `affectedDocs`.
- **`seedMapPresent` (0.26.0)**: se calcula antes de clasificar el estado, así que un
  `seed-map.json` con `docs` objeto plano reporta `true` también en `READY`, `PARTIAL` y `MISSING`;
  `readSeedMap` rechaza un `docs` que no sea objeto plano (arreglo o `null`). `affectedDocs` sigue
  dependiendo de `changedAreas` y sólo se puebla en `STALE`.
- **Materialidad**: `package.json`, `tsconfig*`, configs de bundlers, `Dockerfile`, `index.html`,
  `src/(main|index).*` y la aparición/desaparición de áreas raíz fuerzan `impact: material`.
  Excepción 0.27.0: el valor de `version` de primer nivel del `package.json` raíz no cuenta como
  cambio material ni de contenido; `dependencies`, `scripts`, `engines`, indentación, orden de claves
  o una `version` anidada siguen siendo materiales. Excepción 0.28.0: `.ancleto`, cualquier ruta
  bajo `.ancleto/` y el `.discovery-map.json` raíz son efímeras; un filtro simétrico de lectura las
  excluye de `changedAreas` y `materialReasons` y sólo excusa un desvío de hash si hay al menos una
  ruta cambiada y todas son efímeras. Excepción 0.29.0: `documentation`/`documentation/**` y
  `audit logs`/`audit logs/**`, anclados a la raíz, también son efímeras (gitignored, 0 tracked); el
  estado las conserva en `sources`/`fileHashes` (674+18 entradas) y no producen áreas ni
  materialidad. `docs/**` y `aspec/**` siguen contando. El writer y la forma del estado no cambian.
- **Exclusiones**: `node_modules`, `.git`, `dist` siempre (`DEFAULT_IGNORES`); el `outputDir` del
  seed se excluye del hash. Los globs de `discovery.exclude` se evalúan en `computeSources` con
  `matchesGlob`; desde 0.30.0 lo hacen por segmentos. El tier `minimo` agrega `test/**`, `docs/**` y
  `**/*.md` al cuerpo del pack.
- **Presupuesto**: `gratis` limita a 50.000 tokens; `normal`/`minimo` sin presupuesto fijo. El pack
  que excede el budget aborta.
- **Pack actual**: tier `minimo`, 854 fuentes, ~39.428 tokens (comprimido). El
  `.discovery-map.json` regenerado reporta 885 archivos (aspec 313, `.opencode` 66, docs 21,
  test 28, src 20, documentation 340, audit logs 9, etc.). 0.27.0 normaliza el bump de versión para
  el hash semántico y amplía el guard de la suite declarada para detectar `spec.md` mal ubicados
  bajo changes activos; 0.28.0 agrega el filtro de rutas efímeras en `checkDiscovery` sin cambiar el
  writer ni `ruleVersion`; 0.29.0 extiende ese filtro a `documentation/**` y `audit logs/**`
  anclados a la raíz; 0.30.0 corrige el matcher de `discovery.exclude`, también sin cambiar el
  writer ni `ruleVersion`.

### Contrato del detector de frescura (0.26.1, reglas 0.27.0–0.29.0)

Change archivado base: `aspec/changes/archive/2026-11-10-spec-seed-freshness-detector/` (delta
`ADDED` de `cli-diagnostics`). Un cambio futuro en `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`,
`isMaterialFile`, `areaOf`, `computeImpact` o en el predicado de rutas efímeras es comportamiento:
exige un delta `MODIFIED` y un release minor, no un patch documental. Desde 0.27.0 el estado declara
la regla de hash con `ruleVersion: 2` + `semantic`, de modo que un cambio de regla no reinterpreta
los estados ya persistidos: los estados sin `ruleVersion` conservan la comparación cruda. Desde
0.28.0 la pertenencia de rutas efímeras es una decisión de lectura aplicada a ambas vistas de
`sources`, sin cambiar el writer ni `ruleVersion`. Desde 0.29.0 la misma decisión de lectura cubre
`documentation/**` y `audit logs/**` anclados a la raíz, sin cambios de writer, forma del estado ni
configuración.

- **Salida**: `schemaVersion: 2`, JSON, exit 0 al completar y **read-only** (no escribe seed,
  estado ni `seed-map.json`). `impact` ∈ {`none`, `minor`, `material`} con precedencia
  `material` (si `materialReasons` no está vacío) > `minor` (si `changedAreas` o `notes` no están
  vacíos) > `none`; `recommendedAction` es `regenerate` para `material`, `continue` para `minor` o
  `none`, y `generate`/`complete` cuando el estado es `MISSING`/`PARTIAL` (excepción a la regla
  anterior, documentada y pineada en `cli-diagnostics`).
- **Archivos materiales (lista cerrada)**: `package.json` **sólo en la raíz**; `tsconfig.json`,
  `tsconfig.<sufijo>.json` y `jsconfig.json`; configs de
  `vite|webpack|rollup|next|nuxt|astro|svelte|tailwind`; `docker-compose.yml|yaml`; `Dockerfile`;
  `index.html`; `src/(main|index).[cm]?[jt]sx?` en esa profundidad. `package-lock.json` y los
  `package.json` anidados **no** son materiales. El valor de `version` de primer nivel del
  `package.json` raíz es la única excepción: no cuenta como cambio de contenido ni material;
  cualquier otro campo del archivo sigue siendo material.
- **Rutas efímeras (0.28.0–0.29.0)**: `.discovery-map.json` sólo en la raíz, `.ancleto` /
  `.ancleto/**`, `documentation` / `documentation/**` y `audit logs` / `audit logs/**` (estos dos
  últimos anclados a la raíz) se excluyen de la frescura mediante un predicado único
  (`isEphemeralSource`); no coinciden `.ancletorc`, `.ancleto-notes.md`, `src/ancleto/x.js`,
  `docs/documentation/x.md`, `documentation-extra/x.md`, `src/documentation/x.js` ni
  `audit logs-extra/x.log`. `documentation` y `audit logs` están gitignored y no tienen archivos
  versionados. El filtro es simétrico sobre las dos vistas de `sources` antes de `computeImpact`, y
  `fileHashes` permanece completo. Si el hash difiere, `isEphemeralOnlyChange` concede `READY` sólo
  si hay al menos una ruta cambiada y todas son efímeras; cero rutas cambiadas sigue `STALE`, y sin
  `fileHashes` el estado sigue `STALE`/`minor` con la nota exacta. Las rutas efímeras siguen en
  `sources`/`fileHashes` (674+18 entradas para las dos áreas ignoradas) y `ruleVersion` no cambia.
- **Área**: primer segmento del path; un archivo raíz es su propia área.
- **Estado persistido (0.27.0)**: conserva `hash` y `fileHashes` crudos para rollback y agrega
  `ruleVersion: 2` + `semantic: { hash, fileHashes }`; `semantic.fileHashes` contiene sólo las
  entradas cuyo hash normalizado difiere del crudo. El lector usa la vista semántica sólo con
  `ruleVersion: 2` y forma válida (`hash` string, `fileHashes` objeto no-array); si el bloque falta
  o está malformado, compara crudo como un estado legacy.
- **`computeImpact`**: compara `stored.sources` y la vista efectiva de `fileHashes` con el árbol
  actual. Las formas
  exactas de `materialReasons` son `archivo material nuevo|eliminado|modificado: <rel>`,
  `area raiz nueva: <área>` y `area raiz eliminada: <área>`; el orden y la cardinalidad no son
  contrato. `notes` sólo contiene, sin `fileHashes` previos y sin `changedAreas`, el texto
  `estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area`, y
  ese caso fuerza `minor`.
- **Estados**: faltan documentos → `MISSING`/`PARTIAL` con `impact:none`; documentos completos y
  `hash` coincidente → `READY`/`none`; sin `.discovery-state.json` o sin `hash` → `STALE`/`material`
  con `recommendedAction: regenerate` y arreglos vacíos, sin atribuir materialidad por archivo ni
  por área.
- Decisiones promovidas: `seed-freshness-detector-documented-in-cli-diagnostics` (documentar en
  `cli-diagnostics`, donde ya viven `seedMapPresent`/`affectedDocs`) y
  `seed-freshness-rule-change-requires-minor` (editar las reglas exige delta `MODIFIED`).
- Decisiones promovidas (0.27.0): `seed-freshness-version-bump-not-material`,
  `discovery-state-hash-rule-additive` y `seed-freshness-version-normalization-byte-preserving`.
- Decisiones promovidas (0.28.0): `seed-freshness-ephemeral-paths-reader-side-filter`,
  `seed-freshness-ephemeral-diff-attribution`, `seed-freshness-no-ruleversion-bump` y
  `seed-freshness-ancleto-area-deferred`.
- Decisiones promovidas (0.29.0): `seed-freshness-ignored-areas-reader-side-filter`,
  `seed-freshness-tracked-areas-stay-counted` y `seed-freshness-ignored-areas-writer-unchanged`.
- **Excepción de `recommendedAction` (0.26.x)**: el change archivado
  `2026-11-10-align-freshness-recommended-action-spec` (delta `MODIFIED` de `cli-diagnostics`) fija
  en la spec lo que `checkDiscovery` ya emite: `generate` en `MISSING` y `complete` en `PARTIAL`,
  aun cuando su `impact` es `none`; los tests pinean ambos valores y `src/` no cambia.

### Semántica de exclusiones del discovery (0.30.0)

`src/cli/index.js` es el único dueño del matcher: `escapeRe` escapa los metacaracteres regex y
`matchesGlob` traduce `discovery.exclude` por tokens —`**/`→`(?:.*/)?`, `/**`→`(?:/.*)?`,
`**`→`.*`, `*`→`[^/]*`, `?`→`[^/]`— con anclaje `^…$` si el patrón contiene `**` y
`^(…)(?:/|$)` si no. La corrección se hizo en el matcher existente, sin un segundo oráculo ni una
lista paralela de exclusiones: `DEFAULT_IGNORES`, `outputDir`, `packDiscovery`, el writer, la forma
del estado (`schemaVersion: 2`) y `ruleVersion: 2` no cambian. Efecto observable: `**/*.test.*` y
`**/*.spec.*` vuelven a aplicar y los 21 `test/*.test.js` salen de `sources` (872→854); los 7
fixtures de `test/fixtures/**` siguen incluidos. La exclusión de tests es de `discovery.exclude`, no
de `DEFAULT_IGNORES` ni del predicado reader-side `isEphemeralSource`. Requisito canónico:
«Semántica por segmentos de los patrones de exclusión del discovery» en
`aspec/specs/cli-diagnostics/spec.md`.

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
- **Import deja de copiar `.opencode/*` en hosts no-opencode (0.20.0)**: un proyecto que dependía
  por accidente de ese archivo ya no lo recibe; el archivo preexistente se conserva pero no se
  regenera. Un bundle legacy exportado desde otro host mantiene su intención original (vacía o de
  `opencode`) porque el formato no cambió.
- **Aviso nuevo de `export`**: un destino no parseable produce un aviso por `stderr`; no bloquea ni
  cambia el exit code, pero puede aparecer en CI.
- **Tier dormido silencioso (0.18.15)**: un manifiesto incompleto que omita `installedPaths.agents`
  y un host sin target de agentes no produce aviso. Es el comportamiento buscado, pero oculta el
  caso degenerado.
- **Deriva de versión literal (0.18.15)**: cualquier diferencia de string (pre-release o build)
  dispara el advisory; no distingue semánticamente. Es informativo y no bloquea.
- **`.jsonc` con comentarios (0.18.15)**: `doctor` lo reporta inválido porque conserva `JSON.parse`
  estricto; es deliberado para no ampliar alcance.
- **Nota de compresión y proyectos mixtos**: la consistencia cross-host (H9) sigue pendiente; el
  ruteo de escritura (H3) quedó resuelto en 0.19.0, pero `check` puede seguir avisando en proyectos
  con varios hosts. El invariante 0.18.14 es acotado al host activo y no promete más.
- **Config MCP no parseable (M2)**: `install`/`init` no pueden leer el estado en disco y materializan
  la nota por la escritura pendiente; `check` puede divergir. Desde 0.18.16 `import` avisa antes de
  reemplazarla, pero sigue sin conservar el contenido ilegible. Es una limitación degenerada aceptada.
- **Ruido y alcance de la salud MCP (0.19.0)**: `check` inspecciona los destinos existentes de los
  hosts instalados (no la config global ni hosts sin destino) y reporta como roto cualquier binario
  absoluto ausente en esta máquina; un comando simple se presume sano sin resolver `PATH`. Son
  avisos, no fallos.
- **Artefactos locales**: `.ancletorc` y `.ancleto/machine-env.md` son derivados gitignored; en este
  checkout deben alinearse con `package.json` (`0.30.0`). Si se regeneran con otra versión, el seed
  no cambia porque no los usa como fuente.
- **Detector de frescura**: sus reglas son contrato observable; tocarlas sin delta `MODIFIED` cambia
  el comportamiento del comando. Desde 0.27.0 el estado declara la regla (`ruleVersion: 2` +
  `semantic`) y los estados legacy se comparan crudos, así que un cambio de regla no reescribe ni
  reinterpreta estados previos. Desde 0.28.0 el filtro de rutas efímeras vive en el lector: no
  cambia la forma del estado ni `ruleVersion`, y un estado legacy sin `fileHashes` no puede
  atribuir, por lo que sigue `STALE`/`minor`. Desde 0.29.0 el mismo filtro cubre
  `documentation/**` y `audit logs/**` anclados a la raíz; `docs/**` y `aspec/**` siguen contando.
  Desde 0.30.0 el matcher de `discovery.exclude` se corrige por segmentos en `src/cli/index.js`
  (`escapeRe`/`matchesGlob`), de modo que las exclusiones declaradas vuelven a aplicarse; es una
  decisión de lectura de `computeSources`, no del writer, y no altera `DEFAULT_IGNORES` ni
  `outputDir`. El contenido de `docs/technical-discovery/` no cuenta como cambio material (el
  `outputDir` se excluye del hash).
- **Churn ignorado en `documentation/` y `audit logs/` (0.29.0)**: tocar esas áreas ya no deja el
  seed `STALE`; es el objetivo del cambio, pero oculta churn local que antes alertaba. La mitigación
  es el anclaje exacto a la raíz y los escenarios que mantienen `docs/**` y `aspec/**` como señal
  real de frescura.
- **Reparación MCP acotada (0.20.1)**: la no-escritura rige sólo en `import`/`import --repair`;
  `install`/`init` y `upgrade` siguen reescribiendo el destino. Un `.jsonc` con comentarios sigue
  reemplazándose porque no se agregó parseo tolerante.
- **Conformidad 0.21.0**: la compuerta mecánica no prueba relevancia semántica ni cubre un archive
  ejecutable; la aceptación depende de contratos de texto y content guards. `MEM-01` queda fuera.
- **Merge de specs 0.22.0–0.25.0**: el comando exige specs canónicos en inglés y un título exacto;
  no repara specs traducidos ni crea capabilities. La no-escritura de `--dry-run`, la idempotencia y
  la atomicidad acotada al plan se describen desde el código y la spec, no desde una corrida
  observada en esta generación. El contenedor `archive` falla cerrado por identidad de path. El
  guard 0.24.0 rechaza la canónica con heading de sección de delta pero no la normaliza; la
  reparación es de higiene del repositorio y el content guard la sostiene. Desde 0.25.0 las skills
  de archive ya no editan `aspec/specs/**` directamente: invocan `specs merge` y abortan el archive
  ante un exit no cero, así que el guard alcanza también ese camino.
- **Orden del archive 0.22.1**: la corrección vive en contratos de prompt (agentes y skills), no en
  `src/`; la aceptación se apoya en `test/content-guards.test.js`, que no se ejecutó en esta
  generación. Editar sólo `agents/`/`skills/` y regenerar con `ancleto upgrade`; no tocar
  `.opencode/**` a mano.
- **Docs legados**: `documentation/` es material lnx-cli gitignored y `audit logs/` son logs
  locales; ambos sin archivos versionados y efímeros para `discovery --check` desde 0.29.0. `docs/`
  contiene documentación del framework y el seed; sigue contando para la frescura.

## Reglas de proceso

- **Commits**: Conventional Commits; no directo a `main`/`master` (`AGENTS.md`).
- **Validaciones**: solo lo declarado en `PRODUCT.md`; omitir y registrar lo no declarado.
- **Frescura del seed al archivar**: `STALE` material requiere aprobación explícita del usuario;
  `minor` se anota y continúa (`AGENTS.md`).
- **Memoria vs agente**: reglas/decisiones del repo → `.ancleto/memory.db`; notas de sesión →
  memoria del agente. Una entrada vive en una sola (`AGENTS.md`).
- **Secretos**: nunca copiar valores; nombrar la variable o archivo y omitir el valor.
