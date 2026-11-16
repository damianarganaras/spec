import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { memoryDoctor } from '../src/core/memory/doctor.js'
import { createMemoryEngine } from '../src/core/memory/engine.js'

// memory-gap-declaration — `memory doctor` sobre una base sin esquema.
// El defecto original: el engine read-only de frescura se construia fuera del
// `try` y preparaba statements contra `memory_nodes`, abortando con
// `ERR_SQLITE_ERROR: no such table` y stack trace. Contrato: cinco checks en
// orden, sin excepcion no capturada, exit != 0.

const CLI_PATH = fileURLToPath(new URL('../src/cli/index.js', import.meta.url))
const CHECK_NAMES = [
  'Integridad DB',
  'Indice FTS5',
  'Reglas activas (unicidad)',
  'Refs de nodos activos',
  'Checkpoint WAL'
]

function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-doctor-'))
  try {
    return fn(dir)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort: en Windows los handles de SQLite pueden tardar en liberarse
    }
  }
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' })
}

// Orden observable de los checks en stdout, sin depender del glifo de estado.
function reportedChecks(stdout) {
  const lines = stdout.split(/\r?\n/)
  const names = []
  for (const line of lines) {
    const name = CHECK_NAMES.find((candidate) => line.includes(`${candidate}:`))
    if (name) names.push(name)
  }
  return names
}

function assertNoStackTrace(r) {
  assert.doesNotMatch(r.stdout, /^\s+at /m, 'stdout no debe incluir stack trace')
  assert.doesNotMatch(r.stderr, /^\s+at /m, 'stderr no debe incluir stack trace')
  assert.doesNotMatch(r.stdout + r.stderr, /no such table/, 'no debe filtrar el error crudo de SQLite')
}

describe('memory doctor — base sin esquema', () => {
  it('unit: devuelve los cinco checks en orden con el motivo del path temprano', () => {
    withRepo((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      writeFileSync(dbPath, '')

      const report = memoryDoctor(dbPath)
      assert.deepEqual(report.checks.map((c) => c.name), CHECK_NAMES)
      assert.equal(report.healthy, false)
      assert.equal(report.rebuilt, false)
      for (const check of report.checks) {
        assert.equal(check.ok, false, `${check.name} debe reportarse ok:false`)
        assert.equal(typeof check.detail, 'string')
        assert.equal('skipped' in check, false, 'un check no ejecutable no se reporta omitido')
      }
      assert.equal(report.checks[0].detail, 'esquema no inicializado')
      for (const check of report.checks.slice(1)) {
        assert.equal(check.detail, 'no verificable: esquema no inicializado')
      }
    })
  })

  for (const [label, prepare] of [
    ['archivo de 0 bytes', (dbPath) => writeFileSync(dbPath, '')],
    ['base con tablas pero sin memory_nodes', (dbPath) => {
      const raw = new DatabaseSync(dbPath)
      try {
        raw.exec('CREATE TABLE otra_cosa (id INTEGER)')
      } finally {
        raw.close()
      }
    }]
  ]) {
    it(`CLI: ${label} completa los cinco checks y sale con codigo != 0`, () => {
      withRepo((dir) => {
        const dbPath = join(dir, '.ancleto', 'memory.db')
        mkdirSync(join(dir, '.ancleto'), { recursive: true })
        prepare(dbPath)
        const sizeBefore = statSync(dbPath).size

        const r = runCli(dir, ['memory', 'doctor'])
        assert.notEqual(r.status, 0, `debe salir con codigo distinto de 0: ${r.stdout}`)
        assert.equal(r.signal, null, 'no debe abortar por excepcion no capturada')
        assert.deepEqual(reportedChecks(r.stdout), CHECK_NAMES, `checks fuera de orden: ${r.stdout}`)
        assert.match(r.stdout, /Integridad DB: esquema no inicializado/)
        assert.equal((r.stdout.match(/esquema no inicializado/g) || []).length, 5)
        assert.match(r.stdout, /Working-context: no verificable/)
        assertNoStackTrace(r)
        assert.equal(statSync(dbPath).size, sizeBefore, 'el comando no debe escribir en la base')
      })
    })
  }
})

describe('memory doctor — base con esquema', () => {
  it('conserva los cinco checks, su orden y el criterio de healthy', () => {
    withRepo((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const engine = createMemoryEngine(dbPath)
      try {
        engine.recordNode({ memory_key: 'doctor-ok', type: 'rule', scope: 'project', content: 'regla indexada' })
      } finally {
        engine.close()
      }

      const report = memoryDoctor(dbPath)
      assert.deepEqual(report.checks.map((c) => c.name), CHECK_NAMES)
      assert.equal(report.rebuilt, false)
      assert.equal(report.healthy, report.checks.every((c) => c.ok))
      assert.equal(report.healthy, true, `una base consistente debe seguir sana: ${JSON.stringify(report.checks)}`)

      const r = runCli(dir, ['memory', 'doctor'])
      assert.equal(r.status, 0, r.stdout + r.stderr)
      assert.deepEqual(reportedChecks(r.stdout), CHECK_NAMES)
      assert.doesNotMatch(r.stdout, /Working-context: no verificable/, 'con esquema si se evalua la frescura')
      assertNoStackTrace(r)
    })
  })
})
