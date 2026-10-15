---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-10-14T22:01:41Z
pluginVersion: 0.11.1
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto` / alias `aspec`).
No es un inventario exhaustivo: enruta a la respuesta más corta. Evidencia: pack Repomix
(`--compress`, tier resuelto `minimo`, 614 archivos, ~10.0k tokens), `package.json`
(`0.11.1`), `CHANGELOG.md` (hasta `0.11.0`), `.discovery-map.json` (`total_files: 627`) y
lectura puntual de los archivos citados.

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tiers, tests, convenciones operativas | `setup.md` |
| Reglas de negocio, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias privadas observables (npm, GitHub, Repomix, MCP) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills) con propósito y entry point | `units/_map.md` |
| **Rutas de instalación por host (`AGENT_TARGETS`), adaptación de frontmatter, commands como skills, MCP, directiva de compresión host-scoped, portabilidad** | `units/cli-install.md` |
| Motor de memoria persistente (SQLite + FTS5, tools del LLM, working-context, procedencia `source`) y **export/import/gc** | `units/memory-engine.md` |
| Discovery, empaquetado Repomix y tiers de tokens | `units/discovery-engine.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, migración legacy y MCP | `units/cli-install.md` |
| Working-context día-cero (topología sin DB) e inyección de bloques | `units/memory-engine.md`, `overview.md` |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bin `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs (OpenCode, Claude, VS Code, Antigravity, Cursor, Roo,
  Copilot) con descubrimiento técnico, memoria persistente local y control de tokens por tier.
- **Versión observada**: `0.11.1` (`package.json`); el `CHANGELOG.md` cubre hasta `0.11.0`
  (la `0.11.1` **todavía no tiene entrada**: es el version bump del change activo `token-budget`).
- **Tier resuelto**: `minimo` vía `.opencode/.ancleto-tier` (antes `gratis`); decide modelos de los
  agents y la agresividad del pack (`--compress`, ignora tests/docs/markdown).
- **Linter**: ESLint 10 como **devDependency** (flat config `eslint.config.js`), scripts
  `npm run lint` y `npm test`; no agrega dependencias de runtime.
- **Módulo puro de frontmatter**: `src/core/adapters/frontmatter.js` es el **dueño único** de la
  transformación de frontmatter (`adaptFrontmatter`); `src/cli/index.js` lo importa.
- **Memoria**: 3 tools del LLM (`searchMemory`, `recordRule`, `recordDecision`) + operaciones
  `memory export|import|gc` sobre `.ancleto/memory.db`; `source` es procedencia runtime-owned
  (change archivado `memory-actor-provenance`).
- **Working-context día-cero**: se materializa la topología aunque no exista `.ancleto/memory.db`
  (change activo `token-budget`, capa CLI).
- **Instalación por host**: `AGENT_TARGETS` es la fuente única de rutas (skills/agents/commands)
  por IDE; el frontmatter de agents se adapta por host. Detalle: `units/cli-install.md`.
- **`AGENTS.md`**: tres bloques `LOCKED` de reglas compartidas (`memory-boundary`,
  `artifacts-language`, `seed-freshness`) + `test-block`; las skills/agentes las referencian
  (fuente única del change `token-budget`).
- **Este checkout**: `.ancletorc` y `.opencode/` **existen** (gitignored, no versionados).
  Persiste `.ancleto/memory.db`.
- **Rama de trabajo**: `development`; `main` protegida y estable (`BACKLOG.md`).
- **Changes**: 1 activo diferido (`ancleto-vscode-extension`) + `token-budget` en curso +
  18 archivados (incluye `2026-10-05-memory-actor-provenance`).

Antes de afirmar un detalle fino o reciente, abrir el archivo citado en cada documento.
