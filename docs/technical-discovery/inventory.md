---
node: inventory
kind: inventory
read_when: "cobertura del repositorio por directorios y globs, y qué queda fuera"
generatedAt: 2026-09-25T14:03:34Z
pluginVersion: 0.6.37
skillVersion: '2.3'
---

# Inventario (orientación)

Cobertura por directorio/glob, no auditoría archivo por archivo. Conteos de
`.discovery-map.json` (root `.discovery-map.json`, sin ignorados de Claude/anclote).

| Área | Contenido | Archivos |
|---|---|---|
| `src/cli/**` | `index.js` (entry point y todos los subcomandos), `ui.js` (wizard/menús). | 2 |
| `src/core/**` | `discovery.js`, `repomix-tier.js`, `tier-models.js`, `memory/{database,engine,tools,mcp-server,doctor}.js`. | 8 |
| `agents/*.md` | 10 subagentes instalables. | 10 |
| `commands/*.md` | 12 comandos `/cleto-*`. | 12 |
| `skills/*/SKILL.md` (+ references) | 18 skills nativas. | 32 |
| `templates/` | `AGENTS.md`, `PRODUCT.md`. | 2 |
| `aspec/` | `config.yaml`; `changes/` vacío. | 1 |
| `test/**` | `cli`, `content-guards`, `discovery-tier`, `discovery-topology`, `mcp`, `memory-engine`, `tier-models` (`.test.js`). | 7 |
| `docs/**` | Documentación del framework (4 `.md`); excluida del pack. | 4 |
| `documentation/**` | Material legado `lnx-cli/` + guías `.md`/`.pdf`; gitignored. | 340 |
| `.github/workflows/**` | `publish.yml` (publicación a npm + Release). | 1 |
| `.opencode/**` | Instalación local (agents/commands/skills/opencode.json/tier); gitignored. | 59 |
| Raíz | `package.json`, `package-lock.json`, `README.md`, `BACKLOG.md`, `DESIGN-memory-engine-v0.2.0.md`, `AGENTS.md`, `PRODUCT.md`, `.gitattributes`, `.gitignore`, `.ancletorc`. | 10 |

## Exclusiones efectivas del pack (`tier: minimo`)

`node_modules`, `.git`, `dist` (siempre) + `test/**`, `docs/**`, `**/*.md` (tier) +
`**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, imágenes (`png/jpg/svg/ico`), `public`,
`docs`, lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) (config) +
`.opencode/`, `/documentation`, `.ancleto/`, `.ancletorc` (`.gitignore`).

## Cobertura conceptual

- Arquitectura y entry points: `overview.md`.
- Flujos críticos: `units/memory-engine.md`, `units/discovery-engine.md`, `units/cli-install.md`.
- Reglas y riesgos: `decisions.md`.
- Externos: `integrations.md`.
