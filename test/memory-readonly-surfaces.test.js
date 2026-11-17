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

// memory-readonly-surfaces — matriz de 4 estados de base × superficies de lectura
// contra el contrato ADDED `specs/memory-ops/spec.md` del change
// `memory-readonly-surfaces`. Toda fixture vive en tmpdir: nunca se abre ni se
// escribe `.ancleto/memory.db` del repositorio. Las superficies que no son
// `status`/`doctor` se spawnean igual que en `test/memory-status.test.js` porque
// la suite no importa el entry point del CLI.

const CLI_PATH = fileURLToPath(new URL('../src/cli/index.js', import.meta.url))
const DB_REL = join('.ancleto', 'memory.db')
const SIDECARS = ['memory.db', 'memory.db-shm', 'memory.db-wal']

function withRepo(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-readonly-'))
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

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

// Conjunto nombre/tipo de `sqlite_master`: la lectura no debe incorporar objetos.
function schemaOf(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return db.prepare('SELECT type, name FROM sqlite_master ORDER BY type, name').all()
  } finally {
    db.close()
  }
}

function nodesOf(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return db
      .prepare('SELECT id, memory_key, status, superseded_by, superseded_at FROM memory_nodes ORDER BY id')
      .all()
  } finally {
    db.close()
  }
}

// Archivos dentro de `.ancleto/`; [] cuando el directorio no existe.
function memoryFiles(dir) {
  const abs = join(dir, '.ancleto')
  return existsSync(abs) ? readdirSync(abs).sort() : []
}

function seedDatabase(dir, keys = []) {
  const dbPath = join(dir, DB_REL)
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

function zeroByteDatabase(dir) {
  mkdirSync(join(dir, '.ancleto'), { recursive: true })
  const dbPath = join(dir, DB_REL)
  writeFileSync(dbPath, '')
  return dbPath
}

// Fixture determinista en journal_mode=DELETE: sin sidecars que tolerar, el
// escenario estricto del delta (no aparece ningún sidecar nuevo).
function deleteMode(dbPath) {
  const db = new DatabaseSync(dbPath)
  try {
    db.exec('PRAGMA journal_mode = DELETE')
    assert.equal(String(db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(), 'delete')
  } finally {
    db.close()
  }
}

function writeDryFile(dir) {
  writeFileSync(join(dir, 'dry.json'), JSON.stringify([
    {
      memory_key: 'readonly-dry',
      type: 'rule',
      scope: 'project',
      content: 'nodo del simulacro',
      createdAt: '2026-01-01T00:00:00.000Z'
    }
  ]) + '\n')
}

function writeDiscoveryMap(dir) {
  writeFileSync(join(dir, '.discovery-map.json'), JSON.stringify({
    last_updated: '2020-01-01T00:00:00.000Z',
    total_files: 4,
    tree_summary: { src: 2, test: 2 },
    root_files: []
  }) + '\n')
}

function assertNoStack(r, label) {
  const text = `${r.stdout}\n${r.stderr}`
  assert.doesNotMatch(text, /^\s+at /m, `${label}: no debe imprimir stack trace`)
  assert.doesNotMatch(text, /Error: no such table/, `${label}: no debe filtrar el error crudo de SQLite`)
}

function statusJson(r) {
  return JSON.parse(r.stdout)
}

// Las nueve superficies de lectura del requirement, en su invocación mínima.
function surfaceRuns(dir) {
  return {
    context: runCli(dir, ['memory', 'context', '--scope', 'project']),
    list: runCli(dir, ['memory', 'list']),
    export: runCli(dir, ['memory', 'export']),
    curate: runCli(dir, ['memory', 'curate']),
    status: runCli(dir, ['memory', 'status', '--json']),
    doctor: runCli(dir, ['memory', 'doctor']),
    merge: runCli(dir, ['memory', 'merge', '--dry-run', '--target', 'target', '--sources', 'source']),
    repair: runCli(dir, ['memory', 'repair', 'refs', '--memory-key', 'clave']),
    importDry: runCli(dir, ['memory', 'import', '--dry-run', 'dry.json'])
  }
}

function assertNoStackForAll(runs, label) {
  for (const [name, r] of Object.entries(runs)) assertNoStack(r, `${label} ${name}`)
}

describe('memory readonly surfaces — sin base', () => {
  it('los nueve comandos degradan con sus exit/mensajes y no crean .ancleto/ ni memory.db', () => {
    withRepo((dir) => {
      writeDryFile(dir)
      const runs = surfaceRuns(dir)
      assertNoStackForAll(runs, 'sin base')

      assert.equal(runs.context.status, 0)
      assert.match(runs.context.stderr, /sin reglas activas/)

      assert.equal(runs.list.status, 0)
      assert.match(runs.list.stderr, /no hay memoria en este repo/)

      assert.equal(runs.export.status, 1)
      assert.match(runs.export.stderr, /no hay memoria en este repo/)

      assert.equal(runs.curate.status, 1)
      assert.match(runs.curate.stderr, /no hay memoria en este repo/)

      assert.equal(runs.status.status, 0)
      assert.equal(statusJson(runs.status).status, 'no-db')
      assert.equal(statusJson(runs.status).dbPresent, false)

      assert.equal(runs.doctor.status, 0)
      assert.match(runs.doctor.stderr, /no hay memoria en este repo/)

      assert.equal(runs.merge.status, 1)
      assert.match(runs.merge.stderr, /no hay memoria en este repo/)

      assert.equal(runs.repair.status, 1)
      assert.match(runs.repair.stderr, /no hay memoria en este repo/)

      assert.equal(runs.importDry.status, 0)
      assert.match(runs.importDry.stdout, /nuevo:1 identico:0 divergente:0 tombstone:0/)

      assert.equal(existsSync(join(dir, '.ancleto')), false, 'ninguna lectura debe crear .ancleto/')
      assert.equal(existsSync(join(dir, DB_REL)), false, 'ninguna lectura debe crear memory.db')
    })
  })
})

describe('memory readonly surfaces — base de 0 bytes (sin esquema)', () => {
  it('degrada igual que "sin base" salvo status/doctor, sin migrar ni escribir el archivo', () => {
    withRepo((dir) => {
      const dbPath = zeroByteDatabase(dir)
      writeDryFile(dir)
      const hash = hashFile(dbPath)
      const schema = schemaOf(dbPath)
      assert.deepEqual(schema, [])

      const runs = surfaceRuns(dir)
      assertNoStackForAll(runs, '0 bytes')

      assert.equal(runs.context.status, 0)
      assert.match(runs.context.stderr, /sin reglas activas/)

      assert.equal(runs.list.status, 0)
      assert.match(runs.list.stderr, /sin esquema inicializado/)

      assert.equal(runs.export.status, 1)
      assert.match(runs.export.stderr, /sin esquema inicializado/)

      assert.equal(runs.curate.status, 1)
      assert.match(runs.curate.stderr, /esquema no inicializado/)

      assert.equal(runs.status.status, 0)
      assert.equal(statusJson(runs.status).status, 'uninitialized')
      assert.equal(statusJson(runs.status).dbPresent, true)

      assert.equal(runs.doctor.status, 1)
      assert.match(runs.doctor.stdout, /Integridad DB: esquema no inicializado/)

      assert.equal(runs.merge.status, 1)
      assert.match(runs.merge.stderr, /sin esquema inicializado/)
      assert.doesNotMatch(runs.merge.stderr, /rechazado/)

      assert.equal(runs.repair.status, 1)
      assert.match(runs.repair.stderr, /sin esquema inicializado/)
      assert.doesNotMatch(runs.repair.stderr, /rechazado/)

      assert.equal(runs.importDry.status, 0)
      assert.match(runs.importDry.stdout, /nuevo:1 identico:0 divergente:0 tombstone:0/)

      assert.equal(statSync(dbPath).size, 0, 'el archivo de 0 bytes no debe crecer')
      assert.equal(hashFile(dbPath), hash, 'los bytes del .db no deben cambiar')
      assert.deepEqual(schemaOf(dbPath), schema, 'no debe aparecer ningún objeto en sqlite_master')
      assert.deepEqual(memoryFiles(dir), ['memory.db'], 'no deben aparecer sidecars')
    })
  })
})

describe('memory readonly surfaces — esquema con 0 nodos (vacía legítima)', () => {
  it('list/export/curate no son error y las validaciones de merge/repair se conservan (DELETE)', () => {
    withRepo((dir) => {
      const dbPath = seedDatabase(dir)
      deleteMode(dbPath)
      writeDryFile(dir)
      const before = { hash: hashFile(dbPath), schema: schemaOf(dbPath), files: memoryFiles(dir) }

      const runs = surfaceRuns(dir)
      assertNoStackForAll(runs, 'esquema sin nodos')

      assert.equal(runs.context.status, 0)

      assert.equal(runs.list.status, 0)
      assert.match(runs.list.stdout, /sin nodos para ese filtro/)

      assert.equal(runs.export.status, 0)
      assert.equal(runs.export.stdout.trim(), '[]')

      assert.equal(runs.curate.status, 0)
      assert.match(runs.curate.stdout, /0 ref\(s\) rota\(s\)/)

      assert.equal(runs.status.status, 0)
      assert.equal(statusJson(runs.status).status, 'empty')
      assert.equal(statusJson(runs.status).activeNodes, 0)

      assert.equal(runs.doctor.status, 0)

      assert.equal(runs.merge.status, 1)
      assert.match(runs.merge.stderr, /merge rechazado/)
      assert.doesNotMatch(runs.merge.stderr, /sin esquema inicializado/)

      assert.equal(runs.repair.status, 1)
      assert.match(runs.repair.stderr, /repair refs rechazado/)
      assert.doesNotMatch(runs.repair.stderr, /sin esquema inicializado/)

      assert.equal(runs.importDry.status, 0)
      assert.match(runs.importDry.stdout, /nuevo:1/)

      assert.equal(hashFile(dbPath), before.hash, 'el .db conserva su SHA-256')
      assert.deepEqual(schemaOf(dbPath), before.schema, 'sqlite_master idéntico')
      assert.deepEqual(memoryFiles(dir), before.files, 'journal_mode=DELETE no gana sidecars')
    })
  })
})

describe('memory readonly surfaces — esquema con nodos', () => {
  it('lee el contenido sin alterar nodos, bytes ni sqlite_master (DELETE)', () => {
    withRepo((dir) => {
      const dbPath = seedDatabase(dir, ['clave-a', 'clave-b'])
      deleteMode(dbPath)
      writeDryFile(dir)
      const before = {
        hash: hashFile(dbPath),
        schema: schemaOf(dbPath),
        nodes: nodesOf(dbPath),
        files: memoryFiles(dir)
      }

      const runs = surfaceRuns(dir)
      assertNoStackForAll(runs, 'esquema con nodos')

      assert.equal(runs.context.status, 0)
      assert.match(runs.context.stdout, /<ProjectMemoryRules>/)
      assert.match(runs.context.stdout, /clave-a/)

      assert.equal(runs.list.status, 0)
      assert.match(runs.list.stdout, /2 nodo\(s\)/)

      assert.equal(runs.export.status, 0)
      const exported = JSON.parse(runs.export.stdout)
      assert.deepEqual(exported.map((n) => n.memory_key).sort(), ['clave-a', 'clave-b'])

      assert.equal(runs.curate.status, 0)

      assert.equal(runs.status.status, 0)
      assert.equal(statusJson(runs.status).status, 'ok')
      assert.equal(statusJson(runs.status).activeNodes, 2)

      assert.equal(runs.doctor.status, 0)

      assert.equal(runs.merge.status, 1)
      assert.match(runs.merge.stderr, /merge rechazado/)

      assert.equal(runs.repair.status, 1)
      assert.match(runs.repair.stderr, /repair refs rechazado/)

      assert.equal(runs.importDry.status, 0)
      assert.match(runs.importDry.stdout, /nuevo:1/)

      assert.equal(hashFile(dbPath), before.hash, 'el .db conserva su SHA-256')
      assert.deepEqual(schemaOf(dbPath), before.schema, 'sqlite_master idéntico')
      assert.deepEqual(nodesOf(dbPath), before.nodes, 'ningún nodo cambia de estado')
      assert.deepEqual(memoryFiles(dir), before.files, 'journal_mode=DELETE no gana sidecars')
    })
  })
})

describe('memory readonly surfaces — sidecars', () => {
  it('sobre WAL el .db queda intacto y los sidecars se toleran (no se exige cero sidecars)', () => {
    withRepo((dir) => {
      const dbPath = seedDatabase(dir, ['wal-uno'])
      writeDryFile(dir)
      const before = { hash: hashFile(dbPath), schema: schemaOf(dbPath), nodes: nodesOf(dbPath) }

      const runs = surfaceRuns(dir)
      assertNoStackForAll(runs, 'WAL')

      const extras = memoryFiles(dir).filter((name) => !SIDECARS.includes(name))
      assert.deepEqual(extras, [], 'sólo se toleran memory.db y sus sidecars de SQLite')
      assert.equal(hashFile(dbPath), before.hash, 'los bytes del .db no deben cambiar')
      assert.deepEqual(schemaOf(dbPath), before.schema, 'sqlite_master idéntico')
      assert.deepEqual(nodesOf(dbPath), before.nodes, 'ningún nodo cambia de estado')
    })
  })

  it('sobre journal_mode=DELETE no aparece ningún sidecar nuevo', () => {
    withRepo((dir) => {
      const dbPath = seedDatabase(dir, ['delete-uno'])
      deleteMode(dbPath)
      writeDryFile(dir)
      const before = memoryFiles(dir)
      assert.deepEqual(before, ['memory.db'], 'precondición: la fixture DELETE arranca sin sidecars')

      const runs = surfaceRuns(dir)
      assertNoStackForAll(runs, 'DELETE')
      assert.deepEqual(memoryFiles(dir), before, 'no debe aparecer -wal ni -shm')
    })
  })
})

describe('memory readonly surfaces — context --out', () => {
  it('escribe el working-context y su directorio, y no el .db (sin base)', () => {
    withRepo((dir) => {
      writeDiscoveryMap(dir)
      const r = runCli(dir, ['memory', 'context', '--scope', 'project', '--out', 'out/nested/ctx.md'])
      assert.equal(r.status, 0, r.stderr)
      assertNoStack(r, 'context --out sin base')

      const outPath = join(dir, 'out', 'nested', 'ctx.md')
      assert.equal(existsSync(outPath), true, 'debe crear el directorio del archivo de salida')
      assert.match(readFileSync(outPath, 'utf8'), /<ProjectTopology>/)
      assert.equal(existsSync(join(dir, DB_REL)), false, 'no debe crear .ancleto/memory.db')
    })
  })

  it('sobre una base de 0 bytes escribe el bloque y deja el .db intacto', () => {
    withRepo((dir) => {
      const dbPath = zeroByteDatabase(dir)
      writeDiscoveryMap(dir)
      const hash = hashFile(dbPath)

      const r = runCli(dir, ['memory', 'context', '--scope', 'project', '--out', 'ctx.md'])
      assert.equal(r.status, 0, r.stderr)
      assertNoStack(r, 'context --out 0 bytes')

      assert.match(readFileSync(join(dir, 'ctx.md'), 'utf8'), /<ProjectTopology>/)
      assert.equal(hashFile(dbPath), hash, 'el .db no se modifica')
      assert.equal(statSync(dbPath).size, 0, 'el .db sigue sin esquema')
    })
  })
})

describe('memory readonly surfaces — base ilegible', () => {
  const unreadableCases = [
    ['context', ['memory', 'context', '--scope', 'project']],
    ['list', ['memory', 'list']],
    ['export', ['memory', 'export']],
    ['curate', ['memory', 'curate']],
    ['status', ['memory', 'status', '--json']],
    ['merge', ['memory', 'merge', '--dry-run', '--target', 'target', '--sources', 'source']],
    ['repair', ['memory', 'repair', 'refs', '--memory-key', 'clave']],
    ['import', ['memory', 'import', '--dry-run', 'dry.json']]
  ]

  it('sale != 0, nombra el fallo de lectura y no lo confunde con "sin esquema"', () => {
    withRepo((dir) => {
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      const dbPath = join(dir, DB_REL)
      writeFileSync(dbPath, 'esto no es una base sqlite')
      writeDryFile(dir)
      const hash = hashFile(dbPath)

      for (const [name, args] of unreadableCases) {
        const r = runCli(dir, args)
        assert.notEqual(r.status, 0, `${name} debe salir != 0`)
        assertNoStack(r, name)
        assert.match(r.stderr, /(no se pudo leer|base ilegible)/, `${name} debe nombrar el fallo de lectura`)
        assert.doesNotMatch(
          `${r.stdout}${r.stderr}`,
          /esquema (no )?inicializado/i,
          `${name} no debe reportarse como "sin esquema"`
        )
      }

      assert.equal(hashFile(dbPath), hash, 'el archivo ilegible no se toca')
      assert.equal(readFileSync(dbPath, 'utf8'), 'esto no es una base sqlite')
    })
  })

  it('doctor distingue el fallo de lectura sin stack (contrato ADDED)', () => {
    withRepo((dir) => {
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      const dbPath = join(dir, DB_REL)
      writeFileSync(dbPath, 'esto no es una base sqlite')
      const hash = hashFile(dbPath)

      const r = runCli(dir, ['memory', 'doctor'])
      assert.notEqual(r.status, 0, 'doctor debe salir != 0 sobre una base ilegible')
      assertNoStack(r, 'doctor')
      assert.doesNotMatch(`${r.stdout}${r.stderr}`, /esquema (no )?inicializado/i)
      assert.equal(hashFile(dbPath), hash, 'el archivo ilegible no se toca')
    })
  })
})

describe('memory readonly surfaces — contratos pineados de status y doctor', () => {
  const states = [
    ['no-db', () => {}, 'no-db', 0],
    ['uninitialized', (dir) => zeroByteDatabase(dir), 'uninitialized', 1],
    ['empty', (dir) => seedDatabase(dir), 'empty', 0],
    ['ok', (dir) => seedDatabase(dir, ['viva']), 'ok', 0]
  ]

  it('status --json conserva los cuatro estados, sale 0 y no muta', () => {
    for (const [label, prepare, expected] of states) {
      withRepo((dir) => {
        prepare(dir)
        const dbPath = join(dir, DB_REL)
        const before = existsSync(dbPath)
          ? { hash: hashFile(dbPath), schema: schemaOf(dbPath) }
          : null

        const r = runCli(dir, ['memory', 'status', '--json'])
        assert.equal(r.status, 0, `${label}: ${r.stderr}`)
        assertNoStack(r, `status ${label}`)
        const json = statusJson(r)
        assert.equal(json.status, expected, label)
        assert.equal(json.dbPresent, expected !== 'no-db', label)

        if (before) {
          assert.equal(hashFile(dbPath), before.hash, `${label}: .db intacto`)
          assert.deepEqual(schemaOf(dbPath), before.schema, `${label}: sqlite_master idéntico`)
        } else {
          assert.equal(existsSync(join(dir, '.ancleto')), false, `${label}: no crea .ancleto/`)
        }
      })
    }
  })

  it('doctor conserva 0/1/0/0, no muta y una base de 0 bytes sigue en 0 bytes', () => {
    for (const [label, prepare, , expected] of states) {
      withRepo((dir) => {
        prepare(dir)
        const dbPath = join(dir, DB_REL)
        const before = existsSync(dbPath) ? hashFile(dbPath) : null

        const r = runCli(dir, ['memory', 'doctor'])
        assert.equal(r.status, expected, `${label}: ${r.stdout}${r.stderr}`)
        assertNoStack(r, `doctor ${label}`)

        if (before) {
          assert.equal(hashFile(dbPath), before, `${label}: .db intacto`)
        } else {
          assert.equal(existsSync(join(dir, '.ancleto')), false, `${label}: no crea .ancleto/`)
        }
        if (label === 'uninitialized') {
          assert.equal(statSync(dbPath).size, 0, 'la base de 0 bytes sigue midiendo 0 bytes')
        }
      })
    }
  })
})
