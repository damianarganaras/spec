---
node: units/discovery-engine
kind: dossier
read_when: "cómo se genera el mapa topológico, el pack Repomix, el impacto del seed, el affected-set, la selección de tests y la resolución de modelos"
covers: [topología, empaquetado, tiers, estado del seed, impacted-set, selección de tests, catálogo de modelos, integridad de IDs]
sources: ["src/core/discovery.js", "src/core/discovery-glob.js", "src/core/discovery-state.js", "src/core/repomix-tier.js", "src/core/affected-set.js", "src/core/test-selection.js", "src/core/model-catalog.js", "src/core/model-catalog.json", "src/core/model-declarations.js", "src/core/tier-models.js", "scripts/refresh-model-catalog.mjs", "scripts/test-affected.mjs", "src/cli/index.js"]
generatedAt: 2026-11-20T01:36:10.038Z
pluginVersion: 0.40.1
skillVersion: '2.3'
---

# Unidad: discovery, affected-set y modelos

## Propósito

Reúne las piezas que permiten responder “qué cambió y qué se ve afectado”: mapa topológico,
empaquetado de contexto, estado/frescura del seed, grafo de imports, plan de tests y resolución de
modelos por tier. Es una unidad de soporte a decisiones, no de producto visible.

## Recorrido relevante

### Mapa topológico y pack

1. `buildTopologyMap` recorre el repositorio, aplica los ignores y resume archivos por directorio.
   `writeDiscoveryMap` persiste `.discovery-map.json` (`last_updated`, `total_files`,
   `tree_summary`, `root_files`). Hoy resume 946 archivos (`aspec` 355, `test` 40, `src` 25).
2. `discovery --check` calcula hashes por archivo y por área, compara con el estado almacenado y
   deriva `state`/`impact`/`affectedDocs`. Los cambios efímeros (`.ancleto/**`,
   `.discovery-map.json`) no generan áreas. El bump de `version` de `package.json` se reemplaza por
   un centinela para no contar como cambio de contenido.
3. `discovery --compress` construye **un** pack Repomix con `buildRepomixArgs(flags, tier,
   exclude)`; el presupuesto de tokens depende del tier. El pack va a un archivo temporal y el
   estado se guarda con `packTokens` y hashes.
4. `seed-map.json` mapea cada documento del seed a las áreas de las que sacó evidencia; el check lo
   usa para acotar la próxima regeneración (`affectedDocs`).

### Globs

`compileGlob` traduce un glob a regex por tokens con precedencia `**/`, `/**`, `**`, `*`, `?`.
`*` y `?` nunca cruzan `/`; las rutas relativas usan `/` aun en Windows. El `RegExp` se cachea por
string de glob. Evidencia: `src/core/discovery-glob.js`.

### Affected-set

1. `collectSourceFiles` reúne `.js/.mjs/.cjs/.ts/.tsx` respetando los ignores del discovery.
2. `extractSpecifiers` reconoce `import`, `export … from`, `import '…'` y llamadas `import(...)`/
   `require(...)` con argumento literal puro. Un argumento no literal se reporta como `unresolved`;
   un especificador no relativo cuenta como externo (`externalCount`).
3. `buildImportGraph` construye aristas `src → deps` y `computeAffectedSet` calcula la clausura
   transitiva de **dependientes** sembrada por los archivos tocados. Es zero-dep, determinista y
   conservador: sobre-incluye antes que dejar un hueco.

### Selección de tests

`planTestSelection` es read-only y fail-closed. Combina el affected-set con el manifiesto
`test/affected-tests.json` (couplings no-import, `always`, triggers). Si el manifiesto no cubre el
universo `test/*.test.js`, hay imports irresolubles o un test no puede clasificarse, `complete` es
`false` y el consumidor (`scripts/test-affected.mjs`) corre la suite completa declarada. Nunca
interpreta la ausencia de plan como selección vacía.

### Catálogo y tiers

- `src/core/model-catalog.json` es un snapshot commiteado (proveedores, IDs, `cost`, `limit`),
  generado manualmente con `scripts/refresh-model-catalog.mjs`. El script clasifica la corrida
  (`available`, `binary-missing`, `network-unavailable`, `partial`) y solo escribe con `--write`
  si el gate de integridad pasa.
- `src/core/model-declarations.js` es el collector único de IDs declarados en `agents/*.md`,
  `profiles/*/agents/*.md` y `opencode.json` (quinta fuente desde 0.40.1). Falla cerrado si una
  fuente no se puede leer; no usa red.
- `tier-models.js` es dueño de `TIERS`, `TIER_CHAINS`, `resolveTierModels`, `gratisModel`,
  `freeTierOnPrimary` y `declaredModelIds`. `minimo` usa cadenas de preferencia; si ningún
  candidato está disponible, la resolución estricta falla.

## Reglas, contratos y riesgos

- **Un solo pack por generación**: `--check` no crea packs; no se corre un pack sin comprimir
  antes ni un segundo `--compress` en la misma generación.
- **Estado byte-estable**: `discovery-state.js` no ordena ni normaliza; el orden de claves es
  contrato para poder pinear offline los bytes persistidos.
- **Impacto por área**: un área es el directorio de primer nivel o un archivo raíz. Los cambios
  efímeros no deben producir `affectedDocs`.
- **Grafo conservador**: `unresolved` no es un error fatal del comando, pero sí vuelve no confiable
  el cierre para la selección de tests.
- **Manifiesto cerrado**: declarar un test fuera del universo o un coupling sin trigger/tests
  invalida el manifiesto; es intencional.
- **Catálogo**: el refresco es manual, nunca en CI ni en `install`/`update`/`init`/`import`/`check`
  ni en la suite. Un ID declarado que no sobrevive en el candidato bloquea `--write`.
- **Riesgo**: el catálogo puede quedar desactualizado (snapshot 2026-11-04); `check` emite un aviso
  advisory de antigüedad, no lo refresca.

## Paths clave

| Path | Rol |
| --- | --- |
| `src/core/discovery.js` | Topología y mapa `.discovery-map.json` |
| `src/core/discovery-glob.js` | Globs a regex con caché |
| `src/core/discovery-state.js` | Armado/serialización pura del estado |
| `src/core/repomix-tier.js` | Tier del proyecto, presupuesto y argumentos del pack |
| `src/core/affected-set.js` | Grafo de imports y clausura de dependientes |
| `src/core/test-selection.js` | Plan de tests fail-closed |
| `src/core/model-catalog.js` | Parseo, diff y validación del catálogo |
| `src/core/model-catalog.json` | Snapshot commiteado de modelos |
| `src/core/model-declarations.js` | Collector de declaraciones versionadas |
| `src/core/tier-models.js` | Tiers, cadenas y resolución |
| `scripts/refresh-model-catalog.mjs` | Refresco manual del catálogo |
| `scripts/test-affected.mjs` | Consumidor del plan de tests |
| `src/cli/index.js` | Comandos `discovery`, `affected`, `check` y `stats` |
