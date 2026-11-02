---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-11-02T12:11:50Z
pluginVersion: 0.18.2
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (722 fuentes, ~17.790 tokens, tier `minimo`). Las descripciones de flujo
  de `src/**` provienen de firmas + `README.md` + `CHANGELOG.md` + specs de `aspec/` + lectura
  puntual de los archivos citados (en particular
  `src/core/memory/{engine,tools,mcp-server,working-context,snapshot,doctor}.js`,
  `src/core/machine-env.js`, `src/cli/index.js`, `skills/ancleto-archive/SKILL.md` y
  `agents/{orchestrator,memory-keeper,spec-writer}.md`). Confirmar cualquier detalle fino en el
  archivo citado.
- **El pack no incluye markdown ni tests.** El tier resuelto (`minimo`) ignora `test/**`,
  `docs/**` y `**/*.md`; Repomix además respeta `.gitignore` (`.opencode/`, `.ancletorc`,
  `.ancleto/`, `/documentation`). Por eso `agents/`, `commands/`, `skills/`, `templates/`,
  `docs/` y `documentation/` **no aparecen** en el pack. `agents/*.md`, las skills y los specs
  de `aspec/` se describen por lectura puntual; el próximo `--check` puede no detectar cambios
  dentro de esas áreas si el pack sigue ignorándolas.
- **MEM-04b: leído, no ejecutado en esta regeneración.** El resolver
  `resolveNodeRefs({ content, projectRoot })` se leyó en `src/core/memory/engine.js` y su
  contrato en `aspec/changes/mem-04b-resolver-referencias-navegables/specs/memory-engine/spec.md`.
  El change declara en `tasks.md` lint y tests corridos
  (`node --test test/memory-engine.test.js test/memory-fixtures.test.js` y `npm test`: 727
  tests, 723 ok, 4 skip preexistentes), y el harness `test/memory-fixtures.test.js` declara
  M01/M04/M05/M06/M07 activas. **No** se ejecutó la suite en esta regeneración (la validación del
  seed es state-only) ni se invocó `resolveNodeRefs` contra un nodo real. `inspectRefs`,
  `validateRefsForWrite` y `doctor.js` se leyeron para confirmar que conservan su contrato.
- **MEM-04b no está commiteado ni archivado.** El change vive en `aspec/changes/` y sus cambios
  aparecen en `git status` (`M src/core/memory/engine.js`, `M test/...`, `?? fixtures`). El seed
  lo describe como estado del árbol de trabajo, no como release. `package.json` sigue en
  `0.18.2`; `CHANGELOG.md` no lo incluye.
- **Golden M01–M10.** Se verificó por lectura de `test/fixtures/memory/golden.json` que M01,
  M04, M05, M06 y M07 están `active` (M04/M05/M06 con `mode: "refs"`) y que
  `test/memory-fixtures.test.js` declara el allowlist `['M02','M03','M08','M09','M10']` como
  diferido. No se inspeccionó cada expectativa de `golden-refs-seed.json` ni se corrieron las
  consultas.
- **Retiro de `design.md`/`context.md`: verificado por lectura, fuera del pack.** El cambio de
  comportamiento vive **enteramente** en superficies que el tier `minimo` excluye:
  `agents/*.md`, `skills/**`, `docs/skill-ancleto-{update,upgrade}.md`, `README.md` y
  `test/content-guards.test.js`. Se verificó por lectura del change archivado y de los specs
  fuente mergeados, más `git log`. El cambio está **commiteado, archivado y publicado desde
  `0.17.1`**.
- **Retiro publicado: sin conflicto spec fuente vs implementación.** El spec fuente
  `aspec/specs/artifact-update/spec.md` clasifica "decisión de diseño → `proposal.md ##
  Decisiones`" y declara que `design.md` NO se crea ni actualiza;
  `aspec/specs/prompt-contracts/spec.md` contiene el requirement de retiro. **No** se consultó
  el registry npm en esta corrida: que el tarball contenga el retiro se deriva del
  `CHANGELOG.md` y del tag, no de una verificación del paquete publicado.
- **`content-guards` acota el predicado por sección.** Los guards negativos no son un grep global:
  `RETIRED_ARTIFACT_GENERATORS`, `NO_DESIGN_MD_SLICERS` y `NO_CONTEXT_MD_SURFACES` cubren solo las
  secciones que declaran el set/orden de artifacts, y `LEGACY_READ_SLICES` exige el control
  positivo. No se verificó empíricamente que cada slice siga apuntando al heading correcto tras
  futuras ediciones; solo se leyó el código.
- **`audit logs/` es ruido, no evidencia.** Los 9 `.txt` untracked sí entran al pack (no están
  excluidos), pero son auditorías de sesiones de otros repos y no describen `@ancleto/spec`. No
  se usaron para afirmar arquitectura, reglas ni integraciones.
- **`documentation/` es legado gitignored.** El estado del discovery cuenta 340 fuentes de
  `documentation/` porque `computeSources` recorre el disco con `DEFAULT_IGNORES` + `exclude` y
  **no** aplica `.gitignore`; el pack lo excluye. No se analizó su contenido ni se usa como
  evidencia.
- **`package-lock.json`: falso positivo del check.** El reporte puede marcarlo como "área raíz
  eliminada", pero el archivo **existe** y está en `config.exclude` (lockfiles), por lo que no
  se hashea. No es una desaparición real. Mismo criterio para `yarn.lock`/`pnpm-lock.yaml`.
- **`BACKLOG.md` no existe; el backlog P0 de memoria sí.** `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`
  existe y aparece modificado en el árbol de trabajo; allí vive el plan PR-1…PR-5/PR-4b, no un
  `BACKLOG.md` raíz. CH-11 y MEM-07 están cerrados en `0.18.2`; `§5.2` conserva la deuda de I/O
  de `inspectRefs` y el conteo de no verificables con rotas.
- **`.ancletorc` presente pero no leído.** Existe (gitignored); por contrato de la skill no se
  lee directamente: su contenido se consume solo resuelto vía `ancleto discovery --check`
  (`config.outputDir`, `config.tier`, `config.exclude`). El **tier resuelto `minimo`** proviene
  del reporte y del valor de `.opencode/.ancleto-tier`.
- **Versión y tags.** `package.json` marca **`0.18.2`**; release `8d23dbe`
  (`chore(release): 0.18.2`) y tag anotado `v0.18.2` en `main` (`41d2313`, merge de
  `development`). `v0.18.1` apunta a `a240d6a`; `v0.18.0` a `75373a`. `development` HEAD
  `d2138df` está **1 commit adelante** de `origin/development` y `git describe --tags` resuelve
  `v0.16.0-25-gd2138df` (los tags `v0.17.x`/`v0.18.x` cuelgan de merges de `main`, no de
  `development`). MEM-04 se publicó en `0.18.0`; MEM-04b no está en ningún tag. No se verificó
  si el Release de GitHub quedó asociado a cada tag ni se consultó el registry npm.
- **MEM-03 verificado por lectura, no por ejecución.** La gramática, la resolución y el rechazo
  se leyeron en `src/core/memory/engine.js` (`parseRefsBlock`, `resolveSpecRef`,
  `resolveChangeRef`, `resolvePathRef`, `validateRefsForWrite`, `recordNode`) y en
  `aspec/specs/memory-engine/spec.md`. **No** se ejecutó una escritura real con refs, ni se
  probó un rechazo por ambigüedad de heading, un `change:` archivado o un `path:` inexistente.
- **MEM-04 verificado por lectura, no por ejecución.** El check `Refs de nodos activos` y
  `inspectRefs` se leyeron en `src/core/memory/doctor.js` y `src/core/memory/engine.js`, y el
  contrato en `aspec/specs/memory-ops/spec.md`. **No** se ejecutó `memory doctor` contra una base
  real con refs rotas/ambiguas, no se probó la omisión por raíz no derivable, no se observó el
  `detail` con `commit:`/`workitem:` y no se verificó que el check no toque el WAL.
- **Deuda declarada de MEM-04 (backlog `§5.2`), no observada en ejecución.** `inspectRefs` no
  captura errores de I/O (`readFileSync`/`readdirSync`/`statSync` pueden lanzar y abortar el
  doctor); el conteo de `commit:`/`workitem:` como no verificables sólo se agrega al `detail` sin
  rotas; y `agents/memory-keeper.md` no aclara que la indentación de los items es opcional. Son
  deudas declaradas, no fallas observadas. Evidencia:
  `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` (`### 5.2`).
- **`importNodes` fuera de refs: verificado por lectura.** Se confirmó que el import no pasa
  por `recordNode` y que la spec lo exime de la validación. No se importó un JSON con nodos sin
  refs para observar el LWW.
- **Rechazo de secretos: verificado por lectura.** Los patrones y el orden (antes de la
  transacción) se leyeron en `engine.js`; no se intentó una escritura con una credencial real ni
  se verificó que el mensaje no la repita en ejecución.
- **Render sin `refs:`: verificado por lectura.** `renderRuleContent` y su uso en
  `buildWorkingContext` se leyeron en `engine.js`; no se generó un working-context real con una
  regla que tenga refs.
- **`opencode.json` no se publica: verificado por lectura.** Se comparó el archivo raíz con
  `package.json` → `files`. El baseline cubre **10 subagentes**, incluido `orchestrator` desde
  `0.18.1`; el árbol de trabajo no tiene cambios pendientes en ese archivo. No se ejecutó
  `npm pack` para inspeccionar el tarball ni se verificó el modelo efectivo en las tres
  superficies del runtime.
- **Snapshot: no ejecutado.** El comportamiento se describe por lectura de
  `src/core/memory/snapshot.js`, del wrapper `memorySnapshot` y de los escenarios de
  `aspec/specs/memory-ops/spec.md`; no se generó un snapshot real ni se probó una restauración.
  La restauración es un procedimiento manual que no tiene comando.
- **`memory doctor` read-only: no ejecutado contra una base real.** Se describe por lectura de
  `src/core/memory/doctor.js` y `memoryDoctorCmd`. No se verificó empíricamente que el modo
  default no toque el WAL, que el conteo de `memory_fts_docsize` detecte un trigger removido ni
  que el check `Refs de nodos activos` reporte correctamente rotas, ambigüedades y omisión por
  raíz no derivable.
- **`memory merge`: no ejecutado.** La validación y la transacción se describen por lectura de
  `validateMerge`/`merge` y del wrapper CLI. No se probó un merge real, un rollback por source
  desactivada ni el camino de refresh fallido (exit ≠ 0 con merge ya aplicado).
- **Spec `memory-ops`: 16 Requirements verificados por encabezados.** Se leyeron los títulos de
  los 16 Requirements y los nombres de escenarios de snapshot/doctor/merge/refs; **no** se leyó
  el cuerpo completo de cada escenario ni se validó su cobertura contra los tests.
- **Spec `memory-engine`: 21 Requirements + delta MEM-04b.** Se leyeron los títulos de los
  requirements de refs, resolución, secretos, render sin `refs:` y promoción, y el delta
  completo de `resolveNodeRefs`; no se recorrió cada escenario del spec fuente ni se correlacionó
  uno a uno con `test/memory-engine.test.js`.
- **Harness golden M01–M10.** Se verificó por lectura la existencia de
  `test/fixtures/memory/seed.json`, `golden.json` y `golden-refs-seed.json`, del root
  `refs-root/`, de `test/memory-fixtures.test.js` y `test/memory-pr1-contract.test.js`, y el
  estado `active` de M01/M04/M05/M06/M07. **No** se corrieron las consultas de referencia.
- **Tests**: la suite tiene **15 archivos** + 3 fixtures y el root `refs-root/`, pero **no se
  re-ejecutó** en esta regeneración (la validación del seed es state-only y el tier excluye
  `test/**` del pack). La cifra de `tasks.md` (727 tests, 723 ok, 4 skip) es declarada por el
  change, no reproducida aquí.
- **`ancleto stats failures` no se ejecutó.** La clasificación y el contrato de privacidad se
  describen desde `src/cli/index.js` (`statsFailuresCommand`, `failureBucketsQuery`,
  `maskSensitive`, `skeletonCommand`) y `aspec/specs/session-failure-report/spec.md`; no se
  corrió contra una base de opencode real.
- **Intake de sesión, techo de lecturas y trigger de Recall: verificados por lectura** de
  `agents/orchestrator.md` y `agents/technical-discovery.md` (ambos fuera del pack) y por los
  guards de `test/content-guards.test.js` (no ejecutados). No se ejecutó una sesión real del
  orquestador.
- **Parámetros diferidos del change `orchestrator-session-start`.** La spec `prompt-contracts`
  deja explícitamente pendientes (1) si "5 por turno" significa por mensaje o acumulado en la
  sesión, y (2) qué agente recibe la lectura delegada al superar el tope. La implementación
  vigente opta por **mensaje** y delega en `@technical-discovery`, pero el spec sigue marcando
  la pregunta como abierta.
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `TIERS`, `TIER_PACK_CONFIG`,
  `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`, `AGENT_ADAPTER_DROP`, `CAVEMAN_USAGE_NOTE`,
  las constantes de `machine-env` (`TOOL_ORDER`, `POSIX_SHELLS`, `TOOL_PROBE_TIMEOUT_MS`,
  `TOOL_PROBE_BUDGET_MS`, `GIT_TIMEOUT_MS`, `FAILURE_TEXT_MAX`) y las de refs
  (`REF_KINDS`, `SECRET_PATTERNS`) aparecen en el código; el pack comprimido solo muestra
  firmas. Pueden quedar desactualizados si cambian sin alterar firmas.
- **Mapas de tools (Antigravity/Command Code)**: los ids y la política de omisión están cubiertos
  por `test/adapters-frontmatter.test.js`; no se validaron contra hosts reales.
- **Adaptación de frontmatter por host**: la lógica y el dispatch están verificados por tests,
  pero el resultado final no se comparó contra cada IDE real (Copilot, Antigravity, VS Code y
  Command Code requieren entornos reales).
- **Día-cero, host-scoped y refresh on-write**: se describen por código
  (`renderWorkingContextBlock`, `formatTopologyBlock`, `hostSupportsCompression`,
  `refreshWorkingContextOnWrite`, `checkWorkingContextFreshness`) y por los specs archivados;
  no se re-ejecutó la suite para confirmarlos en verde.
- **Cambios archivados recientes.** `2026-10-17-memory-cli-writes-refresh-working-context`,
  `2026-10-25-machine-environment-block`, `2026-10-25-session-failure-report`,
  `2026-10-26-orchestrator-session-start`, `2026-10-28-reingenieria-memoria-first`,
  `2026-10-29-decisiones-y-contrato-checkpoint`,
  `2026-10-30-mem-03-promocion-decisiones-refs`,
  `2026-10-30-retire-design-and-context-artifacts`,
  `2026-10-31-mem-04-doctor-referencias-no-resueltas` y
  `2026-11-01-clarificaciones-spec-severidad-y-refs` están en `aspec/changes/archive/`; sus
  specs fuente viven en `aspec/specs/`.
- **PR-1 sin `design.md`.** El proposal declara explícitamente que el enfoque técnico vive en
  el proposal y en el delta de `memory-ops`; ese change archivado
  (`2026-10-28-reingenieria-memoria-first`) nunca tuvo `design.md`. Los changes anteriores al
  retiro que sí lo tuvieron conservan su archivo intacto en el archive.
- **`optimizacion-de-tokens.md` es análisis, no contrato.** Mide costo (su encabezado habla de
  tier `normal`; hoy el checkout resuelve `minimo`) y deja la promesa "optimizador de tokens"
  como decisión pendiente; sus cifras no se re-verificaron.
- **`aspec/`**: 19 specs fuente + **2 changes activos** (`ancleto-vscode-extension`,
  `mem-04b-resolver-referencias-navegables`) + 35 archivados (el último,
  `2026-11-01-clarificaciones-spec-severidad-y-refs`). No se analizó el contenido completo de
  cada spec más allá de las capabilities afectadas (`memory-engine`, `memory-ops`,
  `machine-environment`, `session-failure-report`, `prompt-contracts`, `review`,
  `agent-install-routing`, `code-review`).
- **Memoria del repo**: la sección de decisiones registradas proviene de una regeneración
  anterior vía `ancleto memory list`; en esta corrida **no se abrió** `.ancleto/memory.db`, así
  que esas entradas no se re-consultaron ni se detectaron nodos nuevos o superseded.
- **`seed-map.json`** se mantiene a mano en esta regeneración; mapea cada documento a áreas de
  primer nivel (o archivos raíz). No se conserva `sourcesSha` en los dossiers: no fue emitido
  por el CLI para estos globs.
- **Docs de producto parcialmente desalineados.** `PRODUCT.md` declara 12 commands y 18 skills
  (hoy 16 y 21), no menciona `machine-env`, `stats failures`, `memory snapshot`, `memory merge`,
  el check de refs ni el resolver, y conserva la guía residual de `searchMemory`; `README.md` ya
  describe `memory doctor` read-only por defecto, con `--rebuild` como único camino de
  escritura. `CHANGELOG.md` llega a `0.18.2` e incluye MEM-04 (en `0.18.0`), pero **no** MEM-04b
  (sin release). El seed refleja el estado observado; no se editaron esos archivos.
- **Validación del seed**: `ancleto discovery --check` es state-only. El reporte que originó esta
  generación fue `STALE` / `impact: material` (11 `affectedDocs`,
  `materialReasons: ["archivo material modificado: package.json"]`, bump a `0.18.2`). La
  validación de cierre confirma que los 8 documentos requeridos existen y que las fuentes no
  cambiaron desde el pack; **no** valida la exactitud semántica de cada afirmación.
