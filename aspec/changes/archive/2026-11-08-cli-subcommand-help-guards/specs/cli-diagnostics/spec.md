# Spec delta: cli-subcommand-help-guards — cli-diagnostics

## ADDED Requirements

### Requirement: Manejo de `--help` sin ejecución en subcomandos que mutan estado

`ancleto <subcomando> --help` y `ancleto <subcomando> -h` SHALL imprimir el uso del subcomando a
STDOUT y SHALL salir con exit code 0 antes de ejecutar el handler del subcomando. La presencia de
`--help` o `-h` en cualquier posición del argv del subcomando SHALL activar este comportamiento.

El conjunto de subcomandos alcanzado SHALL ser: `install`, `update`, `upgrade`, `init`, `memory`,
`import`, `export`, `mcp`, `specs` (nivel superior), `specs merge` y `projects`. Para `memory`, el
guard SHALL aplicar tanto a `memory --help` como a `memory <subcomando> --help`. Para `projects`, el
guard SHALL aplicar a `projects --help` y a `projects <subcomando> --help`, incluidos `projects scan`,
`projects prune`, `projects update` y `projects list --update`, y también cuando el alias
`ancleto list --projects` delega en el handler de `projects`.

El texto de uso SHALL identificar el comando y sus argumentos y SHALL ser consistente con la sinopsis
de la ayuda global `HELP`. El texto MAY mantenerse como constantes por comando y NO SHALL omitir
ningún flag documentado del comando. Para `memory` y para `projects`, SHALL cubrir los subcomandos
listados en el uso que hoy se imprime a stderr ante un subcomando desconocido. Para `specs`, SHALL
incluir las formas de `specs check` y `specs merge`.

El guard NO SHALL ejecutar el handler, NO SHALL escribir archivos, NO SHALL crear directorios y NO
SHALL iniciar el servidor MCP. La invariante SHALL ser verificable comparando bytes y `mtime` de
`.ancletorc` y de `.opencode/**` antes y después de una invocación con `--help` en un proyecto
temporal, y comparando bytes y `mtime` del registro de proyectos en
`ANCLETO_PROJECTS_FILE` cuando esa variable apunte a un archivo temporal.

`ancleto discovery --help` y la ayuda global de `ancleto --help`, `ancleto -h` y `ancleto` sin
argumentos SHALL conservar su salida y su exit code actuales.

Las invocaciones sin `--help` ni `-h` NO SHALL cambiar: el parseo de argumentos, los textos de error y
los exit codes por argumentos faltantes o desconocidos SHALL ser los mismos.

Los subcomandos read-only `check`, `doctor`, `stats`, `list` (sin `--projects`) y `affected` quedan
explícitamente fuera de este requirement: NO SHALL agregarse el guard y su comportamiento ante
`--help` NO SHALL cambiar. `specs check --help` también queda fuera.

#### Scenario: `install` y `update` con `--help` imprimen uso sin instalar

- **WHEN** se ejecuta `ancleto install --help` o `ancleto update -h` en un directorio temporal
- **THEN** el comando imprime a STDOUT el uso de `install`/`update`
- **AND** sale con exit code 0
- **AND** no crea ni modifica `.ancletorc`, `.opencode/**` ni ningún otro archivo

#### Scenario: `upgrade` con `--help` no re-aplica templates

- **WHEN** se ejecuta `ancleto upgrade --help` en un directorio temporal sin `.ancletorc`
- **THEN** imprime a STDOUT el uso de `upgrade`
- **AND** sale con exit code 0
- **AND** no re-aplica templates, skills ni manifiesto

#### Scenario: `init` con `--help` no crea el scaffold

- **WHEN** se ejecuta `ancleto init --help` en un directorio temporal sin `.ancletorc`
- **THEN** imprime a STDOUT el uso de `init`
- **AND** sale con exit code 0
- **AND** no crea `.ancletorc`, `.opencode/**`, `aspec/config.yaml` ni ningún otro archivo

#### Scenario: `memory` con `--help` no ejecuta la operación

- **WHEN** se ejecuta `ancleto memory --help`, `ancleto memory -h` o `ancleto memory <subcomando> --help`
- **THEN** imprime a STDOUT el uso de `memory` y sus subcomandos
- **AND** sale con exit code 0
- **AND** no ejecuta la operación ni escribe en `.ancleto/memory.db`

#### Scenario: `import` y `export` con `--help` no importan ni exportan

- **WHEN** se ejecuta `ancleto import --help` o `ancleto export --help`
- **THEN** imprime a STDOUT el uso correspondiente
- **AND** sale con exit code 0
- **AND** no escribe bundle, config MCP ni manifiesto

#### Scenario: `mcp` con `--help` no inicia el servidor

- **WHEN** se ejecuta `ancleto mcp --help`
- **THEN** imprime a STDOUT el uso de `mcp`
- **AND** sale con exit code 0
- **AND** no inicia el servidor MCP ni abre `.ancleto/memory.db`

#### Scenario: `specs` y `specs merge` con `--help` no aplican el delta

- **WHEN** se ejecuta `ancleto specs --help` o `ancleto specs merge --help`
- **THEN** imprime a STDOUT el uso de `specs` con las formas de `specs check` y `specs merge`
- **AND** sale con exit code 0
- **AND** no valida ni aplica ningún delta ni escribe bajo `aspec/specs/**`

#### Scenario: `projects` con `--help` no escribe el registro de proyectos

- **WHEN** se ejecuta `ancleto projects --help`, `ancleto projects prune --help`,
  `ancleto projects update --help`, `ancleto projects scan --help` o
  `ancleto projects list --update --help` en un directorio temporal con `ANCLETO_PROJECTS_FILE`
  apuntando a un archivo temporal
- **THEN** imprime a STDOUT el uso de `projects` con sus subcomandos
- **AND** sale con exit code 0
- **AND** el registro de proyectos queda con los mismos bytes y el mismo `mtime`
- **AND** no se actualiza ningún proyecto ni se crea ni modifica ningún archivo

#### Scenario: `-h` es equivalente a `--help` en todo el conjunto

- **WHEN** se ejecuta cada subcomando del conjunto (`install`, `update`, `upgrade`, `init`, `memory`,
  `import`, `export`, `mcp`, `specs`, `specs merge` y `projects` con sus subcomandos) con `-h` en
  lugar de `--help`
- **THEN** el comportamiento es idéntico: uso en STDOUT, exit code 0 y cero escrituras

#### Scenario: La ayuda no escribe ni siquiera en un proyecto ya inicializado

- **WHEN** se ejecuta cada subcomando del conjunto con `--help` en un proyecto temporal ya inicializado
- **THEN** los bytes y el `mtime` de `.ancletorc` y de todos los archivos bajo `.opencode/**` quedan idénticos antes y después

#### Scenario: `discovery --help` y la ayuda global no cambian

- **WHEN** se ejecuta `ancleto discovery --help`, `ancleto --help`, `ancleto -h` o `ancleto` sin argumentos
- **THEN** la salida y el exit code son los actuales
- **AND** el texto de ayuda de `discovery` no cambia

#### Scenario: Una invocación sin `--help` conserva su comportamiento

- **WHEN** se ejecuta cualquiera de los subcomandos del conjunto sin `--help` ni `-h`
- **THEN** el parseo de argumentos, los textos de error y los exit codes por argumentos faltantes o desconocidos son los mismos que antes del cambio

#### Scenario: Los subcomandos read-only quedan fuera del guard

- **WHEN** se ejecuta `ancleto check --help`, `ancleto doctor --help`, `ancleto stats --help`,
  `ancleto list --help`, `ancleto affected --help` o `ancleto specs check --help`
- **THEN** el guard de ayuda no se aplica
- **AND** su comportamiento es el mismo que antes del cambio
