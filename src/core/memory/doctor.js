import { openDatabase, checkpointDatabase } from './database.js'

export function memoryDoctor(dbPath, { rebuild = false } = {}) {
  const db = openDatabase(dbPath, { migrate: false })
  try {
    const checks = []

    const hasSchema = db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'memory_nodes'`).get().n > 0
    if (!hasSchema) {
      return { checks: [{ name: 'Integridad DB', ok: false, detail: 'esquema no inicializado' }], healthy: false, rebuilt: false }
    }

    const quick = db.prepare('PRAGMA quick_check').get()
    const integrityOk = quick && quick.quick_check === 'ok'
    checks.push({
      name: 'Integridad DB',
      ok: integrityOk,
      detail: integrityOk ? 'quick_check ok' : String(quick && quick.quick_check)
    })

    const runIntegrity = () => {
      try {
        db.exec(`INSERT INTO memory_fts(memory_fts, rank) VALUES('integrity-check', 1)`)
        return { ok: true, detail: 'indice consistente con la tabla de contenido' }
      } catch (err) {
        return { ok: false, detail: `inconsistente: ${err.message}` }
      }
    }

    let fts = runIntegrity()
    let rebuilt = false
    if (rebuild) {
      db.exec(`INSERT INTO memory_fts(memory_fts) VALUES('rebuild')`)
      rebuilt = true
      const after = runIntegrity()
      fts = { ok: after.ok, detail: after.ok ? 'indice reconstruido y consistente' : `reconstruccion sin exito: ${after.detail}` }
    }
    checks.push({
      name: rebuilt ? 'Indice FTS5 (post-rebuild)' : 'Indice FTS5',
      ok: fts.ok,
      detail: fts.detail
    })

    const dups = db.prepare(`SELECT memory_key, COUNT(*) AS n FROM memory_nodes
      WHERE status = 'active' GROUP BY memory_key HAVING n > 1`).all()
    checks.push({
      name: 'Reglas activas (unicidad)',
      ok: dups.length === 0,
      detail: dups.length === 0 ? 'una sola activa por memory_key' : dups.map((d) => `${d.memory_key} x${d.n}`).join(', ')
    })

    // Deja el WAL fusionado en el .db: una copia del archivo no pierde datos.
    const checkpointed = checkpointDatabase(db)
    checks.push({
      name: 'Checkpoint WAL',
      ok: checkpointed,
      detail: checkpointed ? 'WAL fusionado en el .db (seguro para copiar)' : 'no se pudo checkpointear (DB en uso por otro proceso)'
    })

    return { checks, healthy: checks.every((c) => c.ok), rebuilt }
  } finally {
    db.close()
  }
}
