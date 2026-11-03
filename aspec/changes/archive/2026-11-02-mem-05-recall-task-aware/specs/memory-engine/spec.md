# Delta: memory-engine — recall task-aware

## MODIFIED Requirements

### Requirement: Límites del fallback OR-prefijo de `searchMemory`

`searchMemory` SHALL resolver cada consulta en dos passes sobre el índice FTS5, con builders
propios en `src/core/memory/engine.js`: la **pass 1** con AND sobre los términos crudos citados
(`ftsQuery`) y la **pass 2** con OR sobre prefijos `*` derivados de la tokenización
(`ftsQueryLoose`). La pass 2 SHALL ejecutarse únicamente cuando la pass 1 devuelve 0 resultados;
NO SHALL ampliar el recall sobre un hit ya existente de la pass 1.

Los resultados de cada pass SHALL ordenarse por el orden total definido en `Recall task-aware con
orden total, preview expandible y keys requeridas`: requerido, anclaje declarado, scope específico,
`bm25` ascendente y `memory_key` ascendente. En FTS5 `bm25` es negativo y `ORDER BY rank` es
numéricamente ascendente, por lo que NO SHALL usarse `rank DESC`. El orden NO SHALL usar `n.rowid`
como criterio ni como desempate. El orden SHALL aplicarse tanto a
la pass 1 (AND) como a la pass 2 (OR con prefijos), de modo que sea **total**. Cuando la cantidad
de coincidencias supere el `limit`, ese orden total SHALL determinar de forma unívoca el
subconjunto devuelto.

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
- **AND** el nodo esperado puede quedar en posición #2 o posterior; es una limitación conocida del
  fallback OR-prefijo, sin un conteo fijo de invocaciones

#### Scenario: Determinismo para un estado de BD fijo

- **WHEN** se ejecuta la misma consulta dos veces sobre un corpus sin cambios entre invocaciones
- **THEN** `searchMemory` devuelve resultados idénticos en contenido y orden

### Requirement: Aviso de overflow accionable para el orquestador

El `<ContextOverflowWarning>` emitido por `buildWorkingContext` SHALL nombrar únicamente capacidades
que el orquestador tiene: SHALL indicar que se delegue un Recall a `@memory-keeper` con el topic de
la tarea. NO SHALL referenciar `searchMemory` ni ninguna otra tool de la que el orquestador no
disponga.

El bloque completo `<ProjectMemoryRules>` —wrapper, etiqueta de datos no confiables, reglas
incluidas y `<ContextOverflowWarning>`— SHALL respetar el presupuesto
`maxTokens × CHARS_PER_TOKEN`. Antes de cortar reglas, el render SHALL reservar para el aviso
`min(1.500, 15% de maxChars)` caracteres, acotado a `maxChars`. Por debajo del piso que exige el
wrapper —`<ProjectMemoryRules>`, la etiqueta de datos no confiables y el cierre— NO SHALL incluirse
ninguna regla, y el bloque SHALL seguir siendo XML bien formado. El presupuesto SHALL considerarse
aplicable a todo `maxChars` que cubra ese piso.

Deuda declarada, fuera de este change: la ventana `[piso del wrapper, piso del wrapper + aviso
mínimo]`. En esa ventana puede entrar una regla corta aunque el contrato no lo permita, y si ni el
aviso mínimo entra, `formatOverflowWarning` devuelve `''` y la omisión no requerida queda sólo en
`console.warn`. No se toca la aritmética del presupuesto.

El aviso SHALL conservar el conteo de reglas omitidas y el registro por consola, y SHALL nombrar las
`memory_key` de las reglas omitidas en el mismo orden determinístico de inyección, hasta un tope de
40 claves. Si la reserva de caracteres o el tope dejan claves sin listar, el aviso SHALL agregar el
sufijo `+N`, donde `N` es la cantidad de reglas omitidas que no se listaron. El orden de las claves
listadas SHALL ser siempre un prefijo del orden de inyección.

Las reglas declaradas en `required` NO SHALL contarse como omitidas ni listarse en el aviso: o se
inyectan completas o la construcción falla con el error diagnóstico definido en
`Recall task-aware con orden total, preview expandible y keys requeridas`. El aviso SHALL gobernar
únicamente las reglas no requeridas que no entran en el presupuesto.

#### Scenario: El aviso apunta a la delegación accionable

- **WHEN** el bloque de reglas se trunca por el límite de tamaño
- **THEN** el `<ContextOverflowWarning>` indica delegar un Recall a `@memory-keeper` con el topic de la tarea
- **AND** conserva la cantidad de reglas omitidas en el texto

#### Scenario: El aviso no nombra una tool ausente

- **WHEN** se genera el `<ContextOverflowWarning>`
- **THEN** el texto no menciona `searchMemory`
- **AND** un test asevera esa ausencia

#### Scenario: El resto del aviso no cambia

- **WHEN** se trunca el bloque de reglas
- **THEN** el aviso se registra por consola con el conteo de reglas omitidas
- **AND** el recorte sigue gobernado por `MAX_TOKENS` y `CHARS_PER_TOKEN`

#### Scenario: El presupuesto incluye el aviso

- **WHEN** se construye el bloque con un `maxTokens` que cubre el piso fijo del wrapper y del aviso
  mínimo
- **THEN** la longitud total del bloque `<ProjectMemoryRules>`, incluido el
  `<ContextOverflowWarning>`, es menor o igual a `maxTokens × CHARS_PER_TOKEN`
- **AND** el aviso no desborda el presupuesto que reservó

#### Scenario: Las claves omitidas se listan

- **WHEN** el bloque se trunca y hay reglas omitidas
- **THEN** el `<ContextOverflowWarning>` incluye las `memory_key` de las reglas omitidas
- **AND** las lista en el orden determinístico de inyección

#### Scenario: El tope se señala con +N

- **WHEN** hay más de 40 reglas omitidas, o la reserva de caracteres no alcanza para listarlas todas
- **THEN** el aviso lista como máximo las claves que caben en el tope y en la reserva
- **AND** agrega el sufijo `+N` con la cantidad de reglas omitidas no listadas

#### Scenario: Una regla requerida no aparece como omitida

- **WHEN** el bloque se construye con `required` y hay reglas no requeridas que no entran en el
  presupuesto
- **THEN** el aviso lista únicamente las `memory_key` omitidas no requeridas
- **AND** ninguna `memory_key` declarada en `required` aparece en el aviso ni en el conteo

### Requirement: Orden determinístico de inyección de reglas

El orden de inyección de `rule` en `<ProjectMemoryRules>` SHALL ser determinístico y total. El
criterio SHALL aplicarse en este orden:

1. Reglas declaradas en `required`: primero, en el orden en que el llamador las declaró.
2. Jerarquía de scope: `task` antes que `feature` antes que `project`.
3. Anclaje declarado: las reglas que declaran al menos una ref `spec:`, `change:` o `path:` en su
   bloque `refs:` antes que las que no declaran ninguna.
4. `created_at` descendente.
5. `memory_key` lexicográfico ascendente.

`required` SHALL ser la clave `required` del cuarto argumento de opciones de
`buildWorkingContext`, con la firma `buildWorkingContext(scope, maxTokens, cwd, { required })`;
NO SHALL persistirse, NO SHALL ser una columna ni una tabla, y NO SHALL
formar parte del nodo devuelto por las superficies de lectura. Su efecto SHALL limitarse al orden y
al presupuesto de esa construcción.

El anclaje SHALL determinarse únicamente parseando el bloque `refs:` del `content`. La evaluación
NO SHALL resolver las refs, NO SHALL consultar el filesystem ni la base de datos, y NO SHALL agregar
I/O al render. Una regla sin bloque `refs:`, con un bloque inválido o con un bloque que sólo declara
`commit:` o `workitem:` NO SHALL contar como anclada.

Dos corridas de `buildWorkingContext` sobre el mismo estado de memoria, el mismo `maxTokens` y las
mismas `required` SHALL producir el mismo bloque.

#### Scenario: La regla requerida se inyecta primero

- **WHEN** dos reglas activas del scope inyectado compiten por el presupuesto
- **AND** una de ellas está declarada en `required` y la otra tiene mejor scope o mejor anclaje
- **THEN** la regla requerida se ordena antes
- **AND** si sólo entra una, entra la requerida

#### Scenario: Una regla anclada gana a una no anclada del mismo scope

- **WHEN** dos reglas activas del mismo scope compiten por el presupuesto
- **AND** una declara al menos una ref `spec:`, `change:` o `path:` y la otra no declara ninguna
- **THEN** la regla anclada se ordena antes
- **AND** si sólo entra una, entra la anclada

#### Scenario: El scope de mayor prioridad gana

- **WHEN** existe una regla activa de scope `task` y otra de scope `project` en un contexto `task`
- **THEN** la regla de scope `task` se ordena antes que la de scope `project`

#### Scenario: El empate se resuelve por recencia y luego por memory_key

- **WHEN** dos reglas comparten scope y anclaje pero tienen distinto `created_at`
- **THEN** se ordena primero la de `created_at` más reciente
- **AND** si además comparten `created_at`, se ordena primero la de `memory_key` lexicográficamente menor

#### Scenario: Dos corridas producen el mismo bloque

- **WHEN** se invoca `buildWorkingContext` dos veces consecutivas sin escrituras intermedias
- **THEN** los dos bloques son idénticos byte a byte

### Requirement: Render del bloque proactivo sin el bloque `refs:`

El render de `<ProjectMemoryRules>` en `buildWorkingContext` SHALL mostrar, por cada regla, sólo la
**prosa** de su `content`, omitiendo el bloque `refs:` completo —la línea `refs:` y sus entradas—.
El `content` **almacenado** SHALL permanecer intacto con sus refs: el recorte SHALL aplicarse
únicamente en el render del bloque proactivo y NO SHALL persistirse ni propagarse a otras salidas.
La lectura de operador, `export`, `list`, las tools MCP y `searchMemory` con `expand: true` —que
devuelve el `content` byte a byte— NO SHALL cambiar. El modo preview por defecto de `searchMemory`
es el contrato nuevo de este change y queda fuera de esta garantía de no cambio. Las refs se
resuelven bajo demanda y NO SHALL consumir el presupuesto fijo (`maxChars`) del bloque. El orden, el
filtro de nodos, el tope y el `<ContextOverflowWarning>` SHALL conservarse sin cambios. Una regla
cuyo `content` no tenga bloque `refs:` SHALL renderizarse igual que antes.

#### Scenario: Una regla con `refs:` se renderiza sin el bloque

- **WHEN** una regla activa del scope inyectado tiene un `content` compuesto por prosa seguida de un
  bloque `refs:` válido
- **THEN** el bloque `<ProjectMemoryRules>` muestra la prosa de esa regla
- **AND** el bloque NO muestra la línea `refs:` ni sus entradas
- **AND** el `content` almacenado del nodo sigue conteniendo el bloque `refs:`

#### Scenario: Una regla sin `refs:` no cambia

- **WHEN** una regla activa del scope inyectado tiene un `content` sin bloque `refs:`
- **THEN** el bloque `<ProjectMemoryRules>` la renderiza con la prosa completa, igual que antes
- **AND** no se agrega ni se quita texto

#### Scenario: Las demás salidas conservan las refs

- **WHEN** se lee el mismo nodo por `export`, `list`, las tools MCP o `searchMemory` con `expand: true`
- **THEN** el `content` devuelto incluye su bloque `refs:`
- **AND** el orden, el filtro, el tope y el aviso de truncamiento del bloque proactivo no cambian

## ADDED Requirements

### Requirement: Recall task-aware con orden total, preview expandible y keys requeridas

`searchMemory` SHALL devolver resultados en un orden total determinístico, independiente de
`n.rowid` y del orden físico de inserción, aplicado después de filtrar `status = 'active'` y el
`type` solicitado. El orden SHALL ser, en este orden:

1. Nodos cuyas `memory_key` están declaradas en `required`, en el orden declarado por el llamador.
2. Nodos que declaran al menos una ref `spec:`, `change:` o `path:` en su bloque `refs:`
   (anclaje declarado, decidido parseando el content sin resolver refs ni hacer I/O) antes que los
   que no declaran ninguna.
3. Scope más específico según `SCOPE_RANK`: `task` antes que `feature` antes que `project`.
4. `bm25` ascendente, con el mejor primero.
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

#### Scenario: El anclaje declarado gana al scope más específico

- **WHEN** dos nodos empatan en requerido y uno declara una ref `spec:`, `change:` o `path:`
  mientras el otro no declara ninguna, aunque el segundo tenga un scope más específico
- **THEN** el nodo anclado se ordena antes

#### Scenario: El empate de bm25 se resuelve por memory_key, no por rowid

- **WHEN** varios nodos con contenido idéntico empatan en `bm25` y `limit` es menor que la cantidad
  de coincidencias
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

## Invariantes no testeables por construcción

- **No se suben los topes.** `MAX_TOKENS = 2000`, `CHARS_PER_TOKEN = 4` y el tope del campo
  destilado ≤5 reglas / ≤1.500 B no cambian. Un test no puede probar una propiedad negativa sobre
  un diff; la verificación es que las constantes y el texto del contrato permanecen iguales.
- **No hay consolidación ni reglas nuevas.** La ausencia se mide con el dry-run de consolidación
  (0 candidatos), no con un test de comportamiento: no existe camino de escritura nuevo que un test
  pueda ejercitar.
- **Los presupuestos no son convertibles ni componibles.** La no conversión es una propiedad del
  contrato, no una función que se pueda invocar; se verifica por revisión del texto de
  `prompt-contracts` y por la prueba separada de cada tope (T28), no por un cálculo combinado.
- **`required` no es columna ni tabla.** La ausencia en el schema se verifica en revisión de DDL;
  el test de comportamiento cubre que el campo no se expone en la lectura.
