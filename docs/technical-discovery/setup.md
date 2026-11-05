---
node: setup
kind: setup
read_when: "preparar el entorno o ejecutar los comandos principales"
generatedAt: 2026-11-05T03:53:28Z
pluginVersion: 0.18.16
skillVersion: '2.3'
---

# Setup

## Requisitos

- **Node.js ≥ 24.0.0** (`package.json` → `engines.node`). Obligatorio: el motor de memoria usa
  `node:sqlite` y `ancleto doctor` falla si el major es menor.
- **git** para el repo y para `machine-env` (detección de EOL/exclusiones); opcional en runtime.
- **Repomix** solo para discovery: se resuelve por `PATH` o vía `npx repomix@1.18.0`
  (`src/cli/index.js` → `runRepomix`).
- **opencode** solo para `stats`/`stats failures` (lee su base) y para el refresco manual del
  catálogo de modelos.
- En Windows el shell declarado es PowerShell 5.1 y `rg` no está disponible: usar `Select-String`.

## Comandos principales

| Objetivo | Comando | Fuente |
|---|---|---|
| Instalar dependencias de desarrollo | `npm ci` | `.github/workflows/publish.yml` |
| Lint | `npm run lint` (`eslint src/ test/ scripts/`) | `package.json`, `PRODUCT.md` |
| Tests | `npm test` (`node --test "test/*.test.js"`) | `package.json`, `PRODUCT.md` |
| Tests acotados | `node --test test/<archivo>.test.js` | `PRODUCT.md` (rutas explícitas) |
| CLI local | `node src/cli/index.js <comando>` | `package.json` (`bin`) |
| Estado del seed | `ancleto discovery --check` | `src/cli/index.js` |
| Empaquetar contexto | `ancleto discovery --compress` | `src/cli/index.js` |
| Inicializar proyecto | `ancleto init --agent opencode --tier minimo --lang es` | `src/cli/index.js` |
| Instalar/actualizar assets | `ancleto install [--project <dir>] [--tier ...]` | `src/cli/index.js` |
| Re-aplicar templates/skills | `ancleto upgrade [--agent <nombre>]` | `src/cli/index.js` |
| Verificar instalación | `ancleto check` | `src/cli/index.js` |
| Diagnóstico de entorno y MCP | `ancleto doctor` | `src/cli/index.js` |
| Descubrir catálogo (dry-run) | `node scripts/refresh-model-catalog.mjs` | `scripts/refresh-model-catalog.mjs` |
| Reemplazar snapshot del catálogo | `node scripts/refresh-model-catalog.mjs --write` | `scripts/refresh-model-catalog.mjs` |
| Bundle portable | `ancleto export [--tar <file>]` / `ancleto import <bundle>` | `src/cli/index.js` |

No hay formatter ni typechecker declarados: el repo es JavaScript ESM sin `tsconfig.json` y
`PRODUCT.md` registra `Format: not-configured` / typecheck no aplica. El lint cubre `src/`, `test/`
y `scripts/` con `eslint.config.js`: globals de Node y cuatro reglas (`no-undef`, `no-unused-vars`
con `argsIgnorePattern`/`caughtErrorsIgnorePattern` = `^_`, `eqeqeq`, `no-dupe-keys`).

## Diagnósticos (`check` y `doctor`)

`check` es un oráculo read-only: sólo los faltantes alteran el exit code
(`missing > 0 ? 1 : 0`). Entre sus avisos no bloqueantes están el catálogo no verificable, la
antigüedad del snapshot, la deriva de `model:`, los IDs declarados ausentes, el modelo free sobre un
agente primario; desde 0.18.15/0.18.16 se suman:

- **Deriva de versión**: si `.ancletorc.version` es un string no vacío distinto de la versión del
  CLI (leída de `package.json` con `packageVersion()`), imprime una vez
  `.ancletorc registra v<rc> y el CLI es v<cli>; corré 'ancleto upgrade' para regenerar los
  artefactos locales`. No repara: `upgrade` es el único remediador.
- **Tier dormido**: si el proyecto no declara ninguna superficie local de agentes
  (`localAgentDirs(rc)` devuelve `[]`, por ejemplo `cursor` o `roo`), el tier existe pero no se
  considera huérfano. El aviso histórico sólo se emite cuando hay al menos un directorio declarado
  y la suma de `.md` es cero.
- **Salud MCP (0.18.16)**: `check` lee sólo la config MCP **del proyecto** con
  `readProjectMcp`/`findProjectMcpFile`. Si existe y no parsea, emite
  `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP`; si parsea, emite un aviso por
  entrada con `mcpCommandBroken` verdadero:
  `MCP '<nombre>' tiene un comando roto (<detalle>)`. No inspecciona la config global ni la de otros
  hosts, no escribe y no cambia el exit code.

`doctor` valida Node ≥ 24, la importabilidad de `node:sqlite` y la config MCP de `opencode`. Resuelve
la config con precedencia **proyecto → global**, usando la misma regla de descubrimiento de proyecto
(`findProjectMcpFile`: `.opencode/opencode.json` y luego `.opencode/opencode.jsonc`) y, si no existe,
`globalConfigDir()/opencode.json` y `globalConfigDir()/opencode.jsonc`; valida sólo el primer archivo
existente. La ruta del proyecto se reporta relativa con `/`; la global, por nombre base. Si hay config
de proyecto inválida, no cae a la global. El parseo es `JSON.parse` estricto (un `.jsonc` con
comentarios se reporta inválido) y una config inválida o ausente no altera el exit code.

`import` (con o sin bundle, incluido `--repair`) avisa por `stderr` antes de reemplazar una config
MCP de proyecto no parseable:
`ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP nueva`. La decisión
de reemplazo y el exit code no cambian.

## Refresco del catálogo de modelos

Procedimiento **manual**, con `opencode` instalado en una máquina de mantenimiento. Nunca corre en
`install`, `update`, `init`, `import`, `check`, la suite de tests ni CI:

1. Dry-run: enumera todos los proveedores de `opencode models --refresh` y consulta cada uno con
   `opencode models <provider> --verbose --refresh`.
2. Clasifica la corrida como `available`, `binary-missing`, `network-unavailable` o `partial`; solo
   `available` habilita escritura. `looksBinaryMissing` es independiente del locale: reconoce
   `ENOENT` y mensajes de comando no encontrado/no reconocido en varios idiomas; una corrida
   exitosa o con proveedores enumerados nunca es `binary-missing`.
3. Con `available`, valida la forma, rechaza `opencode/big-pickle` si dejó de costar 0, imprime el
   diff contra el snapshot y escribe el candidato en `.ancleto/model-catalog.candidate.json`
   (local, no se commitea).
4. Con `--write`, antes de cualquier escritura el script deriva los IDs declarados en `TIERS`,
   `TIER_CHAINS`, `agents/*.md` y `profiles/*/agents/*.md` y los contrasta contra el candidato. Si
   falta uno, sale con exit 1, nombra ID y origen, y **no escribe ni el snapshot ni el candidato**.
   Si las fuentes no se pueden leer, falla cerrado. El dry-run no depende de que esas fuentes sean
   legibles.
5. Si el gate pasa, `--write` reemplaza `src/core/model-catalog.json` de forma atómica
   (temporal + rename). Sin `--write`, el snapshot commiteado no se toca.
6. Correr los guards `test/model-catalog-discovery.test.js`, `test/model-catalog.test.js` y
   `test/content-guards.test.js` antes de commitear el snapshot.

`scripts/` **no se publica** en el paquete (`package.json` → `files` incluye `agents`, `commands`,
`skills`, `templates`, `profiles`, `src`). El refresco solo existe en el repositorio fuente; los
avisos de remedio de `check` y del resolver refieren al repositorio fuente, no a una ruta ejecutable
del paquete instalado.

## CLI por áreas

- **Instalación**: `install`, `update`, `init`, `upgrade`, `check`, `doctor`, `export`, `import`.
- **Descubrimiento y análisis**: `discovery`, `affected`, `specs check`, `stats`, `stats failures`,
  `projects`.
- **Memoria**: `memory context|list|doctor|curate|export|import|gc|snapshot|merge|consolidate`,
  `mcp`.
- **Tiers**: `normal` (opencode-go), `minimo` (cadena contra catálogo), `gratis`
  (`opencode/big-pickle`). El tier se escribe en `.opencode/.ancleto-tier`; `install` sin `--tier`
  usa `normal`, mientras el default publicado de `agents/*.md` es
  `commandcode/deepseek/deepseek-v4.1-flash` (`README.md`).

El tier `gratis` está pensado para subagentes: un modelo free sobre un agente con `mode: primary`
(por ejemplo el `orchestrator`, cuyo frontmatter canónico declara `mode: primary`) puede responder
`403` en OpenCode. `install --tier gratis` y `ancleto check` lo advierten sin bloquear; ver
`units/cli-install.md`.

## Entornos y variables

| Variable / archivo | Propósito | Referencia |
|---|---|---|
| `.ancletorc` | Manifiesto de instalación y configuración del proyecto (`agent`, `language`, `profile`, `discovery`, `gratisModel`, `azure`, `installedPaths`, `version`) | `src/cli/index.js` → `readAncletorc` |
| `.opencode/.ancleto-tier` | Último tier aplicado; lo lee `check` y `repomix-tier` | `src/cli/index.js`, `src/core/repomix-tier.js` |
| `ANCLETO_OPENCODE_DB` | Ruta alternativa a la base de sesiones de opencode para `stats` | `src/cli/index.js` → `opencodeDbPath` |
| `ANCLETO_PROJECTS_FILE` | Ruta alternativa al registro global de proyectos | `src/cli/index.js` → `projectsRegistryPath` |
| `ANCLETO_MODEL_CATALOG` | Ruta alternativa al snapshot de modelos (seam de test/manual) | `src/core/tier-models.js` → `loadModelCatalog` |
| `XDG_CONFIG_HOME` | Base de la config global (`~/.config` por defecto) | `src/cli/index.js` → `globalConfigDir` |
| `NO_COLOR` | Desactiva color en la UI de terminal | `src/cli/index.js` |
| `AZURE_DEVOPS_ORG_URL`, `AZURE_DEVOPS_PAT` | MCP Azure DevOps opcional (deshabilitado en este repo) | `PRODUCT.md`, `src/cli/index.js` |
| `.ancleto/machine-env.md` | Artefacto local generado; no se versiona | `src/core/machine-env.js` |

Los valores de credenciales se omiten deliberadamente. No copiar secretos de `.ancletorc`,
`opencode.json`, CI ni de la configuración global.

**Estado de este checkout (0.18.16)**: `.ancletorc` y `.ancleto/machine-env.md` registran
`ancleto: 0.18.16`, alineados con `package.json` tras el `upgrade` local. Siguen siendo artefactos
gitignored que `init`/`install`/`upgrade` regeneran; no son fuentes del seed.

## Entorno de máquina

`init`/`install`/`upgrade` materializan `.ancleto/machine-env.md` con plataforma, shell, EOL y
tooling observado. La detección es best-effort y acotada: sondea la invocabilidad real de cada
herramienta (no solo su presencia en `PATH`), con timeout y presupuesto acumulado
(`src/core/machine-env.js`). El artefacto se excluye localmente vía `info/exclude` de git, sin
tocar `.gitignore`; `ancleto check` avisa si quedó trackeado.

## Convenciones operativas

- **Validaciones**: correr solo lo declarado en `PRODUCT.md` → `## Project Commands`; si un
  comando no está declarado, se omite y se registra. Nunca inventar runner/linter/formatter.
- **Commits**: Conventional Commits; no commitear directo a `main`/`master` (`AGENTS.md`).
- **Operaciones destructivas**: requieren confirmación explícita del usuario (`AGENTS.md`).
- **Memoria**: consultar `.ancleto/memory.db` antes de revertir decisiones de arquitectura o
  contratos; la memoria es contexto histórico y no prevalece sobre el diseño vigente.
