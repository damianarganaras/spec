# Proposal: Descubrimiento agéntico del catálogo de modelos

## Intención

Hacer que el snapshot de catálogo (`src/core/model-catalog.json`) se pueda refrescar de forma
completa, verificada y auditable desde una máquina de mantenimiento, sin introducir descubrimiento en
runtime: enumerar todos los proveedores de `opencode models`, forzar `--refresh`, clasificar la
frescura, rechazar caché offline, escribir de forma atómica, reportar el diff y dejar el snapshot como
artefacto revisado. Añadir a `ancleto check` un aviso no bloqueante cuando un `model:` del mirror no
figura en el snapshot, para que la deriva se vea antes de que falle el host.

## Problema

- **El refresco no descubre proveedores nuevos.** `scripts/refresh-model-catalog.mjs` sólo itera los
  proveedores ya presentes en el snapshot (3) y nunca consulta los otros que reporta `opencode
  models` (5 en la verificación del 2026-11-03). El snapshot queda como subconjunto estricto y no
  puede detectar un proveedor que aparece o desaparece.
- **Una salida offline se confunde con fresca.** El script no pasa `--refresh`. `opencode models`
  puede salir con exit 0 desde caché y devolver un conjunto distinto (aparece `github-copilot`), así
  que una corrida sin red puede sellar como "fresco" un catálogo que no lo es.
- **Escritura no atómica y fallo total por un proveedor.** El script escribe directo sobre el
  snapshot y aborta toda la corrida si un proveedor falla. Un corte a mitad de escritura trunca el
  JSON y no hay clasificación de `binary-missing`, `network-unavailable` o `partial`.
- **Sin diff ni rechazo del modelo gratis.** No hay reporte de altas, bajas y cambios de `cost`/
  `limit`, ni una validación que impida que `opencode/big-pickle` deje de costar 0.
- **La deriva es silenciosa en `check`.** Si un `model:` del mirror no figura en el snapshot, `check`
  no lo señala: el problema aparece recién cuando el host intenta usar el modelo.
- **El snapshot incompleto produce falsos avisos.** Un snapshot de 3 proveedores no puede distinguir
  "ID ausente del catálogo" de "proveedor no snapshoteado"; cualquier aviso de deriva sería ruidoso.
- **No hay procedimiento de mantenimiento.** El refresco es un script sin un flujo documentado de
  revisión, clasificación y commit que un agente pueda seguir.

## Cambio propuesto

1. **Tooling de descubrimiento dev-only.** Se extiende `scripts/refresh-model-catalog.mjs` para
   enumerar **todos** los proveedores desde `opencode models` (salida plana), consultar cada uno con
   `opencode models <provider> --verbose`, pasar `--refresh` en ambas formas, detectar el marcador
   `Failed to fetch models.dev` y clasificar el resultado como `available`, `binary-missing`,
   `network-unavailable` o `partial`. El script calcula el diff contra el snapshot vigente, valida la
   forma, rechaza un `opencode/big-pickle` que deje de costar 0, escribe de forma atómica (temporal +
   rename) y emite un reporte candidato fuera del snapshot commiteado. Nunca reemplaza el snapshot
   sin una acción explícita de escritura.
2. **Helpers puros y testeables.** Se crea `src/core/model-catalog.js` con el parseo de la salida, la
   enumeración de proveedores, el diff, la validación de forma, la clasificación de frescura y el
   cálculo de antigüedad. No importa `node:child_process`, no hace red y no escribe archivos. El
   `spawn` queda sólo en `scripts/`; `src/core/tier-models.js` sigue sin `child_process` y conserva
   el dueño único de `TIERS`/`TIER_CHAINS`.
3. **Aviso de deriva no bloqueante en `check`.** Si un `model:` del mirror de `opencode` no figura en
   el snapshot, `check` emite un warning que nombra el archivo y el ID y sugiere refrescar. No cambia
   el exit code, no altera el conjunto de aceptación del oráculo y no toca la validación de
   frontmatter. Se agrega, además, un aviso informativo único por ejecución cuando `generated_at`
   supera un umbral fijo de antigüedad, sin TTL en runtime.
4. **Refresco del snapshot.** Se reemplaza `src/core/model-catalog.json` con la salida verificada
   (todos los proveedores) sólo si pasa las validaciones del tooling, conservando el schema
   `{ generated_at, source: { method, providers }, providers }`.
5. **Procedimiento documentado.** Se documenta en `README.md` la mini-sesión de mantenimiento con los
   comandos, las cuatro clasificaciones, la revisión del diff, la validación, el commit y el uso de
   agentes/skills existentes. No se crea un agente ni una skill nuevos.
6. **Spec delta.** Se modifica el requirement de snapshot/guard y se agregan requirements de
   descubrimiento dev-only, deriva no bloqueante y procedimiento documentado en
   `aspec/changes/ch-12-agentic-model-discovery/specs/agent-model-tiers/spec.md`.

## Alcance

**In scope**

- `src/core/model-catalog.js` (nuevo): helpers puros de parseo, enumeración, diff, validación,
  clasificación de frescura y antigüedad.
- `scripts/refresh-model-catalog.mjs`: descubrimiento completo, `--refresh`, clasificación, diff,
  escritura atómica, rechazo de `opencode/big-pickle` no gratis y reporte candidato.
- `src/core/model-catalog.json`: refresco con todos los proveedores verificados.
- `src/cli/index.js`: aviso no bloqueante de deriva y de antigüedad en `check`, reutilizando el
  catálogo cargado; sin cambios en el exit code ni en el conjunto de aceptación.
- `test/model-catalog-discovery.test.js` (nuevo): helpers puros, escritura atómica y guard de
  contenido/doc.
- `test/cli.test.js`: regresiones del aviso de deriva, catálogo ilegible y catálogo antiguo.
- `README.md`: sección de mantenimiento del catálogo.
- Delta spec en `aspec/changes/ch-12-agentic-model-discovery/specs/agent-model-tiers/spec.md`.

**Out of scope / no-goals**

- Descubrimiento en `install`, `update`, `init`, `check`, tests o primera ejecución; triggers por
  403/404/`insufficient funds`.
- Cambiar la forma de `TIERS` (agente→string), agregar cadenas a `normal`/`gratis` o persistir modelos
  en `.opencode/.ancleto-tier`.
- Leer `~/.cache/opencode/models.json`; tocar adaptadores de hosts, mirrors `.opencode/**` o
  `opencode.json`.
- Sustitución de proveedor/modelo Qwen.
- Menores de 0.18.10: `gratis` agente primario custom→403, `import` sin `installedPaths`,
  `TIER_CHAINS` head, `scripts/` fuera de `files`.
- Crear una capability, un agente o una skill nuevos.

## Arquitectura

- **Dev vs runtime.** Todo lo que ejecuta `opencode` vive en `scripts/` y se corre a mano. El runtime
  (`install`, `init`, `import`, `check`, tests) sigue leyendo sólo el snapshot commiteado.
- **Dueño de los helpers puros.** `src/core/model-catalog.js` concentra parseo, enumeración, diff,
  validación de forma, clasificación y antigüedad. No importa `node:child_process`, no hace red y no
  escribe archivos. `src/core/tier-models.js` conserva `TIERS`, `TIER_CHAINS`, el loader y el
  resolver, y sigue sin `child_process`; no se mueve ni se duplica `TIERS`.
- **Único punto con `child_process`.** `scripts/refresh-model-catalog.mjs` conserva el `spawnSync`
  con el manejo de Windows vigente, orquesta el descubrimiento y es el único que escribe el snapshot.
  Exporta la escritura atómica para poder testearla sin ejecutar `opencode`.
- **Sin capability nueva.** El hogar es `agent-model-tiers`: ya define el snapshot verificado, el
  guard y el refresco. El aviso de deriva extiende ese contrato, no una capability separada.
- **Sin agente ni skill nuevos.** El procedimiento usa los agentes/skills existentes
  (`technical-discovery` para el análisis acotado del diff y `memory-keeper` para registrar la
  decisión).

## Spec delta

Delta en `aspec/changes/ch-12-agentic-model-discovery/specs/agent-model-tiers/spec.md`:

- **ADDED** `Descubrimiento dev-only del catálogo con clasificación de frescura`: enumeración completa
  de proveedores, `--refresh`, clasificación `available | binary-missing | network-unavailable |
  partial`, diff, escritura atómica, rechazo de `opencode/big-pickle` no gratis, reporte candidato y
  helpers puros sin procesos.
- **ADDED** `Advertencia no bloqueante de deriva del catálogo en check`: warning por `model:` ausente
  del snapshot y aviso informativo por antigüedad, sin cambiar el exit code ni el conjunto de
  aceptación.
- **ADDED** `Procedimiento de mantenimiento del catálogo documentado`: README con el flujo manual y
  agentes/skills existentes.
- **MODIFIED** `Snapshot de catálogo verificado y guard de disponibilidad de IDs`: snapshot con todos
  los proveedores enumerados, método con `--refresh`, escritura atómica y fallo explícito sin
  reemplazo ante salida parcial/offline.

## Paths autorizados del change

- `aspec/changes/ch-12-agentic-model-discovery/**`
- `src/core/model-catalog.js` (nuevo)
- `scripts/refresh-model-catalog.mjs`
- `src/core/model-catalog.json`
- `src/cli/index.js`
- `test/model-catalog-discovery.test.js` (nuevo)
- `test/cli.test.js`
- `README.md`

## Riesgos

- **(i) `--refresh` no disponible o con otra forma en la versión de `opencode` del maintainer.**
  Mitigación: la fase 0 verifica el comando real antes de escribir código; si no existe, se detiene y
  se reporta, sin inventar un fallback silencioso.
- **(ii) Caché offline sellada como fresca.** Mitigación: `--refresh` obligatorio, detección del
  marcador `Failed to fetch models.dev`, clasificación explícita y prohibición de reemplazar el
  snapshot ante `network-unavailable`/`partial`.
- **(iii) Snapshot incompleto o malformado.** Mitigación: validación de forma antes de escribir
  (`generated_at`, `source`, proveedor↔ID, duplicados), dedupe y fallo cerrado sin reemplazo.
- **(iv) Crecimiento del snapshot (3→5 proveedores, 110→211 IDs).** Mitigación: guard existente
  (`test/model-catalog.test.js`) y validación de prefijo/dedupe; el diff del script es la fuente de
  verdad para revisar altas y bajas.
- **(v) Ruido del aviso de deriva.** Un modelo custom en el mirror generará un warning en cada
  `check`. Mitigación: es un warning no bloqueante, con archivo+ID y sugerencia de refresco; no
  cambia el exit code ni el conjunto de aceptación.
- **(vi) Ruido del aviso de antigüedad.** Mitigación: un único aviso por ejecución, umbral fijo de
  90 días, sólo con catálogo legible y sólo si el host `opencode` está instalado; no es TTL ni
  configuración de runtime.
- **(vii) Escritura atómica en Windows.** `rename` sobre un destino existente puede fallar por
  bloqueos del sistema. Mitigación: temporal en el mismo directorio, `rename` y limpieza en
  `finally`; si falla, el snapshot commiteado queda intacto y el script sale con error.
- **(viii) Guards de contenido del README.** Agregar la sección de mantenimiento puede chocar con
  anclajes existentes. Mitigación: se agrega al final de la sección de referencia, sin reescribir
  párrafos existentes, y se corre `test/content-guards.test.js` antes de cerrar.

## Supuestos

- `opencode 1.19.4` (verificado el 2026-11-03) acepta `--refresh` en la forma plana y en la forma
  `<provider> --verbose`; la fase 0 lo confirma en la máquina de mantenimiento.
- La salida plana de `opencode models` es una lista de `provider/model`, con IDs que pueden tener más
  de un `/` (`commandcode/deepseek/deepseek-v4.1-flash`); el proveedor es el primer segmento.
- `Failed to fetch models.dev` es el marcador estable de una corrida sin red.
- El conjunto verificado del 2026-11-03 (5 proveedores / 211 IDs) es el objetivo esperado del
  refresco; si el conjunto vivo difiere al implementar, el diff del script manda y la tarea registra
  la fecha y los conteos reales.
- `.ancleto/` está gitignored, así que `.ancleto/model-catalog.candidate.json` no se commitea.
- El umbral de antigüedad es una constante de 90 días, informativa y no configurable; no altera la
  resolución ni el exit code.

## Decisiones

- **memory_key:** `ch-12-discovery-outside-runtime`
  **Elección:** el descubrimiento es una operación dev/mantenimiento en `scripts/`, nunca en el path
  de runtime; el agente produce un snapshot revisado, no calcula la resolución de tiers.
  **Descartado:** descubrir en `install`/`update`/`init`/`check`/tests o en primera ejecución;
  disparar el descubrimiento por 403/404/`insufficient funds`.
  **Justificación:** el runtime debe ser determinista, offline y barato; el snapshot commiteado es
  auditable y reproducible. Mover el descubrimiento al runtime agrega red, latencia y
  no-determinismo en CI.
  **Refs:** `change:ch-12-agentic-model-discovery`; `path:scripts/refresh-model-catalog.mjs`;
  `path:src/cli/index.js`;
  `spec:agent-model-tiers#Snapshot de catálogo verificado y guard de disponibilidad de IDs`
  **Estado:** aprobado

- **memory_key:** `ch-13-refresh-online-guard`
  **Elección:** el refresco fuerza `--refresh` y rechaza salidas offline/cacheadas, clasificando
  `available | binary-missing | network-unavailable | partial` y sin reemplazar el snapshot ante
  `network-unavailable`/`partial`.
  **Descartado:** reutilizar la salida cache-first; confiar en el exit 0; leer
  `~/.cache/opencode/models.json` desde ancleto.
  **Justificación:** una corrida offline puede salir 0 con un conjunto distinto (aparece
  `github-copilot`) y sellar caché vieja como fresca. Forzar la red y detectar el marcador evita
  corromper el snapshot.
  **Refs:** `change:ch-12-agentic-model-discovery`; `path:scripts/refresh-model-catalog.mjs`;
  `spec:agent-model-tiers#Snapshot de catálogo verificado y guard de disponibilidad de IDs`
  **Estado:** aprobado

- **memory_key:** `normal-gratis-not-runtime-validated`
  **Elección:** sólo `minimo` usa la cadena del catálogo; `normal` y `gratis` no se validan en
  runtime y quedan en backlog.
  **Descartado:** agregar cadenas a `normal`/`gratis` o validar todos los tiers contra el catálogo en
  runtime ahora.
  **Justificación:** el contrato vigente sólo resuelve `minimo` por cadena; extenderlo cambia la
  forma/el comportamiento de los tiers y exige candidatos verificados que no están decididos.
  **Refs:** `change:ch-12-agentic-model-discovery`; `path:src/core/tier-models.js`;
  `spec:agent-model-tiers#Resolución de minimo por cadena de preferencia contra un catálogo verificado`
  **Estado:** aprobado

- **memory_key:** `model-catalog-drift-warning-nonblocking`
  **Elección:** la deriva se reporta como warning en `check`, sin cambiar el exit code ni el conjunto
  de aceptación.
  **Descartado:** hacer fallar `check` por deriva; refrescar automáticamente en `check`; alterar el
  conjunto de aceptación del oráculo.
  **Justificación:** el snapshot puede envejecer; fallar bloquearía proyectos offline y un refresco
  automático metería red en el runtime. El warning da señal accionable sin romper el contrato.
  **Refs:** `change:ch-12-agentic-model-discovery`; `path:src/cli/index.js`; `path:test/cli.test.js`;
  `spec:skill-frontmatter-adapters#ancleto check valida frontmatter de agents contra el adaptador y la canónica`
  **Estado:** aprobado

## Change Log

- 2026-11-04 — Creación del change (fuente: instrucción del usuario, contexto técnico verificado y
  catálogo del 2026-11-03). Clasificación `spec-required`; sin Work Item (Azure deshabilitado).
- 2026-11-04 — 2ª ronda: hardening de catálogo inválido, fechas reales, clasificación binary-missing
  cross-platform, seam testeable de main y README (commit bacbeed; tests en verde).
