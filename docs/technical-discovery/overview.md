---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-11-05T23:05:00Z
pluginVersion: 0.20.0
skillVersion: '2.3'
---

# Overview

## Propósito

`@ancleto/spec` es un **orquestador de Spec-Driven Development** que vive dentro del IDE del
usuario (`opencode`, Claude, VS Code, Antigravity, Cursor, Roo, Copilot, Command Code). Cubre tres
funciones (`PRODUCT.md`, `README.md`):

1. **Especificar**: ciclo de changes con artifacts `proposal`/`design`/`tasks`/`specs` y comandos
   `/cleto-*`.
2. **Descubrir**: mapa topológico del repo y empaquetado de contexto con Repomix, con presupuesto
   por tier.
3. **Recordar**: memoria persistente local de reglas y decisiones en `.ancleto/memory.db`
   (SQLite + FTS5 vía `node:sqlite`), expuesta como tools MCP.

Restricciones declaradas: **cero dependencias de runtime** y **Node ≥ 24** (`PRODUCT.md`,
`package.json`). Todo el producto se distribuye como assets Markdown instalables más un CLI ESM.

## Arquitectura

```text
src/cli/index.js        entrada única; subcomandos, instalación, plantillas, MCP, stats, check/doctor
src/cli/ui.js           banner y menús TTY propios (selectOption/selectMultiple)
src/core/
  tier-models.js        dueño de TIERS/TIER_CHAINS + resolver puro + declaredModelIds
                        + freeTierOnPrimary (modelo free sobre agente primario)
  model-catalog.js      helpers puros: parseo, diff, validación, clasificación, integridad
  model-catalog.json    snapshot verificado de IDs por proveedor
  discovery.js          mapa topológico (.discovery-map.json)
  repomix-tier.js       configuración de pack por tier (ignores/compresión/presupuesto)
  affected-set.js       grafo de imports y clausura de dependientes
  machine-env.js        detección y render de .ancleto/machine-env.md
  adapters/frontmatter.js  adaptación pura de frontmatter por host (+ frontmatterValue)
  memory/               motor, DB, tools, MCP, doctor, curaduría, snapshot, working-context
scripts/refresh-model-catalog.mjs  descubrimiento dev-only del catálogo (manual)
agents/ commands/ skills/ templates/ profiles/  assets instalables
aspec/                  config + specs + changes (incluye archive)
test/                   suite node --test
```

- **Sin framework**: la UI de terminal y los parsers (frontmatter, refs, imports) son propios.
- **Separación por módulos**: el CLI orquesta; la lógica con invariantes vive en `src/core/*`.
  `src/core/tier-models.js` es el único dueño de la tabla de modelos, del resolver,
  `declaredModelIds` y del predicado `freeTierOnPrimary`; `src/core/model-catalog.js` es el único
  dueño del parseo, diff, validación e integridad del snapshot. El CLI importa ambos (ver
  `decisions.md`).
- **Descriptor MCP único**: `src/cli/index.js` → `HOST_MCP_TARGETS` declara archivo y esquema por
  host; `setupHostMcp`, `resolveHostMcpDestination` y `readHostMcpIntent` son los únicos caminos de
  escritura y lectura de esa intención. Ningún comando repite literales de destino por host.
- **Estado local por proyecto**: `.ancletorc` (manifiesto), `.opencode/.ancleto-tier` (tier
  aplicado), el layout nativo de assets por host (`.opencode`, `.claude`, `.agents`,
  `.commandcode`, `.github`, `.cursor`, `.roo`), `.ancleto/memory.db` y
  `.ancleto/machine-env.md` (artefactos locales).

## Componentes principales

| Componente | Rol | Entry point |
|---|---|---|
| CLI / instalación | `init`, `install`/`update`, `upgrade`, `import`/`export`, `check`, `doctor` | `src/cli/index.js` |
| Resolución de modelos | Tiers, cadenas de fallback, catálogo, oráculo de `check`, aviso free-on-primary | `src/core/tier-models.js` |
| Catálogo de modelos | Snapshot versionado; helpers puros; integridad de IDs y refresco manual dev-only | `src/core/model-catalog.js`, `src/core/model-catalog.json`, `scripts/refresh-model-catalog.mjs` |
| Discovery | Topología, fuentes, hashes, impacto y estado del seed | `src/core/discovery.js`, `src/cli/index.js` |
| Empaquetado | Args de Repomix y presupuesto por tier | `src/core/repomix-tier.js` |
| Memoria | Nodos, supersesión, refs, recall, working-context | `src/core/memory/*` |
| Adaptación por host | Frontmatter de agents y layout de assets | `src/core/adapters/frontmatter.js`, `src/cli/index.js` |
| Ruteo MCP por host | Descriptor único de destino/esquema; escritura por host activo e intención de bundle | `src/cli/index.js` → `HOST_MCP_TARGETS`, `setupHostMcp`, `readHostMcpIntent` |
| Diagnósticos | Oráculo de instalación (`check`, salud MCP host-aware) y entorno/MCP (`doctor`) | `src/cli/index.js` → `checkCommand`, `doctorCommand` |
| Entorno de máquina | Shell, EOL y tooling del clon | `src/core/machine-env.js` |
| Assets | 10 agentes, 16 commands, 21 skills, templates y perfiles | `agents/`, `commands/`, `skills/`, `templates/`, `profiles/` |

## Flujos principales

1. **Instalación / init**: `ancleto init` crea `.ancletorc` y configura MCP; `install` materializa
   assets en el destino nativo del host, adapta frontmatter, aplica el tier (solo opencode escribe
   `model:`), mergea templates `LOCKED` y registra `installedPaths`.
2. **Ciclo SDD**: `/cleto-new` → `/cleto-propose` → `/cleto-apply` → `/cleto-verify` →
   `/cleto-archive`; los artifacts viven en `aspec/changes/<name>/` y los specs canónicos en
   `aspec/specs/`.
3. **Discovery del repo**: `ancleto discovery --compress` escribe `.discovery-map.json`, genera el
   pack y guarda `.discovery-state.json`; la skill `ancleto-technical-discovery` produce el seed.
4. **Memoria**: los agentes escriben reglas/decisiones (`recordRule`/`recordDecision` o CLI), el
   motor supersede por `memory_key`, valida refs y secretos, y materializa
   `.ancleto/working-context.md` para el arranque de sesión.
5. **Tiers**: `normal` usa modelos de `opencode-go`; `minimo` resuelve por cadena contra el catálogo;
   `gratis` usa únicamente `opencode/big-pickle`. El catálogo se refresca a mano con
   `scripts/refresh-model-catalog.mjs`; ni el runtime ni CI descubren modelos ni acceden a la red.
6. **Integridad del catálogo (0.18.12)**: todo ID declarado en `TIERS`, `TIER_CHAINS`,
   `agents/*.md` y `profiles/*/agents/*.md` se contrasta contra el snapshot. El guard de tests usa
   `declaredModelIds` + `missingModelIdsInCatalog`; `refresh-model-catalog --write` bloquea la
   escritura si falta un ID; `check` emite un aviso advisory no bloqueante si el catálogo válido no
   contiene algún ID declarado.
7. **Integridad del tier `gratis` y de `import` (0.18.13)**: `freeTierOnPrimary(model, mode)` cruza
   modelo gratis con `mode: primary`; `applyTier` avisa por `stderr` al escribir y `check` agrega una
   entrada advisory al inspeccionar, sin bloquear ni cambiar el exit code. `import` escribe
   `installedPaths` como unión acumulativa de lo declarado en el destino y lo que él mismo escribió,
   sin heredar las rutas del bundle. Desde 0.20.0, la copia y el registro de
   `.opencode/{agents,commands,skills}` sólo ocurren cuando el host activo es `opencode`.
8. **Consistencia de la nota de compresión (0.18.14)**: `install`, `init` e `import` deciden
   `CAVEMAN_USAGE_NOTE` con `resolvesHostCompression(projectDir, host, { writesCaveman, intendedNames })`,
   que combina la config MCP en disco con la escritura pendiente del comando. La nota existe para el
   orchestrator del host activo si y sólo si ese host soporta compresión y la config MCP final
   incluye `caveman`; `check` conserva su contrato advisory. `import` además valida `manifest.mcp`
   antes del primer write.
9. **Paridad de diagnóstico (0.18.15)**: sólo cambia la capa de lectura. `check` deja de avisar un
   tier huérfano cuando el host no declara superficie local de agentes (el tier queda *dormido*),
   agrega un aviso advisory por deriva entre `.ancletorc.version` y la versión del CLI, y `doctor`
   valida la config MCP del proyecto con precedencia sobre la global (desde 0.19.0, ver flujo 11).
10. **Salud de comandos MCP (0.18.16)**: `mcpCommandBroken` evalúa la existencia de una ruta
    absoluta (incluida `C:\...` en Windows); una ruta sana deja de reescribirse en `import --repair`
    y en los `refresh*`. `findProjectMcpFile` y `PROJECT_MCP_CANDIDATES` concentran el
    descubrimiento `.opencode/opencode.json|jsonc`; `check` agrega avisos no bloqueantes por config
    no parseable y por comandos rotos; `import` avisa antes de reemplazar una config no parseable.
11. **Ruteo MCP por host (0.19.0)**: `HOST_MCP_TARGETS` es el descriptor único
    (`opencode` → `.opencode/opencode.json|jsonc`, `antigravity` → `.agents/mcp_config.json`,
    `commandcode` → `.mcp.json`, `copilot` → `copilot-mcp.json`; `claude`, `vscode`, `cursor` y `roo`
    sin destino). `init`, `install`/`update`, `import` e `import --repair` escriben en el destino del
    host activo y no crean `.opencode` en hosts que no lo leen. `check` inspecciona los destinos
    existentes de los hosts instalados (derivados de `installedPaths`) y `doctor` prioriza el host
    activo/instalados antes del fallback global de `opencode`; todo hallazgo MCP sigue siendo
    advisory y los exit codes no cambian.
12. **Bundle host-neutral (0.20.0)**: `readHostMcpIntent(projectDir, host)` resuelve la intención MCP
    del destino del host activo. `export` la usa: destino ausente → `manifest.mcp = []` sin aviso;
    archivo no parseable → `manifest.mcp = []` y un único aviso no bloqueante con exit 0; hosts sin
    destino conservan la lectura legacy de `.opencode`. `import` copia y registra `.opencode/*` sólo
    cuando el host activo es `opencode`; en los demás hosts los assets se materializan por
    `installAgentAssets`, y `installedPaths` sigue siendo la unión de lo realmente escrito.

## Recorrido de una instalación con tier `minimo`

`ancleto install --project . --tier minimo` → `resolveTierMap('minimo')` carga
`src/core/model-catalog.json` y elige por agente el primer candidato disponible de
`TIER_CHAINS.minimo` (`commandcode/deepseek/deepseek-v4.1-flash` →
`opencode-go/deepseek-v4.1-flash` → `opencode/deepseek-v4.1-flash-free`) → si ninguno está,
aborta sin escribir modelos inventados → `applyTier` reescribe `model:` en
`.opencode/agents/*.md` → se persiste `minimo` en `.opencode/.ancleto-tier`.

Para confirmar un detalle, leer el archivo citado en el documento correspondiente; el seed
orienta, no reemplaza al código.
