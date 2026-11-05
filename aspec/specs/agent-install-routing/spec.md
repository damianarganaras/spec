# Spec: agent-install-routing

## Purpose

Ruteo nativo de instalación de assets (`skills`, `agents`, `commands`) por host. Define el modelo único
de destino por host con directorio y convención de nombre, la cobertura de soporte por host y la
exclusión de assets no verificados, el aviso no bloqueante por asset no soportado, el manifiesto veraz y
acumulativo, el default `opencode` no destructivo, la consistencia del catálogo de skills, la frontera de
`.agents/skills` como punto de lectura compartido, la semántica de `--agent`, la exclusión de la
configuración MCP específica de host (con la excepción del MCP de workspace de `antigravity`) y la
compresión por defecto con uso condicional host-scoped y compuerta de medición.

## Requirements

### Requirement: Destino nativo por host con directorio y formato por asset

El CLI SHALL derivar el destino de instalación de cada asset (`skills`, `agents`, `commands`) de un
modelo único por host que declare, para cada asset, su directorio y su convención de nombre. El CLI
SHALL escribir cada asset en el directorio que la documentación del host declara como propio, con la
convención de nombre de ese host. El CLI NO SHALL escribir `agents` ni `commands` de un host en el
directorio base de otro host.

#### Scenario: `opencode` conserva las rutas y el formato actuales

- **WHEN** se ejecuta `ancleto init` o `ancleto install --project` con el agente `opencode`
- **THEN** los assets se escriben en `.opencode/agents`, `.opencode/commands` y `.opencode/skills`
- **AND** agents y commands usan la convención `<n>.md`
- **AND** las rutas coinciden con las de las versiones anteriores (sin regresión)

#### Scenario: VS Code usa su directorio y su convención de nombre

- **WHEN** se instala con `agent: vscode`
- **THEN** las skills se escriben en `.github/skills`
- **AND** los agents se escriben como `.github/agents/<n>.agent.md` con su frontmatter **adaptado** al
  formato del host (sin claves específicas de opencode; ver `skill-frontmatter-adapters`)
- **AND** los commands se escriben como `.github/prompts/<n>.prompt.md`

#### Scenario: Antigravity usa su directorio de skills de workspace

- **WHEN** se instala con `agent: antigravity`
- **THEN** las skills se escriben en `.agents/skills`
- **AND** no se escribe ninguna skill en `.antigravity/skills`

#### Scenario: Cursor usa su directorio de skills

- **WHEN** se instala con `agent: cursor`
- **THEN** las skills se escriben en `.cursor/skills`
- **AND** no se escribe ninguna skill de cursor en otro directorio base

#### Scenario: Roo usa `.roo/skills` (evidencia 3rd-party)

- **WHEN** se instala con `agent: roo`
- **THEN** las skills se escriben en `.roo/skills`
- **AND** el CLI declara esa ruta con evidencia de fuente 3rd-party (no documentación oficial del host)

#### Scenario: Command Code usa su directorio nativo por asset

- **WHEN** se instala con `agent: commandcode`
- **THEN** las skills se escriben en `.commandcode/skills`
- **AND** los agents se escriben como `.commandcode/agents/<n>.md` con su frontmatter adaptado al
  formato del host (ver `skill-frontmatter-adapters`)
- **AND** los commands se escriben como `.commandcode/commands/<n>.md`
- **AND** no se escribe ningún asset de `commandcode` en el directorio base de otro host

### Requirement: Cobertura de soporte por host y exclusión de assets no verificados

El CLI SHALL tratar un asset como soportado por un host sólo cuando el directorio y el formato del host
estén verificados. `antigravity` SHALL contar como host soportado también para `agents` y `commands`: sus
`agents` usan el frontmatter adaptado de `skill-frontmatter-adapters` y sus `commands` se materializan como
skills (ver `antigravity-support`). El CLI SHALL declarar no soportados los `agents` y `commands` de
`cursor` y `roo` y NO SHALL escribir esos assets para esos hosts, evitando materializar archivos que el host
no consumiría.

#### Scenario: `antigravity` materializa agents y commands

- **WHEN** se instala con `agent: antigravity`
- **THEN** el CLI escribe los `agents` en `.agents/agents/<n>.md`
- **AND** materializa los `commands` como skills en `.agents/skills`
- **AND** NO emite un aviso de asset no soportado para `agents` ni para `commands`

#### Scenario: No se escriben agents/commands de hosts sin convención verificada

- **WHEN** se instala con `agent: cursor` o `agent: roo`
- **THEN** el CLI NO SHALL crear archivos de agents ni de commands para ese host
- **AND** las skills del host sí se escriben en su directorio de skills

### Requirement: Aviso no bloqueante por asset no soportado

Cuando un asset es no soportado para el host resuelto (por ejemplo `agents` o `commands` de `cursor` o
`roo`), el CLI SHALL emitir a **stderr** una línea por asset omitido y NO SHALL abortar: el **exit code NO
SHALL cambiar**. El aviso NO SHALL registrarse en el manifiesto `.ancletorc` (consistente con
`installedPaths` = unión de destinos realmente escritos).

#### Scenario: Un asset `null` produce un aviso a stderr sin fallar

- **WHEN** se instala con `agent: cursor`, para quien `agents` no está soportado
- **THEN** el CLI imprime en stderr una línea con formato `skip agents: not supported by host 'cursor'`
- **AND** el comando completa con exit 0
- **AND** `installedPaths.agents` de `.ancletorc` no incluye ninguna ruta de agents para ese host

### Requirement: Manifiesto veraz y acumulativo de las rutas de instalación

El manifiesto `.ancletorc` SHALL registrar en `installedPaths.{agents,commands,skills}` las rutas
relativas reales escritas por el CLI. El manifiesto SHALL acumular la unión de destinos instalados, de
modo que instalar para otro host preserve el registro de los layouts previos. El CLI NO SHALL declarar
`.opencode/agents` ni `.opencode/commands` cuando esos assets se escribieron en otro base. `ancleto
check` SHALL validar la unión declarada sin requerir cambios de lógica.

#### Scenario: Manifiesto veraz para un host no-opencode

- **WHEN** se ejecuta `ancleto install --project` con `agent: vscode`
- **THEN** `.ancletorc.installedPaths.agents` incluye `.github/agents`
- **AND** `.ancletorc.installedPaths.commands` incluye `.github/prompts`
- **AND** `.ancletorc.installedPaths.skills` incluye `.github/skills`

#### Scenario: Unión de layouts en un proyecto multi-agente

- **WHEN** un proyecto instala con `agent: opencode` y luego con `agent: cursor`
- **THEN** `.ancletorc.installedPaths` conserva las rutas de `.opencode/*` y agrega las de `.cursor/*`
- **AND** `ancleto check` valida ambos layouts sin reportar faltantes ni huérfanos cuando están sanos

### Requirement: `opencode` como default y cambio no destructivo

`opencode` SHALL seguir siendo el agente por defecto cuando no se especifica `--agent` ni existe un
`agent` válido en `.ancletorc`. El cambio de ruteo SHALL ser aditivo y no destructivo: al instalar con
un host distinto, el CLI NO SHALL borrar los assets de rutas previas ni el contenido de documentos del
usuario.

#### Scenario: Default sin configuración previa

- **WHEN** se ejecuta `ancleto init` o `ancleto install --project` sin `--agent` y sin `agent` en
  `.ancletorc`, en un contexto no interactivo
- **THEN** el host resuelto es `opencode`
- **AND** los assets se escriben en `.opencode/*`

#### Scenario: Cambio de host no destruye rutas previas

- **WHEN** un proyecto tiene assets en `.opencode/` y se instala con `agent: cursor`
- **THEN** los assets se escriben en `.cursor/*`
- **AND** los assets preexistentes en `.opencode/` NO SHALL eliminarse

### Requirement: Catálogo de skills consistente e independiente del host

El conjunto de skills instalado SHALL ser el mismo para todos los hosts soportados. El CLI NO SHALL
condicionar la copia del catálogo completo al hecho de que el host sea distinto de `opencode`, ni SHALL
duplicar el árbol de skills en un base adicional por efecto de esa condición.

#### Scenario: Mismo catálogo para todo host

- **WHEN** se instala con `opencode` y con un host no-opencode
- **THEN** el conjunto de skills instaladas en el directorio del host es el mismo en ambos casos
- **AND** no se realiza una copia recursiva del árbol `skills/` condicionada al host

### Requirement: `.agents/skills` como punto de lectura compartido, no como destino universal

El CLI SHALL documentar que `.agents/skills` es un directorio de skills leído por más de un host y NO
SHALL tratarlo como destino universal por defecto. El CLI NO SHALL derivar el destino de skills de un
host únicamente de la convergencia de lectura: cada host SHALL recibir sus skills en el directorio
nativo declarado por su documentación.

#### Scenario: El destino de skills es el nativo del host

- **WHEN** se instala con `agent: claude` o `agent: roo`
- **THEN** las skills se escriben en `.claude/skills` o `.roo/skills` respectivamente
- **AND** el CLI NO SHALL asumir que `.agents/skills` cubre a todos los hosts

### Requirement: Semántica de `--agent` y descubrimiento entre hosts

El valor de `--agent` SHALL seleccionar el layout nativo a materializar y el pipeline de adaptación de
ese host. El CLI NO SHALL intentar arbitrar qué descubre cada host: si dos hosts leen un mismo
directorio, el descubrimiento compartido es un efecto del host y el CLI NO SHALL deduplicar ni elegir un
"ganador" entre ellos.

#### Scenario: `--agent` selecciona el layout, no controla el descubrimiento

- **WHEN** un proyecto tiene skills instaladas para un host y otro host lee ese mismo directorio
- **THEN** el CLI conserva el layout del host seleccionado por `--agent`
- **AND** el CLI NO SHALL eliminar ni reasignar skills para evitar el descubrimiento compartido

### Requirement: Configuración MCP específica de host fuera de alcance

El CLI SHALL escribir configuración MCP de proyecto sólo en el destino que declare el descriptor único de destino MCP por host, resuelto por el host activo de la corrida (`--agent` o `rc.agent`; `opencode` por defecto). El descriptor SHALL ser el dueño único del destino y del esquema de cada host. `init`, `install`/`update`, `import` e `import --repair` SHALL resolver el destino desde ese descriptor y NO SHALL usar literales de destino por comando. La configuración MCP de host deja de ser una excepción ad hoc: se limita a los destinos declarados y todo destino no declarado SHALL quedar fuera de alcance.

| host activo | destino de proyecto | esquema |
|---|---|---|
| `opencode` | `.opencode/opencode.json` (o el `.opencode/opencode.jsonc` existente) | `mcp` |
| `antigravity` | `.agents/mcp_config.json` | `mcpServers` |
| `commandcode` | `.mcp.json` | `mcpServers` |
| `copilot` | `copilot-mcp.json` | `mcp` |
| `claude`, `vscode`, `cursor`, `roo` | ninguno: no se escribe archivo MCP | — |

Para los hosts sin destino (`claude`, `vscode`, `cursor`, `roo`), el CLI NO SHALL escribir ningún archivo MCP, NO SHALL crear `.opencode/opencode.json` y, cuando el MCP esté habilitado, SHALL emitir como máximo un aviso no bloqueante que nombre el host. El aviso SHALL ir a stderr, NO SHALL abortar y NO SHALL cambiar el exit code.

Ningún host distinto de `opencode` SHALL usar `.opencode/opencode.json` como fallback en alcance de proyecto. Un `.opencode` preexistente de una instalación previa de `opencode` NO SHALL borrarse ni reescribirse por una corrida cuyo host activo sea distinto.

`import <bundle>` e `import --repair` SHALL escribir en el destino del host activo, no en un destino fijo de `opencode`. Cuando el host activo no tenga destino, `import` NO SHALL crear `.opencode/opencode.json` y SHALL aplicar el aviso único del párrafo anterior.

La garantía es de alcance de proyecto y de host activo: NO SHALL aplicarse a la instalación global sin proyecto, que conserva su comportamiento previo sólo-opencode, ni al MCP de intención de un bundle exportado, que conserva su lectura sólo-opencode. El CLI NO SHALL borrar archivos MCP preexistentes ni entradas existentes.

Los merges SHALL ser no destructivos e idempotentes: SHALL agregar sólo nombres ausentes, NO SHALL borrar entradas ni archivos existentes, y ejecutar dos veces `import`, dos veces `install` o `upgrade` después de `install` NO SHALL cambiar el conjunto de entradas MCP del host.

`.vscode/mcp.json`, `.roo/mcp.json` y un `.mcp.json` escrito para `claude` SHALL quedar fuera de alcance: el CLI NO SHALL crearlos.

#### Scenario: `opencode` escribe en su destino y con su esquema

- **WHEN** se ejecuta `init` o `install --project` con el host activo `opencode` y el MCP habilitado
- **THEN** el CLI escribe `.opencode/opencode.json` con el mapa `mcp`
- **AND** NO SHALL crear `.agents/mcp_config.json`, `.mcp.json` ni `copilot-mcp.json`

#### Scenario: `antigravity` escribe en su MCP de workspace

- **WHEN** se ejecuta `init` o `install --project` con el host activo `antigravity` y el MCP habilitado
- **THEN** el CLI escribe o mergea `.agents/mcp_config.json` con `mcpServers`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: `commandcode` escribe su MCP de proyecto

- **WHEN** se ejecuta `init` o `install --project` con el host activo `commandcode` y el MCP habilitado
- **THEN** el CLI escribe o mergea `.mcp.json` con `mcpServers`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: `copilot` escribe su MCP de proyecto

- **WHEN** se ejecuta `init` o `install --project` con el host activo `copilot` y el MCP habilitado
- **THEN** el CLI escribe o mergea `copilot-mcp.json` con el mapa `mcp`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: Un host sin destino no escribe MCP ni crea `.opencode/opencode.json`

- **WHEN** se ejecuta `init`, `install --project` o `import` con host activo `claude`, `vscode`, `cursor` o `roo` y el MCP habilitado
- **THEN** el CLI NO SHALL crear ningún archivo MCP
- **AND** NO SHALL crear ni escribir `.opencode/opencode.json` por ese motivo
- **AND** emite como máximo un aviso no bloqueante que nombra el host
- **AND** el comando completa con el exit code que ya tenía

#### Scenario: `import` apunta al host activo y no a `.opencode`

- **WHEN** se ejecuta `import <bundle>` o `import --repair` con host activo `claude`
- **THEN** el CLI NO SHALL crear `.opencode/opencode.json`
- **AND** emite como máximo un aviso no bloqueante que nombra `claude`
- **AND** el comando no aborta

#### Scenario: Un proyecto mixto conserva el `.opencode` previo

- **WHEN** un proyecto tiene `.opencode/opencode.json` de una instalación previa de `opencode` y se ejecuta una corrida con host activo `claude`
- **THEN** el archivo `.opencode/opencode.json` existente NO SHALL borrarse ni reescribirse
- **AND** `check` SHALL seguir validándolo porque `opencode` figura en la unión de hosts instalados

#### Scenario: La instalación global sin proyecto queda excluida

- **WHEN** se ejecuta `install` sin `--project` y sin un proyecto ancleto en el directorio actual
- **THEN** el ruteo de escritura MCP por host NO SHALL aplicarse
- **AND** la rama global conserva su comportamiento previo sólo-opencode
- **AND** NO SHALL escribirse `copilot-mcp.json`, `.mcp.json` ni `.agents/mcp_config.json` en el directorio de trabajo

#### Scenario: La intención MCP del bundle queda excluida

- **WHEN** se ejecuta `export` en un proyecto
- **THEN** el manifiesto MCP SHALL seguir leyéndose sólo de la configuración de `opencode`
- **AND** este change NO SHALL hacer host-aware el manifiesto de exportación

#### Scenario: Re-ejecutar no cambia el resultado

- **WHEN** se ejecuta dos veces el mismo `install` o `import` sobre el mismo estado, o `upgrade` después de `install`
- **THEN** el archivo MCP del host conserva el mismo conjunto de entradas
- **AND** NO SHALL borrarse ninguna entrada ni archivo existente

#### Scenario: El ruteo no genera config MCP de host fuera de las excepciones

- **WHEN** se instala con un host soportado distinto de `antigravity` y `commandcode`
- **THEN** el CLI NO SHALL crear `.mcp.json`, `.agents/mcp_config.json` ni `.vscode/mcp.json`
- **AND** la configuración MCP preexistente del usuario se conserva

#### Scenario: `antigravity` sí obtiene su MCP de workspace

- **WHEN** se instala con `agent: antigravity`
- **THEN** el CLI crea o actualiza `.agents/mcp_config.json`
- **AND** el contenido preexistente de `mcpServers` no se pisa

#### Scenario: `commandcode` sí obtiene su MCP de proyecto

- **WHEN** se instala con `agent: commandcode` y `--project`
- **THEN** el CLI crea o actualiza `.mcp.json`
- **AND** el contenido preexistente de `mcpServers` no se pisa

#### Scenario: caveman no habilita MCP de host nuevo fuera de la excepción

- **WHEN** se instala con el binario de caveman disponible en un host distinto de `opencode` y `antigravity`
- **THEN** el CLI conserva el MCP de compresión como comportamiento por defecto del host permitido
- **AND** NO SHALL crear configuración MCP de host nueva para ese otro host

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
