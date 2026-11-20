## MODIFIED Requirements

### Requirement: Recall task-aware con orden total, preview expandible y keys requeridas

`searchMemory` SHALL devolver resultados en un orden total determinístico, independiente de
`n.rowid` y del orden físico de inserción, aplicado después de filtrar `status = 'active'` y el
`type` solicitado. El orden SHALL ser, en este orden:

1. Nodos cuyas `memory_key` están declaradas en `required`, en el orden declarado por el llamador.
2. `bm25` ascendente, con el mejor primero.
3. Nodos que declaran al menos una ref `spec:`, `change:` o `path:` en su bloque `refs:`
   (anclaje declarado, decidido parseando el content sin resolver refs ni hacer I/O) antes que los
   que no declaran ninguna.
4. Scope más específico según `SCOPE_RANK`: `task` antes que `feature` antes que `project`.
5. `memory_key` lexicográfico ascendente.

`n.rowid` NO SHALL usarse como criterio de orden ni como desempate. Cuando la cantidad de
coincidencias supere el `limit`, el subconjunto devuelto SHALL ser el prefijo de longitud `limit`
de ese orden total. Dos corridas sobre un mismo estado SHALL devolver el mismo contenido y el mismo
orden.

`searchMemory` SHALL devolver previsualizaciones por defecto y NO SHALL incluir el `content`
completo en ese modo. Cada resultado previsualizado SHALL incluir `memory_key`, `type`, `scope`,
`created_at`, `preview` y `content_truncated`. La `preview` SHALL ser un prefijo literal del
`content` —los mismos bytes para ese tramo, sin normalizar espacios ni saltos de línea— de a lo sumo
240 caracteres; cuando el `content` exceda 240 caracteres, la `preview` SHALL ser
`content.slice(0, 239)` seguida de `…`, y cuando no exceda, SHALL ser el `content` sin cambios. Si el
último code unit del corte es un high surrogate (`0xD800`–`0xDBFF`), el corte SHALL reducirse un code
unit más, de modo que la `preview` resultante siga siendo de a lo sumo 240 caracteres y siempre un
prefijo literal del `content`.
`content_truncated` SHALL ser `true` exactamente cuando el `content` excede 240 caracteres; a 240
caracteres exactos NO SHALL haber recorte y `content_truncated` SHALL ser `false`. NO SHALL existir
truncamiento sin marca.

`expand: true` SHALL devolver el `content` completo en lugar de la previsualización, con la forma
heredada exacta de seis campos: `memory_key`, `type`, `scope`, `content`, `justification` y
`created_at`. `keys` SHALL expandir el `content` completo únicamente de las `memory_key` indicadas
que estén presentes en la página devuelta; el resto de la página SHALL conservar la previsualización.
Una `memory_key` pedida que esté ausente de la página devuelta —aunque exista en la DB— SHALL
provocar un error explícito que la nombre, sin descartarla en silencio. Si se envían `expand: true` y
`keys` a la vez, `expand: true` SHALL prevalecer.

El `limit` por defecto SHALL ser 5 y SHALL conservar el clamp `[1, 50]`. El payload heredado se
garantiza con `expand: true` y un `limit` explícito; el cambio de default de 10 a 5 es intencional
y forma parte del contrato nuevo.

`required` SHALL ser una lista de `memory_key` recibida en la llamada, NO SHALL persistirse y NO
SHALL ser una columna ni una tabla. En `searchMemory`, los nodos requeridos SHALL devolverse primero
aun cuando el match FTS no los incluya, y SHALL respetar el filtro `type` y `status = 'active'`. Si
una `memory_key` requerida no existe, no está activa o no satisface el filtro `type`, la llamada
SHALL fallar con un error que nombre la `memory_key`; nunca SHALL omitirla en silencio. Si
`required.length` excede el `limit` efectivo, la llamada SHALL fallar con un error que nombre las
`memory_key` que no entran; nunca SHALL descartarlas. Cuando la
consulta no produce términos FTS y hay keys requeridas, la llamada SHALL devolver las requeridas y
ningún otro resultado; sin keys requeridas SHALL devolver `[]`.

`buildWorkingContext` SHALL aceptar `required` con la firma
`buildWorkingContext(scope, maxTokens, cwd, { required })`, preservando la firma posicional vigente
`(scope, maxTokens, cwd)`. Las reglas requeridas SHALL
inyectarse completas y primero, en el orden declarado. Si una `memory_key` requerida no existe como
`rule` activa del scope inyectado, la construcción SHALL fallar con un error que nombre la
`memory_key`. Si una regla requerida no entra en el presupuesto disponible —el mismo techo que usa
la inclusión normal: `maxChars` menos el wrapper y la reserva del aviso—, la construcción SHALL
fallar con un error que nombre la `memory_key` y la ruta repo-relativa de sus refs resueltas,
obtenida reutilizando `resolveNodeRefs`; si ninguna ref declarada resuelve con `ok: true` y `path`
—no declara refs, o todas están rotas, ambiguas o sin raíz—, el error SHALL indicar
`sin refs resolubles`. La construcción NO SHALL truncar el contenido de una regla requerida, NO
SHALL devolver un bloque parcial y NO SHALL degradar la requerida a una omisión silenciosa.

#### Scenario: El requerido va primero aunque el bm25 lo deje último

- **WHEN** `searchMemory` recibe `required: ['k-req']` y la query matchea `k-req` junto con nodos de
  mejor `bm25`
- **THEN** `k-req` es el primer resultado
- **AND** el resto conserva el orden total

#### Scenario: El bm25 manda sobre el anclaje y el scope

- **WHEN** dos nodos empatan en requerido y uno tiene mejor `bm25`
- **AND** el otro declara una ref `spec:`, `change:` o `path:` y tiene un scope más específico
- **THEN** se ordena primero el nodo con mejor `bm25`
- **AND** si sólo entra uno en el `limit`, entra el de mejor `bm25`

#### Scenario: El anclaje desempata cuando el bm25 empata

- **WHEN** dos nodos empatan en requerido y en `bm25`
- **AND** uno declara una ref `spec:`, `change:` o `path:` mientras el otro no declara ninguna
- **THEN** el nodo anclado se ordena antes, aunque el otro tenga un scope más específico

#### Scenario: El scope desempata después del anclaje

- **WHEN** dos nodos empatan en requerido, `bm25` y anclaje declarado
- **THEN** el de scope `task` se ordena antes que el de scope `feature`
- **AND** el de scope `feature` se ordena antes que el de scope `project`

#### Scenario: El empate de bm25 se resuelve por memory_key, no por rowid

- **WHEN** varios nodos con contenido idéntico empatan en `bm25`, anclaje y scope, y `limit` es menor
  que la cantidad de coincidencias
- **THEN** el subconjunto devuelto son las `memory_key` lexicográficamente menores
- **AND** insertar los mismos nodos en orden inverso no cambia el subconjunto ni el orden

#### Scenario: Reconstruir la DB no cambia el orden

- **WHEN** se exporta el corpus y se importa en una base nueva, de modo que los `rowid` cambian
- **THEN** la misma query devuelve el mismo orden y el mismo subconjunto de `memory_key`

#### Scenario: La previsualización se marca

- **WHEN** el `content` de un nodo excede 240 caracteres y se invoca `searchMemory` sin `expand`
- **THEN** el resultado incluye `preview` de como máximo 240 caracteres terminado en `…`
- **AND** `content_truncated` es `true`
- **AND** el resultado no incluye el campo `content`

#### Scenario: Exactamente 240 caracteres no se recorta

- **WHEN** el `content` de un nodo tiene exactamente 240 caracteres y se invoca `searchMemory` sin `expand`
- **THEN** `preview` es el `content` completo, sin `…`
- **AND** `content_truncated` es `false`

#### Scenario: 241 caracteres se recorta como prefijo literal

- **WHEN** el `content` de un nodo tiene 241 caracteres y se invoca `searchMemory` sin `expand`
- **THEN** `preview` tiene 240 caracteres, termina en `…` y sus primeros 239 caracteres coinciden con los primeros 239 del `content`
- **AND** `content_truncated` es `true`

#### Scenario: expand devuelve el payload heredado

- **WHEN** se invoca `searchMemory` con `expand: true`
- **THEN** cada resultado tiene exactamente los seis campos heredados
- **AND** `content` coincide byte a byte con el contenido almacenado

#### Scenario: keys expande sólo las claves pedidas presentes en la página

- **WHEN** se invoca `searchMemory` con `keys: ['k2']` sobre una página que contiene `k1` y `k2`
- **THEN** `k2` devuelve su `content` completo
- **AND** `k1` conserva su previsualización

#### Scenario: Una clave pedida ausente de la página falla

- **WHEN** `keys` incluye una `memory_key` ausente de la página devuelta, aunque exista en la DB
- **THEN** la llamada falla nombrando la clave
- **AND** no devuelve resultados parciales

#### Scenario: El default de limit es 5

- **WHEN** se omite `limit` y hay más de cinco coincidencias
- **THEN** se devuelven cinco resultados

#### Scenario: Una key requerida inexistente falla

- **WHEN** `searchMemory` recibe `required` con una `memory_key` que no existe o está inactiva
- **THEN** la llamada falla con un error que nombra la `memory_key`
- **AND** no devuelve resultados parciales

#### Scenario: required excedido falla nombrando las keys que no entran

- **WHEN** `searchMemory` recibe `required` con más `memory_key` que el `limit` efectivo
- **THEN** la llamada falla con un error que nombra las `memory_key` que no entran
- **AND** no descarta ninguna requerida en silencio ni eleva el `limit`

#### Scenario: Una requerida fuera de presupuesto falla con key y ruta

- **WHEN** `buildWorkingContext` recibe `required` y una regla requerida no entra en el presupuesto
- **THEN** la construcción falla con un error que nombra la `memory_key`
- **AND** el error incluye la ruta repo-relativa de las refs resueltas de esa regla
- **AND** no se devuelve un bloque parcial

#### Scenario: La requerida sin refs resolubles se informa como tal

- **WHEN** una regla requerida no entra en el presupuesto y ninguna ref declarada resuelve con `ok: true` y `path`
- **THEN** el error indica `sin refs resolubles` junto con la `memory_key`

#### Scenario: required no se persiste

- **WHEN** se invoca `buildWorkingContext` o `searchMemory` con `required`
- **THEN** el nodo recuperado después no expone un campo `required`
- **AND** el schema de la base no incorpora columnas ni tablas por `required`
