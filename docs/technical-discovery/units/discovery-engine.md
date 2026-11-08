---
node: units/discovery-engine
kind: dossier
read_when: "cómo se genera el mapa topológico, el pack Repomix, el impacto del seed, el affected-set por grafo de imports, la resolución de modelos por tier y el descubrimiento dev-only del catálogo"
covers: [topologia, empaquetado, tiers, tokens, affected-set, estado del seed, catalogo de modelos, integridad de IDs, aviso free-on-primary, descubrimiento dev-only]
sources: ["src/core/discovery.js", "src/core/repomix-tier.js", "src/core/tier-models.js", "src/core/affected-set.js", "src/core/model-catalog.js", "src/core/model-catalog.json", "scripts/refresh-model-catalog.mjs"]
generatedAt: 2026-11-08T16:31:24Z
pluginVersion: 0.24.0
skillVersion: '2.3'
---

# Unidad: discovery, affected-set, resolución de modelos y catálogo

## Propósito

Separar el descubrimiento técnico del barrido manual: producir un mapa topológico estable
(`.discovery-map.json`), empaquetar el contexto con el presupuesto del tier, medir si el seed sigue
fresco y calcular qué archivos dependen de un cambio. El catálogo de modelos se puede refrescar de
forma completa y auditable desde una máquina de mantenimiento, sin introducir descubrimiento en
runtime: se enumeran todos los proveedores, se fuerza `--refresh`, se clasifica la corrida, se
calcula el diff, se valida que todo ID declarado sobreviva y se escribe de forma atómica. En 0.19.0,
0.20.0, 0.20.1, 0.21.0, 0.22.0, 0.22.1 y 0.23.0 esta unidad no cambió: esos cambios tocaron el ruteo
MCP, la portabilidad, el predicado de escritura de `repairProjectMcp`, los contratos de conformidad
en `agents/`/`skills/`, el merge de specs, el orden del archive, la idempotencia de `recordNode`, el
aviso de bundle legacy en `import` y la preservación de EOL en `reconcileLegacyBlocks`, sin tocar
topología, empaquetado, affected-set ni catálogo. En **0.24.0** sí cambian los valores de
`TIERS.minimo` y `MINIMO_CHAIN` (alineación a la canónica); el catálogo, la topología, el
empaquetado y el affected-set siguen igual.

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
`gratis` si no hay tier válido. El pack comprimido conserva firmas y comentarios, pero elide los
cuerpos de funciones; además Repomix aplica sus ignores por defecto, que incluyen `**/*.md`, así
que el pack no trae Markdown.

### Resolución de modelos (`minimo`)

`resolveTierModels(tier, catalog, { allowUnresolved })`:

- `TIERS` mantiene forma agente → string; `TIER_CHAINS` define la cadena de `minimo` con dos
  candidatos: `opencode-go/deepseek-v4.1-flash` → `opencode/deepseek-v4.1-flash-free`. La cabeza es
  el `model:` que publican los `agents/*.md`; `commandcode/deepseek/deepseek-v4.1-flash` ya no está
  en la cadena (0.24.0).
- `modelIdsFromCatalog` acepta el snapshot completo (`{ providers }`) o un mapa proveedor → IDs.
- Devuelve `models`, `candidates` y `unresolved`. En modo estricto lanza error si ningún candidato
  está; `check` usa `allowUnresolved: true` y degrada con aviso.
- `gratis` no tiene cadena: usa `opencode/big-pickle`; un `gratisModel` desconocido se normaliza.
- `freeTierOnPrimary(model, mode)` completa la semántica del tier gratis: cruza el modelo free con
  `mode: primary` para los avisos de `applyTier` y `check` (ver `units/cli-install.md`). No recibe
  tier ni depende del catálogo.

### Catálogo de modelos

`src/core/model-catalog.json` guarda `generated_at: 2026-11-04`, `source.method`
(`opencode models <provider> --verbose --refresh`), `source.providers` y los IDs con costo y
límites: **5 proveedores / 211 IDs** — `opencode` 10, `opencode-go` 30, `anthropic` 20,
`commandcode` 71, `openai` 80. Sin cambios en 0.19.0–0.24.0.

`src/core/model-catalog.js` es el dueño único de los helpers puros:

| Helper | Contrato |
|---|---|
| `providersFromFlatOutput(raw)` | Enumera proveedores desde una línea `provider/model`; dedup y orden |
| `isSafeProviderName(name)` | Solo `[a-z0-9][a-z0-9._-]*`; rechaza espacios, `/` y metacaracteres |
| `parseVerboseProviderOutput(provider, raw)` | `{ id, cost, limit }` con `null` si faltan datos; dedup por `id` |
| `diffCatalogSnapshots(current, next)` | Altas/bajas de proveedores e IDs y cambios de `cost`/`limit` |
| `validateCatalogSnapshot(snapshot)` | Fecha real, `source` no vacío, prefijo de proveedor, sin IDs duplicados |
| `discoveryStatus({...})` | `binary-missing` > `partial` > `network-unavailable` > `available` |
| `freeModelViolations(snapshot, ids)` | IDs ausentes o con costo distinto de 0 |
| `modelIdsFromCatalog(catalog)` | Única extracción de IDs; acepta snapshot completo o mapa proveedor→IDs |
| `missingModelIdsInCatalog(snapshot, ids)` | Entradas declaradas ausentes del snapshot; reutiliza `modelIdsFromCatalog` |
| `catalogAgeDays` / `isCatalogStale` | Edad UTC; stale si supera 90 días |

El módulo **no** importa `node:child_process`, no hace red y no escribe archivos. En
`src/core/tier-models.js` vive `declaredModelIds({ tiers, chains, agentModels })`, que deriva los
IDs declarados (tiers, cadenas y frontmatter ya leído), deduplica conservando origen en un `Map` y
excluye `inherit`.

### Integridad de IDs declarados

- Fuentes: los tres tiers de `TIERS`, todos los candidatos de `TIER_CHAINS`, los `model:` de
  `agents/*.md` y de `profiles/*/agents/*.md`.
- `declaredModelIds` es puro y no lee archivos. El caller que sí lee (el script o el test) le pasa
  `agentModels: [{ id, source }]`.
- `missingModelIdsInCatalog` devuelve `[{ id, source }]` para los IDs que no figuran en el snapshot,
  reutilizando la única extracción de IDs.
- El guard de tests cubre las cuatro fuentes y falla nombrando ID y origen. El guard de contenido
  exige que `model-catalog.js` y `tier-models.js` no importen `node:child_process`, y permite que
  el script lo haga.
- **Consolidación (0.18.13)**: en `aspec/specs/agent-model-tiers/spec.md` los dos requirements
  solapados de integridad de IDs se consolidaron con `MODIFIED Requirements`, conservando ambos
  headings y dejando la regla estricta de `--write` como enunciación autoritativa. No cambió
  comportamiento; evita reenunciar la misma obligación dos veces. En 0.18.15 el mismo spec sumó el
  requirement del tier dormido (sólo oráculo).

### Descubrimiento dev-only

`scripts/refresh-model-catalog.mjs` es el único punto que lanza procesos:

1. `opencode models --refresh` enumera todos los proveedores (salida plana).
2. Filtra nombres inseguros y consulta cada proveedor con
   `opencode models <provider> --verbose --refresh`.
3. Detecta `Failed to fetch models.dev` (marcador offline) y clasifica la corrida. La detección de
   binario ausente (`looksBinaryMissing`) es independiente del locale: `ENOENT` o mensajes de
   comando no encontrado/no reconocido en varios idiomas; una corrida exitosa nunca es
   `binary-missing`, y timeout/buffer/permisos son `partial`.
4. Solo con `available`: valida la forma, rechaza `opencode/big-pickle` si no cuesta 0, imprime el
   diff y escribe el candidato en `.ancleto/model-catalog.candidate.json` (local, no se commitea).
5. Con `--write`, antes de escribir deriva los IDs declarados de `TIERS`/`TIER_CHAINS` y de
   `agents/*.md`/`profiles/*/agents/*.md`; si falta al menos uno, sale con exit 1, nombra ID y
   origen y **no escribe ni el snapshot ni el candidato**. Si las fuentes no son legibles, falla
   cerrado; el dry-run no las lee.
6. Si el gate pasa, `--write` reemplaza `src/core/model-catalog.json` con escritura atómica
   (temporal + rename); sin `--write` el snapshot commiteado no se toca.

`readCurrent(path)` de un snapshot ilegible devuelve `{ providers: {} }` con aviso y usa ese
baseline solo para el diff. Nunca corre en `install`/`update`/`init`/`import`/`check`, en la suite
ni en CI.

### Avisos de `check`

`check` carga el catálogo una vez (solo si `opencode` está instalado). Un catálogo parseable pero
inválido (`{}`, `{providers:{}}`, array, string) se descarta; un catálogo ilegible también queda en
`null`. Con snapshot válido:

- reporta cada `model:` de mirror ausente del catálogo, con el archivo y el ID;
- emite como máximo un aviso advisory por ejecución si un ID declarado en `TIERS`, `TIER_CHAINS`,
  `agents/*.md` o `profiles/*/agents/*.md` no figura en el snapshot, listando ID y origen;
- agrega una entrada advisory por agente instalado con `mode: primary` y `model:` gratis
  (`freeTierOnPrimary`), derivada del frontmatter y no del nombre;
- emite un aviso único de antigüedad si `generated_at` supera 90 días.

Con catálogo no verificable conserva el aviso de catálogo no verificable y **no** emite deriva ni
advisory de IDs: un snapshot corrupto o vacío no produce deriva falsa. Todos los avisos son no
bloqueantes: no alteran el exit code, los contadores ni el conjunto de aceptación del oráculo. En
0.18.15 se sumaron dos avisos de `check` ajenos a esta unidad: tier dormido y deriva de
`.ancletorc.version` (ver `units/cli-install.md`). El invariante de la nota de compresión (0.18.14)
no cambia este contrato.

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
- **Pack actual**: 839 fuentes y ~38.408 tokens, tier `minimo` (comprimido), con 29 entradas de
  archivo en el cuerpo. El `.discovery-map.json` observado reporta 849 archivos (aspec 279, src 19,
  test 27, docs 21). El estado quedó en `docs/technical-discovery/.discovery-state.json`.
- **Un solo dueño del spawn**: mover el descubrimiento a `src/` rompería el contrato de "cero red en
  runtime/CI" y la separación `model-catalog.js` (puro) / `scripts/` (procesos).
- **Un solo dueño de la extracción de IDs**: `modelIdsFromCatalog` vive en `model-catalog.js` y
  `tier-models.js` la re-exporta; una segunda implementación rompería la integridad.
- **Gate de `--write`**: depende de que `agents/` y `profiles/` sean legibles; falla cerrado para no
  quedar ciego, y por eso debe correrse desde el repositorio fuente completo.
- **Riesgo de catálogo**: el snapshot puede envejecer; `install` falla recién en `ancleto`, no en el
  host. Mitigación: refresco manual con `--refresh`, aviso a los 90 días, guard de integridad y gate
  de `--write`.
- **Riesgo de alcance**: `affected-set` acota por diseño las formas dinámicas no literales; no es un
  análisis semántico.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/discovery.js` | Mapa topológico y `readTopologySummary` |
| `src/core/repomix-tier.js` | Args de Repomix, ignores y presupuesto por tier |
| `src/core/affected-set.js` | Grafo de imports y clausura de dependientes |
| `src/core/tier-models.js` | `TIERS`, `TIER_CHAINS`, resolver, `declaredModelIds` y `freeTierOnPrimary` |
| `src/core/model-catalog.js` | Helpers puros, IDs del catálogo e integridad |
| `src/core/model-catalog.json` | Snapshot verificado de modelos (5 proveedores / 211 IDs) |
| `scripts/refresh-model-catalog.mjs` | Descubrimiento dev-only, gate de IDs y escritura atómica |
| `src/cli/index.js` (`packDiscovery`, `checkDiscovery`, `checkAgentsFrontmatter`, `declaredAgentModels`) | Empaquetado, estado del seed y avisos de `check` |
| `docs/technical-discovery/.discovery-state.json` | Último hash/pack del seed |
| `docs/technical-discovery/seed-map.json` | Documento → áreas de evidencia |
