# Spec: project-portability

## Requirements

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

Al final, `import` SHALL correr `doctor` y reportar su resultado, como hoy. El import SHALL aplicar los nombres intencionados del bundle al destino del host activo.

`ancleto export` SHALL resolver la intención MCP con el host activo declarado en `.ancletorc.agent` cuando sea un host soportado, o con `opencode` por defecto. Para un host que declare destino en el descriptor único, `export` SHALL leer `cfg[schema]` del archivo resuelto y SHALL construir `manifest.mcp` como `[{ name, type: def?.type || 'local', enabled: def?.enabled !== false }]`. Si el archivo de destino no existe, `manifest.mcp` SHALL ser `[]` sin aviso. Si el archivo de destino existe y no es JSON parseable, `manifest.mcp` SHALL ser `[]` y `export` SHALL emitir a stderr un único aviso no bloqueante que nombre el archivo con ruta relativa al proyecto y el texto `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`; el exit code SHALL permanecer en 0. Si `cfg[schema]` (o `cfg.mcp` en la lectura legacy) no es un objeto plano, `manifest.mcp` SHALL ser `[]` y NO SHALL generar entradas fantasma; un mapa válido SHALL conservar sus entradas.

Para un host activo que no declare destino (`claude`, `vscode`, `cursor`, `roo`), `export` NO SHALL incorporar `copilot-mcp.json`, `.mcp.json` ni `.agents/mcp_config.json` como intención MCP y SHALL conservar la lectura legacy de `.opencode/opencode.json` o del `.opencode/opencode.jsonc` existente, con el mismo aviso no bloqueante si ese archivo existe y no parsea. El formato del bundle SHALL seguir siendo `ancleto-export/1`; la forma del manifiesto, el guard de rutas absolutas, el payload de assets `.opencode/{agents,commands,skills}` y la mecánica de `--tar` NO SHALL cambiar. Como consecuencia del export host-aware, `manifest.flags.engram` SHALL derivarse de la intención MCP del host activo y SHALL seguir siendo `true` si y sólo si la intención exportada contiene `engram`.

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

#### Scenario: `export` produce la intención del destino del host activo

- **WHEN** se ejecuta `ancleto export` en un proyecto cuyo host activo es `copilot`, `antigravity` o `commandcode`
- **THEN** `manifest.mcp` SHALL reflejar las entradas MCP del archivo de destino que declare el descriptor para ese host (`copilot-mcp.json`, `.agents/mcp_config.json` o `.mcp.json`)
- **AND** NO SHALL leer la intención MCP de `.opencode/opencode.json` ni de `.opencode/opencode.jsonc`

#### Scenario: `export` con destino inexistente exporta intención vacía sin aviso

- **WHEN** se ejecuta `ancleto export` y el archivo de destino que declara el descriptor para el host activo no existe
- **THEN** `manifest.mcp` SHALL ser `[]`
- **AND** NO SHALL emitir un aviso por la ausencia del archivo
- **AND** el exit code SHALL ser 0

#### Scenario: `export` con destino no parseable avisa y exporta intención vacía

- **WHEN** el archivo de destino que declara el descriptor para el host activo existe y no es JSON parseable
- **THEN** `manifest.mcp` SHALL ser `[]`
- **AND** `export` SHALL emitir a stderr un único aviso no bloqueante que nombra la ruta relativa del archivo con el texto `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`
- **AND** el exit code SHALL ser 0

#### Scenario: `export` en host sin destino conserva la lectura legacy de `opencode`

- **WHEN** se ejecuta `ancleto export` con host activo `claude`, `vscode`, `cursor` o `roo` y el proyecto tiene `.opencode/opencode.json` o `.opencode/opencode.jsonc`
- **THEN** `manifest.mcp` SHALL conservar la intención leída de ese archivo legacy
- **AND** NO SHALL incorporar `copilot-mcp.json`, `.mcp.json` ni `.agents/mcp_config.json` como intención MCP

#### Scenario: `export` en host sin destino con archivo legacy no parseable avisa y exporta intención vacía

- **WHEN** el host activo es `claude`, `vscode`, `cursor` o `roo` y el proyecto tiene `.opencode/opencode.json` o el `.opencode/opencode.jsonc` existente con contenido que no parsea como JSON
- **THEN** `manifest.mcp` SHALL ser `[]`
- **AND** `export` SHALL emitir a stderr un único aviso no bloqueante que nombra la ruta relativa del archivo con el texto `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`
- **AND** el exit code SHALL ser 0

#### Scenario: Import en máquina destino

- **WHEN** se ejecuta `ancleto import` con un bundle válido
- **THEN** los activos portables quedan aplicados y el MCP apunta a rutas locales válidas
- **AND** al final se corre `doctor` y se reporta el resultado

### Requirement: Aviso de bundle legacy sin intención MCP en el import

`ancleto import` SHALL emitir exactamente una línea de aviso no bloqueante cuando el `manifest.json`
del bundle no declara la clave `mcp` (`manifest.mcp === undefined`), porque ese bundle precede a la
intención MCP host-aware y su configuración MCP no viajó en el bundle. El aviso SHALL emitirse una
sola vez por ejecución de `import` y SHALL usar el mismo canal que el archivo ya emplea para avisos
no fatales.

El aviso SHALL ser informativo: NO SHALL alterar lo que el import escribe, NO SHALL impedir el
import y NO SHALL cambiar el exit code, que SHALL permanecer en 0. El aviso NO SHALL emitirse cuando
`manifest.mcp` es un arreglo vacío (`[]`), porque el vacío explícito es un estado moderno y legítimo.
Un `manifest.mcp` que no es arreglo SHALL seguir tratándose como bundle inválido con exit 1, sin
aviso.

Este requirement NO SHALL modificar el comportamiento de `Import regenera MCP locales`: el aviso es
aditivo y no cambia qué se escribe ni cómo se resuelve el destino MCP del host activo. El import NO
SHALL emitir un aviso por rutas `.opencode/*` presentes en `installedPaths`.

#### Scenario: Un bundle sin clave mcp emite un aviso no bloqueante

- **WHEN** se ejecuta `ancleto import` con un bundle cuyo `manifest.json` no declara la clave `mcp`
- **THEN** el comando emite exactamente una línea de aviso no bloqueante
- **AND** el import completa y el exit code es 0

#### Scenario: Un bundle con mcp vacío no emite aviso

- **WHEN** se ejecuta `ancleto import` con un bundle cuyo `manifest.mcp` es `[]`
- **THEN** el comando no emite el aviso de bundle legacy
- **AND** el import completa y el exit code es 0

#### Scenario: Un manifest.mcp no-array sigue fallando con exit 1

- **WHEN** se ejecuta `ancleto import` con un bundle cuyo `manifest.mcp` no es un arreglo
- **THEN** el comando falla con exit 1
- **AND** no emite el aviso de bundle legacy

#### Scenario: El aviso no altera lo escrito ni el código de salida

- **WHEN** se ejecuta `ancleto import` con un bundle sin la clave `mcp`
- **THEN** los archivos escritos por el import son los mismos que sin el aviso
- **AND** no se escribe ningún archivo MCP por causa del aviso
- **AND** el exit code permanece en 0

### Requirement: import registra las rutas instaladas que escribe

Cuando el bundle incluye `.ancletorc`, `ancleto import` SHALL registrar en `.ancletorc.installedPaths` las rutas relativas reales que el propio import escribió en los cuatro grupos `templates`, `agents`, `commands` y `skills`. El valor escrito SHALL ser la unión acumulativa de las rutas ya declaradas en el `.ancletorc` del proyecto destino y las rutas efectivamente escritas por este import. La semántica general del manifiesto SHALL ser la del requirement "Manifiesto veraz y acumulativo de las rutas de instalación" de `agent-install-routing`; este requirement NO SHALL redefinir aquella semántica y sólo fija, como obligación específica de `import`, la incorporación de las rutas escritas a esa unión acumulativa.

La escritura del manifiesto SHALL ocurrir después de las escrituras de assets que registra: `installAgentAssets`, `installProfileOverlay` y la aplicación de tier. Reubicar la escritura existente o reescribir el manifiesto después de los assets son implementaciones equivalentes; el requisito es que el manifiesto registre lo escrito, no una ubicación de línea.

Cuando el host activo sea `opencode`, `import` SHALL copiar del bundle los directorios `.opencode/agents`, `.opencode/commands` y `.opencode/skills` que estén presentes y SHALL incorporarlos a la misma unión acumulativa. Cuando el host activo sea distinto de `opencode`, `import` NO SHALL copiar esos directorios del bundle y NO SHALL registrar `.opencode/<asset>` en `installedPaths`; los assets del host activo SHALL materializarse sólo mediante `installAgentAssets`. Una ruta escrita tanto por la copia del bundle como por la instalación de assets SHALL registrarse exactamente una vez.

`ancleto import` NO SHALL leer ni copiar `installedPaths` del `.ancletorc` del bundle. Un bundle exportado conserva el manifiesto del proyecto origen, de modo que sus rutas describen otra máquina y no el destino. Un import que no escribe ninguno de los cuatro grupos SHALL preservar sin cambios el `installedPaths` previo del destino. Ninguna ruta previa del destino SHALL borrarse.

#### Scenario: Un import sobre un destino fresco registra lo escrito

- **WHEN** se ejecuta `ancleto import <bundle>` sobre un proyecto destino vacío, el host activo es `opencode` y el bundle trae un template
- **THEN** `.ancletorc.installedPaths.agents` incluye `.opencode/agents`
- **AND** `.ancletorc.installedPaths.commands` incluye `.opencode/commands`
- **AND** `.ancletorc.installedPaths.skills` incluye `.opencode/skills`
- **AND** `.ancletorc.installedPaths.templates` incluye el template que el bundle aportó
- **AND** el `ancleto check` posterior sale con exit 0 sin faltantes falsos

#### Scenario: Los directorios copiados del bundle se registran sin duplicarse

- **WHEN** el bundle incluye `.ancletorc`, contiene `.opencode/agents`, `.opencode/commands` o `.opencode/skills`, el host activo es `opencode` y el import los copia al destino
- **THEN** `.ancletorc.installedPaths` incluye los directorios copiados en su grupo correspondiente
- **AND** una ruta escrita tanto por la copia del bundle como por la instalación de assets figura exactamente una vez

#### Scenario: Un import para un host distinto de `opencode` no copia ni registra `.opencode`

- **WHEN** el bundle contiene `.opencode/agents`, `.opencode/commands` o `.opencode/skills` y el host activo es `copilot`, `antigravity`, `commandcode`, `claude`, `vscode`, `cursor` o `roo`
- **THEN** el import NO SHALL copiar esos directorios al proyecto destino
- **AND** `installedPaths.agents`, `installedPaths.commands` e `installedPaths.skills` NO SHALL incorporar `.opencode/agents`, `.opencode/commands` ni `.opencode/skills`
- **AND** los assets del host activo SHALL registrarse sólo si `installAgentAssets` los escribió

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

La reparación SHALL escribir el destino sólo cuando exista al menos una de estas condiciones: el archivo no es JSON parseable, la estructura del documento requiere normalización, o hay al menos una entrada reparada o agregada. La invariante de no-escritura de un destino sano SHALL entenderse acotada a `import` / `import --repair` (`repairProjectMcp`): en ese camino un destino sano NO SHALL reescribirse y sus bytes y su fecha de modificación SHALL permanecer idénticos. Los writers `install` / `init` (`setupHostMcp` → `mergeMcp`) y `upgrade` (`refreshCopilotMcp` / `refreshCommandCodeMcp`) reescriben el mismo destino sin este predicado y quedan fuera de esta garantía. La creación del directorio del destino SHALL ocurrir únicamente como parte de una escritura efectiva.

La estructura SHALL requerir normalización cuando el documento raíz no sea un objeto JSON (`null`, arreglo, string, número o booleano), o cuando la clave de esquema del host esté presente con un valor que no sea un objeto JSON. En un documento de raíz objeto, una clave de esquema ausente NO SHALL agregarse sólo para normalizar: SHALL materializarse únicamente si la reparación agrega entradas. Una raíz no-objeto y una config no parseable sin bundle SHALL escribirse igualmente como la configuración estructural o vacía `{<schema>: {}}`, sin agregar entradas. Un destino inexistente sin entradas que reparar o agregar NO SHALL crearse, ni como archivo ni como directorio.

Una configuración MCP no parseable NO SHALL reclasificarse aquí: su tratamiento vigente es el de la decisión `m2-nonparseable-config-warn-only` (aviso que nombra el archivo y reemplazo por una configuración válida), sin reparación por entrada ni aborto. En `import --repair` sin bundle, el reemplazo SHALL ser la configuración vacía `{<schema>: {}}` del host activo; con bundle, SHALL ser la configuración derivada del bundle. Ese tratamiento SHALL aplicarse sólo a un destino declarado del host activo; un archivo MCP de otro host o de un host sin destino NO SHALL tocarse.

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

#### Scenario: Un destino sano no se reescribe

- **WHEN** el destino MCP del host activo existe y todas sus entradas son sanas según el predicado
- **THEN** `import --repair` NO SHALL escribir el archivo
- **AND** los bytes y la fecha de modificación del destino SHALL permanecer idénticos
- **AND** el mensaje de "MCP sanos" y el exit code no cambian

#### Scenario: Un destino inexistente sin entradas que reparar no se crea

- **WHEN** el destino MCP del host activo no existe y la reparación no tiene entradas que reparar ni agregar
- **THEN** `import --repair` NO SHALL crear el archivo de destino
- **AND** NO SHALL crear el directorio que lo contendría

#### Scenario: Un root no-objeto se reemplaza

- **WHEN** el destino MCP del host activo contiene un documento raíz que no es un objeto JSON (`null`, arreglo, string, número o booleano)
- **THEN** la reparación SHALL normalizar el documento a un objeto JSON en lugar de conservarlo
- **AND** el resto del tratamiento de entradas se aplica sobre ese objeto normalizado

#### Scenario: Un valor de schema no-objeto se reemplaza

- **WHEN** el destino MCP del host activo contiene la clave de esquema del host con un valor que no es un objeto JSON, por ejemplo `{"mcp": "x"}`
- **THEN** la reparación SHALL reemplazar ese valor por un objeto JSON
- **AND** el archivo SHALL escribirse aunque no haya entradas rotas

#### Scenario: Un schema ausente no se agrega

- **WHEN** el destino MCP del host activo es un objeto JSON sin la clave de esquema del host y no hay entradas que reparar ni agregar
- **THEN** la reparación NO SHALL agregar la clave de esquema vacía
- **AND** NO SHALL escribir el archivo
