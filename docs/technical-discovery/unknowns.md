---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-06T12:16:49Z
pluginVersion: 0.20.1
skillVersion: '2.3'
---

# Límites de evidencia

## Sin verificar en esta generación

- **Pack comprimido**: el tier `minimo` produce un pack con compresión tree-sitter; los cuerpos de
  funciones se reemplazan por el delimitador `⋮----` y solo quedan firmas y comentarios de contrato.
  Las afirmaciones sobre flujos internos se apoyan en esos comentarios **y** en lectura directa de
  los archivos citados (`src/cli/index.js` → `HOST_MCP_TARGETS`, `resolveHostMcpDestination`,
  `readHostMcpIntent`, `importCmd`, `exportCmd`, `checkCommand`, `doctorCommand`,
  `mcpCommandBroken`, `findProjectMcpFile`, `readProjectMcp`, `repairProjectMcp`;
  `src/core/tier-models.js`), no en el pack solo. El reporte del pack indica 807 archivos
  (~37.266 tokens); su cuerpo contiene 28 entradas de archivo, porque `**/*.md`, `test/**`,
  `docs/**` y los ignores de Repomix excluyen el resto. Los cuerpos elididos y los Markdown
  excluidos se verificaron por lectura directa.
- **Contenido Markdown fuera del pack**: el tier `minimo` excluye `**/*.md` y Repomix aplica además
  su ignore por defecto de Markdown. `README.md`, `CHANGELOG.md`, `AGENTS.md`, `PRODUCT.md`,
  `aspec/specs/**` y `aspec/changes/**` no están en el pack. Las afirmaciones sobre las specs
  `project-portability`, `agent-install-routing` y `cli-diagnostics`, y sobre los changes archivados
  `2026-11-05-host-neutral-bundle`, `2026-11-05-mcp-host-write-routing` y
  `2026-11-05-mcp-oracle-residual-closure` se verificaron leyendo esos paths directamente. No se
  auditó el resto de `aspec/specs/**`.
- **`eslint.config.js` en el pack**: aparece vacío por efecto de la compresión. Su contenido se
  verificó leyendo el archivo directamente.
- **Ejecución de la suite**: no se corrió `npm test` ni `npm run lint` durante la generación. Los
  guards (`test/model-catalog.test.js`, `test/model-catalog-discovery.test.js`,
  `test/agent-model-coherence.test.js`, `test/content-guards.test.js`, `test/cli.test.js`) se citan
  por su presencia y propósito declarado, no por un resultado observado.
- **Diagnósticos 0.18.15/0.19.0**: no se ejecutaron `ancleto check` ni `ancleto doctor` para observar
  los avisos nuevos. El comportamiento se describió desde `checkCommand`, `checkTierOrphan`,
  `doctorCommand` y las specs canónicas. No se probaron los escenarios de tier dormido
  (`cursor`/`roo`), deriva de versión (pre-release/build metadata), proyecto multi-host con
  destinos MCP válidos/ausentes ni config de proyecto inválida con global válida.
- **Salud MCP 0.18.16/0.19.0**: no se ejecutaron `ancleto check` ni `ancleto import` para observar los
  avisos. El predicado, `findProjectMcpFile`/`readProjectMcp`, el descriptor `HOST_MCP_TARGETS`, la
  derivación `installedHostsFromPaths`, los mensajes y la precedencia de `doctor` se leyeron
  directamente en `src/cli/index.js` y en los requirements de las specs. No se probaron rutas
  Windows existentes/ausentes, config no parseable, `mcp` no-objeto, `caveman` roto ni la no
  regresión de `import --repair` con ejecución real.
- **Bundle host-neutral 0.20.0**: no se ejecutó un `export`/`import` real. El comportamiento se leyó
  en `readHostMcpIntent`, `exportCmd` e `importCmd` y en el change archivado
  `2026-11-05-host-neutral-bundle`. No se probaron bundles de `copilot`, `antigravity` o
  `commandcode`, ni el aviso de destino no parseable, ni la ausencia de `.opencode` en hosts
  no-opencode.
- **Reparación MCP sin escritura 0.20.1**: no se ejecutó `import --repair` para observar bytes y
  mtime intactos. El predicado `error || normalized || fixed.length > 0`, la normalización
  estructural y la no-creación de un destino vacío se leyeron en `repairProjectMcp` y en el change
  archivado `2026-11-06-fix-repair-mcp-noop`. No se probaron archivos con raíz no-objeto, valor de
  esquema no-objeto ni `.jsonc` con comentarios.
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
  `installedPaths` y la copia condicionada al host se leyeron en `importCmd` y en el change
  archivado `2026-11-05-host-neutral-bundle` (incluye la advertencia de que el `check` posterior
  deja de ser vacuo).
- **`opencode` local**: no se verificó que el binario esté disponible ni su versión; afecta
  `stats`/`stats failures` y el refresco manual del catálogo.
- **Repomix**: no se validó la versión exacta ejecutada por el fallback `npx -y repomix@1.18.0`.
- **Hosts IDE**: no se probó la instalación en cada host (claude, vscode, antigravity, cursor, roo,
  copilot, commandcode). El layout y los adaptadores se infieren de `AGENT_TARGETS` y
  `adaptFrontmatter`. Tampoco se verificó el consumo runtime de `copilot-mcp.json` por Copilot ni
  la colisión de `.mcp.json` entre `commandcode` y `claude`; ambos están declarados como límites.
- **Memoria real**: no se abrió `.ancleto/memory.db` para inspeccionar nodos; el comportamiento se
  describe desde el código (`src/core/memory/*`).
- **CI**: no se ejecutó el workflow; su comportamiento se lee de `.github/workflows/publish.yml`.

## Discrepancias y observaciones

- **`.discovery-map.json` regenerado**: el generador reporta **817 archivos** (aspec 249, docs 21,
  test 26, etc.) y el archivo quedó regenerado en esta corrida. El pack enumera **807 archivos**
  (~37.266 tokens) porque los globs de `discovery.exclude` omiten tests, lockfiles, imágenes y
  `public`; además Repomix filtra por sus propios ignores.
- **`documentation/`**: el mapa cuenta **340** archivos tras excluir `node_modules`/`.git`/`dist`/
  `build`/`coverage`; en disco hay 366, incluidos esos directorios ignorados. No es una
  inconsistencia del seed.
- **Artefactos de máquina**: `.ancletorc` y `.ancleto/machine-env.md` registran `ancleto: 0.20.1`
  (verificado), alineados con `package.json`. Siguen siendo artefactos derivados gitignored y no se
  usan como fuente de contenido.
- **`.ancletorc` no se usa como evidencia de producto**: la skill consume el `config` resuelto por
  `ancleto discovery --check` y no trata el manifiesto como contenido del seed. La observación de
  `0.20.1` es una verificación puntual del estado local, no una fuente de reglas. El propio `check`
  compara ese campo con la versión del CLI y avisa si difieren.
- **Publicación de `scripts/`**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`; no incluye `scripts/`. El refresco del catálogo y el gate de IDs
  existen en el repo fuente pero no viajan en el tarball npm. Se documenta como deuda, no como fallo.
- **`rg` no disponible** en este entorno (PowerShell 5.1): la evidencia se obtuvo con
  `Select-String` y lecturas directas.
- **Estado inicial del chequeo**: el CLI regeneró el pack y `.discovery-state.json` antes de esta
  materialización, por lo que `discovery --check` reportó `READY` con `impact: none` y
  `seedMapPresent: false` (cosmético: el archivo `seed-map.json` existe y el CLI sólo calcula ese
  campo en la rama `STALE`). El seed anterior describía 0.20.0; este describe 0.20.1. La
  regeneración se hizo completa porque la solicitud lo pidió explícitamente y el documento debía
  reflejar el fix de `import --repair`.

## Confianza

- **Alta (observado)**: estructura de `src/`, `package.json` `0.20.1`, `packageVersion`,
  `checkTierOrphan` con `localAgentDirs`, deriva de `.ancletorc.version`, `doctorCommand` con
  precedencia host activo→hosts instalados→global, `HOST_MCP_TARGETS`/`HOST_MCP_ORDER`,
  `resolveHostMcpDestination`/`resolveExistingHostMcpDestinations`, `readHostMcpIntent`,
  `repairProjectMcp` con predicado de escritura, `mcpCommandBroken` por existencia,
  `readProjectMcp` con `error`, avisos MCP host-aware de
  `checkCommand` y aviso de `repairProjectMcp`, `resolvesHostCompression`/`hostConfigHasCompression`
  y su uso en `install`/`init`/`import`, copia host-scoped de `.opencode/*` en `importCmd`,
  validación de `manifest.mcp`, `TIERS`/`TIER_CHAINS`, `freeTierOnPrimary` y sus dos avisos,
  `declaredModelIds`, `modelIdsFromCatalog`, `missingModelIdsInCatalog`, gate de `--write`,
  `looksBinaryMissing`, lint sobre `scripts/`, snapshot de 5 proveedores / 211 IDs, flujo de
  `scripts/refresh-model-catalog.mjs`, `installedPaths` como unión, comandos del CLI, firmas de
  módulos de memoria, workflow.
- **Media (inferido)**: comportamiento de hosts no probados, efecto exacto de cada adaptador en
  cada IDE, resultados de la suite y del workflow, ausencia real del 403 en configuraciones
  concretas, materialización/saneamiento de la nota de compresión sin ejecución real, no-escritura
  de `repairProjectMcp` sobre bytes/mtime sin ejecución real, salida exacta
  de `check`/`doctor` en los escenarios multi-host y salida exacta de `export`/`import` host-neutral
  sin ejecución.
- **Baja / desconocida**: estado real de la memoria del repo, disponibilidad de modelos en
  proveedores al momento de leer, contenido de `audit logs/` y `documentation/` (fuera de runtime),
  consumo runtime de `copilot-mcp.json`, colisión `.mcp.json` entre `commandcode` y `claude`, y
  comportamiento de la salud MCP frente a comandos que dependen de un `PATH` concreto, que el
  predicado no resuelve.
