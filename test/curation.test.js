import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { createMemoryEngine, createReadonlyMemoryEngine, resolveNodeRefs } from '../src/core/memory/engine.js'
import { resolveMemoryProjectRoot } from '../src/core/memory/working-context.js'
import { curateMemory } from '../src/core/memory/curation.js'

// CH-09 — curaduria read-only.
// Misma fixture que `test/memory-fixtures.test.js`: repo temporal con `.ancletorc`
// explicito, la DB en `<dir>/.ancleto/memory.db` y los nodos sembrados con
// `importNodes` (que no valida refs, asi se siembran refs rotas a proposito).
// Todo se congela en tmpdir: nunca se lee la `.ancleto/memory.db` viva.

const CLI_PATH = fileURLToPath(new URL('../src/cli/index.js', import.meta.url))

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function refsContent(refs) {
  return `prosa de prueba\n\nrefs:\n${refs.map((r) => `  - ${r}`).join('\n')}`
}

function repoNode(memory_key, content, type = 'rule', createdAt = '2026-01-01T00:00:00.000Z') {
  return { memory_key, type, scope: 'project', content, justification: 'fixture CH-09', createdAt }
}

function createFixture(seed = []) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-curate-'))
  mkdirSync(join(dir, '.ancleto'), { recursive: true })
  writeFileSync(join(dir, '.ancletorc'), '{}\n')
  const dbPath = join(dir, '.ancleto', 'memory.db')
  const engine = createMemoryEngine(dbPath)
  try {
    if (seed.length > 0) engine.importNodes(seed)
  } finally {
    engine.close()
  }
  return {
    dir,
    dbPath,
    cleanup() {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  }
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' })
}

function curate(dbPath) {
  const engine = createReadonlyMemoryEngine(dbPath)
  try {
    return curateMemory(engine, { projectRoot: resolveMemoryProjectRoot(dbPath) })
  } finally {
    engine.close()
  }
}

function readNodes(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    // Conjunto completo de filas: el scenario de duplicados exige que las filas de
    // `memory_nodes` sean identicas antes y despues de curar.
    return db.prepare(`SELECT * FROM memory_nodes ORDER BY memory_key, id`).all()
  } finally {
    db.close()
  }
}

function readSchema(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return db.prepare(`SELECT type, name, tbl_name FROM sqlite_master ORDER BY type, name`).all()
  } finally {
    db.close()
  }
}

const BROKEN_SEED = () => [
  repoNode('regla-a', refsContent(['path:src\\no-existe.js:12', 'spec:memory-ops#no-existe', 'change:no-existe']))
]

const DUPLICATE_SEED = () => [
  repoNode('dup-canonical', 'prosa duplicada\n\nrefs:\n  - change:x\n  - commit:abcdef1'),
  repoNode('dup-a', 'prosa duplicada'),
  repoNode('dup-b', 'prosa duplicada')
]

describe('memory curate — modulo de curaduria', () => {
  it('refs rotas de spec/change/path con kind, ref normalizada y reason, en orden de aparicion', () => {
    const fx = createFixture(BROKEN_SEED())
    try {
      const report = curate(fx.dbPath)
      assert.equal(report.status, 'ok')
      assert.deepEqual(report.brokenRefs, [
        { memory_key: 'regla-a', kind: 'path', ref: 'path:src/no-existe.js', reason: 'inexistente' },
        { memory_key: 'regla-a', kind: 'spec', ref: 'spec:memory-ops#no-existe', reason: 'inexistente' },
        { memory_key: 'regla-a', kind: 'change', ref: 'change:no-existe', reason: 'inexistente' }
      ])
      assert.deepEqual(report.unverifiable, [])
      assert.deepEqual(report.exactDuplicates, [])

      // Contraste con la primitiva: mismo orden, mismos kinds y mismas fallas.
      const resolved = resolveNodeRefs({ content: BROKEN_SEED()[0].content, projectRoot: fx.dir })
      assert.deepEqual(
        resolved.refs.filter((ref) => !ref.ok).map((ref) => ref.kind),
        report.brokenRefs.map((item) => item.kind)
      )
    } finally {
      fx.cleanup()
    }
  })

  it('commit: y workitem: caen en unverifiable y nunca en brokenRefs', () => {
    const fx = createFixture([repoNode('solo-vcs', refsContent(['commit:abcdef1', 'workitem:ado:1234']))])
    try {
      const report = curate(fx.dbPath)
      assert.deepEqual(report.brokenRefs, [])
      assert.deepEqual(report.unverifiable, [
        { memory_key: 'solo-vcs', kind: 'commit', ref: 'commit:abcdef1', reason: 'no verificable' },
        { memory_key: 'solo-vcs', kind: 'workitem', ref: 'workitem:ado:1234', reason: 'no verificable' }
      ])
    } finally {
      fx.cleanup()
    }
  })

  it('unverifiable se decide por el flag verifiable del resolver, no por una lista de kinds', () => {
    const content = refsContent(['commit:abcdef1', 'workitem:ado:1234', 'change:no-existe'])
    const fx = createFixture([repoNode('flag-vcs', content)])
    try {
      const resolved = resolveNodeRefs({ content, projectRoot: fx.dir })
      assert.deepEqual(
        resolved.refs.map((ref) => [ref.kind, ref.verifiable]),
        [['commit', false], ['workitem', false], ['change', true]]
      )

      const report = curate(fx.dbPath)
      assert.deepEqual(
        report.unverifiable.map((item) => [item.kind, item.reason]),
        [['commit', 'no verificable'], ['workitem', 'no verificable']]
      )
      assert.deepEqual(report.brokenRefs.map((item) => item.kind), ['change'])
    } finally {
      fx.cleanup()
    }
  })

  it('duplicados exactos reutilizan consolidate y no mutan la base', () => {
    const fx = createFixture(DUPLICATE_SEED())
    try {
      const engine = createReadonlyMemoryEngine(fx.dbPath)
      let expected
      try {
        expected = engine.consolidate({ dryRun: true }).exactGroups.map((group) => ({
          canonical: group.canonical,
          superseded: [...group.superseded]
        }))
      } finally {
        engine.close()
      }

      const before = readNodes(fx.dbPath)
      const report = curate(fx.dbPath)
      const after = readNodes(fx.dbPath)

      assert.deepEqual(report.exactDuplicates, [{ canonical: 'dup-canonical', superseded: ['dup-a', 'dup-b'] }])
      assert.deepEqual(report.exactDuplicates, expected, 'el reporte coincide con consolidate({ dryRun: true })')
      assert.deepEqual(after, before, 'la curaduria no cambia status/superseded_by/superseded_at')
      for (const row of after) {
        assert.equal(row.status, 'active')
        assert.equal(row.superseded_by, null)
        assert.equal(row.superseded_at, null)
      }
    } finally {
      fx.cleanup()
    }
  })

  it('el reporte conserva su forma y no se altera por el opt-out de near-duplicates', () => {
    const fx = createFixture([
      repoNode('near-a', 'alfa beta gamma delta'),
      repoNode('near-b', 'alfa beta gamma epsilon')
    ])
    try {
      const report = curate(fx.dbPath)
      assert.deepEqual(Object.keys(report), ['status', 'brokenRefs', 'unverifiable', 'exactDuplicates'])
      assert.deepEqual(report.exactDuplicates, [], 'un near-duplicate no entra como duplicado exacto')

      // La primitiva sigue reportando el near-duplicate con el default; la curaduria opta por no verlo.
      const engine = createReadonlyMemoryEngine(fx.dbPath)
      try {
        assert.equal(engine.consolidate({ dryRun: true }).nearDuplicates.length, 1)
        assert.deepEqual(engine.consolidate({ dryRun: true, includeNearDuplicates: false }).nearDuplicates, [])
      } finally {
        engine.close()
      }
    } finally {
      fx.cleanup()
    }
  })

  it('renderBrokenRef solo cambia separadores y quita :line: no colapsa . ni ..', () => {
    const content = refsContent([
      'path:src/a/../b.js',
      'path:..\\x',
      'path:C:\\repo\\no-existe.js',
      'path:src\\no-existe.js:12'
    ])
    const fx = createFixture([repoNode('refs-raras', content)])
    try {
      const report = curate(fx.dbPath)
      const displayed = report.brokenRefs.map((item) => item.ref)
      // Texto declarado con solo separadores normalizados: `src/a/../b.js` NO se
      // colapsa a `src/b.js`, y `..\x` conserva el `..`.
      assert.deepEqual(displayed, [
        'path:src/a/../b.js',
        'path:../x',
        'path:C:/repo/no-existe.js',
        'path:src/no-existe.js'
      ])
      for (const ref of displayed) {
        assert.equal(ref.includes('\\'), false, 'POSIX: sin backslash')
        assert.doesNotMatch(ref, /:\d+$/, 'sin sufijo :line')
      }
      assert.equal(report.brokenRefs.length, 4, 'ninguna ref se descarta en silencio')
      assert.deepEqual(report.brokenRefs.map((item) => item.memory_key), ['refs-raras', 'refs-raras', 'refs-raras', 'refs-raras'])

      // Resolucion y motivo siguen viniendo del engine, no de la normalizacion de display.
      const resolved = resolveNodeRefs({ content, projectRoot: fx.dir })
      assert.deepEqual(
        report.brokenRefs.map((item) => item.reason),
        resolved.refs.filter((ref) => !ref.ok).map((ref) => ref.reason)
      )
    } finally {
      fx.cleanup()
    }
  })

  it('reason es informativo y no enumerado: reutiliza el motivo del engine (sin raíz)', () => {
    const fx = createFixture(BROKEN_SEED())
    try {
      const engine = createReadonlyMemoryEngine(fx.dbPath)
      try {
        const report = curateMemory(engine, {})
        const resolved = resolveNodeRefs({ content: BROKEN_SEED()[0].content })
        assert.deepEqual(
          report.brokenRefs.map((item) => item.reason),
          resolved.refs.filter((ref) => !ref.ok).map((ref) => ref.reason)
        )
        assert.deepEqual(report.brokenRefs.map((item) => item.reason), ['sin raíz', 'sin raíz', 'sin raíz'])
      } finally {
        engine.close()
      }
    } finally {
      fx.cleanup()
    }
  })

  it('un bloque refs: malformado o repetido se reporta como gramatica invalida sin kind', () => {
    const repeated = createFixture([repoNode('doble-bloque', 'prosa\n\nrefs:\n  - change:a\n\nrefs:\n  - change:b')])
    const malformed = createFixture([repoNode('linea-invalida', 'prosa\n\nrefs:\n  no-es-una-ref')])
    try {
      const repeatedReport = curate(repeated.dbPath)
      assert.deepEqual(repeatedReport.brokenRefs, [
        { memory_key: 'doble-bloque', ref: 'refs:', reason: 'inválido (gramática)' }
      ])
      assert.equal('kind' in repeatedReport.brokenRefs[0], false, 'el bloque malformado omite kind')

      const malformedReport = curate(malformed.dbPath)
      assert.equal(malformedReport.brokenRefs.length, 1)
      assert.equal(malformedReport.brokenRefs[0].ref, 'no-es-una-ref', 'usa la linea ofensora como ref')
      assert.equal(malformedReport.brokenRefs[0].reason, 'inválido (gramática)')
      assert.equal('kind' in malformedReport.brokenRefs[0], false, 'la linea invalida omite kind')
    } finally {
      repeated.cleanup()
      malformed.cleanup()
    }
  })

  it('un kind sin verifiable no se clasifica en silencio: el resolver lo declara y un prefijo desconocido es gramatica invalida', () => {
    const known = refsContent(['commit:abcdef1', 'workitem:ado:1234', 'change:no-existe'])
    const fx = createFixture([
      repoNode('kinds-conocidos', known),
      repoNode('kind-desconocido', refsContent(['foo:bar']))
    ])
    try {
      // Contrato del que depende la curaduria: hoy todo ref con kind conocido declara
      // `verifiable` booleano. Si un kind futuro no lo declara, este assert falla antes de
      // que el reporte cambie de particion sin que nadie lo note.
      for (const ref of resolveNodeRefs({ content: known, projectRoot: fx.dir }).refs) {
        assert.equal(typeof ref.verifiable, 'boolean', `el kind ${ref.kind} debe declarar verifiable`)
      }

      const report = curate(fx.dbPath)
      // Un prefijo que el resolver no conoce no llega a clasificarse: se reporta como
      // gramatica invalida, sin kind, en brokenRefs y con la linea ofensora como ref.
      // Nunca se descarta en silencio.
      assert.deepEqual(report.brokenRefs.find((item) => item.memory_key === 'kind-desconocido'), {
        memory_key: 'kind-desconocido',
        ref: '- foo:bar',
        reason: 'inválido (gramática)'
      })
      // La particion es exactamente `verifiable === false` -> unverifiable; si no resuelve -> roto.
      assert.deepEqual(report.unverifiable.map((item) => [item.memory_key, item.kind]), [
        ['kinds-conocidos', 'commit'],
        ['kinds-conocidos', 'workitem']
      ])
      assert.deepEqual(
        report.brokenRefs.filter((item) => item.memory_key === 'kinds-conocidos').map((item) => item.kind),
        ['change']
      )
    } finally {
      fx.cleanup()
    }
  })

  it('el orden es total por memory_key y no depende del orden de insercion', () => {
    const forward = createFixture([
      repoNode('zeta', refsContent(['change:no-existe'])),
      repoNode('alfa', refsContent(['commit:abcdef1', 'change:tampoco']))
    ])
    const reverse = createFixture([
      repoNode('alfa', refsContent(['commit:abcdef1', 'change:tampoco'])),
      repoNode('zeta', refsContent(['change:no-existe']))
    ])
    try {
      const first = runCli(forward.dir, ['memory', 'curate', '--json'])
      const second = runCli(reverse.dir, ['memory', 'curate', '--json'])
      assert.equal(first.status, 0)
      assert.equal(first.stdout, second.stdout)
      assert.deepEqual(
        JSON.parse(first.stdout).brokenRefs.map((item) => item.memory_key),
        ['alfa', 'zeta']
      )
    } finally {
      forward.cleanup()
      reverse.cleanup()
    }
  })
})

describe('memory curate — CLI', () => {
  it('advisory sale 0 con hallazgos; --strict sale distinto de 0', () => {
    const fx = createFixture([...BROKEN_SEED(), ...DUPLICATE_SEED()])
    try {
      const advisory = runCli(fx.dir, ['memory', 'curate', '--json'])
      assert.equal(advisory.status, 0)
      const report = JSON.parse(advisory.stdout)
      assert.deepEqual(Object.keys(report), ['status', 'brokenRefs', 'unverifiable', 'exactDuplicates'])
      assert.ok(report.brokenRefs.length > 0)
      assert.ok(report.exactDuplicates.length > 0)

      const strict = runCli(fx.dir, ['memory', 'curate', '--strict', '--json'])
      assert.notEqual(strict.status, 0)
      assert.equal(strict.stdout, advisory.stdout, '--strict no cambia el reporte, solo el exit code')
    } finally {
      fx.cleanup()
    }
  })

  it('sin hallazgos --strict tambien sale 0 (unverifiable no cuenta)', () => {
    const fx = createFixture([repoNode('solo-vcs', refsContent(['commit:abcdef1', 'workitem:ado:1234']))])
    try {
      const strict = runCli(fx.dir, ['memory', 'curate', '--strict', '--json'])
      assert.equal(strict.status, 0)
      assert.deepEqual(JSON.parse(strict.stdout).brokenRefs, [])
    } finally {
      fx.cleanup()
    }
  })

  it('base ausente se reporta como no-db y nunca sale 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-curate-nodb-'))
    try {
      const advisory = runCli(dir, ['memory', 'curate', '--json'])
      assert.notEqual(advisory.status, 0)
      const report = JSON.parse(advisory.stdout)
      assert.equal(report.status, 'no-db')
      assert.equal(report.brokenRefs, null, 'no-db no se presenta como reporte limpio')

      const strict = runCli(dir, ['memory', 'curate', '--strict', '--json'])
      assert.notEqual(strict.status, 0)
      assert.equal(JSON.parse(strict.stdout).status, 'no-db')
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })

  it('rechaza flags desconocidos con uso y codigo distinto de 0', () => {
    const fx = createFixture([])
    try {
      const result = runCli(fx.dir, ['memory', 'curate', '--fix'])
      assert.notEqual(result.status, 0)
      assert.match(result.stderr, /uso: ancleto memory curate \[--json\] \[--strict\]/)
    } finally {
      fx.cleanup()
    }
  })
})

describe('memory curate — invariante read-only', () => {
  it('.db byte a byte identico, sqlite_master y nodos iguales, corridas idempotentes', () => {
    const fx = createFixture([...BROKEN_SEED(), ...DUPLICATE_SEED()])
    try {
      const before = hashFile(fx.dbPath)
      const nodesBefore = readNodes(fx.dbPath)
      const schemaBefore = readSchema(fx.dbPath)

      const first = runCli(fx.dir, ['memory', 'curate', '--json'])
      const afterFirst = hashFile(fx.dbPath)
      const second = runCli(fx.dir, ['memory', 'curate', '--json'])
      const afterSecond = hashFile(fx.dbPath)

      assert.equal(first.status, 0)
      assert.equal(afterFirst, before, 'el .db queda byte a byte identico tras la primera corrida')
      assert.equal(afterSecond, before, 'el .db queda byte a byte identico tras la segunda corrida')
      assert.equal(first.stdout, second.stdout, 'dos corridas consecutivas son idempotentes')
      assert.deepEqual(readNodes(fx.dbPath), nodesBefore)
      assert.deepEqual(readSchema(fx.dbPath), schemaBefore)
    } finally {
      fx.cleanup()
    }
  })

  it('con journal_mode=DELETE el .db y el conjunto de nodos quedan identicos', () => {
    const fx = createFixture([...BROKEN_SEED(), ...DUPLICATE_SEED()])
    try {
      // El scenario exige journal_mode=DELETE: se cambia antes de fijar la linea base.
      const db = new DatabaseSync(fx.dbPath)
      try {
        db.exec('PRAGMA journal_mode = DELETE')
        assert.equal(String(db.prepare('PRAGMA journal_mode').get().journal_mode).toLowerCase(), 'delete')
      } finally {
        db.close()
      }

      const before = hashFile(fx.dbPath)
      const nodesBefore = readNodes(fx.dbPath)
      const first = runCli(fx.dir, ['memory', 'curate', '--json'])
      assert.equal(first.status, 0)
      assert.equal(hashFile(fx.dbPath), before, 'journal_mode=DELETE: el .db no cambia')

      const second = runCli(fx.dir, ['memory', 'curate', '--json'])
      assert.equal(second.status, 0)
      assert.equal(hashFile(fx.dbPath), before, 'la segunda corrida tampoco escribe el .db')
      assert.equal(second.stdout, first.stdout, 'dos corridas consecutivas son idempotentes')
      assert.deepEqual(readNodes(fx.dbPath), nodesBefore, 'filas y estados de memory_nodes no cambian')
    } finally {
      fx.cleanup()
    }
  })

  it('la salida no incluye timestamps ni separadores Windows', () => {
    const fx = createFixture(BROKEN_SEED())
    try {
      const result = runCli(fx.dir, ['memory', 'curate', '--json'])
      assert.equal(result.status, 0)
      assert.doesNotMatch(result.stdout, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/, 'sin timestamps')
      assert.equal(result.stdout.includes('\\\\'), false, 'sin separadores Windows en el reporte')
      assert.deepEqual(JSON.parse(result.stdout).brokenRefs[0].ref, 'path:src/no-existe.js')
    } finally {
      fx.cleanup()
    }
  })
})
