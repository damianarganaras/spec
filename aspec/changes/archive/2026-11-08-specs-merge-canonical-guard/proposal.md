# Proposal: Guard de heading de delta en specs canónicas (release conjunto 0.24.0; patch-class)

## Problema

`ancleto specs merge` sólo falla cerrado para `ADDED` cuando la spec canónica no tiene
`## Requirements` (`src/core/specs-merge.js`, `applyAdd`). Si la canónica conserva un heading de
sección de delta —`## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` o
`## RENAMED Requirements`—, las operaciones `MODIFIED`, `REMOVED` y `RENAMED` buscan el bloque por
título en todo el archivo y lo aplican con exit code 0. La reproducción empírica confirma el
asimetría: con una canónica que empieza en `## ADDED Requirements`, `MODIFIED`, `REMOVED` y `RENAMED`
escriben; sólo `ADDED` sale 2.

El repositorio ya contiene el estado inválido: `aspec/specs/copilot-support/spec.md:3`,
`aspec/specs/legacy-import/spec.md:3` y `aspec/specs/test-profile/spec.md:3` usan
`## ADDED Requirements` en lugar de `## Requirements` (la forma normalizada de
`aspec/specs/project-portability/spec.md:3`, corregida en 0.23.0). Un delta futuro sobre esas
capabilities podría mutarlas sin que el comando detecte el defecto.

## Intención

Extender el fail-closed existente para que el merge rechace cualquier spec canónica que contenga un
heading de sección de delta, para los cuatro tipos de operación, antes de escribir. El comando no
repara la canónica: la rechaza. La reparación es una normalización de higiene en el repositorio.

## Alcance

**Dentro:**

- **Guard canónica-only para los cuatro tipos.** En `src/core/specs-merge.js`, la fase de plan
  valida que la spec canónica que se modificaría no contenga `## ADDED Requirements`,
  `## MODIFIED Requirements`, `## REMOVED Requirements` ni `## RENAMED Requirements`. Aplica a
  `ADDED`, `MODIFIED`, `REMOVED` y `RENAMED`, no sólo a `ADDED`.
- **Fail-closed con cero escrituras.** Al detectar un heading de delta en la canónica, el comando
  sale con exit code 2 y no escribe ninguna capability del lote; `--dry-run` sale 2 y tampoco escribe.
  El mensaje nombra la capability y el heading ofensor. `--json` reutiliza el reporte de errores
  existente (`ok:false`, `errors:[...]`) sin campos nuevos.
- **Alcance estricto.** El guard inspecciona sólo `aspec/specs/**/spec.md`. Los delta specs bajo
  `aspec/changes/**/specs/**` conservan esos headings como legítimos y deben seguir parseando.
- **Reparación de higiene.** Normalizar `## ADDED Requirements` → `## Requirements` en
  `aspec/specs/copilot-support/spec.md`, `aspec/specs/legacy-import/spec.md` y
  `aspec/specs/test-profile/spec.md`; sólo el heading, sin tocar requirements ni scenarios.
- **Delta spec.** `specs/spec-sync/spec.md` con un `MODIFIED` de título exacto
  "Fail-closed ante ambigüedad o delta inválido", reescribiendo el cuerpo completo y preservando
  todos los scenarios canónicos no mencionados.

**Fuera (exclusión explícita):**

- Auto-normalizar la canónica durante el merge o reescribirla como parte de la reparación.
- Aplicar el guard a los delta specs.
- Cambiar `specs check`, `mergeLocked`, el affected-set, la memoria o el seed.
- Cambiar el matching por título exacto, la idempotencia para canónicas válidas o la atomicidad
  acotada del plan.
- Agregar comandos, flags, campos de reporte o conteos nuevos.
- Modificar `package.json` o la versión del paquete (el release la aplica).
- **Flujo de archive.** `skills/ancleto-archive` y `skills/ancleto-bulk-archive` aplican deltas
  editando directamente `aspec/specs/<capability>/spec.md` y NO pasan por `mergeSpecText`; este guard
  no los cubre. Mitigación: el content guard mantiene limpias las canónicas del repositorio.
- **Headings indentados o dentro de un bloque de código.** El guard reconoce sólo headings ATX de
  sección de delta en columna 0, sin rastreo de code fences, la misma semántica que el parser de
  delta: un heading con 1–3 espacios de indentación no se reconoce, y un heading a columna 0 dentro
  de un bloque de código se cuenta igual que el parser (limitación declarada, fuera del alcance del
  guard). El guard no promete exclusión por fence.

## Riesgos y mitigación

- **Falso positivo sobre deltas legítimos.** Si el guard se aplicara al delta, rompería todo merge
  real. Mitigación: la validación recibe sólo la spec canónica y hay un control positivo explícito
  de un delta con `## ADDED Requirements`.
- **Estado inválido preexistente.** Las tres canonales nombradas harían fallar cualquier merge hasta
  normalizarlas. Mitigación: la tarea 1 de higiene se ejecuta antes de habilitar el test de guard de
  contenido.
- **Mensaje sin contexto.** Un error sin heading ofensor obliga a inspeccionar el archivo. Mitigación:
  el `reason` nombra el heading y el envelope existente agrega la capability.
- **Regresión en `ADDED`.** El guard debe rechazar también una canónica con `## Requirements` y un
  heading de delta adicional, no sólo el caso sin sección. Mitigación: scenario y fixture propios.

## Decisión de versión

Release conjunto: **0.24.0** (minor). El release es conjunto con el change hermano
`agent-model-minimo-migration`, que introduce un cambio observable para todos los usuarios: el modelo
que instala `--tier minimo`. `specs-merge-canonical-guard` en sí sigue siendo patch-class: no agrega
comando, flag, campo ni conteo; sólo vuelve fail-closed un estado canónico que el merge ya debía
rechazar, la misma clase de cambio que `specs-merge-hardening` en 0.22.1.

## Delta spec

- `specs/spec-sync/spec.md` — 1 `MODIFIED`: "Fail-closed ante ambigüedad o delta inválido". Ningún
  `ADDED`, `REMOVED` ni `RENAMED`.

## Decisiones

- **memory_key:** specs-merge-canonical-heading-fail-closed
  **Elección:** El merge falla cerrado para `ADDED`, `MODIFIED`, `REMOVED` y `RENAMED` cuando la spec
  canónica contiene un heading de sección de delta. El guard rechaza la canónica y no la reescribe;
  normalizar el heading es la reparación de higiene, no una corrección automática del comando.
  **Descartado:** Auto-normalizar la canónica durante el merge; limitar el fail-closed a `ADDED` como
  hoy.
  **Justificación:** `MODIFIED`, `REMOVED` y `RENAMED` aplican sobre una canónica inválida con exit 0,
  y una reparación automática ocultaría el defecto y ampliaría el alcance de escritura del comando.
  **Estado:** aprobado

refs:
  - path:src/core/specs-merge.js
  - change:specs-merge-canonical-guard

- **memory_key:** specs-merge-canonical-guard-canonical-scope
  **Elección:** El guard aplica sólo a specs canónicas (`aspec/specs/**/spec.md`), nunca a delta specs
  (`aspec/changes/**/specs/**`), donde esos headings son legítimos.
  **Descartado:** Aplicar el mismo guard a los archivos delta.
  **Justificación:** Los headings de sección de delta son la sintaxis de entrada del comando; un
  rechazo sobre el delta rompería todo merge válido y contradiría el parser existente.
  **Estado:** aprobado

refs:
  - path:src/core/specs-merge.js
  - change:specs-merge-canonical-guard

- **memory_key:** repair-mcp-noop-already-shipped
  **Elección:** El guard de no-escritura de `repairProjectMcp` ya está implementado con el predicado
  `error || normalized || fixed.length > 0` y su change fue archivado; el item del backlog queda
  NO-OP.
  **Descartado:** Reimplementar el fix o reabrir el change.
  **Justificación:** El código y los tests actuales ya cubren la invariante; volver a implementarla
  duplicaría trabajo y riesgo sin cambio de comportamiento.
  **Estado:** aprobado

refs:
  - path:src/cli/index.js
  - path:test/cli.test.js
  - change:fix-repair-mcp-noop
