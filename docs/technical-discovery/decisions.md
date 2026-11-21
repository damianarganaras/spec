---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-11-21T05:55:56.128Z
pluginVersion: 0.43.1
skillVersion: '2.3'
---

# Decisiones, reglas y riesgos

## Restricciones estructurales

| Regla | Consecuencia | Evidencia |
| --- | --- | --- |
| Cero dependencias de runtime | No agregar paquetes a `dependencies`; el costo de distribución es parte del contrato | `package.json` |
| Node ≥ 24 | El motor de memoria usa `node:sqlite`; no hay fallback a un driver externo | `package.json`, `src/core/memory/database.js` |
| JavaScript ESM | Sin TypeScript ni `tsconfig.json`; la regla de “TypeScript strict” del template es genérica | `package.json`, `PRODUCT.md` |
| Sin red desde `src/` | `fetch`/HTTP no son parte del runtime; los procesos externos son locales y opcionales | `src/core/judge.js`, `scripts/refresh-model-catalog.mjs` |
| CLI local como fuente | Las validaciones usan `node src/cli/index.js`; el binario del PATH puede estar rezagado | `PRODUCT.md` |
| Lint con ESLint | `eslint src/ test/ scripts/`; `eslint.config.js` existe y está vacío (defaults) | `package.json`, `eslint.config.js` |

## Invariantes de arquitectura

- **Dueño único por transformación**: el adaptador de frontmatter (`src/core/adapters/frontmatter.js`)
  es el único punto que transforma frontmatter; ninguna otra rama del CLI lo reimplementa.
- **Dueño único de tiers**: `src/core/tier-models.js` contiene `TIERS`, `TIER_CHAINS` y la
  resolución; el catálogo (`src/core/model-catalog.js`) es dueño del shape del snapshot.
- **Dueño único de declaraciones de modelo**: `src/core/model-declarations.js` lee `agents/*.md`,
  `profiles/*/agents/*.md` y `opencode.json`; el guard de tests y el refresh del catálogo lo
  comparten.
- **Estado de discovery puro**: `src/core/discovery-state.js` arma y serializa sin tocar el
  filesystem ni reordenar; el orden de claves es contrato de bytes persistidos.
- **Topología**: `src/core/discovery.js` es dueño del mapa; el resto consume su resumen.
- **Working-context derivado**: `src/core/memory/working-context.js` es dueño del render, la
  escritura y la **resolución del presupuesto**; el engine no importa ese módulo (evita el ciclo)
  y no lee `.ancletorc`.
- **Raíz del proyecto**: se deriva de `.ancletorc`/ubicación de la DB, **nunca** de
  `process.cwd()` en el camino de escritura de memoria.
- **Procedencia MCP**: `source` se resuelve desde el runtime (`mcp:ancleto-memory`, `cli:import`,
  `runtime`, `agent:<rol>`), nunca desde el input del caller. Solo `runtime` exime de validar refs.
- **Validador de import único**: `src/core/memory/engine.js` → `validateImportEntries` es el único
  dueño del esquema de entrada; `importNodes` y `classifyImport` (dry-run) lo comparten y el CLI
  lo reusa como pre-check antes de abrir la base (`src/cli/index.js`).
- **Oráculo de la matriz de hosts**: `test/host-matrix.test.js` declara su propio mapa `HOSTS`
  (destino de assets y MCP por host) independiente del descriptor de producción
  (`AGENT_TARGETS`/`HOST_MCP_TARGETS`); una deriva del descriptor debe **fallar** la matriz, no
  actualizar la expectativa en silencio.
- **Tier observable en la matriz**: la matriz fija `normal`, no `minimo`. La canónica declara el
  modelo de `minimo`, así que `applyTier` con `minimo` es no-op y una regresión de aplicación de
  tier pasaría inadvertida (`test/host-matrix.test.js`).

## Reglas de negocio y contratos

### Memoria

- `memory_key` es identidad transversal: un nuevo nodo supersede al activo y conserva historial.
- La reescritura idéntica es un **no-op total** (no toca base ni WAL). `createdAt`, `source` y
  `confidence` no son parte de la identidad.
- Import: un archivo inválido aborta el batch completo; un nodo solo superseded no se reactiva;
  un `createdAt` más antiguo o igual es no-op.
- **`scope` string obligatorio en import (0.43.0)**: el validador compartido rechaza `scope` que no
  sea string o cuyo `trim()` sea vacío con `entry[i].scope invalido` (se esperaba un string no
  vacío) y **sin coerción**; `null`/ausente/`""` se reporta como campo obligatorio faltante. No hay
  vocabulario cerrado: cualquier string no vacío (`project`, `feature`, `task`, `global`, …) se
  acepta y persiste tal cual, igual que en `recordNode`. El mensaje formatea el valor crudo de forma
  best-effort (`formatRawValue`) y nunca se convierte en un `TypeError` del formateador. Evidencia:
  `src/core/memory/engine.js` (`validateImportEntries`, `formatRawValue`), `src/cli/index.js`.
- **Paridad dry-run/write (0.43.0)**: `classifyImport` y `importNodes` aplican la misma validación,
  en el mismo orden y con el mismo mensaje, de modo que el dry-run nunca emite clasificación
  parcial de un archivo inválido. El write del CLI pre-valida con `validateImportEntries` y reporta
  `ancleto: import invalido: …` (exit 1) **antes** de crear o abrir la base. Evidencia:
  `src/core/memory/engine.js`, `src/cli/index.js` (`memoryImport`).
- **Recall BM25-first (0.41.0)**: el orden total es `required` → `bm25` ascendente → anclaje
  declarado → `scope` → `memory_key`. El score BM25 de FTS5 (negativo: mejor primero) es el
  criterio primario después de las requeridas; anclaje y scope solo desempatan a igual score.
  El fallback tolerante (OR con prefijos) sigue corriendo **solo** cuando el intento preciso (AND)
  no devuelve nada. Evidencia: `src/core/memory/engine.js` (`compareRecall`).
- **Presupuesto del working-context configurable (0.42.0)**: precedencia
  `ANCLETO_WORKING_CONTEXT_TOKENS` (definida y no vacía) → `memory.maxTokens` de `.ancletorc` →
  default **4000 tokens**. `maxChars = maxTokens × 4` (16.000 por default); la reserva del aviso es
  `min(1500, 15% de maxChars)`, acotada a `maxChars`. Un valor inválido, negativo, no entero, no
  numérico o ausente resuelve al default; la lectura nunca lanza. Un env definido e inválido
  resuelve al default y **no** cae a `.ancletorc`. Evidencia:
  `src/core/memory/working-context.js` (`resolveWorkingContextMaxTokens`),
  `src/core/memory/engine.js` (`buildWorkingContext`).
- **Sin tope explícito**: `0` o `"unlimited"` (en config o entorno) devuelven `Infinity`; el render
  incluye todas las reglas activas del scope, no emite `<ContextOverflowWarning>` ni el aviso por
  consola, y no pasa por el piso estructural. `null`/`undefined` **no** son “sin tope”: resuelven
  al default finito. Evidencia: `src/core/memory/engine.js` (`isUnlimitedWorkingContext`).
- **`required` fail-closed**: las `criticalKeys` del proyecto se resuelven antes del corte y una
  regla requerida que no entra no se omite en silencio: falla con error diagnóstico. El aviso de
  overflow gobierna solo las reglas no requeridas.
- **Sin cambio de schema en 0.42.0/0.43.0/0.43.1**: no se agregan columnas, índices, PRAGMAs
  persistentes ni `ruleVersion`; la configuración y la validación se resuelven al parsear. Un
  binario 0.41.x lee el mismo estado persistido.
- **Puerta de criticidad**: si una operación supersedería una `memory_key` declarada en
  `.ancletorc` → `memory.criticalKeys`, rechaza con exit 2. El engine nunca lee `.ancletorc`; el
  conjunto se inyecta desde el CLI.
- **Refs**: se validan al escribir; `commit:` y `workitem:` no tienen resolvedor local. La
  reparación solo remueve refs verificables con motivo exacto `inexistente` (allowlist).
- **Secretos**: el rechazo en escritura es incondicional y nunca repite el valor detectado.
- **Read-only por defecto** en superficies de inspección: `readonly: true`, `migrate: false`; leer
  no crea la base, no migra y no ejecuta DDL/VACUUM/checkpoint.
- **Dry-run por defecto** en `merge`, `consolidate` y `repair refs`; `--apply` es la única vía de
  escritura. `gc` solo escribe sin `--dry-run`.
- **Concurrencia**: las escrituras usan `BEGIN IMMEDIATE`; la contención se reintenta con
  presupuesto acotado y determinista y se traduce a `MemoryDatabaseBusyError`.
- **Migración aditiva**: `superseded_at` se agrega de forma guardada; una base legacy sigue
  midiendo elegibilidad por `created_at` sin migrar en dry-run.

### Instalación y hosts

- **`.opencode/` es mirror**: se regenera; no se edita a mano. `ancleto upgrade` materializa la
  canónica; `install`/`update` aplican tier.
- **Assets no soportados**: no se escriben y se avisa a stderr; no se bloquea la corrida.
- **MCP no destructivo**: el merge preserva servidores y claves existentes; no pisa un servidor
  homónimo; un JSON inválido se avisa sin sobrescribir.
- **Templates**: solo se mergean bloques `LOCKED`; el contenido local fuera de ellos se preserva.
  Un bloque mal formado no se toca.
- **Migración legacy `openspec/`**: copia no destructiva; `openspec/` se conserva como backup.
- **Matriz de ciclo de vida (0.43.1)**: para los 8 hosts declarados, `init`, `install`, `update`,
  `upgrade` e `import --repair` (sin bundle) deben respetar el destino nativo por asset, la
  cobertura soportada, el destino MCP del host, la idempotencia/no destrucción y la preservación de
  `EXTENSIBLE`. `import --repair` sin bundle no reescribe assets ni templates. Evidencia:
  `test/host-matrix.test.js`, `aspec/specs/agent-install-routing/spec.md`.

### Discovery y tests

- **Un pack**: la generación del seed usa un único pack Repomix comprimido; `--check` no crea
  packs.
- **Impacto**: el estado compara hashes por área; el bump de `version` de `package.json` se
  neutraliza con un centinela para no contar como cambio de contenido. `CHANGELOG.md` sí es un
  área raíz observable: un cambio de release puede producir `STALE/minor` aunque el bump de
  versión se neutralice. `.ancletorc` también aparece como área raíz aunque sea local/gitignored.
- **Rutas efímeras**: `.ancleto/**` y `.discovery-map.json` no participan de la frescura;
  `documentation/` y `audit logs/` están gitignored y se excluyen. El propio `outputDir` del seed
  se omite del walk, de modo que reescribir el seed no genera deriva.
- **Fail-closed en tests**: si el manifiesto `test/affected-tests.json` no cubre el universo o hay
  imports irresolubles, `complete` es `false` y el consumidor corre la suite completa declarada.
- **Grafo conservador**: un argumento no literal en `import()`/`require()` se reporta como
  `unresolved`; no se adivina. Los no relativos cuentan como externos (`externalCount`).
- **Selección de la matriz de hosts**: `test/affected-tests.json` incluye `test/host-matrix.test.js`
  en el coupling de `src/cli/**` y agrega el trigger `commands/**` + `templates/**`, porque la
  matriz lee esos assets como texto sin importarlos. Evidencia: `test/affected-tests.json`.

## Riesgos, deuda y acoplamiento

| Riesgo | Impacto | Mitigación / evidencia |
| --- | --- | --- |
| `src/cli/index.js` es un monolito de ~5.851 líneas | Alto acoplamiento entre instalación, MCP, tiers, discovery y memoria | Dueños por módulo en `src/core/**`; cambios acotados por subcomando |
| Superficie instalable duplicada por host | Un cambio en `agents/`/`commands/`/`skills/` afecta a todos los hosts | Adaptador único + matriz offline de hosts + `check` de frontmatter/huérfanos |
| Migraciones de SQLite | Riesgo de pérdida de datos o bloqueo | Migración aditiva guardada, transacciones y `doctor` |
| Refresco manual del catálogo | IDs declarados pueden faltar en el snapshot | Guard de integridad con quinta fuente (`opencode.json`) |
| Dependencias externas opcionales | Repomix/opencode/jev-spec pueden faltar | Degradación explícita: `skipped`/`unavailable`, error claro |
| Cambio de orden de recall | Alterar relevancia observable de `searchMemory` | Medición con spike y orden total determinista (`compareRecall`) |
| Modo `unlimited` del working-context | Inyecta todo el corpus de reglas en cada sesión; costo recurrente y bloque grande | Es opt-in explícito (`0`/`"unlimited"`), reversible, y no altera el tope del campo destilado de 5 reglas/1.500 bytes |
| Presupuesto mal configurado | Un valor inválido cae al default sin avisar; un valor muy chico omite reglas no requeridas | Resolución tolerante y determinista; `required` falla cerrado; el aviso de overflow nombra las claves omitidas |
| Cambio de configuración del presupuesto | El working-context puede quedar `desactualizado` hasta el próximo refresh | El chequeo de frescura es advisory; no hay invalidación automática |
| Endurecimiento del import (0.43.0) | Archivos con `scope` numérico/objeto/**vacío** que antes importaban (o fallaban al bindear) ahora se rechazan enteros | Cambio de contrato **intencional** declarado en `CHANGELOG.md` y en la spec `memory-ops`; sin schema ni migración; publicado en npm `0.43.0` |
| Release `0.43.1` preparada, sin push | Un consumidor puede asumir que npm ya la expone | `aspec/backlog.md` declara "preparada, sin push"; solo hay tag local `v0.43.1` |
| Matriz de hosts como verificación principal del ruteo | No prueba hosts reales, binarios de host ni red | Es una matriz de contrato de archivos/MCP; límites en `unknowns.md` |
| Secretos en configuración | Fuga en docs o bundles | Nombrar variable/archivo y omitir valor; rechazo en memoria |
| Dependencia de `version` en `package.json` | Un bump no debe invalidar el seed | Centinela byte-preserving en `hashSources`; observado en `src/cli/index.js` |

## Decisiones recientes relevantes (0.40.x–0.43.1)

- **0.43.1 — matriz de hosts offline (CH-10)**: se agrega `test/host-matrix.test.js` con una
  matriz determinista de 8 hosts × `init`/`install`/`update`/`upgrade`/`import --repair` sin
  bundle, sin host real, sin binarios de host y sin red. Verifica destino nativo por asset,
  cobertura soportada, MCP por host, `LOCKED`/`EXTENSIBLE`, idempotencia/no destrucción y deriva de
  manifiesto entre `init`/`upgrade` repetidos. La expectativa (`HOSTS`) es un oráculo independiente
  del descriptor de producción. Change archivado en
  `aspec/changes/archive/2026-11-21-ch-10-host-matrix-hardening/`; requirement `ADDED` promovido a
  `aspec/specs/agent-install-routing/spec.md` (11 scenarios).
- **0.43.1 — PATCH solo test + spec**: la release no cambia runtime, comandos ni flags;
  `package.json` solo cambia de versión. Se publica como PATCH por convención del repo (precedentes
  0.22.2, 0.26.3, 0.26.4). Estado: **preparada, sin push**; tag anotado local `v0.43.1` (objeto
  `fce834b`) → `7758d46`.
- **CH-00 baseline (2026-11-20/21)**: `docs/baseline/CH-00-2026-11-20.md` captura un baseline
  read-only de conformidad y métricas antes de las optimizaciones de hosts; change archivado en
  `aspec/changes/archive/2026-11-20-ch-00-baseline/`. No modifica runtime.
- **CH-07 trigger (2026-11-21)**: se archiva un gate read-only para el A/B de prefijos/caché/modelos
  con criterio `not-supported` antes que extrapolar métricas de host. No implementa el A/B ni toca
  specs canónicas; change archivado en
  `aspec/changes/archive/2026-11-21-ch-07-trigger-workload-metricas-host/`.
- **0.43.0 — `scope` string en el import**: el validador compartido (`importNodes` +
  `classifyImport`) rechaza `scope` no-string o vacío con `entry[i].scope invalido`, elimina la
  coerción de SQLite (afinidad TEXT) y hace coincidir la predicción del dry-run con el efecto real.
  El write del CLI pre-valida antes de abrir la base. Change `memory-import-scope-string` archivado
  en `aspec/changes/archive/2026-11-20-memory-import-scope-string/`; deltas promovidos a
  `aspec/specs/memory-ops/spec.md` y `aspec/specs/memory-engine/spec.md`.
- **0.43.0 sin cambio de schema**: la validación es de entrada, no de persistencia; `memory-engine`
  explicita que endurecer la validación del import **no** es un cambio de la semántica de upsert ni
  del shape persistido.
- **Release 0.43.0 publicada**: `package.json` en `0.43.0` (commit `9ba7975`, `chore(release):
  0.43.0`) y `CHANGELOG.md` con la sección 0.43.0. `aspec/backlog.md` registra el tag anotado
  `v0.43.0` (objeto `e12cffa`) → `9a7220c`, el run `publish.yml` `44827344442` `success` y npm
  `@ancleto/spec@0.43.0` `latest` con gitHead coincidente; coincide con `git rev-list -n1 v0.43.0`.
- **0.42.0 — presupuesto configurable**: el tope del working-context deja de ser fijo. Default
  **4000 tokens** (16.000 chars), resuelto en `src/core/memory/working-context.js` con precedencia
  env → `.ancletorc` → default; `0`/`"unlimited"` desactivan el tope como estado explícito
  (`Infinity`); `required` sigue fail-closed. Change `memory-working-context-budget` archivado en
  `aspec/changes/archive/2026-11-20-memory-working-context-budget/`; publicado en `0.42.0` (tag
  `v0.42.0` → `c6319c8`, run `44808502480`, npm `latest`).
- **0.42.0 sin cambio de schema**: no hay columnas, índices, PRAGMAs persistentes ni `ruleVersion`
  nuevos; la configuración se valida al parsear y nunca impide el render. El tope de 5 reglas y
  1.500 bytes del campo `project memory rules` de `prompt-contracts` es una superficie distinta y
  no se compone con el presupuesto del bloque.
- **0.41.0**: el recall de `searchMemory` pasa a **BM25-first** (`required` → `bm25` → anclaje →
  scope → `memory_key`). Medido con spike sobre 53 rules, 37 queries y 98 pares: nDCG@5 0.656 →
  0.843 y MRR@5 0.633 → 0.923. Change `memory-recall-bm25-first` archivado en
  `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/`; delta promovido a
  `aspec/specs/memory-engine/spec.md`. Release publicada: tag `v0.41.0` sobre `5c171bc`, run
  `44781865327`, `latest` en npm.
- **0.40.1**: el guard de integridad de IDs suma `opencode.json` como quinta fuente declarada y
  comparte el collector `src/core/model-declarations.js` con `refresh-model-catalog --write`.
- **0.40.0**: `ancleto judge` es un adaptador **advisory**, read-only y opt-in a `jev-spec`; no es
  gate de archive ni de conformidad (`src/core/judge.js`).
- **Compatibilidad declarada**: ningún cambio de 0.40.x–0.43.1 toca schema, PRAGMAs persistentes ni
  `ruleVersion`; un binario `0.40.x`/`0.41.x`/`0.42.x` lee el mismo estado persistido.
