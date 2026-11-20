import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readModelDeclarations } from '../src/core/model-declarations.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TEST_DIR, '..')
const MODULE = join(ROOT, 'src', 'core', 'model-declarations.js')

// Fixtures en tmpdir: el collector se prueba sin tocar el repositorio real ni la red.
function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-model-declarations-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
  }
}

function writeFile(root, rel, content) {
  const path = join(root, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

function writeAgent(root, rel, model) {
  writeFile(root, rel, `---\nname: fixture\nmode: subagent\nmodel: ${model}\n---\n`)
}

function writeOpencode(root, config) {
  writeFile(root, 'opencode.json', JSON.stringify(config))
}

// Estructura mínima legible: `agents/`, `profiles/` y `opencode.json` vacío.
function baseFixture(root) {
  mkdirSync(join(root, 'agents'), { recursive: true })
  mkdirSync(join(root, 'profiles'), { recursive: true })
  writeOpencode(root, { agent: {} })
}

describe('readModelDeclarations', () => {
  it('recolecta agents/*.md y profiles/*/agents/*.md con su origen relativo', () => {
    withDir((root) => {
      baseFixture(root)
      writeAgent(root, 'agents/tester.md', 'x/tester')
      writeAgent(root, 'agents/coder.md', 'x/coder')
      writeAgent(root, 'profiles/beta/agents/tester.md', 'x/beta')
      writeAgent(root, 'profiles/alpha/agents/reviewer.md', 'x/alpha')

      assert.deepEqual(readModelDeclarations({ rootDir: root }), [
        { id: 'x/coder', source: 'agents/coder.md' },
        { id: 'x/tester', source: 'agents/tester.md' },
        { id: 'x/alpha', source: 'profiles/alpha/agents/reviewer.md' },
        { id: 'x/beta', source: 'profiles/beta/agents/tester.md' }
      ])
    })
  })

  it('lee opencode.json con origen opencode.json#agent.<nombre>.model y sólo el de la raíz', () => {
    withDir((root) => {
      baseFixture(root)
      writeOpencode(root, {
        agent: {
          orchestrator: { model: 'x/orchestrator' },
          coder: { model: 'x/coder' }
        }
      })
      // `.opencode/**` es estado/mirror local, no una fuente versionada.
      writeFile(root, '.opencode/opencode.json', JSON.stringify({ agent: { coder: { model: 'x/legacy' } } }))
      writeFile(root, '.ancletorc', JSON.stringify({ model: 'x/ancletorc' }))

      const entries = readModelDeclarations({ rootDir: root })
      assert.deepEqual(entries, [
        { id: 'x/coder', source: 'opencode.json#agent.coder.model' },
        { id: 'x/orchestrator', source: 'opencode.json#agent.orchestrator.model' }
      ])
      assert.equal(entries.some((entry) => entry.id === 'x/legacy'), false, 'no lee .opencode/**')
      assert.equal(entries.some((entry) => entry.id === 'x/ancletorc'), false, 'no lee .ancletorc')
    })
  })

  it('ignora valores no string, vacíos y agent ausente o no objeto', () => {
    withDir((root) => {
      baseFixture(root)
      writeOpencode(root, {
        agent: {
          a: { model: 42 },
          b: { model: null },
          c: {},
          d: { model: '  x/recortado  ' },
          e: 'no-es-objeto'
        }
      })
      assert.deepEqual(readModelDeclarations({ rootDir: root }), [
        { id: 'x/recortado', source: 'opencode.json#agent.d.model' }
      ])
    })
    withDir((root) => {
      baseFixture(root)
      writeOpencode(root, { agent: [] })
      assert.deepEqual(readModelDeclarations({ rootDir: root }), [])
    })
    withDir((root) => {
      baseFixture(root)
      writeOpencode(root, {})
      assert.deepEqual(readModelDeclarations({ rootDir: root }), [])
    })
  })

  it('no excluye inherit: esa deduplicación vive en declaredModelIds', () => {
    withDir((root) => {
      baseFixture(root)
      writeFile(root, 'agents/inherit.md', '---\nmodel: inherit\n---\n')
      assert.deepEqual(readModelDeclarations({ rootDir: root }), [
        { id: 'inherit', source: 'agents/inherit.md' }
      ])
    })
  })

  it('es determinista e independiente del orden de creación de archivos', () => {
    withDir((root) => {
      baseFixture(root)
      writeAgent(root, 'agents/zeta.md', 'x/z')
      writeAgent(root, 'agents/alfa.md', 'x/a')
      writeAgent(root, 'profiles/zeta/agents/uno.md', 'x/pz')
      writeAgent(root, 'profiles/alfa/agents/uno.md', 'x/pa')
      writeOpencode(root, { agent: { zeta: { model: 'x/oz' }, alfa: { model: 'x/oa' } } })

      const expected = [
        { id: 'x/a', source: 'agents/alfa.md' },
        { id: 'x/z', source: 'agents/zeta.md' },
        { id: 'x/pa', source: 'profiles/alfa/agents/uno.md' },
        { id: 'x/pz', source: 'profiles/zeta/agents/uno.md' },
        { id: 'x/oa', source: 'opencode.json#agent.alfa.model' },
        { id: 'x/oz', source: 'opencode.json#agent.zeta.model' }
      ]
      assert.deepEqual(readModelDeclarations({ rootDir: root }), expected)
      assert.deepEqual(readModelDeclarations({ rootDir: root }), expected)
    })
  })

  it('falla cerrado si agents/ no se puede leer', () => {
    withDir((root) => {
      mkdirSync(join(root, 'profiles'), { recursive: true })
      writeOpencode(root, { agent: {} })
      assert.throws(
        () => readModelDeclarations({ rootDir: root }),
        /no se pudo leer agents\//
      )
      writeFile(root, 'agents', 'no es un directorio')
      assert.throws(() => readModelDeclarations({ rootDir: root }), /no se pudo leer agents\//)
    })
  })

  it('falla cerrado si profiles/ o el agents/ de un perfil no se pueden leer', () => {
    withDir((root) => {
      mkdirSync(join(root, 'agents'), { recursive: true })
      writeOpencode(root, { agent: {} })
      assert.throws(() => readModelDeclarations({ rootDir: root }), /no se pudo leer profiles\//)
    })
    withDir((root) => {
      baseFixture(root)
      mkdirSync(join(root, 'profiles', 'sin-agentes'), { recursive: true })
      assert.throws(
        () => readModelDeclarations({ rootDir: root }),
        /no se pudo leer profiles\/sin-agentes\/agents\//
      )
    })
  })

  it('falla cerrado si opencode.json falta o no es JSON válido, nombrando la fuente', () => {
    withDir((root) => {
      mkdirSync(join(root, 'agents'), { recursive: true })
      mkdirSync(join(root, 'profiles'), { recursive: true })
      assert.throws(() => readModelDeclarations({ rootDir: root }), /no se pudo leer opencode\.json/)
    })
    withDir((root) => {
      baseFixture(root)
      writeFile(root, 'opencode.json', '{ esto no es JSON')
      assert.throws(
        () => readModelDeclarations({ rootDir: root }),
        /opencode\.json inválido/
      )
    })
  })

  it('no importa child_process ni usa red: sólo node:fs como borde de E/S', () => {
    const source = readFileSync(MODULE, 'utf8')
    assert.equal(source.includes('child_process'), false, 'no importa child_process')
    assert.equal(source.includes('node:http'), false, 'no usa http')
    assert.equal(source.includes('node:https'), false, 'no usa https')
    assert.equal(/\bfetch\s*\(/.test(source), false, 'no usa fetch')
    assert.ok(source.includes("from 'node:fs'"), 'usa node:fs como borde de E/S')
    assert.ok(source.includes('readModelDeclarations'), 'exporta el collector')
  })
})
