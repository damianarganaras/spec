---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-11-20T20:21:53.850Z
pluginVersion: 0.42.0
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

## Reglas de negocio y contratos

### Memoria

- `memory_key` es identidad transversal: un nuevo nodo supersede al activo y conserva historial.
- La reescritura idéntica es un **no-op total** (no toca base ni WAL). `createdAt`, `source` y
  `confidence` no son parte de la identidad.
- Import: un archivo inválido aborta el batch completo; un nodo solo superseded no se reactiva;
  un `createdAt` más antiguo o igual es no-op.
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
- **Sin cambio de schema en 0.42.0**: no se agregan columnas, índices, PRAGMAs persistentes ni
  `ruleVersion`; la configuración se valida al parsear. Un binario 0.41.x lee el mismo estado
  persistido.
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

### Discovery y tests

- **Un pack**: la generación del seed usa un único pack Repomix comprimido; `--check` no crea
  packs.
- **Impacto**: el estado compara hashes por área; el bump de `version` de `package.json` se
  neutraliza con un centinela para no contar como cambio de contenido. `CHANGELOG.md` sí es un
  área raíz observable: un cambio de release puede producir `STALE/minor` aunque el bump de
  versión se neutralice.
- **Rutas efímeras**: `.ancleto/**` y `.discovery-map.json` no participan de la frescura;
  `documentation/` y `audit logs/` están gitignored y se excluyen. El propio `outputDir` del seed
  se omite del walk, de modo que reescribir el seed no genera deriva.
- **Fail-closed en tests**: si el manifiesto `test/affected-tests.json` no cubre el universo o hay
  imports irresolubles, `complete` es `false` y el consumidor corre la suite completa declarada.
- **Grafo conservador**: un argumento no literal en `import()`/`require()` se reporta como
  `unresolved`; no se adivina. Los no relativos cuentan como externos (`externalCount`).

### Instalación y hosts

- **`.opencode/` es mirror**: se regenera; no se edita a mano. `ancleto upgrade` materializa la
  canónica; `install`/`update` aplican tier.
- **Assets no soportados**: no se escriben y se avisa a stderr; no se bloquea la corrida.
- **MCP no destructivo**: el merge preserva servidores y claves existentes; no pisa un servidor
  homónimo; un JSON inválido se avisa sin sobrescribir.
- **Templates**: solo se mergean bloques `LOCKED`; el contenido local fuera de ellos se preserva.
  Un bloque mal formado no se toca.
- **Migración legacy `openspec/`**: copia no destructiva; `openspec/` se conserva como backup.

## Riesgos, deuda y acoplamiento

| Riesgo | Impacto | Mitigación / evidencia |
| --- | --- | --- |
| `src/cli/index.js` es un monolito de ~1.100 líneas | Alto acoplamiento entre instalación, MCP, tiers, discovery y memoria | Dueños por módulo en `src/core/**`; cambios acotados por subcomando |
| Superficie instalable duplicada por host | Un cambio en `agents/`/`commands/`/`skills/` afecta a todos los hosts | Adaptador único + `check` de frontmatter y huérfanos |
| Migraciones de SQLite | Riesgo de pérdida de datos o bloqueo | Migración aditiva guardada, transacciones y `doctor` |
| Refresco manual del catálogo | IDs declarados pueden faltar en el snapshot | Guard de integridad con quinta fuente (`opencode.json`) |
| Dependencias externas opcionales | Repomix/opencode/jev-spec pueden faltar | Degradación explícita: `skipped`/`unavailable`, error claro |
| Cambio de orden de recall | Alterar relevancia observable de `searchMemory` | Medición con spike y orden total determinista (`compareRecall`) |
| Modo `unlimited` del working-context | Inyecta todo el corpus de reglas en cada sesión; costo recurrente y bloque grande | Es opt-in explícito (`0`/`"unlimited"`), reversible, y no altera el tope del campo destilado de 5 reglas/1.500 bytes |
| Presupuesto mal configurado | Un valor inválido cae al default sin avisar; un valor muy chico omite reglas no requeridas | Resolución tolerante y determinista; `required` falla cerrado; el aviso de overflow nombra las claves omitidas |
| Cambio de configuración del presupuesto | El working-context puede quedar `desactualizado` hasta el próximo refresh | El chequeo de frescura es advisory; no hay invalidación automática |
| Secretos en configuración | Fuga en docs o bundles | Nombrar variable/archivo y omitir valor; rechazo en memoria |
| Dependencia de `version` en `package.json` | Un bump no debe invalidar el seed | Centinela byte-preserving en `hashSources`; observado en `src/cli/index.js` |

## Decisiones recientes relevantes (0.40.x–0.42.0)

- **0.42.0 — presupuesto configurable**: el tope del working-context deja de ser fijo. Default
  **4000 tokens** (16.000 chars), resuelto en `src/core/memory/working-context.js` con precedencia
  env → `.ancletorc` → default; `0`/`"unlimited"` desactivan el tope como estado explícito
  (`Infinity`); `required` sigue fail-closed. Change `memory-working-context-budget` archivado en
  `aspec/changes/archive/2026-11-20-memory-working-context-budget/`; deltas promovidos a
  `aspec/specs/memory-engine/spec.md` y `aspec/specs/prompt-contracts/spec.md`.
- **0.42.0 sin cambio de schema**: no hay columnas, índices, PRAGMAs persistentes ni `ruleVersion`
  nuevos; la configuración se valida al parsear y nunca impide el render. El tope de 5 reglas y
  1.500 bytes del campo `project memory rules` de `prompt-contracts` es una superficie distinta y
  no se compone con el presupuesto del bloque.
- **Release 0.42.0 publicada y verificada**: `package.json` en `0.42.0` (commit `c316cf4`); tag
  anotado `v0.42.0` → `c6319c8` (merge de `main`), run `44808502480` de `publish.yml` en `success`
  y npm `@ancleto/spec@0.42.0` como `latest`; el change está implementado y archivado. El registro
  vive en `aspec/backlog.md` (commit `274f890`).
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
- **Compatibilidad declarada**: ningún cambio de 0.40.x–0.42.0 toca schema, PRAGMAs persistentes ni
  `ruleVersion`; un binario `0.40.x`/`0.41.x` lee el mismo estado persistido.
