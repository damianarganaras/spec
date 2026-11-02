---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-02T12:11:50Z
pluginVersion: 0.18.2
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto` / alias `aspec`).
No es un inventario exhaustivo: enruta a la respuesta más corta. Evidencia base: pack Repomix
(`--compress`, tier resuelto `minimo`, 722 archivos, ~17.790 tokens), `package.json`
(`0.18.2`), release `8d23dbe` (`chore(release): 0.18.2`), tag anotado `v0.18.2` en `main`
(`41d2313`, merge de `development`), HEAD `d2138df` en `development`
(`docs(backlog): cierra CH-11 y MEM-07`, 1 commit adelante de `origin/development`),
`.discovery-map.json` (`total_files: 734`) y lectura puntual de los archivos citados en cada
documento, incluidos `agents/`, `skills/`, `docs/`, `aspec/` y `test/` (fuera del pack por el
tier).

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tiers, tests, contrato de validaciones | `setup.md` |
| Reglas de negocio, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias privadas observables (npm, GitHub, Repomix, MCP, git) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills, commands) con propósito y entry point | `units/_map.md` |
| **Entorno de máquina**: `.ancleto/machine-env.md`, shell/EOL/tooling, **sonda de invocabilidad** (disponible = resoluble e invocable), exclusión local sin tocar `.gitignore`, entrega a subagentes | `setup.md`, `decisions.md`, `units/cli-install.md` |
| **Rutas por host (`AGENT_TARGETS`), adaptación de frontmatter (incl. Command Code), commands como skills, MCP de host, merge de templates y bloques LOCKED, portabilidad** | `units/cli-install.md` |
| Motor de memoria persistente (SQLite + FTS5, tools del LLM, working-context, procedencia `source`), **refs normalizadas y validación fail-closed**, **promoción al archivar**, **export/import/gc**, **snapshot**, **merge**, **refresh on-write CLI**, **doctor read-only con cinco checks** | `units/memory-engine.md` |
| **`memory doctor` de cinco checks** (`Integridad DB`, `Indice FTS5`, `Reglas activas (unicidad)`, `Refs de nodos activos`, `Checkpoint WAL`) y auditoría read-only de refs `spec:`/`change:`/`path:` | `units/memory-engine.md`, `decisions.md` |
| **Resolver de refs navegables** (`resolveNodeRefs`, `MEM-04b`): ubicación repo-relativa de `change:` activo/archivado, `spec:` con heading real, `path:` normalizado, `commit:`/`workitem:` no verificables | `units/memory-engine.md`, `decisions.md` |
| **Reglas de escritura de memoria**: bloque `refs:` obligatorio, gramática cerrada (`spec:`/`change:`/`path:`/`commit:`/`workitem:`), **items indentados o no**, resolución y ambigüedad, exención `runtime`, rechazo de secretos | `units/memory-engine.md`, `decisions.md` |
| **Promoción de decisiones al archivar** (`proposal ## Decisiones` aprobadas, preflight, cero candidatos ⇒ cero escrituras, orden respecto del merge de specs) | `decisions.md`, `units/memory-engine.md`, `units/cli-install.md` |
| Discovery, empaquetado Repomix, impacto del seed, **affected-set determinístico (grafo de imports, `ancleto affected`)** y tiers de tokens | `units/discovery-engine.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, migración legacy, MCP, `stats failures` | `units/cli-install.md` |
| **Reporte de fallos de herramientas** (`ancleto stats failures`: clases `env`/`check`/`tool`/`unknown`, privacidad) | `integrations.md`, `decisions.md`, `units/cli-install.md` |
| Pipeline de throughput del ciclo SDD (paralelización `@documenter` ∥ `@memory-keeper`, Validation Ledger, memoria en un paso) | `decisions.md`, `units/cli-install.md` |
| **Checkpoint de contrato** tras `@spec-writer` (siete campos, <1 pantalla, sin enumerar documentos; la aprobación autoriza solo implementar; enmienda ante cambio de alcance/riesgo/arquitectura) | `decisions.md`, `overview.md` |
| **Sección `## Decisiones` del proposal** (seis campos o línea equivalente, shape único en `@spec-writer`, se completa también durante la implementación) | `decisions.md`, `units/_map.md` |
| **Set de artifacts de un change** (solo `proposal.md`, `tasks.md`, `specs/`; `design.md`/`context.md` retirados sin sucesor; legacy opcional, nunca precondición; archivar mueve sin borrar) | `decisions.md`, `overview.md` |
| Working-context día-cero, refresh on-write (MCP/CLI), staleness advisory y **render de reglas sin el bloque `refs:`** | `units/memory-engine.md`, `overview.md` |
| **Arranque de sesión del orquestador**: intake de sesión (changes activos + `git status --short` delegado), techo de lecturas (3 archivos + exenciones), allowlist de `bash` de `@technical-discovery` | `decisions.md`, `overview.md`, `units/_map.md` |
| **`<ContextOverflowWarning>`**: qué emite, quién lo consume y qué guía residual sigue en `PRODUCT.md`/templates | `units/memory-engine.md`, `decisions.md` |
| **`opencode.json` de la raíz**: override de `agent.model` para los 10 subagentes (incluye el orquestador desde `0.18.1`) | `setup.md`, `decisions.md`, `inventory.md` |
| **Cambiar el `model:` de los agentes**: tres superficies (canónica `agents/*.md`, mirror `.opencode/agents/*`, global `~/.config/opencode/agents/*`), precedencia de `opencode.json` solo sobre el agente primario y verificación con `Select-String` | `setup.md`, `decisions.md`, `units/cli-install.md` |
| Análisis de costo de tokens y decisión pendiente de "token-economy" | `optimizacion-de-tokens.md` (raíz) |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bin `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs con descubrimiento técnico, memoria persistente local,
  entorno de máquina derivado y control de costo por tier. **8 hosts**: opencode (default),
  claude, vscode, antigravity, cursor, roo, copilot y commandcode.
- **Versión observada**: `0.18.2` (`package.json`); release `8d23dbe` (`chore(release): 0.18.2`)
  y tag **anotado** `v0.18.2` en `main` (`41d2313`, merge de `development`). `v0.18.1` apunta a
  `a240d6a` y `v0.18.0` a `75373a`. HEAD `d2138df` en `development`, **1 commit adelante** de
  `origin/development`; `git describe --tags` da `v0.16.0-25-gd2138df`.
- **Publicación**: `0.18.0` publicó el quinto check de `memory doctor` (MEM-04); `0.18.1`
  sincronizó el discovery map y mapeó al orquestador en `opencode.json`; `0.18.2` es
  **docs-only** (severidad de review, slug de `change:` y referencia única en `spec-writer`).
  No hay cambios de código en `0.18.2`.
- **MEM-04b en el árbol de trabajo**: el change activo
  `mem-04b-resolver-referencias-navegables` está **implementado y verificado pero sin commitear**:
  `src/core/memory/engine.js` expone `resolveNodeRefs`, y `test/` + fixtures lo cubren. No está
  publicado ni archivado. Evidencia: `git status`, `aspec/changes/mem-04b-*`.
- **Tier resuelto**: `minimo` vía `.opencode/.ancleto-tier`; decide modelos de los agents y el
  pack (`--compress`, ignora `test/**`, `docs/**`, `**/*.md`, **sin token budget**; solo
  `gratis` fija 50k). Pack de esta corrida: **722 archivos, ~17.790 tokens**.
- **Linter**: ESLint 10 como **devDependency** (flat config `eslint.config.js`, 4 reglas);
  scripts `npm run lint` y `npm test`; no agrega dependencias de runtime.
- **Contrato de validaciones declarativo**: se corre **solo** lo declarado en `PRODUCT.md` →
  `## Project Commands`; format check `not-configured`; tests por el comando declarado o rutas
  explícitas (nunca `node --test` pelado). Fuente: `AGENTS.md` / `templates/AGENTS.md` →
  bloque `LOCKED: validation-commands`. Detalle: `setup.md`.
- **Módulo puro de frontmatter**: `src/core/adapters/frontmatter.js` es el **dueño único** de la
  transformación de frontmatter (`adaptFrontmatter`); `src/cli/index.js` lo importa.
- **Memoria**: 3 tools del LLM (`searchMemory`, `recordRule`, `recordDecision`) + operaciones
  `memory export|import|gc|snapshot|merge|context|list|doctor` sobre `.ancleto/memory.db`.
  `source` es procedencia runtime-owned. **Toda escritura que pasa por `recordNode` valida
  refs normalizadas de forma fail-closed**, salvo `source === 'runtime'`; `cli:import` queda
  fuera porque usa `importNodes` (LWW). Los items del bloque `refs:` pueden ir **indentados o
  no**. `<ProjectMemoryRules>` renderiza solo la prosa de cada regla, sin el bloque `refs:`.
  **`memory doctor` audita cinco checks en read-only**, incluido `Refs de nodos activos` con
  `inspectRefs`. Detalle: `units/memory-engine.md`.
- **Resolver de recall (`MEM-04b`)**: `resolveNodeRefs({ content, projectRoot })` es una API
  **read-only** exportada por `src/core/memory/engine.js`; reutiliza `parseRefsBlock` y
  `resolveRefResult` (sin segundo parser). Devuelve por ref `raw`, `kind`, `verifiable` y, si
  aplica, `ok`, `path`, `heading`, `reason` o `matches`. `change:` devuelve el path
  repo-relativo; `spec:` devuelve el `spec.md` y el **heading real**; `path:` se normaliza
  (separadores `/`, sin `:línea`) antes del chequeo de existencia; `commit:`/`workitem:` quedan
  `verifiable: false`. `inspectRefs`, `validateRefsForWrite` y `doctor.js` **no cambiaron**.
- **Golden M04/M05/M06 activas**: `test/fixtures/memory/golden.json` las marca `active` con
  `expected.mode: "refs"`; usan `test/fixtures/memory/golden-refs-seed.json` y
  `test/fixtures/memory/refs-root/`. M01/M07 siguen activas; M02/M03/M08/M09/M10 quedan
  diferidas. Evidencia: `test/memory-fixtures.test.js`, `golden.json`.
- **Promoción al archivar**: solo decisiones de `proposal ## Decisiones` con `memory_key`
  propia y `Estado: aprobado`; preflight del lote antes de escribir; sin candidatos ⇒ cero
  escrituras y cero delegación; corre **después** del merge de specs y nunca en paralelo.
- **Entorno de máquina**: `src/core/machine-env.js` es el **dueño único** de detectar, renderizar,
  escribir y excluir `.ancleto/machine-env.md` (plataforma, shell, EOL, tools). La disponibilidad
  de una herramienta exige ser **resoluble e invocable** (sonda `--version` acotada: 2 s por
  intento, 10 s acumulados), no solo estar en `PATH`. Se regenera en `init`, `install --project`
  y `upgrade`; la exclusión usa `info/exclude` y **nunca** toca `.gitignore`. En este checkout el
  artefacto declara `ancleto: 0.18.0` (generado el 2026-11-01).
- **Merge de templates**: `mergeTemplateInto` reconcilia bloques planos legados **antes** de
  `mergeLocked`; punto único de `install`/`update`/`upgrade` (vía `copyTemplates`) e `import`.
- **Instalación por host**: `AGENT_TARGETS` es la fuente única de rutas (skills/agents/commands)
  por IDE; el frontmatter de agents se adapta por host. Detalle: `units/cli-install.md`.
- **Contratos de prompt del orquestador** (`agents/orchestrator.md`): **intake de sesión**
  (changes activos excluyendo `archive/`; un único `git status --short` delegado a
  `@technical-discovery` sólo cuando el pedido toca el estado del repo; silencio si no hay nada
  que reportar), **techo de lecturas** (3 archivos no dirigidos; exentos el working-context y el
  machine-env, más hasta 5 archivos nombrados explícitamente por el usuario **por mensaje**; el
  sexto se delega), **Recall único** ante `<ContextOverflowWarning>` y **checkpoint de
  contrato** tras `@spec-writer`. Detalle: `decisions.md`.
- **`## Decisiones` en `proposal.md`**: shape único en `agents/spec-writer.md` (bloque de seis
  campos o forma de una línea equivalente) emitido por los generadores del proposal y
  completado también durante la implementación.
- **Affected-set determinístico**: `src/core/affected-set.js` computa la clausura transitiva de
  **dependientes** sobre el grafo de imports (zero-dep, determinista) y
  `ancleto affected [--cwd <dir>] [--json] <archivo...>` la expone **read-only**. Detalle:
  `units/discovery-engine.md`.
- **Reporte de fallos**: `ancleto stats failures` lee en solo lectura los tool parts de opencode,
  clasifica `env`/`check`/`tool`/`unknown`, agrupa por proyecto/herramienta/clase/esqueleto y
  enmascara secretos y rutas. Spec `aspec/specs/session-failure-report/spec.md`.
- **`opencode.json` (raíz)**: baseline commiteado con override de `agent.model` a
  `commandcode/deepseek/deepseek-v4.1-flash` para los **10 subagentes** (incluye `orchestrator`
  desde `0.18.1`). El árbol de trabajo **no** tiene cambios pendientes en ese archivo. No forma
  parte del paquete publicado: `package.json` → `files` no lo lista.
- **`AGENTS.md`**: **cuatro** bloques `LOCKED` de reglas compartidas (`validation-commands`,
  `memory-boundary`, `artifacts-language`, `seed-freshness`) + `test-block`, y la sección
  **`## Cambiar el modelo de los agentes`** (tres superficies del `model:`, precedencia de
  `opencode.json` sobre el agente primario y verificación con `Select-String`).
- **Set de artifacts**: el flujo nuevo produce **tres** artifacts (`proposal.md`, `tasks.md`,
  `specs/`); `design.md` y `context.md` se retiraron **sin sucesor** y una decisión durable va a
  `proposal.md ## Decisiones`. El retiro está **publicado desde `0.17.1`**; los changes anteriores
  que sí tuvieron `design.md` lo conservan intacto en el archive.
- **Ciclo SDD**: 16 comandos `/cleto-*` y 21 skills nativas; `aspec/` tiene **19 specs fuente**,
  **2 changes activos** (`ancleto-vscode-extension` y `mem-04b-resolver-referencias-navegables`)
  y **35 archivados** (el último, `2026-11-01-clarificaciones-spec-severidad-y-refs`).
- **Este checkout**: `.ancletorc` y `.opencode/` existen (gitignored, no versionados).
  Persiste `.ancleto/memory.db` y **`.ancleto/machine-env.md`** (generado el 2026-11-01 con
  `ancleto: 0.18.0`).
- **Rama de trabajo**: `development`; `main` declarada protegida en `AGENTS.md` (no se verificó
  protección real en el remoto).
- **Sin backlog raíz**: `BACKLOG.md` no existe. El backlog P0 de la reingeniería de memoria
  vive en `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` (CH-11 y MEM-07 cerrados en `0.18.2`;
  `§5.2` conserva la deuda de I/O de `inspectRefs` y el conteo de no verificables con rotas).
- **Doc de análisis raíz**: `optimizacion-de-tokens.md` (no es runtime; mide costo de tokens y
  deja una decisión abierta sobre la promesa "optimizador de tokens").
- **No material para el seed**: `audit logs/` (untracked) y `documentation/` (legado
  gitignored) aparecen en el estado del discovery por cómo se recorren las fuentes, pero **no**
  aportan evidencia al mapa y no se tratan como áreas materiales. Ver `unknowns.md`.

Antes de afirmar un detalle fino o reciente, abrir el archivo citado en cada documento.
