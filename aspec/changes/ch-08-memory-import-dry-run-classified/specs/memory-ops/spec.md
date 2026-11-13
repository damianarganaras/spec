# Spec delta: ch-08-memory-import-dry-run-classified — memory-ops

## ADDED Requirements

### Requirement: Import con dry-run clasificado por memory_key

El sistema SHALL exponer `ancleto memory import --dry-run <archivo.json> [--json]` como una
simulación read-only del import. La garantía central SHALL ser que la clasificación predice
exactamente el efecto que tendría `import` sobre la misma entrada en el mismo estado: el dry-run y
`importNodes` SHALL compartir una única función de decisión, sin duplicar la política.

**Clasificación.** Para cada entrada, en el orden del archivo, el sistema SHALL clasificarla por
`memory_key` en uno de cuatro buckets, definidos así:

- `nuevo`: no existe nodo activo para la key y no existe historial `superseded`; acción `insert`.
- `identico`: existe un nodo activo y su payload durable —`type`, `scope`, `content`,
  `justification`— es igual al entrante; acción `supersede` si el `createdAt` entrante es
  estrictamente más nuevo, y `skip` si es más viejo o igual.
- `divergente`: existe un nodo activo y el payload durable difiere del entrante; acción `supersede`
  si el `createdAt` entrante es estrictamente más nuevo, y `skip` si es más viejo o igual.
- `tombstone`: no existe nodo activo pero sí existe historial `superseded` para la key; acción
  `skip`.

`createdAt` NO SHALL formar parte de la identidad del payload. La comparación de `content` SHALL
aplicar el mismo saneador que usa `exportActive` sobre ambos lados —el `content` del nodo activo
local y el de la entrada—, de modo que un round-trip legítimo export→import y una entrada con el
`content` crudo del nodo local clasifiquen `identico` y no `divergente`.

`tombstone` NO SHALL ser un estado persistido: el esquema no tiene tombstone ni `deleted_at`, NO
SHALL agregarse ninguno, y el término SHALL describir únicamente "retirada local que el import
saltea".

**Simulación secuencial.** Los duplicados de la misma `memory_key` dentro del archivo SHALL
simularse en el orden del archivo sobre el estado que deja cada entrada anterior, igual que
`importNodes`; NO SHALL usarse una foto estática del estado inicial. La acción predicha por entrada
SHALL coincidir con el efecto real del import: `insert` con un nodo insertado, `supersede` con un
nodo previo superseded y uno nuevo activo, `skip` con ningún cambio. Los conteos por acción SHALL
coincidir con `inserted`, `updated` y `skipped` del import real sobre el mismo estado.

**Read-only estricto.** El dry-run SHALL abrir la base con `createReadonlyMemoryEngine`
(`migrate: false`) y NO SHALL ejecutar `runImmediateTransaction`, `checkpoint`, `recordNode`,
`importNodes`, `gc` ni el refresh del working-context. La garantía SHALL ser: ninguna sentencia de
escritura y `.db` con bytes idénticos. La ausencia de sidecars `-wal`/`-shm` NO SHALL afirmarse como
parte del contrato. Si la base existe, el sistema SHALL reportar `databasePresent: true` sin
escribirla. Si la base no existe, el sistema NO SHALL crearla y SHALL reportar
`databasePresent: false`, clasificando todas las entradas como `nuevo` con acción `insert` y saliendo
con código 0.

**Salida.** El sistema SHALL producir un resumen `{ nuevo, identico, divergente, tombstone }` y, por
entrada, `{ memory_key, classification, action }`, en el orden del archivo. Con `--json` SHALL
emitir `{ dryRun: true, databasePresent, summary, entries }`. Sin `--json` SHALL emitir un texto
humano con el resumen y una línea por cada entrada cuya acción sea `skip` con clasificación
`divergente` o `tombstone`. El sistema SHALL salir con código 0 en éxito y con código 1 sólo cuando
falte el archivo, el archivo no exista, el JSON no sea parseable o una entrada no satisfaga el
esquema que `importNodes` exige; en este último caso NO SHALL emitirse una clasificación parcial.

#### Scenario: Bucket `nuevo` inserta

- **WHEN** se ejecuta el dry-run sobre una entrada cuya `memory_key` no tiene nodo activo ni
  historial `superseded`
- **THEN** la entrada se clasifica `nuevo` con acción `insert`
- **AND** el resumen incrementa `nuevo` en 1

#### Scenario: Bucket `identico` con `createdAt` más nuevo supersede

- **WHEN** existe un nodo activo con el mismo payload durable y la entrada trae un `createdAt`
  estrictamente más nuevo
- **THEN** la entrada se clasifica `identico` con acción `supersede`

#### Scenario: Bucket `identico` sin `createdAt` más nuevo omite

- **WHEN** existe un nodo activo con el mismo payload durable y la entrada trae un `createdAt` más
  viejo o igual
- **THEN** la entrada se clasifica `identico` con acción `skip`

#### Scenario: Bucket `divergente` con `createdAt` más nuevo supersede

- **WHEN** existe un nodo activo con payload durable distinto y la entrada trae un `createdAt`
  estrictamente más nuevo
- **THEN** la entrada se clasifica `divergente` con acción `supersede`

#### Scenario: Divergencia con `createdAt` igual queda visible y omite

- **WHEN** dos bases divergen en el payload de una key con `createdAt` igual
- **THEN** la entrada se clasifica `divergente` con acción `skip`
- **AND** la línea de la entrada aparece en la salida humana, porque hoy ese caso es invisible

#### Scenario: Bucket `divergente` con `createdAt` más viejo omite

- **WHEN** existe un nodo activo con payload durable distinto y la entrada trae un `createdAt` más
  viejo
- **THEN** la entrada se clasifica `divergente` con acción `skip`

#### Scenario: Bucket `tombstone` omite sin reactivar

- **WHEN** no existe nodo activo para la key pero sí existe historial `superseded`
- **THEN** la entrada se clasifica `tombstone` con acción `skip`
- **AND** no se reporta ningún nodo activo para esa key

#### Scenario: La acción predicha coincide con el efecto del import real

- **WHEN** se ejecuta el dry-run y luego `importNodes` sobre dos fixtures con el mismo estado inicial
  y el mismo archivo
- **THEN** la cantidad de acciones `insert` coincide con `inserted`
- **AND** la cantidad de acciones `supersede` coincide con `updated`
- **AND** la cantidad de acciones `skip` coincide con `skipped`

#### Scenario: Orden del archivo y determinismo

- **WHEN** se ejecuta el dry-run dos veces sobre el mismo estado y el mismo archivo
- **THEN** las entradas aparecen en el orden del archivo en ambas corridas
- **AND** la salida es idéntica entre ambas corridas

#### Scenario: Cero escrituras y working-context intacto

- **WHEN** se ejecuta el dry-run sobre una base existente y un archivo con entradas de los cuatro
  buckets
- **THEN** los bytes del archivo `.db` son idénticos antes y después
- **AND** ningún nodo cambia de estado
- **AND** `.ancleto/working-context.md` no se refresca ni cambia

#### Scenario: Base ausente no se crea y todo es nuevo

- **WHEN** se ejecuta el dry-run y `.ancleto/memory.db` no existe
- **THEN** la salida reporta `databasePresent: false`
- **AND** todas las entradas se clasifican `nuevo` con acción `insert`
- **AND** el archivo de base no se crea
- **AND** el código de salida es 0

#### Scenario: Duplicados de la misma key se simulan en orden secuencial

- **WHEN** el archivo contiene dos entradas de la misma `memory_key`, la segunda con payload distinto
  y `createdAt` más nuevo, y la key no existe en la base
- **THEN** la primera se clasifica `nuevo` con acción `insert`
- **AND** la segunda se clasifica `divergente` con acción `supersede`, comparada contra el estado que
  dejó la primera
- **AND** el import real sobre el mismo estado reporta `inserted: 1` y `updated: 1`

#### Scenario: El round-trip export→import no produce divergente falso

- **WHEN** un nodo activo contiene un path absoluto y la entrada es la que produce `exportActive`
  para ese nodo, con el path redactado
- **THEN** la entrada se clasifica `identico`
- **AND** no se clasifica `divergente`

#### Scenario: Salida JSON

- **WHEN** se ejecuta `ancleto memory import --dry-run <archivo.json> --json`
- **THEN** la salida es un objeto JSON parseable
- **AND** incluye `dryRun: true`, `databasePresent`, `summary` y `entries`
- **AND** cada entrada de `entries` incluye `memory_key`, `classification` y `action`

#### Scenario: Salida humana muestra los skip invisibles

- **WHEN** se ejecuta el dry-run sin `--json` con entradas `divergente` y `tombstone` que se omiten
- **THEN** la salida muestra el resumen de los cuatro buckets
- **AND** muestra una línea por cada entrada con acción `skip` y clasificación `divergente` o
  `tombstone`

#### Scenario: Archivo ausente o JSON inválido sale con código 1

- **WHEN** falta el argumento de archivo, el archivo no existe o el JSON no es parseable
- **THEN** el comando sale con código 1
- **AND** no se escribe en la base

#### Scenario: Payload crudo igual al local clasifica identico

- **WHEN** existe un nodo activo cuyo `content` contiene un path absoluto y la entrada trae
  exactamente ese mismo `content` sin redactar, con `createdAt` más nuevo
- **THEN** la entrada se clasifica `identico` con acción `supersede`
- **AND** no se clasifica `divergente`
