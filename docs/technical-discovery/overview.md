---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-10-15T17:14:12Z
pluginVersion: 0.13.1
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
`minimo`, `gratis`). El único uso de dependencias externas es de **desarrollo** (ESLint).
Evidencia: `README.md`, `package.json`, `src/core/repomix-tier.js`, `eslint.config.js`.

## Arquitectura (observado)

CLI monolítica en ESM, sin framework externo. Capas:

| Capa | Ruta | Rol |
|---|---|---|
| CLI / orquestación | `src/cli/index.js` | Parsing de comandos, `init`/`install`/`update`/`upgrade`, instalación por host, perfiles, export/import, discovery, memoria y sus ops, `specs check`, **`affected`**, projects, stats, doctor, MCP; merge de templates; directiva de compresión host-scoped y working-context día-cero. |
| UI de terminal | `src/cli/ui.js` | Banner ASCII animado y menús TTY (Raw Mode) sin librerías; helpers de color. |
| Adaptación de frontmatter | `src/core/adapters/frontmatter.js` | **Módulo puro, dueño único** de la transformación de frontmatter por host/assetKind (incluye Antigravity y Command Code). |
| Discovery | `src/core/discovery.js` | Mapa topológico `.discovery-map.json`. |
| Affected-set | `src/core/affected-set.js` | Grafo de imports zero-dep; clausura transitiva de **dependientes** (determinista) para el scope de review y la verificación. |
| Empaquetado y tiers | `src/core/repomix-tier.js` | Args de Repomix, ignores por tier, `--compress`, token budget. |
| Selección de modelos | `src/core/tier-models.js` | Modelos por tier, resolución de tier gratis (Muse Spark/probe/env). |
| Memoria persistente | `src/core/memory/*.js` | SQLite nativo + FTS5: `database`, `engine` (search/record/export/import/gc, `formatTopologyBlock`, procedencia `source`), `tools`, `mcp-server`, `doctor`, `working-context` (render compartido). |
| Assets instalables | `agents/`, `commands/`, `skills/`, `templates/`, `profiles/` | Markdown que el CLI copia al IDE del usuario (10 agents, 16 commands, skills nativas, 2 templates + perfil `test`). |
| Specs del propio repo | `aspec/` | `config.yaml` + `specs/` (17 capacidades) + 1 change activo diferido + `changes/archive/` (23). |
| Lint | `eslint.config.js` | Flat config mínima (4 reglas) sobre `src/` y `test/`. |
| Tests | `test/*.test.js` | Suite `node --test` (11 archivos; no re-ejecutada en esta regeneración). |
| Análisis (no runtime) | `optimizacion-de-tokens.md` | Barrido de costo de tokens del producto y matriz de decisión de la promesa "token-economy". |

Entry point único: `src/cli/index.js` (`bin.ancleto` y `bin.aspec`). No hay servidor ni base
de datos propia más allá de `.ancleto/memory.db`. Evidencia: `package.json`, pack Repomix
(firmas de `src/**`), `.discovery-map.json`.

## Componentes y responsabilidades

- **CLI (`src/cli/index.js`)**: registra el proyecto en `~/.config/ancleto/projects.json`,
  resuelve el agente/IDE y el tier, materializa assets en el destino nativo del host
  (`AGENT_TARGETS`) delegando la adaptación de frontmatter en
  `src/core/adapters/frontmatter.js`, aplica el overlay del perfil `test`, fusiona templates
  y bloques `<!-- LOCKED -->`, configura MCP (propio + caveman; engram opcional) y expone los
  subcomandos. La **directiva de uso de caveman es host-scoped**: se materializa solo si la
  config MCP del host contiene la tool de compresión (`hostSupportsCompression` /
  `hostConfigHasCompression`), nunca en texto compartido entre hosts. Evidencia:
  `src/cli/index.js`, `aspec/specs/prompt-contracts/spec.md`.
- **Adaptador de frontmatter**: `adaptFrontmatter(content, host, assetKind, name)` es una
  función pura sin E/S. `opencode` (y skills de cualquier host) es identidad; `claude`,
  `vscode` y `copilot` dropean claves no portables; `antigravity` y `commandcode` transforman
  a su convención; `cursor`/`roo` son passthrough con aviso a stderr; host desconocido es
  passthrough con aviso.
- **Discovery**: `--check` reporta estado del seed (`READY`/`STALE`/`PARTIAL`/`MISSING`) con
  `impact` (`none`/`minor`/`material`) y `affectedDocs`; el pack (Repomix) se genera on-demand.
- **Affected-set**: `computeAffectedSet({ rootDir, seeds })` devuelve `{ seeds, affected,
  unresolved, externalCount }`; `affected` es la clausura de dependientes (más las semillas)
  sobre el grafo de imports. Se invoca read-only vía `ancleto affected` y es el scope de review
  del ciclo SDD. Detalle: `units/discovery-engine.md`.
- **Memoria**: 3 tools (`searchMemory`, `recordRule`, `recordDecision`) sobre SQLite + FTS5 con
  supersesión atómica por `memory_key` y **procedencia `source` runtime-owned** (`mcp:ancleto-memory`,
  `cli:import`, `runtime`, `agent:<rol>`), expuesta como MCP stdio (`ancleto mcp`). Los
  subcomandos `memory export|import|gc` respaldan/restauran nodos activos y purgan superseded.
- **Working-context**: un único render (`renderWorkingContextBlock` en
  `src/core/memory/working-context.js`) sirve al refresh de lifecycle y a `memory context`;
  en **día-cero** materializa la topología (`<ProjectTopology>`) aunque no exista DB, sin abrir
  el motor. Evidencia: `src/core/memory/working-context.js`, `src/cli/index.js`.
- **Ciclo SDD**: comandos `/cleto-*` que consumen `aspec/changes/<name>/` y las skills nativas;
  no requieren binario externo. Incluye `/cleto-review` (calidad), `/cleto-security`,
  `/cleto-update` (actualiza artifacts de un change existente) y `/cleto-transplant`.

## Flujos principales

1. **Alta de proyecto** — `ancleto init` (wizard en TTY): escribe `.ancletorc`, scaffold
   `aspec/` (+ `testspec/` con `--profile test`), copia `AGENTS.md`/`PRODUCT.md` preservando lo
   existente (reconciliando bloques planos legados), importa `openspec/` si existe, instala
   assets por host (+ overlay del perfil), aplica el tier a los agentes locales, configura el
   MCP del host (resuelto **antes** de escribir los agents para materializar la directiva
   host-scoped) y materializa `.ancleto/working-context.md`. Evidencia: `src/cli/index.js`,
   `README.md`.
2. **Instalación/actualización** — `ancleto install|update|upgrade`: materializa `agents/`,
   `commands/`, `skills/`, `templates/` en el destino del host, adapta frontmatter, fusiona MCP
   de forma no destructiva, importa `openspec/` y re-aplica bloques `LOCKED` (con
   reconciliación previa de superficies mergeadas). Evidencia: `src/cli/index.js`, `README.md`.
3. **Descubrimiento** — `ancleto discovery --check` (estado) y `ancleto discovery
   [--compress]` (pack Repomix con ignores del tier); el seed lo redacta la skill
   `ancleto-technical-discovery`. Evidencia: `src/cli/index.js`, `src/core/repomix-tier.js`.
4. **Memoria entre sesiones** — el orquestador inyecta `<ProjectMemoryRules>` y
   `<ProjectTopology>` **desde el día cero**; las reglas se recuperan proactivamente y las
   decisiones vía `searchMemory`. `.ancleto/working-context.md` se regenera en `init`,
   `install --project`, `upgrade`, `memory context --out` y tras escrituras de memoria.
   Evidencia: `agents/orchestrator.md`, `src/core/memory/working-context.js`.
5. **Portabilidad de memoria** — `ancleto memory export` (JSON sanitizado, solo activos) e
   `import` (upsert por `memory_key`, idempotente); `memory gc` purga superseded antiguos.
   Evidencia: `src/core/memory/engine.js`, `src/cli/index.js`, `aspec/specs/memory-ops/spec.md`.
6. **Ciclo de change** — `/cleto-new` → `/cleto-propose` → `/cleto-apply` → `/cleto-verify`
   → `/cleto-archive`, con `/cleto-review`/`/cleto-security` para calidad y seguridad,
   `/cleto-update` para actualizar artifacts ante cambios de definición y `/cleto-transplant`
   para mudar proyectos entre máquinas. Con perfil `test`, el orchestrator rutea lo test-only
   al tester ampliado (`cleto-test-*`). Evidencia: `commands/`, `skills/`,
   `aspec/changes/archive/`.
7. **Cierre del change (pipeline de throughput)** — el tester computa el `affected-set` con
   `ancleto affected` (dependientes, no solo archivos tocados) y produce un Validation Ledger
   completo y cerrado; el orquestador arma/verifica el cierre y delega el review con el
   `affected-set` como scope. Tras la aprobación de archive y con candidato real de memoria,
   delega `@documenter` ∥ `@memory-keeper`; el cierre hace **como máximo una** llamada a
   memoria. Evidencia: `agents/orchestrator.md`, `agents/tester.md`, `agents/reviewer.md`,
   `aspec/specs/prompt-contracts/spec.md`, `aspec/specs/review/spec.md`,
   `aspec/changes/archive/2026-10-15-throughput-pipeline/`.
8. **Validación local** — contrato **declarativo**: se corre solo lo declarado en `PRODUCT.md` →
   `## Project Commands` (aquí `npm run lint` y `npm test`). Evidencia: `AGENTS.md`
   (`LOCKED: validation-commands`), `PRODUCT.md`, `package.json`.

## Estado del repositorio

Versión `0.13.1` en rama `development` (`CHANGELOG.md` cubre hasta `0.12.1`). Dogfooding
histórico: el framework fue inicializado sobre este repo; este checkout **sí materializa
`.ancletorc` y `.opencode/`** (ambos gitignored, no versionados) y persiste `AGENTS.md`,
`PRODUCT.md`, `aspec/` y `.ancleto/memory.db`. El tier resuelto es `minimo` vía
`.opencode/.ancleto-tier`. Evidencia: `.gitignore`, `.discovery-map.json`,
`ancleto discovery --check`.
