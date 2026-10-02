# Spec: frontmatter-adapters (delta)

> Delta sobre `aspec/specs/skill-frontmatter-adapters/spec.md`.
> Solo se especifican los cambios introducidos por este change.

## ADDED Requirements

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
vscode, antigravity, cursor, roo, copilot), el adaptador SHALL retornar el contenido sin cambios
(passthrough) y SHALL emitir un aviso a stderr indicando que el agent es desconocido. El adaptador
NO SHALL abortar ni lanzar una excepción.

#### Scenario: Host desconocido no rompe la instalación

- **WHEN** se llama al adaptador con `host: 'unknown-host'`
- **THEN** el contenido retornado es byte-idéntico al de entrada
- **AND** el CLI emite a stderr: `unknown agent 'unknown-host', passthrough`
- **AND** el comando completa con exit 0

### Requirement: `ancleto check` valida frontmatter de agents contra el adaptador

`ancleto check` SHALL validar que el frontmatter de los agents instalados coincida con la salida del
adaptador para el host correspondiente. Para cada archivo `.md` en un directorio de agents instalado,
el check SHALL leer el contenido instalado, leer el contenido de origen, aplicar
`adaptFrontmatter(origen, host, 'agents', name)`, y comparar el resultado con el instalado. La
divergencia SHALL reportarse como warning (⚠), no como faltante (✖). El exit code NO SHALL cambiar
por divergencias de frontmatter (solo por faltantes de archivo).

#### Scenario: Frontmatter instalado coincide con el adaptador

- **WHEN** se ejecuta `ancleto check` en un proyecto con agents instalados correctamente
- **THEN** el check NO reporta divergencias de frontmatter
- **AND** el comando completa con exit 0

#### Scenario: Frontmatter editado manualmente se reporta como divergencia

- **WHEN** un agent instalado tiene su frontmatter editado manualmente (difiere de la salida del adaptador)
- **THEN** `ancleto check` reporta: `⚠ <dir>/<file> (frontmatter diverge del adaptador para host 'X')`
- **AND** el aviso es no bloqueante (exit code 0 si no hay faltantes)

#### Scenario: Check deriva el host del directorio instalado

- **WHEN** un proyecto tiene agents instalados para múltiples hosts (multi-host)
- **THEN** `ancleto check` SHALL derivar el host de cada directorio de agents usando
  `installedHostsFromPaths` (unión de hosts del manifiesto)
- **AND** SHALL aplicar el adaptador correspondiente a cada host para la validación

### Requirement: Skills no se adaptan (política vigente)

El adaptador SHALL tratar las skills como identity (passthrough) para todos los hosts conocidos. La
adaptación de frontmatter solo se aplica a `assetKind === 'agents'`. Si en el futuro un host
documenta un formato de skills propio, se agregará una rama en el dispatch del adaptador.

#### Scenario: Skills son identity para todo host

- **WHEN** se instala una skill para cualquier host conocido
- **THEN** el frontmatter de la skill instalada es byte-idéntico al de origen
- **AND** el adaptador no modifica ningún campo

## Notas

- Las reglas de adaptación de agents para `antigravity`, `claude`, `vscode` y `copilot` ya están
  especificadas en `aspec/specs/skill-frontmatter-adapters/spec.md` y no se modifican en este change.
- Los tool IDs de Antigravity son los verificados en la tabla de frontmatter de Custom Subagents
  (`view_file`, `replace_file_content`, `grep_search`, `run_command`, `manage_task`), no los listados
  en la propuesta original (`read_file`, `write_file`, `list_dir`, `search_files`, `execute_command`).
