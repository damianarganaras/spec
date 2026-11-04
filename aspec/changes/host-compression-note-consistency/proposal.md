# Proposal: consistencia de la nota de compresión con la config MCP del host

## Intención

Corregir la inconsistencia entre cómo `install`, `init` e `import` deciden materializar
`CAVEMAN_USAGE_NOTE` y cómo `check`/`upgrade` calculan el mismo estado.

Hoy `check` y `upgrade` leen la configuración MCP en disco
(`hostConfigHasCompression`), mientras `install`, `init` e `import` deciden por detección de
binario (`hostSupportsCompression(agent) && Boolean(mcpMap.caveman)`). Eso produce tres
divergencias reproducibles:

- `import` de un bundle con `manifest.mcp: []` en una máquina con `caveman-mcp` en PATH escribe la
  nota en el orchestrator, pero deja `.opencode/opencode.json` con `mcp: {}`; `check` emite
  `frontmatter diverge del adaptador`.
- `install --no-mcp` (o binario ausente) con `caveman` ya presente en la configuración conserva la
  configuración, pero reescribe el orchestrator sin la nota; `check` vuelve a divergir.
- `import` con host `antigravity` decide por binario, pero `repairProjectMcp` sólo escribe
  `.opencode/opencode.json`; `check` lee `.agents/mcp_config.json` y reporta divergencia.

El invariante nuevo es estado-driven y acotado al host activo de la corrida, en las instalaciones de
proyecto que `ancleto check` evalúa: para el orchestrator del host que el comando está instalando o
importando con `--project`, la nota existe si y sólo si ese host soporta compresión y la
configuración MCP final de ese mismo host incluye `caveman`. La decisión SHALL usar la misma fuente
de verdad que `check` y NO SHALL depender de una detección de binario al vuelo cuando la
configuración ya define el estado.

La consistencia cross-host queda fuera de alcance (H3, H9), igual que la rama global de `install` sin
`--project`, que copia `agents/**` verbatim y no es evaluada por `check`; por eso `check` puede
seguir emitiendo su aviso advisory en proyectos mixtos sin que eso invalide este invariante.

## Alcance

Dentro de este change:

- Extender la capa responsable en `src/cli/index.js` con un helper de decisión
  (`resolvesHostCompression`) que combina la configuración en disco con la configuración que el
  comando va a escribir.
- Usar ese helper en los gates de `install`, `init` e `import`.
- Mantener `check`, `upgrade`, `applyTier`, `freeTierOnPrimary`, `hostConfigHasCompression`,
  `installAgentAssets`, el texto y la posición de la nota sin cambios.
- Agregar tests de consistencia para los nueve casos de borde del contrato.
- Agregar un guard test-only que afirme que `profiles/test/agents/*.md` declaran `^model:`
  (precondición del no-op de `applyTier`). No se exporta `applyTier`.
- Remediación operativa local: ejecutar `node src/cli/index.js upgrade` en este repositorio para
  refrescar `.ancletorc` y `.ancleto/machine-env.md` (ambos gitignored). No es un cambio de producto.

Fuera de este change (backlog, no implementar):

- H3: `import` escribe MCP `.opencode` para hosts que no lo consumen.
- H4: `init --agent copilot` cae al fallback `.opencode`.
- H5: caveman roto cuenta como presente.
- H6: MCP muerto para claude/vscode/cursor/roo.
- H7: `.ancleto-tier` escrito para hosts sin agentes.
- H8: deriva de tier tras `upgrade`.
- H9: `installedPaths` multi-host.
- H10: bundle opencode importado en host no-opencode.
- H11/H12: `export`/`import` sólo opencode.
- H13: `.ancletorc.version` no validado.
- H14: `doctor` lee la configuración global.

Razón común: cada uno pertenece a otra invariante (routing MCP multi-host, archivo de tier o
portabilidad) y no comparte tema con esta inconsistencia; no hay un fix mínimo testeable sin
ampliar el change.

## Enmienda (R1)

Revisión posterior a la aprobación inicial, sin cambiar la implementación prevista:

- **Garantía acotada al host activo**: el invariante de la nota aplica al orchestrator del host que
  el comando está instalando o importando, y decide con la configuración MCP de ese mismo host. La
  redacción universal anterior ("el host") excedía lo que el código implementa.
- **Residual de backlog aceptado**: H3 (escrituras MCP en `.opencode` originadas por un host
  distinto del activo) y H9 (`installedPaths` multi-host) se aceptan explícitamente como fuera de
  alcance. En proyectos mixtos, `check` puede seguir emitiendo `frontmatter diverge del adaptador`
  como advisory; eso no invalida el invariante acotado.
- **M1** (`manifest.mcp` no-array) pasa a implementación: el import valida que `manifest.mcp` sea
  arreglo antes del primer write y aborta con error si no lo es.
- **M2** (configuración MCP no parseable) se acepta como limitación degenerada documentada: un JSON
  inválido no aporta `caveman` a la configuración final, igual que en `check`; no se agrega
  recuperación.
- **M3** queda aclarado en el delta de `project-portability`: `import <bundle>` re-materializa los
  assets y sanea la nota legada; `import --repair` sin bundle no reescribe assets y no la sanea.

## Enmienda (R2)

Corrección posterior a la review R2, sin cambiar la implementación prevista:

- **Rama global de `install` excluida del invariante**: sin `--project` (y sin `.ancletorc`),
  `install` copia `agents/**` verbatim con `copyAssets` (`src/cli/index.js:1795-1800`, `:963-968`) y
  escribe la config MCP global con `setupHostMcp` (`:1819`). Con `caveman-mcp` en PATH la config
  global queda con `caveman`, pero el orchestrator global no contiene `CAVEMAN_USAGE_NOTE`
  (`test/content-guards.test.js:518-531`), y `ancleto check` no evalúa esa instalación porque exige
  `.ancletorc` con `installedPaths` (`src/cli/index.js:2889-2895`). La garantía SHALL regir sólo para
  instalaciones de proyecto que `check` evalúa; la rama global queda fuera de alcance junto a
  H3/H9 y no se registra como decisión promovible.
- **Sobre-afirmación corregida en `project-portability`**: "un bundle que declara `caveman` sin
  binario no produce la nota" sólo vale si la configuración final no incluye `caveman`. Si el disco
  ya la incluye, `hostConfigHasCompression` devuelve `true` también para `import` y la nota SHALL
  materializarse.
- **Carve-out M2 en el texto normativo**: `mergeMcp` y `mergeAntigravityMcp` omiten la escritura y
  avisan cuando el JSON MCP no es parseable (`src/cli/index.js:764-770`, `:793-799`), pero la nota
  se materializa igual por la escritura pendiente; `check` puede entonces divergir. El iff de
  `agent-install-routing` declara esa excepción degenerada; no es corregible sin cambiar el oráculo
  de `check`.

## Decisión de arquitectura

La decisión de la nota se concentra en un único helper estado-driven, junto a
`hostConfigHasCompression`. El helper recibe el estado explícito de la escritura pendiente
(`writesCaveman`) y los nombres MCP que el comando pretende materializar (`intendedNames`), de modo
que la configuración final es `config en disco ∪ escritura pendiente`. `install` e `init` aportan
`writesCaveman` desde su `mcpMap`; `import` sólo lo aporta para `opencode`, porque `repairProjectMcp`
escribe únicamente `.opencode/opencode.json`. En `antigravity`, `import` depende exclusivamente de
la configuración de workspace ya presente.

El cálculo de `fresh`/`intendedNames` en `import` se hace antes de instalar los assets y se reutiliza
en `repairProjectMcp`, sin reordenar las escrituras ni evaluar `buildDefaultMcp` dos veces. `check`
conserva su contrato: divergencia advisory, comparación del archivo completo y exit
`missing > 0 ? 1 : 0`.

## Riesgos y mitigación

- **Doble fuente de verdad**: el riesgo es que `install`/`init`/`import` vuelvan a ramificar la
  condición. Mitigación: un solo helper reutilizado por los tres comandos y `check` sigue leyendo
  `hostConfigHasCompression`.
- **Suposición incorrecta sobre `antigravity`**: creer que `import` escribe su configuración MCP.
  Mitigación: `writesCaveman` se habilita sólo para `opencode` y un test cubre el host
  `antigravity` con y sin `.agents/mcp_config.json` previo.
- **Reordenamiento de escrituras en `import`**: mover `repairProjectMcp` o evaluar dos veces
  `buildDefaultMcp` puede duplicar avisos o cambiar el estado parcial. Mitigación: calcular una vez
  los valores puros, reutilizarlos y no mover la escritura MCP.
- **Estado legado**: un orchestrator con nota y configuración sin `caveman` sólo se sanea cuando el
  archivo se reescribe. Mitigación: cubrir `install`, `init` e `import` con un escenario de
  re-ejecución y verificar idempotencia.
- **Dependencia del entorno de test**: la detección de binario varía por plataforma. Mitigación:
  reutilizar el stub de `caveman-mcp` por PATH que ya usa `test/cli.test.js` (`.cmd` en Windows).

## Validación

La validación declarada del repositorio es:

- `npm run lint`.
- `npm test` (`node --test "test/*.test.js"`); para verificación acotada, rutas explícitas a
  `test/cli.test.js` y `test/agent-model-coherence.test.js`.
- Format: `not-configured` (el repositorio no declara formatter).
- Typecheck: no aplica (paquete JavaScript ESM, sin `tsconfig.json`).

## Decisiones

- **memory_key:** compression-note-gate
  **Elección:** decidir `CAVEMAN_USAGE_NOTE` con un helper estado-driven que combina la configuración
  MCP en disco con la escritura pendiente, y usarlo en `install`, `init` e `import`.
  **Descartado:** mantener la detección de binario al vuelo y parchear cada caso por separado.
  **Justificación:** es la única forma de que la nota coincida con la fuente que ya lee `check`
  (`hostConfigHasCompression`) sin duplicar la condición ni dejar casos inconsistentes.
  **Refs:** `path:src/cli/index.js`, `change:host-compression-note-consistency`
  **Estado:** aprobado

- **memory_key:** import-mcp-multihost-scope
  **Elección:** mantener `repairProjectMcp` escribiendo sólo `.opencode/opencode.json`; el import
  incorpora al cálculo la escritura pendiente sólo para `opencode`.
  **Descartado:** extender `import` para reparar también `.agents/mcp_config.json` y otras
  configuraciones MCP de host.
  **Justificación:** hacer multi-host el repair amplía el change a la invariante H3, no tiene fix
  mínimo testeable y cambia el alcance de portabilidad; la consistencia de la nota se resuelve sin
  tocar los destinos MCP.
  **Refs:** `path:src/cli/index.js`, `change:host-compression-note-consistency`
  **Estado:** descartado

- **memory_key:** host-mcp-audit-backlog
  **Elección:** registrar H3–H14 como backlog fuera de alcance con una razón por ítem.
  **Descartado:** incluirlos en este change por proximidad temática.
  **Justificación:** cada ítem pertenece a otra invariante (routing MCP multi-host, archivo de
  tier o portabilidad) y no comparte tema con la inconsistencia de la nota; mezclarlos impide
  verificar un fix mínimo.
  **Refs:** `change:host-compression-note-consistency`
  **Estado:** descartado

- **memory_key:** tier-applytest-overlay-guard
  **Elección:** no exportar `applyTier`; agregar un guard test-only que afirme que
  `profiles/test/agents/*.md` declaran `^model:` (precondición del no-op `o === c`).
  **Descartado:** exportar `applyTier` para testearlo directamente.
  **Justificación:** el guard cubre la precondición estructural que el no-op necesita sin ampliar la
  superficie pública del CLI ni convertir un detalle interno en contrato.
  **Refs:** `path:src/cli/index.js`, `path:profiles/test/agents`, `change:host-compression-note-consistency`
  **Estado:** aprobado

- **memory_key:** local-version-drift-remediation
  **Elección:** remediar la deriva de versión local ejecutando `node src/cli/index.js upgrade` en el
  repositorio, como tarea de verificación/operación.
  **Descartado:** hacer que `check` repare la deriva o agregar lógica de remediación al producto.
  **Justificación:** `upgrade` es el dueño existente de re-aplicar templates y regenerar
  `.ancletorc`/`.ancleto/machine-env.md`; `check` es de lectura y no debe escribir. Ambos archivos
  son gitignored y la tarea no escribe memoria.
  **Refs:** `path:src/cli/index.js`, `path:.ancletorc`, `path:.ancleto/machine-env.md`
  **Estado:** aprobado

- **memory_key:** compression-note-active-host-scope
  **Elección:** acotar la garantía de `CAVEMAN_USAGE_NOTE` al orchestrator del host activo, decidida
  con la configuración MCP de ese mismo host.
  **Descartado:** mantener la garantía universal cross-host y extender el fix a H3/H9.
  **Justificación:** la implementación aprobada ya opera por host activo; la redacción universal
  describía una consistencia multi-host que pertenece a otro invariante y no tiene fix mínimo
  testeable en este change.
  **Refs:** `path:src/cli/index.js`, `change:host-compression-note-consistency`
  **Estado:** aprobado
