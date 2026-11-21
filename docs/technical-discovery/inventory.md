---
node: inventory
kind: inventory
read_when: "verificar el alcance documentado de la semilla"
generatedAt: 2026-11-21T05:55:56.128Z
pluginVersion: 0.43.1
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
| `src/core/memory/**` | `units/memory-engine.md` | Persistencia, recall BM25-first, presupuesto del working-context, validación del import, MCP y operaciones |
| `src/core/specs-merge.js` | `decisions.md` | Merge de delta specs |
| `src/core/machine-env.js`, `src/core/judge.js` | `integrations.md`, `decisions.md` | Integraciones locales |
| `agents/**`, `commands/**`, `skills/**`, `templates/**`, `profiles/**` | `units/cli-install.md` | Superficie de producto instalable |
| `scripts/**` | `units/discovery-engine.md` | Consumidores de afectados y catálogo |
| `test/host-matrix.test.js` | `units/cli-install.md`, `decisions.md` | Evidencia de la matriz offline de hosts (leída aparte; el pack excluye tests) |
| `aspec/changes/archive/2026-11-21-ch-10-host-matrix-hardening/**` | `units/cli-install.md`, `decisions.md` | Propuesta, tasks y delta del requirement de matriz de hosts |
| `aspec/changes/archive/2026-11-20-ch-00-baseline/**` | `units/_map.md`, `decisions.md` | Baseline read-only y su archivado |
| `aspec/changes/archive/2026-11-21-ch-07-trigger-workload-metricas-host/**` | `units/_map.md`, `decisions.md` | Gate read-only para el A/B de prefijos/caché/modelos |
| `aspec/changes/archive/2026-11-20-memory-import-scope-string/**` | `units/memory-engine.md`, `decisions.md` | Evidencia y delta del `scope` string en el import |
| `aspec/changes/archive/2026-11-20-memory-working-context-budget/**` | `units/memory-engine.md`, `decisions.md` | Evidencia del presupuesto configurable y del delta de specs |
| `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/**` | `units/memory-engine.md`, `decisions.md` | Evidencia y medición del recall BM25-first |
| `aspec/**`, `CHANGELOG.md` | `overview.md`, `decisions.md` | Artefactos SDD, specs y estado de release |
| `docs/baseline/**` | `overview.md`, `units/_map.md` | Baseline CH-00 (read-only) |
| `test/**` | `unknowns.md` | Excluido del pack; cobertura no auditada salvo `host-matrix.test.js` |
| `.github/workflows/**` | `integrations.md` | Publicación npm y Release |
| `docs/technical-discovery/**` | `index.md`, `inventory.md` | Este seed |
| `documentation/**`, `audit logs/**` | `unknowns.md` | Material legado/efímero, no runtime |

## Exclusiones deliberadas

- `test/**` y archivos `*.test.*`/`*.spec.*`: el pack los excluye por configuración (y `test/**`
  por default de Repomix). Se leyó aparte, de forma acotada, `test/host-matrix.test.js` y el diff
  de `test/affected-tests.json` para documentar la matriz de 0.43.1.
- `docs/**` y `**/*.md`: Repomix los excluye por defaults; el seed no se usa como evidencia de sí
  mismo. `CHANGELOG.md`, `aspec/backlog.md`, `aspec/specs/agent-install-routing/spec.md` y
  `docs/baseline/CH-00-2026-11-20.md` se leyeron aparte, de forma acotada, para el estado de
  release y el contrato de la matriz.
- `package-lock.json`, lockfiles e imágenes: excluidos por configuración.
- `.ancletorc`, `.opencode/**` y `.ancleto/**`: estado local; no se usan como evidencia ni se
  editan. `.ancletorc` sí participa del walk de frescura como archivo raíz.
- `documentation/` y `audit logs/`: gitignored, legado/efímero.
- El `outputDir` del seed se omite del walk de frescura: reescribir estos documentos no genera
  deriva ni `affectedDocs`.
