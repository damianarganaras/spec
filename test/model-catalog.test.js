import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  TIERS,
  TIER_CHAINS,
  loadModelCatalog,
  missingModelIds,
  resolveTierModels
} from '../src/core/tier-models.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TEST_DIR, '..')

function modelOf(file) {
  const content = readFileSync(file, 'utf8')
  const match = content.match(/^model: (.+)$/m)
  assert.ok(match, `${file} declara un model:`)
  return match[1].trim()
}

// Todo ID versionado que el snapshot debe cubrir, con su archivo de origen.
function declaredModels() {
  const declared = []
  for (const [tier, models] of Object.entries(TIERS)) {
    for (const [agent, model] of Object.entries(models)) {
      declared.push({ id: model, source: `TIERS.${tier}.${agent}` })
    }
  }
  const agentsDir = join(ROOT, 'agents')
  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
    declared.push({ id: modelOf(join(agentsDir, file)), source: `agents/${file}` })
  }
  const profilesDir = join(ROOT, 'profiles')
  for (const profile of readdirSync(profilesDir)) {
    const agentsDirProfile = join(profilesDir, profile, 'agents')
    let files = []
    try {
      files = readdirSync(agentsDirProfile).filter((f) => f.endsWith('.md'))
    } catch {
      continue
    }
    for (const file of files) {
      declared.push({ id: modelOf(join(agentsDirProfile, file)), source: `profiles/${profile}/agents/${file}` })
    }
  }
  return declared
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function catalogWith(chain) {
  return { providers: { test: chain } }
}

describe('snapshot de catálogo', () => {
  it('declara generated_at, método y proveedores con IDs completos', () => {
    const catalog = loadModelCatalog()
    assert.match(catalog.generated_at, /^\d{4}-\d{2}-\d{2}$/)
    assert.match(catalog.source.method, /opencode models <provider> --verbose/)
    for (const [provider, entries] of Object.entries(catalog.providers)) {
      assert.ok(entries.length > 0, `${provider} tiene IDs`)
      for (const entry of entries) {
        assert.ok(entry.id.startsWith(`${provider}/`), `${entry.id} matchea su proveedor`)
      }
    }
  })

  it('todos los IDs de TIERS, agents/*.md y profiles/*/agents/*.md están en el snapshot', () => {
    const catalog = loadModelCatalog()
    const missing = missingModelIds(catalog, declaredModels().map((d) => d.id))
    assert.deepEqual(missing, [], `IDs ausentes del snapshot: ${missing.join(', ')}`)
  })

  it('el guard falla cuando se retira un ID real del catálogo (sin mutar el snapshot)', () => {
    const catalog = clone(loadModelCatalog())
    const target = 'opencode-go/qwen3.8-max'
    catalog.providers['opencode-go'] = catalog.providers['opencode-go'].filter((entry) => entry.id !== target)
    assert.deepEqual(missingModelIds(catalog, [target]), [target])
    // El snapshot commiteado sigue conteniendo el ID.
    assert.deepEqual(missingModelIds(loadModelCatalog(), [target]), [])
  })

  it('ANCLETO_MODEL_CATALOG permite apuntar a un catálogo alternativo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-catalog-'))
    try {
      const path = join(dir, 'alt.json')
      writeFileSync(path, JSON.stringify({ providers: { alt: ['alt/model'] } }))
      const previous = process.env.ANCLETO_MODEL_CATALOG
      process.env.ANCLETO_MODEL_CATALOG = path
      try {
        assert.deepEqual(loadModelCatalog().providers, { alt: ['alt/model'] })
      } finally {
        if (previous === undefined) delete process.env.ANCLETO_MODEL_CATALOG
        else process.env.ANCLETO_MODEL_CATALOG = previous
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('resolver puro de cadenas', () => {
  const chain = TIER_CHAINS.minimo.coder

  it('elige el primer candidato disponible y expone candidatos estáticos', () => {
    const resolved = resolveTierModels('minimo', catalogWith(chain))
    assert.equal(resolved.models.coder, chain[0])
    assert.deepEqual(resolved.candidates.coder, chain)
    assert.deepEqual(resolved.unresolved, [])
  })

  it('sin la cabeza elige el segundo; sin cabeza ni segundo elige el tercero', () => {
    assert.equal(resolveTierModels('minimo', catalogWith(chain.slice(1))).models.coder, chain[1])
    assert.equal(resolveTierModels('minimo', catalogWith(chain.slice(2))).models.coder, chain[2])
  })

  it('sin ningún candidato lanza un error que nombra el agente y la cadena', () => {
    assert.throws(
      () => resolveTierModels('minimo', catalogWith([])),
      (err) => Object.keys(TIERS.minimo).some((name) => err.message.includes(`'${name}'`))
        && chain.every((id) => err.message.includes(id))
    )
  })

  it('allowUnresolved deja el agente sin resolver para el oráculo de check', () => {
    const resolved = resolveTierModels('minimo', catalogWith([]), { allowUnresolved: true })
    assert.deepEqual(resolved.unresolved, Object.keys(TIERS.minimo))
    assert.equal(resolved.models.coder, undefined)
    assert.deepEqual(resolved.candidates.coder, chain)
  })

  it('es puro: dos catálogos en memoria producen resoluciones distintas', () => {
    const a = resolveTierModels('minimo', catalogWith([chain[0]]))
    const b = resolveTierModels('minimo', catalogWith([chain[1]]))
    assert.notEqual(a.models.coder, b.models.coder)
    assert.deepEqual(resolveTierModels('minimo', catalogWith([chain[0]])).models, a.models)
  })

  it('los tiers sin cadena delegan en el comportamiento actual', () => {
    assert.deepEqual(resolveTierModels('normal', catalogWith([])).models, TIERS.normal)
    assert.deepEqual(
      resolveTierModels('gratis', catalogWith([]), { gratisOverride: 'opencode/big-pickle' }).models,
      TIERS.gratis
    )
  })

  it('el módulo de tiers no importa node:child_process', () => {
    const source = readFileSync(join(ROOT, 'src', 'core', 'tier-models.js'), 'utf8')
    assert.equal(source.includes('child_process'), false)
  })
})
