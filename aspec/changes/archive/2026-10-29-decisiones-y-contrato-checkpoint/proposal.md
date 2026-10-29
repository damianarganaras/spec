# Proposal: decisiones-y-contrato-checkpoint

## Problema

Los generadores producen `design.md` como destino de las decisiones técnicas y el checkpoint posterior
a `@spec-writer` enumera los documentos generados. Eso acopla el control humano a la existencia de un
archivo que PR-4 elimina y deja el "por qué" fuera de la fuente versionada recuperable: el proposal no
registra la alternativa descartada ni la evidencia. Resultado esperado: `proposal.md` registra cada
decisión con su alternativa descartada y su fuente, y el checkpoint aprueba el contrato del cambio
—intención, alcance, Requirement nuevo o existente, riesgos, decisión de arquitectura si aplica,
validación prevista y paths autorizados— en menos de una pantalla.

## Alcance

Dentro:

- `agents/spec-writer.md` — define el shape de `## Decisiones` (bloque de 6 campos y forma de una línea
  con equivalencia semántica) y la regla de que la sección se completa también durante la implementación.
- `agents/orchestrator.md` — cambia el objeto del checkpoint posterior a `@spec-writer` al contrato del
  cambio; agrega la enmienda obligatoria cuando un tradeoff de implementación cambia alcance, riesgo o
  arquitectura; conserva los stops de archive y merge explícitos y separados, sin enumerar documentos.
- `skills/ancleto-propose/SKILL.md` — el template del proposal emite `## Decisiones`.
- `skills/ancleto-ff/SKILL.md` — el template del proposal emite `## Decisiones`.
- `skills/ancleto-continue/SKILL.md` — el template del proposal emite `## Decisiones`.
- `skills/ancleto-new/SKILL.md` — el template del proposal emite `## Decisiones`.
- `skills/ancleto-onboard/SKILL.md` — el proposal que escribe la ruta de onboarding emite `## Decisiones`.
- `skills/ancleto-upgrade/references/templates.md` — el template del proposal de upgrade emite
  `## Decisiones`.
- `test/content-guards.test.js` — aloja los guards T01, T05, T22, T12 y T13 y los tests de mutación de
  ese contrato.
- `aspec/changes/decisiones-y-contrato-checkpoint/specs/prompt-contracts/spec.md` — delta `ADDED`-only
  con los dos `Requirement` del contrato (checkpoint de contrato y `## Decisiones`); el merge a
  `aspec/specs/` ocurre recién en el archive.
- `aspec/changes/decisiones-y-contrato-checkpoint/` — artifacts de este change.

Fuera:

- Eliminar `design.md` ni `context.md` del flujo nuevo (PR-4). `design.md` sigue existiendo y sigue
  generándose.
- Promoción a memoria, backfill de las 5 decisiones históricas, refs obligatorias (PR-3).
- Conformidad sin delta (PR-5).
- `src/**` y cualquier `aspec/specs/**`.
- Editar `.opencode/**` a mano; los mirrors se regeneran sólo con `ancleto upgrade`.

## Riesgos y aprobación

- Relajar el checkpoint y perder control sobre alcance/riesgo → mitigación: el resumen de aprobación
  conserva los 7 campos, la enmienda es obligatoria ante cambio de alcance, riesgo o arquitectura, y el
  guard T22 la exige.
- Guard tautológico → mitigación: los helpers `normalize`, `deBold` y `section` ya existen en
  `test/content-guards.test.js`; el slice por sección acota el assert y la mutación corre sobre una copia
  scratch.
- Lectura de "PR-4 adelantado" → mitigación: `design.md` sigue en los generadores y T01 en PR-2 no
  afirma su ausencia; esa aserción queda diferida explícitamente a PR-4.
- Red-first sin rojo real → mitigación: los tests se ejecutan antes del cambio y el rojo se registra con
  su causa.
- El delta se desincroniza de la redacción final del checkpoint → mitigación: si la implementación ajusta
  el contrato, se resincroniza el delta antes del archive (regla de `## Iteration & Spec Sync` del
  orquestador).
- Los mirrors `.opencode/**` quedan con el prompt viejo hasta correr `ancleto upgrade` → mitigación: la
  regeneración es parte del cierre del change y se verifica contra `agents/*.md`; `.opencode/` está
  gitignoreado y no entra al commit.
- `ancleto-update` y `ancleto-explore` siguen ruteando la decisión de diseño a `design.md` → mitigación:
  deuda declarada para PR-4, que es el PR que elimina el artifact.
- Una decisión escrita en la forma de una línea no registra `memory_key` ni `Estado`, y PR-3 los necesita
  para promover → mitigación: PR-3 debe derivar `memory_key` de forma determinística a partir de la
  decisión, o restringir la forma de una línea a decisiones no promovibles; queda registrado como entrada
  de PR-3, no como defecto de PR-2.

Estado del checkpoint: **aprobado explícitamente por el usuario** (2026-10-29), con delta `ADDED`-only
en `prompt-contracts`.

## Delta spec

Se genera un delta `ADDED`-only en `aspec/specs/prompt-contracts/spec.md`
(`aspec/changes/decisiones-y-contrato-checkpoint/specs/prompt-contracts/spec.md`). Motivo:
`prompt-contracts` es la capability que ya norma los contratos del prompt del orquestador —
`### Requirement: Ownership de commit, merge y push`, `### Requirement: Intake de sesión con estado del
árbol y changes activos`, `### Requirement: Ningún agente borra change folders`,
`### Requirement: Campo change diff en el retorno de @tester` — así que la convención del repo es que un
contrato nuevo del orquestador se registra ahí. El delta **agrega** dos `Requirement` y **no reescribe
ninguno existente**: 0 requisitos canónicos modificados, medido como "texto de los `Requirement`
existentes byte-idéntico". Sin delta, este PR dejaría comportamiento observable sin spec y PR-5 lo leería
como cambio funcional no registrado.

## Decisiones

- **memory_key:** change-checkpoint-object
  **Elección:** el checkpoint posterior a `@spec-writer` aprueba el contrato del cambio (intención,
  alcance, Requirement nuevo o existente citado, riesgos, decisión de arquitectura si aplica, validación
  prevista, paths autorizados) presentado en menos de una pantalla.
  **Descartado:** mantener un checkpoint que aprueba los artifacts/documentos generados.
  **Justificación:** aprobar documentos acopla el stop humano a la existencia de un archivo (`design.md`)
  que PR-4 elimina; aprobar el contrato conserva el control sobre lo que el humano realmente puede
  juzgar —alcance, requisito y riesgo— y el stop sigue siendo explícito y único.
  **Refs:** `change:decisiones-y-contrato-checkpoint`;
  `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`
  **Estado:** aprobado

- **memory_key:** proposal-decisiones-shape
  **Elección:** `## Decisiones` en `proposal.md` con bloque de 6 campos (`memory_key`, `Elección`,
  `Descartado`, `Justificación`, `Refs`, `Estado`), admitiendo la forma de una línea con equivalencia
  semántica.
  **Descartado:** mantener `design.md` como destino de las decisiones técnicas.
  **Justificación:** el proposal versionado en Git es la fuente recuperable del "por qué"; `design.md`
  desaparece del flujo en PR-4 y su contenido único son precisamente las decisiones. Un shape fijo
  habilita la promoción determinística de PR-3 sin parsear prosa libre.
  **Refs:** `change:decisiones-y-contrato-checkpoint`;
  `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`
  **Estado:** aprobado

- **memory_key:** decisiones-durante-implementacion
  **Elección:** todo tradeoff no previsto que nazca durante la implementación se apendea a
  `proposal ## Decisiones`; lo escribe `@spec-writer` (dueño del artifact) a pedido del orquestador, y
  exige enmienda aprobada sólo si cambia alcance, riesgo o arquitectura.
  **Descartado:** que el orquestador o `@coder` escriban el proposal directamente; y que la decisión de
  implementación se pierda al cerrar la sesión.
  **Justificación:** el orquestador no tiene `write` y `@coder` no es dueño de artifacts; delegar la
  escritura preserva propiedad y permisos. La enmienda condicionada evita burocracia en tradeoffs
  internos que no cambian el contrato.
  **Refs:** `change:decisiones-y-contrato-checkpoint`;
  `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`
  **Estado:** aprobado

- **memory_key:** pr2-delta-added-only
  **Elección:** PR-2 genera un delta `ADDED`-only en `prompt-contracts` con dos `Requirement` nuevos
  (checkpoint de contrato y `## Decisiones`), sin reescribir ningún `Requirement` existente.
  **Descartado:** no generar delta (deja comportamiento observable sin spec y PR-5 lo leería como cambio
  funcional no registrado); y modificar los `Requirement` existentes de `prompt-contracts`.
  **Justificación:** `prompt-contracts` ya norma los contratos del prompt del orquestador (ownership de
  commit/merge/push, intake, `change diff`, invariante de borrado), así que es el hogar correcto;
  `ADDED`-only conserva "0 requisitos canónicos modificados" y el merge queda para el archive.
  **Refs:** `change:decisiones-y-contrato-checkpoint`;
  `spec:prompt-contracts#Ownership de commit, merge y push`; `path:aspec/specs/prompt-contracts/spec.md`
  **Estado:** aprobado

- **memory_key:** t01-design-md-diferido
  **Elección:** en PR-2, T01 verifica que los generadores emiten `## Decisiones` y que el delta se sigue
  generando; la aserción "sin `design.md`" se difiere a PR-4.
  **Descartado:** adelantar la no-generación de `design.md` dentro de PR-2.
  **Justificación:** el orden canónico es PR-2 → PR-3 → PR-4; adelantar la eliminación dejaría las 5
  decisiones históricas sin destino. Un guard que hoy afirme "sin `design.md`" fallaría por diseño.
  **Refs:** `change:decisiones-y-contrato-checkpoint`;
  `path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`
  **Estado:** aprobado

- **memory_key:** amendment-generadores-completos
  **Elección:** completar la sección `## Decisiones` en todos los generadores del proposal y dejar el
  `Requirement` universal, en lugar de acotar el `Requirement` a los generadores que tocó el PR.
  **Descartado:** acotar el `Requirement` a `@spec-writer`, `ancleto-propose` y `ancleto-ff`; y ampliar
  además a `ancleto-update` y `ancleto-explore`.
  **Justificación:** acotar el `Requirement` codificaría en la canon un accidente de alcance del PR, y
  dejaría sin `memory_key` ni `Estado` a las rutas que el PR no toca, que es justo la identidad que
  PR-3 necesita para promover. `ancleto-update` y `ancleto-explore` quedan afuera porque todavía derivan
  la decisión de diseño a `design.md` y desarmarlas es PR-4.
  **Refs:** `change:decisiones-y-contrato-checkpoint`; `path:skills/ancleto-continue/SKILL.md`;
  `path:skills/ancleto-upgrade/references/templates.md`
  **Estado:** aprobado

- **memory_key:** decisiones-una-sola-fuente
  **Elección:** el shape completo de `## Decisiones` se declara una sola vez, en `agents/spec-writer.md`;
  los seis skills que generan el proposal enuncian sólo los keywords de comportamiento (sección, seis
  campos, forma de una línea) y referencian esa fuente.
  **Descartado:** repetir la cláusula de definición literal en los siete generadores y fijarla en el
  guard.
  **Justificación:** `prompt-contracts` prohíbe que un prompt duplique texto normativo ya presente en su
  fuente canónica y que un guard fije la redacción literal de los prompts; el repo migra esos guards al
  tocar su contrato, y este change lo toca. La duplicación además obligaba a siete ediciones por cada
  cambio de redacción.
  **Refs:** `spec:prompt-contracts#Fuente única de las reglas compartidas entre skill y agente`;
  `spec:prompt-contracts#Asserts de comportamiento en los content guards`;
  `path:agents/spec-writer.md`
  **Estado:** aprobado
