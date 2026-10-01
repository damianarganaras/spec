# Changelog

Todas las versiones notables de `@ancleto/spec`.

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
