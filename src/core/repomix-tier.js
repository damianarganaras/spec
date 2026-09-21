import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

export const TIER_PACK_CONFIG = {
  normal: { extraIgnore: [], compress: false, tokenBudget: null },
  minimo: { extraIgnore: ['test/**', 'docs/**', '**/*.md'], compress: true, tokenBudget: null },
  gratis: { extraIgnore: ['test/**', 'docs/**', '**/*.md'], compress: true, tokenBudget: 50000 }
}

export function readProjectTier(cwd) {
  for (const p of [join(cwd, '.ancleto-tier'), join(cwd, '.opencode', '.ancleto-tier')]) {
    if (!existsSync(p)) continue
    const v = readFileSync(p, 'utf8').trim()
    if (v) return TIER_PACK_CONFIG[v] ? v : 'gratis'
  }
  return 'gratis'
}

export function tierTokenBudget(tier) {
  return (TIER_PACK_CONFIG[tier] || TIER_PACK_CONFIG.gratis).tokenBudget
}

export function buildRepomixArgs(flags, tier, exclude = []) {
  const cfg = TIER_PACK_CONFIG[tier] || TIER_PACK_CONFIG.gratis
  const args = []
  const inc = flagValue(flags, '--include')
  if (inc) args.push('--include', inc)
  const extraIgnore = flagValue(flags, '--ignore')
  const ignore = [...exclude, ...cfg.extraIgnore, ...(extraIgnore ? extraIgnore.split(',') : [])].filter(Boolean)
  if (ignore.length) args.push('--ignore', ignore.join(','))
  if (cfg.compress || flags.includes('--compress')) args.push('--compress')
  return args
}

function flagValue(args, flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}
