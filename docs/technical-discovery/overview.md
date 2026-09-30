---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-09-30T19:34:11Z
pluginVersion: 0.7.2
skillVersion: '2.3'
---

# Overview

## Propósito

`@ancleto/spec` (**Ancleto**, alias de CLI `aspec`) es un orquestador liviano para
desarrollo asistido por IA bajo **Spec-Driven Development (SDD)**. Vive dentro del IDE del
usuario y automatiza tres cosas: **especificar** (ciclo de changes), **descubrir** (mapa
topológico + empaquetado de contexto) y **recordar** (reglas y decisiones del proyecto entre
sesiones). Evidencia: `README.md`, `package.json`.

Restricciones de diseño declaradas: **cero dependencias de runtime**, Node ≥ 24 (usa el
módulo nativo `node:sqlite`), y control explícito de costo por **tiers** (`normal`,
`minimo`, `gratis`). Evidencia: `README.md`, `package.json`, `src/core/repomix-tier.js`.

## Arquitectura (observado)

CLI monolítica en ESM, sin framework externo. Capas:

| Capa | Ruta | Rol |
|---|---|---|
| CLI / orquestación | `src/cli/index.js` | Parsing de comandos, `init`/`install`/`update`/`upgrade`, instalación por host, discovery, memoria, projects, stats, doctor, MCP. |
| UI de terminal | `src/cli/ui.js` | Banner ASCII animado y menús TTY (Raw Mode) sin librerías; helpers de color. |
| Discovery | `src/core/discovery.js` | Mapa topológico `.discovery-map.json`. |
| Empaquetado y tiers | `src/core/repomix-tier.js` | Args de Repomix, ignores por tier, `--compress`, token budget. |
| Selección de modelos | `src/core/tier-models.js` | Modelos por tier, resolución de tier gratis (Muse Spark/probe/env). |
| Memoria persistente | `src/core/memory/*.js` | SQLite nativo + FTS5: `database`, `engine`, `tools`, `mcp-server`, `doctor`, `working-context`. |
| Assets instalables | `agents/`, `commands/`, `skills/`, `templates/` | Markdown que el CLI copia al IDE del usuario (10 agents, 12 commands, 18 skills, 2 templates). |
| Specs del propio repo | `aspec/` | `config.yaml` + `specs/` (aspec-bootstrap, memory-engine, review) + `changes/archive/`. |
| Tests | `test/*.test.js` | Suite `node --test` (8 archivos; `BACKLOG.md` declara 162 tests al cierre de v0.6.38). |

Entry point único: `src/cli/index.js` (`bin.ancleto` y `bin.aspec`). No hay servidor ni base
de datos propia más allá de `.ancleto/memory.db`. Evidencia: `package.json`, pack Repomix
(firmas de `src/**`), `.discovery-map.json`.

## Componentes y responsabilidades

- **CLI (`src/cli/index.js`)**: registra el proyecto en `~/.config/ancleto/projects.json`,
  resuelve el agente/IDE y el tier, materializa assets en el destino nativo del host
  (`AGENT_TARGETS`), adapta el frontmatter de agents para `claude`/`vscode`/`antigravity`,
  fusiona bloques `<!-- LOCKED -->` en templates, configura MCP (propio + caveman; engram
  opcional) y expone los subcomandos.
- **Discovery**: `--check` reporta estado del seed (`READY`/`STALE`/`PARTIAL`/`MISSING`) con
  `impact` (`none`/`minor`/`material`) y `affectedDocs`; el pack (Repomix) se genera on-demand.
- **Memoria**: 3 tools (`searchMemory`, `recordRule`, `recordDecision`) sobre SQLite + FTS5
  con supersesión atómica por `memory_key`; expuesta como MCP stdio (`ancleto mcp`). Cada
  escritura puede refrescar `.ancleto/working-context.md` (`working-context.js`).
- **Ciclo SDD**: comandos `/cleto-*` que consumen `aspec/changes/<name>/` y las skills
  nativas; no requieren binario externo.

## Flujos principales

1. **Alta de proyecto** — `ancleto init` (wizard en TTY): escribe `.ancletorc`, scaffold
   `aspec/`, copia `AGENTS.md`/`PRODUCT.md` preservando lo existente, migra `openspec/` legacy
   si existe, instala assets por host, aplica el tier a los agentes locales, configura el MCP
   del host y materializa `.ancleto/working-context.md`. Evidencia: `src/cli/index.js`, `README.md`.
2. **Instalación/actualización** — `ancleto install|update|upgrade` (con `install --project`
   como paridad): materializa `agents/`, `commands/`, `skills/`, `templates/` en el destino del
   host, adapta frontmatter, fusiona MCP de forma no destructiva, migra `openspec/` legacy y
   re-aplica bloques `LOCKED`. Evidencia: `src/cli/index.js`, `README.md`.
3. **Descubrimiento** — `ancleto discovery --check` (estado) y `ancleto discovery
   [--compress]` (pack Repomix con ignores del tier); el seed lo redacta la skill
   `ancleto-technical-discovery`. Evidencia: `src/cli/index.js`, `src/core/repomix-tier.js`.
4. **Memoria entre sesiones** — el orquestador inyecta `<ProjectMemoryRules>` y
   `<ProjectTopology>`; las reglas se recuperan proactivamente y las decisiones vía
   `searchMemory`. El archivo `.ancleto/working-context.md` se regenera en `init`,
   `install --project`, `upgrade` y tras escrituras de memoria. Evidencia: `agents/orchestrator.md`,
   `src/core/memory/working-context.js`.
5. **Ciclo de change** — `/cleto-new` → `/cleto-propose` → `/cleto-apply` → `/cleto-verify`
   → `/cleto-archive`, con memoria registrada en verify/archive y archivado en
   `aspec/changes/archive/`. Evidencia: `commands/`, `skills/`, `aspec/changes/archive/`.

## Estado del repositorio

Dogfooding: el propio framework está inicializado sobre este repo (`ancleto init --agent
opencode --tier minimo --lang es`); se versionan `AGENTS.md`, `PRODUCT.md` y `aspec/`, y se
ignoran `.opencode/`, `.ancletorc` y `.ancleto/`. Evidencia: `README.md`, `.gitignore`,
`.discovery-map.json`.
