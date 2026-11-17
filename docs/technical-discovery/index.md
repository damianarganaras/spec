---
node: index
kind: router
read_when: "punto de entrada del seed: elegir qué documento leer según la pregunta"
generatedAt: 2026-11-17T12:12:05Z
pluginVersion: 0.39.1
skillVersion: '2.3'
---

# Seed técnico — @ancleto/spec

Mapa de navegación del repositorio `@ancleto/spec` (CLI `ancleto`, alias `aspec`). No es un
inventario: enruta a la respuesta más corta. Evidencia base: pack Repomix comprimido del tier
`minimo` (895 fuentes, ~45.009 tokens), `package.json` (`0.39.1`), `src/core/model-catalog.json` y
el reporte `ancleto discovery --check`. El pack lo generó el CLI del propio repo
(`node src/cli/index.js discovery`) con la compresión del tier `minimo`; ese tier excluye `test/**`,
`docs/**` y `**/*.md` del cuerpo del pack, y el pack llega comprimido (cuerpos de funciones elididos).
La lista `sources` que mide el seed la calcula `computeSources` con `discovery.exclude`, no el tier. Por eso las áreas
Markdown —`aspec/specs/**`, `aspec/changes/**`, `agents/**`, `skills/**`, `README.md`,
`CHANGELOG.md`— y los detalles finos de comportamiento se verificaron por lectura directa de los
paths citados (ver `unknowns.md`).

## Ruteo por pregunta

| Si la pregunta es sobre… | Leer |
|---|---|
| Qué es el proyecto, propósito, arquitectura, componentes y flujos principales | `overview.md` |
| Instalar, ejecutar, comandos, entorno, tiers, tests, lint, validaciones | `setup.md` |
| Reglas, contratos, riesgos, deuda, acoplamiento e impacto de cambios | `decisions.md` |
| Sistemas externos y dependencias observables (npm, GitHub, Repomix, git, MCP, opencode) | `integrations.md` |
| Catálogo de unidades (módulos, agents, skills, commands) con propósito y entry point | `units/_map.md` |
| **Frescura del seed (0.26.0–0.30.2)**: contrato de `discovery --check` (`schemaVersion:2`, read-only, `impact` `none|minor|material`, lista de archivos materiales, `areaOf`, formas exactas de `materialReasons`/`notes`, estado `READY/STALE/PARTIAL/MISSING`), `seedMapPresent` state-independent, `recommendedAction` (`generate` en `MISSING`, `complete` en `PARTIAL`, excepción a `impact:none` → `continue`) y, desde 0.27.0, el bump de `version` de primer nivel del `package.json` raíz no cuenta como cambio material ni de contenido y el estado persistido declara `ruleVersion: 2` + `semantic: { hash, fileHashes }`; desde 0.28.0, `.ancleto`, cualquier ruta bajo `.ancleto/` y el `.discovery-map.json` raíz son efímeras y un filtro simétrico de lectura en `checkDiscovery` las excluye de áreas y materialidad, conservando la forma del estado; desde 0.29.0, `documentation`/`documentation/**` y `audit logs`/`audit logs/**` anclados a la raíz también son efímeros (gitignored, 0 tracked; 674+18 entradas en el estado), mientras `docs/**` y `aspec/**` siguen contando y el writer, la forma del estado y `ruleVersion: 2` no cambian; desde 0.30.0 los patrones de `discovery.exclude` se traducen por segmentos (`**/`, `/**`, `**`, `*`, `?`) con anclaje `^…$` o `^(…)(?:/|$)`, por lo que `**/*.test.*` y `**/*.spec.*` excluyen rutas `test/*.test.js` de `sources` (872→854 en 0.30.0; 22 rutas en 0.30.1); desde 0.30.1 el matcher vive en `src/core/discovery-glob.js` y cachea el `RegExp` por string exacto de glob (15,04 ms → 1,63 ms, 9,2× sobre 9.669 evaluaciones), sin cambio de semántica ni de `ruleVersion`; 0.30.2 es un patch documental: alinea la canónica para distinguir `version: 1` + `ruleVersion: 2` del estado persistido frente a `schemaVersion: 2` de la salida de `--check`, con un pin de test no conductual y sin cambio de runtime | `decisions.md`, `units/discovery-engine.md` |
| **Merge de specs (0.22.0–0.27.0)**: `ancleto specs merge --change <slug> [--dry-run] [--json]`, `src/core/specs-merge.js`, capability `spec-sync`; preámbulo H1 estructural, contenedor `archive` fail-closed, `ADDED` con una línea en blanco, atomicidad acotada al plan y, desde 0.24.0, heading de sección de delta en la canónica fail-closed para los cuatro tipos; desde 0.26.4 la suite declarada valida la estructura de los deltas de changes activos con `parseDeltaSpec` y, desde 0.27.0, un guard detecta un `spec.md` de change activo fuera de `specs/<capability>/spec.md` | `decisions.md`, `units/cli-install.md`, `units/_map.md` |
| **Orden del archive (0.22.1)**: merge/sync → preflight read-only → promoción de `## Decisiones` → move → commit; literales de fallo y superficies canónicas | `decisions.md`, `units/memory-engine.md`, `units/_map.md` |
| **Conformidad vs cambio funcional (0.21.0)**: predicado de cita resoluble + ausencia de bloques delta, `spec-required`, ruteo único | `decisions.md`, `overview.md`, `units/_map.md` |
| **Archive de conformidad sin delta (0.21.0)**: reporte "sin delta", cita fail-closed, garantía acotada, reuso del ledger cerrado | `decisions.md`, `units/cli-install.md` |
| **Modelos por tier**: `TIERS` agente→string, `TIER_CHAINS` (`minimo` con dos candidatos), resolver contra catálogo, `gratis` free-only, oráculo de `check` | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Modelo gratis sobre agente primario**: `freeTierOnPrimary(model, mode)`, aviso en `applyTier` (set-time) y en `check` (inspect-time) | `decisions.md`, `units/cli-install.md` |
| **Diagnósticos `check`/`doctor` (0.18.15–0.19.0)**: deriva de `.ancletorc.version`, tier dormido sin superficie de agentes, precedencia de config MCP y alcance host-aware | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Salud MCP (0.18.16–0.19.0)**: `mcpCommandBroken` por existencia, `findProjectMcpFile`/`PROJECT_MCP_CANDIDATES`, avisos de `check` sobre los destinos de los hosts instalados, aviso de `import` | `decisions.md`, `setup.md`, `units/cli-install.md` |
| **Capabilities `cli-diagnostics`, `agent-install-routing`, `project-portability`, `prompt-contracts`, `spec-sync`** y changes archivados de diagnóstico, portabilidad, conformidad y merge de specs | `decisions.md`, `overview.md`, `units/cli-install.md` |
| **Nota de compresión host-scoped**: `resolvesHostCompression`, gate estado-driven en `install`/`init`/`import`, alcance host activo, excepción M2 | `decisions.md`, `units/cli-install.md` |
| **Validación de bundles**: `manifest.mcp` debe ser array de entradas con `name` string antes del primer write | `decisions.md`, `units/cli-install.md` |
| **Catálogo de modelos**: snapshot de 5 proveedores / 211 IDs, helpers `declaredModelIds` / `modelIdsFromCatalog` / `missingModelIdsInCatalog`, guard de integridad | `decisions.md`, `units/discovery-engine.md` |
| **Integridad de IDs declarados**: fuentes versionadas, helper puro, gate de `--write` y aviso advisory de `check` | `decisions.md`, `units/discovery-engine.md`, `units/cli-install.md` |
| **Descubrimiento dev-only**: clasificaciones `available`/`binary-missing`/`network-unavailable`/`partial`, `looksBinaryMissing` locale-independent, diff y escritura atómica | `units/discovery-engine.md`, `integrations.md` |
| CLI: `init`/`install`/`update`/`upgrade`, wizard TTY, rutas por host, adaptadores, MCP, `check`, `doctor`, `specs merge` | `units/cli-install.md` |
| **Ruteo MCP por host (0.19.0)**: `HOST_MCP_TARGETS`, `setupHostMcp`, destinos por host, `check`/`doctor` host-aware | `decisions.md`, `units/cli-install.md` |
| **Bundle host-neutral (0.20.0)**: `readHostMcpIntent`, `export` por host, `import` con copia `.opencode/*` sólo en `opencode` | `decisions.md`, `units/cli-install.md` |
| **Reparación MCP sin escritura (0.20.1)**: `repairProjectMcp` escribe sólo ante error de parseo, normalización estructural o entradas reparadas/agregadas; destino sano intacto | `decisions.md`, `units/cli-install.md` |
| Portabilidad `export`/`import`: bundle, `--repair`, `installedPaths` acumulativo | `units/cli-install.md`, `decisions.md` |
| Discovery: mapa topológico, pack Repomix, estado del seed, `affectedDocs`, affected-set | `units/discovery-engine.md` |
| Memoria persistente: SQLite+FTS5, tools MCP, recall, refs, working-context, ops, doctor, curate, `memory status` advisory, `memory doctor` sobre base sin esquema, superficies de lectura estrictamente read-only (0.39.0) y `gc --dry-run` read-only con fallback legacy (0.39.1) | `units/memory-engine.md` |
| **Conjunto crítico del working-context (0.31.0)**: `memory.criticalKeys` en `.ancletorc` (seam de configuración), claves inyectadas primero en orden declarado, lectura tolerante (ausente/no-array/entradas no-string → `[]`), fallo duro en `ancleto memory context` con `--out` sin sobrescribir, `console.warn` best-effort en lifecycle/on-write/MCP y exit ≠ 0 en `memory merge`/`consolidate --apply`; `<ContextOverflowWarning>` intacto | `decisions.md`, `units/memory-engine.md`, `setup.md` |
| **Selección de tests afectados (0.32.0)**: `ancleto affected --tests` agrega el objeto `tests` (`complete`, `reasons`, `selected`, `excluded`) al JSON existente, con el manifiesto cerrado `test/affected-tests.json` y el consumidor `npm run test:affected` que cae fail-closed a la suite completa | `decisions.md`, `setup.md`, `units/discovery-engine.md`, `units/cli-install.md` |
| **Serialización de escritores y doctor (0.33.0–0.33.1)**: `runImmediateTransaction` (`BEGIN IMMEDIATE` + retry 3/200-600 ms), `MEMORY_DB_BUSY` y oráculo `test/memory-writers.test.js`; desde 0.33.1 `memory doctor --rebuild` corre rebuild FTS5 + integrity-check dentro del helper y reporta `MEMORY_DB_BUSY` en el detalle, mientras el `doctor` por defecto sigue read-only; sin cambio de schema, PRAGMAs, comandos ni `ruleVersion` | `decisions.md`, `units/memory-engine.md` |
| **Import con dry-run clasificado (0.34.0)**: `memory import --dry-run [--json]` predice `insert`/`supersede`/`skip` por `memory_key` con buckets `nuevo`/`identico`/`divergente`/`tombstone`, comparte `decideImportEntry` con el import real, abre read-only, reporta `databasePresent` y no escribe ni refresca el working-context | `decisions.md`, `units/memory-engine.md`, `setup.md` |
| **GC por instante y snapshot de curaduría (0.35.0)**: `memory gc` compara `julianday(COALESCE(superseded_at, created_at))` contra un cutoff único y retiene fechas no parseables; `status='deleted'` es un estado reservado que no se purga ni cuenta; `memory curate` compone su reporte bajo un único snapshot `BEGIN DEFERRED` (`runReadTransaction`) y resuelve refs después del commit; el literal de gramática de refs tiene fuente única (`REF_GRAMMAR`) | `decisions.md`, `units/memory-engine.md` |
| **Puerta de criticidad de memoria (0.36.0)**: `memory merge` y `memory consolidate --apply` rechazan antes de escribir cuando supersederían una `memory_key` declarada en `.ancletorc` → `memory.criticalKeys`; dry-run y apply reportan `criticalAffected`, `--force-critical` autoriza de forma explícita, el rechazo sale con exit 2 y `{"error":"critical-key-gate","criticalAffected":[...]}` con `--json`; `consolidate` sin base sale con código 1 | `decisions.md`, `units/memory-engine.md`, `setup.md` |
| **Reparación de refs (0.37.0)**: `memory repair refs --memory-key <key> [--apply] [--json] [--force-critical]` opera sobre un único nodo activo y remueve solo refs verificables con motivo exactamente `inexistente`; dry-run por defecto en read-only, `--apply` supersede con el writer transaccional, allowlist conserva `commit:`/`workitem:` y cualquier otro motivo, el candidato se valida con el mismo fail-closed que la escritura y el gate crítico sale con exit 2 sin `--force-critical` | `decisions.md`, `units/memory-engine.md`, `setup.md` |
| **Estado advisory de memoria (0.38.0)**: `ancleto memory status [--json]` read-only y advisory con exit 0 en `ok`/`empty`/`no-db`/`uninitialized`, `expected` derivado de `aspec/changes/archive/*/proposal.md`, `gap = expected && status !== 'ok'`, recuperación por `memory export`/`import`/`snapshot`; `memory doctor` completa sus 5 checks y sale ≠ 0 sobre una base sin esquema, sin excepción no capturada | `decisions.md`, `units/memory-engine.md`, `setup.md` |
| **Superficies de lectura read-only (0.39.0–0.39.1)**: `memory context`, `list`, `export`, `curate`, `status`, `doctor`, `merge --dry-run`, `repair refs` sin `--apply`, `import --dry-run` y `gc --dry-run` abren con `{ readonly: true, migrate: false }` y precheck de `sqlite_master`; `context`/`export` ya no migran una base de 0 bytes, `export` sin esquema sale 1, `list` sale 0 nombrando el esquema no inicializado, `merge --dry-run`/`repair refs` degradan con exit 1 sin stack, `gc --dry-run` sin base/sin esquema sale 0 e ilegible sale 1 sin stack, `.db` conserva SHA-256 y `sqlite_master`, los sidecars WAL se toleran y el fallback legacy mide GC por `created_at` sin migrar; sin cambios de schema, PRAGMAs persistentes ni `ruleVersion` | `decisions.md`, `units/memory-engine.md`, `setup.md` |
| Errores o fallos de tool parts de sesiones opencode (`stats failures`) | `units/cli-install.md`, `integrations.md` |
| Límites de evidencia: qué no se pudo verificar | `unknowns.md` |
| Cobertura por directorios/globs | `inventory.md` |

## Hechos de orientación

- **Tipo**: librería/CLI de Node.js, ESM, **cero dependencias de runtime**, `engines.node: ">=24.0.0"`.
- **Entry point**: `src/cli/index.js` (bins `ancleto` y `aspec` en `package.json`).
- **Producto**: orquestador SDD para IDEs con descubrimiento técnico, memoria persistente local
  (`.ancleto/memory.db`, `node:sqlite`) y control explícito de costo por tier. Desde 0.21.0 el
  ciclo distingue **changes de conformidad** (citan un Requirement existente y no llevan delta) de
  cambios funcionales; desde 0.22.0 el merge de delta specs es un comando CLI determinístico,
  endurecido en 0.22.1, y desde 0.22.1 el archive promueve las decisiones aprobadas antes del move.
  `recordNode` es idempotente ante reescrituras idénticas, `import` avisa (sin bloquear) ante un
  bundle legacy sin `manifest.mcp` y `reconcileLegacyBlocks` preserva el EOL por línea. En 0.24.0 el
  tier `minimo` usa la cadena de dos candidatos `opencode-go/deepseek-v4.1-flash` →
  `opencode/deepseek-v4.1-flash-free`, y `specs merge` rechaza una canónica con heading de sección de
  delta para los cuatro tipos. En 0.25.0 el sync de delta al archivar pasa exclusivamente por
  `ancleto specs merge --change <slug>` (incluido bulk-archive) y `--help`/`-h` en los subcomandos que
  mutan estado imprime el uso y sale con 0 sin escribir nada.
- **Versión del repo**: `package.json` = `0.39.1` (rama `development`). `.ancletorc` y
  `.ancleto/machine-env.md` son artefactos gitignored que se regeneran en `init`/`install`/`upgrade`;
  esta materialización no los usa como fuente de reglas.
- **Release 0.39.1**: cierra el último hueco read-only. `memory gc --dry-run` abre con
  `{ readonly: true, migrate: false }` vía `openReadableMemory`, así que no crea `.ancleto/` ni
  `memory.db`, no migra y no ejecuta DDL/`VACUUM`/`REINDEX`; sin base o sin esquema sale 0, una base
  ilegible sale 1 sin stack y una base legacy sin `superseded_at` mide la elegibilidad por
  `created_at` sin alterar el esquema. `memory gc` sin `--dry-run` conserva engine de escritura,
  migración y purga con `VACUUM` + `REINDEX`. Change: `aspec/changes/archive/2026-11-17-memory-gc-dry-run-readonly/`.
  **Publicada y verificada el 2026-11-17**: tag anotado `v0.39.1` → merge `6168965`, publish run
  `44113826461` (success), `@ancleto/spec@0.39.1` como `latest` en npm (`gitHead` `6168965`) y
  tarball HTTP 200 (`aspec/backlog.md`). Sin cambios de schema, PRAGMAs persistentes ni
  `ruleVersion`.
- **Release 0.39.0**: las **superficies de lectura de memoria** son estrictamente read-only. `context`,
  `list`, `export`, `curate`, `status`, `doctor`, `merge --dry-run`, `repair refs` sin `--apply` e
  `import --dry-run` abren con `{ readonly: true, migrate: false }` y un precheck de esquema
  (`hasMemorySchema`, consulta de `sqlite_master` compartida con `status`/`doctor`); el engine se
  construye después del precheck y dentro del manejo de error. `context` y `export` dejan de migrar una
  base de 0 bytes; `export` sin esquema sale con 1, `list` con 0 nombrando el esquema no inicializado,
  y `merge --dry-run`/`repair refs` degradan con exit 1 sin stack. Sobre una base existente el `.db`
  conserva su SHA-256 y el conjunto de `sqlite_master`; los sidecars `-wal`/`-shm` de una apertura WAL
  read-only se toleran. Sin cambios de schema, PRAGMAs persistentes ni `ruleVersion`. **Publicada y verificada el 2026-11-16**: tag
  anotado `v0.39.0` → merge `918534c`, publish run `43995807583` (success), `@ancleto/spec@0.39.0`
  como `latest` en npm (`gitHead` `918534c`) y tarball HTTP 200 (239.745 bytes) (`aspec/backlog.md`).
- **Release 0.38.0**: `ancleto memory status [--json]` es un subcomando read-only y advisory que
  declara el **gap de memoria de producto** tras clone/worktree. Distingue `ok`, `empty`, `no-db` y
  `uninitialized`; deriva `expected` de los `proposal.md` archivados que declaran decisiones
  (`## Decisiones` + `**memory_key:**`) y calcula `gap = expected && status !== 'ok'`; con `gap`
  sugiere `memory export`/`memory import`/`memory snapshot`. La raíz de la DB y de la evidencia es
  el `cwd` (un subdirectorio sin archive propio no declara gap). Sale con 0 en todos los estados y
  reserva 1 a errores de E/S o flags desconocidas. Además, `memory doctor` ya no aborta con una base
  sin esquema: reporta los cinco checks con `ok: false` y sale ≠ 0 sin excepción ni stack trace. Sin
  cambios de schema, PRAGMAs persistentes ni forma del export/snapshot; cierra `CH-01/T27` por su
  mitad viva (el reindex desde `proposals` sigue refutado). **Publicada y verificada el 2026-11-16**:
  tag anotado `v0.38.0` → merge `ab751cc`, publish run `43889435565` (success), `@ancleto/spec@0.38.0`
  como `latest` en npm (`gitHead` `ab751cc`) y tarball HTTP 200 (238.493 bytes); el canary del
  workflow devolvió 404 por propagación de CDN, no bloqueante (`aspec/backlog.md`).
- **Release 0.37.0**: `memory repair refs` repara de forma explícita las refs no resueltas de un
  único nodo activo. Remueve solo las refs verificables con motivo exactamente `inexistente` y
  preserva byte a byte el resto del `content` (prosa, separadores, indentación y demás refs); el
  dry-run por defecto usa la conexión read-only y `--apply` es la única vía de escritura, por
  supersede con el writer transaccional del motor. La salida `--json` es determinística
  (`status`, `memory_key`, `dry_run`, `applied`, `critical`, `removed[]`, `remaining`). La allowlist
  nunca remueve `commit:`/`workitem:` (no verificables localmente) ni motivos distintos de
  `inexistente` (`ambiguo (<n> coincidencias)` y futuros se conservan); el dry-run valida el
  `content` candidato con la misma validación fail-closed que la escritura y nombra la ref ofensora.
  `--apply` sobre una clave de `memory.criticalKeys` sin `--force-critical` no escribe y sale con
  código 2 (`{"error":"critical-key-gate","criticalAffected":[...]}` con `--json`); el dry-run
  reporta `critical: true` y sale 0. Sin cambios de schema, PRAGMAs persistentes ni `ruleVersion`.
  Publicada el 2026-11-16: tag anotado `v0.37.0` → `da10910`, publish run `43801796586` (success) y
  `@ancleto/spec@0.37.0` como `latest` en npm (`aspec/backlog.md`).
- **Release 0.36.0**: `memory merge` y `memory consolidate --apply` incorporan una **puerta de
  criticidad** atómica dentro de la misma `BEGIN IMMEDIATE` que la escritura. El conjunto crítico es
  el ya existente `.ancletorc` → `memory.criticalKeys` (lectura tolerante: ausente, no-array o
  inválido equivale a `[]` y desactiva el bloqueo). El dry-run y el plan de `merge` publican
  `criticalAffected` (intersección con las sources/superseded; el target/canónico y los
  near-duplicates no cuentan) y nunca bloquean. Sin `--force-critical`, la corrida real rechaza con
  `code: MEMORY_CRITICAL_KEY`, exit 2, cero filas modificadas y, con `--json`, stdout
  `{"error":"critical-key-gate","criticalAffected":[...]}`; sin `--json`, stderr nombra las claves.
  El flag sólo tiene efecto en la corrida real. Además, `memory consolidate` sin base sale con
  código 1 (antes reportaba éxito). Sin cambios de schema, PRAGMAs, `ruleVersion` ni formato
  persistido; un binario 0.35.0 ignora `--force-critical` (riesgo de downgrade documentado).
- **Release 0.35.0**: corrige la elegibilidad de `memory gc` midiendo instantes con
  `julianday(COALESCE(superseded_at, created_at)) < julianday(?)` en sus tres statements (SELECT,
  DELETE y desvinculación de `superseded_by`), conserva las filas con fechas no parseables y trata
  `status='deleted'` como estado reservado que ningún writer produce; `memory curate` compone su
  reporte bajo un único snapshot read-only (`runReadTransaction`, `BEGIN DEFERRED`) y resuelve refs
  después del commit; el literal de gramática de refs queda en `REF_GRAMMAR`. Sin cambios de schema,
  PRAGMAs, flags ni `ruleVersion` (ver `decisions.md` y `units/memory-engine.md`).
- **Release 0.34.0**: `memory import` gana `--dry-run` y `--json`; clasifica cada entrada por
  `memory_key` en `nuevo`, `identico`, `divergente` y `tombstone`, con acción predicha
  `insert`/`supersede`/`skip`, sobre `createReadonlyMemoryEngine` y sin escribir ni refrescar el
  working-context. La clasificación comparte `decideImportEntry` con el import real (ver
  `decisions.md` y `units/memory-engine.md`); sin cambios de schema, PRAGMAs, comandos sin flags,
  `ruleVersion`, dependencias ni superficies de agentes/skills/templates.
- **Release 0.33.1 (sin change archivado)**: `fix(memory)` hace que `memory doctor --rebuild`
  ejecute el rebuild de FTS5 y su integrity-check dentro de `runImmediateTransaction`
  (`BEGIN IMMEDIATE` + retry 3/200-600 ms) y reporte `MEMORY_DB_BUSY` en el detalle del check al
  agotar el presupuesto; el `doctor` por defecto sigue read-only y no cambian comandos, flags,
  schema persistido, PRAGMAs ni `ruleVersion`. El requirement de `memory-engine` se actualizó en el
  lugar.
- **Cambios recientes archivados**:
  `aspec/changes/archive/2026-11-17-memory-gc-dry-run-readonly/` (0.39.1:
  `memory gc --dry-run` pasa a apertura estrictamente read-only con degradación determinista
  sin base/sin esquema → exit 0, ilegible → exit 1 sin stack, y fallback legacy por `created_at` sin
  migrar; `gc` real conserva migración y `VACUUM` + `REINDEX`; sin cambio de schema ni `ruleVersion`),
  `aspec/changes/archive/2026-11-16-memory-readonly-surfaces/` (0.39.0: `ADDED` del
  Requirement `Superficies de lectura de memoria estrictamente read-only` en `memory-ops`; apertura
  `readonly: true` + `migrate: false`, precheck de `sqlite_master` reutilizado, mapa de degradación
  por superficie y estado, `.db` con SHA-256 y `sqlite_master` idénticos, sidecars WAL tolerados y
  `memory doctor` sobre base ilegible sin stack; sin cambio de schema ni `ruleVersion`),
  `aspec/changes/archive/2026-11-16-memory-gap-declaration/` (0.38.0: `ADDED` del subcomando
  `memory status` y de los Requirements de estado advisory en `memory-ops`; `expected`/`gap`,
  recuperación por export/import/snapshot, raíz única en `cwd` y read-only estricto; el fix de
  `memory doctor` sobre base sin esquema cierra los cinco checks sin abortar; sin cambio de schema
  ni `ruleVersion`; cierra `CH-01/T27`),
  `aspec/changes/archive/2026-11-16-memory-repair-refs/` (0.37.0: `ADDED` del subcomando
  `memory repair refs` y de los Requirements de reparación en `memory-ops`; allowlist por motivo
  `inexistente`, preservación byte a byte, dry-run read-only y `--apply` por supersede con gate
  crítico; sin cambio de schema ni `ruleVersion`; cierra `CH-09b`),
  `aspec/changes/archive/2026-11-15-ch-09a-criticality-gate/` (0.36.0: `MODIFIED` de los
  Requirements de merge, consolidación y comando `memory merge` en `memory-ops`; puerta de
  criticidad pre-write con `criticalKeys`/`forceCritical`, `criticalAffected` en dry-run y apply,
  exit 2 con `{"error":"critical-key-gate","criticalAffected":[...]}`; sin cambio de schema ni
  `ruleVersion`; cierra `CH-09a`),
  `aspec/changes/archive/2026-11-15-mem-05-gc-eligibility-curate-snapshot/` (0.35.0: `MODIFIED` de
  los Requirements de GC y de curaduría en `memory-ops`; elegibilidad por instante con `julianday`,
  `deleted` reservado, retención de fechas no parseables, snapshot único de lectura en `curate` y
  literal de gramática de refs con dueño único; sin cambio de schema ni `ruleVersion`),
  `aspec/changes/archive/2026-11-13-ch-08-memory-import-dry-run-classified/` (0.34.0: `ADDED` del
  Requirement `Import con dry-run clasificado por memory_key` en `memory-ops`; buckets
  `nuevo`/`identico`/`divergente`/`tombstone`, predicción exacta por `decideImportEntry`, base
  ausente sin crear y salida `{dryRun, databasePresent, summary, entries}`; sin cambio de schema
  ni `ruleVersion`; cierra `CH-08`),
  `aspec/changes/archive/2026-11-13-ch-04-memory-writer-serialization/` (0.33.0: `ADDED` de
  `Serialización de escritores concurrentes sobre la base de memoria` en `memory-engine`;
  `runImmediateTransaction` con `BEGIN IMMEDIATE` + retry acotado 3/200-600 ms, error nombrado
  `MEMORY_DB_BUSY`, oráculo offline `test/memory-writers.test.js`; sin cambio de schema, PRAGMAs,
  comandos, flags ni `ruleVersion`; cierra `CH-04`),
  `aspec/changes/archive/2026-11-13-ch-06b-affected-test-selection/` (0.32.0: `ADDED` del
  Requirement `Selección determinística de tests por affected-set con manifiesto cerrado` en
  `prompt-contracts`; `ancleto affected --tests` agrega `tests.complete|reasons|selected|excluded`,
  el manifiesto cerrado `test/affected-tests.json` declara `always`/`couplings` y el consumidor
  `npm run test:affected` cae fail-closed a `node --test "test/*.test.js"`; sin `--tests` el JSON
  conserva exactamente `seeds`, `affected`, `unresolved` y `externalCount`; cierra `CH-06b`),
  `aspec/changes/archive/2026-11-12-mem-05-working-context-critical-set/` (0.31.0: `ADDED` del
  Requirement `Conjunto crítico estable del working-context` y `MODIFIED` de `Orden determinístico
  de inyección de reglas` con 7 escenarios; `.ancletorc` declara 7 claves en
  `memory.criticalKeys`; fallo duro en la CLI explícita, `console.warn` en lifecycle/on-write y
  exit ≠ 0 en `merge`/`consolidate --apply`; `<ContextOverflowWarning>` intacto; cierra `MEM-05`),
  `aspec/changes/archive/2026-11-12-discovery-state-schema-wording/` (0.30.2: delta `MODIFIED` de
  `cli-diagnostics` que documenta el estado persistido `version: 1` + `ruleVersion: 2` frente a
  `schemaVersion: 2` de la salida de `--check`, con un pin de test no conductual; sin cambio de
  runtime ni de migración),
  `aspec/changes/archive/2026-11-12-pin-offline-discovery-state/` (conformidad, sin delta ni bump:
  extrae `buildDiscoveryState`/`renderDiscoveryState` a `src/core/discovery-state.js`, usados por
  `packDiscovery`, con golden byte-idéntico en `test/cli.test.js`),
  `aspec/changes/archive/2026-11-12-discovery-exclude-glob-match/` (0.30.0: corrige `escapeRe` y
  `matchesGlob` —entonces en `src/cli/index.js`— para traducir `**/`, `/**`, `**`, `*` y `?` por
  segmentos con anclaje; las exclusiones `**/*.test.*`/`**/*.spec.*` se aplican, `sources` baja de
  872 a 854 y deja de incluir 21 `test/*.test.js`; `DEFAULT_IGNORES`, `outputDir`, writer, forma del
  estado y `ruleVersion: 2` no cambian; delta `MODIFIED` de `cli-diagnostics`),
  `aspec/changes/archive/2026-11-12-discovery-exclude-regexp-cache/` (0.30.1: extrae `escapeRe`,
  `compileGlob` y `matchesGlob` a `src/core/discovery-glob.js` y cachea el `RegExp` compilado por
  string exacto de glob; 15,04 ms → 1,63 ms (9,2×) sobre 9.669 evaluaciones, sin cambio de
  semántica; el ReDoS con `**` repetidos sigue siendo limitación aceptada y el DP por segmentos se
  descartó por no ser equivalente; `DEFAULT_IGNORES`, `outputDir`, writer, estado (`version:1` +
  `ruleVersion:2`) y `buildRepomixArgs`/`--ignore` de Repomix no cambian; sin delta de spec),
  `aspec/changes/archive/2026-11-12-seed-freshness-ignored-areas/` (0.29.0: extiende el predicado
  de lectura `isEphemeralSource` para excluir `documentation`/`documentation/**` y
  `audit logs`/`audit logs/**` anclados a la raíz; ambas áreas son gitignored y 0 tracked, el estado
  las conserva (674+18 entradas) y el writer, la forma del estado y `ruleVersion: 2` no cambian;
  `docs/**` y `aspec/**` siguen contando; delta `MODIFIED` de `cli-diagnostics`),
  `aspec/changes/archive/2026-11-11-seed-freshness-ephemeral-paths/` (0.28.0: `.ancleto` y todo lo
  que está bajo `.ancleto/`, más el `.discovery-map.json` raíz, dejan de contar como cambio de
  frescura; un único predicado `isEphemeralSource` se aplica simétricamente a las vistas persistida y
  actual de `sources` y `isEphemeralOnlyChange` sólo excusa el desvío de hash si hay al menos una ruta
  cambiada y todas son efímeras; writer, forma del estado y `ruleVersion: 2` no cambian; delta
  `MODIFIED` de `cli-diagnostics`),
  `aspec/changes/archive/2026-11-11-seed-freshness-version-bump-not-material/` (0.27.0: el valor de
  `version` de primer nivel del `package.json` raíz deja de contar como cambio material ni de
  contenido; el estado persistido suma `ruleVersion: 2` + `semantic: { hash, fileHashes }` y los
  estados legacy se comparan crudos; delta `MODIFIED` de `cli-diagnostics`),
  `aspec/changes/archive/2026-11-11-active-delta-structure-guard/` (0.26.4: agrega a la suite
  declarada un guard estructural de los delta specs de changes activos que reutiliza `parseDeltaSpec`
  y documenta el Requirement en `spec-sync`; sin cambio de runtime),
  `aspec/changes/archive/2026-11-10-align-freshness-recommended-action-spec/` (0.26.x: alinea el
  Requirement de frescura de `cli-diagnostics` al `recommendedAction` real —`generate` en `MISSING`,
  `complete` en `PARTIAL`, excepción a `impact:none` → `continue`— y lo pinea en tests; sin cambio
  de runtime),
  `aspec/changes/archive/2026-11-10-spec-seed-freshness-detector/` (0.26.1: documenta y pinea el
  detector de frescura vigente de `discovery --check` como `ADDED` de `cli-diagnostics`, sin cambio
  de runtime),
  `aspec/changes/archive/2026-11-08-fix-discovery-seedmap-present/` (0.26.0: `seedMapPresent`
  independiente del estado, con `affectedDocs` todavía STALE-only),
  `aspec/changes/archive/2026-11-08-archive-sync-via-specs-merge/` (0.25.0: el sync de delta del
  archive y del bulk-archive rutea por `ancleto specs merge --change <slug>`; el guard canónico
  fail-closed aplica también al camino de archive),
  `aspec/changes/archive/2026-11-08-cli-subcommand-help-guards/` (0.25.0: guard central de
  `--help`/`-h` en subcomandos que mutan estado: uso en stdout, exit 0, cero escrituras),
  `aspec/changes/archive/2026-11-07-memory-record-idempotency/` (0.23.0: `recordNode` no-op ante
  reescritura idéntica de `memory_key`),
  `aspec/changes/archive/2026-11-07-portability-legacy-bundle-advisory/` (0.23.0: aviso no
  bloqueante de bundle sin `manifest.mcp`),
  `aspec/changes/archive/2026-11-07-template-legacy-eol-preservation/` (0.23.0:
  `reconcileLegacyBlocks` preserva EOL por línea y newline final),
  `aspec/changes/archive/2026-11-08-agent-model-minimo-migration/` (0.24.0: `TIERS.minimo` y
  `MINIMO_CHAIN` alineados a `opencode-go/deepseek-v4.1-flash`; cadena de dos candidatos),
  `aspec/changes/archive/2026-11-08-specs-merge-canonical-guard/` (0.24.0: fail-closed ante heading
  de sección de delta en la canónica; normalización de `copilot-support`, `legacy-import` y
  `test-profile` a `## Requirements`),
  `aspec/changes/archive/2026-11-06-specs-merge-hardening/` (0.22.1: contenedor `archive`
  fail-closed, preámbulo H1 estructural, `ADDED` con una línea en blanco y exclusión de atomicidad
  de la fase de escritura),
  `aspec/changes/archive/2026-11-06-archive-order-correctness/` (0.22.1: promoción antes del move,
  fases A/B del documenter y semántica de fallo),
  `aspec/changes/archive/2026-11-06-ch-06a-specs-merge-deterministic/` (0.22.0: módulo puro
  `src/core/specs-merge.js`, subcomando `specs merge` y capability `spec-sync`),
  `aspec/changes/archive/2026-11-06-p0-pr5-archive-conformity/` (0.21.0: discriminador
  conformidad-vs-delta, archive de conformidad sin delta, ruteo alineado en orchestrator, triage,
  workflow y continue; dos Requirements nuevos en `prompt-contracts`),
  `aspec/changes/archive/2026-11-06-fix-repair-mcp-noop/` (0.20.1: `repairProjectMcp` no reescribe
  un destino MCP sano),
  `aspec/changes/archive/2026-11-05-host-neutral-bundle/` (bundle host-neutral) y
  `aspec/changes/archive/2026-11-05-mcp-host-write-routing/` (descriptor de destino MCP por host).
- **Catálogo**: `src/core/model-catalog.json` con `generated_at: 2026-11-04` y 211 IDs en 5
  proveedores (`opencode` 10, `opencode-go` 30, `anthropic` 20, `commandcode` 71, `openai` 80).
   Sin cambios en 0.19.0–0.25.0. `agents/` (10), `commands/` (16) y `skills/` (21 directorios, 35
    archivos) mantienen el conteo; en 0.22.1-0.39.1 no cambió su cantidad.
- **Pack actual**: 895 fuentes y ~45.009 tokens (181.738 B, comprimido, tier `minimo`), con 33
   entradas de archivo en el cuerpo porque `test/**`, `docs/**` y `**/*.md` quedan excluidos del
   pack. El `.discovery-map.json` de la corrida reporta 933 archivos (aspec 348, `.opencode` 66,
   docs 21, test 37, src 23, scripts 2, documentation 340, audit logs 9). La lista `sources` excluye
   los `test/*.test.js` por `discovery.exclude`; los 8 fixtures de
   `test/fixtures/**` siguen incluidos.
- **Estado del chequeo**: esta materialización actualizó los documentos desde el pack y las fuentes
   citadas para reflejar 0.39.1, preservando la estructura del seed. En 0.26.0 `discovery --check`
   pasó a calcular `seedMapPresent` antes de clasificar el estado (vale en
   `READY`/`STALE`/`PARTIAL`/`MISSING`); en 0.26.1 el detector de frescura quedó documentado y
   pineado en `cli-diagnostics`; en 0.26.4 la suite declarada sumó el guard estructural de los delta
   specs activos (`test/delta-spec-structure.test.js`). En 0.27.0 el valor de `version` de primer
   nivel del `package.json` raíz deja de contar como cambio material ni de contenido, el estado
   persistido declara `ruleVersion: 2` + `semantic: { hash, fileHashes }` (los estados sin
   `ruleVersion` se comparan crudos) y el guard anterior detecta además un `spec.md` de change activo
   fuera de `specs/<capability>/spec.md`. En 0.28.0 el mismo `checkDiscovery` aplica un filtro
   simétrico de rutas efímeras (`.ancleto`, `.ancleto/**` y `.discovery-map.json` raíz): no producen
   áreas ni materialidad y sólo excusan el desvío de hash cuando hay al menos una ruta cambiada y
   todas son efímeras; un estado legacy sin `fileHashes` sigue `STALE`/`minor`. En 0.29.0 el filtro
   se extiende a `documentation`/`documentation/**` y `audit logs`/`audit logs/**` anclados a la
   raíz: ambas áreas son gitignored y 0 tracked, el estado las conserva (674+18 entradas) y no
   producen áreas, materialidad ni excusa de hash; `docs/**` y `aspec/**` siguen contando, y el
   writer, la forma del estado y `ruleVersion: 2` no cambian. En 0.30.0 `escapeRe` escapa `*` y `?`
   y `matchesGlob` traduce `**/`→`(?:.*/)?`, `/**`→`(?:/.*)?`, `**`→`.*`, `*`→`[^/]*` y
   `?`→`[^/]`, con anclaje `^…$` si el patrón contiene `**` y `^(…)(?:/|$)` si no; así
   `**/*.test.*` y `**/*.spec.*` vuelven a excluir tests de `sources` (21 rutas menos, 872→854).
   En 0.30.1 el matcher se extrae a `src/core/discovery-glob.js` (`escapeRe`, `compileGlob`,
   `matchesGlob`) y el `RegExp` compilado se cachea en un `Map` por string exacto de glob: 9.669
   evaluaciones bajan de 15,04 ms a 1,63 ms (9,2×), sin cambio de tokenización, anclaje ni
   semántica; el ReDoS con `**` repetidos sigue siendo limitación aceptada (input `.ancletorc`
   local) y el DP por segmentos se descartó por no ser equivalente. En 0.30.2 no cambia el runtime:
   se corrige la redacción de `cli-diagnostics` (estado persistido `version: 1` + `ruleVersion: 2`
   frente a `schemaVersion: 2` de `--check`) y se pinea el armado offline de forma no conductual;
   este patch no altera el matcher, el writer ni `ruleVersion`. En 0.31.0 el renderer del
   working-context lee `memory.criticalKeys` de `.ancletorc` y lo pasa como `required`: las claves
   críticas van primero y fallan visiblemente si no existen, están inactivas o no entran en el
   presupuesto; el discovery y la frescura no cambian. En 0.32.0 se agrega `ancleto affected --tests`
   y el módulo puro `src/core/test-selection.js`: el flag es aditivo, implica JSON y suma el objeto
   `tests` sin alterar los cuatro campos de `affected --json`; el plan es read-only y determinístico,
   y su gate `complete` es fail-closed (manifiesto ausente/inválido, `manifest-gap`,
    `test-glob-missing` o `unresolved-in-closure`). `affectedDocs` sigue poblándose sólo en
    `STALE`. En 0.33.0 los cinco writers del engine comparten `runImmediateTransaction`
    (`BEGIN IMMEDIATE` + retry de 3 intentos con backoff 200/600 ms) y fallan con `MEMORY_DB_BUSY`
    al agotar el presupuesto; el oráculo offline es `test/memory-writers.test.js`. En 0.33.1
    `memory doctor --rebuild` se suma al helper con la operación `doctor-rebuild`: rebuild de FTS5 +
    integrity-check en una única transacción inmediata, `MEMORY_DB_BUSY` en el detalle ante
    contención agotada y `rebuilt` sólo tras `COMMIT` exitoso; el `doctor` por defecto sigue
    read-only. Schema, PRAGMAs persistidos, comandos, flags y `ruleVersion` no cambian. En 0.34.0
    `memory import --dry-run [--json]` agrega la clasificación read-only por `memory_key`; en 0.35.0
    `memory gc` compara instantes con `julianday`, retiene fechas no parseables, trata
    `status='deleted'` como reservado, `memory curate` compone su reporte bajo un único snapshot
    `BEGIN DEFERRED` y el literal de gramática de refs pasa a `REF_GRAMMAR`; ninguno de los dos
    cambia schema, PRAGMAs, comandos sin flags ni `ruleVersion`. En 0.36.0 `memory merge` y
    `memory consolidate --apply` agregan la puerta de criticidad pre-write sobre
    `memory.criticalKeys` (`criticalAffected`, `--force-critical`, exit 2) y `consolidate` sin base
    sale con código 1; no cambian schema, PRAGMAs ni `ruleVersion`. En 0.37.0 `memory repair refs`
    agrega la reparación explícita de refs de un único nodo activo, con allowlist por motivo
    `inexistente`, preservación byte a byte, dry-run read-only y `--apply` por supersede bajo el
     gate crítico; tampoco cambian schema, PRAGMAs ni `ruleVersion`. En 0.38.0 `memory status`
     declara el gap de memoria de producto con `expected`/`gap`/`recovery` y raíz única en `cwd`,
     y `memory doctor` completa sus cinco checks sobre una base sin esquema sin abortar; no cambian
     schema, PRAGMAs persistentes, `ruleVersion` ni la forma del export/snapshot. En 0.39.0 las
     superficies de lectura de memoria abren `readonly: true` + `migrate: false` con precheck de
     `sqlite_master`; `context`/`export` ya no migran una base de 0 bytes, `export` sin esquema sale
     1, `list` sale 0 nombrando el esquema no inicializado, `merge --dry-run`/`repair refs` degradan
     con exit 1 sin stack y `doctor` sobre base ilegible no imprime stack; el `.db` conserva SHA-256
     y      `sqlite_master` y los sidecars WAL se toleran, sin cambios de schema, PRAGMAs persistentes ni
     `ruleVersion`. En 0.39.1 `memory gc --dry-run` se suma a la apertura read-only con degradación
     sin stack y fallback legacy por `created_at`, mientras `gc` real conserva migración, purga y
     `VACUUM` + `REINDEX`; tampoco cambian schema, PRAGMAs ni `ruleVersion`. El `ancleto discovery
     --check` de validación, tras regenerar el estado con el pack de 895 fuentes (181.738 B,
     ~45.009 tokens), reportó `READY`/`impact: none` con `changedAreas: []`,
     `seedMapPresent: true` y `affectedDocs: []`.
