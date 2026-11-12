# Spec delta: discovery-state-schema-wording — cli-diagnostics

## MODIFIED Requirements

### Requirement: Semántica por segmentos de los patrones de exclusión del discovery

`ancleto discovery` SHALL evaluar cada patrón de `discovery.exclude` de `.ancletorc` contra rutas
relativas al repositorio con separador `/`, y SHALL excluir de `sources` toda ruta que coincida
con al menos un patrón. Los patrones SHALL interpretarse con esta traducción, aplicada antes del
anclaje:

- todo metacarácter de expresión regular excepto `*` y `?` SHALL tratarse como literal; `*` y `?`
  se expanden según sus wildcards;
- la secuencia `**/` SHALL traducirse a `(?:.*/)?`;
- la secuencia `/**` SHALL traducirse a `(?:/.*)?`;
- un `**` restante SHALL traducirse a `.*`;
- un `*` restante SHALL traducirse a `[^/]*`;
- un `?` restante SHALL traducirse a `[^/]`.

Las secuencias `**/` y `/**` SHALL consumirse antes que un `**` suelto. Un patrón que contiene
`**` SHALL quedar anclado en ambos extremos como `^...$`. Un patrón sin `**` SHALL conservar el
comportamiento existente: cada `*` se traduce a `[^/]*` y el patrón se ancla como prefijo con
`^(?:...)(?:/|$)`, de modo que el patrón `p` coincide con `p` y con `p/<resto>`, pero NO con
`p-<sufijo>`. Un `?` SHALL coincidir con exactamente un carácter que no sea `/` y NO SHALL lanzar
al compilarse.

`DEFAULT_IGNORES` y el `outputDir` del discovery NO SHALL cambiar su comportamiento. El estado
persistido SHALL conservar `version: 1` y `ruleVersion: 2` y NO SHALL incluir `schemaVersion`;
`schemaVersion: 2` es el schema de la salida JSON de `discovery --check` y no un campo del estado.
El writer y la forma del estado no cambian. La semántica de los patrones SHALL aplicarse sólo a la
lectura: un estado persistido que ya contiene rutas que ahora coinciden SHALL quedar `STALE` con
`impact: minor` una vez, sin migración ni reescritura del estado, siempre que el área de esas rutas
siga teniendo al menos una ruta incluida en el árbol actual; si un área pierde todas sus rutas
incluidas, SHALL regir la clasificación `material` por `area raiz eliminada` que ya define la
canónica. Tras la próxima regeneración las mismas rutas NO SHALL volver a producir `changedAreas`.

#### Scenario: `**/*.test.*` excluye archivos de test en la raíz y anidados

- **WHEN** `discovery.exclude` contiene `**/*.test.*` y el árbol tiene `a.test.js`,
  `src/b.test.js` y `test/specs-merge.test.js`
- **THEN** `sources` NO incluye ninguna de esas tres rutas
- **AND** `sources` conserva `src/foo.testjs` y `src/foo.tests.js`, que no contienen el segmento
  literal `.test.`

#### Scenario: `**/*.spec.*` excluye archivos de spec en la raíz y anidados

- **WHEN** `discovery.exclude` contiene `**/*.spec.*` y el árbol tiene `a.spec.js` y
  `src/nested/b.spec.ts`
- **THEN** `sources` NO incluye ninguna de esas dos rutas
- **AND** `sources` conserva `src/spec-utils.js`

#### Scenario: `**/__tests__/**` excluye el directorio en la raíz y anidado

- **WHEN** `discovery.exclude` contiene `**/__tests__/**` y el árbol tiene `__tests__/a.js` y
  `src/__tests__/b.js`
- **THEN** `sources` NO incluye ninguna de esas dos rutas
- **AND** `sources` conserva `src/__tests__-extra/c.js`

#### Scenario: `**/*.png` sigue excluyendo imágenes en la raíz y anidadas

- **WHEN** `discovery.exclude` contiene `**/*.png` y el árbol tiene `logo.png`,
  `assets/icon.png` y `src/a/b/deep.png`
- **THEN** `sources` NO incluye ninguna de esas tres rutas
- **AND** `sources` conserva `assets/icon.png.bak`

#### Scenario: Un patrón sin `**` conserva el comportamiento de prefijo

- **WHEN** `discovery.exclude` contiene `public` y `package-lock.json`
- **THEN** `sources` NO incluye `public`, `public/index.html` ni `package-lock.json`
- **AND** `sources` conserva `public-x/index.html` y `src/package-lock.json`

#### Scenario: Los lookalikes no matchean

- **WHEN** `discovery.exclude` contiene `public`, `documentation` y `**/__tests__/**`
- **THEN** `sources` conserva `public-x/index.html`, `documentation-extra/x.md`,
  `src/documentation/x.js` y `__tests__-extra/y.js`
- **AND** ninguna de esas rutas queda excluida por el patrón cuya forma se parece

#### Scenario: `?` matchea un solo carácter y no lanza

- **WHEN** `discovery.exclude` contiene `src/?.js` y se ejecuta `ancleto discovery`
- **THEN** `sources` NO incluye `src/a.js`
- **AND** `sources` conserva `src/ab.js` y `src/nested/a.js`
- **AND** el comando no lanza y su exit code es 0

#### Scenario: `**` intermedio cruza cero o más segmentos

- **WHEN** `discovery.exclude` contiene `dist/**/x.js` y el árbol tiene `dist/x.js` y
  `dist/a/b/x.js`
- **THEN** `sources` NO incluye ninguna de esas dos rutas
- **AND** `sources` conserva `src/x.js`

#### Scenario: Un commit test-only no produce el área `test` con un estado regenerado

- **WHEN** el estado persistido, con `version: 1` y `ruleVersion: 2`, se generó después de este
  cambio y el único cambio del repositorio es agregar `test/new-case.test.js`
- **THEN** `discovery --check` reporta `state: READY`, `impact: none` y `recommendedAction:
  continue`
- **AND** `changedAreas` y `materialReasons` están vacíos
- **AND** `changedAreas` NO contiene `test`

#### Scenario: Un estado previo al cambio queda `STALE`/`minor` una sola vez

- **WHEN** el estado persistido contiene en `sources` rutas que este cambio ahora excluye, el área
  de esas rutas sigue teniendo al menos una ruta incluida en el árbol actual, y se ejecuta
  `discovery --check` una vez
- **THEN** la salida reporta `state: STALE` e `impact: minor`
- **AND** `materialReasons` está vacío
- **AND** el estado persistido no se reescribe ni se migra, conserva `version: 1` y `ruleVersion: 2`,
  y tras regenerar el seed una corrida posterior reporta `state: READY`
