# Changelog

Todas las versiones notables de `@ancleto/spec`.

## [0.23.0] - 2026-11-07

### Added
- **`import` advisory de bundle legacy**: un bundle sin clave `manifest.mcp` emite un único aviso no bloqueante; el exit code y la salida escrita no cambian, `mcp: []` sigue en silencio y un valor no-array sigue fallando.

### Changed
- **`recordNode` idempotente ante reescrituras idénticas**: reescribir el mismo `memory_key` con type, scope, content y justification idénticos no crea nodo ni supersede (`superseded: 0`) y devuelve los valores persistidos; cualquier diferencia sigue supersediendo. Las descripciones de las tools MCP se actualizaron en consecuencia.
- **`reconcileLegacyBlocks` preserva el EOL por línea**: al remover una corrida legacy conserva el fin de línea original de cada línea superviviente y el estado de newline final de la entrada; el camino sin remoción queda byte-idéntico.

### Docs
- **Specs canónicas sincronizadas**: `memory-engine`, `project-portability` y `prompt-contracts`; en `project-portability` se normalizó el heading filtrado `## ADDED Requirements` a `## Requirements`.

## [0.22.2] - 2026-11-06

### Tests
- **`specs merge`**: idempotencia del `--dry-run --json` (stdout byte-idéntico entre corridas y cero escrituras acumuladas) y caso fail-closed de `--change archive --dry-run` repetido (exit 2, cero escrituras).
- **`affected-set`**: oráculos de clasificación de imports dinámicos (`import('node:sqlite')` externo; `import('node:sqlite', { with })` e `import(x)` → `unresolved`; relativo irresoluble → `unresolved`; relativo resoluble → arista) e invariante negativa de suites spawn-only.

### Notas
- Change de conformidad `test-oracles-hardening`, archivado en `aspec/changes/archive/2026-11-06-test-oracles-hardening/`; sin delta de specs. CH-06b, CH-00, CH-07 y el resto del P2 siguen diferidos.

## [0.22.1] - 2026-11-06

### Fixed
- **`ancleto specs merge` falla cerrado ante `--change archive`**: cuando `--change archive` resuelve al contenedor `aspec/changes/archive`, el comando falla cerrado con exit 2, cero escrituras y sin excepción para `--dry-run`; el preámbulo H1 del delta es estructural (a lo sumo un H1, cualquier título; un segundo H1 o contenido suelto antes de la primera sección falla cerrado, preservando las formas de delta archivadas legacy); `ADDED` inserta exactamente un separador de línea en blanco; un `## RENAMED Requirements` vacío es un no-op testeado; la fase de escritura no transaccional queda documentada como exclusión explícita.
- **Orden del archive endurecido**: el archive pasa a merge/sync → preflight de solo lectura → promoción de `## Decisiones` aprobadas → move → commit en `agents/orchestrator.md`, `agents/documenter.md`, `skills/ancleto-archive/SKILL.md`, `skills/ancleto-bulk-archive/SKILL.md` y `skills/ancleto-onboard/SKILL.md`; una falla de promoción no mueve el change, y una falla de move posterior a la promoción reporta `memoria promovida; NO archivado` (`memory promoted; NOT archived`).

### Docs
- **Sin comandos ni flags nuevos**: se sincronizan las specs canónicas `spec-sync` y `memory-ops`.

## [0.22.0] - 2026-11-06

### Added
- **Merge estructural de specs por delta**: `ancleto specs merge --change <slug> [--dry-run] [--json]` combina de forma determinista e idempotente el delta de un change contra las specs canónicas por título exacto de Requirement; `--dry-run` no escribe nada y cualquier error falla cerrado con exit 2 sin escrituras parciales; nueva capability canónica `spec-sync`.

## [0.21.0] - 2026-11-06

### Added
- **Cambio de conformidad archivado sin delta**: discriminador explícito entre conformidad y cambio funcional; el archive es no-op y deja una cita `spec:<capability>#<requirement>` resoluble y relevante, con dos Requirements nuevos en `prompt-contracts`.

### Changed
- **Ruteo alineado del flujo de conformidad**: `agents/orchestrator.md`, `skills/triage-clarifier`, `skills/ancleto-workflow` y `skills/ancleto-continue` comparten el mismo criterio; `@spec-writer` no genera `specs/` para conformidad y `@coder`, `@tester`, `@documenter` y `@reviewer` contemplan el change sin delta.

## [0.20.1] - 2026-11-06

### Fixed
- **`import --repair` no reescribe un destino MCP sano**: cierra el bug de escritura incondicional de `repairProjectMcp`; cuando la config MCP del proyecto ya es válida, el archivo queda intacto (mismos bytes y mtime), sin cambios de mensajes ni de exit codes.

## [0.20.0] - 2026-11-05

### Added
- **`export` host-neutral**: lee la intención MCP del único destino descriptor del host activo (`opencode`, `antigravity`, `commandcode`, `copilot`), con fallback legacy a `.opencode` para `claude`, `vscode`, `cursor` y `roo`; destino ausente → intención vacía; archivo no parseable → un warning no bloqueante y exit 0.
- **`import` con ruteo por host**: copia y registra `.opencode/{agents,commands,skills}` solo cuando el host activo es `opencode`; en los demás hosts materializa vía `installAgentAssets`; `installedPaths` sigue siendo la unión de las rutas escritas.

### Docs
- **Specs sincronizadas**: `project-portability`, `agent-install-routing` y `cli-diagnostics`.
- **Change archivado**: `2026-11-05-host-neutral-bundle`.

## [0.19.0] - 2026-11-05

### Added
- **Descriptor único de destino MCP por host**: `opencode`, `antigravity`, `commandcode` y `copilot` declaran un destino; `claude`, `vscode`, `cursor` y `roo` no tienen destino.

### Changed
- **Escritura MCP ruteada al host activo**: `init`, `install`, `import` e `import --repair` escriben en el destino del host instalado y dejan de crear un `.opencode/opencode.json` muerto.
- **`check` y `doctor` host-aware**: evalúan la config MCP del host activo; los hallazgos MCP siguen siendo advisory y los exit codes no cambian.

### Docs
- **Specs canónicas sincronizadas y change archivado**.

## [0.18.17] - 2026-11-05

### Fixed
- **Texto de `--help` y requirement de `project-portability` alineados al predicado MCP vivo**: una entrada está rota cuando `command` falta o está vacío o cuando su ruta absoluta no existe; un nombre simple irresoluble en PATH no cuenta como roto.

### Docs
- **Archive de `mcp-oracle-residual-closure`**: se sincroniza el spec `project-portability` con los requirements cerrados por el change.

## [0.18.16] - 2026-11-05

### Fixed
- **`mcpCommandBroken` ya no declara roto todo path con letra de unidad**: un comando absoluto sano de Windows deja de reescribirse en `import --repair` y en los refreshers de `upgrade`.

### Added
- **Advisories no bloqueantes de salud MCP en `check`**: avisa cuando la config MCP del proyecto no se puede parsear y cuando una entrada MCP tiene el comando roto, sin cambiar el exit code.

### Changed
- **`import` advierte antes de reemplazar una config MCP del proyecto no parseable**.
- **Un único dueño del conjunto de nombres de archivo candidatos de MCP del proyecto**: `findProjectMcpFile`, `mergeMcp` y `hostConfigHasCompression` comparten la misma fuente.

## [0.18.15] - 2026-11-04

### Fixed
- **`check` ya no reporta un tier huérfano en hosts sin superficie local de agentes**: cuando el host instalado no expone agentes locales (`cursor`/`roo`), el tier queda dormido en vez de contarse como huérfano.

### Added
- **Aviso advisory por deriva de `.ancletorc.version`**: `check` avisa cuando la versión declarada difiere de la CLI en ejecución, sin cambiar el exit code; `ancleto upgrade` sigue siendo el remediador.
- **`doctor` valida la config MCP del proyecto**: revisa `.opencode/opencode.json[c]` cuando existe y cae a la config global en su ausencia.

### Changed
- **Sin cambios de comportamiento de escritura**: `init`, `install`, `update`, `upgrade`, `import` y `export` quedan intactos.

## [0.18.14] - 2026-11-04

### Fixed
- **Nota de compresión decidida por el estado final de la config MCP del host**: `CAVEMAN_USAGE_NOTE` en `install`, `init` e `import` se decide por `hostConfigHasCompression` y la escritura pendiente en lugar de por detección de binario al vuelo; elimina falsos `frontmatter diverge del adaptador` en `check`.
- **`import` valida `manifest.mcp` antes de escribir**: exige un array de entradas con `name` string no vacío antes de cualquier escritura, evitando imports parciales.

### Added
- **Cobertura de consistencia de la nota**: 19 casos, guard del overlay `profiles/test/agents` y escenario `import --repair`.

## [0.18.13] - 2026-11-04

### Added
- **Aviso advisory de modelo free sobre agente primario**: cuando un modelo free del tier `gratis` queda efectivo sobre un agente `mode: primary` (OpenCode puede responder 403), se emite un aviso no bloqueante en `applyTier` (set-time) y en `check` (inspect-time); nunca bloquea, nunca cambia el modelo escrito ni el exit code.
- **`import` registra `installedPaths`**: se guarda la unión del destino y lo que escribió, incluidos los `.opencode/{agents,commands,skills}` copiados del bundle; nunca copia las rutas del `.ancletorc` del bundle.

### Changed
- **Requirements de integridad de catálogo consolidados**: dos requirements solapados se unifican en `agent-model-tiers` (coherencia documental, sin cambio de comportamiento).

### Docs
- **README**: documenta que el tier `gratis` está pensado para subagentes y que un modelo free sobre un agente primario custom puede responder 403.

## [0.18.12] - 2026-11-04

### Added
- **Integridad de IDs declarados del catálogo**: los IDs declarados por los agentes se validan contra el snapshot versionado.
- **Gate pre-escritura en `refresh-model-catalog --write`**: la escritura se bloquea si la integridad de IDs no se puede verificar.
- **Aviso advisory no bloqueante en `check`** cuando el catálogo no puede verificarse.

### Changed
- **Lint cubre `scripts/`**: el comando pasa a `eslint src/ test/ scripts/`.
- **Remedio del catálogo**: la indicación apunta al repositorio fuente, ya que `scripts` no se publica.

### Fixed
- **`looksBinaryMissing` independiente de locale**: la detección ya no depende del idioma del entorno.
- **Snapshot corrupto tratado como no verificable**: no produce una deriva falsa.
- **Guard transitivo de `child_process` corregido**.

## [0.18.11] - 2026-11-04

### Added
- **Descubrimiento dev-only del catálogo de modelos**: `scripts/refresh-model-catalog.mjs` con `--refresh` clasifica cada proveedor como `available`, `binary-missing`, `network-unavailable` o `partial`, y reporta el diff contra el snapshot versionado.
- **Escritura atómica y guard de `big-pickle`**: el refresh persiste el catálogo de forma atómica y rechaza `big-pickle` cuando no es gratuito.
- **Aviso no bloqueante de deriva/antigüedad**: `ancleto check` reporta cuándo el snapshot del catálogo está desactualizado.

### Changed
- **Snapshot refrescado**: 5 proveedores y 211 IDs verificados.
- **Sin red en runtime/CI**: el descubrimiento queda acotado a desarrollo; ni el runtime ni CI ejecutan descubrimiento ni acceden a la red.

## [0.18.10] - 2026-11-03

### Added
- **Snapshot de catálogo commiteado con guard**: el catálogo de modelos verificado queda versionado en el repo y un guard estructural detecta cuando diverge, en vez de depender de la disponibilidad en tiempo de ejecución.

### Changed
- **IDs de modelo corregidos**: `reviewer` apunta a `opencode-go/qwen3.8-max`.
- **Cadena de fallback de `minimo` resuelta contra el catálogo verificado**, en lugar de resolverse a ciegas.
- **Oráculo de `check` por conjunto de aceptación**: la comparación usa el conjunto aceptado, así que un catálogo cambiado no produce falsos positivos.
- **`gratis` es free-only**: el tier sólo admite modelos gratuitos.
- **`profiles/test/agents` alineado** con el catálogo y los tiers vigentes.
- **`import` y hosts más robustos**: resolución de imports y de hosts endurecida.

### Removed
- **Detección muerta de Muse Spark**: se elimina el código que ya no podía alcanzarse.

## [0.18.9] - 2026-11-03

### Added
- **Test estructural `test/agent-model-coherence.test.js`**: guarda que los modelos canónicos, los mirrors instalados y los tiers no diverjan.

### Changed
- **Modelos canónicos alineados a `commandcode/deepseek/deepseek-v4.1-flash`**: la fuente `agents/*.md` fija ese modelo como default publicado.
- **`TIERS` se muda a `src/core/tier-models.js`** como único dueño del mapa de modelos por tier; `minimo` queda alineado al canónico, así que `applyTier` es un no-op sobre él.
- **`ancleto check` contrapone los agentes instalados contra el canónico** (o el overlay del perfil activo) y aflora la deriva de tier con un aviso no bloqueante en vez de omitirla.

## [0.18.8] - 2026-11-03

### Added
- **`memory curate`**: nuevo subcomando de curación de sólo lectura (`ancleto memory curate [--json] [--strict]`) que reporta refs `spec:`/`change:`/`path:` sin resolver, `commit:`/`workitem:` como no verificables y grupos de duplicados exactos con su nodo canónico. Compone las primitivas existentes (`resolveNodeRefs` y `consolidate`); es consultivo con exit 0 por defecto, `--strict` es opt-in y un `no-db` nunca se reporta como reporte limpio.

### Changed
- **`consolidate` acepta `includeNearDuplicates`**: opción aditiva (default `true`, comportamiento sin cambios) para que la ruta de curación no pague el escaneo O(n²) de near-duplicates que descarta.
- **Specs `memory-ops`**: la spec ganó el requirement `curate` fusionado y se corrigió la enumeración de su Purpose, que había omitido `consolidate` desde 0.18.5.
- **Seed regenerado** (estado READY).
- **Backlog**: registradas las nuevas deudas `CH-09e…h`.

## [0.18.7] - 2026-11-03

### Added
- **Protocolo de memoria canónico**: el contrato vive en `LOCKED: memory-protocol` de `AGENTS.md` y `PRODUCT.md` sólo lo referencia como puntero único; `searchMemory` queda documentado con preview, `expand`, `keys` y `required`.

### Changed
- **Reconciliación del texto plano legado**: el gate por `source` hace la comparación exacta, enmascara bloques `LOCKED` y fences y separa correctamente los bloques, evitando falsos positivos.
- **`memory gc` mide supersesión con `superseded_at`**: usa un cutoff único y detacha `superseded_by` al purgar.
- **Seed regenerado** y nueva deuda `MEM-05c…05g` registrada en el backlog.

## [0.18.6] - 2026-11-02

### Added
- **MEM-05 recall task-aware**: `searchMemory` ordena de forma total y determinística (requerido, ref declarada, scope, bm25 y `memory_key`, sin `rowid`), devuelve por defecto un preview como prefijo literal de hasta 240 caracteres con `content_truncated` y `limit` 5, expande el payload completo con `expand: true` y claves puntuales con `keys`.
- **`required` como entrada de llamada**: promueve `memory_key` al frente del orden y falla explícitamente cuando excede el `limit` o no entra en el presupuesto del bloque, en vez de degradarse a una omisión.
- **`buildWorkingContext` acepta `{ required }`**: una requerida ausente, inactiva o fuera de presupuesto produce un error diagnóstico con `memory_key` y la ruta de sus refs resueltas.

### Changed
- **Specs `memory-engine` y `prompt-contracts`**: nuevo requirement `Recall task-aware con orden total, preview expandible y keys requeridas`; actualizados el fallback OR-prefijo, el aviso de overflow, el orden de inyección y el render del bloque proactivo sin el bloque `refs:`. `prompt-contracts` declara que el bloque de 8.000 chars y el campo destilado de ≤5 reglas / 1.500 B son superficies separadas.
- **Skills de recall**: `ancleto-recall`, `new`, `propose` y `ff` usan `expand: true`; `explore` y `onboard` corrigen la firma documentada.
- **Backlog**: nueva fila `MEM-05b` (gc por fecha de supersesión), nota de la ventana del piso del aviso y de `README`.

## [0.18.5] - 2026-11-02

### Added
- **`memory consolidate`**: consolidación determinística de duplicados exactos con `--dry-run` por defecto, `--apply` reversible por supersesión y reporte informativo de near-duplicates.

## [0.18.4] - 2026-11-02

### Added
- **Orden determinístico de inyección** de reglas en `<ProjectMemoryRules>`: scope, anclaje declarado, recencia y `memory_key`.
- **Manifiesto de reglas omitidas** en el `<ContextOverflowWarning>`, con tope de 40 claves y sufijo `+N`.

### Changed
- **El presupuesto del bloque incluye el aviso de overflow**: el bloque completo respeta `maxTokens × CHARS_PER_TOKEN`.

## [0.18.3] - 2026-11-02

### Added
- **`resolveNodeRefs` expone la ubicación resuelta** de refs `change:` / `spec:` / `path:`.
- **Golden M04–M06 activas**: resolución de refs.

### Changed
- **`path:` normaliza separadores y `.`** antes del chequeo de existencia (compatible Windows/Linux).

## [0.18.2] - 2026-11-01

### Changed
- **Regla de severidad de `cleto-review` en su hogar normativo**: `aspec/specs/code-review` establece CRITICAL sólo para duplicación literal verificable o dead code probado; los hallazgos inferidos son WARNING/SUGGESTION y ante la duda se degrada la severidad.
- **`aspec/specs/memory-engine` fija el slug de refs**: `change:<slug>` va sin prefijo de fecha.
- **`agents/spec-writer.md` referencia la fuente única** en vez de re-enunciar la gramática de refs.

Sin cambios de código.

## [0.18.1] - 2026-11-01

### Changed
- **Discovery map sincronizado** con el seed técnico regenerado en la 0.18.0.
- **Agente orquestador mapeado** en el mapa de modelos de agentes de `opencode.json`.

Sin cambios de código ni de contrato.

## [0.18.0] - 2026-10-31

### Added
- **Quinto check de `memory doctor` (`Refs de nodos activos`)**: reporta refs `spec:` / `change:` / `path:` no resueltas, read-only, con el `memory_key` y la ref textual del nodo afectado.

### Changed
- **`refs:` sin indentación obligatoria**: los items de `refs:` pueden ir sin indentar.
- Ayuda del CLI y `AGENTS.md` actualizados, incluida la sección de cambio de modelo de agentes.

## [0.17.2] - 2026-10-30

### Changed
- **Backfill de decisiones archivadas**: se archivó el change que inventarió los `design.md` históricos y promovió sus cinco decisiones únicas a la memoria del repositorio; sin delta spec ni cambio de código.
- **Technical seed regenerado** sobre el estado final y de vuelta en `READY`.
- **Backlog memoria-first**: altas de `CH-11` (regla de severidad de `cleto-review` a su spec) y `MEM-07` (gramática de `change:` sin prefijo de fecha).

## [0.17.1] - 2026-10-30

### Changed
- **`design.md` y `context.md` retirados del flujo de cambio nuevo**: los generadores ya no los emiten; las decisiones de diseño durables viven en `proposal.md ## Decisiones`.
- Consumidores los tratan como legado opcional; `archive` ya no elimina `context.md` y mueve el change sin modificarlo, dejando intactos los changes legados ya archivados.
- Content guards impiden re-emitirlos; specs `artifact-update` y `prompt-contracts` actualizadas.

### Removed
- Generación de `design.md` y `context.md` en el alta de un change.

## [0.17.0] - 2026-10-30

### Added
- **Modo Promotion en `@memory-keeper`**: al archivar promueve sólo las decisiones de `proposal ## Decisiones` con `memory_key` propia y `Estado: aprobado`, con preflight del lote; sin candidatos no escribe ni delega, y corre después del merge de specs. Gate en `ancleto-archive`, `ancleto-bulk-archive` y `ancleto-verify`.
- **Resolutores `change:` / `spec:` / `path:`** con unicidad y **ambigüedad reportada**; `change:` queda anclado a `YYYY-MM-DD-<slug>`.

### Changed
- **Refs normalizadas dentro de `content`** en `recordNode`, con validación **fail-closed** y exención única `context.source === 'runtime'`; `cli:import` queda fuera del camino de escritura y conserva LWW.
- **`<ProjectMemoryRules>`** renderiza sólo la prosa de la regla, sin el bloque `refs:`.
- Backfill de las cinco decisiones únicas de los `design.md` históricos.
- Specs sincronizadas: `memory-engine`, `memory-ops` y `prompt-contracts`.
- `opencode.json` con override de modelo por agente.

### Security
- Rechazo de credenciales sin eco del valor.

## [0.16.2] - 2026-10-29

### Added
- **`## Decisiones` en el proposal**: los siete generadores del proposal (`@spec-writer` y las skills `propose`, `ff`, `continue`, `new`, `onboard`, `upgrade`) emiten la sección, con el shape canónico declarado una sola vez en `agents/spec-writer.md` y referencia desde las skills.

### Changed
- **Checkpoint de contrato**: el checkpoint posterior a `@spec-writer` aprueba el contrato del cambio —intención, alcance, `Requirement` nuevo o existente, riesgos, decisión de arquitectura si aplica, validación prevista y paths autorizados— en menos de una pantalla; ya no enumera documentos ni depende de `design.md`. Archive y merge siguen siendo stops separados y explícitos.
- Delta `ADDED`-only mergeado en `aspec/specs/prompt-contracts/spec.md`: 2 `Requirement` nuevos, 0 existentes modificados.
- **Nota de release**: `v0.16.1` se tageó sin bump de versión y su `npm publish` se omitió por versión ya existente; `0.16.2` es la primera versión publicada que incluye estos cambios.

## [0.16.0] - 2026-10-29

### Added
- **`memory snapshot --out <archivo> [--force] [--json]`**: copia consistente de la base con `VACUUM INTO`, historial incluido (`superseded_by`), verificación `quick_check` del destino y reemplazo con backup.
- **`memory merge --target <key> --sources <k1,k2,...> [--dry-run] [--json]`**: consolida duplicados marcando cada source con `superseded_by` hacia un target activo existente; transacción única, mismas `type` obligatorias, sin tablas nuevas.
- Fixtures de memoria (`test/fixtures/memory/seed.json`, `golden.json`) y corpus golden M01–M10 evaluado contra una DB congelada.

### Changed
- `memory doctor` es **estrictamente read-only** por defecto: no ejecuta checkpoint, DDL ni escrituras sobre FTS. `--rebuild` es el único camino que escribe.
- El check `Indice FTS5` detecta desalineación en modo read-only comparando `memory_fts_docsize` contra `memory_nodes` (tres estados: índice ausente = falla; sombra no consultable = omitido; resto = comparación).
- El check `Checkpoint WAL` reporta el estado observable del `-wal` sin ejecutar checkpoint.
- El merge real refresca `.ancleto/working-context.md`; si el refresco falla, el comando reporta que el merge se aplicó y que el bloque quedó desactualizado, con exit code distinto de cero.

### Fixed
- Espera determinista de frames del WAL en los tests de MCP: fallaban sólo en CI Linux.

### Security
- El snapshot compara por identidad de archivo (`realpathSync.native`, case-insensitive en win32) para que un alias de ruta no borre la base fuente.

## [0.15.3] - 2026-10-27

### Changed
- Contrato de delegación de agentes: `@coder` es el único que commitea, sólo los paths nombrados en el checkpoint.
- `git push` denegado como capacidad en toda definición con `bash`; el merge requiere aprobación explícita del usuario caso por caso.
- `task` declarado en las 10 definiciones, `true` sólo en el orquestador.
- `@tester` devuelve un `change diff` (`-U3`, tope de 200 líneas, truncamiento declarado); `@reviewer` lo consume como evidencia y mantiene `bash: false`.
- Reglas de memoria del proyecto destiladas por delegación (5 reglas / 1500 bytes).
- `@documenter` debe citar `archivo:línea` en cada afirmación actualizada o confirmada.
- Ningún agente borra una carpeta de change; `@spec-writer` no recibe capacidad de borrado.
- Content guards migrados a asserts de comportamiento con pruebas de mutación.
- Cierra los ítems de backlog 1, 3 y 9.

### Known limitation
- Los denies de permisos de bash **no** son una frontera técnica en este host: son evadibles con un shim `.CMD` (ítem 19 del backlog).

## [0.15.2] - 2026-10-26

### Added
- **Intake de sesión en el orquestador** (`agents/orchestrator.md`, sección `## Session Intake`): detecta changes activos en `aspec/changes/` excluyendo `archive/` y los reporta sólo si difieren del solicitado; delega un único `git status --short` a `@technical-discovery` cuando el pedido toca el estado del repo y no emite salida cuando no hay nada que reportar. `agents/technical-discovery.md` recibe `'git status --short': allow`.

### Changed
- Techo de lecturas del orquestador: los archivos nombrados explícitamente por el usuario quedan exentos hasta 5 por mensaje, con delegación por encima del tope.
- `<ContextOverflowWarning>` (`src/core/memory/engine.js`) pasa a ser incondicional y delega un Recall a `@memory-keeper` en lugar de nombrar `searchMemory`.
- Specs sincronizadas (`prompt-contracts` +3 requirements, `memory-engine` +1); semilla de `docs/technical-discovery` regenerada (`READY`) y `BACKLOG.md` ítem 17 registra la guía `searchMemory` residual como follow-up diferido.

## [0.15.1] - 2026-10-26

### Changed
- Semilla de `docs/technical-discovery` regenerada tras `0.15.0`.
- Cierre de bookkeeping de la línea `0.15.x`: registro de activación en `BACKLOG.md` y exclusión local de auditoría en `.gitignore`.

## [0.15.0] - 2026-10-26

### Added
- **Bloque de entorno de máquina** (`.ancleto/machine-env.md`): artefacto local derivado y no versionado, regenerado en `init`, `install --project` y `upgrade` con plataforma, shell y su fuente, fin de línea y disponibilidad de cinco herramientas con fallback; exclusión local del clon vía `git check-ignore --no-index` + `info/exclude` (sin gestionar `.gitignore`), entrega a los subagentes con `bash` habilitado y precedencia declarada. Spec nueva en `aspec/specs/machine-environment/spec.md`.
- **Subcomando `ancleto stats failures`**: clasificación de fallos por `env`/`check`/`tool`/`unknown` desde la tabla `part` de la base de opencode, con esqueleto estructural del comando y sesiones afectadas; apertura read-only sobre WAL, agregación en SQL y privacidad (sin `output` ni texto libre). Spec nueva en `aspec/specs/session-failure-report/spec.md`.

### Changed
- `BACKLOG.md`: registro de la activación del bloque de entorno y de los hallazgos de la auditoría de 9 sesiones.

## [0.14.0] - 2026-10-17

### Added
- **Frescura del working-context en las escrituras de la CLI**: `ancleto memory import` regenera `.ancleto/working-context.md` por el mismo camino de render (`refreshWorkingContext`) y el CLI reporta staleness o ausencia del artefacto, en `src/cli/index.js` y `src/core/memory/working-context.js`; spec `memory-engine` actualizada.

### Changed
- `README.md` y `agents/orchestrator.md`: puntos de regeneración del working-context alineados con la nueva superficie.

## [0.13.2] - 2026-10-15

### Added
- **Pipeline de mayor throughput**: cierre en paralelo de `@documenter` y `@memory-keeper`, Validation Ledger prearmado para el reviewer, `affected-set` determinístico por grafo de imports (`src/core/affected-set.js`) y memoria en un solo paso.

### Changed
- `agents/orchestrator.md`, `tester.md`, `reviewer.md` y `memory-keeper.md`; specs `prompt-contracts` y `review` sincronizadas, con tests del `affected-set` en `test/affected-set.test.js`.

## [0.13.1] - 2026-10-15

### Changed
- Semilla de `docs/technical-discovery` regenerada. Reconstrucción parcial: es el único cambio de contenido del tramo además del bump de versión, sin otras entradas trazables.

## [0.13.0] - 2026-10-15

### Added
- **Contrato de validaciones declarativo**: las validaciones dejan de estar hardcodeadas en los prompts y pasan a declararse en `PRODUCT.md` sección `## Project Commands` (correr sólo lo declarado, saltear y registrar lo ausente, nunca inventar); `coder` y `tester` dejan de fijar Prettier/ESLint, el format check es `not-configured` sin formatter declarado, y `mergeTemplateInto` reconcilia el bloque plano legado en `install`/`update`/`upgrade` e `import`. Spec en `aspec/specs/prompt-contracts/spec.md`.
- **Presupuesto de tokens de los prompts**: dedupe del orquestador (hogar único de Runtime Safety y contrato de salida en cada agente), envelope por tramo en vez de verbatim, reglas compartidas con hogar único en `AGENTS.md`, content guards a nivel de comportamiento y materialización del working-context desde el día cero sin `memory.db`.

## [0.12.1] - 2026-10-07

### Added
- **Host `commandcode` (Command Code, CLI `cmd`)**: soporte nativo con layout `.commandcode/{skills,agents,commands}`, adaptador de frontmatter de agents (`adaptCommandCodeFrontmatter` + `COMMANDCODE_TOOL_MAP`/`COMMANDCODE_MCP_TOOL_MAP`), MCP de proyecto en `.mcp.json` (segunda excepción host-MCP, junto a antigravity) y nota de modelo en el orchestrator. En Command Code `tools` omitido significa "ninguna tool", por eso un origen sin `tools` emite `tools: "*"`. Spec nueva en `aspec/specs/commandcode-support/spec.md`; deltas en `agent-install-routing` y `skill-frontmatter-adapters`; tests en `test/cli.test.js` y `test/adapters-frontmatter.test.js`.

### Changed
- `README.md`: tabla de hosts (8) y documentación del MCP y del adaptador de Command Code.
- Semilla de `docs/technical-discovery` regenerada (`READY`).

## [0.12.0] - 2026-10-06

### Added
- **Skill `ancleto-update` (`/cleto-update`)**: actualiza los artifacts de un change existente ante cambios de definición con merge no destructivo — clasifica por artifact dueño (`specs/`, `design.md`, `proposal.md`, `tasks.md`), detecta drift entre los delta specs y los specs principales, y pregunta el modo de escritura (in-place vs `rev2`) en `skills/ancleto-update/SKILL.md` y `commands/cleto-update.md`, con spec en `aspec/specs/artifact-update/spec.md`.

### Changed
- Routing del ciclo aspec (`skills/ancleto-workflow/SKILL.md`) y `test/content-guards.test.js` (registro en `ARTIFACT_SKILLS` y conteo de comandos) actualizados para la nueva skill.
- Semilla de `docs/technical-discovery` regenerada (`READY`).

## [0.11.0] - 2026-10-02

### Added
- **Subcomandos `ancleto memory export|import|gc`** (`gc` acepta `--dry-run` y `--days`): el engine expone `exportActive`, `importNodes` y `gcSuperseded` (los nodos superseded quedan como historia interna y no se exportan) en `src/core/memory/engine.js` y `src/cli/index.js`.
- **Adaptador de frontmatter** (`parseFrontmatter`, `serializeFrontmatter`, `adaptFrontmatter`) para generar assets por host en `src/core/adapters/frontmatter.js`.
- **Gate de lint estándar**: config ESLint flat (`eslint.config.js`), script `npm run lint` y paso bloqueante en `publish.yml`, con test de coherencia en `test/linter-config.test.js`.

### Changed
- `init` interactivo con tier `gratis` pregunta siempre por Muse Spark 1.3 Free, salvo que `ANCLETO_MUSE_SPARK` fuerce el valor; informa el origen (variable de entorno, valor guardado o detección) cuando no pregunta (`src/cli/index.js`, `README.md`).
- Archivados cuatro changes en `aspec/changes/archive/` (`add-standard-linter`, `cleto-review`, `dynamic-frontmatter-adapters`, `memory-ops-export-import-gc`), specs sincronizadas en `aspec/specs/` (`code-review`, `linter-standard`, `memory-ops`, `skill-frontmatter-adapters`), `BACKLOG.md` actualizado y semilla de `docs/technical-discovery` regenerada.

## [0.10.0] - 2026-10-01

### Added
- **Revisión de código con `/cleto-review`** (skill `ancleto-review`): revisión de calidad sobre el scope declarado por el usuario, con detectores de código repetido, método redundante, código mal ubicado y código sin uso (solo reporta, no edita) en `skills/ancleto-review/SKILL.md` y `commands/cleto-review.md`, con spec en `aspec/changes/cleto-review/specs/code-review/spec.md`.
- **Guía de instalación manual (sin npm)** en `docs/instalacion-manual.md`, enlazada desde el índice del `README.md`.
- Archivo `LICENSE` (MIT).

### Changed
- `README.md`: precisión sobre tool ids de Antigravity omitidos con aviso (`mcpServers`/`mcp_*`/`call_mcp_tool` caen en omisión, `call_mcp_tool` prohibido), migración legacy `openspec/` → `aspec/` por copia en `init`/`install --project`/`upgrade`, puntos de regeneración de `.ancleto/working-context.md` y nota de garantía `GUARANTEE NOT SUSTAINED` en `/cleto-verify`.

## [0.9.1] - 2026-09-30

### Fixed
- Codificación URL (`%40`) en badge de versión de npm en `README.md` para compatibilidad con el proxy de imágenes de GitHub (Camo).

## [0.9.0] - 2026-09-30

### Added
- **Soporte para GitHub Copilot** (`--agent copilot`): integración con VS Code y Visual Studio, ruteo de agents/commands a `.github/prompts/*.prompt.md` y configuración MCP en `.github/copilot-mcp.json`.
- **Portabilidad de proyectos entre máquinas**: nuevos comandos `ancleto export` (bundle portable con manifiesto de intención MCP sin paths absolutos) e `ancleto import` (regeneración de paths locales, resolución de binarios y `--repair`), junto con el comando `/cleto-transplant`.
- **Perfil de test automation** (`ancleto init --profile test` / `--profile test:playwright`): perfiles modulares bajo `profiles/test/` con subagentes especializados (`tester`, `reviewer`), comandos `/cleto-test-*` (apply, archive, coverage, heal, proposal) y templates específicos.
- **Detección e importación de OpenSpec pre-existente**: detección automática de proyectos con OpenSpec legacy/externo en `init` e `install --project`, ofreciendo migración asistida e idempotente a `aspec/`.
- **Auditoría de seguridad**: nuevo comando `/cleto-security` y skill `ancleto-security` para análisis de seguridad de cambios y repositorios.

### Fixed
- Corrección de la ruta de instalación de skills de Antigravity (`.agents/skills/<name>/SKILL.md`).
- Corrección del conteo de comandos wrapper en los content guards de la suite de tests.

## [0.8.0] - 2026-09-30

### Added
- **Soporte completo de Antigravity** al elegir `--agent antigravity`: `init` deja el framework listo para usar.
  - skills en `.agents/skills/<n>/SKILL.md`
  - agents adaptados en `.agents/agents/<n>.md`
  - commands materializados como skills en `.agents/skills/<n>/SKILL.md` (Antigravity no tiene dir de commands; los Workflows están deprecados a favor de Skills)
  - MCP de workspace en `.agents/mcp_config.json` (merge no destructivo)
- Nueva capability spec `aspec/specs/antigravity-support/spec.md`.
- `init` ahora configura MCP (y agrega el flag `--no-mcp`).
- `check`/tier/`projects` host-aware (derivan los hosts instalados del manifiesto).

### Changed
- **El adapter de frontmatter de `claude` y `vscode` cambió**: se dropean campos no portables y los tools sin id verificado se **omiten con aviso** (antes se copiaban verbatim / se emitían ids no confirmados). Quien tenga `claude` o `vscode` instalado verá frontmatter distinto tras actualizar.
- Mapa de tools de Antigravity restringido a 5 ids confirmados en el frontmatter (`view_file`, `replace_file_content`, `grep_search`, `run_command`, `manage_task`); el resto se omite con aviso `skip tool '<k>': no verified Antigravity id for agent '<n>'`.

### Fixed
- Dedupe de claves gestionadas en el frontmatter adaptado (evita claves duplicadas en YAML).
- `check` multi-host ya no reporta huérfanos falsos cuando el host instalado no coincide con `agent`.
