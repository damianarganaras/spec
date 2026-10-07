---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, adaptación de frontmatter, commands como skills, wizard, MCP y portabilidad"
covers: [instalación, AGENT_TARGETS, frontmatter, MCP, perfiles, export/import]
sources: ["src/cli/**", "src/core/adapters/**"]
sourcesSha: 86eefeb896a883dd77d7c93b255060e77ff62fd311b64126fa2604fb84b4ac73
generatedAt: 2026-10-07T23:35:00Z
pluginVersion: 0.12.0
skillVersion: '2.3'
---

# Unidad: CLI de instalación y orquestación

## Propósito

`src/cli/index.js` es el **único entry point** (`bin.ancleto`/`bin.aspec`):
parseo de comandos, instalación de assets por host, resolución de agente/IDE,
gestión de tiers, MCP, discovery, memoria, registro de proyectos y
diagnósticos. La adaptación de frontmatter es un módulo aparte
(`src/core/adapters/frontmatter.js`), y `src/cli/ui.js` aporta el wizard.
Evidencia: `package.json`, `src/cli/index.js`.

## Superficie de comandos

`install`, `update`, `upgrade`, `init`, `export` (`--tar`), `import`
(`<bundle>`/`--repair`), `discovery` (`--check` / pack), `mcp`, `memory
(context|list|doctor|export|import|gc)`, `specs check`, `stats`, `projects
(list|scan|prune|info|update)`, `list --projects`, `check`, `doctor`,
`--help`, `--version`. Flags transversales: `--agent`, `--tier`, `--lang`,
`--profile`, `--exclude`, `--no-mcp`, `--with-engram`, `--yes` (solo
importación openspec). Evidencia: `src/cli/index.js`, `README.md`.

## Modelo único de destinos por host (`AGENT_TARGETS`)

`AGENT_TARGETS` es la **fuente única de rutas** (D1): cada host declara
`skills`, `agents` y `commands` con su `dir` y su convención de nombre
(`ext`); `null` = asset no soportado por ese host. `SUPPORTED_AGENTS =
['opencode','claude','vscode','antigravity','cursor','roo','copilot','commandcode']`;
default `opencode`. `scanAgentFlag` valida `--agent` y `resolveAgent`
prioriza flag → `.ancletorc` (`agent`) → wizard TTY → default. Evidencia:
`src/cli/index.js`.

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

- **Antigravity no tiene directorio de commands**: sus `/cleto-*` se
  materializan como **command-skills** dentro de `.agents/skills/<n>/SKILL.md`
  (`package: 'skill-dir'`).
- **Cursor y Roo: solo skills** (D3/D7). `.agents/skills` es punto de lectura
  compartido (D2), no destino universal.
- **Copilot: host de prompts.** Agents y commands comparten
  `.github/prompts/` con ext `.prompt.md` (sin colisión). Skills `null` →
  aviso `skip` no bloqueante; los prompts son por repo. El tier nunca toca
  prompts.
- **Command Code: layout nativo por asset.** `.commandcode/{skills,agents,commands}`;
  los commands son custom slash commands (el body es el prompt, copia
  verbatim) y los agents pasan por `adaptCommandCodeFrontmatter`. Command Code
  también lee `.agents/skills` (compatibilidad), pero el CLI escribe en el
  directorio nativo `.commandcode/skills`.
- **`installAgentAssets(projectDir, agent)`** (dueño único): materializa
  skills, agents y commands en el destino nativo del host y devuelve las
  rutas escritas. Un asset `null` dispara `warnUnsupportedAsset` → `skip
  <asset>: not supported by host '<host>'` (stderr, no bloqueante).
  Evidencia: `src/cli/index.js`.

## Adaptación de frontmatter (dueño único: `src/core/adapters/frontmatter.js`)

El change `dynamic-frontmatter-adapters` extrajo el adaptador del monolito a
un **módulo puro**. Contrato público: `adaptFrontmatter(content, host,
assetKind, name) → string` (contenido completo con frontmatter adaptado + body
verbatim). **Sin E/S, sin dependencias externas, sin estado global mutable.**
`parseFrontmatter` y `serializeFrontmatter` viven en el módulo y se
re-exportan para `commandToSkill`. Ningún otro punto del CLI transforma
frontmatter.

### Dispatch

| host | skill/command | agents |
|---|---|---|
| `opencode` | identidad | identidad |
| `claude`, `vscode`, `copilot` | identidad | `dropManagedKeys` (dropea `AGENT_ADAPTER_DROP`) |
| `antigravity` | identidad | `adaptAntigravityFrontmatter` |
| `commandcode` | identidad | `adaptCommandCodeFrontmatter` |
| `cursor`, `roo` | identidad + aviso stderr | identidad + aviso |
| desconocido | identidad + aviso stderr | identidad + aviso |

`AGENT_ADAPTER_DROP = {mode, color, temperature, permission, model, tools}`.
Copilot y Command Code suman una nota de modelo/picker en el orchestrator (el
tier no cambia modelos). Mensajes de aviso: `no documented frontmatter adaptation for host
'<host>'` (cursor/roo) y `unknown agent '<host>', passthrough` (desconocido);
ninguno aborta.

### Antigravity (`adaptAntigravityFrontmatter`)

Transformación con **orden determinista**: `name` (inyectado del nombre de
archivo), `description`, `tools: [...]` (siempre, aun `[]`), `mainAgent`,
`subagent`, `model: inherit` (fijo), `commandExecutionPolicy: sandbox`
(fijo), `mcpServers` (preservado), `skills` (preservado) y luego las claves
extra no gestionadas. Las claves gestionadas se filtran y re-emiten **una sola
vez** (sin duplicados). **Eliminados**: `mode`, `color`, `temperature`,
`permission`, `model` de catálogo opencode y `tools` en forma de mapa.

Mapeo de `mode` → flags: `primary` → (`mainAgent:true`, `subagent:false`);
`subagent` → (`false`,`true`); sin `mode` → (`true`,`true`).

### Mapeo de tools (conjunto cerrado)

Solo se emiten estos 5 ids verificados contra la tabla oficial de
frontmatter de Custom Subagents (`ANTIGRAVITY_TOOL_MAP`):

| Clave opencode | Id Antigravity |
|---|---|
| `read` | `view_file` |
| `edit` | `replace_file_content` |
| `grep` | `grep_search` |
| `bash` | `run_command` |
| `todowrite` | `manage_task` |

**Política de omisión (regla dura)**: cualquier otra clave del mapa `tools`
—ids solo-SDK (`find_file`, `edit_file`, `search_web`, `read_url_content`),
de comunidad (`write_to_file`, `call_mcp_tool`, `multi_replace_file_content`)
o de delegación (`invoke_subagent`, `start_subagent`, `define_subagent`),
y también `write`/`glob`/`task`/`webfetch`/`websearch`— **no se emite** y
produce un aviso a stderr no bloqueante: `skip tool '<k>': no verified
Antigravity id for agent '<n>'`. Un id inexistente cuelga el subagent
(Known Issue). El tool `skill` se saltea **en silencio** (se cubre por el
campo `skills`). `call_mcp_tool` está **prohibido**; el uso de MCP se
expresa por `mcpServers` / `.agents/mcp_config.json`. Evidencia:
`src/core/adapters/frontmatter.js`,
`test/adapters-frontmatter.test.js`.

### Command Code (`adaptCommandCodeFrontmatter`)

Orden de emisión: `name` (inyectado del nombre de archivo), `description`
(preservado), `tools` (lista de ids o `"*"`) y luego las claves extra no
gestionadas. **Eliminados**: `mode`, `color`, `temperature`, `permission`.
**`model` se omite** (Command Code hereda el modelo de sesión; nunca se mapea un
id `opencode-go/*`).

`tools` se traduce con `COMMANDCODE_TOOL_MAP` (ids verificados):
`read→read_file`, `write→write_file`, `edit→edit_file`, `bash→shell_command`,
`grep→grep`, `glob→glob`, `webfetch→web_fetch`, `websearch→web_search`,
`todowrite→todo_write`. Las claves de memoria (`searchMemory`, `recordRule`,
`recordDecision`) se emiten como tools MCP `mcp__ancleto-memory__<tool>`
(`COMMANDCODE_MCP_TOOL_MAP`). Toda clave sin id verificado se omite con aviso
`skip tool '<k>': no verified Command Code id for agent '<n>'`. **Diferencia
clave**: en Command Code `tools` omitido significa "ninguna tool", por eso un
origen sin `tools` emite `tools: "*"` (el default de opencode es "todas") y un
`tools` con sólo claves `false` emite `tools: []`. El orchestrator suma
`COMMANDCODE_MODEL_NOTE`. Evidencia: `src/core/adapters/frontmatter.js`,
`test/adapters-frontmatter.test.js`,
`aspec/specs/commandcode-support/spec.md`.

## Validación de frontmatter en `ancleto check`
T3 del delta `frontmatter-adapters`: `checkAgentsFrontmatter` recorre cada
`.md` de un directorio de agents instalado, lee el origen y el instalado,
aplica `adaptFrontmatter(origen, host, 'agents', name)` y compara. En
opencode simula además la sustitución de `model:` del tier (`applyTier`); en
copilot y commandcode, el orchestrator suma su nota de modelo (`COPILOT_MODEL_NOTE`
/ `COMMANDCODE_MODEL_NOTE`). La divergencia se reporta
como **warning (⚠), no bloqueante**; solo un archivo faltante (✖) altera el
exit code. El host de cada directorio se deriva del manifiesto multi-host
(`installedHostsFromPaths`). Evidencia: `src/cli/index.js`,
`aspec/specs/skill-frontmatter-adapters/spec.md`.

## Commands como skills (Antigravity)

`installCommandSkills` / `commandToSkill` leen `commands/*.md` y escriben
`.agents/skills/<base>/SKILL.md` con frontmatter `name: <base>` +
`description` de origen y **body verbatim**. No se registran en
`installedPaths.commands` (queda vacío para antigravity): el asset vive
dentro del layout de skills. Evidencia: `src/cli/index.js`.

## MCP de host (`setupHostMcp`, dueño único)

- **Antigravity**: `.agents/mcp_config.json` con `{ "mcpServers": { "<n>":
  { "command": "...", "args": [...], "env": {...} } } }`. Merge **no
  destructivo**: preserva `mcpServers` y claves top-level, no pisa homónimos,
  y un JSON inválido avisa y **no escribe**. Se descartan `type`/`enabled` de
  opencode.
- **Copilot**: `copilot-mcp.json` en la raíz (`mergeCopilotMcp` en install,
  `refreshCopilotMcp` en upgrade: regenera rotas y agrega ausentes sin tocar
  `copilot-instructions.md`).
- **Command Code**: `.mcp.json` en la raíz (scope `project`) con
  `{ "mcpServers": { "<n>": { "transport": "stdio", "command", "args", "env" } } }`
  (`mergeCommandCodeMcp` en install, `refreshCommandCodeMcp` en upgrade). Sólo
  con `--project` (es project scope). Merge no destructivo; JSON inválido avisa
  sin escribir. Segunda excepción host-MCP junto a antigravity.
- **Resto de hosts**: `mergeMcp` sobre `opencode.json` (targetDir =
  `.opencode` del proyecto o config global).
- **`init` configura MCP** igual que `install`, con el mismo dueño y sin
  rama especial por host; `--no-mcp` es el escape en ambos. Defaults:
  `ancleto-memory` (stdio) y `caveman` si está en `PATH`; `engram` solo con
  `--with-engram`; `azure-devops` si `azure.enabled: true`. Evidencia:
  `src/cli/index.js`.

## Perfil `test` (overlay, `installProfileOverlay`)

Con `profile: test` (`--profile`, `test:playwright` como alias;
`SUPPORTED_PROFILES = general|test`; persistido en `.ancletorc`),
`installProfileOverlay` reinstala `profiles/test/agents` + `commands` sobre
los destinos nativos del host (misma `ext` y mismo adapter que la base;
funciona con opencode, claude y copilot), `copyTemplates` lee
`profiles/test/templates/` (bloque LOCKED de convenciones Playwright) y se
crea `testspec/specs` + `testspec/changes` (`scaffoldTestspec`). El paquete
base queda intacto y el tier sigue ortogonal. Evidencia: `src/cli/index.js`,
`profiles/test/`.

## Portabilidad entre máquinas (`export` / `import`)

`exportCmd` agrupa portables (`.ancletorc`, templates, `aspec/`,
`.opencode/{agents,commands,skills}`) + `manifest.json` (`format:
ancleto-export/1`; MCP como intención nombre+tipo, nunca rutas; aborta si
hay absolutos) a directorio o `--tar`. Excluye `opencode.json`,
`.ancleto-tier`, `memory.db`, `service.json` y global (la memoria tiene su
propio `memory export`). `importCmd` aplica portables, reinstala assets del
host, re-aplica el tier y **regenera** el MCP local (`mcpCommandBroken` +
`repairProjectMcp`: solo rotas/ausentes, nunca sanas), cerrando con
`doctor`. `import --repair` repara in place sin bundle. Wrapper
`/cleto-transplant`. Evidencia: `src/cli/index.js`.

## `check` / tier / `projects` host-aware

- **`localAgentDirs(rc, agent)`**: unión de `installedPaths.agents` ∪
  destino del host.
- **`installedHostsFromPaths(ip)`**: deriva los hosts realmente instalados
  de `installedPaths` (unión de destinos escritos), no de un único
  `rc.agent`.
- **`check`**: el `expected` de un directorio de skills incluye los
  command-skills cuando algún host instalado empaqueta commands como skill
  (`package:'skill-dir'` y mismo `dir`), y valida el frontmatter de agents
  contra el adaptador (ver arriba).
- **`installedExtFor`**: deriva la convención de nombre del host del mismo
  modelo de destino.
- **Tier resuelto en este checkout**: `normal` vía `.opencode/.ancleto-tier`
  (no `gratis` como declaraba el seed previo).
  Evidencia: `src/cli/index.js`.

## Flujo de alta (`initProject` / `install`)

1. Resuelve agente/IDE, tier (`scanTierFlag`/`readProjectTier`), idioma y
   perfil; wizard interactivo en TTY (`selectOption`, `askExcludePresets`,
   `selectMultiple` en `ui.js`).
2. `maybeImportOpenspec` (punto único antes del scaffold): clasifica
   `openspec/` con `detectLegacyOpenSpec` (`none`/`legacy`/`external`);
   legacy migra silencioso, externo pide confirmación (default No, `--yes`
   para script) e importa sin pisar el `AGENTS.md` local.
3. `copyTemplates` copia `AGENTS.md`/`PRODUCT.md` (del perfil si aplica)
   con `mergeLocked`: reemplaza el interior de los bloques `<!-- LOCKED:
   name -->`, preserva EXTENSIBLE, inserta bloques nuevos y no toca
   archivos con tags malformados.
4. `installAgentAssets` materializa skills/agents/commands en el destino
   nativo del host, delegando la adaptación de frontmatter en
   `adaptFrontmatter`; con perfil `test`, `installProfileOverlay` encima.
5. `scaffoldAspec` (+ `scaffoldTestspec` con perfil `test`) crean
   estructura sin pisar.
6. `applyTier` reescribe la línea `model:` de cada agente; resuelve
   `gratisModel` y lo guarda en `.ancletorc`. Paridad `init`/`install` en
   el tier guardado (v0.6.36/v0.6.37).
7. `setupHostMcp` configura el MCP del host de forma **no destructiva**.
   `upgrade` sin `.ancletorc` migra `openspec/` si lo hay en lugar de
   exigir `init`.
8. `writeManifest` actualiza `.ancletorc` y `registerProject` anota el
   repo en `~/.config/ancleto/projects.json` (override:
   `ANCLETO_PROJECTS_FILE`).
9. `refreshWorkingContext` regenera `.ancleto/working-context.md` desde la
   memoria.

## Migración/importación `openspec/` → `aspec/`

- `migrateLegacyOpenspec(projectDir)`: no-op si no existe `openspec/` ni
  el marcador `.migrated-from-openspec`. Si `aspec/` ya tiene contenido
  real (al menos una entrada en `changes/` o `specs/`), avisa y **no
  migra**. Si migra, copia recursiva con `force: false`, escribe el
  marcador y conserva `openspec/` como backup.
- `detectLegacyOpenSpec`: `none` (ausente o carpeta vacía), `legacy`
  (resto) o `external`.
- `maybeImportOpenspec` es el punto único, invocado por `init`, `install
  --project` y `upgrade`. Evidencia: `src/cli/index.js`,
  `aspec/specs/aspec-bootstrap/spec.md`.

## Reglas y convenciones

- **Cero dependencias de runtime**: todo con `node:*` y `spawn`; UI de
  terminal con Raw Mode propio. ESLint es solo devDependency.
- **Idempotencia y no destrucción**: `init`/`install` no pisan config ni
  documentos del usuario; los bloques LOCKED se re-aplican y el resto se
  preserva. `installedPaths` es la unión de destinos escritos
  (`unionInstalledPaths`); no se borran rutas previas.
- **Paridad `init`/`install`** en flags y tier guardado, incluido re-init
  sin flags.
- **`--check` no empaqueta**: state-only sobre hashes.
- **Errores no bloqueantes**: binarios ausentes (MCP/git/gh/az), assets
  no soportados y divergencias de frontmatter se omiten con warning a
  stderr.
- `ancleto --version` lee `package.json` en runtime (no hardcodeado).
- **No confundir** `ancleto update` (CLI, reinstala el paquete) con
  `/cleto-update` (skill, revisa artifacts de un change con merge no
  destructivo — ver `aspec/specs/artifact-update/spec.md`).

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point; `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `installAgentAssets`, `installProfileOverlay`, `installCommandSkills`, `setupHostMcp`, `mergeCopilotMcp`, `mergeCommandCodeMcp`/`refreshCommandCodeMcp`, `checkAgentsFrontmatter`, `exportCmd`/`importCmd`, `detectLegacyOpenSpec`, `localAgentDirs`, `installedHostsFromPaths`, `writeManifest`, `migrateLegacyOpenspec`, `mergeLocked`, `memoryExport`/`memoryImport`/`memoryGc`. |
| `src/core/adapters/frontmatter.js` | `adaptFrontmatter`, `parseFrontmatter`, `serializeFrontmatter`, `AGENT_ADAPTER_DROP`, `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`, `COMMANDCODE_MCP_TOOL_MAP`; dueño único de la transformación. |
| `src/cli/ui.js` | Banner y menús TTY (`selectOption`, `selectMultiple`). |
| `templates/AGENTS.md`, `templates/PRODUCT.md` | Templates con bloques LOCKED/EXTENSIBLE. |
| `skills/*/SKILL.md` | Catálogo instalable (21 skills, incluye `ancleto-update`); en agents el frontmatter se adapta por host, en skills se copia. |
| `commands/*.md` | 16 comandos `/cleto-*`; en antigravity se empaquetan como skills. |
| `test/cli.test.js`, `test/adapters-frontmatter.test.js`, `test/content-guards.test.js` | Guardas del CLI, del adaptador y de contenido. |
| `README.md`, `BACKLOG.md` | Contrato operativo y backlog. |