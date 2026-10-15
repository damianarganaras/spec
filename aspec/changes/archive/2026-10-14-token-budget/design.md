# Design: Presupuesto de tokens de los prompts

## Approach

El change aplica un principio de **ownership único**: cada regla, directiva o contrato vive en una sola superficie canónica y el resto la referencia. Sobre ese principio se montan tres palancas de ahorro (dedupe, destilado, compresión condicional) y una corrección de comportamiento (día-cero). Todo recorte queda gobernado por una **mesura reproducible**: no se acepta un recorte que degrade la calidad del flujo.

Decisiones tomadas con el usuario:

- **caveman:** default ON con **uso condicional host-scoped** y compuerta de medición (si no baja el neto en la ventana de observación, vuelve a opt-in). Postura: "ahorro máximo".
- **Día-cero:** opción (a) — materializar el working-context con la topología aunque no haya DB ni reglas.

Convenciones del repo que condicionan el diseño: **zero-deps de runtime**, **multi-host** (`opencode` default, `claude`, `copilot`, `antigravity`), `content-guards.test.js` fija literales de los prompts y **debe actualizarse en el mismo change**, y **no breaking** para proyectos usuarios.

## Architecture

### 1. Dedupe del orquestador (`agents/orchestrator.md`)

- **Runtime Safety:** hoy en `:30-40` y re-declarada en `:262-270`. Hogar único: la sección de reglas de enforcement (cabecera del archivo). La sección de Workflow conserva sólo el punto de control ("antes de una etapa que escribe, verificá el modo") **sin repetir la regla**.
- **Expected output from `@X`:** hoy el orquestador re-enumera los campos de cada subagente (`:324-393`). Cada agente ya declara su `## Output Expectations`. El orquestador pasa a **referenciar** el contrato del agente y a declarar sólo lo que agrega el tramo (p.ej. el orden de uso), no la lista completa.
- **Contract owner del destilado:** la sección `### Handling subagent returns` (`:313-322`) queda como único dueño de la regla de destilado; el resto la referencia.

### 2. Envelope por tramo (`orchestrator.md:140`)

Hoy: "Pass the relevant envelope verbatim". Nueva redacción de comportamiento: pasar a cada tramo **sólo los campos que ese tramo necesita**; se preservan siempre:

- los cinco artefactos de control: `task-owned files`, `Validation Ledger`, `SPEC UPDATE RECOMMENDED`, `SEED_ACTION_REQUIRED`, `GUARANTEE NOT SUSTAINED`;
- la evidencia como **`file:line`** (no prosa, logs ni diffs);
- requisitos numerados, paths y criterios de aceptación que el tramo consuma.

Se conserva la regla dura: si un subagente dice que le falta contexto, se le pasa el campo faltante o se frena; nunca se le manda a consultar Azure DevOps.

### 3. Fuente única de reglas compartidas

- Las reglas de framework que hoy se duplican **skill↔agente** (p.ej. frescura del seed, idioma de artifacts) se mueven a su **fuente canónica**: `AGENTS.md` (bloques `LOCKED` cuando correspondan) para lo transversal al proyecto; la superficie que la consumía pasa a **referenciar**.
- `templates/AGENTS.md` es el archivo instalado; se usa el mecanismo existente de bloques `LOCKED` para que `install`/`update` los re-apliquen.
- `test/content-guards.test.js` se relaja a **keywords de comportamiento**: donde hoy asierta el literal en dos superficies, pasa a asiertar el comportamiento en la fuente única. Cada salvaguarda protegida conserva un assert.

### 4. Compresión (caveman) host-scoped

- `buildDefaultMcp` (`src/cli/index.js:548-555`) sigue dando de alta caveman por defecto cuando el binario está disponible. La configuración es **del host**: `opencode.json` (opencode) o `.agents/mcp_config.json` (antigravity) vía `setupHostMcp`; para el resto de hosts el MCP de host queda fuera de alcance (decisión vigente en memoria: `cli.host-mcp-config-out-of-scope`).
- La **pista de uso** de la compresión se materializa **sólo en superficies del host que tiene la tool**; nunca en texto compartido entre hosts (`AGENTS.md` o assets copiados verbatim). El mecanismo concreto queda como detalle de implementación del pipeline de instalación por host; el contrato es: *donde no hay tool, no hay instrucción*.
- **Compuerta de medición:** el default se revisa con `ancleto stats` (`README.md:134`). Si el consumo neto no baja en la ventana de observación definida, el default vuelve a **opt-in**. La ventana y el umbral se fijan en el baseline T0, no como valor fijo configurable.

### 5. Día-cero del working-context

- `refreshWorkingContext` (`src/cli/index.js:1940-1949`) hoy retorna `null` si no existe `.ancleto/memory.db`. Se cambia a **materializar** `.ancleto/working-context.md` con el bloque `<ProjectTopology>` cuando exista `.discovery-map.json`, creando `.ancleto/` si falta.
- El render de topología **no depende del motor ni de reglas**. `buildWorkingContext` ya devuelve `topoBlock` cuando no hay filas (`src/core/memory/engine.js:129`), pero requiere una DB existente; para el caso sin DB la CLI compone la topología con el helper que ya vive en `engine.js` (`readTopologySummary` + `formatTopologyBlock`) **sin abrir el motor**.
- **Se preserva** el contrato vigente del motor: `buildWorkingContext` conserva firma y default (`scope, maxTokens=MAX_TOKENS, cwd=process.cwd()`), y sigue devolviendo `null` sin topología y sin reglas. El cambio de comportamiento es en la capa CLI.
- `README.md:311` se alinea con `:414`: la materialización ocurre desde el día cero con la topología (y con las reglas activas si hay memoria).

### 6. Salvaguardas intocables (restricción de diseño)

Ningún recorte puede eliminar: verificación de garantías bajo modelo real (`agents/reviewer.md:65,88`), verificación de afectados y no sólo archivos tocados (`agents/tester.md:60`), `bash:false` en reviewer/orchestrator/spec-writer, Validation Ledger + los cinco flags, bloqueo por CRITICAL, baseline reproducible. Las pruebas de comportamiento deben cubrirlas.

### Overlap con `contrato-validaciones`

El change futuro `contrato-validaciones` también tocará `templates/AGENTS.md` y `test/content-guards.test.js`. Ambos changes deben **secuenciarse** (no mergear en paralelo) o resolver el conflicto de merge sobre esos dos archivos. Dejar asentado en `tasks.md`.

## Validation

- **Baseline T0 (primero):** `node --test test/*.test.js` cronometrado, `ancleto stats` de la ventana previa, y RR/escapes de los últimos changes → Q = (1−RR)(1−escapes). Se registra antes de tocar prompts.
- **Comportamiento:** nuevos asserts que cubren día-cero sin DB (topología materializada), destilado del envelope (flags preservados), no-duplicación (Runtime Safety único hogar; expected-output delegado) y host-scoped (sin instrucción de compresión en texto compartido).
- **Regresión:** suite completa `node --test test/*.test.js` en verde; comparación de duración con T0.
- **Efecto del recorte:** `ancleto stats` post-change vs T0 → ΔQ ≥ 0. Un recorte con ΔQ < 0 se revierte.
- **No breaking:** verificar que la instalación en cada host soportado sigue siendo no destructiva y que los assets compartidos no ganan texto host-específico.
