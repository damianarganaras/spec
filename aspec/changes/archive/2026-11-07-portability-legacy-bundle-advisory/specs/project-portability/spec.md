# Delta: project-portability

## ADDED Requirements

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
