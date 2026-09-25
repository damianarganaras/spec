---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-09-25T14:03:34Z
pluginVersion: 0.6.37
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
| CLI / orquestación | `src/cli/index.js` | Parsing de comandos, `init`/`install`/`update`/`upgrade`, discovery, memoria, projects, stats, doctor, MCP. |
| UI de terminal | `src/cli/ui.js` | Banner ASCII animado y menús TTY (Raw Mode) sin librerías; helpers de color. |
| Discovery | `src/core/discovery.js` | Mapa topológico `.discovery-map.json`. |
| Empaquetado y tiers | `src/core/repomix-tier.js` | Args de Repomix, ignores por tier, `--compress`, token budget. |
| Selección de modelos | `src/core/tier-models.js` | Modelos por tier, resolución de tier gratis (Muse Spark/probe/env). |
| Memoria persistente | `src/core/memory/*.js` | SQLite nativo + FTS5: `database`, `engine`, `tools`, `mcp-server`, `doctor`. |
| Assets instalables | `agents/`, `commands/`, `skills/`, `templates/` | Markdown que el CLI copia al IDE del usuario (10 agents, 12 commands, 18 skills, 2 templates). |
| Specs del propio repo | `aspec/` | `config.yaml`; `changes/` presente y vacío al momento del relevamiento. |
| Tests | `test/*.test.js` | Suite `node --test` (7 archivos; ~158 tests según `BACKLOG.md`). |

Entry point único: `src/cli/index.js` (`bin.ancleto` y `bin.aspec`). No hay servidor ni base
de datos propia más allá de `.ancleto/memory.db`. Evidencia: `package.json`, pack Repomix
(firmas de `src/**`), `.discovery-map.json`.

## Componentes y responsabilidades

- **CLI (`src/cli/index.js`)**: registra el proyecto en `~/.config/ancleto/projects.json`,
  resuelve el agente/IDE y el tier, copia assets, fusiona bloques `<!-- LOCKED -->` en
  templates, configura MCP (propio + caveman; engram opcional) y expone los subcomandos.
- **Discovery**: `--check` reporta estado del seed (`READY`/`STALE`/`PARTIAL`/`MISSING`) con
  `impact` (`none`/`minor`/`material`) y `affectedDocs`; el pack (Repomix) se genera on-demand.
- **Memoria**: 3 tools (`searchMemory`, `recordRule`, `recordDecision`) sobre SQLite + FTS5
  con supersesión atómica por `memory_key`; expuesta como MCP stdio (`ancleto mcp`).
- **Ciclo SDD**: comandos `/cleto-*` que consumen `aspec/changes/<name>/` y las skills
  nativas; no requieren binario externo.

## Flujos principales

1. **Alta de proyecto** — `ancleto init` (wizard en TTY): escribe `.ancletorc`, scaffold
   `aspec/`, copia `AGENTS.md`/`PRODUCT.md` preservando lo existente, aplica el tier a los
   agentes locales y materializa `.ancleto/working-context.md`. Evidencia: `README.md`,
   `BACKLOG.md` (fixes G11/v0.6.36-v0.6.37 en memoria del repo).
2. **Instalación/actualización** — `ancleto install|update|upgrade`: copia `agents/`,
   `commands/`, `skills/`, `templates/`, fusiona MCP de forma no destructiva y re-aplica
   bloques `LOCKED`. Evidencia: firmas de `src/cli/index.js`, `README.md`.
3. **Descubrimiento** — `ancleto discovery --check` (estado) y `ancleto discovery
   [--compress]` (pack Repomix con ignores del tier); el seed lo redacta la skill
   `ancleto-technical-discovery`. Evidencia: `src/cli/index.js`, `src/core/repomix-tier.js`.
4. **Memoria entre sesiones** — el orquestador inyecta `<ProjectMemoryRules>` y
   `<ProjectTopology>`; las reglas se recuperan proactivamente y las decisiones vía
   `searchMemory`. Evidencia: `DESIGN-memory-engine-v0.2.0.md`, `agents/orchestrator.md`.
5. **Ciclo de change** — `/cleto-new` → `/cleto-propose` → `/cleto-apply` → `/cleto-verify`
   → `/cleto-archive`, con memoria registrada en verify/archive. Evidencia: `commands/`,
   `skills/`, `README.md`.

## Estado del repositorio

Dogfooding: el propio framework está inicializado sobre este repo (`ancleto init --agent
opencode --tier minimo --lang es`); se versionan `AGENTS.md`, `PRODUCT.md` y `aspec/`, y se
ignoran `.opencode/`, `.ancletorc` y `.ancleto/`. Evidencia: memoria del repo
(`dogfooding-versionado-init`), `.gitignore`, `.ancletorc`.
