---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-06T20:07:32Z
pluginVersion: 0.22.2
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto`, alias `aspec`). No es un
inventario: enruta a la respuesta más corta. Evidencia base: pack Repomix comprimido del tier
`minimo` (824 fuentes, ~38.087 tokens), `package.json` (`0.22.2`), `src/core/model-catalog.json` y
el reporte `ancleto discovery --check`. El pack lo generó el CLI del propio repo
(`node src/cli/index.js discovery`) con la compresión del tier `minimo`; ese tier excluye `test/**`,
`docs/**` y `**/*.md`, y el pack llega comprimido (cuerpos de funciones elididos). Por eso las áreas
Markdown —`aspec/specs/**`, `aspec/changes/**`, `agents/**`, `skills/**`, `README.md`,
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
| **Merge de specs (0.22.0–0.22.1)**: `ancleto specs merge --change <slug> [--dry-run] [--json]`, `src/core/specs-merge.js`, capability `spec-sync`; preámbulo H1 estructural, contenedor `archive` fail-closed, `ADDED` con una línea en blanco y atomicidad acotada al plan | `decisions.md`, `units/cli-install.md`, `units/_map.md` |
| **Orden del archive (0.22.1)**: merge/sync → preflight read-only → promoción de `## Decisiones` → move → commit; literales de fallo y superficies canónicas | `decisions.md`, `units/memory-engine.md`, `units/_map.md` |
| **Conformidad vs cambio funcional (0.21.0)**: predicado de cita resoluble + ausencia de bloques delta, `spec-required`, ruteo único | `decisions.md`, `overview.md`, `units/_map.md` |
| **Archive de conformidad sin delta (0.21.0)**: reporte "sin delta", cita fail-closed, garantía acotada, reuso del ledger cerrado | `decisions.md`, `units/cli-install.md` |
| **Modelos por tier**: `TIERS` agente→string, `TIER_CHAINS`, resolver contra catálogo, `gratis` free-only, oráculo de `check` | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Modelo gratis sobre agente primario**: `freeTierOnPrimary(model, mode)`, aviso en `applyTier` (set-time) y en `check` (inspect-time) | `decisions.md`, `units/cli-install.md` |
| **Diagnósticos `check`/`doctor` (0.18.15–0.19.0)**: deriva de `.ancletorc.version`, tier dormido sin superficie de agentes, precedencia de config MCP y alcance host-aware | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Salud MCP (0.18.16–0.19.0)**: `mcpCommandBroken` por existencia, `findProjectMcpFile`/`PROJECT_MCP_CANDIDATES`, avisos de `check` sobre los destinos de los hosts instalados, aviso de `import` | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Capabilities `cli-diagnostics`, `agent-install-routing`, `project-portability`, `prompt-contracts`, `spec-sync`** y changes archivados de diagnóstico, portabilidad, conformidad y merge de specs | `decisions.md`, `overview.md`, `units/cli-install.md` |
| **Nota de compresión host-scoped**: `resolvesHostCompression`, gate estado-driven en `install`/`init`/`import`, alcance host activo, excepción M2 | `decisions.md`, `units/cli-install.md` |
| **Validación de bundles**: `manifest.mcp` debe ser array de entradas con `name` string antes del primer write | `decisions.md`, `units/cli-install.md` |
| **Catálogo de modelos**: snapshot de 5 proveedores / 211 IDs, helpers `declaredModelIds` / `modelIdsFromCatalog` / `missingModelIdsInCatalog`, guard de integridad | `decisions.md`, `units/discovery-engine.md` |
| **Integridad de IDs declarados**: fuentes versionadas, helper puro, gate de `--write` y aviso advisory de `check` | `decisions.md`, `units/discovery-engine.md`, `units/cli-install.md` |
| **Descubrimiento dev-only**: clasificaciones `available`/`binary-missing`/`network-unavailable`/`partial`, `looksBinaryMissing` locale-independent, diff y escritura atómica | `units/discovery-engine.md`, `integrations.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, rutas por host, adaptadores, MCP, `check`, `doctor`, `specs merge` | `units/cli-install.md` |
| **Ruteo MCP por host (0.19.0)**: `HOST_MCP_TARGETS`, `setupHostMcp`, destinos por host, `check`/`doctor` host-aware | `decisions.md`, `units/cli-install.md` |
| **Bundle host-neutral (0.20.0)**: `readHostMcpIntent`, `export` por host, `import` con copia `.opencode/*` sólo en `opencode` | `decisions.md`, `units/cli-install.md` |
| **Reparación MCP sin escritura (0.20.1)**: `repairProjectMcp` escribe sólo ante error de parseo, normalización estructural o entradas reparadas/agregadas; destino sano intacto | `decisions.md`, `units/cli-install.md` |
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
  (`.ancleto/memory.db`, `node:sqlite`) y control explícito de costo por tier. Desde 0.21.0 el
  ciclo distingue **changes de conformidad** (citan un Requirement existente y no llevan delta) de
  cambios funcionales; desde 0.22.0 el merge de delta specs es un comando CLI determinístico,
  endurecido en 0.22.1, y desde 0.22.1 el archive promueve las decisiones aprobadas antes del move.
- **Versión del repo**: `package.json` = `0.22.2` (rama `development`). `.ancletorc` y
  `.ancleto/machine-env.md` son artefactos gitignored que se regeneran en `init`/`install`/`upgrade`;
  esta materialización no los usa como fuente de reglas.
- **Cambios recientes archivados**:
  `aspec/changes/archive/2026-11-06-specs-merge-hardening/` (0.22.1: contenedor `archive`
  fail-closed, preámbulo H1 estructural, `ADDED` con una línea en blanco y exclusión de atomicidad
  de la fase de escritura),
  `aspec/changes/archive/2026-11-06-archive-order-correctness/` (0.22.1: promoción antes del move,
  fases A/B del documenter y semántica de fallo),
  `aspec/changes/archive/2026-11-06-ch-06a-specs-merge-deterministic/` (0.22.0: módulo puro
  `src/core/specs-merge.js`, subcomando `specs merge` y capability `spec-sync`),
  `aspec/changes/archive/2026-11-06-p0-pr5-archive-conformity/` (0.21.0: discriminador
  conformidad-vs-delta, archive de conformidad sin delta, ruteo alineado en orchestrator, triage,
  workflow y continue; dos Requirements nuevos en `prompt-contracts`),
  `aspec/changes/archive/2026-11-06-fix-repair-mcp-noop/` (0.20.1: `repairProjectMcp` no reescribe
  un destino MCP sano),
  `aspec/changes/archive/2026-11-05-host-neutral-bundle/` (bundle host-neutral) y
  `aspec/changes/archive/2026-11-05-mcp-host-write-routing/` (descriptor de destino MCP por host).
- **Catálogo**: `src/core/model-catalog.json` con `generated_at: 2026-11-04` y 211 IDs en 5
  proveedores (`opencode` 10, `opencode-go` 30, `anthropic` 20, `commandcode` 71, `openai` 80).
   Sin cambios en 0.19.0–0.22.1. `agents/` (10), `commands/` (16) y `skills/` (21 directorios, 35
   archivos) mantienen el conteo; en 0.22.1 no cambió su cantidad.
- **Pack actual**: 824 fuentes y ~38.087 tokens (comprimido, tier `minimo`), con 29 entradas de
   archivo en el cuerpo porque `test/**`, `docs/**` y `**/*.md` quedan excluidos. El
   `.discovery-map.json` de la corrida reporta 834 archivos (aspec 264, docs 21, test 27, src 19).
- **Estado del chequeo**: esta materialización actualizó los documentos afectados desde el pack y
   las fuentes citadas para reflejar 0.22.2, preservando la estructura del seed. El estado final
   (`READY`/`STALE`/`PARTIAL`) lo reporta el `ancleto discovery --check` posterior; no se ejecutó un
   segundo pack.
