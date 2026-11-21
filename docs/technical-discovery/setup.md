---
node: setup
kind: setup
read_when: "preparar el entorno o ejecutar los comandos principales"
generatedAt: 2026-11-21T05:55:56.128Z
pluginVersion: 0.43.1
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
| Matriz de hosts (offline) | `node --test test/host-matrix.test.js` (incluida en `npm test`) | `test/host-matrix.test.js` |
| CLI local | `node src/cli/index.js <comando>` | `PRODUCT.md` |
| CLI instalada | `ancleto <comando>` o `aspec <comando>` | `package.json` → `bin` |
| Refrescar catálogo de modelos | `node scripts/refresh-model-catalog.mjs` | `scripts/refresh-model-catalog.mjs` |
| Publicar (CI) | tag `v*` → `npm ci` + lint + tests + `npm publish` | `.github/workflows/publish.yml` |

Regla del repositorio: **toda corrida de CLI usa `node src/cli/index.js ...`**. El binario del
PATH puede estar rezagado respecto del código local.

`npm run test:affected` usa el affected-set y el manifiesto `test/affected-tests.json`. Desde
0.43.1, cambios en `src/cli/**`, `commands/**` o `templates/**` seleccionan
`test/host-matrix.test.js`, porque la matriz lee assets como texto sin importarlos.

## Subcomandos

`init`, `install`, `update`, `upgrade`, `discovery`, `mcp`, `memory`, `specs`, `stats`,
`projects`, `check`, `doctor`, `judge`, `list` (`PRODUCT.md`, `src/cli/index.js`).

### Superficies de memoria

| Subcomando | Escritura | Nota |
| --- | --- | --- |
| `memory context` | No | Renderiza topología/reglas con el presupuesto resuelto; sin base cae a día-cero |
| `memory list` | No | Lista nodos activos |
| `memory search` | No | Búsqueda FTS5; desde 0.41.0 orden BM25-first con preview/expand/keys/required |
| `memory export` | No | Exporta nodos activos saneados |
| `memory import` | Sí | `--dry-run` clasifica sin escribir; desde 0.43.0 el CLI pre-valida el archivo antes de abrir la base |
| `memory status` | No | Estado advisory del gap de memoria |
| `memory doctor` | No (salvo `--rebuild`) | Cinco checks de integridad + frescura advisory del working-context |
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
| `ANCLETO_WORKING_CONTEXT_TOKENS` | Override del presupuesto del working-context (entero, `0` o `"unlimited"`) | `src/core/memory/working-context.js` |
| `ANCLETO_MODEL_CATALOG` | Ruta alternativa al snapshot de catálogo (seam de test/manual) | `src/core/tier-models.js` |
| `ANCLETO_PROJECTS_FILE` | Ruta alternativa al registro global de proyectos | `src/cli/index.js` |
| `NODE_AUTH_TOKEN` | Token de publicación npm en CI | `.github/workflows/publish.yml` |
| `GITHUB_TOKEN` / `GH_TOKEN` | Creación del Release en CI | `.github/workflows/publish.yml` |
| `NO_COLOR` | Desactiva color en la salida | `src/cli/index.js` |

## Presupuesto del working-context (0.42.0)

Precedencia: `ANCLETO_WORKING_CONTEXT_TOKENS` (si está definida y no vacía) →
`memory.maxTokens` de `.ancletorc` → default **4000 tokens** (`maxChars = maxTokens × 4` =
16.000 caracteres). Gramática: entero positivo, `0` o `"unlimited"`. Todo valor inválido, ausente
o de tipo inesperado resuelve al default sin lanzar. Un env definido e inválido resuelve al
default y **no** cae a `.ancletorc`. `0`/`"unlimited"` desactivan el tope (todas las reglas del
scope, sin aviso de overflow). Evidencia: `src/core/memory/working-context.js`,
`src/core/memory/engine.js`.

## Contrato de `memory import` (0.43.0)

El archivo JSON se valida completo antes de escribir: `memory_key`, `type`, `content`, `scope` y
`createdAt` son obligatorios; `type` es `rule` o `decision`; `createdAt` debe parsear como fecha; y
`scope` debe ser un **string con `trim()` no vacío** (no se acepta número, booleano, objeto, array
ni string de espacios). Un archivo inválido rechaza el batch entero en el dry-run y en la
escritura, con `entry[i].scope invalido`; el CLI reporta `ancleto: import invalido: …` antes de
abrir (y crear) la base. Evidencia: `src/core/memory/engine.js` (`validateImportEntries`),
`src/cli/index.js` (`memoryImport`).

## Artefactos y estado local

| Artefacto | Productor | ¿Versionado? |
| --- | --- | --- |
| `.ancletorc` | `init`/`install`/`update` | Local (gitignored) |
| `.opencode/` y mirrors por host | `install`/`upgrade`/`import` | Local (gitignored) |
| `.ancleto/machine-env.md` | `init`/`install`/`upgrade` | Local, excluido vía `.git/info/exclude` |
| `.ancleto/memory.db` | Tools MCP y `memory *` | Local (no se comparte por git) |
| `.ancleto/working-context.md` | Refresh de lifecycle/memoria y `memory context` | Local |
| `.discovery-map.json` | `discovery` | Versionado |
| `docs/technical-discovery/**` | Skill de discovery | Versionado |
| `docs/baseline/**` | Cierre CH-00 (baseline read-only) | Versionado |
| `aspec/changes/**`, `aspec/specs/**`, `aspec/backlog.md` | Ciclo `/cleto-*` y cierre de release | Versionado |

## Convenciones operativas

- **Tiers**: `normal`, `minimo`, `gratis`; se persisten en el manifiesto y se aplican solo a los
  mirrors de `opencode` (los demás hosts eliminan o heredan `model:`).
- **Plantillas**: los bloques `LOCKED` de `AGENTS.md`/`PRODUCT.md` se mergean; el resto del
  contenido local se preserva.
- **Memoria**: reglas y decisiones del proyecto van a `.ancleto/memory.db`; notas de sesión del
  agente no se mezclan (ver `AGENTS.md`).
- **Recall**: `searchMemory` ordena `required` → BM25 → anclaje → scope → `memory_key`; el
  fallback tolerante (OR con prefijos) solo corre si el intento preciso (AND) no devuelve nada.
- **Presupuesto**: la configuración es tolerante y nunca impide el render; un cambio de env o de
  `.ancletorc` puede dejar el working-context marcado como `desactualizado` hasta el próximo
  refresh (no hay lógica de invalidación).
- **Matriz de hosts**: la verificación es offline y determinista; no requiere host real, binario
  de host ni red (`test/host-matrix.test.js`).
- **Validaciones declarativas**: solo se ejecuta lo declarado en `PRODUCT.md` → `## Project
  Commands`; lo no declarado se omite y se registra.
- **Secretos**: nunca copiar valores de `.ancletorc`, `opencode.json`, CI o Azure; nombrar la
  variable o el archivo y omitir el valor.
- **Release**: `0.43.1` está **preparada, sin push** (tag anotado local `v0.43.1` → `7758d46`, sin
  run registrado); la última publicada y verificada es `0.43.0` (tag `v0.43.0` → `9a7220c`, run
  `44827344442`, npm `latest`).
