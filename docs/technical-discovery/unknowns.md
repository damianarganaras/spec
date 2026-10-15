---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-10-14T22:01:41Z
pluginVersion: 0.11.1
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (614 fuentes, ~10.0k tokens). Las descripciones de flujo de `src/**`
  provienen de firmas + `README.md` + `BACKLOG.md` + `CHANGELOG.md` + specs de `aspec/`, más
  lectura puntual de los archivos citados. Confirmar cualquier detalle fino en el archivo citado.
- **Markdown fuera del pack.** El tier resuelto (`minimo`, vía `.opencode/.ancleto-tier`) ignora
  `test/**`, `docs/**` y `**/*.md`; Repomix además respeta `.gitignore` (`.opencode/`,
  `.ancletorc`, `.ancleto/`, `/documentation`). Por eso `agents/`, `commands/`, `skills/`,
  `templates/`, `docs/` y `documentation/` **no aparecen** en el pack. Se describen a partir de
  listados de directorio, `README.md`, `BACKLOG.md`, `CHANGELOG.md` y los specs de `aspec/`.
  Consecuencia: el próximo `--check` puede no detectar cambios dentro de esas áreas si el pack
  sigue ignorándolas.
- **`.ancletorc` presente pero no leído.** Existe (gitignored); por contrato de la skill no se
  lee directamente: su contenido se consume solo resuelto vía `ancleto discovery --check`
  (`config.outputDir`, `config.tier`, `config.exclude`). El comportamiento del CLI con
  `.ancletorc` se describe por código y specs, no por un manifiesto observado. En particular, el
  **tier resuelto `minimo`** proviene del reporte, no de leer el archivo.
- **Cambios de v0.11.1 sin entrada en CHANGELOG.** `package.json` marca `0.11.1`, pero
  `CHANGELOG.md` cubre hasta `0.11.0`: el bump corresponde al change activo `token-budget`, cuya
  documentación de release aún no se escribió. Los detalles de ese change se tomaron de
  `aspec/changes/token-budget/`, no del changelog.
- **Cambios en markdown no verificables por el pack.** El change `token-budget` modificó
  `agents/*.md`, `templates/AGENTS.md`, `AGENTS.md` y 10 `skills/*/SKILL.md` (dedupe de reglas,
  envelope por tramo, host-scoped) y relajó `test/content-guards.test.js`; esos archivos están
  fuera del pack. Se describen por `aspec/changes/token-budget/` y lectura puntual de `AGENTS.md`.
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `TIERS`, `ANTIGRAVITY_TOOL_MAP`, `AGENT_ADAPTER_DROP`,
  `CAVEMAN_USAGE_NOTE` aparecen en el código; el pack comprimido solo muestra firmas. Pueden
  quedar desactualizados si cambian sin alterar firmas.
- **Mapeo de tools de Antigravity**: los 5 ids (`view_file`, `replace_file_content`,
  `grep_search`, `run_command`, `manage_task`) y la política de omisión están cubiertos por
  `test/adapters-frontmatter.test.js`; no se validaron contra un host Antigravity real.
- **Adaptación de frontmatter por host**: la lógica y el dispatch están verificados por tests,
  pero el resultado final no se comparó contra cada IDE real (Copilot, Antigravity IDE/CLI y VS
  Code requieren entornos reales). La validación de `ancleto check` contra el adaptador se
  describe por código; no se ejecutó sobre un proyecto multi-host real.
- **Día-cero y host-scoped**: los comportamientos se describen por código (`renderWorkingContextBlock`,
  `formatTopologyBlock`, `hostSupportsCompression`) y por las delta specs de `token-budget`; no
  se re-ejecutó la suite para confirmarlos en verde (el tier `minimo` excluye `test/**`).
- **`PRODUCT.md` desactualizado**: afirma que `package.json` no define scripts npm, pero
  `lint` y `test` existen desde `add-standard-linter`. La copia versionada quedó atrás respecto
  del código.
- **`aspec/`**: 14 specs fuente + 2 changes activos (`ancleto-vscode-extension` diferido y
  `token-budget` en curso) + 18 archivados (incluye `2026-10-05-memory-actor-provenance`). No se
  analizó el contenido completo de cada spec/delta más allá de las capabilities afectadas.
- **`documentation/` (≈340 archivos, incluye `lnx-cli/` y PDFs)** es material legado de otro
  CLI, usado como fuente de relevamiento. No se analizó su contenido.
- **Memoria del repo**: `ancleto memory list` es la fuente de las decisiones registradas; no se
  inspeccionó la base completa ni nodos superseded.
- **`sourcesSha` de los dossiers** fue calculado replicando el esquema de `hashSources` del CLI
  (`rel`, `\0`, longitud, `\0`, contenido, `\n`, ordenado) sobre los globs indicados; no fue
  emitido por un subcomando del CLI. Sirve como referencia, no como valor canónico.
- **Tests**: 381 tests / 82 suites en verde en v0.10.0 (verificado ejecutando `npm test` en esa
  regeneración); en esta regeneración a `0.11.1` **no se re-ejecutaron** (el tier `minimo` excluye
  `test/**` del pack y la validación del seed es state-only).
