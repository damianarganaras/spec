---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-10-26T17:15:00Z
pluginVersion: 0.15.1
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (676 fuentes, ~14.318 tokens, tier `gratis`). Las descripciones de flujo
  de `src/**` provienen de firmas + `README.md` + `BACKLOG.md` + `CHANGELOG.md` + specs de
  `aspec/`, más lectura puntual de los archivos citados (en particular
  `src/core/memory/engine.js`, `src/cli/index.js`, `src/core/memory/**` y `agents/*.md`).
  Confirmar cualquier detalle fino en el archivo citado.
- **El pack de esta corrida es más chico que el anterior** (676 archivos / ~14.318 tokens frente
  a 670 / ~38.239) con los mismos ignores declarados: la diferencia no está en el alcance
  excluido sino en la compresión efectiva que aplica Repomix. Los conteos de tokens por
  corrida no son comparables entre sí; los conteos de archivos del mapa tampoco (el pack
  aplica los ignores del tier y `.gitignore`, el mapa recorre el disco).
- **Markdown fuera del pack.** El tier resuelto (`gratis`, vía `.opencode/.ancleto-tier`) ignora
  `test/**`, `docs/**` y `**/*.md`; Repomix además respeta `.gitignore` (`.opencode/`,
  `.ancletorc`, `.ancleto/`, `/documentation`). Por eso `agents/`, `commands/`, `skills/`,
  `templates/`, `docs/` y `documentation/` **no aparecen** en el pack. `agents/*.md` y los specs
  de `aspec/` se describen por lectura puntual; el próximo `--check` puede no detectar cambios
  dentro de esas áreas si el pack sigue ignorándolas.
- **`audit logs/` es ruido, no evidencia.** Los 9 `.txt` untracked sí entran al pack (no están
  excluidos), pero son auditorías de sesiones de otros repos y no describen `@ancleto/spec`. No
  se usaron para afirmar arquitectura, reglas ni integraciones.
- **`documentation/` es legado gitignored.** El estado del discovery cuenta 340 fuentes de
  `documentation/` porque `computeSources` recorre el disco con `DEFAULT_IGNORES` + `exclude` y
  **no** aplica `.gitignore`; el pack lo excluye. No se analizó su contenido ni se usa como
  evidencia.
- **`package-lock.json`: falso positivo del check.** El reporte lo marca como "área raíz
  eliminada", pero el archivo **existe** y está en `config.exclude` (lockfiles), por lo que no
  se hashea. No es una desaparición real. Mismo criterio para `yarn.lock`/`pnpm-lock.yaml`.
- **`.ancletorc` presente pero no leído.** Existe (gitignored); por contrato de la skill no se
  lee directamente: su contenido se consume solo resuelto vía `ancleto discovery --check`
  (`config.outputDir`, `config.tier`, `config.exclude`). El **tier resuelto `gratis`** proviene
  del reporte, no de leer el archivo.
- **Versión del CLI global vs. versión del paquete.** El `ancleto` instalado en `PATH` reporta
  `0.14.0`, mientras que el repositorio está en `0.15.1` (`package.json`) y
  `.ancleto/machine-env.md` registra `ancleto: 0.15.1` (valor leído del `package.json` del
  proyecto por `readAncletoVersion`). El seed reporta **0.15.1** (versión del paquete que
  describe el repo); la discrepancia con el binario global no se investigó.
- **`CHANGELOG.md` limitado a `0.12.1`.** `package.json` marca `0.15.1` y el tag `v0.15.1`
  apunta a un commit anterior al HEAD (`7da9a97`, 4 commits por delante); el changelog no tiene
  entradas para `0.13.x`–`0.15.1`. Los cambios de ese rango se infieren de specs, código,
  changes archivados y tags, no de una entrada de release.
- **`machine-env.md` existe en este checkout.** Se pudo inspeccionar el artefacto real
  (generado el 2026-10-26): `win32`/`10.0.26200`/`x64`, shell `Windows PowerShell 5.1`
  (`shell_source: PSModulePath`), EOL `lf` (`eol_source: gitattributes`), `rg` no disponible
  (fallback `Select-String`), `node`/`npm`/`git`/`python` disponibles, `ancleto: 0.15.1`. Su
  formato y comportamiento se verificaron además en `src/core/machine-env.js` (lectura directa)
  y `aspec/specs/machine-environment/spec.md` (7 requirements / 47 scenarios).
- **Entrega a subagentes verificada por lectura, no por ejecución.** Los 10 `agents/*.md`
  contienen la instrucción canónica; `agents/orchestrator.md` tiene `## Machine Environment`,
  `## Session Intake`, el techo de lecturas reconciliado y el trigger de Recall; no se probó una
  delegación real.
- **Intake de sesión y techo de lecturas: verificados por lectura directa** de
  `agents/orchestrator.md` y `agents/technical-discovery.md` (ambos fuera del pack) y por los
  guards de `test/content-guards.test.js`. No se ejecutó una sesión real del orquestador.
- **Parámetros diferidos del cambio `orchestrator-session-start`.** La spec
  `prompt-contracts` deja explícitamente pendientes (1) si "5 por turno" significa por mensaje
  o acumulado en la sesión, y (2) qué agente recibe la lectura delegada al superar el tope.
  La implementación vigente opta por **mensaje** y delega en `@technical-discovery`
  (`agents/orchestrator.md`), pero el spec sigue marcando la pregunta como abierta.
- **Guía `searchMemory` residual en superficies mergeadas.** `AGENTS.md`, `PRODUCT.md` y sus
  templates siguen recomendando `searchMemory` ante `<ContextOverflowWarning>`, en contraste con
  el aviso vigente y con el contrato del orquestador. Está registrado como **`BACKLOG.md` ítem
  17** (abierto); el seed lo describe como deuda, no como comportamiento actual del motor.
- **Change archivado `orchestrator-session-start`: lectura parcial.** Se leyeron `proposal.md` y
  los deltas de `memory-engine` y `prompt-contracts` (y sus versiones fusionadas en
  `aspec/specs/`); **no** se leyó el contenido completo de `design.md` ni `tasks.md` de ese
  change.
- **`ancleto stats failures` no se ejecutó.** La clasificación y el contrato de privacidad se
  describen desde `src/cli/index.js` (`statsFailuresCommand`, `failureBucketsQuery`,
  `maskSensitive`, `skeletonCommand`) y `aspec/specs/session-failure-report/spec.md`; no se
  corrió contra una base de opencode real.
- **Tests**: la suite tiene **13 archivos** (`machine-env` y `stats-failures` son los nuevos; el
  assert del aviso de overflow vive en `memory-engine`), pero **no se re-ejecutó** en esta
  regeneración (la validación del seed es state-only y el tier excluye `test/**` del pack). La
  cifra en verde no se verificó.
- **Conteos de assets**: 10 agents, 16 commands, 21 skills (~35 archivos), 19 specs, 1 change
  activo + 27 archivados, `src` 14, `test` 13, `aspec` 140, `total_files` 688. Tomados de
  `.discovery-map.json` (regenerado por la corrida del pack) y listados de directorio.
- **`PRODUCT.md` y `README.md` desalineados.** `PRODUCT.md` declara 12 commands y 18 skills (hoy
  16 y 21), no menciona `machine-env` ni `stats failures` y conserva la guía residual de
  `searchMemory`; `README.md` tampoco documenta el entorno de máquina. El seed refleja el estado
  observado; no se editaron esos archivos.
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `TIERS`, `ANTIGRAVITY_TOOL_MAP`,
  `COMMANDCODE_TOOL_MAP`, `AGENT_ADAPTER_DROP`, `CAVEMAN_USAGE_NOTE` y las constantes de
  `machine-env` (`TOOL_ORDER`, `POSIX_SHELLS`) aparecen en el código; el pack comprimido solo
  muestra firmas. Pueden quedar desactualizados si cambian sin alterar firmas.
- **Mapas de tools (Antigravity/Command Code)**: los ids y la política de omisión están
  cubiertos por `test/adapters-frontmatter.test.js`; no se validaron contra hosts reales.
- **Adaptación de frontmatter por host**: la lógica y el dispatch están verificados por tests,
  pero el resultado final no se comparó contra cada IDE real (Copilot, Antigravity, VS Code y
  Command Code requieren entornos reales).
- **Día-cero, host-scoped y refresh on-write**: se describen por código
  (`renderWorkingContextBlock`, `formatTopologyBlock`, `hostSupportsCompression`,
  `refreshWorkingContextOnWrite`, `checkWorkingContextFreshness`) y por los specs archivados;
  no se re-ejecutó la suite para confirmarlos en verde.
- **Cambios archivados recientes.** `2026-10-17-memory-cli-writes-refresh-working-context`,
  `2026-10-25-machine-environment-block`, `2026-10-25-session-failure-report` y
  `2026-10-26-orchestrator-session-start` ya están en `aspec/changes/archive/`; sus specs fuente
  viven en `aspec/specs/memory-engine/`, `aspec/specs/machine-environment/`,
  `aspec/specs/session-failure-report/` y `aspec/specs/prompt-contracts/`.
- **`optimizacion-de-tokens.md` es análisis, no contrato.** Mide costo (su encabezado habla de
  tier `normal`; hoy el checkout resuelve `gratis`) y deja la promesa "optimizador de tokens"
  como decisión pendiente; sus cifras no se re-verificaron.
- **`aspec/`**: 19 specs fuente + 1 change activo (`ancleto-vscode-extension`) + 27 archivados.
  No se analizó el contenido completo de cada spec/delta más allá de las capabilities afectadas
  (`machine-environment`, `session-failure-report`, `memory-engine`, `prompt-contracts`,
  `review`, `agent-install-routing`).
- **Memoria del repo**: `ancleto memory list` es la fuente de las decisiones registradas; no se
  inspeccionó la base completa ni nodos superseded.
- **`seed-map.json`** se mantiene a mano en esta regeneración; mapea cada documento a áreas de
  primer nivel (o archivos raíz). No se conserva `sourcesSha` en los dossiers: se removió para
  no publicar un hash que no fue emitido por el CLI.
- **Validación final del seed**: `ancleto discovery --check` es state-only. Si el estado queda
  `READY`, confirma que los documentos requeridos existen y que las fuentes no cambiaron desde
  el pack; no valida la exactitud semántica de cada afirmación.
