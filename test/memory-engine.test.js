import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/core/memory/database.js'
import { createMemoryEngine, defaultMemoryDbPath } from '../src/core/memory/engine.js'
import { memoryDoctor } from '../src/core/memory/doctor.js'
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

describe('buildWorkingContext — XML y scopes (v0.3.0)', () => {
  it('genera XML bien formado con etiqueta de no confiables', () => {
    engine.recordNode({ memory_key: 'scope-proj-a', type: 'rule', scope: 'project', content: 'errores en espanol' })
    const block = engine.buildWorkingContext('project')
    assert.equal(block.startsWith('<ProjectMemoryRules>'), true)
    assert.equal(block.endsWith('</ProjectMemoryRules>'), true)
    assert.match(block, /Datos no confiables/)
    assert.match(block, /- \[scope-proj-a\] errores en espanol/)
  })

  it('respeta scopes con jerarquia project < feature < task', () => {
    engine.recordNode({ memory_key: 'scope-proj-b', type: 'rule', scope: 'project', content: 'regla project' })
    engine.recordNode({ memory_key: 'scope-feat-b', type: 'rule', scope: 'feature', content: 'regla feature' })
    engine.recordNode({ memory_key: 'scope-task-b', type: 'rule', scope: 'task', content: 'regla task' })

    const proj = engine.buildWorkingContext('project')
    assert.match(proj, /regla project/)
    assert.doesNotMatch(proj, /regla feature/)
    assert.doesNotMatch(proj, /regla task/)

    const feat = engine.buildWorkingContext('feature')
    assert.match(feat, /regla feature/)
    assert.match(feat, /regla project/)
    assert.doesNotMatch(feat, /regla task/)

    const task = engine.buildWorkingContext('task')
    assert.match(task, /regla task/)
    assert.match(task, /regla feature/)
    assert.match(task, /regla project/)
  })

  it('no mezcla decisiones dentro del working context', () => {
    engine.recordNode({ memory_key: 'scope-dec-c', type: 'decision', scope: 'project', content: 'decision project' })
    const block = engine.buildWorkingContext('project')
    assert.doesNotMatch(block, /decision project/)
  })

  it('devuelve null para scope sin reglas activas', () => {
    assert.equal(engine.buildWorkingContext('scope-inexistente'), null)
  })
})

describe('buildWorkingContext — truncamiento (v0.3.0 item 2)', () => {
  function withEngine(fn) {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-trunc-'))
    const eng = createMemoryEngine(join(dir, 'memory.db'))
    try {
      return fn(eng)
    } finally {
      eng.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }

  it('trunca reglas enteras (nunca corta strings) y el XML cierra correctamente', () => {
    withEngine((eng) => {
      const c1 = 'A'.repeat(100)
      const c2 = 'B'.repeat(100)
      eng.recordNode({ memory_key: 'a1', type: 'rule', scope: 'project', content: c1 })
      eng.recordNode({ memory_key: 'a2', type: 'rule', scope: 'project', content: c2 })

      const block = eng.buildWorkingContext('project', 75) // 300 chars: solo entra una regla
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
    withEngine((eng) => {
      for (let i = 1; i <= 3; i++) {
        eng.recordNode({ memory_key: `r${i}`, type: 'rule', scope: 'project', content: 'X'.repeat(60) })
      }
      const block = eng.buildWorkingContext('project', 60) // 240 chars: 1 entra, 2 omitidas
      const m = block.match(/Context truncated due to size limits\. (\d+) rules omitted/)
      assert.ok(m, 'warning presente')
      assert.equal(m[1], '2')
      assert.equal((block.match(/^- \[/gm) || []).length, 1)
    })
  })

  it('prioriza task sobre project en la retencion con poco espacio', () => {
    withEngine((eng) => {
      const projContent = 'P'.repeat(100)
      eng.recordNode({ memory_key: 'proj1', type: 'rule', scope: 'project', content: projContent })
      eng.recordNode({ memory_key: 'task1', type: 'rule', scope: 'task', content: 'TASK_SHORT' })

      const block = eng.buildWorkingContext('task', 50) // 200 chars: solo task entra
      assert.ok(block.includes('- [task1] TASK_SHORT'))
      assert.equal(block.includes(projContent), false)
      assert.match(block, /1 rules omitted/)
    })
  })

  it('con limite muy chico no incluye reglas y el XML sigue valido', () => {
    withEngine((eng) => {
      eng.recordNode({ memory_key: 'x1', type: 'rule', scope: 'project', content: 'contenido' })
      const block = eng.buildWorkingContext('project', 5) // 20 chars < header: nada entra
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
      assert.equal(result.checks.length, 3)
      assert.ok(result.checks.every((c) => c.ok))
    })
  })

  it('detecta indice FTS5 inconsistente y --rebuild lo repara', () => {
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

      const before = memoryDoctor(dbPath)
      assert.equal(before.healthy, false)
      assert.equal(before.checks[1].ok, false)

      const after = memoryDoctor(dbPath, { rebuild: true })
      assert.equal(after.healthy, true)
      assert.equal(after.rebuilt, true)
      assert.equal(after.checks[1].ok, true)

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
