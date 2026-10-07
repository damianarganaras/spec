---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-10-07T23:35:00Z
pluginVersion: 0.12.0
skillVersion: '2.3'
---

# Seed técnico — `@ancleto/spec`

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto` / alias `aspec`). No
es un inventario exhaustivo: enruta a la respuesta más corta. Evidencia: pack Repomix
(`--compress`, tier resuelto `normal`, 289 archivos, ~288k tokens), `CHANGELOG.md`
(hasta `0.12.0`), `package.json` (`0.12.0`), `BACKLOG.md` y lectura puntual de los
archivos citados.

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tests, convenciones operativas | `setup.md` |
| Reglas de negocio, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias privadas observables (npm, GitHub, Repomix, MCP) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills) con propósito y entry point | `units/_map.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, migración legacy, MCP, perfiles, portabilidad | `units/cli-install.md` |
| Motor de memoria (SQLite + FTS5, tools del LLM, working-context) y ops export/import/gc | `units/memory-engine.md` |
| Discovery, empaquetado Repomix, tiers de tokens, hash de impacto | `units/discovery-engine.md` |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Versionado**: `package.json` declara `0.12.0`; el `CHANGELOG.md` llega hasta `0.12.0`
  (los entries `0.10.0` y `0.11.0` cubren `memory export|import|gc`, el adaptador de
  frontmatter como módulo puro, el gate de lint, el prompt de Muse Spark en `init`,
  y los 4 changes archivados en `2026-10-02-*`; `0.12.0` cubre la skill
  `ancleto-update`). El change `add-commandcode-support` (soporte del host
  `commandcode`) se archivó el `2026-10-07` sin entry propio todavía en el changelog.
- **Entry point**: `src/cli/index.js` (bin `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs (opencode, claude, vscode, antigravity,
  cursor, roo, copilot, commandcode) con descubrimiento técnico, memoria persistente
  local y control de tokens por tier.
- **Linter**: ESLint 10 como **devDependency** (flat config `eslint.config.js`,
  4 reglas), scripts `npm run lint` y `npm test`; no agrega dependencias de runtime.
- **Adaptador de frontmatter**: `src/core/adapters/frontmatter.js` es el **dueño
  único** de la transformación de frontmatter (`adaptFrontmatter`); `src/cli/index.js`
  lo importa y no define adaptadores locales. Mapas de tools: `ANTIGRAVITY_TOOL_MAP`,
  `COMMANDCODE_TOOL_MAP` y `COMMANDCODE_MCP_TOOL_MAP`.
- **Memoria**: 3 tools del LLM (`searchMemory`, `recordRule`, `recordDecision`) +
  operaciones `memory export|import|gc` sobre `.ancleto/memory.db`.
- **Instalación por host**: `AGENT_TARGETS` es la fuente única de rutas
  (skills/agents/commands) por IDE; el frontmatter de agents se adapta por host.
  Detalle: `units/cli-install.md`.
- **Este checkout**: `.ancletorc` y `.opencode/` **existen** (gitignored, no
  versionados); el tier resuelto es **`normal`** vía `.opencode/.ancleto-tier`.
  Persiste `.ancleto/memory.db`. `documentation/` ya no existe como área raíz
  (materialReasons lo registra como "área raíz eliminada").
- **Rama de trabajo**: `development`; `main` protegida y estable (`BACKLOG.md`).
- **Skill nueva**: `ancleto-update` (comando `/cleto-update`) para revisión de
  artifacts de un change con merge no destructivo cuando cambia una definición.
  Routada por `skills/ancleto-workflow/SKILL.md`. Spec:
  `aspec/specs/artifact-update/spec.md`. Doc: `docs/skill-ancleto-update.md`.

Antes de afirmar un detalle fino o reciente, abrir el archivo citado en cada documento.