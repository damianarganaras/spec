# Spec: machine-environment

## Purpose

Bloque de entorno de ejecución propio de cada máquina, materializado por la CLI como artefacto
local derivado (`.ancleto/machine-env.md`) y entregado a todos los subagentes que ejecutan
comandos. Define dónde vive, cómo se genera y regenera en el ciclo de vida, qué hechos mínimos
declara (plataforma, shell, fin de línea y disponibilidad de herramientas), cómo se excluye del
control de versiones sin gestionar `.gitignore`, cómo llega al ejecutor y qué precedencia tiene
frente a instrucciones genéricas, y cómo se mide la mejora con el reporte existente de
`ancleto stats failures`.

## Requirements

### Requirement: Artefacto de entorno de máquina no versionado

El sistema SHALL materializar el bloque de entorno de la máquina en `.ancleto/machine-env.md`.
El bloque NO SHALL formar parte de `.ancleto/working-context.md` ni de `AGENTS.md`, y
`templates/AGENTS.md` NO SHALL contener valores de la máquina.

El ciclo de vida SHALL garantizar que el path exacto no sea versionable sin gestionar el
`.gitignore` del proyecto. Para ello SHALL resolver la raíz del worktree con
`git -C <projectRoot> rev-parse --show-toplevel` y SHALL derivar el path repo-root-relative del
artefacto con `git -C <projectRoot> rev-parse --show-prefix`, que devuelve el prefijo del
directorio del proyecto respecto de la raíz del worktree (vacío cuando el proyecto es la raíz) y
resuelve correctamente raíces symlinkeadas y worktrees vinculados. El patrón exacto SHALL
componerse como `<prefix>.ancleto/machine-env.md`, normalizando los separadores a `/`, sin usar
`path.relative`. Ese path repo-root-relative SHALL ser el patrón exacto usado en la exclusión
local y en las comprobaciones de git; NO SHALL usarse el patrón fijo `.ancleto/machine-env.md`
cuando el directorio del proyecto no sea la raíz del repositorio. Si
`git -C <projectRoot> rev-parse --show-prefix` falla, o su resultado es absoluto o empieza con
`..`, el sistema SHALL emitir un warning y NO SHALL escribir ninguna regla de exclusión; el
mensaje SHALL describir la falla real y NO SHALL afirmar que el artefacto está fuera del
repositorio cuando el path compuesto es un path relativo válido. El patrón SHALL conservar el
nombre del directorio tal como lo devuelve git, incluidos los espacios iniciales. Si el prefijo
contiene `\r` o `\n`, el sistema SHALL tratarlo como inválido: SHALL emitir un warning y NO SHALL
escribir ninguna regla, de modo que un nombre de directorio no pueda introducir líneas
adicionales en la exclusión local.

Tras generar el artefacto, el sistema SHALL comprobar si el path repo-root-relative ya está
ignorado con `git -C <repoRoot> check-ignore --no-index -q -- <path-repo-root-relative>`. Si ya lo
está, NO SHALL modificar ninguna regla de exclusión. Si no lo está, SHALL agregar exactamente una
entrada con ese patrón repo-root-relative a la exclusión local del clon, cuya ruta SHALL resolverse
con `git rev-parse --git-path info/exclude`, sin reescribir, reordenar ni eliminar entradas
existentes y preservando su contenido previo byte a byte, sin asumir la ruta `.git/info/exclude`. La comprobación de reglas SHALL usar
`--no-index`, de modo que un artefacto ya trackeado no altere la decisión sobre reglas existentes.
Después de escribir, SHALL re-verificar con `check-ignore --no-index` desde la raíz del repositorio
contra el mismo path y SHALL derivar `ignored` y `updated` de esa verificación, no de la intención
de escribir. Si la re-verificación no confirma la exclusión, SHALL emitir un warning y NO SHALL
reportar la exclusión como garantizada. La operación SHALL ser idempotente. Cuando el directorio no
sea un repositorio git o el binario `git` no esté disponible, NO SHALL escribir ninguna regla de
exclusión y SHALL emitir un warning no bloqueante. `ancleto check` SHALL advertir, sin cambiar su
exit code, cuando `git ls-files` muestre el artefacto trackeado.

#### Scenario: Generación en un repo que no ignora `.ancleto/`

- **WHEN** se ejecuta `ancleto init` en un repositorio git cuyo `.gitignore` no ignora `.ancleto/`
- **THEN** se crea `.ancleto/machine-env.md`
- **AND** `git check-ignore --no-index -q -- .ancleto/machine-env.md` devuelve éxito
- **AND** el archivo no aparece como trackeado en `git ls-files`
- **AND** `.gitignore` queda byte a byte sin cambios
- **AND** las entradas previas de la exclusión local conservan su contenido y su orden

#### Scenario: Path ya ignorado

- **WHEN** el repositorio ya ignora el path repo-root-relative del artefacto por cualquier regla
- **THEN** el ciclo de vida crea o actualiza `.ancleto/machine-env.md`
- **AND** `git check-ignore --no-index` desde la raíz del repositorio devuelve éxito
- **AND** ni `.gitignore` ni la exclusión local del clon cambian

#### Scenario: Regla idempotente

- **WHEN** `ancleto upgrade` se ejecuta dos veces seguidas en el mismo proyecto y la misma máquina
- **THEN** la exclusión local contiene una sola entrada con el patrón repo-root-relative exacto del
  artefacto

#### Scenario: Worktree vinculado

- **WHEN** el proyecto es un worktree vinculado y la exclusión aún no existe
- **THEN** la entrada se escribe en la ruta que devuelve `git rev-parse --git-path info/exclude`
- **AND** la entrada usa el patrón repo-root-relative del worktree
- **AND** `git check-ignore --no-index` dentro del worktree devuelve éxito
- **AND** el artefacto no queda trackeado en el worktree

#### Scenario: Proyecto en subdirectorio del repositorio

- **WHEN** se ejecuta `ancleto install --project packages/app` en un repositorio git cuyo
  `.gitignore` no ignora `.ancleto/`
- **THEN** se crea `packages/app/.ancleto/machine-env.md`
- **AND** la exclusión local contiene exactamente la entrada
  `packages/app/.ancleto/machine-env.md`
- **AND** el patrón no contiene segmentos `..` ni rutas absolutas
- **AND** `git check-ignore --no-index -q -- packages/app/.ancleto/machine-env.md` devuelve éxito
  desde la raíz del repositorio
- **AND** `git add -A` ejecutado desde la raíz del repositorio no incorpora el artefacto
- **AND** `.gitignore` queda byte a byte sin cambios

#### Scenario: Proyecto alcanzado por un symlink a un subdirectorio

- **WHEN** se ejecuta `ancleto install --project <ruta-symlink>` donde la ruta es un symlink que
  apunta a un subdirectorio del repositorio y la exclusión aún no existe
- **THEN** se crea `.ancleto/machine-env.md` bajo ese subdirectorio
- **AND** la exclusión local contiene exactamente la entrada `<subdir>/.ancleto/machine-env.md`,
  sin segmentos `..` ni rutas absolutas
- **AND** `git check-ignore --no-index -q -- <subdir>/.ancleto/machine-env.md` devuelve éxito
  desde la raíz del repositorio
- **AND** `git add -A` ejecutado desde la raíz del repositorio no incorpora el artefacto
- **AND** `.gitignore` queda byte a byte sin cambios

#### Scenario: Proyecto sin git

- **WHEN** se ejecuta `ancleto install --project` en un directorio que no es repositorio git
- **THEN** se crea `.ancleto/machine-env.md`
- **AND** no se escribe ninguna regla de exclusión
- **AND** el comando reporta un warning no bloqueante sobre la exclusión

#### Scenario: Git no disponible

- **WHEN** el binario `git` no está disponible al generar el artefacto
- **THEN** se crea `.ancleto/machine-env.md`
- **AND** no se escribe ninguna regla de exclusión
- **AND** el comando reporta un warning no bloqueante sobre la exclusión

#### Scenario: Artefacto trackeado

- **WHEN** `.ancleto/machine-env.md` figura en `git ls-files`
- **THEN** `ancleto check` emite una advertencia que nombra el archivo
- **AND** el exit code de `check` no cambia por esa advertencia

#### Scenario: Artefacto trackeado con regla de exclusión existente

- **WHEN** `.ancleto/machine-env.md` fue incorporado con `git add -f` pero una regla ya ignora su
  path repo-root-relative
- **THEN** el ciclo de vida no agrega ni actualiza ninguna entrada de exclusión
- **AND** `git check-ignore --no-index` devuelve éxito
- **AND** `ancleto check` sigue advirtiendo que el artefacto está trackeado

#### Scenario: El bloque no contamina `AGENTS.md`

- **WHEN** se ejecuta `ancleto upgrade` sobre un `AGENTS.md` que no contiene anclas de bloques LOCKED nuevos
- **THEN** `AGENTS.md` no incorpora valores de la máquina detectada
- **AND** el bloque de entorno solo existe en `.ancleto/machine-env.md`

### Requirement: Generación y regeneración en el ciclo de vida

`ancleto init`, `ancleto install --project` y `ancleto upgrade` SHALL generar o regenerar
`.ancleto/machine-env.md` a partir de la detección local de la máquina. La regeneración SHALL
ser idempotente: con la misma máquina y la misma versión de ancleto, el contenido SHALL ser byte
a byte idéntico y el archivo NO SHALL reescribirse si no cambió. La regeneración SHALL ser no
destructiva: SHALL escribir únicamente el archivo del artefacto (`.ancleto/machine-env.md` bajo el
project root) y, cuando corresponda, la entrada exacta de la exclusión local descrita arriba, sin
modificar otros archivos. El archivo
es derivado y SHALL reemplazarse completo; no admite edición manual persistente. Si la
generación falla, el comando de ciclo de vida SHALL reportar un warning no bloqueante y
continuar. Si falla la exclusión local, el comando SHALL reportar un warning no bloqueante y
conservar el artefacto generado.

#### Scenario: Generación en `init`

- **WHEN** se ejecuta `ancleto init` en un proyecto sin `.ancleto/machine-env.md`
- **THEN** el archivo existe al terminar el comando
- **AND** contiene los campos mínimos declarados por el requirement de contenido

#### Scenario: Regeneración en `upgrade`

- **WHEN** cambió un hecho detectable de la máquina (por ejemplo, se instaló una herramienta de validación) y se ejecuta `ancleto upgrade`
- **THEN** el archivo regenerado refleja el hecho nuevo
- **AND** el resto del contenido se corresponde con el entorno actual

#### Scenario: Segunda corrida sin cambios

- **WHEN** `ancleto init` se ejecuta dos veces seguidas sin cambios en la máquina ni en la versión de ancleto
- **THEN** el contenido de `.ancleto/machine-env.md` no cambia entre corridas
- **AND** el archivo no se reescribe

#### Scenario: Fallo de generación no bloqueante

- **WHEN** la generación del bloque falla (por ejemplo, por permisos de escritura)
- **THEN** el comando de ciclo de vida reporta el problema en un warning
- **AND** no aborta el resto de la instalación

#### Scenario: Fallo de exclusión no bloqueante

- **WHEN** el artefacto se genera pero no se puede escribir la exclusión local
- **THEN** el comando de ciclo de vida reporta el problema en un warning
- **AND** conserva el artefacto generado
- **AND** no aborta el resto de la instalación

### Requirement: Contenido mínimo del bloque

`.ancleto/machine-env.md` SHALL declarar, como mínimo:

1. plataforma y sistema operativo (`win32`, `linux`, `darwin` u otro) con su release, y arquitectura;
2. shell detectado con la variante que cambia la sintaxis (Windows PowerShell 5.1, PowerShell 7,
   cmd, bash/Git Bash/MSYS, bash/WSL y shells POSIX reconocidos —bash, zsh, sh, dash—), con
   `unknown` cuando no se pueda determinar;
3. fin de línea esperado (CRLF o LF) y la fuente usada para determinarlo (`gitattributes`,
   `core.eol`, `core.autocrlf` o `platform-default`);
4. la lista fija de herramientas `rg`, `node`, `npm`, `git` y `python`, cada una con disponibilidad
   sí/no —entendida como resoluble e invocable, nunca solo por presencia en `PATH`— y sin versión;
5. para cada herramienta no disponible, su fallback en una línea, seguido de
   `— bloqueado: <fallo saneado>` cuando el intento de invocación observó un fallo real; el sufijo
   SHALL ser aditivo y NO SHALL alterar el prefijo, los campos ni su orden;
6. fecha de generación y versión de ancleto;
7. una nota que declare el bloque como pista de entorno y qué reportar si un comando falla por entorno.

Cuando un campo no pueda determinarse, salvo la disponibilidad de herramientas, el bloque SHALL
declararlo como desconocido en lugar de inventar un valor. El bloque NO SHALL contener secretos,
credenciales, tokens ni el valor de `PATH`, y NO SHALL incluir versiones de herramientas. Tampoco
SHALL declarar reglas de heredoc, quoting, `PATHEXT`, codepage ni otras variables de entorno.

El `<fallo saneado>` del sufijo `— bloqueado:` SHALL derivarse de la primera línea no vacía de
`stderr` del intento —o, si no la hubo, del error de arranque con su código— y SHALL estar libre de
secuencias ANSI/OSC y de caracteres de control, con los espacios colapsados y un máximo de 200
caracteres, de modo que el artefacto no incorpore texto de error sin acotar. La sonda NO SHALL
volcar la salida estándar del candidato en el bloque.

#### Scenario: Windows PowerShell 5.1

- **WHEN** el bloque se genera en Windows con Windows PowerShell 5.1 como shell detectado y sin
  configuración de git ni `.gitattributes` que indique otro fin de línea
- **THEN** declara la plataforma Windows y la variante `Windows PowerShell 5.1`
- **AND** declara CRLF como fin de línea esperado y su fuente
- **AND** enumera las cinco herramientas con disponibilidad

#### Scenario: PowerShell 7

- **WHEN** el bloque se genera en una sesión de PowerShell 7 cuyo `PSModulePath` contiene tanto el
  marcador legacy de Windows PowerShell como el de PowerShell 7
- **THEN** declara la variante `PowerShell 7`
- **AND** no la presenta como Windows PowerShell 5.1 ni como desconocida

#### Scenario: cmd

- **WHEN** el bloque se genera en una sesión de `cmd.exe` que define `PROMPT` y sin configuración
  de git ni `.gitattributes` que indique otro fin de línea
- **THEN** declara la variante `cmd`
- **AND** declara CRLF como fin de línea esperado y su fuente

#### Scenario: `.gitattributes` con `eol=lf` en Windows

- **WHEN** el bloque se genera en Windows y el path del artefacto tiene el atributo git `eol=lf`
- **THEN** declara LF como fin de línea esperado
- **AND** declara `gitattributes` como fuente

#### Scenario: Máquina POSIX o WSL

- **WHEN** el bloque se genera en Linux, macOS o WSL y sin configuración de git que indique otro fin de línea
- **THEN** declara la plataforma correspondiente y el shell POSIX o la variante WSL detectada
- **AND** declara LF como fin de línea esperado y su fuente

#### Scenario: Herramienta ausente

- **WHEN** una herramienta de la lista fija no está disponible en la máquina
- **THEN** el bloque la declara como no disponible
- **AND** incluye su fallback en una línea
- **AND** no la omite del conjunto de campos

#### Scenario: Sin versiones

- **WHEN** el bloque se genera con las herramientas disponibles
- **THEN** declara solo disponibilidad
- **AND** no emite la versión de ninguna herramienta

#### Scenario: Sin fuga de secretos

- **WHEN** el entorno del proceso contiene variables con credenciales o tokens
- **THEN** el bloque generado no contiene esos valores
- **AND** tampoco contiene el valor completo de `PATH`

#### Scenario: Fallo de invocación acotado y saneado

- **WHEN** el `stderr` observado de un candidato contiene secuencias ANSI, caracteres de control o
  una línea de más de 200 caracteres
- **THEN** el fallo incluido tras `— bloqueado:` contiene como máximo 200 caracteres de una sola
  línea
- **AND** no contiene secuencias ANSI ni caracteres de control
- **AND** no incluye la salida estándar del candidato

### Requirement: Sonda de invocabilidad de herramientas

La disponibilidad de cada herramienta de la lista fija SHALL determinarse invocando el candidato
resuelto en `PATH`, no solo por su presencia. Una herramienta SHALL declararse `disponible` solo
cuando un candidato invocado con una bandera de versión termina con éxito; un candidato que
resuelve pero no se puede invocar SHALL dejarla como no disponible aunque el archivo exista.

Cada intento de invocación SHALL estar acotado a 2 s y el conjunto de intentos de una corrida
SHALL estar acotado por un presupuesto acumulado de 10 s, de modo que una herramienta colgada no
bloquee `ancleto init`, `ancleto install --project` ni `ancleto upgrade`. Cada invocación de `git`
usada para determinar el fin de línea SHALL estar acotada a 5 s.

Cuando una herramienta resuelve en más de un archivo candidato (por ejemplo, por las extensiones
de `PATHEXT` en `win32`), el sistema SHALL sondearlos hasta obtener un veredicto y, si ninguno se
puede invocar, SHALL reportar el primer fallo real observado.

En `win32`, los candidatos `.cmd` y `.bat` SHALL sondearse a través del procesador de comandos
(`process.env.ComSpec`, o `cmd.exe` si no está definido) con `windowsVerbatimArguments`
habilitado; los candidatos que no son de batch SHALL lanzarse directamente, sin shell.

Un intento SHALL producir un veredicto interno de disponible, bloqueado —error de arranque, salida
distinta de cero o timeout— o no concluyente —error que describe al runtime y no a la herramienta,
como la guarda `EINVAL` de Node para shims de batch, o presupuesto agotado antes de sondear—. Un
veredicto no concluyente NO SHALL considerarse disponible: SHALL resolverse como `no disponible`,
sin agregar el sufijo `— bloqueado:`, de modo que el render siga siendo binario.

La sonda NO SHALL renderizar la versión observada ni su salida; la bandera de versión SHALL usarse
solo como criterio de invocabilidad.

#### Scenario: Resoluble pero no invocable

- **WHEN** una herramienta tiene un candidato en `PATH` cuyo intento de invocación falla con error
  de arranque, salida distinta de cero o timeout, y ningún otro candidato se invoca con éxito
- **THEN** el bloque la declara `no disponible` con su fallback
- **AND** agrega el sufijo `— bloqueado: <fallo saneado>`
- **AND** no la declara `disponible`

#### Scenario: Sonda de invocación acotada por timeout

- **WHEN** un candidato de una herramienta no termina dentro de los 2 s
- **THEN** el intento se abandona y la generación del artefacto continúa
- **AND** ese candidato no se declara `disponible`

#### Scenario: Sonda sin veredicto

- **WHEN** ningún candidato de una herramienta permite concluir su invocabilidad —el intento
  devuelve la guarda `EINVAL` de Node para shims de batch o el presupuesto acumulado de 10 s se
  agota antes de sondearlo—
- **THEN** la herramienta se declara `no disponible` con su fallback
- **AND** el bloque no agrega el sufijo `— bloqueado:`
- **AND** no se declara `disponible`

#### Scenario: Shim de batch en `win32`

- **WHEN** el único candidato resoluble de una herramienta en `win32` es un `.cmd` o `.bat` que
  responde con éxito a la bandera de versión
- **THEN** el candidato se invoca a través del procesador de comandos
- **AND** la herramienta se declara `disponible`
- **AND** el bloque no emite la versión observada

#### Scenario: Sondeo de fin de línea con `git` bloqueado

- **WHEN** una invocación de `git` usada para determinar el fin de línea no responde
- **THEN** la invocación se corta a los 5 s
- **AND** la detección continúa con la siguiente fuente o con `platform-default`
- **AND** la generación del artefacto no se bloquea

### Requirement: Origen y declaración del shell

El shell SHALL determinarse desde el entorno del proceso que ejecuta `ancleto init`, que puede no
ser el mismo que usa la tool de bash del runtime del agente. En Windows (`win32`), la detección
SHALL aplicar esta precedencia explícita:

1. `MSYSTEM` con un valor MSYS/MINGW o `CYGWIN` presente → `bash`; la fuente SHALL ser la variable
   que lo declaró.
2. `PSModulePath` con el marcador de PowerShell 7, aunque también contenga el marcador legacy →
   `PowerShell 7`; la fuente SHALL ser `PSModulePath`.
3. Sin señal MSYS/Cygwin ni marcador de PowerShell 7, `PROMPT` presente → `cmd`; la fuente SHALL
   ser `PROMPT`.
4. Sin las señales anteriores, `SHELL` de basename POSIX reconocido junto con el marcador legacy de
   Windows PowerShell → `unknown` por conflicto genuino.
5. Sin las señales anteriores, `SHELL` de basename POSIX reconocido → ese shell; la fuente SHALL
   ser `SHELL`.
6. Sin las señales anteriores, `PSModulePath` solo con el marcador legacy →
   `Windows PowerShell 5.1`; la fuente SHALL ser `PSModulePath`.
7. Sin señal positiva → `unknown`.

`ComSpec` NO SHALL usarse como evidencia del shell actual: está siempre definido en Windows y no
distingue el shell en ejecución. Por eso, un entorno que solo define `ComSpec` SHALL declarar
`unknown`. En POSIX, `WSL_DISTRO_NAME` o `WSL_INTEROP` → `bash/WSL`; si no, el basename de `SHELL`
cuando sea un shell POSIX reconocido; si no → `unknown`. El archivo SHALL declarar `shell_source`
con la variable ganadora (`MSYSTEM`, `CYGWIN`, `SHELL`, `PSModulePath`, `PROMPT`,
`WSL_DISTRO_NAME`, `WSL_INTEROP`) o `unknown`. No SHALL ejecutarse ningún shell para probar cuál
es.

#### Scenario: Señal consistente

- **WHEN** el entorno del proceso de `init` contiene una única señal positiva de shell
- **THEN** el archivo declara el shell detectado
- **AND** declara la variable de entorno usada como fuente

#### Scenario: Git Bash/MSYS en Windows

- **WHEN** el entorno de `init` en Windows define `SHELL` con bash, `MSYSTEM=MINGW64` y además
  hereda `ComSpec` y `PSModulePath`
- **THEN** el archivo declara `bash`
- **AND** declara `MSYSTEM` como fuente
- **AND** no declara `cmd` ni `Windows PowerShell 5.1`

#### Scenario: PowerShell 7 con marcadores heredados

- **WHEN** el entorno de `init` en Windows tiene un `PSModulePath` que incluye tanto el marcador
  legacy de Windows PowerShell como el de PowerShell 7
- **THEN** el archivo declara `PowerShell 7`
- **AND** declara `PSModulePath` como fuente
- **AND** no declara `unknown` ni `Windows PowerShell 5.1`

#### Scenario: Windows PowerShell 5.1 con solo el marcador legacy

- **WHEN** el entorno de `init` en Windows solo contiene el marcador legacy en `PSModulePath` y no
  define `MSYSTEM`, `CYGWIN`, `SHELL`, `PROMPT` ni el marcador de PowerShell 7
- **THEN** el archivo declara `Windows PowerShell 5.1`
- **AND** declara `PSModulePath` como fuente

#### Scenario: Solo ComSpec

- **WHEN** el entorno de `init` en Windows define `ComSpec` y ninguna otra señal positiva de shell
- **THEN** el archivo declara `unknown`
- **AND** no declara `cmd`

#### Scenario: Conflicto genuino entre SHELL y PowerShell 5.1

- **WHEN** el entorno de `init` en Windows define `SHELL` con un shell POSIX y el marcador legacy
  de Windows PowerShell en `PSModulePath`, sin `MSYSTEM`, `PROMPT` ni marcador de PowerShell 7
- **THEN** el archivo declara `unknown`
- **AND** declara la fuente como desconocida
- **AND** no elige bash ni Windows PowerShell 5.1

#### Scenario: Sin señal

- **WHEN** el entorno del proceso de `init` no contiene ninguna señal positiva de shell, aunque
  `ComSpec` esté definido
- **THEN** el archivo declara `unknown`
- **AND** declara la fuente como desconocida

### Requirement: Entrega a todos los subagentes y precedencia

Toda definición de agente instalada SHALL contener la instrucción canónica de leer
`.ancleto/machine-env.md` antes de ejecutar comandos, con el comportamiento a seguir si el
archivo no existe: continuar con la guía genérica y reportar la ausencia. Esta instrucción
SHALL ser genérica y NO SHALL contener valores de la máquina. Esa instrucción canónica SHALL
incluir además la regla genérica de precedencia: el bloque prevalece sobre indicaciones genéricas
de shell y nunca sobre seguridad, autorización, validación, permisos o instrucciones explícitas
del usuario.

El orquestador SHALL incluir el contenido del bloque en toda delegación a un subagente cuya
definición habilite la ejecución de comandos, de modo que el entorno llegue al ejecutor y no
solo al orquestador. La sección `## Hint` del artefacto SHALL incluir la misma regla genérica de
precedencia, sin valores de máquina.

El bloque SHALL tratarse como una pista de entorno: si un comando falla por una causa de
entorno, el subagente SHALL reportar el shell declarado y el comando textual en lugar de
reintentar a ciegas con otra sintaxis.

La entrega SHALL ser redundante por dos vías: la instrucción en las definiciones de agente y la
inclusión del bloque en la delegación. El contenido se lee en runtime, por lo que el cache de
definiciones de agentes SHALL afectar solo a la instrucción y no al contenido: regenerar el
artefacto no requiere reinstalar las definiciones.

Ante un conflicto entre el bloque de entorno y una indicación genérica de shell (en `AGENTS.md`,
`PRODUCT.md` o el prompt del agente), SHALL prevalecer el bloque de entorno. El bloque NO SHALL
prevalecer sobre reglas de seguridad, autorización, validación, permisos ni instrucciones
explícitas del usuario.

#### Scenario: Definiciones de agente con la referencia

- **WHEN** se instalan los assets de agente en cualquier host soportado
- **THEN** cada definición de agente instalada referencia `.ancleto/machine-env.md`
- **AND** declara la conducta a seguir cuando el archivo no existe
- **AND** incluye la regla genérica de precedencia del bloque sobre indicaciones genéricas de
  shell
- **AND** ningún valor detectado de la máquina aparece en esas definiciones

#### Scenario: Hint del bloque con precedencia

- **WHEN** el artefacto se genera
- **THEN** su sección `## Hint` declara que el bloque prevalece sobre indicaciones genéricas de
  shell
- **AND** declara que nunca prevalece sobre seguridad, autorización, validación, permisos ni
  instrucciones explícitas del usuario
- **AND** no contiene valores de la máquina

#### Scenario: Delegación a un subagente que ejecuta comandos

- **WHEN** el orquestador delega una tarea a un subagente cuya definición habilita `bash`
- **THEN** la delegación incluye el bloque de entorno de la máquina
- **AND** el subagente no necesita inferir el shell ni las herramientas disponibles

#### Scenario: Subagente sin ejecución de comandos

- **WHEN** el orquestador delega una tarea a un subagente cuya definición no habilita `bash`
- **THEN** la delegación no necesita incluir el bloque de entorno

#### Scenario: Fallo por entorno

- **WHEN** un comando falla por una causa atribuible al entorno de ejecución
- **THEN** el subagente reporta el shell declarado y el comando textual
- **AND** no reintenta con una sintaxis alternativa sin declararlo

#### Scenario: Definiciones cacheadas

- **WHEN** las definiciones de agente se cargaron al inicio de la sesión y luego se regenera `.ancleto/machine-env.md`
- **THEN** una lectura posterior del archivo devuelve el contenido actual
- **AND** no se requiere reinstalar las definiciones

#### Scenario: Conflicto con una indicación genérica de shell

- **WHEN** una indicación genérica sugiere un shell o una invocación distinta de la declarada en el bloque de la máquina
- **THEN** el subagente usa la forma declarada en el bloque de la máquina

#### Scenario: Conflicto con una salvaguarda

- **WHEN** el bloque de la máquina contradice una regla de seguridad, validación o una instrucción explícita del usuario
- **THEN** prevalece la salvaguarda o la instrucción del usuario
- **AND** el subagente reporta la discrepancia en lugar de aplicarla en silencio

### Requirement: Independencia del working-context y del techo de lecturas

El bloque de entorno de máquina NO SHALL formar parte del render de `.ancleto/working-context.md`
ni SHALL consumir su presupuesto de tokens. La generación del bloque SHALL escribirlo completo con
todos los campos mínimos aunque el working-context esté truncado o vacío. Una escritura de memoria
del proyecto NO SHALL modificar `.ancleto/machine-env.md`. El render y la frescura del
working-context SHALL conservar su comportamiento actual.

La lectura de `.ancleto/machine-env.md` por parte del orquestador NO SHALL contar contra el techo
de tres lecturas de repositorio declarado en su contrato. El contrato del orquestador SHALL
declarar explícitamente que las lecturas de `.ancleto/working-context.md` (`## Project Memory
Rules`) y de `.ancleto/machine-env.md` (`## Machine Environment`) no consumen ese techo.

#### Scenario: Working-context truncado

- **WHEN** el working-context se renderiza con un presupuesto de tokens insuficiente y emite su warning de truncado
- **THEN** `.ancleto/machine-env.md` contiene todos los campos mínimos
- **AND** no incluye ningún marcador de truncado

#### Scenario: Escritura de memoria

- **WHEN** se registra o supersede una regla o decisión en la memoria del proyecto
- **THEN** `.ancleto/machine-env.md` conserva su contenido sin cambios

#### Scenario: Techo de lecturas

- **WHEN** el orquestador ya leyó tres archivos de repositorio y necesita el entorno de la máquina
- **THEN** puede leer `.ancleto/machine-env.md` sin exceder el techo
- **AND** no necesita delegar esa lectura a otro agente

#### Scenario: Declaración del techo en el contrato

- **WHEN** el contrato del orquestador declara el techo de tres lecturas
- **THEN** nombra explícitamente `## Project Memory Rules` y `## Machine Environment` como lecturas
  que no lo consumen

#### Scenario: Working-context sin cambios

- **WHEN** se compara el render de `.ancleto/working-context.md` antes y después de incorporar el bloque de entorno
- **THEN** el contenido derivado de la memoria y la topología es el mismo

### Requirement: Medición de mejora con `ancleto stats failures`

La mejora SHALL evaluarse con el reporte existente, en el mismo alcance por `session.directory`
del proyecto y con el mismo comando de línea base registrado en el proposal. La ventana
post-change SHALL acotarse con `--since <fecha>` y SHALL contabilizar solo sesiones nuevas. Se
considera mejora cuando, con al menos 10 sesiones en la ventana, los fallos `env` son menores o
iguales a 32 por 100 sesiones (mitad de la línea base de 68 fallos `env` en 105 sesiones) y los
esqueletos `rg` y `node` dejan de aparecer como grupos `env`. Se considera fracaso superar ese
umbral o incorporar un esqueleto `env` nuevo ausente en la línea base. Con menos de 10 sesiones
la medición es inconclusa y no se declara mejora ni fracaso.

#### Scenario: Ventana post-change suficiente

- **WHEN** existen al menos 10 sesiones nuevas en la ventana `--since` y se ejecuta el reporte de fallos `env`
- **THEN** se calcula la tasa de fallos `env` por 100 sesiones
- **AND** se compara con el umbral de 32 por 100 sesiones
- **AND** se informa si la mejora se cumple o no, junto con los esqueletos observados

#### Scenario: Ventana insuficiente

- **WHEN** la ventana `--since` contiene menos de 10 sesiones
- **THEN** el resultado se reporta como inconcluso
- **AND** no se declara mejora ni fracaso

#### Scenario: Reincidencia de un binario ausente

- **WHEN** un esqueleto `env` de la línea base (`rg` o `node`) vuelve a aparecer en la ventana post-change
- **THEN** la medición no se considera una mejora aunque la tasa global esté por debajo del umbral
