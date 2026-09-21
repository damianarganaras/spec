import { spawnSync } from 'node:child_process'

export const MUSE_SPARK_MODEL = 'opencode/muse-spark-1.3-contributor-free'
export const GRATIS_FALLBACK_MODEL = 'opencode/big-pickle'

let probed = null

export function envGratisModel() {
  if (process.env.ANCLETO_MUSE_SPARK === '1') return MUSE_SPARK_MODEL
  if (process.env.ANCLETO_MUSE_SPARK === '0') return GRATIS_FALLBACK_MODEL
  return null
}

export function isKnownGratisModel(model) {
  return model === MUSE_SPARK_MODEL || model === GRATIS_FALLBACK_MODEL
}

export function detectMuseSpark() {
  const env = envGratisModel()
  if (env) return env === MUSE_SPARK_MODEL
  if (probed !== null) return probed
  try {
    const r = spawnSync('opencode models opencode', {
      encoding: 'utf8',
      timeout: 5000,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    probed = !r.error && r.status === 0
      && String(r.stdout || '').split('\n').some((l) => l.trim() === MUSE_SPARK_MODEL)
  } catch {
    probed = false
  }
  return probed
}

export function gratisModel(persisted = null) {
  const env = envGratisModel()
  if (env) return env
  if (isKnownGratisModel(persisted)) return persisted
  return detectMuseSpark() ? MUSE_SPARK_MODEL : GRATIS_FALLBACK_MODEL
}

export function tierModels(tier, tiers, gratisOverride = null) {
  if (tier !== 'gratis') return tiers[tier]
  const model = gratisOverride || gratisModel()
  return Object.fromEntries(Object.keys(tiers.gratis).map((k) => [k, model]))
}
