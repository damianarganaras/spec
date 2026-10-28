import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { openDatabase } from '../src/core/memory/database.js'
import { createMemoryEngine, defaultMemoryDbPath } from '../src/core/memory/engine.js'
import { memoryDoctor } from '../src/core/memory/doctor.js'
import { memoryTools, createMemoryToolkit } from '../src/core/memory/tools.js'

const dir = mkdtempSync(join(tmpdir(), 'ancleto-memory-'))
const dbPath = join(dir, '.ancleto', 'memory.db')
const engine = createMemoryEngine(dbPath)

after(() => {
  engine.close()
  rmSync(dir, { recursive: true, force: true })
})

function raw(sql, ...params) {
  const db = openDatabase(dbPath)
  try {
    return db.prepare(sql).all(...params)
  } finally {
    db.close()
  }
}

describe('database', () => {
  it('crea el archivo y aplica las PRAGMAs obligatorias', () => {
    assert.ok(existsSync(dbPath))
    const pr = raw('PRAGMA journal_mode')
    assert.equal(pr[0].journal_mode, 'wal')
    assert.equal(raw('PRAGMA foreign_keys')[0].foreign_keys, 1)
    assert.equal(raw('PRAGMA busy_timeout')[0].timeout, 5000)
  })

  it('las migraciones son idempotentes', () => {
    openDatabase(dbPath).close()
    openDatabase(dbPath).close()
    const objs = raw(`SELECT type, name FROM sqlite_master WHERE name IN
      ('memory_nodes','memory_fts','memory_fts_ai','memory_fts_ad','memory_fts_au','idx_memory_nodes_key_active','idx_memory_nodes_scope_type')`)
    assert.equal(objs.length, 7)
  })
})

describe('triggers FTS5', () => {
  it('INSERT/UPDATE/DELETE mantienen el indice sincronizado', () => {
    const ins = openDatabase(dbPath)
    ins.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
      VALUES ('t-1', 'k-fts', 'rule', 'repo', 'active', 'formato de errores', '', 'test', 1, ?)`).run(new Date().toISOString())
    ins.close()

    let hit = raw(`SELECT n.memory_key FROM memory_fts f JOIN memory_nodes n ON n.rowid = f.rowid WHERE memory_fts MATCH 'errores'`)
    assert.equal(hit.length, 1)

    const upd = openDatabase(dbPath)
    upd.prepare(`UPDATE memory_nodes SET content = 'formato de exito' WHERE id = 't-1'`).run()
    upd.close()

    assert.equal(raw(`SELECT 1 AS x FROM memory_fts WHERE memory_fts MATCH 'errores'`).length, 0)
    assert.equal(raw(`SELECT 1 AS x FROM memory_fts WHERE memory_fts MATCH 'exito'`).length, 1)

    const del = openDatabase(dbPath)
    del.prepare(`DELETE FROM memory_nodes WHERE id = 't-1'`).run()
    del.close()

    assert.equal(raw(`SELECT 1 AS x FROM memory_fts WHERE memory_fts MATCH 'exito'`).length, 0)
    assert.equal(raw(`SELECT rowid FROM memory_fts`).length, 0)
  })
})

describe('supersesion atomica', () => {
  it('misma memory_key: una sola activa, la previa queda superseded con genealogy', () => {
    engine.recordNode({ memory_key: 'k-sup', type: 'rule', scope: 'repo', content: 'version uno' })
    const r2 = engine.recordNode({ memory_key: 'k-sup', type: 'rule', scope: 'repo', content: 'version dos' })

    const active = raw(`SELECT id, content FROM memory_nodes WHERE memory_key = 'k-sup' AND status = 'active'`)
    const old = raw(`SELECT id, superseded_by FROM memory_nodes WHERE memory_key = 'k-sup' AND status = 'superseded'`)
    assert.equal(active.length, 1)
    assert.equal(active[0].content, 'version dos')
    assert.equal(old.length, 1)
    assert.equal(old[0].superseded_by, active[0].id)
    assert.equal(r2.superseded, 1)
  })

  it('supersede tambien cruzando tipo (rule -> decision) con la misma clave', () => {
    engine.recordNode({ memory_key: 'k-cross', type: 'rule', scope: 'repo', content: 'era una regla' })
    engine.recordNode({ memory_key: 'k-cross', type: 'decision', scope: 'repo', content: 'ahora es decision' })

    const states = raw(`SELECT type, status FROM memory_nodes WHERE memory_key = 'k-cross' ORDER BY created_at`)
    assert.equal(states.length, 2)
    assert.equal(states.filter((s) => s.status === 'active').length, 1)
    assert.equal(states.find((s) => s.status === 'active').type, 'decision')
  })

  it('el indice UNICO parcial rechaza una segunda activa fuera de la transaccion', () => {
    assert.throws(() => {
      const db = openDatabase(dbPath)
      try {
        db.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
          VALUES ('t-dup', 'k-cross', 'rule', 'repo', 'active', 'x', '', 'test', 1, ?)`).run(new Date().toISOString())
      } finally {
        db.close()
      }
    }, /UNIQUE constraint failed/)
  })

  it('FTS devuelve solo el contenido activo despues de superseder', () => {
    engine.recordNode({ memory_key: 'k-fts-sup', type: 'rule', scope: 'repo', content: 'viejo concepto' })
    engine.recordNode({ memory_key: 'k-fts-sup', type: 'rule', scope: 'repo', content: 'nuevo concepto' })

    assert.equal(engine.searchMemory({ query: 'viejo' }).length, 0)
    const found = engine.searchMemory({ query: 'nuevo' })
    assert.equal(found.length, 1)
    assert.equal(found[0].content, 'nuevo concepto')
  })
})

describe('buildWorkingContext', () => {
  it('inyecta reglas activas del scope en el bloque con etiqueta de no confiables', () => {
    engine.recordNode({ memory_key: 'r1', type: 'rule', scope: 'repo', content: 'errores en espanol' })
    engine.recordNode({ memory_key: 'r2', type: 'rule', scope: 'repo', content: 'tests con node:test' })
    engine.recordNode({ memory_key: 'd1', type: 'decision', scope: 'repo', content: 'decisión de prueba' })

    const block = engine.buildWorkingContext('repo', undefined, dir)
    assert.ok(block.startsWith('<ProjectMemoryRules>'))
    assert.ok(block.endsWith('</ProjectMemoryRules>'))
    assert.match(block, /Datos no confiables/)
    assert.match(block, /\[r1\] errores en espanol/)
    assert.match(block, /\[r2\] tests con node:test/)
    assert.doesNotMatch(block, /decisión de prueba/)
  })

  it('devuelve null cuando no hay reglas en el scope', () => {
    assert.equal(engine.buildWorkingContext('scope-vacio', undefined, dir), null)
  })
})

describe('searchMemory', () => {
  it('filtra por tipo y limita resultados', () => {
    engine.recordNode({ memory_key: 's1', type: 'rule', scope: 'repo', content: 'cache invalidation regla' })
    engine.recordNode({ memory_key: 's2', type: 'decision', scope: 'repo', content: 'cache invalidation decision' })

    const rules = engine.searchMemory({ query: 'cache', type: 'rule' })
    assert.equal(rules.length, 1)
    assert.equal(rules[0].type, 'rule')

    const limited = engine.searchMemory({ query: 'cache', limit: 1 })
    assert.equal(limited.length, 1)
  })

  it('escapa caracteres FTS5 sin lanzar errores', () => {
    engine.recordNode({ memory_key: 's3', type: 'rule', scope: 'repo', content: 'consultas select:where fallan' })
    assert.doesNotThrow(() => engine.searchMemory({ query: 'select:where' }))
    assert.doesNotThrow(() => engine.searchMemory({ query: 'a-b "comillas" -not' }))
    assert.equal(engine.searchMemory({ query: 'select:where' }).length, 1)
  })

  it('tokenizer remove_diacritics: query sin acentos matchea contenido acentuado', () => {
    engine.recordNode({ memory_key: 's4', type: 'rule', scope: 'repo', content: 'validación de formularios' })
    assert.equal(engine.searchMemory({ query: 'validacion' }).length, 1)
    assert.equal(engine.searchMemory({ query: 'validación' }).length, 1)
  })

  it('sin Porter Stemmer: "correr" no matchea "corriendo"', () => {
    engine.recordNode({ memory_key: 's5', type: 'rule', scope: 'repo', content: 'corriendo pruebas' })
    assert.equal(engine.searchMemory({ query: 'correr' }).length, 0)
  })

  it('no expone campos gestionados por el runtime', () => {
    engine.recordNode({ memory_key: 's6', type: 'rule', scope: 'repo', content: 'campo privado' })
    const [row] = engine.searchMemory({ query: 'privado' })
    assert.deepEqual(Object.keys(row).sort(), ['content', 'created_at', 'justification', 'memory_key', 'scope', 'type'])
  })

  it('no expone source en el resultado (procedencia oculta al LLM)', () => {
    engine.recordNode({ memory_key: 's-src-hidden', type: 'rule', scope: 'repo', content: 'ocultamiento procedencia' })
    const [row] = engine.searchMemory({ query: 'ocultamiento' })
    assert.ok(row)
    assert.equal('source' in row, false)
  })

  it('valida type invalido', () => {
    assert.throws(() => engine.searchMemory({ query: 'x', type: 'otro' }), /type invalido/)
  })

  it('fallback tolerante: lenguaje natural encuentra por OR+prefijos (issue #14)', () => {
    engine.recordNode({ memory_key: 'nat-2', type: 'decision', scope: 'feature', content: 'Soportar Chrome Android y Safari iOS para la instalacion del manifestxnatural.' })

    // el AND estricto no encontraria nada; el fallback recupera por terminos relevantes
    const natural = engine.searchMemory({ query: 'como instalar el manifestxnatural en el celular' })
    assert.ok(natural.length >= 1, 'debe recuperar por lenguaje natural')
    assert.ok(natural.some((n) => n.memory_key === 'nat-2'))

    // sigue respetando el filtro de tipo en el fallback
    const onlyRules = engine.searchMemory({ query: 'como instalar el manifestxnatural en el celular', type: 'rule' })
    assert.ok(onlyRules.every((n) => n.type === 'rule'))
  })

  it('el AND preciso gana cuando hay coincidencia exacta (no degrada)', () => {
    engine.recordNode({ memory_key: 'exact-1', type: 'rule', scope: 'repo', content: 'uniqueterminoexacto alpha' })
    const r = engine.searchMemory({ query: 'uniqueterminoexacto alpha' })
    assert.equal(r.length, 1)
    assert.equal(r[0].memory_key, 'exact-1')
  })

  it('consulta solo de stopwords no rompe ni matchea todo', () => {
    const r = engine.searchMemory({ query: 'como de la el' })
    assert.ok(Array.isArray(r))
  })
})

// memory-search-order-tiebreak: orden total por `rank, n.rowid` (ascendente) en
// ambas ramas de `run` (pass 1 AND y pass 2 OR con prefijos).
describe('searchMemory — desempate determinista (memory-search-order-tiebreak)', () => {
  function withSearchEngine(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-tie-'))
    const dbPath = join(dir, 'memory.db')
    const eng = createMemoryEngine(dbPath)
    try {
      return fn(eng, dbPath)
    } finally {
      eng.close()
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    }
  }

  function rawAt(dbPath, sql, ...params) {
    const db = openDatabase(dbPath)
    try {
      return db.prepare(sql).all(...params)
    } finally {
      db.close()
    }
  }

  it('empate de bm25 con truncamiento: subconjunto y orden deterministas, rowid ascendente', () => {
    withSearchEngine((eng, dbPath) => {
      const content = 'zqtiebreak contenido identico de longitud fija'
      const keys = ['tie-1', 'tie-2', 'tie-3', 'tie-4', 'tie-5']
      for (const k of keys) {
        eng.recordNode({ memory_key: k, type: 'rule', scope: 'project', content })
      }

      // premisa: los matches tienen exactamente el mismo score bm25 (empate real)
      const scores = rawAt(dbPath,
        `SELECT bm25(memory_fts) AS score FROM memory_fts JOIN memory_nodes n ON n.rowid = memory_fts.rowid
         WHERE memory_fts MATCH ?`,
        '"zqtiebreak"').map((r) => r.score)
      assert.equal(scores.length, keys.length)
      assert.equal(new Set(scores).size, 1)

      const limit = 2
      const first = eng.searchMemory({ query: 'zqtiebreak', limit })
      const second = eng.searchMemory({ query: 'zqtiebreak', limit })

      assert.equal(first.length, limit)
      // determinismo: misma query sobre el mismo estado -> mismo subconjunto y orden
      assert.deepEqual(first.map((n) => n.memory_key), second.map((n) => n.memory_key))

      // desempate por rowid ascendente: sobrevive el subconjunto de menor rowid
      const expected = rawAt(dbPath,
        `SELECT memory_key FROM memory_nodes WHERE content = ? ORDER BY rowid ASC`, content
      ).slice(0, limit).map((r) => r.memory_key)
      assert.deepEqual(first.map((n) => n.memory_key), expected)
    })
  })

  it('el fallback tolerante (pass 2, OR con prefijos) usa el mismo desempate', () => {
    withSearchEngine((eng, dbPath) => {
      const content = 'zqfbterm contenido identico de longitud fija'
      const keys = ['fb-1', 'fb-2', 'fb-3', 'fb-4']
      for (const k of keys) {
        eng.recordNode({ memory_key: k, type: 'rule', scope: 'project', content })
      }

      const query = 'zqfbterm zqfbnonexistente'
      // premisa: el AND estricto (pass 1) no matchea; solo el OR+prefijos (pass 2) recupera
      const strict = rawAt(dbPath,
        `SELECT COUNT(*) AS c FROM memory_fts WHERE memory_fts MATCH ?`, '"zqfbterm" "zqfbnonexistente"')
      assert.equal(strict[0].c, 0)
      const loose = rawAt(dbPath,
        `SELECT COUNT(*) AS c FROM memory_fts WHERE memory_fts MATCH ?`, '"zqfbterm"* OR "zqfbnonexistente"*')
      assert.ok(loose[0].c >= keys.length, 'el fallback OR debe recuperar los nodos')

      const limit = 2
      const first = eng.searchMemory({ query, limit })
      const second = eng.searchMemory({ query, limit })

      assert.equal(first.length, limit)
      assert.deepEqual(first.map((n) => n.memory_key), second.map((n) => n.memory_key))

      const expected = rawAt(dbPath,
        `SELECT memory_key FROM memory_nodes WHERE content = ? ORDER BY rowid ASC`, content
      ).slice(0, limit).map((r) => r.memory_key)
      assert.deepEqual(first.map((n) => n.memory_key), expected)
    })
  })

  it('sin truncamiento (matches <= limit) devuelve el mismo conjunto completo', () => {
    withSearchEngine((eng, dbPath) => {
      const content = 'zqsetreg contenido de regresion'
      const keys = ['sr-1', 'sr-2', 'sr-3']
      for (const k of keys) {
        eng.recordNode({ memory_key: k, type: 'rule', scope: 'project', content })
      }

      const found = eng.searchMemory({ query: 'zqsetreg', limit: 50 })
      const allMatches = rawAt(dbPath,
        `SELECT n.memory_key FROM memory_fts f JOIN memory_nodes n ON n.rowid = f.rowid
         WHERE memory_fts MATCH ? AND n.status = 'active'`,
        '"zqsetreg"').map((r) => r.memory_key)

      assert.equal(found.length, keys.length)
      assert.equal(allMatches.length, keys.length)
      assert.deepEqual(found.map((n) => n.memory_key).sort(), allMatches.slice().sort())
    })
  })

  it('el filtro type acota el conjunto y aplica el desempate dentro del tipo', () => {
    withSearchEngine((eng, dbPath) => {
      const content = 'zqtypefiltro contenido identico de longitud fija'
      for (const k of ['tf-r1', 'tf-r2', 'tf-r3']) {
        eng.recordNode({ memory_key: k, type: 'rule', scope: 'project', content })
      }
      for (const k of ['tf-d1', 'tf-d2']) {
        eng.recordNode({ memory_key: k, type: 'decision', scope: 'project', content })
      }

      const limit = 2
      const rules = eng.searchMemory({ query: 'zqtypefiltro', type: 'rule', limit })
      assert.equal(rules.length, limit)
      assert.ok(rules.every((n) => n.type === 'rule'))

      const expectedRules = rawAt(dbPath,
        `SELECT memory_key FROM memory_nodes WHERE content = ? AND type = 'rule' ORDER BY rowid ASC`, content
      ).slice(0, limit).map((r) => r.memory_key)
      assert.deepEqual(rules.map((n) => n.memory_key), expectedRules)

      const decisions = eng.searchMemory({ query: 'zqtypefiltro', type: 'decision' })
      assert.equal(decisions.length, 2)
      assert.ok(decisions.every((n) => n.type === 'decision'))

      const all = eng.searchMemory({ query: 'zqtypefiltro' })
      assert.equal(all.length, 5)
    })
  })
})

describe('recordNode', () => {
  it('valida entradas minimas', () => {
    assert.throws(() => engine.recordNode({}), /memory_key es obligatorio/)
    assert.throws(() => engine.recordNode({ memory_key: 'k', type: 'otro', content: 'c' }), /type invalido/)
    assert.throws(() => engine.recordNode({ memory_key: 'k', type: 'rule', content: ' ' }), /content es obligatorio/)
  })

  it('resuelve id, status, source y confidence desde el runtime', () => {
    engine.recordNode({ memory_key: 'k-runtime', type: 'rule', content: 'c', source: 'forged', status: 'deleted', id: 'forged' }, { source: 'agent:memory-keeper', confidence: 0.8 })
    const [row] = raw(`SELECT id, status, source, confidence, created_at FROM memory_nodes WHERE memory_key = 'k-runtime' AND status = 'active'`)
    assert.match(row.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    assert.equal(row.status, 'active')
    assert.equal(row.source, 'agent:memory-keeper')
    assert.equal(row.confidence, 0.8)
    assert.ok(row.created_at)
  })

  it('ignora un source forjado en el input y usa el runtime por defecto', () => {
    engine.recordNode({ memory_key: 'k-src-forge', type: 'rule', content: 'c', source: 'mcp:ancleto-memory' })
    const [row] = raw(`SELECT source FROM memory_nodes WHERE memory_key = 'k-src-forge' AND status = 'active'`)
    assert.equal(row.source, 'runtime')
  })
})

describe('listNodes — procedencia (memory-actor-provenance)', () => {
  it('incluye source en cada nodo y refleja el valor real', () => {
    engine.recordNode({ memory_key: 'ln-provenance', type: 'rule', scope: 'repo', content: 'con procedencia' }, { source: 'agent:tester' })
    engine.recordNode({ memory_key: 'ln-runtime', type: 'rule', scope: 'repo', content: 'runtime default' })

    const nodes = engine.listNodes()
    assert.ok(nodes.length > 0)
    assert.ok(nodes.every((n) => 'source' in n), 'todo nodo de listNodes debe incluir source')
    assert.equal(nodes.find((n) => n.memory_key === 'ln-provenance').source, 'agent:tester')
    assert.equal(nodes.find((n) => n.memory_key === 'ln-runtime').source, 'runtime')
  })

  it('no rompe con valores historicos de source (retrocompatibilidad)', () => {
    const db = openDatabase(dbPath)
    db.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
      VALUES ('ln-hist-1', 'ln-historical', 'rule', 'repo', 'active', 'nodo historico', '', 'import', 1, ?)`).run(new Date().toISOString())
    db.close()

    const node = engine.listNodes().find((n) => n.memory_key === 'ln-historical')
    assert.ok(node, 'el nodo con source historico debe seguir listandose')
    assert.equal(node.source, 'import')
  })
})

describe('tools', () => {
  it('expone exactamente 3 tools con las firmas correctas', () => {
    assert.deepEqual(memoryTools.map((t) => t.name), ['searchMemory', 'recordRule', 'recordDecision'])
  })

  it('ninguna firma expone source, confidence, status ni id', () => {
    const serialized = JSON.stringify(memoryTools.map((t) => t.inputSchema))
    assert.doesNotMatch(serialized, /source/)
    assert.doesNotMatch(serialized, /confidence/)
    assert.doesNotMatch(serialized, /status/)
    assert.doesNotMatch(serialized, /\bid\b/)
  })

  it('los handlers fijan el type y el runtime resuelve source/confidence', () => {
    const toolkit = createMemoryToolkit(dbPath, { source: 'agent:test', confidence: 0.5 })
    try {
      toolkit.handlers.recordRule({ memory_key: 'th-1', content: 'regla via tool', scope: 'repo' })
      toolkit.handlers.recordDecision({ memory_key: 'th-2', content: 'decision via tool', justification: 'porque si' })
      const rows = raw(`SELECT type, source, confidence FROM memory_nodes WHERE memory_key IN ('th-1','th-2') AND status = 'active'`)
      assert.equal(rows.length, 2)
      const rule = rows.find((r) => r.type === 'rule')
      const decision = rows.find((r) => r.type === 'decision')
      assert.equal(rule.source, 'agent:test')
      assert.equal(rule.confidence, 0.5)
      assert.equal(decision.source, 'agent:test')

      const found = toolkit.handlers.searchMemory({ query: 'via tool' })
      assert.equal(found.length, 2)
    } finally {
      toolkit.engine.close()
    }
  })

  it('campos forjados en los args de las tools son ignorados', () => {
    const toolkit = createMemoryToolkit(dbPath, { source: 'runtime-confiable' })
    try {
      toolkit.handlers.recordRule({ memory_key: 'th-forge', content: 'contenido limpio', source: 'LLM-FORGED', status: 'deleted', id: 'LLM-FORGED', confidence: 0 })
      const [row] = raw(`SELECT source, status, id, confidence FROM memory_nodes WHERE memory_key = 'th-forge' AND status = 'active'`)
      assert.equal(row.source, 'runtime-confiable')
      assert.equal(row.status, 'active')
      assert.equal(row.confidence, 1)
      assert.notEqual(row.id, 'LLM-FORGED')
    } finally {
      toolkit.engine.close()
    }
  })
})

describe('paths', () => {
  it('defaultMemoryDbPath resuelve .ancleto/memory.db desde el cwd', () => {
    assert.equal(defaultMemoryDbPath('/repo'), join('/repo', '.ancleto', 'memory.db'))
  })
})

describe('buildWorkingContext — XML y scopes (v0.3.0)', () => {
  it('genera XML bien formado con etiqueta de no confiables', () => {
    engine.recordNode({ memory_key: 'scope-proj-a', type: 'rule', scope: 'project', content: 'errores en espanol' })
    const block = engine.buildWorkingContext('project', undefined, dir)
    assert.equal(block.startsWith('<ProjectMemoryRules>'), true)
    assert.equal(block.endsWith('</ProjectMemoryRules>'), true)
    assert.match(block, /Datos no confiables/)
    assert.match(block, /- \[scope-proj-a\] errores en espanol/)
  })

  it('respeta scopes con jerarquia project < feature < task', () => {
    engine.recordNode({ memory_key: 'scope-proj-b', type: 'rule', scope: 'project', content: 'regla project' })
    engine.recordNode({ memory_key: 'scope-feat-b', type: 'rule', scope: 'feature', content: 'regla feature' })
    engine.recordNode({ memory_key: 'scope-task-b', type: 'rule', scope: 'task', content: 'regla task' })

    const proj = engine.buildWorkingContext('project', undefined, dir)
    assert.match(proj, /regla project/)
    assert.doesNotMatch(proj, /regla feature/)
    assert.doesNotMatch(proj, /regla task/)

    const feat = engine.buildWorkingContext('feature', undefined, dir)
    assert.match(feat, /regla feature/)
    assert.match(feat, /regla project/)
    assert.doesNotMatch(feat, /regla task/)

    const task = engine.buildWorkingContext('task', undefined, dir)
    assert.match(task, /regla task/)
    assert.match(task, /regla feature/)
    assert.match(task, /regla project/)
  })

  it('no mezcla decisiones dentro del working context', () => {
    engine.recordNode({ memory_key: 'scope-dec-c', type: 'decision', scope: 'project', content: 'decision project' })
    const block = engine.buildWorkingContext('project', undefined, dir)
    assert.doesNotMatch(block, /decision project/)
  })

  it('devuelve null para scope sin reglas activas', () => {
    assert.equal(engine.buildWorkingContext('scope-inexistente', undefined, dir), null)
  })
})

describe('buildWorkingContext — truncamiento (v0.3.0 item 2)', () => {
  function withEngine(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-trunc-'))
    const eng = createMemoryEngine(join(dir, 'memory.db'))
    try {
      return fn(eng, dir)
    } finally {
      eng.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('trunca reglas enteras (nunca corta strings) y el XML cierra correctamente', () => {
    withEngine((eng, dir) => {
      const c1 = 'A'.repeat(100)
      const c2 = 'B'.repeat(100)
      eng.recordNode({ memory_key: 'a1', type: 'rule', scope: 'project', content: c1 })
      eng.recordNode({ memory_key: 'a2', type: 'rule', scope: 'project', content: c2 })

      const block = eng.buildWorkingContext('project', 75, dir) // 300 chars: solo entra una regla
      assert.equal(block.startsWith('<ProjectMemoryRules>'), true)
      assert.equal(block.endsWith('</ProjectMemoryRules>'), true)
      assert.equal((block.match(/^- \[/gm) || []).length, 1)

      // exactamente una regla incluida en su totalidad; la otra omitida por completo (sin parcial)
      const hasA1 = block.includes(`- [a1] ${c1}`)
      const hasA2 = block.includes(`- [a2] ${c2}`)
      assert.equal(hasA1 !== hasA2, true)
      if (hasA1) assert.equal(block.includes(c2), false)
      else assert.equal(block.includes(c1), false)

      assert.match(block, /1 rules omitted/)
    })
  })

  it('inyecta ContextOverflowWarning con la cantidad correcta de reglas omitidas', () => {
    withEngine((eng, dir) => {
      for (let i = 1; i <= 3; i++) {
        eng.recordNode({ memory_key: `r${i}`, type: 'rule', scope: 'project', content: 'X'.repeat(60) })
      }
      const block = eng.buildWorkingContext('project', 60, dir) // 240 chars: 1 entra, 2 omitidas
      const m = block.match(/Context truncated due to size limits\. (\d+) rules omitted/)
      assert.ok(m, 'warning presente')
      assert.equal(m[1], '2')
      assert.equal((block.match(/^- \[/gm) || []).length, 1)
    })
  })

  it('el aviso de overflow delega un Recall a @memory-keeper y no nombra searchMemory', () => {
    withEngine((eng, dir) => {
      for (let i = 1; i <= 3; i++) {
        eng.recordNode({ memory_key: `w${i}`, type: 'rule', scope: 'project', content: 'X'.repeat(60) })
      }
      const block = eng.buildWorkingContext('project', 60, dir) // 240 chars: 1 entra, 2 omitidas
      // el prefijo y el conteo se conservan (contrato de las aserciones previas)
      assert.match(block, /Context truncated due to size limits\. (\d+) rules omitted/)
      assert.match(block, /@memory-keeper/)
      assert.match(block, /Recall/)
      assert.doesNotMatch(block, /searchMemory/, 'el aviso no debe nombrar una capacidad ajena al agente')
    })
  })

  it('prioriza task sobre project en la retencion con poco espacio', () => {
    withEngine((eng, dir) => {
      const projContent = 'P'.repeat(100)
      eng.recordNode({ memory_key: 'proj1', type: 'rule', scope: 'project', content: projContent })
      eng.recordNode({ memory_key: 'task1', type: 'rule', scope: 'task', content: 'TASK_SHORT' })

      const block = eng.buildWorkingContext('task', 50, dir) // 200 chars: solo task entra
      assert.ok(block.includes('- [task1] TASK_SHORT'))
      assert.equal(block.includes(projContent), false)
      assert.match(block, /1 rules omitted/)
    })
  })

  it('con limite muy chico no incluye reglas y el XML sigue valido', () => {
    withEngine((eng, dir) => {
      eng.recordNode({ memory_key: 'x1', type: 'rule', scope: 'project', content: 'contenido' })
      const block = eng.buildWorkingContext('project', 5, dir) // 20 chars < header: nada entra
      assert.equal(block.startsWith('<ProjectMemoryRules>'), true)
      assert.equal(block.endsWith('</ProjectMemoryRules>'), true)
      assert.equal((block.match(/^- \[/gm) || []).length, 0)
      assert.match(block, /1 rules omitted/)
    })
  })
})

describe('memory doctor (v0.3.0 item 4)', () => {
  function withDoctor(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-doc-'))
    try {
      return fn(join(dir, 'memory.db'))
    } finally {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      } catch {
        // best effort: en Windows los handles de WAL pueden tardar en liberarse
      }
    }
  }

  it('reporta sano en una DB integra', () => {
    withDoctor((dbPath) => {
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'd1', type: 'rule', scope: 'project', content: 'regla doctor' })
      eng.close()

      const result = memoryDoctor(dbPath)
      assert.equal(result.healthy, true)
      assert.equal(result.checks.length, 4)
      assert.ok(result.checks.every((c) => c.ok))
      const walCheck = result.checks.find((c) => c.name === 'Checkpoint WAL')
      assert.ok(walCheck && walCheck.ok)
      assert.equal(walCheck.skipped, true, 'el checkpoint no es verificable en read-only')
      const fts = result.checks.find((c) => c.name === 'Indice FTS5')
      assert.equal('skipped' in fts, false, 'el FTS no debe omitirse en read-only')
      assert.equal(fts.ok, true)
      assert.match(fts.detail, /1 filas indexadas/)
      assert.match(fts.detail, /1 nodos/)
      assert.match(fts.detail, /coincide con memory_nodes/)
    })
  })

  // Scenario "Forma del reporte retrocompatible": el contrato de forma es estable
  // para consumidores; `skipped` solo aparece en los checks omitidos.
  it('mantiene la forma {checks: [{name, ok, detail}], healthy, rebuilt} y skipped solo en omitidos', () => {
    withDoctor((dbPath) => {
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'shape-1', type: 'rule', scope: 'project', content: 'forma del reporte' })
      eng.close()

      const result = memoryDoctor(dbPath)

      for (const key of ['checks', 'healthy', 'rebuilt']) {
        assert.ok(key in result, `el reporte debe exponer ${key}`)
      }
      assert.equal(result.checks.length, 4, 'los cuatro checks se conservan')
      for (const check of result.checks) {
        assert.equal(typeof check.name, 'string', 'cada check expone name')
        assert.equal(typeof check.ok, 'boolean', `${check.name}: ok debe ser booleano`)
        assert.equal(typeof check.detail, 'string', `${check.name}: cada check expone detail`)
      }

      const omitted = result.checks.filter((c) => c.skipped === true)
      assert.deepEqual(omitted.map((c) => c.name), ['Checkpoint WAL'], 'en read-only solo se omite el checkpoint')
      const fts = result.checks.find((c) => c.name === 'Indice FTS5')
      assert.equal('skipped' in fts, false, 'un check verificado no expone skipped')
    })
  })

  it('detecta la desalineacion FTS en default y --rebuild la repara', () => {
    withDoctor((dbPath) => {
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'd2', type: 'rule', scope: 'project', content: 'contenido doctor' })
      eng.close()

      // corrupcion realista: trigger removido -> nodo insertado sin indexar
      const db = openDatabase(dbPath)
      db.exec('DROP TRIGGER memory_fts_ai')
      db.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
        VALUES ('raw-1', 'raw-key', 'rule', 'project', 'active', 'nodo sin indexar', '', 'test', 1, ?)`).run(new Date().toISOString())
      db.close()

      // G1: el default no puede correr el integrity-check, pero si comparar filas
      // indexadas contra nodos; el desalineado es una falla, no un skip.
      const before = memoryDoctor(dbPath)
      assert.equal(before.healthy, false)
      assert.equal(before.checks[1].ok, false)
      assert.equal('skipped' in before.checks[1], false)
      assert.match(before.checks[1].detail, /1 filas indexadas/)
      assert.match(before.checks[1].detail, /2 nodos/)
      assert.match(before.checks[1].detail, /--rebuild/)
      assert.equal(before.rebuilt, false)

      const after = memoryDoctor(dbPath, { rebuild: true })
      assert.equal(after.healthy, true)
      assert.equal(after.rebuilt, true)
      assert.equal(after.checks[1].ok, true)
      assert.equal('skipped' in after.checks[1], false)

      const eng2 = createMemoryEngine(dbPath)
      assert.equal(eng2.searchMemory({ query: 'indexar' }).length, 1)
      eng2.close()
    })
  })

  it('detecta mas de una activa por memory_key', () => {
    withDoctor((dbPath) => {
      const eng = createMemoryEngine(dbPath)
      eng.recordNode({ memory_key: 'd3', type: 'rule', scope: 'project', content: 'duplicada' })
      eng.close()

      const db = openDatabase(dbPath)
      db.exec('DROP INDEX idx_memory_nodes_key_active')
      db.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
        VALUES ('dup-1', 'd3', 'rule', 'project', 'active', 'duplicada 2', '', 'test', 1, ?)`).run(new Date().toISOString())
      db.close()

      const result = memoryDoctor(dbPath)
      assert.equal(result.healthy, false)
      assert.equal(result.checks[2].ok, false)
      assert.match(result.checks[2].detail, /d3/)
    })
  })
})

describe('buildWorkingContext — inyeccion de topologia (D3)', () => {
  function withTopologyEngine(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-topo-'))
    const eng = createMemoryEngine(join(dir, 'memory.db'))
    try {
      return fn(eng, dir)
    } finally {
      eng.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }

  function seedMap(dir) {
    writeFileSync(join(dir, '.discovery-map.json'), JSON.stringify({
      last_updated: new Date().toISOString(),
      total_files: 5,
      tree_summary: { src: 2, docs: 1 },
      root_files: ['README.md']
    }, null, 2) + '\n')
  }

  it('inyecta <ProjectTopology> antes de <ProjectMemoryRules> si el JSON existe', () => {
    withTopologyEngine((eng, dir) => {
      seedMap(dir)
      eng.recordNode({ memory_key: 'd3-rule', type: 'rule', scope: 'project', content: 'regla de prueba' })
      const block = eng.buildWorkingContext('project', 2000, dir)
      assert.equal(block.startsWith('<ProjectTopology>'), true)
      assert.match(block, /Total files: 5/)
      assert.match(block, /- docs: 1/)
      assert.match(block, /- src: 2/)
      assert.match(block, /Datos no confiables/)
      const memoryIdx = block.indexOf('<ProjectMemoryRules>')
      const topoIdx = block.indexOf('<ProjectTopology>')
      assert.ok(topoIdx >= 0 && memoryIdx > topoIdx)
      assert.match(block, /- \[d3-rule\] regla de prueba/)
      assert.equal(block.endsWith('</ProjectMemoryRules>'), true)
    })
  })

  it('no crashea y devuelve el contexto normal si el JSON no existe', () => {
    withTopologyEngine((eng, dir) => {
      eng.recordNode({ memory_key: 'd3-rule-2', type: 'rule', scope: 'project', content: 'sin topologia' })
      const block = eng.buildWorkingContext('project', 2000, dir)
      assert.doesNotMatch(block, /<ProjectTopology>/)
      assert.equal(block.startsWith('<ProjectMemoryRules>'), true)
      assert.match(block, /- \[d3-rule-2\] sin topologia/)
    })
  })

  it('Day Zero Context: BD vacia con mapa devuelve solo topologia (no null)', () => {
    withTopologyEngine((eng, dir) => {
      seedMap(dir)
      const block = eng.buildWorkingContext('project', 2000, dir)
      assert.notEqual(block, null)
      assert.equal(block.startsWith('<ProjectTopology>'), true)
      assert.match(block, /Total files: 5/)
      assert.match(block, /- src: 2/)
      assert.doesNotMatch(block, /<ProjectMemoryRules>/)
    })
  })

  it('no crashea con JSON corrupto', () => {
    withTopologyEngine((eng, dir) => {
      writeFileSync(join(dir, '.discovery-map.json'), '{corrupto')
      eng.recordNode({ memory_key: 'd3-rule-3', type: 'rule', scope: 'project', content: 'json roto' })
      const block = eng.buildWorkingContext('project', 2000, dir)
      assert.doesNotMatch(block, /<ProjectTopology>/)
      assert.equal(block.startsWith('<ProjectMemoryRules>'), true)
    })
  })
})

// memory-ops-export-import-gc: T7/T8/T9 — engine.exportActive / importNodes / gcSuperseded.
function withFreshEngine(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-memops-'))
  const dbPath = join(dir, '.ancleto', 'memory.db')
  const eng = createMemoryEngine(dbPath)
  // Local raw helper: el del scope superior esta cerrado sobre el dbPath del
  // engine principal, no sobre este. Sin esto las aserciones leerian la BD vieja.
  const rawAt = (sql, ...params) => {
    const db = openDatabase(dbPath)
    try {
      return db.prepare(sql).all(...params)
    } finally {
      db.close()
    }
  }
  try {
    return fn(eng, dbPath, rawAt)
  } finally {
    eng.close()
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort: en Windows los handles de WAL pueden tardar en liberarse
      // tras VACUUM; el tmpdir se limpia solo en el siguiente reinicio.
    }
  }
}

describe('exportActive', () => {
  it('exporta solo nodos activos con los campos del formato', () => {
    withFreshEngine((eng, _dbPath, _rawAt) => {
      eng.recordNode({ memory_key: 'ex-a', type: 'rule', scope: 'project', content: 'regla uno', justification: 'porque uno' })
      eng.recordNode({ memory_key: 'ex-b', type: 'decision', scope: 'project', content: 'decision uno', justification: 'porque dos' })
      eng.recordNode({ memory_key: 'ex-c', type: 'rule', scope: 'project', content: 'regla que se retira' })
      eng.recordNode({ memory_key: 'ex-c', type: 'rule', scope: 'project', content: 'regla vigente' }) // supersede de ex-c anterior

      const exported = eng.exportActive()
      const keys = exported.map((n) => n.memory_key).sort()
      assert.deepEqual(keys, ['ex-a', 'ex-b', 'ex-c'])
      for (const n of exported) {
        assert.deepEqual(Object.keys(n).sort(), ['content', 'createdAt', 'justification', 'memory_key', 'scope', 'type'])
        assert.equal(n.content.includes('<redacted'), false)
      }
      assert.equal(exported.find((n) => n.memory_key === 'ex-c').content, 'regla vigente')
    })
  })

  it('sanitiza paths absolutos en content y justification', () => {
    withFreshEngine((eng, _dbPath, _rawAt) => {
      eng.recordNode({ memory_key: 'ex-path', type: 'rule', scope: 'project', content: 'ver C:\\Users\\damia\\repo y /home/user/secret', justification: 'o /Users/alice/work' })
      const exported = eng.exportActive()
      const node = exported.find((n) => n.memory_key === 'ex-path')
      assert.equal(node.content.includes('C:\\Users\\damia\\repo'), false)
      assert.equal(node.content.includes('/home/user/secret'), false)
      assert.equal(node.justification.includes('/Users/alice/work'), false)
      assert.match(node.content, /<redacted>/)
      assert.match(node.justification, /<redacted>/)
    })
  })
})

describe('importNodes', () => {
  it('importa en BD vacia: los 3 nodos quedan activos con el createdAt del JSON', () => {
    withFreshEngine((eng, _dbPath, rawAt) => {
      const payload = [
        { memory_key: 'imp-a', type: 'rule', scope: 'project', content: 'uno', justification: '', createdAt: '2026-09-01T10:00:00.000Z' },
        { memory_key: 'imp-b', type: 'decision', scope: 'feature', content: 'dos', justification: 'j', createdAt: '2026-09-02T10:00:00.000Z' },
        { memory_key: 'imp-c', type: 'rule', scope: 'task', content: 'tres', justification: '', createdAt: '2026-09-03T10:00:00.000Z' }
      ]
      const summary = eng.importNodes(payload)
      assert.deepEqual(summary, { inserted: 3, updated: 0, skipped: 0 })
      const nodes = rawAt(`SELECT memory_key, status, created_at FROM memory_nodes WHERE memory_key LIKE 'imp-%' AND status = 'active' ORDER BY memory_key`)
      assert.equal(nodes.length, 3)
      assert.equal(nodes[0].created_at, '2026-09-01T10:00:00.000Z')
      assert.equal(nodes[1].created_at, '2026-09-02T10:00:00.000Z')
      assert.equal(nodes[2].created_at, '2026-09-03T10:00:00.000Z')
    })
  })

  it('es idempotente: importar dos veces deja el mismo estado', () => {
    withFreshEngine((eng, _dbPath, rawAt) => {
      const payload = [
        { memory_key: 'imp-idem', type: 'rule', scope: 'project', content: 'estable', justification: 'j', createdAt: '2026-09-01T10:00:00.000Z' }
      ]
      eng.importNodes(payload)
      eng.importNodes(payload)
      const nodes = rawAt(`SELECT created_at, content, justification FROM memory_nodes WHERE memory_key = 'imp-idem' AND status = 'active'`)
      assert.equal(nodes.length, 1)
      assert.equal(nodes[0].content, 'estable')
      assert.equal(nodes[0].created_at, '2026-09-01T10:00:00.000Z')
    })
  })

  it('upsert: createdAt mas reciente supersede el existente', () => {
    withFreshEngine((eng, _dbPath, rawAt) => {
      eng.recordNode({ memory_key: 'imp-up', type: 'rule', scope: 'project', content: 'viejo' })
      const payload = [
        { memory_key: 'imp-up', type: 'rule', scope: 'project', content: 'nuevo', justification: '', createdAt: '2099-01-01T00:00:00.000Z' }
      ]
      eng.importNodes(payload)
      const active = rawAt(`SELECT content, created_at FROM memory_nodes WHERE memory_key = 'imp-up' AND status = 'active'`)
      const superseded = rawAt(`SELECT COUNT(*) AS c FROM memory_nodes WHERE memory_key = 'imp-up' AND status = 'superseded'`)
      assert.equal(active.length, 1)
      assert.equal(active[0].content, 'nuevo')
      assert.equal(active[0].created_at, '2099-01-01T00:00:00.000Z')
      assert.equal(superseded[0].c, 1)
    })
  })

  it('upsert: createdAt mas antiguo o igual no sobrescribe', () => {
    withFreshEngine((eng, dbPath, rawAt) => {
      // inserta un nodo con createdAt FUTURO para forzar "existente mas reciente"
      const db = openDatabase(dbPath)
      db.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
        VALUES ('imp-old-fixed', 'imp-keep', 'rule', 'project', 'active', 'futuro', '', 'test', 1, ?)`).run('2099-01-01T00:00:00.000Z')
      db.close()

      const payload = [
        { memory_key: 'imp-keep', type: 'rule', scope: 'project', content: 'pasado', justification: '', createdAt: '2020-01-01T00:00:00.000Z' }
      ]
      const summary = eng.importNodes(payload)
      assert.deepEqual(summary, { inserted: 0, updated: 0, skipped: 1 })
      const active = rawAt(`SELECT content, created_at FROM memory_nodes WHERE memory_key = 'imp-keep' AND status = 'active'`)
      assert.equal(active.length, 1)
      assert.equal(active[0].content, 'futuro')
    })
  })

  it('NO reactiva nodos superseded (decision aprobada): los deja como historia', () => {
    withFreshEngine((eng, dbPath, rawAt) => {
      // Solo hay un nodo superseded (no activo). El import NO debe traerlo a activo.
      const db = openDatabase(dbPath)
      db.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
        VALUES ('rev-sup-1', 'imp-rev', 'rule', 'project', 'superseded', 'viejo superseded', '', 'test', 1, ?)`).run('2020-01-01T00:00:00.000Z')
      db.close()

      const payload = [
        { memory_key: 'imp-rev', type: 'rule', scope: 'project', content: 'revivir', justification: '', createdAt: '2099-01-01T00:00:00.000Z' }
      ]
      const summary = eng.importNodes(payload)
      // La decision aprobada dice "no reactivar superseded": se cuenta como skipped.
      assert.equal(summary.skipped, 1)
      assert.equal(summary.inserted, 0)
      const states = rawAt(`SELECT status, content FROM memory_nodes WHERE memory_key = 'imp-rev' ORDER BY rowid`)
      assert.equal(states.length, 1)
      assert.equal(states[0].status, 'superseded')
      assert.equal(states[0].content, 'viejo superseded')
    })
  })

  it('entrada invalida aborta el batch sin insertar nada', () => {
    withFreshEngine((eng, _dbPath, rawAt) => {
      const payload = [
        { memory_key: 'imp-good', type: 'rule', scope: 'project', content: 'ok', justification: '', createdAt: '2026-09-01T10:00:00.000Z' },
        { type: 'rule', scope: 'project', content: 'falta memory_key', createdAt: '2026-09-02T10:00:00.000Z' }
      ]
      assert.throws(() => eng.importNodes(payload), /entry\[1\] invalida: falta campo obligatorio "memory_key"/)
      // el batch entero se aborta: imp-good NO esta presente.
      const rows = rawAt(`SELECT COUNT(*) AS c FROM memory_nodes WHERE memory_key = 'imp-good'`)
      assert.equal(rows[0].c, 0)
    })
  })

  it('valida que createdAt sea parseable', () => {
    withFreshEngine((eng, _dbPath, _rawAt) => {
      assert.throws(
        () => eng.importNodes([{ memory_key: 'imp-bad-ts', type: 'rule', scope: 'project', content: 'x', createdAt: 'no-es-fecha' }]),
        /createdAt invalido/
      )
    })
  })

  it('rechaza type invalido', () => {
    withFreshEngine((eng, _dbPath, _rawAt) => {
      assert.throws(
        () => eng.importNodes([{ memory_key: 'imp-bad-type', type: 'otro', scope: 'project', content: 'x', createdAt: '2026-01-01T00:00:00.000Z' }]),
        /type invalido/
      )
    })
  })

  it("persiste source = 'cli:import' en el insert y en el upsert", () => {
    withFreshEngine((eng, _dbPath, rawAt) => {
      eng.importNodes([
        { memory_key: 'imp-src', type: 'rule', scope: 'project', content: 'insertado', justification: '', createdAt: '2026-09-01T10:00:00.000Z' }
      ])
      const inserted = rawAt(`SELECT source, content FROM memory_nodes WHERE memory_key = 'imp-src' AND status = 'active'`)
      assert.equal(inserted.length, 1)
      assert.equal(inserted[0].source, 'cli:import')
      assert.equal(inserted[0].content, 'insertado')

      eng.importNodes([
        { memory_key: 'imp-src', type: 'rule', scope: 'project', content: 'actualizado', justification: '', createdAt: '2026-10-01T10:00:00.000Z' }
      ])
      const updated = rawAt(`SELECT source, content FROM memory_nodes WHERE memory_key = 'imp-src' AND status = 'active'`)
      assert.equal(updated.length, 1)
      assert.equal(updated[0].source, 'cli:import')
      assert.equal(updated[0].content, 'actualizado')

      const superseded = rawAt(`SELECT source FROM memory_nodes WHERE memory_key = 'imp-src' AND status = 'superseded'`)
      assert.equal(superseded.length, 1)
      assert.equal(superseded[0].source, 'cli:import')
    })
  })
})

describe('gcSuperseded', () => {
  function insertSuperseded(dbPath, id, memory_key, daysAgo) {
    const db = openDatabase(dbPath)
    // Simulamos "superseded hace N dias" usando created_at antiguo.
    // El schema no expone superseded_at, asi que created_at es el proxy temporal.
    const ts = new Date(Date.now() - daysAgo * 86400000).toISOString()
    db.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
      VALUES (?, ?, 'rule', 'project', 'superseded', 'historia', '', 'test', 1, ?)`).run(`${id}-old`, `${memory_key}-old`, ts)
    db.close()
  }

  it('purga solo superseded con antiguedad mayor al umbral', () => {
    withFreshEngine((eng, dbPath, rawAt) => {
      insertSuperseded(dbPath, 'gc1', 'gc-1', 40)
      insertSuperseded(dbPath, 'gc2', 'gc-2', 10)
      const result = eng.gcSuperseded({ days: 30 })
      assert.equal(result.dryRun, false)
      assert.equal(result.days, 30)
      assert.equal(result.removed, 1)
      const remaining = rawAt(`SELECT COUNT(*) AS c FROM memory_nodes WHERE status = 'superseded'`)
      assert.equal(remaining[0].c, 1)
    })
  })

  it('no toca nodos activos', () => {
    withFreshEngine((eng, dbPath, rawAt) => {
      insertSuperseded(dbPath, 'gc3', 'gc-act', 365)
      eng.recordNode({ memory_key: 'gc-act', type: 'rule', scope: 'project', content: 'version nueva' })
      // Tambien un nodo active con created_at muy antiguo, fuera del umbral.
      const db = openDatabase(dbPath)
      db.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
        VALUES ('gc-act-old-2', 'gc-act2', 'rule', 'project', 'active', 'activo viejo', '', 'test', 1, ?)`).run(new Date(Date.now() - 365 * 86400000).toISOString())
      db.close()

      const result = eng.gcSuperseded({ days: 30 })
      // Solo se purga el superseded de hace 365 dias. El active viejo NO.
      assert.equal(result.removed, 1)
      const activeCount = rawAt(`SELECT COUNT(*) AS c FROM memory_nodes WHERE status = 'active'`)
      assert.equal(activeCount[0].c, 2)
    })
  })

  it('dryRun reporta sin borrar', () => {
    withFreshEngine((eng, dbPath, rawAt) => {
      insertSuperseded(dbPath, 'gc4', 'gc-d1', 40)
      insertSuperseded(dbPath, 'gc5', 'gc-d2', 35)
      const result = eng.gcSuperseded({ days: 30, dryRun: true })
      assert.equal(result.dryRun, true)
      assert.equal(result.days, 30)
      assert.equal(result.nodes, 2)
      assert.ok(result.estimated_bytes > 0)
      const remaining = rawAt(`SELECT COUNT(*) AS c FROM memory_nodes WHERE status = 'superseded'`)
      assert.equal(remaining[0].c, 2)
    })
  })

  it('usa default 30 dias cuando opts.days no se pasa', () => {
    withFreshEngine((eng, dbPath, _rawAt) => {
      insertSuperseded(dbPath, 'gc6', 'gc-def-1', 31)
      insertSuperseded(dbPath, 'gc7', 'gc-def-2', 5)
      const result = eng.gcSuperseded()
      assert.equal(result.days, 30)
      assert.equal(result.removed, 1)
    })
  })
})

// PR-1: contrato del merge. `merge({ target, sources, dryRun })` supersede cada
// source activa hacia el target en una unica transaccion y reporta
// `{ dryRun, target, sources, superseded }`.
describe('merge (PR-1)', () => {
  function hashFile(file) {
    return createHash('sha256').update(readFileSync(file)).digest('hex')
  }

  it('dry-run con 1 target y 2 sources no escribe nada y reporta el plan', () => {
    withFreshEngine((eng, dbPath, rawAt) => {
      eng.recordNode({ memory_key: 'k-target', type: 'rule', scope: 'project', content: 'target vigente' })
      eng.recordNode({ memory_key: 'k-src-1', type: 'rule', scope: 'project', content: 'source uno' })
      eng.recordNode({ memory_key: 'k-src-2', type: 'rule', scope: 'project', content: 'source dos' })

      const selectStates = () => rawAt(
        `SELECT memory_key, status, superseded_by FROM memory_nodes
         WHERE memory_key IN ('k-target', 'k-src-1', 'k-src-2') ORDER BY memory_key`
      )
      const statesBefore = selectStates()
      const dbBefore = hashFile(dbPath)
      const walPath = `${dbPath}-wal`
      const walBefore = existsSync(walPath) ? hashFile(walPath) : null
      assert.ok(existsSync(walPath) && statSync(walPath).size > 0, 'la fixture debe tener WAL activo')

      const plan = eng.merge({ target: 'k-target', sources: ['k-src-1', 'k-src-2'], dryRun: true })

      assert.equal(plan.dryRun, true)
      assert.equal(plan.target, 'k-target')
      assert.deepEqual([...plan.sources].sort(), ['k-src-1', 'k-src-2'])
      assert.equal(plan.superseded, 2, 'debe reportar cuantos nodos se supersederian')
      assert.deepEqual(selectStates(), statesBefore, 'el dry-run no cambia estados ni superseded_by')
      assert.equal(hashFile(dbPath), dbBefore, 'el dry-run no escribe el .db')
      assert.equal(existsSync(walPath) ? hashFile(walPath) : null, walBefore, 'el dry-run no escribe el -wal')
    })
  })

  it('merge real crea el vinculo, no toca el target ni el schema y respeta nodos ajenos', () => {
    withFreshEngine((eng, _dbPath, rawAt) => {
      eng.recordNode({ memory_key: 'node-test-scope-explicit-paths', type: 'rule', scope: 'project', content: 'intacta' })
      eng.recordNode({ memory_key: 'm-target', type: 'rule', scope: 'project', content: 'target vigente' })
      eng.recordNode({ memory_key: 'm-src-1', type: 'rule', scope: 'project', content: 'source uno' })
      eng.recordNode({ memory_key: 'm-src-2', type: 'rule', scope: 'project', content: 'source dos' })

      const targetBefore = rawAt(`SELECT id, status, content, superseded_by FROM memory_nodes WHERE memory_key = 'm-target'`)
      const otherBefore = rawAt(`SELECT status, superseded_by FROM memory_nodes WHERE memory_key = 'node-test-scope-explicit-paths'`)
      const schemaBefore = rawAt(`SELECT type, name, sql FROM sqlite_master ORDER BY type, name`)

      const result = eng.merge({ target: 'm-target', sources: ['m-src-1', 'm-src-2'] })
      assert.deepEqual(result, { dryRun: false, target: 'm-target', sources: ['m-src-1', 'm-src-2'], superseded: 2 })

      const targetId = targetBefore[0].id
      const sources = rawAt(`SELECT memory_key, status, superseded_by FROM memory_nodes
        WHERE memory_key IN ('m-src-1', 'm-src-2') ORDER BY memory_key`)
      assert.equal(sources.length, 2)
      for (const source of sources) {
        assert.equal(source.status, 'superseded')
        assert.equal(source.superseded_by, targetId)
      }
      assert.deepEqual(
        rawAt(`SELECT id, status, content, superseded_by FROM memory_nodes WHERE memory_key = 'm-target'`),
        targetBefore,
        'el target queda activo y con el mismo contenido'
      )
      assert.deepEqual(
        rawAt(`SELECT status, superseded_by FROM memory_nodes WHERE memory_key = 'node-test-scope-explicit-paths'`),
        otherBefore,
        'un nodo no nombrado no cambia'
      )
      assert.deepEqual(
        rawAt(`SELECT type, name, sql FROM sqlite_master ORDER BY type, name`),
        schemaBefore,
        'sqlite_master debe ser identico antes y despues'
      )
      assert.equal(rawAt(`SELECT COUNT(*) AS c FROM sqlite_master WHERE name = 'memory_refs'`)[0].c, 0)
    })
  })

  it('fail-closed: un target o una source invalida no modifican ninguna fila', () => {
    withFreshEngine((eng, dbPath, rawAt) => {
      eng.recordNode({ memory_key: 'fc-target', type: 'rule', scope: 'project', content: 'target' })
      eng.recordNode({ memory_key: 'fc-src-1', type: 'rule', scope: 'project', content: 'uno' })
      eng.recordNode({ memory_key: 'fc-src-2', type: 'rule', scope: 'project', content: 'dos' })
      // Una source que solo existe en estado superseded (historia sin activa).
      const seed = openDatabase(dbPath)
      seed.prepare(`INSERT INTO memory_nodes (id, memory_key, type, scope, status, content, justification, source, confidence, created_at)
        VALUES ('fc-sup-old', 'fc-src-sup', 'rule', 'project', 'superseded', 'viejo', '', 'test', 1, ?)`).run(new Date().toISOString())
      seed.close()

      const snapshot = () => rawAt(`SELECT memory_key, status, superseded_by FROM memory_nodes ORDER BY rowid`)
      const before = snapshot()

      assert.throws(() => eng.merge({ target: 'fc-missing', sources: ['fc-src-1'] }), /fc-missing/)
      assert.throws(() => eng.merge({ target: 'fc-target', sources: ['fc-nope'] }), /fc-nope/)
      assert.throws(() => eng.merge({ target: 'fc-target', sources: ['fc-src-sup'] }), /fc-src-sup/)
      assert.throws(() => eng.merge({ target: 'fc-target', sources: ['fc-src-1', 'fc-src-1'] }), /fc-src-1/)
      assert.throws(() => eng.merge({ target: 'fc-target', sources: ['fc-target'] }), /fc-target/)
      assert.throws(() => eng.merge({ target: 'fc-target', sources: ['fc-nope'], dryRun: true }), /fc-nope/)

      assert.deepEqual(snapshot(), before, 'ninguna fila se modifica ante un rechazo')
    })
  })

  it('rechaza types distintos entre target y source sin modificar filas (G4)', () => {
    withFreshEngine((eng, _dbPath, rawAt) => {
      eng.recordNode({ memory_key: 'tm-target', type: 'rule', scope: 'project', content: 'target rule' })
      eng.recordNode({ memory_key: 'tm-src-rule', type: 'rule', scope: 'project', content: 'source rule' })
      eng.recordNode({ memory_key: 'tm-src-dec', type: 'decision', scope: 'project', content: 'source decision' })

      const snapshot = () => rawAt(`SELECT memory_key, type, status, superseded_by FROM memory_nodes ORDER BY rowid`)
      const before = snapshot()

      assert.throws(
        () => eng.merge({ target: 'tm-target', sources: ['tm-src-rule', 'tm-src-dec'] }),
        (err) => {
          assert.match(err.message, /tm-target/)
          assert.match(err.message, /rule/)
          assert.match(err.message, /tm-src-dec/)
          assert.match(err.message, /decision/)
          return true
        }
      )

      assert.deepEqual(snapshot(), before, 'ninguna fila cambia de estado ante el type mismatch')
    })
  })

  // `merge` revalida target y sources dentro de `BEGIN IMMEDIATE`. Esta rama de
  // ROLLBACK se ejercita sin seam de produccion: un trigger hace que la segunda
  // source deje de estar activa entre el UPDATE de la primera y el suyo.
  it('rollback: una source que deja de estar activa dentro de la transaccion no supersede a nadie', () => {
    withFreshEngine((eng, dbPath, rawAt) => {
      eng.recordNode({ memory_key: 'rb-target', type: 'rule', scope: 'project', content: 'target' })
      eng.recordNode({ memory_key: 'rb-src-1', type: 'rule', scope: 'project', content: 'uno' })
      eng.recordNode({ memory_key: 'rb-src-2', type: 'rule', scope: 'project', content: 'dos' })

      const ids = Object.fromEntries(
        rawAt(`SELECT memory_key, id FROM memory_nodes
          WHERE memory_key IN ('rb-src-1', 'rb-src-2')`).map((row) => [row.memory_key, row.id])
      )

      const seed = openDatabase(dbPath)
      try {
        seed.exec(`CREATE TRIGGER rb_deactivate_second AFTER UPDATE OF status ON memory_nodes
          WHEN NEW.id = '${ids['rb-src-1']}' AND NEW.status = 'superseded'
          BEGIN
            UPDATE memory_nodes SET status = 'superseded', superseded_by = NEW.superseded_by
              WHERE id = '${ids['rb-src-2']}' AND status = 'active';
          END`)
      } finally {
        seed.close()
      }

      assert.throws(
        () => eng.merge({ target: 'rb-target', sources: ['rb-src-1', 'rb-src-2'] }),
        /una source dejo de estar activa durante la transaccion/
      )

      const after = rawAt(`SELECT memory_key, status, superseded_by FROM memory_nodes
        WHERE memory_key IN ('rb-target', 'rb-src-1', 'rb-src-2') ORDER BY memory_key`)
      assert.equal(after.length, 3)
      for (const row of after) {
        assert.equal(row.status, 'active', `${row.memory_key} debe seguir activo tras el ROLLBACK`)
        assert.equal(row.superseded_by, null, `${row.memory_key} no debe quedar vinculado tras el ROLLBACK`)
      }
    })
  })
})

const CLI_PATH = fileURLToPath(new URL('../src/cli/index.js', import.meta.url))

function withCliFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-memcli-'))
  const dbPath = join(dir, '.ancleto', 'memory.db')
  const engine = createMemoryEngine(dbPath)
  let closed = false
  const close = () => {
    if (closed) return
    engine.close()
    closed = true
  }
  const rawAt = (sql, ...params) => {
    const db = openDatabase(dbPath)
    try {
      return db.prepare(sql).all(...params)
    } finally {
      db.close()
    }
  }
  try {
    return fn({ dir, dbPath, engine, close, rawAt })
  } finally {
    try {
      close()
    } catch {
      // best effort
    }
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort: en Windows los handles de WAL pueden tardar en liberarse
    }
  }
}

function runCli(cwd, args) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], { cwd, encoding: 'utf8' })
}

function sha(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex')
}

describe('memory snapshot (CLI)', () => {
  it('sin --out sale con codigo != 0 y muestra el uso', () => {
    withCliFixture(({ dir, close }) => {
      close()
      const r = runCli(dir, ['memory', 'snapshot'])
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /uso: ancleto memory snapshot --out/)
    })
  })

  it('--json imprime {out, bytes} y crea el snapshot', () => {
    withCliFixture(({ dir, engine, close }) => {
      engine.recordNode({ memory_key: 'snap-cli', type: 'rule', scope: 'project', content: 'snapshot cli' })
      close()
      const out = join(dir, 'backup.db')
      const r = runCli(dir, ['memory', 'snapshot', '--out', out, '--json'])
      assert.equal(r.status, 0, r.stderr)
      const payload = JSON.parse(r.stdout)
      assert.equal(payload.out, out)
      assert.ok(payload.bytes > 0)
      assert.equal(statSync(out).size, payload.bytes)
    })
  })

  it('destino existente sin --force falla, nombra la ruta y no lo toca', () => {
    withCliFixture(({ dir, engine, close }) => {
      engine.recordNode({ memory_key: 'snap-cli', type: 'rule', scope: 'project', content: 'snapshot cli' })
      close()
      const out = join(dir, 'existing.db')
      writeFileSync(out, 'no tocar')
      const r = runCli(dir, ['memory', 'snapshot', '--out', out])
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /existing\.db/)
      assert.equal(readFileSync(out, 'utf8'), 'no tocar')
    })
  })

  it('--force reemplaza un destino existente por un snapshot valido', () => {
    withCliFixture(({ dir, engine, close }) => {
      engine.recordNode({ memory_key: 'snap-cli', type: 'rule', scope: 'project', content: 'snapshot cli' })
      close()
      const out = join(dir, 'existing.db')
      writeFileSync(out, 'stale')
      const r = runCli(dir, ['memory', 'snapshot', '--out', out, '--force'])
      assert.equal(r.status, 0, r.stderr)
      const db = openDatabase(out, { migrate: false })
      try {
        assert.equal(db.prepare('PRAGMA quick_check').get().quick_check, 'ok')
      } finally {
        db.close()
      }
    })
  })

  it('--out seguido de otro flag cuenta como faltante y no crea un archivo con ese nombre', () => {
    withCliFixture(({ dir, close }) => {
      close()
      const r = runCli(dir, ['memory', 'snapshot', '--out', '--force'])
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /uso: ancleto memory snapshot --out/)
      assert.equal(existsSync(join(dir, '--force')), false)
    })
  })

  it('target == source falla sin escribir y nombra el conflicto', () => {
    withCliFixture(({ dir, dbPath, engine, close }) => {
      engine.recordNode({ memory_key: 'snap-cli', type: 'rule', scope: 'project', content: 'snapshot cli' })
      close()
      const before = sha(dbPath)
      const r = runCli(dir, ['memory', 'snapshot', '--out', dbPath])
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /fuente/)
      assert.equal(sha(dbPath), before)
    })
  })
})

describe('memory merge (CLI)', () => {
  function seedMergeFixture({ dir, engine, rawAt }) {
    engine.recordNode({ memory_key: 'node-test-scope-explicit-paths', type: 'rule', scope: 'project', content: 'intacta' })
    engine.recordNode({ memory_key: 'cli-target', type: 'rule', scope: 'project', content: 'target vigente' })
    engine.recordNode({ memory_key: 'cli-src-1', type: 'rule', scope: 'project', content: 'source uno' })
    engine.recordNode({ memory_key: 'cli-src-2', type: 'rule', scope: 'project', content: 'source dos' })
    const ctxPath = join(dir, '.ancleto', 'working-context.md')
    writeFileSync(ctxPath, engine.buildWorkingContext('project', undefined, dir) + '\n')
    const targetId = rawAt(`SELECT id FROM memory_nodes WHERE memory_key = 'cli-target'`)[0].id
    return { ctxPath, targetId }
  }

  // cwd del CLI != raiz del proyecto derivada de la DB: la raiz se resuelve por
  // el `.ancletorc` ancestro, asi el test distingue process.cwd() de
  // resolveMemoryProjectRoot(dbPath).
  function withNestedCliFixture(fn) {
    const base = mkdtempSync(join(tmpdir(), 'ancleto-memcli-cwd-'))
    const projectRoot = join(base, 'project')
    const cwd = join(projectRoot, 'nested')
    const dbPath = join(cwd, '.ancleto', 'memory.db')
    mkdirSync(projectRoot, { recursive: true })
    writeFileSync(join(projectRoot, '.ancletorc'), '{}\n')
    const engine = createMemoryEngine(dbPath)
    let closed = false
    const close = () => {
      if (closed) return
      engine.close()
      closed = true
    }
    const rawAt = (sql, ...params) => {
      const db = openDatabase(dbPath)
      try {
        return db.prepare(sql).all(...params)
      } finally {
        db.close()
      }
    }
    try {
      return fn({ projectRoot, cwd, dbPath, engine, close, rawAt })
    } finally {
      try {
        close()
      } catch {
        // best effort
      }
      try {
        rmSync(base, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
      } catch {
        // best effort: en Windows los handles de WAL pueden tardar en liberarse
      }
    }
  }

  it('merge real supersede cada source, conserva el target y refresca el working-context bajo la raiz de la DB', () => {
    withNestedCliFixture(({ projectRoot, cwd, engine, close, rawAt }) => {
      engine.recordNode({ memory_key: 'node-test-scope-explicit-paths', type: 'rule', scope: 'project', content: 'intacta' })
      engine.recordNode({ memory_key: 'cli-target', type: 'rule', scope: 'project', content: 'target vigente' })
      engine.recordNode({ memory_key: 'cli-src-1', type: 'rule', scope: 'project', content: 'source uno' })
      engine.recordNode({ memory_key: 'cli-src-2', type: 'rule', scope: 'project', content: 'source dos' })

      const projectCtx = join(projectRoot, '.ancleto', 'working-context.md')
      const cwdCtx = join(cwd, '.ancleto', 'working-context.md')
      mkdirSync(dirname(projectCtx), { recursive: true })
      writeFileSync(projectCtx, engine.buildWorkingContext('project', undefined, projectRoot) + '\n')
      const targetId = rawAt(`SELECT id FROM memory_nodes WHERE memory_key = 'cli-target'`)[0].id
      const schemaBefore = rawAt(`SELECT type, name, sql FROM sqlite_master ORDER BY type, name`)
      const targetBefore = rawAt(`SELECT status, content, superseded_by FROM memory_nodes WHERE memory_key = 'cli-target'`)
      const otherBefore = rawAt(`SELECT status, superseded_by FROM memory_nodes WHERE memory_key = 'node-test-scope-explicit-paths'`)
      close()

      const r = runCli(cwd, ['memory', 'merge', '--target', 'cli-target', '--sources', 'cli-src-1, cli-src-2'])
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /2 nodo\(s\) superseded/)

      const sources = rawAt(`SELECT memory_key, status, superseded_by FROM memory_nodes
        WHERE memory_key IN ('cli-src-1', 'cli-src-2') ORDER BY memory_key`)
      assert.equal(sources.length, 2)
      for (const source of sources) {
        assert.equal(source.status, 'superseded')
        assert.equal(source.superseded_by, targetId)
      }
      assert.deepEqual(
        rawAt(`SELECT status, content, superseded_by FROM memory_nodes WHERE memory_key = 'cli-target'`),
        targetBefore
      )
      assert.deepEqual(
        rawAt(`SELECT status, superseded_by FROM memory_nodes WHERE memory_key = 'node-test-scope-explicit-paths'`),
        otherBefore
      )
      assert.deepEqual(
        rawAt(`SELECT type, name, sql FROM sqlite_master ORDER BY type, name`),
        schemaBefore
      )

      assert.equal(existsSync(projectCtx), true, 'el bloque se escribe bajo la raiz derivada de la DB')
      assert.equal(existsSync(cwdCtx), false, 'el bloque no se escribe bajo process.cwd()')
      const ctx = readFileSync(projectCtx, 'utf8')
      assert.doesNotMatch(ctx, /\[cli-src-1\]/)
      assert.doesNotMatch(ctx, /\[cli-src-2\]/)
      assert.match(ctx, /\[cli-target\] target vigente/)
    })
  })

  it('--dry-run no escribe la base ni el working-context', () => {
    withCliFixture(({ dir, engine, close, rawAt }) => {
      const { ctxPath } = seedMergeFixture({ dir, engine, rawAt })
      const ctxBefore = readFileSync(ctxPath)
      const statesBefore = rawAt(`SELECT memory_key, status, superseded_by FROM memory_nodes ORDER BY rowid`)
      close()

      const r = runCli(dir, ['memory', 'merge', '--dry-run', '--target', 'cli-target', '--sources', 'cli-src-1,cli-src-2'])
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /dry-run/)
      assert.deepEqual(readFileSync(ctxPath), ctxBefore, 'el working-context no cambia')
      assert.deepEqual(
        rawAt(`SELECT memory_key, status, superseded_by FROM memory_nodes ORDER BY rowid`),
        statesBefore,
        'la base no cambia'
      )
    })
  })

  // F2: el dry-run no puede abrir con `createMemoryEngine` (aplica
  // `journal_mode=WAL` y migraciones antes del plan). Fixture en DELETE: si el
  // CLI abriera en escritura, el header cambiaria y aparecerian sidecars.
  it('--dry-run sobre DB en journal_mode=DELETE no escribe la base ni crea sidecars', () => {
    withCliFixture(({ dir, dbPath, engine, close, rawAt }) => {
      const { ctxPath } = seedMergeFixture({ dir, engine, rawAt })
      const ctxBefore = readFileSync(ctxPath)
      close()

      const raw = openDatabase(dbPath, { migrate: false })
      try {
        raw.exec('PRAGMA journal_mode = DELETE')
      } finally {
        raw.close()
      }

      const wal = `${dbPath}-wal`
      const shm = `${dbPath}-shm`
      assert.equal(existsSync(wal), false, 'precondicion: la fixture no tiene -wal')
      assert.equal(existsSync(shm), false, 'precondicion: la fixture no tiene -shm')
      const dbBefore = sha(dbPath)
      const walBefore = existsSync(wal) ? sha(wal) : null

      const r = runCli(dir, ['memory', 'merge', '--dry-run', '--target', 'cli-target', '--sources', 'cli-src-1,cli-src-2'])
      assert.equal(r.status, 0, r.stderr)
      assert.match(r.stdout, /dry-run/)
      assert.match(r.stdout, /cli-target/)
      assert.match(r.stdout, /2 nodo\(s\) a superseder/)

      assert.equal(sha(dbPath), dbBefore, 'el .db debe quedar byte a byte identico')
      assert.equal(existsSync(wal), false, 'el dry-run no debe crear -wal')
      assert.equal(existsSync(shm), false, 'el dry-run no debe crear -shm')
      assert.equal(existsSync(wal) ? sha(wal) : null, walBefore, 'si apareciera un -wal, no podria cambiar')
      assert.deepEqual(readFileSync(ctxPath), ctxBefore, 'el working-context no cambia')
    })
  })

  it('--dry-run --json imprime las cuatro claves y no escribe (G5)', () => {
    withCliFixture(({ dir, engine, close, rawAt }) => {
      const { ctxPath } = seedMergeFixture({ dir, engine, rawAt })
      const ctxBefore = readFileSync(ctxPath)
      const statesBefore = rawAt(`SELECT memory_key, status, superseded_by FROM memory_nodes ORDER BY rowid`)
      close()

      const r = runCli(dir, ['memory', 'merge', '--dry-run', '--target', 'cli-target', '--sources', 'cli-src-1,cli-src-2', '--json'])
      assert.equal(r.status, 0, r.stderr)
      const payload = JSON.parse(r.stdout)
      assert.deepEqual(Object.keys(payload).sort(), ['dryRun', 'sources', 'superseded', 'target'])
      assert.equal(payload.dryRun, true)
      assert.equal(payload.target, 'cli-target')
      assert.deepEqual([...payload.sources].sort(), ['cli-src-1', 'cli-src-2'])
      assert.equal(payload.superseded, 2)
      assert.deepEqual(readFileSync(ctxPath), ctxBefore, 'el working-context no cambia')
      assert.deepEqual(
        rawAt(`SELECT memory_key, status, superseded_by FROM memory_nodes ORDER BY rowid`),
        statesBefore,
        'la base no cambia'
      )
    })
  })

  // G5 cubre ambos caminos: el real tambien publica las cuatro claves.
  it('merge real --json imprime las cuatro claves (G5)', () => {
    withCliFixture(({ dir, engine, close, rawAt }) => {
      seedMergeFixture({ dir, engine, rawAt })
      close()

      const r = runCli(dir, ['memory', 'merge', '--target', 'cli-target', '--sources', 'cli-src-1,cli-src-2', '--json'])
      assert.equal(r.status, 0, r.stderr)
      const payload = JSON.parse(r.stdout)
      assert.deepEqual(Object.keys(payload).sort(), ['dryRun', 'sources', 'superseded', 'target'])
      assert.equal(payload.dryRun, false)
      assert.equal(payload.target, 'cli-target')
      assert.deepEqual([...payload.sources].sort(), ['cli-src-1', 'cli-src-2'])
      assert.equal(payload.superseded, 2)

      const sources = rawAt(`SELECT memory_key, status FROM memory_nodes
        WHERE memory_key IN ('cli-src-1', 'cli-src-2') ORDER BY memory_key`)
      assert.equal(sources.length, 2)
      for (const source of sources) assert.equal(source.status, 'superseded')
    })
  })

  it('sin --target o sin --sources sale con codigo != 0 y muestra el uso', () => {
    withCliFixture(({ dir, close }) => {
      close()
      const noTarget = runCli(dir, ['memory', 'merge', '--sources', 'a'])
      assert.notEqual(noTarget.status, 0)
      assert.match(noTarget.stderr, /uso: ancleto memory merge/)
      const noSources = runCli(dir, ['memory', 'merge', '--target', 'a'])
      assert.notEqual(noSources.status, 0)
      assert.match(noSources.stderr, /uso: ancleto memory merge/)
    })
  })

  it('un valor de flag que es otro flag cuenta como faltante y muestra el uso', () => {
    withCliFixture(({ dir, close }) => {
      close()
      const r = runCli(dir, ['memory', 'merge', '--target', '--sources', 'a'])
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /uso: ancleto memory merge/)
    })
  })

  it('un rechazo nombra la memory_key y sale con codigo != 0', () => {
    withCliFixture(({ dir, engine, close }) => {
      engine.recordNode({ memory_key: 'cli-target', type: 'rule', scope: 'project', content: 'target' })
      close()
      const r = runCli(dir, ['memory', 'merge', '--target', 'cli-inexistente', '--sources', 'cli-target'])
      assert.notEqual(r.status, 0)
      assert.match(r.stderr, /cli-inexistente/)
    })
  })

  // R2: si el refresh del bloque falla, el comando no puede fingir exito. Se fuerza
  // sin seam de produccion: el path esperado del working-context es un directorio,
  // asi el read/write del refresh falla con EISDIR.
  it('si el refresh del working-context falla, sale != 0 y aclara que el merge si se aplico', () => {
    withCliFixture(({ dir, engine, close, rawAt }) => {
      engine.recordNode({ memory_key: 'cli-target', type: 'rule', scope: 'project', content: 'target vigente' })
      engine.recordNode({ memory_key: 'cli-src-1', type: 'rule', scope: 'project', content: 'source uno' })
      mkdirSync(join(dir, '.ancleto', 'working-context.md'))
      close()

      const r = runCli(dir, ['memory', 'merge', '--target', 'cli-target', '--sources', 'cli-src-1'])
      assert.notEqual(r.status, 0, 'un refresh fallido no puede salir 0')
      assert.match(r.stderr, /se aplico en la base/, 'debe decir que el merge si se aplico')
      assert.match(r.stderr, /desactualizado/, 'debe decir que el bloque quedo desactualizado')
      // F4: el destino se deriva del helper (raiz de la DB), no de un literal.
      const ctxPath = join(dir, '.ancleto', 'working-context.md')
      assert.ok(r.stderr.includes(ctxPath), `el mensaje debe nombrar el destino derivado (${r.stderr})`)
      assert.ok(
        r.stderr.includes(`ancleto memory context --out ${ctxPath}`),
        `el comando sugerido debe usar el destino derivado (${r.stderr})`
      )
      assert.doesNotMatch(r.stdout, /merge OK/)

      // El merge no se revierte: la source quedo superseded en la base.
      const src = rawAt(`SELECT status, superseded_by FROM memory_nodes WHERE memory_key = 'cli-src-1'`)
      assert.equal(src[0].status, 'superseded')
      assert.ok(src[0].superseded_by)
    })
  })
})
