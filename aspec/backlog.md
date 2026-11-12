# Backlog — @ancleto/spec

> Follow-ups que todavía no son un change aspec. Un change activo en `aspec/changes/` es la unidad de ejecución; este archivo lista lo que falta decidir/arrancar.
> Última actualización: 2026-11-12 (deuda del pin offline de packDiscovery cerrada; release 0.28.0).

## Prioridad de ejecución

1. **NO-OP en 0.24.0 — ya implementado y archivado (`2026-11-06-fix-repair-mcp-noop`); el predicate `error || normalized || fixed.length>0` está en `src/cli/index.js` y los tests cubren bytes/mtime.** ~~**0.20.1 — `fix(cli)`**: guard de escritura en `repairProjectMcp` (`fixed` vacío + sin error → no tocar bytes). Bug contra contrato vigente; test de bytes/mtime; sin delta de spec. Change propuesto: `fix-repair-mcp-noop`.~~ *(histórico)*
2. **0.21.0 — `feat(cli)`**: **cerrado en 0.23.0** por `portability-legacy-bundle-advisory` (mitad bundle legacy sin intención MCP). La mitad `.opencode/*` histórico quedó **refutada**: `check` ya imprime `✔ .opencode/agents` en un install sano y el dir faltante ya falla con exit 1.
3. **Reingeniería P0**: PR-5 cerrado (`p0-pr5-archive-conformity`); MEM-01 pendiente como runbook que requiere aprobación explícita del usuario antes de escribir en `.ancleto/memory.db`. PR-4 ya está cumplido.
4. **Reingeniería P1**: CH-00 baseline (runbook, prerrequisito) → CH-06a merge determinístico de delta specs **cerrado en 0.22.0** (`ch-06a-specs-merge-deterministic`) → CH-06b selección de tests por affected-set (diferido) → CH-07 A/B de prefijos/caché/modelos (bloqueado por CH-00).
5. **Reingeniería P2 colaboración**: CH-08/MEM-06 (pendiente) → T25 `formatVersion` (**refutado en 0.23.0**) → T27 (reindex, pendiente) → T20 (idempotencia) **cerrado en 0.23.0** → T30 (V1/V2, pendiente) → CH-10 (matriz de hosts, pendiente).
6. **Reingeniería P2 motor/host restante**: #4 (exclusión mutua de escritores), #6 (tope de verificación / orden archive→merge), #18 (seed stale por diseño).
7. **Deuda declarada**: MEM-05c–e pendientes, MEM-05f cerrado, MEM-05g diferido, CH-09a–g pendientes, CH-09h refutado.

> Nota: el paso 2 (0.21.0) quedó **cerrado en 0.23.0** por `portability-legacy-bundle-advisory`; su mitad `.opencode/*` fue refutada. La nota histórica de diferirlo ya no aplica.

> **Actualización 0.22.1 (2026-11-06):** se cerró la deuda residual de CH-06a (ítems 1–4) y se documentó el ítem 5 como exclusión explícita; también quedó fijado el orden archive → merge. CH-06b sigue **diferido** (proyección de tests incompleta, sin consumidor probado) y CH-07 sigue **bloqueado por CH-00**.

## Portabilidad / bundle (post-0.20.0)

| Ítem | Estado | Destino | Evidencia |
|---|---|---|---|
| `repairProjectMcp` no reescribe un destino sano | NO-OP (ya implementado y archivado) | 0.20.1 `fix-repair-mcp-noop` | `src/cli/index.js` (`repairProjectMcp`); `aspec/specs/project-portability/spec.md` (entradas sanas no se reescriben) |
| `.opencode/*` histórico en `installedPaths` | descartado (premisa refutada) | — | `check` ya imprime `✔ .opencode/agents` en install sano; dir faltante ya da `✖ ... (directorio faltante)` con exit 1; contradice `import-installed-paths-union-not-copy` |
| Bundle legacy sin intención MCP host-aware | cerrado en 0.23.0 | `portability-legacy-bundle-advisory` | `importCmd` emite un advisory no bloqueante cuando `manifest.mcp === undefined`; `mcp: []` sigue silencioso |
| Consumo runtime de `copilot-mcp.json` | limitación aceptada | documentar | `HOST_MCP_TARGETS`; `docs/technical-discovery/unknowns.md` |
| Working-context omite reglas por tamaño | aceptado / por diseño | curaduría de memoria (aparte) | renderer de working-context |
| Extensión VS Code | diferido | no tocar | `aspec/changes/ancleto-vscode-extension/` |

## Reingeniería memoria-first

Fuente detallada: `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` + `docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`. **Esos documentos están desactualizados**; el estado verificado abajo es el vigente al 2026-11-05.

### Estado verificado

Método: 29 ítems de nivel plan/backlog; las sub-deudas `CH-09a–h` y `MEM-05c–g` se anotan, no se cuentan.

- **Global:** 15/29 verificado (51,7%), 1 parcial (3,4%), 13 pendiente (44,8%).
- **Eje memoria (sin CH-12/13/14):** 12/26 = 46,2%.
- **Por fase:** P0 4/6 (66,7%); P1 6/8 (75%); P2 eje memoria 2/11 (18,2%); CH-00 0/1.

### Correcciones al plan/backlog

- **B5** figura abierto pero está implementado/archivado (`2026-10-05-memory-actor-provenance`).
- **MEM-05** y **CH-09** figuran sin ✅ pero están implementados/archivados.
- El plan dice "ninguna modificación aplicada" pero 0.20.0 ya contiene P0/P1 mayormente implementados.
- El backlog se declara "planificado, sin implementar" pero el contenedor y ≥10 tramos están archivados.
- El backlog declara lint `eslint src/ test/`; `package.json` ya incluye `scripts/`.
- El plan no incluye PR-4b; el backlog §4.5b y el archive `2026-10-30-backfill-archived-design-decisions` sí existen.
- **Pendiente de housekeeping:** reconciliar `docs/PLAN_...` y `docs/BACKLOG_...` con este estado verificado.

### Qué falta (por prioridad)

- **P0:** PR-5 cerrado (`p0-pr5-archive-conformity`); MEM-01 pendiente como runbook que requiere aprobación explícita del usuario antes de escribir en `.ancleto/memory.db`.
- **P1:** CH-00 baseline como runbook; CH-06a cerrado en 0.22.0 (`ch-06a-specs-merge-deterministic`, capability `spec-sync`); CH-06b (selección de tests por affected-set) diferido por **segunda vez** (0.22.2), ahora por razón estructural: `test/cli.test.js` spawnea el CLI (sin arista de import) y los content guards leen markdown no indexado, así que declararla "no contrato completo" no la vuelve segura; se reabre sólo con consumidor probado + contrato que nombre las suites excluidas. `computeAffectedSet`/`ancleto affected` ya existen y son determinísticos; CH-07 A/B bloqueado por CH-00.
- **P1 · MEM-05 (pendiente) — presupuesto del working-context:** el bloque inyectado
  `<ProjectMemoryRules>` no distingue importancia. Con 39 reglas `scope: project` renderiza 8 y omite
  31; agregar una regla larga (2026-11-06) hizo caer las renderizadas de 9 a 8 y desplazó dos reglas
  que antes entraban, incluida `node-test-scope-explicit-paths`. MEM-05 debe fijar un set universal
  estable, recuperar el resto por tarea y fallar explícito (con `memory_key`) cuando una regla crítica
  no entra. Detalle y criterio de aceptación: `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` §5.
  Núcleo archivado el 2026-11-02; el "set universal estable" sigue pendiente y queda fuera de 0.22.0: requiere curaduría de memoria (MEM-01) y definición de criticality (CH-09a, diferido), y no es código offline-testeable.
  **MEM-05f cerrado en 0.23.0** (`template-legacy-eol-preservation`): `reconcileLegacyBlocks` preserva el EOL por línea y el estado de newline final. **MEM-05g diferido**: inalcanzable — 0 code fences dentro de todo bloque `LOCKED` de `templates/`, `profiles/test/templates/` y `AGENTS.md`/`PRODUCT.md` raíz; sólo input artesanal dispara el cierre temprano.
- **P2 colaboración:** `import --dry-run` por key, `--on-conflict`, `formatVersion`, tombstones, reindex desde proposals (T25, T27, T10/T26/M08/M10). **T25 (`formatVersion`) refutado en 0.23.0**: los exports viejos ya importan sin pérdida, `importNodes` ignora claves extra y exige `Array.isArray`, y ningún consumidor lee una versión; se reabre cuando CH-08 defina el lector.
- **P2 motor/host:** T20 idempotencia **cerrado en 0.23.0** (`memory-record-idempotency`); T30 V1/V2, CH-10 matriz de hosts, #4, #6, #18 pendientes.
- **Deuda:** MEM-05c–g, CH-09a–h.

### Deuda residual de CH-06a — cerrada en 0.22.1

- **(1) Contenedor `--change archive`** — corregido: el resolver de path falla cerrado por identidad de path, exit 2, cero escrituras; aplica también a `--dry-run`.
- **(2) Preámbulo H1** — corregido: regla estructural (como máximo un H1, con cualquier título; un segundo H1 o contenido suelto antes de la primera sección falla cerrado). Se preservan las formas legacy de delta archivadas y se actualizó `spec-sync`.
- **(3) Espaciado ADDED** — corregido: exactamente una línea en blanco antes del siguiente `## `; sin blanco extra al final del archivo.
- **(4) `## RENAMED Requirements` vacío** — test agregado; no-op confirmado.
- **(5) Fase de escritura no transaccional** — documentada como exclusión explícita en `spec-sync`; la atomicidad de plan se mantiene y no se implementó atomicidad multi-archivo.

## Relación con 0.20.0

`2026-11-05-host-neutral-bundle` es una línea independiente de portabilidad (export/import/MCP), no un tramo memoria-first. Su equivalente en el eje memoria (colaboración/continuidad) es CH-08/MEM-06, aún pendiente.

## Relación con 0.22.0

0.22.0 cierra CH-06a: `ancleto specs merge --change <slug> [--dry-run] [--json]`, merge estructural idempotente por título exacto, fail-closed con cero escrituras y atomicidad de plan; nueva capability canónica `spec-sync`. No cambia `specs check`, `mergeLocked`, el affected-set ni los contratos de memoria/seed.

## Relación con 0.22.1

0.22.1 contiene dos changes, `specs-merge-hardening` y `archive-order-correctness`, sin comandos ni flags nuevos. Se sincronizaron las specs canónicas `spec-sync` y `memory-ops`. El orden de archivo queda fijado en: merge → preflight read-only → promover `## Decisiones` aprobadas → mover → commit, a través de `agents/orchestrator.md`, `agents/documenter.md`, `skills/ancleto-archive`, `skills/ancleto-bulk-archive` y `skills/ancleto-onboard`; los content guards fijan ese orden.

**Descartado / diferido en 0.22.1 (sigue pendiente, no hecho):**

- **CH-06b `--tests`** (proyección de tests por affected-set): descartado — no puede ser un contrato completo de selección de tests y no tiene consumidor probado. Sigue diferido.
- **CH-00 baseline**: runbook, no publicable; sigue pendiente.
- **CH-07** (A/B de prefijos/caché/modelos): bloqueado por CH-00.
- **CH-08/MEM-06, MEM-05 y el P2 motor/host restante** (#4, #6, #18, T20, T30, CH-10, T25/T27): siguen pendientes/diferidos.
- **Extensión VS Code**: sin cambios en esta release; sigue diferida.

## Relación con 0.22.2

0.22.2 contiene un único change, `test-oracles-hardening`: un **change de conformidad, sin delta**. No agrega comandos, flags ni comportamiento; fija con tests lo que ya estaba implementado.

- **T1 — `specs merge --dry-run --json`:** idempotencia y cero escrituras (dos corridas byte-idénticas; caso `--change archive` con exit 2 repetido).
- **T2 — clasificación de imports dinámicos del affected-set:** `import('node:sqlite')` externo; `import('node:sqlite', { with })` e `import(x)` → `unresolved`; relativo irresoluble → `unresolved`; relativo resoluble → arista.
- **T3 — invariante negativa de suites spawn-only:** un test que spawnea el CLI no entra al affected-set, con control positivo `externalCount === 1`.
- **Archivos:** `test/specs-merge.test.js` (+71/−1 BOM), `test/affected-set.test.js` (+128). Suite: 1142 total / 1137 pass / 0 fail / 5 skips preexistentes (win32). `npm run lint` passed; format `not-configured`; typecheck n/a.
- **Versiones y verificaciones:** tag anotado `v0.22.2` @ `aef671bf8e55310789a39c955e99604d75007af6`; main == origin/main == tag; run de publish `42299926378` success con `+ @ancleto/spec@0.22.2`; npm version/dist-tag/gitHead OK y tarball HTTP 200.
- **Archivo:** `aspec/changes/archive/2026-11-06-test-oracles-hardening/`.
- **Decisiones promovidas a memoria:** `affected-set-dynamic-classification-already-conformant`, `affected-set-projection-deferred-structural`.
- **Seed:** regenerado `READY / impact none`; 13 archivos actualizados, incluidas 22 ocurrencias de versión de estado actual (`0.22.1`→`0.22.2`) y conteos 832→834 / 822→824.
- **Memoria:** 648 refs / 202 nodos activos / 0 sin resolver; 39 reglas project, 8 renderizadas, 31 omitidas.

**Descartado / diferido en 0.22.2 (sigue pendiente, no hecho):**

- **A — CH-06b proyección `--tests`:** diferido por **segunda vez**, ahora por razón estructural: `test/cli.test.js` spawnea el CLI (sin arista de import) y los content guards leen markdown no indexado; declararla "no contrato completo" no la vuelve segura. Se reabre sólo con consumidor probado + contrato que nombre las suites excluidas.
- **B — clasificación `import('node:sqlite')`:** **NO-OP** — ya estaba implementado (`staticCallSpecifier` acepta literal puro; los no relativos suman `externalCount`). Reproducido: `import('node:sqlite')` → externo; el reporte real no lo lista en `unresolved` (22 unresolved: 8 `import(<dynamic>)`, 4 `require(<dynamic>)`, 10 relativos). Cierra como "ya conforme", no como trabajo pendiente.
- **C — atomicidad multi-archivo de `specs merge`:** rechazado otra vez — temp+backup+rollback no da atomicidad real entre renames, agrega sidecars fuera del alcance declarado y convertiría una exclusión explícita en garantía no sostenible. La propiedad valiosa es el fail-closed del plan con cero escrituras.
- **D–H:** sin evidencia + no offline-testeable (CH-08/MEM-06 requiere multi-worktree; MEM-05/MEM-01/CH-09a requieren curaduría de DB y aprobación; CH-00/CH-07 no publicables; P2 motor/host y deuda CH-09/MEM-05c–g sin trigger).

## Relación con 0.23.0

0.23.0 contiene tres changes, todos archivados. No agrega comandos ni flags nuevos.

- **`memory-record-idempotency` (T20):** `recordNode` trata la reescritura del mismo `memory_key` con `(type, scope, content, justification)` exactamente iguales como no-op — sin insert, sin supersede, `superseded: 0`, y devuelve los valores persistidos incluido el `created_at` original; cualquier diferencia sigue supersediendo. `createdAt`/`source`/`confidence` quedan fuera de la identidad; orden de validación y forma de retorno sin cambios. Delta en `memory-engine`: `Idempotencia de reescritura idéntica en recordNode`.
- **`portability-legacy-bundle-advisory`:** `import` emite **un** advisory no bloqueante cuando `manifest.mcp === undefined` (bundle previo a la intención MCP host-aware); exit code y salida escrita sin cambios; `mcp: []` sigue silencioso; no-array sigue exit 1. Delta en `project-portability`: `Aviso de bundle legacy sin intención MCP en el import`. Al mergear se normalizó en la canónica un `## ADDED Requirements` filtrado a `## Requirements`.
- **`template-legacy-eol-preservation` (MEM-05f):** `reconcileLegacyBlocks` preserva el EOL original de cada línea sobreviviente al eliminar un run legacy (antes rejuntaba todo el archivo con el EOL dominante: un archivo 2×CRLF/6×LF quedaba todo CRLF) y preserva exactamente el estado de newline final de la entrada; el camino sin remoción sigue byte-idéntico. Delta en `prompt-contracts`: `Preservación del fin de línea por línea al reconciliar bloques legacy`.
- **Validaciones:** suite 1161 total / 1156 pass / 0 fail / 5 skips preexistentes (antes 1142/1137/5/0); `npm run lint` passed; format `not-configured`; typecheck n/a. Review en dos rondas, aprobado; R2 levantó dos hallazgos (borde de newline en EOF y oráculos delgados), ambos cerrados con código/tests.
- **Versiones y verificaciones:** tag anotado `v0.23.0` @ merge commit `ce857ebede4cf8c85161b4082817720f4343bac9`; main == origin/main == tag; run de publish `42352804831` success con `+ @ancleto/spec@0.23.0`; npm version 0.23.0, `dist-tags.latest` 0.23.0, `gitHead` == merge commit; tarball HTTP 200. `ancleto upgrade` corrió limpio sin cambios en la superficie de producto trackeada.
- **Archivos:** `aspec/changes/archive/2026-11-07-memory-record-idempotency/`, `.../2026-11-07-portability-legacy-bundle-advisory/`, `.../2026-11-07-template-legacy-eol-preservation/`.
- **Decisiones promovidas a memoria:** `recordnode-identical-rewrite-is-noop`, `recordnode-identity-excludes-createdat-source-confidence`, `recordnode-identical-noop-suppresses-supersede-only`, `legacy-bundle-missing-mcp-key-advisory-only`, `reconcile-legacy-preserves-per-line-eol`.
- **Seed:** regenerado y alineado `READY / impact none`; 843 archivos / 833 fuentes; `pluginVersion` 0.23.0 en todos los docs.
- **Memoria:** 315 nodos activos / 667 refs / 0 sin resolver; 40 reglas project, 8 renderizadas, 32 omitidas (gap MEM-05 sin cambios).

**Descartado / diferido en 0.23.0 (sigue pendiente, no hecho):**

- **A1 — advisory para `.opencode/*` en `installedPaths`:** **refutado** — `check` ya imprime `✔ .opencode/agents` en un install moderno sano; un advisory dispararía en todo install correcto, y el dir faltante ya da `✖ ... (directorio faltante)` con exit 1. Además contradice la decisión `import-installed-paths-union-not-copy` (registrar esos paths es historia multi-host correcta). Registrado como decisión descartada `opencode-installed-paths-not-drift`.
- **B / T25 — `formatVersion` en `memory export`:** **refutado** — reproducido: los exports viejos ya importan sin pérdida, `importNodes` ignora claves extra de nodo y exige `Array.isArray` (un envelope lanza), y ningún consumidor lee una versión. Un marcador sin lector es especulativo; se reabre cuando CH-08 defina el lector.
- **MEM-05g / D-g — fences dentro de un bloque `LOCKED`:** **diferido** — inalcanzable: 0 code fences dentro de todo bloque `LOCKED` de `templates/`, `profiles/test/templates/` y `AGENTS.md`/`PRODUCT.md` raíz; sólo input artesanal dispara el cierre temprano. Registrado como decisión descartada `locked-inner-fence-hardening-deferred`.
- **E — CH-09e / CH-09h:** CH-09h **refutado** — el índice parcial `UNIQUE` se crea en el mismo array `MIGRATIONS` que la tabla (`database.js:20-21`) y un insert activo duplicado se rechaza (`UNIQUE constraint failed`), así que dos activas por clave son físicamente imposibles en cualquier DB creada por este código. CH-09e sin consumidor (`consolidate` ya agrupa por `type` + contenido normalizado) y su disparador documentado es "cuando un consumidor necesite desambiguar por tipo".
- **F / #6:** la mitad de orden ya está corregida (merge → preflight read-only → promover → mover → commit) y guardada en cinco archivos canónicos; la formulación vieja "archive→merge" la contradice. La mitad "tope de verificación" no tiene oráculo offline medible.
- **G — CH-10 / T30:** CH-10 necesita una matriz multi-host real (no offline-testeable); la premisa de T30 no coincide con el código (`opencode` es un adapter passthrough que nunca mezcla `bash`/`task` con `shell`/`subagent`).
- **H — CH-08/MEM-06, MEM-05/MEM-01/CH-09a, CH-00/CH-07:** diferimientos previos sin cambios (multi-worktree / curaduría de DB con aprobación / no publicable en npm).

## Relación con 0.24.0

0.24.0 contiene dos changes, ambos archivados. Release minor por cambio observable de modelo.

- **`specs-merge-canonical-guard` (patch-class):** `ancleto specs merge` falla cerrado (exit 2, cero escrituras) cuando la spec canónica contiene un heading de sección de delta (`## ADDED/MODIFIED/REMOVED/RENAMED Requirements`), para los 4 tipos, en fase de plan; el guard aplica sólo a canónicas, nunca a delta specs. Se normalizaron `copilot-support`, `legacy-import` y `test-profile` a `## Requirements`. Delta en `spec-sync`.
- **`agent-model-minimo-migration` (observable):** `TIERS.minimo` y `MINIMO_CHAIN` alineados a `opencode-go/deepseek-v4.1-flash` (cadena de 2: `opencode-go/deepseek-v4.1-flash` → `opencode/deepseek-v4.1-flash-free`), completando el commit `9e45105` que migró `agents/*.md`/`opencode.json` sin actualizar la tabla de tiers (11 tests rojos). Se pluralizó el aviso (`1 agente`/`N agentes`) y se alinearon README/AGENTS. Delta en `agent-model-tiers`.
- **Validaciones:** suite 1173/1168 pass / 0 fail / 5 skips preexistentes; `npm run lint` passed; format `not-configured`; typecheck n/a. Review en dos rondas; R1/R2 sin CRITICAL ni GUARANTEE NOT SUSTAINED.
- **Release:** tag anotado `v0.24.0` @ merge `2d5d82751ff0c44b0fc55d39282bcf5f6742dc42`; main == origin/main == tag; run `42502061685` success con `+ @ancleto/spec@0.24.0`; npm version/dist-tag/gitHead OK y tarball HTTP 200.
- **Seed:** regenerado y alineado `READY / impact none`; 849 archivos / 839 fuentes; `pluginVersion` 0.24.0 en los 11 docs.
- **Memoria:** 322 nodos activos / 687 refs / 0 sin resolver; 42 reglas project, 8 renderizadas, 34 omitidas. Promovidas: `specs-merge-canonical-heading-fail-closed`, `specs-merge-canonical-guard-canonical-scope`, `repair-mcp-noop-already-shipped`, `tier-minimo-opencode-go-alignment`, `agent-model-migration-source-of-truth`.

**Descartado / diferido en 0.24.0 (sigue pendiente, no hecho):**

- **#4 exclusión mutua de escritores:** diferido — sólo prosa, sin mutex ejecutable ni consumidor offline; tocar `agents/**`/`skills/**` obliga a upgrade sin defecto observado.
- **#18 seed stale por diseño:** diferido — el release ya regenera el seed post-bump; cambiar `MATERIAL_FILE_RES`/`DEFAULT_IGNORES` invalidaría todos los estados persistidos y no hay spec canónica del detector.
- **T27 reindex desde proposals:** diferido — sin consumidor ni prueba e2e offline; requiere MEM-01.
- **CH-06b `--tests`:** sigue diferido por razón estructural (tercera vez); sin consumidor probado.
- **CH-10 / CH-08-MEM-06 / MEM-05 / MEM-01 / CH-00 / CH-07 / CH-09a–g:** diferimientos previos sin cambios.
- **Item 1 `repairProjectMcp`:** **NO-OP** — ya implementado y archivado en 0.20.1 (`2026-11-06-fix-repair-mcp-noop`); la fila del backlog estaba desactualizada.
- **T30 V1/V2:** **NO-OP** — premisa refutada: el adapter `opencode` es passthrough y no mezcla `bash`/`task` con `shell`/`subagent`.

**Deuda descubierta en 0.24.0:**

- **El flujo de archive no pasa por `mergeSpecText`:** `skills/ancleto-archive` / `ancleto-bulk-archive` aplican deltas editando `aspec/specs/<capability>/spec.md` directamente. El nuevo guard de heading de delta en canónica NO cubre ese camino. Candidato: rutear el sync del archive por `ancleto specs merge` o agregar la validación en la skill.
- **`--help` de subcomandos ejecuta el subcomando:** `upgradeCmd` no tiene handler de ayuda, así que `ancleto upgrade --help` corre el upgrade completo. Candidato: agregar handlers de `--help` a los subcomandos que mutan estado.

→ **Cerrada en 0.25.0** por `archive-sync-via-specs-merge` (routing del archive por `specs merge`) y `cli-subcommand-help-guards` (guards de `--help`). Ver `## Relación con 0.25.0`.

## Relación con 0.25.0

0.25.0 contiene dos changes, ambos archivados. Release minor por cambio observable (`--help`) y por superficie de producto (skills).

- **`archive-sync-via-specs-merge`:** el delta-sync del archive/bulk-archive ahora rutea exclusivamente por `ancleto specs merge --change <slug>` (el guard fail-closed de heading de delta en canónica aplica al camino de archive); exit≠0 aborta el move; sin delta sigue "sin delta"; `ancleto-sync-specs` standalone y documenter Standalone mode quedan fuera y sin cambios. Delta en `prompt-contracts`.
- **`cli-subcommand-help-guards`:** `--help`/`-h` en subcomandos que mutan estado (install, update, upgrade, init, memory, import, export, mcp, specs, specs merge, projects, `list --projects`) imprime uso a stdout, exit 0, cero escrituras; `discovery --help` y la ayuda global no cambian; read-only (`check`/`doctor`/`stats`/plain `list`/`affected`/`specs check`) queda fuera. Delta en `cli-diagnostics`.
- **Validaciones:** 1188 tests / 0 fail / 5 skips preexistentes; `npm run lint` passed; format `not-configured`; typecheck n/a. Review en dos rondas; R1 y R2 cerrados con código+test; GUARANTEE sustained.
- **Release:** tag anotado `v0.25.0` @ merge `bacca2ede06e54bbc640c155d968f0e06f792142` (2 padres); main == tag; run `42528205947` success con `+ @ancleto/spec@0.25.0`; npm version/dist-tag/gitHead (== merge) OK; tarball HTTP 200.
- **Seed:** regenerado `READY / impact none`; `pluginVersion` 0.25.0 en los 11 docs; 845 archivos/fuentes. `seedMapPresent:false` en READY es un quirk pre-existente de `checkDiscovery` (sólo se asigna en el branch STALE), documentado en `unknowns.md` (corregido en 0.26.0 por fix-discovery-seedmap-present).
- **Memoria:** 3 decisiones promovidas (`archive-sync-routes-through-specs-merge`, `archive-sync-canonical-surface-documenter`, `subcommand-help-guard-zero-write`); 325 totales / 218 activas / 701 refs / 0 sin resolver. `projects-guarded-registry-write` quedó `propuesto` (no promovido).

**Descartado / diferido en 0.25.0 (sigue pendiente, no hecho):**

- **#4 exclusión mutua de escritores / #18 seed stale por diseño / T27 / CH-06b / CH-10 / CH-08-MEM-06 / MEM-05 / MEM-01 / CH-00 / CH-07 / CH-09a–g:** diferimientos previos sin cambios (sin evidencia nueva + no offline-testeable).
- **F — housekeeping de memoria `tier-minimo-*`:** no ejecutado; requiere OK explícito del usuario. El conflicto `tier-minimo-fallback-chain-resolution` (3-chain) vs `tier-minimo-opencode-go-alignment` (2-chain) sigue activo.

## Relación con 0.26.0

0.26.0 contiene un change funcional, archivado. Release patch: corrige un reporte de diagnóstico, sin comandos ni flags nuevos.

- **`fix-discovery-seedmap-present` (funcional, delta ADDED en `cli-diagnostics`):** `ancleto discovery --check` ahora calcula `seedMapPresent` de forma independiente del estado (READY/PARTIAL/MISSING/STALE con `seed-map.json` válido ⇒ `true`); `affectedDocs` sigue STALE-only; `readSeedMap` rechaza `docs` no-objeto-plano (arreglo/null). Antes, en READY siempre reportaba `false` (sólo se asignaba en el branch STALE). Archivado en `aspec/changes/archive/2026-11-08-fix-discovery-seedmap-present/`. Archivos: `src/cli/index.js`, `test/cli.test.js`, `aspec/specs/cli-diagnostics/spec.md`.
- **Validaciones:** 1196 tests / 1191 pass / 5 skips preexistentes / 0 fail; `npm run lint` passed; format `not-configured`; typecheck n/a. Review en dos rondas (R1/R2) sin CRITICAL/MAJOR ni GUARANTEE NOT SUSTAINED.
- **Release:** tag anotado `v0.26.0` @ merge `cd2858e64d94014e57282dbe4b0340a16917fee9` (2 padres `bacca2e` + `2f0e2f1`); `main == origin/main == tag`; run `42547593509` success con `+ @ancleto/spec@0.26.0`; npm `version`/`dist-tags.latest` = 0.26.0, `gitHead` == merge, tarball HTTP 200.
- **Seed:** regenerado `READY / impact none`; `pluginVersion` 0.26.0 en los 11 docs; 848 archivos/fuentes; el quirk `seedMapPresent:false` en READY se eliminó de `docs/technical-discovery/unknowns.md` y se documentó el contrato vigente.
- **Memoria:** 1 decisión promovida (`discovery-seedmap-present-state-independent`); 326 nodos totales / 219 activos / 705 refs / 0 sin resolver; 42 reglas `scope:project`, 8 renderizadas, 34 omitidas (gap MEM-05 sin cambios).

**Descartado / diferido en 0.26.0 (sigue pendiente, no hecho):**

- **A2 #18 seed stale por diseño:** diferido — sin defecto observado, invalidaría los `.discovery-state.json` persistidos, sin spec canónica del detector. → **cerrado (pieza documental) en 0.26.1**; A2c sigue diferido.
- **A3 #4 exclusión mutua de escritores:** diferido — la spec canónica exige paralelización; prosa-only, sin mutex ejecutable.
- **A4 MEM-05 presupuesto working-context:** diferido — presupuesto/orden congelados en `memory-engine`; depende MEM-01 + CH-09a.
- **A5 CH-06b `--tests`:** diferido — `--tests` no existe; incompletitud estructural (spawn sin arista + content guards markdown).
- **A6 T27 / CH-10 / CH-08-MEM-06 / CH-00 / CH-07 / CH-09a–g:** diferidos — sin evidencia nueva / no offline-testeable.
- **A7 housekeeping de memoria:** NO ejecutado — requiere OK literal del usuario (no otorgado); el conflicto `tier-minimo-fallback-chain-resolution` (3-chain) vs `tier-minimo-opencode-go-alignment` (2-chain) sigue activo.

## Relación con 0.26.1

0.26.1 contiene un change documental/test, archivado. Release patch: fija y pinea el detector de frescura del seed, sin cambio observable ni de runtime.

- **`spec-seed-freshness-detector` (funcional, delta ADDED en `cli-diagnostics`):** documenta el comportamiento VIGENTE de `ancleto discovery --check` (impact `material`/`minor`/`none`, `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `areaOf`, `computeImpact`, `materialReasons`, `notes`, `affectedDocs`) como Requirement canónico y lo pinea con 14 tests en `test/cli.test.js`. No se tocó `src/cli/index.js` ni ninguna constante. Archivado en `aspec/changes/archive/2026-11-10-spec-seed-freshness-detector/`. Archivos: `test/cli.test.js`, `aspec/specs/cli-diagnostics/spec.md`.
- **Hecho operativo:** el pack transitorio del seed NO debe guardarse dentro de `.ancleto` (cuenta como área de `sources` y reintroduce `STALE`/`minor`); el pack se copia fuera del repo (tmp) y el seed documental se materializa desde ahí. Seed final `READY`/`impact none`, `seedMapPresent:true`, `pluginVersion 0.26.1` en los 11 docs, 851 fuentes/861 archivos.
- **Validaciones:** 1210 tests / 1205 pass / 5 skips preexistentes / 0 fail; `npm run lint` passed; format `not-configured`; typecheck n/a. Review en dos rondas (R1/R2) aprobado; sin CRITICAL ni `GUARANTEE NOT SUSTAINED`.
- **Release:** tag anotado `v0.26.1` @ merge `dbe84baeab1dc412d81ecf7753086e842e02299e` (2 padres `cd2858e` + `247dba2`); main == tag; run `42849233559` success con `+ @ancleto/spec@0.26.1`; npm version/dist-tag/gitHead OK; tarball HTTP 200.
- **Memoria:** 2 decisiones promovidas (`seed-freshness-detector-documented-in-cli-diagnostics`, `seed-freshness-rule-change-requires-minor`); 328 totales / 221 activas / 711 refs / 0 sin resolver; 42 reglas project, 8 renderizadas, 34 omitidas (gap MEM-05 sin cambios).

**Descartado / diferido en 0.26.1 (sigue pendiente, no hecho):**

- **A2c #18 (producto: que el bump deje de contar / regeneración al checklist):** diferido — sin decisión de producto; riesgo alto (invalida estados persistidos).
- **A3 #4 exclusión mutua de escritores:** diferido — prosa-only, sin mutex ejecutable; la spec exige paralelización.
- **A4 MEM-05 presupuesto working-context:** diferido — depende de MEM-01 + CH-09a.
- **A5 CH-06b `--tests`:** diferido — estructural (spawn sin arista + content guards markdown).
- **A6 T27 / CH-10 / CH-08-MEM-06 / CH-00 / CH-07 / CH-09a–g:** diferidos — sin evidencia nueva / no offline-testeable.
- **A7 housekeeping de memoria:** NO ejecutado — requiere OK literal; el conflicto `tier-minimo-*` sigue activo.
- **Follow-up de tests (WARNING R2):** `snapshotWithMtime` en `test/cli.test.js` duplica el walker de `projectSnapshot`; consolidar en un helper con opción `mtime` (bajo riesgo, sin cambio de contrato). → **COMPLETADO en 0.26.2** (F1: consolidación de los walkers en `snapshotTree(dir, mode)`).

## Relación con 0.26.2

0.26.2 contiene un change de conformidad, archivado. Release patch **test-only**: no cambia runtime, comandos ni flags.

- **`readonly-helper-and-freshness-pins` (conformidad, sin delta):** cita `spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check`. Archivado en `aspec/changes/archive/2026-11-10-readonly-helper-and-freshness-pins/`.
  - **F1:** los 3 walkers read-only (`projectSnapshot`, `snapshotWithMtime`, `snapshotMtimes`) se consolidaron en un único `snapshotTree(dir, mode)` con guard fail-closed para modo desconocido; shapes de hoja preservadas; invariante discriminante mtime-only (bytes no cambia, mtime sí).
  - **F2:** los pins MISSING/PARTIAL ahora afirman `impact:'none'` + arreglos vacíos (`changedAreas`/`materialReasons`/`notes`/`affectedDocs`); `recommendedAction` NO se pinea (ver pendiente).
  - **F3:** nuevo pin "estado existente sin `hash`" → `STALE`/`material`/`regenerate` + arreglos vacíos (la clave `hash` se OMITE; `seedFixture` convierte null/undefined en hash real).
- **Tests resueltos:** el follow-up "WARNING R2" (bullet de arriba) quedó **COMPLETADO en 0.26.2** con la consolidación de walkers (F1).
- **Release:** tag anotado `v0.26.2` @ merge `e1c0a4fa6f3ca6f5fcfdb513a0abeab11b3515cc`; npm `0.26.2` (latest), tarball servido, `gitHead == e1c0a4f`.
- **Seed:** regenerado a 0.26.2 (853 fuentes/863 archivos); `discovery --check` `READY`/`impact none`; `seedMapPresent:true`.
- **Memoria:** 3 decisiones promovidas: `test-readonly-snapshot-single-walker`, `discovery-freshness-pins-conformity-no-delta`, `readonly-f3-must-omit-hash-key`.

**Descartado / diferido en 0.26.2 (sigue pendiente, no hecho):**

- **A2c #18 (producto):** diferido — sin la frase literal "APROBADO: A2c producto"; aplicarlo invalidaría todos los `.discovery-state.json` persistidos.
- **A3 #4 exclusión mutua de escritores:** diferido — prosa-only; la spec canónica exige paralelización.
- **A4 / MEM-05 presupuesto working-context:** diferido — requiere curaduría MEM-01 + criticality CH-09a; no offline-testeable.
- **A5 / CH-06b `--tests` por affected-set:** diferido — estructural: spawn sin arista + content guards markdown.
- **A6 T27 / CH-10 / CH-08-MEM-06 / CH-00 / CH-07 / CH-09a–g:** diferidos — sin evidencia nueva.
- **A7 housekeeping de memoria:** NO ejecutado — sin la frase literal "APROBADO: memoria housekeeping"; el conflicto `tier-minimo-*` sigue abierto.
- **D deuda MEM-05c–e / CH-09e–g:** diferida — sin evidencia + offline + sin disparador.

**Pendiente nuevo en 0.26.2 (requiere cambio funcional):**

- **Divergencia spec↔código en `recommendedAction` para MISSING/PARTIAL:** el código devuelve `generate`/`complete` (`src/cli/index.js:2347-2356`) mientras `spec.md:574-575` manda `continue` cuando `impact` es `none`. NO se pineó (sería oráculo no canónico). Resolverlo requiere un change FUNCIONAL con delta MODIFIED + bump minor. No se agregó regla de memoria de cierre para no duplicar este ítem. → **RESUELTO en 0.26.3** (`align-freshness-recommended-action-spec`).

## Relación con 0.26.3

0.26.3 contiene un change archivado. Release patch (spec+test): alinea la spec canónica con el comportamiento ya vigente; sin cambio de runtime, comandos ni flags.

- **`align-freshness-recommended-action-spec` (funcional, delta MODIFIED en `cli-diagnostics`):** la canónica `aspec/specs/cli-diagnostics/spec.md` quedó alineada al código: `MISSING`→`recommendedAction: generate`, `PARTIAL`→`complete`, documentado como excepción a la regla `impact:none`→`continue`; nuevo scenario `MISSING y PARTIAL recomiendan generar o completar`; párrafo de estructura precisado (`changedAreas`/`materialReasons`/`notes`/`affectedDocs` vacíos + `missingDocs`). Tests pinean `generate`/`complete`. Archivado en `aspec/changes/archive/2026-11-10-align-freshness-recommended-action-spec/`. **Resuelve el pendiente de 0.26.2** (divergencia `recommendedAction`).
- **Release:** tag anotado `v0.26.3` @ merge `ce6fad4`; npm `0.26.3` (latest), tarball servido, `gitHead == ce6fad4`.
- **Seed:** regenerado a 0.26.3 (856 fuentes/866 archivos/aspec 296); `discovery --check` `READY`/`impact none`; `seedMapPresent:true`.
- **Memoria:** 2 decisiones promovidas: `freshness-recommended-action-spec-alignment`, `pin-recommended-action-missing-partial`.

**Notas / pendiente en 0.26.3 (no hecho):**

- **Memoria — nodo incompleto:** `discovery-freshness-pins-conformity-no-delta` (promovido en 0.26.2) quedó **incompleto/contradicho** por la evidencia nueva (afirmaba que la conducta de `cli-diagnostics` ya era canónica; el mapeo `recommendedAction` no lo era). NO se supersedió: requiere OK explícito del usuario. → **RESUELTO**: nodo superseded en limpieza posterior con la evidencia de 0.26.3 (el mapeo `recommendedAction` no era canónico).
- **Gap de validación de deltas:** la estructura de un delta NO está cubierta por los comandos declarados (lint = `eslint src/ test/ scripts/`; los tests no leen `aspec/changes/**`); sólo `specs merge`/`specs check` lo validan en el archive. El review debe leer el delta; un delta malformado pasaría el ledger del tester. → **CERRADO en 0.26.4**: cubierto por `test/delta-spec-structure.test.js`, que barre `aspec/changes/*/specs/*/spec.md` y valida con `parseDeltaSpec`.
- **`STALE`+`impact:none` → `continue`:** alcanzable pero sin pin (gap conocido, fuera de alcance). → **RESUELTO**: pin agregado (`hash` desincronizado con `sources`/`fileHashes` vigentes ⇒ STALE/none/continue).
- **A2c #18 / A3 #4 / A4 MEM-05 / A5 CH-06b / A6 / A7 memoria / D deuda MEM-05c–e + CH-09e–g:** siguen diferidos (sin evidencia nueva / sin OK literal).
- **Residual 0.26.3:** el pin `STALE`+`impact:none` está **commiteado pero no liberado**; queda pendiente en la próxima sesión (patch mínimo 0.26.4). → **RESUELTO en 0.26.4**: el pin residual quedó incluido en la release.

## Relación con 0.26.4

0.26.4 contiene un change archivado. Release patch (test+spec): agrega un guard estructural de deltas de changes activos en la suite declarada y libera el pin residual de frescura; sin cambio de runtime, comandos ni flags.

- **`active-delta-structure-guard` (funcional con delta ADDED en `spec-sync`):** `test/delta-spec-structure.test.js` (10 tests) barre `aspec/changes/*/specs/*/spec.md`, excluye `archive` por identidad y valida con `parseDeltaSpec`; tolera 0 changes activos y falla cerrado sólo ante árbol ilegible o spec no legible. Delta `Validación estructural de delta specs de changes activos` mergeado con `specs merge --change` y change archivado en `aspec/changes/archive/2026-11-11-active-delta-structure-guard/`. Decisión `active-delta-structure-guard` promovida a memoria.
- **Pin residual de frescura:** el pin `STALE` con `impact: none` → `continue` (ya commiteado en `0f6ed0a`) queda **liberado** en esta release.
- **Seed:** regenerado `READY` / `impact: none` / `seedMapPresent: true`; `pluginVersion 0.26.4`; 860 fuentes / ~38.6k tokens.

**Descartado / diferido en 0.26.4 (sigue pendiente, no hecho):**

- **Extender `specsCheckCommand`:** descartado — violaría la compatibilidad pineada de `specs check` y el alcance acotado de `specs merge`, y tocar `src/cli/index.js` lo volvería minor.
- **A2c / A3 `#4` / A4 `MEM-05` / A5 `CH-06b` / A6 / A7 / D / `#6` / `#18` / `T27` / `CH-00` / `CH-07` / `CH-08`-`MEM-06` / `CH-09a–g` / `CH-10`:** el debate de esta sesión no encontró evidencia nueva, por eso siguen diferidos; `ancleto-vscode-extension` sigue diferido, el conflicto `tier-minimo-*` y el propuesto `projects-guarded-registry-write` siguen sin OK literal.

## Relación con 0.27.0

0.27.0 contiene un change archivado. Release minor (runtime + spec + test): el VALOR de la clave `version` de primer nivel del `package.json` raíz deja de contar como cambio de contenido/material en la frescura del seed; sin cambio de comandos ni flags.

**Hecho:**

- **`seed-freshness-version-bump-not-material` (funcional, delta MODIFIED en `cli-diagnostics`):** change implementado, testeado y archivado en `aspec/changes/archive/2026-11-11-seed-freshness-version-bump-not-material/`; delta `MODIFIED` mergeado en `aspec/specs/cli-diagnostics/spec.md` (Requirement `Clasificación determinista de frescura del seed en discovery --check`, 17 scenarios).
- **Regla:** el VALOR de la clave `version` de primer nivel del `package.json` raíz ya no cuenta como cambio de contenido ni material; `package.json` sigue material para cualquier otro campo (dependencias, scripts, engines, indentación, `version` anidada).
- **Estado `.discovery-state.json`:** `ruleVersion: 2` + `semantic: { hash, fileHashes }` aditivos, conservando `hash`/`fileHashes` crudos (rollback intacto); estados sin `ruleVersion` se comparan crudos, byte-idénticos al comportamiento previo.
- **Evidencia end-to-end en este repo** (no destructiva, reversiones verificadas): bump de `version` aislado → `READY`/`none`/`continue`; bump + reflejo en `package-lock.json` + `CHANGELOG.md` → `STALE`/`minor`/`continue` con `materialReasons []` (nota: `package-lock.json` está en `config.exclude` del discovery, así que sólo `CHANGELOG.md` aparece como área); cambio real de dependencia → `material` con `archivo material modificado: package.json`.
- **Guard nuevo en `test/delta-spec-structure.test.js`:** detecta un `spec.md` bajo un change ACTIVO fuera de `specs/<capability>/spec.md` (invisible hoy para merge y guard), reutilizando `parseDeltaSpec`; ignora archivos incidentales/vacíos.
- **Release:** `0.27.0` (minor), tag ANOTADO `v0.27.0` → `1e2136d08754c30cbe7691425d356d90a3b49670` (merge `--no-ff` de development), run de publish `43050543405` success (`+ @ancleto/spec@0.27.0`), npm `version 0.27.0` / `latest` / `gitHead == 1e2136d…` y tarball HTTP 200.
- **Seed regenerado:** 863 fuentes / ~38.974 tokens, `pluginVersion 0.27.0` en 11/11 docs, `discovery --check` `READY`/`none`, `seedMapPresent: true`.
- **Memoria:** 5 decisiones promovidas al archivar; 1 regla de cierre `delta-oracle-empty-text-accepted` (scope `feature`: `parseDeltaSpec('')` devuelve `errors: []`); curaduría mínima aplicada — `tier-minimo-fallback-chain-resolution` reescrito con la cadena de 2 (`opencode-go/deepseek-v4.1-flash` → `opencode/deepseek-v4.1-flash-free`, `src/core/tier-models.js:52-61`), supersede atómico; ambas claves `tier-minimo-*` afirman ahora lo mismo. Memoria: 346 nodos / 234 activos / 748 refs / 0 sin resolver.
- **#18 / A2c CERRADO** con la evidencia de arriba (la decisión de producto aprobada: el bump de `version` deja de ser material).

**Pendiente nuevo en 0.27.0 (requiere aprobación explícita):**

- **`.ancleto/**` en `sources`/`fileHashes`:** figura en el estado (`memory.db`, `-wal`, `-shm`, `working-context.md`, `machine-env.md`) y muta con cada operación de memoria → cualquier operación deja el seed en `STALE`/`minor`. `.discovery-map.json` (raíz) tiene el mismo churn. Diferido en este change (decisión `seed-freshness-ancleto-area-deferred`), **no implementado**; requiere aprobación explícita por exceder la aprobación de producto acotada. → **RESUELTO en 0.28.0** (`seed-freshness-ephemeral-paths`): un único predicado reader-side excluye `.ancleto/**` y `.discovery-map.json` de la frescura; ver `## Relación con 0.28.0`.
- **Deuda conocida (CERRADA 2026-11-12):** la escritura del estado nuevo en `packDiscovery` no tenía pin offline (la suite no ejercía el pack; depende de Repomix) — `tasks.md` 4.3 quedaba abierto. RESUELTA por el change de conformidad `pin-offline-discovery-state` (archivo: `aspec/changes/archive/2026-11-12-pin-offline-discovery-state/`): `buildDiscoveryState`/`renderDiscoveryState` puros en `src/core/discovery-state.js`, usados por `packDiscovery`, con golden byte-idéntico en `test/cli.test.js`. Sin delta, sin bump. Ver "## Cierre de deuda — pin offline de packDiscovery".

**Diferido sin cambios en 0.27.0 (sigue pendiente, no hecho):**

- **A3/#4, A4/MEM-05, A5/CH-06b, A6, A7, D, #6, CH-00, CH-07, CH-08/MEM-06, CH-09a–g, CH-10:** sin evidencia nueva en esta sesión → siguen diferidos.
- **T27/CH-01 queda FUERA** de esta sesión (memoria reconstruible/versionable): pendiente, sin cambios.

## Relación con 0.28.0

0.28.0 contiene un change archivado. Release minor (runtime + spec + test): las rutas efímeras (`.ancleto/**` y `.discovery-map.json` de la raíz) dejan de contar como cambio de frescura del seed; sin cambio de comandos, flags ni forma del estado persistido.

**Hecho:**

- **`seed-freshness-ephemeral-paths` (funcional, delta MODIFIED en `cli-diagnostics`):** change implementado, testeado y archivado en `aspec/changes/archive/2026-11-11-seed-freshness-ephemeral-paths/`; delta `MODIFIED` mergeado en `aspec/specs/cli-diagnostics/spec.md` (Requirement `Clasificación determinista de frescura del seed en discovery --check`, 17 escenarios reenunciados + 9 nuevos = 26 scenarios).
- **Regla:** `.ancleto` y todo lo que está debajo de `.ancleto/`, más `.discovery-map.json` en la raíz, ya no cuentan como cambio de frescura. Un único predicado anclado (`isEphemeralSource`) se aplica simétricamente a los `sources` persistidos y a los vigentes; el mismatch de hash se excusa como `READY` sólo cuando cambió >=1 path y todos los paths cambiados son efímeros; cero paths cambiados sigue `STALE`; un estado legacy sin `fileHashes` sigue `STALE`/`minor` y nunca `material`.
- **Compatibilidad / rollback:** la forma del estado persistido y `ruleVersion: 2` no cambian → un rollback a 0.27.0 lee el estado igual que antes.
- **Evidencia end-to-end en este repo:** crear `.ancleto/probe-ephemeral.txt`, editar `.discovery-map.json` y correr `memory doctor` → `READY`/`none` en cada caso; crear `src/index.ts` → `STALE`/`material` (`archivo material nuevo: src/index.ts`); revertir → `READY`. La regla distingue el churn efímero del cambio arquitectónico real.
- **Release:** `0.28.0` (minor), tag ANOTADO `v0.28.0` @ merge `f734e83` (merge `--no-ff` de development; incluye `c7a2301`, `242b27d`, `db775ca`, `e521869`), run de publish `43196621815` success; npm `latest` `0.28.0`.
- **Seed regenerado:** `READY`/`none`, `seedMapPresent: true`, 866 fuentes / ~39.190 tokens, `pluginVersion 0.28.0` en 11/11 docs.
- **Memoria:** 350 → 351 nodos (activos 237 → 238), 757 refs, 0 sin resolver; 4 decisiones promovidas (`seed-freshness-ephemeral-paths-reader-side-filter`, `seed-freshness-ephemeral-diff-attribution`, `seed-freshness-no-ruleversion-bump`, `seed-freshness-ancleto-area-deferred` supersede el diferimiento previo).
- **A8 CERRADO:** el churn `.ancleto/**`/`.discovery-map.json` se resuelve con el change `seed-freshness-ephemeral-paths`; la garantía queda en el Requirement canónico `Clasificación determinista de frescura del seed en discovery --check` (`aspec/specs/cli-diagnostics/spec.md`).

**Pendiente nuevo en 0.28.0 (requiere aprobación explícita):**

- **Pin offline de `packDiscovery` (CERRADO 2026-11-12):** resuelto por `pin-offline-discovery-state` (conformidad, sin delta, sin bump). Ver "## Cierre de deuda — pin offline de packDiscovery".
- **Exclusiones adicionales (NO aprobadas):** `docs/**`, `aspec/**`, `documentation/**` y los audit logs fueron propuestos pero NO aprobados; la ignore list de Repomix tampoco se tocó.
- **T27/CH-01 sigue FUERA** de esta sesión (memoria reconstruible/versionable): pendiente, sin cambios.

## Cierre de deuda — pin offline de packDiscovery (2026-11-12, sin release)

- **Change:** `pin-offline-discovery-state`, de conformidad (cita `spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check`), archivado en `aspec/changes/archive/2026-11-12-pin-offline-discovery-state/`. Sin delta y sin bump.
- **Qué se hizo:** el armado y la serialización del estado salieron de `packDiscovery` a `src/core/discovery-state.js` (`buildDiscoveryState` + `renderDiscoveryState`); `packDiscovery` conserva el fs y el orden `writeDiscoveryMap` → estado. El test `pin offline del estado de discovery` fija con un golden literal el orden de claves, `version: 1`, `ruleVersion: 2`, `semantic`, exactamente un `\n` final y ausencia de BOM, sin depender de Repomix.
- **Evidencia:** `discovery --check` post-archive dio `STALE`/`minor` (sin `materialReasons`, `changedAreas` sin `.ancleto`); tras re-correr el pack, `READY`/`none`. Ledger: `node --test test/cli.test.js` y `npm test` passed; lint passed; format `not-configured`; typecheck `n/a`.
- **Residual (no contrato):** el orden `writeDiscoveryMap` → estado no se pinea, y el lector sigue con `ruleVersion === 2` literal; un bump futuro debe actualizar ambos lados.
