---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-05T23:05:00Z
pluginVersion: 0.20.0
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto`, alias `aspec`). No es un
inventario: enruta a la respuesta más corta. Evidencia base: pack Repomix comprimido del tier
`minimo` (803 archivos reportados, ~37.189 tokens), `package.json` (`0.20.0`),
`src/core/model-catalog.json` y el reporte `ancleto discovery --check`. El pack lo generó el CLI
del propio repo (`node src/cli/index.js discovery`) con la compresión del tier `minimo`; ese tier
excluye `test/**`, `docs/**` y `**/*.md`, y el pack llega comprimido (cuerpos de funciones
elididos). Por eso las áreas Markdown —`aspec/specs/**`, `aspec/changes/**`, `README.md`,
`CHANGELOG.md`— y los detalles finos de comportamiento se verificaron por lectura directa de los
paths citados (ver `unknowns.md`).

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tiers, tests, lint, validaciones | `setup.md` |
| Reglas, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias observables (npm, GitHub, Repomix, git, MCP, opencode) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills, commands) con propósito y entry point | `units/_map.md` |
| **Modelos por tier**: `TIERS` agente→string, `TIER_CHAINS`, resolver contra catálogo, `gratis` free-only, oráculo de `check` | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Modelo gratis sobre agente primario**: `freeTierOnPrimary(model, mode)`, aviso en `applyTier` (set-time) y en `check` (inspect-time) | `decisions.md`, `units/cli-install.md` |
| **Diagnósticos `check`/`doctor` (0.18.15–0.19.0)**: deriva de `.ancletorc.version`, tier dormido sin superficie de agentes, precedencia de config MCP y alcance host-aware | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Salud MCP (0.18.16–0.19.0)**: `mcpCommandBroken` por existencia, `findProjectMcpFile`/`PROJECT_MCP_CANDIDATES`, avisos de `check` sobre los destinos de los hosts instalados, aviso de `import` | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Capability `cli-diagnostics`** y changes archivados `check-doctor-state-parity`, `mcp-command-health`, `mcp-host-write-routing` y `mcp-oracle-residual-closure` | `decisions.md`, `overview.md`, `units/cli-install.md` |
| **Nota de compresión host-scoped**: `resolvesHostCompression`, gate estado-driven en `install`/`init`/`import`, alcance host activo, excepción M2 | `decisions.md`, `units/cli-install.md` |
| **Validación de bundles**: `manifest.mcp` debe ser array de entradas con `name` string antes del primer write | `decisions.md`, `units/cli-install.md` |
| **Catálogo de modelos**: snapshot de 5 proveedores / 211 IDs, helpers `declaredModelIds` / `modelIdsFromCatalog` / `missingModelIdsInCatalog`, guard de integridad | `decisions.md`, `units/discovery-engine.md` |
| **Integridad de IDs declarados**: fuentes versionadas, helper puro, gate de `--write` y aviso advisory de `check` | `decisions.md`, `units/discovery-engine.md`, `units/cli-install.md` |
| **Descubrimiento dev-only**: clasificaciones `available`/`binary-missing`/`network-unavailable`/`partial`, `looksBinaryMissing` locale-independent, diff y escritura atómica | `units/discovery-engine.md`, `integrations.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, rutas por host, adaptadores, MCP, `check`, `doctor` | `units/cli-install.md` |
| **Ruteo MCP por host (0.19.0)**: `HOST_MCP_TARGETS`, `setupHostMcp`, destinos por host, `check`/`doctor` host-aware | `decisions.md`, `units/cli-install.md` |
| **Bundle host-neutral (0.20.0)**: `readHostMcpIntent`, `export` por host, `import` con copia `.opencode/*` sólo en `opencode` | `decisions.md`, `units/cli-install.md` |
| Portabilidad `export`/`import`: bundle, `--repair`, `installedPaths` acumulativo | `units/cli-install.md`, `decisions.md` |
| Discovery: mapa topológico, pack Repomix, estado del seed, `affectedDocs`, affected-set | `units/discovery-engine.md` |
| Memoria persistente: SQLite+FTS5, tools MCP, recall, refs, working-context, ops, doctor, curate | `units/memory-engine.md` |
| Errores o fallos de tool parts de sesiones opencode (`stats failures`) | `units/cli-install.md`, `integrations.md` |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bins `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs con descubrimiento técnico, memoria persistente local
  (`.ancleto/memory.db`, `node:sqlite`) y control explícito de costo por tier.
- **Versión del repo**: `package.json` = `0.20.0` (HEAD `f86f829`, rama `development`).
  `.ancletorc` y `.ancleto/machine-env.md` también registran `0.20.0`; ambos son artefactos
  gitignored que se regeneran en `init`/`install`/`upgrade`.
- **Cambios recientes archivados**:
  `aspec/changes/archive/2026-11-05-host-neutral-bundle/` (bundle host-neutral: intención MCP de
  `export` por host y copia/registro de `.opencode/*` en `import` acotados al host activo),
  `aspec/changes/archive/2026-11-05-mcp-host-write-routing/` (descriptor único de destino MCP por
  host y `check`/`doctor` host-aware),
  `aspec/changes/archive/2026-11-05-mcp-oracle-residual-closure/` (texto alineado al predicado MCP
  y par global de `doctor` derivado de `PROJECT_MCP_CANDIDATES`) y
  `aspec/changes/archive/2026-11-05-mcp-command-health/` (salud MCP por existencia y avisos
  advisory).
- **Catálogo**: `src/core/model-catalog.json` con `generated_at: 2026-11-04` y 211 IDs en 5
  proveedores (`opencode` 10, `opencode-go` 30, `anthropic` 20, `commandcode` 71, `openai` 80).
  Sin cambios en 0.19.0 ni 0.20.0. `agents/` (10), `commands/` (16) y `skills/` (21) tampoco cambian.
- **Pack actual**: 803 archivos enumerados, ~37.189 tokens. El `.discovery-map.json` regenerado en
  esta corrida reporta 813 archivos (aspec 245).
- **Estado del chequeo**: el CLI regeneró `.discovery-state.json` antes de materializar este seed,
  por lo que `discovery --check` reporta `READY`; el contenido de los documentos se actualizó igual
  a 0.20.0 desde el pack de la corrida.
