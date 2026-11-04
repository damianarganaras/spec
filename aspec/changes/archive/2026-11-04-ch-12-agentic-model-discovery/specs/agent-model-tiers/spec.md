# Delta: agent-model-tiers

## ADDED Requirements

### Requirement: Descubrimiento dev-only del catálogo con clasificación de frescura

El descubrimiento del catálogo SHALL ser una operación de desarrollo/mantenimiento, provista por
`scripts/refresh-model-catalog.mjs` y ejecutada sólo de forma manual. El descubrimiento NO SHALL
ejecutarse en `install`, `update`, `init`, `import`, `check`, la suite de tests ni en CI.

El script SHALL:

- enumerar TODOS los proveedores que reporta `opencode models` en su salida plana, no sólo los que ya
  figuran en el snapshot vigente;
- ejecutar `opencode models <provider> --verbose` por proveedor;
- pasar `--refresh` en la enumeración plana y en cada consulta por proveedor;
- clasificar el resultado como `available`, `binary-missing`, `network-unavailable` o `partial`; la
  clasificación `binary-missing` SHALL aplicarse sólo cuando el binario falta (`ENOENT` o mensaje de
  shell de comando no encontrado), y los demás errores de spawn (timeout, desborde de buffer,
  permisos) SHALL clasificarse como `partial`, nunca como `binary-missing`;
- tratar el marcador `Failed to fetch models.dev` como una salida offline y NO SHALL considerarla
  fresca;
- calcular un diff contra el snapshot vigente con altas, bajas y cambios de `cost` o `limit` por
  proveedor e ID;
- validar la forma del snapshot antes de escribirlo; la validación SHALL exigir que `generated_at`
  sea una fecha de calendario real en UTC y SHALL rechazar `2026-13-01`, `2026-02-31` y
  `2025-02-29`, no sólo un valor con formato `YYYY-MM-DD`;
- rechazar el snapshot cuando `opencode/big-pickle` deja de tener costo 0 en entrada y salida;
- escribir el snapshot de forma atómica cuando se solicite la acción explícita de escritura, con un
  archivo temporal en el mismo directorio y un rename sobre el destino;
- emitir un reporte candidato con fecha, proveedores de origen y método, fuera del snapshot
  commiteado;
- exponer la escritura y la ejecución en un entry point testeable con un runner inyectable, de modo
  que la clasificación de frescura y la no sustitución del snapshot se verifiquen sin invocar
  `opencode` ni usar red;
- NO SHALL reemplazar `src/core/model-catalog.json` de forma automática: el reemplazo SHALL requerir
  una acción explícita de escritura.

Si el binario `opencode` no está disponible, la salida es offline o al menos un proveedor falla, el
script SHALL terminar con exit code no cero y NO SHALL reemplazar el snapshot commiteado con un
conjunto vacío o parcial.

El parseo de la salida, la enumeración de proveedores, el diff, la validación de forma, la
clasificación de frescura y el cálculo de antigüedad SHALL implementarse como funciones puras en
`src/core/model-catalog.js`, sin `node:child_process`, sin red y sin E/S, de modo que sean testeables
con salidas capturadas en memoria. `src/core/tier-models.js` NO SHALL importar
`node:child_process` ni ejecutar procesos.

#### Scenario: La enumeración cubre todos los proveedores

- **WHEN** `opencode models` reporta IDs de cinco proveedores y el snapshot vigente sólo contiene tres
- **THEN** el script consulta los cinco proveedores
- **AND** el snapshot candidato contiene los cinco mapas de proveedor

#### Scenario: Una salida offline no se sella como fresca

- **WHEN** la salida de `opencode models ... --refresh` contiene `Failed to fetch models.dev`
- **THEN** la clasificación es `network-unavailable` o `partial`
- **AND** el script NO SHALL reemplazar el snapshot commiteado
- **AND** el snapshot commiteado NO SHALL declarar una fecha de verificación nueva

#### Scenario: El binario `opencode` no está disponible

- **WHEN** el binario `opencode` no se puede ejecutar
- **THEN** la clasificación es `binary-missing`
- **AND** el script termina con exit code no cero sin escribir el snapshot

#### Scenario: Un error de spawn distinto de ENOENT no es binary-missing

- **WHEN** el spawn de `opencode` falla por timeout, desborde de buffer o permisos
- **THEN** la clasificación es `partial`
- **AND** el script NO SHALL reemplazar el snapshot commiteado

#### Scenario: Un solo proveedor falla

- **WHEN** al menos un proveedor devuelve error o no parsea entradas pero otros sí devuelven IDs
- **THEN** la clasificación es `partial`
- **AND** el script NO SHALL reemplazar el snapshot commiteado con el conjunto parcial

#### Scenario: El diff reporta altas, bajas y cambios

- **WHEN** el snapshot vigente y la salida descubierta difieren en IDs o en `cost`/`limit`
- **THEN** el reporte enumera las altas, las bajas y los cambios por proveedor e ID
- **AND** el reporte se emite sin reemplazar el snapshot commiteado

#### Scenario: `big-pickle` deja de ser gratis

- **WHEN** el snapshot candidato declara `opencode/big-pickle` con `cost.input` o `cost.output`
  distinto de 0, o sin entrada en el catálogo
- **THEN** la validación falla
- **AND** el snapshot commiteado no se reemplaza

#### Scenario: La escritura del snapshot es atómica

- **WHEN** el script escribe el snapshot con la acción explícita de escritura
- **THEN** escribe primero en un archivo temporal del mismo directorio y luego lo renombra sobre el
  destino
- **AND** un fallo durante la escritura no deja el destino truncado

_Testeable con `test/model-catalog-discovery.test.js`: la escritura atómica se ejercita en un
directorio temporal sin ejecutar `opencode`; un destino inválido falla y deja el contenido previo
intacto._

#### Scenario: Los helpers puros no ejecutan procesos ni usan red

- **WHEN** se importa `src/core/model-catalog.js`
- **THEN** el módulo no importa `node:child_process`, no hace red y no escribe archivos
- **AND** los tests lo ejercitan con salidas capturadas en memoria

### Requirement: Advertencia no bloqueante de deriva del catálogo en `check`

`ancleto check` SHALL emitir un warning no bloqueante cuando un `model:` del mirror instalado de un
host que escribe `model:` (`opencode`) no figure en el snapshot de catálogo. El warning SHALL nombrar
el archivo y el identificador ausente y SHALL sugerir refrescar el catálogo. El warning NO SHALL
cambiar el exit code de `check`, NO SHALL alterar el conjunto de aceptación del oráculo y NO SHALL
impedir la validación de frontmatter existente.

`ancleto check` SHALL emitir además, como máximo una vez por ejecución, un warning informativo cuando
`generated_at` del snapshot supere un umbral fijo de 90 días. Ese aviso NO SHALL configurarse, NO
SHALL actuar como TTL en runtime y NO SHALL alterar la resolución de tiers ni el exit code.

El warning de deriva SHALL omitirse cuando el catálogo no es legible o no satisface la validación de
forma (`validateCatalogSnapshot`), conservando en ambos casos el aviso existente de catálogo no
verificable. Para hosts que eliminan `model:` o emiten `model: inherit`, NO SHALL evaluarse deriva.

#### Scenario: Un modelo del mirror ausente del snapshot produce un warning

- **WHEN** el mirror de `opencode` declara un `model:` que no figura en el snapshot legible
- **THEN** `check` emite un warning que nombra el archivo y el identificador ausente
- **AND** sugiere refrescar el catálogo con `scripts/refresh-model-catalog.mjs`
- **AND** el exit code no cambia

#### Scenario: El aviso de deriva no altera el oráculo

- **WHEN** el mirror declara un `model:` ausente del snapshot pero igual a un estado de tier aceptado
- **THEN** el conjunto de aceptación del oráculo no cambia
- **AND** no se agrega un `frontmatter diverge` nuevo por el solo hecho de la ausencia en el catálogo

#### Scenario: El catálogo ilegible no produce deriva

- **WHEN** el snapshot no se puede leer o parsear
- **THEN** `check` conserva el aviso existente de catálogo no verificable
- **AND** no emite el warning de deriva por modelo ausente
- **AND** el exit code no cambia

#### Scenario: Un catálogo parseable pero inválido no produce deriva

- **WHEN** el snapshot parsea pero no satisface `validateCatalogSnapshot` (`{}`, `{ providers: {} }`,
  un array o un string)
- **THEN** no se emite el warning de deriva por modelo ausente
- **AND** se conserva el aviso de catálogo no verificable
- **AND** el exit code no cambia

#### Scenario: Un catálogo antiguo emite un aviso informativo

- **WHEN** `generated_at` del snapshot legible es anterior a 90 días
- **THEN** `check` emite un único warning informativo por ejecución
- **AND** la resolución de tiers y el exit code no cambian

#### Scenario: Un host sin `model:` gestionado no evalúa deriva

- **WHEN** el host instalado elimina `model:` o emite `model: inherit`
- **THEN** `check` no emite el warning de deriva por modelo ausente

_Testeable con `test/cli.test.js`: proyectos temporales con `ANCLETO_MODEL_CATALOG` apuntando a
snapshots legibles, ilegibles y antiguos; se afirma el warning, la ausencia de deriva donde
corresponde y el exit code sin cambios._

### Requirement: Procedimiento de mantenimiento del catálogo documentado

`README.md` SHALL documentar el procedimiento manual de descubrimiento y refresco del catálogo: los
comandos de descubrimiento y de escritura explícita, las cuatro clasificaciones (`available`,
`binary-missing`, `network-unavailable`, `partial`), la ubicación del reporte candidato, la revisión
del diff, la validación y el commit del snapshot. El procedimiento SHALL indicar que el reporte
candidato no se commitea y que el descubrimiento no corre en runtime. El procedimiento SHALL usar
agentes o skills existentes y NO SHALL requerir un agente o una skill nuevos.

#### Scenario: El mantenimiento queda documentado

- **WHEN** se revisa la sección de mantenimiento del catálogo en `README.md`
- **THEN** describe los comandos de descubrimiento y de escritura explícita
- **AND** enumera las cuatro clasificaciones y la regla de no commitear el reporte candidato
- **AND** nombra sólo agentes o skills existentes

_Testeable con `test/model-catalog-discovery.test.js`: guard de contenido sobre `README.md` para los
tokens del procedimiento; el test no ejecuta `opencode` ni usa red._

## MODIFIED Requirements

### Requirement: Snapshot de catálogo verificado y guard de disponibilidad de IDs

El repositorio SHALL incluir un snapshot versionado en `src/core/model-catalog.json` con
`generated_at`, el método de verificación (`opencode models <provider> --verbose --refresh`) y un
mapa de proveedor a IDs completos. El snapshot SHALL contener TODOS los proveedores que enumera
`opencode models` en la máquina de mantenimiento, no sólo los que ya figuraban en el snapshot
vigente. El snapshot SHALL conservar el schema `{ generated_at, source: { method, providers },
providers }`; `providers` SHALL ser un mapa de proveedor a lista de entradas `{ id, cost, limit }`,
sin IDs duplicados y con el prefijo del proveedor en cada `id`.

El snapshot SHALL ser la fuente de disponibilidad que consume la resolución; el sistema NO SHALL
consultar la red ni el proveedor en `install`, `init`, `import`, `check` ni en la suite de tests.

La suite SHALL incluir un guard que falle cuando un identificador declarado en `TIERS` (cualquier tier
y agente), en `agents/*.md` o en `profiles/*/agents/*.md` no figure en el snapshot. El guard SHALL leer
sólo archivos versionados, NO SHALL ejecutar `opencode models` y NO SHALL depender de `.opencode/**`.

El refresco del snapshot SHALL ser una operación manual, provista por
`scripts/refresh-model-catalog.mjs`, que ejecute el descubrimiento dev-only del requirement
"Descubrimiento dev-only del catálogo con clasificación de frescura", normalice los IDs y reescriba el
JSON de forma atómica. El script NO SHALL correr automáticamente en CI ni como parte de otro comando.
Si el binario `opencode` no está disponible, la salida es offline o un proveedor falla, el script
SHALL fallar de forma explícita sin reemplazar el snapshot commiteado ni escribir un snapshot vacío o
parcial.

#### Scenario: Un ID presente en el snapshot pasa el guard

- **WHEN** el guard verifica un identificador que figura en `src/core/model-catalog.json`
- **THEN** la validación de ese identificador es satisfactoria

#### Scenario: Un ID inexistente rompe el guard

- **WHEN** `TIERS`, `agents/*.md` o `profiles/*/agents/*.md` declaran un identificador que no figura
  en el snapshot
- **THEN** el guard falla nombrando el identificador y su archivo de origen

_Testeable con `test/model-catalog.test.js`: sobre una copia en memoria del snapshot se retira un ID
real y se afirma que la validación lo reporta como ausente; el snapshot commiteado no se muta._

#### Scenario: El guard cubre tiers, canónica y perfiles

- **WHEN** se ejecuta el guard de catálogo
- **THEN** verifica los IDs de todos los tiers de `TIERS`
- **AND** verifica los `model:` de los diez `agents/*.md`
- **AND** verifica los `model:` de `profiles/*/agents/*.md`

#### Scenario: El guard no usa red

- **WHEN** se ejecuta la suite de tests
- **THEN** el guard lee sólo `src/core/model-catalog.json` y los archivos versionados
- **AND** no ejecuta `opencode models` ni ninguna llamada de red

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
