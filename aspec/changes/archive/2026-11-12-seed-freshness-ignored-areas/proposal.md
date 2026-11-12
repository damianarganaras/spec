# Proposal: Áreas ignoradas fuera de la frescura del seed

## Intención

`ancleto discovery --check` hoy cuenta `documentation/**` y `audit logs/**` como cambios del
repositorio. Ambas áreas están ignoradas por git (`.gitignore:7` `/documentation`,
`.gitignore:8` `audit logs/`) y no tienen archivos versionados (`documentation` 0 tracked,
`audit logs` 0 tracked), pero el estado persistido `docs/technical-discovery/.discovery-state.json`
las conserva en `sources` (674 entradas `"documentation/` y 18 entradas `"audit logs/"`). Cualquier
churn local en esas áreas deja el seed `STALE`, y su ausencia total en un clon fresco dispara
materialidad falsa por `area raiz eliminada`.

Este change extiende el único predicado de lectura `isEphemeralSource` de `src/cli/index.js:2375-2385`
para que `documentation`/`documentation/` y `audit logs`/`audit logs/`, anclados a la raíz del
repositorio, dejen de contar como cambio de frescura. El writer, la forma del estado persistido y
`ruleVersion: 2` quedan byte-idénticos.

Es un cambio **funcional** (no de conformidad): el comportamiento observable de `discovery --check`
cambia, por eso lleva un delta MODIFIED sobre la capability `cli-diagnostics`. Release **MINOR
0.29.0**.

## Requisito citado

- `spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check`
  (`aspec/specs/cli-diagnostics/spec.md:568-707`; cláusula del writer en `:689-696`).

El delta `specs/cli-diagnostics/spec.md` reemplaza el bloque completo del Requirement con el cuerpo
íntegro y los 26 escenarios existentes (verbatim donde no cambian), más los escenarios nuevos.

## Evidencia

Detector y oráculo en `src/cli/index.js`:

- `:2162` `DEFAULT_IGNORES`; `:2192-2210` `isIgnored`/`walk` (no lee `.gitignore`);
  `:2212-2217` `computeSources`.
- `:2348-2361` `MATERIAL_FILE_RES`/`isMaterialFile`; `:2364-2367` `areaOf`;
  `:2375-2385` `isEphemeralSource` (único predicado de lectura);
  `:2395-2407` `isEphemeralOnlyChange`; `:2409-2449` `computeImpact`;
  `:2490-2590` `checkDiscovery` (filtro simétrico en `:2543-2544`, excusa ephemeral-only en
  `:2550`, materialidad por área raíz en `:2438-2441`).
- Writer puro en `src/core/discovery-state.js:9-24` (`buildDiscoveryState`/`renderDiscoveryState`).

Mediciones empíricas realizadas sobre el working tree (entrypoint `node src/cli/index.js`, reversibles,
árbol final limpio):

- cambio de contenido en `docs/` → `STALE`/`minor`, `changedAreas: ['docs']`, `materialReasons: []`,
  `affectedDocs: 10`.
- cambio de contenido en `aspec/` → `STALE`/`minor`, `changedAreas: ['aspec']`, `materialReasons: []`,
  `affectedDocs: 11`.
- cambio de contenido en `documentation/` → `STALE`/`minor`, `changedAreas: ['documentation']`,
  `materialReasons: []`.
- cambio de contenido en `audit logs/` → `STALE`/`minor`, `changedAreas: ['audit logs']`,
  `materialReasons: []`.
- sonda de ausencia: renombrar `documentation/` o `audit logs/` → `STALE`/**material** con
  `area raiz eliminada: documentation` / `area raiz eliminada: audit logs`.
- tracked counts: `docs` 21, `aspec` 307, `documentation` 0, `audit logs` 0.
- `docs/technical-discovery/.discovery-state.json` está tracked y contiene 674 entradas
  `"documentation/` y 18 entradas `"audit logs/`; `seed-map.json` contiene 0.
- `docs/technical-discovery/**` ya está excluido como `outputDir`, por lo que un filtro de subpath
  ahí sería un NO-OP.

## Alcance

In scope:

- `src/cli/index.js` — extender `isEphemeralSource` con `documentation`/`documentation/` y
  `audit logs`/`audit logs/` anclados a la raíz, y actualizar su comentario.
- `test/cli.test.js` — pins de los 8 comportamientos listados en `tasks.md`; `test/` auxiliares sólo
  si el fixture lo exige.
- `aspec/changes/seed-freshness-ignored-areas/**` — estos artifacts.
- `aspec/specs/cli-diagnostics/spec.md` — sólo en el archive, por merge del delta.

Out of scope (explícito, con evidencia):

- `docs/**` y `aspec/**`: siguen contando como frescura (tracked 21/307; contienen source-of-truth
  specs y backlog; excluirlos ocultaría señal real).
- `docs/technical-discovery/**`: ya excluido como `outputDir` → NO-OP.
- Lista de ignore de Repomix (`src/core/repomix-tier.js`): es empaquetado, no frescura.
- `walk`/`.gitignore`, `config.exclude` y `DEFAULT_IGNORES`: sin cambios.
- Writer, forma del estado, bump de `ruleVersion` (debe seguir en `2`), configuración nueva, segundo
  oráculo, hash derivado/filtrado: prohibidos.
- `ancleto-vscode-extension`: no se toca ni se archiva.

## Riesgos con mitigación

- **Ocultar cambios reales en las áreas excluidas**: `documentation/**` es material legado lnx-cli y
  `audit logs/**` no tiene archivos versionados; su churn no describe la arquitectura.
  Mitigación: la exclusión es exactamente esos dos nombres anclados a la raíz; `docs/**` y `aspec/**`
  siguen contando y hay escenarios que lo fijan.
- **Supresión de materialidad por área raíz**: un clon fresco ya no emite
  `area raiz eliminada: documentation` ni `area raiz eliminada: audit logs`. Es justamente el falso
  positivo a eliminar, porque ambas áreas son gitignored y ausentes por diseño.
- **Predicado demasiado ancho**: un prefijo laxo capturaría `docs/documentation/x.md`,
  `documentation-extra/x.md` o `src/documentation/x.js`. Mitigación: comparación por ruta completa
  contra el literal de raíz o el prefijo `documentation/` / `audit logs/`, con pin dedicado de
  lookalikes.
- **Rollback**: una CLI previa (0.28.0) no ignora nada nuevo y lee el mismo estado con los campos
  crudos, por lo que su resultado es idéntico al actual. El shape del estado y `ruleVersion: 2` no
  cambian.
- **Churn local que ya no alerta**: si alguien esperaba que el seed marcara `STALE` por tocar
  `documentation/`, ese aviso desaparece por diseño; el checklist de release sigue regenerando el
  seed.

## Decisión de arquitectura

Se extiende únicamente el predicado de lectura existente `isEphemeralSource` en `src/cli/index.js`.
El filtro se sigue aplicando simétricamente a `stored.sources` y a las rutas actuales antes de
`computeImpact` (como hoy en `:2532-2533`), de modo que ni altas ni bajas de esas áreas producen
`changedAreas` ni razones de materialidad. `storedFileHashes`/`currentFileHashes` siguen completos y
el writer no cambia.

No se agrega configuración, no se introduce un segundo oráculo, no se persiste ni compara un hash
filtrado y no se toca `computeImpact`, `areaOf`, `isMaterialFile`, `MATERIAL_FILE_RES`,
`DEFAULT_IGNORES` ni `isEphemeralOnlyChange`.

## Validación planificada

- Lint: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint` (declarado como `npm run lint`
  en `PRODUCT.md`).
- Tests: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test` (declarado como `npm test`,
  `node --test "test/*.test.js"`); acotado con ruta explícita `test/cli.test.js`.
- Format check: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (JavaScript ESM, sin `tsconfig.json`).

## Rutas autorizadas

- Implementación: `src/cli/index.js`.
- Tests: `test/cli.test.js` (`test/discovery-topology.test.js` / `test/content-guards.test.js` sólo si
  el fixture lo requiere).
- Change artifacts: `aspec/changes/seed-freshness-ignored-areas/**`.
- Spec delta: `aspec/changes/seed-freshness-ignored-areas/specs/cli-diagnostics/spec.md`; el merge a
  `aspec/specs/cli-diagnostics/spec.md` ocurre sólo en el archive.
- Release posterior: `package.json`, `package-lock.json`, `CHANGELOG.md`, `aspec/backlog.md` y los
  documentos del seed.

## Decisiones

- **memory_key:** seed-freshness-ignored-areas-reader-side-filter
  **Elección:** excluir `documentation`/`documentation/` y `audit logs`/`audit logs/` en el único predicado de lectura `isEphemeralSource`, anclados a la raíz y aplicados simétricamente a las dos vistas de `sources` dentro de `checkDiscovery`.
  **Descartado:** excluir `docs/**` y `aspec/**`; filtrar el subpath `docs/technical-discovery/**` (NO-OP por `outputDir`); tocar la lista de ignore de Repomix; modificar `walk`/`.gitignore`, `config.exclude` o `DEFAULT_IGNORES`; agregar configuración.
  **Justificación:** una extensión mínima del predicado existente arregla el churn de dos áreas gitignored sin segundo oráculo ni cambios de writer, y mantiene `docs/**` y `aspec/**` como señal real de frescura.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:seed-freshness-ignored-areas
- change:seed-freshness-ephemeral-paths

**Estado:** aprobado

- **memory_key:** seed-freshness-tracked-areas-stay-counted
  **Elección:** `docs/**` y `aspec/**` siguen contando como cambio de frescura, con escenarios que fijan que un cambio de contenido ahí reporta `STALE`/`minor` con su área.
  **Descartado:** excluir `docs/**` y `aspec/**` del cálculo de frescura.
  **Justificación:** tienen 21 y 307 archivos versionados respectivamente, contienen los specs source-of-truth y el backlog, y excluirlos ocultaría cambios reales del repositorio.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:seed-freshness-ignored-areas

**Estado:** aprobado

- **memory_key:** seed-freshness-ignored-areas-writer-unchanged
  **Elección:** el writer, la forma del estado persistido y `ruleVersion: 2` quedan intactos; `sources`/`fileHashes` siguen listando `documentation/**` y `audit logs/**`; sin configuración nueva, sin segundo oráculo y sin hash filtrado.
  **Descartado:** bumpear `ruleVersion`, filtrar las rutas al persistir o comparar un hash global derivado/filtrado.
  **Justificación:** la pertenencia de rutas es un predicado de lectura aplicado a ambas vistas, así que el estado sigue siendo compatible y un rollback lee los mismos bytes; el cambio de significado de estados ya persistidos queda descartado.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:seed-freshness-ignored-areas
- change:seed-freshness-ephemeral-paths

**Estado:** aprobado
