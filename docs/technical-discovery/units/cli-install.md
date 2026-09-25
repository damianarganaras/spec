---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, wizard TTY y MCP"
sources: ["src/cli/**"]
sourcesSha: 535607e41fa140edf2d051ffe67c6399ea451a86bf00a9d5719cf140e6ae44ae
generatedAt: 2026-09-25T14:03:34Z
pluginVersion: 0.6.37
skillVersion: '2.3'
---

# Unidad: CLI de instalación y orquestación

## Responsabilidad

`src/cli/index.js` es el **único entry point** (`bin.ancleto`/`bin.aspec`). Parseo de
comandos, instalación de assets, gestión de tiers, MCP, discovery, memoria, registro de
proyectos y diagnósticos. `src/cli/ui.js` aporta el wizard. Evidencia: `package.json`,
firmas del pack.

## Superficie de comandos

`install`, `update`, `upgrade`, `init`, `discovery` (`--check` / pack), `mcp`, `memory
(context|list|doctor)`, `specs check`, `stats`, `projects (list|scan|prune|info|update)`,
`check`, `doctor`, `--help`, `--version`. Evidencia: `src/cli/index.js`, `README.md`.

## Flujo de alta (`initProject` / `install`)

1. Resuelve agente/IDE (`resolveAgent`: `opencode|vscode|antigravity|cursor|roo`) y tier
   (`scanTierFlag`/`readProjectTier`), con wizard interactivo en TTY (`askAgent`,
   `askExcludePresets`, `selectMultiple` en `ui.js`).
2. `copyTemplates` copia `AGENTS.md`/`PRODUCT.md` con `mergeLocked`: reemplaza el interior de
   los bloques `<!-- LOCKED: name -->`, preserva EXTENSIBLE y no toca archivos con tags
   malformados (`extractLockedBlocks`, `replaceLockedBlock`, `findInsertAnchor`).
3. `copyAssets` + `installAgentSkills` escriben agents/commands/skills según el agente.
4. `applyTier` reescribe la línea `model:` de cada agente; resuelve `gratisModel`
   (env/persistido/probe) y lo guarda en `.ancletorc`. Corrige el “tier huérfano”: `init` con
   tier y re-init sin flags deben respetar el tier guardado (v0.6.36/v0.6.37).
5. `mergeMcp` fusiona MCP de forma **no destructiva** en la config del IDE: `ancleto-memory`
   y `caveman` por defecto, `engram` con `--with-engram`, `azure-devops` si
   `azure.enabled: true` y no `--no-mcp`.
6. `scaffoldAspec` crea `aspec/changes/` y `aspec/config.yaml` sin pisar lo existente.
7. `writeManifest` actualiza `.ancletorc` (`version`, `installedAt`, `installedPaths`) y
   `registerProject` anota el repo en `~/.config/ancleto/projects.json` (override:
   `ANCLETO_PROJECTS_FILE`).
8. `refreshWorkingContext` regenera `.ancleto/working-context.md` desde la memoria.

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

`src/cli/index.js`, `src/cli/ui.js`, `templates/AGENTS.md`, `templates/PRODUCT.md`,
`test/cli.test.js`, `test/content-guards.test.js`, `README.md`, `BACKLOG.md`.
