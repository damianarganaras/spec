import { spawnSync } from 'node:child_process'

export const MUSE_SPARK_MODEL = 'opencode/muse-spark-1.3-contributor-free'
export const GRATIS_FALLBACK_MODEL = 'opencode/big-pickle'

// Tabla de modelos por tier: unico dueno. `src/cli/index.js` la importa desde aca.
export const TIERS = {
  normal: {
    orchestrator: 'opencode-go/qwen3.7-plus',
    coder: 'opencode-go/minimax-m3',
    tester: 'opencode-go/deepseek-v4.1-flash',
    'spec-writer': 'opencode-go/qwen3.7-plus',
    reviewer: 'opencode-go/qwen3.6-plus',
    'technical-discovery': 'opencode-go/deepseek-v4.1-flash',
    'technical-seed-writer': 'opencode-go/minimax-m3',
    'memory-keeper': 'opencode-go/deepseek-v4.1-flash',
    'context-resolver': 'opencode-go/deepseek-v4.1-flash',
    documenter: 'opencode-go/deepseek-v4.1-flash'
  },
  minimo: {
    orchestrator: 'commandcode/deepseek/deepseek-v4.1-flash',
    coder: 'commandcode/deepseek/deepseek-v4.1-flash',
    tester: 'commandcode/deepseek/deepseek-v4.1-flash',
    'spec-writer': 'commandcode/deepseek/deepseek-v4.1-flash',
    reviewer: 'commandcode/deepseek/deepseek-v4.1-flash',
    'technical-discovery': 'commandcode/deepseek/deepseek-v4.1-flash',
    'technical-seed-writer': 'commandcode/deepseek/deepseek-v4.1-flash',
    'memory-keeper': 'commandcode/deepseek/deepseek-v4.1-flash',
    'context-resolver': 'commandcode/deepseek/deepseek-v4.1-flash',
    documenter: 'commandcode/deepseek/deepseek-v4.1-flash'
  },
  gratis: {
    orchestrator: 'opencode/big-pickle',
    coder: 'opencode/big-pickle',
    tester: 'opencode/big-pickle',
    'spec-writer': 'opencode/big-pickle',
    reviewer: 'opencode/big-pickle',
    'technical-discovery': 'opencode/big-pickle',
    'technical-seed-writer': 'opencode/big-pickle',
    'memory-keeper': 'opencode/big-pickle',
    'context-resolver': 'opencode/big-pickle',
    documenter: 'opencode/big-pickle'
  }
}

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
