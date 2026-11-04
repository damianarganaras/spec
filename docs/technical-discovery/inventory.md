---
node: inventory
kind: inventory
read_when: "verificar el alcance documentado de la semilla"
generatedAt: 2026-11-03T22:11:31Z
pluginVersion: 0.18.10
skillVersion: '2.3'
---

# Alcance documentado

| Alcance | Documento | Motivo |
|---|---|---|
| `src/cli/**` | `units/cli-install.md`, `overview.md` | Entry point único, subcomandos, instalación y MCP |
| `src/core/tier-models.js`, `src/core/model-catalog.json` | `decisions.md`, `units/discovery-engine.md` | Dueño de tiers/cadenas y snapshot de modelos |
| `src/core/discovery.js`, `src/core/repomix-tier.js` | `units/discovery-engine.md` | Topología, impacto, args y presupuesto de pack |
| `src/core/affected-set.js` | `units/discovery-engine.md` | Grafo de imports y clausura de dependientes |
| `src/core/adapters/frontmatter.js` | `units/cli-install.md` | Adaptación pura de frontmatter por host |
| `src/core/machine-env.js` | `units/cli-install.md`, `setup.md` | Detección de shell/EOL/tooling y exclusión local |
| `src/core/memory/**` | `units/memory-engine.md` | Motor, DB, tools, MCP, doctor, curaduría, snapshot |
| `scripts/**` | `decisions.md`, `units/discovery-engine.md` | Refresco manual del catálogo de modelos |
| `agents/**` | `units/_map.md`, `units/cli-install.md` | 10 agentes instalables (superficie de producto) |
| `commands/**` | `units/_map.md` | 16 comandos `/cleto-*` |
| `skills/**` | `units/_map.md` | Skills nativas del ciclo SDD y discovery |
| `templates/**` | `units/cli-install.md`, `decisions.md` | `AGENTS.md`/`PRODUCT.md` con bloques `LOCKED` |
| `profiles/**` | `units/cli-install.md` | Overlay del perfil `test` (agents/commands/templates) |
| `aspec/**` | `overview.md`, `decisions.md` | Config, specs canónicos y changes (incl. archive) |
| `test/**` | `setup.md`, `units/_map.md` | Suite `node --test`; guards de modelos y discovery |
| `.github/workflows/**` | `integrations.md` | Publicación npm y release GitHub |
| `docs/technical-discovery/**` | `index.md` | Este seed (excluido del hash de fuentes) |
| `docs/**` (resto) | `inventory.md` | Documentación del framework y guías |
| `documentation/**` | `integrations.md` | Material legado lnx-cli, gitignored, no runtime |
| `.ancletorc`, `.opencode/.ancleto-tier`, `opencode.json` | `setup.md`, `decisions.md` | Configuración y estado local por proyecto |
| `.ancleto/machine-env.md` | `setup.md` | Artefacto local derivado |
| `package.json`, `.gitattributes`, `.gitignore` | `setup.md`, `decisions.md` | Contrato de runtime, EOL y exclusiones |

## Áreas raíz observadas (`.discovery-map.json`)

`.github` (1), `.opencode` (66), `agents` (10), `aspec` (205), `audit logs` (9), `commands` (16),
`docs` (21), `documentation` (340), `profiles` (8), `scripts` (1), `skills` (35), `src` (17),
`templates` (2), `test` (25). Total: 771 archivos.

Notas de alcance: `audit logs/` y `documentation/` están gitignored y no son runtime; el pack del
tier `minimo` excluye `test/**`, `docs/**` y `**/*.md`, por lo que la evidencia de esas áreas se
verificó por lectura directa.
