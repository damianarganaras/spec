# Proposal: MEM-04b — Resolver de refs navegables bajo demanda

## Problem

El primer corte de MEM-04 (0.18.0) ya **diagnostica** refs rotas: `inspectRefs` recorre los nodos
activos y el check `Refs de nodos activos` de `memory doctor` reporta cada `spec:`, `change:` o
`path:` que no resuelve. Pero no existe un **resolver utilizable en recall**: `resolveSpecRef` y
`resolveChangeRef` (`src/core/memory/engine.js`) devuelven `{ ok: true }` sin la ubicación concreta.
Quien recupera un nodo con refs sabe que la fuente existe, pero no dónde está: no puede navegar al
`spec.md` ni al directorio del change.

Esa carencia mantiene diferidos los goldens M04, M05 y M06 (`test/fixtures/memory/golden.json`),
que son exactamente los casos de "recuperar un nodo y llegar a su fuente". La provenance real ya
está medida: M04 apunta a `spec:prompt-contracts#Política de validaciones declarativa por
proyecto` (existe en `aspec/specs/prompt-contracts/spec.md:177`) y M05 a
`change:reingenieria-memoria-first` (existe en `aspec/changes/archive/2026-10-28-reingenieria-memoria-first/`).

## Proposed change

Exponer en `src/core/memory/engine.js` una única API read-only,
`resolveNodeRefs({ content, projectRoot })`, que parsea el bloque `refs:` del `content` de un nodo y
devuelve, por cada ref declarada, su ubicación concreta o un motivo acotado:

- `spec:<capability>#<heading>` → `path` del `spec.md` y el **texto real** del `### Requirement:`
  que matcheó.
- `change:<slug>` → `path` repo-relativo del directorio activo o del archive.
- `path:<ruta>` → `path` repo-relativo normalizado, sin sufijo `:linea`.
- `commit:`/`workitem:` → `verifiable: false`, sin ubicación.

La API reutiliza `parseRefsBlock` y `resolveRefResult`: no hay un segundo parser ni un segundo
resolvedor. `inspectRefs`, `validateRefsForWrite` y `doctor.js` no cambian.

Para activar los goldens sin tocar `seed.json` (que alimenta 26 tests del doctor que asumen "0
refs"), se agrega un seed separado y un root de resolución versionado, y el harness gana un modo
`expected.mode: "refs"` que verifica top-k y ubicación.

## Scope

In scope:

- `resolveNodeRefs({ content, projectRoot })` exportado desde `engine.js`, read-only, con guard de
  I/O por ref.
- Devolución de ubicación desde `resolveSpecRef`, `resolveChangeRef` y `resolvePathRef` sin alterar
  los campos ni los mensajes que consume el camino de escritura.
- Fixture versionado `test/fixtures/memory/refs-root/` con los cinco paths de resolución
  (un spec, un archive, dos archives del mismo slug y un change activo).
- Seed separado `test/fixtures/memory/golden-refs-seed.json` con tres nodos cuyos textos matchean
  las `query` existentes de M04/M05/M06.
- `golden.json`: M04, M05 y M06 pasan a `active` con `expected.mode: "refs"`.
- Harness: modo `refs`, siembra de ambos seeds con `importNodes`, allowlist actualizada y aserción
  de cinco activas.
- Tests de engine del resolver: ubicaciones, ambigüedad, sin raíz, gramática y error de I/O.

Out of scope (no-goals explícitos):

- `realpath` o containment de symlinks para `path:`; se conserva la validación léxica y de
  existencia del primer corte.
- Resolver `commit:` contra git o `workitem:` contra un tracker; no se invoca git ni red.
- Tabla o columna `memory_refs`, migración o cambio de DDL.
- Tool MCP nueva o cambio a la superficie de tools existente.
- Orden de recall task-aware de MEM-05 (requerido → ref → scope → bm25 → key).
- Cambios a `inspectRefs`, `validateRefsForWrite`, `doctor.js` o sus mensajes.
- Conteo de no verificables cuando hay rotas y captura de I/O en `inspectRefs`: ambas quedan en
  `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` §5.2.
- Cambios a `.opencode/**` o `agents/**`.

Paths autorizados del change:

- `src/core/memory/engine.js`
- `test/memory-engine.test.js`
- `test/memory-fixtures.test.js`
- `test/fixtures/memory/golden.json`
- `test/fixtures/memory/golden-refs-seed.json`
- `test/fixtures/memory/refs-root/**`
- `aspec/changes/mem-04b-resolver-referencias-navegables/**`
- `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` (sólo para marcar MEM-04 cerrado)

## Assumptions

- El llamador aporta la raíz: `resolveNodeRefs` no deriva el proyecto con `resolveProjectRoot`; el
  harness pasa `test/fixtures/memory/refs-root/` de forma explícita.
- El slug del change activo de la fixture es `refs-fixture-activo`, versionado bajo `refs-root`.
- `importNodes` valida schema y no valida refs, así que puede sembrar los tres nodos con `refs:`
  sin pasar por `recordNode`.
- Las tres `memory_key` del seed de refs no colisionan con las seis de `seed.json` y sus textos no
  contienen los términos de M01 ni de M07, para no alterar sus expectativas.

## Risks

- **El seed de refs altera el ranking de M01/M07.** Mitigación: claves disjuntas, contenido sin
  "tests", "repo", "comando", "AFIP" ni "facturación"; el harness valida M01 (top-3) y M07
  (abstención) junto con los nuevos casos.
- **El shape de `resolveNodeRefs` se congela de facto para MEM-05.** Mitigación: fijarlo ahora en
  `memory-engine` con campos nombrados y motivos de la taxonomía vigente; sólo se admiten
  extensiones aditivas.
- **El guard de I/O puede enmascarar un bug de resolución.** Mitigación: el motivo incluye el
  código del runtime (`lectura no disponible: <CODE>`) y no hay reintento ni fallback silencioso.
- **Los stubs de `refs-root` pueden derivar de los archivos reales.** Mitigación: son stubs de una
  línea; el caso sólo depende del path y del heading declarados, no de contenido real.
- **Agregar `path` a los `resolve*` puede filtrarse a los mensajes de escritura.** Mitigación:
  `validateRefsForWrite` sólo lee `ok`/`message`; los tests de MEM-03 siguen afirmando los mismos
  mensajes.
- **La normalización de `path:` con separadores `\` puede sorprender.** Mitigación: la spec fija
  salida con `/`, sin `./` redundante ni `:linea`, y sin `realpath`.

## Decisiones

- **memory_key:** `mem-04-resolver-expone-ubicacion`
  **Elección:** La API nueva es una sola función, `resolveNodeRefs({ content, projectRoot })`, en
  `src/core/memory/engine.js`; reutiliza `parseRefsBlock` y `resolveRefResult` y expone la
  ubicación resuelta de cada ref.
  **Descartado:** Crear un módulo `refs-resolver.js` con su propio parser y resolvedor, o exponer la
  resolución desde el test.
  **Justificación:** La gramática, la unicidad de `change:` y la canonicalización de headings ya
  viven en `engine.js` y están especificadas en `memory-engine`; duplicarlas crearía dos fuentes de
  verdad y el test dejaría de probar el código real. Un solo parser y un solo resolvedor es el
  mismo invariante que el primer corte fijó para el doctor.
  **Refs:** `change:mem-04b-resolver-referencias-navegables`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Resolución de refs change: con unicidad`
  **Estado:** aprobado

- **memory_key:** `mem-04-change-path-unico`
  **Elección:** Una ref `change:` que resuelve devuelve el path repo-relativo con separadores `/`
  del directorio resuelto: `aspec/changes/<slug>` o
  `aspec/changes/archive/YYYY-MM-DD-<slug>`.
  **Descartado:** Seguir devolviendo sólo `{ ok: true }`, o devolver el path absoluto del
  filesystem.
  **Justificación:** La unicidad y la ambigüedad ya están resueltas por `resolveChangeRef`; el
  valor que falta es la ubicación. Un path repo-relativo es estable entre máquinas y es lo que un
  recall necesita para navegar; el path absoluto filtraría el layout local y rompería la portabilidad
  del nodo.
  **Refs:** `change:mem-04b-resolver-referencias-navegables`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Resolución de refs change: con unicidad`
  **Estado:** aprobado

- **memory_key:** `mem-04-spec-path-heading`
  **Elección:** Una ref `spec:` que resuelve devuelve `aspec/specs/<capability>/spec.md` y el texto
  **real** del `### Requirement:` que matcheó, no su forma canónica. La resolución nunca usa FTS.
  **Descartado:** Devolver sólo la capability, devolver el heading canónico, o resolver por el
  índice FTS de `memory_nodes`.
  **Justificación:** El heading real es el ancla navegable y preserva mayúsculas, backticks y
  diacríticos que el usuario ve en el archivo; el canónico sólo sirve para comparar. FTS no contiene
  el contenido de los specs, así que no puede resolver esta ref.
  **Refs:** `change:mem-04b-resolver-referencias-navegables`; `path:src/core/memory/engine.js`;
  `spec:memory-engine#Resolución de refs spec: por heading canónico`
  **Estado:** aprobado

- **memory_key:** `mem-04-path-sin-realpath`
  **Elección:** Una ref `path:` se normaliza (separadores `/`, sin sufijo `:linea`) y se valida con
  la comprobación léxica y de existencia vigente; NO se resuelve con `realpath`.
  **Descartado:** Aplicar `realpath` y exigir containment de symlinks dentro de la raíz.
  **Justificación:** El camino de escritura ya fijó la validación léxica y el primer corte declaró
  el gap como no-goal en `memory-ops`; cambiar sólo el resolver abriría una divergencia entre
  validar y navegar, y ampliaría el alcance más allá de exponer la ubicación.
  **Refs:** `change:mem-04b-resolver-referencias-navegables`; `path:src/core/memory/engine.js`;
  `spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos`
  **Estado:** aprobado

- **memory_key:** `mem-04-commit-workitem-no-verificables`
  **Elección:** `commit:` y `workitem:` se devuelven con `verifiable: false` y sin ubicación; no se
  reportan como resueltos ni como rotos.
  **Descartado:** Invocar `git` para resolver el SHA o consultar un tracker por red.
  **Justificación:** No hay resolución local read-only en este corte y hoy son 0 refs reales;
  resolverlas exigiría procesos externos, red y permisos que el resolver no tiene. Marcarlas como
  rotas sería un falso positivo.
  **Refs:** `change:mem-04b-resolver-referencias-navegables`; `path:src/core/memory/engine.js`;
  `spec:memory-ops#Diagnóstico de refs no resueltas en nodos activos`
  **Estado:** aprobado

- **memory_key:** `mem-04-resolver-no-aborta-por-io`
  **Elección:** `resolveNodeRefs` atrapa por ref los errores de lectura y los reporta como
  `inválido (lectura no disponible: <CODE>)` sin abortar el nodo ni el resto de las refs.
  **Descartado:** Dejar que `readFileSync`/`readdirSync`/`statSync` propaguen y aborten la
  resolución, o arreglar la captura dentro de `inspectRefs`.
  **Justificación:** El resolver se invoca en recall, donde un `EACCES` o una race entre
  `existsSync` y la lectura no debe tumbar la recuperación completa. `inspectRefs` y
  `validateRefsForWrite` conservan su comportamiento y sus mensajes; la deuda de I/O del doctor
  sigue declarada en §5.2 y no entra en este change.
  **Refs:** `change:mem-04b-resolver-referencias-navegables`; `path:src/core/memory/engine.js`;
  `path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`
  **Estado:** aprobado

- **memory_key:** `mem-04-conteo-no-verificables-diferido`
  **Elección:** El conteo de refs `commit:`/`workitem:` cuando hay refs rotas queda en §5.2, sin
  cambios en este corte.
  **Descartado:** Extender ahora el `detail` con rotas para incluir el conteo de no verificables.
  **Justificación:** El delta de `memory-ops` vigente define ese conteo sólo para el `detail` sin
  rotas y el cambio de contrato no es necesario para exponer ubicaciones; hoy son 0 refs de esos
  tipos, así que no hay información que perder.
  **Refs:** `change:mem-04b-resolver-referencias-navegables`;
  `path:docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md`;
  `path:aspec/specs/memory-ops/spec.md`
  **Estado:** aprobado

- **memory_key:** `mem-04-golden-refs-seed-separado`
  **Elección:** Activar M04/M05/M06 con un seed propio
  `test/fixtures/memory/golden-refs-seed.json` y un root de resolución versionado
  `test/fixtures/memory/refs-root/`, ambos importados con el `importNodes` existente; `seed.json`
  no se toca.
  **Descartado:** Agregar los bloques `refs:` a los seis nodos de `seed.json`, o crear un loader de
  fixtures nuevo y un golden paralelo.
  **Justificación:** `seed.json` alimenta 26 tests del doctor que afirman "0 refs"; agregar refs ahí
  cambiaría sus expectativas y acoplaría dos suites con propósitos distintos. Un seed separado
  mantiene la base congelada y hace explícito qué casos necesitan resolución de refs.
  **Refs:** `change:mem-04b-resolver-referencias-navegables`;
  `path:test/fixtures/memory/golden.json`; `path:test/memory-fixtures.test.js`;
  `spec:memory-ops#Harness de regresión golden M01–M10`
  **Estado:** aprobado
