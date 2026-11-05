# Proposal: cierre residual del oráculo MCP

## Intención

Cerrar dos divergencias residuales del contrato MCP detectadas al cierre de 0.18.16, sin abrir
alcance nuevo: el texto público que describe un comando MCP roto debe coincidir con el predicado
vivo `mcpCommandBroken`, y el fallback global de `doctor` debe derivar su par de candidatos del
único dueño ya existente. No cambia el comportamiento de escritura ni de diagnóstico.

## Alcance

### Incluye

- **R1 — Texto alineado al predicado vivo.** La ayuda de `--help` y el texto del requirement de
  `project-portability` que describe una entrada reparada SHALL describir el mismo predicado que
  `mcpCommandBroken` (`src/cli/index.js:822-829`): roto cuando `command` está ausente/vacío o cuando
  es una ruta absoluta que no existe en disco. Un nombre simple que no resuelve en `PATH` NO es roto.
- **R2 — Dueño único del par global.** `doctorCommand` (`src/cli/index.js:4379`) SHALL dejar de
  repetir el literal `['opencode.json', 'opencode.jsonc']` en `:4407` y SHALL derivar los nombres del
  fallback global desde `PROJECT_MCP_CANDIDATES` (`:32`), preservando exactamente los mismos nombres
  y orden. La salida de `doctor` no cambia.

### Fuera de alcance

- H3, H4, H6, H10, H11, H12 y H9/N2 (tier file multi-host).
- Los hallazgos del reviewer sobre `check` inspeccionando `.opencode` siempre, `install --agent
  copilot` escribiendo ambos archivos, e `import` adoptando el `agent` del bundle.
- Cambios de exit code (`check` advisory; `doctor` sólo falla por Node/sqlite), escrituras nuevas,
  ruteo MCP por host, formatos de host nuevos.
- `init`, `install`, `update`, `upgrade`, `import`, `export`.
- `.opencode/**`, `agents/**` y `aspec/changes/ancleto-vscode-extension/`.

## Requisitos

- **R1:** el texto de ayuda (`src/cli/index.js:114`) y el cuerpo del requirement de
  `project-portability` deben describir el predicado vivo, sin la formulación más amplia "command
  inexistente". `aspec/specs/cli-diagnostics/spec.md:106-126` ya lo describe correctamente y no se
  modifica.
- **R2:** el fallback global de `doctor` debe leer sus nombres desde `PROJECT_MCP_CANDIDATES`, sin
  unificar la selección project-first ni tocar `findProjectMcpFile`.

## Decisión de arquitectura

No aplica: no se introduce capa, contrato ni abstracción nueva. R1 alinea texto con un predicado que
ya existe y R2 reutiliza la constante que ya es dueña del conjunto de nombres. Las decisiones
durables quedan en `## Decisiones`.

## Riesgos y mitigación

- **Cambiar el texto de `--help` puede romper guards de texto existentes.** Mitigación: tests que
  fijan el texto exacto nuevo y verifican que la ayuda ya no contiene "command inexistente".
- **Derivar el par global podría alterar etiquetas o precedencia.** Mitigación: tests de `doctor`
  con config global `.json`, con `.jsonc`, sin ninguna config, y con config de proyecto presente;
  mismos textos y misma precedencia project-first.
- **El delta `MODIFIED` podría limitarse a scenarios.** Mitigación: T2 exige reescribir el cuerpo
  completo del requirement.

## Validación planificada

- `npm run lint`
- `npm test`
- Format: `not-configured` (el repositorio no declara formatter).
- Typecheck: no aplica (paquete JavaScript sin `tsconfig.json`).

## Rutas autorizadas

- `src/cli/index.js` — sólo la línea de ayuda de `import --repair` y el fallback global de
  `doctorCommand`.
- `test/cli.test.js` — tests de contrato.
- `aspec/changes/mcp-oracle-residual-closure/**` — artefactos del change.

No se editan specs canónicas en este change: el delta se sincroniza al archivar.

## Decisiones

- **memory_key:** mcp-oracle-scope-residual-closure-only
  **Elección:** Aceptar sólo el cierre R1+R2 en este change.
  **Descartado:** Incluir H3/H4/H6/H10 en el mismo change.
  **Justificación:** Esos hallazgos exigirían `MODIFIED` en tres specs canónicas, reabrirían el
  fuera de alcance del MCP por host y mezclarían riesgos de ruteo con una alineación de texto; el
  costo de revisión y el riesgo de regresión no se justifican en un cierre residual.
  **Refs:** path:aspec/specs/project-portability/spec.md, path:aspec/specs/cli-diagnostics/spec.md, path:src/cli/index.js, change:mcp-oracle-residual-closure
  **Estado:** aprobado

- **memory_key:** mcp-broken-wording-single-source
  **Elección:** La ayuda de `--help` y `project-portability` describen el predicado vivo: roto sólo
  por `command` ausente/vacío o por ruta absoluta inexistente; un nombre simple irresoluble en
  `PATH` es sano.
  **Descartado:** Conservar "command inexistente" y ampliar el predicado para resolver `PATH`.
  **Justificación:** El predicado no ejecuta comandos ni resuelve `PATH` por diseño; el texto debe
  decir lo que el código decide. `cli-diagnostics` ya fija esa semántica y es la fuente de verdad.
  **Refs:** path:src/cli/index.js, path:aspec/specs/project-portability/spec.md, path:aspec/specs/cli-diagnostics/spec.md, change:mcp-oracle-residual-closure
  **Estado:** aprobado

- **memory_key:** global-mcp-candidates-derived-single-owner
  **Elección:** El par global de `doctor` se deriva de `PROJECT_MCP_CANDIDATES` por basename, con el
  mismo orden y los mismos nombres; la salida de `doctor` no cambia.
  **Descartado:** Mantener el literal duplicado o unificar también la selección project-first con la
  del fallback global.
  **Justificación:** El conjunto de nombres ya tiene un dueño y el fallback global sólo necesita esos
  nombres; unificar la selección cambiaría la precedencia documentada. Derivar por basename preserva
  el contrato sin acoplar ambas semánticas.
  **Refs:** path:src/cli/index.js, path:aspec/specs/cli-diagnostics/spec.md, path:test/cli.test.js, change:mcp-oracle-residual-closure
  **Estado:** aprobado

- **memory_key:** host-mcp-write-routing-deferred
  **Elección:** Diferir H3/H4/H6/H10/H11/H12 al backlog, con evidencia y condiciones de aceptación
  para un change futuro.
  **Descartado:** Corregir el ruteo de escritura MCP por host o la portabilidad por host dentro de
  este cierre.
  **Justificación:** El MCP de host está declarado fuera de alcance; aceptarlo exige rediseñar la
  propiedad de la config, agregar formatos de host y asumir una regresión mixta que no corresponde a
  un cambio de alineación textual.
  **Refs:** path:aspec/specs/agent-install-routing/spec.md, path:aspec/specs/project-portability/spec.md, path:src/cli/index.js, change:mcp-oracle-residual-closure
  **Estado:** aprobado
