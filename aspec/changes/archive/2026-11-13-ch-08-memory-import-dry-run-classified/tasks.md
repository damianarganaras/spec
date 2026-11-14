# Tasks: Dry-run clasificado de `memory import`

> Change funcional. Sin `design.md`: no hay decisión de arquitectura que lo exija.
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test` (`node --test "test/*.test.js"`); para pasos acotados, rutas explícitas.
> Format check `not-configured`; typecheck no aplica (JavaScript ESM, sin `tsconfig.json`).

## File-set de implementación (autorizado)

- `src/core/memory/engine.js` — función de decisión compartida y método de clasificación read-only;
  `importNodes` pasa a consumir la función sin cambiar su semántica.
- `src/cli/index.js` — sólo `memoryImport`, `MEMORY_USAGE` y el texto de ayuda de `memory`.
- `test/memory-engine.test.js` — tests de engine del dry-run.
- `test/cli.test.js` — tests del flag, la salida y el texto de ayuda.
- `test/affected-tests.json` — sólo si el relevamiento de 6.1 lo requiere.
- `aspec/specs/memory-ops/spec.md` — sólo en el archive, por merge del delta.

Fuera del file-set: `src/core/memory/database.js` y el esquema (no se agrega tombstone ni
`deleted_at`), la semántica de `importNodes` y su resumen, `recordNode`, `merge`, `consolidate`,
`gcSuperseded`, el refresh del working-context, `.ancleto/memory.db` real y `agents/spec-writer.md`.

## Fase 1 — Decisión compartida en el engine

- [ ] 1.1 Extraer de `importNodes` (`src/core/memory/engine.js:1030-1064`) la decisión por entrada a una única función que reciba el nodo activo o `null`, la existencia de historial `superseded` y la entrada, y devuelva `{ classification, action }` con los buckets `nuevo`, `identico`, `divergente`, `tombstone` y las acciones `insert`, `supersede`, `skip`.
- [ ] 1.2 Implementar la identidad de payload sobre `type`, `scope`, `content` y `justification`, con `content` comparado en la forma saneada por el mismo saneador que usa `exportActive` (`:32-37`, `:993-1002`); `createdAt` queda fuera de la identidad.
- [ ] 1.3 Hacer que `importNodes` consuma esa función sin cambiar su comportamiento, su resumen `{ inserted, updated, skipped }`, su validación de esquema previa ni su transacción.
- [ ] 1.4 Exponer en el engine un método de clasificación read-only que reciba el archivo, valide el esquema con la misma validación de `importNodes` y recorra las entradas en orden manteniendo estado simulado en memoria por `memory_key` (activo y existencia de historial); sin llamar `runImmediateTransaction`, `recordNode`, `importNodes`, `gc` ni checkpoint.
- [ ] 1.5 Verificar que el método está disponible en la superficie de `createReadonlyMemoryEngine` (`:670-690`) y que sólo lee el nodo activo y el conteo `superseded` de la key.

## Fase 2 — Handler `memory import --dry-run`

- [ ] 2.1 Parsear `--dry-run` y `--json` en `memoryImport` (`src/cli/index.js:2858-2892`) antes de resolver el archivo, para que `--dry-run` no se interprete como nombre de archivo.
- [ ] 2.2 En modo dry-run, verificar la existencia de la base antes de abrir: si no existe, reportar `databasePresent: false`, clasificar todo como `nuevo`/`insert` y no crear el archivo; si existe, abrir con `createReadonlyMemoryEngine` (`migrate: false`).
- [ ] 2.3 Emitir el resumen `{ nuevo, identico, divergente, tombstone }` y las entradas `{ memory_key, classification, action }` en el orden del archivo; con `--json`, exactamente `{ dryRun: true, databasePresent, summary, entries }`.
- [ ] 2.4 Implementar la salida humana: resumen y una línea por entrada con acción `skip` y clasificación `divergente` o `tombstone`.
- [ ] 2.5 Fijar los códigos de salida: 0 en éxito; 1 sólo por archivo faltante o inexistente, JSON no parseable o entrada que no cumple el esquema de `importNodes`, sin clasificación parcial.
- [ ] 2.6 Asegurar que el dry-run no ejecuta el refresh del working-context ni ninguna escritura; el camino sin `--dry-run` conserva el comportamiento actual.
- [ ] 2.7 Actualizar `MEMORY_USAGE` (`:134`) y el texto de ayuda de `memory` (`:108`) para incluir `--dry-run` y `--json` en `memory import`.

## Fase 3 — Tests de equivalencia y de solo-lectura

- [ ] 3.1 Test de equivalencia dry-run↔import real: mismo estado inicial y mismo archivo en dos fixtures; los conteos de `insert`, `supersede` y `skip` coinciden con `inserted`, `updated` y `skipped` de `importNodes`.
- [ ] 3.2 Test de equivalencia por entrada: la acción predicha de cada entrada coincide con el efecto observable del import real (nodo insertado, previo superseded + nuevo activo, sin cambio).
- [ ] 3.3 Test de solo-lectura: bytes de `.db` idénticos antes y después, ningún nodo activo/superseded cambia y `.ancleto/working-context.md` no se refresca ni cambia; no aseverar ausencia de `-wal`/`-shm`.
- [ ] 3.4 Test de base ausente: `databasePresent: false`, todo `nuevo`/`insert`, el archivo de base no se crea y el exit code es 0.
- [ ] 3.5 Test de evaluación repetida: el dry-run ejecutado después de un import real predice `skip` para las entradas ya aplicadas, sin escribir.

## Fase 4 — Tests de buckets, determinismo y casos medidos

- [ ] 4.1 Test de `nuevo` sobre base vacía: clasificación `nuevo`, acción `insert`.
- [ ] 4.2 Test de `identico`: con `createdAt` más nuevo → `supersede`; con `createdAt` más viejo o igual → `skip`.
- [ ] 4.3 Test de `divergente`: con `createdAt` más nuevo → `supersede`; con más viejo o igual → `skip`; el caso de `createdAt` igual aparece en la salida humana.
- [ ] 4.4 Test de `tombstone`: sólo historial `superseded`, sin activo → clasificación `tombstone`, acción `skip`, ningún nodo reactivado.
- [ ] 4.5 Test de orden y determinismo: las entradas siguen el orden del archivo y dos corridas sobre el mismo estado producen salida idéntica.
- [ ] 4.6 Test de duplicados secuenciales: dos entradas de la misma key, la segunda divergente y más nueva sobre base vacía → `nuevo`/`insert` y `divergente`/`supersede`; el import real reporta `inserted: 1`, `updated: 1`.
- [ ] 4.7 Test de path absoluto: nodo activo con `C:\...` y entrada con el path redactado que produce `exportActive` → `identico`, nunca `divergente`.
- [ ] 4.8 Test de la forma JSON y de la salida humana, con todos los escenarios del delta cubiertos por al menos una aserción cada uno.

## Fase 5 — Textos de uso y ayuda

- [ ] 5.1 Actualizar `test/cli.test.js:9468-9487` con la línea nueva de `MEMORY_USAGE` para `memory import`.
- [ ] 5.2 Verificar si algún guard de ayuda de `memory` pinea el texto de `src/cli/index.js:108` y actualizarlo en el mismo paso.
- [ ] 5.3 Ejecutar `node --test "test/cli.test.js"` con ruta explícita y confirmar que los guards de texto quedan verdes.

## Fase 6 — Manifiesto de selección de tests

- [ ] 6.1 Relevar si algún test nuevo o modificado de `test/memory-engine.test.js` o `test/cli.test.js` tiene acoplamiento no-import (spawn, lectura de texto o DB directa) que el grafo de imports no vea.
- [ ] 6.2 Declarar el coupling en `test/affected-tests.json` sólo si 6.1 lo requiere; si ambos archivos ya están cubiertos por couplings existentes o por arista real de import, registrar la omisión y no modificar el manifiesto.

## Fase 7 — Validación y archive

- [ ] 7.1 Ejecutar `npm run lint` (declarado en `PRODUCT.md` → `## Project Commands`).
- [ ] 7.2 Ejecutar `node --test "test/memory-engine.test.js" "test/cli.test.js"` con rutas explícitas.
- [ ] 7.3 Ejecutar `npm test` y confirmar la suite completa en verde.
- [ ] 7.4 Verificar el delta de `memory-ops` contra la implementación: cuatro buckets, predicción exacta, cero escrituras, `databasePresent: false`, duplicados secuenciales y round-trip con path absoluto.
- [ ] 7.5 Archivar el change para promover el delta a `aspec/specs/memory-ops/spec.md`; el archive mueve el directorio a `aspec/changes/archive/YYYY-MM-DD-<slug>/` y ninguna ruta de change queda hardcodeada en los artefactos.
