import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GRATIS_FALLBACK_MODEL,
  TIERS,
  TIER_CHAINS,
  isKnownGratisModel,
  gratisModel,
  tierModels
} from '../src/core/tier-models.js'

describe('tier models (gratis)', () => {
  it('gratisModel devuelve el unico modelo gratis conocido', () => {
    assert.equal(GRATIS_FALLBACK_MODEL, 'opencode/big-pickle')
    assert.equal(gratisModel(), GRATIS_FALLBACK_MODEL)
    assert.equal(gratisModel(GRATIS_FALLBACK_MODEL), GRATIS_FALLBACK_MODEL)
    assert.equal(gratisModel('opencode/muse-spark-1.3-contributor-free'), GRATIS_FALLBACK_MODEL)
    assert.equal(gratisModel('proveedor/desconocido'), GRATIS_FALLBACK_MODEL)
  })

  it('isKnownGratisModel solo acepta el modelo gratis vigente', () => {
    assert.equal(isKnownGratisModel(GRATIS_FALLBACK_MODEL), true)
    assert.equal(isKnownGratisModel('opencode/muse-spark-1.3-contributor-free'), false)
    assert.equal(isKnownGratisModel('opencode-go/deepseek-v4.1-flash'), false)
    assert.equal(isKnownGratisModel(undefined), false)
  })

  it('tierModels mapea gratis a un solo modelo', () => {
    assert.deepEqual(
      tierModels('gratis', TIERS, GRATIS_FALLBACK_MODEL),
      { ...Object.fromEntries(Object.keys(TIERS.gratis).map((k) => [k, GRATIS_FALLBACK_MODEL])) }
    )
    assert.deepEqual(
      tierModels('gratis', TIERS),
      { ...Object.fromEntries(Object.keys(TIERS.gratis).map((k) => [k, GRATIS_FALLBACK_MODEL])) }
    )
  })

  it('tiers no-gratis pasan intactos', () => {
    assert.equal(tierModels('normal', TIERS), TIERS.normal)
    assert.equal(tierModels('minimo', TIERS), TIERS.minimo)
  })
})

describe('cadenas de preferencia', () => {
  it('TIER_CHAINS.minimo cubre los mismos agentes que TIERS.minimo', () => {
    assert.deepEqual(Object.keys(TIER_CHAINS.minimo).sort(), Object.keys(TIERS.minimo).sort())
  })

  it('toda cadena tiene al menos un candidato y TIERS.minimo conserva la cabeza', () => {
    for (const [name, chain] of Object.entries(TIER_CHAINS.minimo)) {
      assert.ok(chain.length > 0, `${name} tiene cadena`)
      assert.equal(TIERS.minimo[name], chain[0], `${name}: TIERS.minimo es la cabeza de la cadena`)
    }
  })

  it('no existe el ID roto de Muse Spark ni qwen3.6-plus', () => {
    const all = [
      ...Object.values(TIERS).flatMap((tier) => Object.values(tier)),
      ...Object.values(TIER_CHAINS).flatMap((tier) => Object.values(tier).flat())
    ]
    assert.equal(all.includes('opencode/muse-spark-1.3-contributor-free'), false)
    assert.equal(all.includes('opencode-go/qwen3.6-plus'), false)
  })
})
