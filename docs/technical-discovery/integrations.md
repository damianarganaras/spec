---
node: integrations
kind: integrations
read_when: "sistemas externos, dependencias privadas observables y contratos salientes"
generatedAt: 2026-09-30T21:41:13Z
pluginVersion: 0.8.0
skillVersion: '2.3'
---

# Integraciones y dependencias externas

## Empaquetado de contexto

| Sistema | Uso | Evidencia |
|---|---|---|
| **Repomix 1.18.0** | Empaqueta el repo para el seed. Se resuelve en `PATH` o con `npx -y repomix@1.18.0`; admite `--include`, `--ignore`, `--compress`, `--token-budget`. Aporta `--compress` (tree-sitter). | `src/cli/index.js` (`runRepomix`), pack Repomix |

## Distribución y CI

| Sistema | Uso | Evidencia |
|---|---|---|
| **npm registry** | Publicación del paquete `@ancleto/spec` (`npm publish --access public`). | `.github/workflows/publish.yml`, `package.json` |
| **GitHub** | Repo `github.com/damianarganaras/spec`; GitHub Actions (`publish.yml`) disparado por tag `v*` o `workflow_dispatch`; releases vía `gh release`. | `.github/workflows/publish.yml`, `package.json` |
| **`gh` CLI + `npm view`/`curl`** | Canary no bloqueante que verifica el tarball y evita publicar versiones ya existentes. Verifica `NPM_TOKEN` / `GITHUB_TOKEN` (valores omitidos). | `.github/workflows/publish.yml` |

## IDEs / agentes consumidores (contrato de instalación)

`agents/`, `commands/`, `skills/` y `templates/` son consumidos por el IDE elegido. El CLI
resuelve el destino con `AGENT_TARGETS` (fuente única de rutas) y lo registra en
`installedPaths` de `.ancletorc`:

| Host | Skills | Agents | Commands |
|---|---|---|---|
| `opencode` (default) | `.opencode/skills` | `.opencode/agents/<n>.md` | `.opencode/commands/<n>.md` |
| `claude` | `.claude/skills` | `.claude/agents/<n>.md` | `.claude/commands/<n>.md` |
| `vscode` | `.github/skills` | `.github/agents/<n>.agent.md` | `.github/prompts/<n>.prompt.md` |
| `antigravity` | `.agents/skills` | `.agents/agents/<n>.md` | `.agents/skills/<n>/SKILL.md` (command-skill) |
| `cursor` | `.cursor/skills` | — (no soportado) | — (no soportado) |
| `roo` | `.roo/skills` | — (no soportado) | — (no soportado) |
| `copilot` | — (no soportado) | `.github/prompts/<n>.prompt.md` | `.github/prompts/<n>.prompt.md` |

Los agents de `claude`/`vscode`/`antigravity`/`copilot` se adaptan de frontmatter (el resto se
copia verbatim); Antigravity además transforma tools y flags; Copilot comparte dir entre
agents y commands (sin colisión) y suma la nota de picker (el tier no cambia modelos).
Con perfil `test`, el overlay (`profiles/test/`) se materializa en los mismos destinos del
host. Detalle: `units/cli-install.md`.

## MCP (Model Context Protocol)

Configurados por `setupHostMcp` (dueño único): antigravity en `.agents/mcp_config.json`,
copilot en `copilot-mcp.json` (merge en install, regeneración de rotas en upgrade sin tocar
`copilot-instructions.md`); el resto en `.opencode/opencode.json`. `init` e `install` los
configuran; `--no-mcp` lo evita. `import` regenera entradas rotas con rutas locales.

| MCP | Tipo | Rol | Default |
|---|---|---|---|
| `ancleto-memory` | local (stdio) | Memoria propia del repo: expone `searchMemory`/`recordRule`/`recordDecision` sobre `.ancleto/memory.db`. Se lanza con `.../src/cli/index.js mcp`. | Habilitado |
| `caveman` | local (binario) | Compresión de salida del agente (`caveman-mcp.exe`). | Habilitado si está en `PATH` |
| `engram` | externo | Memoria de agente/sesión; **opcional** (`--with-engram`), no se agrega por defecto por su costo (~4.900 tokens/request). | Deshabilitado |
| `azure-devops` | externo (`npx -y @davstack/mcp-azure-devops`) | Solo si `azure.enabled: true` y sin `--no-mcp`. | Deshabilitado |

Evidencia: `src/cli/index.js`, `.opencode/opencode.json`, `README.md`, `BACKLOG.md`.

## Observabilidad / telemetría

| Sistema | Uso | Evidencia |
|---|---|---|
| **Base de sesiones de opencode** | `ancleto stats` lee tokens de entrada/salida/razonamiento/cache, costo y subagentes por sesión. Solo opencode. | `README.md`, `src/cli/index.js` (`opencodeDbPath`) |

## Azure DevOps (opcional, apagado)

- Gate en `.ancletorc` → `azure.enabled: false` en este repo.
- El comando `/cleto-pr` usa GitHub por defecto; con Azure habilitado cambia el flujo. Setup:
  `az extension add --name azure-devops` + `az login` (extensión, no dependencia del paquete).
  Evidencia: `README.md`, `PRODUCT.md`.

## Dependencias internas y de runtime

- Módulos nativos: `node:sqlite` (motor de memoria), `node:test` (suite), `node:fs`,
  `node:crypto`, `node:child_process` (spawn de Repomix). Evidencia: pack `src/**`.
- `documentation/lnx-cli/` es material legado de otro CLI (`lnx`) usado como fuente de
  relevamiento; no es dependencia de runtime. Evidencia: `BACKLOG.md`, listado del directorio.
