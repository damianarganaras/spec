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
