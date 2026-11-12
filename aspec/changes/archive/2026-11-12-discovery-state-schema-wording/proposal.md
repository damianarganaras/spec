# Proposal: distinguir el estado persistido (`version: 1`) del schema de salida de `discovery --check` (`schemaVersion: 2`)

## Clasificación

**Funcional — corrección documental + una aserción de test no comportamental, con delta, PATCH.**
El runtime es correcto y no se toca. La
spec canónica afirma que el estado persistido conserva `schemaVersion: 2`, un campo que el writer
nunca persiste; el delta alinea el texto con la implementación y con la propia canónica.

Cita canónica que resuelve:

- `spec:cli-diagnostics#Semántica por segmentos de los patrones de exclusión del discovery`

Release: PATCH `0.30.2` (documentación canónica + una aserción de test no comportamental; sin
cambio de comportamiento; sin migración).

## Contexto

- Defecto: `aspec/specs/cli-diagnostics/spec.md:1010-1012` afirma «El estado persistido SHALL
  conservar `schemaVersion: 2` y `ruleVersion: 2`, y el writer y la forma del estado no cambian».
- La misma spec ya declara la forma correcta en `:697-698`:
  `{ version: 1, generatedAt, sources, fileHashes, hash, ruleVersion: 2, semantic, packTokens }`,
  sin `schemaVersion`. La cláusula de `:1011` la contradice.
- Implementación: `src/core/discovery-state.js:4-5,9-20` persiste `version: 1` y `ruleVersion: 2`;
  el objeto no tiene `schemaVersion`.
- `schemaVersion: 2` sólo existe en la salida JSON de `discovery --check`
  (`src/cli/index.js:2562-2563`), que es read-only. El lector usa `stored.ruleVersion === 2`
  (`:2516`) y `stored.hash` / `sources` / `fileHashes` (`:2525-2534`).
- El pin de bytes persistidos en `test/cli.test.js:9433-9474` fija orden de claves,
  `version === 1`, `ruleVersion === 2` y el golden, pero no lee el texto de la spec: por eso el
  defecto no lo detectó ningún test.
- El mismo error está repetido en `docs/technical-discovery/decisions.md:1103-1104` y
  `aspec/backlog.md:368`; se corrige por separado, fuera de este change.

## Propuesta (opción a)

Un delta `## MODIFIED Requirements` del requirement existente que:

- restituye el cuerpo completo y los 10 escenarios: `applyModified` reemplaza el bloque entero
  (`src/core/specs-merge.js:265-280`), así que un escenario omitido se borra;
- corrige sólo la cláusula del estado persistido: `version: 1` + `ruleVersion: 2`, sin
  `schemaVersion`, y aclara que `schemaVersion: 2` es el schema de **salida** de `discovery
  --check`;
- mantiene intacta la intención «el writer y la forma del estado no cambian» y todas las
  aserciones de comportamiento de los escenarios.

Sin cambio de runtime: writer, reader, forma del estado y `ruleVersion` quedan intactos. Sin
migración.

## Alternativas descartadas

- **(b) NO-OP**: dejar la spec contradictoria. La fuente de verdad seguiría afirmando un campo
  inexistente en el estado y contradiciendo su propio `:697-698`.
- **(c) Cambiar el writer para persistir `schemaVersion: 2`**: rompe el contrato de bytes pineado
  y el orden de claves, exige subir `version`/`ruleVersion` y una migración, y duplica una
  información que el estado ya expresa con `version` y `ruleVersion`.
- **(d) Nota externa** (por ejemplo en `docs/technical-discovery/`): no corrige la fuente de
  verdad; el error permanece en `aspec/specs/cli-diagnostics/spec.md`.

## Fuera de alcance

- Cualquier cambio en `src/**` (writer, reader, matcher, `checkDiscovery`).
- Bump de `version` o `ruleVersion` del estado persistido, migración o reescritura.
- `aspec/specs/**` (el merge del delta ocurre en el archive).
- `docs/technical-discovery/decisions.md:1103-1104` y `aspec/backlog.md:368` (mismo error, se
  corrige por separado).
- `ancleto-vscode-extension`.
- Bump de `package.json`, tag o publish en este change; el release PATCH `0.30.2` se ejecuta en su
  flujo propio.

## Paths autorizados

- `aspec/changes/discovery-state-schema-wording/` (proposal, tasks, delta).
- `test/cli.test.js` (sólo el test «pin offline del estado de discovery»).

## Validación planificada

Validaciones declarativas, según `PRODUCT.md` → `## Project Commands`:

- Lint: `npm run lint`.
- Tests acotados: `node --test test/cli.test.js` (ruta explícita; el runner declarado es Node Test
  Runner).
- Format: `not-configured` (el repo no declara formatter).
- Typecheck: `n/a` (no declarado; el paquete es JavaScript ESM puro).

## Decisiones

**memory_key:** discovery-state-schema-vs-version-wording
**Elección:** resolver con un delta `## MODIFIED Requirements` (opción a) que distingue el estado
persistido (`version: 1` + `ruleVersion: 2`, sin `schemaVersion`) del schema de salida JSON de
`discovery --check` (`schemaVersion: 2`).
**Descartado:** (b) NO-OP; (c) cambiar el writer para persistir `schemaVersion`; (d) nota externa
sin corregir la fuente de verdad.
**Justificación:** el runtime ya es correcto y la propia canónica (`:697-698`) ya declara la forma
real; corregir el texto evita romper el contrato de bytes pineado y no exige migración ni bump de
`ruleVersion`.
**Refs:**
- spec:cli-diagnostics#Semántica por segmentos de los patrones de exclusión del discovery
- change:discovery-state-schema-wording

**Estado:** aprobado

**memory_key:** discovery-state-schema-release-patch
**Elección:** release PATCH `0.30.2` (docs-only, sin cambio de comportamiento).
**Descartado:** MINOR `0.31.0`.
**Justificación:** no hay superficie nueva ni cambio observable; la única modificación es texto de
spec más una aserción negativa en un test existente, por lo que un MINOR declararía capacidad nueva
inexistente.
**Refs:**
- change:discovery-state-schema-wording

**Estado:** aprobado

## Riesgos y supuestos

- Supuesto: el archive aplicará el delta con `applyModified`, que reemplaza el bloque completo; el
  delta ya restituye el cuerpo y los 10 escenarios para no perder ninguno.
- Riesgo: divergencia entre el delta y la canónica si `:990-1092` cambia antes del archive.
  Mitigación: el delta se copió verbatim de la canónica en este change; el archive verifica el
  bloque reemplazado.
- Riesgo: que el test negativo (`!('schemaVersion' in state)`) se lea como contrato nuevo. Es una
  aserción sobre la forma ya vigente, no un cambio de comportamiento.
- El error repetido en `docs/technical-discovery/decisions.md:1103-1104` y `aspec/backlog.md:368`
  queda visible hasta su corrección separada.
