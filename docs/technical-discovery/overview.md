---
node: overview
kind: overview
read_when: "qué es el proyecto, cómo está armado, componentes y flujos principales"
generatedAt: 2026-11-03T18:16:04Z
pluginVersion: 0.18.9
skillVersion: '2.3'
---

# Overview

## Propósito

`@ancleto/spec` (**Ancleto**, alias de CLI `aspec`) es un orquestador liviano para
desarrollo asistido por IA bajo **Spec-Driven Development (SDD)**. Vive dentro del IDE del
usuario y automatiza cuatro cosas: **especificar** (ciclo de changes), **descubrir** (mapa
topológico + empaquetado de contexto), **recordar** (reglas y decisiones del proyecto entre
sesiones) y **adaptar el entorno** (hechos de la máquina entregados a los agentes). Evidencia:
`README.md`, `package.json`, `src/core/machine-env.js`.

Restricciones de diseño declaradas: **cero dependencias de runtime**, Node ≥ 24 (usa el
módulo nativo `node:sqlite`) y control explícito de costo por **tiers** (`normal`, `minimo`,
`gratis`). El único uso de dependencias externas es de **desarrollo** (ESLint). Evidencia:
`README.md`, `package.json`, `src/core/repomix-tier.js`, `eslint.config.js`.

## Arquitectura (observado)

CLI monolítica en ESM, sin framework externo. Capas:

| Capa | Ruta | Rol |
|---|---|---|
| CLI / orquestación | `src/cli/index.js` | Parsing, `init`/`install`/`update`/`upgrade`, instalación por host, perfiles, export/import, discovery, memoria y sus ops (`snapshot`/`merge`/**`consolidate`**/**`curate`**/**`gc`**), `specs check`, `affected`, projects, `stats` + `stats failures`, doctor, MCP; **aplicación de tier y validación de coherencia de modelos (`applyTier`, `checkAgentsFrontmatter`/`checkTierOrphan`)**; merge de templates y reconciliación legacy; directiva de compresión host-scoped; working-context día-cero; refresh on-write CLI; staleness advisory; **generación de `.ancleto/machine-env.md`**. |
| UI de terminal | `src/cli/ui.js` | Banner ASCII animado y menús TTY (Raw Mode) sin librerías; helpers de color. |
| Adaptación de frontmatter | `src/core/adapters/frontmatter.js` | **Módulo puro, dueño único** de la transformación por host/assetKind (incluye Antigravity y Command Code). |
| Discovery | `src/core/discovery.js` | Mapa topológico `.discovery-map.json`. |
| Affected-set | `src/core/affected-set.js` | Grafo de imports zero-dep; clausura de **dependientes** (determinista) para review y verificación. |
| Empaquetado y tiers | `src/core/repomix-tier.js` | Args de Repomix, ignores por tier, `--compress`, token budget. |
| Selección de modelos | `src/core/tier-models.js` | **Dueño único de `TIERS`**, modelos por tier y resolución de tier gratis (Muse Spark/probe/env). `src/cli/index.js` importa `TIERS`. |
| Entorno de máquina | `src/core/machine-env.js` | **Dueño único** de detectar plataforma/shell/EOL/tooling (disponibilidad = **resoluble e invocable**), renderizar/escribir `.ancleto/machine-env.md` y excluirlo vía `info/exclude`; `checkMachineEnvTracked`. |
| Memoria persistente | `src/core/memory/*.js` | SQLite nativo + FTS5: `database` (incluye migración `superseded_at`), `engine` (refs fail-closed, secretos, `inspectRefs`, `resolveNodeRefs`, recall task-aware, search/record/export/import/gc/merge/**consolidate**, orden de inyección y aviso de overflow), **`curation`** (curaduría read-only que compone resolver + consolidate), `snapshot`, `tools`, `mcp-server`, `doctor` (read-only, cinco checks), `working-context`. |
| Assets instalables | `agents/`, `commands/`, `skills/`, `templates/`, `profiles/` | Markdown que el CLI copia al IDE (10 agents, 16 commands, 21 skills, 2 templates + perfil `test`). |
| Contratos de prompt | `agents/*.md` | Intake de sesión, techo de lecturas, trigger de Recall, validación declarativa, checkpoint de contrato, `## Decisiones`, retiro de `design.md`/`context.md` y promoción al archivar. Los mirrors `.opencode/agents/*.md` se regeneran. |
| Specs del propio repo | `aspec/` | `config.yaml` + 20 specs fuente (incl. `agent-model-tiers`) + **1 change activo** (`ancleto-vscode-extension`) + **43 archivados** (el último, `2026-11-03-align-agent-models-commandcode`). |
| Config del host opencode | `opencode.json` (raíz) | Entradas `agent.model` para los 10 agentes; según `AGENTS.md` sólo surte efecto en el primario. **No** se publica. |
| Lint | `eslint.config.js` | Flat config mínima (4 reglas) sobre `src/` y `test/`. |
| Tests | `test/*.test.js` | Suite `node --test` (17 archivos, incl. `agent-model-coherence`; no re-ejecutada en esta regeneración). |
| Análisis (no runtime) | `optimizacion-de-tokens.md` | Barrido de costo y matriz de decisión de "token-economy". |

Entry point único: `src/cli/index.js` (`bin.ancleto` y `bin.aspec`). No hay servidor ni base
de datos propia más allá de `.ancleto/memory.db`. Evidencia: `package.json`, pack Repomix
(firmas de `src/**`), `.discovery-map.json`.

## Componentes y responsabilidades

- **CLI (`src/cli/index.js`)**: registra el proyecto en `~/.config/ancleto/projects.json`,
  resuelve agente/IDE y tier, materializa assets en el destino nativo (`AGENT_TARGETS`)
  delegando el frontmatter, aplica el overlay `test`, fusiona templates y bloques
  `<!-- LOCKED -->`, configura MCP (propio + caveman; engram opcional) y expone los
  subcomandos. La **directiva de caveman es host-scoped** (`hostSupportsCompression` /
  `hostConfigHasCompression`), nunca en texto compartido. **Escrituras de memoria desde el
  CLI**: `memoryImport` llama a `refreshWorkingContextOnWrite` (compare-based); `memoryMerge` y
  `memoryConsolidate --apply` hacen lo mismo tras escribir, derivando la raíz de
  `resolveMemoryProjectRoot(dbPath)`; si el refresh falla, el cambio ya está commiteado y el
  comando sale ≠ 0 informándolo. **Lecturas de memoria**: `memory curate` abre la base
  exclusivamente read-only y nunca la modifica. Evidencia: `src/cli/index.js`,
  `src/core/memory/working-context.js`, `aspec/specs/memory-ops/spec.md`.
- **Entorno de máquina**: `detectMachineFacts` deriva plataforma, release, arquitectura, shell
  (con `shell_source`), EOL (con `eol_source`) y disponibilidad de `rg`, `node`, `npm`, `git` y
  `python` (sin versiones ni `PATH`). La disponibilidad exige ser **resoluble e invocable**:
  sonda `--version` con 2 s por intento y 10 s acumulados; en `win32` los shims `.cmd`/`.bat`
  se enrutan por `ComSpec` y la guarda `EINVAL` de Node queda **inconclusa**. `writeMachineEnv`
  no reescribe si sólo cambió `generated_at`; `ensureMachineEnvExclusion` agrega el path
  repo-root-relative a `info/exclude` y lo verifica con `check-ignore --no-index`;
  `materializeMachineEnv` es best-effort. Evidencia: `src/core/machine-env.js`,
  `aspec/specs/machine-environment/spec.md`.
- **Adaptador de frontmatter**: `adaptFrontmatter(content, host, assetKind, name)` es puro.
  `opencode` (y skills de cualquier host) es identidad; `claude`, `vscode` y `copilot` dropean
  claves no portables; `antigravity` y `commandcode` transforman; `cursor`/`roo` son
  passthrough con aviso; host desconocido es passthrough con aviso.
- **Discovery**: `--check` reporta estado (`READY`/`STALE`/`PARTIAL`/`MISSING`) con `impact`
  (`none`/`minor`/`material`) y `affectedDocs`; el pack se genera on-demand.
- **Affected-set**: `computeAffectedSet({ rootDir, seeds })` devuelve `{ seeds, affected,
  unresolved, externalCount }`; `affected` es la clausura de dependientes sobre el grafo de
  imports. Read-only vía `ancleto affected`. Detalle: `units/discovery-engine.md`.
- **Memoria**: 3 tools (`searchMemory`, `recordRule`, `recordDecision`) sobre SQLite + FTS5 con
  supersesión atómica por `memory_key` y procedencia `source` runtime-owned. **Camino de
  escritura único `recordNode`**: valida `refs:` fail-closed (exención `source === 'runtime'`) y
  rechaza credenciales sin eco. `importNodes` no pasa por `recordNode` (LWW). Subcomandos:
  `memory export|import|gc|snapshot|merge|consolidate|curate|context|list|doctor`.
  `memory doctor` audita **cinco checks read-only**, incluido `Refs de nodos activos` con
  `inspectRefs`. Detalle: `units/memory-engine.md`.
- **Curaduría read-only (`memory curate`)**: `src/core/memory/curation.js` exporta
  `curateMemory(engine, { projectRoot })`, que **compone** `resolveNodeRefs` y
  `consolidate({ dryRun: true, includeNearDuplicates: false })`; no contiene SQL, parser,
  resolvedor ni normalización propios. Reporta `{ status, brokenRefs, unverifiable,
  exactDuplicates }` en orden total por `memory_key`. El CLI lo expone como
  `memory curate [--json] [--strict]`: advisory (exit 0) salvo `--strict`; `no-db` explícito con
  exit ≠ 0. Evidencia: `src/core/memory/curation.js`, `src/cli/index.js`,
  `aspec/specs/memory-ops/spec.md` (requirement `Curaduría read-only con memory curate`).
- **Recall task-aware (`0.18.6`)**: `searchMemory` ordena de forma total (requerido, ref
  declarada, scope, `bm25`, `memory_key`), devuelve **preview** por defecto (prefijo literal de
  hasta 240 caracteres, `limit` 5, `content_truncated`), expande con `expand: true` o `keys`, y
  acepta `required` como entrada de llamada que falla si excede el límite o el presupuesto.
  `@memory-keeper` usa `query` + `expand: true`. Evidencia: `src/core/memory/engine.js`,
  `agents/memory-keeper.md`, `aspec/specs/memory-engine/spec.md`.
- **Resolver de refs**: `resolveNodeRefs({ content, projectRoot })` es read-only, sin comando ni
  tool MCP; reutiliza el parser y resolvedor del camino de escritura. `change:` devuelve el
  directorio repo-relativo; `spec:` devuelve `spec.md` + heading real; `path:` se normaliza;
  `commit:`/`workitem:` quedan `verifiable: false`. Publicado en `0.18.3` (MEM-04b). Evidencia:
  `src/core/memory/engine.js`, `aspec/changes/archive/2026-11-02-mem-04b-resolver-referencias-navegables/`.
- **Orden de inyección (`0.18.4`)**: `buildWorkingContext` ordena por scope
  (`task` → `feature` → `project`), luego anclaje declarado (`spec:`/`change:`/`path:`),
  `created_at` descendente y `memory_key` ascendente. El anclaje se decide **sólo parseando**
  `refs:`, sin resolver ni tocar el filesystem. Evidencia: `src/core/memory/engine.js`,
  `aspec/specs/memory-engine/spec.md`.
- **Aviso de overflow (`0.18.4`)**: el bloque completo (wrapper + etiqueta + reglas + aviso)
  respeta `maxTokens × CHARS_PER_TOKEN`; antes de cortar reserva `min(1.500, 15 % de maxChars)`.
  El aviso conserva el conteo, lista hasta 40 `memory_key` omitidas en orden de inyección y
  agrega `+N`; delega **un** Recall a `@memory-keeper` y no menciona `searchMemory`.
- **Consolidación (`0.18.5`)**: `engine.consolidate({ dryRun = true, includeNearDuplicates = true })`
  agrupa activos por `type` + `content` normalizado sin `refs:`, elige un canónico determinístico
  y, con `--apply`, supersede los no canónicos en una transacción. Los **near-dups** (Jaccard
  ≥ 0,60, mismo `type` y `scope`) sólo se reportan. El dry-run usa conexión read-only. La opción
  aditiva `includeNearDuplicates: false` omite el escaneo O(n²) sin cambiar el default.
- **GC por supersesión (`MEM-05b`)**: `memory_nodes.superseded_at` es una columna aditiva; las
  cuatro rutas de supersesión (`recordNode`, `importNodes`, `merge`, `consolidate`) escriben el
  instante y `memory gc` mide `COALESCE(superseded_at, created_at)`. Antes del `DELETE` limpia
  `superseded_by` de los elegibles para no violar la FK. Evidencia:
  `src/core/memory/{database,engine}.js`, `aspec/specs/memory-ops/spec.md`.
- **Doctor read-only**: `memoryDoctor` abre con `{ migrate: false, readonly: true }`; reporta
  `Integridad DB`, `Indice FTS5`, `Reglas activas (unicidad)`, `Refs de nodos activos` y
  `Checkpoint WAL`. `--rebuild` es el único camino que escribe. Evidencia:
  `src/core/memory/doctor.js`, `aspec/specs/memory-ops/spec.md`.
- **Snapshot**: `snapshotDatabase` copia con `VACUUM INTO` sobre fuente read-only, verifica
  `quick_check` y reemplaza con backup/restore en Windows; rechaza `target == source` por
  identidad de archivo. Evidencia: `src/core/memory/snapshot.js`.
- **Working-context**: un único render (`renderWorkingContextBlock`) sirve al lifecycle, al
  refresh on-write MCP y CLI; en **día-cero** materializa la topología sin abrir el motor.
  `checkWorkingContextFreshness` compara con normalización acotada; hoy reporta
  `desactualizado`.
- **Promoción al archivar**: el gate vive en `skills/ancleto-archive/SKILL.md`; sólo promueve
  bloques de `proposal ## Decisiones` con `memory_key` propia y `Estado: aprobado`, con
  preflight del lote; sin candidatos no escribe ni delega. Corre **después** del merge de specs
  y nunca en paralelo.
- **Reporte de fallos**: `ancleto stats failures` lee read-only la tabla `part` de opencode,
  clasifica `env`/`check`/`tool`/`unknown`, agrupa por proyecto/herramienta/clase/esqueleto y
  enmascara secretos/rutas. Evidencia: `src/cli/index.js`, `aspec/specs/session-failure-report/spec.md`.
- **Contratos de prompt del orquestador**: intake de sesión, techo de lecturas (3 archivos +
  exenciones), trigger de Recall, checkpoint de contrato y promoción. Evidencia:
  `agents/orchestrator.md`, `aspec/specs/prompt-contracts/spec.md`.
- **Protocolo de memoria canónico**: vive en `AGENTS.md` → `LOCKED: memory-protocol`;
  `PRODUCT.md` sólo apunta a él. Fija el contrato de `searchMemory` (preview/`expand`/`keys`/
  `required`) y el uso del `<ContextOverflowWarning>`. Evidencia: `AGENTS.md`,
  `templates/PRODUCT.md`, `aspec/specs/prompt-contracts/spec.md`.
- **Configuración de modelos**: `AGENTS.md` → `## Cambiar el modelo de los agentes` distingue
  tres superficies (`agents/*.md` canónica, mirror `.opencode/agents/*`, global
  `~/.config/opencode/agents/*`); el **mirror del proyecto gana** sobre la instalación global.
  La canónica fija el default publicado (`commandcode/deepseek/deepseek-v4.1-flash`);
  `opencode.json` sólo alcanza al agente primario. `install`/`update` reescriben `model:` por
  tier **sólo en opencode** (los otros adaptadores lo quitan o emiten `inherit`) y `upgrade` no
  aplica tier: materializa la canónica. `check` es el oráculo de deriva. Verificación con
  `Select-String`.
- **Coherencia de modelos por tier**: `TIERS` tiene **dueño único** en `src/core/tier-models.js`;
  `minimo` mapea los 10 agentes al modelo canónico, así que aplicarlo sobre `agents/*.md` es un
  no-op. `test/agent-model-coherence.test.js` falla si el conjunto o el modelo de `TIERS.minimo`
  difiere de la canónica, si otro archivo `src/**` declara `TIERS` o si el overlay
  `profiles/test/agents/{tester,reviewer}.md` se cuela en el conjunto canónico. Evidencia:
  `src/core/tier-models.js`, `src/cli/index.js`, `test/agent-model-coherence.test.js`,
  `aspec/specs/agent-model-tiers/spec.md`.
- **Ciclo SDD**: comandos `/cleto-*` que consumen `aspec/changes/<name>/` y las skills nativas;
  no requieren binario externo. Incluye `/cleto-review`, `/cleto-security`, `/cleto-update` y
  `/cleto-transplant`.

## Flujos principales

1. **Alta de proyecto** — `ancleto init` (wizard en TTY): escribe `.ancletorc`, scaffold
   `aspec/` (+ `testspec/` con `--profile test`), copia `AGENTS.md`/`PRODUCT.md` preservando lo
   existente, importa `openspec/` si existe, instala assets por host, aplica el tier, configura
   el MCP del host (antes de escribir agents), materializa `.ancleto/working-context.md` y
   `.ancleto/machine-env.md` (con exclusión local). Evidencia: `src/cli/index.js`, `README.md`.
2. **Instalación/actualización** — `ancleto install|update|upgrade`: materializa assets, adapta
   frontmatter, fusiona MCP no destructivo, importa `openspec/`, reconcilia superficies legadas,
   re-aplica bloques `LOCKED` y regenera `working-context.md` + `machine-env.md`.
3. **Descubrimiento** — `ancleto discovery --check` (estado) y `ancleto discovery
   [--compress]` (pack Repomix con ignores del tier); el seed lo redacta
   `ancleto-technical-discovery`.
4. **Memoria entre sesiones** — el orquestador inyecta `<ProjectMemoryRules>` y
   `<ProjectTopology>` desde el día cero; las decisiones se recuperan vía `@memory-keeper`. Si
   el bloque se trunca, el `<ContextOverflowWarning>` —hoy con 20 reglas omitidas— dispara **un
   único Recall** antes de delegar otra etapa. El working-context se regenera en `init`,
   `install --project`, `upgrade`, `memory context --out`, tras escrituras MCP y tras
   `import`/`merge`/`consolidate --apply`.
5. **Escritura de memoria con refs** — `recordRule`/`recordDecision` pasan por `recordNode`; el
   runtime fija `source` y, si no es `runtime`, el contenido debe incluir un bloque `refs:`
   válido y resoluble. Una ref rota, ambigua, un segundo bloque o una credencial rechazan la
   escritura **antes** de la transacción.
6. **Recall task-aware** — `searchMemory` devuelve preview o payload completo según `expand`,
   permite `keys` y `required`; `resolveNodeRefs` da la ubicación concreta de cada ref. El
   consumo canónico del protocolo está en `AGENTS.md`.
7. **Mantenimiento de memoria** — `memory doctor` audita sin mutar; **`memory curate`** reporta
   refs rotas, no verificables y duplicados exactos sin escribir; `memory snapshot` produce una
   copia restaurable con historial; `memory merge` consolida por claves nombradas;
   `memory consolidate` agrupa duplicados exactos y supersede con `--apply` (dry-run por
   defecto); `export|import|gc` mueven y purgan nodos; `gc` mide la edad de **supersesión**.
8. **Entorno de máquina** — cada lifecycle detecta hechos locales y escribe
   `.ancleto/machine-env.md`; si no cambió, no reescribe. La exclusión va a `info/exclude`, nunca
   a `.gitignore`. Los agentes leen el archivo antes de ejecutar comandos.
9. **Ciclo de change** — `/cleto-new` → `/cleto-propose` → **checkpoint de contrato** →
   `/cleto-apply` → `/cleto-verify` → `/cleto-archive`, con `/cleto-review`/`/cleto-security`,
   `/cleto-update` y `/cleto-transplant`. El proposal registra decisiones en `## Decisiones`.
10. **Cierre del change** — el tester computa el `affected-set`; el orquestador delega el review
    con ese scope. Tras aprobar archive, `@documenter` mergea specs y **después** el gate
    promueve decisiones aprobadas con una pasada de `@memory-keeper`.
11. **Arranque de sesión del orquestador** — intake read-only (changes activos; `git status
    --short` delegado cuando el pedido toca el estado del repo; silencio si no hay nada que
    reportar) → Active Change Check → triage → ejecución delegada.
12. **Validación local** — contrato declarativo: sólo `PRODUCT.md` → `## Project Commands`
    (aquí `npm run lint` y `npm test`).

## Estado del repositorio

Versión `0.18.9` en `package.json` y tope de `CHANGELOG.md` (fechado 2026-11-03). HEAD
`aa7943f` (`chore(release): 0.18.9`) en `development`; `git describe --tags` =
`v0.18.8-4-gaa7943f`. El tag `v0.18.9` **no existe todavía**; `v0.18.8` sí existe y es ancestro de
`development`. `0.18.9` alineó los modelos canónicos de `agents/*.md` a
`commandcode/deepseek/deepseek-v4.1-flash`, mudó `TIERS` a `src/core/tier-models.js` y agregó el
guard de coherencia y el contraste de mirrors en `check`. `0.18.8` publicó **`memory curate`** y
`includeNearDuplicates`; `0.18.7` el **protocolo canónico de memoria**, la reconciliación gateada
de texto plano legado y `memory gc` por `superseded_at`; `0.18.6` el **recall task-aware**;
`0.18.5` `memory consolidate`; `0.18.4` el ranking por anclaje y las omisiones visibles; `0.18.3`
`resolveNodeRefs`.

El único change activo es **`ancleto-vscode-extension`**. Hay **43 archivados**; el más reciente,
`2026-11-03-align-agent-models-commandcode`. `memory curate` figura en el CHANGELOG de `0.18.8`.
El corpus de memoria —observado en la generación anterior y **no re-verificado en esta corrida**—
tiene **129 nodos activos** (34 rules `project`, 82 decisions `project`, 13 decisions `feature`),
**232 filas totales**, **360 refs verificadas** y **0 refs rotas**. `memory consolidate` reportó
**0 grupos exactos** y **0 near-dups**; `memory curate --json` devolvió `status: ok` con `0` refs
rotas, `0` no verificables y `0` duplicados exactos. Quedan abiertos: el **overflow** del bloque
proactivo (**20 reglas omitidas**) y la **discrepancia de raíz de DB** entre `cwd` y el
`projectRoot` del MCP (no reproducida).

El `ancleto` global del `PATH` está desactualizado respecto del checkout (**0.17.1**): no
reconoce `memory consolidate` ni `memory curate` ni el contrato nuevo de `searchMemory`; la
versión local se invoca con `node src/cli/index.js`. El tier resuelto es **`minimo`**
(`.opencode/.ancleto-tier`). `.ancleto/machine-env.md` existe (generado el 2026-11-03T14:46:10Z,
declara `ancleto: 0.18.8`, es decir generado por el CLI anterior); `.ancleto/working-context.md`
está `desactualizado`. El árbol de trabajo está limpio salvo los artefactos derivados del
discovery. Evidencia: `git log`, `git tag`, `ancleto discovery --check`,
`node src/cli/index.js memory {doctor,list,consolidate,curate}` (generación anterior), `.gitignore`,
`.discovery-map.json`.
