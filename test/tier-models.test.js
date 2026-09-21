import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MUSE_SPARK_MODEL,
  GRATIS_FALLBACK_MODEL,
  envGratisModel,
  isKnownGratisModel,
  detectMuseSpark,
  gratisModel,
  tierModels
} from '../src/core/tier-models.js'

const TIERS = {
  normal: { orchestrator: 'opencode-go/qwen3.7-plus' },
  minimo: { orchestrator: 'opencode-go/deepseek-v4.1-flash' },
  gratis: { orchestrator: 'opencode/big-pickle', coder: 'opencode/big-pickle' }
}

function withEnv(value, fn) {
  process.env.ANCLETO_MUSE_SPARK = value
  try {
    return fn()
  } finally {
    delete process.env.ANCLETO_MUSE_SPARK
  }
}

describe('tier models (gratis muse-spark)', () => {
  it('env ANCLETO_MUSE_SPARK fuerza la eleccion sin probe', () => {
    withEnv('1', () => {
      assert.equal(envGratisModel(), MUSE_SPARK_MODEL)
      assert.equal(gratisModel(), MUSE_SPARK_MODEL)
      assert.equal(MUSE_SPARK_MODEL, 'opencode/muse-spark-1.3-contributor-free')
    })
    withEnv('0', () => {
      assert.equal(envGratisModel(), GRATIS_FALLBACK_MODEL)
      assert.equal(gratisModel(), GRATIS_FALLBACK_MODEL)
      assert.equal(GRATIS_FALLBACK_MODEL, 'opencode/big-pickle')
    })
    withEnv('', () => {
      assert.equal(envGratisModel(), null)
    })
  })

  it('el modelo persistido gana sobre el probe', () => {
    withEnv('', () => {
      assert.equal(gratisModel(MUSE_SPARK_MODEL), MUSE_SPARK_MODEL)
      assert.equal(gratisModel(GRATIS_FALLBACK_MODEL), GRATIS_FALLBACK_MODEL)
    })
    // env sigue mandando sobre lo persistido
    withEnv('0', () => {
      assert.equal(gratisModel(MUSE_SPARK_MODEL), GRATIS_FALLBACK_MODEL)
    })
  })

  it('isKnownGratisModel valida solo los dos modelos soportados', () => {
    assert.equal(isKnownGratisModel(MUSE_SPARK_MODEL), true)
    assert.equal(isKnownGratisModel(GRATIS_FALLBACK_MODEL), true)
    assert.equal(isKnownGratisModel('opencode-go/deepseek-v4.1-flash'), false)
    assert.equal(isKnownGratisModel(undefined), false)
  })

  it('detectMuseSpark respeta el override de entorno', () => {
    withEnv('1', () => assert.equal(detectMuseSpark(), true))
    withEnv('0', () => assert.equal(detectMuseSpark(), false))
  })

  it('tierModels mapea gratis a un solo modelo', () => {
    assert.deepEqual(
      tierModels('gratis', TIERS, MUSE_SPARK_MODEL),
      { orchestrator: MUSE_SPARK_MODEL, coder: MUSE_SPARK_MODEL }
    )
    assert.deepEqual(
      tierModels('gratis', TIERS, GRATIS_FALLBACK_MODEL),
      { orchestrator: GRATIS_FALLBACK_MODEL, coder: GRATIS_FALLBACK_MODEL }
    )
  })

  it('tiers no-gratis pasan intactos', () => {
    assert.equal(tierModels('normal', TIERS), TIERS.normal)
    assert.equal(tierModels('minimo', TIERS), TIERS.minimo)
  })
})
