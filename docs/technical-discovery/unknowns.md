---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-06T20:07:32Z
pluginVersion: 0.22.2
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
  `specsMergeCommand`, `resolveChangeDir`, `specsCommand`; `src/core/specs-merge.js`;
  `src/core/tier-models.js`), no en el pack solo. El estado del pack registra 824 fuentes
  (~38.087 tokens) y su cuerpo contiene 29 entradas de archivo, porque `**/*.md`, `test/**`,
  `docs/**` y los ignores de Repomix excluyen el resto. Los cuerpos elididos y los Markdown
  excluidos se verificaron por lectura directa.
- **Contenido Markdown fuera del pack**: el tier `minimo` excluye `**/*.md` y Repomix aplica además
  su ignore por defecto de Markdown. `README.md`, `CHANGELOG.md`, `AGENTS.md`, `PRODUCT.md`,
  `agents/**`, `skills/**`, `aspec/specs/**` y `aspec/changes/**` no están en el pack. Las
  afirmaciones sobre las specs `project-portability`, `agent-install-routing`, `cli-diagnostics`,
  `prompt-contracts`, `spec-sync` y `memory-ops`, sobre los changes archivados
  `2026-11-05-host-neutral-bundle`, `2026-11-05-mcp-host-write-routing`,
  `2026-11-05-mcp-oracle-residual-closure`, `2026-11-06-p0-pr5-archive-conformity`,
  `2026-11-06-ch-06a-specs-merge-deterministic`, `2026-11-06-specs-merge-hardening` y
  `2026-11-06-archive-order-correctness`, y sobre los conteos de
  `agents/`/`commands/`/`skills/` se verificaron leyendo esos paths directamente. No se auditó el
  resto de `aspec/specs/**`.
- **Contrato de conformidad 0.21.0**: se describió desde `aspec/specs/prompt-contracts/spec.md`
  (los dos Requirements nuevos), `CHANGELOG.md`, el `proposal.md`/`tasks.md` del archive y las cuatro
  decisiones promovidas leídas de `.ancleto/memory.db` vía `searchMemory`. No se leyó línea por línea
  cada skill/agent tocado, ni se ejecutaron los content guards (`test/content-guards.test.js`); la
  aceptación del archive es textual porque no existe un subcomando CLI `archive`. La relevancia
  semántica de la cita no es verificable mecánicamente (es juicio de review).
- **`eslint.config.js` en el pack**: aparece vacío por efecto de la compresión. Su contenido se
  verificó leyendo el archivo directamente.
- **Ejecución de la suite**: no se corrió `npm test` ni `npm run lint` durante la generación. Los
  guards (`test/model-catalog.test.js`, `test/model-catalog-discovery.test.js`,
  `test/agent-model-coherence.test.js`, `test/content-guards.test.js`, `test/cli.test.js`,
  `test/specs-merge.test.js`) se citan por su presencia y propósito declarado, no por un resultado
  observado.
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
- **Merge de specs 0.22.0–0.22.1**: no se ejecutó `ancleto specs merge` ni `--dry-run`/`--json`.
  El comportamiento se describió desde `src/core/specs-merge.js` (parser de canónico y delta,
  `blockKey`, `detectEol`, preámbulo H1 estructural, `applyAdd`/`applyModified`/`applyRemoved`/
  `applyRenamed`, `mergeSpecText`), desde `specsMergeCommand`/`resolveChangeDir`/
  `collectDeltaCapabilities` en `src/cli/index.js` (incluida la identidad de path del contenedor
  `archive`) y desde `aspec/specs/spec-sync/spec.md` (cinco Requirements). No se observaron en
  ejecución: contenedor `archive` con exit 2, H1 estructural, una sola línea en blanco tras
  `ADDED`, `RENAMED` vacío, idempotencia byte a byte, `mtime` intacto en no-op/dry-run, salida JSON
  exacta ni los exit codes 0/1/2. `test/specs-merge.test.js` existe pero el pack excluye `test/**`
  y no se corrió la suite.
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

- **`.discovery-map.json` observado**: el generador reporta **834 archivos** (aspec 264, docs 21,
  test 27, src 19, etc.). El pack registra **824 fuentes** (~38.087 tokens) y 29 entradas de archivo
  porque los globs de `discovery.exclude` omiten tests, lockfiles, imágenes y `public`; además
  Repomix filtra por sus propios ignores.
- **`documentation/`**: el mapa cuenta **340** archivos tras excluir `node_modules`/`.git`/`dist`/
  `build`/`coverage`; en disco hay 366, incluidos esos directorios ignorados. No es una
  inconsistencia del seed.
- **Artefactos de máquina**: `.ancletorc` y `.ancleto/machine-env.md` son artefactos derivados
  gitignored; deben alinearse con `package.json` (`0.22.2`). No se usan como fuente de contenido.
- **`.ancletorc` no se usa como evidencia de producto**: la skill consume el `config` resuelto por
  `ancleto discovery --check` y no trata el manifiesto como contenido del seed. La observación de la
  versión local es una verificación puntual, no una fuente de reglas. El propio `check` compara ese
  campo con la versión del CLI y avisa si difieren.
- **Publicación de `scripts/`**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`; no incluye `scripts/`. El refresco del catálogo y el gate de IDs
  existen en el repo fuente pero no viajan en el tarball npm. Se documenta como deuda, no como fallo.
- **`rg` no disponible** en este entorno (PowerShell 5.1): la evidencia se obtuvo con
  `Select-String` y lecturas directas.
- **Estado inicial del chequeo**: el pack y `.discovery-state.json` fueron regenerados antes de esta
  materialización con estado `STALE`/`impact: minor` y `affectedDocs` para todos los documentos del
  seed. Para reflejar 0.22.2 se actualizaron `decisions.md`, `index.md`, `integrations.md`,
  `inventory.md`, `overview.md`, `setup.md`, `units/_map.md`, `units/cli-install.md`,
  `units/discovery-engine.md`, `units/memory-engine.md` y `unknowns.md` desde el pack y las fuentes
  citadas. El estado final lo reporta el `discovery --check` posterior. El seed anterior describía
  0.22.0.

## Confianza

- **Alta (observado)**: estructura de `src/`, `package.json` `0.22.2`, `packageVersion`,
  `checkTierOrphan` con `localAgentDirs`, deriva de `.ancletorc.version`, `doctorCommand` con
  precedencia host activo→hosts instalados→global, `HOST_MCP_TARGETS`/`HOST_MCP_ORDER`,
  `resolveHostMcpDestination`/`resolveExistingHostMcpDestinations`, `readHostMcpIntent`,
  `repairProjectMcp` con predicado de escritura, `mcpCommandBroken` por existencia,
  `readProjectMcp` con `error`, avisos MCP host-aware de
  `checkCommand` y aviso de `repairProjectMcp`, `resolvesHostCompression`/`hostConfigHasCompression`
  y su uso en `install`/`init`/`import`, copia host-scoped de `.opencode/*` en `importCmd`,
  validación de `manifest.mcp`, `TIERS`/`TIER_CHAINS`, `freeTierOnPrimary` y sus dos avisos,
  `declaredModelIds`, `modelIdsFromCatalog`, `missingModelIdsInCatalog`, gate de `--write`,
  `looksBinaryMissing`, lint sobre `scripts/`, snapshot de 5 proveedores / 211 IDs, flujo de
  `scripts/refresh-model-catalog.mjs`, `installedPaths` como unión, comandos del CLI, firmas de
  módulos de memoria, workflow, los dos Requirements de conformidad de `prompt-contracts`
  (predicado, archive no-op acotado, ruteo y cuatro decisiones promovidas), y el contrato de
  `spec-sync` con `parseCanonicalSpec`/`parseDeltaSpec`/`mergeSpecText` y `specsMergeCommand`; los
  comentarios de `specs-merge.js` sobre H1 estructural y la identidad de path del contenedor
  `archive`; y la secuencia de archive y los literales de fallo en `agents/orchestrator.md`,
  `agents/documenter.md`, `skills/ancleto-archive`, `skills/ancleto-bulk-archive`,
  `skills/ancleto-onboard` y `aspec/specs/memory-ops/spec.md`.
- **Media (inferido)**: comportamiento de hosts no probados, efecto exacto de cada adaptador en
  cada IDE, resultados de la suite y del workflow, ausencia real del 403 en configuraciones
  concretas, materialización/saneamiento de la nota de compresión sin ejecución real, no-escritura
  de `repairProjectMcp` sobre bytes/mtime sin ejecución real, salida exacta
  de `check`/`doctor` en los escenarios multi-host y salida exacta de `export`/`import` host-neutral
  sin ejecución; idempotencia, atomicidad, exit codes y salida `--json` del merge de specs sin
  ejecución; cumplimiento real de la secuencia merge → preflight → promoción → move y de los
  literales de fallo en cada superficie de archive sin una corrida real; alineación literal de cada
  skill/agent con la norma de conformidad y con el orden del archive (se leyó el contrato y el
  proposal, no el diff completo de cada archivo).
- **Baja / desconocida**: estado real de la memoria del repo, disponibilidad de modelos en
  proveedores al momento de leer, contenido de `audit logs/` y `documentation/` (fuera de runtime),
  consumo runtime de `copilot-mcp.json`, colisión `.mcp.json` entre `commandcode` y `claude`, y
  comportamiento de la salud MCP frente a comandos que dependen de un `PATH` concreto, que el
  predicado no resuelve.
