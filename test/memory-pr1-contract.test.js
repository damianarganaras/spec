import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createMemoryEngine } from '../src/core/memory/engine.js'
import { openDatabase } from '../src/core/memory/database.js'
import { snapshotDatabase } from '../src/core/memory/snapshot.js'

// Reingenieria memoria-first / PR-1 — cobertura de escenarios del delta
// `specs/memory-ops/spec.md` que no tenian test dedicado:
// - "Snapshot a archivo con resumen legible" (salida legible con ruta y tamaño)
// - "Deteccion real de problemas sigue vigente" (exit code != 0 ante una falla)
// - requirement de snapshot: no migrar ni checkpointear la fuente
// Complementa (no reemplaza) test/memory-fixtures.test.js y test/memory-engine.test.js.

const CLI_PATH = fileURLToPath(new URL('../src/cli/index.js', import.meta.url))

function withFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-pr1-'))
  const dbPath = join(dir, '.ancleto', 'memory.db')
  try {
    return fn({ dir, dbPath })
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort: en Windows los handles de WAL pueden tardar en liberarse
    }
  }
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

// Frames commiteados en el WAL (header de 32 bytes + frames de pageSize+24).
function walFrameCount(dbPath) {
  const wal = `${dbPath}-wal`
  if (!existsSync(wal)) return 0
  const size = statSync(wal).size
  if (size <= 32) return 0
  let pageSize = readFileSync(dbPath).readUInt16BE(16)
  if (pageSize === 1) pageSize = 65536
  return Math.floor((size - 32) / (pageSize + 24))
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' })
}

describe('contrato PR-1 — escenarios sin test dedicado', () => {
  it('snapshot sin --json imprime la ruta y el tamaño del archivo creado', () => {
    withFixture(({ dir, dbPath }) => {
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'snap-readable', type: 'rule', scope: 'project', content: 'snapshot legible' })
      eng.close()

      const out = join(dir, 'backup.db')
      const r = runCli(dir, ['memory', 'snapshot', '--out', out])
      assert.equal(r.status, 0, r.stderr)
      assert.ok(r.stdout.includes(out), `la salida debe nombrar la ruta: ${r.stdout}`)

      const bytesMatch = r.stdout.match(/\((\d+) bytes\)/)
      assert.ok(bytesMatch, `la salida debe nombrar el tamaño: ${r.stdout}`)
      assert.equal(Number(bytesMatch[1]), statSync(out).size)

      const db = new DatabaseSync(out, { readOnly: true })
      try {
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
        assert.ok(db.prepare(`SELECT memory_key FROM memory_nodes WHERE status = 'active'`).all()
          .some((n) => n.memory_key === 'snap-readable'))
      } finally {
        db.close()
      }
    })
  })

  it('snapshot falla con exit != 0 si el repo no tiene memoria', () => {
    withFixture(({ dir }) => {
      const out = join(dir, 'backup.db')
      const r = runCli(dir, ['memory', 'snapshot', '--out', out])
      assert.notEqual(r.status, 0, `debe fallar sin fuente: ${r.stdout}`)
      assert.match(r.stderr, /no hay memoria en este repo/, 'el error debe nombrar el motivo')
      assert.equal(existsSync(out), false, 'no debe escribir el snapshot si la fuente no existe')
    })
  })

  it('memory doctor sale con codigo != 0 cuando hay una falla real (duplicado activo)', () => {
    withFixture(({ dir, dbPath }) => {
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'dup', type: 'rule', scope: 'project', content: 'duplicada' })
      eng.close()

      const raw = openDatabase(dbPath)
      try {
        raw.exec('DROP INDEX idx_memory_nodes_key_active')
        raw.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
          VALUES ('dup-2', 'dup', 'rule', 'project', 'active', 'duplicada 2', '', 'test', 1, ?)`).run(new Date().toISOString())
      } finally {
        raw.close()
      }

      const r = runCli(dir, ['memory', 'doctor'])
      assert.notEqual(r.status, 0, r.stdout)
      assert.match(r.stdout, /Reglas activas \(unicidad\): dup x2/)
    })
  })

  // Fixture forzada a journal_mode=DELETE: en WAL, el open read-only de snapshot
  // puede materializar `<fuente>-shm` y un `<fuente>-wal` de 0 bytes sin cambiar
  // el contenido de la fuente (mismo efecto ya documentado para doctor).
  it('snapshot no muta la fuente ni cambia su journal mode (fixture journal_mode=DELETE)', () => {
    withFixture(({ dir, dbPath }) => {
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'src-stable', type: 'rule', scope: 'project', content: 'fuente estable' })
      eng.close()

      const raw = new DatabaseSync(dbPath)
      let journalBefore
      try {
        raw.exec('PRAGMA journal_mode = DELETE')
        journalBefore = raw.prepare('PRAGMA journal_mode').get().journal_mode
      } finally {
        raw.close()
      }

      const wal = `${dbPath}-wal`
      const shm = `${dbPath}-shm`
      assert.equal(existsSync(wal), false, 'la fuente arranca sin -wal')
      assert.equal(existsSync(shm), false, 'la fuente arranca sin -shm')
      const before = hashFile(dbPath)

      snapshotDatabase(dbPath, join(dir, 'snap.db'))

      assert.equal(hashFile(dbPath), before, 'la fuente queda byte a byte identica')
      assert.equal(existsSync(wal), false, 'el snapshot no crea -wal en la fuente')
      assert.equal(existsSync(shm), false, 'el snapshot no crea -shm en la fuente')

      const after = new DatabaseSync(dbPath, { readOnly: true })
      try {
        assert.equal(after.prepare('PRAGMA journal_mode').get().journal_mode, journalBefore)
      } finally {
        after.close()
      }
    })
  })

  it('snapshot con WAL activo incluye los nodos commiteados y no muta .db ni -wal', () => {
    withFixture(({ dir, dbPath }) => {
      const eng = createMemoryEngine(dbPath)
      try {
        eng.recordNode({ memory_key: 'wal-a', type: 'rule', scope: 'project', content: 'nodo wal a' })
        eng.recordNode({ memory_key: 'wal-b', type: 'rule', scope: 'project', content: 'nodo wal b' })
        eng.recordNode({ memory_key: 'wal-c', type: 'rule', scope: 'project', content: 'nodo wal c' })

        const walPath = `${dbPath}-wal`
        assert.equal(existsSync(walPath), true, 'el escritor abierto debe mantener -wal')
        assert.ok(statSync(walPath).size > 0, 'el -wal debe tener bytes')
        assert.ok(walFrameCount(dbPath) > 0, 'el -wal debe tener frames sin checkpoint')

        const dbBefore = hashFile(dbPath)
        const walBefore = hashFile(walPath)
        const walSizeBefore = statSync(walPath).size

        const out = join(dir, 'wal-snapshot.db')
        snapshotDatabase(dbPath, out)

        assert.equal(hashFile(dbPath), dbBefore, 'el .db de la fuente no cambia')
        assert.equal(hashFile(walPath), walBefore, 'el -wal de la fuente no cambia')
        assert.equal(statSync(walPath).size, walSizeBefore, 'el -wal conserva su tamano')

        const snap = new DatabaseSync(out, { readOnly: true })
        try {
          const keys = snap.prepare(`SELECT memory_key FROM memory_nodes WHERE status = 'active' ORDER BY memory_key`).all()
            .map((r) => r.memory_key)
          assert.deepEqual(keys, ['wal-a', 'wal-b', 'wal-c'], 'el snapshot contiene los nodos commiteados')
        } finally {
          snap.close()
        }
      } finally {
        eng.close()
      }
    })
  })

  it('rechaza como fuente un destino escrito con otra capitalizacion (win32)', { skip: process.platform !== 'win32' }, () => {
    withFixture(({ dir, dbPath }) => {
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'same-file', type: 'rule', scope: 'project', content: 'identidad de archivo' })
      eng.close()

      const before = hashFile(dbPath)
      const upper = join(dir, '.ancleto', 'MEMORY.DB')
      assert.throws(() => snapshotDatabase(dbPath, upper, { overwrite: true }), /fuente/)
      assert.equal(existsSync(dbPath), true, 'la fuente no se borra')
      assert.equal(hashFile(dbPath), before, 'la fuente queda intacta')
    })
  })
})
