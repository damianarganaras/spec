# Tasks: MEM-05 — Recall task-aware

> Sin `design.md`. Sin Work Item: Azure DevOps está deshabilitado en este repositorio.
>
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`, tests
> `npm test`; para pasos acotados, `node --test` con rutas explícitas (nunca sin acotar).
> Format: `not-configured`. Typecheck: no aplica.
>
> Paths autorizados: `src/core/memory/engine.js`, `src/core/memory/tools.js`,
> `test/memory-engine.test.js`, `test/memory-fixtures.test.js`, `test/working-context.test.js`
> (sólo si un assert depende del recorte), `skills/ancleto-recall/SKILL.md`, su mirror
> `.opencode/skills/ancleto-recall/SKILL.md` y este directorio de change.

## Fase 1 — Ranking puro de recall

- [x] T1.1 Reutilizar `declaresAnchor` (`src/core/memory/engine.js:276-280`) como criterio de
      "match de ref": confirmar que decide sólo parseando el bloque `refs:` y que no resuelve refs
      ni hace I/O. No agregar un segundo parser.
- [x] T1.2 Agregar en `engine.js` un comparador puro de recall que use `SCOPE_RANK`
      (`:17`) y reciba el score `bm25` como argumento. Criterios: requerido, anclaje declarado,
      `SCOPE_RANK`, `bm25` ascendente, `memory_key` ascendente. Sin DB ni filesystem dentro del
      comparador.
- [x] T1.3 En `searchMemory` (`engine.js:683`), quitar `n.rowid` de ambos `ORDER BY` (`:694-695`).
      Obtener las coincidencias de cada pass, aplicar el comparador y recién después recortar a
      `limit`. Conservar la semántica de pass 1 (AND) y pass 2 (OR-prefijos) y el filtro `type`.
- [x] T1.4 Resolver `required` en `searchMemory`: buscar por `memory_key` entre los nodos activos,
      validar el filtro `type` y promover las keys al frente en el orden declarado, aunque el match
      FTS no las incluya. Si una key no existe, está inactiva o no cumple el `type`, lanzar un error
      que la nombre. Sin términos FTS y con `required`, devolver sólo las requeridas.
- [x] T1.5 Fijar el `limit` default en 5 y conservar el clamp `[1, 50]` (`:689`). No cambiar la
      precedencia de pass 1 sobre pass 2.

## Fase 2 — Preview, expand y schema de la tool

- [x] T2.1 Implementar la proyección de preview en `engine.js`: colapsar el `content` a una línea,
      recortar a 239 caracteres más `…` cuando exceda, y devolver `preview` con
      `content_truncated`. El modo preview no debe incluir `content` ni `justification`.
- [x] T2.2 Implementar `expand: true`: devolver exactamente los seis campos heredados
      (`memory_key`, `type`, `scope`, `content`, `justification`, `created_at`) con el `content`
      completo, sin `preview` ni `content_truncated`.
- [x] T2.3 Implementar `keys`: expandir sólo las `memory_key` presentes en la página devuelta y
      conservar el preview en el resto. Una key pedida ausente de la página debe lanzar un error
      que la nombre. Si llegan `expand: true` y `keys`, `expand` prevalece.
- [x] T2.4 Actualizar `SEARCH_SCHEMA` en `src/core/memory/tools.js:12-21`: agregar `expand`
      (boolean), `keys` (array de string) y `required` (array de string); actualizar la descripción
      de `limit` al default 5. Conservar `additionalProperties: false` y `required: ['query']`.
      Ajustar la descripción de la tool para mencionar preview y expansión.
- [x] T2.5 Verificar que el handler `searchMemory: (args) => engine.searchMemory(args)`
      (`tools.js:80`) sigue pasando los argumentos nuevos sin cambios adicionales.

## Fase 3 — `required` en `buildWorkingContext`

- [x] T3.1 Extender la firma a `buildWorkingContext(scope, maxTokens = MAX_TOKENS, cwd =
      process.cwd(), { required = [] } = {})` (`engine.js:629`). Validar que `required` sea un array
      de strings no vacíos; no persistirlo ni agregarlo a ninguna consulta de escritura.
- [x] T3.2 Resolver las keys requeridas contra las reglas activas del scope inyectado **antes** del
      early return por `rows.length === 0` (`:639`) y antes del piso estructural (`:657`). Una key
      inexistente, inactiva o fuera del scope inyectado debe lanzar un error que la nombre.
- [x] T3.3 Inyectar las requeridas primero, en el orden declarado. Medirlas contra el mismo techo
      que la inclusión normal (`maxChars` menos wrapper y reserva del aviso, `:661-666`). Si una
      requerida no entra, lanzar un error con la `memory_key` y las rutas repo-relativas que
      devuelve `resolveNodeRefs({ content, projectRoot: cwd })`; si no hay refs resolubles, indicar
      `sin refs resolubles`. No devolver bloque parcial.
- [x] T3.4 Excluir las requeridas del conteo de omitidas y de las claves del
      `<ContextOverflowWarning>` (`:671-678`).
- [x] T3.5 Confirmar que dos corridas con el mismo estado, `maxTokens` y `required` producen el
      mismo bloque byte a byte.

## Fase 4 — Actualización de asserts existentes

- [x] T4.1 Ajustar `test/memory-engine.test.js:129` para pedir `expand: true` (o afirmar el
      preview) y conservar la intención original sobre el contenido vigente.
- [x] T4.2 Ajustar `test/memory-engine.test.js:187`: afirmar la forma heredada de seis campos con
      `expand: true` y agregar una aserción separada de la forma de preview.
- [x] T4.3 Ajustar `test/memory-engine.test.js:194` para comprobar la ausencia de `source` con
      `expand: true`.
- [x] T4.4 Reescribir el `describe` de `memory-search-order-tiebreak`
      (`test/memory-engine.test.js:227-...`): el empate se resuelve por `memory_key` ascendente, no
      por `rowid`. Insertar los nodos en orden inverso y cubrir pass 1 y pass 2. Actualizar el
      comentario del bloque.
- [x] T4.5 Ajustar `test/working-context.test.js:569` para usar `expand: true` al comparar
      `content`.
- [x] T4.6 Buscar en los tres archivos de test autorizados otras aserciones que enumeren la forma
      de `searchMemory` (`.content`, `Object.keys`, `deepEqual`) y actualizarlas de forma mínima,
      sin cambiar su intención.

## Fase 5 — Tests T07 y T28

- [x] T5.1 T07 (recuperación): una regla declarada en `required` que de otro modo quedaría fuera
      por presupuesto se inyecta completa y primera, y no aparece en el aviso ni en el conteo.
- [x] T5.2 T07 (bloqueo explícito): una requerida que no entra en el presupuesto lanza un error
      que incluye su `memory_key` y la ruta repo-relativa de sus refs; la llamada no devuelve
      bloque parcial. T07 debe quedar cubierto como "se recupera o falla", nunca como corte
      silencioso.
- [x] T5.3 T07 (existencia y scope): una key requerida inexistente, inactiva o fuera del scope
      inyectado lanza un error que la nombra.
- [x] T5.4 T07 (preview): un `content` mayor a 240 caracteres devuelve `content_truncated: true`,
      `preview` de como máximo 240 caracteres y ningún `content`.
- [x] T5.5 T28 (bloque): con un `maxTokens` que cubre el piso, la longitud total del bloque
      `<ProjectMemoryRules>`, incluido wrapper y `<ContextOverflowWarning>`, es menor o igual a
      `maxTokens × 4`.
- [x] T5.6 T28 (cap del campo no aplicado al bloque): seis reglas que superan 1.500 bytes pero
      caben en 8.000 caracteres se incluyen todas; el bloque no aplica el tope ≤5/1.500 B del campo
      destilado.
- [x] T5.7 T28 (separación): correr `node --test test/content-guards.test.js` sin modificarlo y
      registrar que el contrato del campo destilado sigue vigente. No agregar un test que sume o
      convierta ambos presupuestos y no falsar un "21/21".
- [x] T5.8 Invariantes negativas: verificar por diff que no cambian `MAX_TOKENS`,
      `CHARS_PER_TOKEN`, `MAX_OMITTED_KEYS` ni el tope ≤5/1.500 B, y que no se agregan reglas ni
      consolidación. Registrar la verificación en el resumen de cierre.

## Fase 6 — Regresión golden

- [x] T6.1 En `test/memory-fixtures.test.js:107-111`, hacer que el modo `refs` obtenga el
      `content` con `expand: true`. Los modos `topK` y `abstain` no cambian.
- [x] T6.2 Correr `node --test test/memory-fixtures.test.js` y confirmar que M01, M04, M05, M06 y
      M07 pasan, que siguen siendo las cinco activas y que la allowlist de diferidas
      (`M02`, `M03`, `M08`, `M09`, `M10`) no cambia.
- [x] T6.3 Si el orden nuevo mueve el top-k y un golden deja de cumplir su `expected`, detenerse y
      reportar: no editar las keys esperadas, no cambiar `status` ni `blocker` y no des-diferir
      ninguna entrada.

## Fase 7 — Validación declarada

- [x] T7.1 Correr `npm run lint`.
- [x] T7.2 Correr los tests acotados con rutas explícitas:
      `node --test test/memory-engine.test.js test/memory-fixtures.test.js test/working-context.test.js`.
- [x] T7.3 Correr la suite declarada completa: `npm test`.
- [x] T7.4 Registrar en el cierre: format `not-configured`, typecheck no aplica, y cualquier
      validación omitida por no estar declarada.

## Fase 8 — Cierre de correcciones (auditoría adversarial)

- [x] T8.1 Reemplazar en `previewNode` el colapso de whitespace introducido en T2.1 por un prefijo
      literal: `content.slice(0, 239) + '…'` cuando `content.length > 240`, o `content` si no;
      `content_truncated = content.length > 240`. Quitar el `replace(/\s+/g, ' ')` y el `trim()`.
- [x] T8.2 Agregar en `searchMemory` el guard `required.length > lim`: fallar nombrando las
      `memory_key` que no entran, sin recortar la lista ni elevar el `limit`.
- [x] T8.3 Agregar un fixture mutation-sensitive del guard de segunda pasada: un corpus en el que
      ejecutar la pass 2 sobre un hit de la pass 1 cambie el resultado; mutar el guard debe hacer
      fallar el test.
- [x] T8.4 Reemplazar asserts vacuas: verificar `required` contra `PRAGMA table_info` (no sólo la
      ausencia del campo en la lectura), comprobar el fragmento del topic en el aviso (no sólo su
      longitud) y usar un competidor con scope `task` + ancla para el escenario de orden.
- [x] T8.5 Verificar el MODIFIED de `Render del bloque proactivo sin el bloque refs:` en el delta y
      que `searchMemory` con `expand: true` devuelva el `content` con refs byte a byte.
- [x] T8.6 Corregir `skills/ancleto-recall/SKILL.md` y regenerar su mirror
      `.opencode/skills/ancleto-recall/SKILL.md` para reflejar el contrato nuevo (default 5, preview
      por defecto), sin tocar el texto no afectado.

> La verificación formal y el Validation Ledger pertenecen a `@tester`; el ledger quedó cerrado.
