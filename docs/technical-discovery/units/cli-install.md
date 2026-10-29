---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, adaptación de frontmatter (incl. Command Code), merge de templates, commands como skills, wizard, MCP, portabilidad, entorno de máquina, sonda de invocabilidad de herramientas, superficie de shell por agente, stats failures, affected y las ops de memoria del CLI (snapshot, merge, doctor read-only, refresh on-write)"
covers:
  - instalación
  - AGENT_TARGETS
  - frontmatter
  - merge de templates
  - MCP
  - perfiles
  - export/import
  - affected
  - machine-env
  - sonda de invocabilidad
  - stats failures
  - memory snapshot
  - memory merge
  - memory doctor read-only
  - memory import refresh on-write
  - permisos de shell por agente
sources: ["src/cli/**", "src/core/adapters/**", "src/core/machine-env.js", "src/core/memory/snapshot.js"]
generatedAt: 2026-10-29T19:20:00Z
pluginVersion: 0.16.0
skillVersion: '2.3'
---

# Unidad: CLI de instalación y orquestación

## Propósito

`src/cli/index.js` es el **único entry point** (`bin.ancleto`/`bin.aspec`): parseo de
comandos, instalación de assets por host, resolución de agente/IDE, gestión de tiers, MCP,
discovery, memoria (incluyendo snapshot, merge, el refresh on-write desde el CLI y el chequeo
advisory de staleness), entorno de máquina, reporte de fallos, registro de proyectos y
diagnósticos. La adaptación de frontmatter es un módulo aparte
(`src/core/adapters/frontmatter.js`), `src/core/machine-env.js` posee el entorno local,
`src/core/memory/snapshot.js` posee la copia binaria y `src/cli/ui.js` aporta el wizard.
Evidencia: `package.json`, `src/cli/index.js`.

## Superficie de comandos

`install`, `update`, `upgrade`, `init`, `export` (`--tar`), `import` (`<bundle>`/`--repair`),
`discovery` (`--check` / pack), `affected` (read-only: `[--cwd <dir>] [--json] <archivo...>`),
`mcp`, `memory (context|list|doctor|export|import|gc|snapshot|merge)`,
`specs check`, `stats`, **`stats failures`** (`[--all] [--limit N] [--since YYYY-MM-DD]
[--session <id>] [--class <env|check|tool|unknown,...>] [--tool <t,...>] [--json]`),
`projects (list|scan|prune|info|update)`, `list --projects`, `check`, `doctor`, `--help`,
`--version`. Flags transversales: `--agent`, `--tier`, `--lang`, `--profile`, `--exclude`,
`--no-mcp`, `--with-engram`, `--yes` (solo importación openspec). Evidencia:
`src/cli/index.js`, `README.md`. `affected` delega en `computeAffectedSet`
(`src/core/affected-set.js`); es **read-only**. `stats failures` delega en
`statsFailuresCommand` y también es **read-only**.

**Escrituras de memoria del CLI**:

- `memory import <archivo>` (`memoryImport`) tras `engine.importNodes(json)` invoca
  `refreshWorkingContextOnWrite(engine, projectRoot)` dentro de un `try/catch` aislado.
- `memory snapshot --out <archivo.db> [--force] [--json]` (`memorySnapshot`) exige `--out`,
  comprueba que exista `.ancleto/memory.db` y delega en `snapshotDatabase`; imprime
  `{ out, bytes }` o un resumen legible. **No** toca la fuente ni el working-context.
- `memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]` (`memoryMerge`):
  parsea flags con `requiredMemoryFlag` (un valor vacío o que empieza con `--` cuenta como
  faltante), usa `createReadonlyMemoryEngine` en dry-run y `createMemoryEngine` en real. Tras un
  merge real refresca el working-context con la raíz derivada de
  `resolveMemoryProjectRoot(dbPath)`; si ese refresh falla, el merge ya está commiteado y el
  comando sale con código ≠ 0 informando el hecho y `ancleto memory context --out <ruta>`.
- `memory doctor` (`memoryDoctorCmd`) audita con `memoryDoctor` (read-only por defecto;
  `--rebuild` es el único camino que escribe) y agrega la línea **advisory**
  `Working-context: <ok|ausente|desactualizado>` usando `checkWorkingContextFreshness` con un
  engine read-only. El exit code sigue midiendo la integridad de la DB. Cuando no está `ok`
  sugiere `ancleto memory context --out`.

El refresh es **compare-based** y reusa la conexión abierta: reescribe
`.ancleto/working-context.md` solo si el bloque renderizado difiere del contenido en disco
(normalización CRLF/espacios/salto final). En `import`, si falla, la importación igual se
considera exitosa y el fallo se reporta por stderr.

Evidencia: `src/cli/index.js` (`memoryImport`, `memorySnapshot`, `memoryMerge`,
`memoryDoctorCmd`, `requiredMemoryFlag`), `src/core/memory/snapshot.js`,
`src/core/memory/working-context.js`, `aspec/specs/memory-ops/spec.md`.

## Modelo único de destinos por host (`AGENT_TARGETS`)

`AGENT_TARGETS` es la **fuente única de rutas**: cada host declara `skills`, `agents` y
`commands` con su `dir` y su convención de nombre (`ext`); `null` = asset no soportado por ese
host. `SUPPORTED_AGENTS = ['opencode','claude','vscode','antigravity','cursor','roo','copilot',
'commandcode']`; default `opencode`. `scanAgentFlag` valida `--agent` y `resolveAgent` prioriza
flag → `.ancletorc` (`agent`) → wizard TTY → default. Evidencia: `src/cli/index.js`.

| Host | Skills | Agents | Commands |
|---|---|---|---|
| `opencode` | `.opencode/skills` | `.opencode/agents/<n>.md` | `.opencode/commands/<n>.md` |
| `claude` | `.claude/skills` | `.claude/agents/<n>.md` | `.claude/commands/<n>.md` |
| `vscode` | `.github/skills` | `.github/agents/<n>.agent.md` | `.github/prompts/<n>.prompt.md` |
| `antigravity` | `.agents/skills` | `.agents/agents/<n>.md` | `.agents/skills/<n>/SKILL.md` (empaquetado como skill) |
| `cursor` | `.cursor/skills` | — (no soportado) | — (no soportado) |
| `roo` | `.roo/skills` | — (no soportado) | — (no soportado) |
| `copilot` | — (no soportado) | `.github/prompts/<n>.prompt.md` | `.github/prompts/<n>.prompt.md` |
| `commandcode` | `.commandcode/skills` | `.commandcode/agents/<n>.md` | `.commandcode/commands/<n>.md` |

- **Antigravity no tiene directorio de commands**: sus `/cleto-*` se materializan como
  **command-skills** dentro de `.agents/skills/<n>/SKILL.md` (`package: 'skill-dir'`).
- **Cursor y Roo: solo skills**. `.agents/skills` es punto de lectura compartido, no destino universal.
- **Copilot: host de prompts.** Agents y commands comparten `.github/prompts/` con ext
  `.prompt.md`; skills `null` → aviso `skip` no bloqueante. El tier nunca toca prompts.
- **Command Code: layout nativo por asset** bajo `.commandcode/` (skills identity, agents y
  commands con clave `ext`); MCP de proyecto en `.mcp.json`.
- **`installAgentAssets(projectDir, agent)`** (dueño único): materializa skills, agents y
  commands en el destino nativo del host y devuelve las rutas escritas. Un asset `null` dispara
  `warnUnsupportedAsset` → `skip <asset>: not supported by host '<host>'` (stderr, no
  bloqueante). Evidencia: `src/cli/index.js`.

## Adaptación de frontmatter (dueño único: `src/core/adapters/frontmatter.js`)

Módulo **puro**. Contrato público: `adaptFrontmatter(content, host, assetKind, name) → string`
(contenido completo con frontmatter adaptado + body verbatim). **Sin E/S, sin dependencias
externas, sin estado global mutable.** `parseFrontmatter` y `serializeFrontmatter` viven en el
módulo y se re-exportan para `commandToSkill`. Ningún otro punto del CLI transforma frontmatter.

### Dispatch

| host | skill/command | agents |
|---|---|---|
| `opencode` | identidad | identidad |
| `claude`, `vscode`, `copilot` | identidad | `dropManagedKeys` (dropea `AGENT_ADAPTER_DROP`) |
| `antigravity` | identidad | `adaptAntigravityFrontmatter` |
| `commandcode` | identidad | `adaptCommandCodeFrontmatter` |
| `cursor`, `roo` | identidad + aviso stderr | identidad + aviso |
| desconocido | identidad + aviso stderr | identidad + aviso |

`AGENT_ADAPTER_DROP = {mode, color, temperature, permission, model, tools}`. Copilot además
suma la nota de picker en el orchestrator (el tier no cambia modelos). Mensajes: `no documented
frontmatter adaptation for host '<host>'` (cursor/roo) y `unknown agent '<host>', passthrough`
(desconocido); ninguno aborta.

### Antigravity (`adaptAntigravityFrontmatter`)

Orden determinista: `name` (inyectado del nombre de archivo), `description`, `tools: [...]`
(siempre, aun `[]`), `mainAgent`, `subagent`, `model: inherit` (fijo),
`commandExecutionPolicy: sandbox` (fijo), `mcpServers` (preservado), `skills` (preservado) y
luego las claves extra. Las gestionadas se filtran y re-emiten **una sola vez**. `mode` →
flags: `primary` → (`mainAgent:true`, `subagent:false`); `subagent` → (`false`,`true`); sin
`mode` → (`true`,`true`).

Mapeo de tools (conjunto cerrado, `ANTIGRAVITY_TOOL_MAP`): `read`→`view_file`,
`edit`→`replace_file_content`, `grep`→`grep_search`, `bash`→`run_command`,
`todowrite`→`manage_task`. Cualquier otra clave del mapa `tools` **no se emite** y produce
aviso a stderr no bloqueante: `skip tool '<k>': no verified Antigravity id for agent '<n>'`. Un
id inexistente cuelga el subagent (Known Issue). El tool `skill` se saltea en silencio. El uso
de MCP se expresa por `mcpServers` / `.agents/mcp_config.json`; `call_mcp_tool` está prohibido.

### Command Code (`adaptCommandCodeFrontmatter`)

Adapta el frontmatter de opencode al de Command Code: `name` inyectado, `description`
preservado, `mode`/`color`/`temperature`/`permission` **eliminados** y `model` **omitido** (el
host hereda el modelo de sesión; nunca se mapea un id `opencode-go/*`). `tools` sale como
**lista** de ids verificados (`COMMANDCODE_TOOL_MAP`: `read`→`read_file`, `write`→`write_file`,
`edit`→`edit_file`, `bash`→`shell_command`, `grep`→`grep`, `glob`→`glob`,
`webfetch`→`web_fetch`, `websearch`→`web_search`, `todowrite`→`todo_write`). Las tools de
memoria se emiten con la convención MCP del host (`COMMANDCODE_MCP_TOOL_MAP` →
`mcp__ancleto-memory__<tool>`). Clave sin id verificado → aviso. **Inversión de default**:
`tools` omitido en Command Code significa "ninguna tool" (en opencode, "todas"), por eso un
origen sin `tools` emite `tools: "*"`. Evidencia: `src/core/adapters/frontmatter.js`,
`README.md`, `CHANGELOG.md` (`0.12.1`).

## Merge de templates y reconciliación (`mergeTemplateInto`)

`mergeTemplateInto(source, local, filename)` es el **punto único** de merge de los templates
raíz (`AGENTS.md`/`PRODUCT.md`, const `TEMPLATES`); lo invocan `install`/`update`/`upgrade`
(vía `copyTemplates`) **y** `import` (`importCmd`).

1. **Reconciliación previa** — `reconcileLegacyBlocks(content, filename)` elimina las firmas
   planas legadas registradas. Solo elimina con **coincidencia exacta** de las líneas firmadas
   (match por líneas completas, tolerando CRLF/espaciado); si la firma fue
   personalizada/extendida **avisa y no toca**. La firma acota el `filename` correcto; un
   archivo sin firma registrada es no-op. Idempotente.
2. **Merge LOCKED** — `mergeLocked(source, local, filename)` reemplaza el interior de cada
   bloque `<!-- LOCKED: name -->` con el del paquete, preserva el resto (EXTENSIBLE), inserta
   bloques nuevos en el ancla correcta (`findInsertAnchor`) y **no toca** el archivo si los tags
   faltan o están mal formados (avisa). Helpers: `extractLockedBlocks`, `replaceLockedBlock`.

Contrato (spec `prompt-contracts`): **NO SHALL existir una ruta que mergee `TEMPLATES` sin
reconciliar**. Evidencia: `src/cli/index.js`, `templates/AGENTS.md`,
`aspec/specs/prompt-contracts/spec.md`.

## Validación de frontmatter en `ancleto check`

`checkAgentsFrontmatter` recorre cada `.md` de un directorio de agents instalado, lee el origen y
el instalado, aplica `adaptFrontmatter(origen, host, 'agents', name)` y compara. En opencode
simula la sustitución de `model:` del tier (`applyTier`); en copilot + orchestrator suma
`COPILOT_MODEL_NOTE`. La divergencia se reporta como **warning (⚠), no bloqueante**; solo un
archivo faltante (✖) altera el exit code. El host de cada directorio se deriva del manifiesto
multi-host (`installedHostsFromPaths`). Evidencia: `src/cli/index.js`,
`aspec/specs/skill-frontmatter-adapters/spec.md`.

## Commands como skills (Antigravity)

`installCommandSkills` / `commandToSkill` leen `commands/*.md` y escriben
`.agents/skills/<base>/SKILL.md` con frontmatter `name: <base>` + `description` de origen y
**body verbatim**. No se registran en `installedPaths.commands` (queda vacío para antigravity):
el asset vive dentro del layout de skills. Evidencia: `src/cli/index.js`.

## MCP de host (`setupHostMcp`, dueño único)

- **Antigravity**: `.agents/mcp_config.json` con
  `{ "mcpServers": { "<n>": { "command", "args", "env" } } }`. Merge **no destructivo**.
- **Command Code**: `.mcp.json` con
  `{ "mcpServers": { "<n>": { "transport": "stdio", "command", "args", "env?" } } }`
  (`mergeCommandCodeMcp` en install, `refreshCommandCodeMcp` en upgrade). Merge no destructivo.
- **Copilot**: `copilot-mcp.json` (`mergeCopilotMcp` en install, `refreshCopilotMcp` en upgrade:
  regenera rotas y agrega ausentes sin tocar `copilot-instructions.md`).
- **Resto de hosts**: `mergeMcp` sobre `opencode.json` (targetDir = `.opencode` del proyecto o
  config global).
- **`init` configura MCP** igual que `install`, con el mismo dueño; `--no-mcp` es el escape.
  Defaults: `ancleto-memory` (stdio) y `caveman` si está en `PATH`; `engram` solo con
  `--with-engram`; `azure-devops` si `azure.enabled: true`. Evidencia: `src/cli/index.js`.

## Compresión host-scoped (caveman) — `token-budget`

- `buildDefaultMcp` da de alta el MCP de compresión (caveman) por defecto cuando su binario está
  disponible, como **configuración del host** (solo `opencode`/`antigravity`) vía `setupHostMcp`.
- **La directiva de uso es condicional al host**: `hostSupportsCompression` /
  `hostConfigHasCompression` leen la config MCP del host y deciden si materializar
  `CAVEMAN_USAGE_NOTE`; esa pista se escribe **solo** en superficies de un host que tiene la
  tool y **nunca** en texto compartido. Contrato: *donde no hay tool, no hay instrucción*.
- El default es **reversible a opt-in** mediante compuerta de medición con `ancleto stats`.
  Evidencia: `src/cli/index.js`, `aspec/specs/prompt-contracts/spec.md`.

## Entorno de máquina (`src/core/machine-env.js`)

Invariante: **entorno de la máquina → `.ancleto/machine-env.md`**. El módulo es el **único
dueño** de detección, render, escritura y exclusión; ni el ciclo de vida ni `check`
reimplementan formato, comparación o resolución de rutas git.

- **Ciclo de vida**: `init`, `install --project` y `upgrade` llaman a `refreshMachineEnv`, que
  envuelve `materializeMachineEnv` (nunca lanza; devuelve warnings no bloqueantes). `init` e
  `install` son silenciosos en el camino feliz; `upgrade` imprime `machine-env.md generado` /
  `sin cambios` y el estado de la exclusión.
- **Detección** (`detectMachineFacts`): plataforma, `osRelease`, `arch`, shell + `shell_source`,
  EOL + `eol_source`, disponibilidad de `rg`/`node`/`npm`/`git`/`python` y versión de ancleo. La
  disponibilidad de una herramienta exige ser **resoluble en `PATH` Y invocable**; la sonda usa
  una bandera de versión barata y **nunca** renderiza la versión observada ni su salida. No
  renderiza `PATH` ni secretos.
- **Sonda de invocabilidad**: `findExecutables` resuelve el candidato en `PATH` (en `win32`,
  extensiones de `PATHEXT` antes que el nombre exacto); `spawnProbe` lo **ejecuta** con
  `--version` y `probeExecutable` emite el veredicto. Presupuestos: `TOOL_PROBE_TIMEOUT_MS = 2000`
  por invocación y `TOOL_PROBE_BUDGET_MS = 10000` acumulados por corrida; `GIT_TIMEOUT_MS = 5000`
  para cada llamada a `git`. En `win32`, los shims `.cmd`/`.bat` se enrutan por
  `process.env.ComSpec` (`/d /s /c` + `windowsVerbatimArguments`) porque `spawnSync` directo
  devuelve `EINVAL` (guarda de Node, CVE-2024-27980); esa guarda es **inconclusa**, no
  `bloqueado`, y tampoco lo es un candidato que se abandona por presupuesto agotado. El
  veredicto `blocked` publica el fallo saneado como sufijo aditivo
  `- <tool>: no disponible — fallback: <X> — bloqueado: <fallo saneado>`; el texto viene de la
  primera línea de `stderr` o del error de arranque, sin ANSI/OSC ni caracteres de control, con
  espacios colapsados y tope de 200 caracteres (`FAILURE_TEXT_MAX`). Un veredicto inconcluso no
  lleva sufijo. La versión observada nunca se renderiza. Evidencia:
  `src/core/machine-env.js`, `aspec/specs/machine-environment/spec.md`,
  `test/machine-env.test.js`.
- **Shell**: en Windows prioriza MSYS/Cygwin (`MSYSTEM`/`CYGWIN`) → `bash`; `PSModulePath` con
  PowerShell 7 → `PowerShell 7`; `PROMPT` → `cmd`; `SHELL` POSIX + legacy → `unknown`; `SHELL`
  POSIX; solo legacy → `Windows PowerShell 5.1`; si no, `unknown`. `ComSpec` **no** se usa. En
  POSIX: `WSL_DISTRO_NAME`/`WSL_INTEROP` → `bash/WSL`, luego `SHELL` POSIX, luego `unknown`.
- **EOL**: primero `git check-attr eol` del path del artefacto; después `core.eol`,
  `core.autocrlf` (`true`→crlf, `input`/`false`→lf); sin repo/configuración, convención de
  plataforma (`win32`→crlf, resto→lf). La fuente queda declarada.
- **Escritura** (`writeMachineEnv`): compara ignorando `generated_at`; si no cambió, no
  reescribe ni toca el mtime. El archivo es derivado y se reemplaza completo.
- **Exclusión** (`ensureMachineEnvExclusion`): resuelve la raíz con
  `git rev-parse --show-toplevel`, el prefijo repo-root-relative con `--show-prefix` y compone
  `<prefix>.ancleto/machine-env.md` (normaliza `\`→`/`, sin `path.relative`). Consulta
  `check-ignore --no-index`; si no está ignorado, localiza `info/exclude` con
  `rev-parse --git-path`, preserva el contenido previo y agrega **una** línea; re-verifica con
  `check-ignore --no-index` y deriva `ignored`/`updated` de esa verificación. Nunca toca
  `.gitignore`. Si no hay repo/git, el prefijo es inválido (absoluto, `..`, CR/LF) o falla
  `check-ignore`, emite warning y no reporta la exclusión como garantizada.
- **`ancleto check`**: `checkMachineEnvTracked` usa `git ls-files --error-unmatch`; si el
  artefacto quedó trackeado, agrega un warning (sin cambiar el exit code) que sugiere
  `git rm --cached .ancleto/machine-env.md`.
- **Agentes**: los 10 `agents/*.md` contienen la instrucción canónica de leer el archivo antes
  de ejecutar comandos; `agents/orchestrator.md` agrega `## Machine Environment`, lo incluye
  verbatim en delegaciones con `bash: true` y exime esa lectura del techo de 3 archivos.

Evidencia: `src/core/machine-env.js`, `src/cli/index.js` (`refreshMachineEnv`,
`checkCommand`), `agents/*.md`, `aspec/specs/machine-environment/spec.md`.

## Superficie de shell de los agentes

El CLI no ejecuta comandos por sí mismo en nombre de los agentes: esa frontera vive en el
frontmatter de cada definición (`tools.bash` y `permission.bash`), que el CLI **copia verbatim**
al destino nativo del host (sólo adapta claves, no valores de permisos).

| Agente | Shell |
|---|---|
| `@orchestrator`, `@reviewer`, `@spec-writer`, `@memory-keeper` | `bash: false`. |
| `@coder`, `@tester`, `@documenter`, `@context-resolver`, `@technical-discovery`, `@technical-seed-writer` | `bash: true`. |
| `@technical-discovery` | `permission.bash` con `'*': deny` y **dos literales permitidos**: `'ancleto discovery --check'` y `'git status --short'`. |

El literal `git status --short` existe porque el **intake de sesión** del orquestador necesita el
estado del árbol y el orquestador no tiene shell: lo **delega** a `@technical-discovery` y usa su
salida tal cual, sólo cuando el pedido toca el estado del repositorio. Sumar ese literal a un rol
con `'*': deny` otorga estrictamente menos privilegio que enrutar el mismo comando a un agente con
`'*': allow`, y no amplía la superficie de escritura. El orquestador **nunca** ejecuta
`ancleto discovery --check`: delega ese chequeo de estado a `@technical-discovery`.

Evidencia: `agents/technical-discovery.md`, `agents/orchestrator.md` ("## Session Intake",
"Repository Reading Limit"), `aspec/specs/prompt-contracts/spec.md`,
`aspec/changes/archive/2026-10-26-orchestrator-session-start/proposal.md`.

## Reporte de fallos (`ancleto stats failures`)

- Lee en **solo lectura** la tabla `part` de la base de sesiones de opencode; considera fallo
  `state.status='error'` o `metadata.exit` presente y distinto de 0.
- Clasifica con precedencia `tool` (herramienta no-shell), `env` (shell con exit 127/9009 o
  señales de entorno/tooling), `check` (shell con exit ≥ 1 legítimo) y `unknown`.
- Agrupa por proyecto, herramienta, clase y **esqueleto estructural** del comando; orden
  determinístico; salida texto o `--json`.
- **Privacidad**: no imprime `title`, `output`, `state.error` ni `input` de herramientas no
  shell; enmascara secretos, rutas y wrappers (`stripWrapper`, `maskSensitive`, `maskPath`).
- Flags: `--all`, `--limit`, `--since`, `--session`, `--class`, `--tool`, `--json`.
- Es la superficie de medición de la mejora de `machine-env` (fallos `env`).

Evidencia: `src/cli/index.js` (`statsFailuresCommand`, `queryFailureBuckets`),
`aspec/specs/session-failure-report/spec.md`, `test/stats-failures.test.js`.

## Perfil `test` (overlay, `installProfileOverlay`)

Con `profile: test` (`--profile`, `test:playwright` como alias; `SUPPORTED_PROFILES =
general|test`; persistido en `.ancletorc`), `installProfileOverlay` reinstala
`profiles/test/agents` + `commands` sobre los destinos nativos del host (misma `ext` y mismo
adapter que la base), `copyTemplates` lee `profiles/test/templates/` (bloque LOCKED de
convenciones Playwright) y se crea `testspec/specs` + `testspec/changes` (`scaffoldTestspec`). El
paquete base queda intacto y el tier sigue ortogonal. Evidencia: `src/cli/index.js`,
`profiles/test/`.

## Portabilidad entre máquinas (`export` / `import`)

`exportCmd` agrupa portables (`.ancletorc`, templates, `aspec/`, `.opencode/{agents,commands,skills}`)
+ `manifest.json` (`format: ancleto-export/1`; MCP como intención nombre+tipo, nunca rutas;
aborta si hay absolutos) a directorio o `--tar`. Excluye `opencode.json`, `.ancleto-tier`,
`memory.db`, `service.json` y global. `importCmd` aplica portables, reinstala assets del host,
re-aplica el tier, **reconcilia y mergea templates** y **regenera** el MCP local
(`mcpCommandBroken` + `repairProjectMcp`: solo rotas/ausentes, nunca sanas), cerrando con
`doctor`. `import --repair` repara in place sin bundle. Wrapper `/cleto-transplant`. Evidencia:
`src/cli/index.js`.

## `check` / tier / `projects` host-aware

- **`localAgentDirs(rc, agent)`**: unión de `installedPaths.agents` ∪ destino del host.
- **`installedHostsFromPaths(ip)`**: deriva los hosts realmente instalados de `installedPaths`.
- **`check`**: el `expected` de un directorio de skills incluye los command-skills cuando algún
  host instalado empaqueta commands como skill (`package:'skill-dir'` y mismo `dir`), valida el
  frontmatter de agents contra el adaptador y advierte si `machine-env.md` está trackeado.
- **`installedExtFor`**: deriva la convención de nombre del host del mismo modelo de destino.
  Evidencia: `src/cli/index.js`.

## Flujo de alta (`initProject` / `install`)

1. Resuelve agente/IDE, tier, idioma y perfil; wizard interactivo en TTY.
2. `maybeImportOpenspec` (punto único antes del scaffold): clasifica `openspec/` con
   `detectLegacyOpenSpec` (`none`/`legacy`/`external`); legacy migra silencioso, externo pide
   confirmación (default No, `--yes` para script) e importa sin pisar el `AGENTS.md` local.
3. `copyTemplates` copia `AGENTS.md`/`PRODUCT.md` (del perfil si aplica) con
   `mergeTemplateInto` (reconciliación de bloques legados + `mergeLocked`).
4. `installAgentAssets` materializa skills/agents/commands en el destino nativo del host,
   delegando la adaptación en `adaptFrontmatter`; con perfil `test`, `installProfileOverlay`.
5. `scaffoldAspec` (+ `scaffoldTestspec` con perfil `test`) crean estructura sin pisar.
6. `applyTier` reescribe la línea `model:` de cada agente; resuelve `gratisModel` y lo guarda en
   `.ancletorc`. Paridad `init`/`install` en el tier guardado.
7. `setupHostMcp` configura el MCP del host de forma **no destructiva**; en `init` el MCP se
   resuelve **antes** de escribir los agents para materializar la directiva host-scoped.
8. `writeManifest` actualiza `.ancletorc` y `registerProject` anota el repo en
   `~/.config/ancleto/projects.json` (override: `ANCLETO_PROJECTS_FILE`).
9. `refreshWorkingContext` regenera `.ancleto/working-context.md` desde la memoria (o día-cero).
10. `refreshMachineEnv` genera/actualiza `.ancleto/machine-env.md` y garantiza su exclusión local
    (`info/exclude`), sin tocar `.gitignore`.

## Migración/importación `openspec/` → `aspec/`

- `migrateLegacyOpenspec(projectDir)`: no-op si no existe `openspec/` ni el marcador
  `.migrated-from-openspec`. Si `aspec/` ya tiene contenido real (al menos una entrada en
  `changes/` o `specs/`), avisa y **no migra**. Si migra, copia recursiva con `force: false`,
  escribe el marcador y conserva `openspec/` como backup.
- `detectLegacyOpenSpec`: `none` (ausente o carpeta vacía), `legacy` (resto) o `external`.
- `maybeImportOpenspec` es el punto único, invocado por `init`, `install --project` y `upgrade`.
  Evidencia: `src/cli/index.js`, `aspec/specs/aspec-bootstrap/spec.md`.

## Reglas y convenciones

- **Cero dependencias de runtime**: todo con `node:*` y `spawn`; UI de terminal con Raw Mode
  propio. ESLint es solo devDependency.
- **Idempotencia y no destrucción**: `init`/`install` no pisan config ni documentos del usuario;
  los bloques LOCKED se re-aplican, las superficies legadas se reconcilian y el resto se
  preserva. `installedPaths` es la unión de destinos escritos; no se borran rutas previas.
  `machine-env.md` se reemplaza completo solo si cambiaron los hechos.
- **Paridad `init`/`install`** en flags y tier guardado, incluido re-init sin flags.
- **`--check` no empaqueta**: state-only sobre hashes.
- **`ancleto affected` es read-only**: no escribe nada; delega el grafo de imports en
  `src/core/affected-set.js` y reporta `affected`/`unresolved`/`externalCount`.
- **`ancleto stats failures` es read-only**: no escribe la base de opencode; solo consulta.
- **`memory snapshot` no modifica la fuente** y **`memory doctor` no muta por defecto**;
  `--rebuild` es el único camino de escritura del doctor.
- **Refresh on-write CLI y staleness advisory son best-effort**:
  - `memoryImport` envuelve el refresh en `try/catch` y reporta el fallo por stderr sin abortar.
  - `memoryMerge` no revierte el merge si falla el refresh: sale ≠ 0 informando el estado real.
  - `memoryDoctorCmd` emite el staleness como **línea advisory** sin alterar el exit code.
- **`machine-env` es best-effort**: un fallo de generación o de exclusión se reporta como
  warning y no aborta el lifecycle; el artefacto ya escrito se conserva.
- **La sonda de invocabilidad está acotada** (2 s por intento, 10 s acumulados) y nunca declara
  `disponible` a un candidato inconcluso; los shims `.cmd`/`.bat` de `win32` se enrutan por
  `ComSpec` para que el veredicto sea de la herramienta y no del runtime.
- **Errores no bloqueantes**: binarios ausentes (MCP/git/gh/az), assets no soportados,
  divergencias de frontmatter y exclusiones no garantizadas se omiten con warning a stderr.
- `ancleto --version` lee `package.json` en runtime (no hardcodeado).

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point; `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `installAgentAssets`, `installAssetFiles`, `installProfileOverlay`, `installCommandSkills`, `setupHostMcp`, `mergeCommandCodeMcp`, `mergeCopilotMcp`, `hostSupportsCompression`/`hostConfigHasCompression`, `mergeTemplateInto`/`reconcileLegacyBlocks`/`mergeLocked`, `checkAgentsFrontmatter`, `exportCmd`/`importCmd`, `detectLegacyOpenSpec`, `localAgentDirs`, `installedHostsFromPaths`, `writeManifest`, `migrateLegacyOpenspec`, `refreshWorkingContext`/`memoryContext`, `refreshMachineEnv`, `memoryImport`, `memorySnapshot`, `memoryMerge`, `memoryDoctorCmd`, `memoryExport`/`memoryGc`, `affectedCommand`, `statsFailuresCommand`. |
| `src/core/adapters/frontmatter.js` | `adaptFrontmatter`, `parseFrontmatter`, `serializeFrontmatter`, `AGENT_ADAPTER_DROP`, `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`/`COMMANDCODE_MCP_TOOL_MAP`; dueño único de la transformación. |
| `src/core/machine-env.js` | Exporta `machineEnvPath`, `detectMachineFacts`, `renderMachineEnv`, `writeMachineEnv`, `ensureMachineEnvExclusion`, `materializeMachineEnv`, `checkMachineEnvTracked` y la constante `TOOL_PROBE_TIMEOUT_MS`; la sonda de invocabilidad es **interna** (`findExecutables`, `spawnProbe`, `probeExecutable`, `isBatchShim`, `comspecCommand`, `firstLine`, `fallbackFor`). Dueño único del entorno local. |
| `src/core/memory/snapshot.js` | `snapshotDatabase`; dueño único de la copia binaria consistente. |
| `src/core/memory/working-context.js` | `renderWorkingContextBlock`, `writeWorkingContext`/`writeWorkingContextBlock`, `shouldRefreshWorkingContext` (MCP), `refreshWorkingContextOnWrite` (CLI, compare-based), `checkWorkingContextFreshness`, `normalizeBlock`, `readWorkingContextFile`, `resolveMemoryProjectRoot` (día-cero). |
| `src/cli/ui.js` | Banner y menús TTY (`selectOption`, `selectMultiple`). |
| `templates/AGENTS.md`, `templates/PRODUCT.md` | Templates con bloques LOCKED (incl. `validation-commands`)/EXTENSIBLE. |
| `skills/*/SKILL.md` | Catálogo instalable; en agents el frontmatter se adapta por host, en skills se copia. |
| `test/cli.test.js`, `test/adapters-frontmatter.test.js`, `test/content-guards.test.js`, `test/working-context.test.js`, `test/machine-env.test.js`, `test/stats-failures.test.js`, `test/memory-pr1-contract.test.js` | Guardas del CLI, del adaptador, de contenido (incluye T01/T05/T22/T12/T13 del checkpoint de contrato y `## Decisiones`), del working-context, del entorno de máquina, del reporte de fallos y del contrato de PR-1. |
| `README.md`, `agents/orchestrator.md` | Contrato operativo y sección de entorno de máquina. |
| `aspec/changes/archive/2026-10-17-memory-cli-writes-refresh-working-context/` | Change archivado con proposal, design, tasks y delta spec. |
| `aspec/changes/archive/2026-10-25-machine-environment-block/` | Change archivado del entorno de máquina. |
| `aspec/changes/archive/2026-10-25-session-failure-report/` | Change archivado del reporte de fallos. |
| `aspec/changes/archive/2026-10-26-orchestrator-session-start/` | Change archivado del intake de sesión, el techo de lecturas y el aviso de overflow accionable. |
| `aspec/changes/archive/2026-10-28-reingenieria-memoria-first/` | Change archivado de PR-1: snapshot, doctor read-only y merge (publicado en `0.16.0`). |
| `aspec/changes/decisiones-y-contrato-checkpoint/` | Change activo (PR-2) de checkpoint de contrato y `## Decisiones`: toca `agents/orchestrator.md`, `agents/spec-writer.md`, seis `skills/**` y `test/content-guards.test.js`; sin cambios en `src/**`. |
| `agents/technical-discovery.md` | Allowlist de `bash` de dos literales (`ancleto discovery --check`, `git status --short`) sobre `'*': deny`. |
