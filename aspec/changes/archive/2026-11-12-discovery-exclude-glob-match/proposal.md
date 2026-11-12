# Proposal: Patrones de exclusión del discovery con semántica de glob segment-aware

## Intención

`ancleto discovery` excluye de `sources` cada ruta que coincide con un patrón de
`discovery.exclude` de `.ancletorc`. El matcher actual no interpreta `*` ni `?` como comodines:
los deja crudos dentro de una expresión regular, de modo que los patrones del propio repo
(`**/*.test.*`, `**/*.spec.*`) no excluyen casi nada. El resultado es que `sources` retiene
archivos de test que el pack de Repomix sí ignora, y `discovery --check` reporta `changedAreas:
["test"]` por commits que sólo tocan tests.

Este change corrige el matcher existente con una traducción por segmentos y anclaje conservado,
sin configuración nueva y sin un segundo oráculo. Es un cambio **funcional** (no de conformidad):
cambia el conjunto observable de `sources` y de `changedAreas`, por eso lleva un delta **ADDED**
sobre la capability `cli-diagnostics`. Release **MINOR 0.30.0**.

## Requisito citado

- `spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check`
  (`aspec/specs/cli-diagnostics/spec.md:568-719` para el requirement y `:720-986` para sus 34
  escenarios), que gobierna los campos que se ven afectados (`changedAreas`, `impact`,
  `materialReasons`) pero **no promete** la semántica de `discovery.exclude`.

Ningún requirement de `aspec/specs/**` promete hoy la semántica de los patrones de exclusión, por
eso el delta usa **ADDED Requirements** con un requirement nuevo que se apropia de esa conducta.
Un MODIFIED obligaría a reescribir el cuerpo completo del requirement de frescura y sus 34
escenarios, que no cambian.

## Defecto con evidencia

- `src/cli/index.js:2181-2183` — defecto previo: `escapeRe` no escapaba `*` ni `?`; la corrección
  ya los escapa como literales, junto con `.+^${}()|[]\`.
- Defecto previo de `matchesGlob`: la rama con `**` compilaba
  `glob.split('**').map(escapeRe).join('.*')` y anclaba `^...$`; la rama sin `**` compilaba
  `glob.split('*').map(escapeRe).join('[^/]*')` y anclaba prefijo con `(/|$)`. Hoy la función es la
  traducción por tokens descrita abajo (`src/cli/index.js:2187-2212`).
- Consecuencia previa: `**/*.test.*` compilaba a `^.*/*\.test\.*$` (sólo cadenas terminadas en
  `.test` + puntos) y no matcheaba `test/specs-merge.test.js` ni `src/foo.test.js`;
  `**/*.spec.*` ídem.
- `src/cli/index.js:2162` `DEFAULT_IGNORES` y `:2165-2179` `loadDiscoveryConfig`; `:2214-2217`
  `isIgnored`; `:2219-2232` `walk` (rutas siempre con `/`, archivo raíz sin `/`);
  `:2234-2239` `computeSources`.
- `.ancletorc:24-36` declara exactamente `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`,
  `**/*.png`, `**/*.jpg`, `**/*.svg`, `**/*.ico`, `public`, `package-lock.json`, `yarn.lock`,
  `pnpm-lock.yaml`.
- Medición: 0 de 466 rutas de `git ls-files` matchean `**/*.test.*` ni `**/*.spec.*`.
- Medición: `docs/technical-discovery/.discovery-state.json` tiene 872 `sources`; 21 terminan en
  `.test.`, todas `test/*.test.js`.
- Fixture e2e fuera del repo: `a.test.js` y `src/b.test.js` entran a `sources`;
  `test/__tests__/c.js`, `public/p.html` y `package-lock.json` no entran.
- `**/__tests__/**` → `^.*/__tests__/.*$`: funciona anidado, no en raíz (`__tests__/x`).
- `**/*.png` → `^.*/*\.png$`: funciona en raíz y anidado porque `.*` puede ser vacío.
- `public` → `^public(/|$)` y `package-lock.json` → `^package-lock\.json(/|$)`: funcionan y
  anclan a la raíz.
- Segundo consumidor: `src/cli/index.js:2614-2620` `runRepomix` carga `config.exclude` y lo pasa a
  `buildRepomixArgs` (`src/core/repomix-tier.js:23-33`), que lo entrega como `--ignore` a Repomix
  (minimatch), que ya excluye `.test.*`. `sources` y el pack divergen hoy.

## Corrección elegida

Una sola implementación: reescribir `matchesGlob` como traducción por tokens, con esta precedencia
y anclaje:

- escapar todo metacarácter literal, **incluidos** `*` y `?`;
- `**/` → `(?:.*/)?`;
- `/**` → `(?:/.*)?`;
- `**` restante → `.*`;
- `*` restante → `[^/]*`;
- `?` restante → `[^/]`.

Un patrón con `**` se ancla `^...$`. Un patrón sin `**` conserva **exactamente** el
comportamiento de la rama actual: `*` → `[^/]*` y prefijo anclado `^(?:...)(?:/|$)`, de modo que
`public` y los lockfiles de raíz no cambian. El orden de las secuencias importa: `**/` y `/**`
deben consumirse antes que un `**` suelto.

## Alcance

In scope:

- `src/cli/index.js` — `matchesGlob` (`:2187-2212`), y el comentario o helper mínimo que la
  traducción requiera.
- `test/cli.test.js` — pins de matcher y de `changedAreas`/`impact`; fixtures auxiliares sólo si
  el fixture existente no alcanza.
- `aspec/changes/discovery-exclude-glob-match/**` — estos artifacts.
- `aspec/specs/cli-diagnostics/spec.md` — sólo en el archive, por merge del delta.

Out of scope (explícito):

- `DEFAULT_IGNORES` (`:2162`), `loadDiscoveryConfig` (`:2165-2179`), `isIgnored` (`:2214-2217`),
  `walk` (`:2219-2232`), `outputDir` y su comparación literal.
- Writer y forma del estado (`schemaVersion: 2`), hash por archivo y `ruleVersion: 2`; sin
  migración ni reescritura del estado.
- `isEphemeralSource` y la regla de frescura 0.29.0 (`documentation/`, `audit logs/`): no se
  reabren.
- `buildRepomixArgs` y `src/core/repomix-tier.js`: el `--ignore` de Repomix sigue con minimatch.
- Configuración nueva, segundo matcher, dependencia de globbing, cambio de `walk`/`.gitignore` o
  de la lista de ignores de Repomix.
- `ancleto-vscode-extension`: no se toca ni se archiva.

## Riesgos con mitigación

- **Over-match**: `*` pasando de literal a comodín (y `?` también) amplía lo excluido. Mitigación:
  la traducción es exactamente la semántica minimatch para los casos usados, `*`/`?` nunca cruzan
  `/`, hay pins de lookalikes (`public-x`, `__tests__-extra/x`) y la rama sin `**` queda idéntica.
- **Estados legacy quedan `STALE` una vez**: `sources` encoge y las rutas que el estado
  persistido conserva se leen como bajas. Mitigación: no se migra ni se reescribe el estado; en
  este repo el primer `--check` es `minor`: `test/fixtures/memory/**` no matchea `**/*.test.*` y
  mantiene viva el área `test`; `material` por `area raiz eliminada` sólo aplica si un área pierde
  todas sus rutas incluidas. Tras la primera regeneración el estado queda `READY`/`none`, y los
  commits que sólo tocan `*.test.*` ya no producen área. `ruleVersion` no se bumpea.
- **`**/*.png` en raíz no debe romperse**: la traducción `**/` → `(?:.*/)?` mantiene el match en
  raíz y en anidado; hay pin explícito de ambas formas.
- **`?` hoy puede lanzar**: sin escapar, un `?` sin cuantificador previo produce un `new RegExp`
  inválido. La traducción lo convierte en `[^/]` y un pin fija que no lanza.
- **Divergencia con Repomix**: ambos consumidores ya usan sintaxis compatible para estos patrones,
  pero no se promete paridad general; sólo se alinea el conjunto usado por el repo.
- **Rollback**: revertir el matcher devuelve el comportamiento actual sin tocar estado ni
  `ruleVersion`; el estado regenerado sigue siendo legible porque su forma no cambia.

## Decisión de arquitectura

Se corrige la única implementación existente, `matchesGlob`, en lugar de filtrar del lado del
lector o introducir un segundo matcher. Todos los consumidores de `config.exclude` dentro de la
CLI pasan por `isIgnored`/`matchesGlob`; un filtro reader-side en `checkDiscovery` dejaría
`sources` divergente y duplicaría la semántica. El algoritmo de tokenización vive en el código y
en el requirement, no en un `design.md` nuevo (retirado por
`spec:prompt-contracts#Retiro de design.md y context.md sin artifact sucesor`).

## Validación planificada

- Lint: `npm run lint` (declarado en `PRODUCT.md` → `## Project Commands`).
- Tests: `npm test` (declarado); validación acotada con ruta explícita `test/cli.test.js`.
- Format check: `not-configured` (sin formatter declarado).
- Typecheck: no aplica (JavaScript ESM, sin `tsconfig.json`).
- Verificación empírica del matcher sobre el fixture del repo: `**/*.test.*` y `**/*.spec.*`
  excluyen raíz y anidado; `**/*.png` sigue excluyendo raíz y anidado; `public` y
  `package-lock.json` conservan su comportamiento.
- Los chequeos de frescura se corren con `node src/cli/index.js discovery --check` (entrypoint del
  working tree): el binario `ancleto` del PATH puede estar rezagado y dar evidencia falsa.

## Rutas autorizadas

- Implementación: `src/cli/index.js`.
- Tests: `test/cli.test.js` (`test/fixtures/**` sólo si el fixture lo exige).
- Change artifacts: `aspec/changes/discovery-exclude-glob-match/**`.
- Spec delta: `aspec/changes/discovery-exclude-glob-match/specs/cli-diagnostics/spec.md`; el
  merge a `aspec/specs/cli-diagnostics/spec.md` ocurre sólo en el archive.
- Release posterior: `package.json`, `package-lock.json`, `CHANGELOG.md`, `aspec/backlog.md` y los
  documentos del seed.

## Residuales y pendientes

- ReDoS teórico con globs patológicos, medido: globs plausibles de hasta 3 ** y literales distintos
  (por ejemplo src/**/node_modules/**/dist/**/*.js) contra rutas de 80 segmentos cuestan 0,14 ms. El
  costo crece como O(N^k) con k igual a la cantidad de **: con 80 segmentos, 5 ** con literales
  repetidos ≈281 ms; 6 ** con 40 segmentos ≈58 ms; 7 ** ≈288 ms; 8 ** supera 2 s (timeout). El
  blowup ocurre tanto con ** adyacentes como separados por literales repetidos.
- El input es .ancletorc local y autor-controlado (no hay frontera de confianza externa); matchesGlob
  reevalúa ~14,7k por corrida (1.360 paths × 11 globs).
- Decisión de cierre: se acepta como limitación conocida y acotada en vez de reescribir el matcher a
  un DP por segmentos, porque (a) un matcher DP cambiaría el mecanismo que la spec canónica pinea
  (aspec/specs/cli-diagnostics/spec.md:995-1001: traducción a regex) y exigiría delta MODIFIED +
  release minor, (b) la semántica observable no cambia y (c) el riesgo es auto-infligido por una
  config local con ≥5 ** y literales repetidos.
- Follow-up opcional: DP por segmentos, con delta MODIFIED y release minor si se decide.

## Decisiones

- **memory_key:** discovery-exclude-glob-match-single-matcher
  **Elección:** corregir el `matchesGlob` existente con una traducción por segmentos y anclaje conservado, de modo que `sources` y el `--ignore` del pack compartan la misma sintaxis de patrones.
  **Descartado:** dejar el matcher como está y filtrar reader-side en `checkDiscovery`; introducir una segunda implementación u oráculo de globs; agregar una dependencia de globbing; introducir configuración nueva.
  **Justificación:** una sola implementación cubre el único punto de exclusión de la CLI sin dejar `sources` divergente del pack, y la corrección no requiere dependencias nuevas ni tocar `walk`, `outputDir` ni `DEFAULT_IGNORES`.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:discovery-exclude-glob-match

**Estado:** aprobado

- **memory_key:** discovery-exclude-glob-match-minor-with-delta
  **Elección:** clasificar el change como funcional y publicar MINOR 0.30.0 con un delta ADDED en `cli-diagnostics`.
  **Descartado:** PATCH 0.29.1 sin delta spec, tratándolo como bugfix interno.
  **Justificación:** cambia el conjunto observable de `sources` y de `changedAreas` que reporta `discovery --check`, y ningún requirement existente promete la semántica de `discovery.exclude`; el ownership correcto es un requirement nuevo en forma ADDED, que evita reescribir el requirement de frescura y sus 34 escenarios.
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:discovery-exclude-glob-match

**Estado:** aprobado

- **memory_key:** discovery-exclude-glob-match-no-rule-version-bump
  **Elección:** mantener `schemaVersion: 2`, el writer y `ruleVersion: 2` intactos, sin migración; el estado previo queda `STALE` una vez hasta la próxima regeneración (`minor` si el área conserva al menos una ruta incluida, `material` por `area raiz eliminada` si pierde todas).
  **Descartado:** bumpear `ruleVersion`, migrar o reescribir el estado persistido, o filtrar rutas al persistirlas.
  **Justificación:** la forma del estado y los hashes no cambian; sólo cambia el predicado de lectura, así que los bytes viejos siguen siendo legibles y el único efecto transitorio es una baja `minor` cuando el área conserva al menos una ruta incluida; si el área pierde todas, `computeImpact` reporta `area raiz eliminada` → `material` (ocurre una vez, hasta la primera regeneración).
  **Refs:**
- spec:cli-diagnostics#Clasificación determinista de frescura del seed en discovery --check
- change:discovery-exclude-glob-match

**Estado:** aprobado
