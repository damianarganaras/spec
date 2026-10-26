# Tasks: `ancleto stats failures`

Orden de implementación. Cada paso deja el CLI ejecutable y su prueba corriendo. Referencias de
diseño: `design.md`. Validaciones declaradas: `npm run lint` y `npm test` (`PRODUCT.md` →
`## Project Commands`); para pasos acotados, `node --test test/stats-failures.test.js`.
Estado: ronda de review 2026-10-25; los checkboxes reflejan el código y las pruebas ya presentes.

## 1. Superficie y parsing

- [x] 1.1 Agregar la delegación `args[0] === 'failures'` al inicio de `statsCommand` y actualizar la
      línea de `HELP` de `stats` (`src/cli/index.js:67`).
- [x] 1.2 Implementar `parseFailuresArgs(args)`: `--all`, `--since`, `--limit` (default 10, entero
      ≥ 1), `--session`, `--class` (lista), `--tool` (lista), `--json`; error de uso con exit 1
      para flag desconocido o valor inválido.
- [x] 1.3 Test: flags válidos parseados, `--limit 0` / no numérico / flag desconocido → exit 1 con
      mensaje de uso.
- [x] 1.4 Test: `ancleto stats` sin `failures` conserva salida y exit 0 (no regresión de la
      delegación).
- [x] 1.5 `--since` estricto: reemplazar `Date.parse` por round-trip (`Date.UTC(y, m-1, d)` y
      comparación de año/mes/día normalizados). Test: `2026-02-31` y `2026-13-01` → exit 1;
      `2026-02-28` válido.

## 2. Alcance

- [x] 2.1 Implementar `loadFailureScope`: leer `session` (`id, parent_id, directory`), reutilizar
      `buildSessionTree` para `--session` (validar existencia) y `normPath` para la comparación
      igual/descendiente/ancestro con `process.cwd()`. El `title` residual que hoy se lee se elimina
      en 4.7.
- [x] 2.2 Pasar a la consulta los directorios distintos del alcance (default) o los ids del
      subárbol (`--session`), y `--since` sobre `part.time_created`.
- [x] 2.3 Test: default excluye otro proyecto; `--all` lo incluye; `--session` incluye
      descendientes; id inexistente → exit 1; sesión con `directory` nulo fuera del default.

## 3. Apertura de base y errores

- [x] 3.1 Implementar la apertura con `opencodeDbPath()`, `readOnly: true`,
      `PRAGMA query_only = ON` y cierre en `finally` antes de renderizar; validación de `part` y
      `session` en `sqlite_master`. Mensajes claros para base ausente, esquema incompleto y fallo de
      apertura por WAL (`SQLITE_READONLY_RECOVERY` / `SQLITE_CANTOPEN`); nunca reintentar en modo
      escritura ni usar `immutable=1`.
- [x] 3.2 Test: ruta inexistente → exit 1 con la ruta; base sin `part` → exit 1.
- [x] 3.3 Test (invariante negativo 1, WAL realmente pendiente): writer abierto,
      `PRAGMA journal_mode=WAL`, `PRAGMA wal_autocheckpoint=0`, insertar fallos sin checkpoint;
      hash + tamaño + mtime de `.db` y `-wal` idénticos antes/después; `-shm` excluido
      explícitamente del assert; el reporte ve las filas pendientes. Reemplaza el fixture actual que
      cierra la conexión y deja el WAL vacío.
- [x] 3.4 Test: base sin tabla `session` → exit 1 con mensaje.

## 4. Consulta, clasificación y privacidad de origen

- [x] 4.1 Implementar `queryFailureBuckets` con el `WITH ... CASE` del diseño: universo, `env` por
      exit `127`/`9009` y por patrones de entorno, `check` por exit≠0, `tool` para no-shell,
      `unknown` para shell sin exit ni señal.
- [x] 4.2 Proyectar `cmd` solo para `bash`/`shell`/`powershell`/`pwsh`/`cmd` (`SHELL_TOOLS`) y
      **nunca** `output`/`state.error`; agregar al grano (proyecto, sesión, tool, clase, comando
      crudo) con `COUNT`, `MIN`, `MAX`. El `session_title` residual se quita en 4.7.
- [x] 4.3 Conectar `--class` y `--tool` como predicados de la consulta.
- [x] 4.4 Test: los cinco escenarios de clasificación (exit 9009, exit 127, mensaje de entorno,
      exit 1 → check, read error → tool, bash error sin exit → unknown) y exit 0 excluido.
- [x] 4.5 Test (invariante negativo 3): `output` grande con sentinel no aparece en stdout (texto ni
      JSON) y no se proyecta en el resultado.
- [x] 4.6 Test (invariante negativo 2, origen): sentinel en `input.filePath`, `pattern` y `query`
      de `read`/`edit`/`grep`/`supabase_execute_sql`/`task` no aparece en stdout y esos grupos
      tienen `command: null`.
- [x] 4.7 Quitar `session_title` del `SELECT` y del `GROUP BY` de la consulta, y `title` de la
      lectura de `session`; la consulta no proyecta ningún texto de sesión.

## 5. Esqueleto de comando y enmascarado

- [x] 5.1 Implementar `stripWrapper` (`& '<ruta>' shrink -- <interno>`, comillas simples o dobles) y
      `wrapped` booleano.
- [x] 5.2 Implementar `maskSensitive`, `maskPath`, `stripControl` y `truncate` con los límites del
      diseño (comando 160, proyecto 60, tool 40; ya sin título).
- [x] 5.3 Implementar `skeletonCommand(raw)`: basename del ejecutable sin ruta ni extensión + hasta
      3 tokens siguientes, solo mientras cada token cumpla `/^[A-Za-z][A-Za-z0-9:_.-]*$/`; cortar
      en flag (`-`), `=`, `/`, `\`, `@`, `$`, comillas o redirección.
- [x] 5.4 Manejar el prefijo de entorno: descartar tokens iniciales `NOMBRE=valor` sin conservar el
      valor y prefijar `(env-prefix) ` al esqueleto.
- [x] 5.5 Aplicar `maskSensitive` a `tool` y a cada token del esqueleto; usar el esqueleto (no el
      comando completo) en la clave de grupo y en la salida.
- [x] 5.6 Test wrapper: comando envuelto muestra el interno, `wrapped=true` y no se mezcla con el
      directo.
- [x] 5.7 Test normalización: `\r\n`/espacios extra colapsan en un grupo (ajustar asserts al
      esqueleto en 5.9).
- [x] 5.8 Test masking actual: `Bearer`, `ghp_`, `sk-`, `xoxb-`, `--token`, `--password`, `apikey`,
      `secret`, `key=` enmascarados; home y rutas de unidad reemplazados; ANSI eliminado.
- [x] 5.9 Test tabla de esqueleto: `& '<caveman>' shrink -- npm run check:i18n` →
      `npm run check:i18n`; `git push origin development 2>&1` → `git push origin development`;
      `curl -H 'Authorization: Bearer x' https://u:p@h` → `curl`; `GITHUB_TOKEN=abc npm test` →
      `(env-prefix) npm test` sin el nombre ni el valor.
- [x] 5.10 Corregir el masking de asignaciones: `[A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD|PASSWD)[A-Z0-9_]*\s*[=:]`
      (el `\b` dejaba pasar `*_TOKEN=`, `*_SECRET=` y `*_KEY=`). Test de tabla positiva (valores
      enmascarados) y negativa (comandos normales sin cambios).
- [x] 5.11 Quitar `title` de `session_refs` en `aggregateFailures` y en `failuresReportJson`: cada
      referencia expone solo `{ id }`.
- [x] 5.12 Ajustar el test de truncado: quitar el assert de título y conservar solo el truncado del
      esqueleto a 160.

## 6. Agregación, orden y métricas

- [x] 6.1 Implementar `aggregateFailures`: reagrupar por la clave final, sesiones distintas,
      `max_per_session`, `first_seen`/`last_seen` y `session_refs` (el `title` residual se elimina
      en 5.11).
- [x] 6.2 Implementar el orden determinístico (clase, fallos, sesiones, tool, proyecto, comando,
      `wrapped`) y el recorte con `--limit` después de calcular `universe`/`matched`.
- [x] 6.3 Agregar el desempate final por `projectKey` (`normPath(project_dir)` sin enmascarar),
      después de `wrapped`.
- [x] 6.4 Test: 7 fallos en una sesión + 2 en otra → `parts=9`, `sessions=2`,
      `max_per_session=7`; fechas de primera/última.
- [x] 6.5 Test: orden fino por reincidencia con fixture sintética 93 / 43 / 43-con-más-sesiones,
      estable ante distinto orden de inserción.
- [x] 6.6 Test: dos proyectos cuya etiqueta enmascarada coincide quedan en grupos separados.
- [x] 6.7 Test: con etiqueta enmascarada igual y resto de criterios empatados, el orden se resuelve
      por `projectKey`.

## 7. Salidas

- [x] 7.1 Implementar `renderFailuresText`: encabezado de alcance, universo y partición, tabla de
      `env` primero, conteos de `check`/`tool`/`unknown`, aviso de recorte, mensaje de "sin fallos"
      con exit 0.
- [x] 7.2 Implementar `failuresReportJson` con el esquema del diseño (`scope`, `project`,
      `session`, `since`, `filters`, `universe.by_class`, `matched`, `shown`, `groups`).
- [x] 7.3 Test: texto muestra la sección `env` antes de los conteos y respeta `--limit`; con
      `--class check` muestra solo esa tabla.
- [x] 7.4 Test: JSON parseable, campos y tipos del esquema, `command` nulo para no-shell, `shown` y
      `matched` coherentes con `--limit`.
- [x] 7.5 Test: sin fallos → mensaje explícito y exit 0 (texto y JSON).
- [x] 7.6 Test (invariante 2, texto libre): `session.title` con sentinel ausente en texto y JSON, y
      `session_refs` con solo `id`.

## 8. Cierre

- [x] 8.1 Ampliar la tabla de casos de `test/stats-failures.test.js` hasta cubrir los 16 casos del
      diseño; todas las fixtures en `tmpdir` y `ANCLETO_OPENCODE_DB` apuntando a ellas.
- [x] 8.2 Correr `node --test test/stats-failures.test.js` y corregir fallos. — ledger: 24/24.
- [x] 8.3 Correr `npm run lint` sobre `src/cli/index.js` y `test/stats-failures.test.js`. — ledger:
      lint OK.
- [x] 8.4 Correr `npm test` completo y confirmar que las pruebas de `stats` existentes siguen
      verdes. — ledger: 516/516.
- [x] 8.5 Verificación manual acotada: `ancleto stats failures --json | head` y
      `ancleto stats failures --all --class env` sobre la base real (solo lectura), comprobando que
      no se imprime `output`, `input` de no-shell ni títulos de sesión. — verificado en archive:
      corrida read-only sobre la base real; `session_refs` solo con `id`, sin `title`.
