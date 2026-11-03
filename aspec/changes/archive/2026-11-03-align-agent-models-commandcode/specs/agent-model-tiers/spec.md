# Delta: agent-model-tiers

## ADDED Requirements

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

### Requirement: Aplicación de tier idempotente y no-op sobre la canónica

`applyTier` NO SHALL alterar el contenido de un agent cuyo `model:` ya coincide con el valor que el
tier declara para ese agente. El tier `minimo` SHALL mapear cada nombre de agent canónico al modelo
por defecto publicado, de modo que aplicarlo sobre la canónica sea un no-op. `ancleto install` y
`ancleto update` con tier `minimo` SHALL dejar los agents base de `opencode` byte-idénticos a la
adaptación de la canónica más las notas de host que correspondan (p. ej. `CAVEMAN_USAGE_NOTE` en
`orchestrator` cuando la compresión está habilitada); los agentes reemplazados por el overlay del
perfil `test` se rigen por el requirement de `upgrade`.

#### Scenario: `install --tier minimo` no cambia el contenido de los agents

- **WHEN** se ejecuta `ancleto install --project --tier minimo` sobre un proyecto sin agents previos
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

### Requirement: Guard estructural de coherencia entre canónica, tier minimo y catálogo

La suite SHALL incluir un guard estructural que falle cuando el conjunto de nombres de agent de
`TIERS.minimo` difiera del conjunto de `agents/*.md`, o cuando el valor de `TIERS.minimo` de un
agente difiera del `model:` canónico de ese agente. El guard SHALL derivar el lado canónico de
`agents/*.md` y el lado del tier del `TIERS` exportado desde `src/core/tier-models.js`, y NO SHALL
codificar identificadores de proveedor. El guard NO SHALL depender de `.opencode/**`, que es local y
no se versiona.

La tabla de tiers SHALL tener un único módulo dueño (`src/core/tier-models.js`), del cual
`src/cli/index.js` importa `TIERS`; el traslado SHALL preservar los valores de `normal` y `gratis`.
La preservación de esos dos valores NO tiene aserción automatizada permanente en este change: se
verifica con el diff/byte-compare de este change y un snapshot permanente de valores queda en
backlog (documentado, no omitido en silencio). Ningún otro archivo bajo `src/` SHALL declarar
`TIERS`: el guard SHALL verificar ese dueño único escaneando `src/**/*.js` y tolerando `const`, `let`,
`Object.freeze(` y declaraciones multilínea.

El guard SHALL afirmar que `profiles/test/agents/tester.md` y `profiles/test/agents/reviewer.md`
existen como overlay deliberado del perfil `test`, y NO SHALL incluirlos en el conjunto canónico ni
comparar su `model:` ni codificar su identificador de proveedor.

#### Scenario: Una desalineación entre catálogo y tier rompe el guard

- **WHEN** se ejecuta `test/agent-model-coherence.test.js`
- **THEN** el guard compara el conjunto de nombres y el modelo por agente de `TIERS.minimo` contra
  la canónica
- **AND** falla si falta un agente, sobra uno o el modelo de un agente difiere

_Testeable con el propio `test/agent-model-coherence.test.js`: los dos lados se derivan de los
archivos versionados y la comparación se enuncia en el test; no hay fixture que mute el repositorio._

_No-testeable-por-construcción (modo de falla): el escenario describe cómo falla el guard, no una
ejecución separada. La suite corre contra el repositorio versionado y no muta `TIERS` ni
`agents/*.md` para provocar la desalineación. La aserción que lo enuncia es exacta: igualdad de
conjuntos entre `TIERS.minimo` y `agents/*.md`, e igualdad por agente entre `TIERS.minimo[n]` y el
`model:` canónico de `agents/<n>.md`; si falta, sobra o difiere, esa aserción falla._

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

#### Scenario: El tier tiene un único módulo dueño

- **WHEN** se revisa `src/cli/index.js` y `src/core/tier-models.js`
- **THEN** `TIERS` se declara y exporta sólo en `src/core/tier-models.js`
- **AND** `src/cli/index.js` lo importa desde allí y los valores de `normal` y `gratis` no cambian
- **AND** ningún otro archivo bajo `src/**/*.js` declara `TIERS`, tolerando `const`, `let`,
  `Object.freeze(` y declaraciones multilínea

_Testeable con `test/agent-model-coherence.test.js`: importa `TIERS` desde `src/core/tier-models.js`,
afirma que `src/cli/index.js` no vuelve a declarar el objeto y escanea `src/**/*.js` para exigir el
dueño único._
