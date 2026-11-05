# Proposal: Ruteo de escritura MCP por host

## Problem

El CLI escribe configuración MCP de proyecto en `.opencode/opencode.json` como destino por defecto, pero ese archivo sólo lo lee `opencode`. El resultado es una brecha entre lo que el CLI escribe y lo que `check`/`doctor` pueden validar en proyectos multi-host:

- `importCmd` llama a `repairProjectMcp` sin condicionar el host (`src/cli/index.js:4374`); `readProjectMcp` devuelve `.opencode/opencode.json` cuando no existe nada (`src/cli/index.js:4117`) y `repairProjectMcp` lo crea (`src/cli/index.js:4148-4149`). Por eso `import --repair` crea un `.opencode` muerto en hosts que no lo leen.
- `setupHostMcp` sólo desvía `antigravity` y `commandcode` (`src/cli/index.js:896-902`); el resto cae en `mergeMcp` y escribe `.opencode/opencode.json`.
- `init` sólo llama a `setupHostMcp` (`src/cli/index.js:2015`) mientras `install` además llama a `mergeCopilotMcp` (`src/cli/index.js:1823-1827`); `init --agent copilot` escribe un `.opencode` muerto y nunca `copilot-mcp.json`.
- `install --agent copilot` escribe ambos archivos; `upgrade` refresca sólo el nativo (`src/cli/index.js:1875-1876`), dejando el `.opencode` obsoleto a la vista de `check`.
- `check` siempre inspecciona `.opencode` (`src/cli/index.js:3008`) mientras el catálogo de modelos está gateado a opencode (`src/cli/index.js:2906-2907`): valida y avisa sobre una config muerta en proyectos claude-only.
- Deriva de specs: `aspec/specs/agent-install-routing/spec.md:180-193` nombra dos excepciones; `aspec/specs/copilot-support/spec.md:5-13` exige `copilot-mcp.json`; `aspec/specs/claude-support/spec.md:66-81` prohíbe modificar MCP para `claude`, pero el fallback a `.opencode` lo hace.
- `commandcode` escribe `.mcp.json` (`src/cli/index.js:899` → `mergeCommandCodeMcp` `:870`), un nombre que Claude también lee. Es un riesgo residual preexistente, documentado y no corregido en este change.

## Proposed change

Introducir un descriptor único de destino MCP por host en `src/cli/index.js` (el mismo módulo que ya es dueño de `PROJECT_MCP_CANDIDATES`, `setupHostMcp` y `mergeMcp`). El descriptor declara, para cada host, el archivo de proyecto y el esquema:

| host activo | destino de proyecto | esquema |
|---|---|---|
| `opencode` | `.opencode/opencode.json` (o el `.opencode/opencode.jsonc` existente) | `mcp` |
| `antigravity` | `.agents/mcp_config.json` | `mcpServers` |
| `commandcode` | `.mcp.json` | `mcpServers` |
| `copilot` | `copilot-mcp.json` | `mcp` |
| `claude`, `vscode`, `cursor`, `roo` | ninguno: no se escribe archivo MCP | — |

Reglas del contrato:

1. `init`, `install`/`update`, `import` e `import --repair` resuelven el destino desde el mismo descriptor, por host activo (`--agent` / `rc.agent`; default `opencode`).
2. Los hosts sin destino no escriben archivo MCP ni crean `.opencode/opencode.json`, y emiten como máximo un aviso no bloqueante que nombra el host. Nunca abortan. El archivo de tier `.opencode/.ancleto-tier` queda fuera de alcance y se sigue escribiendo como hoy.
3. `install --agent copilot` deja de escribir `.opencode/opencode.json`; escribe sólo `copilot-mcp.json`. `init --agent copilot` hace lo mismo (la rama de copilot se mueve a `setupHostMcp`).
4. `import` e `import --repair` apuntan al destino del host activo y no crean `.opencode` cuando el host activo no es `opencode`. Un destino no parseable se avisa nombrando el archivo y se sobrescribe; nunca aborta.
5. Los merges son no destructivos e idempotentes: sólo agregan nombres ausentes, no borran entradas ni archivos, y dos `import`, dos `install` o un `upgrade` posterior a `install` no cambian el resultado.
6. `check` inspecciona el destino MCP de cada host instalado que declare uno, derivado de la unión de `installedPaths` y no de un único `rc.agent`; un proyecto sólo-`copilot` no se lee como `vscode`. `doctor` valida el archivo del host activo o instalado y conserva el fallback global sólo-opencode. Los hallazgos MCP siguen siendo advisory: el exit de `check` sigue siendo `missing > 0 ? 1 : 0` y el de `doctor` no cambia.
7. La garantía es de alcance de proyecto, host activo y hosts con destino declarado. Quedan excluidos la instalación global sin proyecto, la intención MCP del bundle exportado, el borrado de archivos preexistentes y la verificación independiente del consumo de `copilot-mcp.json` por parte de Copilot.

## Scope

In scope:

- Descriptor único de destino MCP por host en `src/cli/index.js`.
- Consolidación de `setupHostMcp` para `opencode`, `antigravity`, `commandcode` y `copilot`, con no-op y aviso único para `claude`, `vscode`, `cursor` y `roo`.
- Ruteo de `init`, `install`/`update`, `import` e `import --repair` desde ese descriptor.
- Descubrimiento host-aware en `check` y `doctor`, conservando el carácter advisory y los exit codes.
- Ajuste de las specs fuente mediante los deltas de este change y de la suite de tests que hoy fija el comportamiento viejo.

## Non-goals

- No se agrega `.vscode/mcp.json`, `.roo/mcp.json` ni un escritor de `.mcp.json` para `claude`.
- No se modifica `applyTier`, `tierStatePath`, `.opencode/.ancleto-tier`, `COMPRESSION_HOSTS`, la rama opencode de `hostConfigHasCompression`, el filtrado caveman/engram de `buildDefaultMcp`, `exportCmd`, la copia de assets `.opencode/*` de `importCmd`, la semántica de unión de `installedPaths` ni `agent-model-tiers`.
- No se borra ningún archivo MCP preexistente.
- No se hace host-aware el manifiesto de exportación: `export` sigue leyendo sólo `opencode`.
- No se implementa ni verifica el consumo runtime de `copilot-mcp.json` por parte de Copilot.
- No se corrige la colisión de nombre `.mcp.json` entre `commandcode` y `claude`; queda como riesgo residual documentado.

## Decisiones

- **memory_key:** host-mcp-write-routing-deferred
  **Elección:** Este change ejecuta el diferimiento de 0.18.17 y resuelve el ruteo de escritura MCP por host en un change dedicado. Supersede explícitamente la decisión `host-mcp-write-routing-deferred`, que había mandado H3/H4/H6/H10/H11/H12 al backlog.
  **Descartado:** Mantener el diferimiento y seguir aceptando escrituras muertas en `.opencode` para hosts que no lo leen.
  **Justificación:** La evidencia auditada en `src/cli/index.js` muestra que la brecha ya produce archivos muertos y deriva entre `check` y lo que el CLI escribe; el change dedicado es la condición de aceptación que el diferimiento había fijado.
  **Estado:** aprobado
  **Refs:** change:mcp-host-write-routing, path:src/cli/index.js, path:aspec/specs/agent-install-routing/spec.md, spec:agent-install-routing#Configuración MCP específica de host fuera de alcance

- **memory_key:** cli.host-mcp-config-out-of-scope
  **Elección:** Los destinos MCP de host quedan limitados a los cuatro verificados (`opencode`, `antigravity`, `commandcode`, `copilot`) más un conjunto `none` explícito (`claude`, `vscode`, `cursor`, `roo`). Supersede la formulación anterior de "fuera de alcance con excepciones". No es "configurar todos los hosts": es "nunca escribir una config que el host no lee".
  **Descartado:** Mantener el `out of scope` genérico con excepciones ad hoc y un fallback implícito a `.opencode` para todo host no listado.
  **Justificación:** El fallback implícito es justamente la causa de los archivos muertos; una tabla cerrada con `none` explícito hace verificable la garantía y evita que un host nuevo herede `.opencode` por omisión.
  **Estado:** aprobado
  **Refs:** change:mcp-host-write-routing, path:src/cli/index.js, path:aspec/specs/agent-install-routing/spec.md, spec:agent-install-routing#Configuración MCP específica de host fuera de alcance

- **memory_key:** host-mcp-destination-descriptor
  **Elección:** Un único mapa de módulo en `src/cli/index.js` declara destino y esquema por host. Todos los escritores (`setupHostMcp`, reparación de import, refrescos de upgrade) resuelven desde ese mapa; no hay literales de destino por comando.
  **Descartado:** Dejar un `if`/`switch` por comando o mover el mapa a un módulo nuevo.
  **Justificación:** `src/cli/index.js` ya es el dueño de `PROJECT_MCP_CANDIDATES`, `setupHostMcp`, `mergeMcp` y de todos los merges por host; concentrar el descriptor ahí evita una segunda fuente de verdad y no agrega superficie de módulo.
  **Estado:** aprobado
  **Refs:** change:mcp-host-write-routing, path:src/cli/index.js, path:aspec/specs/agent-install-routing/spec.md

- **memory_key:** host-mcp-import-routing
  **Elección:** `import` e `import --repair` resuelven el destino del host activo desde el descriptor. No crean `.opencode` cuando el host activo no es `opencode`; un destino no parseable se avisa nombrando el archivo y se sobrescribe, sin abortar.
  **Descartado:** Mantener `repairProjectMcp` atado a `.opencode` y agregar ramas por host sólo en `install`.
  **Justificación:** La reparación in place es el camino que hoy crea el `.opencode` muerto en `import --repair`; corregir sólo `install` dejaría la brecha principal abierta. El aviso-y-sobrescritura conserva la decisión M2 vigente.
  **Estado:** aprobado
  **Refs:** change:mcp-host-write-routing, path:src/cli/index.js, path:aspec/specs/project-portability/spec.md, spec:project-portability#Import regenera MCP locales, spec:project-portability#Reparación in place sin bundle

- **memory_key:** mcp-oracle-host-aware-advisory
  **Elección:** `check` inspecciona sólo los destinos declarados de los hosts instalados, derivados de la unión de `installedPaths`; `doctor` valida el archivo del host activo o instalado y conserva el fallback global sólo-opencode. Los hallazgos MCP siguen siendo advisory y los exit codes no cambian.
  **Descartado:** Hacer que los hallazgos MCP sean bloqueantes o mantener el descubrimiento fijo de `.opencode` para todos los comandos.
  **Justificación:** El oráculo debe medir el archivo que el CLI realmente escribe para el host; volverlo bloqueante cambiaría un contrato de exit vigente y castigaría configuraciones de usuario que hoy sólo generan aviso.
  **Estado:** aprobado
  **Refs:** change:mcp-host-write-routing, path:src/cli/index.js, path:aspec/specs/cli-diagnostics/spec.md, spec:cli-diagnostics#`doctor` valida la config MCP del proyecto cuando existe, spec:cli-diagnostics#`check` emite avisos advisory de estado MCP

- **memory_key:** host-mcp-write-guarantee-scope
  **Elección:** La garantía se acota a: alcance de proyecto (`--project` o `init` en un proyecto), host activo y hosts con destino declarado. Quedan excluidos la instalación global sin proyecto, la intención MCP del bundle exportado, el borrado de archivos preexistentes y la verificación independiente del consumo de `copilot-mcp.json` por Copilot.
  **Descartado:** Prometer una garantía universal para toda instalación y todo host, incluida la rama global y el bundle.
  **Justificación:** La rama global copia assets de opencode sin `check` y el bundle exporta sólo la intención de opencode; afirmar una garantía ahí sería falso y obligaría a un rediseño de portabilidad fuera de este change.
  **Estado:** aprobado
  **Refs:** change:mcp-host-write-routing, path:src/cli/index.js, path:aspec/specs/project-portability/spec.md, path:aspec/specs/cli-diagnostics/spec.md

- **memory_key:** host-mcp-claude-vscode-cursor-roo-destinations
  **Elección:** No se agrega `.mcp.json` para `claude`, `.vscode/mcp.json` para `vscode` ni `.roo/mcp.json` para `roo`; los cuatro hosts sin destino quedan en `none`.
  **Descartado:** Configurar MCP para `claude`, `vscode` o `roo` como parte de este change.
  **Justificación:** Contradice `claude-support` y la decisión de alcance; además no hay verificación de que esos hosts lean el archivo en el layout que el CLI instala. Escribirlo sería exactamente el tipo de config muerta que este change elimina.
  **Estado:** descartado
  **Refs:** change:mcp-host-write-routing, path:aspec/specs/claude-support/spec.md, spec:claude-support#MCP de host fuera de alcance para `claude`, path:aspec/specs/agent-install-routing/spec.md

- **memory_key:** host-mcp-export-bundle-aware
  **Elección:** `export` sigue leyendo sólo la config MCP de `opencode` y el manifiesto conserva su intención MCP sólo-opencode. Hacer host-aware el bundle queda para un change de portabilidad separado (H10-H12).
  **Descartado:** Extender el manifiesto de exportación a los destinos de todos los hosts dentro de este change.
  **Justificación:** El bundle portable se define por una intención neutral de MCP, no por archivos de host; mezclarlo con el ruteo de escritura ampliaría el alcance y duplicaría la discusión de portabilidad que este change no necesita para corregir la escritura.
  **Estado:** descartado
  **Refs:** change:mcp-host-write-routing, path:src/cli/index.js, path:aspec/specs/project-portability/spec.md, spec:project-portability#Export portable sin rutas absolutas

## Risks

- **Colisión `.mcp.json` entre `commandcode` y `claude`.** El host `commandcode` escribe `.mcp.json`, un nombre que Claude también lee. Es preexistente y no se corrige aquí; el riesgo queda documentado y acotado a proyectos que mezclen ambos hosts.
- **Proyecto mixto con `.opencode` obsoleto.** Un `.opencode` escrito por una versión anterior se conserva y `check` lo sigue validando si `opencode` está en la unión de hosts instalados. No se borra, pero tampoco se refresca desde un host no-opencode.
- **Sobrescritura de un destino no parseable en `import`.** Se conserva la decisión M2: aviso nombrando el archivo y reemplazo. El usuario puede perder el contenido ilegible; el aviso es la única señal y no es bloqueante.
- **Copilot runtime no verificado.** La spec afirma que Copilot consume `copilot-mcp.json`, pero el CLI no lo verifica de forma independiente; el change no agrega esa verificación.
- **Hallazgos MCP no bloqueantes.** Un comando MCP roto no hace fallar CI; el oráculo sigue siendo advisory por contrato.
- **Cambio de comportamiento para hosts no-opencode.** Un proyecto que hoy recibe un `.opencode` muerto dejará de recibirlo. Si algún usuario dependía de ese archivo por accidente, el archivo existente se conserva pero no se regenera.

## Rollback

Revertir el descriptor y el ruteo a los literales previos por host, y restaurar el descubrimiento fijo de `.opencode` en `check`/`doctor`. Los archivos MCP ya escritos no se borran automáticamente: el rollback no es destructivo y deja los artefactos existentes intactos.
