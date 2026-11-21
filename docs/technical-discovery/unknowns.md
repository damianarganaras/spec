---
node: unknowns
kind: unknowns
read_when: "qué no se pudo verificar y cómo afecta la confianza del seed"
generatedAt: 2026-11-21T05:55:56.128Z
pluginVersion: 0.43.1
skillVersion: '2.3'
---

# Límites de evidencia

## Excluido del pack de esta generación

- **Tests**: el pack excluye `test/**`, `*.test.*` y `*.spec.*`. No se ejecutó la suite ni se
  auditó su cobertura. Para documentar 0.43.1 se leyeron aparte, de forma acotada, las primeras 70
  líneas de `test/host-matrix.test.js` y el diff de `test/affected-tests.json`; no se recorrió el
  archivo completo (696 líneas).
- **Markdown**: Repomix excluye `docs/**` y `**/*.md` por defaults, así que el pack no contiene
  `CHANGELOG.md`, `aspec/**/*.md` ni `docs/baseline/**`. Para el estado de release y el contrato de
  la matriz se leyeron aparte `CHANGELOG.md`, `aspec/backlog.md`,
  `aspec/specs/agent-install-routing/spec.md` y el proposal de CH-07. No se recorrieron los
  artifacts completos de los changes archivados.
- **Estado local**: `.ancletorc` no se parseó ni se editó (regla de la skill); sus valores
  efectivos de `discovery`, `memory.maxTokens`, `memory.criticalKeys`, `azure.enabled` y `agent` no
  se verificaron. `discovery --check` devolvió la configuración resuelta usada aquí. Aunque es
  local/gitignored, el reporte lo listó como área cambiada: el walk de frescura lo incluye como
  archivo raíz.
- **Mirrors instalados**: `.opencode/**` y `.ancleto/**` son estado local, no fuentes; no se
  verificó si coinciden con la canónica. `.ancleto/machine-env.md` declara `0.39.1`, anterior al
  paquete actual (`0.43.1`), y no se usó como evidencia de versión.
- **Legado**: `documentation/**` (lnx-cli) y `audit logs/**` son material gitignored/efímero y no
  se usaron como evidencia.

## No verificado por ausencia de evidencia directa

- **Publicación 0.43.1**: `package.json` y `CHANGELOG.md` declaran `0.43.1` (commit `7758d46`) y
  existe el tag anotado local `v0.43.1` (objeto `fce834b`) → `7758d46`. `aspec/backlog.md` la
  declara **"preparada, sin push"** y no registra run ni `dist-tag`. No se consultaron GitHub ni npm
  (el protocolo prohíbe llamadas de red): no se verificó que el tag exista en el remoto ni que npm
  exponga 0.43.1.
- **Publicación 0.43.0**: el run `44827344442` `success` y npm `latest` son **declarados** por el
  backlog y por el `CHANGELOG.md`; no se verificaron contra el servicio en esta corrida.
- **Contrato del import en ejecución**: la validación de `scope` se leyó del código incluido en el
  pack y del delta de specs; no se ejecutó `memory import` con un archivo inválido para observar el
  exit code y el mensaje reales.
- **Ejecución del presupuesto del working-context**: la precedencia, la gramática tolerante y el
  modo `unlimited` se tomaron de `src/core/memory/working-context.js`, del engine y de las specs.
  No se ejecutó una corrida con env/`.ancletorc` reales para medir cuántas reglas entran.
- **Matriz de hosts**: el contrato se leyó de la spec y de las primeras aserciones del test; no se
  ejecutó `node --test test/host-matrix.test.js`. No se probó con hosts reales ni con binarios de
  host (la matriz es offline por diseño).
- **Comportamiento exacto de `jev-spec`**: el adaptador no parsea su JSON; la forma del reporte y
  su semántica interna no se conocen desde este repositorio. El valor (AUC) sigue sin medirse.
- **Métricas del spike BM25**: nDCG@5/MRR@5 se transcriben de los JSON del spike archivado
  (`eval_result.json`, `tuning.json`, `measure_result.json`); no se re-ejecutaron las 37 queries.
- **Hosts externos**: los layouts y esquemas de MCP de antigravity, commandcode, copilot, vscode,
  cursor y roo se tomaron de los comentarios/contratos del adaptador, del instalador y de la matriz;
  no se contrastaron contra documentación externa en esta corrida.
- **Rendimiento y escalabilidad**: no se midió el costo de `discovery --compress` (943 archivos,
  ≈85.629 tokens en esta corrida; el mapa topológico resume 984 archivos), del grafo de imports ni
  del motor FTS5 en repos grandes.
- **Estado de la suite**: no se ejecutaron `npm run lint` ni `npm test` durante la generación del
  seed (no son parte del pipeline de discovery). Los conteos de tests citados históricamente vienen
  de `aspec/backlog.md`, no de una corrida propia.
- **Fuentes de modelo**: no se verificó que `src/core/model-catalog.json` siga reflejando la oferta
  actual de los proveedores.
- **Agregados por área**: el estado del seed no incluye el contenido de `docs/technical-discovery`
  en el walk, así que la frescura no cubre erratas del propio seed. El reporte que motivó esta
  generación marcó `STALE/minor` por las áreas `.ancletorc`, `CHANGELOG.md`, `aspec`, `docs` y
  `test` (HEAD `c58a01b`), con los once documentos en `affectedDocs`.

## Inferencias con confianza media

- El flujo de instalación se describe combinando comentarios del código y nombres de funciones;
  algunos detalles de merge de templates y de reparación MCP podrían variar en casos borde.
- La tabla de hosts resume el descriptor de destinos; la matriz 0.43.1 la verifica offline, pero un
  host nuevo o un flag específico puede agregar matices no cubiertos.
- `src/cli/index.js` es el mayor punto de acoplamiento; la afirmación se basa en su tamaño (5.851
  líneas) y en la cantidad de responsabilidades visibles en el pack, no en un análisis de
  complejidad medido.
- Los conteos por directorio provienen de `.discovery-map.json` (pueden incluir material no
  versionado, como `documentation/` y `audit logs/`).

## Cómo reducir estos límites

1. Ejecutar `npm run lint` y `npm test` en una corrida de validación separada.
2. Ejecutar `node --test test/host-matrix.test.js` si la pregunta es sobre el ruteo de assets o MCP
   por host (0.43.1).
3. Abrir `test/memory-engine.test.js` y `test/cli.test.js` si la pregunta es sobre los casos borde
   del `scope` en el import (0.43.0).
4. Leer `.ancletorc` solo para operar el proyecto (nunca para generar el seed) si se necesita el
   valor efectivo de `memory.maxTokens` o `memory.criticalKeys`.
5. Consultar la documentación oficial de cada host antes de cambiar un layout o un esquema MCP.
6. Contrastar `aspec/backlog.md` con GitHub/npm si se necesita confirmación externa del push de
   0.43.1 o del run de 0.43.0 (requiere red, fuera de este pipeline).
