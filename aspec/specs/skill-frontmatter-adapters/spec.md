# Spec: skill-frontmatter-adapters

## Purpose

Transformación del frontmatter durante la instalación de assets según el host y el tipo de asset.
Define el dueño único de la transformación, la preservación por defecto de campos portables, el
adaptador de frontmatter de agents para hosts cuyo formato difiere, la política de `model`/`tools` sin
equivalencia verificada y la ausencia de transformaciones especulativas.

## Requirements

### Requirement: Transformador de frontmatter con dueño único por host y tipo de asset

El flujo de instalación de assets SHALL ser el dueño único de la transformación del frontmatter antes
de escribir cada `SKILL.md` y cada `.md` de `agents/`/`commands/`. La transformación SHALL aplicarse
según el `agent` configurado y el tipo de asset, para todo host soportado, y NO SHALL requerir
dependencias externas. Cuando no aplique ninguna adaptación documentada, la salida SHALL ser idéntica
al frontmatter de origen (preservación verbatim).

#### Scenario: Sin adaptación aplicable, el frontmatter se preserva verbatim

- **WHEN** se instala un asset cuyo frontmatter sólo usa campos portables y no hay adaptación
  documentada para el host configurado
- **THEN** el archivo instalado conserva el frontmatter byte-idéntico al de origen

#### Scenario: La transformación es dueño único del flujo de instalación

- **WHEN** se instala el catálogo de skills o los agents/commands para cualquier host
- **THEN** todo frontmatter escrito en el destino pasa por el transformador
- **AND** ningún otro punto del CLI transforma el frontmatter

### Requirement: Preservación por defecto de campos portables

El transformador SHALL preservar por defecto los campos portables y verificados del frontmatter de
origen: en skills, `name`, `description`, `license`, `compatibility` y `metadata`; en agents/commands,
`description`. La preservación por defecto NO SHALL aplicarse a las claves específicas del host de origen
(`mode`, `color`, `temperature`, `permission`) ni a los campos sin equivalente verificado para el host
destino: esos se **eliminan u omiten** según la adaptación documentada del host (ver el requirement de
adaptación y el de política). Cuando NO exista una adaptación documentada para el host destino, las
claves no reconocidas SHALL preservarse también, junto con su orden.

#### Scenario: Campos estándar y extensiones se conservan

- **WHEN** una `SKILL.md` declara `name`, `description`, `license`, `compatibility` y `metadata`
- **AND** se instala para un host que usa el estándar Agent Skills, sin adaptación documentada
- **THEN** los cinco campos están presentes en el archivo instalado
- **AND** sus valores no se alteran

#### Scenario: Claves desconocidas no se pierden sin adaptación documentada

- **WHEN** un asset declara una clave de frontmatter que el transformador no reconoce
- **AND** no existe una adaptación documentada para el host destino
- **THEN** la clave y su valor se conservan en el archivo instalado
- **AND** el orden relativo de las claves se mantiene

### Requirement: Adaptador de frontmatter de agents para hosts cuyo formato difiere

El frontmatter de los agents de opencode NO SHALL copiarse verbatim a un host cuyo formato de agents difiera
del origen. Al instalar agents para `agent: claude`, `agent: vscode`, `agent: antigravity` o
`agent: commandcode`, el transformador SHALL aplicar la adaptación documentada de ese host. Para `claude` y
`vscode` SHALL eliminar las claves específicas de opencode (`mode`, `color`, `temperature`, `permission`) y
SHALL aplicar la política de campos sin equivalencia a `model` y `tools`. Para `antigravity` SHALL aplicar la
adaptación específica definida en el requirement "Adaptación de frontmatter de agents para `antigravity`".
Para `commandcode` SHALL aplicar la adaptación específica definida en el requirement "Adaptación de
frontmatter de agents para `commandcode`". El campo `description` SHALL preservarse en todos los casos. Para
el resto de los hosts y tipos de asset sin adaptación documentada, la instalación SHALL ser identity.

#### Scenario: Claves de opencode no se copian a Claude

- **WHEN** se instala un agent cuyo frontmatter declara `mode`, `color`, `temperature` y `permission`,
  con `agent: claude`
- **THEN** el `.md` instalado en `.claude/agents` NO SHALL contener `mode:`, `color:`, `temperature:` ni
  `permission:`
- **AND** el campo `description` se conserva

#### Scenario: Los agents de VS Code salen adaptados, no verbatim

- **WHEN** se instala con `agent: vscode` un agent cuyo frontmatter declara `mode`, `color`,
  `temperature`, `permission`, `model` de `opencode-go` y `tools` en forma de mapa
- **THEN** el `.github/agents/<n>.agent.md` instalado NO SHALL contener `mode:`, `color:`,
  `temperature:`, `permission:` ni `model` de `opencode-go`
- **AND** NO SHALL contener `tools` con el mapa de identificadores de opencode
- **AND** el campo `description` se conserva

#### Scenario: Los agents de Antigravity pasan por su adaptación documentada

- **WHEN** se instala con `agent: antigravity` un agent cuyo frontmatter declara `mode`, `color`,
  `temperature`, `permission`, `model` de `opencode-go` y `tools` en forma de mapa
- **THEN** el `.agents/agents/<n>.md` instalado NO SHALL contener `mode:`, `color:`, `temperature:` ni
  `permission:`
- **AND** NO SHALL contener `model` de `opencode-go`
- **AND** el campo `description` se conserva

#### Scenario: Los agents de Command Code pasan por su adaptación documentada

- **WHEN** se instala con `agent: commandcode` un agent cuyo frontmatter declara `mode`, `color`,
  `temperature`, `permission`, `model` de `opencode-go` y `tools` en forma de mapa
- **THEN** el `.commandcode/agents/<n>.md` instalado NO SHALL contener `mode:`, `color:`,
  `temperature:`, `permission:` ni `model` de `opencode-go`
- **AND** `tools` sale como lista de ids de Command Code (o `"*"` si el origen no declara `tools`)
- **AND** el campo `description` se conserva

### Requirement: Adaptación de frontmatter de agents para `antigravity`

Al instalar agents para `agent: antigravity`, el transformador SHALL producir un frontmatter con la convención
de Antigravity: `name` (requerido por el host, derivado del nombre del archivo del agent), `description`
(preservado), `tools` como **lista** de ids de Antigravity, y `model` fijo. `mode` SHALL traducirse a
`mainAgent`/`subagent`; cuando el agent no declare `mode`, el transformador SHALL emitir `mainAgent: true` y
`subagent: true` (default del host). Las claves `color`, `temperature`, `permission` y `tools` en forma de
mapa SHALL eliminarse. El transformador SHALL emitir `tools` siempre, incluso vacío, porque el default del
host es la lista vacía (no "todas las tools").

El mapeo de `tools` SHALL usar **sólo** ids **confirmados en la tabla de frontmatter de subagents** de
Antigravity: `read`→`view_file`, `edit`→`replace_file_content`, `grep`→`grep_search`, `bash`→`run_command`,
`todowrite`→`manage_task`. Sólo se mapean claves con valor `true`. `edit` SHALL resolverse a
`replace_file_content` (frontmatter), NO a `edit_file` (SDK). Un id que exista **sólo** en el SDK de Python
(`find_file`, `search_web`, `read_url_content`, `edit_file`, `list_directory`, `search_directory`,
`create_file`, `ask_question`, `finish`, `generate_image`) NO SHALL emitirse: el SDK no prueba soporte del
frontmatter. Los ids de **delegación** (`invoke_subagent`, `start_subagent`, `define_subagent`) NO SHALL
emitirse: NO son tools de subagente (el padre los invoca; la invocación de un subagente se habilita con
`subagent: true`, no con un id de `tools`). Las claves `write`, `glob`, `task`, `webfetch` y `websearch` NO
SHALL emitirse como id (no tienen id confirmado en el frontmatter; ver el requirement de política). La clave
`skill` NO SHALL emitirse como tool: SHALL resolverse por el campo `skills: [...]` del frontmatter
cuando el agent declare skills conocidas y, si no, se omite. El **mecanismo** de MCP NO SHALL resolverse por `tools`:
SHALL resolverse por el campo `mcpServers` (agent-level) y/o `.agents/mcp_config.json` de workspace. Toda clave de
`tools` que **no** esté en el conjunto confirmado —incluidas las claves de MCP (`mcpServers`, `mcp_*`,
`call_mcp_tool`)— cae en la política de **omisión con aviso**: NO SHALL emitirse como id y SHALL avisarse por
stderr (nunca en silencio). El id `call_mcp_tool` queda **prohibido** (no lo emite el adaptador).

#### Scenario: `name` inyectado y `description` preservado

- **WHEN** se instala el agent `coder` para `agent: antigravity`
- **THEN** `.agents/agents/coder.md` contiene `name: coder`
- **AND** conserva el `description` de origen intacto

#### Scenario: `tools` en mapa se deriva a la lista de ids verificados

- **WHEN** se instala para `agent: antigravity` un agent con `tools: { read: true, edit: true, bash: true,
  todowrite: true, grep: false }`
- **THEN** el frontmatter instalado contiene `tools: [view_file, replace_file_content, run_command,
  manage_task]`
- **AND** NO contiene el mapa de identificadores de opencode

#### Scenario: Un id solo-SDK no se emite

- **WHEN** se instala para `agent: antigravity` un agent con `tools: { glob: true, webfetch: true }`
- **THEN** el `tools` instalado NO SHALL contener `find_file` ni `read_url_content` (ids solo-SDK)
- **AND** el CLI emite a stderr un aviso por cada tool omitida

#### Scenario: Las tools de delegación no son tools de subagente

- **WHEN** se instala para `agent: antigravity` un agent con `tools: { task: true }`
- **THEN** el `tools` instalado NO SHALL contener `invoke_subagent`, `start_subagent` ni `define_subagent`
- **AND** la capacidad de invocar subagentes queda sujeta al campo `subagent` del frontmatter, no a un id de `tools`

#### Scenario: El uso de MCP no se emite como tool id

- **WHEN** se instala el agent `memory-keeper` para `agent: antigravity`, cuyo mapa `tools` declara `searchMemory`,
  `recordRule` y `recordDecision`
- **THEN** su `tools` instalado NO incluye `call_mcp_tool` ni ningún id de MCP
- **AND** el CLI emite a stderr un aviso por cada una de esas claves de MCP omitidas (no en silencio)
- **AND** el mecanismo de MCP se resuelve por `mcpServers` (agent-level) y/o `.agents/mcp_config.json` de workspace

#### Scenario: `model` es `inherit` y no arrastra el catálogo de opencode

- **WHEN** se instala para `agent: antigravity` un agent con `model: opencode-go/qwen3.7-plus`
- **THEN** el frontmatter instalado contiene `model: inherit`
- **AND** NO contiene ningún identificador de modelo de `opencode-go`

#### Scenario: `mode` se traduce a `mainAgent`/`subagent`

- **WHEN** se instala para `agent: antigravity` un agent con `mode: primary`
- **THEN** el frontmatter instalado declara `mainAgent: true` y `subagent: false`
- **AND** un agent con `mode: subagent` declara `mainAgent: false` y `subagent: true`
- **AND** un agent sin `mode` declara `mainAgent: true` y `subagent: true` (default del host)

#### Scenario: `skill` se resuelve por el campo `skills`, no por `tools`

- **WHEN** se instala para `agent: antigravity` un agent cuyo mapa declara `skill: true`
- **THEN** el `tools` instalado NO contiene ningún id correspondiente a `skill`
- **AND** la capacidad de skills queda cubierta por el campo `skills` del frontmatter o por el surfaceo
  automático de Antigravity

### Requirement: Adaptación de frontmatter de agents para `commandcode`

Al instalar agents para `agent: commandcode`, el transformador SHALL producir un frontmatter con la
convención de Command Code: `name` (requerido por el host, derivado del nombre del archivo del agent),
`description` (preservado) y `tools` (lista de ids de Command Code o el comodín `"*"`). Las claves
`mode`, `color`, `temperature` y `permission` SHALL eliminarse. El campo `model` SHALL omitirse: Command
Code hereda el modelo de sesión y el transformador NO SHALL mapear un identificador `opencode-go/*` a un
alias de Command Code.

El mapeo de `tools` SHALL usar **sólo** ids verificados en la documentación de Command Code:
`read`→`read_file`, `write`→`write_file`, `edit`→`edit_file`, `bash`→`shell_command`, `grep`→`grep`,
`glob`→`glob`, `webfetch`→`web_fetch`, `websearch`→`web_search`, `todowrite`→`todo_write`. Sólo se
mapean claves con valor `true`. Las claves de memoria del framework (`searchMemory`, `recordRule`,
`recordDecision`) SHALL emitirse como tools MCP con la convención documentada
`mcp__ancleto-memory__<tool>`. Toda clave de `tools` sin id verificado (`skill`, `task`, `patch`,
`multiedit`, `todoread` u otra) SHALL omitirse con aviso a stderr de forma no bloqueante (exit code sin
cambios): nunca en silencio. Cuando el agent no declare `tools`, el transformador SHALL emitir
`tools: "*"` (preserva el default "todas" de opencode; el default de Command Code es "ninguna"). Cuando
`tools` esté presente sin ninguna clave `true`, SHALL emitir `tools: []`.

#### Scenario: `name` inyectado y `description` preservado

- **WHEN** se instala el agent `coder` para `agent: commandcode`
- **THEN** `.commandcode/agents/coder.md` contiene `name: coder`
- **AND** conserva el `description` de origen intacto

#### Scenario: `tools` en mapa se deriva a la lista de ids verificados

- **WHEN** se instala para `agent: commandcode` un agent con `tools: { read: true, write: true,
  edit: true, bash: true, grep: false }`
- **THEN** el frontmatter instalado contiene `tools: [read_file, write_file, edit_file, shell_command]`
- **AND** NO contiene el mapa de identificadores de opencode

#### Scenario: Una tool sin id verificado se omite con aviso

- **WHEN** se instala para `agent: commandcode` un agent con `tools: { read: true, skill: true }`
- **THEN** la lista instalada incluye `read_file` y NO incluye ningún id para `skill`
- **AND** el CLI emite a stderr un aviso que nombra la tool omitida
- **AND** el comando completa con exit 0

#### Scenario: `model` se omite y no arrastra el catálogo de opencode

- **WHEN** se instala para `agent: commandcode` un agent con `model: opencode-go/minimax-m3`
- **THEN** el frontmatter instalado NO SHALL contener ningún identificador de modelo de `opencode-go`
- **AND** el campo `model` se omite (el host hereda su default)

#### Scenario: `tools` ausente equivale a todas las tools

- **WHEN** se instala para `agent: commandcode` un agent cuyo frontmatter no declara `tools`
- **THEN** el frontmatter instalado contiene `tools: "*"`

### Requirement: Política ante tools de Antigravity sin id verificado

Cuando el mapa `tools` de un agent declare una clave que no tenga un id **confirmado en el frontmatter de
subagents** de Antigravity, el transformador NO SHALL emitir un id (un tool name inexistente cuelga el
subagent). La regla es dura: si el id no está confirmado en el frontmatter, NO se emite **exista o no en el
SDK**. SHALL omitir esa tool de la lista derivada y SHALL avisar por stderr de forma no bloqueante (exit code
sin cambios). Quedan bajo esta política, entre otras: las claves `write`, `glob`, `task`, `webfetch` y
`websearch`; los ids **solo-SDK** (`find_file`, `search_web`, `read_url_content`, `edit_file`,
`list_directory`, `search_directory`, `create_file`, `ask_question`, `finish`, `generate_image`); los ids de
**comunidad** (`write_to_file`, `multi_replace_file_content`, `list_dir`, `send_message`); y los de
**delegación** (`invoke_subagent`, `start_subagent`, `define_subagent`), que no son tools de subagente. La
clave `skill` NO cae en esta política: se resuelve por el campo `skills` del frontmatter (ver el requirement
anterior). El **mecanismo** de MCP (`mcpServers` agent-level y/o `.agents/mcp_config.json` de workspace) queda
fuera de esta política porque no se configura por `tools`; en cambio, toda clave de MCP declarada **dentro** del
mapa `tools` (`mcpServers`, `mcp_*`, `call_mcp_tool` o cualquier otra) **sí** cae en la política de **omisión con
aviso**: NO SHALL emitirse como id y SHALL avisarse por stderr (nunca en silencio). `call_mcp_tool` NO SHALL
emitirse (queda prohibido).

#### Scenario: Una tool sin id verificado se omite con aviso

- **WHEN** se instala para `agent: antigravity` un agent con `tools: { read: true, write: true }`
- **THEN** la lista instalada incluye `view_file` y NO incluye ningún id para `write`
- **AND** el CLI emite a stderr un aviso que nombra la tool omitida
- **AND** el comando completa con exit 0

### Requirement: Política de `model`/`tools` sin equivalencia verificada

Cuando un campo del host de origen no tenga un equivalente verificado en el host destino, el
transformador SHALL omitirlo o heredarlo, o SHALL fallar con aviso; NO SHALL emitir un valor
sintácticamente válido pero semánticamente incorrecto. En particular, el transformador NO SHALL mapear
un identificador de modelo del catálogo de origen a un alias de otro host, ni SHALL emitir un mapa de
`tools` de opencode como si fuera una lista de tools del host destino.

#### Scenario: `model` se omite en lugar de mapearse a un alias inventado

- **WHEN** se instala para `agent: claude` o `agent: vscode` un agent con `model` del catálogo
  `opencode-go`
- **THEN** el archivo instalado NO SHALL contener un alias o identificador de modelo derivado por el
  transformador
- **AND** el campo `model` se omite (el host hereda su default)

#### Scenario: `tools` en mapa no se emite como lista inventada

- **WHEN** se instala para un host cuya convención de `tools` es una lista y no existe un mapa de
  identificadores verificado
- **THEN** el transformador NO SHALL emitir `tools` con identificadores del host de origen
- **AND** el campo se omite o se traduce sólo si existe un mapa verificado

### Requirement: Ausencia de transformaciones especulativas

El transformador NO SHALL aplicar adaptaciones no justificadas por una convención documentada del host
destino. La incorporación de una adaptación nueva SHALL requerir evidencia de la convención del host y
SHALL quedar registrada como decisión.

#### Scenario: Ninguna adaptación sin evidencia

- **WHEN** se agrega o modifica una regla de adaptación de frontmatter
- **THEN** existe evidencia documentada de la convención del host que la justifica
- **AND** la decisión queda registrada

### Requirement: Módulo puro de adaptación de frontmatter

El adaptador de frontmatter SHALL vivir en `src/core/adapters/frontmatter.js` como una función pura
exportada `adaptFrontmatter(content, host, assetKind, name) → string`. El módulo SHALL ser el dueño
único de la transformación del frontmatter: ningún otro punto del CLI SHALL transformar frontmatter
directamente. El módulo NO SHALL realizar E/S ni depender de estado global. Las funciones
`parseFrontmatter` y `serializeFrontmatter` SHALL vivir en el módulo y re-exportarse si otro punto
del CLI las necesita.

#### Scenario: El adaptador es función pura sin E/S

- **WHEN** se importa `adaptFrontmatter` desde `src/core/adapters/frontmatter.js`
- **THEN** la función acepta `(content: string, host: string, assetKind: string, name: string)`
- **AND** retorna un string (contenido completo con frontmatter adaptado + body verbatim)
- **AND** no realiza lectura ni escritura de archivos
- **AND** no depende de variables globales mutables

#### Scenario: `src/cli/index.js` importa el adaptador del módulo

- **WHEN** `src/cli/index.js` necesita adaptar frontmatter
- **THEN** importa `adaptFrontmatter` desde `../core/adapters/frontmatter.js`
- **AND** NO define localmente funciones de adaptación de frontmatter

### Requirement: Adaptación para `cursor` y `roo`

El adaptador SHALL incluir `cursor` y `roo` en el conjunto de hosts conocidos. Dado que no existe
formato de frontmatter de skills documentado que difiera del estándar para estos hosts, la adaptación
SHALL ser identity (passthrough). El adaptador SHALL emitir un aviso a stderr por cada asset procesado
para estos hosts, indicando que no hay adaptación documentada.

#### Scenario: `cursor` recibe frontmatter sin cambios con aviso

- **WHEN** se instala una skill para `agent: cursor`
- **THEN** el frontmatter de la skill instalada es byte-idéntico al de origen
- **AND** el CLI emite a stderr un aviso: `no documented frontmatter adaptation for host 'cursor'`
- **AND** el comando completa con exit 0

#### Scenario: `roo` recibe frontmatter sin cambios con aviso

- **WHEN** se instala una skill para `agent: roo`
- **THEN** el frontmatter de la skill instalada es byte-idéntico al de origen
- **AND** el CLI emite a stderr un aviso: `no documented frontmatter adaptation for host 'roo'`
- **AND** el comando completa con exit 0

### Requirement: Host desconocido → passthrough con aviso

Cuando el `host` recibido por el adaptador no corresponda a ningún host conocido (opencode, claude,
vscode, antigravity, cursor, roo, copilot, commandcode), el adaptador SHALL retornar el contenido sin
cambios (passthrough) y SHALL emitir un aviso a stderr indicando que el agent es desconocido. El adaptador
NO SHALL abortar ni lanzar una excepción.

#### Scenario: Host desconocido no rompe la instalación

- **WHEN** se llama al adaptador con `host: 'unknown-host'`
- **THEN** el contenido retornado es byte-idéntico al de entrada
- **AND** el CLI emite a stderr: `unknown agent 'unknown-host', passthrough`
- **AND** el comando completa con exit 0

### Requirement: `ancleto check` valida frontmatter de agents contra el adaptador y la canónica

`ancleto check` SHALL validar que el frontmatter de los agents instalados coincida con la salida del
adaptador aplicada a la **canónica versionada**, no a la salida con el tier aplicado. Para cada
archivo `.md` de un directorio de agents instalado, el check SHALL leer el contenido instalado, leer
el contenido de origen, calcular `esperado = adaptFrontmatter(origen, host, 'agents', name)` —más
las notas de host que ya correspondan— y comparar contra el instalado.

Para `opencode`, cuando el proyecto declare un tier conocido en `.opencode/.ancleto-tier`, el check
SHALL calcular además el conjunto de estados de tier aceptados para **todos** los agentes del
directorio, incluidos los que un overlay de perfil reemplaza: `install`/`update` aplican el tier
también a esos agentes, así que el tier es dueño de su `model:` en ese momento. Para los tiers sin
cadena, el conjunto contiene el estado resuelto-ahora. Para `minimo`, el conjunto contiene un estado
por cada candidato estático de `TIER_CHAINS.minimo` para ese agente, con el estado resuelto-ahora en
primer lugar. Los candidatos SHALL tomarse de la cadena estática, no del catálogo: un mirror escrito
cuando el catálogo tenía otro candidato sigue siendo un estado aceptado. Un instalado igual a
`esperado` o a cualquier estado del conjunto NO SHALL reportarse como divergencia. Sólo un instalado
que difiera de todos SHALL reportarse como warning (⚠), no como faltante (✖). Una instalación sana con
`profile: test` y cualquier tier NO SHALL reportarse como divergencia.

El conjunto de estados de tier y el aviso de tier SHALL calcularse sólo para un directorio cuyo host
sea `opencode`. Para un directorio de un host cuyo adaptador elimina `model:` (`commandcode`, `claude`,
`vscode`, `copilot`) o emite un valor propio (`antigravity`: `model: inherit`), el check NO SHALL
resolver el catálogo, NO SHALL construir estados de tier y NO SHALL emitir el aviso de tier: compara
sólo contra `esperado`, que ya refleja el `model:` del adaptador.

El contenido esperado (`esperado`) de cada agente SHALL derivarse de `profiles/test/agents/<n>.md`
(la fuente del overlay del perfil) cuando el perfil activo sea `test` y ese archivo exista, y de
`agents/<n>.md` en caso contrario. El perfil es dueño del contenido y del `model:` sólo en `upgrade`;
en `install`/`update` el tier se aplica también a los dos agentes del overlay.

Cuando el mirror de un agente difiera del estado resuelto-ahora del tier, o el estado resuelto-ahora
difiera de su fuente esperada —la canónica para los agentes base, el perfil para los agentes que el
overlay reemplaza—, el check SHALL emitir, por cada directorio de agents, exactamente un aviso
informativo no bloqueante de la forma
`⚠ <dirRel> (tier '<tier>' aplica un modelo distinto al de su fuente en <n> agentes; install/update
reescribirá model:)`, donde `<n>` es la cantidad de agentes de ese directorio que cumplen al menos una
de las dos condiciones. `tierDiff` se calcula con el modelo resuelto-ahora, no con el conjunto de
aceptación, de modo que el aviso siga siendo único por directorio. El aviso SHALL emitirse tanto si el
mirror está en estado esperado como si está en estado del tier: una diferencia de modelo introducida
por un tier o por un cambio de catálogo entre `install` y `check` NO SHALL quedar silenciosa.

Si en el momento del check ningún candidato de la cadena de `minimo` figura en el catálogo para un
directorio `opencode`, el check NO SHALL abortar: SHALL aceptar los candidatos estáticos como estados
válidos y SHALL emitir un aviso no bloqueante distinto que indique que no hay candidato resoluble. El
exit code NO SHALL cambiar por ese aviso.

Para el tier `gratis`, el check SHALL aceptar como estado esperado la adaptación con
`GRATIS_FALLBACK_MODEL`, único modelo gratis conocido. Un `.ancletorc.gratisModel` desconocido NO
SHALL producir divergencia ni error: el check resuelve el gratis con el fallback. NO SHALL existir un
segundo modelo gratis aceptado.

El exit code NO SHALL cambiar por divergencias de frontmatter ni por el aviso de tier; sólo cambia
por faltantes de archivo. El check SHALL derivar el host de cada directorio de agents con
`hostForDir('agents', dirRel)` y SHALL aplicar el adaptador de ese host. `installedHostsFromPaths(ip)`
NO SHALL usarse para derivar el host de un directorio de agents: sólo SHALL usarse para calcular la
unión de hosts instalados que amplía el conjunto esperado de skills de un directorio que empaqueta
commands (`packagesCommandsHere`).

#### Scenario: Frontmatter instalado coincide con la canónica

- **WHEN** se ejecuta `ancleto check` en un proyecto con agents instalados correctamente desde la
  canónica y sin un tier que difiera de ella
- **THEN** el check NO reporta divergencias de frontmatter
- **AND** NO emite el aviso de tier
- **AND** el comando completa con exit 0

#### Scenario: Frontmatter editado manualmente se reporta como divergencia

- **WHEN** un agent instalado tiene su frontmatter editado manualmente (difiere de la canónica y de
  todos los estados del tier)
- **THEN** `ancleto check` reporta: `⚠ <dir>/<file> (frontmatter diverge del adaptador para host 'X')`
- **AND** el aviso es no bloqueante (exit code 0 si no hay faltantes)

#### Scenario: Un tier distinto no produce falso positivo de divergencia

- **WHEN** se instala con `--tier gratis` y luego se ejecuta `ancleto check`
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier con un `<n>` mayor que cero
- **AND** el comando completa con exit 0

#### Scenario: Un install `gratis` legacy no produce divergencia falsa

- **WHEN** un proyecto tiene instalado `opencode/big-pickle` y `.ancletorc.gratisModel` no está
  persistido o declara un valor desconocido
- **THEN** `ancleto check` NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: regresión del conjunto de aceptación — instala con el tier `gratis`
un proyecto sin `gratisModel` persistido, y otro con un valor legacy desconocido, y afirma ausencia de
divergencia, presencia del aviso de tier y exit code sin cambios._

#### Scenario: La diferencia de tier nunca queda silenciosa

- **WHEN** el mirror coincide con la canónica y el tier configurado aplica un modelo distinto
- **THEN** el check SHALL emitir el aviso de tier
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: instala en estado canónico con un tier que difiere y afirma la
presencia del aviso de tier junto con la ausencia de divergencia._

#### Scenario: Un mirror en estado de tier tampoco es silencioso

- **WHEN** el mirror coincide con la salida del tier configurado y ese tier difiere de la canónica
- **THEN** el check NO SHALL reportar divergencia
- **AND** SHALL emitir el aviso de tier
- **AND** el exit code NO SHALL cambiar

#### Scenario: Un mirror que difiere de la canónica y del tier se reporta como divergencia

- **WHEN** el `model:` del mirror no coincide ni con la canónica ni con ningún estado del tier
- **THEN** el check reporta `⚠ <dir>/<file> (frontmatter diverge del adaptador para host '<host>')`
- **AND** el comando completa con exit 0

#### Scenario: Check deriva el host del directorio instalado

- **WHEN** un proyecto tiene agents instalados para múltiples hosts (multi-host)
- **THEN** `ancleto check` SHALL derivar el host de cada directorio de agents con
  `hostForDir('agents', dirRel)`
- **AND** SHALL aplicar el adaptador de ese host para la validación
- **AND** `installedHostsFromPaths(ip)` sólo SHALL determinar la unión de hosts instalados usada para
  el conjunto esperado de skills, no el host de un directorio de agents

#### Scenario: Un directorio de un host que dropea `model:` no calcula estados de tier

- **WHEN** el proyecto tiene agents instalados para `claude` y el tier configurado es `minimo`, con un
  catálogo sin ningún candidato
- **THEN** el check NO SHALL resolver la cadena ni abortar
- **AND** NO SHALL emitir el aviso de tier
- **AND** NO SHALL reportar `frontmatter diverge` si el mirror coincide con la adaptación de la fuente
- **AND** el exit code NO SHALL cambiar

#### Scenario: `antigravity` se valida contra `model: inherit`

- **WHEN** el proyecto tiene agents instalados para `antigravity` y `.opencode/.ancleto-tier` declara
  un tier conocido
- **THEN** el check NO SHALL emitir el aviso de tier
- **AND** SHALL aceptar el frontmatter adaptado con `model: inherit` como estado esperado
- **AND** el check NO SHALL resolver el catálogo

#### Scenario: Un `profile: test` sano no se reporta como divergencia

- **WHEN** se ejecuta `ancleto check` en un proyecto con `profile: test` cuyos agents se instalaron
  correctamente y cuyo tier no difiere de la fuente esperada de cada agente
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador` para `tester` ni `reviewer`
- **AND** SHALL comparar esos dos archivos contra `profiles/test/agents/<n>.md` y los otros ocho
  contra `agents/<n>.md`
- **AND** el comando completa con exit 0

#### Scenario: `profile: test` con `minimo` no reporta divergencia y avisa por el overlay

- **WHEN** se instala con `profile: test` y `--tier minimo` y luego se ejecuta `ancleto check`
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier con `n = 2` (los dos agentes del overlay, `tester` y
  `reviewer`, difieren de su fuente de perfil)
- **AND** el comando completa con exit 0

#### Scenario: `profile: test` con `gratis` no reporta divergencia y avisa por los diez agentes

- **WHEN** se instala con `profile: test` y `--tier gratis` y luego se ejecuta `ancleto check`
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier con `n = 10`, incluyendo a los dos agentes del overlay
- **AND** el comando completa con exit 0

#### Scenario: `minimo` sin overlay no emite aviso de tier

- **WHEN** el tier configurado es `minimo`, la cabeza de la cadena está disponible y coincide con el
  modelo canónico, y no hay overlay de perfil
- **THEN** el check NO SHALL emitir el aviso de tier
- **AND** NO SHALL reportar divergencias de frontmatter

#### Scenario: La cadena de `minimo` no produce divergencia cuando la cabeza desaparece del catálogo

- **WHEN** se instaló `minimo` con la cabeza de la cadena disponible y luego se ejecuta `check` con un
  catálogo que ya no contiene la cabeza
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier porque el próximo `install`/`update` resolvería otro candidato
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: instalación con la cabeza, check con un catálogo inyectado sin la
cabeza; afirma ausencia de `frontmatter diverge`, presencia del aviso de tier y exit code sin cambios._

#### Scenario: La cadena de `minimo` no queda silenciosa cuando la cabeza reaparece

- **WHEN** se instaló `minimo` sin la cabeza (el mirror declara el segundo candidato) y luego se
  ejecuta `check` con un catálogo que vuelve a contener la cabeza
- **THEN** el check NO SHALL reportar `frontmatter diverge del adaptador`
- **AND** SHALL emitir el aviso de tier porque el mirror difiere del estado resuelto-ahora
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: instalación con un catálogo sin la cabeza, check con la cabeza
restaurada; afirma ausencia de `frontmatter diverge`, presencia del aviso de tier y exit code sin
cambios._

#### Scenario: `check` sin candidato resoluble no aborta

- **WHEN** se ejecuta `check` con tier `minimo` y el catálogo no contiene ningún candidato de la
  cadena
- **THEN** el check NO SHALL abortar ni reportar `frontmatter diverge` si el mirror coincide con un
  candidato estático
- **AND** SHALL emitir un aviso no bloqueante que indique que no hay candidato resoluble
- **AND** el exit code NO SHALL cambiar

_Testeable con `test/cli.test.js`: instalación con la cabeza, check con un catálogo vacío para los
candidatos de la cadena; afirma la ausencia de divergencia, el aviso de catálogo no resoluble y exit
code sin cambios._

### Requirement: Skills no se adaptan (política vigente)

El adaptador SHALL tratar las skills como identity (passthrough) para todos los hosts conocidos. La
adaptación de frontmatter solo se aplica a `assetKind === 'agents'`. Si en el futuro un host
documenta un formato de skills propio, se agregará una rama en el dispatch del adaptador.

#### Scenario: Skills son identity para todo host

- **WHEN** se instala una skill para cualquier host conocido
- **THEN** el frontmatter de la skill instalada es byte-idéntico al de origen
- **AND** el adaptador no modifica ningún campo
