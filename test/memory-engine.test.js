import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/core/memory/database.js'
import { createMemoryEngine, defaultMemoryDbPath } from '../src/core/memory/engine.js'
import { memoryTools, createMemoryToolHandlers, createMemoryToolkit } from '../src/core/memory/tools.js'

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

    const block = engine.buildWorkingContext('repo')
    assert.ok(block.startsWith('<ProjectMemoryRules>'))
    assert.ok(block.endsWith('</ProjectMemoryRules>'))
    assert.match(block, /Datos no confiables/)
    assert.match(block, /\[r1\] errores en espanol/)
    assert.match(block, /\[r2\] tests con node:test/)
    assert.doesNotMatch(block, /decisión de prueba/)
  })

  it('devuelve null cuando no hay reglas en el scope', () => {
    assert.equal(engine.buildWorkingContext('scope-vacio'), null)
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

  it('valida type invalido', () => {
    assert.throws(() => engine.searchMemory({ query: 'x', type: 'otro' }), /type invalido/)
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
