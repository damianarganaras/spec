---
node: setup
kind: setup
read_when: "instalar, ejecutar, comandos CLI, entorno, tiers y validaciones"
generatedAt: 2026-10-02T17:35:00Z
pluginVersion: 0.10.0
skillVersion: '2.3'
---

# Setup y operación

## Requisitos

| Requisito | Detalle | Evidencia |
|---|---|---|
| Node.js ≥ 24.0.0 | Obligatorio: el motor de memoria usa el módulo nativo `node:sqlite`. | `package.json` (`engines.node`), `README.md` |
| Repomix | Opcional: se resuelve por `PATH` o vía `npx -y repomix@1.18.0`. | `src/cli/index.js`, pack |
| Git | Para el ciclo de changes y el workflow de publish. | `BACKLOG.md`, `.github/workflows/publish.yml` |

## Instalación y CLI

```bash
npm install                      # deps de desarrollo (eslint, globals); runtime sin deps
npm install -g @ancleto/spec     # instalación global del CLI
ancleto init [--agent opencode|claude|vscode|antigravity|cursor|roo|copilot] [--tier normal|minimo|gratis] [--lang es|en|pt|auto] [--exclude <globs>] [--profile general|test] [--with-azure] [--no-mcp]
ancleto install [--project <dir>] [--global] [--no-mcp] [--with-engram] [--tier ...] [--agent ...] [--profile ...]
ancleto update                    # re-instala la última versión sobre lo existente
ancleto upgrade [--agent <nombre>] [--profile <perfil>]  # re-aplica templates (LOCKED) y assets respetando personalizaciones
ancleto export [--tar <file>]     # bundle portable + manifest.json sin rutas
ancleto import <bundle> [--repair] | ancleto import --repair  # restaura regenerando el MCP local
ancleto discovery --check         # estado del seed en JSON (READY/STALE/PARTIAL/MISSING) + config
ancleto discovery [--compress] [--include <glob>] [--ignore <glob>] [--token-budget <n>]
ancleto mcp                       # servidor MCP stdio de memoria propia
ancleto memory context [--scope X] [--out <archivo>]
ancleto memory list [--type X] [--scope X] [--all] [--json]
ancleto memory doctor [--rebuild]
ancleto memory export [--out <archivo>]   # nodos activos a JSON (stdout o archivo)
ancleto memory import <archivo>           # upsert por memory_key, idempotente
ancleto memory gc [--dry-run] [--days N]  # purga superseded con antigüedad > N días (default 30)
ancleto specs check [--change <name>] [--json]
ancleto stats [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>] [--json]
ancleto projects list|scan <raiz>|prune|info|update [--all] [--json]
ancleto check | doctor
```

Evidencia: `src/cli/index.js`, `README.md`. `install` sin `--project`/`--global` opera sobre
el proyecto actual si hay `.ancletorc`; `--global` fuerza el alcance global. `init` configura
el MCP del host por defecto; `--no-mcp` lo evita.

## Configuración persistida

- **`.ancletorc`** (raíz): manifiesto de instalación (`schemaVersion`, `version`,
  `installedAt`, `installedPaths`) + `discovery` (`outputDir`, `exclude`), `agent`, `language`,
  `profile` (`general`|`test`), `azure.enabled`, `gratisModel`. `installedPaths` guarda la
  **unión de destinos realmente escritos** por host (`templates`, `agents`, `commands`,
  `skills`); para antigravity `commands` queda vacío (los commands viven como skills). **No
  editar a mano durante el seed**; se consume resuelto desde `ancleto discovery --check`.
  En este checkout `.ancletorc` **no existe** (gitignored, eliminado), por lo que aplican los
  defaults: `outputDir: docs/technical-discovery`, `exclude: []`.
- **Perfil `test`** (`--profile test`, `profiles/test/`): overlay de tester/reviewer ampliados
  (planning/generation/healing/coverage), comandos `cleto-test-*`, estructura `testspec/` y
  bloque LOCKED de convenciones Playwright; instalable con cualquier host (incluido copilot).
- **Tier del proyecto**: `readProjectTier` lee `.ancleto-tier` en la raíz o en `.opencode/`.
  En este checkout no existe ninguno de los dos, por lo que el tier resuelto es **`gratis`**
  (default). El tier decide modelos de los agents y la agresividad del pack. Evidencia:
  `src/core/repomix-tier.js`, `ancleto discovery --check`.
- **Destinos por host (`AGENT_TARGETS`)**: fuente única de rutas de skills/agents/commands por
  IDE (`.opencode/*`, `.claude/*`, `.github/*`, `.agents/*`, `.cursor/skills`, `.roo/skills`).
  Los agents de claude/vscode/antigravity/copilot se adaptan de frontmatter. Detalle:
  `units/cli-install.md`.
- **MCP del host**: antigravity en `.agents/mcp_config.json`; el resto en
  `.opencode/opencode.json` (ver `integrations.md`).
- **`.ancleto/`**: memoria local (`memory.db`, `working-context.md`); ignorado por git.

## Tiers de costo

| Tier | Modelos y empaquetado |
|---|---|
| `normal` | Modelos balanceados (`qwen3.7-plus`, `minimax-m3`, etc.), sin restricción de pack. |
| `minimo` | Un único modelo `opencode-go/deepseek-v4.1-flash` para los 10 agents; pack comprimido y excluye tests/docs/markdown. |
| `gratis` | Muse Spark 1.3 Free si está habilitado en la cuenta; fallback `opencode/big-pickle`; token budget estricto (50k). Mismos ignores que `minimo`. |

Evidencia: `src/core/tier-models.js`, `src/core/repomix-tier.js`, `README.md`.

## Variables de entorno

Solo nombres; **valores omitidos** (ver riesgo de secretos en `decisions.md`):

- `ANCLETO_PROJECTS_FILE` — ruta alternativa del registro global de proyectos.
- `ANCLETO_MUSE_SPARK` — `1`/`0` fuerza/niega Muse Spark en tier gratis.
- `NO_COLOR` — desactiva color en la salida del CLI.
- `XDG_CONFIG_HOME` — base del registro global (`~/.config/ancleto/`, `~/.config/opencode/`).
- `NPM_TOKEN` — secreto del workflow de publish (GitHub Actions).
- Azure DevOps (opcional): `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PAT`.

Evidencia: `README.md`, `src/cli/index.js`, `.github/workflows/publish.yml`.

## Tests y validaciones

- **Lint**: `npm run lint` → `eslint src/ test/` (flat config `eslint.config.js`, 4 reglas:
  `no-undef`, `no-unused-vars`, `eqeqeq`, `no-dupe-keys`). Exit 0 sin violaciones.
  Evidencia: `package.json`, `eslint.config.js`.
- **Suite**: `npm test` → `node --test "test/*.test.js"` (10 archivos: `adapters-frontmatter`,
  `cli`, `content-guards`, `discovery-tier`, `discovery-topology`, `linter-config`, `mcp`,
  `memory-engine`, `tier-models`, `working-context`). **381 tests / 82 suites en verde** en
  v0.10.0. Evidencia: `test/`, ejecución local.
- Validaciones obligatorias del repo (definidas en `AGENTS.md`): `npm run typecheck` o
  `npx tsc --noEmit`, `npm run lint`, `npm test`. **Observación**: este repo es JavaScript
  puro y `package.json` **no define** `typecheck`; `lint` y `test` sí existen desde el change
  `add-standard-linter`. Evidencia: `package.json`, `AGENTS.md`.
- CI: `.github/workflows/publish.yml` corre `npm ci` + `npm run lint` + `node --test
  test/*.test.js` y publica a npm al pushear un tag `v*` (o `workflow_dispatch`), con canary
  no bloqueante y creación del Release. El lint bloquea el publish. Evidencia:
  `.github/workflows/publish.yml`.

## Convenciones de trabajo

- Conventional Commits (`feat(scope):`, `fix(scope):`, ...); no commitear a `main`/`master`
  (protección honor-based, ver `BACKLOG.md` B3). Evidencia: `AGENTS.md`.
- Fuente de verdad: rama `development`; cada commit de feature lleva su version bump antes de
  pushear. Evidencia: `AGENTS.md`, `BACKLOG.md`.
- Idioma de artifacts: español (`language: "es"` en el repo dogfooded); keywords y nombres de
  archivo siempre en inglés literal (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`/`AND`).
  Evidencia: `AGENTS.md`.
