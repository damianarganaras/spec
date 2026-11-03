# Proposal: MEM-05 — Recall task-aware

## Problem

Estado previo a este change; las líneas citadas corresponden al código anterior.

El recall no distinguía una memoria crítica de una coincidencia casual. `searchMemory` ordenaba por
`rank, n.rowid` (código previo, hoy reemplazado por `compareRecall` en
`src/core/memory/engine.js:352-364`): el `rowid` es físico, cambia al reconstruir o importar la DB y
no expresa scope ni provenance. Tampoco existía un orden por especificidad de scope ni por ref
declarada, y no había forma de pedir que una `memory_key` concreta sobreviva al recorte.

Además, `searchMemory` devolvía el `content` completo de hasta 10 nodos por defecto (`publicNode`,
`src/core/memory/engine.js:68-77`), aunque el consumidor sólo necesite elegir entre candidatos. Y
`buildWorkingContext` (`src/core/memory/engine.js:719`) recorta reglas por presupuesto sin poder
distinguir una regla prescindible de un invariante: si una regla crítica no entra, sólo queda
nombrada en el `<ContextOverflowWarning>` (`src/core/memory/engine.js:782-789`). Había 18 reglas
omitidas y no existía señal de cuáles eran irrenunciables.

Finalmente, los dos presupuestos se confunden: el bloque `working-context` (2.000 tokens × 4 =
8.000 chars, medido sobre el bloque completo con wrapper y aviso, `engine.js:9-10,758-790`) y el
campo destilado por delegación (≤5 reglas / ≤1.500 B,
`aspec/specs/prompt-contracts/spec.md:727-735`) son superficies distintas, pero nada en el
contrato impide tratarlas como convertibles. T28 exige probarlas por separado y no falsar un
"21/21".

La medición de consolidación (dry-run read-only, umbral 0,60) da `exactGroups: []` y
`nearDuplicates: []`: **0 candidatos**. No hay material que consolidar ni razón para agregar
reglas o subir topes.

## Proposed change

1. **Orden total de recall en `searchMemory`**, independiente del `rowid`:
   requerido → match de ref (`spec:`/`change:`/`path:` declarada, parse-only) → scope específico
   (`SCOPE_RANK`) → bm25 ascendente → `memory_key` ascendente. El subconjunto que sobrevive al
   `limit` es el prefijo de ese orden, no el resultado de un `LIMIT` previo.
2. **Previsualización por defecto y expansión opt-in**: `searchMemory` devuelve previews como
   prefijo literal de ≤240 caracteres con marca de truncamiento y `limit` default 5; `expand: true`
   con el mismo `limit` explícito restaura el payload heredado exacto (seis campos, `content`
   completo) y `keys` expande sólo las claves pedidas. Una clave pedida ausente de la página falla
   nombrando la clave, aunque exista en la DB.
3. **`required` como entrada de llamada**, no columna ni tabla: lista de `memory_key` que se
   promueve al frente del orden. En `buildWorkingContext`, una requerida que no existe, no está
   activa o no entra en el presupuesto produce error diagnóstico con `memory_key` y la ruta de sus
   refs resueltas con `resolveNodeRefs`; nunca se trunca ni se degrada a una omisión silenciosa.
4. **Dos presupuestos separados y no componibles** en `prompt-contracts`: el tope ≤5/1.500 B es
   del campo destilado por delegación, no del bloque `working-context`; el aviso de overflow no es
   remedio del tope del campo ni viceversa. Ningún tope numérico cambia.
5. **Sin consolidación**: no se agregan reglas, no se suben topes y no se des-difieren goldens.

## Scope

In scope:

- `src/core/memory/engine.js`: orden total de `searchMemory`, preview/`expand`/`keys`, `required`
  en `searchMemory` y en `buildWorkingContext`, error diagnóstico con ruta.
- `src/core/memory/tools.js`: schema de `searchMemory` con `expand`, `keys` y `required`, y
  descripción de `limit` default 5; `additionalProperties: false` se conserva.
- Skills que consumen `searchMemory` —`skills/ancleto-recall/SKILL.md`,
  `skills/ancleto-new/SKILL.md`, `skills/ancleto-propose/SKILL.md`, `skills/ancleto-ff/SKILL.md`,
  `skills/ancleto-explore/SKILL.md`, `skills/ancleto-onboard/SKILL.md`— y sus mirrors
  `.opencode/skills/**` (regenerados sólo con `ancleto upgrade`): alinear el contrato de recall con
  el default 5 y el preview por defecto. La razón es que todos consumen `searchMemory` y el default
  pasó a devolver preview sin `content`.
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`.
- `test/memory-engine.test.js`, `test/memory-fixtures.test.js` y `test/working-context.test.js`
  (sólo donde un assert depende de la forma o del recorte de `searchMemory`).
- Delta de `memory-engine` y delta de `prompt-contracts`.

Out of scope (no-goals explícitos):

- `inspectRefs` sin captura de I/O y conteo de `commit:`/`workitem:` con rotas (§5.2, deuda
  declarada de MEM-04); cablear `memory consolidate` al archive; DB canónica por worktree
  (CH-08/MEM-06, §6); política de seed `STALE` (#18, §6). Quedan como deuda declarada, no como
  partes de este change.
- `memory gc` que purga `superseded` por `created_at` original: **no entra**. Este change no
  supersede ningún nodo (0 candidatos de consolidación, ninguna regla nueva).
- Cambios a `src/cli/index.js` o a `src/core/memory/working-context.js`: no hay superficie CLI
  para `required` en este corte.
- Cambios a `agents/**` o `commands/**`.
- Des-diferir M02/M03/M08/M09/M10 o cambiar la allowlist golden: no se des-difieren, sus
  blockers pertenecen a otros workstreams.
- Subir `MAX_TOKENS`, `CHARS_PER_TOKEN`, `MAX_OMITTED_KEYS` o el tope ≤5/1.500 B.
- Deriva **pre-existente** detectada en review, no introducida por este change y fuera de su
  alcance: el piso estructural de `buildWorkingContext` cuenta sólo el wrapper (≈163 chars), así
  que entre ese piso y wrapper+aviso mínimo (≈362) el bloque puede incluir reglas cuando el
  contrato no lo permite; y cuando `15%·maxChars` es menor que el largo mínimo del aviso (~199),
  `formatOverflowWarning` (`src/core/memory/engine.js:370-382`) devuelve `''` y una omisión no
  requerida queda sin marca en el bloque (sólo `console.warn`). El default de 2.000 tokens no lo
  dispara. Disparador de reapertura: cualquier llamada con `maxTokens` chico o un cambio del
  formato del aviso.

Paths autorizados del change:

- `src/core/memory/engine.js`
- `src/core/memory/tools.js`
- `test/memory-engine.test.js`
- `test/memory-fixtures.test.js`
- `test/working-context.test.js` (sólo si un assert depende del recorte)
- `skills/ancleto-recall/SKILL.md`
- `skills/ancleto-new/SKILL.md`
- `skills/ancleto-propose/SKILL.md`
- `skills/ancleto-ff/SKILL.md`
- `skills/ancleto-explore/SKILL.md`
- `skills/ancleto-onboard/SKILL.md`
- `.opencode/skills/**` (mirrors regenerados sólo con `ancleto upgrade`)
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`
- `aspec/changes/mem-05-recall-task-aware/**`

## Assumptions

- `required` nombra `rule` activas del scope inyectado para `buildWorkingContext`; para
  `searchMemory` debe satisfacer el filtro `type` y `status = active`.
- El anclaje declarado se decide parseando el bloque `refs:` con `declaresAnchor`
  (`engine.js:339-343`), sin resolver refs ni agregar I/O.
- `expand: true` es la vía de compatibilidad: con el mismo `limit` explícito, devuelve exactamente
  el payload de seis campos que devolvía el contrato anterior; con el default 5 no.
- La ruta del error de presupuesto se obtiene de `resolveNodeRefs({ content, projectRoot })`
  (`engine.js:535`), con `projectRoot` = el `cwd` que recibe `buildWorkingContext`.

## Risks

- **La regresión golden quedó verde.** M01, M04, M05, M06 y M07 pasan y siguen siendo las cinco
  activas; M02, M03, M08, M09 y M10 siguen diferidas por sus blockers y la allowlist no cambió. No
  fue necesario detenerse ni debilitar ninguna expectativa.
- **El preview por defecto es un cambio de contrato para consumidores.** Mitigación: `expand: true`
  con el mismo `limit` explícito reproduce el payload heredado byte a byte; con el default 5 no.
- **`required` en `searchMemory` puede inyectar nodos ajenos a la query.** Mitigación: es entrada
  explícita del llamador, no se persiste y sigue sujeto a `type`/`status`; una key que no cumple
  falla en vez de colarse.
- **`required` sin superficie CLI queda inalcanzable desde `ancleto memory context`.** Se acepta:
  el contrato se fija en el engine y el cableado CLI no está en los paths autorizados.
- **Riesgo latente de `memory gc`.** `memory gc` purga `superseded` por el `created_at` original
  (`engine.js:707-713`). Este change no supersede nada, así que no se dispara; si en el futuro una
  consolidación o re-grabado empieza a superseder nodos valiosos, la retención por fecha original
  puede purgarlos antes de lo esperado. Disparador de reapertura: el primer caso real de
  consolidación o de política de retención que dependa de `created_at`.
- **El refresh del working-context puede fallar si un llamador futuro pasa `required`.** Ningún
  llamador actual lo hace; el fallo es explícito y preferible a un truncamiento silencioso.
- **Verificación post-auditoría (T8).** El preview como prefijo literal —con el ajuste de par
  sustituto— y el guard de `required` que excede el `limit` quedaron correctos y son
  mutation-sensitive; la verificación no encontró hallazgos CRITICAL ni MAJOR.

## Decisiones

- **memory_key:** `mem-05-orden-total-sin-rowid`

  **Elección:** `searchMemory` ordena por requerido → anclaje declarado parse-only → `SCOPE_RANK`
  → bm25 ascendente → `memory_key` ascendente. `n.rowid` deja de ser desempate; el subconjunto
  devuelto es el prefijo de ese orden.
  **Descartado:** Conservar `ORDER BY rank, n.rowid`, o reemplazar `rowid` por `created_at`.
  **Justificación:** El `rowid` es físico y cambia al reconstruir o importar la DB, así que el
  orden no sobrevive a una operación que el propio producto ofrece. `created_at` no es único y no
  expresa ni scope ni provenance. El orden propuesto usa señales ya disponibles y determinísticas:
  `SCOPE_RANK` (`engine.js:17`) y `declaresAnchor` (`:339-343`), sin I/O nuevo. Supersede la
  decisión `searchmemory-desempate-rowid-asc`; el determinismo para un estado fijo se conserva.
  **Refs:** `change:mem-05-recall-task-aware`; `path:src/core/memory/engine.js`;
  `path:aspec/changes/archive/2026-11-02-mem-05-recall-task-aware/specs/memory-engine/spec.md`
  **Estado:** aprobado

- **memory_key:** `mem-05-required-es-entrada-de-call`

  **Elección:** `required` es una lista de `memory_key` recibida en la llamada, tanto por
  `searchMemory` como por el cuarto argumento de `buildWorkingContext`; se promueve al frente y
  no se persiste. Si una requerida no existe, no está activa, no satisface el `type` o no entra en
  el presupuesto del bloque, la llamada falla con un error que nombra la `memory_key` y, para el
  caso de presupuesto, la ruta repo-relativa de sus refs resueltas con `resolveNodeRefs`.
  **Descartado:** Una columna o tabla `required`/`pinned`, un campo en el nodo, o degradar la key
  requerida a una entrada del `<ContextOverflowWarning>`.
  **Justificación:** La necesidad de recordar una memoria concreta es de la tarea, no del nodo: el
  mismo nodo puede ser crítico en una delegación y prescindible en otra. Persistirlo obligaría a
  migración y a decidir cuándo se limpia. La ruta convierte el error en accionable: dice qué
  memoria no entró y dónde vive su fuente, reutilizando `resolveNodeRefs` (`engine.js:535`) sin un
  segundo resolvedor.
  **Refs:** `change:mem-05-recall-task-aware`; `path:src/core/memory/engine.js`;
  `path:src/core/memory/tools.js`; `spec:memory-engine#Orden determinístico de inyección de reglas`
  **Estado:** aprobado

- **memory_key:** `mem-05-preview-opt-in-expand`

  **Elección:** `searchMemory` devuelve por defecto previews de ≤240 caracteres con
  `content_truncated` y `limit` default 5; `expand: true` devuelve el payload heredado de seis
  campos con `content` completo, y `keys` expande sólo las claves presentes en la página. Una key
  pedida que no está en la página falla nombrando la clave.
  **Descartado:** Devolver previews dentro del campo `content` (truncamiento ambiguo), o mantener
  `content` completo por defecto y agregar el preview como campo adicional.
  **Justificación:** El consumidor necesita elegir entre 3–5 candidatos antes de pagar el costo del
  contenido completo; 10 contenidos completos por búsqueda es el gasto que este change evita.
  Poner el preview en `content` haría que un consumidor viejo lo trate como contenido íntegro:
  un fallo visible (`content` ausente) es preferible a una pérdida silenciosa. `expand: true`
  conserva una vía de compatibilidad exacta y testeable con `deepEqual` de claves.
  **Refs:** `change:mem-05-recall-task-aware`; `path:src/core/memory/engine.js`;
  `path:src/core/memory/tools.js`; `path:test/memory-engine.test.js`
  **Estado:** aprobado

- **memory_key:** `mem-05-presupuestos-separados-no-componibles`

  **Elección:** El presupuesto del bloque `working-context` (2.000 tokens × 4 = 8.000 chars,
  medido sobre el bloque completo con wrapper y aviso) y el tope del campo destilado por
  delegación (≤5 reglas / ≤1.500 B) se declaran superficies distintas, no convertibles y no
  componibles. Ningún tope numérico cambia.
  **Descartado:** Presentar el aviso de overflow como remedio del tope del campo, o sumar/restar
  ambos topes como si fueran un solo presupuesto.
  **Justificación:** Son consumidores distintos: el bloque lo lee el orquestador una vez; el campo
  destilado viaja en cada delegación. Convertir uno en otro o componerlos produce un número que no
  corresponde a ninguna de las dos superficies. T28 los prueba por separado y no falsa un "21/21".
  **Refs:** `change:mem-05-recall-task-aware`;
  `spec:prompt-contracts#Reglas de proyecto destiladas por delegación`;
  `spec:memory-engine#Aviso de overflow accionable para el orquestador`;
  `path:src/core/memory/engine.js`
  **Estado:** aprobado

- **memory_key:** `mem-05-sin-consolidacion-18-reglas`

  **Elección:** No se agregan reglas, no se suben topes y no se consolida nada. Las 18 reglas
  omitidas no se eliminan: se vuelven recuperables porque la omisión queda nombrada y el recall con
  preview/expand permite traerlas.
  **Descartado:** Agregar un guard de consolidación, subir `MAX_TOKENS`/`MAX_OMITTED_KEYS` o crear
  reglas nuevas para "compensar" las omitidas.
  **Justificación:** El dry-run de consolidación (read-only, umbral 0,60) devolvió
  `exactGroups: []` y `nearDuplicates: []`: 0 candidatos. Sin señal medible, consolidar agregaría
  riesgo de pérdida de contenido sin beneficio; subir el tope sólo traslada el problema y rompe el
  presupuesto declarado. La resolución correcta es hacer recuperable lo omitido, no reescribir el
  corpus.
  **Refs:** `change:mem-05-recall-task-aware`;
  `path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`;
  `spec:memory-engine#Aviso de overflow accionable para el orquestador`
  **Estado:** aprobado

- **memory_key:** `mem-05-deuda-gc-fuera-de-alcance`

  **Elección:** `memory gc` que purga `superseded` por `created_at` original queda fuera de
  alcance. Se registra el riesgo latente y el disparador de reapertura, sin cambiar el comando.
  **Descartado:** Adelantar ahora una retención basada en la fecha de supersesión, o excluir del
  `gc` a los nodos con refs.
  **Justificación:** Este change no supersede ningún nodo (0 candidatos de consolidación, ninguna
  regla nueva), así que el `gc` actual no puede purgar nada que este change haya creado. Cambiarlo
  sin un caso real sería una extensión especulativa y tocaría un comando fuera de los paths
  autorizados.
  **Refs:** `change:mem-05-recall-task-aware`;
  `path:src/core/memory/engine.js`;
  `path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`
  **Estado:** aprobado

- **memory_key:** `mem-05-preview-prefijo-literal`

  **Elección:** la preview es un prefijo literal del `content`, sin colapsar espacios ni saltos de
  línea; cuando el `content` excede 240 caracteres se recorta a `content.slice(0, 239) + '…'`, y
  `content_truncated` marca exactamente ese exceso. Si el último code unit del corte es un high
  surrogate (`0xD800`–`0xDBFF`), el corte se reduce un code unit más, de modo que la preview
  resultante sigue siendo de a lo sumo 240 caracteres y siempre un prefijo literal del `content`.
  **Descartado:** colapsar whitespace (medido 0,0% de ahorro —13.302 vs 13.305 chars— con costo
  semántico) y marcar truncado por colapso.
  **Justificación:** el colapso no reducía la página y alteraba el contenido presentado; el prefijo
  literal conserva los mismos bytes y hace que `content_truncated` describa una propiedad medible
  del `content`, no de la transformación.
  **Refs:** `change:mem-05-recall-task-aware`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Recall task-aware con orden total, preview expandible y keys requeridas`
  **Estado:** aprobado

- **memory_key:** `mem-05-required-excedente-falla`

  **Elección:** si `required.length` excede el `limit` efectivo, `searchMemory` falla con un error
  que nombra las `memory_key` que no entran.
  **Descartado:** elevar el `limit` efectivo (medido +203% de página) o recortar `required` en
  silencio.
  **Justificación:** descartar una requerida silenciosamente rompe el invariante de que una key
  requerida se inyecta o falla; elevar el límite cambia el tamaño de la página por un factor
  medido y oculta la decisión al llamador.
  **Refs:** `change:mem-05-recall-task-aware`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Recall task-aware con orden total, preview expandible y keys requeridas`
  **Estado:** aprobado
