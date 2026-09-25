import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createMemoryEngine } from '../src/core/memory/engine.js'
import { createMemoryToolHandlers, createMemoryToolkit } from '../src/core/memory/tools.js'
import { createMemoryServer } from '../src/core/memory/mcp-server.js'
import { memoryDoctor } from '../src/core/memory/doctor.js'
import {
  resolveMemoryProjectRoot,
  shouldRefreshWorkingContext,
  workingContextPath,
  writeWorkingContext
} from '../src/core/memory/working-context.js'

// Patron de test/memory-engine.test.js: node:test + mkdtempSync + DB temporal.
// La raiz de proyecto se pasa SIEMPRE explicita para no depender del cwd del repo.
function withProject(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-wctx-'))
  try {
    return fn(dir)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort: en Windows los handles de WAL pueden tardar en liberarse
    }
  }
}

describe('working-context — shouldRefreshWorkingContext (6.1)', () => {
  // Firma real: recibe el resultado completo de recordNode `{ node, superseded }`.
  const result = (type, scope, superseded) => ({ node: { type, scope }, superseded })

  it('dispara para rule + project sin supersesion (contribucion directa)', () => {
    assert.equal(shouldRefreshWorkingContext(result('rule', 'project', 0)), true)
  })

  it('dispara para rule + project con supersesion', () => {
    assert.equal(shouldRefreshWorkingContext(result('rule', 'project', 1)), true)
  })

  it('no dispara para decision + project ni rule feature/task sin supersesion', () => {
    assert.equal(shouldRefreshWorkingContext(result('decision', 'project', 0)), false)
    assert.equal(shouldRefreshWorkingContext(result('rule', 'feature', 0)), false)
    assert.equal(shouldRefreshWorkingContext(result('rule', 'task', 0)), false)
  })

  it('dispara por supersesion cross-type/cross-scope (cualquier type/scope)', () => {
    assert.equal(shouldRefreshWorkingContext(result('decision', 'project', 1)), true)
    assert.equal(shouldRefreshWorkingContext(result('decision', 'feature', 1)), true)
    assert.equal(shouldRefreshWorkingContext(result('rule', 'feature', 1)), true)
    assert.equal(shouldRefreshWorkingContext(result('rule', 'task', 1)), true)
  })
})

describe('working-context — resolveMemoryProjectRoot (6.2)', () => {
  it('detecta la raiz por la presencia de .ancletorc', () => {
    withProject((dir) => {
      writeFileSync(join(dir, '.ancletorc'), '{}\n')
      assert.equal(resolveMemoryProjectRoot(join(dir, '.ancleto', 'memory.db')), dir)
    })
  })

  it('sube desde una DB anidada hasta el .ancletorc (gana sobre el fallback)', () => {
    withProject((dir) => {
      writeFileSync(join(dir, '.ancletorc'), '{}\n')
      // el candidato derivado de la DB tiene layout .ancleto/: si el walk-up fallara,
      // el fallback devolveria este subdirectorio en lugar de la raiz.
      mkdirSync(join(dir, 'packages', 'app', '.ancleto'), { recursive: true })
      const dbPath = join(dir, 'packages', 'app', '.ancleto', 'memory.db')
      assert.equal(resolveMemoryProjectRoot(dbPath), dir)
    })
  })

  it('sin .ancletorc usa el fallback derivado de dbPath si existe layout .ancleto/', () => {
    withProject((dir) => {
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      writeFileSync(join(dir, '.ancleto', 'memory.db'), '')
      assert.equal(resolveMemoryProjectRoot(join(dir, '.ancleto', 'memory.db')), dir)
    })
  })

  it('sin .ancletorc ni layout .ancleto/ devuelve null', () => {
    withProject((dir) => {
      assert.equal(resolveMemoryProjectRoot(join(dir, 'nested', 'deep', 'memory.db')), null)
      assert.equal(resolveMemoryProjectRoot(null), null)
      assert.equal(resolveMemoryProjectRoot(undefined), null)
    })
  })
})

describe('working-context — writeWorkingContext', () => {
  it('escribe el bloque con salto final y devuelve el path escrito', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'wc-w', type: 'rule', scope: 'project', content: 'regla a persistir' })
        const ret = writeWorkingContext(engine, dir)
        assert.equal(ret, workingContextPath(dir))
        assert.equal(readFileSync(ret, 'utf8'), engine.buildWorkingContext('project', undefined, dir) + '\n')
        assert.equal(readFileSync(ret, 'utf8').endsWith('\n'), true)
      } finally {
        engine.close()
      }
    })
  })

  it('sin bloque escribe vacio y devuelve null (paridad CLI), y sin raiz no escribe', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        assert.equal(writeWorkingContext(engine, null), null)
        assert.equal(writeWorkingContext(engine, dir), null)
        assert.equal(readFileSync(workingContextPath(dir), 'utf8'), '')
      } finally {
        engine.close()
      }
    })
  })
})

describe('working-context — refresh en handlers MCP', () => {
  it('recordRule scope project refresca el working-context (6.3)', () => {
    withProject((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        const result = toolkit.handlers.recordRule({ memory_key: 'wc-pos', content: 'regla fresca de proyecto', scope: 'project' })
        assert.equal(result.node.memory_key, 'wc-pos')
        // scope omitido -> project por default: tambien dispara
        toolkit.handlers.recordRule({ memory_key: 'wc-default', content: 'regla sin scope explicito' })

        const out = workingContextPath(dir)
        assert.ok(existsSync(out), 'se escribe el working-context')
        const content = readFileSync(out, 'utf8')
        assert.match(content, /<ProjectMemoryRules>/)
        assert.match(content, /- \[wc-pos\] regla fresca de proyecto/)
        assert.match(content, /- \[wc-default\] regla sin scope explicito/)
        assert.equal(content.endsWith('\n'), true)
      } finally {
        toolkit.engine.close()
      }
    })
  })

  it('decisiones y reglas feature/task que NO superseden no crean el working-context (6.4)', () => {
    withProject((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        const decision = toolkit.handlers.recordDecision({ memory_key: 'wc-dec', content: 'decision de proyecto', scope: 'project' })
        const feature = toolkit.handlers.recordRule({ memory_key: 'wc-feat', content: 'regla feature', scope: 'feature' })
        const task = toolkit.handlers.recordRule({ memory_key: 'wc-task', content: 'regla task', scope: 'task' })
        assert.equal(decision.superseded, 0)
        assert.equal(feature.superseded, 0)
        assert.equal(task.superseded, 0)
        // cualquier refresh rule+project escribiria el archivo (incluso vacio); su ausencia
        // prueba que ninguna de esas escrituras disparo el refresh.
        assert.equal(existsSync(workingContextPath(dir)), false, 'ningun write no-proyectado debe regenerar el contexto')
      } finally {
        toolkit.engine.close()
      }
    })
  })

  it('decisiones y reglas feature/task que NO superseden conservan el contenido previo (6.4)', () => {
    withProject((dir) => {
      const out = workingContextPath(dir)
      mkdirSync(join(dir, '.ancleto'), { recursive: true })
      const sentinel = 'CONTENIDO PREVIO QUE NO ES UN BLOQUE VALIDO\n'
      writeFileSync(out, sentinel)

      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        const decision = toolkit.handlers.recordDecision({ memory_key: 'wc-dec', content: 'decision de proyecto', scope: 'project' })
        const feature = toolkit.handlers.recordRule({ memory_key: 'wc-feat', content: 'regla feature', scope: 'feature' })
        const task = toolkit.handlers.recordRule({ memory_key: 'wc-task', content: 'regla task', scope: 'task' })
        assert.equal(decision.superseded, 0)
        assert.equal(feature.superseded, 0)
        assert.equal(task.superseded, 0)
        assert.equal(readFileSync(out, 'utf8'), sentinel, 'el contenido permanece identico')
      } finally {
        toolkit.engine.close()
      }
    })
  })

  it('supersesion de una rule project refresca con el contenido nuevo (6.5)', () => {
    withProject((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        toolkit.handlers.recordRule({ memory_key: 'wc-sup', content: 'version uno', scope: 'project' })
        const out = workingContextPath(dir)
        assert.match(readFileSync(out, 'utf8'), /version uno/)

        const second = toolkit.handlers.recordRule({ memory_key: 'wc-sup', content: 'version dos', scope: 'project' })
        assert.equal(second.superseded, 1)

        const content = readFileSync(out, 'utf8')
        assert.match(content, /version dos/)
        assert.doesNotMatch(content, /version uno/)
      } finally {
        toolkit.engine.close()
      }
    })
  })

  it('supersesion cross-type (decision) de una rule project refresca y retira la rule (6.10)', () => {
    withProject((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        toolkit.handlers.recordRule({ memory_key: 'wc-cross-d', content: 'regla original', scope: 'project' })
        const out = workingContextPath(dir)
        assert.match(readFileSync(out, 'utf8'), /regla original/)

        const result = toolkit.handlers.recordDecision({ memory_key: 'wc-cross-d', content: 'decision que retira', scope: 'project' })
        assert.equal(result.node.type, 'decision')
        assert.equal(result.superseded, 1)

        const content = readFileSync(out, 'utf8')
        assert.doesNotMatch(content, /regla original/, 'la rule retirada sale del bloque')
        assert.doesNotMatch(content, /decision que retira/, 'la decision no compone <ProjectMemoryRules>')
      } finally {
        toolkit.engine.close()
      }
    })
  })

  it('supersesion cross-scope (rule feature) de una rule project refresca y retira la rule (6.10)', () => {
    withProject((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        toolkit.handlers.recordRule({ memory_key: 'wc-cross-f', content: 'regla project original', scope: 'project' })
        const out = workingContextPath(dir)
        assert.match(readFileSync(out, 'utf8'), /regla project original/)

        const result = toolkit.handlers.recordRule({ memory_key: 'wc-cross-f', content: 'regla feature que retira', scope: 'feature' })
        assert.equal(result.node.type, 'rule')
        assert.equal(result.node.scope, 'feature')
        assert.equal(result.superseded, 1)

        const content = readFileSync(out, 'utf8')
        assert.doesNotMatch(content, /regla project original/, 'la rule retirada sale del bloque')
        assert.doesNotMatch(content, /regla feature que retira/, 'una rule feature no entra al bloque a scope project')
      } finally {
        toolkit.engine.close()
      }
    })
  })

  it('una falla del refresh no pierde la escritura, conserva el archivo y avisa por stderr (6.6)', () => {
    withProject((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        toolkit.handlers.recordRule({ memory_key: 'wc-seed', content: 'contenido previo', scope: 'project' })
        const out = workingContextPath(dir)
        const before = readFileSync(out, 'utf8')

        // engine cuyo render falla: fuerza el error del refresh dentro del try/catch del handler
        const failingEngine = {
          recordNode: (input, context) => toolkit.engine.recordNode(input, context),
          buildWorkingContext: () => { throw new Error('fallo simulado del refresh') },
          searchMemory: (args) => toolkit.engine.searchMemory(args)
        }
        const handlers = createMemoryToolHandlers(failingEngine, { source: 'test', projectRoot: dir })

        const warnings = []
        const logged = []
        const origWarn = console.warn
        const origLog = console.log
        console.warn = (...args) => { warnings.push(args.join(' ')) }
        console.log = (...args) => { logged.push(args.join(' ')) }
        let result
        try {
          result = handlers.recordRule({ memory_key: 'wc-robust', content: 'regla que persiste', scope: 'project' })
        } finally {
          console.warn = origWarn
          console.log = origLog
        }

        assert.equal(result.node.memory_key, 'wc-robust')
        assert.ok(
          toolkit.engine.listNodes({ scope: 'project' }).some((n) => n.memory_key === 'wc-robust'),
          'la DB contiene el nodo aunque el refresh falle'
        )
        assert.equal(readFileSync(out, 'utf8'), before, 'el archivo conserva su contenido previo')
        assert.ok(warnings.some((w) => /no se pudo refrescar/.test(w)), 'el error se reporta por stderr')
        assert.equal(logged.length, 0, 'no se escribe por stdout (canal JSON-RPC)')
      } finally {
        toolkit.engine.close()
      }
    })
  })
})

describe('working-context — idempotencia (6.7)', () => {
  it('dos refreshes sin escrituras de memoria son byte-identicos (no filtra timestamps)', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'wc-idem', type: 'rule', scope: 'project', content: 'regla idempotente' })
        const mapPath = join(dir, '.discovery-map.json')
        const seedMap = (lastUpdated) => writeFileSync(mapPath, JSON.stringify({
          last_updated: lastUpdated,
          total_files: 9,
          tree_summary: { src: 4 },
          root_files: []
        }, null, 2) + '\n')
        seedMap('2020-01-01T00:00:00.000Z')

        const out = workingContextPath(dir)
        writeWorkingContext(engine, dir)
        const first = readFileSync(out, 'utf8')
        writeWorkingContext(engine, dir)
        const second = readFileSync(out, 'utf8')
        assert.equal(second, first)

        // cambiar last_updated del mapa no debe alterar el render
        seedMap('2030-12-31T23:59:59.000Z')
        writeWorkingContext(engine, dir)
        const third = readFileSync(out, 'utf8')
        assert.equal(third, first, 'el render no depende de last_updated')
        assert.match(first, /<ProjectTopology>/)
        assert.match(first, /Total files: 9/)
      } finally {
        engine.close()
      }
    })
  })

  it('over-refresh intencional: decision -> decision misma key dispara pero deja bytes identicos (6.7)', () => {
    withProject((dir) => {
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        // una rule project garantiza que el archivo exista con un bloque no vacio
        toolkit.handlers.recordRule({ memory_key: 'wc-idem-rule', content: 'regla estable', scope: 'project' })
        const out = workingContextPath(dir)
        const before = readFileSync(out, 'utf8')
        assert.match(before, /regla estable/)

        // primera decision: no supersede (superseded = 0) y no es rule+project -> no refresca
        const first = toolkit.handlers.recordDecision({ memory_key: 'wc-over', content: 'decision uno', scope: 'project' })
        assert.equal(first.superseded, 0)
        assert.equal(readFileSync(out, 'utf8'), before)

        // segunda decision con la misma key: supersede (superseded = 1) -> dispara refresh, pero las
        // decisiones no componen <ProjectMemoryRules>: el archivo queda byte-identico (over-refresh).
        const second = toolkit.handlers.recordDecision({ memory_key: 'wc-over', content: 'decision dos', scope: 'project' })
        assert.equal(second.superseded, 1)
        assert.equal(readFileSync(out, 'utf8'), before, 'el over-refresh reescribe bytes identicos')
      } finally {
        toolkit.engine.close()
      }
    })
  })
})

describe('working-context — raiz del server MCP (6.8)', () => {
  it('escribe bajo la raiz detectada por .ancletorc y usa su topologia, no el cwd', () => {
    withProject((dir) => {
      writeFileSync(join(dir, '.ancletorc'), '{}\n')
      writeFileSync(join(dir, '.discovery-map.json'), JSON.stringify({
        last_updated: '2020-01-01T00:00:00.000Z',
        total_files: 11,
        tree_summary: { uniquedir: 3 },
        root_files: []
      }, null, 2) + '\n')

      const server = createMemoryServer({ dbPath: join(dir, '.ancleto', 'memory.db') })
      try {
        const res = server.handle({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'recordRule', arguments: { memory_key: 'wc-root', content: 'regla desde la raiz', scope: 'project' } }
        })
        assert.equal(res.result.isError, undefined)

        const out = workingContextPath(dir)
        assert.ok(existsSync(out), 'se escribe bajo la raiz detectada por .ancletorc')
        const content = readFileSync(out, 'utf8')
        assert.match(content, /<ProjectTopology>/)
        assert.match(content, /Total files: 11/)
        assert.match(content, /- uniquedir: 3/)
        assert.match(content, /- \[wc-root\] regla desde la raiz/)
      } finally {
        server.close()
      }
    })
  })
})

describe('working-context — sin recursion ni corrupcion (6.9)', () => {
  it('varios refreshes no recursan, no dejan deadlock y mantienen la DB integra', { timeout: 15000 }, () => {
    withProject((dir) => {
      writeFileSync(join(dir, '.ancletorc'), '{}\n')
      const dbPath = join(dir, '.ancleto', 'memory.db')
      const toolkit = createMemoryToolkit(dbPath, { source: 'test', projectRoot: dir })
      try {
        // cada recordRule project dispara el refresh; si recursara o se colgara, el test no termina
        for (let i = 0; i < 3; i++) {
          const r = toolkit.handlers.recordRule({ memory_key: `wc-rec-${i}`, content: `regla ${i}`, scope: 'project' })
          assert.equal(r.node.memory_key, `wc-rec-${i}`)
        }
        // la supersesion tambien refresca sin colgar
        assert.equal(toolkit.handlers.recordRule({ memory_key: 'wc-rec-0', content: 'regla 0 v2', scope: 'project' }).superseded, 1)

        // la DB sigue operativa tras la secuencia de refreshes
        const hits = toolkit.handlers.searchMemory({ query: 'regla' })
        assert.ok(hits.some((n) => n.memory_key === 'wc-rec-0' && n.content === 'regla 0 v2'))
        toolkit.engine.checkpoint()
      } finally {
        toolkit.engine.close()
      }

      // indice FTS5 consistente tras cerrar el engine
      const doctor = memoryDoctor(dbPath)
      assert.equal(doctor.healthy, true, JSON.stringify(doctor.checks))
      assert.ok(doctor.checks.some((c) => c.name === 'Indice FTS5' && c.ok))
    })
  })
})
