---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-11-03T10:45:00Z
pluginVersion: 0.18.6
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Reglas estructurales (declaradas)

1. **Zero-Dependencies de runtime + Node ≥ 24.** Sin `better-sqlite3` ni binarios nativos; el
   motor usa `node:sqlite` (`DatabaseSync`). `eslint` y `globals` son **sólo devDependencies**:
   `dependencies` sigue ausente/vacío. Una dependencia de runtime nueva rompe el contrato de
   costo y distribución. Evidencia: `package.json`, `eslint.config.js`,
   `DESIGN-memory-engine-v0.2.0.md`.
2. **Una sola versión activa por `memory_key`.** La supersesión es atómica en transacción
   `BEGIN IMMEDIATE`: marca el nodo previo `superseded` e inserta el nuevo; hay índice único
   parcial sobre activos. Evidencia: `DESIGN-memory-engine-v0.2.0.md`,
   `src/core/memory/engine.js`.
3. **Solo 3 tools expuestas al LLM** (`searchMemory`, `recordRule`, `recordDecision`).
   `source`, `confidence`, `status` e `id` los gestiona el runtime y **nunca** aparecen en el
   JSON Schema (`additionalProperties: false`; args forjados se ignoran). Export/import/gc/
   snapshot/merge/**consolidate** son **subcomandos CLI**, no tools. Evidencia:
   `DESIGN-memory-engine-v0.2.0.md`, `src/core/memory/tools.js`.
4. **Ciclo de vida del contexto.** *Rules* se recuperan proactivamente y se inyectan en
   `<ProjectMemoryRules>` como **datos no confiables**; *decisions* se recuperan reactivamente
   con `searchMemory`. El **orquestador no ejecuta esa tool**: delega la recuperación en
   `@memory-keeper`, único agente dueño de `.ancleto/memory.db`. Evidencia:
   `DESIGN-memory-engine-v0.2.0.md`, `agents/orchestrator.md`,
   `aspec/specs/memory-engine/spec.md`.
5. **Frontera repo vs agente.** La memoria del repo vive en `.ancleto/memory.db` (se comparte);
   la del agente (p. ej. engram) es de sesión. Una entrada vive en una sola. Evidencia:
   `README.md`, `AGENTS.md` (`LOCKED: memory-boundary`).
6. **Merge no destructivo de templates + reconciliación de superficies legadas.**
   `mergeTemplateInto(source, local, filename)` es el **punto único** de merge de
   `AGENTS.md`/`PRODUCT.md`; lo invocan `install`/`update`/`upgrade` (vía `copyTemplates`) **y**
   `import`. Antes de `mergeLocked` ejecuta `reconcileLegacyBlocks`: elimina listas planas
   legadas sólo con coincidencia **exacta** (tolerando CRLF/espaciado) y avisa sin tocar si el
   bloque fue personalizado. `mergeLocked` re-aplica el interior de `<!-- LOCKED: name -->`,
   preserva lo EXTENSIBLE, inserta bloques nuevos en el ancla correcta y no toca archivos con
   tags malformados. No debe existir una ruta que mergee `TEMPLATES` sin reconciliar. Evidencia:
   `src/cli/index.js`, `templates/AGENTS.md`, `aspec/specs/prompt-contracts/spec.md`.
7. **Contrato de validaciones declarativo.** El proyecto declara sus comandos en `PRODUCT.md` →
   `## Project Commands`; esa es la **fuente única**. Si falta una validación, se saltea y se
   registra la omisión; **nunca** se inventa runner/linter/formatter/typechecker. Format check
   sólo con formatter declarado; sin él, `not-configured`. Tests por comando declarado o rutas
   explícitas; nunca `node --test` pelado. Evidencia: `AGENTS.md`,
   `templates/AGENTS.md`, `PRODUCT.md`, `aspec/specs/prompt-contracts/spec.md`.
8. **Instalación de assets por host, dueño único `AGENT_TARGETS` + `installAgentAssets`.**
   `AGENT_TARGETS` es la **fuente única de rutas** (skills/agents/commands con `dir` y `ext`;
   `null` = no soportado). `installAgentAssets` materializa el destino nativo y devuelve las
   rutas; `unionInstalledPaths` las acumula. Antigravity no tiene dir de commands: sus
   `/cleto-*` se empaquetan como `.agents/skills/<n>/SKILL.md` y **no** se registran en
   `installedPaths.commands`. Cursor y Roo sólo tienen skills. Un asset no soportado no se
   escribe y avisa por stderr. Evidencia: `src/cli/index.js`, `units/cli-install.md`.
9. **Adaptación de frontmatter: dueño único y módulo puro.** Toda transformación vive en
   `src/core/adapters/frontmatter.js` (`adaptFrontmatter(content, host, assetKind, name) →
   string`): pura, sin E/S ni estado global. Dispatch: `opencode` y toda skill → identidad;
   `claude`/`vscode`/`copilot` + agents → `dropManagedKeys`; `antigravity`/`commandcode` +
   agents → transformación propia; `cursor`/`roo` → identidad + aviso; desconocido → identidad
   + aviso. Evidencia: `src/core/adapters/frontmatter.js`,
   `aspec/specs/skill-frontmatter-adapters/spec.md`.
10. **Antigravity: transformación determinista y conjunto cerrado de tools.** Orden: `name`,
    `description`, `tools` (siempre lista), `mainAgent`, `subagent`, `model: inherit`,
    `commandExecutionPolicy: sandbox`, `mcpServers`, `skills`, extras. `mode`: `primary` →
    (`true`,`false`), `subagent` → (`false`,`true`), sin `mode` → (`true`,`true`). Sólo se
    emiten 5 ids: `read→view_file`, `edit→replace_file_content`, `grep→grep_search`,
    `bash→run_command`, `todowrite→manage_task`. Otra clave se omite con aviso (un id
    inexistente cuelga el subagent). `skill` se saltea; `call_mcp_tool` prohibido; el MCP se
    expresa por `mcpServers`/`.agents/mcp_config.json`. Evidencia:
    `src/core/adapters/frontmatter.js`, `units/cli-install.md`.
11. **Command Code: layout nativo y semántica de `tools` invertida.** Usa
    `.commandcode/{skills,agents,commands}`. `adaptCommandCodeFrontmatter` inyecta `name`,
    preserva `description`, elimina `mode`/`color`/`temperature`/`permission` y **omite**
    `model` (hereda el de sesión; el tier no lo reescribe). `tools` sale como lista verificada;
    las tools de memoria usan `mcp__ancleto-memory__<tool>`. Clave sin id → omisión con aviso.
    **Inversión de default**: `tools` omitido significa "ninguna tool", por eso un origen sin
    `tools` emite `tools: "*"`. El MCP vive en `.mcp.json`. Evidencia:
    `src/core/adapters/frontmatter.js`, `README.md`, `CHANGELOG.md` (`0.12.1`),
    `aspec/specs/commandcode-support/spec.md`.
12. **`ancleto check` valida el frontmatter real contra el adaptador.** Compara cada `.md` de un
    directorio de agents contra `adaptFrontmatter(origen, host, 'agents', name)` (con la
    simulación de `model:` del tier en opencode y la nota de picker en copilot). La divergencia
    es **warning (⚠), no bloqueante**; sólo los faltantes cambian el exit code. Deriva el host
    de cada directorio del manifiesto multi-host (`installedHostsFromPaths`). Evidencia:
    `src/cli/index.js` (`checkAgentsFrontmatter`), `test/adapters-frontmatter.test.js`.
13. **Export/import/gc de memoria (`memory-ops`).** `exportActive()` devuelve sólo activos con
    `{memory_key, type, content, justification, scope, createdAt}` y **sanitiza paths
    absolutos**; los superseded no se exportan. `importNodes(json)` valida el schema y **aborta
    el batch entero** si una entrada es inválida; upsert por `memory_key`: inserta si no existe,
    supersede sólo si el `createdAt` del JSON es más reciente y **no reactiva** superseded.
    `gcSuperseded({days, dryRun})` purga superseded con **antigüedad de supersesión** mayor al
    umbral (default 30 días), medida como `COALESCE(superseded_at, created_at)`; las cuatro rutas
    de supersesión escriben `superseded_at`. Antes del DELETE limpia `superseded_by` de los
    elegibles; después hace `VACUUM`+`REINDEX` best-effort. Evidencia:
    `src/core/memory/engine.js`, `src/core/memory/database.js`, `src/cli/index.js`,
    `aspec/specs/memory-ops/spec.md`.
14. **Migración/importación `openspec/` → `aspec/` no destructiva.** `migrateLegacyOpenspec`
    copia recursiva con `force: false`, escribe `.migrated-from-openspec` y conserva
    `openspec/`; si `aspec/` ya tiene contenido real avisa y no migra. `detectLegacyOpenSpec`
    clasifica `none`/`legacy`/`external`; lo externo pide confirmación (default No, `--yes` para
    script) e importa sin pisar el `AGENTS.md` local. Punto único `maybeImportOpenspec`,
    invocado por `init`, `install --project` y `upgrade`. Evidencia: `src/cli/index.js`,
    `aspec/specs/aspec-bootstrap/spec.md`.
15. **MCP de host, dueño único `setupHostMcp`.** Excepciones: antigravity mergea
    `.agents/mcp_config.json` (`{ "mcpServers": { "<n>": { command, args, env } } }`),
    commandcode `.mcp.json` (`{ mcpServers: { <n>: { transport: 'stdio', command, args, env? }
    } }`) y copilot `copilot-mcp.json`; los tres **no destructivos** (preservan claves, no pisan
    homónimos; JSON inválido avisa sin escribir). El resto usa `mergeMcp` sobre `opencode.json`.
    `init` e `install` configuran MCP igual; `--no-mcp` es el escape. Evidencia:
    `src/cli/index.js`, `README.md`.
16. **Perfil `test`: overlay, no fork.** `installProfileOverlay` reinstala
    `profiles/test/agents` + `commands` sobre los destinos nativos (misma ext y adapter) y
    `copyTemplates` lee `profiles/test/templates/`; el paquete base queda intacto y el tier sigue
    ortogonal. Evidencia: `src/cli/index.js`, `profiles/test/`,
    `aspec/specs/test-profile/spec.md`.
17. **Portabilidad = intención, no rutas.** `export` genera bundle + `manifest.json` con sólo
    nombres+tipos de MCP; aborta si hay absolutos. `import` aplica portables y **regenera**
    entradas con el host local (`mcpCommandBroken`), sin pisar sanas, y cierra con `doctor`.
    Nunca se exportan credenciales, `service.json`, global ni `memory.db`. Evidencia:
    `src/cli/index.js`, `aspec/specs/project-portability/spec.md`.
18. **Linter mínimo: 4 reglas, sin estilo.** Flat config con `ecmaVersion: latest`,
    `sourceType: module`, globals de Node y exactamente `no-undef`, `no-unused-vars` (ignora
    `^_`), `eqeqeq` (`always`) y `no-dupe-keys`. Sin Prettier ni plugins. Evidencia:
    `eslint.config.js`, `test/linter-config.test.js`, `aspec/specs/linter-standard/spec.md`.
19. **Patrón "CLI materializa + agente lee".** `memory context` escribe
    `.ancleto/working-context.md`; el orquestador lo lee como datos no confiables sin `bash`.
    El mismo patrón rige `.ancleto/machine-env.md`. Evidencia: `agents/orchestrator.md`,
    `src/core/memory/working-context.js`, `src/core/machine-env.js`.
20. **Compresión (caveman) host-scoped, con compuerta de medición.** El CLI configura el MCP de
    compresión por defecto cuando el binario está disponible, como **configuración del host**
    (sólo `opencode`/`antigravity`). La **directiva de uso** se materializa sólo en superficies
    cuyo MCP incluye la tool (`hostSupportsCompression`/`hostConfigHasCompression`,
    `CAVEMAN_USAGE_NOTE`), nunca en texto compartido. El default es reversible a opt-in si
    `ancleto stats` no muestra descenso neto. Evidencia: `src/cli/index.js`,
    `aspec/specs/prompt-contracts/spec.md`.
21. **Día-cero del working-context.** El CLI no omite materializar `.ancleto/working-context.md`
    por ausencia de `.ancleto/memory.db`: si existe `.discovery-map.json`, escribe el bloque
    `<ProjectTopology>` (creando `.ancleto/` si falta) **sin abrir el motor**. Render único
    (`renderWorkingContextBlock`) compartido por lifecycle y `memory context`;
    `buildWorkingContext` conserva firma, default `cwd` y resultado `null` sin topología ni
    reglas. Evidencia: `src/cli/index.js`, `src/core/memory/working-context.js`,
    `aspec/specs/memory-engine/spec.md`.
22. **Procedencia `source` runtime-owned y compuerta de validación.** `source` se resuelve desde
    `context.source || 'runtime'`, **nunca** desde args del caller, con vocabulario estable:
    `mcp:ancleto-memory`, `cli:import`, `runtime` y `agent:<rol>` (sólo si un runtime confiable
    lo provee). Se expone en `listNodes`/`memory list --json` pero **no** en `searchMemory` ni en
    los JSON Schema. Decide una única cosa: si la escritura pasa por la validación de refs; la
    exención es exactamente `runtime`. No es un canal de autorización/autenticación. Evidencia:
    `src/core/memory/engine.js`, `src/core/memory/mcp-server.js`,
    `aspec/specs/memory-engine/spec.md`.
23. **Fuente única de reglas compartidas + guards por comportamiento.** Toda regla que se
    declaraba en skill y agente pasa a tener **un único hogar canónico**: las transversales
    viven en `AGENTS.md` (bloques `LOCKED`) y las demás superficies **referencian** sin repetir
    texto. `test/content-guards.test.js` aserta keywords de comportamiento y salvaguardas, no
    redacción literal. Evidencia: `AGENTS.md`, `templates/AGENTS.md`,
    `aspec/specs/prompt-contracts/spec.md`.
24. **Actualización de artifacts (`ancleto-update`).** Clasificación vigente: requisito/
    comportamiento → `specs/<capability>/spec.md`; **decisión de diseño →
    `proposal.md ## Decisiones`**; alcance → `proposal.md`; trabajo nuevo → `tasks.md`.
    `design.md` **no** se crea ni se actualiza. Detecta drift entre delta specs y specs
    principales y pregunta el modo de escritura (in-place vs `rev2`). Evidencia:
    `skills/ancleto-update/SKILL.md`, `aspec/specs/artifact-update/spec.md`.
25. **Affected-set determinístico por grafo de imports.** El conjunto afectado es la **clausura
    transitiva de dependientes** sobre el grafo de imports, sembrada por los task-owned files e
    incluyendo siempre los tocados; es determinístico, objetivo de verificación de `@tester` y
    scope de review de `@reviewer`. Vive en `src/core/affected-set.js` (zero-dep) y se expone
    read-only por `ancleto affected`. Cobertura: `import`, `import … from`, `export … from`,
    `require(...)` e `import(...)` con literal puro, sobre `.js/.mjs/.cjs/.ts/.tsx`; respeta los
    ignores de topología. Taxonomía cerrada: relativo resoluble → arista; no relativo
    (paquete/builtin/alias) → `externalCount`; llamada con argumento no literal → `unresolved`;
    relativo irresoluble → `unresolved`. Si el proyecto declara su propio mecanismo en
    `PRODUCT.md` → `## Project Commands`, ése tiene prioridad. Evidencia:
    `src/core/affected-set.js`, `src/cli/index.js`, `aspec/specs/prompt-contracts/spec.md`.
26. **Pipeline de mayor throughput.** (a) cierre en paralelo: tras aprobar archive y **con
    candidato real**, `@orchestrator` delega `@documenter` ∥ `@memory-keeper` (superficies
    disjuntas); (b) reviewer sin rebote: `@tester` produce un Validation Ledger completo;
    (c) affected-set como scope; (d) memoria en un solo paso: como máximo **una** llamada, sólo
    con candidato real. La **promoción de decisiones aprobadas queda fuera** de ese presupuesto.
    Evidencia: `agents/{orchestrator,tester,reviewer,memory-keeper}.md`,
    `aspec/specs/prompt-contracts/spec.md`, `aspec/specs/review/spec.md`.
27. **Refresh on-write del working-context en ambas superficies.** El bloque se regenera tras
    cualquier escritura que pueda alterarlo: (a) **MCP**, filtrado por
    `shouldRefreshWorkingContext(result)`; (b) **CLI**, `refreshWorkingContextOnWrite`,
    **compare-based** (reescribe sólo si el bloque difiere; no crea archivo vacío; reusa la
    conexión abierta). Lo invocan `memory import`, `memory merge` (real) y
    **`memory consolidate --apply`**. La regeneración usa el **mismo camino único de render**.
    Evidencia: `src/cli/index.js`, `src/core/memory/working-context.js`,
    `aspec/specs/memory-engine/spec.md`.
28. **Detección de staleness del working-context (advisory).**
    `checkWorkingContextFreshness` renderiza el bloque esperado y lo compara (CRLF, espacios
    finales, salto final) contra `.ancleto/working-context.md`, devolviendo `ok`/`ausente`/
    `desactualizado`. Es read-only; se expone como `Working-context: <estado>` en
    `memory doctor` y **no** altera el exit code. Evidencia:
    `src/core/memory/working-context.js`, `src/cli/index.js`.
29. **Entorno de máquina: artefacto local, dueño único y exclusión sin `.gitignore`.**
    `src/core/machine-env.js` es el único dueño de detectar, renderizar, escribir y excluir
    `.ancleto/machine-env.md`; ni el lifecycle ni `check` reimplementan formato, comparación o
    rutas. No forma parte de `working-context.md` ni de `AGENTS.md`. La escritura es idempotente
    (ignora `generated_at`). La exclusión usa `rev-parse --show-toplevel` + `--show-prefix` para
    componer `<prefix>.ancleto/machine-env.md`, consulta `check-ignore --no-index` antes y
    después, y agrega **una** entrada a `info/exclude`; nunca toca `.gitignore`. `ancleto check`
    advierte si quedó trackeado, sin cambiar el exit code. Evidencia:
    `src/core/machine-env.js`, `aspec/specs/machine-environment/spec.md`.
30. **Entrega del entorno a todos los subagentes y precedencia.** Las 10 definiciones contienen
    la instrucción canónica de leer `.ancleto/machine-env.md` antes de ejecutar comandos; si no
    existe, continúa con la guía genérica y reporta la ausencia. `agents/orchestrator.md` agrega
    `## Machine Environment`, incluye el bloque **verbatim** en cada delegación con
    `bash: true` y **no** para `@spec-writer`, `@reviewer` ni `@memory-keeper`. La lectura
    proactiva **no consume** el techo de 3 archivos. El bloque prevalece sobre indicaciones
    genéricas de shell, pero **nunca** sobre seguridad, autorización, validación, permisos o
    instrucciones explícitas. Evidencia: `agents/*.md`, `src/core/machine-env.js`,
    `aspec/specs/machine-environment/spec.md`.
31. **Reporte de fallos de herramientas (`session-failure-report`).** `ancleto stats failures`
    lee **sólo lectura** la tabla `part` de opencode y considera fallo a `state.status='error'` o
    `metadata.exit` presente y distinto de 0. Clasifica con precedencia `tool`, `env` (exit
    127/9009 o señales de entorno), `check` (exit ≥ 1 legítimo) y `unknown`. Agrupa por
    proyecto, herramienta, clase y esqueleto; **nunca** imprime `title`, `output`, `state.error`
    ni `input` de no-shell, y enmascara secretos, rutas y wrappers. Evidencia:
    `src/cli/index.js`, `aspec/specs/session-failure-report/spec.md`,
    `test/stats-failures.test.js`.
32. **El aviso de overflow nombra sólo capacidades que el orquestador tiene.** Se emite
    **incondicionalmente** al truncar el bloque de reglas y su texto **no** menciona
    `searchMemory`: indica delegar **un** Recall a `@memory-keeper` con el topic de la tarea.
    Conserva el conteo, el registro por consola y el presupuesto (`MAX_TOKENS = 2000` ×
    `CHARS_PER_TOKEN = 4` = 8.000 caracteres). El consumidor es `@orchestrator`: trigger
    inmediato de **exactamente un** Recall **antes** de delegar otra etapa. Evidencia:
    `src/core/memory/engine.js`, `agents/orchestrator.md`,
    `aspec/specs/memory-engine/spec.md`, `test/memory-engine.test.js`.
33. **Techo de lecturas del orquestador: 3 archivos + exenciones.** Máximo **3 archivos** no
    dirigidos; **exentos** (a) `.ancleto/working-context.md` y `.ancleto/machine-env.md` y
    (b) hasta **5 archivos nombrados explícitamente en un mensaje**. Por encima, la lectura se
    **delega** a `@technical-discovery` (sin conteo adicional). Evidencia:
    `agents/orchestrator.md`, `aspec/specs/prompt-contracts/spec.md`.
34. **Intake de sesión read-only.** (1) lista una vez `aspec/changes/` **excluyendo
    `archive/`**; (2) cuando el pedido **toca el estado del repositorio** delega **exactamente
    un** `git status --short` a `@technical-discovery`; (3) **reporta sólo diferencias**:
    árbol limpio y sin change ajeno ⇒ silencio. Enabler: allowlist `'*': deny` con dos
    literales (`ancleto discovery --check`, `git status --short`). Evidencia:
    `agents/orchestrator.md`, `agents/technical-discovery.md`,
    `aspec/specs/prompt-contracts/spec.md`.
35. **Disponibilidad de herramientas = resoluble Y invocable.** `detectMachineFacts` resuelve el
    candidato en `PATH` (en `win32`, `PATHEXT` antes del nombre exacto) y **lo ejecuta** con
    `--version`: sólo el éxito habilita `disponible`. Intentos acotados por
    `TOOL_PROBE_TIMEOUT_MS = 2000` y `TOOL_PROBE_BUDGET_MS = 10000`; `GIT_TIMEOUT_MS = 5000`.
    En `win32` los shims `.cmd`/`.bat` se sondean por `ComSpec`; `EINVAL` es **inconclusa**. El
    veredicto es de tres estados (`ok`/`blocked`/`inconclusive`); un inconcluso **nunca**
    habilita `disponible` ni agrega sufijo; un fallo real se publica saneado y sin versión.
    Evidencia: `src/core/machine-env.js`, `aspec/specs/machine-environment/spec.md`,
    `test/machine-env.test.js`.
36. **Snapshot consistente con historial.** `snapshotDatabase(dbPath, outPath, { overwrite })` es
    el dueño único de la copia binaria. Usa `VACUUM INTO` sobre una conexión fuente
    **read-only**, sin pragmas ni migraciones: copia el estado commiteado (WAL incluido) y el
    historial completo, a diferencia de `memory export`. El destino viaja como **parámetro
    vinculado**. Rechaza `target == source` por **identidad de archivo**
    (`realpathSync.native`). Escribe en un temporal del mismo directorio, verifica
    `quick_check` y recién entonces reemplaza; en Windows aparta el destino previo a un `.bak` y
    lo restaura si el movimiento final falla. Sin `--force`, un destino existente es error.
    Evidencia: `src/core/memory/snapshot.js`, `aspec/specs/memory-ops/spec.md`.
37. **`memory doctor` estrictamente read-only por defecto.** Abre con
    `openDatabase(dbPath, { migrate: false, readonly: true })`: sin checkpoint, sin DDL ni
    `INSERT` sobre FTS. Los **cinco** checks, en orden: `Integridad DB`, `Indice FTS5`,
    `Reglas activas (unicidad)`, `Refs de nodos activos` y `Checkpoint WAL`. `Indice FTS5`:
    índice ausente ⇒ **falla**; sombra no consultable ⇒ **omitido**; si no, compara
    `memory_fts_docsize` contra `memory_nodes`. `Refs de nodos activos` usa `inspectRefs`
    (read-only): cada `spec:`/`change:`/`path:` no resuelta es falla con
    `"<memory_key>" -> <ref> (<motivo>)`; `commit:`/`workitem:` no se resuelven y se cuentan
    aparte. `Checkpoint WAL` reporta el tamaño del `-wal` sin checkpointear. `--rebuild` es el
    único camino de escritura. Evidencia: `src/core/memory/doctor.js`,
    `src/core/memory/engine.js`, `aspec/specs/memory-ops/spec.md`.
38. **Merge de nodos por supersesión, sin tabla nueva.** `engine.merge({ target, sources,
    dryRun })` supersede cada source activa hacia un target activo, reutilizando el statement
    `supersede` y el patrón transaccional de `recordNode`. `validateMerge` —compartida por el
    engine de escritura y el read-only— falla cerrado antes de abrir transacción: target
    obligatorio y activo; sources no vacías, sin repetidas, distintas del target, activas y con
    el **mismo `type`**. No inserta nodos ni acepta contenido. Bajo lock revalida target y
    sources. El read-only sólo permite `dryRun`. El CLI refresca el working-context tras un
    merge real; si falla, el merge ya está commiteado y sale ≠ 0 informándolo. Evidencia:
    `src/core/memory/engine.js`, `src/cli/index.js`, `aspec/specs/memory-ops/spec.md`.
39. **Checkpoint de contrato tras `@spec-writer`.** Cuando el change requirió especificación, el
    orquestador presenta el **contrato del cambio**, no sus documentos: intención, alcance
    (dentro/fuera), Requirement nuevo o `spec:<capability>#<requirement>`, riesgos con
    mitigación, decisión de arquitectura (si existe), validación prevista y paths autorizados.
    Cabe en menos de una pantalla, **nunca** enumera filenames y no condiciona el stop a que
    exista `design.md`. La aprobación autoriza **sólo** implementar; archive y merge son stops
    separados. Un cambio de alcance/riesgo/arquitectura exige enmienda y nueva aprobación.
    Evidencia: `agents/orchestrator.md`, `aspec/specs/prompt-contracts/spec.md`.
40. **`## Decisiones` en `proposal.md`, con dueño único del shape.** Cada proposal registra sus
    decisiones duraderas —elección, alternativa descartada, justificación, refs y estado— en
    bloque de seis campos (`memory_key`, `Elección`, `Descartado`, `Justificación`, `Refs`,
    `Estado`) o en la forma de una línea semánticamente equivalente. `Estado` ∈
    `propuesto|aprobado|enmendado|descartado`. El shape se define **una sola vez** en
    `agents/spec-writer.md`; los generadores del proposal sólo referencian esa fuente. La
    sección se completa **también durante la implementación**: un tradeoff no previsto lo
    apendea `@spec-writer` sin nueva aprobación salvo que cambie alcance, riesgo o arquitectura.
    Evidencia: `agents/spec-writer.md`, `agents/orchestrator.md`,
    `skills/ancleto-{propose,new,ff,continue,onboard}/SKILL.md`.
41. **Refs normalizadas dentro de `content` y validación fail-closed en `recordNode`.** No hay
    tabla ni columna nueva: las refs viajan en `content` como bloque `refs:` (línea `refs:` +
    lista con guion) y se resuelven sobre el texto indexado. Gramática cerrada:
    `spec:<cap>#<heading>`, `change:<slug>`, `path:<repo-relative>`, `commit:<sha>` y
    `workitem:<tracker>:<key>`. `change:<slug>` lleva el **slug sin prefijo de fecha**; la fecha
    la aporta `archive/`. Los items pueden ir **indentados o no**; el bloque termina en la
    primera línea en blanco o en la primera línea no indentada que no es item. `validateRefsForWrite`
    corre **antes** de la transacción: exige exactamente un bloque, al menos una ref y falla
    cerrado ante gramática inválida, prefijo desconocido, `path:` absoluto o con `../`, ref
    irresoluble o ambigua. Una `decision` exige `spec:` o `change:`; una `rule` exige `path:`,
    `spec:` o `change:`. La **única exención** es `context.source === 'runtime'`. Sin backfill.
    `importNodes` no pasa por `recordNode` (LWW). `inspectRefs` reutiliza parser y resolución.
    Evidencia: `src/core/memory/engine.js`, `aspec/specs/memory-engine/spec.md`,
    `aspec/specs/memory-ops/spec.md`.
42. **Resolución de refs.** `change:<slug>` busca el change activo y un archive anclado exacto
    `YYYY-MM-DD-<slug>` (no sufijo suelto) y reporta ambigüedad. `spec:<cap>#<heading>` lee
    `aspec/specs/<capability>/spec.md`, compara headings `### Requirement:` por forma exacta y
    canonizada (trim, minúsculas, sin diacríticos, sin backticks/`**`), deduplica por bloque y
    **reporta ambigüedad** en vez de elegir el primero. `path:` se normaliza **antes** del
    chequeo de existencia (colapsa `[\\/]+` a `/`, quita `.`, quita `:\d+`), rechaza absolutos y
    `..`, y devuelve posix repo-relativo; la validación es **léxica y de existencia**, sin
    `realpath` ni containment de symlinks. `commit:` y `workitem:` sólo se validan por
    gramática. Evidencia: `src/core/memory/engine.js`,
    `aspec/specs/memory-engine/spec.md`.
43. **Rechazo de secretos en el camino de escritura, sin eco del valor.** `recordNode` inspecciona
    `content` y `justification` con `looksLikeSecret` antes de abrir la transacción y rechaza
    claves tipo `sk-`, `ghp_`, `AKIA`, `Authorization: Bearer`, `*TOKEN/SECRET/PASSWORD=...` y
    bloques `BEGIN ... PRIVATE KEY`. El error nombra la `memory_key` y el campo, **nunca** repite
    el valor. Evidencia: `src/core/memory/engine.js`,
    `aspec/specs/memory-engine/spec.md`.
44. **Render proactivo sin el bloque `refs:`.** `buildWorkingContext` inyecta sólo `rule` activas;
    por cada regla usa `renderRuleContent(content)`, que recorta desde `refs:` hasta el final del
    bloque. El `content` **almacenado** queda intacto. Las refs no consumen el presupuesto. Una
    regla sin `refs:` se renderiza completa. Evidencia:
    `aspec/specs/memory-engine/spec.md`.
45. **Promoción al archivar sólo de decisiones aprobadas.** El gate de
    `skills/ancleto-archive/SKILL.md` lee `proposal ## Decisiones` y considera candidato sólo un
    bloque con **`memory_key` propia y `Estado: aprobado`**; la forma de una línea nunca es
    candidata y una `rule` nunca se promueve desde ahí. Hace **preflight del lote completo antes
    de la primera escritura**: claves propias y únicas, refs presentes y resolubles, ningún
    `path:` dentro de `aspec/changes/<change-name>/` y ningún candidato de sesión; una violación
    ⇒ **cero escrituras** y el change no se mueve. Con candidatos válidos delega **una** pasada
    de `@memory-keeper` en modo Promotion, que escribe **un `recordDecision` por bloque** (nunca
    `recordRule`). Sin candidatos ⇒ **cero escrituras y cero delegación**. Corre **después** del
    merge de specs y **nunca en paralelo**. Evidencia: `skills/ancleto-archive/SKILL.md`,
    `agents/memory-keeper.md`, `agents/orchestrator.md`,
    `aspec/specs/memory-engine/spec.md`.
46. **`opencode.json` en la raíz: override del host, fuera del paquete.** Fija
    `agent.model = commandcode/deepseek/deepseek-v4.1-flash` para los 10 subagentes.
    `package.json` → `files` no lo publica. Es configuración del checkout, no contrato del
    producto. Evidencia: `opencode.json`, `package.json`, `CHANGELOG.md` (`0.18.1`).
47. **Retiro de `design.md` y `context.md` sin artifact sucesor** (archivado el 2026-10-30;
    **publicado en `0.17.1`**). El flujo nuevo produce **sólo** `proposal.md`, `tasks.md` y
    `specs/`; ningún generador emite los retirados. Una decisión durable va a
    `proposal.md ## Decisiones`. Los consumidores los tratan como lectura **opcional**, nunca
    precondición. `ancleto-verify` mide completitud contra `tasks.md` + `specs/`. El archive
    **mueve el directorio sin modificarlo**: no borra `context.md` ni reescribe artifacts.
    Evidencia: `aspec/specs/artifact-update/spec.md`,
    `aspec/specs/prompt-contracts/spec.md`, `test/content-guards.test.js`.
48. **MEM-04 reutiliza el camino de escritura; no crea comando ni tabla** (`0.18.0`). El
    diagnóstico de refs es un **check del doctor** (`Refs de nodos activos`), no un subcomando.
    `inspectRefs({ nodes, projectRoot })` es read-only y pura, y reutiliza `parseRefsBlock` +
    `resolveRefResult`; `validateRefsForWrite` conserva sus mensajes. `commit:`/`workitem:` no se
    verifican; se excluyen de las rotas y se cuentan aparte en el `detail`. El check se omite sólo
    bajo las tres condiciones del requirement y nunca baja `healthy` ni el exit code. Evidencia:
    `src/core/memory/engine.js`, `src/core/memory/doctor.js`,
    `aspec/specs/memory-ops/spec.md`.
49. **Gramática de refs: indentación opcional y bloque terminal.** Los items pueden ir
    indentados o no. El bloque empieza en `refs:` y continúa por cada item (`- ` con cualquier
    indentación) y por cada línea indentada; termina en la primera línea en blanco o en la
    primera no indentada que no es item. Una línea no-item dentro del bloque es inválida; un
    bloque repetido también. En escritura `validateRefsForWrite` **lanza**; en el doctor
    `inspectRefs` **reporta** sin abortar. Un bloque vacío no aporta refs y no es falla.
    Evidencia: `src/core/memory/engine.js`, `aspec/specs/memory-engine/spec.md`.
50. **Modelo de agentes: tres superficies y precedencia limitada.** `agents/*.md` (canónica y
    publicada), `.opencode/agents/*.md` (mirror que regenera `upgrade`) y
    `~/.config/opencode/agents/*.md` (global que carga el runtime). `opencode.json` →
    `agent.<nombre>.model` aplica al agente **primario**, no a los subagentes. `install`/`update`
    reescriben `model:` por tier; `upgrade` no aplica tier. Verificación con `Select-String`;
    `ancleto check` reporta divergencias del adaptador. Evidencia: `AGENTS.md`,
    `src/cli/index.js`.
51. **Resolver de refs navegables: una sola API read-only (`MEM-04b`, publicado en `0.18.3`).**
    `resolveNodeRefs({ content, projectRoot })` se exporta desde `src/core/memory/engine.js` y es
    la **única** superficie de resolución para recall. Reutiliza `parseRefsBlock` y
    `resolveRefResult`; **no** crea módulo/parser/resolvedor paralelo, comando CLI, tool MCP,
    tabla/columna ni migración, y **no** escribe en DB ni filesystem. `inspectRefs`,
    `validateRefsForWrite` y `doctor.js` no cambian. Evidencia:
    `src/core/memory/engine.js`,
    `aspec/changes/archive/2026-11-02-mem-04b-resolver-referencias-navegables/`.
52. **Contrato del resolver.** Devuelve `{ refs, error, blocks, needsRoot }`; cada entrada trae
    `raw`, `kind`, `verifiable` y, si aplica, `ok`, `path`, `heading`, `reason` o `matches`.
    `change:` → path repo-relativo del directorio activo o archive. `spec:` →
    `aspec/specs/<capability>/spec.md` + texto **real** del heading. `path:` → path
    repo-relativo normalizado, sin `:línea`. `commit:`/`workitem:` → `verifiable: false`, sin
    ubicación ni `reason`. Ambigüedad → `ok: false`, `reason` `ambiguo (<n> coincidencias)`.
    Sin raíz y con refs verificables → `needsRoot: true` y `reason` `sin raíz`. Línea inválida
    → `refs: []` + `error`; más de un bloque → `refs: []` + `blocks`. Error de lectura por ref →
    `inválido (lectura no disponible: <CODE>)`, sin abortar las demás. Evidencia:
    `src/core/memory/engine.js`, `aspec/specs/memory-engine/spec.md`.
53. **Orden determinístico de inyección (`0.18.4`).** Dentro del scope ya filtrado, el orden es
    **total**: (1) jerarquía de scope `task` → `feature` → `project`; (2) **anclaje declarado**:
    primero las reglas con al menos una ref `spec:`/`change:`/`path:` en su bloque `refs:`;
    (3) `created_at` descendente; (4) `memory_key` lexicográfico ascendente (sin locale). El
    anclaje se decide **sólo parseando** `refs:`: no resuelve refs, no consulta filesystem/DB y
    no agrega I/O. Un bloque ausente/inválido/múltiple o que sólo declara `commit:`/`workitem:`
    **no ancla**. Evidencia: `src/core/memory/engine.js`
    (`scopeRank`, `declaresAnchor`), `aspec/specs/memory-engine/spec.md`.
54. **Presupuesto del bloque y manifiesto de omitidas (`0.18.4`).** El bloque completo
    `<ProjectMemoryRules>` —wrapper, etiqueta de datos no confiables, reglas y
    `<ContextOverflowWarning>`— respeta `maxTokens × CHARS_PER_TOKEN`. Antes de cortar reglas
    reserva para el aviso `min(1.500, 15 % de maxChars)`, acotado a `maxChars`. Si no entra el
    piso fijo, devuelve un bloque XML bien formado sin reglas. El aviso conserva el conteo, el
    log por consola y la delegación de Recall; **lista hasta 40 `memory_key` omitidas** en orden
    de inyección y agrega `+N` para las no listadas. Las claves listadas son siempre un prefijo
    del orden de inyección. Evidencia: `src/core/memory/engine.js`
    (`formatOverflowWarning`, `MAX_OMITTED_KEYS`), `aspec/specs/memory-engine/spec.md`.
55. **Consolidación determinística y reversible (`0.18.5`).** `ancleto memory consolidate
    [--dry-run] [--apply] [--json]` es un wrapper fino sobre `engine.consolidate({ dryRun =
    true })`; no agrega tool MCP. **Duplicado exacto** = mismo `type` + `content` normalizado
    (sin `refs:`, trim, whitespace colapsado, minúsculas, sin diacríticos) idéntico; la prosa
    vacía (sólo `refs:`) no agrupa. **Canónico** por orden total: más refs declaradas >
    `created_at` más reciente > scope más amplio (`project` > `feature` > `task`) > `content`
    más largo > `rule` antes que `decision` > `memory_key` lexicográfico. `--apply` sólo marca
    `status='superseded'` y `superseded_by=<id del canónico>`, en una transacción; no borra
    filas ni crea nodos. **Near-dups** (mismo `type` y `scope`, `content` distinto, Jaccard
    ≥ 0,60 sobre tokens whitespace deduplicados) **sólo se reportan**; `--apply` no los toca.
    Dry-run usa conexión read-only; `--apply` refresca el working-context y, si falla, reporta
    "aplicado, bloque desactualizado" sin revertir. Revertir exige un `memory snapshot` previo.
    Evidencia: `src/core/memory/engine.js` (`consolidate`, `compareCanonical`),
    `src/cli/index.js` (`memoryConsolidate`), `aspec/specs/memory-ops/spec.md`.
56. **Curación de provenance separada del render (`0.18.4`).** Los nodos históricos sin refs se
    curan por runbook y aprobación por lote, fuera del render: éste no backfillea, no revalida ni
    reescribe. En el estado actual **todos los activos declaran `refs:`** (125 activos, 344 refs,
    0 rotas); la deuda de provenance quedó cerrada. Evidencia:
    `aspec/changes/archive/2026-11-02-memory-ranking-y-omisiones-visibles/`,
    `node src/cli/index.js memory doctor`.
57. **Recall task-aware con orden total y preview expandible (`MEM-05`, `0.18.6`).**
    `searchMemory` ordena de forma total y determinística —`required`, anclaje declarado, scope,
    `bm25` y `memory_key`, sin `rowid`— y devuelve por defecto un **preview** (prefijo literal de
    hasta 240 caracteres, `limit` 5 y `content_truncated`); `expand: true` devuelve el payload
    completo y `keys` expande sólo claves presentes en la página. `required` es una **entrada de
    la llamada**, no estado del nodo: promueve claves al frente y falla si excede el `limit`
    efectivo o el presupuesto, en vez de degradarse a una omisión. `buildWorkingContext` acepta
    `{ required }` y falla con un diagnóstico que nombra la `memory_key` y sus refs resueltas.
    El subconjunto devuelto es el prefijo del orden total (rankear antes de recortar). Evidencia:
    `src/core/memory/engine.js`, `aspec/specs/memory-engine/spec.md`,
    `aspec/changes/archive/2026-11-02-mem-05-recall-task-aware/`.
58. **GC mide la edad de supersesión (`MEM-05b`).** `memory_nodes` incorpora `superseded_at TEXT`
    como columna aditiva; la migración sólo hace `ALTER TABLE` si falta y el backfill copia
    `created_at` en superseded históricos, preservando la elegibilidad previa. Las cuatro rutas
    de supersesión (`recordNode`, `importNodes`, `merge`, `consolidate`) escriben el instante en
    el mismo statement. `gcSuperseded` usa `COALESCE(superseded_at, created_at)` con un **único
    cutoff calculado en JS** (segundos, sin milisegundos) compartido por dry-run y purge, y antes
    del `DELETE` limpia `superseded_by` de los elegibles para no violar la FK. Los statements que
    referencian la columna se preparan lazy para que un engine read-only sobre una base previa
    siga construyendo. Evidencia: `src/core/memory/{database,engine}.js`,
    `aspec/specs/memory-ops/spec.md`,
    `aspec/changes/archive/2026-11-02-mem-05b-gc-superseded-age/`.
59. **Protocolo de memoria canónico y reconciliación legacy gateada.** El protocolo de memoria
    vive en `AGENTS.md` → `LOCKED: memory-protocol` y `PRODUCT.md`/`templates/PRODUCT.md` sólo
    apuntan; el aviso de overflow nombra `memory_key` omitidas y no menciona `searchMemory`. La
    reconciliación de superficies planas legadas se aplica **antes** de `mergeLocked`, sólo con
    coincidencia exacta, gateada por `requiresInSource` (si el template no trae el reemplazo
    canónico, no se borra el run legado) y con las líneas de bloques `LOCKED` y code fences
    enmascaradas. Un bloque `LOCKED` nuevo se inserta separado por exactamente una línea en
    blanco. Evidencia: `src/cli/index.js` (`reconcileLegacyBlocks`, `maskLockedLines`,
    `mergeTemplateInto`), `AGENTS.md`, `aspec/specs/prompt-contracts/spec.md`.

## Seed incremental (contrato del discovery)

- `ancleto discovery --check` devuelve `state` + `impact`:
  - `none` → sin cambios.
  - `minor` → cambios no materiales (el agente trabaja y lo anota, no ofrece regenerar).
  - `material` → cambió un config de runtime, entry point o apareció/desapareció un directorio
    raíz nuevo (o un archivo material como `package.json`).
- **Reporte que originó esta regeneración**: `STALE` / `impact: material`;
  `changedAreas: [".ancleto", ".ancletorc", ".opencode", "AGENTS.md", "CHANGELOG.md",
  "PRODUCT.md", "README.md", "agents", "aspec", "docs", "package.json", "skills", "src",
  "templates", "test"]`; `materialReasons: ["archivo material modificado: package.json"]`; los 11
  documentos del seed en `affectedDocs`. La causa es el salto a `0.18.6` (CHANGELOG,
  `package.json`, `engine`, `database`, CLI, `memory-keeper`, specs y tests) y los artefactos
  derivados del discovery; `.ancleto` es estado local, no producto versionado.
- Con `impact: minor` y `affectedDocs` no vacío, el seed-writer reescribe **sólo** esos
  documentos; con `impact: material` se regenera el seed completo. El mapeo vive en
  `seed-map.json`; sin ese archivo la regeneración es completa.
- **`affectedDocs` (seed) ≠ `affected-set` (change).** El primero son documentos del seed; el
  segundo es la clausura de dependientes por grafo de imports (`ancleto affected`).
- Al archivar un change, el seed puede quedar `STALE`; `AGENTS.md`
  (`LOCKED: seed-freshness`) define el procedimiento (verificar, avisar, regenerar sólo con
  aprobación).
- **Falsos positivos del check**: `package-lock.json` puede figurar como "área raíz eliminada"
  porque está en `config.exclude` (no se hashea), pero existe; `audit logs/` (untracked) y
  `documentation/` (gitignored) pueden aparecer como áreas nuevas porque `computeSources`
  recorre el disco con `DEFAULT_IGNORES` + `exclude` y **no** aplica `.gitignore`.
- **Detección material por archivo, no por contrato**: cualquier bump de `package.json` marca
  `impact: material` aunque no cambie comportamiento. En esta corrida el motivo fue
  `0.18.5` → `0.18.6`.
- `EXPECTED_DOCS` = 8 documentos raíz (`index`, `overview`, `setup`, `inventory`, `integrations`,
  `decisions`, `unknowns`, `units/_map`).
- Evidencia: `README.md`, `src/cli/index.js` (`checkDiscovery`, `computeImpact`,
  `readSeedMap`, `affectedDocsFor`), `AGENTS.md`.

## Riesgos, deuda y acoplamiento

- **Publicación `0.18.3`–`0.18.6`.** `0.18.3` publicó MEM-04b; `0.18.4` el orden por anclaje y
  las omisiones visibles; `0.18.5` la consolidación; `0.18.6` el recall task-aware y el protocolo
  canónico de memoria. Los changes están archivados y sus specs fuente mergeadas. Evidencia:
  `git log`, `CHANGELOG.md`, `aspec/changes/archive/`.
- **`memory consolidate` no es reversible por CLI.** No hay "unsupersede": revertir exige un
  `memory snapshot` previo. `--apply` conserva `id` y `superseded_by`, así que el historial es
  reconstruible, pero no hay comando de restauración. Evidencia:
  `src/core/memory/engine.js`, `src/cli/index.js`.
- **La elegibilidad de `memory gc` ahora depende del backfill.** MEM-05b cerró la distorsión de
  purgar por `created_at`, pero una fila histórica sin `superseded_at` recibe `created_at` como
  `superseded_at` (preserva la elegibilidad previa, no otorga gracia retroactiva). Las filas
  superseded por las rutas vigentes sí llevan el instante real. `--dry-run` permite auditarlo.
  Evidencia: `src/core/memory/database.js`, `src/core/memory/engine.js`.
- **La normalización de consolidate puede unir nodos que difieren sólo en mayúsculas, espacios
  o diacríticos.** Es la definición acordada de duplicado exacto; el dry-run permite revisarlo.
  El criterio "`content` más largo" puede favorecer nodos con más texto de refs, pero la
  cantidad de refs decide antes y `memory_key` cierra el orden. Evidencia:
  `aspec/specs/memory-ops/spec.md`.
- **Los near-dups no se consolidan.** Jaccard ≥ 0,60 sólo se reporta; no hay guard por similitud
  en `recordNode` ni auto-merge semántico. La calibración queda para una medición futura.
  Evidencia: proposal de `2026-11-02-memory-consolidacion-autonoma`.
- **El bloque proactivo sigue desbordado.** El presupuesto ahora se cumple, pero entran 14 de 34
  reglas de scope `project` y **20 quedan omitidas**; el aviso las nombra. El working-context
  está `desactualizado`. No es una falla de integridad: es presión de contenido. Evidencia:
  `node src/cli/index.js memory doctor`, `src/core/memory/engine.js`.
- **Discrepancia de raíz de DB (abierta).** `defaultMemoryDbPath(cwd)` resuelve desde el `cwd`
  del proceso, mientras el MCP usa `context.projectRoot`; si ambos difieren, las superficies
  pueden leer/escribir bases distintas. No se reprodujo en esta corrida; el riesgo sigue
  registrado. Evidencia: `src/core/memory/engine.js`, `src/core/memory/mcp-server.js`.
- **CLI global desactualizado.** El `ancleto` del `PATH` de esta máquina es **0.17.1** y no
  conoce `memory consolidate` ni el contrato nuevo de `searchMemory`; el checkout sí (0.18.6). Un
  agente que sólo use el binario global puede concluir erróneamente que la capacidad no existe.
  Verificar `ancleto --version` y, si difiere, usar `node src/cli/index.js`. Evidencia: ejecución
  local.
- **Tres superficies del `model:`.** Cambiar el modelo exige revisar `agents/*.md`,
  `.opencode/agents/*` y `~/.config/opencode/agents/*`; `opencode.json` sólo alcanza al agente
  primario. Evidencia: `AGENTS.md`, `opencode.json`.
- **Pack comprimido y sesgado a código.** El tier `minimo` ignora `test/**`, `docs/**` y
  `**/*.md`; Repomix respeta `.gitignore`. Por eso `agents/`, `commands/`, `skills/`,
  `templates/`, `docs/` y `documentation/` no aparecen en el pack. `audit logs/*.txt` sí entra,
  pero es ruido. Una regeneración futura puede no detectar cambios en superficies markdown.
- **`agents/`, `commands/`, `skills/`, `templates/` son la superficie de producto instalable.**
  Cambiarlos altera lo que reciben todos los proyectos. `installAgentAssets()` es el punto único
  de materialización y el adaptador define qué claves sobreviven por host. Un id de tool no
  verificado cuelga el subagent de Antigravity.
- **El texto del orquestador es contrato normativo.** `agents/orchestrator.md` fija techo de
  lecturas, intake, trigger de Recall, checkpoint y orden de promoción. Los mirrors se
  **regeneran**, no se editan a mano.
- **Checkpoint de contrato: relajarlo pierde control de alcance.** Riesgos: enumerar
  documentos, omitir paths autorizados o implementar un cambio de alcance sin enmienda.
  Mitigación: siete campos obligatorios, aprobación sólo para implementar, archive/merge
  separados y guards de comportamiento.
- **Refs obligatorias: radio de rechazo amplio.** Un heading de spec que cambie, un change que
  se archive con otro slug o un `path:` que desaparezca vuelven inválida una escritura futura.
  El error es fail-closed y previo a la transacción. Mitigación: resolución exacta, detección de
  ambigüedad y curación de provenance ya realizada.
- **`cli:import` queda fuera de la validación de refs.** `importNodes` conserva LWW; importar
  nodos sin refs es posible aunque no podrían escribirse por MCP. No debe prometerse que la
  memoria importada cumple el mismo contrato.
- **`commit:` y `workitem:` son sintácticas.** Se valida el SHA (7–40 hex) y `tracker:key`, pero
  no que el commit exista ni que el work item sea accesible; no se resuelven en disco ni en el
  resolver.
- **La promoción depende de dos gates alineados.** El gate de archive y el preflight de
  `@memory-keeper` deben rechazar el mismo lote; si divergen, puede quedar un change archivado
  con "Memory pending" (nunca "archivado y memorizado"). Un `path:` dentro de
  `aspec/changes/<change>/` deja de resolver tras el move; el preflight lo prohíbe.
- **La allowlist de `bash` es la frontera de privilegio.** `agents/technical-discovery.md` tiene
  `'*': deny` con dos literales; cada literal nuevo es un incremento que debe justificarse.
- **Protocolo de memoria duplicado (resuelto en `0.18.6`).** El protocolo vive una sola vez en
  `AGENTS.md` → `LOCKED: memory-protocol`; `PRODUCT.md` y `templates/PRODUCT.md` sólo apuntan.
  Cualquier re-enunciación en otra superficie vuelve a abrir la deuda: el texto del aviso y el
  contrato de `searchMemory` deben seguir siendo la fuente única. Evidencia: `AGENTS.md`,
  `templates/PRODUCT.md`, `aspec/specs/prompt-contracts/spec.md`.
- **Merge de templates: contrato de reconciliación.** Toda ruta que mergee `TEMPLATES` debe
  reconciliar bloques planos antes de `mergeLocked`; saltearlo reintroduce guía obsoleta.
- **Directiva host-específica filtrada a texto compartido.** Riesgo de que una instrucción (p.
  ej. compresión) se cuele en `AGENTS.md` o assets verbatim. Mitigación: "donde no hay tool, no
  hay instrucción" + guards de comportamiento.
- **`machine-env.md` puede quedar trackeado.** La exclusión es local al clon; `ancleto check`
  avisa pero no destrackea. El artefacto es derivado y no debe versionarse.
- **Exclusión local no portátil entre clones.** `info/exclude` no se versiona: cada clon debe
  ejecutar un lifecycle. En worktrees la regla va al `info/exclude` que resuelve git.
- **Sanitización de paths best-effort.** `sanitizePaths` cubre `C:\...`, `/home/...` y
  `/Users/...`, pero puede no atrapar paths sin barra inicial o con `~`. `memory snapshot` **no**
  sanitiza (copia binaria).
- **Snapshot: restauración manual y residuos.** El comando no restaura; un fallo al borrar el
  backup puede dejar `.bak-<uuid>` (no invalida la copia) y un fallo previo puede dejar `.tmp`.
- **Doctor read-only no verifica todo.** El integrity-check completo de FTS5 escribe y queda para
  `--rebuild`; en read-only la alineación se aproxima con la tabla sombra. `columnsize=0` deja el
  check **omitido**; una corrupción sin desalineación puede pasar. El check de refs no verifica
  `commit:`/`workitem:` y `path:` es léxico (sin `realpath`).
- **Deuda declarada de MEM-04 (backlog `§5.2`).** (a) `inspectRefs` **no captura errores de
  I/O** (`readFileSync`/`readdirSync`/`statSync` pueden lanzar y abortar el doctor); el resolver
  de recall sí los captura por ref. (b) El conteo de `commit:`/`workitem:` sólo aparece en el
  `detail` sin rotas. (c) `agents/memory-keeper.md` muestra un bloque `refs:` sólo indentado y no
  aclara que la indentación es opcional. Son deudas declaradas, no fallas observadas.
- **Merge es irreversible por CLI.** No crea nodos ni transfiere contenido: enlaza cada source
  al target (`superseded_by`). Deshacerlo requiere snapshot previo o reescribir nodos.
- **Import pierde genealogía.** El export sólo incluye activos; para historial usar
  `memory snapshot`.
- **GC y `superseded_at`: backfill histórico.** Un nodo superseded antes de MEM-05b tiene
  `superseded_at = created_at`; un nodo creado hace mucho y superseded recientemente **no** se
  purga antes de tiempo si la supersesión pasó por las rutas vigentes. `--dry-run` permite
  auditarlo. Evidencia: `src/core/memory/database.js`, `src/core/memory/engine.js`.
- **Procedencia ≠ autorización, pero sí compuerta de validación.** La columna `source` es
  auditable y decide si se validan refs; no hay canal de identidad autenticado (MCP stdio).
- **`ancleto stats` y `stats failures` acoplados a opencode.** Leen la base de sesiones de
  opencode; no funcionan con otros IDEs.
- **Privacidad del reporte de fallos.** Enmascara secretos/rutas y no imprime texto libre, pero
  la clasificación depende de señales textuales y puede caer en `unknown` ante mensajes nuevos.
  Los comandos denegados por la política del runtime no se miden.
- **MCP = costo fijo por request.** La lista de tools viaja en cada request (`ancleto-memory`
  ~500, caveman ~830, engram ~4.900 tokens). Engram quedó opcional por eso; caveman está bajo
  compuerta de medición.
- **Promesa "optimizador de tokens" no especificada.** `optimizacion-de-tokens.md` documenta
  mecanismos dispersos, no una garantía con Requirements/tests; deja abierta la decisión
  "capacidad nueva `token-economy` vs atributo transversal". Sólo `gratis` fija `tokenBudget`.
- **Protección de rama no verificada.** `AGENTS.md` declara que no se commitea a `main`/`master`,
  pero no se comprobó protección real en el remoto.
- **Cobertura del affected-set acotada por diseño.** Sólo formas estáticas con literal puro; los
  imports dinámicos no escaneados y los alias quedan delegados al mecanismo del proyecto; los no
  relativos se cuentan como `externalCount`.
- **Prompts del pipeline fuera del pack.** Los contratos viven en `agents/*.md` y skills
  (`**/*.md`), que el tier ignora; el seed los describe por lectura puntual y specs fuente.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, `mcp_config.json`,
  `.mcp.json`, CI o Azure. Nombrar la variable y omitir el valor. `machine-env.md` tampoco
  renderiza `PATH` ni versiones.
- **Refresh on-write best-effort.** Un fallo en `memory import` no invalida la importación; en
  `merge`/`consolidate --apply` el cambio ya está commiteado y el comando sale ≠ 0 avisando que
  el bloque quedó viejo. `memory doctor` lo expone como `Working-context: ausente` o
  `desactualizado`.
- **Staleness advisory puede dar falsos positivos triviales.** La normalización es acotada
  (CRLF, espacios finales, salto final); cambios cosméticos mayores podrían disparar
  `desactualizado`.
- **Docs de producto parcialmente desalineados.** `PRODUCT.md` sigue declarando 12 commands y 18
  skills (hoy 16 y 21) y no menciona `machine-env`, `stats failures`, `snapshot`, `merge`,
  `consolidate`, `gc`, el check de refs ni el resolver. Su sección de memoria **sí** apunta al
  bloque `LOCKED: memory-protocol`, y `README.md` ya documenta preview/`expand`/`keys`/`required`.
  `CHANGELOG.md` llega a `0.18.6`.
- **Sin backlog raíz.** `BACKLOG.md` no existe. El backlog P0 de memoria vive en
  `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`; `§5.2` conserva la deuda de I/O de `inspectRefs`
  y el conteo de no verificables con rotas.
- **Versión y publicación.** `package.json` marca `0.18.6`; HEAD `95b2599` en `development`;
  `git describe --tags` da `v0.18.5-14-g95b2599`, es decir **0.18.6 sin tag** al momento del
  relevamiento. Evidencia: `package.json`, `git log`, `git tag`.

## Decisiones registradas en memoria del repo

> Registradas/actualizadas en `.ancleto/memory.db`. En esta corrida se inspeccionó la memoria
> en modo read-only (`memory doctor`/`memory list`): 125 nodos activos, 344 refs, 0 refs rotas.

- `dogfooding-versionado-init`: versionar `AGENTS.md`, `PRODUCT.md` y `aspec/`; ignorar
  `.opencode/`, `.ancletorc`, `.ancleto/`.
- `fix-init-tier-huerfano-0.6.36` y `fix-init-tier-guardado-0.6.37`: `init` debe aplicar el tier
  guardado a los agentes locales (paridad con `install`), incluido re-init sin flags.
- `cli.host-mcp-config-out-of-scope`: el MCP de host queda fuera de alcance salvo las
  excepciones de `opencode`/`antigravity` (y ahora `commandcode`/`copilot`).
- `memory-inyeccion-orden-anclaje`, `memory-bloque-presupuesto-incluye-warning`,
  `memory-omisiones-nombradas`, `memory-provenance-curacion-separada`: decisiones de `0.18.4`.
- `memory-consolidate-exactos-deterministico`, `memory-consolidate-dry-run-default`,
  `memory-consolidate-reversible-supersede`, `memory-consolidate-semantico-diferido`:
  decisiones de `0.18.5`.
- `mem-05-orden-total-sin-rowid`, `mem-05-preview-prefijo-literal`,
  `mem-05-preview-opt-in-expand`, `mem-05-required-es-entrada-de-call`,
  `mem-05-required-excedente-falla`, `mem-05-presupuestos-separados-no-componibles`: decisiones
  de `0.18.6`.
- `gc-superseded-at-columna`: la edad de supersesión se mide con `superseded_at` (MEM-05b).
- Evidencia: `.ancleto/memory.db`, `aspec/specs/memory-engine/spec.md`,
  `aspec/changes/archive/2026-11-02-memory-ranking-y-omisiones-visibles/`,
  `aspec/changes/archive/2026-11-02-memory-consolidacion-autonoma/`,
  `aspec/changes/archive/2026-11-02-mem-05-recall-task-aware/`.
