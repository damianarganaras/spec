# Spec delta: host-neutral-bundle — project-portability

## MODIFIED Requirements

### Requirement: Import regenera MCP locales

`ancleto import <bundle>` SHALL aplicar los portables y regenerar las entradas MCP en el destino del host activo que declare el descriptor único de destino MCP por host, con rutas locales del host destino. El destino NO SHALL ser fijo `.opencode/opencode.json`: para `opencode` SHALL ser `.opencode/opencode.json` o el `.opencode/opencode.jsonc` existente; para `antigravity`, `.agents/mcp_config.json`; para `commandcode`, `.mcp.json`; para `copilot`, `copilot-mcp.json`.

Cuando el host activo no declare destino (`claude`, `vscode`, `cursor`, `roo`), `import` NO SHALL escribir ningún archivo MCP, NO SHALL crear `.opencode/opencode.json` y SHALL emitir como máximo un aviso no bloqueante que nombre el host. El comando NO SHALL abortar por eso y SHALL completar con el exit code que ya tenía.

El merge SHALL ser no destructivo e idempotente: SHALL agregar sólo nombres ausentes y NO SHALL borrar entradas ni archivos existentes. Un destino preexistente de otro host NO SHALL borrarse. En un destino declarado no parseable, `import` SHALL avisar nombrando el archivo y SHALL sobrescribirlo con la configuración nueva, sin abortar.

Al final, `import` SHALL correr `doctor` y reportar su resultado, como hoy. El import SHALL aplicar los nombres intencionados del bundle al destino del host activo.

`ancleto export` SHALL resolver la intención MCP con el host activo declarado en `.ancletorc.agent` cuando sea un host soportado, o con `opencode` por defecto. Para un host que declare destino en el descriptor único, `export` SHALL leer `cfg[schema]` del archivo resuelto y SHALL construir `manifest.mcp` como `[{ name, type: def?.type || 'local', enabled: def?.enabled !== false }]`. Si el archivo de destino no existe, `manifest.mcp` SHALL ser `[]` sin aviso. Si el archivo de destino existe y no es JSON parseable, `manifest.mcp` SHALL ser `[]` y `export` SHALL emitir a stderr un único aviso no bloqueante que nombre el archivo con ruta relativa al proyecto y el texto `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`; el exit code SHALL permanecer en 0. Si `cfg[schema]` (o `cfg.mcp` en la lectura legacy) no es un objeto plano, `manifest.mcp` SHALL ser `[]` y NO SHALL generar entradas fantasma; un mapa válido SHALL conservar sus entradas.

Para un host activo que no declare destino (`claude`, `vscode`, `cursor`, `roo`), `export` NO SHALL incorporar `copilot-mcp.json`, `.mcp.json` ni `.agents/mcp_config.json` como intención MCP y SHALL conservar la lectura legacy de `.opencode/opencode.json` o del `.opencode/opencode.jsonc` existente, con el mismo aviso no bloqueante si ese archivo existe y no parsea. El formato del bundle SHALL seguir siendo `ancleto-export/1`; la forma del manifiesto, el guard de rutas absolutas, el payload de assets `.opencode/{agents,commands,skills}` y la mecánica de `--tar` NO SHALL cambiar. Como consecuencia del export host-aware, `manifest.flags.engram` SHALL derivarse de la intención MCP del host activo y SHALL seguir siendo `true` si y sólo si la intención exportada contiene `engram`.

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

> **Reemplazo de scenario:** al sincronizar, eliminar el scenario canónico «`export` conserva la intención sólo-opencode»; el scenario vigente es «`export` en host sin destino conserva la lectura legacy de `opencode`».

#### Scenario: `export` en host sin destino conserva la lectura legacy de `opencode`

- **WHEN** se ejecuta `ancleto export` con host activo `claude`, `vscode`, `cursor` o `roo` y el proyecto tiene `.opencode/opencode.json` o `.opencode/opencode.jsonc`
- **THEN** `manifest.mcp` SHALL conservar la intención leída de ese archivo legacy
- **AND** NO SHALL incorporar `copilot-mcp.json`, `.mcp.json` ni `.agents/mcp_config.json` como intención MCP

#### Scenario: `export` en host sin destino con archivo legacy no parseable avisa y exporta intención vacía

- **WHEN** el host activo es `claude`, `vscode`, `cursor` o `roo` y el proyecto tiene `.opencode/opencode.json` o el `.opencode/opencode.jsonc` existente con contenido que no parsea como JSON
- **THEN** `manifest.mcp` SHALL ser `[]`
- **AND** `export` SHALL emitir a stderr un único aviso no bloqueante que nombra la ruta relativa del archivo con el texto `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`
- **AND** el exit code SHALL ser 0

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

### Requirement: Import decide la directiva de compresión con la configuración MCP final del host

`ancleto import <bundle>` SHALL materializar `CAVEMAN_USAGE_NOTE` en el orchestrator del host activo — el host que la importación está reconstruyendo — bajo el mismo invariante estado-driven y acotado al host activo que `install`, `init` y `ancleto check`: para ese orchestrator, la nota existe si y sólo si el host soporta compresión y la configuración MCP final de ese mismo host incluye `caveman`.

La configuración final de `import` SHALL comprender la configuración presente en disco y el MCP que el propio comando escribirá en el destino del host activo. El destino SHALL resolverse desde el descriptor único y NO SHALL asumirse `.opencode/opencode.json` para todo host. Para `opencode`, la configuración final SHALL contar el MCP que el import escribirá en `.opencode/opencode.json` o en el `.opencode/opencode.jsonc` existente. Para `antigravity`, SHALL contar el MCP que el import escribirá o mergeará en `.agents/mcp_config.json`. Para `copilot` y `commandcode`, el host no soporta compresión y la nota NO SHALL materializarse.

El import NO SHALL cambiar el archivo de configuración MCP al que escribe cada host, ni el orden de sus escrituras, ni el contrato de `ancleto check`. Un bundle con `manifest.mcp` vacío NO SHALL producir la nota si la configuración final del host no incluye `caveman`, aunque el binario esté disponible. Un bundle que declara `caveman` y cuya configuración MCP final no incluye `caveman` —el binario no puede materializarlo y el disco tampoco lo aporta— NO SHALL producir la nota; si la configuración en disco ya incluye `caveman`, la nota SHALL materializarse. Re-ejecutar `ancleto import <bundle>` SHALL ser idempotente y SHALL sanear un estado legado de nota sin configuración, porque vuelve a materializar los assets del host activo. `ancleto import --repair` sin bundle NO reescribe assets y, por lo tanto, NO SHALL sanear la nota legada.
