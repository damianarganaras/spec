# Tasks: Recall de memoria con BM25 primario

> Alcance: sÃ³lo `src/core/memory/engine.js` (`compareRecall`) y los tests que fijan el orden de `searchMemory`.

## ImplementaciÃ³n

- [x] En `src/core/memory/engine.js`, reordenar `compareRecall` a `required â†’ bm25 ascendente â†’ anclaje declarado â†’ scope â†’ memory_key`, manteniendo el resto del contrato de `searchMemory` intacto.
- [x] Actualizar el comentario de `compareRecall` para describir el nuevo orden total.

## Tests

- [x] Reescribir `test/memory-engine.test.js:4332` ("T1.2 tier: anclaje declarado") para el nuevo orden: el anclaje sÃ³lo desempata cuando el `bm25` empata.
- [x] Agregar o ajustar un test que fije que un nodo con mejor `bm25` gana a uno anclado o de scope mÃ¡s especÃ­fico.
- [x] Verificar que los tests de empate por `memory_key` (`memory-search-order-tiebreak`) siguen vÃ¡lidos con el nuevo orden y ajustarlos si asumen anclaje o scope previos.
- [x] Verificar que los tests de `required` (orden declarado, fail-closed, exceso de `required`) siguen pasando sin cambios de expectativa.

## ValidaciÃ³n

- [x] Ejecutar `npm run lint`.
- [x] Ejecutar `npm test` o `node --test test/memory-engine.test.js` con rutas explÃ­citas.
- [x] Registrar en `proposal.md ## Decisiones` cualquier tradeoff no anticipado durante la implementaciÃ³n.
