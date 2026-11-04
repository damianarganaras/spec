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

### Requirement: Reparación in place sin bundle

The system SHALL regenerar las entradas MCP rotas del proyecto actual sin requerir bundle.

#### Scenario: Import con repair

- **WHEN** se ejecuta `ancleto import --repair` y una entrada MCP tiene `command` inexistente
- **THEN** solo esa entrada se regenera y las entradas sanas permanecen intactas
