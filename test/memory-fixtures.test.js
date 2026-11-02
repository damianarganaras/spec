import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createMemoryEngine, createReadonlyMemoryEngine, resolveNodeRefs, resolveProjectRoot } from '../src/core/memory/engine.js'
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
const DEFERRED_ALLOWLIST = ['M02', 'M03', 'M08', 'M09', 'M10']

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

function createFixture({ extraSeeds = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-memfix-'))
  const dbPath = join(dir, '.ancleto', 'memory.db')
  const engine = createMemoryEngine(dbPath)
  const summary = engine.importNodes(loadFixture('seed.json'))
  for (const name of extraSeeds) engine.importNodes(loadFixture(name))
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

function goldenOutcome(engine, entry, refsRoot) {
  const results = engine.searchMemory({ query: entry.query, limit: 10 })
  if (entry.expected.mode === 'topK') {
    return { id: entry.id, mode: 'topK', keys: results.slice(0, entry.expected.k).map((r) => r.memory_key) }
  }
  if (entry.expected.mode === 'abstain') {
    return { id: entry.id, mode: 'abstain', keys: results.map((r) => r.memory_key) }
  }
  if (entry.expected.mode === 'refs') {
    const top = results.slice(0, entry.expected.k)
    const node = top.find((r) => entry.expected.memory_keys.includes(r.memory_key))
    const refs = node ? resolveNodeRefs({ content: node.content, projectRoot: refsRoot }).refs : []
    return { id: entry.id, mode: 'refs', keys: top.map((r) => r.memory_key), refs }
  }
  throw new Error(`${entry.id}: modo expected desconocido "${entry.expected.mode}"`)
}

function activeGoldenOutcomes(engine, entries = loadFixture('golden.json')) {
  return entries.filter((e) => e.status === 'active').map((e) => goldenOutcome(engine, e))
}

function assertGoldenEntry(engine, entry, refsRoot) {
  const outcome = goldenOutcome(engine, entry, refsRoot)
  if (outcome.mode === 'topK') {
    for (const key of entry.expected.memory_keys) {
      assert.ok(
        outcome.keys.includes(key),
        `${entry.id}: "${key}" no aparece en el top-${entry.expected.k} (${outcome.keys.join(', ') || 'vacio'})`
      )
    }
    return
  }
  if (outcome.mode === 'refs') {
    for (const key of entry.expected.memory_keys) {
      assert.ok(
        outcome.keys.includes(key),
        `${entry.id}: "${key}" no aparece en el top-${entry.expected.k} (${outcome.keys.join(', ') || 'vacio'})`
      )
    }
    entry.expected.refs.forEach((expectedRef, index) => {
      const resolved = outcome.refs[index]
      assert.ok(
        resolved,
        `${entry.id}: falta la ref resuelta ${index} (${outcome.refs.length} refs: ${JSON.stringify(outcome.refs)})`
      )
      assert.equal(resolved.kind, expectedRef.kind, `${entry.id}: kind de la ref ${index}`)
      if (expectedRef.path !== undefined) {
        assert.equal(resolved.path, expectedRef.path, `${entry.id}: path de la ref ${index}`)
      }
      if (expectedRef.heading !== undefined) {
        assert.equal(resolved.heading, expectedRef.heading, `${entry.id}: heading de la ref ${index}`)
      }
      if (expectedRef.reason !== undefined) {
        assert.equal(resolved.reason, expectedRef.reason, `${entry.id}: reason de la ref ${index}`)
        assert.equal('path' in resolved, false, `${entry.id}: la ref ${index} no debe resolver path al rechazar`)
        assert.equal('heading' in resolved, false, `${entry.id}: la ref ${index} no debe resolver heading al rechazar`)
      }
    })
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
  it('declara diez ids, cinco activas y el set diferido del allowlist', () => {
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
      ['M01', 'M04', 'M05', 'M06', 'M07']
    )
  })

  it('M01 y M07 producen su expected contra la fixture congelada', () => {
    const fx = createFixture()
    try {
      for (const entry of loadFixture('golden.json').filter((e) => ['M01', 'M07'].includes(e.id))) {
        assertGoldenEntry(fx.engine, entry)
      }
    } finally {
      fx.cleanup()
    }
  })

  it('M04, M05 y M06 exponen la ubicación de sus refs contra refs-root', () => {
    const fx = createFixture({ extraSeeds: ['golden-refs-seed.json'] })
    try {
      const refsRoot = fileURLToPath(new URL('./fixtures/memory/refs-root/', import.meta.url))
      // M01 y M07 se reevaluan con el seed de refs presente: el seed no altera su ranking.
      const ids = ['M01', 'M04', 'M05', 'M06', 'M07']
      for (const entry of loadFixture('golden.json').filter((e) => ids.includes(e.id))) {
        assertGoldenEntry(fx.engine, entry, refsRoot)
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

// MEM-04: `memoryDoctor` deriva la raiz del proyecto desde la ubicacion de la DB,
// NUNCA desde `process.cwd()`. Por eso cada fixture es un repo temporal con la DB
// en `<dir>/.ancleto/memory.db`, `.ancletorc` explicito y los `aspec/` que el check
// necesita. Los nodos se siembran con `importNodes` (semantica LWW del import, sin
// validar refs), lo que permite sembrar refs rotas a proposito sin tocar el repo.
function refsContent(refs) {
  return `prosa de prueba\n\nrefs:\n${refs.map((r) => `  - ${r}`).join('\n')}`
}

// Enmienda B: items de lista sin indentacion, equivalentes a los indentados.
function flatRefsContent(refs) {
  return `prosa de prueba\n\nrefs:\n${refs.map((r) => `- ${r}`).join('\n')}`
}

function repoNode(memory_key, content, createdAt = '2026-01-01T00:00:00.000Z') {
  return { memory_key, type: 'rule', scope: 'project', content, justification: 'fixture MEM-04', createdAt }
}

function createRefsFixture(seed = []) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-memrefs-'))
  mkdirSync(join(dir, '.ancleto'), { recursive: true })
  writeFileSync(join(dir, '.ancletorc'), '{}\n')
  const dbPath = join(dir, '.ancleto', 'memory.db')
  const engine = createMemoryEngine(dbPath)
  if (seed.length > 0) engine.importNodes(seed)
  engine.close()
  return {
    dir,
    dbPath,
    cleanup() {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  }
}

function archiveDir(dir, name) {
  const path = join(dir, 'aspec', 'changes', 'archive', name)
  mkdirSync(path, { recursive: true })
  return path
}

function refsCheck(result) {
  const check = result.checks.find((c) => c.name === 'Refs de nodos activos')
  assert.ok(
    check,
    `debe existir el check "Refs de nodos activos"; checks: ${result.checks.map((c) => c.name).join(', ')}`
  )
  return check
}

describe('memory doctor — refs de nodos activos (MEM-04)', () => {
  it('1.1 (T09) — un unico archive con change:<slug> resuelve sin rotas', () => {
    const fx = createRefsFixture([repoNode('change-resuelve', refsContent(['change:demo-slug']))])
    try {
      archiveDir(fx.dir, '2025-01-01-demo-slug')

      const result = memoryDoctor(fx.dbPath)
      assert.deepEqual(
        result.checks.map((c) => c.name),
        ['Integridad DB', 'Indice FTS5', 'Reglas activas (unicidad)', 'Refs de nodos activos', 'Checkpoint WAL'],
        'el reporte incluye el check de refs en el orden especificado'
      )

      const check = refsCheck(result)
      assert.equal(check.ok, true, check.detail)
      assert.equal(check.skipped, undefined, 'sin root faltante el check no se omite')
      assert.match(check.detail, /0 no resuelven/, check.detail)
      assert.equal(result.healthy, true, 'una ref que resuelve no vuelve unhealthy la base')
    } finally {
      fx.cleanup()
    }
  })

  it('1.2 (T09) — dos archives con el mismo slug se reportan ambiguos sin elegir', () => {
    const fx = createRefsFixture([repoNode('change-ambiguo', refsContent(['change:demo-slug']))])
    try {
      archiveDir(fx.dir, '2025-01-01-demo-slug')
      archiveDir(fx.dir, '2025-02-02-demo-slug')

      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false, 'la ambiguedad es falla detectable')
      assert.equal(result.healthy, false, 'healthy baja con una ref ambigua')
      assert.ok(check.detail.includes('change-ambiguo'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.ok(check.detail.includes('change:demo-slug'), `detail debe nombrar la ref textual (${check.detail})`)
      assert.match(check.detail, /ambiguo \(2 coincidencias\)/, check.detail)
      assert.equal(result.checks.length, 5, 'doctor completa el reporte sin abortar')
    } finally {
      fx.cleanup()
    }
  })

  it('1.3 (T29) — headings que canonicalizan igual se reportan ambiguos sin elegir', () => {
    const fx = createRefsFixture([repoNode('spec-ambiguo', refsContent(['spec:memory-ops#Memoria Persistente']))])
    try {
      const specDir = join(fx.dir, 'aspec', 'specs', 'memory-ops')
      mkdirSync(specDir, { recursive: true })
      writeFileSync(
        join(specDir, 'spec.md'),
        ['### Requirement: Memoria Persistente', '', 'Texto.', '', '### Requirement: memoria persistente', ''].join('\n')
      )

      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false)
      assert.equal(result.healthy, false)
      assert.ok(check.detail.includes('spec-ambiguo'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.ok(
        check.detail.includes('spec:memory-ops#Memoria Persistente'),
        `detail debe nombrar la ref textual (${check.detail})`
      )
      assert.match(check.detail, /ambiguo \(2 coincidencias\)/, check.detail)
    } finally {
      fx.cleanup()
    }
  })

  it('1.4 — motivo inexistente para spec sin archivo, heading sin match, change y path', () => {
    const fx = createRefsFixture([
      repoNode('spec-sin-archivo', refsContent(['spec:ghost-capability#Un heading'])),
      repoNode('spec-sin-heading', refsContent(['spec:memory-ops#Heading Inexistente'])),
      repoNode('change-ghost', refsContent(['change:ghost-change'])),
      repoNode('path-ghost', refsContent(['path:src/missing.js']))
    ])
    try {
      const specDir = join(fx.dir, 'aspec', 'specs', 'memory-ops')
      mkdirSync(specDir, { recursive: true })
      writeFileSync(join(specDir, 'spec.md'), '### Requirement: Heading Existente\n\nTexto.\n')

      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false)
      assert.equal(result.healthy, false)
      for (const [key, raw] of [
        ['spec-sin-archivo', 'spec:ghost-capability#Un heading'],
        ['spec-sin-heading', 'spec:memory-ops#Heading Inexistente'],
        ['change-ghost', 'change:ghost-change'],
        ['path-ghost', 'path:src/missing.js']
      ]) {
        assert.ok(check.detail.includes(key), `detail debe nombrar ${key} (${check.detail})`)
        assert.ok(check.detail.includes(raw), `detail debe nombrar la ref ${raw} (${check.detail})`)
      }
      assert.match(check.detail, /inexistente/, check.detail)
      assert.match(check.detail, /4 refs no resuelven/, check.detail)
    } finally {
      fx.cleanup()
    }
  })

  it('1.5 — path absoluto se reporta invalido', () => {
    const fx = createRefsFixture([repoNode('path-abs', refsContent(['path:/etc/passwd']))])
    try {
      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false)
      assert.ok(check.detail.includes('path-abs'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.ok(check.detail.includes('path:/etc/passwd'), `detail debe nombrar la ref textual (${check.detail})`)
      assert.match(check.detail, /inválido/, check.detail)
      assert.match(check.detail, /absoluto/, `el motivo distingue el path absoluto (${check.detail})`)
    } finally {
      fx.cleanup()
    }
  })

  it('1.5 — path con ../ se reporta invalido', () => {
    const fx = createRefsFixture([repoNode('path-dotdot', refsContent(['path:../escape.txt']))])
    try {
      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false)
      assert.ok(check.detail.includes('path-dotdot'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.ok(check.detail.includes('path:../escape.txt'), `detail debe nombrar la ref textual (${check.detail})`)
      assert.match(check.detail, /inválido/, check.detail)
      assert.doesNotMatch(check.detail, /absoluto/, `el motivo distingue ../ del path absoluto (${check.detail})`)
    } finally {
      fx.cleanup()
    }
  })

  it('1.5 — linea fuera de gramatica se reporta invalida', () => {
    const fx = createRefsFixture([repoNode('ref-malformada', 'prosa de prueba\n\nrefs:\n  - not-a-ref')])
    try {
      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false)
      assert.ok(check.detail.includes('ref-malformada'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.ok(check.detail.includes('not-a-ref'), `detail debe nombrar la linea ofensora (${check.detail})`)
      assert.match(check.detail, /inválido \(gramática\)/, check.detail)
    } finally {
      fx.cleanup()
    }
  })

  it('1.5 — nodo con mas de un bloque refs: se reporta invalido', () => {
    const fx = createRefsFixture([
      repoNode('refs-doble-bloque', 'prosa\n\nrefs:\n  - change:demo-slug\n\nrefs:\n  - change:otro-slug')
    ])
    try {
      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false)
      assert.ok(check.detail.includes('refs-doble-bloque'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.match(check.detail, /inválido \(gramática\)/, check.detail)
    } finally {
      fx.cleanup()
    }
  })

  it('1.6 — commit: y workitem: no son rotas y se cuentan aparte', () => {
    const fx = createRefsFixture([repoNode('solo-vcs', refsContent(['commit:abcdef1', 'workitem:ado:1234']))])
    try {
      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, true, check.detail)
      assert.equal(result.healthy, true)
      assert.match(check.detail, /0 no resuelven/, check.detail)
      assert.match(check.detail, /no verificables/, `detail cuenta aparte las no verificables (${check.detail})`)
      assert.match(
        check.detail,
        /(?:2[^;]*no verificables|no verificables[^;]*2)/,
        `detail debe reportar 2 no verificables (${check.detail})`
      )
      assert.equal(check.detail.includes('commit:abcdef1'), false, 'commit: no aparece como rota')
      assert.equal(check.detail.includes('workitem:ado:1234'), false, 'workitem: no aparece como rota')
    } finally {
      fx.cleanup()
    }
  })

  it('1.7 — change:<YYYY-MM-DD-slug> no resuelve y change:<slug> si resuelve', () => {
    const fx = createRefsFixture([
      repoNode('change-con-fecha', refsContent(['change:2025-01-01-demo-slug'])),
      repoNode('change-slug', refsContent(['change:demo-slug']))
    ])
    try {
      archiveDir(fx.dir, '2025-01-01-demo-slug')

      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false)
      assert.ok(check.detail.includes('change-con-fecha'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.ok(
        check.detail.includes('change:2025-01-01-demo-slug'),
        `detail debe nombrar la ref con fecha (${check.detail})`
      )
      assert.match(check.detail, /inexistente/, check.detail)
      assert.equal(check.detail.includes('change-slug'), false, 'change:<slug> resuelve y no se reporta')
      assert.match(check.detail, /1 refs no resuelven/, check.detail)
    } finally {
      fx.cleanup()
    }
  })

  it('1.8 — DB vacia con esquema reporta 0 refs verificadas sin skipped', () => {
    const fx = createRefsFixture()
    try {
      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, true, check.detail)
      assert.equal('skipped' in check, false, 'una base vacia nunca se reporta omitteda')
      assert.match(check.detail, /0 refs verificadas/, check.detail)
      assert.equal(result.healthy, true)
    } finally {
      fx.cleanup()
    }
  })

  it('1.9 — nodos activos sin refs reportan 0 refs y el conteo de revisados', () => {
    const fx = createRefsFixture([
      repoNode('sin-refs', 'prosa sin bloque de referencias'),
      repoNode('refs-vacio', 'prosa\n\nrefs:\n')
    ])
    try {
      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, true, check.detail)
      assert.equal('skipped' in check, false)
      assert.match(check.detail, /0 refs verificadas/, check.detail)
      assert.match(check.detail, /0 no resuelven/, check.detail)
      assert.match(check.detail, /2 nodos activos/, `detail debe nombrar los nodos revisados (${check.detail})`)
      assert.equal(result.healthy, true)
    } finally {
      fx.cleanup()
    }
  })

  it('1.10 — raiz no resoluble: con refs omite el check; con 0 refs no lo omite', (t) => {
    const base = mkdtempSync(join(tmpdir(), 'ancleto-memroot-'))
    try {
      const withRefs = join(base, 'con-refs', 'memory.db')
      const noRefs = join(base, 'sin-refs', 'memory.db')

      const a = createMemoryEngine(withRefs)
      try {
        a.importNodes([repoNode('root-no-resoluble', refsContent(['change:ghost-change']))])
      } finally {
        a.close()
      }
      const b = createMemoryEngine(noRefs)
      try {
        b.importNodes([repoNode('root-sin-refs', 'prosa sin refs')])
      } finally {
        b.close()
      }

      // Precondicion: en este arbol la ascendencia del tmpdir no declara `.ancletorc`.
      // Si el entorno lo hiciera no determinable, se documenta y se omite en vez de
      // asumir que la raiz no se puede derivar.
      if (resolveProjectRoot(undefined, withRefs) !== null || resolveProjectRoot(undefined, noRefs) !== null) {
        t.skip('entorno: la ascendencia del tmpdir contiene .ancletorc; "raiz no resoluble" no es determinable')
        return
      }

      const omitted = memoryDoctor(withRefs)
      const omittedCheck = refsCheck(omitted)
      assert.equal(omittedCheck.ok, true, 'la omision no es falla')
      assert.equal(omittedCheck.skipped, true, 'con refs y sin raiz el check se omite')
      assert.match(omittedCheck.detail, /raíz|raiz|proyecto|root/i, `detail debe nombrar el motivo (${omittedCheck.detail})`)
      assert.equal(omitted.healthy, true, 'la omision no baja healthy')
      assert.equal(omitted.checks.filter((c) => c.ok === false).length, 0)

      const kept = memoryDoctor(noRefs)
      const keptCheck = refsCheck(kept)
      assert.equal(keptCheck.ok, true)
      assert.equal('skipped' in keptCheck, false, 'sin refs el check no requiere raiz ni se omite')
      assert.match(keptCheck.detail, /0 refs verificadas/, keptCheck.detail)
    } finally {
      rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })

  // Guarda (Fase 7): la omision por raiz no derivable aplica solo si NO hay un
  // defecto detectable sin raiz. Un bloque `refs:` malformado se detecta sin la
  // raiz y debe reportarse como falla, nunca como check omitido.
  it('7.1 — raiz no derivable con bloque refs malformado no omite el check', (t) => {
    const base = mkdtempSync(join(tmpdir(), 'ancleto-memroot-bad-'))
    try {
      const dbPath = join(base, 'con-refs', 'memory.db')
      const eng = createMemoryEngine(dbPath)
      try {
        eng.importNodes([
          // Ref valida: fuerza `verifiable > 0` para que la unica razon de no
          // omitir el check sea el defecto detectable sin raiz.
          repoNode('root-ref-valida', refsContent(['change:demo-slug'])),
          // Bloque malformado: una linea no-item dentro del bloque.
          repoNode('root-bloque-malformado', 'prosa de prueba\n\nrefs:\n  - change:demo-slug\n  linea que no es item')
        ])
      } finally {
        eng.close()
      }

      // Precondicion identica a 1.10: la ascendencia del tmpdir no declara `.ancletorc`.
      if (resolveProjectRoot(undefined, dbPath) !== null) {
        t.skip('entorno: la ascendencia del tmpdir contiene .ancletorc; "raiz no derivable" no es determinable')
        return
      }

      const result = memoryDoctor(dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, false, 'un defecto detectable sin raiz es falla')
      assert.equal('skipped' in check, false, 'no se omite cuando hay un defecto detectable sin raiz')
      assert.ok(
        check.detail.includes('root-bloque-malformado'),
        `detail debe nombrar la memory_key (${check.detail})`
      )
      assert.match(check.detail, /inválido \(gramática\)/, check.detail)
      assert.equal(result.healthy, false, 'la falla detectada baja healthy')
      assert.equal(result.checks.length, 5, 'el reporte conserva los cinco checks')
    } finally {
      rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })

  it('1.11 — esquema no inicializado reporta los cinco checks y refs no verificable', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-memearly-'))
    try {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      // Base valida sin `memory_nodes`: abre read-only y toma el path temprano.
      const raw = new DatabaseSync(dbPath)
      raw.close()

      const result = memoryDoctor(dbPath)
      assert.equal(result.checks.length, 5, 'el path temprano conserva los cinco checks')
      assert.equal(result.checks.filter((c) => c.ok === false).length, 5)
      assert.equal(result.checks[3].name, 'Refs de nodos activos')
      assert.equal(result.checks[4].name, 'Checkpoint WAL')
      const check = refsCheck(result)
      assert.equal(check.detail, 'no verificable: esquema no inicializado')
      assert.equal(result.healthy, false)
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })

  it('1.12 — doctor con refs rotas no muta bytes en journal_mode=DELETE', () => {
    const fx = createRefsFixture([repoNode('rota-delete', refsContent(['change:ghost-change']))])
    try {
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
      const first = memoryDoctor(fx.dbPath)
      const firstCheck = refsCheck(first)
      assert.equal(firstCheck.ok, false, 'la fixture debe tener una ref rota real')
      assert.equal(hashFile(fx.dbPath), before, '.db byte-identico tras la primera corrida')
      assert.equal(existsSync(wal), false, 'DELETE no materializa -wal')
      assert.equal(existsSync(shm), false, 'DELETE no materializa -shm')

      memoryDoctor(fx.dbPath)
      assert.equal(hashFile(fx.dbPath), before, '.db byte-identico tras la segunda corrida (idempotente)')
      assert.equal(existsSync(wal), false)
      assert.equal(existsSync(shm), false)
    } finally {
      fx.cleanup()
    }
  })

  it('1.12 — doctor con refs rotas no muta .db ni -wal con WAL activo e idempotente', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-memrefs-wal-'))
    try {
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      writeFileSync(join(dir, '.ancletorc'), '{}\n')
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const eng = createMemoryEngine(dbPath)
      try {
        eng.importNodes([repoNode('rota-wal', refsContent(['change:ghost-change']))])

        const wal = `${dbPath}-wal`
        const shm = `${dbPath}-shm`
        assert.ok(existsSync(wal), 'el escritor abierto mantiene -wal')
        assert.ok(fileSize(wal) > 0, '-wal debe tener frames')
        assert.ok(existsSync(shm), 'debe existir -shm')

        const before = { db: hashFile(dbPath), wal: hashFile(wal), walSize: fileSize(wal), shmSize: fileSize(shm) }
        const first = memoryDoctor(dbPath)
        const firstCheck = refsCheck(first)
        assert.equal(firstCheck.ok, false, 'la ref rota se detecta en WAL')
        const afterFirst = { db: hashFile(dbPath), wal: hashFile(wal), walSize: fileSize(wal), shmSize: fileSize(shm) }

        assert.equal(afterFirst.db, before.db, '.db byte-identico tras la primera corrida')
        assert.equal(afterFirst.wal, before.wal, '-wal byte-identico tras la primera corrida')
        assert.ok(afterFirst.walSize >= before.walSize, 'el -wal no se achica')
        assert.equal(afterFirst.shmSize, before.shmSize, 'el -shm no se trunca')

        memoryDoctor(dbPath)
        const afterSecond = { db: hashFile(dbPath), wal: hashFile(wal), walSize: fileSize(wal), shmSize: fileSize(shm) }
        assert.equal(afterSecond.db, afterFirst.db, 'segunda corrida: .db byte-identico')
        assert.equal(afterSecond.wal, afterFirst.wal, 'segunda corrida: -wal byte-identico')
        assert.ok(afterSecond.walSize >= afterFirst.walSize, 'segunda corrida: el -wal no se achica')
        assert.equal(afterSecond.shmSize, afterFirst.shmSize, 'segunda corrida: el -shm no se trunca')
      } finally {
        eng.close()
      }
    } finally {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })

  // Guarda (Fase 7): `--rebuild` reconstruye FTS aunque haya una ref rota; la falla
  // se reporta en el quinto check y no impide `rebuilt: true`.
  it('7.2 — --rebuild con una ref rota conserva los cinco checks, reporta ok:false y rebuilt:true', () => {
    const fx = createRefsFixture([repoNode('rota-rebuild', refsContent(['change:ghost-rebuild']))])
    try {
      const result = memoryDoctor(fx.dbPath, { rebuild: true })

      assert.equal(result.rebuilt, true, '--rebuild reconstruye el indice')
      assert.deepEqual(
        result.checks.map((c) => c.name),
        ['Integridad DB', 'Indice FTS5', 'Reglas activas (unicidad)', 'Refs de nodos activos', 'Checkpoint WAL'],
        'el reporte mantiene los cinco checks en orden'
      )
      const check = refsCheck(result)
      assert.equal(check.ok, false, 'la ref rota se detecta tambien con --rebuild')
      assert.equal('skipped' in check, false, 'con raiz derivable el check no se omite')
      assert.ok(check.detail.includes('rota-rebuild'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.ok(
        check.detail.includes('change:ghost-rebuild'),
        `detail debe nombrar la ref textual (${check.detail})`
      )
      assert.match(check.detail, /inexistente/, check.detail)
      assert.equal(result.healthy, false, 'la ref rota baja healthy')
    } finally {
      fx.cleanup()
    }
  })

  // Guardas de pulido: pinchan comportamiento ya implementado. Cada una declara
  // la mutacion concreta que la haria fallar.

  // Guarda G1: el universo del check son los nodos activos. Un nodo superseded
  // con una ref rota no se verifica ni se cuenta.
  // Mutacion: quitar `WHERE status = 'active'` o cambiarlo por `status <> 'deleted'`.
  it('G1 - un nodo superseded con ref rota no se reporta y M cuenta solo activos', () => {
    const fx = createRefsFixture([
      repoNode('ghost-superseded', refsContent(['change:ghost-superseded']), '2026-01-01T00:00:00.000Z'),
      repoNode('ghost-superseded', 'prosa activa sin refs', '2026-02-01T00:00:00.000Z'),
      repoNode('active-ok', refsContent(['change:demo-slug']), '2026-01-15T00:00:00.000Z')
    ])
    try {
      archiveDir(fx.dir, '2025-01-01-demo-slug')

      const result = memoryDoctor(fx.dbPath)
      const check = refsCheck(result)

      assert.equal(check.ok, true, `el superseded no aporta rotas (${check.detail})`)
      assert.equal(check.detail.includes('change:ghost-superseded'), false, 'la ref del superseded no se reporta')
      assert.match(check.detail, /1 refs verificadas/, check.detail)
      assert.match(check.detail, /2 nodos activos/, `M cuenta solo activos (${check.detail})`)
      assert.match(check.detail, /0 no resuelven/, check.detail)
      assert.equal(result.healthy, true)
    } finally {
      fx.cleanup()
    }
  })

  // Guarda G2: todas las refs rotas del mismo nodo se listan, no solo la primera.
  // Mutacion: `break` tras el primer `unresolved.push`.
  it('G2 - dos refs rotas en el mismo nodo aparecen las dos en el detail', () => {
    const fx = createRefsFixture([
      repoNode('dos-rotas', refsContent(['change:ghost-uno', 'change:ghost-dos']))
    ])
    try {
      const check = refsCheck(memoryDoctor(fx.dbPath))

      assert.equal(check.ok, false, 'las dos refs rotas son falla')
      assert.ok(check.detail.includes('change:ghost-uno'), `detail debe nombrar la primera (${check.detail})`)
      assert.ok(check.detail.includes('change:ghost-dos'), `detail debe nombrar la segunda (${check.detail})`)
      assert.match(check.detail, /2 refs no resuelven/, check.detail)
    } finally {
      fx.cleanup()
    }
  })

  // Guarda G3: un directorio existente no es un archivo, asi que `path:` no resuelve.
  // Mutacion: reducir la guarda a `!existsSync(full)` (perder `isFile()`).
  it('G3 - path: que apunta a un directorio se reporta inexistente', () => {
    const fx = createRefsFixture([repoNode('path-directorio', refsContent(['path:docs']))])
    try {
      mkdirSync(join(fx.dir, 'docs'), { recursive: true })

      const check = refsCheck(memoryDoctor(fx.dbPath))

      assert.equal(check.ok, false, 'un directorio no es un archivo')
      assert.ok(check.detail.includes('path-directorio'), `detail debe nombrar la memory_key (${check.detail})`)
      assert.ok(check.detail.includes('path:docs'), `detail debe nombrar la ref textual (${check.detail})`)
      assert.match(check.detail, /inexistente/, check.detail)
    } finally {
      fx.cleanup()
    }
  })

  // Guarda G4: con raiz no derivable, `--rebuild` igual reconstruye FTS y reporta
  // el check de refs omitido; la omision no recorta el resto del reporte.
  // Mutacion: cortar temprano con `refs.needsRoot`, o no setear `rebuilt`.
  it('G4 - --rebuild con raiz no derivable reconstruye FTS y omite refs sin recortar checks', (t) => {
    const base = mkdtempSync(join(tmpdir(), 'ancleto-memroot-rebuild-'))
    try {
      const dbPath = join(base, 'con-refs', 'memory.db')
      const eng = createMemoryEngine(dbPath)
      try {
        eng.importNodes([repoNode('root-rebuild-ref', refsContent(['change:ghost-change']))])
      } finally {
        eng.close()
      }

      // Precondicion identica a 1.10: la ascendencia del tmpdir no declara `.ancletorc`.
      if (resolveProjectRoot(undefined, dbPath) !== null) {
        t.skip('entorno: la ascendencia del tmpdir contiene .ancletorc; "raiz no derivable" no es determinable')
        return
      }

      const result = memoryDoctor(dbPath, { rebuild: true })

      assert.equal(result.rebuilt, true, '--rebuild reconstruye aunque la raiz no se derive')
      assert.deepEqual(
        result.checks.map((c) => c.name),
        ['Integridad DB', 'Indice FTS5', 'Reglas activas (unicidad)', 'Refs de nodos activos', 'Checkpoint WAL'],
        'la omision por needsRoot no debe recortar el reporte'
      )
      const fts = result.checks.find((c) => c.name === 'Indice FTS5')
      assert.equal(fts.ok, true, fts.detail)
      const check = refsCheck(result)
      assert.equal(check.ok, true, 'la omision no es falla')
      assert.equal(check.skipped, true, 'sin raiz y con refs el check se omite')
      assert.match(check.detail, /omitido/, check.detail)
    } finally {
      rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  })

  // Guarda G5: el heading canoniza por diacriticos, no por acentos exactos.
  // Mutacion: borrar el `normalize('NFD').replace(/[\u0300-\u036f]/g,'')` de
  // `canonicalHeading`.
  it('G5 - un spec cuyo heading difiere solo en acentos resuelve', () => {
    const fx = createRefsFixture([
      repoNode('spec-diacritico', refsContent(['spec:memory-ops#Validacion de refs']))
    ])
    try {
      const specDir = join(fx.dir, 'aspec', 'specs', 'memory-ops')
      mkdirSync(specDir, { recursive: true })
      writeFileSync(join(specDir, 'spec.md'), '### Requirement: Validación de refs\n\nTexto.\n')

      const check = refsCheck(memoryDoctor(fx.dbPath))

      assert.equal(check.ok, true, `el heading canoniza por diacriticos (${check.detail})`)
      assert.equal(check.detail.includes('spec-diacritico'), false, 'la ref resuelta no se reporta')
      assert.match(check.detail, /1 refs verificadas/, check.detail)
      assert.match(check.detail, /0 no resuelven/, check.detail)
    } finally {
      fx.cleanup()
    }
  })

  // Guarda G7: el detail es determinista y ordena por memory_key, no por rowid.
  // Mutacion: quitar el `ORDER BY memory_key` de la query de nodos activos.
  it('G7 - dos nodos con refs rotas se ordenan por memory_key y el detail es estable', () => {
    const fx = createRefsFixture([
      repoNode('zeta-broken', refsContent(['change:ghost-zeta'])),
      repoNode('alpha-broken', refsContent(['change:ghost-alpha']))
    ])
    try {
      const first = refsCheck(memoryDoctor(fx.dbPath))
      const second = refsCheck(memoryDoctor(fx.dbPath))

      assert.equal(first.ok, false, 'las dos refs son falla')
      assert.match(first.detail, /2 refs no resuelven/, first.detail)
      assert.ok(
        first.detail.indexOf('alpha-broken') < first.detail.indexOf('zeta-broken'),
        `el detail debe ordenar por memory_key (${first.detail})`
      )
      assert.equal(first.detail, second.detail, 'dos corridas consecutivas producen el mismo detail')
    } finally {
      fx.cleanup()
    }
  })

  // Enmienda B: el doctor comparte el parser, asi que un bloque sin indentar debe
  // contar y reportarse igual que uno indentado.

  it('6.6 (Enmienda B) — refs sin indentar cuentan como verificadas igual que las indentadas', () => {
    const refs = ['change:demo-slug', 'path:docs/note.md']
    const flat = createRefsFixture([repoNode('refs-flat', flatRefsContent(refs))])
    const indented = createRefsFixture([repoNode('refs-flat', refsContent(refs))])
    try {
      for (const fx of [flat, indented]) {
        archiveDir(fx.dir, '2025-01-01-demo-slug')
        mkdirSync(join(fx.dir, 'docs'), { recursive: true })
        writeFileSync(join(fx.dir, 'docs', 'note.md'), '// fixture\n')
      }

      const flatCheck = refsCheck(memoryDoctor(flat.dbPath))
      const indentedCheck = refsCheck(memoryDoctor(indented.dbPath))

      assert.equal(flatCheck.ok, true, flatCheck.detail)
      assert.match(flatCheck.detail, /2 refs verificadas/, `el bloque sin indentar aporta sus 2 refs (${flatCheck.detail})`)
      assert.match(flatCheck.detail, /0 no resuelven/, flatCheck.detail)
      assert.equal(flatCheck.detail, indentedCheck.detail, 'el detail es identico al de un bloque indentado')
    } finally {
      flat.cleanup()
      indented.cleanup()
    }
  })

  it('6.7 (Enmienda B) — una ref rota sin indentar se reporta igual que una indentada', () => {
    const flat = createRefsFixture([repoNode('refs-flat-rota', flatRefsContent(['change:ghost-flat']))])
    const indented = createRefsFixture([repoNode('refs-flat-rota', refsContent(['change:ghost-flat']))])
    try {
      const flatCheck = refsCheck(memoryDoctor(flat.dbPath))
      const indentedCheck = refsCheck(memoryDoctor(indented.dbPath))

      assert.equal(flatCheck.ok, false, 'la ref rota sin indentar es falla detectable')
      assert.ok(flatCheck.detail.includes('refs-flat-rota'), `detail debe nombrar la memory_key (${flatCheck.detail})`)
      assert.ok(flatCheck.detail.includes('change:ghost-flat'), `detail debe nombrar la ref textual (${flatCheck.detail})`)
      assert.match(flatCheck.detail, /inexistente/, flatCheck.detail)
      assert.equal(flatCheck.detail, indentedCheck.detail, 'el detail es identico al de un bloque indentado')
    } finally {
      flat.cleanup()
      indented.cleanup()
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
