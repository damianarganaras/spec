# Proposal: Consolidación determinística y reversible de la memoria

## Problema

La familia `ancleto memory` ya permite exportar, importar, diagnosticar, mergear por
`memory_key` y recolectar nodos superseded, pero no tiene una operación que detecte y
resuelva duplicados **exactos** de contenido entre nodos activos. La medición sobre
`.ancleto/memory.db` da 99 nodos activos (97 con refs, 255 refs verificadas, 0 rotas),
**0 duplicados exactos**, **0 near-dups con Jaccard ≥ 0,60** y un solo par entre 0,45 y
0,60. El problema histórico de ese corpus no era duplicación sino provenance (ya curada) y
ranking (ya resuelto en 0.18.4).

Que hoy no haya duplicados no elimina la necesidad de una operación de mantenimiento
determinística: la memoria crece por promoción de decisiones al archivar y por escrituras
de agentes, y el único mecanismo actual de consolidación (`memory merge`) exige que un
humano nombre a mano el target y cada source. Este change agrega la operación que agrupa,
elige canónico y supersede sin intervención, con dry-run por defecto y sin heurísticas
semánticas automáticas.

## Cambio propuesto

Agregar `ancleto memory consolidate`, un subcomando de la familia `memory` existente, sobre
un método nuevo `consolidate({ dryRun = true } = {})` del engine de memoria:

- **Dry-run por defecto**: no escribe la base ni el filesystem. Reporta los grupos de
  duplicados exactos entre nodos activos y, de forma informativa, los pares
  near-duplicate con Jaccard ≥ 0,60 del mismo `type` y `scope`.
- **Duplicado exacto**: mismo `type` y mismo `content` normalizado sin el bloque `refs:`
  (trim, colapsar whitespace, minúsculas, sin diacríticos); la prosa vacía (sólo `refs:`) no
  agrupa.
- **Canónico determinístico**: más refs declaradas > `created_at` más nuevo > scope más
  amplio (`project` > `feature` > `task`) > `content` más largo > `rule` antes que
  `decision` > `memory_key` lexicográfico.
- **`--apply`**: sólo supersede los no canónicos de cada grupo exacto, con
  `superseded_by` apuntando al `id` del canónico. Nunca borra filas ni crea nodos.
- **`--json`**: salida estructurada y determinística.
- **Read-only**: el engine read-only sólo acepta `dryRun: true`, con el mismo patrón que
  `merge`; el dry-run del CLI usa esa conexión.

## Alcance

**In scope**

- `consolidate` en `src/core/memory/engine.js`: normalización, agrupación exacta, selección
  de canónico, reporte near-duplicate y aplicación transaccional por supersesión.
- Subcomando `memory consolidate` en `src/cli/index.js`, con `--dry-run` (default),
  `--apply` y `--json`, incluido en el usage de la familia.
- Restricción read-only en `buildReadonlyEngine`.
- Refresco del bloque de contexto derivado tras `--apply`, reutilizando el render
  existente (`refreshWorkingContextOnWrite` / `resolveMemoryProjectRoot`), igual que
  `import`, `gc` y `merge`.
- Tests en `test/memory-engine.test.js` y `test/cli.test.js`.

**Out of scope / no-goals**

- Guard de escritura por similitud (Jaccard en `recordNode`): **no entra**; queda diferido
  hasta tener datos reales que lo justifiquen.
- Merge semántico automático de near-duplicates: **no entra**; sólo se reportan.
- Borrado físico de nodos: **no entra**; sólo `superseded`.
- Wiring automático al archivar (`skill ancleto-archive` / `agents/memory-keeper.md`):
  **no entra**; se declara follow-up de una línea.
- Tabla, columna, migración o índice nuevo. Ninguna tool MCP nueva.
- Cambios en `doctor.js`, `inspectRefs`, `resolveNodeRefs`, `buildWorkingContext`,
  `.opencode/**`, `agents/**`, `skills/**`.

## Paths autorizados del change

- `src/core/memory/engine.js`
- `src/cli/index.js`
- `test/memory-engine.test.js`
- `test/cli.test.js`
- `aspec/changes/archive/2026-11-02-memory-consolidacion-autonoma/**` (este directorio)

## Riesgos

- **El agrupamiento no cruza `type`, pero sí puede cruzar `scope`.** Un `decision` y un `rule`
  con texto idéntico cumplen funciones distintas y no se agrupan. Dentro del mismo `type`, el
  `scope` puede diferir; el orden de canónico prefiere el scope más amplio y el dry-run por
  defecto acota el caso.
- **La normalización puede unir nodos que difieren sólo en mayúsculas, espacios o
  diacríticos.** Es la definición acordada de duplicado exacto; el reporte previo permite
  revisarlo antes de aplicar.
- **El criterio "`content` más largo" favorece nodos con más texto de refs.** La cantidad
  de refs ya decide antes, y el criterio final por `memory_key` garantiza un único
  canónico; el orden queda documentado y testeado.
- **Fallo del refresco del bloque tras `--apply`.** La base ya quedó commiteada; se
  reportará "aplicado, bloque desactualizado" con el comando de regeneración, igual que
  `memory merge`, sin revertir la supersesión.
- **Reversión.** No hay comando de "unsupersede": revertir exige un snapshot previo con
  `ancleto memory snapshot`. La operación conserva los nodos con su `id` y `superseded_by`,
  por lo que el historial es reconstruible.
- **La medición actual da 0 grupos exactos**, por lo que `--apply` es un no-op sobre esta
  base. El valor del change es operativo a futuro y el reporte de near-duplicates.
- **`gcSuperseded` purga por el `created_at` original**, no por la fecha de supersesión; por
  eso consolidar un duplicado antiguo lo deja elegible para borrado físico en el siguiente
  `memory gc` (que es manual y con `--days`). El snapshot previo es la red de recuperación.
- **Decisión previa `memory-consolidacion-guard-futuro`.** No se revierte: este change no
  agrega el guard en `recordNode` ni consolida automáticamente; la operación es opt-in y
  dry-run por defecto.
- Los cuatro bloques de `## Decisiones` quedan en `Estado: aprobado`, por lo que el gate de
  archive los promoverá a memoria persistente.

## Supuestos

- La cantidad de refs de un nodo es la cantidad de ítems declarados en su bloque `refs:`
  de `content`, incluidas las refs no verificables (`commit:`, `workitem:`) y las rotas.
- El umbral de near-duplicate es fijo en 0,60; no se configura por flag ni por archivo.
- El engine read-only puede materializar `-shm` o un `-wal` de 0 bytes al abrir, como ya
  ocurre con `doctor` y `memory merge --dry-run`; eso no cuenta como escritura.
- La operación no modifica `memory_key` ni `content` del canónico, así que el índice único
  parcial y el esquema actual siguen siendo suficientes.

## Decisiones

- **memory_key:** `memory-consolidate-exactos-deterministico`
  **Elección:** agrupar por `content` normalizado sin `refs:` y elegir canónico con una
  cadena fija de criterios (refs > `created_at` > scope > longitud > tipo > `memory_key`).
  **Descartado:** agrupar por similitud semántica o Jaccard y aplicar automáticamente.
  **Justificación:** la medición da 0 duplicados exactos y 0 near-dups ≥ 0,60; una
  heurística semántica no tiene evidencia que la calibre y podría superseder contenido
  distinto. Los criterios fijos hacen el resultado reproducible y auditable.
  **Refs:** `change:memory-consolidacion-autonoma`; `path:src/core/memory/engine.js`;
  `spec:memory-ops#Merge de nodos por supersesión`;
  `path:aspec/changes/archive/2026-11-02-memory-consolidacion-autonoma/specs/memory-ops/spec.md`
  **Estado:** aprobado

- **memory_key:** `memory-consolidate-dry-run-default`
  **Elección:** `--dry-run` es el default; `--apply` es obligatorio para escribir y el
  dry-run usa la conexión read-only.
  **Descartado:** aplicar por defecto con confirmación interactiva, o un flag `--force`.
  **Justificación:** es una operación de mantenimiento que cambia el estado activo de la
  memoria; el default sin escritura elimina el riesgo de una corrida accidental y replica
  el patrón ya validado de `memory merge --dry-run`.
  **Refs:** `change:memory-consolidacion-autonoma`; `path:src/cli/index.js`;
  `spec:memory-ops#Merge de nodos por supersesión`
  **Estado:** aprobado

- **memory_key:** `memory-consolidate-reversible-supersede`
  **Elección:** `--apply` sólo marca `status='superseded'` y `superseded_by=<id del
  canónico>`; la reversión se hace restaurando un snapshot previo.
  **Descartado:** borrado físico de duplicados; agregar un comando de reactivación o una
  columna `superseded_at`.
  **Justificación:** conserva el historial completo y no requiere schema nuevo. `memory
  snapshot` ya existe y captura `superseded_by`; un comando de reactivación chocaría con la
  política vigente de no reactivar nodos superseded en `import`.
  **Refs:** `change:memory-consolidacion-autonoma`; `path:src/core/memory/engine.js`;
  `spec:memory-ops#Snapshot consistente de la base de memoria`
  **Estado:** aprobado

- **memory_key:** `memory-consolidate-semantico-diferido`
  **Elección:** los near-duplicates se reportan pero nunca se aplican; el guard de Jaccard
  en `recordNode` y el merge semántico quedan fuera.
  **Descartado:** auto-merge de near-dups y guard preventivo de escritura por similitud en
  este change.
  **Justificación:** el corpus medido no tiene near-dups ≥ 0,60 accionables; un guard sin
  calibración bloquearía escrituras legítimas y un auto-merge perdería matices que sólo un
  humano puede decidir. El reporte genera los datos para calibrar más adelante.
  **Refs:** `change:memory-consolidacion-autonoma`;
  `path:aspec/changes/archive/2026-11-02-memory-consolidacion-autonoma/specs/memory-ops/spec.md`
  **Estado:** aprobado
