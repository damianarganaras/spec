---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-03T10:45:00Z
pluginVersion: 0.18.6
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto` / alias `aspec`).
No es un inventario exhaustivo: enruta a la respuesta más corta. Evidencia base: pack Repomix
(`--compress`, tier resuelto `minimo`, **740 archivos, ~19.907 tokens**), `package.json`
(`0.18.6`), `CHANGELOG.md` (hasta `0.18.6`), `.discovery-map.json` (`total_files: 752`), el
reporte `ancleto discovery --check` y lectura puntual de los archivos citados en cada documento,
incluidos `agents/`, `skills/`, `aspec/`, `test/` y `.ancleto/` (fuera del pack por el tier).

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tiers, tests, contrato de validaciones | `setup.md` |
| Reglas de negocio, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias privadas observables (npm, GitHub, Repomix, MCP, git) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills, commands) con propósito y entry point | `units/_map.md` |
| **Entorno de máquina**: `.ancleto/machine-env.md`, shell/EOL/tooling, sonda de invocabilidad, exclusión local sin tocar `.gitignore` | `setup.md`, `decisions.md`, `units/cli-install.md` |
| **Rutas por host (`AGENT_TARGETS`), adaptación de frontmatter (incl. Command Code), commands como skills, MCP de host, merge de templates y bloques LOCKED, portabilidad** | `units/cli-install.md` |
| **Reconciliación de superficies planas legadas**: gate por `requiresInSource`, enmascarado de bloques `LOCKED`/code fences, inserción con una línea en blanco | `units/cli-install.md`, `decisions.md` |
| Motor de memoria (SQLite + FTS5, tools, working-context, procedencia `source`), refs normalizadas y fail-closed, promoción al archivar, export/import/gc, snapshot, merge, **consolidate** | `units/memory-engine.md` |
| **`searchMemory` task-aware**: orden total, **preview** por defecto (≤240 chars, `limit` 5, `content_truncated`), `expand:true`, `keys`, `required` como entrada de llamada | `units/memory-engine.md`, `decisions.md` |
| **`memory gc` por edad de supersesión**: columna `superseded_at`, backfill histórico, `COALESCE(superseded_at, created_at)`, cutoff único y detach de `superseded_by` | `units/memory-engine.md`, `setup.md`, `decisions.md` |
| **Protocolo de memoria canónico** en `AGENTS.md` (`LOCKED: memory-protocol`), puntero único desde `PRODUCT.md`, aviso de overflow que no nombra `searchMemory` | `decisions.md`, `setup.md`, `units/memory-engine.md` |
| **`memory doctor` de cinco checks** (`Integridad DB`, `Indice FTS5`, `Reglas activas`, `Refs de nodos activos`, `Checkpoint WAL`) y auditoría read-only de refs | `units/memory-engine.md`, `decisions.md` |
| **Resolver de refs navegables** (`resolveNodeRefs`): `change:` activo/archivado, `spec:` con heading real, `path:` normalizado, `commit:`/`workitem:` no verificables | `units/memory-engine.md`, `decisions.md` |
| **Orden determinístico de inyección** (scope, anclaje, recencia, `memory_key`), presupuesto que incluye el aviso y manifiesto de omitidas (`+N`) | `units/memory-engine.md`, `decisions.md` |
| **`memory consolidate`**: duplicados exactos, canónico determinístico, `--dry-run` default, `--apply` por supersesión, near-dups sólo reporte | `units/memory-engine.md`, `setup.md`, `decisions.md` |
| **Reglas de escritura de memoria**: bloque `refs:` obligatorio, gramática cerrada, items indentados o no, resolución y ambigüedad, exención `runtime`, rechazo de secretos | `units/memory-engine.md`, `decisions.md` |
| **Promoción de decisiones al archivar** (`proposal ## Decisiones` aprobadas, preflight, cero candidatos ⇒ cero escrituras, orden respecto del merge de specs) | `decisions.md`, `units/memory-engine.md`, `units/cli-install.md` |
| Discovery, empaquetado Repomix, impacto del seed, affected-set determinístico y tiers de tokens | `units/discovery-engine.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, migración legacy, MCP, `stats failures` | `units/cli-install.md` |
| Pipeline de throughput del ciclo SDD, checkpoint de contrato, `## Decisiones` del proposal | `decisions.md`, `overview.md` |
| Working-context día-cero, refresh on-write (MCP/CLI), staleness advisory y render sin `refs:` | `units/memory-engine.md`, `overview.md` |
| Arranque de sesión del orquestador: intake, techo de lecturas, allowlist de `bash` | `decisions.md`, `overview.md`, `units/_map.md` |
| **`<ContextOverflowWarning>`**: qué emite, qué incluye y quién lo consume | `units/memory-engine.md`, `decisions.md` |
| **`opencode.json` de la raíz**: override de `agent.model` para los 10 subagentes | `setup.md`, `decisions.md`, `inventory.md` |
| **Cambiar el `model:` de los agentes**: tres superficies y precedencia limitada | `setup.md`, `decisions.md`, `units/cli-install.md` |
| Análisis de costo de tokens y decisión pendiente de "token-economy" | `optimizacion-de-tokens.md` (raíz) |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bin `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs con descubrimiento técnico, memoria persistente local,
  entorno de máquina derivado y control de costo por tier. **8 hosts**: opencode (default),
  claude, vscode, antigravity, cursor, roo, copilot y commandcode.
- **Versión observada**: `0.18.6` (`package.json`). HEAD `95b2599`
  (`docs(specs): archivar MEM-05a y MEM-05b y sincronizar source-of-truth`) en `development`;
  `git describe --tags` = `v0.18.5-14-g95b2599`, es decir **0.18.6 todavía sin tag**. El árbol de
  trabajo tiene cambios sin commitear en `src/cli/index.js`,
  `src/core/memory/{database,engine}.js`, `agents/memory-keeper.md`,
  `aspec/specs/{memory-engine,prompt-contracts}/spec.md` y tests.
- **Publicación**: `0.18.6` agrega **MEM-05 recall task-aware** (preview/`expand`/`keys`/
  `required`) y publica el **protocolo canónico de memoria** en `AGENTS.md`; MEM-05a
  (`searchmemory-docs-contract`) y MEM-05b (`gc-superseded-age`) están archivados. `0.18.5`
  publicó `memory consolidate`; `0.18.4` el orden por anclaje y las omisiones visibles; `0.18.3`
  `resolveNodeRefs`.
- **Memoria curada** (observado con `node src/cli/index.js memory doctor` y `memory list --json`):
  **125 nodos activos** (34 rules `project`, 78 decisions `project`, 13 decisions `feature`) y
  **228 filas** en `memory_nodes` (incluye superseded). **344 refs verificadas, 0 no resueltas**.
  `memory consolidate --json` da `0` grupos exactos y `0` near-dups. Persiste el **overflow del
  bloque proactivo**: **20 reglas** de scope `project` omitidas (entran 14 de 34).
- **Change abierto**: sólo `ancleto-vscode-extension`. MEM-05, MEM-05a y MEM-05b están
  **archivados** (`2026-11-02-mem-05-recall-task-aware`,
  `2026-11-02-mem-05a-searchmemory-docs-contract`, `2026-11-02-mem-05b-gc-superseded-age`).
- **CLI del `PATH` vs checkout**: el `ancleto` global de esta máquina es **0.17.1** y no conoce
  `memory consolidate` ni el contrato nuevo de `searchMemory`; `node src/cli/index.js` es 0.18.6.
  Verificar la versión instalada antes de concluir que una capacidad falta.
- **Tier resuelto**: `minimo` vía `.opencode/.ancleto-tier`; decide modelos y el pack
  (`--compress`, ignora `test/**`, `docs/**`, `**/*.md`, sin token budget; sólo `gratis` fija
  50k). Pack de esta corrida: **740 archivos, ~19.907 tokens**.
- **Linter**: ESLint 10 como **devDependency** (flat config `eslint.config.js`, 4 reglas);
  scripts `npm run lint` y `npm test`; no agrega dependencias de runtime.
- **Contrato de validaciones declarativo**: se corre **solo** lo declarado en `PRODUCT.md` →
  `## Project Commands`; format check `not-configured`; tests por el comando declarado o rutas
  explícitas (nunca `node --test` pelado). Fuente: `AGENTS.md` → bloque
  `LOCKED: validation-commands`.
- **Módulo puro de frontmatter**: `src/core/adapters/frontmatter.js` es el **dueño único** de la
  transformación (`adaptFrontmatter`); `src/cli/index.js` lo importa.
- **Memoria**: 3 tools del LLM (`searchMemory`, `recordRule`, `recordDecision`) + operaciones
  `memory export|import|gc|snapshot|merge|consolidate|context|list|doctor` sobre
  `.ancleto/memory.db`. `source` es procedencia runtime-owned. Toda escritura que pasa por
  `recordNode` valida refs fail-closed, salvo `source === 'runtime'`; `cli:import` queda fuera
  (LWW). `memory consolidate` sólo supersede duplicados exactos; los near-dups se reportan.
- **Contrato de `searchMemory`**: preview por defecto (prefijo literal de hasta 240 caracteres,
  `limit` 5, `content_truncated`), `expand: true` para payload completo, `keys` selectivo y
  `required` como entrada de llamada. El protocolo de uso vive en `AGENTS.md` →
  `LOCKED: memory-protocol`; `PRODUCT.md` sólo apunta.
- **GC por supersesión**: `memory_nodes.superseded_at` (columna aditiva), las 4 rutas de
  supersesión (`recordNode`, `importNodes`, `merge`, `consolidate`) escriben el instante y `gc`
  mide `COALESCE(superseded_at, created_at)` con un cutoff único calculado en JS.
- **Resolver de recall**: `resolveNodeRefs({ content, projectRoot })` es read-only; devuelve por
  ref `raw`, `kind`, `verifiable` y `ok`/`path`/`heading`/`reason`/`matches`.
- **Orden de inyección**: scope `task` → `feature` → `project`; luego anclaje declarado
  (`spec:`/`change:`/`path:`), `created_at` descendente y `memory_key` ascendente. El aviso de
  overflow entra en el presupuesto `maxTokens × CHARS_PER_TOKEN` con reserva
  `min(1.500, 15 %)`; lista hasta 40 claves omitidas y agrega `+N`.
- **Entorno de máquina**: `src/core/machine-env.js` es el **dueño único** de detectar,
  renderizar, escribir y excluir `.ancleto/machine-env.md`. Disponibilidad = **resoluble e
  invocable** (sonda acotada). El artefacto de este checkout declara `ancleto: 0.18.6`
  (generado el 2026-11-03).
- **Merge de templates**: `mergeTemplateInto` reconcilia bloques planos legados **antes** de
  `mergeLocked`; punto único de `install`/`update`/`upgrade` e `import`. La reconciliación está
  gateada por la presencia del reemplazo canónico en el `source` y enmascara bloques `LOCKED` y
  code fences.
- **Instalación por host**: `AGENT_TARGETS` es la fuente única de rutas; el frontmatter de agents
  se adapta por host. Detalle: `units/cli-install.md`.
- **Affected-set determinístico**: `src/core/affected-set.js` computa la clausura transitiva de
  **dependientes** sobre el grafo de imports y `ancleto affected` la expone read-only.
- **Reporte de fallos**: `ancleto stats failures` lee read-only los tool parts de opencode,
  clasifica `env`/`check`/`tool`/`unknown` y enmascara secretos y rutas.
- **`opencode.json` (raíz)**: baseline commiteado con override de `agent.model` a
  `commandcode/deepseek/deepseek-v4.1-flash` para los 10 subagentes. No se publica
  (`package.json` → `files` no lo lista).
- **`AGENTS.md`**: cinco bloques `LOCKED` (`memory-protocol`, `validation-commands`,
  `memory-boundary`, `artifacts-language`, `seed-freshness`) + `test-block`, y la sección
  **`## Cambiar el modelo de los agentes`**. `templates/AGENTS.md` replica el mismo set.
- **Set de artifacts**: `proposal.md`, `tasks.md`, `specs/`; `design.md` y `context.md` retirados
  sin sucesor desde `0.17.1`. Una decisión durable va a `proposal.md ## Decisiones`.
- **Ciclo SDD**: 16 comandos `/cleto-*`, 21 skills nativas, **19 specs fuente**, **1 change
  activo** y **41 archivados**; el más reciente es
  `2026-11-02-mem-05b-gc-superseded-age`.
- **Discrepancias abiertas**: la raíz de la DB puede diferir entre `cwd` y el `projectRoot` del
  MCP (no reproducido en esta corrida) y el bloque proactivo omite 20 reglas; el
  `working-context.md` está `desactualizado`. Ver `unknowns.md`.
- **Este checkout**: `.ancletorc` y `.opencode/` existen (gitignored); persisten
  `.ancleto/memory.db`, `.ancleto/working-context.md` y `.ancleto/machine-env.md`.
- **Rama de trabajo**: `development`; `main` declarada protegida en `AGENTS.md` (no se verificó
  protección real en el remoto).
- **No material para el seed**: `audit logs/` (untracked) y `documentation/` (legado gitignored)
  aparecen en el discovery porque recorre el disco, pero no aportan evidencia al mapa.

Antes de afirmar un detalle fino o reciente, abrir el archivo citado en cada documento.
