// Helpers puros del catálogo de modelos.
//
// Este módulo NO ejecuta procesos, NO hace red y NO escribe archivos: sólo parsea
// salidas ya capturadas y calcula sobre snapshots en memoria. El único punto que lanza
// procesos vive en `scripts/refresh-model-catalog.mjs`, y la tabla de tiers sigue
// teniendo un único dueño en `tier-models.js`.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sortedUnique(values) {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
}

function entriesById(entries) {
  const map = new Map()
  if (!Array.isArray(entries)) return map
  for (const entry of entries) {
    if (entry && typeof entry === 'object' && typeof entry.id === 'string' && !map.has(entry.id)) {
      map.set(entry.id, entry)
    }
  }
  return map
}

function providersOf(snapshot) {
  const providers = snapshot?.providers
  return providers && typeof providers === 'object' && !Array.isArray(providers) ? providers : {}
}

// Enumera proveedores desde la salida plana de `opencode models` (una línea
// `provider/model` por ID). Ignora líneas vacías o sin `/`, toma el primer segmento
// como proveedor, deduplica y devuelve una lista ordenada.
export function providersFromFlatOutput(raw) {
  const providers = []
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    const slash = trimmed.indexOf('/')
    if (slash <= 0) continue
    providers.push(trimmed.slice(0, slash))
  }
  return sortedUnique(providers)
}

// Valida un nombre de proveedor antes de pasarlo como argumento a un proceso.
// Sólo admite letras, dígitos, punto, guion y guion bajo, empezando por
// alfanumérico: descarta espacios, `/` y metacaracteres de shell.
const SAFE_PROVIDER_NAME = /^[a-z0-9][a-z0-9._-]*$/i

export function isSafeProviderName(name) {
  return typeof name === 'string' && SAFE_PROVIDER_NAME.test(name)
}

// Parsea la salida de `opencode models <provider> --verbose`: cada encabezado
// `^<provider>/\S+$` abre una entrada y el bloque JSON que le sigue aporta `cost` y
// `limit`. Emite `{ id, cost, limit }` con `null` cuando faltan datos y deduplica por
// `id` conservando la primera aparición.
export function parseVerboseProviderOutput(provider, raw) {
  const header = new RegExp(`^${escapeRegExp(String(provider))}/\\S+$`)
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

  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (header.test(trimmed)) {
      flush()
      current = trimmed
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

const COST_LIMIT_FIELDS = ['cost.input', 'cost.output', 'limit.context', 'limit.output']

function fieldValue(entry, field) {
  const [group, key] = field.split('.')
  return entry?.[group]?.[key] ?? null
}

// Diff determinista entre dos snapshots (o mapas proveedor->entradas). Reporta
// proveedores e IDs altos/bajos y cada cambio de `cost`/`limit` con su valor anterior
// y nuevo. Un snapshot igual a sí mismo produce un diff vacío.
export function diffCatalogSnapshots(current, next) {
  const curr = providersOf(current)
  const nxt = providersOf(next)
  const providersAdded = []
  const providersRemoved = []
  const idsAdded = []
  const idsRemoved = []
  const changes = []

  for (const provider of sortedUnique([...Object.keys(curr), ...Object.keys(nxt)])) {
    const inCurrent = Object.prototype.hasOwnProperty.call(curr, provider)
    const inNext = Object.prototype.hasOwnProperty.call(nxt, provider)
    if (!inCurrent) providersAdded.push(provider)
    if (!inNext) providersRemoved.push(provider)

    const currentEntries = entriesById(curr[provider])
    const nextEntries = entriesById(nxt[provider])
    for (const id of sortedUnique([...currentEntries.keys(), ...nextEntries.keys()])) {
      const before = currentEntries.get(id)
      const after = nextEntries.get(id)
      if (!before) {
        idsAdded.push({ provider, id })
        continue
      }
      if (!after) {
        idsRemoved.push({ provider, id })
        continue
      }
      for (const field of COST_LIMIT_FIELDS) {
        const previous = fieldValue(before, field)
        const value = fieldValue(after, field)
        if (previous !== value) changes.push({ provider, id, field, before: previous, after: value })
      }
    }
  }

  return { providersAdded, providersRemoved, idsAdded, idsRemoved, changes }
}

function isNumberOrNull(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

// Valida la forma del snapshot antes de escribirlo. Devuelve `{ ok, errors }`.
export function validateCatalogSnapshot(snapshot) {
  const errors = []
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return { ok: false, errors: ['el snapshot debe ser un objeto'] }
  }
  if (typeof snapshot.generated_at !== 'string' || !ISO_DATE.test(snapshot.generated_at)) {
    errors.push('generated_at debe ser una fecha YYYY-MM-DD')
  }
  if (!snapshot.source || typeof snapshot.source !== 'object' || Array.isArray(snapshot.source)) {
    errors.push('source debe ser un objeto')
  } else {
    if (typeof snapshot.source.method !== 'string' || snapshot.source.method.trim() === '') {
      errors.push('source.method debe ser un string no vacío')
    }
    if (!Array.isArray(snapshot.source.providers) || snapshot.source.providers.length === 0) {
      errors.push('source.providers debe ser un array no vacío')
    }
  }

  const providers = providersOf(snapshot)
  const providerKeys = Object.keys(providers)
  if (snapshot.providers === null || typeof snapshot.providers !== 'object' || Array.isArray(snapshot.providers)) {
    errors.push('providers debe ser un mapa proveedor->entradas')
  }

  if (Array.isArray(snapshot.source?.providers)) {
    const declared = sortedUnique(snapshot.source.providers.map((p) => String(p)))
    const actual = [...providerKeys].sort()
    if (declared.length !== actual.length || declared.some((p, i) => p !== actual[i])) {
      errors.push('source.providers no coincide con las claves de providers')
    }
  }

  const seenIds = new Set()
  for (const provider of providerKeys) {
    const entries = providers[provider]
    if (!Array.isArray(entries) || entries.length === 0) {
      errors.push(`providers.${provider} debe tener al menos una entrada`)
      continue
    }
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        errors.push(`providers.${provider} contiene una entrada inválida`)
        continue
      }
      if (typeof entry.id !== 'string' || !entry.id.startsWith(`${provider}/`)) {
        errors.push(`providers.${provider}: el id ${JSON.stringify(entry.id)} no tiene el prefijo ${provider}/`)
      } else if (seenIds.has(entry.id)) {
        errors.push(`el id ${entry.id} está duplicado`)
      } else {
        seenIds.add(entry.id)
      }
      if (entry.cost !== null && entry.cost !== undefined) {
        if (typeof entry.cost !== 'object' || Array.isArray(entry.cost)
          || !isNumberOrNull(entry.cost.input) || !isNumberOrNull(entry.cost.output)) {
          errors.push(`providers.${provider}: cost inválido en ${entry.id}`)
        }
      }
      if (entry.limit !== null && entry.limit !== undefined) {
        if (typeof entry.limit !== 'object' || Array.isArray(entry.limit)
          || !isNumberOrNull(entry.limit.context) || !isNumberOrNull(entry.limit.output)) {
          errors.push(`providers.${provider}: limit inválido en ${entry.id}`)
        }
      }
    }
  }

  return { ok: errors.length === 0, errors }
}

// Clasifica una corrida de descubrimiento. Precedencia:
// binary-missing > partial (proveedor fallido o ninguno enumerado) >
// network-unavailable (marcador offline) > available.
export function discoveryStatus({ binaryMissing, networkMarker, failedProviders, providerCount }) {
  const failed = Array.isArray(failedProviders) ? failedProviders.length : (failedProviders || 0)
  if (binaryMissing) return 'binary-missing'
  if (failed > 0 || !(providerCount > 0)) return 'partial'
  if (networkMarker) return 'network-unavailable'
  return 'available'
}

// IDs pedidos que no figuran en el snapshot o cuyo `cost.input`/`cost.output` no sea 0.
export function freeModelViolations(snapshot, ids) {
  const entries = new Map()
  for (const providerEntries of Object.values(providersOf(snapshot))) {
    for (const entry of entriesById(providerEntries).values()) {
      entries.set(entry.id, entry)
    }
  }
  return [...ids].filter((id) => {
    const entry = entries.get(id)
    return !entry || entry.cost?.input !== 0 || entry.cost?.output !== 0
  })
}

// Días transcurridos (UTC) entre `generated_at` y `now`. Un `generated_at` inválido
// devuelve `null`; no lanza.
export function catalogAgeDays(generatedAt, now = new Date()) {
  if (typeof generatedAt !== 'string' || !ISO_DATE.test(generatedAt)) return null
  const start = Date.parse(`${generatedAt}T00:00:00Z`)
  const end = now instanceof Date ? now.getTime() : Date.parse(now)
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.floor((end - start) / DAY_MS)
}

export function isCatalogStale(generatedAt, now = new Date(), maxDays = 90) {
  const age = catalogAgeDays(generatedAt, now)
  return age !== null && age > maxDays
}
