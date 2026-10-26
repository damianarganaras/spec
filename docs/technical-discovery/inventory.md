---
node: inventory
kind: inventory
read_when: "cobertura del repositorio por directorios y globs, y qué queda fuera"
generatedAt: 2026-10-26T19:42:38Z
pluginVersion: 0.15.2
skillVersion: '2.3'
---

# Inventario (orientación)

Cobertura por directorio/glob, no auditoría archivo por archivo. Conteos de
`.discovery-map.json` (`total_files: 688`, `last_updated: 2026-10-26T19:42:24.202Z`; `tree_summary`
por directorio de primer nivel).

| Área | Contenido | Archivos |
|---|---|---|
| `src/cli/**` | `index.js` (entry point y todos los subcomandos, incl. `affected`, `stats failures`, refresh on-write de `memory import` y advisory de `memory doctor`), `ui.js` (wizard/menús). | 2 |
| `src/core/**` | `discovery.js`, `affected-set.js` (grafo de imports), `machine-env.js` (entorno local), `repomix-tier.js`, `tier-models.js`, `adapters/frontmatter.js`, `memory/{database,engine,tools,mcp-server,doctor,working-context}.js`. | 12 |
| `agents/*.md` | 10 subagentes instalables; todos con la instrucción canónica de leer `.ancleto/machine-env.md`; `orchestrator.md` con `## Machine Environment`, `## Session Intake`, techo de lecturas (3 archivos + exención de hasta 5 archivos nombrados por el usuario por mensaje) y trigger de Recall ante `<ContextOverflowWarning>`; `technical-discovery.md` con allowlist de `bash` de **dos literales** (`ancleto discovery --check`, `git status --short`) sobre `'*': deny`. | 10 |
| `commands/*.md` | 16 comandos (`/cleto-*` del ciclo + review/security + transplant + update). | 16 |
| `skills/*/SKILL.md` (+ references) | 21 directorios de skills (~35 archivos; incluye `ancleto-update`, `ancleto-review`, `ancleto-technical-discovery`, `ancleto-workflow`, `triage-clarifier`). | 35 |
| `templates/` | `AGENTS.md` (bloques `LOCKED` canónicos, incl. `validation-commands`) y `PRODUCT.md`; **sin** valores de máquina. | 2 |
| `profiles/test/` | Overlay del perfil test: tester/reviewer ampliados, comandos `cleto-test-*`, `AGENTS.md` con bloque LOCKED. | 8 |
| `aspec/` | `config.yaml` + `specs/` (**19 capacidades**, incl. `machine-environment`, `session-failure-report`) + **1 change activo** (`ancleto-vscode-extension`) + `changes/archive/` (27, el último `2026-10-26-orchestrator-session-start`). | 140 |
| `test/**` | 13 archivos: `adapters-frontmatter`, `affected-set`, `cli`, `content-guards`, `discovery-tier`, `discovery-topology`, `linter-config`, **`machine-env`**, `mcp`, `memory-engine`, **`stats-failures`**, `tier-models`, `working-context`. | 13 |
| `docs/**` | Documentación del framework + relevamiento (`.md`) + este seed; excluida del pack por el tier. | 19 |
| `documentation/**` | Material legado `lnx-cli/` + guías; **gitignored**. El mapa lo cuenta porque recorre el disco, pero el pack lo excluye por `.gitignore`. | 340 |
| `audit logs/**` | 9 `.txt` de auditorías de sesiones (untracked). Entran al pack pero **no** son evidencia del producto ni área material del seed. | 9 |
| `.opencode/**` | Instalación local del host (incluye `.ancleto-tier` = `gratis` y los mirrors `.opencode/agents/*.md`, que se regeneran); gitignored. | 66 |
| `.github/workflows/**` | `publish.yml` (publicación a npm + Release + gate de lint). | 1 |
| `eslint.config.js` | Flat config del linter (4 reglas sobre `src/` y `test/`). | 1 |
| Raíz | `package.json` (`0.15.2`), `README.md`, `CHANGELOG.md` (hasta `0.15.2`), `BACKLOG.md`, `DESIGN-memory-engine-v0.2.0.md`, `optimizacion-de-tokens.md` (análisis, no runtime), `LICENSE` (MIT), `AGENTS.md`, `PRODUCT.md`, `.gitattributes`, `.gitignore`, `.discovery-map.json`, `package-lock.json`, `.ancletorc` (gitignored). | 15 |

## Fuera del árbol versionado (gitignored, puede no existir)

`.ancletorc`, `.opencode/**` (instalación local del host), `.ancleto/**` (memoria y artefactos
locales) y `/documentation` están en `.gitignore`. En este checkout `.ancletorc` y `.opencode/`
**sí existen**; persisten `.ancleto/memory.db`, `.ancleto/working-context.md` y
**`.ancleto/machine-env.md`** (generado el 2026-10-26 por `ancleto upgrade`). El tier del
proyecto vive en `.opencode/.ancleto-tier` (`gratis`). `audit logs/` **no** está en `.gitignore`:
es untracked y se excluye solo del commit por no agregarse.

## Destinos por host (no presentes en este repo)

`AGENT_TARGETS` define destinos que solo existen si el proyecto se instala con ese host:
`.claude/**`, `.github/skills|agents|prompts/**`, `.agents/skills|agents/**` y
`.agents/mcp_config.json` (antigravity), `.cursor/skills`, `.roo/skills`, `.commandcode/**` y
`.mcp.json` (commandcode). Detalle: `units/cli-install.md`.

## Exclusiones efectivas del pack (tier `gratis` resuelto)

`node_modules`, `.git`, `dist` (siempre, `DEFAULT_IGNORES`) + `test/**`, `docs/**`, `**/*.md`
(tier) + `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, imágenes (`png/jpg/svg/ico`),
`public`, lockfiles (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`). Además, Repomix
respeta `.gitignore` (`.opencode/`, `.ancletorc`, `.ancleto/`, `/documentation`). El tier
`gratis` fija token budget 50k (el pack de esta corrida: **676 archivos, ~15.149 tokens**).
`audit logs/` no está excluido y por eso aparece en el pack; no se usa como evidencia. El
conteo del pack difiere del `total_files` del mapa (688) porque el mapa recorre el disco y el
pack aplica los ignores del tier y `.gitignore`.

## Cobertura conceptual

- Arquitectura y entry points: `overview.md`.
- Flujos críticos: `units/memory-engine.md`, `units/discovery-engine.md`, `units/cli-install.md`.
- Scope de review y grafo de imports (`affected-set`): `units/discovery-engine.md`.
- Entorno de máquina y exclusión local: `setup.md`, `decisions.md`, `units/cli-install.md`.
- Intake de sesión, techo de lecturas y trigger de Recall: `decisions.md`, `overview.md`.
- Reglas y riesgos: `decisions.md`.
- Externos: `integrations.md`.
