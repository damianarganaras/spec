---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-11-03T13:54:02Z
pluginVersion: 0.18.7
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (745 fuentes, ~20.536 tokens, tier `minimo`). Las descripciones de flujo
  de `src/**` provienen de firmas + `README.md` + `CHANGELOG.md` + specs de `aspec/` + lectura
  puntual de los archivos citados (en particular
  `src/core/memory/{engine,database,doctor,working-context,curation}.js`, `src/cli/index.js`,
  `agents/{orchestrator,memory-keeper}.md`, los changes archivados y el backlog). Confirmar
  cualquier detalle fino en el archivo citado.
- **El pack no incluye markdown ni tests.** El tier resuelto (`minimo`) ignora `test/**`,
  `docs/**` y `**/*.md`; Repomix además respeta `.gitignore`. Por eso `agents/`, `commands/`,
  `skills/`, `templates/`, `docs/` y `documentation/` **no aparecen** en el pack. Se describen
  por lectura puntual; el próximo `--check` puede no detectar cambios dentro de esas áreas.
- **Reporte de origen.** La generación partió de `STALE` / `impact: material`:
  `changedAreas: [".ancleto", "CHANGELOG.md", "PRODUCT.md", "README.md", "aspec", "docs",
  "package.json", "src", "test"]`, `materialReasons: ["archivo material modificado:
  package.json"]`, con los 11 documentos del seed en `affectedDocs`. La causa es el salto a
  `0.18.7` y la curaduría CH-09, más el estado local del discovery.
- **Versión y tags.** `package.json` marca `0.18.7`; `CHANGELOG.md` llega a `0.18.7`
  (2026-11-03). HEAD `bd903d2` (`docs(specs): archive ch-09 curation change`) en `development`.
  El tag `v0.18.7` **existe**: es anotado y apunta a `main`; `git describe --tags` desde
  `development` resuelve `v0.18.5-19-gbd903d2` porque el tag de release vive en `main`, que no
  es ancestro de `development`; la ausencia en `describe` no implica que el tag falte. El árbol
  de trabajo está limpio salvo `.discovery-map.json` y
  `docs/technical-discovery/.discovery-state.json`, que esta corrida regeneró. El pack refleja
  el **árbol de trabajo**, no el último commit. No se consultó el registry npm ni se verificó el
  tarball publicado.
- **`memory curate` (CH-09): leído en código y spec; `--json` ejecutado, `--strict` no.** Se
  ejecutó `node src/cli/index.js memory curate --json` sobre la base real y devolvió
  `{ status: 'ok', brokenRefs: [], unverifiable: [], exactDuplicates: [] }`. No se probó
  `--strict` (un exit ≠ 0 con hallazgos), ni el escenario `no-db` (sin `.ancleto/memory.db`), ni
  una fixture con refs rotas/duplicados, ni la idempotencia byte a byte de la base. La lógica se
  leyó en `src/core/memory/curation.js`, `src/cli/index.js` (`memoryCurateCmd`) y el requirement
  `Curaduría read-only con memory curate` de `aspec/specs/memory-ops/spec.md`.
- **`includeNearDuplicates`: leído, no probado con near-dups reales.** La firma
  `consolidate({ dryRun = true, includeNearDuplicates = true })` y el forwarding del engine
  read-only están verificados por lectura; el default no se comparó contra una base con
  near-duplicates (la base real tiene 0). La suite (`test/memory-engine.test.js`) no se ejecutó.
- **MEM-05 (recall task-aware): leído en código y spec, no re-ejecutado.** Se leyeron
  `previewNode`, `projectSearchPage`, `normalizeRequired`, `compareRecall`, `searchMemory` y
  `formatOverflowWarning` en `src/core/memory/engine.js`; el requirement
  `Recall task-aware con orden total, preview expandible y keys requeridas` en
  `aspec/specs/memory-engine/spec.md`; `agents/memory-keeper.md` (Modo 1 usa `query` +
  `expand: true`); y `README.md`. No se invocó `searchMemory` contra nodos reales ni se corrieron
  los tests de preview/`expand`/`keys`/`required`.
- **MEM-05a (docs contract): verificado por lectura, no por tests.** El protocolo canónico vive
  en `AGENTS.md` → `LOCKED: memory-protocol` y `PRODUCT.md` sólo apunta; el requirement
  `Protocolo de memoria canónico en AGENTS.md y puntero único desde PRODUCT.md` está en
  `aspec/specs/prompt-contracts/spec.md`. No se ejecutaron los content guards.
- **MEM-05b (gc por supersesión): código y spec leídos; `gc` no ejecutado.** Se leyeron la
  migración aditiva/backfill en `src/core/memory/database.js`, los helpers lazy
  `getSupersede`/`getGcSelect`/`getGcDelete`/`getGcDetach` y el cutoff único en
  `src/core/memory/engine.js`, y el requirement
  `Garbage collection de nodos superseded` en `aspec/specs/memory-ops/spec.md`. No se ejecutó
  `memory gc` (ni dry-run ni purge), no se creó una base previa sin la columna para probar la
  migración y no se verificó el detach de `superseded_by` con datos reales.
- **`0.18.5` (consolidate): dry-run ejecutado, `--apply` no.** `node src/cli/index.js memory
  consolidate --json` devolvió `{ dryRun: true, exactGroups: [], superseded: [],
  nearDuplicates: [] }`. No se ejecutó `--apply` (habría sido un no-op, pero no se probó), ni un
  caso con duplicados, ni un rollback, ni un fallo de refresh. La semántica se leyó en
  `src/core/memory/engine.js`, `src/cli/index.js`, `aspec/specs/memory-ops/spec.md` y la
  propuesta archivada.
- **Memoria observada, no auditada.** `node src/cli/index.js memory doctor` reportó: integridad
  OK, **232 filas FTS indexadas** (232 nodos), unicidad OK, **360 refs verificadas en 129 nodos
  activos, 0 no resueltas**, WAL presente (4.161.232 bytes), `Working-context: desactualizado` y
  **20 reglas omitidas** por tamaño. `memory list --json` dio **129 activos**: 34 rules
  `project`, 82 decisions `project` y 13 decisions `feature`. `consolidate` y `curate`
  reportaron 0/0/0. **No** se auditó cada ref ni se abrió el WAL. La afirmación "todos los
  activos tienen refs" se verificó por el check de refs del doctor (0 no resueltas), no por
  inspección individual.
- **Discrepancia DB por `cwd` vs raíz MCP.** Sigue abierta: `defaultMemoryDbPath(cwd)` y el
  `projectRoot` que fija el MCP pueden resolver bases distintas. No se reprodujo en esta corrida
  (el MCP no se levantó); se documenta como riesgo, no como hecho observado.
- **CLI global desactualizado.** El `ancleto` del `PATH` es **0.17.1** y no reconoce
  `memory consolidate` ni `memory curate` ni el contrato nuevo de `searchMemory`, mientras
  `node src/cli/index.js` sí (0.18.7). No se reinstaló el binario global. Cualquier conclusión
  sobre capacidades debe contrastarse con `package.json` y con la invocación local.
- **Overflow del bloque proactivo.** La base real omite **20 reglas** de scope `project` (entran
  14 de 34). No se midió el texto exacto emitido en una sesión real del orquestador; sólo se
  observó el conteo por `memory doctor` y se leyó `formatOverflowWarning`.
- **Golden M01–M10.** Se verificó por lectura la existencia de `seed.json`, `golden.json`,
  `golden-refs-seed.json`, `refs-root/`, `memory-fixtures.test.js` y `memory-pr1-contract.test.js`.
  **No** se corrieron las consultas de referencia ni la suite; la cifra de tests de `tasks.md`
  no se reprodujo.
- **Suite de tests: no ejecutada.** Hay 16 archivos `*.test.js` (incluye `curation.test.js`) y
  tres fixtures; esta regeneración es **state-only**. No se verificó lint, tests, cobertura ni el
  estado de CI.
- **`memory doctor` read-only: ejecutado, pero no en todos los escenarios.** Se observó la
  corrida feliz; no se probó una base con refs rotas/ambiguas, un FTS desalineado, un FTS con
  `columnsize=0`, ni el modo `--rebuild`.
- **Snapshot / merge / import: no ejecutados.** Se describen por lectura de
  `src/core/memory/{snapshot,engine}.js`, `src/cli/index.js` y `aspec/specs/memory-ops/spec.md`.
  No se generó un snapshot, no se restauró, no se hizo un merge real ni un import con nodos sin
  refs.
- **`ancleto stats failures`:** no ejecutado. La clasificación y la privacidad se describen desde
  `src/cli/index.js` y `aspec/specs/session-failure-report/spec.md`; no se corrió contra una base
  real de opencode.
- **Entorno de máquina:** el artefacto existe (generado el 2026-11-03) y declara `ancleto:
  0.18.6` (generado por el CLI anterior a esta regeneración), `win32`/`10.0.26200`/`x64`, shell
  `Windows PowerShell 5.1`, EOL `lf`, `rg` no disponible, `node`/`npm`/`git`/`python`
  disponibles. No se regeneró el artefacto en esta corrida ni se re-probó cada sonda.
- **Intake de sesión, techo de lecturas y trigger de Recall:** verificados por lectura de
  `agents/orchestrator.md` y `agents/technical-discovery.md` (fuera del pack) y por los guards de
  `test/content-guards.test.js` (no ejecutados). No se ejecutó una sesión real del orquestador.
- **Parámetros diferidos de `orchestrator-session-start`.** La spec `prompt-contracts` deja
  abiertos (1) si "5 por turno" significa por mensaje o acumulado y (2) qué agente recibe la
  lectura delegada. La implementación opta por **mensaje** y delega en `@technical-discovery`.
- **Constantes de instalación:** `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `TIERS`,
  `TIER_PACK_CONFIG`, `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`, `AGENT_ADAPTER_DROP`,
  `CAVEMAN_USAGE_NOTE`, las de `machine-env` y las de refs se confirmaron por lectura; el pack
  comprimido sólo muestra firmas. Pueden quedar desactualizadas si cambian sin alterar firmas.
- **Mapas de tools (Antigravity/Command Code):** cubiertos por
  `test/adapters-frontmatter.test.js`; no se validaron contra hosts reales.
- **Adaptación de frontmatter por host:** la lógica y el dispatch están verificados por tests,
  pero el resultado final no se comparó contra cada IDE real (Copilot, Antigravity, VS Code y
  Command Code requieren entornos reales).
- **Retiro de `design.md`/`context.md`:** verificado por lectura del change archivado, los specs
  fuente mergeados y `git log`; está publicado desde `0.17.1`. No se inspeccionó el tarball.
- **`content-guards` acota el predicado por sección.** Los guards negativos no son un grep
  global; cubren las secciones que declaran el set/orden de artifacts. No se verificó
  empíricamente que cada slice siga apuntando al heading correcto tras futuras ediciones.
- **`audit logs/` es ruido, no evidencia.** Los 9 `.txt` untracked entran al pack pero son
  auditorías de sesiones de otros repos; no se usaron para afirmar arquitectura ni reglas.
- **`documentation/` es legado gitignored.** El discovery cuenta 340 fuentes porque recorre el
  disco con `DEFAULT_IGNORES` + `exclude` y **no** aplica `.gitignore`; el pack lo excluye. No se
  analizó su contenido.
- **`package-lock.json`: falso positivo del check.** Puede marcarse como "área raíz eliminada",
  pero existe y está en `config.exclude`. Mismo criterio para `yarn.lock`/`pnpm-lock.yaml`.
- **`BACKLOG.md` no existe.** El backlog vive en `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`.
  CH-09 está **cerrado** por `ch-09-curaduria-recurrente`; quedan diferidos CH-09a…CH-09h
  (gate de criticalidad, auto-reparación, curaduría periódica, tope de escala y las deudas e…h
  del reporte de `curate`). El CHANGELOG de `0.18.7` registra además `MEM-05c`…`MEM-05g`. No se
  releyó el backlog completo en esta corrida.
- **`.ancletorc` presente pero no leído como evidencia de contenido.** Por contrato de la skill
  se consume resuelto vía `ancleto discovery --check` (`config.outputDir`, `config.tier`,
  `config.exclude`). El tier resuelto `minimo` proviene del reporte y de
  `.opencode/.ancleto-tier`.
- **`opencode.json` no se publica: verificado por lectura.** Se comparó con `package.json` →
  `files`. No se ejecutó `npm pack` ni se verificó el modelo efectivo en las tres superficies.
- **Docs de producto con deriva menor.** `PRODUCT.md` ya no declara conteos obsoletos y su
  sección de memoria apunta al bloque `LOCKED: memory-protocol`; `README.md` documenta
  preview/`expand`/`keys`/`required` y `memory curate`, pero su badge declara **18 skills**
  cuando el árbol tiene **21**. `CHANGELOG.md` llega a `0.18.7` y **no** menciona `memory curate`
  (archivado, sin release). El seed refleja el estado observado; no se editaron esos archivos.
- **`aspec/`**: 19 specs fuente + **1 change activo** + **42 archivados**. No se analizó el
  contenido completo de cada spec más allá de las capabilities afectadas (`memory-engine`,
  `memory-ops`, `machine-environment`, `session-failure-report`, `prompt-contracts`, `review`,
  `agent-install-routing`, `code-review`).
- **`seed-map.json`** se mantiene a mano en esta regeneración; mapea cada documento a áreas de
  primer nivel (o archivos raíz). No se conserva `sourcesSha` en los dossiers.
- **Validación del seed**: `ancleto discovery --check` es state-only. La validación de cierre
  confirma que los documentos requeridos existen y que las fuentes no cambiaron desde el pack;
  **no** valida la exactitud semántica de cada afirmación.
