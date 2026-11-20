---
node: units/_map
kind: inventory
read_when: "qué unidades componen el repo, con propósito y entry point"
generatedAt: 2026-11-20T01:12:16.920Z
pluginVersion: 0.40.1
skillVersion: '2.3'
---

# Mapa de unidades

| Unidad | Propósito | Entry point | Dossier |
| --- | --- | --- | --- |
| CLI y ciclo de vida | Dispatch de subcomandos, instalación, actualización, import/export, diagnósticos | `src/cli/index.js` | `units/cli-install.md` |
| UI de terminal | Banner animado y menús TTY (selección simple/múltiple) | `src/cli/ui.js` | — |
| Instalador multi-host | Copia assets, adapta frontmatter, configura MCP, aplica tiers | `src/cli/index.js`, `src/core/adapters/frontmatter.js` | `units/cli-install.md` |
| Discovery | Topología, globs, estado, impacto y pack Repomix | `src/core/discovery.js`, `src/core/discovery-state.js`, `src/core/discovery-glob.js`, `src/core/repomix-tier.js` | `units/discovery-engine.md` |
| Affected-set | Grafo de imports y clausura de dependientes | `src/core/affected-set.js` | `units/discovery-engine.md` |
| Selección de tests | Plan determinista fail-closed sobre el affected-set | `src/core/test-selection.js`, `scripts/test-affected.mjs` | `units/discovery-engine.md` |
| Modelos y tiers | Catálogo, declaraciones versionadas y resolución por tier | `src/core/model-catalog.js`, `src/core/model-declarations.js`, `src/core/tier-models.js` | `units/discovery-engine.md` |
| Memoria | Motor SQLite/FTS5, refs, operaciones y tools MCP | `src/core/memory/**` | `units/memory-engine.md` |
| Working-context | Artefacto derivado de topología + reglas críticas | `src/core/memory/working-context.js` | `units/memory-engine.md` |
| Snapshot y curaduría | Copia consistente y reporte read-only | `src/core/memory/snapshot.js`, `src/core/memory/curation.js` | `units/memory-engine.md` |
| Doctor y estado | Integridad de la base y gap de memoria | `src/core/memory/doctor.js`, `src/core/memory/status.js` | `units/memory-engine.md` |
| Specs | Validación canónica y merge de deltas | `src/core/specs-merge.js` | — |
| Entorno de máquina | Detección de shell/EOL/tools y exclusión git | `src/core/machine-env.js` | — |
| Juez advisory | Adaptador read-only a `jev-spec` | `src/core/judge.js` | — |
| Catálogo (refresco) | Actualización manual del snapshot desde `opencode` | `scripts/refresh-model-catalog.mjs` | `units/discovery-engine.md` |
| Assets instalables | Agentes, comandos, skills, templates y perfil de test | `agents/`, `commands/`, `skills/`, `templates/`, `profiles/` | `units/cli-install.md` |
| Artefactos SDD | Changes activos/archivados y specs canónicas | `aspec/changes/**`, `aspec/specs/**` | — |
| Seed técnico | Documentación navegable generada por discovery | `docs/technical-discovery/**` | — |

## Cómo leer esta tabla

- Un dossier existe solo para las tres unidades de mayor impacto: instalación, discovery/modelos
  y memoria. El resto se orienta desde esta tabla y su entry point.
- “Entry point” es el archivo desde el que se entiende el comportamiento, no necesariamente el
  único archivo de la unidad.
- Para impacto de un cambio, cruzá esta tabla con `seed-map.json` y `decisions.md`.
