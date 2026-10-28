import { statSync } from 'node:fs'
import { openDatabase, checkpointDatabase } from './database.js'

// Estado observable del WAL sin ejecutar checkpoint ni ningun pragma mutante:
// solo se mira el tamano del archivo `-wal` que ya existe en disco.
function observeWal(dbPath) {
  try {
    return `-wal presente (${statSync(`${dbPath}-wal`).size} bytes)`
  } catch {
    return 'sin -wal'
  }
}

export function memoryDoctor(dbPath, { rebuild = false } = {}) {
  // Default estrictamente read-only: sin migraciones, sin pragmas mutantes y sin
  // checkpoint. `--rebuild` es el unico camino que abre en escritura.
  const db = openDatabase(dbPath, rebuild ? { migrate: false } : { migrate: false, readonly: true })
  let rebuilt = false
  try {
    const checks = []

    const hasSchema = db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'memory_nodes'`).get().n > 0
    if (!hasSchema) {
      // Error path: los cuatro nombres se conservan y cada check no ejecutable
      // se reporta como falla con su motivo (nunca se omite del array).
      const detail = 'esquema no inicializado'
      return {
        checks: [
          { name: 'Integridad DB', ok: false, detail },
          { name: 'Indice FTS5', ok: false, detail: `no verificable: ${detail}` },
          { name: 'Reglas activas (unicidad)', ok: false, detail: `no verificable: ${detail}` },
          { name: 'Checkpoint WAL', ok: false, detail: `no verificable: ${detail}` }
        ],
        healthy: false,
        rebuilt: false
      }
    }

    // La existencia del indice se verifica aparte del conteo: sin `memory_fts`
    // la busqueda no funciona (esquema parcial/legacy) y no es un chequeo
    // omitido. La tabla sombra `memory_fts_docsize` solo existe si FTS5 se creo
    // con el default `columnsize=1`.
    const hasFts = db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'`).get().n > 0

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

    let fts
    if (!hasFts) {
      // Estado 1: el indice no existe. Aunque `memory_nodes` exista, la busqueda
      // esta rota; se reporta como falla (nunca `skipped`) y baja `healthy`.
      fts = { ok: false, detail: 'indice FTS5 ausente; la busqueda no funciona' }
    } else if (rebuild) {
      try {
        db.exec(`INSERT INTO memory_fts(memory_fts) VALUES('rebuild')`)
        rebuilt = true
        const after = runIntegrity()
        fts = { ok: after.ok, detail: after.ok ? 'indice reconstruido y consistente' : `reconstruccion sin exito: ${after.detail}` }
      } catch (err) {
        fts = { ok: false, detail: `reconstruccion fallo: ${err.message}` }
      }
    } else {
      // Chequeo no mutante de alineacion. `count(*)` sobre `memory_fts` (external
      // content) NO sirve: FTS5 lo resuelve contra `memory_nodes`, asi que un nodo
      // sin indexar igual se cuenta. La tabla sombra `%_docsize` (default
      // columnsize=1) tiene una fila por documento efectivamente indexado, y su
      // conteo equivale a "filas indexadas". El integrity-check completo (INSERT
      // de control) escribe y queda solo para `--rebuild`.
      try {
        const indexed = db.prepare('SELECT count(*) AS n FROM memory_fts_docsize').get().n
        const total = db.prepare('SELECT count(*) AS n FROM memory_nodes').get().n
        fts = indexed === total
          ? { ok: true, detail: `${indexed} filas indexadas, coincide con memory_nodes (${total} nodos); integridad completa no verificable en read-only` }
          : { ok: false, detail: `${indexed} filas indexadas vs ${total} nodos; indice desalineado, usar --rebuild` }
      } catch (err) {
        // No poder verificar no es una falla (D2): p. ej. un FTS5 creado con
        // `columnsize=0` no materializa la tabla sombra `memory_fts_docsize`.
        // El check se reporta omitido y no baja `healthy` ni el exit code.
        fts = {
          ok: true,
          skipped: true,
          detail: `omitido: alineacion de FTS no verificable (${err.message}); integridad completa no verificable en read-only`
        }
      }
    }
    checks.push({ name: 'Indice FTS5', ok: fts.ok, ...(fts.skipped ? { skipped: true } : {}), detail: fts.detail })

    const dups = db.prepare(`SELECT memory_key, COUNT(*) AS n FROM memory_nodes
      WHERE status = 'active' GROUP BY memory_key HAVING n > 1`).all()
    checks.push({
      name: 'Reglas activas (unicidad)',
      ok: dups.length === 0,
      detail: dups.length === 0 ? 'una sola activa por memory_key' : dups.map((d) => `${d.memory_key} x${d.n}`).join(', ')
    })

    if (rebuild) {
      const checkpointed = checkpointDatabase(db)
      checks.push({
        name: 'Checkpoint WAL',
        ok: checkpointed,
        detail: checkpointed ? 'WAL fusionado en el .db (seguro para copiar)' : 'no se pudo checkpointear (DB en uso por otro proceso)'
      })
    } else {
      checks.push({
        name: 'Checkpoint WAL',
        ok: true,
        skipped: true,
        detail: `omitido: no verificable en modo read-only; ${observeWal(dbPath)}`
      })
    }

    return { checks, healthy: checks.every((c) => c.ok), rebuilt }
  } finally {
    db.close()
  }
}
