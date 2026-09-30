# Spec delta: add-multi-agent-cli-support — agent-install-routing

## ADDED Requirements

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

### Requirement: Cobertura de soporte por host y exclusión de assets no verificados

El CLI SHALL tratar un asset como soportado por un host sólo cuando el directorio y el formato del host
estén verificados. El CLI SHALL declarar no soportados los `agents` y `commands` de `antigravity`,
`cursor` y `roo` y NO SHALL escribir esos assets para esos hosts, evitando materializar archivos que el
host no consumiría.

#### Scenario: No se escriben agents/commands de hosts sin convención verificada

- **WHEN** se instala con `agent: cursor`, `agent: roo` o `agent: antigravity`
- **THEN** el CLI NO SHALL crear archivos de agents ni de commands para ese host
- **AND** las skills del host sí se escriben en su directorio de skills

### Requirement: Aviso no bloqueante por asset no soportado

Cuando un asset es no soportado para el host resuelto (por ejemplo `agents` o `commands` de `antigravity`),
el CLI SHALL emitir a **stderr** una línea por asset omitido y NO SHALL abortar: el **exit code NO SHALL
cambiar**. El aviso NO SHALL registrarse en el manifiesto `.ancletorc` (consistente con `installedPaths` =
unión de destinos realmente escritos).

#### Scenario: Un asset `null` produce un aviso a stderr sin fallar

- **WHEN** se instala con `agent: antigravity`, para quien `agents` no está soportado
- **THEN** el CLI imprime en stderr una línea con formato `skip agents: not supported by host 'antigravity'`
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

El CLI NO SHALL generar ni transformar configuración MCP específica de host como parte del ruteo
multi-agente. `.mcp.json`, `mcp_config.json` y `.vscode/mcp.json` SHALL quedar fuera de alcance. El CLI
NO SHALL borrar ni pisar configuración MCP preexistente del usuario.

#### Scenario: El ruteo no genera config MCP de host

- **WHEN** se instala con cualquier host soportado
- **THEN** el CLI NO SHALL crear `.mcp.json`, `mcp_config.json` ni `.vscode/mcp.json`
- **AND** la configuración MCP preexistente del usuario se conserva
