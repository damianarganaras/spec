---
node: integrations
kind: integrations
read_when: "sistemas externos y dependencias privadas observables"
generatedAt: 2026-11-20T19:51:44.420Z
pluginVersion: 0.42.0
skillVersion: '2.3'
---

# Integraciones

## Resumen

El runtime no tiene dependencias de paquetes. Las integraciones son **procesos locales**,
**archivos de configuración de hosts** y **servicios de publicación**; ninguna es necesaria para
que el núcleo de la CLI funcione.

| Integración | Tipo | Obligatoria | Evidencia |
| --- | --- | --- | --- |
| Repomix | Proceso local / `npx` | Solo para `discovery --compress` | `src/cli/index.js` |
| `opencode` | Proceso local + archivos | Opcional (catálogo, sesiones) | `src/cli/index.js`, `scripts/refresh-model-catalog.mjs` |
| `jev-spec` | Proceso local | Opcional y advisory | `src/core/judge.js` |
| Git | Proceso local | Instalación / `machine-env.md` | `src/core/machine-env.js` |
| `node:sqlite` + FTS5 | Módulo nativo | Sí para memoria | `src/core/memory/database.js` |
| npm registry + GitHub | Servicios de CI | Solo publicación | `.github/workflows/publish.yml` |
| Hosts de agentes | Archivos de configuración | Según instalación | `src/cli/index.js`, `src/core/adapters/frontmatter.js` |

## Repomix

- Se invoca on-demand con `discovery --compress`; se resuelve por `PATH` o vía `npx`.
- El pack se escribe en el directorio temporal del sistema (`%TEMP%`), nunca en el repo ni en
  `.ancleto`.
- El CLI pasa `--ignore` con los globs resueltos de `discovery.exclude`; Repomix agrega sus
  propios defaults (incluye `**/*.md` y `test/**`).
- El estado persistido registra `packTokens` y los hashes por archivo.
- Evidencia: `src/cli/index.js`, `src/core/repomix-tier.js`, `src/core/discovery-state.js`.

## opencode

- **Catálogo de modelos**: `scripts/refresh-model-catalog.mjs` ejecuta
  `opencode models --refresh` y `opencode models <provider> --verbose --refresh`; el resultado se
  valida y se escribe en `src/core/model-catalog.json` solo con `--write`.
- **Sesiones y fallos**: `ancleto stats` lee la base de opencode (solo lectura) para reportar
  tokens, costo y fallos de tools.
- **MCP**: el servidor `ancleto-memory` se declara en la configuración del host; en opencode vive
  en `.opencode/opencode.json`/`.jsonc`.
- **Modelos por agente**: `opencode.json` declara `agent.<nombre>.model`; desde 0.40.1 es la
  quinta fuente declarada del guard de integridad.
- Evidencia: `scripts/refresh-model-catalog.mjs`, `src/cli/index.js`, `opencode.json`.

## jev-spec

- Binario externo opcional, pinneado por el release (`jev-spec@0.4.1`); se resuelve por `PATH` o
  `npx`.
- `ancleto judge` es **read-only y advisory**: no escribe archivos, no lee credenciales y no es
  gate de archive ni de conformidad.
- El argv es constante del release; no se pasan argumentos del usuario. El JSON del binario no se
  parsea: solo se consume su exit code y se transportan `stdout`/`stderr`.
- Estados: `skipped`, `unavailable`, `pass`, `fail`; `--require` solo aplica tras una sonda
  exitosa. `judge.enabled` es `false` por defecto.
- Evidencia: `src/core/judge.js`, `src/cli/index.js`.

## Git

- `machine-env.md` detecta shell, fin de línea y herramientas; escribe `.ancleto/machine-env.md`
  y lo excluye localmente vía `.git/info/exclude` (nunca toca `.gitignore`).
- La detección de EOL consulta atributos/config de git y cae a la convención de plataforma.
- La migración de `openspec/` legacy usa copia no destructiva.
- Evidencia: `src/core/machine-env.js`, `src/cli/index.js`.

## SQLite nativo

- `node:sqlite` con `journal_mode=WAL`, FTS5 y transacciones `DEFERRED`/`IMMEDIATE`.
- La base vive en `.ancleto/memory.db`; el snapshot usa `VACUUM INTO` sobre una conexión
  read-only.
- El score BM25 de FTS5 es la señal primaria del recall desde 0.41.0 (sin cambiar el esquema).
- Desde 0.42.0 el presupuesto del working-context es configuración (env/`.ancletorc`), no estado
  persistido: no agrega columnas, índices ni PRAGMAs.
- Evidencia: `src/core/memory/database.js`, `src/core/memory/snapshot.js`,
  `src/core/memory/engine.js`, `src/core/memory/working-context.js`.

## Publicación

- `.github/workflows/publish.yml` se dispara con tags `v*` (o manualmente).
- Pasos: `npm ci`, `npm run lint`, `node --test test/*.test.js`, `npm publish --access public`
  (omite si la versión ya existe), creación del Release y canary no bloqueante del tarball.
- Estado actual: `0.42.0` está **preparada, no publicada**. `package.json` declara la versión
  (commit `c316cf4`), pero `aspec/backlog.md` registra “sin tag ni run todavía” y no existe tag
  `v0.42.0` en el clon.
- Última release publicada: `0.41.0` — tag anotado `v0.41.0` sobre `5c171bc`, run `44781865327`
  exitoso y `latest` en npm.
- Variables: `NODE_AUTH_TOKEN` y `GITHUB_TOKEN`/`GH_TOKEN`; valores omitidos.
- Evidencia: `.github/workflows/publish.yml`, `package.json`, `aspec/backlog.md`.

## Hosts de agentes

Destinos nativos resueltos por un descriptor único (`src/cli/index.js`):

| Host | Agents | Commands | Skills | MCP de proyecto |
| --- | --- | --- | --- | --- |
| opencode | `.opencode/agents` | `.opencode/commands` | `.opencode/skills` | `.opencode/opencode.json[c]` |
| antigravity | `.agents/agents` | `.agents/skills/<n>/SKILL.md` | `.agents/skills` | `.agents/mcp_config.json` |
| commandcode | `.commandcode/agents` | `.commandcode/commands` | `.commandcode/skills` | `.mcp.json` |
| claude | `.claude/agents` | `.claude/commands` | `.claude/skills` | sin destino propio |
| vscode | `.github/agents` | `.github/prompts` | `.github/skills` | sin destino propio |
| copilot | `.github/prompts` | `.github/prompts` | no soportado | `copilot-mcp.json` |
| cursor / roo | solo skills | no soportado | `.cursor`/`.roo` | sin formato documentado |

La adaptación de frontmatter es passthrough para opencode y skills/commands; transforma agents
para antigravity y commandcode; elimina claves gestionadas para claude/vscode/copilot; y avisa sin
transformar para cursor/roo y hosts desconocidos. Evidencia:
`src/core/adapters/frontmatter.js`.
