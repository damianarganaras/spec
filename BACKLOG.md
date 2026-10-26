# Backlog

Seguimiento de qué se hizo y qué falta en `@ancleto/spec`. La fuente de verdad es la rama
`development`; `main` queda estable (protegida). Regla de release: **todo commit de feature
lleva su version bump** (`npm version minor|patch --no-git-tag-version`) antes de pushear.

## Hecho ✅

- ✅ Paquete `@ancleto/spec@0.1.0` publicado en npm + repo `github.com/damianarganaras/spec`
- ✅ Modelos de los 10 agents adaptados al catálogo opencode-go (costo/tokens)
- ✅ CLI: `install [--project]`, `update`, `init [--with-azure]`, `--no-mcp`, `--tier`
- ✅ MCP **engram** + **caveman** configurados por defecto al instalar (fusión no destructiva)
- ✅ Tiers de costo `normal | minimo | gratis` (prompt en la 1ra config, persistidos en `.ancleto-tier`)
- ✅ Azure DevOps **opcional** (off por defecto): gate en `.ancletorc`, `ancleto-pr` usa GitHub
- ✅ KB MCP neutralizado (cleto-*, kb-context.md)
- ✅ Templates `AGENTS.md` / `PRODUCT.md` para proyectos nuevos (`CONTRIBUTING.md` eliminado: sus validaciones y reglas de commit pasaron a `AGENTS.md`)
- ✅ Rama `development` + `main` protegida
- ✅ **G1**: skills `triage-clarifier`, `ancleto-recall`, `ancleto-sync-specs` portadas (adaptadas)
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
- ✅ **Documentación del framework** en `docs/` (equivalente a los GEN-*.pdf, basada
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
  en `ancleto discovery --check` que silencia la oferta de regenerar con cambios menores.
- ✅ Release 2 del seed incremental: `affectedDocs` en `--check` (cruce de áreas cambiadas con
  `seed-map.json`, que escribe la skill) y regeneración parcial — con `impact: minor` se reescriben
  solo los documentos afectados. Sin bump de formato: los `fileHashes` ya llevan la info por área,
  un `version: 2` sería dato redundante.
- ✅ Release **v0.6.38** — fix de aislamiento del cwd en las pruebas de `buildWorkingContext`
  (`test/memory-engine.test.js`): las 16 llamadas pasan la raíz explícita (8 del engine compartido
  + 4 vía `withEngine` propagando su `dir` + 4 que ya la pasaban), sin tocar `src/`. Conteos reales
  **6 → 2 → 0** fallos, suite **44/44**. Change SDD `fix-memory-engine-test-isolation` (proposal →
  design → tasks → implementación → validación → review → archive). Tag `v0.6.38` creado sobre el
  merge `development→main`. **Sin publicación nueva en npm** (el `package.json` quedó en `0.6.37` y
  el workflow omite `npm publish` si la versión ya existe; solo se creó el Release de GitHub).
- ✅ Change SDD `migrate-openspec-to-aspec` completado y archivado en `aspec/changes/archive/2026-09-29-migrate-openspec-to-aspec/`: directorio de changes `aspec/` (antes `openspec/`) con migración automática en `ancleto upgrade`.
- ✅ Fix `direct-implementation`: `install --project` ahora ejecuta la migración legacy `openspec/` → `aspec/` (paridad con `init`/`upgrade`) — `migrateLegacyOpenspec` antes de `scaffoldAspec` en `src/cli/index.js`; spec `aspec/specs/aspec-bootstrap/spec.md` actualizado con el tercer ejecutor del invariante.
- ✅ Change `cleto-review` archivado `2026-10-02-cleto-review/` (skill `ancleto-review` + `/cleto-review`, 4 detectores; spec source-of-truth `aspec/specs/code-review/spec.md`).
- ✅ Change `memory-ops-export-import-gc` archivado `2026-10-02-memory-ops-export-import-gc/` (M1+M2: `memory export/import/gc`; spec `aspec/specs/memory-ops/spec.md`; import NO reactiva superseded, GC usa `created_at` como proxy + `strftime` ISO).
- ✅ Change `add-standard-linter` archivado `2026-10-02-add-standard-linter/` (B7: ESLint 10 flat config, 4 reglas, `npm run lint` + CI bloqueante; spec `aspec/specs/linter-standard/spec.md`).
- ✅ Change `dynamic-frontmatter-adapters` archivado `2026-10-02-dynamic-frontmatter-adapters/` (A1: `src/core/adapters/frontmatter.js` puro + `check` no bloqueante; spec `aspec/specs/skill-frontmatter-adapters/spec.md` +5 requirements).
- ✅ Change `add-multi-agent-cli-support` archivado `2026-09-30-add-multi-agent-cli-support/` (modelo de instalación portable multi-host: ruteo nativo por host, adapters de frontmatter, alta de `claude`; spec `aspec/specs/agent-install-routing/spec.md`).

## Estado actual

> Los números de versión se evitan a propósito acá: la fuente de verdad es el último tag (`git tag --sort=-v:refname | head -1`) y npm (`npm view @ancleto/spec version`).

- Working tree **limpio**; `main` y `development` apuntan al mismo commit.
- Épicas cerradas: **v0.4.x** (CLI Integrity), **v0.5.0** (Agentic OpenSpec Engine: S1+S2+S3),
  **v0.6.0** (Discovery Engine v2.0: D1+D2+D3), los hitos **v0.6.1-v0.6.15** (hotfixes, rebrand,
  inglés+compresión, modelos y Muse Spark, README, pipeline de publish, memoria cableada al runtime)
  y la épica **Memory & Roles hardening** (kanban #9, cerrada en v0.6.28).
- Suite: **331 tests** `node --test` en verde (memory-engine 58 + cli 181 + adapters-frontmatter 43 +
  content-guards 45 + linter-config 4), `npm run lint` limpio, verificado en Windows y Linux (2026-10-02).
- `.ancleto/` ignorado en `.gitignore` (no se versionan bases de datos locales).
- CI/CD: `publish.yml` se dispara **al pushear el tag** `v*` (o a mano), publica a npm, verifica el
  tarball con un canary corto y crea el Release con el mensaje del tag.
- Memoria: motor propio (`node:sqlite` + FTS5) expuesto como MCP (`ancleto mcp`); engram es opcional
  (`--with-engram`).
- Seed: `ancleto discovery --check` en **READY** / `impact: none` (regenerado 2026-10-02 tras archivar los 4 changes).

## Evolución v0.7 — backlog seleccionado

Branch de trabajo: `feat/evolucion-v07-backlog` (rebaseada a `main` @ `v0.8.0` / `61a9b3e`;
A, C, D, F portados a la arquitectura multi-host; E superseded).
Selección: **A, C, D, E, F, G (vscode-extension)**.

- [x] **A. Soporte Copilot (VS Code + Visual Studio)** — portado a la arquitectura multi-host
  de `main`: `copilot` en `SUPPORTED_AGENTS` + entrada en `AGENT_TARGETS` (agents/commands →
  `.github/prompts/*.prompt.md`) + `copilot` en `AGENT_ADAPTER_HOSTS` (mismo DROP set) + nota
  de picker en orchestrator + `copilot-mcp.json` (merge en install, refresh en upgrade).
  Documentado que el tier no cambia modelos en Copilot (solo nivel de esfuerzo/pasos).
- [x] **C. Perfil de test automation estilo spectest** — `ancleto init --profile test`
  (`--profile test:playwright`); activos en `profiles/test/` (tester ampliado con
  planning/generation/healing/coverage + reviewer, comandos `cleto-test-*`,
  estructura `testspec/specs` + `testspec/changes` o reuso de `aspec/`); compatible con `--agent copilot`.
- [x] **D. Export / Import entre máquinas** — comandos `ancleto export` (bundle portable +
  `manifest.json` sin paths absolutos, solo intención MCP) e `ancleto import` (regenera MCP
  vía `buildDefaultMcp`/`resolveBin`, corre `doctor`); `import --repair` repara in place
  entradas con `command` inexistente. Caso real: Windows → Linux (T480). No confundir con
  M1 de v0.7.0 (ese es export/import de *memoria*; este es portabilidad de *proyecto*).
- [x] **E. Antigravity: directorio de skills — COMPLETO (vía `main` v0.8.0)** — el modelo
  multi-host + soporte completo (agents adaptados, commands como skills, MCP propio) cubren
  el fix; garantía IDE/CLI validada por el usuario. Change propio archivado como historial.
- [x] **F. Import de proyecto OpenSpec pre-existente en init** — change `import-legacy-openspec`
  implementado: `detectLegacyOpenSpec` clasifica (`none`/`legacy`/`external`: specs con archivos
  o firma OpenSpec en `AGENTS.md`); externo pide confirmación (Sí/No/ver, default No, `--yes`
  para script); importación semilla no destructiva + `AGENTS.md` nunca pisado en silencio +
  marcador de idempotencia; cableado en `init`, `install --project` y `upgrade` migratorio sin
  `.ancletorc`. Rama legacy del change archivado intacta (suite 314/314 en v0.8.0).
- [ ] **G. Extensión de VS Code (distribución dual npm + Marketplace)** — fuente:
  `aspec/changes/ancleto-vscode-extension/` (**DIFERIDO, no prioridad**: implementación
  revertida en v0.8.0, tasks reseteadas a 0/21; quedan proposal/design/specs como historial).
  Estrategia decidida: **thin-wrapper** (npm fuente de verdad, build genera el `.vsix`).

## En curso / próximo

- [x] **Change `cleto-review` — ARCHIVADO `2026-10-02-cleto-review/`** — skill `ancleto-review` + comando `/cleto-review` implementados y archivados (spec `aspec/specs/code-review/spec.md`).
- [x] **Validar comportamiento de Antigravity IDE vs Antigravity CLI** — validado por el usuario (2026-09-30); garantía registrada en `fix-antigravity-skill-dir`.
- [x] **Change `add-multi-agent-cli-support` — ARCHIVADO `2026-09-30-add-multi-agent-cli-support/`** — modelo de instalación portable multi-host: ruteo nativo por host, adapters de frontmatter, alta de `claude`. Implementado y archivado (ya no está en curso).
- [x] **Migración openspec→aspec** — change archivado `migrate-openspec-to-aspec` (legacy propio) +
  change `import-legacy-openspec` (externo, `install --project`, `upgrade` sin `.ancletorc`).
- [x] **`install --project` ejecuta la detección/migración `openspec/` → `aspec/`** — cableado vía
  `maybeImportOpenspec` antes del scaffold (change `import-legacy-openspec`).

## v0.7.0 - Multi-Agent Adaptability & Memory Ops (Planeado)
- [x] **M1 (Export/Import):** `ancleto memory export/import` implementados y archivados (`2026-10-02-memory-ops-export-import-gc/`; spec `aspec/specs/memory-ops/spec.md`; import idempotente, NO reactiva superseded). ✅
- [x] **M2 (Garbage Collection):** `ancleto memory gc [--dry-run] [--days N]` implementado y archivado (mismo change; usa `created_at` como proxy + `strftime` ISO, VACUUM/REINDEX post-commit, avisa `vacuumError`). ✅
- [x] **A1 (Frontmatter Adapters):** `src/core/adapters/frontmatter.js` puro + `check` no bloqueante, implementado y archivado (`2026-10-02-dynamic-frontmatter-adapters/`; spec `aspec/specs/skill-frontmatter-adapters/spec.md`). ✅

## Candidatos de proceso y configuración (detectados en el cierre de v0.6.38)

- [ ] **B2 — `ancleto doctor` advierte gates declarados-ausentes:** el contrato (`AGENTS.md`) exige `npm run typecheck`, `npm run lint` y `npm test` como validaciones obligatorias, pero un proyecto puede no tener scripts ni configs (ESLint/Prettier/tsconfig) y entonces esos gates no existen — el tester/coder deben reportarlos como "gate ausente" en cada change. Propuesta: que `ancleto doctor` (o `check`) detecte y advierta cuando el contrato declara gates que el tooling real del proyecto no provee, o que el template `AGENTS.md` se genere condicionado al tooling detectado.
  > Verificado 2026-10-02: **PENDIENTE** — `doctor` solo valida Node/SQLite/`opencode.json` (`src/cli/index.js:2804`) y `check` valida archivos instalados (`:2156`); no detecta gates ausentes. Sin spec.
- [ ] **B3 — Branch protection real en `main`, o aclarar que es honor-based:** `BACKLOG.md` y `AGENTS.md` declaran `main` como protegida y prohíben commits directos a `main`/`master`, pero el remoto no aplica branch protection real (un `git push origin main` y un merge fast-forward `development→main` pasan sin PR). Propuesta: habilitar branch protection real en GitHub (requiere PR + review) o documentar explícitamente que el guardrail es honor-based y no enforceado.
  > Verificado 2026-10-02: **PENDIENTE** — único workflow es `publish.yml` (por tag); no hay branch protection ni doc que aclare honor-based fuera de este ítem. Sin spec.
  **Evidencia (2026-10-26):** un `git pull --tags origin development` con `pull.rebase=true` a nivel sistema (`C:/Program Files/Git/etc/gitconfig`) reescribió `development`: 9 commits lineales, 6 merges colapsados (248 vs 254 commits alcanzables). El remoto aceptó el push del tip reescrito y después un `git push --force-with-lease` sin ninguna guarda — no hay branch protection ni en `development` ni en `main`, y `pull.ff` está sin setear.
- [ ] **B4 — Modo "scope extension" en `@spec-writer`:** cuando un change necesita ampliar su alcance a mitad de camino (p. ej. la opción B de `fix-memory-engine-test-isolation`), hoy hay que re-delegar al spec-writer completo para re-sincronizar todos los artifacts. Propuesta: un modo de extensión de alcance que toque solo las secciones afectadas (proposal/spec/design/tasks), conservando el resto del trabajo ya aprobado.
  > Verificado 2026-10-02: **PENDIENTE** — `agents/spec-writer.md:36-49` siempre genera el set completo de artifacts; la única mención de "scope extension" es este backlog. Sin spec.
- [ ] **B5 — Autoría de memoria no verificable:** el engine de memoria (`node:sqlite`) no registra el emisor; `source` vale `mcp:ancleto-memory` en todos los nodos, así que el ownership de escritura es convención del workflow, no una propiedad enforceable. Candidato a change propio de endurecimiento (p. ej. campo de actor/procedencia). Aparte: superseder el nodo stale `multi-agent-cli-support-design` vía `@memory-keeper` cuando el cambio multi-agente quede cerrado.
  > Verificado 2026-10-02: **PARCIAL** — la columna `source` existe (`src/core/memory/database.js:15`), pero el MCP la fija constante (`src/core/memory/mcp-server.js:16`) y `engine.js:196` la resuelve del runtime; no hay actor/procedencia. `aspec/specs/memory-engine/spec.md` no lo cubre. Extender `source`, no crear estructura nueva.
- [ ] **B6 — El seed check reporta archivos cambiados, no contratos cambiados:** `ancleto discovery --check` deriva el veredicto de `changedAreas` + `affectedDocs` y sus `materialReasons` nombran el **archivo** (p. ej. `package.json`) pero no **qué contrato** cambió. Eso da veredictos correctos por heurística y puede producir falsos positivos (marca material) y, peor, falsos negativos (deja pasar un cambio de contrato). Mejora propuesta: que el check identifique el **contrato** afectado (nombres de assets, forma de frontmatter, paths por host), no solo el archivo.
  > Verificado 2026-10-02: **PENDIENTE** — `materialReasons`/`impact` se derivan por archivo (`src/cli/index.js:1723`, `:1750`) y el cruce es por área (`:1767`); no identifica contratos. Sin spec.
- [x] **B7 — COMPLETADO `2026-10-02-add-standard-linter/` (era: no había gate de lint/format):** el repo no tiene `eslint`/`prettier`/`tsconfig` ni script de lint; los changes consecutivos (`reviewer-guarantee-vs-model`, `add-multi-agent-cli-support`, `add-antigravity-full-support`) se publicaron con "gates ausentes (no bloqueante)". La verificación fue 100% manual + `node --test`. Candidato a change propio: agregar linter estándar (devDependency + config + paso en CI) y resolver hallazgos. **Alcance recomendado al abrirlo: mínimo** (reglas `no-undef`, `no-unused-vars`, `eqeqeq`, `no-dupe-keys`) **sin Prettier** (Prettier reformatea todo `src/` y `test/` → churn enorme; si se quiere, va como ítem aparte). **Caveat honesto:** un linter NO ataja la clase de bug de estos changes (ids inventados, conflación MCP, `cmdSpec` mal derivado) — eso lo atrapa un **test**, no un linter. Nota: agrega `devDependencies` (no rompe el "zero-dependencies" de **runtime**, que solo aplica a lo publicado).

## Observaciones diferidas — change `add-multi-agent-cli-support`

Revisar después de la implementación (no bloquean el change).

- [ ] **Cobertura de tests (menor):** assert explícito de ausencia de `agents`/`commands` para `cursor`/`roo` (hoy el mecanismo es host-agnóstico y solo `antigravity` se ejercita); assert explícito de `installedPaths` en el test del recorte `claude` (hoy validado genéricamente).
- [ ] **Enunciado D10:** unificar la lista de lectores de `.agents/skills` incluyendo Antigravity (D2/proposal lo incluyen; D10 lo omite — enunciado no exhaustivo).
- [ ] **`mergeMcp` multi-host:** hoy escribe en `opencode.json` aunque el host no sea opencode → evaluar soporte MCP por host (OOS en este change).
- [ ] **Frontmatter fino de custom agents de VS Code:** verificar el esquema real antes de prometer campos no portables (política actual: omitir/heredar).
- [ ] **`.roo/skills`:** apoyado solo en evidencia 3rd-party → verificar contra doc oficial de Roo.
- [ ] **`allowed-tools`:** retractado como guarda; si algún skill lo trae, queda cubierto por la política genérica de D5 (revisar si aparece demanda).
- [ ] **Tier/registro acoplados a `.opencode` (deuda, no bloqueante):** `registerProject`, `projectStatus` y `checkTierOrphan` (`src/cli/index.js`) leen rutas fijas bajo `.opencode/` (`agents`, `.ancleto-tier`), pero la instalación ahora rutea agents a `.claude|.github|…`. En un proyecto solo-cursor/roo con `--tier`, `ancleto check` emite un falso `⚠ tier "…" sin agentes locales` y el proyecto sale como `global` en `projects list`. Desacoplar del base opencode.
- [ ] **Spec `agent-install-routing` (texto inexacto):** el scenario de `check` dice "sin requerir cambios de lógica", pero `installedExtFor` fue necesario para que `check` derive `.agent.md`/`.prompt.md`. Ajustar el texto del spec.
- [ ] **MCP por defecto en host no-opencode (confirmar/cobertura):** `install --project --agent claude` **sin** `--no-mcp` sigue mergeando MCP en `.opencode/opencode.json` (D6 lo declara OOS/diferido). Los tests sólo cubren `--no-mcp` → confirmar aceptabilidad o agregar cobertura del camino por defecto.
- [ ] **CRLF en frontmatter adaptado:** `serializeFrontmatter` normaliza `\r\n`→`\n` dentro del frontmatter adaptado (Claude); en checkouts CRLF cambia finales de línea respecto del origen. Fidelidad menor, sólo en archivos adaptados.
- [ ] **DECISIÓN PENDIENTE — adapter de vscode vs D5:** los agents de vscode se copian **verbatim** (sin adapter), conservando `mode/color/temperature/permission` y `model: opencode-go/*` en `.github/agents/<n>.agent.md`; esto contradice el requirement genérico "aplicable a cualquier host" de `skill-frontmatter-adapters` (D5) y, a la vez, el requirement "Preservación por defecto". Decidir: (a) adaptar vscode como claude; (b) acotar el requirement genérico a hosts con adapter; o (c) aceptar verbatim con racional documentado.

## Observaciones diferidas — change `add-antigravity-full-support`

Revisar después de la implementación (no bloquean el change).

- [ ] **Determinar empíricamente qué tool ids acepta el frontmatter de subagents de Antigravity sin colgar el subagente.** La doc oficial usa "e.g." para los ejemplos de `tools` → la lista **no es exhaustiva**: ids como `create_file`, `find_file`, `write_to_file` **podrían** ser válidos en frontmatter aunque no estén documentados (hoy solo se conocen como SDK `BuiltinTools` o guías de comunidad). La regla dura actual (emitir solo los 5 confirmados; el resto omitir con aviso) es conservadora y correcta. La deuda es resolverlo **en runtime** (probar ids candidatos contra un subagente real y ver si arranca/ejecuta sin colgarse), **no** buscando en docs (la doc no publica la lista completa).

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

## Detectado en auditoría de 9 sesiones

Fuente: 9 auditorías de sesiones reales de Ancleto en "App Registros TC" (2026-10). Solo
hallazgos cuyo dueño es Ancleto; los específicos del proyecto y los hábitos del usuario quedan
fuera de esta sección. Prioridad = impacto en la calidad de Ancleto.

1. [ ] **Contrato de capacidades y ownership de subagentes** — `agents/*.md`. **M**. `change directo`. Faltan invariantes de proceso sobre qué tools existen realmente: `@spec-writer` no tiene delete (`agents/spec-writer.md:7-11`) y `@coder` no tiene `task` para encadenar al tester (`agents/coder.md:7-11`); tester/documenter tienen git prohibido (`agents/tester.md:53`, `agents/documenter.md:74-75`) sin dueño de commit/merge. Impacto: 5/9 sesiones replanificaron borrados, handoffs y git a mano; 5 commits extra por sesión en un caso.

2. [ ] **Recall obligatorio cuando el working-context viene truncado** — `agents/orchestrator.md` + `src/core/memory/engine.js`. **M**. `change directo`. El warning ordena usar `searchMemory` (`engine.js:144`) pero el orquestador no tiene esa tool (`orchestrator.md:6-11`) y tiene prohibido llamarla (`:154`); además el bloque se declara "datos no confiables" (`:149`), así que la instrucción no es accionable. Impacto: 7/9 sesiones no recuperaron memoria; 104 reglas omitidas; el caso más caro shippeó una carrera de datos.

3. [ ] **Propagar memoria y reglas de entorno en cada delegación** — `agents/orchestrator.md`. **S**. `change directo`. El contrato de delegación solo distribuye campos del envelope (`orchestrator.md:140`) y reserva la memoria a `@memory-keeper` (`:154`); no exige pasar reglas relevantes ni un bloque de entorno al subagente. Impacto: 7/9 sesiones redescubrieron reglas ya guardadas (Jest, worktree, CRLF, shell).

4. [ ] **Serializar subagentes que escriben** — `agents/orchestrator.md`. **S**. `change directo`. No hay invariante de exclusión mutua para escritores; el cierre paraleliza archive y memoria (`orchestrator.md:275`) sin prohibir dos `@documenter` a la vez. Impacto: 3 archives perdidos en una sesión (los tres reportaron éxito y solo persistió el último).

5. [ ] **Intake de sesión con estado del árbol** — `agents/orchestrator.md`. **S**. `change directo`. No hay paso de `git status`/worktree al inicio; el "Active Change Check" solo mira `aspec/changes/` (`orchestrator.md:100-114`). Impacto: 7/9 sesiones arrancaron con trabajo ajeno; una perdió una corrida completa de verificación.

6. [ ] **Presupuesto de verificación y orden archive/merge** — `agents/orchestrator.md` + `skills/ancleto-archive`. **M**. `explore`. `@tester` ya prohíbe repetir el mismo comando (`agents/tester.md:136`), pero no hay tope de corridas por punto de integración ni orden canónico archive/merge; el archive no lo define (`skills/ancleto-archive/SKILL.md:51-56`). Impacto: ~9 corridas completas en una sesión; dos merges y dos verificaciones por archivar después del merge.

7. [ ] **Checkpoint de definición, alcance y métricas** — `agents/orchestrator.md` + `agents/spec-writer.md`. **M**. `change directo`. El checkpoint solo exige aprobación tras `@spec-writer` (`orchestrator.md:270`); no exige declarar la definición operativa de cada término/métrica, su fuente de lectura, ni las filas/valores de un paso destructivo. Impacto: 6/9 sesiones con ambigüedad de alcance; un pase completo de specs quemado por dos definiciones de "Gastado"; ~10 docs reescritos por un modelo de ambientes no validado.

8. [ ] **Precedencia del techo de 3 lecturas** — `agents/orchestrator.md`. **S**. `change directo`. El techo es absoluto y no distingue contexto no dirigido de una instrucción del usuario que nombra archivos (`orchestrator.md:54`, `:88`). Impacto: 4/9 sesiones lo excedieron o tuvieron que justificarlo; en una, la instrucción explícita del usuario prevaleció informalmente.

9. [ ] **Review packet y evidencia de "done"** — `agents/orchestrator.md` + `agents/reviewer.md` + `agents/documenter.md`. **M**. `change directo`. El orquestador pasa envelope, affected-set y ledger, pero no el diff (`orchestrator.md:273`, `:284`); el reviewer no tiene bash (`reviewer.md:7-12`, `:100`) y el documenter no exige diff/grep para afirmar "actualizado" (`documenter.md:140-149`). Impacto: 4/9 reviews sin evidencia; docs declarados "actualizados" sin serlo y 3 rondas de corrección.

10. [x] **Bloque de entorno por plataforma en AGENTS.md** — `templates/AGENTS.md` + `src/cli`. **M**. `change directo`. El template no tiene sección de entorno/shell y `copyTemplates` copia texto estático (`index.js:1495-1510`); `process.platform` solo se usa para resolver binarios (`:514`, `:518`). Puede detectarse win32/PowerShell/CRLF en `init`/`install` y mergearse como bloque LOCKED. Impacto: 5/9 sesiones con errores de shell (npm `.CMD` 3 veces, sin `rg`, heredocs, CRLF redescubierto).
  **Hecho (`machine-environment-block`):** resuelto con un diseño distinto al propuesto — artefacto derivado local `.ancleto/machine-env.md` (shell, EOL y tooling con fallbacks), regenerado en `init`/`install --project`/`upgrade`, excluido de git vía `.git/info/exclude` y entregado verbatim a los subagentes; **no** se usó un bloque LOCKED en `AGENTS.md`. Spec: `aspec/specs/machine-environment/spec.md` (7 requirements / 47 scenarios). Change: `aspec/changes/archive/2026-10-25-machine-environment-block/`.
  **Activación:** 2026-10-26 — `node src/cli/index.js upgrade` (CLI 0.15.0) generó `.ancleto/machine-env.md` (no versionado) + reinicio de sesión; las definiciones de agentes se cachean al inicio, así que la ventana empieza en el reinicio, no en el upgrade.
  **Línea base local (pre-activación, `--since 2026-10-25`):** `env` 7 parts / 3 grupos / 6 de 14 sesiones (50 por 100 sesiones); `rg` presente (4 parts / 3 sesiones); `unknown` 0.
  **Re-medición:** `ancleto stats failures --class env --since 2026-10-26` (mismo alcance `session.directory`; comparar con 68/105 del proyecto auditado y 50/100 local; éxito ≤32/100 con ≥10 sesiones nuevas y sin reaparición de `rg`/`node`; <10 sesiones = inconcluso).
  **Estado al 2026-10-26:** inconcluso — 0 sesiones post-activación.

11. [ ] **Guards mecánicos: EOL y merge markers** — `skills/` + `templates/`. **M**. `explore`. No existe guard propio de Ancleto; el marcador de conflicto se commiteó en un documento operativo y el CRLF rompió `bash -n` dos veces. Definir si va como paso de `ancleto-verify`/`ancleto-review`, scaffold de `.gitattributes` o chequeo de `doctor`. Impacto: alto (se podía ejecutar el prompt equivocado; el bug se repitió).

12. [ ] **Orden y presupuesto del working-context** — `src/core/memory/engine.js`. **L**. `explore`. `buildWorkingContext` ordena por scope y `created_at DESC` (`engine.js:124`) y corta por el primer excedente (`:131-140`), sin prioridad ni ranking. En App Registros TC: 125 reglas project activas, 51.001 chars; el bloque completo serían ~54.126 chars (~13.5k tokens) contra 8.000 chars (2.000 tokens); entran 22 y quedan afuera 103 (el archivo declara 104). Las 44 reglas más antiguas son el 50% del contenido y quedan todas afuera.

13. [ ] **Detección de duplicados/stale y consolidación de memoria** — `src/core/memory/` + `agents/memory-keeper.md`. **L**. `explore`. `memory gc` solo purga superseded (`engine.js:340-369`); `doctor` compara únicamente `memory_key` activo (`doctor.js:44-50`), que el índice único ya hace imposible (`database.js:19-20`). No hay detección de contenido casi-duplicado: en la DB auditada hay 3 grupos de contenido idéntico con claves distintas. `@memory-keeper` dice que la deduplicación es del engine y no hace recall previo (`memory-keeper.md:55`). Impacto: 5/9 sesiones con memoria duplicada/stale; agrava el truncado.

14. [ ] **Skill de auditoría de sesión** — `skills/`. **M**. `change directo`. Las 9 auditorías se hicieron con prompts ad-hoc distintos; no hay skill que estandarice evidencia (`file:line`), clasificación por dueño y detección de reglas parche. Impacto: institucionaliza el ciclo de mejora y evita que cada auditoría redescubra el formato.

15. [x] **Detección mecánica de comandos fallidos en `ancleto stats`** — `src/`. **S/M**. `change directo`. La tabla `part` de la DB de opencode guarda `data.type='tool'`, `tool`, `state.status`, `input.command`, `output` y `metadata.exit`; `ancleto stats` solo lee `session`/`message` (`src/cli/index.js:2773`, `:2790-2802`). Agrupar `state.status='error'` + `input.command` permite detectar comandos fallidos repetidos sin depender del auto-reporte del agente (en la DB auditada: 501 errores sobre 64.362 completados, 21.402 `bash`). Impacto: habilita auditorías mecánicas y alimenta la skill del ítem 14. **Hecho:** change `session-failure-report` archivado en `aspec/changes/archive/2026-10-25-session-failure-report/`; spec `aspec/specs/session-failure-report/spec.md`.

16. [ ] **Comandos denegados por la política del runtime no se capturan ni se clasifican** — `src/cli/index.js` (`stats failures`) + permisos del agente. **S/M**. `explore` con línea base primero. La política del runtime deniega comandos (p. ej. `git checkout`, que hubo que sustituir por `git switch`) y ese rechazo no queda en ninguna clase de `stats failures` (`env`/`check`/`tool`/`unknown`): el agente lo descubre por ensayo y error y el fallo es invisible para la medición. Propuesta: contar los comandos denegados como línea base en `stats failures` y determinar en qué clase caen — probablemente en ninguna — antes de decidir la capa; el dueño parece ser `stats` + permisos del agente, **no** `machine-env`, que declara shell/EOL/tooling pero no denegaciones. Impacto: hoy una denegación cuesta un turno y no se mide.

17. [ ] **Guía `searchMemory` residual en superficies mergeadas vs. el nuevo warning de overflow** — `AGENTS.md` + `PRODUCT.md` + `templates/AGENTS.md` + `templates/PRODUCT.md`. **M**. `change` (spec-required: toca rutas de merge). Cuatro superficies siguen dando el consejo viejo que el warning nuevo ya no da: `AGENTS.md:34-36` y `templates/AGENTS.md:45-47` (el bullet de `<ContextOverflowWarning>` que dice "el warning indica explícitamente usar `searchMemory` para recuperar lo omitido"), `PRODUCT.md:32-33` y `templates/PRODUCT.md:30-31` (bloque `AI Memory`: "Consult via the `searchMemory` tool … after a `<ContextOverflowWarning>`") y `PRODUCT.md:95` (guardrail "Protocolo de memoria reactiva": invocar `searchMemory` "ante un `<ContextOverflowWarning>`"); `AGENTS.md` y `PRODUCT.md` de la raíz son generados desde `templates/` por la ruta de merge, así que tocar el template no alcanza. Restricción de mecanismo: des-hardcodear un contrato en superficies mergeadas exige envolver el texto canónico en un bloque `LOCKED` y reconciliar el texto plano legacy en toda ruta que mergea `TEMPLATES` — `copyTemplates` (install/update/upgrade) e `importCmd` — que desembocan en el punto único `mergeTemplateInto` → `reconcileLegacyBlocks` (`src/cli/index.js`); llamar `mergeLocked` directo sobre `TEMPLATES` reintroduce la coexistencia del guide viejo con el bloque canónico. Impacto: tras un overflow, los propios agentes del repo todavía reciben la instrucción de llamar una tool que el orquestador no tiene; el change `orchestrator-session-start` corrigió el texto del warning pero no estas cuatro superficies, y `ancleto upgrade` re-aplica `templates/`, así que la obsolescencia persiste entre regeneraciones.

18. [ ] **El bump de versión deja el technical seed `STALE`/`material` de forma sistemática** — `src/cli/index.js` (`MATERIAL_FILE_RES`, `checkStaleness`) + `docs/technical-discovery/` + release checklist. **S**. `explore`. `ancleto discovery --check` clasifica `package.json` como archivo material (`index.js:1921`), así que cualquier bump de versión —aunque solo cambie el campo `version`— pasa el seed a `STALE` con `impact: material` y `materialReasons: ["archivo material modificado: package.json"]` (`:1966`, `:1980`). Los docs del seed además conservan literales de la versión anterior (`index.md`, `overview.md`, `setup.md`, `inventory.md`, `integrations.md`, `decisions.md`, `unknowns.md`, `units/*`). Instancia observada: tras el bump a `0.15.2` (`e54ccba`) quedó `STALE`/`material` y los docs siguen en `0.15.1`; se dejó sin regenerar a propósito. Impacto: bajo (artefacto derivado y regenerable), pero cada release termina con el seed desactualizado y con literales de versión viejos que nadie nota hasta que un agente lo consulta. Decisión pendiente: ¿el cambio de `version` en `package.json` deja de contar como material, o la regeneración del seed pasa a ser parte del checklist de release?