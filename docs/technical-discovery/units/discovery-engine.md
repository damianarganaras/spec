---
node: units/discovery-engine
kind: dossier
read_when: "cómo se genera el mapa topológico, el pack Repomix y el presupuesto por tier"
covers: [topologia, empaquetado, tiers, tokens]
sources: ["src/core/discovery.js", "src/core/repomix-tier.js", "src/core/tier-models.js"]
sourcesSha: 890886ffbbacbdaf0fd546cdd2c9aafb323fb339ce49658d7ecef3b177e7d4f4
generatedAt: 2026-10-07T23:35:00Z
pluginVersion: 0.12.0
skillVersion: '2.3'
---

# Unidad: discovery y tiers

## Propósito

Relevar el repositorio y empaquetar contexto con costo controlado. Tres
piezas: topología (`discovery.js`), traducción tier→Repomix
(`repomix-tier.js`) y selección de modelos por tier (`tier-models.js`).
Evidencia: `README.md`, pack Repomix.

## Recorrido relevante

1. `buildTopologyMap(rootDir)` recorre la raíz y produce el árbol/totales.
2. `ancleto discovery --check` (state-only) compara hashes y clasifica
   `impact`.
3. `ancleto discovery [--compress]` genera el pack Repomix con los ignores
   del tier.
4. La skill `ancleto-technical-discovery` redacta el seed a partir del
   pack.

## Topología — `src/core/discovery.js`

- `buildTopologyMap(rootDir)`: recorre la raíz ignorando `node_modules`,
  `.git`, `.ancleto`, `dist`, `build`, `coverage`
  (`TOPOLOGY_IGNORED_DIRS`); produce `last_updated`, `total_files`,
  `tree_summary` (conteo por directorio de primer nivel) y `root_files`.
- `writeDiscoveryMap(rootDir)`: escribe `.discovery-map.json` en la raíz
  del repo.
- `readTopologySummary(cwd)`: valida y lee el resumen para inyectarlo en
  el working context.
- El mapa se regenera al correr `ancleto discovery` (no en `--check`).

## Empaquetado — `src/core/repomix-tier.js`

- `TIER_PACK_CONFIG`: `normal` (sin ignores extra, sin compresión, sin
  budget), `minimo` (+`test/**`, `docs/**`, `**/*.md`; `--compress`),
  `gratis` (igual que `minimo` + budget 50000).
- `readProjectTier(cwd)`: lee `.ancleto-tier` en la raíz o en
  `.opencode/`; default `gratis`. **En este checkout existe
  `.opencode/.ancleto-tier` con valor `normal`, por lo que el tier
  resuelto es `normal`** (corrige al seed previo, que decía `gratis`).
- `buildRepomixArgs(flags, tier, exclude)`: fusiona `exclude`
  (`.ancletorc`) + ignores del tier + `--ignore` del usuario, y agrega
  `--compress` si el tier o el flag lo piden. No permite reemplazar los
  ignores por un `--ignore` vacío.
- `tierTokenBudget(tier)`: budget de tokens; el CLI falla si el pack lo
  supera.

## Modelos por tier — `src/core/tier-models.js`

- `tierModels(tier, tiers, gratisOverride)`, `gratisModel(persisted)`,
  `envGratisModel()`, `isKnownGratisModel(model)`, `detectMuseSpark()`.
- Tier `gratis`: prefiere Muse Spark 1.3 Free
  (`opencode/muse-spark-1.3-contributor-free`) si la cuenta lo habilita;
  si no, `opencode/big-pickle`. `ANCLETO_MUSE_SPARK=1|0` fuerza la
  elección y tiene prioridad sobre lo persistido en `.ancletorc`.
- Tier `minimo`: un único modelo `opencode-go/deepseek-v4.1-flash` para
  los 10 agents.

## Flujo del estado del seed (`--check`)

1. `presentDocs` verifica los 8 documentos esperados (`EXPECTED_DOCS`) →
   `MISSING`/`PARTIAL`.
2. `computeSources` + `hashSources` recorren los fuentes aplicando
   `DEFAULT_IGNORES` (`node_modules`, `.git`, `dist`) y el propio
   `outputDir`; el hash encadena `rel \0 longitud \0 contenido \n` por
   archivo ordenado.
3. Si hay estado previo, `computeImpact` compara por archivo y por área
   (primer nivel) y clasifica `impact`: `material` si cambió un archivo
   material (`package.json`, configs de runtime, `index.html`,
   `src/main|index.*`) o apareció/desapareció un área raíz; si no,
   `minor`; si no hay cambios atribuibles, `none`.
4. `readSeedMap` + `affectedDocsFor` cruzan áreas cambiadas con
   `seed-map.json` para acotar la regeneración a `affectedDocs`.
5. El pack (`--compress`) escribe estado en
   `docs/technical-discovery/.discovery-state.json` (sources, fileHashes,
   hash global, `packTokens`); el seed lo redacta la skill.

## Reglas, contratos y riesgos

- `--check` no empaqueta: es state-only sobre hashes.
- El pack comprimido (tree-sitter) solo expone firmas (no cuerpos), lo
  que limita la evidencia de `src/**`.
- El tier decide también qué markdown/test queda fuera del pack; el seed
  debe anotarlo (ver `unknowns.md`).

## Cambios en este seed (material)

- `materialReasons` (de `--check`) registra: `package.json` modificado,
  `package-lock.json` como nuevo archivo raíz, `documentation/` como
  área raíz eliminada. Esto explica el `impact: material` y dispara la
  oferta de regenerar.
- El tier resuelto (`.opencode/.ancleto-tier`) pasó de `gratis` a
  `normal`; afecta el comportamiento de `--ignore`/`--compress` en futuras
  corridas pero no los archivos del seed.
- Nuevos assets de skill: `skills/ancleto-update/SKILL.md`,
  `commands/cleto-update.md`, `docs/skill-ancleto-update.md`,
  `aspec/specs/artifact-update/spec.md`. Cambios `test/content-guards.test.js`
  para incluir `ancleto-update` en `ARTIFACT_SKILLS` y el conteo de
  comandos `15 + 1`. Esto sube el catálogo a 21 skills y 16 commands.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/discovery.js` | Mapa topológico (`buildTopologyMap`, `writeDiscoveryMap`). |
| `src/core/repomix-tier.js` | Args de Repomix y budget por tier. |
| `src/core/tier-models.js` | Modelos por tier y resolución gratis. |
| `src/cli/index.js` | `checkDiscovery`, `runRepomix`, `packDiscovery`, `computeImpact`, `readSeedMap`. |
| `test/discovery-topology.test.js`, `test/discovery-tier.test.js`, `test/tier-models.test.js` | Guardas de topología, tiers y modelos. |
| `ancleto discovery --check` | Reporta `state` + `impact` + `affectedDocs` + `config` (fuente única consumida por la skill). |