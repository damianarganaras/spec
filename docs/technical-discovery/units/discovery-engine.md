---
node: units/discovery-engine
kind: dossier
read_when: "cómo se genera el mapa topológico, el pack Repomix, el impacto del seed, el affected-set por grafo de imports y el presupuesto por tier"
covers: [topologia, empaquetado, tiers, tokens, affected-set, estado del seed]
sources: ["src/core/discovery.js", "src/core/repomix-tier.js", "src/core/tier-models.js", "src/core/affected-set.js"]
generatedAt: 2026-10-30T19:54:29Z
pluginVersion: 0.17.0
skillVersion: '2.3'
---

# Unidad: discovery, affected-set y tiers

## Propósito

Relevar el repositorio, empaquetar contexto con costo controlado y computar el scope afectado por
grafo de imports. Cuatro piezas: topología (`discovery.js`), traducción tier→Repomix
(`repomix-tier.js`), selección de modelos por tier (`tier-models.js`) y affected-set
(`affected-set.js`). Evidencia: `README.md`, firmas del pack,
`aspec/specs/prompt-contracts/spec.md`.

## Recorrido relevante

1. `buildTopologyMap(rootDir)` recorre la raíz y produce el árbol/totales.
2. `ancleto discovery --check` (state-only) compara hashes y clasifica `impact`.
3. `ancleto discovery [--compress]` genera el pack Repomix con los ignores del tier.
4. La skill `ancleto-technical-discovery` redacta el seed a partir del pack.
5. `ancleto affected <archivo...>` computa el affected-set (read-only) para el scope de review.

## Topología — `src/core/discovery.js`

- `buildTopologyMap(rootDir)`: recorre la raíz ignorando `node_modules`, `.git`, `.ancleto`,
  `dist`, `build`, `coverage` (`TOPOLOGY_IGNORED_DIRS`); produce `last_updated`,
  `total_files`, `tree_summary` (conteo por directorio de primer nivel) y `root_files`.
- `writeDiscoveryMap(rootDir)`: escribe `.discovery-map.json` en la raíz del repo.
- `readTopologySummary(cwd)`: valida y lee el resumen para inyectarlo en el working context.
- El mapa se regenera al correr `ancleto discovery` (no en `--check`). En esta corrida:
  `total_files: 715` (`last_updated: 2026-10-30T19:34:41.228Z`); `tree_summary` incluye
  `documentation` 340 y `audit logs` 9 porque el mapa recorre el disco y no aplica `.gitignore`.
  El `total_files` **no** coincide con el número de archivos del pack: el mapa cuenta el disco
  y el pack aplica los ignores del tier y `.gitignore`.

## Empaquetado — `src/core/repomix-tier.js`

- `TIER_PACK_CONFIG`: `normal` (sin ignores extra, sin compresión, sin budget), `minimo`
  (+`test/**`, `docs/**`, `**/*.md`; `--compress`; **sin** token budget), `gratis` (igual que
  `minimo` + budget 50000).
- `readProjectTier(cwd)`: lee `.ancleto-tier` en la raíz o en `.opencode/`; default `gratis`.
  En este checkout existe `.opencode/.ancleto-tier` con valor **`minimo`**, por lo que el tier
  resuelto es `minimo` y el pack de esta corrida quedó en **703 archivos / ~17.319 tokens**
  (sin budget que lo limite). El conteo de tokens depende de la compresión efectiva de Repomix
  y **no es comparable entre corridas**.
- `buildRepomixArgs(flags, tier, exclude)`: fusiona `exclude` (`.ancletorc`) + ignores del tier
  + `--ignore` del usuario, y agrega `--compress` si el tier o el flag lo piden. No permite
  reemplazar los ignores por un `--ignore` vacío.
- `tierTokenBudget(tier)`: budget de tokens; solo `gratis` devuelve 50000. El CLI falla si el
  pack supera el budget del tier resuelto.

## Modelos por tier — `src/core/tier-models.js`

- `tierModels(tier, tiers, gratisOverride)`, `gratisModel(persisted)`, `envGratisModel()`,
  `isKnownGratisModel(model)`, `detectMuseSpark()`.
- Tier `gratis`: prefiere Muse Spark 1.3 Free (`opencode/muse-spark-1.3-contributor-free`) si
  la cuenta lo habilita; si no, `opencode/big-pickle`. `ANCLETO_MUSE_SPARK=1|0` fuerza la
  elección y tiene prioridad sobre lo persistido en `.ancletorc`.
- Tier `minimo`: un único modelo `opencode-go/deepseek-v4.1-flash` para los 10 agents. El
  checkout además tiene `opencode.json` en la raíz, que overridea el modelo de 9 subagentes
  del host opencode a `commandcode/deepseek/deepseek-v4.1-flash`; ese archivo no se publica.

## Affected-set por grafo de imports — `src/core/affected-set.js`

Módulo **zero-dep** y **determinista** (`throughput-pipeline`). Define el scope de review y el
objetivo de verificación del tester.

- `buildImportGraph(rootDir, ignored)`: recorre los archivos fuente (`.js/.mjs/.cjs/.ts/.tsx`,
  `collectSourceFiles` con los mismos ignores del discovery map), extrae especificadores
  (`extractSpecifiers`) y construye aristas `src → deps` por resolución de relativos
  (`resolveRelative`). Devuelve `{ edges, sources, unresolved, externalCount }`.
- `computeAffectedSet({ rootDir, seeds, ignored })`: devuelve `{ seeds, affected, unresolved,
  externalCount }`; `affected` es la **clausura transitiva de dependientes** sobre el grafo más
  las semillas (incluye siempre los archivos tocados, aunque no sean nodos). Ordenado y
  determinístico.
- **Cobertura**: formas estáticas `import`, `import … from`, `export … from` y las llamadas
  `require(...)` / `import(...)` con **literal puro** (string o template sin `${}`). Los ignores
  son los del proyecto (`TOPOLOGY_IGNORED_DIRS`).
- **Taxonomía cerrada (4 categorías)**: (1) **relativo resoluble** → arista; (2) **no relativo**
  (paquete npm, builtin, **alias de paths**) → `externalCount`, sin arista ni `unresolved`;
  (3) llamada `import(...)`/`require(...)` con **argumento no literal** → `unresolved`;
  (4) **relativo irresoluble** → `unresolved`.
- **Clasificador conservador por argumento**: solo un literal puro —tras espacios y
  comentarios— seguido de `)` es estático; cualquier otro argumento cae en `unresolved`. Solo se
  escanean las formas `import(`/`require(`; `import.meta`, el `import` estático y
  `require.resolve(` se ignoran; el acceso por miembro `obj.require(…)` se matchea léxicamente
  (sobre-inclusión conservadora, dirección segura).
- **`externalCount`** es **dato informativo** —conteo de **ocurrencias** de specifiers no
  relativos, no de specifiers distintos—, no warning ni error.
- **Superficie read-only**: subcomando `ancleto affected [--cwd <dir>] [--json] <archivo...>`
  (`affectedCommand` en `src/cli/index.js`). En `--json` expone `seeds` **normalizadas**
  (relativas-posix) y `externalCount`; en salida humana lista `affected` por stdout y reporta
  inconclusos/externos por stderr (omite la línea de externos si es 0). No escribe nada.
- **Prioridad**: si `PRODUCT.md` → `## Project Commands` declara un mecanismo/comando de
  afectados, el pipeline usa ese en lugar del grafo propio (la resolución de **alias** queda
  delegada a ese mecanismo).

## Flujo del estado del seed (`--check`)

1. `presentDocs` verifica los 8 documentos esperados (`EXPECTED_DOCS`) → `MISSING`/`PARTIAL`.
2. `computeSources` + `hashSources` recorren los fuentes aplicando `DEFAULT_IGNORES`
   (`node_modules`, `.git`, `dist`) y el propio `outputDir`; el hash encadena
   `rel \0 longitud \0 contenido \n` por archivo ordenado.
3. Si hay estado previo, `computeImpact` compara por archivo y por área (primer nivel) y
   clasifica `impact`: `material` si cambió un archivo material (`package.json`, configs de
   runtime, `index.html`, `src/main|index.*`), apareció/desapareció un área raíz o un archivo
   material; si no, `minor`; si no hay cambios atribuibles, `none`. **La detección es por
   lista de archivos, no por contrato.** En esta corrida el reporte fue `STALE` / `minor`
   (`changedAreas: [".ancleto", "aspec"]`, `materialReasons: []`, 11 `affectedDocs`); la causa es
   el archive del retiro de `design.md`/`context.md`, que movió su carpeta de `aspec/changes/` y
   mergeó el delta en `aspec/specs/`.
4. `readSeedMap` + `affectedDocsFor` cruzan áreas cambiadas con `seed-map.json` para acotar la
   regeneración a `affectedDocs` (documentos del **seed**; no confundir con el `affected-set`
   del change). Sin `seed-map.json` la regeneración es completa.
5. El pack (`--compress`) escribe estado en `docs/technical-discovery/.discovery-state.json`
   (sources, fileHashes, hash global, `packTokens`); el seed lo redacta la skill.

## Reglas, contratos y riesgos

- `--check` no empaqueta: es state-only sobre hashes.
- El pack comprimido solo expone firmas (no cuerpos), lo que limita la evidencia de `src/**`.
- El tier decide también qué markdown/test queda fuera del pack; el seed debe anotarlo.
- `minimo` **no** tiene token budget: un repo grande puede producir un pack grande sin fallo.
- **`computeSources` no aplica `.gitignore`**: solo `DEFAULT_IGNORES` + `config.exclude`. Por eso
  `documentation/` (gitignored) y `audit logs/` (untracked) pueden aparecer como áreas nuevas y
  `package-lock.json` puede figurar como "área eliminada" cuando en realidad está excluido por
  `config.exclude`. Son falsos positivos del check, no cambios del producto.
- **El affected-set es acotado por diseño**: los imports dinámicos no escaneados y los alias
  quedan delegados al mecanismo declarado por el proyecto; el helper no promete universalidad.
- `optimizacion-de-tokens.md` señala que `impact` se deriva por **archivo/área**, no por
  **contrato**: puede dar falsos positivos/negativos.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/discovery.js` | Mapa topológico (`buildTopologyMap`, `writeDiscoveryMap`, `readTopologySummary`). |
| `src/core/affected-set.js` | Grafo de imports y `computeAffectedSet` (`buildImportGraph`, `extractSpecifiers`, `collectSourceFiles`). |
| `src/core/repomix-tier.js` | Args de Repomix, ignores y budget por tier (`TIER_PACK_CONFIG`, `readProjectTier`, `buildRepomixArgs`, `tierTokenBudget`). |
| `src/core/tier-models.js` | Modelos por tier y resolución gratis. |
| `opencode.json` | Override local de `agent.model` para 9 subagentes; fuera del paquete publicado. |
| `src/cli/index.js` | `checkDiscovery`, `runRepomix`, `packDiscovery`, `affectedCommand`, `computeSources`, `computeImpact`, `readSeedMap`, `affectedDocsFor`. |
| `.discovery-map.json` | Mapa topológico regenerado por la corrida del pack (715 archivos). |
| `docs/technical-discovery/.discovery-state.json` | Estado de hashes y `packTokens` que consume `--check`. |
| `docs/technical-discovery/seed-map.json` | Documento del seed → áreas de evidencia (lo escribe la skill). |
| `aspec/specs/prompt-contracts/spec.md` | Contrato del affected-set y taxonomía de 4 categorías. |
| `test/discovery-topology.test.js`, `test/discovery-tier.test.js`, `test/tier-models.test.js`, `test/affected-set.test.js` | Guardas de topología, tiers, modelos y affected-set (incl. superficie CLI read-only). |
