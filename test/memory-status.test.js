import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createMemoryEngine } from '../src/core/memory/engine.js'
import { inspectMemoryStatus } from '../src/core/memory/status.js'

// memory-gap-declaration — superficie read-only y advisory `memory status`.
// Toda fixture vive en tmpdir: nunca se lee ni se escribe `.ancleto/memory.db`
// del repositorio. El CLI se spawnea igual que en `test/cli.test.js` porque la
// suite no importa el entry point.

const CLI_PATH = fileURLToPath(new URL('../src/cli/index.js', import.meta.url))
const RECOVERY = ['ancleto memory export', 'ancleto memory import', 'ancleto memory snapshot']
const STATUS_KEYS = ['activeNodes', 'dbPresent', 'evidence', 'expected', 'gap', 'recovery', 'status']

function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-status-'))
  try {
    return fn(dir)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort: en Windows los handles de SQLite pueden tardar en liberarse
    }
  }
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' })
}

function writeProposal(dir, name, body) {
  const archive = join(dir, 'aspec', 'changes', 'archive', name)
  mkdirSync(archive, { recursive: true })
  writeFileSync(join(archive, 'proposal.md'), body)
}

const EVIDENCE = '## Decisiones\n\n**memory_key:** una-clave\n'

// DB con esquema (0 o mas nodos) creada por la API de escritura y cerrada.
function seedDatabase(dir, keys = []) {
  const dbPath = join(dir, '.ancleto', 'memory.db')
  const engine = createMemoryEngine(dbPath)
  try {
    for (const key of keys) {
      engine.recordNode({ memory_key: key, type: 'rule', scope: 'project', content: `contenido ${key}` })
    }
  } finally {
    engine.close()
  }
  return dbPath
}

function statusJson(cwd) {
  const r = runCli(cwd, ['memory', 'status', '--json'])
  assert.equal(r.status, 0, r.stderr)
  return { run: r, json: JSON.parse(r.stdout) }
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function tableState(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return {
      names: db.prepare(`SELECT type, name FROM sqlite_master ORDER BY type, name`).all(),
      nodes: db.prepare(`SELECT memory_key, status, content, superseded_by FROM memory_nodes ORDER BY id`).all(),
      journalMode: db.prepare('PRAGMA journal_mode').get().journal_mode
    }
  } finally {
    db.close()
  }
}

describe('memory status — predicado de memoria esperable', () => {
  // El estado de la base es irrelevante para `expected`: se usa una DB ausente
  // para aislar el predicado sobre el archive.
  function expectedOf(dir, name, body) {
    writeProposal(dir, name, body)
    const result = inspectMemoryStatus({ cwd: dir })
    return result
  }

  it('acepta la clave en columna 0, con bullet - y con bullet *', () => {
    for (const body of [
      '## Decisiones\n\n**memory_key:** valor\n',
      '## Decisiones\n\n- **memory_key:** valor\n',
      '## Decisiones\n\n* **memory_key:** valor\n'
    ]) {
      withRepo((dir) => {
        const r = expectedOf(dir, 'change-ok', body)
        assert.equal(r.expected, true, `no matcheo: ${JSON.stringify(body)}`)
        assert.equal(r.evidence, 1)
      })
    }
  })

  it('acepta el prefijo ## Decisiones de producto y los backticks alrededor del valor', () => {
    withRepo((dir) => {
      const r = expectedOf(dir, 'change-producto', '## Decisiones de producto\n\n**memory_key:** `clave`\n')
      assert.equal(r.expected, true)
      assert.equal(r.evidence, 1)
    })
  })

  it('NO acepta el marcador envuelto en backticks', () => {
    withRepo((dir) => {
      const r = expectedOf(dir, 'change-backticks', '## Decisiones\n\n`**memory_key:** valor`\n')
      assert.equal(r.expected, false)
      assert.equal(r.evidence, 0)
    })
  })

  it('NO acepta texto previo distinto de un bullet', () => {
    withRepo((dir) => {
      const r = expectedOf(dir, 'change-texto', '## Decisiones\n\n- nota: **memory_key:** valor\n')
      assert.equal(r.expected, false)
    })
  })

  it('## Decisiones sin memory_key y memory_key sin ## Decisiones no son evidencia', () => {
    withRepo((dir) => {
      assert.equal(expectedOf(dir, 'sin-clave', '## Decisiones\n\nsolo prosa\n').expected, false)
      assert.equal(expectedOf(dir, 'sin-seccion', '**memory_key:** valor\n').expected, false)
    })
  })

  it('archive ausente o sin proposal.md no declara evidencia', () => {
    withRepo((dir) => {
      const noArchive = inspectMemoryStatus({ cwd: dir })
      assert.equal(noArchive.expected, false)

      mkdirSync(join(dir, 'aspec', 'changes', 'archive', 'solo-directorio'), { recursive: true })
      const emptyArchive = inspectMemoryStatus({ cwd: dir })
      assert.equal(emptyArchive.expected, false)
      assert.equal(emptyArchive.gap, false)
    })
  })

  it('un error de lectura se trata como no-match, nunca como gap', () => {
    withRepo((dir) => {
      // Un directorio llamado proposal.md hace fallar la lectura con EISDIR:
      // mismo efecto observable que un archivo ilegible.
      mkdirSync(join(dir, 'aspec', 'changes', 'archive', 'ilegible', 'proposal.md'), { recursive: true })
      const r = inspectMemoryStatus({ cwd: dir })
      assert.equal(r.expected, false)
      assert.equal(r.gap, false)
      assert.equal(r.status, 'no-db')
    })
  })

  it('corta en el primer archive con evidencia (evidence = 1)', () => {
    withRepo((dir) => {
      writeProposal(dir, 'change-a', EVIDENCE)
      writeProposal(dir, 'change-b', EVIDENCE)
      const r = inspectMemoryStatus({ cwd: dir })
      assert.equal(r.expected, true)
      assert.equal(r.evidence, 1)
    })
  })
})

describe('memory status — estados de la base', () => {
  it('ok: nodos activos y evidencia no declaran gap', () => {
    withRepo((dir) => {
      seedDatabase(dir, ['regla-viva'])
      writeProposal(dir, 'change-ok', EVIDENCE)

      const { run, json } = statusJson(dir)
      assert.deepEqual(json, {
        status: 'ok',
        expected: true,
        gap: false,
        dbPresent: true,
        activeNodes: 1,
        evidence: 1,
        recovery: []
      })
      assert.equal(run.status, 0)

      const human = runCli(dir, ['memory', 'status'])
      assert.equal(human.status, 0, human.stderr)
      const lines = human.stdout.split(/\r?\n/).filter(Boolean)
      assert.equal(lines.length, 1, `sin gap la salida es una sola linea: ${human.stdout}`)
      assert.match(lines[0], /memoria ok \(1 nodo\(s\) activo\(s\)\)/)
      assert.doesNotMatch(human.stdout, /gap|recupera/i)
    })
  })

  it('empty: esquema con cero nodos declara gap con los tres caminos de recuperacion', () => {
    withRepo((dir) => {
      seedDatabase(dir)
      writeProposal(dir, 'change-empty', EVIDENCE)

      const { run, json } = statusJson(dir)
      assert.deepEqual(json, {
        status: 'empty',
        expected: true,
        gap: true,
        dbPresent: true,
        activeNodes: 0,
        evidence: 1,
        recovery: RECOVERY
      })
      assert.equal(run.status, 0)

      const human = runCli(dir, ['memory', 'status'])
      assert.equal(human.status, 0, human.stderr)
      assert.match(human.stdout, /sin nodos activos/)
      for (const cmd of RECOVERY) assert.ok(human.stdout.includes(cmd), `falta "${cmd}" en la salida`)
    })
  })

  it('no-db: evidencia sin archivo declara gap y no crea .ancleto ni memory.db', () => {
    withRepo((dir) => {
      writeProposal(dir, 'change-nodb', EVIDENCE)

      const { run, json } = statusJson(dir)
      assert.deepEqual(json, {
        status: 'no-db',
        expected: true,
        gap: true,
        dbPresent: false,
        activeNodes: 0,
        evidence: 1,
        recovery: RECOVERY
      })
      assert.equal(run.status, 0)
      assert.equal(existsSync(join(dir, '.ancleto')), false, 'no debe crear el directorio .ancleto')
      assert.equal(existsSync(join(dir, '.ancleto', 'memory.db')), false, 'no debe crear memory.db')

      const human = runCli(dir, ['memory', 'status'])
      assert.equal(human.status, 0, human.stderr)
      assert.match(human.stdout, /sin base de memoria/)
    })
  })

  it('uninitialized: archivo de 0 bytes declara gap y no crece', () => {
    withRepo((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      writeFileSync(dbPath, '')
      writeProposal(dir, 'change-zero', EVIDENCE)

      const { run, json } = statusJson(dir)
      assert.deepEqual(json, {
        status: 'uninitialized',
        expected: true,
        gap: true,
        dbPresent: true,
        activeNodes: 0,
        evidence: 1,
        recovery: RECOVERY
      })
      assert.equal(run.status, 0)
      assert.equal(statSync(dbPath).size, 0, 'el comando no debe crear el esquema ni escribir en el archivo')

      const human = runCli(dir, ['memory', 'status'])
      assert.equal(human.status, 0, human.stderr)
      assert.match(human.stdout, /sin esquema inicializado/)
    })
  })

  it('uninitialized con tabla ajena tampoco muta el archivo', () => {
    withRepo((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      const raw = new DatabaseSync(dbPath)
      try {
        raw.exec('CREATE TABLE otra_cosa (id INTEGER)')
      } finally {
        raw.close()
      }
      const hash = hashFile(dbPath)

      const { json } = statusJson(dir)
      assert.equal(json.status, 'uninitialized')
      assert.equal(json.dbPresent, true)
      assert.equal(json.activeNodes, 0)
      assert.equal(hashFile(dbPath), hash)
    })
  })

  it('sin evidencia versionada nunca declara gap, aun en empty', () => {
    withRepo((dir) => {
      seedDatabase(dir)
      const { run, json } = statusJson(dir)
      assert.equal(json.status, 'empty')
      assert.equal(json.expected, false)
      assert.equal(json.gap, false)
      assert.deepEqual(json.recovery, [])
      assert.equal(run.status, 0)
    })
  })
})

describe('memory status — anclaje de raices al cwd', () => {
  it('desde un subdirectorio sin archive no hereda la evidencia de la raiz (regresion del gap falso)', () => {
    withRepo((root) => {
      // `.ancletorc` en la raiz: el comportamiento viejo subia hasta aca para
      // resolver la evidencia, mientras la DB salia del cwd.
      writeFileSync(join(root, '.ancletorc'), '{"agent":"opencode"}\n')
      writeProposal(root, 'change-raiz', EVIDENCE)
      const sub = join(root, 'sub')
      mkdirSync(sub, { recursive: true })

      const atRoot = statusJson(root).json
      assert.equal(atRoot.status, 'no-db')
      assert.equal(atRoot.expected, true)
      assert.equal(atRoot.gap, true)
      assert.deepEqual(atRoot.recovery, RECOVERY)

      const fromSub = statusJson(sub).json
      assert.equal(fromSub.status, 'no-db')
      assert.equal(fromSub.expected, false, 'el archive de la raiz no es evidencia del cwd')
      assert.equal(fromSub.gap, false)
      assert.deepEqual(fromSub.recovery, [])
      assert.equal(existsSync(join(sub, '.ancleto')), false, 'no debe crear .ancleto en el subdirectorio')
    })
  })

  it('sin .ancletorc en ningun ancestro no revienta ni depende de el', () => {
    withRepo((dir) => {
      // withRepo crea un tempdir aislado: no hay `.ancletorc` que heredar.
      const r = runCli(dir, ['memory', 'status', '--json'])
      assert.equal(r.status, 0, r.stderr)
      const json = JSON.parse(r.stdout)
      assert.equal(json.expected, false)
      assert.equal(json.gap, false)
      assert.deepEqual(json.recovery, [])
    })
  })
})

describe('memory status — contrato JSON', () => {
  it('expone exactamente las siete claves con sus tipos', () => {
    withRepo((dir) => {
      seedDatabase(dir, ['clave'])
      writeProposal(dir, 'change-json', EVIDENCE)
      const { json } = statusJson(dir)

      assert.deepEqual(Object.keys(json).sort(), STATUS_KEYS)
      assert.equal(typeof json.status, 'string')
      assert.equal(typeof json.expected, 'boolean')
      assert.equal(typeof json.gap, 'boolean')
      assert.equal(typeof json.dbPresent, 'boolean')
      assert.equal(typeof json.activeNodes, 'number')
      assert.equal(typeof json.evidence, 'number')
      assert.ok(Array.isArray(json.recovery))
    })
  })
})

describe('memory status — invariantes negativas', () => {
  it('no cambia los bytes, las filas ni sqlite_master, y es idempotente (journal_mode=DELETE)', () => {
    withRepo((dir) => {
      const dbPath = seedDatabase(dir, ['uno', 'dos'])
      // Fixture en DELETE: sin sidecars, la lectura read-only no materializa -wal/-shm.
      const raw = new DatabaseSync(dbPath)
      try {
        raw.exec('PRAGMA journal_mode = DELETE')
      } finally {
        raw.close()
      }
      writeProposal(dir, 'change-delete', EVIDENCE)

      const dirBefore = readdirSync(join(dir, '.ancleto')).sort()
      const hash = hashFile(dbPath)
      const state = tableState(dbPath)

      assert.equal(runCli(dir, ['memory', 'status']).status, 0)
      const firstRunFiles = readdirSync(join(dir, '.ancleto')).sort()
      assert.equal(hashFile(dbPath), hash, 'los bytes del .db no deben cambiar')
      assert.deepEqual(firstRunFiles, dirBefore, 'una fixture DELETE no gana sidecars')
      assert.deepEqual(tableState(dbPath), state)

      assert.equal(runCli(dir, ['memory', 'status']).status, 0)
      assert.equal(hashFile(dbPath), hash)
      assert.deepEqual(readdirSync(join(dir, '.ancleto')).sort(), firstRunFiles, 'dos corridas son idempotentes')
    })
  })

  it('sobre una DB WAL con nodos el contenido no cambia (sidecars 0 bytes permitidos)', () => {
    withRepo((dir) => {
      const dbPath = seedDatabase(dir, ['wal-uno'])
      writeProposal(dir, 'change-wal', EVIDENCE)

      const hash = hashFile(dbPath)
      const state = tableState(dbPath)
      assert.equal(runCli(dir, ['memory', 'status']).status, 0)
      assert.equal(hashFile(dbPath), hash, 'los bytes del .db no deben cambiar')
      assert.deepEqual(tableState(dbPath), state)

      const extras = readdirSync(join(dir, '.ancleto')).filter((name) => !['memory.db', 'memory.db-wal', 'memory.db-shm'].includes(name))
      assert.deepEqual(extras, [], 'no debe aparecer ningun artefacto nuevo fuera de los sidecars de SQLite')
    })
  })

  it('no toca .ancleto/working-context.md aunque haya gap', () => {
    withRepo((dir) => {
      seedDatabase(dir)
      writeProposal(dir, 'change-wc', EVIDENCE)
      const wcPath = join(dir, '.ancleto', 'working-context.md')
      const sentinel = '# working context\n\nno regenerar\n'
      writeFileSync(wcPath, sentinel)

      const { json } = statusJson(dir)
      assert.equal(json.gap, true)
      assert.equal(readFileSync(wcPath, 'utf8'), sentinel, 'el working-context no debe regenerarse')
    })
  })

  it('no importa nodos automaticamente aunque exista un export disponible', () => {
    withRepo((dir) => {
      seedDatabase(dir)
      writeProposal(dir, 'change-import', EVIDENCE)
      writeFileSync(join(dir, 'export.json'), JSON.stringify([
        { memory_key: 'importable', type: 'rule', scope: 'project', content: 'nodo listo para importar' }
      ]))

      const { json } = statusJson(dir)
      assert.equal(json.status, 'empty')
      assert.equal(json.gap, true)
      assert.equal(json.activeNodes, 0, 'ningun nodo debe importarse')

      const db = new DatabaseSync(join(dir, '.ancleto', 'memory.db'), { readOnly: true })
      try {
        assert.equal(db.prepare('SELECT count(*) AS n FROM memory_nodes').get().n, 0)
      } finally {
        db.close()
      }
    })
  })

  it('no altera el exit de memory doctor ni de ancleto check', () => {
    withRepo((dir) => {
      seedDatabase(dir)
      writeProposal(dir, 'change-gate', EVIDENCE)

      const doctorBefore = runCli(dir, ['memory', 'doctor'])
      const { json } = statusJson(dir)
      assert.equal(json.gap, true)
      const doctorAfter = runCli(dir, ['memory', 'doctor'])
      assert.equal(doctorAfter.status, doctorBefore.status, 'doctor conserva su exit code')
      assert.equal(doctorAfter.stdout, doctorBefore.stdout, 'doctor conserva su reporte')

      const checkBefore = runCli(dir, ['check'])
      runCli(dir, ['memory', 'status'])
      const checkAfter = runCli(dir, ['check'])
      assert.equal(checkAfter.status, checkBefore.status, 'check conserva su exit code')
    })
  })

  it('un error inesperado de apertura sale con 1, sin stack trace', () => {
    withRepo((dir) => {
      // Un directorio en la ruta de la base existe pero no puede abrirse como DB.
      mkdirSync(join(dir, '.ancleto', 'memory.db'), { recursive: true })

      const r = runCli(dir, ['memory', 'status', '--json'])
      assert.equal(r.status, 1, r.stdout)
      assert.equal(r.stdout.trim(), '', 'no debe emitir el objeto JSON')
      assert.ok(r.stderr.trim().length > 0, 'debe escribir un mensaje en stderr')
      assert.doesNotMatch(r.stderr, /^\s+at /m, 'no debe imprimir stack trace')
      assert.doesNotMatch(r.stderr, /\bERR_SQLITE_ERROR\b/, 'no debe volcar el codigo crudo de SQLite')
    })
  })

  it('el export conserva la forma de campos del nodo (compat del estado persistido)', () => {
    withRepo((dir) => {
      seedDatabase(dir, ['forma'])
      // La compatibilidad no se limita a sqlite_master/journal_mode: la forma del
      // export (nombres de campo, no contenido) tambien es contrato persistido.
      const r = runCli(dir, ['memory', 'export'])
      assert.equal(r.status, 0, r.stderr)
      const nodes = JSON.parse(r.stdout)
      assert.equal(nodes.length, 1)
      assert.deepEqual(Object.keys(nodes[0]).sort(), ['content', 'createdAt', 'justification', 'memory_key', 'scope', 'type'])
    })
  })
})
