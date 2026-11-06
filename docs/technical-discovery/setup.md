---
node: setup
kind: setup
read_when: "preparar el entorno o ejecutar los comandos principales"
generatedAt: 2026-11-06T12:16:49Z
pluginVersion: 0.20.1
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
agente primario; desde 0.18.15–0.19.0 se suman:

- **Deriva de versión**: si `.ancletorc.version` es un string no vacío distinto de la versión del
  CLI (leída de `package.json` con `packageVersion()`), imprime una vez
  `.ancletorc registra v<rc> y el CLI es v<cli>; corré 'ancleto upgrade' para regenerar los
  artefactos locales`. No repara: `upgrade` es el único remediador.
- **Tier dormido**: si el proyecto no declara ninguna superficie local de agentes
  (`localAgentDirs(rc)` devuelve `[]`, por ejemplo `cursor` o `roo`), el tier existe pero no se
  considera huérfano. El aviso histórico sólo se emite cuando hay al menos un directorio declarado
  y la suma de `.md` es cero.
- **Salud MCP host-aware (0.18.16, ampliada en 0.19.0)**: `check` deriva los hosts instalados de
  `installedHostsFromPaths(rc.installedPaths)` y, para cada uno que declare destino en
  `HOST_MCP_TARGETS`, inspecciona el archivo existente con `resolveExistingHostMcpDestinations`.
  No mira la config global ni hosts sin destino. Por cada destino:
  - si existe y no parsea: `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP`;
  - si parsea y `cfg[schema]` es un objeto plano: un aviso por entrada con `mcpCommandBroken`
    verdadero, `MCP '<nombre>' tiene un comando roto (<detalle>)`.

  El esquema se normaliza para `mcpServers` con `normalizeHostMcpEntry`. No escribe y no cambia el
  exit code; `missing`/`orphans` tampoco cambian.

`doctor` valida Node ≥ 24, la importabilidad de `node:sqlite` y la config MCP del host. Resuelve el
archivo con la precedencia **host activo → hosts instalados → global**:

1. El destino del host activo (`rc.agent`, o `opencode` por defecto) si existe.
2. Los destinos de los hosts instalados derivados de `installedPaths`, en el orden
   `opencode`, `antigravity`, `commandcode`, `copilot`.
3. `globalConfigDir()/opencode.json` y `globalConfigDir()/opencode.jsonc` sólo si no existe ninguno
   de proyecto; `GLOBAL_MCP_CANDIDATES` deriva esos nombres de `PROJECT_MCP_CANDIDATES`.

Se valida **sólo el primer archivo existente**; si hay config de proyecto, no se cae al fallback
global aunque sea inválida. La ruta del proyecto se reporta relativa con `/`; la global, por nombre
base. El parseo es `JSON.parse` estricto (un `.jsonc` con comentarios se reporta inválido) y una
config inválida o ausente no altera el exit code.

`export` (0.20.0) resuelve la intención MCP del manifiesto con `readHostMcpIntent` y el descriptor
del host activo. Si el destino existe y no parsea, emite por `stderr`
`<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`, exporta `manifest.mcp = []` y
sale con 0. Un destino inexistente exporta intención vacía sin aviso.

`import` (con o sin bundle, incluido `--repair`) avisa por `stderr` antes de reemplazar una config
MCP no parseable:
`ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP nueva`. La decisión
de reemplazo y el exit code no cambian. Desde 0.20.0, `import <bundle>` copia y registra
`.opencode/{agents,commands,skills}` sólo si el host activo es `opencode`; en los demás hosts los
assets se materializan por `installAgentAssets`.

Desde 0.20.1, `repairProjectMcp` sólo escribe el destino MCP del host activo si el archivo no parsea,
si la estructura requiere normalización o si hay entradas reparadas/agregadas. Un destino sano no se
reescribe (mismos bytes y mtime) y un destino inexistente sin nada que reparar no se crea.

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

**Estado de este checkout (0.20.1)**: `.ancletorc` y `.ancleto/machine-env.md` registran
`ancleto: 0.20.1`, alineados con `package.json`. Siguen siendo artefactos gitignored que
`init`/`install`/`upgrade` regeneran; no son fuentes del seed.

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
