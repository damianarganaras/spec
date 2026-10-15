# Proposal: Presupuesto de tokens de los prompts — dedupe, envelope por tramo y día-cero

## Problem

Los contratos de los agentes del framework **hardcodean supuestos y capacidades** en vez de declararlos, y hay fugas de tokens medibles por cambio y por turno:

- **caveman sin uso:** el instalador lo da de alta por defecto (`src/cli/index.js:548-555`) pero **ningún prompt lo usa** (`docs/relevamiento-memoria-y-roles.md:117`): se paga un impuesto fijo de ~830 tok/request (`README.md:120-125`) sin beneficio. Además el MCP sólo se escribe en `opencode`/`antigravity` (`mergeMcp`), así que una instrucción de compresión puesta en texto compartido sería falsa para el resto de los hosts.
- **Orquestador duplicado:** `agents/orchestrator.md` (464 líneas instalado) repite "Runtime Safety" (`:30-40` y `:262-270`) y re-enumera "Expected output from @X" cuando cada agente ya declara su propio Output Expectations → estimado ~-6k tok/turno si se deduplica.
- **Envelope verbatim:** el orquestador reinyecta el "Resolved Context Envelope" **verbatim** a cada subagente (`:140`), contradiciendo su propia regla de destilado (`:315-320`) → ~6-15k tok/cambio.
- **Reglas duplicadas skill↔agente forzadas por tests:** la frescura del seed (`test/content-guards.test.js:224` vs `:231`) y el idioma (`:54` vs `:73`) se declaran dos veces porque el guard fija sus literales en ambas superficies.
- **Promesa de día-cero incumplida:** `README.md:414` promete inyección "desde el día cero —incluso sin reglas previas", pero `refreshWorkingContext` retorna `null` si no existe `.ancleto/memory.db` (`src/cli/index.js:1940-1949`). Un repo nuevo no materializa `.ancleto/working-context.md` ni inyecta `<ProjectTopology>` —que **no** depende de reglas—.

## Proposed change

Recortar el presupuesto de tokens sin degradar la calidad, con dos principios: **ownership único** (cada regla vive una sola vez) y **mesura antes de aceptar** (todo recorte se acepta sólo si no baja la calidad del flujo).

1. **Dedupe del orquestador**: un único hogar para "Runtime Safety" y delegar el contrato de salida a cada agente.
2. **Envelope por tramo** en vez de verbatim, preservando los cinco artefactos de control (SPEC UPDATE RECOMMENDED, SEED_ACTION_REQUIRED, GUARANTEE NOT SUSTAINED, Validation Ledger, task-owned files) y la evidencia como `file:line`.
3. **Fuente única de reglas compartidas**: mover a `AGENTS.md` lo que hoy se duplica skill↔agente; las demás superficies referencian.
4. **content-guards a keywords de comportamiento**: relajar `test/content-guards.test.js` para que asierte el comportamiento y no la redacción literal (en el mismo change; guardrail del repo).
5. **caveman con uso condicional host-scoped**: default ON donde existe la tool de compresión, pista sólo en superficies del host (nunca en texto compartido), con **compuerta de medición** vía `ancleto stats`: si el neto no baja en la ventana de observación, se revierte a opt-in. Decisión del usuario: "ahorro máximo".
6. **Día-cero (opción a)**: materializar el working-context con `<ProjectTopology>` aunque no haya DB/reglas, y alinear el README con la implementación.
7. **Baseline T0 como primer task**: `npm test` cronometrado + `ancleto stats` + registro de RR/escapes de los últimos changes, con la métrica **Q = (1−RR)(1−escapes)**.

## Scope

In scope:

- `agents/orchestrator.md`: dedupe de runtime safety y expected-output; envelope por tramo.
- `templates/AGENTS.md`: hogar de las reglas compartidas movidas.
- `skills/` y `agents/` que hoy duplican esas reglas: pasar a referencia.
- `test/content-guards.test.js`: asserts a nivel de comportamiento.
- `src/cli/index.js` + `templates/AGENTS.md`/instalación: directiva de compresión host-scoped y reversibilidad de caveman.
- `src/cli/index.js` (`refreshWorkingContext`) y el render de topología: día-cero sin `memory.db`.
- `README.md`: coherencia de la promesa de día-cero (`:311` vs `:414`).
- Baseline T0 y validación de ΔQ.

Out of scope:

- Añadir dependencias de runtime (se mantiene **zero-deps**).
- Cambiar la semántica de las salvaguardas protegidas (ver Risks/mitigación).
- Configurar MCP de host fuera de la excepción existente (`opencode` vía `opencode.json`, `antigravity` vía `.agents/mcp_config.json`); Claude/VS Code/Copilot quedan como hoy.
- Ownership/enforcement de procedencia de memoria y refactors del motor no tocados aquí.
- El change futuro `contrato-validaciones` (sólo se coordina el solapamiento).

## Risks

- **Recortar una salvaguarda por accidente al deduplicar:** mitigación — el spec enumera explícitamente las salvaguardas intocables (verificación de garantías bajo modelo real, verificación de afectados y no sólo archivos tocados, `bash:false` en reviewer/orchestrator/spec-writer, Validation Ledger, los cinco flags, bloqueo por CRITICAL, baseline reproducible) y cada una conserva un assert de comportamiento.
- **Directiva de compresión filtrada a texto compartido:** mitigación — regla explícita de que toda instrucción host-específica vive sólo en superficies del host; assert en content-guards.
- **Default de caveman que no rinde:** mitigación — compuerta de medición con `ancleto stats` y reversión a opt-in.
- **Día-cero rompe el contrato del motor:** mitigación — la materialización sin DB vive en la capa CLI; `buildWorkingContext` conserva su firma y su default (spec `memory-engine` vigente).
- **Solapamiento con `contrato-validaciones`:** mitigación — ambos changes tocan `templates/AGENTS.md` y `test/content-guards.test.js`; se deja asentado en `design.md` y `tasks.md` como dependencia de secuencia.
- **Cuellos de métrica Q mal definidos (RR/escapes):** mitigación — el baseline fija la definición operativa antes de aceptar el primer recorte; ver open questions.
