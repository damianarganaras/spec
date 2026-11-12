# Tasks: discovery-state-schema-wording

> corrección documental + aserción de test no comportamental. Release PATCH `0.30.2` (sin cambio de comportamiento, sin
> migración). El bump de `package.json`, tag y publish se ejecutan en el flujo de release, no acá.

## 1. Aplicar el delta (sin cambio de runtime)

- [ ] Confirmar que `specs/cli-diagnostics/spec.md` usa `## MODIFIED Requirements` y el título
      exacto `Semántica por segmentos de los patrones de exclusión del discovery`.
- [ ] Confirmar que el bloque restituye el cuerpo completo y los **10** escenarios del requirement
      canónico (`aspec/specs/cli-diagnostics/spec.md:990-1092`), sin omitir ninguno.
- [ ] Confirmar que la única corrección semántica es la cláusula del estado persistido
      (`version: 1` + `ruleVersion: 2`, sin `schemaVersion`) frente al schema de salida de
      `discovery --check` (`schemaVersion: 2`).
- [ ] Confirmar que no se toca `src/**` ni `aspec/specs/**` (el merge del delta ocurre en el
      archive).

## 2. Test de la forma persistida

- [ ] Extender el test «pin offline del estado de discovery» (`test/cli.test.js:9433-9474`) con
      `assert.ok(!('schemaVersion' in state))`.
- [ ] Conservar sin cambios las aserciones existentes: orden de claves, `version === 1`,
      `ruleVersion === 2`, golden, `\n` final único y ausencia de BOM.

## 3. Validación

- [ ] Ejecutar `npm run lint` (declarado en `PRODUCT.md` → `## Project Commands`).
- [ ] Ejecutar `node --test test/cli.test.js` (ruta explícita; el runner declarado es Node Test
      Runner).
- [ ] Registrar format check como `not-configured` y typecheck como `n/a` (no declarados en
      `PRODUCT.md` → `## Project Commands`).
