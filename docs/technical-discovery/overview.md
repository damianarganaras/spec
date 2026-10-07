---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-10-07T23:35:00Z
pluginVersion: 0.12.0
skillVersion: '2.3'
---

# Overview

## Propósito

`@ancleto/spec` (**Ancleto**, alias de CLI `aspec`) es un orquestador liviano para
desarrollo asistido por IA bajo **Spec-Driven Development (SDD)**. Vive dentro del
IDE del usuario y automatiza tres cosas: **especificar** (ciclo de changes),
**descubrir** (mapa topológico + empaquetado de contexto) y **recordar** (reglas y
decisiones del proyecto entre sesiones). Evidencia: `README.md`, `package.json`.

Restricciones de diseño declaradas: **cero dependencias de runtime**, Node ≥ 24
(usa el módulo nativo `node:sqlite`), y control explícito de costo por **tiers**
(`normal`, `minimo`, `gratis`). El único uso de dependencias externas es de
**desarrollo** (ESLint). Evidencia: `README.md`, `package.json`,
`src/core/repomix-tier.js`, `eslint.config.js`.

## Arquitectura (observado)

CLI monolítica en ESM, sin framework externo. Capas:

| Capa | Ruta | Rol |
|---|---|---|
| CLI / orquestación | `src/cli/index.js` | Parsing de comandos, `init`/`install`/`update`/`upgrade`, instalación por host, perfiles, export/import, discovery, memoria y sus ops, projects, stats, doctor, MCP. |
| UI de terminal | `src/cli/ui.js` | Banner ASCII animado y menús TTY (Raw Mode) sin librerías; helpers de color. |
| Adaptación de frontmatter | `src/core/adapters/frontmatter.js` | **Módulo puro, dueño único** de la transformación de frontmatter por host/assetKind. |
| Discovery | `src/core/discovery.js` | Mapa topológico `.discovery-map.json`. |
| Empaquetado y tiers | `src/core/repomix-tier.js` | Args de Repomix, ignores por tier, `--compress`, token budget. |
| Selección de modelos | `src/core/tier-models.js` | Modelos por tier, resolución de tier gratis (Muse Spark/probe/env). |
| Memoria persistente | `src/core/memory/*.js` | SQLite nativo + FTS5: `database`, `engine` (search/record/export/import/gc), `tools`, `mcp-server`, `doctor`, `working-context`. |
| Assets instalables | `agents/`, `commands/`, `skills/`, `templates/`, `profiles/` | Markdown que el CLI copia al IDE del usuario (10 agents, 16 commands, 21 skills, 2 templates + perfil `test`). |
| Specs del propio repo | `aspec/` | `config.yaml` + `specs/` (16 capacidades, incluidas `artifact-update` y `commandcode-support`) + 1 change activo (`ancleto-vscode-extension`, diferido) + `changes/archive/` (incluye `2026-10-06-ancleto-update`, `2026-10-05-memory-actor-provenance` y `2026-10-07-add-commandcode-support`). |
| Lint | `eslint.config.js` | Flat config mínima (4 reglas) sobre `src/` y `test/`. |
| Tests | `test/*.test.js` | Suite `node --test` (10 archivos; **413 tests / 86 suites medidos en verde** al cierre de `add-commandcode-support`; `BACKLOG.md` declaraba 331 antes de ese change). |

Entry point único: `src/cli/index.js` (`bin.ancleto` y `bin.aspec`). No hay
servidor ni base de datos propia más allá de `.ancleto/memory.db`. Evidencia:
`package.json`, pack Repomix (firmas de `src/**`), `BACKLOG.md`.

## Componentes y responsabilidades

- **CLI (`src/cli/index.js`)**: registra el proyecto en `~/.config/ancleto/projects.json`,
  resuelve el agente/IDE y el tier, materializa assets en el destino nativo del
  host (`AGENT_TARGETS`) delegando la adaptación de frontmatter en
  `src/core/adapters/frontmatter.js`, aplica el overlay del perfil `test`,
  fusiona bloques `<!-- LOCKED -->`, configura MCP (propio + caveman; engram
  opcional; `copilot-mcp.json`, `.agents/mcp_config.json` y `.mcp.json` según host)
  y expone los subcomandos.
- **Adaptador de frontmatter**: `adaptFrontmatter(content, host, assetKind, name)`
  es una función pura sin E/S. `opencode` (y skills de cualquier host) es
  identidad; `claude`, `vscode` y `copilot` dropean claves no portables;
  `antigravity` y `commandcode` transforman a su convención; `cursor`/`roo` son
  passthrough con aviso a stderr; host desconocido es passthrough con aviso.
- **Discovery**: `--check` reporta estado del seed (`READY`/`STALE`/`PARTIAL`/
  `MISSING`) con `impact` (`none`/`minor`/`material`) y `affectedDocs`; el pack
  (Repomix) se genera on-demand.
- **Memoria**: 3 tools (`searchMemory`, `recordRule`, `recordDecision`) sobre
  SQLite + FTS5 con supersesión atómica por `memory_key`; expuesta como MCP stdio
  (`ancleto mcp`). Los subcomandos `memory export|import|gc` respaldan/restauran
  nodos activos y purgan superseded. Cada escritura puede refrescar
  `.ancleto/working-context.md`.
- **Ciclo SDD**: comandos `/cleto-*` que consumen `aspec/changes/<name>/` y las
  skills nativas; no requieren binario externo. Incluye `/cleto-review` (calidad
  interna del código), `/cleto-update` (revisión de artifacts de un change ante
  cambio de definición) y `/cleto-transplant` (mudanza entre máquinas). Con
  perfil `test`, el orchestrator rutea lo test-only al tester ampliado
  (`cleto-test-*`).

## Flujos principales

1. **Alta de proyecto** — `ancleto init` (wizard en TTY): escribe `.ancletorc`,
   scaffold `aspec/` (+ `testspec/` con `--profile test`), copia `AGENTS.md`/
   `PRODUCT.md` preservando lo existente, importa `openspec/` si existe, instala
   assets por host (+ overlay del perfil), aplica el tier a los agentes locales,
   configura el MCP del host y materializa `.ancleto/working-context.md`.
   Evidencia: `src/cli/index.js`, `README.md`.
2. **Instalación/actualización** — `ancleto install|update|upgrade`: materializa
   `agents/`, `commands/`, `skills/`, `templates/` en el destino del host,
   adapta frontmatter, fusiona MCP de forma no destructiva, importa `openspec/`
   y re-aplica bloques `LOCKED`. Evidencia: `src/cli/index.js`, `README.md`.
3. **Descubrimiento** — `ancleto discovery --check` (estado) y `ancleto
   discovery [--compress]` (pack Repomix con ignores del tier); el seed lo
   redacta la skill `ancleto-technical-discovery`. Evidencia: `src/cli/index.js`,
   `src/core/repomix-tier.js`.
4. **Memoria entre sesiones** — el orquestador inyecta `<ProjectMemoryRules>` y
   `<ProjectTopology>`; las reglas se recuperan proactivamente y las decisiones
   vía `searchMemory`. `.ancleto/working-context.md` se regenera en `init`,
   `install --project`, `upgrade` y tras escrituras de memoria. Evidencia:
   `agents/orchestrator.md`, `src/core/memory/working-context.js`.
5. **Portabilidad de memoria** — `ancleto memory export` (JSON sanitizado, solo
   activos) e `import` (upsert por `memory_key`, idempotente); `memory gc` purga
   superseded antiguos. Evidencia: `src/core/memory/engine.js`, `src/cli/index.js`,
   `aspec/specs/memory-ops/spec.md`.
6. **Ciclo de change** — `explore → new/propose/ff → continue* → update? →
   apply → verify → archive` (router: `skills/ancleto-workflow/SKILL.md`). El
   nodo `update?` aparece cuando cambia una definición: `ancleto-update`
   clasifica el cambio (requisito, diseño, alcance, trabajo nuevo), pregunta el
   modo (in-place vs `rev2`) y aplica un merge no destructivo
   (`aspec/specs/artifact-update/spec.md`). Con perfil `test`, el orchestrator
   rutea lo test-only al tester ampliado (`cleto-test-*`). Evidencia:
   `commands/`, `skills/`, `aspec/changes/archive/`.
7. **Validación local** — `npm run lint` (ESLint) y `npm test` (`node --test`)
   son el gate mínimo; CI corre lint antes de tests. Evidencia: `package.json`,
   `.github/workflows/publish.yml`.

## Estado del repositorio

Versión `0.12.0` en `package.json` (el `CHANGELOG.md` cubre hasta `0.12.0`;
el change `add-commandcode-support` (2026-10-07, host `commandcode`) está
archivado sin entrada propia todavía en el changelog). Dogfooding histórico:
el framework fue inicializado sobre este repo; este checkout **sí materializa
`.ancletorc` y `.opencode/`** (ambos gitignored, no versionados) y persiste
`AGENTS.md`, `PRODUCT.md`, `aspec/` y `.ancleto/memory.db`. El tier resuelto es
**`normal`** vía `.opencode/.ancleto-tier`. `documentation/` ya no existe como
área raíz; `package-lock.json` ahora aparece como archivo material del repo (track
es filtrado por el tier). Evidencia: `.gitignore`, `.discovery-map.json`,
`ancleto discovery --check`.