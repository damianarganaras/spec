# Delta: agent-model-tiers

## ADDED Requirements

### Requirement: Aviso advisory de modelo gratis sobre un agente primario

`src/core/tier-models.js`, módulo dueño de la semántica de tiers y del modelo gratis, SHALL exponer un
predicado puro `freeTierOnPrimary(model, mode)` que devuelva verdadero sólo cuando `model` satisfaga
`isKnownGratisModel` y `String(mode).trim()` sea exactamente `primary`. El predicado NO SHALL recibir
ni inferir un tier: la invariante es modelo + modo, con independencia de cómo se instaló el modelo. NO
SHALL leer archivos, NO SHALL hacer red y NO SHALL ejecutar procesos.

En tiempo de escritura, `applyTier` SHALL evaluar el `mode:` del frontmatter existente con
`freeTierOnPrimary` cuando el reemplazo de `model:` cambie el contenido (`o !== c`). Si el agente
declara `mode: primary` y el modelo objetivo es gratis, SHALL emitir por `stderr` (`console.warn`) el
aviso no bloqueante con la forma exacta:

`ancleto: tier gratis: <agent> es un agente primario (mode: primary) y usará el modelo free <model>; OpenCode puede responder 403 "free tier can only be used from within OpenCode". Usá un modelo pago en el agente primario.`

—con `<agent>` y `<model>` sustituidos por el agente y el modelo free— y SHALL continuar. NO SHALL
lanzar, NO SHALL cambiar el modelo escrito, NO SHALL cambiar su valor de retorno y NO SHALL advertir
cuando el contenido resultante es idéntico al existente, preservando la idempotencia.

En tiempo de inspección, `ancleto check` SHALL agregar una entrada advisory a su salida de avisos
cuando un agente instalado declare `mode: primary` y su `model:` instalado satisfaga
`freeTierOnPrimary`. La entrada SHALL tener la forma exacta:

`<dirRel>/<file> (modelo free <model> sobre un agente primario: puede responder 403 en OpenCode)`

—con `<dirRel>/<file>` y `<model>` sustituidos por la ruta relativa del archivo instalado y su modelo
free—. Esa entrada NO SHALL incrementar `missing` ni `orphans` y NO SHALL alterar el contrato de salida
`missing > 0 ? 1 : 0`. La detección SHALL derivarse únicamente del valor `mode:` del frontmatter
—nunca del nombre del agente ni de su posición en `TIERS`— reutilizando `parseFrontmatter`. Un archivo
de agente ausente, un `mode: subagent` o la ausencia de `mode:` NO SHALL producir aviso.

Los dos literales anteriores son normativos y no SHALL sustituirse por paráfrasis. Ambos SHALL contener
las subcadenas `403` y `agente primario`, SHALL nombrar el agente o el archivo instalado y el modelo
free, y SHALL formular la consecuencia de forma condicional ("puede"), nunca como garantía. Un override
`opencode.json → agent.<nombre>.model` es invisible para ancleto: por eso ambos avisos son advisory y
NO SHALL presentarse como una detección definitiva del modelo efectivo.

`README.md` SHALL documentar en un párrafo breve que el tier `gratis` está pensado para subagentes y
que un modelo free sobre un agente primario custom puede responder 403.

#### Scenario: `applyTier` advierte sobre un agente primario con modelo gratis

- **WHEN** se aplica el tier `gratis` a un agente cuyo frontmatter declara `mode: primary` y el
  reemplazo cambia su `model:`
- **THEN** el archivo queda con el modelo gratis y el comando emite un aviso por `stderr`
- **AND** el aviso contiene `403` y `agente primario`, y nombra el agente y el modelo free
- **AND** el comando no lanza y completa con exit 0

#### Scenario: Un subagente no produce aviso en `applyTier`

- **WHEN** se aplica el tier `gratis` a un agente con `mode: subagent` o sin `mode:` en el frontmatter
- **THEN** el archivo queda con el modelo gratis
- **AND** no se emite el aviso de agente primario

#### Scenario: La rama `o === c` de `applyTier` no produce aviso

- **WHEN** el agente primario ya declara el modelo gratis objetivo y el reemplazo no cambia el
  contenido (`o === c`)
- **THEN** no se reescribe el archivo
- **AND** no se emite el aviso de agente primario
- **AND** `o === c` describe la entrada y salida de esa llamada a `applyTier`, no una segunda
  invocación de la CLI, que re-materializa los assets canónicos antes de llegar a `applyTier`
- **AND** la idempotencia observable por la CLI es de contenido: una corrida repetida de
  `install --tier gratis` puede volver a emitir el aviso aunque el archivo no cambie

#### Scenario: `check` advierte sin bloquear

- **WHEN** un agente instalado declara `mode: primary` y su `model:` instalado es un modelo gratis
- **THEN** `check` emite una entrada advisory con `403` y `agente primario`
- **AND** la entrada no incrementa faltantes ni huérfanos y el exit code es 0

#### Scenario: `check` no advierte sobre subagentes ni archivos sin `mode:`

- **WHEN** el agente instalado declara `mode: subagent` o no declara `mode:`, aunque su modelo sea
  gratis
- **THEN** no se emite el aviso de agente primario
- **AND** el exit code no cambia

#### Scenario: La detección usa el modo, no el nombre

- **WHEN** un agente primario distinto de `orchestrator` declara `mode: primary` y un modelo gratis
- **THEN** recibe el aviso igual que el primario canónico
- **AND** un agente con `mode: subagent` no lo recibe aunque su nombre coincida con un agente
  canónicamente primario

#### Scenario: `README.md` documenta la limitación

- **WHEN** se revisa la sección del tier `gratis` en `README.md`
- **THEN** documenta que está pensado para subagentes
- **AND** declara que un modelo free sobre un agente primario custom puede responder 403

## MODIFIED Requirements

### Requirement: Snapshot de catálogo verificado y guard de disponibilidad de IDs

El repositorio SHALL incluir un snapshot versionado en `src/core/model-catalog.json` con
`generated_at`, el método de verificación (`opencode models <provider> --verbose --refresh`) y un
mapa de proveedor a IDs completos. El snapshot SHALL contener TODOS los proveedores que enumera
`opencode models` en la máquina de mantenimiento, no sólo los que ya figuraban en el snapshot
vigente. El snapshot SHALL conservar el schema `{ generated_at, source: { method, providers },
providers }`; `providers` SHALL ser un mapa de proveedor a lista de entradas `{ id, cost, limit }`,
sin IDs duplicados y con el prefijo del proveedor en cada `id`.

El snapshot SHALL ser la fuente de disponibilidad que consumen la resolución de tiers y la guarda de
IDs declarados; el sistema NO SHALL consultar la red ni el proveedor en `install`, `init`, `import`,
`check` ni en la suite de tests. La derivación, la cobertura de fuentes y la pureza de la guarda se
definen una sola vez en el requirement "Integridad de los IDs declarados contra el snapshot" y NO
SHALL reenunciarse acá.

El refresco del snapshot SHALL ser una operación manual, provista por
`scripts/refresh-model-catalog.mjs`, que ejecute el descubrimiento dev-only del requirement
"Descubrimiento dev-only del catálogo con clasificación de frescura", normalice los IDs y reescriba
el JSON de forma atómica. El script NO SHALL correr automáticamente en CI ni como parte de otro
comando. Si el binario `opencode` no está disponible, la salida es offline o un proveedor falla, el
script SHALL fallar de forma explícita sin reemplazar el snapshot commiteado ni escribir un snapshot
vacío o parcial. La pre-validación de los IDs declarados antes de `--write` se define en el
requirement "Integridad de los IDs declarados contra el snapshot" y NO SHALL reenunciarse acá.

#### Scenario: El snapshot es auditable

- **WHEN** se revisa `src/core/model-catalog.json`
- **THEN** declara `generated_at`, el método de verificación con `--refresh` y TODOS los proveedores
  enumerados
- **AND** los IDs están completos, con prefijo de proveedor y sin duplicados

#### Scenario: Un snapshot parcial no reemplaza al vigente

- **WHEN** el descubrimiento clasifica `partial`, `network-unavailable` o `binary-missing`
- **THEN** el script termina con exit code no cero
- **AND** `src/core/model-catalog.json` conserva su contenido byte a byte

#### Scenario: La escritura del snapshot es atómica

- **WHEN** el refresco reescribe `src/core/model-catalog.json` con la acción explícita de escritura
- **THEN** usa un archivo temporal en el mismo directorio y un rename sobre el destino
- **AND** un fallo durante la escritura no deja el snapshot truncado

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

La suite SHALL incluir el guard de tests que derive con `declaredModelIds` y compare con
`missingModelIdsInCatalog`, sin un helper local de declaraciones duplicado, y que falle cuando un ID
declarado no figure en el snapshot. El guard SHALL cubrir las cuatro fuentes: los tres tiers de
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

#### Scenario: Un ID presente pasa el guard

- **WHEN** el guard verifica un identificador que figura en `src/core/model-catalog.json`
- **THEN** la validación de ese identificador es satisfactoria

#### Scenario: Un ID inexistente rompe el guard

- **WHEN** `TIERS`, `TIER_CHAINS`, `agents/*.md` o `profiles/*/agents/*.md` declaran un identificador
  que no figura en el snapshot
- **THEN** el guard falla nombrando el identificador y su archivo de origen

_Testeable con `test/model-catalog.test.js`: sobre una copia en memoria del snapshot se retira un ID
real y se afirma que la validación lo reporta como ausente; el snapshot commiteado no se muta._

#### Scenario: El guard cubre tiers, cadenas, canónica y perfiles

- **WHEN** se ejecuta el guard de integridad
- **THEN** deriva las declaraciones con `declaredModelIds` y las compara con `missingModelIdsInCatalog`
- **AND** verifica los IDs de los tres tiers de `TIERS` y todos los candidatos de `TIER_CHAINS`
- **AND** verifica los `model:` de `agents/*.md` y de `profiles/*/agents/*.md`
- **AND** `declaredModelIds` excluye `inherit`
- **AND** lee sólo archivos versionados, no ejecuta `opencode models` y no depende de `.opencode/**`
- **AND** falla nombrando el ID y su archivo u origen cuando falta uno

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

#### Scenario: El guard de `child_process` distingue módulos puros del script

- **WHEN** se revisa el guard de contenido del descubrimiento
- **THEN** exige que `model-catalog.js` y `tier-models.js` no importen `node:child_process`
- **AND** permite que `scripts/refresh-model-catalog.mjs` importe `node:child_process`
- **AND** no falla por la carga transitiva del script desde el test
