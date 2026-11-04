# Spec delta: host-compression-note-consistency — agent-install-routing

## MODIFIED Requirements

### Requirement: Compresión por defecto con uso condicional host-scoped y compuerta de medición

El CLI SHALL configurar el MCP de compresión (caveman) por defecto cuando su binario esté disponible,
como configuración del host (`opencode.json` para `opencode`, `.agents/mcp_config.json` para
`antigravity`), sin introducir configuración MCP de host fuera de esa excepción.

La materialización de `CAVEMAN_USAGE_NOTE` SHALL cumplir este invariante acotado al host activo de
la corrida — el host que el comando está instalando o importando —: para el orchestrator de ese
host, la nota existe si y sólo si ese host soporta compresión y la configuración MCP final de ese
mismo host incluye `caveman`. La decisión SHALL ser estado-driven y SHALL usar la misma fuente de
verdad que `ancleto check`; NO SHALL depender únicamente de una detección de binario al vuelo cuando
la configuración ya define el estado. La configuración final SHALL comprender la configuración
presente en disco y la configuración que el propio comando escribirá durante su ejecución.

La consistencia cross-host NO SHALL considerarse parte de este invariante: las escrituras MCP en
`.opencode` originadas por un host distinto del activo (H3), la derivación de host desde
`installedPaths` multi-host (H9) y la rama global de `install` sin `--project` — que copia
`agents/**` verbatim y no es evaluada por `ancleto check` — quedan fuera de alcance. El invariante
rige para las instalaciones de proyecto que `ancleto check` evalúa. Por eso, en un proyecto mixto, el
aviso advisory de `ancleto check` NO SHALL interpretarse como incumplimiento de este invariante.

Cuando la configuración en disco ya incluye `caveman`, `install` e `init` SHALL materializar la nota
aunque `--no-mcp` esté activo o el binario no se detecte. Cuando ni la configuración en disco ni la
configuración final escrita por el comando incluyen `caveman`, la nota NO SHALL materializarse. En un
host sin soporte de compresión la nota NO SHALL materializarse.

Excepción degenerada (M2): cuando la configuración MCP del host no es JSON parseable, `install` e
`init` SHALL omitir esa escritura y emitir aviso, y la nota SHALL materializarse igual por la escritura
pendiente; `ancleto check` puede entonces reportar divergencia. `import <bundle>` en `opencode` queda
fuera de esta excepción: sobrescribe la configuración no parseable con la configuración nueva que
escribe `repairProjectMcp`, de modo que no queda divergencia por ese motivo. Esta excepción NO SHALL
ampliarse a configuraciones parseables.

La directiva de uso NO SHALL escribirse en texto compartido entre hosts. `upgrade` SHALL conservar la
decisión config-driven existente. `ancleto check` NO SHALL cambiar su contrato: la divergencia de
frontmatter SHALL seguir siendo advisory, la comparación SHALL seguir siendo del archivo completo y
el exit code SHALL seguir siendo `missing > 0 ? 1 : 0`.

El default SHALL ser reversible a opt-in mediante una compuerta de medición: si el consumo neto medido
con `ancleto stats` no desciende en la ventana de observación definida, el default SHALL volver a
opt-in.

#### Scenario: Default cuando el binario está disponible

- **WHEN** se instala y el binario de caveman está disponible en el sistema
- **THEN** el CLI configura el MCP de compresión para el host
- **AND** no agrega configuración MCP de host fuera de `opencode`/`antigravity`

#### Scenario: La directiva de uso no se filtra a texto compartido

- **WHEN** se instala para un host que no incluye la tool de compresión
- **THEN** ningún asset compartido entre hosts contiene la directiva de uso de la compresión

#### Scenario: La directiva vive sólo donde existe la tool

- **WHEN** se instala para un host cuya configuración MCP incluye la tool de compresión
- **THEN** la directiva de uso se materializa sólo en las superficies de ese host

#### Scenario: Un host sin soporte de compresión no recibe la directiva

- **WHEN** se ejecuta `install`, `init` o `import` con un host distinto de `opencode` y `antigravity`
- **THEN** el orchestrator instalado NO contiene `CAVEMAN_USAGE_NOTE`
- **AND** el comando completa sin error

#### Scenario: `install` conserva la directiva habilitada por la configuración

- **WHEN** la configuración MCP del host ya incluye `caveman` y se ejecuta `install --project`
  con `--no-mcp` o sin el binario de caveman detectado
- **THEN** la configuración MCP preexistente se conserva
- **AND** el orchestrator instalado contiene `CAVEMAN_USAGE_NOTE`

#### Scenario: `init` conserva la directiva habilitada por la configuración

- **WHEN** la configuración MCP del host ya incluye `caveman` y se ejecuta `init` con `--no-mcp` o
  sin el binario de caveman detectado
- **THEN** el orchestrator instalado contiene `CAVEMAN_USAGE_NOTE`

#### Scenario: Estado legado de nota sin configuración se sanea

- **WHEN** existe un orchestrator con `CAVEMAN_USAGE_NOTE` y la configuración MCP del host no incluye
  `caveman`, y se re-ejecuta `install` o `init` sin escritura pendiente de caveman
- **THEN** el orchestrator se reescribe completo sin la nota
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador` por ese motivo

#### Scenario: Re-ejecutar la instalación es idempotente

- **WHEN** se ejecuta dos veces el mismo `install` o `init` sobre el mismo estado de configuración
- **THEN** la nota aparece como máximo una vez en el orchestrator
- **AND** la configuración MCP y el resultado de la decisión no cambian entre ejecuciones

#### Scenario: La divergencia de frontmatter sigue siendo advisory

- **WHEN** se ejecuta `ancleto check` con una divergencia de frontmatter y sin archivos faltantes
- **THEN** la divergencia se reporta como advisory
- **AND** el comando completa con exit 0

#### Scenario: Los archivos faltantes mantienen el exit 1

- **WHEN** se ejecuta `ancleto check` con archivos faltantes
- **THEN** el comando completa con exit 1
- **AND** la decisión sobre la nota de compresión no altera ese resultado

#### Scenario: La compuerta revierte a opt-in

- **WHEN** la medición con `ancleto stats` no observa un descenso neto en la ventana definida
- **THEN** el default de caveman se revierte a opt-in
