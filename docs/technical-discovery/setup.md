---
node: setup
kind: setup
read_when: "instalar, ejecutar, comandos CLI, entorno, tiers, contrato de validaciones"
generatedAt: 2026-11-03T10:45:00Z
pluginVersion: 0.18.6
skillVersion: '2.3'
---

# Setup y operación

## Requisitos

| Requisito | Detalle | Evidencia |
|---|---|---|
| Node.js ≥ 24.0.0 | Obligatorio: el motor de memoria usa el módulo nativo `node:sqlite`. | `package.json` (`engines.node`), `README.md` |
| Repomix | Opcional: se resuelve por `PATH` o vía `npx -y repomix@1.18.0`. | `src/cli/index.js`, pack |
| Git | Necesario para el ciclo de changes, el workflow de publish, la exclusión local de `.ancleto/machine-env.md` y el `git status --short` que el intake delega a `@technical-discovery`. Si falta, el CLI degrada con warning. | `.github/workflows/publish.yml`, `src/core/machine-env.js`, `agents/orchestrator.md` |

## Instalación y CLI

```bash
npm install                      # deps de desarrollo (eslint, globals); runtime sin deps
npm install -g @ancleto/spec     # instalación global del CLI
ancleto init [--agent <host>] [--tier normal|minimo|gratis] [--lang es|en|pt|auto] [--exclude <globs>] [--profile general|test] [--with-azure] [--no-mcp]
ancleto install [--project <dir>] [--global] [--no-mcp] [--with-engram] [--tier ...] [--agent ...] [--profile ...]
ancleto update                    # re-instala la última versión sobre lo existente
ancleto upgrade [--agent <nombre>] [--profile <perfil>]  # re-aplica templates (LOCKED) y assets
ancleto export [--tar <file>]     # bundle portable + manifest.json sin rutas
ancleto import <bundle> [--repair] | ancleto import --repair  # restaura regenerando el MCP local
ancleto discovery --check         # estado del seed en JSON (READY/STALE/PARTIAL/MISSING) + config
ancleto discovery [--compress] [--include <glob>] [--ignore <glob>] [--token-budget <n>]
ancleto affected [--cwd <dir>] [--json] <archivo...>   # affected-set read-only
ancleto mcp                       # servidor MCP stdio de memoria propia
ancleto memory context [--scope X] [--out <archivo>]
ancleto memory list [--type X] [--scope X] [--all] [--json]
ancleto memory doctor [--rebuild]   # cinco checks read-only + advisory del working-context
ancleto memory export [--out <archivo>]
ancleto memory import <archivo>
ancleto memory gc [--dry-run] [--days N]
ancleto memory snapshot --out <archivo.db> [--force] [--json]
ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]
ancleto memory consolidate [--dry-run] [--apply] [--json]   # duplicados exactos; dry-run default
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
lo evita. `--agent` acepta 8 hosts. `ancleto affected` es **read-only**; `stats failures`
también y sólo funciona con la base de sesiones de opencode.

**Versión del CLI**: el `ancleto` global del `PATH` en esta máquina es **0.17.1** y **no
reconoce `memory consolidate`** ni el contrato nuevo de `searchMemory`; la versión `0.18.6` se
invoca con `node src/cli/index.js`. Antes de concluir que una capacidad falta, verificar
`ancleto --version` contra `package.json`.

**Contrato de `searchMemory` (`0.18.6`)**: el modo por defecto devuelve **preview** (prefijo
literal de hasta 240 caracteres por nodo, con `limit` 5 y `content_truncated` cuando queda
contenido afuera). `expand: true` devuelve el payload completo; `keys: [...]` expande sólo las
claves pedidas y falla si alguna no está en la página; `required: [...]` es una **entrada de la
llamada** (no se persiste), fija claves al frente del orden y falla si excede el `limit` efectivo
o no entra en el presupuesto. El preview no es el texto íntegro: no debe citarse como fuente de
una regla. El protocolo completo vive en `AGENTS.md` → `LOCKED: memory-protocol`; `PRODUCT.md`
sólo apunta. Evidencia: `AGENTS.md`, `src/core/memory/engine.js`, `src/core/memory/tools.js`,
`agents/memory-keeper.md`, `aspec/specs/memory-engine/spec.md` (requirement
`Recall task-aware con orden total, preview expandible y keys requeridas`).

**Contrato de escritura de memoria** (`MEM-03`, ampliado por MEM-04): `recordRule` y
`recordDecision` pasan por `recordNode`. Toda escritura cuya procedencia no sea `runtime` debe
incluir un bloque `refs:` con al menos una ref válida; `decision` exige al menos `spec:` o
`change:`, `rule` exige al menos `path:`, `spec:` o `change:`. Los items pueden ir **indentados
o no**; el bloque termina en una línea en blanco o en la primera línea no indentada que no es
item. La validación es **fail-closed** antes de la transacción: refs rotas, ambiguas, un segundo
bloque, un `path:` absoluto o con `../`, o una credencial aparente rechazan la escritura. El MCP
escribe con `source: 'mcp:ancleto-memory'`; `cli:import` no pasa por `recordNode` y conserva LWW.
Evidencia: `src/core/memory/engine.js`, `src/core/memory/mcp-server.js`.

**Resolver de refs (`MEM-04b`, publicado en `0.18.3`)**: `resolveNodeRefs({ content,
projectRoot })` es una API read-only del engine, **no un subcomando**. Devuelve `{ refs, error,
blocks, needsRoot }`; cada ref trae `raw`, `kind`, `verifiable` y
`ok`/`path`/`heading`/`reason`/`matches`. `change:` devuelve el directorio repo-relativo;
`spec:` devuelve el `spec.md` y el heading real; `path:` se normaliza antes de verificar
existencia; `commit:`/`workitem:` quedan `verifiable: false`. Evidencia:
`src/core/memory/engine.js`,
`aspec/changes/archive/2026-11-02-mem-04b-resolver-referencias-navegables/`.

**Ops de memoria**: `memory snapshot` exige `--out` y rechaza sobrescribir sin `--force`;
produce una copia con historial y no modifica la fuente. `memory merge` valida target activo,
sources activas, sin repetidas y con el mismo `type`, y aplica todo en una transacción
(`--dry-run` no escribe). **`memory consolidate`** es dry-run por defecto; agrupa duplicados
exactos por `type` + `content` normalizado (sin `refs:`), elige un canónico determinístico y
con `--apply` supersede los no canónicos en una única transacción. Los near-dups (Jaccard
≥ 0,60, mismo `type` y `scope`) **sólo se reportan**; `--apply` no los toca. Revertir requiere
un snapshot previo. Evidencia: `src/cli/index.js` (`memorySnapshot`, `memoryMerge`,
`memoryConsolidate`), `src/core/memory/snapshot.js`, `src/core/memory/engine.js`
(`validateMerge`, `merge`, `consolidate`).

**`memory gc` por edad de supersesión (`MEM-05b`)**: `memory_nodes` incorpora la columna
aditiva `superseded_at TEXT`; la migración es guardada (sólo `ALTER TABLE` si falta) y el
backfill copia `created_at` en las filas históricas superseded, preservando la elegibilidad
previa. Las cuatro rutas de supersesión (`recordNode`, `importNodes`, `merge`, `consolidate`)
escriben el instante. `gcSuperseded` mide `COALESCE(superseded_at, created_at)` con **un único
cutoff calculado en JS** (segundos, sin milisegundos) compartido por dry-run y purge real; antes
del `DELETE` limpia el `superseded_by` de los elegibles para no violar la FK. `VACUUM`+`REINDEX`
son best-effort post-commit. Evidencia: `src/core/memory/database.js`,
`src/core/memory/engine.js`, `aspec/specs/memory-ops/spec.md`.

**Estado observado de la memoria** (local, read-only): **125 nodos activos** (34 rules
`project`, 78 decisions `project`, 13 decisions `feature`) sobre **228 filas** en
`memory_nodes`; **344 refs verificadas, 0 no resueltas**; `consolidate` reporta 0 grupos exactos
y 0 near-dups. El bloque proactivo omite **20 reglas** de scope `project` (entran 14 de 34);
`.ancleto/working-context.md` está `desactualizado` y se regenera con
`ancleto memory context --out .ancleto/working-context.md`.

## Configuración persistida

- **`.ancletorc`** (raíz): manifiesto de instalación (`schemaVersion`, `version`,
  `installedAt`, `installedPaths`) + `discovery` (`outputDir`, `exclude`), `agent`, `language`,
  `profile`, `azure.enabled`, `gratisModel`. `installedPaths` guarda la **unión de destinos
  realmente escritos**; para antigravity `commands` queda vacío. **No editar a mano durante el
  seed**; se consume resuelto desde `ancleto discovery --check`. En este checkout existe
  (gitignored).
- **`opencode.json`** (raíz): fija `agent.model = commandcode/deepseek/deepseek-v4.1-flash`
  para los 10 subagentes. Es override del host y **no** forma parte del paquete publicado
  (`package.json` → `files` lista `agents`, `commands`, `skills`, `templates`, `profiles`,
  `src`). Evidencia: `opencode.json`, `package.json`.
- **Perfil `test`** (`--profile test`, `profiles/test/`): overlay de tester/reviewer ampliados,
  comandos `cleto-test-*`, estructura `testspec/` y bloque LOCKED de convenciones Playwright.
- **Tier del proyecto**: `readProjectTier` lee `.ancleto-tier` en la raíz o en `.opencode/`.
  Aquí `.opencode/.ancleto-tier` contiene **`minimo`** (`--compress`, ignora `test/**`,
  `docs/**`, `**/*.md`, sin token budget; el pack de esta corrida: **740 archivos / ~19.907
  tokens**). Evidencia: `src/core/repomix-tier.js`, `ancleto discovery --check`.
- **Destinos por host (`AGENT_TARGETS`)**: fuente única de rutas de skills/agents/commands por
  IDE (`.opencode/*`, `.claude/*`, `.github/*`, `.agents/*`, `.cursor/skills`, `.roo/skills`,
  `.commandcode/*`). Los agents de claude/vscode/antigravity/copilot/commandcode se adaptan.
- **MCP del host**: antigravity en `.agents/mcp_config.json`, commandcode en `.mcp.json`,
  copilot en `copilot-mcp.json`; el resto en `.opencode/opencode.json`.
- **`AGENTS.md` y bloques `LOCKED`**: `install`/`update`/`upgrade` re-aplican el interior de
  `<!-- LOCKED: name -->` y preservan el resto, tras reconciliar superficies planas legadas.
  Bloques actuales: `memory-protocol`, `validation-commands`, `memory-boundary`,
  `artifacts-language`, `seed-freshness` y `test-block`. Evidencia: `src/cli/index.js`
  (`mergeTemplateInto`, `mergeLocked`, `reconcileLegacyBlocks`), `templates/AGENTS.md`,
  `AGENTS.md`.
- **`.ancleto/`**: memoria local (`memory.db`, `working-context.md`) y entorno de máquina
  (`machine-env.md`); gitignored. `.ancleto/memory.db` es la fuente de `memory snapshot`,
  `merge`, `consolidate` y `gc`.
- **`machine-env.md`**: artefacto derivado y local. Se regenera en `ancleto init`,
  `ancleto install --project` y `ancleto upgrade`; si los hechos no cambian, no se reescribe.
  La exclusión va a `git rev-parse --git-path info/exclude`, **nunca** a `.gitignore`, con el
  patrón repo-root-relative `<prefix>.ancleto/machine-env.md`. `ancleto check` advierte si quedó
  trackeado.

## Entorno de máquina (`.ancleto/machine-env.md`)

Contenido mínimo (spec `machine-environment`): plataforma, release y arquitectura; shell y
`shell_source` (`MSYSTEM`, `CYGWIN`, `PSModulePath`, `PROMPT`, `SHELL`, `WSL_DISTRO_NAME`,
`WSL_INTEROP` o `unknown`); EOL y `eol_source` (`gitattributes`, `core.eol`, `core.autocrlf` o
`platform-default`); disponibilidad de `rg`, `node`, `npm`, `git` y `python` —resoluble e
invocable—; fecha, versión de ancleo y un `## Hint` de precedencia.

Precedencia del shell en Windows: MSYS/Cygwin → `bash`; `PSModulePath` con marcador de
PowerShell 7 → `PowerShell 7`; `PROMPT` → `cmd`; `SHELL` POSIX + marcador legacy → `unknown`;
`SHELL` POSIX → ese shell; solo marcador legacy → `Windows PowerShell 5.1`; si no, `unknown`.
`ComSpec` no se usa. No se renderizan secretos, tokens, valores de `PATH` ni versiones.

**Sonda de invocabilidad**: una herramienta se declara `disponible` sólo si el candidato
resuelto en `PATH` **se ejecuta con éxito** con `--version`. Cada intento se acota a **2 s**
(`TOOL_PROBE_TIMEOUT_MS`) y la corrida a **10 s** (`TOOL_PROBE_BUDGET_MS`); las llamadas a
`git` para EOL se acotan a **5 s** (`GIT_TIMEOUT_MS`). En `win32` los shims `.cmd`/`.bat` se
sondean por `process.env.ComSpec`; la guarda `EINVAL` de Node es **inconclusa**, nunca
`bloqueado`. Un fallo real se publica con sufijo saneado (sin ANSI/OSC, espacios colapsados,
tope de 200 caracteres); un veredicto inconcluso no lleva sufijo.

**Estado en este checkout**: el artefacto existe (generado el 2026-11-03): `win32` /
`10.0.26200` / `x64`, shell `Windows PowerShell 5.1` (`shell_source: PSModulePath`), EOL `lf`
(`eol_source: gitattributes`), `rg` **no disponible** (fallback: `Select-String`),
`node`/`npm`/`git`/`python` disponibles, `ancleto: 0.18.6`. La exclusión local está en
`info/exclude`. Evidencia: `.ancleto/machine-env.md`.

## Permisos de shell por agente

| Agente | Shell |
|---|---|
| `@orchestrator`, `@reviewer`, `@spec-writer`, `@memory-keeper` | `bash: false` — no ejecutan comandos. |
| `@coder`, `@tester`, `@documenter`, `@context-resolver`, `@technical-discovery`, `@technical-seed-writer` | `bash: true`. |
| `@technical-discovery` | `permission.bash` con `'*': deny` y **exactamente dos literales**: `'ancleto discovery --check'` y `'git status --short'`. |

Evidencia: `agents/*.md`, `agents/technical-discovery.md`, `aspec/specs/prompt-contracts/spec.md`.

## Tiers de costo

| Tier | Modelos y empaquetado |
|---|---|
| `normal` | Modelos balanceados (`qwen3.7-plus`, `minimax-m3`, etc.), pack sin comprimir ni ignores extra, sin token budget. |
| `minimo` | Un único modelo `opencode-go/deepseek-v4.1-flash` para los 10 agents; pack comprimido (`--compress`), excluye `test/**`, `docs/**`, `**/*.md`, sin token budget. **Tier resuelto aquí.** |
| `gratis` | Muse Spark 1.3 Free si está habilitado; fallback `opencode/big-pickle`; mismo empaquetado que `minimo` + token budget estricto (50k). |

Evidencia: `src/core/tier-models.js`, `src/core/repomix-tier.js` (`TIER_PACK_CONFIG`),
`README.md`. `readProjectTier` cae en `gratis` por default cuando no existe `.ancleto-tier`;
aquí existe `.opencode/.ancleto-tier` con `minimo`.

## Variables de entorno

Sólo nombres; **valores omitidos** (ver riesgo de secretos en `decisions.md`):

- `ANCLETO_PROJECTS_FILE` — ruta alternativa del registro global de proyectos.
- `ANCLETO_MUSE_SPARK` — `1`/`0` fuerza/niega Muse Spark en tier gratis.
- `NO_COLOR` — desactiva color en la salida del CLI.
- `XDG_CONFIG_HOME` — base del registro global (`~/.config/ancleto/`, `~/.config/opencode/`).
- `NPM_TOKEN` — secreto del workflow de publish (GitHub Actions).
- Azure DevOps (opcional): `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PAT`.
- Detección de shell/EOL (sólo se leen, nunca se renderizan valores): `MSYSTEM`, `CYGWIN`,
  `PSModulePath`, `PROMPT`, `SHELL`, `WSL_DISTRO_NAME`, `WSL_INTEROP`, `PATH`, `PATHEXT`.

Evidencia: `README.md`, `src/cli/index.js`, `src/core/machine-env.js`,
`.github/workflows/publish.yml`.

## Tests y validaciones

El contrato es **declarativo**:

- **Fuente única**: `PRODUCT.md` → `## Project Commands`. La política vive en `AGENTS.md` /
  `templates/AGENTS.md` → bloque `LOCKED: validation-commands` y **prohíbe** inventar un
  runner/linter/formatter/typechecker. Si un comando no está declarado, la validación se
  **saltea y se registra la omisión**.
- **Este repo declara**: **Lint** `npm run lint` (`eslint src/ test/`) y **Tests** `npm test`
  (`node --test "test/*.test.js"`). Evidencia: `package.json`.
- **Format check**: `not-configured` — no hay formatter declarado.
- **Typecheck**: no aplica — JavaScript sin `tsconfig.json` (aunque `AGENTS.md` conserva la
  regla genérica "TypeScript strict" del template).
- **Tests acotados**: pasar **rutas explícitas**; **nunca** `node --test` sin acotar.
- **Suite**: 15 archivos (`adapters-frontmatter`, `affected-set`, `cli`, `content-guards`,
  `discovery-tier`, `discovery-topology`, `linter-config`, `machine-env`, `mcp`,
  `memory-engine`, `memory-fixtures`, `memory-pr1-contract`, `stats-failures`, `tier-models`,
  `working-context`) y tres fixtures en `test/fixtures/memory/`: `seed.json`, `golden.json` y
  `golden-refs-seed.json`, más `refs-root/`. Esta regeneración es **state-only**: no re-ejecutó
  la suite. Evidencia: `test/`.
- **CI**: `.github/workflows/publish.yml` corre `npm ci` + `npm run lint` +
  `node --test test/*.test.js` y publica al pushear un tag `v*` (o `workflow_dispatch`), con
  canary no bloqueante y creación del Release. El lint bloquea el publish.

## Cambiar el modelo de los agentes

`AGENTS.md` → `## Cambiar el modelo de los agentes` fija el procedimiento. El `model:` existe en
**tres superficies**:

- `agents/*.md` — fuente canónica y **publicada**; no es donde se cambia el modelo de una
  máquina concreta.
- `.opencode/agents/*.md` — mirror que regenera `ancleto upgrade`; **no se edita a mano**.
- `~/.config/opencode/agents/*.md` — instalación **global**; en este setup es la copia que carga
  el runtime.

`opencode.json` → `agent.<nombre>.model` aplica al agente **primario**, pero **no** a los
subagentes. `ancleto install`/`update` reescriben las líneas `model:`; `ancleto upgrade` **no**
aplica tier. Verificación en las tres superficies:

```powershell
Select-String -Path <directorio>/*.md -Pattern '^model:'
```

`ancleto check` reporta `frontmatter diverge del adaptador` cuando un mirror se apartó de su
fuente. Si el modelo está bien y el proveedor responde `Insufficient account funds`, el problema
es la cuenta. Evidencia: `AGENTS.md`, `agents/*.md`, `opencode.json`, `src/cli/index.js`.

## Convenciones de trabajo

- Conventional Commits y **no** commitear a `main`/`master` (declarado en `AGENTS.md`; no se
  verificó protección real en el remoto).
- Rama de trabajo observada: `development`; el publish se dispara por tag y crea el Release.
- Idioma de artifacts: el de la conversación o el `language` configurado en `.ancletorc`
  (este seed está en español); keywords y nombres de archivo siempre en inglés literal
  (`Requirement`, `Scenario`, `SHALL`, `WHEN`/`THEN`/`AND`). Fuente:
  `LOCKED: artifacts-language`.
- Los mirrors `.opencode/agents/*.md` y `.opencode/commands/*.md` se **regeneran** con
  `ancleto upgrade`; nunca se editan a mano.
