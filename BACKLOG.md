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
- ✅ KB MCP neutralizado (opsx-*, kb-context.md)
- ✅ Templates `AGENTS.md` / `PRODUCT.md` para proyectos nuevos (`CONTRIBUTING.md` eliminado: sus validaciones y reglas de commit pasaron a `AGENTS.md`)
- ✅ Rama `development` + `main` protegida
- ✅ Relevamiento de `lnx` CLI (fuente en `documentation/lnx-cli/`)
- ✅ **G1**: skills `triage-clarifier`, `openspec-recall`, `openspec-sync-specs` portadas (adaptadas, sin branding LN)
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
- ✅ **Suite de tests**: 26 tests `node --test` (unit + integración) en `test/memory-engine.test.js`
  (supersesión atómica + genealogía, sync FTS5 INSERT/UPDATE/DELETE, una sola activa por `memory_key`,
  encapsulamiento, diacríticos sin stemmer, escape de caracteres FTS5, XML de `<ProjectMemoryRules>`,
  scopes `project/feature/task` con match exacto) + smoke de creación de DB y triggers — **26/26 verdes, sin warnings**.
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

## Estado actual (v0.3.0)

- Working tree **limpio** en `main` y `development`.
- `development` mergeada en `main` + tag `v0.3.0` pusheado.
- `.ancleto/` ignorado en `.gitignore` (no se versionan bases de datos locales).
- CI/CD configurado (`publish.yml`): espera Release de GitHub para publicar a npm.

## En curso / próximo

- [ ] Confirmar publish de `v0.3.0` en npm (Release de GitHub pendiente — dispara `publish.yml`)

## v0.3.0 - Agent Memory Integration

Integración de la memoria persistente con el orquestador y los AI agents.

- [x] `core/orchestrator`: Integrar `buildWorkingContext()` para inyectar `<ProjectMemoryRules>` en el System Prompt. ✅ — implementado (commit `a17fc66`)
- [ ] `core/memory`: Implementar política de token overflow / truncamiento seguro al recuperar reglas.
- [ ] `templates/AGENTS.md`: Agregar protocolo reactivo indicando cuándo los agentes deben llamar a `searchMemory`.
- [ ] `cli/memory`: Agregar comando/subcomando `ancleto memory doctor` para verificar integrity check y rebuild de FTS5.
- [ ] Complementos ya trackeados (se ejecutan dentro de v0.3.0): `openspec-recall` → `searchMemory`, `memory-keeper` → tools del motor

## v0.3.0 (candidatos adicionales)

Candidatos priorizados (antes feature-creep, ahora con CI/CD de soporte):

- [ ] **G3** `ancleto check` (integridad de instalación vs manifiesto, orphans)
- [ ] **G4** `ancleto doctor` (diagnóstico de binarios/MCPs/modelos)
- [ ] **G5** Scaffold OpenSpec en install/init (`openspec/changes/` + `config.yaml`)
- [ ] **G6** Manifiesto `.ancletorc` completo (`installedPaths`, `version`, `installedAt`)
- [ ] **G7** LOCKED/EXTENSIBLE en templates (re-aplicación de secciones LOCKED)
- [ ] **G8** Azure MCP opcional (`@azure-devops/mcp` cuando `azure.enabled`)
- [ ] **Pulido**: `.gitattributes` para line-endings (evitar warnings LF/CRLF), tests del CLI
      (install/update/init/merge MCP/tiers), documentar flujo de release en el repo

## Decisiones pendientes

- ~~Memoria: ¿adaptar a engram o dejar sin memoria?~~ → **Resuelta (v0.2.0)**: motor propio
  con `node:sqlite`, diseño congelado en `DESIGN-memory-engine-v0.2.0.md`. Revisar el
  contrato de `openspec-recall` al implementar.
- ~~Alcance del motor `discovery` (G2): ¿implementación completa o MVP (solo `--check`)?~~ → **Resuelta**: MVP (`--check` por hash) — implementado en G2, ver `Hecho`.
- ¿Portar las otras 11 skills base (`openspec-apply/archive/bulk-archive/continue/explore/ff/new/onboard/propose/verify/workflow`)? Los opsx ya son autocontenidos — solo si suman desde otros agents
- Qué modelos van en cada tier (tabla `TIERS` en `src/cli/index.js` es ajustable)

## Ideas de colaboradores

- Lucas: tener en cuenta modelos gratuitos (implementado: tier `gratis`, default `opencode/big-pickle`)
- Gemini: aislar scope v0.1.1 (G3-G8 parked), Flash para G1, Pro para G2 (adoptado)