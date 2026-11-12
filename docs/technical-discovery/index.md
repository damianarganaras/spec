---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-12T14:25:00Z
pluginVersion: 0.29.0
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto`, alias `aspec`). No es un
inventario: enruta a la respuesta más corta. Evidencia base: pack Repomix comprimido del tier
`minimo` (872 fuentes, ~39.384 tokens), `package.json` (`0.29.0`), `src/core/model-catalog.json` y
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
| **Frescura del seed (0.26.0–0.29.0)**: contrato de `discovery --check` (`schemaVersion:2`, read-only, `impact` `none|minor|material`, lista de archivos materiales, `areaOf`, formas exactas de `materialReasons`/`notes`, estado `READY/STALE/PARTIAL/MISSING`), `seedMapPresent` state-independent, `recommendedAction` (`generate` en `MISSING`, `complete` en `PARTIAL`, excepción a `impact:none` → `continue`) y, desde 0.27.0, el bump de `version` de primer nivel del `package.json` raíz no cuenta como cambio material ni de contenido y el estado persistido declara `ruleVersion: 2` + `semantic: { hash, fileHashes }`; desde 0.28.0, `.ancleto`, cualquier ruta bajo `.ancleto/` y el `.discovery-map.json` raíz son efímeras y un filtro simétrico de lectura en `checkDiscovery` las excluye de áreas y materialidad, conservando la forma del estado; desde 0.29.0, `documentation`/`documentation/**` y `audit logs`/`audit logs/**` anclados a la raíz también son efímeros (gitignored, 0 tracked; 674+18 entradas en el estado), mientras `docs/**` y `aspec/**` siguen contando y el writer, la forma del estado y `ruleVersion: 2` no cambian | `decisions.md`, `units/discovery-engine.md` |
| **Merge de specs (0.22.0–0.27.0)**: `ancleto specs merge --change <slug> [--dry-run] [--json]`, `src/core/specs-merge.js`, capability `spec-sync`; preámbulo H1 estructural, contenedor `archive` fail-closed, `ADDED` con una línea en blanco, atomicidad acotada al plan y, desde 0.24.0, heading de sección de delta en la canónica fail-closed para los cuatro tipos; desde 0.26.4 la suite declarada valida la estructura de los deltas de changes activos con `parseDeltaSpec` y, desde 0.27.0, un guard detecta un `spec.md` de change activo fuera de `specs/<capability>/spec.md` | `decisions.md`, `units/cli-install.md`, `units/_map.md` |
| **Orden del archive (0.22.1)**: merge/sync → preflight read-only → promoción de `## Decisiones` → move → commit; literales de fallo y superficies canónicas | `decisions.md`, `units/memory-engine.md`, `units/_map.md` |
| **Conformidad vs cambio funcional (0.21.0)**: predicado de cita resoluble + ausencia de bloques delta, `spec-required`, ruteo único | `decisions.md`, `overview.md`, `units/_map.md` |
| **Archive de conformidad sin delta (0.21.0)**: reporte "sin delta", cita fail-closed, garantía acotada, reuso del ledger cerrado | `decisions.md`, `units/cli-install.md` |
| **Modelos por tier**: `TIERS` agente→string, `TIER_CHAINS` (`minimo` con dos candidatos), resolver contra catálogo, `gratis` free-only, oráculo de `check` | `decisions.md`, `setup.md`, `units/cli-install.md` |
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
  `recordNode` es idempotente ante reescrituras idénticas, `import` avisa (sin bloquear) ante un
  bundle legacy sin `manifest.mcp` y `reconcileLegacyBlocks` preserva el EOL por línea. En 0.24.0 el
  tier `minimo` usa la cadena de dos candidatos `opencode-go/deepseek-v4.1-flash` →
  `opencode/deepseek-v4.1-flash-free`, y `specs merge` rechaza una canónica con heading de sección de
  delta para los cuatro tipos. En 0.25.0 el sync de delta al archivar pasa exclusivamente por
  `ancleto specs merge --change <slug>` (incluido bulk-archive) y `--help`/`-h` en los subcomandos que
  mutan estado imprime el uso y sale con 0 sin escribir nada.
- **Versión del repo**: `package.json` = `0.29.0` (rama `development`). `.ancletorc` y
  `.ancleto/machine-env.md` son artefactos gitignored que se regeneran en `init`/`install`/`upgrade`;
  esta materialización no los usa como fuente de reglas.
- **Cambios recientes archivados**:
  `aspec/changes/archive/2026-11-12-seed-freshness-ignored-areas/` (0.29.0: extiende el predicado
  de lectura `isEphemeralSource` para excluir `documentation`/`documentation/**` y
  `audit logs`/`audit logs/**` anclados a la raíz; ambas áreas son gitignored y 0 tracked, el estado
  las conserva (674+18 entradas) y el writer, la forma del estado y `ruleVersion: 2` no cambian;
  `docs/**` y `aspec/**` siguen contando; delta `MODIFIED` de `cli-diagnostics`),
  `aspec/changes/archive/2026-11-11-seed-freshness-ephemeral-paths/` (0.28.0: `.ancleto` y todo lo
  que está bajo `.ancleto/`, más el `.discovery-map.json` raíz, dejan de contar como cambio de
  frescura; un único predicado `isEphemeralSource` se aplica simétricamente a las vistas persistida y
  actual de `sources` y `isEphemeralOnlyChange` sólo excusa el desvío de hash si hay al menos una ruta
  cambiada y todas son efímeras; writer, forma del estado y `ruleVersion: 2` no cambian; delta
  `MODIFIED` de `cli-diagnostics`),
  `aspec/changes/archive/2026-11-11-seed-freshness-version-bump-not-material/` (0.27.0: el valor de
  `version` de primer nivel del `package.json` raíz deja de contar como cambio material ni de
  contenido; el estado persistido suma `ruleVersion: 2` + `semantic: { hash, fileHashes }` y los
  estados legacy se comparan crudos; delta `MODIFIED` de `cli-diagnostics`),
  `aspec/changes/archive/2026-11-11-active-delta-structure-guard/` (0.26.4: agrega a la suite
  declarada un guard estructural de los delta specs de changes activos que reutiliza `parseDeltaSpec`
  y documenta el Requirement en `spec-sync`; sin cambio de runtime),
  `aspec/changes/archive/2026-11-10-align-freshness-recommended-action-spec/` (0.26.x: alinea el
  Requirement de frescura de `cli-diagnostics` al `recommendedAction` real —`generate` en `MISSING`,
  `complete` en `PARTIAL`, excepción a `impact:none` → `continue`— y lo pinea en tests; sin cambio
  de runtime),
  `aspec/changes/archive/2026-11-10-spec-seed-freshness-detector/` (0.26.1: documenta y pinea el
  detector de frescura vigente de `discovery --check` como `ADDED` de `cli-diagnostics`, sin cambio
  de runtime),
  `aspec/changes/archive/2026-11-08-fix-discovery-seedmap-present/` (0.26.0: `seedMapPresent`
  independiente del estado, con `affectedDocs` todavía STALE-only),
  `aspec/changes/archive/2026-11-08-archive-sync-via-specs-merge/` (0.25.0: el sync de delta del
  archive y del bulk-archive rutea por `ancleto specs merge --change <slug>`; el guard canónico
  fail-closed aplica también al camino de archive),
  `aspec/changes/archive/2026-11-08-cli-subcommand-help-guards/` (0.25.0: guard central de
  `--help`/`-h` en subcomandos que mutan estado: uso en stdout, exit 0, cero escrituras),
  `aspec/changes/archive/2026-11-07-memory-record-idempotency/` (0.23.0: `recordNode` no-op ante
  reescritura idéntica de `memory_key`),
  `aspec/changes/archive/2026-11-07-portability-legacy-bundle-advisory/` (0.23.0: aviso no
  bloqueante de bundle sin `manifest.mcp`),
  `aspec/changes/archive/2026-11-07-template-legacy-eol-preservation/` (0.23.0:
  `reconcileLegacyBlocks` preserva EOL por línea y newline final),
  `aspec/changes/archive/2026-11-08-agent-model-minimo-migration/` (0.24.0: `TIERS.minimo` y
  `MINIMO_CHAIN` alineados a `opencode-go/deepseek-v4.1-flash`; cadena de dos candidatos),
  `aspec/changes/archive/2026-11-08-specs-merge-canonical-guard/` (0.24.0: fail-closed ante heading
  de sección de delta en la canónica; normalización de `copilot-support`, `legacy-import` y
  `test-profile` a `## Requirements`),
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
   Sin cambios en 0.19.0–0.25.0. `agents/` (10), `commands/` (16) y `skills/` (21 directorios, 35
   archivos) mantienen el conteo; en 0.22.1-0.29.0 no cambió su cantidad.
- **Pack actual**: 872 fuentes y ~39.384 tokens (comprimido, tier `minimo`), con 29 entradas de
   archivo en el cuerpo porque `test/**`, `docs/**` y `**/*.md` quedan excluidos. El
   `.discovery-map.json` de la corrida reporta 882 archivos (aspec 310, `.opencode` 66, docs 21,
   test 28, src 20, documentation 340, audit logs 9).
- **Estado del chequeo**: esta materialización actualizó los documentos desde el pack y las fuentes
   citadas para reflejar 0.29.0, preservando la estructura del seed. En 0.26.0 `discovery --check`
   pasó a calcular `seedMapPresent` antes de clasificar el estado (vale en
   `READY`/`STALE`/`PARTIAL`/`MISSING`); en 0.26.1 el detector de frescura quedó documentado y
   pineado en `cli-diagnostics`; en 0.26.4 la suite declarada sumó el guard estructural de los delta
   specs activos (`test/delta-spec-structure.test.js`). En 0.27.0 el valor de `version` de primer
   nivel del `package.json` raíz deja de contar como cambio material ni de contenido, el estado
   persistido declara `ruleVersion: 2` + `semantic: { hash, fileHashes }` (los estados sin
   `ruleVersion` se comparan crudos) y el guard anterior detecta además un `spec.md` de change activo
   fuera de `specs/<capability>/spec.md`. En 0.28.0 el mismo `checkDiscovery` aplica un filtro
   simétrico de rutas efímeras (`.ancleto`, `.ancleto/**` y `.discovery-map.json` raíz): no producen
   áreas ni materialidad y sólo excusan el desvío de hash cuando hay al menos una ruta cambiada y
   todas son efímeras; un estado legacy sin `fileHashes` sigue `STALE`/`minor`. En 0.29.0 el filtro
   se extiende a `documentation`/`documentation/**` y `audit logs`/`audit logs/**` anclados a la
   raíz: ambas áreas son gitignored y 0 tracked, el estado las conserva (674+18 entradas) y no
   producen áreas, materialidad ni excusa de hash; `docs/**` y `aspec/**` siguen contando, y el
   writer, la forma del estado y `ruleVersion: 2` no cambian. `affectedDocs` sigue
   poblándose sólo en `STALE`. El `ancleto discovery --check` de validación reportó
   `READY`/`impact: none` con `changedAreas: []`, `seedMapPresent: true` y `affectedDocs: []`; no se
   ejecutó un segundo pack.
