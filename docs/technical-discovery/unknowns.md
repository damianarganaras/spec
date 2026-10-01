---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-09-30T21:56:00Z
pluginVersion: 0.8.0
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes. Las descripciones de flujo de `src/**` provienen de firmas +
  `README.md` + `BACKLOG.md`, más lectura puntual del archivo citado. Confirmar cualquier
  detalle fino en el archivo citado.
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `AGENT_ADAPTER_DROP`, `ANTIGRAVITY_TOOL_MAP` y
  `ANCLETO_SKILLS` viven en `src/cli/index.js` y **no aparecen** en el pack comprimido (solo
  firmas). Se obtuvieron leyendo el archivo; pueden quedar desactualizados si cambian sin
  alterar firmas.
- **Mapeo de tools de Antigravity**: los 5 ids (`view_file`, `replace_file_content`,
  `grep_search`, `run_command`, `manage_task`) y la política de omisión se verificaron por
  lectura directa de `src/cli/index.js`; no se validaron contra un host Antigravity real.
- **Markdown fuera del pack.** El tier `minimo` ignora `**/*.md` y `test/**`; `.gitignore`
  excluye `.opencode/` y `/documentation`; `discovery.exclude` excluye `docs`. Por eso
  `agents/`, `commands/`, `skills/`, `templates/`, `docs/` y `documentation/` **no aparecen**
  en el pack. Se describen a partir de listados de directorio, `README.md`, `BACKLOG.md` y la
  memoria del repo. Su contenido interno no fue verificado en esta generación. Consecuencia:
  el `seed-map.json` asocia esos documentos a esas áreas, pero el próximo `--check` puede no
  detectar cambios dentro de ellas si Repomix sigue ignorándolas.
- **`PRODUCT.md`**: fue completado con contexto real (commit `066136f`), pero su código vive
  en `.opencode/` (gitignored); la copia versionada puede diferir del template instalado.
- **`aspec/`**: 11 specs fuente + 1 change activo (`ancleto-vscode-extension`, diferido) + 8
  archivados (4 de esta serie: test-profile, project-portability, legacy-import, copilot-support
  como completos; fix-antigravity como superseded). No se analizó el contenido de cada
  spec/delta más allá de los sincronizados en esta serie.
- **`documentation/` (≈340 archivos, incluye `lnx-cli/` y PDFs)** es material legado de otro
  CLI, usado como fuente de relevamiento. No se analizó su contenido.
- **Memoria del repo**: `ancleto memory list` devolvió 3 decisiones activas en el relevamiento
  anterior; no se inspeccionó la base completa ni nodos superseded.
- **`sourcesSha` de los dossiers** fue calculado localmente replicando el esquema de hash del
  CLI (`rel`, `\0`, longitud, `\0`, contenido, `\n`) sobre los globs indicados; no fue emitido
  por un subcomando del CLI. Sirve como referencia, no como valor canónico del runtime.
- **Tests**: 314 en verde en v0.8.0 (verificado ejecutando la suite en esta regeneración).
- **Frontmatter por host**: la adaptación de agents para `claude`/`vscode`/`antigravity`/`copilot`
  está implementada (`AGENT_ADAPTER_HOSTS`); no se verificó el resultado contra cada IDE real
  (Copilot, Antigravity IDE/CLI y VS Code requieren entornos reales). Las skills se copian sin
  transformar.
