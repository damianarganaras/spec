# Proposal: Retiro de `design.md` y `context.md` del flujo nuevo

## Problem

El flujo nuevo sigue produciendo `design.md` aunque su contenido durable ya tiene hogar en
`proposal.md ## Decisiones` (las cinco decisiones únicas de los `design.md` históricos ya fueron
respaldadas en memoria). Al mismo tiempo, `context.md` sobrevive como un archivo que sólo se nombra
para leerlo o borrarlo. Un artifact que nadie genera por necesidad y que cada consumidor evalúa con un
"when needed" es un artifact condicional disfrazado de obligatorio: obliga a mantener una plantilla en
cada generador y a decidir, en cada consumidor, si su ausencia es un hueco o el estado normal.

## Proposed change

Retirar `design.md` y `context.md` del flujo nuevo sin crear un artifact sucesor:

- Ningún generador produce `design.md` ni `context.md` en un change nuevo.
- Ningún consumidor los exige como precondición; a lo sumo los lee como legacy opcional.
- Una decisión durable se registra en `proposal.md ## Decisiones`, con la forma que ya define
  `agents/spec-writer.md`.
- Los changes ya archivados se leen y se mueven sin cambios; sus `design.md` y `context.md` no se
  eliminan, reescriben ni migran.
- El archive deja de borrar `context.md`: mueve el directorio del change sin modificarlo.

**Requirement modificado** — `artifact-update` → «Actualización in-place de artifacts de un change
existente ante cambios de definición»: la clasificación deja de mapear una decisión de diseño a
`design.md` y la mapea a `proposal.md ## Decisiones`. Se agrega el caso de un change legacy que todavía
contiene `design.md`/`context.md`, que se preservan in situ.

**Requirement nuevo** — `prompt-contracts` → «Retiro de `design.md` y `context.md` sin artifact
sucesor»: fija el contrato observable del retiro (generadores, consumidores, archive y legacy).

**Requirement sin cambios** — `prompt-contracts` → «El checkpoint de aprobación aprueba el contrato del
cambio»: ya establece que el checkpoint NO se condiciona a la existencia de `design.md`. Se cita como
evidencia de que el retiro no abre un hueco en la aprobación.

Por qué esa distribución de capabilities: `artifact-update` ya es dueño de la tabla de clasificación
(dueño del artifact por tipo de cambio), así que el cambio de destino de una decisión de diseño es un
delta natural ahí. `prompt-contracts` ya es dueño de los contratos de comportamiento de generadores y
agentes (incluida la regla del checkpoint), así que el contrato de retiro vive ahí en lugar de inventar
una capability nueva. `memory-ops` sólo registra el respaldo histórico de decisiones y no se toca.

Superficie nombrada:

- 6 agentes: `spec-writer` (contrato generador), `orchestrator`, `coder`, `tester`, `reviewer`,
  `documenter`.
- 13 skills: `propose`, `ff`, `continue`, `onboard`, `new`, `upgrade` (+ `references/templates.md`),
  `update`, `explore`, `workflow`, `apply`, `verify`, `bulk-archive`, `archive`.
- Guard único: `test/content-guards.test.js` (inversión del guard diferido de PR-2 y guard nuevo para
  `context.md`).

## Scope

**In scope**

- `agents/spec-writer.md`: quitar `design.md` del set mínimo y la regla de escritura que lo menciona.
- `agents/orchestrator.md`, `agents/coder.md`, `agents/tester.md`, `agents/reviewer.md`,
  `agents/documenter.md`: dejar de exigir/enumerar `design.md`; los cinco consumidores lo tratan como
  legacy opcional.
- Las 13 skills listadas: quitar `design.md` del orden de generación, de la clasificación de `update`,
  del ruteo de `workflow` y de las cargas de `apply`/`verify`/`bulk-archive`; retirar el borrado de
  `context.md` en `archive`/`onboard`/`bulk-archive`.
- `test/content-guards.test.js`: invertir el guard de PR-2 a negativo y agregar el guard de
  `context.md`, con mutación scratch.
- Documentación de usuario que hoy presenta `design.md` como artifact producido (`docs/skill-*.md`, y
  `README.md` si lo hace); la documentación de planificación e histórica (`docs/BACKLOG_*`,
  `docs/PLAN_*`, `docs/technical-discovery/**`, `CHANGELOG.md`) queda explícitamente fuera y no se
  reescribe.
- Delta specs en `aspec/changes/retire-design-and-context-artifacts/specs/`.

**Out of scope**

- Cualquier `design.md`/`context.md` dentro de `aspec/changes/archive/`: intactos.
- Documentación de planificación e histórica (`docs/BACKLOG_*`, `docs/PLAN_*`,
  `docs/technical-discovery/**`, `CHANGELOG.md`): no se reescribe ni se corrige. Único toque permitido:
  el registro aditivo del follow-up diferido §4.5b en `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`, que
  no modifica contenido existente.
- `templates/AGENTS.md`: su bloque `LOCKED: artifacts-language` habla del *idioma* de los artifacts, no
  del set, y sigue siendo cierto para los `design.md` legacy que todavía existen en
  `aspec/changes/archive/`; editar una superficie LOCKED ya fusionada agrega riesgo de migración sin
  ganancia de comportamiento.
- Follow-up diferido PR-4b / CH-02c (backfill masivo de decisiones desde los `design.md` archivados,
  opción B): fuera de este change; se registra como backlog versionado para ejecutarse después del
  archive.
- Edición a mano de `.opencode/**`: es mirror generado y sólo se regenera con `ancleto upgrade`.
- La migración o re-escritura de las cinco decisiones históricas ya respaldadas en memoria.
- Crear `handoff.md` o renombrar `design.md` a otro archivo.
- Cambios de código de implementación del producto.

## Risks

- Un guard negativo demasiado amplio (grep global de `design.md`) rompería por menciones legítimas de
  legacy y de `archive/`: se acota el predicado a las superficies generadoras/consumidoras dentro de su
  slice, con un control positivo de que la lectura legacy sigue nombrada.
- Al retirar `design.md` de `verify`, la coherencia podría quedar sin frontera declarada: se enmienda la
  completitud para cubrir `tasks.md` y `specs/`, dejando `design.md` como legacy opcional en vez de
  saltarlo en silencio.
- Deriva de mirrors instalados si alguien edita `.opencode/**` a mano: regeneración exclusiva con
  `ancleto upgrade` y verificación de que las 10 líneas `model:` no cambian.
- Un change legacy activo con `context.md` podría archivarse con ese archivo dentro al retirar el
  borrado: es el tradeoff aceptado; preserva el registro y evita data loss. El archive ya no necesita
  conocer el set de artifacts.
- Referencias residuales en specs históricos (`memory-ops`) que un grep ingenuo podría marcar como
  pendientes: se documenta que son registro histórico y quedan fuera del diff.

## Decisiones

- **memory_key:** `design-md-no-successor`
  **Elección:** Retirar `design.md` sin artifact sucesor; las decisiones durables se escriben en
  `proposal.md ## Decisiones` con la forma que ya define `agents/spec-writer.md`.
  **Descartado:** Crear `handoff.md` o renombrar `design.md` a otro archivo de diseño.
  **Justificación:** el contenido durable de `design.md` ya tiene sección canónica en el proposal, y las
  cinco decisiones únicas fueron respaldadas en memoria; un sucesor reintroduciría el mismo artifact
  condicional que se quiere eliminar y una segunda fuente para la misma decisión.
  **Refs:** `change:retire-design-and-context-artifacts`; `path:agents/spec-writer.md`;
  `path:skills/ancleto-propose/SKILL.md`
  **Estado:** aprobado

- **memory_key:** `context-md-legacy-read-only`
  **Elección:** Dejar de generar y de exigir `context.md`; retirar por completo el paso de borrado en el
  archive (`archive`, `onboard`, `bulk-archive`). El archive mueve el directorio sin modificarlo. Se
  conserva la lectura legacy opcional en `continue` y `update`.
  **Descartado:** Mantener el borrado condicional de `context.md` al archivar.
  **Justificación:** sin productores, el borrado sólo puede apuntar a archivos legacy; borrarlos destruye
  el registro justo cuando el archive es el lugar donde debe conservarse. El tradeoff aceptado es que un
  `context.md` legacy en un change activo se archiva en vez de borrarse, lo cual es inocuo porque ningún
  consumidor lo exige y no es un artifact del flujo nuevo.
  **Refs:** `change:retire-design-and-context-artifacts`; `path:skills/ancleto-archive/SKILL.md`;
  `path:skills/ancleto-continue/SKILL.md`; `path:skills/ancleto-update/SKILL.md`
  **Estado:** aprobado

- **memory_key:** `design-md-consumer-relaxation`
  **Elección:** Los consumidores (`coder`, `tester`, `reviewer`, `documenter`, `orchestrator`, `apply`,
  `verify`, `bulk-archive`) pasan de "when needed" a "legacy opcional, nunca precondición"; el flujo
  nuevo no lo pide y `verify` enmienda su frontera de completitud a `tasks.md` + `specs/` en lugar de
  omitirla.
  **Descartado:** Seguir condicionando consumidores a la presencia de `design.md`, o eliminarlo de
  `verify` sin declarar la nueva frontera.
  **Justificación:** un consumidor que condiciona su comportamiento a un artifact que ya no se produce
  convierte su ausencia en un falso hueco; declarar la frontera evita que el retiro se lea como una
  verificación incompleta.
  **Refs:** `change:retire-design-and-context-artifacts`; `path:skills/ancleto-verify/SKILL.md`;
  `path:agents/orchestrator.md`; `spec:artifact-update#Actualización in-place de artifacts de un change existente ante cambios de definición`
  **Estado:** aprobado
