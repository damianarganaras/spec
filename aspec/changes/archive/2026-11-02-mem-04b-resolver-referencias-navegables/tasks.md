# Tasks: MEM-04b — Resolver de refs navegables bajo demanda

> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint` y tests
> `npm test`; para pasos acotados, `node --test` con rutas explícitas.
>
> Las fixtures de la fase 2 son **datos versionados**, no código: stubs de una línea y un JSON con
> el mismo formato de `exportActive()`. No hay loader nuevo.

## Fase 1 — Engine: exponer la ubicación y la API nueva

- [x] T1.1 En `resolveChangeRef`, devolver `{ ok: true, path }` en el caso único, con `path`
      repo-relativo del directorio resuelto y separadores `/`. Agregar `relative` al import de
      `node:path`. No tocar las ramas de cero coincidencias ni de ambigüedad.
- [x] T1.2 En `resolveSpecRef`, devolver `{ ok: true, path, heading }` en el caso único: `path`
      `aspec/specs/<capability>/spec.md` con separadores `/` y `heading` el texto real capturado del
      `### Requirement:` que matcheó (no el canónico). No tocar las ramas de cero coincidencias ni de
      ambigüedad.
- [x] T1.3 En `resolvePathRef`, devolver `{ ok: true, path }` en el caso válido: normalizar el path
      **antes** del chequeo de existencia — colapsar `[\\/]+` a `/`, quitar segmentos `.`, unir con
      `/` —, quitar el sufijo `:\d+` y conservar la validación léxica de absolutos y `../` y la
      verificación de existencia posterior. Sin `realpath`.
- [x] T1.4 Agregar `resolveNodeRefs({ content, projectRoot })` en `engine.js` y exportarlo. Debe
      usar `parseRefsBlock` y `resolveRefResult`, preservar el orden declarado y devolver por ref
      `ref`, `kind`, `verifiable`, más `ok` y ubicación (`path`, `heading` cuando aplique) o `ok:
      false` con `reason` de la taxonomía por ref: `inexistente`, `ambiguo (<n> coincidencias)`,
      `inválido (<causa>)` (path absoluto, `../` o lectura no disponible) o `sin raíz`. El defecto
      de gramática del bloque no es `reason` por ref: va en los campos raíz `error` (línea inválida)
      y `blocks` (más de un bloque `refs:`), con `refs: []`. `no verificable` no es `reason`: se
      expresa con `verifiable: false`.
- [x] T1.5 En `resolveNodeRefs`, cubrir los bordes: `commit:`/`workitem:` con `verifiable: false` y
      sin ubicación ni `reason`; `needsRoot: true` sólo si hay refs verificables y no hay raíz, sin
      reportar falla; defecto de gramática del bloque como `refs: []` con el defecto expuesto en
      campos raíz (`error` para la línea inválida y `blocks` para más de un bloque `refs:`), sin
      lanzar; captura por ref de errores de lectura con `err.code`, sin abortar las demás.
- [x] T1.6 Verificar que `inspectRefs` y `validateRefsForWrite` no cambian: conservan sus campos,
      sus mensajes y su semántica fail-closed, y que `doctor.js` no se modifica.

## Fase 2 — Fixtures versionadas

- [x] T2.1 Crear el árbol `test/fixtures/memory/refs-root/` con exactamente cuatro paths versionados:
      `aspec/specs/prompt-contracts/spec.md` (con un único
      `### Requirement: Política de validaciones declarativa por proyecto`),
      `aspec/changes/archive/2026-10-28-reingenieria-memoria-first/proposal.md`,
      `aspec/changes/archive/2026-01-01-permisos-bash/proposal.md` y
      `aspec/changes/archive/2026-02-02-permisos-bash/proposal.md`. Cada `proposal.md` es un stub de
      una línea. No incluir `aspec/specs/memory-ops/spec.md` ni
      `aspec/changes/resolver-refs-activo/` por no tener uso.
- [x] T2.2 Crear `test/fixtures/memory/golden-refs-seed.json` con tres nodos en formato
      `exportActive()` (`memory_key`, `type`, `content`, `justification`, `scope`, `createdAt`):
      uno con `refs:` a `spec:prompt-contracts#Política de validaciones declarativa por proyecto`,
      uno con `refs:` a `change:reingenieria-memoria-first` y uno con `refs:` a
      `change:permisos-bash`. Sus claves no deben colisionar con `seed.json` y sus textos deben
      matchear las `query` existentes de M04/M05/M06 sin contener términos de M01 ni de M07.
- [x] T2.3 Actualizar `test/fixtures/memory/golden.json`: M04, M05 y M06 pasan a `active` con
      `expected.mode: "refs"`. M04 con `k: 3` y la ref `spec` esperada (path + heading); M05 con la
      ref `change` esperada (path del archive); M06 con la ref `change` esperada
      (`reason` `ambiguo (2 coincidencias)` y sin path). No cambiar las `query`.
- [x] T2.4 Confirmar que `test/fixtures/memory/seed.json` queda intacto y sin bloques `refs:`.

## Fase 3 — Harness golden

- [x] T3.1 En `createFixture`, sembrar la base congelada con `seed.json` y, para los casos con refs,
      con `golden-refs-seed.json`, ambos con el `importNodes` existente. Sin loader nuevo y sin leer
      `.ancleto/memory.db` viva.
- [x] T3.2 Extender `goldenOutcome` con `expected.mode: "refs"`: buscar por la `query`, tomar el
      top-`k`, obtener el `content` del nodo esperado con la superficie de lectura existente y
      resolverlo con `resolveNodeRefs` contra el root versionado `refs-root/`.
- [x] T3.3 Extender `assertGoldenEntry`: exigir las `memory_keys` esperadas en el top-`k` y comparar
      `path`, `heading` o `reason` de la ref esperada según el caso; cuando se espera `reason`, la ref
      no debe traer `path` ni `heading`. Un modo desconocido, una ref esperada ausente o una
      comparación sin resultado deben fallar, nunca saltarse.
- [x] T3.4 Actualizar la allowlist explícita del test a `['M02','M03','M08','M09','M10']` y la
      aserción de activas a `['M01','M04','M05','M06','M07']`.
- [x] T3.5 Derivar la ruta de `refs-root/` desde `import.meta.url`, sin depender de
      `process.cwd()`.

## Fase 4 — Tests del engine

- [x] T4.1 Agregar un `describe` propio para el resolver en `test/memory-engine.test.js`.
      Reutilizar los helpers de root temporales existentes (`withRefsEngine`, `seedChange`,
      `seedFile`, `seedSpec`), promoviéndolos a scope de módulo si hace falta. Sin duplicar helpers
      y sin un segundo parser ni un segundo resolvedor en el test.
- [x] T4.2 Cubrir `change:` activo y `change:` archivado único: `ok: true` con el path
      repo-relativo esperado.
- [x] T4.3 Cubrir `spec:` con heading canónico: `ok: true` con el path del `spec.md` y el texto real
      del heading del archivo.
- [x] T4.4 Cubrir `spec:` ambiguo y `change:` ambiguo: `ok: false`, `reason`
      `ambiguo (N coincidencias)`, sin `path` ni `heading`; y cero coincidencias sin abortar las
      demás refs del nodo.
- [x] T4.5 Cubrir `path:` con backslash real (en hosts no-Windows) y con `./docs//note.md:12`:
      path normalizado con `/` y sin el sufijo `:linea`.
- [x] T4.6 Cubrir `commit:` y `workitem:`: `verifiable: false`, sin ubicación y sin reportarse como
      resueltas ni rotas.
- [x] T4.7 Cubrir la invocación sin `projectRoot`: `needsRoot: true`, sin ubicaciones y sin fallas.
- [x] T4.8 Cubrir bloque `refs:` repetido y bloque con item inválido: `refs: []` y el defecto
      expuesto en campos raíz (`blocks` con más de un bloque `refs:`, `error` con la línea inválida),
      ninguna excepción y sin entradas por ref.
- [x] T4.9 Cubrir el error de lectura con un caso determinístico: un `spec.md` que es directorio
      provoca `EISDIR`; la entrada debe devolver `inválido (lectura no disponible: EISDIR)` y las
      demás refs del nodo deben resolverse.

## Fase 5 — Cierre documental y validación declarada

- [x] T5.1 En `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` §5.2, marcar MEM-04 cerrado por este
      change y dejar constancia de que la captura de I/O de `inspectRefs` y el conteo de no
      verificables con rotas siguen como deuda.
- [x] T5.2 Correr el lint declarado: `npm run lint`.
- [x] T5.3 Correr los tests acotados con rutas explícitas:
      `node --test test/memory-engine.test.js test/memory-fixtures.test.js`.
- [x] T5.4 Correr la suite declarada completa: `npm test` (727 tests: 723 ok, 4 skip preexistentes).
- [x] T5.5 Verificar que M01 (top-3) y M07 (abstención) siguen verdes con el seed de refs agregado.
