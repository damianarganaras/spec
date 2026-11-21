# Tasks: Endurecimiento de la matriz de hosts

> Change funcional con delta `ADDED` en `agent-install-routing`. Sin `design.md`: no hay cambio de
> arquitectura; la matriz se apoya en los dueños existentes (`AGENT_TARGETS`, `adaptFrontmatter`,
> `mergeTemplateInto`, `HOST_MCP_TARGETS`).
> Validaciones declaradas en `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests
> `npm test`; para pasos acotados, rutas explícitas (`node --test test/host-matrix.test.js`). Format
> check `not-configured`; typecheck no existe (JavaScript ESM, sin `tsconfig.json`).

## File-set de implementación (autorizado)

- `test/host-matrix.test.js` (nuevo) — oráculo offline de la matriz host × operación.
- `test/affected-tests.json` — Amendment A1: coupling `src/cli/**` → `test/host-matrix.test.js`
  (la suite spawnea el CLI y no deja edge en el grafo de imports).
- `test/test-selection.test.js` — Amendment A1: pin del coupling anterior con semilla real
  `src/cli/index.js`.
- `test/cli.test.js` — sólo si un defecto confirmado necesita un caso en la suite existente; no
  duplicar la matriz completa.
- `test/adapters-frontmatter.test.js` — sólo si un defecto confirmado pertenece al adaptador de
  frontmatter.
- `src/cli/index.js` — sólo los dueños existentes: `installAgentAssets`, `installAssetFiles`,
  `copyDirTransformed`, `copyTemplates`, `mergeTemplateInto`/`mergeLocked`, `setupHostMcp`,
  `refreshCopilotMcp`, `refreshCommandCodeMcp`, `upgradeCmd` e `importCmd`.
- `src/core/adapters/frontmatter.js` — sólo si un defecto confirmado pertenece a la adaptación.
- `aspec/changes/ch-10-host-matrix-hardening/**` — estos artefactos.

Fuera del file-set: la forma de `AGENT_TARGETS`, `HOST_MCP_TARGETS` o `SUPPORTED_AGENTS`; hosts o
assets nuevos; comandos y flags nuevos; `package.json`; documentación de migración/rollback; smoke
contra hosts reales; eje versión de host; T30; schema o motor de memoria; `.ancleto/memory.db`.
Ningún content guard puede hardcodear la ruta activa del change; si en el futuro se agrega uno,
debe resolver por el sufijo `-ch-10-host-matrix-hardening` y fallar cerrado ante 0 o más de una
coincidencia.

## Fase 1 — Oráculo de la matriz

- [x] **1.1** Declarar en `test/host-matrix.test.js` la tabla esperada de los ocho hosts
  (`opencode`, `claude`, `vscode`, `antigravity`, `cursor`, `roo`, `copilot`, `commandcode`) con:
  directorio y extensión de `skills`, `agents` y `commands`; el empaquetado `skill-dir` de los
  commands de `antigravity`; assets no soportados; y destino MCP (`archivo`, `esquema` o `null`).
  **Hecho cuando:** la tabla cubre los ocho hosts y el test falla si se omite un host o un asset.

- [x] **1.2** Implementar el harness de ejecución offline: un proyecto temporal por host, entorno
  determinista (`ANCLETO_PROJECTS_FILE` apuntando a un registro temporal) y ejecución del CLI por
  `process.execPath`. Usar `--tier minimo` donde el comando lo requiera y `--no-mcp` en las filas
  que sólo prueban assets.
  **Hecho cuando:** `init`, `install`, `update`, `upgrade` e `import --repair` corren sin red, sin
  host real instalado y sin binarios de host, y cada corrida sale con exit 0 en el caso base.

- [x] **1.3** Cubrir assets para `init`, `install`, `update` y `upgrade`: cada asset soportado en el
  directorio y la extensión declarados para el host; ningún asset no soportado; ningún asset en un
  directorio base no declarado para ese host; `.ancletorc.installedPaths` registra las rutas
  escritas por las operaciones que reescriben el manifiesto.
  **Hecho cuando:** una ruta, extensión o asset no soportado incorrecto hace fallar el test.

- [x] **1.4** Cubrir coherencia de mirrors: el cuerpo de cada agent, skill y command escrito
  coincide con la fuente canónica procesada por el dueño único de adaptación para ese host; el
  frontmatter lleva la firma del host y no la de otro; las notas host-scoped documentadas del
  orchestrator no cuentan como divergencia.
  **Hecho cuando:** un mirror producido con el adaptador de otro host o con una transformación no
  documentada hace fallar el test.

- [x] **1.5** Cubrir `LOCKED`/`EXTENSIBLE`: sembrar `AGENTS.md`/`PRODUCT.md` con un bloque `LOCKED`
  desactualizado y contenido `EXTENSIBLE` propio; ejecutar cada operación que reescribe templates;
  afirmar que el bloque queda alineado con la fuente canónica y que el contenido `EXTENSIBLE` se
  preserva. Afirmar que `import --repair` sin bundle deja ambos templates byte-idénticos.
  **Hecho cuando:** perder una línea `EXTENSIBLE` o conservar un `LOCKED` desactualizado hace fallar
  el test.

- [x] **1.6** Cubrir MCP por host y operación: si la operación escribe MCP, sólo escribe o mergea el
  archivo y el esquema declarados para el host activo; no crea ni modifica el archivo MCP de otro
  host. Para `claude`, `vscode`, `cursor` y `roo`, ninguna operación crea archivo MCP ni
  `.opencode/opencode.json`, y se emite como máximo un aviso no bloqueante que nombra el host.
  Cubrir además `upgrade` con `copilot` y `commandcode`: sólo refresca el destino declarado de ese
  host.
  **Hecho cuando:** una escritura MCP fuera del destino declarado, una creación de
  `.opencode/opencode.json` por un host sin destino o un aviso duplicado hace fallar el test.

- [x] **1.7** Cubrir no destrucción e idempotencia: un proyecto con assets de un host previo
  conserva esos assets al ejecutar una operación para otro host; ejecutar dos veces la misma
  operación conserva el conjunto de assets y el conjunto de entradas MCP; `import --repair` sin
  bundle sobre un proyecto con MCP sano deja el proyecto byte-idéntico.
  **Hecho cuando:** una segunda corrida borra assets o entradas, o cambia bytes en
  `import --repair`, hace fallar el test.

## Fase 2 — Triaje y correcciones

- [x] **2.1** Ejecutar la matriz y clasificar cada fallo en: violación del contrato vigente, error
  del oráculo o comportamiento fuera de alcance. Registrar el veredicto por caso.
  **Hecho cuando:** cada fallo tiene veredicto y evidencia; los fuera de alcance se excluyen con
  motivo explícito y sin ensanchar el contrato.

- [x] **2.2** Corregir sólo las violaciones confirmadas, en la capa dueña existente y dentro del
  file-set autorizado. No cambiar el descriptor, el adaptador ni el contrato para hacer pasar la
  matriz. Si una corrección exige un cambio de contrato o de descriptor, detenerse y reportarlo.
  **Hecho cuando:** cada corrección tiene un test que falla con el código anterior y pasa con el
  nuevo, y el diff no toca archivos fuera del file-set.

- [x] **2.3** Convertir cada corrección confirmada en una aserción permanente de la matriz, no en un
  caso aislado.
  **Hecho cuando:** la matriz falla si se revierte la corrección.

- [x] **2.4** Si la matriz no expone ninguna violación, no tocar `src/` y dejar constancia en el
  ledger de que el change cierra como contrato + tests.
  **Hecho cuando:** `git diff -- src/` está vacío y el ledger lo declara.

## Fase 3 — Validación

- [x] **3.1** Ejecutar `npm run lint`.
  **Hecho cuando:** sale con código 0.

- [x] **3.2** Ejecutar `node --test test/host-matrix.test.js` y, si se tocó un archivo existente, su
  ruta explícita (`node --test test/cli.test.js` y/o `node --test test/adapters-frontmatter.test.js`).
  **Hecho cuando:** sale con código 0 y sin fallos nuevos respecto del baseline.

- [x] **3.3** Ejecutar `npm test`.
  **Hecho cuando:** la suite declarada pasa completa; cualquier skip preexistente se reporta como
  tal.

- [x] **3.4** Registrar las validaciones no configuradas: format check `not-configured` y typecheck
  no existe en este repositorio.
  **Hecho cuando:** ambas omisiones quedan anotadas en el reporte de cierre del change.

## Ledger de triaje (Fase 2)

- **2.1 — Veredicto:** la matriz corrió completa sobre los ocho hosts y las cinco operaciones sin
  fallos. No hubo violaciones del contrato vigente, errores del oráculo ni casos fuera de alcance
  que registrar.
- **2.2 — Correcciones:** ninguna. `git diff -- src/` queda vacío; `src/cli/index.js` y
  `src/core/adapters/frontmatter.js` no se modificaron.
- **2.3 — Aserciones permanentes:** la matriz completa (`test/host-matrix.test.js`) es la aserción
  permanente del contrato; no hay corrección que convertir.
- **2.4 — Resultado:** el change cierra como contrato + tests. No se inventaron cambios de runtime.
- **3.3 — Cumplido:** `npm test` pasa completa (1529 tests, 1524 pass, 0 fail, 5 skip
  preexistentes de plataforma/entorno; ninguno en `test/host-matrix.test.js`). Amendment A1
  aplicado: `src/cli/**` selecciona `test/host-matrix.test.js` y queda pineado con semilla real
  `src/cli/index.js` en `test/test-selection.test.js`.
