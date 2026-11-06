# Proposal: Merge determinístico de delta specs

## Intención

Convertir el merge de delta specs en una operación CLI determinística y offline, ejecutable como
`ancleto specs merge --change <slug> [--dry-run] [--json]`. Hoy el merge de `## ADDED|MODIFIED|REMOVED|RENAMED Requirements`
solo existe como instrucción de skill (`skills/ancleto-sync-specs`, `skills/ancleto-archive`): no hay
código que parsee ni aplique deltas, y `mergeLocked` no es un merge de deltas. El resultado buscado es
que un agente o una persona puedan aplicar un delta sobre los specs canónicos existentes con el mismo
resultado byte a byte en cada corrida, sin ediciones manuales y sin escrituras parciales.

## Alcance

In scope:

- Nuevo subcomando `ancleto specs merge --change <slug> [--dry-run] [--json]`.
- Resolución del change activo en `aspec/changes/<slug>/` o archivado en `aspec/changes/archive/*-<slug>/`,
  con fail-closed (exit 2) ante 0 o más de una coincidencia.
- Lectura de deltas desde `<changeDir>/specs/<capability>/spec.md` y aplicación sobre
  `aspec/specs/<capability>/spec.md`, que debe existir.
- Aplicación de `ADDED`, `MODIFIED`, `REMOVED` y `RENAMED` por título exacto `### Requirement:`.
- Idempotencia, --dry-run con cero escrituras, atomicidad entre capabilities y códigos de salida 0 (éxito o no-op válido), 1 (error de uso o I/O) y 2 (conflicto fail-closed, incluido el change inexistente o ambiguo).
- Tests de la nueva ruta en `test/specs-merge.test.js`.

Out of scope:

- Crear capabilities nuevas en `aspec/specs/`: el destino debe existir; si falta, fail-closed.
- Cablear el comando en skills o agentes (`ancleto-sync-specs`, `ancleto-archive`, `/cleto-*`).
- Cambios en memoria, seed de discovery, versión del paquete o release.
- Cambios en `specs check`, `mergeLocked` o el affected-set.
- Nuevas dependencias de runtime.

## Garantía acotada

Cuando se invoca con `--change <slug>`, el comando escribe únicamente
`aspec/specs/<capability>/spec.md` para capabilities que ya existen y están presentes en el delta del
change, y rechaza (exit 2, cero escrituras) las condiciones fail-closed enumeradas. No modifica los
archivos delta, la carpeta del change, la memoria, el seed, la versión del paquete, `specs check`,
`mergeLocked` ni el affected-set, y no crea capabilities nuevas. `--dry-run` realiza cero escrituras.

> Texto contractual de referencia (verbatim): "When invoked with `--change <slug>`, the command writes
> only `aspec/specs/<capability>/spec.md` for capabilities that already exist and are present in the
> change delta, and refuses (exit 2, zero writes) on the enumerated fail-closed conditions. It does NOT
> modify delta files, the change folder, memory, the seed, package version, `specs check`,
> `mergeLocked`, or affected-set, and does NOT create new capabilities. `--dry-run` performs zero
> writes."

## Riesgos y mitigaciones

- Escrituras parciales: atomicidad de plan: si una capability falla fail-closed, no se escribe
  ninguna; un error de I/O durante la escritura no es transaccional entre archivos.
- Ambigüedad por títulos parecidos o duplicados: mitigación con matching por título exacto y
  fail-closed ante 0 o ≥2 coincidencias, sin heurísticas.
- Segundo merge que duplique requirements o reescriba archivos sin cambios: mitigación con no-op
  idempotente y escritura solo cuando el plan no está vacío.
- Regresión de `specs check` / `specs` sin argumentos: mitigación manteniendo el dispatch actual y
  agregando la ruta `merge` sin cambiar el comportamiento existente.
- Divergencia por EOL o formato al reescribir: mitigación preservando el contenido no mencionado y
  escribiendo con el mismo separador dominante del archivo canónico.

## Decisión de arquitectura

Se agrega un módulo puro `src/core/specs-merge.js` que parsea delta y spec canónico, computa el plan y
devuelve el contenido resultante sin tocar disco; `src/cli/index.js` solo hace resolución de rutas,
lectura/escritura atómica y salida `--json`. Se elige módulo nuevo en `src/core/` en lugar de extender
`specsCheckCommand` porque el parser y el merge tienen semántica propia, son testeables sin CLI y no
pertenecen a la validación de keywords. No se agregan dependencias: parser de secciones por líneas con
el runtime de Node.

## Validación planificada

- `npm run lint` (`eslint src/ test/ scripts/`).
- `npm test` (`node --test "test/*.test.js"`), con foco en `test/specs-merge.test.js` durante el
  desarrollo usando ruta explícita.
- Format: no configurado. Typecheck: no aplica (JavaScript ESM).

## Rutas autorizadas

- `src/cli/index.js`
- `src/core/specs-merge.js`
- `test/specs-merge.test.js`
- `aspec/changes/**`

La implementación NO puede tocar `package.json` hasta la release de la FASE 8.

## Decisiones

- **memory_key:** `specs-merge-structural-by-exact-title`
  **Elección:** aplicar `ADDED`, `MODIFIED`, `REMOVED` y `RENAMED` por título exacto de `### Requirement:`, preservando todo requirement no mencionado y reescribiendo el cuerpo completo en `MODIFIED`.
  **Descartado:** matching difuso por similitud de títulos o por posición en el archivo.
  **Justificación:** el título exacto es el identificador canónico que hoy usan los deltas y el skill; un match difuso puede aplicar un cambio al requirement equivocado sin posibilidad de detectarlo.
  **Estado:** aprobado
refs:
  - path:src/cli/index.js
  - path:skills/ancleto-sync-specs/SKILL.md
  - path:aspec/specs/artifact-update/spec.md
  - spec:artifact-update#Límites de alcance de la actualización
  - change:ch-06a-specs-merge-deterministic

- **memory_key:** `specs-merge-fail-closed-no-partial-write`
  **Elección:** computar el plan de todas las capabilities antes de escribir y, si cualquiera falla, no escribir ningún archivo (exit 2).
  **Descartado:** escribir capability por capability y detenerse en el primer error.
  **Justificación:** un fallo a mitad dejaría specs canónicos parcialmente actualizados, un estado que no es reproducible ni reversible con la misma invocación.
  **Estado:** aprobado
refs:
  - path:src/cli/index.js
  - path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md
  - change:ch-06a-specs-merge-deterministic

- **memory_key:** `specs-merge-existing-capabilities-only`
  **Elección:** escribir solo `aspec/specs/<capability>/spec.md` cuando ese archivo ya existe; si la capability del delta no tiene spec canónico, fallar con exit 2 nombrando la capability.
  **Descartado:** crear automáticamente `aspec/specs/<capability>/spec.md` con `# Spec:`, `## Purpose` y `## Requirements`.
  **Justificación:** crear la estructura de una capability nueva requiere decisiones de purpose y domicilio que el comando no puede inferir; además `artifact-update` prohíbe modificar `aspec/specs/` desde la actualización de artifacts, por lo que el alta debe ser un acto explícito, no un efecto lateral del merge.
  **Estado:** aprobado
refs:
  - path:aspec/specs/artifact-update/spec.md
  - spec:artifact-update#Límites de alcance de la actualización
  - path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md

- **memory_key:** `specs-merge-dry-run-zero-writes`
  **Elección:** `--dry-run` computa y reporta el plan completo con cero escrituras, y usa los mismos códigos de salida que la ejecución real (`0` cuando aplica, `2` ante fail-closed).
  **Descartado:** un dry-run que escriba un archivo temporal o un journal de cambios.
  **Justificación:** el valor del dry-run es verificar el plan sin efectos; cualquier escritura, incluso temporal, rompe la garantía auditable de cero escrituras y complica el test de invariantes.
  **Estado:** aprobado
refs:
  - path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md
  - path:src/cli/index.js
  - change:ch-06a-specs-merge-deterministic

- **memory_key:** `mem-05-universal-set-deferred`
  **Elección:** diferir el "conjunto universal estable" de MEM-05 fuera de este change.
  **Descartado:** incluirlo aquí como parte del merge determinístico.
  **Justificación:** el núcleo de MEM-05 se archivó el 2026-11-02 con orden de entrega, errores por requerido y dos presupuestos separados; el set universal restante requiere curaduría en DB (MEM-01) y definición de criticality (CH-09a, diferido), y además movería el prefijo cacheado. No es código offline-testeable.
  **Estado:** descartado
refs:
  - path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md
  - path:src/core/memory/engine.js

- **memory_key:** `ch-00-baseline-runbook-not-change`
  **Elección:** tratar CH-00 (baseline y matriz de compatibilidad) como runbook operativo, no como change de implementación.
  **Descartado:** abrir un change aspec para CH-00.
  **Justificación:** es un procedimiento de medición sin cambio de producción y no es offline-testeable como código; forzarlo a un change agregaría artifacts sin comportamiento que especificar.
  **Estado:** descartado
refs:
  - path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md
  - path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md

- **memory_key:** `ch-06b-test-selection-deferred`
  **Elección:** diferir la selección de tests focalizados (CH-06b) fuera de este change.
  **Descartado:** implementar una heurística de selección de tests junto al merge de specs.
  **Justificación:** `computeAffectedSet` y `ancleto affected` ya existen y son determinísticos; la selección focalizada es heurística y no tiene consumidor probado, mientras el merge sí tiene semántica pura y consumidor comprobado.
  **Estado:** descartado
refs:
  - path:src/core/affected-set.js
  - path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md

- **memory_key:** `ch-07-ab-deferred-no-baseline`
  **Elección:** diferir CH-07 (cache, tools y modelos) fuera de este change.
  **Descartado:** incluir experimentos A/B de prefijos y modelos.
  **Justificación:** CH-07 depende del baseline de CH-00, no es offline-testeable y no existe métrica de host que permita comparar; sin baseline, cualquier resultado sería extrapolación.
  **Estado:** descartado
refs:
  - path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md
  - path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md
