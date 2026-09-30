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

El frontmatter de los agents de opencode NO SHALL copiarse verbatim a un host cuyo formato de agents
difiera del origen. Al instalar agents para `agent: claude` o `agent: vscode`, el transformador SHALL
eliminar las claves específicas de opencode (`mode`, `color`, `temperature`, `permission`) y SHALL aplicar
la política de campos sin equivalencia a `model` y `tools` (ver el requirement de política). El campo
`description` SHALL preservarse. Para el resto de los hosts y tipos de asset sin adaptación documentada,
la instalación SHALL ser identity.

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
