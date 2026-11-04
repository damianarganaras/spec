# Spec delta: host-compression-note-consistency — project-portability

## ADDED Requirements

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
