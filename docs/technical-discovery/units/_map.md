---
node: units/_map
kind: inventory
read_when: "qué unidades componen el repo, con propósito y entry point"
generatedAt: 2026-10-26T19:42:38Z
pluginVersion: 0.15.2
skillVersion: '2.3'
---

# Mapa de unidades

| Unidad | Propósito | Entry point | Dossier |
|---|---|---|---|
| CLI / orquestación | Parsing de comandos; `init`/`install`/`update`/`upgrade`, `export`/`import`, profiles, projects, `stats` + `stats failures`, doctor, MCP, migración legacy, refresh on-write en `memory import`, advisory en `memory doctor` y generación de `machine-env.md`. | `src/cli/index.js` | `units/cli-install.md` |
| UI de terminal | Banner animado y menús TTY sin dependencias. | `src/cli/ui.js` | — |
| Merge de templates | `mergeTemplateInto` (punto único de `install`/`update`/`upgrade` e `import`): reconcilia bloques planos legados (`reconcileLegacyBlocks`) antes de `mergeLocked`. | `src/cli/index.js` | `units/cli-install.md` |
| Contrato de validaciones | Política declarativa (bloque `LOCKED: validation-commands`): corre solo los comandos de `PRODUCT.md` → `## Project Commands`; format `not-configured` sin formatter; tests acotados. | `templates/AGENTS.md`, `AGENTS.md` | — |
| Adaptación de frontmatter | Módulo puro dueño único: `adaptFrontmatter(content, host, assetKind, name)` + `parseFrontmatter`/`serializeFrontmatter`, `AGENT_ADAPTER_DROP`, `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`/`COMMANDCODE_MCP_TOOL_MAP`. | `src/core/adapters/frontmatter.js` | `units/cli-install.md` |
| Instalación de assets por host | `AGENT_TARGETS` (fuente única de rutas, 8 hosts) + `installAgentAssets` materializan skills/agents/commands en el destino nativo del host. | `src/cli/index.js` | `units/cli-install.md` |
| Directiva de compresión host-scoped | `hostSupportsCompression`/`hostConfigHasCompression` deciden materializar `CAVEMAN_USAGE_NOTE` solo donde la config MCP del host incluye la tool. | `src/cli/index.js` | `units/cli-install.md` |
| Validación de frontmatter | `checkAgentsFrontmatter` compara el instalado contra la salida del adaptador (warning no bloqueante). | `src/cli/index.js` | `units/cli-install.md` |
| Perfil test (overlay) | `installProfileOverlay` + `copyTemplates` por perfil + `testspec/`; tester ampliado y `cleto-test-*`. | `src/cli/index.js`, `profiles/test/` | `units/cli-install.md` |
| Portabilidad entre máquinas | `export` (bundle + manifiesto sin rutas), `import` (regenera MCP + `doctor`), `import --repair`. | `src/cli/index.js` | `units/cli-install.md` |
| Commands como skills | `installCommandSkills`/`commandToSkill` empaquetan `commands/*.md` en `.agents/skills/<n>/SKILL.md` (antigravity). | `src/cli/index.js` | `units/cli-install.md` |
| MCP de host | `setupHostMcp` (dueño único): `.agents/mcp_config.json` (antigravity), `.mcp.json` (commandcode), `copilot-mcp.json` u `opencode.json`; merge no destructivo. | `src/cli/index.js` | `units/cli-install.md` |
| **Entorno de máquina** | **Dueño único** de detectar plataforma/shell/EOL/tooling (la disponibilidad de una herramienta exige ser **resoluble e invocable**: sonda `--version` acotada a 2 s por intento y 10 s acumulados), renderizar y escribir `.ancleto/machine-env.md`, y excluirlo localmente vía `info/exclude` sin tocar `.gitignore`; `checkMachineEnvTracked` para `ancleto check`. Se regenera en `init`, `install --project` y `upgrade`. | `src/core/machine-env.js` | `units/cli-install.md` |
| **Intake de sesión y techo de lecturas** | Contrato normativo del arranque: changes activos excluyendo `archive/`, un único `git status --short` delegado a `@technical-discovery` cuando el pedido toca el estado del repo, silencio si no hay nada que reportar; techo de 3 archivos no dirigidos con exención de las lecturas proactivas y de hasta 5 archivos nombrados por el usuario **por mensaje** (el sexto se delega). | `agents/orchestrator.md` | — |
| **Trigger de Recall ante overflow** | `<ContextOverflowWarning>` ⇒ delegar **exactamente un** Recall a `@memory-keeper` antes de cualquier otra etapa; el orquestador nunca llama `searchMemory`. Allowlist de `bash` de `@technical-discovery`: dos literales sobre `'*': deny`. | `agents/orchestrator.md`, `agents/technical-discovery.md`, `src/core/memory/engine.js` | `units/memory-engine.md` |
| Discovery / topología | Genera `.discovery-map.json` (árbol, totales, root files). | `src/core/discovery.js` | `units/discovery-engine.md` |
| Affected-set (grafo de imports) | `buildImportGraph`/`computeAffectedSet`: clausura transitiva de dependientes (determinista); superficie read-only `ancleto affected`. | `src/core/affected-set.js` | `units/discovery-engine.md` |
| Empaquetado por tier | Traduce tier+flags en args de Repomix (ignores, `--compress`, budget). | `src/core/repomix-tier.js` | `units/discovery-engine.md` |
| Modelos por tier | Selección de modelos y resolución del tier `gratis`. | `src/core/tier-models.js` | `units/discovery-engine.md` |
| Base de memoria | Abre `.ancleto/memory.db`, PRAGMAs, migraciones y FTS5. | `src/core/memory/database.js` | `units/memory-engine.md` |
| Motor de memoria | `buildWorkingContext`, `searchMemory` (BM25), supersesión atómica, `formatTopologyBlock`, procedencia `source`, `exportActive`/`importNodes`/`gcSuperseded` y el `<ContextOverflowWarning>` accionable (Recall a `@memory-keeper`, sin `searchMemory`). | `src/core/memory/engine.js` | `units/memory-engine.md` |
| Ops de memoria (CLI) | `ancleto memory export|import|gc|context|list|doctor` (JSON sanitizado, upsert idempotente con refresh on-write, purga de superseded, materialización de contexto, listado read-only, integridad + advisory). | `src/cli/index.js` | `units/memory-engine.md` |
| Tools de memoria | Handlers y JSON Schema de las 3 tools del LLM; refresh del working-context filtrado por `shouldRefreshWorkingContext`. | `src/core/memory/tools.js` | `units/memory-engine.md` |
| MCP de memoria | Transporte MCP stdio para el IDE (expone `searchMemory`/`recordRule`/`recordDecision`). | `src/core/memory/mcp-server.js` | `units/memory-engine.md` |
| Memory doctor | Integridad, reconstrucción de FTS5 y merge del WAL; línea advisory de frescura del working-context. | `src/core/memory/doctor.js`, `src/cli/index.js` (`memoryDoctorCmd`) | `units/memory-engine.md` |
| Working context | Render único (`renderWorkingContextBlock`) + persistencia (`writeWorkingContext`/`writeWorkingContextBlock`); día-cero sin DB desde la topología; refresh on-write CLI compare-based (`refreshWorkingContextOnWrite`) y staleness advisory (`checkWorkingContextFreshness`); trigger MCP (`shouldRefreshWorkingContext`); resolución de raíz (`resolveMemoryProjectRoot`, `workingContextPath`). | `src/core/memory/working-context.js` | `units/memory-engine.md` |
| **Reporte de fallos** | `ancleto stats failures`: lectura read-only de tool parts de opencode, clasificación `env`/`check`/`tool`/`unknown`, agregación por proyecto/herramienta/clase/esqueleto y enmascarado de secretos/rutas. | `src/cli/index.js` (`statsFailuresCommand`) | `units/cli-install.md` |
| Agents (10) | Subagentes instalables: orchestrator, coder, tester, spec-writer, reviewer, documenter, technical-discovery, technical-seed-writer, memory-keeper, context-resolver. Todos leen `.ancleto/machine-env.md`; orchestrator incluye `## Machine Environment` y exime esa lectura del techo, y define el intake de sesión y el techo de lecturas; technical-discovery tiene allowlist de `bash` de dos literales sobre `'*': deny`. | `agents/*.md` | — |
| Commands (16) | Comandos `/cleto-*` del ciclo SDD + review/security + recall/pr + transplant + update. | `commands/*.md` | — |
| Skills (21 dirs) | Ciclo de vida, discovery, commit/pr, review/security, update, upgrade y `triage-clarifier`; se instalan en el directorio del host. | `skills/*/SKILL.md` | `units/cli-install.md` |
| Templates (2) | `AGENTS.md` (bloques `LOCKED` canónicos, incl. `validation-commands`) y `PRODUCT.md` base para proyectos nuevos; sin valores de máquina. Aún contienen la guía residual de `searchMemory` ante `<ContextOverflowWarning>` (deuda `BACKLOG.md` ítem 17). | `templates/` | `units/cli-install.md` |
| Linter | Flat config ESLint con 4 reglas sobre `src/` y `test/`. | `eslint.config.js` | — |
| Specs del repo | Configuración aspec, **19 specs fuente** y changes (**1 activo** + 27 archivados), incl. `machine-environment` (8 requirements / 53 scenarios), `session-failure-report` y el aviso de overflow en `memory-engine`. | `aspec/config.yaml`, `aspec/specs/**`, `aspec/changes/**` | — |
| Tests | Suite `node --test` (13 archivos; incluye `machine-env`, `stats-failures` y el assert del aviso de overflow en `memory-engine`). | `test/*.test.js` | — |
| Análisis de tokens | Barrido de costo de tokens y matriz de decisión de "token-economy"; no runtime. | `optimizacion-de-tokens.md` | — |

Cada dossier describe responsabilidades, flujo, reglas y paths clave; no repite inventario.
