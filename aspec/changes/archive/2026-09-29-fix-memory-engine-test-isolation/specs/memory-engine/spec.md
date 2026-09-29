# Spec delta: fix-memory-engine-test-isolation

## ADDED Requirements

### Requirement: Aislamiento del cwd en las pruebas de `buildWorkingContext`

Las pruebas de `buildWorkingContext` SHALL pasar la raíz del proyecto explícita como tercer
argumento, de modo que la construcción del bloque NO dependa del directorio de trabajo
(`process.cwd()`) del proceso de test. Las llamadas que usan el `engine` compartido de
`test/memory-engine.test.js` NO SHALL omitir la raíz. Los fixtures que crean su propio directorio
temporal SHALL propagar ese directorio a sus callbacks, y las llamadas dentro de ellos NO SHALL
omitir la raíz.

#### Scenario: Resultado aislado sin resumen de topología

- **WHEN** una prueba invoca `buildWorkingContext(scope, maxTokens, root)` con una raíz aislada
  que no contiene `.discovery-map.json`
- **THEN** el resultado NO incluye `<ProjectTopology>`
- **AND** el resultado empieza con `<ProjectMemoryRules>` cuando el scope tiene reglas activas
- **AND** el resultado es `null` cuando el scope no tiene reglas activas

#### Scenario: Determinismo independiente del cwd del proceso

- **WHEN** la misma prueba se ejecuta desde un directorio de trabajo que contiene
  `.discovery-map.json` y desde uno que no
- **THEN** para la misma raíz explícita el bloque resultante es idéntico
- **AND** las aserciones de prefijo (`startsWith('<ProjectMemoryRules>')`) y de `null` se cumplen
  en ambos casos

#### Scenario: El engine compartido no hereda el cwd

- **WHEN** una prueba usa el `engine` compartido cuyo `memory.db` vive en un directorio temporal
  aislado
- **AND** invoca `buildWorkingContext` para verificar el bloque de reglas
- **THEN** la raíz pasada es el directorio temporal del engine, no `process.cwd()`

#### Scenario: El fixture con tmpdir propaga su raíz aislada

- **WHEN** una prueba usa un fixture que crea su propio directorio temporal y su `engine`
  (`withEngine`)
- **AND** invoca `buildWorkingContext(scope, maxTokens, root)` con el límite de tokens de la
  prueba
- **THEN** la raíz pasada es el directorio temporal del fixture, no `process.cwd()`
- **AND** el resultado empieza con `<ProjectMemoryRules>` y cierra con `</ProjectMemoryRules>`
  cuando hay reglas activas
- **AND** el truncamiento por límite de tokens es determinista e independiente del cwd del proceso

### Requirement: Invariancia de la firma y del comportamiento por defecto de `buildWorkingContext`

La corrección de aislamiento SHALL vivir exclusivamente en los tests. `buildWorkingContext` NO
SHALL cambiar su firma pública ni su comportamiento por defecto: el parámetro `cwd` SHALL
conservar el default `process.cwd()`, y cuando exista un resumen de topología en la raíz recibida
el bloque SHALL anteponer `<ProjectTopology>` a `<ProjectMemoryRules>`.

#### Scenario: La llamada sin raíz explícita conserva el default

- **WHEN** se invoca `buildWorkingContext(scope)` sin el tercer argumento
- **THEN** la topología se lee desde `process.cwd()`, sin cambios de comportamiento

#### Scenario: La topología sigue precediendo al bloque de reglas

- **WHEN** la raíz recibida contiene un `.discovery-map.json` válido
- **THEN** el bloque resultante empieza con `<ProjectTopology>`
- **AND** `<ProjectMemoryRules>` aparece después de `<ProjectTopology>`

#### Scenario: Sin topología el bloque de reglas encabeza

- **WHEN** la raíz recibida no contiene un `.discovery-map.json` válido
- **THEN** el bloque resultante empieza con `<ProjectMemoryRules>` cuando hay reglas activas
- **AND** es `null` cuando no hay reglas activas
