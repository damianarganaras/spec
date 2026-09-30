---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-09-30T14:03:46Z
pluginVersion: 0.7.1
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes. Las descripciones de flujo de `src/**` provienen de firmas +
  `README.md` + `BACKLOG.md`, más lectura puntual del archivo citado. Confirmar cualquier
  detalle fino en el archivo citado.
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_SKILLS_DIR`, `ANCLETO_SKILLS` y `SUPPORTED_AGENTS` viven en `src/cli/index.js` y **no
  aparecen** en el pack comprimido (solo firmas). Se obtuvieron leyendo el archivo; pueden
  quedar desactualizados si cambian sin alterar firmas.
- **Markdown fuera del pack.** El tier `minimo` ignora `**/*.md` y `test/**`; `.gitignore`
  excluye `.opencode/` y `/documentation`; `discovery.exclude` excluye `docs`. Por eso
  `agents/`, `commands/`, `skills/`, `templates/`, `docs/` y `documentation/` **no aparecen**
  en el pack. Se describen a partir de listados de directorio, `README.md`, `BACKLOG.md` y la
  memoria del repo. Su contenido interno no fue verificado en esta generación. Consecuencia:
  el `seed-map.json` asocia esos documentos a esas áreas, pero el próximo `--check` puede no
  detectar cambios dentro de ellas si Repomix sigue ignorándolas.
- **`PRODUCT.md`**: fue completado con contexto real (commit `066136f`), pero su código vive
  en `.opencode/` (gitignored); la copia versionada puede diferir del template instalado.
- **`aspec/` ya no está vacío**: contiene `specs/` (aspec-bootstrap, memory-engine, review) y
  `changes/archive/` (6 changes). No se analizó el contenido de cada spec/delta.
- **`documentation/` (≈340 archivos, incluye `lnx-cli/` y PDFs)** es material legado de otro
  CLI, usado como fuente de relevamiento. No se analizó su contenido.
- **Memoria del repo**: `ancleto memory list` devolvió 3 decisiones activas en el relevamiento
  anterior; no se inspeccionó la base completa ni nodos superseded.
- **`sourcesSha` de los dossiers** fue calculado localmente replicando el esquema de hash del
  CLI (`rel`, `\0`, longitud, `\0`, contenido, `\n`) sobre los globs indicados; no fue emitido
  por un subcomando del CLI. Sirve como referencia, no como valor canónico del runtime.
- **Tests**: se declaran 162 tests en `BACKLOG.md` (al cierre de v0.6.38, en 7 archivos). Hay un
  8.º archivo `test/working-context.test.js` sin desglosar en el backlog. No se ejecutó la
  suite durante la generación del seed (solo lectura).
- **Frontmatter de skills por IDE**: la adaptación (A1) está planeada y **no implementada**; no
  hay evidencia de comportamiento específico por IDE más allá del copiado literal.
