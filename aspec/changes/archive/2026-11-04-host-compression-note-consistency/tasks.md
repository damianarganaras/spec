# Tasks: host-compression-note-consistency

## 1 — Helper estado-driven

- [x] Agregar `resolvesHostCompression(projectDir, host, { writesCaveman = false, intendedNames = null } = {})` en `src/cli/index.js`, junto a `hostConfigHasCompression`: devolver `false` si el host no soporta compresión; `true` si la configuración en disco ya incluye `caveman`; `false` si no hay escritura pendiente; y `true` si hay escritura pendiente y `intendedNames` es `null` o incluye `caveman`.
  - Archivos: `src/cli/index.js`.
- [x] No modificar `hostConfigHasCompression` ni `installAgentAssets`; el helper reutiliza la primera como fuente de verdad del estado en disco.

## 2 — `install`

- [x] Reemplazar el gate de compresión de `install` por `await resolvesHostCompression(projectDir, agent, { writesCaveman: Boolean(mcpMap && mcpMap.caveman) })`.
  - Archivos: `src/cli/index.js`.
- [x] Verificar que con `--no-mcp` (`mcpMap` nulo o vacío) el helper siga devolviendo `true` cuando la configuración previa ya incluye `caveman`.

## 3 — `init`

- [x] Reemplazar el gate de compresión de `init` por el mismo patrón de `install`, usando su `mcpMap`.
  - Archivos: `src/cli/index.js`.
- [x] Mantener intacto el orden existente: `mcpMap` se resuelve antes de `installAgentAssets` y la escritura MCP sigue ocurriendo después.

## 4 — `import`

- [x] Hoistear en `import` el cálculo de `fresh` y `intendedNames = manifest.mcp.map((m) => m.name)` antes de la llamada a `installAgentAssets`, sin mover `repairProjectMcp` ni alterar el orden de escrituras.
  - Archivos: `src/cli/index.js`.
- [x] Pasar al helper `writesCaveman: agent === 'opencode' && Boolean(fresh.caveman)` y `intendedNames`; reutilizar los mismos `fresh`/`intendedNames` en `repairProjectMcp` para no evaluar `buildDefaultMcp` dos veces.
- [x] Confirmar que para hosts distintos de `opencode` (`antigravity` incluido) el import no cuenta como escritura pendiente de `caveman`.
  - Nota (R1): la validación de M1 (`manifest.mcp` no-array aborta antes del primer write) la cubre
    `@tester`; el guard ya existe y no agrega tarea de implementación.

## 5 — Tests de consistencia (`test/cli.test.js`)

- [x] Cubrir `install` e `init`: configuración previa con `caveman`, `--no-mcp` o binario ausente, y afirmar que la nota está presente.
  - Archivos: `test/cli.test.js`.
- [x] Cubrir `install` e `init`: estado legado de nota sin configuración y re-ejecución; afirmar que la nota desaparece y que `check` no reporta `frontmatter diverge del adaptador`.
  - Archivos: `test/cli.test.js`.
- [x] Cubrir `import` en `opencode`: bundle con `manifest.mcp: []` y binario presente; afirmar que no hay nota, que la configuración final no incluye `caveman` y que `check` no reporta divergencia.
  - Archivos: `test/cli.test.js`.
- [x] Cubrir `import` en `opencode`: bundle que declara `caveman` con binario presente (configuración y nota) y con binario ausente (sin nota).
  - Archivos: `test/cli.test.js`.
- [x] Cubrir `import` en `antigravity`: `.agents/mcp_config.json` con `caveman` (nota presente) y sin `caveman` (nota ausente), usando el stub de binario por PATH cuando corresponda.
  - Archivos: `test/cli.test.js`.
- [x] Cubrir idempotencia de `import`: dos ejecuciones no duplican la nota ni cambian la configuración final; re-import sanea el estado legado.
  - Archivos: `test/cli.test.js`.
- [x] Afirmar que los exit codes de `check` no cambian: divergencia advisory con exit 0 sin faltantes y exit 1 con faltantes.
  - Archivos: `test/cli.test.js`.

## 6 — Guard test-only del overlay de tier

- [x] Agregar un test que afirme que cada `profiles/test/agents/*.md` declara una línea `^model:`, precondición del no-op `o === c` de `applyTier`.
  - Archivos: `test/agent-model-coherence.test.js`.
- [x] No exportar `applyTier` ni abrir superficie pública nueva.

## 7 — Validación declarada

- [x] Ejecutar `npm run lint`.
- [x] Ejecutar la suite acotada con rutas explícitas: `node --test test/cli.test.js test/agent-model-coherence.test.js`.
- [x] Ejecutar la suite declarada completa: `npm test`.
- [x] Registrar que el format check es `not-configured` y que typecheck no aplica.

## 8 — Verificación operativa local (ítem G)

- [ ] Ejecutar `node src/cli/index.js upgrade` en la raíz del repositorio y confirmar que `.ancletorc` y `.ancleto/machine-env.md` reflejan la versión actual del paquete.
- [ ] No commitear esos archivos (están gitignored), no escribir memoria y registrar el resultado de la verificación.
