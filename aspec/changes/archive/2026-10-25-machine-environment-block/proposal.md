# Proposal: Bloque de entorno de máquina para todos los subagentes

## Problem

Los subagentes ejecutan comandos en el shell equivocado. En la auditoría de 9 sesiones
(`BACKLOG.md`, sección "Detectado en auditoría de 9 sesiones", ítem 10) aparecen `npm`
invocado como `.CMD` desde bash, `bash`/heredocs desde PowerShell 5.1, CRLF redescubierto
y herramientas ausentes (`rg`) tratadas como si existieran. El patrón es siempre el mismo:
**el entorno de ejecución no llega a quien ejecuta**.

Hoy el único contexto que el framework inyecta es `.ancleto/working-context.md`, y su
contrato es explícitamente del orquestador: `agents/orchestrator.md:146-148` lo lee y lo
incorpora como `<ProjectMemoryRules>`; ningún subagente lo lee. Además ese archivo es un
bloque de memoria acotado por presupuesto de tokens (`src/core/memory/engine.js:9`,
`:118`, `:131`, `:144`), así que no es un lugar seguro para un dato que no debe truncarse.

Tampoco puede vivir en `AGENTS.md`: es un archivo versionado y compartido, y el bloque es
propio de cada máquina. Escribirlo ahí rompería el repo para otra plataforma. El hallazgo
sobre `mergeLocked` confirma que no es una opción inocua (ver más abajo): un bloque LOCKED
nuevo en `templates/AGENTS.md` se propaga a los `AGENTS.md` de todos los consumidores.

### Hallazgo obligatorio: `mergeLocked` sin ancla

`mergeLocked` (`src/cli/index.js:1393-1418`) **no es un no-op** cuando el destino no tiene
el bloque:

1. `replaceLockedBlock` no encuentra el par de marcadores y devuelve `null`
   (`src/cli/index.js:1387-1391`).
2. Si el nombre del bloque no aparece, no se considera mal formado
   (`src/cli/index.js:1402-1408`).
3. `findInsertAnchor` busca el bloque LOCKED **siguiente en el template** que exista en el
   destino; si no hay, devuelve `local.length` (`src/cli/index.js:1422-1430`).
4. Con ese ancla, inserta `sourceBlock + '\n\n'` en esa posición; es decir, **antes del
   siguiente bloque presente o al final del archivo** (`src/cli/index.js:1409-1415`).

`copyTemplates` usa `mergeTemplateInto` (`src/cli/index.js:1491-1493`, `:1498-1512`) en
`init`, `install --project` y `upgrade`. Consecuencia: si el bloque de entorno se agregara
como LOCKED en `templates/AGENTS.md`, en cada consumidor se **insertaría en su `AGENTS.md`
versionado** (al final o antes del siguiente LOCKED), contaminando el repo con datos de esa
máquina. Solo un bloque con nombre presente pero tags mal formados se salta con warning
(`src/cli/index.js:1402-1408`), que no es el caso de un bloque nuevo. Por eso el bloque
**no puede vivir en `AGENTS.md`**: la instrucción genérica (sin valores de máquina) que ordena
leer el artefacto local vive en las definiciones de agente, no en el template.

Tampoco alcanza con confiar en que `.ancleto/` ya está ignorado: el framework **no gestiona
el `.gitignore`** del consumidor (`README.md:218`); la guía solo *recomienda* ignorar
`.ancleto/` (`README.md:223`). Sin una garantía explícita, el artefacto podría terminar
versionado. La garantía se resuelve **sin tocar el `.gitignore`**: se verifica con
`git check-ignore` y, solo si el path no está ignorado, se agrega una línea exacta a la
exclusión local del clon en la ruta que devuelve `git rev-parse --git-path info/exclude`.
Esa exclusión es local (no se commitea), evita contaminar el repo y funciona también en
worktrees vinculados, donde `.git` es un archivo y no un directorio. `ancleto check`
advierte si el artefacto llegara a estar trackeado.

## Capability

**`machine-environment`** — bloque de entorno de ejecución propio de cada máquina,
materializado por la CLI como artefacto local derivado y entregado a todos los subagentes que
ejecutan comandos. Define dónde vive, cómo se genera y regenera en el ciclo de vida, qué hechos
mínimos declara (plataforma, shell, fin de línea y disponibilidad de herramientas), cómo se
excluye del control de versiones sin gestionar `.gitignore`, cómo llega al ejecutor y qué
precedencia tiene frente a instrucciones genéricas. La medición de mejora se hace con el
reporte existente de `ancleto stats failures`.

## Baseline

Medición read-only del reporte de fallos ya existente
(`aspec/specs/session-failure-report/spec.md`), ejecutada en este repo el **2026-10-25**.

- Comando exacto: `node src/cli/index.js stats failures --json`
- Alcance: default por `session.directory` (directorio actual,
  `D:\Repos D\Proyectos\ancleto\spec`, mostrado como `<path> D/Proyectos/ancleto/spec`).
  **No se usa `--all`**: la re-medición debe aislar el efecto del cambio en este repo; el
  alcance global mezcla proyectos con shells y tooling distintos y no es comparable.
- Ventana: todo el historial de sesiones en alcance, sin `--since`. Primer `env` observado
  `2026-09-25T13:34:53Z`; último `2026-10-15T14:44:34Z`.

Fallos por clase (parts / grupos / sesiones):

| clase | parts | % del total | grupos | sesiones |
|---|---:|---:|---:|---:|
| env | 68 | 22,1 % | 15 | 44 |
| check | 202 | 65,8 % | 47 | 73 |
| tool | 30 | 9,8 % | 4 | 19 |
| unknown | 7 | 2,3 % | 6 | 7 |
| total | 307 | 100 % | 72 | 105 |

Top de esqueletos con fallos `env` (parts / sesiones / máx. por sesión):

| esqueleto | parts | sesiones | máx/sesión |
|---|---:|---:|---:|
| `rg` | 32 | 20 | 3 |
| `node` | 13 | 10 | 2 |
| `cd` | 5 | 3 | 3 |
| `rg` (wrapped) | 4 | 4 | 1 |
| `git log` | 3 | 3 | 1 |
| `git show` | 2 | 1 | 2 |
| `@' const`, `echo`, `Get-ChildItem`, `git branch`, `git diff`, `git show <sha>`, `sqlite3`, `Write-Output` | 1 c/u | 1 c/u | 1 |

Lectura: 68 fallos `env` en 105 sesiones (~64,8 por 100 sesiones), con `rg` como binario
ausente dominante y `node` como segundo. La reincidencia de `check` (lint/tests rojos) es
esperada y **no** es el objetivo de este change.

Re-medición posterior (mismo comando, mismo alcance):

1. `node src/cli/index.js stats failures --class env --json` sobre todo el historial del
   scope (comparación de reincidencia por esqueleto).
2. `node src/cli/index.js stats failures --class env --since <fecha-de-cierre> --json`
   como ventana limpia post-change (solo sesiones nuevas).

Criterio de éxito, con **≥ 10 sesiones** en la ventana `--since`: los fallos `env` bajan a
**≤ 32 por 100 sesiones** (mitad de la línea base) y los esqueletos `rg`/`node` dejan de
aparecer como grupos `env`; `unknown` no aumenta. Si hay menos de 10 sesiones, la medición
es **inconclusa** (no se declara mejora ni fracaso). Criterio de fracaso: superar el umbral
o incorporar un esqueleto `env` nuevo que no estaba en la línea base.

Contexto histórico (no se usa como línea base): el change archivado
`2026-10-25-session-failure-report` midió, el 2026-10-24 y con alcance global, 499/2.664
fallos `env` (18,7 %) en 313 sesiones; 319 de esos 499 eran "no se reconoce como nombre".

## Proposed change

Se agrega un **artefacto local derivado** con los hechos del entorno de ejecución, generado
por la CLI en cada máquina y consumido por todos los subagentes:

1. **Ubicación y naturaleza**: `.ancleto/machine-env.md`, generado por detección local en
   `init`, `install --project` y `upgrade`. Es un artefacto **completamente derivado y no
   editable**: se reescribe entero (comparación canónica que ignora `generated_at` para no
   tocar mtime si no cambió). No forma parte de `working-context.md`, no se mergea en `AGENTS.md`
   y no depende de la memoria del repo.
2. **No versionado sin gestionar `.gitignore`**: dado que el framework no gestiona el
   `.gitignore` del consumidor (`README.md:218`), el ciclo de vida garantiza la exclusión
   **local al clon** del path exacto: resuelve la raíz del worktree con
   `git rev-parse --show-toplevel`, deriva el prefijo del project root con
   `git -C <projectRoot> rev-parse --show-prefix`, compone el patrón
   `<prefix>.ancleto/machine-env.md` (separadores normalizados a `/`, sin `path.relative`) y
   comprueba con `git check-ignore --no-index` desde la raíz contra ese mismo path. Si ya
   está ignorado (caso recomendado por el README), no hace nada. Si no, agrega una sola línea con
   ese patrón repo-root-relative a la exclusión local, en la ruta que devuelve
   `git rev-parse --git-path info/exclude` —no se asume `.git/info/exclude` porque en worktrees
   `.git` es un archivo— sin reescribir, reordenar ni eliminar entradas existentes. Es idempotente.
   Después de escribir re-verifica con `check-ignore --no-index` y solo entonces reporta la
   exclusión como garantizada; si la verificación falla, advierte. Esto cubre también
   `install --project <subdir>`: el patrón fijo `.ancleto/machine-env.md` no matchea
   `<subdir>/.ancleto/machine-env.md` porque `info/exclude` es relativo a la raíz del repo. Si no
   es repo git o `git` no está disponible, no escribe nada y advierte. `ancleto check` advierte si
   `git ls-files` muestra el archivo trackeado.
3. **Contenido mínimo, solo disponibilidad**: plataforma/OS y release, arquitectura, shell
   detectado con la variante que cambia la sintaxis (Windows PowerShell 5.1, PowerShell 7, cmd,
   bash o bash/WSL) y su fuente, fin de línea (CRLF/LF) y su fuente —`gitattributes`, `core.eol`,
   `core.autocrlf` o `platform-default`—, y una lista corta y fija de herramientas (`rg`, `node`,
   `npm`, `git`, `python`) con disponible sí/no. Cada herramienta ausente lleva su fallback en una
   línea (p. ej. `rg` ausente → `Select-String` o `grep`). Sin versiones. Incluye `generated_at`,
   versión de ancleto y una nota de que el bloque es una pista de entorno. **Nunca** vuelca el
   entorno completo, `PATH` ni valores de secretos.
4. **Origen del shell**: `init` detecta el shell de **su propio proceso**, que puede no ser el
   que usa la tool de bash del runtime. En Windows considera `MSYSTEM`/`CYGWIN` y `SHELL` para
   reconocer Git Bash/MSYS, `PSModulePath` (PowerShell 7 si está su marcador aunque también esté
   el legacy; solo el legacy → 5.1) y `PROMPT` para `cmd`; `ComSpec` no es evidencia del shell
   actual. El archivo declara la variable ganadora como fuente y escribe `unknown` ante ausencia
   o conflicto genuino, sin adivinar.
5. **Llegada a todos los subagentes**: la instrucción canónica vive en las definiciones de
   agente (versionadas, sin valores de máquina): "leé `.ancleto/machine-env.md` antes de
   ejecutar comandos; si no existe, seguí con la guía genérica y reportalo". El orquestador,
   además, incluye el bloque en toda delegación a un subagente con capacidad de ejecutar
   comandos (`bash` habilitado), de modo que la información llegue aunque el subagente no lea
   archivos. El bloque es una **pista**: si un comando falla por entorno, el subagente reporta
   el shell declarado y el comando textual. Ventaja de las dos vías: el contenido se lee en
   runtime, así que el cache de definiciones de agentes solo afecta la instrucción, no el
   contenido.
6. **Precedencia**: ante conflicto con indicaciones genéricas de shell (en `AGENTS.md`,
   `PRODUCT.md` o el prompt del agente) prevalece el bloque de máquina; nunca prevalece
   sobre reglas de seguridad, validación, permisos ni instrucciones explícitas del usuario.
   La frase genérica de precedencia se incluye tanto en el párrafo canónico de las definiciones
   de agente como en el `## Hint` del bloque, sin valores de máquina, para que la regla llegue al
   ejecutor y no solo al orquestador.
7. **No truncado y sin techo de lecturas**: al vivir fuera del working-context no compite con
   `MAX_TOKENS = 2000` (`src/core/memory/engine.js:9`, `:118`, `:131`, `:144`). El render
   del working-context (`src/core/memory/working-context.js:52-58`) queda intacto. Las lecturas
   de `.ancleto/machine-env.md` y de `.ancleto/working-context.md` (`## Project Memory Rules`)
   por el orquestador **no cuentan** contra su techo de 3 lecturas; el contrato lo declara
   explícitamente en la sección `Repository Reading Limit` y en la lista `NEVER`.

La implementación (módulo dueño, detección, formato exacto, orden de escritura y tests) se
detalla en `design.md`; el plan accionable, en `tasks.md`.

## Scope

In scope:

- Artefacto `.ancleto/machine-env.md` como bloque de entorno por máquina, no versionado.
- Generación y regeneración idempotente en `init`, `install --project` y `upgrade`.
- Exclusión local del clon del path exacto repo-root-relative, aditiva e idempotente, con
  re-verificación posterior, y advertencia de `check` cuando el artefacto está trackeado.
- Contenido mínimo verificable: plataforma, shell y su fuente, EOL (con `.gitattributes` primero)
  y disponibilidad de cinco herramientas con fallback.
- Contrato de lectura, precedencia y reporte de fallo por entorno en las definiciones de agente
  y en la delegación del orquestador.
- Exención del techo de 3 lecturas para `.ancleto/machine-env.md` y para
  `.ancleto/working-context.md` (`## Project Memory Rules`), declarada en el contrato del
  orquestador.
- Criterio de re-medición con `ancleto stats failures`.

Out of scope:

- Implementación de código, tests, commits, push o PR.
- Cambiar el render, el presupuesto o el contenido de `.ancleto/working-context.md`.
- Agregar valores de máquina a archivos versionados (`templates/AGENTS.md`, `AGENTS.md` o
  definiciones de agente); solo se agrega la instrucción genérica sin valores.
- Escribir o modificar el `.gitignore` del consumidor.
- Instalar o reparar tooling del sistema (solo se reporta disponibilidad).
- Reportar versiones de herramientas.
- Reclasificar fallos históricos ni persistir métricas.
- Rediseñar `ancleto stats failures` (se reutiliza tal cual).

## Alternatives considered

**(a) Sección fija del working-context + inclusión obligatoria en cada delegación.**
Rechazada. El working-context es un bloque de memoria con presupuesto de 2.000 tokens
(`engine.js:9`, `:118`, `:131`, `:144`): un entorno de máquina ahí puede truncarse y, de
hecho, se truncaría cuando la memoria del proyecto sea grande. Además solo lo lee el
orquestador (`orchestrator.md:146-148`); obligar a incluirlo en cada delegación hace que la
garantía dependa de que el orquestador copie un bloque que puede venir incompleto, y mezcla
dos ciclos de vida distintos (memoria vs entorno). No cumple "no se trunca".

**(b) Archivo local con exclusión local del clon, referenciado desde las instrucciones.**
Elegida. Separa el ciclo de vida del entorno del de la memoria, permite una ruta relativa
estable para todos los hosts y no depende del presupuesto de tokens. Se entrega por dos
caminos redundantes: cada definición de agente ordena leerlo y el orquestador lo incluye en
la delegación a quien ejecuta comandos. La exclusión se garantiza sin gestionar `.gitignore`
(`README.md:218`): `git check-ignore --no-index` desde la raíz del repo contra el patrón
repo-root-relative calculado con `git rev-parse --show-prefix`, re-verificación después de
escribir y, solo si
hace falta, una línea exacta en la exclusión local del clon resuelta con
`git rev-parse --git-path info/exclude`. Esa ruta es local al clon, no se commitea y funciona en
worktrees vinculados y en `install --project <subdir>`.

**(c) Archivo global por máquina fuera del repo (p. ej. en el home).**
Rechazada. No se versiona por construcción, pero rompe la ruta relativa estable que todos
los agentes y hosts pueden leer, requiere descubrimiento de un path absoluto por host
(algunos subagentes no tienen `bash`) y mezcla proyectos de una misma máquina con distinto
tooling local (p. ej. `node_modules` del repo). El archivo bajo `.ancleto/` es local a la
copia de trabajo, que en la práctica es la granularidad correcta.

**(d) Escribir la línea en el `.gitignore` del proyecto.**
Rechazada. Contradice la política declarada en el README de que el framework no gestiona el
`.gitignore` del consumidor y ensucia un archivo compartido y versionado con una necesidad
local. La exclusión local del clon cubre el mismo objetivo sin tocar el repo.

## Risks

- **La exclusión local es invisible para el usuario**: no se commitea y cada clon debe
  regenerarla; se resuelve en `init`/`install --project`/`upgrade`, se prueba la idempotencia
  exacta y `ancleto check` advierte si el archivo quedó trackeado. El patrón es
  repo-root-relative (crítico con `--project <subdir>`) y se re-verifica con `check-ignore
  --no-index` después de escribir. Se deriva con `git rev-parse --show-prefix`, que cubre
  subdirectorios, symlinks y worktrees. En un worktree la ruta se resuelve con
  `git rev-parse --git-path info/exclude`, nunca asumiendo `.git/info/exclude`.
- **Proyecto sin git o sin binario `git`**: no hay exclusión que garantizar; se conserva el
  artefacto y se emite un warning no bloqueante.
- **Artefacto obsoleto** si cambia el tooling de la máquina (p. ej. se instala `rg` después
  del `init`): se regenera en `init`/`install --project`/`upgrade` y el contenido declara
  `generated_at`; la re-medición detecta si sigue apareciendo un binario ausente.
- **Detección incorrecta o incompleta**: el bloque declara hechos observados y usa `unknown`
  cuando no puede determinar un campo, en lugar de inventar; la precedencia explícita evita
  que un valor dudoso pise seguridad o validación. En Windows, `ComSpec` no se usa como
  evidencia, Git Bash/MSYS se reconoce por `MSYSTEM`/`SHELL`, y un `PSModulePath` con marcador
  de PowerShell 7 declara PowerShell 7 aunque también tenga el legacy. El shell detectado es el
  del proceso de `init`, no necesariamente el de la tool de bash del runtime, y así se declara;
  un shell anidado puede conservar señales del padre.
- **Un subagente ignora la instrucción**: la entrega es redundante (definición del agente +
  delegación) y queda anclada con content guards; el efecto real se mide con
  `ancleto stats failures`, sin prometer cumplimiento del modelo.
- **Costo de tokens por duplicar el bloque en cada delegación**: el contenido es un conjunto
  acotado de campos (no el entorno completo) y solo se incluye en delegaciones a agentes con
  `bash` habilitado.
- **Fuga de datos sensibles en la detección**: se emite una lista blanca de campos y
  variables; nunca el entorno completo, tokens, credenciales ni valores de `PATH`; se prueba
  con variables señuelo.
- **Divergencia entre hosts**: el texto canónico es único y los adaptadores de host lo
  copian verbatim; no se agregan valores de máquina a los templates versionados.
- **CRLF al escribir el artefacto**: se escribe con `\n` y se normaliza al comparar, igual
  que el working-context (`src/core/memory/working-context.js:69-76`).

## Open questions

Ninguna pendiente. Quedaron resueltas en este tramo: (1) la exclusión se hace en la exclusión
local del clon, sin tocar `.gitignore`; (2) el contenido reporta solo disponibilidad, sin
versiones.

## Change Log

- 2026-10-25 — Re-review: la exclusión deriva el path repo-root-relative con
  `git rev-parse --show-prefix` en lugar de `path.relative` (raíces symlinkeadas y worktrees), se
  agrega la guarda para prefijos no relativos y se alinea la lista de shells con el requirement de
  origen. Sin cambios de alcance.

