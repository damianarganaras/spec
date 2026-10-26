---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-10-26T19:42:38Z
pluginVersion: 0.15.2
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto` / alias `aspec`).
No es un inventario exhaustivo: enruta a la respuesta más corta. Evidencia base: pack Repomix
(`--compress`, tier resuelto `gratis`, 676 archivos, ~15.149 tokens), `package.json`
(`0.15.2`), tag `v0.15.1` (HEAD `0fe4482`, 11 commits por delante del tag; aún no existe tag
`v0.15.2`), `.discovery-map.json` (`total_files: 688`) y lectura puntual de los archivos citados en
cada documento.

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tiers, tests, contrato de validaciones | `setup.md` |
| Reglas de negocio, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias privadas observables (npm, GitHub, Repomix, MCP, git) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills, commands) con propósito y entry point | `units/_map.md` |
| **Entorno de máquina**: `.ancleto/machine-env.md`, shell/EOL/tooling, **sonda de invocabilidad** (disponibilidad = resoluble e invocable), exclusión local sin tocar `.gitignore`, entrega a subagentes | `setup.md`, `decisions.md`, `units/cli-install.md` |
| **Rutas por host (`AGENT_TARGETS`), adaptación de frontmatter (incl. Command Code), commands como skills, MCP de host, merge de templates y bloques LOCKED, portabilidad** | `units/cli-install.md` |
| Motor de memoria persistente (SQLite + FTS5, tools del LLM, working-context, procedencia `source`), **export/import/gc**, **refresh on-write CLI y staleness advisory**, **aviso de overflow y su Recall delegado** | `units/memory-engine.md` |
| Discovery, empaquetado Repomix, impacto del seed, **affected-set determinístico (grafo de imports, `ancleto affected`)** y tiers de tokens | `units/discovery-engine.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, migración legacy, MCP, `stats failures` | `units/cli-install.md` |
| **Reporte de fallos de herramientas** (`ancleto stats failures`: clases `env`/`check`/`tool`/`unknown`, privacidad) | `integrations.md`, `decisions.md`, `units/cli-install.md` |
| Pipeline de throughput del ciclo SDD (paralelización `@documenter` ∥ `@memory-keeper`, Validation Ledger, memoria en un paso) | `decisions.md`, `units/cli-install.md` |
| Working-context día-cero, refresh on-write (MCP/CLI) y staleness advisory | `units/memory-engine.md`, `overview.md` |
| **Arranque de sesión del orquestador**: intake de sesión (changes activos + `git status --short` delegado), techo de lecturas (3 archivos + exenciones), allowlist de `bash` de `@technical-discovery` | `decisions.md`, `overview.md`, `units/_map.md` |
| **`<ContextOverflowWarning>`**: qué emite, quién lo consume y qué guide residual queda abierto (`BACKLOG.md` ítem 17) | `units/memory-engine.md`, `decisions.md` |
| Análisis de costo de tokens y decisión pendiente de "token-economy" | `optimizacion-de-tokens.md` (raíz) |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bin `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs con descubrimiento técnico, memoria persistente local,
  entorno de máquina derivado y control de costo por tier. **8 hosts**: opencode (default),
  claude, vscode, antigravity, cursor, roo, copilot y commandcode.
- **Versión observada**: `0.15.2` (`package.json`), último tag `v0.15.1` (HEAD `0fe4482`, 11
  commits por delante; todavía no hay tag `v0.15.2`). `CHANGELOG.md` ya cubre `0.13.0`–`0.15.2`.
- **Tier resuelto**: `gratis` vía `.opencode/.ancleto-tier`; decide modelos de los agents y el
  pack (`--compress`, ignora `test/**`, `docs/**`, `**/*.md`, budget 50k).
- **Linter**: ESLint 10 como **devDependency** (flat config `eslint.config.js`, 4 reglas);
  scripts `npm run lint` y `npm test`; no agrega dependencias de runtime.
- **Contrato de validaciones declarativo**: se corre **solo** lo declarado en `PRODUCT.md` →
  `## Project Commands`; format check `not-configured`; tests por el comando declarado o rutas
  explícitas (nunca `node --test` pelado). Fuente: `AGENTS.md` / `templates/AGENTS.md` →
  bloque `LOCKED: validation-commands`. Detalle: `setup.md`.
- **Módulo puro de frontmatter**: `src/core/adapters/frontmatter.js` es el **dueño único** de la
  transformación de frontmatter (`adaptFrontmatter`); `src/cli/index.js` lo importa.
- **Memoria**: 3 tools del LLM (`searchMemory`, `recordRule`, `recordDecision`) + operaciones
  `memory export|import|gc|context|list|doctor` sobre `.ancleto/memory.db`; `source` es
  procedencia runtime-owned. El refresh on-write cubre **MCP y CLI**; `memory doctor` expone un
  chequeo de staleness advisory. El `<ContextOverflowWarning>` **delega un Recall a
  `@memory-keeper`** y **no nombra `searchMemory`**. Detalle: `units/memory-engine.md`.
- **Entorno de máquina**: `src/core/machine-env.js` es el **dueño único** de detectar, renderizar,
  escribir y excluir `.ancleto/machine-env.md` (plataforma, shell, EOL, tools). La disponibilidad
  de una herramienta exige ser **resoluble e invocable** (sonda `--version` acotada: 2 s por
  intento, 10 s acumulados), no solo estar en `PATH`. Se regenera en `init`, `install --project`
  y `upgrade`; la exclusión usa `info/exclude` y **nunca** toca `.gitignore`. Los 10 agents leen
  el artefacto antes de ejecutar comandos y el orquestador lo incluye en cada delegación con
  `bash: true`. Detalle: `units/cli-install.md`.
- **Merge de templates**: `mergeTemplateInto` reconcilia bloques planos legados **antes** de
  `mergeLocked`; punto único de `install`/`update`/`upgrade` (vía `copyTemplates`) e `import`.
- **Instalación por host**: `AGENT_TARGETS` es la fuente única de rutas (skills/agents/commands)
  por IDE; el frontmatter de agents se adapta por host. Detalle: `units/cli-install.md`.
- **Contratos de prompt del orquestador** (`agents/orchestrator.md`): **intake de sesión**
  (changes activos excluyendo `archive/`; un único `git status --short` delegado a
  `@technical-discovery` sólo cuando el pedido toca el estado del repo; silencio si no hay nada
  que reportar), **techo de lecturas** (3 archivos no dirigidos; exentos el working-context y el
  machine-env, más hasta 5 archivos nombrados explícitamente por el usuario **por mensaje**; el
  sexto se delega) y **Recall único** ante `<ContextOverflowWarning>`. Detalle: `decisions.md`.
- **Affected-set determinístico** (`throughput-pipeline`, archivado 2026-10-15):
  `src/core/affected-set.js` computa la clausura transitiva de **dependientes** sobre el grafo de
  imports (zero-dep, determinista) y `ancleto affected [--cwd <dir>] [--json] <archivo...>` la
  expone **read-only**. Detalle: `units/discovery-engine.md`.
- **Reporte de fallos**: `ancleto stats failures` lee en solo lectura los tool parts de opencode,
  clasifica `env`/`check`/`tool`/`unknown`, agrupa por proyecto/herramienta/clase/esqueleto y
  enmascara secretos y rutas. Spec `aspec/specs/session-failure-report/spec.md`.
- **`AGENTS.md`**: **cuatro** bloques `LOCKED` de reglas compartidas (`validation-commands`,
  `memory-boundary`, `artifacts-language`, `seed-freshness`) + `test-block`.
- **Ciclo SDD**: 16 comandos `/cleto-*` y 21 skills nativas; `aspec/` tiene **19 specs fuente**,
  **1 change activo** (`ancleto-vscode-extension`) y **27 archivados**.
- **Este checkout**: `.ancletorc` y `.opencode/` existen (gitignored, no versionados).
  Persiste `.ancleto/memory.db` y **`.ancleto/machine-env.md`** (generado el 2026-10-26).
- **Rama de trabajo**: `development`; `main` protegida de forma honor-based (`BACKLOG.md` B3).
- **Doc de análisis raíz**: `optimizacion-de-tokens.md` (no es runtime; mide costo de tokens y
  deja una decisión abierta sobre la promesa "optimizador de tokens").
- **No material para el seed**: `audit logs/` (9 archivos untracked) y `documentation/` (legado
  gitignored) aparecen en el estado del discovery por cómo se recorren las fuentes, pero **no**
  aportan evidencia al mapa y no se tratan como áreas materiales. Ver `unknowns.md`.

Antes de afirmar un detalle fino o reciente, abrir el archivo citado en cada documento.
