---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-20T22:00:13.847Z
pluginVersion: 0.43.0
skillVersion: '2.3'
---

# Límites de evidencia

## Excluido del pack de esta generación

- **Tests**: `test/**`, `*.test.*` y `*.spec.*` quedaron fuera por `discovery.exclude` y por los
  defaults de Repomix. No se auditó la cobertura ni el detalle de cada suite. Que 0.43.0 agregó
  casos a `test/cli.test.js` (+57 líneas) y `test/memory-engine.test.js` (+103) se observó por
  `git diff`, **no** leyendo ni ejecutando los tests.
- **Markdown**: Repomix excluye `**/*.md` y `docs/**` por defaults, así que el pack no contiene
  `CHANGELOG.md` ni `aspec/**/*.md`. Para el estado de release y el contrato del import se leyeron
  aparte, de forma acotada, `CHANGELOG.md`, `aspec/backlog.md`, `aspec/specs/memory-ops/spec.md` y
  `aspec/specs/memory-engine/spec.md` (diff contra `274f890`). No se recorrieron los artifacts
  completos del change archivado `memory-import-scope-string`.
- **Estado local**: `.ancletorc` no se parseó ni se editó (regla de la skill); sus valores
  efectivos de `discovery`, `memory.maxTokens`, `memory.criticalKeys`, `azure.enabled` y `agent` no
  se verificaron. `discovery --check` devolvió la configuración resuelta usada aquí.
- **Mirrors instalados**: `.opencode/**` y `.ancleto/**` son estado local, no fuentes; no se
  verificó si coinciden con la canónica. `.ancleto/machine-env.md` declara `0.40.0`, anterior al
  paquete actual (`0.43.0`), y no se usó como evidencia de versión.
- **Legado**: `documentation/**` (lnx-cli) y `audit logs/**` son material gitignored/efímero y no
  se usaron como evidencia.

## No verificado por ausencia de evidencia directa

- **Publicación 0.43.0**: `package.json` declara `0.43.0` (commit `9ba7975`) y `CHANGELOG.md` tiene
  la sección; `aspec/backlog.md` la registra como “preparada, sin tag ni run todavía”. El tag
  `v0.43.0` **no existe** en el clon local (`git tag --list` devuelve `v0.42.0` como último) y no
  se consultaron GitHub ni npm (el protocolo prohíbe llamadas de red). Cualquier afirmación sobre
  el run de publish o el `dist-tag` de 0.43.0 sería especulativa.
- **Contrato del import en ejecución**: la validación de `scope` se leyó del código incluido en el
  pack (`validateImportEntries`, `formatRawValue`, `memoryImport`) y del delta de specs; no se
  ejecutó `memory import` con un archivo inválido para observar el exit code y el mensaje reales.
- **Ejecución del presupuesto del working-context**: la precedencia, la gramática tolerante y el
  modo `unlimited` se tomaron de `src/core/memory/working-context.js`, del engine y de las specs.
  No se ejecutó una corrida con env/`.ancletorc` reales para medir cuántas reglas entran.
- **Comportamiento exacto de `jev-spec`**: el adaptador no parsea su JSON; la forma del reporte y
  su semántica interna no se conocen desde este repositorio. El valor (AUC) sigue sin medirse.
- **Métricas del spike BM25**: nDCG@5/MRR@5 se transcriben de los JSON del spike archivado
  (`eval_result.json`, `tuning.json`, `measure_result.json`); no se re-ejecutaron las 37 queries.
- **Hosts externos**: los layouts y esquemas de MCP de antigravity, commandcode, copilot, vscode,
  cursor y roo se tomaron de los comentarios/contratos del adaptador y del instalador; no se
  contrastaron contra documentación externa en esta corrida.
- **Rendimiento y escalabilidad**: no se midió el costo de `discovery --compress` (≈85.629 tokens
  sobre 935 archivos en esta corrida; el mapa topológico resume 975 archivos), del grafo de imports
  ni del motor FTS5 en repos grandes.
- **Estado de la suite**: no se ejecutaron `npm run lint` ni `npm test` durante la generación del
  seed (no son parte del pipeline de discovery). Los conteos de tests citados históricamente vienen
  de `aspec/backlog.md`, no de una corrida propia.
- **Fuentes de modelo**: no se verificó que `src/core/model-catalog.json` siga reflejando la oferta
  actual de los proveedores.
- **Agregados por área**: el estado del seed no incluye el contenido de `docs/technical-discovery`
  en el walk, así que la frescura no cubre erratas del propio seed. El reporte que motivó esta
  generación marcó `STALE/minor` por `CHANGELOG.md`, `aspec` y `src`, con los once documentos en
  `affectedDocs`.

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
2. Abrir `test/memory-engine.test.js` y `test/cli.test.js` si la pregunta es sobre los casos borde
   del `scope` en el import (0.43.0).
3. Leer `.ancletorc` solo para operar el proyecto (nunca para generar el seed) si se necesita el
   valor efectivo de `memory.maxTokens` o `memory.criticalKeys`.
4. Consultar la documentación oficial de cada host antes de cambiar un layout o un esquema MCP.
5. Contrastar el registro de `aspec/backlog.md` con GitHub/npm si se necesita confirmación externa
   del tag, run y `dist-tag` de 0.43.0 (requiere red, fuera de este pipeline).
