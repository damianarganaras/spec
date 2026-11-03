# Tasks: model-catalog-fallback-resolution

> Implementación y tests quedan en fases separadas; cada fase es verificable por sí sola.
> Los comandos usan el runner declarado: `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run <script>`.

## Fase 1 — Snapshot y loader/validador de catálogo (implementación)

- [x] Crear `src/core/model-catalog.json` con la forma `{ generated_at, method, providers }`, donde
      `providers` mapea proveedor → lista de IDs completos (`opencode-go/...`, `commandcode/...`,
      `opencode/...`) tomados del catálogo verificado el 2026-11-03 con
      `opencode models <provider> --verbose`. `method` SHALL declarar ese comando y `generated_at`
      SHALL ser la fecha de verificación. Listo cuando el JSON parsea y no tiene IDs duplicados.
- [x] Incluir en el snapshot, como mínimo, los IDs que ya usan `TIERS`, `agents/*.md` y
      `profiles/*/agents/*.md`: `opencode-go/qwen3.7-plus`, `opencode-go/qwen3.8-max`,
      `opencode-go/minimax-m3`, `opencode-go/deepseek-v4.1-flash`,
      `commandcode/deepseek/deepseek-v4.1-flash`, `opencode/big-pickle` y
      `opencode/deepseek-v4.1-flash-free`. No incluir IDs inexistentes (`opencode-go/qwen3.6-plus`,
      `opencode/muse-spark-1.3-contributor-free`).
- [x] En `src/core/tier-models.js`, implementar el loader y el validador del catálogo con E/S sólo en
      el loader: un loader que lee el snapshot commiteado sin red, un predicado de disponibilidad y un
      validador de IDs que reporte los IDs ausentes. El loader SHALL aceptar un catálogo o una ruta
      explícita y, si no se proveen, usar `ANCLETO_MODEL_CATALOG` cuando esté definida y el snapshot
      commiteado en caso contrario. La variable es un seam de test/manual, no una configuración de
      producto. La resolución SHALL ser una función pura que recibe el catálogo como argumento; NO
      SHALL leer archivos ni consultar procesos.
      > Nota de implementación: el loader/validador quedó en `src/core/tier-models.js` (no en un
      > `src/core/model-catalog.js` separado) porque la regla `tiers-owned-by-tier-models` exige un
      > único dueño de `TIERS` y de las constantes nuevas allí; se evitó un refactor posterior con la
      > validación ya en verde (843 tests). Sólo el snapshot es un JSON aparte.
- [x] Crear `scripts/refresh-model-catalog.mjs`: script manual que recorre los proveedores del
      snapshot, corre `opencode models <provider> --verbose`, normaliza los IDs y reescribe el JSON
      con `generated_at` igual a la fecha del refresco, conservando `source.method` y la lista de
      proveedores del snapshot vigente. Documentar en el encabezado del script que no corre en CI
      y que su salida se revisa antes de commitear. Listo cuando el script falla de forma explícita
      si `opencode` no está disponible, sin escribir un snapshot vacío.

## Fase 2 — Tiers, cadenas y `gratis` (implementación)

- [x] En `src/core/tier-models.js`, cambiar `TIERS.normal.reviewer` a `opencode-go/qwen3.8-max`.
      No tocar los otros nueve valores de `normal`.
- [x] En `src/core/tier-models.js`, agregar y exportar `TIER_CHAINS` con una entrada por agente para
      `minimo`, en este orden: `commandcode/deepseek/deepseek-v4.1-flash`,
      `opencode-go/deepseek-v4.1-flash`, `opencode/deepseek-v4.1-flash-free`. `TIERS.minimo` SHALL
      conservar la forma actual (agente→string) y cada valor SHALL ser la cabeza de su cadena.
- [x] En `src/core/tier-models.js`, implementar el resolver puro de tier: dado el tier, `TIERS`, las
      cadenas y un catálogo inyectable, devolver el mapa agente→modelo resuelto. Para `minimo` elige
      el primer candidato disponible por agente; si ningún candidato de un agente está disponible,
      lanza un error explícito que nombra el agente y la cadena completa. Para los demás tiers delega
      en el comportamiento actual.
- [x] En `src/core/tier-models.js`, eliminar `MUSE_SPARK_MODEL`, `detectMuseSpark`, la rama
      `ANCLETO_MUSE_SPARK` y la doble aceptación de gratis. `gratisModel(persisted)` SHALL devolver
      `GRATIS_FALLBACK_MODEL` cuando `persisted` no sea un modelo gratis conocido; `gratis` resuelve
      los diez agentes a `opencode/big-pickle`. `tierModels` conserva su firma para `gratis`.
- [x] Verificar que `src/core/tier-models.js` no importa `node:child_process` ni ejecuta procesos
      externos tras eliminar la detección.

## Fase 3 — CLI: resolución, oráculo y normalización (implementación)

- [x] En `src/cli/index.js`, importar el loader del catálogo y el resolver de tier. En `install`
      (`src/cli/index.js:1768`), `init` (`:1966`) e `import` (`:4082`), reemplazar
      `tierModels(tier, TIERS, gratisModelChoice)` por el mapa resuelto contra el snapshot. Si el
      resolver lanza por ausencia total de candidatos, abortar con un error explícito y exit code no
      cero, sin escribir agentes con un ID inventado.
- [x] En `install`/`update`/`init`, normalizar `gratisModel` desconocido: si `.ancletorc.gratisModel`
      existe y no es un modelo gratis conocido, ignorarlo y persistir `opencode/big-pickle` como
      `gratisModel`. Si el valor es conocido, conservarlo. No agregar la clave cuando no existía.
- [x] En `checkAgentsFrontmatter` (`src/cli/index.js:2903-2977`), construir el conjunto de aceptación
      de `minimo` con la adaptación para **todos** los candidatos estáticos de la cadena de cada
      agente; el primero del conjunto SHALL ser el resuelto-ahora. Un instalado igual a cualquiera de
      ellos NO SHALL reportarse como divergencia.
- [x] En `checkAgentsFrontmatter`, calcular el aviso de tier contando un agente cuando el mirror
      difiere del estado resuelto-ahora **o** el estado resuelto-ahora difiere de su fuente esperada.
      Mantener un único aviso por directorio con el formato vigente y `<n>` como cantidad de agentes
      en esa condición.
- [x] Si en el momento del check ningún candidato de la cadena está disponible, no abortar: aceptar
      los candidatos estáticos como estados válidos y emitir un aviso no bloqueante que indique que
      no hay candidato resoluble. El exit code NO SHALL cambiar por este aviso.
- [x] Para `gratis`, reemplazar la doble aceptación por el único modelo gratis conocido y conservar
      el aviso cuando el mirror o el resuelto difieran de la fuente. Un `.ancletorc.gratisModel`
      desconocido NO SHALL producir divergencia ni error.
- [x] Mantener el exit code de `check` sin cambios por divergencias de frontmatter, aviso de tier o
      aviso de catálogo no resoluble.
- [x] En `importCmd` (`src/cli/index.js:4151-4158`), escribir `.opencode/.ancleto-tier` con el tier
      aplicado tras `applyTier`, con paridad con `init`. Listo cuando un import sobre un proyecto vacío
      y sobre uno con otro tier dejan el archivo con el tier nuevo y el `check` posterior no diverge.
- [x] En `importCmd`, leer el bundle y resolver el catálogo antes de la primera escritura: si el
      resolver falla, abortar con exit 1 sin escribir `.ancletorc`, templates ni agents.
- [x] En `importCmd`, persistir `gratisModel` normalizado sólo si el bundle declaraba la clave; no
      agregar una clave ausente y no fallar por un valor desconocido.
- [x] En `install`/`init`/`import`, resolver y abortar por catálogo sólo cuando el host escribe
      `model:` (`opencode`); no resolver ni abortar para hosts que dropean el campo o emiten
      `model: inherit`.

## Fase 4 — Perfil y documentación (implementación)

- [x] En `profiles/test/agents/reviewer.md:4`, cambiar `model:` a `opencode-go/qwen3.8-max`.
      Confirmar que `profiles/test/agents/tester.md:4` sigue en
      `opencode-go/deepseek-v4.1-flash` y no se modifica.
- [x] En `README.md:272-276`, actualizar la descripción del tier `gratis`: eliminar la preferencia
      por Muse Spark y la mención a `ANCLETO_MUSE_SPARK`; dejar `opencode/big-pickle` como único
      modelo gratis.
- [x] En `README.md:516-543`, actualizar la tabla: `reviewer` de `normal` pasa a
      `opencode-go/qwen3.8-max`; documentar que `minimo` resuelve por cadena contra el catálogo y que
      el snapshot se refresca con `scripts/refresh-model-catalog.mjs`. Eliminar la nota de Muse Spark
      y la variable de entorno.
- [x] Confirmar que ningún otro pasaje del README promete Muse Spark ni la detección automática.

## Fase 5 — Tests de catálogo y resolver (tests)

- [x] Crear `test/model-catalog.test.js` con el guard de catálogo: para cada ID de `TIERS` (todos los
      tiers y agentes), de `agents/*.md` y de `profiles/*/agents/*.md`, afirmar que figura en
      `src/core/model-catalog.json`. El test NO SHALL usar red ni `opencode models`.
- [x] En `test/model-catalog.test.js`, agregar el escenario negativo: con un catálogo de prueba al
      que se le quita un ID real (p. ej. `opencode-go/qwen3.8-max`), la validación reporta ese ID como
      ausente. No mutar el snapshot commiteado.
- [x] En `test/model-catalog.test.js`, afirmar el resolver puro: con la cabeza disponible elige la
      cabeza; sin la cabeza elige el segundo; sin cabeza ni segundo elige el tercero; sin ningún
      candidato lanza un error que nombra el agente y la cadena; con un catálogo inyectable distinto
      no lee archivos ni procesos.
- [x] Afirmar que el resolver no ejecuta procesos externos: el módulo no importa
      `node:child_process` y el test no invoca `opencode`.

## Fase 6 — Tests del oráculo, `gratis` y guards existentes (tests)

- [x] Actualizar `test/agent-model-coherence.test.js:67-76` y `:126-132`: `TIERS.minimo[n]` sigue
      siendo igual al `model:` canónico y además igual a la cabeza de `TIER_CHAINS.minimo[n]`; la
      cadena cubre el mismo conjunto de agentes. No codificar IDs de proveedor en el guard.
- [x] Actualizar `test/tier-models.test.js:56-82`: eliminar las aserciones de `MUSE_SPARK_MODEL`,
      `detectMuseSpark` y `envGratisModel` y sus imports; afirmar que `gratisModel` devuelve
      `opencode/big-pickle` para un valor desconocido o ausente y que `isKnownGratisModel` sólo acepta
      el modelo gratis vigente.
- [x] En `test/cli.test.js`, actualizar las aserciones de Muse Spark (`:1387-1393`, `:3208-3269`,
      `:3314-3333`) al único modelo gratis: `install`/`init --tier gratis` escriben
      `opencode/big-pickle`, `.ancletorc.gratisModel` desconocido se normaliza y no hay salida de
      detección automática.
- [x] En `test/cli.test.js`, agregar la regresión del oráculo en la dirección A: instalar `minimo`
      con la cabeza disponible, ejecutar el check con `ANCLETO_MODEL_CATALOG` apuntando a un snapshot
      temporal sin la cabeza y afirmar que NO hay `frontmatter diverge`, que SÍ hay aviso de tier y
      que el exit code no cambia.
- [x] En `test/cli.test.js`, agregar la regresión del oráculo en la dirección B: instalar `minimo`
      con `ANCLETO_MODEL_CATALOG` apuntando a un snapshot temporal sin la cabeza (resuelve el segundo
      candidato), ejecutar el check con la cabeza restaurada y afirmar que NO hay `frontmatter
      diverge`, que SÍ hay aviso de tier y que el exit code no cambia.
- [x] En `test/cli.test.js`, agregar el caso sin candidato disponible en el check usando
      `ANCLETO_MODEL_CATALOG` con un snapshot sin ningún candidato de la cadena: no hay divergencia,
      hay aviso no bloqueante de catálogo no resoluble y exit code sin cambios.
- [x] En `test/cli.test.js`, cubrir el import con tier: escritura de `.opencode/.ancleto-tier`, check
      sin divergencia, normalización condicional de `gratisModel` y aborto sin estado parcial.
- [x] En `test/cli.test.js`, cubrir el host que no escribe `model:`: `install`/`init --agent claude` y
      `--agent antigravity` con un catálogo sin candidatos no resuelven, no abortan y no calculan
      estados de tier en `check`.
- [x] En `test/cli.test.js`, agregar el caso de resolución durante `install` con la cabeza ausente:
      los diez agentes escriben el segundo candidato; y con cabeza y segundo ausentes: escriben el
      tercero. Usar `ANCLETO_MODEL_CATALOG` con snapshots temporales. Agregar el caso sin ningún
      candidato: error explícito y ningún agent escrito.
- [x] Actualizar `test/adapters-frontmatter.test.js:36` sólo si el cambio de reviewer o la eliminación
      de Muse Spark afecta la muestra; el adaptador de frontmatter sigue siendo model-agnostic y no
      SHALL incorporar lógica de catálogo.
- [x] Ejecutar los tests acotados con rutas explícitas:
      `node --test test/model-catalog.test.js test/tier-models.test.js test/agent-model-coherence.test.js test/adapters-frontmatter.test.js test/cli.test.js`.

## Fase 7 — Validación declarada

- [x] Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js run lint`.
- [x] Ejecutar `node C:/nvm4w/nodejs/node_modules/npm/bin/npm-cli.js test`; para validación acotada,
      pasar rutas explícitas. Nunca `node --test` sin acotar.
- [x] Ejecutar `test/content-guards.test.js` como parte de la suite y confirmar que la edición del
      README no rompió anclajes documentales.
- [x] Confirmar que `agents/*.md`, `.opencode/**`, `opencode.json`, `~/.config/opencode/**` y
      `docs/BACKLOG_REINGENIERIA_MEMORIA_FIRST.md` no fueron modificados.
- [x] Registrar Format como `not-configured` y Typecheck como no aplicable, según `PRODUCT.md` →
      `## Project Commands`.
- [x] Confirmar que `src/core/model-catalog.json` no contiene IDs inexistentes y que
      `scripts/refresh-model-catalog.mjs` no se ejecutó como parte de la suite.
