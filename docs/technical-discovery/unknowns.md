---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-20T14:36:40.644Z
pluginVersion: 0.41.0
skillVersion: '2.3'
---

# Límites de evidencia

## Excluido del pack de esta generación

- **Tests**: `test/**`, `*.test.*` y `*.spec.*` quedaron fuera por `discovery.exclude`. No se
  auditó la cobertura, la calidad de los fixtures ni el detalle de cada suite. Las afirmaciones
  sobre `node --test` provienen de `package.json`, no de leer los tests.
- **Markdown**: Repomix excluye `**/*.md` por defaults. `README.md`, `PRODUCT.md`, `CHANGELOG.md` y
  `aspec/backlog.md` se consultaron fuera del pack solo para comandos declarados y estado de
  release (tag, npm, archive); no son evidencia de comportamiento runtime. Las specs canónicas
  (`aspec/specs/**`) tampoco entraron al pack: los límites del fallback OR-prefijo se tomaron de
  los comentarios del motor.
- **Estado local**: `.ancletorc` no se parseó ni se editó (regla de la skill); sus valores
  efectivos de `discovery`, `memory.criticalKeys`, `azure.enabled` y `agent` no se verificaron.
  `discovery --check` devolvió la configuración resuelta usada aquí.
- **Mirrors instalados**: `.opencode/**` y `.ancleto/**` son estado local, no fuentes; no se
  verificó si coinciden con la canónica. `.ancleto/machine-env.md` declara `0.39.1`, anterior al
  paquete actual, y no se usó como evidencia de versión.
- **Legado**: `documentation/**` (lnx-cli) y `audit logs/**` son material gitignored/efímero y no
  se usaron como evidencia.

## No verificado por ausencia de evidencia directa

- **Comportamiento exacto de `jev-spec`**: el adaptador no parsea su JSON; la forma del reporte y
  su semántica interna no se conocen desde este repositorio. El valor (AUC) sigue sin medirse.
- **Métricas del spike BM25**: nDCG@5/MRR@5 se transcriben de los JSON del spike archivado
  (`eval_result.json`, `tuning.json`, `measure_result.json`); no se re-ejecutaron las 37 queries en
  esta generación.
- **Hosts externos**: los layouts y esquemas de MCP de antigravity, commandcode, copilot, vscode,
  cursor y roo se tomaron de los comentarios/contratos del adaptador y del instalador; no se
  contrastaron contra documentación externa en esta corrida.
- **Rendimiento y escalabilidad**: no se midió el costo de `discovery --compress` (≈84.9k tokens
  sobre 926 archivos en esta corrida), del grafo de imports ni del motor FTS5 en repos grandes.
- **Estado de la suite**: no se ejecutaron `npm run lint` ni `npm test` durante la generación del
  seed (no son parte del pipeline de discovery). Los conteos de tests citados vienen de
  `aspec/backlog.md`, no de una corrida propia.
- **Fuentes de modelo**: no se verificó que `src/core/model-catalog.json` (generado 2026-11-04)
  siga reflejando la oferta actual de los proveedores.
- **Publicación 0.41.0**: el tag `v0.41.0` y su commit (`5c171bc`) se verificaron en git local;
  el run `44781865327` y el estado `latest` en npm son **declarados** por el reporte de release del
  orquestador y por `aspec/backlog.md` (commit `24b1eb7`). No se consultó GitHub ni npm: el
  protocolo prohíbe llamadas de red.
- **Agregados por área**: el estado del seed no incluye el contenido de `docs/technical-discovery`
  en el walk, así que la frescura no cubre erratas del propio seed.

## Inferencias con confianza media

- El flujo de instalación se describe combinando comentarios del código y nombres de funciones;
  algunos detalles de merge de templates y de reparación MCP podrían variar en casos borde.
- La tabla de hosts resume el descriptor de destinos; un host nuevo o un flag específico puede
  agregar matices no cubiertos.
- `src/cli/index.js` es el mayor punto de acoplamiento; la afirmación se basa en su tamaño y en la
  cantidad de responsabilidades visibles en el pack, no en un análisis de complejidad medido.
- Los conteos por directorio provienen de `.discovery-map.json` (pueden incluir material no
  versionado, como `documentation/` y `audit logs/`).

## Cómo reducir estos límites

1. Ejecutar `npm run lint` y `npm test` en una corrida de validación separada.
2. Abrir `test/*.test.js` y `test/affected-tests.json` si la pregunta es sobre cobertura o
   selección de tests.
3. Leer `.ancletorc` solo para operar el proyecto (nunca para generar el seed) si se necesita el
   valor efectivo de una clave.
4. Consultar la documentación oficial de cada host antes de cambiar un layout o un esquema MCP.
5. Verificar en GitHub/npm el run `44781865327` si se necesita evidencia primaria de la publicación
   de 0.41.0 (requiere red, fuera de este pipeline).
