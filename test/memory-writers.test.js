// Oraculo offline de CH-04: serializacion de escritores sobre la base de memoria.
//
// Todo corre sobre bases temporales (mkdtemp/tmpdir). Nunca se abre la
// `.ancleto/memory.db` viva del repo: `assertTemporaryDatabase` falla si la ruta
// coincide con la base real. Los procesos hijos usan el engine real y se
// sincronizan con senales por stdout/stdin, sin sleeps ciegos (salvo la retencion
// deliberada de 7 s del escenario de contencion).
import { after, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import {
  MEMORY_WRITE_RETRY_POLICY,
  MemoryDatabaseBusyError,
  openDatabase,
  runImmediateTransaction
} from '../src/core/memory/database.js'
import { createMemoryEngine, createReadonlyMemoryEngine, defaultMemoryDbPath } from '../src/core/memory/engine.js'
import { memoryDoctor } from '../src/core/memory/doctor.js'
import { snapshotDatabase } from '../src/core/memory/snapshot.js'
import { curateMemory } from '../src/core/memory/curation.js'

const FIXTURE = fileURLToPath(new URL('./fixtures/memory-writer-child.mjs', import.meta.url))
const ROOT = fileURLToPath(new URL('..', import.meta.url))
const REAL_DB = defaultMemoryDbPath(ROOT)
const PATH_SEPARATOR = process.platform === 'win32' ? '\\' : '/'

const tempDirs = new Set()

function makeTempDir(prefix = 'ancleto-memwriters-') {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  tempDirs.add(dir)
  return dir
}

after(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort: en Windows los handles de WAL pueden tardar en liberarse
    }
  }
})

// Falla si la base del oraculo coincide con la base real o vive fuera de tmpdir.
function assertTemporaryDatabase(dbPath) {
  const abs = resolve(dbPath)
  const real = resolve(REAL_DB)
  const same = process.platform === 'win32' ? abs.toLowerCase() === real.toLowerCase() : abs === real
  assert.equal(same, false, `el oraculo no puede usar la base real del repo: ${abs}`)
  const tempRoot = resolve(tmpdir())
  const separator = abs.slice(tempRoot.length, tempRoot.length + 1)
  assert.ok(separator === '\\' || separator === '/', `la base debe vivir bajo tmpdir: ${abs}`)
  assert.equal(abs.startsWith(resolve(ROOT) + PATH_SEPARATOR), false, `la base no debe vivir bajo el repo: ${abs}`)
}

function childEnv() {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  return env
}

// Handle de un proceso hijo con senales por stdout y liberacion por stdin.
function spawnFixture(args = []) {
  const child = spawn(process.execPath, [FIXTURE, ...args], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: childEnv()
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  const lines = []
  const listeners = new Set()
  let stdout = ''
  let stderr = ''
  let pending = ''
  let closed = false

  const exitPromise = new Promise((resolveExit) => {
    child.on('close', (code, signal) => {
      closed = true
      for (const listener of [...listeners]) {
        listeners.delete(listener)
        clearTimeout(listener.timer)
        listener.reject(new Error(`el hijo termino antes de la senal (code=${code}, signal=${signal}); stderr=${JSON.stringify(stderr)}`))
      }
      resolveExit({ code, signal, stdout, stderr })
    })
    child.on('error', (error) => {
      stderr += `\nspawn error: ${error.message}`
    })
  })

  child.stdout.on('data', (chunk) => {
    stdout += chunk
    pending += chunk
    let index
    while ((index = pending.indexOf('\n')) !== -1) {
      const line = pending.slice(0, index).trim()
      pending = pending.slice(index + 1)
      if (line === '') continue
      lines.push(line)
      for (const listener of [...listeners]) {
        if (!listener.predicate(line)) continue
        listeners.delete(listener)
        clearTimeout(listener.timer)
        listener.resolve(line)
      }
    }
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  function waitForLine(predicate, timeoutMs = 30000) {
    const existing = lines.find(predicate)
    if (existing !== undefined) return Promise.resolve(existing)
    if (closed) {
      return Promise.reject(new Error(`el hijo ya termino; stdout=${JSON.stringify(lines)}; stderr=${JSON.stringify(stderr)}`))
    }
    return new Promise((resolveLine, rejectLine) => {
      const listener = { predicate, resolve: resolveLine, reject: rejectLine, timer: null }
      listener.timer = setTimeout(() => {
        listeners.delete(listener)
        rejectLine(new Error(`timeout (${timeoutMs} ms) esperando stdout del hijo; recibido=${JSON.stringify(lines)}; stderr=${JSON.stringify(stderr)}`))
      }, timeoutMs)
      listeners.add(listener)
    })
  }

  function release() {
    child.stdin.write('go\n')
  }

  function kill() {
    try {
      child.stdin.destroy()
    } catch {
      // best effort
    }
    try {
      child.kill()
    } catch {
      // best effort
    }
  }

  return { child, waitForLine, exit: exitPromise, release, kill }
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms))
}

async function stopFixture(handle, { release = false } = {}) {
  if (!handle) return
  if (release && handle.child.exitCode === null) {
    try {
      handle.release()
    } catch {
      // best effort
    }
  }
  const settled = await Promise.race([
    handle.exit.then(() => true, () => false),
    delay(3000).then(() => false)
  ])
  if (!settled) {
    handle.kill()
    await delay(1000)
  }
}

function seedEmptyDatabase(dir) {
  const dbPath = join(dir, '.ancleto', 'memory.db')
  assertTemporaryDatabase(dbPath)
  const engine = createMemoryEngine(dbPath)
  engine.close()
  return dbPath
}

function readSchema(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all()
  } finally {
    db.close()
  }
}

// Estado commiteado observable: un lector no ve la transaccion abierta del holder.
function committedState(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    const digest = db.prepare(
      `SELECT count(*) AS nodes,
              COALESCE(SUM(length(id) + length(memory_key) + length(content) + length(justification) + length(created_at)), 0) AS bytes
         FROM memory_nodes`
    ).get()
    return {
      nodes: digest.nodes,
      bytes: digest.bytes,
      schema: db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name').all()
    }
  } finally {
    db.close()
  }
}

describe('ch-04 — serializacion de escritores de memoria', () => {
  it('escritores concurrentes no pierden escrituras y dejan FTS + quick_check consistentes', { timeout: 240000 }, async () => {
    const dir = makeTempDir()
    const dbPath = seedEmptyDatabase(dir)
    const schemaBefore = readSchema(dbPath)

    const N = 6
    const M = 20
    const children = Array.from({ length: N }, (_, index) =>
      spawnFixture(['concurrent', dbPath, String(index), String(M)])
    )
    try {
      for (const child of children) await child.waitForLine((line) => line === 'READY', 30000)
      // Barrera: todos los procesos ya tienen el engine abierto y escriben a la vez.
      for (const child of children) child.release()
      const results = await Promise.all(children.map((child) => child.exit))
      for (const [index, result] of results.entries()) {
        assert.equal(result.code, 0, `hijo ${index} fallo: ${result.stderr}`)
        assert.match(result.stdout, new RegExp(`DONE ${M * 2}`))
      }
    } finally {
      for (const child of children) await stopFixture(child, { release: true })
    }

    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const total = db.prepare('SELECT count(*) AS n FROM memory_nodes').get().n
      assert.equal(total, N * 2 * M, 'toda escritura confirmada debe persistir')

      const duplicateActive = db.prepare(
        `SELECT memory_key FROM memory_nodes WHERE status = 'active' GROUP BY memory_key HAVING count(*) > 1`
      ).all()
      assert.deepEqual(duplicateActive, [], 'exactamente un activo por memory_key')

      const shared = db.prepare(
        `SELECT count(*) AS total, sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
           FROM memory_nodes WHERE memory_key = ?`
      ).get('shared-writer-key')
      assert.equal(shared.total, N * M)
      assert.equal(shared.active, 1)
      assert.equal(shared.total - shared.active, N * M - 1, 'conteo exacto de superseded por clave colisionante')

      const expected = new Set()
      for (let index = 0; index < N; index++) {
        for (let sequence = 0; sequence < M; sequence++) {
          expected.add(`sharedwrite${index}seq${sequence}`)
          expected.add(`uniquewrite${index}seq${sequence}`)
        }
      }
      const persisted = new Set(db.prepare('SELECT content FROM memory_nodes').all().map((row) => row.content))
      assert.deepEqual([...persisted].sort(), [...expected].sort(), 'no se pierde ni se duplica contenido')

      const distinct = db.prepare(
        `SELECT memory_key, content FROM memory_nodes WHERE memory_key LIKE 'distinct-writer-%' AND status = 'active'`
      ).all()
      assert.equal(distinct.length, N * M)
      for (const row of distinct) {
        const match = row.memory_key.match(/^distinct-writer-(\d+)-(\d+)$/)
        assert.ok(match, `memory_key inesperada: ${row.memory_key}`)
        assert.equal(row.content, `uniquewrite${match[1]}seq${match[2]}`)
      }

      assert.equal(
        db.prepare('SELECT count(*) AS n FROM memory_fts_docsize').get().n,
        total,
        'FTS debe indexar exactamente las filas de memory_nodes'
      )
      assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
      assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal')
    } finally {
      db.close()
    }

    assert.deepEqual(readSchema(dbPath), schemaBefore, 'la forma persistida no cambia')

    const reader = createReadonlyMemoryEngine(dbPath)
    try {
      const hits = reader.searchMemory({ query: 'uniquewrite0seq0' })
      assert.ok(hits.some((hit) => hit.memory_key === 'distinct-writer-0-0'), 'la busqueda FTS encuentra una escritura confirmada')
    } finally {
      reader.close()
    }
  })

  it('la contencion se absorbe mas alla de busy_timeout sin SQLITE_BUSY crudo', { timeout: 90000 }, async (t) => {
    const dir = makeTempDir()
    const dbPath = seedEmptyDatabase(dir)
    const holder = spawnFixture(['hold', dbPath, 'wait'])
    let writer = null
    try {
      await holder.waitForLine((line) => line === 'LOCKED', 20000)
      writer = spawnFixture(['write', dbPath, 'after-busy-timeout', 'escritura que espera al lock'])
      await writer.waitForLine((line) => line === 'READY', 20000)
      writer.release()
      // El hijo avisa justo antes de llamar a recordNode: el padre recien ahora
      // inicia la retencion de 7 s, sin depender de tiempos de arranque.
      await writer.waitForLine((line) => line === 'BEGIN', 20000)
      await delay(7000)
      holder.release()
      const result = await writer.exit
      assert.equal(result.code, 0, result.stderr)
      assert.match(result.stdout, /DONE 1/)
      // La duracion la mide el fixture alrededor de `engine.recordNode`: es la
      // espera real del escritor, no el tiempo que el padre retuvo el lock.
      const reported = result.stdout.match(/^elapsed (\d+)$/m)
      assert.ok(reported, `el fixture debe reportar elapsed: ${result.stdout}`)
      const elapsedMs = Number(reported[1])
      t.diagnostic(`elapsed reportado por el fixture: ${elapsedMs} ms`)
      assert.equal(/SQLITE_BUSY|MEMORY_DB_BUSY|database is locked/i.test(result.stderr), false, result.stderr)
      assert.ok(elapsedMs > 5000, `la espera del escritor debio superar busy_timeout (${elapsedMs} ms)`)
      // Exit 0 sin MEMORY_DB_BUSY prueba que no se agoto el presupuesto de 3 intentos.

      const holderResult = await holder.exit
      assert.equal(holderResult.code, 0, holderResult.stderr)
      assert.match(holderResult.stdout, /COMMITTED/)
    } finally {
      await stopFixture(holder, { release: true })
      await stopFixture(writer)
    }

    const db = new DatabaseSync(dbPath, { readOnly: true })
    try {
      const persisted = db.prepare(
        `SELECT count(*) AS n FROM memory_nodes WHERE memory_key = ? AND status = 'active'`
      ).get('after-busy-timeout').n
      assert.equal(persisted, 1)
    } finally {
      db.close()
    }
  })

  it('presupuesto agotado produce MEMORY_DB_BUSY sin dejar transaccion abierta', { timeout: 60000 }, async () => {
    const dir = makeTempDir()
    const dbPath = seedEmptyDatabase(dir)
    const db = openDatabase(dbPath)
    const holder = spawnFixture(['hold', dbPath, 'wait'])
    try {
      // Presupuesto de lock corto y determinista para no esperar 5 s por intento.
      db.exec('PRAGMA busy_timeout = 100')
      await holder.waitForLine((line) => line === 'LOCKED', 20000)

      let caught = null
      try {
        runImmediateTransaction(
          db,
          'recordNode bajo lock',
          () => {
            db.prepare(
              `INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
               VALUES (?, 'never-written', 'rule', 'project', 'active', 'no debe ejecutarse', '', 'runtime', 1, ?)`
            ).run(randomUUID(), new Date().toISOString())
          },
          { attempts: 2, backoffMs: [10] }
        )
      } catch (error) {
        caught = error
      }

      assert.ok(caught instanceof MemoryDatabaseBusyError, 'debe ser el error nombrado')
      assert.equal(caught.code, 'MEMORY_DB_BUSY')
      assert.equal(caught.name, 'MemoryDatabaseBusyError')
      assert.equal(caught.attempts, 2)
      assert.match(caught.message, /recordNode bajo lock/)
      assert.match(caught.message, /2 intentos/)
      assert.equal(db.isTransaction, false, 'no debe quedar ninguna transaccion abierta')
      assert.equal(db.prepare('SELECT count(*) AS n FROM memory_nodes').get().n, 0, 'el cuerpo no debe ejecutarse')

      holder.release()
      const holderResult = await holder.exit
      assert.equal(holderResult.code, 0, holderResult.stderr)

      const after = runImmediateTransaction(db, 'recordNode posterior', () => {
        db.prepare(
          `INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
           VALUES (?, 'after-busy', 'rule', 'project', 'active', 'escritura posterior', '', 'runtime', 1, ?)`
        ).run(randomUUID(), new Date().toISOString())
        return 'ok'
      })
      assert.equal(after, 'ok')
      assert.equal(
        db.prepare(`SELECT count(*) AS n FROM memory_nodes WHERE memory_key = 'after-busy' AND status = 'active'`).get().n,
        1,
        'la misma conexion debe poder escribir despues del error'
      )
    } finally {
      await stopFixture(holder, { release: true })
      db.close()
    }
  })

  it('la politica es inmutable y un error del cuerpo no se reintenta', { timeout: 30000 }, () => {
    assert.deepEqual(MEMORY_WRITE_RETRY_POLICY, { attempts: 3, backoffMs: [200, 600] })
    assert.ok(Object.isFrozen(MEMORY_WRITE_RETRY_POLICY))
    assert.ok(Object.isFrozen(MEMORY_WRITE_RETRY_POLICY.backoffMs))

    const dir = makeTempDir()
    const dbPath = seedEmptyDatabase(dir)
    const db = openDatabase(dbPath)
    try {
      const ftsBefore = db.prepare('SELECT id, hex(sz) AS sz FROM memory_fts_docsize ORDER BY id').all()
      let calls = 0
      const simulatedBusy = new Error('database is locked (simulado en el cuerpo)')
      simulatedBusy.errcode = 5

      assert.throws(
        () =>
          runImmediateTransaction(
            db,
            'body-under-lock',
            () => {
              calls += 1
              db.prepare(
                `INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
                 VALUES (?, 'body-row', 'rule', 'project', 'active', 'rollback del cuerpo', '', 'runtime', 1, ?)`
              ).run(randomUUID(), new Date().toISOString())
              throw simulatedBusy
            },
            { attempts: 3, backoffMs: [10, 10] }
          ),
        (error) => error === simulatedBusy
      )

      assert.equal(calls, 1, 'un error del cuerpo no debe reintentarse')
      assert.equal(db.isTransaction, false)
      assert.equal(db.prepare('SELECT count(*) AS n FROM memory_nodes').get().n, 0, 'el rollback deshace la escritura del cuerpo')
      assert.deepEqual(
        db.prepare('SELECT id, hex(sz) AS sz FROM memory_fts_docsize ORDER BY id').all(),
        ftsBefore,
        'el rollback debe dejar memory_fts_docsize identico al estado previo'
      )
      assert.equal(
        db.prepare(`SELECT rowid FROM memory_fts WHERE memory_fts MATCH 'rollback'`).all().length,
        0,
        'el indice FTS no debe conservar el contenido abortado'
      )
    } finally {
      db.close()
    }

    const reader = createReadonlyMemoryEngine(dbPath)
    try {
      const hits = reader.searchMemory({ query: 'rollback' })
      assert.equal(hits.length, 0, 'una busqueda FTS posterior no devuelve el contenido abortado')
    } finally {
      reader.close()
    }
  })

  it('repetir el mismo conjunto no agrega activos ni superseded', { timeout: 30000 }, () => {
    const dir = makeTempDir()
    const dbPath = seedEmptyDatabase(dir)
    const engine = createMemoryEngine(dbPath)
    try {
      const batch = [
        { memory_key: 'idem-rule', type: 'rule', scope: 'project', content: 'regla idempotente', justification: 'fixture', createdAt: '2026-01-01T00:00:00.000Z' },
        { memory_key: 'idem-decision', type: 'decision', scope: 'project', content: 'decision idempotente', justification: 'fixture', createdAt: '2026-01-01T00:00:00.000Z' }
      ]
      assert.deepEqual(engine.importNodes(batch), { inserted: 2, updated: 0, skipped: 0 })
      const before = committedState(dbPath)

      assert.deepEqual(engine.importNodes(batch), { inserted: 0, updated: 0, skipped: 2 })
      const repeated = engine.recordNode({
        memory_key: 'idem-rule',
        type: 'rule',
        scope: 'project',
        content: 'regla idempotente',
        justification: 'fixture'
      })
      assert.equal(repeated.superseded, 0)
      assert.deepEqual(committedState(dbPath), before)
    } finally {
      engine.close()
    }
  })

  it('lectores y caminos read-only no se alteran con un escritor activo', { timeout: 120000 }, async () => {
    const dir = makeTempDir()
    const dbPath = join(dir, '.ancleto', 'memory.db')
    assertTemporaryDatabase(dbPath)
    const seed = createMemoryEngine(dbPath)
    seed.recordNode({ memory_key: 'ro-target', type: 'rule', scope: 'project', content: 'objetivo read only' })
    seed.recordNode({ memory_key: 'ro-source', type: 'rule', scope: 'project', content: 'fuente read only' })
    seed.recordNode({ memory_key: 'ro-dupe-a', type: 'decision', scope: 'project', content: 'duplicado exacto' })
    seed.recordNode({ memory_key: 'ro-dupe-b', type: 'decision', scope: 'project', content: 'duplicado exacto' })
    seed.close()
    const before = committedState(dbPath)

    const holder = spawnFixture(['hold', dbPath, 'wait'])
    try {
      await holder.waitForLine((line) => line === 'LOCKED', 20000)

      const doctor = memoryDoctor(dbPath)
      assert.equal(doctor.healthy, true, JSON.stringify(doctor.checks))

      const reader = createReadonlyMemoryEngine(dbPath)
      try {
        const curation = curateMemory(reader)
        assert.equal(curation.status, 'ok')
        assert.equal(reader.merge({ target: 'ro-target', sources: ['ro-source'], dryRun: true }).dryRun, true)
        const plan = reader.consolidate({ dryRun: true })
        assert.equal(plan.dryRun, true)
        assert.ok(plan.exactGroups.length >= 1)
      } finally {
        reader.close()
      }

      const snapshot = snapshotDatabase(dbPath, join(dir, 'snapshot.db'))
      assert.equal(existsSync(snapshot.out), true)
      const snapshotDb = new DatabaseSync(snapshot.out, { readOnly: true })
      try {
        assert.equal(snapshotDb.prepare('PRAGMA quick_check').get().quick_check, 'ok')
      } finally {
        snapshotDb.close()
      }

      const noMigrate = openDatabase(dbPath, { migrate: false })
      try {
        assert.equal(noMigrate.prepare('SELECT count(*) AS n FROM memory_nodes').get().n, before.nodes)
      } finally {
        noMigrate.close()
      }

      assert.deepEqual(committedState(dbPath), before, 'los caminos read-only no commitean escrituras')
      assert.equal(holder.child.exitCode, null, 'el escritor debe seguir activo durante las lecturas')
    } finally {
      await stopFixture(holder, { release: true })
    }

    const finalDb = new DatabaseSync(dbPath, { readOnly: true })
    try {
      assert.equal(
        finalDb.prepare('SELECT count(*) AS n FROM memory_nodes').get().n,
        before.nodes + 1,
        'el holder confirma su escritura al liberar'
      )
    } finally {
      finalDb.close()
    }
  })

  it('el mecanismo es por conexion: dos bases disjuntas progresan en paralelo', { timeout: 60000 }, async () => {
    const dirA = makeTempDir()
    const dirB = makeTempDir()
    const dbA = seedEmptyDatabase(dirA)
    const dbB = seedEmptyDatabase(dirB)
    assertTemporaryDatabase(dbA)
    assertTemporaryDatabase(dbB)
    assert.notEqual(resolve(dbA), resolve(dbB))

    const holder = spawnFixture(['hold', dbA, 'wait'])
    try {
      await holder.waitForLine((line) => line === 'LOCKED', 20000)

      const engineB = createMemoryEngine(dbB)
      try {
        const result = engineB.recordNode({
          memory_key: 'parallel-b',
          type: 'rule',
          scope: 'project',
          content: 'escritura en una base disjunta'
        })
        assert.equal(result.superseded, 0)
      } finally {
        engineB.close()
      }

      // Sin asercion de duracion: alcanza con que B haya confirmado mientras A
      // sigue reteniendo su lock.
      assert.equal(holder.child.exitCode, null, 'la base A debe seguir bloqueada')

      const dbBReader = new DatabaseSync(dbB, { readOnly: true })
      try {
        assert.equal(
          dbBReader.prepare(`SELECT count(*) AS n FROM memory_nodes WHERE memory_key = 'parallel-b' AND status = 'active'`).get().n,
          1
        )
      } finally {
        dbBReader.close()
      }
    } finally {
      await stopFixture(holder, { release: true })
    }
  })

  // Se usa el harness de proceso hijo de este archivo (hold + LOCKED) para
  // retener el write-lock; memory-fixtures no tiene ese harness y duplicarlo
  // agregaria mas superficie que valor.
  describe('doctor --rebuild bajo contencion', () => {
    it('absorbe un lock retenido 7 s y deja el indice reconstruido', { timeout: 60000 }, async (t) => {
      const dir = makeTempDir()
      const dbPath = join(dir, '.ancleto', 'memory.db')
      assertTemporaryDatabase(dbPath)
      const seed = createMemoryEngine(dbPath)
      seed.recordNode({ memory_key: 'rebuild-seed', type: 'rule', scope: 'project', content: 'semilla para rebuild' })
      seed.close()

      const holder = spawnFixture(['hold', dbPath, '7000'])
      try {
        await holder.waitForLine((line) => line === 'LOCKED', 20000)
        const startedAt = Date.now()
        const result = memoryDoctor(dbPath, { rebuild: true })
        const elapsedMs = Date.now() - startedAt
        const fts = result.checks.find((check) => check.name === 'Indice FTS5')
        t.diagnostic(`elapsed doctor --rebuild: ${elapsedMs} ms`)
        assert.equal(result.rebuilt, true)
        assert.equal(result.healthy, true, JSON.stringify(result.checks))
        assert.equal(fts.ok, true)
        assert.equal(fts.detail, 'indice reconstruido y consistente')
        assert.equal(result.checks.some((check) => /SQLITE_BUSY|MEMORY_DB_BUSY/.test(check.detail)), false)
        assert.ok(elapsedMs >= 5000, `doctor --rebuild debio esperar al lock retenido (${elapsedMs} ms)`)
        const holderResult = await holder.exit
        assert.equal(holderResult.code, 0, holderResult.stderr)
      } finally {
        await stopFixture(holder, { release: true })
      }

      const db = new DatabaseSync(dbPath, { readOnly: true })
      try {
        const indexed = db.prepare('SELECT count(*) AS n FROM memory_fts_docsize').get().n
        const total = db.prepare('SELECT count(*) AS n FROM memory_nodes').get().n
        assert.equal(indexed, total, 'el indice FTS debe quedar alineado con memory_nodes')
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
      } finally {
        db.close()
      }
    })

    it('agota el presupuesto con el lock retenido y deja la base utilizable', { timeout: 90000 }, async () => {
      const dir = makeTempDir()
      const dbPath = join(dir, '.ancleto', 'memory.db')
      assertTemporaryDatabase(dbPath)
      const seed = createMemoryEngine(dbPath)
      seed.recordNode({ memory_key: 'rebuild-busy-seed', type: 'rule', scope: 'project', content: 'semilla para busy' })
      seed.close()

      // 18 s: supera el presupuesto maximo del helper (3 x busy_timeout + 200 + 600).
      const holder = spawnFixture(['hold', dbPath, '18000'])
      try {
        await holder.waitForLine((line) => line === 'LOCKED', 20000)
        const result = memoryDoctor(dbPath, { rebuild: true })
        const fts = result.checks.find((check) => check.name === 'Indice FTS5')
        assert.equal(result.rebuilt, false)
        assert.equal(result.healthy, false)
        assert.equal(fts.ok, false)
        assert.match(fts.detail, /^reconstruccion fallo \(MEMORY_DB_BUSY\)/)
        assert.equal(result.checks.some((check) => /SQLITE_BUSY/.test(check.detail)), false)
        const holderResult = await holder.exit
        assert.equal(holderResult.code, 0, holderResult.stderr)
      } finally {
        await stopFixture(holder, { release: true })
      }

      // Sin transaccion abierta: la base acepta una escritura nueva y doctor
      // vuelve a reportar sano.
      const engine = createMemoryEngine(dbPath)
      try {
        const written = engine.recordNode({
          memory_key: 'rebuild-after-busy',
          type: 'rule',
          scope: 'project',
          content: 'posterior al busy'
        })
        assert.equal(written.superseded, 0)
      } finally {
        engine.close()
      }
      const doctorAfter = memoryDoctor(dbPath)
      assert.equal(doctorAfter.healthy, true, JSON.stringify(doctorAfter.checks))
    })
  })

  describe('helper runImmediateTransaction — hardening R1', () => {
    // `isLockContention` no se exporta: se pinea su comportamiento observable a
    // traves de runImmediateTransaction (contencion => MemoryDatabaseBusyError).
    function dbThatThrows(error) {
      const state = { begins: 0 }
      const db = {
        isTransaction: false,
        exec() {
          state.begins += 1
          throw error
        }
      }
      return { db, state }
    }

    // Lock real retenido por otra conexion del mismo proceso: sin procesos hijos.
    // Devuelve el tiempo medido y libera el lock al salir.
    function expectBusyAgainstRetainedLock(policy, operation) {
      const dir = makeTempDir()
      const dbPath = seedEmptyDatabase(dir)
      const holder = openDatabase(dbPath)
      const contender = openDatabase(dbPath)
      try {
        contender.exec('PRAGMA busy_timeout = 100')
        holder.exec('BEGIN IMMEDIATE')
        holder.prepare(
          `INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
           VALUES (?, 'held-lock', 'rule', 'project', 'active', 'lock retenido', '', 'runtime', 1, ?)`
        ).run(randomUUID(), new Date().toISOString())

        const startedAt = Date.now()
        let caught = null
        try {
          runImmediateTransaction(
            contender,
            operation,
            () => { throw new Error('el cuerpo no debe ejecutarse') },
            policy
          )
        } catch (error) {
          caught = error
        }
        const elapsedMs = Date.now() - startedAt

        assert.ok(caught instanceof MemoryDatabaseBusyError, String(caught))
        assert.equal(caught.code, 'MEMORY_DB_BUSY')
        assert.ok(elapsedMs < 2000, `${operation}: debe agotar rapido (${elapsedMs} ms)`)
        assert.equal(contender.isTransaction, false, `${operation}: no debe quedar transaccion abierta`)
        return elapsedMs
      } finally {
        try {
          if (holder.isTransaction) holder.exec('ROLLBACK')
        } catch {
          // best effort
        }
        holder.close()
        contender.close()
      }
    }

    it('clasifica errcode extendido 517/6 como contencion y 8/sin codigo como no-contencion', () => {
      let body = 0

      const extended = Object.assign(new Error('database is locked'), { errcode: 517, code: 'ERR_SQLITE_ERROR' })
      const extendedRun = dbThatThrows(extended)
      assert.throws(
        () => runImmediateTransaction(extendedRun.db, 'extended-517', () => { body += 1 }, { attempts: 2, backoffMs: [] }),
        (error) => error instanceof MemoryDatabaseBusyError && error.code === 'MEMORY_DB_BUSY'
      )
      assert.equal(extendedRun.state.begins, 2, '517 (SQLITE_BUSY_SNAPSHOT) debe reintentarse')

      const locked = Object.assign(new Error('database table is locked'), { errcode: 6, code: 'ERR_SQLITE_ERROR' })
      const lockedRun = dbThatThrows(locked)
      assert.throws(
        () => runImmediateTransaction(lockedRun.db, 'locked-6', () => { body += 1 }, { attempts: 2, backoffMs: [] }),
        (error) => error instanceof MemoryDatabaseBusyError
      )
      assert.equal(lockedRun.state.begins, 2, 'errcode 6 (SQLITE_LOCKED) debe reintentarse')

      const codeOnly = Object.assign(new Error('locked'), { code: 'SQLITE_LOCKED' })
      const codeOnlyRun = dbThatThrows(codeOnly)
      assert.throws(
        () => runImmediateTransaction(codeOnlyRun.db, 'locked-code', () => { body += 1 }, { attempts: 2, backoffMs: [] }),
        (error) => error instanceof MemoryDatabaseBusyError
      )
      assert.equal(codeOnlyRun.state.begins, 2, 'el fallback por code SQLITE_LOCKED debe reintentarse')

      for (const error of [
        Object.assign(new Error('disk i/o error'), { errcode: 8, code: 'ERR_SQLITE_ERROR' }),
        new Error('sin codigo')
      ]) {
        const run = dbThatThrows(error)
        assert.throws(
          () => runImmediateTransaction(run.db, 'no-lock', () => { body += 1 }, { attempts: 2, backoffMs: [] }),
          (thrown) => thrown === error
        )
        assert.equal(run.state.begins, 1, 'un error que no es de lock no debe reintentarse')
      }
      assert.equal(body, 0, 'ningun BEGIN fallido debe ejecutar el cuerpo')
    })

    it('rechaza attempts < 1 con RangeError sin ejecutar el cuerpo', () => {
      for (const attempts of [0, -1]) {
        const run = dbThatThrows(Object.assign(new Error('no deberia usarse'), { errcode: 5 }))
        let body = 0
        assert.throws(
          () => runImmediateTransaction(run.db, 'invalid-policy', () => { body += 1 }, { attempts, backoffMs: [] }),
          (error) => error instanceof RangeError && /attempts/.test(error.message)
        )
        assert.equal(run.state.begins, 0)
        assert.equal(body, 0)
      }
    })

    it('policy de 2 intentos con backoff vacio agota un lock retenido en menos de 2 s', { timeout: 30000 }, () => {
      expectBusyAgainstRetainedLock({ attempts: 2, backoffMs: [] }, 'agotar-sin-backoff')
    })

    it('normaliza backoff no finito o ausente sin colgar', { timeout: 60000 }, () => {
      for (const [label, policy] of [
        ['NaN', { attempts: 2, backoffMs: [NaN] }],
        ['Infinity', { attempts: 2, backoffMs: [Infinity] }],
        ['negativo', { attempts: 2, backoffMs: [-5] }],
        ['ausente', { attempts: 2 }]
      ]) {
        expectBusyAgainstRetainedLock(policy, `backoff-${label}`)
      }
    })
  })
})
