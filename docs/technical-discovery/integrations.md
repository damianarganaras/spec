---
node: integrations
kind: integrations
read_when: "sistemas externos, dependencias privadas observables y contratos salientes"
generatedAt: 2026-10-07T23:35:00Z
pluginVersion: 0.12.0
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
| **npm registry** | Publicación del paquete `@ancleto/spec` (`npm publish --access public`), versión actual `0.12.0` en `package.json`; `CHANGELOG.md` cubre hasta `0.12.0`. | `.github/workflows/publish.yml`, `package.json`, `CHANGELOG.md` |
| **GitHub** | Repo `github.com/damianarganaras/spec`; GitHub Actions (`publish.yml`) disparado por tag `v*` o `workflow_dispatch`; releases vía `gh release`. | `.github/workflows/publish.yml`, `package.json` |
| **ESLint 10 + globals** | Dependencias **solo de desarrollo**; habilitan `npm run lint` y el gate de lint en CI. No entran al paquete ni al runtime. | `package.json`, `eslint.config.js` |
| **`gh` CLI + `npm view`/`curl`** | Canary no bloqueante que verifica el tarball y evita publicar versiones ya existentes. Verifica `NPM_TOKEN` / `GITHUB_TOKEN` (valores omitidos). | `.github/workflows/publish.yml` |

## IDEs / agentes consumidores (contrato de instalación)

`agents/`, `commands/`, `skills/` y `templates/` son consumidos por el IDE
elegido. El CLI resuelve el destino con `AGENT_TARGETS` (fuente única de
rutas) y lo registra en `installedPaths` de `.ancletorc`. La adaptación de
frontmatter de agents la posee `src/core/adapters/frontmatter.js`:

| Host | Skills | Agents | Commands | Frontmatter de agents |
|---|---|---|---|---|
| `opencode` (default) | `.opencode/skills` | `.opencode/agents/<n>.md` | `.opencode/commands/<n>.md` | identidad |
| `claude` | `.claude/skills` | `.claude/agents/<n>.md` | `.claude/commands/<n>.md` | dropea claves no portables |
| `vscode` | `.github/skills` | `.github/agents/<n>.agent.md` | `.github/prompts/<n>.prompt.md` | dropea claves no portables |
| `antigravity` | `.agents/skills` | `.agents/agents/<n>.md` | `.agents/skills/<n>/SKILL.md` (command-skill) | transformación completa |
| `cursor` | `.cursor/skills` | — (no soportado) | — (no soportado) | identidad + aviso stderr |
| `roo` | `.roo/skills` | — (no soportado) | — (no soportado) | identidad + aviso stderr |
| `copilot` | — (no soportado) | `.github/prompts/<n>.prompt.md` | `.github/prompts/<n>.prompt.md` | dropea claves no portables + nota de picker |
| `commandcode` | `.commandcode/skills` | `.commandcode/agents/<n>.md` | `.commandcode/commands/<n>.md` | transformación completa (mapa de tools + `tools: "*"` + nota de modelo) |

Con perfil `test`, el overlay (`profiles/test/`) se materializa en los mismos
destinos del host. `ancleto check` valida que el frontmatter instalado coincida
con la salida del adaptador (warning no bloqueante). Detalle:
`units/cli-install.md`.

## MCP (Model Context Protocol)

Configurados por `setupHostMcp` (dueño único): antigravity en
`.agents/mcp_config.json`, commandcode en `.mcp.json` (scope project),
copilot en `copilot-mcp.json` (merge en install, regeneración de rotas en
upgrade sin tocar `copilot-instructions.md`); el resto en
`.opencode/opencode.json`. `init` e `install` los configuran; `--no-mcp` lo
evita. `import` regenera entradas rotas con rutas locales.

| MCP | Tipo | Rol | Default |
|---|---|---|---|
| `ancleto-memory` | local (stdio) | Memoria propia del repo: expone `searchMemory`/`recordRule`/`recordDecision` sobre `.ancleto/memory.db`. Se lanza con `.../src/cli/index.js mcp`. | Habilitado |
| `caveman` | local (binario) | Compresión de salida del agente (`caveman-mcp.exe`). | Habilitado si está en `PATH` |
| `engram` | externo | Memoria de agente/sesión; **opcional** (`--with-engram`), no se agrega por defecto por su costo (~4.900 tokens/request). | Deshabilitado |
| `azure-devops` | externo (`npx -y @davstack/mcp-azure-devops`) | Solo si `azure.enabled: true` y sin `--no-mcp`. | Deshabilitado |

Evidencia: `src/cli/index.js`, `README.md`, `BACKLOG.md`.

## Observabilidad / telemetría

| Sistema | Uso | Evidencia |
|---|---|---|
| **Base de sesiones de opencode** | `ancleto stats` lee tokens de entrada/salida/razonamiento/cache, costo y subagentes por sesión. Solo opencode. | `README.md`, `src/cli/index.js` (`opencodeDbPath`) |

## Azure DevOps (opcional, apagado)

- Gate en `.ancletorc` → en este checkout `.ancletorc` existe pero su contenido
  no se lee durante el seed (contrato: se consume resuelto vía `--check`);
  el default documentado es apagado.
- El comando `/cleto-pr` usa GitHub por defecto; con Azure habilitado cambia
  el flujo. Setup: `az extension add --name azure-devops` + `az login`
  (extensión, no dependencia del paquete). Evidencia: `README.md`, `PRODUCT.md`.

## Dependencias internas y de runtime

- Módulos nativos: `node:sqlite` (motor de memoria), `node:test` (suite),
  `node:fs`, `node:crypto`, `node:child_process` (spawn de Repomix).
  Evidencia: pack `src/**`.
- Dependencias de desarrollo: `eslint` y `globals` (lint). El lockfile
  `package-lock.json` existe en la raíz y **no** es dependencia del paquete
  publicado (los `--ignore` del discovery lo filtran en tiers `minimo`/`gratis`;
  el tier `normal` resuelto en este checkout sí puede incluirlo). No hay
  `yarn.lock` ni `pnpm-lock.yaml`. Evidencia: `package.json`,
  `src/core/repomix-tier.js`.
- **Cambios del ciclo observados en este seed**: `documentation/` ya no
  aparece como área raíz (registrada como "área raíz eliminada" por
  `materialReasons`), y `package-lock.json` aparece como archivo material
  nuevo. El resto de los cambios de `materialReasons` se confirman en el
  pack. Evidencia: `ancleto discovery --check` (`changedAreas`).