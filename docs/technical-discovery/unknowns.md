---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-13T02:37:23Z
pluginVersion: 0.31.0
skillVersion: '2.3'
---

# Límites de evidencia

## Sin verificar en esta generación

- **Pack comprimido**: el tier `minimo` produce un pack con compresión tree-sitter; los cuerpos de
  funciones se reemplazan por el delimitador `⋮----` y solo quedan firmas y comentarios de contrato.
  Las afirmaciones sobre flujos internos se apoyan en esos comentarios **y** en lectura directa de
  los archivos citados (`src/cli/index.js` → `HOST_MCP_TARGETS`, `resolveHostMcpDestination`,
  `readHostMcpIntent`, `importCmd`, `exportCmd`, `checkCommand`, `doctorCommand`,
  `mcpCommandBroken`, `findProjectMcpFile`, `readProjectMcp`, `repairProjectMcp`,
  `reconcileLegacyBlocks`, `specsMergeCommand`, `resolveChangeDir`, `specsCommand`,
  `isEphemeralSource`, `isEphemeralOnlyChange`,
  `src/core/memory/engine.js` → `recordNode`; `src/core/specs-merge.js`;
   `src/core/tier-models.js`), no en el pack solo. El estado del pack registra 863 fuentes
   (161.700 B, ~40k tokens) y su cuerpo contiene 31 entradas de archivo, porque `**/*.md`, `test/**`,
   `docs/**` y los ignores de Repomix excluyen el resto. Los cuerpos elididos y los Markdown
   excluidos se verificaron por lectura directa.
- **Contenido Markdown fuera del pack**: el tier `minimo` excluye `**/*.md` y Repomix aplica además
  su ignore por defecto de Markdown. `README.md`, `CHANGELOG.md`, `AGENTS.md`, `PRODUCT.md`,
  `agents/**`, `skills/**`, `aspec/specs/**` y `aspec/changes/**` no están en el pack. Las
  afirmaciones sobre las specs `project-portability`, `agent-install-routing`, `cli-diagnostics`,
  `prompt-contracts`, `spec-sync` y `memory-ops`, sobre los changes archivados
  `2026-11-05-host-neutral-bundle`, `2026-11-05-mcp-host-write-routing`,
  `2026-11-05-mcp-oracle-residual-closure`, `2026-11-06-p0-pr5-archive-conformity`,
  `2026-11-06-ch-06a-specs-merge-deterministic`, `2026-11-06-specs-merge-hardening`,
  `2026-11-06-archive-order-correctness`, `2026-11-08-fix-discovery-seedmap-present`,
  `2026-11-10-spec-seed-freshness-detector`, `2026-11-11-seed-freshness-version-bump-not-material`,
  `2026-11-11-seed-freshness-ephemeral-paths` y `2026-11-12-seed-freshness-ignored-areas`, y sobre
  los conteos de `agents/`/`commands/`/`skills/` se verificaron leyendo esos paths directamente. No
  se auditó el resto de `aspec/specs/**`.
- **Contrato de conformidad 0.21.0**: se describió desde `aspec/specs/prompt-contracts/spec.md`
  (los dos Requirements nuevos), `CHANGELOG.md`, el `proposal.md`/`tasks.md` del archive y las cuatro
  decisiones promovidas leídas de `.ancleto/memory.db` vía `searchMemory`. No se leyó línea por línea
  cada skill/agent tocado, ni se ejecutaron los content guards (`test/content-guards.test.js`); la
  aceptación del archive es textual porque no existe un subcomando CLI `archive`. La relevancia
  semántica de la cita no es verificable mecánicamente (es juicio de review).
- **`eslint.config.js` en el pack**: aparece vacío por efecto de la compresión. Su contenido se
  verificó leyendo el archivo directamente.
- **Ejecución de la suite**: la validación de esta generación corrió `node --test test/cli.test.js`
  (497 tests: 495 pass, 2 skip), `npm test` (`node --test "test/*.test.js"`, 1274 tests: 1269 pass,
  5 skip) y `npm run lint`, todos con resultado exitoso; `format` no está configurado y `typecheck`
  no aplica. Los guards (`test/model-catalog.test.js`, `test/model-catalog-discovery.test.js`,
  `test/agent-model-coherence.test.js`, `test/content-guards.test.js`, `test/cli.test.js`,
  `test/specs-merge.test.js`) quedan cubiertos por esa corrida.
- **Diagnósticos 0.18.15/0.19.0**: no se ejecutaron `ancleto check` ni `ancleto doctor` para observar
  los avisos nuevos. El comportamiento se describió desde `checkCommand`, `checkTierOrphan`,
  `doctorCommand` y las specs canónicas. No se probaron los escenarios de tier dormido
  (`cursor`/`roo`), deriva de versión (pre-release/build metadata), proyecto multi-host con
  destinos MCP válidos/ausentes ni config de proyecto inválida con global válida.
- **Salud MCP 0.18.16/0.19.0**: no se ejecutaron `ancleto check` ni `ancleto import` para observar los
  avisos. El predicado, `findProjectMcpFile`/`readProjectMcp`, el descriptor `HOST_MCP_TARGETS`, la
  derivación `installedHostsFromPaths`, los mensajes y la precedencia de `doctor` se leyeron
  directamente en `src/cli/index.js` y en los requirements de las specs. No se probaron rutas
  Windows existentes/ausentes, config no parseable, `mcp` no-objeto, `caveman` roto ni la no
  regresión de `import --repair` con ejecución real.
- **Bundle host-neutral 0.20.0**: no se ejecutó un `export`/`import` real. El comportamiento se leyó
  en `readHostMcpIntent`, `exportCmd` e `importCmd` y en el change archivado
  `2026-11-05-host-neutral-bundle`. No se probaron bundles de `copilot`, `antigravity` o
  `commandcode`, ni el aviso de destino no parseable, ni la ausencia de `.opencode` en hosts
  no-opencode.
- **Reparación MCP sin escritura 0.20.1**: no se ejecutó `import --repair` para observar bytes y
  mtime intactos. El predicado `error || normalized || fixed.length > 0`, la normalización
  estructural y la no-creación de un destino vacío se leyeron en `repairProjectMcp` y en el change
  archivado `2026-11-06-fix-repair-mcp-noop`. No se probaron archivos con raíz no-objeto, valor de
  esquema no-objeto ni `.jsonc` con comentarios.
- **Merge de specs 0.22.0–0.24.0**: no se ejecutó `ancleto specs merge` ni `--dry-run`/`--json`.
  El comportamiento se describió desde `src/core/specs-merge.js` (parser de canónico y delta,
  `blockKey`, `detectEol`, preámbulo H1 estructural, `applyAdd`/`applyModified`/`applyRemoved`/
  `applyRenamed`, `mergeSpecText`), desde `specsMergeCommand`/`resolveChangeDir`/
  `collectDeltaCapabilities` en `src/cli/index.js` (incluida la identidad de path del contenedor
  `archive`) y desde `aspec/specs/spec-sync/spec.md` (cinco Requirements). No se observaron en
  ejecución: contenedor `archive` con exit 2, H1 estructural, una sola línea en blanco tras
  `ADDED`, `RENAMED` vacío, idempotencia byte a byte, `mtime` intacto en no-op/dry-run, salida JSON
  exacta ni los exit codes 0/1/2. `test/specs-merge.test.js` existe pero el pack excluye `test/**`
  y no se corrió la suite. **Guard canónico 0.24.0**: el fail-closed por heading de delta en la
  canónica se describió desde `findDeltaSectionHeadings` y `mergeSpecText`; no se ejecutó el
  `--dry-run` ni se verificó en corrida el `mtime` intacto, la salida `--json` ni la normalización de
  las tres canónicas (se confirmó por lectura del heading `## Requirements`).
- **Tier `minimo` 0.24.0**: no se ejecutó `install`/`init`/`import --tier minimo`. La cadena de dos
  candidatos, la igualdad `TIERS.minimo[n] === agents/<n>.md === TIER_CHAINS.minimo[n][0]` y el
  error por catálogo sin candidatos se leyeron en `src/core/tier-models.js` y en el delta archivado;
  no se observó la salida de `check` sobre los diez agentes.
- **Ayuda sin ejecución 0.25.0**: no se ejecutó `ancleto <subcomando> --help` para observar stdout,
  exit code ni la no-escritura. El guard se describió desde `SUBCOMMAND_HELP`, `wantsHelp` y el
  dispatch de `src/cli/index.js`, y desde el requirement de `aspec/specs/cli-diagnostics/spec.md`.
  No se verificaron las formas `-h`, `memory <subcomando> --help`, `projects <subcomando> --help`
  ni la exclusión explícita de `specs check --help` en una corrida real.
- **Sync del archive por `specs merge` 0.25.0**: no se archivó ni se hizo bulk-archive de un change
  real. El ruteo se leyó en `skills/ancleto-archive/SKILL.md`,
  `skills/ancleto-bulk-archive/SKILL.md`, `agents/documenter.md` y el requirement de
  `aspec/specs/prompt-contracts/spec.md`; no se observó el abort del archive ante exit 2 ni el
  bloqueo cuando el CLI no está disponible.
- **Detector de frescura 0.26.1**: se ejecutó `ancleto discovery --check` una vez sobre este
  checkout (observado: `STALE`/`minor`, `changedAreas: [".ancleto"]`, `seedMapPresent: true`,
  `affectedDocs: []`) y se leyó el Requirement canónico y el delta archivado; **no** se ejecutaron
  los nueve scenarios del contrato (archivo material nuevo/modificado/eliminado, área raíz
  nueva/eliminada, ignores/outputDir, sin estado, sin `fileHashes` y snapshot de read-only con
  bytes/mtime), que quedan cubiertos por los tests de pin. No se corrió la suite.
- **Consolidación de tests 0.26.2**: no se ejecutó `test/cli.test.js` ni la suite completa; el
  alcance (walkers de snapshot read-only y pines de frescura) se leyó en `CHANGELOG.md`. No cambia
  runtime ni comportamiento observable.
- **Alineación 0.26.4**: no se ejecutó la suite. El alcance (guard estructural de los delta specs
  activos y Requirement `ADDED` en `spec-sync`) se verificó leyendo `CHANGELOG.md`, el change
  archivado, `aspec/specs/spec-sync/spec.md` y `src/core/specs-merge.js` → `parseDeltaSpec`; no se
  probó el barrido live ni la mutación de fixtures del test nuevo.
- **Normalización de frescura 0.27.0**: se leyó `src/cli/index.js` (`normalizeRootPackageJson`,
  `hashSources`, `packDiscovery`, `checkDiscovery`), el Requirement canónico de `cli-diagnostics` y
  `test/delta-spec-structure.test.js`; no se ejecutaron los scenarios del bump de versión, la forma
  inválida de `semantic`, el estado legacy ni la inmutabilidad de `--check`, que quedan cubiertos
  por `test/cli.test.js`.
- **Rutas efímeras 0.28.0**: se leyó `src/cli/index.js` (`isEphemeralSource`,
  `isEphemeralOnlyChange`, `computeImpact`, `checkDiscovery`), el delta archivado de
  `seed-freshness-ephemeral-paths` y el Requirement de `aspec/specs/cli-diagnostics/spec.md`; no se
  ejecutaron los scenarios de churn efímero, anclaje de `.ancletorc`/`.ancleto-notes.md`/
  `src/ancleto/x.js`, estado legacy sin `fileHashes` ni inmutabilidad de bytes/mtime, que quedan
  cubiertos por `test/cli.test.js`. El pack comprimido elide los cuerpos, así que la semántica se
  confirmó por los comentarios del pack y la lectura directa de esos paths.
- **Áreas ignoradas 0.29.0**: se leyó `src/cli/index.js` (`isEphemeralSource` extendido a
  `documentation` y `audit logs`, `isEphemeralOnlyChange`, `checkDiscovery`), el delta archivado de
  `seed-freshness-ignored-areas`, el Requirement de `aspec/specs/cli-diagnostics/spec.md` y el
  cambio de tests de `test/cli.test.js`; los scenarios de churn y ausencia total de
  `documentation/`/`audit logs/`, el anclaje de lookalikes (`docs/documentation/x.md`,
  `documentation-extra/x.md`, `src/documentation/x.js`), el pin de que `docs/**`/`aspec/**` siguen
  contando y la no-reescritura del estado están pineados en `test/cli.test.js`, y la suite y el
  lint pasaron; `format` no está configurado y `typecheck` no aplica.
- **Exclusiones por segmentos y caché 0.30.0–0.30.1**: se leyó `src/core/discovery-glob.js`
  (`escapeRe`, `compileGlob`, `matchesGlob`), `src/cli/index.js` (`isIgnored`, `computeSources`, el
  import del matcher), el Requirement «Semántica por segmentos de los patrones de exclusión del
  discovery» de `aspec/specs/cli-diagnostics/spec.md`, los changes archivados
  `discovery-exclude-glob-match` y `discovery-exclude-regexp-cache`, y `CHANGELOG.md`. El benchmark
  de 15,04 ms → 1,63 ms (9,2×) sobre 9.669 evaluaciones proviene del proposal del change; no se
  re-ejecutó el microbenchmark en esta generación. La baja de rutas `test/*.test.js` (21 en 0.30.0,
  22 en 0.30.1) se observó comparando el estado actual contra `HEAD`. No se ejecutaron los
  scenarios de `?`, anclaje `p` vs. `p-<sufijo>` ni `/**`, que quedan pineados en
  `test/discovery-glob.test.js` y la suite. El pack comprimido elide los cuerpos, así que la
  semántica se confirmó por los comentarios del pack y la lectura directa.
- **Orden del archive 0.22.1**: no se archivó un change real. La secuencia merge/sync → preflight →
  promoción → move → commit y los literales de fallo se verificaron leyendo
  `agents/orchestrator.md`, `agents/documenter.md`, `skills/ancleto-archive/SKILL.md`,
  `skills/ancleto-bulk-archive/SKILL.md`, `skills/ancleto-onboard/SKILL.md` y el requirement de
  `aspec/specs/memory-ops/spec.md`. No se ejecutó `test/content-guards.test.js` ni se probó una
  mutación que invierta el orden, ni un fallo de promoción o de move.
- **Refresco del catálogo**: no se ejecutó `scripts/refresh-model-catalog.mjs`. El snapshot se tomó
  como fuente de verdad declarada (`generated_at: 2026-11-04`, 5 proveedores / 211 IDs), sin
  revalidar contra proveedores.
- **Gate de `--write`**: se describió desde `scripts/refresh-model-catalog.mjs` y las specs
  `agent-model-tiers`; no se ejecutó una corrida real con IDs faltantes.
- **Disponibilidad real de modelos**: no se comprobó por red que cada uno de los 211 IDs del
  snapshot exista hoy en cada proveedor. La resolución de `minimo` depende de ese snapshot.
- **Avisos free-on-primary**: se describieron desde el código y la spec; no se ejecutó
  `install --tier gratis` ni un `check` real sobre un agente `mode: primary` con modelo free.
- **Nota de compresión**: no se ejecutó `install`, `init`, `import` ni `upgrade` para observar la
  materialización/saneamiento de `CAVEMAN_USAGE_NOTE`. El comportamiento se describió desde
  `resolvesHostCompression`, sus tres call sites y el delta archivado. No se probaron los escenarios
  de `--repair`, antigravity con/sin `.agents/mcp_config.json` ni la excepción M2 con JSON inválido.
- **Validación de `manifest.mcp`**: se describió desde `importCmd` (comprobación de array y de
  `name` string antes del primer write). No se importó un bundle real con `manifest.mcp` malformado.
- **`import` de bundles**: no se ejecutó un `export`+`import` real; el comportamiento de
  `installedPaths` y la copia condicionada al host se leyeron en `importCmd` y en el change
  archivado `2026-11-05-host-neutral-bundle` (incluye la advertencia de que el `check` posterior
  deja de ser vacuo).
- **`opencode` local**: no se verificó que el binario esté disponible ni su versión; afecta
  `stats`/`stats failures` y el refresco manual del catálogo.
- **Repomix**: no se validó la versión exacta ejecutada por el fallback `npx -y repomix@1.18.0`.
- **Hosts IDE**: no se probó la instalación en cada host (claude, vscode, antigravity, cursor, roo,
  copilot, commandcode). El layout y los adaptadores se infieren de `AGENT_TARGETS` y
  `adaptFrontmatter`. Tampoco se verificó el consumo runtime de `copilot-mcp.json` por Copilot ni
  la colisión de `.mcp.json` entre `commandcode` y `claude`; ambos están declarados como límites.
- **Memoria real**: no se abrió `.ancleto/memory.db` para inspeccionar nodos; el comportamiento se
  describe desde el código (`src/core/memory/*`).
- **CI**: no se ejecutó el workflow; su comportamiento se lee de `.github/workflows/publish.yml`.

## Discrepancias y observaciones

- **`.discovery-map.json` observado**: el generador reporta **895 archivos** (aspec 321,
  `.opencode` 66, docs 21, test 29, src 21, documentation 340, audit logs 9, etc.). El pack registra
  **863 fuentes** (161.700 B, ~40k tokens) y 31 entradas de archivo porque los globs de `discovery.exclude`
  omiten tests, lockfiles, imágenes y `public`; además Repomix filtra por sus propios ignores.
  Desde 0.30.0 `**/*.test.*`/`**/*.spec.*` vuelven a aplicar; desde 0.30.1 las 22 rutas
  `test/*.test.js` dejan de figurar en `sources`; los 7 fixtures bajo `test/fixtures/memory/`
  siguen incluidos.
  `.ancleto/**` y `.discovery-map.json` raíz siguen en `sources`/`fileHashes` del estado, pero desde
  0.28.0 no cuentan para la frescura. Desde 0.29.0 tampoco cuentan `documentation/**` ni
  `audit logs/**`: el estado conserva 674 entradas `documentation/` + 18 `audit logs/` entre
  `sources` y `fileHashes`, mientras `docs/**` y `aspec/**` siguen contando.
- **`documentation/`**: el mapa cuenta **340** archivos tras excluir `node_modules`/`.git`/`dist`/
  `build`/`coverage`; en disco hay 366, incluidos esos directorios ignorados. El estado del
  discovery registra **337** porque su `config.exclude` omite 3 archivos bajo `__tests__/`. No es
  una inconsistencia del seed.
- **Artefactos de máquina**: `.ancletorc` y `.ancleto/machine-env.md` son artefactos derivados
  gitignored; deben alinearse con `package.json` (`0.31.0`). No se usan como fuente de contenido;
  `memory.criticalKeys` se describe como seam de configuración, no como evidencia de la DB.
- **`.ancletorc` no se usa como evidencia de producto**: la skill consume el `config` resuelto por
  `ancleto discovery --check` y no trata el manifiesto como contenido del seed. La observación de la
  versión local es una verificación puntual, no una fuente de reglas. El propio `check` compara ese
  campo con la versión del CLI y avisa si difieren.
- **Publicación de `scripts/`**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`; no incluye `scripts/`. El refresco del catálogo y el gate de IDs
  existen en el repo fuente pero no viajan en el tarball npm. Se documenta como deuda, no como fallo.
- **`rg` no disponible** en este entorno (PowerShell 5.1): la evidencia se obtuvo con
  `Select-String` y lecturas directas.
- **Estado inicial del chequeo**: el pack y `.discovery-state.json` se regeneraron antes de esta
  materialización y el `discovery --check` inicial devolvió `READY`/`impact: none`, aunque los
  documentos del seed todavía declaraban la versión 0.23.0 en el frontmatter (el oráculo no compara
  la versión del frontmatter). Para reflejar 0.24.0 se actualizaron `decisions.md`, `index.md`,
  `integrations.md`, `inventory.md`, `overview.md`, `setup.md`, `units/_map.md`,
  `units/cli-install.md`, `units/discovery-engine.md`, `units/memory-engine.md` y `unknowns.md` desde
  el pack y las fuentes citadas. El estado final lo reporta el `discovery --check` posterior. El seed
  anterior describía 0.23.0.
- **Estado inicial del chequeo (0.26.0)**: el pack y `.discovery-state.json` se regeneraron antes de
  esta materialización y el `discovery --check` inicial devolvió `READY`/`impact: none` con los
  documentos todavía en 0.25.0 (el oráculo no compara la versión del frontmatter). Para reflejar
  0.26.0 se actualizaron los once documentos del seed desde el pack y las fuentes citadas; el estado
  final lo reporta el `discovery --check` posterior. El único cambio funcional de 0.26.0 es el
  contrato de `seedMapPresent`/`readSeedMap`, documentado en `units/discovery-engine.md` y
  `decisions.md`.
- **Estado inicial del chequeo (0.26.1)**: el pack y `.discovery-state.json` se regeneraron antes
  de esta materialización y el `discovery --check` de validación devolvió `STALE`/`impact: minor`
  con `changedAreas: [".ancleto"]`, `materialReasons: []`, `seedMapPresent: true` y
  `affectedDocs: []`, mientras los documentos todavía declaraban 0.26.0. Para reflejar 0.26.1 se
  actualizaron los once documentos del seed desde el pack y las fuentes citadas; 0.26.1 es un
  release documental/test: no cambia `src/` ni integraciones.
- **Estado inicial del chequeo (0.26.2)**: el pack y `.discovery-state.json` se regeneraron antes
  de esta materialización; el `discovery --check` de validación devolvió `READY`/`impact: none`,
  `seedMapPresent: true` y `affectedDocs: []`, mientras los documentos todavía declaraban 0.26.1.
  Para reflejar 0.26.2 se actualizaron los once documentos del seed desde el pack y las fuentes
  citadas; 0.26.2 es un release exclusivamente de tests, sin cambio de runtime.
- **Estado inicial del chequeo (0.26.4)**: el pack y `.discovery-state.json` se regeneraron antes
  de esta materialización; el `discovery --check` inicial devolvió `READY`/`impact: none`,
  `seedMapPresent: true` y `affectedDocs: []`, mientras los documentos todavía declaraban la versión
  previa. Para reflejar 0.26.4 se actualizaron los once documentos del seed desde el pack y las
  fuentes citadas; 0.26.4 agrega a la suite declarada el guard estructural de los deltas activos y
  documenta el Requirement en `spec-sync`, sin cambio de runtime.
- **Estado inicial del chequeo (0.27.0)**: el pack y `.discovery-state.json` se regeneraron antes
  de esta materialización; el `discovery --check` inicial devolvió `READY`/`impact: none`,
  `seedMapPresent: true` y `affectedDocs: []`, mientras los documentos todavía declaraban 0.26.4
  (el oráculo no compara la versión del frontmatter). Para reflejar 0.27.0 se actualizaron los once
  documentos del seed desde el pack y las fuentes citadas. El comportamiento nuevo se verificó
  leyendo `src/cli/index.js` (`normalizeRootPackageJson`, `hashSources`, `packDiscovery`,
  `checkDiscovery`), `aspec/specs/cli-diagnostics/spec.md` y
  `test/delta-spec-structure.test.js`; no se ejecutó la suite ni se mutaron hashes reales.
- **Estado inicial del chequeo (0.28.0)**: el pack y `.discovery-state.json` se regeneraron antes
  de esta materialización; el `discovery --check` inicial devolvió `READY`/`impact: none`,
  `seedMapPresent: true` y `affectedDocs: []`, mientras los documentos todavía declaraban 0.27.0
  (el oráculo no compara la versión del frontmatter). Para reflejar 0.28.0 se actualizaron los once
  documentos del seed desde el pack y las fuentes citadas. El comportamiento nuevo se verificó
  leyendo `src/cli/index.js` (`isEphemeralSource`, `isEphemeralOnlyChange`, `computeImpact`,
  `checkDiscovery`), el delta archivado de `seed-freshness-ephemeral-paths` y
  `aspec/specs/cli-diagnostics/spec.md`; no se ejecutó la suite ni se mutaron hashes reales.
- **Estado inicial del chequeo (0.29.0)**: el pack y `.discovery-state.json` se regeneraron antes
  de esta materialización; el `discovery --check` inicial devolvió `READY`/`impact: none`,
  `seedMapPresent: true` y `affectedDocs: []`, mientras los documentos todavía declaraban 0.28.0
  (el oráculo no compara la versión del frontmatter). Para reflejar 0.29.0 se actualizaron los once
  documentos del seed desde el pack y las fuentes citadas. El comportamiento nuevo se verificó
  leyendo `src/cli/index.js` (`isEphemeralSource` extendido, `isEphemeralOnlyChange`,
  `checkDiscovery`), el delta archivado de `seed-freshness-ignored-areas` y
  `aspec/specs/cli-diagnostics/spec.md`; la suite y el lint pasaron (ver `Áreas ignoradas 0.29.0`)
  y no se mutaron hashes reales.
- **Estado inicial del chequeo (0.30.0)**: el pack y `.discovery-state.json` se regeneraron antes
  de esta materialización; el `discovery --check` inicial devolvió `READY`/`impact: none`,
  `seedMapPresent: true` y `affectedDocs: []`, mientras los documentos todavía declaraban 0.29.0
  (el oráculo no compara la versión del frontmatter). Para reflejar 0.30.0 se actualizaron los once
  documentos del seed desde el pack y las fuentes citadas. El comportamiento nuevo se verificó
  leyendo `src/cli/index.js` (`escapeRe`, `matchesGlob` —entonces allí—, `computeSources`), el Requirement de
  `aspec/specs/cli-diagnostics/spec.md`, el delta archivado de `discovery-exclude-glob-match` y
  `CHANGELOG.md`; no se ejecutó la suite ni se mutaron hashes reales.
- **Estado inicial del chequeo (0.30.1)**: el pack y `.discovery-state.json` se regeneraron antes
  de esta materialización; el `discovery --check` inicial devolvió `READY`/`impact: none`,
  `seedMapPresent: true` y `affectedDocs: []`, mientras los documentos todavía declaraban 0.30.0
  (el oráculo no compara la versión del frontmatter). Para reflejar 0.30.1 se actualizaron los once
  documentos del seed desde el pack y las fuentes citadas. El comportamiento nuevo se verificó
  leyendo `src/core/discovery-glob.js`, el import en `src/cli/index.js` y el proposal del change
  `discovery-exclude-regexp-cache`; no se re-ejecutó el microbenchmark ni se mutaron hashes reales.
- **Estado inicial del chequeo (0.30.2)**: el `discovery --check` previo devolvió `STALE`/`minor`
  con `changedAreas: ["CHANGELOG.md", "aspec"]` (el backlog sin commit) y `seedMapPresent: true`;
  esta materialización regeneró el pack (860 fuentes, ~39.536 tokens) y actualizó los once
  documentos. El patch 0.30.2 se verificó leyendo `CHANGELOG.md`, el proposal archivado de
  `discovery-state-schema-wording` y el de conformidad `pin-offline-discovery-state`, más
  `src/core/discovery-state.js`; no se ejecutó la suite ni se mutaron hashes reales. El estado
  persistido conserva `version: 1` + `ruleVersion: 2`.
- **Estado inicial del chequeo (0.31.0)**: el `discovery --check` previo devolvió
  `READY`/`impact: none`, `seedMapPresent: true` y `affectedDocs: []`, aunque los documentos
  declaraban 0.30.2 (el oráculo no compara la versión del frontmatter y el bump de `version` no es
  material). Esta materialización consumió el pack único de 863 fuentes, 161.700 B (~40k tokens), y
  actualizó los once documentos. La evidencia de 0.31.0 se verificó leyendo
  `aspec/specs/memory-engine/spec.md` (Requirement `Conjunto crítico estable del working-context`,
  línea ~1261, y el orden determinístico con 7 escenarios), el proposal/tasks/delta archivados de
  `mem-05-working-context-critical-set`, `aspec/backlog.md`, `src/core/memory/working-context.js`,
  el tramo de `src/cli/index.js` de `memoryContext`/`refreshWorkingContext` y el `CHANGELOG.md`.
  `.ancletorc` (gitignored) se leyó sólo para describir el seam de configuración. No se ejecutaron
  tests ni se abrió `.ancleto/memory.db`; no se mutaron hashes reales.
- **Límite de evidencia del pack 0.31.0**: el tier `minimo` excluye `test/**`, `docs/**` y
  `**/*.md`, por lo que la spec canónica, el backlog y los artifacts archivados se verificaron por
  lectura directa de los paths citados; el cuerpo del pack cubre `src/`, scripts, agentes y
  configuración versionada.

## Confianza

- **Alta (observado)**: estructura de `src/`, `package.json` `0.31.0`, `packageVersion`,
  `checkTierOrphan` con `localAgentDirs`, deriva de `.ancletorc.version`, `doctorCommand` con
  precedencia host activo→hosts instalados→global, `HOST_MCP_TARGETS`/`HOST_MCP_ORDER`,
  `resolveHostMcpDestination`/`resolveExistingHostMcpDestinations`, `readHostMcpIntent`,
  `repairProjectMcp` con predicado de escritura, `mcpCommandBroken` por existencia,
  `readProjectMcp` con `error`, avisos MCP host-aware de
  `checkCommand` y aviso de `repairProjectMcp`, `resolvesHostCompression`/`hostConfigHasCompression`
  y su uso en `install`/`init`/`import`, copia host-scoped de `.opencode/*` en `importCmd`,
  validación de `manifest.mcp` y aviso de bundle legacy sin `mcp` (0.23.0), `reconcileLegacyBlocks`
  con EOL por línea y newline final (0.23.0), `recordNode` idempotente ante reescritura idéntica
  (0.23.0), `TIERS`/`TIER_CHAINS` con la cadena `minimo` de dos candidatos y la igualdad con la
  canónica (0.24.0), `freeTierOnPrimary` y sus dos avisos,
  `findDeltaSectionHeadings` y el guard canónica-only de `mergeSpecText` (0.24.0), el guard central
  `SUBCOMMAND_HELP`/`wantsHelp` (0.25.0) y el ruteo del sync del archive por `specs merge` (0.25.0),
  el cálculo state-independent de `seedMapPresent` y el rechazo de `docs` no-objeto-plano en
  `readSeedMap` (0.26.0), el contrato del detector de frescura y su lista cerrada de archivos
  materiales (0.26.1, `aspec/specs/cli-diagnostics/spec.md`), la excepción de `recommendedAction`
  (`generate` en `MISSING`, `complete` en `PARTIAL`) documentada y pineada (0.26.x), `declaredModelIds`,
  `modelIdsFromCatalog`, `missingModelIdsInCatalog`,
  gate de `--write`,
  `looksBinaryMissing`, lint sobre `scripts/`, snapshot de 5 proveedores / 211 IDs, flujo de
  `scripts/refresh-model-catalog.mjs`, `installedPaths` como unión, comandos del CLI, firmas de
  módulos de memoria, workflow, los dos Requirements de conformidad de `prompt-contracts`
  (predicado, archive no-op acotado, ruteo y cuatro decisiones promovidas), y el contrato de
  `spec-sync` con `parseCanonicalSpec`/`parseDeltaSpec`/`mergeSpecText` y `specsMergeCommand`; desde
  0.26.4 el guard estructural de los deltas activos en `test/delta-spec-structure.test.js` y desde
  0.27.0 su detección de `spec.md` mal ubicados bajo changes activos; el filtro de rutas efímeras
  `isEphemeralSource`/`isEphemeralOnlyChange` y su aplicación simétrica en `checkDiscovery`
  (0.28.0), extendido en 0.29.0 a `documentation/**` y `audit logs/**` anclados a la raíz; el
  matcher de `discovery.exclude` corregido en 0.30.0 y extraído a `src/core/discovery-glob.js` con
  caché `Map` por glob exacto en 0.30.1, con `sources` 872→854 en 0.30.0, 857/22 tests en 0.30.1 y
  863 fuentes en 0.31.0; `readCriticalMemoryKeys` con lectura tolerante y la política de fallo por
  superficie (CLI explícita, lifecycle, on-write/MCP, `merge`/`consolidate --apply`);
  los comentarios de `specs-merge.js` sobre H1 estructural y la identidad de path del contenedor
  `archive`; y la secuencia de archive y los literales de fallo en `agents/orchestrator.md`,
  `agents/documenter.md`, `skills/ancleto-archive`, `skills/ancleto-bulk-archive`,
  `skills/ancleto-onboard` y `aspec/specs/memory-ops/spec.md`.
- **Media (inferido)**: comportamiento de hosts no probados, efecto exacto de cada adaptador en
  cada IDE, resultados del workflow, ausencia real del 403 en configuraciones
  concretas, materialización/saneamiento de la nota de compresión sin ejecución real, no-escritura
  de `repairProjectMcp` sobre bytes/mtime sin ejecución real, salida exacta
  de `check`/`doctor` en los escenarios multi-host y salida exacta de `export`/`import` host-neutral
  sin ejecución; idempotencia, atomicidad, exit codes y salida `--json` del merge de specs sin
  ejecución; cumplimiento real de la secuencia merge → preflight → promoción → move y de los
  literales de fallo en cada superficie de archive sin una corrida real; alineación literal de cada
  skill/agent con la norma de conformidad y con el orden del archive (se leyó el contrato y el
  proposal, no el diff completo de cada archivo).
- **Baja / desconocida**: estado real de la memoria del repo, disponibilidad de modelos en
  proveedores al momento de leer, contenido de `audit logs/` y `documentation/` (gitignored, 0
  tracked y efímeros para la frescura desde 0.29.0), consumo runtime de `copilot-mcp.json`, colisión
  `.mcp.json` entre `commandcode` y `claude`, y comportamiento de la salud MCP frente a comandos
  que dependen de un `PATH` concreto, que el predicado no resuelve.
