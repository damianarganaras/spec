---
node: setup
kind: setup
read_when: "preparar el entorno o ejecutar los comandos principales"
generatedAt: 2026-11-03T22:11:31Z
pluginVersion: 0.18.10
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
| Lint | `npm run lint` (`eslint src/ test/`) | `package.json`, `PRODUCT.md` |
| Tests | `npm test` (`node --test "test/*.test.js"`) | `package.json`, `PRODUCT.md` |
| Tests acotados | `node --test test/<archivo>.test.js` | `PRODUCT.md` (rutas explícitas) |
| CLI local | `node src/cli/index.js <comando>` | `package.json` (`bin`) |
| Estado del seed | `ancleto discovery --check` | `src/cli/index.js` |
| Empaquetar contexto | `ancleto discovery --compress` | `src/cli/index.js` |
| Inicializar proyecto | `ancleto init --agent opencode --tier minimo --lang es` | `src/cli/index.js` |
| Instalar/actualizar assets | `ancleto install [--project <dir>] [--tier ...]` | `src/cli/index.js` |
| Re-aplicar templates/skills | `ancleto upgrade [--agent <nombre>]` | `src/cli/index.js` |
| Verificar instalación | `ancleto check` | `src/cli/index.js` |
| Diagnóstico de entorno | `ancleto doctor` | `src/cli/index.js` |
| Refrescar catálogo de modelos | `node scripts/refresh-model-catalog.mjs` | `scripts/refresh-model-catalog.mjs` |
| Bundle portable | `ancleto export [--tar <file>]` / `ancleto import <bundle>` | `src/cli/index.js` |

No hay formatter ni typechecker declarados: el repo es JavaScript ESM sin `tsconfig.json` y
`PRODUCT.md` registra `Format: not-configured` / typecheck no aplica.

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

## Entornos y variables

| Variable / archivo | Propósito | Referencia |
|---|---|---|
| `.ancletorc` | Manifiesto de instalación y configuración del proyecto (`agent`, `tier`, `discovery`, `gratisModel`, `azure`) | `src/cli/index.js` → `readAncletorc` |
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
