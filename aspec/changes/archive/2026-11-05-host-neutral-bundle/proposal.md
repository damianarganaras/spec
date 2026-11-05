# Proposal: Bundle host-neutral para la intención MCP

## Problem

El bundle portable `ancleto-export/1` no es neutral respecto del host en dos comportamientos observables:

1. `export` lee la intención MCP únicamente de `readProjectMcp` (`.opencode/opencode.json|jsonc`, `src/cli/index.js:4206-4222`, consumido en `:4278`). Un proyecto cuyo host activo es `copilot`, `antigravity` o `commandcode` exporta una intención que no corresponde a la configuración MCP real de su host.
2. `import` copia `.opencode/{agents,commands,skills}` del bundle de forma incondicional (`src/cli/index.js:4436-4440`) y registra esas rutas en `.ancletorc.installedPaths` sin mirar el host activo (`:4475-4481`). En un host distinto de `opencode`, eso crea y registra un `.opencode` fantasma; `installedHostsFromPaths` (`:1314-1324`) deriva entonces un host `opencode` que nunca fue instalado.

El descriptor único de destino MCP por host ya existe: `HOST_MCP_TARGETS` (`src/cli/index.js:909-918`), `resolveHostMcpDestination` (`:942-946`) y `HOST_MCP_ORDER` (`:921`). La brecha es de consumo, no de modelo de destinos.

Las specs congelan el comportamiento viejo: `aspec/specs/project-portability/spec.md:23,76-80,104-112,171`, `aspec/specs/agent-install-routing/spec.md:198,256-260` y `aspec/specs/cli-diagnostics/spec.md:295,306-310,324-328`. En particular, `cli-diagnostics:295` ya exige que `export` resuelva desde el dueño único, mientras `306`/`308`/`324-328` lo contradicen con una excepción sólo-opencode. Este change completa la regla de `:295` y elimina la excepción.

## Proposed change

Hacer que el bundle sea neutral respecto del host en la intención MCP de `export` y en la copia/registro de assets de `import`, sin cambiar el formato `ancleto-export/1` ni el payload de assets `.opencode/*`.

Contrato de `ancleto export`:

- Resolver el host activo desde `.ancletorc.agent` cuando sea un host soportado; si no, `opencode` por defecto.
- Resolver el destino por el descriptor único. Si el host declara destino, leer `cfg[schema]` de ese archivo y construir `manifest.mcp = [{ name, type: def?.type || 'local', enabled: def?.enabled !== false }]`.
- Si el archivo de destino no existe: `manifest.mcp = []`, sin aviso.
- Si el archivo de destino existe y no es JSON válido: `manifest.mcp = []` y un único aviso no bloqueante a stderr que nombra la ruta relativa del proyecto, con el texto `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`; exit code 0.
- Si el host no declara destino (`claude`, `vscode`, `cursor`, `roo`): conservar la lectura legacy de `.opencode/opencode.json|jsonc`, con el mismo aviso si ese archivo existe y no parsea.
- No cambiar la forma del manifiesto, el guard de rutas absolutas, el payload de assets ni la mecánica de `--tar`.

Contrato de `ancleto import <bundle>`:

- Resolución del host activo sin cambios: `.ancletorc.agent` del bundle → `.ancletorc.agent` existente → default.
- Si el host activo es `opencode`: copiar `.opencode/{agents,commands,skills}` del bundle y registrar `.opencode/<dir>` en `installedPaths` como hoy.
- Si el host activo no es `opencode`: no copiar ni registrar `.opencode/<asset>`; los assets se materializan sólo por `installAgentAssets` para el host activo.
- `installedPaths` = unión(rutas existentes del destino, templates escritos, directorios de assets escritos). Nunca heredar `installedPaths` del bundle. No se borran rutas previas.
- Tier, estado de tier, reparación MCP, códigos de salida y mensajes existentes no cambian.

Garantía acotada: el change garantiza intención MCP correcta por host en `export` y copia/registro de assets acotados al host activo en `import`, preservando la semántica de unión de `installedPaths` y los exit codes. Excluye explícitamente los ítems de "Out of scope".

El cambio no promete "sin cambios de escritores": `import` sí cambia qué assets copia y registra. Lo que no cambia es el escritor MCP (`repairProjectMcp` y el descriptor), la resolución del host activo y el contrato de los demás comandos.

## Scope

In scope:

- `export`: fuente de la intención MCP por host + aviso no bloqueante por destino no parseable.
- `import`: copia y registro de `.opencode/{agents,commands,skills}` condicionados al host activo.
- Deltas de `project-portability`, `agent-install-routing` y `cli-diagnostics`.
- Observabilidad: un aviso nuevo en `export`; ningún otro mensaje ni exit code cambia.

Out of scope (exclusiones explícitas, no se implementan):

- La colisión de `.mcp.json` entre `commandcode` y `claude` (tema separado).
- La idempotencia del refresco de `opencode`/`antigravity` en `upgrade` (tema separado).
- El consumo runtime de `copilot-mcp.json` por parte de Copilot (no verificable offline; limitación declarada).
- La propiedad y asimetría del estado de tier (sin cambios).
- La portabilidad de assets custom más allá de los assets canónicos (se regeneran).
- El escaneo de secretos o rutas absolutas del contenido del bundle más allá del manifiesto.
- `repairProjectMcp` reescribiendo bytes cuando `fixed` está vacío (bug separado).
- La instalación global sin proyecto.

## Non-goals

- No cambiar `EXPORT_FORMAT`, el layout del bundle ni el payload `.opencode/*`.
- No cambiar `HOST_MCP_TARGETS`, `resolveHostMcpDestination`, `HOST_MCP_ORDER`, `repairProjectMcp` ni la garantía de escritura MCP.
- No cambiar `init`, `install`, `update`, `upgrade`, `check`, `doctor`, `mcp`, `memory`, `specs`, `stats`, `projects` ni `import --repair`.
- No agregar tareas de tests ni de release en este change: los tests son de `@tester` y el bump a `0.20.0` es una fase separada.

## Decisiones

- **memory_key:** bundle-mcp-intent-host-aware
  **Elección:** `export` lee la intención MCP del destino que el descriptor único declare para el host activo; para `claude`, `vscode`, `cursor` y `roo` conserva la lectura legacy de `.opencode`. Un destino inexistente produce intención vacía sin aviso; un destino no parseable produce intención vacía, un aviso no bloqueante que nombra la ruta relativa y exit 0.
  **Descartado:** Mantener la lectura sólo de `.opencode/opencode.json|jsonc` para todo host y agregar una excepción por host en `export`.
  **Justificación:** El descriptor único ya es dueño del destino y del esquema de cada host; consumirlo en `export` elimina una segunda fuente de verdad y cumple la regla ya escrita en `cli-diagnostics` sin ampliar el alcance del escritor MCP.
  **Refs:** path:src/cli/index.js, path:aspec/specs/project-portability/spec.md, path:aspec/specs/cli-diagnostics/spec.md, change:host-neutral-bundle
  **Estado:** aprobado

- **memory_key:** bundle-asset-copy-host-scoped
  **Elección:** `import` copia y registra `.opencode/{agents,commands,skills}` sólo cuando el host activo es `opencode`; para el resto de los hosts no copia ni registra esos directorios y deja los assets en `installAgentAssets`. `installedPaths` conserva la semántica de unión y no hereda rutas del bundle.
  **Descartado:** Seguir copiando y registrando `.opencode/*` en todo import y corregir sólo la derivación de hosts en `installedHostsFromPaths`.
  **Justificación:** Corregir la derivación después de escribir dejaría el `.opencode` fantasma en disco; condicionar la copia y el registro ataca la causa y mantiene el contrato de `installedPaths` como unión de lo realmente escrito.
  **Refs:** path:src/cli/index.js, path:aspec/specs/project-portability/spec.md, path:aspec/specs/agent-install-routing/spec.md, change:host-neutral-bundle
  **Estado:** aprobado

- **memory_key:** bundle-layout-remains-v1
  **Elección:** El bundle conserva `ancleto-export/1`, la forma del manifiesto y el payload `.opencode/*`; el cambio es de lectura en `export` y de alcance de copia/registro en `import`. Los bundles legacy siguen siendo legibles.
  **Descartado:** Introducir `ancleto-export/2` o migrar el layout del bundle para distinguir la intención host-aware.
  **Justificación:** La intención MCP ya se expresa por nombre y tipo, independientemente del archivo de origen; un bump de formato obligaría a migración y no aporta información nueva al import.
  **Refs:** path:src/cli/index.js, path:aspec/specs/project-portability/spec.md, change:host-neutral-bundle
  **Estado:** aprobado

- **memory_key:** bundle-tier-state-unchanged
  **Elección:** No se toca la resolución de tier ni el estado `.opencode/.ancleto-tier`; el tier sigue aplicándose sólo a `opencode` y su archivo se escribe sólo cuando el tier aplica.
  **Descartado:** Hacer host-neutral el estado de tier o moverlo fuera de `.opencode` dentro de este change.
  **Justificación:** El contrato de tier está congelado en `agent-model-tiers` y no participa de la neutralidad del bundle; modificarlo ampliaría el alcance y el riesgo sin evidencia de un defecto de portabilidad.
  **Refs:** path:aspec/specs/agent-model-tiers/spec.md, path:src/cli/index.js, change:host-neutral-bundle
  **Estado:** descartado

- **memory_key:** mcp-json-collision-deferred
  **Elección:** La colisión de `.mcp.json` entre `commandcode` y `claude` queda fuera de este change y se trata como tema separado.
  **Descartado:** Resolver la colisión de `.mcp.json` dentro del change de bundle.
  **Justificación:** Requiere definir un contrato de runtime que no se puede verificar offline y no es necesario para la intención MCP ni para la copia de assets; mezclarlo introduciría una decisión de host no validada.
  **Refs:** path:aspec/specs/commandcode-support/spec.md, path:aspec/specs/claude-support/spec.md, change:host-neutral-bundle
  **Estado:** descartado

- **memory_key:** upgrade-refresh-idempotency-deferred
  **Elección:** La idempotencia del refresco de `opencode`/`antigravity` durante `upgrade` queda fuera de este change.
  **Descartado:** Corregir el refresco de assets de `upgrade` como parte de la neutralidad del bundle.
  **Justificación:** Es un problema de idempotencia de `upgrade`, no de portabilidad del bundle; el contrato de `upgrade` no cambia en este change.
  **Refs:** path:src/cli/index.js, change:host-neutral-bundle
  **Estado:** descartado

- **memory_key:** copilot-mcp-runtime-unverifiable
  **Elección:** Se declara como limitación que el consumo runtime de `copilot-mcp.json` por parte de Copilot no se verifica offline y no se implementa en este change.
  **Descartado:** Afirmar o verificar en este change que Copilot consume `copilot-mcp.json` en el layout instalado.
  **Justificación:** No hay una verificación offline reproducible; prometerlo convertiría una limitación conocida en una garantía no sostenida.
  **Refs:** path:src/cli/index.js, path:aspec/specs/copilot-support/spec.md, change:host-neutral-bundle
  **Estado:** descartado

## Risks

- **Cambio observable en import para hosts no-opencode.** Un proyecto que antes recibía `.opencode/*` deja de recibirlo. Si dependía de ese archivo por accidente, el archivo preexistente se conserva pero no se regenera.
- **Bundles legacy exportados desde hosts no-opencode.** Contienen intención vacía o de `opencode`; siguen siendo legibles y su import no cambia de formato, pero la intención no se corrige retroactivamente.
- **Aviso nuevo en stderr.** Un destino no parseable ahora produce un aviso en `export`; no bloquea ni cambia el exit code, pero puede aparecer en CI.
- **Proyecto mixto.** Si el `.ancletorc` ya declaraba `.opencode/*`, `installedHostsFromPaths` sigue derivando `opencode`; el change no borra rutas previas ni repara manifiestos históricos.

## Rollback

Revertir el consumo del descriptor en `export` a `readProjectMcp` y restaurar la copia/registro incondicional de `.opencode/*` en `import`. Los archivos `.opencode/*` ya escritos no se borran automáticamente: el rollback no es destructivo y deja los artefactos existentes intactos.
