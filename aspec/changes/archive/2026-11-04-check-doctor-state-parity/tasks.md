# Tasks: Paridad de estado entre oráculo y escritores

> Alcance: sólo H7, H13 y H14. Ninguna tarea modifica escritores ni contratos de escritura.

## Implementación

- [x] **H7 — tier dormido en `check`.** En `src/cli/index.js`, ajustar `checkTierOrphan` para
  devolver `[]` cuando `localAgentDirs(rc)` sea una lista vacía, antes del conteo de archivos.
  Conservar el aviso existente cuando haya un directorio declarado con cero archivos `.md` y
  conservar los cortes actuales por archivo de tier ausente o tier desconocido. No cambiar el texto
  del aviso, el conteo de `missing`/`orphans` ni el exit code.
  Archivos: `src/cli/index.js`.

- [x] **H13 — aviso advisory de deriva de versión.** En `src/cli/index.js`, dentro de
  `checkCommand`, comparar `rc.version` con `await packageVersion()` y agregar a la lista de
  warnings, una sola vez, el texto
  `.ancletorc registra v<rcVersion> y el CLI es v<cliVersion>; corré 'ancleto upgrade' para regenerar los artefactos locales`
  (sin glifo), que el printer de warnings existente imprime como `  ⚠ <texto>`,
  sólo cuando `rc.version` sea un string no vacío y distinto. No tocar el `process.exit` ni escribir
  archivos.
  Archivos: `src/cli/index.js`.

- [x] **H14 — config MCP del proyecto en `doctor`.** En `src/cli/index.js`, dentro de
  `doctorCommand`, resolver primero `join(cwd, '.opencode', 'opencode.json')` y su variante
  `.jsonc`; si existe, validar ese archivo y reportar la ruta relativa con `/`. Si no existe, usar
  el `globalConfigDir()` actual y el `basename` como hasta ahora. No agregar parseo de comentarios,
  no validar configs de otros hosts y no cambiar el cálculo de `fatal`.
  Archivos: `src/cli/index.js`.

## Tests

- [x] **Cobertura de H7.** En `test/cli.test.js`, agregar casos para: proyecto sano con host sin
  superficie de agentes (`cursor`, `roo`) con `.opencode/.ancleto-tier` → sin aviso y exit 0;
  superficie declarada (opencode/antigravity) sin archivos `.md` → aviso y exit 0; tier file
  ausente → sin aviso; tier desconocido → sin aviso. Mantener verde el caso existente que borra
  `.opencode/agents` con `agent: opencode`.
  Archivos: `test/cli.test.js`.

- [x] **Cobertura de H13.** En `test/cli.test.js`, agregar casos para: versión distinta → aviso con
  ambas versiones y exit 0; versión igual → sin aviso; `version` ausente, `""` y no string → sin
  aviso; una segunda ejecución de `check` no acumula avisos ni modifica `.ancletorc`.
  Archivos: `test/cli.test.js`.

- [x] **Cobertura de H14.** En `test/cli.test.js`, agregar casos para: `.opencode/opencode.json`
  válido → `.opencode/opencode.json valido`; inválido → `JSON invalido` sin fallback global y exit 0;
  sin config de proyecto → fallback global existente; sin ninguna config → `no encontrado` y exit 0;
  `.agents/mcp_config.json`, `.mcp.json`, `copilot-mcp.json` y `.vscode/mcp.json` ignorados.
  Archivos: `test/cli.test.js`.

- [x] **No regresión de exit y de escritura.** En `test/cli.test.js`, afirmar que `check` conserva
  `exit 1` con faltantes y `exit 0` sin faltantes, y que ninguna corrida de `check`/`doctor` agrega,
  borra ni modifica archivos del proyecto.
  Archivos: `test/cli.test.js`.

## Validación

- [x] Ejecutar `npm run lint` (declarado en `PRODUCT.md` → `## Project Commands`).
- [x] Ejecutar `npm test` (declarado en `PRODUCT.md` → `## Project Commands`).
- [x] Registrar que format queda `not-configured` y typecheck no aplica (paquete JavaScript sin
  `tsconfig.json`), según `PRODUCT.md`.
