---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-20T01:12:16.920Z
pluginVersion: 0.40.1
skillVersion: '2.3'
---

# Límites de evidencia

## Excluido del pack de esta generación

- **Tests**: `test/**`, `*.test.*` y `*.spec.*` quedaron fuera por `discovery.exclude`. No se
  auditó la cobertura, la calidad de los fixtures ni el detalle de cada suite. Las afirmaciones
  sobre `node --test` provienen de `package.json` y `PRODUCT.md`, no de leer los tests.
- **Markdown**: Repomix excluye `**/*.md` por defaults. `README.md`, `CHANGELOG.md` y `PRODUCT.md`
  se consultaron solo para comandos declarados y contexto de release; no son evidencia de
  comportamiento runtime.
- **Estado local**: `.ancletorc` no se parseó ni se editó (regla de la skill); sus valores
  efectivos de `discovery`, `memory.criticalKeys`, `azure.enabled` y `agent` no se verificaron.
  `discovery --check` devolvió la configuración resuelta usada aquí.
- **Mirrors instalados**: `.opencode/**` y `.ancleto/**` son estado local, no fuentes; no se
  verificó si coinciden con la canónica.
- **Legado**: `documentation/**` (lnx-cli) y `audit logs/**` son material gitignored/efímero y no
  se usaron como evidencia.

## No verificado por ausencia de evidencia directa

- **Comportamiento exacto de `jev-spec`**: el adaptador no parsea su JSON; la forma del reporte y
  su semántica interna no se conocen desde este repositorio.
- **Hosts externos**: los layouts y esquemas de MCP de antigravity, commandcode, copilot, vscode,
  cursor y roo se tomaron de los comentarios/contratos del adaptador y del instalador; no se
  contrastaron contra documentación externa en esta corrida.
- **Rendimiento y escalabilidad**: no se midió el costo de `discovery --compress`, del grafo de
  imports ni del motor FTS5 sobre repositorios grandes.
- **Estado de la suite**: no se ejecutaron `npm run lint` ni `npm test` durante la generación del
  seed (no son parte del pipeline de discovery).
- **Fuentes de modelo**: no se verificó que `src/core/model-catalog.json` (generado 2026-11-04)
  siga reflejando la oferta actual de los proveedores.
- **Publicación**: no se validó el estado remoto de npm/GitHub ni la existencia de tags.

## Inferencias con confianza media

- El flujo de instalación se describe combinando comentarios del código y nombres de funciones;
  algunos detalles de merge de templates y de reparación MCP podrían variar en casos borde.
- La tabla de hosts resume el descriptor de destinos; un host nuevo o un flag específico puede
  agregar matices no cubiertos.
- `src/cli/index.js` es el mayor punto de acoplamiento; la afirmación se basa en su tamaño y en la
  cantidad de responsabilidades visibles en el pack, no en un análisis de complejidad medido.

## Cómo reducir estos límites

1. Ejecutar `npm run lint` y `npm test` en una corrida de validación separada.
2. Abrir `test/*.test.js` y `test/affected-tests.json` si la pregunta es sobre cobertura o
   selección de tests.
3. Leer `.ancletorc` solo para operar el proyecto (nunca para generar el seed) si se necesita el
   valor efectivo de una clave.
4. Consultar la documentación oficial de cada host antes de cambiar un layout o un esquema MCP.
