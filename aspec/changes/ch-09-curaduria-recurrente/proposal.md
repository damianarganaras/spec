# Proposal: CH-09 — Curaduría recurrente read-only de refs y duplicados

## Intención

Dar al proyecto un reporte de curaduría **read-only** que reúna, en una sola corrida
determinística y sin escribir, las refs rotas, las refs no verificables y los duplicados exactos
de la memoria, con un código de salida advisory y un modo `--strict` opt-in. No agrega cron,
servicio, reparación ni promoción automática.

## Problema

La capacidad de curaduría existe hoy repartida y parcial:

- `memory doctor` ya tiene **cinco** checks en orden fijo (`src/core/memory/doctor.js:31-38`) y su
  check `Refs de nodos activos` (`doctor.js:118-140`) reporta refs `spec:`/`change:`/`path:` no
  resueltas con `memory_key` y ref textual, pero **sólo como texto humano**: no hay salida por
  nodo legible por máquina (`src/cli/index.js:2407-2417`).
- Los duplicados exactos sólo se alcanzan como efecto lateral de `memory consolidate`
  (`src/core/memory/engine.js:1188-1273`); no existe un reporte de curaduría que los exponga sin
  la semántica de escritura de `--apply`.
- `listActiveForConsolidate` no tiene `ORDER BY` (`engine.js:752-754`), así que el orden de filas
  no está garantizado y cualquier reporte nuevo debe ordenar explícitamente.
- `doctor` sale con código `0` cuando la base no existe (`cli/index.js:2409-2411`), de modo que
  hoy "no hay base" y "no hay hallazgos" son indistinguibles por exit code.

CH-09 pide exactamente lo que falta: detección determinística de refs rotas y duplicados exactos,
reportes read-only, cero autopromoción de regla crítica sin aprobación, sin cron ni servicio.

## Cambio propuesto

1. **Módulo puro nuevo** `src/core/memory/curation.js`. Sólo **compone** primitivas existentes:
   `resolveNodeRefs` (`engine.js:535-565`) para clasificar cada ref de cada nodo —es la primitiva que
   expone `kind` y `reason` por ref— y `consolidate({ dryRun: true, includeNearDuplicates: false })`
   (`engine.js:1188-1273`) para duplicados exactos. `inspectRefs` es un agregado de nivel doctor que
   no expone `reason` por ref y NO es la primitiva que compone este módulo.
   NO SHALL contener SQL propio, parser de refs propio, resolvedor de refs propio
   ni una segunda normalización de duplicados, cualquiera sea la primitiva que componga: una segunda
   copia es justamente la duplicación que CH-09 existe para prevenir.
2. **Subcomando nuevo** `ancleto memory curate [--json] [--strict]`, cableado en
   `src/cli/index.js` como wrapper fino sobre el módulo.
3. **No es un sexto check de `doctor`**: eso rompería el orden fijo de cinco checks
   (`doctor.js:31-38`).
4. **No se cablea al flujo de archive**: CH-09 dice "sin cron ni servicio automático"; cablearlo
   agregaría una superficie automática y una ventana de refs.
5. **Gate de criticalidad en `consolidate --apply`: fuera de alcance.** Cambiaría un camino de
   escritura existente y exige definir "regla crítica" y una aprobación humana. Queda registrado
   en backlog.
6. **Apertura read-only exclusiva** (`readonly: true`, `migrate: false`). Sin `--rebuild`, sin
   `VACUUM`/`VACUUM INTO`, sin snapshot, sin DDL, sin `PRAGMA` mutante, sin
   `INSERT/UPDATE/DELETE`, sin escribir `superseded_by`/`superseded_at`, sin
   `recordRule`/`recordDecision`, sin promoción.

El reporte contiene: refs rotas (por nodo: `memory_key`, `kind`, `ref` con el texto declarado
—sólo separadores normalizados a `/` y sin sufijo `:line`, sin colapsar `.`/`..` ni resolver—,
`reason`), refs `unverifiable` (`commit:`/`workitem:`) y grupos de duplicados exactos
(`canonical` + `superseded`). El
orden es total y determinístico: `memory_key` ascendente y, a igual clave, orden de
aparición en `content`; paths en forma POSIX y sin sufijo `:line`; sin timestamps ni campos
volátiles; nunca `localeCompare`, nunca orden de `readdir`, nunca orden de `rowid`.

## Alcance

**In scope**

- `src/core/memory/curation.js` (nuevo): composición de primitivas, forma del reporte y orden
  total.
- `src/core/memory/engine.js`: una única opción aditiva `includeNearDuplicates` en `consolidate`
  (default `true`) que omite el loop O(n²) de near-duplicates cuando el llamador descarta esa
  sección; el engine read-only la reenvía. Sin otro cambio de comportamiento (ver enmienda
  2026-11-03).
- `src/cli/index.js`: subcomando `curate` con `--json` y `--strict`, apertura read-only, códigos
  de salida y `no-db` explícito, sólo el cableado.
- `test/curation.test.js` (nuevo): contrato del módulo y del subcomando.
- `test/memory-engine.test.js`: cubre que el default de `consolidate` conserva la salida actual y
  que `includeNearDuplicates: false` omite la sección de near-duplicates.
- `README.md`: una línea en el bloque de comandos `memory` (alrededor de la línea 403).
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`: filas nuevas para los diferidos.
- `aspec/changes/ch-09-curaduria-recurrente/**`.

La reescritura del requirement `memory snapshot` (sección `MODIFIED` del delta) corrige una
enumeración pre-existente y ya obsoleta de la familia `memory`: agrega `merge`, `consolidate` y el
nuevo `curate`. No implica ningún cambio de comportamiento del snapshot.

**Out of scope / no-goals**

- Un sexto check de `memory doctor`; el orden y los nombres de los cinco checks no cambian.
- Cablear la curaduría al archive, a `memory context` o a cualquier refresco derivado.
- Gate de criticalidad (aprobación humana) sobre `consolidate --apply`.
- Cron, job periódico, servicio, hook o cualquier ejecución automática.
- Auto-reparación de refs (reescribir `content`, redirigir refs, reactivar nodos).
- Detección de near-duplicates: ya la reporta `memory consolidate` (`engine.js:1226-1248`) y no se
  reimplementa en la curaduría (duplicaría el loop de Jaccard y su costo O(n²),
  `engine.js:1228-1252`).
- Tope de escala sobre el escaneo: el costo es lineal en nodos + refs y no requiere un límite
  declarado; se registra en backlog con su disparador, no como código.
- Cambios en `doctor.js`, `database.js`, schema, migraciones o tools MCP.
- Cualquier cambio en `src/core/memory/engine.js` más allá de la opción aditiva
  `includeNearDuplicates` de `consolidate` (ver enmienda 2026-11-03).
- `--rebuild`, `VACUUM`, snapshot o cualquier variante de escritura o reparación.

## Enmienda 2026-11-03 — `engine.js` entra en alcance

La primera versión de este proposal declaraba `src/core/memory/engine.js` fuera de alcance y
afirmaba que el costo del reporte era lineal en nodos + refs. La revisión mostró que esa afirmación
era falsa: `consolidate({ dryRun: true })` ejecutaba el doble loop de near-duplicates de forma
incondicional (`engine.js:1228-1252`), O(n²) sobre los nodos activos, aunque la curaduría descarte
esa sección. Para que la invariante declarada fuera cierta sin reimplementar el loop en la
curaduría, se agregó a `consolidate` una única opción aditiva `includeNearDuplicates` (default
`true`): con `false` omite ese escaneo y deja intacto el comportamiento por defecto. El cambio vive
en `engine.js:685-688` (forwarding del engine read-only), `engine.js:1190` (firma) y
`engine.js:1229` (guarda del loop), con su prueba en `test/memory-engine.test.js`. No hay otro
cambio de comportamiento.

## Paths autorizados del change

- `src/core/memory/curation.js` (nuevo)
- `src/core/memory/engine.js` (sólo la opción aditiva `includeNearDuplicates` de `consolidate` y su
  forwarding en el engine read-only)
- `src/cli/index.js` (sólo el cableado del subcomando `curate`)
- `test/curation.test.js` (nuevo)
- `test/memory-engine.test.js` (cobertura del default y del opt-out)
- `README.md` (una línea del bloque `memory`, alrededor de la línea 403)
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` (filas nuevas para los diferidos)
- `aspec/changes/ch-09-curaduria-recurrente/**`

## Riesgos

- **(i) Deriva de escritura en el camino de reporte.** Abrir la base con los defaults fija WAL y
  corre migraciones (`src/core/memory/database.js:42-53,74-78`), así que un "reporte" podría
  mutar el esquema. Mitigación: el comando SHALL abrir sólo con el engine read-only y un test SHALL
  comparar el `.db` byte a byte antes y después (los sidecars `-shm` o un `-wal` de 0 bytes que
  materialice la apertura read-only se excluyen del assert, no son escritura de datos).
- **(ii) Costo de escala del escaneo.** El escaneo de refs es O(nodos + refs) y es el mismo que
  `memory doctor` ya ejecuta en cada corrida sobre esta base (125 nodos activos / 344 refs,
  `doctor.js:118-140`); la agrupación de duplicados exactos es O(n). El loop O(n²) de
  near-duplicates queda fuera de la corrida porque la curaduría no usa esa sección (ver enmienda
  2026-11-03). No se introduce tope: un límite sobre un valor fijo que nunca se dispara sería código
  muerto con una rama de test inalcanzable. Diferido a backlog: si una corrida real de
  `memory curate` supera X nodos o Y ms, se abre una fila con el umbral medido.
- **(iii) Tormenta de I/O por ref** (`engine.js:407,453,495`). Mitigación: memoizar por `content`
  de nodo dentro de la corrida (los duplicados exactos comparten `content` y no se re-resuelven);
  no se introduce un resolvedor propio.
- **(iv) CI que falla el build en silencio.** Mitigación: advisory por defecto (exit `0` aun con
  hallazgos) y `--strict` opt-in para el gate.
- **(v) Segundo parser o normalizador.** Mitigación: prohibido por el contrato del módulo; el test
  SHALL contrastar el reporte contra `consolidate`/`resolveNodeRefs` sobre la misma fixture.
- **(vi) Orden de filas no garantizado** (`engine.js:752-754`). Mitigación: el módulo ordena
  explícitamente antes de emitir; el reporte no depende del orden de la consulta ni del `rowid`.
- **(vii) El opt-out no debe alterar el comportamiento por defecto de `memory consolidate`.**
  Mitigación: `includeNearDuplicates` SHALL tener default `true`, el engine read-only SHALL
  reenviarlo, y `test/memory-engine.test.js` SHALL cubrir que la salida por defecto no cambia.

## Supuestos

- `consolidate({ dryRun: true })` es invocable sobre el engine read-only y no escribe, según su
  contrato vigente.
- `resolveNodeRefs` es pura y read-only; su I/O se limita a lecturas de filesystem.
- La raíz del proyecto se deriva de la base (`resolveMemoryProjectRoot(dbPath)`), no de
  `process.cwd()`.
- `commit:` y `workitem:` siguen siendo no verificables en este corte: se reportan aparte y nunca
  como rotas.

## Decisiones

- **memory_key:** `curation-subcomando-readonly-composicion`
  **Elección:** un subcomando separado `memory curate` sobre un módulo puro que compone
  `resolveNodeRefs` para la clasificación de refs y `consolidate({ dryRun: true,
  includeNearDuplicates: false })` para duplicados exactos, con apertura read-only.
  **Descartado:** un sexto check de `memory doctor`; cablear la curaduría al flujo de archive; un
  cron o servicio automático.
  **Justificación:** `doctor` tiene cinco checks en un orden fijo que su contrato promete
  (`doctor.js:31-38`); un sexto rompe ese contrato y mezcla salud con curaduría. El archive agrega
  una superficie automática y una ventana de refs que CH-09 excluye explícitamente. Componer las
  primitivas evita el segundo parser o normalizador que la curaduría debe prevenir.
  **Refs:** `change:ch-09-curaduria-recurrente`; `path:src/core/memory/doctor.js`;
  `path:src/core/memory/engine.js`; `path:src/cli/index.js`;
  `spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos`;
  `spec:memory-ops#Consolidación determinística de nodos duplicados`
  **Estado:** aprobado

- **memory_key:** `curation-advisory-exit-strict`
  **Elección:** exit `0` por defecto aun con hallazgos; `--strict` lo vuelve no-cero; base ausente
  reportada como `no-db` con código distinto de `0`.
  **Descartado:** exit no-cero por defecto; presentar la base ausente como reporte limpio con exit
  `0`, que es el patrón actual de `doctor` (`cli/index.js:2409-2411`).
  **Justificación:** un reporte recurrente que falla el build por defecto se termina desactivando;
  `--strict` da la señal opt-in. Una base ausente no es "sin hallazgos": presentarla limpia oculta
  que no se auditó nada.
  **Refs:** `change:ch-09-curaduria-recurrente`; `path:src/cli/index.js`;
  `spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos`
  **Estado:** aprobado

- **memory_key:** `curation-sin-escritura-ni-gate`
  **Elección:** la curaduría no escribe de ninguna forma y el gate de criticalidad sobre
  `consolidate --apply` queda fuera de este change, registrado en backlog.
  **Descartado:** agregar el gate de criticalidad en el camino de escritura de `consolidate`
  dentro de este change.
  **Justificación:** el gate cambia un camino de escritura existente y requiere definir "regla
  crítica" y un flujo de aprobación humana; CH-09 pide reportes read-only y cero autopromoción, no
  un nuevo escritor. Se registra como deuda explícita en el backlog.
  **Refs:** `change:ch-09-curaduria-recurrente`; `path:src/core/memory/engine.js`;
  `path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`;
  `spec:memory-ops#Consolidación determinística de nodos duplicados`
  **Estado:** aprobado

- **memory_key:** `curation-enumeracion-familia-corregida`
  **Elección:** la reescritura del requirement `memory snapshot` restata la familia `memory` con
  `merge`, `consolidate` y el nuevo `curate` incluidos.
  **Descartado:** copiar la enumeración vigente de `aspec/specs/memory-ops/spec.md:289-290`, que ya
  omitía `merge` y `consolidate` antes de este change.
  **Justificación:** escribir una enumeración que se sabe falsa es peor que corregirla; el delta no
  cambia el comportamiento del snapshot, sólo la lista de comandos hermanos.
  **Refs:** `change:ch-09-curaduria-recurrente`;
  `path:aspec/specs/memory-ops/spec.md`;
  `spec:memory-ops#Comando CLI ancleto memory snapshot`
  **Estado:** aprobado
