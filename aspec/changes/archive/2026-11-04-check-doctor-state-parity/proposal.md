# Proposal: Paridad de estado entre oráculo y escritores

## Por qué

Los comandos de escritura (`init`, `install`, `update`, `upgrade`, `import`, `export`) y los
diagnósticos de sólo lectura (`check`, `doctor`) no comparten hoy una lectura consistente del estado
que los propios escritores producen. Eso genera tres falsos positivos observables:

- `check` emite `tier "<t>" sin agentes locales donde aplicarlo` en proyectos sanos instalados con
  hosts que no tienen superficie de agentes (`cursor`, `roo`), porque `localAgentDirs(rc)` devuelve
  `[]` y el conteo cae en `0` (`src/cli/index.js` ~3152).
- `check` nunca lee `.ancletorc.version`, aunque `writeManifest` lo escribe en cada escritura
  (`src/cli/index.js` ~135-147). Una instalación desactualizada es indistinguible de una al día.
- `doctor` sólo valida la config MCP global (`globalConfigDir()/opencode.json[c]`,
  `src/cli/index.js` ~4341), de modo que un proyecto con `.opencode/opencode.json` recibe un falso
  `opencode.json no encontrado (config MCP)`.

El change corrige únicamente la capa de diagnóstico. Ningún escritor cambia: la paridad se logra
haciendo que el oráculo evalúe el estado que el escritor ya materializa.

## Qué cambia

1. **H7 — tier huérfano**: `checkTierOrphan` deja de advertir cuando no existe ninguna superficie de
   agentes locales (`localAgentDirs(rc).length === 0`). El tier queda *dormido*, no huérfano. Si hay
   una superficie declarada pero sin archivos `.md`, el aviso se conserva.
2. **H13 — deriva de `.ancletorc.version`**: `check` agrega un aviso advisory no bloqueante cuando
   la versión registrada en `.ancletorc` difiere de la versión del CLI en ejecución. No altera el
   exit code ni repara nada: `upgrade` sigue siendo el único remediador.
3. **H14 — config MCP de `doctor`**: si el proyecto actual tiene `.opencode/opencode.json` o
   `.opencode/opencode.jsonc`, `doctor` valida ese archivo y reporta su ruta relativa; si no existe,
   conserva el fallback a la config global y sus mensajes actuales.

## Alcance

- Sólo `src/cli/index.js`: `checkTierOrphan`, `checkCommand` y `doctorCommand`.
- Sólo `test/cli.test.js`: cobertura de los tres cambios, sus casos borde y la no regresión del
  exit code.
- El contrato de salida de `check` y `doctor` se conserva salvo los avisos y la ruta reportada que se
  describen en `## Contrato`.

## Fuera de alcance

- **H3/H4/H6 — ruteo MCP por host**: exclusión explícita en
  `aspec/specs/agent-install-routing/spec.md` (Requirement "Configuración MCP específica de host
  fuera de alcance") y decisión `cli.host-mcp-config-out-of-scope`. Cambiarlo exige rediseñar qué
  configuración MCP posee cada host, no sólo el diagnóstico.
- **H5 — entrada caveman rota contada como compresión**: contradice la decisión aceptada
  `compression-note-gate` (presencia estado-driven, sin detección de binario en tiempo de escritura).
  Además, la regla de `mcpCommandBroken` por letra de unidad produciría falsos positivos en
  instalaciones Windows sanas.
- **H8 — `upgrade` no aplica tier**: es intencional para preservar la garantía de byte-identidad de
  `agent-model-tiers`; `install`/`update` son los caminos que aplican tier.
- **H9 — `installedPaths` multi-host frente a un único archivo de tier**: exclusión explícita en
  `aspec/specs/agent-install-routing/spec.md` (~227-232). Requiere definir propiedad multi-host del
  archivo de tier, no corregir un diagnóstico.
- **H10/H11/H12 — portabilidad multi-host de `export`/`import`**: requieren un descriptor de host
  nuevo y el layout de `export` está congelado; además arriesgan la guarda de no rutas absolutas.
- **M2 — config MCP no parseable**: carve-out documentado en `project-portability` y
  `compression-note-gate`. No se convierte en error de `doctor` ni de `check`.
- **Otras configuraciones MCP**: `doctor` no valida `.agents/mcp_config.json`, `.mcp.json`,
  `copilot-mcp.json` ni `.vscode/mcp.json`.

## Contrato

### Inputs y outputs

- `ancleto check`: sin argumentos; lee `.ancletorc` de `process.cwd()`. Sin cambios de firma ni de
  archivos leídos, salvo la lectura del campo existente `version`.
- `ancleto doctor`: sin argumentos; resuelve primero la config MCP del proyecto actual y, si no
  existe, la global.

### H7 — `check`, aviso de tier huérfano

- Entrada evaluada: `.opencode/.ancleto-tier` y `localAgentDirs(rc)`.
- Si el archivo de tier no existe → no hay aviso (sin cambios).
- Si el tier leído (trim) no pertenece a `TIERS` → no hay aviso (sin cambios).
- Si `localAgentDirs(rc)` devuelve una lista vacía → no hay aviso. El tier se considera **dormido**.
- Si hay al menos un directorio declarado y la suma de archivos `.md` en los directorios existentes
  es `0` → se emite el aviso existente, sin cambios de texto:
  `tier "<t>" sin agentes locales donde aplicarlo — este proyecto usa los agentes globales. Corre 'ancleto install --project .' para que el tier aplique, o borra .opencode/.ancleto-tier.`
- Exit code de `check`: sin cambios, `missing > 0 ? 1 : 0`. El aviso no suma a `missing` ni a
  `orphans`.

### H13 — `check`, deriva de versión

- Cuando `typeof rc.version === 'string'`, `rc.version.length > 0` y `rc.version !==
  await packageVersion()`, `check` agrega a su lista de warnings, una sola vez por ejecución, la
  entrada (sin glifo):
  `.ancletorc registra v<rcVersion> y el CLI es v<cliVersion>; corré 'ancleto upgrade' para regenerar los artefactos locales`
  emitida por el camino de warnings existente, que la imprime como `  ⚠ <texto>` (una única glifo
  `⚠` por línea).
- No hay aviso cuando `version` está ausente, es `""`, no es string (`null`, número, objeto) o es
  igual a la versión del CLI.
- No cambia el exit code (`missing > 0 ? 1 : 0`), no cambia el conjunto de aceptación del oráculo,
  no escribe archivos y no ejecuta `upgrade`.

### H14 — `doctor`, config MCP

- Precedencia de archivo: `.opencode/opencode.json` del proyecto → `.opencode/opencode.jsonc` del
  proyecto → `globalConfigDir()/opencode.json` → `globalConfigDir()/opencode.jsonc`.
- Si se valida la config del proyecto, el nombre reportado es su ruta relativa con separadores `/`
  (por ejemplo `.opencode/opencode.json`). Si se valida la global, se conserva `basename`.
- Mensajes: `✔ <ruta> valido`, `✖ <ruta> JSON invalido`, y `⚠ opencode.json no encontrado (config MCP)`
  cuando no hay archivo en ninguna de las dos ubicaciones.
- El parseo conserva el comportamiento actual: `JSON.parse` sobre el contenido sin BOM. Un `.jsonc`
  con comentarios sigue reportándose inválido; este change no agrega parseo tolerante.
- Si existe config de proyecto, no se cae al fallback global aunque la de proyecto sea inválida.
- Exit code: fatal sólo por Node < 24 o por fallo al importar `node:sqlite`. Config inválida o
  ausente no altera el exit code.

### Lo que NO cambia

- Todos los escritores: `init`, `install`, `update`, `upgrade`, `import`, `export` y sus archivos de
  salida, incluido `.opencode/.ancleto-tier`.
- El ruteo MCP por host y la propiedad de la config MCP.
- La resolución de modelos y tiers (`TIERS`, `TIER_CHAINS`, `applyTier`).
- El layout de `export`/`import` y la guarda de no rutas absolutas.
- La semántica de exit de `check` (`missing > 0 ? 1 : 0`) y de `doctor` (fatal sólo Node/SQLite).

## Riesgos

- **Sobre-supresión en H7**: un proyecto con tier y sin superficie declarada pasa a ser silencioso.
  Es el comportamiento buscado (dormido), pero un manifiesto incompleto que omita `installedPaths.agents`
  y tenga un `agent` sin `AGENT_TARGETS.agents` ya no producirá el aviso.
- **No regresión del test existente**: `test/cli.test.js:2179` borra `.opencode/agents` y vacía
  `installedPaths.agents` esperando el aviso; sigue funcionando porque `localAgentDirs` deriva
  `.opencode/agents` de `AGENT_TARGETS[rc.agent]` cuando `rc.agent = opencode`.
- **H13 comparación literal**: una diferencia de sólo build metadata o pre-release produce el aviso.
  Es advisory y no altera el exit code, por lo que el costo es informativo.
- **H14 `.jsonc`**: el parseo estricto actual puede reportar inválido un archivo con comentarios;
  el change conserva ese comportamiento a propósito para no ampliar alcance.
- **Rutas en Windows**: la ruta de proyecto se normaliza a `/` para que el mensaje sea estable y
  testeable; la ruta global mantiene `basename`.

## Decisiones

- **memory_key:** oracle-tier-orphan-requires-agent-surface
  **Elección:** El aviso de tier huérfano sólo se emite si existe al menos una superficie de agentes
  locales declarada; sin superficie, el tier está dormido y no se advierte.
  **Descartado:** Seguir advirtiendo con `count === 0` y filtrar por nombre de host (`cursor`, `roo`)
  en una lista hardcodeada.
  **Justificación:** `localAgentDirs(rc)` ya es el dueño de "qué superficie de agentes declara el
  proyecto"; filtrar por host duplicaría esa regla y volvería a divergir cuando se agregue un host
  sin agentes. La condición sobre la superficie es la invariante real y no requiere tocar escritores.
  **Refs:** path:src/cli/index.js, path:aspec/specs/agent-model-tiers/spec.md,
  path:aspec/specs/antigravity-support/spec.md, path:test/cli.test.js,
  change:check-doctor-state-parity
  **Estado:** aprobado

- **memory_key:** oracle-version-drift-advisory-readonly
  **Elección:** `check` reporta la deriva entre `.ancletorc.version` y la versión del CLI como aviso
  advisory, sin cambiar el exit code y sin reparar; `upgrade` es el único remediador.
  **Descartado:** Hacer que `check` ejecute o sugiera una reparación automática, o convertir la
  deriva en un faltante que cambie el exit code.
  **Justificación:** `check` es un oráculo de sólo lectura y su contrato de exit ya está definido por
  faltantes. La versión del manifiesto es información que el escritor ya persiste; exponerla como
  aviso conserva la separación escritor/oráculo y evita romper CI que depende del exit actual.
  **Refs:** path:src/cli/index.js, path:aspec/specs/cli-diagnostics/spec.md, path:test/cli.test.js, change:check-doctor-state-parity
  **Estado:** aprobado

- **memory_key:** doctor-prefers-project-mcp-config
  **Elección:** `doctor` valida la config MCP del proyecto (`.opencode/opencode.json` o `.jsonc`)
  cuando existe y sólo cae a la global cuando no existe; reporta la ruta validada.
  **Descartado:** Validar ambas configuraciones y reportar dos resultados, o mantener sólo la global
  y agregar un segundo aviso "config de proyecto ignorada".
  **Justificación:** El proyecto es el ámbito donde `install`/`init` escriben la config MCP de
  `opencode`; validar la global primero mide un archivo que puede no ser el efectivo. Un único
  archivo validado mantiene el reporte de `doctor` legible y su contrato de exit intacto.
  **Refs:** path:src/cli/index.js, path:aspec/specs/agent-install-routing/spec.md,
  path:aspec/specs/project-portability/spec.md, path:test/cli.test.js,
  change:check-doctor-state-parity
  **Estado:** aprobado

- **memory_key:** deferred-write-vs-validate-backlog
  **Elección:** Diferir H3/H4/H6 (ruteo MCP por host), H5 (caveman), H8 (tier en `upgrade`), H9
  (`installedPaths` multi-host), H10/H11/H12 (portabilidad multi-host) y M2 (config no parseable).
  **Descartado:** Incluirlos en este change como correcciones de escritura o de validación.
  **Justificación:** Cada uno cambia propiedad de estado o contratos congelados (config MCP por host,
  byte-identidad de `upgrade`, layout de `export`, carve-out de config no parseable) y excede la
  paridad de diagnóstico. Mezclarlos impediría garantizar que ningún escritor cambia.
  **Refs:** path:aspec/specs/agent-install-routing/spec.md,
  path:aspec/specs/agent-model-tiers/spec.md, path:aspec/specs/project-portability/spec.md,
  path:src/cli/index.js, change:check-doctor-state-parity
  **Estado:** descartado
