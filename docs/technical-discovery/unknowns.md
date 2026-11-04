---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-04T17:02:55Z
pluginVersion: 0.18.12
skillVersion: '2.3'
---

# Límites de evidencia

## Sin verificar en esta generación

- **Versión del generador**: el pack y `.discovery-state.json` los produjo el CLI global
  `ancleto 0.18.8`, mientras `package.json` del repo está en `0.18.12`. El snapshot del catálogo y
  los cambios de `0.18.12` se leyeron del árbol, pero no se verificó que la lógica de discovery del
  CLI 0.18.8 coincida exactamente con la del repo.
- **Contenido del pack fuera del seed**: el pack del tier `minimo` excluye `test/**`, `docs/**` y
  `**/*.md`. Las afirmaciones sobre tests, documentación, agents/commands/skills y templates se
  apoyan en lectura directa de paths citados y en conteos de directorio, no en el pack.
- **Ejecución de la suite**: no se corrió `npm test` ni `npm run lint` durante la generación; los
  guards de catálogo (`test/model-catalog.test.js`, `test/model-catalog-discovery.test.js`,
  `test/agent-model-coherence.test.js`, `test/content-guards.test.js`, `test/linter-config.test.js`)
  se citan por su presencia y propósito, no por un resultado de ejecución.
- **Refresco del catálogo**: no se ejecutó `scripts/refresh-model-catalog.mjs`. El snapshot se tomó
  como fuente de verdad declarada (`generated_at: 2026-11-04`), sin revalidar contra proveedores.
- **Gate de `--write`**: se describió desde `scripts/refresh-model-catalog.mjs` y la spec
  `aspec/specs/agent-model-tiers/spec.md`; no se ejecutó una corrida real con IDs faltantes.
- **Disponibilidad real de modelos**: no se comprobó por red que cada uno de los 211 IDs del
  snapshot exista hoy en cada proveedor. La resolución de `minimo` depende de ese snapshot.
- **`opencode` local**: no se verificó que el binario esté disponible ni su versión; afecta
  `stats`/`stats failures` y el refresco manual del catálogo.
- **Repomix**: no se validó la versión exacta instalada; el fallback documentado es
  `npx repomix@1.18.0`.
- **Hosts IDE**: no se probó la instalación en cada host (claude, vscode, antigravity, cursor, roo,
  copilot, commandcode). El layout y los adaptadores se infieren de `AGENT_TARGETS` y
  `adaptFrontmatter`.
- **Memoria real**: no se abrió `.ancleto/memory.db` para inspeccionar nodos; el comportamiento se
  describe desde el código (`src/core/memory/*`).
- **CI**: no se ejecutó el workflow; su comportamiento se lee de `.github/workflows/publish.yml`.

## Discrepancias observadas

- **Artefacto de máquina desactualizado**: `.ancleto/machine-env.md` registra `ancleto: 0.18.8`;
  `package.json` está en `0.18.12`. Es un artefacto derivado que se regenera en
  `init`/`install`/`upgrade`, no un manifiesto versionado. No se corrigió porque la generación del
  seed no modifica configuración ni artefactos locales.
- **`.ancletorc` no se leyó**: la skill prohíbe leerlo directamente durante la generación y solo
  consume el `config` resuelto por `ancleto discovery --check`. Por eso este seed **no afirma** el
  `version` del manifiesto ni el detalle de `.ancletorc`; cualquier pregunta sobre él debe verificar
  el archivo o `ancleto check`.
- **Publicación de `scripts/`**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`; no incluye `scripts/`. El refresco del catálogo y el gate de IDs
  existen en el repo fuente pero no viajan en el tarball npm. Se documenta como deuda, no como fallo.
- **`rg` no disponible** en este entorno (PowerShell 5.1): la evidencia se obtuvo con
  `Select-String` y lecturas directas.

## Confianza

- **Alta (observado)**: estructura de `src/`, `package.json`, `TIERS`/`TIER_CHAINS`,
  `declaredModelIds`, `modelIdsFromCatalog`, `missingModelIdsInCatalog`, gate de `--write`,
  avisos de `check`, `looksBinaryMissing`, lint sobre `scripts/`, snapshot de 5 proveedores / 211
  IDs, flujo de `scripts/refresh-model-catalog.mjs`, comandos del CLI, firmas de módulos de
  memoria, workflow.
- **Media (inferido)**: comportamiento de hosts no probados, efecto exacto de cada adaptador en
  cada IDE, resultados de la suite y del workflow.
- **Baja / desconocida**: estado real de la memoria del repo, disponibilidad de modelos en
  proveedores al momento de leer, contenido de `audit logs/` y `documentation/` (fuera de runtime),
  versión declarada en `.ancletorc`.
