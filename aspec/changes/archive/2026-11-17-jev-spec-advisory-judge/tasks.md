# Tasks: Juez externo advisory opcional

> Artefactos: `proposal.md`, `design.md`, `specs/cli-diagnostics/spec.md`. Validaciones declaradas en
> `PRODUCT.md` → `## Project Commands`: lint `npm run lint`; tests `npm test` (o rutas explícitas);
> format y typecheck `not-configured`.

## Fase 0 — Verificación de artefactos

1. Correr `node src/cli/index.js specs check --change jev-spec-advisory-judge` y confirmar 0 fallos con
   keywords canónicos en el delta.
2. Correr `node src/cli/index.js specs merge --change jev-spec-advisory-judge --dry-run --json` y
   confirmar que resuelve `cli-diagnostics` sin `canonical spec not found` y con una sola operación
   `ADDED` para `Juez externo advisory opcional`. Al archivar, actualizar además la prosa de
   `## Purpose` de `aspec/specs/cli-diagnostics/spec.md` para nombrar el juez: `specs merge` sólo
   aplica requirements y no reescribe el Purpose.

## Fase 1 — Núcleo (`src/core/judge.js`)

3. Crear `src/core/judge.js` con la lectura tolerante de `.ancletorc`: `judge.enabled` sólo es true con
   el booleano `true`; `judge.timeoutMs` numérico y > 0 o default 120000; archivo ausente, BOM o JSON
   inválido → configuración ausente. Sin escrituras y sin red.
4. Implementar en `src/core/judge.js` la resolución del binario: `where`/`which` por `spawnSync` y, si
   falla, `npx -y jev-spec@0.4.1`; exponer el origen `path`/`npx`/`null` y la versión pinneada `"0.4.1"`
   del adaptador (no la versión real del binario, que v1 no inspecciona).
5. Implementar el spawn de la verificación con `check` como único argumento, `cwd` del proyecto y
   `timeoutMs`; capturar `stdout`, `stderr`, `status`, `error` y duración; mapear exit `0`→`pass`,
   `1`→`fail`, `2`→`broken`, otro o error/timeout→`broken`.
6. Implementar la sonda de setup para `--require`: ejecución del binario con `--version`, sin
   credenciales y sin enviar código del repo; sonda rota → `unavailable` con `reason` `probe-failed` y
   sin corrida live.
7. Implementar el modo `--dry-run`: devolver el comando resuelto sin spawnear el binario ni ejecutar la
   configuración del usuario; con `--require`, exit 2.
8. Implementar el envelope `--json` con `state`, `reason`, `exitCode`, `enabled`, `tool`
   (`name`/`source`/`version`), `durationMs`, `report` (stdout verbatim o null), `stderr` y `required`;
   `command` sólo en `--dry-run`; sin `schemaVersion`, en todos los caminos incluido exit 2. No leer ni
   imprimir `TYPESAFE_AI_API_KEY`.

## Fase 2 — CLI (`src/cli/index.js`)

9. Agregar `judgeCommand(argv)` en `src/cli/index.js`: parsear sólo `--json`, `--require`, `--dry-run` y
   `--timeout <ms>` (entero > 0); un flag desconocido o un timeout inválido es error de uso con exit 1;
   delegar en `src/core/judge.js` e imprimir el camino humano con el aviso de egreso de código.
10. Agregar `case 'judge'` al dispatch, la línea de uso en `HELP` y la entrada `judge: JUDGE_USAGE` de
    `SUBCOMMAND_HELP`, para que `ancleto judge --help` imprima el uso por el guard central y no ejecute
    el subcomando.
11. Verificar por inspección que ningún camino de `judgeCommand` imprime la credencial ni el contenido
    de `.ancletorc`, y que `check`, `specs merge` y el archive no importan ni invocan `judge`.

## Fase 3 — Superficie de skills

12. Agregar en `skills/ancleto-verify/SKILL.md` un paso **opcional**: si `judge.enabled`, correr
    `ancleto judge --json`, usar las probabilidades como evidencia y nunca como veredicto, y declarar
    `skipped` cuando corresponda. No presentarlo como gate ni como prueba de conformidad.
13. Verificar que `test/content-guards.test.js` sigue en verde tras tocar `skills/ancleto-verify`: el
    guard exige `ancleto specs check --change <name> --json`, `Non-canonical spec:` y `WARNING with the
    same recommendation`, y el frontmatter debe conservar `No external binaries required` (el paso es
    opcional, no una dependencia).
14. Mencionar el paso opcional en `skills/ancleto-workflow/SKILL.md` sin nombrar `design.md` (guard
    `NO_DESIGN_MD_SURFACES` de `test/content-guards.test.js:1885-1889`).
15. Regenerar `.opencode/**` sólo con `node src/cli/index.js upgrade` y confirmar que no hubo edición
    manual de ese mirror.

## Fase 4 — Tests offline

16. Crear `test/fixtures/jev-spec-mock.mjs`: modos deterministas por entorno
    (`pass`, `fail`, `broken`, `version-ok`, `version-broken`, `no-version`), marker de spawn opcional,
    stdout/stderr y exit coherentes; sin red.
17. Crear `test/judge.test.js` con PATH señuelo (patrón `test/cli.test.js:43-65`) y un `npx` que falla:
    cubrir los escenarios (a)–(h) del delta, `--json` parseable en todos los caminos, cero escrituras
    y cero spawn en `skipped`/`unavailable`/`--dry-run`.
18. Agregar en `test/affected-tests.json` el coupling que declara `test/judge.test.js` para
    `src/cli/**` y `src/core/judge.js`, y para `test/fixtures/jev-spec-mock.mjs`; justificar que la
    suite spawnea la CLI y el fixture sin importarlos.
19. Verificar `test/test-selection.test.js`: el test nuevo no abre `manifest-gap` (`:528-538`) y entra
    al plan con las semillas declaradas.
20. Correr el lint (`npm run lint`) sobre `src/core/judge.js`, `src/cli/index.js`, `test/judge.test.js`
    y `test/fixtures/jev-spec-mock.mjs`; registrar format y typecheck como `not-configured`.

## Fase 5 — Docs y release

21. Documentar en `README.md` (sección corta), `docs/guia-configuracion.md` (bloque `judge`) y
    `docs/jev-advisory-judge.md`: opt-in, default off, credencial sólo por entorno, egreso de código,
    límites del tool, rollback y estado no medido del criterio de valor.
22. Actualizar `CHANGELOG.md` con el release **MINOR 0.40.0** (nuevo subcomando) y el bump de
    `package.json`; confirmar que no se agregaron `dependencies`.
23. Correr `npm test` (suite declarada) o, para validación acotada, `node --test test/judge.test.js
    test/content-guards.test.js test/test-selection.test.js`.

## Fase 6 — Valor (bloqueada por cuenta)

24. Cuando exista `TYPESAFE_AI_API_KEY` y cuenta, ejecutar el criterio de `design.md` §10 (5 correctos,
    5 saboteados, 2 refactors, 1 keyword-fail) y registrar AUC, costo y latencia. Sin cuenta, dejar
    constancia de "no medible" y no habilitar `--require` en el CI de este repo.
