---
node: units/_map
kind: inventory
read_when: "qué unidades componen el repo, con propósito y entry point"
generatedAt: 2026-09-30T19:34:11Z
pluginVersion: 0.7.2
skillVersion: '2.3'
---

# Mapa de unidades

| Unidad | Propósito | Entry point | Dossier |
|---|---|---|---|
| CLI / orquestación | Parsing de comandos; `init`/`install`/`update`/`upgrade`, projects, stats, doctor, MCP, migración legacy. | `src/cli/index.js` | `units/cli-install.md` |
| UI de terminal | Banner animado y menús TTY sin dependencias. | `src/cli/ui.js` | — |
| Instalación de assets por host | `AGENT_TARGETS` (fuente única de rutas) + `installAgentAssets` materializan skills/agents/commands en el destino nativo del host. | `src/cli/index.js` | `units/cli-install.md` |
| Adaptación de frontmatter | `adaptAntigravityFrontmatter` y `AGENT_ADAPTER_DROP` transforman agents para `claude`/`vscode`/`antigravity`; `ANTIGRAVITY_TOOL_MAP` (conjunto cerrado) y política de omisión con aviso. | `src/cli/index.js` | `units/cli-install.md` |
| Commands como skills | `installCommandSkills`/`commandToSkill` empaquetan `commands/*.md` en `.agents/skills/<n>/SKILL.md` (antigravity). | `src/cli/index.js` | `units/cli-install.md` |
| MCP de host | `setupHostMcp` (dueño único): `.agents/mcp_config.json` (antigravity) u `opencode.json`; merge no destructivo. | `src/cli/index.js` | `units/cli-install.md` |
| Discovery / topología | Genera `.discovery-map.json` (árbol, totales, root files). | `src/core/discovery.js` | `units/discovery-engine.md` |
| Empaquetado por tier | Traduce tier+flags en args de Repomix (ignores, `--compress`, budget). | `src/core/repomix-tier.js` | `units/discovery-engine.md` |
| Modelos por tier | Selección de modelos y resolución del tier `gratis`. | `src/core/tier-models.js` | `units/discovery-engine.md` |
| Base de memoria | Abre `.ancleto/memory.db`, PRAGMAs, migraciones y FTS5. | `src/core/memory/database.js` | `units/memory-engine.md` |
| Motor de memoria | `buildWorkingContext`, `searchMemory` (BM25), supersesión atómica. | `src/core/memory/engine.js` | `units/memory-engine.md` |
| Tools de memoria | Handlers y JSON Schema de las 3 tools del LLM. | `src/core/memory/tools.js` | `units/memory-engine.md` |
| MCP de memoria | Transporte MCP stdio para el IDE. | `src/core/memory/mcp-server.js` | `units/memory-engine.md` |
| Memory doctor | Integridad, reconstrucción de FTS5 y merge del WAL. | `src/core/memory/doctor.js` | `units/memory-engine.md` |
| Working context | Renderiza y persiste `.ancleto/working-context.md`; refresco ante escrituras de memoria. | `src/core/memory/working-context.js` | `units/memory-engine.md` |
| Agents (10) | Subagentes instalables: orchestrator, coder, tester, spec-writer, reviewer, documenter, technical-discovery, technical-seed-writer, memory-keeper, context-resolver. | `agents/*.md` | — |
| Commands (12) | Comandos `/cleto-*` del ciclo SDD + recall/pr/commit. | `commands/*.md` | — |
| Skills (18) | Ciclo de vida, discovery, commit/pr, upgrade y `triage-clarifier`; se instalan en el directorio del host. | `skills/*/SKILL.md` | `units/cli-install.md` |
| Templates (2) | `AGENTS.md` y `PRODUCT.md` base para proyectos nuevos (bloques LOCKED/EXTENSIBLE). | `templates/` | `units/cli-install.md` |
| Specs del repo | Configuración aspec, specs principales y changes archivados. | `aspec/config.yaml`, `aspec/specs/**` | — |
| Tests | Suite `node --test` de CLI, discovery, memoria, working-context, tier y guardas de contenido. | `test/*.test.js` | — |

Cada dossier describe responsabilidades, flujo, reglas y paths clave; no repite inventario.
