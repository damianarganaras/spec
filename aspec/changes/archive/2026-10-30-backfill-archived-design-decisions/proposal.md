# Proposal: Backfill de decisiones durables desde design.md archivados

## Intención

Recuperar las decisiones durables que quedaron atrapadas en los `design.md` de `aspec/changes/archive/**` y llevarlas a la memoria del repositorio, sin borrar, mover ni reescribir ningún archivo archivado. Es el PR-4b / CH-02c del backlog de memoria: el conocimiento que hoy sólo vive en artifacts cerrados debe quedar disponible para que un agente futuro lo recupere sin conocer el nombre del change.

El inventario verificado hoy es de **27** `design.md` bajo `aspec/changes/archive/**` y **0** `context.md`. Tras aplicar el test de candidato (§5.7 del plan V2) contra la DB viva, quedan **5 decisiones durables en 4 archivos**. Las 5 decisiones de PR-3 no se re-migran.

## Alcance

Dentro:
- Transcribir las 5 decisiones capturadas en el `## Decisiones` de este proposal, con `memory_key` estable de dominio, `Elección`, `Descartado`, `Justificación`, `Refs` verificadas hoy y `Estado: aprobado`.
- Dejar registrada la auditoría de los 27 `design.md` (capturados, cubiertos, sin decisión durable y el candidato durable fuera de las 5) para que el recorte sea reproducible y revisable.
- Promover los 5 bloques a `.ancleto/memory.db` durante el archive, con el pipeline de promoción ya especificado en `memory-ops`.
- Las 5 capturadas son los nodos críticos que el equipo marcó explícitamente en el checkpoint de este change, lo que las mantiene dentro de `memory-ops` → `### Requirement: Backfill de las decisiones históricas únicas`, que acota el backfill a las cinco decisiones de PR-3 más los nodos críticos marcados.

Fuera:
- **No** se toca `aspec/changes/archive/**`: ningún `design.md` archivado se edita, mueve, borra ni reescribe.
- **No** se re-migran las 5 decisiones de PR-3: `export-bundle-layout`, `antigravity-skills-dir`, `openspec-legacy-agents-md-merge`, `test-automation-profile-aspec-reuse`, `orchestrator-session-start-file-cap`.
- **No** hay cambio de código, de tests ni de ningún asset de producto.
- **No** se crean `memory_key` nuevas fuera de las 5 transcritas, ni se reescriben claves existentes.

## Sin delta spec

Este change **no genera `specs/` ni `design.md`**. No cambia comportamiento observable del producto: no altera la CLI, el motor de memoria, los contratos de assets ni la superficie instalable. El conocimiento recuperado se materializa en dos lugares ya existentes:

1. El `## Decisiones` de este proposal, que es donde vive la decisión durable de un change.
2. La promoción al archivar, cuyo comportamiento ya está especificado en `memory-ops` → `### Requirement: Promoción al archivar sólo de decisiones duraderas aprobadas`.

Un delta spec aquí quedaría vacío de contenido real: no hay `ADDED/MODIFIED/REMOVED` que declarar porque ninguna capacidad cambia su contrato.

## Auditoría de los 27 `design.md`

### A) Capturadas — 4 archivos, 5 bloques

| Archivo archivado | `memory_key` promovida |
|---|---|
| `2026-10-05-memory-actor-provenance` | `memory-provenance-audit-not-authorization` |
| `2026-10-17-memory-cli-writes-refresh-working-context` | `working-context-refresh-compare-based` |
| `2026-10-26-agent-delegation-contract` | `git-commit-ownership-coder-only` |
| `2026-10-30-mem-03-promocion-decisiones-refs` | `memory-refs-fail-closed-grammar` + `archive-promotion-approved-decisions-only` |

### B) Cubiertas por un nodo activo — 13 archivos (no se escriben)

| Archivo archivado | Clave activa que ya la cubre |
|---|---|
| `2026-09-25-working-context-refresh-on-memory-write` | `memory-key-transversal-identity` (identidad por clave) + `working-context-refresh-trigger-superset` (trigger `(rule + project) || superseded > 0` y su alternativa diferida) |
| `2026-09-29-migrate-openspec-to-aspec` | `node-fs-cp-collision-behavior` (copia no destructiva) + `migrate-openspec-marker` (marcador `aspec/.migrated-from-openspec`) |
| `2026-09-30-add-multi-agent-cli-support` | `agent-install-routing.dot-agents-skills` (directorio) + `skill-frontmatter-adapters.general-mechanism` (formato) |
| `2026-09-30-add-antigravity-full-support` | `antigravity-agent-frontmatter-mapping` (frontmatter) + `antigravity-full-support-design` (destino de `commands` como skill-dir y MCP) |
| `2026-09-30-reviewer-guarantee-vs-model` | `review-guarantee-optionality-boundary` + `review-guarantee-canonical-section-open-question` (el nodo `effect-claim-detection-signal` no cubre: declara que la detección no implica adopción del cambio) |
| `2026-10-02-add-standard-linter` | `linter-standard-config` (ESLint flat config; el descarte de Prettier del `design.md` no tiene nodo propio) |
| `2026-10-02-dynamic-frontmatter-adapters` | `skill-frontmatter-adapters.general-mechanism` |
| `2026-10-02-memory-ops-export-import-gc` | `memory-import-superseded-policy` (import) + `memory-gc-active-nodes-untouchable` (el GC nunca toca nodos activos) |
| `2026-10-14-contrato-validaciones` | `validation-contract-declarative` (contrato declarativo, decisión principal) + `template-merge-locked` (reconciliación de bloques) |
| `2026-10-14-token-budget` | `caveman.host-scoped-usage-gate` + `token-budget.q-metric-definition` + `working-context.day-zero-materialization` |
| `2026-10-15-throughput-pipeline` | `affected-set-excludes-markdown-guards` + `throughput-pipeline-review-ledger-no-rebash` + `throughput-pipeline-affected-set-design` (definición de la clausura por grafo de imports) |
| `2026-10-25-machine-environment-block` | `machine-env-local-per-machine` |
| `2026-10-25-session-failure-report` | `stats-failures-command-skeleton` |

### C) Sin decisión durable — 9 archivos

| Archivo archivado | Motivo |
|---|---|
| `2026-09-29-fix-memory-engine-test-isolation` | El fix vive sólo en tests; no hay decisión durable (la regla de `cwd` de `buildWorkingContext` ya la fija `buildworkingcontext-cwd-tercer-parametro`). |
| `2026-09-30-add-copilot-support` | Arquitectura del momento, sin alternativa descartada. |
| `2026-09-30-cross-machine-export-import` | Ya migrada en PR-3 (`export-bundle-layout`). |
| `2026-09-30-fix-antigravity-skill-dir` | Ya migrada en PR-3 (`antigravity-skills-dir`). |
| `2026-09-30-import-legacy-openspec` | Ya migrada en PR-3 (`openspec-legacy-agents-md-merge`). |
| `2026-09-30-test-automation-profile` | Ya migrada en PR-3 (`test-automation-profile-aspec-reuse`). |
| `2026-10-06-ancleto-update` | Diseño de skill; el mapeo es convencional, sin alternativa. |
| `2026-10-07-add-commandcode-support` | Aplicación del ruteo multi-host ya decidido. |
| `2026-10-26-orchestrator-session-start` | Ya migrada en PR-3 (`orchestrator-session-start-file-cap`). |

### D) Decisión durable fuera de las 5 — 1 archivo (0 escrituras)

| Archivo archivado | `memory_key` candidata | Por qué no se escribe acá |
|---|---|---|
| `2026-10-02-cleto-review` | `cleto-review-severity-degrade` | Decide la asignación de severidad (CRITICAL sólo para duplicación literal o dead code probado dentro del scope; redundancia inferida o ubicación discutible ⇒ WARNING/SUGGESTION; ante duda, degradar), pero hoy no hay nodo activo que la cubra **ni** Requirement que la sostenga en `aspec/specs/code-review/spec.md`. Su hogar normativo es la spec, no la memoria: va agendada como `CH-11` del backlog y se captura cuando exista el Requirement. |

Recorte re-verificado en una segunda pasada adversarial: dos filas de B citaban un nodo que no cubría la decisión y tres archivos estaban en el grupo equivocado; se corrigieron contra los `design.md` y contra los nodos activos. La suma sigue siendo 27 = 4 (A) + 13 (B) + 9 (C) + 1 (D).

## Riesgos

- **Refs que dependen de headings vivos**: los `Refs` apuntan a Requirements de `aspec/specs/`; si uno se renombra antes del archive, el ref deja de resolver. Mitigación: re-verificación read-only de todos los refs justo antes de archivar.
- **Deriva de la DB entre propose y archive**: una `memory_key` capturada puede pasar a estar cubierta por un nodo activo. Mitigación: comprobación read-only de colisión antes de aprobar y de nuevo antes de promover.
- **Promoción fail-closed**: si un ref inválido llega al camino único de escritura, la escritura se rechaza y el archive se bloquea. Es el comportamiento deseado; el riesgo es operativo (bloqueo), no de estado a medias.
- **Ausencia de delta spec**: un revisor que espere `specs/` puede leerlo como omisión. Mitigación: la justificación explícita de la sección anterior.

## Decisiones

- **memory_key:** memory-provenance-audit-not-authorization
  **Elección:** La procedencia (`source`) es auditoría, no autorización: describe de qué superficie de escritura provino un nodo y NO se usa para autorizar ni denegar escrituras.
  **Descartado:** Actor declarado por el caller en los argumentos de la tool — es forjable y rompe el encapsulamiento MCP.
  **Justificación:** Implementar enforcement sobre la procedencia prometería una propiedad inexistente; sin canal de identidad confiable, la procedencia sólo puede ser descriptiva. Evidencia de origen: `aspec/changes/archive/2026-10-05-memory-actor-provenance/design.md:12-15,72`
  **Refs:** `change:memory-actor-provenance`; `spec:memory-engine#Frontera entre procedencia y enforcement`; `path:src/core/memory/engine.js`
  **Estado:** aprobado

- **memory_key:** working-context-refresh-compare-based
  **Elección:** `refreshWorkingContextOnWrite` es compare-based: renderiza el bloque esperado y reescribe `.ancleto/working-context.md` sólo si difiere del contenido en disco.
  **Descartado:** Refresh por conteo (`inserted + updated > 0`), que no garantizaría no tocar el archivo cuando el render es idéntico.
  **Justificación:** Evita reescrituras innecesarias y respeta el invariante de conexión única que usa `tools.js`. Evidencia de origen: `aspec/changes/archive/2026-10-17-memory-cli-writes-refresh-working-context/design.md:32-35,14-17`
  **Refs:** `change:memory-cli-writes-refresh-working-context`; `spec:memory-engine#Frescura del working-context tras escrituras de la CLI`; `path:src/core/memory/working-context.js`
  **Estado:** aprobado

- **memory_key:** git-commit-ownership-coder-only
  **Elección:** `@coder` es el único agente que commitea —en sus checkpoints de implementación y en el archive— y `@documenter` no commitea nunca; el commit se limita a los paths nombrados en el checkpoint.
  **Descartado:** Un agente `@committer` dedicado (A2).
  **Justificación:** El commit es mecánico y local: su dueño natural es el agente que produce los archivos, no un tercero. Un `@committer` crearía un rol sin ownership de código, duplicaría el bash del coder y agregaría una superficie que el usuario no pidió. Evidencia de origen: `aspec/changes/archive/2026-10-26-agent-delegation-contract/design.md:249-251`
  **Refs:** `change:agent-delegation-contract`; `spec:prompt-contracts#Ownership de commit, merge y push`; `path:agents/coder.md`
  **Estado:** aprobado

- **memory_key:** memory-refs-fail-closed-grammar
  **Elección:** En el camino único de escritura, una línea del bloque `refs:` que no matchea la gramática —o un bloque `refs:` sin entradas válidas— hace rechazar la escritura completa: fail-closed, nunca se ignora.
  **Descartado:** Una tabla `memory_refs` dedicada, que sólo se consideraría si la validación por texto fallara medida.
  **Justificación:** Un rechazo no escribe ni supersede nada, así que el fallo es determinístico y no deja estado a medias. Evidencia de origen: `aspec/changes/archive/2026-10-30-mem-03-promocion-decisiones-refs/design.md:45-48,52-53`
  **Refs:** `change:mem-03-promocion-decisiones-refs`; `spec:memory-engine#Validación fail-closed de refs en el camino único de escritura`; `path:src/core/memory/engine.js`
  **Estado:** aprobado

- **memory_key:** archive-promotion-approved-decisions-only
  **Elección:** Al archivar se promueven sólo las decisiones durables con `Estado: aprobado`; cero candidatos implican 0 escrituras y 0 delegaciones, sin invocar `@memory-keeper` para declarar que no hubo nada.
  **Descartado:** Mantener el paso genérico «Capture lessons» en lugar del gate de promoción.
  **Justificación:** Nunca se reporta «archivado y memorizado» si sólo se archivó, y un lote vacío no debe producir una escritura ni un spawn vacío. Evidencia de origen: `aspec/changes/archive/2026-10-30-mem-03-promocion-decisiones-refs/design.md:139,103-116`
  **Refs:** `change:mem-03-promocion-decisiones-refs`; `spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas`; `path:skills/ancleto-archive/SKILL.md`
  **Estado:** aprobado
