---
node: inventory
kind: inventory
read_when: "cobertura del repositorio por directorios y globs, y qué queda fuera"
generatedAt: 2026-10-17T04:04:04Z
pluginVersion: 0.13.2
skillVersion: '2.3'
---

# Inventario (orientación)

Cobertura por directorio/glob, no auditoría archivo por archivo. Conteos de
`.discovery-map.json` (`total_files: 321`, `last_updated: 2026-10-17T04:01:55Z`; `tree_summary`
por directorio de primer nivel).

| Área | Contenido | Archivos |
|---|---|---|
| `src/cli/**` | `index.js` (entry point y todos los subcomandos, incl. `affected` y **el refresh on-write de `memory import` y el chequeo advisory de `memory doctor`**) , `ui.js` (wizard/menús). | 2 |
| `src/core/**` | `discovery.js`, **`affected-set.js`** (grafo de imports), `repomix-tier.js`, `tier-models.js`, `adapters/frontmatter.js`, `memory/{database,engine,tools,mcp-server,doctor,working-context}.js` (**`refreshWorkingContextOnWrite`** y **`checkWorkingContextFreshness`**). | 11 |
| `agents/*.md` | 10 subagentes instalables (reglas deduplicadas por `token-budget`; contratos de `throughput-pipeline`; mención del refresh on-write CLI en `orchestrator.md`). | 10 |
| `commands/*.md` | 16 comandos (`/cleto-*` del ciclo + review/security + transplant + **update**). | 16 |
| `skills/*/SKILL.md` (+ references) | Skills nativas (21 directorios, ~35 archivos; incluye `ancleto-update`, `ancleto-review`, `ancleto-technical-discovery`, `ancleto-workflow`, `triage-clarifier`). | 35 |
| `templates/` | `AGENTS.md` (bloques `LOCKED` canónicos, incl. `validation-commands`), `PRODUCT.md`. | 2 |
| `profiles/test/` | Overlay del perfil test: tester/reviewer ampliados, 5 comandos `cleto-test-*`, `AGENTS.md` con bloque LOCKED. | 8 |
| `aspec/` | `config.yaml` + `specs/` (17 capacidades) + **2 changes activos** (`ancleto-vscode-extension`, `memory-cli-writes-refresh-working-context`) + `changes/archive/` (23). | 125 |
| `test/**` | `adapters-frontmatter`, **`affected-set`**, `cli` (cubren refresh on-write CLI y chequeo de staleness), `content-guards` (behavior), `discovery-tier`, `discovery-topology`, `linter-config`, `mcp`, `memory-engine`, `tier-models`, `working-context` (`.test.js`, con casos para los nuevos helpers). | 11 |
| `docs/**` | Documentación del framework + relevamiento (`.md`) + este seed; excluida del pack. | 19 |
| `documentation/**` | Material legado `lnx-cli/` + guías `.md`/`.pdf`; gitignored. | 0 (gitignored) |
| `.opencode/**` | Instalación local del host (incluye `.ancleto-tier`); gitignored. | 66 |
| `.github/workflows/**` | `publish.yml` (publicación a npm + Release + gate de lint). | 1 |
| `eslint.config.js` | Flat config del linter (4 reglas sobre `src/` y `test/`). | 1 |
| Raíz | `package.json` (`0.13.2`), `README.md` (sección de memoria actualizada con refresh on-write CLI y chequeo advisory), `CHANGELOG.md` (hasta `0.12.1`), `BACKLOG.md`, `DESIGN-memory-engine-v0.2.0.md`, `optimizacion-de-tokens.md` (análisis, no runtime), `LICENSE` (MIT), `AGENTS.md`, `PRODUCT.md`, `.gitattributes`, `.gitignore`, `.discovery-map.json`, `package-lock.json`, `.ancletorc` (gitignored). | 15 |

## Fuera del árbol versionado (gitignored, puede no existir)

`.ancletorc`, `.opencode/**` (instalación local del host) y `.ancleto/**` (memoria local) están
en `.gitignore`. En este checkout `.ancletorc` y `.opencode/` **sí existen**; persiste
`.ancleto/memory.db`. El tier del proyecto vive en `.opencode/.ancleto-tier` (`minimo`).
`documentation/` está gitignored y **no aparece** en `tree_summary` (0 archivos); el seed
anterior lo estimaba en ≈340 pero esa cifra quedó obsoleta tras cambios de `.gitignore`.

## Destinos por host (no presentes en este repo)

`AGENT_TARGETS` define destinos que solo existen si el proyecto se instala con ese host:
`.claude/**`, `.github/skills|agents|prompts/**`, `.agents/skills|agents/**` y
`.agents/mcp_config.json` (antigravity), `.cursor/skills`, `.roo/skills`, `.commandcode/**` y
`.mcp.json` (commandcode). Detalle: `units/cli-install.md`.

## Exclusiones efectivas del pack (tier `minimo` resuelto)

`node_modules`, `.git`, `dist` (siempre, `DEFAULT_IGNORES`) + `test/**`, `docs/**`, `**/*.md`
(tier) + `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, imágenes (`png/jpg/svg/ico`),
`public`, lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`). Además, Repomix
respeta `.gitignore` (`.opencode/`, `.ancletorc`, `.ancleto/`, `/documentation`). El tier
`minimo` **no** fija token budget (eso es exclusivo de `gratis`, 50k).

## Cobertura conceptual

- Arquitectura y entry points: `overview.md`.
- Flujos críticos: `units/memory-engine.md`, `units/discovery-engine.md`, `units/cli-install.md`.
- Scope de review y grafo de imports (`affected-set`): `units/discovery-engine.md`.
- Reglas y riesgos (`throughput-pipeline` y `memory-cli-writes-refresh-working-context`
  incluidos): `decisions.md`.
- Externos: `integrations.md`.