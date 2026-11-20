# Proposal: Import de memoria — `scope` como string no vacío

## Contexto y problema

`validateImportEntries` (`src/core/memory/engine.js:46-64`) exige que `scope` esté presente
(`:48`, `:52-56`) y valida el dominio de `type` (`:57-59`) y el formato de `createdAt` (`:60-62`),
pero nunca valida el tipo de `scope`. El valor entra crudo al resto del camino:

- `decideImportEntry` compara `active.scope === entry.scope` sin normalizar (`engine.js:76`).
- `simulateImportClassification` copia `entry.scope` al nodo simulado (`engine.js:112-118`), de modo
  que el dry-run clasifica sobre el valor crudo de la entrada.
- `importNodes` bindea `entry.scope` en el `INSERT` (`engine.js:1325`, `:1332`).
- La columna es `scope TEXT NOT NULL DEFAULT 'project'` (`src/core/memory/database.js:10`), con
  afinidad TEXT de SQLite.

La divergencia medida (backlog, `aspec/backlog.md:545`) tiene dos formas:

1. **`scope` numérico.** El dry-run compara el número crudo contra el string activo; la escritura
   lo coerciona a TEXT. Un dry-run posterior ve `divergente` sobre un nodo que en realidad es
   idéntico, y el `scope` persistido dejó de ser el valor del archivo.
2. **`scope` objeto o array.** El dry-run predice `insert` (el payload no matchea ningún activo),
   pero `importNodes` aborta al bindear el valor. La predicción del dry-run y el efecto del write
   discrepan, que es exactamente lo que el contrato de paridad prohíbe.

El validador es compartido por `importNodes` y por `classifyImport`/dry-run (`engine.js:1313`,
`:1351`, y el camino sin base en `src/cli/index.js:3087`). Endurecerlo ahí elimina la divergencia
en los dos caminos con una sola regla, sin tocar la política de upsert.

## Requisito citado

- `spec:memory-ops#Import de nodos desde JSON con upsert por memory_key`
  (`aspec/specs/memory-ops/spec.md:52`).

## Intención

`scope` SHALL ser un string con `trim()` no vacío en toda entrada de import. Un valor numérico,
booleano, objeto, array o compuesto sólo por espacios SHALL rechazar el archivo entero antes de
escribir o clasificar nada, con un mensaje que nombre `entry[i].scope`. La regla SHALL aplicarse por
igual en `importNodes` y en el dry-run porque vive en la validación compartida.

## Alcance

In scope:

- `src/core/memory/engine.js` — `validateImportEntries`: exigir `scope` string con `trim()` no
  vacío, además de los campos y reglas actuales; mensaje que nombre `entry[i].scope`.
- `test/memory-engine.test.js` y `test/cli.test.js` — cobertura de `scope` numérico, objeto, array,
  booleano, `null`, sólo espacios y string arbitrario; paridad dry-run/write.
- `aspec/changes/memory-import-scope-string/specs/memory-ops/spec.md` — delta MODIFIED.
- `aspec/changes/memory-import-scope-string/specs/memory-engine/spec.md` — delta MODIFIED que acota
  la cláusula «`importNodes` NO SHALL modificarse».

Out of scope (explícito):

- Cerrar el vocabulario de `scope` a `{project, feature, task}`. `recordNode` admite strings
  arbitrarios y este change no cambia ese contrato; `scope` sigue siendo un string libre no vacío.
- Cambios de schema, afinidad, índices, columnas, CHECKs, migraciones o formato persistido.
- Cambiar `decideImportEntry`, la semántica last-writer-wins, la identidad del payload o la
  comparación de `content`/`justification`.
- Coercer, sanear o normalizar un `scope` no-string: se rechaza, no se convierte.
- MEM-01, JEV/Lucas y cualquier trabajo de release/versionado.
- Reformatear el error del camino de escritura del CLI. `memoryImport` no tiene `catch`
  (`src/cli/index.js:3043`); el dry-run envuelve el error como `import invalido`
  (`:3077-3093`). El mensaje de la validación es el mismo en ambos caminos; la presentación del
  write no se toca.

## Evaluación de deltas

**Requirement `Import con dry-run clasificado por memory_key` (`memory-ops:1592-1651`): sin
MODIFIED.** Su cuerpo no enumera el esquema: delega en «una entrada no satisfaga el esquema que
`importNodes` exige» (`:1648-1649`) y afirma paridad de acción y contadores (`:1696-1702`). Ambas
cosas se conservan: la regla nueva entra por el validador compartido, un archivo inválido sigue
saliendo con código 1 sin clasificación parcial, y la paridad dry-run/write se refuerza. No hay
texto que actualizar; reescribirlo solo agregaría riesgo de pérdida.

**Requirement `Idempotencia de reescritura idéntica en recordNode` (`memory-engine:971-1042`): sí
necesita MODIFIED.** Su cuerpo dice literalmente «`importNodes` NO SHALL modificarse» (`:990`).
Tras este change, `importNodes` sigue sin adoptar la identidad de `recordNode` y conserva
last-writer-wins, pero su validación de entrada sí cambia. Dejar la cláusula intacta produciría dos
requirements contradictorios. El delta la acota: la prohibición cubre la semántica de upsert y el
shape persistido, no el endurecimiento de la validación de campos, que pasa a regirse por el
requirement de import de `memory-ops`. El escenario «La idempotencia no altera importNodes»
(`:1037-1042`) se reescribe junto con el cuerpo completo y los demás escenarios, como exige el
merge de MODIFIED.

El escenario «El import conserva su semántica» (`memory-engine:746-750`) pertenece al requirement
de refs y no se toca: afirma que el import no aplica la validación de refs, que es una regla sobre
`content`, no sobre el esquema de entrada. La validación de `scope` no contradice esa cláusula.

## Riesgos

- **Archivos viejos con `scope` no-string pasan a fallar.** Un export que hoy se escribe con
  `scope: 42` (coercido a `'42'`) ya no importa. Es el comportamiento buscado, pero es un cambio de
  contrato de entrada: debe documentarse en el CHANGELOG/release notes y detectarse con el dry-run
  antes de escribir.
- **Fixtures y seeds con `scope` no-string.** Cualquier fixture de test o archivo de ejemplo que use
  un `scope` no-string romperá el import; hay que auditarlos en implementación.
- **`scope: null` conserva el mensaje previo.** El chequeo de campos obligatorios corre primero y
  responde `falta campo obligatorio "scope"`; el mensaje nuevo `entry[i].scope` aplica a valores
  presentes de tipo distinto o a strings vacíos por `trim()`. La diferencia queda documentada en el
  requirement y cubierta por tests separados.
- **Presentación del error en el write.** El camino de escritura puede exponer el error como
  excepción no capturada (stack) en lugar de una línea; el mensaje nombra el campo igual. Fuera de
  alcance corregir la presentación.
- **Sin cambio de schema.** La afinidad TEXT sigue existiendo; la garantía es que nunca recibe un
  no-string desde el import.

## Validaciones declaradas

- Lint: `npm run lint`.
- Tests: `npm test`; para pasos acotados, rutas explícitas (`node --test test/memory-engine.test.js
  test/cli.test.js`), nunca `node --test` sin acotar.
- Format check: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (JavaScript ESM, sin `tsconfig.json`).

## Decisiones

- **memory_key:** import-scope-string-validation
- **Elección:** exigir en `validateImportEntries` que `scope` sea un string con `trim()` no vacío,
  regla compartida por `importNodes` y el dry-run, con un error que nombre `entry[i].scope`.
- **Descartado:** cerrar el vocabulario de `scope` a `{project, feature, task}`; coercer o sanear un
  `scope` no-string al importar; validar solo en `importNodes` y dejar el dry-run con su propia
  regla; agregar un CHECK o migración de schema.
- **Justificación:** el validador ya es la fuente única de las reglas de entrada de ambos caminos
  (`engine.js:1313`, `:1351`), así que una regla de tipo ahí elimina la divergencia sin duplicar
  política ni tocar el upsert. El vocabulario cerrado excedería el contrato vigente de `recordNode`,
  que admite strings arbitrarios, y el schema no puede expresar «string no vacío» sin migración. La
  coerción silenciosa es justamente el defecto que se corrige.
- **Refs:**
- spec:memory-ops#Import de nodos desde JSON con upsert por memory_key
- spec:memory-engine#Idempotencia de reescritura idéntica en recordNode
- change:memory-import-scope-string

- **Estado:** aprobado
