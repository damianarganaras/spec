---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-10-26T17:15:00Z
pluginVersion: 0.15.1
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Reglas estructurales (declaradas)

1. **Zero-Dependencies de runtime + Node ≥ 24.** Sin `better-sqlite3` ni binarios nativos; el
   motor usa `node:sqlite` (`DatabaseSync`). `eslint` y `globals` existen **solo como
   devDependencies**: el contrato `dependencies` sigue ausente/vacío. Cualquier dependencia de
   runtime nueva rompe el contrato de costo y distribución. Evidencia: `package.json`,
   `eslint.config.js`, `DESIGN-memory-engine-v0.2.0.md`, `BACKLOG.md`.
2. **Una sola versión activa por `memory_key`.** La supersesión es atómica en transacción
   `BEGIN IMMEDIATE`: marca el nodo previo `superseded` e inserta el nuevo; hay índice único
   parcial sobre nodos activos. Evidencia: `DESIGN-memory-engine-v0.2.0.md`, `src/core/memory/engine.js`.
3. **Solo 3 tools expuestas al LLM** (`searchMemory`, `recordRule`, `recordDecision`).
   `source`, `confidence`, `status` e `id` los gestiona el runtime y **nunca** aparecen en el
   JSON Schema (`additionalProperties: false`; args forjados se ignoran). Las operaciones
   export/import/gc son **subcomandos CLI**, no tools del LLM. Evidencia:
   `DESIGN-memory-engine-v0.2.0.md`, `src/core/memory/tools.js`.
4. **Ciclo de vida del contexto.** *Rules* se recuperan proactivamente y se inyectan en el
   system prompt dentro de `<ProjectMemoryRules>` como **datos no confiables**; *decisions* se
   recuperan reactivamente con `searchMemory`. El **orquestador no ejecuta esa tool**: su
   contrato de "Team Memory" le prohíbe llamar `searchMemory`/`recordRule`/`recordDecision` y
   delega la recuperación en `@memory-keeper`, único agente dueño de `.ancleto/memory.db`
   (regla 32). Evidencia: `DESIGN-memory-engine-v0.2.0.md`, `agents/orchestrator.md`,
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
   tocar si el bloque fue personalizado/extendido. Seguro (nunca borra fuera del bloque
   identificado), idempotente y sin pasos manuales. `mergeLocked` re-aplica el interior de los
   bloques `<!-- LOCKED: name -->`, preserva lo EXTENSIBLE, inserta bloques nuevos en el ancla
   correcta y **no toca** archivos con tags malformados (avisa). No debe existir una ruta que
   mergee `TEMPLATES` sin reconciliar. Evidencia: `src/cli/index.js`, `templates/AGENTS.md`,
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
13. **Export/import/gc de memoria (`memory-ops-export-import-gc`).** `exportActive()` devuelve
     solo nodos activos con `{memory_key, type, content, justification, scope, createdAt}` y
     **sanitiza paths absolutos** a `<redacted>`; los superseded no se exportan. `importNodes(json)`
     valida el schema antes de procesar y **aborta el batch entero** si una entrada es inválida;
     upsert por `memory_key`: inserta si no existe, supersede solo si el `createdAt` del JSON es
     más reciente, y **no reactiva** nodos superseded. `gcSuperseded({days, dryRun})` purga
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
     global ni `memory.db` (la memoria tiene su propio export JSON). Evidencia:
     `src/cli/index.js`, `aspec/specs/project-portability/spec.md`.
18. **Linter mínimo: 4 reglas, sin estilo.** `eslint.config.js` es flat config (array) con
     `ecmaVersion: latest`, `sourceType: module`, globals de Node y exactamente `no-undef`,
     `no-unused-vars` (con `argsIgnorePattern`/`caughtErrorsIgnorePattern` `^_`), `eqeqeq`
     (`always`) y `no-dupe-keys`. Sin Prettier, sin plugins. Evidencia: `eslint.config.js`,
     `test/linter-config.test.js`, `aspec/specs/linter-standard/spec.md`.
19. **Patrón "CLI materializa + agente lee".** `ancleto memory context` escribe
     `.ancleto/working-context.md`; el orquestador lo lee como datos no confiables sin `bash`.
     El mismo patrón rige `.ancleto/machine-env.md`: el CLI detecta y escribe, los agentes leen.
     Evidencia: `BACKLOG.md`, `agents/orchestrator.md`,
     `src/core/memory/working-context.js`, `src/core/machine-env.js`.
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
22. **Procedencia `source` runtime-owned** (`memory-actor-provenance`). `source` se resuelve
     exclusivamente desde `context.source` (nunca desde args del caller) con vocabulario estable:
     `mcp:ancleto-memory`, `cli:import`, `runtime`, `tool:recordRule`/`tool:recordDecision` y
     `agent:<rol>` (solo si un runtime confiable lo provee). Se expone en `listNodes`/`memory
     list --json` pero **no** en `searchMemory` ni en los JSON Schema MCP. La procedencia es
     **descriptiva**; el motor **no** autoriza ni deniega escrituras con ella. Evidencia:
     `src/core/memory/engine.js`, `aspec/specs/memory-engine/spec.md`,
     `aspec/changes/archive/2026-10-05-memory-actor-provenance/`.
23. **Fuente única de reglas compartidas + guards por comportamiento** (`token-budget`). Toda
     regla que se declaraba en skill y agente pasa a tener **un único hogar canónico**: las
     transversales viven en `AGENTS.md` (bloques `LOCKED`) y las demás superficies **referencian**
     sin repetir texto. `test/content-guards.test.js` aserta **keywords de comportamiento** y
     presencia de salvaguardas, no redacción literal. Evidencia: `AGENTS.md`,
     `templates/AGENTS.md`, `aspec/specs/prompt-contracts/spec.md`.
24. **Actualización de artifacts de un change (`ancleto-update`, `0.12.0`).** La skill
     `ancleto-update` (`/cleto-update`) actualiza los artifacts de un change existente ante
     cambios de definición con merge no destructivo: clasifica por artifact dueño
     (`specs/`, `design.md`, `proposal.md`, `tasks.md`), detecta drift entre delta specs y specs
     principales y pregunta el modo de escritura (in-place vs `rev2`). Evidencia:
     `skills/ancleto-update/SKILL.md`, `commands/cleto-update.md`,
     `aspec/specs/artifact-update/spec.md`.
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
     **clasificador es conservador por argumento**: solo un literal puro seguido de `)` es
     estático; ante la duda reporta `unresolved`, nunca en silencio. `externalCount` es **dato
     informativo**. Si el proyecto declara su propio mecanismo en `PRODUCT.md` → `## Project
     Commands`, ese tiene prioridad (los **alias** quedan delegados). Evidencia:
     `src/core/affected-set.js`, `src/cli/index.js` (`affectedCommand`),
     `aspec/specs/prompt-contracts/spec.md`, `test/affected-set.test.js`.
26. **Pipeline de mayor throughput (`throughput-pipeline`).** Cuatro contratos de prompt reducen
     round-trips sin degradar salvaguardas: (a) **cierre en paralelo**: tras la aprobación de
     archive y **con candidato real**, `@orchestrator` delega `@documenter` ∥ `@memory-keeper`
     (superficies disjuntas `aspec/` vs `.ancleto/memory.db`, sin dependencia de salida); si el
     registro necesitara el resultado del archive, no se paraleliza y se reporta bloqueo.
     (b) **reviewer sin rebote**: `@tester` produce un **Validation Ledger completo y cerrado** y
     `@orchestrator` lo arma/verifica antes de delegar; `@reviewer` lo consume sin reconstruirlo
     ni pedir re-verificación dentro del scope cubierto (`bash:false` y bloqueo por `CRITICAL`
     preservados). (c) **affected-set** como scope (regla 25). (d) **memoria en un solo paso**:
     como máximo **una** llamada, solo con candidato real. Evidencia:
     `agents/{orchestrator,tester,reviewer,memory-keeper}.md`,
     `aspec/specs/prompt-contracts/spec.md`, `aspec/specs/review/spec.md`,
     `aspec/changes/archive/2026-10-15-throughput-pipeline/`.
27. **Refresh on-write del working-context en **ambas** superficies**
     (`2026-10-17-memory-cli-writes-refresh-working-context`, archivado). El bloque
     `<ProjectMemoryRules>` de `.ancleto/working-context.md` se regenera tras cualquier escritura
     que pueda alterarlo: (a) **MCP** — filtrado por `shouldRefreshWorkingContext(result)`
     (regla directa `rule` + scope `project`, o cualquier supersesión de `memory_key`);
     (b) **CLI** — `refreshWorkingContextOnWrite(engine, projectRoot, scope)`,
     **compare-based**: reescribe el archivo **solo si** el bloque renderizado difiere del
     contenido en disco, no crea un archivo vacío y **reusa la conexión abierta**. `memory
     import` lo invoca dentro de un `try/catch` aislado: si el refresh falla, la importación se
     considera exitosa y el fallo se reporta por stderr. La regeneración usa el **mismo camino
     único de render** (`renderWorkingContextBlock`). Evidencia: `src/cli/index.js`
     (`memoryImport`), `src/core/memory/working-context.js`,
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
     `generated_at`; la comparación ignora esa línea. La exclusión usa
     `git rev-parse --show-toplevel` + `--show-prefix` para componer
     `<prefix>.ancleto/machine-env.md` (normalizando `/`, sin `path.relative`), consulta
     `check-ignore --no-index` antes y después, y agrega **una** entrada a
     `git rev-parse --git-path info/exclude`, preservando el contenido previo byte a byte. Nunca
     toca `.gitignore`. Si no hay repo/git o el prefijo es inválido (absoluto, `..`, CR/LF),
     emite warning no bloqueante y no escribe regla. `ancleto check` advierte si `git ls-files`
     muestra el artefacto trackeado, sin cambiar el exit code. Evidencia:
     `src/core/machine-env.js`, `aspec/specs/machine-environment/spec.md`.
30. **Entrega del entorno a todos los subagentes y precedencia.** Toda definición de agente
     instalada (10) contiene la instrucción canónica de leer `.ancleto/machine-env.md` antes de
     ejecutar comandos; si no existe, continúa con la guía genérica y reporta la ausencia. Si un
     comando falla por entorno, reporta el shell declarado y el comando textual en lugar de
     reintentar a ciegas. `agents/orchestrator.md` agrega `## Machine Environment`, incluye el
     bloque **verbatim** en cada delegación a un subagente con `bash: true` (`@coder`, `@tester`,
     `@documenter`, `@context-resolver`, `@technical-discovery`, `@technical-seed-writer`) y
     **no** lo incluye para `@spec-writer`, `@reviewer` ni `@memory-keeper` (sin `bash`). La
     lectura proactiva de `machine-env.md` **no consume** el techo de 3 archivos del orquestador.
     El bloque prevalece sobre indicaciones genéricas de shell de `AGENTS.md`/`PRODUCT.md`/prompt
     del agente, pero **nunca** sobre seguridad, autorización, validación, permisos o instrucciones
     explícitas del usuario. Evidencia: `agents/*.md`, `src/core/machine-env.js` (`## Hint`),
     `aspec/specs/machine-environment/spec.md`.
31. **Reporte de fallos de herramientas (`session-failure-report`, archivado 2026-10-25).**
     `ancleto stats failures` lee **solo lectura** la tabla `part` de la base de opencode y
     considera fallo a `state.status='error'` o a `metadata.exit` presente y distinto de 0.
     Clasifica con precedencia: `tool` (herramienta no-shell), `env` (shell con exit 127/9009 o
     señales de entorno/tooling), `check` (shell con exit ≥ 1 legítimo) y `unknown` (shell con
     error sin causa determinable). Agrupa por proyecto, herramienta, clase y esqueleto
     estructural del comando; **nunca** imprime `title`, `output`, `state.error` ni el `input` de
     herramientas no-shell, y enmascara secretos, rutas y wrappers. Es la superficie de medición
     de la mejora de `machine-environment`. Evidencia: `src/cli/index.js`
     (`statsFailuresCommand`, `failureBucketsQuery`), `aspec/specs/session-failure-report/spec.md`,
     `test/stats-failures.test.js`.
32. **El aviso de overflow nombra sólo capacidades que el orquestador tiene**
     (`2026-10-26-orchestrator-session-start`, archivado). `<ContextOverflowWarning>` se emite
     **incondicionalmente** al truncar el bloque de reglas y su texto **no** menciona
     `searchMemory`: indica delegar **un** Recall a `@memory-keeper` con el topic de la tarea.
     Conserva el conteo de reglas omitidas, el registro por consola y el presupuesto
     (`MAX_TOKENS = 2000` × `CHARS_PER_TOKEN = 4` = 8.000 caracteres). El **consumidor** es
     `@orchestrator`: su contrato de "Team Memory" declara el warning como trigger inmediato de
     **exactamente un** Recall a `@memory-keeper` **antes** de delegar cualquier otra etapa, sin
     repetirlo para el mismo warning; el orquestador **no** llama `searchMemory` ni delega esa
     búsqueda a otro agente. La tool MCP `searchMemory` sigue expuesta al IDE (sin cambios de
     schema): lo que cambia es el **consumidor**, no el motor. Evidencia:
     `src/core/memory/engine.js:144`, `agents/orchestrator.md` ("Team Memory"),
     `aspec/specs/memory-engine/spec.md` ("Aviso de overflow accionable para el orquestador"),
     `aspec/specs/prompt-contracts/spec.md` ("Recall delegado ante `<ContextOverflowWarning>`"),
     `test/memory-engine.test.js`, `test/content-guards.test.js`.
33. **Techo de lecturas del orquestador: 3 archivos + exenciones acotadas**
     (`2026-10-26-orchestrator-session-start`, archivado). El techo vive en **un solo párrafo**
     de `agents/orchestrator.md`: máximo **3 archivos de repositorio** no dirigidos para
     responder o establecer contexto; **exentos** (a) las lecturas proactivas de
     `.ancleto/working-context.md` y `.ancleto/machine-env.md` y (b) hasta **5 archivos que el
     usuario nombre explícitamente en un mensaje**, con tope **por mensaje** (se reinicia en el
     mensaje siguiente; sólo cuenta como nombrado si el usuario pide leerlo o lo fija como
     objetivo del pedido, no una mención de paso). Por encima del tope, la lectura se **delega** a
     `@technical-discovery` en lugar de ejecutarse (sin conteo adicional). Las prohibiciones
     absolutas remanentes se **reconcilian** con la exención: ninguna afirmación del prompt
     prohíbe en términos absolutos leer archivos nombrados dentro del tope. Evidencia:
     `agents/orchestrator.md` ("Repository Reading Limit" y "PROHIBITED ACTIONS"),
     `aspec/specs/prompt-contracts/spec.md` ("Exención acotada de lecturas para archivos
     nombrados por el usuario"), `test/content-guards.test.js` (guards (a) y (b)).
34. **Intake de sesión con estado del árbol y changes activos**
     (`2026-10-26-orchestrator-session-start`, archivado). Al inicio de sesión el orquestador
     ejecuta un intake **read-only** que no carga contexto de repositorio: (1) lista una vez las
     entradas de `aspec/changes/` **excluyendo `archive/`** y las compara por nombre; (2) cuando
     el pedido **toca el estado del repositorio** (rama, working tree, archivos sin commitear o
     untracked) delega **exactamente un** `git status --short` a `@technical-discovery` —el
     orquestador no tiene shell— y usa su salida tal cual; (3) **reporta sólo diferencias**: un
     change activo se reporta únicamente si difiere del solicitado; con árbol limpio (o sin
     inspección porque el pedido no toca el estado del repo) y sin change ajeno, **no emite nada**.
     El enabler es una allowlist mínima: `agents/technical-discovery.md` mantiene `'*': deny` y
     permite **exactamente dos literales**: `'ancleto discovery --check'` y `'git status --short'`.
     Eso otorga estrictamente menos privilegio que enrutar el comando a un agente con `'*': allow`
     y no amplía la superficie de escritura. Evidencia: `agents/orchestrator.md` ("## Session
     Intake"), `agents/technical-discovery.md` (bloque `permission.bash`),
     `aspec/specs/prompt-contracts/spec.md` ("Intake de sesión con estado del árbol y changes
     activos"), `test/content-guards.test.js` (guards (c) y de la allowlist).

## Seed incremental (contrato del discovery)

- `ancleto discovery --check` devuelve `state` + `impact`:
  - `none` → sin cambios.
  - `minor` → cambios no materiales (el agente trabaja y lo anota, no ofrece regenerar).
  - `material` → cambió un config de runtime, entry point o apareció/desapareció un directorio
    raíz nuevo (o un archivo material como `package.json`). Ejemplo de esta corrida:
    `package.json` `0.15.0`→`0.15.1`, áreas `agents`, `src`, `aspec`, `test` y `BACKLOG.md` por
    `orchestrator-session-start`.
- Con `impact: minor` y `affectedDocs` no vacío, el seed-writer reescribe **solo** esos
  documentos. El mapeo vive en `seed-map.json`; sin ese archivo la regeneración es completa.
- **`affectedDocs` (seed) ≠ `affected-set` (change).** `ancleto discovery --check` devuelve
  `affectedDocs` (documentos del seed a reescribir); `ancleto affected` computa el
  `affected-set` (clausura de dependientes por grafo de imports). Son homónimos con semántica
  distinta.
- Al archivar un change, el seed puede quedar `STALE`; `AGENTS.md` (`LOCKED: seed-freshness`)
  define el procedimiento (verificar, avisar, regenerar solo con aprobación).
- **Falsos positivos del check**: `package-lock.json` figura como "área raíz eliminada" porque
  está en `config.exclude` (no se hashea), pero **el archivo existe**; `audit logs/` (untracked) y
  `documentation/` (gitignored) aparecen como áreas nuevas porque `computeSources` recorre el
  disco con `DEFAULT_IGNORES` + `exclude` y **no** aplica `.gitignore`. No son áreas materiales
  del seed.
- **Detección material por área, no por contrato** (deuda B6 en `BACKLOG.md`): `package.json`
  es material por lista de archivos, así que **cualquier** bump de versión —incluso sin cambio de
  comportamiento— marca `impact: material` y lista los documentos asociados.
- `EXPECTED_DOCS` del CLI = 8 documentos raíz (`index`, `overview`, `setup`, `inventory`,
  `integrations`, `decisions`, `unknowns`, `units/_map`).
- Evidencia: `README.md`, `BACKLOG.md`, `src/cli/index.js`, `AGENTS.md`.

## Riesgos, deuda y acoplamiento

- **Pack comprimido y sesgado a código.** El tier resuelto (`gratis`) ignora `test/**`,
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
  lecturas (regla 33), el intake (regla 34) y el trigger de Recall (regla 32); cualquier
  reescritura de ese prompt puede re-introducir prohibiciones absolutas o capabilities que el
  agente no tiene. Los mirrors `.opencode/agents/*.md` se **regeneran**, no se editan a mano.
- **La allowlist de `bash` es la frontera de privilegio.** `agents/technical-discovery.md` tiene
  `'*': deny` con dos literales permitidos; cada literal nuevo es un incremento de privilegio que
  debe justificarse por menor privilegio que enrutar el mismo comando a otro agente.
- **Guía `searchMemory` residual en superficies mergeadas.** `AGENTS.md` (bloque de memoria
  reactiva), `PRODUCT.md` (bloque "AI Memory" y guardrail "Protocolo de memoria reactiva") y sus
  templates siguen recomendando invocar `searchMemory` ante un `<ContextOverflowWarning>`, lo
  que contradice el aviso vigente (regla 32) y la prohibición del orquestador. Es **deuda
  abierta** (`BACKLOG.md` ítem 17): des-hardcodearlo exige un bloque `LOCKED` y reconciliar el
  texto plano legacy en `mergeTemplateInto`/`reconcileLegacyBlocks`. No debe leerse como
  contrato vigente.
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
- **Detección de shell best-effort.** El shell se infiere del entorno del proceso que ejecuta
  `init` (no del shell de la tool del runtime); ante señales contradictorias se declara
  `unknown`. `ComSpec` no se usa. Un `unknown` no rompe nada, pero obliga al agente a reportar
  el comando textual en vez de adivinar. Evidencia: `src/core/machine-env.js`.
- **Exclusión local no portátil entre clones.** `info/exclude` no se versiona: cada clon debe
  ejecutar un lifecycle para garantizar su propia exclusión. En un worktree vinculado la regla
  va al `info/exclude` que resuelve `git rev-parse --git-path`. Evidencia:
  `src/core/machine-env.js`.
- **Sanitización de paths best-effort.** `sanitizePaths` cubre `C:\...`, `/home/...` y
  `/Users/...`, pero puede no atrapar paths sin barra inicial o con `~`; el usuario debe revisar
  el JSON antes de compartirlo. Evidencia: `src/core/memory/engine.js`.
- **Import pierde genealogía.** El export solo incluye nodos activos; al importar un nodo nuevo
  se crea sin historial de supersesión previo (la genealogía se reconstruye por `memory_key`).
- **GC usa `created_at` como proxy.** No existe `superseded_at`; un nodo creado hace mucho y
  superseded recientemente puede purgarse antes de lo deseado. `--dry-run` permite auditarlo.
- **Procedencia ≠ autorización.** La columna `source` es auditable pero no enforceable: no hay
  canal de identidad autenticado (MCP stdio), así que el ownership de escritura sigue siendo una
  convención. No debe prometerse enforcement.
- **`ancleto stats` y `stats failures` acoplados a opencode**: leen la base de sesiones de
  opencode; no funcionan con otros IDEs. Evidencia: `README.md`, `src/cli/index.js`
  (`opencodeDbPath`).
- **Privacidad del reporte de fallos.** `stats failures` enmascara secretos/rutas y no imprime
  texto libre, pero la clasificación depende de señales textuales (`is not recognized`,
  `command not found`, etc.) y puede caer en `unknown` ante mensajes nuevos. Evidencia:
  `src/cli/index.js`, `aspec/specs/session-failure-report/spec.md`.
- **Comandos denegados por la política del runtime no se miden.** El rechazo de un comando por la
  política del runtime no cae en ninguna clase de `stats failures`; queda fuera de la
  medición (deuda `BACKLOG.md` ítem 16).
- **MCP = costo fijo por request.** La lista de tools viaja en cada request (`ancleto-memory`
  ~500, caveman ~830, engram ~4.900 tokens). Engram quedó opcional (`--with-engram`) por eso; el
  default de caveman está bajo compuerta de medición.
- **Promesa "optimizador de tokens" no especificada.** `optimizacion-de-tokens.md` documenta que
  la capacidad de ahorro existe como *mecanismos dispersos* pero **no** como garantía con
  Requirements/tests; deja una decisión abierta (capacidad nueva `token-economy` vs atributo
  transversal). Los tiers `normal`/`minimo` no fijan `tokenBudget` (solo `gratis`, 50k).
- **Branch protection honor-based.** `AGENTS.md`/`BACKLOG.md` declaran `main` protegida, pero
  el remoto no aplica protection real (B3). Evidencia: `BACKLOG.md`.
- **Cobertura del affected-set acotada por diseño.** El grafo cubre solo formas estáticas de
  `import`/`require` con literal puro; los imports dinámicos no escaneados y los **alias de
  paths** quedan **delegados** al mecanismo declarado por el proyecto; los no relativos se
  cuentan como `externalCount`. No debe asumirse cobertura total. Evidencia:
  `src/core/affected-set.js`, `aspec/specs/prompt-contracts/spec.md`.
- **Prompts del pipeline fuera del pack.** Los contratos viven en
  `agents/{orchestrator,tester,reviewer,memory-keeper,technical-discovery}.md`, que el tier
  ignora (`**/*.md`); el seed los describe por las specs fuente y lectura puntual.
  `test/content-guards.test.js` los ancla por keywords de comportamiento.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, `mcp_config.json`,
  `.mcp.json`, CI o Azure. Las variables se nombran y su valor se omite. `machine-env.md`
  tampoco renderiza `PATH` ni versiones.
- **Refresh on-write CLI compare-based es robusto pero best-effort.** Un fallo del refresh en
  `memory import` **no** invalida la importación; el fallo se reporta por stderr y `memory
  doctor` lo expone como `Working-context: ausente` o `desactualizado`.
- **Staleness advisory puede dar falsos positivos triviales.** La normalización es acotada
  (CRLF, espacios finales, salto final); cambios cosméticos mayores podrían disparar
  `desactualizado` aunque el contenido sea equivalente. Riesgo aceptado: se prefiere reportar.
- **`CHANGELOG.md` atrasado.** La última entrada es `0.12.1`; `package.json` y el tag están en
  `0.15.1`. Los cambios `0.13.x`–`0.15.1` se infieren de specs, código y changes archivados.
  Evidencia: `CHANGELOG.md`, `package.json`, `git describe --tags`.
- **Docs de producto desalineados.** `PRODUCT.md` declara 12 commands y 18 skills (hoy 16 y 21),
  no menciona `machine-env` ni `stats failures` y conserva la guía residual de `searchMemory`;
  `README.md` tampoco documenta el entorno de máquina. El seed refleja el estado observado, no
  esas cifras. Evidencia: `PRODUCT.md`, `README.md`, `commands/`, `skills/`,
  `src/core/machine-env.js`, `BACKLOG.md` (ítem 17).
- **Deuda resuelta hasta 0.15.1**: (a) contrato de validaciones declarativo
  (`contrato-validaciones`); (b) dedupe de reglas y día-cero del working-context
  (`token-budget`); (c) `PRODUCT.md` declara `## Project Commands`; (d) pipeline de cierre
  (`throughput-pipeline`); (e) refresh on-write CLI y staleness advisory
  (`memory-cli-writes-refresh-working-context`, 2026-10-17); (f) entorno de máquina
  (`machine-environment-block`, 2026-10-25); (g) reporte de fallos (`session-failure-report`,
  2026-10-25); (h) intake de sesión, techo de lecturas acotado y aviso de overflow accionable
  (`orchestrator-session-start`, 2026-10-26). Sin nuevos deps ni cambios de schema de memoria.
  Evidencia: `CHANGELOG.md`, `aspec/changes/archive/`, `package.json`, `git tag`.

## Decisiones registradas en memoria del repo

- `dogfooding-versionado-init`: versionar `AGENTS.md`, `PRODUCT.md` y `aspec/`; ignorar
  `.opencode/`, `.ancletorc`, `.ancleto/`.
- `fix-init-tier-huerfano-0.6.36` y `fix-init-tier-guardado-0.6.37`: `init` debe aplicar el tier
  guardado a los agentes locales (paridad con `install`), incluido re-init sin flags.
- `cli.host-mcp-config-out-of-scope`: el MCP de host queda fuera de alcance salvo las
  excepciones de `opencode`/`antigravity` (y ahora `commandcode`/`copilot`).
- Evidencia: `.ancleto/memory.db` vía `ancleto memory list`.
