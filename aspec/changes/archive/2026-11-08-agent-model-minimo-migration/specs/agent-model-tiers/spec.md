# Delta: agent-model-minimo-migration

## MODIFIED Requirements

### Requirement: Resolución de `minimo` por cadena de preferencia contra un catálogo verificado

El tier `minimo` SHALL resolverse por una cadena ordenada de candidatos por agente, declarada en
`TIER_CHAINS` y exportada desde `src/core/tier-models.js`. Para cada agente, el sistema SHALL elegir
el primer candidato de la cadena que figure en el snapshot de catálogo verificado; la cadena inicial
SHALL ser `opencode-go/deepseek-v4.1-flash` → `opencode/deepseek-v4.1-flash-free`.

La cabeza de la cadena SHALL ser el modelo que publica la canónica `agents/*.md`. Para los diez
agentes, `TIERS.minimo[agente]` SHALL ser igual al `model:` de `agents/<agente>.md` y SHALL ser igual
a la cabeza de `TIER_CHAINS.minimo[agente]`. El identificador
`commandcode/deepseek/deepseek-v4.1-flash` NO SHALL figurar como candidato de la cadena: el proveedor
dejó de usarse y la canónica ya migró a `opencode-go/deepseek-v4.1-flash`. La tabla de tiers es
derivada y NO SHALL declarar un modelo que la canónica no publique.

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

- **WHEN** el catálogo contiene `opencode-go/deepseek-v4.1-flash`
- **THEN** la resolución de `minimo` elige ese ID para cada agente
- **AND** el modelo escrito coincide con la cabeza declarada en `TIERS.minimo`
- **AND** coincide con el `model:` de `agents/<agente>.md`

#### Scenario: La cabeza no está disponible y el candidato restante sí

- **WHEN** el catálogo no contiene la cabeza de la cadena pero sí contiene
  `opencode/deepseek-v4.1-flash-free`
- **THEN** la resolución de `minimo` elige `opencode/deepseek-v4.1-flash-free` para cada agente
- **AND** no se escribe la cabeza ausente ni `commandcode/deepseek/deepseek-v4.1-flash`

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
