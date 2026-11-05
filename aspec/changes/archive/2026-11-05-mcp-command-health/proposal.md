# Proposal: salud de comandos MCP y visibilidad desde el oráculo

## Por qué

El predicado que decide si una entrada MCP está rota es incorrecto en Windows y el oráculo de sólo
lectura no puede ver el estado MCP que los escritores producen. Ambas cosas están reproducidas:

- `mcpCommandBroken(entry)` (`src/cli/index.js:819-827`) hace
  `if (/^[A-Za-z]:[\\/]/.test(bin)) return true` **antes** de evaluar `isAbsolute`/`existsSync`: toda
  ruta absoluta con letra de unidad se declara rota por su forma. Reproducido en un directorio
  temporal: `import --repair` reescribió una entrada **sana**
  (`[C:\nvm4w\nodejs\node.exe, ...]`) y el sha256 del archivo cambió. `buildDefaultMcp`
  (`src/cli/index.js:547-548`, aplicado en `:555`) produce `[process.execPath, ...]`, que en Windows
  es exactamente una ruta con letra de unidad: el propio default queda "roto" apenas se escribe. El
  mismo predicado gobierna `refreshCopilotMcp` (~`:915`), `refreshCommandCodeMcp` (~`:948`) y
  `repairProjectMcp` (~`:4105`).
- `hostConfigHasCompression` (`src/cli/index.js:1056-1071`) devuelve `true` por la mera presencia de
  `servers.caveman` en `cfg.mcp || cfg.mcpServers` y nunca consulta `mcpCommandBroken`: una entrada
  `caveman` presente pero rota cuenta como compresión disponible (H5).
- `readProjectMcp` (`src/cli/index.js:4084-4096`) descarta el error de parseo y devuelve
  `{file, cfg:{}}`; `repairProjectMcp` (`:4100-4121`) escribe entonces `{}` sobre un archivo no
  parseable, sin aviso (M2, reproducido). El daño no se anuncia.
- `doctorCommand` (`src/cli/index.js:4373-4403`) reimplementa el mismo bucle de descubrimiento
  `.opencode/opencode.json|jsonc` más el fallback global (H14): la regla de descubrimiento tiene dos
  dueños (N1).
- `checkCommand` (`src/cli/index.js:2982-3005`) imprime su arreglo `warnings` como `  ⚠ ...` y su
  exit es `missing > 0 ? 1 : 0`; hoy no inspecciona MCP en absoluto, así que un `opencode.json`
  ilegible o con binarios inexistentes es invisible para el oráculo.

En este repositorio **no existe** un parser de JSONC: la lectura es `JSON.parse` sobre el contenido
sin BOM (`src/cli/index.js:4089`, `:4398`). El change conserva esa lectura y no inventa tolerancia de
comentarios; un `.jsonc` con comentarios sigue siendo "no parseable" y ahora se reporta como tal.

## Qué cambia

1. **Predicado correcto (M1).** Una entrada MCP está rota sólo cuando `command` no es un arreglo no
   vacío, su primer elemento no es un string no vacío, o ese elemento es una ruta absoluta de la
   plataforma actual que no existe. Un comando simple se presume sano; una ruta absoluta existente
   —incluida `C:\...`/`c:/...` en Windows— es sana.
2. **Avisos advisory en `check`.** Sobre la config MCP del proyecto: si existe y no parsea, un aviso
   que nombra el archivo; si parsea, un aviso por entrada con comando roto (incluida `caveman`). Sin
   config o con todo sano, ningún aviso. Exit y escritura intactos.
3. **Aviso en `import` (M2).** Cuando la config MCP del proyecto no parsea, `import` (incluido
   `--repair`) avisa nombrando el archivo antes de reemplazarla. La decisión de sobrescribir no
   cambia.
4. **Un único dueño del conjunto de candidatos (N1).** Una constante de módulo es dueña del par de
   nombres `.opencode/opencode.json` y `.opencode/opencode.jsonc`; la regla de lectura (primer
   existente) la comparten `readProjectMcp`, `doctorCommand` y la inspección de `check`. Los demás
   consumidores conservan sus semánticas de selección: la combinación de MCP recolecta todos los
   existentes y la detección de compresión prueba todos los candidatos. La salida de `doctor`
   —incluido su fallback global— no cambia para ningún estado existente.

## Alcance

- `src/cli/index.js`: `mcpCommandBroken`, el descubrimiento/lectura de la config MCP de proyecto, el
  arreglo `warnings` de `checkCommand`, el aviso de `repairProjectMcp` y el uso del helper compartido
  en `doctorCommand`.
- `test/cli.test.js`: cobertura de los cuatro cambios, de los casos borde del predicado y de la no
  regresión de exit, salida de `doctor` y ausencia de escrituras de `check`.
- Garantía **acotada** a la **config MCP de proyecto** (`.opencode/opencode.json|jsonc`): `check` y
  `doctor` exponen esos estados —config no parseable y entradas con comando roto—, sin cambiar exit
  codes. **No** cubre las configs MCP de otros hosts (`copilot-mcp.json`, `.mcp.json`,
  `.agents/mcp_config.json`) ni la config global, que quedan fuera de alcance. **No** se afirma que
  ningún escritor cambie: el arreglo del predicado sí cambia, por diseño, qué reescriben
  `import`/`refresh*` en Windows (deja de reescribir entradas sanas).

## Fuera de alcance

- **H3/H4/H6 — ruteo de escritura MCP por host** (`import` escribe incondicionalmente `opencode`,
  `init --agent copilot` cae a `.opencode`, escrituras de claude/vscode/cursor/roo aterrizan en
  `.opencode`, import de `.opencode/*` en hosts no-opencode). Motivo: es ruteo de escritores y el MCP
  de host está declarado fuera de alcance en `agent-install-routing`; el riesgo de regresión mixta es
  MAJOR y excede el diagnóstico.
- **H11/H12 — portabilidad de `export`/`import` para assets nativos y MCP por host.** Motivo: el
  layout de `export` está congelado y haría falta un descriptor de host nuevo.
- **H8 — `upgrade` no aplica tier.** Motivo: byte-identidad intencional, ya documentada en
  `agent-model-tiers`.
- **H9/N2 — propiedad del tier con múltiples directorios de host.** Motivo: exclusión ya documentada
  en `agent-install-routing` (H9).
- **Semántica de `hostConfigHasCompression`.** Motivo: cambiarla movería la compuerta de escritura de
  la nota de compresión; aquí sólo se corrige el predicado y se agrega el aviso. `caveman` presente
  pero roto sigue contando como presente para esa compuerta.
- **Nuevos formatos de config MCP de host** (`.vscode/mcp.json`, `.roo/mcp.json`, `.mcp.json` de
  claude). Motivo: no hay lector ni contrato verificado para esos archivos; agregarlos es alcance de
  ruteo, no de diagnóstico.
- **Parseo tolerante de JSONC.** Motivo: no existe hoy en el repositorio y este change no lo
  introduce.

## Contrato

### Predicado

- Entrada rota si `command` no es arreglo, está vacío, o `command[0]` no es string no vacío.
- Entrada rota si `command[0]` es ruta absoluta de la plataforma actual y `existsSync` es falso.
- Entrada sana si `command[0]` es un comando simple (sin ruta absoluta): se presume resuelto por PATH.
- Entrada sana si `command[0]` es ruta absoluta existente, incluidas las rutas Windows con letra de
  unidad (`C:\nvm4w\nodejs\node.exe`, `c:/...`).
- La forma con letra de unidad se evalúa como ruta absoluta sólo cuando la plataforma actual la trata
  como tal; en las demás plataformas cae en la regla de comando simple.
- No se ejecuta el comando ni se resuelve PATH para decidir la salud.

### `check`

- Lee sólo la config MCP **del proyecto**, con la regla de descubrimiento compartida.
- No existe → sin avisos.
- Existe y no parsea → un aviso con el texto
  `<ruta> no es JSON valido; no se inspeccionaron las entradas MCP`
  (ruta relativa con `/`, por ejemplo `.opencode/opencode.json`).
- Parseable → un aviso por entrada con comando roto, con el texto
  `MCP '<nombre>' tiene un comando roto (<detalle>)`, donde `<detalle>` es el primer elemento sólo
  cuando `command` es un arreglo y ese elemento es un string no vacío; en cualquier otra forma
  (string, arreglo vacío, primer elemento no string o `command` ausente) es `command ausente`.
- Si `mcp` no es un objeto plano (string, arreglo, número o `null`), no hay avisos de estado MCP y no
  se reporta como error de parseo.
- Todos los avisos suman al arreglo `warnings` existente y se imprimen como `  ⚠ <texto>`.
- Exit sin cambios (`missing > 0 ? 1 : 0`); no suma a `missing` ni a `orphans`; no escribe archivos.
- `caveman` presente pero roto produce su aviso y **no** altera `hostConfigHasCompression`.

### `import`

- Si la config resuelta existe y no parsea, antes de reemplazarla se emite a stderr
  `ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP nueva`.
- La decisión de reemplazar no cambia; el exit code de `import` no cambia por este aviso.
- El aviso vive en el paso de reparación, por lo que aplica a `import --repair` y a `import <bundle>`.

### `doctor`

- Misma precedencia de archivo, mismos textos (`✔ <ruta> valido`, `✖ <ruta> JSON invalido`,
  `⚠ opencode.json no encontrado (config MCP)`), mismo exit (fatal sólo por Node < 24 o `node:sqlite`).
- La config de proyecto se resuelve con la regla compartida; el fallback global se conserva.

## Riesgos

- **Tests existentes con rutas Windows fijas.** `test/cli.test.js:1249-1252` y `:1273-1275` usan
  `C:\Program Files\nodejs\node.exe` y `C:\viejo\node.exe` como entradas "rotas". Con el predicado
  corregido, en una máquina Windows donde `C:\Program Files\nodejs\node.exe` exista la entrada es sana
  y el caso falla. Hay que derivar la ruta inexistente de `tmpdir()` para que sea absoluta y ausente
  en ambas plataformas.
- **Cambio de comportamiento de escritores en Windows.** `import --repair` y los `refresh*` dejan de
  reescribir entradas sanas: es el objetivo, pero un proyecto que dependía del rewrite ciego para
  "normalizar" el binario ya no lo obtiene. El aviso de M2 es la única señal nueva.
- **`doctor` con JSONC comentado.** Sigue reportando `JSON invalido` a propósito; el change no agrega
  tolerancia.
- **`caveman` presente pero roto.** El aviso puede aparecer en proyectos donde la compuerta de la nota
  sigue diciendo "hay compresión". Es intencional y está documentado como exclusión.
- **Ruido del aviso en MCP de terceros.** Un binario de un servidor de usuario que no exista en esta
  máquina produce un aviso por entrada; es advisory y no altera el exit.

## Decisiones

- **memory_key:** mcp-command-broken-requires-missing-absolute-path
  **Elección:** Una entrada MCP está rota sólo cuando su comando es inválido o su primer elemento es
  una ruta absoluta de la plataforma actual que no existe; una ruta absoluta existente (incluida una
  ruta Windows con letra de unidad) y un comando simple se consideran sanos.
  **Descartado:** Conservar la detección por forma de letra de unidad y excluir sólo algunas rutas
  conocidas (`process.execPath`, `C:\Program Files\...`).
  **Justificación:** La condición real es la existencia del binario, no la forma de la ruta; cualquier
  lista de excepciones vuelve a declarar rota una instalación sana apenas cambie el prefijo. El
  predicado por existencia es el mismo que ya usan las rutas POSIX y no requiere ejecutar el comando.
  **Refs:** path:src/cli/index.js, path:test/cli.test.js, change:mcp-command-health
  **Estado:** aprobado

- **memory_key:** mcp-health-advisory-non-blocking-in-check
  **Elección:** `check` reporta la config MCP no parseable y las entradas con comando roto como avisos
  dentro del arreglo `warnings` existente, sin cambiar el exit code ni escribir archivos.
  **Descartado:** Convertir una config MCP ilegible o una entrada rota en faltante (`✖`) con exit 1, o
  reparar automáticamente desde `check`.
  **Justificación:** `check` es un oráculo de sólo lectura y su exit ya está definido por faltantes de
  assets; hacerlo fallar por estado MCP rompe CI que hoy pasa con proyectos sanos. El aviso expone el
  estado sin mover la frontera escritor/oráculo.
  **Refs:** path:src/cli/index.js, path:aspec/specs/cli-diagnostics/spec.md, path:test/cli.test.js,
  change:mcp-command-health
  **Estado:** aprobado

- **memory_key:** project-mcp-single-discovery-owner
  **Elección:** Una constante de módulo posee el par de nombres candidatos de la config MCP del
  proyecto (`.opencode/opencode.json` y `.opencode/opencode.jsonc`); la regla de lectura del primer
  existente la comparten `readProjectMcp`/`doctorCommand`/`check`, mientras la combinación de MCP
  (todos los existentes) y la detección de compresión (prueba de todos) conservan sus semánticas de
  selección.
  **Descartado:** Mantener el bucle duplicado en `doctor` y agregar un tercer bucle en `check`.
  **Justificación:** Hoy hay dos copias de los nombres candidatos y una tercera la volvería a
  duplicar; el conjunto de nombres es una sola regla y debe tener un solo dueño. Unificar también las
  semánticas de selección cambiaría el contrato de merge y de detección de compresión, por lo que el
  dueño es el conjunto, no la selección. `doctor` conserva el fallback y los textos porque ya son
  contrato en `cli-diagnostics`.
  **Refs:** path:src/cli/index.js, path:aspec/specs/cli-diagnostics/spec.md, path:test/cli.test.js,
  change:mcp-command-health
  **Estado:** aprobado

- **memory_key:** m2-nonparseable-config-warn-only
  **Elección:** Ante una config MCP de proyecto no parseable, `import` avisa nombrando el archivo y la
  reemplaza igual que hoy.
  **Descartado:** Abortar el `import` o preservar el archivo ilegible sin escribir el MCP nuevo.
  **Justificación:** El carve-out de M2 ya define que `import <bundle>` sobrescribe la config no
  parseable y que la nota de compresión se materializa por la escritura pendiente; cambiar la decisión
  de escritura contradiría `agent-install-routing`. El aviso cierra la pérdida silenciosa sin mover el
  contrato.
  **Refs:** path:src/cli/index.js, path:aspec/specs/agent-install-routing/spec.md,
  path:test/cli.test.js, change:mcp-command-health
  **Estado:** aprobado

- **memory_key:** host-mcp-write-routing-out-of-scope
  **Elección:** Mantener fuera de alcance el ruteo de escritura MCP por host (H3/H4/H6) y cualquier
  formato de config MCP de host nuevo.
  **Descartado:** Corregir en este change a qué host escribe cada entrada MCP y agregar lectores para
  `.vscode/mcp.json`, `.roo/mcp.json` o `.mcp.json` de claude.
  **Justificación:** El MCP específico de host está excluido explícitamente en
  `agent-install-routing`; cambiarlo exige rediseñar la propiedad de la config y arriesga una
  regresión mixta MAJOR, mientras que este change sólo corrige el predicado y la lectura.
  **Refs:** path:aspec/specs/agent-install-routing/spec.md, path:src/cli/index.js,
  change:mcp-command-health
  **Estado:** descartado

- **memory_key:** export-import-native-host-portability-out-of-scope
  **Elección:** Mantener fuera de alcance la portabilidad de `export`/`import` para assets nativos y
  MCP por host (H11/H12).
  **Descartado:** Incluir un descriptor de host y un layout de export nuevo en este change.
  **Justificación:** El layout de `export` está congelado y la portabilidad requiere un contrato de
  host que no existe; mezclarlo impide garantizar que el change se limite a diagnóstico y predicado.
  **Refs:** path:aspec/specs/project-portability/spec.md, path:src/cli/index.js,
  change:mcp-command-health
  **Estado:** descartado

- **memory_key:** tier-ownership-and-upgrade-byte-identity-out-of-scope
  **Elección:** Mantener fuera de alcance H8 (`upgrade` no aplica tier) y H9/N2 (propiedad del tier
  con múltiples directorios de host).
  **Descartado:** Hacer que `upgrade` aplique el tier o derivar un dueño multi-host del archivo de
  tier.
  **Justificación:** La byte-identidad de `upgrade` y la exclusión multi-host del tier ya están
  documentadas en `agent-model-tiers` y `agent-install-routing`; tocarlas excede la salud de comandos
  MCP y rompe garantías vigentes.
  **Refs:** path:aspec/specs/agent-model-tiers/spec.md, path:aspec/specs/agent-install-routing/spec.md,
  path:src/cli/index.js, change:mcp-command-health
  **Estado:** descartado
