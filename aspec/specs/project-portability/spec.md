# Spec: project-portability

## ADDED Requirements

### Requirement: Export portable sin rutas absolutas

The system SHALL generar un bundle portable cuyo manifiesto no contenga paths absolutos ni secretos.

#### Scenario: Export en máquina origen

- **WHEN** se ejecuta `ancleto export`
- **THEN** se genera el bundle con `manifest.json` (versión, agente, tier, idioma, flags, MCP por nombre+tipo)
- **AND** el manifiesto no contiene paths absolutos, credenciales ni datos de sesión

### Requirement: Import regenera MCP locales

The system SHALL aplicar los portables y regenerar las entradas MCP con rutas del host destino.

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

`ancleto import <bundle>` SHALL materializar `CAVEMAN_USAGE_NOTE` en el orchestrator del host activo
— el host que la importación está reconstruyendo — bajo el mismo invariante estado-driven y acotado
al host activo que `install`, `init` y `ancleto check`: para ese orchestrator, la nota existe si y
sólo si el host soporta compresión y la configuración MCP final de ese mismo host incluye `caveman`.
La consistencia cross-host (H3/H9) queda fuera de alcance como en `proposal.md`; el aviso advisory de
`ancleto check` en proyectos mixtos NO SHALL invalidar este invariante.

La configuración final de `import` SHALL comprender la configuración presente en disco y el MCP que
el propio comando escribirá. Para `opencode`, el import SHALL contar como configuración final el MCP
que `repairProjectMcp` va a escribir, de modo que un bundle que declara `caveman` y un binario
disponible produzca la nota. Para `antigravity`, el import NO SHALL asumir que `repairProjectMcp`
escribe `.agents/mcp_config.json`: la nota SHALL materializarse sólo si esa configuración de workspace
ya incluye `caveman`.

El import NO SHALL cambiar el archivo de configuración MCP al que escribe cada host, ni el orden de
sus escrituras, ni el contrato de `ancleto check`. Un bundle con `manifest.mcp` vacío NO SHALL
producir la nota si la configuración final del host no incluye `caveman`, aunque el binario esté
disponible. Un bundle que declara `caveman` y cuya configuración MCP final no incluye `caveman` —el
binario no puede materializarlo y el disco tampoco lo aporta— NO SHALL producir la nota; si la
configuración en disco ya incluye `caveman`, la nota SHALL materializarse. Re-ejecutar
`ancleto import <bundle>` SHALL ser idempotente y SHALL sanear un estado legado
de nota sin configuración, porque vuelve a materializar los assets del host activo. `ancleto import
--repair` sin bundle NO reescribe assets y, por lo tanto, NO SHALL sanear la nota legada.

#### Scenario: Bundle sin MCP y binario presente no produce divergencia

- **WHEN** se importa un bundle con `manifest.mcp: []` en una máquina con `caveman-mcp` disponible,
  el host es `opencode` y la configuración MCP del destino tampoco incluye `caveman`
- **THEN** el orchestrator instalado NO contiene `CAVEMAN_USAGE_NOTE`
- **AND** `.opencode/opencode.json` no incluye `caveman` en su configuración final
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador`

#### Scenario: Bundle que declara caveman y binario presente materializa configuración y nota

- **WHEN** se importa en `opencode` un bundle cuyo `manifest.mcp` declara `caveman` y el binario está
  disponible
- **THEN** la configuración MCP final incluye `caveman`
- **AND** el orchestrator instalado contiene `CAVEMAN_USAGE_NOTE`
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador`

#### Scenario: Bundle que declara caveman sin binario no materializa la nota

- **WHEN** se importa en `opencode` un bundle cuyo `manifest.mcp` declara `caveman`, el binario no
  está disponible y la configuración MCP del destino tampoco incluye `caveman`
- **THEN** la configuración MCP final no incluye `caveman`
- **AND** el orchestrator instalado NO contiene `CAVEMAN_USAGE_NOTE`

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

#### Scenario: Re-importar un bundle sanea un estado legado de nota sin configuración

- **WHEN** existe un orchestrator importado con `CAVEMAN_USAGE_NOTE` y la configuración MCP final del
  host no incluye `caveman`, y se re-ejecuta `ancleto import <bundle>`
- **THEN** el orchestrator se reescribe completo sin la nota
- **AND** `ancleto check` no reporta `frontmatter diverge del adaptador` por ese motivo

#### Scenario: `import --repair` sin bundle no sanea la nota legada

- **WHEN** existe un orchestrator importado con `CAVEMAN_USAGE_NOTE` y la configuración MCP final del
  host no incluye `caveman`, y se ejecuta `ancleto import --repair` sin bundle
- **THEN** los assets del host no se reescriben
- **AND** el orchestrator conserva su contenido, incluida la nota legada
- **AND** el comando no promete sanear la nota en ese modo

#### Scenario: Re-importar es idempotente

- **WHEN** se ejecuta dos veces el mismo `ancleto import <bundle>` sobre el mismo destino y estado de
  configuración
- **THEN** la nota aparece como máximo una vez en el orchestrator
- **AND** la decisión de materialización y la configuración MCP final no cambian entre ejecuciones

### Requirement: Reparación in place sin bundle

The system SHALL regenerar las entradas MCP rotas del proyecto actual sin requerir bundle.

#### Scenario: Import con repair

- **WHEN** se ejecuta `ancleto import --repair` y una entrada MCP tiene `command` inexistente
- **THEN** solo esa entrada se regenera y las entradas sanas permanecen intactas
