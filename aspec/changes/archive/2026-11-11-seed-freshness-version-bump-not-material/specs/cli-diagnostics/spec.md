## MODIFIED Requirements

### Requirement: Clasificación determinista de frescura del seed en discovery --check

`ancleto discovery --check` SHALL emitir un JSON con `schemaVersion: 2`, SHALL ser read-only y
SHALL salir con exit code 0 cuando completa. El campo `impact` SHALL pertenecer a
{`none`, `minor`, `material`} y SHALL calcularse con esta precedencia: `material` cuando
`materialReasons` no está vacío; en caso contrario `minor` cuando `changedAreas` o `notes` no están
vacíos; en caso contrario `none`. `recommendedAction` SHALL ser `regenerate` cuando `impact` es
`material` y `continue` cuando es `minor` o `none`, excepto cuando el estado es `MISSING` (que
reporta `generate`) o `PARTIAL` (que reporta `complete`), aun cuando su `impact` es `none`.

SHALL considerarse archivo material, anclado al repositorio, exactamente:

- `package.json`, sólo en la raíz (un `package.json` anidado NO SHALL ser material);
- `tsconfig.json` y `tsconfig.<sufijo>.json` (equivalente a la regex `^tsconfig(\..+)?\.json$`) y
  `jsconfig.json`;
- `(vite|webpack|rollup|next|nuxt|astro|svelte|tailwind).config.[cm]?[jt]s`;
- `docker-compose.yml` y `docker-compose.yaml`;
- `Dockerfile`;
- `index.html`;
- `src/(main|index).[cm]?[jt]sx?`, sólo en esa profundidad.

NO SHALL ser material ningún otro archivo, incluidos `package-lock.json` en la raíz y cualquier
`package.json` anidado. `discovery --check` SHALL ignorar los directorios `node_modules`, `.git` y
`dist` (`DEFAULT_IGNORES`) y el `outputDir` del discovery (`docs/technical-discovery` por defecto).

Como excepción a la regla anterior, el valor de la clave `version` de primer nivel del `package.json`
de la raíz NO SHALL contar como cambio de contenido ni como cambio material. Cualquier otro cambio en
ese archivo —por ejemplo `dependencies`, `scripts`, `engines`, `workspaces`, indentación, orden de
claves o una `version` anidada— SHALL seguir siendo material y SHALL reportar la razón exacta
`archivo material modificado: package.json`.

`areaOf` SHALL ser el primer segmento de la ruta. Un archivo en la raíz SHALL ser su propia área
(por ejemplo, `Dockerfile` → área `Dockerfile` y `NOTES.md` → área `NOTES.md`).

`computeImpact` SHALL comparar `stored.sources` y una vista efectiva de `stored.fileHashes` del
estado persistido con los archivos actuales, y SHALL producir en `materialReasons` únicamente estas
formas exactas:

- archivo material nuevo: `archivo material nuevo: <rel>`;
- archivo material eliminado: `archivo material eliminado: <rel>`;
- archivo material modificado: `archivo material modificado: <rel>`;
- área raíz nueva: `area raiz nueva: <área>`;
- área raíz eliminada: `area raiz eliminada: <área>`.

La vista efectiva de hashes SHALL usar el hash normalizado del `package.json` de la raíz cuando el
estado declara la regla normalizada, y el hash crudo persistido para el resto de los archivos. Esta
vista se construye antes de invocar `computeImpact`; `computeImpact`, `areaOf`, `isMaterialFile`,
`MATERIAL_FILE_RES` y `DEFAULT_IGNORES` NO SHALL cambiar su comportamiento.

`changedAreas` SHALL contener las áreas de altas, bajas y modificaciones detectadas sobre la vista
efectiva de hashes, ordenadas y deduplicadas. El orden y la cardinalidad de `materialReasons` y de
`notes` NO SHALL considerarse parte del contrato.

`notes` SHALL contener, sólo cuando el estado previo no tiene `fileHashes` y no hay
`changedAreas`, el texto exacto
`estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area`, y
ese caso SHALL forzar `impact: minor`.

El cálculo de `affectedDocs` NO SHALL ser redefinido por este Requirement: queda regido por el
Requirement existente de `discovery --check` sobre la presencia del seed-map.

El hash por archivo SHALL ser `sha256(content).digest('hex').slice(0,16)` y el hash global SHALL ser
el sha256 acumulado de `rel + '\0' + content.length + '\0' + content + '\n'`. Para el `package.json`
de la raíz, el `content` hasheado SHALL ser una normalización byte-preserving: SHALL reemplazarse
únicamente el valor del escape de la clave `version` de primer nivel por un centinela fijo,
preservando todos los demás bytes del archivo, incluidas la indentación, el orden de claves y las
`version` anidadas. Si el JSON no parsea, o `version` no es un string de primer nivel, SHALL
hashearse el contenido crudo. El mismo texto normalizado SHALL alimentar tanto el hash por archivo
como el hash global.

La estructura de estado SHALL ser: si faltan documentos esperados, `MISSING` (con
`recommendedAction: generate`) o `PARTIAL` (con `recommendedAction: complete`) con `impact: none` y
con `changedAreas`, `materialReasons`, `notes` y `affectedDocs` vacíos (`missingDocs` lista los
documentos faltantes); si están completos y el hash actual coincide con el hash persistido comparado
según la regla de hash declarada por el estado, `READY` con `impact: none` y arreglos vacíos; si no
existe `.discovery-state.json` o el estado no tiene `hash`, `STALE` con `impact: material`,
`recommendedAction: regenerate` y `changedAreas`, `materialReasons`, `notes` y `affectedDocs` vacíos,
sin atribuir materialidad por archivo ni por área.

El estado persistido SHALL conservar `hash` y `fileHashes` con los bytes crudos y SHALL declarar
`ruleVersion: 2` cuando fue generado con la regla normalizada, junto con
`semantic: { hash, fileHashes }`, donde `semantic.fileHashes` contiene sólo las entradas cuyo hash
normalizado difiere del crudo (la del `package.json` de la raíz, cuando aplica) y `semantic.hash` es
el hash global normalizado. El lector SHALL usar `semantic.hash` y las entradas de
`semantic.fileHashes` cuando `ruleVersion` es `2` y el bloque `semantic` tiene forma válida
(`hash` string y `fileHashes` objeto no-array). Un estado con `ruleVersion: 2` cuyo bloque
`semantic` no tenga esa forma SHALL compararse con la regla cruda, igual que cualquier otro
estado, incluido un estado legacy sin `ruleVersion`, byte-idéntico al comportamiento previo.

El comando NO SHALL modificar ningún archivo del proyecto. En particular, `discovery --check` NO
SHALL escribir ni regenerar el seed, el estado ni el `seed-map.json`, y NO SHALL migrar ni reescribir
estados legacy.

Estas reglas son el contrato observable de `discovery --check`. El estado declara la regla de hash
con la que fue generado y los estados sin declaración conservan el comportamiento previo, por lo que
un cambio en la regla de hash NO SHALL alterar el significado de los `.discovery-state.json` ya
persistidos. Un cambio en `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `isMaterialFile`, `areaOf` o
`computeImpact` sí cambia el comportamiento del comando y SHALL reflejarse en este Requirement.

#### Scenario: Un cambio no material en un área existente es minor

- **WHEN** el estado persistido está completo y se modifica un archivo existente no material dentro
  de un área existente, por ejemplo `src/app.js` o `package-lock.json` de la raíz
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `materialReasons` es `[]`
- **AND** `changedAreas` contiene el área afectada (`src` o `package-lock.json`, respectivamente),
  ordenada y sin duplicados

#### Scenario: Bump de version con lock y CHANGELOG reflejados es minor sin materialidad

- **WHEN** el único cambio es el valor de la clave `version` de primer nivel del `package.json` de la
  raíz, reflejado en `package-lock.json` y `CHANGELOG.md`
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `materialReasons` es `[]` y no incluye ninguna razón de materialidad para `package.json`
- **AND** `changedAreas` contiene las áreas de los archivos realmente modificados
  (`package-lock.json` y `CHANGELOG.md`) y no incluye `package.json` por el bump de `version`

#### Scenario: Bump de version como único cambio del árbol deja el estado READY

- **WHEN** el único cambio en el árbol es el valor de la clave `version` de primer nivel del
  `package.json` de la raíz, sin otros archivos modificados
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `materialReasons`, `changedAreas` y `notes` quedan vacíos

#### Scenario: Un archivo material nuevo o modificado en un campo distinto de version es material con la razón exacta

- **WHEN** se agrega un archivo material nuevo, por ejemplo `src/index.ts`, o se modifica un archivo
  material existente en un campo distinto de la clave `version` de primer nivel, por ejemplo el
  `package.json` de la raíz cambiando `dependencies`
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye la razón exacta `archivo material nuevo: src/index.ts` o
  `archivo material modificado: package.json`, según el caso

#### Scenario: Un bump de version junto con un cambio real sigue siendo material

- **WHEN** el valor de la clave `version` de primer nivel del `package.json` de la raíz cambia junto
  con otro campo del mismo archivo, por ejemplo `scripts` o `dependencies`
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material modificado: package.json`

#### Scenario: Un reformateo del package.json sin cambiar version es material

- **WHEN** se reformatea el `package.json` de la raíz, por ejemplo cambiando la indentación de dos a
  cuatro espacios, sin cambiar el valor de la clave `version` de primer nivel
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material modificado: package.json`

#### Scenario: Un cambio en una version anidada es material

- **WHEN** cambia una clave `version` anidada del `package.json` de la raíz, por ejemplo
  `config.version`, sin cambiar la `version` de primer nivel
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material modificado: package.json`

#### Scenario: Un archivo material eliminado es material

- **WHEN** se elimina un archivo material, por ejemplo `Dockerfile`, cuyo árbol de archivos produce
  también la desaparición de su área de raíz
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `archivo material eliminado: Dockerfile` y puede incluir además
  `area raiz eliminada: Dockerfile`
- **AND** la cantidad y el orden de las razones no se prometen

#### Scenario: Un área raíz nueva por un archivo raíz no material es material

- **WHEN** se agrega en la raíz un archivo no material, por ejemplo `NOTES.md`, que crea un área que
  antes no existía
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `area raiz nueva: NOTES.md`

#### Scenario: Un área raíz eliminada es material

- **WHEN** desaparece un área de raíz porque se elimina su último archivo, por ejemplo `lib/x.js`
  como única entrada del área `lib`
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye `area raiz eliminada: lib`

#### Scenario: Los archivos ignorados y el outputDir no afectan el estado

- **WHEN** se agrega un archivo cubierto por `DEFAULT_IGNORES`, por ejemplo `dist/x.js`, o un archivo
  dentro de `docs/technical-discovery/` (el `outputDir` del discovery)
- **THEN** la salida reporta `state:READY`, `impact:none` y `recommendedAction:continue`
- **AND** `materialReasons`, `changedAreas` y `notes` quedan vacíos

#### Scenario: MISSING y PARTIAL recomiendan generar o completar

- **WHEN** faltan todos o parte de los documentos esperados del seed
- **THEN** la salida reporta `state:MISSING` con `recommendedAction:generate`, o `state:PARTIAL` con
  `recommendedAction:complete`, según el caso
- **AND** `impact` es `none` y `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son `[]`

#### Scenario: Sin estado persistido el resultado es material con arreglos vacíos

- **WHEN** no existe `.discovery-state.json` o el estado existente no declara `hash`
- **THEN** la salida reporta `state:STALE`, `impact:material` y `recommendedAction:regenerate`
- **AND** `changedAreas`, `materialReasons`, `notes` y `affectedDocs` son todos `[]`
- **AND** el comando NO SHALL atribuir materialidad por archivo ni por área

#### Scenario: Sin fileHashes previos el resultado es minor con la nota exacta

- **WHEN** el estado previo no tiene `fileHashes` y, tras cambiar contenido, no hay áreas detectables
  por hashes
- **THEN** la salida reporta `impact:minor` y `recommendedAction:continue`
- **AND** `notes` contiene el texto exacto
  `estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area`

#### Scenario: Un estado persistido sin ruleVersion conserva el comportamiento previo

- **WHEN** el estado persistido no declara `ruleVersion: 2` (estado legacy)
- **THEN** la comparación usa la regla cruda, byte-idéntica al comportamiento previo
- **AND** un estado legacy que sólo difiere en el valor de `version` de primer nivel del
  `package.json` de la raíz sigue reportando `impact:material` y `recommendedAction:regenerate`
- **AND** el comando no migra ni reescribe el estado, y los archivos del proyecto quedan idénticos

#### Scenario: Version no-string o JSON inválido se hashea crudo

- **WHEN** el `package.json` de la raíz no parsea como JSON, o su clave `version` de primer nivel no
  es un string
- **THEN** el contenido se hashea crudo, sin normalización
- **AND** si el contenido difiere del persistido, la salida reporta `impact:material` y
  `recommendedAction:regenerate`, con `archivo material modificado: package.json` en
  `materialReasons`

#### Scenario: discovery --check no modifica archivos

- **WHEN** se ejecuta `ancleto discovery --check` sobre un proyecto con seed y estado persistidos
- **THEN** los bytes y el `mtime` de los archivos del proyecto, incluidos el seed, el estado y el
  `seed-map.json`, quedan idénticos antes y después
- **AND** el exit code es 0 y la salida sigue siendo JSON con `schemaVersion: 2`
