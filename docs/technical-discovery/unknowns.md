---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-10-02T20:32:00Z
pluginVersion: 0.11.0
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (604 archivos, ~9.3k tokens). Las descripciones de flujo de `src/**`
  provienen de firmas + `README.md` + `BACKLOG.md` + `CHANGELOG.md` + specs de `aspec/`, más
  lectura puntual de los archivos citados. Confirmar cualquier detalle fino en el archivo citado.
- **Markdown fuera del pack.** El tier resuelto (`gratis`, vía `.opencode/.ancleto-tier`)
  ignora `**/*.md` y `test/**`; `.gitignore` excluye `.opencode/`, `.ancletorc`, `.ancleto/` y
  `/documentation` del pack. Por eso `agents/`, `commands/`, `skills/`, `templates/`, `docs/`
  y `documentation/` **no aparecen** en el pack. Se describen a partir de listados de
  directorio, `README.md`, `BACKLOG.md`, `CHANGELOG.md` y los specs de `aspec/`. Consecuencia:
  el `seed-map.json` asocia esos documentos a esas áreas, pero el próximo `--check` puede no
  detectar cambios dentro de ellas si el pack sigue ignorándolas.
- **`.ancletorc` presente pero no leído.** A diferencia del seed `0.10.0` (checkout sin
  `.ancletorc`), ahora existe; por contrato de la skill no se lee directamente: su contenido
  se consume solo resuelto vía `ancleto discovery --check` (`config.outputDir`,
  `config.exclude`). El comportamiento del CLI con `.ancletorc` se describe por código y
  specs, no por un manifiesto observado.
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `TIERS`, `ANTIGRAVITY_TOOL_MAP` y `AGENT_ADAPTER_DROP`
  aparecen en el código (el adaptador ahora en `src/core/adapters/frontmatter.js`); el pack
  comprimido solo muestra firmas. Pueden quedar desactualizados si cambian sin alterar firmas.
- **Mapeo de tools de Antigravity**: los 5 ids (`view_file`, `replace_file_content`,
  `grep_search`, `run_command`, `manage_task`) y la política de omisión están cubiertos por
  `test/adapters-frontmatter.test.js`; no se validaron contra un host Antigravity real.
- **Adaptación de frontmatter por host**: la lógica y el dispatch están verificados por tests
  (`test/adapters-frontmatter.test.js`), pero el resultado final no se comparó contra cada IDE
  real (Copilot, Antigravity IDE/CLI y VS Code requieren entornos reales). La validación de
  `ancleto check` contra el adaptador se describe por código; no se ejecutó sobre un proyecto
  multi-host real.
- **`PRODUCT.md` desactualizado**: afirma que `package.json` no define scripts npm, pero
  `lint` y `test` existen desde `add-standard-linter`; además no menciona `eslint.config.js`.
  La copia versionada quedó atrás respecto del código.
- **`aspec/`**: 14 specs fuente + 1 change activo (`ancleto-vscode-extension`, diferido) +
  archivados (incluidos los 4 del 2026-10-02: `add-standard-linter`, `cleto-review`,
  `dynamic-frontmatter-adapters`, `memory-ops-export-import-gc`). No se analizó el contenido
  completo de cada spec/delta más allá de las capabilities afectadas.
- **`documentation/` (≈340 archivos, incluye `lnx-cli/` y PDFs)** es material legado de otro
  CLI, usado como fuente de relevamiento. No se analizó su contenido.
- **Memoria del repo**: `ancleto memory list` es la fuente de las decisiones registradas; no se
  inspeccionó la base completa ni nodos superseded.
- **`sourcesSha` de los dossiers** fue calculado replicando el esquema de `hashSources` del CLI
  (`rel`, `\0`, longitud, `\0`, contenido, `\n`, ordenado) sobre los globs indicados; no fue
  emitido por un subcomando del CLI. Sirve como referencia, no como valor canónico.
- **Tests**: 381 tests / 82 suites en verde en v0.10.0 (verificado ejecutando `npm test` en esa
  regeneración); en esta regeneración a `0.11.0` **no se re-ejecutaron** (el tier `gratis`
  excluye `test/**` del pack y la validación del seed es state-only).
