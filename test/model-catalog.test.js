import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  GRATIS_FALLBACK_MODEL,
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
  // Todos los candidatos de todas las cadenas, no sólo las cabezas: un fallback
  // inexistente también debe romper el guard.
  for (const [tier, chains] of Object.entries(TIER_CHAINS)) {
    for (const [agent, chain] of Object.entries(chains)) {
      chain.forEach((id, index) => {
        declared.push({ id, source: `TIER_CHAINS.${tier}.${agent}[${index}]` })
      })
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

// Copia temporal del snapshot sin los IDs indicados. No muta el archivo versionado.
function catalogWithout(dir, ids, name) {
  const catalog = clone(loadModelCatalog())
  for (const entries of Object.values(catalog.providers)) {
    for (let i = entries.length - 1; i >= 0; i--) {
      if (ids.includes(entries[i].id)) entries.splice(i, 1)
    }
  }
  const path = join(dir, name)
  writeFileSync(path, JSON.stringify(catalog))
  return path
}

function withCatalogEnv(path, fn) {
  const previous = process.env.ANCLETO_MODEL_CATALOG
  process.env.ANCLETO_MODEL_CATALOG = path
  try {
    return fn()
  } finally {
    if (previous === undefined) delete process.env.ANCLETO_MODEL_CATALOG
    else process.env.ANCLETO_MODEL_CATALOG = previous
  }
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

  it('un ID declarado en TIERS, agents/ o profiles/ ausente del snapshot rompe el guard', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-catalog-guard-'))
    try {
      const declared = declaredModels()
      const sources = [
        declared.find((d) => d.source.startsWith('TIERS.')),
        declared.find((d) => d.source.startsWith('agents/')),
        declared.find((d) => d.source.startsWith('profiles/'))
      ]
      assert.equal(sources.length, 3, 'hay declaraciones en TIERS, agents/ y profiles/')
      sources.forEach((item, index) => {
        const path = catalogWithout(dir, [item.id], `guard-${index}.json`)
        withCatalogEnv(path, () => {
          assert.deepEqual(
            missingModelIds(loadModelCatalog(), [item.id]),
            [item.id],
            `${item.source} declara ${item.id}, ausente del catálogo temporal`
          )
        })
      })
      // Las declaraciones siguen cubiertas por el snapshot commiteado.
      assert.deepEqual(missingModelIds(loadModelCatalog(), declared.map((d) => d.id)), [])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('un candidato no cabeza de TIER_CHAINS ausente del snapshot rompe el guard', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-catalog-chain-'))
    try {
      const chain = TIER_CHAINS.minimo.coder
      const fallback = chain[chain.length - 1]
      assert.notEqual(fallback, chain[0], 'el candidato elegido no es la cabeza de la cadena')
      const declared = declaredModels()
      // Este ID no lo declaran TIERS, agents/ ni profiles/: sin la cobertura de las
      // cadenas, el guard quedaría ciego a su ausencia.
      assert.ok(declared.some((d) => d.source.startsWith('TIER_CHAINS.') && d.id === fallback))
      assert.equal(
        declared.some((d) => !d.source.startsWith('TIER_CHAINS.') && d.id === fallback),
        false,
        `${fallback} sólo se declara a través de TIER_CHAINS`
      )
      const path = catalogWithout(dir, [fallback], 'chain-fallback.json')
      withCatalogEnv(path, () => {
        const missing = missingModelIds(loadModelCatalog(), declared.map((d) => d.id))
        assert.ok(missing.includes(fallback), `el guard reporta ${fallback} ausente`)
      })
      // El snapshot commiteado sigue cubriendo todos los candidatos.
      assert.deepEqual(missingModelIds(loadModelCatalog(), declared.map((d) => d.id)), [])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gratis resuelve al único modelo gratuito y su costo es 0 en el snapshot', () => {
    const catalog = loadModelCatalog()
    const gratisIds = new Set(Object.values(TIERS.gratis))
    assert.deepEqual([...gratisIds], [GRATIS_FALLBACK_MODEL])
    const entries = Object.values(catalog.providers).flat()
    for (const id of gratisIds) {
      const entry = entries.find((e) => e.id === id)
      assert.ok(entry, `${id} figura en el snapshot`)
      assert.equal(entry.cost.input, 0, `${id}: costo de entrada 0`)
      assert.equal(entry.cost.output, 0, `${id}: costo de salida 0`)
    }
    const resolved = resolveTierModels('gratis', catalog)
    assert.deepEqual(new Set(Object.values(resolved.models)), new Set([GRATIS_FALLBACK_MODEL]))
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
