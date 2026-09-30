---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-09-30T14:03:46Z
pluginVersion: 0.7.1
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto` / alias `aspec`).
No es un inventario exhaustivo: enruta a la respuesta más corta. Evidencia tomada del pack
Repomix `tier: minimo` (comprimido) más los documentos raíz del repo y lectura puntual de
`src/cli/index.js`.

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tests, convenciones operativas | `setup.md` |
| Reglas de negocio, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias privadas observables (npm, GitHub, Repomix, MCP) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills) con propósito y entry point | `units/_map.md` |
| **Rutas de instalación por agente, `AGENT_SKILLS_DIR`, manifiesto y frontmatter de skills** | `units/cli-install.md` |
| Motor de memoria persistente (SQLite + FTS5, tools del LLM, working-context) | `units/memory-engine.md` |
| Discovery, empaquetado Repomix y tiers de tokens | `units/discovery-engine.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, migración legacy y MCP | `units/cli-install.md` |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bin `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs (OpenCode, Cursor, VS Code, Roo, Antigravity) con
  descubrimiento técnico, memoria persistente local y control de tokens por tier.
- **Versión observada**: `0.7.1` (`package.json`). El CLI global puede ir por detrás: al
  relevar, `ancleto --version` reportó `0.7.0`.
- **Skills por agente**: `installAgentSkills` copia el catálogo al directorio propio de cada
  IDE vía `AGENT_SKILLS_DIR` (`.opencode/skills`, `.vscode/skills`, ...). El frontmatter se
  copia **tal cual** (la adaptación por IDE está planeada, `A1`). Detalle: `units/cli-install.md`.
- **Rama de trabajo**: `development`; `main` protegida y estable (`BACKLOG.md`).

Antes de afirmar un detalle fino o reciente, abrir el archivo citado en cada documento.
