# Design: machine-environment-block

## Contexto y restricciones

- Paquete `@ancleto/spec`: CLI ESM sin dependencias de runtime, Node ≥ 24, entry point
  `src/cli/index.js`.
- El contrato de `working-context.js` es el patrón a reusar: dueño único del artefacto derivado,
  helper de path, contenido canónico con `\n` final, comparación tolerante, refresh
  best-effort en el ciclo de vida y lectura advisory desde `check`/`doctor`.
- El framework **no gestiona el `.gitignore`** del consumidor (`README.md:218`). La exclusión
  del artefacto debe ser local al clon.
- No se agrega un bloque LOCKED nuevo a `templates/AGENTS.md`: `mergeLocked`
  (`src/cli/index.js:1393-1418`) inserta bloques nuevos al final o antes del siguiente LOCKED
  del `AGENTS.md` del consumidor, incluso si el bloque no existía. La instrucción genérica va
  en las definiciones de agente, que no se mergean de esa forma.
- La capacidad no existe hoy en `aspec/specs/`: este change la agrega completa (no hay delta
  contra un spec previo).

## Decisiones de diseño

### D1 — Dueño único: `src/core/machine-env.js`

Un módulo nuevo concentra detección, render, escritura y exclusión. Ni `init`/`install`/
`upgrade` ni `check` reimplementan formato o comparación.

Superficie exportada (nombres, no código):

| Export | Responsabilidad |
|---|---|
| `machineEnvPath(projectRoot)` | Path canónico `.ancleto/machine-env.md` |
| `detectMachineFacts(overrides?)` | Hechos observados (plataforma, shell, EOL, tooling) |
| `renderMachineEnv(facts, { generatedAt })` | Texto canónico, `\n`, sin secretos |
| `writeMachineEnv(projectRoot, facts)` | Compara y escribe solo si cambió |
| `ensureMachineEnvExclusion(projectRoot)` | Verifica/agrega la exclusión local |
| `materializeMachineEnv(projectRoot)` | Orquesta detección → render → escritura → exclusión |
| `checkMachineEnvTracked(projectRoot)` | Lectura read-only para `ancleto check` |

El CLI importa el módulo en `src/cli/index.js`. `materializeMachineEnv` se llama desde un helper
`refreshMachineEnv` análogo a `refreshWorkingContext` (`:2163-2180`), reutilizado por `install`
(`:1607`), `upgrade` (`:1687`) y `init` (`:1827`). `check` solo usa `checkMachineEnvTracked`
junto a `checkTierOrphan` (`:2480`), para no duplicar ni el render ni la lógica de git.

`overrides` existe únicamente como costura de test (snapshot de `process.platform`,
`process.env` y entradas de `PATH`); en producción se omite y se lee el proceso. No es una
interfaz de configuración ni se expone en CLI.

### D2 — Detección de hechos

- **Plataforma**: `process.platform`, `os.release()`, `process.arch`.
- **Shell**: se detecta desde el entorno del proceso que ejecuta `init`, no desde la tool de
  bash del runtime. `win32` aplica esta precedencia explícita:
  1. `MSYSTEM` con valor MSYS/MINGW (`MINGW64`, `MINGW32`, `MSYS`, `UCRT64`, `CLANG64`, …) o
     `CYGWIN` presente → `bash`; fuente `process.env.MSYSTEM` o `process.env.CYGWIN`.
  2. `PSModulePath` con marcador `PowerShell/7` (o `PowerShell\7`) → `PowerShell 7`, **aunque
     también** contenga el marcador legacy `WindowsPowerShell` (una sesión PS7 estándar incluye
     ambos). Fuente `process.env.PSModulePath`.
  3. Sin señal MSYS/Cygwin ni marcador PS7, `PROMPT` presente → `cmd`; fuente
     `process.env.PROMPT`.
  4. Sin las señales anteriores, `SHELL` POSIX reconocido **y** marcador legacy
     `WindowsPowerShell` en `PSModulePath` → `unknown` (conflicto genuino; un Git Bash real
     siempre define `MSYSTEM`, así que este caso no es el de Git Bash).
  5. Sin las señales anteriores, `SHELL` con basename POSIX reconocido → ese shell; fuente
     `process.env.SHELL`.
  6. Sin las señales anteriores, `PSModulePath` solo con el marcador legacy →
     `Windows PowerShell 5.1`; fuente `process.env.PSModulePath`.
  7. Sin señal positiva → `unknown`.
  `ComSpec` no se lee: está siempre definido en Windows y no distingue el shell en ejecución, así
  que no se usa como evidencia ni solo ni combinado. `PROMPT` es la señal positiva de `cmd`
  (cmd.exe la define en su propio proceso), por eso gana sobre un `PSModulePath` legacy que puede
  ser una variable de máquina heredada; `MSYSTEM`/`CYGWIN` y el marcador PS7 siguen teniendo mayor
  precedencia. Limitación declarada: un shell anidado puede conservar variables del proceso padre
  (p. ej. `powershell` lanzado desde Git Bash conserva `MSYSTEM`, o PowerShell 5.1 lanzado desde
  cmd conserva `PROMPT`) y declarar la familia del padre; no se resuelve con árbol de procesos.
  Limitación conocida adicional: un `PROMPT` persistido a nivel usuario o máquina (no definido por
  la sesión actual) puede declarar `cmd` en una sesión PowerShell. El archivo declara la fuente
  (`PROMPT`), por lo que no afirma un shell sin fuente, pero el valor puede ser incorrecto; se
  cubre en el dogfooding y no cambia la precedencia exigida.
- POSIX: `WSL_DISTRO_NAME` o `WSL_INTEROP` → `bash/WSL`; si no, basename de `SHELL` cuando
  sea un shell POSIX reconocido (`bash`, `zsh`, `sh`, `dash`); si no → `unknown`.
- `shell_source` nombra la variable ganadora (`MSYSTEM`, `CYGWIN`, `SHELL`, `PSModulePath`,
  `PROMPT`, `WSL_DISTRO_NAME`, `WSL_INTEROP`) o `unknown`.
- No se ejecuta ningún shell para "probar" cuál es: la ausencia o contradicción se reporta
  como `unknown`.
- **Fin de línea**: si hay repo git y binario, primero se consulta el atributo git del path del
  artefacto con `git -C <projectRoot> check-attr eol -- .ancleto/machine-env.md`; un valor `lf` o
  `crlf` produce ese EOL con fuente `gitattributes`. Si el atributo es `unspecified`/`unset` o el
  comando falla, se lee `core.eol` (`crlf`/`lf`) y, si no está, `core.autocrlf` (`true` →
  `crlf`; `input`/`false` → `lf`). Sin git o sin configuración: convención de plataforma
  (`win32` → `crlf`, resto → `lf`). `eol_source` declara `gitattributes`, `core.eol`,
  `core.autocrlf` o `platform-default`.
- **Tooling**: lista fija y ordenada `rg`, `node`, `npm`, `git`, `python`. Disponibilidad por
  búsqueda en `PATH` (en Windows con `PATHEXT`) y comprobación de acceso al ejecutable; no se
  ejecutan binarios ni se piden versiones. La comprobación de acceso (`isExecutableFile`) usa el
  `platform` inyectado en `detectMachineFacts`, no `process.platform` directamente, para que la
  costura de test controle también `X_OK`. Cada ausente se renderiza con su fallback fijo:

  | Herramienta | Fallback declarado |
  |---|---|
  | `rg` | `Select-String` (PowerShell) o `grep -R` (POSIX) |
  | `node` | `nodejs` o el binario absoluto del runtime |
  | `npm` | `pnpm`/`yarn` si existen; si no, sin fallback |
  | `git` | sin fallback (reportar) |
  | `python` | `python3` (POSIX) o `py` (Windows) |

  El fallback es texto informativo: no se valida su disponibilidad para no ampliar alcance.
- **Lista blanca de entorno**: solo se leen `MSYSTEM`, `CYGWIN`, `SHELL`, `PSModulePath`,
  `PROMPT`, `WSL_DISTRO_NAME`, `WSL_INTEROP`, `PATHEXT` y `PATH` (este último solo para resolver
  ejecutables; su valor nunca se imprime). `ComSpec` no se lee. Cualquier variable señuelo queda
  fuera.
- **Fecha y versión**: `generated_at` ISO y versión de `package.json` (misma fuente que
  `packageVersion`, `:108`).

### D3 — Formato del artefacto

Encabezado y secciones fijas, en este orden:

1. Título y aviso de artefacto derivado/no editable, con `generated_at`, versión de ancleto y
   la declaración de que el shell proviene del proceso de `init`.
2. Plataforma, OS release y arquitectura.
3. Shell y `shell_source`.
4. Fin de línea y `eol_source`.
5. Herramientas: una línea por herramienta de la lista fija, con `disponible`/`no disponible`
   y, si falta, `fallback: …`.
6. Nota de pista: el bloque orienta el shell, el EOL y el tooling; si un comando falla por
   entorno hay que reportar el shell declarado y el comando textual; prevalece sobre indicaciones
   genéricas de shell (en `AGENTS.md`, `PRODUCT.md` o el prompt de un agente) y nunca sobre
   seguridad, autorización, validación, permisos ni instrucciones explícitas del usuario. La nota
   no contiene valores de máquina.

Sin versiones de herramientas, sin `PATH`, sin secretos, sin heredoc/quoting, sin `PATHEXT`
renderizado y sin volcar el entorno. Se escribe con `\n` y salto final, igual que
`writeWorkingContextBlock` (`working-context.js:41-47`).

### D4 — Idempotencia y no destrucción

`writeMachineEnv` lee el archivo existente (si existe), normaliza CRLF/espacios finales y
compara el render nuevo **ignorando la línea `generated_at`**. Si el resto es igual, no
reescribe: se conserva el `generated_at` original y el mtime. Si cambió un hecho o la versión
de ancleto, reescribe todo el archivo con un `generated_at` nuevo. Consecuencia documentada en
el propio archivo: `generated_at` es la fecha del último cambio de hechos, no la de la última
corrida.

La escritura es directa (mismo patrón sincrónico que `working-context.js`), no toca otros
archivos y no crea el artefacto si la detección o el render fallan. Cualquier error se captura
en `refreshMachineEnv` y se emite como `console.warn` no bloqueante.

### D5 — Exclusión local del clon (relativa a la raíz del repo)

`ensureMachineEnvExclusion(projectRoot)`:

1. Comprobar repo git: `git -C <projectRoot> rev-parse --is-inside-work-tree`. Si falla por ENOENT
   (git no instalado) o por no ser repo, advertir "no se pudo garantizar la exclusión" y
   terminar sin escribir nada.
2. Resolver la raíz real del worktree con `git -C <projectRoot> rev-parse --show-toplevel`.
   Si falla, warning y terminar.
3. Derivar el prefijo del project root respecto de esa raíz con
   `git -C <projectRoot> rev-parse --show-prefix` (vacío si el project root es la raíz; con `/`
   final cuando no lo es, p. ej. `packages/app/`). Componer el patrón repo-root-relative como
   `<prefix>.ancleto/machine-env.md`, normalizando separadores a `/`. Ese string es el patrón
   exacto (p. ej. `packages/app/.ancleto/machine-env.md` cuando `--project packages/app`).
   **No se usa `path.relative(repoRoot, artifactPath)`**: es lexical y, cuando `--project` recibe
   un symlink que apunta dentro del repo, `--show-toplevel` devuelve la ruta física y el resultado
   arranca con `..`; la guarda lo descartaría y el artefacto quedaría sin ignorar. `--show-prefix`
   resuelve symlinks y worktrees vinculados porque git normaliza el cwd contra la raíz del
   worktree. Si `--show-prefix` falla, o el resultado es absoluto o empieza con `..`, warning que
   describe la falla real —sin afirmar que el artefacto está "fuera del repositorio" cuando el
   path compuesto es relativo— y terminar sin escribir. El recorte de las salidas de git elimina
   solo el salto de línea final (`\n` o `\r\n`) y **no** los espacios iniciales: un project root
   cuyo nombre empieza con espacio produce un prefijo que empieza con ese espacio y el patrón lo
   conserva. Un prefijo que contenga `\r` o `\n` (posible en POSIX con un nombre de directorio que
   incluya salto de línea) es inválido: warning y sin escritura, para que ningún nombre de
   directorio pueda agregar líneas extra a `info/exclude`. El mismo recorte de solo salto final
   aplica a `--show-toplevel` y `--git-path info/exclude`.
4. Comprobar reglas con `git -C <repoRoot> check-ignore --no-index -q -- <pattern>`. Exit 0 → ya
   está ignorado (incluido el caso de un archivo trackeado con `git add -f` que igual matchea una
   regla); no se modifica ninguna regla. Exit 1 → continuar. Otro exit o error → warning.
5. Resolver la ruta con `git -C <repoRoot> rev-parse --git-path info/exclude` y absolutizarla
   contra `repoRoot` si viene relativa. **No** se asume `.git/info/exclude`: en un worktree
   vinculado `.git` es un archivo y `--git-path` devuelve la ruta correcta del directorio común.
6. Leer el archivo de exclusión (crear el directorio padre si falta). Si ya contiene una línea
   cuya forma recortada es exactamente `<pattern>`, no escribir.
7. Si no está, agregar una sola línea `<pattern>` al final, preservando byte a byte el contenido
   previo y sin reordenar ni eliminar entradas. Si el archivo no termina en salto de línea, se
   agrega uno antes de la entrada.
8. Re-verificar **después de escribir** con
   `git -C <repoRoot> check-ignore --no-index -q -- <pattern>`. `ignored` es `true` solo si la
   verificación da exit 0; `updated` es `true` solo si se agregó la línea en esta corrida **y** la
   verificación da exit 0. Si la verificación falla, warning, `ignored=false`, `updated=false` y
   no se reporta la exclusión como garantizada.
9. Cualquier error de lectura/escritura o un exit code inesperado de git → warning no bloqueante;
   el artefacto ya generado se conserva.

Si el paso 4 devuelve exit 0 no se escribe ni se re-verifica: la regla ya existe y la comprobación
inicial es la verificación. La comprobación usa siempre `--no-index`; el trackeo real se consulta
aparte con `ls-files`.

`checkMachineEnvTracked(projectRoot)` usa
`git -C <projectRoot> ls-files --error-unmatch -- .ancleto/machine-env.md`. El pathspec es relativo
al `projectRoot` (git lo resuelve contra el cwd), así que sigue funcionando con `--project
<subdir>`; `--no-index` no afecta esta comprobación. Exit 0 → el artefacto está trackeado: `check`
emite `⚠ … (trackeado)` en la misma lista de warnings que `checkTierOrphan`, sin alterar el exit
code. Git ausente o directorio sin repo → no emite nada.

Por qué no se escribe `.gitignore`: la política del README lo prohíbe y el archivo es
compartido/versionado. La exclusión local cumple el mismo objetivo, no se commitea y se
regenera en cada clon. El patrón repo-root-relative es obligatorio: un patrón fijo
`.ancleto/machine-env.md` no matchea `<subdir>/.ancleto/machine-env.md` porque `info/exclude`
resuelve sus patrones contra la raíz del repo, no contra el project root. El patrón se deriva con
`--show-prefix` y no con `path.relative` para que una ruta provista por symlink no produzca `..`.

### D6 — Instrucción en definiciones de agente y orquestador

- **Definiciones de agente** (`agents/*.md`, las 10): se agrega el mismo párrafo canónico,
  genérico y sin valores de máquina, junto a la instrucción existente de leer `AGENTS.md`.
  Texto canónico propuesto:

  > Before running any command, read `.ancleto/machine-env.md` if it exists and use it as the
  > environment hint for shell, line endings, and tool availability. If it does not exist,
  > continue with the generic guidance and report its absence. If a command fails because of
  > the environment, report the declared shell and the exact command instead of retrying
  > blindly with different syntax. This hint prevails over generic shell guidance in
  > `AGENTS.md`, `PRODUCT.md`, or an agent prompt, but never overrides security, authorization,
  > validation, permissions, or explicit user instructions.

  Es genérico: no incluye plataforma, shell, EOL ni herramientas detectadas. Los adaptadores
  de host lo copian verbatim, así que todos los hosts soportados lo reciben.
- **Orquestador** (`agents/orchestrator.md`): sección nueva `## Machine Environment` después de
  `## Project Memory Rules`. Reglas:
  - Leer `.ancleto/machine-env.md` una vez por sesión/tarea cuando la delegación vaya a
    habilitar comandos; releer solo si se ejecutó un comando de ciclo de vida que lo regenera.
  - **La lectura no cuenta contra el techo de tres lecturas** de repositorio. Se declara
    explícito para que no compita con el gate de `@technical-discovery`. Además, la sección
    `Repository Reading Limit` y la lista `NEVER` de `PROHIBITED ACTIONS` deben nombrar
    explícitamente que `## Project Memory Rules` y `## Machine Environment` no consumen el techo
    (las líneas actuales son absolutas y no lo aclaran).
  - Incluir el bloque verbatim en toda delegación a un subagente con `bash: true`:
    `@coder`, `@tester`, `@documenter`, `@context-resolver`, `@technical-discovery`,
    `@technical-seed-writer`. No incluirlo en `@spec-writer`, `@reviewer` ni
    `@memory-keeper` (sin `bash`).
  - No parafrasear ni re-resumir el bloque: se pasa tal cual, una sola vez por delegación.
  - Si el archivo no existe, omitirlo y anotar la ausencia; no generarlo desde el orquestador.
  - Declarar la ventaja de las dos vías: el contenido se lee en runtime, así que el cache de
    definiciones de agentes solo afecta a la instrucción; regenerar el artefacto no exige
    reinstalar ni reiniciar para que una lectura posterior vea el contenido nuevo.
- **`templates/AGENTS.md`**: sin cambios. La instrucción canónica queda en las definiciones de
  agente; agregar un LOCKED nuevo al template dispararía la inserción de `mergeLocked` en el
  `AGENTS.md` de todos los consumidores, con churn y sin beneficio (el template no se lee como
  contrato de ejecución de subagentes).

### D7 — Ciclo de vida y mensajes

`refreshMachineEnv(projectDir)` devuelve `{ written, ignored, updated, warnings }` y nunca lanza.
`ignored` se deriva de la re-verificación posterior con `check-ignore --no-index`; `updated` es
`true` solo si se agregó la entrada en esta corrida **y** la re-verificación pasó. Un fallo de
verificación produce warning e `ignored=false`; nunca se reporta una exclusión no verificada.
Mapeo de mensajes:

- `upgrade`: línea `✔ machine-env.md generado|sin cambios` junto a la de `working-context.md`;
  además, `✔ exclusión local verificada|actualizada` solo cuando la re-verificación pasó, o el
  warning correspondiente.
- `init` / `install --project`: silencio en el camino feliz; solo warnings.
- Warnings en español, con el path nombrado, sin abortar el comando.

Orden dentro de cada lifecycle: `refreshWorkingContext(projectDir)` y `refreshMachineEnv`
son independientes; se llaman consecutivos y cada uno captura sus errores.

### D8 — Estrategia de tests

Archivos:

- **`test/machine-env.test.js`** (unitario; los casos de EOL que usan git se saltean si `git`
  falta):
  - render determinista con hechos fijos y `generatedAt` fijo: dos renders idénticos;
  - orden fijo de herramientas y línea de fallback por cada ausente;
  - sin versiones de herramientas y sin valores de variables señuelo;
  - shell win32 simulado: Git Bash/MSYS (`SHELL=/bin/bash` + `MSYSTEM=MINGW64` +
    `ComSpec`/`PSModulePath` heredados) → `bash` con fuente `MSYSTEM`, nunca `cmd` ni
    `Windows PowerShell 5.1`;
  - shell win32: `PSModulePath` con marcadores PS7 y legacy → `PowerShell 7`; solo legacy, sin
    `PROMPT`/`SHELL` → `Windows PowerShell 5.1`;
  - shell win32: `SHELL` POSIX + marcador legacy sin `MSYSTEM`/`PROMPT`/PS7 → `unknown`; solo
    `ComSpec` → `unknown`; sin señales → `unknown`;
  - `isExecutableFile` respeta el `platform` inyectado: archivo sin bit de ejecución con
    `platform: 'linux'` → no disponible y con `platform: 'win32'` → disponible (aserción
    condicional a un host no-win32, porque Windows no distingue `X_OK`);
  - `writeMachineEnv` no reescribe si solo cambia `generated_at` (mtime intacto) y sí reescribe
    cuando cambia un hecho o la versión.
- **`test/cli.test.js`** (integración, extiende los helpers `withDir`/`run` existentes):
  - `init` en directorio sin git: artefacto, secciones mínimas, warning de exclusión, sin
    `.gitignore`;
  - repo git con `.ancleto/` no ignorado: `git check-ignore --no-index` OK, `.gitignore`
    intacto, `git ls-files` sin el archivo;
  - repo con `.ancleto/` ya ignorado: exclusión y `.gitignore` byte a byte sin cambios;
  - dos corridas: contenido y mtime iguales;
  - `upgrade` con un `rg` falso en `PATH`: el hecho pasa a disponible;
  - `PATH` sin `git`: warning y artefacto conservado;
  - `git add -f` del artefacto: `check` advierte y mantiene exit code;
  - `.ancleto/machine-env.md` como directorio: warning no bloqueante y exit 0;
  - worktree vinculado real (`git init`, commit, `git worktree add`): `check-ignore --no-index`
    OK y la línea exacta en la ruta de `git rev-parse --git-path info/exclude`;
  - proyecto en subdirectorio real: `install --project packages/app`, patrón
    `packages/app/.ancleto/machine-env.md` en `info/exclude`, `check-ignore --no-index` exit 0,
    `git add -A` desde la raíz no incorpora el artefacto y `.gitignore` queda intacto;
  - proyecto alcanzado por un symlink a un subdirectorio (`link -> packages/app`):
    `install --project link`, patrón `packages/app/.ancleto/machine-env.md` sin `..` en
    `info/exclude`, `check-ignore --no-index` exit 0 desde la raíz, `git add -A` no incorpora el
    artefacto y `.gitignore` queda intacto; se saltea si el host no permite crear symlinks;
  - guarda de prefijo: el único test existente cubre project root fuera de cualquier repo
    (`rev-parse --is-inside-work-tree` falla), que advierte, no escribe regla y conserva el
    artefacto. Los branches de `--show-prefix` fallido, resultado absoluto o que empieza con `..`
    son defensivos y no alcanzables sin interceptar git: **gap de cobertura declarado**, no se
    afirma cobertura. La tarea 12.6 agrega el hardening del recorte y su prueba con un project
    root cuyo nombre empieza con espacio (o el gap si el host no lo permite) y con prefijo que
    contiene `\r`/`\n` en hosts que admiten ese nombre (o gap declarado);
  - artefacto trackeado con `git add -f` pero ya cubierto por una regla: la comprobación
    `check-ignore --no-index` da exit 0 y el ciclo no agrega ni actualiza la exclusión, mientras
    `check` sigue advirtiendo el trackeo;
  - `.gitattributes` con `eol=lf`: `detectMachineFacts({ platform: 'win32', cwd: repo })` declara
    LF y fuente `gitattributes`, por encima de `core.eol`, `core.autocrlf` y el default CRLF de
    Windows; el test corre en cualquier host con git;
  - entorno sin señales de shell: `unknown`, sin adivinar;
  - variables señuelo (`TOKEN`, `AWS_SECRET_ACCESS_KEY`) y `PATH` con marcador único: no
    aparecen en el contenido;
  - Los tests que dependen de git se saltean con `t.skip` si `git --version` no está
    disponible; el resto corre siempre.
- **`test/content-guards.test.js`** (guardas de contenido):
  - las 10 definiciones de `agents/*.md` contienen `.ancleto/machine-env.md`, la conducta ante
    ausencia, la regla genérica de precedencia (prevalece sobre indicaciones genéricas de shell;
    nunca sobre seguridad, autorización, validación, permisos ni instrucciones del usuario) y
    ningún valor de máquina (p. ej. `win32`, `crlf`, rutas absolutas);
  - el render del artefacto contiene la misma regla de precedencia en `## Hint` y no incluye
    valores de máquina;
  - `agents/orchestrator.md` contiene `## Machine Environment`, la exención del techo de tres
    lecturas, la mención explícita de `## Project Memory Rules` y `## Machine Environment` como
    lecturas que no consumen el techo, y la lista de subagentes con `bash: true`;
  - ninguna definición de agente ordena escribir `.gitignore`.

Los tests existentes que hoy esperan `unknown` para un `PSModulePath` con ambos marcadores, o
que buscan el patrón fijo `.ancleto/machine-env.md`, se actualizan a la nueva expectativa
(`PowerShell 7` y patrón repo-root-relative).

Comandos declarados en `PRODUCT.md` → `## Project Commands` (no se inventan):

- Lint: `npm run lint`.
- Tests acotados durante el trabajo:
  `node --test "test/machine-env.test.js" "test/cli.test.js" "test/content-guards.test.js"`.
- Suite completa: `npm test`.
- Frontmatter/keywords: `node src/cli/index.js specs check --change machine-environment-block`.
- Format: `not-configured` (el repo no declara formatter).
- Typecheck: no aplica (JavaScript ESM sin `tsconfig.json`).

Prueba empírica obligatoria del worktree y del symlink: los tests crean un worktree vinculado real
y un symlink a un subdirectorio, y verifican que la exclusión aplica; no se acepta solo la
inspección de la ruta.

### D9 — Evidencia de backlog y dogfooding

- `BACKLOG.md`, sección "Detectado en auditoría de 9 sesiones", ítem 13: agregar una línea de
  evidencia que cite `machine-environment-block`. El caso muestra una regla de entorno stale
  (shell/tooling de la máquina) que ningún mecanismo detectaba ni refrescaba; es exactamente
  la clase de drift que el ítem 13 quiere detectar.
- Dogfooding: las definiciones de agente se cachean al inicio de la sesión. Antes de probar el
  comportamiento en este repo hay que correr `ancleto upgrade` y **reiniciar la sesión**; el
  dogfooding dentro de la sesión que creó el change no es evidencia válida.

## Flujo

1. `init` / `install --project` / `upgrade` → `materializeMachineEnv`.
2. Detección con lista blanca → render canónico → comparación (sin `generated_at`) → escritura
   solo si cambió.
3. `ensureMachineEnvExclusion`: `rev-parse --show-toplevel` → `rev-parse --show-prefix` →
   `<prefix>.ancleto/machine-env.md` normalizado a `/` → `check-ignore --no-index` desde la raíz →
   `rev-parse --git-path info/exclude` → línea exacta si falta → re-verificación
   `check-ignore --no-index` que decide `ignored`/`updated`.
4. `check` → `ls-files` → warning advisory si está trackeado.
5. Runtime → definición de agente + delegación del orquestador leen el archivo y lo usan como
   pista; si un comando falla por entorno, reportan shell y comando textual.

## Riesgos y decisiones abiertas

- **Detección de shell heurística**: `PSModulePath` y `PROMPT` pueden estar heredados en procesos
  que no son el shell actual, y `PSModulePath` puede ser una variable de máquina. La mitigación
  contractual es declarar la fuente, no usar `ComSpec` como evidencia, dar prioridad a
  `MSYSTEM`/`SHELL` para Git Bash/MSYS y declarar `unknown` ante un conflicto genuino; no se
  agrega sondeo activo. El marcador PS7 gana por requisito explícito, aun cuando el legacy también
  esté presente. Un shell anidado puede declarar la familia del padre; es una limitación conocida.
- **Exclusión local invisible**: no se commitea y cada clon la regenera. El patrón se calcula
  repo-root-relative (crítico para `--project <subdir>`), se comprueba con `--no-index` y se
  re-verifica después de escribir. Se deriva con `--show-prefix` para que `--project` funcione
  con subdirectorios, symlinks y worktrees. `check` cubre el caso de trackeo accidental; un
  `git add -f` posterior sigue siendo posible.
- **Concurrencia en la exclusión**: dos comandos de ciclo de vida simultáneos podrían agregar
  la línea dos veces. La ventana es mínima y no se introduce lock; el chequeo exacto evita el
  duplicado en corridas secuenciales.
- **`generated_at` estable**: al preservarlo cuando no cambian los hechos, la fecha indica el
  último cambio real, no la última corrida. Se documenta en el archivo.
- **Tests dependientes de git**: se saltean si `git` falta; el CI de Linux lo tiene.
- **Mapa de fallbacks**: es contenido de diseño, no contrato; puede ajustarse tras el
  dogfooding sin cambiar el spec (el spec solo exige que cada ausente declare un fallback).
- **Decisiones abiertas**: ninguna que requiera al usuario. La única decisión material
  pendiente de validación empírica es la exclusión en worktree vinculado y con raíz alcanzada por
  symlink, que queda cubierta por test.
