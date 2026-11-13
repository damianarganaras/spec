---
node: units/discovery-engine
kind: dossier
read_when: "cómo se genera el mapa topológico, el pack Repomix, el impacto del seed, el affected-set por grafo de imports, la selección de tests afectados, la resolución de modelos por tier y el descubrimiento dev-only del catálogo"
covers: [topologia, empaquetado, tiers, tokens, affected-set, seleccion-de-tests, estado del seed, catalogo de modelos, integridad de IDs, aviso free-on-primary, descubrimiento dev-only]
sources: ["src/core/discovery.js", "src/core/repomix-tier.js", "src/core/tier-models.js", "src/core/affected-set.js", "src/core/test-selection.js", "src/core/model-catalog.js", "src/core/model-catalog.json", "src/core/discovery-glob.js", "src/core/discovery-state.js", "scripts/refresh-model-catalog.mjs", "scripts/test-affected.mjs", "src/cli/index.js", "aspec/changes/archive/2026-11-12-discovery-exclude-regexp-cache", "aspec/changes/archive/2026-11-12-discovery-state-schema-wording", "aspec/changes/archive/2026-11-12-pin-offline-discovery-state", "aspec/changes/archive/2026-11-13-ch-06b-affected-test-selection"]
generatedAt: 2026-11-13T20:53:42Z
pluginVersion: 0.33.1
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
empaquetado y el affected-set siguen igual. **0.25.0** tampoco los toca: el ruteo del archive por
`specs merge` y el guard de `--help` viven en `skills/`, `agents/` y el dispatch del CLI.
**0.26.0** cambia sólo el cálculo de `seedMapPresent` (state-independent); **0.26.1** no cambia
runtime: documenta y pinea el detector de frescura vigente en `cli-diagnostics`; **0.26.2**
tampoco cambia runtime: consolida walkers de snapshot read-only y pines de frescura en tests; y
**0.26.4** agrega a la suite declarada un guard estructural de los delta specs activos y documenta
el Requirement en `spec-sync`, también sin tocar `src/`. **0.27.0** sí toca `src/cli/index.js`:
normaliza el valor de `version` de primer nivel del `package.json` raíz para el hash semántico y
persiste `ruleVersion: 2` + `semantic` en el estado; además amplía el guard de la suite para detectar
`spec.md` mal ubicados bajo changes activos. **0.28.0** vuelve a tocar `src/cli/index.js`: agrega
`isEphemeralSource` e `isEphemeralOnlyChange` y aplica un filtro simétrico de rutas efímeras
(`.ancleto`, `.ancleto/**` y `.discovery-map.json` raíz) antes de `computeImpact`; el writer y
`ruleVersion` no cambian. **0.29.0** extiende el mismo predicado de lectura a
`documentation`/`documentation/**` y `audit logs`/`audit logs/**`, anclados a la raíz; el writer, la
forma del estado y `ruleVersion: 2` siguen intactos. **0.30.0** corrige el matcher de
`discovery.exclude`: `escapeRe` escapa `*` y `?` y `matchesGlob` traduce los patrones por segmentos.
**0.30.1** extrae `escapeRe`, `compileGlob` y `matchesGlob` de `src/cli/index.js` a
`src/core/discovery-glob.js` y cachea el `RegExp` compilado en un `Map` por string exacto de glob;
sobre 9.669 evaluaciones el costo baja de 15,04 ms a 1,63 ms (9,2×), sin cambio de tokenización,
anclaje ni semántica. **0.30.2** tampoco cambia la frescura: es un patch documental que distingue el
estado persistido (`version: 1` + `ruleVersion: 2`) del `schemaVersion: 2` de `--check` y pinea el
armado offline en `src/core/discovery-state.js` sin alterar los bytes persistidos. **0.31.0** no toca
el discovery ni la frescura: sólo cambia el renderer del working-context, fuera de este módulo.
**0.32.0** sí suma un módulo a esta unidad —`src/core/test-selection.js`— y un consumidor
(`scripts/test-affected.mjs`), pero no toca el discovery, la frescura, el writer ni el estado: el
plan se computa en memoria sobre el affected-set. **0.33.0–0.33.1 tampoco tocan esta unidad**: la
serialización de escritores y el rebuild de doctor (0.33.1) viven en `src/core/memory/**`, fuera
del discovery; `DEFAULT_IGNORES`, `outputDir`, `packDiscovery`, el writer, la forma del estado y
`ruleVersion: 2` siguen intactos.

## Recorrido relevante

### Topología y estado del seed

1. `writeDiscoveryMap(rootDir)` (`src/core/discovery.js`) recorre el repo, ignora
   `node_modules`, `.git`, `.ancleto`, `dist`, `build` y `coverage`, y escribe
   `.discovery-map.json` con `tree_summary`, `root_files` y `total_files`.
2. `ancleto discovery --compress` (`src/cli/index.js` → `packDiscovery`) escribe el mapa, genera el
   pack y guarda `.discovery-state.json` con la lista de fuentes, el hash crudo por archivo y el hash
   global; desde 0.27.0 agrega `ruleVersion: 2` y `semantic: { hash, fileHashes }`, donde el hash
   normalizado reemplaza sólo el valor de `version` de primer nivel del `package.json` raíz por un
   centinela byte-preserving.
3. `discovery --check` calcula primero `seedMapPresent` (independiente del estado): un
   `seed-map.json` con `docs` objeto plano da `true` en `READY`, `STALE`, `PARTIAL` y `MISSING`; un
   `docs` que no es objeto plano (arreglo o `null`) se rechaza (`readSeedMap`). Después compara el
   hash actual con el guardado. Si el estado declara `ruleVersion: 2` con un bloque `semantic` de
   forma válida (`hash` string y `fileHashes` objeto no-array), compara `semantic.hash` y atribuye
   con la vista efectiva `{ ...fileHashes, ...semantic.fileHashes }`; cualquier otro estado —incluido
   un legacy sin `ruleVersion`— usa los hashes crudos, byte-idéntico al comportamiento previo:
   - `READY` si coincide, o si el desvío de hash se excusa porque todas las rutas cambiadas son
     efímeras (0.28.0).
   - `STALE` + `impact: material` si cambió un archivo material o apareció/desapareció un área raíz.
   - `STALE` + `impact: minor` si solo cambiaron contenidos no materiales.
   - `PARTIAL`/`MISSING` según documentos esperados ausentes.

   Desde 0.28.0, antes de `computeImpact`, `checkDiscovery` filtra simétricamente las dos vistas de
   `sources` con `isEphemeralSource` (`.discovery-map.json` sólo en la raíz; `.ancleto` y
   `.ancleto/**`), de modo que ni altas ni bajas efímeras producen áreas o razones. Desde 0.29.0 el
   mismo predicado cubre `documentation`/`documentation/**` y `audit logs`/`audit logs/**` anclados a
   la raíz. Los mapas `storedFileHashes`/`currentFileHashes` quedan completos; si el hash global
   difiere, `isEphemeralOnlyChange` concede `READY` sólo cuando hay al menos una ruta cambiada y
   todas son efímeras. Cero rutas cambiadas no se excusa, y un estado sin `fileHashes` sigue
   `STALE`/`minor` con la nota exacta. El predicado está anclado: `.ancletorc`, `.ancleto-notes.md`,
   `src/ancleto/x.js` y los lookalikes `docs/documentation/x.md`, `documentation-extra/x.md`,
   `src/documentation/x.js` y `audit logs-extra/x.log` no son efímeros.
4. `seed-map.json` (lo escribe la skill) mapea documento → áreas; `affectedDocs` es la intersección
   con `changedAreas` y sólo se puebla en `STALE`.

El contrato del detector quedó fijado en 0.26.1 (delta `ADDED` de `cli-diagnostics`) sin tocar
`src/`; en 0.27.0 se extendió con la regla de hash normalizada (delta `MODIFIED`), esta vez con
cambio de runtime en `src/cli/index.js`; en 0.28.0 se extendió con el filtro de rutas efímeras
(también `MODIFIED` de `cli-diagnostics`), sin cambiar el writer ni `ruleVersion`; en 0.29.0 el
mismo filtro incorporó `documentation/**` y `audit logs/**` anclados a la raíz (otro `MODIFIED`),
también sin tocar el writer ni `ruleVersion`:

- La salida es `schemaVersion: 2`, JSON, exit 0 y **read-only**: no escribe el seed, el estado ni
  el `seed-map.json`.
- **Archivos materiales (lista cerrada)**: `package.json` sólo en la raíz; `tsconfig.json`,
  `tsconfig.<sufijo>.json` y `jsconfig.json`; configs de
  `vite|webpack|rollup|next|nuxt|astro|svelte|tailwind`; `docker-compose.yml|yaml`; `Dockerfile`;
  `index.html`; `src/(main|index).[cm]?[jt]sx?` en esa profundidad. Un `package.json` anidado y
  `package-lock.json` no son materiales. El valor de `version` de primer nivel del `package.json`
  raíz no cuenta como cambio de contenido ni material; cualquier otro cambio en ese archivo
  (`dependencies`, `scripts`, `engines`, indentación, orden de claves o una `version` anidada) sigue
  siendo material y reporta `archivo material modificado: package.json`.
- **Rutas efímeras (0.28.0–0.29.0)**: `isEphemeralSource(rel)` reconoce exactamente
  `.discovery-map.json` en la raíz, `.ancleto` / `.ancleto/**`, `documentation` /
  `documentation/**` y `audit logs` / `audit logs/**` (estos dos últimos anclados a la raíz); el
  anclaje evita falsos positivos con `.ancletorc`, `.ancleto-notes.md`, `src/ancleto/x.js`,
  `docs/documentation/x.md`, `documentation-extra/x.md`, `src/documentation/x.js` y
  `audit logs-extra/x.log`. `documentation` y `audit logs` están gitignored y no tienen archivos
  versionados. El filtro se aplica simétricamente a `stored.sources` y a las rutas actuales antes de
  `computeImpact`; los mapas de hashes permanecen completos. Si el hash difiere,
  `isEphemeralOnlyChange` concede `READY` sólo con ≥1 ruta cambiada y todas efímeras; cero rutas
  cambiadas sigue `STALE` y un estado sin `fileHashes` sigue `STALE`/`minor` con
  `materialReasons: []` y la nota exacta. Las rutas efímeras siguen en `sources`/`fileHashes` y
  `ruleVersion` no cambia.
- **Área** = primer segmento del path; un archivo raíz es su propia área (`areaOf`).
- `computeImpact` compara `sources` (ambas vistas ya filtradas por rutas efímeras) y la vista
  efectiva de `fileHashes` persistidos con el árbol actual y emite en
  `materialReasons` sólo las formas `archivo material nuevo|eliminado|modificado: <rel>`,
  `area raiz nueva: <área>` y `area raiz eliminada: <área>`; el orden y la cardinalidad no son
  contrato. Sin `fileHashes` previos y sin `changedAreas`, `notes` agrega el texto
  `estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area` y
  fuerza `minor`.
- `impact` sigue la precedencia `material` > `minor` > `none`; `recommendedAction` es
  `regenerate` para `material`, `continue` para `minor` o `none`, y `generate`/`complete` cuando el
  estado es `MISSING`/`PARTIAL` (excepción documentada y pineada en `cli-diagnostics`). Sin estado o sin `hash`,
  `STALE`/`material` con arreglos vacíos.
- Un cambio futuro en `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `isMaterialFile`, `areaOf`,
  `computeImpact` o el predicado de rutas efímeras es comportamiento y exige delta `MODIFIED`
  (release minor), no un patch documental. La normalización de `version` vive fuera de esas
  funciones: `computeImpact` recibe la vista efectiva de hashes ya construida y no cambia su
  contrato.

### Exclusiones por segmentos y caché (0.30.0–0.30.1)

`computeSources` (`src/cli/index.js`) construye `sources` recorriendo el árbol con `isIgnored`:
primero aplica `DEFAULT_IGNORES` (`node_modules`, `.git`, `dist`) y luego evalúa cada glob de
`discovery.exclude` con `matchesGlob`. Desde 0.30.0 `escapeRe` escapa `*` y `?` además del resto de
metacaracteres, y `matchesGlob` consume el patrón por tokens. Desde 0.30.1 esas funciones viven en
`src/core/discovery-glob.js` (`escapeRe`, `compileGlob`, `matchesGlob`) y `src/cli/index.js` las
importa; no hay una segunda implementación:

| Token | Traducción |
|---|---|
| `**/` | `(?:.*/)?` |
| `/**` | `(?:/.*)?` |
| `**` | `.*` |
| `*` | `[^/]*` |
| `?` | `[^/]` |

Las secuencias `**/` y `/**` se consumen antes que un `**` suelto. Si el patrón contiene `**`, el
regex se ancla como `^…$`; si no, como `^(…)(?:/|$)` —el patrón `p` coincide con `p` y `p/<resto>`,
no con `p-<sufijo>`—. `compileGlob` cachea el `RegExp` en un `Map` de módulo por string exacto de
glob: los patrones son fijos durante la corrida y antes cada ruta recompilaba el mismo glob
(globs × rutas). Sobre 9.669 evaluaciones (11 globs × 879 rutas) el costo baja de 15,04 ms a 1,63 ms
(9,2×) sin cambio de semántica. Efecto de 0.30.0: `**/*.test.*` y `**/*.spec.*` dejan de ser no-ops
y los 21 `test/*.test.js` de entonces salen de `sources` (872→854); en 0.30.1 hay 22 y `sources`
suma 857 por los archivos nuevos. Los 7 fixtures de `test/fixtures/**` no matchean `.test.`/`.spec.`
y siguen incluidos. La exclusión es de `discovery.exclude`, **no** de `DEFAULT_IGNORES` ni del
predicado reader-side `isEphemeralSource` de `checkDiscovery`: los tests no son efímeros ni están en
los ignores por defecto. El tier `minimo` sigue excluyendo `test/**` del cuerpo del pack, pero eso es
independiente de la lista `sources` que mide el seed. `buildRepomixArgs` y el `--ignore` de Repomix
no cambian. El ReDoS con `**` repetidos sigue siendo una limitación aceptada (el input es el
`.ancletorc` local); el DP por segmentos se descartó por no ser equivalente (9 divergencias en `**`
embebido y 1 en `.` vs. `[^/]` frente a newline). Requisito canónico: «Semántica por segmentos de los
patrones de exclusión del discovery» (`aspec/specs/cli-diagnostics/spec.md`); 0.30.1 es una
optimización sin cambio de contrato y no lo modifica.

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
`commandcode` 71, `openai` 80. Sin cambios en 0.19.0–0.25.0.

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

### Selección de tests afectados (0.32.0)

`ancleto affected --tests <archivos...>` implica JSON y agrega `tests` al objeto de
`affectedCommand` (`seeds`, `affected`, `unresolved`, `externalCount`), sin cambiar la salida ni los
exit codes cuando el flag falta. `planTestSelection({ rootDir, seeds, affected, unresolved })`
(`src/core/test-selection.js`) es puro y read-only: toma `U` = `test/*.test.js` (hijos directos de
`test/`) y el manifiesto `test/affected-tests.json`; valida el esquema cerrado `version: 1` con
`always` y `couplings` (rutas repo-relative posix dentro de `U`), y computa:

1. tests de `U` presentes en `affected`;
2. tests de `always`;
3. tests de cada `coupling` cuyo `trigger` interseca `affected` por `matchesGlob` —cubre suites que
   spawnean el CLI o leen Markdown sin importarlo—;
4. tests de `U` con imports irresolubles, por precaución.

`excluded` es el complemento exacto con `reason: "not-affected"`. `complete` es `true` sólo si el
manifiesto es válido y cerrado, el glob resuelve al menos un archivo y ningún archivo de `affected`
tiene imports no resueltos; las razones son `manifest-missing`, `manifest-invalid`, `manifest-gap`,
`test-glob-missing` y `unresolved-in-closure` (lista cerrada y ordenada). El consumidor
`scripts/test-affected.mjs` sólo ejecuta `node --test <selected>` con `complete: true` y selección no
vacía; en cualquier otro caso imprime las razones y corre la suite completa declarada
`test/*.test.js`. `--plan-only`/`--json` emite el plan sin ejecutar.

## Reglas, contratos y riesgos

- **Área** = primer segmento del path; los archivos raíz son su propia área. Es la misma convención
  en `computeImpact` y en `seed-map.json`.
- **Archivos materiales**: `package.json`, `tsconfig*`, configs de bundlers, `Dockerfile`,
  `index.html`, `src/(main|index).*`. Un área nueva/eliminada también es material. Excepción: el
  valor de `version` de primer nivel del `package.json` raíz no es material ni cambio de contenido.
- **Estado versionado (0.27.0–0.29.0)**: el writer conserva `hash`/`fileHashes` crudos para permitir
  rollback y agrega `ruleVersion: 2` + `semantic`; el lector elige la vista semántica sólo con la
  forma completa y válida, y cae a la cruda en cualquier otro caso. 0.28.0 agrega el filtro de
  rutas efímeras en lectura sin cambiar la forma del estado ni `ruleVersion`; 0.29.0 extiende ese
  filtro a `documentation/**` y `audit logs/**`; un estado legacy sin `fileHashes` sigue
  `STALE`/`minor`.
- **El outputDir del seed se excluye** del hash de fuentes; escribir el seed no invalida el estado.
- **Pack actual**: 873 fuentes, 166.322 B y ~41k tokens, tier `minimo` (comprimido), con 33 entradas
  de archivo en el cuerpo. El `.discovery-map.json` observado reporta 907 archivos (aspec 327,
  `.opencode` 66, src 22, test 33, scripts 2, docs 21, documentation 340, audit logs 9); el estado
  `.discovery-state.json` lista 873 fuentes e incluye 674 entradas `documentation/` + 18
  `audit logs/` entre `sources` y `fileHashes`, efímeras desde 0.29.0. Las 24 rutas
  `test/*.test.js` ya no figuran en `sources` por `discovery.exclude` (0.30.1); los 8 fixtures de
  `test/fixtures/**` siguen incluidos.
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
  análisis semántico. Desde 0.32.0 el plan de tests hereda ese límite y lo mitiga con el manifiesto
  cerrado: `complete: true` no promete completitud semántica, sólo manifiesto cerrado, universo
  clasificado y cierre sin imports irresolubles. Un acoplamiento no-import nuevo dentro de un test ya
  declarado se cubre sólo si el test está en `always` o en un `coupling`; `planTestSelection` no
  analiza el cuerpo del test.

## Paths clave

| Path | Rol |
|---|---|
| `src/core/discovery.js` | Mapa topológico y `readTopologySummary` |
| `src/core/repomix-tier.js` | Args de Repomix, ignores y presupuesto por tier |
| `src/core/affected-set.js` | Grafo de imports y clausura de dependientes |
| `src/core/test-selection.js` | `planTestSelection`: plan determinístico de tests sobre el affected-set y gate `complete` fail-closed (0.32.0) |
| `scripts/test-affected.mjs` | Consumidor `npm run test:affected`: ejecuta `selected` o cae a la suite completa (0.32.0) |
| `test/affected-tests.json` | Manifiesto cerrado `version: 1` con `always` y `couplings` que declaran acoplamientos sin arista de import (0.32.0) |
| `src/core/tier-models.js` | `TIERS`, `TIER_CHAINS`, resolver, `declaredModelIds` y `freeTierOnPrimary` |
| `src/core/model-catalog.js` | Helpers puros, IDs del catálogo e integridad |
| `src/core/model-catalog.json` | Snapshot verificado de modelos (5 proveedores / 211 IDs) |
| `scripts/refresh-model-catalog.mjs` | Descubrimiento dev-only, gate de IDs y escritura atómica |
| `src/core/discovery-glob.js` | `escapeRe`, `compileGlob` y `matchesGlob`; traducción glob→regex por tokens y caché `Map` por string exacto de glob |
| `src/core/discovery-state.js` | `buildDiscoveryState`/`renderDiscoveryState` puros; armado y serialización del estado persistido usados por `packDiscovery` (0.30.2, golden byte-idéntico) |
| `src/cli/index.js` (`packDiscovery`, `checkDiscovery`, `normalizeRootPackageJson`, `hashSources`, `isEphemeralSource`, `isEphemeralOnlyChange`, `computeSources`, `checkAgentsFrontmatter`, `declaredAgentModels`) | Empaquetado, estado del seed, hash semántico, filtro de rutas efímeras, uso del matcher de exclusiones y avisos de `check` |
| `docs/technical-discovery/.discovery-state.json` | Último hash/pack del seed |
| `docs/technical-discovery/seed-map.json` | Documento → áreas de evidencia |
| `aspec/specs/cli-diagnostics/spec.md` | Contrato del detector de frescura (0.26.1), de `seedMapPresent` (0.26.0), del filtro de rutas efímeras (0.28.0–0.29.0), de la semántica por segmentos de `discovery.exclude` (0.30.0) y precisión del estado persistido `version: 1` + `ruleVersion: 2` frente a `schemaVersion: 2` (0.30.2) |
| `aspec/changes/archive/2026-11-10-spec-seed-freshness-detector/` | Change archivado que documenta y pinea el detector (sin cambio de runtime) |
| `aspec/changes/archive/2026-11-11-seed-freshness-version-bump-not-material/` | Change archivado de 0.27.0: bump de `version` no material y estado persistido con `ruleVersion: 2` + `semantic` (delta `MODIFIED` de `cli-diagnostics`) |
| `aspec/changes/archive/2026-11-11-seed-freshness-ephemeral-paths/` | Change archivado de 0.28.0: filtro simétrico de rutas efímeras en lectura, excusa acotada del desvío de hash y writer/`ruleVersion` intactos (delta `MODIFIED` de `cli-diagnostics`) |
| `aspec/changes/archive/2026-11-12-seed-freshness-ignored-areas/` | Change archivado de 0.29.0: extensión del predicado de lectura a `documentation/**` y `audit logs/**` anclados a la raíz, con `docs/**`/`aspec/**` aún contando y writer/`ruleVersion` intactos (delta `MODIFIED` de `cli-diagnostics`) |
| `aspec/changes/archive/2026-11-12-discovery-exclude-glob-match/` | Change archivado de 0.30.0: matcher de `discovery.exclude` por segmentos (`escapeRe`/`matchesGlob`), exclusión efectiva de `**/*.test.*`/`**/*.spec.*` y `sources` 872→854, con `DEFAULT_IGNORES`/`outputDir`/writer/`ruleVersion` intactos (delta `MODIFIED` de `cli-diagnostics`) |
| `aspec/changes/archive/2026-11-12-discovery-exclude-regexp-cache/` | Change archivado de 0.30.1: extracción del matcher a `src/core/discovery-glob.js` y caché `Map` del `RegExp` por glob exacto, 15,04 ms → 1,63 ms (9,2×) sobre 9.669 evaluaciones, sin cambio de semántica; ReDoS con `**` repetidos aceptado y DP por segmentos descartado |
| `aspec/changes/archive/2026-11-12-discovery-state-schema-wording/` | Change archivado de 0.30.2: delta `MODIFIED` de `cli-diagnostics` que distingue el estado persistido `version: 1` + `ruleVersion: 2` del `schemaVersion: 2` de la salida de `--check`, con pin de test no conductual |
| `aspec/changes/archive/2026-11-12-pin-offline-discovery-state/` | Change archivado de conformidad (sin delta ni bump): `buildDiscoveryState`/`renderDiscoveryState` puros en `src/core/discovery-state.js`, con golden byte-idéntico |
