# Tasks: machine-environment-block

> Orden de ejecución. Las secciones 1-5 son implementación; 6-7 son testing/validación; 8 es
> cierre y evidencia. El review independiente posterior marcó GUARANTEE NOT SUSTAINED: las
> secciones 9-11 cierran esos hallazgos sobre el código ya implementado y no desmarcan el
> historial de las tareas 1-8. Las tareas 1-11 están completadas; solo 8.2-8.4 siguen abiertas
> **por diseño** (dogfooding tras reiniciar la sesión y re-medición posterior al cierre). La
> sección 12 cierra el WARNING del re-review sobre la exclusión con raíz symlinkeada: 12.1-12.6
> completadas (12.3 y 12.6 en `test/cli.test.js`, 12.5 re-validada por `@tester`); 12.4 documenta la
> cobertura real y su gap (los branches defensivos de `--show-prefix` no se testean) y 12.6 cubre el
> caso de espacio inicial en el host actual, con el caso POSIX de prefijo con salto de línea
> declarado como gap (skip en win32).

## 1. Módulo dueño y detección

- [x] 1.1 Crear `src/core/machine-env.js` con `machineEnvPath(projectRoot)` y
  `detectMachineFacts(overrides?)`. La detección lee plataforma, `os.release()` y arquitectura;
  `overrides` es solo una costura de test, no configuración pública.
- [x] 1.2 Implementar la detección de shell desde el proceso de `init` según la precedencia de
  `design.md` D2: `PSModulePath` (Windows PowerShell 5.1 / PowerShell 7), `ComSpec` (`cmd`),
  `WSL_DISTRO_NAME`/`WSL_INTEROP` (`bash/WSL`), `SHELL` POSIX. Devolver también
  `shell_source`; señales contradictorias o ausentes → `unknown`. **Superada por 9.1**
  (ComSpec deja de ser evidencia y se agrega Git Bash/MSYS).
- [x] 1.3 Implementar la detección de fin de línea con `core.eol`/`core.autocrlf` cuando hay
  repo y git, y convención de plataforma como fallback. Devolver `eol_source`. **Ampliada por
  9.3** (`.gitattributes` primero).
- [x] 1.4 Implementar la disponibilidad de la lista fija `rg`, `node`, `npm`, `git`, `python`
  por búsqueda en `PATH` (`PATHEXT` en Windows), sin ejecutar binarios ni pedir versiones, y el
  mapa fijo de fallbacks por herramienta ausente.
- [x] 1.5 Verificar que la detección solo lea la lista blanca de variables y nunca imprima
  `PATH`, tokens, credenciales ni el entorno completo.

## 2. Render y escritura

- [x] 2.1 Implementar `renderMachineEnv(facts, { generatedAt })` con el orden de secciones de
  `design.md` D3: encabezado derivado/no editable con `generated_at` y versión de ancleto,
  plataforma, shell + fuente, EOL + fuente, herramientas con disponibilidad/fallback, y nota de
  pista de entorno.
- [x] 2.2 Asegurar que el render no incluya versiones de herramientas, `PATHEXT`, heredoc,
  quoting, codepage, secretos ni el valor de `PATH`; usar `\n` y salto final.
- [x] 2.3 Implementar `writeMachineEnv(projectRoot, facts)`: leer el existente, normalizar
  CRLF/espacios finales, comparar **ignorando `generated_at`** y no reescribir si no cambió
  (mtime intacto, `generated_at` original preservado). Si cambió un hecho o la versión,
  reescribir completo con `generated_at` nuevo.
- [x] 2.4 Implementar `materializeMachineEnv(projectRoot)` que orquesta detección → render →
  escritura → exclusión y captura todos los errores como warnings no bloqueantes.

## 3. Exclusión local y `check`

- [x] 3.1 Implementar `ensureMachineEnvExclusion(projectRoot)`:
  `git -C <root> rev-parse --is-inside-work-tree`; si no es repo o git no está, advertir y no
  escribir nada.
- [x] 3.2 Implementar la comprobación `git -C <root> check-ignore -q -- .ancleto/machine-env.md`:
  exit 0 → no modificar ninguna regla; exit 1 → continuar con la exclusión local. **Reemplazada
  por 9.5**: patrón repo-root-relative y `--no-index`.
- [x] 3.3 Resolver la ruta con `git -C <root> rev-parse --git-path info/exclude` (nunca asumir
  `.git/info/exclude`), absolutizarla si hace falta, y agregar una sola línea exacta
  `.ancleto/machine-env.md` preservando byte a byte el contenido previo. No reescribir,
  reordenar ni eliminar entradas; no duplicar si la línea exacta ya existe. **Reemplazada por
  9.5**: la línea usa el patrón repo-root-relative y se re-verifica.
- [x] 3.4 Implementar `checkMachineEnvTracked(projectRoot)` con
  `git -C <root> ls-files --error-unmatch -- .ancleto/machine-env.md`; exit 0 → advertencia,
  git ausente/sin repo → sin salida.
- [x] 3.5 Cablear `checkMachineEnvTracked` en `ancleto check` junto a `checkTierOrphan`, sin
  cambiar el exit code por esa advertencia.

## 4. Ciclo de vida

- [x] 4.1 Agregar el helper `refreshMachineEnv(projectDir)` en `src/cli/index.js`, análogo a
  `refreshWorkingContext`, que devuelva `{ written, ignored, warnings }` y nunca lance.
- [x] 4.2 Llamar `refreshMachineEnv` en `install --project`, `init` y `upgrade`, con los
  mensajes de `design.md` D7: silencio en el camino feliz de `init`/`install`, línea
  `✔ machine-env.md generado|sin cambios` en `upgrade`.
- [x] 4.3 Verificar que un fallo de generación o de exclusión se reporte como warning y que el
  comando de ciclo de vida siga y termine con éxito.

## 5. Instrucciones de agente

- [x] 5.1 Agregar el párrafo canónico de `design.md` D6 a las 10 definiciones de `agents/*.md`,
  sin valores de máquina, junto a la instrucción de leer `AGENTS.md`.
- [x] 5.2 Agregar `## Machine Environment` a `agents/orchestrator.md` con: lectura una vez por
  sesión/tarea, exención explícita del techo de tres lecturas, inclusión verbatim del bloque en
  delegaciones a `@coder`, `@tester`, `@documenter`, `@context-resolver`,
  `@technical-discovery` y `@technical-seed-writer`, y exclusión de los agentes sin `bash`.
- [x] 5.3 Documentar en el orquestador que el bloque es una pista: si un comando falla por
  entorno, se reporta el shell declarado y el comando textual; y que el contenido se lee en
  runtime, por lo que el cache de definiciones solo afecta a la instrucción.
- [x] 5.4 Confirmar que `templates/AGENTS.md` no se modifica y que ninguna definición de agente
  ordena escribir `.gitignore`.

## 6. Tests

- [x] 6.1 Crear `test/machine-env.test.js` (unitario): render determinista con hechos y
  `generatedAt` fijos; orden fijo de herramientas; fallback por ausente; sin versiones; sin
  variables señuelo; shell `unknown` por ausencia y por contradicción; `writeMachineEnv` no
  reescribe si solo cambia `generated_at` y sí reescribe ante un hecho nuevo.
- [x] 6.2 Extender `test/cli.test.js` con: `init` sin git (artefacto + warning + sin
  `.gitignore`), repo git con `.ancleto/` no ignorado (`check-ignore` OK, `.gitignore` intacto,
  `git ls-files` sin el archivo), repo con `.ancleto/` ya ignorado (nada cambia) y dos corridas
  (contenido y mtime iguales).
- [x] 6.3 Extender `test/cli.test.js` con: `PATH` sin `git` (warning, artefacto conservado),
  artefacto trackeado (`check` advierte sin cambiar exit code) y
  `.ancleto/machine-env.md` como directorio (warning no bloqueante, exit 0).
- [x] 6.4 Agregar el test de worktree vinculado real en `test/cli.test.js`: `git init`, commit,
  `git worktree add`, `install --project` dentro del worktree, `check-ignore` OK y línea exacta
  en la ruta que devuelve `git rev-parse --git-path info/exclude`. Saltear con `t.skip` si
  `git --version` falla.
- [x] 6.5 Extender `test/cli.test.js` con detección: herramienta ausente con fallback,
  `rg` falso agregado a `PATH` que pasa a disponible tras `upgrade`, entorno sin señales de
  shell (`unknown`), y variables señuelo que no aparecen en el contenido.
- [x] 6.6 Extender `test/content-guards.test.js`: las 10 definiciones de agente contienen
  `.ancleto/machine-env.md` y la conducta ante ausencia; el orquestador contiene
  `## Machine Environment`, la exención del techo y la lista de agentes con `bash`; ninguna
  definición contiene valores de máquina ni instrucciones de escribir `.gitignore`.

## 7. Validación

- [x] 7.1 Ejecutar lint declarado: `npm run lint` → sin errores.
- [x] 7.2 Ejecutar tests acotados:
  `node --test "test/machine-env.test.js" "test/cli.test.js" "test/content-guards.test.js"`
  → verde.
- [x] 7.3 Ejecutar la suite completa declarada: `npm test` → verde.
- [x] 7.4 Ejecutar `node src/cli/index.js specs check --change machine-environment-block` →
  canónico (exit 0). No se inventa otro runner; format queda `not-configured` y typecheck no
  aplica según `PRODUCT.md`.

## 8. Cierre y evidencia

- [x] 8.1 Agregar en `BACKLOG.md`, sección "Detectado en auditoría de 9 sesiones", ítem 13, una
  línea de evidencia que cite `machine-environment-block` como caso de regla de entorno stale
  que ningún mecanismo detectaba ni refrescaba.
  **Activación anotada en BACKLOG (2026-10-25):** la fecha de activación y el comando de
  re-medición quedaron registrados en el ítem 13. `8.2`–`8.4` siguen pendientes: el `upgrade`,
  el reinicio de sesión y la medición no se ejecutaron.
- [ ] 8.2 Antes de dogfoodear: ejecutar `ancleto upgrade` en este repo y **reiniciar la sesión**
  (las definiciones de agente se cachean al inicio). Dejar registrado que el dogfooding dentro
  de la sesión que creó el change **no es válido** hasta reiniciar.
- [ ] 8.3 Tras el reinicio, verificar el dogfooding: el orquestador lee el artefacto sin contar
  el techo de tres lecturas e incluye el bloque en una delegación a un agente con `bash`.
- [ ] 8.4 Re-medir cuando haya al menos 10 sesiones nuevas:
  `node src/cli/index.js stats failures --class env --since <fecha-de-cierre> --json`, mismo
  alcance `session.directory` del proposal. Registrar si la tasa es ≤ 32/100 sesiones, si
  `rg`/`node` desaparecen como grupos `env` y si `unknown` no aumenta. Con menos de 10 sesiones,
  registrar "inconcluso".

## 9. Cierre de hallazgos del review (implementación)

> Corrigen la implementación existente. No reemplazan el historial de las tareas 1-7, que quedan
> marcadas como completadas contra el diseño anterior.

- [x] 9.1 Reemplazar `detectShell` en `src/core/machine-env.js` por la precedencia de `design.md`
  D2: `MSYSTEM`/`CYGWIN` → bash; `PSModulePath` con marcador PS7 (aunque también legacy) →
  PowerShell 7; `PROMPT` → cmd; `SHELL` POSIX + legacy sin las señales anteriores → `unknown`;
  `SHELL` POSIX → ese shell; solo legacy sin las señales anteriores → Windows PowerShell 5.1; sin
  señal positiva → unknown. No usar `ComSpec` como evidencia y devolver `shell_source` con la
  variable ganadora.
- [x] 9.2 Ampliar la lista blanca de entorno de D2 con `MSYSTEM`, `CYGWIN` y `PROMPT`, y dejar de
  leer `ComSpec`.
- [x] 9.3 Cambiar la detección de EOL de D2: consultar `git check-attr eol` para el path del
  artefacto antes de `core.eol`, `core.autocrlf` y `platform-default`; `eol_source` debe ser
  `gitattributes` cuando el atributo decida.
- [x] 9.4 Pasar el `platform` inyectado a `isExecutableFile` y usarlo en la comprobación `X_OK`
  en lugar de `process.platform`; actualizar la llamada desde `findExecutable`.
- [x] 9.5 Reescribir `ensureMachineEnvExclusion` según D5: `rev-parse --show-toplevel`,
  `path.relative(repoRoot, artifactPath)` normalizado a `/`, `check-ignore --no-index` desde la
  raíz contra ese patrón, escritura de una sola línea con el patrón exacto y re-verificación
  posterior que derive `ignored`/`updated` (nunca asignar `ignored=true` por intención).
  **Superada por 12.1** (prefijo con `--show-prefix`, sin `path.relative`).
- [x] 9.6 Confirmar que `checkMachineEnvTracked` sigue funcionando con `--project <subdir>` y que
  `check` usa `ls-files` para el trackeo real, independiente de `--no-index`.
- [x] 9.7 Actualizar el párrafo canónico de las 10 definiciones de `agents/*.md` y la sección
  `## Hint` de `renderMachineEnv` con la regla genérica de precedencia de D6, sin valores de
  máquina.
- [x] 9.8 Actualizar `agents/orchestrator.md`: la sección `Repository Reading Limit` y la lista
  `NEVER` de `PROHIBITED ACTIONS` deben nombrar explícitamente que `## Project Memory Rules` y
  `## Machine Environment` no consumen el techo de tres lecturas.
- [x] 9.9 Actualizar `refreshMachineEnv`/mensajes de D7 para que `ignored`/`updated` reflejen la
  re-verificación y una verificación fallida emita warning.

## 10. Tests de cierre de hallazgos

- [x] 10.1 `test/machine-env.test.js`: Git Bash/MSYS simulado (`win32` + `SHELL=/bin/bash` +
  `MSYSTEM=MINGW64` + `ComSpec`/`PSModulePath` heredados) → bash, fuente `MSYSTEM`, no cmd/5.1.
- [x] 10.2 `test/machine-env.test.js`: `PSModulePath` con marcadores PS7 y legacy → PowerShell 7;
  solo legacy sin `PROMPT`/`SHELL` → Windows PowerShell 5.1; `SHELL` POSIX + legacy sin
  `MSYSTEM`/`PROMPT`/PS7 → unknown; solo `ComSpec` → unknown; sin señales → unknown.
- [x] 10.3 `test/machine-env.test.js`: `isExecutableFile` respeta el `platform` inyectado
  (aserción condicional a host no-win32 por `X_OK`).
- [x] 10.4 `test/cli.test.js`: repo real con `install --project packages/app`; el patrón
  `packages/app/.ancleto/machine-env.md` queda en `info/exclude`, `check-ignore --no-index` da
  exit 0, `git add -A` desde la raíz no incorpora el artefacto y `.gitignore` queda intacto.
- [x] 10.5 `test/cli.test.js`: artefacto trackeado con `git add -f` pero cubierto por una regla;
  `check-ignore --no-index` exit 0, el ciclo no agrega/actualiza la exclusión y `check` advierte el
  trackeo.
- [x] 10.6 `test/machine-env.test.js`: repo git real con `.gitattributes` `eol=lf`;
  `detectMachineFacts({ platform: 'win32', cwd })` declara LF y fuente `gitattributes` por encima
  de `core.eol`/`core.autocrlf`/default CRLF. Saltear si `git --version` falla.
- [x] 10.7 `test/content-guards.test.js`: las 10 definiciones de agente y el `## Hint` del render
  contienen la regla de precedencia; el orquestador nombra `## Project Memory Rules` y
  `## Machine Environment` como exentos del techo; no aparecen valores de máquina.
- [x] 10.8 Ajustar tests existentes que esperaban `unknown` con ambos marcadores o el patrón fijo
  `.ancleto/machine-env.md`.

## 11. Re-validación tras el cierre

- [x] 11.1 Ejecutar `npm run lint` → sin errores.
- [x] 11.2 Ejecutar tests acotados:
  `node --test "test/machine-env.test.js" "test/cli.test.js" "test/content-guards.test.js"` →
  verde.
- [x] 11.3 Ejecutar la suite completa declarada: `npm test` → verde.
- [x] 11.4 Ejecutar `node src/cli/index.js specs check --change machine-environment-block` →
  canónico (exit 0). Format `not-configured`; typecheck no aplica según `PRODUCT.md`.

## 12. Cierre del WARNING de re-review: exclusión con raíz symlinkeada

> Corrige la implementación existente según `design.md` D5. No desmarca las tareas 1-11.

- [x] 12.1 Reemplazar en `ensureMachineEnvExclusion` el cálculo de `path.relative(repoRoot,
  artifactPath)` por `git -C <projectRoot> rev-parse --show-prefix` y componer el patrón
  `<prefix>.ancleto/machine-env.md` normalizado a `/` (prefijo vacío cuando el project root es la
  raíz). Mantener `check-ignore --no-index` desde la raíz, la escritura idempotente y la
  re-verificación posterior que deriva `ignored`/`updated`.
- [x] 12.2 Implementar la guarda de seguridad: si `--show-prefix` falla, o el resultado es absoluto
  o empieza con `..`, emitir warning sin escribir regla. El mensaje debe describir la falla real y
  no afirmar que el artefacto está "fuera del repositorio" cuando el path compuesto es relativo.
- [x] 12.3 `test/cli.test.js`: repo real con un symlink a un subdirectorio (`link -> packages/app`)
  y `install --project link`; el patrón `<subdir>/.ancleto/machine-env.md` queda en `info/exclude`
  sin `..`, `check-ignore --no-index` da exit 0 desde la raíz, `git add -A` no incorpora el
  artefacto y `.gitignore` queda intacto. Saltear si el host no permite crear symlinks o falta
  `git`.
- [x] 12.4 `test/cli.test.js`: cobertura real de la guarda limitada al caso project root fuera de
  cualquier repo (`rev-parse --is-inside-work-tree` falla): warning, ninguna línea agregada y
  artefacto conservado. Los branches de `--show-prefix` fallido, resultado absoluto o que empieza
  con `..` son defensivos y no alcanzables sin interceptar git: **gap declarado, sin test**, no se
  afirma cobertura que no existe.
- [x] 12.5 Re-validar: `npm run lint`; `node --test "test/machine-env.test.js" "test/cli.test.js"
  "test/content-guards.test.js"`; `npm test`;
  `node src/cli/index.js specs check --change machine-environment-block`.
- [x] 12.6 Hardening del WARNING 1 del re-review en `ensureMachineEnvExclusion`: reemplazar
  `trim()` por un recorte que elimine solo el salto de línea final en las salidas de
  `rev-parse --show-prefix`, `--show-toplevel` y `--git-path info/exclude`, preservando los
  espacios iniciales del nombre de directorio, y rechazar un prefijo que contenga `\r` o `\n` con
  warning y sin escritura de regla. Test en `test/cli.test.js` con un project root cuyo nombre
  empieza con espacio: el patrón en `info/exclude` conserva el espacio inicial y
  `check-ignore --no-index` da exit 0; si el host no permite crear ese nombre, registrar el gap
  explícito. Agregar además el caso POSIX de prefijo con salto de línea (warning, sin escritura)
  solo si el host lo permite; si no, declararlo gap en lugar de marcar cobertura. **Cubierto**:
  `test/cli.test.js` →
  `install --project <dir con espacio inicial>: el patron conserva el espacio y no hay actualizacion falsa`
  (patrón ` app/.ancleto/machine-env.md`, `check-ignore --no-index` exit 0, `git add -A` no lo
  incorpora, segunda corrida reporta `exclusión local verificada` y no `actualizada`).
  **Gap declarado en este host (win32)**: el caso de prefijo con `\n` solo es realizable en POSIX;
  `test/cli.test.js` → `project root con salto de linea en el nombre: advierte y no escribe regla`
  se saltea con `t.skip` en win32 y no se ejecutó aquí.
