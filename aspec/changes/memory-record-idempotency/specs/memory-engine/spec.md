# Delta: memory-engine

## ADDED Requirements

### Requirement: Idempotencia de reescritura idéntica en recordNode

`recordNode` SHALL comparar la escritura entrante contra el nodo activo de la misma `memory_key` y
SHALL tratar como no-op una reescritura idéntica. La identidad SHALL definirse por la tupla
(`memory_key`, `type`, `scope`, `content`, `justification`) comparada por igualdad exacta de string
contra el nodo activo. `createdAt`, `source` y `confidence` NO SHALL formar parte de la identidad.

Cuando los cinco campos coincidan, `recordNode` NO SHALL insertar, NO SHALL actualizar y NO SHALL
superseder; la transacción SHALL abrir y cerrar limpiamente y el resultado SHALL devolver
`superseded: 0` junto con los valores persistidos del nodo activo —`memory_key`, `type`, `scope`,
`content`, `justification` y el `created_at` existente—. Cuando cualquiera de los cinco campos
difiera, el comportamiento SHALL permanecer sin cambios: superseder el nodo activo, insertar un
nodo nuevo con un UUID nuevo y devolver `superseded: 1`.

El orden de validación NO SHALL cambiar: `looksLikeSecret` y `validateRefsForWrite` SHALL ejecutarse
antes de abrir la transacción y antes de la comprobación de identidad, de modo que una escritura
rechazada siga rechazándose aunque sea idéntica. El objeto devuelto NO SHALL ganar campos y se
mantiene la decisión `recordnode-return-shape-no-superseded-node`.

`importNodes` NO SHALL modificarse: conserva su semántica last-writer-wins por `createdAt`. Los
caminos de supersesión de `merge` y `consolidate` NO SHALL modificarse.

Como consecuencia, una reescritura idéntica de un nodo `rule` + `project` ya no SHALL disparar el
refresh del working-context por la condición de supersesión; SHALL seguir disparándolo por la
condición de contribución directa (`type === 'rule' && scope === 'project'`). Una reescritura
idéntica de una `decision` NO SHALL disparar refresh porque no ocurrió cambio. Este efecto es
intencional.

#### Scenario: Reescritura idéntica de una memory_key no crea nodo ni supersede

- **WHEN** se registra una `memory_key` activa con un payload idéntico en `type`, `scope`, `content`
  y `justification` al del nodo activo
- **THEN** no se inserta ningún nodo nuevo
- **AND** el nodo activo no se supersede
- **AND** el resultado devuelve `superseded: 0`

#### Scenario: Reescritura con contenido distinto supersede como hoy

- **WHEN** se registra una `memory_key` activa con un `content` distinto al del nodo activo
- **THEN** el nodo activo se supersede
- **AND** se inserta un nodo nuevo con un UUID nuevo
- **AND** el resultado devuelve `superseded: 1`

#### Scenario: Reescritura idéntica devuelve los valores persistidos del nodo activo

- **WHEN** una reescritura idéntica se trata como no-op
- **THEN** el resultado devuelve `memory_key`, `type`, `scope`, `content` y `justification` del nodo
  activo
- **AND** el `created_at` devuelto es el `created_at` existente del nodo activo, no uno nuevo
- **AND** el objeto devuelto no incorpora campos adicionales

#### Scenario: La validación de refs se ejecuta antes de la comprobación de identidad

- **WHEN** una escritura es idéntica al nodo activo pero no cumple la validación de refs
- **THEN** `recordNode` la rechaza nombrando la `memory_key` y la regla violada
- **AND** no se inserta ni se supersede ningún nodo
- **AND** el rechazo ocurre antes de la comprobación de identidad

#### Scenario: La identidad cruza type y scope: un type o scope distinto supersede

- **WHEN** se registra la misma `memory_key` con `content` y `justification` idénticos pero con un
  `type` o un `scope` distinto al del nodo activo
- **THEN** el nodo activo se supersede
- **AND** se inserta un nodo nuevo
- **AND** el resultado devuelve `superseded: 1`

#### Scenario: La idempotencia no altera importNodes

- **WHEN** se importa mediante `importNodes` una entrada con la misma `memory_key` que un nodo
  existente
- **THEN** el import conserva su semántica last-writer-wins por `createdAt`
- **AND** no aplica la comprobación de identidad de `recordNode`
