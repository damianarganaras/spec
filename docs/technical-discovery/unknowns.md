---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-04T19:22:37Z
pluginVersion: 0.18.13
skillVersion: '2.3'
---

# Límites de evidencia

## Sin verificar en esta generación

- **Pack comprimido**: el tier `minimo` produce un pack con compresión tree-sitter; los cuerpos de
  funciones se reemplazan por el delimitador `⋮----` y solo quedan firmas y comentarios de contrato.
  Las afirmaciones sobre flujos internos se apoyan en esos comentarios **y** en lectura directa de
  los archivos citados (`src/core/tier-models.js`, `src/cli/index.js` →
  `applyTier`/`checkAgentsFrontmatter`/`importCmd`/`unionInstalledPaths`), no en el pack solo.
- **Contenido Markdown fuera del pack**: el tier `minimo` excluye `**/*.md`. `README.md`,
  `CHANGELOG.md`, `AGENTS.md`, `PRODUCT.md`, `aspec/specs/**` y `aspec/changes/**` no están en el
  pack. Las afirmaciones sobre el change `ch-14`, la consolidación de requirements y el requirement
  nuevo de `project-portability` se verificaron leyendo
  `aspec/changes/archive/2026-11-04-ch-14-tier-gratis-import-integrity/**` y los specs canónicos
  citados. No se auditó el resto de `aspec/specs/**`.
- **`eslint.config.js` en el pack**: aparece vacío por efecto de la compresión. Su contenido se
  verificó leyendo el archivo directamente.
- **Ejecución de la suite**: no se corrió `npm test` ni `npm run lint` durante la generación. Los
  guards (`test/model-catalog.test.js`, `test/model-catalog-discovery.test.js`,
  `test/agent-model-coherence.test.js`, `test/content-guards.test.js`, `test/cli.test.js`) se citan
  por su presencia y propósito declarado, no por un resultado observado.
- **Refresco del catálogo**: no se ejecutó `scripts/refresh-model-catalog.mjs`. El snapshot se tomó
  como fuente de verdad declarada (`generated_at: 2026-11-04`, 5 proveedores / 211 IDs), sin
  revalidar contra proveedores.
- **Gate de `--write`**: se describió desde `scripts/refresh-model-catalog.mjs` y las specs
  `agent-model-tiers`; no se ejecutó una corrida real con IDs faltantes.
- **Disponibilidad real de modelos**: no se comprobó por red que cada uno de los 211 IDs del
  snapshot exista hoy en cada proveedor. La resolución de `minimo` depende de ese snapshot.
- **Avisos free-on-primary**: se describieron desde el código y la spec; no se ejecutó
  `install --tier gratis` ni un `check` real sobre un agente `mode: primary` con modelo free.
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

## Discrepancias observadas

- **`.discovery-map.json` regenerado**: el generador reporta **784 archivos** y el mapa trackeado
  ya refleja esa corrida; HEAD conservaba **780** de un pack previo. La diferencia son 4 archivos
  nuevos en `aspec/changes/archive/2026-11-04-ch-14-tier-gratis-import-integrity/**` (el árbol de
  `aspec/` pasa a 216 archivos) y 4 renombres en `documentation/` que no alteran el total. El pack
  comprimido contiene 773 archivos porque los globs de `discovery.exclude` omiten tests, lockfiles,
  imágenes y `public`.
- **Artefacto de máquina desactualizado**: `.ancleto/machine-env.md` registra `ancleto: 0.18.8`;
  `package.json` está en `0.18.13`. Es un artefacto derivado gitignored que se regenera en
  `init`/`install`/`upgrade`. No se corrigió porque la generación del seed no modifica artefactos
  locales.
- **`.ancletorc` no se usa como evidencia**: la skill consume el `config` resuelto por
  `ancleto discovery --check` y no trata el manifiesto como contenido del seed. Este documento no
  afirma el `version` ni el detalle de `.ancletorc`; la observación de `0.18.8` proviene del
  proposal archivado de `ch-14`, no de una lectura del manifiesto como fuente del seed.
- **Publicación de `scripts/`**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`; no incluye `scripts/`. El refresco del catálogo y el gate de IDs
  existen en el repo fuente pero no viajan en el tarball npm. Se documenta como deuda, no como fallo.
- **`rg` no disponible** en este entorno (PowerShell 5.1): la evidencia se obtuvo con
  `Select-String` y lecturas directas.

## Confianza

- **Alta (observado)**: estructura de `src/`, `package.json` `0.18.13`, `TIERS`/`TIER_CHAINS`,
  `freeTierOnPrimary` y sus dos avisos, `declaredModelIds`, `modelIdsFromCatalog`,
  `missingModelIdsInCatalog`, gate de `--write`, `looksBinaryMissing`, lint sobre `scripts/`,
  snapshot de 5 proveedores / 211 IDs, flujo de `scripts/refresh-model-catalog.mjs`, registro de
  `installedPaths` en `importCmd`, comandos del CLI, firmas de módulos de memoria, workflow.
- **Media (inferido)**: comportamiento de hosts no probados, efecto exacto de cada adaptador en
  cada IDE, resultados de la suite y del workflow, ausencia real del 403 en configuraciones
  concretas.
- **Baja / desconocida**: estado real de la memoria del repo, disponibilidad de modelos en
  proveedores al momento de leer, contenido de `audit logs/` y `documentation/` (fuera de runtime),
  versión declarada en `.ancletorc`.
