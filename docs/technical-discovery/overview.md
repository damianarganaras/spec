---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-10-29T19:20:00Z
pluginVersion: 0.16.0
skillVersion: '2.3'
---

# Overview

## Propósito

`@ancleto/spec` (**Ancleto**, alias de CLI `aspec`) es un orquestador liviano para
desarrollo asistido por IA bajo **Spec-Driven Development (SDD)**. Vive dentro del IDE del
usuario y automatiza cuatro cosas: **especificar** (ciclo de changes), **descubrir** (mapa
topológico + empaquetado de contexto), **recordar** (reglas y decisiones del proyecto entre
sesiones) y **adaptar el entorno** (hechos de la máquina entregados a los agentes). Evidencia:
`README.md`, `package.json`, `src/core/machine-env.js`.

Restricciones de diseño declaradas: **cero dependencias de runtime**, Node ≥ 24 (usa el
módulo nativo `node:sqlite`) y control explícito de costo por **tiers** (`normal`, `minimo`,
`gratis`). El único uso de dependencias externas es de **desarrollo** (ESLint). Evidencia:
`README.md`, `package.json`, `src/core/repomix-tier.js`, `eslint.config.js`.

## Arquitectura (observado)

CLI monolítica en ESM, sin framework externo. Capas:

| Capa | Ruta | Rol |
|---|---|---|
| CLI / orquestación | `src/cli/index.js` | Parsing de comandos, `init`/`install`/`update`/`upgrade`, instalación por host, perfiles, export/import, discovery, memoria y sus ops (`snapshot`/`merge` incluidos), `specs check`, `affected`, projects, `stats` + `stats failures`, doctor, MCP; merge de templates; directiva de compresión host-scoped; working-context día-cero; refresh on-write CLI y staleness advisory; **generación de `.ancleto/machine-env.md` y aviso si queda trackeado**. |
| UI de terminal | `src/cli/ui.js` | Banner ASCII animado y menús TTY (Raw Mode) sin librerías; helpers de color. |
| Adaptación de frontmatter | `src/core/adapters/frontmatter.js` | **Módulo puro, dueño único** de la transformación de frontmatter por host/assetKind (incluye Antigravity y Command Code). |
| Discovery | `src/core/discovery.js` | Mapa topológico `.discovery-map.json`. |
| Affected-set | `src/core/affected-set.js` | Grafo de imports zero-dep; clausura transitiva de **dependientes** (determinista) para el scope de review y la verificación. |
| Empaquetado y tiers | `src/core/repomix-tier.js` | Args de Repomix, ignores por tier, `--compress`, token budget. |
| Selección de modelos | `src/core/tier-models.js` | Modelos por tier, resolución de tier gratis (Muse Spark/probe/env). |
| Entorno de máquina | `src/core/machine-env.js` | **Dueño único** de detectar plataforma/shell/EOL/tooling (disponibilidad = **resoluble e invocable**, con sonda `--version` acotada), renderizar y escribir `.ancleto/machine-env.md`, y garantizar su exclusión local vía `info/exclude`; `checkMachineEnvTracked` para `check`. |
| Memoria persistente | `src/core/memory/*.js` | SQLite nativo + FTS5: `database`, `engine` (search/record/export/import/gc/**merge**, `formatTopologyBlock`, procedencia `source`, aviso de overflow), `snapshot` (**copia consistente con historial**), `tools`, `mcp-server`, `doctor` (**read-only por defecto**), `working-context` (render compartido; refresh on-write CLI compare-based y staleness advisory). |
| Assets instalables | `agents/`, `commands/`, `skills/`, `templates/`, `profiles/` | Markdown que el CLI copia al IDE del usuario (10 agents, 16 commands, 21 skills, 2 templates + perfil `test`). |
| Contratos de prompt | `agents/*.md` | Normativa del pipeline: intake de sesión, techo de lecturas, trigger de Recall, contrato de validación, **checkpoint de contrato** tras `@spec-writer` y sección `## Decisiones` del proposal, destilado entre tramos. Los mirrors `.opencode/agents/*.md` se regeneran, no se editan a mano. |
| Specs del propio repo | `aspec/` | `config.yaml` + `specs/` (19 capacidades) + 2 changes activos + `changes/archive/` (29). |
| Lint | `eslint.config.js` | Flat config mínima (4 reglas) sobre `src/` y `test/`. |
| Tests | `test/*.test.js` | Suite `node --test` (15 archivos; no re-ejecutada en esta regeneración). |
| Análisis (no runtime) | `optimizacion-de-tokens.md` | Barrido de costo de tokens del producto y matriz de decisión de la promesa "token-economy". |

Entry point único: `src/cli/index.js` (`bin.ancleto` y `bin.aspec`). No hay servidor ni base
de datos propia más allá de `.ancleto/memory.db`. Evidencia: `package.json`, pack Repomix
(firmas de `src/**`), `.discovery-map.json`.

## Componentes y responsabilidades

- **CLI (`src/cli/index.js`)**: registra el proyecto en `~/.config/ancleto/projects.json`,
  resuelve agente/IDE y tier, materializa assets en el destino nativo del host
  (`AGENT_TARGETS`) delegando la adaptación de frontmatter en
  `src/core/adapters/frontmatter.js`, aplica el overlay del perfil `test`, fusiona templates
  y bloques `<!-- LOCKED -->`, configura MCP (propio + caveman; engram opcional) y expone los
  subcomandos. La **directiva de uso de caveman es host-scoped**: se materializa solo si la
  config MCP del host contiene la tool de compresión (`hostSupportsCompression` /
  `hostConfigHasCompression`), nunca en texto compartido entre hosts. **Escrituras de memoria
  desde el CLI**: `memoryImport` llama a `refreshWorkingContextOnWrite` (compare-based) tras
  `engine.importNodes`; `memoryMerge` hace lo mismo tras un merge real (derivando la raíz de
  `resolveMemoryProjectRoot(dbPath)`), y si ese refresh falla sale con código ≠ 0 informando
  que el merge **sí** se aplicó; `memoryDoctorCmd` emite una línea advisory
  `Working-context: <estado>`. Evidencia: `src/cli/index.js`,
  `src/core/memory/working-context.js`, `aspec/specs/memory-ops/spec.md`.
- **Entorno de máquina**: `detectMachineFacts` deriva plataforma, release, arquitectura, shell
  (con `shell_source`), EOL (con `eol_source`) y disponibilidad de `rg`, `node`, `npm`, `git` y
  `python` (sin versiones ni `PATH`). La disponibilidad exige ser **resoluble e invocable**:
  el candidato resuelto en `PATH` se ejecuta con `--version` bajo un timeout de 2 s por intento
  y un presupuesto acumulado de 10 s; en `win32` los shims `.cmd`/`.bat` se enrutan por
  `process.env.ComSpec` y la guarda `EINVAL` de Node queda **inconclusa**, nunca `bloqueado`.
  `renderMachineEnv` compone un bloque determinista; `writeMachineEnv` **no reescribe** si solo
  cambió `generated_at`; `ensureMachineEnvExclusion` agrega el path repo-root-relative exacto
  (`<prefix>.ancleto/machine-env.md`) a `info/exclude` y lo verifica con
  `check-ignore --no-index`; `materializeMachineEnv` es best-effort y nunca lanza.
  `ancleto check` advierte si el artefacto quedó trackeado. Evidencia:
  `src/core/machine-env.js`, `aspec/specs/machine-environment/spec.md`.
- **Adaptador de frontmatter**: `adaptFrontmatter(content, host, assetKind, name)` es una
  función pura sin E/S. `opencode` (y skills de cualquier host) es identidad; `claude`,
  `vscode` y `copilot` dropean claves no portables; `antigravity` y `commandcode` transforman
  a su convención; `cursor`/`roo` son passthrough con aviso a stderr; host desconocido es
  passthrough con aviso.
- **Discovery**: `--check` reporta estado del seed (`READY`/`STALE`/`PARTIAL`/`MISSING`) con
  `impact` (`none`/`minor`/`material`) y `affectedDocs`; el pack (Repomix) se genera on-demand.
- **Affected-set**: `computeAffectedSet({ rootDir, seeds })` devuelve `{ seeds, affected,
  unresolved, externalCount }`; `affected` es la clausura de dependientes (más las semillas)
  sobre el grafo de imports. Se invoca read-only vía `ancleto affected` y es el scope de review
  del ciclo SDD. Detalle: `units/discovery-engine.md`.
- **Memoria**: 3 tools (`searchMemory`, `recordRule`, `recordDecision`) sobre SQLite + FTS5 con
  supersesión atómica por `memory_key` y **procedencia `source` runtime-owned**
  (`mcp:ancleto-memory`, `cli:import`, `runtime`, `agent:<rol>`), expuesta como MCP stdio
  (`ancleto mcp`). Los subcomandos `memory export|import|gc|snapshot|merge|context|list|doctor`
  respaldan/restauran nodos activos, **copian la base con historial**, **consolidan duplicados
  por supersesión**, materializan el bloque activo, lo listan en modo read-only y verifican
  integridad. Detalle: `units/memory-engine.md`.
- **Doctor read-only**: `memoryDoctor` abre la base con `{ migrate: false, readonly: true }` por
  defecto: sin checkpoint, sin DDL y sin `INSERT` sobre FTS. Mantiene los cuatro nombres de
  check (`Integridad DB`, `Indice FTS5`, `Reglas activas (unicidad)`, `Checkpoint WAL`);
  `Indice FTS5` distingue índice ausente (falla), sombra no consultable (omitido) y comparación
  `memory_fts_docsize` vs `memory_nodes`; `Checkpoint WAL` reporta el estado observable del
  `-wal` sin checkpointear. `--rebuild` es el único camino que escribe. Evidencia:
  `src/core/memory/doctor.js`, `aspec/specs/memory-ops/spec.md`.
- **Snapshot**: `snapshotDatabase(dbPath, outPath, { overwrite })` abre la fuente en read-only,
  copia con `VACUUM INTO` (estado commiteado, WAL incluido, historial completo), verifica con
  `quick_check` y reemplaza el destino solo tras tener la copia verificada en un temporal del
  mismo directorio; en Windows aparta el destino previo a un backup y lo restaura si el
  movimiento final falla. Usa identidad de archivo (`realpathSync.native`) para rechazar
  `target == source` también por alias de ruta. Evidencia: `src/core/memory/snapshot.js`.
- **Working-context**: un único render (`renderWorkingContextBlock` en
  `src/core/memory/working-context.js`) sirve al refresh de lifecycle, al refresh on-write MCP
  y al on-write CLI; en **día-cero** materializa la topología (`<ProjectTopology>`) aunque no
  exista DB, sin abrir el motor. `checkWorkingContextFreshness` compara el bloque renderizado
  contra `.ancleto/working-context.md` con normalización acotada (CRLF, espacios finales, salto
  final). Evidencia: `src/core/memory/working-context.js`, `src/cli/index.js`.
- **Aviso de overflow**: cuando `buildWorkingContext` trunca el bloque de reglas (`MAX_TOKENS`
  2.000 × `CHARS_PER_TOKEN` 4 = 8.000 caracteres), anexa **incondicionalmente**
  `<ContextOverflowWarning>` con el conteo de reglas omitidas y la instrucción de **delegar un
  Recall a `@memory-keeper`**; el texto **no nombra** `searchMemory`. Evidencia:
  `src/core/memory/engine.js`, `aspec/specs/memory-engine/spec.md`.
- **Reporte de fallos**: `ancleto stats failures` lee solo lectura la tabla `part` de opencode,
  clasifica cada fallo (`env`, `check`, `tool`, `unknown`), agrupa por proyecto/herramienta/
  clase/esqueleto y aplica enmascarado de secretos/rutas. Es la superficie de medición de la
  mejora de entorno (`machine-environment`). Evidencia: `src/cli/index.js`
  (`statsFailuresCommand`), `aspec/specs/session-failure-report/spec.md`.
- **Contratos de prompt del orquestador** (`agents/orchestrator.md`): **intake de sesión**,
  **techo de lecturas** (3 archivos + exenciones), **trigger de Recall** ante
  `<ContextOverflowWarning>` y **checkpoint de contrato** tras `@spec-writer`: se presenta el
  contrato del cambio (intención, alcance, Requirement, riesgos, decisión de arquitectura,
  validación prevista, paths autorizados) en menos de una pantalla, la aprobación autoriza solo
  la implementación y una enmienda es obligatoria si cambian alcance, riesgo o arquitectura.
  Evidencia: `agents/orchestrator.md`, `aspec/specs/prompt-contracts/spec.md`.
- **Ciclo SDD**: comandos `/cleto-*` que consumen `aspec/changes/<name>/` y las skills nativas;
  no requieren binario externo. Incluye `/cleto-review` (calidad), `/cleto-security`,
  `/cleto-update` y `/cleto-transplant`.

## Flujos principales

1. **Alta de proyecto** — `ancleto init` (wizard en TTY): escribe `.ancletorc`, scaffold
   `aspec/` (+ `testspec/` con `--profile test`), copia `AGENTS.md`/`PRODUCT.md` preservando lo
   existente (reconciliando bloques planos legados), importa `openspec/` si existe, instala
   assets por host (+ overlay del perfil), aplica el tier a los agentes locales, configura el
   MCP del host (resuelto **antes** de escribir los agents), materializa
   `.ancleto/working-context.md` y `.ancleto/machine-env.md` (con su exclusión local).
   Evidencia: `src/cli/index.js`, `README.md`, `src/core/machine-env.js`.
2. **Instalación/actualización** — `ancleto install|update|upgrade`: materializa `agents/`,
   `commands/`, `skills/`, `templates/` en el destino del host, adapta frontmatter, fusiona MCP
   de forma no destructiva, importa `openspec/`, re-aplica bloques `LOCKED` (con reconciliación
   previa) y regenera `working-context.md` + `machine-env.md`. Evidencia: `src/cli/index.js`,
   `README.md`.
3. **Descubrimiento** — `ancleto discovery --check` (estado) y `ancleto discovery
   [--compress]` (pack Repomix con ignores del tier); el seed lo redacta la skill
   `ancleto-technical-discovery`. Evidencia: `src/cli/index.js`, `src/core/repomix-tier.js`.
4. **Memoria entre sesiones** — el orquestador inyecta `<ProjectMemoryRules>` y
   `<ProjectTopology>` **desde el día cero**; las reglas se recuperan proactivamente y las
   decisiones **vía `@memory-keeper`** (el orquestador no llama `searchMemory`). Si el bloque se
   trunca, el `<ContextOverflowWarning>` dispara **un único Recall** a `@memory-keeper` antes de
   delegar cualquier otra etapa. `.ancleto/working-context.md` se regenera en `init`,
   `install --project`, `upgrade`, `memory context --out`, **tras escrituras MCP** (filtradas
   por `shouldRefreshWorkingContext`), **tras escrituras CLI** (`memory import` y
   `memory merge`, compare-based) y `memory doctor` reporta su frescura como línea advisory.
   Evidencia: `agents/orchestrator.md`, `src/core/memory/working-context.js`,
   `src/cli/index.js`, `src/core/memory/engine.js`.
5. **Mantenimiento de memoria** — `memory doctor` audita sin mutar (por defecto);
   `memory snapshot --out <archivo.db>` produce una copia restaurable con historial;
   `memory merge --target <key> --sources <k1,k2,...>` consolida duplicados supersediendo cada
   source activa hacia el target en una sola transacción (`--dry-run` no escribe);
   `memory export|import|gc` mueven/purgan nodos activos. Evidencia:
   `src/core/memory/{snapshot,doctor,engine}.js`, `src/cli/index.js`,
   `aspec/specs/memory-ops/spec.md`.
6. **Entorno de máquina** — en cada ciclo de vida el CLI detecta hechos locales y escribe
   `.ancleto/machine-env.md`; si el contenido (sin `generated_at`) no cambió, no reescribe.
   Después agrega/verifica la exclusión en `info/exclude` (sin tocar `.gitignore`). Los agentes
   leen el archivo antes de ejecutar comandos; el orquestador incluye el bloque en cada
   delegación con `bash: true` y esa lectura no consume su techo de 3 archivos. Evidencia:
   `src/core/machine-env.js`, `agents/*.md`, `aspec/specs/machine-environment/spec.md`.
7. **Ciclo de change** — `/cleto-new` → `/cleto-propose` → **checkpoint de contrato** →
   `/cleto-apply` → `/cleto-verify` → `/cleto-archive`, con `/cleto-review`/`/cleto-security`
   para calidad y seguridad, `/cleto-update` para actualizar artifacts ante cambios de definición
   y `/cleto-transplant` para mudar proyectos entre máquinas. El proposal registra sus decisiones
   duraderas en `## Decisiones` (bloque de seis campos o forma de una línea); un tradeoff que
   aparece durante la implementación se apendea ahí por `@spec-writer`, con enmienda del contrato
   solo si cambia alcance, riesgo o arquitectura. Con perfil `test`, el orchestrator rutea lo
   test-only al tester ampliado (`cleto-test-*`). Evidencia: `commands/`, `skills/`,
   `agents/spec-writer.md`, `agents/orchestrator.md`, `aspec/changes/archive/`.
8. **Cierre del change (pipeline de throughput)** — el tester computa el `affected-set` con
   `ancleto affected` (dependientes, no solo archivos tocados) y produce un Validation Ledger
   completo y cerrado; el orquestador arma/verifica el cierre y delega el review con el
   `affected-set` como scope. Tras la aprobación de archive y con candidato real de memoria,
   delega `@documenter` ∥ `@memory-keeper`; el cierre hace **como máximo una** llamada a
   memoria. Evidencia: `agents/orchestrator.md`, `agents/tester.md`, `agents/reviewer.md`,
   `aspec/specs/prompt-contracts/spec.md`, `aspec/specs/review/spec.md`.
9. **Arranque de sesión del orquestador** — intake read-only (changes activos excluyendo
   `archive/`; `git status --short` delegado a `@technical-discovery` sólo si el pedido toca
   el estado del repo; silencio si no hay nada que reportar) → **Active Change Check** → triage
   (`spec-required` / `direct-test-only` / `direct-implementation` / `clarification-needed`) →
   ejecución delegada, con el techo de 3 archivos. Evidencia: `agents/orchestrator.md`,
   `agents/technical-discovery.md`, `aspec/specs/prompt-contracts/spec.md`.
10. **Validación local** — contrato **declarativo**: se corre solo lo declarado en `PRODUCT.md`
    → `## Project Commands` (aquí `npm run lint` y `npm test`). Evidencia: `AGENTS.md`
    (`LOCKED: validation-commands`), `PRODUCT.md`, `package.json`.

## Estado del repositorio

Versión `0.16.0` en rama `development`; tag **anotado** `v0.16.0` y HEAD `7388482` **1 commit por
delante**. `CHANGELOG.md` cubre hasta `0.16.0`, versión que publicó PR-1 (snapshot, doctor
read-only, merge). El árbol de trabajo tiene **PR-2 (`decisiones-y-contrato-checkpoint`) sin
commitear**: `agents/orchestrator.md`, `agents/spec-writer.md`, seis `skills/**` y
`test/content-guards.test.js` modificados, y la carpeta del change untracked; `src/**` está limpio.
Dogfooding histórico: el framework fue inicializado sobre este repo; este checkout **sí materializa
`.ancletorc` y `.opencode/`** (ambos gitignored, no versionados) y persiste `AGENTS.md`,
`PRODUCT.md`, `aspec/` y `.ancleto/memory.db`. El tier resuelto es **`minimo`** vía
`.opencode/.ancleto-tier`. **`.ancleto/machine-env.md` ya existe** (generado el 2026-10-29) y los
mirrors `.opencode/` están regenerados. Los **changes activos** son `ancleto-vscode-extension` y
`decisiones-y-contrato-checkpoint` (implementado, pendiente de review final y archive); el más
reciente archivado es `2026-10-28-reingenieria-memoria-first`. Evidencia: `.gitignore`,
`.discovery-map.json`, `ancleto discovery --check`, `git describe --tags`, `aspec/changes/`.
