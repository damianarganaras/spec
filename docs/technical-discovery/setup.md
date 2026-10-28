---
node: setup
kind: setup
read_when: "instalar, ejecutar, comandos CLI, entorno, tiers, contrato de validaciones"
generatedAt: 2026-10-28T20:24:06Z
pluginVersion: 0.15.3
skillVersion: '2.3'
---

# Setup y operación

## Requisitos

| Requisito | Detalle | Evidencia |
|---|---|---|
| Node.js ≥ 24.0.0 | Obligatorio: el motor de memoria usa el módulo nativo `node:sqlite`. | `package.json` (`engines.node`), `README.md` |
| Repomix | Opcional: se resuelve por `PATH` o vía `npx -y repomix@1.18.0`. | `src/cli/index.js`, pack |
| Git | Necesario para el ciclo de changes, el workflow de publish, la exclusión local de `.ancleto/machine-env.md` y el `git status --short` que el intake del orquestador delega a `@technical-discovery`. Si falta, el CLI degrada con warning. | `.github/workflows/publish.yml`, `src/core/machine-env.js`, `agents/orchestrator.md` |

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
ancleto affected [--cwd <dir>] [--json] <archivo...>   # affected-set read-only (grafo de imports)
ancleto mcp                       # servidor MCP stdio de memoria propia
ancleto memory context [--scope X] [--out <archivo>]
ancleto memory list [--type X] [--scope X] [--all] [--json]
ancleto memory doctor [--rebuild]   # integridad read-only + advisory de frescura del working-context
ancleto memory export [--out <archivo>]        # nodos activos a JSON (stdout o archivo)
ancleto memory import <archivo>                # upsert por memory_key, idempotente; refresca el working-context
ancleto memory gc [--dry-run] [--days N]       # purga superseded con antigüedad > N días (default 30)
ancleto memory snapshot --out <archivo.db> [--force] [--json]   # copia consistente con historial
ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]   # supersede sources hacia el target
ancleto specs check [--change <name>] [--json]
ancleto stats [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>] [--json]
ancleto stats failures [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>] [--class <env|check|tool|unknown,...>] [--tool <t,...>] [--json]
ancleto projects list|scan <raiz>|prune|info|update [--all] [--json]
ancleto check | doctor
```

Evidencia: `src/cli/index.js` (texto de `--help` incluido), `README.md`,
`aspec/specs/memory-ops/spec.md`, `aspec/specs/session-failure-report/spec.md`.
`install` sin `--project`/`--global` opera sobre el proyecto actual si hay `.ancletorc`;
`--global` fuerza el alcance global. `init` configura el MCP del host por defecto; `--no-mcp`
lo evita. `--agent` acepta 8 hosts (`opencode` default, `claude`, `vscode`, `antigravity`,
`cursor`, `roo`, `copilot`, `commandcode`). `ancleto affected` es **read-only**: reporta el
`affected-set` por stdout, los inconclusos por stderr y omite la línea de externos cuando el
conteo es 0 (`externalCount` sigue en `--json`). `stats failures` también es **read-only** y
solo funciona con la base de sesiones de opencode.

**Ops nuevas de memoria** (PR-1, archivado `2026-10-28-reingenieria-memoria-first`):
`memory snapshot` exige `--out` y rechaza sobrescribir sin `--force`; produce una copia con
historial (`superseded` + `superseded_by`) y no modifica la fuente. `memory merge` requiere
`--target` y `--sources` (lista separada por comas); valida target activo, sources activas,
sin repetidas y con el mismo `type`, y aplica todo en una única transacción (`--dry-run` no
escribe la base ni el working-context). Evidencia: `src/cli/index.js`
(`memorySnapshot`, `memoryMerge`), `src/core/memory/snapshot.js`,
`src/core/memory/engine.js` (`validateMerge`, `merge`).

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
  En este checkout `.opencode/.ancleto-tier` contiene **`minimo`**, por lo que el tier resuelto
  es `minimo` (`--compress`, ignora `test/**`, `docs/**`, `**/*.md`, **sin token budget**; el
  pack real de esta corrida quedó en 689 archivos / ~16.512 tokens). El tier decide modelos de
  los agents y la agresividad del pack. Evidencia: `src/core/repomix-tier.js`,
  `.opencode/.ancleto-tier`, `ancleto discovery --check`.
- **Destinos por host (`AGENT_TARGETS`)**: fuente única de rutas de skills/agents/commands por
  IDE (`.opencode/*`, `.claude/*`, `.github/*`, `.agents/*`, `.cursor/skills`, `.roo/skills`,
  `.commandcode/*`). Los agents de claude/vscode/antigravity/copilot/commandcode se adaptan de
  frontmatter. Detalle: `units/cli-install.md`.
- **MCP del host** (excepciones de host-MCP): antigravity en `.agents/mcp_config.json`,
  commandcode en `.mcp.json` y copilot en `copilot-mcp.json`; el resto en
  `.opencode/opencode.json` (ver `integrations.md`).
- **`AGENTS.md` y bloques `LOCKED`**: `install`/`update`/`upgrade` re-aplican el interior de
  los bloques `<!-- LOCKED: name -->` y preservan el resto (EXTENSIBLE), tras reconciliar
  superficies planas legadas. Bloques canónicos actuales: **`validation-commands`**,
  `memory-boundary`, `artifacts-language` y `seed-freshness`, más `test-block`. Evidencia:
  `src/cli/index.js` (`mergeTemplateInto`, `mergeLocked`, `reconcileLegacyBlocks`),
  `templates/AGENTS.md`, `AGENTS.md`.
- **`.ancleto/`**: memoria local (`memory.db`, `working-context.md`) y **entorno de máquina**
  (`machine-env.md`); ignorado por git en este repo. `machine-env.md` no se versiona y no se
  edita a mano. `.ancleto/memory.db` es la fuente que consumen `memory snapshot` y
  `memory merge`; el snapshot es la copia que se usa para rollback/auditoría.
- **`machine-env.md`**: artefacto derivado y local. Se genera/regenera en `ancleto init`,
  `ancleto install --project` y `ancleto upgrade`; si los hechos no cambian, no se reescribe
  (se ignora `generated_at` en la comparación). La exclusión se escribe en
  `git rev-parse --git-path info/exclude`, **nunca** en `.gitignore`, con el patrón
  repo-root-relative `<prefix>.ancleto/machine-env.md`. `ancleto check` advierte (sin cambiar
  el exit code) si el artefacto quedó trackeado. Evidencia: `src/core/machine-env.js`,
  `aspec/specs/machine-environment/spec.md`.

## Entorno de máquina (`.ancleto/machine-env.md`)

Contenido mínimo (spec `machine-environment`, 8 requirements / 53 scenarios):

- plataforma (`win32`/`linux`/`darwin`/otra), release y arquitectura;
- shell detectado y `shell_source` (`MSYSTEM`, `CYGWIN`, `PSModulePath`, `PROMPT`, `SHELL`,
  `WSL_DISTRO_NAME`, `WSL_INTEROP` o `unknown`), sin ejecutar ningún shell para probarlo;
- EOL esperado (`lf`/`crlf`) y `eol_source` (`gitattributes`, `core.eol`, `core.autocrlf` o
  `platform-default`);
- disponibilidad de `rg`, `node`, `npm`, `git` y `python` —**resoluble e invocable**, no solo
  presente en `PATH`— (sin versiones) y fallback por herramienta ausente;
- fecha de generación, versión de ancleo y un `## Hint` con la regla de precedencia.

Precedencia del shell en Windows: MSYS/Cygwin → `bash`; `PSModulePath` con marcador de
PowerShell 7 → `PowerShell 7`; `PROMPT` → `cmd`; `SHELL` POSIX + marcador legacy → `unknown`;
`SHELL` POSIX → ese shell; solo marcador legacy → `Windows PowerShell 5.1`; si no, `unknown`.
`ComSpec` **no** se usa como evidencia. No se renderizan secretos, tokens, valores de `PATH`
ni versiones de herramientas. Los 10 agents contienen la instrucción canónica de leer el
archivo antes de ejecutar comandos; `agents/orchestrator.md` agrega `## Machine Environment`,
lo incluye verbatim en delegaciones con `bash: true` y exime esa lectura del techo de 3
archivos. Evidencia: `src/core/machine-env.js`, `agents/*.md`,
`aspec/specs/machine-environment/spec.md`.

**Sonda de invocabilidad**: una herramienta se declara `disponible` solo si el candidato
resuelto en `PATH` **se ejecuta con éxito** con la bandera `--version`; estar en `PATH` no
basta. Cada intento está acotado a **2 s** (`TOOL_PROBE_TIMEOUT_MS`) y la corrida a un
presupuesto acumulado de **10 s** (`TOOL_PROBE_BUDGET_MS`); las invocaciones de `git` usadas
para el EOL están acotadas a **5 s** (`GIT_TIMEOUT_MS`). En `win32` los shims `.cmd`/`.bat` se
sondean por `process.env.ComSpec` (`/d /s /c` + `windowsVerbatimArguments`); la guarda `EINVAL`
de Node (CVE-2024-27980) es **inconclusa**, nunca `bloqueado`, y un candidato que se abandona
por presupuesto agotado también. Un fallo real se publica como sufijo aditivo
`- <tool>: no disponible — fallback: <X> — bloqueado: <fallo saneado>`, con el texto saneado
(sin ANSI/OSC ni caracteres de control, espacios colapsados, tope de 200 caracteres); un veredicto
inconcluso no lleva sufijo. La versión observada nunca se renderiza. Evidencia:
`src/core/machine-env.js`, `aspec/specs/machine-environment/spec.md`.

**Estado en este checkout**: el artefacto **existe** (generado el 2026-10-27): `win32` /
`10.0.26200` / `x64`, shell `Windows PowerShell 5.1` (`shell_source: PSModulePath`), EOL `lf`
(`eol_source: gitattributes`), `rg` **no disponible** (fallback: `Select-String`),
`node`/`npm`/`git`/`python` **disponibles** —resolubles **e invocables** según la sonda; el
artefacto declara disponibilidad, no versión—, `ancleto: 0.15.3`. La exclusión local está
escrita en `info/exclude`. Evidencia: `.ancleto/machine-env.md`.

## Permisos de shell por agente

El bloque `tools`/`permission` de cada definición de agente es la frontera de privilegio:

| Agente | Shell |
|---|---|
| `@orchestrator`, `@reviewer`, `@spec-writer`, `@memory-keeper` | `bash: false` — no ejecutan comandos. |
| `@coder`, `@tester`, `@documenter`, `@context-resolver`, `@technical-discovery`, `@technical-seed-writer` | `bash: true`. |
| `@technical-discovery` | `permission.bash` con `'*': deny` y **exactamente dos literales permitidos**: `'ancleto discovery --check'` y `'git status --short'`. El segundo existe para que el intake de sesión del orquestador obtenga el estado del árbol sin que el orquestador tenga shell. |

Evidencia: `agents/*.md`, `agents/technical-discovery.md`, `aspec/specs/prompt-contracts/spec.md`.

## Tiers de costo

| Tier | Modelos y empaquetado |
|---|---|
| `normal` | Modelos balanceados (`qwen3.7-plus`, `minimax-m3`, etc.), pack sin comprimir ni ignores extra, sin token budget. |
| `minimo` | Un único modelo `opencode-go/deepseek-v4.1-flash` para los 10 agents; pack comprimido (`--compress`), excluye `test/**`, `docs/**`, `**/*.md` y **no fija token budget**. **Tier resuelto en este checkout.** |
| `gratis` | Muse Spark 1.3 Free si está habilitado en la cuenta; fallback `opencode/big-pickle`; mismo empaquetado que `minimo` + token budget estricto (50k). |

Evidencia: `src/core/tier-models.js`, `src/core/repomix-tier.js` (`TIER_PACK_CONFIG`),
`README.md`.
Nota: `readProjectTier` cae en `gratis` **por default** cuando no existe `.ancleto-tier`; aquí
existe `.opencode/.ancleto-tier` con `minimo`.

## Variables de entorno

Solo nombres; **valores omitidos** (ver riesgo de secretos en `decisions.md`):

- `ANCLETO_PROJECTS_FILE` — ruta alternativa del registro global de proyectos.
- `ANCLETO_MUSE_SPARK` — `1`/`0` fuerza/niega Muse Spark en tier gratis.
- `NO_COLOR` — desactiva color en la salida del CLI.
- `XDG_CONFIG_HOME` — base del registro global (`~/.config/ancleto/`, `~/.config/opencode/`).
- `NPM_TOKEN` — secreto del workflow de publish (GitHub Actions).
- Azure DevOps (opcional): `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PAT`.
- Detección de shell/EOL (solo se leen, nunca se renderizan valores): `MSYSTEM`, `CYGWIN`,
  `PSModulePath`, `PROMPT`, `SHELL`, `WSL_DISTRO_NAME`, `WSL_INTEROP`, `PATH`, `PATHEXT`.

Evidencia: `README.md`, `src/cli/index.js`, `src/core/machine-env.js`,
`.github/workflows/publish.yml`.

## Tests y validaciones

El contrato es **declarativo** (change archivado `2026-10-14-contrato-validaciones`):

- **Fuente única**: el proyecto declara sus comandos en `PRODUCT.md` → `## Project Commands`.
  La política vive en `AGENTS.md` / `templates/AGENTS.md` → bloque `LOCKED: validation-commands`
  y **prohíbe** inventar un runner/linter/formatter/typechecker. Si un comando no está
  declarado, la validación se **saltea y se registra la omisión**.
- **Este repo declara**: **Lint** `npm run lint` (`eslint src/ test/`) y **Tests** `npm test`
  (`node --test "test/*.test.js"`). Evidencia: `package.json`.
- **Format check**: `not-configured` — el repo no declara formatter (no es un fallo).
- **Typecheck**: no aplica — paquete JavaScript sin `tsconfig.json` (pesa que `AGENTS.md`
  mantiene la regla genérica de template "TypeScript strict" en "Guardrails & Conventions").
- **Tests acotados**: para validar un subconjunto, pasar **rutas explícitas** al archivo
  relevante; **nunca** `node --test` sin acotar (descubre archivos fuera de la suite declarada).
- **Suite**: 15 archivos (`adapters-frontmatter`, `affected-set`, `cli`, `content-guards`,
  `discovery-tier`, `discovery-topology`, `linter-config`, `machine-env`, `mcp`,
  `memory-engine`, **`memory-fixtures`**, **`memory-pr1-contract`**, `stats-failures`,
  `tier-models`, `working-context`), con fixtures en `test/fixtures/` (`seed.json` en formato
  `exportActive()`, `golden.json` M01–M10). `content-guards` asierta **behavior** (keywords y
  salvaguardas), no la redacción literal. La cifra en verde **no se re-ejecutó** en esta
  regeneración (la validación del seed es state-only). Evidencia: `test/`,
  `aspec/specs/memory-ops/spec.md`, `aspec/specs/machine-environment/spec.md`,
  `aspec/specs/session-failure-report/spec.md`.
- **CI**: `.github/workflows/publish.yml` corre `npm ci` + `npm run lint` + `node --test
  test/*.test.js` y publica a npm al pushear un tag `v*` (o `workflow_dispatch`), con canary
  no bloqueante y creación del Release. El lint bloquea el publish. Evidencia:
  `.github/workflows/publish.yml`.

## Convenciones de trabajo

- Conventional Commits (`feat(scope):`, `fix(scope):`, ...) y **no** commitear a `main`/`master`
  (declarado en `AGENTS.md`; no se verificó protección real en el remoto). Evidencia:
  `AGENTS.md`.
- Rama de trabajo observada: `development`; el publish se dispara por tag y crea el Release.
  Evidencia: `git status --short --branch`, `.github/workflows/publish.yml`.
- Idioma de artifacts: español (`language: "es"` en el repo dogfooded); keywords y nombres de
  archivo siempre en inglés literal (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`/`AND`).
  Única fuente canónica del texto: `LOCKED: artifacts-language` en `AGENTS.md`; las skills y
  agentes la referencian. Evidencia: `AGENTS.md`, `templates/AGENTS.md`.
- Los mirrors `.opencode/agents/*.md` y `.opencode/commands/*.md` se **regeneran** con
  `ancleto upgrade`; nunca se editan a mano. Evidencia: `agents/orchestrator.md`.
