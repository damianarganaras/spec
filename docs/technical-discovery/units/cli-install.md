---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, adaptación de frontmatter (incl. Command Code), merge de templates y reconciliación legacy, commands como skills, wizard, MCP, portabilidad, entorno de máquina, sonda de invocabilidad, superficie de shell por agente, stats failures, affected, las ops de memoria del CLI (snapshot, merge, consolidate, gc, doctor read-only) y la promoción al archivar"
covers:
  - instalación
  - AGENT_TARGETS
  - frontmatter
  - merge de templates
  - reconciliación legacy
  - MCP
  - perfiles
  - export/import
  - affected
  - machine-env
  - sonda de invocabilidad
  - stats failures
  - memory snapshot
  - memory merge
  - memory consolidate
  - memory gc
  - memory doctor read-only
  - refs de nodos activos
  - memory import refresh on-write
  - promoción al archivar
  - permisos de shell por agente
sources: ["src/cli/**", "src/core/adapters/**", "src/core/machine-env.js", "src/core/memory/snapshot.js"]
generatedAt: 2026-11-03T10:45:00Z
pluginVersion: 0.18.6
skillVersion: '2.3'
---

# Unidad: CLI de instalación y orquestación

## Propósito

`src/cli/index.js` es el **único entry point** (`bin.ancleto`/`bin.aspec`): parseo de comandos,
instalación de assets por host, resolución de agente/IDE, tiers, MCP, discovery, memoria
(incluyendo snapshot, merge, **consolidate**, **gc**, refresh on-write y staleness advisory),
entorno de máquina, reporte de fallos, registro de proyectos y diagnósticos. La adaptación de
frontmatter es un módulo aparte (`src/core/adapters/frontmatter.js`), `src/core/machine-env.js`
posee el entorno local, `src/core/memory/snapshot.js` la copia binaria y `src/cli/ui.js` el
wizard. Evidencia: `package.json`, `src/cli/index.js`.

## Superficie de comandos

`install`, `update`, `upgrade`, `init`, `export` (`--tar`), `import` (`<bundle>`/`--repair`),
`discovery` (`--check` / pack), `affected` (read-only: `[--cwd <dir>] [--json] <archivo...>`),
`mcp`, `memory (context|list|doctor|export|import|gc|snapshot|merge|consolidate)`,
`specs check`, `stats`, **`stats failures`**, `projects (list|scan|prune|info|update)`,
`list --projects`, `check`, `doctor`, `--help`, `--version`. Flags transversales: `--agent`,
`--tier`, `--lang`, `--profile`, `--exclude`, `--no-mcp`, `--with-engram`, `--yes` (sólo
importación openspec). Evidencia: `src/cli/index.js`, `README.md`.

**Versión del binario**: el `ancleto` global del `PATH` en esta máquina es **0.17.1**, más viejo
que `0.18.6`, y responde `subcomando de memory desconocido: consolidate`; la versión del checkout
se invoca con `node src/cli/index.js`. La comparación de capacidades debe hacerse contra
`package.json` y la invocación local.

**Resolver de refs (`MEM-04b`)**: `resolveNodeRefs` vive en `src/core/memory/engine.js` y **no**
es un subcomando del CLI ni una tool MCP. Está publicado en `0.18.3`; el harness golden lo
consume y queda disponible para el recall. El CLI no expone una superficie nueva por este change.

**Escrituras de memoria del CLI**:

- `memory import <archivo>` (`memoryImport`) tras `engine.importNodes(json)` invoca
  `refreshWorkingContextOnWrite(engine, projectRoot)` dentro de un `try/catch` aislado. El
  import **no** pasa por `recordNode`: conserva LWW y **no** valida refs.
- `memory snapshot --out <archivo.db> [--force] [--json]` (`memorySnapshot`) exige `--out`,
  comprueba que exista `.ancleto/memory.db` y delega en `snapshotDatabase`; imprime
  `{ out, bytes }` o un resumen. **No** toca la fuente ni el working-context.
- `memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]` (`memoryMerge`):
  parsea flags con `requiredMemoryFlag` (un valor vacío o que empieza con `--` cuenta como
  faltante), usa `createReadonlyMemoryEngine` en dry-run y `createMemoryEngine` en real. Tras un
  merge real refresca el working-context con la raíz derivada de `resolveMemoryProjectRoot(dbPath)`;
  si falla, el merge ya está commiteado y sale ≠ 0 informando el hecho y cómo regenerar.
- `memory consolidate [--dry-run] [--apply] [--json]` (`memoryConsolidate`): `--dry-run` es el
  default; `--apply` es el único camino que escribe. Rechaza `--apply` junto con `--dry-run`.
  Dry-run usa `createReadonlyMemoryEngine`; `--apply` usa `createMemoryEngine`, imprime el
  reporte (grupos exactos, canónico, superseded y near-dups) y refresca el working-context. Si el
  refresh falla, la consolidación **ya se aplicó** y el comando sale ≠ 0 informándolo.
- `memory gc [--dry-run] [--days N]` (`memoryGc`): mide la **edad de supersesión**
  (`COALESCE(superseded_at, created_at)`) con un cutoff único. `--dry-run` sólo reporta;
  el purge real limpia `superseded_by` de los elegibles y luego borra en transacción, con
  `VACUUM`+`REINDEX` best-effort. **No** refresca el working-context (los activos no cambian).
- `memory doctor` (`memoryDoctorCmd`) audita con `memoryDoctor` (read-only por defecto;
  `--rebuild` es el único camino que escribe) y reporta **cinco checks** en orden:
  `Integridad DB`, `Indice FTS5`, `Reglas activas (unicidad)`, `Refs de nodos activos` y
  `Checkpoint WAL`. El check de refs usa `inspectRefs` (read-only; mismo parser y resolución que
  `recordNode`) y reporta las refs `spec:`/`change:`/`path:` no resueltas con su `memory_key`;
  `commit:`/`workitem:` se cuentan aparte. Agrega la línea **advisory**
  `Working-context: <ok|ausente|desactualizado>` con `checkWorkingContextFreshness`. El exit code
  sigue midiendo la integridad de la DB.

**Estado observado** (`node src/cli/index.js memory doctor`): integridad OK, **228 filas FTS
indexadas** (228 nodos totales), unicidad OK, **344 refs verificadas en 125 nodos activos, 0 no
resueltas**, WAL presente y `Working-context: desactualizado`; el bloque proactivo omite **20
reglas**. La consolidación dry-run devuelve `{ exactGroups: [], nearDuplicates: [] }`.

El refresh es **compare-based** y reusa la conexión abierta: reescribe
`.ancleto/working-context.md` sólo si el bloque renderizado difiere del contenido en disco. En
`import`, si falla, la importación igual se considera exitosa y el fallo se reporta por stderr.

**Escritura MCP**: el server fija `source: 'mcp:ancleto-memory'` y `projectRoot` al crear los
handlers (`src/core/memory/mcp-server.js`); por eso las escrituras MCP pasan por la validación
fail-closed de refs de `recordNode` (salvo procedencia `runtime`). El CLI no reimplementa esa
validación: sólo el import la evita por usar `importNodes`.

Evidencia: `src/cli/index.js`, `src/core/memory/snapshot.js`,
`src/core/memory/working-context.js`, `src/core/memory/engine.js`,
`aspec/specs/memory-ops/spec.md`, `aspec/specs/memory-engine/spec.md`.

## Promoción al archivar (delegación del CLI/skill)

El CLI no promueve memoria por sí mismo: la promoción es un contrato de cierre que vive en la
skill y los agentes, y escribe a través del MCP/engine:

1. `skills/ancleto-archive/SKILL.md` hace el **preflight del lote** (`## Decisiones` con
   `memory_key` propia y `Estado: aprobado`, refs resolubles, sin `path:` dentro del change, sin
   candidatos de sesión). Cualquier violación ⇒ **cero escrituras** y el change no se mueve.
2. Sin candidatos ⇒ **cero escrituras y cero delegación**.
3. Con candidatos, el orquestador delega **una** pasada de `@memory-keeper` en modo Promotion;
   ella escribe un `recordDecision` por bloque (nunca `recordRule`).
4. La promoción corre **después** de que `@documenter` termina el merge de specs y **nunca en
   paralelo**, para que `spec:` resuelva contra la fuente de verdad.

El archive **mueve el directorio sin modificarlo**: desde el retiro de `design.md`/`context.md`
ya no borra `context.md` ni ningún scaffold legacy. Evidencia: `skills/ancleto-archive/SKILL.md`,
`aspec/specs/prompt-contracts/spec.md`, `agents/memory-keeper.md`, `agents/orchestrator.md`.

## Modelo único de destinos por host (`AGENT_TARGETS`)

`AGENT_TARGETS` es la **fuente única de rutas**: cada host declara `skills`, `agents` y
`commands` con `dir` y `ext`; `null` = no soportado. `SUPPORTED_AGENTS =
['opencode','claude','vscode','antigravity','cursor','roo','copilot','commandcode']`; default
`opencode`. `scanAgentFlag` valida `--agent` y `resolveAgent` prioriza flag → `.ancletorc`
(`agent`) → wizard TTY → default. Evidencia: `src/cli/index.js`.

| Host | Skills | Agents | Commands |
|---|---|---|---|
| `opencode` | `.opencode/skills` | `.opencode/agents/<n>.md` | `.opencode/commands/<n>.md` |
| `claude` | `.claude/skills` | `.claude/agents/<n>.md` | `.claude/commands/<n>.md` |
| `vscode` | `.github/skills` | `.github/agents/<n>.agent.md` | `.github/prompts/<n>.prompt.md` |
| `antigravity` | `.agents/skills` | `.agents/agents/<n>.md` | `.agents/skills/<n>/SKILL.md` (skill) |
| `cursor` | `.cursor/skills` | — | — |
| `roo` | `.roo/skills` | — | — |
| `copilot` | — | `.github/prompts/<n>.prompt.md` | `.github/prompts/<n>.prompt.md` |
| `commandcode` | `.commandcode/skills` | `.commandcode/agents/<n>.md` | `.commandcode/commands/<n>.md` |

- **Antigravity no tiene directorio de commands**: sus `/cleto-*` se materializan como
  **command-skills** dentro de `.agents/skills/<n>/SKILL.md` (`package: 'skill-dir'`).
- **Cursor y Roo: sólo skills**. `.agents/skills` es punto de lectura compartido, no destino
  universal.
- **Copilot: host de prompts.** Agents y commands comparten `.github/prompts/` con `.prompt.md`;
  skills `null` → aviso `skip` no bloqueante. El tier nunca toca prompts.
- **Command Code: layout nativo por asset** bajo `.commandcode/` (skills identity, agents y
  commands con `ext`); MCP de proyecto en `.mcp.json`.
- **`installAgentAssets(projectDir, agent)`** (dueño único): materializa skills, agents y commands
  y devuelve las rutas. Un asset `null` dispara `warnUnsupportedAsset` → `skip <asset>: not
  supported by host '<host>'` (stderr, no bloqueante). Evidencia: `src/cli/index.js`.

## Adaptación de frontmatter (dueño único: `src/core/adapters/frontmatter.js`)

Módulo **puro**. Contrato público: `adaptFrontmatter(content, host, assetKind, name) → string`
(frontmatter adaptado + body verbatim). **Sin E/S, sin dependencias externas, sin estado global
mutable.** `parseFrontmatter` y `serializeFrontmatter` viven en el módulo y se re-exportan para
`commandToSkill`. Ningún otro punto del CLI transforma frontmatter.

### Dispatch

| host | skill/command | agents |
|---|---|---|
| `opencode` | identidad | identidad |
| `claude`, `vscode`, `copilot` | identidad | `dropManagedKeys` (dropea `AGENT_ADAPTER_DROP`) |
| `antigravity` | identidad | `adaptAntigravityFrontmatter` |
| `commandcode` | identidad | `adaptCommandCodeFrontmatter` |
| `cursor`, `roo` | identidad + aviso stderr | identidad + aviso |
| desconocido | identidad + aviso stderr | identidad + aviso |

`AGENT_ADAPTER_DROP = {mode, color, temperature, permission, model, tools}`. Copilot además suma
la nota de picker en el orchestrator (el tier no cambia modelos). Mensajes: `no documented
frontmatter adaptation for host '<host>'` (cursor/roo) y `unknown agent '<host>', passthrough`
(desconocido); ninguno aborta.

### Antigravity (`adaptAntigravityFrontmatter`)

Orden determinista: `name` (inyectado del archivo), `description`, `tools: [...]` (siempre, aun
`[]`), `mainAgent`, `subagent`, `model: inherit` (fijo), `commandExecutionPolicy: sandbox`
(fijo), `mcpServers` (preservado), `skills` (preservado) y luego las claves extra. Las
gestionadas se filtran y re-emiten **una sola vez**. `mode`: `primary` → (`mainAgent:true`,
`subagent:false`); `subagent` → (`false`,`true`); sin `mode` → (`true`,`true`).

Mapeo de tools (conjunto cerrado, `ANTIGRAVITY_TOOL_MAP`): `read`→`view_file`,
`edit`→`replace_file_content`, `grep`→`grep_search`, `bash`→`run_command`,
`todowrite`→`manage_task`. Cualquier otra clave **no se emite** y produce aviso no bloqueante:
`skip tool '<k>': no verified Antigravity id for agent '<n>'`. Un id inexistente cuelga el
subagent. `skill` se saltea en silencio. `call_mcp_tool` está prohibido; el MCP se expresa por
`mcpServers` / `.agents/mcp_config.json`.

### Command Code (`adaptCommandCodeFrontmatter`)

Adapta opencode al frontmatter de Command Code: `name` inyectado, `description` preservado,
`mode`/`color`/`temperature`/`permission` **eliminados** y `model` **omitido** (hereda el modelo
de sesión; nunca se mapea `opencode-go/*`). `tools` sale como **lista** verificada
(`COMMANDCODE_TOOL_MAP`: `read`→`read_file`, `write`→`write_file`, `edit`→`edit_file`,
`bash`→`shell_command`, `grep`→`grep`, `glob`→`glob`, `webfetch`→`web_fetch`,
`websearch`→`web_search`, `todowrite`→`todo_write`). Las tools de memoria usan
`mcp__ancleto-memory__<tool>`. Clave sin id → aviso. **Inversión de default**: `tools` omitido en
Command Code significa "ninguna tool", por eso un origen sin `tools` emite `tools: "*"`.
Evidencia: `src/core/adapters/frontmatter.js`, `README.md`, `CHANGELOG.md` (`0.12.1`).

## Merge de templates y reconciliación (`mergeTemplateInto`)

`mergeTemplateInto(source, local, filename)` es el **punto único** de merge de `AGENTS.md` y
`PRODUCT.md`; lo invocan `install`/`update`/`upgrade` (vía `copyTemplates`) **y** `import`.

1. **Reconciliación previa** — `reconcileLegacyBlocks(content, filename, source)` elimina las
   firmas planas legadas registradas. Sólo elimina con **coincidencia exacta** de las líneas
   firmadas (tolerando CRLF/espaciado); si la firma fue personalizada/extendida **avisa y no
   toca**. La firma acota el `filename` correcto; un archivo sin firma registrada es no-op.
   `requiresInSource` restringe la firma al template que puede reemplazarla: si el `source` no
   trae el reemplazo canónico, el run legado **no se borra** (nunca se deja el archivo sin la
   sección). `maskLockedLines` excluye de la búsqueda las líneas dentro de bloques `LOCKED` y de
   code fences: el heading legado repetido en el bloque canónico no dispara un aviso falso y un
   snippet documentado no es contenido a migrar. Idempotente.
2. **Merge LOCKED** — `mergeLocked(source, local, filename)` reemplaza el interior de cada
   `<!-- LOCKED: name -->` con el del paquete, preserva el resto (EXTENSIBLE), inserta bloques
   nuevos en el ancla correcta (`findInsertAnchor`) y **no toca** el archivo si los tags faltan
   o están mal formados (avisa). Un bloque nuevo se inserta al inicio de línea, separado de sus
   vecinos por **exactamente una línea en blanco** (antes de un bloque existente y al final del
   archivo), de modo que dos inserciones consecutivas no queden pegadas. Helpers:
   `extractLockedBlocks`, `replaceLockedBlock`.

Contrato (spec `prompt-contracts`): **NO SHALL existir una ruta que mergee `TEMPLATES` sin
reconciliar**. Evidencia: `src/cli/index.js`, `templates/AGENTS.md`,
`aspec/specs/prompt-contracts/spec.md`.

## Validación de frontmatter en `ancleto check`

`checkAgentsFrontmatter` recorre cada `.md` de un directorio de agents instalado, lee el origen y
el instalado, aplica `adaptFrontmatter(origen, host, 'agents', name)` y compara. En opencode
simula la sustitución de `model:` del tier (`applyTier`); en copilot + orchestrator suma
`COPILOT_MODEL_NOTE`. La divergencia se reporta como **warning (⚠), no bloqueante**; sólo un
faltante (✖) altera el exit code. El host de cada directorio se deriva del manifiesto multi-host
(`installedHostsFromPaths`). Evidencia: `src/cli/index.js`,
`aspec/specs/skill-frontmatter-adapters/spec.md`.

## Commands como skills (Antigravity)

`installCommandSkills` / `commandToSkill` leen `commands/*.md` y escriben
`.agents/skills/<base>/SKILL.md` con frontmatter `name: <base>` + `description` de origen y
**body verbatim**. No se registran en `installedPaths.commands`: el asset vive dentro del layout
de skills. Evidencia: `src/cli/index.js`.

## MCP de host (`setupHostMcp`, dueño único)

- **Antigravity**: `.agents/mcp_config.json` con
  `{ "mcpServers": { "<n>": { "command", "args", "env" } } }`. Merge **no destructivo**.
- **Command Code**: `.mcp.json` con
  `{ "mcpServers": { "<n>": { "transport": "stdio", "command", "args", "env?" } } }`
  (`mergeCommandCodeMcp` en install, `refreshCommandCodeMcp` en upgrade).
- **Copilot**: `copilot-mcp.json` (`mergeCopilotMcp` en install, `refreshCopilotMcp` en upgrade:
  regenera rotas y agrega ausentes sin tocar `copilot-instructions.md`).
- **Resto**: `mergeMcp` sobre `opencode.json` (targetDir = `.opencode` del proyecto o global).
- **`init` configura MCP** igual que `install`; `--no-mcp` es el escape. Defaults:
  `ancleto-memory` (stdio) y `caveman` si está en `PATH`; `engram` sólo con `--with-engram`;
  `azure-devops` si `azure.enabled: true`. Evidencia: `src/cli/index.js`.

## Compresión host-scoped (caveman)

- `buildDefaultMcp` da de alta el MCP de compresión por defecto cuando su binario está
  disponible, como **configuración del host** (sólo `opencode`/`antigravity`) vía `setupHostMcp`.
- **La directiva es condicional al host**: `hostSupportsCompression` /
  `hostConfigHasCompression` leen la config MCP y deciden si materializar `CAVEMAN_USAGE_NOTE`;
  se escribe **sólo** en superficies del host que tiene la tool y **nunca** en texto compartido.
  Contrato: *donde no hay tool, no hay instrucción*.
- El default es **reversible a opt-in** mediante compuerta de medición con `ancleto stats`.
  Evidencia: `src/cli/index.js`, `aspec/specs/prompt-contracts/spec.md`.

## Entorno de máquina (`src/core/machine-env.js`)

Invariante: **entorno de la máquina → `.ancleto/machine-env.md`**. El módulo es el **único
dueño** de detección, render, escritura y exclusión; ni el lifecycle ni `check` reimplementan
formato, comparación o rutas git.

- **Ciclo de vida**: `init`, `install --project` y `upgrade` llaman a `refreshMachineEnv`, que
  envuelve `materializeMachineEnv` (nunca lanza; devuelve warnings no bloqueantes).
- **Detección** (`detectMachineFacts`): plataforma, `osRelease`, `arch`, shell + `shell_source`,
  EOL + `eol_source`, disponibilidad de `rg`/`node`/`npm`/`git`/`python` y versión de ancleo. La
  disponibilidad exige ser **resoluble en `PATH` Y invocable**; la sonda usa `--version` y
  **nunca** renderiza la versión observada ni su salida. No renderiza `PATH` ni secretos.
- **Sonda de invocabilidad**: `findExecutables` resuelve el candidato (en `win32`, extensiones de
  `PATHEXT` antes que el nombre exacto); `spawnProbe` lo ejecuta y `probeExecutable` emite el
  veredicto. Presupuestos: `TOOL_PROBE_TIMEOUT_MS = 2000` por invocación,
  `TOOL_PROBE_BUDGET_MS = 10000` acumulados y `GIT_TIMEOUT_MS = 5000` para cada `git`. En
  `win32` los shims `.cmd`/`.bat` se enrutan por `process.env.ComSpec` (`/d /s /c` +
  `windowsVerbatimArguments`) porque `spawnSync` directo devuelve `EINVAL` (CVE-2024-27980); esa
  guarda es **inconclusa**, no `bloqueado`, y tampoco lo es un candidato abandonado por
  presupuesto. El veredicto `blocked` publica el fallo saneado como sufijo aditivo
  `- <tool>: no disponible — fallback: <X> — bloqueado: <fallo saneado>`; el texto viene de la
  primera línea de `stderr` o del error de arranque, sin ANSI/OSC ni controles, espacios
  colapsados y tope de 200 caracteres (`FAILURE_TEXT_MAX`). Un inconcluso no lleva sufijo.
- **Shell**: en Windows prioriza MSYS/Cygwin → `bash`; `PSModulePath` con PowerShell 7 →
  `PowerShell 7`; `PROMPT` → `cmd`; `SHELL` POSIX + legacy → `unknown`; `SHELL` POSIX; sólo
  legacy → `Windows PowerShell 5.1`; si no, `unknown`. `ComSpec` no se usa. En POSIX:
  `WSL_DISTRO_NAME`/`WSL_INTEROP` → `bash/WSL`, luego `SHELL` POSIX, luego `unknown`.
- **EOL**: primero `git check-attr eol` del path; después `core.eol`, `core.autocrlf`
  (`true`→crlf, `input`/`false`→lf); sin repo/configuración, convención de plataforma. La fuente
  queda declarada.
- **Escritura** (`writeMachineEnv`): compara ignorando `generated_at`; si no cambió, no reescribe
  ni toca el mtime. El archivo es derivado y se reemplaza completo.
- **Exclusión** (`ensureMachineEnvExclusion`): resuelve la raíz con `git rev-parse
  --show-toplevel`, el prefijo con `--show-prefix` y compone `<prefix>.ancleto/machine-env.md`
  (normaliza `\`→`/`, sin `path.relative`). Consulta `check-ignore --no-index`; si no está
  ignorado, localiza `info/exclude` con `rev-parse --git-path`, preserva el contenido y agrega
  **una** línea; re-verifica y deriva `ignored`/`updated` de esa verificación. Nunca toca
  `.gitignore`. Si no hay repo/git, el prefijo es inválido o falla `check-ignore`, emite warning.
- **`ancleto check`**: `checkMachineEnvTracked` usa `git ls-files --error-unmatch`; si quedó
  trackeado, agrega un warning (sin cambiar el exit code) que sugiere `git rm --cached`.
- **Agentes**: los 10 `agents/*.md` contienen la instrucción de leer el archivo antes de ejecutar
  comandos; `agents/orchestrator.md` agrega `## Machine Environment`, lo incluye verbatim en
  delegaciones con `bash: true` y exime esa lectura del techo de 3 archivos.

Evidencia: `src/core/machine-env.js`, `src/cli/index.js`, `agents/*.md`,
`aspec/specs/machine-environment/spec.md`.

## Superficie de shell de los agentes

El CLI no ejecuta comandos en nombre de los agentes: esa frontera vive en el frontmatter de cada
definición (`tools.bash` y `permission.bash`), que el CLI copia verbatim (sólo adapta claves).

| Agente | Shell |
|---|---|
| `@orchestrator`, `@reviewer`, `@spec-writer`, `@memory-keeper` | `bash: false`. |
| `@coder`, `@tester`, `@documenter`, `@context-resolver`, `@technical-discovery`, `@technical-seed-writer` | `bash: true`. |
| `@technical-discovery` | `permission.bash` con `'*': deny` y **dos literales**: `'ancleto discovery --check'` y `'git status --short'`. |

El literal `git status --short` existe porque el **intake de sesión** necesita el estado del
árbol y el orquestador no tiene shell: lo **delega** a `@technical-discovery` y usa su salida
tal cual, sólo cuando el pedido toca el estado del repositorio. Sumar ese literal a un rol con
`'*': deny` otorga menos privilegio que enrutar el comando a un agente con `'*': allow`. El
orquestador **nunca** ejecuta `ancleto discovery --check`: delega el chequeo a
`@technical-discovery`.

Evidencia: `agents/technical-discovery.md`, `agents/orchestrator.md`,
`aspec/specs/prompt-contracts/spec.md`.

## Reporte de fallos (`ancleto stats failures`)

- Lee en **solo lectura** la tabla `part` de opencode; considera fallo `state.status='error'` o
  `metadata.exit` presente y distinto de 0.
- Clasifica con precedencia `tool` (no-shell), `env` (shell con exit 127/9009 o señales de
  entorno), `check` (shell con exit ≥ 1 legítimo) y `unknown`.
- Agrupa por proyecto, herramienta, clase y **esqueleto estructural**; orden determinístico;
  salida texto o `--json`.
- **Privacidad**: no imprime `title`, `output`, `state.error` ni `input` de no-shell; enmascara
  secretos, rutas y wrappers (`stripWrapper`, `maskSensitive`, `maskPath`).
- Flags: `--all`, `--limit`, `--since`, `--session`, `--class`, `--tool`, `--json`.
- Es la superficie de medición de la mejora de `machine-env` (fallos `env`).

Evidencia: `src/cli/index.js` (`statsFailuresCommand`, `queryFailureBuckets`),
`aspec/specs/session-failure-report/spec.md`, `test/stats-failures.test.js`.

## Perfil `test` (overlay, `installProfileOverlay`)

Con `profile: test` (`--profile`, `test:playwright` como alias; `SUPPORTED_PROFILES =
general|test`; persistido en `.ancletorc`), `installProfileOverlay` reinstala
`profiles/test/agents` + `commands` sobre los destinos nativos (misma `ext` y adapter),
`copyTemplates` lee `profiles/test/templates/` (bloque LOCKED de convenciones Playwright) y se
crea `testspec/specs` + `testspec/changes` (`scaffoldTestspec`). El paquete base queda intacto y
el tier sigue ortogonal. Evidencia: `src/cli/index.js`, `profiles/test/`.

## Portabilidad entre máquinas (`export` / `import`)

`exportCmd` agrupa portables (`.ancletorc`, templates, `aspec/`, `.opencode/{agents,commands,skills}`)
+ `manifest.json` (`format: ancleto-export/1`; MCP como intención nombre+tipo, nunca rutas; aborta
si hay absolutos) a directorio o `--tar`. Excluye `opencode.json`, `.ancleto-tier`, `memory.db`,
`service.json` y global. `importCmd` aplica portables, reinstala assets del host, re-aplica el
tier, **reconcilia y mergea templates** y **regenera** el MCP local (`mcpCommandBroken` +
`repairProjectMcp`: sólo rotas/ausentes, nunca sanas), cerrando con `doctor`. `import --repair`
repara in place sin bundle. Wrapper `/cleto-transplant`. Evidencia: `src/cli/index.js`.

## `check` / tier / `projects` host-aware

- **`localAgentDirs(rc, agent)`**: unión de `installedPaths.agents` ∪ destino del host.
- **`installedHostsFromPaths(ip)`**: deriva los hosts realmente instalados del manifiesto.
- **`check`**: el `expected` de un directorio de skills incluye los command-skills cuando algún
  host instalado empaqueta commands como skill; valida el frontmatter de agents contra el
  adaptador y advierte si `machine-env.md` está trackeado.
- **`installedExtFor`**: deriva la convención de nombre del host del mismo modelo de destino.
  Evidencia: `src/cli/index.js`.

## Flujo de alta (`initProject` / `install`)

1. Resuelve agente/IDE, tier, idioma y perfil; wizard interactivo en TTY.
2. `maybeImportOpenspec` (punto único antes del scaffold): clasifica `openspec/`
   (`none`/`legacy`/`external`); legacy migra silencioso, externo pide confirmación (default No,
   `--yes` para script) e importa sin pisar el `AGENTS.md` local.
3. `copyTemplates` copia `AGENTS.md`/`PRODUCT.md` (del perfil si aplica) con
   `mergeTemplateInto`.
4. `installAgentAssets` materializa skills/agents/commands en el destino nativo, delegando la
   adaptación en `adaptFrontmatter`; con perfil `test`, `installProfileOverlay`.
5. `scaffoldAspec` (+ `scaffoldTestspec` con perfil `test`) crean estructura sin pisar.
6. `applyTier` reescribe la línea `model:` de cada agente; resuelve `gratisModel` y lo guarda.
   Paridad `init`/`install` en el tier guardado.
7. `setupHostMcp` configura el MCP del host **no destructivo**; en `init` el MCP se resuelve
   **antes** de escribir los agents para materializar la directiva host-scoped.
8. `writeManifest` actualiza `.ancletorc` y `registerProject` anota el repo en
   `~/.config/ancleto/projects.json` (override: `ANCLETO_PROJECTS_FILE`).
9. `refreshWorkingContext` regenera `.ancleto/working-context.md` desde la memoria (o día-cero).
10. `refreshMachineEnv` genera/actualiza `.ancleto/machine-env.md` y garantiza su exclusión local,
    sin tocar `.gitignore`.

## Migración/importación `openspec/` → `aspec/`

- `migrateLegacyOpenspec(projectDir)`: no-op si no existe `openspec/` ni el marcador. Si `aspec/`
  ya tiene contenido real (al menos una entrada en `changes/` o `specs/`), avisa y **no migra**.
  Si migra, copia recursiva con `force: false`, escribe el marcador y conserva `openspec/`.
- `detectLegacyOpenSpec`: `none` (ausente o vacía), `legacy` (resto) o `external`.
- `maybeImportOpenspec` es el punto único, invocado por `init`, `install --project` y `upgrade`.
  Evidencia: `src/cli/index.js`, `aspec/specs/aspec-bootstrap/spec.md`.

## Reglas y convenciones

- **Cero dependencias de runtime**: todo con `node:*` y `spawn`; UI con Raw Mode propio. ESLint es
  sólo devDependency.
- **Idempotencia y no destrucción**: `init`/`install` no pisan config ni documentos del usuario;
  los bloques LOCKED se re-aplican, las superficies legadas se reconcilian y el resto se preserva.
  `installedPaths` es la unión de destinos escritos; no se borran rutas previas. `machine-env.md`
  se reemplaza completo sólo si cambiaron los hechos.
- **Paridad `init`/`install`** en flags y tier guardado, incluido re-init sin flags.
- **`--check` no empaqueta**: state-only sobre hashes.
- **`ancleto affected` es read-only**: delega el grafo en `src/core/affected-set.js` y reporta
  `affected`/`unresolved`/`externalCount`.
- **`ancleto stats failures` es read-only**: sólo consulta la base de opencode.
- **`memory snapshot` no modifica la fuente**; **`memory doctor` no muta por defecto**;
  **`memory consolidate` es dry-run por defecto**; **`memory gc` respeta `--dry-run`**. `--rebuild`
  es el único camino de escritura del doctor y `--apply` el único de consolidate. El check de
  refs y `resolveNodeRefs` son read-only.
- **GC mide la edad de supersesión**, no la de creación: `COALESCE(superseded_at, created_at)`
  con cutoff único; limpia `superseded_by` de los elegibles antes del `DELETE`.
- **Refresh on-write CLI y staleness advisory son best-effort**:
  - `memoryImport` envuelve el refresh en `try/catch` y reporta el fallo sin abortar.
  - `memoryMerge`/`memoryConsolidate --apply` no revierten si falla el refresh: salen ≠ 0
    informando el estado real.
  - `memoryDoctorCmd` emite el staleness como línea advisory sin alterar el exit code.
- **`machine-env` es best-effort**: un fallo de generación o exclusión se reporta como warning y
  no aborta el lifecycle.
- **La sonda de invocabilidad está acotada** (2 s por intento, 10 s acumulados) y nunca declara
  `disponible` a un candidato inconcluso.
- **Errores no bloqueantes**: binarios ausentes, assets no soportados, divergencias de frontmatter
  y exclusiones no garantizadas se omiten con warning.
- **`opencode.json` no se publica**: el override de modelos es config del checkout.
- **El `model:` vive en tres superficies**; `install`/`update` reescriben por tier y `upgrade` no
  aplica tier. Ver `setup.md`.
- **`ancleto --version` lee `package.json` en runtime** (no hardcodeado).
- **Deuda MEM-04**: `inspectRefs` no captura errores de I/O y el conteo de no verificables con
  rotas sigue en `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` §5.2; MEM-04b no la corrige.

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point; `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `installAgentAssets`, `installAssetFiles`, `installProfileOverlay`, `installCommandSkills`, `setupHostMcp`, `mergeCommandCodeMcp`, `mergeCopilotMcp`, `hostSupportsCompression`/`hostConfigHasCompression`, `mergeTemplateInto`/`reconcileLegacyBlocks`/`mergeLocked`, `checkAgentsFrontmatter`, `exportCmd`/`importCmd`, `detectLegacyOpenSpec`, `localAgentDirs`, `installedHostsFromPaths`, `writeManifest`, `migrateLegacyOpenspec`, `refreshWorkingContext`/`memoryContext`, `refreshMachineEnv`, `memoryImport`, `memorySnapshot`, `memoryMerge`, `memoryConsolidate`, `memoryDoctorCmd`, `memoryExport`/`memoryGc`, `affectedCommand`, `statsFailuresCommand`. |
| `src/core/adapters/frontmatter.js` | `adaptFrontmatter`, `parseFrontmatter`, `serializeFrontmatter`, `AGENT_ADAPTER_DROP`, `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`/`COMMANDCODE_MCP_TOOL_MAP`. |
| `src/core/machine-env.js` | `machineEnvPath`, `detectMachineFacts`, `renderMachineEnv`, `writeMachineEnv`, `ensureMachineEnvExclusion`, `materializeMachineEnv`, `checkMachineEnvTracked`; sonda interna (`findExecutables`, `spawnProbe`, `probeExecutable`). |
| `src/core/memory/snapshot.js` | `snapshotDatabase`; dueño único de la copia binaria. |
| `src/core/memory/engine.js` | `searchMemory` (preview/`expand`/`keys`/`required`), `recordNode`, `parseRefsBlock`/`refsBlockEnd`/`validateRefsForWrite`, `inspectRefs`, `resolveNodeRefs`, `renderRuleContent`, `importNodes`, `gcSuperseded`/`getGcDetach`, `merge`, `consolidate`, orden/`formatOverflowWarning`. |
| `src/core/memory/mcp-server.js` | Fija `source: 'mcp:ancleto-memory'` y `projectRoot`. |
| `src/core/memory/working-context.js` | Render único, refresh on-write (MCP/CLI), `checkWorkingContextFreshness`, `resolveMemoryProjectRoot`. |
| `skills/ancleto-archive/SKILL.md` | Gate de promoción al archivar. |
| `agents/memory-keeper.md` | Modo Promotion. |
| `src/cli/ui.js` | Banner y menús TTY. |
| `opencode.json` | Override de `agent.model` para los 10 subagentes. No se publica. |
| `templates/AGENTS.md`, `templates/PRODUCT.md` | Templates con bloques LOCKED/EXTENSIBLE. |
| `skills/*/SKILL.md` | Catálogo instalable; en agents el frontmatter se adapta, en skills se copia. |
| `test/cli.test.js`, `test/adapters-frontmatter.test.js`, `test/content-guards.test.js`, `test/working-context.test.js`, `test/machine-env.test.js`, `test/stats-failures.test.js`, `test/memory-pr1-contract.test.js`, `test/memory-fixtures.test.js` | Guardas del CLI, adaptador, contenido, working-context, entorno, fallos, PR-1 y golden/resolver. |
| `aspec/changes/archive/2026-11-02-mem-05-recall-task-aware/` | Change archivado y publicado en `0.18.6`. |
| `aspec/changes/archive/2026-11-02-mem-05a-searchmemory-docs-contract/` | Protocolo canónico de memoria en `AGENTS.md`. |
| `aspec/changes/archive/2026-11-02-mem-05b-gc-superseded-age/` | GC por edad de supersesión. |
| `aspec/changes/archive/2026-11-02-mem-04b-resolver-referencias-navegables/` | Change archivado y publicado en `0.18.3`. |
| `aspec/changes/archive/2026-11-02-memory-ranking-y-omisiones-visibles/` | Change archivado y publicado en `0.18.4`. |
| `aspec/changes/archive/2026-11-02-memory-consolidacion-autonoma/` | Change archivado y publicado en `0.18.5`. |
| `agents/technical-discovery.md` | Allowlist de `bash` de dos literales sobre `'*': deny`. |
