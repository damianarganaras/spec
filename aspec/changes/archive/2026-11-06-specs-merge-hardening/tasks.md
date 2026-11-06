# Tasks: Endurecimiento de `ancleto specs merge`

## 1. Resolución del change

- [x] 1.1 En `src/cli/index.js`, endurecer `resolveChangeDir` / `specsMergeCommand` para que
  `--change archive` y cualquier slug cuyo directorio activo resuelto sea el contenedor
  `aspec/changes/archive` salgan con exit code 2, sin escrituras, con un mensaje que nombre el slug o
  el contenedor; la detección usa identidad de path y no `proposal.md`. Aplicar también con
  `--dry-run`.

## 2. Parseo del delta

- [x] 2.1 En `src/core/specs-merge.js`, reemplazar el preámbulo H1 por la regla estructural: a lo sumo
  un H1 a columna 0 al inicio, blancos opcionales y la primera sección `## ` reconocida; un segundo H1
  o una línea no vacía y no H1 antes de esa sección produce error fail-closed. No usar allowlist
  literal de títulos.

## 3. Inserción ADDED

- [x] 3.1 En `src/core/specs-merge.js`, corregir `applyAdd` para que descarte los blancos finales
  re-incluidos y deje exactamente una línea en blanco entre el bloque insertado y la siguiente
  sección `## `; al final del archivo, el archivo termina con el salto de línea final del bloque y sin
  línea en blanco extra.

## 4. Tests de comportamiento

- [x] 4.1 En `test/specs-merge.test.js`, agregar el caso de contenedor `archive`: exit 2, cero
  escrituras (contenido y `mtime` intactos), mensaje que nombra el slug o el contenedor, y también con
  `--dry-run`.
- [x] 4.2 En `test/specs-merge.test.js`, agregar el caso de múltiples H1 o contenido no vacío antes de
  la primera sección: exit 2, cero escrituras.
- [x] 4.3 En `test/specs-merge.test.js`, agregar el caso que acepta las cuatro formas legacy de H1
  (`# Spec: X (delta)`, `# Delta Spec: X`, `# Spec delta: X — cap`, `# Delta: X — desc`) y las aplica
  normalmente.
- [x] 4.4 En `test/specs-merge.test.js`, agregar el assert de estructura exacta de la inserción
  `ADDED`: exactamente una línea en blanco antes de la siguiente sección; antes del EOF, el archivo
  termina con el salto de línea final del bloque y sin línea en blanco extra.
- [x] 4.5 En `test/specs-merge.test.js`, agregar el caso de `## RENAMED Requirements` vacío: exit 0,
  `changed:false` y `mtime` sin cambios.

## 5. Validación

- [x] 5.1 Correr la validación acotada declarada: `node --test test/specs-merge.test.js`.
- [x] 5.2 Correr `npm run lint`.
- [x] 5.3 Confirmar que no se modificó `package.json` ni ningún contrato fuera del alcance
  (`specs check`, `mergeLocked`, affected-set, memoria/seed).
