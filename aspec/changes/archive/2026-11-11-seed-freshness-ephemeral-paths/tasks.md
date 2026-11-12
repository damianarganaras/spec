# Tasks: Rutas efímeras fuera de la frescura del seed

> Change funcional. Release **MINOR 0.28.0**. Sin `design.md`.
> Todas las tareas quedan abiertas; nada se marca como hecho en este change.

## 1. Implementación — lector de frescura

- [x] 1.1 Agregar `isEphemeralSource(rel)` en `src/cli/index.js`, anclado a la ruta completa:
      `rel === '.discovery-map.json'` (sólo raíz), `rel === '.ancleto'` o `rel.startsWith('.ancleto/')`.
      NO debe coincidir con `.ancletorc`, `.ancleto-notes.md` ni `src/ancleto/x.js`.
- [x] 1.2 En `checkDiscovery` (`src/cli/index.js`), filtrar simétricamente `stored.sources` y las
      `sources` actuales con `isEphemeralSource` antes de construir el argumento de `computeImpact`,
      de modo que ni las altas ni las bajas efímeras produzcan `changedAreas` ni razones
      `area raiz nueva`/`area raiz eliminada`.
- [x] 1.3 Mantener `storedFileHashes`/`currentFileHashes` como mapas completos (sin filtrar): el
      bucle de comparación recorre las `sources` filtradas y las claves efímeras nunca se iteran.
- [x] 1.4 Extender el oráculo de `READY` en `checkDiscovery` (`src/cli/index.js:2505`): cuando
      `storedHash !== currentHash`, calcular un diff por archivo sobre los mapas completos y conceder
      `READY`/`none`/`continue` sólo si hay al menos una ruta cambiada (alta, baja o contenido
      distinto) y todas son efímeras. Con cero rutas cambiadas, no excusar.
- [x] 1.5 Preservar el caso legacy sin `fileHashes`: sin atribución posible, sigue `STALE` minor con
      `materialReasons: []` y la nota exacta existente; nunca material ni `READY` por esta regla.
- [x] 1.6 No modificar `packDiscovery` ni la forma del estado: se sigue escribiendo
      `{ version: 1, generatedAt, sources, fileHashes, hash, ruleVersion: 2, semantic, packTokens }`
      con los campos crudos intactos. Sin `ruleVersion: 3`, sin configuración nueva, sin hash
      derivado.

## 2. Tests — pins en `test/cli.test.js`

- [x] 2.1 Pin: estado `ruleVersion: 2` sano con entradas efímeras en `sources`/`fileHashes` y churn
      sólo en ellas → `state:READY`, `impact:none`, `recommendedAction:continue`,
      `changedAreas:[]`, `materialReasons:[]`, `affectedDocs:[]` y cero escrituras (bytes + `mtime`).
- [x] 2.2 Pin: el mismo estado con churn efímero **más** un cambio real en `src/app.js` →
      `STALE` minor con `changedAreas` exactamente `['src']`.
- [x] 2.3 Pin: archivo efímero nuevo `.ancleto/memory.db-wal` ausente del estado → `READY`
      con arreglos vacíos.
- [x] 2.4 Pin: desaparece el área `.ancleto` completa → `READY`, sin
      `area raiz eliminada: .ancleto` ni `area raiz eliminada: .discovery-map.json`.
- [x] 2.5 Pin: estado legacy `version: 1` sin `fileHashes` con churn sólo efímero → `STALE` minor,
      `materialReasons:[]`, `changedAreas:[]` y la nota exacta
      `estado previo sin hashes por archivo: el cambio de contenido no se puede atribuir a un area`.
- [x] 2.6 Pin: el pin de hash desincronizado (`test/cli.test.js:7081`) sigue `STALE`/`none`/
      `continue` con arreglos vacíos; ajustar sólo si el fixture necesita rutas efímeras.
- [x] 2.7 Pin de anclaje: `.ancletorc`, `.ancleto-notes.md` y `src/ancleto/x.js` NO son efímeros; un
      cambio en cada uno reporta su área (`.ancletorc`, `.ancleto-notes.md`, `src`) en
      `changedAreas`.
- [x] 2.8 Pin: se elimina un archivo material `Dockerfile` mientras una ruta efímera también cambia
      → `impact:material` con `archivo material eliminado: Dockerfile`.

## 3. Validación

- [x] 3.1 Ejecutar `npm run lint` (comando declarado).
- [x] 3.2 Ejecutar `npm test` (comando declarado); para el acotado, pasar la ruta explícita
      `test/cli.test.js`.
- [x] 3.3 Registrar omisiones: format check `not-configured` (sin formatter declarado); typecheck no
      aplica (JavaScript ESM, sin `tsconfig.json`).
- [x] 3.4 Verificar que ningún pin existente cuyo fixture no tenga rutas efímeras cambió de
      resultado (`READY`/`STALE`, impactos y razones).

## 4. Diferido (no implementar en este change)

- [ ] 4.1 Deuda abierta: pin offline de `packDiscovery` (sigue diferido).
- [ ] 4.2 Diferido: exclusiones adicionales de `docs/`, `aspec/`, `documentation/` y logs de
      auditoría; lista de ignore del pack de Repomix; reconciliación de `docs/PLAN...` y
      `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` (sólo nota mínima si el ítem vive ahí).
