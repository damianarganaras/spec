# Spec: agent-model-tiers

## Purpose

Coherencia del modelo por defecto entre la canónica publicada `agents/*.md`, el tier `minimo`, el
catálogo de tiers y los mirrors instalados. Define la canónica como única fuente del default, la
regeneración del mirror por `upgrade`, la idempotencia y el no-op del tier sobre la canónica, y el
guard estructural que mantiene alineados el tier, la canónica y un único módulo dueño de `TIERS`.
Define además la resolución de `minimo` por cadena de preferencia contra un snapshot de catálogo
verificado, el único modelo gratis admitido y el estado de tier que `import` persiste.

## Requirements

### Requirement: Modelo por defecto uniforme en la canónica publicada

Los diez archivos `agents/*.md` versionados SHALL declarar el mismo valor en la clave `model:` de su
frontmatter. Ese valor SHALL ser el modelo por defecto que publica el paquete (`package.json` incluye
`agents` en `files`) y el que un proyecto recibe al instalar sin un tier que lo contradiga. La
canónica SHALL ser la única fuente del default: el CLI NO SHALL tomar el modelo por defecto de un
mirror editado fuera de banda ni de una instalación global.

#### Scenario: La canónica declara un único modelo por defecto

- **WHEN** se leen los diez `agents/*.md` versionados
- **THEN** los diez declaran el mismo valor en `model:`
- **AND** no queda ningún agente con un modelo distinto (ni `coder` ni `technical-seed-writer`
  conservan uno propio)

_Testeable con `test/agent-model-coherence.test.js`: el guard lee el `model:` de cada `agents/*.md`
y exige un único valor distinto entre los diez._

### Requirement: `upgrade` regenera el mirror de agents desde la canónica

`ancleto upgrade` SHALL regenerar los agents instalados del host desde la canónica versionada,
aplicando el adaptador del host, **para los agentes base que no son reemplazados por un overlay de
perfil**. Para `opencode`, cuyo adaptador es identidad, el mirror de esos agentes base SHALL quedar
byte-idéntico a la adaptación de la canónica más las notas de host que correspondan (p. ej.
`CAVEMAN_USAGE_NOTE` en `orchestrator` cuando la compresión está habilitada), de modo que una línea
`model:` editada fuera de banda vuelva al valor canónico. El CLI NO SHALL requerir la edición manual
de `.opencode/agents/*.md` para mantener el default publicado.

**Exclusión — overlay del perfil `test`:** con `profile: test`, `upgrade` reemplaza `tester` y
`reviewer` por `profiles/test/agents/*.md` después de instalar los agentes base
(`installProfileOverlay` corre después de `installAgentAssets` en `src/cli/index.js:1824`). En
`upgrade` (que no aplica tier) el `model:` de esos dos archivos lo fija el perfil y no la canónica,
así que quedan fuera de la garantía de byte-identidad: la canónica no es dueña de esos dos archivos
en ese perfil. En `install`/`update` el tier es dueño de `model:` para todos los agents instalados,
overlay incluido, porque `applyTier` corre después de `installProfileOverlay`
(`src/cli/index.js:1749`/`1949` vs `:1769`/`:1966`); ese estado no es divergencia. Alinear el
proveedor de los agentes del perfil queda fuera de alcance —exigiría IDs `commandcode/...` no
verificables contra el catálogo del proveedor (p. ej. `commandcode/qwen3.6-plus`), el mismo riesgo ya
rechazado para `TIERS.normal`— y queda en backlog.

#### Scenario: `upgrade` revierte un `model:` editado en el mirror

- **WHEN** el mirror declara un `model:` distinto del canónico y se ejecuta `ancleto upgrade`
- **THEN** cada `.opencode/agents/<n>.md` de los agentes base coincide byte a byte con la adaptación
  canónica más las notas de host que correspondan (p. ej. `CAVEMAN_USAGE_NOTE` en `orchestrator`
  cuando la compresión está habilitada)
- **AND** la línea `model:` del mirror vuelve al valor canónico

_Testeable con `test/cli.test.js`: instala, edita el `model:` del mirror y ejecuta `upgrade`; afirma
la igualdad byte a byte con la adaptación de la canónica más las notas de host que correspondan._

_No-testeable-por-construcción: que una persona no edite `.opencode/**` a mano es una no-acción sin
salida observable. La regla se cumple por proceso y su consecuencia verificable es la anterior:
`upgrade` revierte cualquier desvío._

#### Scenario: `profile: test` reemplaza tester y reviewer por el overlay

- **WHEN** un proyecto con `profile: test` ejecuta `ancleto upgrade`
- **THEN** `.opencode/agents/tester.md` y `.opencode/agents/reviewer.md` coinciden byte a byte con
  `profiles/test/agents/tester.md` y `profiles/test/agents/reviewer.md` respectivamente, no con
  `agents/tester.md` ni `agents/reviewer.md`
- **AND** los otros ocho agentes coinciden byte a byte con la adaptación de su `agents/<n>.md`
  canónico más las notas de host que correspondan (`CAVEMAN_USAGE_NOTE` en `orchestrator` cuando la
  compresión está habilitada)
- **AND** la identidad byte a byte con el perfil se cumple sólo después de `upgrade`: `install`/`update`
  con un tier aplican el tier también a esos dos agentes (el tier es dueño de `model:` en esa fase), y
  ese estado NO es divergencia: lo reporta el aviso de tier de `ancleto check`, no un error de
  frontmatter.

_Testeable con `test/cli.test.js`: inicializa con `profile: test`, ejecuta `upgrade` y compara byte a
byte los diez archivos instalados contra la fuente que corresponde a cada uno (el perfil verbatim;
la canónica más las notas de host que correspondan)._

### Requirement: Resolución de `minimo` por cadena de preferencia contra un catálogo verificado

El tier `minimo` SHALL resolverse por una cadena ordenada de candidatos por agente, declarada en
`TIER_CHAINS` y exportada desde `src/core/tier-models.js`. Para cada agente, el sistema SHALL elegir
el primer candidato de la cadena que figure en el snapshot de catálogo verificado; la cadena inicial
SHALL ser `commandcode/deepseek/deepseek-v4.1-flash` → `opencode-go/deepseek-v4.1-flash` →
`opencode/deepseek-v4.1-flash-free`.

La forma de `TIERS` NO SHALL cambiar: cada tier SHALL seguir siendo un objeto plano agente→string y
`TIERS.minimo[agente]` SHALL conservar la cabeza de su cadena. La resolución SHALL exponerse como una
función pura que recibe el catálogo como argumento, sin lectura de archivos, sin procesos externos y
sin estado global mutable, de modo que otra fuente de catálogo pueda sustituir al snapshot sin
cambiar esa interfaz.

Si ningún candidato de la cadena de un agente figura en el catálogo, el sistema SHALL fallar con un
error explícito que nombre el agente y la cadena completa. NO SHALL escribir un identificador
inventado, NO SHALL usar un candidato fuera de la cadena y NO SHALL continuar en silencio.
`install`, `init` e `import` SHALL abortar con exit code no cero cuando la resolución falla en un host
que escribe `model:`; en los hosts que eliminan el campo o emiten un valor propio, el tier NO SHALL
resolverse ni abortar por catálogo (ver el requirement "La resolución de tier sólo aplica a hosts que
escriben `model:`").

#### Scenario: La cabeza de la cadena está disponible

- **WHEN** el catálogo contiene `commandcode/deepseek/deepseek-v4.1-flash`
- **THEN** la resolución de `minimo` elige ese ID para cada agente
- **AND** el modelo escrito coincide con la cabeza declarada en `TIERS.minimo`

#### Scenario: La cabeza no está disponible y el segundo candidato sí

- **WHEN** el catálogo no contiene la cabeza de la cadena pero sí contiene `opencode-go/deepseek-v4.1-flash`
- **THEN** la resolución de `minimo` elige `opencode-go/deepseek-v4.1-flash` para cada agente
- **AND** no se escribe la cabeza ausente

#### Scenario: Sólo el tercer candidato está disponible

- **WHEN** el catálogo no contiene ni la cabeza ni el segundo candidato pero sí `opencode/deepseek-v4.1-flash-free`
- **THEN** la resolución de `minimo` elige `opencode/deepseek-v4.1-flash-free` para cada agente
- **AND** no se escribe ningún candidato ausente

#### Scenario: Ningún candidato de la cadena está en el catálogo

- **WHEN** el catálogo no contiene ninguno de los candidatos de la cadena de un agente
- **THEN** la resolución falla con un error explícito que nombra el agente y la cadena completa
- **AND** `install`, `init` e `import` sobre `opencode` abortan con exit code no cero
- **AND** ningún agente se escribe con un identificador inventado

_Testeable con `test/model-catalog.test.js`: catálogos inyectados con distintas combinaciones de
candidatos y con ninguno; la aserción incluye el mensaje de error con el agente y la cadena._

#### Scenario: El resolver es puro sobre un catálogo inyectable

- **WHEN** se invoca la resolución con un catálogo construido en memoria
- **THEN** el resultado depende sólo de ese catálogo y de `TIER_CHAINS`
- **AND** la función no lee archivos, no ejecuta procesos y no muta estado global

_Testeable con `test/model-catalog.test.js`: dos catálogos distintos producen resoluciones distintas
sin tocar el snapshot commiteado._

#### Scenario: `TIERS.minimo` conserva la forma y la cabeza de la cadena

- **WHEN** se inspecciona `TIERS.minimo`
- **THEN** es un objeto plano agente→string
- **AND** cada valor es igual a la cabeza de `TIER_CHAINS.minimo` para ese agente
- **AND** `applyTier` no requiere cambios de firma

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

_Testeable con `test/model-catalog-discovery.test.js`: guard de contenido sobre `README.md` para los
tokens del procedimiento; el test no ejecuta `opencode` ni usa red._

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

### Requirement: Modelo `reviewer` del tier `normal` verificado

`TIERS.normal.reviewer` SHALL declarar un identificador presente en el snapshot de catálogo y del
proveedor `opencode-go`, consistente con el resto del tier `normal`. El identificador inexistente
`opencode-go/qwen3.6-plus` NO SHALL volver a declararse. El overlay
`profiles/test/agents/reviewer.md` SHALL declarar un identificador presente en el snapshot.

#### Scenario: El reviewer usa un ID verificado del proveedor del tier

- **WHEN** se leen `TIERS.normal.reviewer` y el snapshot de catálogo
- **THEN** el ID del reviewer figura en el snapshot con proveedor `opencode-go`
- **AND** el proveedor coincide con el usado por el resto de `TIERS.normal`

#### Scenario: El ID roto no reaparece

- **WHEN** se revisan `TIERS.normal` y `profiles/test/agents/reviewer.md`
- **THEN** ninguno declara `opencode-go/qwen3.6-plus`

### Requirement: `gratis` limitado al modelo gratuito verificado

El tier `gratis` SHALL resolver los diez agentes al único modelo gratuito verificado,
`GRATIS_FALLBACK_MODEL` (`opencode/big-pickle`, costo 0 por token de entrada y salida). El sistema NO
SHALL ofrecer un segundo modelo gratis conocido, NO SHALL detectar Muse Spark y NO SHALL interpretar
`ANCLETO_MUSE_SPARK`.

Un valor de `.ancletorc.gratisModel` que no sea el modelo gratuito conocido SHALL ignorarse: NO SHALL
aplicarse, NO SHALL producir un error y NO SHALL producir divergencia en `check`. En `install`,
`update` e `init`, el sistema SHALL normalizarlo al gratis resuelto. Un valor conocido SHALL
conservarse y una clave ausente NO SHALL agregarse.

#### Scenario: `gratis` aplica el modelo de costo 0

- **WHEN** se instala con `--tier gratis`
- **THEN** los diez agentes declaran `GRATIS_FALLBACK_MODEL` (`opencode/big-pickle`)
- **AND** no se declara ningún otro modelo gratis

#### Scenario: Un `gratisModel` desconocido se normaliza

- **WHEN** `.ancletorc.gratisModel` declara un identificador desconocido (por ejemplo, un
  `muse-spark` legacy)
- **THEN** `install`/`update` lo ignoran y persisten `opencode/big-pickle` como `gratisModel`
- **AND** los agentes se escriben con `opencode/big-pickle`
- **AND** el comando completa sin error

#### Scenario: Un `gratisModel` conocido se conserva

- **WHEN** `.ancletorc.gratisModel` ya declara `opencode/big-pickle`
- **THEN** el valor se conserva
- **AND** los agentes se escriben con ese modelo

#### Scenario: No hay detección ni variable de entorno

- **WHEN** se ejecuta cualquier comando con tier `gratis`
- **THEN** el sistema no ejecuta `opencode models` para detectar Muse Spark
- **AND** la variable `ANCLETO_MUSE_SPARK` no altera el modelo resuelto

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

### Requirement: `import` persiste el estado de tier que aplica

Cuando `ancleto import` aplique un tier porque el host escribe `model:` (`opencode`), el comando SHALL
escribir `.opencode/.ancleto-tier` con el nombre del tier aplicado, con paridad con `init`: el archivo
SHALL contener una única línea con el tier y un salto de línea. Un `ancleto check` inmediatamente
posterior NO SHALL reportar `frontmatter diverge del adaptador` por ese motivo. Si el proyecto destino
ya tenía otro tier, el archivo SHALL quedar con el tier nuevo del bundle, no con el viejo. Cuando el
host no escribe `model:`, el comando NO SHALL escribir un estado de tier que no aplicó.

#### Scenario: El check posterior no diverge tras un import

- **WHEN** se ejecuta `ancleto import <bundle>` con un tier sobre un proyecto destino y luego
  `ancleto check`
- **THEN** `.opencode/.ancleto-tier` contiene el tier aplicado
- **AND** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** el exit code del check es 0

#### Scenario: Un import sobre un proyecto inicializado reemplaza el tier viejo

- **WHEN** el proyecto destino ya tenía `.opencode/.ancleto-tier` con otro tier y se importa un bundle
  con tier `minimo`
- **THEN** el archivo queda en `minimo`
- **AND** el check posterior NO SHALL reportar divergencia por el tier anterior

_Testeable con `test/cli.test.js`: import sobre un proyecto vacío y sobre uno instalado con otro tier;
afirma el contenido de `.opencode/.ancleto-tier`, la ausencia de `frontmatter diverge` y exit 0._

### Requirement: `import` resuelve el tier antes de la primera escritura

`ancleto import` SHALL leer el bundle, resolver el catálogo y calcular el mapa de modelos del tier
ANTES de escribir cualquier archivo en el proyecto destino (manifiesto, templates, assets o agents).
Si la resolución falla por ausencia total de candidatos en un host que escribe `model:`, el comando
SHALL abortar con un error explícito y exit code no cero sin dejar estado parcial: NO SHALL escribir
`.ancletorc`, NO SHALL escribir templates y NO SHALL escribir agents. El error SHALL nombrar el agente
y la cadena completa.

#### Scenario: Un fallo de resolución no deja estado parcial

- **WHEN** se ejecuta `ancleto import <bundle>` con un catálogo que no contiene ningún candidato de la
  cadena del tier
- **THEN** el comando sale con exit code 1 y un error que nombra el agente y la cadena
- **AND** `.ancletorc`, los templates y `.opencode/agents/*.md` no existen en el destino

_Testeable con `test/cli.test.js`: bundle con template y `ANCLETO_MODEL_CATALOG` sin ningún candidato;
afirma exit 1, el mensaje y la ausencia de manifiesto, template y agents._

### Requirement: `import` persiste `gratisModel` sólo cuando el bundle declara la clave

`ancleto import` SHALL persistir `gratisModel` en `.ancletorc` sólo si la clave existía en el bundle.
El valor persistido SHALL ser el `gratisModel` resuelto: un valor conocido SHALL conservarse y un valor
desconocido SHALL normalizarse a `GRATIS_FALLBACK_MODEL`. Si el bundle no declara la clave, el import
NO SHALL agregarla, aunque el tier sea `gratis`. La normalización NO SHALL fallar ni emitir error por
un valor desconocido.

#### Scenario: Un `gratisModel` desconocido del bundle se normaliza

- **WHEN** el bundle declara `gratisModel` desconocido y tier `gratis`
- **THEN** `.ancletorc.gratisModel` queda en `GRATIS_FALLBACK_MODEL`
- **AND** los agents instalados declaran ese modelo
- **AND** el comando completa sin error

#### Scenario: Una clave ausente no se agrega

- **WHEN** el bundle no declara `gratisModel`
- **THEN** `.ancletorc` del destino no tiene la clave `gratisModel`
- **AND** el import completa sin error

_Testeable con `test/cli.test.js`: bundle con valor legacy desconocido y bundle sin la clave; afirma
la normalización y la ausencia de la clave._

### Requirement: La resolución de tier sólo aplica a hosts que escriben `model:`

`install`, `init` e `import` SHALL resolver el tier y SHALL abortar por ausencia total de candidatos
sólo cuando el host destino escriba `model:` (`opencode`). En los hosts cuyo adaptador elimina
`model:` (`commandcode`, `claude`, `vscode`, `copilot`) o emite un valor propio (`antigravity`:
`model: inherit`), el comando NO SHALL resolver el catálogo, NO SHALL abortar por falta de candidatos
y NO SHALL escribir un modelo de tier. La instalación global (sin `--project`) SHALL resolver siempre,
porque copia los assets de `opencode` con independencia del flag `--agent`.

#### Scenario: Un host que dropea `model:` no resuelve ni aborta

- **WHEN** se ejecuta `install --project --agent claude` o `init --agent claude` con tier `minimo` y
  un catálogo sin ningún candidato
- **THEN** el comando completa con exit 0 y sin el error de falta de candidatos
- **AND** el layout del host se instala

#### Scenario: `antigravity` emite `model: inherit` y no resuelve

- **WHEN** se instala con `--agent antigravity` y un catálogo sin candidatos
- **THEN** el comando NO SHALL abortar por catálogo
- **AND** los agents instalados declaran `model: inherit` y ningún modelo de tier

#### Scenario: opencode sigue abortando

- **WHEN** se ejecuta `install --project --tier minimo` o `init --tier minimo` con `agent` `opencode`
  y un catálogo sin ningún candidato
- **THEN** el comando aborta con exit code no cero y un error que nombra el agente y la cadena
- **AND** no se escribe un agent con un ID inventado ni el estado de tier

_Testeable con `test/cli.test.js`: `install`/`init` con `--agent claude` y un catálogo vacío completan
sin abortar; `install`/`init` con `opencode` y el mismo catálogo salen con exit 1._

### Requirement: Aplicación de tier idempotente y no-op sobre la canónica

`applyTier` NO SHALL alterar el contenido de un agent cuyo `model:` ya coincide con el valor que el
tier declara para ese agente. `TIERS.minimo` SHALL mapear cada nombre de agent canónico a la cabeza de
su cadena, que SHALL ser el modelo por defecto publicado, de modo que aplicar el tier sobre la
canónica sea un no-op **cuando la cabeza está disponible en el catálogo**. `ancleto install` y
`ancleto update` con tier `minimo` y la cabeza disponible SHALL dejar los agents base de `opencode`
byte-idénticos a la adaptación de la canónica más las notas de host que correspondan (p. ej.
`CAVEMAN_USAGE_NOTE` en `orchestrator` cuando la compresión está habilitada); los agentes
reemplazados por el overlay del perfil `test` se rigen por el requirement de `upgrade`.

Cuando la cabeza no esté disponible, la resolución por cadena del requirement "Resolución de `minimo`
por cadena de preferencia contra un catálogo verificado" SHALL aplicarse y el mirror SHALL declarar el
primer candidato disponible. Ese estado NO SHALL ser un no-op y NO SHALL considerarse divergencia de
frontmatter: lo reporta el aviso de tier de `ancleto check`.

#### Scenario: `install --tier minimo` no cambia el contenido de los agents

- **WHEN** se ejecuta `ancleto install --project --tier minimo` sobre un proyecto sin agents previos
  y la cabeza de la cadena está disponible
- **THEN** cada `.opencode/agents/<n>.md` de los agentes base es byte-idéntico a la adaptación de
  `agents/<n>.md` más las notas de host que correspondan (p. ej. `CAVEMAN_USAGE_NOTE` en
  `orchestrator` cuando la compresión está habilitada)
- **AND** ninguna línea `model:` cambia de valor

_Testeable con `test/cli.test.js`: compara byte a byte los diez archivos instalados con la adaptación
de la canónica más las notas de host que correspondan._

#### Scenario: Aplicar el mismo tier dos veces es idempotente

- **WHEN** se aplica el tier `minimo` a agents que ya declaran el modelo canónico
- **THEN** el contenido de cada agent permanece igual
- **AND** no se produce una segunda representación del campo `model:`

_Testeable con `test/cli.test.js`: dos aplicaciones consecutivas de `minimo` dejan el mismo
contenido y una sola línea `model:` por archivo._

#### Scenario: La cabeza ausente no produce un ID inventado

- **WHEN** se ejecuta `ancleto install --tier minimo` sin la cabeza de la cadena en el catálogo
- **THEN** los agentes declaran el primer candidato disponible de la cadena
- **AND** no se escribe la cabeza ausente ni un identificador fuera de la cadena

_Testeable con `test/cli.test.js`: instala con un catálogo inyectado sin la cabeza y afirma el segundo
candidato en los diez agentes._

### Requirement: Guard estructural de coherencia entre canónica, tier minimo y catálogo

La suite SHALL incluir un guard estructural que falle cuando el conjunto de nombres de agent de
`TIERS.minimo` difiera del conjunto de `agents/*.md`, cuando el valor de `TIERS.minimo` de un agente
difiera del `model:` canónico de ese agente, o cuando el valor de `TIERS.minimo` de un agente difiera
de la cabeza de `TIER_CHAINS.minimo` para ese agente. El guard SHALL derivar el lado canónico de
`agents/*.md` y el lado del tier de `TIERS` y `TIER_CHAINS` exportados desde
`src/core/tier-models.js`, y NO SHALL codificar identificadores de proveedor. El guard NO SHALL
depender de `.opencode/**`, que es local y no se versiona. El guard SHALL afirmar además que
`TIER_CHAINS.minimo` cubre exactamente el mismo conjunto de agentes que `TIERS.minimo`.

La tabla de tiers SHALL tener un único módulo dueño (`src/core/tier-models.js`), del cual
`src/cli/index.js` importa `TIERS`, `TIER_CHAINS` y el resolver. Ningún otro archivo bajo `src/` SHALL
declarar `TIERS` ni `TIER_CHAINS`: el guard SHALL verificar ese dueño único escaneando `src/**/*.js`
y tolerando `const`, `let`, `Object.freeze(` y declaraciones multilínea.

El guard SHALL afirmar que `profiles/test/agents/tester.md` y `profiles/test/agents/reviewer.md`
existen como overlay deliberado del perfil `test`, y NO SHALL incluirlos en el conjunto canónico ni
comparar su `model:` ni codificar su identificador de proveedor. La validez de los IDs del overlay
respecto del snapshot se cubre en el guard de catálogo, no en este guard.

#### Scenario: Una desalineación entre catálogo y tier rompe el guard

- **WHEN** se ejecuta `test/agent-model-coherence.test.js`
- **THEN** el guard compara el conjunto de nombres y el modelo por agente de `TIERS.minimo` contra
  la canónica
- **AND** compara cada valor de `TIERS.minimo` contra la cabeza de `TIER_CHAINS.minimo`
- **AND** falla si falta un agente, sobra uno, el modelo de un agente difiere de la canónica o la
  cabeza de la cadena difiere del valor del tier

_Testeable con el propio `test/agent-model-coherence.test.js`: los dos lados se derivan de los
archivos versionados y de los símbolos exportados; no hay fixture que mute el repositorio._

_No-testeable-por-construcción (modo de falla): el escenario describe cómo falla el guard, no una
ejecución separada. La suite corre contra el repositorio versionado y no muta `TIERS`,
`TIER_CHAINS` ni `agents/*.md` para provocar la desalineación. La aserción que lo enuncia es exacta:
igualdad de conjuntos entre `TIERS.minimo` y `agents/*.md`, igualdad por agente entre
`TIERS.minimo[n]` y el `model:` canónico, e igualdad entre `TIERS.minimo[n]` y
`TIER_CHAINS.minimo[n][0]`; si falta, sobra o difiere, esa aserción falla._

#### Scenario: El overlay del perfil `test` queda fuera del conjunto canónico

- **WHEN** se revisa `test/agent-model-coherence.test.js`
- **THEN** el guard afirma que `profiles/test/agents/tester.md` y `profiles/test/agents/reviewer.md`
  existen
- **AND** no los incluye en el conjunto canónico, no compara su `model:` y no codifica su
  identificador de proveedor

_Testeable con el propio test: las rutas del overlay se afirman existentes y el conjunto canónico se
deriva sólo de `agents/*.md`._

#### Scenario: El guard no duplica el valor que verifica

- **WHEN** se revisa `test/agent-model-coherence.test.js`
- **THEN** el test no contiene identificadores de proveedor escritos como literales
- **AND** no lee `.opencode/**` ni ningún archivo gitignored

_Testeable con el propio test como content guard: afirma la fuente versionada de cada lado y la
ausencia de la ruta local en el archivo._

#### Scenario: El tier y la cadena tienen un único módulo dueño

- **WHEN** se revisa `src/cli/index.js` y `src/core/tier-models.js`
- **THEN** `TIERS` y `TIER_CHAINS` se declaran y exportan sólo en `src/core/tier-models.js`
- **AND** `src/cli/index.js` los importa desde allí
- **AND** ningún otro archivo bajo `src/**/*.js` declara `TIERS` ni `TIER_CHAINS`, tolerando `const`,
  `let`, `Object.freeze(` y declaraciones multilínea

_Testeable con `test/agent-model-coherence.test.js`: importa los símbolos desde
`src/core/tier-models.js`, afirma que `src/cli/index.js` no los vuelve a declarar y escanea
`src/**/*.js` para exigir el dueño único._

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
- **AND** lee sólo archivos versionados, no ejecuta `opencode models` y no depende de `.opencode/**`
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

### Requirement: El aviso de tier huérfano requiere una superficie de agentes locales

`ancleto check` SHALL emitir el aviso de tier huérfano sólo cuando el proyecto declare al menos una
superficie de agentes locales. La superficie SHALL derivarse con `localAgentDirs(rc)` —el target de
agentes del host resuelto en `rc.agent` más `installedPaths.agents`—; NO SHALL derivarse de una lista
de nombres de host ni de `.opencode/agents` fijo. La unión multi-host (`installedHostsFromPaths`) y
los escenarios multi-host de tier quedan FUERA de este requirement (diferidos, según H9).

Cuando `localAgentDirs(rc)` devuelva una lista vacía, el tier SHALL considerarse dormido: NO SHALL
emitirse el aviso, aunque `.opencode/.ancleto-tier` exista y declare un tier válido. Cuando exista al
menos un directorio declarado y la cantidad de archivos `.md` en los directorios existentes sea cero,
el aviso SHALL emitirse con el texto existente. La ausencia del archivo de tier o un tier que no
pertenezca a `TIERS` NO SHALL producir aviso.

Este change es exclusivamente de oráculo: `init`, `install` e `import` NO SHALL cambiar su escritura
de `.opencode/.ancleto-tier`, y `check` NO SHALL cambiar su exit code
(`missing > 0 ? 1 : 0`) ni sumar el aviso a `missing` u `orphans`.

#### Scenario: Un proyecto sano con un host sin superficie de agentes no advierte

- **WHEN** un proyecto instalado con `cursor` o `roo` tiene `.opencode/.ancleto-tier` con un tier
  válido y `ancleto check` se ejecuta
- **THEN** `localAgentDirs(rc)` devuelve una lista vacía
- **AND** `check` NO SHALL emitir el aviso `tier ... sin agentes locales`
- **AND** el exit code es 0

#### Scenario: Una superficie declarada sin archivos conserva el aviso

- **WHEN** el proyecto declara un directorio de agentes locales (`opencode` u `antigravity`) y ese
  directorio no contiene archivos `.md`
- **THEN** `check` SHALL emitir el aviso existente
  `tier "<t>" sin agentes locales donde aplicarlo — este proyecto usa los agentes globales. Corre 'ancleto install --project .' para que el tier aplique, o borra .opencode/.ancleto-tier.`
- **AND** el exit code es 0

#### Scenario: Sin archivo de tier o con un tier desconocido no hay aviso

- **WHEN** `.opencode/.ancleto-tier` no existe, o contiene un valor que no pertenece a `TIERS`
- **THEN** `check` NO SHALL emitir el aviso de tier huérfano
- **AND** el exit code no cambia por ese motivo

#### Scenario: Los escritores conservan la escritura del estado de tier

- **WHEN** se ejecutan `ancleto init`, `ancleto install` o `ancleto import` en un host que escribe
  `model:`
- **THEN** `.opencode/.ancleto-tier` se escribe con la misma semántica que antes del change
- **AND** ningún escritor consulta ni depende de la nueva condición del oráculo
