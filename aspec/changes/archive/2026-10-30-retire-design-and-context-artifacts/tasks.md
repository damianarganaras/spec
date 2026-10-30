# Tasks: Retiro de `design.md` y `context.md` del flujo nuevo

## Fase 1 — Retirar la generación (implementación)

- [x] 1.1 En `agents/spec-writer.md`, quitar `design.md` del set mínimo de artifacts (lista de
  `## Required Workflow` paso 5) y quitar la regla de escritura «Keep design focused on technical
  approach» de `## Writing Rules`; el set queda `proposal.md`, `tasks.md` y `specs/`.
- [x] 1.2 En `skills/ancleto-propose/SKILL.md`, eliminar el paso `4b. design.md`, renumerar los pasos
  restantes y ajustar el guardrail que enumera proposal/design/tasks.
- [x] 1.3 En `skills/ancleto-ff/SKILL.md`, quitar `design.md` del conjunto y del orden de generación.
- [x] 1.4 En `skills/ancleto-continue/SKILL.md`, quitar `design.md` del orden de dependencia, del
  template de artifact y del guardrail «proposal → specs → design → tasks»; dejar `context.md` como
  lectura legacy opcional, nunca artifact generado.
- [x] 1.5 En `skills/ancleto-new/SKILL.md`, quitar `design.md` de la secuencia estándar y ajustar el
  conteo de artifacts (`0/4` → `0/3`).
- [x] 1.6 En `skills/ancleto-onboard/SKILL.md`, quitar `design.md` de la secuencia narrada y del ejemplo.
- [x] 1.7 En `skills/ancleto-upgrade/SKILL.md` y `skills/ancleto-upgrade/references/templates.md`, quitar
  `design.md` de las instrucciones y del template de artifacts de change.
- [x] 1.8 En `skills/ancleto-explore/SKILL.md`, quitar `design.md` de las salidas/derivaciones del flujo.
- [x] 1.9 En `skills/ancleto-workflow/SKILL.md`, quitar `design.md` de la tabla «By change state» y de la
  nota de `update`.

## Fase 2 — Relajar consumidores (implementación)

- [x] 2.1 En `agents/orchestrator.md`, quitar `design.md` de la enumeración de artifacts presentes
  (`Active Change Check`); conservar la regla negativa que prohíbe condicionar el stop a `design.md`.
- [x] 2.2 En `agents/coder.md`, `agents/tester.md` y `agents/reviewer.md`, reemplazar «`design.md` when
  needed» por lectura legacy opcional que nunca es precondición.
- [x] 2.3 En `agents/documenter.md`, quitar el presence check de `design.md`.
- [x] 2.4 En `skills/ancleto-apply/SKILL.md`, quitar `design.md` de la carga de artifacts de entrada.
- [x] 2.5 En `skills/ancleto-verify/SKILL.md`, enmendar la completitud para que cubra `tasks.md` y
  `specs/` y la coherencia trate `design.md` como legacy opcional; quitar «No design.md to verify
  against» como hueco.
- [x] 2.6 En `skills/ancleto-bulk-archive/SKILL.md`, quitar `design.md` de la carga/chequeo de artifacts y
  retirar el borrado de `context.md` previo al move.
- [x] 2.7 En `skills/ancleto-update/SKILL.md`, cambiar la clasificación «decisión de diseño →
  `design.md`» por «→ `proposal.md ## Decisiones`», y marcar `design.md`/`context.md` como lectura legacy
  opcional en el paso de lectura.
- [x] 2.8 En `skills/ancleto-archive/SKILL.md`, retirar el borrado de `context.md` (paso y guardrail); el
  archive mueve el directorio del change sin modificarlo. Hacer lo mismo en el paso de archive narrado
  por `skills/ancleto-onboard/SKILL.md`.

## Fase 3 — Guards (`test/content-guards.test.js`)

- [x] 3.1 Invertir el guard diferido de PR-2 («los generadores siguen emitiendo `design.md`») en un
  predicado negativo: ningún generador emite `design.md`; el guard nombra el archivo que incumple.
- [x] 3.2 Agregar el predicado negativo para `context.md`, que hoy no tiene guard, con el mismo alcance
  de generadores/consumidores.
- [x] 3.3 Agregar una mutación scratch por cada predicado nuevo en el bloque de mutaciones existente,
  verificando que reinsertar la mención rompe el guard y que el estado actual lo pasa.
- [x] 3.4 Agregar un control positivo de que la lectura legacy sigue nombrada en `continue`/`update`, para
  que el guard negativo no se satisfaga borrando toda mención de los artifacts retirados.

## Fase 4 — Validación (separada de la implementación)

- [x] 4.1 Verificar por grep acotado a `agents/**` y `skills/**` que no quedan menciones de `design.md` o
  `context.md` como artifact generado/exigido; las menciones restantes son legacy, archive o
  `memory-ops` histórico.
- [x] 4.2 Ejecutar `npm run lint` (comando declarado por el proyecto).
- [x] 4.3 Ejecutar `npm test` (comando declarado; incluye `test/content-guards.test.js`). El format check
  reporta `not-configured`; typecheck no aplica.
- [x] 4.4 Regenerar los mirrors con `ancleto upgrade` (nunca a mano en `.opencode/**`) y verificar que
  las 10 líneas `model:` no cambiaron.
- [x] 4.5 Verificar que los delta specs conservan los keywords canónicos (`### Requirement:`,
  `#### Scenario:`, `**WHEN**`/`**THEN**`, `SHALL`) y que la clasificación de `artifact-update` ya no
  mapea a `design.md`.
- [x] 4.6 Actualizar la documentación de usuario que presentaba design.md como artifact producido
  (`docs/skill-*`, `README.md` si aplica), sin tocar docs de planificación ni históricos.

## Fase 5 — Cierre

- [ ] 5.1 Ofrecer `ancleto-verify` antes del archive, porque el cambio altera comportamiento
  especificado (`specs/` presente).
- [x] 5.2 Registrar la opción B diferida en `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` como nueva
  subsección `### 4.5b`, inmediatamente después de `### 4.5`, titulada «PR-4b — CH-02c: backfill de
  decisiones desde design.md archivados (opción B)», dejando constancia de que: (a) se ejecuta DESPUÉS
  de archivar este change; (b) sólo lee los 27 `design.md` archivados y escribe en memoria vía
  `recordDecision` con `refs: change:<slug>`, requiriendo el OK explícito del usuario para las
  escrituras de memoria; (c) los archivos archivados NO se borran ni se reescriben; (d) sólo se
  capturan las decisiones que pasan el test de candidatos de §5.7, nunca se fabrican `Descartado` ni
  `Justificación` que el original no tenía; (e) `context.md` es un no-problema: 0 existen en el archive.
