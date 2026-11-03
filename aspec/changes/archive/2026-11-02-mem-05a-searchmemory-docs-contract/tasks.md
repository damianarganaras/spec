# Tasks: MEM-05a — Docs de searchMemory alineados al contrato preview

> Sin `design.md`. Sin Work Item: Azure DevOps está deshabilitado en este repositorio.
>
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`, tests
> `npm test`; para pasos acotados, `npm test` con rutas explícitas (nunca `node --test` sin
> acotar). Format: `not-configured`. Typecheck: no aplica.
>
> Paths autorizados: `AGENTS.md`, `PRODUCT.md`, `templates/AGENTS.md`, `templates/PRODUCT.md`,
> `README.md`, `src/cli/index.js`, `test/cli.test.js` (sólo el tester, sólo cobertura de merge) y
> este directorio de change. `test/content-guards.test.js` queda fuera de alcance.

## Fase 1 — Fuente canónica del protocolo en AGENTS.md

- [x] T1.1 En `templates/AGENTS.md`, envolver en su lugar la sección completa
      `## Memoria Persistente (Protocolo Reactivo)` (heading y cuerpo, hoy `:34-58`) en
      `<!-- LOCKED: memory-protocol -->` … `<!-- /LOCKED: memory-protocol -->`. No tocar el bloque
      `LOCKED: memory-boundary` ni el resto del archivo.
- [x] T1.2 Reescribir el contenido del bloque con las tres partes: (a) cuándo consultar la memoria,
      incluido que el `<ContextOverflowWarning>` nombra las `memory_key` omitidas (hasta 40, sufijo
      `+N`) y que la recuperación es un Recall acotado —una sola delegación a `@memory-keeper` con
      el topic de la tarea— sin repetir el contexto completo ni indicar `searchMemory` para
      recuperar lo omitido; (b) contrato de `searchMemory`: preview por defecto (prefijo literal de
      hasta 240 caracteres, `limit` 5, `content_truncated`), el preview no es el texto íntegro,
      `expand: true` devuelve el payload completo, `keys` expande selectivo y falla si la clave no
      está en la página, `required` es entrada de llamada que falla si excede el `limit` o el
      presupuesto; (c) comportamiento: contexto de lectura, puede estar desactualizado, no pisa
      seguridad/validación/diseño vigente, reportar la discrepancia. Mantener el idioma y el tono
      del archivo.
- [x] T1.3 Replicar el mismo bloque en `AGENTS.md` raíz envolviendo en su lugar la sección actual
      (`:23-47`). No reordenar secciones ni bloques ajenos: el orden del archivo raíz puede diferir
      del template.
- [x] T1.4 Verificar que el texto no afirma que las `decision` de scope `project` se inyectan
      proactivamente y que las cifras coinciden con el contrato vigente (`≤240` caracteres
      literales, `limit` 5, tope de 40 claves con `+N`).

## Fase 2 — PRODUCT.md como puntero único

- [x] T2.1 En `templates/PRODUCT.md`, reemplazar el blockquote de memoria (`:28-31`) por una línea
      de puntero a `AGENTS.md` → bloque `LOCKED: memory-protocol`. Dejar `Repository App ID` y
      `Scope` (`:25-26`) fuera de cualquier bloque y con su contenido intacto.
- [x] T2.2 En `PRODUCT.md` raíz, reemplazar el blockquote legado (`:30-33`) por el mismo puntero y
      corregir el bullet de guardrails (`:95`) para que remita al protocolo canónico en lugar de
      repetir la invocación de `searchMemory` ante el warning. Preservar `Repository App ID` y
      `Scope` (`:27-28`).
- [x] T2.3 Verificar que ninguno de los dos `PRODUCT.md` repite los detalles normativos del
      contrato (preview, `expand`, `keys`, `required`, `content_truncated`): sólo el puntero.

## Fase 3 — README

- [x] T3.1 Actualizar la fila de `searchMemory` (`README.md:435`) para describir el modo por
      defecto (preview de hasta 240 caracteres literales, `limit` 5, `content_truncated`), las
      entradas `expand`, `keys` y `required`, y la remisión al protocolo canónico de `AGENTS.md`.
      No cambiar las demás filas ni la descripción general del motor.

## Fase 4 — Reconciliación del texto plano legado

- [x] T4.1 Extender el modelo de `LEGACY_SIGNATURES` (`src/cli/index.js:1447-1459`) para una firma
      de run contiguo multilínea: heading, líneas exactas del run y terminadores permitidos.
      Mantener `validation-commands-flat` con su comportamiento actual.
- [x] T4.2 Registrar la firma de `AGENTS.md` para el protocolo de memoria: run exacto desde
      `## Memoria Persistente (Protocolo Reactivo)` hasta la última línea de la lista que sigue a
      `**Comportamiento:**`, cerrado por `<!-- LOCKED: memory-boundary -->` o
      `<!-- LOCKED: validation-commands -->` en la siguiente línea no vacía. El bloque
      `LOCKED: memory-boundary` se conserva.
- [x] T4.3 Registrar la firma de `PRODUCT.md` para el blockquote legado: las cuatro líneas exactas
      de `PRODUCT.md:30-33` / `templates/PRODUCT.md:28-31`, cerrado por el separador `---` de la
      sección siguiente. La firma se acota por `filename` a `PRODUCT.md`.
- [x] T4.4 En `reconcileLegacyBlocks` (`:1465-1494`): aplicar las firmas sólo fuera de bloques
      `LOCKED` (el bloque canónico no debe disparar un aviso), exigir coincidencia exacta línea a
      línea, emitir `ancleto: bloque legado de <label> no reconocido en <filename>; revisar` y no
      tocar el archivo cuando no coincide, no dejar blancos colgando tras la remoción y mantener la
      idempotencia (segunda ejecución sin cambios ni avisos).
- [x] T4.5 Confirmar que `copyTemplates` (`:1517`) e `importCmd` (`:3828`) siguen pasando por
      `mergeTemplateInto` y que no se agrega un segundo punto de merge ni se llama `mergeLocked`
      directo desde install/update/upgrade/import.
- [x] T4.6 Verificar que, en una instalación que tenía el protocolo plano seguido del bloque de
      validaciones, el orden final es `validation-commands`, `memory-protocol`,
      `memory-boundary`, sin duplicar bloques y sin perder contenido del usuario.

## Fase 5 — Cobertura y validación (tester)

- [x] T5.1 Correr lint y suite completa según los comandos declarados: `npm run lint` y `npm test`.
- [x] T5.2 Agregar en `test/cli.test.js` un caso de `upgrade` sobre una copia pre-change con el
      protocolo plano seguido de `memory-boundary`: se elimina el texto plano, se inserta
      `LOCKED: memory-protocol`, no se duplica y `memory-boundary` se conserva.
- [x] T5.3 Agregar el caso con el bloque `LOCKED: validation-commands` entre el protocolo plano y
      `memory-boundary`: el texto plano también se elimina y el orden final es válido.
- [x] T5.4 Agregar el caso de `PRODUCT.md`: tras `upgrade`, el blockquote legado ya no está, las
      secciones del usuario se preservan y el puntero de una línea está presente en una instalación
      nueva.
- [x] T5.5 Agregar el caso de contenido personalizado: si una línea del run fue editada, el run
      personalizado no se elimina y no se borra contenido del usuario, se emite el aviso y el merge
      del mismo pase puede insertar el bloque canónico; un segundo `upgrade` no duplica ni elimina
      contenido y no emite un aviso por el bloque canónico.
- [x] T5.6 Agregar el caso de `import` de bundle: el destino con el protocolo plano también queda
      reconciliado.
- [x] T5.7 Confirmar que no se tocó `test/content-guards.test.js` y registrar como deuda declarada
      la falta de un content guard para el bloque nuevo y para la ausencia de duplicación en
      `PRODUCT.md`.
