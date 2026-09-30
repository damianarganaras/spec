---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-09-30T19:34:11Z
pluginVersion: 0.7.2
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Reglas estructurales (declaradas)

1. **Zero-Dependencies + Node ≥ 24.** Sin `better-sqlite3` ni binarios nativos; el motor usa
   `node:sqlite` (`DatabaseSync`). Cualquier dependencia nueva rompe el contrato de costo y
   distribución. Evidencia: `package.json`, `DESIGN-memory-engine-v0.2.0.md`, `BACKLOG.md`.
2. **Una sola versión activa por `memory_key`.** La supersesión es atómica en transacción
   `BEGIN IMMEDIATE`: marca el nodo previo `superseded` e inserta el nuevo; hay índice único
   parcial sobre nodos activos. Evidencia: `DESIGN-memory-engine-v0.2.0.md`, `BACKLOG.md`.
3. **Solo 3 tools expuestas al LLM** (`searchMemory`, `recordRule`, `recordDecision`).
   `source`, `confidence`, `status` e `id` los gestiona el runtime y **nunca** aparecen en el
   JSON Schema (`additionalProperties: false`; args forjados se ignoran). Evidencia:
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
   devuelve las rutas escritas; `unionInstalledPaths` las acumula en
   `installedPaths`. Antigravity no tiene dir de commands: sus `/cleto-*` se empaquetan como
   `.agents/skills/<n>/SKILL.md` (`package: 'skill-dir'`) y **no** se registran en
   `installedPaths.commands`. Cursor y Roo solo tienen skills. Un asset no soportado no se
   escribe y avisa por stderr (`skip <asset>: not supported by host '<host>'`). Evidencia:
   `src/cli/index.js`, `units/cli-install.md`.
8. **Frontmatter de agents adaptado por host.** `claude`, `vscode` y `antigravity` son
   `AGENT_ADAPTER_HOSTS`; el resto copia verbatim. `AGENT_ADAPTER_DROP = {mode, color,
   temperature, permission, model, tools}` se elimina. Antigravity aplica
   `adaptAntigravityFrontmatter` con orden determinista (`name`, `description`, `tools`,
   `mainAgent`, `subagent`, `model: inherit`, `commandExecutionPolicy: sandbox`, `mcpServers`,
   `skills`, extras) y mapea `mode` a flags. Las claves gestionadas se filtran y re-emiten una
   sola vez. Evidencia: `src/cli/index.js`, `units/cli-install.md`.
9. **Mapeo de tools de Antigravity: conjunto cerrado (regla dura).** Solo se emiten los 5 ids
   verificados: `read→view_file`, `edit→replace_file_content`, `grep→grep_search`,
   `bash→run_command`, `todowrite→manage_task`. Cualquier otra clave se omite con aviso a
   stderr no bloqueante (`skip tool '<k>': no verified Antigravity id for agent '<n>'`); un id
   inexistente cuelga el subagent (Known Issue). El tool `skill` se saltea; `call_mcp_tool`
   está **prohibido**. El uso de MCP se expresa por `mcpServers`/`.agents/mcp_config.json`,
   nunca se infiere desde el mapa `tools`. Evidencia: `src/cli/index.js`,
   `units/cli-install.md`.
10. **Migración legacy `openspec/` → `aspec/` no destructiva.** `migrateLegacyOpenspec` copia
    recursiva con `force: false`, escribe el marcador `.migrated-from-openspec` y conserva
    `openspec/` como backup; si `aspec/` ya tiene contenido real (`changes/` o `specs/` no
    vacíos) avisa y no migra. La invocan `init`, `install --project` y `upgrade`. Evidencia:
    `src/cli/index.js`, `aspec/changes/archive/2026-09-29-migrate-openspec-to-aspec/`.
11. **MCP de host, dueño único `setupHostMcp`.** Antigravity mergea `.agents/mcp_config.json`
    (`{ "mcpServers": { "<n>": { command, args, env } } }`) de forma **no destructiva**:
    preserva `mcpServers` y claves top-level, no pisa homónimos y un JSON inválido avisa sin
    escribir. El resto conserva `mergeMcp` sobre `opencode.json`. `init` configura MCP igual
    que `install`; `--no-mcp` es el escape. Evidencia: `src/cli/index.js`.
12. **Patrón "CLI materializa + agente lee".** `ancleto memory context` escribe
    `.ancleto/working-context.md`; el orquestador lo lee como datos no confiables sin `bash`.
    Evidencia: `BACKLOG.md`, `agents/orchestrator.md`, `src/core/memory/working-context.js`.

## Seed incremental (contrato del discovery)

- `ancleto discovery --check` devuelve `state` + `impact`:
  - `none` → sin cambios; `minor` → cambios no materiales (el agente trabaja y lo anota, no
    ofrece regenerar); `material` → cambió un config de runtime, entry point o apareció un
    directorio raíz nuevo (ofrece regenerar, siempre con aprobación).
- Con `impact: minor` y `affectedDocs` no vacío, el seed-writer reescribe **solo** esos
  documentos. El mapeo vive en `seed-map.json` (lo mantiene la skill); sin ese archivo la
  regeneración es completa.
- Al archivar un change, el seed puede quedar `STALE` (issue #17).
- `EXPECTED_DOCS` del CLI = 8 documentos raíz (`index`, `overview`, `setup`, `inventory`,
  `integrations`, `decisions`, `unknowns`, `units/_map`).
- Evidencia: `README.md`, `BACKLOG.md`, `src/cli/index.js`.

## Riesgos, deuda y acoplamiento

- **Pack comprimido y sesgado a `src/`.** El tier `minimo` ignora `**/*.md` y `test/**`, y
  `.gitignore` excluye `.opencode/` y `/documentation`; `discovery.exclude` excluye `docs`.
  Resultado: `agents/`, `commands/`, `skills/`, `templates/`, `docs/` y `documentation/` **no
  entran** en el pack. El seed los describe por listados/README/BACKLOG, no por su contenido.
  Impacto: una regeneración futura puede no detectar cambios en esos assets (ver `unknowns.md`).
- **Repomix no consume contexto por defecto**: se ejecuta on-demand en `ancleto discovery`.
  Evidencia: `BACKLOG.md` (relevamiento §7).
- **`agents/`, `commands/`, `skills/`, `templates/` son la superficie de producto instalable.**
  Cambiarlos altera lo que reciben todos los proyectos usuarios; `installAgentAssets()` es el
  punto único de materialización y el adaptador de frontmatter (`AGENT_ADAPTER_DROP`,
  `ANTIGRAVITY_TOOL_MAP`) define qué claves sobreviven por host. Un id de tool no verificado
  cuelga el subagent de Antigravity.
- **`ancleto stats` acoplado a opencode**: lee la base de sesiones de opencode; no funciona con
  otros IDEs. Evidencia: `README.md`, `src/cli/index.js` (`opencodeDbPath`).
- **MCP = costo fijo por request.** La lista de tools viaja en cada request
  (`ancleto-memory` ~500, caveman ~830, engram ~4.900 tokens). Engram quedó opcional
  (`--with-engram`) justamente por eso. Evidencia: `README.md`, `BACKLOG.md`.
- **Branch protection honor-based.** `AGENTS.md`/`BACKLOG.md` declaran `main` protegida, pero
  el remoto no aplica protection real (B3). Evidencia: `BACKLOG.md`.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, `mcp_config.json`, CI o
  Azure. Los tokens viven fuera del repo (env/secretos del IDE); nombrar la variable y omitir
  el valor.
- **Deuda declarada**: export/import de memoria (M1), garbage collection `memory gc` (M2).
  Evidencia: `BACKLOG.md`.

## Decisiones registradas en memoria del repo

- `dogfooding-versionado-init`: versionar `AGENTS.md`, `PRODUCT.md` y `aspec/`; ignorar
  `.opencode/`, `.ancletorc`, `.ancleto/`.
- `fix-init-tier-huerfano-0.6.36` y `fix-init-tier-guardado-0.6.37`: `init` debe aplicar el tier
  guardado a los agentes locales (paridad con `install`), incluido re-init sin flags.
- Evidencia: `.ancleto/memory.db` vía `ancleto memory list`.
