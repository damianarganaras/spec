---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, adaptación de frontmatter, nota de compresión, tiers, aviso free-on-primary, ruteo MCP por host, diagnósticos check/doctor, portabilidad host-neutral, reparación MCP sin escritura y entorno de máquina"
covers:
  - instalación
  - AGENT_TARGETS
  - frontmatter por host
  - frontmatterValue
  - merge de templates LOCKED
  - reconciliación legacy
  - MCP
  - ruteo MCP por host
  - HOST_MCP_TARGETS
  - HOST_MCP_ORDER
  - resolveHostMcpDestination
  - readHostMcpIntent
  - salud MCP
  - mcpCommandBroken
  - findProjectMcpFile
  - PROJECT_MCP_CANDIDATES
  - avisos MCP de check
  - nota de compresión host-scoped
  - perfiles
  - tiers y catálogo
  - integridad de IDs
  - aviso free-on-primary
  - diagnósticos check y doctor
  - tier dormido
  - deriva de versión
  - precedencia de config MCP
  - portabilidad e installedPaths
  - bundle host-neutral
  - validación de manifest.mcp
  - reparación MCP sin escritura
  - machine-env
sources: ["src/cli/index.js", "src/core/adapters/frontmatter.js", "src/core/machine-env.js", "src/core/tier-models.js", "src/core/model-catalog.js", "src/core/model-catalog.json", "scripts/refresh-model-catalog.mjs", "aspec/changes/archive/2026-11-06-fix-repair-mcp-noop", "aspec/changes/archive/2026-11-05-host-neutral-bundle", "aspec/changes/archive/2026-11-05-mcp-host-write-routing", "aspec/changes/archive/2026-11-05-mcp-oracle-residual-closure", "aspec/changes/archive/2026-11-05-mcp-command-health", "aspec/changes/archive/2026-11-04-check-doctor-state-parity", "aspec/changes/archive/2026-11-04-host-compression-note-consistency", "aspec/specs/cli-diagnostics/spec.md", "aspec/specs/agent-install-routing/spec.md", "aspec/specs/project-portability/spec.md", "aspec/specs/agent-model-tiers/spec.md"]
generatedAt: 2026-11-06T12:16:49Z
pluginVersion: 0.20.1
skillVersion: '2.3'
---

# Unidad: CLI, instalación y adaptación por host

## Propósito

`src/cli/index.js` es el entry point único (`ancleto` y `aspec`). Materializa los assets del
framework en el layout nativo del host elegido, aplica el tier de modelos, mergea templates sin
destruir personalizaciones, configura MCP y ofrece comandos de operación (memoria, discovery,
stats, portabilidad, diagnóstico). `src/cli/ui.js` aporta el banner y los menús TTY.

## Recorrido relevante

### `init` / `install` / `update`

1. Se resuelve el host (`AGENT_TARGETS`): `opencode`, `claude`, `vscode`, `antigravity`, `cursor`,
   `roo`, `copilot`, `commandcode`. Cada host declara `skills`, `agents` y `commands` con su
   directorio y extensión; un asset `null` no se soporta y se avisa a stderr.
2. Se resuelve el tier **antes de escribir agents**: `resolveTierMap(tier, gratisOverride)` carga
   `src/core/model-catalog.json` y usa `resolveTierModels` (`src/core/tier-models.js`). Si ningún
   candidato de la cadena está disponible, `install`/`init` abortan con error explícito; nunca
   escriben un ID inventado.
3. `applyTier` reescribe `model:` solo en mirrors de `opencode`; el resto de hosts dropean el campo
   o emiten `model: inherit`.
4. Se copian assets con adaptación de frontmatter y se mergean templates (`AGENTS.md`,
   `PRODUCT.md`) por bloques `LOCKED`; antes se reconcilian firmas planas legadas.
5. Se persiste `.opencode/.ancleto-tier` con el nombre del tier y se actualiza `.ancletorc`
   (`installedPaths`, `agent`, `tier`, `gratisModel` si ya existía, `version`).

### Ruteo de escritura MCP por host (0.19.0)

`HOST_MCP_TARGETS` (`src/cli/index.js`) es el descriptor único de destino y esquema:

| Host activo | Destino de proyecto | Esquema |
|---|---|---|
| `opencode` | `.opencode/opencode.json` o el `.jsonc` existente | `mcp` |
| `antigravity` | `.agents/mcp_config.json` | `mcpServers` |
| `commandcode` | `.mcp.json` | `mcpServers` |
| `copilot` | `copilot-mcp.json` | `mcp` |
| `claude`, `vscode`, `cursor`, `roo` | ninguno | — |

- `setupHostMcp` es el dueño único para `init`/`install`/`update`: resuelve el host activo y llama
  al merge del descriptor. Sin proyecto conserva la rama global solo-opencode. Un host sin destino
  no escribe MCP ni crea `.opencode`, emite como máximo un aviso no bloqueante por corrida
  (`warnNoMcpDestination`) y sigue con el exit code previo.
- `import` e `import --repair` resuelven el destino del host activo y lo pasan a
  `repairProjectMcp`; los merges son no destructivos e idempotentes.
- `resolveHostMcpFile` respeta el par `json`/`jsonc` de `opencode`;
  `resolveHostMcpDestination` devuelve `{ host, file, schema }` o `null`.
- La garantía se acota a proyecto, host activo y hosts con destino. Quedan fuera la instalación
  global, el borrado de archivos preexistentes y la verificación del consumo de `copilot-mcp.json`.

### Nota de compresión host-scoped (0.18.14)

`CAVEMAN_USAGE_NOTE` es una directiva de uso de la tool de compresión del host; nunca se escribe en
texto compartido (`AGENTS.md` o assets copiados verbatim). La decisión se concentra en
`resolvesHostCompression(projectDir, host, { writesCaveman = false, intendedNames = null })`, junto
a `hostConfigHasCompression` (`src/cli/index.js`):

1. `false` si el host no soporta compresión (`hostSupportsCompression` limita a `opencode` y
   `antigravity`).
2. `true` si la config MCP **en disco** ya incluye `caveman` (`hostConfigHasCompression`).
3. `false` si no hay escritura pendiente (`writesCaveman` falso).
4. `true` si hay escritura pendiente y `intendedNames` es `null` o incluye `'caveman'`.

`hostConfigHasCompression` lee `.agents/mcp_config.json` (antigravity) o `.opencode/opencode.json`
y `.opencode/opencode.jsonc` (opencode); acepta `mcp`/`mcpServers` y busca la clave `caveman`. Un
archivo ausente o un JSON inválido no aporta la tool. Es la misma fuente de verdad que usa `check`.

- **`install`**: `writesCaveman: Boolean(mcpMap && mcpMap.caveman)`.
- **`init`**: mismo patrón con su `mcpMap`, resuelto antes de `installAgentAssets`.
- **`import`**: `writesCaveman: Boolean(freshProjectMcp && freshProjectMcp.caveman)` e
  `intendedNames` derivado de `manifest.mcp`. `repairProjectMcp` escribe el destino del host activo
  y, desde 0.20.1, sólo cuando hay error de parseo, normalización estructural o entradas
  reparadas/agregadas; un destino sano no se toca.
- **Efecto**: con la config en disco ya en `caveman`, `install --no-mcp` o la ausencia del binario
  conservan la nota; sin `caveman` en disco ni escritura pendiente, la nota se elimina al reescribir
  el orchestrator. Re-ejecutar es idempotente.
- **Alcance**: el invariante rige para el host activo de una instalación de proyecto que `check`
  evalúa. H9 y la rama global de `install` sin `--project` quedan fuera; el ruteo de escritura (H3)
  quedó resuelto en 0.19.0. La excepción M2 (config MCP no parseable) se documenta en `decisions.md`.

### Aviso de modelo gratis sobre un agente primario (0.18.13)

`freeTierOnPrimary(model, mode)` (`src/core/tier-models.js`) es el único predicado: verdadero solo
si el modelo es el gratis conocido (`opencode/big-pickle`) y `String(mode).trim() === 'primary'`.
No recibe tier, no lee archivos, no hace red ni ejecuta procesos.

- **Set-time**: dentro de `applyTier`, cuando el reemplazo de `model:` cambia el contenido
  (`o !== c`), se lee el `mode:` del frontmatter existente con
  `frontmatterValue(parseFrontmatter(c).entries?.find((e) => e.key === 'mode'))`. Si el agente es
  `mode: primary` y el modelo objetivo es gratis, se emite por `stderr`:
  `ancleto: tier gratis: <agent> es un agente primario (mode: primary) y usará el modelo free <model>; OpenCode puede responder 403 "free tier can only be used from within OpenCode". Usá un modelo pago en el agente primario.`
  El reemplazo se escribe igual; no lanza y el exit code sigue siendo 0. La rama `o === c` no
  advierte.
- **Inspect-time**: `checkAgentsFrontmatter` deriva el `mode:` del frontmatter **instalado** y, si es
  `primary` y su `model:` satisface `freeTierOnPrimary`, agrega la entrada advisory
  `<dirRel>/<file> (modelo free <model> sobre un agente primario: puede responder 403 en OpenCode)`.
  No incrementa `missing` ni `orphans` y no altera la salida `missing > 0 ? 1 : 0`.
- La detección **no** usa el nombre del agente ni su posición en `TIERS`; un `mode: subagent`, la
  ausencia de `mode:` o un agente ausente no producen aviso. Un override
  `opencode.json → agent.<nombre>.model` es invisible para ancleto: por eso el aviso es advisory y
  dice "puede", nunca garantiza el 403.

`frontmatterValue(entry, fallback)` se exporta desde `src/core/adapters/frontmatter.js` para que
estos avisos lean `mode:` sin duplicar el parseo; el módulo sigue siendo puro y dueño único de la
transformación de frontmatter.

### `upgrade`

Re-aplica templates y skills sobre el proyecto actual, sin aplicar tier (el mirror vuelve a la
fuente canónica byte a byte). Es la vía que materializa el default publicado de `agents/*.md`
(`commandcode/deepseek/deepseek-v4.1-flash`) y, desde 0.18.15, el único remediador de la deriva de
`.ancletorc.version` que `check` reporta.

### `import` / `export`

- `export` empaqueta lo portable (`.ancletorc` sin rutas, agents/commands/skills, templates, aspec,
  memoria si aplica) con manifiesto `ancleto-export/1`. Copia `.ancletorc` verbatim, incluidas las
  rutas de la máquina origen.
- **Intención MCP host-neutral (0.20.0)**: `readHostMcpIntent(projectDir, host)` resuelve el destino
  con el descriptor. Host con destino: archivo ausente → `entries = []` sin aviso; parseable → toma
  `cfg[schema]`; no parseable → `entries = []` y `error`. Host sin destino (`claude`, `vscode`,
  `cursor`, `roo`): lectura legacy de `.opencode/opencode.json|jsonc` con el mismo aviso. `export`
  arma `[{ name, type, enabled }]` y deriva `manifest.flags.engram` de esa intención. Si hay error,
  emite una vez `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia` y sale con 0.
  No cambian la forma del manifiesto, el guard de rutas absolutas, el payload ni `--tar`.
- `import` **lee y resuelve antes del primer write**; luego aplica el tier, escribe
  `.opencode/.ancleto-tier` y repara MCP en el destino del host activo.
- **Aviso de config MCP no parseable (0.18.16)**: si el destino no parsea, `repairProjectMcp` emite
  por `stderr`, antes de reemplazarlo,
  `ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP nueva`. La
  decisión de reemplazo y el exit code no cambian; un archivo parseable no produce el aviso.
- **Copia de assets host-scoped (0.20.0)**: sólo con host activo `opencode` se copian
  `.opencode/{agents,commands,skills}` del bundle y se registran como `.opencode/<dir>`; en los demás
  hosts no se copian ni se registran y los assets se materializan por `installAgentAssets`.
- **Validación de `manifest.mcp` (0.18.14)**: antes de cualquier escritura, un `manifest.mcp`
  presente debe ser array; cada entrada debe ser objeto con `name` string no vacío. Un valor
  no-array aborta con `bundle invalido (manifest.mcp no es un arreglo)`; una entrada inválida, con
  `bundle invalido (manifest.mcp con entradas invalidas)`. Ambos casos salen con exit 1. La
  validación evita un import parcial, porque `intendedMcpNames` se consume después del primer write.
- **`installedPaths` (0.18.13)**: cuando el bundle trae `.ancletorc`, el manifiesto se escribe
  **después** de `installAgentAssets`, del overlay de perfil y de la aplicación de tier, con
  `unionInstalledPaths(<installedPaths del destino>, <lo escrito por este import>)` para
  `templates|agents|commands|skills`. Sólo en `opencode` se suman además los directorios
  `.opencode/{agents,commands,skills}` copiados del bundle. Nunca se heredan las rutas del bundle;
  un bundle sin `.ancletorc` no reescribe el manifiesto. `unionInstalledPaths` deduplica con `Set`,
  así que reimportar no duplica rutas.
- Consecuencia buscada: el `check` posterior deja de pasar de forma vacía y puede reportar
  faltantes u huérfanos reales. En hosts no-opencode deja de aparecer un `.opencode` fantasma.
- `--repair` sin bundle repara entradas MCP rotas sin tocar las sanas y sin cambiar
  `installedPaths`; como no reescribe assets, **no sanea** una nota de compresión legada.

### Reparación MCP sin escritura (0.20.1)

`repairProjectMcp` decide ahora **si escribir**, no sólo qué escribir. Escribe el destino del host
activo sólo si `error || normalized || fixed.length > 0`:

- `error`: el archivo existe y no es JSON parseable (se conserva el aviso y el reemplazo).
- `normalized`: el documento raíz no es un objeto JSON (`null`, arreglo, string, número, booleano) o
  la clave de esquema del host está presente con un valor no-objeto.
- `fixed`: hay al menos una entrada rota reparada o un nombre intencionado agregado.

Un destino con todas las entradas sanas no se reescribe: bytes y mtime quedan intactos y el mensaje
`MCP sanos en <ruta>, sin cambios` describe lo efectivamente hecho. Una clave de esquema ausente no
se agrega sólo para normalizar; un destino inexistente sin entradas que reparar o agregar no se crea
(ni archivo ni directorio). `mkdir` vive dentro de la rama de escritura.

La garantía de no-escritura se acota a `import`/`import --repair` (`repairProjectMcp`).
`install`/`init` (`setupHostMcp` → `mergeMcp`) y `upgrade` (`refreshCopilotMcp`/
`refreshCommandCodeMcp`) reescriben el mismo destino y quedan fuera. Un `.jsonc` con comentarios
sigue sin parsear y se reemplaza (`jsonc-comments-not-supported`).

### Salud de comandos MCP (0.18.16)

`mcpCommandBroken(entry)` (`src/cli/index.js`) es el predicado único que comparten `import`,
`import --repair`, `refreshCopilotMcp`, `refreshCommandCodeMcp` y la inspección de `check`:

1. `command` debe ser un arreglo no vacío; si no, la entrada está rota.
2. `command[0]` debe ser un string no vacío; si no, está rota.
3. Si `command[0]` es una ruta absoluta de la plataforma actual (`isAbsolute`), la entrada está rota
   sólo si `existsSync` es falso.
4. En cualquier otro caso (comando simple) se presume sana: no se ejecuta ni se resuelve `PATH`.

Una ruta Windows con letra de unidad (`C:\nvm4w\nodejs\node.exe`, `c:/...`) ya no se declara rota por
su forma: se evalúa por existencia. Esto corrige el default `[process.execPath, ...]` de
`buildDefaultMcp` y evita que `import --repair`/`refresh*` reescriban entradas sanas.

El descubrimiento de destinos tiene dos niveles desde 0.19.0. `PROJECT_MCP_CANDIDATES =
['opencode.json', 'opencode.jsonc']` sigue siendo el dueño del **par de nombres de `opencode`**
(consumido por `GLOBAL_MCP_CANDIDATES` por `basename`); `HOST_MCP_TARGETS` es el dueño del **destino
y esquema por host**. `findProjectMcpFile(projectDir)` resuelve el primero de ese par en `.opencode/`;
`readProjectMcp` lo usa y devuelve `{ file, cfg }` más `error` cuando existe y no parsea.
`resolveHostMcpDestination` decide el archivo de cada host y `resolveExistingHostMcpDestinations`
filtra los existentes. Las semánticas de selección se conservan: `mergeMcp` recolecta todos los
candidatos de `opencode`, `hostConfigHasCompression` prueba todos y `doctor`/`check` eligen el
primero según su propia precedencia. No hay parseo tolerante de JSONC.

`import` (con bundle o `--repair`) emite por `stderr`, antes de reemplazar un destino no parseable:
`ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP nueva`. La decisión
de reemplazo y el exit code no cambian. `check` agrega avisos advisory (ver abajo) y nunca escribe.

### `check`

Verifica templates y directorios de `installedPaths` contra el catálogo versionado; reporta
faltantes (✖, afectan exit code) y huérfanos (⚠). Para agents de `opencode`, compara el frontmatter
contra la adaptación de la fuente canónica (o el overlay del perfil) y contra el conjunto de
aceptación del tier.

El catálogo se carga **una sola vez por ejecución** y solo si `opencode` está instalado; un JSON
parseable con forma inválida se descarta (`validateCatalogSnapshot`) para no derivar deriva falsa.
Sobre ese catálogo se agregan avisos **no bloqueantes**:

- **Deriva por archivo**: si un `model:` del mirror no figura en el snapshot, se nombra el archivo
  y el ID y se refiere el refresco al repositorio fuente.
- **Advisory de IDs declarados (0.18.12)**: como máximo un aviso por ejecución si un ID declarado
  en `TIERS`, `TIER_CHAINS`, `agents/*.md` o `profiles/*/agents/*.md` no figura en el snapshot.
- **Advisory free-on-primary (0.18.13)**: una entrada por agente instalado con `mode: primary` y
  modelo gratis.
- **Antigüedad**: un único aviso por ejecución cuando `generated_at` supera 90 días
  (`isCatalogStale`).
- **Catálogo no verificable**: si falta, es ilegible o no valida, `check` no aborta; acepta los
  candidatos estáticos y avisa por directorio. No emite deriva ni advisory de IDs en ese caso.
- **Tier dormido (0.18.15)**: `checkTierOrphan` lee `.opencode/.ancleto-tier`; si el tier no
  pertenece a `TIERS` no hay aviso. La superficie se deriva con `localAgentDirs(rc)` (unión de
  `installedPaths.agents` y el target de agentes del host en `rc.agent`). Si esa lista es vacía
  —hosts sin agentes, como `cursor` o `roo`— el tier queda dormido y no se advierte. Si hay al
  menos un directorio y la suma de `.md` es cero, se conserva el aviso
  `tier "<t>" sin agentes locales donde aplicarlo…`.
- **Deriva de versión (0.18.15)**: si `rc.version` es un string no vacío distinto de
  `packageVersion()` (leída de `package.json`), se agrega una vez el aviso
  `.ancletorc registra v<rc> y el CLI es v<cli>; corré 'ancleto upgrade' para regenerar los
  artefactos locales`. No cambia el exit code, no incrementa contadores y no repara.
- **Salud MCP host-aware (0.18.16, ampliada en 0.19.0)**: deriva los hosts instalados con
  `installedHostsFromPaths(rc.installedPaths)` y resuelve sus destinos con
  `resolveExistingHostMcpDestinations(..., HOST_MCP_ORDER)`. Por cada destino existente: si no
  parsea, agrega `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP`; si parsea y
  `cfg[schema]` es un objeto plano, agrega `MCP '<nombre>' tiene un comando roto (<detalle>)` por
  cada entrada con `mcpCommandBroken` verdadero (`mcpServers` se normaliza con
  `normalizeHostMcpEntry`). `<detalle>` es el primer elemento sólo si `command` es un arreglo con un
  string no vacío, y `command ausente` en cualquier otra forma. Un esquema no-objeto no produce
  avisos ni error de parseo. No inspecciona la config global ni hosts sin destino.

Solo los faltantes alteran el exit code (`missing > 0 ? 1 : 0`); huérfanos, divergencias, deriva,
advisory, antigüedad, tier dormido, salud MCP y catálogo no verificable son warnings. La divergencia
de frontmatter por la nota de compresión sigue siendo advisory y la comparación sigue siendo del
archivo completo. Un `caveman` roto produce su aviso pero sigue contando como compresión presente
para `hostConfigHasCompression`.

### Refresco del catálogo y gate de `--write`

`scripts/refresh-model-catalog.mjs` corre manualmente desde el repositorio fuente (no se publica en
el paquete). Con `--write`, antes de cualquier escritura deriva los IDs declarados de `TIERS`,
`TIER_CHAINS`, `agents/*.md` y `profiles/*/agents/*.md` y los contrasta contra el candidato. Si
falta uno, sale con exit 1, nombra ID y origen y no escribe ni el snapshot commiteado ni el
candidato; si las fuentes no se pueden leer, falla cerrado. El dry-run no depende de esas fuentes.
La detección de binario ausente (`looksBinaryMissing`) es independiente del locale.

### `doctor`

Comprueba Node ≥ 24, importabilidad de `node:sqlite` y validez de la config MCP del host. Los dos
primeros son los únicos fatales (`exit 1`); una config inválida o ausente no cambia el exit code.

La config MCP se resuelve con precedencia **host activo → hosts instalados → global**:

1. El destino del host activo (`rc.agent`, o `opencode` por defecto) si existe.
2. Los destinos de los hosts instalados derivados de `installedPaths`, en el orden
   `opencode`, `antigravity`, `commandcode`, `copilot`.
3. `globalConfigDir()/opencode.json` y `globalConfigDir()/opencode.jsonc` sólo si no existe ninguno
   de proyecto.

`resolveExistingHostMcpDestinations` aplica la regla compartida y devuelve el primer destino
existente; `GLOBAL_MCP_CANDIDATES` deriva el par global de `PROJECT_MCP_CANDIDATES` por `basename`.
Se valida **sólo el primer archivo existente**; si hay config de proyecto, no se cae al fallback
global aunque sea inválida. La ruta del proyecto se reporta relativa con separadores `/`
(ej. `.opencode/opencode.json` o `copilot-mcp.json`); la global, por `basename`. Mensajes:
`✔ <ruta> valido`, `✖ <ruta> JSON invalido`, y `⚠ opencode.json no encontrado (config MCP)` si no
existe ninguno. El parseo es `JSON.parse` estricto sin BOM; un `.jsonc` con comentarios se reporta
inválido a propósito. `doctor` no valida `.vscode/mcp.json` ni crea MCP para hosts sin destino.

## Rutas por host (`AGENT_TARGETS`)

| Host | Skills | Agents | Commands |
|---|---|---|---|
| opencode | `.opencode/skills` | `.opencode/agents/*.md` | `.opencode/commands/*.md` |
| claude | `.claude/skills` | `.claude/agents/*.md` | `.claude/commands/*.md` |
| vscode | `.github/skills` | `.github/agents/*.agent.md` | `.github/prompts/*.prompt.md` |
| antigravity | `.agents/skills` | `.agents/agents/*.md` | commands como skills en `.agents/skills/<n>/SKILL.md` |
| cursor | `.cursor/skills` | — | — |
| roo | `.roo/skills` | — | — |
| copilot | — | `.github/prompts/*.prompt.md` | `.github/prompts/*.prompt.md` |
| commandcode | `.commandcode/skills` | `.commandcode/agents/*.md` | `.commandcode/commands/*.md` |

MCP por host (descriptor `HOST_MCP_TARGETS`): `opencode` mergea `opencode.json`/`.jsonc`;
Antigravity, `.agents/mcp_config.json`; Command Code, `.mcp.json`; Copilot, `copilot-mcp.json`.
`claude`, `vscode`, `cursor` y `roo` no declaran destino: no se escribe MCP ni se crea `.opencode`.
Todos los merges son no destructivos. `cursor` y `roo` tampoco declaran target de agentes: por eso el
tier puede quedar dormido en `check`.

## Reglas, contratos y riesgos

- **Adaptador puro**: `adaptFrontmatter(content, host, assetKind, name)` no hace I/O ni guarda
  estado. Los ids de tools de Antigravity y Command Code son conjuntos cerrados: una clave sin id
  verificado se omite con aviso, nunca en silencio (un id inexistente cuelga el subagent).
- **`frontmatterValue`**: exportado para que `applyTier` y `check` lean `mode:` reutilizando el
  parser del adaptador; no hay un segundo parser de frontmatter.
- **Command Code** omite `model:` (hereda el de la sesión) y emite `tools` como lista; los tiers no
  cambian modelos ahí.
- **Copilot** no soporta skills; los tiers solo cambian el nivel de esfuerzo (nota en el
  orchestrator).
- **Templates**: el merge reemplaza bloques `LOCKED` conocidos, inserta bloques nuevos en el ancla
  correcta y **no toca** un bloque mal formado o personalizado; avisa. La reconciliación legacy es
  idempotente y solo elimina con coincidencia exacta.
- **Perfil `test`**: overlay sobre `profiles/test/` (agents/commands/templates); el package base no
  se modifica. El tier sigue siendo dueño de `model:` en install/init; `upgrade` devuelve el
  overlay a su fuente. Un guard test-only exige que `profiles/test/agents/*.md` declaren `^model:`.
- **`machine-env`**: `materializeMachineEnv` nunca lanza; devuelve warnings. `check` avisa si el
  artefacto quedó trackeado en git.
- **Catálogo y `check`**: deriva, advisory, antigüedad, free-on-primary, tier dormido, deriva de
  versión y salud MCP son informativos y nunca hacen fallar `check`; solo los faltantes alteran el
  exit code. `install`/`init`/`import` siguen siendo estrictos.
- **Salud MCP acotada**: `mcpCommandBroken` sólo evalúa la existencia de rutas absolutas en el host
  actual; un comando simple se presume resuelto por `PATH`. `check` no ve la config global ni hosts
  sin destino; sí ve los destinos de los hosts instalados. Un binario ausente en esta máquina
  produce un aviso advisory, no un fallo.
- **Aviso free-on-primary**: `applyTier` lo escribe en `stderr`; wrappers de CI que tratan `stderr`
  como error lo verán, pero el exit code sigue en 0.
- **Nota de compresión**: la decisión no vuelve a detectar el binario cuando la config ya define el
  estado; `install`/`init`/`import` comparten el helper. La consistencia cross-host sigue acotada al
  host activo (H9 pendiente) y la config MCP no parseable es una excepción degenerada.
- **Diagnósticos 0.18.15**: el change sólo tocó `checkTierOrphan`, `checkCommand` y
  `doctorCommand`; ningún escritor cambió. El tier se considera dormido (no huérfano) sin
  superficie local de agentes.
- **Salud MCP 0.18.16**: el change tocó `mcpCommandBroken`, el descubrimiento/lectura de la config
  de proyecto, el arreglo `warnings` de `checkCommand` y el aviso de `repairProjectMcp`.
- **Ruteo MCP 0.19.0**: el descriptor `HOST_MCP_TARGETS` reemplazó los literales por comando;
  `init`/`install`/`import`/`import --repair` escriben en el host activo y `check`/`doctor` son
  host-aware. La rama global de `install` queda excluida.
- **Bundle host-neutral 0.20.0**: `export` lee la intención con `readHostMcpIntent`; `import` copia
  `.opencode/*` sólo en `opencode`. El formato `ancleto-export/1` no cambia y los bundles legacy
  siguen siendo legibles.
- **Reparación MCP 0.20.1**: el predicado de escritura evita reescribir destinos sanos y crear
  destinos vacíos; los mensajes y exit codes no cambian. La garantía se acota a
  `import`/`import --repair`; `install`/`init` y `upgrade` siguen reescribiendo el destino.
- **Riesgo**: `.ancletorc` y `.ancleto/machine-env.md` son artefactos derivados gitignored; en este
  checkout registran `0.20.1`. No son fuentes del seed.

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point, subcomandos, instalación, descriptor y ruteo MCP por host, diagnósticos, salud MCP, nota de compresión, validación de bundles, `export`/`import`, MCP, stats |
| `src/cli/ui.js` | Banner y menús TTY |
| `src/core/adapters/frontmatter.js` | Adaptación pura de frontmatter por host y `frontmatterValue` |
| `src/core/tier-models.js` | Tiers, cadenas, resolver, `freeTierOnPrimary`, `declaredModelIds` |
| `src/core/model-catalog.js` | Validación, IDs del catálogo e integridad de declarados |
| `src/core/model-catalog.json` | Snapshot verificado de modelos |
| `src/core/repomix-tier.js` | Configuración de pack por tier |
| `src/core/machine-env.js` | Detección de entorno y exclusión local |
| `scripts/refresh-model-catalog.mjs` | Refresco manual, gate de `--write` y escritura atómica |
| `templates/AGENTS.md`, `templates/PRODUCT.md` | Templates con bloques `LOCKED` |
| `profiles/test/**` | Overlay del perfil de test |
| `aspec/changes/archive/2026-11-06-fix-repair-mcp-noop/` | Change archivado del predicado de escritura de `repairProjectMcp` (0.20.1) |
| `aspec/changes/archive/2026-11-05-host-neutral-bundle/` | Change archivado del bundle host-neutral (`export`/`import`) |
| `aspec/changes/archive/2026-11-05-mcp-host-write-routing/` | Change archivado del descriptor y ruteo de escritura MCP por host |
| `aspec/changes/archive/2026-11-05-mcp-oracle-residual-closure/` | Change archivado del texto del predicado y par global de `doctor` |
| `aspec/changes/archive/2026-11-05-mcp-command-health/` | Change archivado de salud MCP, descubrimiento único y avisos de check/import |
| `aspec/changes/archive/2026-11-04-check-doctor-state-parity/` | Change archivado de paridad de diagnósticos (H7/H13/H14) |
| `aspec/changes/archive/2026-11-04-host-compression-note-consistency/` | Change archivado de la nota de compresión y validación de `manifest.mcp` |
| `aspec/specs/cli-diagnostics/spec.md` | Requirements de deriva de versión, config MCP de `doctor`, salud MCP, avisos de `check` y aviso de `import` |
| `aspec/specs/agent-install-routing/spec.md` | Requirements de destinos nativos, ruteo MCP por host y compresión host-scoped |
| `aspec/specs/project-portability/spec.md` | Requirements de `export` host-neutral, `import` (MCP + `installedPaths`), reparación y nota de compresión |
| `aspec/specs/agent-model-tiers/spec.md` | Requirements de tiers, aviso free-on-primary, integridad y tier dormido |
