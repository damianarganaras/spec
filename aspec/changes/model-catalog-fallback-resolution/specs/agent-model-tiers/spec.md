# Delta: agent-model-tiers

## ADDED Requirements

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
`install`, `init` e `import` SHALL abortar con exit code no cero cuando la resolución falla.

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
- **AND** `install`, `init` e `import` abortan con exit code no cero
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

### Requirement: Snapshot de catálogo verificado y guard de disponibilidad de IDs

El repositorio SHALL incluir un snapshot versionado en `src/core/model-catalog.json` con
`generated_at`, el método de verificación (`opencode models <provider> --verbose`) y un mapa de
proveedor a IDs completos. El snapshot SHALL ser la fuente de disponibilidad que consume la
resolución; el sistema NO SHALL consultar la red ni el proveedor en `install`, `init`, `import`,
`check` ni en la suite de tests.

La suite SHALL incluir un guard que falle cuando un identificador declarado en `TIERS` (cualquier tier
y agente), en `agents/*.md` o en `profiles/*/agents/*.md` no figure en el snapshot. El guard SHALL leer
sólo archivos versionados, NO SHALL ejecutar `opencode models` y NO SHALL depender de `.opencode/**`.

El refresco del snapshot SHALL ser una operación manual, provista por
`scripts/refresh-model-catalog.mjs`, que ejecute `opencode models <provider> --verbose`, normalice los
IDs y reescriba el JSON. El script NO SHALL correr automáticamente en CI ni como parte de otro
comando. Si el proveedor no está disponible, el script SHALL fallar de forma explícita sin escribir un
snapshot vacío.

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
- **THEN** declara `generated_at`, el método de verificación y los proveedores de origen
- **AND** los IDs están completos, con prefijo de proveedor

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

## MODIFIED Requirements

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
