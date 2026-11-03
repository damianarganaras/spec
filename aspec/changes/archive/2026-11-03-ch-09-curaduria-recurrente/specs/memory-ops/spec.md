# Delta: memory-ops

## ADDED Requirements

### Requirement: Curaduría read-only con `memory curate`

El sistema SHALL exponer el subcomando `ancleto memory curate [--json] [--strict]` dentro de la
familia existente `memory`. El subcomando SHALL ser un wrapper fino sobre un módulo puro en
`src/core/memory/curation.js` y NO SHALL introducir una tool MCP nueva.

**Composición, no duplicación.** El módulo SHALL componer las primitivas existentes:
`resolveNodeRefs` para clasificar cada ref de cada nodo —es la primitiva que aporta `kind` y
`reason` por ref— y `consolidate({ dryRun: true, includeNearDuplicates: false })` para duplicados
exactos. `inspectRefs` es un agregado de nivel doctor que no expone `reason` por ref y NO es la
primitiva que compone este módulo. El módulo NO SHALL contener SQL propio, un parser de refs propio,
un resolvedor de refs propio ni una segunda normalización de duplicados, cualquiera sea la primitiva
que componga. Un duplicado exacto SHALL ser el que produce esa primitiva: `type`
igual y `content` normalizado sin el bloque `refs:`; el canónico SHALL ser el que elige su cadena
fija de criterios. Como la curaduría no reporta near-duplicates, SHALL invocar la primitiva con
`includeNearDuplicates: false` para no pagar ese escaneo; la definición de duplicado exacto y el
default de esa primitiva NO cambian.

**Read-only.** El comando SHALL abrir la base exclusivamente con `readonly: true` y
`migrate: false`. NO SHALL aceptar `--rebuild` ni ejecutar `VACUUM`, `VACUUM INTO`, snapshot, DDL,
`PRAGMA` mutante, `INSERT`, `UPDATE`, `DELETE`, escritura de `superseded_by`/`superseded_at`,
`recordRule`, `recordDecision` ni promoción de ningún tipo.

**Contenido del reporte.** El reporte SHALL contener estas secciones:

- `brokenRefs`: una entrada por ref no resuelta de un nodo activo, con `memory_key`, `kind`
  (`spec`, `change` o `path`), `ref` y `reason`. `ref` SHALL ser el texto declarado en `content`,
  con exactamente dos transformaciones: los separadores de path normalizados a `/` y, si existe,
  el sufijo final `:line` eliminado. NO SHALL colapsar `.` ni `..`, y NO SHALL resolverse,
  canonicalizarse ni normalizarse de ninguna otra forma. `reason` SHALL ser un string informativo
  NO enumerado: la curaduría SHALL reutilizar tal cual el motivo que emite el diagnóstico vigente
  para la ref, sin traducirlo ni filtrarlo
  contra una lista cerrada. Los valores `inexistente`, `ambiguo (<n> coincidencias)`,
  `inválido (<causa>)` y `sin raíz` son ejemplos de esa salida, no una enumeración exhaustiva.
  Una ref que no puede verificarse porque no hay raíz de proyecto disponible SHALL reportarse como
  hallazgo con su `reason`, nunca omitirse en silencio.
  Cuando el nodo declara un bloque `refs:`
  malformado o repetido, la entrada SHALL usar la línea ofensora —o `refs:`— como `ref`, omitir
  `kind` y reportar `reason` `inválido (gramática)`.
- `unverifiable`: una entrada por ref `commit:` o `workitem:`, con `memory_key`, `kind`, `ref` y
  `reason` `no verificable`. Esas refs NO SHALL contarse como rotas ni afectar el código de salida.
- `exactDuplicates`: un grupo por conjunto de dos o más nodos activos con `content` normalizado
  idéntico y mismo `type`, con su `canonical` y su `superseded`. `canonical` es el nodo canónico del
  grupo, `superseded` lista los nodos restantes del grupo y un grupo reportado siempre tiene al
  menos una entrada en `superseded`. Los grupos SHALL ordenarse por `type` y, a igual `type`, por
  la `memory_key` del canónico; las `memory_key` de `superseded` SHALL conservar el orden de la
  cadena de canónico.

La curaduría NO SHALL modificar el estado de ningún nodo: los nodos de `superseded` en un grupo
exacto SHALL seguir activos y sin cambios en `superseded_by` ni `superseded_at`. Reportar un
duplicado NO SHALL equivaler a consolidarlo.

**Determinismo.** Para la misma entrada, dos corridas SHALL producir la misma salida. El orden
SHALL ser total: `memory_key` ascendente y, a igual `memory_key`, el orden de aparición de la ref
dentro de `content`. Los paths SHALL emitirse en forma POSIX y sin sufijo `:line`. La salida NO
SHALL incluir timestamps ni campos volátiles. El orden NO SHALL depender de `localeCompare`, del
orden de `readdir` ni del orden de `rowid`.

**Códigos de salida.** El comando SHALL ser advisory por defecto: SHALL salir con `0` aun cuando
el reporte contenga refs rotas o grupos de duplicados exactos. Con `--strict`, SHALL salir con
código distinto de `0` cuando exista al menos una ref rota o un grupo exacto. Las refs
`unverifiable` NO SHALL afectar el código de salida en ningún modo.

Cuando la base no exista, el comando SHALL reportar el estado `no-db` de forma explícita y salir
con código distinto de `0`, con y sin `--strict`. El estado `no-db` NUNCA SHALL presentarse como un
reporte limpio. Cualquier error de apertura o lectura SHALL reportarse como estado distinto de
`ok` con su motivo y código distinto de `0`, nunca como reporte limpio.

**Salida JSON.** Con `--json`, la salida SHALL ser un objeto JSON parseable con las claves
`status`, `brokenRefs`, `unverifiable` y `exactDuplicates`. Sin
`--json`, la salida SHALL ser un resumen legible con las mismas secciones.

#### Scenario: Refs rotas listadas con evidencia

- **WHEN** se ejecuta `ancleto memory curate --json` sobre una base con un nodo activo
  `memory_key='regla-a'` que declara `path:src/no-existe.js`, `spec:memory-ops#no-existe` y
  `change:no-existe`
- **THEN** `brokenRefs` contiene tres entradas con `memory_key='regla-a'`
- **AND** cada entrada expone `kind` (`path`, `spec`, `change`), la ref declarada y `reason`
  `inexistente`
- **AND** las entradas respetan el orden de aparición de las refs en `content`

#### Scenario: Duplicados exactos se reportan sin superseder

- **WHEN** se ejecuta `ancleto memory curate --json` sobre una base con tres nodos activos del
  mismo `type` y el mismo `content` normalizado, donde uno declara dos refs y los otros ninguna
- **THEN** `exactDuplicates` contiene un grupo cuyo `canonical` es el nodo con dos refs
- **AND** `superseded` contiene las `memory_key` de los otros dos
- **AND** los tres nodos siguen con `status='active'` y sin `superseded_by` ni `superseded_at`
- **AND** el conjunto de filas de `memory_nodes` es idéntico antes y después

#### Scenario: Advisory por defecto y `--strict` opt-in

- **WHEN** se ejecuta `ancleto memory curate` sobre una base con una ref rota y un grupo exacto
- **THEN** el comando sale con código `0`
- **AND** se ejecuta `ancleto memory curate --strict` sobre la misma base
- **AND** el comando sale con código distinto de `0`

#### Scenario: Base ausente se reporta como `no-db`

- **WHEN** se ejecuta `ancleto memory curate --json` en un repo sin `.ancleto/memory.db`
- **THEN** la salida expone `status` `no-db`
- **AND** el comando sale con código distinto de `0`
- **AND** la salida NO SHALL presentarse como un reporte limpio ni con secciones vacías que
  sugieran "sin hallazgos"

#### Scenario: Orden y forma de paths determinísticos

- **WHEN** se ejecuta `ancleto memory curate --json` dos veces sobre la misma base, cuyos nodos
  declaran refs de path con separadores `\` y sufijos `:line`
- **THEN** las dos salidas son idénticas
- **AND** una ref declarada como `path:src\core\..\memory\x.js:12` se reporta exactamente como
  `path:src/core/../memory/x.js`, sin colapsar `..` ni resolverla
- **AND** una ref declarada como `path:src\a.js:7` se reporta exactamente como `path:src/a.js`
- **AND** los paths aparecen en forma POSIX, sin sufijo `:line`
- **AND** las entradas están ordenadas por `memory_key` y luego por orden de aparición
- **AND** la salida no contiene timestamps ni campos volátiles

#### Scenario: `commit:` y `workitem:` se reportan aparte, nunca como rotas

- **WHEN** un nodo activo declara únicamente refs `commit:` y `workitem:`
- **THEN** aparecen en `unverifiable` con `reason` `no verificable`
- **AND** `brokenRefs` no las incluye
- **AND** el código de salida es `0`, también con `--strict`

#### Scenario: La curaduría no escribe de ninguna forma

- **WHEN** se ejecuta `ancleto memory curate` sobre una fixture con refs rotas y duplicados
  exactos, en `journal_mode=DELETE`
- **THEN** los bytes de `.db` son idénticos antes y después
- **AND** el conjunto de objetos de `sqlite_master` es idéntico antes y después
- **AND** la cantidad de nodos y sus `status`, `superseded_by` y `superseded_at` no cambian
- **AND** dos corridas consecutivas son idempotentes

_No-testeable-por-construcción: que el módulo no contenga una ruta de escritura ni un segundo
parser o normalizador es una propiedad de construcción sin salida observable directa. Se ancla en
el contrato del módulo descrito arriba y en la revisión de código; el efecto observable —la base
byte a byte idéntica— sí queda cubierto por el scenario anterior._

## MODIFIED Requirements

### Requirement: Comando CLI `ancleto memory snapshot`

El sistema SHALL exponer el subcomando `ancleto memory snapshot --out <archivo.db>` dentro de la familia
existente `memory`, junto a `context`, `list`, `doctor`, `export`, `import`, `gc`, `merge`,
`consolidate` y `curate`. El subcomando SHALL aceptar `--force` para la sobrescritura explícita y
`--json` para la salida estructurada. SHALL ser un wrapper fino sobre la función de snapshot: NO SHALL
introducir tablas nuevas, agentes nuevos ni cambiar la semántica de `memory export`.

Sin `--json`, el comando SHALL imprimir un resumen legible que incluya la ruta del snapshot y su tamaño.
Con `--json`, SHALL imprimir un objeto JSON parseable que incluya al menos `out` y `bytes`. Ante falta de
`--out`, fuente inexistente, destino igual a la fuente o destino existente sin `--force`, el comando
SHALL salir con código distinto de `0` y un mensaje que nombre el motivo.

#### Scenario: Snapshot a archivo con resumen legible

- **WHEN** se ejecuta `ancleto memory snapshot --out backup.db` sobre un repo con memoria
- **THEN** `backup.db` contiene una base SQLite con el contenido y el historial de la fuente
- **AND** la salida nombra la ruta y el tamaño del archivo creado

#### Scenario: Snapshot con `--json`

- **WHEN** se ejecuta `ancleto memory snapshot --out backup.db --json`
- **THEN** la salida es un objeto JSON parseable
- **AND** incluye las claves `out` y `bytes`

#### Scenario: Falta `--out`

- **WHEN** se ejecuta `ancleto memory snapshot` sin `--out`
- **THEN** el comando sale con código distinto de `0`
- **AND** el mensaje muestra el uso correcto
