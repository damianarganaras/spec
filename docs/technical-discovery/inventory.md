---
node: inventory
kind: inventory
read_when: "verificar el alcance documentado de la semilla"
generatedAt: 2026-11-13T20:53:42Z
pluginVersion: 0.33.1
skillVersion: '2.3'
---

# Alcance documentado

| Alcance | Documento | Motivo |
|---|---|---|
| `src/cli/**` | `units/cli-install.md`, `overview.md` | Entry point único, subcomandos, instalación, ruteo MCP por host, diagnósticos `check`/`doctor`, nota de compresión, `export`/`import` host-neutral y filtro de rutas efímeras en `checkDiscovery` (0.28.0), extendido a `documentation/**` y `audit logs/**` (0.29.0); desde 0.30.1 importa el matcher de `discovery.exclude` desde `src/core/discovery-glob.js` |
| `src/core/tier-models.js` | `decisions.md`, `units/discovery-engine.md` | Dueño de tiers/cadenas, resolver, `declaredModelIds` y `freeTierOnPrimary` |
| `src/core/model-catalog.js`, `src/core/model-catalog.json` | `decisions.md`, `units/discovery-engine.md` | Helpers puros, extracción de IDs, integridad y snapshot |
| `src/core/discovery.js`, `src/core/repomix-tier.js` | `units/discovery-engine.md` | Topología, impacto, args y presupuesto de pack |
| `src/core/discovery-glob.js` | `units/discovery-engine.md` | Traducción glob→regex por tokens (`escapeRe`/`compileGlob`/`matchesGlob`) con caché `Map` por string exacto de glob (0.30.1) |
| `src/core/affected-set.js` | `units/discovery-engine.md` | Grafo de imports y clausura de dependientes |
| `src/core/test-selection.js` | `units/discovery-engine.md`, `decisions.md` | Plan determinístico de tests sobre el affected-set: universo `test/*.test.js`, manifiesto cerrado, gate `complete` fail-closed, read-only (0.32.0) |
| `src/core/specs-merge.js` | `decisions.md`, `units/cli-install.md` | Merge puro de delta specs: parseo, plan por título exacto, fail-closed y serialización; 0.22.1 endurece H1, `archive` y espaciado; 0.24.0 rechaza headings de sección de delta en la canónica para los cuatro tipos; 0.25.0 es la única vía de sync de delta del archive y del bulk-archive; desde 0.26.4 la suite declarada valida estructuralmente los deltas de changes activos con su parser |
| `src/core/adapters/frontmatter.js` | `units/cli-install.md` | Adaptación pura de frontmatter por host y `frontmatterValue` |
| `src/core/machine-env.js` | `units/cli-install.md`, `setup.md` | Detección de shell/EOL/tooling y exclusión local |
| `src/core/memory/**` | `units/memory-engine.md` | Motor, DB, tools, MCP, doctor, curaduría, snapshot; idempotencia de `recordNode` (0.23.0); renderer del working-context con `memory.criticalKeys` y política de fallo (0.31.0); serialización de escritores con `runImmediateTransaction`/`MEMORY_DB_BUSY` (0.33.0) y `doctor --rebuild` dentro del helper (0.33.1) |
| `scripts/**` | `decisions.md`, `units/discovery-engine.md`, `setup.md` | Descubrimiento dev-only del catálogo; no se publica. Desde 0.32.0 también `scripts/test-affected.mjs`, el consumidor de `npm run test:affected` que ejecuta la selección o cae a la suite completa |
| `agents/**` | `units/_map.md`, `units/cli-install.md` | 10 agentes instalables (superficie de producto) |
| `commands/**` | `units/_map.md` | 16 comandos `/cleto-*` |
| `skills/**` | `units/_map.md` | 21 skills del ciclo SDD/discovery/review |
| `templates/**` | `units/cli-install.md`, `decisions.md` | `AGENTS.md`/`PRODUCT.md` con bloques `LOCKED` |
| `profiles/**` | `units/cli-install.md`, `decisions.md` | Overlay del perfil `test` (agents/commands/templates) |
| `aspec/**` | `overview.md`, `decisions.md` | Config, specs canónicos (incl. `prompt-contracts`, `cli-diagnostics`, `agent-install-routing`, `project-portability`, `spec-sync`, `memory-ops`, `memory-engine`) y changes archivados de diagnóstico, portabilidad, conformidad, merge, orden del archive, idempotencia de memoria, aviso de bundle legacy y EOL de templates (`mcp-host-write-routing`, `mcp-oracle-residual-closure`, `host-neutral-bundle`, `fix-repair-mcp-noop`, `p0-pr5-archive-conformity`, `ch-06a-specs-merge-deterministic`, `specs-merge-hardening`, `archive-order-correctness`, `memory-record-idempotency`, `portability-legacy-bundle-advisory`, `template-legacy-eol-preservation`, `agent-model-minimo-migration`, `specs-merge-canonical-guard`, `archive-sync-via-specs-merge`, `cli-subcommand-help-guards`, `fix-discovery-seedmap-present`, `spec-seed-freshness-detector`, `align-freshness-recommended-action-spec`, `active-delta-structure-guard`, `seed-freshness-version-bump-not-material`, `seed-freshness-ephemeral-paths` y `seed-freshness-ignored-areas`, `discovery-exclude-glob-match`, `discovery-exclude-regexp-cache`, `discovery-state-schema-wording`, `pin-offline-discovery-state`, `mem-05-working-context-critical-set` (0.31.0), `ch-06b-affected-test-selection` (0.32.0) y `ch-04-memory-writer-serialization` (0.33.0); el fix 0.33.1 actualizó el requirement de doctor en `memory-engine` en el lugar) |
| `test/**` | `setup.md`, `units/_map.md` | Suite `node --test`; guards de modelos, integridad, discovery, contenido, `specs-merge.test.js`, `delta-spec-structure.test.js` (incluye la detección de `spec.md` mal ubicados desde 0.27.0) y `memory-engine.test.js`; `cli.test.js` pinea las rutas efímeras, el anclaje de `documentation`/`audit logs` y el estado legacy (0.28.0–0.29.0); `discovery-glob.test.js` cubre la equivalencia del matcher cacheado (0.30.1); desde 0.31.0 `working-context.test.js` y `cli.test.js` pinean el conjunto crítico y su política de fallo; desde 0.32.0 el manifiesto `test/affected-tests.json` y `test/test-selection.test.js` cubren la selección por affected-set; desde 0.33.0 `memory-writers.test.js` y el fixture `test/fixtures/memory-writer-child.mjs` cubren la serialización de escritores concurrentes y, desde 0.33.1, el rebuild de doctor bajo contención; desde 0.30.1 los 24 `*.test.js` quedan fuera de `sources` por `discovery.exclude` (`**/*.test.*`), no por el tier ni por el predicado de frescura |
| `.github/workflows/**` | `integrations.md` | Publicación npm y release GitHub |
| `eslint.config.js`, `package.json` | `setup.md`, `decisions.md` | Lint sobre `src/`, `test/`, `scripts/` y contrato de publicación |
| `docs/technical-discovery/**` | `index.md` | Este seed (excluido del hash de fuentes) |
| `docs/**` (resto) | `inventory.md` | Documentación del framework y guías |
| `documentation/**`, `audit logs/**` | `integrations.md`, `decisions.md` | Material legado lnx-cli y logs locales, gitignored y sin archivos versionados; efímeros para `discovery --check` desde 0.29.0 |
| `.ancletorc`, `.opencode/.ancleto-tier`, `opencode.json` | `setup.md`, `decisions.md` | Configuración y estado local por proyecto; `.ancletorc` → `memory.criticalKeys` es el seam del conjunto crítico del working-context (0.31.0) |
| `.ancleto/machine-env.md` | `setup.md` | Artefacto local derivado; `.ancleto` y `.ancleto/**` son rutas efímeras para `discovery --check` (0.28.0); `documentation/**` y `audit logs/**` también lo son desde 0.29.0 |
| `package.json`, `.gitattributes`, `.gitignore` | `setup.md`, `decisions.md` | Contrato de runtime, EOL y exclusiones |

## Áreas raíz observadas (`.discovery-map.json` al empacar)

`.github` (1), `.opencode` (66), `agents` (10), `aspec` (327), `audit logs` (9), `commands` (16),
`docs` (21), `documentation` (340), `profiles` (8), `scripts` (2), `skills` (35), `src` (22),
`templates` (2), `test` (33), más 15 archivos raíz. Total observado: **907 archivos**.

Notas de alcance: `audit logs/` y `documentation/` están gitignored y no son runtime.
`documentation/` tiene 366 archivos en disco, pero el mapa cuenta 340 tras excluir
`node_modules`/`.git`/`dist`/`build`/`coverage`; el estado del discovery registra 337 porque su
`config.exclude` omite 3 archivos bajo `__tests__/`. `skills/` tiene 21 directorios de skill que
suman 35 archivos; `test/` tiene 33 archivos: 24 `*.test.js` en la raíz (incluidos
`specs-merge.test.js`, `delta-spec-structure.test.js`, `test-selection.test.js` y
`memory-writers.test.js`), el manifiesto `affected-tests.json` y 8 fixtures bajo `test/fixtures/**`
(7 bajo `test/fixtures/memory/` y `memory-writer-child.mjs` en la raíz de `fixtures/`); el patrón
declarado es `test/*.test.js`. Desde 0.30.1 los `*.test.js` no entran en `sources`
porque `discovery.exclude` (`**/*.test.*`) aplica; los 8 fixtures siguen incluidos. El
tier `minimo` excluye además `test/**` del cuerpo del pack, por lo que la evidencia de esas áreas se
verificó por lectura directa. El pack de esta generación registra 873 fuentes, 166.779 B y ~41k
tokens, con 33 entradas de archivo en el cuerpo.

El `.discovery-map.json` observado en esta corrida reporta 907 archivos (aspec 327, `.opencode` 66,
src 22, test 33, scripts 2, documentation 340, audit logs 9). El estado `.discovery-state.json` lista
873 fuentes e incluye 674 entradas `documentation/` + 18 `audit logs/` entre `sources` y `fileHashes`;
desde 0.29.0 esas rutas no cuentan para la frescura, pero `docs/**` y `aspec/**` sí. Desde 0.30.1
las 24 rutas `test/*.test.js` ya no figuran en `sources`. Ver `unknowns.md`.
