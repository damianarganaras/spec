---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-10-30T19:34:51Z
pluginVersion: 0.17.0
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (703 fuentes, ~17.319 tokens, tier `minimo`). Las descripciones de flujo
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
- **Retiro de `design.md`/`context.md`: verificado por lectura, fuera del pack.** El cambio de
  comportamiento de esta corrida vive **enteramente** en superficies que el tier `minimo` excluye:
  `agents/*.md` (6), `skills/**` (14 archivos), `docs/skill-ancleto-{update,upgrade}.md`,
  `README.md` y `test/content-guards.test.js`. Se verificó con `git diff` contra `b283ff2` y por
  lectura del change activo (`proposal.md` + `specs/artifact-update` + `specs/prompt-contracts`).
  **No** se ejecutaron `npm test` ni `npm run lint`; los guards nuevos (incluidas las mutaciones
  scratch) se describen por lectura. El cambio **no** está commiteado ni archivado.
- **Conflicto spec fuente vs implementación (retiro).** `aspec/specs/artifact-update/spec.md`
  (líneas 16 y 33) todavía clasifica "decisión de diseño → `design.md`"; el delta del change activo
  dice "→ `proposal.md ## Decisiones`" y el código ya lo implementa. `aspec/specs/prompt-contracts/spec.md`
  aún no contiene el Requirement de retiro (solo una mención de que el checkpoint no depende de
  `design.md`). Mientras no se archive/mergee, el seed marca esta divergencia como **conflictiva**
  y cita el delta como contrato vigente. No se editó ningún spec (fuera de alcance del seed).
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
- **`BACKLOG.md` no existe.** Las deudas que el seed anterior citaba por ítem (guía residual de
  `searchMemory`, protección de rama, detección material por archivo, comandos denegados fuera
  de medición) no tienen ahora **fuente canónica** en el repo; se conservan como observaciones
  de código, no como ítems con estado (abierto/cerrado) verificable.
- **`.ancletorc` presente pero no leído.** Existe (gitignored); por contrato de la skill no se
  lee directamente: su contenido se consume solo resuelto vía `ancleto discovery --check`
  (`config.outputDir`, `config.tier`, `config.exclude`). El **tier resuelto `minimo`** proviene
  del reporte y del valor de `.opencode/.ancleto-tier`.
- **Versión y tag.** `package.json` marca **`0.17.0`**; el tag anotado `v0.17.0` vive en `main`
  (`cdc18d5`, "Merge development into main for v0.17.0") y **no es ancestro** de `development`;
  `git describe --tags` resuelve `v0.16.0-9-gb283ff2`. `development` HEAD `b283ff2`
  (`chore(release): v0.17.0`) es el padre del commit de merge tagueado. El **retiro** de
  `design.md`/`context.md` está en el working tree, **no** en HEAD ni en el tag. No se verificó si
  el Release de GitHub quedó asociado al tag.
- **MEM-03 verificado por lectura, no por ejecución.** La gramática, la resolución y el rechazo
  se leyeron en `src/core/memory/engine.js` (`parseRefsBlock`, `resolveSpecRef`,
  `resolveChangeRef`, `resolvePathRef`, `validateRefsForWrite`, `recordNode`) y en
  `aspec/specs/memory-engine/spec.md`. **No** se ejecutó una escritura real con refs, ni se
  probó un rechazo por ambigüedad de heading, un `change:` archivado o un `path:` inexistente.
  Tampoco se corrió `npm test`.
- **Promoción al archivar verificada por lectura, no por ejecución.** El gate se leyó en
  `skills/ancleto-archive/SKILL.md`, `agents/memory-keeper.md` y `agents/orchestrator.md`, y el
  requirement en `aspec/specs/memory-engine/spec.md`. **No** se archivó un change real con
  decisiones aprobadas, no se probó el preflight con un lote inválido ni el caso "archivado con
  memoria pendiente". No se abrió `.ancleto/memory.db` para comprobar nodos promovidos.
- **`importNodes` fuera de refs: verificado por lectura.** Se confirmó que el import no pasa
  por `recordNode` y que la spec lo exime de la validación. No se importó un JSON con nodos sin
  refs para observar el LWW.
- **Rechazo de secretos: verificado por lectura.** Los patrones y el orden (antes de la
  transacción) se leyeron en `engine.js:88-100` y `engine.js:461-467`; no se intentó una
  escritura con una credencial real ni se verificó que el mensaje no la repita en ejecución.
- **Render sin `refs:`: verificado por lectura.** `renderRuleContent` y su uso en
  `buildWorkingContext` se leyeron en `engine.js:197-206` y `engine.js:388`; no se generó un
  working-context real con una regla que tenga refs.
- **`opencode.json` no se publica: verificado por lectura.** Se comparó el archivo raíz
  (`opencode.json:1-14`) con `package.json` → `files` (`package.json:10-17`). No se ejecutó
  `npm pack` para inspeccionar el tarball.
- **Snapshot: no ejecutado.** El comportamiento se describe por lectura de
  `src/core/memory/snapshot.js`, del wrapper `memorySnapshot` y de los escenarios de
  `aspec/specs/memory-ops/spec.md`; no se generó un snapshot real ni se probó una restauración.
  En particular, la restauración (copiar el archivo de vuelta) es un procedimiento manual que no
  tiene comando.
- **`memory doctor` read-only: no ejecutado contra una base real.** Se describe por lectura de
  `src/core/memory/doctor.js` y `memoryDoctorCmd`. No se verificó empíricamente que el modo
  default no toque el WAL ni que el conteo de `memory_fts_docsize` detecte un trigger removido.
- **`memory merge`: no ejecutado.** La validación y la transacción se describen por lectura de
  `validateMerge`/`merge` y del wrapper CLI. No se probó un merge real, un rollback por source
  desactivada ni el camino de refresh fallido (exit ≠ 0 con merge ya aplicado).
- **Spec `memory-ops`: 13 Requirements verificados por encabezados.** Se leyeron los títulos de
  los 13 Requirements y los nombres de escenarios de snapshot/doctor/merge; **no** se leyó el
  cuerpo completo de cada escenario ni se validó su cobertura contra los tests.
- **Spec `memory-engine`: requirements nuevos verificados por encabezados y prosa puntual.** Se
  leyeron los títulos de los requirements de refs, resolución, secretos, render sin `refs:` y
  promoción, más algunos escenarios citados; no se recorrió cada escenario ni se correlacionó
  uno a uno con `test/memory-engine.test.js`.
- **Harness golden M01–M10.** Se verificó la existencia de `test/fixtures/seed.json` y
  `test/fixtures/golden.json`, de `test/memory-fixtures.test.js` y
  `test/memory-pr1-contract.test.js`, y la mención del harness en el proposal y en el requirement
  "Harness de regresión golden M01-M10". **No** se inspeccionó el contenido de `golden.json` ni
  se corrieron las consultas de referencia.
- **Tests**: la suite tiene **15 archivos** + 2 fixtures, pero **no se re-ejecutó** en esta
  regeneración (la validación del seed es state-only y el tier excluye `test/**` del pack). La
  cifra en verde no se verificó.
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
  `2026-10-29-decisiones-y-contrato-checkpoint` y
  `2026-10-30-mem-03-promocion-decisiones-refs` están en `aspec/changes/archive/`; sus specs
  fuente viven en `aspec/specs/`.
- **PR-1 sin `design.md`.** El proposal declara explícitamente que el enfoque técnico vive en el
  proposal y en el delta de `memory-ops`; no hay `design.md` que leer.
- **`optimizacion-de-tokens.md` es análisis, no contrato.** Mide costo (su encabezado habla de
  tier `normal`; hoy el checkout resuelve `minimo`) y deja la promesa "optimizador de tokens"
  como decisión pendiente; sus cifras no se re-verificaron.
- **`aspec/`**: 19 specs fuente + **2 changes activos** (`ancleto-vscode-extension` y
  `retire-design-and-context-artifacts`) + 31 archivados (el último,
  `2026-10-30-mem-03-promocion-decisiones-refs`). No se analizó el
  contenido completo de cada spec más allá de las capabilities afectadas (`memory-engine`,
  `memory-ops`, `machine-environment`, `session-failure-report`, `prompt-contracts`, `review`,
  `agent-install-routing`).
- **Memoria del repo**: la sección de decisiones registradas proviene de una regeneración
  anterior vía `ancleto memory list`; en esta corrida **no se abrió** `.ancleto/memory.db`, así
  que esas entradas no se re-consultaron ni se detectaron nodos nuevos o superseded.
- **`seed-map.json`** se mantiene a mano en esta regeneración; mapea cada documento a áreas de
  primer nivel (o archivos raíz). No se conserva `sourcesSha` en los dossiers: no fue emitido
  por el CLI para estos globs.
- **Docs de producto desalineados.** `PRODUCT.md` declara 12 commands y 18 skills (hoy 16 y 21),
  no menciona `machine-env`, `stats failures`, `memory snapshot`, `memory merge` ni la
  promoción al archivar, y conserva la guía residual de `searchMemory`; `README.md` sigue
  describiendo `memory doctor` como "reconstruye el índice FTS5 y fusiona el WAL", que ya no es
  el comportamiento por defecto (aunque su sección de idioma ya no incluye `design.md`).
  `CHANGELOG.md` llega a `0.17.0` e incluye MEM-03, pero **no** menciona el retiro (uncommitted).
  El seed refleja el estado observado; no se editaron esos archivos.
- **Validación final del seed**: `ancleto discovery --check` es state-only. En esta corrida
  devolvió `state: READY`, `impact: none`, `recommendedAction: continue`, con `missingDocs: []` y
  `affectedDocs: []`. Confirma que los documentos requeridos existen y que las fuentes no
  cambiaron desde el pack; **no** valida la exactitud semántica de cada afirmación. El reporte
  muestra `seedMapPresent: false` aunque `seed-map.json` existe y es JSON válido: el CLI solo
  calcula ese campo en la rama `STALE` (`src/cli/index.js`, `checkDiscovery`), no es una ausencia
  real.
