---
node: integrations
kind: integrations
read_when: "sistemas externos, dependencias privadas observables y contratos salientes"
generatedAt: 2026-10-26T19:42:38Z
pluginVersion: 0.15.2
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
| **npm registry** | Publicación del paquete `@ancleto/spec` (`npm publish --access public`), versión actual `0.15.2` (`package.json`); el último tag es `v0.15.1` (HEAD `0fe4482`, 11 commits por delante) y aún no hay tag `v0.15.2`. | `.github/workflows/publish.yml`, `package.json`, `git describe --tags` |
| **GitHub** | Repo `github.com/damianarganaras/spec`; GitHub Actions (`publish.yml`) disparado por tag `v*` o `workflow_dispatch`; releases vía `gh release`. | `.github/workflows/publish.yml`, `package.json` |
| **ESLint 10 + globals** | Dependencias **solo de desarrollo**; habilitan `npm run lint` y el gate de lint en CI. No entran al paquete ni al runtime. | `package.json`, `eslint.config.js` |
| **`gh` CLI + `npm view`/`curl`** | Canary no bloqueante que verifica el tarball y evita publicar versiones ya existentes. Verifica `NPM_TOKEN` / `GITHUB_TOKEN` (valores omitidos). | `.github/workflows/publish.yml` |
| **Git** | Necesario para `machine-env` (`rev-parse`, `check-ignore`, `info/exclude`), para el ciclo SDD y para el publish. Además es la única fuente del estado del árbol que consume el intake de sesión del orquestador, vía `git status --short` delegado a `@technical-discovery` (literal permitido en su allowlist de `bash`, sobre `'*': deny`). Si falta, el CLI degrada con warning no bloqueante. | `src/core/machine-env.js`, `.gitattributes`, `AGENTS.md`, `agents/technical-discovery.md` |

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

## Entorno de máquina (integración local con git)

`.ancleto/machine-env.md` no es un servicio externo: es un artefacto derivado y local por
máquina. Su única integración externa es **git**, usada de forma read-only/best-effort:

- `git rev-parse --is-inside-work-tree` y `--show-toplevel` para saber si hay repo y su raíz.
- `git rev-parse --show-prefix` para el path repo-root-relative del proyecto (subdirectorios,
  worktrees y symlinks).
- `git check-ignore --no-index` para decidir si ya está ignorado y para verificar la exclusión.
- `git rev-parse --git-path info/exclude` para localizar la exclusión local del clon.
- `git ls-files` (solo en `ancleto check`) para advertir si el artefacto quedó trackeado.

Todas esas invocaciones están **acotadas a 5 s** (`GIT_TIMEOUT_MS`): una llamada a `git`
bloqueada no puede colgar `init`/`install`/`upgrade`. Nunca modifica `.gitignore` ni archivos
del repo. Si git no está disponible o falla, el artefacto se escribe igual y la exclusión se
reporta como warning no bloqueante.

La misma dependencia de procesos externos cubre la **sonda de invocabilidad**: el módulo lanza
los candidatos de `rg`/`node`/`npm`/`git`/`python` con `node:child_process` para comprobar que
son invocables (2 s por intento, 10 s acumulados por corrida). La dependencia es del **runtime
local**, no de un servicio externo. Evidencia: `src/core/machine-env.js`,
`aspec/specs/machine-environment/spec.md`.

## MCP (Model Context Protocol)

Configurados por `setupHostMcp` (dueño único) con **excepciones de host-MCP**: antigravity
en `.agents/mcp_config.json`, commandcode en `.mcp.json` y copilot en `copilot-mcp.json`; el
resto en `.opencode/opencode.json`. `init` e `install` los configuran; `--no-mcp` lo evita.
`import` regenera entradas rotas con rutas locales.

| MCP | Tipo | Rol | Default |
|---|---|---|---|
| `ancleto-memory` | local (stdio) | Memoria propia del repo: expone `searchMemory`/`recordRule`/`recordDecision` sobre `.ancleto/memory.db`. Se lanza con `.../src/cli/index.js mcp`. El handler refresca el working-context filtrado por `shouldRefreshWorkingContext`. La tool sigue disponible para el IDE: lo que cambió es que **el orquestador no la invoca** —delega la recuperación en `@memory-keeper`— y que el `<ContextOverflowWarning>` ya no la nombra. | Habilitado |
| `caveman` | local (binario) | Compresión de salida del agente (`caveman-mcp.exe`). Su **directiva de uso es host-scoped**: se materializa solo donde la config MCP del host incluye la tool (`opencode`/`antigravity`); revertible a opt-in por compuerta de medición. | Habilitado si está en `PATH` |
| `engram` | externo | Memoria de agente/sesión; **opcional** (`--with-engram`), no se agrega por defecto por su costo (~4.900 tokens/request). | Deshabilitado |
| `azure-devops` | externo (`npx -y @davstack/mcp-azure-devops`) | Solo si `azure.enabled: true` y sin `--no-mcp`. | Deshabilitado |

Adicionalmente, `ancleto memory doctor` emite un **chequeo de staleness advisory** sobre el
working-context (línea `Working-context: <ok|ausente|desactualizado>`,
`checkWorkingContextFreshness`). Es read-only y **no** es un MCP: vive dentro del propio CLI y
no agrega dependencias. Evidencia: `src/core/memory/working-context.js`, `src/cli/index.js`,
`aspec/specs/memory-engine/spec.md`.

Evidencia de MCP: `src/cli/index.js`, `README.md`, `aspec/specs/agent-install-routing/spec.md`.

## Observabilidad / telemetría

| Sistema | Uso | Evidencia |
|---|---|---|
| **Base de sesiones de opencode** | `ancleto stats` lee tokens de entrada/salida/razonamiento/cache, costo y subagentes por sesión. Solo opencode. Es la fuente de la compuerta de medición del default de caveman. | `README.md`, `src/cli/index.js` (`opencodeDbPath`) |
| **`ancleto stats failures`** | Reporte **read-only** de tool parts fallidos de opencode: clasifica `env`/`check`/`tool`/`unknown`, agrupa por proyecto/herramienta/clase/esqueleto y enmascara secretos/rutas. No imprime `output` ni `state.error`. Es la medición de la mejora de `machine-env`. | `src/cli/index.js` (`statsFailuresCommand`), `aspec/specs/session-failure-report/spec.md` |
| **Working-context advisory** | `ancleto memory doctor` expone `Working-context: <estado>` tras la integridad de la DB. No rompe el exit code. | `src/cli/index.js`, `src/core/memory/working-context.js` |

## Azure DevOps (opcional, apagado)

- Gate en `.ancletorc` → en este checkout `.ancletorc` existe pero su contenido no se lee
  durante el seed (contrato: se consume resuelto vía `--check`); `PRODUCT.md` declara el estado
  apagado en este repositorio.
- El comando `/cleto-pr` usa GitHub por defecto; con Azure habilitado cambia el flujo. Setup:
  `az extension add --name azure-devops` + `az login` (extensión, no dependencia del paquete).
  Evidencia: `README.md`, `PRODUCT.md`.

## Dependencias internas y de runtime

- Módulos nativos: `node:sqlite` (motor de memoria), `node:test` (suite), `node:fs`,
  `node:crypto`, `node:child_process` (spawn de Repomix, de `git` y de las sondas de
  invocabilidad de herramientas), `node:os`, `node:path`, `node:url`. Evidencia: pack `src/**`.
- Dependencias de desarrollo: `eslint` y `globals` (lint). Los lockfiles
  (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) están **excluidos de las fuentes del
  discovery y del pack**; `package-lock.json` existe en el checkout. No son dependencias del
  paquete publicado. Evidencia: `package.json`, `ancleto discovery --check`
  (`config.exclude`), `.discovery-map.json` (`root_files`).
- `documentation/lnx-cli/` es material legado de otro CLI (`lnx`) usado como fuente de
  relevamiento; no es dependencia de runtime y está gitignored. Evidencia: `BACKLOG.md`,
  `.gitignore`, listado del directorio.
