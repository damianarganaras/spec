# Tasks: decisiones-y-contrato-checkpoint

## Estado

- **Fase actual:** revisión final
- **Última validación:** `node --test test/content-guards.test.js` 103/103 · `npm test` 649 pass / 0 fail /
  4 skip (653 tests totales) · `npm run lint` exit 0 · format `not-configured` · typecheck no aplica
- **Bloqueos:** ninguno
- **Paths relevantes:** `agents/spec-writer.md`, `agents/orchestrator.md`,
  `skills/ancleto-propose/SKILL.md`, `skills/ancleto-ff/SKILL.md`, `skills/ancleto-continue/SKILL.md`,
  `skills/ancleto-new/SKILL.md`, `skills/ancleto-onboard/SKILL.md`,
  `skills/ancleto-upgrade/references/templates.md`, `test/content-guards.test.js`,
  `aspec/changes/decisiones-y-contrato-checkpoint/`
- **Siguiente paso:** review independiente final, luego checkpoint de archive
- **Alcance de `Scenario: Solo decisiones duraderas`:** la mitad "ni se promueve a memoria" la enforza **PR-3**
  (`agents/memory-keeper.md`, barra de promoción) porque `agents/memory-keeper.md` y `skills/ancleto-archive/` no
  están en los paths autorizados de PR-2; la mitad "no se registra como decisión en el proposal" queda cubierta por
  el guard de T01.

## 1. Rojo (red-first)

- [x] Escribir el guard T01 en `test/content-guards.test.js`: itera sobre los siete generadores del
  proposal (`@spec-writer`, `ancleto-propose`, `ancleto-ff`, `ancleto-continue`, `ancleto-new`,
  `ancleto-onboard`, `ancleto-upgrade`) y verifica que emiten `## Decisiones`; el delta spec se sigue
  generando. No afirmar la ausencia de `design.md`: esa aserción queda diferida a PR-4.
- [x] Escribir el guard T05: la regla de que `## Decisiones` se completa también durante la
  implementación está declarada en `agents/spec-writer.md`.
- [x] Escribir el guard T22: `agents/orchestrator.md` exige enmienda aprobada cuando un tradeoff de
  implementación cambia alcance, riesgo o arquitectura.
- [x] Escribir el guard T12: una tarea trivial no agrega aprobaciones extra; el checkpoint sigue siendo
  único y explícito.
- [x] Escribir el guard T13: un cambio crítico conserva checkpoint, Validation Ledger cerrado y review
  independiente, y los stops de archive y merge siguen separados y explícitos.
- [x] Agregar los tests de mutación en copia scratch: el guard debe fallar si `## Decisiones` desaparece
  del proposal generado y si el checkpoint vuelve a exigir "documentos".
- [x] Ejecutar `node --test test/content-guards.test.js` antes de tocar los generadores y registrar el
  rojo con su causa correcta (el guard falla por el contrato ausente, no por un error del test).

## 2. Verde

- [x] `agents/spec-writer.md`: definir el shape de `## Decisiones` (bloque de 6 campos y forma de una
  línea equivalente) y la regla de que se completa también durante la implementación.
- [x] `agents/orchestrator.md`: cambiar el objeto del checkpoint posterior a `@spec-writer` al contrato
  del cambio; agregar la enmienda obligatoria ante cambio de alcance, riesgo o arquitectura; mantener los
  stops de archive y merge separados y sin enumerar documentos.
- [x] `skills/ancleto-propose/SKILL.md`: emitir `## Decisiones` en el template del proposal.
- [x] `skills/ancleto-ff/SKILL.md`: emitir `## Decisiones` en el template del proposal.
- [x] `skills/ancleto-continue/SKILL.md`: emitir `## Decisiones` en el template del proposal.
- [x] `skills/ancleto-new/SKILL.md`: emitir `## Decisiones` en el template del proposal.
- [x] `skills/ancleto-onboard/SKILL.md`: emitir `## Decisiones` en el proposal de la ruta de onboarding.
- [x] `skills/ancleto-upgrade/references/templates.md`: emitir `## Decisiones` en el template del
  proposal de upgrade.
- [ ] El delta `specs/prompt-contracts/spec.md` ya existe y describe exactamente lo que los generadores
  deben emitir; si la redacción final del checkpoint o del shape de `## Decisiones` se aparta del delta,
  resincronizarlo antes del archive.
- [x] Volver a ejecutar `node --test test/content-guards.test.js` y confirmar verde.

## 3. Mirrors

- [x] Ejecutar `ancleto upgrade` para regenerar los mirrors desde la fuente canónica; no editar
  `.opencode/**` a mano.
- [x] Verificar que las 10 líneas `model:` de los agentes no cambiaron.
- [x] Verificar que el diff de los mirrors contra `agents/*.md` es sólo el bloque de compresión del
  orquestador.

## 4. Validación

- [x] Ejecutar `npm run lint`.
- [x] Ejecutar `npm test`.
- [x] Si `npm` falla por el shim del entorno, usar
  `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint` y
  `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test` con el mismo resultado.
- [x] Registrar `format` como `not-configured` (el proyecto no declara formatter) y dejar constancia en
  el resumen de cierre.

## 5. Cierre

- [x] Re-correr `@tester` y `@reviewer` sobre el diff completo tras la enmienda.
- [ ] Solicitar review independiente del diff completo.
- [ ] Confirmar que no se modificó ningún `Requirement` canónico en `aspec/specs/**` (0 requisitos
  modificados).
- [ ] Abrir el checkpoint de archive y esperar la aprobación explícita del usuario; el archive nunca es
  automático.
