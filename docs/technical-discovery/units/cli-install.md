---
node: units/cli-install
kind: dossier
read_when: "cómo el CLI inicializa e instala el framework, rutas por host, adaptación de frontmatter, merge de templates, tiers, portabilidad, check y entorno de máquina"
covers:
  - instalación
  - AGENT_TARGETS
  - frontmatter por host
  - merge de templates LOCKED
  - reconciliación legacy
  - MCP
  - perfiles
  - tiers y catálogo
  - integridad de IDs
  - machine-env
  - check y doctor
  - export/import
sources: ["src/cli/index.js", "src/core/adapters/frontmatter.js", "src/core/machine-env.js", "src/core/tier-models.js", "src/core/model-catalog.js", "src/core/model-catalog.json", "scripts/refresh-model-catalog.mjs"]
generatedAt: 2026-11-04T17:02:55Z
pluginVersion: 0.18.12
skillVersion: '2.3'
---

# Unidad: CLI, instalación y adaptación por host

## Propósito

`src/cli/index.js` es el entry point único (`ancleto` y `aspec`). Materializa los assets del
framework en el layout nativo del host elegido, aplica el tier de modelos, mergea templates sin
destruir personalizaciones, configura MCP y ofrece comandos de operación (memoria, discovery,
stats, portabilidad, diagnóstico). `src/cli/ui.js` aporta el banner y los menús TTY.

## Recorrido relevante

### `init` / `install` / `update`

1. Se resuelve el host (`AGENT_TARGETS`): `opencode`, `claude`, `vscode`, `antigravity`, `cursor`,
   `roo`, `copilot`, `commandcode`. Cada host declara `skills`, `agents` y `commands` con su
   directorio y extensión; un asset `null` no se soporta y se avisa a stderr.
2. Se resuelve el tier **antes de escribir agents**: `resolveTierMap(tier, gratisOverride)` carga
   `src/core/model-catalog.json` y usa `resolveTierModels` (`src/core/tier-models.js`). Si ningún
   candidato de la cadena está disponible, `install`/`init` abortan con error explícito; nunca
   escriben un ID inventado.
3. `applyTier` reescribe `model:` solo en mirrors de `opencode`; el resto de hosts dropean el campo
   o emiten `model: inherit`.
4. Se copian assets con adaptación de frontmatter y se mergean templates (`AGENTS.md`,
   `PRODUCT.md`) por bloques `LOCKED`; antes se reconcilian firmas planas legadas.
5. Se persiste `.opencode/.ancleto-tier` con el nombre del tier y se actualiza `.ancletorc`
   (`installedPaths`, `agent`, `tier`, `gratisModel` si ya existía).

### `upgrade`

Re-aplica templates y skills sobre el proyecto actual, sin aplicar tier (el mirror vuelve a la
fuente canónica byte a byte). Es la vía que materializa el default publicado de `agents/*.md`
(`commandcode/deepseek/deepseek-v4.1-flash`).

### `import` / `export`

- `export` empaqueta lo portable (`.ancletorc` sin rutas, agents/commands/skills, templates, aspec,
  memoria si aplica) con manifiesto `ancleto-export/1`.
- `import` **lee y resuelve antes del primer write**; luego aplica el tier, escribe
  `.opencode/.ancleto-tier` y repara MCP. Repara entradas rotas sin tocar las sanas.

### `check`

Verifica templates y directorios de `installedPaths` contra el catálogo versionado; reporta
faltantes (✖, afectan exit code) y huérfanos (⚠). Para agents de `opencode`, compara el frontmatter
contra la adaptación de la fuente canónica (o el overlay del perfil) y contra el conjunto de
aceptación del tier.

El catálogo se carga **una sola vez por ejecución** y solo si `opencode` está instalado; un JSON
parseable con forma inválida se descarta (`validateCatalogSnapshot`) para no derivar deriva falsa.
Sobre ese catálogo se agregan avisos **no bloqueantes**:

- **Deriva por archivo**: si un `model:` del mirror no figura en el snapshot, se nombra el archivo
  y el ID y se refiere el refresco al repositorio fuente. No altera el exit code ni el conjunto de
  aceptación.
- **Advisory de IDs declarados (0.18.12)**: como máximo un aviso por ejecución si un ID declarado
  en `TIERS`, `TIER_CHAINS`, `agents/*.md` o `profiles/*/agents/*.md` no figura en el snapshot.
  Lista ID y origen; es distinguible del warning de deriva por `model:` y no altera contadores,
  oráculo ni exit code.
- **Antigüedad**: un único aviso por ejecución cuando `generated_at` supera 90 días
  (`isCatalogStale`), sin TTL ni efecto en la resolución.
- **Catálogo no verificable**: si falta, es ilegible o no valida, `check` no aborta; acepta los
  candidatos estáticos y avisa por directorio (`no se pudo verificar el catálogo…`). No emite
  deriva ni advisory en ese caso.

Solo los faltantes alteran el exit code; huérfanos, divergencias, deriva, advisory, antigüedad y
catálogo no verificable son warnings.

### Refresco del catálogo y gate de `--write`

`scripts/refresh-model-catalog.mjs` corre manualmente desde el repositorio fuente (no se publica en
el paquete). Con `--write`, antes de cualquier escritura deriva los IDs declarados de `TIERS`,
`TIER_CHAINS`, `agents/*.md` y `profiles/*/agents/*.md` y los contrasta contra el candidato. Si
falta uno, sale con exit 1, nombra ID y origen y no escribe ni el snapshot commiteado ni el
candidato; si las fuentes no se pueden leer, falla cerrado. El dry-run no depende de esas fuentes.
La detección de binario ausente (`looksBinaryMissing`) es independiente del locale.

### `doctor`

Comprueba Node ≥ 24, importabilidad de `node:sqlite` y validez de `opencode.json`; es fatal solo
por Node/sqlite.

## Rutas por host (`AGENT_TARGETS`)

| Host | Skills | Agents | Commands |
|---|---|---|---|
| opencode | `.opencode/skills` | `.opencode/agents/*.md` | `.opencode/commands/*.md` |
| claude | `.claude/skills` | `.claude/agents/*.md` | `.claude/commands/*.md` |
| vscode | `.github/skills` | `.github/agents/*.agent.md` | `.github/prompts/*.prompt.md` |
| antigravity | `.agents/skills` | `.agents/agents/*.md` | commands como skills en `.agents/skills/<n>/SKILL.md` |
| cursor | `.cursor/skills` | — | — |
| roo | `.roo/skills` | — | — |
| copilot | — | `.github/prompts/*.prompt.md` | `.github/prompts/*.prompt.md` |
| commandcode | `.commandcode/skills` | `.commandcode/agents/*.md` | `.commandcode/commands/*.md` |

MCP por host: `opencode` mergea `opencode.json`; Antigravity, `.agents/mcp_config.json`; Command
Code, `.mcp.json`; Copilot, `copilot-mcp.json`. Todos son merges no destructivos.

## Reglas, contratos y riesgos

- **Adaptador puro**: `adaptFrontmatter(content, host, assetKind, name)` no hace I/O ni guarda
  estado. Los ids de tools de Antigravity y Command Code son conjuntos cerrados: una clave sin id
  verificado se omite con aviso, nunca en silencio (un id inexistente cuelga el subagent).
- **Command Code** omite `model:` (hereda el de la sesión) y emite `tools` como lista; los tiers no
  cambian modelos ahí.
- **Copilot** no soporta skills; los tiers solo cambian el nivel de esfuerzo (nota en el
  orchestrator).
- **Templates**: el merge reemplaza bloques `LOCKED` conocidos, inserta bloques nuevos en el ancla
  correcta y **no toca** un bloque mal formado o personalizado; avisa. La reconciliación legacy es
  idempotente y solo elimina con coincidencia exacta.
- **Perfil `test`**: overlay sobre `profiles/test/` (agents/commands/templates); el package base no
  se modifica. El tier sigue siendo dueño de `model:` en install/init; `upgrade` devuelve el
  overlay a su fuente.
- **`machine-env`**: `materializeMachineEnv` nunca lanza; devuelve warnings. `check` avisa si el
  artefacto quedó trackeado en git.
- **Catálogo y `check`**: deriva, advisory y antigüedad son informativos y nunca hacen fallar
  `check`; solo los faltantes alteran el exit code. `install`/`init`/`import` siguen siendo
  estrictos.
- **Riesgo**: `.ancleto/machine-env.md` registra `ancleto: 0.18.8` mientras el paquete está en
  `0.18.12`; es un artefacto derivado, no una deriva de código.

## Paths clave

| Path | Rol |
|---|---|
| `src/cli/index.js` | Entry point, subcomandos, instalación, merge, MCP, stats |
| `src/cli/ui.js` | Banner y menús TTY |
| `src/core/adapters/frontmatter.js` | Adaptación pura de frontmatter por host |
| `src/core/tier-models.js` | Tiers, cadenas, resolver, normalización de `gratis` y `declaredModelIds` |
| `src/core/model-catalog.js` | Validación, IDs del catálogo e integridad de declarados |
| `src/core/model-catalog.json` | Snapshot verificado de modelos |
| `src/core/repomix-tier.js` | Configuración de pack por tier |
| `src/core/machine-env.js` | Detección de entorno y exclusión local |
| `scripts/refresh-model-catalog.mjs` | Refresco manual, gate de `--write` y escritura atómica |
| `templates/AGENTS.md`, `templates/PRODUCT.md` | Templates con bloques `LOCKED` |
| `profiles/test/**` | Overlay del perfil de test |
