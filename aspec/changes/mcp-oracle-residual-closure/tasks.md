# Tasks: cierre residual del oráculo MCP

> Alcance: alineación del texto público con `mcpCommandBroken` y dueño único del par global de
> `doctor`. Sin cambios de escritura, exit codes, ruteo por host ni specs canónicas.

## Implementación

- [x] **T1 — Alinear la ayuda de `--help` con el predicado.** En `src/cli/index.js:114`, reemplazar
  el texto de `ancleto import --repair` para que describa el predicado vivo: `command` ausente/vacío
  o ruta absoluta inexistente es roto; un nombre simple irresoluble en `PATH` no lo es. No cambiar
  la semántica ni los flags del comando.
  Archivos: `src/cli/index.js`.

- [x] **T2 — Delta `MODIFIED` de `project-portability`.** Asegurar que el delta en
  `aspec/changes/mcp-oracle-residual-closure/specs/project-portability/spec.md` el delta
  `## MODIFIED Requirements` que reescribe el cuerpo completo del requirement `Reparación in place
  sin bundle` —no sólo scenarios— con el predicado exacto y los casos borde. No editar la spec
  canónica: la sincronización ocurre al archivar.
  Archivos: `aspec/changes/mcp-oracle-residual-closure/specs/project-portability/spec.md`.

- [x] **T3 — Derivar el par global en `doctorCommand`.** En `src/cli/index.js:4407`, reemplazar el
  literal `['opencode.json', 'opencode.jsonc']` por la iteración de `PROJECT_MCP_CANDIDATES`
  (`:32`), derivando el basename si el candidato lo incluyera, con el mismo orden. Conservar
  `globalConfigDir()`, la etiqueta `basename(p)`, los textos y la precedencia project-first de
  `findProjectMcpFile`. No tocar `findProjectMcpFile` ni unificar la selección.
  Archivos: `src/cli/index.js`.

## Tests

- [x] **T4 — Tests de contrato en `test/cli.test.js`.**
  - Ayuda: `--help` exit 0, contiene el texto exacto nuevo de T1 y ya no contiene
    `command inexistente`.
  - `doctor`: con config global `.json` y sin config de proyecto reporta `✔ opencode.json valido`;
    con `.jsonc` reporta el mismo nombre base; sin ninguna config conserva
    `⚠ opencode.json no encontrado (config MCP)`; con config de proyecto presente no consulta la
    global. Salida idéntica a la actual.
  - Predicado: `command` ausente/vacío → roto; nombre simple que no resuelve en `PATH` → sano y no
    reescrito; ruta absoluta inexistente derivada de `tmpdir()` → roto; ruta absoluta existente
    (por ejemplo `process.execPath`) → sano y no reescrito. Verificar además que `import --repair`
    y `check` usan el mismo veredicto, sin cambiar exit codes.
  Archivos: `test/cli.test.js`.

## Validación

- [x] `npm run lint`
- [x] `npm test`

Format: `not-configured`. Typecheck: no aplica.
