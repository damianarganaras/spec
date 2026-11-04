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
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  diffCatalogSnapshots,
  discoveryStatus,
  freeModelViolations,
  isSafeProviderName,
  missingModelIdsInCatalog,
  parseVerboseProviderOutput,
  providersFromFlatOutput,
  validateCatalogSnapshot
} from '../src/core/model-catalog.js'
import { declaredModelIds } from '../src/core/tier-models.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG = join(ROOT, 'src', 'core', 'model-catalog.json')
const CANDIDATE = join(ROOT, '.ancleto', 'model-catalog.candidate.json')
const METHOD = 'opencode models <provider> --verbose --refresh'
const OFFLINE_MARKER = 'Failed to fetch models.dev'
const MODEL_LINE = /^model:\s*(.+)$/m

export function readCurrent(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    console.log(`  catálogo ilegible en ${path}: el diff usa un baseline vacío (no es un snapshot autoritativo)`)
    return { providers: {} }
  }
}

// Declaraciones de las fuentes versionadas bajo `rootDir`: `agents/*.md` y
// `profiles/*/agents/*.md`. Sólo lectura local; el cálculo posterior es puro.
// Falla cerrado: si una fuente no se puede leer no hay conjunto declarado confiable y
// el gate `--write` quedaría ciego, así que aborta con un mensaje con contexto (nunca
// un stack crudo) en lugar de asumir cero declaraciones.
function readAgentModels(rootDir) {
  const declarations = []
  const collect = (dirRel) => {
    const dir = join(rootDir, dirRel)
    let files
    try {
      files = readdirSync(dir).filter((file) => file.endsWith('.md'))
    } catch (error) {
      throw new Error(`no se pudo leer ${dirRel} para el gate de IDs declarados: ${error.message}`)
    }
    for (const file of files) {
      const relPath = `${dirRel}/${file}`
      let content
      try {
        content = readFileSync(join(dir, file), 'utf8')
      } catch (error) {
        throw new Error(`no se pudo leer ${relPath} para el gate de IDs declarados: ${error.message}`)
      }
      const model = content.match(MODEL_LINE)?.[1]?.trim()
      if (model) declarations.push({ id: model, source: relPath })
    }
  }
  collect('agents')
  let profiles
  try {
    profiles = readdirSync(join(rootDir, 'profiles'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  } catch (error) {
    throw new Error(`no se pudo leer profiles para el gate de IDs declarados: ${error.message}`)
  }
  for (const profile of profiles) collect(`profiles/${profile}/agents`)
  return declarations
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

export function looksBinaryMissing(result) {
  if (result.error?.code === 'ENOENT') return true
  // Una corrida exitosa nunca es `binary-missing`, aunque `stderr` tenga ruido.
  const failed = Boolean(result.error) || result.status !== 0
  if (!failed) return false
  if (providersFromFlatOutput(result.stdout).length > 0) return false
  // Sólo mensajes de comando/binario ausente. Un `not found` suelto (p. ej. "provider
  // not found") es un error de la app, no un binario faltante.
  return /command not found|: not found|is not recognized|is not recognized as|no se reconoce|no se reconoce como|n'est pas reconnu|nicht erkannt|não é reconhecido/i
    .test(String(result.stderr || ''))
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

export async function main(argv = process.argv.slice(2), options = {}) {
  const run = options.run ?? runOpencode
  const catalogPath = options.catalogPath ?? CATALOG
  const candidatePath = options.candidatePath ?? CANDIDATE
  const rootDir = options.rootDir ?? ROOT
  const write = argv.includes('--write')
  const today = new Date().toISOString().slice(0, 10)
  const flat = run(['models', '--refresh'])
  const binaryMissing = looksBinaryMissing(flat)
  const enumerated = binaryMissing ? [] : providersFromFlatOutput(flat.stdout)
  const providers = enumerated.filter(isSafeProviderName)
  const rejectedProviders = enumerated.filter((provider) => !isSafeProviderName(provider))
  const failures = []
  let networkMarker = flat.offline

  if (!binaryMissing && flat.status !== 0) {
    failures.push({ provider: '(enumeración)', detail: statusLine(flat), stderr: flat.stderr })
  }
  for (const provider of rejectedProviders) {
    failures.push({ provider, detail: 'nombre de proveedor inseguro' })
  }

  const nextProviders = {}
  if (!binaryMissing) {
    for (const provider of providers) {
      const result = run(['models', provider, '--verbose', '--refresh'])
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
  if (rejectedProviders.length > 0) {
    console.log(`  rechazados: ${rejectedProviders.join(', ')}`)
  }
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

  // Gate previo a toda escritura: un ID declarado que no sobrevive en el candidato
  // deja intactos tanto el reporte como el snapshot commiteado. La derivación de las
  // fuentes vive acá adentro: el dry-run nunca depende de que `agents/`/`profiles/` sean
  // legibles. Falla cerrado si no se pueden leer: sin ese conjunto el gate quedaría ciego.
  if (write) {
    let declaredIds
    try {
      declaredIds = options.declaredIds ?? declaredModelIds({ agentModels: readAgentModels(rootDir) })
    } catch (error) {
      console.error(`ancleto: refresh-model-catalog: ${error.message}`)
      return 1
    }
    const missing = missingModelIdsInCatalog(candidate, declaredIds)
    if (missing.length > 0) {
      console.log('  IDs declarados ausentes del snapshot candidato:')
      for (const item of missing) {
        console.log(`  - ${item.id} (${item.source || 'sin origen'})`)
      }
      console.log('  no se escribió el snapshot commiteado ni el candidato')
      return 1
    }
  }

  printDiff(readCurrent(catalogPath), candidate)

  mkdirSync(dirname(candidatePath), { recursive: true })
  writeJsonAtomic(candidatePath, candidate)
  console.log(`  candidato: ${candidatePath} (no se commitea)`)

  if (write) {
    writeJsonAtomic(catalogPath, candidate)
    console.log(`  snapshot actualizado: ${catalogPath}`)
  } else {
    console.log('  dry-run: usá --write para reemplazar el snapshot commiteado')
  }
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main()
  } catch (error) {
    console.error(`ancleto: refresh-model-catalog: ${error.message}`)
    process.exitCode = 1
  }
}
