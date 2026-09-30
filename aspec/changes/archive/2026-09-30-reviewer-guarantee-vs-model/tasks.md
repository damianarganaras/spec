# Tasks: Verificación de la garantía del proposal bajo el modelo real en el reviewer

> Orden: (1) `agents/reviewer.md` → (2) `agents/orchestrator.md` → (3) scaffolding de content guards
> → (4) tests y verificación → (5) validación real del repo.
> Las secciones 1–3 son de implementación (`@coder`). La **sección 4 pertenece a `@tester`** y no
> debe ejecutarse como parte de la implementación. La sección 5 es la validación del repo.
>
> Nota de fuente de verdad: se edita `agents/`, no `.opencode/agents/` (copia generada por
> `copyAssets`/`applyTier`; ver `design.md` → "Contexto y problema"). Los content guards leen
> `agents/`.
>
> Herramienta real de validación: `node --test <archivo>`. En este repo **no** existe tooling de
> typecheck/lint/format (no planificar tareas que lo asuman).

## 1. Editar `agents/reviewer.md`

- [x] **1.1** Agregar una sección `## Guarantee Verification Under the Real Model`, marcada
  explícitamente como aplicable **solo** al modo `aspec Change` (no a `direct-implementation` ni
  `direct-test-only`).
  Ref: Requirement "Frontera y no-regresión del review" / Scenario "El flujo mantiene sus stages".
- [x] **1.2** Declarar el mandato: verificar que la garantía del proposal se sostiene bajo el
  **modelo real** = operaciones que pueden mutar el estado protegido, **incluidas las que el change
  NO introduce** (supersesión, otros módulos, efectos indirectos); adicional a la consistencia
  implementación↔delta spec, sin sustituirla.
  Ref: Requirement "Verificación de la garantía del proposal bajo el modelo real" / Scenario "La
  consistencia con el delta spec no sustituye la verificación".
- [x] **1.3** Declarar la señal de aplicabilidad `S1 ∧ S2`: `S1` = operación identificable con
  cuantificador universal/negativo; `S2` = escritura por identidad no acotada sobre un store con
  read-model filtrado/ordenado. Explicitar que **`S1` sola no alcanza** y que sin `S1 ∧ S2` el
  reviewer **NO ejecuta** el análisis de modelo (excluye changes simples, doc-only y cosméticos).
  Ref: Requirement "Señal de aplicabilidad del análisis de modelo" / Scenarios "Change con claim de
  efecto sobre un store con read-model filtrado" y "Change doc-only o cosmético sin claims de
  efecto".
- [x] **1.4** Autorizar y exigir la **lectura del código fuente** de las operaciones que pueden mutar
  el estado protegido, no limitada al diff ni a los `task-owned files`. Ajustar de forma acotada el
  paso 2 de `## Required Workflow` (`agents/reviewer.md:68`) para permitir esas lecturas cuando
  `S1 ∧ S2` se cumple.
  Ref: Requirement "Inputs y contexto del reviewer para el análisis de modelo" / Scenario "El
  orquestador propaga la garantía y el estado protegido".
- [x] **1.5** Definir la salida: flag `GUARANTEE NOT SUSTAINED` en severidad `CRITICAL` que nombra la
  garantía del proposal, la operación que la falsa y el estado protegido; **no** se degrada a
  `WARNING` ni se omite por quedar fuera del diff o de los `task-owned files`. Agregar el carve-out
  correspondiente en `## Scope Review Rules` (`agents/reviewer.md:74-99`).
  Ref: Requirement "Salida ante garantía no sostenida" / Scenarios "El flag nombra garantía,
  operación y estado" y "El flag no se degrada a warning".
- [x] **1.6** Declarar que, si no logra resolver la superficie de escritura o el read-model con el
  contexto recibido, **reporta el contexto faltante a `@orchestrator`** y **no** concluye que la
  garantía se sostiene.
  Ref: Requirement "Inputs y contexto del reviewer para el análisis de modelo" / Scenario "El
  reviewer reporta el contexto faltante en lugar de asumir".
- [x] **1.7** Sumar el flag a `## Output Expectations` (`agents/reviewer.md:155-168`) y al bloque de
  formato (`:172-198`) como sección `### GUARANTEE NOT SUSTAINED` (o "none"), **separada** de
  `### SPEC UPDATE RECOMMENDED`.
  Ref: Requirement "Salida ante garantía no sostenida" / Scenario "El flag nombra garantía, operación
  y estado".

## 2. Editar `agents/orchestrator.md`

- [x] **2.1** En la delegación del review (Path A paso 6, `agents/orchestrator.md:271`), cuando el
  change declare garantías de efecto, incluir como **campos separados** la garantía extraída del
  proposal, el estado protegido y la capability afectada, además del Resolved Context Envelope,
  `task-owned files` y Validation Ledger.
  Ref: Requirement "Inputs y contexto del reviewer para el análisis de modelo" / Scenario "El
  orquestador propaga la garantía y el estado protegido".
- [x] **2.2** Agregar `GUARANTEE NOT SUSTAINED` a la lista de flags que se extraen y preservan en
  `### Handling subagent returns` (`agents/orchestrator.md:305-314`, campos en `:309`).
  Ref: Requirement "Salida ante garantía no sostenida".
- [x] **2.3** Agregar el flag / la conclusión de garantía a `### Expected output from @reviewer`
  (`agents/orchestrator.md:356-364`).
  Ref: Requirement "Salida ante garantía no sostenida".
- [x] **2.4** Hacer explícito que `GUARANTEE NOT SUSTAINED`, por ser `CRITICAL`, activa el `MUST
  STOP` ya existente (`agents/orchestrator.md:97`) y que **no se avanza hacia archive mientras esté
  presente**.
  Ref: Requirement "Salida ante garantía no sostenida" / Scenario "El flag no se degrada a warning".
- [x] **2.5** Confirmar que **no** se agrega un stage al flujo ni se modifica la construcción del
  working-context ni el runtime del orquestador.
  Ref: Requirement "Frontera y no-regresión del review" / Scenario "El flujo mantiene sus stages".

## 3. Scaffolding de content guards — `test/content-guards.test.js` (implementación)

> Guards content-based sobre `agents/*.md` (patrón existente: `describe` por tema, lectura por
> `ROOT/agents`). El diseño formal de casos y su ejecución pertenecen a `@tester` (sección 4).

- [x] **3.1** Agregar un bloque `describe` que afirme que `agents/reviewer.md` declara el flag
  `GUARANTEE NOT SUSTAINED` con severidad `CRITICAL`.
  Ref: Requirement "Salida ante garantía no sostenida" / Scenario "El flag nombra garantía, operación
  y estado".
- [x] **3.2** Afirmar que `agents/reviewer.md` declara la señal `S1 ∧ S2` y que `S1` sola no es
  suficiente (no ejecuta el análisis sin `S1 ∧ S2`).
  Ref: Requirement "Señal de aplicabilidad del análisis de modelo" / Scenario "Change doc-only o
  cosmético sin claims de efecto".
- [x] **3.3** Afirmar que `agents/reviewer.md` exige leer el código fuente más allá del diff y
  reportar el contexto faltante en lugar de asumir.
  Ref: Requirement "Inputs y contexto del reviewer para el análisis de modelo".
- [x] **3.4** Afirmar que `agents/orchestrator.md` propaga la garantía y el estado protegido, y que
  trata `GUARANTEE NOT SUSTAINED` como bloqueo.
  Ref: Requirement "Frontera y no-regresión del review".

## 4. Tests y verificación — propiedad de `@tester`

> **Esta sección la ejecuta `@tester`, no `@coder`.** Los invariantes negativos están declarados en
> el delta spec como *no-testeable-por-construcción*; se anclan por contenido (presencia de la regla
> en el artefacto), no por comportamiento de runtime.

- [x] **4.1** Completar/crear formalmente los casos de los guards de la sección 3 y correr
  `node --test test/content-guards.test.js`.
  Ref: Requirement "Salida ante garantía no sostenida".
- [x] **4.2** Probar el invariante negativo — un change sin garantías de efecto **no** dispara el
  análisis de modelo — como content guard que afirma la presencia de la cláusula negativa en
  `agents/reviewer.md` ("sin `S1 ∧ S2` no ejecuta el análisis de modelo"). Ancla por contenido
  porque la no-acción de un agente no tiene salida observable.
  Ref: Requirement "Señal de aplicabilidad del análisis de modelo" / Scenario "Change sin garantías
  de efecto no paga el análisis de modelo".
- [x] **4.3** Correr el foco con
  `node --test --test-name-pattern="garantía" test/content-guards.test.js` y registrar el resultado.
  Ref: Requirement "Salida ante garantía no sostenida".
- [x] **4.4** Verificar por inspección del artefacto que **no** se agregó un stage y que la
  verificación implementación↔delta spec sigue siendo obligatoria (invariante estructural negativo).
  Ref: Requirement "Frontera y no-regresión del review" / Scenario "El flujo mantiene sus stages".

## 5. Validación real del repo

- [x] **5.1** `node --test test/content-guards.test.js` en verde.
- [x] **5.2** `node --test` completo en verde (o registrar el resultado y los fallos preexistentes
  ajenos a este change, si los hubiera).
