---
node: inventory
kind: inventory
read_when: "cobertura del repositorio por directorios y globs, y qué queda fuera"
generatedAt: 2026-10-07T23:35:00Z
pluginVersion: 0.12.0
skillVersion: '2.3'
---

# Inventario (orientación)

Cobertura por directorio/glob, no auditoría archivo por archivo. Conteos
verificados por listado de la raíz en este checkout; cifras de detalle de
los assets instaladas en `units/_map.md`.

| Área | Contenido | Conteo |
|---|---|---|
| `src/cli/**` | `index.js` (entry point y todos los subcomandos), `ui.js` (wizard/menús). | 2 |
| `src/core/**` | `discovery.js`, `repomix-tier.js`, `tier-models.js`, `adapters/frontmatter.js`, `memory/{database,engine,tools,mcp-server,doctor,working-context}.js`. | 12 |
| `agents/*.md` | 10 subagentes instalables. | 10 |
| `commands/*.md` | 16 comandos (`/cleto-*` del ciclo + review/security + recall/pr + transplant + `cleto-update`). | 16 |
| `skills/*/SKILL.md` (+ references) | 21 skills nativas (incluye `ancleto-review`, `ancleto-technical-discovery` y **`ancleto-update`**). | 35+ |
| `templates/` | `AGENTS.md`, `PRODUCT.md`. | 2 |
| `profiles/test/` | Overlay del perfil test: tester/reviewer ampliados, 5 comandos `cleto-test-*`, `AGENTS.md` con bloque LOCKED. | 8 |
| `aspec/` | `config.yaml` + `specs/` (**16** capacidades, incluidas `artifact-update` y `commandcode-support`) + 1 change activo (`ancleto-vscode-extension`, diferido) + `changes/archive/` (incluye `2026-10-07-add-commandcode-support`, `2026-10-06-ancleto-update`, `2026-10-05-memory-actor-provenance` y los 4 del 2026-10-02). | 90+ |
| `test/**` | `adapters-frontmatter`, `cli`, `content-guards`, `discovery-tier`, `discovery-topology`, `linter-config`, `mcp`, `memory-engine`, `tier-models`, `working-context` (`.test.js`); **413 tests / 86 suites medidos en verde**. | 10 |
| `docs/**` | Documentación del framework + relevamiento (`.md`) + este seed; **incluye `skill-ancleto-update.md`** (nueva). | 19+ |
| `documentation/` | **Eliminada como área raíz** (registrada como "área raíz eliminada" por `materialReasons`); no se incluye en este seed. | — |
| `.opencode/**` | Instalación local del host (incluye `.ancleto-tier`); gitignored. | 64+ |
| `.github/workflows/**` | `publish.yml` (publicación a npm + Release + gate de lint). | 1 |
| `eslint.config.js` | Flat config del linter (4 reglas sobre `src/` y `test/`). | 1 |
| Raíz | `package.json` (`0.12.0`), `README.md`, `CHANGELOG.md` (hasta `0.12.0`), `BACKLOG.md`, `DESIGN-memory-engine-v0.2.0.md`, `LICENSE` (MIT), `AGENTS.md`, `PRODUCT.md`, `.gitattributes`, `.gitignore`, `.discovery-map.json`, `.ancletorc` (gitignored), **`package-lock.json`** (nuevo archivo material raíz). | 14 |

## Fuera del árbol versionado (gitignored, puede no existir)

`.ancletorc`, `.opencode/**` (instalación local del host) y `.ancleto/**`
(memoria local) están en `.gitignore`. En este checkout `.ancletorc`,
`.opencode/` y `.ancleto/` **sí existen**. El tier del proyecto vive en
`.opencode/.ancleto-tier` con valor `normal`.

## Destinos por host (no presentes en este repo)

`AGENT_TARGETS` define destinos que solo existen si el proyecto se instala
con ese host: `.claude/**`, `.github/skills|agents|prompts/**`,
`.agents/skills|agents/**` y `.agents/mcp_config.json` (antigravity),
`.commandcode/skills|agents|commands/**` y `.mcp.json` (commandcode),
`.cursor/skills`, `.roo/skills`. Detalle: `units/cli-install.md`.

## Exclusiones efectivas del pack (tier `normal` resuelto)

`node_modules`, `.git`, `dist` (siempre). El tier `normal` **no** aplica
`--compress` ni los ignores extra de `minimo`/`gratis`
(`test/**`, `docs/**`, `**/*.md`). El tier **no** excluye por sí mismo
los lockfiles; sin embargo, Repomix respeta `.gitignore`, que ignora
`package-lock.json`/`yarn.lock`/`pnpm-lock.yaml` (este repo tiene
`package-lock.json` solo). Además, Repomix respeta `.gitignore`
(`.opencode/`, `.ancletorc`, `.ancleto/`).

## Cambios del catálogo desde el seed previo

- **Skill nueva**: `skills/ancleto-update/SKILL.md` (comando
  `/cleto-update`) para revisión de artifacts de un change ante cambios
  de definición. Routada por `skills/ancleto-workflow/SKILL.md` (que
  ahora incluye `ancleto-update` en su tabla de routing).
- **Command nuevo**: `commands/cleto-update.md`.
- **Spec nueva**: `aspec/specs/artifact-update/spec.md` (4
  requirements: edición in-place, drift detection, elección de modo,
  límites de alcance).
- **Doc nueva**: `docs/skill-ancleto-update.md` (molde de
  `skill-ancleto-upgrade.md`).
- **Tests**: `test/content-guards.test.js` actualizado para incluir
  `ancleto-update` en `ARTIFACT_SKILLS` y el conteo de comandos
  `15 + 1`.
- **Host nuevo**: `commandcode` (Command Code, CLI `cmd`) en
  `SUPPORTED_AGENTS` + `AGENT_TARGETS` (`.commandcode/{skills,agents,commands}`),
  adaptador `adaptCommandCodeFrontmatter` + `COMMANDCODE_TOOL_MAP`/
  `COMMANDCODE_MCP_TOOL_MAP` y MCP de proyecto `.mcp.json`. Spec nueva:
  `aspec/specs/commandcode-support/spec.md`; deltas en `agent-install-routing`
  y `skill-frontmatter-adapters`; tests nuevos en `test/cli.test.js` (11) y
  `test/adapters-frontmatter.test.js` (10).
- **Área eliminada**: `documentation/` ya no aparece como área raíz.

## Cobertura conceptual

- Arquitectura y entry points: `overview.md`.
- Flujos críticos: `units/memory-engine.md`, `units/discovery-engine.md`,
  `units/cli-install.md`.
- Reglas y riesgos: `decisions.md`.
- Externos: `integrations.md`.