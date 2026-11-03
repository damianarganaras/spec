---
node: integrations
kind: integrations
read_when: "sistemas externos, dependencias privadas observables y contratos salientes"
generatedAt: 2026-11-02T18:45:50Z
pluginVersion: 0.18.5
skillVersion: '2.3'
---

# Integraciones y dependencias externas

## Empaquetado de contexto

| Sistema | Uso | Evidencia |
|---|---|---|
| **Repomix 1.18.0** | Empaqueta el repo para el seed. Se resuelve en `PATH` o con `npx -y repomix@1.18.0`; admite `--include`, `--ignore`, `--compress`, `--token-budget`. Aporta `--compress` (tree-sitter). | `src/cli/index.js` (`runRepomix`), pack Repomix |

## Distribución, CI y calidad

| Sistema | Uso | Evidencia |
|---|---|---|
| **npm registry** | Publicación de `@ancleto/spec` (`npm publish --access public`), versión actual `0.18.5`. Tag `v0.18.5` → merge `dbf7df5` (`merge development: 0.18.5`, en `main`). `0.18.3` publicó MEM-04b; `0.18.4` el ranking/omisiones; `0.18.5` `memory consolidate`. | `.github/workflows/publish.yml`, `package.json`, `git tag`, `git log`, `CHANGELOG.md` |
| **GitHub** | Repo `github.com/damianarganaras/spec`; GitHub Actions (`publish.yml`) disparado por tag `v*` o `workflow_dispatch`; releases vía `gh release`. | `.github/workflows/publish.yml`, `package.json` |
| **ESLint 10 + globals** | Dependencias **sólo de desarrollo**; habilitan `npm run lint` y el gate de lint en CI. No entran al paquete ni al runtime. | `package.json`, `eslint.config.js` |
| **`gh` CLI + `npm view`/`curl`** | Canary no bloqueante que verifica el tarball y evita publicar versiones ya existentes. Usa `NPM_TOKEN` / `GITHUB_TOKEN` (valores omitidos). | `.github/workflows/publish.yml` |
| **Git** | Necesario para `machine-env` (`rev-parse`, `check-ignore`, `info/exclude`), el ciclo SDD y el publish. Es la única fuente del estado del árbol para el intake del orquestador, vía `git status --short` delegado a `@technical-discovery`. Si falta, el CLI degrada con warning. | `src/core/machine-env.js`, `.gitattributes`, `AGENTS.md`, `agents/technical-discovery.md` |

## IDEs / agentes consumidores (contrato de instalación)

`agents/`, `commands/`, `skills/` y `templates/` son consumidos por el IDE elegido. El CLI
resuelve el destino con `AGENT_TARGETS` (fuente única de rutas) y lo registra en
`installedPaths` de `.ancletorc`. La adaptación de frontmatter de agents la posee
`src/core/adapters/frontmatter.js`:

| Host | Skills | Agents | Commands | Frontmatter de agents |
|---|---|---|---|---|
| `opencode` (default) | `.opencode/skills` | `.opencode/agents/<n>.md` | `.opencode/commands/<n>.md` | identidad |
| `claude` | `.claude/skills` | `.claude/agents/<n>.md` | `.claude/commands/<n>.md` | dropea claves no portables |
| `vscode` | `.github/skills` | `.github/agents/<n>.agent.md` | `.github/prompts/<n>.prompt.md` | dropea claves no portables |
| `antigravity` | `.agents/skills` | `.agents/agents/<n>.md` | `.agents/skills/<n>/SKILL.md` (command-skill) | transformación completa |
| `cursor` | `.cursor/skills` | — (no soportado) | — (no soportado) | identidad + aviso stderr |
| `roo` | `.roo/skills` | — (no soportado) | — (no soportado) | identidad + aviso stderr |
| `copilot` | — (no soportado) | `.github/prompts/<n>.prompt.md` | `.github/prompts/<n>.prompt.md` | dropea claves no portables + nota de picker |
| `commandcode` | `.commandcode/skills` | `.commandcode/agents/<n>.md` | `.commandcode/commands/<n>.md` | transformación (tools como lista; `model` omitido) |

Con perfil `test`, el overlay (`profiles/test/`) se materializa en los mismos destinos del
host. `ancleto check` valida que el frontmatter instalado coincida con la salida del adaptador
(warning no bloqueante). Detalle: `units/cli-install.md`.

## Configuración del host opencode (raíz del repo)

`opencode.json` es configuración **del checkout**, no del paquete: fija
`agent.model = commandcode/deepseek/deepseek-v4.1-flash` para los **10 subagentes** y
`package.json` → `files` no lo publica. Es configuración local, no contrato del producto.
Evidencia: `opencode.json`, `package.json`.

## Entorno de máquina (integración local con git)

`.ancleto/machine-env.md` no es un servicio externo: es un artefacto derivado y local por
máquina. Su única integración externa es **git**, usada read-only/best-effort:

- `git rev-parse --is-inside-work-tree` y `--show-toplevel` para saber si hay repo y su raíz.
- `git rev-parse --show-prefix` para el path repo-root-relative del proyecto.
- `git check-ignore --no-index` para decidir si ya está ignorado y verificar la exclusión.
- `git rev-parse --git-path info/exclude` para localizar la exclusión local del clon.
- `git ls-files` (sólo en `ancleto check`) para advertir si el artefacto quedó trackeado.

Todas las invocaciones están **acotadas a 5 s** (`GIT_TIMEOUT_MS`): una llamada bloqueada no
puede colgar `init`/`install`/`upgrade`. Nunca modifica `.gitignore` ni archivos del repo. Si
git no está disponible o falla, el artefacto se escribe igual y la exclusión se reporta como
warning no bloqueante.

La misma dependencia de procesos externos cubre la **sonda de invocabilidad**: el módulo lanza
los candidatos de `rg`/`node`/`npm`/`git`/`python` con `node:child_process` para comprobar que
son invocables (2 s por intento, 10 s acumulados). Es una dependencia del **runtime local**, no
de un servicio externo. Evidencia: `src/core/machine-env.js`,
`aspec/specs/machine-environment/spec.md`.

## Memoria local (sin servicios externos)

`.ancleto/memory.db` es SQLite nativo (`node:sqlite`): no hay servidor ni dependencia de red.
Las operaciones de memoria son **locales y sincrónicas**:

- `memory snapshot` usa `VACUUM INTO` sobre una conexión read-only y reemplaza el destino con
  `node:fs`. No invoca herramientas externas.
- `memory merge` y `memory consolidate --apply` usan el motor transaccional. No escriben
  archivos; el CLI refresca el working-context derivado.
- `memory doctor` usa `PRAGMA quick_check`, la tabla sombra `memory_fts_docsize` y, en
  `Refs de nodos activos`, sólo lectura local de `aspec/specs/**/spec.md` y listado de
  `aspec/changes/**` con `existsSync`/`statSync`; no hay chequeo remoto ni escritura. Las refs
  `commit:`/`workitem:` no se resuelven contra ningún servicio.
- `resolveNodeRefs` resuelve `spec:`/`change:`/`path:` contra el **filesystem local**, sin abrir
  la DB ni escribir. No invoca git para `commit:` ni un tracker para `workitem:`.
- `memory consolidate` agrupa y compara contenido localmente; los near-dups se calculan con
  Jaccard sobre tokens, sin servicio externo.

Evidencia: `src/core/memory/snapshot.js`, `src/core/memory/doctor.js`,
`src/core/memory/engine.js`.

## MCP (Model Context Protocol)

Configurados por `setupHostMcp` (dueño único) con **excepciones host-MCP**: antigravity en
`.agents/mcp_config.json`, commandcode en `.mcp.json` y copilot en `copilot-mcp.json`; el resto
en `.opencode/opencode.json`. `init` e `install` los configuran; `--no-mcp` lo evita. `import`
regenera entradas rotas con rutas locales.

| MCP | Tipo | Rol | Default |
|---|---|---|---|
| `ancleto-memory` | local (stdio) | Memoria propia del repo: `searchMemory`/`recordRule`/`recordDecision` sobre `.ancleto/memory.db`. Se lanza con `.../src/cli/index.js mcp`. Escribe con `source: 'mcp:ancleto-memory'`, por lo que sus escrituras pasan por la validación fail-closed de refs. El handler refresca el working-context filtrado por `shouldRefreshWorkingContext`. | Habilitado |
| `caveman` | local (binario) | Compresión de salida del agente (`caveman-mcp.exe`). Su directiva es host-scoped: se materializa sólo donde la config MCP incluye la tool (`opencode`/`antigravity`). | Habilitado si está en `PATH` |
| `engram` | externo | Memoria de agente/sesión; **opcional** (`--with-engram`) por su costo (~4.900 tokens/request). | Deshabilitado |
| `azure-devops` | externo (`npx -y @davstack/mcp-azure-devops`) | Sólo si `azure.enabled: true` y sin `--no-mcp`. | Deshabilitado |

La procedencia de escritura se fija en `createMemoryServer`:
`createMemoryToolHandlers(engine, { source: 'mcp:ancleto-memory', projectRoot })`. El
`cli:import` **no** usa esa ruta: `importNodes` queda fuera de `recordNode` y conserva LWW sin
validar refs.

`memory doctor` emite además un **chequeo de staleness advisory** del working-context
(`Working-context: <ok|ausente|desactualizado>`). Es read-only y no es un MCP. En el estado
actual reporta `desactualizado`. Evidencia: `src/core/memory/working-context.js`,
`src/cli/index.js`, `aspec/specs/memory-engine/spec.md`.

## Observabilidad / telemetría

| Sistema | Uso | Evidencia |
|---|---|---|
| **Base de sesiones de opencode** | `ancleto stats` lee tokens de entrada/salida/razonamiento/cache, costo y subagentes por sesión. Sólo opencode. Es la fuente de la compuerta de medición de caveman. | `README.md`, `src/cli/index.js` (`opencodeDbPath`) |
| **`ancleto stats failures`** | Reporte read-only de tool parts fallidos de opencode: clasifica `env`/`check`/`tool`/`unknown`, agrupa por proyecto/herramienta/clase/esqueleto y enmascara secretos/rutas. No imprime `output` ni `state.error`. | `src/cli/index.js`, `aspec/specs/session-failure-report/spec.md` |
| **`memory doctor`** | Cinco checks read-only; en la corrida local: 212 filas indexadas, 112 nodos activos, 292 refs verificadas, 0 no resueltas, WAL presente. | `src/cli/index.js`, `src/core/memory/doctor.js` |
| **Working-context advisory** | `memory doctor` expone `Working-context: <estado>` tras los checks. No rompe el exit code. | `src/cli/index.js`, `src/core/memory/working-context.js` |

## Azure DevOps (opcional, apagado)

- Gate en `.ancletorc` → `azure.enabled`; `PRODUCT.md` declara el estado apagado en este
  repositorio.
- El comando `/cleto-pr` usa GitHub por defecto; con Azure habilitado cambia el flujo. Setup:
  `az extension add --name azure-devops` + `az login` (extensión, no dependencia del paquete).
  Evidencia: `README.md`, `PRODUCT.md`.

## Dependencias internas y de runtime

- Módulos nativos: `node:sqlite` (motor de memoria), `node:test` (suite), `node:fs`,
  `node:crypto`, `node:child_process` (spawn de Repomix, de `git` y de las sondas), `node:os`,
  `node:path`, `node:url`. Evidencia: pack `src/**`.
- Dependencias de desarrollo: `eslint` y `globals` (lint). Los lockfiles están excluidos de las
  fuentes del discovery y del pack; `package-lock.json` existe en el checkout. No son
  dependencias del paquete publicado. Evidencia: `package.json`,
  `ancleto discovery --check` (`config.exclude`), `.discovery-map.json`.
- `documentation/lnx-cli/` es material legado de otro CLI (`lnx`) usado como fuente de
  relevamiento; no es dependencia de runtime y está gitignored.
