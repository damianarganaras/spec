# Proposal: Orden correcto del archive (promoción antes del move)

## Problema

La regla ya promovida `archive-promocion-antes-del-move` exige que la promoción de decisiones
aprobadas ocurra antes de mover el change a `aspec/changes/archive/`. Las dos skills de archive siguen
el orden inverso: `skills/ancleto-archive/SKILL.md` mueve en el paso 5 y promueve en el 6, y
`skills/ancleto-bulk-archive/SKILL.md` mueve en 8c y promueve en 9. Ese orden hace que las refs
`path:` que apuntan dentro del change dejen de resolver justo cuando la promoción las valida, y produce
el texto "archivado, memoria pendiente", que sólo tiene sentido si el move ya ocurrió. La mitad
correspondiente del spec canónico (`memory-ops`) también describe el fallo post-move con ese texto.

## Alcance

**Dentro:**

- **Orden canónico en ambas skills.** (1) merge/sync de specs si hay delta, (2) preflight del lote de
  promoción —read-only, fail-closed—, (3) promoción de los bloques `## Decisiones` aprobados, (4) move
  del directorio a `aspec/changes/archive/YYYY-MM-DD-<slug>/` sin modificarlo, (5) summary/commit. La
  promoción corre después del merge y antes del move.
- **Semántica de fallo.** Preflight o promoción fallidos antes del move: el change NO se mueve, no hay
  escrituras (la compuerta es cero escrituras ante cualquier violación), y se reporta
  `no archivado; memoria pendiente` nombrando la `memory_key` y el motivo, con reintento. Fallo del
  move después de una promoción exitosa: se reporta `memoria promovida; NO archivado`, con reintento.
  La garantía queda acotada a esos dos literales canónicos en español; las superficies de producto en
  inglés usan los equivalentes exactos `not archived; memory pending` y `memory promoted; NOT archived`,
  sin otras variantes. Se reemplaza el texto "archivado, memoria pendiente", que presume
  move-before-promote.
- **Compuerta de promoción sin cambios.** Sólo se promueve `Estado: aprobado`; cualquier violación
  produce cero escrituras; el shape de `## Decisiones` se referencia desde `agents/spec-writer.md` y no
  se re-enuncia en las skills.
- **Guard de contenido.** En `test/content-guards.test.js`, un guard compara el índice textual del paso
  de promoción contra el del move en ambas skills y una mutación que invierte el orden debe fallar.
- **Superficie canónica de agentes.** `agents/documenter.md` SHALL partir el archive en fase A (sólo
  merge/sync de specs, SIN move) y fase B (sólo move), con la promoción entre ambas;
  `agents/orchestrator.md` SHALL correr Automatic Record en paralelo con la fase A, luego la promoción,
  luego la fase B. `skills/ancleto-onboard/SKILL.md` también es superficie canónica de archive: su
  Phase 9 mueve el change directamente, sin merge, preflight ni promoción, y la corrección SHALL
  enrutarla por el mismo gate. Es superficie de producto: la release corre `ancleto upgrade` y
  commitea los cambios trackeados que eso genere.
- **Delta canónico** en `aspec/specs/memory-ops/spec.md`: `MODIFIED` de título exacto "Promoción al
  archivar sólo de decisiones duraderas aprobadas", reescribiendo el cuerpo completo y agregando los
  escenarios de orden y de los dos desenlaces de fallo.
- **Superficie de producto.** La release MUST correr `ancleto upgrade` y commitear los archivos
  trackeados que cambien bajo `agents/**` / `skills/**` / `.opencode/**`.

**Fuera:**

- `aspec/specs/prompt-contracts/spec.md` NO se modifica. Se revisó: la requirement "Paralelización de
  la finalización y el registro de memoria" es sobre Automatic Record (memoria episódica) y separa
  explícitamente la promoción en L584-590; no enuncia move-before-promote ni "archivado, memoria
  pendiente". Las menciones de L1160-1162 y L1193 enumeran operaciones que deben completarse, no un
  orden. No hay delta en `prompt-contracts`.
- La paralelización de Automatic Record (memoria episódica) queda intacta: superficie disjunta.
- La compuerta de promoción no cambia: no se agregan ni quitan condiciones, ni se re-enuncia el shape.
- No se tocan src/cli, specs check, merge, `recordRule`/`recordDecision` ni el contrato de memoria.

## Riesgos y mitigación

- **Guard tautológico.** Un assert de orden sin mutación no prueba nada. Mitigación: mutación
  obligatoria que invierte los pasos y debe romper el test.
- **Deriva de mirrors.** Editar sólo la fuente `skills/**` y regenerar los mirrors con
  `ancleto upgrade`; no editar `.opencode/**` a mano.
- **Fallo de promoción interpretado como archive exitoso.** Mitigación: los dos mensajes nuevos son
  mutuamente excluyentes y nombran la `memory_key` y el reintento.
- **Ambigüedad de "antes del move".** Mitigación: el guard compara índices textuales de los pasos en
  ambas skills, no sólo la presencia de las palabras.

## Delta spec

- `specs/memory-ops/spec.md` — 1 `MODIFIED`: "Promoción al archivar sólo de decisiones duraderas
  aprobadas". Sin delta en `prompt-contracts`. El escenario canónico
  `Fallo de promoción no se reporta como éxito` queda deliberadamente fuera del delta: presume
  move-before-promote y está superseded por los escenarios de fallo de preflight/promoción antes del
  move y de fallo del move tras una promoción exitosa.

## Decisiones

- **memory_key:** archive-order-promote-before-move
  **Elección:** la secuencia de archive es merge/sync → preflight → promoción → move → summary/commit;
  la promoción corre después del merge y antes del move, y los fallos se reportan como
  `no archivado; memoria pendiente` (antes del move) o `memoria promovida; NO archivado` (fallo del
  move tras promoción exitosa).
  **Descartado:** mantener move-before-promote y el texto "archivado, memoria pendiente".
  **Justificación:** las refs `path:` que apuntan dentro del change dejan de resolver después del
  move, así que validarlas y promover después del move garantiza fallos por refs válidas al momento
  de escribir. Invertir el orden hace que la compuerta vea el path todavía vigente y que el mensaje de
  fallo describa el estado real.
  **Refs:**
  - spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas
  - path:skills/ancleto-archive/SKILL.md
  - path:skills/ancleto-bulk-archive/SKILL.md
  - path:aspec/specs/memory-ops/spec.md
  - path:AGENTS.md
  - change:archive-order-correctness

  **Estado:** aprobado

- **memory_key:** archive-order-content-guard
  **Elección:** un content guard en `test/content-guards.test.js` fija que el paso de promoción
  precede al paso de move en ambas skills, comparando índices textuales; una mutación que invierte el
  orden debe romperlo.
  **Descartado:** confiar sólo en la revisión manual de las skills o en un assert de presencia de
  palabras.
  **Justificación:** el affected-set excluye los guards de contenido markdown, así que este test debe
  nombrarse explícitamente como task-owned; sin una mutación el guard no prueba el orden, sólo la
  existencia de los pasos.
  **Refs:**
  - path:test/content-guards.test.js
  - path:skills/ancleto-archive/SKILL.md
  - path:skills/ancleto-bulk-archive/SKILL.md
  - change:archive-order-correctness

  **Estado:** aprobado

- **memory_key:** archive-order-canonical-agent-surface
  **Elección:** el orden merge → preflight → promoción → move debe quedar codificado en las
  definiciones canónicas de agentes (orchestrator y documenter) Y en las skills de archive
  (`ancleto-archive`, `ancleto-bulk-archive`) y de onboarding (`ancleto-onboard`); la release
  regenera los mirrors con ancleto upgrade.
  **Descartado:** corregir sólo el texto de las skills de archive mientras las definiciones de agentes
  y la Phase 9 de onboarding siguen moviendo el change sin el gate.
  **Justificación:** agents/documenter.md hacía merge y move en una sola pasada y
  agents/orchestrator.md corría la promoción sólo después, falsificando la garantía en la fuente
  canónica; skills/ancleto-onboard/SKILL.md mueve el change directamente en su Phase 9, sin merge,
  preflight ni promoción, y también debe pasar por el gate.
  **Refs:**
  - path:agents/orchestrator.md
  - path:agents/documenter.md
  - path:skills/ancleto-archive/SKILL.md
  - path:skills/ancleto-bulk-archive/SKILL.md
  - path:skills/ancleto-onboard/SKILL.md
  - path:test/content-guards.test.js
  - path:aspec/specs/memory-ops/spec.md
  - change:archive-order-correctness

  **Estado:** aprobado
