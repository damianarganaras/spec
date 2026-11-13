import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS memory_nodes (
    id TEXT PRIMARY KEY,
    memory_key TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('rule', 'decision')),
    scope TEXT NOT NULL DEFAULT 'project',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
    content TEXT NOT NULL,
    justification TEXT NOT NULL DEFAULT '',
    superseded_by TEXT REFERENCES memory_nodes(id) DEFERRABLE INITIALLY DEFERRED,
    source TEXT NOT NULL,
    confidence REAL NOT NULL,
    created_at TEXT NOT NULL,
    superseded_at TEXT
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_nodes_key_active
    ON memory_nodes(memory_key) WHERE status = 'active'`,
  `CREATE INDEX IF NOT EXISTS idx_memory_nodes_scope_type
    ON memory_nodes(scope, type, status)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    content,
    content = 'memory_nodes',
    content_rowid = 'rowid',
    tokenize = 'unicode61 remove_diacritics 1'
  )`,
  `CREATE TRIGGER IF NOT EXISTS memory_fts_ai AFTER INSERT ON memory_nodes BEGIN
    INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
  END`,
  `CREATE TRIGGER IF NOT EXISTS memory_fts_ad AFTER DELETE ON memory_nodes BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
  END`,
  `CREATE TRIGGER IF NOT EXISTS memory_fts_au AFTER UPDATE ON memory_nodes BEGIN
    INSERT INTO memory_fts(memory_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
    INSERT INTO memory_fts(rowid, content) VALUES (new.rowid, new.content);
  END`
]

export function openDatabase(dbPath, { migrate = true, readonly = false } = {}) {
  if (!readonly) mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath, { readOnly: readonly })
  if (readonly) {
    db.exec('PRAGMA busy_timeout = 5000')
    return db
  }
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  if (migrate) {
    for (const sql of MIGRATIONS) db.exec(sql)
    // Migracion aditiva guardada: una base previa no tiene la columna. El
    // backfill reproduce la elegibilidad historica de gc (created_at), sin
    // otorgar gracia retroactiva, y no toca los nodos activos.
    const columns = db.prepare('PRAGMA table_info(memory_nodes)').all()
    let addedColumn = false
    if (!columns.some((column) => column.name === 'superseded_at')) {
      try {
        db.exec('ALTER TABLE memory_nodes ADD COLUMN superseded_at TEXT')
        addedColumn = true
      } catch (err) {
        // Carrera con otra apertura concurrente: si la columna ya existe, la
        // migracion se considera aplicada.
        const after = db.prepare('PRAGMA table_info(memory_nodes)').all()
        if (!after.some((column) => column.name === 'superseded_at')) throw err
      }
    }
    // El backfill solo hace falta cuando esta apertura agrego la columna: las
    // rutas de supersesion vigentes ya escriben `superseded_at`, y `gc` mide
    // `COALESCE(superseded_at, created_at)`, el mismo fallback historico. Evita
    // un UPDATE con scan completo en cada apertura de escritura.
    if (addedColumn) {
      try {
        db.exec(
          `UPDATE memory_nodes SET superseded_at = created_at WHERE status = 'superseded' AND superseded_at IS NULL`
        )
      } catch (err) {
        console.warn(
          `ancleto: backfill de superseded_at omitido: ${err.message}. Ejecutá "ancleto memory doctor --rebuild" si el indice FTS esta desalineado.`
        )
      }
    }
  }
  return db
}

// Fuerza el merge del WAL dentro del .db para que una copia del archivo no pierda datos.
export function checkpointDatabase(db) {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    return true
  } catch {
    return false
  }
}

// Presupuesto de contencion para la adquisicion del lock de escritura. Tres
// intentos en total; 200 ms antes del segundo y 600 ms antes del tercero. Sin
// jitter: el presupuesto es deterministico y acotado. Es la unica fuente de la
// politica que consume `runImmediateTransaction`.
export const MEMORY_WRITE_RETRY_POLICY = Object.freeze({
  attempts: 3,
  backoffMs: Object.freeze([200, 600])
})

// Contencion agotada: el lock no se pudo adquirir dentro del presupuesto. No
// incluye contenido de nodos ni secretos, solo la operacion y los intentos.
export class MemoryDatabaseBusyError extends Error {
  constructor(operation, attempts) {
    super(`la base de memoria siguio bloqueada tras ${attempts} intentos en la operacion ${operation}`)
    this.name = 'MemoryDatabaseBusyError'
    this.code = 'MEMORY_DB_BUSY'
    this.operation = operation
    this.attempts = attempts
  }
}

// Node 24 expone el busy como `err.errcode = 5` (SQLITE_BUSY) o `6`
// (SQLITE_LOCKED) y `err.code = 'ERR_SQLITE_ERROR'`; el nombre de libreria sigue
// como respaldo por compatibilidad entre versiones.
function isLockContention(err) {
  if (!err) return false
  if (err.errcode === 5 || err.errcode === 6) return true
  return err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED'
}

let sleepBuffer = null
function sleepSynchronously(ms) {
  if (!sleepBuffer) sleepBuffer = new Int32Array(new SharedArrayBuffer(4))
  Atomics.wait(sleepBuffer, 0, 0, ms)
}

// Transaccion de escritura unica: `BEGIN IMMEDIATE`, cuerpo y `COMMIT`. Solo se
// reintenta la adquisicion del lock; una vez abierta la transaccion el cuerpo
// nunca se re-ejecuta. Cualquier fallo del cuerpo o del `COMMIT` hace rollback y
// propaga el error original.
export function runImmediateTransaction(db, operation, fn, policy = MEMORY_WRITE_RETRY_POLICY) {
  for (let attempt = 1; attempt <= policy.attempts; attempt++) {
    try {
      db.exec('BEGIN IMMEDIATE')
    } catch (err) {
      if (!isLockContention(err)) throw err
      if (attempt < policy.attempts) {
        sleepSynchronously(policy.backoffMs[attempt - 1])
        continue
      }
      // El BEGIN fallido no dejo transaccion abierta.
      throw new MemoryDatabaseBusyError(operation, attempt)
    }

    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (err) {
      // Guard: SQLite puede haber revertido solo; no se hace ROLLBACK sin
      // transaccion activa porque ese error taparia el original.
      try {
        if (db.isTransaction) db.exec('ROLLBACK')
      } catch {
        // Rollback best-effort: se propaga el error original de todos modos.
      }
      throw err
    }
  }
}
