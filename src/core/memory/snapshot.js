import { existsSync, mkdirSync, realpathSync, renameSync, rmSync, statSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// Copia consistente de la base de memoria con historial (incluye superseded y
// superseded_by, a diferencia de `memory export`). No usa `openDatabase`: ese
// helper fija `PRAGMA journal_mode=WAL` y mutaria la fuente. Se abre una conexion
// directa read-only, sin pragmas ni migraciones: `VACUUM INTO` lee el estado
// commiteado (incluido el WAL) sin escribir la fuente.
// Identidad de archivo, no identidad de string: `path.resolve()` no normaliza
// mayusculas en Windows ni resuelve symlinks/junctions. Para una ruta que todavia
// no existe se resuelve el ancestro existente mas cercano y se recompone el resto.
function realpathish(p) {
  const abs = resolve(p)
  if (existsSync(abs)) return realpathSync.native(abs)
  const tail = []
  let cur = abs
  for (;;) {
    const parent = dirname(cur)
    if (parent === cur) return abs
    if (existsSync(parent)) {
      return join(realpathSync.native(parent), basename(cur), ...tail.reverse())
    }
    tail.push(basename(cur))
    cur = parent
  }
}

function sameFile(a, b) {
  let ca = realpathish(a)
  let cb = realpathish(b)
  if (process.platform === 'win32') {
    ca = ca.toLowerCase()
    cb = cb.toLowerCase()
  }
  return ca === cb
}

function vacuumInto(sourcePath, targetPath) {
  const db = new DatabaseSync(sourcePath, { readOnly: true })
  try {
    // `VACUUM INTO` acepta una expresion SQL: el destino viaja como parametro
    // vinculado, sin interpolar la ruta en el texto de la sentencia.
    db.prepare('VACUUM INTO ?').run(targetPath)
  } catch (err) {
    throw new Error(`snapshot: VACUUM INTO fallo sobre la fuente read-only: ${err.message}`)
  } finally {
    db.close()
  }
}

function verifySnapshot(targetPath) {
  const check = new DatabaseSync(targetPath, { readOnly: true })
  try {
    const row = check.prepare('PRAGMA quick_check').get()
    if (!row || row.quick_check !== 'ok') {
      throw new Error(`snapshot: la verificacion quick_check fallo para ${targetPath}`)
    }
  } finally {
    check.close()
  }
}

// Reemplaza el destino recien despues de tener una copia verificada en el
// temporal (mismo directorio = mismo volumen). En Windows `rename` no reemplaza
// un destino existente: se aparta el viejo a un backup, se mueve la copia nueva
// y solo entonces se borra el backup. Si el movimiento final falla, se restaura
// el backup: en ningun camino de error se pierden a la vez el destino previo y
// la copia nueva.
function replaceDestination(tempPath, targetPath) {
  if (!existsSync(targetPath)) {
    renameSync(tempPath, targetPath)
    return
  }
  const backup = `${targetPath}.bak-${randomUUID()}`
  renameSync(targetPath, backup)
  try {
    renameSync(tempPath, targetPath)
  } catch (err) {
    try {
      renameSync(backup, targetPath)
    } catch {
      // restauracion best-effort: se propaga el error original
    }
    throw err
  }
  try {
    rmSync(backup, { force: true })
  } catch {
    // el snapshot ya quedo en su lugar: un .bak remanente no invalida la copia
  }
}

export function snapshotDatabase(dbPath, outPath, { overwrite = false } = {}) {
  if (!dbPath || !outPath) throw new Error('snapshot: se requieren la base fuente y la ruta destino')
  const source = resolve(dbPath)
  const out = resolve(outPath)
  if (sameFile(source, out)) {
    throw new Error(`snapshot: el destino no puede ser la fuente (${out})`)
  }
  if (!existsSync(source)) {
    throw new Error(`snapshot: no existe la base fuente (${source})`)
  }
  if (existsSync(out) && !overwrite) {
    throw new Error(`snapshot: el destino ya existe (${out}); usar overwrite/--force para reemplazarlo`)
  }

  mkdirSync(dirname(out), { recursive: true })
  const temp = join(dirname(out), `.${basename(out)}.${process.pid}-${randomUUID()}.tmp`)
  try {
    vacuumInto(source, temp)
    verifySnapshot(temp)
    replaceDestination(temp, out)
    return { out, bytes: statSync(out).size }
  } catch (err) {
    // La limpieza del temporal nunca debe reemplazar el error original. SQLite
    // puede haber creado sidecars para el archivo temporal: se borran los tres.
    try {
      for (const file of [temp, `${temp}-wal`, `${temp}-shm`]) rmSync(file, { force: true })
    } catch {
      // best effort: el temporal queda huerfano pero el error original se propaga
    }
    throw err
  }
}
