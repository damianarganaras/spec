---
node: inventory
kind: inventory
read_when: "verificar el alcance documentado de la semilla"
generatedAt: 2026-11-20T17:05:16.811Z
pluginVersion: 0.41.0
skillVersion: '2.3'
---

# Alcance documentado

| Alcance | Documento | Motivo |
| --- | --- | --- |
| `src/cli/**` | `overview.md`, `units/cli-install.md` | Entry point, dispatch y ciclo de vida |
| `src/core/adapters/**` | `units/cli-install.md` | Transformación de frontmatter por host |
| `src/core/discovery*.js` | `units/discovery-engine.md` | Topología, globs y estado del seed |
| `src/core/repomix-tier.js` | `units/discovery-engine.md` | Presupuesto de tokens y argumentos del pack |
| `src/core/affected-set.js`, `src/core/test-selection.js` | `units/discovery-engine.md` | Impacto y tests afectados |
| `src/core/model-*.js`, `src/core/model-*.json`, `src/core/tier-models.js` | `units/discovery-engine.md` | Catálogo y resolución de modelos |
| `src/core/memory/**` | `units/memory-engine.md` | Persistencia, recall BM25-first, MCP y operaciones |
| `src/core/specs-merge.js` | `decisions.md` | Merge de delta specs |
| `src/core/machine-env.js`, `src/core/judge.js` | `integrations.md`, `decisions.md` | Integraciones locales |
| `agents/**`, `commands/**`, `skills/**`, `templates/**`, `profiles/**` | `units/cli-install.md` | Superficie de producto instalable |
| `scripts/**` | `units/discovery-engine.md` | Consumidores de afectados y catálogo |
| `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/**` | `units/memory-engine.md`, `decisions.md` | Evidencia y medición del recall BM25-first |
| `aspec/**` | `overview.md`, `decisions.md` | Artefactos SDD, specs y estado de release |
| `test/**` | `unknowns.md` | Excluido del pack; cobertura no auditada |
| `.github/workflows/**` | `integrations.md` | Publicación npm y Release |
| `docs/technical-discovery/**` | `index.md`, `inventory.md` | Este seed |
| `documentation/**`, `audit logs/**` | `unknowns.md` | Material legado/efímero, no runtime |

## Exclusiones deliberadas

- `test/**` y archivos `*.test.*`/`*.spec.*`: el pack los excluye por configuración.
- `docs/**` y `**/*.md`: Repomix los excluye por defaults; el seed no se usa como evidencia de sí
  mismo. `CHANGELOG.md` y `aspec/backlog.md` se leyeron aparte solo para el estado de release.
- `package-lock.json`, lockfiles e imágenes: excluidos por configuración.
- `.ancletorc`, `.opencode/**` y `.ancleto/**`: estado local; no se usan como evidencia ni se
  editan.
- `documentation/` y `audit logs/`: gitignored, legado/efímero.
