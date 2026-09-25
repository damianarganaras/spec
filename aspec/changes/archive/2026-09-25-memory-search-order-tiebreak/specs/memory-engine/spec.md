# Spec delta: memory-search-order-tiebreak

## MODIFIED Requirements

### Requirement: Límites del fallback OR-prefijo de `searchMemory`

`searchMemory` SHALL resolver cada consulta en dos passes sobre el índice FTS5, con builders
propios en `src/core/memory/engine.js`: la **pass 1** con AND sobre los términos crudos citados
(`ftsQuery`) y la **pass 2** con OR sobre prefijos `*` derivados de la tokenización
(`ftsQueryLoose`). La pass 2 SHALL ejecutarse únicamente cuando la pass 1 devuelve 0 resultados;
NO SHALL ampliar el recall sobre un hit ya existente de la pass 1. Los resultados de cada pass
SHALL ordenarse por `rank` con el mejor primero —en FTS5 `bm25` es negativo y `ORDER BY rank` es
numéricamente ascendente, por lo que NO SHALL usarse `rank DESC`— y SHALL aplicar un desempate
secundario por `n.rowid` ascendente: `ORDER BY rank, n.rowid`. Ante un empate de `rank`, gana el
nodo con `rowid` menor (el más antiguo). El desempate SHALL aplicarse tanto a la pass 1 (AND) como
a la pass 2 (OR con prefijos), de modo que el orden sea **total**. Cuando la cantidad de
coincidencias supere el `limit`, ese orden total SHALL determinar de forma unívoca el subconjunto
truncado.

`searchMemory` SHALL ser determinista para un estado de BD fijo: la misma query sobre el mismo
corpus devuelve resultados idénticos en contenido y orden. La variabilidad de resultados con una
misma query NO SHALL atribuirse a aleatoriedad de la búsqueda, sino a mutación concurrente del
corpus entre invocaciones.

#### Scenario: El fallback no se ejecuta si la pass 1 tiene resultados

- **WHEN** una consulta produce al menos un resultado en la pass 1 (AND con términos crudos)
- **THEN** `searchMemory` devuelve ese resultado
- **AND** no ejecuta la pass 2 (OR con prefijos), por lo que el recall no se amplía sobre un hit
  existente

#### Scenario: Los términos únicos o prefijos cortos pueden desplazar al nodo esperado

- **WHEN** la consulta se compone de un solo término, o de términos que la tokenización reduce a
  prefijos cortos (p. ej. `work`, `mem`)
- **THEN** la pass 1 puede devolver 0 resultados y la pass 2 amplía el recall
- **AND** el nodo esperado puede quedar en posición #2 o posterior (reproducido: `work` y `mem`
  dejan al nodo esperado en #2 de forma sistemática, 10/10 invocaciones)

#### Scenario: Determinismo para un estado de BD fijo

- **WHEN** se ejecuta la misma consulta dos veces sobre un corpus sin cambios entre invocaciones
- **THEN** `searchMemory` devuelve resultados idénticos en contenido y orden
