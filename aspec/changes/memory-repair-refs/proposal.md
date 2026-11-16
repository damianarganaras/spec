# Proposal: Reparación explícita de refs no resueltas con `memory repair refs`

- **Change:** `memory-repair-refs`
- **Capability:** `memory-ops`
- **Tipo:** funcional (delta `## ADDED Requirements`)

## Intención

El diagnóstico de refs no resueltas ya detecta y reporta nodos activos con refs rotas, pero no
ofrece una vía de reparación: `memory doctor` es read-only por defecto y `memory curate` es
read-only por contrato. La única salida actual es reescribir el nodo completo a mano, lo que
arriesga la prosa, las demás refs y la historia del nodo.

Este change agrega una operación explícita, acotada y auditable para quitar de un nodo activo
sólo las refs cuyo target no existe, preservando el resto del `content` y la historia por
supersesión. Se apoya en spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos y en
spec:memory-engine#Validación fail-closed de refs en el camino único de escritura.

## Alcance

### Incluido

- Subcomando `ancleto memory repair refs --memory-key <key> [--apply] [--force-critical] [--json]`
  dentro de la familia `memory`, como wrapper fino sobre un método del engine.
- Dry-run por defecto y estrictamente read-only; `--apply` como única vía de escritura.
- Una sola operación: remover las refs del bloque `refs:` cuyo `ok` es `false` y cuyo motivo es
  `inexistente`.
- Escritura por supersesión con el mismo writer transaccional y las mismas primitivas de gramática
  y resolución del engine.
- Gate de criticidad con la misma forma que `memory merge` y `memory consolidate`.
- Salida JSON determinística y resumen legible; idempotencia por `no-op`.
- Refresco del working-context por la vía existente tras una aplicación exitosa.
- Tests nuevos en `test/repair-refs.test.js`, pin de uso en `test/cli.test.js` y coupling en
  `test/affected-tests.json`.

### Excluido y operaciones refutadas

No se implementan las siguientes operaciones, con su motivo y evidencia:

- **(a) Redirigir refs de una `memory_key` vieja a una nueva.** La gramática no tiene un `kind` que
  apunte a `memory_key`: `REF_KINDS` sólo admite `spec`, `change`, `path`, `commit` y `workitem`
  (`src/core/memory/engine.js:247`), y `parseRef` sólo produce esos cinco kinds
  (`src/core/memory/engine.js:278-310`). Redirigir exigiría una gramática y un resolvedor nuevos,
  fuera del contrato vigente.
- **(c) Reescribir un bloque `refs:` malformado.** El parser reporta la línea ofensora y aborta el
  bloque (`src/core/memory/engine.js:332-357`); la intención original de un bloque malformado no es
  recuperable. El camino de escritura además lo rechaza de forma fail-closed
  (`src/core/memory/engine.js:692-701`). Reescribirlo inventaría contenido.
- **(d) Reactivar un nodo `superseded`.** La reactivación no tiene consumidor y viola el índice
  parcial UNIQUE de una sola activa por `memory_key` (`src/core/memory/database.js:20-21`); el
  import ya decidió no reactivar nodos superseded.

También quedan fuera de alcance:

- `memory curate --fix`: `curate` es read-only por contrato y su pin prohíbe `--fix`
  (`aspec/specs/memory-ops/spec.md:1428-1431`).
- Extender `memory doctor --rebuild`: es el único camino de `doctor` que escribe
  (`src/core/memory/doctor.js:80`) y mezclar diagnóstico con reparación de contenido difumina esa
  frontera.
- Un comando nuevo `memory maintenance`, una tool MCP nueva o un comando `memory restore`.
- Cualquier cambio de schema, PRAGMAs persistentes o `ruleVersion`.

## Requirement nuevo

Se agrega un requirement en el delta de `memory-ops`:

### Requirement: Reparación explícita de refs no resueltas con `memory repair refs`

El contrato completo, con sus catorce escenarios, vive en
`aspec/changes/memory-repair-refs/specs/memory-ops/spec.md`.

## Decisión de arquitectura

La superficie elegida es un subcomando nuevo de la familia `memory` que delega la operación en el
engine. El CLI conserva la responsabilidad de parsear flags, resolver el conjunto crítico, mapear
exit codes y refrescar el working-context; el engine conserva la responsabilidad de seleccionar,
validar y escribir con su writer transaccional.

Se descartaron las alternativas por estas razones:

- `curate --fix` rompería el contrato read-only de `curate` y su pin de comportamiento.
- Extender `doctor --rebuild` mezclaría reconstrucción de índice con reparación de contenido y
  ampliaría el único camino de escritura de `doctor`.
- Un comando `memory maintenance` sería una superficie nueva sin consumidor y sin límite claro.
- Una tool MCP nueva expondría una escritura destructiva fuera del flujo de operador.
- Un comando `memory restore` ampliaría la superficie más allá del rollback documentado por
  snapshot, que ya cubre la reversión.

## Riesgos y mitigaciones

- **Remover una ref que vuelva a existir.** Sólo se remueven refs con `inexistente` demostrado; el
  dry-run muestra el plan y el nodo anterior queda `superseded` conservando su `content` original en
  la tabla. La recuperación soportada es el snapshot previo (`memory snapshot --out`) y la
  inspección con `memory list --all`; `memory export` no lo incluye porque sólo exporta nodos
  activos.
- **Deriva entre el plan y la escritura.** La selección y la escritura comparten la transacción
  `BEGIN IMMEDIATE`; la cardinalidad se revalida dentro de ella.
- **Bloque malformado interpretado como reparable.** Se rechaza antes de escribir y no se reescribe
  gramática.
- **Reparación que vacía el bloque.** Se rechaza con código `1` y se remite a `memory export` /
  `memory import`.
- **Clave crítica.** El gate reusado bloquea `--apply` con código `2` y exige `--force-critical`.
- **Fallo del refresh post-escritura.** La reparación ya está commiteada: se sale distinto de `0`
  afirmando que se aplicó y que el bloque quedó desactualizado, con la vía de regeneración.
- **Downgrade.** Un binario `0.36.0` lee el mismo estado; no hay cambio de formato persistido.

## Plan de validación

Sólo comandos declarados en `PRODUCT.md` → `## Project Commands`:

- `npm run lint` (`eslint src/ test/ scripts/`).
- `npm test` (`node --test "test/*.test.js"`).
- Para el tramo acotado, el runner declarado con rutas explícitas:
  `node --test "test/repair-refs.test.js" "test/cli.test.js"`.
- Format check: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (JavaScript ESM sin `tsconfig.json`).

Prueba funcional sobre una base temporal, nunca sobre `.ancleto/memory.db` real: dry-run no escribe;
`--apply` remueve sólo `inexistente`; `ambiguo`, `commit:` y `workitem:` se conservan; una raíz no
derivable sale `1` sin escribir; segunda corrida es `no-op`; clave crítica sin `--force-critical`
sale `2`; snapshot + restore devuelve `quick_check='ok'`, `memory_fts_docsize == memory_nodes` y el
`content` previo.

## Rutas autorizadas

- `src/core/memory/engine.js`
- `src/cli/index.js`
- `test/repair-refs.test.js`
- `test/cli.test.js`
- `test/affected-tests.json`
- `aspec/changes/memory-repair-refs/**`
- `aspec/specs/memory-ops/spec.md` (sólo vía merge al archivar)
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `aspec/backlog.md`
- `docs/technical-discovery/**`

## Rollback

No se agrega un comando `restore`. El procedimiento documentado es:

1. Tomar un snapshot previo con `memory snapshot --out <archivo.db>`.
2. Para revertir, copiar el snapshot sobre `.ancleto/memory.db` y borrar los sidecars `-wal`/`-shm`.
3. Verificar `PRAGMA quick_check='ok'`, la igualdad entre `memory_fts_docsize` y `memory_nodes`, y
   el `content` restaurado.

Además, el nodo anterior queda `superseded` conservando su `content` original en la tabla; la
recuperación soportada es el snapshot previo (`memory snapshot --out`) y la inspección con
`memory list --all`; `memory export` no lo incluye porque sólo exporta nodos activos.

## Decisiones

- **memory_key:** memory-repair-refs-surface
  **Elección:** subcomando nuevo `ancleto memory repair refs` en la familia `memory`, wrapper fino sobre un método del engine y sin tool MCP.
  **Descartado:** `curate --fix`, extender `doctor --rebuild`, `memory maintenance`, una tool MCP nueva y `memory restore`.
  **Justificación:** `curate` es read-only por contrato y su pin prohíbe `--fix` (`aspec/specs/memory-ops/spec.md:1428-1431`); `doctor --rebuild` es el único camino de escritura de `doctor` (`src/core/memory/doctor.js:80`); una superficie nueva acotada evita mezclar diagnóstico con reparación.
**Refs:**
- spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-scope
  **Elección:** la operación remueve exactamente las refs con `ok: false` y motivo `inexistente`; nunca toca `commit:`, `workitem:` ni `ambiguo (<n> coincidencias)`; si la raíz del proyecto no se puede derivar, sale con código `1` sin escribir.
  **Descartado:** remover toda ref no resuelta y redirigir refs entre `memory_key`.
  **Justificación:** las refs no verificables no tienen resolvedor local (`src/core/memory/engine.js:660-666`), y `ambiguo` no es ausencia demostrada; la gramática no tiene kind hacia `memory_key` (`src/core/memory/engine.js:247,278-310`).
**Refs:**
- spec:memory-engine#Refs normalizadas materializadas en el contenido del nodo
- spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-refuted-operations
  **Elección:** se refutan redirigir refs, reescribir un bloque `refs:` malformado y reactivar un nodo `superseded`.
  **Descartado:** implementar cualquiera de las tres como parte de la reparación.
  **Justificación:** la gramática no tiene kind hacia `memory_key` (`src/core/memory/engine.js:247,278-310`); el parser aborta el bloque malformado sin recuperar la intención (`src/core/memory/engine.js:332-357`) y el validador lo rechaza (`src/core/memory/engine.js:692-701`); reactivar viola el índice parcial UNIQUE (`src/core/memory/database.js:20-21`) y no tiene consumidor.
**Refs:**
- spec:memory-engine#Validación fail-closed de refs en el camino único de escritura
- spec:memory-engine#Refs normalizadas materializadas en el contenido del nodo
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-dry-run
  **Elección:** dry-run por defecto y estrictamente read-only, con el engine abierto con `readonly: true` y `migrate: false`; `--apply` es la única vía de escritura.
  **Descartado:** escribir por defecto o abrir el engine de escritura durante el dry-run.
  **Justificación:** un plan no debe mutar la base ni el working-context; `curate` ya usa ese patrón (`src/cli/index.js:3217`) y el contrato read-only del diagnóstico lo exige.
**Refs:**
- spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-write-path
  **Elección:** la escritura la hace un método del engine que supersede el nodo con `BEGIN IMMEDIATE` y las mismas primitivas de gramática y resolución; sin `UPDATE` crudo de `content` y sin `import`.
  **Descartado:** `UPDATE` directo del `content` o reimportar el nodo reparado.
  **Justificación:** el `UPDATE` crudo esquiva la gramática y la resolución del camino único; el import tiene semántica last-writer-wins y no reactiva superseded; la supersesión preserva la unicidad activa, los triggers FTS y la historia.
**Refs:**
- spec:memory-engine#Validación fail-closed de refs en el camino único de escritura
- spec:memory-engine#Serialización de escritores concurrentes sobre la base de memoria
- spec:memory-ops#Merge de nodos por supersesión
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-critical-gate
  **Elección:** reusar la forma del gate de `merge`/`consolidate`: dry-run reporta `critical: true` y sale `0`; `--apply` sin `--force-critical` sale `2` sin escribir; con el flag aplica.
  **Descartado:** bloquear en dry-run, usar exit `1` para el rechazo o aplicar con aviso.
  **Justificación:** el exit `2` ya está reservado al rechazo fail-closed sin escritura (`src/cli/index.js:3025-3033`), y el dry-run nunca bloquea; reusar la forma mantiene consistente el contrato de operador.
**Refs:**
- spec:memory-ops#Merge de nodos por supersesión
- spec:memory-engine#Conjunto crítico estable del working-context
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-rollback
  **Elección:** rollback por snapshot previo más copia manual sobre `.ancleto/memory.db`, borrado de `-wal`/`-shm` y verificación de `quick_check`, `docsize == nodes` y `content`; sin comando `restore`.
  **Descartado:** agregar un comando `memory restore` o un rollback transaccional persistente.
  **Justificación:** el snapshot ya es consistente por contrato y el nodo superseded conserva el `content` original; un comando nuevo ampliaría la superficie sin consumidor.
**Refs:**
- spec:memory-ops#Snapshot consistente de la base de memoria
- spec:memory-ops#Garbage collection de nodos superseded
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-zero-refs
  **Elección:** si la reparación dejaría el nodo con cero refs, se rechaza con código `1` y un mensaje que remite a `memory export` y `memory import`.
  **Descartado:** dejar un bloque `refs:` vacío o borrar el nodo.
  **Justificación:** el bloque vacío es inválido en el camino fail-closed (`src/core/memory/engine.js:700`) y borrar el nodo perdería historia; export/import permiten reconstruir con intención.
**Refs:**
- spec:memory-engine#Validación fail-closed de refs en el camino único de escritura
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-tests-scope
  **Elección:** tests nuevos en `test/repair-refs.test.js`, pin de `MEMORY_USAGE` en `test/cli.test.js` y coupling para la suite que spawnea la CLI en `test/affected-tests.json`.
  **Descartado:** meter los casos en `test/memory-engine.test.js` o no declarar el coupling.
  **Justificación:** el test nuevo spawnea la CLI y no tiene arista de import; el manifiesto ya declara couplings para suites que spawnean el CLI sin importarlo (`test/affected-tests.json:5-20`).
**Refs:**
- change:memory-repair-refs

**Estado:** aprobado

- **memory_key:** memory-repair-refs-release
  **Elección:** release MINOR, de `0.36.0` a `0.37.0`.
  **Descartado:** PATCH o MAJOR.
  **Justificación:** hay superficie y exit codes observables nuevos, pero no hay cambio de formato persistido: un binario `0.36.0` lee el mismo estado y no hay migración ni `ruleVersion` nuevo.
**Refs:**
- change:memory-repair-refs
- spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos

**Estado:** aprobado

- **memory_key:** memory-repair-refs-plan-parity
  **Elección:** el dry-run valida el `content` candidato con la misma validación que usa la escritura y rechaza el plan que `--apply` rechazaría.
  **Descartado:** reportar como aplicable un plan que `--apply` rechaza; remover también las refs ambiguas.
  **Justificación:** el dry-run debe predecir el `--apply` y fallar cerrado; remover una ref `ambiguo (<n> coincidencias)` destruye provenance que un humano puede desambiguar.
**Refs:**
- spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos
- change:memory-repair-refs

**Estado:** aprobado
