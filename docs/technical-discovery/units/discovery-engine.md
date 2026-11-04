---
node: units/discovery-engine
kind: dossier
read_when: "cómo se genera el mapa topológico, el pack Repomix, el impacto del seed, el affected-set por grafo de imports y la resolución de modelos por tier"
covers: [topologia, empaquetado, tiers, tokens, affected-set, estado del seed, catalogo de modelos]
sources: ["src/core/discovery.js", "src/core/repomix-tier.js", "src/core/tier-models.js", "src/core/affected-set.js", "src/core/model-catalog.json", "scripts/refresh-model-catalog.mjs"]
sourcesSha: 62c97ff2f1f342f5
generatedAt: 2026-11-03T22:11:31Z
pluginVersion: 0.18.10
skillVersion: '2.3'
---

# Unidad: discovery, affected-set y resolución de modelos

## Propósito

Separar el descubrimiento técnico del barrido manual: producir un mapa topológico estable
(`.discovery-map.json`), empaquetar el contexto con el presupuesto del tier, medir si el seed sigue
fresco y calcular qué archivos dependen de un cambio. En 0.18.10 el mismo módulo de tiers resuelve
la cadena de `minimo` contra un catálogo verificado, en lugar de escribir IDs fijos.

## Recorrido relevante

### Topología y estado del seed

1. `writeDiscoveryMap(rootDir)` (`src/core/discovery.js`) recorre el repo, ignora
   `node_modules`, `.git`, `.ancleto`, `dist`, `build` y `coverage`, y escribe
   `.discovery-map.json` con `tree_summary`, `root_files` y `total_files`.
2. `ancleto discovery --compress` (`src/cli/index.js` → `packDiscovery`) escribe el mapa, genera el
   pack y guarda `.discovery-state.json` con la lista de fuentes, el hash por archivo y el hash
   global.
3. `discovery --check` compara el hash actual con el guardado:
   - `READY` si coincide.
   - `STALE` + `impact: material` si cambió un archivo material o apareció/desapareció un área raíz.
   - `STALE` + `impact: minor` si solo cambiaron contenidos no materiales.
   - `PARTIAL`/`MISSING` según documentos esperados ausentes.
4. `seed-map.json` (lo escribe la skill) mapea documento → áreas; `affectedDocs` es la intersección
   con `changedAreas`.

### Empaquetado por tier

`src/core/repomix-tier.js` define `TIER_PACK_CONFIG`:

| Tier | Extras de ignore | Compresión | Presupuesto |
|---|---|---|---|
| `normal` | — | No | — |
| `minimo` | `test/**`, `docs/**`, `**/*.md` | Sí | — |
| `gratis` | `test/**`, `docs/**`, `**/*.md` | Sí | 50.000 tokens |

`buildRepomixArgs` combina las exclusiones del proyecto, los extras del tier y el `--ignore`
explícito. `readProjectTier` lee `.opencode/.ancleto-tier` (o `.ancleto-tier` en la raíz) y cae a
`gratis` si no hay tier válido.

### Resolución de modelos (`minimo`)

`resolveTierModels(tier, catalog, { allowUnresolved })`:

- `TIERS` mantiene forma agente → string; `TIER_CHAINS` define la cadena de `minimo`:
  `commandcode/deepseek/deepseek-v4.1-flash` → `opencode-go/deepseek-v4.1-flash` →
  `opencode/deepseek-v4.1-flash-free`.
- `modelIdsFromCatalog` acepta el snapshot completo (`{ providers }`) o un mapa proveedor → IDs.
- Devuelve `models`, `candidates` y `unresolved`. En modo estricto lanza error si ningún candidato
  está; `check` usa `allowUnresolved: true` y degrada con aviso.
- `gratis` no tiene cadena: usa `opencode/big-pickle`; un `gratisModel` desconocido se normaliza.

### Catálogo

`src/core/model-catalog.json` guarda `generated_at`, `source.method`, `source.providers` y los IDs
con costo y límites. `scripts/refresh-model-catalog.mjs` lo regenera **manualmente** ejecutando
`opencode models <provider> --verbose`; si falla, no escribe un snapshot vacío. `loadModelCatalog`
permite override por `ANCLETO_MODEL_CATALOG`.

### Affected-set

`computeAffectedSet({ rootDir, seeds })` (`src/core/affected-set.js`) construye el grafo de imports
(estáticos, `export … from`, `import()`/`require()` con literal puro) y devuelve la clausura de
**dependientes**. Los specifiers no relativos se cuentan como externos (`externalCount`); los
relativos que no resuelven se reportan como inconclusos. Es read-only y determinístico.

## Reglas, contratos y riesgos

- **Área** = primer segmento del path; los archivos raíz son su propia área. Es la misma convención
  en `computeImpact` y en `seed-map.json`.
- **Archivos materiales**: `package.json`, `tsconfig*`, configs de bundlers, `Dockerfile`,
  `index.html`, `src/(main|index).*`. Un área nueva/eliminada también es material.
- **El outputDir del seed se excluye** del hash de fuentes; escribir el seed no invalida el estado.
- **El pack actual**: 759 archivos, ~28.428 tokens, tier `minimo` (comprimido). El estado quedó
  guardado en `docs/technical-discovery/.discovery-state.json`.
- **Riesgo de catálogo**: el snapshot puede envejecer; `install` falla recién en `ancleto`, no en el
  host. Refresco manual + guard de tests es la mitigación declarada.
- **Riesgo de alcance**: `affected-set` acota por diseño las formas dinámicas no literales; no es un
  análisis semántico.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/discovery.js` | Mapa topológico y `readTopologySummary` |
| `src/core/repomix-tier.js` | Args de Repomix, ignores y presupuesto por tier |
| `src/core/affected-set.js` | Grafo de imports y clausura de dependientes |
| `src/core/tier-models.js` | `TIERS`, `TIER_CHAINS`, resolver y catálogo |
| `src/core/model-catalog.json` | Snapshot verificado de modelos |
| `scripts/refresh-model-catalog.mjs` | Refresco manual del snapshot |
| `src/cli/index.js` (`packDiscovery`, `checkDiscovery`) | Empaquetado y estado del seed |
| `docs/technical-discovery/.discovery-state.json` | Último hash/pack del seed |
| `docs/technical-discovery/seed-map.json` | Documento → áreas de evidencia |
