// Proceso hijo del oraculo de serializacion de escritores (ch-04).
// No es un test: lo spawnea test/memory-writers.test.js contra una base temporal.
//
// Protocolo por stdout:
//   concurrent <db> <childIndex> <writes>  -> READY, espera "go" por stdin, escribe y emite DONE <n>
//   write      <db> <memoryKey> <content>  -> DONE 1 con el engine real
//   hold       <db> <ms|wait>              -> LOCKED tras BEGIN IMMEDIATE; COMMITTED al liberar
//
// Cualquier fallo emite FAIL por stderr y sale con exit code != 0.
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../../src/core/memory/database.js'
import { createMemoryEngine } from '../../src/core/memory/engine.js'

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const REAL_DB = resolve(join(REPO_ROOT, '.ancleto', 'memory.db'))

function samePath(a, b) {
  if (process.platform === 'win32') return a.toLowerCase() === b.toLowerCase()
  return a === b
}

// Barrera dura: el fixture se niega a tocar la base real del repo o cualquier
// ruta fuera de tmpdir. La base del oraculo siempre es temporal.
function assertTemporaryDatabase(dbPath) {
  if (!dbPath) throw new Error('falta la ruta de la base')
  const abs = resolve(dbPath)
  if (samePath(abs, REAL_DB)) {
    throw new Error('el fixture se nego a abrir la base real del repo (.ancleto/memory.db)')
  }
  const tempRoot = resolve(tmpdir())
  const separator = abs.slice(tempRoot.length, tempRoot.length + 1)
  if (separator !== '\\' && separator !== '/') {
    throw new Error(`la base del fixture debe vivir en tmpdir, no en ${abs}`)
  }
  return abs
}

function waitForSignal() {
  return new Promise((resolveSignal) => {
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      // `pause()` deja el handle referenciado y el proceso hijo no termina;
      // destroy cierra el fd y libera el event loop.
      process.stdin.removeListener('data', finish)
      process.stdin.removeListener('end', finish)
      try {
        process.stdin.destroy()
      } catch {
        // best effort
      }
      resolveSignal()
    }
    process.stdin.resume()
    process.stdin.once('data', finish)
    process.stdin.once('end', finish)
  })
}

async function runConcurrent(dbPath, childIndex, writes) {
  const engine = createMemoryEngine(dbPath)
  try {
    process.stdout.write('READY\n')
    await waitForSignal()
    let confirmed = 0
    for (let sequence = 0; sequence < writes; sequence++) {
      engine.recordNode({
        memory_key: 'shared-writer-key',
        type: 'rule',
        scope: 'project',
        content: `sharedwrite${childIndex}seq${sequence}`
      })
      confirmed += 1
      engine.recordNode({
        memory_key: `distinct-writer-${childIndex}-${sequence}`,
        type: 'rule',
        scope: 'project',
        content: `uniquewrite${childIndex}seq${sequence}`
      })
      confirmed += 1
    }
    process.stdout.write(`DONE ${confirmed}\n`)
  } finally {
    engine.close()
  }
}

async function runWrite(dbPath, memoryKey, content) {
  const engine = createMemoryEngine(dbPath)
  try {
    // Barrera: el padre libera el holder recien cuando este proceso ya esta
    // intentando adquirir el lock, asi la contencion es determinista.
    process.stdout.write('READY\n')
    await waitForSignal()
    process.stdout.write('BEGIN\n')
    const startedAt = Date.now()
    engine.recordNode({ memory_key: memoryKey, type: 'rule', scope: 'project', content })
    const elapsedMs = Date.now() - startedAt
    process.stdout.write('DONE 1\n')
    process.stdout.write(`elapsed ${elapsedMs}\n`)
  } finally {
    engine.close()
  }
}

function runHold(dbPath, holdArg) {
  const db = openDatabase(dbPath)
  const holdMs = Number(holdArg)
  let settled = false
  let safety = null

  function finish(error) {
    if (settled) return
    settled = true
    if (safety) clearTimeout(safety)
    let failure = error || null
    try {
      if (failure) {
        if (db.isTransaction) db.exec('ROLLBACK')
      } else {
        db.exec('COMMIT')
      }
    } catch (err) {
      failure = err
    }
    try {
      db.close()
    } catch {
      // best effort: el error original manda
    }
    if (failure) {
      process.stderr.write(`FAIL ${failure.message}\n`)
      process.exitCode = 1
      return
    }
    process.stdout.write('COMMITTED\n')
  }

  try {
    db.exec('BEGIN IMMEDIATE')
    db.prepare(
      `INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
       VALUES (?, ?, 'rule', 'project', 'active', ?, '', 'runtime', 1, ?)`
    ).run(randomUUID(), `holder-${process.pid}`, 'holder lock', new Date().toISOString())
    process.stdout.write('LOCKED\n')
    safety = setTimeout(() => finish(new Error('el holder no recibio liberacion en 60 s')), 60000)
    if (Number.isFinite(holdMs) && holdMs > 0) {
      setTimeout(() => finish(), holdMs)
    } else {
      waitForSignal().then(() => finish())
    }
  } catch (err) {
    settled = true
    try {
      if (db.isTransaction) db.exec('ROLLBACK')
    } catch {
      // best effort
    }
    try {
      db.close()
    } catch {
      // best effort
    }
    throw err
  }
}

const [mode, dbPathArg, ...rest] = process.argv.slice(2)

try {
  const dbPath = assertTemporaryDatabase(dbPathArg)
  if (mode === 'concurrent') {
    await runConcurrent(dbPath, Number(rest[0]), Number(rest[1]))
  } else if (mode === 'write') {
    await runWrite(dbPath, rest[0], rest[1])
  } else if (mode === 'hold') {
    runHold(dbPath, rest[0])
  } else {
    throw new Error(`modo desconocido: ${mode}`)
  }
} catch (err) {
  process.stderr.write(`FAIL ${err.message}\n`)
  process.exitCode = 1
}
