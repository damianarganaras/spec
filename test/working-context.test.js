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
  checkWorkingContextFreshness,
  DEFAULT_WORKING_CONTEXT_TOKENS,
  readCriticalMemoryKeys,
  refreshWorkingContextOnWrite,
  renderWorkingContextBlock,
  resolveMemoryProjectRoot,
  resolveWorkingContextMaxTokens,
  shouldRefreshWorkingContext,
  workingContextPath,
  writeWorkingContext,
  writeWorkingContextBlock
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

describe('working-context — render compartido y escritura (día-cero)', () => {
  it('con engine el render delega en buildWorkingContext (mismo bloque)', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'rc-rule', type: 'rule', scope: 'project', content: 'regla compartida' })
        assert.equal(
          renderWorkingContextBlock(engine, dir),
          engine.buildWorkingContext('project', undefined, dir)
        )
        assert.match(renderWorkingContextBlock(engine, dir), /\[rc-rule\] regla compartida/)
      } finally {
        engine.close()
      }
    })
  })

  it('sin engine es día-cero: solo topología, o null sin mapa (sin contenido ficticio)', () => {
    withProject((dir) => {
      assert.equal(renderWorkingContextBlock(null, dir), null, 'sin discovery-map no hay bloque')
      writeFileSync(join(dir, '.discovery-map.json'), JSON.stringify({
        last_updated: '2020-01-01T00:00:00.000Z',
        total_files: 7,
        tree_summary: { src: 5, test: 2 },
        root_files: []
      }) + '\n')
      const block = renderWorkingContextBlock(null, dir)
      assert.match(block, /^<ProjectTopology>/)
      assert.match(block, /Total files: 7/)
      assert.doesNotMatch(block, /<ProjectMemoryRules>/)
    })
  })

  it('writeWorkingContextBlock persiste el bloque con salto final y null -> vacío', () => {
    withProject((dir) => {
      const ret = writeWorkingContextBlock(dir, '<ProjectTopology>\nTotal files: 1\n</ProjectTopology>')
      assert.equal(ret, workingContextPath(dir))
      assert.equal(readFileSync(ret, 'utf8').endsWith('\n'), true)
      assert.equal(writeWorkingContextBlock(dir, null), null)
      assert.equal(readFileSync(workingContextPath(dir), 'utf8'), '')
      assert.equal(writeWorkingContextBlock(null, 'x'), null)
    })
  })
})

describe('working-context — checkWorkingContextFreshness (staleness)', () => {
  it('ausente: hay reglas activas pero el archivo no existe', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'fr-rule', type: 'rule', scope: 'project', content: 'regla fresca' })
        assert.equal(checkWorkingContextFreshness(engine, dir).state, 'ausente')
      } finally {
        engine.close()
      }
    })
  })

  it('ok cuando el archivo coincide con el bloque renderizado', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'fr-rule', type: 'rule', scope: 'project', content: 'regla fresca' })
        writeWorkingContext(engine, dir)
        assert.equal(checkWorkingContextFreshness(engine, dir).state, 'ok')
      } finally {
        engine.close()
      }
    })
  })

  it('ok sin nada que inyectar (sin reglas ni topología) y sin archivo', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        assert.equal(checkWorkingContextFreshness(engine, dir).state, 'ok')
      } finally {
        engine.close()
      }
    })
  })

  it('desactualizado cuando difiere y NO muta el archivo', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'fr-rule', type: 'rule', scope: 'project', content: 'regla fresca' })
        writeWorkingContext(engine, dir)
        writeFileSync(workingContextPath(dir), 'contenido obsoleto\n')
        assert.equal(checkWorkingContextFreshness(engine, dir).state, 'desactualizado')
        assert.equal(readFileSync(workingContextPath(dir), 'utf8'), 'contenido obsoleto\n', 'el chequeo es read-only')
      } finally {
        engine.close()
      }
    })
  })
})

describe('working-context — refreshWorkingContextOnWrite (escrituras CLI)', () => {
  it('escribe el artefacto cuando hay una regla de proyecto', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'imp-rule', type: 'rule', scope: 'project', content: 'regla importada' })
        assert.equal(refreshWorkingContextOnWrite(engine, dir), workingContextPath(dir))
        assert.match(readFileSync(workingContextPath(dir), 'utf8'), /\[imp-rule\] regla importada/)
      } finally {
        engine.close()
      }
    })
  })

  it('no crea archivo cuando la escritura no altera el bloque', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'imp-dec', type: 'decision', scope: 'feature', content: 'decision feature' })
        assert.equal(refreshWorkingContextOnWrite(engine, dir), null)
        assert.equal(existsSync(workingContextPath(dir)), false)
      } finally {
        engine.close()
      }
    })
  })

  it('no reescribe si el contenido ya coincide', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'imp-rule', type: 'rule', scope: 'project', content: 'regla importada' })
        assert.equal(refreshWorkingContextOnWrite(engine, dir), workingContextPath(dir))
        assert.equal(refreshWorkingContextOnWrite(engine, dir), null, 'segundo refresh idempotente: sin cambio')
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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
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
        const handlers = createMemoryToolHandlers(failingEngine, { source: 'runtime', projectRoot: dir })

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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
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

describe('working-context — consecuencia de la idempotencia de recordNode', () => {
  // Spy del refresh: `writeWorkingContext` renderiza via `buildWorkingContext`, asi que
  // contar esas llamadas prueba que `shouldRefreshWorkingContext` dio true aunque los
  // bytes del archivo derivado no cambien en una reescritura identica.
  const spyHandlers = (toolkit, dir) => {
    const renders = []
    const engine = {
      recordNode: (input, context) => toolkit.engine.recordNode(input, context),
      buildWorkingContext: (...args) => {
        renders.push(args)
        return toolkit.engine.buildWorkingContext(...args)
      },
      searchMemory: (args) => toolkit.engine.searchMemory(args)
    }
    return {
      handlers: createMemoryToolHandlers(engine, { source: 'runtime', projectRoot: dir }),
      renders
    }
  }

  it('reescritura identica de rule + project sigue refrescando por contribucion directa, superseded 0', () => {
    withProject((dir) => {
      const toolkit = createMemoryToolkit(join(dir, '.ancleto', 'memory.db'), { source: 'runtime', projectRoot: dir })
      try {
        const { handlers, renders } = spyHandlers(toolkit, dir)
        const first = handlers.recordRule({ memory_key: 'wc-ident-rule', content: 'regla estable', scope: 'project' })
        assert.equal(first.superseded, 0)
        assert.ok(renders.length > 0, 'precondicion: la primera escritura refresca')
        const afterFirst = renders.length

        const second = handlers.recordRule({ memory_key: 'wc-ident-rule', content: 'regla estable', scope: 'project' })
        assert.equal(second.superseded, 0, 'una reescritura identica no supersede')
        assert.equal(second.node.created_at, first.node.created_at, 'devuelve el nodo activo persistido')
        assert.ok(renders.length > afterFirst, 'la contribucion directa sigue disparando el refresh')
        assert.match(readFileSync(workingContextPath(dir), 'utf8'), /\[wc-ident-rule\] regla estable/)
      } finally {
        toolkit.engine.close()
      }
    })
  })

  it('reescritura identica de una decision no dispara refresh porque no hubo supersede', () => {
    withProject((dir) => {
      const toolkit = createMemoryToolkit(join(dir, '.ancleto', 'memory.db'), { source: 'runtime', projectRoot: dir })
      try {
        const { handlers, renders } = spyHandlers(toolkit, dir)
        const first = handlers.recordDecision({ memory_key: 'wc-ident-dec', content: 'decision estable', scope: 'project' })
        assert.equal(first.superseded, 0)
        const second = handlers.recordDecision({ memory_key: 'wc-ident-dec', content: 'decision estable', scope: 'project' })
        assert.equal(second.superseded, 0, 'una reescritura identica no supersede')
        assert.equal(renders.length, 0, 'decision identica: ni supersede ni contribucion directa')
        assert.equal(existsSync(workingContextPath(dir)), false, 'no se crea el working-context')
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
          params: {
            name: 'recordRule',
            arguments: {
              memory_key: 'wc-root',
              // procedencia MCP: la escritura pasa por la validacion de refs (MEM-03)
              content: 'regla desde la raiz\n\nrefs:\n  - path:.discovery-map.json',
              scope: 'project'
            }
          }
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
      const toolkit = createMemoryToolkit(dbPath, { source: 'runtime', projectRoot: dir })
      try {
        // cada recordRule project dispara el refresh; si recursara o se colgara, el test no termina
        for (let i = 0; i < 3; i++) {
          const r = toolkit.handlers.recordRule({ memory_key: `wc-rec-${i}`, content: `regla ${i}`, scope: 'project' })
          assert.equal(r.node.memory_key, `wc-rec-${i}`)
        }
        // la supersesion tambien refresca sin colgar
        assert.equal(toolkit.handlers.recordRule({ memory_key: 'wc-rec-0', content: 'regla 0 v2', scope: 'project' }).superseded, 1)

        // la DB sigue operativa tras la secuencia de refreshes
        const hits = toolkit.handlers.searchMemory({ query: 'regla', expand: true })
        assert.ok(hits.some((n) => n.memory_key === 'wc-rec-0' && n.content === 'regla 0 v2'))
        toolkit.engine.checkpoint()
      } finally {
        toolkit.engine.close()
      }

      // indice FTS5 consistente tras cerrar el engine: `--rebuild` ejecuta el
      // integrity-check real, asi que `ok` prueba consistencia (no un skip).
      const doctor = memoryDoctor(dbPath, { rebuild: true })
      assert.equal(doctor.healthy, true, JSON.stringify(doctor.checks))
      assert.equal(doctor.rebuilt, true, '--rebuild debe ejecutarse sobre una DB legible')
      const fts = doctor.checks.find((c) => c.name === 'Indice FTS5')
      assert.ok(fts, 'debe existir el check Indice FTS5')
      assert.equal(fts.skipped, undefined, 'con --rebuild el check no debe omitirse')
      assert.equal(fts.ok, true, 'el indice debe quedar consistente tras el rebuild')
    })
  })
})

describe('working-context — conjunto critico del proyecto (mem-05-critical-set)', () => {
  // `.ancletorc` temporal: string crudo (para JSON invalido) u objeto serializado.
  const writeRc = (dir, value) => {
    writeFileSync(join(dir, '.ancletorc'), typeof value === 'string' ? value : JSON.stringify(value) + '\n')
  }
  const withoutWarn = (fn) => {
    const original = console.warn
    console.warn = () => {}
    try {
      return fn()
    } finally {
      console.warn = original
    }
  }

  it('T6: las claves criticas se inyectan primero y en el orden declarado', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'crit-b', type: 'rule', scope: 'project', content: 'critica B', createdAt: '2020-01-01T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'crit-a', type: 'rule', scope: 'project', content: 'critica A', createdAt: '2020-01-02T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'plain-newest', type: 'rule', scope: 'project', content: 'no critica mas reciente', createdAt: '2026-01-01T00:00:00.000Z' })

        // Sin config el orden natural pone primero la mas reciente.
        const natural = renderWorkingContextBlock(engine, dir)
        assert.ok(natural.indexOf('[plain-newest]') < natural.indexOf('[crit-a]'))

        writeRc(dir, { memory: { criticalKeys: ['crit-b', 'crit-a'] } })
        const block = renderWorkingContextBlock(engine, dir)
        const at = (key) => block.indexOf(`[${key}]`)
        assert.ok(at('crit-b') >= 0 && at('crit-a') >= 0 && at('plain-newest') >= 0)
        assert.ok(at('crit-b') < at('crit-a'), 'respeta el orden declarado')
        assert.ok(at('crit-a') < at('plain-newest'), 'las criticas van antes que cualquier no critica')
      } finally {
        engine.close()
      }
    })
  })

  it('T7: con presupuesto ajustado una no critica no desplaza a la critica', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        // Presupuesto default (4.000 tokens / 16.000 caracteres): entra una sola de las dos reglas grandes.
        engine.recordNode({ memory_key: 'crit-shift', type: 'rule', scope: 'project', content: `CRITICA ${'c'.repeat(8000)}`, createdAt: '2020-01-01T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'bulk-plain', type: 'rule', scope: 'project', content: `NO_CRITICA ${'p'.repeat(8000)}`, createdAt: '2026-01-01T00:00:00.000Z' })

        const natural = withoutWarn(() => renderWorkingContextBlock(engine, dir))
        assert.ok(natural.includes('[bulk-plain]'), 'sin config entra la no critica mas reciente')
        assert.equal(natural.includes('[crit-shift]'), false, 'sin config la critica queda fuera')

        writeRc(dir, { memory: { criticalKeys: ['crit-shift'] } })
        const block = withoutWarn(() => renderWorkingContextBlock(engine, dir))
        assert.ok(block.includes('[crit-shift]'), 'la critica entra')
        assert.equal(block.includes('[bulk-plain]'), false, 'la no critica ya no desplaza a la critica')
        assert.match(block, /1 rules omitted/)
        assert.match(block, /Omitted: bulk-plain/)
      } finally {
        engine.close()
      }
    })
  })

  it('T8: una clave critica inexistente o inactiva falla nombrando la memory_key', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'known-rule', type: 'rule', scope: 'project', content: 'regla activa' })

        writeRc(dir, { memory: { criticalKeys: ['ghost-key'] } })
        assert.throws(() => renderWorkingContextBlock(engine, dir), /ghost-key/)

        // Inactiva: la misma key quedo superseded por una decision.
        engine.recordNode({ memory_key: 'known-rule', type: 'decision', scope: 'project', content: 'retira la regla' })
        writeRc(dir, { memory: { criticalKeys: ['known-rule'] } })
        assert.throws(() => renderWorkingContextBlock(engine, dir), /known-rule/)
      } finally {
        engine.close()
      }
    })
  })

  it('T9: configuracion ausente, no-array o JSON invalido equivale a [] y el bloque es byte-identico', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'cfg-a', type: 'rule', scope: 'project', content: 'regla A', createdAt: '2020-01-01T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'cfg-b', type: 'rule', scope: 'project', content: 'regla B', createdAt: '2020-01-02T00:00:00.000Z' })
        const baseline = renderWorkingContextBlock(engine, dir) // sin .ancletorc

        const cases = [
          ['sin la clave', '{}\n'],
          ['no-array', '{"memory":{"criticalKeys":"nope"}}\n'],
          ['JSON invalido', '{ no es json'],
          ['lista vacia', '{"memory":{"criticalKeys":[]}}\n'],
          ['entradas no-string', '{"memory":{"criticalKeys":["cfg-a",42]}}\n']
        ]
        for (const [label, raw] of cases) {
          writeRc(dir, raw)
          assert.deepEqual(readCriticalMemoryKeys(dir), [], label)
          assert.equal(renderWorkingContextBlock(engine, dir), baseline, label)
        }
        assert.deepEqual(readCriticalMemoryKeys(join(dir, 'no-existe')), [], 'sin .ancletorc es []')
        assert.deepEqual(readCriticalMemoryKeys(null), [], 'sin raiz es []')
      } finally {
        engine.close()
      }
    })
  })

  it('T11: el refresh on-write propaga el error nombrando la clave y no escribe un bloque degradado', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'onwrite-rule', type: 'rule', scope: 'project', content: 'regla previa' })
        writeWorkingContext(engine, dir)
        const before = readFileSync(workingContextPath(dir), 'utf8')
        assert.match(before, /\[onwrite-rule\]/)

        writeRc(dir, { memory: { criticalKeys: ['missing-onwrite'] } })
        // El caller decide: merge/consolidate dependen de este throw para no reportar OK
        // sobre un bloque derivado desactualizado.
        assert.throws(() => refreshWorkingContextOnWrite(engine, dir), /missing-onwrite/)
        assert.equal(readFileSync(workingContextPath(dir), 'utf8'), before, 'conserva el bloque previo')
      } finally {
        engine.close()
      }
    })
  })

  it('T12: el aviso de overflow (texto, conteo y orden) no cambia sin configuracion critica', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        for (let i = 1; i <= 3; i++) {
          engine.recordNode({
            memory_key: `ov-${i}`,
            type: 'rule',
            scope: 'project',
            content: `OV ${'x'.repeat(5500)}`,
            createdAt: `2026-01-0${4 - i}T00:00:00.000Z`
          })
        }
        const baseline = withoutWarn(() => renderWorkingContextBlock(engine, dir))
        assert.match(
          baseline,
          /<ContextOverflowWarning>Context truncated due to size limits\. 1 rules omitted\. Omitted: ov-3\. Delegate one Recall to @memory-keeper/
        )

        for (const raw of ['{"memory":{"criticalKeys":[]}}\n', '{ roto\n']) {
          writeRc(dir, raw)
          assert.equal(withoutWarn(() => renderWorkingContextBlock(engine, dir)), baseline)
        }
      } finally {
        engine.close()
      }
    })
  })
})

describe('working-context — presupuesto configurable del bloque', () => {
  // `.ancletorc` temporal: string crudo (para JSON invalido) u objeto serializado.
  const writeRc = (dir, value) => {
    writeFileSync(join(dir, '.ancletorc'), typeof value === 'string' ? value : JSON.stringify(value) + '\n')
  }
  // Guarda, fija y restaura la variable de entorno en `finally` para no filtrar
  // el override entre casos.
  const withEnv = (value, fn) => {
    const had = Object.prototype.hasOwnProperty.call(process.env, 'ANCLETO_WORKING_CONTEXT_TOKENS')
    const previous = process.env.ANCLETO_WORKING_CONTEXT_TOKENS
    if (value === undefined) delete process.env.ANCLETO_WORKING_CONTEXT_TOKENS
    else process.env.ANCLETO_WORKING_CONTEXT_TOKENS = value
    try {
      return fn()
    } finally {
      if (had) process.env.ANCLETO_WORKING_CONTEXT_TOKENS = previous
      else delete process.env.ANCLETO_WORKING_CONTEXT_TOKENS
    }
  }
  const captureWarnings = (fn) => {
    const messages = []
    const original = console.warn
    console.warn = (...args) => messages.push(args.join(' '))
    try {
      return { block: fn(), messages }
    } finally {
      console.warn = original
    }
  }

  it('T13: sin entorno ni .ancletorc el default es 4000 tokens y no omite reglas que caben en 16.000 caracteres', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'def-new', type: 'rule', scope: 'project', content: 'D'.repeat(3500), createdAt: '2026-01-02T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'def-old', type: 'rule', scope: 'project', content: 'E'.repeat(3500), createdAt: '2026-01-01T00:00:00.000Z' })

        assert.equal(resolveWorkingContextMaxTokens(dir), DEFAULT_WORKING_CONTEXT_TOKENS)
        const { block, messages } = captureWarnings(() => renderWorkingContextBlock(engine, dir))
        assert.ok(block.includes('[def-new]') && block.includes('[def-old]'), 'entran las dos reglas')
        assert.doesNotMatch(block, /<ContextOverflowWarning>/)
        assert.equal(messages.length, 0, 'sin omisiones no se registra por consola')
        assert.ok(block.length <= DEFAULT_WORKING_CONTEXT_TOKENS * 4, 'el bloque no excede 16.000 caracteres')
        assert.equal(renderWorkingContextBlock(engine, dir), block, 'deterministico con configuracion fija')
      } finally {
        engine.close()
      }
    })
  })

  it('T14: memory.maxTokens valido cambia el corte y el aviso conserva el literal', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'cfg-new', type: 'rule', scope: 'project', content: 'N'.repeat(1800), createdAt: '2026-01-02T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'cfg-old', type: 'rule', scope: 'project', content: 'O'.repeat(1800), createdAt: '2026-01-01T00:00:00.000Z' })

        const baseline = captureWarnings(() => renderWorkingContextBlock(engine, dir))
        assert.ok(baseline.block.includes('[cfg-new]') && baseline.block.includes('[cfg-old]'))

        writeRc(dir, { memory: { maxTokens: 1000 } })
        assert.equal(resolveWorkingContextMaxTokens(dir), 1000)
        const trimmed = captureWarnings(() => renderWorkingContextBlock(engine, dir))
        assert.ok(trimmed.block.includes('[cfg-new]'), 'la mas reciente entra')
        assert.equal(trimmed.block.includes('[cfg-old]'), false, 'la que no cabe queda fuera')
        assert.match(trimmed.block, /1 rules omitted/)
        assert.match(trimmed.block, /Omitted: cfg-old/)
        assert.ok(trimmed.block.length <= 1000 * 4, 'respeta maxTokens x 4')
      } finally {
        engine.close()
      }
    })
  })

  it('T15: 0 y "unlimited" en .ancletorc incluyen todas las reglas sin aviso ni registro', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        for (let i = 1; i <= 3; i++) {
          engine.recordNode({ memory_key: `all-${i}`, type: 'rule', scope: 'project', content: `A${i} ${'x'.repeat(8000)}`, createdAt: `2026-01-0${4 - i}T00:00:00.000Z` })
        }
        for (const maxTokens of [0, 'unlimited']) {
          writeRc(dir, { memory: { maxTokens, criticalKeys: ['all-3'] } })
          assert.equal(resolveWorkingContextMaxTokens(dir), Infinity, `${maxTokens} es sin tope`)
          const { block, messages } = captureWarnings(() => renderWorkingContextBlock(engine, dir))
          for (let i = 1; i <= 3; i++) assert.ok(block.includes(`[all-${i}]`), `entra all-${i}`)
          assert.equal(block.match(/- \[(all-\d)\]/)?.[1], 'all-3', 'la critica va primero tambien sin tope')
          assert.doesNotMatch(block, /<ContextOverflowWarning>/)
          assert.equal(messages.length, 0, 'sin tope no registra omisiones')
          assert.ok(block.length > DEFAULT_WORKING_CONTEXT_TOKENS * 4, 'el bloque excede el techo finito')
          assert.ok(block.startsWith('<ProjectMemoryRules>') && block.endsWith('</ProjectMemoryRules>'), 'XML bien formado')
        }
      } finally {
        engine.close()
      }
    })
  })

  it('T16: el entorno valido prevalece sobre .ancletorc y "unlimited" desactiva el tope', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'env-new', type: 'rule', scope: 'project', content: 'N'.repeat(1800), createdAt: '2026-01-02T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'env-old', type: 'rule', scope: 'project', content: 'O'.repeat(1800), createdAt: '2026-01-01T00:00:00.000Z' })
        writeRc(dir, { memory: { maxTokens: 1000 } })

        withEnv('4000', () => {
          assert.equal(resolveWorkingContextMaxTokens(dir), 4000)
          const { block, messages } = captureWarnings(() => renderWorkingContextBlock(engine, dir))
          assert.ok(block.includes('[env-new]') && block.includes('[env-old]'), 'el entorno 4000 entra las dos')
          assert.equal(messages.length, 0)
        })

        for (const value of ['0', 'unlimited']) {
          writeRc(dir, { memory: { maxTokens: 1000 } })
          withEnv(value, () => {
            assert.equal(resolveWorkingContextMaxTokens(dir), Infinity, `${value} es sin tope`)
            const { block, messages } = captureWarnings(() => renderWorkingContextBlock(engine, dir))
            assert.ok(block.includes('[env-new]') && block.includes('[env-old]'))
            assert.equal(messages.length, 0, 'sin tope no registra omisiones')
          })
        }
      } finally {
        engine.close()
      }
    })
  })

  it('T17: un entorno invalido resuelve al default y NO cae a .ancletorc; vacio si cae', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'env-new', type: 'rule', scope: 'project', content: 'N'.repeat(1800), createdAt: '2026-01-02T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'env-old', type: 'rule', scope: 'project', content: 'O'.repeat(1800), createdAt: '2026-01-01T00:00:00.000Z' })
        writeRc(dir, { memory: { maxTokens: 1000 } })

        withEnv('abc', () => {
          assert.equal(resolveWorkingContextMaxTokens(dir), DEFAULT_WORKING_CONTEXT_TOKENS)
          const { block } = captureWarnings(() => renderWorkingContextBlock(engine, dir))
          assert.ok(block.includes('[env-new]') && block.includes('[env-old]'), 'usa el default 4000, no el 1000 del proyecto')
        })

        withEnv('', () => {
          assert.equal(resolveWorkingContextMaxTokens(dir), 1000, 'un entorno vacio no es override')
        })
      } finally {
        engine.close()
      }
    })
  })

  it('T18: configuracion invalida, ausente o JSON roto resuelve al default sin lanzar', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'inv-rule', type: 'rule', scope: 'project', content: 'regla valida' })
        const baseline = renderWorkingContextBlock(engine, dir)
        const cases = [
          ['-1', { memory: { maxTokens: -1 } }],
          ['1.5', { memory: { maxTokens: 1.5 } }],
          ['"abc"', { memory: { maxTokens: 'abc' } }],
          ['"12abc"', { memory: { maxTokens: '12abc' } }],
          ['"1000" (string numerico en config)', { memory: { maxTokens: '1000' } }],
          ['null', { memory: { maxTokens: null } }],
          ['booleano', { memory: { maxTokens: true } }],
          ['clave ausente', '{"memory":{"criticalKeys":[]}}\n'],
          ['JSON roto', '{ roto\n']
        ]
        for (const [label, value] of cases) {
          writeRc(dir, value)
          assert.equal(resolveWorkingContextMaxTokens(dir), DEFAULT_WORKING_CONTEXT_TOKENS, label)
          assert.equal(renderWorkingContextBlock(engine, dir), baseline, label)
        }
        assert.equal(resolveWorkingContextMaxTokens(join(dir, 'no-existe')), DEFAULT_WORKING_CONTEXT_TOKENS, 'sin .ancletorc')
        assert.equal(resolveWorkingContextMaxTokens(null), DEFAULT_WORKING_CONTEXT_TOKENS, 'sin raiz')
      } finally {
        engine.close()
      }
    })
  })

  it('T19: sin tope una requerida que no cabria en el presupuesto finito entra sin error', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'huge-required', type: 'rule', scope: 'project', content: 'H'.repeat(20000) })
        writeRc(dir, { memory: { maxTokens: 4000, criticalKeys: ['huge-required'] } })
        assert.throws(() => renderWorkingContextBlock(engine, dir), /no entra en el presupuesto del working-context/)

        writeRc(dir, { memory: { maxTokens: 0, criticalKeys: ['huge-required'] } })
        const { block, messages } = captureWarnings(() => renderWorkingContextBlock(engine, dir))
        assert.ok(block.includes('[huge-required]'), 'sin tope la requerida entra')
        assert.doesNotMatch(block, /<ContextOverflowWarning>/)
        assert.equal(messages.length, 0)
      } finally {
        engine.close()
      }
    })
  })

  it('T20: buildWorkingContext con maxTokens null usa el default finito 4000, no "sin tope"', () => {
    withProject((dir) => {
      const engine = createMemoryEngine(join(dir, '.ancleto', 'memory.db'))
      try {
        engine.recordNode({ memory_key: 'big-1', type: 'rule', scope: 'project', content: 'x'.repeat(3000), createdAt: '2026-01-03T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'big-2', type: 'rule', scope: 'project', content: 'y'.repeat(3000), createdAt: '2026-01-02T00:00:00.000Z' })
        engine.recordNode({ memory_key: 'big-3', type: 'rule', scope: 'project', content: 'z'.repeat(12000), createdAt: '2026-01-01T00:00:00.000Z' })

        const finite = captureWarnings(() => engine.buildWorkingContext('project', 4000, dir))
        const withNull = captureWarnings(() => engine.buildWorkingContext('project', null, dir))
        assert.equal(withNull.block, finite.block, 'null equivale al default 4000')
        assert.match(finite.block, /1 rules omitted/, 'corta como presupuesto finito')
        assert.equal(finite.block.includes('[big-3]'), false)
        assert.deepEqual(withNull.messages, finite.messages)
      } finally {
        engine.close()
      }
    })
  })
})