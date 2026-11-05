# Spec: project-portability

## ADDED Requirements

### Requirement: Export portable sin rutas absolutas

The system SHALL generar un bundle portable cuyo manifiesto no contenga paths absolutos ni secretos.

#### Scenario: Export en máquina origen

- **WHEN** se ejecuta `ancleto export`
- **THEN** se genera el bundle con `manifest.json` (versión, agente, tier, idioma, flags, MCP por nombre+tipo)
- **AND** el manifiesto no contiene paths absolutos, credenciales ni datos de sesión

### Requirement: Import regenera MCP locales

`ancleto import <bundle>` SHALL aplicar los portables y regenerar las entradas MCP en el destino del host activo que declare el descriptor único de destino MCP por host, con rutas locales del host destino. El destino NO SHALL ser fijo `.opencode/opencode.json`: para `opencode` SHALL ser `.opencode/opencode.json` o el `.opencode/opencode.jsonc` existente; para `antigravity`, `.agents/mcp_config.json`; para `commandcode`, `.mcp.json`; para `copilot`, `copilot-mcp.json`.

Cuando el host activo no declare destino (`claude`, `vscode`, `cursor`, `roo`), `import` NO SHALL escribir ningún archivo MCP, NO SHALL crear `.opencode/opencode.json` y SHALL emitir como máximo un aviso no bloqueante que nombre el host. El comando NO SHALL abortar por eso y SHALL completar con el exit code que ya tenía.

El merge SHALL ser no destructivo e idempotente: SHALL agregar sólo nombres ausentes y NO SHALL borrar entradas ni archivos existentes. Un destino preexistente de otro host NO SHALL borrarse. En un destino declarado no parseable, `import` SHALL avisar nombrando el archivo y SHALL sobrescribirlo con la configuración nueva, sin abortar.

Al final, `import` SHALL correr `doctor` y reportar su resultado, como hoy. La intención MCP de un bundle exportado SHALL seguir leyéndose sólo de `opencode`; este change NO SHALL hacer host-aware el manifiesto de export. El import SHALL aplicar los nombres intencionados del bundle al destino del host activo.

#### Scenario: Import en máquina destino con `opencode`

- **WHEN** se ejecuta `ancleto import` con un bundle válido y host activo `opencode`
- **THEN** los activos portables quedan aplicados y el MCP apunta a rutas locales válidas en `.opencode/opencode.json` o en el `.opencode/opencode.jsonc` existente
- **AND** al final se corre `doctor` y se reporta el resultado

#### Scenario: Import con host activo `copilot`

- **WHEN** se ejecuta `ancleto import` con un bundle válido y host activo `copilot`
- **THEN** el MCP se escribe o mergea en `copilot-mcp.json`
- **AND** NO SHALL crearse `.opencode/opencode.json`
- **AND** al final se corre `doctor` y se reporta el resultado

#### Scenario: Import con host activo `antigravity`

- **WHEN** se ejecuta `ancleto import` con un bundle válido y host activo `antigravity`
- **THEN** el MCP se escribe o mergea en `.agents/mcp_config.json`
- **AND** NO SHALL crearse `.opencode/opencode.json`

#### Scenario: Import con host activo `commandcode`

- **WHEN** se ejecuta `ancleto import` con un bundle válido y host activo `commandcode`
- **THEN** el MCP se escribe o mergea en `.mcp.json`
- **AND** NO SHALL crearse `.opencode/opencode.json`

#### Scenario: Import con host sin destino

- **WHEN** se ejecuta `ancleto import` con un bundle válido y host activo `claude`, `vscode`, `cursor` o `roo`
- **THEN** el CLI NO SHALL escribir ningún archivo MCP
- **AND** NO SHALL crear `.opencode/opencode.json`
- **AND** emite como máximo un aviso no bloqueante que nombra el host
- **AND** al final se corre `doctor` y se reporta el resultado

#### Scenario: Un `.opencode` previo no se borra

- **WHEN** el destino tiene `.opencode/opencode.json` de una instalación previa y se importa un bundle para un host distinto de `opencode`
- **THEN** el archivo `.opencode/opencode.json` existente NO SHALL borrarse ni reescribirse

#### Scenario: Un destino declarado no parseable se avisa y se reemplaza

- **WHEN** el destino MCP declarado del host activo existe y no es JSON parseable
- **THEN** `import` emite un aviso que nombra el archivo
- **AND** lo sobrescribe con la configuración MCP nueva
- **AND** el comando no aborta

#### Scenario: Reimportar es idempotente

- **WHEN** se ejecuta dos veces el mismo `ancleto import <bundle>` sobre el mismo destino y estado de configuración
- **THEN** el destino MCP contiene el mismo conjunto de entradas
- **AND** NO SHALL perderse ninguna entrada ni archivo previo

#### Scenario: `export` conserva la intención sólo-opencode

- **WHEN** se ejecuta `ancleto export` en un proyecto cuyo MCP de host es `copilot-mcp.json`
- **THEN** el manifiesto MCP SHALL seguir leyéndose sólo de la configuración de `opencode`
- **AND** NO SHALL incorporar `copilot-mcp.json` como intención MCP del bundle

#### Scenario: Import en máquina destino

- **WHEN** se ejecuta `ancleto import` con un bundle válido
- **THEN** los activos portables quedan aplicados y el MCP apunta a rutas locales válidas
- **AND** al final se corre `doctor` y se reporta el resultado

### Requirement: import registra las rutas instaladas que escribe

Cuando el bundle incluye `.ancletorc`, `ancleto import` SHALL registrar en `.ancletorc.installedPaths`
las rutas relativas reales que el propio import escribió en los cuatro grupos `templates`, `agents`,
`commands` y `skills`. El valor escrito SHALL ser la unión acumulativa de las rutas ya declaradas en
el `.ancletorc` del proyecto destino y las rutas efectivamente escritas por este import. La semántica
general del manifiesto SHALL ser la del requirement "Manifiesto veraz y acumulativo de las rutas de
instalación" de `agent-install-routing`; este requirement NO SHALL redefinir aquella semántica y sólo
fija, como obligación específica de `import`, la incorporación de las rutas escritas a esa unión
acumulativa.

La escritura del manifiesto SHALL ocurrir después de las escrituras de assets que registra:
`installAgentAssets`, `installProfileOverlay` y la aplicación de tier. Reubicar la escritura existente
o reescribir el manifiesto después de los assets son implementaciones equivalentes; el requisito es
que el manifiesto registre lo escrito, no una ubicación de línea.

Los directorios que el import copia desde el bundle —`.opencode/agents`, `.opencode/commands` y
`.opencode/skills`, cuando están presentes— SHALL incorporarse a esa misma unión, de modo que lo
copiado del bundle no quede fuera de `installedPaths`. Una ruta escrita tanto por la copia del bundle
como por la instalación de assets SHALL registrarse exactamente una vez.

`ancleto import` NO SHALL leer ni copiar `installedPaths` del `.ancletorc` del bundle. Un bundle
exportado conserva el manifiesto del proyecto origen, de modo que sus rutas describen otra máquina y
no el destino. Un import que no escribe ninguno de los cuatro grupos SHALL preservar sin cambios el
`installedPaths` previo del destino. `ancleto export` NO SHALL cambiar.

#### Scenario: Un import sobre un destino fresco registra lo escrito

- **WHEN** se ejecuta `ancleto import <bundle>` sobre un proyecto destino vacío y el bundle trae un
  template
- **THEN** `.ancletorc.installedPaths.agents` incluye `.opencode/agents`
- **AND** `.ancletorc.installedPaths.commands` incluye `.opencode/commands`
- **AND** `.ancletorc.installedPaths.skills` incluye `.opencode/skills`
- **AND** `.ancletorc.installedPaths.templates` incluye el template que el bundle aportó
- **AND** el `ancleto check` posterior sale con exit 0 sin faltantes falsos

#### Scenario: Los directorios copiados del bundle se registran sin duplicarse

- **WHEN** el bundle incluye `.ancletorc`, contiene `.opencode/agents`, `.opencode/commands` o
  `.opencode/skills`, y el import los copia al destino
- **THEN** `.ancletorc.installedPaths` incluye los directorios copiados en su grupo correspondiente
- **AND** una ruta escrita tanto por la copia del bundle como por la instalación de assets figura
  exactamente una vez

#### Scenario: Un import sobre un proyecto existente acumula sin perder rutas previas

- **WHEN** el destino ya declara rutas de un layout previo (p. ej. `.cursor/agents`) y se importa un
  bundle para `opencode`
- **THEN** `.ancletorc.installedPaths` conserva las rutas previas y agrega las de `.opencode/*`

#### Scenario: Las rutas del bundle se ignoran

- **WHEN** el `.ancletorc` del bundle declara `installedPaths` con rutas ajenas al destino
- **THEN** `.ancletorc.installedPaths` del destino no incorpora esas rutas
- **AND** `ancleto check` no reporta directorios faltantes por ellas

#### Scenario: Un bundle sin `.ancletorc` no reescribe el manifiesto

- **WHEN** el bundle no incluye `.ancletorc` y el destino ya tiene un `installedPaths`
- **THEN** el import no reescribe el manifiesto
- **AND** `.ancletorc.installedPaths` del destino queda igual

#### Scenario: Reimportar no duplica rutas

- **WHEN** se ejecuta dos veces el mismo `ancleto import <bundle>` sobre el mismo destino
- **THEN** `.ancletorc.installedPaths` contiene cada ruta una sola vez
- **AND** no se pierde ninguna ruta previa

#### Scenario: El resto del flujo de `import` no regresa

- **WHEN** se ejecuta `ancleto import --repair` con una entrada MCP rota
- **THEN** sólo esa entrada se regenera y `.ancletorc.installedPaths` no cambia
- **AND** `.opencode/.ancleto-tier` conserva el tier aplicado, el MCP se regenera con rutas locales y
  `doctor` corre al final

### Requirement: Import decide la directiva de compresión con la configuración MCP final del host

`ancleto import <bundle>` SHALL materializar `CAVEMAN_USAGE_NOTE` en el orchestrator del host activo — el host que la importación está reconstruyendo — bajo el mismo invariante estado-driven y acotado al host activo que `install`, `init` y `ancleto check`: para ese orchestrator, la nota existe si y sólo si el host soporta compresión y la configuración MCP final de ese mismo host incluye `caveman`.

La configuración final de `import` SHALL comprender la configuración presente en disco y el MCP que el propio comando escribirá en el destino del host activo. El destino SHALL resolverse desde el descriptor único y NO SHALL asumirse `.opencode/opencode.json` para todo host. Para `opencode`, la configuración final SHALL contar el MCP que el import escribirá en `.opencode/opencode.json` o en el `.opencode/opencode.jsonc` existente. Para `antigravity`, SHALL contar el MCP que el import escribirá o mergeará en `.agents/mcp_config.json`. Para `copilot` y `commandcode`, el host no soporta compresión y la nota NO SHALL materializarse.

El import NO SHALL cambiar el archivo de configuración MCP al que escribe cada host, ni el orden de sus escrituras, ni el contrato de `ancleto check`. Un bundle con `manifest.mcp` vacío NO SHALL producir la nota si la configuración final del host no incluye `caveman`, aunque el binario esté disponible. Un bundle que declara `caveman` y cuya configuración MCP final no incluye `caveman` —el binario no puede materializarlo y el disco tampoco lo aporta— NO SHALL producir la nota; si la configuración en disco ya incluye `caveman`, la nota SHALL materializarse. Re-ejecutar `ancleto import <bundle>` SHALL ser idempotente y SHALL sanear un estado legado de nota sin configuración, porque vuelve a materializar los assets del host activo. `ancleto import --repair` sin bundle NO reescribe assets y, por lo tanto, NO SHALL sanear la nota legada.

La intención MCP de un bundle exportado SHALL seguir leyéndose sólo de `opencode`; este change NO SHALL hacer host-aware el manifiesto de export. El import SHALL aplicar los nombres intencionados del bundle al destino del host activo.

#### Scenario: Bundle sin MCP y binario presente no produce divergencia

- **WHEN** se importa un bundle con `manifest.mcp: []` en una máquina con `caveman-mcp` disponible, el host es `opencode` y la configuración MCP del destino tampoco incluye `caveman`
- **THEN** el orchestrator instalado NO contiene `CAVEMAN_USAGE_NOTE`
- **AND** `.opencode/opencode.json` no incluye `caveman` en su configuración final
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador`

#### Scenario: Bundle que declara caveman y binario presente materializa configuración y nota

- **WHEN** se importa en `opencode` un bundle cuyo `manifest.mcp` declara `caveman` y el binario está disponible
- **THEN** la configuración MCP final incluye `caveman`
- **AND** el orchestrator instalado contiene `CAVEMAN_USAGE_NOTE`
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador`

#### Scenario: Bundle que declara caveman sin binario no materializa la nota

- **WHEN** se importa en `opencode` un bundle cuyo `manifest.mcp` declara `caveman`, el binario no está disponible y la configuración MCP del destino tampoco incluye `caveman`
- **THEN** la configuración MCP final no incluye `caveman`
- **AND** el orchestrator instalado NO contiene `CAVEMAN_USAGE_NOTE`

#### Scenario: Antigravity materializa la nota con la configuración final que el import escribe

- **WHEN** se importa un bundle con host `antigravity` cuyo `manifest.mcp` declara `caveman` y el binario está disponible
- **THEN** el import escribe o mergea `caveman` en `.agents/mcp_config.json`
- **AND** el orchestrator instalado contiene `CAVEMAN_USAGE_NOTE`

#### Scenario: Antigravity sin caveman en la configuración final no materializa la nota

- **WHEN** se importa un bundle con host `antigravity` y la configuración final de `.agents/mcp_config.json` no incluye `caveman`, aunque el binario esté disponible
- **THEN** el orchestrator instalado NO contiene `CAVEMAN_USAGE_NOTE`
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador` por ese motivo

#### Scenario: Copilot y commandcode nunca materializan la nota

- **WHEN** se importa un bundle con host `copilot` o `commandcode`
- **THEN** el orchestrator instalado NO contiene `CAVEMAN_USAGE_NOTE`
- **AND** la configuración MCP final del host no incorpora `caveman` por este requirement

#### Scenario: Re-importar un bundle sanea un estado legado de nota sin configuración

- **WHEN** existe un orchestrator importado con `CAVEMAN_USAGE_NOTE` y la configuración MCP final del host no incluye `caveman`, y se re-ejecuta `ancleto import <bundle>`
- **THEN** el orchestrator se reescribe completo sin la nota
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador` por ese motivo

#### Scenario: `import --repair` sin bundle no sanea la nota legada

- **WHEN** existe un orchestrator importado con `CAVEMAN_USAGE_NOTE` y la configuración MCP final del host no incluye `caveman`, y se ejecuta `ancleto import --repair` sin bundle
- **THEN** los assets del host no se reescriben
- **AND** el orchestrator conserva su contenido, incluida la nota legada
- **AND** el comando no promete sanear la nota en ese modo

#### Scenario: Re-importar es idempotente

- **WHEN** se ejecuta dos veces el mismo `ancleto import <bundle>` sobre el mismo destino y estado de configuración
- **THEN** la nota aparece como máximo una vez en el orchestrator
- **AND** la decisión de materialización y la configuración MCP final no cambian entre ejecuciones

#### Scenario: Antigravity con configuración de workspace previa materializa la nota

- **WHEN** se importa un bundle con host `antigravity` y `.agents/mcp_config.json` ya incluye
  `caveman`
- **THEN** el orchestrator instalado contiene `CAVEMAN_USAGE_NOTE`
- **AND** el import no asume que `repairProjectMcp` escribió esa configuración

#### Scenario: Antigravity sin configuración de workspace no materializa la nota

- **WHEN** se importa un bundle con host `antigravity` y `.agents/mcp_config.json` no incluye
  `caveman`, aunque el binario esté disponible
- **THEN** el orchestrator instalado NO contiene `CAVEMAN_USAGE_NOTE`
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador` por ese motivo

### Requirement: Reparación in place sin bundle

`ancleto import --repair` SHALL regenerar las entradas MCP rotas del proyecto actual sin requerir bundle, en el destino del host activo que declare el descriptor único de destino MCP por host. La salud de cada entrada SHALL decidirse con el único predicado de salud de comandos MCP, compartido con `check` y con los caminos que reparan o refrescan la configuración MCP del proyecto.

El destino NO SHALL ser fijo `.opencode/opencode.json`: para `opencode` SHALL ser `.opencode/opencode.json` o el `.opencode/opencode.jsonc` existente; para `antigravity`, `.agents/mcp_config.json`; para `commandcode`, `.mcp.json`; para `copilot`, `copilot-mcp.json`.

Cuando el host activo no declare destino (`claude`, `vscode`, `cursor`, `roo`), `import --repair` NO SHALL escribir ningún archivo MCP, NO SHALL crear `.opencode/opencode.json` y SHALL emitir como máximo un aviso no bloqueante que nombre el host, sin abortar.

Una entrada SHALL considerarse rota cuando:

- `command` está ausente, no es un arreglo, o es un arreglo vacío;
- su primer elemento no es un string no vacío;
- su primer elemento es una ruta absoluta de la plataforma actual y esa ruta no existe.

Una entrada NO SHALL considerarse rota cuando su primer elemento es un nombre simple que no es una ruta absoluta del host, aunque ese nombre no resuelva en `PATH`: el predicado NO SHALL ejecutar el comando ni resolver `PATH` con procesos externos. Una entrada con una ruta absoluta existente, incluida una ruta de Windows con letra de unidad (`C:\nvm4w\nodejs\node.exe`, `c:/...`), SHALL considerarse sana.

Para los esquemas `mcpServers` de `antigravity` y `commandcode`, la reparación SHALL normalizar la entrada `{ command: <string>, args: [...] }` a la forma canónica `{ command: [<string>, ...<args>] }` antes de aplicar el predicado.

La reparación SHALL limitarse a las entradas rotas: las entradas sanas NO SHALL reescribirse ni alterarse. El exit code de `import --repair` NO SHALL cambiar por este predicado.

Una configuración MCP no parseable NO SHALL reclasificarse aquí: su tratamiento vigente es el de la decisión `m2-nonparseable-config-warn-only` (aviso que nombra el archivo y reemplazo por la configuración nueva), sin reparación por entrada ni aborto. Ese tratamiento SHALL aplicarse sólo a un destino declarado del host activo; un archivo MCP de otro host o de un host sin destino NO SHALL tocarse.

#### Scenario: Import con repair en `opencode`

- **WHEN** se ejecuta `ancleto import --repair` con host activo `opencode` y una entrada MCP del proyecto tiene un `command` roto según el predicado
- **THEN** sólo esa entrada se regenera y las entradas sanas permanecen intactas

#### Scenario: `import --repair` con `copilot` escribe su destino

- **WHEN** se ejecuta `ancleto import --repair` con host activo `copilot`
- **THEN** el CLI repara `copilot-mcp.json`
- **AND** NO SHALL crear `.opencode/opencode.json`

#### Scenario: `import --repair` con `claude` no crea `.opencode/opencode.json`

- **WHEN** se ejecuta `ancleto import --repair` con host activo `claude`
- **THEN** el CLI NO SHALL crear `.opencode/opencode.json`
- **AND** emite como máximo un aviso no bloqueante que nombra `claude`
- **AND** el comando no aborta

#### Scenario: `command` ausente o vacío es roto

- **WHEN** una entrada MCP no declara `command`, lo declara como arreglo vacío, o su primer elemento no es un string no vacío
- **THEN** el predicado SHALL considerar la entrada rota
- **AND** `import --repair` SHALL poder regenerarla cuando exista una definición nueva

#### Scenario: Un nombre simple que no resuelve en PATH es sano

- **WHEN** el primer elemento de `command` es un nombre simple que no es una ruta absoluta del host, por ejemplo `custom-mcp`, y ese nombre no resuelve en `PATH`
- **THEN** el predicado NO SHALL considerar la entrada rota
- **AND** `import --repair` NO SHALL reescribir esa entrada
- **AND** el predicado NO SHALL ejecutar el comando ni resolver `PATH` para decidirlo

#### Scenario: Una ruta absoluta inexistente es rota

- **WHEN** el primer elemento de `command` es una ruta absoluta de la plataforma actual y el archivo no existe
- **THEN** el predicado SHALL considerar la entrada rota
- **AND** `import --repair` SHALL poder regenerarla cuando exista una definición nueva

#### Scenario: Una ruta absoluta existente es sana

- **WHEN** el primer elemento de `command` es una ruta absoluta de la plataforma actual y el archivo existe
- **THEN** el predicado NO SHALL considerar la entrada rota
- **AND** `import --repair` NO SHALL reescribir esa entrada

#### Scenario: Una config MCP no parseable de otro host no se toca en un host sin destino

- **WHEN** existe un `.mcp.json` no parseable y el host activo es `claude`
- **THEN** `import --repair` NO SHALL sobrescribir `.mcp.json`
- **AND** NO SHALL crear `.opencode/opencode.json`
- **AND** el exit code de `import --repair` no cambia por ese archivo

#### Scenario: Repetir `import --repair` es idempotente

- **WHEN** se ejecuta dos veces `import --repair` sobre el mismo estado
- **THEN** el destino MCP conserva el mismo conjunto de entradas
- **AND** NO SHALL crearse archivos MCP nuevos por el host sin destino

#### Scenario: Import con repair

- **WHEN** se ejecuta `ancleto import --repair` y una entrada MCP tiene un `command` roto según el
  predicado
- **THEN** sólo esa entrada se regenera y las entradas sanas permanecen intactas

#### Scenario: Una config MCP no parseable no se reclasifica aquí

- **WHEN** la configuración MCP del proyecto existe y no es JSON parseable
- **THEN** el predicado de salud por entrada NO SHALL aplicarse ni reclasificar el archivo
- **AND** se conserva el tratamiento de `m2-nonparseable-config-warn-only`: aviso que nombra el
  archivo y reemplazo por la configuración MCP nueva
- **AND** el exit code de `import --repair` no cambia por este aviso
