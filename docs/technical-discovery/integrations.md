---
node: integrations
kind: integrations
read_when: "sistemas externos y dependencias privadas observables"
generatedAt: 2026-11-03T22:11:31Z
pluginVersion: 0.18.10
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
| opencode | Host del IDE; base de sesiones para `stats` | Entrada | `src/cli/index.js` → `opencodeDbPath` |
| MCP de memoria (`ancleto-memory`) | Tools `searchMemory`, `recordRule`, `recordDecision` | Salida/entrada | `src/core/memory/mcp-server.js` |
| MCP caveman | Compresión de contexto en hosts que la exponen | Salida | `src/cli/index.js`, AGENTS.md |
| MCP engram | Memoria de sesión opcional (opt-in) | Salida | `src/cli/index.js` → `buildDefaultMcp` |
| MCP Azure DevOps | Work Items opcional; deshabilitado en este repo | Salida | `PRODUCT.md`, `.ancletorc` |
| git | EOL, exclusión local de `machine-env`, release notes | Entrada | `src/core/machine-env.js`, workflow |
| SQLite/FTS5 (`node:sqlite`) | Persistencia y búsqueda de memoria | Interna | `src/core/memory/*` |

## npm y CI

- El workflow `Publish` se dispara con tags `v*` o manualmente. Corre `npm ci`, `npm run lint`,
  `node --test test/*.test.js` y publica solo si la versión no existe en npm
  (`npm view @ancleto/spec@<v>`).
- `NPM_TOKEN` y `GITHUB_TOKEN` son secretos del workflow; sus valores no están en el repo.
- El canary del tarball es **no bloqueante**: reintenta 3 veces y avisa si npm aún no propagó.

## Repomix

- El CLI resuelve un binario local de `repomix`; si no existe usa `npx -y repomix@1.18.0`
  (`src/cli/index.js` → `runRepomix`).
- Los argumentos se construyen en `src/core/repomix-tier.js`: `--output`, `--ignore` (exclusiones
  del proyecto + extras por tier + `--ignore` explícito) y `--compress` cuando el tier lo pide.
- `normal` no comprime ni excluye tests/docs; `minimo` comprime y excluye `test/**`, `docs/**` y
  `**/*.md`; `gratis` agrega un presupuesto de 50.000 tokens.
- No hay dependencia npm de Repomix en el repo: es una herramienta externa on-demand.

## opencode (host y telemetría local)

- `stats` y `stats failures` leen la base de sesiones de opencode, por defecto
  `~/.local/share/opencode/opencode.db`; se puede cambiar con `ANCLETO_OPENCODE_DB`.
- `stats failures` clasifica fallos de tool parts en `env`/`check`/`tool`/`unknown`, agrupa por
  comando-esqueleto, enmascara paths y secretos, y nunca proyecta `output`/`error` completos.
- La integración es **solo lectura** sobre la base de opencode.

## MCP propios

- **Memoria**: `ancleto mcp` levanta un servidor JSON-RPC por stdio que expone `searchMemory`,
  `recordRule` y `recordDecision` (`src/core/memory/mcp-server.js`, `tools.js`). El binario se
  registra en la config del host (`buildDefaultMcp`).
- **Caveman**: tool de compresión disponible solo en hosts cuya config MCP la incluye
  (`opencode`, `antigravity`). La directiva de uso se materializa host-scoped; no se agrega a
  archivos compartidos entre hosts (`src/cli/index.js` → `CAVEMAN_USAGE_NOTE`).
- **engram**: MCP externo opcional, habilitado con `--with-engram`; no es la memoria del repo.
- **Azure DevOps**: MCP opcional (`--with-azure`), deshabilitado en este repo
  (`.ancletorc` → `azure.enabled: false`). Requiere `AZURE_DEVOPS_ORG_URL` y `AZURE_DEVOPS_PAT`
  (valores omitidos).

## git

- `machine-env` usa `git rev-parse --show-prefix` y `git check-ignore --no-index` para excluir
  `.ancleto/machine-env.md` en `info/exclude`, sin modificar `.gitignore`.
- La detección de EOL prioriza el atributo git del path, luego la configuración de git y, si no hay
  repo, la convención de plataforma (`src/core/machine-env.js`).
- El workflow usa `git for-each-ref` para recuperar el mensaje de un tag anotado.

## Dependencias privadas observables

- `src/core/model-catalog.json` es un snapshot **commiteado** del catálogo de proveedores; no hay
  llamada de red en runtime. `scripts/refresh-model-catalog.mjs` es la única vía de refresco y
  requiere `opencode` local.
- Las bases SQLite (`.ancleto/memory.db` y la de opencode) son dependencias de datos locales; no se
  versionan.
- `documentation/` es material legado de lnx-cli, gitignored y fuera del runtime (`PRODUCT.md`,
  `.gitignore`).
