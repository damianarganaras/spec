---
node: unknowns
kind: unknowns
read_when: "límites de evidencia: qué no se pudo verificar en este seed"
generatedAt: 2026-10-15T11:49:04Z
pluginVersion: 0.13.0
skillVersion: '2.3'
---

# Límites de evidencia

- **Pack comprimido (tree-sitter).** El pack usado contiene firmas de funciones, no cuerpos ni
  valores de constantes (635 fuentes, ~11.2k tokens). Las descripciones de flujo de `src/**`
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
- **`CHANGELOG.md` limitado a `0.12.1`.** `package.json` marca `0.13.0`; el changelog no tiene
  aún entrada para `0.13.0`. Los cambios de `0.12.0`/`0.12.1` (skill `ancleto-update`, host
  `commandcode`) sí están documentados; el salto a `0.13.0` se infiere del código/specs
  (`token-budget`, `contrato-validaciones`), no de una entrada de release.
- **Cambios archivados el 2026-10-14.** `token-budget` y `contrato-validaciones` están en
  `aspec/changes/archive/`; sus specs fuente viven en `aspec/specs/prompt-contracts/`,
  `aspec/specs/memory-engine/` y `aspec/specs/agent-install-routing/`. Se leyeron las specs
  fuente y los deltas relevantes, no el contenido completo de cada artifact del change.
- **Contrato de validaciones: fuente declarada, no ejecutada.** La política (bloque `LOCKED:
  validation-commands`) prohíbe fijar comandos; este repo declara `npm run lint` y `npm test`,
  format `not-configured` y typecheck no aplicable (`PRODUCT.md`). No se ejecutaron `lint`/`test`
  en esta regeneración (la validación del seed es state-only y el tier excluye `test/**`).
- **Cambios en markdown no verificables por el pack.** `token-budget` modificó `agents/*.md`,
  `templates/AGENTS.md`, `AGENTS.md` y skills (dedupe de reglas, envelope por tramo, host-scoped)
  y relajó `test/content-guards.test.js`; `contrato-validaciones` tocó `templates/AGENTS.md`,
  `PRODUCT.md` y varias skills. Esos archivos están fuera del pack: se describen por las specs
  fuente, `AGENTS.md`/`templates/AGENTS.md` y lectura puntual.
- **Conteos de assets**: 10 agents, 16 commands, 21 directorios de skills (~35 archivos),
  17 specs, 22 changes archivados, 1 change activo diferido. Tomados de listados de directorio
  y `.discovery-map.json` (que puede quedar desfasado si se agregan archivos sin re-correr el
  discovery).
- **Constantes de instalación confirmadas por lectura directa, no por el pack.** Valores como
  `AGENT_TARGETS`, `SUPPORTED_AGENTS`, `TIERS`, `ANTIGRAVITY_TOOL_MAP`, `COMMANDCODE_TOOL_MAP`,
  `AGENT_ADAPTER_DROP`, `CAVEMAN_USAGE_NOTE` aparecen en el código; el pack comprimido solo
  muestra firmas. Pueden quedar desactualizados si cambian sin alterar firmas.
- **Mapas de tools (Antigravity/Command Code)**: los ids y la política de omisión están
  cubiertos por `test/adapters-frontmatter.test.js`; no se validaron contra hosts reales.
- **Adaptación de frontmatter por host**: la lógica y el dispatch están verificados por tests,
  pero el resultado final no se comparó contra cada IDE real (Copilot, Antigravity, VS Code y
  Command Code requieren entornos reales). La validación de `ancleto check` contra el adaptador
  se describe por código; no se ejecutó sobre un proyecto multi-host real.
- **Día-cero y host-scoped**: los comportamientos se describen por código
  (`renderWorkingContextBlock`, `formatTopologyBlock`, `hostSupportsCompression`) y por los
  deltas archivados de `token-budget`; no se re-ejecutó la suite para confirmarlos en verde.
- **`optimizacion-de-tokens.md` es análisis, no contrato.** Mide costo (tier resuelto `normal`
  según su encabezado, hoy `minimo` en el checkout) y deja la promesa "optimizador de tokens"
  como decisión pendiente; sus cifras no se re-verificaron en esta regeneración.
- **`aspec/`**: 17 specs fuente + 1 change activo diferido (`ancleto-vscode-extension`) +
  22 archivados. No se analizó el contenido completo de cada spec/delta más allá de las
  capabilities afectadas.
- **`documentation/` (≈340 archivos, incluye `lnx-cli/` y PDFs)** es material legado de otro
  CLI, usado como fuente de relevamiento. No se analizó su contenido.
- **Memoria del repo**: `ancleto memory list` es la fuente de las decisiones registradas; no se
  inspeccionó la base completa ni nodos superseded.
- **`sourcesSha` de los dossiers** fue calculado replicando el esquema de `hashSources` del CLI
  (`rel`, `\0`, longitud, `\0`, contenido, `\n`, ordenado) sobre los globs indicados, a partir
  de las fuentes del `.discovery-state.json` recién escrito; no fue emitido por un subcomando
  del CLI. Sirve como referencia, no como valor canónico.
- **Tests**: la cifra de tests en verde **no se re-ejecutó** en esta regeneración (el tier
  `minimo` excluye `test/**` del pack y la validación del seed es state-only). `BACKLOG.md`
  registraba 331 tests (2026-10-02) y el seed anterior citaba 381/82 en v0.10.0; ambas cifras
  están desactualizadas.
