# Proposal: Aviso de bundle legacy sin intención MCP en el import

> Release 0.23.0. Change funcional con delta en `project-portability`.

## Problema

Cuando `ancleto import` lee un bundle cuyo `manifest.mcp` está ausente —un bundle anterior a la
intención MCP host-aware— lo trata como intención vacía en silencio. El usuario no recibe ninguna
señal de que la configuración MCP no viajó en el bundle y puede atribuir la ausencia de MCP a un
fallo del import.

## Cambio propuesto

Emitir una única línea de aviso no bloqueante cuando `manifest.mcp === undefined`, sin alterar lo
escrito, sin impedir el import y sin cambiar el exit code. El contrato exacto de disparo, canal y
exclusiones vive en el delta de `project-portability`; este proposal no lo re-enuncia.

## Alcance

In scope:

- `src/cli/index.js` (`importCmd`) — aviso único cuando la clave `mcp` está ausente.
- `test/cli.test.js` — cobertura del aviso y de sus no-disparos.

Out of scope:

- El aviso por rutas `.opencode/*` en `installedPaths`: premisa refutada, ver `Fuera de alcance`.
- La validación de `manifest.mcp` no-array, que sigue fallando con exit 1.
- El comportamiento de escritura del import y el de `export`.

## Riesgos

- Un aviso mal ubicado podría emitirse también para `manifest.mcp: []`, que es un estado moderno y
  legítimo. Mitigación: el disparo se acota a `undefined` y se cubre con un escenario de no-disparo.
- Duplicar el aviso por ejecución. Mitigación: exactamente una línea por `import`.

## Decisión de arquitectura

Ninguna. Es una línea de aviso en un comando existente; no crea capas, interfaces ni configuración.
No se requiere `design.md`.

## Fuera de alcance

- **A1 — aviso por `.opencode/*` en `installedPaths`**: refutado; las instalaciones modernas y sanas
  de `opencode` registran esas rutas, así que el aviso dispararía en toda instalación correcta y
  contradice la decisión `import-installed-paths-union-not-copy`.
- **B — T25 `formatVersion`**: refutado; los exports viejos ya importan sin pérdida, las claves extra
  se ignoran y un envelope rompería el import.
- **D-g — fences dentro de bloques `LOCKED` (MEM-05g)**: inalcanzable con los templates reales.
- **E — CH-09e/h**: sin consumidor; el índice siempre está presente.
- **F — #6 ordering**: ya corregido; "archive→merge" se contradice.
- **G — CH-10/T30**: no testeable offline; depende del passthrough de `opencode`.
- **H — multi-worktree y curación de la DB**: diferido por decisiones previas.

## Decisiones

- **memory_key:** legacy-bundle-missing-mcp-key-advisory-only
  **Elección:** Emitir una única línea de aviso no bloqueante cuando `manifest.mcp === undefined`,
  sin alterar lo escrito, sin impedir el import y sin cambiar el exit code.
  **Descartado:** Tratar la ausencia como error; advertir también cuando `manifest.mcp` es `[]`;
  advertir por rutas `.opencode/*` en `installedPaths`.
  **Justificación:** La ausencia de la clave es la única señal inequívoca de un bundle previo a la
  intención MCP host-aware; `[]` es un estado moderno legítimo y las rutas `.opencode/*` son normales
  en instalaciones sanas. El aviso informa sin cambiar el contrato del comando.
  **Estado:** aprobado

refs:
  - path:src/cli/index.js
  - spec:project-portability#Aviso de bundle legacy sin intención MCP en el import
  - change:portability-legacy-bundle-advisory

- **memory_key:** opencode-installed-paths-not-drift
  **Elección:** Descartar el aviso por rutas `.opencode/*` presentes en `installedPaths`.
  **Descartado:** Advertir cuando `installedPaths` incluye `.opencode/agents`, `.opencode/commands` o
  `.opencode/skills`.
  **Justificación:** La premisa está refutada: las instalaciones modernas y sanas de `opencode`
  registran esas rutas, de modo que el aviso dispararía en toda instalación correcta y contradice la
  decisión `import-installed-paths-union-not-copy`.
  **Estado:** descartado

refs:
  - path:src/cli/index.js
  - path:aspec/specs/project-portability/spec.md
  - change:portability-legacy-bundle-advisory
