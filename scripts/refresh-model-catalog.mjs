#!/usr/bin/env node
/**
 * Refresca el snapshot de catálogo `src/core/model-catalog.json`.
 *
 * MANUAL, nunca en CI ni como parte de `install`/`check`: ejecuta
 * `opencode models <provider> --verbose` contra la máquina local y reescribe el JSON.
 * Revisá el diff antes de commitear.
 *
 * Uso:
 *   node scripts/refresh-model-catalog.mjs
 *
 * Si `opencode` no está disponible, un proveedor falla o no se parsea ningún ID, el
 * script aborta con exit 1 y NO escribe un snapshot vacío.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG = join(ROOT, 'src', 'core', 'model-catalog.json')
const METHOD = 'opencode models <provider> --verbose'

function readCurrent() {
  return JSON.parse(readFileSync(CATALOG, 'utf8'))
}

function runProvider(provider) {
  const result = spawnSync('opencode', ['models', provider, '--verbose'], {
    encoding: 'utf8',
    timeout: 60000,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  if (result.error) {
    fail(`no se pudo ejecutar 'opencode models ${provider} --verbose': ${result.error.message}`)
  }
  if (result.status !== 0) {
    fail(`'opencode models ${provider} --verbose' terminó con status ${result.status}: ${(result.stderr || '').trim()}`)
  }
  return String(result.stdout || '')
}

function parseProvider(provider, raw) {
  const header = new RegExp(`^${provider}/\\S+$`)
  const entries = []
  let current = null
  let buffer = []
  const flush = () => {
    if (!current) return
    let meta = null
    try {
      meta = JSON.parse(buffer.join('\n'))
    } catch {
      meta = null
    }
    entries.push({
      id: current,
      cost: meta?.cost
        ? { input: meta.cost.input ?? null, output: meta.cost.output ?? null }
        : null,
      limit: meta?.limit
        ? { context: meta.limit.context ?? null, output: meta.limit.output ?? null }
        : null
    })
  }
  for (const line of raw.split(/\r?\n/)) {
    if (header.test(line.trim())) {
      flush()
      current = line.trim()
      buffer = []
    } else if (current) {
      buffer.push(line)
    }
  }
  flush()
  const seen = new Set()
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false
    seen.add(entry.id)
    return true
  })
}

function fail(message) {
  console.error(`ancleto: refresh-model-catalog: ${message}`)
  process.exit(1)
}

const current = readCurrent()
const providers = Object.keys(current.providers || {})
if (providers.length === 0) fail('el snapshot actual no declara proveedores')

const nextProviders = {}
for (const provider of providers) {
  const entries = parseProvider(provider, runProvider(provider))
  if (entries.length === 0) fail(`no se parseó ningún ID para el proveedor '${provider}'`)
  nextProviders[provider] = entries
}

const snapshot = {
  generated_at: new Date().toISOString().slice(0, 10),
  source: { method: current.source?.method || METHOD, providers },
  providers: nextProviders
}
writeFileSync(CATALOG, JSON.stringify(snapshot, null, 2) + '\n')
console.log(`ancleto: catálogo refrescado (${Object.values(nextProviders).flat().length} modelos) en ${CATALOG}`)
