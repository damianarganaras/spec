# Tasks: Helper read-only único y pins de frescura de discovery

> Change de conformidad. Sin delta de spec y sin cambio de runtime. Todo el trabajo toca
> `test/cli.test.js`; los artifacts del change son la otra única escritura.

## 1. Consolidar los tres walkers read-only en uno parametrizado por `mode`

**Archivo:** `test/cli.test.js`

- Reemplazar los cuerpos de `projectSnapshot` (:92), `snapshotWithMtime` (:6498) y `snapshotMtimes`
  (:8185) por una única función de recorrido parametrizada por representación.
- Modo por defecto: hoja base64 string (contrato actual de `projectSnapshot`).
- `mode: 'mtime'`: hoja `{ bytes, mtimeMs }`.
- `mode: 'mtimeMs'`: hoja `` `${mtimeMs}:${base64}` ``.
- Conservar el marcador de directorio `'<dir>'` y la normalización de separadores a `/`.
- Mantener los tres nombres/llamadas existentes sin editar sus hojas esperadas; los 17 call sites de
  `projectSnapshot` y todos los `deepEqual` read-only quedan intactos.
- Agregar un invariante discriminante: tras `utimesSync` sobre un archivo (patrón de :3058-3089,
  fecha pasada fija), el modo byte-only por defecto no cambia y los modos con `mtime` sí.

**Verificación:** los call sites de `projectSnapshot` no aparecen modificados en el diff; el nuevo
test falla si los modos `mtime`/`mtimeMs` no observan el cambio de `utimes` y falla si el modo por
defecto lo observa.

## 2. Extender los pins de `MISSING` y `PARTIAL`

**Archivo:** `test/cli.test.js`

- En el test `PARTIAL` (:6682) agregar `assert.equal(j.impact, 'none')`,
  `assert.deepEqual(j.changedAreas, [])`, `assert.deepEqual(j.materialReasons, [])`,
  `assert.deepEqual(j.notes, [])` y `assert.deepEqual(j.affectedDocs, [])`; conservar las aserciones
  existentes de `state` y `seedMapPresent`.
- En el test `MISSING` (:6697) agregar las mismas aserciones.
- **No** afirmar `recommendedAction`: el código devuelve `generate`/`complete` (:2347-2356) y la regla
  general del spec (`none` → `continue`, :574-575) es distinta; fijarlo codificaría un oráculo no
  canónico.
- Extender esos tests en sitio; no agregar casos duplicados ni re-pinear `READY`.

**Verificación:** ambos tests fallan si `impact` o cualquiera de los cuatro arreglos diverge de los
valores del código (:2346-2356); `recommendedAction` no se afirma.

## 3. Nuevo pin para estado existente sin `hash`

**Archivo:** `test/cli.test.js`

- Crear un test que prepare un seed completo y escriba `.discovery-state.json` **sin la clave
  `hash`** (no `hash: null` ni `hash: undefined`, porque `seedFixture` los convierte en hash real en
  :6487).
- Antes de ejecutar `discovery --check`, afirmar que el archivo de estado existe y que el objeto
  parseado no contiene la clave `hash`.
- Afirmar: `state: 'STALE'`, `impact: 'material'`, `recommendedAction: 'regenerate'`,
  `changedAreas: []`, `materialReasons: []`, `notes: []`, `affectedDocs: []`.
- Mantener el test separado del caso "archivo ausente" (:6886) y de `withHashes:false` (:6903).

**Verificación:** el test falla si el fixture termina en `READY` (señal de que el hash se filtró) o
si alguno de los siete campos esperados diverge.

## 4. Validación

**Archivos:** `test/cli.test.js` (sin cambios adicionales)

- Lint declarado: `npm run lint`.
- Tests acotados: `node --test test/cli.test.js`.
- Suite declarada: `npm test` (`node --test "test/*.test.js"`), acotada por el glob declarado en
  `PRODUCT.md`.

Entorno declarado: Windows PowerShell 5.1. Si un comando falla por entorno, reportar el shell y el
comando textual en lugar de reintentar con otra sintaxis.

## Fuera de alcance

- Bump de versión, tag y publish (metadata de release, se maneja aparte; patch `0.26.2`).
- Archivo del change.
- Cualquier edición bajo `aspec/specs/**` o superficie de producto.
