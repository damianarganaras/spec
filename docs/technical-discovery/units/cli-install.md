---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, adaptación de frontmatter (incl. Command Code), merge de templates, commands como skills, wizard, MCP y portabilidad"
covers: [instalación, AGENT_TARGETS, frontmatter, merge de templates, MCP, perfiles, export/import]
sources: ["src/cli/**", "src/core/adapters/**"]
sourcesSha: 16c199cc8d15b0ff275d52e37ebaed34d3703d437a949f03f542cbed20c3221e
generatedAt: 2026-10-15T11:49:04Z
pluginVersion: 0.13.0
skillVersion: '2.3'
---

# Unidad: CLI de instalación y orquestación

## Propósito

`src/cli/index.js` es el **único entry point** (`bin.ancleto`/`bin.aspec`): parseo de
comandos, instalación de assets por host, resolución de agente/IDE, gestión de tiers, MCP,
discovery, memoria, registro de proyectos y diagnósticos. La adaptación de frontmatter es un
módulo aparte (`src/core/adapters/frontmatter.js`), y `src/cli/ui.js` aporta el wizard.
Evidencia: `package.json`, `src/cli/index.js`.

## Superficie de comandos

`install`, `update`, `upgrade`, `init`, `export` (`--tar`), `import` (`<bundle>`/`--repair`),
`discovery` (`--check` / pack), `mcp`, `memory (context|list|doctor|export|import|gc)`,
`specs check`, `stats`, `projects (list|scan|prune|info|update)`, `list --projects`, `check`,
`doctor`, `--help`, `--version`. Flags transversales: `--agent`, `--tier`, `--lang`,
`--profile`, `--exclude`, `--no-mcp`, `--with-engram`, `--yes` (solo importación openspec).
Evidencia: `src/cli/index.js`, `README.md`.

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
`todowrite`→`manage_task`. Cualquier otra clave del mapa `tools` (ids solo-SDK, de comunidad o
de delegación, y también `write`/`glob`/`task`/`webfetch`/`websearch`) **no se emite** y produce
aviso a stderr no bloqueante: `skip tool '<k>': no verified Antigravity id for agent '<n>'`. Un
id inexistente cuelga el subagent (Known Issue). El tool `skill` se saltea en silencio (se cubre
por el campo `skills`). `call_mcp_tool` está **prohibido**; el uso de MCP se expresa por
`mcpServers` / `.agents/mcp_config.json`.

### Command Code (`adaptCommandCodeFrontmatter`)

Adapta el frontmatter de opencode al de Command Code: `name` inyectado (el host lo requiere,
default filename), `description` preservado, `mode`/`color`/`temperature`/`permission`
**eliminados** y `model` **omitido** (el host hereda el modelo de sesión; nunca se mapea un id
`opencode-go/*`). `tools` sale como **lista** de ids verificados (`COMMANDCODE_TOOL_MAP`:
`read`→`read_file`, `write`→`write_file`, `edit`→`edit_file`, `bash`→`shell_command`,
`grep`→`grep`, `glob`→`glob`, `webfetch`→`web_fetch`, `websearch`→`web_search`,
`todowrite`→`todo_write`). Las tools de memoria se emiten con la convención MCP del host
(`COMMANDCODE_MCP_TOOL_MAP` → `mcp__ancleto-memory__<tool>`). Clave sin id verificado → aviso
`skip tool '<k>': no verified Command Code id for agent '<n>'`. **Inversión de default**:
`tools` omitido en Command Code significa "ninguna tool" (en opencode, "todas"), por eso un
origen sin `tools` emite `tools: "*"`. Evidencia: `src/core/adapters/frontmatter.js`,
`README.md`, `CHANGELOG.md` (`0.12.1`).

## Merge de templates y reconciliación (`mergeTemplateInto`)

`mergeTemplateInto(source, local, filename)` es el **punto único** de merge de los templates
raíz (`AGENTS.md`/`PRODUCT.md`, const `TEMPLATES`); lo invocan `install`/`update`/`upgrade`
(vía `copyTemplates`) **y** `import` (`importCmd`).

1. **Reconciliación previa** — `reconcileLegacyBlocks(content, filename)` elimina las firmas
   planas legadas registradas (p. ej. la lista plana vieja de validaciones en `AGENTS.md`). Solo
   elimina con **coincidencia exacta** de las líneas firmadas (match por líneas completas,
   tolerando CRLF/espaciado); si la firma fue personalizada/extendida (heading presente pero
   líneas distintas, u otro item de lista a continuación) **avisa y no toca**. La firma acota el
   `filename` correcto; un archivo sin firma registrada (p. ej. `PRODUCT.md`, EXTENSIBLE) es
   no-op. Idempotente.
2. **Merge LOCKED** — `mergeLocked(source, local, filename)` reemplaza el interior de cada
   bloque `<!-- LOCKED: name -->` con el del paquete, preserva el resto (EXTENSIBLE), inserta
   bloques nuevos en el ancla correcta (`findInsertAnchor`) y **no toca** el archivo si los tags
   faltan o están mal formados (avisa). Helper: `extractLockedBlocks`, `replaceLockedBlock`.

Contrato (spec `prompt-contracts`): **NO SHALL existir una ruta que mergee `TEMPLATES` sin
reconciliar**. Las superficies mergeadas por bloque se reconcilian; los assets de skill
(copiados enteros) se regeneran. Evidencia: `src/cli/index.js`, `templates/AGENTS.md`,
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

## Compresión host-scoped (caveman) — change archivado `token-budget`

- `buildDefaultMcp` da de alta el MCP de compresión (caveman) por defecto cuando su binario está
  disponible, como **configuración del host** (solo `opencode`/`antigravity`) vía `setupHostMcp`.
- **La directiva de uso es condicional al host**: `hostSupportsCompression` /
  `hostConfigHasCompression` leen la config MCP del host y deciden si materializar
  `CAVEMAN_USAGE_NOTE`; esa pista se escribe **solo** en superficies de un host que tiene la
  tool y **nunca** en texto compartido. Contrato: *donde no hay tool, no hay instrucción*.
  `installAssetFiles(..., compression)` propaga la decisión al escribir.
- El default es **reversible a opt-in** mediante compuerta de medición con `ancleto stats`.
  Evidencia: `src/cli/index.js`, `aspec/specs/prompt-contracts/spec.md`.

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
  host instalado empaqueta commands como skill (`package:'skill-dir'` y mismo `dir`), y valida
  el frontmatter de agents contra el adaptador.
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
- **Paridad `init`/`install`** en flags y tier guardado, incluido re-init sin flags.
- **`--check` no empaqueta**: state-only sobre hashes.
- **Errores no bloqueantes**: binarios ausentes (MCP/git/gh/az), assets no soportados y
  divergencias de frontmatter se omiten con warning a stderr.
- `ancleto --version` lee `package.json` en runtime (no hardcodeado).

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point; `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `installAgentAssets`, `installAssetFiles`, `installProfileOverlay`, `installCommandSkills`, `setupHostMcp`, `mergeCommandCodeMcp`, `mergeCopilotMcp`, `hostSupportsCompression`/`hostConfigHasCompression`, `mergeTemplateInto`/`reconcileLegacyBlocks`/`mergeLocked`, `checkAgentsFrontmatter`, `exportCmd`/`importCmd`, `detectLegacyOpenSpec`, `localAgentDirs`, `installedHostsFromPaths`, `writeManifest`, `migrateLegacyOpenspec`, `refreshWorkingContext`/`memoryContext`, `memoryExport`/`memoryImport`/`memoryGc`. |
| `src/core/adapters/frontmatter.js` | `adaptFrontmatter`, `parseFrontmatter`, `serializeFrontmatter`, `AGENT_ADAPTER_DROP`, `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`/`COMMANDCODE_MCP_TOOL_MAP`; dueño único de la transformación. |
| `src/cli/ui.js` | Banner y menús TTY (`selectOption`, `selectMultiple`). |
| `templates/AGENTS.md`, `templates/PRODUCT.md` | Templates con bloques LOCKED (incl. `validation-commands`)/EXTENSIBLE. |
| `skills/*/SKILL.md` | Catálogo instalable; en agents el frontmatter se adapta por host, en skills se copia. |
| `test/cli.test.js`, `test/adapters-frontmatter.test.js`, `test/content-guards.test.js` | Guardas del CLI, del adaptador (incl. Command Code) y de contenido. |
| `README.md`, `BACKLOG.md` | Contrato operativo y backlog. |
