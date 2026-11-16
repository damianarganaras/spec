# Spec delta: memory-repair-refs — memory-ops

## ADDED Requirements

### Requirement: Reparación explícita de refs no resueltas con `memory repair refs`

El sistema SHALL exponer el subcomando
`ancleto memory repair refs --memory-key <key> [--apply] [--force-critical] [--json]` dentro de la
familia existente `memory`. El subcomando SHALL ser un wrapper fino sobre un método del engine y NO
SHALL introducir una tool MCP nueva ni un comando `memory restore`.

**Operación única.** La operación SHALL remover de un nodo activo exactamente las refs declaradas
en su bloque `refs:` cuya resolución devuelva `ok: false` con motivo `inexistente`. El resto del
`content` SHALL permanecer byte-idéntico: prosa, separadores, indentación y las demás refs NO SHALL
alterarse. Las refs `commit:` y `workitem:` NO SHALL removerse nunca porque no son verificables
localmente. Las refs con motivo `ambiguo (<n> coincidencias)` o `sin raíz` NO SHALL removerse. La
reparación NO SHALL redirigir una ref de una `memory_key` a otra, NO SHALL reescribir un bloque
`refs:` malformado y NO SHALL reactivar un nodo `superseded`.

**Selección fail-closed.** `--memory-key` SHALL ser obligatoria. Sin ella, el comando SHALL mostrar
el uso y salir con código `1`; una flag desconocida SHALL producir el mismo rechazo. La operación
SHALL exigir exactamente un nodo activo con la `memory_key` indicada; con cero o con dos o más
nodos activos SHALL salir con código `1` sin escribir la base ni el working-context.

**Dry-run y aplicación.** Sin `--apply`, el comando SHALL operar en dry-run, SHALL abrir la base en
modo read-only con `migrate: false` y NO SHALL escribir la base, sus sidecars ni el
working-context; SHALL reportar el plan de remoción. Con `--apply`, SHALL aplicar la reparación.
El dry-run SHALL validar el `content` candidato con la misma validación que usa la escritura, de
modo que un plan que `--apply` rechazaría NO SHALL reportarse como aplicable; en ese caso la salida
SHALL ser `status: "error"` con código `1` y cero escrituras, nombrando la ref que impide la
escritura.

**Camino de escritura.** La escritura SHALL realizarse mediante un método del engine que supersede
el nodo activo por el mismo writer transaccional `BEGIN IMMEDIATE` y las mismas primitivas de
gramática y resolución que el camino único de escritura. NO SHALL ejecutarse un `UPDATE` crudo de
`content` ni SHALL usarse `import` como sustituto. La operación SHALL preservar la unicidad de nodo
activo por `memory_key`, SHALL preservar `created_at`, `scope`, `type` y `justification`, y SHALL
dejar el nodo anterior con `status='superseded'` y su `content` original. El índice FTS SHALL quedar
alineado por los triggers existentes; la búsqueda SHALL encontrar el `content` reparado.

**Rechazos.** El comando SHALL rechazar con código `1` y cero escrituras cuando el nodo declare un
bloque `refs:` malformado o repetido, o cuando la reparación dejaría el nodo con cero refs. El
rechazo por cero refs SHALL remitir a `memory export` y `memory import` como vías de recuperación.
NO SHALL reescribirse la gramática para volver a aceptar el bloque.

**Puerta de criticidad.** Si la `memory_key` pertenece a `.ancletorc` bajo `memory.criticalKeys`, el
dry-run SHALL reportar `critical: true` y SHALL salir con código `0`; `--apply` sin
`--force-critical` NO SHALL escribir y SHALL emitir, con `--json`,
`{ "error": "critical-key-gate", "criticalAffected": [<key>] }`, saliendo con código `2`; con
`--force-critical` SHALL aplicar. El engine NO SHALL leer `.ancletorc`: el conjunto SHALL
inyectarlo el subcomando.

**Idempotencia.** Tras una aplicación exitosa, una segunda corrida sobre el mismo estado SHALL
reportar `no-op` y salir con código `0` sin escribir.

**Working-context.** Tras una aplicación exitosa, el subcomando SHALL refrescar el bloque proactivo
del working-context por la vía existente, derivando la raíz del directorio de la base. Un error de
render SHALL propagarse como salida distinta de `0`; el mensaje SHALL afirmar que la reparación sí
se aplicó y que el bloque quedó desactualizado.

**Salida.** Con `--json`, la salida SHALL ser un objeto JSON parseable con `status` (`ok`, `no-op`,
`no-db` o `error`), `memory_key`, `dry_run`, `applied`, `critical`, `removed[]` y `remaining`. Cada
entrada de `removed[]` SHALL incluir `kind`, `ref` —el texto declarado tal cual— y `reason`;
`remaining` SHALL ser la cantidad de refs conservadas. El orden de `removed[]` SHALL ser el orden de
aparición en `content`, sin timestamps ni campos volátiles. Sin `--json`, SHALL imprimirse un
resumen legible. Si la base no existe, `status` SHALL ser `no-db` y la salida SHALL ser distinta de
`0`.

**Compatibilidad.** El change NO SHALL modificar el schema, los PRAGMAs persistentes ni
`ruleVersion`; un binario `0.36.0` SHALL leer el mismo estado persistido.

**Rollback.** Al no existir un comando `restore`, el procedimiento documentado SHALL ser: snapshot
previo con `memory snapshot --out`; para revertir, copiar el snapshot sobre `.ancleto/memory.db`,
borrar los sidecars `-wal`/`-shm` y verificar `PRAGMA quick_check='ok'`, la igualdad entre
`memory_fts_docsize` y `memory_nodes`, y el `content` restaurado. El nodo superseded SHALL conservar
su `content` original, recuperable por export/import.

#### Scenario: Ref inexistente removida con el resto del content intacto

- **WHEN** un nodo activo declara una ref `spec:`, `change:` o `path:` que resuelve `ok: false` con
  motivo `inexistente` junto con prosa y otras refs
- **THEN** el dry-run reporta esa ref en `removed[]` y no escribe
- **AND** `--apply` la remueve
- **AND** todo el `content` distinto de la línea removida permanece byte-idéntico, incluidas la
  prosa, la indentación y las demás refs

#### Scenario: Refs ambiguas o sin raíz no se remueven

- **WHEN** el nodo declara refs cuyo motivo es `ambiguo (<n> coincidencias)` o `sin raíz`
- **THEN** ninguna aparece en `removed[]`
- **AND** `--apply` las conserva en el `content`

#### Scenario: Refs no verificables nunca se remueven

- **WHEN** el nodo declara refs `commit:` o `workitem:`
- **THEN** no aparecen en `removed[]` en dry-run ni se eliminan con `--apply`
- **AND** `remaining` las cuenta entre las refs conservadas

#### Scenario: Dry-run estrictamente read-only

- **WHEN** se ejecuta `memory repair refs --memory-key <key>` sin `--apply`
- **THEN** los bytes de `.ancleto/memory.db`, los objetos de `sqlite_master` y el working-context
  son idénticos antes y después
- **AND** la salida reporta el plan de remoción

#### Scenario: Aplicación por supersede con FTS alineado

- **WHEN** se ejecuta `--apply` sobre un nodo con una ref `inexistente`
- **THEN** queda exactamente un nodo activo con esa `memory_key`
- **AND** `created_at`, `scope`, `type` y `justification` se preservan
- **AND** el nodo anterior queda `superseded` con su `content` original
- **AND** `memory_fts_docsize` coincide con la cantidad de filas de `memory_nodes`
- **AND** la búsqueda encuentra el `content` reparado

#### Scenario: Selección fail-closed por cardinalidad

- **WHEN** hay cero o más de un nodo activo con la `--memory-key`
- **THEN** el comando sale con código `1`
- **AND** no escribe la base ni el working-context

#### Scenario: Bloque malformado o repetido rechazado

- **WHEN** el nodo declara un bloque `refs:` malformado o más de un bloque `refs:`
- **THEN** el comando sale con código `1`
- **AND** no escribe la base ni el working-context

#### Scenario: Reparación que dejaría cero refs rechazada

- **WHEN** todas las refs del bloque son `inexistente`
- **THEN** el comando sale con código `1` sin escribir
- **AND** el mensaje remite a `memory export` y `memory import`

#### Scenario: Puerta de criticidad con exit 2

- **WHEN** la `memory_key` está en `.ancletorc` bajo `memory.criticalKeys`
- **THEN** el dry-run reporta `critical: true` y sale `0`
- **AND** `--apply` sin `--force-critical` sale `2`, no escribe y, con `--json`, emite
  `error: "critical-key-gate"`
- **AND** `--apply --force-critical` aplica la reparación

#### Scenario: Segunda corrida es no-op

- **WHEN** se repite el comando tras una aplicación exitosa
- **THEN** reporta `status: "no-op"`
- **AND** sale con código `0` sin escribir

#### Scenario: Rollback por snapshot verificado

- **WHEN** sobre una base temporal se toma un snapshot, se aplica la reparación y se restaura
  copiando el snapshot sobre la base
- **THEN** `PRAGMA quick_check` devuelve `ok`
- **AND** `memory_fts_docsize` coincide con `memory_nodes`
- **AND** el `content` es igual al previo a la reparación

#### Scenario: Sin cambios de schema y lectura por el binario previo

- **WHEN** se compara `sqlite_master` antes y después de `--apply`
- **THEN** no aparecen tablas, columnas ni índices nuevos
- **AND** un lector del estado persistido previo, como el binario `0.36.0`, sigue leyendo la base

#### Scenario: El plan no aplicable se rechaza antes de escribir

- **WHEN** un nodo activo declara una ref con motivo `inexistente` y otra con motivo
  `ambiguo (2 coincidencias)`
- **THEN** `memory repair refs --memory-key <k> --json` (dry-run) sale con código `1`,
  `status: "error"` y sin `removed`
- **AND** `--apply` sale con código `1` y no modifica bytes de la base ni el `working-context`
- **AND** el motivo nombra la ref no removible
- **AND** las refs `ambiguo` no se eliminan ni se reportan como removibles.
