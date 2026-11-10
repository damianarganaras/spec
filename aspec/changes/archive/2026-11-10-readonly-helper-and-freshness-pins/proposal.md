# Proposal: Helper read-only único y pins de frescura de discovery

## Clasificación

**Conformidad.** Este change no introduce comportamiento nuevo: fija con tests el contrato ya
canónico de `spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check`
y consolida un helper de test duplicado. No hay delta de spec.

## Problema

`test/cli.test.js` mantiene tres walkers read-only casi idénticos:

- `projectSnapshot` (:92) — hoja en base64 string;
- `snapshotWithMtime` (:6498) — hoja `{ bytes, mtimeMs }`;
- `snapshotMtimes` (:8185) — hoja `` `${mtimeMs}:${base64}` ``.

La duplicación triplica la lógica de recorrido y de normalización de rutas, y permite que las tres
copias diverjan. Además, el Requirement de frescura define para `MISSING` y `PARTIAL` `impact: none`
con arreglos vacíos, pero los pins existentes (:6682-6710) sólo afirman `state`, `seedMapPresent` y
`affectedDocs`. Por último, el caso "existe `.discovery-state.json` pero no declara `hash`" —que el
spec trata como `STALE` material con arreglos vacíos— no tiene pin propio: los tests cercanos cubren
el archivo ausente (:6886) y `withHashes:false` (:6903), que son variantes distintas.

## Propuesta

Cambio **test-only** sobre `test/cli.test.js`, en tres frentes:

- **F1 — un solo walker.** Reemplazar los tres recorridos por una única función parametrizada por
  representación (`mode`). El valor por defecto conserva la hoja base64 string de `projectSnapshot`;
  `mode: 'mtime'` produce `{ bytes, mtimeMs }`; `mode: 'mtimeMs'` produce
  `` `${mtimeMs}:${base64}` ``. Se preservan el marcador de directorio `'<dir>'` y la normalización
  a `/`. Los 17 call sites de `projectSnapshot` y todos los pins read-only existentes quedan
  **sin editar**; sólo cambia la implementación interna del helper. No se unifican las formas de
  hoja.
- **F2 — completar pins de frescura.** Extender mínimamente los tests de `MISSING` y `PARTIAL` para
  afirmar `state`, `impact: 'none'`, los arreglos vacíos (`changedAreas`, `materialReasons`, `notes`,
  `affectedDocs`) y `seedMapPresent`. F2 **omite deliberadamente** `recommendedAction`: el código
  devuelve `generate`/`complete` (:2347-2356), mientras la regla general del spec asocia `continue` a
  `impact: none` (:574-575); fijarlo codificaría un oráculo no canónico que contradice el spec. No se
  re-pinea `READY`, ya cubierto (:6853-6884).
- **F3 — pin de estado sin `hash`.** Nuevo test para "el estado existe y no declara `hash`". El
  fixture debe escribir el estado **sin la clave `hash`** —`seedFixture` convierte `null` o
  `undefined` en un hash real (:6487)— y el test debe comprobar que el archivo de estado existe antes
  de ejecutar. Valores esperados, derivados del código: `state: 'STALE'`, `impact: 'material'`,
  `recommendedAction: 'regenerate'`, `changedAreas: []`, `materialReasons: []`, `notes: []`,
  `affectedDocs: []`.
- **Invariante discriminante de F1.** Un cambio sólo de `mtime` (patrón `utimesSync` ya usado en
  :3058-3089) debe alterar los modos que portan `mtime` y **no** el modo byte-only por defecto: es la
  prueba de que la parametrización no colapsó las representaciones.

## Garantías

**Cero cambio de runtime y de comportamiento.** El diff funcional se limita a `test/cli.test.js` más
los artifacts de este change:

- cero archivos bajo `aspec/specs/**`;
- sin superficie de producto (`agents/**`, `skills/**`, `commands/**`, `templates/**`);
- `ancleto upgrade` no es necesario.

Exclusiones explícitas:

- El comportamiento observable y el runtime de la CLI no cambian.
- El bump de versión es metadata de release y se maneja aparte (patch `0.26.2`); no forma parte de
  este change.

## Decisiones

- **memory_key:** test-readonly-snapshot-single-walker
  **Elección:** un único walker read-only parametrizado por `mode`, con hoja base64 string por
  defecto y variantes `mtime` / `mtimeMs` para los tres call sites originales.
  **Descartado:** mantener los tres walkers y factorizar sólo el recorrido de directorios.
  **Justificación:** el recorrido y la normalización de rutas son idénticos; una sola función elimina
  la deriva entre copias sin tocar ninguna aserción existente. Factorizar sólo el recorrido deja
  duplicada la parte que decide la representación de hoja, que es donde vive el riesgo de divergencia.
  **Estado:** aprobado
refs:
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
  - path:test/cli.test.js

- **memory_key:** discovery-freshness-pins-conformity-no-delta
  **Elección:** fijar `impact`, arreglos vacíos y el `recommendedAction` canónico (`regenerate` en el
  estado sin `hash`) de `MISSING`, `PARTIAL` y del estado sin `hash` como change de conformidad, sin
  delta de spec.
  **Descartado:** crear un delta que reescriba el Requirement de frescura.
  **Justificación:** el comportamiento ya es el canónico en `cli-diagnostics`; lo que falta es
  cobertura, no contrato. Un delta afirmaría un cambio de spec inexistente.
  **Estado:** aprobado
refs:
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
  - change:readonly-helper-and-freshness-pins

- **memory_key:** readonly-f3-must-omit-hash-key
  **Elección:** el pin de "estado sin `hash`" escribe el JSON de estado sin la clave `hash`, y
  verifica que el archivo exista antes de ejecutar el comando.
  **Descartado:** usar `hash: null` o `hash: undefined` en el fixture.
  **Justificación:** `seedFixture` evalúa `hash: hash || h.digest('hex')` (:6487), así que `null` o
  `undefined` producen un hash real y el test terminaría en `READY`, sin cubrir la variante. Omitir la
  clave es la única forma de alcanzar la rama `!stored?.hash`.
  **Estado:** aprobado
refs:
  - spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
  - path:test/cli.test.js

- **memory_key:** missing-partial-recommended-action-divergence
  **Elección:** omitir `recommendedAction` de los pins de `MISSING`/`PARTIAL` y no fijar los valores
  `generate`/`complete`.
  **Descartado:** fijar `recommendedAction` con el valor real del código, o resolver la divergencia
  con un delta MODIFIED del Requirement.
  **Justificación:** el código devuelve `generate`/`complete` (:2347-2356) mientras la asignación
  canónica (`none` → `continue`, :574-575) dice otra cosa; fijarlo codificaría un oráculo no canónico
  que contradice el spec, y resolverlo exige un delta MODIFIED más un release minor, fuera del alcance
  de este patch de conformidad.
  **Estado:** descartado

- **memory_key:** discovery-ready-empty-arrays-repin
  **Elección:** no volver a fijar `READY` con arreglos vacíos.
  **Descartado:** duplicar las aserciones de `READY` en el alcance de F2.
  **Justificación:** `READY` ya tiene pins completos (:6853-6884) con `impact`, `recommendedAction` y
  arreglos vacíos; repetirlos agrega ruido sin cobertura nueva.
  **Estado:** descartado

- **memory_key:** freshness-runtime-change-in-this-change
  **Elección:** no tocar `MATERIAL_FILE_RES`, `DEFAULT_IGNORES`, `areaOf` ni `computeImpact`.
  **Descartado:** ajustar esas piezas como parte de este change.
  **Justificación:** editarlas es un cambio de comportamiento (minor) y el Requirement lo declara
  explícitamente contractante; fijar sólo con tests es compatible con patch.
  **Estado:** descartado

## Riesgos

- Los tests de `MISSING`/`PARTIAL` **no** fijarán `recommendedAction`: el código devuelve
  `generate`/`complete` (:2347-2356), mientras el spec asocia `continue` a `impact: none` de forma
  global (:574-575). Fijarlo sería un oráculo no canónico; la divergencia queda documentada como
  decisión descartada y resolverla exige un delta MODIFIED y un release minor, fuera de este patch.
- El nuevo invariante por `mtime` depende de la resolución de timestamps del sistema de archivos;
  debe usar una fecha pasada fija, como el patrón existente, para evitar flakiness.
- La consolidación de F1 no debe alterar el orden de recorrido ni el marcador `'<dir>'`, o los 17
  `deepEqual` existentes fallarían.
