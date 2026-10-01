---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, frontmatter de agents, commands como skills, wizard y MCP"
sources: ["src/cli/**"]
sourcesSha: 8dc1f19abbf4f1d845275059842c7e4017b5a5c79a912939cea66f8db39ba0a4
generatedAt: 2026-09-30T21:56:00Z
pluginVersion: 0.8.0
skillVersion: '2.3'
---

# Unidad: CLI de instalación y orquestación

## Responsabilidad

`src/cli/index.js` es el **único entry point** (`bin.ancleto`/`bin.aspec`). Parseo de
comandos, instalación de assets por host, resolución de agente/IDE, adaptación de frontmatter,
gestión de tiers, MCP, discovery, memoria, registro de proyectos y diagnósticos. `src/cli/ui.js`
aporta el wizard. Evidencia: `package.json`, `src/cli/index.js`.

## Superficie de comandos

`install`, `update`, `upgrade`, `init`, `export` (`--tar`), `import` (`<bundle>`/`--repair`),
`discovery` (`--check` / pack), `mcp`, `memory (context|list|doctor)`, `specs check`, `stats`,
`projects (list|scan|prune|info|update)`, `list --projects`, `check`, `doctor`, `--help`,
`--version`. Flags transversales: `--agent`, `--tier`, `--lang`, `--profile`, `--exclude`,
`--no-mcp`, `--with-engram`, `--yes` (solo importación openspec). Evidencia: `src/cli/index.js`, `README.md`.

## Modelo único de destinos por host (`AGENT_TARGETS`)

`AGENT_TARGETS` es la **fuente única de rutas** (D1): cada host declara `skills`, `agents` y
`commands` con su `dir` y su convención de nombre (`ext`); `null` = asset no soportado por ese
host. `SUPPORTED_AGENTS = ['opencode','claude','vscode','antigravity','cursor','roo','copilot']`;
default `opencode`. `scanAgentFlag` valida `--agent` y `resolveAgent` prioriza flag → `.ancletorc`
(`agent`) → wizard TTY → default. Evidencia: `src/cli/index.js`.

| Host | Skills | Agents | Commands |
|---|---|---|---|
| `opencode` | `.opencode/skills` | `.opencode/agents/<n>.md` | `.opencode/commands/<n>.md` |
| `claude` | `.claude/skills` | `.claude/agents/<n>.md` | `.claude/commands/<n>.md` |
| `vscode` | `.github/skills` | `.github/agents/<n>.agent.md` | `.github/prompts/<n>.prompt.md` |
| `antigravity` | `.agents/skills` | `.agents/agents/<n>.md` | `.agents/skills/<n>/SKILL.md` (empaquetado como skill) |
| `cursor` | `.cursor/skills` | — (no soportado) | — (no soportado) |
| `roo` | `.roo/skills` | — (no soportado) | — (no soportado) |
| `copilot` | — (no soportado) | `.github/prompts/<n>.prompt.md` | `.github/prompts/<n>.prompt.md` |

- **Antigravity no tiene directorio de commands**: sus `/cleto-*` se materializan como
  **command-skills** dentro de `.agents/skills/<n>/SKILL.md` (`package: 'skill-dir'`). No existe
  `.agents/commands`.
- **Cursor y Roo: solo skills** (D3/D7). `.agents/skills` es punto de lectura compartido (D2),
  no destino universal.
- **Copilot: host de prompts.** Agents y commands comparten `.github/prompts/` con ext
  `.prompt.md` (sin colisión: `orchestrator`/`coder`/… vs `cleto-*`). Skills `null` → aviso
  `skip` no bloqueante; los prompts son por repo (`install --global` avisa y no genera).
  El tier nunca toca prompts (no hay `model:` que reescribir).
- **`installAgentAssets(projectDir, agent)`** (dueño único): materializa skills, agents y
  commands en el destino nativo del host y devuelve las rutas escritas. Un asset `null` no deja
  rastro y dispara `warnUnsupportedAsset` → `skip <asset>: not supported by host '<host>'`
  (stderr, no bloqueante). Evidencia: `src/cli/index.js`.

## Frontmatter de agents por host

`AGENT_ADAPTER_HOSTS = {claude, vscode, antigravity, copilot}`; el resto es identidad (copia verbatim).
`AGENT_ADAPTER_DROP = {mode, color, temperature, permission, model, tools}`: claude/vscode/copilot
eliminan esas claves de opencode. Copilot además suma la nota de picker en el orchestrator (el
tier no cambia modelos). Evidencia: `src/cli/index.js`.

### Antigravity (`adaptAntigravityFrontmatter`)

Transformación propia con **orden determinista**: `name` (inyectado del nombre de archivo),
`description`, `tools: [...]` (siempre, aun `[]`), `mainAgent`, `subagent`, `model: inherit`
(fijo), `commandExecutionPolicy: sandbox` (fijo), `mcpServers` (preservado si existía),
`skills` (preservado) y luego las claves extra no gestionadas. Las claves gestionadas se
filtran y re-emiten **una sola vez** (sin duplicados). **Eliminados**: `mode`, `color`,
`temperature`, `permission`, `model` de catálogo opencode y `tools` en forma de mapa.

Mapeo de `mode` → flags: `primary` → (`mainAgent:true`, `subagent:false`); `subagent` →
(`false`,`true`); sin `mode` → (`true`,`true`).

### Mapeo de tools (conjunto cerrado)

Solo se emiten estos 5 ids verificados contra la tabla oficial de frontmatter de Custom
Subagents:

| Clave opencode | Id Antigravity |
|---|---|
| `read` | `view_file` |
| `edit` | `replace_file_content` |
| `grep` | `grep_search` |
| `bash` | `run_command` |
| `todowrite` | `manage_task` |

**Política de omisión (regla dura)**: cualquier otra clave del mapa `tools` —ids solo-SDK
(`find_file`, `edit_file`, `search_web`, `read_url_content`), de comunidad (`write_to_file`,
`call_mcp_tool`, `multi_replace_file_content`) o de delegación (`invoke_subagent`,
`start_subagent`, `define_subagent`), y también `write`/`glob`/`task`/`webfetch`/`websearch`—
**no se emite** y produce un aviso a stderr no bloqueante:
`skip tool '<k>': no verified Antigravity id for agent '<n>'`. Un id inexistente cuelga el
subagent (Known Issue). El tool `skill` se saltea (se cubre por el campo `skills`).
`call_mcp_tool` está **prohibido**; el uso de MCP se expresa por `mcpServers` /
`.agents/mcp_config.json`, nunca se infiere desde claves desconocidas del mapa `tools`.
Evidencia: `src/cli/index.js`.

## Commands como skills (Antigravity)

`installCommandSkills` / `commandToSkill` leen `commands/*.md` y escriben
`.agents/skills/<base>/SKILL.md` con frontmatter `name: <base>` + `description` de origen y
**body verbatim**. No se registran en `installedPaths.commands` (queda vacío para antigravity):
el asset vive dentro del layout de skills. Evidencia: `src/cli/index.js`.

## MCP de host (`setupHostMcp`, dueño único)

- **Antigravity**: `.agents/mcp_config.json` con
  `{ "mcpServers": { "<n>": { "command": "...", "args": [...], "env": {...} } } }`. Merge **no
  destructivo**: preserva `mcpServers` y claves top-level, no pisa homónimos, y un JSON inválido
  avisa y **no escribe**. Se descartan `type`/`enabled` de opencode.
- **Copilot**: `copilot-mcp.json` en la raíz (`mergeCopilotMcp` en install, `refreshCopilotMcp`
  en upgrade: regenera rotas y agrega ausentes sin tocar `copilot-instructions.md`).
- **Resto de hosts**: `mergeMcp` sobre `opencode.json` (targetDir = `.opencode` del proyecto o
  config global).
- **`init` ahora configura MCP** (nuevo, D7) igual que `install`, con el mismo dueño y sin rama
  especial por host; `--no-mcp` es el escape en ambos. Defaults: `ancleto-memory` (stdio) y
  `caveman` si está en `PATH`; `engram` solo con `--with-engram`; `azure-devops` si
  `azure.enabled: true`. Evidencia: `src/cli/index.js`.

## Perfil `test` (overlay, `installProfileOverlay`)

Con `profile: test` (`--profile`, `test:playwright` como alias; `SUPPORTED_PROFILES =
general|test`; persistido en `.ancletorc`), `installProfileOverlay` reinstala
`profiles/test/agents` + `commands` sobre los destinos nativos del host (misma `ext` y mismo
adapter que la base; funciona con opencode, claude y copilot), `copyTemplates` lee
`profiles/test/templates/` (bloque LOCKED de convenciones Playwright) y se crea
`testspec/specs` + `testspec/changes` (`scaffoldTestspec`). El paquete base queda intacto y el
tier sigue ortogonal. Evidencia: `src/cli/index.js`, `profiles/test/`.

## Portabilidad entre máquinas (`export` / `import`)

`exportCmd` agrupa portables (`.ancletorc`, templates, `aspec/`, `.opencode/{agents,commands,skills}`)
+ `manifest.json` (`format: ancleto-export/1`; MCP como intención nombre+tipo, nunca rutas;
aborta si hay absolutos) a directorio o `--tar`. Excluye `opencode.json`, `.ancleto-tier`,
`memory.db`, `service.json` y global. `importCmd` aplica portables, reinstala assets del host,
re-aplica el tier y **regenera** el MCP local (`mcpCommandBroken` + `repairProjectMcp`: solo
rotas/ausentes, nunca sanas), cerrando con `doctor`. `import --repair` repara in place sin
bundle. Wrapper `/cleto-transplant` para invocarlo desde el IDE. Evidencia: `src/cli/index.js`.

## `check` / tier / `projects` host-aware

- **`localAgentDirs(rc, agent)`**: unión de `installedPaths.agents` ∪ destino del host
  (`AGENT_TARGETS[agent].agents.dir`). Evita el falso "tier sin agentes locales" en hosts como
  antigravity (`.agents/agents`).
- **`installedHostsFromPaths(ip)`**: deriva los hosts realmente instalados de `installedPaths`
  (unión de destinos escritos), no de un único `rc.agent`. Un proyecto multi-host suma los
  esperados de todos los hosts y evita huérfanos falsos.
- **`check`**: el `expected` de un directorio de skills incluye los command-skills cuando algún
  host instalado empaqueta commands como skill (`package:'skill-dir'` y mismo `dir`).
- **`installedExtFor`**: deriva la convención de nombre del host (p. ej. vscode
  `.agent.md`/`.prompt.md`) del mismo modelo de destino. Evidencia: `src/cli/index.js`.

## Flujo de alta (`initProject` / `install`)

1. Resuelve agente/IDE, tier (`scanTierFlag`/`readProjectTier`), idioma y perfil
   (`scanProfileFlag`: `general`|`test`, default `general`); wizard interactivo
   en TTY (`selectOption`, `askExcludePresets`, `selectMultiple` en `ui.js`).
2. `maybeImportOpenspec` (punto único antes del scaffold): clasifica `openspec/` con
   `detectLegacyOpenSpec` (`none`/`legacy`/`external`); legacy migra silencioso, externo pide
   confirmación (default No, `--yes` para script) e importa sin pisar el `AGENTS.md` local.
3. `copyTemplates` copia `AGENTS.md`/`PRODUCT.md` (del perfil si aplica) con `mergeLocked`:
   reemplaza el interior de los bloques `<!-- LOCKED: name -->`, preserva EXTENSIBLE, inserta
   bloques nuevos y no toca archivos con tags malformados (`extractLockedBlocks`,
   `replaceLockedBlock`, `findInsertAnchor`).
3. `installAgentAssets` materializa skills/agents/commands en el destino nativo del host
   (tabla anterior), adaptando el frontmatter de agents según el host; con perfil `test`,
   `installProfileOverlay` encima.
4. `scaffoldAspec` (+ `scaffoldTestspec` con perfil `test`) crean estructura sin pisar.
5. `applyTier` reescribe la línea `model:` de cada agente; resuelve `gratisModel`
   (env/persistido/probe) y lo guarda en `.ancletorc`. Paridad `init`/`install` en el tier
   guardado (v0.6.36/v0.6.37).
6. `setupHostMcp` configura el MCP del host de forma **no destructiva** (antigravity →
   `.agents/mcp_config.json`; copilot → `copilot-mcp.json`; resto → `opencode.json`):
   `ancleto-memory` y `caveman` por defecto, `engram` con `--with-engram`, `azure-devops` si
   `azure.enabled: true` y no `--no-mcp`. `upgrade` sin `.ancletorc` migra `openspec/` si lo
   hay en lugar de exigir `init`.
7. `writeManifest` actualiza `.ancletorc` y `registerProject` anota el repo en
   `~/.config/ancleto/projects.json` (override: `ANCLETO_PROJECTS_FILE`).
8. `refreshWorkingContext` regenera `.ancleto/working-context.md` desde la memoria.

## Migración/importación `openspec/` → `aspec/`

- `migrateLegacyOpenspec(projectDir)`: si no existe `openspec/` es no-op; si existe el marcador
  `.migrated-from-openspec` también. Si `aspec/` ya tiene **contenido real** (al menos una
  entrada en `changes/` o `specs/`; un `config.yaml` solo no cuenta) avisa y **no migra**
  (conserva `openspec/`). Si migra, copia recursiva con `force: false`, escribe el marcador y
  conserva `openspec/` como backup.
- `detectLegacyOpenSpec`: `none` (ausente o carpeta vacía), `legacy` (resto) o `external`
  (`specs/` con archivos o firma OpenSpec en `AGENTS.md`). Lo externo pide confirmación
  (Sí/No/ver, default No; `--yes` en no-TTY) e `importExternalOpenspec` importa sin pisar el
  `AGENTS.md` local (lo adopta si falta, con aviso).
- Ejecutores del invariante (`maybeImportOpenspec` antes del scaffold): `init`,
  `install --project` y `upgrade` (migratorio aun sin `.ancletorc`).
  Evidencia: `src/cli/index.js`, `aspec/specs/aspec-bootstrap/spec.md`.

## Reglas y convenciones

- **Cero dependencias**: todo con `node:*` y `spawn`; UI de terminal con Raw Mode propio.
- **Idempotencia y no destrucción**: `init`/`install` no pisan config ni documentos del usuario;
  los bloques LOCKED se re-aplican y el resto se preserva. `installedPaths` es la unión de
  destinos escritos (`unionInstalledPaths`); no se borran rutas previas.
- **Paridad `init`/`install`**: los flags (`--agent`, `--tier`, `--lang`, `--exclude`, `--no-mcp`)
  y el tier guardado se comportan igual en ambos, incluido re-init sin flags.
- **`--check` no empaqueta**: state-only sobre hashes; el pack se genera solo en `discovery`
  y no se consume contexto por defecto.
- **Errores no bloqueantes**: binarios ausentes (MCP/git/gh/az) y assets no soportados se omiten
  con warning a stderr.
- `ancleto --version` lee `package.json` en runtime (no hardcodeado).

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point; `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `installAgentAssets`, `installProfileOverlay`, `adaptAntigravityFrontmatter`, `ANTIGRAVITY_TOOL_MAP`, `installCommandSkills`, `setupHostMcp`, `mergeCopilotMcp`, `exportCmd`/`importCmd`, `detectLegacyOpenSpec`, `localAgentDirs`, `installedHostsFromPaths`, `writeManifest`, `migrateLegacyOpenspec`, `mergeLocked`. |
| `src/cli/ui.js` | Banner y menús TTY (`selectOption`, `selectMultiple`). |
| `templates/AGENTS.md`, `templates/PRODUCT.md` | Templates con bloques LOCKED/EXTENSIBLE. |
| `skills/*/SKILL.md` | Catálogo instalable; frontmatter adaptado por host en agents, copiado en skills. |
| `test/cli.test.js`, `test/content-guards.test.js` | Guardas del CLI y de contenido. |
| `README.md`, `BACKLOG.md` | Contrato operativo y backlog (M1, M2). |
