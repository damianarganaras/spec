# Design: `ancleto stats failures`

## Contexto

El change agrega un subcomando de solo lectura al CLI existente. Todo el código nuevo vive en
`src/cli/index.js`, junto a `statsCommand` (`:2741`), y reutiliza `opencodeDbPath()` (`:2650`),
`normPath()` (`:2672`), `buildSessionTree()` (`:2683`) y `fmtDate()` (`:2666`). No se agregan
dependencias ni se toca el flujo de tokens.

Punto de entrada: en la primera línea de `statsCommand`, si `args[0] === 'failures'`, delegar en
`statsFailuresCommand(args.slice(1))` y retornar. `statsCommand` no cambia en ningún otro punto.
Se agrega una línea al `HELP` (`:67`):

```
ancleto stats failures [--all] [--limit N] [--since YYYY-MM-DD] [--session <id>] [--class <c,...>] [--tool <t,...>] [--json]
```

## Superficie y parsing

Parser propio, secuencial, sin dependencias. Reglas:

| Flag | Tipo | Default | Validación |
|---|---|---|---|
| `--all` | booleano | ausente | — |
| `--since` | `YYYY-MM-DD` | `null` | regex + round-trip: construir `Date.UTC(y, m-1, d)` y comparar año/mes/día normalizados |
| `--limit` | entero | `10` | entero ≥ 1 |
| `--session` | id | `null` | debe existir en `session` |
| `--class` | lista | `null` (todas) | subconjunto de `env,check,tool,unknown` |
| `--tool` | lista | `null` (todas) | string no vacío |
| `--json` | booleano | `false` | — |

- `--class` y `--tool` aceptan valores separados por coma, sin repetir flag.
- Bandera desconocida, valor faltante o valor inválido: mensaje de uso a `stderr` + `process.exit(1)`.
- `--session` tiene precedencia sobre `--all` (el alcance explícito gana); no es un error combinarlos.
- Códigos de salida: `0` en éxito (incluido "sin fallos"), `1` en uso inválido o base inaccesible.
- `--limit` recorta la tabla de `env` (modo texto por defecto), la tabla de la clase pedida con
  `--class`, y el array `groups` en `--json`. Los conteos agregados de las otras clases no se
  recortan (son totales).

## Pipeline

1. **Resolver alcance** contra `session` (1.564 filas en el baseline): proyecto / `--all` /
   `--session` + `--since`.
2. **Una consulta SQL** que clasifica y agrega al grano mínimo.
3. **Derivar el esqueleto** de cada bucket: wrapper, prefijo de entorno, tokens estructurales y
   enmascarado de cada token.
4. **Reagrupar en JS** por la clave final (proyecto + herramienta + clase + wrapped + esqueleto) y
   calcular sesiones distintas, máximo por sesión y ventana temporal.
5. **Ordenar, recortar y renderizar** texto o JSON.

## Alcance

Se lee `SELECT id, parent_id, directory FROM session`. No se lee `title`: ningún texto de sesión se
usa como clave ni se expone. Con `buildSessionTree` se resuelve el subárbol de `--session` y se
valida su existencia.

Alcance por proyecto (default): se reutiliza la semántica de `statsCommand` con `normPath`
(minúsculas, `\` → `/`, sin barra final):

```
dn = normPath(session.directory); cwdN = normPath(process.cwd())
incluida = dn === cwdN || dn.startsWith(cwdN + '/') || cwdN.startsWith(dn + '/')
```

Es decir: igualdad, descendiente **o** ancestro (misma regla que `stats`, para no divergir cuando
el cwd está dentro del worktree de la sesión). Sesiones con `directory` nulo quedan fuera del
default y entran con `--all`.

Optimización de la consulta: el alcance por proyecto se expresa como `s.directory IN (...)` con
los **valores literales y distintos** de los directorios incluidos (decenas, no sesiones), así la
lista de parámetros no crece con la cantidad de sesiones. `--session` usa `p.session_id IN (...)`
con los ids del subárbol (acotado por subagentes). Si en el futuro una lista superara el límite de
parámetros de SQLite (32.766), se particiona en tandas y se re-agrega en JS; hoy no aplica.

`--since` filtra `p.time_created >= since` (fecha del fallo, no de creación de la sesión), porque
`first_seen`/`last_seen` también se calculan sobre `part.time_created`.

## Consulta SQL

Universo: `data.type='tool'` ∧ (`state.status='error'` ∨ `state.metadata.exit≠0`). La clasificación
se resuelve dentro de la consulta; `output` y `state.error` se usan solo en el `CASE` de las filas
que ya pasaron el filtro de error y **nunca se proyectan**.

```sql
WITH fallos AS (
  SELECT
    s.directory                    AS project_dir,
    s.id                           AS session_id,
    p.time_created                 AS at,
    json_extract(p.data,'$.tool')  AS tool,
    CASE
      WHEN coalesce(json_extract(p.data,'$.tool'),'') NOT IN ('bash','shell','powershell','pwsh','cmd')
        THEN 'tool'
      WHEN CAST(json_extract(p.data,'$.state.metadata.exit') AS INTEGER) IN (127,9009)
        THEN 'env'
      WHEN lower(coalesce(json_extract(p.data,'$.state.output'),'') || char(10) ||
                 coalesce(json_extract(p.data,'$.state.error'),'')) LIKE '%is not recognized%'
        OR ... LIKE '%no se reconoce como nombre%'
        OR ... LIKE '%command not found%'
        OR ... LIKE '%missing script%'
        OR ... LIKE '%cannot find module%'
        OR ... LIKE '%parsererror%'
        OR ... LIKE '%unexpected token%'
        OR ... LIKE '%reservado para uso futuro%'
        OR ... LIKE '%enoent%'
        THEN 'env'
      WHEN json_extract(p.data,'$.state.metadata.exit') IS NOT NULL
       AND CAST(json_extract(p.data,'$.state.metadata.exit') AS INTEGER) <> 0
        THEN 'check'
      ELSE 'unknown'
    END                            AS class,
    CASE WHEN json_extract(p.data,'$.tool') IN ('bash','shell','powershell','pwsh','cmd')
         THEN json_extract(p.data,'$.state.input.command') END AS cmd
  FROM part p
  JOIN session s ON s.id = p.session_id
  WHERE json_extract(p.data,'$.type') = 'tool'
    AND ( json_extract(p.data,'$.state.status') = 'error'
       OR ( json_extract(p.data,'$.state.metadata.exit') IS NOT NULL
        AND json_extract(p.data,'$.state.metadata.exit') <> 0 ) )
    AND (<predicado de proyecto: 1=1 | s.directory IN (...)>)
    AND (<predicado de sesión:   1=1 | p.session_id IN (...)>)
    AND (<predicado de fecha:    1=1 | p.time_created >= ?>)
)
SELECT project_dir, session_id, tool, class, cmd,
       COUNT(*) AS parts,
       MIN(at)   AS first_seen,
       MAX(at)   AS last_seen
FROM fallos
WHERE (<filtro de clase: 1=1 | class IN (...)>)
  AND (<filtro de tool:  1=1 | tool  IN (...)>)
GROUP BY project_dir, session_id, tool, class, cmd
```

Notas de implementación:

- En el `CASE`, `...` representa el mismo operando `lower(coalesce(output,'') || char(10) ||
  coalesce(error,''))`; cada `LIKE` es una rama `OR` del mismo `WHEN`.- `coalesce(tool,'')` evita que un `tool` nulo caiga en las ramas de shell; un tool desconocido se
  clasifica `tool` (no es shell) y nunca aporta comando.
- `CAST(exit AS INTEGER)` tolera exit numérico o string; un exit no numérico castea a `0` y no
  marca `env` por código.
- Los patrones de entorno son ASCII y el mensaje de PowerShell se detecta con
  `reservado para uso futuro` para no depender de la tilde de `está`.
- `cmd` es `NULL` para toda herramienta que no esté en el set de shell (`bash`, `shell`,
  `powershell`, `pwsh`, `cmd`): el `input` de `read`, `edit`,
  `grep`, `supabase_execute_sql`, `task` y `webfetch` no sale de SQLite.
- `GROUP BY` incluye `session_id` porque se proyecta; el directorio es funcionalmente dependiente de
  la sesión. `session.title` no se lee.
- Grano de salida: una fila por (proyecto, sesión, herramienta, clase, comando crudo). En el
  baseline son ~2.664 filas como máximo (una por fallo), no 65.263. El esqueleto final se deriva en
  JS porque el wrapper, el prefijo de entorno y el masking no son expresables en SQL sin duplicar la
  lógica.
- La consulta usa parámetros posicionales; solo cambia la cantidad de `?` de las listas `IN`, nunca
  se interpola texto de la base.

## Esqueleto de comando y clave de grupo

Para cada bucket de shell:

1. `stripWrapper(raw)` → `{ wrapped, inner }` con
   `/^\s*&\s+['"]([^'"]+)['"]\s+shrink\s+--\s+([\s\S]+)$/`.
2. Separar `inner` por whitespace. Mientras el primer token matchee `^[A-Za-z_][A-Za-z0-9_]*=`,
   descartarlo sin conservar el valor y marcar `envPrefix = true`.
3. `exe = basename(tokens.shift())` quitando solo las extensiones ejecutables conocidas
   (`/\.(?:exe|cmd|bat|ps1|sh)$/i`); las demás se conservan para no colapsar nombres como
   `python3.11`. El basename se calcula separando por `[\\/]`, así funciona en Windows y Linux.
4. Agregar hasta **3** tokens siguientes. Se corta en el primero que no cumpla
   `/^[A-Za-z][A-Za-z0-9:_.-]*$/` (tokens que empiezan con `-`, o que contienen `=`, `/`, `\`, `@`,
   `$`, comillas, `2>&1`, etc.).
5. `tokens.map(maskSensitive)` (segunda capa), unir con un espacio y anteponer `(env-prefix) ` si
   `envPrefix`. Si no quedan tokens, el comando es `(env-prefix)` o `null`.
6. `command = truncate(skeleton, 160)` con `…` si se recortó.

```
skeletonCommand('& "<caveman>" shrink -- npm run check:i18n') // wrapped:true,  'npm run check:i18n'
skeletonCommand('git push origin development 2>&1')           // wrapped:false, 'git push origin development'
skeletonCommand("curl -H 'Authorization: Bearer x' https://u:p@h") // 'curl'
skeletonCommand('GITHUB_TOKEN=abc npm test')                  // '(env-prefix) npm test'
```

Clave:

```
key = `${normPath(project_dir)}\0${tool}\0${class}\0${wrapped ? 'w' : 'r'}\0${command ?? ''}`
```

`wrapped` forma parte de la clave: un grupo nunca mezcla invocaciones envueltas y directas. El
esqueleto, no el comando completo, es lo que sostiene la garantía de privacidad: aunque el masking
fallara, ya no hay flags, valores, rutas ni argumentos posteriores al corte. El masking de cada
token es defensa adicional.

Herramientas que no son de shell: `command = null` y la clave queda
`proyecto + tool + class + r + ''`, es decir un solo grupo por proyecto/herramienta/clase. No se
expone ni se agrupa por `filePath`, `pattern`, `query` ni ningún otro campo de `input`.

Dirección del proyecto en la etiqueta: `maskPath(project_dir)` → separadores `/`, home a `<home>`,
unidad absoluta a `<path>`, truncado a 60. La clave usa el directorio **sin enmascarar** normalizado,
por lo que dos proyectos distintos con la misma etiqueta enmascarada siguen siendo grupos separados.

## Enmascarado

Función única `maskSensitive(text)`, aplicada a `tool`, al proyecto y a **cada token del esqueleto**:

1. `stripControl`: elimina ANSI (`\u001B\[[0-9;]*[A-Za-z]`) y caracteres de control C0/C1.
2. Home: reemplaza `homedir()` (con `\` o `/`, case-insensitive en Windows) por `<home>`.
3. Unidades absolutas de Windows (`[A-Za-z]:[\\/][^\s"']*`) por `<path>`.
4. Raíces POSIX: `/home/<seg>` y `/Users/<seg>` por `/home/<user>` y `/Users/<user>`.
5. Secretos:
   - `Authorization: Bearer <x>` → `Authorization: Bearer ***`.
   - prefijos `ghp_`, `github_pat_`, `sk-`, `xox[baprs]-` → `***`.
   - flags `--token`, `--password`, `--apikey`, `--secret` (con `=` o espacio) → `--flag=***`.
   - asignaciones cuyo nombre matchee `[A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD|PASSWD)[A-Z0-9_]*`
     seguido de `=` o `:` → `nombre=***`. Esto reemplaza el `\b` anterior, que dejaba pasar
     `*_TOKEN=`, `*_SECRET=` y `*_KEY=`. El patrón es deliberadamente amplio: un identificador como
     `monkey=` también se enmascara; es un falso positivo seguro.
6. `collapse` de whitespace y `trim`.
7. Truncado: comando 160, proyecto 60, tool 40. `session.title` ya no se lee, no se trunca y no se
   expone.

El orden importa: wrapper → prefijo de entorno → selección de tokens → masking por token → unión →
truncado. Enmascarar antes de agrupar hace que dos invocaciones con tokens distintos caigan en el
mismo grupo.

## Agregación en JS

Por clave se acumula:

- `parts += bucket.parts`.
- `perSession: Map<session_id, parts>` sumando los buckets que esqueletonizan al mismo comando.
- `firstSeen = min(...)`, `lastSeen = max(...)`.
- Sesiones = `perSession.size`; `maxPerSession = max(parts)`.
- `session_refs` = `[...perSession.keys()]` como `{ id }`, ordenadas por `parts` descendente y luego
  por id. No se incluye `title` ni ningún otro texto de sesión.

Orden final del array de grupos:

```
rank = { env: 0, check: 1, tool: 2, unknown: 3 }
rank[a.class] - rank[b.class] ||
b.parts - a.parts || b.sessions - a.sessions ||
a.tool.localeCompare(b.tool) || a.project.localeCompare(b.project) ||
(a.command ?? '').localeCompare(b.command ?? '') || Number(a.wrapped) - Number(b.wrapped) ||
a.projectKey.localeCompare(b.projectKey)
```

`projectKey` es `normPath(project_dir)` sin enmascarar: cierra el último empate de forma
determinística incluso cuando dos proyectos comparten etiqueta enmascarada.

Se ordena y se recorta con `--limit` **después** de calcular `universe` y `matched`, para que los
totales no dependan del recorte.

## Salida de texto

```
ancleto: stats failures (opencode) — <home>/proyectos/App — desde 2026-10-01
universo: 22 fallos · 9 grupos · 4 sesiones · env 4 · check 13 · tool 5 · unknown 0

env — 4 fallos · 2 grupos · 2 sesiones
  proyecto                          tool  fallos  ses  max  primera           ultima            esqueleto
  <home>/proyectos/App              bash       2    2    1  2026-10-21 23:43  2026-10-21 23:56  npx jest
  ...
  (2 de 2 grupos)

check: 13 fallos · 7 grupos · 3 sesiones
tool: 5 fallos · 1 grupo · 1 sesión
unknown: sin fallos
```

- La sección `env` respeta `--limit` y avisa cuando recorta.
- Con `--class <c>` se imprime solo la tabla de `<c>` (todas sus filas hasta `--limit`) y el
  encabezado de universo igual muestra la partición completa.
- `wrapped=true` se marca con el prefijo `(wrapped) ` en la columna de comando; el esqueleto con
  prefijo de entorno se muestra como `(env-prefix) <comando>`.
- Sin fallos: `ancleto: no hay fallos en el alcance consultado` + hint `--all` si el alcance es el
  proyecto. Salida `0`.
- Fechas de texto con `fmtDate` (local, `YYYY-MM-DD HH:mm`).

## Salida JSON

```json
{
  "ok": true,
  "scope": "directory",
  "project": "<home>/proyectos/App",
  "session": null,
  "since": "2026-10-01",
  "filters": { "class": null, "tool": null },
  "universe": {
    "parts": 22, "groups": 9, "sessions": 4,
    "by_class": {
      "env":     { "parts": 4,  "groups": 2, "sessions": 2 },
      "check":   { "parts": 13, "groups": 7, "sessions": 3 },
      "tool":    { "parts": 5,  "groups": 1, "sessions": 1 },
      "unknown": { "parts": 0,  "groups": 0, "sessions": 0 }
    }
  },
  "matched": { "parts": 4, "groups": 2 },
  "shown": 2,
  "groups": [
    {
      "project": "<home>/proyectos/App",
      "tool": "bash",
      "class": "env",
      "wrapped": false,
      "command": "npx jest",
      "parts": 2,
      "sessions": 2,
      "max_per_session": 1,
      "first_seen": "2026-10-21T23:43:00.000Z",
      "last_seen": "2026-10-21T23:56:00.000Z",
      "session_refs": [{ "id": "ses_..." }]
    }
  ]
}
```

- `universe` = alcance (proyecto/`--all`/`--session` + `--since`), antes de `--class`/`--tool`.
- `matched` = después de `--class`/`--tool`; `shown` = después de `--limit`.
- Fechas ISO 8601 UTC; en texto, local con `fmtDate`.
- `command` es `null` para herramientas que no son de shell.
- `scope`: `directory` | `all` | `session`; `project` es `null` con `--all`, `session` es el id
  pedido con `--session`.

## Campos que llegan a stdout/JSON

| Campo | Origen | Transformación | Por qué no puede traer secretos |
|---|---|---|---|
| `project` | `session.directory` | `maskPath` + `/` + ≤60 | home, usuario y unidades enmascarados |
| `project` (alcance) | `process.cwd()` | `maskPath` + `/` | ídem |
| `session_refs[].id` | `session.id` | tal cual, ≤64 | id opaco de opencode, no payload de tool |
| `tool` | `data.tool` | `stripControl` + `maskSensitive` + ≤40 | vocabulario de herramienta, no `input` |
| `class` | derivada en SQL | enum `env/check/tool/unknown` | constante |
| `wrapped` | regex del comando | booleano | no contiene texto |
| `command` | `state.input.command`, solo shell | wrapper + prefijo de entorno + esqueleto + masking por token + ≤160 | basename + ≤3 tokens estructurales; sin flags, valores, rutas ni secretos |
| `parts`, `sessions`, `max_per_session`, `shown` | `COUNT`/agregación | enteros | conteos |
| `first_seen`, `last_seen` | `part.time_created` | ISO / `fmtDate` | timestamp |
| `since`, `filters`, `limit` | argv | valores validados | eco controlado |

Nunca llegan a stdout/JSON: `session.title`, `state.output`, `state.error` (solo se evalúan dentro
del `CASE` de SQLite), `input` de herramientas que no son de shell (`filePath`, `pattern`, `query`,
`prompt`, etc.), ids de mensajes y cualquier otro campo de `part`. El texto imprime el mismo
subconjunto que el JSON, sin `session_refs`.

La garantía es absoluta: **ninguno de los campos impresos admite texto libre de usuario**. El
esqueleto es lo que la sostiene (solo quedan basename y tokens estructurales); `maskSensitive` sobre
`tool` y sobre cada token es defensa adicional.

## Apertura de la base

1. `dbPath = opencodeDbPath()`; si `!exists(dbPath)` → `stderr` con la ruta + hint de
   `ANCLETO_OPENCODE_DB`, exit `1`.
2. `new DatabaseSync(dbPath, { readOnly: true })` y `db.exec('PRAGMA query_only = ON')`.
3. Verificar `sqlite_master` por `part` y `session`; si falta alguna, mensaje "la base de opencode
   no tiene la tabla X" + exit `1`.
4. Leer el alcance y ejecutar la consulta **dentro** del `try`; `db.close()` en `finally`, antes de
   agregar y renderizar. El render usa solo datos en memoria: la conexión no queda abierta durante la
   salida.

WAL: no se ejecuta `PRAGMA journal_mode`, no se hace checkpoint ni `VACUUM`, y **no** se abre con
`immutable=1` (ignoraría el `-wal` pendiente y devolvería datos viejos). Con la base en WAL la
corrida no modifica el `.db` ni el `-wal` (contenido, tamaño y mtime); el `-shm` puede actualizar su
read-mark, que es estado transitorio de SQLite y no datos de la base. La prueba abre un writer con
`PRAGMA journal_mode=WAL` y `PRAGMA wal_autocheckpoint=0`, inserta filas sin checkpoint y compara
hash/tamaño/mtime de `.db` y `-wal` antes/después, con el `-shm` excluido del assert; además asserta
que la consulta ve esas filas pendientes. Si SQLite devuelve `SQLITE_READONLY_RECOVERY` (o
`SQLITE_CANTOPEN` por WAL pendiente no recuperable), se emite un mensaje accionable —"cerrá opencode
una vez o apuntá `ANCLETO_OPENCODE_DB` a una copia"— y se sale con `1`. **Nunca** se reintenta en
modo escritura.

## Estructura del código

En `src/cli/index.js`, cerca de `statsCommand`:

- `statsFailuresCommand(args)` — orquesta el pipeline y renderiza.
- `parseFailuresArgs(args)` — flags, defaults y validación.
- `loadFailureScope(db, opts)` — sesiones, subárbol, directorios y predicados.
- `queryFailureBuckets(db, { scopeDirs, sessionIds, since, classes, tools })` — la consulta.
- `stripWrapper(raw)` → `{ wrapped, inner }`.
- `skeletonCommand(raw)` → `{ wrapped, command }`: wrapper, prefijo de entorno, basename + ≤3 tokens,
  masking por token y truncado a 160.
- `SHELL_TOOLS` — set único `['bash','shell','powershell','pwsh','cmd']`; es la fuente del criterio
  "es de shell" en JS y las listas literales del `CASE` de SQL deben coincidir con él.
- `maskSensitive(text)`, `maskPath(p)`, `truncate(text, max)`.
- `aggregateFailures(buckets)` — clave final (con el esqueleto), métricas y `session_refs` solo con
  `id`.
- `renderFailuresText(report)`, `failuresReportJson(report)`.

## Tests

Archivo nuevo `test/stats-failures.test.js` con el patrón existente de `test/cli.test.js`:
`run(args, cwd, env)` vía `spawnSync(process.execPath, [CLI, ...args])` y `withDir(fn)` sobre
`mkdtempSync(join(tmpdir(), ...))`.

Fixture:

```
makeFailuresDb(dir) -> { db, dbPath }
  CREATE TABLE session (id, parent_id, title, directory, time_created, time_updated)
  CREATE TABLE part (id, session_id, data TEXT, time_created)
addSession(db, {...})
addTool(db, { session_id, tool, status, exit, command, output, error, input, at })
  data = JSON.stringify({ type:'tool', tool, state:{ status, input, metadata:{ exit }, output, error } })
```

`ANCLETO_OPENCODE_DB` apunta al archivo del `tmpdir` en cada corrida; ninguna prueba abre la base
real.

Casos mínimos:

1. **Clasificación**: exit `9009` y `127` → `env`; `output` con `no se reconoce como nombre` →
   `env`; exit `1` sin señal → `check`; `read` con `status='error'` → `tool`; `bash` con
   `status='error'` sin exit ni señal → `unknown`; exit `0` no aparece.
2. **Esqueleto estructural** (tabla de casos obligatorios):
   - `& '<caveman>' shrink -- npm run check:i18n` → `npm run check:i18n`, `wrapped=true`, grupo
     separado del directo.
   - `git push origin development 2>&1` → `git push origin development`.
   - `curl -H 'Authorization: Bearer x' https://u:p@h` → `curl`.
   - `GITHUB_TOKEN=abc npm test` → `(env-prefix) npm test`, sin `GITHUB_TOKEN` ni `abc`; agrupa con
     `NPM_TOKEN=otro npm test`.
3. **Normalización**: variantes con `\r\n`/espacios extra colapsan en un grupo; argumentos
   posteriores al corte del esqueleto también caen en el mismo grupo.
4. **Agregación**: 7 fallos en una sesión + 2 en otra → `parts=9`, `sessions=2`,
   `max_per_session=7`; `first_seen`/`last_seen` con las dos fechas; `session_refs` solo con `id`.
5. **Orden fino**: fixture sintética con la forma 93 / 43 / 43-con-más-sesiones → 93, luego el 43
   con más sesiones, luego el otro 43; estable ante distinto orden de inserción. Caso aparte:
   etiqueta enmascarada igual → desempate final por `projectKey`.
6. **Alcance**: default solo el directorio del cwd; `--all` incluye otro proyecto; `--session`
   incluye subárbol; id inexistente → exit `1`.
7. **Etiqueta enmascarada repetida**: dos directorios que enmascaran igual → dos grupos.
8. **Invariante 2 (secretos)**: tabla positiva con `Bearer`, `ghp_`, `sk-`, `xoxb-`, `--token`,
   `--password`, `apikey`, `secret`, `ghp_`, `*_TOKEN=`, `*_SECRET=`, `*_KEY=`, `*_PASSWORD=` →
   valor ausente de stdout (texto y JSON); tabla negativa con comandos normales → salida sin cambios
   por el masking.
9. **Invariante 2 (input no-shell)**: `read`/`edit`/`grep`/`supabase_execute_sql`/`task` con
   sentinel en `input.filePath`/`pattern`/`query` → sentinel ausente y `command` `null`.
10. **Invariante 2 (título)**: `session.title` con sentinel → ausente en texto y JSON; cada
    `session_refs` expone solo `id`.
11. **Invariante 3 (output)**: `output` grande con sentinel → ausente en stdout y en JSON.
12. **Invariante 1 (solo lectura WAL)**: writer abierto, `PRAGMA journal_mode=WAL`,
    `PRAGMA wal_autocheckpoint=0`, inserción sin checkpoint; hash, tamaño y mtime de `.db` y `-wal`
    idénticos antes/después; `-shm` excluido del assert; el reporte ve las filas pendientes.
13. **Base inválida**: ruta inexistente → exit `1`; base sin `part` → exit `1`; base sin `session`
    → exit `1` con mensaje.
14. **Flags y límites**: `--class env` filtra, `--tool read` filtra, `--limit 1` recorta y reporta
    `shown`/`matched`, `--limit 0` y flag desconocido → exit `1`, `--since 2026-02-31` → exit `1`.
15. **Sin fallos**: exit `0` y mensaje explícito.
16. **No regresión**: `ancleto stats --json` sobre el mismo fixture conserva sus claves y valores
    (los tests existentes de `stats` siguen verdes).

## Riesgos

- **Clasificación heurística**: `Cannot find module` o `Unexpected token` en un test rojo se
  clasifican `env`; se acepta porque la clase es visible y el reporte no bloquea nada.
- **Granularidad del esqueleto**: dos invocaciones que difieren en flags o en argumentos posteriores
  al corte caen en el mismo grupo (`npm test` y `npm test --watch`). Es intencional: se mide
  recurrencia estructural y el total de fallos no se altera.
- **Truncado del esqueleto**: se aplica al texto final; dos esqueletos que difieren recién después de
  160 caracteres colisionan. Poco probable con ≤4 tokens, pero aceptado por legibilidad.
- **Enmascarado amplio**: el patrón `[A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD|PASSWD)...` puede
  enmascarar identificadores inocentes que contengan `KEY` (p. ej. `monkey=`). Falso positivo seguro.
- **Etiquetas de proyecto colisionables**: el agrupamiento es correcto; la etiqueta puede repetirse y
  el desempate final por `projectKey` mantiene el orden estable.
- **`IN` grande**: el alcance se expresa por directorios distintos y el subárbol por ids; si una
  base anómala superara el límite de parámetros, se particiona.
- **WAL**: la apertura read-only puede requerir recuperación; se falla con mensaje claro y nunca se
  escribe. Con WAL legible, `.db` y `-wal` no cambian; el `-shm` puede recibir un read-mark.

## Non-goals

Persistir la clase de un fallo, reparar o migrar la base, analizar semánticamente el `output`,
exponer `input` de herramientas que no son de shell, exponer títulos de sesión, cambiar la salida de
tokens de `stats` o agregar dependencias.
