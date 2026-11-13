# Spec delta: ch-06b-affected-test-selection — prompt-contracts

## ADDED Requirements

### Requirement: Selección determinística de tests por affected-set con manifiesto cerrado

`ancleto affected` SHALL exponer, bajo el flag aditivo `--tests`, un plan de selección de tests
derivado del `affected-set`. `--tests` SHALL implicar salida JSON y NO SHALL modificar la salida JSON
de stdout ni los códigos de salida de `ancleto affected` cuando el flag está ausente: sin `--tests` el
objeto JSON SHALL conservar exactamente `seeds`, `affected`, `unresolved` y `externalCount`, con los
mismos valores y el mismo orden. El texto de uso y ayuda de `ancleto affected` SÍ puede mencionar
`--tests` y NO SHALL considerarse parte de esa salida JSON.

**Universo y manifiesto.** El universo `U` SHALL ser el conjunto de archivos bajo `test/` que
matchean `*.test.js`, equivalente al glob declarado `test/*.test.js`. El manifiesto `M` SHALL ser el
archivo `test/affected-tests.json` con esquema `{ "version": 1, "always": [paths], "couplings": [ {
"trigger": [globs], "tests": [paths], "reason": "..." } ] }`. Toda ruta de `M` SHALL ser
repo-relative en posix y SHALL ser miembro de `U`; una ruta fuera de `U` SHALL invalidar el
manifiesto.

**Selección.** `tests.selected` SHALL ser la unión de: (1) los tests de `U` que figuran en
`affected`; (2) los tests declarados en `always`; (3) los tests de los `couplings` cuyo `trigger`
interseca `affected` —es decir, algún archivo de `affected` matchea alguno de sus globs—; y (4) los
tests de `U` que figuran como `file` de alguna entrada de `unresolved`, porque su propio cierre no es
confiable y se seleccionan por precaución. `tests.selected` SHALL ser un subconjunto de `U`, en orden
lexicográfico y en rutas repo-relative posix.

**Complemento exacto.** `tests.excluded` SHALL ser exactamente `U` menos `tests.selected`, con cada
entrada `{ "file": <ruta>, "reason": "not-affected" }`, en orden lexicográfico. Ningún test de `U`
SHALL quedar fuera de `selected` y de `excluded` a la vez, y ninguno SHALL figurar en ambos.

**Gate de completitud.** `tests.complete` SHALL ser `true` sólo cuando el manifiesto sea válido y
esté cerrado, el glob resuelva al menos un archivo y ningún archivo de `affected` tenga imports no
resueltos. En caso contrario SHALL ser `false` y `tests.reasons` SHALL contener los códigos
aplicables, únicos y ordenados lexicográficamente: `manifest-missing` cuando el archivo falte;
`manifest-invalid` cuando el manifiesto se desvíe del esquema cerrado —no parseable, raíz que no sea
objeto, `version` distinta de `1`, `always` o `couplings` que no sean arreglos, entradas que no sean
strings no vacíos, `reason` vacío o en blanco, `trigger` o `tests` vacíos, glob de `trigger` con
backslash, o ruta no repo-relative posix o fuera de `U`—; el rechazo SHALL ser fail-closed, es decir,
toda desviación de ese esquema SHALL producir `manifest-invalid`;
`manifest-gap` cuando un test de `U` no pueda ser seleccionado nunca por imports —su cierre de
dependencias no toca `src/`— y no esté declarado en `M`; `test-glob-missing` cuando el glob no
resuelva ningún archivo; y `unresolved-in-closure` cuando algún archivo de `affected` tenga imports no
resueltos. `tests.reasons` SHALL estar vacío si y sólo si `tests.complete` es `true`.

**Contrato del consumidor.** El consumidor declarado del plan SHALL ejecutar `node --test` con las
rutas explícitas de `tests.selected` únicamente cuando `tests.complete === true`. Cuando
`tests.complete` sea `false`, SHALL imprimir `tests.reasons` y ejecutar la suite completa declarada
`node --test "test/*.test.js"`. El consumidor NO SHALL inventar un runner, NO SHALL ejecutar
`tests.selected` como si fuera completo y NO SHALL interpretar la ausencia del objeto `tests` como una
selección vacía.

**Read-only.** El cómputo del plan y el modo de sólo plan del consumidor NO SHALL escribir archivos,
NO SHALL abrir `.ancleto/memory.db` y NO SHALL usar la red.

**Determinismo.** Dos corridas sobre el mismo estado del repositorio con la misma semilla SHALL
producir un JSON byte-idéntico. `seeds` y `affected` conservan el orden del módulo; `selected`,
`excluded` y `reasons` SHALL tener orden estable y lexicográfico.

**Invariante negativa de completitud.** `tests.complete === true` NO SHALL prometer completitud
semántica universal. SHALL afirmar únicamente que el manifiesto está cerrado, que ningún test de `U`
quedó sin clasificar y que el cierre no tiene imports irresolubles. Un acoplamiento no-import nuevo
introducido dentro de un test ya declarado SHALL seguir cubierto sólo si ese test está declarado en
`always` o en un `coupling`; el plan NO SHALL inferirlo por análisis estático del cuerpo del test.

#### Scenario: Sin `--tests` el JSON no cambia

- **WHEN** se ejecuta `ancleto affected --json <archivo>` sin `--tests`
- **THEN** la salida SHALL ser el objeto con exactamente `seeds`, `affected`, `unresolved` y `externalCount`
- **AND** NO SHALL incluir `tests` ni cambiar valores, orden ni códigos de salida

#### Scenario: `--tests` implica salida JSON

- **WHEN** se ejecuta `ancleto affected --tests <archivo>` sin `--json`
- **THEN** la salida SHALL ser JSON con el objeto `tests` además de los cuatro campos existentes
- **AND** `--tests` NO SHALL interpretarse como una semilla

#### Scenario: Un test dependiente por import entra al plan

- **WHEN** una suite de `U` importa estáticamente un módulo que pertenece a `affected`
- **THEN** esa suite SHALL figurar en `tests.selected`
- **AND** NO SHALL figurar en `tests.excluded`

#### Scenario: Un coupling declarado cubre un acoplamiento sin arista

- **WHEN** un archivo de `affected` matchea el `trigger` de un `coupling` del manifiesto, por ejemplo una suite que spawnea el CLI o lee markdown sin importarlo
- **THEN** los `tests` de ese `coupling` SHALL figurar en `tests.selected`
- **AND** la selección NO SHALL depender de que exista una arista de import

#### Scenario: Un test declarado en `always` siempre se selecciona

- **WHEN** un test de `U` está declarado en `always` del manifiesto
- **THEN** SHALL figurar en `tests.selected` para toda semilla
- **AND** NO SHALL figurar en `tests.excluded`

#### Scenario: Un test sin import estático no declarado abre `manifest-gap`

- **WHEN** un test de `U` nunca puede seleccionarse por imports porque su cierre de dependencias no toca `src/`
- **AND** no está declarado en `always` ni en ningún `coupling`
- **THEN** `tests.complete` SHALL ser `false`
- **AND** `tests.reasons` SHALL incluir `manifest-gap`
- **AND** el consumidor NO SHALL ejecutar `tests.selected` como si fuera completo

#### Scenario: Un import irresoluble en el cierre abre `unresolved-in-closure`

- **WHEN** algún archivo de `affected` tiene imports no resueltos
- **THEN** `tests.complete` SHALL ser `false`
- **AND** `tests.reasons` SHALL incluir `unresolved-in-closure`

#### Scenario: `excluded` enumera el complemento exacto con su razón

- **WHEN** se computa el plan con `tests.complete === true`
- **THEN** `tests.excluded` SHALL enumerar exactamente `U` menos `tests.selected`
- **AND** cada entrada SHALL tener `reason: "not-affected"`
- **AND** ningún test de `U` SHALL quedar fuera de `selected` y `excluded` a la vez

#### Scenario: El consumidor cae a la suite completa con `complete:false`

- **WHEN** el consumidor recibe `tests.complete === false`
- **THEN** SHALL imprimir `tests.reasons` y ejecutar `node --test "test/*.test.js"`
- **AND** NO SHALL ejecutar `tests.selected` ni inventar un runner

#### Scenario: El plan es determinístico

- **WHEN** se computa el plan dos veces sobre el mismo estado del repositorio con la misma semilla
- **THEN** el JSON SHALL ser byte-idéntico en ambas corridas
- **AND** `selected`, `excluded` y `reasons` SHALL tener orden estable y lexicográfico

#### Scenario: El plan es read-only

- **WHEN** se ejecuta `ancleto affected --tests` o el consumidor en su modo de sólo plan
- **THEN** NO SHALL escribir archivos
- **AND** NO SHALL abrir `.ancleto/memory.db`
- **AND** NO SHALL usar la red

#### Scenario: Manifiesto ausente, inválido o fuera de `U` abre el gate

- **WHEN** el manifiesto falta, no es parseable, su `version` no es `1`, `always` o `couplings` no son arreglos, alguna entrada no es un string no vacío, `reason` está vacío o en blanco, `trigger` o `tests` están vacíos, un glob de `trigger` contiene backslash, o alguna ruta no es repo-relative posix o queda fuera de `U`
- **THEN** `tests.complete` SHALL ser `false`
- **AND** `tests.reasons` SHALL incluir `manifest-missing` o `manifest-invalid` según corresponda
- **AND** el rechazo SHALL ser fail-closed: cualquier desviación del esquema cerrado SHALL producir `manifest-invalid`

#### Scenario: Un glob sin archivos abre el gate

- **WHEN** el glob declarado `test/*.test.js` no resuelve ningún archivo
- **THEN** `tests.complete` SHALL ser `false`
- **AND** `tests.reasons` SHALL incluir `test-glob-missing`

#### Scenario: `complete:true` no promete completitud semántica universal

- **WHEN** `tests.complete` es `true`
- **THEN** SHALL afirmar sólo que el manifiesto está cerrado, que ningún test de `U` quedó sin clasificar y que el cierre no tiene imports irresolubles
- **AND** NO SHALL prometer cobertura semántica universal
- **AND** un acoplamiento no-import nuevo dentro de un test ya declarado SHALL seguir cubierto sólo si ese test está declarado en `always` o en un `coupling`
