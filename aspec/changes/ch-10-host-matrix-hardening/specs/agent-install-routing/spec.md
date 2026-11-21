# Spec delta: ch-10-host-matrix-hardening — agent-install-routing

## ADDED Requirements

### Requirement: Matriz de hosts y operaciones de ciclo de vida

El CLI SHALL garantizar, para todos los hosts que declare el modelo único por host que define el
destino y la convención de nombre de cada asset —hoy ocho: `opencode`, `claude`, `vscode`,
`antigravity`, `cursor`, `roo`, `copilot` y `commandcode`— y para las operaciones de proyecto `init`,
`install`, `update`, `upgrade` e `import --repair` en su forma sin bundle, que se cumplan los
requirements `Destino nativo por host con directorio y formato por asset`, `Cobertura de soporte por
host y exclusión de assets no verificados` y `Configuración MCP específica de host fuera de alcance`,
con las precisiones de los párrafos siguientes. La verificación de esta matriz SHALL ser posible sin
un host real instalado, sin invocar binarios de host y sin acceso a red.

**Assets y mirrors.** `upgrade` SHALL materializar los assets en el destino nativo del host activo,
con la misma cobertura y convención que `init`, `install` y `update`. `import --repair` sin bundle NO
SHALL reescribir assets: su único efecto de escritura permitido SHALL ser sobre la configuración MCP
del host activo. El contenido de cada mirror escrito SHALL ser el que produce el dueño único de
adaptación a partir de la fuente canónica para ese host y tipo de asset, más las notas host-scoped
documentadas del orchestrator y la aplicación de tier donde corresponda. Ninguna operación de la
matriz SHALL introducir una transformación alternativa que haga divergir el mirror de esa fuente o
que aplique a un host la firma de frontmatter de otro host.

**Templates.** Toda operación de la matriz que reescriba `AGENTS.md` o `PRODUCT.md` SHALL actualizar
sus bloques `LOCKED` desde la fuente canónica y SHALL preservar el contenido `EXTENSIBLE` fuera de
ellos, conforme al contrato de merge vigente. `import --repair` sin bundle NO SHALL modificar esos
templates.

**MCP.** Para toda operación de la matriz, la configuración MCP de proyecto SHALL escribirse sólo en
el destino que el descriptor único declara para el host activo; un host sin destino NO SHALL recibir
archivo MCP ni provocar la creación de `.opencode/opencode.json`. `upgrade` NO SHALL crear un destino
MCP que el descriptor no declare ni escribir en el destino de otro host.

**Idempotencia y no destrucción.** Re-ejecutar la misma operación sobre el mismo estado SHALL
conservar el conjunto de archivos de assets y el conjunto de entradas MCP del host. Ninguna operación
de la matriz SHALL borrar assets, archivos MCP ni entradas preexistentes de otro host.
`import --repair` sin bundle SHALL dejar los assets y los templates byte-idénticos.

#### Scenario: `init`, `install` y `update` rutean los assets de los ocho hosts

- **WHEN** se ejecuta `init`, `install` o `update` en un proyecto temporal para cada uno de los ocho hosts declarados
- **THEN** cada asset soportado aparece en el directorio y con la convención de nombre que el modelo único declara para ese host
- **AND** ningún asset no soportado aparece para ese host
- **AND** ningún asset aparece en un directorio base no declarado para ese host
- **AND** `.ancletorc.installedPaths` registra las rutas escritas por la operación

#### Scenario: `upgrade` re-materializa los assets en el destino nativo

- **WHEN** se ejecuta `upgrade` sobre un proyecto cuyo `.ancletorc.agent` es cada uno de los ocho hosts declarados
- **THEN** cada asset soportado se re-materializa en el directorio nativo del host
- **AND** no se crea ningún asset en el directorio base exclusivo de otro host

#### Scenario: Una operación para otro host conserva los layouts previos

- **WHEN** un proyecto tiene assets de un host previamente instalado y se ejecuta una operación de la matriz para otro host
- **THEN** los assets del host previo permanecen sin cambios
- **AND** sólo se escriben los assets del host activo en su destino declarado

#### Scenario: `import --repair` sin bundle no reescribe assets ni templates

- **WHEN** se ejecuta `import --repair` sin bundle sobre un proyecto con assets y templates ya materializados
- **THEN** los bytes de los assets y de `AGENTS.md`/`PRODUCT.md` permanecen idénticos
- **AND** el único archivo que puede cambiar es el destino MCP declarado para el host activo, y sólo si la reparación lo requiere

#### Scenario: Los mirrors usan el adaptador del host y no el de otro

- **WHEN** se compara un agent, skill o command escrito por una operación de la matriz con la fuente canónica procesada por el dueño único de adaptación para ese host
- **THEN** el cuerpo y la firma de frontmatter corresponden a ese host
- **AND** el mirror no contiene la firma de frontmatter de otro host ni una transformación no documentada
- **AND** las notas host-scoped documentadas del orchestrator no cuentan como divergencia

#### Scenario: Los bloques `LOCKED` se actualizan y el contenido `EXTENSIBLE` se preserva

- **WHEN** un proyecto tiene contenido `EXTENSIBLE` propio y un bloque `LOCKED` desactualizado, y se ejecuta una operación de la matriz que reescribe templates
- **THEN** el bloque `LOCKED` queda alineado con la fuente canónica
- **AND** el contenido `EXTENSIBLE` se preserva fuera de los bloques `LOCKED`

#### Scenario: Los hosts con destino MCP escriben sólo su archivo

- **WHEN** una operación de la matriz escribe configuración MCP para `opencode`, `antigravity`, `commandcode` o `copilot`
- **THEN** el único archivo MCP escrito o mergeado es el que el descriptor declara para ese host
- **AND** no se crea ni se modifica el archivo MCP de otro host
- **AND** el esquema usado es el declarado para ese host

#### Scenario: Los hosts sin destino MCP no escriben MCP

- **WHEN** se ejecuta cualquier operación de la matriz con el MCP habilitado para `claude`, `vscode`, `cursor` o `roo`
- **THEN** no se crea ningún archivo MCP
- **AND** no se crea `.opencode/opencode.json` por esa operación
- **AND** se emite como máximo un aviso no bloqueante que nombra el host
- **AND** el exit code no cambia por el aviso

#### Scenario: `upgrade` sólo refresca el destino MCP declarado

- **WHEN** se ejecuta `upgrade` con host activo `copilot` o `commandcode`
- **THEN** sólo se refresca el archivo MCP que el descriptor declara para ese host
- **AND** no se toca `.opencode/opencode.json` ni el archivo MCP de otro host

#### Scenario: Re-ejecutar una operación es idempotente y no destructivo

- **WHEN** se ejecuta dos veces la misma operación de la matriz sobre el mismo estado
- **THEN** el conjunto de archivos de assets y el conjunto de entradas MCP del host no cambian
- **AND** no se borra ningún asset, archivo MCP ni entrada preexistente
- **AND** una segunda ejecución de `import --repair` sin bundle sobre un proyecto con MCP sano deja el proyecto byte-idéntico

#### Scenario: La matriz se verifica offline

- **WHEN** la suite de la matriz corre en un entorno sin hosts instalados, sin binarios de host y sin red
- **THEN** todas las aserciones de la matriz se ejecutan y pasan
- **AND** la matriz no invoca un host real ni un binario de host
