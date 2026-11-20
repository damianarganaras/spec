---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-20T20:21:53.850Z
pluginVersion: 0.42.0
skillVersion: '2.3'
---

# Límites de evidencia

## Excluido del pack de esta generación

- **Tests**: `test/**`, `*.test.*` y `*.spec.*` quedaron fuera por `discovery.exclude` y por los
  defaults de Repomix. No se auditó la cobertura, la calidad de los fixtures ni el detalle de cada
  suite. Las afirmaciones sobre `node --test` provienen de `package.json`, no de leer los tests.
  En particular, el comportamiento del presupuesto del working-context se leyó del código, las
  specs y el design del change, **no** de ejecutar `test/working-context.test.js`.
- **Markdown**: Repomix excluye `**/*.md` y `docs/**` por defaults. `aspec/backlog.md` se leyó
  aparte solo para el estado de release (tag, run y npm); las specs canónicas y los artifacts de
  los changes archivados no se releyeron en esta corrida. El contrato del presupuesto proviene del
  código incluido en el pack y de la generación previa, no de una nueva lectura de la spec.
- **Estado local**: `.ancletorc` no se parseó ni se editó (regla de la skill); sus valores
  efectivos de `discovery`, `memory.maxTokens`, `memory.criticalKeys`, `azure.enabled` y `agent` no
  se verificaron. `discovery --check` devolvió la configuración resuelta usada aquí.
- **Mirrors instalados**: `.opencode/**` y `.ancleto/**` son estado local, no fuentes; no se
  verificó si coinciden con la canónica. `.ancleto/machine-env.md` declara `0.40.0`, anterior al
  paquete actual, y no se usó como evidencia de versión.
- **Legado**: `documentation/**` (lnx-cli) y `audit logs/**` son material gitignored/efímero y no
  se usaron como evidencia.

## No verificado por ausencia de evidencia directa

- **Publicación 0.42.0**: `package.json` declara `0.42.0` (commit `c316cf4`) y el change está
  archivado. El estado publicado (tag anotado `v0.42.0` → `c6319c8`, run `44808502480` `success`,
  npm `0.42.0` `latest`) se transcribe de `aspec/backlog.md`, commit `274f890`; el tag existe en el
  clon local, pero no se consultaron GitHub ni npm (el protocolo prohíbe llamadas de red).
- **Ejecución del presupuesto**: la precedencia, la gramática tolerante y el modo `unlimited` se
  tomaron de `src/core/memory/working-context.js` (comentarios del pack comprimido),
  `src/core/memory/engine.js`, la spec canónica `memory-engine` y el design del change. No se
  ejecutó una corrida con env/`.ancletorc` reales para medir cuántas reglas entran.
- **Comportamiento exacto de `jev-spec`**: el adaptador no parsea su JSON; la forma del reporte y
  su semántica interna no se conocen desde este repositorio. El valor (AUC) sigue sin medirse.
- **Métricas del spike BM25**: nDCG@5/MRR@5 se transcriben de los JSON del spike archivado
  (`eval_result.json`, `tuning.json`, `measure_result.json`); no se re-ejecutaron las 37 queries en
  esta generación.
- **Hosts externos**: los layouts y esquemas de MCP de antigravity, commandcode, copilot, vscode,
  cursor y roo se tomaron de los comentarios/contratos del adaptador y del instalador; no se
  contrastaron contra documentación externa en esta corrida.
- **Rendimiento y escalabilidad**: no se midió el costo de `discovery --compress` (≈85.415 tokens
  sobre 931 archivos en esta corrida; el mapa topológico resume 971 archivos), del grafo de imports
  ni del motor FTS5 en repos grandes.
- **Estado de la suite**: no se ejecutaron `npm run lint` ni `npm test` durante la generación del
  seed (no son parte del pipeline de discovery). Los conteos de tests citados históricamente vienen
  de `aspec/backlog.md`, no de una corrida propia.
- **Fuentes de modelo**: no se verificó que `src/core/model-catalog.json` siga reflejando la oferta
  actual de los proveedores.
- **Agregados por área**: el estado del seed no incluye el contenido de `docs/technical-discovery`
  en el walk, así que la frescura no cubre erratas del propio seed. El reporte que motivó esta
  generación marcó `STALE/minor` por `aspec` (commit `274f890`), con diez documentos en
  `affectedDocs` (`units/cli-install.md` no figuraba).

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
2. Abrir `test/working-context.test.js` si la pregunta es sobre el corte exacto del presupuesto y
   sus casos borde.
3. Leer `.ancletorc` solo para operar el proyecto (nunca para generar el seed) si se necesita el
   valor efectivo de `memory.maxTokens` o `memory.criticalKeys`.
4. Consultar la documentación oficial de cada host antes de cambiar un layout o un esquema MCP.
5. Contrastar el registro de `aspec/backlog.md` con GitHub/npm si se necesita confirmación externa
   del run y del `dist-tag` (requiere red, fuera de este pipeline).
