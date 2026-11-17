# Juez semántico advisory (`ancleto judge`)

`ancleto judge` es un subcomando **read-only, opt-in y advisory** que envuelve el binario
externo [`jev-spec`](https://www.npmjs.com/package/jev-spec) para producir una señal semántica
por requirement sobre las specs canónicas del proyecto.

No agrega dependencias de runtime: el binario es externo, se resuelve por `PATH` y, si falta,
se obtiene con `npx -y jev-spec@0.4.1` (pin exacto, nunca `latest`). ancleto no habla HTTP ni
escribe archivos: el adaptador solo consume el exit code y transporta `stdout`/`stderr` tal cual.

## Qué hace y qué no hace

- **Hace:** corre `jev-spec check` con los targets y las rúbricas que declara el
  `jev-spec.config.ts` del usuario y reporta `pass` / `fail` / `broken` / `skipped` /
  `unavailable`.
- **No hace:** no genera rúbricas, no acepta `--target` ni `--change`, no pasa argumentos del
  usuario al binario, no interpreta el reporte y no escribe archivos.
- **Nunca es gate:** `ancleto check`, `ancleto specs merge` y el archive no lo invocan ni
  consultan `judge.enabled`; su salida y su exit code son idénticos con el juez encendido o
  apagado. Un `pass` no prueba conformidad y un `fail` no bloquea el archive.

## Habilitación (opt-in, default off)

```json
{
  "judge": {
    "enabled": true,
    "timeoutMs": 120000
  }
}
```

- `judge.enabled` debe ser el booleano `true`. Ausente, `false`, un `.ancletorc` inexistente o
  un JSON inválido dejan el juez **deshabilitado** (`skipped`, exit 0).
- `ancleto init` no lo habilita. `timeoutMs` es opcional: entero > 0; default 120000.
- El flag `--timeout <ms>` (entero > 0) gana sobre `timeoutMs`.
- La clave `judge` es aditiva: `install`/`update`/`upgrade` la preservan y `check` la ignora.

## Uso

```bash
ancleto judge --json                 # envelope JSON en stdout
ancleto judge                        # salida humana + aviso de egreso
ancleto judge --dry-run              # imprime el comando resuelto, no ejecuta nada
ancleto judge --require --json       # exige setup verde; sale 2 si no corrió
```

Flags permitidos: `--json`, `--require`, `--dry-run`, `--timeout <ms>`. Cualquier otro flag es
error de uso (exit 1).

## Credencial y egreso de código

- La API key se lee **solo** de la variable de entorno `TYPESAFE_AI_API_KEY`. Nunca se acepta
  desde `.ancletorc` (porque `ancleto export` empaqueta ese archivo), nunca aparece en el
  envelope `--json`, en logs ni en mensajes de error.
- Cada corrida humana (sin `--json`) advierte que el binario externo puede enviar contenido del
  repo a un servicio de terceros. ancleto no promete redacción: las exclusiones son
  responsabilidad del `codePaths` del usuario.
- **`--dry-run` no ejecuta la config:** ancleto imprime el comando y no invoca el binario, así
  que `jev-spec.config.ts` nunca corre en ese camino (el `--dry-run` del propio tool sí lo
  ejecuta; por eso no se reenvía).

## Exit codes

| Estado | Origen | exit | con `--require` |
|---|---|---|---|
| `pass` | binario exit 0 | 0 | 0 |
| `fail` | binario exit 1 | 1 | 1 |
| `broken` | binario exit 2, otro exit, error de spawn o timeout | 2 | 2 |
| `skipped` | `judge.enabled` distinto de `true`, `.ancletorc` ausente/inválido, o `--dry-run` | 0 | 2 |
| `unavailable` | binario no resuelto (`tool-unavailable`) o sonda roja (`probe-failed`) | 0 | 2 |

`--require` no reescribe el estado: solo convierte el exit de `skipped`/`unavailable` en 2. Un CI
distingue "no corrió" de "corrió y falló" leyendo `state`, no el exit. Sin `--require` y sin
binario disponible, el comando no cae a `npx`: reporta `unavailable` sin spawnear y sale 0.

## Contrato `--json`

Envelope estable en todos los caminos, incluido exit 2, sin `schemaVersion`:

```json
{
  "state": "fail",
  "reason": null,
  "exitCode": 1,
  "enabled": true,
  "tool": { "name": "jev-spec", "version": "0.4.1", "source": "path" },
  "durationMs": 412,
  "report": "…stdout del binario…",
  "stderr": null,
  "required": false
}
```

`reason` es `null` en `pass`/`fail` y nombra el motivo en el resto (`disabled`, `dry-run`,
`tool-unavailable`, `probe-failed`, `tool-error`). `command` se incluye solo en `--dry-run`.

## Rollback

Poner `judge.enabled: false` (o borrar el bloque `judge`) restaura el comportamiento previo de
forma byte-idéntica: no hay estado persistido, ni migración, ni residuo activo. Una
`TYPESAFE_AI_API_KEY` exportada en el entorno queda inerte porque nadie la lee.

## Límites y estado del criterio de valor

- El modelo de `jev-spec` es English-first; un umbral no es una prueba de conformidad.
- El contenido adversarial puede mover la respuesta: el resultado se presenta como señal, nunca
  como veredicto.
- `jev-spec` es un OSS de un solo mantenedor: el pin se sube a mano y el adaptador degrada a
  `unavailable` si el binario desaparece o cambia.
- El criterio falsable de valor (AUC >= 0.75 sobre requirements correctos, saboteados, refactors
  y un caso donde el keyword search falla) **no está medido** en este entorno: no hay cuenta ni
  `TYPESAFE_AI_API_KEY`. Por eso el default es off y `--require` no se usa en el CI del repo.
- `npx` no es offline: consulta el registry y escribe su caché fuera del repo (`~/.npm/_npx`), así
  que `--require` sin binario local necesita red.
- En win32 `resolveBin` usa `where`, que también busca el directorio actual: un `jev-spec.cmd`
  commiteado en el repo se resolvería y se spawnearía con `shell: true` si `judge.enabled` está
  activo.
- El override persistente del timeout es `judge.timeoutMs`; `--timeout <ms>` gana por corrida.
