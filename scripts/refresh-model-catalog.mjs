#!/usr/bin/env node
/**
 * Refresca el snapshot de catálogo `src/core/model-catalog.json`.
 *
 * MANUAL, nunca en CI ni como parte de `install`/`update`/`init`/`import`/`check` ni
 * de la suite de tests. Ejecuta `opencode models --refresh` y
 * `opencode models <provider> --verbose --refresh` contra la máquina local.
 *
 * Uso:
 *   node scripts/refresh-model-catalog.mjs          # dry-run: reporte + candidato
 *   node scripts/refresh-model-catalog.mjs --write  # reemplaza el snapshot commiteado
 *
 * Clasificaciones: `available`, `binary-missing`, `network-unavailable`, `partial`.
 * El reporte candidato se escribe en `.ancleto/model-catalog.candidate.json` y NO se
 * commitea. Revisá el diff, validá y commiteá el snapshot sólo si la corrida fue
 * `available`.
 *
 * Si `opencode` no está disponible, la salida es offline o un proveedor falla, el
 * script termina con exit code no cero y NO escribe el snapshot commiteado.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  diffCatalogSnapshots,
  discoveryStatus,
  freeModelViolations,
  parseVerboseProviderOutput,
  providersFromFlatOutput,
  validateCatalogSnapshot
} from '../src/core/model-catalog.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG = join(ROOT, 'src', 'core', 'model-catalog.json')
const CANDIDATE = join(ROOT, '.ancleto', 'model-catalog.candidate.json')
const METHOD = 'opencode models <provider> --verbose --refresh'
const OFFLINE_MARKER = 'Failed to fetch models.dev'

function readCurrent() {
  try {
    return JSON.parse(readFileSync(CATALOG, 'utf8'))
  } catch {
    return { providers: {} }
  }
}

function runOpencode(args) {
  const result = spawnSync('opencode', args, {
    encoding: 'utf8',
    timeout: 120000,
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  const stdout = String(result.stdout || '')
  const stderr = String(result.stderr || '')
  return {
    status: result.status,
    error: result.error || null,
    stdout,
    stderr,
    offline: `${stdout}\n${stderr}`.includes(OFFLINE_MARKER)
  }
}

function looksBinaryMissing(result) {
  if (result.error) return true
  if (result.status === 0) return false
  return /(?:not recognized|not found|no se reconoce|ENOENT)/i.test(result.stderr)
}

function statusLine(result) {
  return result.error ? `error de spawn: ${result.error.message}` : `status ${result.status}`
}

export function writeJsonAtomic(path, value) {
  const dir = dirname(path)
  const tmp = join(dir, `.${basename(path)}.${process.pid}.${Date.now()}.tmp`)
  try {
    writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
    renameSync(tmp, path)
  } finally {
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {
      // La limpieza es best-effort: si falla, el destino original sigue intacto.
    }
  }
}

function countIds(snapshot) {
  return Object.values(snapshot.providers || {}).reduce(
    (total, entries) => total + (Array.isArray(entries) ? entries.length : 0),
    0
  )
}

function printDiff(current, candidate) {
  const diff = diffCatalogSnapshots(current, candidate)
  console.log(`  IDs: ${countIds(candidate)}`)
  for (const provider of diff.providersAdded) console.log(`  + proveedor ${provider}`)
  for (const provider of diff.providersRemoved) console.log(`  - proveedor ${provider}`)
  for (const { provider, id } of diff.idsAdded) console.log(`  + ${provider}: ${id}`)
  for (const { provider, id } of diff.idsRemoved) console.log(`  - ${provider}: ${id}`)
  for (const change of diff.changes) {
    console.log(`  ~ ${change.provider}: ${change.id} ${change.field}: ${change.before ?? 'null'} -> ${change.after ?? 'null'}`)
  }
  if (diff.providersAdded.length === 0 && diff.providersRemoved.length === 0
    && diff.idsAdded.length === 0 && diff.idsRemoved.length === 0 && diff.changes.length === 0) {
    console.log('  sin cambios respecto del snapshot vigente')
  }
}

export function main(argv = process.argv.slice(2)) {
  const today = new Date().toISOString().slice(0, 10)
  const flat = runOpencode(['models', '--refresh'])
  const binaryMissing = looksBinaryMissing(flat)
  const providers = binaryMissing ? [] : providersFromFlatOutput(flat.stdout)
  const failures = []
  let networkMarker = flat.offline

  if (!binaryMissing && flat.status !== 0) {
    failures.push({ provider: '(enumeración)', detail: statusLine(flat), stderr: flat.stderr })
  }

  const nextProviders = {}
  if (!binaryMissing) {
    for (const provider of providers) {
      const result = runOpencode(['models', provider, '--verbose', '--refresh'])
      networkMarker = networkMarker || result.offline
      const entries = parseVerboseProviderOutput(provider, result.stdout)
      if (result.error || result.status !== 0) {
        failures.push({ provider, detail: statusLine(result), stderr: result.stderr })
      }
      if (entries.length === 0) {
        failures.push({ provider, detail: 'sin entradas parseadas', stderr: result.stderr })
        continue
      }
      nextProviders[provider] = entries
    }
  }

  const status = discoveryStatus({
    binaryMissing,
    networkMarker,
    failedProviders: failures,
    providerCount: providers.length
  })

  console.log('ancleto: refresh-model-catalog')
  console.log(`  fecha: ${today}`)
  console.log(`  método: ${METHOD}`)
  console.log(`  proveedores: ${providers.length > 0 ? providers.join(', ') : '(ninguno)'}`)
  console.log(`  estado: ${status}`)

  if (status !== 'available') {
    for (const failure of failures) {
      console.log(`  fallo ${failure.provider}: ${failure.detail}`)
      if (failure.stderr?.trim()) console.log(`    stderr: ${failure.stderr.trim().split(/\r?\n/).slice(-3).join(' | ')}`)
    }
    if (networkMarker) console.log(`  marcador offline: ${OFFLINE_MARKER}`)
    console.log('  no se escribió el snapshot commiteado')
    return 1
  }

  const candidate = {
    generated_at: today,
    source: { method: METHOD, providers },
    providers: nextProviders
  }

  const validation = validateCatalogSnapshot(candidate)
  if (!validation.ok) {
    console.log('  snapshot candidato inválido:')
    for (const error of validation.errors) console.log(`  - ${error}`)
    console.log('  no se escribió el snapshot commiteado')
    return 1
  }

  const violations = freeModelViolations(candidate, ['opencode/big-pickle'])
  if (violations.length > 0) {
    console.log(`  modelo gratuito inválido: ${violations.join(', ')} debe tener cost.input y cost.output en 0`)
    console.log('  no se escribió el snapshot commiteado')
    return 1
  }

  printDiff(readCurrent(), candidate)

  mkdirSync(dirname(CANDIDATE), { recursive: true })
  writeJsonAtomic(CANDIDATE, candidate)
  console.log(`  candidato: ${CANDIDATE} (no se commitea)`)

  if (argv.includes('--write')) {
    writeJsonAtomic(CATALOG, candidate)
    console.log(`  snapshot actualizado: ${CATALOG}`)
  } else {
    console.log('  dry-run: usá --write para reemplazar el snapshot commiteado')
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main())
  } catch (error) {
    console.error(`ancleto: refresh-model-catalog: ${error.message}`)
    process.exit(1)
  }
}
