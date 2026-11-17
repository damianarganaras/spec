# Proposal: `memory gc --dry-run` estrictamente read-only

> **Clasificación:** cambio de conformidad. Cita un requirement existente que resuelve y **no
> lleva delta**: no se genera `specs/` ni se edita `aspec/specs/**`. Release **PATCH `0.39.1`**
> sobre `0.39.0` publicada. La rama de escritura (`memory gc` sin `--dry-run`) y la semántica de
> GC no se tocan.

## Related Work Item

No aplica: el change no tiene Work Item asociado y no se inventa uno.

## Contexto y problema

El requirement `Comando CLI ancleto memory gc` ya exige que `--dry-run` **sólo reporte sin
modificar la BD** (`aspec/specs/memory-ops/spec.md:284`) y su escenario afirma que "la BD no se
modifica" (`:286-290`). El handler actual no cumple esa garantía en el modo dry-run: valida flags
y luego abre siempre con el engine de escritura.

Evidencia verificada contra el código:

| Punto | Comportamiento actual | Fuente |
|---|---|---|
| Handler | `--dry-run` sólo selecciona el resultado; la apertura es común | `src/cli/index.js:3094-3124` |
| Apertura | `createMemoryEngine(dbPath)` también en dry-run: `mkdirSync`, `journal_mode=WAL` y migraciones | `src/cli/index.js:3110`; `src/core/memory/engine.js:836-838`; `src/core/memory/database.js:42-87` |
| Sin base | mensaje actual y `exit 0` duro | `src/cli/index.js:3106-3109` |
| Apertura RO compartida | ya existe, con precheck de existencia y esquema y engine dentro del manejo de error | `src/cli/index.js:2713-2743` |
| Precedente RO | `consolidate --dry-run` ya abre con `createReadonlyMemoryEngine` | `src/cli/index.js:3294` |
| Engine RO | `openDatabase(dbPath, { migrate: false, readonly: true })` | `src/core/memory/engine.js:840-844` |
| Esquema | `hasMemorySchema` es la detección canónica de `memory_nodes` | `src/core/memory/status.js:61-66` |
| Medición | dry-run sobre `.db` de 0 bytes: 0 → 36864 B, cambia el SHA-256, `exit 0` (reproducido) | medición local |
| Medición | base ilegible: excepción no capturada fuera del `try`, `exit 1` | medición local |

El requirement transversal `Superficies de lectura de memoria estrictamente read-only`
(`aspec/specs/memory-ops/spec.md:2230-2291`) fijó en 0.39.0 nueve superficies (`:2232-2235`) y su
mapa de degradación las enumera sin `gc` (`:2259-2283`). Este change **no reabre** ese requirement
ni lo modifica: lleva el dry-run de `gc` al mismo invariante de apertura y degradación, sin
declararlo una décima superficie del mapa.

`superseded_at` **ya existe** en el esquema vigente (`src/core/memory/database.js:18`) y lo
escriben las rutas de supersesión; la premisa de que falta en el esquema actual es falsa. El caso
"legacy" es una base creada antes de la migración aditiva (`database.js:52-85`), donde la columna
puede no estar.

## Requisito citado

- `spec:memory-ops#Comando CLI ancleto memory gc` — heading literal
  ``### Requirement: Comando CLI `ancleto memory gc` `` en
  `aspec/specs/memory-ops/spec.md:280`. Cláusula que se hace efectiva: `:284` ("Con `--dry-run`,
  SHALL solo reportar sin modificar la BD") y escenario `:286-290` ("la BD no se modifica"). El
  ref resuelve sin backticks porque el resolvedor canoniza el heading
  (`src/core/memory/engine.js:267-276`).

Anclas de contexto que el change respeta y NO SHALL contradecir:

- `spec:memory-ops#Superficies de lectura de memoria estrictamente read-only` — precheck de
  esquema reutilizando `hasMemorySchema` y construcción del engine después del precheck
  (`:2251-2257`); vacía legítima no es error e ilegible se distingue sin stack (`:2285-2287`).

## Intención

Que `ancleto memory gc --dry-run` abra la base **exclusivamente** con `openReadableMemory`
(read-only, `migrate: false`), reutilice `hasMemorySchema` y nunca construya un engine de
escritura. La rama sin `--dry-run` conserva intacto su contrato de purge + VACUUM + REINDEX.

## Alcance

### In scope

- **Modo de apertura del dry-run.** `memoryGc` abre con `openReadableMemory` cuando
  `flags` incluye `--dry-run`; `ok` construye el engine read-only y llama
  `gcSuperseded({ dryRun: true, days })`; una base vacía legítima reporta 0 nodos y `exit 0`.
- **Degradación sin esquema.** `no-db` → mensaje actual y `exit 0`; `uninitialized` → mensaje que
  nombra el esquema no inicializado y `exit 0`, sin construir engine; `unreadable` → mensaje
  propio y `exit 1`, sin stack trace.
- **Fallback legacy.** Sobre una base con `memory_nodes` pero sin `superseded_at`, el SELECT lazy
  del dry-run cae a `created_at` (degenerado exacto de `COALESCE(superseded_at, created_at)`),
  preservando el conteo observable actual sin migrar y en read-only.
- **Guard anti-regresión.** Bloque nuevo en `test/memory-readonly-surfaces.test.js` para 0 bytes,
  base DELETE con un superseded elegible, ilegible y base legacy sin `superseded_at`, sin tocar
  el array `surfaceRuns` que pinea "las nueve".
- Este proposal y `tasks.md`; el bump PATCH y la entrada de `CHANGELOG.md`.

### Out of scope (con razón)

- **Rama apply (`memory gc` sin `--dry-run`).** Sigue abriendo `createMemoryEngine` (RW, migra,
  purga, VACUUM + REINDEX) y su salida vigente.
- **Semántica de GC.** Elegibilidad `COALESCE(superseded_at, created_at)`, default 30 días,
  VACUUM/REINDEX best-effort post-COMMIT y no reactivación de superseded en import quedan
  intactos. No se cambia schema, PRAGMAs persistentes, `ruleVersion` ni la forma persistida.
- **El requirement transversal de 0.39.0.** No se reabre ni se le agrega `gc` al mapa; las nueve
  superficies ya cubiertas no se modifican.
- **Otros dry-runs** (`merge`, `repair refs`, `import`, `consolidate`, `curate`, `status`,
  `doctor`): ya cumplen su contrato.
- **`docs/PLAN*`, `docs/BACKLOG_*`, `AGENTS.md`, `PRODUCT.md`** y cualquier artefacto de seed o
  discovery.
- **El array `surfaceRuns`** y los conteos "nueve" del test existente: se preservan tal cual.
- **Documentar el fallback como requirement nuevo:** el comportamiento queda anclado al
  requirement citado y se verifica con tests; no se crea delta.

## Decisiones

**memory_key:** memory-gc-dryrun-readonly-open

**Elección:** el modo `--dry-run` de `memory gc` abre con `openReadableMemory` (read-only,
`migrate: false`) y reutiliza `hasMemorySchema`; la rama apply conserva `createMemoryEngine` (RW)
sin cambios.

**Descartado:** cambiar el engine de la rama apply, o mantener el engine de escritura también para
el dry-run.

**Justificación:** medido: el dry-run sobre un `.db` de 0 bytes lo migra a 36864 B y cambia su
SHA-256; el requirement exige que la BD no se modifique en dry-run. `openReadableMemory` ya existe
y es la apertura compartida por las superficies de lectura, así que no se duplica lógica ni se
inventa un segundo precheck.

**Refs:**
- spec:memory-ops#Comando CLI ancleto memory gc
- change:memory-gc-dry-run-readonly

**Estado:** aprobado

**memory_key:** memory-gc-dryrun-schemaless-exit

**Elección:** `no-db` y `uninitialized` salen con `exit 0` (este último con mensaje que nombra el
esquema no inicializado y sin construir engine); `unreadable` sale con `exit 1` y mensaje propio,
sin stack trace.

**Descartado:** `exit 1` para `uninitialized`, o reportar `uninitialized` como `unreadable`.

**Justificación:** "sin base" ya sale con 0 en este comando (`src/cli/index.js:3106-3109`) y
`import --dry-run` simula con `exit 0` sobre estado vacío; unificar "sin esquema" con "sin base"
mantiene paridad y evita stack. Una base ilegible es una falla distinta y no puede confundirse con
"sin esquema" (`aspec/specs/memory-ops/spec.md:2285-2287`).

**Refs:**
- spec:memory-ops#Comando CLI ancleto memory gc
- spec:memory-ops#Superficies de lectura de memoria estrictamente read-only
- change:memory-gc-dry-run-readonly

**Estado:** aprobado

**memory_key:** memory-gc-dryrun-legacy-superseded-fallback

**Elección:** sobre una base con `memory_nodes` pero sin `superseded_at`, el SELECT lazy del
dry-run cae a `created_at`, que es el degenerado exacto de `COALESCE(superseded_at, created_at)`;
mismo conteo observable de hoy, en read-only, sin migrar.

**Descartado:** fallar con `exit 1` en la base legacy (regresión de utilidad) y migrar durante el
dry-run (viola "no mutar").

**Justificación:** la migración aditiva ya existe (`src/core/memory/database.js:52-85`) y la
semántica de elegibilidad ya declara `COALESCE` con fallback a `created_at`; el fallback reproduce
ese mismo conjunto sin escribir la base. Los statements de GC ya son lazy precisamente para que
una base previa pueda abrirse read-only (`src/core/memory/engine.js:894-938`).

**Refs:**
- spec:memory-ops#Comando CLI ancleto memory gc
- change:memory-gc-dry-run-readonly

**Estado:** aprobado

**memory_key:** memory-gc-dryrun-conformity-patch

**Elección:** cambio de conformidad sin delta de spec, release PATCH `0.39.1`.

**Descartado:** un `MODIFIED` del requirement transversal y un release MINOR, que reabrirían el
contrato de 0.39.0 sin necesidad.

**Justificación:** el requirement citado ya contiene la obligación que se implementa; el change no
introduce comportamiento observable nuevo en la spec, sólo hace que la implementación cumpla el
enunciado vigente. La conformidad no lleva `specs/` por definición del flujo. El ref del heading
resuelve sin backticks porque `canonicalHeading` los elimina antes de comparar
(`src/core/memory/engine.js:267-276`).

**Refs:**
- spec:memory-ops#Comando CLI ancleto memory gc
- change:memory-gc-dry-run-readonly

**Estado:** aprobado

## Riesgos y supuestos

- **Riesgo (legacy) — conteo divergente.** Una base sin `superseded_at` podría contar distinto.
  Mitigación: usar exactamente `created_at` como degenerado del `COALESCE`, y test que compara el
  conteo esperado y verifica que el `.db` conserva SHA-256 y `sqlite_master` (la columna no se
  agrega).
- **Riesgo — test pinneado que hoy espera el throw.** `test/memory-engine.test.js:2242` afirma que
  el dry-run read-only sobre la base legacy lanza. El change lo actualiza deliberadamente a
  "devuelve conteo sin lanzar", conservando la intención de que los statements son lazy y que el
  read-only no migra.
- **Riesgo — sidecars WAL.** La apertura read-only puede materializar `-wal`/`-shm`; se toleran
  como artefacto de SQLite y no cuentan como escritura. La aserción fuerte es SHA-256 del `.db` y
  `sqlite_master` idénticos.
- **Riesgo — base de 0 bytes.** `hasMemorySchema` devuelve `false` → `uninitialized`, `exit 0`,
  sin crear esquema ni directorio.
- **Supuesto:** `openReadableMemory` (helper interno del CLI) es reutilizable por `memoryGc` sin
  extraerlo ni duplicar el precheck.
- **No-goal:** no se convierte ninguna lectura en gate de archive ni de promoción.

## Preguntas abiertas

Ninguna bloqueante. El modo de apertura, los exits y el fallback legacy quedaron fijados; el
contrato de la rama apply no se reabre.
