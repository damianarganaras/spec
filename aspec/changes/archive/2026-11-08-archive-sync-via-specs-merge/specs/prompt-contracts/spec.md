# Delta: archive-sync-via-specs-merge

## ADDED Requirements

### Requirement: Sync de delta al archivar ruteado por specs merge

Al archivar un change cuya `specs/` contiene un bloque de delta (`## ADDED Requirements`,
`## MODIFIED Requirements`, `## REMOVED Requirements` o `## RENAMED Requirements`), el rol que archiva
SHALL sincronizar las specs canónicas exclusivamente invocando
`ancleto specs merge --change <slug>`. NO SHALL editar `aspec/specs/<capability>/spec.md` a mano ni
aplicar por su cuenta las operaciones `ADDED`, `MODIFIED`, `REMOVED` o `RENAMED`. El guard de headings
de sección de delta SHALL permanecer en `src/core/specs-merge.js` como único dueño y NO SHALL
reimplementarse en las skills ni en los agentes de archive.

La invocación SHALL ocurrir cuando el usuario elige sincronizar, después del precheck de keywords
canónicas y antes del preflight de promoción. Exit code 0 SHALL considerarse sync exitoso y el archive
SHALL continuar con preflight, promoción y move. Cualquier exit code distinto de 0 —en particular 2 por
conflicto fail-closed— SHALL abortar el archive de ese change: NO SHALL ejecutar preflight ni
promoción, NO SHALL mover el directorio, y SHALL reportar la capability, el requirement y el motivo
devueltos por el comando. Si el CLI `ancleto` no está disponible al momento de sincronizar, la skill
SHALL detenerse (STOP) y reportar el bloqueo; NO SHALL aplicar un fallback manual.

Durante el flujo de archive —`ancleto-archive`, `ancleto-bulk-archive` y `agents/documenter.md` en modo
Change Archive—, `ancleto specs merge --change <slug>` SHALL ser la única vía de escritura sobre
`aspec/specs/**`: un delta que nombra una capability sin `aspec/specs/<capability>/spec.md` SHALL
fallar fail-closed, la capability NO SHALL crearse y el change NO SHALL moverse. Una segunda corrida
del mismo merge SHALL reportar `changed:false` y NO SHALL duplicar ni reordenar requirements; el
archive SHALL continuar normalmente.

Este requirement SHALL regir exclusivamente el flujo de archive. La skill standalone
`ancleto-sync-specs` y el modo `Standalone Source-of-Truth Update` de `agents/documenter.md` quedan
explícitamente FUERA de su alcance: mantienen su propio sync manual fuera del archive, su
comportamiento NO SHALL cambiar y esta regla NO SHALL aplicárseles.

Cuando no existe bloque de delta (change de conformidad), el archive NO SHALL invocar `specs merge`,
SHALL reportar `sin delta` nombrando la cita `spec:<capability>#<requirement>` y SHALL conservar el
camino sin escritura bajo `aspec/specs/**`.

La secuencia de archive NO SHALL cambiar: (1) merge/sync de specs cuando hay delta; (2) preflight
read-only del lote de promoción; (3) promoción de las decisiones aprobadas; (4) move a
`aspec/changes/archive/YYYY-MM-DD-<slug>/` sin modificar el directorio; (5) summary/commit. En
`ancleto-bulk-archive`, `specs merge` SHALL invocarse una vez por change en el orden determinado y el
skip de §5c SHALL conservar su comportamiento: sin invocación para el change sin implementación. El
texto de las skills y de `agents/documenter.md` NO SHALL prometer que `MODIFIED` preserva scenarios no
mencionados: el merge canónico reemplaza el bloque completo —cuerpo y escenarios— por el del delta.

#### Scenario: Sync elegido invoca specs merge y continúa

- **WHEN** un change con bloque de delta y spec canónica existente elige sincronizar
- **THEN** el archive invoca `ancleto specs merge --change <slug>` y no edita la spec canónica a mano
- **AND** con exit code 0 continúa con preflight, promoción y move en ese orden

#### Scenario: specs merge fail-closed aborta el archive

- **WHEN** `ancleto specs merge --change <slug>` termina con exit code 2, o con cualquier código
  distinto de 0
- **THEN** el archive no ejecuta preflight ni promoción y no mueve el directorio
- **AND** reporta la capability, el requirement y el motivo del fail-closed

#### Scenario: Delta de capability nueva no crea la capability

- **WHEN** el delta nombra una capability sin `aspec/specs/<capability>/spec.md`
- **THEN** `ancleto specs merge` falla fail-closed y no crea la capability
- **AND** el archive reporta el conflicto y no mueve el change

#### Scenario: Segunda corrida idempotente no duplica

- **WHEN** se repite el archive de un change cuyo merge ya se aplicó
- **THEN** `ancleto specs merge` reporta `changed:false`
- **AND** no se duplican ni reordenan requirements y el archive continúa normalmente

#### Scenario: Sin delta no invoca specs merge

- **WHEN** el change no tiene bloque de delta y su cita `spec:<capability>#<requirement>` resuelve
- **THEN** el archive no invoca `specs merge`
- **AND** reporta `sin delta` nombrando la cita y no modifica `aspec/specs/**/*.md`

#### Scenario: Orden de archive sin cambios

- **WHEN** un change con delta y decisiones aprobadas se archiva
- **THEN** la secuencia es merge/sync → preflight → promoción → move → summary/commit
- **AND** la promoción corre después del merge y antes del move

#### Scenario: Bulk archive invoca specs merge una vez por change

- **WHEN** se archiva un lote de changes con delta
- **THEN** `specs merge` se invoca una vez por change, en el orden determinado
- **AND** un fail-closed de un change no mueve ese change y el resto del lote continúa
- **AND** el skip de §5c no invoca `specs merge` para el change sin implementación

#### Scenario: MODIFIED no promete preservar escenarios

- **WHEN** se lee el texto de `skills/ancleto-archive`, `skills/ancleto-bulk-archive` o
  `agents/documenter.md`
- **THEN** no afirma que `MODIFIED` preserva scenarios no mencionados
- **AND** remite a `ancleto specs merge` como mecanismo y no a la edición manual de las cuatro
  operaciones

#### Scenario: El sync standalone queda fuera del ruteo de archive

- **WHEN** se usa la skill `ancleto-sync-specs` standalone o `agents/documenter.md` en modo
  `Standalone Source-of-Truth Update`
- **THEN** esta regla no aplica y su procedimiento no cambia
- **AND** no se los obliga a invocar `ancleto specs merge` ni se los prohíbe editar la spec canónica

#### Scenario: CLI no disponible detiene la skill sin fallback manual

- **WHEN** el CLI `ancleto` no está disponible al momento de sincronizar un delta durante el archive
- **THEN** la skill se detiene (STOP) y reporta el bloqueo
- **AND** no aplica un fallback manual ni edita la spec canónica a mano
