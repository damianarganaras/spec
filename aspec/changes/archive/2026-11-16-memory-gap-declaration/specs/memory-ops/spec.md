# Spec delta: memory-gap-declaration — memory-ops

## ADDED Requirements

### Requirement: Estado de memoria con `ancleto memory status`

El sistema SHALL exponer el subcomando `ancleto memory status [--json]` dentro de la familia
existente `memory`, como superficie read-only y advisory. El subcomando SHALL ser un wrapper fino
sobre un módulo puro en `src/core/memory/` y NO SHALL introducir una tool MCP nueva.

**Estados de la base.** `status` SHALL admitir exactamente cuatro valores: `ok` cuando el archivo
de la base existe, el esquema está inicializado y hay al menos un nodo activo; `empty` cuando el
archivo existe, el esquema está inicializado y hay cero nodos activos; `no-db` cuando el archivo
no existe; `uninitialized` cuando el archivo existe pero no tiene el esquema (por ejemplo, 0
bytes).

**Raíz de la evidencia.** La raíz de la evidencia y la del `dbPath` SHALL ser la misma: el
directorio de trabajo actual (`cwd`). La evidencia SHALL buscarse en `<cwd>/aspec/changes/archive` y
NUNCA SHALL resolverse subiendo a un directorio ancestro. En consecuencia, desde un subdirectorio
que no tiene un `aspec/changes/archive` propio, `expected` SHALL ser `false` y NO SHALL declararse
gap.

**Memoria esperable.** `expected` SHALL ser `true` cuando existe al menos un
`aspec/changes/archive/*/proposal.md` que cumple ambas condiciones: (i) contiene al menos una
línea que empieza con `## Decisiones`, admitiendo prefijos como `## Decisiones de producto`; y
(ii) contiene al menos una línea cuyo contenido, después de quitar la indentación y un bullet
opcional `- ` o `* `, empieza con `**memory_key:**`. Se aceptan por lo tanto `**memory_key:** valor`,
`- **memory_key:** valor` y `* **memory_key:** valor`; NO se acepta una línea con texto previo
distinto de un bullet, ni la forma con el marcador envuelto en backticks (`` `**memory_key:**` ``).
Los backticks alrededor del valor no afectan el match. El escaneo SHALL ser acotado,
con corte temprano en el primer archivo que cumple ambas condiciones. Un error de lectura de
cualquier archivo SHALL tratarse como no-match, de modo que el sistema NUNCA SHALL declarar un gap
por evidencia ilegible. NO SHALL considerarse evidencia la mera existencia de `.ancletorc`, de
`aspec/specs/**` ni de `CHANGELOG.md`.

**Gap.** `gap` SHALL ser `true` únicamente cuando `expected` es `true` y `status` es distinto de
`ok`.

**Salida humana.** Sin `--json`, el comando SHALL imprimir una línea con el estado. Cuando `gap`
sea `true`, SHALL imprimir además una línea accionable que nombre los caminos de recuperación
EXISTENTES: `ancleto memory export` para producir el JSON portable, `ancleto memory import` para
restaurarlo y `ancleto memory snapshot` para obtener una copia consistente con historial. Cuando
`gap` sea `false`, NO SHALL agregar advertencia alguna.

**Salida JSON.** Con `--json`, SHALL emitir un objeto JSON parseable con `status`, `expected`,
`gap`, `dbPresent`, `activeNodes`, `evidence` y `recovery`. `dbPresent` SHALL ser `true` cuando el
archivo exista, aun sin esquema. `activeNodes` SHALL ser `0` cuando no haya base o el esquema no
esté inicializado. `evidence` SHALL ser la cantidad de proposals archivados que aportaron evidencia
bajo el corte temprano (`1` cuando `expected` sea `true`, `0` cuando sea `false`). `recovery` SHALL
ser un array de comandos sugeridos y SHALL ser vacío cuando `gap` sea `false`.

**Códigos de salida.** El comando SHALL salir con código `0` en todos los estados, con y sin
`--json`, incluidos `empty`, `no-db` y `uninitialized`. El código `1` SHALL reservarse a un error
inesperado de E/S o de apertura de SQLite distinto de "archivo ausente"; en ese caso SHALL escribir
un mensaje en stderr sin stack trace. Una invocación con flags no reconocidas SHALL ser un error de
uso y SHALL salir con código `1`, con mensaje en stderr y sin stack trace, siguiendo el precedente de
`memory curate`. El comando NUNCA SHALL funcionar como gate.

**Read-only.** El comando SHALL verificar la existencia del archivo de la base antes de abrirlo y
SHALL abrirlo con migraciones deshabilitadas y acceso de sólo lectura. NO SHALL crear el directorio
`.ancleto/` ni el archivo `memory.db`; NO SHALL ejecutar `journal_mode=WAL`, migraciones, DDL,
`INSERT`, `UPDATE`, `DELETE`, checkpoint ni el refresh del working-context. La apertura read-only
PUEDE materializar `-shm` y un `-wal` de 0 bytes; esa materialización NO SHALL contar como escritura
ni reportarse como falla, y NO SHALL alterar el contenido de la base.

**Invariantes negativas.** El comando NO SHALL escribir memoria, NO SHALL importar nodos
automáticamente ni SHALL tocar `.ancleto/working-context.md`. NO SHALL declarar gap cuando no hay
evidencia versionada. NO SHALL ser un segundo gate de archive ni de promoción: no se invoca desde la
secuencia de archive, no altera el `healthy` ni el exit de `memory doctor`, y no altera el exit de
`ancleto check`.

**Compatibilidad.** El comando NO SHALL cambiar el schema, los PRAGMAs persistentes ni la forma del
export o del snapshot: el conjunto de objetos de `sqlite_master` y los PRAGMAs persistentes —en
particular `journal_mode`— SHALL ser idénticos antes y después, y las claves y los tipos de los
campos del JSON de `ancleto memory export` NO SHALL cambiar.

#### Scenario: Base con nodos activos reporta `ok` sin gap

- **WHEN** existe `.ancleto/memory.db` con esquema y al menos un nodo activo
- **AND** existe evidencia versionada de memoria esperable
- **THEN** `status` es `ok`
- **AND** `expected` es `true` y `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: Base inicializada sin nodos activos declara gap

- **WHEN** existe `.ancleto/memory.db` con esquema y cero nodos activos
- **AND** existe evidencia versionada de memoria esperable
- **THEN** `status` es `empty` y `gap` es `true`
- **AND** la salida humana nombra `ancleto memory export`, `ancleto memory import` y
  `ancleto memory snapshot`
- **AND** `recovery` contiene esos tres comandos
- **AND** el comando sale con código `0`

#### Scenario: Base ausente declara el gap sin crearla

- **WHEN** `.ancleto/memory.db` no existe
- **AND** existe evidencia versionada de memoria esperable
- **THEN** `status` es `no-db`, `dbPresent` es `false`, `activeNodes` es `0` y `gap` es `true`
- **AND** el comando sale con código `0`

#### Scenario: Archivo de 0 bytes reporta `uninitialized`

- **WHEN** el archivo `.ancleto/memory.db` existe con 0 bytes o sin esquema de memoria
- **AND** existe evidencia versionada de memoria esperable
- **THEN** `status` es `uninitialized`, `dbPresent` es `true`, `activeNodes` es `0` y `gap` es `true`
- **AND** el comando no crea el esquema ni escribe en el archivo
- **AND** el comando sale con código `0`

#### Scenario: `--json` expone el contrato completo

- **WHEN** se ejecuta `ancleto memory status --json`
- **THEN** la salida es un objeto JSON parseable
- **AND** incluye las claves `status`, `expected`, `gap`, `dbPresent`, `activeNodes`, `evidence` y
  `recovery`
- **AND** `recovery` es un array vacío cuando `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: Sin gap no se agrega advertencia

- **WHEN** el estado es `ok` y `expected` es `true`
- **THEN** la salida humana contiene una sola línea de estado
- **AND** no agrega ninguna advertencia ni línea accionable
- **AND** `recovery` es la lista vacía

#### Scenario: `## Decisiones` sin una forma soportada de `memory_key` no es evidencia

- **WHEN** un `proposal.md` archivado contiene una línea `## Decisiones`
- **AND** no contiene ninguna línea con `**memory_key:**` en columna 0 ni con un bullet `- ` o `* `
  antes del marcador
- **AND** la única línea candidata envuelve el marcador en backticks (`` `**memory_key:**` ``)
- **AND** ningún otro archive aporta evidencia
- **THEN** `expected` es `false`
- **AND** `gap` es `false` aun cuando el estado sea `empty` o `no-db`
- **AND** el comando sale con código `0`

#### Scenario: `**memory_key:**` sin `## Decisiones` no es evidencia

- **WHEN** un `proposal.md` archivado contiene una línea que empieza con `**memory_key:**`
- **AND** no contiene ninguna línea que empiece con `## Decisiones`
- **AND** ningún otro archive aporta evidencia
- **THEN** `expected` es `false`
- **AND** `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: El prefijo `## Decisiones de producto` es evidencia

- **WHEN** un `proposal.md` archivado contiene una línea `## Decisiones de producto`
- **AND** contiene al menos una línea que empieza con `**memory_key:**`
- **THEN** `expected` es `true`
- **AND** `evidence` es `1`

#### Scenario: Las formas soportadas de la clave son evidencia

- **WHEN** un `proposal.md` archivado declara `## Decisiones` y la clave en columna 0
  (`**memory_key:** valor`), como `2026-11-13-ch-04-memory-writer-serialization/proposal.md`
- **AND** otro declara `## Decisiones` y la clave con bullet `-`
  (`- **memory_key:** valor`), como `2026-11-16-memory-repair-refs/proposal.md`
- **AND** otro declara `## Decisiones` y la clave con bullet `*` (`* **memory_key:** valor`)
- **THEN** `expected` es `true` en los tres casos
- **AND** `evidence` es `1` por el corte temprano
- **AND** una clave cuyo valor viene entre backticks, como en
  `2026-11-04-ch-12-agentic-model-discovery/proposal.md`, también es evidencia

#### Scenario: Un error de lectura no declara gap

- **WHEN** la lectura de un `proposal.md` archivado falla
- **AND** ningún otro archive aporta evidencia
- **THEN** ese archivo se trata como no-match
- **AND** `expected` es `false` y `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: Repo sin evidencia versionada nunca declara gap

- **WHEN** `aspec/changes/archive` no existe o no contiene ningún `proposal.md` con el predicado
- **AND** el estado es `no-db`, `uninitialized` o `empty`
- **THEN** `expected` es `false` y `gap` es `false`
- **AND** el comando sale con código `0`

#### Scenario: Desde un subdirectorio sin archive propio no declara gap

- **WHEN** se ejecuta `ancleto memory status --json` desde un subdirectorio del repo
- **AND** ese subdirectorio no tiene `aspec/changes/archive`
- **AND** el repo padre sí tiene `aspec/changes/archive` con evidencia
- **AND** la base bajo el `cwd` no existe
- **THEN** `expected` es `false` y `gap` es `false`
- **AND** la evidencia no se busca subiendo a un directorio ancestro
- **AND** el comando sale con código `0`

#### Scenario: No crea `.ancleto/` ni el archivo de base

- **WHEN** se ejecuta `ancleto memory status` en un repo sin `.ancleto/`
- **THEN** el directorio `.ancleto/` no se crea
- **AND** el archivo `.ancleto/memory.db` no se crea

#### Scenario: No escribe memoria

- **WHEN** se ejecuta `ancleto memory status` sobre una base con nodos
- **THEN** los bytes del archivo `.db` son idénticos antes y después
- **AND** la cantidad de nodos y sus `status`, `content` y `superseded_by` no cambian
- **AND** el conjunto de objetos de `sqlite_master` es idéntico antes y después
- **AND** dos corridas consecutivas son idempotentes

#### Scenario: No toca el working-context

- **WHEN** existe `.ancleto/working-context.md` y se ejecuta `ancleto memory status`
- **THEN** el contenido del archivo es idéntico antes y después
- **AND** el comando no lo regenera aunque `gap` sea `true`

#### Scenario: No importa nodos automáticamente

- **WHEN** existe un JSON de export disponible y `ancleto memory status` reporta `gap` `true`
- **THEN** ningún nodo se importa
- **AND** `activeNodes` no cambia respecto del estado previo

#### Scenario: La señal no altera `memory doctor` ni `ancleto check`

- **WHEN** se ejecuta `ancleto memory status` con `gap` `true`
- **THEN** el `healthy` y el código de salida de `memory doctor` son los mismos que antes de la corrida
- **AND** el código de salida de `ancleto check` es el mismo que antes de la corrida

#### Scenario: Los sidecars de la lectura read-only no cuentan como escritura

- **WHEN** se ejecuta `ancleto memory status` sobre una fixture en `journal_mode=DELETE` sin sidecars
- **THEN** los bytes del archivo `.db` son idénticos antes y después
- **AND** pueden aparecer `-shm` y un `-wal` de 0 bytes, y eso no se reporta como falla
- **AND** una segunda corrida no cambia ningún byte respecto de la primera

#### Scenario: Exit code `0` en todos los estados

- **WHEN** se ejecuta `ancleto memory status`, con y sin `--json`, en los estados `ok`, `empty`,
  `no-db` y `uninitialized`
- **THEN** el comando sale con código `0` en todos los casos

#### Scenario: Un error inesperado de apertura sale con código `1`

- **WHEN** el archivo de base existe pero no puede abrirse o leerse por un error de E/S o de SQLite
  distinto de "archivo ausente"
- **THEN** el comando sale con código `1`
- **AND** escribe un mensaje en stderr
- **AND** no imprime stack trace

#### Scenario: Una flag no reconocida es un error de uso

- **WHEN** se ejecuta `ancleto memory status` con una flag no reconocida
- **THEN** el comando sale con código `1`
- **AND** escribe un mensaje en stderr
- **AND** no imprime stack trace
- **AND** no crea ni escribe la base

#### Scenario: Compatibilidad del estado persistido

- **WHEN** se ejecuta `ancleto memory status` sobre una base existente
- **THEN** el conjunto de objetos de `sqlite_master` es idéntico antes y después
- **AND** los PRAGMAs persistentes, en particular `journal_mode`, son idénticos antes y después
- **AND** las claves y los tipos de los campos del JSON de `ancleto memory export` no cambian

_No-testeable-por-construcción: que el comando no se invoque desde la secuencia de archive ni desde
la promoción es una propiedad de composición sin salida observable directa. Se ancla en el contrato
del comando descrito arriba y en la revisión de código; el efecto observable —que `doctor` y
`check` no cambian— sí queda cubierto por escenario._

## MODIFIED Requirements

### Requirement: `memory doctor` estrictamente read-only

`memory doctor` SHALL abrir la base con `{ migrate: false, readonly: true }` en su modo por
defecto y NO SHALL ejecutar checkpoint, DDL, `INSERT` sobre `memory_fts`, reconstrucción de FTS ni
ningún pragma mutante. El modo por defecto NO SHALL escribir datos: el contenido de `db` y de
`-wal` NO SHALL cambiar.

La apertura read-only que hace SQLite PUEDE materializar `-shm` y un `-wal` de 0 bytes cuando no
existían, porque el acceso WAL en read-only requiere el índice de memoria compartida. Esa
materialización NO SHALL reportarse como falla de `doctor`, NO SHALL alterar el contenido de la
base y SHALL quedar verificada por test. Ningún nodo SHALL crearse, modificarse ni borrarse por esa
materialización.

El reporte SHALL conservar la forma `{ checks: [{ name, ok, detail }], healthy, rebuilt }`. `ok`
SHALL seguir siendo booleano y SHALL significar "no se detectó falla". Los cinco checks SHALL
mantenerse con sus nombres actuales: `Integridad DB`, `Indice FTS5`, `Reglas activas (unicidad)`,
`Refs de nodos activos` y `Checkpoint WAL`.

El path temprano de esquema no inicializado SHALL reportar los cinco checks con `ok: false`; los
checks no ejecutables SHALL llevar `detail` `no verificable: esquema no inicializado`.

El comando `ancleto memory doctor` SHALL completar de forma determinista también sobre una base sin
esquema: tras reportar los cinco checks SHALL salir con código distinto de `0` sin lanzar una
excepción no capturada ni imprimir stack trace, y NO SHALL construir un engine read-only que
prepare statements contra `memory_nodes` cuando esa tabla no existe.

En modo por defecto, `Indice FTS5` SHALL intentar siempre una verificación **ejecutable** en
read-only y sólo SHALL reportarse `skipped` cuando la verificación no sea ejecutable por una
limitación del esquema. La cantidad de filas indexadas SHALL obtenerse de la tabla sombra de FTS5
(`memory_fts_docsize`), porque en FTS5 external-content `count(*)` sobre la tabla FTS resuelve
contra la tabla de contenido y siempre coincide. Los tres resultados posibles SHALL ser:

1. `memory_fts` no existe (esquema incompleto) → `ok: false` y `detail` que diga que el índice FTS
   está ausente y que la búsqueda no funciona. NUNCA SHALL reportarse `skipped`: es una falla
   detectable en read-only.
2. `memory_fts` existe pero la tabla sombra no es consultable (p. ej. FTS creado con
   `columnsize=0`) → `ok: true`, `skipped: true` y `detail` con el motivo. NO SHALL bajar `healthy`
   ni cambiar el exit code.
3. La consulta funciona → comparar con `memory_nodes`: si coinciden, `ok: true` con ambas
   cantidades en el `detail`; si difieren, `ok: false` nombrando ambas cantidades e indicando que
   `--rebuild` repara.

El integrity-check completo de FTS5 (el `INSERT` de control) SHALL ejecutarse sólo con `--rebuild`;
en modo por defecto el `detail` SHALL aclarar que la integridad completa no es verificable en
read-only.

El check `Checkpoint WAL` en modo por defecto SHALL reportarse `skipped: true` con `ok: true`, y su
`detail` SHALL incluir el estado observable del WAL: si el archivo `-wal` existe y cuántos bytes
tiene. En modo por defecto NO SHALL ejecutar checkpoint, `PRAGMA wal_checkpoint` ni ninguna
operación que lo fuerce. Con `--rebuild`, SHALL ejecutar el checkpoint y reportar su resultado.

`skipped` SHALL quedar reservado a los checks que no pueden ejecutarse en absoluto en el modo activo
o por una limitación del esquema. Un check omitido NO SHALL reportarse como consistente ni como
inconsistente. `healthy` SHALL ser `false` únicamente cuando algún check tenga `ok: false`; un check
omitido NO SHALL volver `healthy: false` ni cambiar el exit code.

#### Scenario: No-mutación sin WAL activo (T11)

- **WHEN** se ejecuta `memory doctor` sobre una fixture en `journal_mode=DELETE`, sin WAL activo
- **THEN** los bytes del archivo `.db` son idénticos antes y después
- **AND** no se crean archivos `-wal` ni `-shm` que no existieran antes

#### Scenario: No-mutación con WAL activo (T24)

- **WHEN** se ejecuta `memory doctor` sobre una fixture con `-wal` presente y frames sin checkpoint
- **THEN** los bytes del `.db` y del `-wal` son idénticos antes y después
- **AND** el tamaño del `-wal` no disminuye
- **AND** el `-shm` no se crea si no existía, no se trunca y su tamaño no cambia
- **AND** el read-mark del `-shm` puede cambiar y queda excluido de la igualdad byte a byte

La propiedad verificada por este scenario es "no hubo checkpoint ni escritura de datos", no "cero
bytes en los tres archivos".

#### Scenario: No-mutación con WAL frío

- **WHEN** la fixture está en modo WAL, cerrada limpia, sin `-wal` ni `-shm`
- **THEN** los bytes de `db` no cambian
- **AND** la base no gana ni pierde nodos
- **AND** pueden aparecer `-shm` y un `-wal` de 0 bytes, y eso no se reporta como falla
- **AND** el `detail` del check `Checkpoint WAL` indica si el `-wal` existe y su tamaño en bytes
- **AND** una segunda corrida no cambia ningún byte respecto de la primera

#### Scenario: Alineación FTS correcta

- **WHEN** se ejecuta `memory doctor` en modo read-only sobre una fixture consistente, con cada nodo
  indexado en `memory_fts`
- **THEN** el check `Indice FTS5` reporta `ok: true`
- **AND** `healthy` es `true`
- **AND** el check NO expone el campo `skipped`
- **AND** su `detail` incluye la cantidad de filas de `memory_fts_docsize` y la de `memory_nodes`

#### Scenario: Índice FTS ausente

- **WHEN** se ejecuta `memory doctor` en modo read-only sobre una fixture cuyo esquema no tiene
  `memory_fts`
- **THEN** el check `Indice FTS5` reporta `ok: false`
- **AND** NO expone el campo `skipped`
- **AND** su `detail` indica que el índice FTS está ausente y que la búsqueda no funciona
- **AND** `healthy` es `false` y el código de salida es distinto de `0`

#### Scenario: Tabla sombra no consultable

- **WHEN** se ejecuta `memory doctor` en modo read-only sobre una fixture cuyo `memory_fts` existe
  pero la tabla sombra no es consultable (p. ej. creado con `columnsize=0`)
- **THEN** el check `Indice FTS5` reporta `ok: true` y `skipped: true`
- **AND** su `detail` nombra el motivo de la omisión
- **AND** `healthy` es `true`, `rebuilt` es `false` y el código de salida es `0`

#### Scenario: Alineación FTS rota

- **WHEN** se remueve el trigger de indexación y se inserta un nodo que no queda indexado
- **THEN** el check `Indice FTS5` reporta `ok: false`
- **AND** `healthy` es `false` y el código de salida es distinto de `0`
- **AND** su `detail` nombra la cantidad de `memory_fts_docsize`, la de `memory_nodes` e indica que
  `--rebuild` repara

#### Scenario: Detección real de problemas sigue vigente

- **WHEN** `PRAGMA quick_check` no devuelve `ok` o existen dos nodos activos con la misma
  `memory_key`
- **THEN** el check correspondiente reporta `ok: false`
- **AND** `healthy` es `false`
- **AND** el código de salida es distinto de `0`

#### Scenario: Forma del reporte retrocompatible

- **WHEN** un consumidor lee el reporte de `memory doctor`
- **THEN** cada check expone `name`, `ok` y `detail`
- **AND** el reporte expone `checks`, `healthy` y `rebuilt`
- **AND** el estado omitido, cuando corresponde, se distingue por el campo opcional `skipped`,
  ausente en los checks verificados

#### Scenario: El reporte incluye el check de refs

- **WHEN** un consumidor lee el reporte de `memory doctor` en modo por defecto
- **THEN** el reporte incluye el check `Refs de nodos activos` con `name`, `ok` y `detail`
- **AND** los checks se reportan en el orden `Integridad DB`, `Indice FTS5`,
  `Reglas activas (unicidad)`, `Refs de nodos activos` y `Checkpoint WAL`

#### Scenario: Base sin esquema completa sin excepción no capturada

- **WHEN** se ejecuta `ancleto memory doctor` sobre una base de 0 bytes o sin `memory_nodes`
- **THEN** el comando imprime los cinco checks con `ok: false`
- **AND** el comando termina sin lanzar una excepción no capturada ni imprimir stack trace
- **AND** el comando sale con código distinto de `0`
