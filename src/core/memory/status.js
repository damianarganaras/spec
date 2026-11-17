import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openDatabase } from './database.js'
import { defaultMemoryDbPath } from './engine.js'

// Caminos de recuperacion EXISTENTES que la senal advisory nombra cuando hay gap.
// El orden es el del contrato del requirement: export, import, snapshot.
const RECOVERY_COMMANDS = [
  'ancleto memory export',
  'ancleto memory import',
  'ancleto memory snapshot'
]

const ARCHIVE_SEGMENTS = ['aspec', 'changes', 'archive']

// Una linea cuenta como clave solo despues de quitar la indentacion y un bullet
// opcional `- ` o `* `. No se quitan backticks: la forma envuelta
// (`` `**memory_key:**` ``) NO es evidencia, y los backticks alrededor del valor
// no afectan el match porque el marcador sigue siendo el prefijo.
function isMemoryKeyLine(line) {
  const content = line.replace(/^[ \t]*/, '').replace(/^[-*] /, '')
  return content.startsWith('**memory_key:**')
}

// Predicado con corte temprano: todas las lineas se recorren una sola vez y el
// archivo aporta evidencia en cuanto ambos marcadores aparecieron.
function hasDecisionEvidence(text) {
  let hasDecisions = false
  let hasKey = false
  for (const line of text.split(/\r?\n/)) {
    if (!hasDecisions && line.startsWith('## Decisiones')) hasDecisions = true
    if (!hasKey && isMemoryKeyLine(line)) hasKey = true
    if (hasDecisions && hasKey) return true
  }
  return false
}

// Fail-closed: un archivo ilegible o un archive ausente no declara evidencia.
// `evidence` es presencia bajo corte temprano (1 o 0), no cantidad de archives.
function inspectExpected(root) {
  const archiveDir = join(root, ...ARCHIVE_SEGMENTS)
  let entries
  try {
    entries = readdirSync(archiveDir, { withFileTypes: true })
  } catch {
    return { expected: false, evidence: 0 }
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    let text
    try {
      text = readFileSync(join(archiveDir, entry.name, 'proposal.md'), 'utf8')
    } catch {
      continue
    }
    if (hasDecisionEvidence(text)) return { expected: true, evidence: 1 }
  }
  return { expected: false, evidence: 0 }
}

// Deteccion canonica de "esquema inicializado": la tabla `memory_nodes` existe en
// `sqlite_master`. Unica fuente del literal SQL para `status`, `doctor` y las
// superficies de lectura del CLI.
export function hasMemorySchema(db) {
  return db.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'memory_nodes'`).get().n > 0
}

// Read-only estricto: pre-check de existencia antes de abrir y apertura con
// migraciones deshabilitadas y `readonly: true`. La base nunca se crea; el
// directorio tampoco (el `mkdirSync` vive solo en la apertura de escritura).
function inspectDatabase(dbPath) {
  if (!existsSync(dbPath)) return { status: 'no-db', dbPresent: false, activeNodes: 0 }
  let db
  try {
    db = openDatabase(dbPath, { migrate: false, readonly: true })
  } catch (err) {
    throw new Error(`no se pudo abrir la base de memoria (${dbPath}): ${err.message}`)
  }
  try {
    const hasSchema = hasMemorySchema(db)
    if (!hasSchema) return { status: 'uninitialized', dbPresent: true, activeNodes: 0 }
    const activeNodes = db.prepare(`SELECT count(*) AS n FROM memory_nodes WHERE status = 'active'`).get().n
    return { status: activeNodes > 0 ? 'ok' : 'empty', dbPresent: true, activeNodes }
  } catch (err) {
    throw new Error(`no se pudo leer la base de memoria (${dbPath}): ${err.message}`)
  } finally {
    db.close()
  }
}

// Estado advisory de la memoria: no escribe, no importa ni refresca el
// working-context, y no funciona como gate de archive ni de promocion.
// La raiz es UNA sola, el cwd: la base y el directorio de evidencia se derivan
// de ella, de modo que un llamador no puede mezclar dos raices y declarar un gap
// falso desde un subdirectorio.
export function inspectMemoryStatus({ cwd }) {
  const { expected, evidence } = inspectExpected(cwd)
  const { status, dbPresent, activeNodes } = inspectDatabase(defaultMemoryDbPath(cwd))
  const gap = expected && status !== 'ok'
  return {
    status,
    expected,
    gap,
    dbPresent,
    activeNodes,
    evidence,
    recovery: gap ? [...RECOVERY_COMMANDS] : []
  }
}
