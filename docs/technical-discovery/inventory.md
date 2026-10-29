---
node: inventory
kind: inventory
read_when: "cobertura del repositorio por directorios y globs, y qué queda fuera"
generatedAt: 2026-10-29T19:20:00Z
pluginVersion: 0.16.0
skillVersion: '2.3'
---

# Inventario (orientación)

Cobertura por directorio/glob, no auditoría archivo por archivo. Conteos de
`.discovery-map.json` (`total_files: 704`, `last_updated: 2026-10-29T19:10:53.105Z`; `tree_summary`
por directorio de primer nivel).

| Área | Contenido | Archivos |
|---|---|---|
| `src/cli/**` | `index.js` (entry point y todos los subcomandos, incl. `affected`, `stats failures`, `memory snapshot`/`merge`, refresh on-write y advisory), `ui.js` (wizard/menús). | 2 |
| `src/core/**` | `discovery.js`, `affected-set.js` (grafo de imports), `machine-env.js` (entorno local), `repomix-tier.js`, `tier-models.js`, `adapters/frontmatter.js`, `memory/{database,engine,snapshot,doctor,tools,mcp-server,working-context}.js`. | 13 |
| `agents/*.md` | 10 subagentes instalables; todos con la instrucción canónica de leer `.ancleto/machine-env.md`; `orchestrator.md` con `## Machine Environment`, `## Session Intake`, techo de lecturas (3 archivos + exención de hasta 5 archivos nombrados por el usuario por mensaje) y trigger de Recall ante `<ContextOverflowWarning>`; `technical-discovery.md` con allowlist de `bash` de **dos literales** (`ancleto discovery --check`, `git status --short`) sobre `'*': deny`. | 10 |
| `commands/*.md` | 16 comandos (`/cleto-*` del ciclo + review/security + transplant + update). | 16 |
| `skills/*/SKILL.md` (+ references) | 21 directorios de skills (~35 archivos; incluye `ancleto-update`, `ancleto-review`, `ancleto-technical-discovery`, `ancleto-workflow`, `triage-clarifier`). | 35 |
| `templates/` | `AGENTS.md` (bloques `LOCKED` canónicos, incl. `validation-commands`) y `PRODUCT.md`; **sin** valores de máquina. | 2 |
| `profiles/test/` | Overlay del perfil test: tester/reviewer ampliados, comandos `cleto-test-*`, `AGENTS.md` con bloque LOCKED. | 8 |
| `aspec/` | `config.yaml` + `specs/` (**19 capacidades**, incl. `memory-ops`, `machine-environment`, `session-failure-report`) + **2 changes activos** (`ancleto-vscode-extension` y `decisiones-y-contrato-checkpoint`, este último con delta `ADDED`-only de `prompt-contracts`) + `changes/archive/` (29, el último `2026-10-28-reingenieria-memoria-first`). | 150 |
| `test/**` | 15 archivos `*.test.js` (`adapters-frontmatter`, `affected-set`, `cli`, `content-guards`, `discovery-tier`, `discovery-topology`, `linter-config`, `machine-env`, `mcp`, `memory-engine`, `memory-fixtures`, `memory-pr1-contract`, `stats-failures`, `tier-models`, `working-context`) + `fixtures/{seed,golden}.json`. | 17 |
| `docs/**` | Documentación del framework + relevamiento (`.md`) + este seed; excluida del pack por el tier. | 21 |
| `documentation/**` | Material legado `lnx-cli/` + guías; **gitignored**. El mapa lo cuenta porque recorre el disco, pero el pack lo excluye por `.gitignore`. | 340 |
| `audit logs/**` | 9 `.txt` de auditorías de sesiones (untracked). Entran al pack pero **no** son evidencia del producto ni área material del seed. | 9 |
| `.opencode/**` | Instalación local del host (incluye `.ancleto-tier` = `minimo` y los mirrors `.opencode/agents/*.md`, que se regeneran); gitignored. | 66 |
| `.github/workflows/**` | `publish.yml` (publicación a npm + Release + gate de lint). | 1 |
| `eslint.config.js` | Flat config del linter (4 reglas sobre `src/` y `test/`). | 1 |
| Raíz | `package.json` (`0.16.0`), `README.md`, `CHANGELOG.md` (hasta `0.16.0`), `DESIGN-memory-engine-v0.2.0.md`, `optimizacion-de-tokens.md` (análisis, no runtime), `LICENSE` (MIT), `AGENTS.md`, `PRODUCT.md`, `.gitattributes`, `.gitignore`, `.discovery-map.json`, `package-lock.json`, `.ancletorc` (gitignored). **Ya no existe `BACKLOG.md`.** | 14 |

## Fuera del árbol versionado (gitignored, puede no existir)

`.ancletorc`, `.opencode/**` (instalación local del host), `.ancleto/**` (memoria y artefactos
locales) y `/documentation` están en `.gitignore`. En este checkout `.ancletorc` y `.opencode/`
**sí existen**; persisten `.ancleto/memory.db`, `.ancleto/working-context.md` y
**`.ancleto/machine-env.md`** (generado el 2026-10-29). El tier del proyecto vive en
`.opencode/.ancleto-tier` (`minimo`). `audit logs/` **no** está en `.gitignore`: es untracked y
se excluye solo del commit por no agregarse.

## Destinos por host (no presentes en este repo)

`AGENT_TARGETS` define destinos que solo existen si el proyecto se instala con ese host:
`.claude/**`, `.github/skills|agents|prompts/**`, `.agents/skills|agents/**` y
`.agents/mcp_config.json` (antigravity), `.cursor/skills`, `.roo/skills`, `.commandcode/**` y
`.mcp.json` (commandcode). Detalle: `units/cli-install.md`.

## Exclusiones efectivas del pack (tier `minimo` resuelto)

`node_modules`, `.git`, `dist` / `build` / `coverage` (siempre, `DEFAULT_IGNORES` del CLI y de
la topología) + `test/**`, `docs/**`, `**/*.md` (tier) + `**/*.test.*`, `**/*.spec.*`,
`**/__tests__/**`, imágenes (`png/jpg/svg/ico`), `public`, lockfiles (`package-lock.json`,
`yarn.lock`, `pnpm-lock.yaml`). Además, Repomix respeta `.gitignore` (`.opencode/`, `.ancletorc`,
`.ancleto/`, `/documentation`). `minimo` **no** fija token budget (solo `gratis`: 50k); el pack
de esta corrida fue de **692 archivos, ~16.512 tokens**. `audit logs/` no está excluido y por eso
aparece en el pack; no se usa como evidencia. El conteo del pack difiere del `total_files` del
mapa (704) porque el mapa recorre el disco y el pack aplica los ignores del tier y `.gitignore`.

## Cobertura conceptual

- Arquitectura y entry points: `overview.md`.
- Flujos críticos: `units/memory-engine.md`, `units/discovery-engine.md`, `units/cli-install.md`.
- Mantenimiento de memoria (snapshot, merge, doctor read-only): `units/memory-engine.md`,
  `decisions.md`.
- Scope de review y grafo de imports (`affected-set`): `units/discovery-engine.md`.
- Entorno de máquina y exclusión local: `setup.md`, `decisions.md`, `units/cli-install.md`.
- Intake de sesión, techo de lecturas y trigger de Recall: `decisions.md`, `overview.md`.
- Reglas y riesgos: `decisions.md`.
- Externos: `integrations.md`.
