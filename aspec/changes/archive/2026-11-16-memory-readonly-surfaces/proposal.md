# Proposal: Superficies de lectura de memoria estrictamente read-only

> Defecto medido el 2026-11-16 sobre copias temporales de `.ancleto/memory.db`. Contrato de
> degradación de FASE 2 ya aprobado. El contrato de `memory status` (0.38.0) y `memory doctor`
> no se reabre: se conserva tal cual.

## Related Work Item

No aplica: el change no tiene Work Item asociado y no se inventa uno.

## Contexto y problema

Las superficies de lectura de memoria no comparten una garantía de apertura. Algunas abren con
el engine de escritura (`createMemoryEngine`), que ejecuta `mkdirSync`, activa WAL y corre
migraciones antes de leer. Sobre una base de 0 bytes el resultado es que una operación de
lectura **crea el esquema**, y en otros comandos el engine se construye fuera del `try`, de modo
que un esquema ausente termina en un stack `Error: no such table: memory_nodes`.

Defectos medidos (copia temporal, base de 0 bytes):

| Superficie | Comportamiento actual | Efecto medido |
|---|---|---|
| `memory context` | `createMemoryEngine` (`src/cli/index.js:2735`) | migra 0 → 36864 B, `journal_mode=wal`, 12 objetos en `sqlite_master`, exit 0 |
| `memory export` | `createMemoryEngine` (`:2901`) | migra 0 → 36864 B y devuelve `[]`, exit 0 |
| `memory list` | engine fuera del `try` (`:2868`) | stack `no such table: memory_nodes`, exit 1 |
| `memory merge --dry-run` | engine fuera del `try` (`:3122`) | stack `no such table: memory_nodes`, exit 1 |
| `memory repair refs` | engine fuera del `try` (`:3367`) | stack `no such table: memory_nodes`, exit 1 |
| `memory curate` | degrada limpio | exit 1, sin mutar |
| `memory import --dry-run` | degrada limpio | exit 1, sin mutar |
| `memory status` | `inspectDatabase` read-only (`status.js:64-83`) | `uninitialized`, exit 0, sin mutar |
| `memory doctor` | path temprano sin esquema (`doctor.js`) | exit 1, sin mutar |

Abrir read-only una base WAL deja `-wal` de 0 B y `-shm` de 32768 B con el `.db` byte-idéntico.
Es un artefacto de SQLite, tolerado, no una escritura de datos.

Hoy el día-cero de `memory context` se decide por **existencia del archivo** (`index.js:2735`),
no por esquema: una base de 0 bytes se trata como "hay memoria" y se migra. El chequeo de
esquema ya existe inline en `status.js:73-74`; no hay que inventar otro.

## Requisito citado

Anclas existentes que este change extiende y NO SHALL contradecir (todas resuelven contra
`aspec/specs/**`):

- `spec:memory-ops#Import con dry-run clasificado por memory_key` — heading exacto en
  `aspec/specs/memory-ops/spec.md:1592`. Fija el patrón "read-only estricto": abrir con
  `createReadonlyMemoryEngine` (`migrate: false`), ninguna sentencia de escritura y `.db` con
  bytes idénticos. Este change generaliza ese patrón a todas las lecturas.
- `spec:memory-ops#memory doctor estrictamente read-only` — heading canónico de
  `aspec/specs/memory-ops/spec.md:384`. Fija la degradación determinista sin stack sobre una
  base sin esquema y el exit 1 propio de `doctor`.
- `spec:memory-engine#Serialización de escritores concurrentes sobre la base de memoria` —
  `aspec/specs/memory-engine/spec.md:1320`. Ya enumera los caminos read-only (`doctor`,
  `curate`, dry-runs, `snapshot`, `createReadonlyMemoryEngine`) como no adquiribles del retry
  ni escritores ni migradores.

No hay requirement existente que quede falseado: el día-cero vigente se define por ausencia de
base (`spec:memory-engine#Materialización día-cero del working-context con topología`) y este
change sólo **extiende** ese día-cero al caso "base sin esquema"; no lo contradice. Por eso no
se agrega `MODIFIED`.

## Intención

Una sola garantía para todas las superficies de lectura: abrir la base read-only con
`migrate: false`, no ejecutar DDL ni migraciones, no crear `.ancleto/` ni `memory.db`, no
escribir nodos, reglas ni refs, y dejar el `.db` byte-idéntico (SHA-256) con `sqlite_master`
idéntico. Un mapa único de degradación por estado de base, con status y doctor conservados.

## Alcance

### In scope

- `memory context`, `list`, `export`, `curate`, `status`, `doctor`, `merge --dry-run`,
  `repair refs` (dry-run) e `import --dry-run`.
- Precheck de esquema reutilizando el chequeo de `sqlite_master` de `src/core/memory/status.js`.
- Apertura con `createReadonlyMemoryEngine` + `migrate: false` en las superficies que hoy usan
  el engine de escritura.
- Construcción del engine después del precheck y dentro del manejo de error, para eliminar los
  stacks de `list`, `merge` y `repair refs`.
- Exit codes y mensajes según el mapa de degradación.
- Test nuevo `test/memory-readonly-surfaces.test.js` (4 estados × superficies) y declaración en
  `test/affected-tests.json` si spawnea el CLI.

### Out of scope (con razón)

- **Cambiar `status` o `doctor`.** Sus contratos están pinneados por tests y por el contrato
  0.38.0; sólo se reutiliza el helper de esquema, sin alterar salida ni exit.
- **Schema, PRAGMAs persistentes o `ruleVersion`.** El change no agrega ni cambia objetos,
  journal mode ni versión de discovery.
- **Convertir lecturas en gate de archive o promoción.** `context`, `status` y `doctor` siguen
  advisory; no se agrega un segundo gate.
- **Prohibir sidecars WAL.** Son un artefacto de la apertura read-only; se toleran y se
  verifican, no se promete "cero bytes en los tres archivos".
- **`memory gc --dry-run`.** Este ítem enumeró 9 superficies y agregarla excedería el alcance
  aprobado; se verificó que hoy abre con `createMemoryEngine` (`src/cli/index.js:3110`) y migra
  un `.db` de 0 bytes, así que se registra como follow-up (misma clase de defecto). `consolidate
  --dry-run` ya abre read-only y no requiere cambio.

## Decisiones

**memory_key:** memory-readonly-surfaces-no-migrate

**Elección:** todas las superficies de lectura abren con `createReadonlyMemoryEngine`
(`migrate: false`) y un precheck de esquema; el `.db` conserva su SHA-256 y `sqlite_master`
idéntico, y los sidecars `-wal`/`-shm` de una apertura WAL read-only se toleran como artefacto
de SQLite.

**Descartado:** conservar el engine de escritura para leer (comportamiento actual) o "crear la
base para poder leer".

**Justificación:** medido: `context` y `export` abren una base de 0 bytes en escritura y la
migran 0 → 36864 B con 12 objetos en `sqlite_master`. Una lectura no debe crear esquema. El
`.db` byte-idéntico es el invariante verificable; los sidecars son un efecto de la apertura,
no una escritura de datos.

**Refs:**
- spec:memory-ops#Import con dry-run clasificado por memory_key
- spec:memory-ops#memory doctor estrictamente read-only
- path:src/core/memory/engine.js
- path:src/core/memory/database.js
- change:memory-readonly-surfaces

**Estado:** aprobado

**memory_key:** memory-schemaless-degrades-as-no-db

**Elección:** "sin esquema" (archivo de 0 bytes o sin `memory_nodes`) degrada igual que "sin
base" por superficie, salvo `status` (nombra `uninitialized`, exit 0) y `doctor` (exit 1). Una
base con esquema y 0 nodos es vacía legítima, no error. Una base ilegible se distingue de "sin
esquema" con mensaje y exit distinto de 0, sin stack.

**Descartado:** tratar una base sin esquema como una base con 0 nodos (`[]`, exit 0) o reportar
`uninitialized` como `empty`.

**Justificación:** el comportamiento "sin base" ya está pinneado (list 0, context 0, curate 1,
`mcp.test.js:239-244`, `cli.test.js:4093-4130`) y el chequeo de `sqlite_master` ya existe en
`status.js:73-74`. Unificar evita un segundo gate y elimina la migración silenciosa. Los stacks
actuales de `list`, `merge` y `repair refs` provienen de construir el engine fuera del `try`.

**Refs:**
- spec:memory-engine#Materialización día-cero del working-context con topología
- spec:memory-engine#Conjunto crítico estable del working-context
- path:src/core/memory/status.js
- path:src/cli/index.js
- change:memory-readonly-surfaces

**Estado:** aprobado

## Riesgos y supuestos

- **Supuesto:** el chequeo de `sqlite_master` de `status.js` es la definición canónica de
  "esquema inicializado"; se extrae, no se duplica.
- **Riesgo:** cambiar la apertura de `context` puede alterar el día-cero cuando la base existe
  sin esquema. Mitigación: test dedicado sobre base de 0 bytes y sobre base sin `memory_nodes`.
- **Riesgo:** sidecars WAL en fixtures pueden confundir la aserción de "no mutación".
  Mitigación: el test compara SHA-256 de `.db` y `sqlite_master`, y trata sidecars por separado.
- **Riesgo:** `merge --dry-run` y `repair refs` sobre base con esquema deben conservar sus
  validaciones (target inexistente, cardinalidad); sólo cambia el camino sin esquema.
- **No-goal:** no se toca la cuarentena de `doctor --rebuild` ni la escritura de `repair
  --apply`, que son caminos de escritura y conservan su contrato.

## Preguntas abiertas

Ninguna bloqueante. El mapa de exit codes y mensajes quedó fijado en la spec delta.
