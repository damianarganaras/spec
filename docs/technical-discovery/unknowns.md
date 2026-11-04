---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-04T22:24:31Z
pluginVersion: 0.18.14
skillVersion: '2.3'
---

# Límites de evidencia

## Sin verificar en esta generación

- **Pack comprimido**: el tier `minimo` produce un pack con compresión tree-sitter; los cuerpos de
  funciones se reemplazan por el delimitador `⋮----` y solo quedan firmas y comentarios de contrato.
  Las afirmaciones sobre flujos internos se apoyan en esos comentarios **y** en lectura directa de
  los archivos citados (`src/cli/index.js` → `resolvesHostCompression`, `hostConfigHasCompression`,
  `importCmd`, `install`/`init`; `src/core/tier-models.js`), no en el pack solo.
- **Contenido Markdown fuera del pack**: el tier `minimo` excluye `**/*.md` y Repomix aplica además
  su ignore por defecto de Markdown. `README.md`, `CHANGELOG.md`, `AGENTS.md`, `PRODUCT.md`,
  `aspec/specs/**` y `aspec/changes/**` no están en el pack. Las afirmaciones sobre el change
  `2026-11-04-host-compression-note-consistency`, la validación de `manifest.mcp`, los requirements
  mergeados en `agent-install-routing`/`project-portability` y las notas del `CHANGELOG` 0.18.14 se
  verificaron leyendo esos paths directamente. No se auditó el resto de `aspec/specs/**`.
- **`eslint.config.js` en el pack**: aparece vacío por efecto de la compresión. Su contenido se
  verificó leyendo el archivo directamente.
- **Ejecución de la suite**: no se corrió `npm test` ni `npm run lint` durante la generación. Los
  guards (`test/model-catalog.test.js`, `test/model-catalog-discovery.test.js`,
  `test/agent-model-coherence.test.js`, `test/content-guards.test.js`, `test/cli.test.js`) se citan
  por su presencia y propósito declarado, no por un resultado observado. Los “19 casos” de
  consistencia de la nota que declara el `CHANGELOG` 0.18.14 no se ejecutaron.
- **Refresco del catálogo**: no se ejecutó `scripts/refresh-model-catalog.mjs`. El snapshot se tomó
  como fuente de verdad declarada (`generated_at: 2026-11-04`, 5 proveedores / 211 IDs), sin
  revalidar contra proveedores.
- **Gate de `--write`**: se describió desde `scripts/refresh-model-catalog.mjs` y las specs
  `agent-model-tiers`; no se ejecutó una corrida real con IDs faltantes.
- **Disponibilidad real de modelos**: no se comprobó por red que cada uno de los 211 IDs del
  snapshot exista hoy en cada proveedor. La resolución de `minimo` depende de ese snapshot.
- **Avisos free-on-primary**: se describieron desde el código y la spec; no se ejecutó
  `install --tier gratis` ni un `check` real sobre un agente `mode: primary` con modelo free.
- **Nota de compresión**: no se ejecutó `install`, `init`, `import` ni `upgrade` para observar la
  materialización/saneamiento de `CAVEMAN_USAGE_NOTE`. El comportamiento se describió desde
  `resolvesHostCompression`, sus tres call sites y el delta archivado. No se probaron los escenarios
  de `--repair`, antigravity con/sin `.agents/mcp_config.json` ni la excepción M2 con JSON inválido.
- **Validación de `manifest.mcp`**: se describió desde `importCmd` (comprobación de array y de
  `name` string antes del primer write). No se importó un bundle real con `manifest.mcp` malformado.
- **`import` de bundles**: no se ejecutó un `export`+`import` real; el comportamiento de
  `installedPaths` se leyó en `importCmd` y en el delta de `project-portability` (incluye la
  advertencia de que el `check` posterior deja de ser vacuo).
- **`opencode` local**: no se verificó que el binario esté disponible ni su versión; afecta
  `stats`/`stats failures` y el refresco manual del catálogo.
- **Repomix**: no se validó la versión exacta ejecutada por el fallback `npx -y repomix@1.18.0`.
- **Hosts IDE**: no se probó la instalación en cada host (claude, vscode, antigravity, cursor, roo,
  copilot, commandcode). El layout y los adaptadores se infieren de `AGENT_TARGETS` y
  `adaptFrontmatter`.
- **Memoria real**: no se abrió `.ancleto/memory.db` para inspeccionar nodos; el comportamiento se
  describe desde el código (`src/core/memory/*`).
- **CI**: no se ejecutó el workflow; su comportamiento se lee de `.github/workflows/publish.yml`.

## Discrepancias y observaciones

- **`.discovery-map.json` regenerado**: el generador reporta **788 archivos** (aspec 220, docs 21,
  test 26, etc.) y el archivo quedó regenerado en esta corrida. El pack enumera **778 archivos**
  porque los globs de `discovery.exclude` omiten tests, lockfiles, imágenes y `public`; además
  Repomix filtra por sus propios ignores.
- **`documentation/`**: el mapa cuenta **340** archivos tras excluir `node_modules`/`.git`/`dist`/
  `build`/`coverage`; en disco hay 366, incluidos esos directorios ignorados. No es una
  inconsistencia del seed.
- **Artefactos de máquina**: `.ancletorc` y `.ancleto/machine-env.md` registran `ancleto: 0.18.14`
  (verificado), alineados con `package.json` tras el `upgrade` local. El seed anterior decía
  `0.18.8`; esa afirmación ya no aplica. Siguen siendo artefactos derivados gitignored y no se usan
  como fuente de contenido.
- **`.ancletorc` no se usa como evidencia de producto**: la skill consume el `config` resuelto por
  `ancleto discovery --check` y no trata el manifiesto como contenido del seed. La observación de
  `0.18.14` es una verificación puntual del estado local, no una fuente de reglas.
- **Publicación de `scripts/`**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`; no incluye `scripts/`. El refresco del catálogo y el gate de IDs
  existen en el repo fuente pero no viajan en el tarball npm. Se documenta como deuda, no como fallo.
- **`rg` no disponible** en este entorno (PowerShell 5.1): la evidencia se obtuvo con
  `Select-String` y lecturas directas.

## Confianza

- **Alta (observado)**: estructura de `src/`, `package.json` `0.18.14`,
  `resolvesHostCompression`/`hostConfigHasCompression` y su uso en `install`/`init`/`import`,
  validación de `manifest.mcp` en `importCmd`, `TIERS`/`TIER_CHAINS`, `freeTierOnPrimary` y sus dos
  avisos, `declaredModelIds`, `modelIdsFromCatalog`, `missingModelIdsInCatalog`, gate de `--write`,
  `looksBinaryMissing`, lint sobre `scripts/`, snapshot de 5 proveedores / 211 IDs, flujo de
  `scripts/refresh-model-catalog.mjs`, registro de `installedPaths` en `importCmd`, comandos del
  CLI, firmas de módulos de memoria, workflow.
- **Media (inferido)**: comportamiento de hosts no probados, efecto exacto de cada adaptador en
  cada IDE, resultados de la suite y del workflow, ausencia real del 403 en configuraciones
  concretas, materialización/saneamiento de la nota de compresión sin ejecución real.
- **Baja / desconocida**: estado real de la memoria del repo, disponibilidad de modelos en
  proveedores al momento de leer, contenido de `audit logs/` y `documentation/` (fuera de runtime),
  detalle exacto de los 19 casos de consistencia de la nota.
