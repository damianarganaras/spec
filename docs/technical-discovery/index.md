---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-10-15T17:14:12Z
pluginVersion: 0.13.1
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto` / alias `aspec`).
No es un inventario exhaustivo: enruta a la respuesta más corta. Evidencia: pack Repomix
(`--compress`, tier resuelto `minimo`, 642 archivos, ~12.4k tokens), `package.json`
(`0.13.1`), `CHANGELOG.md` (hasta `0.12.1`), `.discovery-map.json` (`total_files: 655`) y
lectura puntual de los archivos citados.

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tiers, tests, contrato de validaciones | `setup.md` |
| Reglas de negocio, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias privadas observables (npm, GitHub, Repomix, MCP) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills, commands) con propósito y entry point | `units/_map.md` |
| **Rutas por host (`AGENT_TARGETS`), adaptación de frontmatter (incl. Command Code), commands como skills, MCP de host, merge de templates y bloques LOCKED, portabilidad** | `units/cli-install.md` |
| Motor de memoria persistente (SQLite + FTS5, tools del LLM, working-context, procedencia `source`) y **export/import/gc** | `units/memory-engine.md` |
| Discovery, empaquetado Repomix, impacto del seed, **affected-set determinístico (grafo de imports, `ancleto affected`)** y tiers de tokens | `units/discovery-engine.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, migración legacy y MCP | `units/cli-install.md` |
| **Pipeline de throughput del ciclo SDD: paralelización `@documenter` ∥ `@memory-keeper`, Validation Ledger prearmado y memoria en un paso** | `decisions.md`, `units/cli-install.md` |
| Working-context día-cero (topología sin DB) e inyección de bloques | `units/memory-engine.md`, `overview.md` |
| Análisis de costo de tokens y decisión pendiente de "token-economy" | `optimizacion-de-tokens.md` (raíz) |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bin `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs con descubrimiento técnico, memoria persistente local
  y control de costo por tier. **8 hosts**: opencode (default), claude, vscode, antigravity,
  cursor, roo, copilot y **commandcode** (Command Code, novedad de `0.12.1`).
- **Versión observada**: `0.13.1` (`package.json`); el `CHANGELOG.md` cubre hasta `0.12.1`.
- **Tier resuelto**: `minimo` vía `.opencode/.ancleto-tier`; decide modelos de los agents y la
  agresividad del pack (`--compress`, ignora `test/**`, `docs/**`, `**/*.md`).
- **Linter**: ESLint 10 como **devDependency** (flat config `eslint.config.js`, 4 reglas);
  scripts `npm run lint` y `npm test`; no agrega dependencias de runtime.
- **Contrato de validaciones declarativo**: se corre **solo** lo declarado en `PRODUCT.md` →
  `## Project Commands`; format check `not-configured` si no hay formatter; tests por el comando
  declarado o rutas explícitas (nunca `node --test` pelado). Fuente de la política:
  `AGENTS.md` / `templates/AGENTS.md` → bloque `LOCKED: validation-commands`
  (change archivado `2026-10-14-contrato-validaciones`). Detalle: `setup.md`.
- **Módulo puro de frontmatter**: `src/core/adapters/frontmatter.js` es el **dueño único** de la
  transformación de frontmatter (`adaptFrontmatter`); `src/cli/index.js` lo importa.
- **Memoria**: 3 tools del LLM (`searchMemory`, `recordRule`, `recordDecision`) + operaciones
  `memory export|import|gc` sobre `.ancleto/memory.db`; `source` es procedencia runtime-owned.
- **Merge de templates**: `mergeTemplateInto` reconcilia bloques planos legados **antes** de
  `mergeLocked`; punto único de `install`/`update`/`upgrade` (vía `copyTemplates`) e `import`.
- **Instalación por host**: `AGENT_TARGETS` es la fuente única de rutas (skills/agents/commands)
  por IDE; el frontmatter de agents se adapta por host. Detalle: `units/cli-install.md`.
- **Affected-set determinístico** (`0.13.1`, change `throughput-pipeline`):
  `src/core/affected-set.js` computa la clausura transitiva de **dependientes** sobre el grafo de
  imports (zero-dep, determinista) y `ancleto affected [--cwd <dir>] [--json] <archivo...>` la
  expone **read-only**; es el objetivo de verificación del tester y el scope de review. Detalle:
  `units/discovery-engine.md`.
- **`AGENTS.md`**: **cuatro** bloques `LOCKED` de reglas compartidas (`validation-commands`,
  `memory-boundary`, `artifacts-language`, `seed-freshness`) + `test-block`.
- **Ciclo SDD**: 16 comandos `/cleto-*` (incluye `/cleto-update`, `0.12.0`) y 21 skills nativas
  (incluye `ancleto-update`); `aspec/` tiene 17 specs fuente, 1 change activo diferido y 23 archivados.
- **Este checkout**: `.ancletorc` y `.opencode/` **existen** (gitignored, no versionados).
  Persiste `.ancleto/memory.db`.
- **Rama de trabajo**: `development`; `main` protegida de forma honor-based (`BACKLOG.md` B3).
- **Changes**: 1 activo diferido (`ancleto-vscode-extension`) + 23 archivados (incluye
  `2026-10-14-token-budget`, `2026-10-14-contrato-validaciones` y `2026-10-15-throughput-pipeline`).
- **Doc de análisis raíz**: `optimizacion-de-tokens.md` (no es runtime; mide costo de tokens y
  deja una decisión abierta sobre la promesa "optimizador de tokens").

Antes de afirmar un detalle fino o reciente, abrir el archivo citado en cada documento.
