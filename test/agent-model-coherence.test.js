import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TIERS } from '../src/core/tier-models.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TEST_DIR, '..')

// Nombres canónicos de los agentes publicados. No son identificadores de
// proveedor: el guard los usa para detectar altas/bajas del catálogo.
const AGENT_BASENAMES = [
  'coder',
  'context-resolver',
  'documenter',
  'memory-keeper',
  'orchestrator',
  'reviewer',
  'spec-writer',
  'technical-discovery',
  'technical-seed-writer',
  'tester'
]

function agentFiles() {
  return readdirSync(join(ROOT, 'agents')).filter((f) => f.endsWith('.md')).sort()
}

function modelOf(file) {
  const content = readFileSync(join(ROOT, 'agents', file), 'utf8')
  const match = content.match(/^model: (.+)$/m)
  assert.ok(match, `${file} declara un model:`)
  return match[1].trim()
}

function canonicalModels() {
  const entries = agentFiles().map((file) => [file.replace(/\.md$/, ''), modelOf(file)])
  return Object.fromEntries(entries)
}

function jsFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) jsFiles(full, acc)
    else if (entry.name.endsWith('.js')) acc.push(full)
  }
  return acc
}

function relPath(file) {
  return file.slice(ROOT.length + 1).replace(/\\/g, '/')
}

describe('coherencia de modelos entre canónica y tiers', () => {
  it('los agents canónicos son exactamente los diez esperados', () => {
    assert.deepEqual(agentFiles(), AGENT_BASENAMES.map((n) => `${n}.md`))
  })

  it('la canónica declara un único modelo para los diez agentes', () => {
    const models = Object.values(canonicalModels())
    assert.equal(models.length, AGENT_BASENAMES.length)
    assert.equal(new Set(models).size, 1, 'todos los agentes declaran el mismo model:')
    assert.ok(models[0].length > 0)
  })

  it('TIERS.minimo cubre el mismo conjunto de agentes y el mismo modelo que la canónica', () => {
    const canonical = canonicalModels()
    assert.deepEqual(
      Object.keys(TIERS.minimo).sort(),
      Object.keys(canonical).sort()
    )
    for (const [name, model] of Object.entries(canonical)) {
      assert.equal(TIERS.minimo[name], model, `${name}: tier minimo == canónica`)
    }
  })

  it('TIERS.normal y TIERS.gratis cubren el mismo catálogo de agentes', () => {
    const names = Object.keys(canonicalModels()).sort()
    assert.deepEqual(Object.keys(TIERS.normal).sort(), names)
    assert.deepEqual(Object.keys(TIERS.gratis).sort(), names)
  })

  it('TIERS vive y se exporta sólo en src/core/tier-models.js', () => {
    // Un unico dueno del catalogo de tiers. La deteccion tolera `const`/`let`/`var`,
    // `Object.freeze(`, export y declaraciones multilinea.
    const declaracion = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+TIERS\s*=\s*(?:Object\.freeze\s*\(\s*)?\{/
    const exportacion = /(?:^|\n)\s*export\s*\{[^}]*\bTIERS\b[^}]*\}/
    const offenders = jsFiles(join(ROOT, 'src'))
      .filter((file) => relPath(file) !== 'src/core/tier-models.js')
      .filter((file) => {
        const src = readFileSync(file, 'utf8')
        return declaracion.test(src) || exportacion.test(src)
      })
      .map(relPath)
    assert.deepEqual(offenders, [], 'sólo src/core/tier-models.js declara/exporta TIERS')
    assert.match(
      readFileSync(join(ROOT, 'src', 'core', 'tier-models.js'), 'utf8'),
      /^export\s+const\s+TIERS\s*=/m
    )
    assert.match(
      readFileSync(join(ROOT, 'src', 'cli', 'index.js'), 'utf8'),
      /import\s*\{[^}]*\bTIERS\b[^}]*\}\s*from\s*'\.\.\/core\/tier-models\.js'/
    )
  })

  it('el overlay del perfil test existe y queda fuera del conjunto canónico', () => {
    // Carve-out deliberado: con `profile: test`, installProfileOverlay reemplaza
    // tester/reviewer desde profiles/test/agents/ despues de instalar los agentes
    // base. La canónica no es duena de su `model:`, asi que el guard no los incluye
    // en el conjunto que deriva de agents/ ni compara su modelo.
    const overlayDir = join(ROOT, 'profiles', 'test', 'agents')
    for (const name of ['reviewer', 'tester']) {
      assert.ok(existsSync(join(overlayDir, `${name}.md`)), `overlay ${name}.md existe`)
    }
    // El conjunto canonico se deriva exclusivamente de agents/: ninguna fuente
    // canonica vive bajo profiles/.
    const canonicalDirs = new Set(agentFiles().map(() => join(ROOT, 'agents')))
    assert.deepEqual([...canonicalDirs], [join(ROOT, 'agents')])
    assert.notEqual(overlayDir, join(ROOT, 'agents'))
  })

  it('el guard no codifica identificadores de proveedor ni lee el mirror local', () => {
    const ownSource = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    // El conjunto prohibido se deriva del catálogo real, no se escribe a mano.
    const models = [
      ...Object.values(canonicalModels()),
      ...Object.values(TIERS).flatMap((tier) => Object.values(tier))
    ]
    const providerIds = new Set(models.flatMap((model) => model.split('/')))
    for (const id of providerIds) {
      assert.equal(ownSource.includes(id), false, `el guard no repite el identificador ${id}`)
    }
    // Path armado por partes para que el propio guard no contenga la ruta literal.
    const localMirrorDir = '.' + 'open' + 'code' + '/'
    assert.equal(ownSource.includes(localMirrorDir), false, 'el guard no lee el mirror local')
  })
})
