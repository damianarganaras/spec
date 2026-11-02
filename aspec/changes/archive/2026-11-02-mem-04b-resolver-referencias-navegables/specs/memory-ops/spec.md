# Delta: memory-ops

## MODIFIED Requirements

### Requirement: Harness de regresión golden M01–M10

El harness SHALL versionar `test/fixtures/memory/golden.json` con exactamente diez entradas `M01`–`M10`.
Cada entrada SHALL declarar `id`, `query`, `status` (`active` o `deferred`) y `expected` cuando está
activa; una entrada `deferred` SHALL declarar además un `blocker` no vacío que nombre el tramo o runbook
que la habilitará.

El harness SHALL evaluar siempre contra una base fixture congelada, sembrada desde
`test/fixtures/memory/seed.json` con el formato que produce `exportActive()` y con el `importNodes`
existente. Para los casos que resuelven refs, la base SHALL sembrarse además desde
`test/fixtures/memory/golden-refs-seed.json`, con el mismo formato y el mismo `importNodes`. NO SHALL
leer `.ancleto/memory.db` viva y NO SHALL introducir un loader nuevo.

En este corte SHALL haber exactamente cinco entradas activas: `M01` (la regla del test runner
vendorizado aparece en el top-3 de resultados), `M04` (un nodo recuperado expone la ubicación de su
ref `spec:`), `M05` (un nodo recuperado expone la ubicación de su ref `change:`) y `M06` (un nodo
recuperado reporta la ambigüedad de su ref `change:` sin elegir), junto con `M07` (una fuente
inexistente no produce referencia inventada y la consulta se abstiene). Las cinco restantes SHALL
estar `deferred` con su blocker nombrado: `M02` → runbook MEM-01; `M03` → PR-3 (backfill de las cinco
decisiones únicas); `M08`, `M09` → PR-2/PR-3; `M10` → MEM-06 (P2).

`expected.mode` SHALL admitir `topK`, `abstain` y `refs`. El modo `refs` SHALL buscar por la `query`
de la entrada, exigir las `memory_keys` esperadas en el top-`k` y resolver las refs del nodo
recuperado contra el root versionado `test/fixtures/memory/refs-root/`; por cada ref esperada SHALL
comparar `path`, `heading` o `reason` según el caso. El harness NO SHALL omitir en silencio un modo
desconocido, una ref esperada ausente o una comparación sin resultado: cualquiera de esos casos SHALL
fallar el test.

El test SHALL fallar si una entrada `deferred` no declara blocker, si el conjunto de entradas diferidas
difiere de la allowlist explícita declarada en el test, o si una entrada activa no produce su `expected`.
NO SHALL existir skip silencioso.

#### Scenario: M01 recupera la regla del test runner

- **WHEN** el harness evalúa `M01` contra la fixture congelada
- **THEN** el resultado incluye en el top-3 la regla del test runner vendorizado

#### Scenario: M04 expone el path y el heading del spec

- **WHEN** el harness evalúa `M04` contra la fixture congelada y resuelve la ref contra `refs-root`
- **THEN** el nodo esperado aparece en el top-3
- **AND** la ref `spec:` devuelve el path `aspec/specs/prompt-contracts/spec.md` y el heading
  `Política de validaciones declarativa por proyecto`

#### Scenario: M05 expone el directorio del change archivado

- **WHEN** el harness evalúa `M05` contra la fixture congelada y resuelve la ref contra `refs-root`
- **THEN** el nodo esperado aparece en el top-3
- **AND** la ref `change:` devuelve el path
  `aspec/changes/archive/2026-10-28-reingenieria-memoria-first`

#### Scenario: M06 reporta ambigüedad sin elegir

- **WHEN** el harness evalúa `M06` contra la fixture congelada y resuelve la ref contra `refs-root`,
  donde dos archives declaran el mismo slug
- **THEN** el nodo esperado aparece en el top-3
- **AND** la ref `change:` devuelve `reason` `ambiguo (2 coincidencias)` y no devuelve `path`

#### Scenario: M07 se abstiene ante una fuente inexistente

- **WHEN** el harness evalúa `M07` contra la fixture congelada
- **THEN** el resultado es el esperado por la entrada
- **AND** no se fabrica ninguna referencia a una fuente inexistente

#### Scenario: Allowlist de diferidas

- **WHEN** el conjunto de entradas `deferred` difiere de la allowlist explícita del test
- **THEN** el test falla

#### Scenario: Diferida sin blocker

- **WHEN** una entrada `deferred` no declara `blocker`
- **THEN** el test falla nombrando la entrada
