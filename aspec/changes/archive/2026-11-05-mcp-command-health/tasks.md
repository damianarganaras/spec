# Tasks: salud de comandos MCP y visibilidad desde el oráculo

> Alcance: predicado MCP, descubrimiento único de la config MCP de proyecto, avisos de `check` y aviso
> de reemplazo en `import`. Sin cambios de ruteo por host, portabilidad ni tier.

## Implementación

- [x] **Predicado de salud MCP.** En `src/cli/index.js`, corregir `mcpCommandBroken`: una entrada es
  rota sólo cuando `command` no es arreglo, está vacío, su primer elemento no es string no vacío, o
  ese elemento es una ruta absoluta de la plataforma actual que no existe. Quitar el corte por forma
  de letra de unidad; dejar que la ruta con letra de unidad se evalúe por existencia cuando la
  plataforma la trata como absoluta y caiga en la regla de comando simple cuando no. No ejecutar el
  comando ni resolver PATH.
  Archivos: `src/cli/index.js`.

- [x] **Descubrimiento único y error de parseo.** En `src/cli/index.js`, extraer una única función de
  descubrimiento de la config MCP del proyecto (primer existente entre `.opencode/opencode.json` y
  `.opencode/opencode.jsonc`, en ese orden) y hacer que `readProjectMcp` la use. Extender
  `readProjectMcp` de forma aditiva para señalar el error de parseo (por ejemplo `{file, cfg, error}`),
  conservando `{file, cfg}` para `export` e `import` y sin cambiar la decisión de escritura de
  `repairProjectMcp`. No agregar parseo de comentarios.
  Archivos: `src/cli/index.js`.

- [x] **`doctor` sobre el helper compartido.** En `src/cli/index.js`, reemplazar el bucle de
  descubrimiento de proyecto de `doctorCommand` por la función compartida, conservando el fallback a
  `globalConfigDir()`, la etiqueta relativa con `/`, los textos actuales y el cálculo de `fatal`.
  Archivos: `src/cli/index.js`.

- [x] **Avisos advisory de `check`.** En `src/cli/index.js`, dentro de `checkCommand`, leer la config
  MCP del proyecto con el helper compartido y agregar al arreglo `warnings` existente: un aviso con la
  ruta cuando la config exista y no parsee; un aviso por entrada con comando roto cuando parsee,
  incluida `caveman`. Sin aviso cuando no hay config o todo es sano. No tocar `process.exit` ni
  `hostConfigHasCompression`, y no escribir archivos.
  Archivos: `src/cli/index.js`.

- [x] **Aviso de reemplazo en `import`.** En `src/cli/index.js`, dentro de `repairProjectMcp`, emitir a
  stderr el aviso `ancleto: no se pudo leer <ruta> como JSON; se reemplaza por la configuracion MCP
  nueva` cuando la config resuelta exista y no parsee, antes de escribir. Conservar la decisión de
  reemplazo y el exit code.
  Archivos: `src/cli/index.js`.

## Tests

- [x] **Cobertura del predicado.** En `test/cli.test.js`, agregar casos para: ruta absoluta existente
  (incluida la forma con letra de unidad en Windows, derivada de un archivo real como
  `process.execPath`) → sana y no reescrita; ruta absoluta inexistente (derivada de `tmpdir()`) →
  rota; comando simple → sano; `command` ausente, vacío o con primer elemento no string → roto.
  Archivos: `test/cli.test.js`.

- [x] **Cobertura de `import --repair` y fixtures.** En `test/cli.test.js`, ajustar los fixtures que
  usan rutas Windows fijas como entradas rotas para que la ruta inexistente se derive de `tmpdir()` y
  sea absoluta y ausente en ambas plataformas; agregar casos para: entrada sana preservada sin cambios
  de contenido (hash igual), entrada rota regenerada, config no parseable avisada y reemplazada,
  config parseable sin aviso, exit sin cambios.
  Archivos: `test/cli.test.js`.

- [x] **Cobertura de avisos de `check`.** En `test/cli.test.js`, agregar casos para: config no
  parseable → un aviso que nombra la ruta; entrada rota → un aviso por entrada; `caveman` roto →
  aviso propio; sin config → sin avisos; todo sano → sin avisos; exit 0/1 sin cambios; ninguna
  escritura de archivos durante `check`.
  Archivos: `test/cli.test.js`.

- [x] **No regresión de `doctor` y descubrimiento.** En `test/cli.test.js`, afirmar que `doctor`
  conserva sus mensajes y su precedencia proyecto→global, que los tres caminos de lectura resuelven el
  mismo archivo cuando sólo existe `.opencode/opencode.jsonc`, y que una config inválida de proyecto
  no cae al fallback global.
  Archivos: `test/cli.test.js`.

## Validación

- [x] Ejecutar `npm run lint` (declarado en `PRODUCT.md` → `## Project Commands`).
- [x] Ejecutar `npm test` (declarado en `PRODUCT.md` → `## Project Commands`).
- [x] Registrar que format queda `not-configured` y typecheck no aplica (paquete JavaScript sin
  `tsconfig.json`), según `PRODUCT.md`.
