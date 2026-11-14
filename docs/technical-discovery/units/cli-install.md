---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, adaptación de frontmatter, nota de compresión, tiers, aviso free-on-primary, ruteo MCP por host, diagnósticos check/doctor, portabilidad host-neutral, reparación MCP sin escritura, merge de specs, entorno de máquina y materialización de los contratos de conformidad"
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
  - conformidad sin delta
  - merge de specs
  - specs merge
  - specs-merge
  - endurecimiento specs merge 0.22.1
  - orden del archive
  - aviso de bundle legacy
  - preservación de EOL legacy
  - materialización de agents y skills
  - frescura del seed
  - selección de tests afectados
  - test:affected
  - machine-env
sources: ["src/cli/index.js", "src/core/discovery-glob.js", "src/core/test-selection.js", "aspec/changes/archive/2026-11-13-ch-06b-affected-test-selection", "aspec/changes/archive/2026-11-10-spec-seed-freshness-detector", "aspec/changes/archive/2026-11-11-active-delta-structure-guard", "aspec/changes/archive/2026-11-11-seed-freshness-version-bump-not-material", "aspec/changes/archive/2026-11-11-seed-freshness-ephemeral-paths", "aspec/changes/archive/2026-11-12-seed-freshness-ignored-areas", "aspec/changes/archive/2026-11-12-discovery-exclude-regexp-cache", "aspec/changes/archive/2026-11-12-discovery-state-schema-wording", "aspec/changes/archive/2026-11-12-pin-offline-discovery-state", "src/core/specs-merge.js", "src/core/adapters/frontmatter.js", "src/core/machine-env.js", "src/core/tier-models.js", "src/core/model-catalog.js", "src/core/model-catalog.json", "scripts/refresh-model-catalog.mjs", "aspec/changes/archive/2026-11-08-archive-sync-via-specs-merge", "aspec/changes/archive/2026-11-08-cli-subcommand-help-guards", "aspec/changes/archive/2026-11-08-agent-model-minimo-migration", "aspec/changes/archive/2026-11-08-specs-merge-canonical-guard", "aspec/changes/archive/2026-11-07-portability-legacy-bundle-advisory", "aspec/changes/archive/2026-11-07-template-legacy-eol-preservation", "aspec/changes/archive/2026-11-06-specs-merge-hardening", "aspec/changes/archive/2026-11-06-archive-order-correctness", "aspec/changes/archive/2026-11-06-ch-06a-specs-merge-deterministic", "aspec/changes/archive/2026-11-06-p0-pr5-archive-conformity", "aspec/changes/archive/2026-11-06-fix-repair-mcp-noop", "aspec/changes/archive/2026-11-05-host-neutral-bundle", "aspec/changes/archive/2026-11-05-mcp-host-write-routing", "aspec/changes/archive/2026-11-05-mcp-oracle-residual-closure", "aspec/changes/archive/2026-11-05-mcp-command-health", "aspec/changes/archive/2026-11-04-check-doctor-state-parity", "aspec/changes/archive/2026-11-04-host-compression-note-consistency", "aspec/specs/spec-sync/spec.md", "aspec/specs/memory-ops/spec.md", "aspec/specs/prompt-contracts/spec.md", "aspec/specs/cli-diagnostics/spec.md", "aspec/specs/agent-install-routing/spec.md", "aspec/specs/project-portability/spec.md", "aspec/specs/agent-model-tiers/spec.md"]
generatedAt: 2026-11-14T00:28:03Z
pluginVersion: 0.34.0
skillVersion: '2.3'
---

# Unidad: CLI, instalación y adaptación por host

## Propósito

`src/cli/index.js` es el entry point único (`ancleto` y `aspec`). Materializa los assets del
framework en el layout nativo del host elegido, aplica el tier de modelos, mergea templates sin
destruir personalizaciones, configura MCP y ofrece comandos de operación (memoria, discovery,
`specs`, stats, portabilidad, diagnóstico). `src/cli/ui.js` aporta el banner y los menús TTY.

## Recorrido relevante

### `init` / `install` / `update`

1. Se resuelve el host (`AGENT_TARGETS`): `opencode`, `claude`, `vscode`, `antigravity`, `cursor`,
   `roo`, `copilot`, `commandcode`. Cada host declara `skills`, `agents` y `commands` con su
   directorio y extensión; un asset `null` no se soporta y se avisa a stderr.
2. Se resuelve el tier **antes de escribir agents**: `resolveTierMap(tier, gratisOverride)` carga
`src/core/model-catalog.json` y usa `resolveTierModels` (`src/core/tier-models.js`). Para `minimo`
    la cadena tiene dos candidatos (`opencode-go/deepseek-v4.1-flash` →
    `opencode/deepseek-v4.1-flash-free`), cuya cabeza es el `model:` de `agents/*.md`. Si ningún
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
(`opencode-go/deepseek-v4.1-flash`) y, desde 0.18.15, el único remediador de la deriva de
`.ancletorc.version` que `check` reporta.

**0.21.0**: el CLI no cambió en esa versión; `upgrade` es la vía por la que llegaron a los proyectos
los cambios de ruteo de conformidad de `agents/orchestrator.md`, `skills/triage-clarifier`,
`skills/ancleto-workflow`, `skills/ancleto-continue`, `skills/ancleto-archive`, `agents/spec-writer.md`,
`agents/documenter.md`, `agents/coder.md`, `agents/tester.md` y `agents/reviewer.md`; los mirrors
`.opencode/**` no se editan a mano.

**0.22.0–0.22.1**: el CLI suma el subcomando `specs merge` (0.22.0) y lo endurece sin flags nuevos
en 0.22.1 (ver abajo). `upgrade` sigue siendo la vía de materialización de assets; el merge de specs
no se aplica durante `install`/`upgrade`, y el orden del archive vive en `agents/`/`skills/`.

### Ayuda sin ejecución (0.25.0)

`SUBCOMMAND_HELP` (`src/cli/index.js`) declara el texto de uso por subcomando y el guard corre en el
dispatch, antes del `switch`: si `--help` o `-h` aparece en cualquier posición del argv del
subcomando, imprime el uso en stdout y termina con exit 0 **sin ejecutar el comando**. El conjunto
cubierto es `install`, `update`, `upgrade`, `init`, `memory` (incl. `memory <subcomando> --help`),
`import`, `export`, `mcp`, `specs` a secas, `specs merge`, `projects` (incl. sus subcomandos) y
`list --projects` (alias de `projects`). `discovery` conserva su propio handler y la ayuda global
(`ancleto --help`, `-h` o sin argumentos) su camino; `check`, `doctor`, `stats`, `affected`,
`list --help` y `specs check --help` quedan fuera del guard. El alcance es de solo lectura: no se
toca `.ancletorc` ni `.opencode/**` (`aspec/specs/cli-diagnostics/spec.md`).

### Frescura del seed (0.26.0–0.30.2)

`checkDiscovery` (`src/cli/index.js`) es el dueño del estado del seed. `seedMapPresent` se calcula
una sola vez antes de clasificar el estado (`READY`, `STALE`, `PARTIAL` o `MISSING`), y
`affectedDocs` sigue siendo la intersección de `seedMap` con `changedAreas`, poblada sólo en
`STALE`. La salida es `schemaVersion: 2`, JSON, exit 0 y read-only.

En 0.26.1 el comportamiento vigente del detector —precedencia de `impact`, lista cerrada de
archivos materiales, `areaOf`, formas exactas de `materialReasons`/`notes` y estructura de
estado— queda fijado como `ADDED` de `aspec/specs/cli-diagnostics/spec.md` y pineado con tests; no
se modificó `src/`. Un cambio en `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `isMaterialFile`,
`areaOf` o `computeImpact` es comportamiento y exige delta `MODIFIED` (release minor).

El mismo spec quedó alineado al `recommendedAction` real que ya emite `checkDiscovery`:
`generate` para `MISSING` y `complete` para `PARTIAL`, excepción explícita a la regla
`impact:none` → `continue`; los tests pinean ambos valores y `src/` sigue sin cambios.

En 0.27.0 `src/cli/index.js` normaliza el `package.json` raíz antes de hashear: reemplaza sólo el
valor de `version` de primer nivel por un centinela byte-preserving, de modo que un bump de versión
no es cambio de contenido ni materialidad; el resto del archivo sigue siendo material. `packDiscovery`
persiste `ruleVersion: 2` + `semantic: { hash, fileHashes }` conservando `hash`/`fileHashes` crudos, y
`checkDiscovery` usa la vista semántica sólo con `ruleVersion: 2` y forma válida; cualquier otro
estado —incluido un legacy sin `ruleVersion`— se compara crudo. `test/delta-spec-structure.test.js`
suma la detección de un `spec.md` de change activo fuera de `specs/<capability>/spec.md`.

En 0.28.0 `checkDiscovery` agrega un filtro simétrico de rutas efímeras: `isEphemeralSource` reconoce
`.discovery-map.json` sólo en la raíz y `.ancleto` / `.ancleto/**` (anclado, sin atrapar
`.ancletorc`, `.ancleto-notes.md` ni `src/ancleto/x.js`). El filtro se aplica a `stored.sources` y a
las rutas actuales antes de `computeImpact`, mientras los mapas de hashes quedan completos. Si el
hash global difiere, `isEphemeralOnlyChange` concede `READY` sólo cuando hay al menos una ruta
cambiada y todas son efímeras; cero rutas cambiadas sigue `STALE`, y un estado sin `fileHashes` sigue
`STALE`/`minor` con la nota exacta. El writer y `ruleVersion` no cambian, así que el rollback a
0.27.0 lee el mismo estado.

En 0.29.0 el mismo predicado se extiende a `documentation` / `documentation/**` y `audit logs` /
`audit logs/**`, anclados a la raíz. Ambas áreas están gitignored y no tienen archivos versionados;
el estado las conserva en `sources`/`fileHashes` (674+18 entradas) y `checkDiscovery` las excluye de
`changedAreas`, `materialReasons` y de la excusa de desvío de hash. `docs/**` y `aspec/**` siguen
contando. El writer, la forma del estado y `ruleVersion: 2` siguen intactos; no hay configuración
nueva y un lector 0.28.0 lee el mismo estado.

En 0.30.0 se corrige el matcher de `discovery.exclude`: `escapeRe` escapa `*` y `?`, y
`matchesGlob` traduce `**/`→`(?:.*/)?`, `/**`→`(?:/.*)?`, `**`→`.*`, `*`→`[^/]*` y
`?`→`[^/]`, con anclaje `^…$` si el patrón contiene `**` y `^(…)(?:/|$)` si no. Las exclusiones
`**/*.test.*` y `**/*.spec.*` vuelven a aplicarse: los 21 `test/*.test.js` de entonces salen de
`sources` (872→854) y los 7 fixtures siguen incluidos. `DEFAULT_IGNORES`, `outputDir`, el writer, la
forma del estado y `ruleVersion: 2` no cambian; no hay configuración nueva.

En 0.30.1 `src/cli/index.js` importa `escapeRe` y `matchesGlob` desde `src/core/discovery-glob.js`,
que además exporta `compileGlob` y cachea el `RegExp` en un `Map` por string exacto de glob. Sobre
9.669 evaluaciones el costo baja de 15,04 ms a 1,63 ms (9,2×), sin cambio de tokenización, anclaje ni
semántica. `DEFAULT_IGNORES`, `outputDir`, `packDiscovery`, `buildRepomixArgs`/`--ignore` de Repomix,
el writer, la forma del estado (`version: 1` + `ruleVersion: 2`) y `ruleVersion` no cambian, y no hay
delta de spec.

En 0.30.2 no cambia el runtime: el delta `MODIFIED` de `cli-diagnostics` del change
`discovery-state-schema-wording` alinea el texto canónico para distinguir el estado persistido
(`version: 1` + `ruleVersion: 2`) del `schemaVersion: 2` que emite `discovery --check`, y agrega un
pin de test no conductual. El change de conformidad `pin-offline-discovery-state` extrae
`buildDiscoveryState`/`renderDiscoveryState` a `src/core/discovery-state.js`, usados por
`packDiscovery`, con un golden byte-idéntico; el writer, la forma del estado y `ruleVersion: 2`
siguen intactos.

### Selección de tests afectados (0.32.0)

`affectedCommand` conserva el contrato de cuatro campos (`seeds`, `affected`, `unresolved`,
`externalCount`) y su comportamiento sin flags; el flag `--tests` es aditivo, implica JSON, nunca se
interpreta como semilla y agrega `tests` con `complete`, `reasons`, `selected` y `excluded`. El
cálculo delegado a `src/core/test-selection.js` es read-only (no escribe, no abre
`.ancleto/memory.db`, no usa red) y determinístico. El consumidor declarado es
`package.json` → `test:affected` (`node scripts/test-affected.mjs <archivos...>`): con
`complete === true` y selección no vacía ejecuta `node --test` con las rutas de `selected`; con
`complete === false`, plan ausente o selección vacía imprime `reasons` y cae a la suite completa
`node --test "test/*.test.js"`. No hay comando CLI nuevo ni cambio de exit codes: `affected` sigue
fuera del guard de `--help` (read-only) y el flag no altera `check`, `doctor`, `specs check` ni la
frescura del seed.

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
- **Aviso de bundle legacy (0.23.0)**: si el bundle **omite** la clave `mcp`
  (`manifest.mcp === undefined`), `import` emite por `stderr` un aviso **no bloqueante**
  (`ancleto: aviso: el bundle no declara intención MCP (formato previo); no se aplicará
  configuración MCP desde el bundle`). El exit code y la salida escrita no cambian: el bundle
  simplemente no aporta configuración MCP. Un `manifest.mcp: []` explícito es un estado moderno y
  **no** produce el aviso; un valor no-array sigue fallando con exit 1 como antes.
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

### Merge de specs (0.22.0–0.25.0)

`ancleto specs merge --change <slug> [--dry-run] [--json]` aplica el delta de un change sobre las
specs canónicas existentes. El módulo `src/core/specs-merge.js` es puro; el CLI resuelve rutas,
lee/escribe y reporta. 0.22.1 no agrega comandos ni flags: endurece el parser, el contenedor
`archive` y el espaciado de `ADDED`. 0.24.0 tampoco agrega flags: añade un guard canónica-only en la
fase de plan. 0.25.0 no cambia el módulo ni el CLI del comando: convierte a `specs merge` en la
única vía de sync de delta del archive y del bulk-archive.

1. `specsCommand(args)` desvía sólo `args[0] === 'merge'` a `specsMergeCommand`; cualquier otra
   invocación sigue a `specsCheckCommand`, por lo que `specs check` y `specs` sin argumentos
   conservan comportamiento y exit codes.
2. `--change <slug>` se valida con `isValidChangeSlug`: rechaza `..`, `/`, `\`, NUL y formas fuera
   de `^[A-Za-z0-9][A-Za-z0-9._-]*$` con exit 2.
3. `resolveChangeDir` busca el change activo en `aspec/changes/<slug>/` y el archivado en
   `aspec/changes/archive/YYYY-MM-DD-<slug>/`. 0 o ≥2 coincidencias son fail-closed (exit 2). El
   contenedor `aspec/changes/archive` nunca es un change: `--change archive`, o cualquier slug que
   resuelva a ese directorio, sale 2 con cero escrituras (también con `--dry-run`); la detección es
   por identidad de path, no por `proposal.md`.
4. `collectDeltaCapabilities` enumera `<changeDir>/specs/<capability>/spec.md`; si la capability no
   tiene `aspec/specs/<capability>/spec.md`, el error es fail-closed y **no se crea** la spec.
5. Fase 1: `mergeSpecText(delta, canonico)` computa el plan de todas las capabilities y acumula
   errores. Si hay al menos uno, `--json` emite `{ ok: false, ... }` y el proceso sale con exit 2
   sin escribir ningún archivo.
6. Fase 2: sin errores y sin `--dry-run`, escribe sólo los planes con `changed: true`. Un plan
   vacío no escribe y el `mtime` queda intacto. `--dry-run` reporta el plan sin escribir.
7. Salida: humano por capability con los tipos de operación, o `--json` con
   `{ ok, change, dryRun, capabilities, operations, changed, errors }`. Exit `0` en éxito/no-op,
   `1` por uso o I/O, `2` por fail-closed.

Reglas del merge (`src/core/specs-merge.js`):

- Matching **exacto** por título de `### Requirement:`; 0 o ≥2 coincidencias son error. Un heading
  `###` indentado o un bloque no reconocido también falla cerrado.
- El bloque de requirement termina en el próximo `##` o `###`, no en `#### Scenario:`. El delta
  admite **a lo sumo un** H1 a columna 0 al inicio, cualquiera sea su título, seguido de blancos
  opcionales y de la primera sección `##` reconocida; no hay allowlist literal. Un segundo H1 o una
  línea no vacía y no H1 antes de esa sección es fail-closed (exit 2, cero escrituras).
- `ADDED` inserta dentro de `## Requirements` con **exactamente una línea en blanco** entre el
  bloque y la siguiente sección `##` (o el EOF, sin blanco extra); idéntico es no-op, distinto es
  conflicto. `MODIFIED` reemplaza cuerpo y escenarios completos. `REMOVED` elimina y es no-op si ya
  no existe. `RENAMED` cambia el heading de `FROM` a `TO`; no-op si `TO` ya existe, conflicto si
  están ambos o ninguno, y exige `- FROM:`/`- TO:`. Un `## RENAMED Requirements` vacío es no-op
  válido (exit 0, `changed:false`, `mtime` intacto).
- La serialización conserva el EOL dominante del canónico (CRLF sólo si supera estrictamente a los
  LF sueltos) y recorta líneas en blanco finales; el mismo delta produce el mismo archivo.
- **Atomicidad acotada**: la validación del plan es fail-closed con cero escrituras, pero la fase
  de escritura es secuencial y no transaccional. Un error de I/O o una interrupción durante esa
  fase puede dejar escritos un prefijo de los specs del plan, sin rollback entre archivos. La spec
  declara la exclusión y no promete atomicidad fuera del plan.
- **Guard de heading de delta en la canónica (0.24.0)**: `mergeSpecText` valida primero la spec
  canónica completa con `findDeltaSectionHeadings` (`## ADDED Requirements`, `## MODIFIED
  Requirements`, `## REMOVED Requirements`, `## RENAMED Requirements` en columna 0). Si hay al menos
  uno, devuelve el texto original intacto y un error por heading; el CLI suma la capability y sale
  con exit 2 con **cero escrituras** en todo el lote, para los cuatro tipos de operación. Aplica a
  `--dry-run` (mismo exit 2, sin escribir) y `--json` reutiliza `ok:false`/`errors:[...]` sin campos
  nuevos. El guard **no** inspecciona el delta (`aspec/changes/**/specs/**`), donde esos headings son
  legítimos, y no repara la canónica: `copilot-support`, `legacy-import` y `test-profile` se
  normalizaron a `## Requirements` como higiene, sostenida por `test/content-guards.test.js`.
- No toca archivos delta, la carpeta del change, memoria, seed, `package.json`, `specs check`,
  `mergeLocked` ni el affected-set, y no crea capabilities nuevas. Desde 0.25.0 es la **única vía de
  escritura** de las specs canónicas durante el archive y el bulk-archive
  (`skills/ancleto-archive`, `skills/ancleto-bulk-archive`, `agents/documenter.md`): un exit no cero
  aborta el archive antes del preflight, la promoción y el move, y no se permite la edición manual.
  La skill standalone `skills/ancleto-sync-specs` no cambia y `/cleto-*` no invoca el comando.

`specsCheckCommand` sigue siendo el oráculo de keywords: `specIssues` exige `### Requirement:` y,
si hay `#### Scenario:`, exige `WHEN`/`THEN` y rechaza otros `####` que no sean `Scenario`. Un spec
traducido o con headings no canónicos puede fallar el merge; `specs check` es la señal temprana.

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
- **Reconciliación legacy y EOL (0.23.0)**: `reconcileLegacyBlocks` divide el contenido capturando
  el EOL de cada línea y re-join usando el EOL **propio de cada línea superviviente**, no el
  dominante del archivo; un archivo de EOL mixto no se normaliza al eliminar un run legacy. También
  preserva el estado de newline final de la entrada: la salida termina en newline si y sólo si la
  entrada terminaba en newline (sin newline final se eliminan todas las secuencias EOL finales del
  resultado). Cuando no se elimina ningún run (`removed === false`) el contenido se devuelve **byte
  a byte**, sin normalizar EOL. La semántica de qué líneas constituyen el run no cambia.
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
- **Conformidad 0.21.0**: el archive de un change de conformidad es no-op sobre
  `aspec/specs/**/*.md`, informa "sin delta" y valida la cita `spec:<capability>#<requirement>`
  fail-closed. No hay subcomando CLI `archive`; la aceptación vive en los contratos de
  `agents/`/`skills/` y en `test/content-guards.test.js`. La clasificación sólo es válida con cita
  resoluble y ausencia de bloques delta; la relevancia semántica es juicio de review.
- **Riesgo**: `.ancletorc` y `.ancleto/machine-env.md` son artefactos derivados gitignored; deben
  alinearse con `package.json` (`0.34.0`). No son fuentes del seed. Desde 0.28.0, `.ancleto/**` y
  `.discovery-map.json` raíz tampoco cuentan para la frescura del seed; desde 0.29.0, tampoco
  `documentation/**` y `audit logs/**` (gitignored, 0 tracked).
- **Conjunto crítico (0.31.0)**: `ancleto memory context` es la superficie explícita y falla con
  exit ≠ 0 nombrando la `memory_key` sin sobrescribir el archivo previo; el lifecycle
  (`init`/`install`/`upgrade`) y el on-write advierten sin escribir un bloque degradado, y
  `memory merge`/`memory consolidate --apply` salen ≠ 0 si el refresh falla. La lectura de
  `memory.criticalKeys` es tolerante (ausente/inválida → `[]`).
- **Merge de specs 0.22.0–0.22.1**: el fail-closed es por plan, no transaccional ante una caída de
  I/O a mitad de la escritura; el comando exige specs canónicos en inglés y no repara specs
  traducidos ni crea capabilities. El contenedor `archive` ya no se trata como change. Desde 0.25.0
  el archive depende de ese exit code: si el CLI no está disponible, el archive se detiene en vez de
  editar la canónica a mano.
- **Ayuda 0.25.0**: el guard sólo cubre los subcomandos declarados en `SUBCOMMAND_HELP` y el alias
  `list --projects`; el texto de uso es por comando y no reemplaza la ayuda global. `discovery`
  mantiene su propio handler y los comandos read-only no lo aplican.
- **Orden del archive 0.22.1**: la promoción corre antes del move y se documenta en `agents/` y
  `skills/`; no cambia `src/`. La aceptación depende de content guards, no de un subcomando CLI.

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point, subcomandos, instalación, descriptor y ruteo MCP por host, diagnósticos, salud MCP, nota de compresión, validación de bundles, `export`/`import`, `specs merge`, MCP, stats, estado del seed, hash semántico y filtro de rutas efímeras (`isEphemeralSource`/`isEphemeralOnlyChange`), extendido a `documentation/**` y `audit logs/**` (0.29.0); desde 0.30.1 importa el matcher de `discovery.exclude`; `memoryImport` implementa `--dry-run`/`--json` con clasificación read-only (0.34.0) |
| `src/core/discovery-glob.js` | `escapeRe`/`compileGlob`/`matchesGlob`: traducción glob→regex por tokens y caché `Map` del `RegExp` por string exacto de glob (0.30.1) |
| `src/core/discovery-state.js` | `buildDiscoveryState`/`renderDiscoveryState` puros: armado y serialización del estado persistido, usados por `packDiscovery` y pineados con golden byte-idéntico (0.30.2) |
| `src/core/test-selection.js` | `planTestSelection`: plan determinístico de tests sobre el affected-set, manifiesto cerrado y gate `complete` fail-closed (0.32.0) |
| `scripts/test-affected.mjs` | Consumidor `npm run test:affected`: ejecuta `selected` con `complete:true` o cae a la suite completa declarada (0.32.0) |
| `test/affected-tests.json` | Manifiesto cerrado `version: 1` de `always`/`couplings` para acoplamientos sin arista de import (0.32.0) |
| `src/core/specs-merge.js` | Merge puro de delta specs: `parseCanonicalSpec`, `parseDeltaSpec`, `mergeSpecText`, fail-closed y serialización |
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
| `aspec/changes/archive/2026-11-07-portability-legacy-bundle-advisory/` | Change archivado del aviso no bloqueante de bundle legacy sin `manifest.mcp` (0.23.0) |
| `aspec/changes/archive/2026-11-07-template-legacy-eol-preservation/` | Change archivado de la preservación de EOL por línea y newline final en `reconcileLegacyBlocks` (0.23.0) |
| `aspec/changes/archive/2026-11-08-agent-model-minimo-migration/` | Change archivado de la alineación de `TIERS.minimo`/`MINIMO_CHAIN` a `opencode-go/deepseek-v4.1-flash` y la cadena de dos candidatos (0.24.0) |
| `aspec/changes/archive/2026-11-08-specs-merge-canonical-guard/` | Change archivado del guard de headings de delta en la canónica y la normalización de `copilot-support`, `legacy-import` y `test-profile` (0.24.0) |
| `aspec/changes/archive/2026-11-08-archive-sync-via-specs-merge/` | Change archivado del ruteo del sync de delta del archive/bulk-archive por `specs merge` (0.25.0); delta de `prompt-contracts` |
| `aspec/changes/archive/2026-11-08-cli-subcommand-help-guards/` | Change archivado del guard de `--help`/`-h` en subcomandos que mutan estado (0.25.0); delta de `cli-diagnostics` |
| `aspec/changes/archive/2026-11-08-fix-discovery-seedmap-present/` | Change archivado de `seedMapPresent` state-independent (0.26.0); delta de `cli-diagnostics` |
| `aspec/changes/archive/2026-11-10-spec-seed-freshness-detector/` | Change archivado que documenta y pinea el detector de frescura de `discovery --check` (0.26.1, sin cambio de runtime) |
| `aspec/changes/archive/2026-11-10-align-freshness-recommended-action-spec/` | Change archivado que alinea `cli-diagnostics` al `recommendedAction` real (`generate` en `MISSING`, `complete` en `PARTIAL`) y lo pinea (0.26.x, sin cambio de runtime) |
| `aspec/changes/archive/2026-11-11-active-delta-structure-guard/` | Change archivado que agrega a la suite declarada el guard estructural de los delta specs de changes activos con `parseDeltaSpec` y documenta el Requirement en `spec-sync` (0.26.4, sin cambio de runtime) |
| `aspec/changes/archive/2026-11-11-seed-freshness-version-bump-not-material/` | Change archivado de 0.27.0: bump de `version` no material, estado con `ruleVersion: 2` + `semantic` y guard de `spec.md` mal ubicados (cambio de runtime en `src/cli/index.js`) |
| `aspec/changes/archive/2026-11-11-seed-freshness-ephemeral-paths/` | Change archivado de 0.28.0: filtro simétrico de rutas efímeras (`.ancleto/**`, `.discovery-map.json` raíz), excusa acotada del desvío de hash y writer/`ruleVersion` intactos (cambio de runtime en `src/cli/index.js`) |
| `aspec/changes/archive/2026-11-12-seed-freshness-ignored-areas/` | Change archivado de 0.29.0: extensión del filtro a `documentation/**` y `audit logs/**` anclados a la raíz, con `docs/**`/`aspec/**` aún contando y writer/`ruleVersion` intactos (cambio de runtime en `src/cli/index.js`) |
| `aspec/changes/archive/2026-11-12-discovery-exclude-glob-match/` | Change archivado de 0.30.0: `escapeRe`/`matchesGlob` traducen `discovery.exclude` por segmentos —entonces en `src/cli/index.js`—, `**/*.test.*`/`**/*.spec.*` vuelven a aplicar y `sources` baja 872→854; `DEFAULT_IGNORES`, `outputDir`, writer y `ruleVersion` intactos (delta `MODIFIED` de `cli-diagnostics`) |
| `aspec/changes/archive/2026-11-12-discovery-exclude-regexp-cache/` | Change archivado de 0.30.1: extrae `escapeRe`/`compileGlob`/`matchesGlob` a `src/core/discovery-glob.js` y cachea el `RegExp` por glob exacto (15,04 ms → 1,63 ms, 9,2× sobre 9.669 evaluaciones), sin cambio de semántica; ReDoS con `**` repetidos aceptado y DP por segmentos descartado (optimización, sin delta de spec) |
| `aspec/changes/archive/2026-11-12-discovery-state-schema-wording/` | Change archivado de 0.30.2: delta `MODIFIED` de `cli-diagnostics` que documenta el estado persistido `version: 1` + `ruleVersion: 2` frente a `schemaVersion: 2` de la salida de `--check`, con pin de test no conductual (sin cambio de runtime) |
| `aspec/changes/archive/2026-11-12-pin-offline-discovery-state/` | Change archivado de conformidad (sin delta ni bump): extrae `buildDiscoveryState`/`renderDiscoveryState` a `src/core/discovery-state.js`, usados por `packDiscovery`, con golden byte-idéntico en `test/cli.test.js` |
| `aspec/changes/archive/2026-11-13-ch-06b-affected-test-selection/` | Change archivado de 0.32.0: `ancleto affected --tests`, módulo `src/core/test-selection.js`, manifiesto `test/affected-tests.json` y consumidor `scripts/test-affected.mjs`; delta `ADDED` de `prompt-contracts` y cierre de `CH-06b` |
| `aspec/changes/archive/2026-11-12-mem-05-working-context-critical-set/` | Change archivado de 0.31.0: `memory.criticalKeys` en `.ancletorc`, inyección primero de las claves críticas y política de fallo (CLI explícita ≠ 0 sin sobrescribir; lifecycle/on-write con `console.warn`; `merge`/`consolidate --apply` ≠ 0); delta `ADDED` de `memory-engine` y `MODIFIED` del orden determinístico |
| `aspec/changes/archive/2026-11-06-specs-merge-hardening/` | Change archivado del endurecimiento de `specs merge` (0.22.1): contenedor `archive`, H1 estructural, `ADDED` y atomicidad acotada |
| `aspec/changes/archive/2026-11-06-ch-06a-specs-merge-deterministic/` | Change archivado del merge determinístico de specs y la capability `spec-sync` (0.22.0) |
| `aspec/changes/archive/2026-11-06-p0-pr5-archive-conformity/` | Change archivado del discriminador conformidad-vs-delta y archive sin delta (0.21.0; materializado por `upgrade`) |
| `aspec/changes/archive/2026-11-06-fix-repair-mcp-noop/` | Change archivado del predicado de escritura de `repairProjectMcp` (0.20.1) |
| `aspec/changes/archive/2026-11-05-host-neutral-bundle/` | Change archivado del bundle host-neutral (`export`/`import`) |
| `aspec/changes/archive/2026-11-05-mcp-host-write-routing/` | Change archivado del descriptor y ruteo de escritura MCP por host |
| `aspec/changes/archive/2026-11-05-mcp-oracle-residual-closure/` | Change archivado del texto del predicado y par global de `doctor` |
| `aspec/changes/archive/2026-11-05-mcp-command-health/` | Change archivado de salud MCP, descubrimiento único y avisos de check/import |
| `aspec/changes/archive/2026-11-04-check-doctor-state-parity/` | Change archivado de paridad de diagnósticos (H7/H13/H14) |
| `aspec/changes/archive/2026-11-04-host-compression-note-consistency/` | Change archivado de la nota de compresión y validación de `manifest.mcp` |
| `aspec/specs/cli-diagnostics/spec.md` | Requirements de deriva de versión, config MCP de `doctor`, salud MCP, avisos de `check`, aviso de `import`, `--help` sin ejecución (0.25.0), `seedMapPresent` state-independent (0.26.0), detector de frescura (0.26.1), `recommendedAction` `generate`/`complete` (0.26.x), regla normalizada `ruleVersion: 2`/`semantic` con bump de `version` no material (0.27.0), filtro simétrico de rutas efímeras (0.28.0), su extensión a `documentation/**`/`audit logs/**` (0.29.0), semántica por segmentos de `discovery.exclude` (0.30.0; 0.30.1 no cambia el contrato) y precisión 0.30.2 sobre el estado persistido (`version: 1` + `ruleVersion: 2`) frente a `schemaVersion: 2` de la salida |
| `aspec/specs/spec-sync/spec.md` | Requirements del merge determinístico, idempotencia, fail-closed, dry-run y alcance acotado; 0.22.1 agrega H1 estructural, contenedor `archive` y atomicidad acotada; 0.24.0 agrega el guard canónica-only de headings de delta para los cuatro tipos; 0.26.4 agrega la validación estructural de los deltas de changes activos en la suite declarada y 0.27.0 suma la detección de un `spec.md` de change activo fuera de `specs/<capability>/spec.md` |
| `aspec/specs/copilot-support/spec.md`, `aspec/specs/legacy-import/spec.md`, `aspec/specs/test-profile/spec.md` | Canónicas normalizadas a `## Requirements` (0.24.0) |
| `aspec/specs/memory-ops/spec.md` | Requirements de memoria y de la promoción de decisiones al archivar antes del move (0.22.1) |
| `aspec/specs/memory-engine/spec.md` | `Orden determinístico de inyección de reglas` (7 escenarios) y `Conjunto crítico estable del working-context` (0.31.0), incluida la política de fallo por superficie |
| `aspec/changes/archive/2026-11-06-archive-order-correctness/` | Change archivado del orden del archive y la semántica de fallo (0.22.1) |
| `aspec/specs/prompt-contracts/spec.md` | Requirements de conformidad-vs-delta y archive sin delta (0.21.0) y del sync de delta al archivar ruteado por `specs merge` (0.25.0) |
| `aspec/specs/agent-install-routing/spec.md` | Requirements de destinos nativos, ruteo MCP por host y compresión host-scoped |
| `aspec/specs/project-portability/spec.md` | Requirements de `export` host-neutral, `import` (MCP + `installedPaths`), reparación y nota de compresión |
| `aspec/specs/agent-model-tiers/spec.md` | Requirements de tiers, aviso free-on-primary, integridad y tier dormido |
