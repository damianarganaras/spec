# Proposal: declaración advisory del gap de memoria esperable con `memory status`

- **Change:** `memory-gap-declaration`
- **Capability:** `memory-ops`
- **Tipo:** funcional (delta `## ADDED Requirements` + `## MODIFIED Requirements`)

## Intención

`.gitignore:4` ignora `.ancletorc` y `.gitignore:5` ignora `.ancleto/`. La base de memoria vive en
`<cwd>/.ancleto/memory.db`, así que un clone o un worktree nuevo nace sin `.ancletorc` y sin base.
Hoy el producto no distingue dos situaciones opuestas:

- Con la base **ausente**, `memory doctor`, `memory list` y `memory export` imprimen
  `ancleto: no hay memoria en este repo (…)`, pero `doctor` y `list` salen con código `0`, y
  `memory context` es silencioso (sólo emite `<ProjectTopology>`).
- Con la base **presente, con esquema y 0 nodos activos**, el producto reporta salud:
  `memory doctor` muestra `Integridad DB: quick_check ok` y
  `0 refs verificadas en 0 nodos activos` con `healthy:true`; `memory curate` reporta
  `0 ref(s) rota(s), 0 no verificable(s), 0 grupo(s) exacto(s)`; `memory list` responde
  `sin nodos para ese filtro`; `memory export` devuelve `[]`. Todo con exit `0`.

Nada distingue "repo con historia de memoria" de "repo sin memoria legítima". Este change agrega una
señal observable, read-only y advisory que declara el gap cuando hay evidencia versionada de que la
memoria era esperable.

**Anclaje en el estado existente.** La señal se apoya en el contrato vigente de portabilidad y
diagnóstico: `spec:memory-ops#Comando CLI ancleto memory export` (JSON portable),
`spec:memory-ops#Import de nodos desde JSON con upsert por memory_key` (restauración),
`spec:memory-ops#Snapshot consistente de la base de memoria` (copia consistente con historial) y
`spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas` (origen versionado
de las decisiones que hacen esperable la memoria).

## Alcance

### Incluido

- Subcomando nuevo `ancleto memory status [--json]` dentro de la familia `memory`, wrapper fino
  sobre un módulo puro en `src/core/memory/`.
- Cuatro estados: `ok`, `empty`, `no-db` y `uninitialized`.
- Predicado `expected` sobre `aspec/changes/archive/*/proposal.md`, con corte temprano y
  fail-closed ante error de lectura.
- `gap = expected && status !== 'ok'`.
- Salida humana de una línea de estado y, sólo con gap, una línea accionable que nombre
  `ancleto memory export`, `ancleto memory import` y `ancleto memory snapshot`.
- Salida `--json` con `status`, `expected`, `gap`, `dbPresent`, `activeNodes`, `evidence` y
  `recovery`.
- Exit `0` en todos los estados; único `1` para error inesperado de E/S o de apertura.
- Read-only estricto: pre-check de existencia y apertura con migraciones deshabilitadas y sólo
  lectura.
- Corrección acotada de `memory doctor` sobre una base sin esquema: hoy imprime el check
  `esquema no inicializado` y luego aborta con `ERR_SQLITE_ERROR` (`no such table: memory_nodes`) y
  stack trace, porque la construcción del engine read-only para la frescura del working-context
  ocurre fuera del `try` en `src/cli/index.js:2772`. El arreglo preserva los cinco checks, su orden
  y el criterio de `healthy`.
- Tests nuevos en `test/memory-status.test.js` y `test/memory-doctor-uninitialized.test.js`, pin de
  uso en `test/cli.test.js` y coupling en `test/affected-tests.json`.

### Excluido

- Cambios de schema, PRAGMAs persistentes o de la forma del export/snapshot.
- Crear `.ancleto/`, `memory.db` o el bloque de working-context desde `memory status`.
- Importar nodos automáticamente o reparar el gap.
- Convertir la señal en gate de archive, de promoción, de `memory doctor` o de `ancleto check`.
- Un sexto check en `memory doctor`, una extensión de `ancleto check` o un manifiesto de aceptación
  versionado.
- Una tool MCP nueva.
- `design.md`: el contrato es determinista y la arquitectura queda fijada en `## Decisiones`.

## Requirement nuevo

Se agrega en el delta de `memory-ops`:

### Requirement: Estado de memoria con `ancleto memory status`

El contrato completo, con sus veintitrés escenarios —incluidos los invariantes negativos—, vive en
`aspec/changes/memory-gap-declaration/specs/memory-ops/spec.md`.

## Requirement modificado

El delta reemplaza `### Requirement: `memory doctor` estrictamente read-only` con su cuerpo
completo y todos sus escenarios, y agrega dos piezas: la garantía de terminación determinista sobre
una base sin esquema y el escenario `Base sin esquema completa sin excepción no capturada`. Los
cinco checks, sus nombres y su orden no cambian.

## Supuestos

- `aspec/changes/archive/*/proposal.md` es la evidencia versionada disponible y local de que el
  proyecto declaró decisiones y promovió memoria; el flujo de archive ya la produce.
- Un repo recién inicializado puede tener `.ancletorc` ausente por `.gitignore:4`; por eso
  `.ancletorc` no sirve como evidencia.
- El gap es informativo: un humano decide si importa, restaura un snapshot o acepta un repo sin
  memoria.

## Riesgos

- El bullet `* ` se acepta por contrato aunque hoy no haya ningún archive con esa forma; se pinea
  en tests. La forma con el marcador envuelto en backticks no se acepta y tampoco tiene evidencia en
  el archive.
- Con corte temprano, `evidence` es `1` o `0`; el campo informa presencia, no cantidad de archives.
- La corrección de `doctor` toca la construcción del engine en el CLI, no el reporte; un cambio de
  posición puede alterar el advisory de frescura si se mueve más de lo necesario.

## Release

- MINOR `0.38.0` (superficie observable nueva). Sin cambios de schema ni de PRAGMAs persistentes.
- Rollback: revert del commit de release. No hay rollback de datos porque la señal no escribe.

## Trazabilidad

- `spec:memory-ops#Comando CLI ancleto memory export` — recuperación portable.
- `spec:memory-ops#Import de nodos desde JSON con upsert por memory_key` — restauración.
- `spec:memory-ops#Snapshot consistente de la base de memoria` — copia con historial.
- `spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas` — evidencia.
- `spec:memory-ops#Curaduría read-only con memory curate` — precedente de subcomando advisory
  read-only de la familia.
- `spec:memory-ops#memory doctor estrictamente read-only` — requirement modificado.
- `change:memory-gap-declaration`

## Decisiones

**memory_key:** memory-gap-expected-predicate
**Elección:** `expected` se deriva de proposals archivados que combinan un heading `## Decisiones` (por prefijo) con una línea `**memory_key:**`, con corte temprano y fail-closed ante error de lectura.
**Descartado:** `.ancletorc`, `aspec/specs/**` y `CHANGELOG.md` como evidencia de memoria esperable.
**Justificación:** `.gitignore:4` ignora `.ancletorc`, así que un clone nace sin él; `aspec/specs/**` existe desde el bootstrap y un repo recién inicializado lo tiene sin historia de memoria; `CHANGELOG.md` describe el producto, no el proyecto usuario. Los `## Decisiones` archivados son la única evidencia versionada y local de que el proyecto promovió memoria. El match tolera indentación y un bullet `- ` o `* ` antes del marcador porque las dos formas con evidencia conviven hoy en el archive —columna 0 en `2026-11-13-ch-04-memory-writer-serialization` y bullet `-` en `2026-11-16-memory-repair-refs`— y un match estricto produciría un falso negativo creciente con cada archive nuevo.
**Refs:**
- spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas
- change:memory-gap-declaration

**Estado:** aprobado

**memory_key:** memory-gap-status-surface
**Elección:** subcomando nuevo `ancleto memory status [--json]` dentro de la familia `memory`, como wrapper fino sobre un módulo puro.
**Descartado:** un sexto check en `memory doctor`, extender `ancleto check` y un manifiesto de aceptación versionado.
**Justificación:** `doctor` mide integridad y su `healthy` y su exit ya tienen significado especificado; sumarle "no hay memoria" cambiaría ese contrato. `ancleto check` verifica archivos instalados, no estado del proyecto. Un manifiesto exigiría un artefacto nuevo y mantenimiento extra. `memory curate` ya fija el precedente de un subcomando advisory read-only que reporta `no-db`.
**Refs:**
- spec:memory-ops#Curaduría read-only con memory curate
- change:memory-gap-declaration

**Estado:** aprobado

**memory_key:** memory-gap-no-second-gate
**Elección:** señal advisory pura: exit `0` en todos los estados y `gap` sólo informativo; no se invoca desde archive ni altera `doctor` o `check`.
**Descartado:** exit distinto de `0` como gate de archive o de promoción, y bloquear la sesión cuando `gap` es `true`.
**Justificación:** el archive ya tiene su secuencia y su gate de promoción; un segundo gate acopla dos superficies y convierte un clone recién creado en un fallo de flujo. El único `1` queda reservado a un error real de E/S o de apertura.
**Refs:**
- spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas
- change:memory-gap-declaration

**Estado:** aprobado

**memory_key:** memory-gap-readonly-engine
**Elección:** pre-check de existencia del path de la base y apertura con migraciones deshabilitadas y acceso de sólo lectura, sin crear directorio ni ejecutar WAL.
**Descartado:** abrir con el engine de escritura y confiar en no escribir, y crear la base para inspeccionarla.
**Justificación:** el `mkdirSync` de la apertura está condicionado a que no sea read-only y el modo de sólo lectura no ejecuta `journal_mode=WAL` (`src/core/memory/database.js:43-47`); crear la base cambiaría el estado que el comando mide. `memory doctor` y `memory curate` ya usan ese patrón.
**Refs:**
- spec:memory-ops#memory doctor estrictamente read-only
- spec:memory-ops#Curaduría read-only con memory curate
- change:memory-gap-declaration

**Estado:** aprobado
