# Proposal: MEM-05a — Docs de searchMemory alineados al contrato preview

> Origen: backlog `#17`. Sin Work Item de Azure DevOps (`.ancletorc` → `azure.enabled: false`).
> Sin `design.md`: el cambio es de contratos de documentación y de merge, no de arquitectura nueva.

## Problem

`searchMemory` cambió en MEM-05 (archivado en
`aspec/changes/archive/2026-11-02-mem-05-recall-task-aware/`). El default ahora devuelve
**preview**: prefijo literal de ≤240 caracteres, `limit` 5 y flag `content_truncated`;
`expand: true` devuelve el payload completo; `keys` expande selectivo y falla si la clave pedida
no está en la página; `required` es una entrada de llamada que falla si excede el `limit` o el
presupuesto. El `<ContextOverflowWarning>` ahora nombra `memory_key`s (≤40, sufijo `+N`) y **no
menciona `searchMemory`**; la recuperación correcta es un Recall acotado (en este flujo, una sola
delegación a `@memory-keeper`).

Cuatro superficies siguen con el consejo viejo y contradicen ese contrato:

- `AGENTS.md:23-47` y `templates/AGENTS.md:34-58`, sección
  `## Memoria Persistente (Protocolo Reactivo)` (idénticas en contenido). En
  `AGENTS.md:34-36` y `templates/AGENTS.md:45-47` afirman que el warning "indica explícitamente
  usar `searchMemory` para recuperar lo omitido", que es falso. Ninguna de las dos documenta
  preview, `expand`, `keys` ni `required`.
- `PRODUCT.md:30-33` y `templates/PRODUCT.md:28-31`: el blockquote de `.ancleto/memory.db` repite
  "Consult via the `searchMemory` tool ... after a `<ContextOverflowWarning>`".
  `PRODUCT.md:95` repite el mismo consejo en el bullet de guardrails.
- `README.md:435`: describe `searchMemory` sólo como búsqueda FTS5/BM25 con fallback OR; no
  menciona preview, `expand`, `limit` 5 ni `required`.

Además, todo ese texto es plano: `mergeLocked` (`src/cli/index.js:1402-1427`) sólo inserta o
reemplaza bloques `LOCKED`, así que las instalaciones existentes conservan la guía vieja para
siempre. `LEGACY_SIGNATURES` (`src/cli/index.js:1447-1459`) sólo conoce la firma
`validation-commands-flat`, y `reconcileLegacyBlocks` (`:1465-1494`) sólo la elimina. La única
ruta de saneamiento es `mergeTemplateInto` (`:1500-1502`) → `reconcileLegacyBlocks`, que ya es el
punto único de `copyTemplates` (`:1517`) e `importCmd` (`:3828`).

Verificado en código: el terminador del tramo plano no es estable. En el `AGENTS.md` de este
repositorio la sección termina en `:47` y la línea siguiente no vacía es
`<!-- LOCKED: validation-commands -->` (`:49`); en `templates/AGENTS.md` termina en `:58` y la
siguiente no vacía es `<!-- LOCKED: memory-boundary -->` (`:60`). `findInsertAnchor`
(`:1431-1439`) inserta un bloque nuevo antes del bloque que lo sigue en el template de origen o al
final del archivo, así que el terminador depende del orden de bloques de la versión instalada. Por
eso la firma debe cerrarse con cualquier marcador de apertura `LOCKED`, no sólo `memory-boundary`:
es una regla defensiva de compatibilidad, no un hecho observado en un único repo (ver Assumptions).

## Proposed change

1. **`AGENTS.md` raíz y `templates/AGENTS.md`:** envolver la sección completa —heading
   `## Memoria Persistente (Protocolo Reactivo)` incluido— en
   `<!-- LOCKED: memory-protocol -->` … `<!-- /LOCKED: memory-protocol -->` y reescribir el
   contenido en tres partes: (a) cuándo consultar la memoria, incluido que el
   `<ContextOverflowWarning>` nombra `memory_key`s (≤40, sufijo `+N`) y que la recuperación es un
   Recall acotado, no repetir el contexto completo; (b) contrato de `searchMemory`: preview por
   defecto (≤240 caracteres literales, `limit` 5, `content_truncated`), el preview no es el texto
   íntegro, `expand: true` para el payload completo, `keys` selectivo (falla si la clave no está
   en la página) y `required` como entrada de llamada que falla si excede el `limit` o el
   presupuesto; (c) comportamiento: lectura, puede estar desactualizada, nunca pisa
   seguridad/validación/diseño vigente, reportar discrepancia.
2. **`PRODUCT.md` raíz y `templates/PRODUCT.md`: no duplicar el contrato.** Reemplazar el
   blockquote legado por un puntero de una línea a `AGENTS.md` → bloque
   `LOCKED: memory-protocol`. En `PRODUCT.md` raíz, corregir además el bullet de guardrails
   (`:95`) para que remita al protocolo canónico. Las líneas project-specific
   (`Repository App ID`, `Scope`) quedan fuera de cualquier bloque y se preservan.
3. **`README.md`:** actualizar la fila de `searchMemory` (`:435`) con preview por defecto,
   `limit` 5, `expand`/`keys`/`required` y la remisión al protocolo de `AGENTS.md`.
4. **`src/cli/index.js`:** extender `LEGACY_SIGNATURES` y `reconcileLegacyBlocks` para eliminar el
   texto plano legado con coincidencia exacta, en toda ruta que ya pasa por `mergeTemplateInto`
   (`copyTemplates` de install/update/upgrade e `importCmd`; no se agrega un segundo punto de
   merge):
   - `AGENTS.md`: run contiguo exacto desde `## Memoria Persistente (Protocolo Reactivo)` hasta la
     última línea de `**Comportamiento:**`, cerrado por un marcador de apertura `LOCKED`
     (`memory-boundary` o `validation-commands`). El bloque `LOCKED: memory-boundary` se conserva.
   - `PRODUCT.md`: run contiguo exacto de las cuatro líneas del blockquote legado.
   - Invariante: si el run no coincide exactamente (usuario lo editó), se emite aviso y no se
     elimina el run ni se altera contenido del usuario fuera del bloque identificado; el merge de
     bloques `LOCKED` del mismo pase sí MAY insertar el bloque canónico faltante y reemplazar los
     bloques `LOCKED` existentes, así que el archivo puede cambiar. Las firmas se aplican sólo
     fuera de bloques `LOCKED`, para que el bloque canónico recién insertado no dispare un aviso en
     la siguiente ejecución. Idempotente: tras eliminar, re-ejecutar no duplica ni elimina
     contenido del usuario.

### Capability destino

`prompt-contracts` es la capability principal: el defecto es de superficies mergeadas y de su
reconciliación, no del engine. Se agrega un requirement para el hogar canónico y el puntero único,
y se modifica el requirement de reconciliación de superficies mergeadas.

`memory-engine` recibe un `MODIFIED` acotado a `Coherencia entre contrato documentado e
inyección`: ese requirement ya es el dueño de la coherencia de `README.md` con el motor. El
`SHALL` de comportamiento de `searchMemory` no se duplica: sigue viviendo en
`Recall task-aware con orden total, preview expandible y keys requeridas`; el delta sólo exige que
la documentación lo describa y remita al bloque canónico.

## Scope

In scope:

- `AGENTS.md` y `templates/AGENTS.md`: bloque `LOCKED: memory-protocol` y su contenido.
- `PRODUCT.md` y `templates/PRODUCT.md`: puntero único, corrección del bullet de guardrails y
  preservación de las líneas project-specific.
- `README.md`: fila de `searchMemory`.
- `src/cli/index.js`: firmas legadas del protocolo de memoria y del blockquote de `PRODUCT.md`,
  reconciliación exacta e idempotente.
- `test/cli.test.js` (sólo si el tester necesita cubrir el merge; lo escribe el tester).
- Delta de `prompt-contracts` y delta de `memory-engine`.

Out of scope (no-goals explícitos):

- `src/core/memory/engine.js` y `src/core/memory/tools.js`: el comportamiento ya está
  especificado por MEM-05; acá sólo se documenta. No se cambia el engine.
- El texto literal del `<ContextOverflowWarning>` en `engine.js`: lo asertan los content guards y
  no se toca.
- `agents/**`, `commands/**`, `skills/**` y `.opencode/**`: los mirrors sólo se regeneran con
  `ancleto upgrade`, nunca a mano.
- Regenerar el technical seed; subir topes; cambiar el orden de recall.
- `MEM-05b` (gc/`superseded_at`) y `CH-09`: changes separados.
- `test/content-guards.test.js`: no está en los paths autorizados. La cobertura estática del
  bloque nuevo y de la ausencia de duplicación en `PRODUCT.md` queda como deuda declarada; el
  merge se cubre en `test/cli.test.js`.
- Inserción del puntero de una línea en una copia ya instalada de `PRODUCT.md`: la reconciliación
  elimina el blockquote legado, pero no escribe texto nuevo fuera de un bloque `LOCKED`. En esas
  copias la guía vigente vive en `AGENTS.md`, que sí se re-aplica.
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`: la actualización del estado del ítem `#17`
  pertenece al archive, no a este change.

Paths autorizados del change:

- `AGENTS.md`
- `PRODUCT.md`
- `templates/AGENTS.md`
- `templates/PRODUCT.md`
- `README.md`
- `src/cli/index.js`
- `test/cli.test.js` (sólo si el tester necesita cubrir el merge; no lo edita el implementador)
- `aspec/changes/mem-05a-searchmemory-docs-contract/**`

## Assumptions

- El contrato de MEM-05 es el archivado:
  `aspec/changes/archive/2026-11-02-mem-05-recall-task-aware/specs/memory-engine/spec.md:974-1136`
  y el vigente en `aspec/specs/memory-engine/spec.md:974-1136`.
- **Anclaje del run de `AGENTS.md` (regla defensiva, no hecho de un repo).** El requisito indica
  "inmediatamente seguido de `<!-- LOCKED: memory-boundary -->`". Ese anclaje sólo vale para las
  instalaciones cuyo template tenía `memory-boundary` como bloque siguiente: `findInsertAnchor`
  (`src/cli/index.js:1431-1439`) inserta los bloques nuevos antes del siguiente bloque del template
  de origen o al final del archivo, así que en instalaciones históricas el tramo plano puede quedar
  cerrado por `validation-commands` u otro bloque. Si la firma exigiera sólo `memory-boundary`, esas
  instalaciones no se sanearían. Por eso la spec admite como terminador cualquier marcador de
  apertura `LOCKED` (`memory-boundary` o `validation-commands`) y conserva `memory-boundary`. Si se
  prefiere el literal estricto, el alcance de la migración se reduce a las instalaciones nuevas.
- La reconciliación corre en el punto único existente (`mergeTemplateInto`); no se agrega una
  ruta ni se llama `mergeLocked` directo desde install/update/upgrade/import.
- El bloque `LOCKED: memory-protocol` se inserta en las instalaciones existentes con
  `findInsertAnchor` antes de `memory-boundary`, que es el siguiente bloque del template.
- `PRODUCT.md` es EXTENSIBLE: sus líneas project-specific no viajan en ningún bloque y no se
  reemplazan.

## Risks

- **Coincidencia exacta y drift.** Cualquier variante introducida por el usuario hace que el run
  no coincida: se emite aviso y no se elimina el run ni se altera contenido del usuario fuera de
  él. El archivo sí puede cambiar por el merge de bloques `LOCKED` del mismo pase (inserción del
  bloque canónico faltante). Es el fallo seguro, pero deja la guía vieja en esa copia hasta que el
  usuario la limpie a mano.
- **Idempotencia.** Si la reconciliación no ignora los headings dentro de bloques `LOCKED`, el
  bloque canónico recién insertado se interpretaría como firma legada y cada `upgrade` emitiría un
  aviso. La spec lo exige explícitamente y el test de idempotencia lo cubre.
- **Sin content guard nuevo.** `test/content-guards.test.js` está fuera de los paths autorizados;
  la presencia del bloque y la ausencia de duplicación en `PRODUCT.md` no quedan ancladas por un
  guard en este change. Disparador de reapertura: primer cambio que autorice ese path.
- **`README.md` es documentación publicada en npm.** Una divergencia con el engine sería una
  regresión de documentación; se mitiga remitiendo al contrato de `memory-engine` y al bloque
  canónico.
- **Orden de bloques distinto entre `AGENTS.md` raíz y template.** Al envolver la sección en su
  lugar, el archivo raíz conserva `memory-protocol` antes de `validation-commands`, mientras el
  template tiene el orden inverso. `mergeLocked` opera por nombre y no reordena, así que no hay
  impacto funcional; no se reordenan secciones ajenas al cambio.
- **Bloques de decisión sin promoción inmediata.** Los dos bloques de `## Decisiones` quedan
  `aprobado` y se promueven en el archive, como el resto del flujo.

## Decisiones

- **memory_key:** `docs-searchmemory-en-agents-locked`

  **Elección:** El contrato de memoria vive en un bloque `LOCKED: memory-protocol` de `AGENTS.md`
  (y `templates/AGENTS.md`); `PRODUCT.md` y su template sólo apuntan a ese bloque.
  **Descartado:** Mantener el contrato duplicado en `PRODUCT.md`, o dejar la guía plana sin bloque
  `LOCKED` confiando en que `mergeLocked` la actualice.
  **Justificación:** `mergeLocked` (`src/cli/index.js:1402`) sólo reemplaza bloques `LOCKED`; el
  texto plano sobrevive para siempre en las copias instaladas, y dos copias del mismo contrato son
  una fuente de deriva. Un único hogar en `AGENTS.md` permite re-aplicarlo en cada
  `install`/`update`/`upgrade` y deja a `PRODUCT.md` como puntero.
  **Refs:** `change:mem-05a-searchmemory-docs-contract`; `path:AGENTS.md`;
  `path:templates/AGENTS.md`; `path:PRODUCT.md`; `path:src/cli/index.js`;
  `spec:prompt-contracts#Protocolo de memoria canónico en AGENTS.md y puntero único desde PRODUCT.md`
  **Estado:** aprobado

- **memory_key:** `legacy-reconcile-bloque-exacto`

  **Elección:** La migración del texto plano legado exige coincidencia exacta línea a línea del run
  identificado, no toca contenido personalizado, emite aviso cuando no coincide y es idempotente;
  corre en el punto único `mergeTemplateInto` → `reconcileLegacyBlocks`.
  **Descartado:** Borrar por "sección" con un rango difuso, reemplazar el run por el bloque
  canónico en el mismo paso, o abrir una ruta nueva que llame `mergeLocked` directo.
  **Justificación:** Un rango difuso puede borrar contenido del usuario; el merge por bloques es la
  única operación que ya corre en todas las rutas que tocan `TEMPLATES` (`copyTemplates` e
  `importCmd`). La coincidencia exacta hace que el fallo sea seguro: ante drift, aviso sin eliminar
  el run ni contenido del usuario fuera de él; el merge de bloques `LOCKED` del mismo pase sí puede
  insertar el bloque canónico. Y al excluir los bloques `LOCKED` de la búsqueda de firmas, el bloque
  nuevo no se confunde con el legado.
  **Refs:** `change:mem-05a-searchmemory-docs-contract`; `path:src/cli/index.js`;
  `path:test/cli.test.js`; `spec:prompt-contracts#Reconciliación de superficies mergeadas por bloques`
  **Estado:** aprobado
