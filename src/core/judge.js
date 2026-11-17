// Adaptador read-only al juez semantico externo `jev-spec`.
//
// El modulo es puro respecto del filesystem y de la red: no lee `.ancletorc`, no
// resuelve el binario y no spawnea nada. El CLI le pasa el manifiesto ya leido y el
// binario ya resuelto, y decide cuando ejecutar. Asi no hay un segundo dueño de la
// lectura del manifiesto ni del PATH, y el adaptador se puede probar sin procesos.
//
// El reporte del binario NO se parsea: solo se consume su exit code y se transporta
// `stdout`/`stderr` verbatim. La forma del JSON del tool puede cambiar entre versiones
// y el resultado es advisory, nunca un gate de conformidad.

export const JEV_SPEC_PIN = 'jev-spec@0.4.1'
export const JEV_SPEC_VERSION = '0.4.1'
export const DEFAULT_TIMEOUT_MS = 120000
export const PROBE_TIMEOUT_MS = 30000

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// Lectura tolerante: cualquier cosa que no sea el booleano `true` deja el juez
// deshabilitado. Un manifiesto nulo, un `judge` ausente o un `judge` no-objeto no son
// error: degradan a `skipped`.
export function resolveJudgeConfig(manifest) {
  const judge = isObject(manifest) ? manifest.judge : undefined
  if (isObject(judge) && judge.enabled === true) return { enabled: true, reason: 'enabled' }
  return { enabled: false, reason: 'disabled' }
}

// `timeoutMs` de `.ancletorc` (numero entero > 0) con default; el override del flag
// `--timeout`, cuando el CLI ya lo valido, gana.
export function resolveJudgeTimeoutMs(manifest, override) {
  if (Number.isInteger(override) && override > 0) return override
  const judge = isObject(manifest) ? manifest.judge : undefined
  const configured = isObject(judge) ? judge.timeoutMs : undefined
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS
}

// El argv es una constante del release. No hay ningun argumento del usuario en `args`:
// el pin y el flag de sonda son literales de este modulo.
export function buildJudgeCommand({ binPath, probe }) {
  if (binPath) return { cmd: binPath, args: probe ? ['--version'] : ['check'] }
  return {
    cmd: 'npx',
    args: probe ? ['-y', JEV_SPEC_PIN, '--version'] : ['-y', JEV_SPEC_PIN, 'check']
  }
}

// Mapeo del resultado del spawn. `probeOk` se acepta por contrato del llamador pero no
// participa de la tabla: una sonda rota se resuelve como `unavailable` en el CLI.
export function mapToolOutcome(outcome) {
  const { spawnError, timedOut, status } = outcome
  if (spawnError || timedOut) return { state: 'broken', exitCode: 2 }
  if (status === 0) return { state: 'pass', exitCode: 0 }
  if (status === 1) return { state: 'fail', exitCode: 1 }
  return { state: 'broken', exitCode: 2 }
}

function textOrNull(value) {
  return typeof value === 'string' && value.length > 0 ? value : null
}

// Envelope estable y serializable en todos los caminos. Sin `schemaVersion`, sin
// entorno, sin credenciales. `command` solo se incluye cuando el llamador lo pasa
// (`--dry-run`), y `required` refleja el flag `--require`.
export function buildJudgeReport({
  state,
  reason = null,
  exitCode,
  enabled,
  tool,
  durationMs,
  stdout,
  stderr,
  command,
  requireFlag
}) {
  const envelope = {
    state,
    reason: reason === undefined ? null : reason,
    exitCode,
    enabled: enabled === true,
    tool,
    durationMs: Number.isFinite(durationMs) ? durationMs : 0,
    report: textOrNull(stdout),
    stderr: textOrNull(stderr)
  }
  if (command) envelope.command = command
  envelope.required = requireFlag === true
  return envelope
}
