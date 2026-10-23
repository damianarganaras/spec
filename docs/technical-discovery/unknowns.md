---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-10-17T04:04:04Z
pluginVersion: 0.13.2
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (312 fuentes, ~366k tokens). Las descripciones de flujo de `src/**`
  provienen de firmas + `README.md` + `BACKLOG.md` + `CHANGELOG.md` + specs de `aspec/`, más
  lectura puntual de los archivos citados. Confirmar cualquier detalle fino en el archivo citado.
- **Markdown fuera del pack.** El tier resuelto (`minimo`, vía `.opencode/.ancleto-tier`) ignora
  `test/**`, `docs/**` y `**/*.md`; Repomix además respeta `.gitignore` (`.opencode/`,
  `.ancletorc`, `.ancleto/`, `/documentation`). Por eso `agents/`, `commands/`, `skills/`,
  `templates/`, `docs/` y `documentation/` **no aparecen** en el pack. Se describen a partir de
  listados de directorio, `README.md`, `BACKLOG.md`, `CHANGELOG.md`, los specs de `aspec/` y
  lectura puntual de `agents/*.md`. Consecuencia: el próximo `--check` puede no detectar cambios
  dentro de esas áreas si el pack sigue ignorándolas.
- **`.ancletorc` presente pero no leído.** Existe (gitignored); por contrato de la skill no se
  lee directamente: su contenido se consume solo resuelto vía `ancleto discovery --check`
  (`config.outputDir`, `config.tier`, `config.exclude`). En particular, el **tier resuelto
  `minimo`** proviene del reporte, no de leer el archivo.
- **`CHANGELOG.md` limitado a `0.12.1`.** `package.json` marca `0.13.2`; el changelog no tiene
  aún entradas para `0.13.0`/`0.13.1`/`0.13.2`. Los cambios de `0.12.0`/`0.12.1` (skill
  `ancleto-update`, host `commandcode`) sí están documentados; los saltos a `0.13.x` se infieren
  del código/specs (`memory-ops`, `contrato-validaciones`, `token-budget`, `throughput-pipeline`,
  `memory-cli-writes-refresh-working-context`), no de una entrada de release.
- **Change abierto `memory-cli-writes-refresh-working-context`.** Este change aún **no está
  archivado**; el seed describe su contenido desde el pack (proposal, design, tasks, delta
  spec) y desde el código actual de `src/core/memory/working-context.js` y `src/cli/index.js`,
  que ya contiene los helpers (`refreshWorkingContextOnWrite`, `checkWorkingContextFreshness`)
  y la integración CLI (`memoryImport`, `memoryDoctorCmd`). Riesgo: si el change se reabre o
  archiva con cambios, partes del seed pueden quedar desactualizadas hasta la próxima corrida.
- **Cambios archivados recientes.** `token-budget` y `contrato-validaciones` (2026-10-14),
  `throughput-pipeline` (2026-10-15) y el abierto `memory-cli-writes-refresh-working-context`
  (2026-10-17) están en `aspec/changes/` y `aspec/changes/archive/`; sus specs fuente viven en
  `aspec/specs/prompt-contracts/`, `aspec/specs/memory-engine/`, `aspec/specs/review/` y
  `aspec/specs/agent-install-routing/`. Se leyeron las specs fuente y los deltas relevantes, no
  el contenido completo de cada artifact del change.
- **Contrato de validaciones: fuente declarada, no ejecutada.** La política (bloque `LOCKED:
  validation-commands`) prohíbe fijar comandos; este repo declara `npm run lint` y `npm test`,
  format `not-configured` y typecheck no aplicable (`PRODUCT.md`). No se ejecutaron `lint`/`test`
  en esta regeneración (la validación del seed es state-only y el tier excluye `test/**`).
- **Cambios en markdown no verificables por el pack.** `throughput-pipeline` modificó
  `agents/{orchestrator,tester,reviewer,memory-keeper}.md` (paralelización del cierre, ledger
  prearmado, affected-set como scope, memoria en un paso) y `test/content-guards.test.js`
  (relajó/agregó guards). El abierto `memory-cli-writes-refresh-working-context` modificó
  `agents/orchestrator.md` (sección `## Project Memory Rules`, refresco on-write CLI) y
  `README.md` (sección de memoria: enumera los puntos de regeneración e incluye el chequeo
  advisory). Esos archivos están fuera del pack: se describen por las specs fuente
  (`prompt-contracts`, `memory-engine`), los deltas del change y lectura puntual.
- **Affected-set: mecanismo descrito por código comprimido + spec + tests, no ejecutado.** La
  semántica del clasificador (conservador por argumento, literal puro seguido de `)`), la
  taxonomía cerrada de 4 categorías y `externalCount` se tomaron del módulo
  `src/core/affected-set.js`, de `aspec/specs/prompt-contracts/spec.md` y de
  `test/affected-set.test.js`. **No se ejecutó** `ancleto affected` ni la suite en esta
  regeneración, y **no se validó contra un monorepo real con alias de paths**: la resolución de
  alias queda delegada al mecanismo declarado por el proyecto (`PRODUCT.md` →
  `## Project Commands`) y no está cubierta por el grafo.
- **Conteos de assets**: 10 agents, 16 commands, 21 directorios de skills (~35 archivos),
  17 specs, 2 changes activos + 23 archivados, `src` 11, `test` 11, `aspec` 125,
  `total_files` 321. Tomados de `.discovery-map.json` (regenerado por la corrida del pack de
  esta regeneración) y de listados de directorio. **Diferencias con el seed anterior**:
  `src` 13→11 (firma `freshness` probablemente re-estructurada), `aspec` 121→125 (cambio
  abierto + sus delta specs), `total_files` 655→321 (el conteo anterior era inflación de la
  corrida previa; el nuevo refleja el estado real del checkout).
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `TIERS`, `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`,
  `AGENT_ADAPTER_DROP`, `CAVEMAN_USAGE_NOTE` aparecen en el código; el pack comprimido solo
  muestra firmas. Pueden quedar desactualizados si cambian sin alterar firmas.
- **Mapas de tools (Antigravity/Command Code)**: los ids y la política de omisión están
  cubiertos por `test/adapters-frontmatter.test.js`; no se validaron contra hosts reales.
- **Adaptación de frontmatter por host**: la lógica y el dispatch están verificados por tests,
  pero el resultado final no se comparó contra cada IDE real (Copilot, Antigravity, VS Code y
  Command Code requieren entornos reales).
- **Día-cero y host-scoped**: los comportamientos se describen por código
  (`renderWorkingContextBlock`, `formatTopologyBlock`, `hostSupportsCompression`) y por los
  deltas archivados de `token-budget`; no se re-ejecutó la suite para confirmarlos en verde.
- **Refresh on-write CLI y chequeo advisory**: descritos por el código actual
  (`refreshWorkingContextOnWrite`, `checkWorkingContextFreshness` en `working-context.js`;
  `memoryImport` y `memoryDoctorCmd` en `src/cli/index.js`), por el delta de spec
  (`aspec/specs/memory-engine/spec.md`, Requirements "Frescura del working-context tras
  escrituras de la CLI" y "Detección de staleness del working-context") y por el change
  abierto. No se re-ejecutó `test/cli.test.js` ni `test/working-context.test.js` en esta
  regeneración para confirmar los nuevos casos en verde.
- **`optimizacion-de-tokens.md` es análisis, no contrato.** Mide costo (tier resuelto `normal`
  según su encabezado, hoy `minimo` en el checkout) y deja la promesa "optimizador de tokens"
  como decisión pendiente; sus cifras no se re-verificaron en esta regeneración.
- **`aspec/`**: 17 specs fuente + 2 changes activos (`ancleto-vscode-extension`,
  `memory-cli-writes-refresh-working-context`) + 23 archivados. No se analizó el contenido
  completo de cada spec/delta más allá de las capabilities afectadas (`prompt-contracts`,
  `review`, `memory-engine`, `agent-install-routing`).
- **`documentation/` (gitignored, 0 archivos en `tree_summary`)** es material legado de otro
  CLI, usado como fuente de relevamiento. No se analizó su contenido; la cifra ≈340 del seed
  anterior quedó obsoleta tras un cambio en `.gitignore`.
- **Memoria del repo**: `ancleto memory list` es la fuente de las decisiones registradas; no se
  inspeccionó la base completa ni nodos superseded.
- **`sourcesSha` de los dossiers** fue calculado replicando el esquema de `hashSources` del CLI
  (`rel`, `\0`, longitud, `\0`, contenido, `\n`, ordenado) sobre los globs indicados, a partir de
  las fuentes del `.discovery-state.json` recién escrito; no fue emitido por un subcomando del
  CLI. Sirve como referencia, no como valor canónico.
- **Tests**: la cifra de tests en verde **no se re-ejecutó** en esta regeneración (el tier
  `minimo` excluye `test/**` del pack y la validación del seed es state-only). El seed anterior
  citaba 492/100 (al cierre de `throughput-pipeline`); con los nuevos casos de
  `memory-cli-writes-refresh-working-context` (`test/cli.test.js` + `test/working-context.test.js`)
  la cifra esperada es mayor, pero no se verificó en esta corrida. `BACKLOG.md` registraba 331
  tests (2026-10-02).