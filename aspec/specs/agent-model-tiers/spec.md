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
