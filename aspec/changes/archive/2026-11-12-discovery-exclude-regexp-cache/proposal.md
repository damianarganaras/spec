# Proposal: Caché del regex compilado en el matcher de `discovery.exclude`

## Problem

El matcher de `discovery.exclude` compila un `RegExp` nuevo en cada evaluación: `matchesGlob`
(`src/cli/index.js:2187-2212`) tokeniza el glob y llama `new RegExp(...)` por cada ruta evaluada.
Con 11 globs y 879 rutas reales son 9.669 compilaciones por corrida, que cuestan 15,04 ms frente a
1,63 ms con el regex ya compilado (9,2×). El costo crece con globs × rutas y se repite en cada
`walk`, aunque el conjunto de globs sea fijo para toda la corrida.

## Proposed change

Cachear el `RegExp` compilado por glob exacto y reusar el matcher vigente. Se extrae `escapeRe` +
`matchesGlob` a un módulo puro `src/core/discovery-glob.js`, sin imports (sin ciclo), que define y
exporta una sola implementación de cada uno:

- `escapeRe(s)`: escapa los metacaracteres de regex.
- `compileGlob(glob)`: devuelve el `RegExp` compilado y lo guarda en un `Map` módulo-level con clave
  igual al string exacto del glob.
- `matchesGlob(rel, glob)`: evalúa `compileGlob(glob).test(rel)`.

La tokenización (`**/` → `(?:.*/)?`, `/**` → `(?:/.*)?`, `**` → `.*`, `*` → `[^/]*`,
`?` → `[^/]`, literales escapados) y el anclaje (`^…$` si el glob contiene `**`, `^…(/|$)` si no)
se copian **verbatim**. Sin flags `g`/`y`; la caché no crece más allá de los globs distintos vistos.

`src/cli/index.js` importa `escapeRe` y `matchesGlob` desde `./core/discovery-glob.js` y elimina
sus definiciones locales (`escapeRe` en `:2181`, `matchesGlob` en `:2187-2212`). Los tres usos de
`escapeRe` en los helpers de bloques LOCKED (`:1517`, `:1533`, `:1571`) se conservan y pasan a
resolver al import: queda una sola implementación.

Este change es de **conformidad**: no cambia el mecanismo que pinea la canónica
`spec:cli-diagnostics#Semántica por segmentos de los patrones de exclusión del discovery`, por eso
no produce delta en `aspec/specs/`.

## Scope

In scope:

- Nuevo módulo `src/core/discovery-glob.js` con `compileGlob`/`matchesGlob` y caché `Map`.
- Conexión de `src/cli/index.js` por import y baja de la definición local de `matchesGlob`.
- Test de equivalencia por resultados contra la matriz canónica, los pares de los pins existentes
  y los límites del matcher, más un pin de identidad de la caché.

Out of scope:

- Cambiar la semántica de los patrones, su tokenización o su anclaje.
- Mitigar el ReDoS de globs con `**` repetidos (≥5): se **retiene** como limitación aceptada porque
  el input es `.ancletorc` local. Queda documentado, fuera de alcance.
- `DEFAULT_IGNORES`, el salteo de `outputDir`, `isEphemeralSource`, el writer/estado
  (`schemaVersion: 2`/`ruleVersion: 2`) y el consumidor de `buildRepomixArgs` → Repomix
  `--ignore`, que sigue recibiendo los strings crudos.
- `package.json` (el bump es de release) y `.ancletorc`.

## Risks

- Deriva semántica al mover el código: mitigación copiando tokenización y anclaje verbatim y
  validando por **resultados** con la matriz canónica y los 9 pins de `test/cli.test.js:7820-7969`.
- `escapeRe` movido por error y helpers LOCKED rotos: mitigación verificando que sus tres
  consumidores (`:1517`, `:1533`, `:1571`) resuelvan al import y que la suite existente los cubra.
- Caché con estado compartido entre corridas en proceso (tests): mitigación cachear sólo por string
  de glob, sin flags stateful (`g`/`y`), y pinear `compileGlob(g) === compileGlob(g)`.
- ReDoS retenido: el límite persiste y no se corrige en este change; se acepta y se registra.

## Decisiones

- **memory_key:** discovery-exclude-matcher-cache-over-dp
  **Elección:** cachear el `RegExp` compilado por glob exacto en un `Map` de módulo y reusar el matcher actual (`compileGlob`/`matchesGlob`), conservando la tokenización y el anclaje verbatim.
  **Descartado:** reemplazar el matcher por un DP por segmentos, o por un NFA por tokens, para evitar compilar regex por llamada.
  **Justificación:** la caché lleva 9.669 evaluaciones de 15,04 ms a 1,63 ms (9,2×) y conserva el mecanismo que la canónica pinea; el DP por segmentos no es equivalente (9 divergencias en `**` embebido `a**b`/`***`/`x**` y 1 en `.` vs `[^/]` frente a newline) y el NFA equivalente es más complejo sin ser más rápido que la caché.
  **Refs:**
- spec:cli-diagnostics#Semántica por segmentos de los patrones de exclusión del discovery
- change:discovery-exclude-regexp-cache
  **Estado:** aprobado
