---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-11-20T01:36:10.038Z
pluginVersion: 0.40.1
skillVersion: '2.3'
---

# Overview

## Propósito

`@ancleto/spec` es una CLI de desarrollo asistido por IA bajo **Spec-Driven Development**. Vive
dentro del IDE del usuario y cumple tres funciones (`PRODUCT.md`):

1. **Especificar**: ciclo de changes `/cleto-*` con artifacts en `aspec/`.
2. **Descubrir**: mapa topológico del repositorio + empaquetado de contexto (Repomix) + seed
   técnico navegable.
3. **Recordar**: memoria persistente de reglas y decisiones en `.ancleto/memory.db` (SQLite +
   FTS5), con tools MCP.

Restricciones de diseño: **cero dependencias de runtime**, **Node ≥ 24** y control explícito de
costo por tiers (`normal`, `minimo`, `gratis`).

## Arquitectura en una vista

```text
usuario / agente
      │
      ▼
src/cli/index.js  ── dispatch de subcomandos y toda la instalación
      │
      ├── src/cli/ui.js             banner y menús TTY
      ├── src/core/adapters/        frontmatter por host
      ├── src/core/discovery*       topología, globs, estado del seed
      ├── src/core/repomix-tier.js  presupuesto de tokens por tier
      ├── src/core/affected-set.js  grafo de imports y dependientes
      ├── src/core/test-selection.js plan de tests fail-closed
      ├── src/core/specs-merge.js   merge de delta specs
      ├── src/core/machine-env.js   machine-env.md (shell/EOL/tools)
      ├── src/core/model-*.js       catálogo, declaraciones y tiers
      ├── src/core/judge.js         adaptador advisory a jev-spec
      └── src/core/memory/**        motor SQLite/FTS5, tools MCP y operaciones
```

El paquete publica además una **superficie instalable** (`package.json` → `files`): `agents/`
(10 subagentes), `commands/` (16 comandos `/cleto-*`), `skills/` (35 skills), `templates/`
(`AGENTS.md`, `PRODUCT.md`), `profiles/` (overlay de test) y `src/`.

## Componentes

| Componente | Rol | Entry point |
| --- | --- | --- |
| CLI y ciclo de vida | `init`, `install`, `update`, `upgrade`, `import`, `export`, `check`, `doctor`, `projects` | `src/cli/index.js` |
| Instalador multi-host | Materializa assets, adapta frontmatter, escribe MCP y aplica tiers | `src/cli/index.js`, `src/core/adapters/frontmatter.js` |
| Discovery | Mapa topológico, estado, impacto y pack Repomix | `src/core/discovery.js`, `src/core/discovery-state.js`, `src/core/repomix-tier.js` |
| Memoria | Motor SQLite/FTS5, supersesión, refs, MCP y operaciones | `src/core/memory/**` |
| Modelos | Catálogo commiteado, declaraciones versionadas y resolución por tier | `src/core/model-catalog.js`, `src/core/model-declarations.js`, `src/core/tier-models.js` |
| Specs | Validación de specs canónicas y merge de deltas | `src/core/specs-merge.js` |
| Cambios | Artefactos SDD activos, archivados y backlog de release | `aspec/changes/**`, `aspec/specs/**`, `aspec/backlog.md` |
| Juez advisory | Envoltorio read-only de `jev-spec` | `src/core/judge.js` |

## Flujos principales

### 1. Instalar o actualizar el framework

`ancleto install` / `init` / `upgrade` resuelven el host activo, copian los assets a su layout
nativo, adaptan el frontmatter, mergean los bloques `LOCKED` de los templates, configuran el MCP
del host, aplican el tier de modelos y escriben el manifiesto `.ancletorc`. `upgrade` no aplica
tier: materializa la fuente canónica. Evidencia: `src/cli/index.js`, `src/core/adapters/frontmatter.js`.

### 2. Descubrir el repositorio

`ancleto discovery --check` calcula el estado del seed comparando hashes por área; `discovery
--compress` produce **un** pack Repomix del repositorio y persiste el estado. La skill
`ancleto-technical-discovery` escribe el seed en `docs/technical-discovery/` y `seed-map.json`.
Evidencia: `src/cli/index.js`, `src/core/discovery.js`, `src/core/discovery-state.js`.

### 3. Recordar reglas y decisiones

Las tools MCP (`searchMemory`, `recordRule`, `recordDecision`) leen y escriben
`.ancleto/memory.db`. Cada `memory_key` tiene un nodo activo y un historial `superseded`; las
escrituras pasan por validación de refs y rechazo de secretos. Evidencia:
`src/core/memory/engine.js`, `src/core/memory/tools.js`, `src/core/memory/mcp-server.js`.

### 4. Ciclo de cambio SDD

`/cleto-*` crea y completa artifacts en `aspec/changes/<name>/`; `specs merge` aplica deltas
`ADDED/MODIFIED/REMOVED/RENAMED` sobre las specs canónicas; el archive promueve decisiones a la
memoria. Evidencia: `src/core/specs-merge.js`, `skills/ancleto-archive/SKILL.md`.

### 5. Elegir modelos por costo

El tier configurado se resuelve contra `src/core/model-catalog.json`; `minimo` usa cadenas de
preferencia por agente y falla explícitamente si ningún candidato está disponible. Evidencia:
`src/core/tier-models.js`, `src/core/model-catalog.js`.

### 6. Publicar una release

Un tag `v*` dispara `.github/workflows/publish.yml`: `npm ci` → lint → tests → `npm publish`
(omite si la versión ya existe) → Release de GitHub → canary no bloqueante del tarball. Evidencia:
`.github/workflows/publish.yml`, `aspec/backlog.md`.

## Estado de release

`0.40.1` está **publicada y verificada**: tag anotado `v0.40.1`, workflow `publish.yml` exitoso y
`@ancleto/spec@0.40.1` como `latest` en npm con `gitHead` coincidente (`aspec/backlog.md`,
`CHANGELOG.md`).

## Límites y decisiones de frontera

- **No es una web app ni una API**: es una herramienta de línea de comandos (`PRODUCT.md`).
- El CLI es dueño del ciclo de vida; los módulos `src/core/**` son dueños de sus invariantes.
- La memoria es **cwd-scoped**: `<cwd>/.ancleto/memory.db`.
- El seed técnico es un mapa, no un inventario: ver `inventory.md` y `unknowns.md`.

## Riesgos de cambio de alto nivel

- `src/cli/index.js` concentra instalación, MCP, tiers, discovery y superficies de memoria: es el
  punto de mayor acoplamiento.
- `agents/`, `commands/`, `skills/` y `templates/` son producto instalable: un cambio altera a
  todos los proyectos usuarios.
- El contrato de persistencia de `src/core/memory/**` es sensible a migraciones y concurrencia.
- Detalle: `decisions.md`; recorridos: `units/cli-install.md`, `units/discovery-engine.md`,
  `units/memory-engine.md`.
