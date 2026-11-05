# Tasks: Bundle host-neutral para la intención MCP

> Release objetivo: `0.20.0` (cambio de comportamiento observable). El bump de versión es una fase separada: no se ejecuta en este change.
> Validaciones declaradas (`PRODUCT.md` → `## Project Commands`): lint `npm run lint`; tests `npm test` (para el scope, `@tester` acota a `test/cli.test.js`). Los tests son responsabilidad de `@tester`; las tareas de implementación no editan `test/**`.

## Implementación

- [x] 1. Export: resolver el host activo desde `.ancletorc.agent` (sólo si es un host soportado) o `opencode` por defecto, y leer la intención MCP del destino que declare el descriptor único. Para `opencode`, `antigravity`, `commandcode` y `copilot`, leer `cfg[schema]` del archivo resuelto y construir `manifest.mcp` con `{ name, type: def?.type || 'local', enabled: def?.enabled !== false }`. Para `claude`, `vscode`, `cursor` y `roo`, conservar la lectura legacy de `.opencode/opencode.json|jsonc`. Archivos: `src/cli/index.js`.
- [x] 2. Export: si el destino declarado no existe, dejar `manifest.mcp = []` sin aviso; si existe y no parsea como JSON, dejar `manifest.mcp = []` y emitir un único aviso no bloqueante a stderr que nombre la ruta relativa al proyecto con el texto `<ruta> no es JSON valido; el manifiesto exporta intencion MCP vacia`, manteniendo el exit code en 0. No cambiar `EXPORT_FORMAT`, la forma del manifiesto, el guard de rutas absolutas ni la mecánica de `--tar`. Archivos: `src/cli/index.js`.
- [x] 3. Import: copiar `.opencode/{agents,commands,skills}` del bundle y registrar `.opencode/<dir>` en `installedPaths` sólo cuando el host activo sea `opencode`. Para cualquier otro host, no copiar ni registrar esos directorios y dejar la materialización de assets a `installAgentAssets`. Preservar `installedPaths` como unión de rutas existentes + templates escritos + assets escritos, sin heredar el manifiesto del bundle ni borrar rutas previas. Archivos: `src/cli/index.js`.

## Verificación

- [x] 4. Verificar con fixtures manuales, sin editar `test/**`: `export` en proyecto `opencode`, en proyectos `copilot`/`antigravity`/`commandcode`, en host sin destino, con destino inexistente y con destino no parseable; `import` con host `opencode` y con host no-`opencode`, comprobando que no se crea ni registra un `.opencode` fantasma y que la unión de `installedPaths` se conserva. Registrar la evidencia en el reporte de implementación. Archivos: `src/cli/index.js` (sólo lectura) y `aspec/changes/host-neutral-bundle/tasks.md` (marcado).
- [x] 5. Confirmar que no cambió el comportamiento de `init`, `install`, `update`, `upgrade`, `check`, `doctor`, `mcp`, `memory`, `specs`, `stats`, `projects`, `import --repair`, el descriptor de destinos ni la garantía de escritura MCP. Archivos: `src/cli/index.js` (sólo lectura).
