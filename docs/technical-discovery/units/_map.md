---
node: units/_map
kind: inventory
read_when: "qué unidades componen el repo, con propósito y entry point"
generatedAt: 2026-11-21T05:55:56.128Z
pluginVersion: 0.43.1
skillVersion: '2.3'
---

# Mapa de unidades

| Unidad | Propósito | Entry point | Dossier |
| --- | --- | --- | --- |
| CLI y ciclo de vida | Dispatch de subcomandos, instalación, actualización, import/export, diagnósticos | `src/cli/index.js` | `units/cli-install.md` |
| UI de terminal | Banner animado y menús TTY (selección simple/múltiple) | `src/cli/ui.js` | — |
| Instalador multi-host | Copia assets, adapta frontmatter, configura MCP, aplica tiers | `src/cli/index.js`, `src/core/adapters/frontmatter.js` | `units/cli-install.md` |
| Matriz de hosts (tests) | Verificación offline de 8 hosts × `init`/`install`/`update`/`upgrade`/`import --repair` | `test/host-matrix.test.js` | `units/cli-install.md` |
| Discovery | Topología, globs, estado, impacto y pack Repomix | `src/core/discovery.js`, `src/core/discovery-state.js`, `src/core/discovery-glob.js`, `src/core/repomix-tier.js` | `units/discovery-engine.md` |
| Affected-set | Grafo de imports y clausura de dependientes | `src/core/affected-set.js` | `units/discovery-engine.md` |
| Selección de tests | Plan determinista fail-closed sobre el affected-set | `src/core/test-selection.js`, `scripts/test-affected.mjs` | `units/discovery-engine.md` |
| Modelos y tiers | Catálogo, declaraciones versionadas y resolución por tier | `src/core/model-catalog.js`, `src/core/model-declarations.js`, `src/core/tier-models.js` | `units/discovery-engine.md` |
| Memoria | Motor SQLite/FTS5, recall BM25-first, validación de import, refs, operaciones y tools MCP | `src/core/memory/**` | `units/memory-engine.md` |
| Validación de import | Esquema de entrada compartido por import y dry-run; `scope` string no vacío (0.43.0) | `src/core/memory/engine.js` (`validateImportEntries`) | `units/memory-engine.md` |
| Working-context | Artefacto derivado de topología + reglas críticas; resuelve el presupuesto configurable (0.42.0) | `src/core/memory/working-context.js` | `units/memory-engine.md` |
| Snapshot y curaduría | Copia consistente y reporte read-only | `src/core/memory/snapshot.js`, `src/core/memory/curation.js` | `units/memory-engine.md` |
| Doctor y estado | Integridad de la base, frescura del working-context y gap de memoria | `src/core/memory/doctor.js`, `src/core/memory/status.js` | `units/memory-engine.md` |
| Specs | Validación canónica y merge de deltas | `src/core/specs-merge.js` | — |
| Entorno de máquina | Detección de shell/EOL/tools y exclusión git | `src/core/machine-env.js` | — |
| Juez advisory | Adaptador read-only a `jev-spec` | `src/core/judge.js` | — |
| Catálogo (refresco) | Actualización manual del snapshot desde `opencode` | `scripts/refresh-model-catalog.mjs` | `units/discovery-engine.md` |
| Assets instalables | Agentes, comandos, skills, templates y perfil de test | `agents/`, `commands/`, `skills/`, `templates/`, `profiles/` | `units/cli-install.md` |
| Artefactos SDD | Changes activos/archivados, specs canónicas y backlog de release | `aspec/changes/**`, `aspec/specs/**`, `aspec/backlog.md` | — |
| Baseline CH-00 | Baseline read-only de conformidad y métricas previo a optimizaciones | `docs/baseline/CH-00-2026-11-20.md` | — |
| Change archivado (matriz) | Matriz offline de hosts y delta de `agent-install-routing` | `aspec/changes/archive/2026-11-21-ch-10-host-matrix-hardening/**` | `units/cli-install.md` |
| Change archivado (baseline) | Evidencia read-only de CH-00 | `aspec/changes/archive/2026-11-20-ch-00-baseline/**` | — |
| Change archivado (trigger) | Gate read-only del A/B de prefijos/caché/modelos (CH-07) | `aspec/changes/archive/2026-11-21-ch-07-trigger-workload-metricas-host/**` | — |
| Change archivado (import) | Evidencia y delta del `scope` string en el import | `aspec/changes/archive/2026-11-20-memory-import-scope-string/**` | `units/memory-engine.md` |
| Change archivado (presupuesto) | Evidencia del presupuesto configurable y del delta de specs | `aspec/changes/archive/2026-11-20-memory-working-context-budget/**` | `units/memory-engine.md` |
| Change archivado BM25 | Evidencia y medición del recall BM25-first (spikes y tuning) | `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/**` | `units/memory-engine.md` |
| Seed técnico | Documentación navegable generada por discovery | `docs/technical-discovery/**` | — |

## Cómo leer esta tabla

- Un dossier existe solo para las tres unidades de mayor impacto: instalación, discovery/modelos
  y memoria. El resto se orienta desde esta tabla y su entry point.
- “Entry point” es el archivo desde el que se entiende el comportamiento, no necesariamente el
  único archivo de la unidad.
- Para impacto de un cambio, cruzá esta tabla con `seed-map.json` y `decisions.md`.
- Los changes `ch-10-host-matrix-hardening`, `ch-00-baseline` y
  `ch-07-trigger-workload-metricas-host` están archivados y no cambian runtime; sus carpetas son
  evidencia de la decisión. Lo mismo aplica a `memory-import-scope-string`,
  `memory-working-context-budget` y `memory-recall-bm25-first`.
- `test/host-matrix.test.js` es la verificación ejecutable del ruteo de assets/MCP por host; el
  pack de discovery no incluye tests, por eso se documenta como evidencia leída aparte.
