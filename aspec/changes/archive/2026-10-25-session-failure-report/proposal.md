# Proposal: Reporte de fallos por clase desde la base de sesiones de opencode

## Problem

`ancleto stats` mide consumo (tokens, costo, subagentes) leyendo solo las tablas `session` y
`message` de la base de opencode (`src/cli/index.js:2741`, `:2773`, `:2790-2802`). No observa la
tabla `part`, donde opencode persiste cada invocación de herramienta con `data.type='tool'`,
`tool`, `state.status`, `state.input.command`, `state.metadata.exit` y `output`
(`BACKLOG.md:309`).

Consecuencia: los comandos que fallan de forma repetida solo se detectan por auto-reporte del
agente. El universo de fallos medido es de **2.664** tool parts, pero ese total mezcla causas que
exigen acciones opuestas: **1.663 (62,4 %)** son `check` (el comando corrió y falló legítimamente:
lint/test/typecheck rojos), **499 (18,7 %)** son `env` (el binario o el shell no está disponible),
**414 (15,5 %)** son `tool` (fallos de `read`/`edit`/`grep`/SQL) y **88 (3,3 %)** son `unknown`.
Sin clasificación, el ruido esperado de `check` tapa el problema de entorno que sí es accionable.

## Reproduction evidence

Baseline nuevo, solo lectura (`node:sqlite`, `readOnly:true` + `PRAGMA query_only=ON`) contra
`<home>/.local/share/opencode/opencode.db` (ruta resuelta por `opencodeDbPath()` en
`src/cli/index.js:2650`; `ANCLETO_OPENCODE_DB` no seteada). Fecha: 2026-10-24.

Universo: `part.data.type='tool'` ∧ (`state.status='error'` ∨ `state.metadata.exit≠0`).

Snippet del baseline (medición; la implementación agrega en SQL, ver `design.md`):

```js
const db = new DatabaseSync(DB, { readOnly: true }); db.exec('PRAGMA query_only = ON')
const rows = db.prepare(`SELECT p.session_id sid,
  json_extract(p.data,'$.tool') tool, json_extract(p.data,'$.state.status') status,
  json_extract(p.data,'$.state.metadata.exit') exit,
  json_extract(p.data,'$.state.input.command') command,
  json_extract(p.data,'$.state.output') output, json_extract(p.data,'$.state.error') errorText,
  p.time_created t, s.directory dir
  FROM part p LEFT JOIN session s ON s.id = p.session_id
  WHERE json_extract(p.data,'$.type') = 'tool'
    AND (json_extract(p.data,'$.state.status') = 'error'
      OR (json_extract(p.data,'$.state.metadata.exit') IS NOT NULL
          AND json_extract(p.data,'$.state.metadata.exit') <> 0))`).all()
const WRAP = /^&\s+['"][^'"]+['"]\s+shrink\s+--\s+([\s\S]+)$/
const ENV = /(is not recognized|no se reconoce como nombre|command not found|Missing script|Cannot find module|ParserError|Unexpected token|El operador '<' est[aá] reservado|ENOENT)/i
const isShell = t => t === 'bash' || t === 'shell'
// wrapped = WRAP.test(cmd); inner = WRAP.exec(cmd)?.[1] ?? cmd
// cls = !isShell(tool) ? 'tool'
//   : (exit === 127 || exit === 9009 || ENV.test(`${output ?? ''}\n${errorText ?? ''}`)) ? 'env'
//   : (exit != null && Number(exit) !== 0) ? 'check' : 'unknown'
```

Totales: **65.263** tool parts · **64.757** `completed` · **502** `state.status='error'` ·
**4** `running` · **21.602** bash/shell · **2.664** fallos ampliados.

### Partición por clase

| clase | parts | % ampliado | grupos | sesiones |
|---|---:|---:|---:|---:|
| env | 499 | 18,7 % | 496 | 313 |
| check | 1.663 | 62,4 % | 1.317 | 472 |
| tool | 414 | 15,5 % | 55 | 221 |
| unknown | 88 | 3,3 % | 85 | 68 |
| total | 2.664 | 100 % | 1.953 | 706 |

### Top `env` (reincidencia por comando)

Cola larga: 496 grupos / 499 parts; **319 de 499** son `no se reconoce como nombre`, casi uno por
sesión. Columna `proyecto` = directorio de la sesión, abreviado; `wrapped` = comando invocado a
través del wrapper.

| proyecto | tool | total | ses | máx/ses | first_seen | last_seen | comando interno | wrapped |
|---|---|---:|---:|---:|---|---|---|---|
| App Registros TC | bash | 2 | 2 | 1 | 2026-10-21 23:43 | 2026-10-21 23:56 | `npx jest --runInBand 2>&1 \| Select-Object -Last 60` | false |
| App Registros TC | bash | 2 | 2 | 1 | 2026-10-19 18:36 | 2026-10-19 22:54 | `bash -n scripts/go-live/build_prod_db.sh; if ($?) { "bash -n OK" }` | false |
| App Registros TC | bash | 2 | 2 | 1 | 2026-10-10 18:19 | 2026-10-12 19:56 | `npm run verify 2>&1` | false |
| `<home>/orca/workspaces/spec/development` | bash | 1 | 1 | 1 | 2026-10-24 23:30 | 2026-10-24 23:30 | `node -e "const {DatabaseSync}=require('node:sqlite');...` | false |
| App Registros TC | bash | 1 | 1 | 1 | 2026-10-23 23:54 | 2026-10-23 23:54 | `python -c " import re,os SRC=r'<path>' ...` | false |
| App Registros TC | bash | 1 | 1 | 1 | 2026-10-23 23:52 | 2026-10-23 23:52 | `pip list 2>$null \| Select-String ... ; python -c " ...` | false |
| App Registros TC | bash | 1 | 1 | 1 | 2026-10-23 23:12 | 2026-10-23 23:12 | `rg -n "^### 2[5-9]\)..." "supabase/runbooks/prod-writes.md"` | false |
| `<home>/orca/workspaces/spec/development` | bash | 1 | 1 | 1 | 2026-10-23 20:50 | 2026-10-23 20:50 | `rg -n "stats\|opencode" src/cli/index.js \| Select-Object -First 80` | false |

### Datos adicionales del baseline

- **`check`** 1.663 parts / 1.317 grupos / 472 sesiones. **La reincidencia del wrapper caveman está
  acá, no en `env`**: `npm run lint` 93 fallos (30 sesiones), `npm run typecheck` 43 (10) y
  `npm run verify` 32 (11). Por proyecto, `lint` da 51/16 en App Registros TC y 37/13 en
  `<home>/ancleto/spec`.
- **`tool`** 414 parts / 55 grupos / 221 sesiones: `read` 160, `edit` 130, `grep` 35,
  `supabase_execute_sql` 32, `task` 15, `webfetch` 10.
- **`unknown`** 88 parts / 85 grupos / 68 sesiones: todos `bash` con `state.status='error'`, sin
  `metadata.exit` ni señal de entorno.
- **Proyecto actual vs todos**: 22 parts / 4 sesiones (env 4/2, check 13/3, tool 5/1, unknown 0)
  frente a 2.664 parts / 706 sesiones; 7 sesiones propias de 1.564.
- **Base**: `PRAGMA journal_mode = wal`. Tabla `session` con `id, project_id, parent_id, slug,
  directory, title, version, share_url, summary_*, revert, permission, time_created,
  time_updated, ...`; solo se usan `session.id`, `session.parent_id`, `session.directory` y
  `part.time_created`. `session.title` **no** se expone ni se usa como clave.
- **Corrección narrativa**: el wrapper caveman sobre `npm` concentra la mayor reincidencia del
  universo, pero pertenece a `check` (fallo legítimo del comando). `env` es una cola larga de
  binarios no disponibles, con 313 sesiones afectadas y casi sin repetición por comando.

## Proposed change

Agregar el subcomando `ancleto stats failures` al CLI existente (`src/cli/index.js`), reutilizando
`opencodeDbPath()`, `normPath()` y el patrón de apertura solo lectura de `statsCommand`:

1. **Clasificación obligatoria** de cada fallo: `env` (el entorno o el tooling falló: comando no
   encontrado, exit `9009`/`127`, `is not recognized`, `no se reconoce como nombre`, ENOENT del
   binario, `Missing script`, `Cannot find module`, error de parseo del shell), `check` (el comando
   corrió y devolvió `exit≠0` como resultado legítimo: lint/test/typecheck rojos, `git push`
   rechazado), `tool` (fallo de `read`/`edit`/`grep`/`task`/`supabase_execute_sql` y similares) y
   `unknown`. La clasificación lee `output` **solo en memoria**; nunca lo imprime ni lo persiste.
   Salida por defecto: primero la reincidencia de `env` por comando; después conteos agregados de
   `check`/`tool`/`unknown`.
2. **Superficie**: `ancleto stats failures`. Hereda `--all`, `--since`, `--limit`, `--session` y
   `--json` de `ancleto stats`; agrega `--class` y `--tool`.
3. **Alcance**: por defecto solo sesiones del proyecto actual (`session.directory`, misma semántica
   que `stats`: igual, descendiente o ancestro); `--all` para todas. La clave de agrupación incluye
   el proyecto, para que el enmascarado de rutas no colapse proyectos distintos.
4. **Wrapper y esqueleto estructural**: quitar el prefijo de wrapper de caveman
   `& '<ruta>' shrink --` y derivar un **esqueleto** del comando: basename del ejecutable (sin ruta
   ni extensión) más hasta 3 tokens siguientes, y solo mientras cada token completo cumpla
   `/^[A-Za-z][A-Za-z0-9:_.-]*$/`. El esqueleto se corta en el primer token que empiece con flag
   (`-`) o que contenga `=`, `/`, `\`, `@`, `$`, comillas, redirección (`2>&1`) o cualquier carácter
   fuera de ese patrón. Un
   prefijo de variables de entorno (`NOMBRE=valor`) se descarta sin imprimir el valor y el grupo se
   identifica como `(env-prefix)`. El esqueleto es a la vez el comando impreso y la clave de
   agrupación; `wrapped: true|false` sigue formando parte de la clave.
5. **Por grupo**: sesiones afectadas (solo `id`), máximo de fallos por sesión, `first_seen` y
   `last_seen`, para responder si el comando siguió fallando después de grabar una regla.
6. **Privacidad absoluta**: ninguno de los campos impresos puede traer texto libre de usuario. Solo
   se exponen proyecto (etiqueta enmascarada), `id` de sesión, herramienta, clase, esqueleto de
   comando, conteos y fechas. **No** se emiten títulos de sesión, `output`, `state.error` ni `input`
   de herramientas que no son de shell. El esqueleto es lo que sostiene la garantía; el enmascarado
   de cada token (y de `tool`) es defensa adicional.
7. **Agregación en SQL** con `json_extract` y `CASE`, sin cargar 65k filas en JS; `output` se lee
   únicamente en la expresión de clasificación de las filas de error y nunca se proyecta.
8. **Tests con fixtures sintéticas en `tmpdir`**, nunca contra la base real.

## Negative invariants

Estos tres invariantes son parte del contrato y cada uno tiene prueba automatizada:

1. **No modifica los datos de la base de opencode.** Se abre con `readOnly:true` +
   `PRAGMA query_only=ON`, se consulta y se cierra enseguida (no queda abierta durante el render);
   nunca se cambia `journal_mode`, no se hace checkpoint ni migración. Con la base en WAL **no
   modifica `.db` ni `-wal`** (contenido, tamaño y mtime); el `-shm` puede actualizar su read-mark,
   sin datos de la base. *Clasificación: test* — fixture con writer abierto y WAL realmente
   pendiente: `PRAGMA journal_mode=WAL`, `PRAGMA wal_autocheckpoint=0`, filas insertadas sin
   checkpoint; hash, tamaño y mtime de `.db` y `-wal` idénticos antes/después, `-shm` excluido
   explícitamente del assert, y assert de que la lectura **ve las filas pendientes del WAL**. No se
   usa `immutable=1` porque ignoraría el WAL pendiente y leería datos viejos.
2. **No imprime secretos ni texto libre de usuario.** El esqueleto estructural es la garantía: el
   comando se reduce a basename + hasta 3 tokens estructurales, sin flags, valores ni rutas; el
   enmascarado se aplica a `tool` y a cada token como segunda capa. *Clasificación: test* — fixtures
   con `Bearer`, `ghp_`, `sk-`, `xoxb-`, `--token`, `--password`, `apikey`, `secret`,
   `*_TOKEN=`, `*_SECRET=`, `*_KEY=`, más una tabla negativa de comandos normales que no se alteran.
3. **No vuelca `output` completo.** Del `output` no se emite contenido: solo metadatos derivados
   (estado, código de salida, clase). *Clasificación: test* — fixture con `output` grande y
   sentinel, assert de ausencia.

## Scope

In scope:

- Subcomando `ancleto stats failures` con clasificación `env`/`check`/`tool`/`unknown`.
- Detección de fallos desde `part` y agregación en SQL por proyecto + herramienta + clase +
  esqueleto de comando + sesión.
- Normalización: wrapper, esqueleto estructural, prefijo de entorno, enmascarado y truncado.
- Alcance por proyecto (default), `--all`, `--session`, `--since`, `--class`, `--tool`, `--limit`.
- Salida de texto (env primero, luego conteos por clase) y `--json`.
- Métricas por grupo: parts, sesiones, máximo por sesión, `first_seen`, `last_seen`, `wrapped`.
- Tests de los tres invariantes negativos (WAL realmente pendiente), del esqueleto, del enmascarado,
  de la clasificación y del agrupamiento/orden.

Out of scope:

- Escribir, migrar o reparar la base de opencode; cualquier operación destructiva.
- Volcar `output`, `input` completo o diffs de herramientas.
- Llamadas a LLM, servicios externos o análisis semántico de los fallos.
- Cambiar la salida actual de tokens/costo de `ancleto stats` (debe quedar intacta).
- Agregar dependencias de runtime (se mantiene zero-dependencies y `node:sqlite`).
- La skill de auditoría de sesión (`BACKLOG.md:307`, ítem 14); este change solo la alimenta.
- Reclasificar retroactivamente fallos ya registrados ni persistir la clase.

## Risks

- **Falsos positivos de clasificación**: un test que falla por `Cannot find module` o un lint que
  reporta `Unexpected token` se clasifica `env`. Mitigación: el criterio queda explícito en la spec
  y la clase se imprime; un `env` con `exit=1` y mensaje de módulo es revisable a ojo.
- **Falsos positivos por `metadata.exit≠0`** en comandos cuyo fallo es esperado (p. ej. `grep` sin
  coincidencias): el reporte es informativo y no bloquea nada.
- **Fuga por texto libre**: se elimina la exposición de `session.title`; ningún campo impreso
  admite texto del usuario. El riesgo residual queda acotado a la etiqueta de proyecto enmascarada.
- **Pérdida de granularidad por esqueleto**: dos comandos que difieren solo en flags o argumentos
  posteriores al corte caen en el mismo grupo (p. ej. `npm test` y `npm test --watch`). Es
  intencional: el reporte mide recurrencia estructural, no invocaciones exactas.
- **Colisión visual de proyectos enmascarados**: dos directorios en unidades distintas pueden
  enmascararse igual (`<path>`). Mitigación: la clave de agrupación usa el directorio normalizado
  sin enmascarar; los grupos no se fusionan aunque la etiqueta coincida, y un desempate final por
  esa clave hace el orden determinístico.
- **Colapso por truncado**: el truncado del esqueleto integra la clave, así que dos esqueletos que
  difieren solo después del límite caen en el mismo grupo. El total de fallos no se pierde.
- **WAL**: una conexión read-only puede fallar si SQLite necesita recuperar el WAL
  (`SQLITE_READONLY_RECOVERY`). Mitigación: mensaje accionable (abrir opencode una vez o apuntar
  `ANCLETO_OPENCODE_DB` a una copia); nunca se habilita escritura. Con WAL pendiente legible, la
  corrida ve esas filas sin tocar `.db` ni `-wal`; el `-shm` puede recibir un read-mark.
- **Costo**: la consulta agrega antes de cruzar a JS; el grano máximo es
  (proyecto, herramienta, clase, comando crudo, sesión), acotado por los 2.664 fallos, no por los
  65k parts.
- **Diferencias Windows/Linux** en separadores y whitespace: se normalizan antes de agrupar, con
  tests de ambos formatos.
- **Divergencia con `stats`**: se reutilizan `opencodeDbPath()`, `normPath()` y el patrón de
  apertura read-only; el código de tokens no se modifica.
