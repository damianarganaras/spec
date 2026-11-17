## ADDED Requirements

### Requirement: Juez externo advisory opcional

`ancleto judge` SHALL ser un subcomando read-only, opt-in y advisory que envuelve un binario externo
pinneado para producir una señal semántica por requirement sobre las specs canónicas del proyecto. El
binario SHALL resolverse por `PATH`. En win32 la resolución usa `where`, que también busca el
directorio actual, así que un `jev-spec.cmd` versionado en el repositorio puede resolver antes que uno
instalado globalmente; esa consecuencia no expande la frontera de confianza, porque habilitar el juez
ya implica ejecutar el `jev-spec.config.ts` del repositorio. Si el binario falta y `--require` está
presente, la sonda SHALL intentar
`npx -y jev-spec@0.4.1` —versión exacta, nunca `latest`—. Sin `--require`, una corrida con el binario
ausente SHALL degradar a `unavailable` sin invocar `npx`. El subcomando NO SHALL aceptar `--target` ni
`--change`: los targets y las rúbricas los
declara el archivo de configuración del usuario, y v1 NO SHALL pasar argumentos del usuario al binario
externo. La invocación de la verificación SHALL ser sin argumentos de usuario; la única invocación con
un flag propio del binario SHALL ser la sonda de versión.

La habilitación SHALL leerse de `judge.enabled` en `.ancletorc` con lectura tolerante: archivo ausente,
JSON inválido o un valor distinto del booleano `true` SHALL dejar el juez deshabilitado. El valor por
defecto SHALL ser deshabilitado y `ancleto init` NO SHALL habilitarlo. `judge.timeoutMs` SHALL leerse con
la misma tolerancia: sólo un entero mayor a 0 SHALL fijar el límite de la corrida y cualquier otro valor
SHALL degradar al default de 120000 ms.

El proceso de `ancleto` NO SHALL acceder a la red ni escribir en el repositorio. El binario externo
—y `npx` cuando resuelve el pin— queda fuera de esa garantía: pueden consultar el registry y escribir
su caché fuera del repositorio, y la comunicación con el servicio externo la realiza el binario.

Cada ejecución SHALL reportar exactamente uno de estos estados: `pass`, `fail`, `broken`, `skipped` o
`unavailable`, y SHALL mapear el código de salida así: `pass` → 0; `fail` → 1; `broken` → 2;
`skipped` → 0 y `unavailable` → 0. Con `--require`, `skipped` y `unavailable` SHALL salir 2. El mapeo
del exit del binario SHALL ser: 0 → `pass`, 1 → `fail`, 2 → `broken`, cualquier otro → `broken`. El
adaptador NO SHALL interpretar ni parsear el contenido del reporte: lo SHALL transportar tal cual.

`--dry-run` SHALL imprimir el comando resuelto y NO SHALL ejecutar el binario ni el archivo de
configuración del usuario; `tool.source` del preview SHALL reflejar el origen que usaría la corrida
real —`path` si el binario resuelve por `PATH`, `npx` si no—; SHALL reportar el estado `skipped` con
`reason` `dry-run`, y con `--dry-run --require` el exit SHALL ser 2, porque no corrió ninguna aserción.
`--require` SHALL exigir además una sonda de setup verde antes de la corrida real: la ejecución del
binario con su flag de versión, que no requiere credenciales —`--version` no las usa, aunque el proceso
hijo herede el entorno— y no envía código del repo; una sonda rota SHALL
producir `unavailable` con exit 2. `--timeout <ms>` SHALL aceptar sólo un entero mayor a 0 y SHALL
sobrescribir `judge.timeoutMs` para esa corrida.

Con `--json`, el comando SHALL emitir en stdout un envelope JSON estable en todos los caminos, incluido
el exit 2, con estas claves y sin `schemaVersion`: `state`, `reason`, `exitCode`, `enabled`, `tool`
(objeto con `name`, `source` y `version`), `durationMs`, `report` (stdout del binario tal cual, string o
null), `stderr` (string o null) y `required` (booleano del flag `--require`); `command` SHALL aparecer
sólo en `--dry-run`. Ese envelope SHALL emitirse en todos los caminos de la máquina de estados; los
errores de uso —un flag desconocido o un `--timeout` que no es un entero mayor a 0— NO SHALL emitirlo:
salen por stderr con exit 1 antes de la máquina de estados, aun con `--json`. `tool.version` SHALL ser
siempre la versión pinneada `"0.4.1"` del adaptador —el pin que `ancleto` invoca—, y NO SHALL ser la
versión real del binario, que v1 no inspecciona. `reason` SHALL ser null en `pass` y `fail`; en los demás
estados SHALL tomar uno de este vocabulario cerrado: `disabled`, `dry-run`, `tool-unavailable`,
`probe-failed` o `tool-error`. La credencial `TYPESAFE_AI_API_KEY` NO SHALL aparecer en el envelope, en
la salida humana ni en ningún log; SHALL leerse sólo del entorno y NO SHALL aceptarse desde `.ancletorc`.
En el camino humano (sin `--json`), toda corrida que invoca el binario externo SHALL advertir que el
código se envía a un servicio externo de terceros; `skipped`, `unavailable` y `--dry-run` NO SHALL
emitir ese aviso porque no invocan el binario.

`ancleto judge` NO SHALL integrarse en `ancleto check`, en `ancleto specs merge` ni en el archive: esos
comandos NO SHALL invocarlo ni consultar `judge.enabled`, y su salida, su veredicto y su exit code SHALL
ser idénticos con el juez habilitado o deshabilitado.

#### Scenario: Juez deshabilitado o configuración ausente

- **WHEN** `.ancletorc` no declara `judge.enabled`, lo declara `false`, o el archivo no existe o no
  parsea, y se ejecuta `ancleto judge --json`
- **THEN** el estado es `skipped` con `reason` `disabled` y el exit code es 0
- **AND** el envelope JSON se emite con `enabled` en false
- **AND** el binario externo NO SHALL ejecutarse y ningún archivo del proyecto se modifica

#### Scenario: Binario ausente sin `--require`

- **WHEN** el juez está habilitado, el binario no se resuelve por `PATH` y se ejecuta `ancleto judge
  --json`
- **THEN** el estado es `unavailable` con `reason` `tool-unavailable` y el exit code es 0
- **AND** el envelope JSON se emite con `tool.source` null y `tool.version` `"0.4.1"`
- **AND** el comando no escribe archivos

#### Scenario: Binario ausente con `--require`

- **WHEN** el juez está habilitado, el binario no está disponible y se ejecuta `ancleto judge --require
  --json`
- **THEN** el estado es `unavailable` con `reason` `probe-failed` y el exit code es 2
- **AND** el envelope JSON se emite igualmente en el camino de error

#### Scenario: Una assertion fallida del binario

- **WHEN** el binario termina con exit 1
- **THEN** el estado es `fail` y el exit code es 1
- **AND** `report` transporta el stdout del binario tal cual, sin reinterpretarlo

#### Scenario: Setup roto del binario

- **WHEN** el binario termina con exit 2, con un exit distinto de 0, 1 y 2, o falla al ejecutarse
- **THEN** el estado es `broken` y el exit code es 2
- **AND** el envelope JSON se emite en ese camino de error con el `stderr` disponible

#### Scenario: `--dry-run` no ejecuta nada

- **WHEN** se ejecuta `ancleto judge --dry-run`, con o sin `judge.enabled`
- **THEN** el comando imprime el comando resuelto y NO SHALL ejecutar el binario
- **AND** el archivo de configuración del usuario NO SHALL ejecutarse
- **AND** con `--json`, el estado es `skipped` con `reason` `dry-run`
- **AND** el exit code es 0, o 2 si además se pasó `--require`

#### Scenario: `--require` con sonda de setup rota

- **WHEN** el juez está habilitado, `--require` está presente y la sonda de versión del binario falla
- **THEN** el estado es `unavailable` con `reason` `probe-failed` y el exit code es 2
- **AND** NO SHALL ejecutarse la corrida live
- **AND** el envelope JSON se emite en el camino de error

#### Scenario: El juez no altera `check`, `specs merge` ni el archive

- **WHEN** `judge.enabled` es true y se ejecutan `ancleto check`, `ancleto specs merge` o el archive de
  un change
- **THEN** su salida, su veredicto y su exit code son idénticos a los de una ejecución con el juez
  deshabilitado
- **AND** ninguno de esos comandos SHALL invocar `ancleto judge` ni el binario externo

#### Scenario: Un binario viejo tolera la clave nueva

- **WHEN** un `.ancletorc` declara el bloque `judge` y se ejecuta `ancleto check`, `ancleto upgrade` o
  `ancleto judge` con una versión del CLI que no lo conoce o que no lo declara
- **THEN** no se produce error por la clave extra
- **AND** la clave `judge` se preserva en el manifiesto
- **AND** la ausencia de `judge.enabled` degrada a `skipped` sin romper ningún comando
