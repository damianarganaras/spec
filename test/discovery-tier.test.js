import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readProjectTier, buildRepomixArgs, tierTokenBudget, TIER_PACK_CONFIG } from '../src/core/repomix-tier.js'

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'ancleto-tier-'))
  try {
    return fn(dir)
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })
    } catch {
      // best effort
    }
  }
}

function writeTier(dir, value, atRoot = true) {
  if (atRoot) {
    writeFileSync(join(dir, '.ancleto-tier'), value)
  } else {
    mkdirSync(join(dir, '.opencode'), { recursive: true })
    writeFileSync(join(dir, '.opencode', '.ancleto-tier'), value)
  }
}

describe('Discovery token budgeting (D2)', () => {
  it('readProjectTier: fallback gratis sin archivo', () => {
    withDir((dir) => {
      assert.equal(readProjectTier(dir), 'gratis')
    })
  })

  it('readProjectTier: fallback gratis con archivo vacio', () => {
    withDir((dir) => {
      writeTier(dir, '\n')
      assert.equal(readProjectTier(dir), 'gratis')
    })
  })

  it('readProjectTier: fallback gratis con tier invalido', () => {
    withDir((dir) => {
      writeTier(dir, 'premium\n')
      assert.equal(readProjectTier(dir), 'gratis')
    })
  })

  it('readProjectTier: lee los 3 tiers desde la raiz y desde .opencode/', () => {
    withDir((dir) => {
      for (const tier of ['normal', 'minimo', 'gratis']) {
        writeTier(dir, tier + '\n', true)
        assert.equal(readProjectTier(dir), tier, `raiz ${tier}`)
        writeTier(dir, tier + '\n', false)
        assert.equal(readProjectTier(dir), tier, `.opencode ${tier}`)
      }
    })
  })

  it('buildRepomixArgs: normal no agrega restricciones extra', () => {
    const args = buildRepomixArgs([], 'normal')
    assert.deepEqual(args, [])
  })

  it('buildRepomixArgs: minimo agrega exclusiones y compresion', () => {
    const args = buildRepomixArgs([], 'minimo')
    assert.ok(args.includes('--compress'))
    const ii = args.indexOf('--ignore')
    assert.ok(ii >= 0)
    assert.equal(args[ii + 1], 'test/**,docs/**,**/*.md')
  })

  it('buildRepomixArgs: gratis agrega exclusiones, compresion y budget 50000', () => {
    const args = buildRepomixArgs([], 'gratis')
    assert.ok(args.includes('--compress'))
    const ii = args.indexOf('--ignore')
    assert.ok(ii >= 0)
    assert.equal(args[ii + 1], 'test/**,docs/**,**/*.md')
    assert.equal(TIER_PACK_CONFIG.gratis.tokenBudget, 50000)
    assert.equal(tierTokenBudget('gratis'), 50000)
    assert.equal(tierTokenBudget('normal'), null)
    assert.equal(tierTokenBudget('minimo'), null)
  })

  it('buildRepomixArgs: mergea exclude del manifiesto y --ignore del usuario', () => {
    const args = buildRepomixArgs(['--ignore', 'vendor/**'], 'minimo', ['fixtures/**'])
    const ii = args.indexOf('--ignore')
    assert.ok(ii >= 0)
    assert.equal(args[ii + 1], 'fixtures/**,test/**,docs/**,**/*.md,vendor/**')
  })

  it('buildRepomixArgs: respeta --include y --compress del usuario', () => {
    const args = buildRepomixArgs(['--include', 'src/**.ts', '--compress'], 'normal')
    assert.deepEqual(args, ['--include', 'src/**.ts', '--compress'])
  })
})
