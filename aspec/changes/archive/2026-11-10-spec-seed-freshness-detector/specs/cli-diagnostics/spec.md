## ADDED Requirements

### Requirement: Clasificación determinista de frescura del seed en discovery --check

`ancleto discovery --check` SHALL emitir un JSON con `schemaVersion: 2`, SHALL ser read-only y
SHALL salir con exit code 0 cuando completa. El campo `impact` SHALL pertenecer a
{`none`, `minor`, `material`} y SHALL calcularse con esta precedencia: `material` cuando
`materialReasons` no está vacío; en caso contrario `minor` cuando `changedAreas` o `notes` no están
vacíos; en caso contrario `none`. `recommendedAction` SHALL ser `regenerate` cuando `impact` es
`material` y `continue` cuando es `minor` o `none`.

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

`areaOf` SHALL ser el primer segmento de la ruta. Un archivo en la raíz SHALL ser su propia área
(por ejemplo, `Dockerfile` → área `Dockerfile` y `NOTES.md` → área `NOTES.md`).

`computeImpact` SHALL comparar `stored.sources` y `stored.fileHashes` del estado persistido con los
archivos actuales, y SHALL producir en `materialReasons` únicamente estas formas exactas:

- archivo material nuevo: `archivo material nuevo: <rel>`;
- archivo material eliminado: `archivo material eliminado: <rel>`;
- archivo material modificado: `archivo material modificado: <rel>`;
- área raíz nueva: `area raiz nueva: <área>`;
- área raíz eliminada: `area raiz eliminada: <área>`.

`changedAreas` SHALL contener las áreas de altas, bajas y modificaciones detectadas por hashes,
ordenadas y deduplicadas. El orden y la cardinalidad de `materialReasons` y de `notes` NO SHALL
considerarse parte del contrato.

`notes` SHALL contener, sólo cuando el estado previo no tiene `fileHashes` y no hay
`changedAreas`, el texto exacto
`estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area`, y
ese caso SHALL forzar `impact: minor`.

El cálculo de `affectedDocs` NO SHALL ser redefinido por este Requirement: queda regido por el
Requirement existente de `discovery --check` sobre la presencia del seed-map.

La estructura de estado SHALL ser: si faltan documentos esperados, `MISSING` o `PARTIAL` con
`impact: none` y arreglos vacíos; si están completos y `stored.hash` coincide, `READY` con
`impact: none` y arreglos vacíos; si no existe `.discovery-state.json` o el estado no tiene `hash`,
`STALE` con `impact: material`, `recommendedAction: regenerate` y `changedAreas`,
`materialReasons`, `notes` y `affectedDocs` vacíos, sin atribuir materialidad por archivo ni por
área.

El comando NO SHALL modificar ningún archivo del proyecto. En particular, `discovery --check` NO
SHALL escribir ni regenerar el seed, el estado ni el `seed-map.json`.

Estas reglas son el contrato observable de `discovery --check`: un cambio en `MATERIAL_FILE_RES`,
`DEFAULT_IGNORES`, `isMaterialFile`, `areaOf` o `computeImpact` cambia el comportamiento del comando
y el significado de los `.discovery-state.json` ya persistidos.

#### Scenario: Un cambio no material en un área existente es minor

- **WHEN** el estado persistido está completo y se modifica un archivo existente no material dentro
  de un área existente, por ejemplo `src/app.js` o `package-lock.json` de la raíz
- **THEN** la salida reporta `state:STALE`, `impact:minor` y `recommendedAction:continue`
- **AND** `materialReasons` es `[]`
- **AND** `changedAreas` contiene el área afectada (`src` o `package-lock.json`, respectivamente),
  ordenada y sin duplicados

#### Scenario: Un archivo material nuevo o modificado es material con la razón exacta

- **WHEN** se agrega un archivo material nuevo, por ejemplo `src/index.ts`, o se modifica un archivo
  material existente, por ejemplo el `package.json` de la raíz
- **THEN** la salida reporta `impact:material` y `recommendedAction:regenerate`
- **AND** `materialReasons` incluye la razón exacta `archivo material nuevo: src/index.ts` o
  `archivo material modificado: package.json`, según el caso

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

#### Scenario: discovery --check no modifica archivos

- **WHEN** se ejecuta `ancleto discovery --check` sobre un proyecto con seed y estado persistidos
- **THEN** los bytes y el `mtime` de los archivos del proyecto, incluidos el seed, el estado y el
  `seed-map.json`, quedan idénticos antes y después
- **AND** el exit code es 0 y la salida sigue siendo JSON con `schemaVersion: 2`
