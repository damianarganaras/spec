---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-05T03:53:28Z
pluginVersion: 0.18.16
skillVersion: '2.3'
---

# Límites de evidencia

## Sin verificar en esta generación

- **Pack comprimido**: el tier `minimo` produce un pack con compresión tree-sitter; los cuerpos de
  funciones se reemplazan por el delimitador `⋮----` y solo quedan firmas y comentarios de contrato.
  Las afirmaciones sobre flujos internos se apoyan en esos comentarios **y** en lectura directa de
  los archivos citados (`src/cli/index.js` → `packageVersion`, `checkCommand`, `checkTierOrphan`,
  `doctorCommand`, `localAgentDirs`, `resolvesHostCompression`, `mcpCommandBroken`,
  `findProjectMcpFile`, `readProjectMcp`, `repairProjectMcp`; `src/core/tier-models.js`), no en el
  pack solo.
- **Contenido Markdown fuera del pack**: el tier `minimo` excluye `**/*.md` y Repomix aplica además
  su ignore por defecto de Markdown. `README.md`, `CHANGELOG.md`, `AGENTS.md`, `PRODUCT.md`,
  `aspec/specs/**` y `aspec/changes/**` no están en el pack. Las afirmaciones sobre la spec
  `cli-diagnostics`, el requirement de tier dormido en `agent-model-tiers`, el change archivado
  `2026-11-04-check-doctor-state-parity` y el change `2026-11-05-mcp-command-health` se verificaron
  leyendo esos paths directamente. No se auditó el resto de `aspec/specs/**`.
- **`eslint.config.js` en el pack**: aparece vacío por efecto de la compresión. Su contenido se
  verificó leyendo el archivo directamente.
- **Ejecución de la suite**: no se corrió `npm test` ni `npm run lint` durante la generación. Los
  guards (`test/model-catalog.test.js`, `test/model-catalog-discovery.test.js`,
  `test/agent-model-coherence.test.js`, `test/content-guards.test.js`, `test/cli.test.js`) se citan
  por su presencia y propósito declarado, no por un resultado observado.
- **Diagnósticos 0.18.15**: no se ejecutaron `ancleto check` ni `ancleto doctor` para observar los
  avisos nuevos. El comportamiento se describió desde `checkCommand`, `checkTierOrphan`,
  `doctorCommand` y `aspec/specs/cli-diagnostics/spec.md`. No se probaron los escenarios de tier
  dormido (`cursor`/`roo`), deriva de versión (pre-release/build metadata) ni config de proyecto
  inválida con global válida.
- **Salud MCP 0.18.16**: no se ejecutaron `ancleto check` ni `ancleto import` para observar los
  avisos. El predicado, `findProjectMcpFile`/`readProjectMcp` y los mensajes se leyeron directamente
  en `src/cli/index.js` y en los requirements de `aspec/specs/cli-diagnostics/spec.md`; el change
  archivado `aspec/changes/archive/2026-11-05-mcp-command-health/` aportó el contrato y los casos
  borde. No se probaron rutas Windows existentes/ausentes, config no parseable, `mcp` no-objeto,
  `caveman` roto ni la no regresión de `doctor`/`import --repair` con ejecución real.
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

- **`.discovery-map.json` regenerado**: el generador reporta **796 archivos** (aspec 228, docs 21,
  test 26, etc.) y el archivo quedó regenerado en esta corrida. El pack enumera **786 archivos**
  (~36.579 tokens) porque los globs de `discovery.exclude` omiten tests, lockfiles, imágenes y
  `public`; además Repomix filtra por sus propios ignores.
- **`documentation/`**: el mapa cuenta **340** archivos tras excluir `node_modules`/`.git`/`dist`/
  `build`/`coverage`; en disco hay 366, incluidos esos directorios ignorados. No es una
  inconsistencia del seed.
- **Artefactos de máquina**: `.ancletorc` y `.ancleto/machine-env.md` registran `ancleto: 0.18.16`
  (verificado), alineados con `package.json` tras el `upgrade` local. Siguen siendo artefactos
  derivados gitignored y no se usan como fuente de contenido.
- **`.ancletorc` no se usa como evidencia de producto**: la skill consume el `config` resuelto por
  `ancleto discovery --check` y no trata el manifiesto como contenido del seed. La observación de
  `0.18.16` es una verificación puntual del estado local, no una fuente de reglas. El propio `check`
  compara ese campo con la versión del CLI y avisa si difieren.
- **Publicación de `scripts/`**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`; no incluye `scripts/`. El refresco del catálogo y el gate de IDs
  existen en el repo fuente pero no viajan en el tarball npm. Se documenta como deuda, no como fallo.
- **`rg` no disponible** en este entorno (PowerShell 5.1): la evidencia se obtuvo con
  `Select-String` y lecturas directas.
- **Estado inicial del chequeo**: la corrida de `discovery --check` previa a esta generación reportó
  `STALE` con `impact: material` y `recommendedAction: regenerate` (cambiaron `package.json`,
  `.ancletorc`, `CHANGELOG.md`, `aspec`, `src`, `test` y `.ancleto`), aunque la solicitud lo describía
  como `minor`. El seed anterior describía 0.18.15; el actual describe 0.18.16. La regeneración se
  hizo completa porque `affectedDocs` listaba todos los documentos.

## Confianza

- **Alta (observado)**: estructura de `src/`, `package.json` `0.18.16`, `packageVersion`,
  `checkTierOrphan` con `localAgentDirs`, deriva de `.ancletorc.version`, `doctorCommand` con
  precedencia proyecto→global y `findProjectMcpFile`, `mcpCommandBroken` por existencia,
  `readProjectMcp` con `error`, avisos MCP de `checkCommand` y aviso de `repairProjectMcp`,
  `resolvesHostCompression`/`hostConfigHasCompression` y su uso en `install`/`init`/`import`,
  validación de `manifest.mcp` en `importCmd`, `TIERS`/`TIER_CHAINS`, `freeTierOnPrimary` y sus dos
  avisos, `declaredModelIds`, `modelIdsFromCatalog`, `missingModelIdsInCatalog`, gate de `--write`,
  `looksBinaryMissing`, lint sobre `scripts/`, snapshot de 5 proveedores / 211 IDs, flujo de
  `scripts/refresh-model-catalog.mjs`, registro de `installedPaths` en `importCmd`, comandos del CLI,
  firmas de módulos de memoria, workflow.
- **Media (inferido)**: comportamiento de hosts no probados, efecto exacto de cada adaptador en
  cada IDE, resultados de la suite y del workflow, ausencia real del 403 en configuraciones
  concretas, materialización/saneamiento de la nota de compresión sin ejecución real, salida exacta
  de `check`/`doctor` en los escenarios nuevos de 0.18.15 y salida exacta de los avisos MCP de
  0.18.16 sin ejecución.
- **Baja / desconocida**: estado real de la memoria del repo, disponibilidad de modelos en
  proveedores al momento de leer, contenido de `audit logs/` y `documentation/` (fuera de runtime),
  y comportamiento de la salud MCP frente a comandos que dependen de un `PATH` concreto, que el
  predicado no resuelve.
