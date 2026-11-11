## ADDED Requirements

### Requirement: Validación estructural de delta specs de changes activos

The system SHALL validar en la suite de tests declarada (`npm test`) la estructura de todo delta spec
ubicado en `aspec/changes/<change>/specs/<capability>/spec.md` de los changes activos, usando la misma
gramática que `ancleto specs merge --change <slug>`. Un delta de un change activo que esa gramática
rechaza SHALL hacer fallar la suite, de modo que el defecto estructural se detecte antes del archive y
no recién en `ancleto specs check --change` o `ancleto specs merge --change`. La validación NO SHALL
modificar el runtime de la CLI ni reimplementar la gramática del parser.

El barrido SHALL recorrer las entradas de `aspec/changes` y SHALL excluir el contenedor `archive` por
identidad del nombre de la entrada, NO por prefijo ni por cualquier otra heurística. Los delta specs
bajo `aspec/changes/archive/**` SHALL quedar fuera de alcance aunque el parser los rechace, y NO SHALL
evaluarse ni reportarse.

El barrido SHALL tolerar cero changes activos como estado válido: cuando no hay ningún delta que
recorrer, la suite SHALL pasar. El fail-closed SHALL limitarse a dos casos: `aspec/changes` inexistente
o ilegible, y un `spec.md` presente que no pueda leerse o parsearse.

#### Scenario: Delta activo bien formado

- **WHEN** el barrido recorre un delta spec de un change activo cuyos bloques son canónicos, con requirements con título y escenarios
- **THEN** no reporta errores y la suite no falla por ese archivo

#### Scenario: Delta activo malformado

- **WHEN** un delta spec de un change activo contiene una sección `##` no reconocida, prosa suelta dentro de una sección, o un `### Requirement:` sin título
- **THEN** la suite falla con el error estructural producido por el parser del merge para ese archivo

#### Scenario: Deltas archivados fuera de alcance

- **WHEN** existen delta specs bajo `aspec/changes/archive/`, incluidos los que el parser rechazaría
- **THEN** el barrido no los recorre ni los evalúa
- **AND** la suite no falla por ellos

#### Scenario: Sin changes activos

- **WHEN** no existe ningún change activo en `aspec/changes`
- **THEN** el barrido termina sin error
- **AND** cero archivos evaluados se considera un estado válido, no un fallo
