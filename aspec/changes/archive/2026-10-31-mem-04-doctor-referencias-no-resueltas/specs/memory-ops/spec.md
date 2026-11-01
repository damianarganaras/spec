# Delta: memory-ops

## MODIFIED Requirements

### Requirement: `memory doctor` estrictamente read-only

`memory doctor` SHALL abrir la base con `{ migrate: false, readonly: true }` en su modo por defecto y NO
SHALL ejecutar checkpoint, DDL, `INSERT` sobre `memory_fts`, reconstrucción de FTS ni ningún pragma
mutante. El modo por defecto NO SHALL escribir datos: el contenido de `db` y de `-wal` NO SHALL cambiar.

La apertura read-only que hace SQLite PUEDE materializar `-shm` y un `-wal` de 0 bytes cuando no existían,
porque el acceso WAL en read-only requiere el índice de memoria compartida. Esa materialización NO SHALL
reportarse como falla de `doctor`, NO SHALL alterar el contenido de la base y SHALL quedar verificada por
test. Ningún nodo SHALL crearse, modificarse ni borrarse por esa materialización.

El reporte SHALL conservar la forma `{ checks: [{ name, ok, detail }], healthy, rebuilt }`. `ok` SHALL
seguir siendo booleano y SHALL significar "no se detectó falla". Los cinco checks SHALL mantenerse con
sus nombres actuales: `Integridad DB`, `Indice FTS5`, `Reglas activas (unicidad)`,
`Refs de nodos activos` y `Checkpoint WAL`.

El path temprano de esquema no inicializado SHALL reportar los cinco checks con `ok: false`; los checks
no ejecutables SHALL llevar `detail` `no verificable: esquema no inicializado`.

En modo por defecto, `Indice FTS5` SHALL intentar siempre una verificación **ejecutable** en read-only y
sólo SHALL reportarse `skipped` cuando la verificación no sea ejecutable por una limitación del esquema.
La cantidad de filas indexadas SHALL obtenerse de la tabla sombra de FTS5 (`memory_fts_docsize`), porque en
FTS5 external-content `count(*)` sobre la tabla FTS resuelve contra la tabla de contenido y siempre
coincide. Los tres resultados posibles SHALL ser:

1. `memory_fts` no existe (esquema incompleto) → `ok: false` y `detail` que diga que el índice FTS está
   ausente y que la búsqueda no funciona. NUNCA SHALL reportarse `skipped`: es una falla detectable en
   read-only.
2. `memory_fts` existe pero la tabla sombra no es consultable (p. ej. FTS creado con `columnsize=0`) →
   `ok: true`, `skipped: true` y `detail` con el motivo. NO SHALL bajar `healthy` ni cambiar el exit code.
3. La consulta funciona → comparar con `memory_nodes`: si coinciden, `ok: true` con ambas cantidades en el
   `detail`; si difieren, `ok: false` nombrando ambas cantidades e indicando que `--rebuild` repara.

El integrity-check completo de FTS5 (el `INSERT` de control) SHALL ejecutarse sólo con `--rebuild`; en modo
por defecto el `detail` SHALL aclarar que la integridad completa no es verificable en read-only.

El check `Checkpoint WAL` en modo por defecto SHALL reportarse `skipped: true` con `ok: true`, y su `detail`
SHALL incluir el estado observable del WAL: si el archivo `-wal` existe y cuántos bytes tiene. En modo por
defecto NO SHALL ejecutar checkpoint, `PRAGMA wal_checkpoint` ni ninguna operación que lo fuerce. Con
`--rebuild`, SHALL ejecutar el checkpoint y reportar su resultado.

`skipped` SHALL quedar reservado a los checks que no pueden ejecutarse en absoluto en el modo activo o por
una limitación del esquema. Un check omitido NO SHALL reportarse como consistente ni como inconsistente.
`healthy` SHALL ser `false` únicamente cuando algún check tenga `ok: false`; un check omitido NO SHALL
volver `healthy: false` ni cambiar el exit code.

#### Scenario: El reporte incluye el check de refs

- **WHEN** un consumidor lee el reporte de `memory doctor` en modo por defecto
- **THEN** el reporte incluye el check `Refs de nodos activos` con `name`, `ok` y `detail`
- **AND** los checks se reportan en el orden `Integridad DB`, `Indice FTS5`,
  `Reglas activas (unicidad)`, `Refs de nodos activos` y `Checkpoint WAL`

### Requirement: Reparación explícita con `memory doctor --rebuild`

`memory doctor --rebuild` SHALL ser el único camino de `doctor` que escribe en la base. Al usarse, SHALL
abrir la base en modo escritura, reconstruir el índice FTS5, verificar su consistencia y reportar
`rebuilt: true`. Los cinco checks SHALL quedar verificados en este modo, sin checks omitidos; la única
omisión admitida es `Refs de nodos activos` cuando la raíz del proyecto no se puede derivar y no hay
defecto detectable sin raíz (bloque `refs:` malformado o repetido), y esa omisión NO SHALL impedir que el
índice FTS5 se reconstruya ni que `rebuilt` sea `true`. En modo por defecto,
`rebuilt` NO SHALL ser `true` y el índice NO SHALL modificarse.

El sistema NO SHALL crear un comando `memory maintenance`.

## ADDED Requirements

### Requirement: Diagnóstico de refs no resueltas en nodos activos

El check `Refs de nodos activos` SHALL reportarse con la misma forma `{ name, ok, detail }` que los demás
checks y SHALL ejecutarse tanto en el modo por defecto como con `--rebuild`. El check NO SHALL escribir en
la base: SHALL limitarse a leer `aspec/specs/**/spec.md`, listar `aspec/changes/**` y usar
`existsSync`/`statSync`. NO SHALL ejecutar checkpoint, DDL, indexación de FTS ni pragma mutante.

El check SHALL revisar cada nodo con `status='active'` y, por cada ref de tipo `spec:`, `change:` o `path:`
declarada en su bloque `refs:`, determinar si resuelve. SHALL reutilizar el mismo parser, la misma gramática
y la misma resolución que el camino de escritura del engine; NO SHALL existir un segundo parser ni un
segundo resolvedor. `commit:` y `workitem:` NO SHALL verificarse en este corte: SHALL excluirse del
listado de rotas y su conteo aparte como no verificables SHALL agregarse sólo en el `detail` sin rotas,
nunca en el `detail` con rotas.

Un ref de un nodo activo que no resuelve SHALL ser una falla detectable: el check SHALL reportar
`ok: false`, `healthy` SHALL ser `false` y el comando SHALL salir con código distinto de `0`. El sistema
NO SHALL resolver la ambigüedad eligiendo una coincidencia: una ref con más de una coincidencia SHALL
reportarse como ambigua con la cantidad. El sistema NO SHALL abortar ante una ref rota: SHALL completar el
reporte con todas las rotas encontradas.

La omisión del check —reportar `ok: true` con `skipped: true` y el motivo— SHALL aplicar SÓLO cuando se
cumplen las tres condiciones a la vez: hay refs `spec:`, `change:` o `path:` que verificar, NO hay
defecto detectable sin raíz (bloque `refs:` malformado o repetido) y la raíz del proyecto no se puede
derivar. Esa omisión NO SHALL bajar `healthy` ni cambiar el exit code, y SHALL ser el único caso en que
el check usa `skipped`. Si hay un defecto detectable sin raíz, el check SHALL reportar `ok: false`
nombrando la `memory_key` y el motivo, aun sin raíz. Si no hay refs `spec:`, `change:` o `path:` que
verificar —base vacía, nodos sin bloque `refs:` o nodos con solo `commit:`/`workitem:`— el check NO
SHALL requerir la raíz del proyecto y NO SHALL reportarse `skipped`.

Sin refs NO SHALL ser falla. Una base con 0 refs verificables, o con nodos activos sin bloque `refs:`,
SHALL reportarse `ok: true` con un `detail` que diga `0 refs verificadas` y el conteo de nodos activos
revisados. Una base vacía NO SHALL reportarse `skipped` ni como falla.

Los motivos SHALL ser acotados y estables para los tres tipos:

- `inexistente`: el spec, el change o el path no existe.
- `ambiguo (<n> coincidencias)`: hay más de una coincidencia; el sistema no elige.
- `inválido (<causa>)`: la ref no matchea la gramática, declara un `path:` absoluto, contiene `../` o el
  nodo declara más de un bloque `refs:`.

Un bloque `refs:` vacío NO SHALL aportar refs y NO SHALL reportarse como falla.

El `detail` sin rotas SHALL ser
`N refs verificadas en M nodos activos; 0 no resuelven`, donde `M` es la cantidad de nodos activos
revisados; si existen refs `commit:` o `workitem:`, SHALL agregarse el conteo aparte como no verificables.
El `detail` con rotas SHALL ser
`K refs no resuelven: "<memory_key>" -> <ref textual> (<motivo>); ...`, con cada entrada identificada por
la `memory_key` del nodo y la ref textual tal cual aparece en `content`. Las entradas SHALL listarse
ordenadas por `memory_key` —y, a igual `memory_key`, en el orden en que aparecen las refs en `content`—,
de modo que dos corridas consecutivas produzcan el mismo `detail`.

El sistema NO SHALL agregar una variante de `change:` con fecha. El slug canónico SHALL ser el del change
activo o el del archive `YYYY-MM-DD-<slug>`; una ref `change:<YYYY-MM-DD-slug>` SHALL reportarse como no
resuelta con motivo `inexistente`.

Queda fuera de alcance resolver `path:` con `realpath` o exigir containment de symlinks: se conserva la
validación léxica y de existencia del camino de escritura. Ese gap SHALL declararse como no-goal y NO SHALL
prometerse detección de paths que escapan por symlink.

#### Scenario: Change archivado único resuelve sin rotas (T09)

- **WHEN** existe un único `aspec/changes/archive/YYYY-MM-DD-<slug>` y un nodo activo declara
  `change:<slug>`
- **THEN** el check `Refs de nodos activos` reporta `ok: true`
- **AND** su `detail` indica `0 no resuelven`
- **AND** `healthy` es `true`

#### Scenario: Dos archives con el mismo slug se reportan ambiguos (T09)

- **WHEN** existen dos directorios `aspec/changes/archive/YYYY-MM-DD-<slug>` que matchean el mismo slug y
  un nodo activo declara `change:<slug>`
- **THEN** el check reporta `ok: false` y `healthy` es `false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y `ambiguo (2 coincidencias)`
- **AND** el sistema no elige ninguno de los dos archives y `doctor` completa el reporte sin abortar

#### Scenario: Heading de spec ambiguo se reporta sin elegir (T29)

- **WHEN** un `spec.md` declara dos `### Requirement:` que canonicalizan al mismo heading y un nodo activo
  declara `spec:<capability>#<heading>`
- **THEN** el check reporta `ok: false` y `healthy` es `false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y `ambiguo (2 coincidencias)`
- **AND** el sistema no elige ninguno de los dos headings

#### Scenario: Spec inexistente o heading sin coincidencia se reporta

- **WHEN** un nodo activo declara `spec:<capability>#<heading>` y no existe el `spec.md` o ningún heading
  coincide
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y el motivo `inexistente`

#### Scenario: Change sin activo ni archive coincidente se reporta

- **WHEN** un nodo activo declara `change:<slug>` y no existe `aspec/changes/<slug>` ni un archive
  `YYYY-MM-DD-<slug>`
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y el motivo `inexistente`

#### Scenario: Path inexistente se reporta

- **WHEN** un nodo activo declara `path:<repository-relative-path>` y el archivo no existe
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y el motivo `inexistente`

#### Scenario: Path absoluto o con ../ se reporta inválido

- **WHEN** un nodo activo declara un `path:` absoluto o con `../`
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key`, la ref textual y un motivo `inválido` que distingue el path
  absoluto del `../`

#### Scenario: Ref con gramática inválida se reporta

- **WHEN** un nodo activo declara en su bloque `refs:` una línea que no matchea la gramática
- **THEN** el check reporta `ok: false`
- **AND** su `detail` usa la línea ofensora como ref textual y el motivo `inválido (gramática)`

#### Scenario: Bloque refs repetido se reporta inválido

- **WHEN** un nodo activo declara más de un bloque `refs:`
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la `memory_key` y el motivo `inválido (gramática)`

#### Scenario: Change con prefijo de fecha no resuelve

- **WHEN** un nodo activo declara `change:<YYYY-MM-DD-slug>` y el archive existe como
  `aspec/changes/archive/YYYY-MM-DD-<slug>`
- **THEN** el check reporta `ok: false`
- **AND** su `detail` nombra la ref textual y el motivo `inexistente`
- **AND** una ref `change:<slug>` sobre el mismo archive resuelve

#### Scenario: Frontera de commit y workitem

- **WHEN** un nodo activo declara únicamente refs `commit:` y `workitem:`
- **THEN** el check reporta `ok: true`
- **AND** esas refs no aparecen en el listado de rotas
- **AND** si existen, se cuentan aparte como no verificables en el `detail`

#### Scenario: Nodos activos sin refs no son falla

- **WHEN** la base tiene nodos activos que no declaran bloque `refs:` o declaran un bloque vacío
- **THEN** el check reporta `ok: true`
- **AND** su `detail` indica `0 refs verificadas` y el conteo de nodos activos revisados
- **AND** `healthy` es `true`

#### Scenario: DB vacía reporta cero refs verificadas

- **WHEN** la base tiene el esquema inicializado y 0 nodos
- **THEN** el check `Refs de nodos activos` reporta `ok: true`
- **AND** su `detail` indica `0 refs verificadas`
- **AND** el check NO expone `skipped`
- **AND** `healthy` es `true`

#### Scenario: Raíz de proyecto no resoluble omite el check

- **WHEN** hay refs que verificar, no hay defecto detectable sin raíz y `doctor` no puede derivar la raíz
  del proyecto
- **THEN** el check reporta `ok: true` y `skipped: true`
- **AND** su `detail` nombra el motivo de la omisión
- **AND** `healthy` no baja y el exit code no cambia

#### Scenario: Raíz no derivable con bloque refs malformado no omite el check

- **WHEN** hay refs que verificar, `doctor` no puede derivar la raíz del proyecto y un nodo activo declara
  un bloque `refs:` malformado
- **THEN** el check reporta `ok: false` y NO expone `skipped`
- **AND** su `detail` nombra la `memory_key` y el motivo `inválido (gramática)`

#### Scenario: Esquema no inicializado reporta el check como no verificable

- **WHEN** `doctor` corre sobre una base sin `memory_nodes`
- **THEN** el reporte incluye los cinco checks con `ok: false`
- **AND** el check `Refs de nodos activos` lleva `detail` `no verificable: esquema no inicializado`

#### Scenario: No-mutación al verificar refs rotas

- **WHEN** `doctor` corre en modo por defecto sobre una fixture con nodos activos cuyas refs no resuelven
- **THEN** los bytes del `.db` no cambian; si el `-wal` existía antes, sus bytes tampoco cambian
- **AND** el conjunto de nodos activos no cambia
- **AND** una segunda corrida es idempotente: no cambia ningún byte de `.db` y `-wal` respecto de la
  primera
- **AND** los sidecars `-shm` o un `-wal` de 0 bytes materializados por la apertura read-only no se
  reportan como falla

#### Scenario: Refs sin indentar cuentan como verificadas

- **WHEN** un nodo activo declara `refs:` seguido de items de lista sin indentar
- **THEN** esas refs cuentan como verificadas en el `detail` del check
- **AND** una ref rota entre ellas se reporta con su `memory_key`, la ref textual y el motivo,
  igual que una ref indentada
