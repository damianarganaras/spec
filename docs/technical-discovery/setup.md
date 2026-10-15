---
node: setup
kind: setup
read_when: "instalar, ejecutar, comandos CLI, entorno, tiers, contrato de validaciones"
generatedAt: 2026-10-15T11:49:04Z
pluginVersion: 0.13.0
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
ancleto init [--agent <host>] [--tier normal|minimo|gratis] [--lang es|en|pt|auto] [--exclude <globs>] [--profile general|test] [--with-azure] [--no-mcp]
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
el MCP del host por defecto; `--no-mcp` lo evita. `--agent` acepta 8 hosts (`opencode`
default, `claude`, `vscode`, `antigravity`, `cursor`, `roo`, `copilot`, `commandcode`).

## Configuración persistida

- **`.ancletorc`** (raíz): manifiesto de instalación (`schemaVersion`, `version`,
  `installedAt`, `installedPaths`) + `discovery` (`outputDir`, `exclude`), `agent`,
  `language`, `profile` (`general`|`test`), `azure.enabled`, `gratisModel`. `installedPaths`
  guarda la **unión de destinos realmente escritos** por host (`templates`, `agents`,
  `commands`, `skills`); para antigravity `commands` queda vacío (los commands viven como
  skills). **No editar a mano durante el seed**; se consume resuelto desde
  `ancleto discovery --check`. En este checkout `.ancletorc` **existe** (gitignored, no
  versionado); el contrato de contenido se describe por código, no por lectura directa.
- **Perfil `test`** (`--profile test`, `profiles/test/`): overlay de tester/reviewer ampliados
  (planning/generation/healing/coverage), comandos `cleto-test-*`, estructura `testspec/` y
  bloque LOCKED de convenciones Playwright; instalable con cualquier host.
- **Tier del proyecto**: `readProjectTier` lee `.ancleto-tier` en la raíz o en `.opencode/`.
  En este checkout existe `.opencode/.ancleto-tier` con valor `minimo`, por lo que el tier
  resuelto es **`minimo`**. El tier decide modelos de los agents y la agresividad del pack.
  Evidencia: `src/core/repomix-tier.js`, `.opencode/.ancleto-tier`, `ancleto discovery --check`.
- **Destinos por host (`AGENT_TARGETS`)**: fuente única de rutas de skills/agents/commands por
  IDE (`.opencode/*`, `.claude/*`, `.github/*`, `.agents/*`, `.cursor/skills`, `.roo/skills`,
  `.commandcode/*`). Los agents de claude/vscode/antigravity/copilot/commandcode se adaptan de
  frontmatter. Detalle: `units/cli-install.md`.
- **MCP del host** (dos excepciones de host-MCP): antigravity en `.agents/mcp_config.json` y
  commandcode en `.mcp.json`; copilot en `copilot-mcp.json`; el resto en
  `.opencode/opencode.json` (ver `integrations.md`).
- **`AGENTS.md` y bloques `LOCKED`**: `install`/`update`/`upgrade` re-aplican el interior de
  los bloques `<!-- LOCKED: name -->` y preservan el resto (EXTENSIBLE), tras reconciliar
  superficies planas legadas. Bloques canónicos actuales: **`validation-commands`** (política
  declarativa de validaciones), `memory-boundary`, `artifacts-language` y `seed-freshness`,
  más `test-block`. Evidencia: `src/cli/index.js` (`mergeTemplateInto`, `mergeLocked`,
  `reconcileLegacyBlocks`), `templates/AGENTS.md`, `AGENTS.md`.
- **`.ancleto/`**: memoria local (`memory.db`, `working-context.md`); ignorado por git.

## Tiers de costo

| Tier | Modelos y empaquetado |
|---|---|
| `normal` | Modelos balanceados (`qwen3.7-plus`, `minimax-m3`, etc.), pack sin comprimir ni ignores extra. Default. |
| `minimo` | Un único modelo `opencode-go/deepseek-v4.1-flash` para los 10 agents; pack comprimido (`--compress`) y excluye `test/**`, `docs/**`, `**/*.md`. **Tier resuelto en este checkout.** |
| `gratis` | Muse Spark 1.3 Free si está habilitado en la cuenta; fallback `opencode/big-pickle`; token budget estricto (50k). Mismos ignores que `minimo`. |

Evidencia: `src/core/tier-models.js`, `src/core/repomix-tier.js`, `README.md`.
Nota: `readProjectTier` cae en `gratis` **por default** cuando no existe `.ancleto-tier`; el
tier resuelto en este checkout es `minimo` por el archivo del proyecto.

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

El contrato es **declarativo** (change archivado `2026-10-14-contrato-validaciones`):

- **Fuente única**: el proyecto declara sus comandos en `PRODUCT.md` → `## Project Commands`.
  La política vive en `AGENTS.md` / `templates/AGENTS.md` → bloque `LOCKED: validation-commands`
  y **prohíbe** inventar un runner/linter/formatter/typechecker. Si un comando no está
  declarado, la validación se **saltea y se registra la omisión**.
- **Este repo declara**: **Lint** `npm run lint` (`eslint src/ test/`) y **Tests** `npm test`
  (`node --test "test/*.test.js"`). Evidencia: `package.json`.
- **Format check**: `not-configured` — el repo no declara formatter (no es un fallo).
- **Typecheck**: no aplica — paquete JavaScript sin `tsconfig.json` (pese a que `AGENTS.md`
  mantiene la regla genérica de template "TypeScript strict" en "Guardrails & Conventions").
- **Tests acotados**: para validar un subconjunto, pasar **rutas explícitas** al archivo
  relevante; **nunca** `node --test` sin acotar (descubre archivos fuera de la suite declarada).
- **Suite**: 10 archivos (`adapters-frontmatter`, `cli`, `content-guards`, `discovery-tier`,
  `discovery-topology`, `linter-config`, `mcp`, `memory-engine`, `tier-models`,
  `working-context`); `content-guards` asierta **behavior** (keywords y salvaguardas), no la
  redacción literal. La cifra de tests en verde **no se re-ejecutó** en esta regeneración
  (el tier `minimo` excluye `test/**` del pack). Evidencia: `test/`, `aspec/specs/prompt-contracts/spec.md`.
- **CI**: `.github/workflows/publish.yml` corre `npm ci` + `npm run lint` + `node --test
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
  Única fuente canónica del texto: `LOCKED: artifacts-language` en `AGENTS.md`; las skills y
  agentes la referencian. Evidencia: `AGENTS.md`, `templates/AGENTS.md`.
