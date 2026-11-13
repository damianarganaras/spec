---
node: integrations
kind: integrations
read_when: "sistemas externos y dependencias privadas observables"
generatedAt: 2026-11-13T02:37:23Z
pluginVersion: 0.31.0
skillVersion: '2.3'
---

# Integraciones

## Resumen

| Integración | Tipo | Dirección | Evidencia |
|---|---|---|---|
| npm registry | Publicación del paquete `@ancleto/spec` | Salida | `.github/workflows/publish.yml`, `package.json` |
| GitHub Actions | CI de lint/tests y release | Salida | `.github/workflows/publish.yml` |
| GitHub Releases | Notas del release por tag | Salida | `.github/workflows/publish.yml` |
| Repomix | Empaquetado de contexto para discovery | Salida | `src/cli/index.js` → `runRepomix` |
| opencode | Host del IDE; base de sesiones para `stats`; destino MCP con `mcp`; `opencode models` solo en mantenimiento | Entrada | `src/cli/index.js` → `opencodeDbPath`, `doctorCommand`, `checkCommand`, `HOST_MCP_TARGETS`, `scripts/refresh-model-catalog.mjs` |
| MCP por host | Destinos de `opencode`, `antigravity`, `commandcode` y `copilot`; `check`/`doctor` host-aware | Entrada/salida | `src/cli/index.js` → `HOST_MCP_TARGETS`, `setupHostMcp`, `readHostMcpIntent` |
| MCP del proyecto | Archivos por host (`.opencode/opencode.json` o `.jsonc`, `.agents/mcp_config.json`, `.mcp.json`, `copilot-mcp.json`); salud de comandos y avisos read-only | Entrada | `src/cli/index.js` → `resolveHostMcpDestination`, `mcpCommandBroken` |
| MCP de memoria (`ancleto-memory`) | Tools `searchMemory`, `recordRule`, `recordDecision` | Salida/entrada | `src/core/memory/mcp-server.js` |
| MCP caveman | Compresión de contexto en hosts que la exponen | Salida | `src/cli/index.js` → `resolvesHostCompression` |
| MCP engram | Memoria de sesión opcional (opt-in) | Salida | `src/cli/index.js` → `buildDefaultMcp` |
| MCP Azure DevOps | Work Items opcional; deshabilitado en este repo | Salida | `PRODUCT.md` |
| git | EOL, exclusión local de `machine-env`, release notes | Entrada | `src/core/machine-env.js`, workflow |
| SQLite/FTS5 (`node:sqlite`) | Persistencia y búsqueda de memoria | Interna | `src/core/memory/*` |

## npm y CI

- El workflow `Publish` se dispara con tags `v*` o manualmente. Corre `npm ci`, `npm run lint`
  (`eslint src/ test/ scripts/`), `node --test test/*.test.js` y publica solo si la versión no
  existe en npm (`npm view @ancleto/spec@<v>`).
- `NPM_TOKEN` y `GITHUB_TOKEN` son secretos del workflow; sus valores no están en el repo.
- El canary del tarball es **no bloqueante**: reintenta 3 veces y avisa si npm aún no propagó.
- CI **no** ejecuta descubrimiento de modelos ni accede a la red de proveedores.
- El paquete publicado no incluye `scripts/` (`package.json` → `files`), por lo que el refresco del
  catálogo solo existe en el repositorio fuente.

## Repomix

- El CLI resuelve un binario local de `repomix`; si no existe usa `npx -y repomix@1.18.0`
  (`src/cli/index.js` → `runRepomix`).
- Los argumentos se construyen en `src/core/repomix-tier.js`: `--output`, `--ignore` (exclusiones
  del proyecto + extras por tier + `--ignore` explícito) y `--compress` cuando el tier lo pide.
- `normal` no comprime ni excluye tests/docs; `minimo` comprime y excluye `test/**`, `docs/**` y
  `**/*.md`; `gratis` agrega un presupuesto de 50.000 tokens.
- No hay dependencia npm de Repomix en el repo: es una herramienta externa on-demand. El pack de
  esta generación se produjo con el fallback `npx` y quedó comprimido (863 fuentes, 161.700 B,
  ~40k tokens); los cuerpos de funciones se eliden y Repomix aplica además sus ignores por defecto
   (incluye `**/*.md`), por eso el pack no contiene Markdown (ver `unknowns.md`).

## opencode (host, telemetría local y catálogo)

- `stats` y `stats failures` leen la base de sesiones de opencode, por defecto
  `~/.local/share/opencode/opencode.db`; se puede cambiar con `ANCLETO_OPENCODE_DB`.
- `stats failures` clasifica fallos de tool parts en `env`/`check`/`tool`/`unknown`, agrupa por
  comando-esqueleto, enmascara paths y secretos, y nunca proyecta `output`/`error` completos.
- La integración con la base es **solo lectura**.
- `doctor` y `check` comparten el descriptor de destino MCP y la resolución de archivos:
  `HOST_MCP_TARGETS` declara `.opencode/opencode.json|jsonc` (`mcp`), `.agents/mcp_config.json`
  (`mcpServers`), `.mcp.json` (`mcpServers`) y `copilot-mcp.json` (`mcp`). `resolveHostMcpFile`
  respeta el par `json`/`jsonc` de `opencode`; `resolveHostMcpDestination` devuelve el destino del
  host o `null`.
- `check` deriva los hosts instalados de `installedPaths` y agrega avisos no bloqueantes por cada
  destino existente: config no parseable (`<ruta> no es JSON valido; no se inspeccionaron las
  entradas MCP`) y una entrada por comando roto (`MCP '<nombre>' tiene un comando roto (<detalle>)`).
  La salud se decide con `mcpCommandBroken`: comando inválido o ruta absoluta inexistente; un
  comando simple se presume resuelto por PATH y una ruta absoluta existente (incluida `C:\...` en
  Windows) es sana. No inspecciona la config global.
- `doctor` valida el primer destino existente entre el host activo y los hosts instalados; si no hay
  ninguno, cae al par global de `opencode` (`GLOBAL_MCP_CANDIDATES`, derivado de
  `PROJECT_MCP_CANDIDATES`). Un archivo de proyecto inválido no cae al fallback.
- `export` lee la intención MCP del destino del host activo con `readHostMcpIntent`; los hosts sin
  destino conservan la lectura legacy de `.opencode`. Un destino ausente exporta intención vacía sin
  aviso; uno no parseable exporta intención vacía, avisa una vez y sale con 0.
- `import` avisa por `stderr` antes de reemplazar un destino no parseable y, desde 0.20.0, copia y
  registra `.opencode/*` sólo cuando el host activo es `opencode`. Desde 0.20.1, `repairProjectMcp`
  no reescribe un destino sano (bytes y mtime intactos) ni crea un destino inexistente sin entradas
  que reparar; la garantía se acota a `import`/`import --repair`.
- `scripts/refresh-model-catalog.mjs` invoca `opencode models --refresh` y
  `opencode models <provider> --verbose --refresh` en una máquina de mantenimiento. Es la única vía
  de descubrimiento; el runtime consume el snapshot commiteado y no ejecuta procesos ni red.
- La detección de binario ausente es **independiente del locale**: `looksBinaryMissing` reconoce
  `ENOENT` y mensajes de comando no encontrado/no reconocido en varios idiomas; una corrida exitosa
  o con proveedores enumerados no se clasifica como `binary-missing`.
- Con `--write`, el script valida que todo ID declarado sobreviva en el candidato antes de escribir;
  si falta uno, no reemplaza el snapshot ni deja el reporte candidato.

## MCP propios

- **Memoria**: `ancleto mcp` levanta un servidor JSON-RPC por stdio que expone `searchMemory`,
  `recordRule` y `recordDecision` (`src/core/memory/mcp-server.js`, `tools.js`). El binario se
  registra en la config del host (`buildDefaultMcp`).
- **Caveman**: tool de compresión disponible solo en hosts con soporte (`opencode`, `antigravity`).
  La directiva `CAVEMAN_USAGE_NOTE` se decide con `resolvesHostCompression`, que combina la config
  MCP en disco con el MCP que el comando va a escribir; nunca se agrega a archivos compartidos entre
  hosts (`src/cli/index.js`). `check` lee la misma config en disco (`hostConfigHasCompression`).
- **engram**: MCP externo opcional, habilitado con `--with-engram`; no es la memoria del repo.
- **Azure DevOps**: MCP opcional (`--with-azure`), deshabilitado en este repo
  (`PRODUCT.md` → `azure.enabled: false`). Requiere `AZURE_DEVOPS_ORG_URL` y `AZURE_DEVOPS_PAT`
  (valores omitidos).
- **Alcance de `doctor`/`check`**: validan los destinos MCP declarados de los hosts instalados
  (`opencode`, `antigravity`, `commandcode`, `copilot`); no validan `.vscode/mcp.json` ni crean MCP
  para `claude`, `vscode`, `cursor` o `roo`. `check` no valida la config global
  (`aspec/specs/cli-diagnostics/spec.md`, `aspec/specs/agent-install-routing/spec.md`).

## git

- `machine-env` usa `git rev-parse --show-prefix` y `git check-ignore --no-index` para excluir
  `.ancleto/machine-env.md` en `info/exclude`, sin modificar `.gitignore`.
- La detección de EOL prioriza el atributo git del path, luego la configuración de git y, si no hay
  repo, la convención de plataforma (`src/core/machine-env.js`).
- El workflow usa `git for-each-ref` para recuperar el mensaje de un tag anotado.

## Dependencias privadas observables

- `src/core/model-catalog.json` es un snapshot **commiteado** del catálogo de proveedores (5
  proveedores, 211 IDs, `generated_at: 2026-11-04`); no hay llamada de red en runtime.
  `scripts/refresh-model-catalog.mjs` es la única vía de refresco y requiere `opencode` local.
- La integridad de los IDs declarados depende del snapshot commiteado: `declaredModelIds` +
  `missingModelIdsInCatalog` alimentan el guard de tests y el gate de `--write`; `check` agrega un
  aviso advisory no bloqueante cuando el snapshot válido no contiene un ID declarado.
- `freeTierOnPrimary` no consulta ningún sistema externo: cruza el `model:` y el `mode:` ya
  presentes en el frontmatter instalado. Los avisos (set-time en `applyTier`, inspect-time en
  `check`) tampoco hacen red ni ejecutan procesos.
- Los diagnósticos de 0.18.15/0.18.16/0.19.0/0.20.1 son locales: `check` compara
  `.ancletorc.version` con `package.json`, evalúa la salud MCP con `existsSync` sobre los destinos de
  los hosts instalados y `doctor` lee archivos JSON de config MCP. Ninguno hace red ni escribe.
- **0.21.0 no cambia integraciones**: el contrato de conformidad vive en `agents/` y `skills/`, y el
  archive sigue siendo agent-driven. No hay llamadas nuevas a red, procesos ni servicios; el
  contenido promovido a `.ancleto/memory.db` es estado local.
- **0.22.0–0.22.1 tampoco agregan integraciones**: `specs merge` es una operación local de archivos
  (`aspec/changes/**` → `aspec/specs/**`), sin red, procesos externos ni servicios. No consume
  MCP, git, opencode ni Repomix. El orden del archive de 0.22.1 es una secuencia de contratos de
  prompt y estado local (`.ancleto/memory.db`), sin integración nueva.
- **0.24.0 no agrega integraciones**: la alineación del tier `minimo` sólo cambia valores en
  `src/core/tier-models.js`, y el guard de headings de delta es una validación local de
  `src/core/specs-merge.js` sobre archivos de `aspec/specs/**`. Sin red, procesos ni servicios.
- **0.25.0 tampoco agrega integraciones**: el ruteo del sync de delta por `specs merge` es una
  secuencia de contratos de prompt (`skills/ancleto-archive`, `skills/ancleto-bulk-archive`,
  `agents/documenter.md`) sobre archivos locales, y el guard de `--help`/`-h` es un `console.log`
  del uso antes del dispatch, sin escritura de archivos. Sin red, procesos externos ni servicios.
- **0.26.0–0.31.0 no agregan integraciones**: `discovery --check` ya era una lectura local de
  `.config`/estado/hashes, el detector de frescura de 0.26.1 sólo se documenta y pinea en tests,
  0.26.2 sólo consolida walkers de snapshot read-only y pines de frescura en tests, 0.26.4 agrega un
  guard estructural de delta specs a la suite y documenta el Requirement en `spec-sync`, 0.27.0
  normaliza el hash del `package.json` raíz en memoria y amplía el guard de deltas mal ubicados,
  0.28.0 filtra en lectura las rutas efímeras (`.ancleto/**` y `.discovery-map.json` raíz) sin
  tocar el writer ni el estado persistido, 0.29.0 extiende ese mismo filtro de lectura a
  `documentation/**` y `audit logs/**`, áreas gitignored y sin archivos versionados, 0.30.0
  corrige el matcher local de `discovery.exclude` (`escapeRe`/`matchesGlob`), 0.30.1 lo extrae a
  `src/core/discovery-glob.js` con caché en memoria por glob exacto y 0.30.2 sólo corrige la
  redacción canónica y pinea el armado offline del estado, sin tocar el writer ni sumar procesos.
  0.31.0 sólo lee `.ancletorc` → `memory.criticalKeys` en el renderer del working-context y falla o
  advierte según la superficie; sigue siendo local y no suma red, procesos ni servicios.
- El bundle de `export`/`import` es una dependencia de datos portable: `export` copia `.ancletorc`
  verbatim, por lo que `import` **no** hereda `installedPaths` del bundle y registra solo las rutas
  que escribe en el destino (ver `decisions.md`). Desde 0.20.0 la intención MCP de `export` se lee
  del destino del host activo (fallback legacy `.opencode` para hosts sin destino), y `import` copia
  `.opencode/*` sólo en `opencode`. `import` valida la forma de `manifest.mcp` (array; entradas con
  `name` string) antes del primer write. Desde 0.20.1, la reparación in place no reescribe un destino
  sano y no crea uno vacío.
- Las bases SQLite (`.ancleto/memory.db` y la de opencode) son dependencias de datos locales; no se
  versionan.
- `documentation/` es material legado de lnx-cli y `audit logs/` son logs locales; ambos están
  gitignored, no tienen archivos versionados, no son runtime y desde 0.29.0 son efímeros para
  `discovery --check` (`PRODUCT.md`, `.gitignore`).
