# Changelog

Todas las versiones notables de `@ancleto/spec`.

## [0.17.1] - 2026-10-30

### Changed
- **`design.md` y `context.md` retirados del flujo de cambio nuevo**: los generadores ya no los emiten; las decisiones de diseño durables viven en `proposal.md ## Decisiones`.
- Consumidores los tratan como legado opcional; `archive` ya no elimina `context.md` y mueve el change sin modificarlo, dejando intactos los changes legados ya archivados.
- Content guards impiden re-emitirlos; specs `artifact-update` y `prompt-contracts` actualizadas.

### Removed
- Generación de `design.md` y `context.md` en el alta de un change.

## [0.17.0] - 2026-10-30

### Added
- **Modo Promotion en `@memory-keeper`**: al archivar promueve sólo las decisiones de `proposal ## Decisiones` con `memory_key` propia y `Estado: aprobado`, con preflight del lote; sin candidatos no escribe ni delega, y corre después del merge de specs. Gate en `ancleto-archive`, `ancleto-bulk-archive` y `ancleto-verify`.
- **Resolutores `change:` / `spec:` / `path:`** con unicidad y **ambigüedad reportada**; `change:` queda anclado a `YYYY-MM-DD-<slug>`.

### Changed
- **Refs normalizadas dentro de `content`** en `recordNode`, con validación **fail-closed** y exención única `context.source === 'runtime'`; `cli:import` queda fuera del camino de escritura y conserva LWW.
- **`<ProjectMemoryRules>`** renderiza sólo la prosa de la regla, sin el bloque `refs:`.
- Backfill de las cinco decisiones únicas de los `design.md` históricos.
- Specs sincronizadas: `memory-engine`, `memory-ops` y `prompt-contracts`.
- `opencode.json` con override de modelo por agente.

### Security
- Rechazo de credenciales sin eco del valor.

## [0.16.2] - 2026-10-29

### Added
- **`## Decisiones` en el proposal**: los siete generadores del proposal (`@spec-writer` y las skills `propose`, `ff`, `continue`, `new`, `onboard`, `upgrade`) emiten la sección, con el shape canónico declarado una sola vez en `agents/spec-writer.md` y referencia desde las skills.

### Changed
- **Checkpoint de contrato**: el checkpoint posterior a `@spec-writer` aprueba el contrato del cambio —intención, alcance, `Requirement` nuevo o existente, riesgos, decisión de arquitectura si aplica, validación prevista y paths autorizados— en menos de una pantalla; ya no enumera documentos ni depende de `design.md`. Archive y merge siguen siendo stops separados y explícitos.
- Delta `ADDED`-only mergeado en `aspec/specs/prompt-contracts/spec.md`: 2 `Requirement` nuevos, 0 existentes modificados.
- **Nota de release**: `v0.16.1` se tageó sin bump de versión y su `npm publish` se omitió por versión ya existente; `0.16.2` es la primera versión publicada que incluye estos cambios.

## [0.16.0] - 2026-10-29

### Added
- **`memory snapshot --out <archivo> [--force] [--json]`**: copia consistente de la base con `VACUUM INTO`, historial incluido (`superseded_by`), verificación `quick_check` del destino y reemplazo con backup.
- **`memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]`**: consolida duplicados marcando cada source con `superseded_by` hacia un target activo existente; transacción única, mismas `type` obligatorias, sin tablas nuevas.
- Fixtures de memoria (`test/fixtures/memory/seed.json`, `golden.json`) y corpus golden M01–M10 evaluado contra una DB congelada.

### Changed
- `memory doctor` es **estrictamente read-only** por defecto: no ejecuta checkpoint, DDL ni escrituras sobre FTS. `--rebuild` es el único camino que escribe.
- El check `Indice FTS5` detecta desalineación en modo read-only comparando `memory_fts_docsize` contra `memory_nodes` (tres estados: índice ausente = falla; sombra no consultable = omitido; resto = comparación).
- El check `Checkpoint WAL` reporta el estado observable del `-wal` sin ejecutar checkpoint.
- El merge real refresca `.ancleto/working-context.md`; si el refresco falla, el comando reporta que el merge se aplicó y que el bloque quedó desactualizado, con exit code distinto de cero.

### Fixed
- Espera determinista de frames del WAL en los tests de MCP: fallaban sólo en CI Linux.

### Security
- El snapshot compara por identidad de archivo (`realpathSync.native`, case-insensitive en win32) para que un alias de ruta no borre la base fuente.

## [0.15.3] - 2026-10-27

### Changed
- Contrato de delegación de agentes: `@coder` es el único que commitea, sólo los paths nombrados en el checkpoint.
- `git push` denegado como capacidad en toda definición con `bash`; el merge requiere aprobación explícita del usuario caso por caso.
- `task` declarado en las 10 definiciones, `true` sólo en el orquestador.
- `@tester` devuelve un `change diff` (`-U3`, tope de 200 líneas, truncamiento declarado); `@reviewer` lo consume como evidencia y mantiene `bash: false`.
- Reglas de memoria del proyecto destiladas por delegación (5 reglas / 1500 bytes).
- `@documenter` debe citar `archivo:línea` en cada afirmación actualizada o confirmada.
- Ningún agente borra una carpeta de change; `@spec-writer` no recibe capacidad de borrado.
- Content guards migrados a asserts de comportamiento con pruebas de mutación.
- Cierra los ítems de backlog 1, 3 y 9.

### Known limitation
- Los denies de permisos de bash **no** son una frontera técnica en este host: son evadibles con un shim `.CMD` (ítem 19 del backlog).

## [0.15.2] - 2026-10-26

### Added
- **Intake de sesión en el orquestador** (`agents/orchestrator.md`, sección `## Session Intake`): detecta changes activos en `aspec/changes/` excluyendo `archive/` y los reporta sólo si difieren del solicitado; delega un único `git status --short` a `@technical-discovery` cuando el pedido toca el estado del repo y no emite salida cuando no hay nada que reportar. `agents/technical-discovery.md` recibe `'git status --short': allow`.

### Changed
- Techo de lecturas del orquestador: los archivos nombrados explícitamente por el usuario quedan exentos hasta 5 por mensaje, con delegación por encima del tope.
- `<ContextOverflowWarning>` (`src/core/memory/engine.js`) pasa a ser incondicional y delega un Recall a `@memory-keeper` en lugar de nombrar `searchMemory`.
- Specs sincronizadas (`prompt-contracts` +3 requirements, `memory-engine` +1); semilla de `docs/technical-discovery` regenerada (`READY`) y `BACKLOG.md` ítem 17 registra la guía `searchMemory` residual como follow-up diferido.

## [0.15.1] - 2026-10-26

### Changed
- Semilla de `docs/technical-discovery` regenerada tras `0.15.0`.
- Cierre de bookkeeping de la línea `0.15.x`: registro de activación en `BACKLOG.md` y exclusión local de auditoría en `.gitignore`.

## [0.15.0] - 2026-10-26

### Added
- **Bloque de entorno de máquina** (`.ancleto/machine-env.md`): artefacto local derivado y no versionado, regenerado en `init`, `install --project` y `upgrade` con plataforma, shell y su fuente, fin de línea y disponibilidad de cinco herramientas con fallback; exclusión local del clon vía `git check-ignore --no-index` + `info/exclude` (sin gestionar `.gitignore`), entrega a los subagentes con `bash` habilitado y precedencia declarada. Spec nueva en `aspec/specs/machine-environment/spec.md`.
- **Subcomando `ancleto stats failures`**: clasificación de fallos por `env`/`check`/`tool`/`unknown` desde la tabla `part` de la base de opencode, con esqueleto estructural del comando y sesiones afectadas; apertura read-only sobre WAL, agregación en SQL y privacidad (sin `output` ni texto libre). Spec nueva en `aspec/specs/session-failure-report/spec.md`.

### Changed
- `BACKLOG.md`: registro de la activación del bloque de entorno y de los hallazgos de la auditoría de 9 sesiones.

## [0.14.0] - 2026-10-17

### Added
- **Frescura del working-context en las escrituras de la CLI**: `ancleto memory import` regenera `.ancleto/working-context.md` por el mismo camino de render (`refreshWorkingContext`) y el CLI reporta staleness o ausencia del artefacto, en `src/cli/index.js` y `src/core/memory/working-context.js`; spec `memory-engine` actualizada.

### Changed
- `README.md` y `agents/orchestrator.md`: puntos de regeneración del working-context alineados con la nueva superficie.

## [0.13.2] - 2026-10-15

### Added
- **Pipeline de mayor throughput**: cierre en paralelo de `@documenter` y `@memory-keeper`, Validation Ledger prearmado para el reviewer, `affected-set` determinístico por grafo de imports (`src/core/affected-set.js`) y memoria en un solo paso.

### Changed
- `agents/orchestrator.md`, `tester.md`, `reviewer.md` y `memory-keeper.md`; specs `prompt-contracts` y `review` sincronizadas, con tests del `affected-set` en `test/affected-set.test.js`.

## [0.13.1] - 2026-10-15

### Changed
- Semilla de `docs/technical-discovery` regenerada. Reconstrucción parcial: es el único cambio de contenido del tramo además del bump de versión, sin otras entradas trazables.

## [0.13.0] - 2026-10-15

### Added
- **Contrato de validaciones declarativo**: las validaciones dejan de estar hardcodeadas en los prompts y pasan a declararse en `PRODUCT.md` sección `## Project Commands` (correr sólo lo declarado, saltear y registrar lo ausente, nunca inventar); `coder` y `tester` dejan de fijar Prettier/ESLint, el format check es `not-configured` sin formatter declarado, y `mergeTemplateInto` reconcilia el bloque plano legado en `install`/`update`/`upgrade` e `import`. Spec en `aspec/specs/prompt-contracts/spec.md`.
- **Presupuesto de tokens de los prompts**: dedupe del orquestador (hogar único de Runtime Safety y contrato de salida en cada agente), envelope por tramo en vez de verbatim, reglas compartidas con hogar único en `AGENTS.md`, content guards a nivel de comportamiento y materialización del working-context desde el día cero sin `memory.db`.

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
