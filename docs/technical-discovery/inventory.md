---
node: inventory
kind: inventory
read_when: "cobertura del repositorio por directorios y globs, y qué queda fuera"
generatedAt: 2026-11-03T10:45:00Z
pluginVersion: 0.18.6
skillVersion: '2.3'
---

# Inventario (orientación)

Cobertura por directorio/glob, no auditoría archivo por archivo. Conteos de
`.discovery-map.json` (`total_files: 752`; `tree_summary` por directorio de primer nivel).

| Área | Contenido | Archivos |
|---|---|---|
| `src/cli/**` | `index.js` (entry point y todos los subcomandos, incl. `affected`, `stats failures`, `memory snapshot`/`merge`/**`consolidate`**/**`gc`**, refresh on-write y advisory), `ui.js` (wizard/menús). | 2 |
| `src/core/**` | `discovery.js`, `affected-set.js`, `machine-env.js`, `repomix-tier.js`, `tier-models.js`, `adapters/frontmatter.js`, `memory/{database,engine,snapshot,doctor,tools,mcp-server,working-context}.js`. `engine.js` incluye `searchMemory` task-aware, `resolveNodeRefs`, `consolidate`, `gcSuperseded`, el orden por anclaje y el aviso con manifiesto. | 15 |
| `agents/*.md` | 10 subagentes instalables; todos leen `.ancleto/machine-env.md`; `orchestrator.md` con `## Machine Environment`, `## Session Intake`, techo de lecturas, trigger de Recall y orden de promoción; `memory-keeper.md` usa `expand: true` en Recall; `technical-discovery.md` con allowlist de `bash` de dos literales sobre `'*': deny`. | 10 |
| `commands/*.md` | 16 comandos (`/cleto-*` del ciclo + review/security + transplant + update). | 16 |
| `skills/*/SKILL.md` (+ references) | 21 directorios de skills (~35 archivos; incluye `ancleto-update`, `ancleto-review`, `ancleto-technical-discovery`, `ancleto-workflow`, `triage-clarifier` y `ancleto-archive` con el gate de promoción). Los generadores emiten `proposal`/`tasks`/`specs` (sin `design.md`/`context.md`); el archive mueve sin borrar. Las skills de recall (`ancleto-recall`, `new`, `propose`, `ff`) usan `expand: true`. | 35 |
| `templates/` | `AGENTS.md` (bloques `LOCKED` canónicos, incluido `memory-protocol`) y `PRODUCT.md` (puntero al protocolo); **sin** valores de máquina. | 2 |
| `profiles/test/` | Overlay del perfil test: tester/reviewer ampliados, comandos `cleto-test-*`, `AGENTS.md` con bloque LOCKED. | 8 |
| `aspec/` | `config.yaml` + `specs/` (**19 capacidades**, incl. `memory-ops`, `memory-engine`, `machine-environment`, `session-failure-report`) + **1 change activo** (`ancleto-vscode-extension`) + `changes/archive/` (**41**; el último, `2026-11-02-mem-05b-gc-superseded-age`). MEM-05, MEM-05a y MEM-05b están archivados. | 192 |
| `test/**` | 15 archivos `*.test.js` (`adapters-frontmatter`, `affected-set`, `cli`, `content-guards`, `discovery-tier`, `discovery-topology`, `linter-config`, `machine-env`, `mcp`, `memory-engine`, `memory-fixtures`, `memory-pr1-contract`, `stats-failures`, `tier-models`, `working-context`) + **tres fixtures** (`seed.json`, `golden.json`, `golden-refs-seed.json`) + el root `fixtures/memory/refs-root/`. `memory-fixtures` cubre el check de refs, el resolver y el modo `refs` de M04/M05/M06. | 22 |
| `docs/**` | Documentación del framework + relevamiento (`.md`) + este seed; excluida del pack por el tier. | 21 |
| `documentation/**` | Material legado `lnx-cli/` + guías; **gitignored**. El mapa lo cuenta porque recorre el disco, pero el pack lo excluye. | 340 |
| `audit logs/**` | 9 `.txt` de auditorías (untracked). Entran al pack pero **no** son evidencia del producto. | 9 |
| `.opencode/**` | Instalación local del host (incluye `.ancleto-tier` = `minimo` y los mirrors `.opencode/agents/*.md`, que se regeneran); gitignored. | 66 |
| `.github/workflows/**` | `publish.yml` (publicación a npm + Release + gate de lint). | 1 |
| `eslint.config.js` | Flat config del linter (4 reglas sobre `src/` y `test/`). | 1 |
| Raíz | `package.json` (`0.18.6`), `opencode.json` (override de modelos para los 10 subagentes), `README.md` (documenta preview/`expand`/`keys`/`required`), `CHANGELOG.md` (hasta `0.18.6`), `DESIGN-memory-engine-v0.2.0.md`, `optimizacion-de-tokens.md` (análisis, no runtime), `LICENSE` (MIT), `AGENTS.md`, `PRODUCT.md`, `.gitattributes`, `.gitignore`, `.discovery-map.json`, `package-lock.json`, `.ancletorc` (gitignored). **No existe `BACKLOG.md`**; el backlog P0 vive en `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`. | 15 |

## Fuera del árbol versionado (gitignored, puede no existir)

`.ancletorc`, `.opencode/**` (instalación local), `.ancleto/**` (memoria y artefactos locales) y
`/documentation` están en `.gitignore`. En este checkout `.ancletorc` y `.opencode/` existen;
persisten `.ancleto/memory.db`, `.ancleto/working-context.md` (hoy `desactualizado`) y
`.ancleto/machine-env.md` (generado el 2026-11-03 con `ancleto: 0.18.6`). El tier vive en
`.opencode/.ancleto-tier` (`minimo`). `audit logs/` **no** está en `.gitignore`: es untracked.

## Cambios abiertos en el árbol de trabajo

El único change activo es **`ancleto-vscode-extension`**. Los changes recientes de memoria
(MEM-04b, ranking/omisiones, consolidación, MEM-05, MEM-05a y MEM-05b) están archivados.
`git status --short` muestra modificados `.discovery-map.json`, `agents/memory-keeper.md`,
`aspec/specs/{memory-engine,prompt-contracts}/spec.md`,
`docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`,
`docs/technical-discovery/.discovery-state.json`, `src/cli/index.js`,
`src/core/memory/{database,engine}.js` y tests. Evidencia: `git status --short`.

## Destinos por host (no presentes en este repo)

`AGENT_TARGETS` define destinos que sólo existen si el proyecto se instala con ese host:
`.claude/**`, `.github/skills|agents|prompts/**`, `.agents/skills|agents/**` y
`.agents/mcp_config.json` (antigravity), `.cursor/skills`, `.roo/skills`, `.commandcode/**` y
`.mcp.json` (commandcode). Detalle: `units/cli-install.md`.

## Exclusiones efectivas del pack (tier `minimo` resuelto)

`node_modules`, `.git`, `dist` / `build` / `coverage` (siempre, `DEFAULT_IGNORES` del CLI y de
la topología) + `test/**`, `docs/**`, `**/*.md` (tier) + `**/*.test.*`, `**/*.spec.*`,
`**/__tests__/**`, imágenes (`png/jpg/svg/ico`), `public`, lockfiles. Además, Repomix respeta
`.gitignore` (`.opencode/`, `.ancletorc`, `.ancleto/`, `/documentation`). `minimo` **no** fija
token budget (sólo `gratis`: 50k); el pack de esta corrida fue de **740 archivos, ~19.907
tokens**. `audit logs/` no está excluido y por eso aparece; no se usa como evidencia. El conteo
del pack difiere del `total_files` del mapa (752) porque el mapa recorre el disco y el pack
aplica ignores del tier y `.gitignore`.

## Cobertura conceptual

- Arquitectura y entry points: `overview.md`.
- Flujos críticos: `units/memory-engine.md`, `units/discovery-engine.md`, `units/cli-install.md`.
- Escritura de memoria y refs: `units/memory-engine.md`, `decisions.md`.
- `searchMemory` task-aware y protocolo canónico: `units/memory-engine.md`, `decisions.md`.
- Resolver de refs navegables: `units/memory-engine.md`, `decisions.md`.
- Orden de inyección, presupuesto y manifiesto de omitidas: `units/memory-engine.md`,
  `decisions.md`.
- Consolidación de duplicados: `units/memory-engine.md`, `setup.md`, `decisions.md`.
- GC por edad de supersesión: `units/memory-engine.md`, `setup.md`, `decisions.md`.
- Promoción al archivar: `decisions.md`, `units/memory-engine.md`, `units/cli-install.md`.
- Mantenimiento de memoria (snapshot, merge, doctor read-only): `units/memory-engine.md`,
  `decisions.md`.
- Scope de review y grafo de imports: `units/discovery-engine.md`.
- Entorno de máquina y exclusión local: `setup.md`, `decisions.md`, `units/cli-install.md`.
- Cambio de modelo de agentes: `setup.md`, `decisions.md`, `units/cli-install.md`.
- Intake de sesión, techo de lecturas y trigger de Recall: `decisions.md`, `overview.md`.
- Config del host opencode: `setup.md`, `decisions.md`, `integrations.md`.
- Reglas y riesgos: `decisions.md`.
- Externos: `integrations.md`.
