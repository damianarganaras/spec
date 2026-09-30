# Spec delta: add-antigravity-full-support — antigravity-support

## ADDED Requirements

### Requirement: Alta y persistencia de `antigravity` como host soportado

El CLI SHALL aceptar `antigravity` como valor válido de `--agent` y en el wizard de selección de host, sin
abortar. Se persiste en `.ancletorc` (`agent`), se preserva en ejecuciones subsecuentes y aparece en la ayuda
y en los textos de selección. El valor por defecto del CLI NO SHALL cambiar (`opencode`).

#### Scenario: `--agent antigravity` no aborta

- **WHEN** se ejecuta `ancleto init --agent antigravity` o `ancleto install --project --agent antigravity`
- **THEN** el comando completa con exit 0
- **AND** `.ancletorc.agent` es `antigravity`

#### Scenario: `antigravity` se preserva en ejecuciones subsecuentes

- **WHEN** existe `.ancletorc` con `agent: antigravity` y se ejecuta un `install`/`init` posterior sin `--agent`
- **THEN** el host resuelto sigue siendo `antigravity`

### Requirement: Directorios y manifiesto de `antigravity`

Para el host `antigravity`, el CLI SHALL instalar las skills en `.agents/skills/<n>/SKILL.md` y los agents en
`.agents/agents/<n>.md`, y SHALL registrar esas rutas en el manifiesto `.ancletorc`. El ruteo SHALL usar el
mismo modelo de destino por host que el resto de los hosts. El CLI NO SHALL escribir agents ni commands de
`antigravity` en el directorio base de otro host.

#### Scenario: Assets de `antigravity` en sus rutas

- **WHEN** se instala con `agent: antigravity`
- **THEN** las skills quedan en `.agents/skills`
- **AND** los agents quedan en `.agents/agents`
- **AND** NO se crea un directorio `.agents/commands`

#### Scenario: Manifiesto de `antigravity` veraz

- **WHEN** se instala con `agent: antigravity`
- **THEN** `.ancletorc.installedPaths.skills` incluye `.agents/skills`
- **AND** `.ancletorc.installedPaths.agents` incluye `.agents/agents`

### Requirement: Materialización de `commands` como skills en `antigravity`

Antigravity no expone un directorio de commands de proyecto; su equivalente vigente son las Agent Skills
(los Workflows están deprecados). Al instalar para `agent: antigravity`, el CLI SHALL materializar cada
`commands/cleto-*.md` como una skill en `.agents/skills/<command>/SKILL.md`, con `name` igual al nombre del
command y `description` tomada del command de origen. El manifiesto NO SHALL registrar un directorio de
commands para `antigravity` (no existe): los command-skills son parte del layout de skills.

#### Scenario: Los commands quedan disponibles como skills

- **WHEN** se instala con `agent: antigravity`
- **THEN** existe `.agents/skills/cleto-new/SKILL.md` con `name: cleto-new`
- **AND** `.ancletorc.installedPaths.commands` no registra ninguna ruta para `antigravity`

### Requirement: El soporte de `antigravity` requiere el adaptador de frontmatter de agents

El frontmatter de los agents de opencode no es válido para Antigravity (`tools` mapa vs. lista, `model` del
catálogo vs. enum, `mode`/`color`/`temperature`/`permission` sin equivalente). El adaptador que resuelve esa
diferencia SHALL ser el **mecanismo general** de la capability `skill-frontmatter-adapters`; `antigravity` es
un **consumidor más**, no el propietario. El CLI NO SHALL declarar soporte real de Antigravity para agents sin
aplicar ese adaptador: al instalar para `agent: antigravity`, los agents SHALL pasar por el transformador
antes de escribirse en `.agents/agents`.

#### Scenario: Los agents de `antigravity` pasan por el adaptador

- **WHEN** se instala con `agent: antigravity`
- **THEN** cada agent escrito en `.agents/agents` es el resultado del adaptador de frontmatter
- **AND** no conserva claves específicas de opencode ni equivalencias de `model`/`tools` inventadas

### Requirement: Política de `model` de los agents de `antigravity`

El CLI NO SHALL mapear el catálogo de modelos de opencode (ni los modelos de tier) a un alias de Antigravity:
no existe una equivalencia verificada. Los agents de `antigravity` SHALL declarar `model: inherit`, y el tier
NO SHALL reescribir el `model` de esos agents.

#### Scenario: `model` queda en `inherit`

- **WHEN** se instala con `agent: antigravity` con cualquier tier
- **THEN** los agents instalados declaran `model: inherit`
- **AND** NO contienen un identificador de modelo de `opencode-go`

### Requirement: Configuración MCP de workspace de `antigravity`

El CLI SHALL generar o mergear `.agents/mcp_config.json` en el proyecto con el MCP de memoria de ancleto
(`ancleto-memory`, stdio) y los MCP configurados, usando el esquema de Antigravity
(`{ "mcpServers": { "<n>": { "command": "...", "args": [...], "env": {...} } } }`). El merge SHALL ser **no
destructivo**: SHALL preservar los `mcpServers` y demás claves preexistentes y NO SHALL pisar un servidor
homónimo. Si el archivo existe y no es JSON parseable, el CLI SHALL avisar y NO SHALL sobrescribirlo.

#### Scenario: Se crea el MCP de workspace con el servidor de memoria

- **WHEN** se instala con `agent: antigravity` y el MCP habilitado
- **THEN** `.agents/mcp_config.json` existe con `mcpServers.ancleto-memory.command` y sus `args`
- **AND** el esquema usa `command`/`args`/`env` (sin `type`/`enabled` de opencode)

#### Scenario: Un `mcpServers` preexistente no se pisa

- **WHEN** existe `.agents/mcp_config.json` con un servidor `propio` y se instala con `agent: antigravity`
- **THEN** el servidor `propio` permanece intacto
- **AND** el CLI agrega sólo los servidores faltantes

### Requirement: Instalación completa de `antigravity` desde `init` y `install --project`

Elegir `antigravity` en `ancleto init` o `ancleto install --project` SHALL dejar el proyecto listo para usarse
sin pasos manuales: skills, agents adaptados, commands como skills y el MCP de workspace, todo configurado en
la misma ejecución. `--no-mcp` SHALL omitir la configuración MCP sin afectar el resto de los assets.

#### Scenario: `init --agent antigravity` deja el proyecto completo

- **WHEN** se ejecuta `ancleto init --agent antigravity` en un proyecto vacío
- **THEN** quedan `.agents/skills/`, `.agents/agents/` y `.agents/mcp_config.json`
- **AND** NO se emite ningún aviso de asset no soportado
- **AND** el comando completa con exit 0

#### Scenario: `--no-mcp` omite sólo el MCP

- **WHEN** se ejecuta `ancleto init --agent antigravity --no-mcp`
- **THEN** skills y agents se instalan igual
- **AND** NO se crea `.agents/mcp_config.json`

### Requirement: Integración de `check` y tier sin acoplamiento a `.opencode/*`

Para un proyecto `antigravity`, `ancleto check` SHALL reconocer el layout (`.agents/skills`,
`.agents/agents`) sin reportar faltantes ni huérfanos falsos. El conjunto esperado de cada directorio SHALL
derivarse de la **unión de los hosts realmente instalados** (leída del manifiesto/`installedPaths`), NO de un
único `rc.agent`: para `.agents/skills`, SHALL incluir el catálogo de skills **y** los command-skills
derivados de `commands/*`. Esto evita reportar huérfanos falsos cuando varios hosts conviven en el mismo
proyecto. El estado `scoped`/global del proyecto y el aviso de tier SHALL derivarse de los directorios de
agents realmente instalados del host, NO de `.opencode/agents` fijo: un proyecto `antigravity` con agentes
locales NO SHALL recibir el falso aviso "tier sin agentes locales" ni figurar como global.

#### Scenario: `check` valida el layout de `antigravity` sin falsos positivos

- **WHEN** se instala con `agent: antigravity` y luego se ejecuta `ancleto check`
- **THEN** el comando reporta `0 faltantes` y `0 huerfanos`
- **AND** reconoce `.agents/skills` y `.agents/agents` como instalados

#### Scenario: Un proyecto `antigravity` con agents locales no es "tier huérfano"

- **WHEN** un proyecto `.ancletorc` con `agent: antigravity` tiene `.agents/agents` poblado y un tier declarado
- **THEN** `ancleto check` NO SHALL emitir "tier ... sin agentes locales donde aplicarlo"
- **AND** el proyecto SHALL figurar como `scoped` en `ancleto projects list`

#### Scenario: Proyecto multi-host no reporta huérfanos falsos

- **WHEN** un proyecto instaló `antigravity` junto con otro host y el `.ancletorc` resuelve un `agent` distinto
- **THEN** `ancleto check` SHALL derivar el conjunto esperado de `.agents/skills` de la unión de hosts
  instalados, no de un único `rc.agent`
- **AND** NO SHALL reportar huérfanos falsos por las skills y command-skills de Antigravity
