---
node: inventory
kind: inventory
read_when: "cobertura del repositorio por directorios y globs, y qué queda fuera"
generatedAt: 2026-10-14T22:01:41Z
pluginVersion: 0.11.1
skillVersion: '2.3'
---

# Inventario (orientación)

Cobertura por directorio/glob, no auditoría archivo por archivo. Conteos de
`.discovery-map.json` (`total_files: 627`).

| Área | Contenido | Archivos |
|---|---|---|
| `src/cli/**` | `index.js` (entry point y todos los subcomandos), `ui.js` (wizard/menús). | 2 |
| `src/core/**` | `discovery.js`, `repomix-tier.js`, `tier-models.js`, `adapters/frontmatter.js`, `memory/{database,engine,tools,mcp-server,doctor,working-context}.js`. | 12 |
| `agents/*.md` | 10 subagentes instalables (dedupe de reglas por `token-budget`). | 10 |
| `commands/*.md` | 15 comandos (`/cleto-*` del ciclo + review/security + transplant). | 15 |
| `skills/*/SKILL.md` (+ references) | 34 archivos de skills nativas (incluye `ancleto-review` y `ancleto-technical-discovery`). | 34 |
| `templates/` | `AGENTS.md` (bloques `LOCKED` canónicos), `PRODUCT.md`. | 2 |
| `profiles/test/` | Overlay del perfil test: tester/reviewer ampliados, 5 comandos `cleto-test-*`, `AGENTS.md` con bloque LOCKED. | 8 |
| `aspec/` | `config.yaml` + `specs/` (14 capacidades) + 2 changes activos (`ancleto-vscode-extension`, `token-budget`) + `changes/archive/` (18). | 99 |
| `test/**` | `adapters-frontmatter`, `cli`, `content-guards` (relajado a comportamiento), `discovery-tier`, `discovery-topology`, `linter-config`, `mcp`, `memory-engine`, `tier-models`, `working-context` (`.test.js`). | 10 |
| `docs/**` | Documentación del framework + relevamiento (`.md`) + este seed; excluida del pack. | 18 |
| `documentation/**` | Material legado `lnx-cli/` + guías `.md`/`.pdf`; gitignored. | 340 |
| `.opencode/**` | Instalación local del host (incluye `.ancleto-tier`); gitignored. | 64 |
| `.github/workflows/**` | `publish.yml` (publicación a npm + Release + gate de lint). | 1 |
| `eslint.config.js` | Flat config del linter (4 reglas sobre `src/` y `test/`). | 1 |
| Raíz | `package.json` (`0.11.1`), `README.md`, `CHANGELOG.md` (hasta `0.11.0`), `BACKLOG.md`, `DESIGN-memory-engine-v0.2.0.md`, `LICENSE` (MIT), `AGENTS.md`, `PRODUCT.md`, `.gitattributes`, `.gitignore`, `.discovery-map.json`, `.ancletorc` (gitignored). | 13 |

## Fuera del árbol versionado (gitignored, puede no existir)

`.ancletorc`, `.opencode/**` (instalación local del host) y `.ancleto/**` (memoria local) están
en `.gitignore`. En este checkout `.ancletorc` y `.opencode/` **sí existen**; persiste
`.ancleto/memory.db`. El tier del proyecto vive en `.opencode/.ancleto-tier` (`minimo`).

## Destinos por host (no presentes en este repo)

`AGENT_TARGETS` define destinos que solo existen si el proyecto se instala con ese host:
`.claude/**`, `.github/skills|agents|prompts/**`, `.agents/skills|agents/**` y
`.agents/mcp_config.json` (antigravity), `.cursor/skills`, `.roo/skills`. Detalle:
`units/cli-install.md`.

## Exclusiones efectivas del pack (tier `minimo` resuelto)

`node_modules`, `.git`, `dist` (siempre, `DEFAULT_IGNORES`) + `test/**`, `docs/**`, `**/*.md`
(tier) + `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, imágenes (`png/jpg/svg/ico`),
`public`, lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`). Además, Repomix
respeta `.gitignore` (`.opencode/`, `.ancletorc`, `.ancleto/`, `/documentation`). El tier
`minimo` **no** fija token budget (eso es exclusivo de `gratis`, 50k).

## Cobertura conceptual

- Arquitectura y entry points: `overview.md`.
- Flujos críticos: `units/memory-engine.md`, `units/discovery-engine.md`, `units/cli-install.md`.
- Reglas y riesgos: `decisions.md`.
- Externos: `integrations.md`.
