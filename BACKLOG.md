# Backlog

Seguimiento de qué se hizo y qué falta en `@ancleto/spec`. La fuente de verdad es la rama
`development`; `main` queda estable (protegida). Regla de release: **todo commit de feature
lleva su version bump** (`npm version minor|patch --no-git-tag-version`) antes de pushear.

## Hecho ✅

- ✅ Paquete `@ancleto/spec@0.1.0` publicado en npm + repo `github.com/damianarganaras/spec`
- ✅ Rebranding completo LN → ancleto (sin referencias corporativas)
- ✅ Modelos de los 10 agents adaptados al catálogo opencode-go (costo/tokens)
- ✅ CLI: `install [--project]`, `update`, `init [--with-azure]`, `--no-mcp`, `--tier`
- ✅ MCP **engram** + **caveman** configurados por defecto al instalar (fusión no destructiva)
- ✅ Tiers de costo `normal | minimo | gratis` (prompt en la 1ra config, persistidos en `.ancleto-tier`)
- ✅ Azure DevOps **opcional** (off por defecto): gate en `.ancletorc`, `ancleto-pr` usa GitHub
- ✅ KB MCP neutralizado (cleto-*, kb-context.md)
- ✅ Templates `AGENTS.md` / `PRODUCT.md` para proyectos nuevos (`CONTRIBUTING.md` eliminado: sus validaciones y reglas de commit pasaron a `AGENTS.md`)
- ✅ Rama `development` + `main` protegida
- ✅ Relevamiento de `lnx` CLI (fuente en `documentation/lnx-cli/`)
- ✅ **G1**: skills `triage-clarifier`, `ancleto-recall`, `ancleto-sync-specs` portadas (adaptadas, sin branding LN)
- ✅ **G2**: motor `ancleto discovery` (MVP) — pack con Repomix (`npx` o PATH, `--include/--ignore/--compress/--token-budget`), `--check` por hash de contenido (READY/STALE/PARTIAL/MISSING), estado en `.discovery-state.json`, zero-deps
- ✅ **M1 — Motor de Memoria Persistente SQLite+FTS5 (v0.2.0)**:
  `src/core/memory/database.js` (node:sqlite `DatabaseSync`, PRAGMAs `WAL`/`foreign_keys`/`busy_timeout=5000`,
  migraciones idempotentes, FTS5 external content `content_rowid='rowid'`, tokenizer `unicode61
  remove_diacritics 1` sin Porter Stemmer, triggers `INSERT/UPDATE/DELETE`), `engine.js`
  (`buildWorkingContext`, `searchMemory` BM25 con escape FTS5, `recordNode` con supersesión atómica
  `BEGIN IMMEDIATE` por `memory_key` + índice único parcial sobre activas), `tools.js`. Diseño congelado
  en `DESIGN-memory-engine-v0.2.0.md`.
- ✅ **3 Tools de memoria expuestas al LLM**: `searchMemory` (recuperación BM25), `recordRule` y
  `recordDecision` — con encapsulamiento total de `source`/`confidence`/`status`/`id` (gestionados por
  el runtime, nunca en las firmas JSON Schema; `additionalProperties: false`; args forjados ignorados).
- ✅ **`engines.node: ">=24.0.0"`** en `package.json` (requiere el módulo nativo `node:sqlite`).
  Zero-Dependencies mantenida (sin `better-sqlite3` ni binarios C++).
- ✅ **Suite de tests**: 33 tests `node --test` (unit + integración) en `test/memory-engine.test.js`
  (supersesión atómica + genealogía, sync FTS5 INSERT/UPDATE/DELETE, una sola activa por `memory_key`,
  encapsulamiento, diacríticos sin stemmer, escape de caracteres FTS5, XML de `<ProjectMemoryRules>`,
  scopes jerárquicos `project < feature < task`, truncamiento seguro con `<ContextOverflowWarning>`,
  memory doctor: sano / inconsistencia FTS5 + rebuild / duplicados de activas)
  + smoke de creación de DB y triggers — **33/33 verdes, sin warnings**.
- ✅ **Release v0.2.1** publicado en npm (`@ancleto/spec@0.2.1`, dist-tag `latest`).
- ✅ **Release v0.3.0** — tag `v0.3.0` creado y pusheado en `main` (merge de `development`). Publish a npm
  pendiente del Release en GitHub (dispara `publish.yml`).
- ✅ **CI/CD**: workflow `publish.yml` de GitHub Actions — `on.release.types: [published]`, runner
  `ubuntu-latest`, checkout@v5 + setup-node@v5 (runtime node24), `npm ci`, `node --test`,
  `npm publish` con `NODE_AUTH_TOKEN`. `package-lock.json` generado (zero-deps, requerido por `npm ci`).
- ✅ **Documentación del framework** en `docs/` (equivalente a los GEN-*.pdf de LN, basada
  en el sistema ancleto): `ancleto-cli-framework.md`, `guia-configuracion.md`,
  `skill-ancleto-upgrade.md`.
- ✅ **Fix CLI versión**: `ancleto --version` lee `package.json` en runtime (antes hardcodeado en 0.1.1, quedaba desincronizado con cada bump).
- ✅ **v0.3.0 — Integración de contexto (item 1)**: subcomando `ancleto memory context [--scope X] [--out file]`
  (imprime/escribe `<ProjectMemoryRules>`, default scope `project`); sección `## Project Memory Rules` en
  `agents/orchestrator.md` (lee `.ancleto/working-context.md` como datos **no confiables**); tests de XML
  y scopes exactos. Patrón "CLI materializa + agente lee" (preserva `bash: false`).
- ✅ Hotfix v0.6.1: buildWorkingContext devuelve topología en repositorios sin reglas (Día Cero).
- ✅ Feature v0.6.2: Banner ASCII animado y menú select TTY (Raw Mode) estilo OpenSpec para ancleto init.
- ✅ Releases v0.6.3/v0.6.4: rebrand de skills/commands (`openspec-*`/`/opsx-*` → `ancleto-*`/`/cleto-*`) + fix MCP binaries portables.
- ✅ Feature v0.6.5: Rebrand total openspec → aspec — directorio de changes `aspec/` (antes `openspec/`) con migración automática en `ancleto upgrade`, sin referencias al CLI externo.
- ✅ Feature v0.6.7: Tier `gratis` prefiere Muse Spark 1.3 Free (`opencode/muse-spark-1.3-contributor-free`): se pregunta en el wizard interactivo, se persiste en `.ancletorc` (`gratisModel`), con detección por `opencode models` en modo no interactivo y fallback a `opencode/big-pickle`; wizard interactivo también en `ancleto install` (banner + menús Agente/Tier).
- ✅ Feature v0.6.9: Optimización fina de skills (2da pasada: `ancleto-upgrade` −20% en skill y references; 6 skills medianas −8%) + sección en el README con el costo medido de los MCP (~5.800 tokens por request con el perfil mínimo de engram + caveman) y cómo reducirlo.
- ✅ Feature v0.6.10/v0.6.11: Publish automatizado e idempotente — el workflow se dispara al pushear el tag `v*` (o manualmente con `workflow_dispatch`), omite `npm publish` si la versión ya existe, verifica de forma paciente y **no bloqueante** que el tarball sea descargable (npm puede tardar en propagar) y crea el GitHub Release con la descripción del tag anotado. Diagnóstico que lo motivó: el README de npm no cambiaba porque npm muestra el README del tarball de la última versión **ingerida** (0.6.7), y tanto 0.6.9 como 0.6.10 quedaron en cola de propagación; además **v0.6.8 nunca tuvo Release** (un tag pusheado no publica por sí solo con el disparador anterior).
- ✅ Feature v0.6.14: Memoria propia cableada al runtime — nuevo subcomando `ancleto mcp` (servidor MCP stdio, zero-deps) que expone `searchMemory`/`recordRule`/`recordDecision` sobre `.ancleto/memory.db`; `install` lo configura por defecto y **engram pasa a opcional** (`--with-engram`), bajando el overhead fijo de ~5.800 a ~1.300 tokens por request. Fix: el scope por defecto era `repo` (las reglas grabadas sin scope quedaban invisibles para `<ProjectMemoryRules>`, que usa `project`); ahora default `project` con `enum` en el schema.
- ✅ Feature v0.6.15: Fix del helper `withDir` en los tests MCP (no esperaba callbacks `async` y borraba el cwd del servidor hijo antes del spawn: verde en Windows, rojo en Linux). Se reprodujo y validó con Node 24 en WSL. El CI lo atajó **antes** de publicar una versión rota.
- ✅ Issue #13 (v0.6.22): `@coder` recupera `bash` **acotado** — allow base + deny de lo destructivo (`az`, `git push/reset/checkout/rebase`, `rm -rf`, `npm publish`). Ahora puede buildear y validar su propio trabajo sin reemplazar al `@tester`; el `@orchestrator` lo refleja en la política de testing. Tests guard de la matriz de permisos.
- ✅ Relevamiento §7 (cruce #2): matriz real de permisos contrastada contra el contrato — confirmado que el coder sin shell era el problema central y que **Repomix no consume contexto** por defecto (on-demand de `ancleto discovery`).
- ✅ Épica **Memory & Roles hardening** (kanban #9, cerrada en v0.6.28): 12 issues + D1/D2/D3 —
  memoria (frontera repo/agente #16, working-context en init/install/upgrade #10, `searchMemory`
  tolerante #14, `memory list` read-only #12), roles (bash acotado del `@coder` #13, tope de output
  por agente #25, destilado del retorno del orquestador #26), cierre (STALE al archivar #17,
  guía de `.gitignore` #18, keywords canónicos con `ancleto specs check` #21) y telemetría de
  tokens por sesión con `ancleto stats` #27.
- ✅ Idioma configurable de los artifacts: `language` en `.ancletorc` (`auto | es | en | pt`),
  pregunta interactiva en `init`/`install` (`--lang`), detección en los primeros 3 mensajes con
  persistencia automática en modo `auto`, y keywords/nombres de archivo siempre literales en inglés.
- ✅ Release 1 del seed incremental: menú interactivo de exclusiones del discovery en `init`/`install`
  (`--exclude`; tests, assets, docs, migraciones/seeds, lockfiles) e `impact` (`none | minor | material`)
  en `ancleto discovery --check` que silencia la oferta de regenerar con cambios menores. Pendiente
  Release 2: estado por área + `seed-map.json` + regeneración parcial.

## Estado actual

> Los números de versión se evitan a propósito acá: la fuente de verdad es el último tag (`git tag --sort=-v:refname | head -1`) y npm (`npm view @ancleto/spec version`).

- Working tree **limpio**; `main` y `development` apuntan al mismo commit.
- Épicas cerradas: **v0.4.x** (CLI Integrity), **v0.5.0** (Agentic OpenSpec Engine: S1+S2+S3),
  **v0.6.0** (Discovery Engine v2.0: D1+D2+D3), los hitos **v0.6.1-v0.6.15** (hotfixes, rebrand,
  inglés+compresión, modelos y Muse Spark, README, pipeline de publish, memoria cableada al runtime)
  y la épica **Memory & Roles hardening** (kanban #9, cerrada en v0.6.28).
- Suite: **158 tests** `node --test` en verde (memory-engine 40 + cli 67 + discovery-topology 3 +
  discovery-tier 9 + content-guards 25 + tier-models 6 + mcp 8), verificado en Windows y Linux.
- `.ancleto/` ignorado en `.gitignore` (no se versionan bases de datos locales).
- CI/CD: `publish.yml` se dispara **al pushear el tag** `v*` (o a mano), publica a npm, verifica el
  tarball con un canary corto y crea el Release con el mensaje del tag.
- Memoria: motor propio (`node:sqlite` + FTS5) expuesto como MCP (`ancleto mcp`); engram es opcional
  (`--with-engram`).

## En curso / próximo

## v0.7.0 - Multi-Agent Adaptability & Memory Ops (Planeado)
- [ ] **M1 (Export/Import):** Commands `ancleto memory export` e `import` para respaldar/compartir reglas y decisiones activas en JSON/SQL sanitizado.
- [ ] **M2 (Garbage Collection):** Subcomando `ancleto memory gc [--dry-run]` para purgar nodos superseídos antiguos y ejecutar VACUUM/REINDEX en node:sqlite.
- [ ] **A1 (Frontmatter Adapters):** Transformador dinámico de metadatos en `installAgentSkills` para adaptar el frontmatter de las skills según el IDE configurado (`agent` en `.ancletorc`).

## Futuro (sin fecha) - Contexto colaborativo para equipos (Idea)

Anotada para evaluación futura. **Aplica solo a trabajos en equipo** (no es prioridad hoy).

- [ ] **C1 (carpeta de contexto compartido):** Flag opcional en `ancleto init` (p. ej. `--team`) que habilite una carpeta de contexto colaborativo versionada en el repo, donde se suban los artefactos SDD **archivados** (`aspec/changes/archive/`) y la **base de memoria SQLite** (`.ancleto/memory.db`), para compartir specs y reglas/decisiones entre el equipo. Requiere definir guardrails: qué NO se comparte (changes en curso, `working-context`), resolución de conflictos de la DB y sanitización de datos sensibles antes de commitear.

## v0.6.0 - Discovery Engine v2.0 & Token Budgeting

Evolucionar el motor de discovery (MVP con Repomix + `--check` por hash) hacia un mapa estructural con presupuesto de tokens e inyección de contexto.

- [x] **D1**: Topología — `ancleto discovery` genera/actualiza `.discovery-map.json` (`last_updated`, `total_files`, `tree_summary` por directorio de primer nivel, `root_files`) ignorando `node_modules`, `.git`, `.ancleto`, `dist`, `build`, `coverage`. ✅
- [x] **D2**: Token Budgeting — presupuesto de tokens sobre el mapa/pack (límites, advertencias y truncamiento). ✅
- [x] **D3**: Inyección de Contexto — exponer la topología al agente (working-context / seed). ✅ (+ hotfix Día Cero v0.6.1: topología también con BD vacía)

> Épica **v0.6.0 — Discovery Engine v2.0 & Token Budgeting** cerrada: D1 (topología), D2 (budgeting por tier), D3 (inyección de topología en el working context).

## v0.5.0 - Agentic OpenSpec Engine & Upgrades

Eliminar la dependencia externa de OpenSpec: motor propio de skills con configuración por Agente/IDE.

- [x] **S1**: Implementar configuración interactiva del Agente/IDE (opencode, vscode, antigravity, cursor, roo, etc.) en el CLI (`init`/`install`) y persistencia en `.ancletorc` (campo `agent`; default `opencode`; flag `--agent`). ✅
- [x] **S2**: Portar las 11 skills base de OpenSpec (`apply`, `archive`, `bulk-archive`, `continue`, `explore`, `ff`, `new`, `onboard`, `propose`, `verify`, `workflow`) adaptadas a la configuración del Agente. ✅
  - [x] **Pack 1 (core)**: `ancleto-new`, `ancleto-propose`, `ancleto-apply`, `ancleto-verify`, `ancleto-archive` — autocontenidas (sin binario `openspec`), integradas con memoria (`recordRule`/`recordDecision` en verify/archive, recall en new/propose), ruteadas por `agent` e instaladas en el directorio del agente. ✅
  - [x] **Pack 2 (workflows y utilidades)**: `ancleto-bulk-archive` (con `recordDecision` en resoluciones), `ancleto-continue`, `ancleto-explore` (con `searchMemory` inicial), `ancleto-ff`, `ancleto-onboard` (con `searchMemory` inicial), `ancleto-workflow` (router del ciclo de vida). `installAgentSkills()` instala el catálogo completo en el directorio del agente configurado. ✅
- [x] **S3**: Comando `ancleto upgrade`: actualiza templates y skills locales respetando bloques EXTENSIBLE (reusa la lógica LOCKED de G7). ✅

> Épica **v0.5.0 — Agentic OpenSpec Engine & Upgrades** cerrada: S1 (configuración por Agente), S2 (11 skills nativas), S3 (`ancleto upgrade`).

## v0.4.0 - CLI Integrity & Diagnostics

Hito: integridad de la CLI y manifiesto completo.

- [x] **G6**: Manifiesto `.ancletorc` completo — `version` (versión del paquete), `installedAt` (ISO) e
      `installedPaths` (templates/agents/commands/skills) en `init` e `install` (merge no destructivo). ✅
- [x] **Pulido (tests del CLI)**: suite `test/cli.test.js` (8 tests) — init con manifiesto, --with-azure,
      preservación de config, install --project (assets + tier + manifiesto), --no-mcp, fusión MCP no
      destructiva, install global con XDG_CONFIG_HOME, init post-install. ✅
- [x] **G3** `ancleto check`: verifica integridad de archivos instalados vs `installedPaths` del manifiesto
      (✔/✖ faltantes, ⚠ huérfanos; exit 1 si hay faltantes). ✅
- [x] **G4** `ancleto doctor`: diagnostica el entorno — Node >=24, `node:sqlite` importable, `opencode.json`
      válido (exit 1 si Node/SQLite fallan). ✅
- [x] **G5**: Scaffold OpenSpec en `init` e `install --project` — crea `openspec/changes/` y
      `openspec/config.yaml` solo si no existen (nunca pisa config.yaml). ✅
- [x] **G7**: Re-aplicación de secciones `<!-- LOCKED: name -->` en templates durante `install`/`update`:
      reemplaza el interior de los bloques LOCKED con el del paquete, preserva el resto (EXTENSIBLE);
      si los tags faltan o están mal formados, warning y archivo intacto. ✅
- [x] **G8**: Azure MCP opcional — con `azure.enabled: true` y sin `--no-mcp`, `install --project` inyecta
      `azure-devops` en `opencode.json` (fusión no destructiva, `npx -y @davstack/mcp-azure-devops`); aviso en
      consola sobre `AZURE_DEVOPS_ORG_URL` y `AZURE_DEVOPS_PAT` (sin pedir credenciales por stdin ni hardcodear URLs). ✅

> Épica **v0.4.0 — CLI Integrity & Diagnostics** cerrada: G6, tests CLI, G3, G4, G5, G7, G8 completos.

## v0.3.0 - Agent Memory Integration

Integración de la memoria persistente con el orquestador y los AI agents.

- [x] `core/orchestrator`: Integrar `buildWorkingContext()` para inyectar `<ProjectMemoryRules>` en el System Prompt. ✅ — implementado (commit `a17fc66`)
- [x] `core/memory`: Implementar política de token overflow / truncamiento seguro al recuperar reglas. ✅
- [x] `templates/AGENTS.md`: Agregar protocolo reactivo indicando cuándo los agentes deben llamar a `searchMemory`. ✅ (también reflejado en `templates/PRODUCT.md`, sección AI Memory)
- [x] `cli/memory`: Agregar comando/subcomando `ancleto memory doctor` para verificar integrity check y rebuild de FTS5. ✅
- [x] Complementos ya trackeados (se ejecutan dentro de v0.3.0): `ancleto-recall` → `searchMemory`, `memory-keeper` → tools del motor ✅
- [x] **Pulido**: `.gitattributes` para line-endings (evitar warnings LF/CRLF) ✅ y documentar
      flujo de release en el repo ✅

## Decisiones pendientes

- ~~Memoria: ¿adaptar a engram o dejar sin memoria?~~ → **Resuelta (v0.2.0)**: motor propio
  con `node:sqlite`, diseño congelado en `DESIGN-memory-engine-v0.2.0.md`. Revisar el
  contrato de `ancleto-recall` al implementar.
- ~~Alcance del motor `discovery` (G2): ¿implementación completa o MVP (solo `--check`)?~~ → **Resuelta**: MVP (`--check` por hash) — implementado en G2, ver `Hecho`.
- ~~¿Portar las otras 11 skills base (`ancleto-apply/archive/bulk-archive/continue/explore/ff/new/onboard/propose/verify/workflow`)?~~ → **Resuelta (v0.5.0)**: portar como skills nativas adaptadas al Agente (S2).
- Qué modelos van en cada tier (tabla `TIERS` en `src/cli/index.js` es ajustable)

## Ideas de colaboradores

- Lucas: tener en cuenta modelos gratuitos (implementado: tier `gratis`, default `opencode/big-pickle`)
- Gemini: aislar scope v0.1.1 (G3-G8 parked), Flash para G1, Pro para G2 (adoptado)