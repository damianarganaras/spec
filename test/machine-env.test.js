import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, copyFileSync, linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  detectMachineFacts,
  machineEnvPath,
  renderMachineEnv,
  TOOL_PROBE_TIMEOUT_MS,
  writeMachineEnv
} from '../src/core/machine-env.js'

const GENERATED_AT = '2026-01-02T03:04:05.000Z'
const TOOL_ORDER = ['rg', 'node', 'npm', 'git', 'python']
const GIT_PROBE = spawnSync('git', ['--version'], { encoding: 'utf8' })
const GIT_READY = !GIT_PROBE.error && GIT_PROBE.status === 0

function git(args, cwd) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' })
}

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-machine-env-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
}

// Herramienta realmente invocable: en POSIX un script con shebang y en Windows un
// ejecutable nativo (enlace duro al binario de node, con copia como fallback). Resolver
// en PATH no alcanza: la sonda exige que el binario se pueda ejecutar.
function writeInvokableTool(dir, name) {
  const file = join(dir, process.platform === 'win32' ? `${name}.exe` : name)
  if (process.platform === 'win32') {
    try {
      linkSync(process.execPath, file)
    } catch {
      copyFileSync(process.execPath, file)
    }
  } else {
    writeFileSync(file, '#!/bin/sh\nexit 0\n')
    chmodSync(file, 0o755)
  }
  return file
}

// Resuelve en PATH pero no se puede invocar: el archivo existe y no es un binario valido.
function writeUninvokableTool(dir, name) {
  const file = join(dir, process.platform === 'win32' ? `${name}.exe` : name)
  writeFileSync(file, 'no es un ejecutable')
  if (process.platform !== 'win32') chmodSync(file, 0o755)
  return file
}

function fixedFacts(overrides = {}) {
  return {
    platform: 'linux',
    osRelease: '6.8.0-test',
    arch: 'x64',
    shell: 'bash',
    shell_source: 'process.env.SHELL',
    eol: 'lf',
    eol_source: 'core.eol',
    tools: [
      { name: 'rg', available: true, fallback: null },
      { name: 'node', available: true, fallback: null },
      { name: 'npm', available: false, fallback: 'pnpm o yarn si existen' },
      { name: 'git', available: true, fallback: null },
      { name: 'python', available: false, fallback: 'python3' }
    ],
    ancletoVersion: '9.9.9',
    ...overrides
  }
}

// Directorio temporal que NO es repositorio git: la deteccion de EOL cae al default
// de plataforma y los tests no dependen de configuracion git de la maquina.
function nonRepoDir(dir) {
  return dir
}

describe('machine-env - render', () => {
  it('es deterministico y respeta el orden de secciones y el salto final', () => {
    const facts = fixedFacts()
    const first = renderMachineEnv(facts, { generatedAt: GENERATED_AT })
    const second = renderMachineEnv(facts, { generatedAt: GENERATED_AT })

    assert.equal(first, second)
    assert.ok(first.startsWith('# Machine Environment\n'))
    assert.ok(first.endsWith('\n'))
    assert.match(first, new RegExp(`^- generated_at: ${GENERATED_AT}$`, 'm'))
    assert.match(first, /^- ancleto: 9\.9\.9$/m)
    assert.match(first, /^- platform: linux$/m)
    assert.match(first, /^- os_release: 6\.8\.0-test$/m)
    assert.match(first, /^- arch: x64$/m)
    assert.match(first, /^- shell: bash$/m)
    assert.match(first, /^- shell_source: process\.env\.SHELL$/m)
    assert.match(first, /^- eol: lf$/m)
    assert.match(first, /^- eol_source: core\.eol$/m)

    const order = ['## Platform', '## Shell', '## Line endings', '## Tools', '## Hint']
      .map((section) => first.indexOf(section))
    assert.ok(order.every((idx) => idx >= 0), 'todas las secciones presentes')
    assert.deepEqual(order, [...order].sort((a, b) => a - b), 'secciones en orden fijo')
  })

  it('declara unknown en los campos no determinados en lugar de inventarlos', () => {
    const out = renderMachineEnv({}, { generatedAt: GENERATED_AT })
    assert.match(out, /^- platform: unknown$/m)
    assert.match(out, /^- os_release: unknown$/m)
    assert.match(out, /^- arch: unknown$/m)
    assert.match(out, /^- shell: unknown$/m)
    assert.match(out, /^- shell_source: unknown$/m)
    assert.match(out, /^- eol: unknown$/m)
    assert.match(out, /^- eol_source: unknown$/m)
  })

  it('mantiene el orden fijo de herramientas y una linea de fallback por ausente', () => {
    const facts = fixedFacts({
      tools: [
        { name: 'rg', available: false, fallback: 'grep -R' },
        { name: 'node', available: true, fallback: null },
        { name: 'npm', available: false, fallback: 'pnpm o yarn si existen' },
        { name: 'git', available: false, fallback: 'ninguno (reportar)' },
        { name: 'python', available: true, fallback: null }
      ]
    })
    const out = renderMachineEnv(facts, { generatedAt: GENERATED_AT })
    const toolLines = out.split('\n').filter((line) => /^- (rg|node|npm|git|python):/.test(line))

    assert.deepEqual(toolLines.map((line) => line.split(':')[0].slice(2)), TOOL_ORDER)
    assert.equal(toolLines[0], '- rg: no disponible — fallback: grep -R')
    assert.equal(toolLines[2], '- npm: no disponible — fallback: pnpm o yarn si existen')
    assert.equal(toolLines[3], '- git: no disponible — fallback: ninguno (reportar)')
    assert.ok(toolLines[1].includes('disponible') && !toolLines[1].includes('fallback'))
    assert.ok(toolLines[4].includes('disponible') && !toolLines[4].includes('fallback'))
  })

  it('distingue una herramienta bloqueada de una ausente y expone el fallo observado', () => {
    const facts = fixedFacts({
      tools: [
        { name: 'rg', available: false, fallback: 'grep -R', blocked: true, reason: 'no se pudo ejecutar rg (ENOEXEC)' },
        { name: 'node', available: true, fallback: null, blocked: false, reason: null },
        { name: 'npm', available: false, fallback: 'pnpm o yarn si existen', blocked: false, reason: null },
        { name: 'git', available: true, fallback: null, blocked: false, reason: null },
        { name: 'python', available: false, fallback: 'python3', blocked: false, reason: null }
      ]
    })
    const out = renderMachineEnv(facts, { generatedAt: GENERATED_AT })
    const toolLines = out.split('\n').filter((line) => /^- (rg|node|npm|git|python):/.test(line))

    assert.equal(
      toolLines[0],
      '- rg: no disponible — fallback: grep -R — bloqueado: no se pudo ejecutar rg (ENOEXEC)'
    )
    assert.equal(toolLines[2], '- npm: no disponible — fallback: pnpm o yarn si existen')
  })

  it('no emite versiones de herramientas ni heredoc/quoting/PATHEXT', () => {
    const out = renderMachineEnv(fixedFacts(), { generatedAt: GENERATED_AT })
    const toolsSection = out.split('## Tools')[1].split('## Hint')[0]
    assert.doesNotMatch(toolsSection, /\d+\.\d+/)
    for (const name of TOOL_ORDER) {
      assert.match(toolsSection, new RegExp(`^- ${name}: (disponible|no disponible)`, 'm'))
    }
    assert.doesNotMatch(out, /PATHEXT|heredoc|quoting|codepage/i)
  })
})

describe('machine-env - deteccion de shell', () => {
  const LEGACY_PS_MODULE_PATH = 'C:/Windows/System32/WindowsPowerShell/v1.0/Modules'

  function shellFacts(dir, platform, env) {
    return detectMachineFacts({
      platform,
      env,
      cwd: nonRepoDir(dir),
      osRelease: 'test-release',
      arch: 'x64',
      path: dir
    })
  }

  it('detecta las variantes consistentes con su fuente', () => {
    withDir((dir) => {
      const cases = [
        {
          name: 'Windows PowerShell 5.1 con solo el marcador legacy',
          platform: 'win32',
          env: { PSModulePath: LEGACY_PS_MODULE_PATH },
          shell: 'Windows PowerShell 5.1',
          source: 'PSModulePath'
        },
        {
          name: 'PowerShell 7',
          platform: 'win32',
          env: { PSModulePath: 'C:/Program Files/PowerShell/7/Modules' },
          shell: 'PowerShell 7',
          source: 'PSModulePath'
        },
        {
          name: 'cmd por PROMPT',
          platform: 'win32',
          env: { PROMPT: '$P$G' },
          shell: 'cmd',
          source: 'PROMPT'
        },
        {
          name: 'bash/WSL por distro',
          platform: 'linux',
          env: { WSL_DISTRO_NAME: 'Ubuntu' },
          shell: 'bash/WSL',
          source: 'WSL_DISTRO_NAME'
        },
        {
          name: 'bash/WSL por interop',
          platform: 'linux',
          env: { WSL_INTEROP: '/run/WSL/1_interop' },
          shell: 'bash/WSL',
          source: 'WSL_INTEROP'
        },
        {
          name: 'POSIX zsh',
          platform: 'linux',
          env: { SHELL: '/bin/zsh' },
          shell: 'zsh',
          source: 'SHELL'
        }
      ]

      for (const c of cases) {
        const facts = shellFacts(dir, c.platform, c.env)
        assert.equal(facts.shell, c.shell, c.name)
        assert.equal(facts.shell_source, c.source, c.name)
      }
    })
  })

  it('Git Bash/MSYS en Windows gana a ComSpec y al PSModulePath heredado', () => {
    withDir((dir) => {
      const facts = shellFacts(dir, 'win32', {
        SHELL: '/usr/bin/bash',
        MSYSTEM: 'MINGW64',
        ComSpec: 'C:/Windows/System32/cmd.exe',
        PSModulePath: LEGACY_PS_MODULE_PATH
      })
      assert.equal(facts.shell, 'bash')
      assert.equal(facts.shell_source, 'MSYSTEM')
    })
  })

  it('CYGWIN declara bash con su propia fuente', () => {
    withDir((dir) => {
      const facts = shellFacts(dir, 'win32', { CYGWIN: '1', PSModulePath: LEGACY_PS_MODULE_PATH })
      assert.equal(facts.shell, 'bash')
      assert.equal(facts.shell_source, 'CYGWIN')
    })
  })

  it('PowerShell 7 gana aunque PSModulePath tambien traiga el marcador legacy', () => {
    withDir((dir) => {
      const facts = shellFacts(dir, 'win32', {
        PSModulePath: `${LEGACY_PS_MODULE_PATH};C:/Program Files/PowerShell/7/Modules`
      })
      assert.equal(facts.shell, 'PowerShell 7')
      assert.equal(facts.shell_source, 'PSModulePath')
    })
  })

  it('PROMPT gana sobre un PSModulePath legacy heredado', () => {
    withDir((dir) => {
      const facts = shellFacts(dir, 'win32', {
        PROMPT: '$P$G',
        PSModulePath: LEGACY_PS_MODULE_PATH
      })
      assert.equal(facts.shell, 'cmd')
      assert.equal(facts.shell_source, 'PROMPT')
    })
  })

  it('declara unknown sin senal de shell', () => {
    withDir((dir) => {
      for (const platform of ['win32', 'linux', 'darwin']) {
        const facts = shellFacts(dir, platform, {})
        assert.equal(facts.shell, 'unknown', platform)
        assert.equal(facts.shell_source, 'unknown', platform)
      }
    })
  })

  it('solo ComSpec no es evidencia de shell', () => {
    withDir((dir) => {
      const facts = shellFacts(dir, 'win32', { ComSpec: 'C:/Windows/System32/cmd.exe' })
      assert.equal(facts.shell, 'unknown')
      assert.equal(facts.shell_source, 'unknown')
    })
  })

  it('declara unknown ante conflicto genuino entre SHELL POSIX y el marcador legacy', () => {
    withDir((dir) => {
      const facts = shellFacts(dir, 'win32', {
        SHELL: '/bin/bash',
        PSModulePath: LEGACY_PS_MODULE_PATH,
        ComSpec: 'C:/Windows/System32/cmd.exe'
      })
      assert.equal(facts.shell, 'unknown')
      assert.equal(facts.shell_source, 'unknown')
    })
  })
})

describe('machine-env - deteccion de herramientas', () => {
  it('usa el orden fijo y el fallback por herramienta ausente', () => {
    withDir((dir) => {
      const facts = detectMachineFacts({
        platform: 'linux',
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: join(dir, 'vacio'),
        pathext: ''
      })

      assert.deepEqual(facts.tools.map((tool) => tool.name), TOOL_ORDER)
      assert.deepEqual(facts.tools.map((tool) => tool.available), [false, false, false, false, false])
      assert.equal(facts.tools[0].fallback, 'grep -R')
      assert.equal(facts.tools[1].fallback, 'nodejs o el binario absoluto del runtime')
      assert.equal(facts.tools[2].fallback, 'pnpm o yarn si existen')
      assert.equal(facts.tools[3].fallback, 'ninguno (reportar)')
      assert.equal(facts.tools[4].fallback, 'python3')
    })
  })

  it('reporta disponible solo lo que se puede invocar', () => {
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      writeInvokableTool(binDir, 'rg')
      writeInvokableTool(binDir, 'node')

      const facts = detectMachineFacts({
        platform: process.platform,
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: binDir,
        pathext: ''
      })

      const byName = Object.fromEntries(facts.tools.map((tool) => [tool.name, tool]))
      assert.equal(byName.rg.available, true)
      assert.equal(byName.node.available, true)
      assert.equal(byName.npm.available, false)
      assert.equal(byName.git.available, false)
      assert.equal(byName.python.available, false)
      assert.deepEqual(facts.tools.map((tool) => tool.name), TOOL_ORDER)
    })
  })

  it('una herramienta que resuelve pero falla al invocarse no se reporta como disponible y expone el fallo', () => {
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      writeUninvokableTool(binDir, 'rg')

      const facts = detectMachineFacts({
        platform: process.platform,
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: binDir,
        pathext: ''
      })

      const rg = facts.tools.find((tool) => tool.name === 'rg')
      assert.equal(rg.available, false, 'no es una herramienta disponible')
      assert.equal(rg.blocked, true, 'resuelve pero no se puede invocar')
      assert.ok(rg.reason && rg.reason.length > 0, 'expone el fallo observado')
      assert.match(rg.reason, /rg/)

      const out = renderMachineEnv(facts, { generatedAt: GENERATED_AT })
      const line = out.split('\n').find((entry) => entry.startsWith('- rg:'))
      assert.match(line, /^- rg: no disponible — fallback: /)
      assert.match(line, /— bloqueado: /)
      assert.ok(line.includes(rg.reason), 'la linea incluye el fallo observado')
      assert.doesNotMatch(line, /^- rg: disponible$/)
    })
  })

  it('distingue un exit no cero de un fallo de spawn y expone la causa observada', (t) => {
    if (process.platform === 'win32') {
      t.skip('un script POSIX con exit no cero no es invocable como ejecutable nativo en win32')
      return
    }
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)

      // Corre pero falla: la primera linea de stderr es la causa.
      const withStderr = join(dir, 'con-stderr')
      mkdirSync(withStderr)
      writeFileSync(join(withStderr, 'rg'), '#!/bin/sh\necho "probe fallo" >&2\nexit 3\n')
      chmodSync(join(withStderr, 'rg'), 0o755)

      // Corre pero falla en silencio: se reporta el codigo de salida.
      const silent = join(dir, 'silencioso')
      mkdirSync(silent)
      writeFileSync(join(silent, 'rg'), '#!/bin/sh\nexit 4\n')
      chmodSync(join(silent, 'rg'), 0o755)

      const probe = (path) => detectMachineFacts({
        platform: 'linux',
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path,
        pathext: ''
      }).tools.find((tool) => tool.name === 'rg')

      const stderrTool = probe(withStderr)
      assert.equal(stderrTool.available, false)
      assert.equal(stderrTool.blocked, true)
      assert.equal(stderrTool.reason, 'probe fallo')

      const silentTool = probe(silent)
      assert.equal(silentTool.available, false)
      assert.equal(silentTool.blocked, true)
      assert.match(silentTool.reason, /no se pudo ejecutar rg \(codigo 4\)/)
    })
  })

  it('una herramienta que nunca termina queda acotada por el timeout de la sonda', (t) => {
    if (process.platform === 'win32') {
      t.skip('win32 no permite crear un ejecutable nativo que se cuelgue')
      return
    }
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      const hanging = join(binDir, 'rg')
      writeFileSync(hanging, '#!/bin/sh\nsleep 30\n')
      chmodSync(hanging, 0o755)

      const startedAt = Date.now()
      const rg = detectMachineFacts({
        platform: 'linux',
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: binDir,
        pathext: ''
      }).tools.find((tool) => tool.name === 'rg')
      const elapsed = Date.now() - startedAt

      assert.equal(rg.available, false)
      assert.equal(rg.blocked, true)
      assert.ok(rg.reason && rg.reason.length > 0, 'expone el fallo observado')
      assert.ok(
        elapsed < TOOL_PROBE_TIMEOUT_MS * 2,
        `la sonda debe cortar por timeout (tardo ${elapsed} ms, timeout ${TOOL_PROBE_TIMEOUT_MS} ms)`
      )
    })
  })

  it('un shim .cmd invocable en win32 se reporta como disponible', (t) => {
    if (process.platform !== 'win32') {
      t.skip('un shim .cmd solo es invocable por ComSpec en win32')
      return
    }
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      // Shim de batch: en Node >= 18.20 no se puede lanzar sin shell (EINVAL), asi que
      // la sonda lo enruta por ComSpec.
      writeFileSync(join(binDir, 'rg.cmd'), '@echo off\r\necho rg 14.0.0\r\n')

      const facts = detectMachineFacts({
        platform: 'win32',
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: binDir,
        pathext: '.EXE;.CMD;.BAT;.COM'
      })

      const rg = facts.tools.find((tool) => tool.name === 'rg')
      assert.equal(rg.available, true, 'el shim se pudo ejecutar por ComSpec')
      assert.equal(rg.blocked, false, 'un shim funcional no esta bloqueado')
      assert.equal(rg.inconclusive, false, 'el veredicto es concluyente')
    })
  })

  it('el motivo de un fallo se acota y no arrastra secuencias ANSI ni de control', () => {
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      const payload = `a\u001b[31m${'x'.repeat(600)}\u001b[0m`
      if (process.platform === 'win32') {
        writeFileSync(join(binDir, 'rg.cmd'), `@echo off\r\necho ${payload} 1>&2\r\nexit /b 3\r\n`)
      } else {
        const file = join(binDir, 'rg')
        writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' '${payload}' >&2\nexit 3\n`)
        chmodSync(file, 0o755)
      }

      const facts = detectMachineFacts({
        platform: process.platform,
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: binDir,
        pathext: '.EXE;.CMD;.BAT;.COM'
      })

      const rg = facts.tools.find((tool) => tool.name === 'rg')
      assert.equal(rg.available, false)
      assert.equal(rg.blocked, true)
      assert.ok(rg.reason.length <= 200, `el motivo se acota (${rg.reason.length} chars)`)
      assert.doesNotMatch(rg.reason, /[\u0000-\u001f\u007f]/, 'sin secuencias ANSI ni de control')

      const out = renderMachineEnv(facts, { generatedAt: GENERATED_AT })
      const line = out.split('\n').find((entry) => entry.startsWith('- rg:'))
      assert.ok(line.length < 320, `la linea del artefacto se acota (${line.length} chars)`)
    })
  })

  it('un candidato abandonado por el presupuesto queda inconcluso y no disponible', () => {
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      writeInvokableTool(binDir, 'rg')

      const facts = detectMachineFacts({
        platform: process.platform,
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: binDir,
        pathext: '',
        probeBudgetMs: 0
      })

      const rg = facts.tools.find((tool) => tool.name === 'rg')
      assert.equal(rg.available, false, 'sin sondear no se puede afirmar que sea disponible')
      assert.equal(rg.blocked, false, 'sin fallo real no hay veredicto bloqueado')
      assert.equal(rg.inconclusive, true, 'el candidato abandonado queda inconcluso')

      const out = renderMachineEnv(facts, { generatedAt: GENERATED_AT })
      const line = out.split('\n').find((entry) => entry.startsWith('- rg:'))
      assert.match(line, /^- rg: no disponible — fallback: /)
      assert.doesNotMatch(line, /— bloqueado: /, 'un veredicto inconcluso no se reporta como bloqueado')
    })
  })

  it('no filtra credenciales, variables senuelo ni el valor de PATH', () => {
    withDir((dir) => {
      const pathSentinel = 'ancleto-path-sentinel'
      const binDir = join(dir, pathSentinel)
      mkdirSync(binDir)
      const decoys = {
        TOKEN: 'token-sentinel-value',
        GITHUB_TOKEN: 'ghp-sentinel-value',
        AWS_SECRET_ACCESS_KEY: 'aws-sentinel-value'
      }

      const facts = detectMachineFacts({
        platform: 'linux',
        env: { ...decoys, PATH: binDir },
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        pathext: ''
      })
      const out = renderMachineEnv(facts, { generatedAt: GENERATED_AT })

      for (const value of [pathSentinel, ...Object.values(decoys)]) {
        assert.ok(!out.includes(value), `el render no debe incluir ${value}`)
      }
      assert.ok(!JSON.stringify(facts).includes(pathSentinel), 'los hechos no exponen PATH')
      assert.ok(!JSON.stringify(facts).includes('sentinel-value'), 'los hechos no exponen variables senuelo')
    })
  })

  it('usa el platform inyectado en la comprobacion de acceso del ejecutable', (t) => {
    if (process.platform === 'win32') {
      t.skip('en win32 no aplica el bit X_OK')
      return
    }
    withDir((dir) => {
      const binDir = join(dir, 'bin')
      mkdirSync(binDir)
      const file = writeInvokableTool(binDir, 'rg')
      chmodSync(file, 0o644)

      const asLinux = detectMachineFacts({
        platform: 'linux',
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: binDir,
        pathext: ''
      })
      const asWindows = detectMachineFacts({
        platform: 'win32',
        env: {},
        cwd: nonRepoDir(dir),
        osRelease: 'test-release',
        arch: 'x64',
        path: binDir,
        pathext: ''
      })

      const asLinuxRg = asLinux.tools.find((tool) => tool.name === 'rg')
      const asWindowsRg = asWindows.tools.find((tool) => tool.name === 'rg')
      assert.equal(asLinuxRg.available, false, 'X_OK falla en linux')
      assert.equal(asLinuxRg.blocked, false, 'en linux no hay candidato: la herramienta esta ausente')
      assert.equal(asWindowsRg.blocked, true, 'win32 no exige X_OK: el candidato resuelve y queda bloqueado')
    })
  })
})

describe('machine-env - deteccion de fin de linea', () => {
  it('sin repo usa la convencion de plataforma', () => {
    withDir((dir) => {
      const win = detectMachineFacts({ platform: 'win32', env: {}, cwd: nonRepoDir(dir), path: dir })
      assert.equal(win.eol, 'crlf')
      assert.equal(win.eol_source, 'platform-default')

      const posix = detectMachineFacts({ platform: 'linux', env: {}, cwd: nonRepoDir(dir), path: dir })
      assert.equal(posix.eol, 'lf')
      assert.equal(posix.eol_source, 'platform-default')
    })
  })

  it('.gitattributes eol=lf gana a core.eol/core.autocrlf y al default CRLF de win32', (t) => {
    if (!GIT_READY) {
      t.skip('git no disponible')
      return
    }
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      writeFileSync(join(dir, '.gitattributes'), '.ancleto/machine-env.md eol=lf\n')
      assert.equal(git(['config', 'core.eol', 'crlf'], dir).status, 0)
      assert.equal(git(['config', 'core.autocrlf', 'true'], dir).status, 0)

      const facts = detectMachineFacts({ platform: 'win32', env: {}, cwd: dir, path: dir })
      assert.equal(facts.eol, 'lf')
      assert.equal(facts.eol_source, 'gitattributes')
    })
  })

  it('sin atributo cae a core.eol y despues a core.autocrlf', (t) => {
    if (!GIT_READY) {
      t.skip('git no disponible')
      return
    }
    withDir((dir) => {
      assert.equal(git(['init', '-q'], dir).status, 0)
      assert.equal(git(['config', 'core.eol', 'crlf'], dir).status, 0)

      const byCoreEol = detectMachineFacts({ platform: 'linux', env: {}, cwd: dir, path: dir })
      assert.equal(byCoreEol.eol, 'crlf')
      assert.equal(byCoreEol.eol_source, 'core.eol')

      assert.equal(git(['config', '--unset', 'core.eol'], dir).status, 0)
      assert.equal(git(['config', 'core.autocrlf', 'input'], dir).status, 0)

      const byAutocrlf = detectMachineFacts({ platform: 'win32', env: {}, cwd: dir, path: dir })
      assert.equal(byAutocrlf.eol, 'lf')
      assert.equal(byAutocrlf.eol_source, 'core.autocrlf')
    })
  })
})

describe('machine-env - escritura idempotente', () => {
  it('machineEnvPath resuelve el artefacto bajo .ancleto/', () => {
    assert.equal(machineEnvPath(join('proyecto', 'raiz')), join('proyecto', 'raiz', '.ancleto', 'machine-env.md'))
  })

  it('no reescribe si solo cambia generated_at y conserva mtime y el valor original', () => {
    withDir((dir) => {
      const facts = fixedFacts()
      const first = writeMachineEnv(dir, facts)
      assert.equal(first.written, true)
      assert.equal(first.path, machineEnvPath(dir))

      const artifact = machineEnvPath(dir)
      const content = readFileSync(artifact, 'utf8')
      assert.match(content, /^- generated_at: /m)

      // mtime viejo: si la segunda corrida reescribiera, el mtime cambiaria a "ahora".
      const old = new Date('2020-01-01T00:00:00.000Z')
      utimesSync(artifact, old, old)

      const second = writeMachineEnv(dir, facts)
      assert.equal(second.written, false)
      assert.equal(readFileSync(artifact, 'utf8'), content, 'conserva el generated_at original')
      assert.equal(new Date(statSync(artifact).mtimeMs).getUTCFullYear(), 2020, 'mtime intacto')
    })
  })

  it('reescribe cuando cambia un hecho detectable', () => {
    withDir((dir) => {
      const artifact = machineEnvPath(dir)
      writeMachineEnv(dir, fixedFacts())
      const before = readFileSync(artifact, 'utf8')
      assert.match(before, /^- rg: disponible$/m)

      const changed = writeMachineEnv(dir, fixedFacts({
        tools: fixedFacts().tools.map((tool) => (
          tool.name === 'rg' ? { name: 'rg', available: false, fallback: 'grep -R' } : tool
        ))
      }))
      assert.equal(changed.written, true)

      const after = readFileSync(artifact, 'utf8')
      assert.notEqual(after, before)
      assert.match(after, /^- rg: no disponible — fallback: grep -R$/m)
      assert.match(after, /^- node: disponible$/m)
    })
  })

  it('reescribe cuando cambia la version de ancleto', () => {
    withDir((dir) => {
      writeMachineEnv(dir, fixedFacts())
      const changed = writeMachineEnv(dir, fixedFacts({ ancletoVersion: '9.9.10' }))
      assert.equal(changed.written, true)
      assert.match(readFileSync(machineEnvPath(dir), 'utf8'), /^- ancleto: 9\.9\.10$/m)
    })
  })
})
