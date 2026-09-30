# Spec: claude-support

## Purpose

Soporte de `claude` como host de instalación de assets. Define el alta de `claude` como host soportado,
sus directorios y manifiesto, la dependencia del adaptador de frontmatter de agents y la exclusión de la
configuración MCP específica de host.

## Requirements

### Requirement: Alta de `claude` como host soportado

El CLI SHALL aceptar `claude` como valor válido de `--agent` y en el wizard de selección de host, sin
abortar. Tras el alta, `claude` SHALL comportarse como cualquier otro host soportado: se persiste en
`.ancletorc` (`agent`), se preserva en ejecuciones subsecuentes y SHALL aparecer en la ayuda y en los
textos de selección. El valor por defecto del CLI NO SHALL cambiar (`opencode`).

#### Scenario: `--agent claude` no aborta

- **WHEN** se ejecuta `ancleto init --agent claude` o `ancleto install --project --agent claude`
- **THEN** el comando completa con exit 0
- **AND** `.ancletorc.agent` es `claude`

#### Scenario: `claude` se preserva en ejecuciones subsecuentes

- **WHEN** existe `.ancletorc` con `agent: claude` y se ejecuta un `install`/`init` posterior sin
  `--agent`
- **THEN** el host resuelto sigue siendo `claude`

### Requirement: Directorios y manifiesto de `claude`

Para el host `claude`, el CLI SHALL instalar `skills/`, `agents/` y `commands/` en `.claude/skills`,
`.claude/agents` y `.claude/commands` respectivamente, y SHALL registrar esas rutas en el manifiesto
`.ancletorc`. El ruteo SHALL usar el mismo modelo de destino por host que el resto de los hosts.

#### Scenario: Assets de `claude` en sus rutas

- **WHEN** se instala con `agent: claude`
- **THEN** las skills quedan en `.claude/skills`
- **AND** los agents quedan en `.claude/agents`
- **AND** los commands quedan en `.claude/commands`

#### Scenario: Manifiesto de `claude` veraz

- **WHEN** se instala con `agent: claude`
- **THEN** `.ancletorc.installedPaths.agents` incluye `.claude/agents`
- **AND** `.ancletorc.installedPaths.commands` incluye `.claude/commands`
- **AND** `.ancletorc.installedPaths.skills` incluye `.claude/skills`

### Requirement: El soporte de `claude` requiere el adaptador de frontmatter de agents

El frontmatter de los agents de opencode difiere del de Claude (`tools` mapa vs. lista, `model` del
catálogo vs. alias, y claves `mode`/`color`/`temperature`/`permission` sin equivalente). El adaptador que
resuelve esa diferencia SHALL ser el **mecanismo general** de la capability `skill-frontmatter-adapters`,
aplicable a todo host cuyo formato difiera del origen (hoy también VS Code); `claude` es un **consumidor
más**, no el propietario del adaptador. El CLI NO SHALL declarar soporte real de Claude para agents sin
aplicar ese adaptador: al instalar para `agent: claude`, los agents SHALL pasar por el transformador de
`skill-frontmatter-adapters` antes de escribirse en `.claude/agents`.

#### Scenario: Los agents de `claude` pasan por el adaptador

- **WHEN** se instala con `agent: claude`
- **THEN** cada agent escrito en `.claude/agents` es el resultado del adaptador de frontmatter
- **AND** no conserva claves específicas de opencode ni equivalencias de `model`/`tools` inventadas

### Requirement: MCP de host fuera de alcance para `claude`

El CLI NO SHALL generar ni transformar configuración MCP específica de host al instalar para `claude`.
En particular, el CLI NO SHALL crear `.mcp.json`, NO SHALL convertirlo desde otro esquema MCP y NO SHALL
borrar ni pisar un `.mcp.json` preexistente del usuario.

#### Scenario: No se crea `.mcp.json`

- **WHEN** se instala con `agent: claude`
- **THEN** el CLI NO SHALL crear `.mcp.json`
- **AND** NO SHALL modificar ninguna configuración MCP

#### Scenario: `.mcp.json` preexistente se conserva

- **WHEN** existe un `.mcp.json` del usuario y se instala con `agent: claude`
- **THEN** el contenido preexistente de `.mcp.json` NO SHALL modificarse
