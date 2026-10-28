import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createMemoryEngine, createReadonlyMemoryEngine } from '../src/core/memory/engine.js'
import { memoryDoctor } from '../src/core/memory/doctor.js'

// Reingenieria memoria-first / PR-1 — Fase 1.
// La fixture se congela en tmpdir y nunca se lee `.ancleto/memory.db` viva.
// El seed usa el formato exacto de `exportActive()` y se siembra con el
// `importNodes` existente: no hay loader nuevo.

const FIXTURE_KEYS = [
  'feature-flag-rollout',
  'lint-before-close',
  'node-test-scope-explicit-paths',
  'opencode-permission-bash-last-match-wins',
  'test-runner-invocation',
  'validation-commands-declarative'
]

const GOLDEN_IDS = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10']

// Allowlist explicita: si el set diferido de golden.json cambia, el harness falla.
const DEFERRED_ALLOWLIST = ['M02', 'M03', 'M04', 'M05', 'M06', 'M08', 'M09', 'M10']

const EXPORT_KEYS = ['content', 'createdAt', 'justification', 'memory_key', 'scope', 'type']

function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/memory/${name}`, import.meta.url), 'utf8'))
}

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

function fileSize(file) {
  return existsSync(file) ? statSync(file).size : null
}

// Estado de los tres archivos de una base WAL: sha256 y tamano, o null si no existe.
function sidecarState(dbPath) {
  const files = { db: dbPath, wal: `${dbPath}-wal`, shm: `${dbPath}-shm` }
  return Object.fromEntries(
    Object.entries(files).map(([name, file]) => [name, existsSync(file) ? { sha256: hashFile(file), size: fileSize(file) } : null])
  )
}

function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-memfix-'))
  const dbPath = join(dir, '.ancleto', 'memory.db')
  const engine = createMemoryEngine(dbPath)
  const summary = engine.importNodes(loadFixture('seed.json'))
  let closed = false
  return {
    dir,
    dbPath,
    engine,
    summary,
    closeEngine() {
      if (closed) return
      engine.close()
      closed = true
    },
    cleanup() {
      try {
        this.closeEngine()
      } catch {
        // best effort: en Windows los handles de WAL pueden tardar en liberarse
      }
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      } catch {
        // best effort: el tmpdir se limpia solo en el siguiente reinicio
      }
    }
  }
}

function readState(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return {
      active: db.prepare(`SELECT memory_key FROM memory_nodes WHERE status = 'active' ORDER BY memory_key`)
        .all().map((r) => r.memory_key),
      superseded: db.prepare(`SELECT memory_key, superseded_by FROM memory_nodes
        WHERE status = 'superseded' ORDER BY memory_key`).all()
    }
  } finally {
    db.close()
  }
}

function goldenOutcome(engine, entry) {
  const results = engine.searchMemory({ query: entry.query, limit: 10 })
  if (entry.expected.mode === 'topK') {
    return { id: entry.id, mode: 'topK', keys: results.slice(0, entry.expected.k).map((r) => r.memory_key) }
  }
  if (entry.expected.mode === 'abstain') {
    return { id: entry.id, mode: 'abstain', keys: results.map((r) => r.memory_key) }
  }
  throw new Error(`${entry.id}: modo expected desconocido "${entry.expected.mode}"`)
}

function activeGoldenOutcomes(engine, entries = loadFixture('golden.json')) {
  return entries.filter((e) => e.status === 'active').map((e) => goldenOutcome(engine, e))
}

function assertGoldenEntry(engine, entry) {
  const outcome = goldenOutcome(engine, entry)
  if (outcome.mode === 'topK') {
    for (const key of entry.expected.memory_keys) {
      assert.ok(
        outcome.keys.includes(key),
        `${entry.id}: "${key}" no aparece en el top-${entry.expected.k} (${outcome.keys.join(', ') || 'vacio'})`
      )
    }
    return
  }
  assert.equal(
    outcome.keys.length,
    0,
    `${entry.id}: se esperaba abstencion y hubo ${outcome.keys.length} resultados (${outcome.keys.join(', ')})`
  )
}

describe('fixtures de memoria', () => {
  it('seed.json se siembra con importNodes y respeta el formato de exportActive', () => {
    const fx = createFixture()
    try {
      assert.deepEqual(fx.summary, { inserted: 6, updated: 0, skipped: 0 })
      const exported = fx.engine.exportActive()
      assert.deepEqual(exported.map((n) => n.memory_key).sort(), FIXTURE_KEYS)
      for (const node of exported) {
        assert.deepEqual(Object.keys(node).sort(), EXPORT_KEYS)
      }

      // El bloque inyectado filtra por scope y tipo: la decision feature no entra.
      const block = fx.engine.buildWorkingContext('project', undefined, fx.dir)
      assert.match(block, /\[test-runner-invocation\]/)
      assert.match(block, /\[node-test-scope-explicit-paths\]/)
      assert.doesNotMatch(block, /feature-flag-rollout/)
    } finally {
      fx.cleanup()
    }
  })
})

describe('harness golden M01–M10', () => {
  it('declara diez ids, dos activas y el set diferido del allowlist', () => {
    const entries = loadFixture('golden.json')
    assert.equal(entries.length, 10)
    assert.deepEqual(entries.map((e) => e.id).sort(), GOLDEN_IDS)

    for (const entry of entries) {
      assert.ok(entry.query, `${entry.id}: falta query`)
      assert.ok(['active', 'deferred'].includes(entry.status), `${entry.id}: status invalido`)
      if (entry.status === 'deferred') {
        assert.equal(typeof entry.blocker, 'string', `${entry.id}: diferida sin blocker`)
        assert.ok(entry.blocker.trim().length > 0, `${entry.id}: blocker vacio`)
      } else {
        assert.ok(entry.expected, `${entry.id}: activa sin expected`)
      }
    }

    assert.deepEqual(
      entries.filter((e) => e.status === 'deferred').map((e) => e.id).sort(),
      DEFERRED_ALLOWLIST,
      'el set de diferidas debe coincidir con el allowlist'
    )
    assert.deepEqual(
      entries.filter((e) => e.status === 'active').map((e) => e.id).sort(),
      ['M01', 'M07']
    )
  })

  it('M01 y M07 producen su expected contra la fixture congelada', () => {
    const fx = createFixture()
    try {
      for (const entry of loadFixture('golden.json').filter((e) => e.status === 'active')) {
        assertGoldenEntry(fx.engine, entry)
      }
    } finally {
      fx.cleanup()
    }
  })
})

describe('memory doctor estrictamente read-only (T11/T24)', () => {
  // T11 usa journal_mode=DELETE a proposito: en WAL, SQLite puede crear el
  // `-shm` al abrir read-only, y el assert "no aparecen -wal/-shm" seria
  // inalcanzable. Con DELETE no hay archivos laterales antes ni despues.
  it('T11 — no muta una fixture sin WAL activo y no crea -wal/-shm', () => {
    const fx = createFixture()
    try {
      fx.closeEngine()

      const raw = new DatabaseSync(fx.dbPath)
      try {
        raw.exec('PRAGMA journal_mode = DELETE')
      } finally {
        raw.close()
      }

      const wal = `${fx.dbPath}-wal`
      const shm = `${fx.dbPath}-shm`
      assert.equal(existsSync(wal), false, 'la fixture arranca sin -wal')
      assert.equal(existsSync(shm), false, 'la fixture arranca sin -shm')

      const before = hashFile(fx.dbPath)
      memoryDoctor(fx.dbPath)
      const after = hashFile(fx.dbPath)

      assert.equal(after, before, '.db debe quedar byte a byte identico')
      assert.equal(existsSync(wal), false, 'doctor no debe crear -wal')
      assert.equal(existsSync(shm), false, 'doctor no debe crear -shm')
    } finally {
      fx.cleanup()
    }
  })

  // T24 mantiene la conexion escritora abierta: hay frames en el `-wal` y `-shm`.
  // `-shm` no se compara byte a byte porque SQLite puede actualizar su read-mark;
  // se exige que no se trunque ni cambie de tamaño. Precedente:
  // aspec/specs/session-failure-report/spec.md y test/stats-failures.test.js.
  it('T24 — no muta .db ni -wal con WAL activo y no trunca el -shm', () => {
    const fx = createFixture()
    try {
      const wal = `${fx.dbPath}-wal`
      const shm = `${fx.dbPath}-shm`
      assert.ok(existsSync(wal), 'debe existir -wal con frames sin checkpoint')
      assert.ok(fileSize(wal) > 0, '-wal debe tener frames')
      assert.ok(existsSync(shm), 'debe existir -shm con el escritor abierto')

      const before = {
        db: hashFile(fx.dbPath),
        wal: hashFile(wal),
        walSize: fileSize(wal),
        shmSize: fileSize(shm)
      }
      const t24 = memoryDoctor(fx.dbPath)
      const after = {
        db: hashFile(fx.dbPath),
        wal: hashFile(wal),
        walSize: fileSize(wal),
        shmSize: fileSize(shm)
      }

      assert.equal(after.db, before.db, '.db debe quedar byte a byte identico')
      assert.equal(after.wal, before.wal, '-wal debe quedar byte a byte identico')
      assert.ok(after.walSize >= before.walSize, 'el -wal no debe achicarse')
      assert.equal(after.shmSize, before.shmSize, 'el -shm no debe truncarse')

      // G2: el omitido expone el estado observable sin ejecutar checkpoint.
      const walCheck = t24.checks.find((c) => c.name === 'Checkpoint WAL')
      assert.equal(walCheck.skipped, true)
      assert.match(walCheck.detail, /omitido: no verificable en modo read-only/)
      const observed = walCheck.detail.match(/-wal presente \((\d+) bytes\)/)
      assert.ok(observed, `el detail debe nombrar el -wal y su tamano (${walCheck.detail})`)
      assert.equal(Number(observed[1]), before.walSize, 'el tamano observado debe ser el del -wal real')
    } finally {
      fx.cleanup()
    }
  })

  // WAL frio: `-shm` y el `-wal` de 0 bytes los materializa el open read-only de SQLite,
  // no la logica de `doctor` (probe: Node 24.15.0 / SQLite 3.51.3).
  it('WAL frío — no muta db, tolera sidecars vacíos y es idempotente', () => {
    const fx = createFixture()
    try {
      const wal = `${fx.dbPath}-wal`
      const shm = `${fx.dbPath}-shm`

      // Las keys se capturan con el escritor abierto: leer una DB WAL fria
      // materializaria justamente los sidecars que la precondicion exige ausentes.
      const beforeKeys = fx.engine.exportActive().map((n) => n.memory_key).sort()

      const probe = new DatabaseSync(fx.dbPath, { readOnly: true })
      let journalMode
      try {
        journalMode = probe.prepare('PRAGMA journal_mode').get().journal_mode
      } finally {
        probe.close()
      }
      assert.equal(journalMode, 'wal', 'la fixture debe estar en modo WAL')

      fx.closeEngine()

      // Precondicion del scenario: WAL frio, cerrada limpia, sin sidecars.
      assert.equal(existsSync(wal), false, 'precondicion: la fixture debe estar sin -wal')
      assert.equal(existsSync(shm), false, 'precondicion: la fixture debe estar sin -shm')

      const dbBefore = hashFile(fx.dbPath)
      const first = memoryDoctor(fx.dbPath)
      const afterFirst = sidecarState(fx.dbPath)

      // Aserto 3: los sidecars materializados no son falla.
      assert.equal(first.healthy, true, 'la materializacion de sidecars no vuelve unhealthy')
      assert.deepEqual(
        first.checks.filter((c) => c.ok === false),
        [],
        'ningun check debe reportar ok === false'
      )

      // G2: el check omitido expone el estado observable del -wal.
      const walCheck = first.checks.find((c) => c.name === 'Checkpoint WAL')
      assert.equal(walCheck.skipped, true, 'el checkpoint sigue omitido en read-only')
      assert.match(walCheck.detail, /omitido: no verificable en modo read-only/)
      assert.match(walCheck.detail, /(-wal presente \(\d+ bytes\)|sin -wal)/, `detail debe observar el -wal (${walCheck.detail})`)

      // Aserto 5: si aparece un -wal, debe medir 0 bytes (si mide mas, hubo escritura).
      if (afterFirst.wal) {
        assert.equal(afterFirst.wal.size, 0, 'un -wal no vacio significaria escritura de datos')
      }

      const second = memoryDoctor(fx.dbPath)
      const afterSecond = sidecarState(fx.dbPath)

      // Aserto 1: el contenido de la base no cambia.
      assert.equal(hashFile(fx.dbPath), dbBefore, '.db debe quedar byte a byte identico')
      // Aserto 4: la segunda corrida no cambia `db` ni `-wal` byte a byte. Del
      // `-shm` solo se exige presencia y tamano estables: SQLite garantiza el
      // read-mark, no la byte-identidad del archivo entre maquinas.
      assert.equal(afterSecond.db.sha256, afterFirst.db.sha256, '.db debe quedar byte a byte identico')
      assert.equal(afterSecond.db.size, afterFirst.db.size, '.db debe conservar su tamano')
      assert.equal(afterSecond.wal?.sha256, afterFirst.wal?.sha256, '-wal debe quedar byte a byte identico')
      assert.equal(afterSecond.wal?.size, afterFirst.wal?.size, '-wal debe conservar su tamano')
      assert.equal(Boolean(afterSecond.shm), Boolean(afterFirst.shm), 'la presencia del -shm debe ser estable')
      assert.equal(afterSecond.shm?.size, afterFirst.shm?.size, 'el tamano del -shm debe ser estable')
      assert.equal(second.healthy, true, 'la segunda corrida sigue healthy')
      assert.deepEqual(second.checks.filter((c) => c.ok === false), [], 'la segunda corrida no reporta fallas')

      // Aserto 2: la base no gana ni pierde nodos.
      const afterEngine = createReadonlyMemoryEngine(fx.dbPath)
      let afterKeys
      try {
        afterKeys = afterEngine.exportActive().map((n) => n.memory_key).sort()
      } finally {
        afterEngine.close()
      }
      assert.deepEqual(afterKeys, beforeKeys, 'el conjunto de memory_key activas debe ser identico')
    } finally {
      fx.cleanup()
    }
  })

  // R1: FTS5 external-content creado con `columnsize=0` no materializa `memory_fts_docsize`;
  // caso legacy/de schema alternativo donde el conteo de alineacion no es ejecutable.
  it('R1 — sin tabla sombra docsize reporta Indice FTS5 omitido y sigue healthy', () => {
    const fx = createFixture()
    try {
      fx.closeEngine()
      const raw = new DatabaseSync(fx.dbPath)
      try {
        raw.exec('DROP TABLE memory_fts')
        raw.exec(`CREATE VIRTUAL TABLE memory_fts USING fts5(
          content,
          content = 'memory_nodes',
          content_rowid = 'rowid',
          columnsize = 0
        )`)
      } finally {
        raw.close()
      }

      const eng = createMemoryEngine(fx.dbPath)
      try {
        eng.recordNode({ memory_key: 'legacy-docsize-0', type: 'rule', scope: 'project', content: 'nodo legacy' })
      } finally {
        eng.close()
      }

      const probe = new DatabaseSync(fx.dbPath, { readOnly: true })
      try {
        assert.equal(
          probe.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'memory_fts_docsize'`).get().n,
          0,
          'este schema no debe tener memory_fts_docsize'
        )
      } finally {
        probe.close()
      }

      const result = memoryDoctor(fx.dbPath)
      const fts = result.checks.find((c) => c.name === 'Indice FTS5')
      assert.ok(fts, 'debe existir el check Indice FTS5')
      assert.equal(fts.ok, true, 'no poder verificar no es una falla')
      assert.equal(fts.skipped, true, 'el check debe reportarse omitido')
      assert.equal(result.healthy, true, 'el omitido no baja healthy')
      assert.match(fts.detail, /omitido: alineacion de FTS no verificable/)
      assert.match(fts.detail, /memory_fts_docsize/, 'el detail debe nombrar el motivo')
      assert.match(fts.detail, /integridad completa no verificable en read-only/)
    } finally {
      fx.cleanup()
    }
  })

  // F1: un esquema parcial/legacy sin `memory_fts` rompe la busqueda de verdad.
  // No es "no verificable": se reporta falla, nunca `skipped`, y baja `healthy`.
  it('F1 — sin memory_fts reporta Indice FTS5 como falla real', () => {
    const fx = createFixture()
    try {
      fx.closeEngine()
      const raw = new DatabaseSync(fx.dbPath)
      try {
        raw.exec('DROP TABLE memory_fts')
        assert.equal(
          raw.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'memory_fts'`).get().n,
          0,
          'la fixture no debe tener memory_fts'
        )
        assert.equal(
          raw.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE name = 'memory_nodes'`).get().n,
          1,
          'memory_nodes sigue existiendo: el esquema es parcial, no vacio'
        )
      } finally {
        raw.close()
      }

      const result = memoryDoctor(fx.dbPath)
      const fts = result.checks.find((c) => c.name === 'Indice FTS5')
      assert.ok(fts, 'debe existir el check Indice FTS5')
      assert.equal(fts.ok, false, 'sin indice la busqueda no funciona')
      assert.equal('skipped' in fts, false, 'la ausencia de FTS no puede reportarse omitida')
      assert.match(fts.detail, /indice FTS5 ausente/)
      assert.equal(result.healthy, false, 'la ausencia del indice vuelve unhealthy la base')
    } finally {
      fx.cleanup()
    }
  })

  // G1: en modo default el FTS se verifica por alineacion de filas (no mutante),
  // nunca se omite; el integrity-check completo queda para `--rebuild`.
  it('reporta Indice FTS5 alineado en modo read-only y no lo omite', () => {
    const fx = createFixture()
    try {
      fx.closeEngine()
      const result = memoryDoctor(fx.dbPath)
      const fts = result.checks.find((c) => c.name === 'Indice FTS5')
      assert.ok(fts, 'debe existir el check Indice FTS5')
      assert.equal('skipped' in fts, false, 'el check FTS no debe omitirse en default')
      assert.equal(fts.ok, true, 'un indice alineado no es una falla detectada')
      assert.match(fts.detail, /6 filas indexadas/, 'el detail debe nombrar las filas indexadas')
      assert.match(fts.detail, /6 nodos/, 'el detail debe nombrar la cantidad de nodos comparada')
      assert.match(fts.detail, /coincide con memory_nodes/, 'el detail debe nombrar la comparacion')
      assert.match(fts.detail, /read-only/i, 'el detail debe aclarar que la integridad completa no se verifica en read-only')
      assert.equal(result.healthy, true, 'un indice alineado no vuelve unhealthy')
      assert.equal(result.rebuilt, false, 'el modo default no reconstruye')
    } finally {
      fx.cleanup()
    }
  })
})

describe('snapshot consistente (T18)', () => {
  // Contrato verificado: snapshotDatabase(dbPath, outPath, opts?) hace una copia
  // consistente por VACUUM INTO sobre la fuente read-only (sin checkpoint ni
  // migracion), incluyendo historial y superseded_by.
  it('T18 — restaurar el snapshot reproduce keys activas, superseded_by y goldens', async () => {
    const fx = createFixture()
    try {
      fx.engine.recordNode({
        memory_key: 'snapshot-history',
        type: 'rule',
        scope: 'project',
        content: 'version uno',
        justification: 'historia para verificar superseded_by'
      })
      fx.engine.recordNode({
        memory_key: 'snapshot-history',
        type: 'rule',
        scope: 'project',
        content: 'version dos',
        justification: 'historia para verificar superseded_by'
      })

      const goldenSource = activeGoldenOutcomes(fx.engine)
      fx.closeEngine()
      const sourceState = readState(fx.dbPath)

      const mod = await import('../src/core/memory/snapshot.js')
      assert.equal(
        typeof mod.snapshotDatabase,
        'function',
        'snapshot.js debe exportar snapshotDatabase(dbPath, outPath)'
      )
      const snapshotPath = join(fx.dir, 'snapshot.db')
      mod.snapshotDatabase(fx.dbPath, snapshotPath)
      assert.ok(existsSync(snapshotPath), 'el snapshot debe existir')

      // Deriva la fuente despues del snapshot: restaurar debe volver al estado previo.
      const drift = createMemoryEngine(fx.dbPath)
      try {
        drift.recordNode({
          memory_key: 'test-runner-invocation',
          type: 'rule',
          scope: 'project',
          content: 'regla cambiada despues del snapshot'
        })
      } finally {
        drift.close()
      }

      const restoredPath = join(fx.dir, 'restaurada', 'memory.db')
      mkdirSync(dirname(restoredPath), { recursive: true })
      copyFileSync(snapshotPath, restoredPath)

      const restored = createMemoryEngine(restoredPath)
      try {
        assert.deepEqual(readState(restoredPath), sourceState, 'keys activas y superseded_by deben coincidir')
        assert.deepEqual(activeGoldenOutcomes(restored), goldenSource, 'los goldens ejecutables deben coincidir')
      } finally {
        restored.close()
      }
    } finally {
      fx.cleanup()
    }
  })

  // G3: el destino va parametrizado/escapado, asi un apostrofo en la ruta no
  // rompe el SQL ni permite inyeccion.
  it("G3 — snapshot a un destino con apostrofo produce una base valida", async () => {
    const fx = createFixture()
    try {
      fx.closeEngine()
      const { snapshotDatabase } = await import('../src/core/memory/snapshot.js')
      const out = join(fx.dir, "backup's.db")
      const result = snapshotDatabase(fx.dbPath, out)
      assert.equal(result.out, out)
      assert.ok(existsSync(out), 'el snapshot debe existir en la ruta con apostrofo')

      const db = new DatabaseSync(out, { readOnly: true })
      try {
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
        const keys = db.prepare(`SELECT memory_key FROM memory_nodes WHERE status = 'active' ORDER BY memory_key`)
          .all().map((r) => r.memory_key)
        assert.deepEqual(keys, FIXTURE_KEYS, 'el contenido debe ser el de la fuente')
      } finally {
        db.close()
      }
    } finally {
      fx.cleanup()
    }
  })
})
