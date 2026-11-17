# Design: Juez externo advisory opcional

> Complementa `proposal.md`. El delta vive en `specs/cli-diagnostics/spec.md` (una capability nueva no
> es archivable: `ancleto specs merge` es fail-closed con `canonical spec not found`,
> `src/cli/index.js:4189-4192`). Este documento no agrega requirements: fija arquitectura, contratos
> operativos, criterio de valor y plan de pruebas.
>
> El merge aplica sólo requirements: al archivar hay que actualizar a mano la prosa de `## Purpose` de
> `cli-diagnostics` para que nombre el juez, o queda una capability cuyo propósito omite una de sus
> superficies.

## 1. Superficie

Subcomando `ancleto judge [--dry-run] [--json] [--require]`, read-only.

- No es `ancleto verify --judge`: ese comando no existe (`src/cli/index.js:5520-5549`).
- No se agrega un `/cleto-judge`: `test/content-guards.test.js:177` pinea el número de archivos de
  `commands/` (`15 + NON_SKILL_COMMANDS.length`), y un comando nuevo obliga a tocar ese pin sin
  necesidad.
- Integración de producto: paso **opcional** en `skills/ancleto-verify/SKILL.md` y mención en
  `skills/ancleto-workflow/SKILL.md`. `ancleto-archive` no se toca (ver §9).

Flags v1: `--dry-run`, `--json`, `--require` y `--timeout <ms>` (override del timeout
configurado, entero > 0). No hay `--target`, `--change` ni `--command`: toda selección de
targets/rúbricas vive en el `jev-spec.config.ts` del usuario. Un flag desconocido es error de uso
(exit 1), como el resto de la CLI.

## 2. Arquitectura

Un módulo cohesivo `src/core/judge.js` + un handler `judgeCommand` en `src/cli/index.js`. No se crea
un directorio `src/core/judge/` con cuatro archivos: no hay consumidor interno de las piezas, y una
API pública sin segundo consumidor es deuda.

```text
judgeCommand(argv)
  └─ runJudge({ cwd, env, dryRun, require })
       ├─ lee .ancletorc              → enabled / timeoutMs (tolerante)
       ├─ si dryRun                   → resuelve, imprime el comando, NO spawnea el tool
       ├─ enabled !== true            → skipped/disabled (no resuelve ni spawnea)
       ├─ resuelve el binario         → PATH | npx -y jev-spec@0.4.1
       ├─ (sólo --require) sonda      → <bin> --version   (offline, sin key)
       ├─ spawn                       → <bin> check
       └─ mapea exit + arma estado/envelope
```

El orden es deliberado: `--dry-run` se resuelve antes del chequeo de `enabled` porque su contrato es
mostrar el comando aun con el juez deshabilitado; el estado es `skipped` con `reason` `dry-run`. Sin
`--dry-run`, un juez deshabilitado no resuelve el binario ni ejecuta ningún proceso del tool.

### Por qué el módulo no importa helpers de `src/cli/index.js`

`src/cli/index.js` es un entrypoint ejecutable: su dispatch `switch (cmd)` corre al importarse
(`src/cli/index.js:5515-5613`). `resolveBin` (`:582-595`) y `readAncletorc` (`:175-183`) no son
importables sin ejecutar la CLI. Por eso el módulo es puro y el CLI es su único dueño de I/O:
`resolveJudgeConfig(manifest)` y `resolveJudgeTimeoutMs(manifest, override)` reciben el manifiesto
ya leído por `readAncletorc`, y `buildJudgeCommand({ binPath, probe })` recibe el binario ya
resuelto por `resolveBin`. El módulo sólo compone argv, mapea el exit y arma el envelope, así que
se prueba sin procesos.

`writeManifest` (`:185-198`) ya preserva keys extra, así que `judge` sobrevive a
`install`/`update`/`upgrade` sin cambios en el manifiesto.

### Spawn

- Todas las invocaciones usan `spawnSync(cmd, args, { encoding: 'utf8', shell: true, timeout,
  maxBuffer: 10 MiB, windowsHide: true })`. `shell: true` es necesario por el shim de `npx`/`.cmd`
  en win32 y es seguro porque el argv es una constante del módulo: no hay argumentos del usuario.
- Binario resuelto por `PATH`: argv `['check']`. Fallback: `npx -y jev-spec@0.4.1` con el mismo
  argv, como Repomix (`src/cli/index.js:2598-2617`).
- Sonda (`--require`): mismo binario con `['--version']`, sin red y sin credenciales.
- `timeoutMs` (default 120000, `judge.timeoutMs` o `--timeout`) agota el spawn →
  `broken`/`tool-error`.
- Sin `--require` y sin binario resoluble no se cae a `npx` (ver §3): no hay forma barata y
  offline de verificar el fallback, y un comando advisory no resuelve por red.

### Por qué no se parsea el reporte

El binario puede cambiar la forma de su JSON entre versiones. El adaptador sólo consume el **exit
code** y transporta `stdout`/`stderr` verbatim en `report`/`stderr`. Esto elimina el acoplamiento de
schema y el falso `pass` por un JSON no reconocido: un binario que cambia de forma pero conserva sus
exit codes sigue funcionando, y uno que devuelve basura con exit 0 es responsabilidad del binario, no
del adaptador (el resultado es advisory, nunca gate de conformidad).

## 3. Estados y exit codes

| Estado | Origen | exit | exit con `--require` |
|---|---|---|---|
| `pass` | binario exit 0 | 0 | 0 |
| `fail` | binario exit 1 | 1 | 1 |
| `broken` | binario exit 2, otro exit, error de spawn o timeout | 2 | 2 |
| `skipped` | `judge.enabled` distinto de `true`, `.ancletorc` ausente/inválido, o `--dry-run` | 0 | 2 |
| `unavailable` | binario irresoluble (`tool-unavailable`) o sonda roja (`probe-failed`) | 0 | 2 |

`reason`: `disabled`, `dry-run`, `tool-unavailable`, `probe-failed`, `tool-error`; `null` en
`pass`/`fail`. Sin `--require`, un binario irresoluble reporta `tool-unavailable` y no spawnea
`npx`: no hay forma barata y offline de verificar el fallback.
`--require` **no reescribe el estado**: convierte el exit de `skipped`/`unavailable` en 2. Así un CI
distingue "no corrió" de "corrió y falló" leyendo `state`, no el exit.

`--dry-run --require` sale 2: no corrió ninguna aserción, y un gate que acepta un dry-run no es gate.

## 4. Configuración

`.ancletorc` (schema aditivo, sin schema cerrado de keys):

```json
{
  "judge": {
    "enabled": false,
    "timeoutMs": 120000
  }
}
```

- `enabled`: default `false`. `ancleto init` no lo habilita ni lo escribe.
- `timeoutMs`: default 120000; valor no numérico o ≤ 0 → default.
- No hay `tool` ni `command` configurables: el pin es una constante del release (D4) y un override de
  argv reintroduciría la superficie de inyección que D6 elimina.

## 5. Contrato `--json`

Envelope estable, sin `schemaVersion`, en **todos** los caminos (incluido exit 2):

```json
{
  "state": "fail",
  "reason": null,
  "exitCode": 1,
  "enabled": true,
  "tool": { "name": "jev-spec", "source": "path", "version": "0.4.1" },
  "durationMs": 412,
  "report": "…stdout del binario, tal cual…",
  "stderr": null
}
```

- `source`: `"path"` | `"npx"` | `null` cuando no se resolvió.
- `version`: `"0.4.1"`, el pin del release que reporta el adaptador. No es una promesa de la
  versión que respondió el binario: el reporte no se parsea.
- `durationMs`: medición local (incluye resolución y spawn), no una promesa de latencia.
- `exitCode`: el que el proceso va a devolver; coincide con la tabla de §3.
- El camino `--json` no mezcla texto humano en stdout; el aviso de egreso sólo vive en el camino
  humano, y la credencial nunca aparece en ninguno de los dos.

## 6. Seguridad

- **Credencial sólo por entorno**: `TYPESAFE_AI_API_KEY`. Nunca en `.ancletorc` (porque `export`
  empaqueta el archivo), nunca en `--json`, nunca en logs ni en mensajes de error. El adaptador no la
  lee ni la imprime: sólo la hereda el binario.
- **Egreso anunciado**: cada corrida humana advierte que el código se envía a un servicio externo de
  terceros. Sin `--json`, la advertencia precede al reporte.
- **`--dry-run` no ejecuta config**: el adaptador no invoca el binario, así que
  `jev-spec.config.ts` no corre. Esto reemplaza la mitigación anterior, que era falsa: `jev-spec`
  ejecuta su config también en su propio `--dry-run`.
- **Sin inyección de shell**: no hay argumentos de usuario; el único `shell: true` es el fallback
  `npx` con argv constante.
- **Sin red en `src/`**: el fetch lo hace el binario; el módulo sólo usa `node:fs`, `node:path` y
  `node:child_process`.
- **Sin escrituras**: el comando no crea ni modifica archivos (ni siquiera `.ancleto/`).

## 7. Compatibilidad

- Un `.ancletorc` con `judge` corre sin cambios en `check`/`upgrade`: `writeManifest` preserva las
  keys extra y ningún consumidor valida un schema cerrado.
- Un `.ancletorc` sin `judge` no rompe nada: `judge` degrada a `skipped`.
- Deriva del tool: el reporte no se parsea (§2); el pin se sube a mano y los tests no dependen de la
  red. Si la versión pinneada desaparece del registry, el comando degrada a `unavailable`, no rompe.
- Sin `dependencies` nuevas: el binario es externo y opcional.

## 8. Rollback

`judge.enabled: false` (o borrar el bloque) restaura el comportamiento previo de forma byte-idéntica:
no hay estado persistido, ni migración, ni residuo activo. Una `TYPESAFE_AI_API_KEY` exportada en el
entorno queda **inerte** porque nadie la lee. Revertir el release es un MINOR sin paso de datos.

## 9. Decisión explícita de no integración

`check`, `specs merge` y el archive **no** consultan `judge.enabled` ni invocan el subcomando:

- `check` conserva `missing > 0 ? 1 : 0` (`src/cli/index.js:3829`) y su oráculo offline; mezclar un
  gate de red con un oráculo offline rompe ambos.
- `specs merge` conserva su fail-closed y su exit (`:4135-4230`); el juez no participa del merge.
- El archive no agrega un segundo gate ni presenta la relevancia como mecánica: el requirement
  `spec:prompt-contracts#Clasificación de conformidad frente a cambio funcional` lo prohíbe
  (`aspec/specs/prompt-contracts/spec.md:1222-1241`). El juez es evidencia para `@reviewer`, no
  veredicto.

## 10. Criterio falsable de valor

El juez es estructuralmente distinto del keyword search léxico de `skills/ancleto-verify/SKILL.md:37`
—devuelve probabilidades calibradas por requirement, no coincidencia de términos—, pero **su valor no
está probado hoy**. El criterio, ejecutable cuando exista una cuenta:

**Dataset etiquetado** sobre una capability canónica:

| Grupo | Casos | Etiqueta esperada |
|---|---|---|
| Correctos | 5 requirements con implementación intacta | positivo |
| Saboteados | 5 copias donde se rompe la invariante del requirement | negativo |
| Refactors | 2 cambios que preservan comportamiento | positivo |
| Keyword-fail | 1 requirement implementado con vocabulario que no aparece literalmente | positivo |

**Métrica y regla de decisión:**

1. AUC ≥ 0.75 separando los 8 positivos de los 5 negativos, sobre el score crudo del tool.
2. El caso keyword-fail SHALL quedar por encima del umbral; si el juez lo reprueba, no agrega nada que
   `ancleto-verify` no tuviera.
3. Un saboteado con score de `pass` en las 5 réplicas invalida la rubric correspondiente (una rubric
   que siempre pasa es peor que ninguna).
4. Dos corridas que den AUC < 0.75 → el juez no se promueve a gate ni se documenta como valor
   probado; queda opt-in sin `--require` en dogfooding.

**Estado actual: no medible.** En este entorno no hay `TYPESAFE_AI_API_KEY` ni cuenta; `check` sin key
sale 2, y `--dry-run`/`--mock` del tool son offline pero no discriminan. Por eso: default off, advisory,
y ninguna afirmación de valor en README/CHANGELOG más allá de "señal opcional, criterio en diseño".

## 11. Plan de pruebas offline

- `test/fixtures/jev-spec-mock.mjs`: binario falso determinista. Modos por entorno
  (`JEV_MOCK_MODE=pass|fail|broken|version-ok|version-broken|no-version`), exit consistente, reporte a
  stdout, `stderr` en `broken`, y un marker (`JEV_MOCK_MARKER`) que registra cada spawn. Sin red.
- PATH señuelo con el patrón ya usado en `test/cli.test.js:43-65` y `test/machine-env.test.js:567-593`:
  `binDir` temporal con `jev-spec` (`sh`) / `jev-spec.cmd` (`cmd`) y un `npx` que falla, para que
  "ausente" y "fallback roto" sean deterministas sin depender de la máquina.
- `.ancletorc` temporal por caso; snapshot de archivos y mtimes antes/después para probar cero
  escrituras.
- Casos: (a) deshabilitado/ausente/inválido → `skipped`/0 y marker ausente; (b) tool ausente → 0 y 2
  con `--require`; (c) exit 1 → `fail`/1; (d) exit 2 y exit 7 → `broken`/2 con JSON; (e) `--dry-run`
  → comando impreso, marker ausente, config no ejecutada (el mock diría si corrió); (f) sonda rota con
  `--require` → 2 y sin corrida live; (g) `check`/`specs merge` con `judge.enabled` true → salida y
  exit idénticos y marker ausente; (h) `.ancletorc` con `judge` → `check`/`upgrade` sin error y clave
  preservada.
- El camino `--json` se valida con `JSON.parse` del stdout en cada caso, incluidos los exit no-cero.

## 12. Riesgos residuales

- **Rubric que siempre pasa**: el criterio §10.3 la invalida, pero sólo se puede correr con cuenta.
  Mientras tanto, `--require` no se usa en el CI de este repo.
- **Specs en español**: el modelo es English-first; las preguntas se escriben en inglés en el config
  del usuario y un umbral no es una prueba.
- **Falso positivo por contenido adversarial**: un comentario que se declara compliant puede mover la
  respuesta. Por eso el resultado se presenta como señal, nunca como veredicto.
- **OSS de un solo mantenedor**: el adaptador degrada a `unavailable`; el pin se sube a mano.
- **Código fuera de la máquina**: el egreso se anuncia en cada corrida humana; las exclusiones
  (`codePaths`) son del usuario y el adaptador no promete redacción que el tool no da.
