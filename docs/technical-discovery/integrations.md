---
node: integrations
kind: integrations
read_when: "sistemas externos, dependencias privadas observables y contratos salientes"
generatedAt: 2026-09-25T14:03:34Z
pluginVersion: 0.6.37
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
| **GitHub** | Repo `github.com/damianarganaras/spec`; GitHub Actions (`publish.yml`) disparado por tag `v*`; releases vía `gh release`. | `.github/workflows/publish.yml`, `package.json` |
| **`gh` CLI + `npm view`/`curl`** | Canary no bloqueante que verifica el tarball y evita publicar versiones ya existentes. Verifica `NPM_TOKEN` / `GITHUB_TOKEN` (valores omitidos). | `.github/workflows/publish.yml` |

## MCP (Model Context Protocol)

Configurados en `.opencode/opencode.json` y por `ancleto install`:

| MCP | Tipo | Rol | Default |
|---|---|---|---|
| `ancleto-memory` | local (stdio) | Memoria propia del repo: expone `searchMemory`/`recordRule`/`recordDecision` sobre `.ancleto/memory.db`. Se lanza con `.../src/cli/index.js mcp`. | Habilitado |
| `caveman` | local (binario) | Compresión de salida del agente (`caveman-mcp.exe`). | Habilitado |
| `engram` | externo | Memoria de agente/sesión; **opcional** (`--with-engram`), no se agrega por defecto por su costo (~4.900 tokens/request). | Deshabilitado |
| `azure-devops` | externo (`npx -y @davstack/mcp-azure-devops`) | Solo si `azure.enabled: true` y sin `--no-mcp`. | Deshabilitado |

Evidencia: `.opencode/opencode.json`, `README.md`, `BACKLOG.md`.

## Observabilidad / telemetría

| Sistema | Uso | Evidencia |
|---|---|---|
| **Base de sesiones de opencode** | `ancleto stats` lee tokens de entrada/salida/razonamiento/cache, costo y subagentes por sesión. Solo opencode. | `README.md`, `src/cli/index.js` (`opencodeDbPath`) |

## Azure DevOps (opcional, apagado)

- Gate en `.ancletorc` → `azure.enabled: false` en este repo.
- El comando `/cleto-pr` usa GitHub por defecto; con Azure habilitado cambia el flujo. Setup:
  `az extension add --name azure-devops` + `az login` (extensión, no dependencia del paquete).
  Evidencia: `README.md`, `PRODUCT.md`, `.ancletorc`.

## Dependencias internas y de runtime

- Módulos nativos: `node:sqlite` (motor de memoria), `node:test` (suite), `node:fs`,
  `node:crypto`, `node:child_process` (spawn de Repomix). Evidencia: pack `src/**`.
- `agents/`, `commands/`, `skills/`, `templates/` son consumidos por IDEs (OpenCode, Cursor,
  VS Code, Roo, Antigravity) mediante los paths de instalación del manifiesto.
- `documentation/lnx-cli/` es material legado de otro CLI (`lnx`) usado como fuente de
  relevamiento; no es dependencia de runtime. Evidencia: `BACKLOG.md`, listado del directorio.
