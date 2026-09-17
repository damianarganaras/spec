# Backlog

Seguimiento de qué se hizo y qué falta en `@ancleto/spec`. La fuente de verdad es la rama
`development`; `main` queda estable (protegida). Los avances se publican a npm cuando
cerramos un milestone (`npm version minor|patch && npm publish`).

## Hecho

- [x] Paquete `@ancleto/spec@0.1.0` publicado en npm + repo `github.com/damianarganaras/spec`
- [x] Rebranding completo LN → ancleto (sin referencias corporativas)
- [x] Modelos de los 10 agents adaptados al catálogo opencode-go (costo/tokens)
- [x] CLI: `install [--project]`, `update`, `init [--with-azure]`, `--no-mcp`, `--tier`
- [x] MCP **engram** + **caveman** configurados por defecto al instalar (fusión no destructiva)
- [x] Tiers de costo `normal | minimo | gratis` (prompt en la 1ra config, persistidos en `.ancleto-tier`)
- [x] Azure DevOps **opcional** (off por defecto): gate en `.ancletorc`, `ancleto-pr` usa GitHub
- [x] KB MCP neutralizado (opsx-*, kb-context.md)
- [x] Templates `AGENTS.md` / `PRODUCT.md` / `CONTRIBUTING.md` para proyectos nuevos
- [x] Rama `development` + `main` protegida
- [x] Relevamiento de `lnx` CLI (fuente en `documentation/lnx-cli/`)
- [x] **G1**: skills `triage-clarifier`, `openspec-recall`, `openspec-sync-specs` portadas (adaptadas, sin branding LN)
- [x] **G2**: motor `ancleto discovery` (MVP) — pack con Repomix (`npx` o PATH, `--include/--ignore/--compress/--token-budget`), `--check` por hash de contenido (READY/STALE/PARTIAL/MISSING), estado en `.discovery-state.json`, zero-deps
- [x] **M1**: Motor de Memoria Persistente (core v0.2.0) — `src/core/memory/database.js` (node:sqlite, PRAGMAs WAL/FK/busy_timeout, migraciones idempotentes, FTS5 external content `unicode61 remove_diacritics 1` sin stemmer, triggers INSERT/UPDATE/DELETE), `engine.js` (`buildWorkingContext`, `searchMemory` BM25 con escape FTS5, `recordNode` con supersesión atómica `BEGIN IMMEDIATE` por `memory_key` + índice único parcial sobre activas), `tools.js` (3 tools con encapsulamiento de `source/confidence/status/id`), 22 tests `node --test`

## En curso / próximo

- [ ] Integrar el motor de memoria en el framework: wiring en CLI/orchestrator, `openspec-recall` →
      `searchMemory`, `memory-keeper` → tools del motor (el contrato agnóstico mem0/engram queda obsoleto)
- [ ] Republish a npm cuando haya milestone (version minor por features)

## Out of scope v0.1.1 (parked, decisión de Gemini + lean-build)

Estos gaps de lnx se documentaron pero NO se implementan en esta versión — riesgo de feature creep:

- [ ] **G3** `ancleto check` (integridad de instalación vs manifiesto, orphans)
- [ ] **G4** `ancleto doctor` (diagnóstico de binarios/MCPs/modelos)
- [ ] **G5** Scaffold OpenSpec en install/init (`openspec/changes/` + `config.yaml`)
- [ ] **G6** Manifiesto `.ancletorc` completo (`installedPaths`, `version`, `installedAt`)
- [ ] **G7** LOCKED/EXTENSIBLE en templates (re-aplicación de secciones LOCKED)
- [ ] **G8** Azure MCP opcional (`@azure-devops/mcp` cuando `azure.enabled`)

## Pulido (P2)

- [ ] `.gitattributes` para line-endings (evitar warnings LF/CRLF)
- [ ] Tests del CLI (install/update/init/merge MCP/tiers)
- [ ] Documentar flujo de release en el repo

## Decisiones pendientes

- ~~Memoria: ¿adaptar a engram o dejar sin memoria?~~ → **Resuelta (v0.2.0)**: motor propio
  con `node:sqlite`, diseño congelado en `DESIGN-memory-engine-v0.2.0.md`. Revisar el
  contrato de `openspec-recall` al implementar.
- Alcance del motor `discovery` (G2): ¿implementación completa o MVP (solo `--check`)?
- ¿Portar las otras 11 skills base (`openspec-apply/archive/bulk-archive/continue/explore/ff/new/onboard/propose/verify/workflow`)? Los opsx ya son autocontenidos — solo si suman desde otros agents
- Qué modelos van en cada tier (tabla `TIERS` en `src/cli/index.js` es ajustable)

## Ideas de colaboradores

- Lucas: tener en cuenta modelos gratuitos (implementado: tier `gratis`, default `opencode/big-pickle`)
- Gemini: aislar scope v0.1.1 (G3-G8 parked), Flash para G1, Pro para G2 (adoptado)