---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-04T11:11:07Z
pluginVersion: 0.18.11
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto`, alias `aspec`). No es un
inventario: enruta a la respuesta más corta. Evidencia base: pack Repomix comprimido del tier
`minimo` (765 archivos, ~35.077 tokens), `package.json` (`0.18.11`), `CHANGELOG.md` (hasta
`0.18.11`), `.discovery-map.json` (`total_files: 776`), el reporte `ancleto discovery --check`
y lectura puntual de los archivos citados. El pack excluye `test/**`, `docs/**` y `**/*.md`;
esas áreas se verificaron por lectura directa.

> Nota de provenance: el CLI global que generó el pack y el estado es `ancleto 0.18.8`,
> mientras el repo está en `0.18.11`. El snapshot y el cambio de descubrimiento sí se leyeron
> del árbol en `0.18.11`; ver `unknowns.md`.

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tiers, tests, validaciones | `setup.md` |
| Reglas, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias observables (npm, GitHub, Repomix, git, MCP, opencode) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills, commands) con propósito y entry point | `units/_map.md` |
| **Modelos por tier**: `TIERS`, `TIER_CHAINS`, resolver contra catálogo, `gratis` free-only, oráculo de `check` | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Catálogo de modelos**: snapshot de 5 proveedores / 211 IDs, helpers puros y refresco manual con `--refresh` | `decisions.md`, `units/discovery-engine.md` |
| **Descubrimiento dev-only**: clasificaciones `available`/`binary-missing`/`network-unavailable`/`partial`, diff y escritura atómica | `units/discovery-engine.md`, `integrations.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, rutas por host, adaptadores, MCP, portabilidad, `check` | `units/cli-install.md` |
| Discovery: mapa topológico, pack Repomix, estado del seed, `affectedDocs`, affected-set | `units/discovery-engine.md` |
| Memoria persistente: SQLite+FTS5, tools MCP, recall, refs, working-context, ops, doctor, curate | `units/memory-engine.md` |
| Errores o fallos de tool parts de sesiones opencode (`stats failures`) | `units/cli-install.md`, `integrations.md` |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bins `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs con descubrimiento técnico, memoria persistente local
  (`.ancleto/memory.db`, `node:sqlite`) y control explícito de costo por tier.
- **Versión del repo**: `package.json` = `0.18.11`; `.ancleto/machine-env.md` (artefacto derivado)
  registra `ancleto: 0.18.8`, que se regenera en `init`/`install`/`upgrade`.
- **Change reciente archivado**: `aspec/changes/archive/2026-11-04-ch-12-agentic-model-discovery/`
  (descubrimiento completo del catálogo, helpers puros, aviso de deriva en `check`).
- **Catálogo**: `src/core/model-catalog.json` con `generated_at: 2026-11-04` y 211 IDs en 5
  proveedores (`opencode` 10, `opencode-go` 30, `anthropic` 20, `commandcode` 71, `openai` 80).
