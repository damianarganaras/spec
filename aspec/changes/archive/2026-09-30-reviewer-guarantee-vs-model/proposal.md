# Proposal: Verificación de la garantía del proposal bajo el modelo real en el reviewer

## Related Work Item

Sin Work Item (Azure DevOps deshabilitado en `.ancletorc`).

## Problema

El reviewer actual verifica que la implementación sea consistente con el delta spec, pero no tiene
mandato explícito de verificar que la **garantía declarada en el proposal** se sostenga bajo el
**modelo real** del sistema. Puede aprobar un change correcto contra el delta spec cuya garantía es
falsa.

Caso concreto (`working-context-refresh-on-memory-write`): el trigger especificado `(rule + project)`
cumplía el delta spec, pero la garantía del proposal —"una `decision` no puede afectar el
working-context" / "`recordDecision` no dispara refresh"— era falsa. `recordDecision`, vía
`memory_key`, puede superseder una `rule` activa de scope `project` y **retirarla** del conjunto
activo que alimenta `<ProjectMemoryRules>`. El reviewer lo detectó, pero **solo porque tuvo acceso al
código y usó criterio propio — no porque el flujo se lo exigiera**.

El gap es de mandato y de inputs: hoy `agents/reviewer.md` no pide evaluar la garantía contra las
operaciones que mutan el estado protegido, y el flujo no garantiza que el reviewer reciba la
garantía ni el modelo de estado.

## Cambio propuesto

Agregar al **review existente** un mandato explícito de verificación de garantía bajo el modelo real,
sin agregar un stage nuevo:

1. **Mandato**: el reviewer verifica que la garantía del proposal se sostiene bajo el modelo real =
   conjunto de operaciones que pueden mutar el estado protegido, incluidas las que el change NO
   introduce (supersesión, operaciones de otros módulos, efectos indirectos). Es **adicional** a la
   consistencia implementación↔delta spec, no la reemplaza.
2. **Señal de aplicabilidad**: el análisis de modelo se aplica solo con la señal S1 ∧ S2 de
   `effect-claim-detection-signal`; nunca para changes simples, doc-only o cosméticos.
3. **Salida**: un flag nuevo `GUARANTEE NOT SUSTAINED`, severidad `CRITICAL` (bloqueante), que nombra
   la garantía, la operación que la falsa y el estado protegido.
4. **Inputs**: garantía extraída del proposal, modelo de estado protegido y acceso de lectura al
   código fuente relevante (no limitado al diff). El orquestador propaga la garantía y el estado en
   la delegación del review.

## Decisiones de producto (respuestas explícitas)

1. **Señal**: S1 ∧ S2 de `effect-claim-detection-signal`. S1 = el claim nombra una operación
   identificable y lleva cuantificador universal/negativo; S2 = esa operación escribe por una
   identidad no acotada sobre un store cuyo read-model es una proyección filtrada/ordenada. S1 sola
   no alcanza (sobre-dispara).
2. **Qué produce**: un flag **nuevo** `GUARANTEE NOT SUSTAINED`, clasificado `CRITICAL` — no un
   `WARNING` genérico. El orquestador ya se detiene ante critical, por lo que el bloqueo reutiliza la
   regla existente y no requiere stage nuevo.
3. **Cómo sabe el orquestador qué contexto pasar**: el proposal declara la garantía de forma
   extraíble; el orquestador la incluye, como campo separado, en la delegación del review junto con
   el estado protegido y la capability afectada. Si el reviewer no logra resolver la superficie de
   escritura o el read-model con ese contexto, lo reporta al orquestador en vez de asumir la garantía.

**Frontera del cambio (respuesta a la pregunta de diseño)**: requiere cambios en **ambos** — el
agente reviewer (mandato, señal, salida) y el orquestador (instrucción y contexto de la delegación).
Alcanza con cambios en los agentes; **no** se modifica el runtime del orquestador ni se agrega un
stage al flujo.

## Alcance

In scope:

- `agents/reviewer.md`: mandato de verificación de garantía, señal de aplicabilidad, flag
  `GUARANTEE NOT SUSTAINED` (CRITICAL), lectura del código relevante más allá del diff.
- `agents/orchestrator.md`: propagar la garantía extraída y el estado protegido en la delegación del
  review, y tratar `GUARANTEE NOT SUSTAINED` como bloqueo.
- `aspec/changes/reviewer-guarantee-vs-model/specs/review/spec.md`: delta spec (ADDED) de la
  capability nueva `review`.

Out of scope (no-goals):

- **No** se agrega un stage nuevo al flujo; la mejora vive dentro del review existente.
- **No** se cambia la verificación implementación↔delta spec: sigue siendo obligatoria.
- **No** se modifica el comportamiento runtime del orquestador ni la construcción del
  working-context.
- **No** se toca la detección de effect-claims del spec-writer ni el contenido de
  `effect-claim-detection-signal`.
- **No** se ejecuta el análisis de modelo para changes sin garantías de efecto.
- El reviewer **no** reemplaza al spec-writer ni al diseño: solo evalúa lo que ya existe.

## Riesgos

- **Falsos positivos de aplicabilidad**: S1 sobre-dispara. Mitigación — exigir S1 ∧ S2; S1 sola no
  habilita el análisis.
- **Costo en changes simples**: el análisis completo encarece el review. Mitigación — la señal de
  aplicabilidad lo acota; no se ejecuta cuando no hay garantías de efecto.
- **Dependencia de un flag nuevo**: si el orquestador no lo reconoce, el hallazgo no bloquea.
  Mitigación — el requirement fija que `GUARANTEE NOT SUSTAINED` es `CRITICAL` y el orquestador lo
  trata como bloqueo (regla de MUST STOP ante critical ya existente).
- **Contexto incompleto del reviewer**: podría no resolver el read-model. Mitigación — SHALL reportar
  el contexto faltante en vez de asumir la garantía.
- **Confusión con `SPEC UPDATE RECOMMENDED`**: son flags de distinta naturaleza (documentación vs
  garantía). Mitigación — el requirement los mantiene separados; `SPEC UPDATE RECOMMENDED` sigue
  limitado a `direct-implementation`.

## Preguntas abiertas y supuestos

Assumptions:

- La garantía del proposal es extraíble de una afirmación explícita del texto, no inferida.
- El lugar de implementación son los agentes fuente `agents/reviewer.md` y `agents/orchestrator.md`
  (se instalan en `.opencode/agents/`); existen content guards en `test/content-guards.test.js`.

Open questions:

1. ¿El flag nuevo debe llamarse exactamente `GUARANTEE NOT SUSTAINED`, o conviene apoyarse solo en la
   severidad `CRITICAL` sin nombre propio? (Este proposal elige el flag explícito.)
2. ¿El proposal debe tener una sección canónica "Garantía" para hacerla extraíble, o basta con
   detectarla en el texto? (Este proposal asume que basta; el formato canónico sería otro change.)
3. ¿El análisis de modelo aplica también a la revisión de `direct-implementation`, o solo al modo
   `aspec Change`? (Este proposal lo centra en `aspec Change`; en `direct-implementation` no hay
   proposal con garantía salvo que el orquestador la enuncie.)

## Nota sobre el contexto de origen

Sin Work Item asociado (Azure DevOps deshabilitado en `.ancletorc`). Contexto recibido con rutas
citadas y precedente de memoria del repo (`effect-claim-detection-signal`,
`negative-invariant-scenario-must-be-explicit`); se confirmó el estado real de `agents/reviewer.md`,
`agents/orchestrator.md` y `test/content-guards.test.js` antes de escribir. La delegación no declaró
un seed técnico.
