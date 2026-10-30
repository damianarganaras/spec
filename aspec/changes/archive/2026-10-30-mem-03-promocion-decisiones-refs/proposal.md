# Proposal: MEM-03 — promoción de decisiones, backfill de las 5 únicas y refs obligatorias

## Problema

El cierre de un change registra lecciones por juicio del rol que archiva: no hay una fuente
determinística que decida **qué** se promueve a `.ancleto/memory.db`, ni una regla que evite
invocar `@memory-keeper` cuando no hay nada que guardar. Además, las decisiones únicas de cinco
`design.md` históricos viven en un artifact que PR-4 elimina, y los nodos nuevos no están
obligados a declarar una fuente navegable: la auditoría reporta 62% de nodos activos sin salto
navegable y un DDL sin campo de referencias.

Resultado esperado: (a) al archivar se promueven sólo las decisiones duraderas y aprobadas
declaradas en `proposal ## Decisiones`, con cero escrituras y cero delegaciones cuando no hay
candidatos; (b) las cinco decisiones únicas quedan versionadas con su explicación completa y
promovidas con refs resolubles antes de que PR-4 elimine `design.md`; (c) todo nodo nuevo
capturado por una superficie de captura declara refs normalizadas y el motor rechaza la escritura
si faltan, si no resuelven o si el contenido huele a credencial.

## Alcance

Dentro:

- `src/core/memory/engine.js` — parseo y validación fail-closed de refs en `recordNode`, resolución
  de `change:` / `spec:` / `path:` contra el repositorio y rechazo de secretos.
- `agents/memory-keeper.md` — modo Promotion: escribe un nodo por decisión aprobada, con el bloque
  `refs:` en `content`; no inventa `memory_key`; se detiene ante contradicción o candidato de sesión.
- `skills/ancleto-archive/SKILL.md` — gate de promoción, preflight de lote, cero candidatos ⇒ cero
  escrituras y cero spawn, y estado "archivado, memoria pendiente" ante fallo.
- `skills/ancleto-bulk-archive/SKILL.md` — el mismo gate por change y agregación de cero spawn.
- `skills/ancleto-verify/SKILL.md` — no promueve `## Decisiones` (eso es del archive) y exige refs
  para el hallazgo durable que sí registre.
- `test/memory-engine.test.js` — tests T05, T06, T09, T21, T23 y T29 como predicates de
  comportamiento sobre el engine.
- `aspec/changes/mem-03-promocion-decisiones-refs/` — artifacts y delta specs.
- **Superficies requeridas adicionales (gap declarado): dos archivos de expansión.**
  - `test/mcp.test.js`: sus dos escrituras MCP (`prov-mcp`, `prov-forge`) no declaran refs y caen bajo
    la validación fail-closed.
  - `test/working-context.test.js`: sus ~10 escrituras pasan `{ source: 'test' }` por
    `createMemoryToolkit` → `tools.js` → `recordNode` sin refs; `'test'` no es `'runtime'`, así que la
    única exención no las cubre y caen bajo la misma validación.

  Sin actualizarlas, la validación fail-closed las rompe. Son las dos únicas expansiones necesarias
  fuera de la superficie declarada en la delegación; `test/memory-engine.test.js` ya está en alcance.

Fuera:

- Eliminar `design.md` o `context.md` del flujo nuevo (PR-4).
- Conformidad sin delta (PR-5).
- `importNodes`: conserva su semántica LWW actual (riesgo #10 del backlog); PR-3 no lo cambia.
- Tabla o columna nueva de refs (`memory_refs`), migración de schema y backfill masivo de los ~94
  nodos existentes.
- Idempotencia de `recordNode` (T20): PR propio.
- `agents/spec-writer.md` y `aspec/specs/prompt-contracts/spec.md` en lo relativo al shape de
  `## Decisiones`: se referencian, no se re-enuncian. El delta de `prompt-contracts` se limita al
  presupuesto de llamadas a memoria y a precisar, en el requirement canónico del proposal, que la
  equivalencia de forma no habilita la promoción.
- Editar `.opencode/**` a mano; los mirrors se regeneran con `ancleto upgrade`.
- Push, merge o tag.

## Riesgos

- **Superficie insuficiente declarada:** quedan rojos `test/mcp.test.js` (dos escrituras MCP) y
  `test/working-context.test.js` (~10 escrituras con `{ source: 'test' }`) si no se actualizan sus
  fixtures: `'test'` no está exento porque la única exención es `source === 'runtime'`. Mitigación: se
  declaran como las dos expansiones requeridas y tienen una task propia (5.1).
- **T20 no implementado:** un fallo a mitad de lote deja nodos escritos y el reintento supersede la
  misma `memory_key`, generando historial extra (nunca dos activos). Mitigación: preflight de lote
  completo antes de la primera escritura y estado "memoria pendiente" visible para reintento.
- **T06 y la mitad cross-key de T21 no son automatizables:** "cero spawn" y "dos `memory_key`
  distintas que se contradicen" no tienen salida observable en el engine. Mitigación: la parte
  determinística (forma de una línea sin `memory_key`, una sola activa por clave) se testea en
  `engine.js`; la parte de juicio queda como contrato de prompt declarado y explícitamente
  `No-testeable-por-construcción`, sin inventar un guard de literal (D-B).
- **`refs:` en prosa libre:** el bloque estructurado se delimita por la línea `refs:` al inicio de
  línea, seguida de una lista. Texto previo es contenido; una línea `refs:` suelta sin lista válida
  se rechaza en vez de ignorarse.
- **Gap de origen en la decisión 1:** el `design.md` de `cross-machine-export-import` no enuncia una
  alternativa descartada formal. Queda registrado como tal, sin inventar una alternativa.

## Delta spec

- `specs/memory-engine/spec.md` — 5 `ADDED`: refs normalizadas en el contenido, validación
  fail-closed en la captura, resolución de `change:`, resolución de `spec:`, rechazo de secretos; y
  1 `MODIFIED` de la frontera entre procedencia y enforcement.
- `specs/memory-ops/spec.md` — 2 `ADDED`: promoción al archivar sólo de decisiones duraderas
  aprobadas y backfill de las cinco decisiones únicas.
- `specs/prompt-contracts/spec.md` — 2 `MODIFIED`: el presupuesto de llamadas a memoria distingue
  Automatic Record (una llamada) de la promoción por decisión aprobada (una llamada por bloque); y el
  requirement del registro de decisiones declara que la equivalencia de forma no habilita la
  promoción.

## Decisiones

- **memory_key:** propuesta-forma-una-linea-no-promovible
  **Elección:** la forma de una línea (`decisión | alternativa descartada | por qué | fuente`) queda
  restringida a decisiones **no promovibles**: no tiene `memory_key` ni `Estado`, así que nunca se
  promueve a memoria. Sólo el bloque de seis campos con `memory_key` propia y `Estado: aprobado` es
  promovible.
  **Descartado:** derivar `memory_key` de forma determinística a partir del change (p. ej.
  `<slug>-d1`) para poder promover también la forma de una línea.
  **Justificación:** `memory_key` es identidad transversal y la supersesión opera por clave sin
  filtrar `type` ni `scope` (`src/core/memory/database.js:19-20`); una clave derivada del change no
  supersede la decisión equivalente escrita en otro change y viola la regla 4 de §5.7 (clave de
  dominio estable, sin ID paralelo). Restringir la forma es además fail-closed: ausencia de
  `memory_key` ⇒ no promovible, sin heurísticas.
  **Refs:** `change:mem-03-promocion-decisiones-refs`;
  `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`;
  `path:src/core/memory/database.js`
  **Estado:** aprobado

- **memory_key:** content-guard-hogar-y-predicados
  **Elección:** el shape de `## Decisiones` tiene su hogar canónico en `agents/spec-writer.md` y
  `aspec/specs/prompt-contracts/spec.md`; `skills/ancleto-archive` y `skills/ancleto-bulk-archive`
  sólo lo referencian. Los asserts de PR-3 son predicates de comportamiento sobre `engine.js`, no
  literales de oración; todo assert con literal que se agregue debe fallar con una mutación en
  scratch.
  **Descartado:** re-enunciar la redacción del shape en las skills de archive y fijarla con un
  content guard de literal.
  **Justificación:** el repo prohíbe que un prompt duplique texto normativo ya presente en su fuente
  canónica y que un guard fije la redacción literal; además la superficie de PR-3 no incluye
  `test/content-guards.test.js`, así que un guard de literal no tendría hogar legal en este change.
  **Refs:** `change:mem-03-promocion-decisiones-refs`; `path:agents/spec-writer.md`;
  `spec:prompt-contracts#Fuente única de las reglas compartidas entre skill y agente`;
  `spec:prompt-contracts#Asserts de comportamiento en los content guards`
  **Estado:** aprobado

- **memory_key:** export-bundle-layout
  **Elección:** el bundle portable es `manifest.json` + carpetas, legible y diff-able a mano, con
  salida a directorio `ancleto-export/` o `--tar`; para el MCP el manifiesto guarda sólo nombres y
  tipos de servers, nunca `command`/`args` con paths absolutos; `import` regenera las entradas con
  `buildDefaultMcp`/`resolveBin`/`resolveSelfCommand` y no pisa entradas sanas del destino.
  **Descartado:** implementarlo como comando markdown (`/cleto-transplant`) con la lógica adentro.
  Gap declarado: el `design.md` de origen no enuncia una alternativa descartada formal; sólo afirma
  que se implementa como subcomandos CLI reales porque requiere spawnear procesos y escribir config.
  **Justificación:** las rutas absolutas de una máquina no son portables; separar intención portable
  de resolución local es lo que permite que el MCP vuelva a spawnear en Linux tras exportar desde
  Windows. Evidencia de origen: `aspec/changes/archive/2026-09-30-cross-machine-export-import/design.md:5-19`.
  **Refs:** `change:cross-machine-export-import`; `path:src/cli/index.js`
  **Estado:** aprobado

- **memory_key:** antigravity-skills-dir
  **Elección:** `AGENT_SKILLS_DIR.antigravity` apunta a `.agents/skills`, con copia extra a
  `.agent/skills` sólo si ese directorio no existe (compatibilidad retro) y destino global
  `~/.gemini/antigravity/skills` para `install --global`.
  **Descartado:** conservar el valor previo `.antigravity/skills`; y cambiar el nombre del agente o
  el formato `SKILL.md`, que ya son estándar.
  **Justificación:** `.agents/skills` es la ruta que Antigravity escanea según su documentación
  oficial; mantener el valor viejo deja las skills `ancleto-*` invisibles en IDE y CLI. Evidencia de
  origen: `aspec/changes/archive/2026-09-30-fix-antigravity-skill-dir/design.md:5-18`.
  **Refs:** `change:fix-antigravity-skill-dir`; `path:src/cli/index.js`
  **Estado:** aprobado

- **memory_key:** openspec-legacy-agents-md-merge
  **Elección:** un solo helper `detectLegacyOpenSpec(projectDir)` usado por `init`,
  `install --project` y `upgrade`; el `AGENTS.md` de OpenSpec nunca se pisa en silencio (aviso y
  merge del estilo de los bloques `LOCKED`); una carpeta `openspec/` vacía o sin `changes/`/`specs/`
  con contenido es no-op silencioso.
  **Descartado:** reescribir la migración existente en vez de reutilizar su helper y su marcador; y
  pisar el `AGENTS.md` de OpenSpec.
  **Justificación:** un único helper elimina la divergencia entre los tres caminos de entrada, y el
  no-pisado evita destruir instrucciones que el proyecto origen ya tenía. Evidencia de origen:
  `aspec/changes/archive/2026-09-30-import-legacy-openspec/design.md:5-21`.
  **Refs:** `change:import-legacy-openspec`; `path:src/cli/index.js`
  **Estado:** aprobado

- **memory_key:** test-automation-profile-aspec-reuse
  **Elección:** el perfil de test vive versionado en `profiles/test/`; reutiliza `aspec/` cuando el
  proyecto ya lo usa y, si es test-only, crea `testspec/specs` + `testspec/changes` con el mismo
  formato de artifacts; los comandos `cleto-test-*` son markdown puro; el puente a un CLI externo
  (`npx @speckit/spectest`) es sólo opcional.
  **Descartado:** hacer del CLI externo una dependencia obligatoria, que rompe el contrato
  zero-dependencies del paquete.
  **Justificación:** el perfil agrega workflows de testing sin imponer una herramienta de terceros ni
  duplicar la estructura de artifacts. Evidencia de origen:
  `aspec/changes/archive/2026-09-30-test-automation-profile/design.md:5-19`.
  **Refs:** `change:test-automation-profile`; `path:profiles/test/templates/AGENTS.md`
  **Estado:** aprobado

- **memory_key:** orchestrator-session-start-file-cap
  **Elección:** un turno es un mensaje del usuario; el tope son cinco archivos nombrados por mensaje y
  el sexto se delega; la lectura por encima del tope y `git status --short` se delegan a
  `@technical-discovery`.
  **Descartado:** un tope acumulado por sesión (requiere estado que el prompt no tiene y degrada el
  presupuesto sin señal); y delegar esas lecturas a `@general`, `@coder`, `@reviewer`,
  `@memory-keeper`, `@tester`, `@documenter`, `@context-resolver` o `@spec-writer`, por no ser
  read-only o por no ser dueños de la orientación de repositorio.
  **Justificación:** el tope por mensaje es verificable desde el único mensaje que se está
  respondiendo, y `@technical-discovery` es el único agente read-only cuyo ownership es la
  orientación de repositorio. Evidencia de origen:
  `aspec/changes/archive/2026-10-26-orchestrator-session-start/design.md:16-69`.
  **Refs:** `change:orchestrator-session-start`; `path:agents/orchestrator.md`
  **Estado:** aprobado

- **memory_key:** refs-fail-closed-superficies-captura
  **Elección:** la validación fail-closed de refs se aplica a **toda** escritura que pasa por
  `recordNode`, con una única exención explícita: `context.source` exactamente `runtime` (default
  programático y fixtures). `cli:import` queda fuera porque no pasa por `recordNode` y conserva su
  LWW. Cualquier otro `source` se valida, incluida la superficie real de captura en producción
  `mcp:ancleto-memory` y `agent:<rol>` si el host lo provee.
  **Descartado:** enumerar una allowlist de superficies de captura (`mcp:ancleto-memory`,
  `tool:recordRule`, `tool:recordDecision`); un embedder nuevo con `source: 'agent:x'` quedaría
  exento sin que nadie lo decida (fail-open).
  **Justificación:** el engine resuelve la procedencia desde `context.source` con default `'runtime'`
  (`src/core/memory/engine.js:208`, `:219`) e ignora `input.source` (`:200-207`), así que la exención
  por valor exacto es la única condición que el caller no puede forjar. El MCP siempre pasa
  `source: 'mcp:ancleto-memory'` (`src/core/memory/mcp-server.js:16`), por lo que los defaults
  `tool:recordRule`/`tool:recordDecision` (`src/core/memory/tools.js:67`) no son superficies de
  producción. Invertir a exención explícita hace que lo no previsto se valide por defecto
  (fail-closed por construcción); `cli:import` (`engine.js:320`, `:337`) queda fuera por no pasar por
  `recordNode`, no por nombre.
  **Refs:** `change:mem-03-promocion-decisiones-refs`;
  `spec:memory-engine#Procedencia de escritura gestionada por el runtime`;
  `path:src/core/memory/engine.js`
  **Estado:** aprobado

- **memory_key:** promocion-preflight-de-lote
  **Elección:** el rol que archiva valida el lote completo de `## Decisiones` antes de la primera
  escritura: claves propias y únicas dentro del lote, `Estado: aprobado`, refs presentes y
  resolubles. Cualquier violación ⇒ 0 escrituras y reporte de cada bloque con su fuente.
  **Descartado:** escribir bloque por bloque y reportar los que quedaron pendientes al final.
  **Justificación:** sin T20, una escritura parcial no es idempotente y el reintento agrega historial;
  el preflight convierte un lote inválido en un no-op determinístico en vez de un estado a medias.
  **Refs:** `change:mem-03-promocion-decisiones-refs`;
  `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`
  **Estado:** aprobado

- **memory_key:** t21-deteccion-deterministica-de-contradiccion
  **Elección:** el motor sólo detecta de forma determinística la contradicción sobre la **misma**
  identidad: una `memory_key` con dos contenidos distintos deja una sola activa y conserva ambas en
  el historial, y un lote con dos bloques que comparten `memory_key` y difieren se rechaza entero. Dos
  `memory_key` distintas que se contradicen no se resuelven por similitud textual: se reportan con
  sus fuentes y se remiten a resolución humana o a `memory merge` si son duplicados.
  **Descartado:** detectar contradicciones cross-key con una heurística de similitud de contenido.
  **Justificación:** la identidad (`memory_key`) es el único eje determinístico disponible; una
  heurística semántica produciría falsos positivos (dos decisiones legítimas sobre el mismo change) y
  el plan prohíbe resolver conflictos por parecido textual.
  **Refs:** `change:mem-03-promocion-decisiones-refs`;
  `spec:memory-ops#Merge de nodos por supersesión`;
  `path:docs/PLAN_REINGENIERIA_FRAMEWORK_V2_MEMORIA_FIRST.md`
  **Estado:** aprobado

- **memory_key:** refs-raiz-desde-dbpath
  **Elección:** el motor resuelve la raíz del repositorio para validar refs desde `context.projectRoot`
  cuando la recibe y, si no, desde la ubicación de la `memory.db` (`.ancletorc` hacia arriba), nunca
  desde `process.cwd()`.
  **Descartado:** resolver desde `process.cwd()`; e importar `resolveMemoryProjectRoot` desde
  `working-context.js`, que crearía un ciclo de imports (`working-context` ya importa `engine`).
  **Justificación:** `process.cwd()` es exactamente el defecto que la verificación de refs debe
  evitar en fixtures y en el server MCP; la derivación desde la ruta de la base mantiene el
  aislamiento de los tests.
  **Refs:** `change:mem-03-promocion-decisiones-refs`;
  `path:src/core/memory/engine.js`;
  `spec:memory-engine#Raíz de proyecto del refresh disparado por MCP`
  **Estado:** aprobado

> Las once decisiones de este proposal quedaron aprobadas en el checkpoint del contrato y son
> promovibles.
