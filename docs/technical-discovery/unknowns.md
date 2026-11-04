---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-03T22:11:31Z
pluginVersion: 0.18.10
skillVersion: '2.3'
---

# Límites de evidencia

## Sin verificar en esta generación

- **Contenido del pack fuera del seed**: el pack del tier `minimo` excluye `test/**`, `docs/**` y
  `**/*.md`. Las afirmaciones sobre tests, documentación, agents/commands/skills y templates se
  apoyan en lectura directa de paths citados, no en el pack.
- **Ejecución de la suite**: no se corrió `npm test` ni `npm run lint` durante la generación; los
  guards de modelos (`test/agent-model-coherence.test.js`, `test/model-catalog.test.js`) se citan
  por su presencia y propósito, no por un resultado de ejecución.
- **Refresco del catálogo**: no se ejecutó `scripts/refresh-model-catalog.mjs`. El snapshot se tomó
  como fuente de verdad declarada (`generated_at: 2026-11-03`), sin revalidar contra proveedores.
- **Disponibilidad real de modelos**: no se comprobó por red que cada ID del snapshot exista hoy en
  cada proveedor. La resolución de `minimo` depende de ese snapshot.
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

- **Versión del manifiesto**: `.ancletorc` → `version: 0.18.8`; `package.json` → `0.18.10`;
  `CHANGELOG.md` llega a `0.18.10`. El manifiesto no se reescribió en el último bump. No se corrigió
  porque la generación del seed no modifica configuración.
- **Publicación de `scripts/`**: `package.json` → `files` lista `agents`, `commands`, `skills`,
  `templates`, `profiles`, `src`; no incluye `scripts/`. El refresco del catálogo existe en el repo
  fuente pero no viaja en el tarball npm. Se documenta como deuda, no como fallo.
- **`rg` no disponible** en este entorno (PowerShell 5.1): la evidencia se obtuvo con
  `Select-String` y lecturas directas.

## Confianza

- **Alta (observado)**: estructura de `src/`, `package.json`, `TIERS`/`TIER_CHAINS`, catálogo,
  `scripts/refresh-model-catalog.mjs`, comandos del CLI, firmas de módulos de memoria, workflow.
- **Media (inferido)**: comportamiento de hosts no probados, efecto exacto de cada adaptador en
  cada IDE, resultados de la suite y del workflow.
- **Baja / desconocida**: estado real de la memoria del repo, disponibilidad de modelos en
  proveedores al momento de leer, contenido de `audit logs/` y `documentation/` (fuera de runtime).
