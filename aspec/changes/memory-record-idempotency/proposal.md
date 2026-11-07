# Proposal: Idempotencia de reescritura idéntica en `recordNode`

> Release 0.23.0. Change funcional con delta en `memory-engine`.

## Problema

`recordNode` inserta hoy un nodo nuevo con `randomUUID()` y supersede el nodo activo previo de la
misma `memory_key` en toda escritura, incluso cuando el payload es idéntico al del nodo activo. Una
operación que no cambió nada deja un nodo nuevo, una supersesión falsa y una revisión espuria en el
historial. El comportamiento está reproducido.

## Cambio propuesto

Tratar una reescritura idéntica de la misma `memory_key` como no-op dentro de la transacción
existente: sin insert, sin update, sin supersede, con `superseded: 0` y devolviendo los valores
persistidos del nodo activo. Cualquier diferencia conserva el comportamiento actual. El contrato
exacto de identidad, validación y resultado vive en el delta de `memory-engine`; este proposal no lo
re-enuncia.

## Alcance

In scope:

- `src/core/memory/engine.js` — rama de idempotencia en `recordNode`.
- `test/memory-engine.test.js` — cobertura de los escenarios del delta.

Out of scope:

- `importNodes` conserva su semántica last-writer-wins por `createdAt`.
- Los caminos de supersesión de `merge` y `consolidate`.
- Cambios de schema, migraciones o dependencias nuevas.
- Campos nuevos en el objeto devuelto por `recordNode`.

## Riesgos

- Una reescritura idéntica de `rule` + `project` deja de disparar el refresh del working-context por
  supersesión; sigue disparándolo por contribución directa. Es intencional y queda enunciado en el
  delta.
- La rama depende de que el lookup del nodo activo traiga `content`, `justification` y `scope`. Si no
  los trae, la comparación nunca matchea y el comportamiento actual persiste sin corrupción.

## Decisión de arquitectura

Ninguna. La rama vive dentro de la transacción existente de `recordNode`; no crea capas, interfaces
ni configuración. No se requiere `design.md`.

## Fuera de alcance

- **A1 — aviso por `.opencode/*` en `installedPaths`**: descartado; es falso positivo en toda
  instalación sana de `opencode` y contradice la decisión `import-installed-paths-union-not-copy`.
- **B — T25 `formatVersion`**: descartado; los exports viejos ya importan sin pérdida, las claves
  extra se ignoran y un envelope rompería el import.
- **D-g — fences dentro de bloques `LOCKED` (MEM-05g)**: descartado; inalcanzable con los templates
  reales (0 fences en cada región `LOCKED` de `templates/`, `profiles/` y archivos raíz).
- **E — CH-09e/h**: descartado; sin consumidor y el índice siempre está presente.
- **F — #6 ordering**: descartado; ya está corregido y "archive→merge" se contradice.
- **G — CH-10/T30**: descartado; no es testeable offline y depende del passthrough de `opencode`.
- **H — multi-worktree y curación de la DB**: diferido por decisiones previas.

## Decisiones

- **memory_key:** recordnode-identical-rewrite-is-noop
  **Elección:** Tratar una reescritura idéntica de la misma `memory_key` como no-op dentro de la
  transacción existente: sin insert, sin update, sin supersede y con `superseded: 0`.
  **Descartado:** Mantener el insert + supersede actual en toda escritura; rechazar la escritura
  idéntica con error.
  **Justificación:** El estado persistido ya es el que el caller pidió; insertar y superseder crea
  historial falso y crecimiento innecesario. El no-op preserva la transacción limpia y el contrato
  de retorno.
  **Estado:** aprobado

refs:
  - path:src/core/memory/engine.js
  - spec:memory-engine#Idempotencia de reescritura idéntica en recordNode
  - change:memory-record-idempotency

- **memory_key:** recordnode-identity-excludes-createdat-source-confidence
  **Elección:** Definir la identidad con la tupla (`memory_key`, `type`, `scope`, `content`,
  `justification`) comparada por igualdad exacta de string; excluir `createdAt`, `source` y
  `confidence`.
  **Descartado:** Incluir `createdAt`; incluir `source` o `confidence` en la identidad.
  **Justificación:** `createdAt` cambia en cada llamada y volvería inalcanzable el no-op; `source` y
  `confidence` son gestionados por el runtime y no describen el contenido de la escritura.
  **Estado:** aprobado

refs:
  - path:src/core/memory/engine.js
  - spec:memory-engine#Idempotencia de reescritura idéntica en recordNode
  - change:memory-record-idempotency

- **memory_key:** recordnode-identical-noop-suppresses-supersede-only
  **Elección:** Aceptar que el refresh del working-context ya no se dispare por la condición de
  supersesión en una reescritura idéntica; la condición de contribución directa sigue vigente y una
  `decision` idéntica no refresca.
  **Descartado:** Forzar un refresh adicional cuando la escritura es idéntica.
  **Justificación:** No hubo cambio de estado, así que regenerar el archivo derivado no aporta nada;
  el caso `rule` + `project` conserva su refresh por contribución directa.
  **Estado:** aprobado

refs:
  - path:src/core/memory/working-context.js
  - path:src/core/memory/engine.js
  - spec:memory-engine#Idempotencia de reescritura idéntica en recordNode
  - change:memory-record-idempotency
