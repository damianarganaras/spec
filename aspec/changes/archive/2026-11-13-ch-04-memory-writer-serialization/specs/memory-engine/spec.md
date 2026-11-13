## ADDED Requirements

### Requirement: Serialización de escritores concurrentes sobre la base de memoria

El engine de memoria SHALL serializar las escrituras concurrentes sobre `.ancleto/memory.db`
mediante el lock de escritura de SQLite: las transacciones de escritura de sus cinco caminos
—`recordNode`, `import`, `gc`, `merge` y `consolidate`— SHALL abrirse con `BEGIN IMMEDIATE`,
conservando `journal_mode = WAL`, `busy_timeout = 5000` y `foreign_keys = ON`. Los escritores que no
pertenecen al engine, como la reparación explícita de `memory doctor --rebuild`, quedan fuera de esta
garantía.

La espera SHALL ser acotada. Además del `busy_timeout`, la adquisición del lock SHALL reintentarse
ante `SQLITE_BUSY` o `SQLITE_LOCKED` (errcode 5/6) hasta un máximo de 3 intentos, con backoff
creciente de 200 ms antes del segundo intento y 600 ms antes del tercero, sin jitter. El reintento
SHALL aplicarse sólo a la adquisición del lock y NO SHALL re-ejecutar el cuerpo de una transacción ya
abierta. Los cinco caminos de escritura —`recordNode`, `import`, `gc`, `merge` y `consolidate`— SHALL
compartir un único helper de transacción y NO SHALL duplicar la política.

Al agotarse el presupuesto de intentos, el engine SHALL fallar con un error cuyo `code` sea
`MEMORY_DB_BUSY` y que nombre la operación y la cantidad de intentos realizados. Al propagarse ese
error NO SHALL quedar ninguna transacción abierta. Los demás errores —validación fail-closed de refs,
rechazo de secretos y grupo inválido— NO SHALL reintentarse: SHALL hacer rollback y propagarse sin
cambios.

Bajo contención concurrente, ninguna escritura confirmada SHALL perderse y SHALL existir exactamente
un nodo activo por `memory_key`. El índice FTS5 SHALL permanecer consistente con `memory_nodes` y
`PRAGMA quick_check` SHALL devolver `ok` al terminar las escrituras.

Los caminos read-only —`doctor`, `curate`, los dry-run de `merge` y `consolidate`, `snapshot` y el
engine read-only (`createReadonlyMemoryEngine`)— NO SHALL adquirir el retry ni escribir nodos ni migrar schema.
Los lectores concurrentes NO SHALL bloquearse ni fallar por una escritura en curso.

Este change NO SHALL alterar la forma persistida ni los PRAGMAs persistidos: un binario previo SHALL
poder abrir y leer la misma base. `ruleVersion` pertenece al estado de discovery y NO SHALL cambiar.

El mecanismo SHALL ser por conexión y por transacción; NO SHALL introducir un lock global de proceso
ni serializar superficies disjuntas. La paralelización del orquestador entre
`aspec/changes/archive/` y `.ancleto/memory.db` SHALL preservarse.

#### Scenario: Escritores concurrentes no pierden escrituras

- **WHEN** N procesos escriben M veces cada uno sobre una base temporal, con `memory_key` colisionantes y con `memory_key` distintas
- **THEN** toda escritura confirmada queda persistida
- **AND** existe exactamente un nodo activo por `memory_key`
- **AND** el conteo de nodos superseded es el esperado para la secuencia de escrituras

#### Scenario: La contención se absorbe más allá de `busy_timeout`

- **WHEN** un escritor mantiene retenido el write-lock durante 7 s y otro escritor intenta abrir su transacción con `BEGIN IMMEDIATE`
- **THEN** el segundo escritor no falla con `SQLITE_BUSY` crudo
- **AND** confirma su escritura cuando el lock se libera, con un tiempo de confirmación mayor a 5000 ms y dentro del presupuesto de 3 intentos

#### Scenario: Presupuesto agotado produce el error nombrado `MEMORY_DB_BUSY`

- **WHEN** el lock se mantiene retenido más allá del presupuesto de reintentos
- **THEN** la operación falla con un error cuyo `code` es `MEMORY_DB_BUSY`
- **AND** el mensaje nombra la operación y la cantidad de intentos realizados
- **AND** no queda ninguna transacción abierta al propagarse el error

#### Scenario: Lectores y caminos read-only no se alteran

- **WHEN** un escritor mantiene una transacción abierta sobre la base
- **AND** se ejecutan `doctor`, `curate`, un dry-run de `merge` o `consolidate`, `snapshot` o el engine read-only (`createReadonlyMemoryEngine`)
- **THEN** ninguno de esos caminos adquiere el retry, ni escribe nodos, ni migra schema
- **AND** los lectores concurrentes no se bloquean ni fallan por la escritura en curso

#### Scenario: El índice FTS5 queda consistente y `quick_check` devuelve `ok`

- **WHEN** terminan las escrituras concurrentes
- **THEN** la cantidad de filas indexadas en `memory_fts` coincide con las filas de `memory_nodes`
- **AND** `PRAGMA quick_check` devuelve `ok`
- **AND** ninguna búsqueda FTS queda desalineada por una escritura abortada

#### Scenario: Sin cambio de forma persistida ni de `ruleVersion`

- **WHEN** un binario previo abre y lee la base escrita por la versión nueva
- **THEN** encuentra el mismo schema, los mismos PRAGMAs persistidos y los mismos nodos
- **AND** el estado de discovery conserva su `ruleVersion`

#### Scenario: La paralelización de superficies disjuntas se preserva

- **WHEN** un escritor de memoria mantiene una transacción sobre `.ancleto/memory.db`
- **AND** en paralelo la finalización del archive escribe bajo `aspec/changes/archive/`
- **THEN** ninguna de las dos superficies bloquea a la otra
- **AND** el mecanismo no introduce un lock global de proceso
- **AND** el presupuesto de reintentos es por conexión y por transacción
