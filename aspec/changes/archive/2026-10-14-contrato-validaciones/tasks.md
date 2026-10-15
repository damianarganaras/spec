# Tasks: Contrato de validaciones declarativo por proyecto

> Convención: implementación y validación van en secciones separadas. Implementación y testing no se
> mezclan en un mismo ítem.

## Fase 0 — Secuencia y dependencia (PRIMER task)

- [x] T0.1 Declarar la **dependencia de secuencia** con `token-budget` (archivado
  `aspec/changes/archive/2026-10-14-token-budget/`): ambos tocan `templates/AGENTS.md` y
  `test/content-guards.test.js`; `token-budget` va primero (ya archivado), este change después.
  **No mergear en paralelo**; resolver cualquier conflicto de merge sobre esos dos archivos tomando el
  estado archivado como base.

## Fase 1 — Política declarativa en `templates/AGENTS.md`

- [x] T1.1 Reemplazar la lista fija de validaciones (`templates/AGENTS.md:22-25`) por un bloque
  `LOCKED: validation-commands` con la política: correr solo lo declarado en `PRODUCT.md` →
  `## Project Commands`; si falta, saltear y registrar; nunca inventar.
- [x] T1.2 Incluir en la política: format check solo si hay formatter declarado, si no `not-configured`;
  tests vía comando declarado o rutas explícitas, nunca `node --test` pelado.
- [x] T1.3 Ubicar el bloque como primer `LOCKED` del archivo (host-neutral, sin nombrar hosts/tools de
  host) para que `findInsertAnchor` lo inserte antes de `memory-boundary` en proyectos existentes.

## Fase 2 — Declaración real en `PRODUCT.md`

- [x] T2.1 Corregir `PRODUCT.md:115`, que afirma que no hay scripts npm (`lint`/`test` sí existen,
  `package.json:33-36`).
- [x] T2.2 Declarar en `PRODUCT.md` → `## Project Commands` los valores reales: lint = `npm run lint`;
  tests = `npm test` (o rutas explícitas); typecheck = no aplica; format = `not-configured`.

## Fase 3 — De-hardcodear coder y tester

- [x] T3.1 `agents/coder.md:95`: reemplazar "Prettier rules" por el formatter declarado por el proyecto
  (o `not-configured` si no hay), conservando la conducta de dejar format/lint/tests al tester.
- [x] T3.2 `agents/coder.md:117`: reemplazar "Prettier formatting and relevant ESLint rules" por el
  formatter/linter declarados (`PRODUCT.md` → `## Project Commands`).
- [x] T3.3 `agents/tester.md:133`: correr el format check declarado (si lo hay) sin `--write`, luego el
  lint declarado; `not-configured` si no hay formatter.
- [x] T3.4 `agents/tester.md:145`: idem para test files.
- [x] T3.5 `agents/tester.md:151`: reemplazar "do not run Prettier with `--write`" por el formateador
  declarado; conservar Validation Ledger, prioridad de verificación y manejo de snapshots.
- [x] T3.6 Verificar que ningún prompt de agente queda con Prettier/ESLint hardcodeado.

## Fase 4 — Superficies de skill (upgrade y pr)

> Fuente canónica: `skills/` (raíz). `.opencode/skills/` es la copia instalada (dogfooding) y se regenera
> en `install`/`upgrade`; no se edita a mano.

- [x] T4.1 `skills/ancleto-upgrade/references/templates.md:89-95`: reemplazar los `REQ-V-*` hardcodeados
  (TypeScript/tests/lint) por verificación referenciada a los comandos declarados; emitir cada `REQ-V-*`
  sólo si el comando está declarado.
- [x] T4.2 `skills/ancleto-upgrade/references/templates.md:170-198`: quitar el typecheck incondicional
  (`npx tsc --noEmit`, T-V-001) y alinear `npm run build`/`npm run lint`/`npm test`/`npm run test:ci` a
  los comandos declarados; el gating `:198` pasa a "declarado por el proyecto".
- [x] T4.3 `skills/ancleto-pr/SKILL.md:79`: reemplazar `Unit tests pass (\`npm test\`)` por el comando de
  test declarado por el proyecto.

## Fase 5 — content-guards

- [x] T5.1 `test/content-guards.test.js`: agregar asserts de comportamiento para la política
  (`LOCKED: validation-commands`, `PRODUCT.md`/`## Project Commands`, `not-configured`, nunca inventar).
- [x] T5.2 `test/content-guards.test.js`: assert de que `templates/AGENTS.md` no fija `npm run typecheck`
  ni un formatter concreto como obligatorio.
- [x] T5.3 `test/content-guards.test.js`: assert de que `agents/coder.md` y `agents/tester.md` no
  hardcodean Prettier (`doesNotMatch(/Prettier/)`) y referencian los comandos declarados.
- [x] T5.4 `test/content-guards.test.js`: assert de que `skills/ancleto-upgrade/references/templates.md`
  no fija un typecheck incondicional ni comandos npm concretos y referencia los comandos declarados.
- [x] T5.5 `test/content-guards.test.js`: assert de que `skills/ancleto-pr/SKILL.md` no fija `npm test` y
  referencia el comando declarado.
- [x] T5.6 Verificar que se conservan los guards de las salvaguardas intocables (bash:false en
  reviewer/orchestrator/spec-writer, cinco flags, Validation Ledger, bloqueo por CRITICAL).

## Fase 6 — Sitios residuales del contrato (scope ampliado, aprobado)

> El usuario aprobó ampliar el scope para incluir 3 sitios residuales que repetían comandos/tooling
> hardcodeados. `skills/` (raíz) es la fuente canónica; `.opencode/skills/` no se edita.

- [x] T6.1 `PRODUCT.md:94`: alinear la lista stale de validaciones con `## Project Commands` y el bloque
  LOCKED `validation-commands`; eliminar el `typecheck` y la nota falsa "`package.json` no define esos
  scripts". No inventar comandos.
- [x] T6.2 `skills/ancleto-security/SKILL.md:23`: de-hardcodear el ejemplo de static analysis/lint;
  referenciar los comandos declarados (`PRODUCT.md` → `## Project Commands`) o `not-configured` si no
  hay; sin literales Prettier/ESLint.
- [x] T6.3 `skills/ancleto-upgrade/SKILL.md:287`: reemplazar la lista fija
  `build/lint/test/test:ci/typecheck` por las validaciones declaradas por el proyecto (`PRODUCT.md` →
  `## Project Commands`) o `not-configured` si no hay.
- [x] T6.4 `test/content-guards.test.js`: asserts de comportamiento para `PRODUCT.md`,
  `ancleto-security/SKILL.md` y `ancleto-upgrade/SKILL.md` (referencian los comandos declarados; sin
  typecheck/Prettier/ESLint ni enumeración fija).

## Fase 7 — Reconciliación de bloques legados en `install`/`update`/`upgrade` (hallazgo material de review; `import` cubierto en Fase 10)

> Motivo: `mergeLocked` (`src/cli/index.js:1290-1315`) sólo reemplaza/inserta bloques `LOCKED`; la lista
> plana vieja de validaciones **sobrevive** en instalaciones existentes (prueba: `AGENTS.md:22-25`) y
> coexiste con el bloque nuevo. `copyTemplates` (`:1392`) mergea `AGENTS.md`/`PRODUCT.md` (`:24`)
> por bloques; `.opencode/skills/` se copia entero. El update debe dejar el proyecto coherente **sin
> pasos manuales**. **Toda** ruta que mergea `TEMPLATES` debe reconciliar (no sólo `copyTemplates`); la
> generalización a `import` se completó en Fase 10 con el punto único `mergeTemplateInto`.

- [x] T7.1 En `src/cli/index.js`, agregar la reconciliación de bloques legados que corre **antes** de
  `mergeLocked`, guiada por una tabla declarativa de firmas legadas `{ id, pattern, replacement }`.
  (Ubicación inicial en `copyTemplates`; Fase 10 la extrae al punto único `mergeTemplateInto`, invocado
  por toda ruta que mergea `TEMPLATES`.)
- [x] T7.2 Registrar la firma legada de la lista plana de validaciones (heading
  `**Validaciones obligatorias antes de cerrar una tarea**:` + sus ítems `npm run typecheck`/`npx tsc
  --noEmit`, `npm run lint`, `npm test`) con reemplazo vacío; tolerar `\r\n` y espaciado.
- [x] T7.3 Garantizar **seguridad**: si la firma no coincide exactamente, no tocar y emitir aviso
  (`bloque legado de validaciones no reconocido; revisar`); nunca borrar contenido fuera del bloque
  identificado.
- [x] T7.4 Garantizar **idempotencia**: re-ejecutar `install`/`upgrade` no duplica ni rompe; no
  introducir texto host-específico ni nuevas dependencias (zero-deps).

## Fase 8 — Tests de la reconciliación (separados de la implementación)

- [x] T8.1 `test/cli.test.js`: crear un `AGENTS.md` pre-change que conserva la lista plana vieja → tras
  `upgrade` queda **sin** la lista plana, **con** el bloque `LOCKED: validation-commands`, sin duplicar y
  preservando el resto (p. ej. una sección personalizada del usuario).
- [x] T8.2 `test/cli.test.js`: caso idempotente → correr `upgrade` dos veces produce el mismo resultado.
- [x] T8.3 `test/cli.test.js`: caso seguro → si la lista fue personalizada (no coincide con la firma), no
  se elimina y se emite el aviso.

## Fase 9 — Correcciones menores aprobadas

- [x] T9.1 `PRODUCT.md:20`: alinear el conteo "7 archivos de suite" a los 10 reales (`test/*.test.js`) o
  remitir a `## Project Commands`.
- [x] T9.2 `PRODUCT.md:94`: eliminar la duplicación de la lista de validaciones; dejar sólo la referencia
  a `## Project Commands` y al bloque LOCKED `validation-commands` (sin enumerar `npm run lint`/`npm test`).
- [x] T9.3 `skills/ancleto-upgrade/references/templates.md:175`: reemplazar el literal
  `npx nx affected --target=<target>` por "el target declarado".
- [x] T9.4 `test/content-guards.test.js:554`: actualizar el guard del Nx para asertar la **condición**
  ("only when declared" / declared target) en vez del literal `npx nx affected`.
- [x] T9.5 `test/content-guards.test.js`: assert de que `PRODUCT.md` no duplica la lista de validaciones
  (sólo referencia a `## Project Commands`) y de que el conteo de la suite no está stale.

## Fase 10 — Fix de review (CRITICAL + suggestion aprobada)

> Motivo: `importCmd` (`src/cli/index.js`) iteraba `TEMPLATES` y llamaba a `mergeLocked` sin
> reconciliar la lista plana legada, dejando guía vieja + bloque nuevo coexistiendo en el
> destino de un `import`. Además, el detector `closed` de `reconcileLegacyBlocks` sólo
> reconocía ítems con marcador `-`, pudiendo dejar líneas huérfanas.

- [x] T10.1 Extraer `mergeTemplateInto(source, local, filename)` como punto único
  (reconcilia bloques legados antes de `mergeLocked`) e invocarlo desde `copyTemplates` e
  `importCmd`; sin duplicar el patrón.
- [x] T10.2 Ampliar el detector `closed` para reconocer marcadores `*`/`+`/`-` y líneas de
  continuación indentadas (semántica conservadora: no-op + aviso ante ambigüedad).
- [x] T10.3 `test/cli.test.js`: caso de `import` sobre un `AGENTS.md` pre-change con la lista
  plana → queda limpio, con el bloque canónico, sin duplicar y preservando el resto.
- [x] T10.4 `test/cli.test.js`: casos de cierre extendido (`*`/`+` y continuación indentada) →
  no-op + aviso, sin líneas huérfanas.

## Validación (separada de implementación)

- [x] V1 `node --test test/content-guards.test.js` en verde (asserts nuevos + salvaguardas).
- [x] V2 `node --test test/cli.test.js` en verde (merge/instalación de `LOCKED` + reconciliación de
  bloques legados).
- [x] V3 `npm run lint` en verde.
- [x] V4 Suite completa `npm test` (`node --test "test/*.test.js"`) en verde (438/438).
- [x] V5 Confirmar que ningún asset compartido gana texto host-específico (política host-neutral).
- [x] V6 Confirmar el bloque `LOCKED: validation-commands` re-aplicado/insertado sin tocar el resto del
  `AGENTS.md` local (no breaking).
- [x] V7 Confirmar el upgrade de una instalación existente: `AGENTS.md` con la lista plana vieja queda
  limpio (sin coexistencia), sin duplicar y preservando el resto.
- [x] V8 (review fix) `node --test test/cli.test.js` + `node --test test/content-guards.test.js` en
  verde, más eslint scoped sobre `src/` y `test/`.
