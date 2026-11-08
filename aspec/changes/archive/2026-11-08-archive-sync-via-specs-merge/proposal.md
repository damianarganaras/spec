# Proposal: Sync de delta al archivar ruteado por specs merge

Fecha: 2026-11-08

## Problema

El archive de 0.24.0 sigue sincronizando los delta specs editando `aspec/specs/<capability>/spec.md`
a mano, y por esa vía evade el guard fail-closed de headings de sección de delta que vive en
`src/core/specs-merge.js` (`mergeSpecText` → `findDeltaSectionHeaders`). La deuda quedó declarada en el
change predecesor `specs-merge-canonical-guard` (su exclusión explícita "Flujo de archive").

Evidencia actual:

- `skills/ancleto-archive/SKILL.md` §2 "Assess delta spec sync state": corre
  `ancleto specs check --change <name> --json` como precheck y luego instruye editar la spec canónica
  aplicando las cuatro operaciones (`ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`). No invoca
  `ancleto specs merge`.
- `skills/ancleto-bulk-archive/SKILL.md` §8a repite la misma edición manual; §5c decide el skip cuando
  la implementación no existe.
- `agents/documenter.md` Phase A dice "update the relevant source-of-truth specs" y lista los headings
  de delta, sin prescribir el comando merge.
- La prosa manual promete que `MODIFIED` "preserva scenarios no mencionados", lo que contradice la
  spec canónica `spec-sync`: `MODIFIED` reemplaza el bloque completo —cuerpo y escenarios— por el del
  delta.

El comando ya existe y es el dueño del guard: `ancleto specs merge --change <slug>` (con `--json` y
`--dry-run`) valida el plan antes de escribir y sale con exit code 2 y cero escrituras ante un heading
de delta en la canónica. Rutear el archive por ese comando aplica el MISMO guard sin duplicarlo.

## Intención

Que el sync de delta al archivar pase por `ancleto specs merge --change <slug>` en las dos skills de
archive y en `agents/documenter.md` Phase A. El guard de headings de delta sigue viviendo sólo en
`src/core/specs-merge.js` y aplicando sólo a specs canónicas; las skills no reimplementan validación.

## Alcance

**Dentro:**

- **`skills/ancleto-archive/SKILL.md` §2.** Cuando hay bloque de delta y el usuario elige sincronizar,
  invocar `ancleto specs merge --change <name>` en lugar de editar la spec a mano. Exit code 0 ⇒
  continuar con preflight, promoción y move; cualquier exit code distinto de 0 ⇒ abortar el archive de
  ese change sin preflight, sin promoción y sin move, reportando capability, requirement y motivo.
  Eliminar la promesa de preservar scenarios no mencionados en `MODIFIED`.
- **`skills/ancleto-bulk-archive/SKILL.md` §8a.** Invocar `specs merge` una vez por change, en el orden
  determinado; un fallo fail-closed marca ese change como no archivado y continúa el lote. Conservar
  el skip de §5c: un change sin implementación no invoca `specs merge`.
- **`agents/documenter.md` Phase A.** Reemplazar la instrucción genérica de actualizar las specs por la
  invocación de `ancleto specs merge --change {change-name}`; conservar el `specs check` previo, el
  reporte `sin delta` y la separación Phase A / Phase B.
- **Delta spec.** `specs/prompt-contracts/spec.md` con un `ADDED` de título exacto
  "Sync de delta al archivar ruteado por specs merge", que captura el ruteo, los exit codes, la
  capability nueva, la idempotencia, el camino sin delta, el orden, el bulk y la exactitud del texto.
- **Guards de contenido.** `test/content-guards.test.js` debe afirmar que las dos skills y documenter
  nombran `ancleto specs merge` y no reproducen la edición manual ni la promesa de preservación.
- **Alcance acotado al archive.** La regla de "único escritor" rige sólo el flujo de archive:
  `ancleto-archive`, `ancleto-bulk-archive` y `agents/documenter.md` en modo Change Archive.
- **Dependencia explícita del CLI.** Si el binario `ancleto` no está disponible durante el sync, la
  skill se detiene (STOP) y reporta el bloqueo; no hay fallback manual.

**Fuera (exclusión explícita):**

- No se modifica `src/core/specs-merge.js`.
- No se cambian los flags ni la semántica de `specs merge` (`--change`, `--json`, `--dry-run`, exit
  codes, guard canónica-only).
- No se agrega merge ni creación de capabilities nuevas: la capability inexistente sigue fail-closed.
- No se promete atomicidad entre archivos: la fase de escritura del merge sigue secuencial y no
  transaccional.
- No se cambia el orden de archive (merge/sync → preflight → promoción → move → summary/commit) ni el
  gate de promoción de `## Decisiones`.
- No hay escrituras de memoria en este change.
- No se toca `.opencode/**` (los mirrors se regeneran con `ancleto upgrade`).
- No se archiva ningún change.
- La skill standalone `ancleto-sync-specs` y el modo `Standalone Source-of-Truth Update` de
  `agents/documenter.md` quedan fuera de alcance y sin cambios: mantienen su sync manual fuera del
  archive.

## Riesgos y mitigación

- **Dependencia del CLI.** Las skills declaran "No external binaries required"; el sync de delta pasa a
  requerir `ancleto specs merge`. Mitigación: si el CLI no está disponible, el archive se detiene y
  reporta el bloqueo; nunca vuelve a la edición manual, que reintroduciría el bypass.
- **Reimplementar el guard en prosa.** Duplicar `findDeltaSectionHeaders` en las skills haría derivar
  dos fuentes. Mitigación: las decisiones descartadas dejan el guard en `specs-merge.js` y las skills
  sólo rutean.
- **Texto que sigue prometiendo preservación.** Un `MODIFIED` que preserve scenarios contradice
  `spec-sync` y produce una spec canónica distinta de la real. Mitigación: un guard de contenido
  prohíbe la frase y un escenario la fija.
- **Deriva de mirrors.** Editar sólo `skills/**` y `agents/**`; regenerar `.opencode/**` con
  `ancleto upgrade`, nunca a mano.

## Delta spec

- `specs/prompt-contracts/spec.md` — 1 `ADDED`: "Sync de delta al archivar ruteado por specs merge".
  El requirement acota el "único escritor" al flujo de archive, excluye explícitamente
  `ancleto-sync-specs` standalone y el modo Standalone de documenter, y fija la dependencia del CLI
  (STOP sin fallback manual). Ningún `MODIFIED`, `REMOVED` ni `RENAMED`. No se modifica
  `memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas` porque su secuencia ya
  nombra "merge/sync de specs" sin fijar el mecanismo, y no hay contradicción. No se modifica
  `prompt-contracts#Archive de un change de conformidad sin delta` porque el camino sin delta queda
  igual.

## Decisiones

- **memory_key:** archive-sync-routes-through-specs-merge
  **Elección:** el sync de delta al archivar se ejecuta invocando `ancleto specs merge --change <slug>`
  en las dos skills de archive y en `agents/documenter.md` modo Change Archive; un exit distinto de 0
  aborta el archive de ese change sin moverlo, y no existe edición manual de las cuatro operaciones.
  **Descartado:** mantener la edición manual de `aspec/specs/<capability>/spec.md`; agregar el guard de
  headings de delta dentro de las skills.
  **Justificación:** el guard vive sólo en `src/core/specs-merge.js` y aplica sólo a specs canónicas;
  rutear por el comando aplica exactamente esa compuerta y cierra la deuda de 0.24.0 sin duplicar la
  invariante.
  **Refs:**
  - spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas
  - spec:spec-sync#Fail-closed ante ambigüedad o delta inválido
  - change:archive-sync-via-specs-merge
  - path:skills/ancleto-archive/SKILL.md
  - path:skills/ancleto-bulk-archive/SKILL.md
  - path:agents/documenter.md
  **Estado:** aprobado

- **memory_key:** archive-sync-canonical-surface-documenter
  **Elección:** la corrección cubre `agents/documenter.md` Phase A además de las dos skills, porque
  documenter es la superficie canónica que ejecuta el merge en el flujo de archive.
  **Descartado:** limitar el cambio a `skills/ancleto-archive/SKILL.md` y
  `skills/ancleto-bulk-archive/SKILL.md`, dejando documenter con la instrucción genérica de actualizar
  las specs.
  **Justificación:** si documenter sigue editando a mano, el guard se evade por esa ruta y la garantía
  de ruteo no se cumple en el flujo canónico que orquesta `@orchestrator`.
  **Refs:**
  - spec:memory-ops#Promoción al archivar sólo de decisiones duraderas aprobadas
  - change:archive-sync-via-specs-merge
  - path:agents/documenter.md
  - path:skills/ancleto-archive/SKILL.md
  **Estado:** aprobado

- **memory_key:** archive-delta-validation-in-skills-rejected
  **Elección:** se descarta agregar el guard de headings de delta dentro de las skills de archive; el
  guard sigue viviendo sólo en `src/core/specs-merge.js`.
  **Descartado:** duplicar `findDeltaSectionHeaders` y el fail-closed en prosa dentro de
  `ancleto-archive` y `ancleto-bulk-archive`.
  **Justificación:** los precedentes `specs-merge-canonical-heading-fail-closed` y
  `specs-merge-canonical-guard-canonical-scope` fijan un único dueño; duplicarlo en texto no es
  verificable, deriva y puede contradecir el comportamiento real del comando.
  **Refs:**
  - spec:spec-sync#Fail-closed ante ambigüedad o delta inválido
  - change:archive-sync-via-specs-merge
  - path:src/core/specs-merge.js
  **Estado:** descartado
