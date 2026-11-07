# Proposal: Preservación del fin de línea por línea al reconciliar bloques legacy

> Release 0.23.0. Change funcional con delta en `prompt-contracts`.

## Problema

`reconcileLegacyBlocks` re-join el archivo completo con el fin de línea (EOL) dominante cuando
elimina un run legacy. En un archivo de EOL mixto —por ejemplo, 2 líneas CRLF y 6 LF— la eliminación
normaliza todas las líneas al EOL dominante y reescribe líneas que no formaban parte del run
eliminado. El comportamiento está reproducido.

## Cambio propuesto

Cambiar sólo el re-join del camino `removed === true` para preservar el EOL original de cada línea
superviviente: la división captura el EOL por línea y el armado final usa el EOL propio de cada línea
conservada. Cuando no se elimina ningún run legacy, la función SHALL seguir devolviendo el contenido
byte a byte. La semántica de eliminación no cambia. El contrato exacto vive en el delta de
`prompt-contracts`; este proposal no lo re-enuncia.

## Alcance

In scope:

- `src/cli/index.js` (`reconcileLegacyBlocks`) — re-join con EOL por línea.
- `test/cli.test.js` — cobertura de EOL mixto y homogéneo, byte-identidad sin eliminación y
  preservación de la línea final.

Out of scope:

- MEM-05g (`maskLockedLines` con fences dentro de bloques `LOCKED`): inalcanzable con los templates
  reales, ver `Fuera de alcance`.
- Qué líneas constituyen el run legacy y la coincidencia exacta de firmas.
- El resto de la reconciliación de superficies mergeadas.

## Riesgos

- Alterar el estado de newline final: mitigación preservando el EOL propio de la última línea
  superviviente y cubriéndolo con un escenario explícito.
- Regresar el early return sin eliminación: protegido como invariante byte a byte y cubierto por
  test.
- Un cambio de semántica de eliminación por accidente: el cambio se limita al armado del resultado.

## Decisión de arquitectura

Ninguna. Es un cambio local de armado dentro de una función existente; no crea capas, interfaces ni
configuración. No se requiere `design.md`.

## Fuera de alcance

- **D-g — fences dentro de bloques `LOCKED` (MEM-05g)**: inalcanzable; 0 fences en cada región
  `LOCKED` de `templates/`, `profiles/` y archivos raíz.
- **A1 — aviso por `.opencode/*` en `installedPaths`**: refutado; falso positivo en toda instalación
  sana de `opencode` y contradice `import-installed-paths-union-not-copy`.
- **B — T25 `formatVersion`**: refutado; los exports viejos ya importan sin pérdida y un envelope
  rompería el import.
- **E — CH-09e/h**: sin consumidor; el índice siempre está presente.
- **F — #6 ordering**: ya corregido; "archive→merge" se contradice.
- **G — CH-10/T30**: no testeable offline; depende del passthrough de `opencode`.
- **H — multi-worktree y curación de la DB**: diferido por decisiones previas.

## Decisiones

- **memory_key:** reconcile-legacy-preserves-per-line-eol
  **Elección:** Dividir el contenido capturando el EOL de cada línea y re-armar las líneas
  supervivientes con su propio EOL original; dejar intacto el early return cuando no hubo
  eliminación.
  **Descartado:** Conservar el re-join con el EOL dominante; normalizar todo el archivo a LF.
  **Justificación:** La eliminación de un run legacy no debe reescribir líneas ajenas al run; la
  preservación por línea mantiene los bytes de las líneas supervivientes y no toca el camino sin
  eliminación.
  **Estado:** aprobado

refs:
  - path:src/cli/index.js
  - spec:prompt-contracts#Preservación del fin de línea por línea al reconciliar bloques legacy
  - change:template-legacy-eol-preservation

- **memory_key:** locked-inner-fence-hardening-deferred
  **Elección:** Diferir MEM-05g: no implementar detección de fences dentro de bloques `LOCKED` en
  `maskLockedLines`.
  **Descartado:** Implementar el endurecimiento de fences internos en este change.
  **Justificación:** Es inalcanzable con los templates reales del repositorio: hay 0 fences dentro de
  cada región `LOCKED` de `templates/`, `profiles/` y los archivos raíz. Implementarlo agregaría
  caminos sin consumidor verificable.
  **Estado:** descartado

refs:
  - path:src/cli/index.js
  - spec:prompt-contracts#Reconciliación de superficies mergeadas por bloques
  - change:template-legacy-eol-preservation
