# Design: Refrescar el working-context en todas las escrituras de memoria

## Approach

Cerrar el hueco de frescura **extendiendo el mecanismo ya existente**, sin inventar uno nuevo.

Hoy el refresh-on-write vive en una sola función: `createMemoryToolHandlers.record(...)`
(`src/core/memory/tools.js:66-77`), que tras `engine.recordNode` evalúa
`shouldRefreshWorkingContext(result)` y, si da verdadero, llama a
`writeWorkingContext(engine, projectRoot)`. La CLI tiene su propio camino,
`refreshWorkingContext(projectDir, scope)` (`src/cli/index.js:2160-2177`), que maneja también
el día-cero y abre una conexión propia.

Decisión de diseño: **`memoryImport` reusa `writeWorkingContext` sobre la conexión que ya abrió**,
en lugar de llamar a `refreshWorkingContext` (que abriría un segundo engine). Así se respeta el
invariante de conexión única usado por `tools.js` y el render sigue teniendo un solo camino
(`renderWorkingContextBlock`).

Para la señal de staleness, se agrega una verificación **read-only** que se apoya en el mismo
render: comparar el bloque renderizado desde la memoria activa contra el contenido actual de
`.ancleto/working-context.md`.

## Architecture

### 1. Refresh en `memoryImport` (`src/cli/index.js`)

- Tras `engine.importNodes(json)` y antes del `finally` que cierra el engine, si la importación
  alteró nodos activos (`summary.inserted + summary.updated > 0`), llamar a
  `refreshWorkingContextOnWrite(engine, projectDir)` (helper nuevo en `working-context.js`) dentro
  de un `try/catch` aislado (mismo criterio de robustez que `tools.js:70-75`: un fallo del refresh
  no invalida la escritura ya persistida, se avisa por stderr).
- `refreshWorkingContextOnWrite` es **compare-based**: renderiza el bloque esperado y reescribe el
  archivo solo si difiere del contenido en disco (y no crea un archivo vacío cuando no hay nada que
  inyectar). Esto satisface el escenario "un import que no altera el bloque no lo reescribe", que un
  refresh por conteo (`inserted+updated>0`) no garantizaría.
- `projectDir = process.cwd()` (ya se usa así en `memoryContext`/`memoryImport`). El render ya
  resuelve topología vía `readTopologySummary(projectDir)`.
- No se toca `engine.importNodes`: el motor no debe conocer el filesystem del artefacto derivado
  (misma frontera que hoy: la composición/escritura vive en `working-context.js` + quien la
  invoca).

Puntos de escritura cubiertos tras este cambio:

| Superficie | Refresca hoy | Tras el change |
|---|---|---|
| MCP `recordRule`/`recordDecision` (`tools.js`) | sí (filtrado) | sí (sin cambio) |
| CLI `memory import` | **no** | **sí** (cuando altera nodos activos) |
| Lifecycle `init`/`install --project`/`upgrade` | sí | sí (sin cambio) |
| CLI `memory context --out` | sí (manual) | sí (sin cambio) |

`memory export`, `memory list`, `memory doctor`, `memory gc` no crean ni alteran el bloque de
reglas → no disparan refresh (export/list son read-only; gc solo purga superseded).

### 2. Señal de staleness (`ancleto memory doctor` y/o `memory context --check`)

- **Candidato elegido:** extender `ancleto memory doctor` con un chequeo no destructivo
  `working-context al día` que:
  1. renderiza el bloque esperado con `renderWorkingContextBlock(engine, cwd, 'project')`
     (mismo camino que el refresh);
  2. lee `.ancleto/working-context.md` si existe;
  3. compara con normalización acotada (trim de líneas y del salto final);
  4. reporta `ok` / `ausente` / `desactualizado`.
- El chequeo es de solo lectura: no escribe el archivo (a diferencia del refresh). Corregir el
  staleness es responsabilidad de `ancleto memory context --out` (manual) o del on-write (auto).
- Nota: `memory doctor` hoy reporta integridad del DB; agregar un check de artefacto derivado es
  coherente con su rol de diagnóstico ("¿está sana la memoria de este repo?").

> Decisión secundaria a confirmar en implementación: si el check de staleness vive en
> `memory doctor` o en `memory context --check`. El diseño asume `memory doctor` por reutilizar
> el subcomando de diagnóstico existente y no ampliar la superficie de `context`.

### 3. Alineación de contrato y documentación

- Delta de spec: agregar un Requirement de frescura para las escrituras de la CLI (compañero del
  vigente "Frescura ... tras escrituras MCP") y agregar el requisito de staleness.
- Actualizar la enumeración de puntos de regeneración en `README.md` (sección de memoria) y
  `agents/orchestrator.md` (nota de `## Project Memory Rules`) para incluir las escrituras CLI.
- Alinear el seed técnico (`docs/technical-discovery/units/memory-engine.md`, punto 4 del flujo)
  para reflejar que el refresh no es exclusivo de MCP.

## Validation

- **Unit — refresh en import:** importar un JSON con una `rule` scope `project` por
  `memory import`; verificar que `.ancleto/working-context.md` incluye la regla nueva. Ref:
  Requirement "Frescura del working-context tras escrituras de memoria".
- **Unit — import que no altera el bloque:** importar una `decision` no-project sin supersesión y
  verificar que no se reescribe / queda idéntico.
- **Unit — robustez:** forzar un fallo de escritura del working-context en import y verificar que
  el import igual reporta OK y la DB contiene el nodo.
- **Unit — staleness:** con una regla activa y el archivo ausente/desactualizado, `memory doctor`
  reporta `ausente`/`desactualizado`; con el archivo al día, reporta `ok`.
- **Regresión:** suite de memoria/working-context/MCP verde:
  `node --test test/memory-engine.test.js test/mcp.test.js test/working-context.test.js`.
- **Comando declarado del proyecto:** el de `## Project Commands` en `PRODUCT.md` (test acotado y
  lint declarado).
