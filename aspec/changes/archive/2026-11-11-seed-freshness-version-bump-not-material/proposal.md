# Proposal: Bump de version no material para la frescura del seed

## Problem

`ancleto discovery --check` clasifica cualquier modificación del `package.json` de la raíz como
`archivo material modificado: package.json`. Por eso un repositorio cuyo único cambio sea el bump de
`version` (reflejado en `package-lock.json` y `CHANGELOG.md`) queda `STALE` con
`impact: material` y `recommendedAction: regenerate`, aunque la arquitectura no cambió: la clave
`version` es metadata de release. La regeneración del seed sigue siendo parte del checklist de
release, pero no debería dispararse por el bump solo.

Además, los `.discovery-state.json` persistidos guardan hashes sin declarar con qué regla se
calcularon. Cambiar la regla de hash sin declararla en el estado cambiaría el significado de los
estados ya guardados y rompería el rollback a un CLI anterior.

## Proposed change

Eximir del cálculo de frescura únicamente el valor de la clave `version` de primer nivel del
`package.json` de la raíz, mediante una normalización byte-preserving del contenido hasheado. El
`package.json` sigue siendo archivo material: cualquier otro campo (dependencias, scripts, `engines`,
`workspaces`, indentación, `version` anidadas) sigue produciendo `impact: material` con la razón
exacta `archivo material modificado: package.json`.

El estado pasa a declarar la regla de hash de forma aditiva: conserva `hash` y `fileHashes` crudos y
agrega `ruleVersion: 2` con `semantic: { hash, fileHashes }`. Los estados sin `ruleVersion: 2` se
comparan con la regla cruda, byte-idéntico al comportamiento actual.

Release objetivo: MINOR `0.27.0`. Cambiar las reglas de frescura invalida los hashes persistidos sin
versión de regla, por lo que el change exige un delta `MODIFIED` sobre `cli-diagnostics` y un release
minor. El bump de versión y la regeneración del seed no se hacen en este change.

## Scope

In scope:

- Delta `MODIFIED` del Requirement `Clasificación determinista de frescura del seed en discovery --check`
  en `aspec/changes/seed-freshness-version-bump-not-material/specs/cli-diagnostics/spec.md`, con
  cuerpo y todos los scenarios reescritos.
- Normalizador byte-preserving y segundo acumulador de hash en `src/cli/index.js`.
- Escritura aditiva del estado (`ruleVersion: 2` + `semantic`) en `packDiscovery`.
- Vista efectiva de hashes en `checkDiscovery`; `computeImpact`, `areaOf`, `MATERIAL_FILE_RES` y
  `DEFAULT_IGNORES` quedan sin cambios.
- Fixture parametrizable y pins discriminantes en `test/cli.test.js`.
- Guard fail-closed para `spec.md` de changes activos en rutas no canónicas en
  `test/delta-spec-structure.test.js`.

Out of scope:

- Exclusión de `.ancleto/**` o de `.discovery-map.json` de `sources` (queda pendiente, ver D5).
- Materialidad de `package-lock.json` y `CHANGELOG.md` (no se tocan; su cambio aporta áreas → `minor`).
- Bump de versión del paquete (va en el release).
- Regeneración del seed (`ancleto discovery`).

## Decisiones

- **memory_key:** seed-freshness-version-bump-not-material
  **Elección:** El valor de la clave `version` de primer nivel del `package.json` de la raíz no cuenta como cambio material ni como cambio de contenido para `discovery --check`. `package.json` sigue siendo archivo material: un cambio en cualquier otro campo (dependencias, scripts, engines, workspaces) sigue produciendo `impact: material` con la razón exacta `archivo material modificado: package.json`. `package-lock.json` y `CHANGELOG.md` no se tocan (ya no son materiales; su cambio aporta áreas → `minor`).
  **Descartado:** Sacar `package.json` de `MATERIAL_FILE_RES` (perdería la señal de un cambio real de dependencias); ignorar archivos completos de lock/CHANGELOG (demasiada pérdida de señal); aplicar la exención en `computeImpact` comparando contenido previo (el estado no guarda contenido previo, sólo hashes).
  **Justificación:** La clave `version` es metadata de release, no arquitectura; los hashes persistidos no permiten distinguir "sólo cambió version" a posteriori, así que la distinción debe hacerse en el hash.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- path:src/cli/index.js
- path:test/cli.test.js
  **Estado:** aprobado

- **memory_key:** discovery-state-hash-rule-additive
  **Elección:** La normalización del hash se materializa de forma aditiva en `.discovery-state.json`: se conservan `hash` y `fileHashes` con los bytes crudos (contrato previo intacto) y se agrega `ruleVersion: 2` + `semantic: { hash, fileHashes }` (sólo las entradas normalizadas). El lector nuevo prefiere `semantic` cuando `ruleVersion === 2`; cualquier otro estado se compara crudo, byte-idéntico al comportamiento actual. `computeImpact`/`areaOf`/`MATERIAL_FILE_RES`/`DEFAULT_IGNORES` quedan sin cambios: el lector construye una vista efectiva de hashes antes de llamar a `computeImpact`.
  **Descartado:** Reemplazar `hash`/`fileHashes` por los normalizados con `version: 2` (un CLI anterior compararía crudo contra normalizado y reportaría `material` — rompe rollback); reinterpretar `version` (mismo problema); migrar estados en `--check` (el comando es read-only por contrato).
  **Justificación:** Garantía exigida: la nueva regla sólo puede reducir materialidad, nunca aumentarla; ningún repo sano con estado persistido debe pasar a `STALE`/`material` por el cambio de regla.
  **Refs:**
- change:seed-freshness-version-bump-not-material
- path:src/cli/index.js
- path:test/cli.test.js
  **Estado:** aprobado

- **memory_key:** seed-freshness-version-normalization-byte-preserving
  **Elección:** La normalización del `package.json` de la raíz reemplaza únicamente el valor del escape de la clave `version` de primer nivel por un centinela fijo, preservando todos los demás bytes del archivo (incluidos indentación, orden de claves y `version` anidadas). Si el JSON no parsea, o `version` no es un string de primer nivel, se hashea crudo (dirección segura). El mismo texto normalizado alimenta el hash por archivo y el hash global.
  **Descartado:** `JSON.parse` + `JSON.stringify` (canonicaliza el archivo: un reformateo pasaría a ser no-material, excediendo la aprobación); regex global sobre el texto (tomaría `version` anidadas).
  **Justificación:** La aprobación cubre sólo el bump de `version`; un reformateo o un cambio en `config.version` no deben dejar de ser materiales.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- path:src/cli/index.js
- path:test/cli.test.js
  **Estado:** aprobado

- **memory_key:** active-change-noncanonical-delta-guard
  **Elección:** `test/delta-spec-structure.test.js` gana un guard fail-closed que falla cuando existe un `spec.md` bajo un change activo en una ruta distinta de `specs/<capability>/spec.md`. Reutiliza el mismo oráculo y los mismos helpers del archivo (`parseDeltaSpec`, `withRoot`, `writeDelta`); no crea un segundo oráculo ni toca `src/`.
  **Descartado:** Extender el merge o el guard de producción (el defecto es del artefacto, no del runtime; un guard de test lo detecta antes de archivar sin cambiar comportamiento); diferirlo (el gap es real y offline-testeable).
  **Justificación:** El merge y el guard leen sólo `aspec/changes/<change>/specs/<capability>/spec.md`; un `spec.md` mal ubicado es invisible para ambos y se perdería en el archive sin aviso.
  **Refs:**
- spec:spec-sync#Validación estructural de delta specs de changes activos
- path:test/delta-spec-structure.test.js
- path:src/cli/index.js
  **Estado:** aprobado

- **memory_key:** seed-freshness-ancleto-area-deferred
  **Elección:** No se implementa en este change ninguna exclusión de `.ancleto/**` ni de `.discovery-map.json` en `sources`; se reporta como pendiente. `.ancleto/memory.db`, `-wal` y `-shm` están en `sources` y mutan con cualquier operación de memoria, así que cada operación deja el seed en `STALE`/`minor`.
  **Descartado:** Incluirlo acá (fuera de la aprobación literal, que cubre sólo el bump de `version`).
  **Justificación:** La aprobación de producto es explícita y acotada; ampliarla sin nueva aprobación sería una distorsión de scope.
  **Refs:**
- change:seed-freshness-version-bump-not-material
- path:src/cli/index.js
- path:aspec/backlog.md
  **Estado:** aprobado

## Riesgos

- Rollback del estado: un CLI anterior que lea un `.discovery-state.json` nuevo debe comportarse igual;
  se mitiga preservando `hash` y `fileHashes` crudos y sólo agregando `semantic`, sin reinterpretar
  `version`.
- Pins existentes: los tests actuales de `discovery --check` pinan `materialReasons` y
  `changedAreas`; los nuevos pins discriminantes deben convivir con ellos y actualizar el caso de
  `package.json` modificado para que use un campo distinto de `version`.
- Delta mergeado: `ancleto specs merge` reemplaza cuerpo y scenarios del Requirement afectado; un
  scenario no reescrito en este delta se pierde. El delta reescribe todos los scenarios vigentes más
  los nuevos.
- La normalización sólo puede reducir materialidad; si el regex de la clave `version` falla en un
  `package.json` no estándar, se cae a hash crudo (dirección segura, no oculta cambios).
