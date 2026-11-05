# Tasks: Ruteo de escritura MCP por host

## 1. Descriptor único de destino MCP por host

- [x] 1.1 Definir en `src/cli/index.js` el mapa de módulo de destinos MCP por host: `opencode` → `.opencode/opencode.json` o `.opencode/opencode.jsonc` existente con esquema `mcp`; `antigravity` → `.agents/mcp_config.json` con `mcpServers`; `commandcode` → `.mcp.json` con `mcpServers`; `copilot` → `copilot-mcp.json` con `mcp`; `claude`, `vscode`, `cursor` y `roo` → `null`.
  - Files: `src/cli/index.js`
- [x] 1.2 Agregar el resolvedor de destino por host que usará el resto de los comandos, incluyendo el par de candidatos de `opencode` (`PROJECT_MCP_CANDIDATES`) y el alcance global sólo-opencode. No cambiar todavía los llamadores.
  - Files: `src/cli/index.js`

## 2. Consolidación de `setupHostMcp` y escritores

- [x] 2.1 Refactorizar `setupHostMcp` para resolver el destino desde el descriptor en lugar de ramas literales por host; conservar el merge no destructivo de `mergeMcp`, `mergeAntigravityMcp` y `mergeCommandCodeMcp`.
  - Files: `src/cli/index.js`
- [x] 2.2 Incorporar `copilot` a `setupHostMcp` con el merge de `copilot-mcp.json` (`mergeCopilotMcp`) y quitar la llamada dual `setupHostMcp` + `mergeCopilotMcp` de `install`.
  - Files: `src/cli/index.js`
- [x] 2.3 Para los hosts sin destino, hacer que `setupHostMcp` no escriba archivo, no cree `.opencode` y emita como máximo un aviso a stderr que nombre el host, sin abortar ni cambiar el exit code.
  - Files: `src/cli/index.js`
- [x] 2.4 Preservar el comportamiento global sin proyecto: la rama global sigue siendo sólo-opencode y no rutea a destinos de proyecto de otros hosts.
  - Files: `src/cli/index.js`

## 3. Ruteo de `init`

- [x] 3.1 Ajustar `initProject` para que el destino MCP provenga del mismo `setupHostMcp`/descriptor, sin construir `join(projectDir, '.opencode')` como destino fijo, y sin rama especial de copilot.
  - Files: `src/cli/index.js`
- [x] 3.2 Verificar que `init --agent copilot` escribe `copilot-mcp.json` y no `.opencode/opencode.json`, y que `init --agent claude|vscode|cursor|roo` no escribe MCP y emite a lo sumo un aviso.
  - Files: `src/cli/index.js`

## 4. Ruteo de `import` e `import --repair`

- [x] 4.1 Parametrizar la lectura/reparación de MCP de `import` para resolver el destino del host activo desde el descriptor, con adaptación de esquema (`mcp` vs `mcpServers` y `command` string + `args` en los esquemas del host).
  - Files: `src/cli/index.js`
- [x] 4.2 Hacer que `import` e `import --repair` no creen `.opencode/opencode.json` cuando el host activo no es `opencode`; para hosts sin destino, no escribir MCP y emitir a lo sumo un aviso.
  - Files: `src/cli/index.js`
- [x] 4.3 Conservar el tratamiento de destino no parseable: aviso nombrando el archivo y sobrescritura con la configuración nueva, sin abortar; conservar la idempotencia de dos importaciones consecutivas.
  - Files: `src/cli/index.js`
- [x] 4.4 Ajustar el cálculo de la nota de compresión de `import` para usar la configuración MCP final del host activo resuelta por el descriptor, sin asumir `.opencode` para todos los hosts.
  - Files: `src/cli/index.js`

## 5. Oráculo `check` host-aware

- [x] 5.1 Derivar los destinos MCP inspeccionados por `check` de la unión de hosts instalados en `installedPaths`, no de un único `rc.agent` ni de una resolución directorio→host que lea `.github/prompts` como `vscode` cuando el host real es `copilot`.
  - Files: `src/cli/index.js`
- [x] 5.2 Inspeccionar el esquema correcto por destino (`mcp` para `opencode`/`copilot`, `mcpServers` para `antigravity`/`commandcode`) y normalizar `{ command: string, args: [] }` a la forma canónica del predicado de salud antes de evaluarlo.
  - Files: `src/cli/index.js`
- [x] 5.3 Mantener los avisos MCP como advisory: sin cambios en `missing`, `orphans` ni en el exit `missing > 0 ? 1 : 0`; no inspeccionar la config global ni archivos de hosts sin destino.
  - Files: `src/cli/index.js`

## 6. Oráculo `doctor` host-aware

- [x] 6.1 Resolver el archivo de proyecto validado por `doctor` desde el host activo y, si no declara destino, desde los hosts instalados en orden determinista (`opencode`, `antigravity`, `commandcode`, `copilot`).
  - Files: `src/cli/index.js`
- [x] 6.2 Conservar el fallback global sólo-opencode, los mensajes existentes (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`, `⚠ opencode.json no encontrado (config MCP)`) y el exit code fatal sólo por Node < 24 o `node:sqlite`.
  - Files: `src/cli/index.js`

## 7. Refrescos de `upgrade`

- [x] 7.1 Hacer que `refreshCopilotMcp` y `refreshCommandCodeMcp` resuelvan su archivo desde el descriptor, sin cambiar su comportamiento ni agregar refrescos MCP nuevos para otros hosts.
  - Files: `src/cli/index.js`

## 8. Tests de escritura y no-op

- [x] 8.1 Cubrir `claude`, `vscode`, `cursor` y `roo` con MCP habilitado: ningún archivo MCP, ningún `.opencode/opencode.json`, a lo sumo un aviso advisory y exit code sin cambios.
  - Files: `test/cli.test.js`
- [x] 8.2 Cubrir proyecto mixto (`opencode` instalado antes, host activo `claude`): `.opencode` existente no se borra, `check` lo sigue validando por la unión de hosts y la corrida de `claude` no lo reescribe.
  - Files: `test/cli.test.js`
- [x] 8.3 Cubrir `init --agent copilot` e `install --agent copilot`: `copilot-mcp.json` presente, `.opencode/opencode.json` ausente, merge no destructivo e idempotencia.
  - Files: `test/cli.test.js`

## 9. Tests de `import`/`--repair`

- [x] 9.1 Cubrir `import --repair` con host activo `claude`: no crea `.opencode/opencode.json`, emite a lo sumo un aviso y es idempotente al ejecutarse dos veces.
  - Files: `test/cli.test.js`
- [x] 9.2 Cubrir el ruteo de `import --repair` a `copilot-mcp.json`, `.agents/mcp_config.json` y `.mcp.json` según el host activo, sin escrituras en `.opencode` para esos hosts.
  - Files: `test/cli.test.js`
- [x] 9.3 Cubrir destino no parseable: aviso que nombra el archivo, sobrescritura sin abortar y exit code sin cambios.
  - Files: `test/cli.test.js`
- [x] 9.4 Cubrir la importación de bundle con host activo `copilot`: escribe `copilot-mcp.json` sin crear `.opencode/opencode.json` y es idempotente.
  - Files: `test/cli.test.js`
- [x] 9.5 Cubrir la importación de bundle con host activo `commandcode`: escribe `.mcp.json` sin crear `.opencode/opencode.json` y es idempotente.
  - Files: `test/cli.test.js`

## 10. Tests del oráculo

- [x] 10.1 Cubrir `check` host-aware: proyecto sólo-`copilot` inspecciona `copilot-mcp.json` y no se lee como `vscode`; `antigravity` inspecciona `.agents/mcp_config.json`; `commandcode` inspecciona `.mcp.json` normalizando `command` string + `args`.
  - Files: `test/cli.test.js`
- [x] 10.2 Cubrir `doctor` host-aware: valida el archivo del host activo/instalado, conserva el fallback global sólo-opencode y no valida `.mcp.json` en un proyecto sólo-`claude`.
  - Files: `test/cli.test.js`
- [x] 10.3 Cubrir que ni `check` ni `doctor` convierten un hallazgo MCP en un exit no cero.
  - Files: `test/cli.test.js`
- [x] 10.4 Actualizar los tests existentes que fijan el comportamiento viejo (claude sin archivos MCP sólo con `--no-mcp`, `doctor` que ignora configs de otros hosts, `check` que no inspecciona configs de otros hosts).
  - Files: `test/cli.test.js`

## 11. Validación

- [x] 11.1 Ejecutar `npm run lint`.
  - Files: ninguno (validación declarada en `PRODUCT.md`)
- [x] 11.2 Ejecutar `npm test`.
  - Files: ninguno (validación declarada en `PRODUCT.md`)
- [x] 11.3 Registrar que el format check queda `not-configured` porque el repositorio no declara formatter.
  - Files: ninguno (validación declarada en `PRODUCT.md`)
