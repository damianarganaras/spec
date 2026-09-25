# Proposal: Desempate determinista en searchMemory

## Problema

`searchMemory` (`src/core/memory/engine.js:122-154`) ordena con un `ORDER BY rank` explícito
(`engine.js:133-134`), donde en FTS5 `rank` es `bm25()`. No existe desempate secundario, y el
resultado se trunca con `LIMIT` (default 10, clamp `[1,50]`, `engine.js:128`).

Con un corpus menor o igual al `limit`, el orden es determinista en la práctica (todos los
matches entran, el truncamiento no discrimina). Cuando `matches > limit` y hay empates de score,
el subconjunto que sobrevive al `LIMIT` **no está garantizado**: es no determinismo latente que
se activa al crecer el corpus. Queda registrado como Gap 2 en la decisión de memoria
`searchmemory-determinismo-estado-fijo`.

## Cambio propuesto

Añadir un desempate por `rowid` en **ambas** passes de recuperación (pass 1 AND precisa y
pass 2 OR con prefijos), usando el alias real de la tabla: `ORDER BY rank, n.rowid`. El orden
pasa a ser total y el truncamiento determinista para un estado de base de datos dado.

Es un endurecimiento: **no hay cambio de comportamiento observable hoy**. Solo se vuelve
unívoco el orden relativo entre coincidencias con el mismo score.

## Alcance

In scope:

- El `ORDER BY` de las dos queries de `searchMemory` en `src/core/memory/engine.js` (pass 1 y
  pass 2 comparten la función `run`; el desempate aplica a ambas).

Out of scope (no-goals):

- **No** se toca el fallback OR ni el recall de prefijos cortos (Gap 1): queda fuera de este
  change.
- **No** se cambia `bm25`, el `LIMIT`, el clamp de `limit`, ni el filtro `n.status = 'active'`.
- **No** se documentan los límites del fallback OR en este change (va aparte).
- **No** se modifica el conjunto de nodos recuperados: solo el orden relativo ante empates.

## Riesgos

- Cambio sutil de orden relativo entre empates de score: mitigación — no altera qué nodos se
  recuperan cuando `matches <= limit`, y solo torna determinista el subconjunto truncado.
- Dependencia del `rowid`: mitigación — el `rowid` es único y estable para un estado de BD fijo;
  no se persiste ni se expone en la salida pública (`publicNode`).

## Nota sobre el contexto de origen

Contexto provisto con rutas citadas del repositorio; el comportamiento real se confirmó contra
el código en `src/core/memory/engine.js` antes de escribir esta spec. No hay Work Item asociado
(Azure DevOps deshabilitado en `.ancletorc`).
