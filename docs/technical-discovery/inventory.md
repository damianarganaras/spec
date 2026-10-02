---
node: inventory
kind: inventory
read_when: "cobertura del repositorio por directorios y globs, y qué queda fuera"
generatedAt: 2026-10-02T20:32:00Z
pluginVersion: 0.11.0
skillVersion: '2.3'
---

# Inventario (orientación)

Cobertura por directorio/glob, no auditoría archivo por archivo. Conteos de
`.discovery-map.json` (`total_files: 617`).

| Área | Contenido | Archivos |
|---|---|---|
| `src/cli/**` | `index.js` (entry point y todos los subcomandos), `ui.js` (wizard/menús). | 2 |
| `src/core/**` | `discovery.js`, `repomix-tier.js`, `tier-models.js`, `adapters/frontmatter.js`, `memory/{database,engine,tools,mcp-server,doctor,working-context}.js`. | 12 |
| `agents/*.md` | 10 subagentes instalables. | 10 |
| `commands/*.md` | 15 comandos (`/cleto-*` del ciclo + review/security + transplant). | 15 |
| `skills/*/SKILL.md` (+ references) | 20 skills nativas (incluye `ancleto-review` y `ancleto-technical-discovery`). | 34 |
| `templates/` | `AGENTS.md`, `PRODUCT.md`. | 2 |
| `profiles/test/` | Overlay del perfil test: tester/reviewer ampliados, 5 comandos `cleto-test-*`, `AGENTS.md` con bloque LOCKED. | 8 |
| `aspec/` | `config.yaml` + `specs/` (14 capacidades) + 1 change activo (`ancleto-vscode-extension`, diferido) + `changes/archive/`. | 89 |
| `test/**` | `adapters-frontmatter`, `cli`, `content-guards`, `discovery-tier`, `discovery-topology`, `linter-config`, `mcp`, `memory-engine`, `tier-models`, `working-context` (`.test.js`). | 10 |
| `docs/**` | Documentación del framework + relevamiento (`.md`) + este seed; excluida del pack. | 18 |
| `documentation/**` | Material legado `lnx-cli/` + guías `.md`/`.pdf`; gitignored. | 340 |
| `.opencode/**` | Instalación local del host (64 archivos, incluye `.ancleto-tier`); gitignored. | 64 |
| `.github/workflows/**` | `publish.yml` (publicación a npm + Release + gate de lint). | 1 |
| `eslint.config.js` | Flat config del linter (4 reglas sobre `src/` y `test/`). | 1 |
| Raíz | `package.json`, `README.md`, `CHANGELOG.md` (hasta `0.11.0`), `BACKLOG.md`, `DESIGN-memory-engine-v0.2.0.md`, `LICENSE` (MIT), `AGENTS.md`, `PRODUCT.md`, `.gitattributes`, `.gitignore`, `.discovery-map.json`, `.ancletorc` (gitignored). | 13 |

## Fuera del árbol versionado (gitignored, puede no existir)

`.ancletorc`, `.opencode/**` (instalación local del host) y `.ancleto/**` (memoria local) están
en `.gitignore`. En este checkout `.ancletorc` y `.opencode/` **sí existen** (antes
ausentes); persiste `.ancleto/memory.db`. El tier del proyecto vive en
`.opencode/.ancleto-tier` (`gratis`).

## Destinos por host (no presentes en este repo)

`AGENT_TARGETS` define destinos que solo existen si el proyecto se instala con ese host:
`.claude/**`, `.github/skills|agents|prompts/**`, `.agents/skills|agents/**` y
`.agents/mcp_config.json` (antigravity), `.cursor/skills`, `.roo/skills`. Detalle:
`units/cli-install.md`.

## Exclusiones efectivas del pack (tier `gratis` resuelto)

`node_modules`, `.git`, `dist` (siempre) + `test/**`, `docs/**`, `**/*.md` (tier) +
`**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, imágenes (`png/jpg/svg/ico`), `public`,
lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`). Además, Repomix respeta
`.gitignore` (`.opencode/`, `.ancletorc`, `.ancleto/`, `/documentation`).

## Cobertura conceptual

- Arquitectura y entry points: `overview.md`.
- Flujos críticos: `units/memory-engine.md`, `units/discovery-engine.md`, `units/cli-install.md`.
- Reglas y riesgos: `decisions.md`.
- Externos: `integrations.md`.
