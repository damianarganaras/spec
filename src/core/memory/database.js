import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS memory_nodes (
    id TEXT PRIMARY KEY,
    memory_key TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('rule', 'decision')),
    scope TEXT NOT NULL DEFAULT 'repo',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'deleted')),
    content TEXT NOT NULL,
    justification TEXT NOT NULL DEFAULT '',
    superseded_by TEXT REFERENCES memory_nodes(id) DEFERRABLE INITIALLY DEFERRED,
    source TEXT NOT NULL,
    confidence REAL NOT NULL,
    created_at TEXT NOT NULL
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

export function openDatabase(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true })
  const db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  for (const sql of MIGRATIONS) db.exec(sql)
  return db
}
