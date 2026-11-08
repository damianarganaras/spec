# Proposal: Guard de `--help` sin ejecución en subcomandos de la CLI

## Problema

`ancleto <subcomando> --help` no imprime ayuda: ejecuta el subcomando. El defecto está reproducido en
un directorio temporal:

- `init --help` instaló el scaffold completo (`.ancletorc`, `.opencode/**`, `aspec/config.yaml`);
- `upgrade --help` corrió el upgrade y falló con `No se encontro .ancletorc`;
- `specs merge --help` corrió el merge y falló por falta de `--change`;
- `projects prune --help`, `projects scan --help` y `projects update --help` ejecutaron la mutación del
  registro de proyectos (`src/cli/index.js:538` → `:392-395`, `:532`, `:548-550`);
- `discovery --help` imprimió ayuda y salió con exit code 0.

En `src/cli/index.js` el dispatch (`switch (cmd)`, ~:4861-4926) sólo maneja `--help`/`-h`/sin
argumentos en el nivel global (~:4917-4921). Existe una tabla `SUBCOMMAND_HELP` (~:4841-4853) que no
incluye `projects`, por lo que `ancleto projects ... --help` llega al handler y ejecuta su efecto:
`scan` registra proyectos (~:532), `prune` borra entradas y reescribe el registro (~:538 → `:392-395`)
y `update` lanza `ancleto update` por proyecto (~:548-550). El registro vive en
`~/.config/ancleto/projects.json` (override `ANCLETO_PROJECTS_FILE`). Los handlers `install` (~:1793),
`upgradeCmd` (~:1949), `initProject` (~:2006), `memoryCmd` (~:2909), `specsCommand` (~:3568),
`exportCmd` (~:4505), `importCmd` (~:4570) y `serveMemoryMcp` (~:4873) ignoran `--help` y ejecutan su
efecto. Sólo `discovery` (~:2440-2452) tiene un handler real de ayuda.

## Intención

Que `ancleto <subcomando> --help` (y `-h`) imprima el uso a STDOUT y salga con exit code 0 **antes** de
ejecutar el handler, con cero escrituras. La ayuda global y la ayuda de `discovery` no cambian.

## Alcance

**Dentro:**

- **Guard central en el dispatch.** Un único punto de intercepción en `src/cli/index.js` detecta
  `--help`/`-h` en cualquier posición del argv del subcomando, imprime el uso a STDOUT y sale 0 antes
  de invocar el handler. No se duplica un guard por handler.
- **Conjunto enumerado.** `install`, `update`, `upgrade`, `init`, `memory`, `import`, `export`, `mcp`,
  `specs` (nivel superior), `specs merge` y `projects` (nivel superior y sus subcomandos `scan`,
  `prune`, `update` y `list --update`, incluida la delegación desde `list --projects`). Para `memory`,
  cubre `memory --help` y `memory <subcomando> --help`.
- **Texto de uso.** Identifica el comando y sus argumentos y es consistente con la sinopsis de la
  constante `HELP`; puede mantenerse como constantes por comando y no omite flags documentados. Para
  `memory` y `projects`, cubre la lista de uso que hoy se imprime a stderr ante un subcomando
  desconocido (~:554); para `specs`, las formas de `specs check` y `specs merge`.
- **Invariante cero-escrituras.** Ninguna invocación con `--help` del conjunto crea o modifica
  archivos. Verificable por bytes y `mtime` de `.ancletorc` y `.opencode/**` antes/después en un
  proyecto temporal.
- **Delta spec.** `specs/cli-diagnostics/spec.md` con un `ADDED` de título
  "Manejo de `--help` sin ejecución en subcomandos que mutan estado".

**Fuera (exclusión explícita):**

- **Subcomandos read-only.** No se agrega el guard a `check`, `doctor`, `stats`, `list` (sin
  `--projects`) ni `affected`; pueden seguir ejecutándose ante `--help`, lo que es inocuo porque no
  escriben. `projects` queda **dentro** del guard porque `prune`, `scan` y `update` escriben el
  registro.
- Cambiar el parseo de flags, los textos de error o los exit codes de las invocaciones sin `--help`.
- Cambiar el texto de ayuda de `discovery` ni la ayuda global (`ancleto --help`, `-h`, sin argumentos).
- Modificar `src/core/**`, `package.json` o la versión del paquete.
- `specs check --help` queda fuera del guard por ser read-only; sólo se cubren `specs` y `specs merge`.

## Riesgos y mitigación

- **Intercepción demasiado amplia.** Un guard global que aplique a todos los comandos cambiaría la
  ayuda de `discovery` o de los read-only. Mitigación: el conjunto es una tabla explícita y
  `discovery` queda fuera.
- **Registro fuera del proyecto.** `projects` escribe `~/.config/ancleto/projects.json`, que los
  chequeos de `.ancletorc` y `.opencode/**` no cubren. Mitigación: los tests apuntan
  `ANCLETO_PROJECTS_FILE` a un archivo temporal y comparan bytes y `mtime` antes/después.
- **Alias `list --projects`.** Delega en el handler de `projects` y puede alcanzar un subcomando que
  muta. Mitigación: el guard de `projects` se aplica también en esa delegación; sólo `list` sin
  `--projects` queda fuera.
- **Falso positivo sobre valores de flags.** `--help` como valor de otro flag también activa la ayuda.
  Mitigación: es el contrato pedido ("en cualquier posición del argv") y el comportamiento previo era
  ejecutar el comando, que es peor.
- **Deriva del texto de uso.** Constantes por comando pueden desincronizarse de la sinopsis de
  `HELP`. Mitigación: exigir consistencia con `HELP` y con la lista de `memory`, sin omitir flags
  documentados; la consistencia se fija en el delta spec y se verifica en los tests de comportamiento.
- **Regresión de exit codes.** Los tests existentes de ayuda global y `discovery --help` deben seguir
  verdes; el guard no toca esos caminos.

## Delta spec

- `specs/cli-diagnostics/spec.md` — 1 `ADDED`: "Manejo de `--help` sin ejecución en subcomandos que
  mutan estado". Sin `MODIFIED`, `REMOVED` ni `RENAMED`; los requirements canónicos no mencionados se
  preservan.

## Decisiones

- **memory_key:** subcommand-help-guard-zero-write
  **Elección:** Un guard central en el dispatch detecta `--help`/`-h` en el argv del subcomando y,
  para el conjunto que muta estado (`install`, `update`, `upgrade`, `init`, `memory`, `import`,
  `export`, `mcp`, `specs`, `specs merge`, `projects` y sus subcomandos), imprime el uso a STDOUT y
  sale 0 antes de invocar el handler.
  **Descartado:** Duplicar un `if (--help)` al inicio de cada handler; mantener el comportamiento
  actual fuera de `discovery`.
  **Justificación:** Un único punto de intercepción evita diez guards duplicados, garantiza la
  invariante cero-escrituras por construcción y deja `discovery` y la ayuda global intactas.
  **Refs:**
  - spec:cli-diagnostics#Manejo de --help sin ejecución en subcomandos que mutan estado
  - change:cli-subcommand-help-guards
  - path:src/cli/index.js
  - path:test/cli.test.js
  **Estado:** aprobado

- **memory_key:** projects-guarded-registry-write
  **Elección:** `projects` entra en el conjunto guardado, incluidos `projects scan`, `projects prune`,
  `projects update`, `projects list --update` y la delegación desde `list --projects`.
  **Descartado:** Mantener `projects` entre los subcomandos read-only excluidos del guard.
  **Justificación:** El handler escribe el registro de proyectos al ejecutarse: `scan` registra rutas
  (`src/cli/index.js:532`), `prune` borra entradas y reescribe (`:538` → `:392-395`) y `update` lanza
  `ancleto update` por proyecto (`:548-550`). Sin el guard, `ancleto projects prune --help` muta el
  registro, lo que rompe la invariante cero-escrituras del requirement.
  **Refs:**
  - spec:cli-diagnostics#Manejo de --help sin ejecución en subcomandos que mutan estado
  - change:cli-subcommand-help-guards
  - path:src/cli/index.js
  - path:test/cli.test.js
  **Estado:** propuesto

- **memory_key:** readonly-subcommand-help-deferred
  **Elección:** Los subcomandos read-only (`check`, `doctor`, `stats`, `list` sin `--projects`,
  `affected` y `specs check`) quedan fuera del guard en este change; su comportamiento ante `--help`
  no cambia.
  **Descartado:** Extender el guard a todos los subcomandos ahora.
  **Justificación:** Ejecutar un read-only no produce daño observable; incluirlos ampliaría el alcance
  y los tests sin cambiar la invariante que motiva el change. Se puede reevaluar en un change futuro.
  **Refs:**
  - change:cli-subcommand-help-guards
  - path:src/cli/index.js
  **Estado:** descartado
