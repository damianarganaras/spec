---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-11-02T18:45:50Z
pluginVersion: 0.18.5
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (728 fuentes, ~18.387 tokens, tier `minimo`). Las descripciones de flujo
  de `src/**` provienen de firmas + `README.md` + `CHANGELOG.md` + specs de `aspec/` + lectura
  puntual de los archivos citados (en particular `src/core/memory/{engine,doctor,working-context}.js`,
  `src/cli/index.js`, `agents/{orchestrator,memory-keeper}.md` y las propuestas archivadas de
  `0.18.4`/`0.18.5`). Confirmar cualquier detalle fino en el archivo citado.
- **El pack no incluye markdown ni tests.** El tier resuelto (`minimo`) ignora `test/**`,
  `docs/**` y `**/*.md`; Repomix además respeta `.gitignore`. Por eso `agents/`, `commands/`,
  `skills/`, `templates/`, `docs/` y `documentation/` **no aparecen** en el pack. Se describen
  por lectura puntual; el próximo `--check` puede no detectar cambios dentro de esas áreas.
- **Reporte de origen.** La generación partió de `STALE` / `impact: material`:
  `changedAreas: [".ancleto", "CHANGELOG.md", "aspec", "package.json", "src", "test"]`,
  `materialReasons: ["archivo material modificado: package.json"]`, 11 `affectedDocs`. La causa
  es el salto a `0.18.5` y los artefactos derivados del discovery.
- **Contexto de la solicitud vs estado observado.** El contexto indicaba que `development`
  estaba un commit docs por delante de `main`; el repositorio muestra lo contrario:
  `development` (`82d7cca`) es ancestro de `main` (`dbf7df5`, merge de `0.18.5`). Se priorizó
  el estado observado con `git log`/`git merge-base`.
- **Versión y tags.** `package.json` marca `0.18.5`. Tag `v0.18.5` (objeto anotado `bed8bac`) →
  merge `dbf7df5` (`merge development: 0.18.5`, en `main`). `development` está en `82d7cca`
  (`chore(release): 0.18.5`), **ancestro** de `main`; `git describe --tags` resuelve
  `v0.16.0-32-g82d7cca`. `main` contiene además los merges de release `0.18.3` y `0.18.4`. No se
  consultó el registry npm ni se verificó el tarball publicado.
- **MEM-04b: leído y con evidencia de release, no re-ejecutado.** `resolveNodeRefs` se leyó en
  `src/core/memory/engine.js` y su contrato en `aspec/specs/memory-engine/spec.md`; el change
  está **archivado** (`2026-11-02-mem-04b-resolver-referencias-navegables`) y publicado en
  `0.18.3`. No se invocó contra un nodo real ni se corrió la suite. `inspectRefs`,
  `validateRefsForWrite` y `doctor.js` se leyeron para confirmar que conservan su contrato.
- **`0.18.4` (ranking/omisiones): verificado por código, spec y propuesta.** Se leyeron
  `scopeRank`, `declaresAnchor`, `formatOverflowWarning`, `MAX_OMITTED_KEYS`, la reserva
  `min(1.500, 15 %)` y los requirements de `aspec/specs/memory-engine/spec.md`. **No** se
  ejecutaron los tests de orden, presupuesto ni manifiesto; la observación de 18 reglas omitidas
  viene de `memory doctor` sobre la base real.
- **`0.18.5` (consolidate): dry-run ejecutado, `--apply` no.** `node src/cli/index.js memory
  consolidate --json` devolvió `{ dryRun: true, exactGroups: [], superseded: [], nearDuplicates:
  [] }`. No se ejecutó `--apply` (habría sido un no-op, pero no se probó), ni un caso con
  duplicados, ni un rollback, ni un fallo de refresh. La semántica se leyó en
  `src/core/memory/engine.js`, `src/cli/index.js`, `aspec/specs/memory-ops/spec.md` y la
  propuesta archivada.
- **Memoria observada, no auditada.** `node src/cli/index.js memory doctor` reportó: integridad
  OK, 212 filas FTS indexadas, unicidad OK, **292 refs verificadas en 112 nodos activos, 0 no
  resueltas**, WAL presente (4.161.232 bytes) y `Working-context: desactualizado`. `memory
  consolidate` reportó 0 grupos exactos y 0 near-dups. `memory list --json` dio 112 activos (33
  rules, 79 decisions); `--all` incluye superseded (212). **No** se auditó cada ref ni se abrió
  el WAL. La afirmación "todos los activos tienen refs" se verificó con `memory list --json`
  (0 activos sin `refs:`).
- **Discrepancia DB por `cwd` vs raíz MCP.** Sigue abierta: `defaultMemoryDbPath(cwd)` y el
  `projectRoot` que fija el MCP pueden resolver bases distintas. No se reprodujo en esta corrida
  (el MCP no se levantó); se documenta como riesgo, no como hecho observado.
- **CLI global desactualizado.** El `ancleto` del `PATH` no reconoce `memory consolidate`
  (`subcomando desconocido`) mientras `node src/cli/index.js` sí. No se determinó la versión
  exacta del binario global ni se reinstaló. Cualquier conclusión sobre capacidades debe
  contrastarse con `package.json` y con la invocación local.
- **Overflow del bloque proactivo.** La base real omite **18 reglas** de scope `project` (el
  reporte anterior decía ~18; `memory doctor` de la versión local marca 18). No se midió cuántas
  entran exactamente ni se abrió el working-context completo. El aviso ahora lista las claves y
  `+N`, pero no se validó el texto emitido en una sesión real del orquestador.
- **Golden M01–M10.** Se verificó por lectura la existencia de `seed.json`, `golden.json`,
  `golden-refs-seed.json`, `refs-root/`, `memory-fixtures.test.js` y `memory-pr1-contract.test.js`.
  **No** se corrieron las consultas de referencia ni la suite; la cifra de tests de `tasks.md`
  no se reprodujo.
- **Suite de tests: no ejecutada.** Hay 15 archivos `*.test.js` y tres fixtures; esta
  regeneración es **state-only**. No se verificó lint, tests, cobertura ni el estado de CI.
- **`memory doctor` read-only: ejecutado, pero no en todos los escenarios.** Se observó la
  corrida feliz; no se probó una base con refs rotas/ambiguas, un FTS desalineado, un FTS con
  `columnsize=0`, ni el modo `--rebuild`.
- **Snapshot / merge / import: no ejecutados.** Se describen por lectura de
  `src/core/memory/{snapshot,engine}.js`, `src/cli/index.js` y `aspec/specs/memory-ops/spec.md`.
  No se generó un snapshot, no se restauró, no se hizo un merge real ni un import con nodos sin
  refs.
- **`memory gc`:** no ejecutado. La purga por `created_at` original y la elegibilidad de un
  duplicado antiguo consolidado se derivan de la propuesta de `0.18.5` y del código, no de una
  corrida.
- **`ancleto stats failures`:** no ejecutado. La clasificación y la privacidad se describen desde
  `src/cli/index.js` y `aspec/specs/session-failure-report/spec.md`; no se corrió contra una base
  real de opencode.
- **Entorno de máquina:** el artefacto existe (generado el 2026-11-01) y declara `ancleto:
  0.18.0`, `win32`/`10.0.26200`/`x64`, shell `Windows PowerShell 5.1`, EOL `lf`, `rg` no
  disponible, `node`/`npm`/`git`/`python` disponibles. No se regeneró el artefacto en esta
  corrida ni se re-probó cada sonda.
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
- **`BACKLOG.md` no existe.** El backlog P0 de memoria vive en
  `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`; `§5.2` conserva la deuda de I/O de `inspectRefs`
  y el conteo de no verificables con rotas.
- **`.ancletorc` presente pero no leído como evidencia de contenido.** Por contrato de la skill
  se consume resuelto vía `ancleto discovery --check` (`config.outputDir`, `config.tier`,
  `config.exclude`). El tier resuelto `minimo` proviene del reporte y de
  `.opencode/.ancleto-tier`.
- **`opencode.json` no se publica: verificado por lectura.** Se comparó con `package.json` →
  `files`. No se ejecutó `npm pack` ni se verificó el modelo efectivo en las tres superficies.
- **Docs de producto parcialmente desalineados.** `PRODUCT.md` declara 12 commands y 18 skills
  (hoy 16 y 21), no menciona `machine-env`, `stats failures`, `snapshot`, `merge`,
  `consolidate`, el check de refs ni el resolver, y conserva la guía residual de `searchMemory`.
  `README.md` no documenta el ranking de `0.18.4` ni `memory consolidate`. `CHANGELOG.md` sí
  llega a `0.18.5`. El seed refleja el estado observado; no se editaron esos archivos.
- **`aspec/`**: 19 specs fuente + **1 change activo** + **38 archivados**. No se analizó el
  contenido completo de cada spec más allá de las capabilities afectadas (`memory-engine`,
  `memory-ops`, `machine-environment`, `session-failure-report`, `prompt-contracts`, `review`,
  `agent-install-routing`, `code-review`).
- **`seed-map.json`** se mantiene a mano en esta regeneración; mapea cada documento a áreas de
  primer nivel (o archivos raíz). No se conserva `sourcesSha` en los dossiers.
- **Validación del seed**: `ancleto discovery --check` es state-only. La validación de cierre
  confirma que los documentos requeridos existen y que las fuentes no cambiaron desde el pack;
  **no** valida la exactitud semántica de cada afirmación.
