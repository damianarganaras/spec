---
node: units/_map
kind: inventory
read_when: "qué unidades componen el repo, con propósito y entry point"
generatedAt: 2026-11-06T12:16:49Z
pluginVersion: 0.20.1
skillVersion: '2.3'
---

# Mapa de unidades

| Unidad | Propósito | Entry point | Dossier |
|---|---|---|---|
| CLI y ciclo de vida | `init`, `install`/`update`, `upgrade`, `check`, `doctor`, `export`/`import`, wizard TTY | `src/cli/index.js`, `src/cli/ui.js` | `units/cli-install.md` |
| Resolución de modelos | `TIERS` agente→string, `TIER_CHAINS`, resolver puro, `gratis` free-only, oráculo de `check` | `src/core/tier-models.js` | `units/cli-install.md` |
| Aviso free-on-primary | `freeTierOnPrimary(model, mode)`; aviso en `applyTier` (set-time) y en `check` (inspect-time) | `src/core/tier-models.js`, `src/cli/index.js` | `units/cli-install.md` |
| Integridad de IDs | `declaredModelIds` + `missingModelIdsInCatalog`; guard de tiers/cadenas/agents/perfiles | `src/core/tier-models.js`, `src/core/model-catalog.js` | `units/discovery-engine.md` |
| Catálogo de modelos | Snapshot de 5 proveedores / 211 IDs; helpers puros; refresco manual con gate de `--write` | `src/core/model-catalog.js`, `src/core/model-catalog.json`, `scripts/refresh-model-catalog.mjs` | `units/discovery-engine.md` |
| Adaptación por host | Frontmatter de agents, `frontmatterValue` y layouts nativos (`AGENT_TARGETS`) | `src/core/adapters/frontmatter.js`, `src/cli/index.js` | `units/cli-install.md` |
| Ruteo MCP por host | `HOST_MCP_TARGETS`/`HOST_MCP_ORDER`; escritura por host activo, aviso único sin destino e intención de bundle | `src/cli/index.js` → `setupHostMcp`, `resolveHostMcpDestination`, `readHostMcpIntent` | `units/cli-install.md` |
| Diagnósticos de estado | `check` (tier dormido, deriva de versión, salud MCP host-aware) y `doctor` (precedencia host activo→instalados→global) | `src/cli/index.js` → `checkCommand`, `checkTierOrphan`, `doctorCommand` | `units/cli-install.md` |
| Salud de comandos MCP | `mcpCommandBroken`, `resolveExistingHostMcpDestinations`, `HOST_MCP_TARGETS`; avisos de `check` y aviso de `import` | `src/cli/index.js` | `units/cli-install.md` |
| Nota de compresión host-scoped | `resolvesHostCompression` + `hostConfigHasCompression`; gate estado-driven en `install`/`init`/`import` | `src/cli/index.js` | `units/cli-install.md` |
| Portabilidad | Bundle `export` host-neutral; `import` con `--repair`, validación de `manifest.mcp`, tier, `installedPaths` acumulativo y reparación MCP sin escritura sobre destino sano (0.20.1) | `src/cli/index.js` → `exportCmd`/`importCmd`, `repairProjectMcp` | `units/cli-install.md` |
| Discovery y seed | Topología, hashes, impacto, `seed-map`, estado `READY/STALE` | `src/core/discovery.js`, `src/cli/index.js` | `units/discovery-engine.md` |
| Empaquetado Repomix | Args e ignores por tier; presupuesto de tokens | `src/core/repomix-tier.js` | `units/discovery-engine.md` |
| Affected-set | Grafo de imports y clausura de dependientes | `src/core/affected-set.js` | `units/discovery-engine.md` |
| Entorno de máquina | Shell, EOL, tooling e invocabilidad; exclusión local | `src/core/machine-env.js` | `units/cli-install.md` |
| Motor de memoria | SQLite+FTS5, supersesión, refs, secretos, recall, ops | `src/core/memory/engine.js`, `database.js` | `units/memory-engine.md` |
| Tools y MCP | `searchMemory`, `recordRule`, `recordDecision`; server stdio | `src/core/memory/tools.js`, `mcp-server.js` | `units/memory-engine.md` |
| Working-context | Render y refresh de `.ancleto/working-context.md` | `src/core/memory/working-context.js` | `units/memory-engine.md` |
| Doctor y curaduría | Chequeos read-only, refs rotas, duplicados exactos | `src/core/memory/doctor.js`, `curation.js` | `units/memory-engine.md` |
| Snapshot | Copia consistente con historial (`VACUUM INTO`) | `src/core/memory/snapshot.js` | `units/memory-engine.md` |
| Agentes | 10 subagentes instalables (canónica publicada) | `agents/*.md` | — |
| Commands | 16 comandos `/cleto-*` | `commands/*.md` | — |
| Skills | 21 skills del ciclo SDD/discovery/review | `skills/*/SKILL.md` | — |
| Templates | `AGENTS.md`/`PRODUCT.md` con bloques `LOCKED` | `templates/*.md` | — |
| Perfil test | Overlay de tester/reviewer y commands de test | `profiles/test/**` | `units/cli-install.md` |
| Specs y changes | Specs canónicos (`cli-diagnostics`, `agent-install-routing`, `project-portability`) y ciclo de cambios (archives de `mcp-host-write-routing`, `mcp-oracle-residual-closure`, `host-neutral-bundle` y `fix-repair-mcp-noop`) | `aspec/specs/**`, `aspec/changes/**` | — |
| Stats | Tokens por sesión y fallos de tool parts de opencode | `src/cli/index.js` (`stats`) | `units/cli-install.md` |
| Lint y publicación | `eslint src/ test/ scripts/`, npm publish y GitHub Release | `eslint.config.js`, `.github/workflows/publish.yml` | — |
| Suite de tests | Guards de modelos, integridad del catálogo, discovery, memoria, adapters y CLI | `test/*.test.js` | — |
