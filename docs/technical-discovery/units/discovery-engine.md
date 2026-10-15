---
node: units/discovery-engine
kind: dossier
read_when: "cómo se genera el mapa topológico, el pack Repomix, el impacto del seed, el affected-set por grafo de imports y el presupuesto por tier"
covers: [topologia, empaquetado, tiers, tokens, affected-set]
sources: ["src/core/discovery.js", "src/core/repomix-tier.js", "src/core/tier-models.js", "src/core/affected-set.js"]
sourcesSha: 121b7ff04478f797f0c91ceb0f7831ce0e2e816ea7731a00fdec2bc97b4dc2df
generatedAt: 2026-10-15T17:14:12Z
pluginVersion: 0.13.1
skillVersion: '2.3'
---

# Unidad: discovery, affected-set y tiers

## Propósito

Relevar el repositorio, empaquetar contexto con costo controlado y computar el scope afectado por
grafo de imports. Cuatro piezas: topología (`discovery.js`), traducción tier→Repomix
(`repomix-tier.js`), selección de modelos por tier (`tier-models.js`) y affected-set
(`affected-set.js`). Evidencia: `README.md`, firmas del pack, `aspec/specs/prompt-contracts/spec.md`.

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
- El mapa se regenera al correr `ancleto discovery` (no en `--check`).

## Empaquetado — `src/core/repomix-tier.js`

- `TIER_PACK_CONFIG`: `normal` (sin ignores extra, sin compresión, sin budget), `minimo`
  (+`test/**`, `docs/**`, `**/*.md`; `--compress`), `gratis` (igual que `minimo` + budget 50000).
- `readProjectTier(cwd)`: lee `.ancleto-tier` en la raíz o en `.opencode/`; default `gratis`.
  En este checkout existe `.opencode/.ancleto-tier` con valor `minimo`, por lo que el tier
  resuelto es `minimo` por archivo. `normal` no comprime; `minimo` y `gratis` comparten los
  ignores (tests/docs/markdown), y solo `gratis` fija budget (50k).
- `buildRepomixArgs(flags, tier, exclude)`: fusiona `exclude` (`.ancletorc`) + ignores del tier
  + `--ignore` del usuario, y agrega `--compress` si el tier o el flag lo piden. No permite
  reemplazar los ignores por un `--ignore` vacío.
- `tierTokenBudget(tier)`: budget de tokens; el CLI falla si el pack lo supera.

## Modelos por tier — `src/core/tier-models.js`

- `tierModels(tier, tiers, gratisOverride)`, `gratisModel(persisted)`, `envGratisModel()`,
  `isKnownGratisModel(model)`, `detectMuseSpark()`.
- Tier `gratis`: prefiere Muse Spark 1.3 Free (`opencode/muse-spark-1.3-contributor-free`) si
  la cuenta lo habilita; si no, `opencode/big-pickle`. `ANCLETO_MUSE_SPARK=1|0` fuerza la
  elección y tiene prioridad sobre lo persistido en `.ancletorc`.
- Tier `minimo`: un único modelo `opencode-go/deepseek-v4.1-flash` para los 10 agents.

## Affected-set por grafo de imports — `src/core/affected-set.js`

Módulo **zero-dep** y **determinista** (change archivado `throughput-pipeline`). Define el scope
de review y el objetivo de verificación del tester.

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
- **Taxonomía cerrada (4 categorías, mutuamente excluyentes y colectivamente exhaustivas)**:
  (1) **relativo resoluble** → arista; (2) **no relativo** (paquete npm, builtin, **alias de
  paths**) → `externalCount`, sin arista ni `unresolved`; (3) llamada `import(...)`/`require(...)`
  con **argumento no literal** → `unresolved`; (4) **relativo irresoluble** → `unresolved`.
- **Clasificador conservador por argumento (no por contenido)**: solo un literal puro —tras
  espacios y comentarios— seguido de `)` es estático; cualquier otro argumento (expresión pelada,
  `'./x' + y`, template con `${}`, paréntesis) cae en `unresolved`. Ante la duda, reporta
  `unresolved`, nunca en silencio. Solo se escanean las formas `import(`/`require(`;
  `import.meta`, el `import` estático y `require.resolve(` se ignoran; el acceso por miembro
  `obj.require(…)` se matchea léxicamente (sobre-inclusión conservadora, dirección segura).
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
   material; si no, `minor`; si no hay cambios atribuibles, `none`.
4. `readSeedMap` + `affectedDocsFor` cruzan áreas cambiadas con `seed-map.json` para acotar la
   regeneración a `affectedDocs` (documentos del **seed**; no confundir con el `affected-set`
   del change).
5. El pack (`--compress`) escribe estado en `docs/technical-discovery/.discovery-state.json`
   (sources, fileHashes, hash global, `packTokens`); el seed lo redacta la skill.

## Reglas, contratos y riesgos

- `--check` no empaqueta: es state-only sobre hashes.
- El pack comprimido solo expone firmas (no cuerpos), lo que limita la evidencia de `src/**`.
- El tier decide también qué markdown/test queda fuera del pack; el seed debe anotarlo.
- **El affected-set es acotado por diseño**: los imports dinámicos no escaneados y los alias
  quedan delegados al mecanismo declarado por el proyecto; el helper no promete universalidad.
- `optimizacion-de-tokens.md` señala que `impact` se deriva por **archivo/área**, no por
  **contrato** (deuda B6 en `BACKLOG.md`): puede dar falsos positivos/negativos.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/discovery.js` | Mapa topológico (`buildTopologyMap`, `writeDiscoveryMap`). |
| `src/core/affected-set.js` | Grafo de imports y `computeAffectedSet` (`buildImportGraph`, `extractSpecifiers`, `collectSourceFiles`). |
| `src/core/repomix-tier.js` | Args de Repomix y budget por tier. |
| `src/core/tier-models.js` | Modelos por tier y resolución gratis. |
| `src/cli/index.js` | `checkDiscovery`, `runRepomix`, `packDiscovery`, `affectedCommand`. |
| `aspec/specs/prompt-contracts/spec.md` | Contrato del affected-set y taxonomía de 4 categorías. |
| `test/discovery-topology.test.js`, `test/discovery-tier.test.js`, `test/tier-models.test.js`, `test/affected-set.test.js` | Guardas de topología, tiers, modelos y affected-set (incl. superficie CLI read-only). |
