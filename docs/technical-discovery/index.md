---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-10-02T20:32:00Z
pluginVersion: 0.11.0
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto` / alias `aspec`).
No es un inventario exhaustivo: enruta a la respuesta más corta. Evidencia: pack Repomix
(`--compress`, tier resuelto `gratis`, 604 archivos, ~9.3k tokens), `CHANGELOG.md`
(hasta `0.11.0`), `.discovery-map.json` (`total_files: 617`) y lectura puntual de los
archivos citados.

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tests, convenciones operativas | `setup.md` |
| Reglas de negocio, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias privadas observables (npm, GitHub, Repomix, MCP) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills) con propósito y entry point | `units/_map.md` |
| **Rutas de instalación por host (`AGENT_TARGETS`), adaptación de frontmatter, commands como skills, MCP, portabilidad** | `units/cli-install.md` |
| Motor de memoria persistente (SQLite + FTS5, tools del LLM, working-context) y **export/import/gc** | `units/memory-engine.md` |
| Discovery, empaquetado Repomix y tiers de tokens | `units/discovery-engine.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, migración legacy y MCP | `units/cli-install.md` |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bin `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs (OpenCode, Claude, VS Code, Antigravity, Cursor, Roo,
  Copilot) con descubrimiento técnico, memoria persistente local y control de tokens por tier.
- **Versión observada**: `0.11.0` (`package.json`); el `CHANGELOG.md` cubre hasta `0.11.0`
  (entradas `0.10.0` y `0.11.0`: `memory export|import|gc`, adaptador de frontmatter, gate de
  lint, prompt interactivo de Muse Spark, 4 changes archivados).
- **Linter**: ESLint 10 como **devDependency** (flat config `eslint.config.js`, 4 reglas),
  scripts `npm run lint` y `npm test`; no agrega dependencias de runtime.
- **Módulo puro de frontmatter**: `src/core/adapters/frontmatter.js` es el **dueño único** de la
  transformación de frontmatter (`adaptFrontmatter`); `src/cli/index.js` lo importa.
- **Memoria**: 3 tools del LLM (`searchMemory`, `recordRule`, `recordDecision`) + operaciones
  `memory export|import|gc` sobre `.ancleto/memory.db`.
- **Instalación por host**: `AGENT_TARGETS` es la fuente única de rutas (skills/agents/commands)
  por IDE; el frontmatter de agents se adapta por host. Detalle: `units/cli-install.md`.
- **Este checkout**: `.ancletorc` y `.opencode/` **existen** (gitignored, no versionados); el
  tier resuelto es `gratis` vía `.opencode/.ancleto-tier`. Persiste `.ancleto/memory.db`.
- **Rama de trabajo**: `development`; `main` protegida y estable (`BACKLOG.md`).

Antes de afirmar un detalle fino o reciente, abrir el archivo citado en cada documento.
