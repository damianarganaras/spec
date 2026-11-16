# Delta: memory-ops — Superficies de lectura read-only

## ADDED Requirements

### Requirement: Superficies de lectura de memoria estrictamente read-only

**Superficies alcanzadas.** El sistema SHALL tratar como superficies de lectura de memoria a
`memory context`, `memory list`, `memory export`, `memory curate`, `memory status`,
`memory doctor`, `memory merge --dry-run`, `memory repair refs` sin `--apply` y
`memory import --dry-run`. Todas ellas SHALL abrir la base exclusivamente con
`{ readonly: true, migrate: false }`.

**Garantía read-only.** Ninguna superficie de lectura SHALL ejecutar DDL, migraciones,
`VACUUM`, checkpoint, `PRAGMA` mutante ni escritura de nodos, reglas o refs. Ninguna SHALL
crear `.ancleto/` ni `.ancleto/memory.db` como efecto de abrir la base. Sobre una base
existente, el archivo `.db` SHALL conservar el mismo hash SHA-256 y el conjunto de objetos de
`sqlite_master` (nombre y tipo) SHALL ser idéntico antes y después. La excepción intencional es
`memory context --out`, que MAY escribir el working-context —y por ello crear su directorio—
pero NO SHALL escribir el `.db`. `memory doctor --rebuild` es un camino de ESCRITURA y queda
fuera de este requisito: conserva su apertura de escritura y su contrato vigente para
reconstruir el índice FTS5, del mismo modo que `merge` y `repair` distinguen `--apply` como
camino de escritura frente a `--dry-run`. La materialización de sidecars `-wal`/`-shm` por una
apertura read-only sobre `journal_mode=WAL` SHALL tolerarse como artefacto de SQLite y NO SHALL
contarse como escritura; en `journal_mode=DELETE` NO SHALL aparecer ningún sidecar nuevo.

**Precheck de esquema.** Una base cuya `sqlite_master` no declare `memory_nodes` —archivo de
0 bytes o esquema incompleto— SHALL considerarse "sin esquema" y SHALL degradar igual que "sin
base" por superficie, salvo los contratos propios de `status` y `doctor`. La detección SHALL
reutilizar el chequeo de `sqlite_master` vigente y NO SHALL duplicar su consulta. La
construcción del engine SHALL ocurrir después del precheck y dentro del manejo de error, de
modo que un esquema ausente o una apertura fallida produzcan un mensaje acotado y NO un stack
trace.

**Mapa de degradación.** El comportamiento por superficie y estado de base SHALL ser:

- `context`: sin base → día-cero con exit 0; sin esquema → día-cero con exit 0 y sin migrar;
  esquema con 0 nodos → render read-only que evalúa el conjunto `required` de `criticalKeys` y
  MAY salir con código distinto de 0 si una clave requerida no existe (contrato preexistente, no
  regresión); esquema con nodos → render read-only.
- `list`: sin base → mensaje y exit 0; sin esquema → mensaje que nombra el esquema no
  inicializado y exit 0; esquema con 0 nodos → mensaje de "sin nodos" y exit 0; esquema con
  nodos → exit 0.
- `export`: sin base → mensaje y exit 1; sin esquema → mensaje que nombra el esquema no
  inicializado y exit 1; esquema con 0 nodos → `[]` y exit 0; esquema con nodos → JSON y
  exit 0.
- `curate`: sin base → exit 1; sin esquema → exit 1 sin stack; esquema con 0 nodos → exit 0;
  esquema con nodos → exit 0.
- `status`: `no-db` con exit 0; `uninitialized` con exit 0; `empty` con exit 0; `ok` con
  exit 0, sin cambio respecto del contrato vigente.
- `doctor`: sin base → exit 0; sin esquema → exit 1; esquema con 0 nodos → exit 0; esquema con
  nodos → exit 0, sin cambio respecto del contrato vigente.
- `merge --dry-run`: sin base → exit 1; sin esquema → exit 1 sin stack; con esquema → las
  validaciones propias del contrato de merge.
- `repair refs` sin `--apply`: sin base → exit 1; sin esquema → exit 1 sin stack; con esquema
  → las validaciones propias del contrato de repair.
- `import --dry-run`: sin base → simulacro con exit 0; sin esquema → simulacro sobre estado
  vacío con exit 0; esquema con 0 nodos → clasificación con exit 0; esquema con nodos →
  clasificación con exit 0.

**Vacía legítima y base ilegible.** Una base con esquema y 0 nodos SHALL considerarse vacía
legítima y NO SHALL reportarse como error. Una base ilegible SHALL producir un mensaje y un
código de salida distinto de `0` que la distingan de "sin esquema", sin stack trace.

**No es un segundo gate.** Este requirement NO SHALL convertir ninguna superficie de lectura en
gate de archive ni de promoción, ni SHALL alterar los códigos de salida propios de `status` y
`doctor`.

#### Scenario: `context` sobre una base de 0 bytes no migra

- **WHEN** se ejecuta `memory context` sobre una base `.ancleto/memory.db` de 0 bytes
- **THEN** el comando sale con código 0 y emite el día-cero (topología) sin abrir un engine de
  escritura
- **AND** el hash SHA-256 del `.db` no cambia y el archivo sigue sin esquema
- **AND** el conjunto de objetos de `sqlite_master` no incorpora tablas, índices, triggers ni
  vistas

#### Scenario: `export` sobre una base de 0 bytes falla sin migrar

- **WHEN** se ejecuta `memory export` sobre una base de 0 bytes
- **THEN** el comando sale con código 1
- **AND** el mensaje nombra el esquema no inicializado y no imprime stack trace
- **AND** el `.db` conserva su hash SHA-256 y su `sqlite_master` idéntico

#### Scenario: `list` sobre una base de 0 bytes sale 0 con aviso

- **WHEN** se ejecuta `memory list` sobre una base de 0 bytes
- **THEN** el comando sale con código 0
- **AND** el mensaje nombra el esquema no inicializado y no imprime stack trace
- **AND** el `.db` conserva su hash SHA-256

#### Scenario: `curate` sobre una base sin `memory_nodes` degrada sin stack

- **WHEN** se ejecuta `memory curate` sobre una base sin tabla `memory_nodes`
- **THEN** el comando sale con código 1 sin lanzar una excepción no capturada ni imprimir stack
  trace
- **AND** el `.db` conserva su hash SHA-256 y su `sqlite_master` idéntico

#### Scenario: `merge --dry-run` y `repair refs` no lanzan stack sin esquema

- **WHEN** se ejecuta `memory merge --dry-run` o `memory repair refs` sobre una base sin
  `memory_nodes`
- **THEN** cada comando sale con código 1
- **AND** el mensaje nombra el esquema no inicializado y no imprime stack trace
- **AND** la base no se modifica

#### Scenario: Esquema con 0 nodos es vacía legítima, no error

- **WHEN** se ejecuta `memory list`, `memory export` o `memory curate` sobre una base con
  esquema y 0 nodos
- **THEN** `list` reporta la ausencia de nodos y sale 0
- **AND** `export` devuelve `[]` y sale 0
- **AND** `curate` sale 0 sin reportar la base como error
- **AND** el hash SHA-256 del `.db` es idéntico antes y después

#### Scenario: La ausencia de `.ancleto/` no se materializa por una lectura

- **WHEN** se ejecutan las superficies de lectura en un directorio sin `.ancleto/`
- **THEN** ninguna crea el directorio `.ancleto/` ni el archivo `.ancleto/memory.db`
- **AND** los mensajes y códigos de salida corresponden al estado "sin base"

#### Scenario: `context --out` escribe sólo el working-context

- **WHEN** se ejecuta `memory context --out <ruta>` sobre una base sin esquema o inexistente
- **THEN** el comando escribe el working-context en la ruta indicada y sale con código 0
- **AND** crea el directorio del archivo de salida si falta
- **AND** no crea ni modifica `.ancleto/memory.db`

#### Scenario: Los sidecars WAL de una apertura read-only se toleran

- **WHEN** una superficie de lectura abre una base con `journal_mode=WAL`
- **THEN** el hash SHA-256 del `.db` es idéntico antes y después
- **AND** la eventual materialización de `-wal` o `-shm` no se reporta como falla ni como
  escritura de datos
- **AND** ningún nodo cambia de estado

#### Scenario: En `journal_mode=DELETE` no aparecen sidecars

- **WHEN** una superficie de lectura abre una base en `journal_mode=DELETE`
- **THEN** no se crean archivos `-wal` ni `-shm` que no existieran antes
- **AND** el hash SHA-256 del `.db` es idéntico antes y después

#### Scenario: Una base ilegible se distingue de "sin esquema"

- **WHEN** una superficie de lectura intenta abrir una base cuyo contenido no es una base
  SQLite válida o no puede leerse
- **THEN** el comando sale con código distinto de 0
- **AND** el mensaje distingue el fallo de lectura del estado "sin esquema" y no imprime stack
  trace

#### Scenario: `status` conserva sus cuatro estados

- **WHEN** se ejecuta `memory status` sobre una base ausente, sin esquema, con esquema y 0
  nodos, y con esquema y nodos
- **THEN** los estados reportados son `no-db`, `uninitialized`, `empty` y `ok`
- **AND** el código de salida es 0 en los cuatro casos
- **AND** el `.db` y su `sqlite_master` no se modifican

#### Scenario: `doctor` conserva sus códigos y no muta

- **WHEN** se ejecuta `memory doctor` respectivamente sin base, sobre una base sin esquema,
  sobre una base con esquema y 0 nodos, y sobre una base con esquema y nodos
- **THEN** los códigos de salida son 0, 1, 0 y 0
- **AND** una base de 0 bytes sigue midiendo 0 bytes
- **AND** no se crea `.ancleto/` ni `memory.db`

#### Scenario: Ninguna lectura escribe nodos ni es un gate

- **WHEN** se ejecutan todas las superficies de lectura sobre una base con esquema y nodos
- **THEN** la cantidad de nodos y sus `status`, `superseded_by` y `superseded_at` no cambian
- **AND** el hash SHA-256 del `.db` y el conjunto de `sqlite_master` son idénticos antes y
  después
- **AND** ninguna superficie devuelve un veredicto que bloquee el archive o la promoción
