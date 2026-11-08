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
  declaredModelIds,
  loadModelCatalog,
  missingModelIds,
  resolveTierModels
} from '../src/core/tier-models.js'
import { missingModelIdsInCatalog, validateCatalogSnapshot } from '../src/core/model-catalog.js'

const TEST_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = join(TEST_DIR, '..')

function modelOf(file) {
  const content = readFileSync(file, 'utf8')
  const match = content.match(/^model: (.+)$/m)
  assert.ok(match, `${file} declara un model:`)
  return match[1].trim()
}

// Declaraciones `model:` leídas de las fuentes versionadas. El cálculo del conjunto
// declarado y su deduplicación viven en `declaredModelIds` (tier-models); acá sólo se
// recolectan los archivos para no duplicar esa lógica en el test.
function agentModelEntries() {
  const entries = []
  const agentsDir = join(ROOT, 'agents')
  for (const file of readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
    entries.push({ id: modelOf(join(agentsDir, file)), source: `agents/${file}` })
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
      entries.push({ id: modelOf(join(agentsDirProfile, file)), source: `profiles/${profile}/agents/${file}` })
    }
  }
  return entries
}

// Resumen legible de los IDs ausentes que nombra el origen de cada declaración.
function missingSummary(missing) {
  return missing.map((item) => `${item.id} (${item.source || 'sin origen'})`).join(', ')
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
  it('el snapshot real commiteado satisface validateCatalogSnapshot', () => {
    assert.deepEqual(validateCatalogSnapshot(loadModelCatalog()), { ok: true, errors: [] })
  })

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

  it('todos los IDs de TIERS, TIER_CHAINS, agents/*.md y profiles/*/agents/*.md están en el snapshot', () => {
    const catalog = loadModelCatalog()
    const tierIds = declaredModelIds()
    const fileIds = declaredModelIds({ tiers: {}, chains: {}, agentModels: agentModelEntries() })
    assert.ok([...tierIds.values()].some((source) => source.startsWith('TIERS.')), 'TIERS aporta declaraciones')
    assert.ok([...tierIds.values()].some((source) => source.startsWith('TIER_CHAINS.')), 'TIER_CHAINS aporta declaraciones')
    assert.ok([...fileIds.values()].some((source) => source.startsWith('agents/')), 'agents/ aporta declaraciones')
    assert.ok([...fileIds.values()].some((source) => source.startsWith('profiles/')), 'profiles/ aporta declaraciones')
    assert.equal(fileIds.has('inherit'), false, 'inherit no se exige en el catálogo')
    for (const [label, declared] of [['TIERS/TIER_CHAINS', tierIds], ['agents/profiles', fileIds]]) {
      const missing = missingModelIdsInCatalog(catalog, declared)
      assert.deepEqual(missing, [], `${label}: IDs ausentes del snapshot: ${missingSummary(missing)}`)
    }
  })

  it('el guard falla cuando se retira un ID real del catálogo (sin mutar el snapshot)', () => {
    const catalog = clone(loadModelCatalog())
    const target = 'opencode-go/qwen3.8-max'
    catalog.providers['opencode-go'] = catalog.providers['opencode-go'].filter((entry) => entry.id !== target)
    assert.deepEqual(missingModelIds(catalog, [target]), [target])
    // El snapshot commiteado sigue conteniendo el ID.
    assert.deepEqual(missingModelIds(loadModelCatalog(), [target]), [])
  })

  it('un ID declarado en TIERS, TIER_CHAINS, agents/ o profiles/ ausente del snapshot rompe el guard', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ancleto-catalog-guard-'))
    try {
      const tierIds = declaredModelIds()
      const fileIds = declaredModelIds({ tiers: {}, chains: {}, agentModels: agentModelEntries() })
      const groups = [
        ['TIERS.', tierIds],
        ['TIER_CHAINS.', tierIds],
        ['agents/', fileIds],
        ['profiles/', fileIds]
      ]
      groups.forEach(([prefix, declared], index) => {
        const item = [...declared].find(([, source]) => source.startsWith(prefix))
        assert.ok(item, `${prefix} aporta declaraciones`)
        const [id, source] = item
        const path = catalogWithout(dir, [id], `guard-${index}.json`)
        withCatalogEnv(path, () => {
          const missing = missingModelIdsInCatalog(loadModelCatalog(), declared)
          const hit = missing.find((entry) => entry.id === id && entry.source === source)
          assert.ok(hit, `${source} declara ${id}, ausente del catálogo temporal`)
          assert.ok(
            missing.every((entry) => entry.id === id),
            `el guard sólo reporta el ID retirado: ${missingSummary(missing)}`
          )
        })
      })
      // Las declaraciones siguen cubiertas por el snapshot commiteado.
      for (const [label, declared] of [['TIERS/TIER_CHAINS', tierIds], ['agents/profiles', fileIds]]) {
        const missing = missingModelIdsInCatalog(loadModelCatalog(), declared)
        assert.deepEqual(missing, [], `${label}: IDs ausentes del snapshot: ${missingSummary(missing)}`)
      }
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
      const declared = declaredModelIds()
      // Este ID no lo declaran TIERS, agents/ ni profiles/: sin la cobertura de las
      // cadenas, el guard quedaría ciego a su ausencia.
      assert.ok(declared.has(fallback))
      assert.match(declared.get(fallback), /^TIER_CHAINS\./)
      assert.equal(
        [...declared].some(([id, source]) => id === fallback && !source.startsWith('TIER_CHAINS.')),
        false,
        `${fallback} sólo se declara a través de TIER_CHAINS`
      )
      const path = catalogWithout(dir, [fallback], 'chain-fallback.json')
      withCatalogEnv(path, () => {
        const missing = missingModelIdsInCatalog(loadModelCatalog(), declared)
        assert.ok(
          missing.some((entry) => entry.id === fallback && entry.source.startsWith('TIER_CHAINS.')),
          `el guard reporta ${fallback} ausente con su origen TIER_CHAINS`
        )
      })
      // El snapshot commiteado sigue cubriendo todos los candidatos.
      const missing = missingModelIdsInCatalog(loadModelCatalog(), declared)
      assert.deepEqual(missing, [], `IDs ausentes del snapshot: ${missingSummary(missing)}`)
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

describe('declaredModelIds', () => {
  it('incluye los tres tiers y todos los candidatos de TIER_CHAINS, sin inherit', () => {
    const declared = declaredModelIds()
    assert.ok(declared instanceof Map)
    for (const [tier, models] of Object.entries(TIERS)) {
      for (const [agent, model] of Object.entries(models)) {
        assert.ok(declared.has(model), `TIERS.${tier}.${agent} declara ${model}`)
        assert.ok(declared.get(model).startsWith('TIERS.'), `${model} conserva un origen de TIERS`)
      }
    }
    for (const [tier, chains] of Object.entries(TIER_CHAINS)) {
      for (const [agent, chain] of Object.entries(chains)) {
        chain.forEach((id, index) => {
          assert.ok(declared.has(id), `TIER_CHAINS.${tier}.${agent}[${index}] declara ${id}`)
        })
      }
    }
    // `opencode/deepseek-v4.1-flash-free` sólo se declara a través de TIER_CHAINS,
    // no a través del índice concreto que ocupe en la cadena de dos.
    const chainOnly = TIER_CHAINS.minimo.coder[TIER_CHAINS.minimo.coder.length - 1]
    assert.ok(
      declared.get(chainOnly).startsWith('TIER_CHAINS.minimo.'),
      `${chainOnly} se declara vía TIER_CHAINS.minimo.* (origen: ${declared.get(chainOnly)})`
    )
    assert.equal(declared.has('inherit'), false)
  })

  it('suma los model: de agentes y perfiles, deduplica y conserva el primer origen', () => {
    const declared = declaredModelIds({
      tiers: {},
      chains: {},
      agentModels: [
        { id: 'inherit', source: 'agents/inherit.md' },
        { id: 'x/model', source: 'agents/a.md' },
        { id: 'x/model', source: 'profiles/p/agents/a.md' },
        { id: 'y/model' },
        { id: 'inherit', source: 'profiles/p/agents/b.md' },
        'z/model'
      ]
    })
    assert.deepEqual([...declared.keys()], ['x/model', 'y/model', 'z/model'])
    assert.equal(declared.get('x/model'), 'agents/a.md')
    assert.equal(declared.get('y/model'), 'agents')
    assert.equal(declared.get('z/model'), 'agents')
  })
})

describe('missingModelIdsInCatalog', () => {
  it('no reporta nada cuando TIERS y TIER_CHAINS existen en el snapshot real', () => {
    assert.deepEqual(missingModelIdsInCatalog(loadModelCatalog(), declaredModelIds()), [])
  })

  it('reporta los IDs ausentes conservando su origen y acepta strings y Map', () => {
    const catalog = { providers: { alpha: [{ id: 'alpha/a' }] } }
    assert.deepEqual(
      missingModelIdsInCatalog(catalog, [
        { id: 'alpha/a', source: 'TIERS.a' },
        { id: 'alpha/b', source: 'agents/x.md' }
      ]),
      [{ id: 'alpha/b', source: 'agents/x.md' }]
    )
    assert.deepEqual(
      missingModelIdsInCatalog(catalog, ['alpha/a', 'beta/b']),
      [{ id: 'beta/b', source: null }]
    )
    assert.deepEqual(
      missingModelIdsInCatalog(catalog, new Map([['alpha/a', 'TIERS.a'], ['beta/b', 'agents/y.md']])),
      [{ id: 'beta/b', source: 'agents/y.md' }]
    )
  })

  it('un snapshot vacío reporta todas las entradas y no muta el snapshot', () => {
    const catalog = { providers: {} }
    const before = clone(catalog)
    assert.deepEqual(missingModelIdsInCatalog(catalog, ['a/a']), [{ id: 'a/a', source: null }])
    assert.deepEqual(catalog, before)
  })

  it('acepta entradas string en el snapshot', () => {
    assert.deepEqual(
      missingModelIdsInCatalog({ providers: { a: ['a/a'] } }, ['a/a', 'a/b']),
      [{ id: 'a/b', source: null }]
    )
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

  it('sin la cabeza elige el segundo candidato de la cadena', () => {
    assert.equal(resolveTierModels('minimo', catalogWith(chain.slice(1))).models.coder, chain[1])
  })

  it('sin ningún candidato lanza un error que nombra el agente y la cadena', () => {
    assert.throws(
      () => resolveTierModels('minimo', catalogWith([])),
      (err) => Object.keys(TIERS.minimo).some((name) => err.message.includes(`'${name}'`))
        && chain.every((id) => err.message.includes(id))
        && !/scripts[\\/]/.test(err.message)
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

  it('los módulos puros de tiers y catálogo no importan node:child_process', () => {
    for (const file of ['tier-models.js', 'model-catalog.js']) {
      const source = readFileSync(join(ROOT, 'src', 'core', file), 'utf8')
      assert.equal(source.includes('child_process'), false, `${file} no importa child_process`)
    }
  })
})
