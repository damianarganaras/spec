---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas de skills por agente, frontmatter, wizard y MCP"
sources: ["src/cli/**"]
sourcesSha: e4ca5aa8cab5c80704b14f32531d4cff5d5fc589a24b184a5b96b8bd19173ac3
generatedAt: 2026-09-30T14:03:46Z
pluginVersion: 0.7.1
skillVersion: '2.3'
---

# Unidad: CLI de instalación y orquestación

## Responsabilidad

`src/cli/index.js` es el **único entry point** (`bin.ancleto`/`bin.aspec`). Parseo de
comandos, instalación de assets, resolución de agente/IDE, instalación de skills por agente,
gestión de tiers, MCP, discovery, memoria, registro de proyectos y diagnósticos. `src/cli/ui.js`
aporta el wizard. Evidencia: `package.json`, `src/cli/index.js`.

## Superficie de comandos

`install`, `update`, `upgrade`, `init`, `discovery` (`--check` / pack), `mcp`, `memory
(context|list|doctor)`, `specs check`, `stats`, `projects (list|scan|prune|info|update)`,
`list --projects`, `check`, `doctor`, `--help`, `--version`. Evidencia: `src/cli/index.js`, `README.md`.

## Instalación de skills por agente (área clave)

- **`SUPPORTED_AGENTS = ['opencode','vscode','antigravity','cursor','roo']`**; default
  `opencode`. `scanAgentFlag` valida `--agent` y `resolveAgent` prioriza flag → `.ancletorc`
  (`agent`) → wizard TTY → default.
- **`AGENT_SKILLS_DIR`** mapea el IDE a su carpeta de skills:

  | Agente | Directorio |
  |---|---|
  | `opencode` | `.opencode/skills` |
  | `vscode` | `.vscode/skills` |
  | `antigravity` | `.antigravity/skills` |
  | `cursor` | `.cursor/skills` |
  | `roo` | `.roo/skills` |

- **`installAgentSkills(projectDir, agent)`** (dueño único): resuelve el directorio con
  `AGENT_SKILLS_DIR[agent]` (fallback a `opencode`), crea el destino y copia las 11 skills de
  ciclo (`ANCLETO_SKILLS`: `ancleto-new`, `-propose`, `-apply`, `-verify`, `-archive`,
  `-bulk-archive`, `-continue`, `-explore`, `-ff`, `-onboard`, `-workflow`). Si el agente **no**
  es `opencode`, copia además el árbol `skills/` completo (auxiliares: `ancleto-commit`,
  `ancleto-pr`, `triage-clarifier`, `ancleto-technical-discovery`, `ancleto-upgrade`,
  `ancleto-recall`, `ancleto-sync-specs`). Devuelve el path relativo con `/`.
- **Frontmatter de skills: copia literal.** `installAgentSkills` hace `cp` recursivo y no
  transforma el frontmatter (`name`, `description`, `license`, `compatibility`, `metadata`);
  el mismo archivo se copia a cualquier IDE. La adaptación dinámica por IDE (**A1**) está
  **planeada y sin implementar** en v0.7.0. Evidencia: `src/cli/index.js`, `BACKLOG.md` (A1),
  `skills/*/SKILL.md`.
- Los **agents/commands** no se instalan por agente: se copian siempre a `.opencode/agents` y
  `.opencode/commands` (proyecto) o al directorio global de config.
- **Manifiesto `.ancletorc`**: `writeManifest` escribe `schemaVersion`, `version` (= versión
  del paquete), `installedAt`, `installedPaths` (`templates: [AGENTS.md, PRODUCT.md]`,
  `agents: ['.opencode/agents']`, `commands: ['.opencode/commands']`, `skills: [agentSkillsDir]`),
  `agent`, `language`, `discovery` y `gratisModel`. `ancleto check` compara los archivos
  instalados contra ese manifiesto. Evidencia: `src/cli/index.js`.

## Flujo de alta (`initProject` / `install`)

1. Resuelve agente/IDE, tier (`scanTierFlag`/`readProjectTier`) e idioma; wizard interactivo
   en TTY (`selectOption`, `askExcludePresets`, `selectMultiple` en `ui.js`).
2. `copyTemplates` copia `AGENTS.md`/`PRODUCT.md` con `mergeLocked`: reemplaza el interior de
   los bloques `<!-- LOCKED: name -->`, preserva EXTENSIBLE, inserta bloques nuevos y no toca
   archivos con tags malformados (`extractLockedBlocks`, `replaceLockedBlock`, `findInsertAnchor`).
3. `copyAssets` (agents/commands/skills) + `installAgentSkills` escriben en el directorio del
   agente según la tabla anterior.
4. `migrateLegacyOpenspec` migra `openspec/` → `aspec/` si procede (ver reglas).
5. `scaffoldAspec` crea `aspec/changes/` y `aspec/config.yaml` sin pisar lo existente.
6. `applyTier` reescribe la línea `model:` de cada agente; resuelve `gratisModel`
   (env/persistido/probe) y lo guarda en `.ancletorc`. Paridad `init`/`install` en el tier
   guardado (v0.6.36/v0.6.37).
7. `mergeMcp` fusiona MCP de forma **no destructiva** en la config del IDE: `ancleto-memory`
   y `caveman` por defecto, `engram` con `--with-engram`, `azure-devops` si
   `azure.enabled: true` y no `--no-mcp`.
8. `writeManifest` actualiza `.ancletorc` y `registerProject` anota el repo en
   `~/.config/ancleto/projects.json` (override: `ANCLETO_PROJECTS_FILE`).
9. `refreshWorkingContext` regenera `.ancleto/working-context.md` desde la memoria.

## Migración legacy `openspec/` → `aspec/`

- `migrateLegacyOpenspec(projectDir)`: si no existe `openspec/` es no-op; si existe el marcador
  `.migrated-from-openspec` también. Si `aspec/` ya tiene **contenido real** (al menos una
  entrada en `changes/` o `specs/`; un `config.yaml` solo no cuenta) avisa y **no migra**
  (conserva `openspec/`). Si migra, copia recursiva con `force: false`, escribe el marcador y
  conserva `openspec/` como backup.
- Ejecutores del invariante: `init`, `install --project` y `upgrade` (antes del scaffold).
  Evidencia: `src/cli/index.js`, `aspec/specs/aspec-bootstrap/spec.md`.

## Reglas y convenciones

- **Cero dependencias**: todo con `node:*` y `spawn`; UI de terminal con Raw Mode propio.
- **Idempotencia y no destrucción**: `init`/`install` no pisan config ni documentos del usuario;
  los bloques LOCKED se re-aplican y el resto se preserva.
- **Paridad `init`/`install`**: los flags (`--agent`, `--tier`, `--lang`, `--exclude`) y el tier
  guardado se comportan igual en ambos, incluido re-init sin flags.
- **`--check` no empaqueta**: state-only sobre hashes; el pack se genera solo en `discovery`
  y no se consume contexto por defecto.
- **Errores no bloqueantes**: binarios ausentes (MCP/git/gh/az) se omiten con warning.
- `ancleto --version` lee `package.json` en runtime (no hardcodeado).

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point; `AGENT_SKILLS_DIR`, `ANCLETO_SKILLS`, `installAgentSkills`, `SUPPORTED_AGENTS`, `writeManifest`, `migrateLegacyOpenspec`, `mergeLocked`. |
| `src/cli/ui.js` | Banner y menús TTY (`selectOption`, `selectMultiple`). |
| `templates/AGENTS.md`, `templates/PRODUCT.md` | Templates con bloques LOCKED/EXTENSIBLE. |
| `skills/*/SKILL.md` | Catálogo instalable; frontmatter propio copiado tal cual. |
| `test/cli.test.js`, `test/content-guards.test.js` | Guardas del CLI y de contenido. |
| `README.md`, `BACKLOG.md` | Contrato operativo y backlog (A1, M1, M2). |
