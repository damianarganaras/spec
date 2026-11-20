---
node: decisions
kind: decisions
read_when: "reglas, contratos, riesgos, deuda y acoplamiento que condicionan cambios"
generatedAt: 2026-11-20T17:05:16.811Z
pluginVersion: 0.41.0
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
- **Working-context derivado**: `src/core/memory/working-context.js` es dueño del render y la
  escritura; el engine no importa ese módulo para evitar el ciclo.
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
- **Sin cambio de contrato en 0.41.0**: no cambian el schema persistido, ni `buildWorkingContext`,
  ni el presupuesto de tokens del working-context, ni `ruleVersion`; un binario 0.40.x lee el
  mismo estado persistido. Evidencia: `CHANGELOG.md`, `aspec/backlog.md`.
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
  neutraliza con un centinela para no contar como cambio de contenido.
- **Rutas efímeras**: `.ancleto/**` y `.discovery-map.json` no participan de la frescura;
  `documentation/` y `audit logs/` están gitignored y se excluyen.
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
| Seed sobredimensionado en corridas previas | Costo de lectura alto | Esta regeneración mantiene documentos densos y breves |
| Secretos en configuración | Fuga en docs o bundles | Nombrar variable/archivo y omitir valor; rechazo en memoria |

## Decisiones recientes relevantes (0.40.x–0.41.0)

- **0.41.0**: el recall de `searchMemory` pasa a **BM25-first** (`required` → `bm25` → anclaje →
  scope → `memory_key`). Medido con spike sobre 53 rules, 37 queries y 98 pares: nDCG@5 0.656 →
  0.843 y MRR@5 0.633 → 0.923. Change `memory-recall-bm25-first` archivado en
  `aspec/changes/archive/2026-11-20-memory-recall-bm25-first/` (incluye `spike/memspike` y
  `spike/memspike2`); el delta `memory-engine` quedó promovido a
  `aspec/specs/memory-engine/spec.md`.
- **0.41.0 sin cambio de contrato**: `buildWorkingContext` conserva orden y presupuesto
  (`maxChars` 8000, `reserve` 1200, efectivo 6800); el spike `memspike2` verificó la réplica y la
  llamada real con el mismo orden (11 nodos incluidos, 7/7 críticas). El fallback OR-prefijo no
  cambió de alcance.
- **Release 0.41.0 preparada, sin publicar**: bump en `package.json`/`package-lock.json` y
  `CHANGELOG.md` (commit `6669b35`); tag, run de publish y npm pendientes (`aspec/backlog.md`).
- **0.40.1**: el guard de integridad de IDs suma `opencode.json` como quinta fuente declarada y
  comparte el collector `src/core/model-declarations.js` con `refresh-model-catalog --write`
  (`CHANGELOG.md`). Change `model-catalog-guard-opencode-json` archivado en
  `aspec/changes/archive/2026-11-19-model-catalog-guard-opencode-json/`.
- **0.40.0**: `ancleto judge` es un adaptador **advisory**, read-only y opt-in a `jev-spec`; no es
  gate de archive ni de conformidad (`src/core/judge.js`, `CHANGELOG.md`).
- **Release 0.40.1 verificada**: tag anotado `v0.40.1` (`e6072b2`), run de `publish.yml` exitoso y
  `@ancleto/spec@0.40.1` como `latest` en npm con `gitHead` coincidente (`aspec/backlog.md`).
- **Compatibilidad declarada**: ningún cambio de 0.40.x–0.41.0 toca schema, PRAGMAs persistentes ni
  `ruleVersion`; un binario `0.39.1` lee el mismo estado persistido (`CHANGELOG.md`).
