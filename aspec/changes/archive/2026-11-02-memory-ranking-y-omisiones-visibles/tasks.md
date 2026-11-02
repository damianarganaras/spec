# Tasks: ranking de inyección y omisiones visibles

> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint` y tests
> `npm test` (acotado con rutas explícitas). Format: `not-configured`; typecheck: no aplica.

## Fase 1 — Orden determinístico con anclaje

- [x] T1.1 Extraer en `src/core/memory/engine.js` una función pura que determine si un `content`
  declara anclaje, reutilizando `parseRefsBlock` y aceptando sólo refs `spec:`, `change:` o `path:`.
- [x] T1.2 Garantizar que la detección de anclaje no resuelve refs ni accede al filesystem ni a la
  base; un bloque `refs:` inválido, múltiple o con sólo `commit:`/`workitem:` no cuenta como anclaje.
- [x] T1.3 Ordenar en `buildWorkingContext` las filas ya filtradas por: scope (`task` → `feature` →
  `project`), anclaje declarado, `created_at DESC`, `memory_key` ascendente.
- [x] T1.4 Reemplazar el desempate por `rowid` del `ORDER BY` por el desempate total que cierra en
  `memory_key`, sin alterar el filtro `type = 'rule' AND status = 'active'` ni la jerarquía de scope.

## Fase 2 — Presupuesto que incluye el aviso

- [x] T2.1 Calcular `maxChars = maxTokens × CHARS_PER_TOKEN` y la reserva del aviso
  `min(1.500, 15% de maxChars)`, acotada a `maxChars`.
- [x] T2.2 Cortar reglas contra el presupuesto disponible para reglas, descontando wrapper, etiqueta
  de no confiables, cierre `</ProjectMemoryRules>` y la reserva del aviso.
- [x] T2.3 Verificar que el bloque completo, incluido el `<ContextOverflowWarning>`, no supere
  `maxChars` para presupuestos que cubren el piso fijo.
- [x] T2.4 Conservar el comportamiento para presupuestos por debajo del piso fijo: bloque XML bien
  formado, sin reglas incluidas.

## Fase 3 — Manifiesto de claves omitidas

- [x] T3.1 Construir el manifiesto de `memory_key` omitidas respetando el orden determinístico de
  inyección.
- [x] T3.2 Incluir el manifiesto en `<ContextOverflowWarning>` con tope de 40 claves y sufijo `+N`
  para la cantidad de omitidas no listadas.
- [x] T3.3 Ajustar el manifiesto a la reserva de caracteres: si la reserva corta antes que el tope,
  listar menos claves y hacer que `+N` cuente todas las no listadas.
- [x] T3.4 Conservar el prefijo `Context truncated due to size limits. <n> rules omitted`, el
  conteo, el `console.warn` y la indicación de delegar un Recall a `@memory-keeper`; no mencionar
  `searchMemory`.

## Fase 4 — Tests

- [x] T4.1 Orden: una regla anclada se ordena antes que una no anclada del mismo scope y gana la
  retención cuando sólo entra una.
- [x] T4.2 Orden: una regla `task` se ordena antes que una `project` en un contexto `task`.
- [x] T4.3 Orden: el empate se resuelve por `created_at` y, si persiste, por `memory_key`.
- [x] T4.4 Presupuesto: con `maxTokens` chico pero suficiente para el piso fijo, la longitud total
  del bloque incluido el aviso es menor o igual a `maxTokens × 4`.
- [x] T4.5 Manifiesto: las claves omitidas aparecen en el aviso y en el orden de inyección.
- [x] T4.6 Manifiesto: con más de 40 omitidas aparece el sufijo `+N` con la cantidad correcta.
- [x] T4.7 Regresiones: el aviso no nombra `searchMemory`, conserva el conteo de omitidas y el
  `console.warn` se ejecuta.
- [x] T4.8 Determinismo: dos renders consecutivos sobre el mismo estado producen el mismo bloque.
- [x] T4.9 Actualizar las pruebas de truncamiento existentes cuyos conteos exactos dependen de la
  aritmética de presupuesto anterior, preservando sus invariantes: reglas enteras, XML cerrado y
  conteo correcto de omitidas.
- [x] T4.10 Verificar que las pruebas de frescura y comparación de bloque en
  `test/working-context.test.js` siguen pasando sin cambios de contrato.

## Fase 5 — Validación declarada

- [x] T5.1 Correr `npm run lint`.
- [x] T5.2 Correr los tests acotados:
  `node --test test/memory-engine.test.js test/working-context.test.js`.
- [x] T5.3 Correr la suite completa `npm test`.
- [x] T5.4 Registrar el format check como `not-configured` y el typecheck como no aplicable.
