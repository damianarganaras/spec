# Changelog

Todas las versiones notables de `@ancleto/spec`.

## [0.12.1] - 2026-10-07

### Added
- **Host `commandcode` (Command Code, CLI `cmd`)**: soporte nativo con layout `.commandcode/{skills,agents,commands}`, adaptador de frontmatter de agents (`adaptCommandCodeFrontmatter` + `COMMANDCODE_TOOL_MAP`/`COMMANDCODE_MCP_TOOL_MAP`), MCP de proyecto en `.mcp.json` (segunda excepción host-MCP, junto a antigravity) y nota de modelo en el orchestrator. En Command Code `tools` omitido significa "ninguna tool", por eso un origen sin `tools` emite `tools: "*"`. Spec nueva en `aspec/specs/commandcode-support/spec.md`; deltas en `agent-install-routing` y `skill-frontmatter-adapters`; tests en `test/cli.test.js` y `test/adapters-frontmatter.test.js`.

### Changed
- `README.md`: tabla de hosts (8) y documentación del MCP y del adaptador de Command Code.
- Semilla de `docs/technical-discovery` regenerada (`READY`).

## [0.12.0] - 2026-10-06

### Added
- **Skill `ancleto-update` (`/cleto-update`)**: actualiza los artifacts de un change existente ante cambios de definición con merge no destructivo — clasifica por artifact dueño (`specs/`, `design.md`, `proposal.md`, `tasks.md`), detecta drift entre los delta specs y los specs principales, y pregunta el modo de escritura (in-place vs `rev2`) en `skills/ancleto-update/SKILL.md` y `commands/cleto-update.md`, con spec en `aspec/specs/artifact-update/spec.md`.

### Changed
- Routing del ciclo aspec (`skills/ancleto-workflow/SKILL.md`) y `test/content-guards.test.js` (registro en `ARTIFACT_SKILLS` y conteo de comandos) actualizados para la nueva skill.
- Semilla de `docs/technical-discovery` regenerada (`READY`).

## [0.11.0] - 2026-10-02

### Added
- **Subcomandos `ancleto memory export|import|gc`** (`gc` acepta `--dry-run` y `--days`): el engine expone `exportActive`, `importNodes` y `gcSuperseded` (los nodos superseded quedan como historia interna y no se exportan) en `src/core/memory/engine.js` y `src/cli/index.js`.
- **Adaptador de frontmatter** (`parseFrontmatter`, `serializeFrontmatter`, `adaptFrontmatter`) para generar assets por host en `src/core/adapters/frontmatter.js`.
- **Gate de lint estándar**: config ESLint flat (`eslint.config.js`), script `npm run lint` y paso bloqueante en `publish.yml`, con test de coherencia en `test/linter-config.test.js`.

### Changed
- `init` interactivo con tier `gratis` pregunta siempre por Muse Spark 1.3 Free, salvo que `ANCLETO_MUSE_SPARK` fuerce el valor; informa el origen (variable de entorno, valor guardado o detección) cuando no pregunta (`src/cli/index.js`, `README.md`).
- Archivados cuatro changes en `aspec/changes/archive/` (`add-standard-linter`, `cleto-review`, `dynamic-frontmatter-adapters`, `memory-ops-export-import-gc`), specs sincronizadas en `aspec/specs/` (`code-review`, `linter-standard`, `memory-ops`, `skill-frontmatter-adapters`), `BACKLOG.md` actualizado y semilla de `docs/technical-discovery` regenerada.

## [0.10.0] - 2026-10-01

### Added
- **Revisión de código con `/cleto-review`** (skill `ancleto-review`): revisión de calidad sobre el scope declarado por el usuario, con detectores de código repetido, método redundante, código mal ubicado y código sin uso (solo reporta, no edita) en `skills/ancleto-review/SKILL.md` y `commands/cleto-review.md`, con spec en `aspec/changes/cleto-review/specs/code-review/spec.md`.
- **Guía de instalación manual (sin npm)** en `docs/instalacion-manual.md`, enlazada desde el índice del `README.md`.
- Archivo `LICENSE` (MIT).

### Changed
- `README.md`: precisión sobre tool ids de Antigravity omitidos con aviso (`mcpServers`/`mcp_*`/`call_mcp_tool` caen en omisión, `call_mcp_tool` prohibido), migración legacy `openspec/` → `aspec/` por copia en `init`/`install --project`/`upgrade`, puntos de regeneración de `.ancleto/working-context.md` y nota de garantía `GUARANTEE NOT SUSTAINED` en `/cleto-verify`.

## [0.9.1] - 2026-09-30

### Fixed
- Codificación URL (`%40`) en badge de versión de npm en `README.md` para compatibilidad con el proxy de imágenes de GitHub (Camo).

## [0.9.0] - 2026-09-30

### Added
- **Soporte para GitHub Copilot** (`--agent copilot`): integración con VS Code y Visual Studio, ruteo de agents/commands a `.github/prompts/*.prompt.md` y configuración MCP en `.github/copilot-mcp.json`.
- **Portabilidad de proyectos entre máquinas**: nuevos comandos `ancleto export` (bundle portable con manifiesto de intención MCP sin paths absolutos) e `ancleto import` (regeneración de paths locales, resolución de binarios y `--repair`), junto con el comando `/cleto-transplant`.
- **Perfil de test automation** (`ancleto init --profile test` / `--profile test:playwright`): perfiles modulares bajo `profiles/test/` con subagentes especializados (`tester`, `reviewer`), comandos `/cleto-test-*` (apply, archive, coverage, heal, proposal) y templates específicos.
- **Detección e importación de OpenSpec pre-existente**: detección automática de proyectos con OpenSpec legacy/externo en `init` e `install --project`, ofreciendo migración asistida e idempotente a `aspec/`.
- **Auditoría de seguridad**: nuevo comando `/cleto-security` y skill `ancleto-security` para análisis de seguridad de cambios y repositorios.

### Fixed
- Corrección de la ruta de instalación de skills de Antigravity (`.agents/skills/<name>/SKILL.md`).
- Corrección del conteo de comandos wrapper en los content guards de la suite de tests.

## [0.8.0] - 2026-09-30

### Added
- **Soporte completo de Antigravity** al elegir `--agent antigravity`: `init` deja el framework listo para usar.
  - skills en `.agents/skills/<n>/SKILL.md`
  - agents adaptados en `.agents/agents/<n>.md`
  - commands materializados como skills en `.agents/skills/<n>/SKILL.md` (Antigravity no tiene dir de commands; los Workflows están deprecados a favor de Skills)
  - MCP de workspace en `.agents/mcp_config.json` (merge no destructivo)
- Nueva capability spec `aspec/specs/antigravity-support/spec.md`.
- `init` ahora configura MCP (y agrega el flag `--no-mcp`).
- `check`/tier/`projects` host-aware (derivan los hosts instalados del manifiesto).

### Changed
- **El adapter de frontmatter de `claude` y `vscode` cambió**: se dropean campos no portables y los tools sin id verificado se **omiten con aviso** (antes se copiaban verbatim / se emitían ids no confirmados). Quien tenga `claude` o `vscode` instalado verá frontmatter distinto tras actualizar.
- Mapa de tools de Antigravity restringido a 5 ids confirmados en el frontmatter (`view_file`, `replace_file_content`, `grep_search`, `run_command`, `manage_task`); el resto se omite con aviso `skip tool '<k>': no verified Antigravity id for agent '<n>'`.

### Fixed
- Dedupe de claves gestionadas en el frontmatter adaptado (evita claves duplicadas en YAML).
- `check` multi-host ya no reporta huérfanos falsos cuando el host instalado no coincide con `agent`.
