---
node: units/memory-engine
kind: dossier
read_when: "cómo funciona la memoria persistente, las tools del LLM, el recall task-aware (preview/expand/keys/required), la validación de refs, el resolver de refs navegables, la promoción al archivar, el working-context, el refresh on-write, la procedencia source, las ops export/import/gc por supersesión, snapshot, merge, consolidate, la curaduría read-only con memory curate, el doctor read-only, el orden de inyección, el presupuesto/aviso de overflow y su consumo por el orquestador"
covers: [motor de memoria, tools, recall task-aware, preview, expand, keys, required, refs normalizadas, validación fail-closed, indentación de refs, rechazo de secretos, resolver de refs navegables, resolveNodeRefs, orden de inyección, anclaje, presupuesto, manifiesto de omitidas, promoción al archivar, working-context, día-cero, procedencia source, export/import/gc, superseded_at, snapshot consistente, merge por supersesión, consolidate, includeNearDuplicates, curaduría read-only, curate, refs rotas, no verificables, duplicados exactos, doctor read-only, auditoría de refs, inspectRefs, refresh on-write CLI, staleness advisory, aviso de overflow, Recall delegado]
sources: ["src/core/memory/**"]
generatedAt: 2026-11-03T13:54:02Z
pluginVersion: 0.18.7
skillVersion: '2.3'
---

# Unidad: motor de memoria persistente

## Propósito

Retener reglas y decisiones del proyecto entre sesiones de IA, en una base SQLite **local**
(`.ancleto/memory.db`), sin bases vectoriales. Un mismo motor soporta seis consumidores: tools
MCP del LLM, subcomandos CLI (mantenimiento, snapshot, merge, **consolidate**, **curate**, **gc**
e integridad), el working-context inyectado al system prompt, el doctor y un **resolver read-only
de refs para recall**. Desde `MEM-03`, `recordNode` es el punto único de **validación de refs** y
**rechazo de secretos**. Desde `MEM-04` (`0.18.0`), `memory doctor` audita esas refs con
`inspectRefs`, sin un segundo parser. `MEM-04b` (`0.18.3`) expone `resolveNodeRefs` sobre el
mismo parser y resolvedor. `0.18.4` agrega el **orden por anclaje** y el **manifiesto de
omitidas**; `0.18.5` agrega **`consolidate`**; `0.18.6` agrega el **recall task-aware**
(preview/`expand`/`keys`/`required`) y publica el **protocolo canónico** en `AGENTS.md`;
`MEM-05b` agrega **`superseded_at`** para que `gc` mida la edad de supersesión. CH-09 agrega
**`memory curate`** (archivado, aún sin release): un reporte read-only que compone resolver y
consolidate sin duplicar primitivas. Evidencia: `README.md`,
`DESIGN-memory-engine-v0.2.0.md`, `aspec/specs/memory-ops/spec.md`,
`aspec/specs/memory-engine/spec.md`, `aspec/changes/archive/2026-11-02-*`,
`aspec/changes/archive/2026-11-03-ch-09-curaduria-recurrente/`.

## Recorrido relevante

1. `ancleto mcp` arranca `serveMemoryMcp`, que abre la DB y publica 3 tools al IDE.
2. `recordRule`/`recordDecision` pasan por `recordNode`: rechazan secretos y, si la procedencia
   no es `runtime`, validan `refs:` antes de abrir la transacción. Luego superseden atómicamente
   por `memory_key` y pueden refrescar el working-context.
3. `ancleto memory export|import|gc|snapshot|merge|consolidate|curate|context|list|doctor` mueven,
   copian, consolidan, reportan, inspeccionan y verifican la memoria:
   - `import` y `merge`/`consolidate --apply` refrescan el working-context compare-based;
   - `import` **no** pasa por `recordNode` y conserva LWW sin validar refs;
   - `snapshot` produce una copia binaria con historial;
   - `consolidate` agrupa duplicados exactos y supersede con `--apply`;
   - `curate` **sólo reporta** refs rotas, no verificables y duplicados exactos, sin escribir;
   - `doctor` audita en read-only y reporta la frescura del working-context.
4. `buildWorkingContext` materializa `<ProjectMemoryRules>`/`<ProjectTopology>`; el bloque de
   reglas renderiza sólo la **prosa** de cada `content`, ordena por scope/anclaje/recencia/clave
   y, si trunca, agrega `<ContextOverflowWarning>` con las claves omitidas.
5. Un consumidor de recall puede pasar `content` + `projectRoot` a `resolveNodeRefs` y obtener la
   ubicación concreta de cada ref.
6. Al archivar, el gate de `ancleto-archive` promueve sólo las decisiones aprobadas.

## Componentes

| Archivo | Rol |
|---|---|
| `src/core/memory/database.js` | Abre la DB (`openDatabase`, con opción `readonly`), PRAGMAs (`WAL`, `foreign_keys`, `busy_timeout=5000`), migraciones idempotentes (incl. `superseded_at` aditiva con backfill), FTS5 external-content, triggers, `checkpointDatabase`. |
| `src/core/memory/engine.js` | Núcleo: `defaultMemoryDbPath`, `createMemoryEngine`, `createReadonlyMemoryEngine`, `buildWorkingContext` (orden, presupuesto, aviso, `required`), `searchMemory` (BM25, escape FTS5, fallback AND→OR, preview/`expand`/`keys`/`required`), `recordNode` (procedencia, refs, secretos), `parseRefsBlock`/`refsBlockEnd`/`validateRefsForWrite`/`renderRuleContent`, `inspectRefs`, `resolveNodeRefs`, `listNodes`, `formatTopologyBlock`, `exportActive`, `importNodes`, `gcSuperseded`, `validateMerge`/`merge`, **`consolidate`** (con `includeNearDuplicates`), `sanitizePaths`, `checkpoint`, `close`. Presupuesto: `CHARS_PER_TOKEN = 4`, `MAX_TOKENS = 2000`, `MAX_OMITTED_KEYS = 40`. |
| `src/core/memory/curation.js` | `curateMemory(engine, { projectRoot })`: módulo puro que **compone** `resolveNodeRefs` + `consolidate({ dryRun: true, includeNearDuplicates: false })`; no abre/cierra/migra/escribe la DB ni duplica SQL, parser, resolvedor o normalización. Devuelve `{ status, brokenRefs, unverifiable, exactDuplicates }` en orden total por `memory_key`. |
| `src/core/memory/snapshot.js` | Dueño único de la copia binaria: `realpathish`/`sameFile`, `vacuumInto`, `verifySnapshot`, `replaceDestination` y `snapshotDatabase(dbPath, outPath, { overwrite })`. |
| `src/core/memory/tools.js` | `createMemoryToolHandlers` (JSON Schema de las 3 tools) y `createMemoryToolkit`; tras `recordNode`, evalúa `shouldRefreshWorkingContext(result)` y llama `writeWorkingContext` en `try/catch`. |
| `src/core/memory/mcp-server.js` | `createMemoryServer`/`serveMemoryMcp`: MCP stdio sin dependencias; fija `{ source: 'mcp:ancleto-memory', projectRoot }`. |
| `src/core/memory/doctor.js` | `memoryDoctor(dbPath, { rebuild })`: read-only por defecto; cinco checks estables; `--rebuild` es el único camino de escritura. |
| `src/core/memory/working-context.js` | Render único + persistencia, trigger MCP, refresh on-write CLI, staleness advisory, normalización, resolución de raíz y día-cero. |

## Refs normalizadas y validación fail-closed (`MEM-03`)

El motor **no** agrega tabla, columna ni migración: las refs viven dentro de `content` como un
bloque `refs:` y se resuelven sobre el texto indexado. Evidencia:
`aspec/specs/memory-engine/spec.md`.

- **Gramática cerrada**: línea `refs:` al inicio de línea + lista con guion. Prefijos:
  `spec:<cap>#<heading>`, `change:<slug>`, `path:<repo-relative>`, `commit:<sha>` (7–40 hex) y
  `workitem:<tracker>:<key>`. `change:<slug>` va **sin** `YYYY-MM-DD-`: la fecha la aporta
  `archive/`.
- **Bloque único y terminal** (`refsBlockEnd`): empieza en `refs:` y continúa por cada item
  (`- ` con cualquier indentación, incluida ninguna) y por cada línea indentada; termina antes de
  la primera línea en blanco o de la primera **no indentada que no es item**. Una línea no-item,
  un item con gramática inválida, un prefijo desconocido o un segundo bloque son inválidos
  (fail-closed).
- **Validación previa a la transacción** (`validateRefsForWrite`): exige exactamente un bloque
  con al menos una ref. Una `decision` exige `spec:` o `change:`; una `rule` exige `path:`,
  `spec:` o `change:`. Un rechazo **no escribe ni supersede**.
- **Resolución contra el repo**:
  - `change:<slug>` busca el change activo y un archive anclado exacto
    `YYYY-MM-DD-<slug>` (no sufijo suelto) y reporta ambigüedad si hay más de un match.
  - `spec:<cap>#<heading>` lee `aspec/specs/<capability>/spec.md`, compara headings
    `### Requirement:` por forma exacta y canonizada (trim, minúsculas, sin diacríticos, sin
    backticks/`**`), deduplica por bloque y **reporta ambigüedad** en vez de elegir el primero.
  - `path:` se normaliza antes del chequeo (colapsa `[\\/]+` a `/`, quita `.`, quita `:\d+`),
    debe ser relativo (rechaza absolutos y `..`), existir y ser archivo. La validación es
    **léxica y de existencia**, sin `realpath` ni containment de symlinks.
  - `commit:`/`workitem:` se validan por gramática; el motor **no** resuelve su existencia.
- **Exención única**: la validación se salta sólo cuando la procedencia resuelta es exactamente
  `runtime`. Toda otra (`mcp:ancleto-memory`, `agent:<rol>`, etc.) se valida fail-closed.
- **Sin backfill**: los nodos previos sin refs no se revalidan ni reescriben; la curación de
  provenance fue una pasada separada (hoy todos los activos declaran refs).
- **`inspectRefs` comparte parser y resolución**: auditoría read-only y pura, sin abrir
  conexiones ni escribir. Un bloque repetido se reporta como inválido; uno vacío aporta 0 refs y
  no es falla.
- **`importNodes` queda fuera**: no pasa por `recordNode`, no valida refs y conserva LWW.
- **Raíz del proyecto**: `resolveProjectRoot(context, dbPath)` usa `context.projectRoot` o sube
  desde la ubicación de la DB buscando `.ancletorc`; **nunca** `process.cwd()`.

## Resolver de refs navegables (`MEM-04b`, publicado en `0.18.3`)

`resolveNodeRefs({ content = '', projectRoot = null })` es una **API read-only** exportada por
`engine.js`. Reutiliza `parseRefsBlock` y `resolveRefResult`; no abre la DB, no escribe y no tiene
comando CLI, tool MCP, tabla ni migración. Evidencia: `src/core/memory/engine.js`,
`aspec/changes/archive/2026-11-02-mem-04b-resolver-referencias-navegables/`.

**Forma del resultado**:

```text
{ refs: [ { raw, kind, verifiable, ok?, path?, heading?, reason?, matches? } ],
  error: <línea inválida> | null,
  blocks: <n> (sólo si > 1),
  needsRoot: <bool> }
```

**Reglas**:

- **Orden declarado**: las entradas respetan el orden de las refs en el bloque.
- **`change:`** → `ok: true` y `path` repo-relativo con `/` del directorio activo
  (`aspec/changes/<slug>`) o del archive (`aspec/changes/archive/YYYY-MM-DD-<slug>`).
- **`spec:`** → `ok: true`, `path` `aspec/specs/<capability>/spec.md` y `heading` con el
  **texto real** del `### Requirement:` que matcheó (no la forma canónica). No usa FTS.
- **`path:`** → `ok: true` y `path` repo-relativo normalizado (separadores `/`, sin `:línea`),
  con la comprobación léxica y de existencia vigente. **No** usa `realpath` ni containment.
- **`commit:`/`workitem:`** → `verifiable: false`, sin ubicación ni `reason`; no se reportan
  como resueltas ni rotas.
- **Ambigüedad** → `ok: false`, `reason` `ambiguo (<n> coincidencias)` y `matches`; nunca se
  elige una ubicación.
- **Cero coincidencias** → `ok: false`, `reason` `inexistente`; no aborta las demás.
- **Sin raíz y con refs verificables** → `needsRoot: true` y cada ref verificable devuelve
  `ok: false`, `reason` `sin raíz`. `needsRoot` sólo es `true` si hay al menos una ref
  `spec:`/`change:`/`path:`.
- **Línea inválida** → `refs: []` + `error`; **más de un bloque** → `refs: []` + `blocks`. No
  lanza.
- **Error de I/O por ref** → `inválido (lectura no disponible: <CODE>)` para esa ref
  (`safeResolveRefResult` captura `err.code`), sin abortar el nodo ni las demás.
- **Sin cambios en vecinos**: `inspectRefs`, `validateRefsForWrite` y `doctor.js` conservan
  campos, mensajes y semántica.

**Golden M04/M05/M06**: el harness `test/memory-fixtures.test.js` siembra `seed.json` +
`golden-refs-seed.json` y, para `expected.mode: "refs"`, resuelve el `content` esperado contra
`refs-root/`. M04 valida `spec:`; M05 un `change:` archivado único; M06 un `change:` ambiguo.
Evidencia: `test/fixtures/memory/`, `test/memory-fixtures.test.js`.

## Recall task-aware (`MEM-05`, `0.18.6`)

`searchMemory` deja de devolver siempre el payload completo. El requirement
`Recall task-aware con orden total, preview expandible y keys requeridas` fija el contrato.
Evidencia: `src/core/memory/engine.js`, `src/core/memory/tools.js`,
`aspec/specs/memory-engine/spec.md`, `README.md`, `AGENTS.md` (`LOCKED: memory-protocol`).

**Orden total y determinístico** (sin `rowid`):

1. `required` en el orden declarado por el llamador.
2. Anclaje declarado (`spec:`/`change:`/`path:` en el bloque `refs:`).
3. Jerarquía de scope `task` → `feature` → `project`.
4. `bm25` ascendente (negativo: mejor primero).
5. `memory_key` lexicográfico ascendente.

El subconjunto devuelto es **el prefijo del orden total**: se rankea antes de recortar por
`limit`. El fallback OR-prefijo corre sólo cuando la pasada AND no devolvió nada. Evidencia:
`compareRecall`, `run`, `searchMemory`.

**Proyección de la página** (`projectSearchPage`):

- **Default: preview.** `previewNode` devuelve un prefijo **literal** de 239 caracteres más `…`
  (hasta 240) sin colapsar whitespace; `content_truncated` es `true` exactamente cuando el
  `content` excede 240 caracteres. `limit` por defecto 5. El preview **no** es el texto íntegro
  y no debe citarse como fuente de una regla. El corte no parte un par sustituto (emoji).
- **`expand: true`**: payload completo con el shape heredado de seis campos.
- **`keys: [...]`**: expande sólo las claves pedidas, presentes en la página; si una clave no
  está en la página, la llamada **falla**.
- **`required: [...]`**: entrada de la llamada (**no** se persiste en el nodo). Promueve las
  `memory_key` al frente del orden; una requerida ausente, inactiva o fuera del `type` falla
  nombrando la clave. Si el `limit` efectivo no alcanza para todas, la llamada falla en vez de
  omitirlas en silencio.

**`buildWorkingContext({ required })`**: resuelve las requeridas **antes** del early return y
del piso estructural. Una requerida no se trunca ni se degrada al aviso de overflow: falla con
un error diagnóstico que nombra la `memory_key` y la ubicación repo-relativa de sus refs
resueltas (o `sin refs resolubles`). Evidencia: `requiredBudgetError`.

**Consumo canónico**: `@memory-keeper` en Modo 1 pasa sólo `query` + `expand: true` (sin
`type`), porque sin `expand` recibiría previews no legibles como precedente. Las skills
`ancleto-recall`, `new`, `propose` y `ff` usan `expand: true`; `explore` y `onboard` corrigen la
firma documentada. El aviso de overflow **no** menciona `searchMemory`: delega un Recall a
`@memory-keeper`. Evidencia: `agents/memory-keeper.md`, `CHANGELOG.md` (`0.18.6`).

## Orden determinístico de inyección (`0.18.4`)

`buildWorkingContext` ordena las `rule` activas del scope y su jerarquía con un orden **total**:

1. Jerarquía de scope: `task` → `feature` → `project`.
2. **Anclaje declarado**: primero las reglas con al menos una ref `spec:`/`change:`/`path:` en su
   bloque `refs:`.
3. `created_at` descendente.
4. `memory_key` lexicográfico ascendente, sin locale.

El anclaje se determina **sólo parseando** el `content` con `parseRefsBlock` (`declaresAnchor`):
no resuelve refs, no consulta filesystem/DB y no agrega I/O. Un bloque ausente, inválido, múltiple
o que sólo declara `commit:`/`workitem:` **no ancla**. Evidencia: `src/core/memory/engine.js`
(`scopeRank`, `declaresAnchor`), `aspec/specs/memory-engine/spec.md`.

## Presupuesto y aviso de overflow (`0.18.4`)

`buildWorkingContext` trunca el bloque contra `maxChars = maxTokens × CHARS_PER_TOKEN`
(2.000 × 4 = **8.000 caracteres**). El presupuesto cubre el **bloque completo**: wrapper,
etiqueta de datos no confiables, reglas y `<ContextOverflowWarning>`. Antes de cortar reglas
reserva para el aviso `min(1.500, 15 % de maxChars)`, acotado a `maxChars`. Si no entra el piso
fijo, devuelve un bloque XML bien formado **sin reglas**.

Cuando omite reglas, el aviso:

```text
<ContextOverflowWarning>Context truncated due to size limits. N rules omitted.
Omitted: <key1>, <key2>, … , +N. Delegate one Recall to @memory-keeper with the task topic
before delegating any other stage.</ContextOverflowWarning>
```

- **Lista hasta 40 `memory_key`** (`MAX_OMITTED_KEYS`) en el **mismo orden de inyección**; si la
  reserva o el tope dejan claves afuera, agrega `+N` con la cantidad no listada. Las claves
  listadas son siempre un prefijo del orden de inyección.
- **Conserva** el conteo, el registro por consola y la delegación de **un** Recall a
  `@memory-keeper`; **no menciona** `searchMemory`.
- **Estado actual**: la base real omite **20 reglas** de scope `project` (entran 14 de 34); el
  aviso las nombra (hasta el tope/reserva). Es presión de contenido, no una falla de integridad.
- Evidencia: `src/core/memory/engine.js` (`formatOverflowWarning`),
  `aspec/specs/memory-engine/spec.md`, `test/memory-engine.test.js`.

## Rechazo de secretos en el camino de escritura

`recordNode` inspecciona `content` y `justification` con `looksLikeSecret` **antes** de abrir la
transacción y rechaza:

- claves tipo `sk-...`, `ghp_...`, `AKIA...`;
- `authorization: bearer ...`;
- `*TOKEN/SECRET/PASSWORD=...`;
- bloques `BEGIN ... PRIVATE KEY`.

El mensaje nombra la `memory_key` y el campo (`contenido` o `justificacion`) y **nunca repite el
valor**. El rechazo es **incondicional**: no tiene la exención `runtime` de las refs.

## Promoción al archivar (`MEM-03`)

El motor no promueve nada por sí solo: la promoción es un contrato del cierre que escribe por
`recordDecision`. Evidencia: `skills/ancleto-archive/SKILL.md`, `agents/memory-keeper.md`,
`agents/orchestrator.md`, `aspec/specs/memory-engine/spec.md`.

- **Candidato**: sólo un bloque de `proposal ## Decisiones` con **`memory_key` propia y
  `Estado: aprobado`**. La forma de una línea nunca es candidata; una `rule` nunca se promueve.
- **Preflight del lote antes de la primera escritura**: claves propias y únicas, refs presentes y
  resolubles, ningún `path:` dentro de `aspec/changes/<change-name>/` y ningún candidato de
  sesión. Cualquier violación ⇒ **cero escrituras**, reporte por bloque y el change **no se
  mueve**.
- **Escritura**: una pasada de `@memory-keeper` en modo Promotion, un `recordDecision` por bloque;
  `content` de 1–3 oraciones + `refs:`. Nunca `recordRule`.
- **Cero candidatos ⇒ cero escrituras y cero delegación**.
- **Orden**: corre **después** del merge de specs de `@documenter` y **nunca en paralelo**.
- **Fallo posterior al move**: se reporta `archived, memory pending` con la `memory_key` y el
  motivo; nunca "archivado y memorizado".

## Render del bloque proactivo sin `refs:`

`buildWorkingContext` inyecta sólo `rule` activas. Por cada regla:

```text
- [<memory_key>] <prosa del content>
```

`renderRuleContent(content)` recorta desde `refs:` hasta el final del bloque. El `content`
**almacenado** queda intacto; el recorte aplica sólo a la vista proactiva y las refs no consumen
el presupuesto. Una regla sin `refs:` se renderiza completa. Evidencia:
`aspec/specs/memory-engine/spec.md`.

## Operaciones export / import / gc

- **`memory export [--out <archivo>]`** → `exportActive()`: array de activos con
  `{memory_key, type, content, justification, scope, createdAt}`. Los superseded no se incluyen.
  `sanitizePaths` reemplaza paths absolutos por `<redacted>`. Sin `--out` va a stdout.
- **`memory import <archivo>`** → `importNodes(json)`: valida el schema y **aborta el batch**
  ante una entrada inválida. Upsert por `memory_key`: inserta si no existe, supersede sólo si el
  `createdAt` del JSON es más reciente (empate/no más nuevo = no-op), y **no reactiva**
  superseded. **No aplica la validación de refs**. Tras importar, `memoryImport` invoca
  `refreshWorkingContextOnWrite` en `try/catch`.
- **`memory gc [--dry-run] [--days N]`** → `gcSuperseded({days, dryRun})`: purga superseded
  cuya **edad de supersesión** (`COALESCE(superseded_at, created_at)`) supere el umbral (default
  30 días). Antes del `DELETE` limpia el `superseded_by` de los elegibles para no violar la FK;
  después hace `VACUUM`+`REINDEX` best-effort; `--dry-run` sólo reporta. Los activos nunca se
  tocan. **`memory gc` no dispara refresh**. Detalle en «GC por edad de supersesión».
- **`memory list [--type X] [--scope X] [--all] [--json]`** y **`memory context [--scope X]
  [--out <archivo>]`** completan la superficie. `list` es read-only; `context` materializa
  `.ancleto/working-context.md` por el render único.

## Consolidación determinística (`0.18.5`)

`ancleto memory consolidate [--dry-run] [--apply] [--json]` es un wrapper fino sobre
`engine.consolidate({ dryRun = true, includeNearDuplicates = true })`. No agrega tool MCP, tabla,
columna ni migración.

- **Duplicado exacto**: mismo `type` + `content` normalizado idéntico. La normalización quita el
  bloque `refs:` (línea e items), aplica trim, colapsa whitespace, pasa a minúsculas y quita
  diacríticos. El `scope` **no** forma parte de la agrupación; un `content` sin prosa (sólo
  `refs:`) no agrupa.
- **Canónico determinístico**: (1) mayor cantidad de refs declaradas; (2) `created_at` más
  reciente; (3) scope más amplio (`project` > `feature` > `task`); (4) `content` original más
  largo; (5) `rule` antes que `decision`; (6) `memory_key` lexicográfico menor (sin locale).
- **`--apply`**: supersede a todos los no canónicos de cada grupo exacto con
  `status='superseded'` y `superseded_by=<id del canónico>`, en una única transacción. No borra
  filas, no crea nodos y no modifica el canónico.
- **Near-duplicates**: mismo `type` y `scope`, `content` normalizado distinto y Jaccard ≥ 0,60
  sobre tokens whitespace deduplicados. **Sólo se reportan**; `--apply` no los toca. El guard de
  similitud en `recordNode` y el merge semántico quedaron fuera.
- **Read-only**: el engine read-only sólo acepta `dryRun: true` y rechaza una corrida real antes
  de tocar la conexión, con el mismo patrón que `merge`. El dry-run usa esa conexión.
- **Contexto derivado**: tras `--apply`, refresca `.ancleto/working-context.md` con
  `refreshWorkingContextOnWrite`, derivando la raíz de `resolveMemoryProjectRoot(dbPath)`. Si ese
  refresh falla, la base ya está commiteada: sale ≠ 0 informando que la consolidación se aplicó,
  cuántos nodos se supersedieron y cómo regenerar el bloque.
- **Reversión**: no hay "unsupersede"; revertir exige un `memory snapshot` previo. `--apply`
  conserva `id`/`superseded_by`, por lo que el historial es reconstruible.
- **Estado observado**: dry-run sobre la base real devuelve `0` grupos exactos y `0` near-dups;
  `--apply` sería un no-op. La operación es opt-in y el default no escribe.
- **Opción aditiva `includeNearDuplicates`**: default `true` (preserva el reporte actual). Con
  `false` omite el doble loop O(n²) de near-duplicates; la definición de duplicado exacto, la
  cadena de canónico y su orden no cambian. El engine read-only reenvía la opción. La usa
  `memory curate`, que no reporta near-dups. Evidencia: `src/core/memory/engine.js:685-688`,
  `:1190`, `:1229`, `test/memory-engine.test.js`.
- Evidencia: `src/core/memory/engine.js` (`consolidate`, `compareCanonical`,
  `consolidationScopeRank`), `src/cli/index.js` (`memoryConsolidate`),
  `aspec/specs/memory-ops/spec.md`.

## Curaduría read-only (`memory curate`, CH-09)

`ancleto memory curate [--json] [--strict]` es un wrapper fino sobre
`src/core/memory/curation.js`; **no** es una tool MCP ni un sexto check de `doctor`. El change
está archivado (`2026-11-03-ch-09-curaduria-recurrente`) y todavía **no** figura en un release.
Evidencia: `src/core/memory/curation.js`, `src/cli/index.js` (`memoryCurateCmd`),
`aspec/specs/memory-ops/spec.md` (requirement `Curaduría read-only con memory curate`).

- **Composición, no duplicación**: `curateMemory(engine, { projectRoot })` recibe un engine ya
  abierto y la raíz; usa `resolveNodeRefs` para clasificar cada ref (aporta `kind` y `reason`) y
  `consolidate({ dryRun: true, includeNearDuplicates: false })` para duplicados exactos. No
  contiene SQL, parser de refs, resolvedor ni una segunda normalización.
- **Read-only estricto**: el CLI abre con `readonly: true` y `migrate: false`; no acepta
  `--rebuild`, `VACUUM`, snapshot, DDL, `PRAGMA` mutante, `INSERT`/`UPDATE`/`DELETE` ni escritura
  de `superseded_by`/`superseded_at`. La base queda byte a byte idéntica.
- **Reporte**: `status` (`ok`/`no-db`/`error`), `brokenRefs` (`memory_key`, `kind` de
  `spec`/`change`/`path`, `ref`, `reason`), `unverifiable` (`commit:`/`workitem:`, `reason` `no
  verificable`) y `exactDuplicates` (`canonical` + `superseded`). Un bloque `refs:` malformado o
  repetido se reporta con `ref: 'refs:'` o la línea ofensora, sin `kind` y `reason` `inválido
  (gramática)`.
- **Display de refs rotas**: sólo dos transformaciones — separadores `\` → `/` y quitar el sufijo
  final `:line`; no se colapsan `.`/`..` ni se resuelve nada. Resolver sigue siendo exclusivo de
  `resolveNodeRefs`.
- **Determinismo**: orden total por `memory_key` ascendente (sin `localeCompare`) y, a igual
  clave, orden de aparición de la ref; paths POSIX sin `:line`; sin timestamps ni campos
  volátiles. Los duplicados exactos se ordenan por `type` y `memory_key` del canónico.
- **Códigos de salida**: advisory por defecto —sale `0` aunque haya hallazgos—; `--strict` sale
  ≠ 0 si hay al menos una ref rota o un grupo exacto. `unverifiable` nunca afecta el exit code.
  Sin base, reporta `no-db` y sale ≠ 0, con y sin `--strict`; un error de apertura/lectura
  reporta estado distinto de `ok` con su motivo y exit ≠ 0, nunca un reporte limpio.
- **Estado observado**: `node src/cli/index.js memory curate --json` →
  `{"status":"ok","brokenRefs":[],"unverifiable":[],"exactDuplicates":[]}` sobre 129 nodos
  activos y 360 refs.
- **Deuda diferida (backlog CH-09e…CH-09h)**: (e) `exactDuplicates` no proyecta el `type` del
  grupo; (f) lectura no atómica entre `listNodes` y `consolidate`; (g) el literal `inválido
  (gramática)` está duplicado entre `doctor` y `curate`; (h) el orden total asume el índice
  parcial `UNIQUE` activo de `memory_key`.

## GC por edad de supersesión (`MEM-05b`)

`memory gc` deja de usar `created_at` como proxy: ahora mide la **antigüedad de supersesión**.
Evidencia: `src/core/memory/{database,engine}.js`, `src/cli/index.js`,
`aspec/specs/memory-ops/spec.md` (requirement
`Garbage collection de nodos superseded`).

- **Schema aditivo**: `memory_nodes` incorpora `superseded_at TEXT`. En bases nuevas se declara
  al crear la tabla; en bases existentes la migración sólo ejecuta
  `ALTER TABLE memory_nodes ADD COLUMN superseded_at TEXT` si `PRAGMA table_info` no la ve. No
  crea tablas, índices, triggers ni vistas. Una apertura concurrente que ya encuentre la columna
  considera la migración aplicada.
- **Backfill**: las filas `superseded` con `superseded_at` NULL reciben `created_at`. Se ejecuta
  sólo cuando esa apertura agregó la columna (evita un `UPDATE` con scan completo en cada
  apertura), preserva la elegibilidad histórica de `gc` y deja `NULL` en los activos. El cambio
  de semántica es forward-looking.
- **Registro del instante**: las cuatro rutas de supersesión —`recordNode`, `importNodes`,
  `merge`, `consolidate`— escriben `superseded_at` en el mismo statement que
  `status='superseded'` y `superseded_by`. Ninguna inserta un nodo sucesor sólo para registrar la
  fecha.
- **Medición**: `COALESCE(superseded_at, created_at)` con **un único cutoff calculado en JS**
  (segundos, sin milisegundos, mismo formato que SQLite), compartido por el `SELECT` y el
  `DELETE`. Un cutoff por sentencia dejaría que una fila cruce el umbral entre ambos.
- **Integridad referencial**: antes del `DELETE`, `getGcDetach` limpia el `superseded_by` de los
  nodos elegibles; un nodo retenido puede apuntar a uno elegible y el `COMMIT` fallaría por la FK
  diferida. La subquery usa el mismo cutoff.
- **Preparación lazy**: ningún statement que referencie `superseded_at` se prepara en el
  constructor del engine (`getSupersede`, `getGcSelect`, `getGcDelete`, `getGcDetach`). Así un
  engine read-only con `migrate: false` sobre una base previa sigue construyendo para
  `memory doctor`/`memory list`.
- **Dry-run**: mismo cutoff que el purge real, de modo que el conteo reportado coincide con los
  nodos efectivamente borrados. `VACUUM`/`REINDEX` son best-effort post-commit.

## Snapshot consistente con historial

`ancleto memory snapshot --out <archivo.db> [--force] [--json]` es un wrapper sobre
`snapshotDatabase`:

- **Fuente read-only, sin efectos**: no usa `openDatabase` (fija WAL y mutaría la fuente); abre
  una conexión directa read-only, sin pragmas ni migraciones. `VACUUM INTO` lee el estado
  **commiteado** (WAL incluido) y escribe un archivo nuevo.
- **Historial incluido**: copia `memory_nodes` completa (`superseded` + `superseded_by`), a
  diferencia de `memory export`.
- **Destino validado antes de tocar nada**: compara por **identidad de archivo**
  (`realpathish`/`sameFile`), no por string. Un destino existente sin `--force` es error.
- **Ruta como parámetro vinculado**: `VACUUM INTO` recibe el destino como `?`, nunca interpolado.
- **Publicación atómica best-effort**: escribe en `.<basename>.<pid>-<uuid>.tmp` en el mismo
  directorio, verifica `PRAGMA quick_check` y recién entonces reemplaza. En Windows aparta el
  destino a `<target>.bak-<uuid>` y restaura si el movimiento final falla. El temporal se limpia
  (incluidos sidecars) sin enmascarar el error original.
- **Salida**: `{ out, bytes }` o texto; falla ≠ 0 si falta `--out`, no hay memoria o el snapshot
  no se pudo producir/verificar.

Evidencia: `src/core/memory/snapshot.js`, `src/core/memory/database.js`,
`src/cli/index.js`, `aspec/specs/memory-ops/spec.md`.

## `memory doctor` estrictamente read-only

- **Modo por defecto**: `openDatabase(dbPath, { migrate: false, readonly: true })`. No ejecuta
  checkpoint, DDL ni `INSERT` sobre FTS.
- **Cinco checks con nombres estables, en orden**: `Integridad DB` (`PRAGMA quick_check`),
  `Indice FTS5`, `Reglas activas (unicidad)`, **`Refs de nodos activos`** y `Checkpoint WAL`.
- **`Indice FTS5` en tres estados**: (1) índice `memory_fts` ausente ⇒ **falla** (nunca
  `skipped`); (2) sombra `memory_fts_docsize` no consultable ⇒ **omitido** (no baja `healthy` ni
  el exit code, p. ej. `columnsize=0`); (3) compara `count(*)` de la sombra contra
  `memory_nodes`. El `count(*)` de `memory_fts` no sirve: external-content lo resuelve contra
  `memory_nodes`.
- **`Refs de nodos activos`**: lee los activos y ejecuta `inspectRefs`. Es read-only (lee
  `aspec/specs/**/spec.md`, lista `aspec/changes/**` y usa `existsSync`/`statSync`), comparte
  parser y resolución con `validateRefsForWrite` y nunca aborta ante una ref rota.
  - Cada `spec:`/`change:`/`path:` no resuelta ⇒ `ok: false`, `healthy: false`, exit ≠ 0, con
    entradas `"<memory_key>" -> <ref textual> (<motivo>)` ordenadas por `memory_key` y, a igual
    clave, por orden de aparición.
  - Motivos: `inexistente`, `ambiguo (<n> coincidencias)` e `inválido (<causa>)`.
  - `commit:`/`workitem:` no se resuelven; se excluyen de las rotas y se cuentan aparte en el
    `detail` sin rotas.
  - Se omite sólo si hay refs que verificar, no hay defecto detectable sin raíz y la raíz no se
    puede derivar. Sin refs `spec:`/`change:`/`path:` no requiere raíz.
  - **Deuda**: `inspectRefs` no captura errores de I/O y puede abortar el doctor; el resolver de
    recall sí los captura por ref. Sigue en `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` §5.2.
- **`Checkpoint WAL` read-only**: reporta el estado observable del `-wal` (existencia y bytes)
  **sin** ejecutar checkpoint; el check se marca omitido.
- **`--rebuild` es el único camino de escritura**: reconstruye FTS, corre el integrity-check
  completo y checkpointea. Vuelve a reportar los cinco checks.
- **Error path**: los cinco nombres se conservan y cada check no ejecutable se reporta como falla
  con su motivo. Con esquema no inicializado, el check de refs lleva `detail` `no verificable:
  esquema no inicializado`.
- **Advisory**: `memoryDoctorCmd` agrega `Working-context: <ok|ausente|desactualizado>` con
  `checkWorkingContextFreshness`; no altera el exit code. En el estado actual reporta
  `desactualizado`.

**Estado observado** (`node src/cli/index.js memory doctor`): integridad OK, **232 filas FTS
indexadas** (232 nodos totales), unicidad OK, **360 refs verificadas en 129 nodos activos, 0 no
resueltas**, WAL presente (4.161.232 bytes) y `Working-context: desactualizado`; **20 reglas
omitidas** por tamaño. Evidencia: `src/core/memory/doctor.js`, `src/core/memory/engine.js`,
`src/cli/index.js`, `aspec/specs/memory-ops/spec.md`.

## Merge por supersesión

`ancleto memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]` consolida
duplicados **sin crear nodos ni aceptar contenido**:

- **Validación compartida** (`validateMerge`): target obligatorio y **activo**; sources no
  vacías, sin claves vacías ni repetidas, distintas del target, **activas** y con el **mismo
  `type`**. Cualquier violación falla antes de abrir transacción.
- **Una única transacción**: `BEGIN IMMEDIATE`, un `UPDATE` por source con el statement
  `supersede`, `COMMIT`. Si algo falla, `ROLLBACK` total. Bajo lock revalida que el target siga
  activo; si una source dejó de estarlo, `changes == 0` y se revierte todo.
- **Sin schema nuevo**: el vínculo es `superseded_by`; el target no se modifica.
- **`--dry-run`**: devuelve `{ dryRun: true, target, sources, superseded }` sin abrir transacción.
  El CLI usa `createReadonlyMemoryEngine` (cuyo `merge` rechaza una corrida real).
- **Merge real**: usa `createMemoryEngine`, imprime el resultado y refresca el working-context;
  si el refresh falla, el merge ya está commiteado y sale ≠ 0 informando cómo regenerar.

Evidencia: `src/core/memory/engine.js`, `src/cli/index.js`,
`aspec/specs/memory-ops/spec.md`.

## Working-context día-cero y render compartido

- **Un único render**: `renderWorkingContextBlock(engine, projectRoot, scope)` compone topología
  + reglas y es el camino compartido por lifecycle, refresh on-write MCP/CLI y `memory context`.
  `writeWorkingContextBlock(projectRoot, block)` es el dueño único de la escritura síncrona.
- **Día-cero**: si **no** existe `.ancleto/memory.db` pero sí `.discovery-map.json`, se
  materializa `.ancleto/working-context.md` con `<ProjectTopology>` (creando `.ancleto/` si
  falta) **sin abrir el motor**. Sin topología ni reglas, el bloque es `null`.
- **Contrato del motor preservado**: `buildWorkingContext` conserva firma y default; la
  materialización día-cero vive en la capa CLI.

## Procedencia de escritura (`source`)

- `source` es runtime-owned: se resuelve desde `context.source || 'runtime'` y **nunca** desde
  `input`. Vocabulario: `mcp:ancleto-memory`, `cli:import`, `runtime` y `agent:<rol>`.
- **Exposición**: se muestra en `listNodes`/`memory list --json`, pero **no** en `searchMemory`
  ni en los JSON Schema.
- **Frontera**: no autoriza ni deniega por sí misma, pero decide si la escritura pasa por la
  validación de refs. La exención es exactamente `runtime`. No hay canal de identidad
  autenticado (MCP stdio).

## Aviso de overflow accionable

- **Consumidor**: `@orchestrator`. El `<ContextOverflowWarning>` es trigger inmediato de
  **exactamente un** Recall a `@memory-keeper` con el topic de la tarea, antes de delegar otra
  etapa; no se repite para el mismo warning.
- **Capacidades nombradas**: sólo las que el orquestador tiene; el texto **no** menciona
  `searchMemory`.
- **Contenido**: conteo de omitidas + manifiesto de hasta 40 claves + `+N` + delegación.
- **Guardas**: `test/memory-engine.test.js` aserta la mención de `@memory-keeper`/`Recall`, la
  ausencia de `searchMemory`, el presupuesto y el manifiesto; `test/content-guards.test.js` fija
  el trigger y la unicidad del Recall.
- **Protocolo canónico (resuelto en `0.18.6`)**: `AGENTS.md` → `LOCKED: memory-protocol` fija el
  contrato de `searchMemory` y el uso del aviso; `PRODUCT.md` y `templates/PRODUCT.md` sólo
  apuntan a ese bloque. Ya no queda la guía vieja de invocar `searchMemory` ante el aviso.

## Cierre del pipeline: memoria en un paso + promoción

El cierre hace **como máximo una** llamada de Automatic Record y **sólo** con candidato real; sin
candidato no se invoca Optional Draft ni se pide aprobación. **La promoción de decisiones
aprobadas está fuera de ese presupuesto**: es una operación distinta, con su propio gate. La
paralelización `@documenter` ∥ `@memory-keeper` escribe en `.ancleto/memory.db` sobre superficie
disjunta; la **promoción** corre después del merge de specs y nunca en paralelo.

## Refresh on-write en ambas superficies

El bloque se regenera tras cualquier escritura que pueda alterarlo, por el **mismo render**:

- **MCP** (`tools.js`): filtrado por `shouldRefreshWorkingContext({ node, superseded })`. Se
  dispara si (a) el nodo entrante es `rule` + scope `project`, **o** (b) hubo supersesión de
  cualquier `memory_key` (cross-type/cross-scope; el over-refresh es aceptable porque el archivo
  se lee una vez por sesión). Una escritura rechazada por refs o secretos no llega a
  `recordNode` y no dispara refresh.
- **CLI** (`refreshWorkingContextOnWrite`): **compare-based**; renderiza el bloque esperado y
  reescribe sólo si difiere (normaliza CRLF, espacios finales y salto final); no crea un archivo
  vacío; reusa la conexión. Lo invocan `memory import`, `memory merge` (real) y
  **`memory consolidate --apply`**.
- **No disparan refresh**: `export`, `list`, `doctor` (read-only), `curate` (read-only), `gc`
  (purga superseded sin alterar reglas activas), `snapshot` (copia binaria), `merge --dry-run`,
  `consolidate` en dry-run, `context --out` (destino manual) y `resolveNodeRefs` (read-only).

| Superficie | Refresca |
|---|---|
| MCP `recordRule`/`recordDecision` | sí (filtrado; sólo si pasa la validación) |
| CLI `memory import` | sí (compare-based; best-effort) |
| CLI `memory merge` (real) | sí (falla ⇒ exit ≠ 0, merge ya aplicado) |
| CLI `memory consolidate --apply` | sí (falla ⇒ exit ≠ 0, consolidación ya aplicada) |
| Lifecycle `init`/`install --project`/`upgrade` | sí |
| CLI `memory context --out` | sí (manual) |
| `export`/`list`/`doctor`/`gc`/`snapshot`/dry-runs | no |

## Chequeo de staleness del working-context

- `checkWorkingContextFreshness(engine, projectRoot, scope)` renderiza el bloque esperado y lo
  compara (normalización acotada) contra `.ancleto/working-context.md`; devuelve `ok`, `ausente`
  o `desactualizado`.
- **Read-only**: nunca escribe. Corregir es responsabilidad de `memory context --out` (manual) o
  del refresh on-write.
- **Superficie**: línea advisory en `memory doctor`; el exit code sigue midiendo la DB.

## Independencia del entorno de máquina

`.ancleto/machine-env.md` es un artefacto **separado** del working-context: no se mezcla con
`<ProjectMemoryRules>` ni con `AGENTS.md`, no se genera desde la DB y no dispara refreshes.
`src/core/machine-env.js` es su dueño exclusivo; la memoria no lo lee ni lo escribe.

## Flujo

1. `ancleto mcp` arranca `serveMemoryMcp`, abre la DB y publica 3 tools.
2. `searchMemory(query, { expand, keys, required, limit, type, scope })`: AND preciso; si no hay
   resultados, OR con prefijos. Ordena de forma total y devuelve preview por defecto (o payload
   completo con `expand`/`keys`); `required` promueve claves y falla si no entran.
3. `recordRule`/`recordDecision`: `recordNode` resuelve `source`, rechaza secretos y (si
   `source !== 'runtime'`) valida `refs:`. Luego `BEGIN IMMEDIATE`, supersede el activo con la
   misma `memory_key` e inserta el nuevo.
4. **Refresh del working-context**: (a) MCP filtrado; (b) CLI compare-based tras
   `import`/`merge`/`consolidate --apply`.
5. `buildWorkingContext`: ordena, materializa reglas + topología, trunca con aviso de omitidas.
6. **Recall con refs**: `resolveNodeRefs({ content, projectRoot })`; read-only.
7. **Cierre**: el gate de archive promueve decisiones aprobadas con `recordDecision`.
8. **Mantenimiento**: `doctor` audita o repara; **`curate`** reporta refs rotas, no verificables y
   duplicados exactos sin escribir; `snapshot` copia con historial; `merge` consolida claves
   nombradas; **`consolidate`** agrupa duplicados exactos; `export|import|gc` mueven y purgan.

## Reglas invariantes

- **Una sola activa por `memory_key`** (supersesión atómica; índice único parcial).
- **SSOT del runtime**: `source`/`confidence`/`status`/`id` fuera de los JSON Schema;
  `additionalProperties: false` y args forjados ignorados.
- **Refs obligatorias en `recordNode`**: bloque único, gramática cerrada (items indentados o no,
  `change:` sin fecha), resolución fail-closed; única exención `source === 'runtime'`.
  `importNodes` queda fuera; `inspectRefs` reutiliza parser y resolución.
- **Resolver read-only**: `resolveNodeRefs` reutiliza parser/resolvedor, no escribe, no crea
  tabla ni superficie de comando/MCP. `commit:`/`workitem:` son `verifiable: false`.
- **Orden de inyección total**: scope → anclaje → recencia → `memory_key`; el anclaje se decide
  sin I/O.
- **Recall sin degradación**: `searchMemory` devuelve preview por defecto; el consumo canónico
  usa `expand: true` (o `keys`). `required` nunca se omite en silencio: falla por límite,
  presupuesto o inexistencia/inactividad.
- **Presupuesto completo**: wrapper + etiqueta + reglas + aviso ≤ `maxTokens × CHARS_PER_TOKEN`;
  reserva `min(1.500, 15 %)`; manifiesto ≤ 40 claves + `+N`.
- **Secretos rechazados sin eco**: `content` y `justification` se inspeccionan antes de la
  transacción; el valor nunca se repite.
- **Render proactivo sólo con prosa**: `renderRuleContent` recorta `refs:` sin tocar el
  `content` almacenado.
- **FTS5** external content con `content_rowid='rowid'`, tokenizer
  `unicode61 remove_diacritics 1` y triggers INSERT/UPDATE/DELETE.
- **Scopes jerárquicos** `project < feature < task`; default `project`.
- **Solo reglas activas con scope `project`** (y jerarquía) se inyectan; las decisiones se
  recuperan reactivamente, pero el orquestador delega el Recall en `@memory-keeper`.
- **Raíz desde la DB, no desde el cwd**: `resolveMemoryProjectRoot` prioriza el primer ancestro
  con `.ancletorc`; si no, el candidato derivado de `dbPath`.
- **Read-only significa sin escritura**: `createReadonlyMemoryEngine` no migra ni toca el WAL; lo
  usan `list`, el advisory, `merge --dry-run` y `consolidate` dry-run.
- **Doctor no muta por defecto**; `--rebuild` es el único camino que escribe.
- **GC mide supersesión, no creación**: `COALESCE(superseded_at, created_at)`, cutoff único,
  detach de `superseded_by` antes del `DELETE`; los activos no se tocan.
- **Snapshot no comparte código de escritura**: fuente read-only + `VACUUM INTO` + `quick_check`
  + reemplazo con backup/restore; nunca `fs.copyFile`.
- **Merge no crea nodos ni cambia schema**: enlaza sources activas del mismo `type` al target;
  atómico y revalidado bajo lock.
- **Consolidate sólo supersede grupos exactos**: canónico determinístico, near-dups sólo reporte,
  dry-run default, sin borrado ni nodos nuevos. `includeNearDuplicates: false` omite el escaneo
  O(n²) sin cambiar la definición de duplicado exacto ni el default.
- **Curaduría read-only**: `curateMemory` compone resolver + consolidate, nunca escribe ni
  duplica parser/SQL/normalización; advisory por defecto, `--strict` opt-in, `unverifiable` no
  afecta el exit code. Reportar un duplicado no equivale a consolidarlo.
- **Export/import/gc/snapshot/merge/consolidate/curate/refs no agregan dependencias**: sólo
  `node:sqlite`, `node:fs` y resolución local de paths.
- **El aviso de overflow nombra sólo capacidades existentes**: delega un Recall a
  `@memory-keeper` y no menciona `searchMemory`.
- **Staleness advisory es no bloqueante**.
- **`machine-env` es ortogonal**: no se persiste en la DB ni se inyecta en reglas.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/memory/database.js` | Conexión (con `readonly`), PRAGMAs, migraciones (incl. `superseded_at`), FTS5. |
| `src/core/memory/engine.js` | `buildWorkingContext` (orden, presupuesto, aviso, `required`), `searchMemory` (preview/`expand`/`keys`/`required`), `recordNode`, `parseRefsBlock`/`refsBlockEnd`/`validateRefsForWrite`/`renderRuleContent`/`inspectRefs`/`resolveNodeRefs`, `formatTopologyBlock`, `exportActive`, `importNodes`, `gcSuperseded` (+ `getGcDetach`), `validateMerge`/`merge`, `consolidate` (con `includeNearDuplicates`), `sanitizePaths`. |
| `src/core/memory/curation.js` | `curateMemory`: composición read-only de `resolveNodeRefs` + `consolidate({ dryRun: true, includeNearDuplicates: false })`; reporte `{ status, brokenRefs, unverifiable, exactDuplicates }` en orden total. |
| `src/core/memory/snapshot.js` | `snapshotDatabase`, `vacuumInto`, `verifySnapshot`, `replaceDestination`, `realpathish`/`sameFile`. |
| `src/core/memory/doctor.js` | `memoryDoctor` read-only, `observeWal`, cinco checks, rebuild explícito. |
| `src/core/memory/working-context.js` | Render único, persistencia, refresh MCP/CLI, frescura, raíz, día-cero. |
| `src/core/memory/tools.js` | Handlers, schemas (incl. `expand`/`keys`/`required`), refresh on-write MCP. |
| `src/core/memory/mcp-server.js` | Transporte MCP stdio; `source: 'mcp:ancleto-memory'` y `projectRoot`. |
| `src/cli/index.js` | `memoryExport`, `memoryImport`, `memoryGc`, `memorySnapshot`, `memoryMerge`, `memoryConsolidate`, `memoryCurateCmd`, `memoryContext`, `memoryListCmd`, `memoryDoctorCmd`, `memoryCmd`. |
| `skills/ancleto-archive/SKILL.md` | Gate de promoción: preflight, cero candidatos ⇒ cero escrituras. |
| `agents/memory-keeper.md` | Modo Recall con `query` + `expand: true`; Modo Promotion: un `recordDecision` por bloque. |
| `agents/orchestrator.md` | Consumidor del overflow, presupuesto de Automatic Record y orden de promoción. |
| `aspec/specs/memory-ops/spec.md` | Contrato de export/import/gc por supersesión, snapshot, doctor read-only, `--rebuild`, merge, **consolidate**, **curaduría read-only (`memory curate`)**, harness golden y diagnóstico de refs. |
| `aspec/specs/memory-engine/spec.md` | Contrato de refs, promoción, día-cero, refresh, staleness, **orden de inyección**, **presupuesto/aviso**, **recall task-aware**, `resolveNodeRefs` y render sin `refs:`. |
| `aspec/changes/archive/2026-11-03-ch-09-curaduria-recurrente/` | `memory curate` (archivado; aún sin release). |
| `aspec/changes/archive/2026-11-02-mem-05-recall-task-aware/` | Recall task-aware: preview/`expand`/`keys`/`required` (`0.18.6`). |
| `aspec/changes/archive/2026-11-02-mem-05a-searchmemory-docs-contract/` | Protocolo canónico en `AGENTS.md` y puntero desde `PRODUCT.md`. |
| `aspec/changes/archive/2026-11-02-mem-05b-gc-superseded-age/` | GC por edad de supersesión (`superseded_at`). |
| `aspec/changes/archive/2026-11-02-mem-04b-resolver-referencias-navegables/` | MEM-04b (publicado en `0.18.3`). |
| `aspec/changes/archive/2026-11-02-memory-ranking-y-omisiones-visibles/` | Orden por anclaje, presupuesto y manifiesto (publicado en `0.18.4`). |
| `aspec/changes/archive/2026-11-02-memory-consolidacion-autonoma/` | `memory consolidate` (publicado en `0.18.5`). |
| `aspec/changes/archive/2026-10-31-mem-04-doctor-referencias-no-resueltas/` | Quinto check y gramática de refs. |
| `aspec/changes/archive/2026-10-30-mem-03-promocion-decisiones-refs/` | Refs obligatorias y promoción al archivar. |
| `DESIGN-memory-engine-v0.2.0.md` | Diseño congelado del motor. |
| `test/memory-engine.test.js`, `test/curation.test.js`, `test/mcp.test.js`, `test/working-context.test.js`, `test/memory-pr1-contract.test.js`, `test/memory-fixtures.test.js`, `test/fixtures/memory/` | Suite del motor, curaduría, MCP, working-context, PR-1, golden y resolver. |
