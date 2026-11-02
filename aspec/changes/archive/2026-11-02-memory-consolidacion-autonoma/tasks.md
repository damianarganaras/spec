# Tasks: Consolidación determinística y reversible de la memoria

> Los tests quedan separados de la implementación; cada fase es verificable por sí sola.

## Fase 1 — Operación `consolidate` en el engine

- [x] En `src/core/memory/engine.js`, agregar la normalización de `content`: quitar el bloque
      `refs:`, trim, colapsar whitespace, minúsculas y quitar diacríticos.
- [x] Implementar la agrupación de duplicados exactos sobre nodos activos por `type` +
      `content` normalizado, sin cruzar `type` (el `scope` sí puede diferir), usando una
      lectura que incluya `id`, `memory_key`, `type`, `scope`, `content` y `created_at`.
- [x] Excluir del agrupamiento un `content` cuya prosa normalizada queda vacía (sólo bloque
      `refs:`), para no colapsar provenance distinta.
- [x] Implementar el selector de canónico con el orden refs > `created_at` > scope > longitud
      de `content` > `rule` antes que `decision` > `memory_key` sin locale.
- [x] Implementar el cálculo de near-duplicates (mismo `type` y `scope`, prosa normalizada no
      vacía y distinta, Jaccard ≥ 0,60 sobre tokens deduplicados) como dato sólo de reporte.
- [x] Implementar `consolidate({ dryRun = true } = {})`: en dry-run devolver el plan sin abrir
      transacción ni escribir; con `dryRun: false`, superseder en una sola transacción los no
      canónicos de cada grupo exacto, revalidando que sigan activos y haciendo rollback total
      ante cualquier desvío.
- [x] Ordenar el reporte de forma total y determinística (grupos por `type` del canónico y
      luego por su `memory_key`; near-dups por similitud y luego por claves) y exponer
      `consolidate` en el objeto que devuelve el engine.

## Fase 2 — Subcomando `ancleto memory consolidate`

- [x] En `src/cli/index.js`, agregar `memoryConsolidate(flags)` y enrutarlo desde `memoryCmd`
      junto a `context`, `list`, `doctor`, `export`, `import`, `gc`, `snapshot` y `merge`.
- [x] Parsear `--apply` (default dry-run) y `--json`; sin `--apply`, abrir con
      `createReadonlyMemoryEngine`; con `--apply`, abrir con `createMemoryEngine`.
- [x] Imprimir el reporte legible de grupos exactos (canónico, miembros, refs y acción) y la
      sección informativa de near-duplicates; con `--json`, imprimir el objeto estructurado.
- [x] Tras `--apply`, refrescar el bloque derivado con `refreshWorkingContextOnWrite` y
      `resolveMemoryProjectRoot(dbPath)`; si el refresco falla, reportar "aplicado, bloque
      desactualizado" y el comando de regeneración, sin revertir la base.
- [x] Agregar la línea de uso de `consolidate` al usage de la familia `memory`.

## Fase 3 — Restricción read-only del engine

- [x] En `buildReadonlyEngine` (`src/core/memory/engine.js`), envolver `consolidate` para
      aceptar sólo `dryRun: true` y lanzar antes de tocar la conexión cuando `dryRun` sea
      `false`, con el mismo patrón que `merge`.

## Fase 4 — Tests

- [x] En `test/memory-engine.test.js`, cubrir que el dry-run no cambia `status` ni
      `superseded_by` y que dos corridas producen el mismo reporte.
- [x] Cubrir un grupo de tres exactos del mismo `type`: canónico por mayor cantidad de refs;
      desempate por `created_at` y, a igualdad, por `memory_key`.
- [x] Cubrir que el mismo texto en `rule` y `decision` no se agrupa.
- [x] Cubrir `--apply`: los no canónicos quedan `superseded` con el `superseded_by` correcto y
      el canónico conserva su contenido.
- [x] Cubrir un par near-duplicate ≥ 0,60: aparece en el reporte y `--apply` no lo toca.
- [x] Cubrir que `createReadonlyMemoryEngine(...).consolidate({ dryRun: false })` lanza.
- [x] Cubrir que el conjunto de objetos de `sqlite_master` es idéntico antes y después de
      `--apply`.
- [x] En `test/cli.test.js`, cubrir que `ancleto memory consolidate` sin `--apply` no modifica
      la base, que `--json` es parseable, que `--apply` supersede y que el bloque de contexto
      se refresca bajo el directorio de la base en una fixture de `tmpdir` sin escribir en el
      `.ancleto/` del repositorio.

## Fase 5 — Validación declarada

- [x] Ejecutar `npm run lint`.
- [x] Ejecutar `npm test` o, para validación acotada, `node --test test/memory-engine.test.js
      test/cli.test.js` con rutas explícitas.
- [x] Registrar que Format es `not-configured` y Typecheck no aplica (paquete JavaScript sin
      `tsconfig.json`), según `PRODUCT.md` → `## Project Commands`.
- [x] Confirmar que no se modificaron `src/core/memory/doctor.js`, `inspectRefs`,
      `resolveNodeRefs`, `buildWorkingContext`, `.opencode/**`, `agents/**` ni `skills/**`.

## Follow-up declarado (fuera de este change)

- [ ] Wiring automático de `memory consolidate --apply` al archivar: una línea en la skill
      `ancleto-archive` o en `agents/memory-keeper.md`, en un change posterior.
