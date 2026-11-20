---
node: setup
kind: setup
read_when: "preparar el entorno o ejecutar los comandos principales"
generatedAt: 2026-11-20T01:12:16.920Z
pluginVersion: 0.40.1
skillVersion: '2.3'
---

# Setup

## Requisitos

| Requisito | Valor | Evidencia |
| --- | --- | --- |
| Node.js | `>=24.0.0` (obligatorio) | `package.json` → `engines.node` |
| Módulo nativo | `node:sqlite` (memoria) | `src/core/memory/database.js` |
| Gestor de paquetes | `npm` (CI usa `npm ci`) | `.github/workflows/publish.yml` |
| Git | Requerido por instalación, `machine-env.md` y publish | `src/core/machine-env.js` |
| Repomix | Opcional y on-demand para `discovery --compress` | `src/cli/index.js` |
| `opencode` | Opcional; solo para refrescar el catálogo y leer sesiones en `stats` | `scripts/refresh-model-catalog.mjs`, `src/cli/index.js` |

## Comandos principales

| Objetivo | Comando | Fuente |
| --- | --- | --- |
| Lint | `npm run lint` | `package.json` |
| Tests | `npm test` | `package.json` |
| Tests afectados | `npm run test:affected` | `package.json`, `scripts/test-affected.mjs` |
| CLI local | `node src/cli/index.js <comando>` | `PRODUCT.md` |
| CLI instalada | `ancleto <comando>` o `aspec <comando>` | `package.json` → `bin` |
| Refrescar catálogo de modelos | `node scripts/refresh-model-catalog.mjs` | `scripts/refresh-model-catalog.mjs` |
| Publicar (CI) | tag `v*` → `npm ci` + lint + tests + `npm publish` | `.github/workflows/publish.yml` |

Regla del repositorio: **toda corrida de CLI usa `node src/cli/index.js ...`**. El binario del
PATH puede estar rezagado respecto del código local.

## Subcomandos

`init`, `install`, `update`, `upgrade`, `discovery`, `mcp`, `memory`, `specs`, `stats`,
`projects`, `check`, `doctor`, `judge`, `list` (`PRODUCT.md`, `src/cli/index.js`).

### Superficies de memoria

| Subcomando | Escritura | Nota |
| --- | --- | --- |
| `memory context` | No | Renderiza topología/reglas; sin base cae a día-cero |
| `memory list` | No | Lista nodos activos |
| `memory search` | No | Búsqueda FTS5 con preview/expand/keys/required |
| `memory export` | No | Exporta nodos activos saneados |
| `memory import` | Sí | `--dry-run` clasifica sin escribir |
| `memory status` | No | Estado advisory del gap de memoria |
| `memory doctor` | No (salvo `--rebuild`) | Cinco checks de integridad |
| `memory gc` | Sí (salvo `--dry-run`) | Purga superseded por antigüedad |
| `memory snapshot` | Sí | Copia consistente vía `VACUUM INTO` |
| `memory merge` | Solo con `--apply` | Dry-run default; puerta de criticidad |
| `memory consolidate` | Solo con `--apply` | Dry-run default; duplicados exactos |
| `memory curate` | No | Curaduría read-only; `--strict` cambia exit |
| `memory repair refs` | Solo con `--apply` | Dry-run default; allowlist `inexistente` |

## Variables de entorno

Solo se nombran; **los valores se omiten**.

| Variable | Uso | Evidencia |
| --- | --- | --- |
| `ANCLETO_MODEL_CATALOG` | Ruta alternativa al snapshot de catálogo (seam de test/manual) | `src/core/tier-models.js` |
| `ANCLETO_PROJECTS_FILE` | Ruta alternativa al registro global de proyectos | `src/cli/index.js` |
| `NODE_AUTH_TOKEN` | Token de publicación npm en CI | `.github/workflows/publish.yml` |
| `GITHUB_TOKEN` / `GH_TOKEN` | Creación del Release en CI | `.github/workflows/publish.yml` |
| `NO_COLOR` | Desactiva color en la salida | `src/cli/index.js` |

## Artefactos y estado local

| Artefacto | Productor | ¿Versionado? |
| --- | --- | --- |
| `.ancletorc` | `init`/`install`/`update` | Local (gitignored) |
| `.opencode/` y mirrors por host | `install`/`upgrade`/`import` | Local (gitignored) |
| `.ancleto/machine-env.md` | `init`/`install`/`upgrade` | Local, excluido vía `.git/info/exclude` |
| `.ancleto/memory.db` | Tools MCP y `memory *` | Local (no se comparte por git) |
| `.ancleto/working-context.md` | Refresh de lifecycle/memoria | Local |
| `.discovery-map.json` | `discovery` | Versionado |
| `docs/technical-discovery/**` | Skill de discovery | Versionado |
| `aspec/changes/**`, `aspec/specs/**` | Ciclo `/cleto-*` | Versionado |

## Convenciones operativas

- **Tiers**: `normal`, `minimo`, `gratis`; se persisten en el manifiesto y se aplican solo a los
  mirrors de `opencode` (los demás hosts eliminan o heredan `model:`).
- **Plantillas**: los bloques `LOCKED` de `AGENTS.md`/`PRODUCT.md` se mergean; el resto del
  contenido local se preserva.
- **Memoria**: reglas y decisiones del proyecto van a `.ancleto/memory.db`; notas de sesión del
  agente no se mezclan (ver `AGENTS.md`).
- **Validaciones declarativas**: solo se ejecuta lo declarado en `PRODUCT.md` → `## Project
  Commands`; lo no declarado se omite y se registra.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, CI o Azure; nombrar la
  variable o el archivo y omitir el valor.
