---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-11-03T22:11:31Z
pluginVersion: 0.18.10
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Reglas estructurales (declaradas)

- **Cero dependencias de runtime**: `package.json` no tiene `dependencies`; solo `devDependencies`
  (`eslint`, `globals`). Agregar una dependencia de runtime rompe el contrato de distribución
  (`PRODUCT.md`).
- **Node ≥ 24**: obligatorio por `node:sqlite`; `ancleto doctor` bloquea con major menor
  (`src/cli/index.js`).
- **ESM puro**: `"type": "module"`; no hay TypeScript ni `tsconfig.json` pese a la mención genérica
  de `AGENTS.md` (`PRODUCT.md` lo aclara).
- **Un dueño por invariante**: la tabla de modelos y el resolver viven en
  `src/core/tier-models.js`; la adaptación de frontmatter, en `src/core/adapters/frontmatter.js`;
  la detección de entorno, en `src/core/machine-env.js`; el render del working-context, en
  `src/core/memory/working-context.js`.
- **Assets instalables = superficie de producto**: cambios en `agents/`, `commands/`, `skills/`,
  `templates/` o `profiles/` alteran lo que reciben todos los proyectos usuarios (`PRODUCT.md`).

## Modelos y tiers (estado 0.18.10)

### Tabla y cadenas

- `TIERS` conserva la forma **agente → string**; para los tiers con cadena, cada valor es la
  **cabeza** de su cadena. `TIERS.normal.reviewer = 'opencode-go/qwen3.8-max'`; el resto de
  `normal` sigue en `opencode-go` (`src/core/tier-models.js`).
- `TIER_CHAINS` se exporta desde el mismo módulo. `minimo` comparte una única cadena para los diez
  agentes: `commandcode/deepseek/deepseek-v4.1-flash` → `opencode-go/deepseek-v4.1-flash` →
  `opencode/deepseek-v4.1-flash-free`.
- `resolveTierModels(tier, catalog, …)` es **puro e inyectable** (recibe el catálogo). Devuelve
  `models`, `candidates` (todos los candidatos estáticos por agente) y `unresolved`. En modo
  estricto lanza error explícito si ningún candidato está disponible; `allowUnresolved` lo usa
  `check` para no abortar.
- **Contrato preservado**: `TIERS` no pasó a arrays porque `applyTier`, el oráculo, dos guards y el
  spec vigente dependen de la forma string. La cadena vive en `TIER_CHAINS`.

### Catálogo verificado

- `src/core/model-catalog.json` es un **snapshot commiteado** con `generated_at`, método
  (`opencode models <provider> --verbose`) y proveedores (`opencode-go`, `commandcode`, `opencode`).
- `scripts/refresh-model-catalog.mjs` lo refresca **manualmente**; nunca corre en CI ni en
  `install`/`check`. Si `opencode` falta, un proveedor falla o no se parsea ningún ID, aborta sin
  escribir un snapshot vacío.
- `loadModelCatalog` acepta la ruta por `ANCLETO_MODEL_CATALOG` (seam de test/manual); no consulta
  red ni ejecuta procesos.
- El guard estructural `test/agent-model-coherence.test.js` + `test/model-catalog.test.js` detecta
  IDs de `TIERS`, `agents/*.md` o `profiles/*/agents/*.md` ausentes del snapshot.

### `gratis` es free-only

- `gratis` = `opencode/big-pickle` (costo 0) para los diez agentes; `GRATIS_FALLBACK_MODEL` es la
  única fuente (`src/core/tier-models.js`).
- Un `gratisModel` persistido desconocido se **normaliza** al fallback en `install`/`update`/`init`/
  `import`; la clave solo se reescribe si ya existía en el manifiesto.
- **Eliminado**: `MUSE_SPARK_MODEL`, `detectMuseSpark()`, `envGratisModel()` y la rama
  `ANCLETO_MUSE_SPARK`. Los modelos `*-contributor` reales no son free tier (cuestan 0.1/0.2), por
  eso no se usan como `gratis`.

### Oráculo de `check`

- Solo aplica a mirrors de `opencode` (el único host que escribe `model:`).
- Para `minimo`, el **conjunto de aceptación** es la cadena estática completa, con el
  resuelto-ahora primero: un mirror escrito cuando el catálogo tenía otro candidato sigue siendo
  válido.
- Si el catálogo falta, es ilegible o `ANCLETO_MODEL_CATALOG` es inválido, `check` **no aborta**:
  acepta los candidatos estáticos y emite un aviso no bloqueante
  (`no se pudo verificar el catálogo…`). `install`/`init`/`import` sí fallan con error.
- El aviso de deriva de tier se dispara si el mirror difiere del resuelto-ahora **o** si el
  resuelto-ahora difiere de la fuente esperada (ambas direcciones).

### `import` y `hosts`

- `ancleto import` **lee y resuelve antes del primer write**: un catálogo inválido no deja un import
  a medio aplicar.
- Escribe `.opencode/.ancleto-tier` con el tier del bundle (paridad con `init`), porque `check` lee
  ese archivo como oráculo. Sin escribirlo, un import sobre un proyecto inicializado dejaba el tier
  viejo y producía divergencias falsas.
- El tier solo se aplica/resuelve en mirrors de `opencode`; en otros hosts no se resuelve ni se
  aborta.

### Superficies del `model:` (nota operativa)

`AGENTS.md` describe tres superficies: `agents/*.md` (canónica publicada), `.opencode/agents/*.md`
(mirror que regenera `ancleto upgrade`) y `~/.config/opencode/agents/*.md` (instalación global).
`opencode.json` → `agent.<nombre>.model` aplica al agente primario, no a los subagentes. El default
publicado de los agentes es `commandcode/deepseek/deepseek-v4.1-flash`; el tier que aplica `install`
sin `--tier` es `normal`.

## Memoria persistente

- **Ubicación**: `.ancleto/memory.db` (SQLite + FTS5). No sale del repositorio.
- **Identidad**: `memory_key` es la clave transversal; el `recordNode` supersede sin filtrar por
  `type`/`scope`.
- **Escritura**: toda escritura pasa por `recordNode`; valida refs `spec:`/`change:`/`path:` y
  rechaza secretos de forma incondicional. La única exención de refs es la procedencia `runtime`.
- **Procedencia (`source`)**: la resuelve el runtime (`context.source`), nunca el caller; valores
  `mcp:ancleto-memory`, `cli:import`, `runtime`, `agent:<rol>`.
- **Recall**: orden total determinístico (requerido → anclaje declarado → scope → bm25 → `memory_key`);
  preview por defecto (≤240 caracteres, `limit` 5, `content_truncated`), `expand: true` devuelve el
  payload completo y `keys` expande claves presentes en la página. `required` es entrada de llamada
  (no estado persistido); si no entra en el `limit`/presupuesto, falla.
- **Working-context**: `.ancleto/working-context.md` se renderiza desde el engine vivo o desde la
  topología en día-cero; el refresh on-write es compare-based y no crea archivos vacíos.
- **Ops read-only por defecto**: `memory doctor`, `memory curate`, `memory list` y
  `memory consolidate` (sin `--apply`) no migran ni escriben. `snapshot` usa conexión read-only y
  `VACUUM INTO`, con reemplazo seguro en Windows.

## Discovery y seed

- **Estado del seed**: `READY` si el hash de fuentes coincide con `.discovery-state.json`; `STALE`
  con `impact: material|minor`; `PARTIAL`/`MISSING` por documentos faltantes.
- **Área**: directorio de primer nivel; los archivos raíz son su propia área. `seed-map.json` mapea
  documento → áreas y permite calcular `affectedDocs`.
- **Materialidad**: `package.json`, `tsconfig*`, configs de bundlers, `Dockerfile`, `index.html`,
  `src/(main|index).*` y la aparición/desaparición de áreas raíz fuerzan `impact: material`.
- **Exclusiones**: `node_modules`, `.git`, `dist` siempre; el `outputDir` del seed se excluye del
  hash. El tier `minimo` agrega `test/**`, `docs/**` y `**/*.md` al pack.
- **Presupuesto**: `gratis` limita a 50.000 tokens; `normal`/`minimo` sin presupuesto fijo. El pack
  que excede el budget aborta.

## Riesgos y deuda observada

- **Snapshot del catálogo envejece**: es estático; si un proveedor retira un ID, `install` falla
  recién en `ancleto` (no en el host). Mitigación: refresco manual + guard de tests.
- **Costo de `reviewer`**: `qwen3.8-max` (2/6) es más caro que `qwen3.8-flash`; es el tradeoff
  aceptado para `normal` (el tier de modelos más capaces).
- **Deriva de manifiesto**: `.ancletorc` declara `version: 0.18.8` y `package.json` `0.18.10`; no se
  reescribió en el release. No bloquea el CLI, pero cualquier `check`/diagnóstico que compare
  versiones puede reportar deriva.
- **`scripts/` no se publica**: `package.json` → `files` no incluye `scripts/`, así que el refresco
  del catálogo solo existe en el repo fuente, no en el tarball npm.
- **Doble fuente de tier por host**: solo `opencode` materializa `model:`; otros hosts lo dropean
  (claude/vscode/copilot/commandcode) o emiten `model: inherit` (antigravity). Resolver el catálogo
  ahí no tendría efecto.
- **Docs legados**: `documentation/` es material lnx-cli gitignored, no runtime; `docs/` contiene
  documentación del framework y el seed.

## Reglas de proceso

- **Commits**: Conventional Commits; no directo a `main`/`master` (`AGENTS.md`).
- **Validaciones**: solo lo declarado en `PRODUCT.md`; omitir y registrar lo no declarado.
- **Frescura del seed al archivar**: `STALE` material requiere aprobación explícita del usuario;
  `minor` se anota y continúa (`AGENTS.md`).
- **Memoria vs agente**: reglas/decisiones del repo → `.ancleto/memory.db`; notas de sesión →
  memoria del agente. Una entrada vive en una sola (`AGENTS.md`).
- **Secretos**: nunca copiar valores; nombrar la variable o archivo y omitir el valor.
