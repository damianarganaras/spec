# Delta: agent-model-tiers

## ADDED Requirements

### Requirement: Integridad de los IDs declarados contra el snapshot

El sistema SHALL verificar que todo identificador de modelo declarado en el repositorio exista en el
snapshot de catálogo verificado. Las declaraciones SHALL derivarse de `TIERS` (todos los tiers y
agentes), `TIER_CHAINS` (todos los candidatos de todas las cadenas), `agents/*.md` y
`profiles/*/agents/*.md` (líneas `model:`), excluyendo el valor `inherit`.

Los helpers SHALL ser puros y SHALL vivir en el módulo dueño de su invariante:

- `src/core/tier-models.js` SHALL exponer `declaredModelIds({ tiers, chains, agentModels })`: deriva
  los IDs declarados a partir de los valores ya recibidos (`TIERS`, `TIER_CHAINS` y las fuentes de
  frontmatter), deduplica y conserva el origen de cada ID en un `Map` id→origen. NO SHALL leer
  archivos, NO SHALL hacer red, NO SHALL ejecutar procesos y NO SHALL importar
  `node:child_process`.
- `src/core/model-catalog.js` SHALL exponer `missingModelIdsInCatalog(snapshot, ids)`: devuelve las
  entradas declaradas (strings, `{ id, source }` o el `Map` de `declaredModelIds`) que no figuran en
  el snapshot, reutilizando `modelIdsFromCatalog`. NO SHALL mutar el snapshot ni depender de estado
  global.
- `modelIdsFromCatalog(snapshot)` SHALL ser la única extracción de IDs del snapshot: reside en
  `src/core/model-catalog.js` y `src/core/tier-models.js` la re-exporta para conservar su API. NO
  SHALL existir una segunda implementación de esa extracción.

El guard de tests SHALL derivar con `declaredModelIds` y comparar con `missingModelIdsInCatalog`, sin
un helper local de declaraciones duplicado, y SHALL cubrir las cuatro fuentes: los tres tiers de
`TIERS`, todos los candidatos de `TIER_CHAINS`, `agents/*.md` y `profiles/*/agents/*.md`. El mensaje
de fallo SHALL nombrar el ID y su origen. El guard SHALL leer sólo archivos versionados, NO SHALL
ejecutar `opencode models` y NO SHALL depender de `.opencode/**`.

`scripts/refresh-model-catalog.mjs` SHALL pre-validar los IDs declarados cuando se solicita
`--write`, antes de cualquier escritura. Si falta al menos un ID en el snapshot candidato, el script
SHALL salir con exit code no cero, SHALL nombrar los IDs y orígenes ausentes y NO SHALL escribir ni el
snapshot commiteado ni el reporte candidato. Si todos los IDs están presentes, la escritura atómica
existente SHALL continuar.

`main(argv, options)` del script SHALL aceptar `declaredIds` y `rootDir` inyectables. Con
`declaredIds` provisto, NO SHALL leer archivos para derivar declaraciones; sin él, SHALL derivarlas
de `TIERS`/`TIER_CHAINS` y de `agents/*.md` y `profiles/*/agents/*.md` bajo `rootDir`.

El guard de contenido SHALL afirmar que `src/core/model-catalog.js` y `src/core/tier-models.js` no
importan `node:child_process` ni ejecutan procesos. NO SHALL fallar porque
`scripts/refresh-model-catalog.mjs` importe `node:child_process` ni porque un test que importa el
script lo cargue de forma transitiva.

#### Scenario: Un ID declarado ausente bloquea `--write`

- **WHEN** el snapshot candidato no contiene un ID declarado en `TIERS`, `TIER_CHAINS`,
  `agents/*.md` o `profiles/*/agents/*.md` y se ejecuta el script con `--write`
- **THEN** el script sale con exit code 1
- **AND** nombra el ID ausente y su origen
- **AND** no reemplaza el snapshot commiteado ni escribe el reporte candidato

#### Scenario: Todos los IDs declarados permiten `--write`

- **WHEN** el snapshot candidato contiene todos los IDs declarados y la corrida es `available`
- **THEN** el script escribe el candidato y reemplaza el snapshot commiteado de forma atómica
- **AND** el snapshot resultante satisface `validateCatalogSnapshot`

#### Scenario: Los helpers son puros y reutilizan el mapa del catálogo

- **WHEN** se invocan `declaredModelIds` y `missingModelIdsInCatalog` con `TIERS`, `TIER_CHAINS`,
  fuentes de frontmatter y un snapshot construidos en memoria
- **THEN** el resultado depende sólo de esos argumentos
- **AND** `declaredModelIds` excluye `inherit`, deduplica y conserva el origen
- **AND** `missingModelIdsInCatalog` reutiliza `modelIdsFromCatalog` sin una segunda extracción
- **AND** no lee archivos, no ejecuta procesos y no muta el snapshot

#### Scenario: El guard cubre tiers, cadenas, canónica y perfiles

- **WHEN** se ejecuta el guard de integridad
- **THEN** deriva las declaraciones con `declaredModelIds` y las compara con `missingModelIdsInCatalog`
- **AND** verifica los IDs de los tres tiers de `TIERS` y todos los candidatos de `TIER_CHAINS`
- **AND** verifica los `model:` de `agents/*.md` y de `profiles/*/agents/*.md`
- **AND** `declaredModelIds` excluye `inherit`
- **AND** falla nombrando el ID y su archivo u origen cuando falta uno

#### Scenario: El guard de `child_process` distingue módulos puros del script

- **WHEN** se revisa el guard de contenido del descubrimiento
- **THEN** exige que `model-catalog.js` y `tier-models.js` no importen `node:child_process`
- **AND** permite que `scripts/refresh-model-catalog.mjs` importe `node:child_process`
- **AND** no falla por la carga transitiva del script desde el test

### Requirement: Detección de binario ausente independiente del locale

`looksBinaryMissing(result)` SHALL devolver verdadero sólo cuando:

- `result.error.code === 'ENOENT'`; o
- el resultado no es exitoso (`status` distinto de 0 o `error` presente), `stdout` no contiene
  ninguna línea con forma `provider/...` y `stderr` coincide con un patrón de comando no encontrado o
  no reconocido en varios idiomas.

La función NO SHALL devolver verdadero cuando `status === 0`, salvo que `error.code === 'ENOENT'`.
NO SHALL devolver verdadero cuando `stdout` enumera al menos un proveedor, aunque `stderr` contenga
un mensaje de "not found". NO SHALL depender de un único texto en inglés ni de la concatenación
indistinta de `stdout` y `stderr`.

#### Scenario: `ENOENT` se clasifica como binario ausente

- **WHEN** el spawn devuelve `error.code === 'ENOENT'`
- **THEN** `looksBinaryMissing` devuelve verdadero
- **AND** la clasificación es `binary-missing`

#### Scenario: Un mensaje de shell en otro locale se reconoce

- **WHEN** el spawn falla con `stdout` vacío y `stderr` contiene un mensaje de comando no encontrado o
  no reconocido en inglés, español u otro locale soportado
- **THEN** `looksBinaryMissing` devuelve verdadero
- **AND** la clasificación es `binary-missing`

#### Scenario: Una corrida exitosa no produce un falso positivo

- **WHEN** `status === 0` y `stdout` enumera al menos una línea `provider/...`
- **THEN** `looksBinaryMissing` devuelve falso aunque `stderr` contenga "not found"
- **AND** la clasificación no es `binary-missing`

#### Scenario: Un `stdout` vacío sin error no es binario ausente

- **WHEN** `status === 0`, `stdout` está vacío y no hay `error`
- **THEN** `looksBinaryMissing` devuelve falso
- **AND** la clasificación es `partial`, no `binary-missing`

#### Scenario: Un error de spawn distinto de ENOENT no es binario ausente

- **WHEN** el spawn falla por timeout, desborde de buffer o permisos con `stdout` vacío
- **THEN** `looksBinaryMissing` devuelve falso
- **AND** la clasificación es `partial`

### Requirement: Baseline vacío y aviso ante snapshot ilegible en el refresco

`readCurrent(path)` del script SHALL, cuando el snapshot vigente no se puede leer o parsear, devolver
un baseline vacío (`{ providers: {} }`) y emitir un aviso explícito de catálogo ilegible. NO SHALL
lanzar, NO SHALL tratar el baseline como un snapshot autoritativo y NO SHALL habilitar ninguna
escritura por sí mismo.

El baseline vacío SHALL usarse sólo para calcular el diff del reporte. Un conjunto vacío NO SHALL
producir deriva falsa en `check` ni SHALL considerarse un catálogo válido.

#### Scenario: Un snapshot corrupto produce baseline vacío y aviso

- **WHEN** `readCurrent` recibe un archivo que no es JSON válido o que no existe
- **THEN** devuelve `{ providers: {} }`
- **AND** emite un aviso explícito de catálogo ilegible
- **AND** el diff reporta todas las entradas del candidato como altas sin reemplazar el snapshot

#### Scenario: El baseline vacío no genera deriva falsa

- **WHEN** `check` carga un snapshot corrupto o inválido
- **THEN** el catálogo se mantiene como `null`
- **AND** no se emite deriva por `model:` ausente ni aviso advisory de IDs declarados
- **AND** se conserva el aviso de catálogo no verificable

## MODIFIED Requirements

### Requirement: Advertencia no bloqueante de deriva del catálogo en check

`ancleto check` SHALL emitir un warning no bloqueante cuando un `model:` del mirror instalado de un
host que escribe `model:` (`opencode`) no figure en el snapshot de catálogo. El warning SHALL nombrar
el archivo y el identificador ausente y SHALL sugerir refrescar el catálogo en el repositorio fuente,
sin una ruta ejecutable de `scripts/`. El warning NO SHALL cambiar el exit code de `check`, NO SHALL
alterar el conjunto de aceptación del oráculo y NO SHALL impedir la validación de frontmatter
existente.

Cuando el snapshot cargado es válido, `ancleto check` SHALL emitir además, como máximo una vez por
ejecución, un aviso advisory no bloqueante si hay IDs declarados en `TIERS`, `TIER_CHAINS`,
`agents/*.md` o `profiles/*/agents/*.md` que no figuren en el snapshot. El aviso SHALL listar los IDs
y su origen y SHALL referir el refresco al repositorio fuente. El texto del aviso SHALL ser
distinguible del warning de deriva por `model:` del mirror.

`ancleto check` SHALL emitir además, como máximo una vez por ejecución, un warning informativo cuando
`generated_at` del snapshot supere un umbral fijo de 90 días. Ese aviso NO SHALL configurarse, NO
SHALL actuar como TTL en runtime y NO SHALL alterar la resolución de tiers ni el exit code.

Los avisos de deriva y advisory SHALL omitirse cuando el catálogo no es legible o no satisface la
validación de forma (`validateCatalogSnapshot`), conservando en ambos casos el aviso existente de
catálogo no verificable. Un snapshot corrupto o un conjunto vacío NO SHALL producir deriva falsa.
Para hosts que eliminan `model:` o emiten `model: inherit`, NO SHALL evaluarse deriva. El aviso
advisory NO SHALL alterar `tierCandidates`, la lógica de `frontmatter diverge` ni el exit code.

#### Scenario: Un modelo del mirror ausente del snapshot produce un warning

- **WHEN** el mirror de `opencode` declara un `model:` que no figura en el snapshot legible
- **THEN** `check` emite un warning que nombra el archivo y el identificador ausente
- **AND** sugiere refrescar el catálogo en el repositorio fuente, sin una ruta ejecutable de
  `scripts/`
- **AND** el exit code no cambia

#### Scenario: Un ID declarado ausente produce un único aviso advisory

- **WHEN** el snapshot es válido y `TIERS`, `TIER_CHAINS`, `agents/*.md` o
  `profiles/*/agents/*.md` declaran un ID que no figura en él
- **THEN** `check` emite como máximo un aviso advisory por ejecución
- **AND** el aviso lista el ID y su origen
- **AND** el exit code es 0 y el conjunto de aceptación del oráculo no cambia

#### Scenario: El aviso advisory no altera el oráculo ni la divergencia

- **WHEN** hay un ID declarado ausente del snapshot pero el mirror coincide con un estado de tier
  aceptado
- **THEN** no se agrega un `frontmatter diverge` nuevo
- **AND** el conjunto de aceptación del oráculo no cambia
- **AND** el aviso advisory no se cuenta como aviso de deriva por `model:` del mirror

#### Scenario: El catálogo ilegible no produce deriva

- **WHEN** el snapshot no se puede leer o parsear
- **THEN** `check` conserva el aviso existente de catálogo no verificable
- **AND** no emite el warning de deriva por modelo ausente
- **AND** no emite el aviso advisory de IDs declarados

#### Scenario: Un catálogo parseable pero inválido no produce deriva

- **WHEN** el snapshot parsea pero no satisface `validateCatalogSnapshot` (`{}`, `{ providers: {} }`,
  un array o un string)
- **THEN** no se emite el warning de deriva por modelo ausente
- **AND** no se emite el aviso advisory de IDs declarados
- **AND** se conserva el aviso de catálogo no verificable
- **AND** el exit code no cambia

#### Scenario: Un snapshot corrupto no produce deriva falsa

- **WHEN** el snapshot está corrupto o vacío y los archivos declaran IDs de modelo
- **THEN** `check` no reporta esos IDs como ausentes en el catálogo
- **AND** no reporta deriva por `model:` del mirror
- **AND** el exit code no cambia

#### Scenario: Un catálogo antiguo emite un aviso informativo

- **WHEN** `generated_at` del snapshot legible es anterior a 90 días
- **THEN** `check` emite un único warning informativo por ejecución
- **AND** la resolución de tiers y el exit code no cambian

#### Scenario: Un host sin `model:` gestionado no evalúa deriva

- **WHEN** el host instalado elimina `model:` o emite `model: inherit`
- **THEN** `check` no emite el warning de deriva por modelo ausente

### Requirement: Procedimiento de mantenimiento del catálogo documentado

`README.md` SHALL documentar el procedimiento manual de descubrimiento y refresco del catálogo: los
comandos de descubrimiento y de escritura explícita, las cuatro clasificaciones (`available`,
`binary-missing`, `network-unavailable`, `partial`), la ubicación del reporte candidato, la revisión
del diff, la validación y el commit del snapshot. El procedimiento SHALL indicar que el reporte
candidato no se commitea y que el descubrimiento no corre en runtime. El procedimiento SHALL usar
agentes o skills existentes y NO SHALL requerir un agente o una skill nuevos.

`README.md` SHALL declarar que `scripts/` vive sólo en el repositorio fuente y no se publica en el
paquete instalado. Los mensajes de remedio de `check` SHALL referir el refresco al repositorio fuente
y NO SHALL incluir una ruta ejecutable de `scripts/` que implique correrla desde una instalación. Los
mensajes de error del resolver que indiquen cómo refrescar el catálogo SHALL usar la misma referencia
al repositorio fuente y NO SHALL incluir una ruta `scripts/...`. Los literales del mensaje en la
spec, `README.md` y los tests SHALL mantenerse alineados en el mismo change.

#### Scenario: El mantenimiento queda documentado

- **WHEN** se revisa la sección de mantenimiento del catálogo en `README.md`
- **THEN** describe los comandos de descubrimiento y de escritura explícita
- **AND** enumera las cuatro clasificaciones y la regla de no commitear el reporte candidato
- **AND** nombra sólo agentes o skills existentes

#### Scenario: `scripts/` se identifica como código del repositorio fuente

- **WHEN** se revisa `README.md` y el mensaje de remedio de `check`
- **THEN** ambos refieren el refresco al repositorio fuente
- **AND** el mensaje no contiene una ruta ejecutable de `scripts/` para una instalación
- **AND** `README.md` declara que `scripts/` no se publica en el paquete

#### Scenario: El error del resolver no ofrece una ruta instalada

- **WHEN** la resolución de un tier con cadena falla por ausencia total de candidatos
- **THEN** el error nombra el agente y la cadena completa
- **AND** refiere el refresco al repositorio fuente
- **AND** no contiene una ruta `scripts/...` que implique ejecutarla desde el paquete instalado

#### Scenario: El literal del remedio queda alineado entre spec, README y tests

- **WHEN** se buscan los literales del remedio en la spec, `README.md` y los tests
- **THEN** todos refieren al repositorio fuente
- **AND** ninguno presenta `node scripts/refresh-model-catalog.mjs` como comando para el paquete
  instalado
