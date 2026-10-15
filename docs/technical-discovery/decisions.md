---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-10-15T11:49:04Z
pluginVersion: 0.13.0
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
   recuperan reactivamente con `searchMemory`. Evidencia: `DESIGN-memory-engine-v0.2.0.md`,
   `agents/orchestrator.md`.
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
   identificado), idempotente (tras eliminar, re-ejecutar es no-op) y sin pasos manuales.
   `mergeLocked` re-aplica el interior de los bloques `<!-- LOCKED: name -->`, preserva lo
   EXTENSIBLE, inserta bloques nuevos en el ancla correcta y **no toca** archivos con tags
   malformados (avisa). No debe existir una ruta que mergee `TEMPLATES` sin reconciliar.
   Evidencia: `src/cli/index.js`, `templates/AGENTS.md`, `aspec/specs/prompt-contracts/spec.md`.
7. **Contrato de validaciones declarativo.** El proyecto declara sus comandos en `PRODUCT.md` →
   `## Project Commands`; esa es la **fuente única**. Las validaciones corren **solo** esos
   comandos: si falta una validación, se saltea y se registra la omisión; **nunca** se inventa
   runner/linter/formatter/typechecker. El **format check** corre solo si hay formatter
   declarado; si no, se reporta `not-configured` (no es fallo). Los **tests** se corren por el
   comando declarado (p. ej. `npm test`) o con **rutas explícitas**; nunca `node --test` pelado.
   La política vive en un bloque `LOCKED: validation-commands` de `templates/AGENTS.md` (host-neutral)
   para que `install`/`upgrade` la re-apliquen; las skills que emiten pasos de verificación la
   referencian sin fijar comandos. Evidencia: `AGENTS.md`, `templates/AGENTS.md`,
   `PRODUCT.md`, `aspec/specs/prompt-contracts/spec.md`.
8. **Instalación de assets por host, dueño único `AGENT_TARGETS` + `installAgentAssets`.**
   `AGENT_TARGETS` es la **fuente única de rutas** (skills/agents/commands con su `dir` y su
   `ext`; `null` = asset no soportado). `installAgentAssets` materializa el destino nativo y
   devuelve las rutas escritas; `unionInstalledPaths` las acumula en `installedPaths`.
   Antigravity no tiene dir de commands: sus `/cleto-*` se empaquetan como
   `.agents/skills/<n>/SKILL.md` (`package: 'skill-dir'`) y **no** se registran en
   `installedPaths.commands`. Cursor y Roo solo tienen skills. Un asset no soportado no se
   escribe y avisa por stderr. Evidencia: `src/cli/index.js`, `units/cli-install.md`.
9. **Adaptación de frontmatter: dueño único y módulo puro.** Toda transformación de frontmatter
   vive en `src/core/adapters/frontmatter.js` (`adaptFrontmatter(content, host, assetKind,
   name) → string`): función pura, sin E/S ni estado global. `src/cli/index.js` la importa y
   **no** define adaptadores locales. Dispatch: `opencode` y toda skill → identidad;
   `claude`/`vscode`/`copilot` + agents → dropean `AGENT_ADAPTER_DROP` (`mode`, `color`,
   `temperature`, `permission`, `model`, `tools`); `antigravity` + agents → transformación
   propia; `commandcode` + agents → transformación propia; `cursor`/`roo` → identidad + aviso a
   stderr; host desconocido → identidad + aviso. Evidencia:
   `src/core/adapters/frontmatter.js`, `aspec/specs/skill-frontmatter-adapters/spec.md`.
10. **Antigravity: transformación determinista y conjunto cerrado de tools.** Orden de emisión:
    `name` (del archivo), `description`, `tools` (siempre lista, aun `[]`), `mainAgent`,
    `subagent`, `model: inherit`, `commandExecutionPolicy: sandbox`, `mcpServers`, `skills`,
    extras. Las claves gestionadas se filtran y re-emiten una sola vez. `mode` → flags:
    `primary`→(`true`,`false`), `subagent`→(`false`,`true`), sin `mode`→(`true`,`true`). Solo se
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
    default**: en Command Code `tools` omitido significa "ninguna tool" (en opencode significa
    "todas"), por eso un origen sin `tools` emite `tools: "*"`. El MCP de proyecto vive en
    `.mcp.json`. Evidencia: `src/core/adapters/frontmatter.js`, `README.md`, `CHANGELOG.md`
    (`0.12.1`), `aspec/specs/commandcode-support/spec.md`.
12. **`ancleto check` valida el frontmatter real contra el adaptador.** Por cada `.md` de un
    directorio de agents instalado, compara el instalado contra
    `adaptFrontmatter(origen, host, 'agents', name)` (con la simulación del `model:` del tier
    en opencode y la nota de picker en copilot). La divergencia se reporta como **warning (⚠),
    no bloqueante**: solo los archivos faltantes cambian el exit code. Siguiendo el manifiesto
    multi-host (`installedHostsFromPaths`), aplica el adaptador de cada host. Evidencia:
    `src/cli/index.js` (`checkAgentsFrontmatter`), `test/adapters-frontmatter.test.js`.
13. **Export/import/gc de memoria (change `memory-ops-export-import-gc`).** `exportActive()`
    devuelve solo nodos activos con `{memory_key, type, content, justification, scope,
    createdAt}` y **sanitiza paths absolutos** a `<redacted>`; los superseded no se exportan.
    `importNodes(json)` valida el schema antes de procesar y **aborta el batch entero** si una
    entrada es inválida; upsert por `memory_key`: inserta si no existe, supersede solo si el
    `createdAt` del JSON es más reciente, y **no reactiva** nodos superseded. `gcSuperseded({days,
    dryRun})` purga superseded con antigüedad mayor al umbral (default 30 días, medido con
    `created_at` como proxy porque no existe `superseded_at`); tras el DELETE hace `VACUUM`+`REINDEX`
    best-effort post-commit. Expuesto como `ancleto memory export|import|gc`. Evidencia:
    `src/core/memory/engine.js`, `src/cli/index.js`, `aspec/specs/memory-ops/spec.md`.
14. **Migración/importación `openspec/` → `aspec/` no destructiva.** `migrateLegacyOpenspec`
    copia recursiva con `force: false`, escribe el marcador `.migrated-from-openspec` y conserva
    `openspec/` como backup; si `aspec/` ya tiene contenido real avisa y no migra.
    `detectLegacyOpenSpec` clasifica (`none`/`legacy`/`external`); lo externo pide confirmación
    (default No, `--yes` para script) e importa sin pisar el `AGENTS.md` local. Punto único
    `maybeImportOpenspec`, invocado por `init`, `install --project` y `upgrade`. Evidencia:
    `src/cli/index.js`, `aspec/specs/aspec-bootstrap/spec.md`.
15. **MCP de host, dueño único `setupHostMcp`.** Hay **dos excepciones de host-MCP**: antigravity
    mergea `.agents/mcp_config.json` (`{ "mcpServers": { "<n>": { command, args, env } } }`) y
    commandcode mergea `.mcp.json` (`{ mcpServers: { <n>: { transport: 'stdio', command, args, env? } } }`),
    ambos de forma **no destructiva** (preservan `mcpServers` y claves top-level, no pisan
    homónimos; un JSON inválido avisa sin escribir). Copilot mergea `copilot-mcp.json`
    (`refreshCopilotMcp` regenera rotas en `upgrade` sin tocar `copilot-instructions.md`). El
    resto conserva `mergeMcp` sobre `opencode.json`. `init` y `install` configuran MCP igual;
    `--no-mcp` es el escape. Evidencia: `src/cli/index.js`, `README.md`.
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
    (`always`) y `no-dupe-keys`. Sin Prettier, sin plugins. Ventaja: consistencia, no
    correctness de negocio. Evidencia: `eslint.config.js`, `test/linter-config.test.js`,
    `aspec/specs/linter-standard/spec.md`.
19. **Patrón "CLI materializa + agente lee".** `ancleto memory context` escribe
    `.ancleto/working-context.md`; el orquestador lo lee como datos no confiables sin `bash`.
    Evidencia: `BACKLOG.md`, `agents/orchestrator.md`, `src/core/memory/working-context.js`.
20. **Compresión (caveman) host-scoped, con compuerta de medición** (change archivado
    `token-budget`). El CLI configura el MCP de compresión por defecto cuando el binario está
    disponible, como **configuración del host** (solo `opencode`/`antigravity`). La
    **directiva de uso** se materializa únicamente en superficies de un host cuya config MCP
    incluye la tool (`hostSupportsCompression`/`hostConfigHasCompression`, `CAVEMAN_USAGE_NOTE`),
    **nunca** en texto compartido: "donde no hay tool, no hay instrucción". El default es
    **reversible a opt-in** si `ancleto stats` no muestra un descenso neto. Evidencia:
    `src/cli/index.js`, `aspec/specs/prompt-contracts/spec.md`.
21. **Día-cero del working-context** (change archivado `token-budget`). El CLI **no** omite
    materializar `.ancleto/working-context.md` por ausencia de `.ancleto/memory.db`: si existe
    `.discovery-map.json`, escribe el bloque `<ProjectTopology>` (creando `.ancleto/` si falta)
    **sin abrir el motor**. Render único (`renderWorkingContextBlock`) compartido por el refresh
    de lifecycle y `memory context`; `buildWorkingContext` conserva firma, default `cwd` y
    resultado `null` sin topología ni reglas. Evidencia: `src/cli/index.js`,
    `src/core/memory/working-context.js`, `aspec/specs/memory-engine/spec.md`.
22. **Procedencia `source` runtime-owned** (change archivado `memory-actor-provenance`).
    `source` se resuelve exclusivamente desde `context.source` (nunca desde args del caller) con
    vocabulario estable: `mcp:ancleto-memory`, `cli:import`, `runtime` y `agent:<rol>` (solo si
    un runtime confiable lo provee). Se expone en `listNodes`/`memory list --json` pero **no**
    en `searchMemory` ni en los JSON Schema MCP. La procedencia es **descriptiva**; el motor
    **no** autoriza ni deniega escrituras con ella. Evidencia: `src/core/memory/engine.js`,
    `aspec/specs/memory-engine/spec.md`, `aspec/changes/archive/2026-10-05-memory-actor-provenance/`.
23. **Fuente única de reglas compartidas + guards por comportamiento** (change archivado
    `token-budget`). Toda regla que se declaraba en skill y agente pasa a tener **un único
    hogar canónico**: las transversales viven en `AGENTS.md` (bloques `LOCKED`) y las demás
    superficies **referencian** sin repetir texto. `test/content-guards.test.js` asierta
    **keywords de comportamiento** y presencia de salvaguardas, no redacción literal. Ningún
    recorte puede eliminar salvaguardas protegidas. Evidencia: `AGENTS.md`,
    `templates/AGENTS.md`, `aspec/specs/prompt-contracts/spec.md`.
24. **Actualización de artifacts de un change (`ancleto-update`, `0.12.0`).** La skill
    `ancleto-update` (`/cleto-update`) actualiza los artifacts de un change existente ante
    cambios de definición con merge no destructivo: clasifica por artifact dueño
    (`specs/`, `design.md`, `proposal.md`, `tasks.md`), detecta drift entre delta specs y specs
    principales y pregunta el modo de escritura (in-place vs `rev2`). Evidencia:
    `skills/ancleto-update/SKILL.md`, `commands/cleto-update.md`,
    `aspec/specs/artifact-update/spec.md`.

## Seed incremental (contrato del discovery)

- `ancleto discovery --check` devuelve `state` + `impact`:
  - `none` → sin cambios; `minor` → cambios no materiales (el agente trabaja y lo anota, no
    ofrece regenerar); `material` → cambió un config de runtime, entry point o apareció/desapareció
    un directorio raíz nuevo (o un archivo material como `package.json`; ej. esta regeneración:
    `package.json` + nuevo `optimizacion-de-tokens.md`).
- Con `impact: minor` y `affectedDocs` no vacío, el seed-writer reescribe **solo** esos
  documentos. El mapeo vive en `seed-map.json` (lo mantiene la skill); sin ese archivo la
  regeneración es completa.
- Al archivar un change, el seed puede quedar `STALE`; `AGENTS.md` (`LOCKED: seed-freshness`)
  define el procedimiento (verificar, avisar, regenerar solo con aprobación).
- `EXPECTED_DOCS` del CLI = 8 documentos raíz (`index`, `overview`, `setup`, `inventory`,
  `integrations`, `decisions`, `unknowns`, `units/_map`).
- Evidencia: `README.md`, `BACKLOG.md`, `src/cli/index.js`, `AGENTS.md`.

## Riesgos, deuda y acoplamiento

- **Pack comprimido y sesgado a código.** El tier resuelto (`minimo`) ignora `test/**`,
  `docs/**` y `**/*.md`; `.gitignore` excluye `.opencode/`, `.ancletorc`, `.ancleto/` y
  `/documentation`. Resultado: `agents/`, `commands/`, `skills/`, `templates/`, `docs/` y
  `documentation/` **no entran** en el pack. El seed los describe por listados, `README.md`,
  `BACKLOG.md` y los specs de `aspec/`; una regeneración futura puede no detectar cambios en
  ellos (ver `unknowns.md`).
- **`agents/`, `commands/`, `skills/`, `templates/` son la superficie de producto instalable.**
  Cambiarlos altera lo que reciben todos los proyectos usuarios. `installAgentAssets()` es el
  punto único de materialización y `src/core/adapters/frontmatter.js` define qué claves
  sobreviven por host. Un id de tool no verificado cuelga el subagent de Antigravity.
- **Merge de templates: contrato de reconciliación.** Toda ruta que mergee `TEMPLATES` debe
  reconciliar bloques planos legados antes de `mergeLocked`; saltearlo reintroduce guía obsoleta
  junto al bloque canónico. `reconcileLegacyBlocks` solo elimina con coincidencia exacta de la
  firma (bloque personalizado se avisa, no se toca).
- **Directiva host-específica filtrada a texto compartido.** Riesgo de que una instrucción
  (p. ej. de compresión) se cuele en `AGENTS.md` o en assets copiados verbatim, volviéndose
  falsa para hosts sin esa tool. Mitigación: contrato "donde no hay tool, no hay instrucción" +
  assert de comportamiento en `content-guards`.
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
- **`ancleto stats` acoplado a opencode**: lee la base de sesiones de opencode; no funciona con
  otros IDEs. Evidencia: `README.md`, `src/cli/index.js` (`opencodeDbPath`).
- **MCP = costo fijo por request.** La lista de tools viaja en cada request (`ancleto-memory`
  ~500, caveman ~830, engram ~4.900 tokens). Engram quedó opcional (`--with-engram`) por eso; el
  default de caveman está bajo la compuerta de medición del (ya archivado) `token-budget`.
- **Promesa "optimizador de tokens" no especificada.** `optimizacion-de-tokens.md` documenta que
  la capacidad de ahorro existe como *mecanismos dispersos* pero **no** como garantía con
  Requirements/tests; deja una decisión abierta (capacidad nueva `token-economy` vs atributo
  transversal). Los tiers `normal`/`minimo` no fijan `tokenBudget` (solo `gratis`, 50k).
- **Branch protection honor-based.** `AGENTS.md`/`BACKLOG.md` declaran `main` protegida, pero
  el remoto no aplica protection real (B3). Evidencia: `BACKLOG.md`.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, `mcp_config.json`,
  `.mcp.json`, CI o Azure. Las variables se nombran y su valor se omite.
- **Deuda resuelta en 0.13.0**: (a) el contrato de validaciones dejó de hardcodear
  `typecheck`/`lint`/`test` y pasó a ser declarativo (`contrato-validaciones`); (b) la dedupe de
  reglas y el día-cero del working-context (`token-budget`); (c) `PRODUCT.md` ya declara
  `## Project Commands` y alinea sus guardrails (ya no afirma que no hay scripts npm).
  Evidencia: `CHANGELOG.md`, `aspec/changes/archive/2026-10-14-*`, `PRODUCT.md`.

## Decisiones registradas en memoria del repo

- `dogfooding-versionado-init`: versionar `AGENTS.md`, `PRODUCT.md` y `aspec/`; ignorar
  `.opencode/`, `.ancletorc`, `.ancleto/`.
- `fix-init-tier-huerfano-0.6.36` y `fix-init-tier-guardado-0.6.37`: `init` debe aplicar el tier
  guardado a los agentes locales (paridad con `install`), incluido re-init sin flags.
- `cli.host-mcp-config-out-of-scope`: el MCP de host queda fuera de alcance salvo las
  excepciones de `opencode`/`antigravity` (y ahora `commandcode`).
- Evidencia: `.ancleto/memory.db` vía `ancleto memory list`.
