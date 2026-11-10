---
node: inventory
kind: inventory
read_when: "verificar el alcance documentado de la semilla"
generatedAt: 2026-11-10T19:26:36Z
pluginVersion: 0.26.2
skillVersion: '2.3'
---

# Alcance documentado

| Alcance | Documento | Motivo |
|---|---|---|
| `src/cli/**` | `units/cli-install.md`, `overview.md` | Entry point único, subcomandos, instalación, ruteo MCP por host, diagnósticos `check`/`doctor`, nota de compresión, `export`/`import` host-neutral |
| `src/core/tier-models.js` | `decisions.md`, `units/discovery-engine.md` | Dueño de tiers/cadenas, resolver, `declaredModelIds` y `freeTierOnPrimary` |
| `src/core/model-catalog.js`, `src/core/model-catalog.json` | `decisions.md`, `units/discovery-engine.md` | Helpers puros, extracción de IDs, integridad y snapshot |
| `src/core/discovery.js`, `src/core/repomix-tier.js` | `units/discovery-engine.md` | Topología, impacto, args y presupuesto de pack |
| `src/core/affected-set.js` | `units/discovery-engine.md` | Grafo de imports y clausura de dependientes |
| `src/core/specs-merge.js` | `decisions.md`, `units/cli-install.md` | Merge puro de delta specs: parseo, plan por título exacto, fail-closed y serialización; 0.22.1 endurece H1, `archive` y espaciado; 0.24.0 rechaza headings de sección de delta en la canónica para los cuatro tipos; 0.25.0 es la única vía de sync de delta del archive y del bulk-archive |
| `src/core/adapters/frontmatter.js` | `units/cli-install.md` | Adaptación pura de frontmatter por host y `frontmatterValue` |
| `src/core/machine-env.js` | `units/cli-install.md`, `setup.md` | Detección de shell/EOL/tooling y exclusión local |
| `src/core/memory/**` | `units/memory-engine.md` | Motor, DB, tools, MCP, doctor, curaduría, snapshot; idempotencia de `recordNode` (0.23.0) |
| `scripts/**` | `decisions.md`, `units/discovery-engine.md` | Descubrimiento dev-only del catálogo; no se publica |
| `agents/**` | `units/_map.md`, `units/cli-install.md` | 10 agentes instalables (superficie de producto) |
| `commands/**` | `units/_map.md` | 16 comandos `/cleto-*` |
| `skills/**` | `units/_map.md` | 21 skills del ciclo SDD/discovery/review |
| `templates/**` | `units/cli-install.md`, `decisions.md` | `AGENTS.md`/`PRODUCT.md` con bloques `LOCKED` |
| `profiles/**` | `units/cli-install.md`, `decisions.md` | Overlay del perfil `test` (agents/commands/templates) |
| `aspec/**` | `overview.md`, `decisions.md` | Config, specs canónicos (incl. `prompt-contracts`, `cli-diagnostics`, `agent-install-routing`, `project-portability`, `spec-sync`, `memory-ops`, `memory-engine`) y changes archivados de diagnóstico, portabilidad, conformidad, merge, orden del archive, idempotencia de memoria, aviso de bundle legacy y EOL de templates (`mcp-host-write-routing`, `mcp-oracle-residual-closure`, `host-neutral-bundle`, `fix-repair-mcp-noop`, `p0-pr5-archive-conformity`, `ch-06a-specs-merge-deterministic`, `specs-merge-hardening`, `archive-order-correctness`, `memory-record-idempotency`, `portability-legacy-bundle-advisory`, `template-legacy-eol-preservation`, `agent-model-minimo-migration`, `specs-merge-canonical-guard`, `archive-sync-via-specs-merge`, `cli-subcommand-help-guards`, `fix-discovery-seedmap-present`, `spec-seed-freshness-detector`) |
| `test/**` | `setup.md`, `units/_map.md` | Suite `node --test`; guards de modelos, integridad, discovery, contenido, `specs-merge.test.js` y `memory-engine.test.js` |
| `.github/workflows/**` | `integrations.md` | Publicación npm y release GitHub |
| `eslint.config.js`, `package.json` | `setup.md`, `decisions.md` | Lint sobre `src/`, `test/`, `scripts/` y contrato de publicación |
| `docs/technical-discovery/**` | `index.md` | Este seed (excluido del hash de fuentes) |
| `docs/**` (resto) | `inventory.md` | Documentación del framework y guías |
| `documentation/**` | `integrations.md` | Material legado lnx-cli, gitignored, no runtime |
| `.ancletorc`, `.opencode/.ancleto-tier`, `opencode.json` | `setup.md`, `decisions.md` | Configuración y estado local por proyecto |
| `.ancleto/machine-env.md` | `setup.md` | Artefacto local derivado |
| `package.json`, `.gitattributes`, `.gitignore` | `setup.md`, `decisions.md` | Contrato de runtime, EOL y exclusiones |

## Áreas raíz observadas (`.discovery-map.json` al empacar)

`.github` (1), `.opencode` (66), `agents` (10), `aspec` (293), `audit logs` (9), `commands` (16),
`docs` (21), `documentation` (340), `profiles` (8), `scripts` (1), `skills` (35), `src` (19),
`templates` (2), `test` (27), más 15 archivos raíz. Total observado: **863 archivos**.

Notas de alcance: `audit logs/` y `documentation/` están gitignored y no son runtime.
`documentation/` tiene 366 archivos en disco, pero el mapa cuenta 340 tras excluir
`node_modules`/`.git`/`dist`/`build`/`coverage`. `skills/` tiene 21 directorios de skill que suman
35 archivos; `test/` tiene 27 archivos, todos `*.test.js` en la raíz (20, incluido
`specs-merge.test.js`; el patrón declarado es `test/*.test.js`). El pack del tier `minimo` excluye
`test/**`, `docs/**` y `**/*.md`, por lo que la evidencia de esas áreas se verificó por lectura
directa. El pack de esta generación registra 853 fuentes y ~38.610 tokens, con 29 entradas de
archivo en el cuerpo.

El `.discovery-map.json` observado en esta corrida reporta 863 archivos (aspec 293, `.opencode` 66,
src 19, test 27). Ver `unknowns.md`.
