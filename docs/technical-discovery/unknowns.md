---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-10-28T20:24:06Z
pluginVersion: 0.15.3
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (689 fuentes, ~16.512 tokens, tier `minimo`). Las descripciones de flujo
  de `src/**` provienen de firmas + `README.md` + `CHANGELOG.md` + specs de `aspec/` + el
  proposal del change archivado, más lectura puntual de los archivos citados (en particular
  `src/core/memory/{snapshot,doctor,engine}.js`, `src/core/machine-env.js`, `src/cli/index.js` y
  `aspec/specs/memory-ops/spec.md`). Confirmar cualquier detalle fino en el archivo citado.
- **El pack no incluye markdown ni tests.** El tier resuelto (`minimo`) ignora `test/**`,
  `docs/**` y `**/*.md`; Repomix además respeta `.gitignore` (`.opencode/`, `.ancletorc`,
  `.ancleto/`, `/documentation`). Por eso `agents/`, `commands/`, `skills/`, `templates/`,
  `docs/` y `documentation/` **no aparecen** en el pack. `agents/*.md` y los specs de `aspec/` se
  describen por lectura puntual; el próximo `--check` puede no detectar cambios dentro de esas
  áreas si el pack sigue ignorándolas.
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
- **`BACKLOG.md` fue eliminado.** El reporte de esta corrida lo registra como área raíz
  eliminada. Las deudas que el seed anterior citaba por ítem (guía residual de `searchMemory`,
  protección de rama, detección material por archivo, comandos denegados fuera de medición) no
  tienen ahora **fuente canónica** en el repo; se conservan como observaciones de código, no como
  ítems con estado (abierto/cerrado) verificable.
- **`.ancletorc` presente pero no leído.** Existe (gitignored); por contrato de la skill no se
  lee directamente: su contenido se consume solo resuelto vía `ancleto discovery --check`
  (`config.outputDir`, `config.tier`, `config.exclude`). El **tier resuelto `minimo`** proviene
  del reporte y del valor de `.opencode/.ancleto-tier`.
- **PR-1 no está commiteado.** `src/core/memory/snapshot.js`, el archive
  `2026-10-28-reingenieria-memoria-first/` y los tests nuevos están untracked; `src/cli/index.js`,
  `src/core/memory/{doctor,engine}.js`, `aspec/specs/memory-ops/spec.md` y tres tests están
  modificados. El seed describe el **árbol de trabajo** al 2026-10-28, no un artefacto publicado;
  el tag `v0.15.3` es anterior a estos cambios. Evidencia: `git status --short`.
- **Versión del CLI global vs. versión del paquete.** El repositorio está en `0.15.3`
  (`package.json`) y `.ancleto/machine-env.md` registra `ancleto: 0.15.3`; no se verificó qué
  versión reporta el binario `ancleto` instalado en `PATH`.
- **Tag lightweight vs. `git describe`.** El tag `v0.15.3` existe pero es **lightweight**
  (`74f713a`); `git describe --tags` responde `v0.15.1-15-g492fd04` porque sin `--tags` ignora
  tags lightweight. `git rev-list --count v0.15.3..HEAD` = 1. No se investigó si el Release de
  GitHub quedó asociado al tag.
- **Snapshot: no ejecutado.** El comportamiento se describe por lectura de
  `src/core/memory/snapshot.js`, del wrapper `memorySnapshot` y de los escenarios de
  `aspec/specs/memory-ops/spec.md`; no se generó un snapshot real ni se probó una restauración.
  En particular, la restauración (copiar el archivo de vuelta) es un procedimiento manual que no
  tiene comando.
- **`memory doctor` read-only: no ejecutado contra una base real.** Se describe por lectura de
  `src/core/memory/doctor.js` y `memoryDoctorCmd`. No se verificó empíricamente que el modo
  default no toque el WAL ni que el conteo de `memory_fts_docsize` detecte un trigger removido;
  la spec `memory-ops` cubre los escenarios T11/T24 y la alineación, pero la suite no se corrió.
- **`memory merge`: no ejecutado.** La validación y la transacción se describen por lectura de
  `validateMerge`/`merge` y del wrapper CLI. No se probó un merge real, un rollback por source
  desactivada ni el camino de refresh fallido (exit ≠ 0 con merge ya aplicado).
- **Spec `memory-ops`: 13 Requirements verificados por encabezados.** Se leyeron los títulos de
  los 13 Requirements y los nombres de escenarios de snapshot/doctor/merge; **no** se leyó el
  cuerpo completo de cada escenario ni se validó su cobertura contra los tests.
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
  vigente opta por **mensaje** y delega en `@technical-discovery`, pero el spec sigue marcando la
  pregunta como abierta.
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `TIERS`, `TIER_PACK_CONFIG`,
  `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`, `AGENT_ADAPTER_DROP`, `CAVEMAN_USAGE_NOTE` y
  las constantes de `machine-env` (`TOOL_ORDER`, `POSIX_SHELLS`, `TOOL_PROBE_TIMEOUT_MS`,
  `TOOL_PROBE_BUDGET_MS`, `GIT_TIMEOUT_MS`, `FAILURE_TEXT_MAX`) aparecen en el código; el pack
  comprimido solo muestra firmas. Pueden quedar desactualizados si cambian sin alterar firmas.
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
  `2026-10-26-orchestrator-session-start` y `2026-10-28-reingenieria-memoria-first` están en
  `aspec/changes/archive/`; sus specs fuente viven en `aspec/specs/memory-engine/`,
  `aspec/specs/machine-environment/`, `aspec/specs/session-failure-report/`,
  `aspec/specs/prompt-contracts/` y `aspec/specs/memory-ops/`.
- **PR-1 sin `design.md`.** El proposal declara explícitamente que el enfoque técnico vive en el
  proposal y en el delta de `memory-ops`; no hay `design.md` que leer.
- **`optimizacion-de-tokens.md` es análisis, no contrato.** Mide costo (su encabezado habla de
  tier `normal`; hoy el checkout resuelve `minimo`) y deja la promesa "optimizador de tokens"
  como decisión pendiente; sus cifras no se re-verificaron.
- **`aspec/`**: 19 specs fuente + 1 change activo (`ancleto-vscode-extension`) + 29 archivados.
  No se analizó el contenido completo de cada spec/delta más allá de las capabilities afectadas
  (`memory-ops`, `memory-engine`, `machine-environment`, `session-failure-report`,
  `prompt-contracts`, `review`, `agent-install-routing`).
- **Memoria del repo**: la sección de decisiones registradas proviene de una regeneración
  anterior vía `ancleto memory list`; en esta corrida **no se abrió** `.ancleto/memory.db`, así
  que esas entradas no se re-consultaron ni se detectaron nodos nuevos o superseded.
- **`seed-map.json`** se mantiene a mano en esta regeneración; mapea cada documento a áreas de
  primer nivel (o archivos raíz). No se conserva `sourcesSha` en los dossiers: no fue emitido
  por el CLI para estos globs.
- **Docs de producto desalineados.** `PRODUCT.md` declara 12 commands y 18 skills (hoy 16 y 21),
  no menciona `machine-env`, `stats failures`, `memory snapshot` ni `memory merge`, y conserva la
  guía residual de `searchMemory`; `README.md` sigue describiendo `memory doctor` como
  "reconstruye el índice FTS5 y fusiona el WAL", que ya no es el comportamiento por defecto. El
  seed refleja el estado observado; no se editaron esos archivos.
- **Validación final del seed**: `ancleto discovery --check` es state-only. En esta corrida
  devolvió `state: READY`, `impact: none`, `recommendedAction: continue`, con `missingDocs: []` y
  `affectedDocs: []`. Confirma que los documentos requeridos existen y que las fuentes no
  cambiaron desde el pack; **no** valida la exactitud semántica de cada afirmación.
- **`seedMapPresent: false` en un reporte `READY` es un artefacto del CLI**, no una ausencia:
  el campo solo se calcula en la rama `STALE`, aunque `seed-map.json` existe y es válido. Se
  verificó por lectura del archivo y por el JSON del reporte.
