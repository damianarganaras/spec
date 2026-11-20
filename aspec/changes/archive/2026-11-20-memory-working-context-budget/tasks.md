# Tasks: memory-working-context-budget

> Implementación y tests en tareas separadas; cada tarea es verificable por sí sola.
> Validaciones declaradas: `npm run lint` (`eslint src/ test/ scripts/`) y `npm test`
> (`node --test "test/*.test.js"`). Para validaciones acotadas, pasar rutas explícitas; nunca
> `node --test` sin acotar. Format: `not-configured`; typecheck: n/a (JavaScript sin `tsconfig`).
> Sin schema, sin dependencias nuevas y sin cambios en `searchMemory`.

## Fase 1 — Resolución del presupuesto

- [x] 1. En `src/core/memory/working-context.js`, agregar y exportar
      `resolveWorkingContextMaxTokens(projectRoot)` con la precedencia
      `ANCLETO_WORKING_CONTEXT_TOKENS` → `.ancletorc` → default 4000. Devolver `Infinity` para `0`
      o `"unlimited"`; devolver 4000 ante valor inválido, vacío, de tipo inesperado o `.ancletorc`
      ausente/ilegible/JSON inválido. La función no lanza, recorta espacios y no escribe nada.
- [x] 2. En `renderWorkingContextBlock`, pasar el presupuesto resuelto al engine en lugar de
      `undefined`. Mantener el resto de la firma y el camino sin engine (día-cero) intactos, para que
      refresh on-write, `memory context --out`, frescura y MCP compartan la misma resolución.

## Fase 2 — Default y modo sin tope en el engine

- [x] 3. En `src/core/memory/engine.js`, subir `MAX_TOKENS` a 4000 y mantener
      `CHARS_PER_TOKEN = 4`. No tocar la aritmética del presupuesto finito: reserva
      `min(1500, 15% de maxChars)`, piso estructural y corte por regla quedan iguales.
- [x] 4. Tratar el modo sin tope de forma explícita en `buildWorkingContext` antes de calcular
      `maxChars` y antes de la rama `!Number.isFinite(maxChars)`: incluir todas las filas, no reservar
      para el aviso, no emitir `<ContextOverflowWarning>`, no emitir el `console.warn` de reglas
      omitidas y no pasar por el piso estructural.
- [x] 5. Verificar que `required` sigue resolviéndose antes del corte y sigue fail-closed con
      presupuestos finitos; con modo sin tope ninguna requerida puede quedar fuera ni disparar el
      error de presupuesto. Conservar exacto el literal `${omitted} rules omitted.` y el texto del
      aviso.

## Fase 3 — Tests

- [x] 6. En `test/working-context.test.js`, agregar un helper que guarde, fije y restaure
      `process.env.ANCLETO_WORKING_CONTEXT_TOKENS` en `finally`, y usarlo en todo test que dependa del
      entorno para evitar fuga entre casos.
- [x] 7. Actualizar T7 (`con presupuesto ajustado una no critica no desplaza a la critica`) al default
      de 4000: re-ajustar el tamaño de las reglas para que siga habiendo exactamente una omitida bajo
      16.000 caracteres, y afirmar que sin configuración la crítica queda fuera y con `criticalKeys`
      entra. Mantener la aserción del aviso (`1 rules omitted`, `Omitted: bulk-plain`).
- [x] 8. Actualizar T12 (`el aviso de overflow ... no cambia sin configuracion critica`) para que el
      corpus fuerce overflow bajo el default de 4000. Conservar literal la aserción de content guard
      sobre `${omitted} rules omitted.` (texto, conteo y orden) y la comparación byte-idéntica con
      configuración crítica inválida/ausente.
- [x] 9. Agregar tests de configuración: `memory.maxTokens` válido cambia el corte (p. ej. 2000 vuelve
      al techo de 8.000); valores inválidos (`-1`, `1.5`, `"abc"`, `"12abc"`, `null`, booleano) y
      `.ancletorc` ausente/JSON inválido resuelven al default de 4000 sin lanzar; el entorno válido
      prevalece sobre `.ancletorc`; un entorno inválido resuelve al default y no cae a `.ancletorc`.
- [x] 10. Agregar tests de modo sin tope: `0` y `"unlimited"` (en `.ancletorc` y en el entorno)
      incluyen todas las `memory_key` activas, no emiten `<ContextOverflowWarning>` ni `console.warn`
      de omisión, dejan el bloque XML bien formado y no disparan el error de `required`.
- [x] 11. Verificar que ningún otro test asume el default de 2.000: revisar usos de
      `buildWorkingContext` sin `maxTokens` en `test/memory-engine.test.js`,
      `test/working-context.test.js`, `test/memory-fixtures.test.js` y `test/repair-refs.test.js`, y
      ajustar los que dependan de un corte implícito. Los usos con `2000` explícito no cambian.

## Fase 4 — Validación

- [x] 12. Correr `npm run lint` y `npm test`; para la validación acotada usar
      `node --test test/working-context.test.js test/memory-engine.test.js`. Registrar el resultado y
      cualquier omisión declarada (format `not-configured`, typecheck n/a).
