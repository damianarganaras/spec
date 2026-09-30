# Changelog

Todas las versiones notables de `@ancleto/spec`.

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
