# Tasks: MEM-04 — doctor reporta refs no resueltas (primer corte, diagnóstico)

> Validaciones declaradas: `npm run lint` (`eslint src/ test/`) y `npm test`
> (`node --test "test/*.test.js"`), con rutas explícitas para corridas acotadas
> (`PRODUCT.md` → `## Project Commands`).
> Format: `not-configured`. Typecheck: no aplica (JavaScript ESM sin `tsconfig.json`).
> Alcance: diagnóstico. No se resuelven refs, no se reescriben nodos y no se escribe en
> `.ancleto/memory.db`. No se generan `design.md` ni `context.md`.

## Fase 0 — Baseline

- [x] 0.1 Registrar el baseline con los comandos declarados: `npm test` y `npm run lint`.
      Si el baseline no está verde, registrar el rojo preexistente y no atribuirlo a este change.

## Fase 1 — Tests primero (rojo)

> Responsabilidad: `@tester`. Los tests se escriben antes de tocar `src/`.

- [x] 1.1 (T09) Fixture temporal con un único
      `aspec/changes/archive/YYYY-MM-DD-<slug>` y un nodo activo con `change:<slug>`: el check
      reporta `ok: true` y `0 no resuelven`.
- [x] 1.2 (T09) Fixture con dos archives que matchean el mismo slug:
      el check reporta `ok: false`, `healthy: false`, la `memory_key`, la ref textual y
      `ambiguo (2 coincidencias)`; no elige ninguna y `doctor` no aborta.
- [x] 1.3 (T29) Fixture con dos `### Requirement:` que canonicalizan al mismo heading y un nodo
      activo con `spec:<capability>#<heading>`: el check reporta `ok: false` con la `memory_key`,
      la ref y `ambiguo (2 coincidencias)`, sin elegir.
- [x] 1.4 Cubrir los motivos `inexistente` para `spec:` sin `spec.md` o heading sin coincidencia,
      `change:` sin change activo ni archive coincidente, y `path:` inexistente.
- [x] 1.5 Cubrir los motivos `inválido` para `path:` absoluto, `path:` con `../`, línea que no
      matchea la gramática y nodo con más de un bloque `refs:`.
- [x] 1.6 Cubrir la frontera: nodos activos con solo `commit:` y `workitem:` no aparecen como
      rotas; si existen, se cuentan aparte como no verificables.
- [x] 1.7 Cubrir `change:<YYYY-MM-DD-slug>` como no resuelta (`inexistente`), mientras que
      `change:<slug>` resuelve contra el archive.
- [x] 1.8 Cubrir DB vacía con esquema inicializado y 0 nodos: `ok: true`, `detail` con
      `0 refs verificadas`, sin `skipped`, `healthy: true`.
- [x] 1.9 Cubrir nodos activos sin bloque `refs:`: `ok: true` con el conteo de nodos revisados y
      `0 no resuelven`.
- [x] 1.10 Cubrir raíz de proyecto no resoluble con refs presentes: `ok: true`, `skipped: true`,
      `healthy` sin cambios; con 0 refs el check no requiere la raíz y no se omite.
- [x] 1.11 Cubrir el path temprano de esquema no inicializado: los cinco checks aparecen con
      `ok: false` y el check de refs con `no verificable: esquema no inicializado`.
- [x] 1.12 No-mutación por bytes: `doctor` sobre una fixture con refs rotas deja `.db` y `-wal`
      byte a byte idénticos e idempotentes en una segunda corrida. Aplicar la regla ya fijada:
      en `journal_mode=DELETE` el assert fuerte es ausencia de `-wal`/`-shm`; en WAL se toleran
      sidecars vacíos y se asertan inmutabilidad de `.db`/`-wal` e idempotencia.
- [x] 1.13 Actualizar los asertos existentes que fijan cuatro checks
      (`test/memory-engine.test.js`: `checks.length === 4`) al nuevo total, sin relajar los
      asertos de forma, índices de FTS/unicidad ni contenido. El aserto que espera solo
      `Checkpoint WAL` como omitido sigue vigente en fixtures sin refs: con 0 refs el check no
      requiere raíz y no se omite.
- [x] 1.14 Verificar el rojo real de 1.1 a 1.13 con
      `node --test test/memory-fixtures.test.js test/memory-engine.test.js test/cli.test.js test/mcp.test.js`
      y registrar la causa de cada fallo.

## Fase 2 — Resolvedor compartido en el engine

> Responsabilidad: `@coder`. No cambia el comportamiento de escritura ni
> `aspec/specs/memory-engine/spec.md`.

- [x] 2.1 Extender `src/core/memory/engine.js` con una función que evalúe refs y devuelva un
      resultado estructurado por ref: ok, inexistente, ambiguo (con cantidad de coincidencias) o
      inválido (con causa). Reutilizar `parseRefsBlock` y los `resolve*` existentes.
- [x] 2.2 Exponer una función read-only que reciba los nodos activos (`memory_key`, `content`) y
      la raíz del proyecto, y devuelva las refs no resueltas y los conteos; no abre conexiones ni
      escribe.
- [x] 2.3 Mantener `validateRefsForWrite` lanzando `Error` con los mismos mensajes y la misma
      semántica fail-closed; el resultado estructurado es un segundo consumidor de la misma
      resolución, no un segundo resolvedor.
- [x] 2.4 Excluir `commit:` y `workitem:` de la evaluación de rotas y devolver su conteo aparte.
- [x] 2.5 Confirmar que no se agrega tabla, columna ni migración, y que el camino de escritura
      sigue sin revalidar nodos existentes.
- [x] 2.6 Correr `node --test test/memory-engine.test.js` y registrar que no hay regresión en la
      validación de escritura.

## Fase 3 — Quinto check en `memory doctor`

> Responsabilidad: `@coder`. Sin checkpoint, DDL, indexación ni pragma mutante.

- [x] 3.1 Agregar el check `Refs de nodos activos` al reporte, entre `Reglas activas (unicidad)`
      y `Checkpoint WAL`, con la forma `{ name, ok, detail }`.
- [x] 3.2 Implementar el `detail` sin rotas (`N refs verificadas en M nodos activos;
      0 no resuelven`) y con rotas (`K refs no resuelven: "<memory_key>" -> <ref textual>
      (<motivo>); ...`), incluyendo el conteo de `commit:`/`workitem:` no verificables solo si
      existen.
- [x] 3.3 Resolver la raíz con `resolveProjectRoot(null, dbPath)`; omitir el check
      (`ok: true, skipped: true`) **sólo** si hay refs a verificar, no hay defecto detectable sin
      raíz y la raíz no se puede derivar, sin bajar `healthy` ni el exit code; con un bloque
      malformado se reporta `ok: false` aun sin raíz.
- [x] 3.4 Agregar el check al path temprano de esquema no inicializado como `ok: false` con
      `no verificable: esquema no inicializado`.
- [x] 3.5 Verificar que el check solo lee `aspec/specs/**/spec.md`, lista `aspec/changes/**` y usa
      `existsSync`/`statSync`; no escribe en la base ni materializa datos.
- [x] 3.6 Conservar la apertura read-only, los cuatro checks existentes, la semántica de
      `healthy` y el exit code actual.

## Fase 4 — Integración y fixtures

- [x] 4.1 Confirmar que el exit code del subcomando sigue derivándose de `healthy` y que una ref
      rota produce código distinto de `0`.
- [x] 4.2 Ajustar las fixtures de test para representar repositorios temporales con
      `aspec/specs`, `aspec/changes` y `archive/` sin leer ni escribir `.ancleto/memory.db` del
      repositorio.
- [x] 4.3 Verificar el alcance real del cambio: en las Fases 2-6 quedó limitado a `src/core/memory/**`, `test/**` y el directorio del change; en la Fase 7 se agregó `src/cli/index.js`, limitado a la línea de ayuda de `memory doctor` (y `test/cli.test.js` con el aserto estrecho de esa ayuda); en ningún momento se tocaron los mirrors `.opencode/**`, `aspec/specs/**`, `opencode.json` ni `.ancletorc`.

## Fase 5 — Validación

- [x] 5.1 Correr los tests acotados del change y confirmar T09, T29, no-mutación, DB vacía,
      frontera `commit:`/`workitem:` y esquema no inicializado en verde.
- [x] 5.2 Correr `npm test` (comando declarado) y confirmar la suite completa en verde.
- [x] 5.3 Correr `npm run lint` (comando declarado).
- [x] 5.4 Registrar `Format: not-configured` y typecheck no aplica.
- [x] 5.5 Confirmar que `aspec/specs/memory-engine/spec.md` no se modificó y que no hubo
      escrituras en `.ancleto/memory.db`.
- [x] 5.6 Al archivar, sincronizar el delta con `aspec/specs/memory-ops/spec.md` sin editar la
      spec principal durante la implementación. (hecho en el archive 2026-10-31: MODIFIED de
      read-only y `--rebuild` + ADDED de refs no resueltas mergeados; `aspec specs check --json`
      → `ok: true`, `nonCanonical: []`)

## Fase 6 — Enmienda B: parser de refs sin indentación

> Enmienda. El tramo del quinto check `Refs de nodos activos` (Fases 1–5) ya está implementado y en
> verde; esta fase solo cambia el parser de refs. Responsabilidades separadas: `@tester` escribe los
> tests en rojo, `@coder` implementa, y la re-medición es read-only.

- [x] 6.1 (enmienda, `@tester`) Test en rojo: `refs:` + items sin indentar válidos y resolubles se
      parsean y se validan en escritura; hoy se rechazan con `tiene un bloque refs: vacio` y deben
      aceptarse.
- [x] 6.2 (enmienda, `@tester`) Test en rojo: `refs:` + un item sin indentar roto se rechaza
      nombrando la ref ofensora; hoy se rechaza como bloque vacío.
- [x] 6.3 (enmienda, `@tester`) Test de regresión: los items indentados siguen parseándose y
      validándose igual que antes.
- [x] 6.4 (enmienda, `@tester`) Test de límite del bloque: el bloque termina en la primera línea en
      blanco y la prosa posterior no se interpreta como refs.
- [x] 6.5 (enmienda, `@tester`) Test: una línea no-item indentada dentro del bloque es inválida y no
      se ignora.
- [x] 6.6 (enmienda, `@tester`) Test del `detail` del doctor: las refs sin indentar cuentan como
      verificadas y una rota se reporta igual que una indentada.
- [x] 6.7 (enmienda, `@coder`) Implementar en `refsBlockEnd` la continuación del bloque por item de
      lista sin exigir indentación; conservar línea en blanco como cierre, línea indentada no-item
      como inválida, línea no indentada no-item como cierre y un segundo `refs:` como inválido.
- [x] 6.8 (enmienda, `@coder`) Confirmar que `validateRefsForWrite` no afloja el fail-closed: solo
      cambia qué caso se acepta y qué mensaje aparece.
- [x] 6.9 (enmienda, read-only) Re-medir el `detail` de `memory doctor` sobre el repo real y
      registrar 66 refs verificadas en vez de 48, sin escribir en `.ancleto/memory.db`.
- [x] 6.10 (enmienda) Al archivar, sincronizar los deltas de `memory-ops` y `memory-engine` con sus
      specs principales; `aspec/specs/**` no se toca durante la implementación. (hecho en el
      archive 2026-10-31 para ambas capabilities)

## Fase 7 — Ajuste final (delta vs código)

- [x] delta `memory-ops`: precisión del `skipped` (raíz no derivable + defecto detectable sin raíz).
- [x] tests de guarda: raíz no derivable con bloque malformado ⇒ `ok:false`; `--rebuild` con ref rota
      ⇒ cinco checks, `ok:false`, `rebuilt:true` (más el aserto estrecho de la ayuda CLI).
- [x] ayuda CLI: `src/cli/index.js` enumera los cinco checks.
- [x] revalidación final + ledger.
- [ ] archive: anotar el drift de seed (`docs/technical-discovery/integrations.md` decía
      "cuatro checks" cuando había tres; es artefacto derivado, no se edita a mano).

## Fase 8 — Pulido

- [x] 8.1 Orden determinista del `detail` con rotas: ordenado por `memory_key`; a igual
      `memory_key`, en el orden en que aparecen las refs en `content`.
- [x] 8.2 Simplificación de `refsBlockEnd`.
- [x] 8.3 API mínima de `inspectRefs`.
- [x] 8.4 Constante del nombre del check.
- [x] 8.5 Error path compartido.
- [x] 8.6 Las siete guardas G1–G7.
- [x] 8.7 Revalidación final: `npm test` 710 pass / 4 skip / 0 fail; `lint` limpio.

---

**Estado:** implementación completa y validada (`npm test` 710 pass / 4 skip / 0 fail; `lint` limpio;
format y typecheck `not-configured`), pendiente sólo el archive.
