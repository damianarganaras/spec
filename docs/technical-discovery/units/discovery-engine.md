---
node: units/discovery-engine
kind: dossier
read_when: "cómo se genera el mapa topológico, el pack Repomix y el presupuesto por tier"
sources: ["src/core/discovery.js", "src/core/repomix-tier.js", "src/core/tier-models.js"]
sourcesSha: 890886ffbbacbdaf0fd546cdd2c9aafb323fb339ce49658d7ecef3b177e7d4f4
generatedAt: 2026-09-25T14:03:34Z
pluginVersion: 0.6.37
skillVersion: '2.3'
---

# Unidad: discovery y tiers

## Responsabilidad

Relevar el repositorio y empaquetar contexto con costo controlado. Tres piezas:
topología (`discovery.js`), traducción tier→Repomix (`repomix-tier.js`) y selección de
modelos por tier (`tier-models.js`). Evidencia: `README.md`, firmas del pack.

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

## Flujo del estado del seed (`--check`)

1. `presentDocs` verifica los 8 documentos esperados → `MISSING`/`PARTIAL`.
2. `computeSources` + `hashSources` recorren los fuentes aplicando `discovery.exclude`,
   `DEFAULT_IGNORES` y el propio `outputDir`.
3. Si hay estado previo, `computeImpact` compara por archivo y por área (primer nivel) y
   clasifica `impact`: `material` si cambió un archivo material (`package.json`, configs de
   runtime, `index.html`, `src/main|index.*`) o apareció/desapareció un área raíz; si no,
   `minor`; si no hay cambios atribuibles, `none`.
4. `readSeedMap` + `affectedDocsFor` cruzan áreas cambiadas con `seed-map.json` para acotar la
   regeneración a `affectedDocs`.
5. El pack (`--compress`) escribe estado en `docs/technical-discovery/.discovery-state.json`
   (sources, fileHashes, hash global, `packTokens`); el seed lo redacta la skill.

## Paths clave

`src/core/discovery.js`, `src/core/repomix-tier.js`, `src/core/tier-models.js`,
`src/cli/index.js` (`checkDiscovery`, `runRepomix`, `packDiscovery`),
`test/discovery-topology.test.js`, `test/discovery-tier.test.js`, `test/tier-models.test.js`.
