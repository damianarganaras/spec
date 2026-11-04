# Proposal: Integridad del tier `gratis` en agentes primarios y del `import`

## Problem

Tres defectos de integridad comparten la misma raíz: el estado que el CLI escribe no siempre queda
coherente con lo que después inspecciona.

**1. Modelo gratis sobre un agente primario.** `applyTier` (`src/cli/index.js:593-602`) reemplaza
`model:` sin leer el `mode:` del frontmatter, y `checkAgentsFrontmatter`
(`src/cli/index.js:2988-3117`) tampoco lo inspecciona. El tier `gratis` resuelve los diez agentes a
`GRATIS_FALLBACK_MODEL` (`src/core/tier-models.js:6`), pero el primario canónico declara
`mode: primary` (`agents/orchestrator.md:3`) y los otros nueve `mode: subagent`. Instalar `gratis`
deja al primario con un modelo free, estado en el que OpenCode puede responder
`403 free tier can only be used from within OpenCode`. La semántica de "modelo gratis conocido" ya
tiene dueño (`isKnownGratisModel`, `src/core/tier-models.js:113-115`); falta el predicado que cruza
modelo con modo y los dos avisos que lo hacen visible.

**2. `import` no registra las rutas que escribe.** `importCmd` (`src/cli/index.js:4145-4264`) llama
`writeManifest` primero (`:4207-4214`) sin `installedPaths`; el default del manifiesto es
`{templates:[],agents:[],commands:[],skills:[]}` (`:143`). Después, `installAgentAssets` (`:4236`)
devuelve los directorios escritos (`:1167`) pero el resultado se descarta. En un destino fresco el
`check` posterior itera arreglos vacíos (`:2904-2919`) y pasa de forma vacía — el test existente
(`test/cli.test.js:1204-1216`) lo confirma. El default vacío no es un problema teórico: `export`
copia `.ancletorc` verbatim al bundle (`src/cli/index.js:4121`), así que el `.ancletorc` del bundle
arrastra los `installedPaths` de la máquina origen y copiarlos produciría faltantes falsos en el
destino.

**3. Requirements solapados.** `aspec/specs/agent-model-tiers/spec.md` tiene dos requirements que
reenuncian las mismas obligaciones de integridad de IDs: "Snapshot de catálogo verificado y guard de
disponibilidad de IDs" (`:392`) e "Integridad de los IDs declarados contra el snapshot" (`:739`). La
regla de escritura del script de refresco aparece dos veces (`:409-415` vs `:767-771`), al igual que
la cobertura del guard (`:405-407`/`:431-436` vs `:761-765`/`:805-812`).

## Proposed change

Tres cambios acotados, uno de ellos sólo de coherencia documental:

- **A. Aviso advisory de modelo gratis sobre un agente primario.** Nuevo predicado puro
  `freeTierOnPrimary(model, mode)` en `src/core/tier-models.js` (dueño de tiers y del modelo gratis).
  `applyTier` avisa por `stderr` cuando el modelo objetivo es free y el frontmatter existente declara
  `mode: primary`; `checkAgentsFrontmatter` agrega una entrada advisory con la misma condición sobre
  el agente instalado. Nunca bloquea, nunca cambia el modelo escrito, nunca cambia el exit code.
- **B. `import` registra `installedPaths`.** El manifiesto pasa a escribirse después de los assets
  que registra y con `unionInstalledPaths(<destino>, <escrito por este import>)` para las cuatro
  claves. Nunca copia `installedPaths` del bundle.
- **D(i). Consolidación de los dos requirements solapados** con `MODIFIED Requirements`, conservando
  ambos headings y dejando como autoritativa la regla estricta de `--write` (pre-validar IDs
  declarados y abortar antes de escribir).

## Scope

En alcance:

- Predicado `freeTierOnPrimary(model, mode)` y su export en `src/core/tier-models.js`.
- Aviso no bloqueante en `applyTier` (set-time) y en `checkAgentsFrontmatter` (inspect-time).
- Registro de `installedPaths` por `import` y su no-regresión (`--repair`, `.ancleto-tier`, MCP,
  `doctor`, `export`).
- Consolidación de los dos requirements de `agent-model-tiers` sin cambio de comportamiento.
- Un párrafo en `README.md` sobre el tier `gratis` y los agentes primarios.
- Tests nuevos y refuerzo del test vacío de `import`.

Fuera de alcance:

- Bloquear `install`/`check` o reescribir el modelo de un primario cuando el tier es `gratis`.
- Detectar overrides `opencode.json → agent.<nombre>.model` (son invisibles para ancleto).
- Assert de runtime para la invariante `TIERS.minimo[agente] === TIER_CHAINS.minimo[agente][0]`
  (rechazado; ver Decisiones).
- Corregir la deriva de la versión `0.18.8` en artefactos locales (diferido; ver Backlog).
- Cambiar `export` o el formato del bundle.

## Capability ownership

El delta de `import` se escribe en `project-portability` y no en las otras dos capabilities que
nombran "import":

- `legacy-import` cubre la migración de un proyecto OpenSpec externo (`openspec/` → `aspec/`), no el
  comando `import` de bundles.
- `agent-install-routing` es dueño de la semántica general del manifiesto ("Manifiesto veraz y
  acumulativo de las rutas de instalación", `:101`).
- `project-portability` es dueño del comando `import` ("Import regenera MCP locales", "Import con
  repair").

Por eso el delta nuevo vive en `project-portability`, se limita a la obligación específica de
`import` y referencia la semántica de `agent-install-routing` en lugar de reenunciarla.

## Risks

- **El `check` posterior al `import` deja de ser vacuo.** Al poblarse `installedPaths`, un bundle
  producido por otra versión puede exponer faltantes u huérfanos reales que antes quedaban ocultos.
  Es el comportamiento correcto, pero es un cambio observable.
- **Orden de la escritura del manifiesto.** `writeManifest` relee el `.ancletorc` vigente
  (`src/cli/index.js:135-147`), así que reescribirlo después de los assets no pierde claves previas;
  la reubicación literal sí exige verificar que nada entre `installAgentAssets` e
  `installProfileOverlay` dependa de que el manifiesto ya exista.
- **Aviso en `stderr`.** `applyTier` usa `console.warn`; wrappers de CI que tratan `stderr` como
  error verán el texto, pero el exit code sigue siendo 0.
- **Detección parcial por diseño.** Un override `opencode.json → agent.<nombre>.model` puede cambiar
  el modelo efectivo sin tocar el frontmatter; el mensaje debe decir "puede", nunca garantizar el
  403.
- **Deriva de versión diferida.** `.ancletorc.version` y `.ancleto/machine-env.md` siguen en `0.18.8`
  porque son artefactos locales gitignored; no se corrige por código en este change.

## Decisiones

- **memory_key:** gratis-free-tier-primary-advisory-nonblocking

  **Elección:** aviso advisory no bloqueante en set-time (`applyTier`, `stderr`) e inspect-time
  (`check`, salida de avisos), con un predicado puro `freeTierOnPrimary(model, mode)` que cruza
  modelo gratis con `mode: primary` y vive en `src/core/tier-models.js`.

  **Descartado:** bloquear `install`/`check` cuando el tier `gratis` toca un primario, o traducir
  automáticamente ese agente a un modelo pago.

  **Justificación:** el 403 depende del runtime de OpenCode y de overrides `opencode.json →
  agent.<nombre>.model` invisibles para ancleto; bloquear rompería instalaciones válidas y el
  contrato de exit de `check` (`missing > 0 ? 1 : 0`). El aviso hace visible el riesgo sin cambiar
  el comportamiento ni el estado escrito.

  **Refs:**
  - spec:agent-model-tiers#Aviso advisory de modelo gratis sobre un agente primario
  - spec:agent-model-tiers#Aplicación de tier idempotente y no-op sobre la canónica
  - path:src/core/tier-models.js
  - path:src/cli/index.js
  - path:src/core/adapters/frontmatter.js
  - path:agents/orchestrator.md
  - path:test/cli.test.js
  - change:ch-14-tier-gratis-import-integrity

  **Estado:** aprobado

- **memory_key:** import-installed-paths-union-not-copy

  **Elección:** `import` calcula `unionInstalledPaths(<installedPaths del destino>, <rutas escritas
  por este import>)` para `templates|agents|commands|skills` y escribe el manifiesto después de las
  escrituras de assets que registra.

  **Descartado:** copiar o heredar `installedPaths` del `.ancletorc` del bundle; dejar el default
  vacío y confiar en el `check` vacuo.

  **Justificación:** `export` copia `.ancletorc` verbatim (`src/cli/index.js:4121`), así que sus
  rutas describen la máquina origen; `check` itera `installedPaths` (`:2904-2919`), por lo que
  copiarlas produce faltantes falsos y dejarlas vacías oculta el layout real. La unión preserva el
  historial multi-host y describe sólo lo escrito localmente.

  **Refs:**
  - spec:project-portability#import registra las rutas instaladas que escribe
  - spec:agent-install-routing#Manifiesto veraz y acumulativo de las rutas de instalación
  - path:src/cli/index.js
  - path:aspec/specs/project-portability/spec.md
  - path:test/cli.test.js
  - change:ch-14-tier-gratis-import-integrity

  **Estado:** aprobado

- **memory_key:** spec-consolidation-preserve-headings

  **Elección:** consolidar los dos requirements solapados con `MODIFIED Requirements`, conservar
  ambos headings y dejar la regla estricta de `--write` (pre-validar los IDs declarados y abortar
  antes de cualquier escritura) como la única enunciación autoritativa.

  **Descartado:** usar `REMOVED Requirements` para fusionar todo en un solo heading.

  **Justificación:** eliminar un heading puede romper refs `spec:` existentes y `change:` de nodos de
  memoria; la consolidación es de coherencia documental y no cambia comportamiento.

  **Refs:**
  - spec:agent-model-tiers#Snapshot de catálogo verificado y guard de disponibilidad de IDs
  - spec:agent-model-tiers#Integridad de los IDs declarados contra el snapshot
  - path:aspec/specs/agent-model-tiers/spec.md
  - change:ch-14-tier-gratis-import-integrity

  **Estado:** aprobado

- **memory_key:** tier-chain-head-no-runtime-assert

  **Elección:** mantener la invariante `TIERS.minimo[agente] === TIER_CHAINS.minimo[agente][0]`
  cubierta por `test/agent-model-coherence.test.js:67-77` y por el guard estructural de la spec, sin
  assert en runtime.

  **Descartado:** agregar un assert a nivel de módulo en `src/core/tier-models.js`.

  **Justificación:** `TIER_CHAINS` sólo existe para `minimo` (`src/core/tier-models.js:58-62`); un
  assert genérico lanzaría para `normal` y `gratis`, y rompería los seams puros
  `resolveTierModels`/`declaredModelIds`, que aceptan `tiers`/`chains` inyectados. La invariante ya
  es verdadera para los diez agentes y ya está asertada, incluida la cobertura de conjuntos
  (`test/agent-model-coherence.test.js:79-81`).

  **Refs:**
  - spec:agent-model-tiers#Guard estructural de coherencia entre canónica, tier minimo y catálogo
  - path:test/agent-model-coherence.test.js
  - path:src/core/tier-models.js
  - change:ch-14-tier-gratis-import-integrity

  **Estado:** aprobado

## Backlog

- **D(ii) — Deriva de versión en artefactos locales.** `0.18.8` vive sólo en `.ancletorc.version` y
  `.ancleto/machine-env.md`, ambos gitignored y sellados contra el `package.json` del paquete que
  ejecuta el CLI. Se corrige corriendo `node src/cli/index.js upgrade`, no con un cambio de código.
  Diferido: fuera del alcance de este change.
