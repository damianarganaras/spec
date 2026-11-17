import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_TIMEOUT_MS,
  JEV_SPEC_PIN,
  JEV_SPEC_VERSION,
  buildJudgeCommand,
  buildJudgeReport,
  mapToolOutcome,
  resolveJudgeConfig,
  resolveJudgeTimeoutMs
} from '../src/core/judge.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TEST_DIR, '..')
const CLI = join(ROOT, 'src', 'cli', 'index.js')
const MOCK = join(TEST_DIR, 'fixtures', 'jev-spec-mock.mjs')
const ENABLED = { judge: { enabled: true } }
// Claves del envelope `--json`: estables y sin `schemaVersion`.
const ENVELOPE_KEYS = ['durationMs', 'enabled', 'exitCode', 'reason', 'report', 'required', 'state', 'stderr', 'tool']

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-judge-'))
  try {
    return fn(dir)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort
    }
  }
}

function pathKey() {
  return Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') || 'PATH'
}

// `where`/`which` viven en los directorios de sistema: el PATH aislado los conserva y
// deja fuera todo lo demas, para que "binario ausente" no dependa de la maquina.
function systemDirs() {
  return process.platform === 'win32'
    ? [join(process.env.SystemRoot || 'C:\\Windows', 'System32')]
    : ['/usr/bin', '/bin']
}

function writeToolStub(binDir) {
  const file = join(binDir, process.platform === 'win32' ? 'jev-spec.cmd' : 'jev-spec')
  const body = process.platform === 'win32'
    ? `@echo off\r\n"${process.execPath}" "${MOCK}" %*\r\n`
    : `#!/bin/sh\nexec "${process.execPath}" "${MOCK}" "$@"\n`
  writeFileSync(file, body)
  if (process.platform !== 'win32') chmodSync(file, 0o755)
}

// Decoy de `npx` que falla y deja rastro: prueba que el CLI no cayo al fallback por red.
function writeNpxDecoy(binDir, marker) {
  const file = join(binDir, process.platform === 'win32' ? 'npx.cmd' : 'npx')
  const body = process.platform === 'win32'
    ? `@echo off\r\necho npx spawn >>"%JEV_MOCK_MARKER%"\r\nexit /b 1\r\n`
    : `#!/bin/sh\necho npx spawn >>"$JEV_MOCK_MARKER"\nexit 1\n`
  writeFileSync(file, body)
  if (process.platform !== 'win32') chmodSync(file, 0o755)
  assert.ok(marker)
}

// Escenario completo: `.ancletorc` opcional, PATH senuelo, stub y marker de spawns.
function scenario(dir, { rc, tool = false } = {}) {
  if (rc !== undefined) {
    writeFileSync(join(dir, '.ancletorc'), typeof rc === 'string' ? rc : JSON.stringify(rc))
  }
  const binDir = join(dir, 'bin')
  mkdirSync(binDir, { recursive: true })
  if (tool) writeToolStub(binDir)
  const marker = join(dir, 'spawn.log')
  writeNpxDecoy(binDir, marker)
  const home = join(dir, 'home')
  mkdirSync(home, { recursive: true })
  const env = {
    JEV_MOCK_MARKER: marker,
    HOME: home,
    USERPROFILE: home,
    [pathKey()]: [binDir, ...systemDirs()].join(delimiter)
  }
  return { env, marker }
}

function runCli(args, dir, env = {}) {
  const merged = { ...process.env, ...env }
  // Un `node --test` anidado no debe heredar el contexto interno del runner padre.
  delete merged.NODE_TEST_CONTEXT
  return spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: 'utf8', env: merged })
}

function runJudge(args, dir, env = {}) {
  return runCli(['judge', ...args], dir, env)
}

function spawnLines(marker) {
  if (!existsSync(marker)) return []
  return readFileSync(marker, 'utf8').split(/\r?\n/).filter((line) => line.length > 0)
}

function parseEnvelope(result, label, { command = false } = {}) {
  assert.equal(result.signal, null, `${label}: la corrida no debe morir por senal`)
  let envelope
  try {
    envelope = JSON.parse(result.stdout)
  } catch {
    assert.fail(`${label}: stdout no es JSON parseable: ${JSON.stringify(result.stdout)}`)
  }
  const expected = command ? [...ENVELOPE_KEYS, 'command'].sort() : ENVELOPE_KEYS
  assert.deepEqual(Object.keys(envelope).sort(), expected, `${label}: key set inestable`)
  assert.deepEqual(
    Object.keys(envelope.tool).sort(),
    ['name', 'source', 'version'],
    `${label}: shape de tool inestable`
  )
  assert.equal(envelope.tool.name, 'jev-spec', label)
  assert.equal(envelope.tool.version, JEV_SPEC_VERSION, label)
  return envelope
}

describe('judge — configuracion y estado skipped', () => {
  it('sin la key `judge` reporta skipped/disabled y sale 0 sin spawnear', () => {
    withDir((dir) => {
      const { env, marker } = scenario(dir, { rc: { agent: 'opencode', language: 'auto' }, tool: true })
      const result = runJudge(['--json'], dir, env)
      const envelope = parseEnvelope(result, 'disabled')
      assert.equal(result.status, 0)
      assert.equal(envelope.state, 'skipped')
      assert.equal(envelope.reason, 'disabled')
      assert.equal(envelope.exitCode, 0)
      assert.equal(envelope.enabled, false)
      assert.equal(envelope.tool.source, null)
      assert.equal(envelope.required, false)
      assert.deepEqual(spawnLines(marker), [], 'un juez deshabilitado no resuelve ni ejecuta el tool')
    })
  })

  it('`judge.enabled:false` y `.ancletorc` ausente degradan a skipped/disabled sin crash', () => {
    for (const label of ['enabled false', 'sin archivo']) {
      withDir((dir) => {
        const { env } = scenario(dir, label === 'enabled false' ? { rc: { judge: { enabled: false } } } : {})
        const result = runJudge(['--json'], dir, env)
        const envelope = parseEnvelope(result, label)
        assert.equal(result.status, 0, label)
        assert.equal(envelope.state, 'skipped', label)
        assert.equal(envelope.reason, 'disabled', label)
        assert.equal(envelope.enabled, false, label)
      })
    }
  })

  it('un `.ancletorc` invalido o no-objeto degrada a skipped/disabled sin crash', () => {
    for (const [label, body] of [['json invalido', '{ not json'], ['array', '[]'], ['string', '"nope"']]) {
      withDir((dir) => {
        const { env } = scenario(dir, { rc: body, tool: true })
        const result = runJudge(['--json'], dir, env)
        const envelope = parseEnvelope(result, label)
        assert.equal(result.status, 0, label)
        assert.equal(envelope.state, 'skipped', label)
        assert.equal(envelope.reason, 'disabled', label)
      })
    }
  })

  it('`--require` con el juez deshabilitado sale 2 y conserva el state skipped', () => {
    withDir((dir) => {
      const { env } = scenario(dir, { rc: { judge: { enabled: false } }, tool: true })
      const result = runJudge(['--require', '--json'], dir, env)
      const envelope = parseEnvelope(result, 'require disabled')
      assert.equal(result.status, 2)
      assert.equal(envelope.state, 'skipped')
      assert.equal(envelope.reason, 'disabled')
      assert.equal(envelope.exitCode, 2)
      assert.equal(envelope.required, true)
    })
  })
})

describe('judge — disponibilidad del binario', () => {
  it('sin binario resoluble y sin `--require` reporta unavailable/0 y no cae a npx', () => {
    withDir((dir) => {
      const { env, marker } = scenario(dir, { rc: ENABLED, tool: false })
      const result = runJudge(['--json'], dir, env)
      const envelope = parseEnvelope(result, 'tool ausente')
      assert.equal(result.status, 0)
      assert.equal(envelope.state, 'unavailable')
      // design.md §3: el vocabulario del reason es `tool-unavailable`.
      assert.equal(envelope.reason, 'tool-unavailable')
      assert.equal(envelope.exitCode, 0)
      assert.equal(envelope.enabled, true)
      assert.equal(envelope.tool.source, null)
      assert.equal(envelope.report, null)
      assert.deepEqual(spawnLines(marker), [], 'no se resuelve por red un comando advisory')
    })
  })

  it('`--require` con el binario ausente prueba por `npx` una sola vez y falla sin red', () => {
    withDir((dir) => {
      const { env, marker } = scenario(dir, { rc: ENABLED, tool: false })
      const result = runJudge(['--require', '--json'], dir, env)
      const envelope = parseEnvelope(result, 'require sin binario')
      assert.equal(result.status, 2)
      assert.equal(envelope.state, 'unavailable')
      assert.equal(envelope.reason, 'probe-failed')
      assert.equal(envelope.exitCode, 2)
      assert.equal(envelope.tool.source, 'npx')
      // El unico `npx` del PATH aislado es el stub: una linea del marcador prueba un
      // unico spawn (la sonda) y que no se resolvio ningun `npx` real por otra via.
      assert.ok(existsSync(marker), 'el stub de npx debe dejar rastro')
      // `echo ... >>` en cmd.exe agrega un espacio final: se normaliza por plataforma.
      assert.deepEqual(spawnLines(marker).map((line) => line.trim()), ['npx spawn'])
    })
  })

  it('`--require` con sonda de version rota reporta unavailable/probe-failed sin corrida live', () => {
    withDir((dir) => {
      const { env, marker } = scenario(dir, { rc: ENABLED, tool: true })
      const result = runJudge(['--require', '--json'], dir, { ...env, JEV_MOCK_MODE: 'version-broken' })
      const envelope = parseEnvelope(result, 'probe rota')
      assert.equal(result.status, 2)
      assert.equal(envelope.state, 'unavailable')
      assert.equal(envelope.reason, 'probe-failed')
      assert.equal(envelope.exitCode, 2)
      assert.equal(envelope.tool.source, 'path')
      assert.match(String(envelope.stderr), /JEV_MOCK_STDERR:version/)
      assert.deepEqual(spawnLines(marker), ['--version'], 'la corrida live no debe ejecutarse')
    })
  })

  it('`--require` con sonda verde corre la verificacion y mapea el exit del binario', () => {
    withDir((dir) => {
      const { env, marker } = scenario(dir, { rc: ENABLED, tool: true })
      const result = runJudge(['--require', '--json'], dir, env)
      const envelope = parseEnvelope(result, 'probe verde')
      assert.equal(result.status, 0)
      assert.equal(envelope.state, 'pass')
      assert.equal(envelope.required, true)
      assert.deepEqual(spawnLines(marker), ['--version', 'check'])
    })
  })
})

describe('judge — mapeo del exit del binario', () => {
  it('exit 0 reporta pass/0 y transporta el stdout tal cual', () => {
    withDir((dir) => {
      const { env } = scenario(dir, { rc: ENABLED, tool: true })
      const result = runJudge(['--json'], dir, env)
      const envelope = parseEnvelope(result, 'pass')
      assert.equal(result.status, 0)
      assert.equal(envelope.state, 'pass')
      assert.equal(envelope.reason, null)
      assert.equal(envelope.exitCode, 0)
      assert.equal(envelope.tool.source, 'path')
      assert.equal(envelope.report.trimEnd(), 'JEV_MOCK_REPORT:pass')
      assert.equal(envelope.stderr, null)
    })
  })

  it('exit 1 reporta fail/1 sin reinterpretar el reporte', () => {
    withDir((dir) => {
      const { env } = scenario(dir, { rc: ENABLED, tool: true })
      const result = runJudge(['--json'], dir, { ...env, JEV_MOCK_MODE: 'fail' })
      const envelope = parseEnvelope(result, 'fail')
      assert.equal(result.status, 1)
      assert.equal(envelope.state, 'fail')
      assert.equal(envelope.reason, null)
      assert.equal(envelope.exitCode, 1)
      assert.equal(envelope.report.trimEnd(), 'JEV_MOCK_REPORT:fail')
    })
  })

  it('exit 2 y exit 7 reportan broken/2 con JSON valido y stderr disponible', () => {
    for (const [mode, label] of [['broken', 'exit 2'], ['weird', 'exit 7']]) {
      withDir((dir) => {
        const { env } = scenario(dir, { rc: ENABLED, tool: true })
        const result = runJudge(['--json'], dir, { ...env, JEV_MOCK_MODE: mode })
        const envelope = parseEnvelope(result, label)
        assert.equal(result.status, 2, label)
        assert.equal(envelope.state, 'broken', label)
        assert.equal(envelope.reason, 'tool-error', label)
        assert.equal(envelope.exitCode, 2, label)
        if (mode === 'broken') assert.match(String(envelope.stderr), /JEV_MOCK_STDERR:broken/)
      })
    }
  })

  it('un timeout de corrida es broken/2, nunca unavailable', () => {
    withDir((dir) => {
      const { env } = scenario(dir, { rc: ENABLED, tool: true })
      const result = runJudge(['--json', '--timeout', '150'], dir, {
        ...env,
        JEV_MOCK_MODE: 'sleep',
        JEV_MOCK_SLEEP_MS: '700'
      })
      const envelope = parseEnvelope(result, 'timeout')
      assert.equal(result.status, 2)
      assert.equal(envelope.state, 'broken')
      assert.equal(envelope.reason, 'tool-error')
      assert.equal(envelope.exitCode, 2)
      assert.equal(envelope.enabled, true)
    })
  })
})

describe('judge — dry-run y ayuda', () => {
  it('`--dry-run` imprime el comando, sale 0 y no ejecuta el binario', () => {
    withDir((dir) => {
      const { env, marker } = scenario(dir, { rc: ENABLED, tool: true })
      const result = runJudge(['--dry-run', '--json'], dir, env)
      const envelope = parseEnvelope(result, 'dry-run', { command: true })
      assert.equal(result.status, 0)
      assert.equal(envelope.state, 'skipped')
      assert.equal(envelope.reason, 'dry-run')
      assert.equal(envelope.exitCode, 0)
      assert.equal(envelope.enabled, true)
      assert.equal(envelope.tool.source, 'path')
      assert.match(envelope.command, /jev-spec/)
      assert.match(envelope.command, /check$/)
      assert.deepEqual(spawnLines(marker), [], 'dry-run no ejecuta el binario ni su config')
    })
  })

  it('`--dry-run` con el juez deshabilitado igual muestra el comando resuelto', () => {
    withDir((dir) => {
      const { env, marker } = scenario(dir, { rc: {}, tool: false })
      const result = runJudge(['--dry-run', '--json'], dir, env)
      const envelope = parseEnvelope(result, 'dry-run disabled', { command: true })
      assert.equal(result.status, 0)
      assert.equal(envelope.state, 'skipped')
      assert.equal(envelope.reason, 'dry-run')
      assert.equal(envelope.enabled, false)
      assert.equal(envelope.tool.source, 'npx')
      assert.equal(envelope.command, `npx -y ${JEV_SPEC_PIN} check`)
      assert.deepEqual(spawnLines(marker), [])
    })
  })

  it('`--dry-run --require` sale 2 porque no corrio ninguna asercion', () => {
    withDir((dir) => {
      const { env } = scenario(dir, { rc: ENABLED, tool: true })
      const result = runJudge(['--dry-run', '--require', '--json'], dir, env)
      const envelope = parseEnvelope(result, 'dry-run require', { command: true })
      assert.equal(result.status, 2)
      assert.equal(envelope.state, 'skipped')
      assert.equal(envelope.reason, 'dry-run')
      assert.equal(envelope.exitCode, 2)
      assert.equal(envelope.required, true)
    })
  })

  it('`--help` sale 0 y no spawnear el binario', () => {
    withDir((dir) => {
      const { env, marker } = scenario(dir, { rc: ENABLED, tool: true })
      const result = runJudge(['--help'], dir, env)
      assert.equal(result.status, 0)
      assert.match(result.stdout, /ancleto judge/)
      assert.deepEqual(spawnLines(marker), [])
    })
  })
})

describe('judge — errores de uso', () => {
  it('un flag desconocido o un `--timeout` invalido salen 1 sin spawnear', () => {
    const cases = [
      ['flag desconocido', ['--target', 'src']],
      ['--timeout 0', ['--timeout', '0']],
      ['--timeout abc', ['--timeout', 'abc']],
      ['--timeout sin valor', ['--timeout']]
    ]
    for (const [label, args] of cases) {
      withDir((dir) => {
        const { env, marker } = scenario(dir, { rc: ENABLED, tool: true })
        const result = runJudge(['--json', ...args], dir, env)
        assert.equal(result.status, 1, label)
        assert.match(result.stderr, /ancleto: judge: /, label)
        assert.deepEqual(spawnLines(marker), [], `${label}: un error de uso no ejecuta el tool`)
      })
    }
  })
})

describe('judge — contrato read-only', () => {
  it('ninguna corrida escribe `.ancletorc` ni un archivo testigo', () => {
    withDir((dir) => {
      const { env } = scenario(dir, { rc: ENABLED, tool: true })
      const witness = join(dir, 'witness.txt')
      writeFileSync(witness, 'witness\n')
      const fixed = new Date(Date.now() - 24 * 60 * 60 * 1000)
      for (const file of [join(dir, '.ancletorc'), witness]) utimesSync(file, fixed, fixed)
      const snapshot = () => [join(dir, '.ancletorc'), witness].map((file) => ({
        bytes: readFileSync(file, 'utf8'),
        mtimeMs: statSync(file).mtimeMs
      }))
      const before = snapshot()

      const runs = [
        ['--json'],
        ['--json', '--dry-run'],
        ['--json', '--require'],
        ['--json', '--timeout', '150']
      ]
      const modes = ['pass', 'fail', 'broken', 'sleep']
      for (let i = 0; i < runs.length; i += 1) {
        runJudge(runs[i], dir, { ...env, JEV_MOCK_MODE: modes[i], JEV_MOCK_SLEEP_MS: '50' })
      }

      assert.deepEqual(snapshot(), before)
      assert.equal(readFileSync(witness, 'utf8'), 'witness\n')
    })
  })
})

describe('judge — envelope estable en todos los caminos', () => {
  it('0, 1 y 2 emiten el mismo key set y JSON parseable en stdout', () => {
    const cases = [
      ['skipped/0', {}, ['--json'], 'pass'],
      ['pass/0', ENABLED, ['--json'], 'pass'],
      ['fail/1', ENABLED, ['--json'], 'fail'],
      ['broken/2', ENABLED, ['--json'], 'broken'],
      ['unavailable/0', ENABLED, ['--json'], 'pass', false],
      ['probe-failed/2', ENABLED, ['--json', '--require'], 'version-broken']
    ]
    for (const [label, rc, args, mode, tool = true] of cases) {
      withDir((dir) => {
        const { env } = scenario(dir, { rc, tool })
        const result = runJudge(args, dir, { ...env, JEV_MOCK_MODE: mode })
        const envelope = parseEnvelope(result, label)
        assert.equal(envelope.exitCode, result.status, `${label}: exitCode del envelope == exit real`)
        assert.equal(typeof envelope.durationMs, 'number', label)
        assert.equal(typeof envelope.enabled, 'boolean', label)
        assert.equal(typeof envelope.required, 'boolean', label)
        assert.ok(envelope.report === null || typeof envelope.report === 'string', label)
        assert.ok(envelope.stderr === null || typeof envelope.stderr === 'string', label)
        assert.equal(Object.hasOwn(envelope, 'schemaVersion'), false, `${label}: sin schemaVersion`)
      })
    }
  })
})

describe('judge — contrato de src/core/judge.js', () => {
  it('resolveJudgeConfig solo habilita con el booleano true', () => {
    const enabled = { enabled: true, reason: 'enabled' }
    const disabled = { enabled: false, reason: 'disabled' }
    assert.deepEqual(resolveJudgeConfig({ judge: { enabled: true } }), enabled)
    for (const manifest of [
      null,
      undefined,
      'nope',
      [],
      {},
      { judge: null },
      { judge: [] },
      { judge: 'true' },
      { judge: {} },
      { judge: { enabled: false } },
      { judge: { enabled: 'true' } },
      { judge: { enabled: 1 } }
    ]) {
      assert.deepEqual(resolveJudgeConfig(manifest), disabled, JSON.stringify(manifest))
    }
  })

  it('resolveJudgeTimeoutMs usa el default salvo entero positivo configurado u override valido', () => {
    assert.equal(resolveJudgeTimeoutMs(null), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({}), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: null }), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: 0 } }), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: -1 } }), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: '5000' } }), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: 'abc' } }), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: null } }), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: -5 } }), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: 1.5 } }), DEFAULT_TIMEOUT_MS)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: 5000 } }), 5000)
    // El override del flag gana solo si es un entero > 0.
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: 5000 } }, 25), 25)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: 5000 } }, 0), 5000)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: 5000 } }, 'abc'), 5000)
    assert.equal(resolveJudgeTimeoutMs({ judge: { timeoutMs: 5000 } }, null), 5000)
  })

  it('mapToolOutcome cubre la tabla completa de exit codes', () => {
    const table = [
      [{ status: 0 }, { state: 'pass', exitCode: 0 }],
      [{ status: 1 }, { state: 'fail', exitCode: 1 }],
      [{ status: 2 }, { state: 'broken', exitCode: 2 }],
      [{ status: 7 }, { state: 'broken', exitCode: 2 }],
      [{ status: 130 }, { state: 'broken', exitCode: 2 }],
      [{ status: null }, { state: 'broken', exitCode: 2 }],
      [{ status: 0, spawnError: true }, { state: 'broken', exitCode: 2 }],
      [{ status: 0, timedOut: true }, { state: 'broken', exitCode: 2 }],
      [{ status: 1, spawnError: true }, { state: 'broken', exitCode: 2 }]
    ]
    for (const [outcome, expected] of table) {
      assert.deepEqual(mapToolOutcome(outcome), expected, JSON.stringify(outcome))
    }
  })

  it('buildJudgeCommand no incluye argumentos del usuario en ningun camino', () => {
    for (const probe of [false, true]) {
      const viaPath = buildJudgeCommand({ binPath: '/opt/bin/jev-spec', probe })
      assert.deepEqual(viaPath, { cmd: '/opt/bin/jev-spec', args: probe ? ['--version'] : ['check'] })
      const viaNpx = buildJudgeCommand({ binPath: null, probe })
      assert.deepEqual(viaNpx, {
        cmd: 'npx',
        args: probe ? ['-y', JEV_SPEC_PIN, '--version'] : ['-y', JEV_SPEC_PIN, 'check']
      })
      // Props hostiles del llamador no se filtran al argv.
      const hostile = buildJudgeCommand({
        binPath: '/opt/bin/jev-spec',
        probe,
        args: ['--target', 'src', '--change', 'x'],
        target: '--change'
      })
      assert.deepEqual(hostile.args, probe ? ['--version'] : ['check'])
    }
    assert.equal(JEV_SPEC_PIN, 'jev-spec@0.4.1')
  })

  it('buildJudgeReport arma el envelope estable y `command` solo cuando se pasa', () => {
    const base = {
      state: 'pass',
      exitCode: 0,
      enabled: true,
      tool: { name: 'jev-spec', source: 'path', version: JEV_SPEC_VERSION },
      durationMs: 12,
      stdout: 'ok',
      stderr: ''
    }
    const plain = buildJudgeReport(base)
    assert.deepEqual(Object.keys(plain), [
      'state', 'reason', 'exitCode', 'enabled', 'tool', 'durationMs', 'report', 'stderr', 'required'
    ])
    assert.equal(plain.reason, null)
    assert.equal(plain.report, 'ok')
    assert.equal(plain.stderr, null)
    assert.equal(plain.required, false)

    const dryRun = buildJudgeReport({ ...base, state: 'skipped', reason: 'dry-run', command: 'jev-spec check', requireFlag: true })
    assert.deepEqual(Object.keys(dryRun), [
      'state', 'reason', 'exitCode', 'enabled', 'tool', 'durationMs', 'report', 'stderr', 'command', 'required'
    ])
    assert.equal(dryRun.command, 'jev-spec check')
    assert.equal(dryRun.required, true)

    const degraded = buildJudgeReport({ ...base, durationMs: NaN, stdout: '' })
    assert.equal(degraded.durationMs, 0)
    assert.equal(degraded.report, null)
  })
})

describe('judge — aislado de `check` y `specs merge`', () => {
  // Fixture mínimo de `specs merge`: un delta ADDED y su spec canónica.
  const CANON = [
    '# Spec: alpha', '', '## Purpose', '', 'Purpose for alpha.', '', '## Requirements', '',
    '### Requirement: Existing', '', 'Existing body.', ''
  ].join('\n')
  const DELTA = '## ADDED Requirements\n\n### Requirement: New\n\nNew body.\n'
  const manifest = {
    schemaVersion: 1,
    installedPaths: { templates: [], agents: [], commands: [], skills: [] },
    judge: { enabled: true, timeoutMs: 5000 }
  }

  function writeFixture(dir) {
    const canonical = join(dir, 'aspec', 'specs', 'alpha', 'spec.md')
    mkdirSync(dirname(canonical), { recursive: true })
    writeFileSync(canonical, CANON)
    const delta = join(dir, 'aspec', 'changes', 'ch', 'specs', 'alpha', 'spec.md')
    mkdirSync(dirname(delta), { recursive: true })
    writeFileSync(delta, DELTA)
    return canonical
  }

  it('ninguno invoca el juez ni el binario, y su salida y exit no cambian', () => {
    const cases = [
      ['check', ['check'], (out) => assert.match(out, /0 faltantes/)],
      ['specs merge --dry-run', ['specs', 'merge', '--change', 'ch', '--dry-run', '--json'], (out) => {
        assert.equal(JSON.parse(out).ok, true)
      }]
    ]
    for (const [label, args, verify] of cases) {
      withDir((dir) => {
        const canonical = writeFixture(dir)
        // PATH señuelo con el stub de `jev-spec` resoluble: si cualquiera de los dos
        // comandos invocara al juez, el fixture escribiría una línea en el marcador.
        const { env, marker } = scenario(dir, { rc: manifest, tool: true })
        const before = readFileSync(canonical, 'utf8')

        const enabled = runCli(args, dir, env)
        assert.equal(enabled.signal, null, label)
        assert.equal(enabled.status, 0, `${label}: exit actual; stderr: ${enabled.stderr}`)
        verify(enabled.stdout)
        assert.equal(existsSync(marker), false, `${label}: no debe spawnear jev-spec ni npx`)
        // `specs merge --dry-run` es read-only: la canónica queda intacta.
        assert.equal(readFileSync(canonical, 'utf8'), before, label)

        // Baseline con el juez deshabilitado: salida y exit deben ser idénticos.
        writeFileSync(join(dir, '.ancletorc'), `${JSON.stringify({ ...manifest, judge: { enabled: false } })}\n`)
        const disabled = runCli(args, dir, env)
        assert.equal(disabled.status, enabled.status, label)
        assert.equal(disabled.stdout, enabled.stdout, `${label}: salida idéntica con el juez off`)
      })
    }
  })
})

describe('judge — compatibilidad del manifiesto', () => {
  it('un `.ancletorc` con la key `judge` no rompe `ancleto check` ni se reescribe', () => {
    withDir((dir) => {
      const manifest = {
        schemaVersion: 1,
        installedPaths: { templates: [], agents: [], commands: [], skills: [] },
        judge: { enabled: true, timeoutMs: 5000 }
      }
      const rcPath = join(dir, '.ancletorc')
      writeFileSync(rcPath, `${JSON.stringify(manifest, null, 2)}\n`)
      const before = readFileSync(rcPath, 'utf8')

      const result = runCli(['check'], dir)

      assert.equal(result.status, 0, result.stderr)
      assert.match(result.stdout, /0 faltantes/)
      // `check` es read-only: la key que no conoce ni interpreta se preserva intacta.
      assert.equal(readFileSync(rcPath, 'utf8'), before)
      assert.deepEqual(JSON.parse(readFileSync(rcPath, 'utf8')).judge, manifest.judge)
    })
  })
})
