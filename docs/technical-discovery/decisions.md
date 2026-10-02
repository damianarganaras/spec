---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-10-02T20:32:00Z
pluginVersion: 0.11.0
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Reglas estructurales (declaradas)

1. **Zero-Dependencies de runtime + Node ≥ 24.** Sin `better-sqlite3` ni binarios nativos; el
   motor usa `node:sqlite` (`DatabaseSync`). El change `add-standard-linter` agregó `eslint` y
   `globals` **solo como devDependencies**: el contrato `dependencies` sigue ausente/vacío.
   Cualquier dependencia de runtime nueva rompe el contrato de costo y distribución. Evidencia:
   `package.json`, `eslint.config.js`, `DESIGN-memory-engine-v0.2.0.md`, `BACKLOG.md`.
2. **Una sola versión activa por `memory_key`.** La supersesión es atómica en transacción
   `BEGIN IMMEDIATE`: marca el nodo previo `superseded` e inserta el nuevo; hay índice único
   parcial sobre nodos activos. Evidencia: `DESIGN-memory-engine-v0.2.0.md`, `BACKLOG.md`.
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
6. **Merge no destructivo de templates.** `install`/`update`/`upgrade` re-aplican el interior
   de los bloques `<!-- LOCKED: name -->` y preservan el resto (EXTENSIBLE); si los tags
   faltan o están mal formados, avisa y **no toca** el archivo. Evidencia: `src/cli/index.js`,
   `README.md`, `BACKLOG.md` (G7).
7. **Instalación de assets por host, dueño único `AGENT_TARGETS` + `installAgentAssets`.**
   `AGENT_TARGETS` es la **fuente única de rutas** (skills/agents/commands con su `dir` y su
   `ext`; `null` = asset no soportado). `installAgentAssets` materializa el destino nativo y
   devuelve las rutas escritas; `unionInstalledPaths` las acumula en `installedPaths`.
   Antigravity no tiene dir de commands: sus `/cleto-*` se empaquetan como
   `.agents/skills/<n>/SKILL.md` (`package: 'skill-dir'`) y **no** se registran en
   `installedPaths.commands`. Cursor y Roo solo tienen skills. Un asset no soportado no se
   escribe y avisa por stderr. Evidencia: `src/cli/index.js`, `units/cli-install.md`.
8. **Adaptación de frontmatter: dueño único y módulo puro.** Toda transformación de frontmatter
   vive en `src/core/adapters/frontmatter.js` (`adaptFrontmatter(content, host, assetKind,
   name) → string`): función pura, sin E/S ni estado global. `src/cli/index.js` la importa y
   **no** define adaptadores locales. `parseFrontmatter`/`serializeFrontmatter` se re-exportan
   para `commandToSkill`. Dispatch: `opencode` y toda skill → identidad; `claude`/`vscode`/
   `copilot` + agents → dropean `AGENT_ADAPTER_DROP` (`mode`, `color`, `temperature`,
   `permission`, `model`, `tools`); `antigravity` + agents → transformación propia;
   `cursor`/`roo` → identidad + aviso a stderr (`no documented frontmatter adaptation for host
   '<host>'`); host desconocido → identidad + aviso (`unknown agent '<host>', passthrough`).
   Evidencia: `src/core/adapters/frontmatter.js`, `aspec/specs/skill-frontmatter-adapters/spec.md`,
   `aspec/changes/archive/2026-10-02-dynamic-frontmatter-adapters/`.
9. **Antigravity: transformación determinista y conjunto cerrado de tools.** Orden de emisión:
   `name` (del archivo), `description`, `tools` (siempre lista, aun `[]`), `mainAgent`,
   `subagent`, `model: inherit`, `commandExecutionPolicy: sandbox`, `mcpServers`, `skills`,
   extras. Las claves gestionadas se filtran y re-emiten una sola vez. `mode` → flags:
   `primary`→(`true`,`false`), `subagent`→(`false`,`true`), sin `mode`→(`true`,`true`). Solo se
   emiten los 5 ids verificados: `read→view_file`, `edit→replace_file_content`,
   `grep→grep_search`, `bash→run_command`, `todowrite→manage_task`. Toda otra clave se omite
   con aviso a stderr no bloqueante (`skip tool '<k>': no verified Antigravity id for agent
   '<n>'`); un id inexistente cuelga el subagent (Known Issue). `skill` se saltea en silencio
   (se cubre por el campo `skills`); `call_mcp_tool` está **prohibido**; el uso de MCP se
   expresa por `mcpServers`/`.agents/mcp_config.json`. Evidencia:
   `src/core/adapters/frontmatter.js`, `units/cli-install.md`.
10. **`ancleto check` valida el frontmatter real contra el adaptador.** Por cada `.md` de un
    directorio de agents instalado, compara el instalado contra
    `adaptFrontmatter(origen, host, 'agents', name)` (con la simulación del `model:` del tier
    en opencode y la nota de picker en copilot). La divergencia se reporta como **warning (⚠),
    no bloqueante**: solo los archivos faltantes cambian el exit code. Siguiendo el manifiesto
    multi-host (`installedHostsFromPaths`), aplica el adaptador de cada host. Evidencia:
    `src/cli/index.js` (`checkAgentsFrontmatter`), `test/adapters-frontmatter.test.js`.
11. **Export/import/gc de memoria (change `memory-ops-export-import-gc`).** `exportActive()`
    devuelve solo nodos activos con `{memory_key, type, content, justification, scope,
    createdAt}` y **sanitiza paths absolutos** a `<redacted>` (Windows `X:\...`, Unix
    `/home/...`, `/Users/...`); los superseded no se exportan. `importNodes(json)` valida el
    schema antes de procesar y **aborta el batch entero** si una entrada es inválida; upsert
    por `memory_key`: inserta si no existe, supersede solo si el `createdAt` del JSON es más
    reciente, y **no reactiva** nodos superseded (son historia). `gcSuperseded({days, dryRun})`
    purga superseded con antigüedad mayor al umbral (default 30 días, medido con `created_at`
    como proxy porque no existe `superseded_at`); tras el DELETE hace `VACUUM`+`REINDEX`
    best-effort post-commit. Expuesto como `ancleto memory export|import|gc`. Evidencia:
    `src/core/memory/engine.js`, `src/cli/index.js`, `aspec/specs/memory-ops/spec.md`.
12. **Migración/importación `openspec/` → `aspec/` no destructiva.** `migrateLegacyOpenspec`
    copia recursiva con `force: false`, escribe el marcador `.migrated-from-openspec` y conserva
    `openspec/` como backup; si `aspec/` ya tiene contenido real avisa y no migra.
    `detectLegacyOpenSpec` clasifica (`none`/`legacy`/`external`); lo externo pide confirmación
    (default No, `--yes` para script) e importa sin pisar el `AGENTS.md` local. Punto único
    `maybeImportOpenspec`, invocado por `init`, `install --project` y `upgrade`. Evidencia:
    `src/cli/index.js`, `aspec/changes/archive/2026-09-30-import-legacy-openspec/`.
13. **MCP de host, dueño único `setupHostMcp`.** Antigravity mergea `.agents/mcp_config.json`
    (`{ "mcpServers": { "<n>": { command, args, env } } }`) de forma **no destructiva**: preserva
    `mcpServers` y claves top-level, no pisa homónimos y un JSON inválido avisa sin escribir.
    Copilot mergea `copilot-mcp.json` (`refreshCopilotMcp` regenera rotas en `upgrade` sin tocar
    `copilot-instructions.md`). El resto conserva `mergeMcp` sobre `opencode.json`. `init` y
    `install` configuran MCP igual; `--no-mcp` es el escape. Evidencia: `src/cli/index.js`.
14. **Perfil `test`: overlay, no fork.** `installProfileOverlay` reinstala
    `profiles/test/agents` + `commands` sobre los destinos nativos del host (misma ext y
    adapter que la base) y `copyTemplates` lee `profiles/test/templates/`; el paquete base queda
    intacto y el tier sigue ortogonal. Evidencia: `src/cli/index.js`, `profiles/test/`,
    `aspec/specs/test-profile/spec.md`.
15. **Portabilidad = intención, no rutas.** `export` genera bundle + `manifest.json` con solo
    nombres+tipos de MCP (nunca `command`/`args`); aborta si el manifiesto contiene absolutos.
    `import` aplica portables y **regenera** entradas con el host local (`mcpCommandBroken`),
    sin pisar sanas, y cierra con `doctor`. Nunca se exportan credenciales, `service.json`,
    global ni `memory.db` (la memoria tiene su propio export JSON). Evidencia:
    `src/cli/index.js`, `aspec/changes/archive/2026-09-30-cross-machine-export-import/`.
16. **Linter mínimo: 4 reglas, sin estilo.** `eslint.config.js` es flat config (array) con
    `ecmaVersion: latest`, `sourceType: module`, globals de Node y exactamente `no-undef`,
    `no-unused-vars` (con `argsIgnorePattern`/`caughtErrorsIgnorePattern` `^_`), `eqeqeq`
    (`always`) y `no-dupe-keys`. Sin Prettier, sin plugins, sin ignores globales, sin
    `// eslint-disable`. Ventaja: consistencia, no correctness de negocio. Evidencia:
    `eslint.config.js`, `test/linter-config.test.js`, `aspec/specs/linter-standard/spec.md`.
17. **Patrón "CLI materializa + agente lee".** `ancleto memory context` escribe
    `.ancleto/working-context.md`; el orquestador lo lee como datos no confiables sin `bash`.
    Evidencia: `BACKLOG.md`, `agents/orchestrator.md`, `src/core/memory/working-context.js`.

## Seed incremental (contrato del discovery)

- `ancleto discovery --check` devuelve `state` + `impact`:
  - `none` → sin cambios; `minor` → cambios no materiales (el agente trabaja y lo anota, no
    ofrece regenerar); `material` → cambió un config de runtime, entry point o apareció/desapareció
    un directorio raíz nuevo (ofrece regenerar, siempre con aprobación).
- Con `impact: minor` y `affectedDocs` no vacío, el seed-writer reescribe **solo** esos
  documentos. El mapeo vive en `seed-map.json` (lo mantiene la skill); sin ese archivo la
  regeneración es completa.
- Al archivar un change, el seed puede quedar `STALE` (issue #17).
- `EXPECTED_DOCS` del CLI = 8 documentos raíz (`index`, `overview`, `setup`, `inventory`,
  `integrations`, `decisions`, `unknowns`, `units/_map`).
- Evidencia: `README.md`, `BACKLOG.md`, `src/cli/index.js`.

## Riesgos, deuda y acoplamiento

- **Pack comprimido y sesgado a código.** El tier `gratis` (resuelto aquí vía
  `.opencode/.ancleto-tier`) ignora `test/**`, `docs/**` y `**/*.md`; `.gitignore` excluye
  `.opencode/`, `.ancletorc`, `.ancleto/` y `/documentation` del pack. Resultado: `agents/`,
  `commands/`, `skills/`, `templates/`, `docs/` y `documentation/` **no entran** en el pack. El
  seed los describe por listados, `README.md` y `BACKLOG.md`; una regeneración futura puede no
  detectar cambios en ellos (ver `unknowns.md`).
- **`agents/`, `commands/`, `skills/`, `templates/` son la superficie de producto instalable.**
  Cambiarlos altera lo que reciben todos los proyectos usuarios. `installAgentAssets()` es el
  punto único de materialización y `src/core/adapters/frontmatter.js` define qué claves
  sobreviven por host. Un id de tool no verificado cuelga el subagent de Antigravity.
- **Sanitización de paths best-effort.** `sanitizePaths` cubre `C:\...`, `/home/...` y
  `/Users/...`, pero puede no atrapar paths sin barra inicial o con `~`; el usuario debe revisar
  el JSON antes de compartirlo. Evidencia: `src/core/memory/engine.js`, `aspec/specs/memory-ops/spec.md`.
- **Import pierde genealogía.** El export solo incluye nodos activos; al importar un nodo nuevo
  se crea sin historial de supersesión previo (la genealogía se reconstruye por `memory_key`).
- **GC usa `created_at` como proxy.** No existe `superseded_at`; un nodo creado hace mucho y
  superseded recientemente puede purgarse antes de lo deseado. `--dry-run` permite auditarlo.
- **`ancleto stats` acoplado a opencode**: lee la base de sesiones de opencode; no funciona con
  otros IDEs. Evidencia: `README.md`, `src/cli/index.js` (`opencodeDbPath`).
- **MCP = costo fijo por request.** La lista de tools viaja en cada request (`ancleto-memory`
  ~500, caveman ~830, engram ~4.900 tokens). Engram quedó opcional (`--with-engram`) por eso.
- **Branch protection honor-based.** `AGENTS.md`/`BACKLOG.md` declaran `main` protegida, pero
  el remoto no aplica protection real (B3). Evidencia: `BACKLOG.md`.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, `mcp_config.json`, CI o
  Azure. Los tokens viven fuera del repo (env/secretos del IDE); nombrar la variable y omitir
  el valor.
- **Deuda resuelta en 0.11.0**: export/import de memoria (M1) y garbage collection `memory
  gc` (M2) ya no son deuda: se implementaron en `memory-ops-export-import-gc`. `PRODUCT.md`
  sigue desactualizado (afirma que no hay scripts npm, cuando `lint`/`test` existen).
  Evidencia: `BACKLOG.md`, `PRODUCT.md`, `CHANGELOG.md`.

## Decisiones registradas en memoria del repo

- `dogfooding-versionado-init`: versionar `AGENTS.md`, `PRODUCT.md` y `aspec/`; ignorar
  `.opencode/`, `.ancletorc`, `.ancleto/`.
- `fix-init-tier-huerfano-0.6.36` y `fix-init-tier-guardado-0.6.37`: `init` debe aplicar el tier
  guardado a los agentes locales (paridad con `install`), incluido re-init sin flags.
- Evidencia: `.ancleto/memory.db` vía `ancleto memory list`.
