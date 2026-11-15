# Proposal: Puerta de criticidad en `memory consolidate --apply` y `memory merge`

## Related Work Item

No aplica: este change no tiene Work Item asociado y no se inventa uno.

## Contexto y problema

`memory consolidate --apply` selecciona todos los nodos `status='active'` sin `ORDER BY`
(`src/core/memory/engine.js:860-862`), los agrupa por `type` + `normalizeContent(content)`
(`engine.js:1277-1293`) y elige el canónico con una cadena total de criterios
(`engine.js:417-427`): más refs declaradas, `created_at` más reciente, scope
`project > feature > task`, `content` más largo, `rule` antes que `decision` y, como desempate
final, `memory_key` lexicográficamente menor. El resto se supersede en una única transacción
(`engine.js:1344-1358`).

`memory.criticalKeys` (`.ancletorc:41-51`) se lee sólo en el renderer del working-context
(`src/core/memory/working-context.js:53-73`) y se pasa como `required` a `buildWorkingContext`
(`working-context.js:82`). Ningún camino de escritura lo consulta: `engine.js`, `curation.js`,
`tools.js`, `mcp-server.js` y `src/cli/index.js` no leen la lista.

**Daño reproducido** (con bases temporales, nunca la DB real): dos nodos activos con el mismo
`type` y `content` normalizado, uno de ellos con `memory_key` declarada crítica. Si el crítico
pierde el desempate —por `created_at` más viejo o por `memory_key` mayor—, `consolidate --apply`
lo supersede. Después:

- el nodo desaparece de `listNodes({ status: 'active' })` (`engine.js:1069-1091`);
- `buildWorkingContext` falla con `required: la memory_key "<k>" no existe como rule activa del
  scope "project"` (`engine.js:878-884`) y el refresh propaga el error
  (`working-context.js:140-145`);
- el CLI sale `1` **después** del commit, con la base ya mutada y sin rollback
  (`src/cli/index.js:3111-3121`), y no reescribe `.ancleto/working-context.md`;
- si el crítico queda canónico, sigue activo y el comando sale `0`.

El canónico es dirigible por `created_at` y por refs; el orden de inserción no influye y el
empate final lo decide `memory_key` ascendente. `memory merge` supersede cada source hacia el
target sin mirar criticidad (`engine.js:1242-1268`, `:1257-1260`), abriendo la misma vía de
pérdida silenciosa.

## Requisito citado

- `spec:memory-ops#Consolidación determinística de nodos duplicados`
  (`aspec/specs/memory-ops/spec.md:1108`).
- `spec:memory-ops#Merge de nodos por supersesión` (`aspec/specs/memory-ops/spec.md:537`).

El delta `## MODIFIED` reescribe ambos cuerpos completos y todos sus escenarios, y agrega la
puerta de criticidad. También reescribe el requirement cuyo título es
``Comando CLI `ancleto memory merge` `` (`aspec/specs/memory-ops/spec.md:610`), que separa la
superficie CLI del engine y hoy no declara `--force-critical` ni el código de salida del rechazo;
sin ese delta el flag quedaría sin contrato observable.

No se modifica `memory-engine`: la garantía post-escritura del conjunto crítico
(`spec:memory-engine#Conjunto crítico estable del working-context`) sigue siendo verdadera bajo
`--force-critical`, porque el flag autoriza la escritura pero no suprime el fallo del refresh.

## Intención

Impedir que `memory consolidate --apply` y `memory merge` supersedan en silencio una regla
declarada crítica, con una puerta determinista y CI-safe: el dry-run reporta
`criticalAffected` sin bloquear; la corrida real con claves críticas afectadas y sin
`--force-critical` aborta con código `2` sin escribir; `--force-critical` es la vía explícita.
El conjunto crítico es el existente en `.ancletorc` → `memory.criticalKeys`; no se agrega
columna, tabla ni clave de configuración nueva.

## Alcance

In scope:

- `src/core/memory/engine.js` — `consolidate` y `merge` reciben el conjunto crítico y un
  indicador de autorización explícita; calculan `criticalAffected`, lo reportan y evalúan la
  puerta dentro de la misma transacción `BEGIN IMMEDIATE` que la escritura.
- `src/cli/index.js` — `memoryConsolidate` y `memoryMerge` resuelven el conjunto con
  `readCriticalMemoryKeys` sobre la raíz derivada de la base, parsean `--force-critical`,
  emiten `criticalAffected` y mapean el rechazo a exit `2` sin refrescar el working-context.
- `test/memory-engine.test.js` y `test/cli.test.js` — cobertura del gate en motor y CLI.
- Delta `memory-ops` con `## MODIFIED` de los tres requirements nombrados.

Out of scope, refutado con evidencia:

- **CH-09e (proyección de `curate` en `exactGroups`).** Diferido: `exactGroups` ya expone `type`
  (`engine.js:1307-1312`), el gate no necesita la proyección de curaduría, `curate` es read-only
  y no hay consumidor real que la pida; agregarla sería especulación y obligaría a revisar el pin
  de forma del reporte de curaduría (`test/curation.test.js:188-196`).
- **`memory curate`, `gc`, `import` y MCP.** `curate` no escribe; `gc` purga historia ya
  superseded; `import` es el restore documentado con semántica LWW; el MCP no expone `merge` ni
  `consolidate` como tools.
- **Confirmación interactiva.** No es determinista ni CI-safe; se prefiere el flag explícito.
- **Omisión selectiva de miembros críticos.** Contradice "superseder a todos los no canónicos" y
  dejaría grupos a medio aplicar.
- **Cambios de schema, PRAGMA o `ruleVersion`.** La puerta no persiste estado nuevo.

## Riesgos con mitigación

- **`--force-critical` sobre una `rule` crítica del scope inyectado.** La escritura se aplica,
  pero el refresh posterior falla porque la clave ya no existe como rule activa: exit `1`, base
  commiteada y bloque derivado desactualizado, igual que la garantía post-escritura vigente.
  Mitigación: documentarlo; el operador quita la clave de `.ancletorc` y regenera con
  `ancleto memory context --out`.
- **Configuración ausente o inválida.** Por la lectura tolerante vigente equivale a lista vacía y
  la puerta nunca bloquea; es compatibilidad deliberada, no un bypass del invariante.
- **Deriva del texto de uso.** `MEMORY_USAGE` está pineado en `test/cli.test.js:9714-9733` y la
  ayuda en `src/cli/index.js:112,114`; se actualizan en el mismo change.
- **Snapshot de configuración durante la corrida.** El conjunto se resuelve una vez por
  invocación; un cambio concurrente de `.ancletorc` no altera esa corrida. Es determinista por
  ejecución y no requiere lock adicional.
- **Downgrade.** Un binario `0.35.0` lee la misma base e ignora `--force-critical`; puede volver a
  superseder una clave crítica. Se documenta en el release; no hay cambio de formato persistido.
- **Transacción y atomicidad.** Si el chequeo quedara fuera de `BEGIN IMMEDIATE`, una source
  podría desactivarse entre el chequeo y el UPDATE. Mitigación: la evaluación y las escrituras
  comparten la transacción única ya existente.

## Plan de validación

Sólo comandos declarados en `PRODUCT.md` → `## Project Commands`:

- `npm run lint` (`eslint src/ test/ scripts/`).
- `npm test` (`node --test "test/*.test.js"`).
- Para el tramo acotado, el runner declarado con rutas explícitas:
  `node --test "test/memory-engine.test.js" "test/cli.test.js"`.
- Format check: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (JavaScript ESM sin `tsconfig.json`).

Prueba funcional del invariante: sobre una base temporal, `consolidate --apply` con una clave
crítica afectada y sin flag devuelve exit `2` y cero filas modificadas; el dry-run reporta
`criticalAffected` y sale `0`; `--force-critical` aplica; `criticalKeys` vacío reproduce el
comportamiento previo. Nunca se usa `.ancleto/memory.db` real.

## Rollback

Al rechazar, la transacción hace rollback y no queda ninguna fila modificada; no hay schema,
PRAGMA ni `ruleVersion` nuevos. Revertir el change es quitar el flag y el chequeo: la base
permanece legible por `0.35.0` y el working-context se regenera con el comando existente. El
único efecto persistente posible es el de una corrida con `--force-critical`, que es una
supersesión normal y reversible por el historial.

## Decisiones

- **memory_key:** memory-criticality-source-of-truth
  **Elección:** la fuente de "regla crítica" es `.ancletorc` → `memory.criticalKeys`, leída con el helper existente `readCriticalMemoryKeys` y usada tal cual; vacío, ausente o inválido equivale a lista vacía.
  **Descartado:** una columna `critical` en `memory_nodes`, una clave de configuración nueva, o que el engine lea `.ancletorc`.
  **Justificación:** ya es la fuente que usa el renderer (`working-context.js:82`); una segunda fuente o una columna duplicaría el invariante y exigiría migración, mientras la lectura tolerante vigente preserva el comportamiento cuando no hay claves.
**Refs:**
- spec:memory-engine#Conjunto crítico estable del working-context
- change:ch-09a-criticality-gate

**Estado:** aprobado

- **memory_key:** memory-criticality-gate-pre-write
  **Elección:** la puerta vive en el engine, recibe el conjunto inyectado por el CLI y evalúa el riesgo dentro de la misma `BEGIN IMMEDIATE` que la escritura; el rechazo aborta la transacción completa con exit `2` sin escribir, y `--force-critical` es la única vía de override; el dry-run reporta y nunca bloquea.
  **Descartado:** omitir selectivamente los nodos críticos y superseder el resto; confirmación interactiva; avisar después de escribir; usar exit `1` para el rechazo.
  **Justificación:** "superseder a todos los no canónicos" se mantiene porque la puerta no omite miembros —o aplica todos los grupos o no aplica ninguno—; el exit `2` ya está reservado para rechazo fail-closed sin escritura (`specs merge`, `src/cli/index.js:3757,3780,3789,3831`) y el `1` queda para error interno; un flag no interactivo es determinista y CI-safe.
**Refs:**
- spec:memory-ops#Consolidación determinística de nodos duplicados
- change:ch-09a-criticality-gate

**Estado:** aprobado

- **memory_key:** memory-criticality-gate-covers-merge
  **Elección:** la misma puerta cubre `memory merge`, con `criticalAffected` igual a la intersección entre el conjunto crítico y las sources que se supersederían; una clave crítica que es target no cuenta como riesgo.
  **Descartado:** limitar la puerta a `consolidate --apply`.
  **Justificación:** `merge` supersede sources por la misma vía (`engine.js:1242-1268`) y dejarla abierta conservaría el daño reproducido; el costo es una intersección y un parámetro más sobre el mismo patrón transaccional.
**Refs:**
- spec:memory-ops#Merge de nodos por supersesión
- change:ch-09a-criticality-gate

**Estado:** aprobado

- **memory_key:** ch-09e-exact-groups-projection-deferred
  **Elección:** se difiere CH-09e y no se agrega a `exactGroups` la proyección que consume `curate`.
  **Descartado:** exponer en `exactGroups` la forma proyectada de curaduría.
  **Justificación:** `exactGroups` ya expone `type` (`engine.js:1307-1312`); el gate no necesita la proyección, `curate` es read-only y no hay consumidor real, así que el campo sería especulativo y obligaría a revisar el pin de forma del reporte de curaduría (`test/curation.test.js:188-196`).
**Refs:**
- change:ch-09a-criticality-gate
- spec:memory-ops#Consolidación determinística de nodos duplicados

**Estado:** aprobado
