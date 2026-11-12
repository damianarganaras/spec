---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-11-12T09:44:05Z
pluginVersion: 0.28.0
skillVersion: '2.3'
---

# Overview

## Propósito

`@ancleto/spec` es un **orquestador de Spec-Driven Development** que vive dentro del IDE del
usuario (`opencode`, Claude, VS Code, Antigravity, Cursor, Roo, Copilot, Command Code). Cubre tres
funciones (`PRODUCT.md`, `README.md`):

1. **Especificar**: ciclo de changes con artifacts `proposal`/`design`/`tasks`/`specs` y comandos
   `/cleto-*`. Desde 0.21.0 distingue un **change de conformidad** —cita un
   `spec:<capability>#<requirement>` existente y no lleva delta— de un cambio funcional, que exige
   delta (`spec-required`). Desde 0.22.0 el delta se aplica a las specs canónicas con
   `ancleto specs merge --change <slug> [--dry-run] [--json]`; 0.22.1 endurece el parser y el
   fail-closed sin agregar flags.
2. **Descubrir**: mapa topológico del repo y empaquetado de contexto con Repomix, con presupuesto
   por tier.
3. **Recordar**: memoria persistente local de reglas y decisiones en `.ancleto/memory.db`
   (SQLite + FTS5 vía `node:sqlite`), expuesta como tools MCP.

Restricciones declaradas: **cero dependencias de runtime** y **Node ≥ 24** (`PRODUCT.md`,
`package.json`). Todo el producto se distribuye como assets Markdown instalables más un CLI ESM.

## Arquitectura

```text
src/cli/index.js        entrada única; subcomandos, instalación, plantillas, MCP, stats, check/doctor
src/cli/ui.js           banner y menús TTY propios (selectOption/selectMultiple)
src/core/
  tier-models.js        dueño de TIERS/TIER_CHAINS + resolver puro + declaredModelIds
                        + freeTierOnPrimary (modelo free sobre agente primario)
  model-catalog.js      helpers puros: parseo, diff, validación, clasificación, integridad
  model-catalog.json    snapshot verificado de IDs por proveedor
  discovery.js          mapa topológico (.discovery-map.json)
  repomix-tier.js       configuración de pack por tier (ignores/compresión/presupuesto)
  affected-set.js       grafo de imports y clausura de dependientes
  specs-merge.js        merge puro de delta specs sobre specs canónicos (0.22.0)
  machine-env.js        detección y render de .ancleto/machine-env.md
  adapters/frontmatter.js  adaptación pura de frontmatter por host (+ frontmatterValue)
  memory/               motor, DB, tools, MCP, doctor, curaduría, snapshot, working-context
scripts/refresh-model-catalog.mjs  descubrimiento dev-only del catálogo (manual)
agents/ commands/ skills/ templates/ profiles/  assets instalables (incl. contrato de conformidad)
aspec/                  config + specs + changes (incluye archive y backlog)
test/                   suite node --test (content guards incluidos)
```

- **Sin framework**: la UI de terminal y los parsers (frontmatter, refs, imports) son propios.
- **Separación por módulos**: el CLI orquesta; la lógica con invariantes vive en `src/core/*`.
  `src/core/tier-models.js` es el único dueño de la tabla de modelos, del resolver,
  `declaredModelIds` y del predicado `freeTierOnPrimary`; `src/core/model-catalog.js` es el único
  dueño del parseo, diff, validación e integridad del snapshot. El CLI importa ambos (ver
  `decisions.md`).
- **Descriptor MCP único**: `src/cli/index.js` → `HOST_MCP_TARGETS` declara archivo y esquema por
  host; `setupHostMcp`, `resolveHostMcpDestination` y `readHostMcpIntent` son los únicos caminos de
  escritura y lectura de esa intención. Ningún comando repite literales de destino por host.
- **Contrato de conformidad sin código**: desde 0.21.0 la norma de triage vive en
  `agents/orchestrator.md` y la implementan `skills/triage-clarifier`, `skills/ancleto-workflow` y
  `skills/ancleto-continue`; `src/cli/index.js` no agrega un subcomando `archive`.
- **Merge de specs aislado**: desde 0.22.0 `src/core/specs-merge.js` es un módulo **puro** (parseo,
  plan y serialización sin disco); `src/cli/index.js` resuelve rutas, lee/escribe y emite `--json`.
  `specsCommand` sólo desvía el token `merge`; `specs check` y `specs` sin argumentos conservan su
  comportamiento.
- **Estado local por proyecto**: `.ancletorc` (manifiesto), `.opencode/.ancleto-tier` (tier
  aplicado), el layout nativo de assets por host (`.opencode`, `.claude`, `.agents`,
  `.commandcode`, `.github`, `.cursor`, `.roo`), `.ancleto/memory.db` y
  `.ancleto/machine-env.md` (artefactos locales).

## Componentes principales

| Componente | Rol | Entry point |
|---|---|---|
| CLI / instalación | `init`, `install`/`update`, `upgrade`, `import`/`export`, `check`, `doctor` | `src/cli/index.js` |
| Resolución de modelos | Tiers, cadenas de fallback, catálogo, oráculo de `check`, aviso free-on-primary | `src/core/tier-models.js` |
| Catálogo de modelos | Snapshot versionado; helpers puros; integridad de IDs y refresco manual dev-only | `src/core/model-catalog.js`, `src/core/model-catalog.json`, `scripts/refresh-model-catalog.mjs` |
| Discovery | Topología, fuentes, hashes, impacto y estado del seed | `src/core/discovery.js`, `src/cli/index.js` |
| Empaquetado | Args de Repomix y presupuesto por tier | `src/core/repomix-tier.js` |
| Memoria | Nodos, supersesión, refs, recall, working-context | `src/core/memory/*` |
| Adaptación por host | Frontmatter de agents y layout de assets | `src/core/adapters/frontmatter.js`, `src/cli/index.js` |
| Ruteo MCP por host | Descriptor único de destino/esquema; escritura por host activo e intención de bundle | `src/cli/index.js` → `HOST_MCP_TARGETS`, `setupHostMcp`, `readHostMcpIntent` |
| Diagnósticos | Oráculo de instalación (`check`, salud MCP host-aware) y entorno/MCP (`doctor`) | `src/cli/index.js` → `checkCommand`, `doctorCommand` |
| Conformidad SDD | Discriminador conformidad-vs-delta y archive sin delta | `agents/orchestrator.md`, `skills/triage-clarifier`, `skills/ancleto-workflow`, `skills/ancleto-continue`, `aspec/specs/prompt-contracts/spec.md` |
| Merge de specs | Aplicación determinística de `ADDED`/`MODIFIED`/`REMOVED`/`RENAMED` por título exacto; `--dry-run`, `--json` y fail-closed; 0.22.1 agrega preámbulo H1 estructural, contenedor `archive` fail-closed y espaciado único de `ADDED`; 0.24.0 rechaza headings de sección de delta en la canónica para los cuatro tipos; desde 0.25.0 es la única vía de sync de delta del archive | `src/core/specs-merge.js`, `src/cli/index.js` → `specsMergeCommand`, `aspec/specs/spec-sync/spec.md` |
| Ciclo de archive (0.22.1) | Orden merge/sync → preflight read-only → promoción de decisiones → move → commit; fases A/B del documenter y literales de fallo | `agents/orchestrator.md`, `agents/documenter.md`, `skills/ancleto-archive/SKILL.md`, `skills/ancleto-bulk-archive/SKILL.md`, `skills/ancleto-onboard/SKILL.md`, `aspec/specs/memory-ops/spec.md` |
| Entorno de máquina | Shell, EOL y tooling del clon | `src/core/machine-env.js` |
| Assets | 10 agentes, 16 commands, 21 skills, templates y perfiles | `agents/`, `commands/`, `skills/`, `templates/`, `profiles/` |

## Flujos principales

1. **Instalación / init**: `ancleto init` crea `.ancletorc` y configura MCP; `install` materializa
   assets en el destino nativo del host, adapta frontmatter, aplica el tier (solo opencode escribe
   `model:`), mergea templates `LOCKED` y registra `installedPaths`.
2. **Ciclo SDD**: `/cleto-new` → `/cleto-propose` → `/cleto-apply` → `/cleto-verify` →
   `/cleto-archive`; los artifacts viven en `aspec/changes/<name>/` y los specs canónicos en
   `aspec/specs/`.
3. **Discovery del repo**: `ancleto discovery --compress` escribe `.discovery-map.json`, genera el
   pack y guarda `.discovery-state.json`; la skill `ancleto-technical-discovery` produce el seed.
4. **Memoria**: los agentes escriben reglas/decisiones (`recordRule`/`recordDecision` o CLI), el
   motor supersede por `memory_key`, valida refs y secretos, y materializa
   `.ancleto/working-context.md` para el arranque de sesión.
5. **Tiers**: `normal` usa modelos de `opencode-go`; `minimo` resuelve por cadena contra el catálogo;
   `gratis` usa únicamente `opencode/big-pickle`. El catálogo se refresca a mano con
   `scripts/refresh-model-catalog.mjs`; ni el runtime ni CI descubren modelos ni acceden a la red.
6. **Integridad del catálogo (0.18.12)**: todo ID declarado en `TIERS`, `TIER_CHAINS`,
   `agents/*.md` y `profiles/*/agents/*.md` se contrasta contra el snapshot. El guard de tests usa
   `declaredModelIds` + `missingModelIdsInCatalog`; `refresh-model-catalog --write` bloquea la
   escritura si falta un ID; `check` emite un aviso advisory no bloqueante si el catálogo válido no
   contiene algún ID declarado.
7. **Integridad del tier `gratis` y de `import` (0.18.13)**: `freeTierOnPrimary(model, mode)` cruza
   modelo gratis con `mode: primary`; `applyTier` avisa por `stderr` al escribir y `check` agrega una
   entrada advisory al inspeccionar, sin bloquear ni cambiar el exit code. `import` escribe
   `installedPaths` como unión acumulativa de lo declarado en el destino y lo que él mismo escribió,
   sin heredar las rutas del bundle. Desde 0.20.0, la copia y el registro de
   `.opencode/{agents,commands,skills}` sólo ocurren cuando el host activo es `opencode`.
8. **Consistencia de la nota de compresión (0.18.14)**: `install`, `init` e `import` deciden
   `CAVEMAN_USAGE_NOTE` con `resolvesHostCompression(projectDir, host, { writesCaveman, intendedNames })`,
   que combina la config MCP en disco con la escritura pendiente del comando. La nota existe para el
   orchestrator del host activo si y sólo si ese host soporta compresión y la config MCP final
   incluye `caveman`; `check` conserva su contrato advisory. `import` además valida `manifest.mcp`
   antes del primer write.
9. **Paridad de diagnóstico (0.18.15)**: sólo cambia la capa de lectura. `check` deja de avisar un
   tier huérfano cuando el host no declara superficie local de agentes (el tier queda *dormido*),
   agrega un aviso advisory por deriva entre `.ancletorc.version` y la versión del CLI, y `doctor`
   valida la config MCP del proyecto con precedencia sobre la global (desde 0.19.0, ver flujo 11).
10. **Salud de comandos MCP (0.18.16)**: `mcpCommandBroken` evalúa la existencia de una ruta
    absoluta (incluida `C:\...` en Windows); una ruta sana deja de reescribirse en `import --repair`
    y en los `refresh*`. `findProjectMcpFile` y `PROJECT_MCP_CANDIDATES` concentran el
    descubrimiento `.opencode/opencode.json|jsonc`; `check` agrega avisos no bloqueantes por config
    no parseable y por comandos rotos; `import` avisa antes de reemplazar una config no parseable.
11. **Ruteo MCP por host (0.19.0)**: `HOST_MCP_TARGETS` es el descriptor único
    (`opencode` → `.opencode/opencode.json|jsonc`, `antigravity` → `.agents/mcp_config.json`,
    `commandcode` → `.mcp.json`, `copilot` → `copilot-mcp.json`; `claude`, `vscode`, `cursor` y `roo`
    sin destino). `init`, `install`/`update`, `import` e `import --repair` escriben en el destino del
    host activo y no crean `.opencode` en hosts que no lo leen. `check` inspecciona los destinos
    existentes de los hosts instalados (derivados de `installedPaths`) y `doctor` prioriza el host
    activo/instalados antes del fallback global de `opencode`; todo hallazgo MCP sigue siendo
    advisory y los exit codes no cambian.
12. **Bundle host-neutral (0.20.0)**: `readHostMcpIntent(projectDir, host)` resuelve la intención MCP
    del destino del host activo. `export` la usa: destino ausente → `manifest.mcp = []` sin aviso;
    archivo no parseable → `manifest.mcp = []` y un único aviso no bloqueante con exit 0; hosts sin
    destino conservan la lectura legacy de `.opencode`. `import` copia y registra `.opencode/*` sólo
    cuando el host activo es `opencode`; en los demás hosts los assets se materializan por
    `installAgentAssets`, y `installedPaths` sigue siendo la unión de lo realmente escrito.
13. **Reparación MCP sin escritura (0.20.1)**: `repairProjectMcp` (`src/cli/index.js`) escribe el
    destino del host activo sólo si el archivo no parsea, si la estructura requiere normalización
    (raíz no-objeto o clave de esquema presente no-objeto) o si reparó/agregó alguna entrada. Un
    destino sano conserva bytes y mtime; un destino inexistente sin entradas que reparar no se crea.
    La garantía se acota a `import`/`import --repair`; `install`/`init` y `upgrade` siguen
    reescribiendo el mismo destino.
14. **Conformidad sin delta (0.21.0)**: un change sin `specs/` se clasifica como conformidad sólo si
    su `proposal.md` cita un `spec:<capability>#<requirement>` que resuelve contra
    `aspec/specs/<capability>/spec.md` y no hay bloques `ADDED/MODIFIED/REMOVED/RENAMED`. En ese
    caso no se crea delta; el archive informa "sin delta" nombrando el Requirement, valida la cita
    fail-closed, completa move y promoción, y no modifica `aspec/specs/**/*.md`. Sin cita resoluble
    el archive se rechaza; si la spec falta o contradice, el change es funcional (`spec-required`).
    `agents/orchestrator.md` es dueño de la norma y las skills de triage/workflow/continue la
    implementan; no hay subcomando CLI `archive`.
15. **Merge determinístico de specs (0.22.0–0.22.1)**: `ancleto specs merge --change <slug>` resuelve
    el change activo (`aspec/changes/<slug>/`) o archivado
    (`aspec/changes/archive/YYYY-MM-DD-<slug>/`), lee `<changeDir>/specs/<capability>/spec.md` y
    aplica las operaciones por título exacto de `### Requirement:` sobre
    `aspec/specs/<capability>/spec.md`. El módulo puro computa todos los planes antes de escribir;
    cualquier error fail-closed (exit 2) deja cero escrituras, y `--dry-run` nunca escribe, tampoco
    ante el contenedor `archive`. `MODIFIED` reemplaza el bloque completo, `ADDED` idéntico y
    `REMOVED` ausente son no-op, y `RENAMED` cambia sólo el heading. 0.22.1 acepta a lo sumo un H1
    estructural al inicio del delta, rechaza un segundo H1 o contenido suelto, deja exactamente una
     línea en blanco tras `ADDED` y documenta que la fase de escritura no es transaccional. Desde
     0.24.0, la fase de plan también rechaza (exit 2, cero escrituras, `--dry-run` incluido) una spec
     canónica que contenga `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED
     Requirements` o `## RENAMED Requirements`; el guard aplica a los cuatro tipos y sólo a la
     canónica, no al delta. Las canónicas `copilot-support`, `legacy-import` y `test-profile` se
     normalizaron a `## Requirements`. No crea capabilities nuevas ni modifica deltas, memoria, seed,
     `package.json`, `specs check` ni affected-set.
16. **Orden del archive (0.22.1)**: el archive ejecuta merge/sync de specs → preflight read-only de
    las decisiones `## Decisiones` aprobadas → promoción a `.ancleto/memory.db` → move del change →
    commit. La promoción ocurre antes del move para que las refs `path:` sigan resolviendo. Si el
    preflight o la promoción fallan, el change no se mueve y se reporta `no archivado; memoria
    pendiente`; si el move falla tras promover, se reporta `memoria promovida; NO archivado`. La
    secuencia vive en `agents/orchestrator.md`, `agents/documenter.md` (fases A y B) y las skills de
    archive/onboard; `ancleto upgrade` regenera los mirrors.
17. **Idempotencia de memoria (0.23.0)**: `recordNode` compara la tupla
    `(type, scope, content, justification)` contra el nodo activo de la misma `memory_key`. Si es
    exactamente igual, no inserta ni supersede (`superseded: 0`) y devuelve los valores persistidos
    con su `created_at` original; `createdAt`, `source` y `confidence` no cuentan. Cualquier
    diferencia supersede como antes. `importNodes` conserva su semántica last-writer-wins.
18. **Portabilidad y templates (0.23.0)**: `import` de un bundle sin la clave `manifest.mcp` emite un
    aviso no bloqueante (exit code y salida escrita sin cambios; `mcp: []` es silencioso y un valor
    no-array sigue fallando con exit 1). `reconcileLegacyBlocks` preserva el EOL de cada línea
    superviviente y el estado de newline final de la entrada al eliminar un run legacy; sin
    eliminación devuelve el contenido byte a byte.
19. **Tier `minimo` alineado a la canónica (0.24.0)**: `TIERS.minimo` y la cabeza de
    `TIER_CHAINS.minimo` quedan en `opencode-go/deepseek-v4.1-flash`, el `model:` que publican los
    diez `agents/*.md`; `MINIMO_CHAIN` queda con dos candidatos
    (`opencode-go/deepseek-v4.1-flash` → `opencode/deepseek-v4.1-flash-free`) y retira
     `commandcode/deepseek/deepseek-v4.1-flash`. `install`/`init`/`import --tier minimo` escriben el
     mismo modelo que la canónica y `check` deja de reportar divergencia.
20. **Archive ruteado y ayuda sin ejecución (0.25.0)**: el sync de delta del archive y del
    bulk-archive se hace exclusivamente con `ancleto specs merge --change <slug>`; el guard canónico
    fail-closed aplica también a ese camino y un exit no cero aborta el archive antes del preflight,
    la promoción y el move. En paralelo, un guard central en el dispatch (`SUBCOMMAND_HELP` +
    `wantsHelp`) hace que `--help`/`-h` en los subcomandos que mutan estado imprima el uso, salga con
    exit 0 y no escriba nada; `discovery` conserva su handler y la ayuda global su propio camino.
21. **`seedMapPresent` state-independent (0.26.0)**: `discovery --check` calcula `seedMapPresent`
    antes de clasificar el estado, así que un `seed-map.json` con `docs` objeto plano da `true` en
    `READY`, `STALE`, `PARTIAL` y `MISSING`; `readSeedMap` rechaza un `docs` que no sea objeto plano
    (arreglo o `null`). `affectedDocs` sigue dependiendo de `changedAreas` y sólo se puebla en
    `STALE`.
22. **Detector de frescura documentado y pineado (0.26.1)**: el comportamiento vigente de
    `discovery --check` —precedencia de `impact`, lista cerrada de archivos materiales, `areaOf`,
    formas exactas de `materialReasons`/`notes`, estructura de estado y read-only— queda fijado en
    un `ADDED` de `aspec/specs/cli-diagnostics/spec.md` y cubierto por tests de pin. No cambia
    `src/`: un cambio futuro en `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `isMaterialFile`, `areaOf` o
    `computeImpact` exige un delta `MODIFIED`, no un patch documental.
23. **Consolidación de tests (0.26.2)**: los tres walkers de snapshot read-only de
    `test/cli.test.js` pasan a un único helper parametrizado por modo (con guard fail-closed ante un
    modo desconocido e invariante de `mtime` discriminante), y se pinean los estados `MISSING`/
    `PARTIAL` de `discovery --check` y la variante "estado existente sin `hash`" (`STALE`/`material`/
    `regenerate`). No cambia runtime ni comportamiento observable.
24. **`recommendedAction` alineado en `cli-diagnostics` (0.26.x)**: el Requirement de frescura queda
    documentado con la excepción que el CLI ya implementa —`generate` en `MISSING` y `complete` en
    `PARTIAL`, aun con `impact: none`, en lugar de `continue`— y los tests de pin fijan ambos
    valores. No cambia `src/` ni el comportamiento observable: release documental/test.
25. **Guard estructural de deltas activos (0.26.4)**: `test/delta-spec-structure.test.js` recorre
    `aspec/changes` (excluyendo `archive` por identidad) y valida cada
    `<change>/specs/<capability>/spec.md` con el parser real del merge, `parseDeltaSpec`; tolera cero
    deltas activos y no toca `src/`. El Requirement nuevo vive en `spec-sync` y el release es
    test-only.
26. **Frescura y estado versionado (0.27.0)**: `discovery --check` deja de tratar el valor de
    `version` de primer nivel del `package.json` raíz como cambio material ni de contenido (el resto
    del archivo sigue siendo material), y `.discovery-state.json` agrega `ruleVersion: 2` +
    `semantic: { hash, fileHashes }` conservando los hashes crudos; los estados legacy se comparan
    crudos. El guard de `test/delta-spec-structure.test.js` suma la detección de un `spec.md` de
    change activo fuera de `specs/<capability>/spec.md`. Release minor del change
    `seed-freshness-version-bump-not-material`.
27. **Rutas efímeras fuera de la frescura (0.28.0)**: `discovery --check` deja de contar `.ancleto`,
    cualquier ruta bajo `.ancleto/` y el `.discovery-map.json` raíz como cambio de frescura. Un único
    predicado anclado (`isEphemeralSource`) filtra simétricamente las vistas persistida y actual de
    `sources` antes de `computeImpact`, y `isEphemeralOnlyChange` sólo concede `READY` ante un desvío
    de hash si existe al menos una ruta cambiada y todas son efímeras. El writer, la forma del estado
    persistido y `ruleVersion: 2` no cambian; un estado legacy sin `fileHashes` sigue `STALE`/`minor`.
    Release minor del change `seed-freshness-ephemeral-paths` (delta `MODIFIED` de `cli-diagnostics`).

## Recorrido de una instalación con tier `minimo`

`ancleto install --project . --tier minimo` → `resolveTierMap('minimo')` carga
`src/core/model-catalog.json` y elige por agente el primer candidato disponible de
`TIER_CHAINS.minimo` (`opencode-go/deepseek-v4.1-flash` →
`opencode/deepseek-v4.1-flash-free`) → si ninguno está,
aborta sin escribir modelos inventados → `applyTier` reescribe `model:` en
`.opencode/agents/*.md` → se persiste `minimo` en `.opencode/.ancleto-tier`.

Para confirmar un detalle, leer el archivo citado en el documento correspondiente; el seed
orienta, no reemplaza al código.
