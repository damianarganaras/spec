# Proposal: Pipeline de mayor throughput — paralelización, ledger prearmado, affected-set determinístico y memoria en un paso

## Problem

El pipeline SDD produce calidad alta pero paga latencia y tokens en round-trips evitables. Cuatro fugas concretas:

1. **Cierre serializado (`@documenter` → `@memory-keeper`)**: en `agents/orchestrator.md` (Path A, pasos 8–9) la finalización del archive y el registro de memoria corren uno después del otro aunque operan sobre superficies disjuntas (`aspec/changes/archive/` vs `.ancleto/memory.db`) y no dependen de la salida del otro. Es un round-trip extra por change completado.

2. **Rebote del reviewer por evidencia de comando**: el reviewer no tiene bash (`agents/reviewer.md:11`, frontera de seguridad). Cuando le falta evidencia de comando, su contrato lo obliga a reportar "missing or inconclusive command evidence" y pedir verificación focalizada a `@tester` (`reviewer.md:170`, `:197`: `When evidence is missing or inconclusive, report exactly what @tester would need to verify` y `missing or inconclusive command evidence that requires focused verification by @tester`). El ledger que recibe hoy no está garantizado como completo ni cerrado → re-delegación a `@tester` (un stage completo extra) por comandos que ya se corrieron.

3. **Scope review sin dependientes determinístico**: el scope de review es la unión de `task-owned files` (`reviewer.md:107`, `orchestrator.md:303`), y el tester debe verificar "los afectados, no sólo los archivos tocados" (`tester.md:60`) — pero no hay una definición reproducible de ese conjunto afectado. Sin una clausura determinística por grafo de imports, los dependientes pueden quedar fuera → escapes (defectos que escapan) y baja de Q.

4. **Ping-pong de memoria sin candidato**: el cierre puede encadenar Automatic Record → Optional Draft → aprobación → User-Approved Record (`orchestrator.md:157-158`, `:276`, `:288`; `memory-keeper.md` modos 2–4) cuando no hay candidato real, gastando hasta tres llamadas a memoria y un ida-y-vuelta con el usuario que no procede.

Evidencia de calidad (baseline vigente, memoria `token-budget.q-metric-definition`): Q = (1−RR)(1−escapes) con T0 (2026-10-14) RR = 0.10, escapes = 0.00 → **Q = 0.90**. Todo recorte de este change se acepta sólo si ΔQ ≥ 0.

## Proposed change

Optimizar `ancleto` en tres ejes —ahorro de tokens, velocidad de implementación y máxima calidad— mediante un pipeline de mayor throughput, sin degradar ninguna salvaguarda. Este change entrega cuatro mejoras:

1. **Paralelizar `@documenter` ∥ `@memory-keeper` tras la aprobación del archive.** Ambas etapas se delegan en simultáneo cuando hay candidato real de memoria; operan sobre superficies disjuntas y no dependen de la salida de la otra. Sin candidato, sólo corre la finalización.
2. **Reviewer sin rebote con `ledger prearmado`.** `@tester` produce un **Validation Ledger completo y cerrado** para el scope de review; `@orchestrator` lo arma/verifica cerrado antes de delegar; `@reviewer` lo consume sin reconstruirlo y no pide re-verificación dentro del scope cubierto. Se preserva `bash:false` en el reviewer.
3. **`affected-set` determinístico por grafo de imports.** El conjunto afectado se define como la clausura transitiva de **dependientes** sobre el grafo de imports, sembrada por los `task-owned files`, e incluye siempre los archivos tocados. Es el scope de review y el objetivo de verificación del tester. Reproducible: mismo estado + misma semilla → mismo conjunto. Si el proyecto declara su propio mecanismo de afectados, ese tiene prioridad.
4. **Memoria en un solo paso y sólo con candidato real.** El cierre hace como máximo una llamada a memoria, y sólo si existe un candidato real. Sin candidato no hay Optional Draft, no hay pedido de aprobación de memoria y se finaliza sin almacenar.

## Scope

In scope:

- `agents/orchestrator.md`: delegación paralela de finalización ∥ memoria; armado/verificación de cierre del ledger prearmado; paso del `affected-set`; contrato de memoria en un paso.
- `agents/tester.md`: cómputo y reporte del `affected-set` determinístico; retorno del Validation Ledger completo y cerrado.
- `agents/reviewer.md`: consumo del ledger prearmado y del `affected-set` como scope; supresión del pedido de re-verificación dentro del scope cubierto; `bash:false` preservado.
- `agents/memory-keeper.md`: alineación del cierre al modo de un solo paso (Automatic Record sólo con candidato; sin cadena de Optional Draft cuando no procede).
- `src/core/` (helper zero-dep del grafo de imports) y `src/cli/index.js` (superficie read-only del `affected-set`), sólo como mecanismo del affected-set determinístico.
- `test/content-guards.test.js`: actualización obligatoria en el mismo change (fija contratos de prompt).
- Tests del helper/CLI del `affected-set`.
- Baseline T0' y validación de ΔQ.

Out of scope:

- **`devloop-test-split`** (partir `test/cli.test.js` por subcomando): change posterior, fuera de éste.
- Añadir dependencias de runtime (se mantiene **zero-deps**).
- Cambiar la semántica de las salvaguardas protegidas (ver Risks).
- Dar bash al reviewer, auto-aprobar direct "trivial", fusionar el SPEC checkpoint con la confirmación direct, fusionar tester+reviewer, paralelizar coder↔tester, o bajar `MAX_TOKENS` sin ΔQ ≥ 0 (**opciones refutadas**; no se proponen).
- Configuración MCP de host fuera de la excepción vigente (`opencode`/`antigravity`).
- **Retiro del modo Optional Draft**: queda **deferred** para un change posterior; este change lo mantiene como modo vivo y sólo reserva User-Approved Record al pedido explícito del usuario. No forma parte del scope.

## Relationship with archived changes

- `aspec/changes/archive/2026-10-14-token-budget/` y `aspec/changes/archive/2026-10-14-contrato-validaciones/` **ya están archivados e integrados** (memoria `token-budget.contrato-validaciones-overlap`: solape resuelto). Este change **construye sobre su estado** (bloques `LOCKED` en `templates/AGENTS.md`, contrato `LOCKED: validation-commands`, guards con asserts de comportamiento, métrica Q). No re-decide ni re-litiga ese contenido.

## Risks

- **Degradar una salvaguarda al optimizar**: mitigación — el change enumera las salvaguardas intocables (ver design) y cada una conserva cobertura de test; el reviewer sigue sin bash y el bloqueo por CRITICAL permanece.
- **Ledger "cerrado" que en la práctica deja huecos**: mitigación — el cierre se define por criterio verificable (toda entrada del scope con clasificación terminal); el orquestador NO delega review con ledger no cerrado y se detiene en la etapa de tester.
- **`affected-set` que explota el scope de review**: mitigación — el set es la clausura de dependientes (reproducible), no una expansión arbitraria; sin dependientes el set es exactamente el de archivos tocados.
- **Helper de grafo incompleto (imports dinámicos, alias, TS)**: mitigación — el mecanismo declarado por el proyecto tiene prioridad; el helper cubre las formas estáticas de import/require y respeta los ignores del proyecto. Los specifiers **no relativos** (paquetes, builtins, **alias**) son externos por construcción (sin arista ni `unresolved`) y se cuentan como dato; sólo los imports dinámicos con expresión y los relativos irresolubles se reportan como inconclusos, no se asumen cubiertos. La resolución de alias queda delegada al mecanismo declarado por el proyecto (soporte real de alias = follow-up out-of-scope).
- **Paralelizar el cierre rompe una dependencia real**: mitigación — la invariante exige superficies disjuntas; si `@memory-keeper` necesitara el resultado del archive, no se paraleliza y se registra como bloqueo.
- **Retirar el ping-pong de memoria deja sin uso el modo Optional Draft**: mitigación — el retiro del modo queda **deferred / out of scope** en este change (se planifica en un change posterior); aquí permanece vivo y disponible sólo ante pedido explícito del usuario. ΔQ ≥ 0 gobierna la aceptación.

## Non-goals

- No se cambia la forma en que el proyecto declara sus comandos (`## Project Commands`) ni la política de validaciones declarativa vigente.
- No se agrega un stage nuevo al flujo (`@review`/`@tester`/`@reviewer` conservan sus stages).
- No se modifica la semántica de la verificación de garantías bajo el modelo real ni sus flags.
