# Spec: session-failure-report

## Purpose

Reporte de comandos y herramientas fallidas leído en solo lectura de la tabla `part` de la base de
sesiones de opencode, expuesto como `ancleto stats failures`. Clasifica cada fallo en `env`, `check`,
`tool` o `unknown`, agrupa por proyecto, herramienta, clase y esqueleto estructural del comando, y
respeta un contrato de privacidad: nunca imprime texto libre de usuario (`title`, `output`,
`state.error`) ni el `input` de herramientas que no son de shell.

## Requirements

### Requirement: Detección y clasificación de fallos

El sistema SHALL leer los tool parts de la base de sesiones de opencode (`part` con
`data.type='tool'`) y considerar fallo a todo part cuyo `state.status` sea `'error'` o cuyo
`state.metadata.exit` esté presente y sea distinto de `0`. Cada fallo SHALL clasificarse en
exactamente una de cuatro clases: `env`, `check`, `tool` o `unknown`.

La clasificación SHALL aplicarse con esta precedencia:

1. `tool`: la herramienta no es de shell (`read`, `edit`, `grep`, `task`, `supabase_execute_sql`,
   `webfetch` y similares).
2. `env`: es de shell (`bash`, `shell`, `powershell`, `pwsh` o `cmd`) y el fallo proviene del entorno o del tooling — exit
   `127` o `9009`, o el `output`/`error` contiene `is not recognized`,
   `no se reconoce como nombre`, `command not found`, `Missing script`, `Cannot find module`,
   `ParserError`, `Unexpected token`, `ENOENT` o el error de operador reservado del shell.
3. `check`: es de shell y devolvió `exit≠0` como resultado legítimo del comando.
4. `unknown`: es de shell, falló con `state.status='error'` y no hay exit ni señal de entorno.

La clasificación SHALL leer `output` y `state.error` solo en memoria. El reporte NO SHALL invocar
modelos ni servicios externos y NO SHALL imprimir ni persistir el contenido de `output`.

#### Scenario: Fallo de entorno por código de salida

- **WHEN** un tool part de shell tiene `metadata.exit=9009` (o `127`)
- **THEN** se clasifica `env` aunque el estado sea `completed`

#### Scenario: Fallo de entorno por mensaje

- **WHEN** un tool part de shell falla y su salida contiene `no se reconoce como nombre`
- **THEN** se clasifica `env`

#### Scenario: Fallo legítimo del comando

- **WHEN** un tool part de shell tiene `metadata.exit=1` y su salida no contiene señales de entorno
- **THEN** se clasifica `check`

#### Scenario: Fallo de herramienta que no es de shell

- **WHEN** un tool part de `read` tiene `state.status='error'`
- **THEN** se clasifica `tool`

#### Scenario: Fallo sin causa determinable

- **WHEN** un tool part de shell tiene `state.status='error'`, sin `metadata.exit` y sin señales de
  entorno en la salida
- **THEN** se clasifica `unknown`

#### Scenario: Comando exitoso

- **WHEN** un tool part tiene `state.status='completed'` y `metadata.exit=0`
- **THEN** no se cuenta como fallo

### Requirement: Superficie de comando y filtros

El sistema SHALL exponer el reporte como `ancleto stats failures`, subcomando de `stats`. SHALL
aceptar `--all`, `--since YYYY-MM-DD`, `--limit N`, `--session <id>`, `--json`, `--class` y
`--tool`. `--class` y `--tool` SHALL aceptar uno o más valores separados por coma. `--limit` SHALL
tener default `10` y SHALL requerir un entero mayor o igual a `1`. `--since` SHALL aceptar solo
fechas reales en formato `YYYY-MM-DD`: SHALL validar el round-trip de año, mes y día, de modo que
`2026-02-31` o `2026-13-01` se rechacen. Una opción desconocida, un valor faltante o un valor
inválido SHALL producir un mensaje de uso y un código de salida distinto de `0`. El comando
`ancleto stats` sin `failures` NO SHALL verse afectado.

#### Scenario: Filtro por clase

- **WHEN** se ejecuta `ancleto stats failures --class check`
- **THEN** se listan solo los grupos de clase `check`, con su tabla completa sujeta a `--limit`

#### Scenario: Filtro por herramienta

- **WHEN** se ejecuta `ancleto stats failures --tool read,bash`
- **THEN** se listan solo los grupos de esas herramientas

#### Scenario: Límite inválido

- **WHEN** se ejecuta `ancleto stats failures --limit 0`
- **THEN** se informa que `--limit` requiere un entero mayor o igual a 1 y se sale con error

#### Scenario: Fecha inexistente

- **WHEN** se ejecuta `ancleto stats failures --since 2026-02-31`
- **THEN** se informa que `--since` requiere una fecha válida y se sale con error

#### Scenario: Opción desconocida

- **WHEN** se ejecuta `ancleto stats failures --foo`
- **THEN** se imprime el uso del subcomando y se sale con error

### Requirement: Alcance por proyecto

Por defecto el sistema SHALL limitar el reporte a las sesiones del proyecto actual, comparando
`session.directory` con el directorio de trabajo con la misma semántica que `ancleto stats`:
igualdad, descendiente o ancestro, normalizando separadores y mayúsculas. Con `--all` SHALL
considerar todas las sesiones de la base. Con `--session <id>` SHALL considerar la sesión indicada
y su subárbol de subagentes; si la sesión no existe SHALL fallar con un mensaje claro.

La clave de agrupación SHALL incluir el proyecto, de modo que dos proyectos distintos no colapsen
en un mismo grupo aunque su etiqueta enmascarada coincida.

#### Scenario: Alcance por defecto

- **WHEN** hay fallos en el directorio actual y en otro proyecto
- **THEN** el reporte lista solo los del directorio actual e informa ese alcance

#### Scenario: Alcance global

- **WHEN** se ejecuta `ancleto stats failures --all`
- **THEN** el reporte incluye fallos de todos los proyectos y los mantiene separados por grupo

#### Scenario: Proyectos con etiqueta enmascarada igual

- **WHEN** dos directorios distintos se enmascaran al mismo texto
- **THEN** sus fallos se reportan en grupos separados

#### Scenario: Sesión inexistente

- **WHEN** se ejecuta `--session` con un id que no está en la base
- **THEN** se informa que la sesión no existe y se sale con error

#### Scenario: Subárbol de subagentes

- **WHEN** se ejecuta `--session <id>` sobre una sesión con sesiones hijas
- **THEN** se incluyen los fallos de la sesión y de sus descendientes

### Requirement: Esqueleto de comando y wrapper

El sistema SHALL derivar de cada comando de shell un **esqueleto estructural** que sea a la vez el
texto impreso y la clave de agrupación. La construcción SHALL ser:

1. Quitar el prefijo de wrapper de caveman `& '<ruta>' shrink --` (comillas simples o dobles) y
   registrar `wrapped` en `true`; si no hay wrapper, `wrapped` es `false` y el comando se usa tal
   cual.
2. Descartar los tokens iniciales con forma `NOMBRE=valor` (prefijo de entorno) sin imprimir el
   valor; si existió al menos uno, el esqueleto SHALL comenzar con el literal `(env-prefix) `.
3. Usar el basename del ejecutable, sin ruta, como primer token: se quitan solo las extensiones
   ejecutables conocidas (`.exe`, `.cmd`, `.bat`, `.ps1`, `.sh`, case-insensitive); las demás se
   conservan para no colapsar nombres como `python3.11`.
4. Agregar hasta 3 tokens siguientes, y solo mientras cada token completo cumpla
   `/^[A-Za-z][A-Za-z0-9:_.-]*$/`. El esqueleto SHALL cortarse en el primer token que empiece con
   flag (`-`) o que contenga `=`, `/`, `\`, `@`, `$`, comillas, redirección (`2>&1`) o cualquier
   carácter fuera de ese patrón.
5. Enmascarar cada token del esqueleto con la función de enmascarado como segunda capa y unirlos con
   un espacio; truncar el resultado a una longitud acotada.

La clave de agrupación SHALL incluir el esqueleto, no el comando completo. `wrapped` SHALL formar
parte de la clave para que un grupo nunca mezcle invocaciones envueltas y directas. El esqueleto es
lo que sostiene la garantía de privacidad; el enmascarado es defensa adicional.

Los fallos de herramientas que no son de shell SHALL agruparse en un único grupo por proyecto,
herramienta y clase, identificado como sin comando, sin exponer rutas ni patrones de entrada.

#### Scenario: Wrapper y comando interno

- **WHEN** un fallo de `bash` tiene comando `& '<ruta-caveman>' shrink -- npm run check:i18n`
- **THEN** el grupo muestra `npm run check:i18n` y `wrapped=true`, separado del grupo sin wrapper

#### Scenario: Redirección al final

- **WHEN** un fallo de `bash` tiene comando `git push origin development 2>&1`
- **THEN** el esqueleto mostrado es `git push origin development`

#### Scenario: Flags y credenciales en argumentos

- **WHEN** un fallo de `bash` tiene comando `curl -H 'Authorization: Bearer x' https://u:p@h`
- **THEN** el esqueleto mostrado es `curl`

#### Scenario: Prefijo de entorno

- **WHEN** un fallo de `bash` tiene comando `GITHUB_TOKEN=abc npm test`
- **THEN** el esqueleto mostrado es `(env-prefix) npm test`, sin el nombre ni el valor de la variable
- **AND** se agrupa con cualquier otra invocación de `(env-prefix) npm test` aunque el valor cambie

#### Scenario: Mismo comando con distinto espaciado

- **WHEN** el mismo comando falla con saltos de línea o espacios distintos en 2 sesiones
- **THEN** se reporta un solo grupo con el total de fallos y 2 sesiones

#### Scenario: Herramienta sin comando

- **WHEN** varios fallos de `read` no tienen `input.command`
- **THEN** se reportan como un único grupo de `read` sin comando, con su total y sesiones

#### Scenario: Esqueleto largo

- **WHEN** el esqueleto supera la longitud máxima mostrada
- **THEN** la salida lo trunca e indica que fue truncado

### Requirement: Agregación por proyecto, herramienta, clase y esqueleto

El sistema SHALL agrupar los fallos por proyecto, herramienta, clase, indicador de wrapper y
esqueleto de comando. Por grupo SHALL reportar: cantidad de fallos, cantidad de sesiones distintas,
máximo de fallos en una sola sesión, `first_seen`, `last_seen` y las sesiones afectadas
identificadas **solo por su `id`**. La agregación SHALL realizarse sobre todas las sesiones del
alcance, no solo sobre la última.

#### Scenario: Reincidencia dentro de una sesión

- **WHEN** un comando falla 7 veces en una sesión y 2 veces en otra
- **THEN** el grupo reporta total 9, 2 sesiones y máximo por sesión 7

#### Scenario: Ventana temporal del grupo

- **WHEN** un comando falla el 2026-10-10 y vuelve a fallar el 2026-10-21
- **THEN** `first_seen` y `last_seen` reflejan ambas fechas

#### Scenario: Sesiones afectadas

- **WHEN** un grupo acumula fallos en 3 sesiones
- **THEN** el grupo informa esas 3 sesiones solo con su `id`, sin ningún texto de la sesión

#### Scenario: Título de sesión no se expone

- **WHEN** una sesión del alcance tiene un `title` con un texto sentinel
- **THEN** el sentinel no aparece en stdout ni en el JSON, y cada `session_refs` contiene solo `id`

### Requirement: Orden determinístico y salida por defecto

El sistema SHALL ordenar los grupos por prioridad de clase (`env`, `check`, `tool`, `unknown`),
luego por cantidad de fallos descendente, luego por sesiones descendente, y ante nuevo empate por
herramienta, proyecto, esqueleto de comando y `wrapped` ascendente, y **finalmente por la clave de
proyecto normalizada** (sin enmascarar) ascendente. El orden NO SHALL depender del orden de lectura
de la base.

En la salida de texto por defecto SHALL imprimir primero la tabla de reincidencia de `env` y luego
los conteos agregados de `check`, `tool` y `unknown`. Cuando se indica `--class`, SHALL imprimir la
tabla de la clase indicada.

#### Scenario: Orden por reincidencia

- **WHEN** hay grupos con totales 93, 43 y 43 (este último en más sesiones)
- **THEN** el orden es 93, luego el de 43 con más sesiones, luego el otro de 43

#### Scenario: Desempate final por proyecto

- **WHEN** dos grupos empatan en clase, fallos, sesiones, herramienta, etiqueta de proyecto,
  esqueleto y `wrapped`, pero provienen de proyectos distintos
- **THEN** se ordenan por la clave de proyecto normalizada, de forma estable

#### Scenario: Salida por defecto

- **WHEN** se ejecuta el reporte sin `--class`
- **THEN** se ve la tabla de `env` y, debajo, una línea de conteos por cada una de las otras clases

### Requirement: Campos expuestos y privacidad

Ninguno de los campos impresos puede traer texto libre de usuario. Los únicos campos expuestos en
stdout y en `--json` SHALL ser: proyecto (etiqueta enmascarada), `id` de sesión, herramienta, clase,
esqueleto de comando, conteos y fechas. El sistema NO SHALL exponer el `title` de sesión, `output`,
`state.error` ni el `input` de herramientas que no son de shell (`filePath`, `pattern`, `query`,
`prompt` y similares).

#### Scenario: Entrada de herramienta de archivo

- **WHEN** un fallo de `read` tiene `input.filePath` con una ruta privada
- **THEN** la salida no contiene esa ruta ni ningún otro campo de `input`

#### Scenario: Entrada de herramienta de SQL

- **WHEN** un fallo de `supabase_execute_sql` tiene `input.query`
- **THEN** la salida no contiene la consulta

#### Scenario: Comando de shell

- **WHEN** un fallo de `bash` tiene un comando con un token
- **THEN** la salida muestra solo su esqueleto estructural, enmascarado y truncado

#### Scenario: Texto libre en metadatos

- **WHEN** una sesión tiene `title` con texto libre y un fallo tiene `output` con contenido
- **THEN** ni el título ni el `output` aparecen en texto o JSON

### Requirement: Enmascarado de secretos y rutas

El sistema SHALL enmascarar credenciales reconocibles (`Bearer`, `ghp_`, `sk-`, `xoxb-`, flags
`--token` y `--password`, y asignaciones cuyo nombre cumpla
`[A-Z0-9_]*(TOKEN|SECRET|KEY|PASSWORD|PASSWD)[A-Z0-9_]*` seguido de `=` o `:`) y rutas privadas
(home del usuario, rutas de unidad de Windows y raíces `/home/<usuario>` y `/Users/<usuario>`) antes
de mostrar o agrupar el proyecto, `tool` y cada token del esqueleto de comando. El enmascarado SHALL
aplicarse también sobre el esqueleto ya unido, para cubrir reglas que abarcan varios tokens
(`Authorization: Bearer <token>`), y el resultado enmascarado SHALL usarse tanto para mostrar como
para agrupar. El texto mostrado SHALL truncarse a una longitud acotada y SHALL eliminar caracteres
de control y secuencias de escape de terminal. El enmascarado es defensa adicional: la garantía
estructural la aporta el esqueleto.

#### Scenario: Token en el comando

- **WHEN** un comando contiene `Authorization: Bearer abc123` o `ghp_abc123`
- **THEN** la salida muestra el valor enmascarado y nunca el token original

#### Scenario: Flag con secreto

- **WHEN** un comando contiene `--password=hunter2` o `apikey=xyz`
- **THEN** la salida muestra el valor enmascarado y nunca el secreto original

#### Scenario: Variable de entorno con sufijo sensible

- **WHEN** un comando contiene `MY_APP_TOKEN=abc`, `DB_PASSWORD=xyz`, `SERVICE_SECRET=q` o
  `SIGNING_KEY=z`
- **THEN** el valor se enmascara y nunca se imprime

#### Scenario: Comando normal sin secretos

- **WHEN** un comando no contiene credenciales reconocibles
- **THEN** el enmascarado no altera sus tokens

#### Scenario: Ruta privada

- **WHEN** un proyecto o comando contiene el home del usuario o una ruta de unidad absoluta
- **THEN** la salida la reemplaza por una etiqueta estable y nunca muestra el usuario

#### Scenario: Secuencias de control

- **WHEN** un comando contiene secuencias de escape de terminal
- **THEN** la salida las elimina antes de imprimir

### Requirement: Agregación en SQL

El sistema SHALL agregar en la consulta SQL con `json_extract` y `CASE`, y NO SHALL cargar en
memoria las 65k filas de `part`. El grano máximo transferido SHALL ser una fila por proyecto,
herramienta, clase, comando crudo y sesión, acotado por la cantidad de fallos y no por el total de
tool parts. La consulta NO SHALL proyectar `output`, `state.error` ni `session.title`: `output` y
`state.error` solo se usan en la expresión de clasificación de las filas de error.

#### Scenario: Volumen de la base

- **WHEN** la base tiene decenas de miles de tool parts y unos pocos miles de fallos
- **THEN** la consulta devuelve solo filas agregadas por proyecto, herramienta, clase, comando y
  sesión

#### Scenario: Salida no se transfiere

- **WHEN** una fila de error tiene `output` de gran tamaño
- **THEN** el `output` no forma parte del resultado de la consulta

### Requirement: Acceso de solo lectura compatible con WAL

El sistema SHALL abrir la base de opencode con `readOnly: true` y `PRAGMA query_only = ON`, consultar
y **cerrar la conexión enseguida**, antes de renderizar. NO SHALL ejecutar sentencias de escritura,
cambiar `journal_mode`, hacer checkpoint ni migrar.

Con la base en modo WAL, el sistema NO SHALL modificar el archivo `.db` ni el archivo `-wal`: su
contenido, tamaño y mtime SHALL permanecer idénticos antes y después de la corrida. El archivo
`-shm` puede actualizar su read-mark (estado transitorio de SQLite) sin que eso constituya un cambio
de datos de la base. La corrida SHALL leer las filas pendientes del WAL aunque no se haya hecho
checkpoint.

El sistema NO SHALL abrir la base con `immutable=1`: ese modo ignora el `-wal` pendiente y
devolvería datos viejos.

Si la base no existe, si no expone las tablas `part` o `session`, o si la apertura de solo lectura
falla por recuperación pendiente del WAL, el sistema SHALL fallar con un mensaje claro y un código
de salida distinto de `0`.

#### Scenario: La base y el WAL no se modifican

- **WHEN** se ejecuta el reporte sobre una base en modo WAL con un writer abierto, `wal_autocheckpoint=0`
  y filas insertadas sin checkpoint
- **THEN** el hash, el tamaño y el mtime de `.db` y de `-wal` son idénticos antes y después
- **AND** el `-shm` queda excluido explícitamente del assert

#### Scenario: Se leen las filas pendientes del WAL

- **WHEN** el WAL tiene filas de fallos insertadas sin checkpoint
- **THEN** el reporte las incluye, demostrando que no se abrió en modo `immutable`

#### Scenario: Base ausente

- **WHEN** la ruta resuelta de la base no existe
- **THEN** se informa el error con la ruta y el código de salida es distinto de `0`

#### Scenario: Esquema sin tabla part

- **WHEN** la base existe pero no tiene la tabla `part`
- **THEN** se informa que el reporte requiere la base de opencode con tool parts y se sale con
  error

#### Scenario: WAL con recuperación pendiente

- **WHEN** SQLite no puede abrir la base en solo lectura porque el WAL requiere recuperación
- **THEN** se informa la causa y una acción concreta, sin habilitar escritura

### Requirement: Salida de texto y JSON

El sistema SHALL ofrecer una salida de texto legible y una salida `--json` parseable con los mismos
datos. La salida JSON SHALL incluir el alcance, el universo consultado, los grupos filtrados y la
cantidad de grupos mostrados. Cada grupo SHALL incluir proyecto enmascarado, herramienta, clase,
`wrapped`, esqueleto de comando o `null` para herramientas que no son de shell, cantidad de fallos,
sesiones, máximo por sesión, `first_seen`, `last_seen` y las sesiones afectadas con **solo su `id`**.
Cuando no haya fallos en el alcance, el sistema SHALL informarlo explícitamente y terminar con
éxito. Cuando `--limit` recorte la lista, el sistema SHALL indicar cuántos grupos se muestran sobre
el total.

#### Scenario: Salida de texto

- **WHEN** se ejecuta el reporte sin `--json` y hay fallos
- **THEN** se imprime una tabla con proyecto, herramienta, fallos, sesiones, máximo por sesión,
  fechas y esqueleto de comando

#### Scenario: Salida JSON

- **WHEN** se ejecuta el reporte con `--json`
- **THEN** la salida es JSON válido y cada grupo contiene los campos reportados

#### Scenario: Sin fallos

- **WHEN** no hay fallos en el alcance consultado
- **THEN** se informa que no hay fallos y el código de salida es 0

#### Scenario: Lista recortada

- **WHEN** hay más grupos que el valor de `--limit`
- **THEN** la salida indica cuántos grupos se muestran y cuántos hay en total

### Requirement: Portabilidad Windows y Linux

El sistema SHALL resolver la ruta de la base con el mismo mecanismo que `ancleto stats`
(`opencodeDbPath()`, respetando `ANCLETO_OPENCODE_DB`) en Windows y Linux. El esqueleto SHALL
producir el mismo grupo para el mismo comando aunque cambien los saltos de línea, los separadores
de path o la capitalización del directorio. La detección de herramientas de shell SHALL incluir los
shells de Windows (`powershell`, `pwsh`, `cmd`) además de `bash` y `shell`, para que la clasificación
y la privacidad se comporten igual en ambas plataformas.

#### Scenario: Ruta de base por variable de entorno

- **WHEN** `ANCLETO_OPENCODE_DB` apunta a una base válida
- **THEN** el reporte lee esa base en Windows y en Linux

#### Scenario: Diferencias de plataforma en el comando

- **WHEN** el mismo comando aparece con `\r\n` en Windows y con `\n` en Linux
- **THEN** ambos fallos caen en el mismo grupo

### Requirement: Pruebas con fixtures sintéticas

Las pruebas del reporte SHALL construir bases de opencode sintéticas en un directorio temporal y
apuntar `ANCLETO_OPENCODE_DB` a ellas. Las pruebas NO SHALL leer ni escribir la base real de
opencode. Cada uno de los tres invariantes negativos SHALL tener al menos una prueba.

#### Scenario: Base temporal

- **WHEN** corre la suite del reporte
- **THEN** cada caso crea su propia base en `tmpdir` y la elimina al terminar

#### Scenario: Invariante de solo lectura

- **WHEN** corre la prueba del invariante de solo lectura
- **THEN** usa una base temporal en WAL con `wal_autocheckpoint=0` y un writer abierto que insertó
  filas sin checkpoint
- **AND** compara hash, tamaño y mtime de `.db` y `-wal` antes y después, excluyendo `-shm`
- **AND** verifica que la lectura ve las filas pendientes del WAL

### Requirement: Compatibilidad con el reporte de tokens existente

El sistema SHALL preservar sin cambios la salida actual de tokens, costo y subagentes de
`ancleto stats`.

#### Scenario: Reporte de tokens sin cambios

- **WHEN** se ejecuta `ancleto stats` sin el subcomando `failures`
- **THEN** la salida de texto y el JSON de tokens conservan su estructura y valores actuales
