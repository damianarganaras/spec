---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-09-25T14:03:34Z
pluginVersion: 0.6.37
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos.
  Las descripciones de flujo de `src/**` provienen de firmas + `README.md` + `BACKLOG.md`, no
  de la implementación línea a línea. Confirmar cualquier detalle fino en el archivo citado.
- **Markdown fuera del pack.** El tier `minimo` ignora `**/*.md` y `test/**`; `.gitignore`
  excluye `.opencode/` y `/documentation`; `discovery.exclude` excluye `docs`. Por eso
  `agents/`, `commands/`, `skills/`, `templates/`, `docs/` y `documentation/` **no aparecen**
  en el pack. Se describen a partir de listados de directorio, `README.md`, `BACKLOG.md` y la
  memoria del repo. Su contenido interno no fue verificado en esta generación. Consecuencia:
  el `seed-map.json` asocia esos documentos a esas áreas, pero el próximo `--check` puede no
  detectar cambios dentro de ellas si Repomix sigue ignorándolas.
- **`PRODUCT.md` es un template sin completar** (placeholders `[Product Name]`, secciones
  vacías). No debe tomarse como descripción real del producto.
- **`aspec/changes/` está vacío** al momento del relevamiento: no hay changes activos ni
  deltas que analizar.
- **`documentation/` (≈340 archivos, incluye `lnx-cli/` y PDFs)** es material legado de otro
  CLI, usado como fuente de relevamiento. No se analizó su contenido.
- **Memoria del repo**: `ancleto memory list --all` devolvió 3 decisiones activas; no se
  inspeccionó la base completa ni nodos superseded.
- **`sourcesSha` de los dossiers** fue calculado localmente replicando el esquema de hash del
  CLI (`rel`, `\0`, longitud, `\0`, contenido, `\n`) sobre los globs indicados; no fue emitido
  por un subcomando del CLI. Sirve como referencia, no como valor canónico del runtime.
- **Tests**: se declaran ~158 tests en `BACKLOG.md`, pero no se ejecutó la suite durante la
  generación del seed (solo lectura).
