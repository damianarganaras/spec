import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { createMemoryEngine, createReadonlyMemoryEngine } from '../src/core/memory/engine.js'

// memory-repair-refs — contrato de `ancleto memory repair refs` (S1-S14).
// Todo se congela en un tmpdir propio: nunca se lee ni se escribe la
// `.ancleto/memory.db` viva del repo ni su working-context. Los nodos se siembran
// con `importNodes` (no valida refs) para poder declarar refs rotas a proposito.
// S1 ref inexistente removida · S2 ambiguo no removible · S3 commit/workitem
// S4 dry-run read-only · S5 supersede + FTS · S6 cardinalidad · S7 gramatica
// S8 cero refs · S9 gate critico · S10 no-op · S11 rollback · S12 schema
// S13 plan no aplicable · S14 refresh del working-context.
// La raiz no derivable no llega al plan: el comando rechaza antes con exit 1.

const CLI_PATH = fileURLToPath(new URL('../src/cli/index.js', import.meta.url))

function hashFile(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

// `content` canonico del fixture: prosa, linea en blanco y bloque `refs:`. Sin salto
// final, de modo que comparar un string exacto prueba la identidad byte a byte.
function refsContent(prose, refs) {
  return `${prose}\n\nrefs:\n${refs.map((ref) => `  - ${ref}`).join('\n')}`
}

function memoryNode(memory_key, content, { type = 'rule', scope = 'project', justification = 'fixture repair refs', createdAt = '2026-01-01T00:00:00.000Z' } = {}) {
  return { memory_key, type, scope, content, justification, createdAt }
}

function createFixture({ rc = {}, seed = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-repair-refs-'))
  mkdirSync(join(dir, '.ancleto'), { recursive: true })
  writeFileSync(join(dir, '.ancletorc'), `${JSON.stringify(rc, null, 2)}\n`)
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

function writeFixtureFile(fx, rel, content) {
  const abs = join(fx.dir, rel)
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, content)
}

// Repo temporal con las dos anclas resolubles que usan los fixtures: un path real y
// un spec con un unico Requirement. `obsoleto` es el token exclusivo de la ref rota.
function seedResolvableRepo(fx) {
  writeFixtureFile(fx, 'src/existe.js', 'export const existe = true\n')
  writeFixtureFile(fx, 'aspec/specs/memory-ops/spec.md', '# Spec: memory-ops\n\n### Requirement: Requirement uno\n\nContenido.\n')
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' })
}

// Salida JSON del subcomando. `code` es el exit real; `json` el objeto parseado.
function repairJson(cwd, args) {
  const r = runCli(cwd, ['memory', 'repair', 'refs', ...args, '--json'])
  let json = null
  try {
    json = JSON.parse(r.stdout)
  } catch {
    json = null
  }
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json }
}

// `remaining` solo tiene sentido en un plan resuelto: en `error`/`no-db` el JSON
// lo omite para no afirmar cero refs cuando el nodo conserva las suyas.
function assertNoRemaining(json) {
  assert.equal(Object.hasOwn(json, 'remaining'), false, 'remaining se omite fuera de ok/no-op')
}

// Estado observable completo: filas, indice FTS, schema y user_version. Comparar
// este objeto antes/despues prueba que un rechazo no commiteo nada (el WAL incluido).
function readState(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true })
  try {
    return {
      nodes: db.prepare(
        `SELECT id, memory_key, type, scope, status, content, justification, confidence, created_at, superseded_by
         FROM memory_nodes ORDER BY rowid`
      ).all(),
      docsize: db.prepare('SELECT count(*) AS n FROM memory_fts_docsize').get().n,
      userVersion: db.prepare('PRAGMA user_version').get().user_version,
      schema: db.prepare('SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name').all()
    }
  } finally {
    db.close()
  }
}

function singleActive(state, memoryKey) {
  const active = state.nodes.filter((row) => row.memory_key === memoryKey && row.status === 'active')
  assert.equal(active.length, 1, `una sola activa con ${memoryKey}`)
  return active[0]
}

describe('memory repair refs — reparacion de refs inexistentes', () => {
  it('S1: dry-run reporta la ref inexistente y --apply la remueve dejando el resto byte-identico', () => {
    const original = refsContent('prosa inicial con detalle', [
      'path:src/existe.js',
      'path:src/obsoleto.js',
      'spec:memory-ops#Requirement uno',
      'commit:abcdef1'
    ])
    const expected = refsContent('prosa inicial con detalle', [
      'path:src/existe.js',
      'spec:memory-ops#Requirement uno',
      'commit:abcdef1'
    ])
    const removed = [{ kind: 'path', ref: 'path:src/obsoleto.js', reason: 'inexistente' }]
    const fx = createFixture({ seed: [memoryNode('regla-s1', original)] })
    try {
      seedResolvableRepo(fx)
      const beforeHash = hashFile(fx.dbPath)

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-s1'])
      assert.equal(dry.code, 0, dry.stderr)
      assert.deepEqual(dry.json, {
        status: 'ok',
        memory_key: 'regla-s1',
        dry_run: true,
        applied: false,
        critical: false,
        removed,
        remaining: 3
      })
      assert.equal(hashFile(fx.dbPath), beforeHash, 'el dry-run no escribe la base')
      assert.equal(readState(fx.dbPath).nodes[0].content, original, 'el plan no toca el content')

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-s1', '--apply'])
      assert.equal(applied.code, 0, applied.stderr)
      assert.deepEqual(applied.json, {
        status: 'ok',
        memory_key: 'regla-s1',
        dry_run: false,
        applied: true,
        critical: false,
        removed,
        remaining: 3
      })
      const state = readState(fx.dbPath)
      assert.equal(singleActive(state, 'regla-s1').content, expected)
    } finally {
      fx.cleanup()
    }
  })

  it('S2: un nodo con solo refs ambiguas es no-op y conserva el content', () => {
    const original = refsContent('prosa ambigua', ['spec:dup#Dup'])
    const fx = createFixture({ seed: [memoryNode('regla-amb', original)] })
    try {
      writeFixtureFile(fx, 'aspec/specs/dup/spec.md', '# Spec: dup\n\n### Requirement: Dup\n\n### Requirement: Dup\n')

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-amb'])
      assert.equal(dry.code, 0, dry.stderr)
      assert.deepEqual(dry.json, {
        status: 'no-op',
        memory_key: 'regla-amb',
        dry_run: true,
        applied: false,
        critical: false,
        removed: [],
        remaining: 1
      })

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-amb', '--apply'])
      assert.equal(applied.code, 0, applied.stderr)
      assert.equal(applied.json.status, 'no-op')
      assert.equal(applied.json.applied, false)
      assert.equal(readState(fx.dbPath).nodes[0].content, original)
    } finally {
      fx.cleanup()
    }
  })

  it('S2: inexistente + ambigua no se reporta como plan aplicable ni se escribe', () => {
    const original = refsContent('prosa mixta', ['path:src/obsoleto.js', 'spec:dup#Dup'])
    const fx = createFixture({ seed: [memoryNode('regla-mixta', original)] })
    try {
      writeFixtureFile(fx, 'aspec/specs/dup/spec.md', '# Spec: dup\n\n### Requirement: Dup\n\n### Requirement: Dup\n')
      const before = readState(fx.dbPath)
      const beforeHash = hashFile(fx.dbPath)

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-mixta'])
      assert.equal(dry.code, 1)
      assert.equal(dry.json.status, 'error')
      assertNoRemaining(dry.json)
      assert.deepEqual(dry.json.removed, [])
      assert.match(dry.stderr, /ambiguo \(2 coincidencias\)/)
      assert.match(dry.stderr, /spec:dup#Dup/)
      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-mixta', '--apply'])
      assert.equal(applied.code, 1)
      assert.equal(applied.json.status, 'error')
      assertNoRemaining(applied.json)
      assert.deepEqual(applied.json.removed, [])
      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)
    } finally {
      fx.cleanup()
    }
  })

  it('S3: commit: y workitem: nunca se remueven y cuentan como conservadas', () => {
    const original = refsContent('prosa vcs', ['commit:abcdef1', 'workitem:ado:1234', 'path:src/existe.js'])
    const fx = createFixture({ seed: [memoryNode('regla-vcs', original)] })
    try {
      seedResolvableRepo(fx)
      const dry = repairJson(fx.dir, ['--memory-key', 'regla-vcs'])
      assert.equal(dry.code, 0, dry.stderr)
      assert.deepEqual(dry.json, {
        status: 'no-op',
        memory_key: 'regla-vcs',
        dry_run: true,
        applied: false,
        critical: false,
        removed: [],
        remaining: 3
      })

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-vcs', '--apply'])
      assert.equal(applied.code, 0, applied.stderr)
      assert.equal(applied.json.status, 'no-op')
      assert.equal(readState(fx.dbPath).nodes[0].content, original)
    } finally {
      fx.cleanup()
    }
  })

  it('S4: el dry-run es estrictamente read-only (bytes, sqlite_master y working-context)', () => {
    const original = refsContent('prosa read-only', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const fx = createFixture({ seed: [memoryNode('regla-s4', original)] })
    try {
      seedResolvableRepo(fx)
      writeFixtureFile(fx, '.ancleto/working-context.md', '# bloque previo\n')
      const beforeHash = hashFile(fx.dbPath)
      const before = readState(fx.dbPath)
      const ctxPath = join(fx.dir, '.ancleto', 'working-context.md')
      const beforeCtx = readFileSync(ctxPath, 'utf8')

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-s4'])
      assert.equal(dry.code, 0, dry.stderr)
      assert.equal(dry.json.removed.length, 1, 'reporta el plan de remocion')
      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)
      assert.equal(readFileSync(ctxPath, 'utf8'), beforeCtx)
    } finally {
      fx.cleanup()
    }
  })

  it('S5: --apply supersede preservando metadata con FTS alineado y busqueda del content reparado', () => {
    const original = refsContent('prosa supersede reparada', ['path:src/zanzibar.js', 'path:src/existe.js'])
    const expected = refsContent('prosa supersede reparada', ['path:src/existe.js'])
    const fx = createFixture({
      seed: [
        memoryNode('regla-s5', original, {
          scope: 'feature',
          justification: 'justificacion S5',
          createdAt: '2026-02-02T03:04:05.000Z'
        })
      ]
    })
    try {
      seedResolvableRepo(fx)
      const before = createReadonlyMemoryEngine(fx.dbPath)
      try {
        assert.deepEqual(
          before.searchMemory({ query: 'zanzibar', expand: true }).map((row) => row.memory_key),
          ['regla-s5'],
          'antes del apply el indice contiene la ref rota'
        )
      } finally {
        before.close()
      }

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-s5', '--apply'])
      assert.equal(applied.code, 0, applied.stderr)
      assert.equal(applied.json.applied, true)

      const state = readState(fx.dbPath)
      const active = singleActive(state, 'regla-s5')
      assert.equal(active.content, expected)
      assert.equal(active.created_at, '2026-02-02T03:04:05.000Z')
      assert.equal(active.scope, 'feature')
      assert.equal(active.type, 'rule')
      assert.equal(active.justification, 'justificacion S5')
      const superseded = state.nodes.find((row) => row.status === 'superseded')
      assert.equal(superseded.content, original, 'el nodo anterior conserva su content original')
      assert.equal(superseded.superseded_by, active.id)
      assert.equal(state.docsize, state.nodes.length, 'memory_fts_docsize == memory_nodes')

      const after = createReadonlyMemoryEngine(fx.dbPath)
      try {
        assert.deepEqual(after.searchMemory({ query: 'zanzibar', expand: true }), [], 'el token removido sale del indice')
        const hits = after.searchMemory({ query: 'prosa supersede', expand: true })
        assert.equal(hits.length, 1)
        assert.equal(hits[0].content, expected)
      } finally {
        after.close()
      }
    } finally {
      fx.cleanup()
    }
  })

  it('S6: cero nodos activos con la clave falla con exit 1 sin escrituras', () => {
    const fx = createFixture({ seed: [memoryNode('regla-otra', refsContent('prosa', ['path:src/existe.js']))] })
    try {
      seedResolvableRepo(fx)
      const before = readState(fx.dbPath)
      const beforeHash = hashFile(fx.dbPath)

      const dry = repairJson(fx.dir, ['--memory-key', 'no-existe'])
      assert.equal(dry.code, 1)
      assert.equal(dry.json.status, 'error')
      assertNoRemaining(dry.json)
      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)
    } finally {
      fx.cleanup()
    }
  })

  it('S6: mas de un nodo activo con la clave falla con exit 1 sin escrituras', () => {
    const content = refsContent('prosa duplicada activa', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const fx = createFixture({ seed: [memoryNode('regla-dup', content)] })
    try {
      seedResolvableRepo(fx)
      // Estado invalido a proposito: el indice parcial UNIQUE impide dos activas, se
      // quita solo en esta base temporal para ejercitar la seleccion fail-closed.
      const writer = new DatabaseSync(fx.dbPath)
      try {
        writer.exec('DROP INDEX idx_memory_nodes_key_active')
        writer.prepare(
          `INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
           VALUES (?, ?, 'rule', 'project', 'active', ?, '', 'test', 1, ?)`
        ).run('segundo-activo', 'regla-dup', content, '2026-01-02T00:00:00.000Z')
      } finally {
        writer.close()
      }
      const before = readState(fx.dbPath)
      assert.equal(before.nodes.filter((row) => row.status === 'active').length, 2)
      const beforeHash = hashFile(fx.dbPath)

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-dup'])
      assert.equal(dry.code, 1)
      assert.equal(dry.json.status, 'error')
      assertNoRemaining(dry.json)
      assert.match(dry.stderr, /2 nodos activos/)
      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)

      // Higiene del fixture: retirar la fila sintetica y restaurar el indice UNIQUE
      // parcial que se quito para poder materializar el estado invalido.
      const restore = new DatabaseSync(fx.dbPath)
      try {
        restore.prepare(`DELETE FROM memory_nodes WHERE id = 'segundo-activo'`).run()
        restore.exec(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_nodes_key_active
           ON memory_nodes(memory_key) WHERE status = 'active'`
        )
        assert.equal(
          restore.prepare(`SELECT count(*) AS n FROM sqlite_master WHERE type = 'index' AND name = 'idx_memory_nodes_key_active'`).get().n,
          1,
          'el indice parcial UNIQUE queda restaurado'
        )
      } finally {
        restore.close()
      }
    } finally {
      fx.cleanup()
    }
  })

  it('S7: bloque refs: malformado y bloque repetido se rechazan con exit 1 sin escrituras', () => {
    const malformed = 'prosa\n\nrefs:\n  no-es-una-ref'
    const repeated = 'prosa\n\nrefs:\n  - path:src/obsoleto.js\n\nrefs:\n  - path:src/existe.js'
    const fx = createFixture({
      seed: [memoryNode('regla-mal', malformed), memoryNode('regla-rep', repeated)]
    })
    try {
      seedResolvableRepo(fx)
      for (const key of ['regla-mal', 'regla-rep']) {
        const before = readState(fx.dbPath)
        const beforeHash = hashFile(fx.dbPath)
        const dry = repairJson(fx.dir, ['--memory-key', key])
        assert.equal(dry.code, 1, key)
        assert.equal(dry.json.status, 'error', key)
        assertNoRemaining(dry.json)
        assert.equal(hashFile(fx.dbPath), beforeHash, key)
        assert.deepEqual(readState(fx.dbPath), before, key)
      }
    } finally {
      fx.cleanup()
    }
  })

  it('S8: una reparacion que dejaria cero refs se rechaza y remite a export/import', () => {
    const original = refsContent('prosa sin refs validas', ['path:src/obsoleto.js'])
    const fx = createFixture({ seed: [memoryNode('regla-cero', original)] })
    try {
      seedResolvableRepo(fx)
      const before = readState(fx.dbPath)
      const beforeHash = hashFile(fx.dbPath)

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-cero'])
      assert.equal(dry.code, 1)
      assert.equal(dry.json.status, 'error')
      // El nodo conserva sus refs: el JSON no debe afirmar `remaining: 0`.
      assertNoRemaining(dry.json)
      assert.match(dry.stderr, /memory export/)
      assert.match(dry.stderr, /memory import/)

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-cero', '--apply'])
      assert.equal(applied.code, 1)
      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)
    } finally {
      fx.cleanup()
    }
  })

  it('S9: clave critica reporta critical, bloquea --apply con exit 2 y aplica con --force-critical', () => {
    const original = refsContent('prosa critica', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const expected = refsContent('prosa critica', ['path:src/existe.js'])
    const fx = createFixture({
      rc: { memory: { criticalKeys: ['regla-critica'] } },
      seed: [memoryNode('regla-critica', original)]
    })
    try {
      seedResolvableRepo(fx)
      const before = readState(fx.dbPath)
      const beforeHash = hashFile(fx.dbPath)

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-critica'])
      assert.equal(dry.code, 0, dry.stderr)
      assert.equal(dry.json.critical, true)
      assert.equal(dry.json.removed.length, 1)
      assert.equal(hashFile(fx.dbPath), beforeHash)

      const blocked = repairJson(fx.dir, ['--memory-key', 'regla-critica', '--apply'])
      assert.equal(blocked.code, 2)
      assert.deepEqual(blocked.json, { error: 'critical-key-gate', criticalAffected: ['regla-critica'] })
      assert.equal(hashFile(fx.dbPath), beforeHash, 'el gate no escribe')
      assert.deepEqual(readState(fx.dbPath), before)

      const forced = repairJson(fx.dir, ['--memory-key', 'regla-critica', '--apply', '--force-critical'])
      assert.equal(forced.code, 0, forced.stderr)
      assert.equal(forced.json.applied, true)
      assert.equal(forced.json.critical, true)
      assert.equal(singleActive(readState(fx.dbPath), 'regla-critica').content, expected)
    } finally {
      fx.cleanup()
    }
  })

  it('S10: la segunda corrida tras un apply es no-op con exit 0 sin escribir', () => {
    const original = refsContent('prosa idempotente', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const fx = createFixture({ seed: [memoryNode('regla-idem', original)] })
    try {
      seedResolvableRepo(fx)
      const first = repairJson(fx.dir, ['--memory-key', 'regla-idem', '--apply'])
      assert.equal(first.code, 0, first.stderr)
      assert.equal(first.json.applied, true)
      const afterApply = readState(fx.dbPath)
      const hashAfterApply = hashFile(fx.dbPath)

      const second = repairJson(fx.dir, ['--memory-key', 'regla-idem', '--apply'])
      assert.equal(second.code, 0, second.stderr)
      assert.deepEqual(second.json, {
        status: 'no-op',
        memory_key: 'regla-idem',
        dry_run: false,
        applied: false,
        critical: false,
        removed: [],
        remaining: 1
      })
      assert.equal(hashFile(fx.dbPath), hashAfterApply)
      assert.deepEqual(readState(fx.dbPath), afterApply)
    } finally {
      fx.cleanup()
    }
  })

  it('S11: el rollback por snapshot restaura quick_check, FTS y el content previo', () => {
    const original = refsContent('prosa rollback', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const fx = createFixture({ seed: [memoryNode('regla-rollback', original)] })
    try {
      seedResolvableRepo(fx)
      const snap = join(fx.dir, 'snapshot.db')
      const snapshot = runCli(fx.dir, ['memory', 'snapshot', '--out', snap])
      assert.equal(snapshot.status, 0, snapshot.stderr)

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-rollback', '--apply'])
      assert.equal(applied.code, 0, applied.stderr)
      assert.equal(applied.json.applied, true)
      // Antes de restaurar: el nodo superseded conserva el content original.
      const superseded = readState(fx.dbPath).nodes.find((row) => row.status === 'superseded')
      assert.equal(superseded.content, original)

      copyFileSync(snap, fx.dbPath)
      for (const suffix of ['-wal', '-shm']) rmSync(`${fx.dbPath}${suffix}`, { force: true })

      const db = new DatabaseSync(fx.dbPath, { readOnly: true })
      try {
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
        assert.equal(
          db.prepare('SELECT count(*) AS n FROM memory_fts_docsize').get().n,
          db.prepare('SELECT count(*) AS n FROM memory_nodes').get().n
        )
        const row = db.prepare(
          `SELECT content FROM memory_nodes WHERE memory_key = 'regla-rollback' AND status = 'active'`
        ).get()
        assert.equal(row.content, original)
      } finally {
        db.close()
      }
    } finally {
      fx.cleanup()
    }
  })

  it('S12: --apply no agrega objetos de schema ni cambia user_version', () => {
    const original = refsContent('prosa schema', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const expected = refsContent('prosa schema', ['path:src/existe.js'])
    const fx = createFixture({ seed: [memoryNode('regla-schema', original)] })
    try {
      seedResolvableRepo(fx)
      const before = readState(fx.dbPath)

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-schema', '--apply'])
      assert.equal(applied.code, 0, applied.stderr)
      assert.equal(applied.json.applied, true)

      const after = readState(fx.dbPath)
      assert.deepEqual(after.schema, before.schema, 'sin tablas, columnas ni indices nuevos')
      assert.equal(after.userVersion, before.userVersion)

      // Lector del estado previo (mismo schema, sin migracion): el motor read-only
      // abre con `migrate: false`, lee el nodo reparado y no altera la base.
      const reader = createReadonlyMemoryEngine(fx.dbPath)
      try {
        const active = reader.listNodes({ status: 'active' }).find((node) => node.memory_key === 'regla-schema')
        assert.equal(active.content, expected, 'el lector previo lee el content reparado')
        assert.equal(reader.listNodes({ status: 'superseded' }).length, 1)
      } finally {
        reader.close()
      }
      assert.deepEqual(readState(fx.dbPath), after, 'abrir el lector no migro ni escribio')
    } finally {
      fx.cleanup()
    }
  })

  it('S13: un plan no aplicable se rechaza igual en dry-run y en --apply nombrando la ref', () => {
    const original = refsContent('prosa change ambiguo', ['path:src/obsoleto.js', 'change:dup-change'])
    const fx = createFixture({ seed: [memoryNode('regla-paridad', original)] })
    try {
      seedResolvableRepo(fx)
      writeFixtureFile(fx, 'aspec/changes/dup-change/proposal.md', '# dup\n')
      writeFixtureFile(fx, 'aspec/changes/archive/2026-01-01-dup-change/proposal.md', '# dup archived\n')
      const before = readState(fx.dbPath)
      const beforeHash = hashFile(fx.dbPath)

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-paridad'])
      assert.equal(dry.code, 1)
      assert.equal(dry.json.status, 'error')
      assertNoRemaining(dry.json)
      assert.deepEqual(dry.json.removed, [])
      assert.match(dry.stderr, /change ambiguo \(2 coincidencias\)/)
      assert.match(dry.stderr, /change:dup-change/)

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-paridad', '--apply'])
      assert.equal(applied.code, 1)
      assert.equal(applied.json.status, 'error')
      assertNoRemaining(applied.json)
      assert.deepEqual(applied.json.removed, [])
      assert.match(applied.stderr, /change ambiguo \(2 coincidencias\)/)
      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)
    } finally {
      fx.cleanup()
    }
  })

  it('S14: --apply de una rule project refresca el working-context y el superseded conserva su content', () => {
    const original = refsContent('prosa proyecto visible', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const expected = refsContent('prosa proyecto visible', ['path:src/existe.js'])
    const fx = createFixture({ seed: [memoryNode('regla-s14', original)] })
    try {
      seedResolvableRepo(fx)
      const ctxPath = join(fx.dir, '.ancleto', 'working-context.md')
      // Bloque previo distinto del render esperado: el apply debe reescribirlo.
      writeFixtureFile(fx, '.ancleto/working-context.md', '<ProjectMemoryRules>\nbloque viejo\n</ProjectMemoryRules>\n')
      const beforeCtx = readFileSync(ctxPath, 'utf8')

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-s14', '--apply'])
      assert.equal(applied.code, 0, applied.stderr)
      assert.equal(applied.json.applied, true)

      const state = readState(fx.dbPath)
      assert.equal(singleActive(state, 'regla-s14').content, expected)
      assert.equal(state.nodes.find((row) => row.status === 'superseded').content, original)

      const afterCtx = readFileSync(ctxPath, 'utf8')
      assert.notEqual(afterCtx, beforeCtx, 'el bloque derivado se reescribio')
      assert.match(afterCtx, /- \[regla-s14\] prosa proyecto visible/)
      const render = createReadonlyMemoryEngine(fx.dbPath)
      try {
        const expectedBlock = render.buildWorkingContext('project', undefined, fx.dir, { required: [] })
        assert.equal(afterCtx, `${expectedBlock}\n`, 'el archivo refleja el nodo activo reparado')
      } finally {
        render.close()
      }
    } finally {
      fx.cleanup()
    }
  })

  it('ningun nodo fuera de --memory-key cambia al aplicar la reparacion', () => {
    const original = refsContent('prosa objetivo', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const otherOriginal = refsContent('prosa ajena intacta', ['path:src/existe.js', 'commit:abcdef1'])
    const fx = createFixture({
      seed: [
        memoryNode('regla-objetivo', original),
        memoryNode('regla-ajena', otherOriginal, {
          justification: 'justificacion ajena',
          createdAt: '2026-01-03T00:00:00.000Z'
        })
      ]
    })
    try {
      seedResolvableRepo(fx)
      const rowsOf = (key) => readState(fx.dbPath).nodes.filter((row) => row.memory_key === key)
      const before = rowsOf('regla-ajena')
      assert.equal(before.length, 1)

      const applied = repairJson(fx.dir, ['--memory-key', 'regla-objetivo', '--apply'])
      assert.equal(applied.code, 0, applied.stderr)
      assert.equal(applied.json.applied, true)

      assert.deepEqual(rowsOf('regla-ajena'), before, 'la fila ajena queda identica')
    } finally {
      fx.cleanup()
    }
  })

  it('un rechazo sobre una clave critica reporta status error, critical true y reason', () => {
    const original = refsContent('prosa critica rechazada', ['path:src/obsoleto.js'])
    const fx = createFixture({
      rc: { memory: { criticalKeys: ['regla-critica-rechazo'] } },
      seed: [memoryNode('regla-critica-rechazo', original)]
    })
    try {
      seedResolvableRepo(fx)
      const before = readState(fx.dbPath)
      const beforeHash = hashFile(fx.dbPath)

      const dry = repairJson(fx.dir, ['--memory-key', 'regla-critica-rechazo'])
      assert.equal(dry.code, 1, 'el rechazo no es el gate critico (exit 2)')
      assert.equal(dry.json.status, 'error')
      assert.equal(dry.json.critical, true)
      assert.equal(typeof dry.json.reason, 'string')
      assert.match(dry.json.reason, /memory export/)
      assertNoRemaining(dry.json)
      assert.deepEqual(dry.json.removed, [])
      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)
    } finally {
      fx.cleanup()
    }
  })

  it('negativos: --force-critical en dry-run no escribe, flag desconocida y sin --memory-key salen 1, base ausente es no-db', () => {
    const original = refsContent('prosa negativa', ['path:src/obsoleto.js', 'path:src/existe.js'])
    const fx = createFixture({ seed: [memoryNode('regla-neg', original)] })
    try {
      seedResolvableRepo(fx)
      const before = readState(fx.dbPath)
      const beforeHash = hashFile(fx.dbPath)

      const forcedDry = repairJson(fx.dir, ['--memory-key', 'regla-neg', '--force-critical'])
      assert.equal(forcedDry.code, 0, forcedDry.stderr)
      assert.equal(forcedDry.json.dry_run, true)
      assert.equal(forcedDry.json.critical, false)
      assert.equal(hashFile(fx.dbPath), beforeHash)

      const unknown = runCli(fx.dir, ['memory', 'repair', 'refs', '--memory-key', 'regla-neg', '--strict'])
      assert.equal(unknown.status, 1)
      assert.match(unknown.stderr, /flag desconocido: --strict/)
      assert.match(unknown.stderr, /uso: ancleto memory repair refs/)

      const missing = runCli(fx.dir, ['memory', 'repair', 'refs'])
      assert.equal(missing.status, 1)
      assert.match(missing.stderr, /uso: ancleto memory repair refs/)

      const unknownSub = runCli(fx.dir, ['memory', 'repair', 'nope'])
      assert.equal(unknownSub.status, 1)
      assert.match(unknownSub.stderr, /subcomando de memory repair desconocido/)

      const bare = mkdtempSync(join(tmpdir(), 'ancleto-repair-refs-nodb-'))
      try {
        const noDb = runCli(bare, ['memory', 'repair', 'refs', '--memory-key', 'x', '--json'])
        assert.equal(noDb.status, 1)
        const noDbJson = JSON.parse(noDb.stdout)
        assert.equal(noDbJson.status, 'no-db')
        assertNoRemaining(noDbJson)
        assert.equal(Object.hasOwn(noDbJson, 'reason'), false, 'no-db no es un rechazo')
      } finally {
        rmSync(bare, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      }

      assert.equal(hashFile(fx.dbPath), beforeHash)
      assert.deepEqual(readState(fx.dbPath), before)
    } finally {
      fx.cleanup()
    }
  })
})
