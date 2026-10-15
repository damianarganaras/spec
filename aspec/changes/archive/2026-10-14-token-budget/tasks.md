# Tasks: Presupuesto de tokens de los prompts

> Convención: implementación y validación van en secciones separadas. Cada recorte de tokens se acepta sólo si ΔQ ≥ 0 contra el baseline T0.

## Fase 0 — Baseline (PRIMER task, bloqueante)

- [x] T0.1 Registrar el baseline reproducible: correr `node --test test/*.test.js` **cronometrado** y guardar la duración de la suite.
- [x] T0.2 Registrar el consumo previo con `ancleto stats` (ventana definida) y dejar constancia de la ventana y del umbral de reversión de caveman.
- [x] T0.3 Registrar RR/escapes de los últimos changes (definición operativa de RR y escapes acordada con el usuario) y calcular Q = (1−RR)(1−escapes).
- [x] T0.4 Asentar el solapamiento con el change futuro `contrato-validaciones` (`templates/AGENTS.md`, `test/content-guards.test.js`): secuencia o resolución de merge.

### Registro T0 (operativo, reproducible)

- **Suite (T0.1)**: `node --test test/*.test.js` → **65694 ms**, 392 tests, 392 pass, 0 fail (medición local Windows, Node v24.15.0).
- **Consumo (T0.2)**: `ancleto stats` — ventana = **las 10 sesiones más recientes** de opencode para este directorio: entrada 18.2M · salida 1.0M · razon 1.4M · cache 265.5M · costo $15.59.
- **Umbral de reversión de caveman (T0.2)**: misma ventana (10 sesiones) o `ancleto stats --since <fecha-del-change>`; criterio = el **consumo neto (input + output + reasoning, sin cache read)** debe bajar respecto de T0. Si no baja, el default de caveman vuelve a **opt-in** (el MCP no se da de alta por defecto).
- **RR (T0.3)**: fracción de los últimos 10 changes archivados con al menos una tarea sin completar (`- [ ]`) en `tasks.md` al archivar → **1/10 = 0.10** (`2026-10-02-add-standard-linter`).
- **escapes (T0.3)**: fracción de esos 10 changes archivados sin validación registrada (sección de validación con tareas abiertas) → **0/10 = 0.00**.
- **Q (T0.3) = (1 − 0.10)(1 − 0.00) = 0.90**.
- **Solapamiento (T0.4)**: `contrato-validaciones` también tocará `templates/AGENTS.md` y `test/content-guards.test.js`. **Secuenciar** los changes (no mergear en paralelo) o resolver el conflicto de merge sobre esos dos archivos; este change queda como el primero de la secuencia.


## Fase 1 — Dedupe del orquestador

- [x] F1.1 Unificar la regla "Runtime Safety" en un único hogar en `agents/orchestrator.md`; eliminar la re-declaración en la sección de Workflow y dejar sólo el punto de control.
- [x] F1.2 Reemplazar la re-enumeración de "Expected output from `@X`" por una referencia al Output Expectations de cada agente; conservar sólo lo que agrega el tramo.
- [x] F1.3 Verificar que cada agente conserva su `## Output Expectations` y su `**Output cap**`.

## Fase 2 — Envelope por tramo

- [x] F2.1 Reescribir `agents/orchestrator.md:140` de "verbatim" a destilado por tramo (campos que cada tramo necesita).
- [x] F2.2 Preservar en el destilado los cinco artefactos de control (`task-owned files`, `Validation Ledger`, `SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED`, `GUARANTEE NOT SUSTAINED`) y la evidencia como `file:line`.
- [x] F2.3 Dejar `### Handling subagent returns` como dueño único del contrato de destilado y referenciarlo desde el resto.

## Fase 3 — Fuente única de reglas compartidas

- [x] F3.1 Mover a `templates/AGENTS.md` (bloques `LOCKED` cuando corresponda) las reglas hoy duplicadas skill↔agente: frescura del seed al archivar e idioma de artifacts.
- [x] F3.2 Convertir las declaraciones duplicadas en referencias en `skills/ancleto-archive/SKILL.md`, `agents/orchestrator.md` y demás superficies afectadas.

## Fase 4 — Compresión host-scoped y caveman

- [x] F4.1 Materializar la directiva de uso de compresión **sólo** en superficies del host cuya configuración MCP incluye la tool (opencode/antigravity); garantizar que no aparece en texto compartido entre hosts.
- [x] F4.2 Mantener el default ON de caveman cuando el binario está disponible y documentar la compuerta de reversión a opt-in.
- [x] F4.3 Verificar que la instalación no gana configuración MCP de host fuera de la excepción vigente (opencode/antigravity) y que el cambio es no destructivo.

## Fase 5 — Día-cero del working-context

- [x] F5.1 Cambiar `refreshWorkingContext` (y el punto de materialización del lifecycle) para escribir `.ancleto/working-context.md` con `<ProjectTopology>` aunque no exista `.ancleto/memory.db`, creando `.ancleto/` si falta.
- [x] F5.2 Componer la topología sin abrir el motor cuando no hay DB, reutilizando `readTopologySummary`/`formatTopologyBlock` de `engine.js`.
- [x] F5.3 Cubrir el edge sin topología ni reglas: no crear contenido ficticio.
- [x] F5.4 Preservar la firma y el default de `buildWorkingContext` (spec `memory-engine` vigente) sin cambios.
- [x] F5.5 Extender `memory context --out` al día-cero reusando un único camino de render (`renderWorkingContextBlock`) compartido con `refreshWorkingContext`; alinear `agents/orchestrator.md:148` y `README.md:416` con el comportamiento real.

## Fase 6 — README

- [x] F6.1 Alinear `README.md:311` con `README.md:414` según la implementación de día-cero elegida.

## Fase 7 — content-guards

- [x] F7.1 Relajar `test/content-guards.test.js` a keywords de comportamiento: frescura del seed, idioma y destilado dejan de exigir el literal en la superficie que ahora referencia.
- [x] F7.2 Garantizar que cada salvaguarda protegida sigue cubierta por un assert de comportamiento (garantías bajo modelo real, afectados, `bash:false`, Validation Ledger, cinco flags, bloqueo por CRITICAL).

## Validación (separada de implementación)

- [x] V1 Test que verifica la materialización día-cero con topología y sin `memory.db` (`test/cli.test.js`).
- [x] V2 Test/guard de comportamiento: Runtime Safety con un único hogar y expected-output delegado (`test/content-guards.test.js`).
- [x] V3 Guard que verifica que ningún asset compartido contiene la instrucción de compresión host-específica (`test/content-guards.test.js`) + materialización host-scoped por host (`test/cli.test.js`).
- [x] V4 Suite completa `node --test "test/*.test.js"` en verde y comparación de duración contra T0 (398 pass / 0 fail, ~62.5 s vs 65.7 s T0).
- [ ] V5 `ancleto stats` post-change vs T0; evaluar ΔQ ≥ 0 y revertir todo recorte con ΔQ < 0.
- [ ] V6 Confirmar no-conflicto/coordinación con `contrato-validaciones` sobre `templates/AGENTS.md` y `test/content-guards.test.js`.

### Gap residual (resuelto en la iteración)

- **Resuelto**: `ancleto memory context --out ...` ya no exige `.ancleto/memory.db`; materializa la topología día-cero por el **mismo camino de render** que `refreshWorkingContext` (`renderWorkingContextBlock` en `src/core/memory/working-context.js`), y `agents/orchestrator.md:148` / `README.md:416` quedan alineados con el comportamiento real. El delta spec `memory-engine` ("el CLI") ahora se cumple de forma universal (los tres escritores comparten comportamiento).
