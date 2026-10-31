---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-10-31T00:24:30Z
pluginVersion: 0.17.1
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Reglas estructurales (declaradas)

1. **Zero-Dependencies de runtime + Node ≥ 24.** Sin `better-sqlite3` ni binarios nativos; el
   motor usa `node:sqlite` (`DatabaseSync`). `eslint` y `globals` existen **solo como
   devDependencies**: el contrato `dependencies` sigue ausente/vacío. Cualquier dependencia de
   runtime nueva rompe el contrato de costo y distribución. Evidencia: `package.json`,
   `eslint.config.js`, `DESIGN-memory-engine-v0.2.0.md`.
2. **Una sola versión activa por `memory_key`.** La supersesión es atómica en transacción
   `BEGIN IMMEDIATE`: marca el nodo previo `superseded` e inserta el nuevo; hay índice único
   parcial sobre nodos activos. Evidencia: `DESIGN-memory-engine-v0.2.0.md`,
   `src/core/memory/engine.js`.
3. **Solo 3 tools expuestas al LLM** (`searchMemory`, `recordRule`, `recordDecision`).
   `source`, `confidence`, `status` e `id` los gestiona el runtime y **nunca** aparecen en el
   JSON Schema (`additionalProperties: false`; args forjados se ignoran). Las operaciones
   export/import/gc/snapshot/merge son **subcomandos CLI**, no tools del LLM. Evidencia:
   `DESIGN-memory-engine-v0.2.0.md`, `src/core/memory/tools.js`.
4. **Ciclo de vida del contexto.** *Rules* se recuperan proactivamente y se inyectan en el
   system prompt dentro de `<ProjectMemoryRules>` como **datos no confiables**; *decisions* se
   recuperan reactivamente con `searchMemory`. El **orquestador no ejecuta esa tool**: su
   contrato de "Team Memory" le prohíbe llamar `searchMemory`/`recordRule`/`recordDecision` y
   delega la recuperación en `@memory-keeper`, único agente dueño de `.ancleto/memory.db`.
   Evidencia: `DESIGN-memory-engine-v0.2.0.md`, `agents/orchestrator.md`,
   `aspec/specs/memory-engine/spec.md`.
5. **Frontera repo vs agente.** La memoria del repo vive en `.ancleto/memory.db` (se comparte
   con el equipo); la memoria del agente (p. ej. engram) es de sesión. Una entrada vive en una
   sola. Evidencia: `README.md`, `AGENTS.md` (`LOCKED: memory-boundary`).
6. **Merge no destructivo de templates + reconciliación de superficies legadas.**
   `mergeTemplateInto(source, local, filename)` es el **punto único** de merge de los templates
   raíz (`AGENTS.md`/`PRODUCT.md`, `TEMPLATES` en `src/cli/index.js`); lo invocan
   `install`/`update`/`upgrade` (vía `copyTemplates`) **y** `import` (`importCmd`). Antes de
   `mergeLocked` ejecuta `reconcileLegacyBlocks`: elimina las listas planas legadas cuya firma
   coincide **exactamente** (match por líneas completas, tolerando CRLF/espaciado) y avisa sin
   tocar si el bloque fue personalizado/extendido. Seguro, idempotente y sin pasos manuales.
   `mergeLocked` re-aplica el interior de los bloques `<!-- LOCKED: name -->`, preserva lo
   EXTENSIBLE, inserta bloques nuevos en el ancla correcta y **no toca** archivos con tags
   malformados (avisa). No debe existir una ruta que mergee `TEMPLATES` sin reconciliar.
   Evidencia: `src/cli/index.js`, `templates/AGENTS.md`,
   `aspec/specs/prompt-contracts/spec.md`.
7. **Contrato de validaciones declarativo.** El proyecto declara sus comandos en `PRODUCT.md` →
   `## Project Commands`; esa es la **fuente única**. Las validaciones corren **solo** esos
   comandos: si falta una validación, se saltea y se registra la omisión; **nunca** se inventa
   runner/linter/formatter/typechecker. El **format check** corre solo si hay formatter
   declarado; si no, se reporta `not-configured`. Los **tests** se corren por el comando
   declarado o con **rutas explícitas**; nunca `node --test` pelado. La política vive en
   `LOCKED: validation-commands`. Evidencia: `AGENTS.md`, `templates/AGENTS.md`,
   `PRODUCT.md`, `aspec/specs/prompt-contracts/spec.md`.
8. **Instalación de assets por host, dueño único `AGENT_TARGETS` + `installAgentAssets`.**
   `AGENT_TARGETS` es la **fuente única de rutas** (skills/agents/commands con `dir` y `ext`;
   `null` = asset no soportado). `installAgentAssets` materializa el destino nativo y devuelve
   las rutas escritas; `unionInstalledPaths` las acumula en `installedPaths`. Antigravity no
   tiene dir de commands: sus `/cleto-*` se empaquetan como `.agents/skills/<n>/SKILL.md`
   (`package: 'skill-dir'`) y **no** se registran en `installedPaths.commands`. Cursor y Roo solo
   tienen skills. Un asset no soportado no se escribe y avisa por stderr. Evidencia:
   `src/cli/index.js`, `units/cli-install.md`.
9. **Adaptación de frontmatter: dueño único y módulo puro.** Toda transformación de frontmatter
   vive en `src/core/adapters/frontmatter.js` (`adaptFrontmatter(content, host, assetKind,
   name) → string`): función pura, sin E/S ni estado global. `src/cli/index.js` la importa y
   **no** define adaptadores locales. Dispatch: `opencode` y toda skill → identidad;
   `claude`/`vscode`/`copilot` + agents → dropean `AGENT_ADAPTER_DROP` (`mode`, `color`,
   `temperature`, `permission`, `model`, `tools`); `antigravity` + agents → transformación
   propia; `commandcode` + agents → transformación propia; `cursor`/`roo` → identidad + aviso;
   host desconocido → identidad + aviso. Evidencia:
   `src/core/adapters/frontmatter.js`, `aspec/specs/skill-frontmatter-adapters/spec.md`.
10. **Antigravity: transformación determinista y conjunto cerrado de tools.** Orden de emisión:
      `name`, `description`, `tools` (siempre lista), `mainAgent`, `subagent`, `model: inherit`,
      `commandExecutionPolicy: sandbox`, `mcpServers`, `skills`, extras. `mode` → flags:
      `primary`→(`true`,`false`),`subagent`→(`false`,`true`), sin `mode`→(`true`,`true`). Solo se
      emiten los 5 ids verificados: `read→view_file`, `edit→replace_file_content`,
      `grep→grep_search`, `bash→run_command`, `todowrite→manage_task`. Toda otra clave se omite
      con aviso a stderr no bloqueante; un id inexistente cuelga el subagent (Known Issue).
      `skill` se saltea en silencio; `call_mcp_tool` está **prohibido**; el uso de MCP se expresa
      por `mcpServers`/`.agents/mcp_config.json`. Evidencia:
      `src/core/adapters/frontmatter.js`, `units/cli-install.md`.
11. **Command Code: layout nativo y semántica de `tools` invertida.** El host `commandcode`
      (CLI `cmd`) usa `.commandcode/{skills,agents,commands}`. `adaptCommandCodeFrontmatter`
      inyecta `name`, preserva `description`, elimina `mode`/`color`/`temperature`/`permission` y
      **omite** `model` (el host hereda el modelo de sesión; el tier no lo reescribe). `tools`
      sale como **lista** de ids verificados (`COMMANDCODE_TOOL_MAP`); las tools de memoria se
      emiten con la convención MCP del host (`COMMANDCODE_MCP_TOOL_MAP` →
      `mcp__ancleto-memory__<tool>`). Clave sin id verificado → omisión con aviso. **Inversión de
      default**: en Command Code `tools` omitido significa "ninguna tool" (en opencode, "todas"),
      por eso un origen sin `tools` emite `tools: "*"`. El MCP de proyecto vive en `.mcp.json`.
      Evidencia: `src/core/adapters/frontmatter.js`, `README.md`, `CHANGELOG.md` (`0.12.1`),
      `aspec/specs/commandcode-support/spec.md`.
12. **`ancleto check` valida el frontmatter real contra el adaptador.** Por cada `.md` de un
      directorio de agents instalado, compara el instalado contra
      `adaptFrontmatter(origen, host, 'agents', name)` (con la simulación del `model:` del tier
      en opencode y la nota de picker en copilot). La divergencia se reporta como **warning (⚠),
      no bloqueante**: solo los archivos faltantes cambian el exit code. Siguiendo el manifiesto
      multi-host (`installedHostsFromPaths`), aplica el adaptador de cada host. Evidencia:
      `src/cli/index.js` (`checkAgentsFrontmatter`), `test/adapters-frontmatter.test.js`.
13. **Export/import/gc de memoria (`memory-ops`).** `exportActive()` devuelve solo nodos activos
      con `{memory_key, type, content, justification, scope, createdAt}` y **sanitiza paths
      absolutos** a `<redacted>`; los superseded no se exportan. `importNodes(json)` valida el
      schema antes de procesar y **aborta el batch entero** si una entrada es inválida; upsert por
      `memory_key`: inserta si no existe, supersede solo si el `createdAt` del JSON es más
      reciente, y **no reactiva** nodos superseded. `gcSuperseded({days, dryRun})` purga
      superseded con antigüedad mayor al umbral (default 30 días, medido con `created_at` como
      proxy porque no existe `superseded_at`); tras el DELETE hace `VACUUM`+`REINDEX` best-effort.
      Evidencia: `src/core/memory/engine.js`, `src/cli/index.js`,
      `aspec/specs/memory-ops/spec.md`.
14. **Migración/importación `openspec/` → `aspec/` no destructiva.** `migrateLegacyOpenspec`
      copia recursiva con `force: false`, escribe el marcador `.migrated-from-openspec` y conserva
      `openspec/` como backup; si `aspec/` ya tiene contenido real avisa y no migra.
      `detectLegacyOpenSpec` clasifica (`none`/`legacy`/`external`); lo externo pide confirmación
      (default No, `--yes` para script) e importa sin pisar el `AGENTS.md` local. Punto único
      `maybeImportOpenspec`, invocado por `init`, `install --project` y `upgrade`. Evidencia:
      `src/cli/index.js`, `aspec/specs/aspec-bootstrap/spec.md`.
15. **MCP de host, dueño único `setupHostMcp`.** Excepciones de host-MCP: antigravity mergea
      `.agents/mcp_config.json` (`{ "mcpServers": { "<n>": { command, args, env } } }`),
      commandcode mergea `.mcp.json` (`{ mcpServers: { <n>: { transport: 'stdio', command, args,
      env? } } }`) y copilot mergea `copilot-mcp.json`; los tres de forma **no destructiva**
      (preservan `mcpServers` y claves top-level, no pisan homónimos; un JSON inválido avisa sin
      escribir). El resto conserva `mergeMcp` sobre `opencode.json`. `init` e `install`
      configuran MCP igual; `--no-mcp` es el escape. Evidencia: `src/cli/index.js`, `README.md`.
16. **Perfil `test`: overlay, no fork.** `installProfileOverlay` reinstala
      `profiles/test/agents` + `commands` sobre los destinos nativos del host (misma ext y
      adapter que la base) y `copyTemplates` lee `profiles/test/templates/`; el paquete base queda
      intacto y el tier sigue ortogonal. Evidencia: `src/cli/index.js`, `profiles/test/`,
      `aspec/specs/test-profile/spec.md`.
17. **Portabilidad = intención, no rutas.** `export` genera bundle + `manifest.json` con solo
      nombres+tipos de MCP (nunca `command`/`args`); aborta si el manifiesto contiene absolutos.
      `import` aplica portables y **regenera** entradas con el host local (`mcpCommandBroken`),
      sin pisar sanas, y cierra con `doctor`. Nunca se exportan credenciales, `service.json`,
      global ni `memory.db` (la memoria tiene su propio export JSON y, ahora, un snapshot
      binario). Evidencia: `src/cli/index.js`, `aspec/specs/project-portability/spec.md`.
18. **Linter mínimo: 4 reglas, sin estilo.** `eslint.config.js` es flat config (array) con
      `ecmaVersion: latest`, `sourceType: module`, globals de Node y exactamente `no-undef`,
      `no-unused-vars` (con `argsIgnorePattern`/`caughtErrorsIgnorePattern` `^_`), `eqeqeq`
      (`always`) y `no-dupe-keys`. Sin Prettier, sin plugins. Evidencia: `eslint.config.js`,
      `test/linter-config.test.js`, `aspec/specs/linter-standard/spec.md`.
19. **Patrón "CLI materializa + agente lee".** `ancleto memory context` escribe
      `.ancleto/working-context.md`; el orquestador lo lee como datos no confiables sin `bash`.
      El mismo patrón rige `.ancleto/machine-env.md`: el CLI detecta y escribe, los agentes leen.
      Evidencia: `agents/orchestrator.md`, `src/core/memory/working-context.js`,
      `src/core/machine-env.js`.
20. **Compresión (caveman) host-scoped, con compuerta de medición** (`token-budget`). El CLI
      configura el MCP de compresión por defecto cuando el binario está disponible, como
      **configuración del host** (solo `opencode`/`antigravity`). La **directiva de uso** se
      materializa únicamente en superficies de un host cuya config MCP incluye la tool
      (`hostSupportsCompression`/`hostConfigHasCompression`, `CAVEMAN_USAGE_NOTE`), **nunca** en
      texto compartido: "donde no hay tool, no hay instrucción". El default es **reversible a
      opt-in** si `ancleto stats` no muestra un descenso neto. Evidencia: `src/cli/index.js`,
      `aspec/specs/prompt-contracts/spec.md`.
21. **Día-cero del working-context** (`token-budget`). El CLI **no** omite materializar
      `.ancleto/working-context.md` por ausencia de `.ancleto/memory.db`: si existe
      `.discovery-map.json`, escribe el bloque `<ProjectTopology>` (creando `.ancleto/` si falta)
      **sin abrir el motor**. Render único (`renderWorkingContextBlock`) compartido por el refresh
      de lifecycle y `memory context`; `buildWorkingContext` conserva firma, default `cwd` y
      resultado `null` sin topología ni reglas. Evidencia: `src/cli/index.js`,
      `src/core/memory/working-context.js`, `aspec/specs/memory-engine/spec.md`.
22. **Procedencia `source` runtime-owned y compuerta de validación**
      (`memory-actor-provenance`, actualizada por `MEM-03`). `source` se resuelve
      exclusivamente desde `context.source || 'runtime'`, **nunca** desde args del caller, con
      vocabulario estable: `mcp:ancleto-memory` (tools MCP), `cli:import` (import del CLI),
      `runtime` (default programático y fixtures) y `agent:<rol>` (solo si un runtime confiable
      lo provee). Se expone en `listNodes`/`memory list --json` pero **no** en `searchMemory` ni
      en los JSON Schema MCP. La procedencia ahora **decide una única cosa**: si la escritura
      pasa por la validación de refs. La exención es el valor exacto `runtime`; cualquier otro
      valor se valida fail-closed. Sigue sin ser un canal de autorización/autenticación.
      Evidencia: `src/core/memory/engine.js:438-475`, `src/core/memory/mcp-server.js:16`,
      `aspec/specs/memory-engine/spec.md`.
23. **Fuente única de reglas compartidas + guards por comportamiento** (`token-budget`). Toda
      regla que se declaraba en skill y agente pasa a tener **un único hogar canónico**: las
      transversales viven en `AGENTS.md` (bloques `LOCKED`) y las demás superficies **referencian**
      sin repetir texto. `test/content-guards.test.js` aserta **keywords de comportamiento** y
      presencia de salvaguardas, no redacción literal. Evidencia: `AGENTS.md`,
      `templates/AGENTS.md`, `aspec/specs/prompt-contracts/spec.md`.
24. **Actualización de artifacts de un change (`ancleto-update`).** La skill
      `ancleto-update` (`/cleto-update`) actualiza los artifacts de un change existente ante
      cambios de definición con merge no destructivo. Clasificación vigente por artifact dueño:
      requisito/comportamiento → `specs/<capability>/spec.md`; **decisión de diseño →
      `proposal.md ## Decisiones`**; alcance → `proposal.md`; trabajo nuevo → `tasks.md`.
      `design.md` **no** se crea ni se actualiza. Detecta drift entre delta specs y specs
      principales y pregunta el modo de escritura (in-place vs `rev2`). Evidencia:
      `skills/ancleto-update/SKILL.md` (`### 4`), `docs/skill-ancleto-update.md`,
      `aspec/specs/artifact-update/spec.md` (fuente de verdad ya mergeada: "decisión de diseño →
      `proposal.md ## Decisiones`"; `design.md` nunca se crea ni se actualiza).
25. **Affected-set determinístico por grafo de imports (`throughput-pipeline`).** El conjunto
      afectado es la **clausura transitiva de dependientes** sobre el grafo de imports, sembrada
      por los `task-owned files` e incluyendo siempre los archivos tocados; es **determinístico**,
      **objetivo de verificación** de `@tester` y **scope de review** de `@reviewer`. Vive en
      `src/core/affected-set.js` (zero-dep) y se expone **read-only** por
      `ancleto affected [--cwd <dir>] [--json] <archivo...>`. Cobertura: formas estáticas `import`,
      `import … from`, `export … from`, `require(...)` e `import(...)` con literal puro, sobre
      `.js/.mjs/.cjs/.ts/.tsx`; respeta los ignores de topología. **Taxonomía cerrada (4
      categorías)**: (1) relativo resoluble → arista; (2) no relativo (paquete/builtin/**alias**)
      → `externalCount`, sin arista ni `unresolved`; (3) llamada `import(...)`/`require(...)` con
      **argumento no literal** → `unresolved`; (4) relativo irresoluble → `unresolved`. El
      **clasificador es conservador por argumento**. `externalCount` es **dato informativo**. Si
      el proyecto declara su propio mecanismo en `PRODUCT.md` → `## Project Commands`, ese tiene
      prioridad. Evidencia: `src/core/affected-set.js`, `src/cli/index.js` (`affectedCommand`),
      `aspec/specs/prompt-contracts/spec.md`, `test/affected-set.test.js`.
26. **Pipeline de mayor throughput (`throughput-pipeline`).** Cuatro contratos de prompt reducen
      round-trips sin degradar salvaguardas: (a) **cierre en paralelo**: tras la aprobación de
      archive y **con candidato real**, `@orchestrator` delega `@documenter` ∥ `@memory-keeper`
      (superficies disjuntas `aspec/` vs `.ancleto/memory.db`); (b) **reviewer sin rebote**:
      `@tester` produce un **Validation Ledger completo y cerrado**; (c) **affected-set** como
      scope; (d) **memoria en un solo paso**: como máximo **una** llamada, solo con candidato
      real. **La promoción de decisiones aprobadas queda fuera de ese presupuesto** (regla 44).
      Evidencia: `agents/{orchestrator,tester,reviewer,memory-keeper}.md`,
      `aspec/specs/prompt-contracts/spec.md`, `aspec/specs/review/spec.md`,
      `aspec/changes/archive/2026-10-15-throughput-pipeline/`.
27. **Refresh on-write del working-context en **ambas** superficies**
      (`2026-10-17-memory-cli-writes-refresh-working-context`, archivado). El bloque
      `<ProjectMemoryRules>` de `.ancleto/working-context.md` se regenera tras cualquier escritura
      que pueda alterarlo: (a) **MCP** — filtrado por `shouldRefreshWorkingContext(result)`;
      (b) **CLI** — `refreshWorkingContextOnWrite(engine, projectRoot, scope)`,
      **compare-based**: reescribe el archivo **solo si** el bloque renderizado difiere del
      contenido en disco, no crea un archivo vacío y **reusa la conexión abierta**. `memory
      import` y, desde PR-1, `memory merge` lo invocan dentro de un `try/catch` aislado. La
      regeneración usa el **mismo camino único de render** (`renderWorkingContextBlock`).
      Evidencia: `src/cli/index.js` (`memoryImport`, `memoryMerge`),
      `src/core/memory/working-context.js`,
      `aspec/changes/archive/2026-10-17-memory-cli-writes-refresh-working-context/`,
      `aspec/specs/memory-engine/spec.md`.
28. **Detección de staleness del working-context (advisory, no altera el exit code).**
      `checkWorkingContextFreshness(engine, projectRoot, scope)` renderiza el bloque esperado y lo
      compara (CRLF, espacios finales por línea, salto final) contra
      `.ancleto/working-context.md`, devolviendo `ok` / `ausente` / `desactualizado`. Es
      **read-only**: nunca reescribe el archivo. Se expone como línea `Working-context: <estado>`
      en `ancleto memory doctor`; el exit code sigue midiendo la integridad de la DB. Cuando no
      está `ok`, sugiere `ancleto memory context --out`. Evidencia:
      `src/core/memory/working-context.js`, `src/cli/index.js` (`memoryDoctorCmd`),
      `aspec/specs/memory-engine/spec.md`.
29. **Entorno de máquina: artefacto local, dueño único y exclusión sin `.gitignore`**
      (`2026-10-25-machine-environment-block`, archivado). `src/core/machine-env.js` es el
      **único dueño** de detectar, renderizar, escribir y excluir `.ancleto/machine-env.md`; ni el
      ciclo de vida ni `check` reimplementan formato, comparación o resolución de rutas. El
      artefacto **no** forma parte de `working-context.md` ni de `AGENTS.md` y `templates/AGENTS.md`
      no contiene valores de máquina. La escritura es idempotente y **no reescribe** si solo cambió
      `generated_at`. La exclusión usa `git rev-parse --show-toplevel` + `--show-prefix` para
      componer `<prefix>.ancleto/machine-env.md`, consulta `check-ignore --no-index` antes y
      después, y agrega **una** entrada a `git rev-parse --git-path info/exclude`, preservando el
      contenido previo byte a byte. Nunca toca `.gitignore`. `ancleto check` advierte si
      `git ls-files` muestra el artefacto trackeado, sin cambiar el exit code. Evidencia:
      `src/core/machine-env.js`, `aspec/specs/machine-environment/spec.md`.
30. **Entrega del entorno a todos los subagentes y precedencia.** Toda definición de agente
      instalada (10) contiene la instrucción canónica de leer `.ancleto/machine-env.md` antes de
      ejecutar comandos; si no existe, continúa con la guía genérica y reporta la ausencia. Si un
      comando falla por entorno, reporta el shell declarado y el comando textual en lugar de
      reintentar a ciegas. `agents/orchestrator.md` agrega `## Machine Environment`, incluye el
      bloque **verbatim** en cada delegación a un subagente con `bash: true` y **no** lo incluye
      para `@spec-writer`, `@reviewer` ni `@memory-keeper` (sin `bash`). La lectura proactiva de
      `machine-env.md` **no consume** el techo de 3 archivos. El bloque prevalece sobre
      indicaciones genéricas de shell, pero **nunca** sobre seguridad, autorización, validación,
      permisos o instrucciones explícitas del usuario. Evidencia: `agents/*.md`,
      `src/core/machine-env.js` (`## Hint`), `aspec/specs/machine-environment/spec.md`.
31. **Reporte de fallos de herramientas (`session-failure-report`, archivado 2026-10-25).**
      `ancleto stats failures` lee **solo lectura** la tabla `part` de la base de opencode y
      considera fallo a `state.status='error'` o a `metadata.exit` presente y distinto de 0.
      Clasifica con precedencia: `tool`, `env` (exit 127/9009 o señales de entorno/tooling),
      `check` (exit ≥ 1 legítimo) y `unknown`. Agrupa por proyecto, herramienta, clase y esqueleto
      estructural del comando; **nunca** imprime `title`, `output`, `state.error` ni el `input` de
      herramientas no-shell, y enmascara secretos, rutas y wrappers. Evidencia:
      `src/cli/index.js` (`statsFailuresCommand`, `failureBucketsQuery`),
      `aspec/specs/session-failure-report/spec.md`, `test/stats-failures.test.js`.
32. **El aviso de overflow nombra sólo capacidades que el orquestador tiene**
      (`2026-10-26-orchestrator-session-start`, archivado). `<ContextOverflowWarning>` se emite
      **incondicionalmente** al truncar el bloque de reglas y su texto **no** menciona
      `searchMemory`: indica delegar **un** Recall a `@memory-keeper` con el topic de la tarea.
      Conserva el conteo de reglas omitidas, el registro por consola y el presupuesto
      (`MAX_TOKENS = 2000` × `CHARS_PER_TOKEN = 4` = 8.000 caracteres). El **consumidor** es
      `@orchestrator`: el warning es trigger inmediato de **exactamente un** Recall a
      `@memory-keeper` **antes** de delegar cualquier otra etapa. La tool MCP `searchMemory` sigue
      expuesta al IDE (sin cambios de schema). Evidencia: `src/core/memory/engine.js`,
      `agents/orchestrator.md` ("Team Memory"), `aspec/specs/memory-engine/spec.md`,
      `aspec/specs/prompt-contracts/spec.md`, `test/memory-engine.test.js`,
      `test/content-guards.test.js`.
33. **Techo de lecturas del orquestador: 3 archivos + exenciones acotadas**
      (`2026-10-26-orchestrator-session-start`, archivado). Máximo **3 archivos de repositorio**
      no dirigidos; **exentos** (a) las lecturas proactivas de `.ancleto/working-context.md` y
      `.ancleto/machine-env.md` y (b) hasta **5 archivos que el usuario nombre explícitamente en
      un mensaje**, con tope **por mensaje**. Por encima del tope, la lectura se **delega** a
      `@technical-discovery` (sin conteo adicional). Evidencia: `agents/orchestrator.md`
      ("Repository Reading Limit" y "PROHIBITED ACTIONS"),
      `aspec/specs/prompt-contracts/spec.md`, `test/content-guards.test.js`.
34. **Intake de sesión con estado del árbol y changes activos**
      (`2026-10-26-orchestrator-session-start`, archivado). Al inicio de sesión el orquestador
      ejecuta un intake **read-only** que no carga contexto de repositorio: (1) lista una vez las
      entradas de `aspec/changes/` **excluyendo `archive/`**; (2) cuando el pedido **toca el estado
      del repositorio** delega **exactamente un** `git status --short` a `@technical-discovery` y
      usa su salida tal cual; (3) **reporta sólo diferencias**: con árbol limpio y sin change
      ajeno, **no emite nada**. El enabler es una allowlist mínima: `'*': deny` y **exactamente
      dos literales**: `'ancleto discovery --check'` y `'git status --short'`. Evidencia:
      `agents/orchestrator.md` ("## Session Intake"), `agents/technical-discovery.md`,
      `aspec/specs/prompt-contracts/spec.md`, `test/content-guards.test.js`.
35. **Disponibilidad de herramientas = resoluble **Y** invocable** (spec `machine-environment`).
      `detectMachineFacts` resuelve el candidato en `PATH` (en `win32`, con las extensiones de
      `PATHEXT` antes que el nombre exacto) y **lo ejecuta** con la bandera barata `--version`:
      solo un candidato que termina con éxito habilita `disponible`. Los intentos están acotados
      por `TOOL_PROBE_TIMEOUT_MS = 2000` y `TOOL_PROBE_BUDGET_MS = 10000`; `GIT_TIMEOUT_MS = 5000`
      para cada llamada a `git`. En `win32`, los shims `.cmd`/`.bat` se sondean por
      `process.env.ComSpec`; la guarda `EINVAL` de Node (CVE-2024-27980) es **inconclusa**. El
      veredicto es de **tres estados**: `ok`, `blocked` e `inconclusive`. Un veredicto inconcluso
      **nunca** habilita `disponible` y **no** agrega el sufijo `— bloqueado:`; un fallo real se
      publica con el texto saneado (sin ANSI/OSC ni caracteres de control, espacios colapsados,
      tope de 200 caracteres) y sin la versión observada. Evidencia: `src/core/machine-env.js`
      (`findExecutables`, `spawnProbe`, `probeExecutable`, `firstLine`),
      `aspec/specs/machine-environment/spec.md`, `test/machine-env.test.js`.
36. **Snapshot consistente con historial (`2026-10-28-reingenieria-memoria-first`, PR-1).**
      `snapshotDatabase(dbPath, outPath, { overwrite })` es el **dueño único** de la copia
      binaria. Usa `VACUUM INTO` sobre una conexión fuente **read-only, sin pragmas ni
      migraciones** (nunca `fs.copyFile` de un `.db` con WAL activo): copia el estado commiteado
      —WAL incluido— y el historial completo (`superseded` + `superseded_by`), a diferencia de
      `memory export`, que solo exporta activos y sanitiza. El destino viaja como **parámetro
      vinculado** a `VACUUM INTO`, no interpolado. Rechaza `target == source` por **identidad de
      archivo** (`realpathSync.native` + ancestro existente más cercano para rutas inexistentes),
      no por comparación de strings. Escribe en un temporal del **mismo directorio**, verifica
      `quick_check`, y solo entonces reemplaza: en Windows el destino previo se aparta a un
      `.bak-<uuid>` y se restaura si el movimiento final falla; si el snapshot ya quedó en su
      lugar, un `.bak` remanente no invalida la copia. Sin `overwrite`/`--force` un destino
      existente es error. Evidencia: `src/core/memory/snapshot.js`,
      `aspec/specs/memory-ops/spec.md` (requirement "Snapshot consistente de la base de memoria").
37. **`memory doctor` es estrictamente read-only por defecto (PR-1).** Abre la base con
      `openDatabase(dbPath, { migrate: false, readonly: true })`: sin checkpoint, sin DDL y sin
      `INSERT` sobre FTS. Los cuatro nombres de check se conservan (`Integridad DB`,
      `Indice FTS5`, `Reglas activas (unicidad)`, `Checkpoint WAL`).
      `Indice FTS5` tiene **tres estados**: índice ausente ⇒ **falla** (nunca `skipped`, baja
      `healthy`); tabla sombra `memory_fts_docsize` no consultable ⇒ **omitido** (no baja
      `healthy`, caso p. ej. FTS5 con `columnsize=0`); si no, compara `count(*)` de la sombra
      contra `memory_nodes` (el `count(*)` de `memory_fts` no sirve porque external-content lo
      resuelve contra `memory_nodes`). `Checkpoint WAL` reporta el tamaño observable del `-wal`
      sin checkpointear. El integrity-check completo (INSERT de control) y la reconstrucción
      quedan **solo** en `--rebuild`, el único camino que abre en escritura. Un error de apertura
      conserva los cuatro nombres y marca cada check no ejecutable como falla. Evidencia:
      `src/core/memory/doctor.js`, `src/cli/index.js` (`memoryDoctorCmd`),
      `aspec/specs/memory-ops/spec.md` (requirements "`memory doctor` estrictamente read-only" y
      "Reparación explícita con `memory doctor --rebuild`").
38. **Merge de nodos por supersesión, sin tabla nueva (PR-1).** `engine.merge({ target,
      sources, dryRun })` consolida duplicados supersediendo cada source **activa** hacia un
      target **activo**, reutilizando el statement `supersede` y el patrón transaccional de
      `recordNode` (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`). `validateMerge` —compartida por
      el engine de escritura y el read-only— falla cerrado antes de abrir transacción: target
      obligatorio y activo, sources lista no vacía, sin repetidas, distintas del target, activas
      y con el **mismo `type`**. No inserta nodos, no acepta contenido y no toca el filesystem.
      Bajo lock revalida target y sources: si una source deja de estar activa, `changes == 0` y se
      revierte todo. El engine read-only solo expone `merge` para `dryRun` (rechaza el real antes
      de tocar la conexión). El CLI `memory merge` refresca el working-context tras un merge real
      con el mismo render del import, derivando la raíz de `resolveMemoryProjectRoot(dbPath)`; si
      ese refresh falla, el merge **ya está commiteado** y el comando sale con código ≠ 0
      informando el hecho y cómo regenerar el bloque. Evidencia: `src/core/memory/engine.js`
      (`validateMerge`, `merge`, `buildReadonlyEngine`), `src/cli/index.js` (`memoryMerge`),
      `aspec/specs/memory-ops/spec.md` (requirements "Merge de nodos por supersesión" y
      "Comando CLI `ancleto memory merge`").

39. **Checkpoint de contrato tras `@spec-writer` (`agents/orchestrator.md`).** Cuando el change
     requirió especificación, el orquestador se detiene y presenta el **contrato del cambio**, no
     sus documentos: intención, alcance (dentro/fuera), Requirement nuevo o
     `spec:<capability>#<requirement>` citado como conformidad, riesgos con su mitigación, decisión
     de arquitectura (solo si existe), validación prevista (solo comandos declarados) y paths
     autorizados para implementar y commitear. Cabe en menos de una pantalla, **nunca** enumera
     filenames ni pide aprobar documentos, y no condiciona el stop a que exista `design.md`. La
     aprobación autoriza **solo** la implementación: archive y merge siguen siendo stops separados.
     Si cambian alcance, riesgo o arquitectura se presenta una **enmienda** y se espera una nueva
     aprobación explícita. Evidencia: `agents/orchestrator.md` (`### Contract Checkpoint`),
     `aspec/specs/prompt-contracts/spec.md`.
40. **`## Decisiones` en `proposal.md`, con dueño único del shape (`agents/spec-writer.md`).**
     Cada proposal registra sus decisiones duraderas —elección, alternativa descartada,
     justificación, refs y estado— en bloque de seis campos (`memory_key`, `Elección`,
     `Descartado`, `Justificación`, `Refs`, `Estado`) o en la forma de una línea
     `decisión | alternativa descartada | por qué | fuente/evidencia`, semánticamente equivalente.
     `Estado` ∈ `propuesto|aprobado|enmendado|descartado`. El shape se define **una sola vez** en
     `agents/spec-writer.md`; los seis generadores del proposal
     (`skills/ancleto-{propose,ff,continue,new,onboard}` y
     `skills/ancleto-upgrade/references/templates.md`) solo enuncian los keywords de comportamiento
     y referencian esa fuente. La sección se completa **también durante la implementación**: un
     tradeoff no previsto lo apendea `@spec-writer` (dueño del artifact) a pedido del orquestador,
     sin nueva aprobación salvo que cambie alcance, riesgo o arquitectura. Un detalle trivial de
     implementación no es decisión. Evidencia: `agents/spec-writer.md` (`## Decisions Section`),
     `agents/orchestrator.md`, `skills/ancleto-{propose,new,ff,continue,onboard}/SKILL.md`,
     `skills/ancleto-upgrade/references/templates.md`.
41. **Refs normalizadas dentro de `content` y validación fail-closed en `recordNode`
     (`MEM-03`, commit `90dba0d`).** No hay tabla ni columna nueva: las refs viajan en el propio
     `content` como un bloque `refs:` (línea `refs:` + lista con guion) y se resuelven sobre el
     texto indexado. Gramática cerrada: `spec:<cap>#<heading>`, `change:<slug>`,
     `path:<repo-relative>`, `commit:<sha>` y `workitem:<tracker>:<key>` (`engine.js:86-149`).
     `validateRefsForWrite` corre **antes** de la transacción (`engine.js:284-311`,
     `engine.js:461-475`): exige exactamente un bloque, al menos una ref, y falla cerrado ante
     gramática inválida, prefijo desconocido, `path:` absoluto o con `../`, ref irresoluble o
     ref ambigua. Una `decision` exige al menos `spec:` o `change:`; una `rule` exige al menos
     `path:`, `spec:` o `change:` (`engine.js:302-310`). La **única exención** es
     `context.source === 'runtime'` (`engine.js:468`). Los nodos existentes sin refs no se
     revalidan ni se backfillean. `importNodes` **no** pasa por `recordNode`: conserva su LWW y
     no valida refs (`engine.js:540-570`; `aspec/specs/memory-engine/spec.md`).
42. **Resolución de refs: `change:` exacto, `spec:` por heading canónico, `path:` relativo
     existente.** `change:<slug>` busca el change activo y un archive anclado exacto
     `YYYY-MM-DD-<slug>` (no un sufijo suelto), y reporta ambigüedad si hay más de un match
     (`engine.js:250-269`). `spec:<cap>#<heading>` lee
     `aspec/specs/<capability>/spec.md`, compara headings `### Requirement:` por forma exacta y
     canonizada (trim, minúsculas, sin diacríticos, sin backticks/`**`), deduplica por bloque y
     **reporta ambigüedad** en vez de elegir el primero (`engine.js:222-244`). `path:` debe ser
     relativo (rechaza absolutos y `..`), existir y ser archivo (`engine.js:271-282`).
     `commit:` y `workitem:` se validan por gramática; el motor no resuelve su existencia.
43. **Rechazo de secretos en el camino de escritura, sin eco del valor.** `recordNode` inspecciona
     `content` y `justification` con `looksLikeSecret` antes de abrir la transacción y rechaza
     claves tipo `sk-`, `ghp_`, `AKIA`, `Authorization: Bearer`, `*TOKEN/SECRET/PASSWORD=...` y
     bloques `BEGIN ... PRIVATE KEY` (`engine.js:88-100`, `engine.js:461-467`). El error nombra
     la `memory_key` y el campo, **nunca** repite el valor detectado.
44. **Render proactivo sin el bloque `refs:`.** `buildWorkingContext` sigue inyectando solo
     `rule` activas; por cada regla usa `renderRuleContent(content)`, que recorta desde la línea
     `refs:` hasta el final del bloque (`engine.js:197-206`, `engine.js:385-393`). El `content`
     **almacenado** queda intacto con sus refs: solo cambia la vista proactiva. Las refs no
     consumen el presupuesto `maxChars` del bloque. Una regla sin `refs:` se renderiza igual que
     antes (`aspec/specs/memory-engine/spec.md`, requirement "Render del bloque proactivo sin el
     bloque `refs:`").
45. **Promoción al archivar solo de decisiones aprobadas**
     (`2026-10-30-mem-03-promocion-decisiones-refs`, archivado). El gate de
     `skills/ancleto-archive/SKILL.md` lee `proposal ## Decisiones` y considera candidato solo
     un bloque con **`memory_key` propia y `Estado: aprobado`**; la forma de una línea nunca es
     candidata y una `rule` nunca se promueve desde ahí (`SKILL.md:51-58`, `SKILL.md:96-97`).
     Hace **preflight del lote completo antes de la primera escritura**: claves propias y
     únicas, refs presentes y resolubles, ningún `path:` dentro de
     `aspec/changes/<change-name>/` (dejaría de resolver al mover el change) y ningún candidato
     de sesión; una violación ⇒ **cero escrituras** y el change no se mueve. Con candidatos
     válidos delega **una** pasada de `@memory-keeper` en modo Promotion, que escribe **un
     `recordDecision` por bloque** (nunca `recordRule`) y reporta por clave
     (`SKILL.md:67-70`, `agents/memory-keeper.md:80-97`). Sin candidatos ⇒ **cero escrituras y
     cero delegación**. El orquestador ejecuta la promoción **después** de que `@documenter`
     termina el merge de specs y **nunca en paralelo**, para que `spec:` resuelva contra la
     fuente de verdad; si no hubo sync, la pasada igual corre y una `spec:` no resoluble se
     rechaza fail-closed (`agents/orchestrator.md:192`, `agents/orchestrator.md:326`).
46. **`opencode.json` en la raíz: override local del host, fuera del paquete.** El archivo fija
     `agent.model = commandcode/deepseek/deepseek-v4.1-flash` para 9 subagentes y **no** incluye
     al orquestador (`opencode.json:1-14`). `package.json` → `files` lista `agents`, `commands`,
     `skills`, `templates`, `profiles` y `src`; `opencode.json` **no** se publica
      (`package.json:10-17`). Es configuración del checkout, no contrato del producto.

47. **Retiro de `design.md` y `context.md` sin artifact sucesor
      (`retire-design-and-context-artifacts`, archivado el 2026-10-30).** El flujo nuevo produce
      **solo** `proposal.md`, `tasks.md` y `specs/`; ningún generador emite `design.md` ni
      `context.md`. Una decisión durable se registra en `proposal.md ## Decisiones` (shape en
      `agents/spec-writer.md`). Los consumidores (`@coder`, `@tester`, `@reviewer`, `@documenter`,
      `@orchestrator`, `ancleto-apply`, `ancleto-verify`, `ancleto-bulk-archive`) tratan un
      `design.md`/`context.md` legacy como lectura **opcional**, nunca precondición ni hueco de
      completitud. `ancleto-verify` declara la frontera de completitud en `tasks.md` + `specs/`.
      El archive (`ancleto-archive`, `ancleto-onboard`, `ancleto-bulk-archive`) **mueve el
      directorio sin modificarlo**: ya no borra `context.md`, y los artifacts de changes
      archivados no se eliminan, migran ni reescriben. El delta ya está mergeado en el spec
      fuente: `aspec/specs/artifact-update/spec.md` mapea diseño → `proposal.md ## Decisiones` y
      `aspec/specs/prompt-contracts/spec.md` incorpora el requirement "Retiro de `design.md` y
      `context.md` sin artifact sucesor" (4 escenarios). Evidencia:
      `aspec/changes/archive/2026-10-30-retire-design-and-context-artifacts/proposal.md`
      (`## Decisiones`), `aspec/specs/{artifact-update,prompt-contracts}/spec.md`,
      `agents/spec-writer.md`, `agents/{orchestrator,coder,tester,reviewer,documenter}.md`,
      `skills/ancleto-{apply,verify,archive,bulk-archive,continue,update,workflow,propose,ff,new,onboard,explore,upgrade}/SKILL.md`,
      `skills/ancleto-upgrade/references/templates.md`, `docs/skill-ancleto-update.md`,
      `docs/skill-ancleto-upgrade.md`, `README.md`; guard único `test/content-guards.test.js`.
      **Estado**: commiteado en `development` (`a506b54`) y **publicado en `0.17.1`**
      (`CHANGELOG.md`; tag anotado `v0.17.1` en `main`, `cda4cb6`).

## Seed incremental (contrato del discovery)

- `ancleto discovery --check` devuelve `state` + `impact`:
  - `none` → sin cambios.
  - `minor` → cambios no materiales (el agente trabaja y lo anota, no ofrece regenerar).
  - `material` → cambió un config de runtime, entry point o apareció/desapareció un directorio
    raíz nuevo (o un archivo material como `package.json`).
- En esta corrida el reporte fue `STALE` / `impact: material`: los 11 `affectedDocs`,
  `changedAreas` `[".ancleto", ".ancletorc", ".opencode", "CHANGELOG.md", "aspec",
  "package.json"]` y `materialReasons: ["archivo material modificado: package.json"]`. La causa
  es el bump `0.17.1` (publicado y con entrada en `CHANGELOG.md`) más el archive de
  `2026-10-30-backfill-archived-design-decisions` (housekeeping de artifacts: no cambia código,
  tests ni assets de producto); `.ancletorc`/`.opencode` son el manifiesto y la instalación local
  del host (ambos gitignored) y `.ancleto` es la memoria más el `machine-env` regenerado.
- Con `impact: minor` y `affectedDocs` no vacío, el seed-writer reescribe **solo** esos
  documentos; con `impact: material` se regenera el seed completo. El mapeo vive en
  `seed-map.json`; sin ese archivo la regeneración es completa.
- **`affectedDocs` (seed) ≠ `affected-set` (change).** `ancleto discovery --check` devuelve
  `affectedDocs` (documentos del seed a reescribir); `ancleto affected` computa el
  `affected-set` (clausura de dependientes por grafo de imports). Son homónimos con semántica
  distinta.
- Al archivar un change, el seed puede quedar `STALE`; `AGENTS.md` (`LOCKED: seed-freshness`)
  define el procedimiento (verificar, avisar, regenerar solo con aprobación).
- **Falsos positivos del check**: `package-lock.json` figura como "área raíz eliminada" porque
  está en `config.exclude` (no se hashea), pero **el archivo existe**; `audit logs/` (untracked)
  y `documentation/` (gitignored) aparecen como áreas nuevas porque `computeSources` recorre el
  disco con `DEFAULT_IGNORES` + `exclude` y **no** aplica `.gitignore`. No son áreas materiales
  del seed.
- **Detección material por área, no por contrato**: `package.json` es material por lista de
  archivos, así que **cualquier** bump de versión —incluso sin cambio de comportamiento— marca
  `impact: material` y lista los documentos asociados. En esta corrida la razón material fue el
  bump `0.17.0`→`0.17.1`; el backfill archivado (markdown en `aspec/`, `docs/` y `agents/`) no
  es, por sí solo, una razón material.
- `EXPECTED_DOCS` del CLI = 8 documentos raíz (`index`, `overview`, `setup`, `inventory`,
  `integrations`, `decisions`, `unknowns`, `units/_map`).
- Evidencia: `README.md`, `src/cli/index.js` (`checkDiscovery`, `computeImpact`,
  `readSeedMap`, `affectedDocsFor`), `AGENTS.md`.

## Riesgos, deuda y acoplamiento

- **MEM-03 publicado como `0.17.0`; el retiro de `design.md`/`context.md` publicado como
  `0.17.1`.** El release `b283ff2` (`chore(release): v0.17.0`) y el tag **anotado**
  `v0.17.0` en `main` (`cdc18d5`, "Merge development into main for v0.17.0") cubren MEM-03 y
  `CHANGELOG.md` lo detalla. El retiro entró después, en `a506b54` sobre `development`, y quedó
  publicado en `0.17.1` (`975aa03`, `chore(release): v0.17.1`; tag **anotado** `v0.17.1` en
  `main`, `cda4cb6`, merge de `development`), con su propia entrada en `CHANGELOG.md`.
  Evidencia: `git log`, `git tag`, `CHANGELOG.md`, `package.json`.
- **Pack comprimido y sesgado a código.** El tier resuelto (`minimo`) ignora `test/**`,
  `docs/**` y `**/*.md`; Repomix además respeta `.gitignore` (`.opencode/`, `.ancletorc`,
  `.ancleto/`, `/documentation`). Por eso `agents/`, `commands/`, `skills/`, `templates/`,
  `docs/` y `documentation/` **no aparecen** en el pack. `audit logs/*.txt` sí entra (está
  untracked y no está excluido), pero es ruido de auditorías y no evidencia del producto.
  Una regeneración futura puede no detectar cambios en las superficies markdown (ver
  `unknowns.md`).
- **`agents/`, `commands/`, `skills/`, `templates/` son la superficie de producto instalable.**
  Cambiarlos altera lo que reciben todos los proyectos usuarios. `installAgentAssets()` es el
  punto único de materialización y `src/core/adapters/frontmatter.js` define qué claves
  sobreviven por host. Un id de tool no verificado cuelga el subagent de Antigravity.
- **El texto del orquestador es contrato normativo.** `agents/orchestrator.md` fija el techo de
  lecturas, el intake, el trigger de Recall, el checkpoint de contrato y el orden de la
  promoción; cualquier reescritura de ese prompt puede re-introducir prohibiciones absolutas,
  capabilities que el agente no tiene o volver a atar el stop a documentos generados. Los
  mirrors `.opencode/agents/*.md` se **regeneran**, no se editan a mano.
- **Checkpoint de contrato: relajarlo pierde control de alcance.** Riesgos: que la presentación
  enumere documentos, que omita los paths autorizados (y `@coder` no sepa qué commitear) o que un
  cambio de alcance/riesgo/arquitectura se implemente sin enmienda. Mitigación: los siete campos
  son obligatorios, la aprobación autoriza solo implementar, archive y merge siguen separados y
  los guards de `test/content-guards.test.js` lo anclan por comportamiento. Evidencia:
  `agents/orchestrator.md`, `aspec/changes/archive/2026-10-29-decisiones-y-contrato-checkpoint/`.
- **Retiro de artifacts: spec fuente, código y distribución convergen.** Con el archive del
  2026-10-30 el delta se mergeó: `aspec/specs/artifact-update/spec.md` clasifica la decisión de
  diseño hacia `proposal.md ## Decisiones` y declara `design.md` como nunca creado ni
  actualizado, y `aspec/specs/prompt-contracts/spec.md` incorpora el requirement de retiro. El
  retiro se **publicó en `0.17.1`**, así que ya no hay brecha entre el paquete del registry y el
  flujo vigente. Evidencia: `aspec/specs/artifact-update/spec.md`,
  `aspec/specs/prompt-contracts/spec.md`,
  `aspec/changes/archive/2026-10-30-retire-design-and-context-artifacts/`, `CHANGELOG.md`.
- **Guard del retiro acotado por sección, no global.** `test/content-guards.test.js` prohíbe
  `design.md`/`context.md` solo en las superficies y slices que declaran el set/orden de artifacts,
  y exige un control positivo de que la lectura legacy sigue viva en `continue`, `update`, `coder`,
  `tester` y `reviewer`. Un grep global rompería por menciones legítimas (archive, checkpoint,
  specs históricos); aflojar el predicado dejaría pasar una regresión. Evidencia:
  `test/content-guards.test.js` (constantes `RETIRED_ARTIFACT_GENERATORS`,
  `NO_DESIGN_MD_SLICERS`, `NO_CONTEXT_MD_SURFACES`, `LEGACY_READ_SLICES`).
- **El archive ya no borra `context.md`.** Un change legacy activo con `context.md` se archiva con
  ese archivo adentro; es el tradeoff aceptado (preserva el registro, evita data loss). Ningún
  consumidor lo exige, así que su presencia no debe leerse como artifact del flujo nuevo.
- **Refs obligatorias: el radio de rechazo es amplio.** Toda escritura MCP (`source:
  mcp:ancleto-memory`) o de agente debe traer refs resolubles; un heading de spec que cambie,
  un change que se archive con otro slug o un `path:` que desaparezca vuelven inválida una
  escritura futura. El error es fail-closed y previo a la transacción: no escribe ni supersede.
  Mitigación: la resolución exacta de `change:` y la detección de ambigüedad evitan matches
  accidentales; la deuda es operativa (mantener refs vivas), no estructural. Evidencia:
  `src/core/memory/engine.js:222-311`,
  `aspec/specs/memory-engine/spec.md` (requirements "Validación fail-closed de refs…").
- **`cli:import` queda fuera de la validación de refs.** `importNodes` no pasa por `recordNode`
  y conserva LWW; importar un JSON con nodos sin refs es posible aunque esos mismos nodos no
  podrían escribirse por MCP. La spec lo declara explícitamente. No debe prometerse que la
  memoria importada cumple el mismo contrato de refs. Evidencia: `src/core/memory/engine.js`
  (`importNodes`), `aspec/specs/memory-engine/spec.md`.
- **`commit:` y `workitem:` son sintácticas.** El motor valida el SHA (7–40 hex) y la forma
  `tracker:key`, pero no comprueba que el commit exista ni que el work item sea accesible; esas
  refs no se resuelven en disco. Evidencia: `src/core/memory/engine.js:137-147`.
- **La promoción depende de dos gates alineados.** El gate de archive y el preflight de
  `@memory-keeper` deben rechazar el mismo lote; si divergen, puede quedar un change archivado
  con "Memory pending" (nunca "archivado y memorizado"). Además, un `path:` dentro de
  `aspec/changes/<change>/` resuelve antes del move y deja de resolver después: el preflight lo
  prohíbe. Evidencia: `skills/ancleto-archive/SKILL.md:51-70`,
  `agents/memory-keeper.md:84`.
- **La allowlist de `bash` es la frontera de privilegio.** `agents/technical-discovery.md` tiene
  `'*': deny` con dos literales permitidos; cada literal nuevo es un incremento de privilegio que
  debe justificarse por menor privilegio que enrutar el mismo comando a otro agente.
- **Guía `searchMemory` residual en superficies mergeadas.** `AGENTS.md` (bloque de memoria
  reactiva), `PRODUCT.md` (bloque "AI Memory" y guardrail "Protocolo de memoria reactiva") y sus
  templates siguen recomendando invocar `searchMemory` ante un `<ContextOverflowWarning>`, lo
  que contradice el aviso vigente (regla 32) y la prohibición del orquestador. Sigue siendo
  **deuda abierta**, pero ya **no hay backlog raíz** que la registre (ver `unknowns.md`).
  Des-hardcodearlo exige un bloque `LOCKED` y reconciliar el texto plano legacy en
  `mergeTemplateInto`/`reconcileLegacyBlocks`.
- **Merge de templates: contrato de reconciliación.** Toda ruta que mergee `TEMPLATES` debe
  reconciliar bloques planos legados antes de `mergeLocked`; saltearlo reintroduce guía obsoleta
  junto al bloque canónico. `reconcileLegacyBlocks` solo elimina con coincidencia exacta de la
  firma (bloque personalizado se avisa, no se toca).
- **Directiva host-específica filtrada a texto compartido.** Riesgo de que una instrucción
  (p. ej. de compresión) se cuele en `AGENTS.md` o en assets copiados verbatim, volviéndose
  falsa para hosts sin esa tool. Mitigación: contrato "donde no hay tool, no hay instrucción" +
  assert de comportamiento en `content-guards`.
- **`machine-env.md` puede quedar trackeado.** La exclusión es local al clon (`info/exclude`);
  si alguien lo agrega con `git add -f`, `ancleto check` avisa pero no lo destrackea. El
  artefacto es derivado y no debe versionarse. Evidencia: `src/core/machine-env.js`
  (`checkMachineEnvTracked`), `aspec/specs/machine-environment/spec.md`.
- **Exclusión local no portátil entre clones.** `info/exclude` no se versiona: cada clon debe
  ejecutar un lifecycle para garantizar su propia exclusión. En un worktree vinculado la regla
  va al `info/exclude` que resuelve `git rev-parse --git-path`. Evidencia:
  `src/core/machine-env.js`.
- **Sanitización de paths best-effort.** `sanitizePaths` cubre `C:\...`, `/home/...` y
  `/Users/...`, pero puede no atrapar paths sin barra inicial o con `~`; el usuario debe revisar
  el JSON antes de compartirlo. `memory snapshot` **no** sanitiza (es una copia binaria):
  contiene los paths tal cual y debe tratarse como artefacto interno. Evidencia:
  `src/core/memory/engine.js`, `src/core/memory/snapshot.js`.
- **Snapshot: restauración manual y residuos.** El comando no restaura: recuperar exige copiar
  el archivo de vuelta con la DB cerrada. Un fallo al borrar el backup puede dejar un
  `.bak-<uuid>` junto al destino (no invalida el snapshot); un fallo antes de mover deja un
  `.tmp` huérfano. Evidencia: `src/core/memory/snapshot.js`.
- **Doctor read-only no verifica todo.** El integrity-check completo de FTS5 escribe y queda solo
  para `--rebuild`; en read-only la alineación se aproxima con la tabla sombra. Un FTS5 creado
  con `columnsize=0` deja el check **omitido** (no falla), y una corrupción interna sin
  desalineación de filas puede pasar. Evidencia: `src/core/memory/doctor.js`,
  `aspec/specs/memory-ops/spec.md`.
- **Merge es irreversible por CLI.** No crea nodos ni transfiere contenido: enlaza cada source
  al target (`superseded_by`). Deshacerlo requiere un snapshot previo o reescribir los nodos. El
  `type` debe coincidir y las sources deben estar activas; un merge con `--dry-run` es el único
  camino sin escritura. Evidencia: `src/core/memory/engine.js`, `src/cli/index.js`.
- **Import pierde genealogía.** El export solo incluye nodos activos; al importar un nodo nuevo
  se crea sin historial de supersesión previo (la genealogía se reconstruye por `memory_key`).
  Para historial, usar `memory snapshot`.
- **GC usa `created_at` como proxy.** No existe `superseded_at`; un nodo creado hace mucho y
  superseded recientemente puede purgarse antes de lo deseado. `--dry-run` permite auditarlo.
- **Procedencia ≠ autorización, pero sí compuerta de validación.** La columna `source` es
  auditable y ahora decide si se validan refs; no hay canal de identidad autenticado (MCP
  stdio), así que no debe prometerse enforcement de autorización. Evidencia:
  `src/core/memory/engine.js`, `aspec/specs/memory-engine/spec.md`.
- **`ancleto stats` y `stats failures` acoplados a opencode**: leen la base de sesiones de
  opencode; no funcionan con otros IDEs. Evidencia: `README.md`, `src/cli/index.js`
  (`opencodeDbPath`).
- **Privacidad del reporte de fallos.** `stats failures` enmascara secretos/rutas y no imprime
  texto libre, pero la clasificación depende de señales textuales (`is not recognized`,
  `command not found`, etc.) y puede caer en `unknown` ante mensajes nuevos. Evidencia:
  `src/cli/index.js`, `aspec/specs/session-failure-report/spec.md`.
- **Comandos denegados por la política del runtime no se miden.** El rechazo de un comando por la
  política del runtime no cae en ninguna clase de `stats failures`; queda fuera de la medición.
- **MCP = costo fijo por request.** La lista de tools viaja en cada request (`ancleto-memory`
  ~500, caveman ~830, engram ~4.900 tokens). Engram quedó opcional (`--with-engram`) por eso; el
  default de caveman está bajo compuerta de medición.
- **Promesa "optimizador de tokens" no especificada.** `optimizacion-de-tokens.md` documenta que
  la capacidad de ahorro existe como *mecanismos dispersos* pero **no** como garantía con
  Requirements/tests; deja una decisión abierta (capacidad nueva `token-economy` vs atributo
  transversal). Solo `gratis` fija `tokenBudget` (50k); `minimo` y `normal` no.
- **Protección de rama no verificada.** `AGENTS.md` declara que no se commitea a `main`/`master`,
  pero no se comprobó protección real en el remoto.
- **Cobertura del affected-set acotada por diseño.** El grafo cubre solo formas estáticas de
  `import`/`require` con literal puro; los imports dinámicos no escaneados y los **alias de
  paths** quedan **delegados** al mecanismo declarado por el proyecto; los no relativos se
  cuentan como `externalCount`. No debe asumirse cobertura total. Evidencia:
  `src/core/affected-set.js`, `aspec/specs/prompt-contracts/spec.md`.
- **Prompts del pipeline fuera del pack.** Los contratos viven en `agents/*.md` (orchestrator,
  spec-writer, tester, reviewer, memory-keeper, technical-discovery, …) y en las skills que
  generan el proposal y archivan, superficies que el tier ignora (`**/*.md`); el seed los
  describe por lectura puntual y por las specs fuente. `test/content-guards.test.js` los ancla por
  keywords de comportamiento.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, `mcp_config.json`,
  `.mcp.json`, CI o Azure. Las variables se nombran y su valor se omite. `machine-env.md`
  tampoco renderiza `PATH` ni versiones.
- **Refresh on-write compare-based es robusto pero best-effort.** Un fallo del refresh en
  `memory import` **no** invalida la importación; en `memory merge` el merge ya está commiteado y
  el comando sale ≠ 0 avisando que el bloque quedó viejo. `memory doctor` lo expone como
  `Working-context: ausente` o `desactualizado`.
- **Staleness advisory puede dar falsos positivos triviales.** La normalización es acotada
  (CRLF, espacios finales, salto final); cambios cosméticos mayores podrían disparar
  `desactualizado` aunque el contenido sea equivalente. Riesgo aceptado: se prefiere reportar.
- **Versión y publicación.** `package.json` marca `0.17.1`; el tag `v0.17.1` es **anotado** y
  vive en `main` (`cda4cb6`, merge de `development`); `development` HEAD `975aa03` es el commit
  de release `chore(release): v0.17.1` y **no es ancestro** del tag (el tag cuelga del merge).
  Evidencia: `package.json`, `git tag`, `git log`, `git status --short`.
- **Docs de producto desalineados.** `PRODUCT.md` declara 12 commands y 18 skills (hoy 16 y 21),
  no menciona `machine-env`, `stats failures`, `memory snapshot`, `memory merge` ni el retiro, y
  conserva la guía residual de `searchMemory`; `README.md` ya describe `memory doctor`
  read-only por defecto con `--rebuild` como único camino de escritura. `CHANGELOG.md` cubre
  `0.17.1` e incluye MEM-03 y el retiro. El seed refleja el estado observado.
  Evidencia: `PRODUCT.md`, `README.md`, `CHANGELOG.md`, `commands/`, `skills/`,
  `src/core/memory/doctor.js`.
- **Sin backlog raíz.** `BACKLOG.md` no existe. El backlog P0 de la reingeniería de memoria vive
  en `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` (PR-4b/CH-02c corresponde al backfill
  archivado); las demás deudas que el seed citaba por ítem (guía residual de `searchMemory`,
  protección de rama, detección material por archivo, comandos denegados fuera de medición)
  siguen como observaciones sin ítem canónico.
- **Deuda resuelta hasta 0.17.1**: (a) contrato de validaciones declarativo; (b) dedupe de reglas
  y día-cero del working-context; (c) `PRODUCT.md` declara `## Project Commands`; (d) pipeline de
  cierre; (e) refresh on-write CLI y staleness advisory; (f) entorno de máquina; (g) reporte de
  fallos; (h) intake de sesión, techo de lecturas y aviso de overflow accionable; (i) PR-1
  memoria-first (snapshot, doctor read-only, merge), publicado en `0.16.0`; (j) PR-2 (checkpoint
  de contrato y `## Decisiones`), publicado en `0.16.2`; (k) MEM-03 (refs obligatorias y
  promoción al archivar), publicado en `0.17.0`; (l) retiro de `design.md`/`context.md`,
  publicado en `0.17.1`. Evidencia: `CHANGELOG.md`, `aspec/changes/`,
  `package.json`, `git log`.

## Decisiones registradas en memoria del repo

> Registradas en una regeneración anterior vía `ancleto memory list`; **no re-consultadas** en
> esta corrida (la regeneración no abrió `.ancleto/memory.db`). El archive de
> `2026-10-30-backfill-archived-design-decisions` (PR-4b) declara **5 decisiones** recuperadas
> de `design.md` históricos y promovidas a `.ancleto/memory.db`; los nodos resultantes no se
> re-consultaron.

- `dogfooding-versionado-init`: versionar `AGENTS.md`, `PRODUCT.md` y `aspec/`; ignorar
  `.opencode/`, `.ancletorc`, `.ancleto/`.
- `fix-init-tier-huerfano-0.6.36` y `fix-init-tier-guardado-0.6.37`: `init` debe aplicar el tier
  guardado a los agentes locales (paridad con `install`), incluido re-init sin flags.
- `cli.host-mcp-config-out-of-scope`: el MCP de host queda fuera de alcance salvo las
  excepciones de `opencode`/`antigravity` (y ahora `commandcode`/`copilot`).
- Evidencia: `.ancleto/memory.db` (fuente declarada), `AGENTS.md`,
  `aspec/changes/archive/2026-10-30-backfill-archived-design-decisions/proposal.md`.
